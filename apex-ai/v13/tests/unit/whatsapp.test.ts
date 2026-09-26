import { describe, it, expect, beforeEach } from 'vitest';
import { whatsapp } from '../../services/integrations/whatsapp.js';

describe('whatsapp service (tests Jet 6.5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getKevinWhatsApp', () => {
    it('retourne string vide si pas configuré', () => {
      expect(whatsapp.getKevinWhatsApp()).toBe('');
    });

    it('retourne valeur stockée', () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      expect(whatsapp.getKevinWhatsApp()).toBe('+33612345678');
    });
  });

  describe('requestConfirmation', () => {
    it('refuse si pas de Kevin WhatsApp configuré', async () => {
      const r = await whatsapp.requestConfirmation({
        uid: 'u1',
        name: 'Test',
        whatsappPhone: '+33612345678',
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Kevin');
    });

    it('génère lien wa.me + OTP si Kevin configuré', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      const r = await whatsapp.requestConfirmation({
        uid: 'u_new',
        name: 'NewClient',
        whatsappPhone: '+33687654321',
      });
      expect(r.ok).toBe(true);
      expect(r.inviteLink).toContain('wa.me/');
      expect(r.inviteLink).toContain('33612345678'); /* numéro Kevin */
      expect(r.otp).toBeTruthy();
      expect(r.otp?.length).toBeGreaterThanOrEqual(6); /* OTP 12 chars XXXXXX-XXXXXX */
    });

    it('OTP enregistré dans pending list', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      await whatsapp.requestConfirmation({
        uid: 'u_pending',
        name: 'Pending',
        whatsappPhone: '+33687654321',
      });
      const pending = whatsapp.listPending();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending[0]?.uid).toBe('u_pending');
    });
  });

  describe('confirm', () => {
    it('false si OTP inconnu', () => {
      const r = whatsapp.confirm('UNKNOWN-CODE');
      expect(r.ok).toBe(false);
    });

    it('OK si OTP correspond à pending non confirmé', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      const reqResult = await whatsapp.requestConfirmation({
        uid: 'u_confirm',
        name: 'ToConfirm',
        whatsappPhone: '+33687654321',
      });
      const otp = reqResult.otp;
      expect(otp).toBeTruthy();
      const confirmResult = whatsapp.confirm(otp!);
      expect(confirmResult.ok).toBe(true);
      expect(confirmResult.uid).toBe('u_confirm');
    });

    it('OTP marqué confirmed après usage (pas re-utilisable)', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      const reqResult = await whatsapp.requestConfirmation({
        uid: 'u_once',
        name: 'OneTime',
        whatsappPhone: '+33687654321',
      });
      whatsapp.confirm(reqResult.otp!);
      const second = whatsapp.confirm(reqResult.otp!);
      expect(second.ok).toBe(false); /* déjà confirmé */
    });
  });

  describe('listPending', () => {
    it('retourne array vide par défaut', () => {
      expect(whatsapp.listPending()).toEqual([]);
    });
  });

  describe('catches localStorage corrompu (campagne 100% — branches atteignables)', () => {
    it('requestConfirmation : persist JSON invalide → catch (67), ne throw pas', async () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      localStorage.setItem('apex_v13_pending_confirms', '{bad json');
      const r = await whatsapp.requestConfirmation({ uid: 'u1', name: 'T', whatsappPhone: '+33611111111' });
      expect(r).toBeDefined();
    });

    it('confirm : JSON invalide → catch (100) → ok=false', () => {
      localStorage.setItem('apex_v13_pending_confirms', '{bad json');
      const r = whatsapp.confirm('ABCDEF-GHJKMN');
      expect(r.ok).toBe(false);
    });

    it('listPending : JSON invalide → catch (110) → []', () => {
      localStorage.setItem('apex_v13_pending_confirms', '{bad json');
      expect(whatsapp.listPending()).toEqual([]);
    });
  });
});
