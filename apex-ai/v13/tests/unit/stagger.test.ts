/**
 * Tests Stagger animations v13.3.29.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stagger } from '../../ui/stagger.js';

describe('Stagger v13.3.29', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    /* Force matchMedia retourne matches:false par défaut (pas en reduced-motion) */
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('apply ajoute class et CSS var sur enfants', () => {
    const container = document.createElement('div');
    for (let i = 0; i < 5; i++) {
      const child = document.createElement('span');
      container.appendChild(child);
    }
    document.body.appendChild(container);

    const count = stagger.apply(container);
    expect(count).toBe(5);
    const children = container.querySelectorAll('span');
    expect(children[0]?.classList.contains('ax-stagger-item')).toBe(true);
    expect(children[2]?.style.getPropertyValue('--ax-stagger-i')).toBe('2');
  });

  it('apply respecte step custom', () => {
    const container = document.createElement('div');
    const c1 = document.createElement('span');
    const c2 = document.createElement('span');
    container.append(c1, c2);
    stagger.apply(container, { step: 100 });
    expect(c2.style.animationDelay).toBe('100ms');
  });

  it('apply cap maxDelay sur grosses listes', () => {
    const container = document.createElement('div');
    for (let i = 0; i < 30; i++) {
      container.appendChild(document.createElement('span'));
    }
    stagger.apply(container, { step: 50, maxDelay: 500 });
    const last = container.querySelectorAll<HTMLElement>('span')[29];
    expect(last?.style.animationDelay).toBe('500ms');
  });

  it('apply retourne 0 si reducedMotion détecté', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const container = document.createElement('div');
    container.appendChild(document.createElement('span'));
    expect(stagger.apply(container)).toBe(0);
  });

  it('clear remove styles et classes', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    container.appendChild(child);
    stagger.apply(container);
    expect(child.classList.contains('ax-stagger-item')).toBe(true);
    stagger.clear(container);
    expect(child.classList.contains('ax-stagger-item')).toBe(false);
    expect(child.style.animationDelay).toBe('');
  });

  it('apply selector custom filtre enfants', () => {
    const container = document.createElement('div');
    const a = document.createElement('span');
    a.className = 'item';
    const b = document.createElement('span');
    b.className = 'skip';
    container.append(a, b);
    const count = stagger.apply(container, { selector: '.item' });
    expect(count).toBe(1);
    expect(b.classList.contains('ax-stagger-item')).toBe(false);
  });

  it('apply animation class custom', () => {
    const container = document.createElement('div');
    container.appendChild(document.createElement('span'));
    stagger.apply(container, { animationClass: 'custom-anim' });
    expect(container.querySelector('span')?.classList.contains('custom-anim')).toBe(true);
  });
});
