#!/usr/bin/env node
/**
 * Publie les règles Firebase RTDB du projet cmcteams-c16ab via le SERVICE ACCOUNT
 * (secrets GitHub FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY). Zéro clic Kevin.
 *
 * Source de vérité = firebase-rules-apex.json (objet "rules"). Publie EXACTEMENT lui,
 * sauf si RULES_STATE=open → rollback : remet /cmcteams .read/.write = true.
 *
 * Étapes : (1) JWT RS256 signé SA → access_token Google ; (2) PUT /.settings/rules.json ;
 * (3) GET de vérif → confirme l'état de /cmcteams. Échoue fort + détaillé (règle CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');

const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const ROOT = path.resolve(__dirname, '..', '..');
const RULES_FILE = path.join(ROOT, 'firebase-rules-apex.json');
const STATE = (process.env.RULES_STATE || 'hardened').toLowerCase();
// Durcissement /apex + /coffre_vault (Kevin 2026-07-04 « Durci ») :
// 'hardened' (défaut) = auth != null (état du fichier) | 'open' = rollback lecture/écriture libres.
const APEX_STATE = (process.env.APEX_STATE || 'hardened').toLowerCase();
// Lockdown shops par rôle : 'on' applique les .write role:admin aux écritures admin
// (products/logos/selection) depuis le bloc _phase_shops_rolelock. 'off' = écriture
// anon+validation actuelle (n'affecte JAMAIS les commandes clients ni les lectures).
// 'keep' (défaut) = préserve l'état LIVE actuel du lock shops (lu avant publication)
// → re-déclencher ce workflow pour /cmcteams ou /apex ne change JAMAIS les shops par accident.
const SHOPS_LOCK = (process.env.SHOPS_LOCK || 'keep').toLowerCase();
// Verrou LECTURE des commandes clients (fuite orders/.read=true) : 'on' → seul le
// dashboard admin (id_token role:admin) lit ; 'off' → lecture publique (rollback) ;
// 'keep' (défaut) = préserve l'état LIVE (lu avant publication) → un run pour une
// autre raison ne (dé)verrouille JAMAIS la lecture des commandes par accident.
// L'ÉCRITURE des commandes (checkout client) reste anonyme dans TOUS les cas.
const ORDERS_READ = (process.env.ORDERS_READ || 'keep').toLowerCase();
// Verrou ÉCRITURE config admin /cmcteams (cmc_admin_cfg, cmc_motd) par rôle : 'on'
// restructure /cmcteams (write parent → $key, +.write aux enfants validate-only,
// role:admin sur cmc_admin_cfg/cmc_motd) ; 'off' = write parent auth!=null (rollback) ;
// 'keep' (défaut) = préserve l'état LIVE. LECTURE /cmcteams inchangée dans tous les cas.
const CMC_ADMIN_LOCK = (process.env.CMC_ADMIN_LOCK || 'keep').toLowerCase();
// Verrou SECRETS CMCteams (27.09.2026) : 'on' = /cmcteams/cmc_pw/<uid>/h et /cmcteams/cmc_verif_codes
// refusent toute écriture non nulle (les secrets vivent dans /cmcteams_secret, vérifiés par
// apex-auth-worker). Posé par le robot coffre-secrets-cmc APRÈS la migration. 'keep' (défaut) =
// état LIVE préservé ; 'off' = rollback (l'ancien emplacement réécrivable).
const SECRETS_LOCK = (process.env.SECRETS_LOCK || 'keep').toLowerCase();
// Verrou ÉCRITURES CMCteams (27.09.2026, phase 2b) : 'on' = le planning et les réglages
// (_phase_cmc_ecritures._cles + les clés commençant par _prefixes) ne s'écrivent plus qu'au rôle
// admin. Posé par le robot coffre-ecritures-cmc APRÈS l'appli v9.926 / light v1.59 en ligne.
// Exige CMC_ADMIN_LOCK=on. 'keep' (défaut) = état LIVE préservé ; 'off' = rollback.
const ECRITURES_LOCK = (process.env.ECRITURES_LOCK || 'keep').toLowerCase();

const { getAccessToken } = require('./sa-token.cjs');
const VERROU = require('./verrou-ecritures.cjs');

(async () => {
  const doc = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  const rules = doc.rules;
  if (!rules || !rules.cmcteams) throw new Error('firebase-rules-apex.json : objet rules.cmcteams introuvable');

  if (STATE === 'open') { // rollback
    rules.cmcteams['.read'] = true;
    rules.cmcteams['.write'] = true;
    console.log('⏪ ROLLBACK : /cmcteams .read/.write = true');
  } else {
    console.log('🔒 HARDEN : /cmcteams .read/.write = ' + JSON.stringify(rules.cmcteams['.read']));
  }
  const token = await getAccessToken();
  console.log('✅ access_token obtenu');

  // SHOPS_LOCK=keep → lire l'état LIVE et le préserver (anti-régression : un run
  // déclenché pour durcir /apex ne doit pas rouvrir un lock shops déjà actif).
  let shopsLock = SHOPS_LOCK;
  if (shopsLock === 'keep') {
    try {
      const cur = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token)).then(r => r.json());
      const w = cur && cur.rules && cur.rules.shops_admin_v1 && cur.rules.shops_admin_v1.products
        && cur.rules.shops_admin_v1.products.$shop && cur.rules.shops_admin_v1.products.$shop.$id
        && cur.rules.shops_admin_v1.products.$shop.$id['.write'];
      shopsLock = /role/.test(String(w || '')) ? 'on' : 'off';
      console.log('🔎 SHOPS_LOCK=keep → état live détecté : ' + shopsLock);
    } catch (e) {
      throw new Error('SHOPS_LOCK=keep : lecture des règles live impossible (' + e.message + '), abort (ne pas publier à l\'aveugle)');
    }
  }

  // Lockdown shops par rôle (custom-token) — applique les .write role:admin si lock actif.
  // N'altère QUE products/logos/selection ; orders + lectures intacts.
  if (shopsLock === 'on') {
    const lock = doc._phase_shops_rolelock && doc._phase_shops_rolelock.writes;
    if (!lock) throw new Error('SHOPS_LOCK=on mais bloc _phase_shops_rolelock.writes absent, abort');
    const setWrite = (dotPath, val) => {
      const parts = dotPath.split('/'); let node = rules;
      for (const p of parts) { if (!node[p]) node[p] = {}; node = node[p]; }
      node['.write'] = val;
    };
    Object.keys(lock).forEach((p) => setWrite(p, lock[p]));
    // garde-fou : ne JAMAIS verrouiller les commandes clients
    const ow = rules.shops_admin_v1.orders.$shop.$orderId['.write'];
    if (/role/.test(String(ow))) throw new Error('SECURITÉ : orders ne doit PAS exiger role:admin (clients), abort');
    console.log('🔒 SHOPS_LOCK=on : products/logos/selection .write = role:admin (orders inchangé)');
  } else {
    console.log('🛟 SHOPS_LOCK=off : écriture shops anon+validation (inchangé)');
  }

  // Verrou LECTURE des commandes clients (orders/.read). keep=préserver l'état live.
  let ordersRead = ORDERS_READ;
  if (ordersRead === 'keep') {
    try {
      const cur = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token)).then(r => r.json());
      const rr = cur && cur.rules && cur.rules.shops_admin_v1 && cur.rules.shops_admin_v1.orders
        && cur.rules.shops_admin_v1.orders['.read'];
      ordersRead = /role/.test(String(rr || '')) ? 'on' : 'off';
      console.log('🔎 ORDERS_READ=keep → état live détecté : ' + ordersRead);
    } catch (e) {
      throw new Error('ORDERS_READ=keep : lecture des règles live impossible (' + e.message + '), abort');
    }
  }
  if (ordersRead === 'on') {
    const expr = doc._phase_shops_rolelock && doc._phase_shops_rolelock.orders_read;
    if (!expr || !/role/.test(String(expr))) throw new Error('ORDERS_READ=on mais _phase_shops_rolelock.orders_read absent/invalide, abort');
    rules.shops_admin_v1.orders['.read'] = expr;
    console.log('🔒 ORDERS_READ=on : shops_admin_v1/orders .read = role:admin (dashboard seul)');
  } else {
    rules.shops_admin_v1.orders['.read'] = true;
    console.log('🛟 ORDERS_READ=off : lecture des commandes publique (rollback/inchangé)');
  }
  // GARDE-FOU ABSOLU : l'écriture des commandes (checkout client) ne DOIT JAMAIS exiger role:admin.
  if (/role/.test(String(rules.shops_admin_v1.orders.$shop.$orderId['.write']))) {
    throw new Error('SECURITÉ : orders/.write ne doit PAS exiger role:admin (clients bloqués), abort');
  }

  // Verrou ÉCRITURE config admin /cmcteams (cmc_admin_cfg, cmc_motd) par rôle.
  // Restructure suivant le patron /apex (write parent → $key + .write aux enfants).
  // Jamais quand STATE=open (rollback = tout ouvert, le lock n'a pas de sens).
  let cmcLock = CMC_ADMIN_LOCK;
  if (STATE === 'open') { cmcLock = 'off'; }
  else if (cmcLock === 'keep') {
    try {
      const cur = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token)).then(r => r.json());
      const c = cur && cur.rules && cur.rules.cmcteams;
      const parentW = c && c['.write'];
      const keyW = c && c.$key && c.$key['.write'];
      // 'on' = write descendu ($key a un .write) ET pas de write parent + cmc_motd verrouillé role
      cmcLock = (keyW && parentW == null && c.cmc_motd && /role/.test(String(c.cmc_motd['.write'] || ''))) ? 'on' : 'off';
      console.log('🔎 CMC_ADMIN_LOCK=keep → état live détecté : ' + cmcLock);
    } catch (e) {
      throw new Error('CMC_ADMIN_LOCK=keep : lecture des règles live impossible (' + e.message + '), abort');
    }
  }
  if (cmcLock === 'on') {
    const A = doc._phase_cmc_adminlock;
    if (!A || !/role/.test(String(A.role_admin)) || A.any_auth !== 'auth != null') throw new Error('CMC_ADMIN_LOCK=on mais _phase_cmc_adminlock invalide, abort');
    const c = rules.cmcteams;
    delete c['.write'];                                   // le write parent descend au $key (révocable plus bas)
    c.$key = Object.assign({}, c.$key, { '.write': A.any_auth });
    ['cmc_e', 'cmc_ov', 'cmc_pw'].forEach((k) => { c[k] = Object.assign({}, c[k]); c[k]['.write'] = A.any_auth; }); // enfants validate-only : garder writable pour tous
    c.cmc_motd = Object.assign({}, c.cmc_motd); c.cmc_motd['.write'] = A.role_admin;                                 // config admin → role:admin
    c.cmc_admin_cfg = Object.assign({}, c.cmc_admin_cfg, { '.write': A.role_admin });
    // GARDE-FOUS : (a) lecture inchangée ; (b) secrets restent .write:false ; (c) aucun enfant writable perdu.
    if (c['.read'] !== 'auth != null') throw new Error('SECURITÉ : /cmcteams .read doit rester "auth != null", abort');
    if (c.cmc_admin_pin['.write'] !== false || c.cmc_ia_key['.write'] !== false) throw new Error('SECURITÉ : cmc_admin_pin/cmc_ia_key doivent rester .write:false, abort');
    ['cmc_e', 'cmc_ov', 'cmc_pw', 'cmc_motd', 'cmc_admin_cfg'].forEach((k) => { if (c[k]['.write'] == null) throw new Error('SECURITÉ : ' + k + ' perd son .write (écritures cassées), abort'); });
    console.log('🔒 CMC_ADMIN_LOCK=on : cmc_admin_cfg + cmc_motd .write = role:admin ; cmc_e/cmc_ov/cmc_pw/$key .write = auth!=null (inchangé pour tous)');
  } else {
    console.log('🛟 CMC_ADMIN_LOCK=off : écriture /cmcteams = auth!=null au parent (inchangé)');
  }
  // Verrou ÉCRITURES (phase 2b) : planning + réglages au rôle admin. Jamais sans le verrou config
  // admin (sinon le .write parent « auth != null » accorderait tout, en RTDB il ne se retire pas plus bas).
  let ecrLock = ECRITURES_LOCK;
  const E = doc._phase_cmc_ecritures;
  if (STATE === 'open') ecrLock = 'off';
  else if (ecrLock === 'keep') {
    try {
      const cur = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token)).then(r => r.json());
      ecrLock = VERROU.estPose(cur && cur.rules) ? 'on' : 'off';
      console.log('🔎 ECRITURES_LOCK=keep → état live détecté : ' + ecrLock);
    } catch (e) {
      throw new Error('ECRITURES_LOCK=keep : lecture des règles live impossible (' + e.message + '), abort');
    }
  }
  if (ecrLock === 'on') {
    if (cmcLock !== 'on') throw new Error('ECRITURES_LOCK=on exige CMC_ADMIN_LOCK=on (write parent descendu), abort');
    try { VERROU.appliquer(rules, E); } catch (e) { throw new Error('ECRITURES_LOCK=on refusé : ' + e.message + ', abort'); }
    console.log('🔒 ECRITURES_LOCK=on : ' + E._cles.length + ' clés + ' + E._prefixes.length + ' préfixes (planning, équipes, réglages) = role:admin ; employés inchangés sur le reste');
  } else {
    console.log('🛟 ECRITURES_LOCK=off : planning et réglages écrivables par tout jeton (inchangé)');
  }
  // /apex + /coffre_vault : hardened (défaut, état du fichier = auth != null) ou rollback open
  if (APEX_STATE === 'open') {
    rules.apex['.read'] = true;
    rules.apex['.write'] = true; // rollback = sémantique pré-durcissement (write au niveau parent)
    rules.coffre_vault['.read'] = true;
    rules.coffre_vault['.write'] = true;
    console.log('⏪ ROLLBACK APEX : /apex + /coffre_vault .read/.write = true');
  } else {
    if (JSON.stringify(rules.apex['.read']) !== '"auth != null"') throw new Error('SECURITÉ : /apex .read attendu "auth != null" dans le fichier, abort');
    if (JSON.stringify(rules.coffre_vault['.read']) !== '"auth != null"') throw new Error('SECURITÉ : /coffre_vault .read attendu "auth != null" dans le fichier, abort');
    console.log('🔒 HARDEN : /apex + /coffre_vault .read/.write = auth != null');
  }
  // Secrets CMCteams (27.09.2026) : /cmcteams_secret illisible par TOUS (hash de mots de passe) ;
  // seuls les codes d'inscription se lisent au rôle admin. Jamais publié autrement, même en rollback.
  const cs = rules.cmcteams_secret;
  if (!cs || cs['.read'] !== false || !cs.pw || !cs.pw.$uid || cs.pw.$uid['.read'] != null || cs.pw['.read'] != null
      || !cs.codes || !/auth\.token\.role === 'admin'/.test(String(cs.codes['.read'] || ''))) {
    throw new Error('SECURITÉ : /cmcteams_secret doit rester illisible (codes : rôle admin seulement), abort');
  }
  let secretsLock = SECRETS_LOCK;
  if (STATE === 'open') secretsLock = 'off';
  else if (secretsLock === 'keep') {
    try {
      const cur = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token)).then(r => r.json());
      const c = cur && cur.rules && cur.rules.cmcteams;
      secretsLock = (c && c.cmc_verif_codes && c.cmc_verif_codes['.validate'] === 'false') ? 'on' : 'off';
      console.log('🔎 SECRETS_LOCK=keep → état live détecté : ' + secretsLock);
    } catch (e) {
      throw new Error('SECRETS_LOCK=keep : lecture des règles live impossible (' + e.message + '), abort');
    }
  }
  if (secretsLock === 'on') {
    const c = rules.cmcteams;
    c.cmc_pw = Object.assign({}, c.cmc_pw);
    c.cmc_pw.$uid = Object.assign({}, c.cmc_pw.$uid, { h: { '.validate': 'false' } });
    c.cmc_verif_codes = Object.assign({}, c.cmc_verif_codes, { '.validate': 'false' });
    console.log('🔒 SECRETS_LOCK=on : /cmcteams/cmc_pw/<uid>/h et /cmcteams/cmc_verif_codes refusent toute écriture');
  } else {
    console.log('🛟 SECRETS_LOCK=off : ancien emplacement des secrets réécrivable (avant migration / rollback)');
  }

  // Fiches privées CMCteams (27.09.2026) : /cmcteams_prive se lit au rôle admin SEULEMENT.
  // Garde-fou : jamais publié ouvert, même en rollback (rules_state=open ne concerne que /cmcteams).
  const cp = rules.cmcteams_prive;
  if (!cp || !/auth\.token\.role === 'admin'/.test(String(cp['.read'] || '')) || cp.$uid['.read'] == null
      || /true/.test(String(cp.$uid['.read']))) throw new Error('SECURITÉ : /cmcteams_prive doit se lire au rôle admin seulement, abort');
  // garde-fou : ne JAMAIS perdre le deny racine
  if (rules['.read'] !== false || rules['.write'] !== false) throw new Error('SECURITÉ : deny racine perdu, abort');

  const put = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules })
  });
  const putBody = await put.text();
  if (!put.ok) throw new Error('PUT rules KO : HTTP ' + put.status + ' — ' + putBody.slice(0, 300));
  console.log('✅ Règles publiées (HTTP ' + put.status + ')');

  // vérif
  const get = await fetch(DB + '/.settings/rules.json?access_token=' + encodeURIComponent(token));
  const live = await get.json().catch(() => null);
  const cr = live && live.rules && live.rules.cmcteams && live.rules.cmcteams['.read'];
  console.log('🔎 Vérif live : /cmcteams .read = ' + JSON.stringify(cr));
  const expect = STATE === 'open' ? true : 'auth != null';
  if (JSON.stringify(cr) !== JSON.stringify(expect)) throw new Error('Vérif KO : attendu ' + JSON.stringify(expect) + ', live ' + JSON.stringify(cr));
  const ar = live && live.rules && live.rules.apex && live.rules.apex['.read'];
  const vr = live && live.rules && live.rules.coffre_vault && live.rules.coffre_vault['.read'];
  console.log('🔎 Vérif live : /apex .read = ' + JSON.stringify(ar) + ' · /coffre_vault .read = ' + JSON.stringify(vr));
  const expectApex = APEX_STATE === 'open' ? true : 'auth != null';
  if (JSON.stringify(ar) !== JSON.stringify(expectApex)) throw new Error('Vérif KO /apex : attendu ' + JSON.stringify(expectApex) + ', live ' + JSON.stringify(ar));
  if (JSON.stringify(vr) !== JSON.stringify(expectApex)) throw new Error('Vérif KO /coffre_vault : attendu ' + JSON.stringify(expectApex) + ', live ' + JSON.stringify(vr));

  // Vérif COMPORTEMENTALE (lesson #95 : un état de règles ne prouve rien — tester
  // un vrai appel) : GET anonyme sur chaque path durci → 401 attendu quand hardened.
  async function anonProbe(path) {
    const r = await fetch(DB + path + '.json?shallow=true');
    return r.status;
  }
  const sApex = await anonProbe('/apex');
  const sCoffre = await anonProbe('/coffre_vault');
  const sCmc = await anonProbe('/cmcteams');
  console.log('🔬 Probe anonyme : /apex=' + sApex + ' /coffre_vault=' + sCoffre + ' /cmcteams=' + sCmc);
  if (APEX_STATE !== 'open') {
    if (sApex === 200) throw new Error('DANGER : /apex lisible SANS auth malgré hardened, abort');
    if (sCoffre === 200) throw new Error('DANGER : /coffre_vault lisible SANS auth malgré hardened, abort');
  }
  if (STATE !== 'open' && sCmc === 200) throw new Error('DANGER : /cmcteams lisible SANS auth malgré hardened, abort');
  console.log('✅ Vérif OK — /cmcteams ' + (STATE === 'open' ? 'ouvert' : 'fermé') + ' · /apex + /coffre_vault ' + (APEX_STATE === 'open' ? 'ouverts' : 'fermés (auth requise)'));

  // Vérif COMPORTEMENTALE des fiches privées : un visiteur ne doit JAMAIS pouvoir les lire.
  const sPrive = await anonProbe('/cmcteams_prive');
  console.log('🔬 Probe anonyme : /cmcteams_prive=' + sPrive + ' (attendu 401)');
  if (sPrive === 200) throw new Error('DANGER : /cmcteams_prive lisible SANS auth, abort');
  const lp = live?.rules?.cmcteams_prive;
  if (!lp || !/role/.test(String(lp['.read'] || ''))) throw new Error('Vérif KO : /cmcteams_prive absent ou lisible sans rôle admin en live, abort');
  console.log('🔒 Fiches privées /cmcteams_prive : lecture rôle admin seulement');

  // Vérif COMPORTEMENTALE des secrets : un visiteur ne doit JAMAIS lire /cmcteams_secret.
  const sSecret = await anonProbe('/cmcteams_secret');
  console.log('🔬 Probe anonyme : /cmcteams_secret=' + sSecret + ' (attendu 401)');
  if (sSecret === 200) throw new Error('DANGER : /cmcteams_secret lisible SANS auth, abort');
  const ls2 = live?.rules?.cmcteams_secret;
  if (!ls2 || ls2['.read'] !== false) throw new Error('Vérif KO : /cmcteams_secret absent ou lisible en live, abort');
  if (secretsLock === 'on') {
    const lcs = live?.rules?.cmcteams;
    if (!(lcs?.cmc_verif_codes?.['.validate'] === 'false' && lcs?.cmc_pw?.$uid?.h?.['.validate'] === 'false')) throw new Error('Vérif KO : verrou secrets absent en live, abort');
  }
  console.log('🔒 Secrets /cmcteams_secret : illisibles (codes : admin) · verrou ancien emplacement : ' + secretsLock);

  // Vérif COMPORTEMENTALE du verrou lecture commandes (lesson #95).
  const sOrders = await anonProbe('/shops_admin_v1/orders');
  console.log('🔬 Probe anonyme : /shops_admin_v1/orders=' + sOrders + ' (attendu ' + (ordersRead === 'on' ? '401 verrouillé' : '200 public') + ')');
  if (ordersRead === 'on' && sOrders === 200) throw new Error('DANGER : commandes lisibles SANS auth malgré ORDERS_READ=on, abort');
  if (ordersRead === 'off' && sOrders !== 200) throw new Error('Vérif KO : ORDERS_READ=off mais commandes non lisibles (HTTP ' + sOrders + '), abort');
  console.log('✅ Commandes clients : lecture ' + (ordersRead === 'on' ? 'VERROUILLÉE (dashboard admin seul)' : 'publique (inchangé)'));

  // Vérif STRUCTURELLE du verrou config admin (write authentifié non testable sans token).
  const lc = live && live.rules && live.rules.cmcteams;
  if (cmcLock === 'on') {
    const keyW = ecrLock === 'on' ? E.key_write : 'auth != null';
    const okLock = lc && lc['.write'] == null && lc.$key && lc.$key['.write'] === keyW
      && lc.cmc_motd && /role/.test(String(lc.cmc_motd['.write'] || '')) && lc.cmc_admin_cfg && /role/.test(String(lc.cmc_admin_cfg['.write'] || ''))
      && ['cmc_e', 'cmc_pw'].concat(ecrLock === 'on' ? [] : ['cmc_ov']).every((k) => lc[k] && lc[k]['.write'] === 'auth != null');
    if (!okLock) throw new Error('Vérif KO : structure verrou config admin incorrecte en live, abort');
    console.log('🔒 Config admin /cmcteams : cmc_admin_cfg + cmc_motd = role:admin (employés écrivent le reste, lecture inchangée)');
    if (ecrLock === 'on') {
      const manque = E._cles.filter((k) => !(lc[k] && /auth\.token\.role === 'admin'/.test(String(lc[k]['.write'] || ''))));
      if (manque.length) throw new Error('Vérif KO : verrou écritures absent en live sur ' + manque.join(', ') + ', abort');
      console.log('🔒 Écritures /cmcteams : planning + réglages (' + E._cles.length + ' clés + ' + E._prefixes.length + ' préfixes) = role:admin en live');
    }
  } else {
    console.log('🛟 Config admin /cmcteams : écriture parent auth!=null (inchangé)');
  }

  // PURGE credentials du cloud partagé (audit 2026-07-07) — SEULEMENT en hardened.
  // ax_admin_pin/ax_pin/ax_user/ax_uid/ax_admin_pass sont FB_LOCAL (règle #40/#41) :
  // ils ne doivent JAMAIS vivre dans la base partagée. Les règles bloquent déjà leur
  // ÉCRITURE (.write:false), mais /apex .read:"auth != null" est nécessaire au SSE
  // temps réel (/apex.json entier, firebase.ts:819) → on ne peut PAS révoquer la
  // lecture d'une clé sous un parent qui l'accorde (cascade RTDB). On ferme donc la
  // fuite À LA SOURCE : pas de donnée = rien à lire. DELETE service-account (bypass
  // règles), idempotent (404/absent = no-op). N'affecte PAS ax_pin_<uid> per-user.
  if (APEX_STATE !== 'open') {
    const CREDS = ['ax_admin_pin', 'ax_pin', 'ax_user', 'ax_uid', 'ax_admin_pass'];
    for (const k of CREDS) {
      try {
        const chk = await fetch(DB + '/apex/' + k + '.json?shallow=true&access_token=' + encodeURIComponent(token));
        const had = chk.ok && (await chk.json().catch(() => null)) !== null;
        const del = await fetch(DB + '/apex/' + k + '.json?access_token=' + encodeURIComponent(token), { method: 'DELETE' });
        console.log('🧹 purge /apex/' + k + ' : ' + (had ? 'PRÉSENT → supprimé' : 'absent (no-op)') + ' (HTTP ' + del.status + ')');
      } catch (e) {
        console.log('⚠ purge /apex/' + k + ' échouée (non-bloquant) : ' + e.message);
      }
    }
  }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
