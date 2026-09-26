/**
 * APEX v13 — Tests click-fallback-guard.ts
 *
 * Demande Kevin 2026-05-08 : "aucun bouton silencieux".
 * Couvre isLikelyWired() détection variée + install idempotent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const toastShowMock = vi.fn();
vi.mock('../../ui/toast.js', () => ({
  toast: { show: (...args: unknown[]) => toastShowMock(...args) },
}));

const hapticTapMock = vi.fn();
vi.mock('../../ui/haptic.js', () => ({
  haptic: { tap: () => hapticTapMock() },
}));

import { clickFallbackGuard } from '../../services/core-svc/click-fallback-guard.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('click-fallback-guard — install', () => {
  it('install idempotent + isInstalled true', () => {
    clickFallbackGuard.install();
    expect(clickFallbackGuard.isInstalled()).toBe(true);
    /* 2× ne crash pas */
    expect(() => clickFallbackGuard.install()).not.toThrow();
  });
});

describe('click-fallback-guard — bouton wired (laisse passer)', () => {
  /* La détection lance setTimeout 50ms ; on flush + 1500ms pour passer la fenêtre check. */
  function clickAndFlush(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(1700);
  }

  it('<a href="..."> non-vide → no toast', () => {
    clickFallbackGuard.install();
    const a = document.createElement('a');
    a.href = 'https://example.com';
    a.textContent = 'Link';
    document.body.appendChild(a);
    clickAndFlush(a);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('<button type=submit> dans <form> → no toast', () => {
    clickFallbackGuard.install();
    const form = document.createElement('form');
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.textContent = 'Send';
    form.appendChild(btn);
    document.body.appendChild(form);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('<button disabled> → no toast (rien voulu)', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.disabled = true;
    btn.textContent = 'Disabled';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('attribut onclick → no toast', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.setAttribute('onclick', 'void 0');
    btn.textContent = 'X';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('data-action attr → no toast', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.dataset.action = 'foo';
    btn.textContent = 'Foo';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('data-nav-route → no toast', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.dataset.navRoute = 'vault';
    btn.textContent = 'Vault';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('aria-haspopup → no toast', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.textContent = 'Menu';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('role=tab → no toast', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.setAttribute('role', 'tab');
    btn.textContent = 'Tab';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('aria-label=fermer → no toast', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Fermer');
    btn.textContent = '✕';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('id apex-* → no toast (whitelisté)', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.id = 'apex-action-something';
    btn.textContent = 'Apex';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('id ax-* → no toast (whitelisté)', () => {
    clickFallbackGuard.install();
    const btn = document.createElement('button');
    btn.id = 'ax-foo';
    btn.textContent = 'Ax';
    document.body.appendChild(btn);
    clickAndFlush(btn);
    expect(toastShowMock).not.toHaveBeenCalled();
  });
});

describe('click-fallback-guard — non-clickables', () => {
  it('click sur div ordinaire non-bouton → no toast (filtré)', () => {
    clickFallbackGuard.install();
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(1700);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it('click dans <input> ignoré', () => {
    clickFallbackGuard.install();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(1700);
    expect(toastShowMock).not.toHaveBeenCalled();
  });
});
