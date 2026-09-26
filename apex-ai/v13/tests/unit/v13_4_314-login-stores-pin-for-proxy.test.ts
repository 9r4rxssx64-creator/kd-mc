/**
 * Régression v13.4.314 — Kevin 2026-06-08 :
 * « Tout est vert (22/22 providers actifs) mais TOUTES les IA sont KO, il me
 *  demande une clé. »
 *
 * Cause (Erreur #28 — déclaré mais jamais déployé) : le proxy Cloudflare
 * apex-secrets-proxy s'authentifie via sha256(PIN admin EN CLAIR) lu depuis le
 * vault à `ax_pin_kdmc_admin` (getAdminPinHash / tryProxyRoute), MAIS aucun code
 * n'écrivait jamais cette clé → PIN absent → proxy ignoré → appels IA en direct
 * sans clé locale → 401 « clé invalide » → "Toutes les IA sont KO". Le /health
 * (sans auth) répondait quand même → "22/22 actifs" trompeur.
 *
 * Fix : auth.login() stocke le PIN (chiffré AES-GCM via vault.setKey) au login
 * admin. Ce test garantit que la clé d'auth proxy est bien remplie.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { auth } from '../../services/auth/auth.js';
import { vault } from '../../services/vault/vault.js';

describe('v13.4.314 — login admin remplit ax_pin_kdmc_admin (auth proxy)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('avant login : la clé d’auth proxy est vide', async () => {
    expect(await vault.readKey('ax_pin_kdmc_admin')).toBe('');
  });

  it('après login PIN admin : ax_pin_kdmc_admin contient le PIN (proxy peut s’authentifier)', async () => {
    const r = await auth.login('Kevin DESARZENS', '200807');
    expect(r.ok).toBe(true);
    expect(await vault.readKey('ax_pin_kdmc_admin')).toBe('200807');
  });
});
