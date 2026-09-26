/* Test des endpoints SELF-SERVICE (chacun ne voit/gère QUE SES données) :
   /__sso/passkeys (liste), /passkeys/delete (verified), /me/history, /me/revoke.
   node self-service.test.mjs */
import mod from './worker.js';
import { b64uDec, b64uEnc } from './webauthn.js';

const te = new TextEncoder();
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS };
const ORIGIN = 'https://kd-mc.com', RPID = 'kd-mc.com';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const REQ = (path, opt = {}) => new Request('https://kd-mc.com' + path, { method: opt.method || 'GET', headers: opt.headers || {}, body: opt.body });
const POST = (path, body, headers) => REQ(path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
const cookieOf = (res) => ((res.headers.get('set-cookie') || '').match(/kdmc_sso=([^;]+)/) || [])[1];

/* mini CBOR/DER pour l'authentificateur simulé (comme webauthn-endpoints) */
function head(major, len) { if (len < 24) return Uint8Array.of((major << 5) | len); if (len < 256) return Uint8Array.of((major << 5) | 24, len); return Uint8Array.of((major << 5) | 25, len >> 8, len & 0xff); }
function cat(...a) { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; }
function enc(x) { if (typeof x === 'number') return x >= 0 ? head(0, x) : head(1, -1 - x); if (x instanceof Uint8Array) return cat(head(2, x.length), x); if (typeof x === 'string') { const b = te.encode(x); return cat(head(3, b.length), b); } throw new Error('enc'); }
async function sha256(b) { return new Uint8Array(await crypto.subtle.digest('SHA-256', b)); }

async function enroll(uid, name) {
  /* issue → register/options → register/verify (passkey simulé) → token FORT */
  let r = await mod.fetch(POST('/__sso/issue', { uid, name, cgu: true }), env);
  const cookie = 'kdmc_sso=' + cookieOf(r);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pj = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const x = b64uDec(pj.x), y = b64uDec(pj.y);
  const credId = crypto.getRandomValues(new Uint8Array(32));
  const rpIdHash = await sha256(te.encode(RPID));
  const ro = await (await mod.fetch(POST('/__sso/webauthn/register/options', {}, { cookie }), env)).json();
  const cose = cat(head(5, 5), enc(1), enc(2), enc(3), enc(-7), enc(-1), enc(1), enc(-2), enc(x), enc(-3), enc(y));
  const regAuthData = cat(rpIdHash, Uint8Array.of(0x45), Uint8Array.of(0, 0, 0, 0), new Uint8Array(16), Uint8Array.of(0, credId.length), credId, cose);
  const attObj = cat(head(5, 3), enc('fmt'), enc('none'), enc('attStmt'), head(5, 0), enc('authData'), enc(regAuthData));
  const regCD = te.encode(JSON.stringify({ type: 'webauthn.create', challenge: ro.challenge, origin: ORIGIN }));
  r = await mod.fetch(POST('/__sso/webauthn/register/verify', { attestationObject: b64uEnc(attObj), clientDataJSON: b64uEnc(regCD) }, { cookie }), env);
  const rv = await r.json();
  return { strong: 'Bearer ' + rv.token, weakCookie: cookie, credId: b64uEnc(credId).slice(0, 12) };
}

const run = async () => {
  const laur = await enroll('laurence-sp', 'Laurence Saint-Polit');

  /* 1) Mes passkeys — session forte → 1 appareil */
  let r = await mod.fetch(REQ('/__sso/passkeys', { headers: { authorization: laur.strong } }), env);
  let j = await r.json();
  ok(j.ok && j.count === 1 && j.passkeys[0].id === laur.credId && !j.passkeys[0].jwk, 'GET /passkeys → 1 appareil (sans clé publique exposée)');

  /* 2) Sans session → refus */
  r = await mod.fetch(REQ('/__sso/passkeys'), env);
  ok((await r.json()).ok === false, 'GET /passkeys sans session → refus');

  /* 3) Supprimer un passkey depuis une session FAIBLE (non vérifiée) → refus */
  const weak = await mod.fetch(POST('/__sso/issue', { uid: 'laurence-sp', name: 'Laurence Saint-Polit', cgu: true }), env);
  const weakCookie = 'kdmc_sso=' + cookieOf(weak);
  r = await mod.fetch(POST('/__sso/passkeys/delete', { id: laur.credId }, { cookie: weakCookie }), env);
  j = await r.json();
  ok(j.ok === false && /Face ID/.test(j.reason || ''), 'delete depuis session FAIBLE → refus (Face ID requis)');
  ok(JSON.parse(store.get('pk:laurence-sp')).length === 1, 'le passkey n\'a PAS été supprimé par la session faible');

  /* 4) Supprimer depuis session FORTE (verified) → OK */
  r = await mod.fetch(POST('/__sso/passkeys/delete', { id: laur.credId }, { authorization: laur.strong }), env);
  j = await r.json();
  ok(j.ok && j.removed === 1 && j.remaining === 0, 'delete depuis session FORTE → supprimé');
  ok(JSON.parse(store.get('pk:laurence-sp')).length === 0, 'pk:laurence-sp vidé');
  ok(JSON.parse(store.get('acc:laurence-sp')).passkey === false, 'fiche : passkey=false après suppression du dernier');

  /* 5) Historique perso — session requise, self-scopé */
  const kev = await enroll('kevin-desarzens', 'Kevin Desarzens');
  r = await mod.fetch(REQ('/__sso/me/history', { headers: { authorization: kev.strong } }), env);
  j = await r.json();
  ok(j.ok && j.uid === 'kevin-desarzens' && Array.isArray(j.history) && typeof j.hits === 'number', 'GET /me/history → mon historique (self-scopé)');
  r = await mod.fetch(REQ('/__sso/me/history'), env);
  ok((await r.json()).ok === false, '/me/history sans session → refus');

  /* 6) « Déconnecter mes autres appareils » : mon ANCIEN token meurt, le NOUVEAU (renvoyé) marche */
  const before = kev.strong;
  await new Promise((res) => setTimeout(res, 5));
  r = await mod.fetch(POST('/__sso/me/revoke', undefined, { authorization: before }), env);
  j = await r.json();
  ok(j.ok && typeof j.token === 'string' && j.revoked_at > 0, '/me/revoke → ok + token frais renvoyé');
  const fresh = 'Bearer ' + j.token;
  r = await mod.fetch(REQ('/__sso/whoami', { headers: { authorization: before } }), env);
  ok((await r.json()).reason === 'session_revoquee', 'ancien token (autre appareil) → session_revoquee');
  r = await mod.fetch(REQ('/__sso/whoami', { headers: { authorization: fresh } }), env);
  j = await r.json();
  ok(j.ok === true && j.uid === 'kevin-desarzens', 'token frais (CE device) → toujours connecté');

  /* 7) Isolation : je ne peux PAS voir les passkeys d'un autre (uid vient de MON token) */
  await enroll('autre-user', 'Autre User');
  r = await mod.fetch(REQ('/__sso/passkeys', { headers: { authorization: fresh } }), env);
  j = await r.json();
  ok(j.ok && j.count === 1, 'mes passkeys = les MIENS uniquement (pas ceux d\'autre-user)');

  /* 8) Strix vuln-0001 (11/09/2026) : un token FAIBLE se forge avec n'importe quel uid via
     /issue. Il ne doit NI lire l'historique de cet uid, NI révoquer ses sessions. */
  const forged = await mod.fetch(POST('/__sso/issue', { uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true }), env);
  const forgedCookie = 'kdmc_sso=' + cookieOf(forged);
  r = await mod.fetch(REQ('/__sso/me/history', { headers: { cookie: forgedCookie } }), env);
  j = await r.json();
  ok(j.ok === false && /Face ID/.test(j.reason || '') && !j.history, 'token FAIBLE forgé sur kevin-desarzens → /me/history refusé (Face ID requis), rien de renvoyé');
  const revokedBefore = JSON.parse(store.get('acc:kevin-desarzens') || '{}').revoked_at || 0;
  r = await mod.fetch(POST('/__sso/me/revoke', undefined, { cookie: forgedCookie }), env);
  j = await r.json();
  ok(j.ok === false && /Face ID/.test(j.reason || ''), 'token FAIBLE forgé → /me/revoke refusé (Face ID requis)');
  ok((JSON.parse(store.get('acc:kevin-desarzens') || '{}').revoked_at || 0) === revokedBefore, 'la fiche de Kevin n\'a PAS été révoquée par le token forgé');
  r = await mod.fetch(REQ('/__sso/whoami', { headers: { authorization: fresh } }), env);
  ok((await r.json()).ok === true, 'la vraie session (Face ID) de Kevin est toujours vivante');

  /* 9) Strix vuln-0001 (CSRF de connexion) : /issue refuse un site tiers, accepte le domaine */
  r = await mod.fetch(POST('/__sso/issue', { uid: 'csrf-user', name: 'Csrf User' }, { origin: 'https://evil.example' }), env);
  ok(r.status === 403 && (await r.json()).ok === false && !r.headers.get('set-cookie'), '/issue depuis https://evil.example → 403, aucun cookie posé');
  r = await mod.fetch(POST('/__sso/issue', { uid: 'csrf-user', name: 'Csrf User' }, { origin: 'null' }), env);
  ok(r.status === 403, '/issue avec Origin « null » (iframe sandbox) → 403');
  for (const o of ['https://kd-mc.com', 'https://apex-chat.kd-mc.com', 'capacitor://localhost']) {
    r = await mod.fetch(POST('/__sso/issue', { uid: 'u-ok', name: 'U Ok' }, { origin: o }), env);
    ok(r.status === 200 && (await r.json()).ok === true, '/issue depuis ' + o + ' → accepté');
  }
  r = await mod.fetch(POST('/__sso/issue', { uid: 'u-ok', name: 'U Ok' }, { origin: 'https://kd-mc.com.evil.example' }), env);
  ok(r.status === 403, '/issue depuis kd-mc.com.evil.example (préfixe trompeur) → 403');
  /* même origine que l'hôte appelé (portail servi en local, test navigateur) → accepté ;
     un autre port/hôte local n'est pas « même origine » → refusé */
  const LOCAL = (origin) => new Request('http://127.0.0.1:8788/__sso/issue', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ uid: 'u-loc', name: 'U Loc' }) });
  r = await mod.fetch(LOCAL('http://127.0.0.1:8788'), env);
  ok(r.status === 200 && (await r.json()).ok === true, '/issue en local, Origin = même hôte:port → accepté');
  r = await mod.fetch(LOCAL('http://127.0.0.1:9999'), env);
  ok(r.status === 403, '/issue en local, Origin = autre port → 403');

  console.log(`Self-service test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run();
