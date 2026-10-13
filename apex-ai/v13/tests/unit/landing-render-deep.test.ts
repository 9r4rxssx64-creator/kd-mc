/**
 * APEX v13 — Tests deep features/landing (render + autoLogin + handleLogin + reset PIN)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/bootstrap.js', () => ({ APP_VER: 'v13.4.172' }));
vi.mock('../../core/router.js', () => ({
  router: { navigate: vi.fn() },
}));
vi.mock('../../services/auth/auth.js', () => ({
  auth: {
    login: vi.fn(async () => ({ ok: true })),
    loginTrusted: vi.fn(async () => ({ ok: true })),
    /* v13.4.328 : landing tente l'auto-login domaine (SSO Face ID kd-mc, leçon #98).
     * Le mock doit fournir cette méthode sinon `auth.loginVerifiedDomain is not a function`. */
    loginVerifiedDomain: vi.fn(async () => ({ ok: false })),
  },
}));
vi.mock('../../services/auth/feature-toggles.js', () => ({
  isFeatureEnabled: vi.fn(() => true),
}));
vi.mock('../../services/integrations/device-context.js', () => ({
  deviceContext: { getFingerprint: vi.fn(async () => ({ device_id: 'trusted-fp' })) },
}));
vi.mock('../../ui/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../ui/haptic.js', () => ({
  haptic: { tap: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn(), medium: vi.fn() },
}));

import { render, dispose } from '../../features/landing/index.js';
import { router } from '../../core/router.js';
import { auth } from '../../services/auth/auth.js';
import { isFeatureEnabled } from '../../services/auth/feature-toggles.js';
import { toast } from '../../ui/toast.js';

let root: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  /* Reset hash + localStorage */
  history.replaceState(null, '', '#');
  localStorage.clear();
  dispose();
});

afterEach(() => {
  document.body.innerHTML = '';
  dispose();
  localStorage.clear();
});

describe('landing — render base', () => {
  it('rend form login + bouton reset PIN + bouton signup', () => {
    render(root);
    expect(root.querySelector('#login-form')).toBeTruthy();
    expect(root.querySelector('#login-name')).toBeTruthy();
    expect(root.querySelector('#login-pin')).toBeTruthy();
    expect(root.querySelector('#login-submit')).toBeTruthy();
    expect(root.querySelector('#login-reset-pin')).toBeTruthy();
    expect(root.querySelector('#login-go-signup')).toBeTruthy();
  });

  it('affiche APP_VER', () => {
    render(root);
    expect(root.textContent).toContain('v13.4.172');
  });

  it('feature toggle off → message "fermé"', () => {
    (isFeatureEnabled as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(root);
    expect(root.querySelector('.ax-landing-card')?.textContent).toContain('temporairement fermé');
    expect(root.querySelector('#login-form')).toBeFalsy();
  });

  it('hash invite → bandeau invitation détectée', () => {
    history.replaceState(null, '', '#invite=' + btoa('uid_x:invite'));
    render(root);
    expect(root.querySelector('.ax-info')?.textContent).toMatch(/Invitation détectée/);
  });

  it('hash sans invite → no bandeau', () => {
    history.replaceState(null, '', '#other=foo');
    render(root);
    expect(root.querySelector('.ax-info')).toBeFalsy();
  });
});

describe('landing — handleLogin', () => {
  it('login réussi → toast success + navigate chat', async () => {
    render(root);
    const nameInput = root.querySelector<HTMLInputElement>('#login-name')!;
    const pinInput = root.querySelector<HTMLInputElement>('#login-pin')!;
    nameInput.value = 'Kevin Desarzens';
    pinInput.value = '200807';
    root.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r, 250));
    expect(auth.login).toHaveBeenCalledWith('Kevin Desarzens', '200807');
    expect(toast.success).toHaveBeenCalledWith('Bienvenue !');
    expect(router.navigate).toHaveBeenCalledWith('chat');
  });

  it('login échec → toast error + form re-enable', async () => {
    (auth.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, reason: 'Mauvais PIN' });
    render(root);
    (root.querySelector('#login-name') as HTMLInputElement).value = 'X Y';
    (root.querySelector('#login-pin') as HTMLInputElement).value = '0000';
    root.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r, 50));
    expect(toast.error).toHaveBeenCalledWith('Mauvais PIN');
    expect(root.querySelector('#login-error')?.textContent).toContain('Mauvais PIN');
    const submitBtn = root.querySelector<HTMLButtonElement>('#login-submit')!;
    expect(submitBtn.disabled).toBe(false);
  });

  it('login échec sans reason → message default', async () => {
    (auth.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    render(root);
    (root.querySelector('#login-name') as HTMLInputElement).value = 'X Y';
    (root.querySelector('#login-pin') as HTMLInputElement).value = '0000';
    root.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r, 50));
    expect(toast.error).toHaveBeenCalledWith('Connexion impossible');
  });

  it('login throw → catch + toast error', async () => {
    (auth.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    render(root);
    (root.querySelector('#login-name') as HTMLInputElement).value = 'X Y';
    (root.querySelector('#login-pin') as HTMLInputElement).value = '1111';
    root.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r, 50));
    expect(toast.error).toHaveBeenCalledWith('network');
  });

  it('validation client-side : nom court → message warn pas de call API', async () => {
    render(root);
    (root.querySelector('#login-name') as HTMLInputElement).value = 'X';
    (root.querySelector('#login-pin') as HTMLInputElement).value = '1234';
    root.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r, 30));
    expect(auth.login).not.toHaveBeenCalled();
    expect(root.querySelector('#login-error')?.textContent).toMatch(/obligatoires/);
  });

  it('validation : PIN court → message warn', async () => {
    render(root);
    (root.querySelector('#login-name') as HTMLInputElement).value = 'Kevin Test';
    (root.querySelector('#login-pin') as HTMLInputElement).value = '1';
    root.querySelector<HTMLFormElement>('#login-form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r, 30));
    expect(auth.login).not.toHaveBeenCalled();
  });
});

describe('landing — reset PIN', () => {
  it('reset sans nom → message warn dans #login-error', () => {
    render(root);
    root.querySelector<HTMLButtonElement>('#login-reset-pin')!.click();
    expect(root.querySelector('#login-error')?.textContent).toMatch(/Tape ton nom/);
  });

  it('reset avec nom + confirm → efface PIN keys', () => {
    /* Setup PIN */
    localStorage.setItem('apex_v13_pin', 'hash');
    localStorage.setItem('apex_v13_pin_kdmc_admin', 'hash2');
    localStorage.setItem('apex_v13_pin_fails_user1', '3');
    /* Mock confirm */
    const orig = globalThis.confirm;
    globalThis.confirm = () => true;
    try {
      render(root);
      (root.querySelector('#login-name') as HTMLInputElement).value = 'Kevin DESARZENS';
      root.querySelector<HTMLButtonElement>('#login-reset-pin')!.click();
      expect(localStorage.getItem('apex_v13_pin')).toBeNull();
      expect(localStorage.getItem('apex_v13_pin_kdmc_admin')).toBeNull();
      expect(localStorage.getItem('apex_v13_pin_fails_user1')).toBeNull();
      expect(root.querySelector('#login-error')?.textContent).toMatch(/PIN réinitialisé/);
    } finally {
      globalThis.confirm = orig;
    }
  });

  it('reset cancel confirm → no purge', () => {
    localStorage.setItem('apex_v13_pin', 'hash');
    const orig = globalThis.confirm;
    globalThis.confirm = () => false;
    try {
      render(root);
      (root.querySelector('#login-name') as HTMLInputElement).value = 'Kevin DESARZENS';
      root.querySelector<HTMLButtonElement>('#login-reset-pin')!.click();
      expect(localStorage.getItem('apex_v13_pin')).toBe('hash');
    } finally {
      globalThis.confirm = orig;
    }
  });
});

describe('landing — signup nav', () => {
  it('click signup → router.navigate("signup")', () => {
    render(root);
    root.querySelector<HTMLButtonElement>('#login-go-signup')!.click();
    expect(router.navigate).toHaveBeenCalledWith('signup');
  });
});

describe('landing — autoLogin', () => {
  it('device trusted + match fingerprint → loginTrusted + nav chat', async () => {
    localStorage.setItem('apex_v13_last_known_uid', 'kdmc');
    localStorage.setItem('apex_v13_last_known_name', 'Kevin');
    localStorage.setItem('apex_v13_device_trusted_v1', 'trusted-fp');
    render(root);
    /* Wait for auto-login */
    await new Promise((r) => setTimeout(r, 50));
    expect(auth.loginTrusted).toHaveBeenCalledWith('kdmc', 'Kevin');
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Reconnu'));
    expect(router.navigate).toHaveBeenCalledWith('chat');
  });

  it('device trusted mais fingerprint mismatch → purge + no auto-login', async () => {
    localStorage.setItem('apex_v13_last_known_uid', 'kdmc');
    localStorage.setItem('apex_v13_last_known_name', 'Kevin');
    localStorage.setItem('apex_v13_device_trusted_v1', 'WRONG-fp');
    render(root);
    await new Promise((r) => setTimeout(r, 50));
    expect(auth.loginTrusted).not.toHaveBeenCalled();
    expect(localStorage.getItem('apex_v13_device_trusted_v1')).toBeNull();
  });

  it('localStorage vide → no auto-login', async () => {
    render(root);
    await new Promise((r) => setTimeout(r, 50));
    expect(auth.loginTrusted).not.toHaveBeenCalled();
  });

  it('loginTrusted ok=false → no nav', async () => {
    localStorage.setItem('apex_v13_last_known_uid', 'kdmc');
    localStorage.setItem('apex_v13_last_known_name', 'Kevin');
    localStorage.setItem('apex_v13_device_trusted_v1', 'trusted-fp');
    (auth.loginTrusted as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    render(root);
    await new Promise((r) => setTimeout(r, 50));
    expect(router.navigate).not.toHaveBeenCalledWith('chat');
  });
});

describe('landing — dispose', () => {
  it('dispose nettoie scope sans throw', () => {
    render(root);
    expect(() => dispose()).not.toThrow();
    /* Re-dispose ne plante pas */
    expect(() => dispose()).not.toThrow();
  });

  it('re-render après dispose ok', () => {
    render(root);
    dispose();
    render(root);
    expect(root.querySelector('#login-form')).toBeTruthy();
  });
});
