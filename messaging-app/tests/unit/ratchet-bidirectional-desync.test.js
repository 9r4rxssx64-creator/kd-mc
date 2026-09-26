/**
 * RÉGRESSION — bug « 🔒 Message chiffré (E2E) — impossible à lire sur cet
 * appareil » (capture Kevin, v1.1.266). Prouve la CAUSE RACINE et le CORRECTIF.
 *
 * CAUSE : le ratchet (E2E2) de crypto-core.js utilise UNE seule chaîne `ck`
 * partagée que ratchetEncrypt ET ratchetDecrypt font tous deux avancer. Dès que
 * les DEUX correspondants écrivent (cas normal d'une vraie conversation), chacun
 * fait avancer la chaîne en chiffrant → la position de déchiffrement de l'autre
 * ne correspond plus → AES-GCM échoue. Un vrai Double Ratchet exige des chaînes
 * d'ENVOI et de RÉCEPTION séparées.
 *
 * CORRECTIF (index.html v1.1.267) : K._ratchetOn() renvoie toujours false → tous
 * les messages passent par l'E2E1 SANS ÉTAT (clé partagée ECDH + IV par message),
 * qui est déchiffrable dans n'importe quel ordre, dans les deux sens, après reload.
 *
 * On importe le VRAI module crypto de prod (lib/crypto-core.js, couvert 100 %).
 */
import { describe, it, expect } from 'vitest';
import {
  generateIdentityKeys,
  exportPublicKey,
  importPublicKey,
  establishSession,
  encryptForConv,
  decryptForConv,
  ratchetInit,
  ratchetEncrypt,
  ratchetDecrypt,
} from '../../lib/crypto-core.js';

// 2 « téléphones » indépendants (paires ECDH distinctes). Comme le test 2-tel,
// chacun a SON convId (= son propre cache d'état) pour simuler 2 appareils dans
// le même processus. La clé/racine dérivée (ECDH) est identique des 2 côtés.
async function pair(convA, convB) {
  const A = await generateIdentityKeys();
  const B = await generateIdentityKeys();
  const pubA = await importPublicKey(await exportPublicKey(A.publicKey));
  const pubB = await importPublicKey(await exportPublicKey(B.publicKey));
  return { A, B, pubA, pubB, convA, convB };
}

describe('🔗 Ratchet E2E2 — désync bidirectionnelle (bug reproduit)', () => {
  it('les DEUX envoient « en même temps » → le pair ne peut PLUS déchiffrer (chaîne partagée)', async () => {
    const { A, B, pubA, pubB } = await pair('rchA', 'rchB');
    // Comme l'app : chaque appareil init son ratchet depuis (ma privée, pub du pair).
    // ECDH symétrique → racine `ck0` IDENTIQUE des deux côtés.
    await ratchetInit('rchA', A.privateKey, pubB);
    await ratchetInit('rchB', B.privateKey, pubA);

    // Envoi « simultané » : chacun chiffre son 1ᵉʳ message (n=0). En chiffrant,
    // CHACUN fait avancer sa copie de la chaîne partagée.
    const fromA = await ratchetEncrypt('rchA', 'coucou de A'); // {n:0}
    const fromB = await ratchetEncrypt('rchB', 'coucou de B'); // {n:0}
    expect(fromA.n).toBe(0);
    expect(fromB.n).toBe(0);

    // A tente de déchiffrer le message de B : sa chaîne a DÉJÀ avancé (par son
    // propre envoi) → mauvaise clé → rejet. C'EST le « impossible à lire ».
    await expect(ratchetDecrypt('rchA', fromB.n, fromB.ct)).rejects.toBeTruthy();
    // Symétrique côté B.
    await expect(ratchetDecrypt('rchB', fromA.n, fromA.ct)).rejects.toBeTruthy();
  });
});

describe('🛡 E2E1 stateless — tient le MÊME scénario (correctif)', () => {
  it('envoi simultané des 2 côtés → chacun déchiffre correctement', async () => {
    const { A, B, pubA, pubB } = await pair('s1A', 's1B');
    await establishSession('s1A', A.privateKey, pubB);
    await establishSession('s1B', B.privateKey, pubA);

    const ctA = await encryptForConv('s1A', 'coucou de A'); // A chiffre
    const ctB = await encryptForConv('s1B', 'coucou de B'); // B chiffre "en même temps"

    // Aucun état de chaîne à désynchroniser → les 2 sens déchiffrent.
    expect(await decryptForConv('s1B', ctA)).toBe('coucou de A');
    expect(await decryptForConv('s1A', ctB)).toBe('coucou de B');
  });

  it('messages hors-ordre / multiples du même côté → tous déchiffrables', async () => {
    const { A, B, pubA, pubB } = await pair('s2A', 's2B');
    await establishSession('s2A', A.privateKey, pubB);
    await establishSession('s2B', B.privateKey, pubA);

    // A envoie 3 messages d'affilée (cas « Hello » + GIF + ... de la capture).
    const m1 = await encryptForConv('s2A', 'un');
    const m2 = await encryptForConv('s2A', 'deux');
    const m3 = await encryptForConv('s2A', 'trois');
    // B les reçoit DANS LE DÉSORDRE → toujours OK (pas d'état de chaîne).
    expect(await decryptForConv('s2B', m3)).toBe('trois');
    expect(await decryptForConv('s2B', m1)).toBe('un');
    expect(await decryptForConv('s2B', m2)).toBe('deux');
  });

  it('après « reload » (nouvelle session depuis les mêmes clés) → toujours déchiffrable', async () => {
    const { A, B, pubA, pubB } = await pair('s3A', 's3B');
    await establishSession('s3A', A.privateKey, pubB);
    await establishSession('s3B', B.privateKey, pubA);
    const ct = await encryptForConv('s3A', 'message d\'avant reload');

    // « Reload » de B : on réétablit la session depuis ses clés persistées.
    await establishSession('s3B', B.privateKey, pubA);
    expect(await decryptForConv('s3B', ct)).toBe('message d\'avant reload');
  });
});
