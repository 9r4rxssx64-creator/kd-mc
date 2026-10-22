/**
 * Une clé par appareil (22.10.2026, Kevin : « une clé par appareil pour tous »).
 * Enveloppe « E2EM1: » : chaque appareil du destinataire ET de l'émetteur lit le message ; aucun autre.
 * Vrai WebCrypto (Node), vraies clés ECDH P-256 — aucune simulation du chiffrement.
 */
import { describe, it, expect } from 'vitest';
import * as C from '../../lib/crypto-core.js';

async function appareil(id) {
  const k = await C.generateIdentityKeys();
  return { d: id, priv: k.privateKey, pub: await C.exportPublicKey(k.publicKey) };
}
const tous = async () => ({
  kIphone: await appareil('kevin-iphone-0001'), kPc: await appareil('kevin-pc-00000002'),
  rIphone: await appareil('remy-iphone-0003'), intrus: await appareil('intrus-00000004'),
});
const envoi = (de, pour, texte, extra = {}) => C.mdevEncrypt(texte, {
  conv: 'conv-remy', fromDevice: de.d, fromPub: de.pub, myPrivateKey: de.priv,
  recipients: pour.map((x) => ({ d: x.d, pub: x.pub })), kind: 'm', id: 'm_1', ...extra,
});
const lire = (qui, raw, extra = {}) => C.mdevDecrypt(raw, { conv: 'conv-remy', myDevice: qui.d, myPrivateKey: qui.priv, ...extra });

describe('E2EM1 — un message privé lisible sur CHAQUE appareil, et seulement eux', () => {
  it('Kevin (iPhone) écrit à Rémy : Rémy, le PC de Kevin ET l\'iPhone de Kevin le lisent', async () => {
    const a = await tous();
    const raw = await envoi(a.kIphone, [a.rIphone, a.kPc, a.kIphone], 'Salut Rémy');
    expect(raw.startsWith('E2EM1:')).toBe(true);
    expect(raw).not.toContain('Salut');                                  // jamais le texte en clair
    for (const qui of [a.rIphone, a.kPc, a.kIphone]) {
      const r = await lire(qui, raw);
      expect(r.text).toBe('Salut Rémy');
      expect(r.fromDevice).toBe('kevin-iphone-0001');
      expect(r.fromPub).toBe(a.kIphone.pub);
    }
  });
  it('un appareil qui n\'est pas dans l\'enveloppe ne lit rien (pas d\'entrée pour lui)', async () => {
    const a = await tous();
    const raw = await envoi(a.kIphone, [a.rIphone], 'secret');
    await expect(lire(a.intrus, raw)).rejects.toMatchObject({ code: 'no_entry' });
  });
  it('un intrus qui prend l\'identifiant d\'un appareil destinataire sans sa clé privée échoue', async () => {
    const a = await tous();
    const raw = await envoi(a.kIphone, [a.rIphone], 'secret');
    await expect(lire({ d: a.rIphone.d, priv: a.intrus.priv }, raw)).rejects.toThrow();
  });
  it('enveloppe déplacée dans une autre conversation → refusée (liaison AAD)', async () => {
    const a = await tous();
    const raw = await envoi(a.kIphone, [a.rIphone], 'secret');
    await expect(C.mdevDecrypt(raw, { conv: 'autre-conv', myDevice: a.rIphone.d, myPrivateKey: a.rIphone.priv })).rejects.toThrow();
  });
  it('clé d\'émetteur remplacée dans l\'enveloppe (usurpation) → refusée', async () => {
    const a = await tous();
    const raw = await envoi(a.kIphone, [a.rIphone], 'secret');
    const body = JSON.parse(Buffer.from(raw.slice(6), 'base64').toString());
    body.fk = a.intrus.pub;
    const faux = 'E2EM1:' + Buffer.from(JSON.stringify(body)).toString('base64');
    await expect(lire(a.rIphone, faux)).rejects.toThrow();
  });
  it('édition : liée à l\'identifiant du message ÉDITÉ pris dans le contexte du destinataire (pas de rejeu sur un autre message)', async () => {
    const a = await tous();
    const raw = await envoi(a.kIphone, [a.rIphone], 'corrigé', { kind: 'e', id: 'm_42' });
    expect((await lire(a.rIphone, raw, { ctxId: 'm_42' })).text).toBe('corrigé');
    await expect(lire(a.rIphone, raw, { ctxId: 'm_43' })).rejects.toThrow();
    await expect(lire(a.rIphone, raw)).rejects.toThrow(/identifiant/);
  });
  it('garde-fous : conversation, appareil, identifiant, destinataires, plafond', async () => {
    const a = await tous();
    await expect(envoi(a.kIphone, [a.rIphone], 'x', { conv: '' })).rejects.toThrow(/conversation/);
    await expect(envoi({ ...a.kIphone, d: 'x' }, [a.rIphone], 'x')).rejects.toThrow(/émetteur/);
    await expect(envoi({ ...a.kIphone, d: undefined }, [a.rIphone], 'x')).rejects.toThrow(/émetteur/);
    await expect(envoi(a.kIphone, [a.rIphone], 'x', { id: '' })).rejects.toThrow(/identifiant/);
    await expect(envoi(a.kIphone, [a.rIphone], 'x', { kind: 'z' })).rejects.toThrow(/type/);
    await expect(envoi(a.kIphone, [], 'x')).rejects.toThrow(/aucun appareil/);
    const beaucoup = Array.from({ length: 25 }, (_, i) => ({ d: 'appareil-' + String(i).padStart(4, '0'), pub: a.rIphone.pub }));
    await expect(C.mdevEncrypt('x', { conv: 'c', fromDevice: a.kIphone.d, fromPub: a.kIphone.pub, myPrivateKey: a.kIphone.priv, recipients: beaucoup, id: 'm' })).rejects.toThrow(/trop/);
  });
  it('liste des destinataires : absente refusée, entrées vides ignorées, doublon emballé une seule fois, type « m » par défaut', async () => {
    const a = await tous();
    await expect(C.mdevEncrypt('x', { conv: 'c', fromDevice: a.kIphone.d, fromPub: a.kIphone.pub, myPrivateKey: a.kIphone.priv, id: 'm' })).rejects.toThrow(/aucun appareil/);
    const raw = await C.mdevEncrypt('double', { conv: 'conv-remy', fromDevice: a.kIphone.d, fromPub: a.kIphone.pub, myPrivateKey: a.kIphone.priv, id: 'm_1',
      recipients: [null, { pub: a.rIphone.pub }, { d: a.rIphone.d, pub: a.rIphone.pub }, { d: a.rIphone.d, pub: a.rIphone.pub }] });
    expect(Object.keys(C.parseMdev(raw).k)).toEqual([a.rIphone.d]);
    expect((await lire(a.rIphone, raw)).text).toBe('double');
  });
  it('lecture : préfixe et forme vérifiés', () => {
    expect(C.isMdevPayload('E2EM1:abc')).toBe(true);
    expect(C.isMdevPayload('E2E1:abc')).toBe(false);
    expect(() => C.parseMdev('E2E1:x')).toThrow();
    expect(() => C.parseMdev('E2EM1:' + Buffer.from(JSON.stringify({ v: 2 })).toString('base64'))).toThrow(/invalide/);
  });
  it('chaque message a sa propre clé : deux envois du même texte donnent deux chiffrés différents', async () => {
    const a = await tous();
    const x = await envoi(a.kIphone, [a.rIphone], 'pareil');
    const y = await envoi(a.kIphone, [a.rIphone], 'pareil');
    expect(x).not.toBe(y);
  });
});

describe('v1.1.345 — groupes : appareil signataire et appareil demandeur', () => {
  it('le message de groupe porte l\'appareil signataire (sd) seulement s\'il est signé et bien formé ; la lecture refuse un sd invalide', async () => {
    const sk = C.newGroupSenderKey(); const key = await C.importGroupSenderKey(sk.raw);
    const sig = await C.generateSigningKeys();
    const ctx = { conv: 'g', from: 'kevin', epoch: 1, kid: sk.kid, kind: 'm', mid: 'm1' };
    const signe = C.parseGroupWire(await C.groupEncrypt(key, 'x', { ...ctx, sd: 'dev-kevin-pc-0002' }, sig.privateKey)).body;
    expect(signe.sd).toBe('dev-kevin-pc-0002');
    expect(await C.groupVerifyMsg(sig.publicKey, signe, { conv: 'g', from: 'kevin', ctxId: 'm1' })).toBe(true);
    expect(C.parseGroupWire(await C.groupEncrypt(key, 'x', { ...ctx, sd: 'dev-kevin-pc-0002' })).body.sd).toBeUndefined();          // non signé : pas de sd
    expect(C.parseGroupWire(await C.groupEncrypt(key, 'x', { ...ctx, sd: 'x' }, sig.privateKey)).body.sd).toBeUndefined();            // forme invalide : ignoré
    const faux = 'E2EG1:' + Buffer.from(JSON.stringify({ ...signe, sd: 'pas bon !' })).toString('base64');
    expect(C.parseGroupWire(faux).body).toBe(null);
  });
  it('la demande de clé porte l\'appareil demandeur (d) s\'il est bien formé', () => {
    const lire = (w) => JSON.parse(Buffer.from(w.slice(C.GROUP_REQ_TAG.length), 'base64').toString());
    expect(lire(C.buildGroupKeyRequest({ from: 'kevin', sender: 'kevin', epoch: 1, kid: 'k', d: 'dev-kevin-pc-0002' })).d).toBe('dev-kevin-pc-0002');
    expect(lire(C.buildGroupKeyRequest({ from: 'kevin', sender: 'kevin', epoch: 1, kid: 'k', d: '!' })).d).toBeUndefined();
    expect(lire(C.buildGroupKeyRequest({ from: 'kevin', sender: 'kevin', epoch: 1, kid: 'k' })).d).toBeUndefined();
  });
});
