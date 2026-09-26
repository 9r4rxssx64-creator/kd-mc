/**
 * v13.3.70 — Auto-repair functions exposées pour wire UI bouton admin.
 *
 * Pourquoi pas dans Sentinel.autoFix direct ?
 * Quand un signal critique est détecté (audit log tamper, conflict multi-device),
 * il doit RESTER visible côté admin avant repair (vs auto-masking silencieux).
 * L'admin clique un bouton dans vSentinels → dispatch ici.
 *
 * Usage UI :
 *   import { sentinelAutoRepair } from './sentinel-auto-repair.js';
 *   const r = await sentinelAutoRepair.securityRebuildChain();
 *   toast(r.msg, r.ok ? 'success' : 'error');
 *
 * Auto-fix whitelist par sentinelle (CLAUDE.md "WARNING = AUTO-FIX") :
 *   - storage-watch     → Sentinel.autoFix direct (aggressiveCleanup)
 *   - security-watch    → ICI (rebuildChainHash via securityRebuildChain)
 *   - network-watch     → Sentinel.autoFix direct (fbReconnect)
 *   - wake-watch        → Sentinel.autoFix direct (resetWakeRecognition)
 *   - performance-watch → Sentinel.autoFix direct (reset stale baseline)
 *   - presence-watch    → Sentinel.autoFix direct (heartbeat refresh)
 *   - compliance-watch  → Sentinel.autoFix direct (default consent)
 *   - conflict-watch    → ICI (merge resolution via conflictMergeResolve)
 */

export interface RepairResult {
  ok: boolean;
  msg: string;
  details?: Record<string, unknown>;
}

export const sentinelAutoRepair = {
  /**
   * Rebuild chain hash audit-log si tamper détecté.
   * Idempotent : si chain valide → no-op + ok:true.
   */
  async securityRebuildChain(): Promise<RepairResult> {
    try {
      const { auditLog } = await import('../observability/audit-log.js');
      auditLog.reload();
      const r = await auditLog.autoRepair();
      if (r.rebuilt === 0) {
        return { ok: true, msg: 'Chain audit déjà valide (no-op)' };
      }
      return {
        ok: r.ok,
        msg: `Chain rebuild from #${r.brokenAt ?? '?'} → ${r.rebuilt} entries`,
        details: { rebuilt: r.rebuilt, brokenAt: r.brokenAt },
      };
    } catch (err: unknown) {
      return {
        ok: false,
        msg: 'rebuildChainHash fail: ' + (err instanceof Error ? err.message : String(err)),
      };
    }
  },

  /**
   * Merge resolution Firebase queue : reset entries flushing > 5 min stale → pending.
   * Force fb pull via firebase.init() qui re-establish SSE listener.
   */
  async conflictMergeResolve(): Promise<RepairResult> {
    try {
      const queueRaw = localStorage.getItem('apex_v13_fb_queue');
      if (!queueRaw) return { ok: true, msg: 'No queue to resolve' };
      const queue = JSON.parse(queueRaw) as Array<{ status: string; ts?: number; key?: string }>;
      const STALE_TTL = 5 * 60 * 1000;
      const now = Date.now();
      let reset = 0;
      for (const e of queue) {
        if (e.status === 'flushing' && (typeof e.ts !== 'number' || now - e.ts > STALE_TTL)) {
          e.status = 'pending';
          reset++;
        }
      }
      if (reset === 0) return { ok: true, msg: 'No stale writes to reset' };
      try {
        localStorage.setItem('apex_v13_fb_queue', JSON.stringify(queue));
      } catch {
        /* quota */
      }
      /* Force fb pull via init() qui re-establish SSE listener */
      try {
        const { firebase } = await import('../storage/firebase.js');
        await firebase.init();
      } catch {
        /* ignore reconnect fail */
      }
      return {
        ok: true,
        msg: `Reset ${reset} stale writes → pending + fb resync`,
        details: { reset, total: queue.length },
      };
    } catch (err: unknown) {
      return {
        ok: false,
        msg: 'merge fail: ' + (err instanceof Error ? err.message : String(err)),
      };
    }
  },
};
