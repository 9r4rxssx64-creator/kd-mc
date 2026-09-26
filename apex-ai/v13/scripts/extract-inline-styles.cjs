#!/usr/bin/env node
/**
 * Chantier 2 (tranche sûre) — Extraction des styles inline répétés -> CSS.
 *
 * Périmètre PROUVÉ sans régression : uniquement les éléments <div>/<span>
 * dont `style` est le SEUL attribut (`<div style="...">`). Un tel élément
 * n'est ciblable que par `div`/`span`/`*` (spécificité <= 1) ; une classe
 * (spécificité 10) gagne donc toujours -> rendu identique, garanti.
 * Exclus : styles contenant position:fixed/absolute (sélecteurs CSS
 * [style*="position:..."] existants), styles avec interpolation ${...}.
 *
 * Seuls les styles répétés (>=2 occurrences) deviennent des classes.
 * Usage: node scripts/extract-inline-styles.cjs [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const CSS = path.join(ROOT, 'assets/css/components.css');
const TAG_RE = /<(div|span)\s+style="([^"$]*)"\s*>/g;
const isUnsafe = (s) => /position\s*:\s*(fixed|absolute)/.test(s);

// 1. Collecte des fichiers features
const featFiles = [];
(function w(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) w(p);
    else if (e.name.endsWith('.ts')) featFiles.push(p);
  }
})(path.join(ROOT, 'features'));

// 2. Comptage des styles
const count = new Map();
for (const f of featFiles) {
  const s = fs.readFileSync(f, 'utf8');
  let m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s))) {
    if (isUnsafe(m[2])) continue;
    count.set(m[2], (count.get(m[2]) || 0) + 1);
  }
}

// 3. Styles répétés -> attribution de classe
const repeated = [...count.entries()].filter(([, n]) => n >= 2)
  .sort((a, b) => b[1] - a[1]);
const classOf = new Map();
repeated.forEach(([style], i) => classOf.set(style, 'ax-gs-' + (i + 1)));
console.log('Styles répétés -> classes: ' + repeated.length
  + ' (couvrant ' + repeated.reduce((a, [, n]) => a + n, 0) + ' occurrences)');

if (DRY) { console.log('(dry-run)'); process.exit(0); }

// 4. Réécriture des fichiers features
let replaced = 0, touched = 0;
for (const f of featFiles) {
  const src = fs.readFileSync(f, 'utf8');
  let dirty = false;
  const out = src.replace(TAG_RE, (full, tag, style) => {
    if (isUnsafe(style) || !classOf.has(style)) return full;
    dirty = true; replaced++;
    return '<' + tag + ' class="' + classOf.get(style) + '">';
  });
  if (dirty) { fs.writeFileSync(f, out); touched++; }
}

// 5. Ajout du bloc CSS (généré, marqueurs idempotents)
const MARK_START = '/* === ax-gs : styles inline extraits (chantier 2, généré) === */';
const MARK_END = '/* === fin ax-gs === */';
let css = fs.readFileSync(CSS, 'utf8');
const oldBlock = new RegExp('\\n*' + MARK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  + '[\\s\\S]*?' + MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
css = css.replace(oldBlock, '').trimEnd();
const rules = repeated.map(([style], i) =>
  '.ax-gs-' + (i + 1) + ' { ' + style.replace(/;\s*$/, '') + '; }').join('\n');
css += '\n\n' + MARK_START + '\n'
  + '/* ' + repeated.length + ' classes — extraction prouvée sans régression\n'
  + '   (cibles <div|span> à attribut style unique). Voir scripts/extract-inline-styles.cjs */\n'
  + rules + '\n' + MARK_END + '\n';
fs.writeFileSync(CSS, css);

console.log('OK — ' + replaced + ' occurrences remplacées dans ' + touched + ' fichiers');
console.log('     ' + repeated.length + ' classes ajoutées à components.css');
