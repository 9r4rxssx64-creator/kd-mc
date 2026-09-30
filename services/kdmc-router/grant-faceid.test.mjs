/* GREFFER UN FACE ID SUR LE COMPTE ADMIN exige un grant du code admin VALIDE (contre-audit Bee 30.09).
   Prouvé ce jour-là : l'enrôlement acceptait un grant EXPIRÉ (13 h, 29 jours) ou RÉVOQUÉ (« déconnecter
   partout ») → un Face ID étranger sur le compte admin → session vérifiée de 30 jours → Bee, /__admin/grant…
   Le grant est désormais vérifié AU MÊME ENDROIT partout (grantValide). Sans réseau.
   node grant-faceid.test.mjs */
import mod from './worker.js';
import { b64uDec, b64uEnc } from './webauthn.js';
import { createHash, createHmac } from 'node:crypto';
const te = new TextEncoder();
const b64 = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const grantDe = (iat) => { const p = b64(JSON.stringify({ u: '__kdmc_admin__', n: 'admin', c: 1, v: 1, iat, exp: iat + 30 * 864e5 })); return p + '.' + b64(createHmac('sha256', 'sec').update(p).digest()); };
function head(major, len) { if (len < 24) return Uint8Array.of((major << 5) | len); if (len < 256) return Uint8Array.of((major << 5) | 24, len); return Uint8Array.of((major << 5) | 25, len >> 8, len & 0xff); }
function cat(...a) { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; }
function enc(x) { if (typeof x === 'number') return x >= 0 ? head(0, x) : head(1, -1 - x); if (x instanceof Uint8Array) return cat(head(2, x.length), x); if (typeof x === 'string') { const b = te.encode(x); return cat(head(3, b.length), b); } throw new Error('enc'); }
const POST = (path, body, headers) => new Request('https://kd-mc.com' + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: JSON.stringify(body) });
const cookieOf = (res) => ((res.headers.get('set-cookie') || '').match(/kdmc_sso=([^;]+)/) || [])[1];

async function essai(nom, grant, revoque) {
  const store = new Map();
  const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
  const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, AI: { run: async () => ({ response: 'ok' }) } };
  if (revoque) store.set('acc:kdmc_admin', JSON.stringify({ uid: 'kdmc_admin', revoked_at: Date.now() - 1000 }));
  // 0) le grant seul ouvre-t-il encore une porte admin ?
  const direct = await mod.fetch(new Request('https://kd-mc.com/__admin/grant', { headers: { 'x-kdmc-admin': grant } }), env);
  // 1) l'attaquant se déclare « kevin-desarzens » (session FAIBLE, sans aucune preuve)
  let r = await mod.fetch(POST('/__sso/issue', { uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true }), env);
  const cookie = 'kdmc_sso=' + cookieOf(r);
  // 2) il enrôle SON authentificateur, en présentant le grant volé
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pj = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const credId = crypto.getRandomValues(new Uint8Array(32));
  const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('kd-mc.com')));
  const ro = await (await mod.fetch(POST('/__sso/webauthn/register/options', {}, { cookie }), env)).json();
  const cose = cat(head(5, 5), enc(1), enc(2), enc(3), enc(-7), enc(-1), enc(1), enc(-2), enc(b64uDec(pj.x)), enc(-3), enc(b64uDec(pj.y)));
  const authData = cat(rpIdHash, Uint8Array.of(0x45), Uint8Array.of(0, 0, 0, 0), new Uint8Array(16), Uint8Array.of(0, credId.length), credId, cose);
  const att = cat(head(5, 3), enc('fmt'), enc('none'), enc('attStmt'), head(5, 0), enc('authData'), enc(authData));
  const cd = te.encode(JSON.stringify({ type: 'webauthn.create', challenge: ro.challenge, origin: 'https://kd-mc.com' }));
  const rv = await (await mod.fetch(POST('/__sso/webauthn/register/verify', { attestationObject: b64uEnc(att), clientDataJSON: b64uEnc(cd) }, { cookie: cookie + '; kdmc_admin=' + grant }), env)).json();
  // 3) avec le jeton VÉRIFIÉ obtenu : portes admin ?
  let bee = null, g = null;
  if (rv.token) {
    bee = (await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kdmc-sso': rv.token }, body: JSON.stringify({ messages: [{ role: 'user', content: 'salut' }] }) }), env, { waitUntil() {} })).status;
    g = (await mod.fetch(new Request('https://kd-mc.com/__admin/grant', { headers: { 'x-kdmc-sso': rv.token } }), env)).status;
  }
  return { direct: direct.status, enrole: !!rv.ok, bee, g, raison: rv.reason || '' };
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
{ const r = await essai('frais', grantDe(Date.now() - 60e3), false);
  ok(r.direct === 200 && r.enrole && r.bee === 200, 'témoin : un grant FRAIS du code admin permet à Kevin d\'ajouter son Face ID  ' + JSON.stringify(r)); }
for (const [nom, g, rev] of [['13 h', grantDe(Date.now() - 13 * 3600e3), false], ['29 jours', grantDe(Date.now() - 29 * 864e5), false], ['révoqué', grantDe(Date.now() - 60e3), true]]) {
  const r = await essai(nom, g, rev);
  ok(r.direct === 403 && !r.enrole && r.bee === null, 'grant ' + nom + ' → ni porte admin, ni Face ID greffé sur le compte admin  ' + JSON.stringify(r));
}
console.log(`\n=== Face ID sur le compte admin : ${pass} contrôles OK, ${fail} échec(s) ===`);
process.exit(fail ? 1 : 0);
