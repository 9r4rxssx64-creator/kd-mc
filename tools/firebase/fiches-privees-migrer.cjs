#!/usr/bin/env node
/**
 * Fiches CMCteams : range les champs PERSONNELS dans /cmcteams_prive (lecture rôle admin seul).
 * Kevin 2026-09-27 : « Go » — chaque employé ne voit que sa fiche, l'admin voit tout.
 *
 * Lancé par le robot PRIVÉ .github/workflows/coffre-fiches-privees.yml (jamais au dépôt public :
 * il manipule de vraies données). Service account = contourne les règles, donc on vérifie tout
 * nous-mêmes, et les journaux ne montrent QUE des nombres, jamais une donnée.
 *
 * FICHES_ACTION=migrer (défaut) :
 *   1. attendre que les règles publiées contiennent /cmcteams_prive au rôle admin (le dépôt
 *      public les publie de son côté ; jusqu'à 20 min) — sinon on s'arrête SANS rien toucher ;
 *   2. recopier email/telephone/adresse/dateNaissance/usbm de chaque fiche dans le privé
 *      (sans écraser une fiche privée plus récente) ;
 *   3. RELIRE le privé et comparer champ par champ — un seul écart = arrêt, rien n'est retiré ;
 *   4. SEULEMENT alors poser /cmcteams/cmc_prive_actif = true (les téléphones à jour trient) ;
 *   5. retirer ces champs de /cmcteams/cmc_reg (écriture par chemins : le reste de la fiche ne
 *      bouge pas) et poser « anniv » (jj/mm) — jusqu'à 3 passes si un vieux téléphone republie ;
 *   6. prouver comme un visiteur : sans jeton et avec un jeton ANONYME (ce qu'a n'importe quel
 *      téléphone), /cmcteams_prive est refusé et cmc_reg ne contient plus aucun de ces champs.
 * FICHES_ACTION=annuler : remet les champs du privé dans cmc_reg, puis cmc_prive_actif = false.
 */
const fs = require('node:fs');
const path = require('node:path');
const { getAccessToken } = require('./sa-token.cjs');

const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const PRIV = ['email', 'telephone', 'adresse', 'dateNaissance', 'usbm'];
const ACTION = (process.env.FICHES_ACTION || 'migrer').toLowerCase();
const ATTENTE_MAX_MS = +(process.env.FICHES_ATTENTE_MS || 20 * 60 * 1000);

function pad(x) { x = String(+x); return x.length < 2 ? '0' + x : x; }
/* Même règle que tools/shared/fiche-privee.js (le test compare les deux). */
function anniv(d) {
  const s = String(d || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return pad(m[3]) + '/' + pad(m[2]);
  m = /^(\d{1,2})[/.-](\d{1,2})/.exec(s);
  return m ? pad(m[1]) + '/' + pad(m[2]) : '';
}
function partPrive(e) {
  if (!e || typeof e !== 'object') return null;
  const o = {}; let n = 0;
  for (const k of PRIV) if (e[k] != null && e[k] !== '') { o[k] = String(e[k]); n++; }
  return n ? o : null;
}
const idOk = (id) => /^[\w-]{2,40}$/.test(id);

/* PURE (testée) : ce qu'il faut écrire au privé, et le PATCH par chemins qui nettoie le public. */
function planFiche(P, id, e, exist) {
  const p = partPrive(e);
  if (!p) return;
  if (!idOk(id)) { P.idsRefuses++; return; }         // identifiant hors règle : on n'y touche pas
  P.fiches++;
  const maj = +e.updatedAt || +e.createdAt || Date.now();
  if (exist && (+exist.maj || 0) >= maj) P.dejaPlusRecent++;
  else P.aEcrire[id] = { ...p, maj };
  for (const k of PRIV) {
    if (e[k] != null) P.patchPublic[id + '/' + k] = null;
  }
  const a = anniv(e.dateNaissance);
  if (a) P.patchPublic[id + '/anniv'] = a;
}
function plan(reg, prive) {
  const P = { aEcrire: {}, patchPublic: {}, fiches: 0, dejaPlusRecent: 0, idsRefuses: 0 };
  for (const id of Object.keys(reg || {})) planFiche(P, id, reg[id], prive?.[id]);
  return P;
}
/* PURE (testée) : combien de fiches publiques contiennent encore un champ personnel. */
function restes(reg) {
  let n = 0;
  for (const id of Object.keys(reg || {})) if (idOk(id) && partPrive(reg[id])) n++;
  return n;
}

async function req(method, p, token, body) {
  const url = DB + p + '.json' + (token ? '?access_token=' + encodeURIComponent(token) : '');
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(method + ' ' + p + ' → HTTP ' + r.status + ' ' + txt.slice(0, 160));
  return txt ? JSON.parse(txt) : null;
}
function cleWeb() {
  if (process.env.FIREBASE_WEB_API_KEY) return process.env.FIREBASE_WEB_API_KEY.trim();
  try {   // la clé WEB publique de l'appli (servie à chaque visiteur) — lue dans index.html du coffre
    const s = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
    const m = /FB_WEB_APIKEY="([^"]+)"/.exec(s); return m ? m[1] : '';
  } catch (_) { return ''; }   // pas d'index.html (dépôt public) : la clé doit venir du secret
}
async function jetonAnonyme() {
  const k = cleWeb(); if (!k) return null;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(k),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
  const j = await r.json().catch(() => ({}));
  return j.idToken || null;
}
async function statutVisiteur(p, idToken) {
  const r = await fetch(DB + p + '.json' + (idToken ? '?auth=' + encodeURIComponent(idToken) : ''));
  let body = null;
  try { body = await r.json(); } catch (_) { body = null; }   // réponse non JSON (page d'erreur) : seul le statut compte
  return { status: r.status, body };
}

async function attendreRegles(token) {
  const fin = Date.now() + ATTENTE_MAX_MS;
  for (;;) {
    const cur = await req('GET', '/.settings/rules', token).catch((e) => ({ _err: e.message }));
    const r = cur?.rules?.cmcteams_prive;
    if (r && /auth\.token\.role === 'admin'/.test(String(r['.read'] || ''))) { console.log('✅ Règles en ligne : /cmcteams_prive se lit au rôle admin seulement'); return; }
    if (Date.now() > fin) throw new Error('Règles /cmcteams_prive toujours absentes en ligne après ' + Math.round(ATTENTE_MAX_MS / 60000) + ' min (le dépôt public les publie via firebase-rules-auto-apply.yml). RIEN n\'a été touché.');
    console.log('⏳ Règles /cmcteams_prive pas encore publiées — nouvelle lecture dans 30 s');
    await new Promise((res) => setTimeout(res, 30000));
  }
}

const nb = (o) => Object.keys(o).length;
const attendre = (ms) => new Promise((res) => setTimeout(res, ms));

/* 1-2. Recopier au privé ce qui n'y est pas (ou y est plus ancien). */
async function ranger(token) {
  const reg = (await req('GET', '/cmcteams/cmc_reg', token)) || {};
  const P = plan(reg, (await req('GET', '/cmcteams_prive', token)) || {});
  console.log('📋 Fiches avec des champs personnels : ' + P.fiches + ' · à ranger : ' + nb(P.aEcrire)
    + ' · déjà plus récentes au privé : ' + P.dejaPlusRecent + ' · identifiants hors format (laissés tels quels) : ' + P.idsRefuses);
  if (nb(P.aEcrire)) await req('PATCH', '/cmcteams_prive', token, P.aEcrire);
  return P;
}
/* 3. Relire le privé et comparer champ par champ AVANT de retirer quoi que ce soit du public. */
async function relire(token, P) {
  const prive = (await req('GET', '/cmcteams_prive', token)) || {};
  let ecarts = 0;
  for (const id of Object.keys(P.aEcrire)) {
    for (const k of PRIV) {
      const attendu = P.aEcrire[id][k];
      if (attendu !== undefined && attendu !== prive[id]?.[k]) ecarts++;
    }
  }
  if (ecarts) throw new Error('Relecture du privé : ' + ecarts + ' champ(s) différent(s) — ARRÊT, la copie publique n\'a PAS été touchée.');
  console.log('✅ Relecture du privé : ' + nb(P.aEcrire) + ' fiche(s) identiques champ par champ');
}
/* 4. Drapeau AVANT le nettoyage : les téléphones à jour cessent aussitôt de republier ces champs. */
async function poserDrapeau(token) {
  await req('PUT', '/cmcteams/cmc_prive_actif', token, true);
  console.log('✅ Drapeau /cmcteams/cmc_prive_actif = true — l\'appli range désormais les champs personnels au privé');
}
/* 5. Nettoyer la copie publique ; un vieux téléphone peut republier une fois → jusqu'à 3 passes
   (ce qu'il republie de plus récent est d'abord rangé au privé). */
async function nettoyer(token) {
  let reste = -1;
  for (let essai = 1; essai <= 3; essai++) {
    const regN = (await req('GET', '/cmcteams/cmc_reg', token)) || {};
    const PN = plan(regN, (await req('GET', '/cmcteams_prive', token)) || {});
    if (nb(PN.aEcrire)) await req('PATCH', '/cmcteams_prive', token, PN.aEcrire);
    if (nb(PN.patchPublic)) await req('PATCH', '/cmcteams/cmc_reg', token, PN.patchPublic);
    reste = restes((await req('GET', '/cmcteams/cmc_reg', token)) || {});
    console.log('🧹 Nettoyage ' + essai + '/3 : ' + reste + ' fiche(s) publique(s) avec un champ personnel (attendu 0)');
    if (!reste) return;
    await attendre(20000);
  }
  throw new Error('La copie publique contient encore ' + reste + ' fiche(s) avec des champs personnels après 3 nettoyages (un vieux téléphone republie) — relancer le robot ; le privé est complet et le drapeau reste posé.');
}
/* 6. Preuve comme un visiteur (sans jeton), puis comme un téléphone (jeton ANONYME). */
async function prouver() {
  const sans = await statutVisiteur('/cmcteams_prive', null);
  console.log('🔬 Visiteur sans jeton → /cmcteams_prive : HTTP ' + sans.status + ' (attendu 401)');
  if (sans.status === 200) throw new Error('DANGER : /cmcteams_prive lisible sans jeton');
  const anon = await jetonAnonyme();
  if (!anon) throw new Error('Jeton anonyme impossible (clé web introuvable ou refusée) : la preuve « comme un téléphone » n\'a pas pu être faite — relancer le robot.');
  const a1 = await statutVisiteur('/cmcteams_prive', anon);
  console.log('🔬 Téléphone anonyme → /cmcteams_prive : HTTP ' + a1.status + ' (attendu 401)');
  if (a1.status === 200) throw new Error('DANGER : /cmcteams_prive lisible avec un jeton anonyme');
  const a2 = await statutVisiteur('/cmcteams/cmc_reg', anon);
  const r3 = a2.status === 200 ? restes(a2.body || {}) : -1;
  console.log('🔬 Téléphone anonyme → cmc_reg : HTTP ' + a2.status + ', fiches avec champ personnel : ' + r3 + ' (attendu 0)');
  if (a2.status !== 200 || r3 !== 0) throw new Error('Vérif « comme un téléphone » KO sur cmc_reg (HTTP ' + a2.status + ', restes ' + r3 + ')');
  console.log('✅ Fiches personnelles : lisibles par l\'admin seul — prouvé comme un visiteur et comme un téléphone anonyme');
}

/* L'ORDRE est la sécurité : règles → recopie → relecture → drapeau → nettoyage → preuve. */
async function migrer() {
  const token = await getAccessToken();
  await attendreRegles(token);
  const P = await ranger(token);
  await relire(token, P);
  await poserDrapeau(token);
  await nettoyer(token);
  await prouver();
}

async function annuler() {
  const token = await getAccessToken();
  const prive = (await req('GET', '/cmcteams_prive', token)) || {};
  const patch = {};
  for (const id of Object.keys(prive)) {
    if (!idOk(id)) continue;
    const p = partPrive(prive[id]); if (!p) continue;
    for (const k of Object.keys(p)) patch[id + '/' + k] = p[k];
  }
  await req('PUT', '/cmcteams/cmc_prive_actif', token, false);   // d'abord : l'appli cesse de trier
  if (Object.keys(patch).length) await req('PATCH', '/cmcteams/cmc_reg', token, patch);
  console.log('⏪ Retour en arrière : ' + Object.keys(prive).length + ' fiche(s) privée(s) recopiées dans cmc_reg, drapeau = false (le privé est conservé)');
}

if (require.main === module) {
  (ACTION === 'annuler' ? annuler() : migrer()).catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
}
module.exports = { plan, restes, anniv, partPrive, PRIV };
