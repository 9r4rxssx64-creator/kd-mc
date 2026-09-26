#!/usr/bin/env node
/**
 * Chantier 2 — tranche C : extraction des styles inline restants (ceux que
 * la tranche B a laissés à cause d'un conflit de cascade).
 *
 * Technique prouvée sans régression : la classe extraite est appliquée via un
 * sélecteur classe-répétée `.ax-gs-N.ax-gs-N…` dont la spécificité est
 * CALCULÉE par classe pour dépasser strictement toute règle CSS normale en
 * conflit pouvant cibler l'élément.
 *
 * Pourquoi c'est exact :
 *  - inline (spéc. 1000) battait toujours les règles NORMALES -> une classe de
 *    spécificité supérieure à toute règle normale concurrente reproduit ce
 *    comportement à l'identique.
 *  - les déclarations !important battent l'ancien inline ET la nouvelle classe
 *    de la même façon -> aucun changement.
 *  - sélecteur classe-répétée = position-indépendant : marche aussi pour les
 *    modales rendues hors #apex-root (document.body.appendChild).
 *
 * Usage: node scripts/extract-inline-styles-3.cjs [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const CSS = path.join(ROOT, 'assets/css/components.css');
const CSS_FILES = ['tokens', 'base', 'components', 'animations', 'rescue',
  'financial-bilan', 'laurence', 'ux-premium'];
const SPEC_CAP = 120; // si conflit in-root >= 120, on n'extrait pas (#apex-root .cls.cls = 120)

function parseRules(css) {
  const r = [];
  let i = 0;
  while (i < css.length) {
    const b = css.indexOf('{', i);
    if (b < 0) break;
    const pre = css.slice(i, b).trim();
    let d = 1, j = b + 1;
    while (j < css.length && d > 0) {
      if (css[j] === '{') d++; else if (css[j] === '}') d--;
      j++;
    }
    const body = css.slice(b + 1, j - 1);
    if (pre.startsWith('@')) {
      const at = pre.split(/\s/)[0].toLowerCase();
      if (['@media', '@supports', '@container', '@layer'].includes(at)) {
        r.push(...parseRules(body));
      }
    } else if (pre) r.push({ selector: pre, body });
    i = j;
  }
  return r;
}
function splitTop(s, sep) {
  const o = []; let d = 0, c = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') d++;
    else if (ch === ')' || ch === ']') d--;
    if (ch === sep && d === 0) { o.push(c); c = ''; } else c += ch;
  }
  o.push(c);
  return o;
}
function specificity(sel) {
  const a = (sel.match(/#[\w-]+/g) || []).length;
  const b = (sel.match(/\.[\w-]+/g) || []).length
          + (sel.match(/\[[^\]]+\]/g) || []).length
          + (sel.match(/:(?!:)[\w-]+/g) || []).length;
  const c = (sel.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length
          + (sel.match(/::[\w-]+/g) || []).length;
  return a * 100 + b * 10 + c;
}
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

// --- Index des règles (normales) avec spécificité --------------------------
const rules = []; // {spec, rm, props:Set, hasId}
for (const fn of CSS_FILES) {
  const fp = path.join(ROOT, 'assets/css', fn + '.css');
  if (!fs.existsSync(fp)) continue;
  const css = fs.readFileSync(fp, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of parseRules(css)) {
    const decls = parseDecls(rule.body);
    const normalProps = new Set(decls.filter((d) => !d.important).map((d) => d.prop));
    if (!normalProps.size) continue;
    for (const part of splitTop(rule.selector, ',')) {
      const sel = part.trim();
      if (!sel) continue;
      const rm = rightmostCompound(sel);
      if (rm.pseudoElement) continue;
      rules.push({ spec: specificity(sel), rm, props: normalProps, hasId: sel.includes('#') });
    }
  }
}
console.log('Règles CSS indexées: ' + rules.length);

// Spécificité max d'une règle NORMALE en conflit avec ces props sur cet élément.
// skipId=true : ignore les règles à #id (cas d'un élément porté hors #apex-root
// — modale sur document.body — qui n'est sous aucun id de l'app).
function maxConflictSpec(tag, classes, id, props, skipId) {
  let max = 0;
  for (const r of rules) {
    if (skipId && r.hasId) continue;
    if (r.rm.tag && r.rm.tag !== tag) continue;
    if (r.rm.classes.some((c) => !classes.includes(c))) continue;
    if (r.rm.ids.some((x) => x !== id)) continue;
    let hit = false;
    for (const p of props) if (r.props.has(p)) { hit = true; break; }
    if (hit && r.spec > max) max = r.spec;
  }
  return max;
}

// --- Scan features ---------------------------------------------------------
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

const totalCount = new Map();
for (const f of featFiles) {
  const s = fs.readFileSync(f, 'utf8');
  let m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s))) {
    if (isPosFixed(m[3])) continue;
    totalCount.set(m[3], (totalCount.get(m[3]) || 0) + 1);
  }
}

const existingCss = fs.readFileSync(CSS, 'utf8');
let nextN = Math.max(0, ...[...existingCss.matchAll(/\.ax-gs-(\d+)/g)].map((x) => +x[1])) + 1;
const classOf = new Map();
const classStyle = new Map();
const classReqA = new Map(); // spéc. max conflit (toutes règles) — cas in-root
const classReqB = new Map(); // spéc. max conflit hors #id — cas porté hors racine
let replaced = 0, touched = 0, skipped = 0;

for (const f of featFiles) {
  const src = fs.readFileSync(f, 'utf8');
  let dirty = false;
  const out = src.replace(TAG_RE, (full, tag, a1, st, a2) => {
    if (isPosFixed(st)) return full;
    if ((totalCount.get(st) || 0) < 2) return full;
    const attrs = a1 + ' ' + a2;
    if (/\sclass=\{|\sclass=`|\sclass='/.test(attrs)) { skipped++; return full; }
    const clsM = attrs.match(/\sclass="([^"]*)"/);
    if (clsM && clsM[1].includes('$')) { skipped++; return full; }
    const classes = clsM ? clsM[1].split(/\s+/).filter(Boolean) : [];
    const idM = attrs.match(/\sid="([^"$]*)"/);
    const id = idM ? idM[1] : null;
    const sp = styleProps(st);
    const tg = tag.toLowerCase();
    const reqA = maxConflictSpec(tg, classes, id, sp, false);
    const reqB = maxConflictSpec(tg, classes, id, sp, true);
    if (reqA >= SPEC_CAP) { skipped++; return full; } // sélecteur déraisonnable -> inline
    let cls = classOf.get(st);
    if (!cls) { cls = 'ax-gs-' + (nextN++); classOf.set(st, cls); classStyle.set(cls, st); }
    classReqA.set(cls, Math.max(classReqA.get(cls) || 0, reqA));
    classReqB.set(cls, Math.max(classReqB.get(cls) || 0, reqB));
    dirty = true; replaced++;
    if (clsM) {
      const newAttrs = (a1 + a2).replace(/\sclass="([^"]*)"/, ' class="$1 ' + cls + '"');
      return '<' + tag + newAttrs + '>';
    }
    return '<' + tag + (a1 || '') + ' class="' + cls + '"' + (a2 || '') + '>';
  });
  if (dirty) { if (!DRY) fs.writeFileSync(f, out); touched++; }
}

// repsB : nb de .cls pour dépasser strictement reqB (chaque .cls = +10)
const repsForB = (req) => Math.max(1, Math.floor(req / 10) + 1);
const repsHisto = {};
let maxA = 0;
for (const c of classOf.values()) {
  maxA = Math.max(maxA, classReqA.get(c) || 0);
  const r = repsForB(classReqB.get(c) || 0);
  repsHisto[r] = (repsHisto[r] || 0) + 1;
}
console.log('Extraits : ' + replaced + ' occ, ' + classOf.size + ' classes, '
  + touched + ' fichiers');
console.log('Laissés inline (conflit in-root >= ' + SPEC_CAP + ') : ' + skipped + ' occ');
console.log('reqA max (in-root) = ' + maxA + ' (doit être < 120)');
console.log('repsB (fallback hors-racine) histo : ' + JSON.stringify(repsHisto));

if (maxA >= 120) { console.error('ERREUR: reqA >= 120 — sélecteur part A insuffisant.'); process.exit(1); }
if (DRY) { console.log('(dry-run)'); process.exit(0); }
if (!classOf.size) { console.log('Rien à extraire.'); process.exit(0); }

// Sélecteur double : "#apex-root .cls.cls" (spéc.120, in-root) + ".cls…" (hors racine)
const MARK = '/* === ax-gs-3 : tranche cascade (chantier 2, spécificité calculée) === */';
let css = existingCss.trimEnd();
const cssRules = [...classStyle.entries()]
  .sort((a, b) => +a[0].slice(6) - +b[0].slice(6))
  .map(([c, st]) => {
    const partA = '#apex-root .' + c + '.' + c;
    const partB = ('.' + c).repeat(repsForB(classReqB.get(c) || 0));
    return partA + ', ' + partB + ' { ' + st.replace(/;\s*$/, '') + '; }';
  })
  .join('\n');
css += '\n\n' + MARK + '\n'
  + '/* ' + classOf.size + ' classes. Sélecteur double :\n'
  + '   - "#apex-root .cls.cls" (spéc. 120) : élément dans la racine SPA\n'
  + '   - ".cls…" (spéc. calculée) : repli pour élément porté hors racine\n'
  + '     (modale document.body.appendChild) — dimensionné aux règles sans #id.\n'
  + '   Reproduit exactement la priorité de l\'ancien style inline.\n'
  + '   Voir scripts/extract-inline-styles-3.cjs */\n' + cssRules + '\n';
fs.writeFileSync(CSS, css);
console.log('OK — ' + classOf.size + ' classes ajoutées à components.css');
