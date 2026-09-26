/* Test régression /__fin/* — sauvegarde Finances en ligne (E2E, admin only, KV mock).
   node fin.test.mjs
   Le bloc stocké est un {salt,iv,ct} OPAQUE (chiffré côté client) : le serveur ne le
   déchiffre jamais. On vérifie : gate admin (need_admin_code), grant → accès, PUT/GET
   roundtrip du bloc, validation du bloc, grant falsifié refusé. */
import mod from './worker.js';
import { createHash } from 'crypto';
const store = new Map();
const ACCOUNTS = {
  get: async (k) => (store.has(k) ? store.get(k) : null),
  put: async (k, v) => { store.set(k, v); },
  delete: async (k) => { store.delete(k); },
  list: async ({ prefix } = {}) => ({ keys: [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: null }),
};
const CODE = '424242';
const HASH = createHash('sha256').update(CODE).digest('hex');
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS };
const REQ = (o) => new Request('https://kd-mc.com' + o.path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

// Bloc chiffré factice (comme ce que le client envoie : jamais de clair)
const BLOB = { salt: 'c2FsdA', iv: 'aXZpdg', ct: 'Y2lwaGVydGV4dA' };

// 1. Sans grant → 403 need_admin_code
let r = await mod.fetch(REQ({ path: '/__fin/vault' }), env); let j = await r.json();
ok(r.status === 403 && j.reason === 'need_admin_code', 'GET /__fin/vault sans code → 403 need_admin_code');
r = await mod.fetch(REQ({ path: '/__fin/vault', method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blob: BLOB }) }), env);
ok(r.status === 403, 'PUT /__fin/vault sans code → 403');

// 2. Login admin → grant
r = await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), env);
j = await r.json();
ok(j.ok && j.grant, 'login admin → grant signé');
const grant = j.grant;
const H = { 'x-kdmc-admin': grant, 'content-type': 'application/json' };

// 3. GET vide
r = await mod.fetch(REQ({ path: '/__fin/vault', headers: H }), env); j = await r.json();
ok(j.ok && j.empty === true, 'GET vault (vide) → {ok, empty}');

// 4. PUT bloc chiffré
r = await mod.fetch(REQ({ path: '/__fin/vault', method: 'PUT', headers: H, body: JSON.stringify({ blob: BLOB, savedAt: 1234567890, tx: 42 }) }), env);
j = await r.json();
ok(j.ok && j.savedAt === 1234567890, 'PUT bloc chiffré → ok + savedAt');
ok(store.get('fin:vault:main') === JSON.stringify(BLOB), 'bloc stocké tel quel (opaque, non déchiffré côté serveur)');
const metaStored = JSON.parse(store.get('fin:meta:main'));
ok(metaStored.tx === 42 && metaStored.savedAt === 1234567890, 'méta stockée (tx, savedAt)');

// 5. GET → renvoie le bloc
r = await mod.fetch(REQ({ path: '/__fin/vault', headers: H }), env); j = await r.json();
ok(j.ok && j.blob && j.blob.ct === BLOB.ct && j.meta.tx === 42, 'GET vault → bloc + méta restitués');

// 6. Bloc invalide refusé
r = await mod.fetch(REQ({ path: '/__fin/vault', method: 'PUT', headers: H, body: JSON.stringify({ blob: { ct: 'x' } }) }), env);
j = await r.json();
ok(j.ok === false && j.reason === 'blob_invalide', 'PUT bloc incomplet → blob_invalide');

// 7. Grant falsifié → 403
r = await mod.fetch(REQ({ path: '/__fin/vault', headers: { 'x-kdmc-admin': grant.slice(0, -2) + 'XY' } }), env);
ok(r.status === 403, 'grant falsifié → 403');

// 8. meta endpoint
r = await mod.fetch(REQ({ path: '/__fin/meta', headers: H }), env); j = await r.json();
ok(j.ok && j.meta && j.meta.tx === 42, 'GET /__fin/meta → méta');

// ===== /__mail/* (récupération auto des factures par mail) =====
// 9. Sans grant → 403
r = await mod.fetch(REQ({ path: '/__mail/scan' }), env);
ok(r.status === 403, 'GET /__mail/scan sans code → 403');

// 10. scan vide
r = await mod.fetch(REQ({ path: '/__mail/scan', headers: H }), env); j = await r.json();
ok(j.ok && Array.isArray(j.items) && j.items.length === 0, 'scan (vide) → items:[]');

// 11. le worker mail dépose une pièce jointe → scan la renvoie (avec id + b64)
const ATT = { from: 'kevin@x.com', subject: 'Facture', filename: 'facture.pdf', mime: 'application/pdf', b64: 'JVBERi0=', hash: 'abc', ts: 1 };
store.set('mail:p:abc', JSON.stringify(ATT));
r = await mod.fetch(REQ({ path: '/__mail/scan', headers: H }), env); j = await r.json();
ok(j.ok && j.items.length === 1 && j.items[0].id === 'abc' && j.items[0].b64 === 'JVBERi0=' && j.items[0].filename === 'facture.pdf', 'scan → pièce jointe restituée (id + b64 + nom)');

// 12. ack supprime la pièce
r = await mod.fetch(REQ({ path: '/__mail/ack', method: 'POST', headers: H, body: JSON.stringify({ ids: ['abc'] }) }), env); j = await r.json();
ok(j.ok && j.deleted === 1 && !store.has('mail:p:abc'), 'ack → pièce supprimée du KV');
r = await mod.fetch(REQ({ path: '/__mail/scan', headers: H }), env); j = await r.json();
ok(j.ok && j.items.length === 0, 'après ack : file vide');

console.log((fail ? '❌ ' + fail + ' échec(s)' : '✅ fin.test : ' + pass + ' OK'));
process.exit(fail ? 1 : 0);
