#!/usr/bin/env node
/**
 * agent-toolkit/sync.mjs — récupère les 6 dépôts du tableau « Une Notion = Un Projet »
 * (Kevin 2026-08-06) et vendorise UNIQUEMENT leur texte utile dans vendor/agent-toolkit/.
 *
 * Pourquoi un script plutôt qu'un `cp` dans le YAML : c'est testable, ça a un --dry-run,
 * des plafonds de taille, et ça écrit un MANIFEST.json (SHA + date + licence) pour qu'on
 * sache TOUJOURS d'où vient chaque fichier et à quelle version.
 *
 * L'agent Claude Code n'a pas d'accès réseau vers github.com (bac à sable) → ce script est
 * fait pour tourner sur le runner CI (réseau ouvert), cf. .github/workflows/agent-toolkit-sync.yml.
 *
 *   node tools/agent-toolkit/sync.mjs                 # tout, écrit vendor/agent-toolkit
 *   node tools/agent-toolkit/sync.mjs --dry-run       # n'écrit rien, dit ce qu'il ferait
 *   node tools/agent-toolkit/sync.mjs --only rtk      # une seule source
 *   node tools/agent-toolkit/sync.mjs --out /tmp/x    # ailleurs
 *   node tools/agent-toolkit/sync.mjs --help
 *
 * Règles : jamais de binaire, jamais de node_modules, plafond par fichier et par dépôt,
 * échec d'une source = on continue les autres (fail-open) et on le DIT dans le résumé.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** Glob minimal, sans dépendance : `**\/` = n'importe quel dossier, `*` = pas de `/`. */
export function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if ('.+^${}()|[]\\?'.indexOf(c) >= 0) {
      re += '\\' + c;
    } else re += c;
  }
  return new RegExp('^' + re + '$');
}
export const matches = (rel, globs) => (globs || []).some((g) => globToRe(g).test(rel));

/** Un fichier est-il du TEXTE qu'on accepte de vendoriser ? (jamais de binaire) */
export const isText = (p) =>
  /\.(md|markdown|json|txt|yml|yaml)$/i.test(p) || /^LICEN[CS]E/i.test(path.basename(p));

/** Liste récursive des fichiers, chemins relatifs en `/`, sans .git. */
export function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, acc);
    else if (e.isFile()) acc.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return acc;
}

/** Décide, pour un dépôt cloné dans `tmp`, la liste des fichiers à garder. */
export function selectFiles(tmp, src, cfg) {
  let bytes = 0;
  const kept = [];
  const skipped = [];
  for (const rel of walk(tmp).sort()) {
    if (matches(rel, src.exclude)) continue;
    if (!matches(rel, src.include)) continue;
    if (!isText(rel)) { skipped.push(rel + ' (binaire)'); continue; }
    const size = fs.statSync(path.join(tmp, rel)).size;
    if (size > cfg.maxFileBytes) { skipped.push(rel + ' (fichier trop gros)'); continue; }
    if (bytes + size > cfg.maxRepoBytes) { skipped.push(rel + ' (plafond dépôt atteint)'); continue; }
    bytes += size;
    kept.push(rel);
  }
  return { kept, skipped, bytes };
}

function syncOne(src, cfg, out, dry) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atk-' + src.id + '-'));
  const res = { id: src.id, notion: src.notion, repo: src.repo, usage: src.usage, licence: src.licence };
  try {
    execFileSync('git', ['clone', '--depth', '1', '--quiet', src.repo + '.git', tmp], { stdio: 'pipe' });
    res.sha = execFileSync('git', ['-C', tmp, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const { kept, skipped, bytes } = selectFiles(tmp, src, cfg);
    if (!dry) {
      const dest = path.join(out, src.id);
      fs.rmSync(dest, { recursive: true, force: true }); /* pas de fichier fantôme d'une version précédente */
      for (const rel of kept) {
        fs.mkdirSync(path.join(dest, path.dirname(rel)), { recursive: true });
        fs.copyFileSync(path.join(tmp, rel), path.join(dest, rel));
      }
    }
    res.files = kept.length;
    res.bytes = bytes;
    res.skipped = skipped.length;
    res.ok = kept.length > 0;
    if (!res.ok) res.error = 'aucun fichier retenu (motifs « include » à revoir ?)';
  } catch (e) {
    res.ok = false;
    res.error = String((e && e.message) || e).slice(0, 300);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return res;
}

function main(argv) {
  const has = (f) => argv.includes(f);
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (has('--help') || has('-h')) {
    console.log('node tools/agent-toolkit/sync.mjs [--dry-run] [--only <id>] [--out <dir>]');
    return 0;
  }
  const dry = has('--dry-run');
  const only = val('--only', '');
  const out = path.resolve(val('--out', path.join(ROOT, 'vendor', 'agent-toolkit')));
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));

  const list = cfg.sources.filter((s) => !only || s.id === only);
  if (!list.length) {
    console.error('Aucune source « ' + only + ' ». Ids : ' + cfg.sources.map((s) => s.id).join(', '));
    return 2;
  }
  if (!dry) fs.mkdirSync(out, { recursive: true });
  const results = list.map((s) => syncOne(s, cfg, out, dry));

  if (!dry) {
    fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify({
      generated_at: new Date().toISOString(),
      generated_by: 'tools/agent-toolkit/sync.mjs',
      origine: 'Tableau « Une Notion = Un Projet » (Kevin, 2026-08-06)',
      sources: results,
    }, null, 2) + '\n');
  }

  const ok = results.filter((r) => r.ok).length;
  console.log((dry ? '[à blanc] ' : '') + 'agent-toolkit — ' + ok + '/' + results.length + ' sources récupérées');
  for (const r of results) {
    console.log('  ' + (r.ok ? 'OK  ' : 'ÉCHEC ') + r.id.padEnd(24) + (r.ok
      ? String(r.files).padStart(4) + ' fichiers, ' + Math.round((r.bytes || 0) / 1024) + ' Ko  @' + String(r.sha).slice(0, 8)
      : r.error));
  }
  /* Fail-open : on ne casse le job que si TOUT a échoué (réseau mort), pas si une source bouge. */
  return ok === 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
