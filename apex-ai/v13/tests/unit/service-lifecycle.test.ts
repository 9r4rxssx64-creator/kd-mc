/**
 * Tests service-lifecycle (Architecture 18→20).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { lifecycle } from '../../services/core-svc/service-lifecycle.js';

describe('Service Lifecycle Manager', () => {
  beforeEach(() => {
    /* Note : lifecycle est singleton, tests isolés via id unique */
  });

  it('register service avec id', () => {
    lifecycle.register({ id: 'test_register' });
    const state = lifecycle.getState('test_register');
    expect(state?.status).toBe('idle');
  });

  it('init service status running', async () => {
    lifecycle.register({ id: 'test_init', init: () => {} });
    const ok = await lifecycle.init('test_init');
    expect(ok).toBe(true);
    expect(lifecycle.getState('test_init')?.status).toBe('running');
  });

  it('init avec erreur → failed + errors++', async () => {
    lifecycle.register({
      id: 'test_init_fail',
      init: () => { throw new Error('boom'); },
    });
    const ok = await lifecycle.init('test_init_fail');
    expect(ok).toBe(false);
    const state = lifecycle.getState('test_init_fail');
    expect(state?.status).toBe('failed');
    expect(state?.errors).toBeGreaterThan(0);
  });

  it('destroy service stopped', async () => {
    lifecycle.register({ id: 'test_destroy', init: () => {}, destroy: () => {} });
    await lifecycle.init('test_destroy');
    const ok = await lifecycle.destroy('test_destroy');
    expect(ok).toBe(true);
    expect(lifecycle.getState('test_destroy')?.status).toBe('stopped');
  });

  it('restart incrémente restarts', async () => {
    lifecycle.register({ id: 'test_restart', init: () => {} });
    await lifecycle.init('test_restart');
    await lifecycle.restart('test_restart');
    expect(lifecycle.getState('test_restart')?.restarts).toBeGreaterThan(0);
  });

  it('trackInterval cleanup au destroy', async () => {
    lifecycle.register({ id: 'test_interval', init: () => {} });
    await lifecycle.init('test_interval');
    const i = setInterval(() => {}, 1000);
    lifecycle.trackInterval('test_interval', i);
    expect(lifecycle.getState('test_interval')?.intervals.length).toBe(1);
    await lifecycle.destroy('test_interval');
    expect(lifecycle.getState('test_interval')?.intervals.length).toBe(0);
  });

  it('trackListener cleanup au destroy', async () => {
    lifecycle.register({ id: 'test_listener', init: () => {} });
    await lifecycle.init('test_listener');
    const fn = (): void => {};
    lifecycle.trackListener('test_listener', document.body, 'click', fn);
    expect(lifecycle.getState('test_listener')?.listeners.length).toBe(1);
    await lifecycle.destroy('test_listener');
    expect(lifecycle.getState('test_listener')?.listeners.length).toBe(0);
  });

  it('healthCheckAll retourne running services', async () => {
    lifecycle.register({
      id: 'test_health',
      init: () => {},
      healthCheck: () => true,
    });
    await lifecycle.init('test_health');
    const results = await lifecycle.healthCheckAll();
    const found = results.find((r) => r.id === 'test_health');
    expect(found?.healthy).toBe(true);
  });

  it('getStats agrège tous services', async () => {
    lifecycle.register({ id: 'test_stats_a', init: () => {} });
    await lifecycle.init('test_stats_a');
    const stats = lifecycle.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.running).toBeGreaterThan(0);
  });

  it('init sur service running 2× → idempotent', async () => {
    lifecycle.register({ id: 'test_idempotent', init: () => {} });
    await lifecycle.init('test_idempotent');
    const r2 = await lifecycle.init('test_idempotent');
    expect(r2).toBe(true);
  });

  it('listStates retourne tous services', () => {
    const states = lifecycle.listStates();
    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(0);
  });
});
