/**
 * Tests — lib/key-vault.js (Étape A plan E2E staged).
 * Couvre : roundtrip wrap/unwrap, rejet PIN faux, garde-fous, et surtout la
 * fonction PURE planKeyMigration (preuve « zéro lockout » : aucune branche ne
 * doit jamais 'generate' alors qu'une clé wrappée existe sans PIN).
 */
import { describe, it, expect } from 'vitest';
import { wrapPrivKey, unwrapPrivKey, planKeyMigration } from '../../lib/key-vault.js';
import { wrapWithPin } from '../../lib/crypto-core.js';

const PRIV = 'eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwiZCI6InRlc3QtcHJpdmF0ZS1rZXktYjY0In0';

describe('key-vault — wrap/unwrap', () => {
  it('roundtrip : unwrap(wrap(priv, pin), pin) === priv', async () => {
    const wrapped = await wrapPrivKey(PRIV, '424242');
    expect(wrapped.ct).toBeTruthy();
    expect(wrapped.salt).toBeTruthy();
    expect(wrapped.v).toBe(1);
    const back = await unwrapPrivKey(wrapped, '424242');
    expect(back).toBe(PRIV);
  });

  it('la clé privée n\'apparaît PAS en clair dans le ciphertext', async () => {
    const wrapped = await wrapPrivKey(PRIV, '424242');
    expect(JSON.stringify(wrapped)).not.toContain(PRIV);
  });

  it('PIN faux → throw (pas de déchiffrement silencieux)', async () => {
    const wrapped = await wrapPrivKey(PRIV, '424242');
    await expect(unwrapPrivKey(wrapped, '999999')).rejects.toThrow();
  });

  it('2 wraps de la même clé → salts différents (pas déterministe)', async () => {
    const a = await wrapPrivKey(PRIV, '424242');
    const b = await wrapPrivKey(PRIV, '424242');
    expect(a.salt).not.toBe(b.salt);
    expect(a.ct).not.toBe(b.ct);
  });

  it('garde-fous : priv vide ou PIN trop court → throw', async () => {
    await expect(wrapPrivKey('', '424242')).rejects.toThrow('no-priv');
    await expect(wrapPrivKey(PRIV, '12')).rejects.toThrow('pin-too-short');
  });

  it('unwrap d\'un objet invalide → throw no-wrapped-key (toutes branches)', async () => {
    await expect(unwrapPrivKey(null, '424242')).rejects.toThrow('no-wrapped-key');       // !wrapped
    await expect(unwrapPrivKey({ salt: 'x' }, '424242')).rejects.toThrow('no-wrapped-key'); // !wrapped.ct
    await expect(unwrapPrivKey({ ct: 'x' }, '424242')).rejects.toThrow('no-wrapped-key');   // !wrapped.salt
  });

  it('pin vide (falsy) → pin-too-short (branche !pin)', async () => {
    await expect(wrapPrivKey(PRIV, '')).rejects.toThrow('pin-too-short');
  });

  it('payload déchiffré sans champ priv → bad-payload', async () => {
    // Crée un blob wrappé valide MAIS sans `priv` (déchiffrement réussit, contenu KO).
    const bogus = await wrapWithPin({ foo: 1 }, '424242');
    await expect(unwrapPrivKey({ ct: bogus.ciphertext, salt: bogus.salt }, '424242'))
      .rejects.toThrow('bad-payload');
  });
});

describe('key-vault — planKeyMigration (zéro lockout, zéro régression)', () => {
  it('wrappée + PIN dispo → unwrap', () => {
    expect(planKeyMigration({ hasWrapped: true, pinAvailable: true })).toEqual({ action: 'unwrap' });
  });

  it('wrappée + PIN absent + pas de clair → defer (JAMAIS generate = anti-clobber)', () => {
    expect(planKeyMigration({ hasWrapped: true, pinAvailable: false, hasCleartext: false }))
      .toEqual({ action: 'defer' });
  });

  it('clair + PIN dispo → migrate (wrap puis efface le clair)', () => {
    expect(planKeyMigration({ hasCleartext: true, pinAvailable: true })).toEqual({ action: 'migrate' });
  });

  it('clair + pas de PIN → keep-cleartext (rétrocompat users sans PIN)', () => {
    expect(planKeyMigration({ hasCleartext: true, pinAvailable: false })).toEqual({ action: 'keep-cleartext' });
  });

  it('rien stocké → generate', () => {
    expect(planKeyMigration({ hasCleartext: false, hasWrapped: false })).toEqual({ action: 'generate' });
  });

  it('déjà chargé → noop', () => {
    expect(planKeyMigration({ keysLoaded: true, hasWrapped: true })).toEqual({ action: 'noop' });
  });

  it('INVARIANT anti-lockout : aucune entrée avec wrappée-sans-PIN ne renvoie generate', () => {
    for (const hasCleartext of [true, false]) {
      const plan = planKeyMigration({ hasWrapped: true, pinAvailable: false, hasCleartext });
      expect(plan.action).not.toBe('generate');
    }
  });
});
