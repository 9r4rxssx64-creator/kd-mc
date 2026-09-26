/**
 * APEX v13 — Admin Action Gate (P0 sécu fix v13.0.13).
 *
 * Demande Kevin (audit v13.0.10 SECU 67/100) :
 * "WebAuthn obligatoire admin Kevin" — actions sensibles doivent passer biométrie.
 *
 * Wraps les actions destructrices/sensibles avec WebAuthn verify obligatoire.
 *
 * Actions protégées :
 * - toggleCommerce (active/désactive paiements)
 * - setUserPlan (change plan d'un user)
 * - eraseAccount (RGPD delete cascade)
 * - exportData (RGPD export complet)
 * - changePin / changePassphrase
 * - rotateApiKey
 * - factoryReset
 *
 * Comportement :
 * - Si WebAuthn enrollé pour admin : verify avant action (biométrie FaceID/TouchID)
 * - Si pas enrollé : fallback PIN admin requis
 * - Échec verify → action refusée + audit log
 *
 * Anti-pattern : ne JAMAIS bypass via try/catch — toute erreur = refus.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { auth } from './auth.js';
import { isFeatureEnabled } from './feature-toggles.js';
import { webauthn } from './webauthn.js';

export type SensitiveAction =
  | 'toggle_commerce'
  | 'set_user_plan'
  | 'erase_account'
  | 'export_data'
  | 'change_pin'
  | 'change_passphrase'
  | 'rotate_api_key'
  | 'factory_reset'
  | 'change_email_admin';

export interface GateResult {
  ok: boolean;
  method?: 'webauthn' | 'pin' | 'denied';
  reason?: string;
}

class AdminActionGate {
  /**
   * Vérifie autorisation pour action admin sensible.
   * @param action Identifiant action sensible (audit traçable)
   * @param uid User ID (admin attendu)
   * @param pin Optional PIN fallback si WebAuthn indispo/refused
   */
  async verify(action: SensitiveAction, uid: string, pin?: string): Promise<GateResult> {
    /* Feature toggles Kevin règle ON/OFF (2026-05-04) :
       - 'auth.biometric' : kill-switch global biométrie générique (WebAuthn inclus)
       - 'auth.webauthn' : kill-switch spécifique WebAuthn (FaceID/TouchID)
       Si tous deux OFF, on bypass biométrie et passe direct à PIN. */
    const biometricEnabled = isFeatureEnabled('auth.biometric')
      && isFeatureEnabled('auth.webauthn');
    /* 1. WebAuthn obligatoire si enrollé ET feature toggle activé */
    if (biometricEnabled && webauthn.hasEnrollment(uid)) {
      try {
        const r = await webauthn.verify(uid);
        if (r.ok) {
          void auditLog.record('admin_gate.passed', { details: { action, method: 'webauthn', uid } });
          return { ok: true, method: 'webauthn' };
        }
        /* WebAuthn refused — pas de fallback PIN automatique (sécurité forte) */
        void auditLog.record('admin_gate.refused', {
          details: { action, method: 'webauthn', reason: r.reason ?? 'verify failed', uid },
        });
        return { ok: false, method: 'denied', reason: r.reason ?? 'WebAuthn verify failed' };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        void auditLog.record('admin_gate.error', { details: { action, error: reason, uid } });
        return { ok: false, method: 'denied', reason };
      }
    }

    /* 2. Fallback PIN admin si WebAuthn pas configuré */
    if (!pin) {
      logger.warn('admin-gate', `${action} : PIN required (WebAuthn not enrolled)`);
      return { ok: false, method: 'denied', reason: 'PIN admin requis (WebAuthn pas configuré)' };
    }
    try {
      /* Re-utilise auth.login avec admin name pour vérifier le PIN admin global */
      const result = await auth.login('Kevin', pin);
      const ok = result.ok;
      if (ok) {
        void auditLog.record('admin_gate.passed', { details: { action, method: 'pin', uid } });
        return { ok: true, method: 'pin' };
      }
      void auditLog.record('admin_gate.refused', { details: { action, method: 'pin', uid } });
      return { ok: false, method: 'denied', reason: 'PIN incorrect' };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, method: 'denied', reason };
    }
  }

  /**
   * Helper Higher-Order : wrap une fonction action pour qu'elle exige verify.
   */
  guardAction<TArgs extends unknown[], TResult>(
    action: SensitiveAction,
    uid: string,
    fn: (...args: TArgs) => Promise<TResult>,
  ): (...args: TArgs) => Promise<TResult | { ok: false; gateBlocked: true; reason: string }> {
    return async (...args: TArgs): Promise<TResult | { ok: false; gateBlocked: true; reason: string }> => {
      const gate = await this.verify(action, uid);
      if (!gate.ok) {
        return { ok: false, gateBlocked: true, reason: gate.reason ?? 'denied' };
      }
      return fn(...args);
    };
  }

  /**
   * Status admin pour UI dashboard.
   */
  getStatus(uid: string): {
    webauthn_enrolled: boolean;
    webauthn_supported: boolean;
    requires_setup: boolean;
  } {
    const enrolled = webauthn.hasEnrollment(uid);
    const supported = webauthn.isSupported();
    return {
      webauthn_enrolled: enrolled,
      webauthn_supported: supported,
      requires_setup: supported && !enrolled,
    };
  }
}

export const adminActionGate = new AdminActionGate();
