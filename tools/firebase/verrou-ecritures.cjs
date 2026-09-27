/* Verrou ÉCRITURES CMCteams (phase 2b, 27.09.2026) — la transformation des règles, seule copie.
   Utilisée par deploy-rules.cjs (publication) et par tests/verify-ecritures-cmc.mjs (qui l'exécute
   au lieu d'en recopier une imitation). PURE : ne touche ni au réseau ni au disque. */

/* L'expression du $key : un non-admin peut écrire toute clé SAUF celles qui commencent par un préfixe
   verrouillé (les clés par mois : cmc_ref_2026-9, cmc_structured_…). */
function keyWrite(prefixes) {
  return "auth != null && (auth.token.role === 'admin' || !$key.matches(/^(" + prefixes.join('|') + ")/))";
}

/* Clés que les employés et les visiteurs écrivent encore (inscription, journal, chat…) : jamais ici. */
const OUVERTES = ['cmc_e', 'cmc_reg', 'cmc_pw', 'cmc_chat', 'cmc_audit', 'cmc_presence', 'cmc_userlog', 'cmc_kevin_inbox', 'cmc_reg_alerts'];

/* Pose le verrou sur rules.cmcteams (déjà passé par le verrou config admin). Lève une erreur au
   moindre doute : mieux vaut ne rien publier qu'un verrou qui bloque Kevin ou un employé. */
function appliquer(rules, E) {
  if (!E || !Array.isArray(E._cles) || E._cles.length < 20 || !Array.isArray(E._prefixes) || !E._prefixes.length || !/role === 'admin'/.test(String(E.role_admin))) {
    throw new Error('_phase_cmc_ecritures invalide');
  }
  if (!E._prefixes.every((x) => /^cmc_[a-z_]+_$/.test(x))) throw new Error('préfixe hors format');
  if (E.key_write !== keyWrite(E._prefixes)) throw new Error('key_write ne correspond pas aux _prefixes');
  if (E._cles.some((k) => OUVERTES.includes(k) || !/^cmc_[a-z_]+$/.test(k))) throw new Error('une clé encore écrite par les employés (ou hors format) est dans _cles');
  const c = rules && rules.cmcteams;
  if (!c || c['.write'] != null || !c.$key || !c.$key['.write']) throw new Error('le verrou config admin (write descendu au $key) doit être posé avant');
  E._cles.forEach((k) => { c[k] = Object.assign({}, c[k], { '.write': E.role_admin }); });
  c.$key = Object.assign({}, c.$key, { '.write': E.key_write });
  // GARDE-FOUS : lecture inchangée ; les clés des employés restent écrivables ; secrets toujours fermés.
  if (c['.read'] !== 'auth != null') throw new Error('/cmcteams .read doit rester "auth != null"');
  if (!c.cmc_admin_pin || c.cmc_admin_pin['.write'] !== false || !c.cmc_ia_key || c.cmc_ia_key['.write'] !== false) throw new Error('cmc_admin_pin/cmc_ia_key doivent rester .write:false');
  ['cmc_e', 'cmc_pw'].forEach((k) => { if (!c[k] || c[k]['.write'] !== 'auth != null') throw new Error(k + ' doit rester écrivable par les employés (phase 2c pas faite)'); });
  return rules;
}

/* Lecture d'un état live : le verrou est-il posé ? (clé témoin : cmc_access) */
function estPose(rulesLive) {
  const c = rulesLive && rulesLive.cmcteams;
  return !!(c && c.cmc_access && /role/.test(String(c.cmc_access['.write'] || '')));
}

module.exports = { keyWrite, appliquer, estPose, OUVERTES };
