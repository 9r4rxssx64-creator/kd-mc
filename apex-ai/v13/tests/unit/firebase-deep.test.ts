import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firebase, FB_FIX, FB_LOCAL } from '../../services/storage/firebase.js';

describe('firebase deep tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isLocalOnly détecte FB_LOCAL prefix patterns', () => {
    expect(firebase.isLocalOnly('apex_v13_user')).toBe(true);
    expect(firebase.isLocalOnly('ax_voice_print_u1')).toBe(true);
    expect(firebase.isLocalOnly('apex_v13_pin')).toBe(true);
  });

  it('isLocalOnly false pour clés non FB_LOCAL', () => {
    expect(firebase.isLocalOnly('random_key')).toBe(false);
    expect(firebase.isLocalOnly('apex_v13_facts')).toBe(false);
  });

  it('shouldSync FB_FIX whitelist strict', () => {
    expect(firebase.shouldSync('apex_v13_facts')).toBe(true);
    expect(firebase.shouldSync('apex_v13_lessons')).toBe(true);
    expect(firebase.shouldSync('inconnue')).toBe(false);
  });

  it('FB_FIX et FB_LOCAL exportés non vides', () => {
    expect(FB_FIX.length).toBeGreaterThanOrEqual(5);
    expect(FB_LOCAL.length).toBeGreaterThanOrEqual(3);
  });

  it('write skip silently si non-syncé (zero fetch)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await firebase.write('non_synced_key', { v: 1 });
    /* Vraie assertion : zéro fetch PUT car shouldSync=false */
    const putCalls = fetchSpy.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PUT');
    expect(putCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('write skip si FB_LOCAL (zero fetch même si connected)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await firebase.write('apex_v13_user', { id: 'kevin' });
    /* Vraie assertion : isLocalOnly bypass ENTIÈREMENT */
    const putCalls = fetchSpy.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PUT');
    expect(putCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('isConnected initial false (pas de ping)', () => {
    expect(firebase.isConnected()).toBe(false);
  });
});
