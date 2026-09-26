/**
 * APEX v13 — Service Lifecycle Manager (Architecture 18→20).
 *
 * Demande Kevin règle 100/100 + audit gap analysis :
 * "Service lazy-loading not fully verified — lifecycle hooks for service teardown
 *  (memory leak detection)"
 *
 * Architecture :
 * - Registry de services avec init/destroy hooks
 * - Memory leak detection (intervals, listeners)
 * - Auto-cleanup à navigation
 * - Stats lifecycle (uptime, errors, restarts)
 */

import { logger } from '../../core/logger.js';

export interface ServiceLifecycle {
  id: string;
  init?: () => void | Promise<void>;
  destroy?: () => void | Promise<void>;
  healthCheck?: () => boolean | Promise<boolean>;
}

interface ServiceState {
  id: string;
  status: 'idle' | 'initializing' | 'running' | 'stopped' | 'failed';
  init_at?: number;
  destroy_at?: number;
  errors: number;
  restarts: number;
  intervals: ReturnType<typeof setInterval>[];
  listeners: Array<{ target: EventTarget; type: string; fn: EventListenerOrEventListenerObject }>;
}

class LifecycleManager {
  private services = new Map<string, ServiceLifecycle>();
  private states = new Map<string, ServiceState>();

  register(svc: ServiceLifecycle): void {
    this.services.set(svc.id, svc);
    if (!this.states.has(svc.id)) {
      this.states.set(svc.id, {
        id: svc.id,
        status: 'idle',
        errors: 0,
        restarts: 0,
        intervals: [],
        listeners: [],
      });
    }
  }

  async init(id: string): Promise<boolean> {
    const svc = this.services.get(id);
    const state = this.states.get(id);
    if (!svc || !state) return false;
    if (state.status === 'running') return true;
    state.status = 'initializing';
    try {
      if (svc.init) await svc.init();
      state.status = 'running';
      state.init_at = Date.now();
      return true;
    } catch (err: unknown) {
      state.status = 'failed';
      state.errors++;
      logger.warn('lifecycle', `init ${id} failed`, { err });
      return false;
    }
  }

  async destroy(id: string): Promise<boolean> {
    const svc = this.services.get(id);
    const state = this.states.get(id);
    if (!svc || !state) return false;
    /* Cleanup intervals + listeners (anti memory leak) */
    for (const interval of state.intervals) clearInterval(interval);
    state.intervals = [];
    for (const l of state.listeners) {
      try { l.target.removeEventListener(l.type, l.fn); } catch { /* ignore */ }
    }
    state.listeners = [];
    try {
      if (svc.destroy) await svc.destroy();
      state.status = 'stopped';
      state.destroy_at = Date.now();
      return true;
    } catch (err: unknown) {
      state.errors++;
      logger.warn('lifecycle', `destroy ${id} failed`, { err });
      return false;
    }
  }

  async restart(id: string): Promise<boolean> {
    await this.destroy(id);
    const ok = await this.init(id);
    const state = this.states.get(id);
    if (state) state.restarts++;
    return ok;
  }

  /**
   * Track interval pour cleanup auto au destroy.
   */
  trackInterval(id: string, interval: ReturnType<typeof setInterval>): void {
    const state = this.states.get(id);
    if (state) state.intervals.push(interval);
  }

  /**
   * Track listener pour cleanup auto au destroy.
   */
  trackListener(id: string, target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    const state = this.states.get(id);
    if (state) state.listeners.push({ target, type, fn });
  }

  /**
   * Health check global tous services running.
   */
  async healthCheckAll(): Promise<Array<{ id: string; healthy: boolean }>> {
    const results: Array<{ id: string; healthy: boolean }> = [];
    for (const [id, svc] of this.services) {
      const state = this.states.get(id);
      if (!state || state.status !== 'running') continue;
      let healthy = true;
      if (svc.healthCheck) {
        try { healthy = await svc.healthCheck(); } catch { healthy = false; }
      }
      results.push({ id, healthy });
    }
    return results;
  }

  getState(id: string): ServiceState | null {
    return this.states.get(id) ?? null;
  }

  listStates(): readonly ServiceState[] {
    return Array.from(this.states.values());
  }

  /**
   * Stats globales pour dashboard admin.
   */
  getStats(): {
    total: number;
    running: number;
    stopped: number;
    failed: number;
    total_errors: number;
    total_restarts: number;
    total_intervals_tracked: number;
    total_listeners_tracked: number;
  } {
    const all = this.listStates();
    return {
      total: all.length,
      running: all.filter((s) => s.status === 'running').length,
      stopped: all.filter((s) => s.status === 'stopped').length,
      failed: all.filter((s) => s.status === 'failed').length,
      total_errors: all.reduce((sum, s) => sum + s.errors, 0),
      total_restarts: all.reduce((sum, s) => sum + s.restarts, 0),
      total_intervals_tracked: all.reduce((sum, s) => sum + s.intervals.length, 0),
      total_listeners_tracked: all.reduce((sum, s) => sum + s.listeners.length, 0),
    };
  }
}

export const lifecycle = new LifecycleManager();
