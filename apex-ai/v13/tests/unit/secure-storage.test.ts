import { describe, it, expect, beforeEach } from 'vitest';
import { secureStorage } from '../../services/storage/secure-storage.js';

describe('secure-storage', () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.lock();
  });
  it('refuse passphrase trop courte', async () => {
    const r = await secureStorage.unlock('1234');
    expect(r.ok).toBe(false);
  });
  it('unlock first setup OK', async () => {
    const r = await secureStorage.unlock('passphrase-secure-1234');
    expect(r.ok).toBe(true);
    expect(r.firstSetup).toBe(true);
    expect(secureStorage.isUnlocked()).toBe(true);
  });
  it('unlock 2e fois avec bonne passphrase', async () => {
    await secureStorage.unlock('passphrase-secure-1234');
    secureStorage.lock();
    const r = await secureStorage.unlock('passphrase-secure-1234');
    expect(r.ok).toBe(true);
    expect(r.firstSetup).toBe(false);
  });
  it('refuse mauvaise passphrase au 2e unlock', async () => {
    await secureStorage.unlock('passphrase-secure-1234');
    secureStorage.lock();
    const r = await secureStorage.unlock('wrong-passphrase');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('incorrecte');
    expect(secureStorage.isUnlocked()).toBe(false);
  });
  it('isSensitive identifie clés API', () => {
    expect(secureStorage.isSensitive('ax_anthropic_key')).toBe(true);
    expect(secureStorage.isSensitive('ax_stripe_sk')).toBe(true);
    expect(secureStorage.isSensitive('apex_v13_pin_kdmc_admin')).toBe(true);
    expect(secureStorage.isSensitive('apex_v13_theme')).toBe(false);
  });
  it('setItem/getItem clé sensible chiffre + déchiffre', async () => {
    await secureStorage.unlock('passphrase-secure-1234');
    await secureStorage.setItem('ax_anthropic_key', 'sk-ant-secret');
    const stored = localStorage.getItem('ax_anthropic_key');
    expect(stored).toMatch(/^AXSEC1:/); /* chiffré */
    const decrypted = await secureStorage.getItem('ax_anthropic_key');
    expect(decrypted).toBe('sk-ant-secret');
  });
  it('setItem clé non-sensible reste plain', async () => {
    await secureStorage.unlock('passphrase-secure-1234');
    await secureStorage.setItem('apex_v13_theme', 'dark');
    expect(localStorage.getItem('apex_v13_theme')).toBe('dark');
  });
  it('getItem locked retourne null sur encrypted (anti v12.784)', async () => {
    await secureStorage.unlock('passphrase-secure-1234');
    await secureStorage.setItem('ax_anthropic_key', 'secret');
    secureStorage.lock();
    const v = await secureStorage.getItem('ax_anthropic_key');
    expect(v).toBeNull(); /* JAMAIS le payload chiffré */
  });
  it('migratePlainToEncrypted', async () => {
    localStorage.setItem('ax_openai_key', 'plain-secret');
    await secureStorage.unlock('passphrase-secure-1234');
    const r = await secureStorage.migratePlainToEncrypted();
    expect(r.migrated).toBeGreaterThan(0);
    expect(localStorage.getItem('ax_openai_key')).toMatch(/^AXSEC1:/);
  });
});
