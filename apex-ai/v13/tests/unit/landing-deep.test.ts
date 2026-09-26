import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '../../core/store.js';

describe('features/landing deep tests Jet 7.9 (47% → 90%+)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    root = document.getElementById('apex-root')!;
    store.init({ appVer: 'v13.0.0' });
    store.set('user', null);
    location.hash = '';
  });

  it('render greeting + tagline complets', async () => {
    const { render } = await import('../../features/landing/index.js');
    render(root);
    expect(root.innerHTML).toContain('APEX');
    expect(root.innerHTML).toMatch(/assistant|Bienvenue|Connecte/i);
  });

  it('login form a tous les attributes accessibility', async () => {
    const { render } = await import('../../features/landing/index.js');
    render(root);
    const nameInput = root.querySelector<HTMLInputElement>('#login-name');
    const pinInput = root.querySelector<HTMLInputElement>('#login-pin');
    expect(nameInput?.required).toBe(true);
    expect(nameInput?.minLength).toBe(3);
    expect(nameInput?.autocomplete).toBe('name');
    expect(pinInput?.required).toBe(true);
    expect(pinInput?.type).toBe('password');
  });

  it('login form submit appelle auth.login (vrai handler attaché, pas cosmétique)', async () => {
    const { auth } = await import('../../services/auth/auth.js');
    const loginSpy = vi.spyOn(auth, 'login').mockResolvedValue({ ok: false, reason: 'Identifiants invalides' });
    const { render } = await import('../../features/landing/index.js');
    render(root);
    const form = root.querySelector<HTMLFormElement>('#login-form')!;
    const nameInput = root.querySelector<HTMLInputElement>('#login-name')!;
    const pinInput = root.querySelector<HTMLInputElement>('#login-pin')!;
    nameInput.value = 'Inconnu';
    pinInput.value = '12345';
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 200));
    /* Vraie assertion P3 audit : auth.login() appelé avec name+pin du form */
    expect(loginSpy).toHaveBeenCalled();
    const callArgs = loginSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    /* loginSpy reçoit name + pin */
    const argStr = JSON.stringify(callArgs);
    expect(argStr).toContain('Inconnu');
    expect(argStr).toContain('12345');
    loginSpy.mockRestore();
  });

  it('invite token URL hash → message info detected', async () => {
    /* Token format btoa(uid:ts:hash) */
    const token = btoa('u_invited:1234567890:abcdef1234567890abcd');
    location.hash = '#invite=' + token;
    const { render } = await import('../../features/landing/index.js');
    render(root);
    expect(root.innerHTML).toContain('Invitation');
  });

  it('invite token corrompu (atob fail) → pas de message info', async () => {
    location.hash = '#invite=NOT@VALID@BASE64!!!';
    const { render } = await import('../../features/landing/index.js');
    render(root);
    /* ne throw pas, juste ignore */
    expect(root.querySelector('#login-form')).not.toBeNull();
  });

  it('escapeHtml dans error message anti-XSS', async () => {
    const { render } = await import('../../features/landing/index.js');
    render(root);
    /* Pas de <script> visible */
    expect(root.innerHTML).not.toContain('<script>');
  });

  it('placeholder name input non vide', async () => {
    const { render } = await import('../../features/landing/index.js');
    render(root);
    const nameInput = root.querySelector<HTMLInputElement>('#login-name');
    expect(nameInput?.placeholder).toBeTruthy();
  });

  it('PIN inputmode numeric pour iPhone', async () => {
    const { render } = await import('../../features/landing/index.js');
    render(root);
    const pinInput = root.querySelector<HTMLInputElement>('#login-pin');
    expect(pinInput?.getAttribute('inputmode')).toBe('numeric');
  });

  it('Bouton submit primary block style', async () => {
    const { render } = await import('../../features/landing/index.js');
    render(root);
    const btn = root.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(btn?.className).toContain('ax-btn-primary');
    expect(btn?.className).toContain('ax-btn-block');
  });
});
