/**
 * Apex Chat — Crypto E2E (ESM module)
 *
 * Module ESM pur, importable en Node (tests vitest) ou en browser
 * (build step ou bundler). Source de vérité unique pour la crypto.
 *
 * Le wrapper `crypto.js` à la racine continue d'exposer `window.ApexCrypto`
 * pour compatibilité <script defer> ; il importe ce module ou en duplique
 * le code (sync via tools/sync-crypto.mjs).
 *
 * Chiffrement :
 *   - ECDH P-256 → derive shared secret
 *   - HKDF SHA-256 → stretch
 *   - AES-GCM 256 → encrypt messages (IV 12 bytes random, auth tag inclus)
 *   - PBKDF2 SHA-256 100k iterations → derive key from PIN
 *
 * Le serveur ne déchiffre RIEN — seul le client possède les clés privées.
 */

'use strict';

const enc = new TextEncoder();
const dec = new TextDecoder();

// ----------------------------------------------------------------------------
//  Helpers
// ----------------------------------------------------------------------------

export function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function b64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

export function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomBytes(len) {
  return crypto.getRandomValues(new Uint8Array(len));
}

// ----------------------------------------------------------------------------
//  Identity keys (ECDH P-256)
// ----------------------------------------------------------------------------

export async function generateIdentityKeys() {
  // Paire ECDH extractable pour stockage chiffré (Phase 2b → non-extract via wrap JWK)
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

export async function exportPublicKey(publicKey) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return btoa(JSON.stringify(jwk));
}

export async function importPublicKey(jwkB64) {
  const jwk = JSON.parse(atob(jwkB64));
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

export async function exportPrivateKey(privateKey) {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  return btoa(JSON.stringify(jwk));
}

export async function importPrivateKey(jwkB64) {
  const jwk = JSON.parse(atob(jwkB64));
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

// ----------------------------------------------------------------------------
//  ECDH derivation → AES-GCM 256 (HKDF SHA-256)
// ----------------------------------------------------------------------------

export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('apex-chat-v1'),
      info: enc.encode('message-encryption'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ----------------------------------------------------------------------------
//  AES-GCM message encrypt / decrypt
// ----------------------------------------------------------------------------

export async function encryptMessage(plaintext, aesKey) {
  const iv = randomBytes(12);
  const data = enc.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bufToB64(combined);
}

export async function decryptMessage(ciphertextB64, aesKey) {
  const combined = new Uint8Array(b64ToBuf(ciphertextB64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  );

  return dec.decode(plaintext);
}

// ----------------------------------------------------------------------------
//  PIN wrap (PBKDF2 100k → AES-GCM)
// ----------------------------------------------------------------------------

async function deriveKeyFromPin(pin, saltB64) {
  const salt = saltB64 ? new Uint8Array(b64ToBuf(saltB64)) : randomBytes(16);

  const pinKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    pinKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { aesKey, salt: bufToB64(salt) };
}

export async function wrapWithPin(payload, pin) {
  const { aesKey, salt } = await deriveKeyFromPin(pin);
  const ciphertext = await encryptMessage(JSON.stringify(payload), aesKey);
  return { ciphertext, salt };
}

export async function unwrapWithPin(ciphertext, salt, pin) {
  const { aesKey } = await deriveKeyFromPin(pin, salt);
  const plaintext = await decryptMessage(ciphertext, aesKey);
  return JSON.parse(plaintext);
}

// ----------------------------------------------------------------------------
//  Sessions par conversation (cache clé dérivée)
// ----------------------------------------------------------------------------

const sessionCache = new Map();

export async function establishSession(convId, myPrivateKey, theirPublicKey) {
  const aesKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
  sessionCache.set(convId, aesKey);
  return aesKey;
}

export function getSessionKey(convId) {
  return sessionCache.get(convId);
}

export async function encryptForConv(convId, plaintext) {
  const aesKey = sessionCache.get(convId);
  if (!aesKey) throw new Error('Pas de session pour cette conversation');
  return encryptMessage(plaintext, aesKey);
}

export async function decryptForConv(convId, ciphertext) {
  const aesKey = sessionCache.get(convId);
  if (!aesKey) throw new Error('Pas de session pour cette conversation');
  return decryptMessage(ciphertext, aesKey);
}

// ----------------------------------------------------------------------------
//  Forward secrecy — ratchet symétrique à clés jetables (v1.1.260)
//  Chaque message a SA clé (mk_n), dérivée d'une chaîne CK qui avance à chaque
//  message ; la clé utilisée est DÉTRUITE. Compromettre la clé courante ne
//  révèle donc PAS les messages passés (forward secrecy). C'est la moitié
//  symétrique du Double Ratchet (pas de post-compromise DH, mais vraie FS).
//  État par conversation en mémoire ; sérialisable (index.html persiste).
//  Gère les messages hors-ordre / sautés (clés sautées mémorisées puis jetées).
// ----------------------------------------------------------------------------
const ratchetStates = new Map(); // convId -> { ck:Uint8Array, ns:int, nr:int, skipped:Map<int,Uint8Array> }
const MAX_SKIP = 100; // garde-fou : nb max de clés sautées dérivées d'un coup

async function _hkdfBytes(keyBytes, info, len) {
  const k = await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('apex-ratchet-v1'), info: enc.encode(info) },
    k, len * 8,
  );
  return new Uint8Array(bits);
}

async function _rootBits(myPrivateKey, theirPublicKey) {
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirPublicKey }, myPrivateKey, 256);
  return _hkdfBytes(new Uint8Array(sharedBits), 'root-chain', 32);
}

// mk = HKDF(ck,'mk'), ck' = HKDF(ck,'ck') — avance déterministe de la chaîne
async function _stepChain(ck) {
  const mk = await _hkdfBytes(ck, 'mk', 32);
  const nextCk = await _hkdfBytes(ck, 'ck', 32);
  return { mk, nextCk };
}

async function _mkToAesKey(mk) {
  return crypto.subtle.importKey('raw', mk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function ratchetInit(convId, myPrivateKey, theirPublicKey) {
  const ck = await _rootBits(myPrivateKey, theirPublicKey);
  ratchetStates.set(convId, { ck, ns: 0, nr: 0, skipped: new Map() });
}

export function hasRatchet(convId) {
  return ratchetStates.has(convId);
}

export async function ratchetEncrypt(convId, plaintext) {
  const st = ratchetStates.get(convId);
  if (!st) throw new Error('Pas de ratchet pour cette conversation');
  const { mk, nextCk } = await _stepChain(st.ck);
  const aesKey = await _mkToAesKey(mk);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.length);
  const n = st.ns;
  st.ns += 1; st.ck = nextCk; // la clé mk est jetée (forward secrecy)
  return { n, ct: bufToB64(combined) };
}

export async function ratchetDecrypt(convId, n, ctB64) {
  const st = ratchetStates.get(convId);
  if (!st) throw new Error('Pas de ratchet pour cette conversation');
  let mk;
  if (st.skipped.has(n)) {
    mk = st.skipped.get(n); st.skipped.delete(n); // clé sautée consommée puis jetée
  } else {
    if (n < st.nr) throw new Error('Message trop ancien (clé déjà détruite)');
    if (n - st.nr > MAX_SKIP) throw new Error('Trop de messages sautés');
    while (st.nr < n) { // mémorise les clés des messages sautés, avance la chaîne
      const step = await _stepChain(st.ck);
      st.skipped.set(st.nr, step.mk);
      st.ck = step.nextCk; st.nr += 1;
    }
    const step = await _stepChain(st.ck);
    mk = step.mk; st.ck = step.nextCk; st.nr += 1; // clé courante consommée
  }
  const aesKey = await _mkToAesKey(mk);
  const combined = new Uint8Array(b64ToBuf(ctB64));
  const iv = combined.slice(0, 12); const data = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
  return dec.decode(plain);
}

// Sérialise l'état (index.html le persiste en localStorage → survit au reload)
export function ratchetExport(convId) {
  const st = ratchetStates.get(convId);
  if (!st) return null;
  return JSON.stringify({
    ck: bufToHex(st.ck), ns: st.ns, nr: st.nr,
    skipped: Array.from(st.skipped.entries()).map(([k, v]) => [k, bufToHex(v)]),
  });
}

export function ratchetImport(convId, json) {
  if (!json) return false;
  try {
    const o = JSON.parse(json);
    const hexToBytes = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((x) => parseInt(x, 16)));
    ratchetStates.set(convId, {
      ck: hexToBytes(o.ck), ns: o.ns | 0, nr: o.nr | 0,
      skipped: new Map((o.skipped || []).map(([k, v]) => [k | 0, hexToBytes(v)])),
    });
    return true;
  } catch { return false; }
}

export function resetRatchet(convId) {
  if (convId) ratchetStates.delete(convId); else ratchetStates.clear();
}

// ----------------------------------------------------------------------------
//  Politique de mise sur le fil (anti repli texte-clair silencieux) — v1.1.257
//  Décide ce qui part réellement sur le WebSocket / en base :
//   - 'cipher'  : un payload chiffré (E2E1:…) existe → on l'envoie.
//   - 'clear'   : E2E explicitement OFF (opt-out) → texte clair assumé.
//   - 'pending' : E2E ON mais AUCUN chiffré (clé du contact absente) → on
//                 N'ENVOIE RIEN en clair ; le message attend la clé (façon
//                 Signal) puis part chiffré. Ferme la régression leçon #90.
//  Fonction PURE (aucune crypto) → testée à 100% ; index.html ne fait qu'appeler.
// ----------------------------------------------------------------------------
export function decideWire({ ciphertextPayload, plaintext, e2eOn }) {
  if (ciphertextPayload) return { mode: 'cipher', wire: ciphertextPayload };
  if (!e2eOn) return { mode: 'clear', wire: plaintext };
  return { mode: 'pending', wire: null };
}

// v1.1.259 — Détection de changement de clé (TOFU, parité Signal). Compare la
// clé publique fraîchement reçue d'un contact à celle mémorisée à la 1ʳᵉ vue.
//   - firstSight : jamais vue → à mémoriser (aucune alerte).
//   - changed    : clé DIFFÉRENTE d'avant → alerter (MITM possible / réinstall).
//   - unchanged  : identique → RAS.
// Fonction PURE (aucune crypto, aucun I/O) → testée à 100% ; index.html appelle.
export function checkKeyChange(storedPub, newPub) {
  if (!newPub) return { firstSight: false, changed: false, unchanged: false };
  if (!storedPub) return { firstSight: true, changed: false, unchanged: false };
  const changed = storedPub !== newPub;
  return { firstSight: false, changed, unchanged: !changed };
}

// ----------------------------------------------------------------------------
//  Chiffrement des OCTETS d'un média (photo/fichier/vocal) — v1.1.256
//  Même clé de session AES-GCM que les messages, mais sur du binaire : les
//  octets chiffrés (iv‖ct) sont uploadés dans R2 → le serveur/R2 ne voit
//  jamais le contenu réel (avant : bytes en clair). IV 12 octets aléatoire.
// ----------------------------------------------------------------------------

export async function encryptBytes(convId, arrayBuffer) {
  const aesKey = sessionCache.get(convId);
  if (!aesKey) throw new Error('Pas de session pour cette conversation');
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    arrayBuffer,
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined.buffer;
}

export async function decryptBytes(convId, arrayBuffer) {
  const aesKey = sessionCache.get(convId);
  if (!aesKey) throw new Error('Pas de session pour cette conversation');
  const combined = new Uint8Array(arrayBuffer);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  );
}

// ----------------------------------------------------------------------------
//  Fingerprint (safety number — vérification visuelle)
// ----------------------------------------------------------------------------

export async function computeFingerprint(myPubKey, theirPubKey) {
  const myPubB64 = await exportPublicKey(myPubKey);
  const theirPubB64 = await exportPublicKey(theirPubKey);

  const combined = [myPubB64, theirPubB64].sort().join('|');
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(combined));
  const hex = bufToHex(hash);

  const short = hex.slice(0, 30);
  return short.match(/.{5}/g).join(' ');
}

// ----------------------------------------------------------------------------
//  Self-test
// ----------------------------------------------------------------------------

// Injection optionnelle (tests) pour couvrir 100% branches du selfTest défensif.
export async function selfTest(__deps = {}) {
  const _decrypt = __deps.decryptMessage || decryptMessage;
  const _unwrap = __deps.unwrapWithPin || unwrapWithPin;
  const _fp = __deps.computeFingerprint || computeFingerprint;
  try {
    const alice = await generateIdentityKeys();
    const bob = await generateIdentityKeys();

    const aliceShared = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const bobShared = await deriveSharedKey(bob.privateKey, alice.publicKey);

    const msg = 'Salut Bob, message ultra-sécurisé 🛡';
    const ct = await encryptMessage(msg, aliceShared);
    const decrypted = await _decrypt(ct, bobShared);

    if (decrypted !== msg) return { ok: false, reason: 'roundtrip-mismatch' };

    const exported = await exportPrivateKey(alice.privateKey);
    const wrapped = await wrapWithPin({ key: exported }, 'autotest-pin-0000');
    const unwrapped = await _unwrap(wrapped.ciphertext, wrapped.salt, 'autotest-pin-0000');
    if (unwrapped.key !== exported) return { ok: false, reason: 'pin-wrap-mismatch' };

    const fp1 = await _fp(alice.publicKey, bob.publicKey);
    const fp2 = await _fp(bob.publicKey, alice.publicKey);
    if (fp1 !== fp2) return { ok: false, reason: 'fingerprint-not-symmetric' };

    return { ok: true, fingerprint: fp1, message_test: decrypted };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ----------------------------------------------------------------------------
//  Compat browser : expose window.ApexCrypto pour code legacy <script defer>
// ----------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.ApexCrypto = {
    generateIdentityKeys,
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,
    deriveSharedKey,
    establishSession,
    getSessionKey,
    encryptForConv,
    decryptForConv,
    decideWire,
    checkKeyChange,
    ratchetInit,
    hasRatchet,
    ratchetEncrypt,
    ratchetDecrypt,
    ratchetExport,
    ratchetImport,
    resetRatchet,
    encryptBytes,
    decryptBytes,
    encryptMessage,
    decryptMessage,
    wrapWithPin,
    unwrapWithPin,
    computeFingerprint,
    selfTest,
    randomBytes,
    bufToB64,
    b64ToBuf,
    bufToHex,
  };
}
