// @vitest-environment node
// Garde E2E de GROUPE (v1.1.296) — primitives « Sender Keys » de lib/crypto-core.js.
//
// VRAIE WebCrypto de Node (ECDH P-256, HKDF, AES-GCM). Couvre 100 % des branches ajoutées
// (le plancher de couverture de lib/crypto-core.js est 100 %).
//
// Discriminant : CLIENT_CRYPTO_PATH=<copie sabotée de lib/crypto-core.js> fait échouer
// la section concernée (IV figé → « IV unique » ; clé extractible → « non extractible » ;
// AAD retirée → « liaison au contexte » ; découpage retiré → « taille bornée »).
import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';

const CC = await import(process.env.CLIENT_CRYPTO_PATH
  ? pathToFileURL(process.env.CLIENT_CRYPTO_PATH).href
  : '../../lib/crypto-core.js');

async function pair() {
  const k = await CC.generateIdentityKeys();
  return k;
}
const ctx = { conv: 'g1', from: 'alice', epoch: 1, kid: 'k1' };
const b64json = (s, tag) => JSON.parse(Buffer.from(s.slice(tag.length), 'base64').toString('utf8'));

describe('E2E de groupe — clés d\'envoi', () => {
  it('nouvelle clé : 32 octets aléatoires, kid aléatoire, CryptoKey NON extractible', async () => {
    const a = CC.newGroupSenderKey();
    const b = CC.newGroupSenderKey();
    expect(a.raw).toBeInstanceOf(Uint8Array);
    expect(a.raw.length).toBe(32);
    expect(a.kid).toMatch(/^[0-9a-f]{16}$/);
    expect(a.kid).not.toBe(b.kid);
    expect(Buffer.from(a.raw).equals(Buffer.from(b.raw))).toBe(false);
    const key = await CC.importGroupSenderKey(a.raw);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('aller-retour chiffrement / déchiffrement + format E2EG1', async () => {
    const { raw } = CC.newGroupSenderKey();
    const key = await CC.importGroupSenderKey(raw);
    const wire = await CC.groupEncrypt(key, 'bonjour le groupe 🛡', ctx);
    expect(wire.startsWith(CC.GROUP_MSG_TAG)).toBe(true);
    expect(wire).not.toContain('bonjour');
    const p = CC.parseGroupWire(wire);
    expect(p.kind).toBe('msg');
    expect(p.body).toMatchObject({ v: 1, epoch: 1, kid: 'k1' });
    expect(await CC.groupDecrypt(key, p.body, { conv: 'g1', from: 'alice' })).toBe('bonjour le groupe 🛡');
  });

  it('IV FRAIS à chaque message (1000 messages, aucun IV répété, chiffrés tous différents)', async () => {
    const key = await CC.importGroupSenderKey(CC.newGroupSenderKey().raw);
    const ivs = new Set();
    const cts = new Set();
    for (let i = 0; i < 1000; i++) {
      const body = CC.parseGroupWire(await CC.groupEncrypt(key, 'même texte', ctx)).body;
      expect(Buffer.from(body.iv, 'base64').length).toBe(12);
      ivs.add(body.iv); cts.add(body.ct);
    }
    expect(ivs.size).toBe(1000);
    expect(cts.size).toBe(1000);
  });

  it('liaison au contexte (AAD) : autre émetteur / groupe / époque / kid → refus', async () => {
    const key = await CC.importGroupSenderKey(CC.newGroupSenderKey().raw);
    const body = CC.parseGroupWire(await CC.groupEncrypt(key, 'x', ctx)).body;
    await expect(CC.groupDecrypt(key, body, { conv: 'g1', from: 'bob' })).rejects.toThrow();
    await expect(CC.groupDecrypt(key, body, { conv: 'g2', from: 'alice' })).rejects.toThrow();
    await expect(CC.groupDecrypt(key, { ...body, epoch: 2 }, { conv: 'g1', from: 'alice' })).rejects.toThrow();
    await expect(CC.groupDecrypt(key, { ...body, kid: 'k2' }, { conv: 'g1', from: 'alice' })).rejects.toThrow();
    const other = await CC.importGroupSenderKey(CC.newGroupSenderKey().raw);
    await expect(CC.groupDecrypt(other, body, { conv: 'g1', from: 'alice' })).rejects.toThrow();
    expect(new TextDecoder().decode(CC.groupAad(['g', 'a', 1, 'k']))).toBe('apex-grp-v1|g|a|1|k');
  });
});

describe('E2E de groupe — distribution emballée par l\'ECDH 1:1', () => {
  it('seul le destinataire visé déballe ; clé déballée NON extractible et fonctionnelle', async () => {
    const alice = await pair(); const bob = await pair(); const eve = await pair();
    const { raw } = CC.newGroupSenderKey();
    const aliceKey = await CC.importGroupSenderKey(raw);
    const aad = ['g1', 'alice', 'bob', 1, 'k1'];
    const wkA = await CC.deriveGroupWrapKey(alice.privateKey, bob.publicKey);
    expect(wkA.extractable).toBe(false);
    const entry = await CC.wrapGroupSenderKey(wkA, raw, aad);
    const wkB = await CC.deriveGroupWrapKey(bob.privateKey, alice.publicKey);
    const got = await CC.unwrapGroupSenderKey(wkB, entry, aad);
    expect(got.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', got)).rejects.toThrow();
    const wire = await CC.groupEncrypt(aliceKey, 'salut', ctx);
    expect(await CC.groupDecrypt(got, CC.parseGroupWire(wire).body, { conv: 'g1', from: 'alice' })).toBe('salut');
    // un tiers (autre clé d'identité) ne déballe pas
    const wkE = await CC.deriveGroupWrapKey(eve.privateKey, alice.publicKey);
    await expect(CC.unwrapGroupSenderKey(wkE, entry, aad)).rejects.toThrow();
    // rejouée vers un autre destinataire / groupe / époque → refus (AAD)
    await expect(CC.unwrapGroupSenderKey(wkB, entry, ['g1', 'alice', 'carol', 1, 'k1'])).rejects.toThrow();
    await expect(CC.unwrapGroupSenderKey(wkB, entry, ['g2', 'alice', 'bob', 1, 'k1'])).rejects.toThrow();
    await expect(CC.unwrapGroupSenderKey(wkB, entry, ['g1', 'alice', 'bob', 2, 'k1'])).rejects.toThrow();
    // emballage : IV frais à chaque fois
    const e2 = await CC.wrapGroupSenderKey(wkA, raw, aad);
    expect(e2.iv).not.toBe(entry.iv);
  });

  it('séparation de domaine : la clé d\'emballage de groupe ≠ la clé de session DM', async () => {
    const alice = await pair(); const bob = await pair();
    const dm = await CC.deriveSharedKey(alice.privateKey, bob.publicKey);
    const wk = await CC.deriveGroupWrapKey(alice.privateKey, bob.publicKey);
    const iv = new Uint8Array(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wk, new Uint8Array([1, 2, 3]));
    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dm, ct)).rejects.toThrow();
  });

  it('trames de distribution : petites, regroupées, découpées sous la limite serveur (100 000)', () => {
    expect(CC.buildGroupKeyMessages({ from: 'a', epoch: 1, kid: 'k' }, [])).toEqual([]);
    const entry = (i) => ({ to: 'user_' + String(i).padStart(6, '0'), iv: 'A'.repeat(16), w: 'B'.repeat(64) });
    const one = CC.buildGroupKeyMessages({ from: 'a', epoch: 1, kid: 'k' }, [entry(1), entry(2)]);
    expect(one).toHaveLength(1);
    expect(one[0].length).toBeLessThan(1000);
    const body = CC.parseGroupWire(one[0]);
    expect(body.kind).toBe('key');
    expect(body.body.keys.map((e) => e.to)).toEqual(['user_000001', 'user_000002']);
    // 1500 membres → plusieurs trames, chacune ≤ GROUP_KEY_MSG_MAX, aucune entrée perdue
    const many = Array.from({ length: 1500 }, (_, i) => entry(i));
    const wires = CC.buildGroupKeyMessages({ from: 'a', epoch: 3, kid: 'k' }, many);
    expect(wires.length).toBeGreaterThan(1);
    for (const w of wires) expect(w.length).toBeLessThanOrEqual(CC.GROUP_KEY_MSG_MAX);
    expect(CC.GROUP_KEY_MSG_MAX).toBeLessThan(100000);
    const all = wires.flatMap((w) => CC.parseGroupWire(w).body.keys.map((e) => e.to));
    expect(all).toEqual(many.map((e) => e.to));
    // limite explicite
    const small = CC.buildGroupKeyMessages({ from: 'a', epoch: 1, kid: 'k' }, [entry(1), entry(2), entry(3)], 300);
    expect(small).toHaveLength(3);
  });

  it('demande de clé E2EGR1', () => {
    const w = CC.buildGroupKeyRequest({ from: 'bob', sender: 'alice', epoch: 2, kid: 'kk' });
    expect(w.startsWith(CC.GROUP_REQ_TAG)).toBe(true);
    expect(CC.parseGroupWire(w)).toEqual({ kind: 'req', body: { v: 1, from: 'bob', sender: 'alice', epoch: 2, kid: 'kk' } });
  });
});

describe('E2E de groupe — fonctions pures', () => {
  it('parseGroupWire : toutes les branches', () => {
    expect(CC.parseGroupWire(null)).toBeNull();
    expect(CC.parseGroupWire('bonjour')).toBeNull();
    expect(CC.parseGroupWire('E2E1:abc')).toBeNull();
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
    expect(CC.parseGroupWire('E2EG1:%%%')).toEqual({ kind: 'msg', body: null });             // b64/JSON invalide
    expect(CC.parseGroupWire('E2EGK1:' + enc(null))).toEqual({ kind: 'key', body: null });    // null
    expect(CC.parseGroupWire('E2EGK1:' + enc(5))).toEqual({ kind: 'key', body: null });       // pas un objet
    expect(CC.parseGroupWire('E2EGR1:' + enc({ v: 2, epoch: 1, kid: 'k' }))).toEqual({ kind: 'req', body: null });
    expect(CC.parseGroupWire('E2EG1:' + enc({ v: 1, epoch: '1', kid: 'k' }))).toEqual({ kind: 'msg', body: null });
    expect(CC.parseGroupWire('E2EG1:' + enc({ v: 1, epoch: 1, kid: 7 }))).toEqual({ kind: 'msg', body: null });
    expect(CC.parseGroupWire('E2EG1:' + enc({ v: 1, epoch: 1, kid: 'k', iv: 'a', ct: 'b' })).body.kid).toBe('k');
  });

  it('groupReadiness : ok reçoit, clé changée exclue, sans clé = pas prêt', () => {
    expect(CC.groupReadiness([])).toEqual({ ready: true, recipients: [], pending: [], missing: [] });
    expect(CC.groupReadiness([{ uid: 'b', status: 'ok' }, { uid: 'c', status: 'pending' }]))
      .toEqual({ ready: true, recipients: ['b'], pending: ['c'], missing: [] });
    expect(CC.groupReadiness([{ uid: 'b', status: 'ok' }, { uid: 'c', status: 'nokey' }, { uid: 'd', status: 'nocap' }]))
      .toEqual({ ready: false, recipients: ['b'], pending: [], missing: ['c', 'd'] });
  });

  it('groupNeedsRotation : 1er envoi, liste changée (ajout/retrait) → oui ; même liste → non', () => {
    expect(CC.groupNeedsRotation(null, ['a'])).toBe(true);
    expect(CC.groupNeedsRotation({ members: null }, ['a'])).toBe(true);
    expect(CC.groupNeedsRotation({ members: ['b', 'a'] }, ['a', 'b'])).toBe(false);
    expect(CC.groupNeedsRotation({ members: ['a', 'b', 'c'] }, ['a', 'b'])).toBe(true);
    expect(CC.groupNeedsRotation({ members: ['a', 'b'] }, ['a', 'b', 'c'])).toBe(true);
    expect(CC.groupNeedsRotation({ members: ['a', 'b'] }, ['a', 'c'])).toBe(true);
  });

  it('b64 par tranches : un JSON > 32 Ko reste décodable (Safari : pas d\'appel à 60 000 arguments)', () => {
    const big = Array.from({ length: 400 }, (_, i) => ({ to: 'u' + i, iv: 'x'.repeat(16), w: 'é'.repeat(64) }));
    const [w] = CC.buildGroupKeyMessages({ from: 'a', epoch: 1, kid: 'k' }, big, 1e9);
    expect(w.length).toBeGreaterThan(0x8000 * 1.3);
    expect(b64json(w, CC.GROUP_KEY_TAG).keys).toHaveLength(400);
    expect(CC.parseGroupWire(w).body.keys[399].w).toBe('é'.repeat(64));
  });
});
