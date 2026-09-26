/**
 * APEX v13 — Test WhatsApp validation clients/comptes (Kevin règle "WhatsApp fonctionnel")
 *
 * Vérifie le flow complet :
 * 1. Kevin configure son numéro WhatsApp (ax_kevin_whatsapp_phone)
 * 2. Nouveau client → requestConfirmation() génère OTP + lien wa.me
 * 3. Kevin reçoit OTP via WhatsApp → confirm(otp) active le compte
 * 4. listPending() retourne les confirmations en attente
 * 5. OTP expire après 24h
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { whatsapp } from '../../services/integrations/whatsapp.js';

describe('WhatsApp validation clients/comptes (Kevin v13.0.80)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Configuration Kevin WhatsApp phone', () => {
    it('getKevinWhatsApp retourne string vide si pas configuré', () => {
      expect(whatsapp.getKevinWhatsApp()).toBe('');
    });

    it('getKevinWhatsApp retourne le numéro Kevin une fois stocké', () => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      expect(whatsapp.getKevinWhatsApp()).toBe('+33612345678');
    });
  });

  describe('Flow OTP requestConfirmation', () => {
    beforeEach(() => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
    });

    it('requestConfirmation refuse si Kevin phone pas configuré', async () => {
      localStorage.removeItem('ax_kevin_whatsapp_phone');
      const result = await whatsapp.requestConfirmation({
        uid: 'client_001',
        name: 'Marc Dupont',
        whatsappPhone: '+33611111111',
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('non configuré');
    });

    it('requestConfirmation génère OTP 12 chars + lien wa.me + persiste', async () => {
      const result = await whatsapp.requestConfirmation({
        uid: 'client_002',
        name: 'Sophie Martin',
        whatsappPhone: '+33622222222',
      });
      expect(result.ok).toBe(true);
      expect(result.otp).toBeDefined();
      /* OTP format XXXXXX-XXXXXX = 13 chars (12 + 1 tiret) */
      expect(result.otp?.length).toBe(13);
      expect(result.otp).toMatch(/^[A-Z2-9]{6}-[A-Z2-9]{6}$/);
      expect(result.inviteLink).toContain('wa.me/33612345678');
      expect(result.inviteLink).toContain(encodeURIComponent('Sophie Martin'));
      expect(result.inviteLink).toContain(encodeURIComponent(result.otp ?? ''));
    });

    it('requestConfirmation persiste dans apex_v13_pending_confirms', async () => {
      await whatsapp.requestConfirmation({
        uid: 'client_003',
        name: 'Jean Dupond',
        whatsappPhone: '+33633333333',
      });
      const raw = localStorage.getItem('apex_v13_pending_confirms');
      expect(raw).toBeTruthy();
      const list = JSON.parse(raw!) as Array<{ uid: string; name: string; otp: string }>;
      expect(list.find((p) => p.uid === 'client_003')).toBeDefined();
    });

    it('OTP utilise alphabet sans 0/O/1/I/L pour lisibilité', async () => {
      for (let i = 0; i < 20; i++) {
        const result = await whatsapp.requestConfirmation({
          uid: `client_${i}`,
          name: `User ${i}`,
          whatsappPhone: '+33600000000',
        });
        expect(result.otp).not.toMatch(/[01OIL]/);
      }
    });
  });

  describe('Flow OTP confirm', () => {
    beforeEach(() => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
      localStorage.setItem(
        'apex_v13_users',
        JSON.stringify([{ id: 'client_004', activated: false }]),
      );
    });

    it('confirm refuse OTP invalide', () => {
      const result = whatsapp.confirm('FAKE12-INVALID');
      expect(result.ok).toBe(false);
    });

    it('confirm valide OTP correct + active compte', async () => {
      const req = await whatsapp.requestConfirmation({
        uid: 'client_004',
        name: 'Client à valider',
        whatsappPhone: '+33644444444',
      });
      expect(req.otp).toBeDefined();
      const conf = whatsapp.confirm(req.otp!);
      expect(conf.ok).toBe(true);
      expect(conf.uid).toBe('client_004');
      /* Vérifier que le compte est activé */
      const users = JSON.parse(localStorage.getItem('apex_v13_users')!) as Array<{ id: string; activated: boolean }>;
      const user = users.find((u) => u.id === 'client_004');
      expect(user?.activated).toBe(true);
    });

    it('confirm refuse OTP déjà utilisé (anti-replay)', async () => {
      const req = await whatsapp.requestConfirmation({
        uid: 'client_004',
        name: 'Client',
        whatsappPhone: '+33645555555',
      });
      whatsapp.confirm(req.otp!);
      /* Re-confirm même OTP → doit refuser */
      const replay = whatsapp.confirm(req.otp!);
      expect(replay.ok).toBe(false);
    });
  });

  describe('listPending', () => {
    beforeEach(() => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
    });

    it('listPending retourne array vide si aucune confirmation', () => {
      expect(whatsapp.listPending()).toEqual([]);
    });

    it('listPending retourne confirmations actives non confirmées', async () => {
      await whatsapp.requestConfirmation({ uid: 'a', name: 'A', whatsappPhone: '+1' });
      await whatsapp.requestConfirmation({ uid: 'b', name: 'B', whatsappPhone: '+2' });
      const pending = whatsapp.listPending();
      expect(pending.length).toBe(2);
      expect(pending.map((p) => p.uid).sort()).toEqual(['a', 'b']);
    });

    it('listPending exclut les confirmations confirmées', async () => {
      const req = await whatsapp.requestConfirmation({ uid: 'c', name: 'C', whatsappPhone: '+3' });
      whatsapp.confirm(req.otp!);
      const pending = whatsapp.listPending();
      expect(pending.find((p) => p.uid === 'c')).toBeUndefined();
    });

    it('listPending exclut les confirmations expirées', async () => {
      await whatsapp.requestConfirmation({ uid: 'd', name: 'D', whatsappPhone: '+4' });
      /* Force expiry */
      const list = JSON.parse(localStorage.getItem('apex_v13_pending_confirms')!) as Array<{ uid: string; expiresAt: number }>;
      const expired = list.find((p) => p.uid === 'd');
      if (expired) expired.expiresAt = Date.now() - 1000;
      localStorage.setItem('apex_v13_pending_confirms', JSON.stringify(list));
      const pending = whatsapp.listPending();
      expect(pending.find((p) => p.uid === 'd')).toBeUndefined();
    });
  });

  describe('Sécurité OTP', () => {
    beforeEach(() => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33612345678');
    });

    it('OTPs uniques sur 100 générations', async () => {
      const otps = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const r = await whatsapp.requestConfirmation({
          uid: `u${i}`, name: `User ${i}`, whatsappPhone: `+${i}`,
        });
        if (r.otp) otps.add(r.otp);
      }
      expect(otps.size).toBe(100); /* Tous uniques */
    });

    it('OTP format alphanumérique sans confusion', async () => {
      const r = await whatsapp.requestConfirmation({
        uid: 'sec', name: 'Sec', whatsappPhone: '+99',
      });
      expect(r.otp).toMatch(/^[A-Z2-9]{6}-[A-Z2-9]{6}$/);
    });
  });

  describe('Lien wa.me format', () => {
    beforeEach(() => {
      localStorage.setItem('ax_kevin_whatsapp_phone', '+33 6 12 34 56 78');
    });

    it('numéro Kevin nettoyé (espaces retirés) dans lien', async () => {
      const r = await whatsapp.requestConfirmation({
        uid: 'fmt', name: 'Format', whatsappPhone: '+1',
      });
      expect(r.inviteLink).toContain('wa.me/33612345678');
      expect(r.inviteLink).not.toContain(' ');
    });

    it('message pré-rempli contient nom + OTP', async () => {
      const r = await whatsapp.requestConfirmation({
        uid: 'msg', name: 'Marc', whatsappPhone: '+1',
      });
      const decoded = decodeURIComponent(r.inviteLink ?? '');
      expect(decoded).toContain('Marc');
      expect(decoded).toContain('Apex');
      expect(decoded).toContain(r.otp ?? '');
    });
  });
});
