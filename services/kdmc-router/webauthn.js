/* WebAuthn (passkey / Face ID) — vérification côté serveur pour faire de kd-mc.com
   un VRAI fournisseur d'identité vérifiée. Pur Web Crypto (marche en Cloudflare
   Worker ET en Node 22). Pas de dépendance.

   Modèle : Trust-On-First-Use (TOFU) sans vérification d'attestation (on ne valide
   pas le certificat fabricant — inutile pour un IdP perso). On EXTRAIT la clé
   publique à l'enregistrement, on la stocke, puis on VÉRIFIE la signature ES256 à
   chaque authentification → preuve cryptographique que c'est bien le même appareil/
   utilisateur (Face ID/Touch ID). C'est ça qui rend l'identité "forte" (verified)
   au lieu d'auto-assertée.

   Algo supporté : ES256 (ECDSA P-256 + SHA-256) — celui des authentificateurs
   plateforme Apple/Google. (RS256 non géré : les passkeys iOS/Android = ES256.) */

const te = new TextEncoder();
const td = new TextDecoder();

/* ----------------------------- base64url ----------------------------- */
function b64uEnc(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDec(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function timingEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
async function hmac(secret, bytes) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
}

/* --------------------- CBOR (décodeur minimal) ----------------------- */
/* Supporte : uint, negint, byte-string, text-string, array, map. Suffit pour
   attestationObject {fmt, attStmt, authData} et une clé COSE EC2. */
function cborDecodeFirst(buf, startOff) {
  let off = startOff || 0;
  function readLen(ai) {
    if (ai < 24) return ai;
    if (ai === 24) { if (off + 1 > buf.length) throw new Error('cbor tronqué'); const v = buf[off]; off += 1; return v; }
    if (ai === 25) { if (off + 2 > buf.length) throw new Error('cbor tronqué'); const v = (buf[off] << 8) | buf[off + 1]; off += 2; return v; }
    if (ai === 26) { if (off + 4 > buf.length) throw new Error('cbor tronqué'); const v = (buf[off] * 16777216) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3]; off += 4; return v; }
    throw new Error('cbor len trop grand');
  }
  function next() {
    if (off >= buf.length) throw new Error('cbor: fin de buffer');
    const b = buf[off]; off += 1;
    const major = b >> 5; const ai = b & 0x1f;
    if (major === 0) return readLen(ai);
    if (major === 1) return -1 - readLen(ai);
    if (major === 2) { const n = readLen(ai); if (n < 0 || off + n > buf.length) throw new Error('cbor bytes hors limites'); const v = buf.slice(off, off + n); off += n; return v; }
    if (major === 3) { const n = readLen(ai); if (n < 0 || off + n > buf.length) throw new Error('cbor str hors limites'); const v = td.decode(buf.slice(off, off + n)); off += n; return v; }
    if (major === 4) { const n = readLen(ai); const a = []; for (let i = 0; i < n; i++) a.push(next()); return a; }
    if (major === 5) { const n = readLen(ai); const m = new Map(); for (let i = 0; i < n; i++) { const k = next(); const v = next(); m.set(k, v); } return m; }
    throw new Error('cbor major non supporté: ' + major);
  }
  const value = next();
  return { value, off };
}

/* ----------------- authData → flags + credId + clé COSE -------------- */
function parseAuthData(authData) {
  if (authData.length < 37) throw new Error('authData trop court');
  const flags = authData[32];
  const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];
  const out = { rpIdHash: authData.slice(0, 32), flags, signCount, hasAttested: !!(flags & 0x40), userPresent: !!(flags & 0x01), userVerified: !!(flags & 0x04) };
  if (out.hasAttested) {
    let p = 37;
    p += 16; // aaguid
    const credIdLen = (authData[p] << 8) | authData[p + 1]; p += 2;
    out.credId = authData.slice(p, p + credIdLen); p += credIdLen;
    const { value: cose } = cborDecodeFirst(authData, p);
    out.cose = cose;
  }
  return out;
}

/* COSE EC2 (ES256) → JWK importable par Web Crypto. */
function coseToJwk(cose) {
  const kty = cose.get(1), alg = cose.get(3), crv = cose.get(-1);
  if (kty !== 2) throw new Error('clé non-EC2 (passkey attendu ES256)');
  if (alg !== -7) throw new Error('alg non-ES256 (-7 attendu)');
  if (crv !== 1) throw new Error('courbe non-P-256');
  const x = cose.get(-2), y = cose.get(-3);
  if (!(x instanceof Uint8Array) || x.length !== 32) throw new Error('COSE x invalide (32 octets attendus)');
  if (!(y instanceof Uint8Array) || y.length !== 32) throw new Error('COSE y invalide (32 octets attendus)');
  return { kty: 'EC', crv: 'P-256', x: b64uEnc(x), y: b64uEnc(y), ext: false };
}

/* Signature ECDSA DER (SEQUENCE{INTEGER r, INTEGER s}) → r||s brut (64 octets). */
function derToRaw(der) {
  let off = 0;
  if (der[off++] !== 0x30) throw new Error('DER: pas une SEQUENCE');
  let seqLen = der[off++];
  if (seqLen & 0x80) { const n = seqLen & 0x7f; seqLen = 0; for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | der[off++]; }
  function readInt() {
    if (der[off++] !== 0x02) throw new Error('DER: pas un INTEGER');
    let len = der[off++];
    if (len < 0 || off + len > der.length) throw new Error('DER: INTEGER hors limites');
    let v = der.slice(off, off + len); off += len;
    while (v.length > 32 && v[0] === 0x00) v = v.slice(1); // retire 0x00 de signe
    if (v.length > 32) throw new Error('DER: INTEGER > 32 octets');
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length); // pad à gauche
    return out;
  }
  const r = readInt(); const s = readInt();
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32);
  return raw;
}

/* ----------------------- Challenge sans état ------------------------- */
/* challenge = base64url( kind(1) + ts(6, ms) + nonce(16) + tag(16=HMAC tronqué) ).
   Permet de vérifier fraîcheur + intégrité sans stockage serveur. */
const CHALLENGE_TTL_MS = 2 * 60 * 1000; /* fenêtre de rejeu courte (challenge stateless signé) */
async function makeChallenge(secret, kind) {
  const k = kind === 'auth' ? 2 : 1;
  const body = new Uint8Array(1 + 6 + 16);
  body[0] = k;
  const ts = Date.now();
  for (let i = 0; i < 6; i++) body[1 + i] = (ts / Math.pow(2, 8 * (5 - i))) & 0xff;
  crypto.getRandomValues(body.subarray(7));
  const tag = (await hmac(secret, body)).slice(0, 16);
  const full = new Uint8Array(body.length + 16); full.set(body); full.set(tag, body.length);
  return b64uEnc(full);
}
async function verifyChallenge(secret, challengeB64, kind) {
  try {
    const full = b64uDec(challengeB64);
    if (full.length !== 1 + 6 + 16 + 16) return false;
    const body = full.slice(0, 23), tag = full.slice(23);
    const expect = (await hmac(secret, body)).slice(0, 16);
    if (!timingEq(tag, expect)) return false;
    if (body[0] !== (kind === 'auth' ? 2 : 1)) return false;
    let ts = 0; for (let i = 0; i < 6; i++) ts = ts * 256 + body[1 + i];
    if (Math.abs(Date.now() - ts) > CHALLENGE_TTL_MS) return false;
    return true;
  } catch { return false; }
}

/* ---------------------- Enregistrement (TOFU) ------------------------ */
/* attestationObjectB64 (base64url) → { credId(b64u), jwk } à stocker. On vérifie
   aussi que le challenge signé est valide + que clientData est de type create. */
async function parseRegistration(secret, attestationObjectB64, clientDataJSONB64) {
  const clientData = JSON.parse(td.decode(b64uDec(clientDataJSONB64)));
  if (clientData.type !== 'webauthn.create') throw new Error('type clientData != create');
  if (!(await verifyChallenge(secret, clientData.challenge, 'reg'))) throw new Error('challenge invalide/expiré');
  const att = cborDecodeFirst(b64uDec(attestationObjectB64)).value;
  const authData = att.get('authData');
  const parsed = parseAuthData(authData);
  if (!parsed.hasAttested || !parsed.cose) throw new Error('pas de clé attestée');
  if (!parsed.userVerified) throw new Error('user non vérifié (Face ID/PIN requis)');
  const jwk = coseToJwk(parsed.cose);
  return { credId: b64uEnc(parsed.credId), jwk, origin: clientData.origin };
}

/* ----------------------- Authentification ---------------------------- */
/* Vérifie la signature ES256 sur (authenticatorData || sha256(clientDataJSON)).
   Renvoie true si la clé publique stockée valide bien la signature + challenge frais
   + user vérifié (Face ID). C'est LA preuve d'identité forte. */
async function verifyAssertion(secret, jwk, { clientDataJSON, authenticatorData, signature }, opts) {
  opts = opts || {};
  const clientData = JSON.parse(td.decode(b64uDec(clientDataJSON)));
  if (clientData.type !== 'webauthn.get') return { ok: false, reason: 'type != get' };
  if (!(await verifyChallenge(secret, clientData.challenge, 'auth'))) return { ok: false, reason: 'challenge invalide/expiré' };
  const originOk = opts.origins ? opts.origins.includes(clientData.origin)
    : (opts.origin ? clientData.origin === opts.origin : true);
  if (!originOk) return { ok: false, reason: 'origin mismatch' };
  const authData = b64uDec(authenticatorData);
  const flags = authData[32];
  const signCount = authData.length >= 37 ? (((authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36]) >>> 0) : 0;
  if (!(flags & 0x01)) return { ok: false, reason: 'user non présent' };
  if (!(flags & 0x04)) return { ok: false, reason: 'user non vérifié (Face ID/PIN)' };
  if (opts.rpId) {
    const expectHash = await sha256(te.encode(opts.rpId));
    if (!timingEq(authData.slice(0, 32), expectHash)) return { ok: false, reason: 'rpId mismatch' };
  }
  const cdHash = await sha256(b64uDec(clientDataJSON));
  const signed = new Uint8Array(authData.length + cdHash.length);
  signed.set(authData); signed.set(cdHash, authData.length);
  const rawSig = derToRaw(b64uDec(signature));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, rawSig, signed);
  /* signCount remonté pour la détection de clone côté worker (no-op si l'authentificateur
     reste à 0, cas des passkeys Apple/Google synchronisés). */
  return { ok, reason: ok ? '' : 'signature invalide', count: signCount };
}

export {
  b64uEnc, b64uDec, makeChallenge, verifyChallenge,
  parseRegistration, verifyAssertion, coseToJwk, parseAuthData, derToRaw, cborDecodeFirst,
};
