/* Test régression WebAuthn (passkey) du domaine — prouve la vérification serveur
   SANS navigateur : on SIMULE un authentificateur (Face ID) avec une clé EC P-256
   (Web Crypto Node 22), on construit un attestationObject + une assertion signée,
   et on vérifie que webauthn.js (1) extrait la clé à l'enregistrement, (2) valide
   une vraie signature, (3) REJETTE signature falsifiée / challenge expiré / type
   incorrect. node webauthn.test.mjs */
import { parseRegistration, verifyAssertion, makeChallenge, b64uEnc, b64uDec } from './webauthn.js';

const te = new TextEncoder();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const SECRET = 'idp-secret-test';
const ORIGIN = 'https://kd-mc.com';
const RPID = 'kd-mc.com';

/* ---- mini-encodeur CBOR (pour fabriquer COSE + attestationObject) ---- */
function head(major, len) {
  if (len < 24) return Uint8Array.of((major << 5) | len);
  if (len < 256) return Uint8Array.of((major << 5) | 24, len);
  if (len < 65536) return Uint8Array.of((major << 5) | 25, len >> 8, len & 0xff);
  return Uint8Array.of((major << 5) | 26, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
}
function cat(...arrs) { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; }
function enc(x) {
  if (typeof x === 'number') return x >= 0 ? head(0, x) : head(1, -1 - x);
  if (x instanceof Uint8Array) return cat(head(2, x.length), x);
  if (typeof x === 'string') { const b = te.encode(x); return cat(head(3, b.length), b); }
  throw new Error('enc?');
}
function encMap(pairs) { const parts = [head(5, pairs.length)]; for (const [k, v] of pairs) { parts.push(enc(k), enc(v)); } return cat(...parts); }

/* ---- signature brute r||s → DER (ce que renvoie un vrai authentificateur) ---- */
function intDer(b) { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); const pre = (b[0] & 0x80) ? Uint8Array.of(0) : new Uint8Array(0); const body = cat(pre, b); return cat(Uint8Array.of(0x02, body.length), body); }
function rawToDer(raw) { const r = intDer(raw.slice(0, 32)); const s = intDer(raw.slice(32)); const body = cat(r, s); return cat(Uint8Array.of(0x30, body.length), body); }

async function sha256(b) { return new Uint8Array(await crypto.subtle.digest('SHA-256', b)); }

const run = async () => {
  /* 1) Authentificateur simulé : clé EC P-256 */
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const x = b64uDec(pubJwk.x), y = b64uDec(pubJwk.y);
  const credId = crypto.getRandomValues(new Uint8Array(32));
  const rpIdHash = await sha256(te.encode(RPID));

  /* 2) ENREGISTREMENT : attestationObject + clientData(create) avec challenge valide */
  const cose = encMap([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]);
  const regAuthData = cat(rpIdHash, Uint8Array.of(0x45), Uint8Array.of(0, 0, 0, 0), new Uint8Array(16), Uint8Array.of(0, credId.length), credId, cose); // flags 0x45 = UP|UV|AT
  /* attestationObject = map{fmt:"none", attStmt:{}, authData:<bytes>} */
  const attObj2 = cat(head(5, 3), enc('fmt'), enc('none'), enc('attStmt'), head(5, 0), enc('authData'), enc(regAuthData));
  const regChallenge = await makeChallenge(SECRET, 'reg');
  const regClientData = te.encode(JSON.stringify({ type: 'webauthn.create', challenge: regChallenge, origin: ORIGIN }));

  let reg;
  try { reg = await parseRegistration(SECRET, b64uEnc(attObj2), b64uEnc(regClientData)); ok(true, 'parseRegistration ne jette pas'); }
  catch (e) { ok(false, 'parseRegistration jette: ' + e.message); return; }
  ok(reg.credId === b64uEnc(credId), 'credId extrait correctement');
  ok(reg.jwk && reg.jwk.x === pubJwk.x && reg.jwk.y === pubJwk.y, 'clé publique extraite = celle de l\'authentificateur');

  /* challenge create falsifié → rejet */
  try { await parseRegistration(SECRET, b64uEnc(attObj2), b64uEnc(te.encode(JSON.stringify({ type: 'webauthn.create', challenge: 'AAAA', origin: ORIGIN })))); ok(false, 'enregistrement avec challenge bidon accepté !'); }
  catch { ok(true, 'enregistrement challenge bidon → rejeté'); }

  /* 3) AUTHENTIFICATION : assertion signée par la clé privée */
  async function makeAssertion(challengeB64, { tamper, flags } = {}) {
    const authData = cat(rpIdHash, Uint8Array.of(flags ?? 0x05), Uint8Array.of(0, 0, 0, 1)); // UP|UV
    const clientData = te.encode(JSON.stringify({ type: 'webauthn.get', challenge: challengeB64, origin: ORIGIN }));
    const cdHash = await sha256(clientData);
    const signed = cat(authData, cdHash);
    const rawSig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    if (tamper) rawSig[10] ^= 0xff;
    return { clientDataJSON: b64uEnc(clientData), authenticatorData: b64uEnc(authData), signature: b64uEnc(rawToDer(rawSig)) };
  }

  const authChallenge = await makeChallenge(SECRET, 'auth');
  const good = await makeAssertion(authChallenge);
  let r = await verifyAssertion(SECRET, reg.jwk, good, { origin: ORIGIN, rpId: RPID });
  ok(r.ok === true, 'assertion valide (Face ID) → vérifiée  [' + (r.reason || 'ok') + ']');

  const tampered = await makeAssertion(await makeChallenge(SECRET, 'auth'), { tamper: true });
  r = await verifyAssertion(SECRET, reg.jwk, tampered, { origin: ORIGIN, rpId: RPID });
  ok(r.ok === false, 'signature falsifiée → REJETÉE');

  /* challenge d'auth bidon → rejet */
  const badChal = await makeAssertion('ZmFrZQ');
  r = await verifyAssertion(SECRET, reg.jwk, badChal, { origin: ORIGIN, rpId: RPID });
  ok(r.ok === false, 'challenge auth bidon → REJETÉ');

  /* user NON vérifié (flags sans UV) → rejet (on EXIGE Face ID) */
  const noUv = await makeAssertion(await makeChallenge(SECRET, 'auth'), { flags: 0x01 });
  r = await verifyAssertion(SECRET, reg.jwk, noUv, { origin: ORIGIN, rpId: RPID });
  ok(r.ok === false, 'sans user-verified (Face ID) → REJETÉ');

  /* mauvais rpId → rejet */
  const good2 = await makeAssertion(await makeChallenge(SECRET, 'auth'));
  r = await verifyAssertion(SECRET, reg.jwk, good2, { origin: ORIGIN, rpId: 'evil.com' });
  ok(r.ok === false, 'rpId incorrect → REJETÉ');

  /* clé d'un AUTRE authentificateur → rejet */
  const kp2 = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const otherJwk = await crypto.subtle.exportKey('jwk', kp2.publicKey);
  const good3 = await makeAssertion(await makeChallenge(SECRET, 'auth'));
  r = await verifyAssertion(SECRET, { kty: 'EC', crv: 'P-256', x: otherJwk.x, y: otherJwk.y }, good3, { origin: ORIGIN, rpId: RPID });
  ok(r.ok === false, 'signature vérifiée avec une AUTRE clé → REJETÉE');

  console.log(`WebAuthn IdP test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run();
