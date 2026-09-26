#!/usr/bin/env node
/*
 * mem.cjs — Mémoire compacte à récupération (Claude Code + Apex).
 *
 * Principe (Kevin 2026-07-10 « augmente au max ta mémoire en consommant le minimum ») :
 * le magasin peut contenir des MILLIERS de faits/leçons/décisions, mais une requête ne
 * renvoie que les k lignes pertinentes → empreinte contexte minuscule. AUCUN appel IA,
 * AUCUNE clé, AUCUNE dépendance npm, AUCUN réseau → coût token/API = 0 pour l'utiliser.
 *
 * Recherche = BM25-lite (TF saturé + IDF), FR-aware (minuscules + accents retirés + stopwords).
 * Store = JSONL append-only : tools/memory/store.jsonl (1 fait par ligne, versionnable git).
 *
 * Commandes :
 *   node tools/memory/mem.cjs add "texte" [--tags a,b] [--imp 80] [--proj apex]
 *   node tools/memory/mem.cjs search "requête" [--k 5] [--tag x] [--json]
 *   node tools/memory/mem.cjs recent [n]
 *   node tools/memory/mem.cjs stats
 *   node tools/memory/mem.cjs export-apex   # JSON compact pour Apex (raw GitHub)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, 'store.jsonl');
const EXPORT = path.join(__dirname, 'apex-memory.json');

const STOP = new Set(('le la les un une des de du et ou a à au aux en dans par pour sur ce cette ' +
  'ces mon ma mes ton ta tes son sa ses que qui quoi dont où est sont être avoir fait il elle ' +
  'je tu on nous vous ils elles se sa ne pas plus tout tous the a an of to in is are and or for').split(/\s+/));

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function toks(s) {
  return norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !STOP.has(t));
}
function readStore() {
  if (!fs.existsSync(STORE)) return [];
  const all = fs.readFileSync(STORE, 'utf8').split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (_) { return null; }
  }).filter(Boolean);
  /* Un fait RETIRÉ (commande `retire`) reste dans le fichier (append-only, historique) mais
     ne sort plus jamais : ni dans search, ni dans brief, ni dans l'export Apex. Ajouté le
     26.09.2026 : la mémoire disait encore « publie via GitLab » et « le bot fusionne »,
     deux vérités mortes depuis des semaines, servies à chaque démarrage de session. */
  const retires = new Set(all.filter(e => e.retired).map(e => e.id));
  return all.filter(e => e.text && !retires.has(e.id));
}

function cmdRetire(args) {
  const id = args.find(a => !a.startsWith('--'));
  if (!id) { console.error('Usage: retire <id> --pourquoi "vérité remplacée par …"'); process.exit(1); }
  const cible = readStore().find(e => e.id === id);
  if (!cible) { console.error('Erreur exacte: aucun fait actif avec l\'id ' + id); process.exit(1); }
  const pourquoi = argVal(args, 'pourquoi', '');
  fs.appendFileSync(STORE, JSON.stringify({ id, retired: true, ts: Date.now(), pourquoi }) + '\n');
  console.log('✓ retiré', id, '·', cible.text.slice(0, 70) + (cible.text.length > 70 ? '…' : ''));
}
function argVal(args, name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

function cmdAdd(args) {
  const text = args.find(a => !a.startsWith('--'));
  if (!text) { console.error('Usage: add "texte" [--tags a,b] [--imp 80] [--proj apex]'); process.exit(1); }
  const tags = (argVal(args, 'tags', '') || '').split(',').map(t => t.trim()).filter(Boolean);
  const imp = Math.max(0, Math.min(100, parseInt(argVal(args, 'imp', '50'), 10) || 50));
  const proj = argVal(args, 'proj', 'multi');
  // ts passé en argument possible (déterminisme CI) sinon horodatage courant
  const ts = parseInt(argVal(args, 'ts', ''), 10) || Date.now();
  const all = readStore();
  const id = 'm' + (all.length + 1).toString(36) + '_' + ts.toString(36);
  // Anti-doublon : même texte normalisé déjà présent → skip
  const n = norm(text);
  if (all.some(e => norm(e.text) === n)) { console.log('(déjà présent, ignoré)'); return; }
  fs.appendFileSync(STORE, JSON.stringify({ id, ts, imp, proj, tags, text: String(text) }) + '\n');
  console.log('✓ mémorisé', id, '·', tags.join(',') || '(sans tag)');
}

function score(docToks, qToks, idf) {
  const tf = {};
  docToks.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  let s = 0;
  const seen = new Set();
  qToks.forEach(q => {
    if (seen.has(q)) return; seen.add(q);
    const f = tf[q] || 0;
    if (!f) return;
    const sat = (f * 2.2) / (f + 1.2); // saturation BM25-lite
    s += (idf[q] || 0) * sat;
  });
  return s;
}

function cmdSearch(args) {
  const q = args.find(a => !a.startsWith('--'));
  if (!q) { console.error('Usage: search "requête" [--k 5] [--tag x] [--json]'); process.exit(1); }
  const k = parseInt(argVal(args, 'k', '5'), 10) || 5;
  const tagFilter = argVal(args, 'tag', '');
  const asJson = args.includes('--json');
  let all = readStore();
  if (tagFilter) all = all.filter(e => (e.tags || []).includes(tagFilter));
  if (!all.length) { console.log(asJson ? '[]' : '(mémoire vide)'); return; }
  // IDF sur le corpus
  const df = {};
  const docsToks = all.map(e => {
    const dt = toks(e.text + ' ' + (e.tags || []).join(' '));
    new Set(dt).forEach(t => { df[t] = (df[t] || 0) + 1; });
    return dt;
  });
  const N = all.length;
  const idf = {};
  Object.keys(df).forEach(t => { idf[t] = Math.log(1 + N / df[t]); });
  const qToks = toks(q);
  const ranked = all.map((e, i) => {
    const m = score(docsToks[i], qToks, idf);
    // Biais importance UNIQUEMENT si au moins un terme matche (sinon le doc ne sort pas)
    const s = m > 0 ? m + (e.imp || 50) / 1000 : 0;
    return { e, s };
  }).filter(r => r.s > 0.001).sort((a, b) => b.s - a.s).slice(0, k);
  if (asJson) { console.log(JSON.stringify(ranked.map(r => r.e))); return; }
  if (!ranked.length) { console.log('(aucun souvenir pertinent)'); return; }
  ranked.forEach(r => {
    const t = (r.e.tags || []).join(',');
    console.log(`• [${r.s.toFixed(2)}] ${r.e.text}${t ? '  «' + t + '»' : ''}`);
  });
}

function cmdRecent(args) {
  const n = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 10;
  const all = readStore().slice(-n).reverse();
  if (!all.length) { console.log('(mémoire vide)'); return; }
  all.forEach(e => console.log(`• ${e.text}${(e.tags || []).length ? '  «' + e.tags.join(',') + '»' : ''}`));
}

function cmdBrief(args) {
  // Top-N faits par importance, compact — pour injection auto au démarrage de session.
  const n = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 12;
  const all = readStore().slice().sort((a, b) => (b.imp || 50) - (a.imp || 50)).slice(0, n);
  if (!all.length) { console.log('(mémoire vide)'); return; }
  all.forEach(e => console.log(`- ${e.text}`));
}

function cmdStats() {
  const all = readStore();
  const bytes = fs.existsSync(STORE) ? fs.statSync(STORE).size : 0;
  const tags = {};
  all.forEach(e => (e.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
  const top = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`${all.length} souvenirs · ${(bytes / 1024).toFixed(1)} Ko · tags: ` +
    (top.map(([t, c]) => `${t}(${c})`).join(' ') || '—'));
}

function cmdExportApex() {
  // Format compact pour Apex (fetch raw GitHub) : uniquement les champs utiles.
  const all = readStore().map(e => ({ t: e.text, g: e.tags || [], i: e.imp || 50 }));
  fs.writeFileSync(EXPORT, JSON.stringify(all));
  console.log('✓ export Apex', all.length, 'souvenirs →', path.basename(EXPORT), `(${(JSON.stringify(all).length / 1024).toFixed(1)} Ko)`);
}

const [, , cmd, ...args] = process.argv;
try {
  if (cmd === 'add') cmdAdd(args);
  else if (cmd === 'search') cmdSearch(args);
  else if (cmd === 'recent') cmdRecent(args);
  else if (cmd === 'brief') cmdBrief(args);
  else if (cmd === 'retire') cmdRetire(args);
  else if (cmd === 'stats') cmdStats();
  else if (cmd === 'export-apex') cmdExportApex();
  else {
    console.log('mem.cjs — mémoire compacte (0 clé, 0 réseau, 0 token).');
    console.log('  add "texte" [--tags a,b] [--imp 80] [--proj apex]');
    console.log('  search "requête" [--k 5] [--tag x] [--json]');
    console.log('  retire <id> --pourquoi "…"   (un fait périmé ne ressort plus jamais)');
    console.log('  recent [n] | stats | export-apex');
  }
} catch (e) {
  console.error('Erreur exacte:', e && e.message);
  process.exit(1);
}
