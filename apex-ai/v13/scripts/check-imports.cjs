#!/usr/bin/env node
/**
 * Résolveur d'imports statique — vérifie que chaque import relatif et chaque
 * import alias (@services @core @ui @features @workers @modules) pointe vers
 * un fichier réellement présent. Substitut de `tsc` pour valider un
 * refactoring de pur déplacement (aucune erreur de type possible — seules les
 * erreurs "module introuvable" peuvent apparaître, et c'est ce qu'on teste).
 *
 * Exit 1 si au moins un import casse.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'playwright-report']);
const ALIASES = {
  '@core/': 'core/', '@services/': 'services/', '@modules/': 'modules/',
  '@features/': 'features/', '@ui/': 'ui/', '@workers/': 'workers/',
};

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); }
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) files.push(p);
  }
})(ROOT);

function exists(base) {
  const cands = [];
  if (base.endsWith('.js')) cands.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  cands.push(base, base + '.ts', base + '.tsx', base + '.js', base + '.d.ts',
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'));
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return true; } catch { /* noop */ } }
  return false;
}

const IMPORT_RE = /\b(?:from|import)\s*\(?\s*(['"])([^'"\n]+)\1/g;
// new URL('../x', import.meta.url) — refs worker/asset, doivent aussi résoudre
const URL_RE = /\bnew\s+URL\(\s*(['"])([^'"\n]+)\1/g;
const broken = [];
let checked = 0;

for (const f of files) {
  // commentaires retirés : les exemples JSDoc (`* import … from '…'`) ne sont
  // pas de vrais imports et fausseraient le résultat.
  const src = fs.readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  let m;
  for (const RE of [IMPORT_RE, URL_RE]) {
    RE.lastIndex = 0;
    while ((m = RE.exec(src))) {
      checkSpec(f, m[2]);
    }
  }
}

function checkSpec(f, spec) {
  let abs = null;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    abs = path.resolve(path.dirname(f), spec);
  } else {
    for (const [a, dir] of Object.entries(ALIASES)) {
      if (spec.startsWith(a)) { abs = path.join(ROOT, dir, spec.slice(a.length)); break; }
    }
  }
  if (!abs) return; // package npm — hors scope
  checked++;
  if (!exists(abs)) broken.push({ file: path.relative(ROOT, f), spec });
}

// Faux positifs connus : specs apparaissant dans des littéraux de chaîne
// (doc du prompt système dans core/memory.ts), pas de vrais imports.
const KNOWN_FALSE_POSITIVES = new Set([
  'core/memory.ts::./whatsapp.js',
  'core/memory.ts::../../services/whatsapp.js',
  'core/memory.ts::@features/clients/index.js',
]);
const real = broken.filter((b) => !KNOWN_FALSE_POSITIVES.has(b.file + '::' + b.spec));

console.log('Imports internes vérifiés: ' + checked + ' dans ' + files.length + ' fichiers');
if (real.length) {
  console.error('\n❌ ' + real.length + ' import(s) cassé(s) :');
  for (const b of real) console.error('  ' + b.file + '  ->  ' + b.spec);
  process.exit(1);
}
console.log('✅ Tous les imports internes résolvent.'
  + (broken.length ? ' (' + broken.length + ' faux positifs connus ignorés)' : ''));
