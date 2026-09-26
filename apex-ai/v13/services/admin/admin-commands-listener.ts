/**
 * APEX v13.3.64 — Admin Commands Listener (Kevin 2026-05-08).
 *
 * Tourne sur l'iPhone du USER cible (Laurence, etc.). Écoute les events
 * `firebase:remote_change` sur la clé `ax_admin_commands_pending` :
 *  - Filtre commands non processed
 *  - Filtre target_uid === user courant
 *  - Filtre issued_by === ADMIN_ID (Kevin uniquement)
 *  - Exécute action (reset PIN local + clear fails)
 *  - Marque processed=true (push retour Firebase)
 *  - Toast user-friendly + reload différé
 *
 * Idempotent : startListening() multi-call OK (guard listenerStarted).
 *
 * Sécurité :
 *  - Aucune action exécutée si issued_by ≠ ADMIN_ID (verrou anti-impersonation)
 *  - Aucune action exécutée si target_uid ≠ user courant (verrou anti-broadcast)
 *  - Reset PIN limité à clear local — n'affecte JAMAIS un autre user
 */

import { ADMIN_ID } from '../../core/bootstrap.js';
import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';

import type { AdminCommand } from './admin-commands.js';

const FB_KEY = 'ax_admin_commands_pending';

class AdminCommandsListener {
  private listenerStarted = false;
  private processedIds = new Set<string>();

  /**
   * Démarre le listener SSE. Idempotent.
   */
  startListening(): void {
    if (this.listenerStarted) return;
    this.listenerStarted = true;

    events.on('firebase:remote_change', ({ key, data }) => {
      if (key !== FB_KEY || !data) return;
      try {
        const commands = (Array.isArray(data) ? data : []) as AdminCommand[];
        for (const cmd of commands) {
          this.handleCommand(cmd);
        }
      } catch (err: unknown) {
        logger.warn('admin-commands-listener', 'handler error', { err });
      }
    });

    logger.info('admin-commands-listener', '🛰 listening for admin commands (ax_admin_commands_pending)');
  }

  /**
   * Traite une commande individuelle. Filtre + exécute si applicable.
   */
  private handleCommand(cmd: AdminCommand): void {
    if (!cmd || !cmd.id) return;
    if (cmd.processed) return;
    if (this.processedIds.has(cmd.id)) return;

    /* Verrou 1 : issued_by DOIT être admin Kevin */
    if (cmd.issued_by !== ADMIN_ID) {
      logger.warn('admin-commands-listener', 'command rejected (non-admin issuer)', {
        id: cmd.id,
        issued_by: cmd.issued_by,
      });
      return;
    }

    /* Verrou 2 : target_uid DOIT être user courant */
    const user = store.get('user') as { id?: string } | null;
    const currentUid = user?.id;
    if (!currentUid || cmd.target_uid !== currentUid) {
      /* Pas pour moi → ignore silencieusement (chaque iPhone reçoit le même array) */
      return;
    }

    /* Marque processed AVANT exécution pour éviter double-trigger si SSE re-emit */
    this.processedIds.add(cmd.id);

    /* Dispatch action */
    if (cmd.command === 'reset_pin') {
      void this.executeResetPin(cmd, currentUid);
    } else if (cmd.command === 'setup_account') {
      void this.executeSetupAccount(cmd, currentUid);
    } else {
      logger.warn('admin-commands-listener', 'unknown command', { command: cmd.command });
    }
  }

  /**
   * v13.3.69 — Setup compte user : applique PIN hashé + clear lockout + activate.
   * Le PIN est déjà hashé côté Kevin (jamais en clair dans Firebase).
   */
  private async executeSetupAccount(cmd: AdminCommand, uid: string): Promise<void> {
    try {
      if (!cmd.pin_hash) {
        logger.warn('admin-commands-listener', 'setup_account sans pin_hash');
        return;
      }
      try { localStorage.setItem(`apex_v13_pin_${uid}`, cmd.pin_hash); } catch { /* ignore quota */ }
      try { localStorage.removeItem(`apex_v13_pin_fails_${uid}`); } catch { /* ignore */ }
      if (cmd.display_name) {
        try {
          localStorage.setItem('apex_v13_last_known_uid', uid);
          localStorage.setItem('apex_v13_last_known_name', cmd.display_name);
        } catch { /* ignore */ }
      }

      await auditLog.record('admin.command.applied', {
        actor: cmd.issued_by,
        target: uid,
        details: { command: 'setup_account', command_id: cmd.id },
      });

      try {
        const raw = localStorage.getItem(FB_KEY);
        let pending: AdminCommand[] = [];
        if (raw) pending = JSON.parse(raw) as AdminCommand[];
        if (!Array.isArray(pending)) pending = [];
        const idx = pending.findIndex((c) => c.id === cmd.id);
        if (idx >= 0) {
          const existing = pending[idx];
          if (existing) pending[idx] = { ...existing, processed: true };
          localStorage.setItem(FB_KEY, JSON.stringify(pending));
          await firebase.write(FB_KEY, pending);
        }
      } catch { /* non-blocking */ }

      logger.info('admin-commands-listener', `🔓 setup_account applied for ${uid} (cmd=${cmd.id})`);

      try {
        const { toast } = await import('../../ui/toast.js');
        toast.success('🎉 Ton compte Apex est prêt ! Tape ton nom + code PIN pour te connecter.', {
          duration: 6000,
        });
      } catch { /* ignore */ }

      setTimeout(() => {
        try {
          if (typeof location !== 'undefined' && typeof location.reload === 'function') {
            location.reload();
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch (err: unknown) {
      logger.error('admin-commands-listener', 'executeSetupAccount failed', { err });
    }
  }

  /**
   * Exécute reset PIN local pour user courant.
   *  - Clear PIN per-user
   *  - Clear fails counter
   *  - Push command processed=true vers Firebase (cleanup)
   *  - Audit log
   *  - Toast utilisateur + reload différé
   */
  private async executeResetPin(cmd: AdminCommand, uid: string): Promise<void> {
    try {
      /* Reset local : clear PIN + clear fails */
      try {
        localStorage.removeItem(`apex_v13_pin_${uid}`);
      } catch { /* ignore quota */ }
      try {
        localStorage.removeItem(`apex_v13_pin_fails_${uid}`);
      } catch { /* ignore */ }

      /* Audit log immutable */
      await auditLog.record('admin.command.applied', {
        actor: cmd.issued_by,
        target: uid,
        details: {
          command: 'reset_pin',
          command_id: cmd.id,
          reason: cmd.reason,
        },
      });

      /* Marque processed dans Firebase (cleanup futur) */
      try {
        const raw = localStorage.getItem(FB_KEY);
        let pending: AdminCommand[] = [];
        if (raw) pending = JSON.parse(raw) as AdminCommand[];
        if (!Array.isArray(pending)) pending = [];
        const idx = pending.findIndex((c) => c.id === cmd.id);
        if (idx >= 0) {
          const existing = pending[idx];
          if (existing) {
            const updated: AdminCommand = { ...existing, processed: true };
            pending[idx] = updated;
          }
          localStorage.setItem(FB_KEY, JSON.stringify(pending));
          await firebase.write(FB_KEY, pending);
        }
      } catch (err: unknown) {
        logger.warn('admin-commands-listener', 'mark processed failed (non-blocking)', { err });
      }

      logger.info('admin-commands-listener', `🔓 PIN reset applied for ${uid} (cmd=${cmd.id})`);

      /* Toast + reload différé (user-friendly, pas de jargon technique) */
      try {
        const { toast } = await import('../../ui/toast.js');
        toast.info('🔓 Ton PIN a été réinitialisé par admin Kevin. Choisis un nouveau PIN.', {
          duration: 5000,
        });
      } catch { /* toast non bloquant */ }

      /* Reload différé pour laisser toast s'afficher */
      setTimeout(() => {
        try {
          if (typeof location !== 'undefined' && typeof location.reload === 'function') {
            location.reload();
          }
        } catch { /* ignore env without location */ }
      }, 2500);
    } catch (err: unknown) {
      logger.error('admin-commands-listener', 'executeResetPin failed', { err });
    }
  }

  /**
   * Audit helper : exposé pour tests.
   */
  isListening(): boolean {
    return this.listenerStarted;
  }

  /**
   * Test helper : reset state interne (utilisé en tests pour relancer listener proprement).
   */
  __resetForTests(): void {
    this.listenerStarted = false;
    this.processedIds.clear();
  }
}

export const adminCommandsListener = new AdminCommandsListener();
/* Auto-start au chargement module (idempotent — guard listenerStarted) */
try {
  adminCommandsListener.startListening();
} catch (err: unknown) {
  logger.warn('admin-commands-listener', 'auto-start failed', { err });
}
