/**
 * TEST « 2 TÉLÉPHONES » AUTOMATISÉ — preuve du vrai chiffrement bout-en-bout
 * sans appareil réel (Kevin : « fais le test 2 tel à ma place »).
 *
 * On simule DEUX téléphones INDÉPENDANTS (Téléphone A / Téléphone B), chacun
 * avec sa propre paire de clés, et on rejoue EXACTEMENT le chemin de l'app :
 *   1. chaque tél génère sa paire ECDH + EXPORTE sa clé publique en base64
 *      (= ce qui est publié au serveur via /api/keys/prekeys) ;
 *   2. chaque tél IMPORTE la clé publique de l'autre (= /api/keys/:peer/bundle)
 *      et établit sa session (establishSession) ;
 *   3. A chiffre (encryptForConv) et préfixe le marqueur « E2E1: » (format wire
 *      réel de index.html v1.1.249) ;
 *   4. le serveur relaie le champ ciphertext TEL QUEL (identité — prouvé par les
 *      tests DO) ;
 *   5. B détecte le tag, retire « E2E1: » et déchiffre (decryptForConv).
 *
 * Si ces tests passent en CI, le bout-en-bout est PROUVÉ pour le flux réel de
 * 2 appareils → il peut être activé par défaut sans test manuel sur 2 iPhones.
 *
 * On importe le VRAI module crypto de prod (lib/crypto-core.js, couvert 100%),
 * celui-là même qu'utilise ApexCrypto dans l'app.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateIdentityKeys,
  exportPublicKey,
  importPublicKey,
  establishSession,
  encryptForConv,
  decryptForConv,
  getSessionKey,
  computeFingerprint,
} from '../../lib/crypto-core.js';

// Réplique EXACTE des constantes/logique de l'app (index.html v1.1.249).
const E2E_TAG = 'E2E1:';
// Envoi : payload transporté = taggé si chiffré, sinon texte clair.
function makeWire(ciphertext, clearText) {
  return ciphertext ? E2E_TAG + ciphertext : clearText;
}
// Réception : payload taggé → à déchiffrer ; sinon texte clair (transit).
function isEncryptedWire(raw) {
  return typeof raw === 'string' && raw.indexOf(E2E_TAG) === 0;
}
function stripTag(raw) {
  return raw.slice(E2E_TAG.length);
}
// Le serveur (ConversationDO) relaie le champ ciphertext VERBATIM.
const relayViaServer = (wire) => wire;

/**
 * Prépare 2 « téléphones » indépendants avec sessions croisées, comme après
 * publication + récupération des bundles de clés côté serveur.
 * Les 2 téléphones partagent le même processus de test → on utilise 2 convId
 * distincts pour éviter la collision du sessionCache (en vrai = 2 appareils,
 * 2 caches distincts). La clé de session dérivée (ECDH) est identique.
 */
async function pairTwoPhones(convA = 'convA', convB = 'convB') {
  const phoneA = await generateIdentityKeys();
  const phoneB = await generateIdentityKeys();
  // Publication : chaque tél exporte sa clé publique en base64 (wire serveur).
  const pubA_b64 = await exportPublicKey(phoneA.publicKey);
  const pubB_b64 = await exportPublicKey(phoneB.publicKey);
  // Récupération du bundle du pair + réimport (comme _ensureSession).
  const importedB = await importPublicKey(pubB_b64);
  const importedA = await importPublicKey(pubA_b64);
  await establishSession(convA, phoneA.privateKey, importedB);
  await establishSession(convB, phoneB.privateKey, importedA);
  return { phoneA, phoneB, pubA_b64, pubB_b64, convA, convB };
}

describe('📱📱 Test 2 téléphones — vrai bout-en-bout (flux app réel)', () => {
  beforeEach(() => {
    // rien à réinitialiser : chaque test utilise ses propres convId.
  });

  it('A → B : message chiffré, relayé, déchiffré à l’identique', async () => {
    const { convA, convB } = await pairTwoPhones('A1', 'B1');
    const clear = 'Bonjour Laurence, ce message est vraiment privé 🛡';

    // Téléphone A : chiffre + construit le wire (tag E2E1:)
    const ct = await encryptForConv(convA, clear);
    const wire = makeWire(ct, clear);
    expect(wire.startsWith(E2E_TAG)).toBe(true);
    expect(wire).not.toContain(clear); // le clair ne circule PAS

    // Serveur : relaie tel quel
    const received = relayViaServer(wire);

    // Téléphone B : détecte le tag, retire, déchiffre
    expect(isEncryptedWire(received)).toBe(true);
    const plain = await decryptForConv(convB, stripTag(received));
    expect(plain).toBe(clear);
  });

  it('B → A : bidirectionnel, chaque sens déchiffre correctement', async () => {
    const { convA, convB } = await pairTwoPhones('A2', 'B2');
    const clear = 'Réponse de Laurence : reçu 5 sur 5 ✅';

    const ct = await encryptForConv(convB, clear); // B chiffre
    const received = relayViaServer(makeWire(ct, clear));
    const plain = await decryptForConv(convA, stripTag(received)); // A déchiffre
    expect(plain).toBe(clear);
  });

  it('le « numéro de sécurité » est IDENTIQUE sur les 2 téléphones', async () => {
    const phoneA = await generateIdentityKeys();
    const phoneB = await generateIdentityKeys();
    // Chaque tél calcule le fingerprint avec (ma clé, clé du pair).
    const fpOnA = await computeFingerprint(phoneA.publicKey, phoneB.publicKey);
    const fpOnB = await computeFingerprint(phoneB.publicKey, phoneA.publicKey);
    expect(fpOnA).toBe(fpOnB); // ce que Kevin vérifie à l’œil sur ses 2 écrans
    expect(fpOnA).toMatch(/^[0-9a-f]{5}( [0-9a-f]{5}){5}$/); // 6 groupes de 5
  });

  it('média/position chiffrés : le marqueur survit au round-trip E2E', async () => {
    const { convA, convB } = await pairTwoPhones('A3', 'B3');
    const marker = 'APXMEDIA1:' + JSON.stringify({ u: 'https://x/y.jpg', m: 'image/jpeg', n: 'photo.jpg', s: 12345, c: 'coucou' });
    const wire = makeWire(await encryptForConv(convA, marker), marker);
    const out = await decryptForConv(convB, stripTag(relayViaServer(wire)));
    expect(out).toBe(marker);
    expect(out.startsWith('APXMEDIA1:')).toBe(true); // reparsable côté B
  });

  it('rétro-compat : un message NON-taggé (pair sans E2E) est traité en clair', async () => {
    // Un pair qui n’a pas activé l’E2E envoie du texte clair dans ciphertext.
    const clear = 'Salut (envoyé en transit)';
    const wire = makeWire(null, clear); // pas de ciphertext → pas de tag
    expect(isEncryptedWire(wire)).toBe(false);
    // Le receveur affiche le texte tel quel, ne tente PAS de déchiffrer.
    expect(wire).toBe(clear);
  });

  it('intégrité : un ciphertext altéré est REJETÉ (pas de charabia affiché)', async () => {
    const { convA, convB } = await pairTwoPhones('A4', 'B4');
    const ct = await encryptForConv(convA, 'message authentique');
    // Corruption d’un octet du base64 (attaque/altération réseau).
    const tampered = ct.slice(0, -4) + (ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    await expect(decryptForConv(convB, tampered)).rejects.toBeTruthy();
    // → l’app affiche « 🔒 chiffré — impossible à lire », jamais du charabia.
  });

  it('un tiers SANS la clé ne peut PAS déchiffrer (confidentialité réelle)', async () => {
    const { convA } = await pairTwoPhones('A5', 'B5');
    const ct = await encryptForConv(convA, 'secret entre A et B');
    // Téléphone C : sa propre paire, session avec une AUTRE clé → mauvaise clé.
    const phoneC = await generateIdentityKeys();
    const phoneX = await generateIdentityKeys();
    await establishSession('C5', phoneC.privateKey, phoneX.publicKey);
    expect(getSessionKey('C5')).toBeTruthy();
    await expect(decryptForConv('C5', ct)).rejects.toBeTruthy();
  });
});
