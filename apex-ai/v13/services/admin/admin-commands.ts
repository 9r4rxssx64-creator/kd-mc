/**
 * APEX v13.3.64 — Admin Commands cross-device (Kevin 2026-05-08).
 *
 * Permet à Kevin admin de propager une action vers l'iPhone d'un user via Firebase.
 * Use case originel : reset PIN Laurence depuis chat Kevin sans envoyer lien manuel.
 *
 * Flux :
 *   1. Kevin chat : "Apex reset PIN Laurence"
 *   2. Apex IA → tool `reset_user_pin` → adminCommands.resetUserPin('laurence_sp')
 *   3. Push Firebase `ax_admin_commands_pending` (array<AdminCommand>)
 *   4. iPhone Laurence (admin-commands-listener.ts) reçoit SSE remote_change
 *   5. Listener filtre : target_uid match user courant + issued_by === admin
 *   6. Exécute reset local (clear PIN + clear fails) + toast + reload
 *   7. Marque command processed=true (cleanup côté listener)
 *
 * Sécurité :
 *   - Only admin tier (Kevin) peut issuer (vérifié par dispatcher impactLevel C)
 *   - target_uid DOIT être dans whitelist PRECONFIGURED non-admin
 *   - Audit log immutable de chaque commande
 *   - Pas de path d'escalade : un user ne peut JAMAIS issuer une commande
 */

import { ADMIN_ID } from '../../core/bootstrap.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';

const FB_KEY = 'ax_admin_commands_pending';
const MAX_PENDING = 50;
/* Whitelist users non-admin sur lesquels on accepte un reset_pin.
   Synchro avec services/auth.ts PRECONFIGURED (sauf admin). */
const RESET_PIN_TARGETS_WHITELIST: readonly string[] = ['laurence_sp'];

export interface AdminCommand {
  id: string;
  command: 'reset_pin' | 'setup_account';
  target_uid: string;
  issued_by: string;
  ts: number;
  reason?: string;
  processed?: boolean;
  /* setup_account : hash PIN PBKDF2 (PAS le PIN clair) + nom user à pré-remplir */
  pin_hash?: string;
  display_name?: string;
}

export interface AdminCommandResult {
  ok: boolean;
  command_id?: string;
  message?: string;
  error?: string;
}

class AdminCommandsService {
  /**
   * Push command reset PIN pour un user cible.
   * - Vérifie issuer = admin Kevin (defense in depth, dispatcher déjà gate via impactLevel C)
   * - Vérifie target_uid dans whitelist non-admin
   * - Stocke local + Firebase
   * - Audit log
   */
  async resetUserPin(targetUid: string, reason = ''): Promise<AdminCommandResult> {
    /* Defense in depth : tool est minTier=admin + impactLevel=C, mais on revérifie côté service. */
    const user = store.get('user') as { id?: string } | null;
    if (!user || user.id !== ADMIN_ID) {
      logger.warn('admin-commands', 'resetUserPin refused (not admin)', { issuer: user?.id });
      return { ok: false, error: 'Admin tier requis' };
    }

    /* Sanitize / valider target */
    const cleanUid = String(targetUid || '').trim();
    if (!cleanUid) {
      return { ok: false, error: 'target_uid requis' };
    }
    if (cleanUid === ADMIN_ID) {
      return { ok: false, error: 'Reset PIN admin Kevin interdit via ce tool (utiliser flow logout normal)' };
    }
    if (!RESET_PIN_TARGETS_WHITELIST.includes(cleanUid)) {
      return { ok: false, error: `target_uid inconnu : ${cleanUid} (whitelist: ${RESET_PIN_TARGETS_WHITELIST.join(', ')})` };
    }

    /* Construit command */
    const cmd: AdminCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      command: 'reset_pin',
      target_uid: cleanUid,
      issued_by: ADMIN_ID,
      ts: Date.now(),
      reason: reason ? String(reason).slice(0, 200) : '',
      processed: false,
    };

    /* Charge pending courant + ajoute + cap MAX_PENDING (FIFO) */
    let pending: AdminCommand[] = [];
    try {
      const raw = localStorage.getItem(FB_KEY);
      if (raw) pending = JSON.parse(raw) as AdminCommand[];
      if (!Array.isArray(pending)) pending = [];
    } catch {
      pending = [];
    }
    /* Retire les commands processed > 24h pour cleanup */
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    pending = pending.filter((c) => !(c.processed && c.ts < cutoff));
    pending.push(cmd);
    if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);

    /* Persist local + Firebase (firebase.write idempotent) */
    try {
      localStorage.setItem(FB_KEY, JSON.stringify(pending));
    } catch (err: unknown) {
      logger.warn('admin-commands', 'localStorage quota error', { err });
    }
    try {
      await firebase.write(FB_KEY, pending);
    } catch (err: unknown) {
      logger.warn('admin-commands', 'firebase.write failed (will retry via queue)', { err });
    }

    /* Audit log immutable */
    await auditLog.record('admin.command.issued', {
      actor: ADMIN_ID,
      target: cleanUid,
      details: {
        command: 'reset_pin',
        command_id: cmd.id,
        reason: cmd.reason,
      },
    });

    logger.info('admin-commands', `📨 reset_pin command issued for ${cleanUid} (id=${cmd.id})`);
    return {
      ok: true,
      command_id: cmd.id,
      message: `Command envoyée. iPhone de ${cleanUid} appliquera le reset au prochain heartbeat SSE.`,
    };
  }

  /**
   * v13.3.69 (Kevin "Apex connaît son code, crée son compte avec son code et débloque").
   * Setup complet compte user : applique PIN hashé + clear lockout + activate.
   *
   * Le caller (Apex IA) hash le PIN clair via auth.hashPin(pin, uid) AVANT d'appeler
   * cette méthode. Le PIN clair n'est JAMAIS stocké dans Firebase.
   *
   * Use case : Kevin dit "Apex configure le compte de Laurence avec son code".
   * Apex IA récupère le code dans sa persistent_memory, hash, puis appelle ce tool.
   */
  async setupAccount(opts: {
    targetUid: string;
    pinHash: string;
    displayName?: string;
    reason?: string;
  }): Promise<AdminCommandResult> {
    const user = store.get('user') as { id?: string } | null;
    if (!user || user.id !== ADMIN_ID) {
      logger.warn('admin-commands', 'setupAccount refused (not admin)', { issuer: user?.id });
      return { ok: false, error: 'Admin tier requis' };
    }

    const cleanUid = String(opts.targetUid || '').trim();
    if (!cleanUid) return { ok: false, error: 'target_uid requis' };
    if (cleanUid === ADMIN_ID) return { ok: false, error: 'Setup admin Kevin interdit via ce tool' };
    if (!RESET_PIN_TARGETS_WHITELIST.includes(cleanUid)) {
      return { ok: false, error: `target_uid inconnu : ${cleanUid}` };
    }
    if (!opts.pinHash || opts.pinHash.length < 32) {
      return { ok: false, error: 'pin_hash invalide (PBKDF2 SHA-256 64 hex chars attendu)' };
    }

    const cmd: AdminCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      command: 'setup_account',
      target_uid: cleanUid,
      issued_by: ADMIN_ID,
      ts: Date.now(),
      reason: opts.reason ? String(opts.reason).slice(0, 200) : 'Setup compte par admin Kevin',
      pin_hash: opts.pinHash,
      processed: false,
    };
    if (opts.displayName) cmd.display_name = opts.displayName.slice(0, 100);

    let pending: AdminCommand[] = [];
    try {
      const raw = localStorage.getItem(FB_KEY);
      if (raw) pending = JSON.parse(raw) as AdminCommand[];
      if (!Array.isArray(pending)) pending = [];
    } catch { pending = []; }
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    pending = pending.filter((c) => !(c.processed && c.ts < cutoff));
    pending.push(cmd);
    if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);

    try { localStorage.setItem(FB_KEY, JSON.stringify(pending)); } catch (err: unknown) {
      logger.warn('admin-commands', 'localStorage quota error', { err });
    }
    try { await firebase.write(FB_KEY, pending); } catch (err: unknown) {
      logger.warn('admin-commands', 'firebase.write failed', { err });
    }

    await auditLog.record('admin.command.issued', {
      actor: ADMIN_ID,
      target: cleanUid,
      details: { command: 'setup_account', command_id: cmd.id },
    });

    logger.info('admin-commands', `📨 setup_account command issued for ${cleanUid} (id=${cmd.id})`);
    return {
      ok: true,
      command_id: cmd.id,
      message: `Compte ${cleanUid} sera configuré dès reception SSE sur son iPhone.`,
    };
  }

  /**
   * Liste les commands pending (admin only).
   */
  listPending(): AdminCommand[] {
    try {
      const raw = localStorage.getItem(FB_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as AdminCommand[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
}

export const adminCommands = new AdminCommandsService();
