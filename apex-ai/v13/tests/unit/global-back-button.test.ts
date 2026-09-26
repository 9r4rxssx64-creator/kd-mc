/**
 * APEX v13 — Tests global-back-button.ts
 *
 * Couvre install + visibilité conditionnelle selon route hash.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { globalBackButton } from '../../services/core-svc/global-back-button.js';

const BTN_ID = 'apex-global-back-btn';
const STYLE_ID = 'apex-global-back-style';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  /* Reset état interne via cast (test-only) */
  (globalBackButton as unknown as { installed: boolean }).installed = false;
  location.hash = '';
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  (globalBackButton as unknown as { installed: boolean }).installed = false;
});

describe('global-back-button — install()', () => {
  it('install injecte le style + le bouton', () => {
    globalBackButton.install();
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    expect(document.getElementById(BTN_ID)).not.toBeNull();
  });

  it('bouton a aria-label + title + texte ← Chat', () => {
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.getAttribute('aria-label')).toBe('Retour au chat');
    expect(btn?.getAttribute('title')).toBe('Retour au chat');
    expect(btn?.textContent).toContain('Chat');
  });

  it('install idempotent (2× ne dédouble pas)', () => {
    globalBackButton.install();
    const firstBtn = document.getElementById(BTN_ID);
    globalBackButton.install();
    const all = document.querySelectorAll(`#${BTN_ID}`);
    expect(all.length).toBe(1);
    expect(document.getElementById(BTN_ID)).toBe(firstBtn);
  });

  it('CSS style contient z-index, safe-area, touch target ≥ 44px', () => {
    globalBackButton.install();
    const style = document.getElementById(STYLE_ID);
    const css = style?.textContent ?? '';
    expect(css).toContain('z-index');
    expect(css).toContain('safe-area-inset');
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('min-height: 44px');
  });

  it('CSS contient prefers-reduced-motion respect', () => {
    globalBackButton.install();
    const css = document.getElementById(STYLE_ID)?.textContent ?? '';
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('global-back-button — visibility', () => {
  it('vue chat (hash vide) → bouton caché (is-hidden)', () => {
    location.hash = '';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(true);
  });

  it('hash #chat → caché', () => {
    location.hash = '#chat';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(true);
  });

  it('hash #chatlite → caché', () => {
    location.hash = '#chatlite';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(true);
  });

  it('hash #vault → visible', () => {
    location.hash = '#vault';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(false);
  });

  it('changement hash → met à jour visibilité', () => {
    location.hash = '#chat';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(true);

    location.hash = '#settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(btn?.classList.contains('is-hidden')).toBe(false);
  });

  it('hash avec query string strippé (#vault?x=1 → vault)', () => {
    location.hash = '#vault?focus=key';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(false);
  });

  it('orientationchange re-trigger updateVisibility', () => {
    location.hash = '#vault';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID);
    expect(btn?.classList.contains('is-hidden')).toBe(false);

    location.hash = '#chat';
    window.dispatchEvent(new Event('orientationchange'));
    expect(btn?.classList.contains('is-hidden')).toBe(true);
  });
});

describe('global-back-button — click handler', () => {
  it('click → location.hash devient #chat', () => {
    location.hash = '#vault';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID) as HTMLButtonElement;
    btn.click();
    expect(location.hash).toBe('#chat');
  });

  it('click event.preventDefault + stopPropagation', () => {
    location.hash = '#vault';
    globalBackButton.install();
    const btn = document.getElementById(BTN_ID) as HTMLButtonElement;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    const pd = vi.spyOn(ev, 'preventDefault');
    const sp = vi.spyOn(ev, 'stopPropagation');
    btn.dispatchEvent(ev);
    expect(pd).toHaveBeenCalled();
    expect(sp).toHaveBeenCalled();
  });
});
