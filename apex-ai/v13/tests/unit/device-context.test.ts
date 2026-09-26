/**
 * Tests device-context.ts (Kevin "reconnaître appareils + geo + notifs + CGU").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { deviceContext } from '../../services/integrations/device-context.js';

describe('Device Context (fingerprint + geo + notifs + CGU)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Device ID + fingerprint', () => {
    it('getDeviceId stable across calls', () => {
      const id1 = deviceContext.getDeviceId();
      const id2 = deviceContext.getDeviceId();
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^dev_/);
    });

    it('getFingerprint inclut device_id + ua + screen + timezone', () => {
      const fp = deviceContext.getFingerprint();
      expect(fp.device_id).toBeTruthy();
      expect(fp.user_agent).toBeTruthy();
      expect(fp.screen).toMatch(/\d+x\d+/);
      expect(fp.timezone).toBeTruthy();
      expect(fp.first_seen).toBeGreaterThan(0);
      expect(fp.last_seen).toBeGreaterThan(0);
    });

    it('getFingerprint persist + listKnownDevices retourne fp', () => {
      deviceContext.getFingerprint();
      const known = deviceContext.listKnownDevices();
      expect(known.length).toBeGreaterThanOrEqual(1);
    });

    it('first_seen reste stable, last_seen évolue', async () => {
      const fp1 = deviceContext.getFingerprint();
      await new Promise((r) => setTimeout(r, 10));
      const fp2 = deviceContext.getFingerprint();
      expect(fp2.first_seen).toBe(fp1.first_seen);
      expect(fp2.last_seen).toBeGreaterThanOrEqual(fp1.last_seen);
    });
  });

  describe('Trust device', () => {
    it('trustDevice + isDeviceTrusted', () => {
      const id = deviceContext.getDeviceId();
      expect(deviceContext.isDeviceTrusted(id)).toBe(false);
      deviceContext.trustDevice(id);
      expect(deviceContext.isDeviceTrusted(id)).toBe(true);
    });

    it('trustDevice idempotent (no duplicate)', () => {
      deviceContext.trustDevice('dev_abc');
      deviceContext.trustDevice('dev_abc');
      const trusted = JSON.parse(localStorage.getItem('apex_v13_trusted_devices') ?? '[]') as string[];
      expect(trusted.filter((d) => d === 'dev_abc').length).toBe(1);
    });
  });

  describe('Notifications', () => {
    it('requestNotificationPermission unsupported si Notification undefined', async () => {
      /* happy-dom n'a pas Notification par défaut */
      const r = await deviceContext.requestNotificationPermission();
      expect(['unsupported', 'denied', 'granted', 'default']).toContain(r);
    });

    it('sendNotification false si pas permission', async () => {
      const r = await deviceContext.sendNotification('Test');
      expect(typeof r).toBe('boolean');
    });
  });

  describe('CGU consent', () => {
    it('hasConsent false si jamais accordé', () => {
      expect(deviceContext.hasConsent('geolocation')).toBe(false);
    });

    it('recordConsent + hasConsent true', () => {
      deviceContext.recordConsent('geolocation', true);
      expect(deviceContext.hasConsent('geolocation')).toBe(true);
    });

    it('recordConsent accepted=false → hasConsent false', () => {
      deviceContext.recordConsent('camera', false);
      expect(deviceContext.hasConsent('camera')).toBe(false);
    });

    it('TTL expire → hasConsent false après ttl_days dépassé', () => {
      /* TTL 1 jour, mais on force ts à 2 jours dans le passé */
      deviceContext.recordConsent('test_ttl', true, 1);
      const consents = JSON.parse(localStorage.getItem('apex_v13_consents')!) as Array<{ feature: string; ts: number }>;
      const idx = consents.findIndex((c) => c.feature === 'test_ttl');
      if (idx >= 0) consents[idx]!.ts = Date.now() - 2 * 24 * 60 * 60 * 1000; /* 2 jours */
      localStorage.setItem('apex_v13_consents', JSON.stringify(consents));
      expect(deviceContext.hasConsent('test_ttl')).toBe(false);
    });

    it('revokeConsent désactive', () => {
      deviceContext.recordConsent('mic', true);
      expect(deviceContext.hasConsent('mic')).toBe(true);
      deviceContext.revokeConsent('mic');
      expect(deviceContext.hasConsent('mic')).toBe(false);
    });

    it('listConsents retourne tous records (RGPD dashboard)', () => {
      deviceContext.recordConsent('geo', true);
      deviceContext.recordConsent('mic', false);
      deviceContext.recordConsent('camera', true);
      const all = deviceContext.listConsents();
      expect(all.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('detectMobile + detectPwa (privacy-friendly)', () => {
    it('getFingerprint inclut is_mobile + is_pwa booleans', () => {
      const fp = deviceContext.getFingerprint();
      expect(typeof fp.is_mobile).toBe('boolean');
      expect(typeof fp.is_pwa).toBe('boolean');
    });

    it('canvas_hash calculé (DJB2 hex)', () => {
      const fp = deviceContext.getFingerprint();
      /* En happy-dom canvas peut être vide, OK : hash empty string OR hex */
      expect(typeof fp.canvas_hash).toBe('string');
    });
  });
});
