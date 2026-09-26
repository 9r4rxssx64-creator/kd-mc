/**
 * APEX v13.3.64 — Tests admin reset PIN cross-device (Kevin 2026-05-08).
 *
 * Couvre :
 *  - adminCommands.resetUserPin() : validation tier + whitelist target + push FB
 *  - apex-tools registry : tool reset_user_pin présent + impactLevel C
 *  - apex-tools-dispatch : refuse non-admin (impactLevel C → validation token)
 *  - admin-commands-listener : exécute reset si target match, ignore sinon, ignore non-admin issuer
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { ADMIN_ID } from '../../core/bootstrap.js';
import { events } from '../../core/events.js';
import { store } from '../../core/store.js';
import { adminCommands, type AdminCommand } from '../../services/admin/admin-commands.js';
import { adminCommandsListener } from '../../services/admin/admin-commands-listener.js';
import { apexTools } from '../../services/core-svc/apex-tools.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';

const FB_KEY = 'ax_admin_commands_pending';

describe('Admin reset PIN cross-device (v13.3.64)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset listener interne pour isolation stricte entre tests */
    try {
      adminCommandsListener.__resetForTests();
    } catch { /* ignore */ }
    /* Initialise store avec admin Kevin par défaut (override per-test si besoin) */
    try {
      store.init({ appVer: 'v13.3.64' });
    } catch { /* déjà init dans setup global */ }
  });

  describe('Tool registry', () => {
    it('reset_user_pin présent dans registry', () => {
      const tool = apexTools.getByName('reset_user_pin');
      expect(tool).toBeTruthy();
      expect(tool?.minTier).toBe('admin');
      expect(tool?.impactLevel).toBe('C');
    });

    it('reset_user_pin requires target_uid', () => {
      const tool = apexTools.getByName('reset_user_pin');
      expect(tool?.inputSchema.required).toContain('target_uid');
    });

    it('non-admin tier ne peut pas exécuter reset_user_pin', () => {
      const check = apexTools.canExecute('reset_user_pin', 'laurence');
      expect(check.allowed).toBe(false);
    });

    it('admin peut exécuter sans validation token (impactLevel C → admin bypass)', () => {
      const check = apexTools.canExecute('reset_user_pin', 'admin');
      expect(check.allowed).toBe(true);
      expect(check.requires_validation).toBe(false);
    });
  });

  describe('adminCommands.resetUserPin (issuer)', () => {
    it('refuse si user courant n\'est pas admin', async () => {
      store.set('user', { id: 'laurence_sp', name: 'Laurence' });
      const r = await adminCommands.resetUserPin('laurence_sp', 'oubli PIN');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/admin/i);
    });

    it('refuse target_uid vide', async () => {
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      const r = await adminCommands.resetUserPin('', '');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/requis/i);
    });

    it('refuse target_uid = admin Kevin (interdit)', async () => {
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      const r = await adminCommands.resetUserPin(ADMIN_ID, '');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/admin Kevin/i);
    });

    it('refuse target_uid hors whitelist', async () => {
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      const r = await adminCommands.resetUserPin('inconnu_xyz', '');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/inconnu|whitelist/i);
    });

    it('admin Kevin peut reset Laurence → push FB pending', async () => {
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      const r = await adminCommands.resetUserPin('laurence_sp', 'oubli PIN');
      expect(r.ok).toBe(true);
      expect(r.command_id).toMatch(/^cmd_/);

      const pending = adminCommands.listPending();
      expect(pending.length).toBe(1);
      const first = pending[0];
      expect(first?.target_uid).toBe('laurence_sp');
      expect(first?.command).toBe('reset_pin');
      expect(first?.issued_by).toBe(ADMIN_ID);
      expect(first?.processed).toBe(false);
      expect(first?.reason).toBe('oubli PIN');
    });

    it('plusieurs commands s\'accumulent dans pending (cap FIFO)', async () => {
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      await adminCommands.resetUserPin('laurence_sp', 'r1');
      await adminCommands.resetUserPin('laurence_sp', 'r2');
      const pending = adminCommands.listPending();
      expect(pending.length).toBe(2);
    });
  });

  describe('admin-commands-listener (receiver)', () => {
    it('startListening idempotent', () => {
      adminCommandsListener.startListening();
      adminCommandsListener.startListening();
      expect(adminCommandsListener.isListening()).toBe(true);
    });

    it('exécute reset si target_uid match user courant + issued_by = admin', async () => {
      /* Setup user courant = Laurence sur cet iPhone */
      store.set('user', { id: 'laurence_sp', name: 'Laurence' });
      /* Setup PIN existant (à reset) */
      localStorage.setItem('apex_v13_pin_laurence_sp', 'hash:abc123');
      localStorage.setItem('apex_v13_pin_fails_laurence_sp', '2');

      adminCommandsListener.startListening();

      /* Push command via firebase event (simule SSE remote_change) */
      const cmd: AdminCommand = {
        id: 'cmd_test_1',
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: ADMIN_ID,
        ts: Date.now(),
        reason: 'test',
        processed: false,
      };
      events.emit('firebase:remote_change', { key: FB_KEY, data: [cmd] });

      /* Attente micro-task pour async dans handler */
      await new Promise((resolve) => setTimeout(resolve, 50));

      /* PIN doit être effacé */
      expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBeNull();
      expect(localStorage.getItem('apex_v13_pin_fails_laurence_sp')).toBeNull();
    });

    it('IGNORE command si target_uid ≠ user courant (broadcast safety)', async () => {
      /* User courant = Kevin admin, target = Laurence → ne doit RIEN faire localement */
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      localStorage.setItem('apex_v13_pin_laurence_sp', 'hash:original');

      adminCommandsListener.startListening();

      const cmd: AdminCommand = {
        id: 'cmd_test_2',
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: ADMIN_ID,
        ts: Date.now(),
        processed: false,
      };
      events.emit('firebase:remote_change', { key: FB_KEY, data: [cmd] });
      await new Promise((resolve) => setTimeout(resolve, 50));

      /* PIN intact (Kevin n'a pas effacé celui de Laurence sur son propre device) */
      expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBe('hash:original');
    });

    it('IGNORE command si issued_by ≠ ADMIN_ID (anti-impersonation)', async () => {
      store.set('user', { id: 'laurence_sp', name: 'Laurence' });
      localStorage.setItem('apex_v13_pin_laurence_sp', 'hash:original');

      adminCommandsListener.startListening();

      /* Tentative malicieuse : un user random push une commande */
      const cmd: AdminCommand = {
        id: 'cmd_evil',
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: 'evil_user', /* PAS admin */
        ts: Date.now(),
        processed: false,
      };
      events.emit('firebase:remote_change', { key: FB_KEY, data: [cmd] });
      await new Promise((resolve) => setTimeout(resolve, 50));

      /* PIN intact car issuer non admin */
      expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBe('hash:original');
    });

    it('IGNORE command déjà processed', async () => {
      store.set('user', { id: 'laurence_sp', name: 'Laurence' });
      localStorage.setItem('apex_v13_pin_laurence_sp', 'hash:original');

      adminCommandsListener.startListening();

      const cmd: AdminCommand = {
        id: 'cmd_processed',
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: ADMIN_ID,
        ts: Date.now(),
        processed: true, /* déjà fait */
      };
      events.emit('firebase:remote_change', { key: FB_KEY, data: [cmd] });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBe('hash:original');
    });

    it('IGNORE remote_change sur autre clé (key filter)', async () => {
      store.set('user', { id: 'laurence_sp', name: 'Laurence' });
      localStorage.setItem('apex_v13_pin_laurence_sp', 'hash:original');

      adminCommandsListener.startListening();

      const cmd: AdminCommand = {
        id: 'cmd_other_key',
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: ADMIN_ID,
        ts: Date.now(),
      };
      events.emit('firebase:remote_change', { key: 'ax_unrelated_key', data: [cmd] });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBe('hash:original');
    });

    it('marque command processed=true après exécution (cleanup)', async () => {
      store.set('user', { id: 'laurence_sp', name: 'Laurence' });
      localStorage.setItem('apex_v13_pin_laurence_sp', 'hash:abc');

      adminCommandsListener.startListening();

      const cmd: AdminCommand = {
        id: 'cmd_cleanup_1',
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: ADMIN_ID,
        ts: Date.now(),
        processed: false,
      };
      /* Simule que la liste est aussi dans localStorage (comme firebase la persiste) */
      localStorage.setItem(FB_KEY, JSON.stringify([cmd]));
      events.emit('firebase:remote_change', { key: FB_KEY, data: [cmd] });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stored = JSON.parse(localStorage.getItem(FB_KEY) ?? '[]') as AdminCommand[];
      expect(stored.length).toBe(1);
      expect(stored[0]?.processed).toBe(true);
    });
  });

  describe('apex-tools-dispatch integration', () => {
    it('client_pro tier refusé pour reset_user_pin (tier insuffisant)', async () => {
      const r = await apexToolsDispatch.execute(
        'reset_user_pin',
        { target_uid: 'laurence_sp' },
        'client_pro',
      );
      expect(r.ok).toBe(false);
    });

    it('admin tier exécute reset_user_pin via dispatch', async () => {
      store.set('user', { id: ADMIN_ID, name: 'Kevin' });
      const r = await apexToolsDispatch.execute(
        'reset_user_pin',
        { target_uid: 'laurence_sp', reason: 'test dispatch' },
        'admin',
      );
      expect(r.ok).toBe(true);
      const result = r.result as { ok?: boolean; command_id?: string };
      expect(result?.ok).toBe(true);
      expect(result?.command_id).toMatch(/^cmd_/);
    });
  });
});
