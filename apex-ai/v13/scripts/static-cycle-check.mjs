#!/usr/bin/env node
/**
 * APEX v13 — Static cycle detector
 *
 * Détecte uniquement les cycles statiques ES (TDZ-dangerous), ignore les
 * dynamic imports `await import()` qui sont des cycle-breakers volontaires.
 *
 * Madge par défaut compte les dynamic imports comme cycles → faux positifs.
 * Ce script complémente madge en mesurant la métrique architecturale réelle.
 *
 * Usage : node scripts/static-cycle-check.mjs [root]
 * Exit code 0 = aucun cycle statique, 1 sinon.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.argv[2] || resolve(fileURLToPath(import.meta.url), '../..');
const DIRS = ['services', 'core', 'ui', 'features', 'workers'];
const EXCLUDE = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'tests']);

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (_) {
    return files;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!EXCLUDE.has(e)) walk(p, files);
    } else if (/\.tsx?$/.test(e)) {
      files.push(p);
    }
  }
  return files;
}

const all = [];
for (const d of DIRS) walk(join(ROOT, d), all);

const graph = new Map();

for (const f of all) {
  const src = readFileSync(f, 'utf8');
  // Match only static imports at line start (multi-line aware via /m).
  const re = /^[ \t]*import[ \t]+(?:[^'";\n]+from[ \t]+)?['"]([^'"]+)['"]/gm;
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const resBase = resolve(dirname(f), spec.replace(/\.js$/, ''));
    let target = null;
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      try {
        const cand = resBase + ext;
        if (statSync(cand).isFile()) {
          target = cand;
          break;
        }
      } catch (_) {}
    }
    if (target) out.add(target);
  }
  graph.set(f, out);
}

/* Tarjan SCC */
let index = 0;
const stack = [];
const indices = new Map();
const lowlinks = new Map();
const onStack = new Set();
const sccs = [];

function strongconnect(v) {
  indices.set(v, index);
  lowlinks.set(v, index);
  index++;
  stack.push(v);
  onStack.add(v);
  for (const w of graph.get(v) || []) {
    if (!indices.has(w)) {
      strongconnect(w);
      lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
    } else if (onStack.has(w)) {
      lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
    }
  }
  if (lowlinks.get(v) === indices.get(v)) {
    const scc = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      scc.push(w);
    } while (w !== v);
    if (scc.length > 1) sccs.push(scc);
    else if ((graph.get(v) || new Set()).has(v)) sccs.push(scc);
  }
}

for (const v of graph.keys()) {
  if (!indices.has(v)) strongconnect(v);
}

console.log(`[static-cycle-check] scanned ${all.length} TS/TSX files (static imports only).`);
console.log(`[static-cycle-check] static cycles: ${sccs.length}`);
for (const [i, scc] of sccs.entries()) {
  console.log(`\n${i + 1}) [${scc.length} files]`);
  for (const f of scc) console.log('   - ' + relative(ROOT, f));
}

process.exit(sccs.length === 0 ? 0 : 1);
