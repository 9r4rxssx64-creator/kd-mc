#!/usr/bin/env node
/* Prouve que le VRAI deploy-rules.cjs applique correctement le verrou lecture des
   commandes (ORDERS_READ on/off/keep) et n' verrouille JAMAIS l'écriture des
   commandes (checkout client). fetch + OAuth mockés, clé RSA générée à la volée. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const SCRIPT = path.join(__dirname, 'deploy-rules.cjs');
const FILE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firebase-rules-apex.json'), 'utf8'));
const ORDERS_ADMIN = FILE._phase_shops_rolelock.orders_read;

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log((c ? '✅' : '❌') + ' ' + m); };

function baseLive() {
  // état LIVE de départ : cmcteams/apex hardened (fichier), orders/.read public (la fuite).
  const r = JSON.parse(JSON.stringify(FILE.rules));
  r.shops_admin_v1.orders['.read'] = true;
  return r;
}

async function run(env) {
  const live = { rules: baseLive() };
  const captured = { put: null };
  const origFetch = global.fetch;
  const origExit = process.exit;
  let exitCode = 0;
  process.exit = (c) => { exitCode = c || 0; throw new Error('__exit__' + exitCode); };

  global.fetch = async (url, opts) => {
    const u = String(url), m = (opts && opts.method) || 'GET';
    if (u.startsWith('https://oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'AT', expires_in: 3600 }) };
    if (u.includes('/.settings/rules.json')) {
      if (m === 'PUT') { captured.put = JSON.parse(opts.body); live.rules = captured.put.rules; return { ok: true, status: 200, text: async () => 'ok' }; }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(live)) };
    }
    // sondes anonymes (.json?shallow, sans access_token) + purge credentials (avec access_token)
    if (u.includes('/apex/') && u.includes('access_token')) { // purge : chk GET / DELETE
      if (m === 'DELETE') return { ok: true, status: 200, text: async () => '' };
      return { ok: true, status: 200, json: async () => null };
    }
    const anon = !u.includes('access_token');
    if (anon && u.includes('/shops_admin_v1/orders.json')) {
      const rr = String(live.rules.shops_admin_v1.orders['.read'] || '');
      return { ok: !/role/.test(rr), status: /role/.test(rr) ? 401 : 200, json: async () => ({}) };
    }
    if (anon && (u.includes('/apex.json') || u.includes('/coffre_vault.json') || u.includes('/cmcteams.json'))) {
      return { ok: false, status: 401, json: async () => ({}) }; // hardened
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };

  Object.assign(process.env, { RULES_STATE: 'hardened', APEX_STATE: 'hardened', SHOPS_LOCK: 'keep', FIREBASE_CLIENT_EMAIL: 'sa@x.iam', FIREBASE_PRIVATE_KEY: privateKey }, env);
  delete require.cache[require.resolve(SCRIPT)];
  let err = null;
  try { require(SCRIPT); } catch (e) { err = e; }
  // laisser l'IIFE async se dérouler
  for (let i = 0; i < 200 && !captured.put; i++) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 30));

  global.fetch = origFetch; process.exit = origExit;
  return { put: captured.put, exitCode, thrown: err };
}

(async () => {
  // ORDERS_READ=on → orders/.read = role:admin ; écriture inchangée
  {
    const r = await run({ ORDERS_READ: 'on' });
    ok(r.put, 'on/ publication effectuée (PUT capturé)');
    const rd = r.put && r.put.rules.shops_admin_v1.orders['.read'];
    ok(rd === ORDERS_ADMIN, 'on/ orders/.read = role:admin (dashboard seul) : ' + JSON.stringify(rd));
    const wr = r.put && r.put.rules.shops_admin_v1.orders.$shop.$orderId['.write'];
    ok(wr && !/role/.test(String(wr)), 'on/ orders/.write reste ANONYME (checkout client jamais verrouillé)');
  }
  // ORDERS_READ=off → orders/.read = true (rollback)
  {
    const r = await run({ ORDERS_READ: 'off' });
    const rd = r.put && r.put.rules.shops_admin_v1.orders['.read'];
    ok(rd === true, 'off/ orders/.read = true (lecture publique, rollback)');
  }
  // ORDERS_READ=keep, live public → reste public (préserve)
  {
    const r = await run({ ORDERS_READ: 'keep' });
    const rd = r.put && r.put.rules.shops_admin_v1.orders['.read'];
    ok(rd === true, 'keep/ live public → reste public (aucun changement accidentel)');
  }
  // défaut (ORDERS_READ absent) = keep → live public → reste public
  {
    const r = await run({});
    const rd = r.put && r.put.rules.shops_admin_v1.orders['.read'];
    ok(rd === true, 'défaut (absent) = keep → reste public (0 régression au merge)');
  }
  // Garde-fou : si la source _phase_shops_rolelock.orders_read contenait role dans .write → abort
  ok(/auth\.token\.role === 'admin'/.test(ORDERS_ADMIN), 'expression armée = role:admin (fichier)');

  // ── CMC_ADMIN_LOCK=on → restructure /cmcteams correctement (config admin role:admin) ──
  {
    const r = await run({ CMC_ADMIN_LOCK: 'on' });
    const c = r.put && r.put.rules.cmcteams;
    ok(c && c['.write'] == null, 'cmclock-on/ write PARENT retiré (descendu au $key, révocable)');
    ok(c && c.$key && c.$key['.write'] === 'auth != null', 'cmclock-on/ $key .write = auth!=null (tous les autres keys)');
    ok(c && c.cmc_admin_cfg && /role/.test(String(c.cmc_admin_cfg['.write'])), 'cmclock-on/ cmc_admin_cfg .write = role:admin');
    ok(c && c.cmc_motd && /role/.test(String(c.cmc_motd['.write'])), 'cmclock-on/ cmc_motd .write = role:admin');
    ok(c && ['cmc_e', 'cmc_ov', 'cmc_pw'].every((k) => c[k] && c[k]['.write'] === 'auth != null'), 'cmclock-on/ cmc_e/cmc_ov/cmc_pw écrivables par TOUS (employés OK)');
    ok(c && c.cmc_admin_pin['.write'] === false && c.cmc_ia_key['.write'] === false, 'cmclock-on/ secrets restent .write:false');
    ok(c && c['.read'] === 'auth != null', 'cmclock-on/ LECTURE /cmcteams inchangée (auth!=null)');
  }
  // CMC_ADMIN_LOCK=off → write parent auth!=null (rollback, pas de restructure)
  {
    const r = await run({ CMC_ADMIN_LOCK: 'off' });
    const c = r.put && r.put.rules.cmcteams;
    ok(c && c['.write'] === 'auth != null', 'cmclock-off/ write parent = auth!=null (inchangé/rollback)');
    ok(c && (!c.cmc_admin_cfg || c.cmc_admin_cfg['.write'] == null), 'cmclock-off/ cmc_admin_cfg pas verrouillé');
  }
  // défaut (absent) = keep, live ouvert → reste ouvert
  {
    const r = await run({});
    const c = r.put && r.put.rules.cmcteams;
    ok(c && c['.write'] === 'auth != null', 'cmclock-défaut/ keep live ouvert → reste ouvert (0 régression au merge)');
  }

  console.log(`\nverify-orders-read-lock : ${pass} OK / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
