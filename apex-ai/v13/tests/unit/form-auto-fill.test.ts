/**
 * APEX v13 — Tests form-auto-fill.ts
 *
 * Couvre :
 *  - detectFillIntent (4 patterns)
 *  - resolveViewForKey (vault/settings/profile/unknown)
 *  - checkForbidden (CB, seed phrase)
 *  - axAutofillField (admin direct, pending confirm, unknown key, forbidden)
 *  - confirmAutofill (vault/settings/profile writes)
 *  - cancelAutofill, listPendingAutofills
 *  - isWritableKey, listWritableKeys
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const auditRecordMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: (...args: unknown[]) => auditRecordMock(...args) },
}));

const vaultSetKeyMock = vi.fn().mockResolvedValue({ ok: true, persisted: { local: true } });
vi.mock('../../services/vault/vault.js', () => ({
  vault: { setKey: (...args: unknown[]) => vaultSetKeyMock(...args) },
}));

const storeGet = vi.fn().mockReturnValue({});
const storeSet = vi.fn();
vi.mock('../../core/store.js', () => ({
  store: { get: (k: string) => storeGet(k), set: (k: string, v: unknown) => storeSet(k, v) },
}));

import {
  axAutofillField,
  cancelAutofill,
  confirmAutofill,
  detectFillIntent,
  isWritableKey,
  listPendingAutofills,
  listWritableKeys,
} from '../../services/core-svc/form-auto-fill.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('form-auto-fill — detectFillIntent', () => {
  it('"remplis X avec Y" reconnu', () => {
    const r = detectFillIntent('remplis ax_anthropic_key avec sk-ant-test123');
    expect(r).not.toBeNull();
    expect(r?.key).toBe('ax_anthropic_key');
    expect(r?.value).toBe('sk-ant-test123');
    expect(r?.view).toBe('vault');
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('"mets Y dans X" reconnu (clé après valeur)', () => {
    const r = detectFillIntent('mets sk-test dans ax_openai_key');
    expect(r).not.toBeNull();
    expect(r?.key).toBe('ax_openai_key');
    expect(r?.value).toBe('sk-test');
  });

  it('"set X to Y" reconnu', () => {
    const r = detectFillIntent('set ax_paypal_me to @kevin');
    expect(r).not.toBeNull();
    expect(r?.key).toBe('ax_paypal_me');
    expect(r?.value).toBe('@kevin');
    expect(r?.view).toBe('settings');
  });

  it('"sauvegarde le token X = Y" reconnu', () => {
    const r = detectFillIntent('sauvegarde le token ax_github_token = ghp_abc123');
    expect(r).not.toBeNull();
    expect(r?.key).toBe('ax_github_token');
    expect(r?.value).toBe('ghp_abc123');
  });

  it('texte vide → null', () => {
    expect(detectFillIntent('')).toBeNull();
    expect(detectFillIntent('   ')).toBeNull();
  });

  it('texte trop long (>4000 chars) → null', () => {
    const long = 'a'.repeat(5000);
    expect(detectFillIntent('remplis ax_x avec ' + long)).toBeNull();
  });

  it('texte sans pattern → null', () => {
    expect(detectFillIntent('bonjour comment vas-tu ?')).toBeNull();
  });

  it('clé profile reconnue avec préfixe profile.*', () => {
    const r = detectFillIntent('remplis profile.email avec a@b.c');
    expect(r?.view).toBe('profile');
  });

  it('clé inconnue → view=unknown', () => {
    const r = detectFillIntent('remplis ax_truc_qui_nexiste_pas avec abc');
    expect(r?.view).toBe('unknown');
  });
});

describe('form-auto-fill — axAutofillField — guards', () => {
  it('key vide → ok=false, error=key_empty', async () => {
    const r = await axAutofillField('', 'x');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('key_empty');
  });

  it('value vide → ok=false, error=value_empty', async () => {
    const r = await axAutofillField('ax_anthropic_key', '');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('value_empty');
  });

  it('key pas dans whitelist → error=key_not_in_whitelist', async () => {
    const r = await axAutofillField('ax_inconnu_xyz', 'value');
    expect(r.ok).toBe(false);
    expect(r.view).toBe('unknown');
    expect(r.error).toBe('key_not_in_whitelist');
  });

  it('valeur ressemble à CB Visa complète → forbidden', async () => {
    const r = await axAutofillField('ax_paypal_me', '4111 1111 1111 1111');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CB|Stripe/i);
    expect(auditRecordMock).toHaveBeenCalledWith('autofill.refused', expect.any(Object));
  });

  it('seed phrase BIP39 12 mots → forbidden', async () => {
    const seed = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    const r = await axAutofillField('ax_anthropic_key', seed);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/seed|wallet/i);
  });
});

describe('form-auto-fill — axAutofillField — admin direct', () => {
  it('admin tier + confirm=false → write direct vault', async () => {
    const r = await axAutofillField('ax_anthropic_key', 'sk-ant-real-key', {
      tier: 'admin',
      confirm: false,
      reason: 'audit',
    });
    expect(r.written).toBe(true);
    expect(vaultSetKeyMock).toHaveBeenCalledWith('ax_anthropic_key', 'sk-ant-real-key');
    expect(auditRecordMock).toHaveBeenCalledWith('autofill.vault_write', expect.any(Object));
  });

  it('admin + confirm=false sur clé settings → write localStorage', async () => {
    const r = await axAutofillField('ax_paypal_me', '@kevin', {
      tier: 'admin',
      confirm: false,
    });
    expect(r.written).toBe(true);
    expect(localStorage.getItem('ax_paypal_me')).toBe('@kevin');
  });

  it('admin + confirm=false sur clé profile → store update', async () => {
    storeGet.mockReturnValue({});
    const r = await axAutofillField('profile.email', 'kevin@example.com', {
      tier: 'admin',
      confirm: false,
    });
    expect(r.written).toBe(true);
    expect(storeSet).toHaveBeenCalledWith('user', expect.objectContaining({ email: 'kevin@example.com' }));
  });
});

describe('form-auto-fill — axAutofillField — pending confirmation', () => {
  it('user non-admin → awaiting_confirmation + token', async () => {
    const r = await axAutofillField('ax_anthropic_key', 'sk-key', {
      tier: 'client_pro',
    });
    expect(r.awaiting_confirmation).toBe(true);
    expect(r.confirmation_token).toBeTruthy();
    expect(r.written).toBe(false);
  });

  it('admin sans confirm:false → pending par défaut', async () => {
    const r = await axAutofillField('ax_anthropic_key', 'sk-key', {
      tier: 'admin',
    });
    expect(r.awaiting_confirmation).toBe(true);
  });

  it('listPendingAutofills masque la valeur', async () => {
    await axAutofillField('ax_anthropic_key', 'sk-secret', { tier: 'admin' });
    const list = listPendingAutofills();
    expect(list.length).toBe(1);
    expect((list[0] as unknown as { value: string }).value).toBeUndefined();
    expect(list[0]?.key).toBe('ax_anthropic_key');
  });
});

describe('form-auto-fill — confirmAutofill', () => {
  it('confirmAutofill token valide → écrit', async () => {
    const r1 = await axAutofillField('ax_paypal_me', '@kevin', { tier: 'admin' });
    const token = r1.confirmation_token!;
    const r2 = await confirmAutofill(token);
    expect(r2.written).toBe(true);
    expect(localStorage.getItem('ax_paypal_me')).toBe('@kevin');
  });

  it('token inconnu → error=token_unknown_or_expired', async () => {
    const r = await confirmAutofill('fake_token_xyz');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('token_unknown_or_expired');
  });

  it('confirmAutofill enlève le token de pending', async () => {
    const r1 = await axAutofillField('ax_paypal_me', '@a', { tier: 'admin' });
    await confirmAutofill(r1.confirmation_token!);
    expect(listPendingAutofills()).toHaveLength(0);
  });
});

describe('form-auto-fill — cancelAutofill', () => {
  it('cancel token valide → ok=true + retiré pending', async () => {
    const r1 = await axAutofillField('ax_paypal_me', '@x', { tier: 'admin' });
    const r2 = await cancelAutofill(r1.confirmation_token!);
    expect(r2.ok).toBe(true);
    expect(listPendingAutofills()).toHaveLength(0);
  });

  it('cancel token inexistant → ok=false', async () => {
    const r = await cancelAutofill('fake_token');
    expect(r.ok).toBe(false);
  });
});

describe('form-auto-fill — helpers', () => {
  it('isWritableKey reconnaît vault/settings/profile', () => {
    expect(isWritableKey('ax_anthropic_key')).toBe(true);
    expect(isWritableKey('ax_paypal_me')).toBe(true);
    expect(isWritableKey('profile.email')).toBe(true);
    expect(isWritableKey('ax_inconnu')).toBe(false);
  });

  it('listWritableKeys retourne toutes whitelist + view', () => {
    const list = listWritableKeys();
    expect(list.length).toBeGreaterThan(0);
    const views = new Set(list.map((x) => x.view));
    expect(views.has('vault')).toBe(true);
    expect(views.has('settings')).toBe(true);
    expect(views.has('profile')).toBe(true);
  });
});

describe('form-auto-fill — writeKey errors', () => {
  it('vault setKey fail (ok:false, persisted:null) → ok=false', async () => {
    vaultSetKeyMock.mockResolvedValueOnce({ ok: false });
    const r = await axAutofillField('ax_anthropic_key', 'sk', { tier: 'admin', confirm: false });
    expect(r.written).toBe(false);
  });

  it('settings write OK via admin shortcut → audit log + localStorage', async () => {
    const r = await axAutofillField('ax_iban', 'FR1234567890', { tier: 'admin', confirm: false });
    expect(r.written).toBe(true);
    expect(localStorage.getItem('ax_iban')).toBe('FR1234567890');
    expect(auditRecordMock).toHaveBeenCalledWith('autofill.settings_write', expect.any(Object));
  });
});
