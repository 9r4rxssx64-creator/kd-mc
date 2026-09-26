/**
 * APEX v13.4.5 — Sentinelle autonomous-watch.
 *
 * Tourne toutes les 30s. Fait avancer la session apexAutonomousMode active.
 *
 * Wire boot : bootstrap.ts → safeInit('autonomous-watch') → autonomousWatch.start()
 *
 * Anti-pattern :
 *  - N'utilise PAS sentinelsManager (qui tick toutes les 60s) — on veut 30s.
 *  - setInterval 30s dédié, idempotent (check this.timer avant créer).
 *  - Lifecycle tracking via service-lifecycle si dispo (cleanup possible).
 */

import { logger } from '../../core/logger.js';
import { apexAutonomousMode } from '../admin/apex-autonomous-mode.js';

const TICK_INTERVAL_MS = 30 * 1000;

class AutonomousWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private tickCount = 0;
  private lastTickAt = 0;

  start(): void {
    if (this.timer) return;
    this.startedAt = Date.now();
    this.timer = setInterval(() => {
      void this.tickSafe();
    }, TICK_INTERVAL_MS);
    logger.info('autonomous-watch', `Started (tick ${TICK_INTERVAL_MS}ms)`);
    /* Track interval lifecycle si dispo */
    void this.trackLifecycle();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('autonomous-watch', 'Stopped');
    }
  }

  /** Force un tick (debug / tests) */
  async forceTick(): Promise<void> {
    await this.tickSafe();
  }

  getStats(): { startedAt: number; tickCount: number; lastTickAt: number; active: boolean } {
    return {
      startedAt: this.startedAt,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
      active: this.timer !== null,
    };
  }

  private async tickSafe(): Promise<void> {
    this.tickCount += 1;
    this.lastTickAt = Date.now();
    try {
      await apexAutonomousMode.tick();
    } catch (err: unknown) {
      logger.warn('autonomous-watch', 'tick threw', { err });
    }
  }

  private async trackLifecycle(): Promise<void> {
    if (!this.timer) return;
    try {
      const mod = (await import('../core-svc/service-lifecycle.js')) as {
        lifecycle?: { trackInterval: (name: string, t: ReturnType<typeof setInterval>) => void };
      };
      if (mod.lifecycle && this.timer) mod.lifecycle.trackInterval('autonomous-watch', this.timer);
    } catch {
      /* lifecycle indispo → ignore */
    }
  }
}

export const autonomousWatch = new AutonomousWatch();
