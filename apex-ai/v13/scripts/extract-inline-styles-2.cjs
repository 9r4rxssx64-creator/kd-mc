#!/usr/bin/env node
/**
 * Chantier 2 — tranche cascade-vérifiée (éléments à classe/tag/form).
 *
 * Extrait un style inline répété vers une classe `.ax-gs-*` UNIQUEMENT si,
 * pour l'élément considéré, AUCUNE propriété du style n'entre en conflit avec
 * une règle CSS « dangereuse » — c.-à-d. une déclaration NORMALE (non
 * !important) qui battrait la classe extraite dans la cascade :
 *   - règle dans tokens/base/components : spécificité >= 11
 *   - règle dans un fichier chargé APRÈS components : spécificité >= 10
 * (Les déclarations !important battent l'ancien inline ET la nouvelle classe
 *  de la même façon -> aucun changement -> jamais dangereuses.)
 *
 * Conservateur : ascendants et pseudo-classes supposés satisfaits (on suppose
 * que la règle PEUT s'appliquer). Pseudo-éléments (::before…) ignorés.
 *
 * Usage: node scripts/extract-inline-styles-2.cjs [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const CSS = path.join(ROOT, 'assets/css/components.css');

// Ordre de chargement (index.html). components = index 2.
const FILE_ORDER = ['tokens', 'base', 'components', 'animations', 'rescue',
  'financial-bilan', 'laurence', 'ux-premium'];
const COMPONENTS_IDX = 2;

// --- 1. Parser CSS : descend dans @media, ignore @keyframes/@font-face ------
function parseRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const prelude = css.slice(i, brace).trim();
    let depth = 1, j = brace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(brace + 1, j - 1);
    if (prelude.startsWith('@')) {
      const at = prelude.split(/\s/)[0].toLowerCase();
      if (at === '@media' || at === '@supports' || at === '@container' || at === '@layer') {
        rules.push(...parseRules(body));
      }
      // @keyframes / @font-face / @page : ignorés
    } else if (prelude) {
      rules.push({ selector: prelude, body });
    }
    i = j;
  }
  return rules;
}

function splitTop(str, sep) {
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Spécificité (a,b,c) d'un sélecteur simple (une part de liste)
function specificity(sel) {
  let a = (sel.match(/#[\w-]+/g) || []).length;
  let b = (sel.match(/\.[\w-]+/g) || []).length
        + (sel.match(/\[[^\]]+\]/g) || []).length
        + (sel.match(/:(?!:)[\w-]+/g) || []).length;
  let c = (sel.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length
        + (sel.match(/::[\w-]+/g) || []).length;
  return a * 100 + b * 10 + c;
}

// Compound le plus à droite
function rightmostCompound(sel) {
  const tokens = splitTop(sel.replace(/\s*([>+~])\s*/g, ' $1 '), ' ')
    .map((t) => t.trim()).filter((t) => t && !'>+~'.includes(t));
  const last = tokens[tokens.length - 1] || '';
  return {
    tag: (last.match(/^[a-zA-Z][\w-]*/) || [''])[0].toLowerCase(),
    classes: (last.match(/\.[\w-]+/g) || []).map((s) => s.slice(1)),
    ids: (last.match(/#[\w-]+/g) || []).map((s) => s.slice(1)),
    pseudoElement: /::[\w-]+/.test(last),
  };
}

// Déclarations { prop: value } d'un body
function parseDecls(body) {
  return splitTop(body, ';').map((d) => {
    const c = d.indexOf(':');
    if (c < 0) return null;
    return {
      prop: d.slice(0, c).trim().toLowerCase(),
      important: /!important/i.test(d.slice(c + 1)),
    };
  }).filter((d) => d && d.prop && !d.prop.startsWith('--'));
}

// --- 2. Charger toutes les règles dangereuses ------------------------------
const dangerRules = []; // {threshold, spec, rm, props:Set}
for (let fi = 0; fi < FILE_ORDER.length; fi++) {
  const fp = path.join(ROOT, 'assets/css', FILE_ORDER[fi] + '.css');
  if (!fs.existsSync(fp)) continue;
  const css = fs.readFileSync(fp, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const threshold = fi <= COMPONENTS_IDX ? 11 : 10;
  for (const rule of parseRules(css)) {
    const decls = parseDecls(rule.body);
    const normalProps = new Set(decls.filter((d) => !d.important).map((d) => d.prop));
    if (!normalProps.size) continue;
    for (const part of splitTop(rule.selector, ',')) {
      const sel = part.trim();
      if (!sel) continue;
      const spec = specificity(sel);
      if (spec < threshold) continue;
      const rm = rightmostCompound(sel);
      if (rm.pseudoElement) continue; // cible une pseudo-box, pas l'élément
      dangerRules.push({ spec, rm, props: normalProps });
    }
  }
}
console.log('Règles CSS dangereuses indexées: ' + dangerRules.length);

// dangerProps pour un élément (tag, classes[], id)
function dangerPropsFor(tag, classes, id) {
  const out = new Set();
  for (const r of dangerRules) {
    if (r.rm.tag && r.rm.tag !== tag) continue;
    if (r.rm.classes.some((c) => !classes.includes(c))) continue;
    if (r.rm.ids.some((x) => x !== id)) continue;
    for (const p of r.props) out.add(p);
  }
  return out;
}

// --- 3. Scanner les features ----------------------------------------------
const featFiles = [];
(function w(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) w(p);
    else if (e.name.endsWith('.ts')) featFiles.push(p);
  }
})(path.join(ROOT, 'features'));

const TAG_RE = /<([a-zA-Z][\w]*)\b([^>]*?)\sstyle="([^"$]*)"([^>]*?)>/g;
const styleProps = (st) => splitTop(st, ';').map((d) => {
  const c = d.indexOf(':'); return c < 0 ? null : d.slice(0, c).trim().toLowerCase();
}).filter(Boolean);
const isPosFixed = (st) => /position\s*:\s*(fixed|absolute)/.test(st);

// Compter les occurrences de chaque style (toutes, pour le critère "répété")
const totalCount = new Map();
for (const f of featFiles) {
  const s = fs.readFileSync(f, 'utf8');
  let m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s))) {
    if (isPosFixed(m[3])) continue;
    totalCount.set(m[3], (totalCount.get(m[3]) || 0) + 1);
  }
}

// Numérotation : reprendre après le max ax-gs-N existant
const existingCss = fs.readFileSync(CSS, 'utf8');
let nextN = Math.max(0, ...[...existingCss.matchAll(/\.ax-gs-(\d+)\s*\{/g)].map((x) => +x[1])) + 1;
const classOf = new Map();   // style -> classe
const classStyle = new Map(); // classe -> style

let replaced = 0, touched = 0, skippedRisky = 0;
for (const f of featFiles) {
  const src = fs.readFileSync(f, 'utf8');
  let dirty = false;
  const out = src.replace(TAG_RE, (full, tag, a1, st, a2) => {
    if (isPosFixed(st)) return full;
    if ((totalCount.get(st) || 0) < 2) return full;        // pas répété
    const attrs = a1 + ' ' + a2;
    // class= dynamique (interpolation) -> on ne sait pas les classes -> skip
    const clsM = attrs.match(/\sclass="([^"]*)"/);
    if (/\sclass=\{|\sclass=`|\sclass='/.test(attrs)) { skippedRisky++; return full; }
    if (clsM && clsM[1].includes('$')) { skippedRisky++; return full; }
    const classes = clsM ? clsM[1].split(/\s+/).filter(Boolean) : [];
    const idM = attrs.match(/\sid="([^"$]*)"/);
    const id = idM ? idM[1] : null;
    const danger = dangerPropsFor(tag.toLowerCase(), classes, id);
    if (styleProps(st).some((p) => danger.has(p))) { skippedRisky++; return full; }
    let cls = classOf.get(st);
    if (!cls) { cls = 'ax-gs-' + (nextN++); classOf.set(st, cls); classStyle.set(cls, st); }
    dirty = true; replaced++;
    if (clsM) {
      // fusion dans le class= existant (a1/a2 ne contiennent pas style=)
      const newAttrs = (a1 + a2).replace(/\sclass="([^"]*)"/, ' class="$1 ' + cls + '"');
      return '<' + tag + newAttrs + '>';
    }
    return '<' + tag + (a1 || '') + ' class="' + cls + '"' + (a2 || '') + '>';
  });
  if (dirty) { if (!DRY) fs.writeFileSync(f, out); touched++; }
}

console.log('Extractibles (sans conflit cascade) : ' + replaced + ' occ, '
  + classOf.size + ' classes, dans ' + touched + ' fichiers');
console.log('Ignorés (conflit cascade prouvé)    : ' + skippedRisky + ' occ');

if (DRY) { console.log('(dry-run)'); process.exit(0); }
if (!classOf.size) { console.log('Rien à extraire.'); process.exit(0); }

const MARK = '/* === ax-gs-2 : tranche cascade-vérifiée (chantier 2) === */';
let css = existingCss.trimEnd();
const rules = [...classStyle.entries()]
  .sort((a, b) => +a[0].slice(6) - +b[0].slice(6))
  .map(([c, st]) => '.' + c + ' { ' + st.replace(/;\s*$/, '') + '; }').join('\n');
css += '\n\n' + MARK + '\n'
  + '/* ' + classOf.size + ' classes — extraction prouvée sans conflit de cascade.\n'
  + '   Voir scripts/extract-inline-styles-2.cjs */\n' + rules + '\n';
fs.writeFileSync(CSS, css);
console.log('OK — ' + classOf.size + ' classes ajoutées à components.css');
