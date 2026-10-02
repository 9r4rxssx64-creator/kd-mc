#!/usr/bin/env node
/* DÉPLACER LES FICHIERS DES DOCUMENTS HORS DE /cmcteams/cmc_docs — sans rien perdre (Kevin « Go Firebase », phase 2, 2.10.2026)
 *
 * Mesuré (run 36994458423) : cmc_docs = 4 photos privées, 1 912 Ko, téléchargées par chaque téléphone à chaque ouverture.
 * Depuis CMCteams v9.934 (tools/shared/docs-cmc.js), un document se lit à la demande dans /cmcteams_docs/<id> ; ce robot
 * y déplace les documents DÉJÀ en ligne. Pour chaque document qui porte encore son fichier (dataUrl, sans ext) :
 *   GET → PUT /cmcteams_docs/<id> {dataUrl, shared, maj} → RELECTURE et comparaison → seulement alors la fiche perd son
 *   dataUrl (ext:true). Une copie différente = le document garde son fichier dans cmc_docs, et on le dit.
 * cmc_docs n'est réécrit qu'UNE fois, à la fin, et seulement si au moins un document a été déplacé.
 * Avant d'écrire (MODE=appliquer) : les règles en ligne connaissent /cmcteams_docs, l'appli publiée est ≥ v9.934
 * (sinon un ancien téléphone ne saurait plus ouvrir un document) — sinon ARRÊT, rien touché.
 * MODE=simulation (défaut) : liste et poids, AUCUNE écriture.   MODE=simulation node tools/firebase/docs-migrer.cjs */
const { getAccessToken } = require('./sa-token.cjs');
const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const APP_SW = process.env.CMC_APP_SW || 'https://cmcteams.kd-mc.com/sw.js';
const VERSION_MIN = 9934;

const idOk = (id) => /^[A-Za-z0-9_\-]{2,60}$/.test(String(id || ''));
function versionSw(txt) { const m = /CACHE\s*=\s*'cmcteams-v(\d+)\.(\d+)'/.exec(txt || ''); return m ? (+m[1]) * 1000 + (+m[2]) : 0; }
function fiche(d) { const c = {}; for (const k of Object.keys(d)) if (k !== 'dataUrl') c[k] = d[k]; c.ext = true; return c; }
function aDeplacer(d) { return !!(d && typeof d === 'object' && typeof d.dataUrl === 'string' && d.dataUrl.length && !d.ext); }

async function migrer({ fetchFn = fetch, token, mode = 'simulation', maintenant = Date.now() }) {
  const q = (chemin) => DB + chemin + '.json?access_token=' + encodeURIComponent(token);
  const r0 = await fetchFn(q('/cmcteams/cmc_docs'));
  if (!r0.ok) throw new Error('cmc_docs illisible : HTTP ' + r0.status);
  const brut = await r0.json();
  const liste = Array.isArray(brut) ? brut.slice() : (brut && typeof brut === 'object' ? Object.values(brut) : []);
  const res = [];
  let deplaces = 0;
  for (let i = 0; i < liste.length; i++) {
    const d = liste[i];
    if (!aDeplacer(d)) { if (d && d.ext) res.push({ id: d.id, etat: 'déjà à la demande' }); continue; }
    const octets = Buffer.byteLength(d.dataUrl, 'utf8');
    if (!idOk(d.id)) { res.push({ id: String(d.id).slice(0, 24), octets, etat: 'identifiant hors format — gardé tel quel' }); continue; }
    if (mode !== 'appliquer') { res.push({ id: d.id, octets, etat: 'à déplacer (simulation)' }); continue; }
    const corps = { dataUrl: d.dataUrl, shared: d.shared === true, maj: maintenant };
    const w = await fetchFn(q('/cmcteams_docs/' + d.id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    if (!w.ok) { res.push({ id: d.id, octets, etat: 'copie refusée ' + w.status + ' — fichier gardé dans cmc_docs' }); continue; }
    const relu = await (await fetchFn(q('/cmcteams_docs/' + d.id))).json().catch(() => null);
    if (!relu || relu.dataUrl !== d.dataUrl) { res.push({ id: d.id, octets, etat: 'copie DIFFÉRENTE — fichier gardé dans cmc_docs' }); continue; }
    liste[i] = fiche(d); deplaces++;
    res.push({ id: d.id, octets, etat: 'déplacé (copie vérifiée, fiche sans fichier)' });
  }
  if (mode === 'appliquer' && deplaces) {
    const w = await fetchFn(q('/cmcteams/cmc_docs'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(liste) });
    if (!w.ok) throw new Error('réécriture de cmc_docs refusée : HTTP ' + w.status + ' (les copies restent dans /cmcteams_docs, rien n\'est perdu)');
  }
  return { res, deplaces, apres: Buffer.byteLength(JSON.stringify(liste), 'utf8'), avant: Buffer.byteLength(JSON.stringify(brut), 'utf8') };
}

async function prerequis(fetchFn, token) {
  const regles = await (await fetchFn(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token))).json().catch(() => null);
  if (!regles || !regles.rules || !regles.rules.cmcteams_docs) throw new Error('les règles en ligne ne connaissent pas /cmcteams_docs : publier les règles d\'abord (deploy-cmcteams-rules.yml)');
  const v = versionSw(await (await fetchFn(APP_SW, { cache: 'no-store' })).text());
  if (v < VERSION_MIN) throw new Error('appli en ligne v' + Math.floor(v / 1000) + '.' + (v % 1000) + ' < v9.934 : publier l\'appli d\'abord (un ancien téléphone ne saurait plus ouvrir un document)');
}

async function main() {
  const mode = (process.env.MODE || 'simulation').toLowerCase();
  const token = await getAccessToken();
  if (mode === 'appliquer') await prerequis(fetch, token);
  const { res, deplaces, avant, apres } = await migrer({ token, mode });
  const ko = (o) => (o / 1024).toFixed(1).replace('.', ',') + ' Ko';
  const lignes = [`mode=${mode} · ${res.length} documents · cmc_docs ${ko(avant)} → ${ko(apres)}${mode === 'appliquer' ? ` (${deplaces} déplacé(s))` : ' (simulation)'}`]
    .concat(res.map((r) => `${r.id}${r.octets != null ? ' ' + ko(r.octets) : ''} — ${r.etat}`));
  for (const l of lignes) console.log(l);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=Documents à la demande (' + mode + ')::' + lignes.join(' ⏎ '));
  if (res.some((r) => /DIFFÉRENTE|refusée/.test(r.etat))) process.exitCode = 1;
}
module.exports = { migrer, fiche, aDeplacer, versionSw, VERSION_MIN };
if (require.main === module) main().catch((e) => { console.error('❌ ' + e.message); if (process.env.GITHUB_ACTIONS) console.log('::error title=docs-migrer::' + e.message); process.exit(1); });
