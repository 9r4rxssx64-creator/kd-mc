#!/usr/bin/env node
/**
 * Secrets CMCteams : mots de passe (hash) et codes d'inscription déménagent dans /cmcteams_secret,
 * illisible par tout téléphone ; apex-auth-worker les vérifie. Kevin 2026-09-27 : « Go tout auto ».
 *
 * Lancé par le robot PRIVÉ .github/workflows/coffre-secrets-cmc.yml (jamais au dépôt public : il
 * manipule de vrais hash). Compte de service = contourne les règles, donc on vérifie tout nous-mêmes ;
 * les journaux ne montrent QUE des nombres, jamais un hash ni un code.
 *
 * SECRETS_ACTION=migrer (défaut) :
 *   1. attendre les règles (/cmcteams_secret illisible), le serveur (apex-auth-worker /health annonce
 *      cmc_secret + cmc_code) et l'appli en ligne (cmcteams v9.924 ou plus) — sinon ARRÊT, rien touché ;
 *   2. recopier chaque hash de /cmcteams/cmc_pw et chaque code en attente dans le secret ;
 *   3. RELIRE le secret : un seul écart = arrêt, rien n'est retiré du public ;
 *   4. SEULEMENT alors poser /cmcteams/cmc_secret_actif = true ;
 *   5. retirer les hash de cmc_pw (repère « set » gardé) et supprimer cmc_verif_codes — 3 passes max.
 * SECRETS_ACTION=prouver (après le verrou des règles) : comme un visiteur et comme un téléphone
 *   anonyme, le secret est illisible, cmc_pw ne contient plus aucun hash, et l'ancien emplacement
 *   REFUSE qu'on y remette un hash ou un code.
 * SECRETS_ACTION=annuler : drapeau = false, puis les hash du secret recopiés dans cmc_pw.
 */
const { getAccessToken } = require('./sa-token.cjs');
const { req, jetonAnonyme, commeVisiteur, attendre } = require('./rtdb-outils.cjs');

const ACTION = (process.env.SECRETS_ACTION || 'migrer').toLowerCase();
const ATTENTE_MAX_MS = +(process.env.SECRETS_ATTENTE_MS || 25 * 60 * 1000);
const WORKER = process.env.CMC_AUTH_WORKER || 'https://apex-auth-worker.9r4rxssx64.workers.dev';
const APP_SW = process.env.CMC_APP_SW || 'https://cmcteams.kd-mc.com/sw.js';
const VERSION_MIN = 9924;

const idOk = (id) => /^[\w-]{2,40}$/.test(id);
const nb = (o) => Object.keys(o).length;
/* PURE (testée) : le hash d'une entrée cmc_pw (chaîne legacy ou { h }), sinon "". */
function hashDe(e) { return typeof e === 'string' ? e : (e && typeof e === 'object' && e.h) ? String(e.h) : ''; }

/* PURE (testée) : hash à ranger au secret + PATCH par chemins qui ne laisse qu'un repère public. */
function planPw(pub, sec) {
  const P = { aEcrire: {}, patchPublic: {}, comptes: 0, deja: 0, idsRefuses: 0 };
  for (const id of Object.keys(pub || {})) {
    const h = hashDe(pub[id]);
    if (!h) continue;
    if (!idOk(id)) { P.idsRefuses++; continue; }     // identifiant hors règle : on n'y touche pas
    P.comptes++;
    if (hashDe(sec?.[id]) === h) P.deja++;
    else {
      const e = pub[id], c = { h };
      if (e && typeof e === 'object') { if (e.setBy) c.setBy = String(e.setBy).slice(0, 40); if (+e.setAt) c.setAt = +e.setAt; }
      P.aEcrire[id] = c;
    }
    if (typeof pub[id] === 'string') P.patchPublic[id] = { set: true };
    else { P.patchPublic[id + '/h'] = null; P.patchPublic[id + '/set'] = true; }
  }
  return P;
}
/* PURE (testée) : codes encore valables, pas déjà au secret. */
function planCodes(pub, sec, maintenant) {
  const out = {};
  for (const id of Object.keys(pub || {})) {
    const c = pub[id];
    if (!idOk(id) || !c || c.used || !(+c.expiresAt > maintenant) || !/^\d{6}$/.test(String(c.code || '')) || sec?.[id]) continue;
    out[id] = { code: String(c.code), email: String(c.email || '').slice(0, 120), nom: String(c.nom || '').slice(0, 60), prenom: String(c.prenom || '').slice(0, 60),
      createdAt: +c.createdAt || maintenant, expiresAt: +c.expiresAt, used: false, essais: 0 };
  }
  return out;
}
/* PURE (testée) : combien d'entrées publiques portent encore un hash. */
function restes(pub) { let n = 0; for (const id of Object.keys(pub || {})) if (hashDe(pub[id])) n++; return n; }
/* PURE (testée) : « const CACHE='cmcteams-v9.924' » → 9924. */
function versionSw(txt) { const m = /cmcteams-v(\d+)\.(\d+)/.exec(String(txt || '')); return m ? (+m[1]) * 1000 + (+m[2]) : 0; }

async function jusqua(nom, test) {
  const fin = Date.now() + ATTENTE_MAX_MS;
  for (;;) {
    let r = false;
    try { r = await test(); } catch (_) { r = false; }   // réseau : on réessaie jusqu'à l'échéance
    if (r) return;
    if (Date.now() > fin) throw new Error(nom + ' : toujours pas prêt après ' + Math.round(ATTENTE_MAX_MS / 60000) + ' min. RIEN n\'a été touché.');
    console.log('⏳ ' + nom + ' pas encore prêt — nouvelle vérification dans 30 s');
    await attendre(30000);
  }
}
async function attendrePrerequis(token) {
  await jusqua('Règles /cmcteams_secret', async () => {
    const cur = await req('GET', '/.settings/rules', token);
    return cur?.rules?.cmcteams_secret && cur.rules.cmcteams_secret['.read'] === false;
  });
  console.log('✅ Règles en ligne : /cmcteams_secret illisible');
  await jusqua('Serveur de connexion (apex-auth-worker)', async () => {
    const d = await (await fetch(WORKER + '/health')).json();
    return Array.isArray(d.capacites) && d.capacites.includes('cmc_secret') && d.capacites.includes('cmc_code');
  });
  console.log('✅ Serveur de connexion prêt (lit le secret, gère les codes)');
  await jusqua('Appli CMCteams v9.924', async () => versionSw(await (await fetch(APP_SW, { cache: 'no-store' })).text()) >= VERSION_MIN);
  console.log('✅ Appli en ligne ≥ v9.924 (sait se connecter par le serveur)');
}

async function ranger(token) {
  const pub = (await req('GET', '/cmcteams/cmc_pw', token)) || {};
  const P = planPw(pub, (await req('GET', '/cmcteams_secret/pw', token)) || {});
  const codes = planCodes((await req('GET', '/cmcteams/cmc_verif_codes', token)) || {}, (await req('GET', '/cmcteams_secret/codes', token)) || {}, Date.now());
  console.log('📋 Comptes avec mot de passe : ' + P.comptes + ' · à ranger : ' + nb(P.aEcrire) + ' · déjà au secret : ' + P.deja
    + ' · identifiants hors format : ' + P.idsRefuses + ' · codes en attente à ranger : ' + nb(codes));
  if (nb(P.aEcrire)) await req('PATCH', '/cmcteams_secret/pw', token, P.aEcrire);
  if (nb(codes)) await req('PATCH', '/cmcteams_secret/codes', token, codes);
  return P;
}
async function relire(token) {
  const pub = (await req('GET', '/cmcteams/cmc_pw', token)) || {};
  const sec = (await req('GET', '/cmcteams_secret/pw', token)) || {};
  let ecarts = 0, n = 0;
  for (const id of Object.keys(pub)) { const h = hashDe(pub[id]); if (!h || !idOk(id)) continue; n++; if (hashDe(sec[id]) !== h) ecarts++; }
  if (ecarts) throw new Error('Relecture du secret : ' + ecarts + ' compte(s) différent(s) — ARRÊT, la copie publique n\'a PAS été touchée.');
  console.log('✅ Relecture du secret : ' + n + ' mot(s) de passe identiques');
}
async function poserDrapeau(token) {
  await req('PUT', '/cmcteams/cmc_secret_actif', token, true);
  console.log('✅ Drapeau /cmcteams/cmc_secret_actif = true — l\'appli vérifie désormais au serveur');
}
async function nettoyer(token) {
  let reste = -1;
  for (let essai = 1; essai <= 3; essai++) {
    const pub = (await req('GET', '/cmcteams/cmc_pw', token)) || {};
    const P = planPw(pub, (await req('GET', '/cmcteams_secret/pw', token)) || {});
    if (nb(P.aEcrire)) await req('PATCH', '/cmcteams_secret/pw', token, P.aEcrire);      // republié entre-temps : d'abord au secret
    const codes = planCodes((await req('GET', '/cmcteams/cmc_verif_codes', token)) || {}, (await req('GET', '/cmcteams_secret/codes', token)) || {}, Date.now());
    if (nb(codes)) await req('PATCH', '/cmcteams_secret/codes', token, codes);
    if (nb(P.patchPublic)) await req('PATCH', '/cmcteams/cmc_pw', token, P.patchPublic);
    await req('DELETE', '/cmcteams/cmc_verif_codes', token);
    reste = restes((await req('GET', '/cmcteams/cmc_pw', token)) || {});
    const codesPublics = await req('GET', '/cmcteams/cmc_verif_codes', token);
    console.log('🧹 Nettoyage ' + essai + '/3 : ' + reste + ' hash public(s), codes publics : ' + (codesPublics ? nb(codesPublics) : 0) + ' (attendu 0 et 0)');
    if (!reste && !codesPublics) return;
    await attendre(20000);
  }
  throw new Error('Il reste ' + reste + ' hash public(s) après 3 nettoyages (un vieux téléphone republie) — le verrou des règles va l\'empêcher ; relancer le robot.');
}

async function refusDoitTenir(nom, rep, token, chemin) {
  if (rep.status === 200) {
    await req('DELETE', chemin, token).catch(() => null);          // on retire la sonde avant d'alerter
    throw new Error('DANGER : ' + nom + ' ACCEPTÉ par un téléphone anonyme (verrou absent)');
  }
  console.log('🔬 ' + nom + ' : refusé (HTTP ' + rep.status + ')');
}
async function prouver() {
  const token = await getAccessToken();
  const sans = await commeVisiteur('GET', '/cmcteams_secret', null);
  console.log('🔬 Visiteur sans jeton → /cmcteams_secret : HTTP ' + sans.status + ' (attendu 401)');
  if (sans.status === 200) throw new Error('DANGER : /cmcteams_secret lisible sans jeton');
  const anon = await jetonAnonyme();
  if (!anon) throw new Error('Jeton anonyme impossible (clé web introuvable ou refusée) : la preuve « comme un téléphone » n\'a pas pu être faite.');
  for (const p of ['/cmcteams_secret', '/cmcteams_secret/pw', '/cmcteams_secret/codes']) {
    const r = await commeVisiteur('GET', p, anon);
    console.log('🔬 Téléphone anonyme → ' + p + ' : HTTP ' + r.status + ' (attendu 401)');
    if (r.status === 200) throw new Error('DANGER : ' + p + ' lisible avec un jeton anonyme');
  }
  const pw = await commeVisiteur('GET', '/cmcteams/cmc_pw', anon);
  const r1 = pw.status === 200 ? restes(pw.body || {}) : -1;
  console.log('🔬 Téléphone anonyme → cmc_pw : HTTP ' + pw.status + ', hash lisibles : ' + r1 + ' (attendu 0)');
  if (pw.status !== 200 || r1 !== 0) throw new Error('Vérif « comme un téléphone » KO sur cmc_pw (HTTP ' + pw.status + ', hash ' + r1 + ')');
  const vc = await commeVisiteur('GET', '/cmcteams/cmc_verif_codes', anon);
  console.log('🔬 Téléphone anonyme → cmc_verif_codes : ' + (vc.body ? nb(vc.body) : 0) + ' code(s) lisible(s) (attendu 0)');
  if (vc.body && nb(vc.body)) throw new Error('Des codes d\'inscription restent lisibles dans /cmcteams/cmc_verif_codes');
  await refusDoitTenir('Remettre un hash dans cmc_pw', await commeVisiteur('PUT', '/cmcteams/cmc_pw/zz_sonde_verrou', anon, { h: 's1:sonde' }), token, '/cmcteams/cmc_pw/zz_sonde_verrou');
  await refusDoitTenir('Remettre un code dans cmc_verif_codes', await commeVisiteur('PUT', '/cmcteams/cmc_verif_codes/zz_sonde_verrou', anon, { code: '000000' }), token, '/cmcteams/cmc_verif_codes/zz_sonde_verrou');
  await refusDoitTenir('Lire un hash au secret', await commeVisiteur('GET', '/cmcteams_secret/pw/U11804', anon), token, '/cmcteams_secret/pw/zz_rien');
  const w = await fetch(WORKER + '/login-cmc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'zz_sonde_inconnu', password: 'x' }) });
  console.log('🔬 Serveur → /login-cmc (compte inconnu) : HTTP ' + w.status + ' (attendu 404)');
  if (w.status !== 404) throw new Error('Le serveur de connexion ne répond pas comme attendu (HTTP ' + w.status + ')');
  console.log('✅ Mots de passe et codes : illisibles par tout téléphone, vérifiés par le serveur — prouvé comme un visiteur et comme un téléphone anonyme');
}

async function migrer() {
  const token = await getAccessToken();
  await attendrePrerequis(token);
  await ranger(token);
  await relire(token);
  await poserDrapeau(token);
  await nettoyer(token);
}
async function annuler() {
  const token = await getAccessToken();
  await req('PUT', '/cmcteams/cmc_secret_actif', token, false);   // d'abord : l'appli revient à l'ancien chemin
  const sec = (await req('GET', '/cmcteams_secret/pw', token)) || {};
  const patch = {};
  for (const id of Object.keys(sec)) { const h = hashDe(sec[id]); if (h && idOk(id)) patch[id + '/h'] = h; }
  if (nb(patch)) await req('PATCH', '/cmcteams/cmc_pw', token, patch);
  console.log('⏪ Retour en arrière : ' + nb(patch) + ' mot(s) de passe recopiés dans cmc_pw, drapeau = false (le secret est conservé)');
}

if (require.main === module) {
  const f = ACTION === 'annuler' ? annuler : ACTION === 'prouver' ? prouver : migrer;
  f().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
}
module.exports = { planPw, planCodes, restes, hashDe, versionSw };
