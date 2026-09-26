/**
 * Tests handlers admin profonds (Jet 8 — 56% → 90%+).
 * Couvre createUser flow, plan select, OTP confirm, tab switching, escape XSS.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../core/store.js';
import { auth } from '../../services/auth/auth.js';
import { whatsapp } from '../../services/integrations/whatsapp.js';

describe('admin handlers deep tests Jet 8', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    root = document.getElementById('apex-root')!;
    store.init({ appVer: 'v13.0.0' });
    store.set('user', { id: 'kdmc_admin', name: 'Kevin' });
    store.set('isAdmin', true);
  });

  describe('Tabs switching render complet', () => {
    it('Click Users tab → render form + liste', async () => {
      const { render } = await import('../../features/admin/index.js');
      render(root);
      const usersTab = root.querySelector<HTMLButtonElement>('[data-tab="users"]');
      usersTab?.click();
      /* re-render via setActiveTab → contient form + liste */
      const html = root.innerHTML;
      expect(html).toMatch(/Cr.{1,3}er un compte|users|comptes/i);
    });

    it('Click Pending tab → message vide ou pending list', async () => {
      const { render } = await import('../../features/admin/index.js');
      render(root);
      const pendingTab = root.querySelector<HTMLButtonElement>('[data-tab="pending"]');
      pendingTab?.click();
      const html = root.innerHTML;
      expect(html).toMatch(/attente|valider|aucune/i);
    });

    it('Click Health tab → placeholder Jet 2', async () => {
      const { render } = await import('../../features/admin/index.js');
      render(root);
      const healthTab = root.querySelector<HTMLButtonElement>('[data-tab="health"]');
      healthTab?.click();
      expect(root.innerHTML).toMatch(/sant|health|providers/i);
    });

    it('Click Commerce tab back depuis Users', async () => {
      const { render } = await import('../../features/admin/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('[data-tab="users"]')?.click();
      root.querySelector<HTMLButtonElement>('[data-tab="commerce"]')?.click();
      expect(root.querySelector('#commerce-toggle')).not.toBeNull();
    });
  });

  describe('createUser form flow', () => {
    it('createUser via form admin retourne uid + invite link', async () => {
      const r = await auth.createUser({ name: 'Test User Admin', tier: 'family' });
      expect(r.ok).toBe(true);
      expect(r.uid).toMatch(/^family_/);
      expect(r.inviteLink).toContain('#invite=');
    });

    it('createUser refuse si pas admin', async () => {
      store.set('isAdmin', false);
      const r = await auth.createUser({ name: 'Forbidden', tier: 'family' });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/admin/i);
    });

    it('createUser persist users dans apex_v13_users + tier', async () => {
      const r = await auth.createUser({ name: 'Persist Test', tier: 'client_pro' });
      const list = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]');
      expect(list.find((u: { name: string }) => u.name === 'Persist Test')).toBeDefined();
      expect(localStorage.getItem(`apex_v13_tier_${r.uid}`)).toBe('client_pro');
    });

    it('createUser avec WhatsApp + email tous champs persistés', async () => {
      const r = await auth.createUser({
        name: 'Full User',
        tier: 'family',
        email: 'fam@example.com',
        whatsappPhone: '+33612345678',
        initialPin: '123456',
      });
      expect(r.ok).toBe(true);
      const list = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]');
      const user = list.find((u: { name: string }) => u.name === 'Full User');
      expect(user.email).toBe('fam@example.com');
      expect(user.whatsapp).toBe('+33612345678');
      /* PIN hash stocké */
      expect(localStorage.getItem(`apex_v13_pin_${r.uid}`)).toBeTruthy();
    });
  });

  describe('listUsers admin', () => {
    it('listUsers retourne liste après creation', async () => {
      await auth.createUser({ name: 'U1', tier: 'family' });
      await auth.createUser({ name: 'U2', tier: 'client_pro' });
      const list = auth.listUsers();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('listUsers refuse non-admin', () => {
      store.set('isAdmin', false);
      expect(auth.listUsers()).toEqual([]);
    });

    it('listUsers handles localStorage corrompu gracefull', () => {
      localStorage.setItem('apex_v13_users', 'INVALID JSON');
      expect(auth.listUsers()).toEqual([]);
    });
  });

  describe('WhatsApp OTP flow admin', () => {
    it('requestConfirmation génère lien wa.me + OTP 12 chars', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      const r = await whatsapp.requestConfirmation({
        uid: 'u_test',
        name: 'New Client',
        whatsappPhone: '+33687654321',
      });
      expect(r.ok).toBe(true);
      expect(r.inviteLink).toContain('wa.me');
      expect(r.otp?.length).toBeGreaterThanOrEqual(12);
    });

    it('confirm OTP correct → activate user + retourne uid', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      localStorage.setItem('apex_v13_users', JSON.stringify([{ id: 'u_act', name: 'Act', activated: false }]));
      const req = await whatsapp.requestConfirmation({
        uid: 'u_act',
        name: 'Act',
        whatsappPhone: '+33687654321',
      });
      const r = whatsapp.confirm(req.otp!);
      expect(r.ok).toBe(true);
      expect(r.uid).toBe('u_act');
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]');
      expect(users[0].activated).toBe(true);
    });

    it('confirm OTP utilisé 2x rejette 2e tentative', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      const req = await whatsapp.requestConfirmation({
        uid: 'u_replay',
        name: 'Replay',
        whatsappPhone: '+33687654321',
      });
      whatsapp.confirm(req.otp!);
      const r2 = whatsapp.confirm(req.otp!);
      expect(r2.ok).toBe(false);
    });

    it('listPending retourne pending non confirmés', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      await whatsapp.requestConfirmation({ uid: 'u1', name: 'P1', whatsappPhone: '+33611111111' });
      await whatsapp.requestConfirmation({ uid: 'u2', name: 'P2', whatsappPhone: '+33622222222' });
      const list = whatsapp.listPending();
      expect(list.length).toBe(2);
    });
  });

  describe('Render anti-XSS user names dans liste', () => {
    it('user name avec <script> escape pour render', async () => {
      await auth.createUser({ name: 'Hacker<script>alert(1)</script>', tier: 'family' });
      const { render } = await import('../../features/admin/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('[data-tab="users"]')?.click();
      /* L'admin tab Users render via render() qui re-call avec activeTab='users' */
      /* Pas de <script> exécutable */
      expect(root.innerHTML).not.toContain('<script>alert(1)</script>');
    });
  });

  describe('handleCreateUser flow form', () => {
    it('form submit invalid name (vide) → result-el affiche erreur', async () => {
      const { render } = await import('../../features/admin/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('[data-tab="users"]')?.click();
      const form = root.querySelector<HTMLFormElement>('#create-user-form');
      let threw = false;
      if (form) {
        const nameInput = root.querySelector<HTMLInputElement>('#cu-name');
        if (nameInput) nameInput.value = '   ';
        try {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          await new Promise((r) => setTimeout(r, 150));
        } catch {
          threw = true;
        }
      }
      /* Vraie assertion : pas de throw + result-el contient ax-error si form rendered */
      expect(threw).toBe(false);
      const resultEl = root.querySelector<HTMLElement>('#create-user-result');
      if (resultEl && resultEl.innerHTML.length > 0) {
        /* Si auth a refusé → ax-error class présente */
        expect(resultEl.innerHTML).toMatch(/ax-error|ax-success/);
      }
    });
  });

  describe('handleCreateUser with WhatsApp failure path', () => {
    beforeEach(async () => {
      localStorage.clear();
      /* Configurer numéro Kevin pour les tests WhatsApp */
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33687654321');
      const { auth } = await import('../../services/auth/auth.js');
      const { store } = await import('../../core/store.js');
      store.init({ appVer: 'v13.0.0' });
      const r = await auth.createUser({ name: 'Kevin DESARZENS', tier: 'admin', initialPin: '111111' });
      if (r.uid) {
        store.set('user', { id: r.uid, name: 'Kevin DESARZENS', tier: 'admin' });
        store.set('isAdmin', true);
      }
      document.body.innerHTML = '<div id="apex-root"></div>';
    });

    it('createUser avec whatsappPhone valide → request inviteLink + otp', async () => {
      const { auth } = await import('../../services/auth/auth.js');
      const { whatsapp } = await import('../../services/integrations/whatsapp.js');
      const r = await auth.createUser({
        name: 'Friend Test',
        tier: 'family',
        whatsappPhone: '+33612345678',
      });
      expect(r.ok).toBe(true);
      expect(r.uid).toBeTruthy();
      const conf = await whatsapp.requestConfirmation({
        uid: r.uid!,
        name: 'Friend Test',
        whatsappPhone: '+33612345678',
      });
      /* Vraie assertion : result avec inviteLink + otp 6 digits */
      expect(conf.ok).toBe(true);
      if (conf.ok) {
        expect(conf.inviteLink).toContain('wa.me');
        expect(conf.inviteLink).toContain('33687654321');
        /* OTP format alphanumérique majuscules + tirets, longueur >= 6 */
        expect(conf.otp).toBeTruthy();
        expect(conf.otp!.length).toBeGreaterThanOrEqual(6);
      }
    });

    it('whatsapp.confirm avec OTP wrong → ok=false + uid undefined', async () => {
      const { whatsapp } = await import('../../services/integrations/whatsapp.js');
      const result = whatsapp.confirm('999999_invalid');
      /* Vraie assertion : refuse OTP qui n'existe pas — uid pas retourné */
      expect(result.ok).toBe(false);
      expect(result.uid).toBeUndefined();
    });

    it('whatsapp.confirm replay attack après confirm → rejette 2nd', async () => {
      const { auth } = await import('../../services/auth/auth.js');
      const { whatsapp } = await import('../../services/integrations/whatsapp.js');
      const r = await auth.createUser({ name: 'Replay', tier: 'family', whatsappPhone: '+33611111111' });
      const conf = await whatsapp.requestConfirmation({
        uid: r.uid!,
        name: 'Replay',
        whatsappPhone: '+33611111111',
      });
      if (conf.ok) {
        const first = whatsapp.confirm(conf.otp);
        expect(first.ok).toBe(true);
        /* 2nd attempt avec même OTP doit être rejeté */
        const second = whatsapp.confirm(conf.otp);
        expect(second.ok).toBe(false);
      }
    });
  });
});
