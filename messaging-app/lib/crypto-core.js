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
 *   - PBKDF2 SHA-256 600k iterations → derive key from PIN (v1.1.304 ; anciens wraps 100k relus
 *     puis ré-emballés à 600k au déverrouillage suivant, cf. lib/key-vault.js)
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
//  PIN wrap (PBKDF2-SHA256 → AES-GCM)
//  v1.1.304 (audit A3 P3) : 100 000 itérations (2010) → 600 000 (recommandation OWASP 2023 pour
//  PBKDF2-HMAC-SHA256). Le nombre d'itérations voyage AVEC le wrap ; un wrap sans ce champ est un
//  ancien wrap à 100 000 (relu tel quel, puis ré-emballé à 600 000 par l'appelant au déverrouillage).
//  Mesuré sous Node 22 (WebCrypto natif) : ~60 ms à 100k, ~350 ms à 600k par dérivation.
// ----------------------------------------------------------------------------

export const PIN_KDF_ITERATIONS = 600000;
export const PIN_KDF_LEGACY_ITERATIONS = 100000;

async function deriveKeyFromPin(pin, saltB64, iterations = PIN_KDF_ITERATIONS) {
  // Jamais MOINS que l'ancien réglage : un wrap altéré ne peut pas faire baisser le coût.
  if (!Number.isInteger(iterations) || iterations < PIN_KDF_LEGACY_ITERATIONS) throw new Error('pin-kdf-iterations');
  const salt = saltB64 ? new Uint8Array(b64ToBuf(saltB64)) : randomBytes(16);

  const pinKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
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
  return { ciphertext, salt, iterations: PIN_KDF_ITERATIONS };
}

// iterations : celui enregistré avec le wrap (key-vault passe 100 000 pour un ancien wrap sans champ).
export async function unwrapWithPin(ciphertext, salt, pin, iterations = PIN_KDF_ITERATIONS) {
  const { aesKey } = await deriveKeyFromPin(pin, salt, iterations);
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

// v1.1.294 — Résolution TOFU STRICTE de la clé d'un contact (parité Signal).
// Avant : une clé différente de la clé épinglée était adoptée SILENCIEUSEMENT
// (toast éphémère puis session refaite avec la nouvelle clé → un MITM côté
// serveur passait inaperçu). Désormais :
//   - pas de clé épinglée  → on épingle la clé vue (1ʳᵉ vue, aucune alerte) ;
//   - clé identique        → RAS ;
//   - clé DIFFÉRENTE       → on CONTINUE d'utiliser la clé épinglée, la nouvelle
//                            reste « en attente » jusqu'à acceptation EXPLICITE
//                            par l'utilisateur (après vérification du numéro).
// Fonction PURE (aucune crypto, aucun I/O).
//   → { use, pin, pending, alert }
//     use     : clé à utiliser pour la session (null si aucune) ;
//     pin     : clé à épingler maintenant (1ʳᵉ vue) ou null ;
//     pending : nouvelle clé NON acceptée (à présenter à l'utilisateur) ou null ;
//     alert   : true si l'utilisateur doit être averti.
export function resolvePeerKey(pinnedPub, freshPub) {
  const pinned = pinnedPub || null;
  const fresh = freshPub || null;
  if (!fresh) return { use: pinned, pin: null, pending: null, alert: false };
  if (!pinned) return { use: fresh, pin: fresh, pending: null, alert: false };
  if (pinned === fresh) return { use: pinned, pin: null, pending: null, alert: false };
  return { use: pinned, pin: null, pending: fresh, alert: true };
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
//  E2E de GROUPE — « Sender Keys » simplifiées (v1.1.296, parité WhatsApp/Signal)
//  Chaque membre a, par groupe et par ÉPOQUE, une clé d'envoi AES-GCM 256 bits
//  aléatoire. Ses messages de groupe sont chiffrés avec SA clé courante (IV
//  aléatoire de 12 octets par message, jamais réutilisé). La clé est distribuée
//  à chaque autre membre INDIVIDUELLEMENT, emballée par l'ECDH 1:1 (clé privée
//  d'identité de l'émetteur × clé publique d'identité du membre) dérivée avec un
//  HKDF DISTINCT de celui des DM (séparation de domaine). Les données associées
//  (AAD) lient chaque chiffré à (groupe, émetteur, [destinataire], époque, kid) :
//  un serveur ne peut ni réattribuer un message à un autre membre, ni rejouer
//  une clé emballée dans un autre groupe / une autre époque.
//  Formats sur le fil (champ `ciphertext`, relayé tel quel par le serveur) :
//    'E2EG1:'  + b64(JSON{v,epoch,kid,iv,ct})                  message de groupe (v1.1.296)
//    'E2EG1:'  + b64(JSON{v,epoch,kid,iv,ct,b:2,k,[mid]})      v1.1.297 : lié à l'identifiant
//    'E2EGK1:' + b64(JSON{v,from,epoch,kid,keys:[{to,iv,w}]})  distribution (jamais affichée)
//    'E2EGR1:' + b64(JSON{v,from,sender,epoch,kid})            demande de clé (jamais affichée)
// ----------------------------------------------------------------------------
export const GROUP_MSG_TAG = 'E2EG1:';
export const GROUP_KEY_TAG = 'E2EGK1:';
export const GROUP_REQ_TAG = 'E2EGR1:';
// Taille max d'UNE trame de distribution (le serveur refuse > 100 000 caractères).
export const GROUP_KEY_MSG_MAX = 60000;

// b64 d'octets par tranches (pas de String.fromCharCode(...60 000 args) : limite Safari).
function _bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function _jsonToB64(o) { return _bytesToB64(enc.encode(JSON.stringify(o))); }
function _b64ToJson(b64) { return JSON.parse(dec.decode(new Uint8Array(b64ToBuf(b64)))); }

export function groupAad(parts) {
  return enc.encode(['apex-grp-v1'].concat(parts.map(String)).join('|'));
}

// Clé d'emballage 1:1 pour la distribution des clés d'envoi (NON extractible).
export async function deriveGroupWrapKey(myPrivateKey, theirPublicKey) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirPublicKey }, myPrivateKey, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('apex-chat-group-v1'), info: enc.encode('sender-key-wrap') },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

// Nouvelle clé d'envoi : 32 octets aléatoires + identifiant (kid) aléatoire.
export function newGroupSenderKey() {
  return { raw: randomBytes(32), kid: bufToHex(randomBytes(8)) };
}

// Octets → CryptoKey AES-GCM NON extractible (aucun script ne relit les octets).
export function importGroupSenderKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function wrapGroupSenderKey(wrapKey, raw, aadParts) {
  const iv = randomBytes(12);
  const w = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: groupAad(aadParts) }, wrapKey, raw);
  return { iv: bufToB64(iv), w: bufToB64(w) };
}

// Déballe → CryptoKey NON extractible ; les octets en clair sont effacés aussitôt.
export async function unwrapGroupSenderKey(wrapKey, entry, aadParts) {
  const raw = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(entry.iv)), additionalData: groupAad(aadParts) },
    wrapKey, b64ToBuf(entry.w),
  ));
  try { return await importGroupSenderKey(raw); } finally { raw.fill(0); }
}

// v1.1.297 — LIAISON À L'IDENTIFIANT (format « b:2 ») : l'AAD lie AUSSI le type de
// trame et l'identifiant du message :
//   k:'m' (message)  → identifiant = `mid`, nonce choisi par l'émetteur, porté dans le corps ;
//   k:'e' (édition)  → identifiant = l'id du message ÉDITÉ, que le destinataire prend dans
//                      SON contexte (message_id de l'édition / id de la ligne d'historique),
//                      JAMAIS dans le corps → un serveur ne peut pas rejouer le chiffré d'un
//                      message X comme édition d'un message Y (même émetteur, même époque).
// Corps sans `b` = format v1.1.296 (AAD sans identifiant) : encore lu pour un message,
// refusé pour une édition (règle appliquée par l'appelant, cf. groupBoundId).
// signer (optionnel, v1.1.297) : clé privée ECDSA de l'appareil → signature `sg` du corps lié
// (cf. groupMsgSigParts) : l'émetteur est AUTHENTIFIÉ, pas seulement « détenteur de la clé ».
export async function groupEncrypt(senderKey, plaintext, { conv, from, epoch, kid, kind, mid, sd }, signer) {
  const iv = randomBytes(12); // IV FRAIS à chaque message (AES-GCM : jamais deux fois le même)
  const bound = kind === 'm' || kind === 'e';
  if (bound && (typeof mid !== 'string' || !mid)) throw new Error('identifiant de message requis');
  if (signer && !bound) throw new Error('signature : message lié requis');
  const parts = bound ? [conv, from, epoch, kid, kind, mid] : [conv, from, epoch, kid];
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: groupAad(parts) }, senderKey, enc.encode(plaintext),
  );
  const body = { v: 1, epoch, kid, iv: bufToB64(iv), ct: bufToB64(ct) };
  if (bound) { body.b = 2; body.k = kind; if (kind === 'm') body.mid = mid; }
  if (signer) body.sg = await groupSign(signer, groupMsgSigParts(body, { conv, from, ctxId: mid }));
  // v1.1.345 : appareil signataire (une clé de signature par appareil). Il ne fait que CHOISIR la clé de
  // vérification parmi les appareils déclarés de l'émetteur : un `sd` falsifié mène à un refus, jamais à un faux.
  if (signer && typeof sd === 'string' && _MDEV_ID.test(sd)) body.sd = sd;
  return GROUP_MSG_TAG + _jsonToB64(body);
}

// ----------------------------------------------------------------------------
//  AUTHENTICITÉ DE L'ÉMETTEUR (v1.1.297) — signature ECDSA P-256 / SHA-256 par appareil.
//  Sans elle, tout membre qui détient la clé d'envoi de A (tous les membres !) pouvait,
//  avec l'aide du serveur (sender_id), fabriquer un message « de A ». Désormais chaque
//  message (et chaque distribution de clé) porte `sg` = signature de A sur un encodage
//  CANONIQUE qui lie : type, groupe, émetteur, époque, kid, identifiant, IV et chiffré.
//  Clé privée NON extractible (IndexedDB, comme la clé d'identité) ; clé publique publiée
//  avec le bundle (préfixe « GSIG1: », capacité « gsig1 »), épinglée PAR MEMBRE (TOFU).
// ----------------------------------------------------------------------------
export const GROUP_SIG_PREFIX = 'GSIG1:';
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDSA_SIG = { name: 'ECDSA', hash: 'SHA-256' };

// Paire de signature : privée NON extractible (exportKey refuse), publique exportable.
export function generateSigningKeys() {
  return crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
}
export async function exportSigningPublicKey(publicKey) {
  return GROUP_SIG_PREFIX + bufToB64(await crypto.subtle.exportKey('raw', publicKey));
}
export function importSigningPublicKey(s) {
  if (typeof s !== 'string' || !s.startsWith(GROUP_SIG_PREFIX)) throw new Error('clé de signature invalide');
  return crypto.subtle.importKey('raw', b64ToBuf(s.slice(GROUP_SIG_PREFIX.length)), ECDSA, true, ['verify']);
}
// Encodage canonique : tableau JSON de chaînes, préfixé du domaine (aucune ambiguïté de découpage).
export function groupSigBytes(parts) {
  return enc.encode(JSON.stringify(['apex-grp-sig-v1'].concat(parts.map(String))));
}
export async function groupSign(privateKey, parts) {
  return bufToB64(await crypto.subtle.sign(ECDSA_SIG, privateKey, groupSigBytes(parts)));
}
// → true seulement si la signature est présente ET valide (jamais de levée).
export async function groupVerify(publicKey, sig, parts) {
  if (typeof sig !== 'string' || !sig) return false;
  try { return await crypto.subtle.verify(ECDSA_SIG, publicKey, b64ToBuf(sig), groupSigBytes(parts)); }
  catch { return false; }
}
// Message / édition : [k, groupe, émetteur, époque, kid, identifiant lié, iv, ct].
export function groupMsgSigParts(body, { conv, from, ctxId }) {
  return [body.k, conv, from, body.epoch, body.kid, groupBoundId(body, ctxId), body.iv, body.ct];
}
// Seul un corps LIÉ (b:2) peut être authentifié ; un contexte manquant → refus, jamais de levée.
export async function groupVerifyMsg(publicKey, body, ctx) {
  if (!body || body.b !== 2) return false;
  let parts;
  try { parts = groupMsgSigParts(body, ctx); } catch { return false; }
  return groupVerify(publicKey, body.sg, parts);
}
// Distribution : [k, groupe, émetteur, époque, kid, entrées emballées].
function _keySigParts(body, conv) {
  return ['k', conv, body.from, body.epoch, body.kid, JSON.stringify(body.keys)];
}
// Signe des trames de distribution (déjà découpées) ; +~130 caractères chacune (< 100 000).
export async function signGroupKeyMessages(privateKey, conv, wires) {
  const out = [];
  for (const w of wires) {
    const body = _b64ToJson(w.slice(GROUP_KEY_TAG.length));
    body.sg = await groupSign(privateKey, _keySigParts(body, conv));
    out.push(GROUP_KEY_TAG + _jsonToB64(body));
  }
  return out;
}
export function groupVerifyKey(publicKey, body, conv) {
  return groupVerify(publicKey, body.sg, _keySigParts(body, conv));
}

// Identifiant lié d'un corps « b:2 » : `mid` du corps (message) ou l'id du contexte
// (édition). null pour un corps v1.1.296 (non lié). Lève si le contexte manque.
export function groupBoundId(body, ctxId) {
  if (body.b !== 2) return null;
  const id = body.k === 'e' ? ctxId : body.mid;
  if (typeof id !== 'string' || !id) throw new Error('identifiant de contexte requis');
  return id;
}

export async function groupDecrypt(senderKey, body, { conv, from, ctxId }) {
  const id = groupBoundId(body, ctxId);
  const parts = id === null ? [conv, from, body.epoch, body.kid] : [conv, from, body.epoch, body.kid, body.k, id];
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(body.iv)), additionalData: groupAad(parts) },
    senderKey, b64ToBuf(body.ct),
  );
  return dec.decode(pt);
}

// Reconnaît une trame de groupe. → null (pas une trame de groupe) | { kind, body }
// body = null si la trame est malformée (l'appelant affiche une note, jamais le brut).
export function parseGroupWire(raw) {
  if (typeof raw !== 'string') return null;
  let kind = null; let tag = null;
  if (raw.startsWith(GROUP_MSG_TAG)) { kind = 'msg'; tag = GROUP_MSG_TAG; }
  else if (raw.startsWith(GROUP_KEY_TAG)) { kind = 'key'; tag = GROUP_KEY_TAG; }
  else if (raw.startsWith(GROUP_REQ_TAG)) { kind = 'req'; tag = GROUP_REQ_TAG; }
  if (!kind) return null;
  let body = null;
  try {
    const o = _b64ToJson(raw.slice(tag.length));
    if (o && typeof o === 'object' && o.v === 1 && Number.isInteger(o.epoch) && typeof o.kid === 'string' &&
        (o.sg === undefined || typeof o.sg === 'string') && (o.sd === undefined || (typeof o.sd === 'string' && _MDEV_ID.test(o.sd))) &&
        (o.b === undefined || (o.b === 2 && (o.k === 'e' || (o.k === 'm' && typeof o.mid === 'string' && o.mid !== ''))))) body = o;
  } catch { body = null; }
  return { kind, body };
}

// Distribution d'UNE clé d'envoi : entrées {to,iv,w} regroupées en trames de
// taille bornée (une seule trame pour un groupe ordinaire ; plusieurs au-delà).
export function buildGroupKeyMessages({ from, epoch, kid }, entries, maxLen = GROUP_KEY_MSG_MAX) {
  const wire = (keys) => GROUP_KEY_TAG + _jsonToB64({ v: 1, from, epoch, kid, keys });
  const out = [];
  let cur = [];
  for (const e of entries) {
    if (cur.length && wire(cur.concat([e])).length > maxLen) { out.push(wire(cur)); cur = []; }
    cur.push(e);
  }
  if (cur.length) out.push(wire(cur));
  return out;
}

export function buildGroupKeyRequest({ from, sender, epoch, kid, d }) {
  // v1.1.345 : `d` = appareil qui demande (un autre appareil du même compte peut demander ma clé d'envoi).
  const o = { v: 1, from, sender, epoch, kid };
  if (typeof d === 'string' && _MDEV_ID.test(d)) o.d = d;
  return GROUP_REQ_TAG + _jsonToB64(o);
}

// Décision PURE : le groupe peut-il être chiffré de bout en bout pour ce message ?
// statuses : [{ uid, status }] des AUTRES membres, status ∈ 'ok' | 'pending' | autre.
//   - 'ok'      → reçoit la clé d'envoi ;
//   - 'pending' → clé changée NON acceptée : ne reçoit PAS la clé (jamais adoptée en silence) ;
//   - autre     → aucune clé utilisable (pas publiée, appli trop ancienne) → le groupe
//                 n'est PAS prêt : chemin honnête « chiffré en transit » pour ce message.
// v1.1.304 (audit A3 P2) — opts.wasE2e : le groupe a DÉJÀ été chiffré de bout en bout (preuve
// LOCALE : ma clé d'envoi existe, ou un message de groupe chiffré a été lu sur cet appareil). Un
// membre sans clé ne fait alors JAMAIS redescendre tout le groupe en clair (ce serait une décision
// du serveur, qui choisit ce que contient le bundle) : il est EXCLU de la distribution, comme une
// clé changée non acceptée, et l'appelant le dit à l'expéditeur (`excluded`).
export function groupReadiness(statuses, opts) {
  const recipients = []; const pending = []; const missing = [];
  for (const s of statuses) {
    if (s.status === 'ok') recipients.push(s.uid);
    else if (s.status === 'pending') pending.push(s.uid);
    else missing.push(s.uid);
  }
  const base = { ready: missing.length === 0, recipients, pending, missing };
  if (missing.length && opts && opts.wasE2e === true) return { ...base, ready: true, excluded: missing.slice() };
  return base;
}

// Nouvelle époque nécessaire ? (1ᵉʳ envoi, ou liste des membres changée : ajout/retrait)
export function groupNeedsRotation(own, members) {
  if (!own || !Array.isArray(own.members)) return true;
  const a = own.members.slice().sort().join('\n');
  const b = members.slice().sort().join('\n');
  return a !== b;
}

// ----------------------------------------------------------------------------
//  Pièce jointe de GROUPE (v1.1.297) — les OCTETS du fichier, chiffrés de bout en bout.
//  Clé AES-GCM 256 FRAÎCHE et ALÉATOIRE par fichier (jamais la clé d'envoi du groupe),
//  IV aléatoire de 12 octets, AAD de domaine. Le stockage (R2) ne reçoit que le chiffré.
//  La clé, l'IV et l'empreinte SHA-256 du chiffré voyagent DANS le message de groupe
//  (lui-même chiffré E2EG1) ; au téléchargement : empreinte vérifiée PUIS déchiffrement
//  (le tag GCM authentifie en plus le clair) — un octet modifié → erreur, jamais de contenu.
// ----------------------------------------------------------------------------
const GROUP_FILE_AAD = enc.encode('apex-grp-file-v1');

export async function encryptGroupFile(data) {
  const raw = randomBytes(32);
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const k = bufToB64(raw);
  raw.fill(0);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: GROUP_FILE_AAD }, key, data);
  const h = bufToB64(await crypto.subtle.digest('SHA-256', ct));
  return { ct, k, i: bufToB64(iv), h };
}

export async function decryptGroupFile(ctBuf, meta) {
  if (!meta || typeof meta.k !== 'string' || typeof meta.i !== 'string' || typeof meta.h !== 'string') {
    throw new Error('clé de pièce jointe absente');
  }
  const h = bufToB64(await crypto.subtle.digest('SHA-256', ctBuf));
  if (h !== meta.h) throw new Error('pièce jointe altérée (empreinte différente)');
  const key = await crypto.subtle.importKey('raw', b64ToBuf(meta.k), { name: 'AES-GCM' }, false, ['decrypt']);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(meta.i)), additionalData: GROUP_FILE_AAD }, key, ctBuf,
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
    const unwrapped = await _unwrap(wrapped.ciphertext, wrapped.salt, 'autotest-pin-0000', wrapped.iterations);
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
//  UNE CLÉ PAR APPAREIL (22.10.2026, Kevin : « une clé par appareil pour tous »)
//  Avant : UNE clé publique par compte, celle du dernier appareil ouvert → un message
//  reçu n'était lisible que sur cet appareil (« impossible à lire sur cet appareil »).
//  « E2EM1: » = enveloppe multi-appareils d'un message privé :
//   - une clé de contenu AES-GCM 256 aléatoire PAR message chiffre le texte ;
//   - cette clé est emballée pour CHAQUE appareil du destinataire ET chaque appareil de
//     l'émetteur (ECDH clé de MON appareil × clé de SON appareil, HKDF, AES-GCM) ;
//   - l'emballage est lié (AAD) à : conversation, appareil émetteur, appareil destinataire,
//     type de trame et identifiant du message (un serveur ne peut ni déplacer l'enveloppe
//     d'une conversation à l'autre, ni la rejouer comme édition d'un autre message).
// ----------------------------------------------------------------------------
export const MDEV_TAG = 'E2EM1:';
export const MDEV_MAX_DEVICES = 24;
const _MDEV_ID = /^[A-Za-z0-9_-]{8,64}$/;

function _mdevParts(conv, fromDevice, toDevice, kind, id) {
  return ['mdev1', conv, fromDevice, toDevice, kind, id];
}

export function isMdevPayload(raw) {
  return typeof raw === 'string' && raw.indexOf(MDEV_TAG) === 0;
}

export function parseMdev(raw) {
  if (!isMdevPayload(raw)) throw new Error('pas une enveloppe E2EM1');
  const o = _b64ToJson(raw.slice(MDEV_TAG.length));
  if (!o || o.v !== 1 || typeof o.fd !== 'string' || !_MDEV_ID.test(o.fd) || typeof o.fk !== 'string'
    || typeof o.ct !== 'string' || !o.k || typeof o.k !== 'object' || (o.t !== 'm' && o.t !== 'e')) {
    throw new Error('enveloppe E2EM1 invalide');
  }
  return o;
}

// recipients : [{ d: identifiant d'appareil, pub: clé publique (JWK b64) }]
// { conv, fromDevice, fromPub, myPrivateKey, kind: 'm' | 'e', id }
export async function mdevEncrypt(plaintext, { conv, fromDevice, fromPub, myPrivateKey, recipients, kind = 'm', id }) {
  if (typeof conv !== 'string' || !conv) throw new Error('conversation requise');
  if (!_MDEV_ID.test(String(fromDevice || ''))) throw new Error('appareil émetteur invalide');
  if (kind !== 'm' && kind !== 'e') throw new Error('type de trame invalide');
  if (typeof id !== 'string' || !id) throw new Error('identifiant de message requis');
  const list = (recipients || []).filter((r) => r && _MDEV_ID.test(String(r.d || '')) && typeof r.pub === 'string' && r.pub);
  if (!list.length) throw new Error('aucun appareil destinataire');
  if (list.length > MDEV_MAX_DEVICES) throw new Error('trop d\'appareils');
  const raw = randomBytes(32);
  try {
    const contentKey = await importGroupSenderKey(raw);
    const iv = randomBytes(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: groupAad(['mdev1-ct', conv, fromDevice, kind, id]) },
      contentKey, enc.encode(plaintext));
    const k = {};
    for (const r of list) {
      if (k[r.d]) continue;
      const wk = await deriveGroupWrapKey(myPrivateKey, await importPublicKey(r.pub));
      k[r.d] = await wrapGroupSenderKey(wk, raw, _mdevParts(conv, fromDevice, r.d, kind, id));
    }
    const body = { v: 1, t: kind, fd: fromDevice, fk: fromPub, iv: bufToB64(iv), ct: bufToB64(ct), k };
    if (kind === 'm') body.mid = id;
    return MDEV_TAG + _jsonToB64(body);
  } finally { raw.fill(0); }
}

// L'identifiant lié : pour un message, celui porté par l'enveloppe ; pour une édition, celui
// du message ÉDITÉ pris dans le CONTEXTE du destinataire (jamais dans le corps).
export function mdevBoundId(body, ctxId) {
  const id = body.t === 'e' ? ctxId : body.mid;
  if (typeof id !== 'string' || !id) throw new Error('identifiant de contexte requis');
  return id;
}

// { conv, myDevice, myPrivateKey, ctxId } → { text, fromDevice, fromPub }
export async function mdevDecrypt(raw, { conv, myDevice, myPrivateKey, ctxId }) {
  const body = parseMdev(raw);
  const entry = body.k[myDevice];
  if (!entry) { const e = new Error('pas pour cet appareil'); e.code = 'no_entry'; throw e; }
  const id = mdevBoundId(body, ctxId);
  const wk = await deriveGroupWrapKey(myPrivateKey, await importPublicKey(body.fk));
  const contentKey = await unwrapGroupSenderKey(wk, entry, _mdevParts(conv, body.fd, myDevice, body.t, id));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(body.iv)), additionalData: groupAad(['mdev1-ct', conv, body.fd, body.t, id]) },
    contentKey, b64ToBuf(body.ct));
  return { text: dec.decode(pt), fromDevice: body.fd, fromPub: body.fk };
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
    resolvePeerKey,
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
    PIN_KDF_ITERATIONS,
    PIN_KDF_LEGACY_ITERATIONS,
    computeFingerprint,
    GROUP_MSG_TAG,
    GROUP_KEY_TAG,
    GROUP_REQ_TAG,
    GROUP_KEY_MSG_MAX,
    groupAad,
    deriveGroupWrapKey,
    newGroupSenderKey,
    importGroupSenderKey,
    wrapGroupSenderKey,
    unwrapGroupSenderKey,
    groupEncrypt,
    groupDecrypt,
    groupBoundId,
    parseGroupWire,
    buildGroupKeyMessages,
    buildGroupKeyRequest,
    groupReadiness,
    groupNeedsRotation,
    encryptGroupFile,
    decryptGroupFile,
    GROUP_SIG_PREFIX,
    generateSigningKeys,
    exportSigningPublicKey,
    importSigningPublicKey,
    groupSigBytes,
    groupSign,
    groupVerify,
    groupMsgSigParts,
    groupVerifyMsg,
    signGroupKeyMessages,
    groupVerifyKey,
    selfTest,
    MDEV_TAG,
    isMdevPayload,
    parseMdev,
    mdevEncrypt,
    mdevDecrypt,
    mdevBoundId,
    randomBytes,
    bufToB64,
    b64ToBuf,
    bufToHex,
  };
}
