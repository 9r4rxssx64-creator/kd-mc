/**
 * Tests crypto E2E (ECDH P-256 + AES-GCM 256 + HKDF + PBKDF2 100k)
 * Importe lib/crypto-core.js (ESM) → coverage v8 instrumentée.
 */
import { describe, it, expect } from 'vitest';
import * as api from '../../lib/crypto-core.js';

describe('ApexCrypto — module public API', () => {
  it('expose toutes les fonctions documentées', () => {
    const required = [
      'generateIdentityKeys', 'exportPublicKey', 'importPublicKey',
      'exportPrivateKey', 'importPrivateKey',
      'deriveSharedKey', 'establishSession', 'getSessionKey',
      'encryptForConv', 'decryptForConv',
      'encryptMessage', 'decryptMessage',
      'wrapWithPin', 'unwrapWithPin',
      'computeFingerprint', 'selfTest',
      'randomBytes', 'bufToB64', 'b64ToBuf', 'bufToHex',
    ];
    for (const fn of required) expect(typeof api[fn]).toBe('function');
  });
});

describe('ApexCrypto — utils', () => {
  it('randomBytes retourne Uint8Array de longueur demandée', () => {
    const buf = api.randomBytes(32);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBe(32);
  });

  it('randomBytes 2 appels = 2 valeurs différentes (entropie)', () => {
    const a = api.randomBytes(16);
    const b = api.randomBytes(16);
    expect(api.bufToB64(a)).not.toBe(api.bufToB64(b));
  });

  it('bufToB64/b64ToBuf roundtrip', () => {
    const orig = api.randomBytes(64);
    const b64 = api.bufToB64(orig);
    expect(typeof b64).toBe('string');
    const back = new Uint8Array(api.b64ToBuf(b64));
    expect(Array.from(back)).toEqual(Array.from(orig));
  });

  it('bufToHex hex valide', () => {
    const buf = new Uint8Array([0x00, 0xff, 0xab, 0xcd]);
    expect(api.bufToHex(buf)).toBe('00ffabcd');
  });
});

describe('ApexCrypto — Identity keys', () => {
  it('genère un keypair ECDH P-256 valide', async () => {
    const kp = await api.generateIdentityKeys();
    expect(kp.publicKey).toBeDefined();
    expect(kp.privateKey).toBeDefined();
    expect(kp.publicKey.algorithm.name).toBe('ECDH');
    expect(kp.publicKey.algorithm.namedCurve).toBe('P-256');
  });

  it('export/import publicKey roundtrip cohérent', async () => {
    const kp = await api.generateIdentityKeys();
    const b64 = await api.exportPublicKey(kp.publicKey);
    expect(typeof b64).toBe('string');
    const back = await api.importPublicKey(b64);
    expect(back.algorithm.namedCurve).toBe('P-256');
  });

  it('export/import privateKey roundtrip cohérent', async () => {
    const kp = await api.generateIdentityKeys();
    const b64 = await api.exportPrivateKey(kp.privateKey);
    const back = await api.importPrivateKey(b64);
    expect(back.algorithm.namedCurve).toBe('P-256');
  });
});

describe('ApexCrypto — ECDH derivation', () => {
  it('Alice + Bob dérivent la MÊME clé partagée', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();

    const aliceK = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const bobK = await api.deriveSharedKey(bob.privateKey, alice.publicKey);

    // Test indirect: chiffrer avec aliceK + déchiffrer avec bobK
    const ct = await api.encryptMessage('hello world', aliceK);
    const pt = await api.decryptMessage(ct, bobK);
    expect(pt).toBe('hello world');
  });

  it('Eve avec ses propres clés ne déchiffre PAS le message Alice→Bob', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const eve = await api.generateIdentityKeys();

    const aliceK = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const eveK = await api.deriveSharedKey(eve.privateKey, bob.publicKey);

    const ct = await api.encryptMessage('top secret', aliceK);
    await expect(api.decryptMessage(ct, eveK)).rejects.toBeDefined();
  });
});

describe('ApexCrypto — Sessions par conversation', () => {
  it('establishSession + getSessionKey + encryptForConv + decryptForConv', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const convId = 'conv-' + Math.random();

    expect(api.getSessionKey(convId)).toBeUndefined();
    await api.establishSession(convId, alice.privateKey, bob.publicKey);
    expect(api.getSessionKey(convId)).toBeDefined();

    const ct = await api.encryptForConv(convId, 'message dans conv');
    expect(typeof ct).toBe('string');
    expect(ct.length).toBeGreaterThan(20);

    // Bob établit même session côté reception
    const bobConvId = 'conv-bob-' + Math.random();
    await api.establishSession(bobConvId, bob.privateKey, alice.publicKey);
    // Bob doit pouvoir déchiffrer car ECDH symétrique
    const bobAesKey = api.getSessionKey(bobConvId);
    const decoded = await api.decryptMessage(ct, bobAesKey);
    expect(decoded).toBe('message dans conv');
  });

  it('encryptForConv sans session établie → throw', async () => {
    await expect(api.encryptForConv('inexistant-' + Math.random(), 'msg')).rejects.toThrow();
  });

  it('decryptForConv sans session établie → throw', async () => {
    await expect(api.decryptForConv('inexistant-' + Math.random(), 'cipher==')).rejects.toThrow();
  });

  // v1.1.256 — chiffrement des octets média (bytes) sur la clé de session.
  it('encryptBytes → decryptBytes round-trip binaire (média chiffré E2E)', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const cA = 'conv-media-a-' + Math.random();
    const cB = 'conv-media-b-' + Math.random();
    await api.establishSession(cA, alice.privateKey, bob.publicKey);
    await api.establishSession(cB, bob.privateKey, alice.publicKey);

    const original = new Uint8Array([0, 1, 2, 250, 128, 42, 255, 7]);
    const encBuf = await api.encryptBytes(cA, original.buffer);
    // Sortie chiffrée ≠ clair, préfixée d'un IV 12 octets.
    expect(encBuf.byteLength).toBe(original.byteLength + 12 + 16); // +iv +tag GCM
    const encView = new Uint8Array(encBuf);
    expect(Array.from(encView.slice(12)).join(',')).not.toBe(Array.from(original).join(','));

    // Bob (session ECDH symétrique) déchiffre les octets d'origine.
    const decBuf = await api.decryptBytes(cB, encBuf);
    expect(Array.from(new Uint8Array(decBuf))).toEqual(Array.from(original));
  });

  // v1.1.257 — politique anti repli texte-clair silencieux.
  it('decideWire : ciphertext présent → mode cipher', () => {
    const r = api.decideWire({ ciphertextPayload: 'E2E1:abc', plaintext: 'salut', e2eOn: true });
    expect(r.mode).toBe('cipher');
    expect(r.wire).toBe('E2E1:abc');
  });
  it('decideWire : E2E OFF sans ciphertext → mode clear (opt-out assumé)', () => {
    const r = api.decideWire({ ciphertextPayload: null, plaintext: 'salut', e2eOn: false });
    expect(r.mode).toBe('clear');
    expect(r.wire).toBe('salut');
  });
  it('decideWire : E2E ON sans ciphertext → mode pending (JAMAIS de clair)', () => {
    const r = api.decideWire({ ciphertextPayload: null, plaintext: 'secret', e2eOn: true });
    expect(r.mode).toBe('pending');
    expect(r.wire).toBeNull();
  });

  // v1.1.259 — détection de changement de clé (TOFU, parité Signal).
  it('checkKeyChange : 1ʳᵉ vue → firstSight', () => {
    const r = api.checkKeyChange(null, 'PUBKEY_A');
    expect(r.firstSight).toBe(true);
    expect(r.changed).toBe(false);
  });
  it('checkKeyChange : clé identique → unchanged', () => {
    const r = api.checkKeyChange('PUBKEY_A', 'PUBKEY_A');
    expect(r.unchanged).toBe(true);
    expect(r.changed).toBe(false);
  });
  it('checkKeyChange : clé différente → changed (alerte MITM)', () => {
    const r = api.checkKeyChange('PUBKEY_A', 'PUBKEY_B');
    expect(r.changed).toBe(true);
    expect(r.firstSight).toBe(false);
  });
  it('checkKeyChange : pas de nouvelle clé → aucun signal', () => {
    const r = api.checkKeyChange('PUBKEY_A', null);
    expect(r.changed).toBe(false);
    expect(r.firstSight).toBe(false);
    expect(r.unchanged).toBe(false);
  });

  // v1.1.260 — forward secrecy (ratchet symétrique à clés jetables).
  describe('ratchet forward secrecy', () => {
    async function pair(cid) {
      const alice = await api.generateIdentityKeys();
      const bob = await api.generateIdentityKeys();
      await api.ratchetInit('A:' + cid, alice.privateKey, bob.publicKey);
      await api.ratchetInit('B:' + cid, bob.privateKey, alice.publicKey);
      return { a: 'A:' + cid, b: 'B:' + cid };
    }
    it('échange dans l\'ordre : chaque message déchiffre', async () => {
      const { a, b } = await pair('order-' + Math.random());
      const m0 = await api.ratchetEncrypt(a, 'bonjour');
      const m1 = await api.ratchetEncrypt(a, 'ça va ?');
      expect(m0.n).toBe(0); expect(m1.n).toBe(1);
      expect(await api.ratchetDecrypt(b, m0.n, m0.ct)).toBe('bonjour');
      expect(await api.ratchetDecrypt(b, m1.n, m1.ct)).toBe('ça va ?');
    });
    it('message sauté puis reçu plus tard (clé sautée mémorisée)', async () => {
      const { a, b } = await pair('skip-' + Math.random());
      const m0 = await api.ratchetEncrypt(a, 'un');
      const m1 = await api.ratchetEncrypt(a, 'deux');
      const m2 = await api.ratchetEncrypt(a, 'trois');
      // Bob reçoit 0 puis 2 (1 sauté), puis 1 en retard
      expect(await api.ratchetDecrypt(b, m0.n, m0.ct)).toBe('un');
      expect(await api.ratchetDecrypt(b, m2.n, m2.ct)).toBe('trois');
      expect(await api.ratchetDecrypt(b, m1.n, m1.ct)).toBe('deux'); // clé sautée
    });
    it('forward secrecy : un message trop ancien N\'EST PLUS déchiffrable', async () => {
      const { a, b } = await pair('fs-' + Math.random());
      const m0 = await api.ratchetEncrypt(a, 'secret0');
      const m1 = await api.ratchetEncrypt(a, 'secret1');
      // Bob avance jusqu'à m1 SANS mémoriser m0 (reçoit m1 direct → m0 sauté+stocké)
      // ici on force la destruction : on consomme m0 puis on retente
      await api.ratchetDecrypt(b, m0.n, m0.ct);
      await api.ratchetDecrypt(b, m1.n, m1.ct);
      // m0 déjà consommé → clé détruite → re-déchiffrer échoue
      await expect(api.ratchetDecrypt(b, m0.n, m0.ct)).rejects.toThrow();
    });
    it('export/import : l\'état survit (reload)', async () => {
      const { a, b } = await pair('persist-' + Math.random());
      const m0 = await api.ratchetEncrypt(a, 'avant reload');
      const snapB = api.ratchetExport(b);
      api.resetRatchet(b);
      expect(api.hasRatchet(b)).toBe(false);
      expect(api.ratchetImport(b, snapB)).toBe(true);
      expect(await api.ratchetDecrypt(b, m0.n, m0.ct)).toBe('avant reload');
    });
    // 10/09 — vu par la mesure de couverture AST (vitest 5) : les clés SAUTÉES n'étaient
    // jamais exportées/importées dans un test → un reload entre « message 2 reçu » et
    // « message 1 arrivé en retard » aurait pu perdre la clé sans qu'aucun test le voie.
    it('export/import : les clés des messages sautés survivent aussi au reload', async () => {
      const { a, b } = await pair('persist-skip-' + Math.random());
      const m0 = await api.ratchetEncrypt(a, 'un');
      const m1 = await api.ratchetEncrypt(a, 'deux');
      const m2 = await api.ratchetEncrypt(a, 'trois');
      expect(await api.ratchetDecrypt(b, m0.n, m0.ct)).toBe('un');
      expect(await api.ratchetDecrypt(b, m2.n, m2.ct)).toBe('trois'); // n=1 sauté → clé mémorisée
      const snap = api.ratchetExport(b);
      expect(JSON.parse(snap).skipped).toHaveLength(1);
      api.resetRatchet(b);
      expect(api.ratchetImport(b, snap)).toBe(true);
      expect(await api.ratchetDecrypt(b, m1.n, m1.ct)).toBe('deux'); // la clé sautée a survécu
      expect(JSON.parse(api.ratchetExport(b)).skipped).toHaveLength(0); // consommée puis jetée
    });
    it('ratchetEncrypt/Decrypt sans init → throw', async () => {
      await expect(api.ratchetEncrypt('absent-' + Math.random(), 'x')).rejects.toThrow();
      await expect(api.ratchetDecrypt('absent-' + Math.random(), 0, 'x')).rejects.toThrow();
    });
    it('ratchetImport json invalide → false ; export sans état → null', async () => {
      expect(api.ratchetImport('c', 'pas du json')).toBe(false);
      expect(api.ratchetImport('c', '')).toBe(false);
      expect(api.ratchetExport('jamais-init-' + Math.random())).toBeNull();
    });
    it('ratchetImport sans champ skipped → défaut []', async () => {
      const { a } = await pair('nosk-' + Math.random());
      const m = await api.ratchetEncrypt(a, 'x');
      // état minimal sans clé "skipped"
      const cid = 'imp-' + Math.random();
      expect(api.ratchetImport(cid, JSON.stringify({ ck: '00'.repeat(32), ns: 0, nr: 0 }))).toBe(true);
      expect(api.hasRatchet(cid)).toBe(true);
    });
    it('resetRatchet() sans argument → efface tout', async () => {
      await pair('clr-' + Math.random());
      api.resetRatchet(); // clear global
      // après clear global, aucun état ne subsiste
      expect(api.hasRatchet('A:clr')).toBe(false);
    });
    it('trop de messages sautés → throw (garde-fou MAX_SKIP)', async () => {
      const { a, b } = await pair('maxskip-' + Math.random());
      let last;
      for (let i = 0; i <= 101; i++) last = await api.ratchetEncrypt(a, 'm' + i);
      await expect(api.ratchetDecrypt(b, last.n, last.ct)).rejects.toThrow();
    });
  });

  it('encryptBytes sans session établie → throw', async () => {
    await expect(api.encryptBytes('inexistant-' + Math.random(), new Uint8Array([1]).buffer)).rejects.toThrow();
  });

  it('decryptBytes sans session établie → throw', async () => {
    await expect(api.decryptBytes('inexistant-' + Math.random(), new Uint8Array([1]).buffer)).rejects.toThrow();
  });

  it('chaque encryptForConv produit un ciphertext différent (IV unique)', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const convId = 'iv-uniq-' + Math.random();
    await api.establishSession(convId, alice.privateKey, bob.publicKey);
    const c1 = await api.encryptForConv(convId, 'identique');
    const c2 = await api.encryptForConv(convId, 'identique');
    expect(c1).not.toBe(c2);
  });
});

describe('ApexCrypto — wrapWithPin / unwrapWithPin (PBKDF2 100k)', () => {
  it('roundtrip wrap+unwrap avec PIN correct', async () => {
    const payload = { secret: 'private key data', n: 42 };
    const wrapped = await api.wrapWithPin(payload, '424242');
    expect(wrapped.ciphertext).toBeDefined();
    expect(wrapped.salt).toBeDefined();

    const back = await api.unwrapWithPin(wrapped.ciphertext, wrapped.salt, '424242');
    expect(back).toEqual(payload);
  });

  it('unwrap avec mauvais PIN → throw', async () => {
    const wrapped = await api.wrapWithPin({ k: 'v' }, '424242');
    await expect(api.unwrapWithPin(wrapped.ciphertext, wrapped.salt, '999999')).rejects.toBeDefined();
  });

  it('chaque wrap génère un salt différent', async () => {
    const w1 = await api.wrapWithPin({ k: 1 }, 'pin');
    const w2 = await api.wrapWithPin({ k: 1 }, 'pin');
    expect(w1.salt).not.toBe(w2.salt);
    expect(w1.ciphertext).not.toBe(w2.ciphertext);
  });
});

describe('ApexCrypto — computeFingerprint', () => {
  it('fingerprint déterministe pour mêmes paires', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const fp1 = await api.computeFingerprint(alice.publicKey, bob.publicKey);
    const fp2 = await api.computeFingerprint(alice.publicKey, bob.publicKey);
    expect(fp1).toBe(fp2);
  });

  it('fingerprint symétrique (Alice↔Bob == Bob↔Alice)', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const fp1 = await api.computeFingerprint(alice.publicKey, bob.publicKey);
    const fp2 = await api.computeFingerprint(bob.publicKey, alice.publicKey);
    expect(fp1).toBe(fp2);
  });

  it('fingerprint format 6 groupes de 5 chiffres séparés par espace', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const fp = await api.computeFingerprint(alice.publicKey, bob.publicKey);
    expect(fp).toMatch(/^[0-9a-f]{5}( [0-9a-f]{5}){5}$/);
  });

  it('fingerprint différent pour paires différentes', async () => {
    const a = await api.generateIdentityKeys();
    const b = await api.generateIdentityKeys();
    const c = await api.generateIdentityKeys();
    const fpAB = await api.computeFingerprint(a.publicKey, b.publicKey);
    const fpAC = await api.computeFingerprint(a.publicKey, c.publicKey);
    expect(fpAB).not.toBe(fpAC);
  });
});

describe('ApexCrypto — encryptMessage/decryptMessage (raw)', () => {
  it('roundtrip avec clé partagée', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const k = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const ct = await api.encryptMessage('Hello 🌍', k);
    expect(typeof ct).toBe('string');
    const pt = await api.decryptMessage(ct, k);
    expect(pt).toBe('Hello 🌍');
  });

  it('decryptMessage tampered ciphertext → throw (auth tag GCM)', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const k = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const ct = await api.encryptMessage('original', k);
    // Flip 1 byte au milieu (alter le ciphertext)
    const buf = new Uint8Array(api.b64ToBuf(ct));
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    const tampered = api.bufToB64(buf);
    await expect(api.decryptMessage(tampered, k)).rejects.toBeDefined();
  });

  it('encryptMessage gère unicode + émojis', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const k = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const msg = '🛡 message avec accents é à ç + emoji 🇫🇷👨‍💻';
    const ct = await api.encryptMessage(msg, k);
    const pt = await api.decryptMessage(ct, k);
    expect(pt).toBe(msg);
  });

  it('encryptMessage sur message vide', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const k = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const ct = await api.encryptMessage('', k);
    const pt = await api.decryptMessage(ct, k);
    expect(pt).toBe('');
  });

  it('encryptMessage gère gros payload (10KB)', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const k = await api.deriveSharedKey(alice.privateKey, bob.publicKey);
    const msg = 'A'.repeat(10000);
    const ct = await api.encryptMessage(msg, k);
    const pt = await api.decryptMessage(ct, k);
    expect(pt).toBe(msg);
  });
});

describe('ApexCrypto — selfTest', () => {
  it('selfTest retourne ok:true + fingerprint', async () => {
    const r = await api.selfTest();
    expect(r.ok).toBe(true);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{5}( [0-9a-f]{5}){5}$/);
    expect(r.message_test).toContain('Bob');
  });

  it('selfTest catch retourne ok:false si crypto.subtle.generateKey throw', async () => {
    const { vi } = await import('vitest');
    const original = globalThis.crypto.subtle.generateKey;
    const spy = vi.spyOn(globalThis.crypto.subtle, 'generateKey').mockRejectedValueOnce(new Error('crypto offline'));
    const r = await api.selfTest();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('crypto offline');
    spy.mockRestore();
    expect(globalThis.crypto.subtle.generateKey).toBe(original);
  });

  it('selfTest detect roundtrip-mismatch (decrypt incorrect)', async () => {
    const r = await api.selfTest({ decryptMessage: async () => 'autre message' });
    expect(r).toEqual({ ok: false, reason: 'roundtrip-mismatch' });
  });

  it('selfTest detect pin-wrap-mismatch (unwrap incorrect)', async () => {
    const r = await api.selfTest({ unwrapWithPin: async () => ({ key: 'wrong' }) });
    expect(r).toEqual({ ok: false, reason: 'pin-wrap-mismatch' });
  });

  it('selfTest detect fingerprint-not-symmetric', async () => {
    let n = 0;
    const r = await api.selfTest({
      computeFingerprint: async () => (++n === 1 ? 'aaaaa bbbbb ccccc ddddd eeeee fffff' : 'differs'),
    });
    expect(r).toEqual({ ok: false, reason: 'fingerprint-not-symmetric' });
  });
});

describe('ApexCrypto — decryptForConv success path', () => {
  it('Alice encrypt + Bob decrypt via session côté Bob (roundtrip via decryptForConv)', async () => {
    const alice = await api.generateIdentityKeys();
    const bob = await api.generateIdentityKeys();
    const convA = 'conv-A-' + Math.random();
    const convB = 'conv-B-' + Math.random();

    await api.establishSession(convA, alice.privateKey, bob.publicKey);
    await api.establishSession(convB, bob.privateKey, alice.publicKey);

    const ct = await api.encryptForConv(convA, 'Coucou Bob');
    const pt = await api.decryptForConv(convB, ct);
    expect(pt).toBe('Coucou Bob');
  });
});
