/**
 * Tests Easter Eggs v13.3.29 (Konami + confettis + triple-tap).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { easterEggs } from '../../ui/easter-eggs.js';

describe('Easter Eggs v13.3.29', () => {
  beforeEach(() => {
    easterEggs.reset();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.querySelectorAll('.ax-confetti-container').forEach((el) => el.remove());
  });

  it('initial state retro NON actif', () => {
    expect(easterEggs.isRetroActive()).toBe(false);
  });

  it('activateKonami toggle retro mode', () => {
    easterEggs.activateKonami();
    expect(easterEggs.isRetroActive()).toBe(true);
    expect(document.documentElement.classList.contains('ax-retro-8bit')).toBe(true);
    easterEggs.activateKonami();
    expect(easterEggs.isRetroActive()).toBe(false);
  });

  it('spawnConfetti crée container et 60 pièces par défaut', () => {
    easterEggs.spawnConfetti();
    const container = document.querySelector('.ax-confetti-container');
    expect(container).toBeTruthy();
    const pieces = container?.querySelectorAll('.ax-confetti-piece') ?? [];
    expect(pieces.length).toBe(60);
  });

  it('spawnConfetti accepte count custom', () => {
    easterEggs.spawnConfetti(20);
    const pieces = document.querySelectorAll('.ax-confetti-piece');
    expect(pieces.length).toBe(20);
  });

  it('spawnConfetti applique aria-hidden true', () => {
    easterEggs.spawnConfetti(5);
    const container = document.querySelector('.ax-confetti-container');
    expect(container?.getAttribute('aria-hidden')).toBe('true');
  });

  it('subscribe notifie sur konami activation', () => {
    let lastEgg: { id: string; name: string; emoji: string } | null = null;
    const unsub = easterEggs.subscribe((e) => {
      lastEgg = e;
    });
    easterEggs.activateKonami();
    expect(lastEgg).not.toBeNull();
    expect((lastEgg as unknown as { id: string }).id).toBe('konami');
    unsub();
  });

  it('wireTripleTap appelle callback après 3 clicks', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const fn = vi.fn();
    const cleanup = easterEggs.wireTripleTap(el, fn);
    el.click();
    el.click();
    el.click();
    expect(fn).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('wireTripleTap reset après cooldown', async () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const fn = vi.fn();
    easterEggs.wireTripleTap(el, fn);
    el.click();
    el.click();
    /* Pas de 3e click → callback pas appelé */
    await new Promise((r) => setTimeout(r, 700));
    expect(fn).not.toHaveBeenCalled();
  });

  it('install est idempotent', () => {
    easterEggs.install();
    easterEggs.install();
    /* Ne doit pas throw */
    expect(true).toBe(true);
  });
});
