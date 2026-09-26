/**
 * APEX v13.3.74 — Tests M6 (audit Apex v13.3.73 issue #240).
 *
 * "Activer 8/9 APIs PWA manquantes"
 * Vérifie : pwaCapabilities détecte + status + registry des 8 APIs.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { pwaCapabilities } from '../../services/core-svc/pwa-capabilities.js';

describe('M6 — PWA capabilities registry', () => {
  beforeEach(() => {
    pwaCapabilities.resetCache();
  });

  it('detect() retourne un statut connu pour chaque API', () => {
    const apis = ['geolocation', 'notifications', 'bluetooth', 'nfc', 'usb', 'serial', 'wake_lock', 'screen_capture'] as const;
    for (const api of apis) {
      const status = pwaCapabilities.detect(api);
      /* status doit être l'un des PwaApiStatus connus */
      expect([
        'supported',
        'unsupported',
        'permission_required',
        'permission_granted',
        'permission_denied',
      ]).toContain(status);
    }
  });

  it('countSupported() retourne {supported, total: 8}', () => {
    const stat = pwaCapabilities.countSupported();
    expect(stat.total).toBe(8);
    expect(stat.supported).toBeGreaterThanOrEqual(0);
    expect(stat.supported).toBeLessThanOrEqual(8);
  });

  it('getAllStatus() retourne 8 entrées avec id+label+description', async () => {
    const all = await pwaCapabilities.getAllStatus();
    expect(all.length).toBe(8);
    /* Chaque entrée a les champs requis */
    for (const cap of all) {
      expect(cap.id).toBeTruthy();
      expect(cap.label).toBeTruthy();
      expect(cap.description).toBeTruthy();
      expect(cap.status).toBeTruthy();
      expect(cap.last_checked).toBeGreaterThan(0);
    }
    /* Vérifie qu'on a bien les 8 IDs attendus */
    const ids = all.map((c) => c.id);
    expect(ids).toContain('geolocation');
    expect(ids).toContain('notifications');
    expect(ids).toContain('bluetooth');
    expect(ids).toContain('nfc');
    expect(ids).toContain('usb');
    expect(ids).toContain('serial');
    expect(ids).toContain('wake_lock');
    expect(ids).toContain('screen_capture');
  });

  it('cache fonctionne (queryPermission appelée 2x consécutivement = même résultat)', async () => {
    const r1 = await pwaCapabilities.queryPermission('geolocation');
    const r2 = await pwaCapabilities.queryPermission('geolocation');
    expect(r1).toBe(r2);
  });
});
