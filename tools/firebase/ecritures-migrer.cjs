#!/usr/bin/env node
/**
 * Écritures CMCteams (phase 2b) : le planning et les réglages ne s'écrivent plus qu'au rôle admin.
 * Kevin 2026-09-27 : « Go ».
 *
 * Lancé par le robot PRIVÉ .github/workflows/coffre-ecritures-cmc.yml. Compte de service = contourne
 * les règles, donc on prouve tout nous-mêmes, comme un téléphone anonyme ET comme un admin.
 *
 * ECRITURES_ACTION=activer (défaut) :
 *   1. attendre le verrou config admin en ligne (write descendu au $key), l'appli CMCteams v9.954 (phase 2c) et
 *      la page light v1.59 en ligne — sinon ARRÊT, rien touché ;
 *   2. poser /cmcteams/cmc_ecritures_actif = true (les téléphones à jour cessent d'envoyer ces clés,
 *      l'admin les envoie avec son jeton role:admin) ;
 *   3. laisser 150 s aux téléphones ouverts pour relire le drapeau (ils le relisent toutes les 2 min).
 *   Le robot publie ENSUITE le verrou (deploy-rules.cjs, ECRITURES_LOCK=on).
 * ECRITURES_ACTION=prouver (après le verrou) :
 *   - un téléphone anonyme ne peut plus écrire le planning, les droits, la liste des chefs, une clé
 *     « cmc_ref_… » ; il peut TOUJOURS écrire une clé qui reste aux employés, et LIRE le planning ;
 *   - un jeton role:admin passe partout où l'anonyme est refusé.
 *   Chaque sonde écrite est effacée au compte de service, même en cas d'échec.
 * ECRITURES_ACTION=annuler : drapeau = false (le robot a publié ECRITURES_LOCK=off avant).
 */
const { getAccessToken } = require('./sa-token.cjs');
const { req, jetonAnonyme, jetonRole, commeVisiteur, attendre } = require('./rtdb-outils.cjs');

const ACTION = (process.env.ECRITURES_ACTION || 'activer').toLowerCase();
const ATTENTE_MAX_MS = +(process.env.ECRITURES_ATTENTE_MS || 15 * 60 * 1000);   // < timeout-minutes du robot (20) : c'est le script qui conclut « RIEN n'a été touché », pas GitHub
const PAUSE_DRAPEAU_MS = +(process.env.ECRITURES_PAUSE_MS || 150 * 1000);
const APP_SW = process.env.CMC_APP_SW || 'https://cmcteams.kd-mc.com/sw.js';
const LIGHT_VER = process.env.CMC_LIGHT_VER || 'https://departs.kd-mc.com/version.txt';
const APP_MIN = 9954, LIGHT_MIN = 1059;   // 8.10.2026 : v9.954 garde cmc_e / cmc_known_identities sur le téléphone non-admin (phase 2c)

/* Lecture d'une page du domaine COMME UNE SONDE : depuis la porte générale (3.10.2026, « aucune consultation sans
   compte »), le routeur répond 401 à qui n'a ni compte ni en-tête `x-kdmc-sonde` venu d'un centre de données
   (GitHub Actions). Sans cet en-tête, le robot a attendu 20 min « Page light pas encore prêt » le 8.10.2026 alors
   que v1.80 était en ligne. On dit aussi CE QU'ON A LU quand ce n'est pas prêt (cause exacte, jamais un ⏳ muet). */
async function enLigne(url) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'x-kdmc-sonde': 'coffre-ecritures-cmc', 'cache-control': 'no-store' } });
  return { status: r.status, texte: await r.text() };
}
function pasPret(nom, r) { console.log('   ↳ ' + nom + ' : HTTP ' + r.status + ' · ' + JSON.stringify(String(r.texte || '').slice(0, 60))); return false; }

/* PURE (testée) : « const CACHE='cmcteams-v9.926' » → 9926. */
function versionSw(txt) { const m = /cmcteams-v(\d+)\.(\d+)/.exec(String(txt || '')); return m ? (+m[1]) * 1000 + (+m[2]) : 0; }
/* PURE (testée) : « v1.59 » → 1059. */
function versionLight(txt) { const m = /^\s*v(\d+)\.(\d+)\s*$/.exec(String(txt || '')); return m ? (+m[1]) * 1000 + (+m[2]) : 0; }
/* PURE (testée) : le verrou config admin est-il en ligne ? (sans lui, le verrou écritures n'a pas de sens) */
function adminLockLive(rules) {
  const c = rules && rules.cmcteams;
  return !!(c && c['.write'] == null && c.$key && c.$key['.write'] && c.cmc_motd && /role/.test(String(c.cmc_motd['.write'] || '')));
}

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

async function activer() {
  const token = await getAccessToken();
  await jusqua('Verrou config admin en ligne', async () => adminLockLive((await req('GET', '/.settings/rules', token) || {}).rules));
  console.log('✅ Verrou config admin en ligne (écriture descendue au $key)');
  await jusqua('Appli CMCteams v9.954', async () => { const r = await enLigne(APP_SW); return versionSw(r.texte) >= APP_MIN || pasPret('sw.js', r); });
  console.log('✅ Appli en ligne ≥ v9.954 (sait écrire avec le jeton admin, personnes comprises)');
  await jusqua('Page light v1.59', async () => { const r = await enLigne(LIGHT_VER); return versionLight(r.texte) >= LIGHT_MIN || pasPret('version.txt', r); });
  console.log('✅ Page light en ligne ≥ v1.59 (planning et chefs écrits avec le jeton admin)');
  await req('PUT', '/cmcteams/cmc_ecritures_actif', token, true);
  console.log('✅ Drapeau /cmcteams/cmc_ecritures_actif = true — pause ' + Math.round(PAUSE_DRAPEAU_MS / 1000) + ' s (les téléphones ouverts le relisent)');
  await attendre(PAUSE_DRAPEAU_MS);
}

async function prouver() {
  const token = await getAccessToken();
  const anon = await jetonAnonyme();
  if (!anon) throw new Error('Jeton anonyme impossible (clé web introuvable ou refusée) : la preuve « comme un téléphone » n\'a pas pu être faite.');
  const admin = await jetonRole({ role: 'admin' }, 'zz-robot-verrou-ecritures');
  if (!admin) throw new Error('Jeton role:admin impossible : la preuve « l\'admin passe » n\'a pas pu être faite.');
  const sondes = [];
  const ecrire = async (qui, jeton, chemin) => { sondes.push(chemin); return (await commeVisiteur('PUT', chemin, jeton, { sonde: qui, ts: Date.now() })).status; };
  let erreurs = [];
  try {
    // Un anonyme est refusé sur le planning, les équipes, les droits, la liste des chefs, une clé « cmc_ref_… ».
    // (Refusé = rien d'écrit. Si c'était accepté, la sonde est effacée juste après et le robot échoue.)
    const REFUS = ['/cmcteams/cmc_ov/zz_sonde_verrou', '/cmcteams/cmc_t/zz_sonde_verrou', '/cmcteams/cmc_access/zz_sonde_verrou',
      '/cmcteams/cmc_dep_chefs/zz_sonde_verrou', '/cmcteams/cmc_ref_zz_sonde_verrou', '/cmcteams/cmc_verrou_sonde',
      '/cmcteams/cmc_e/zz_sonde_verrou', '/cmcteams/cmc_known_identities/zz_sonde_verrou'];   // phase 2c : les personnes aussi (Kevin 8.10.2026)
    for (const p of REFUS) {
      const s = await ecrire('anonyme', anon, p);
      console.log('🔬 Téléphone anonyme écrit ' + p.replace('/cmcteams/', '') + ' : HTTP ' + s + ' (attendu 401)');
      if (s === 200) erreurs.push('ACCEPTÉ pour un anonyme : ' + p);
    }
    // L'admin passe — prouvé sur la clé-sonde verrouillée (jamais dans le vrai planning).
    const a = await ecrire('admin', admin, '/cmcteams/cmc_verrou_sonde');
    console.log('🔬 Jeton admin écrit cmc_verrou_sonde (clé verrouillée) : HTTP ' + a + ' (attendu 200)');
    if (a !== 200) erreurs.push('REFUSÉ pour l\'admin (HTTP ' + a + ') : l\'admin ne pourrait plus enregistrer le planning');
    const ouvert = await ecrire('anonyme', anon, '/cmcteams/cmc_zz_sonde_ouverte');
    console.log('🔬 Téléphone anonyme écrit une clé restée aux employés : HTTP ' + ouvert + ' (attendu 200)');
    if (ouvert !== 200) erreurs.push('Trop fermé : une clé des employés est refusée (HTTP ' + ouvert + ')');
    const lu = await commeVisiteur('GET', '/cmcteams/cmc_ov', anon);
    console.log('🔬 Téléphone anonyme lit le planning : HTTP ' + lu.status + ' (attendu 200 — la lecture ne change pas)');
    if (lu.status !== 200) erreurs.push('Le planning n\'est plus lisible (HTTP ' + lu.status + ')');
  } finally {
    for (const p of sondes) await req('DELETE', p, token).catch(() => null);
    console.log('🧹 ' + sondes.length + ' sonde(s) effacée(s) au compte de service');
  }
  if (erreurs.length) throw new Error(erreurs.join(' · '));
  console.log('✅ Planning, réglages et personnes : écrits par l\'admin seul, prouvé comme un téléphone anonyme et comme un admin ; le reste inchangé');
}

async function annuler() {
  const token = await getAccessToken();
  await req('PUT', '/cmcteams/cmc_ecritures_actif', token, false);
  console.log('⏪ Retour en arrière : drapeau = false (les téléphones renvoient comme avant ; verrou retiré par le robot)');
}

if (require.main === module) {
  const f = ACTION === 'annuler' ? annuler : ACTION === 'prouver' ? prouver : activer;
  f().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
}
module.exports = { versionSw, versionLight, adminLockLive };
