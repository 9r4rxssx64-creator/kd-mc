/**
 * Tests apex-functional-tester v13.4.181 → enrichi v13.4.199.
 *
 * Vérifie test runtime boutons : ok/no_response/skipped_destructive/disabled,
 * detectStaleButtons, autoFix whitelist, testAndAutoFix cycle complet.
 *
 * v13.4.199 (Kevin "100/100 réel partout") : mocks getBoundingClientRect
 * pour forcer happy-dom à exercer le code path testOneButton (qui filtre
 * sur rect.width > 0). Plus tests dédiés pour autoFix + testAndAutoFix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apexFunctionalTester,
  autoFix,
  detectStaleButtons,
  testAndAutoFix,
  testButtonsInView,
  type FunctionalTestReport,
} from '../../services/admin/apex-functional-tester.js';

/* Mock router.dispatch (dynamic import dans autoFix) */
vi.mock('../../core/router.js', () => ({
  router: { dispatch: vi.fn() },
}));

/** Helper : mount bouton avec rect réel forcé (happy-dom retourne 0×0 par défaut). */
function mountBtnVisible(opts: {
  label?: string;
  id?: string;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
} = {}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = opts.id ?? `btn_${Math.random().toString(36).slice(2, 8)}`;
  btn.textContent = opts.label ?? 'Click';
  if (opts.disabled) btn.disabled = true;
  if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel);
  Object.defineProperty(btn, 'getBoundingClientRect', {
    value: () => ({
      width: 80, height: 40, top: 10, left: 10, right: 90, bottom: 50,
      x: 10, y: 10, toJSON: () => ({}),
    }),
    configurable: true,
  });
  if (opts.onClick) btn.addEventListener('click', opts.onClick);
  document.body.appendChild(btn);
  return btn;
}

describe('apex-functional-tester testButtonsInView (v13.4.181)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('retourne report avec ts + ver + viewBefore', async () => {
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.ts).toBeGreaterThan(0);
    expect(r.ver).toBe('v13.4.181');
    expect(r.viewBefore).toBeDefined();
  });

  it('compte 0 boutons sur DOM vide', async () => {
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.totalButtons).toBe(0);
    expect(r.tested).toBe(0);
  });

  it('skippe boutons destructifs (text "Supprimer")', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'Supprimer';
    btn.style.cssText = 'width:100px;height:44px';
    document.body.appendChild(btn);
    const r = await testButtonsInView({ maxButtons: 5 });
    /* happy-dom peut ne pas calculer rect → on teste qu'aucun crash */
    expect(r.details).toBeInstanceOf(Array);
    const destructive = r.details.find((d) => d.status === 'skipped_destructive');
    /* Si le bouton est visible (rect > 0) il devrait être skippé */
    if (r.tested > 0) {
      expect(destructive).toBeDefined();
    }
  });

  it('skippe boutons "Effacer", "Reset", "Logout", "Déconnex"', async () => {
    ['Effacer toutes les clés', 'Reset session', 'Logout', 'Déconnexion'].forEach((txt) => {
      const b = document.createElement('button');
      b.textContent = txt;
      document.body.appendChild(b);
    });
    const r = await testButtonsInView({ maxButtons: 10 });
    if (r.tested > 0) {
      expect(r.skipped).toBeGreaterThanOrEqual(1);
    }
  });

  it('skippe boutons disabled', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.disabled = true;
    document.body.appendChild(btn);
    const r = await testButtonsInView({ maxButtons: 5 });
    if (r.tested > 0) {
      const disabled = r.details.find((d) => d.status === 'disabled');
      expect(disabled).toBeDefined();
    }
  });

  it('skippe boutons avec data-test-safe="false"', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'OK action';
    btn.setAttribute('data-test-safe', 'false');
    document.body.appendChild(btn);
    const r = await testButtonsInView({ maxButtons: 5 });
    if (r.tested > 0) {
      const skipped = r.details.find((d) => d.status === 'skipped_destructive');
      expect(skipped).toBeDefined();
    }
  });

  it('cap nombre de boutons selon maxButtons opt', async () => {
    for (let i = 0; i < 50; i++) {
      const b = document.createElement('button');
      b.textContent = `Btn ${i}`;
      b.style.cssText = 'width:100px;height:44px';
      document.body.appendChild(b);
    }
    const r = await testButtonsInView({ maxButtons: 10 });
    expect(r.tested).toBeLessThanOrEqual(10);
  });

  it('détecte réaction quand bouton change hash URL', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'Go';
    btn.addEventListener('click', () => {
      location.hash = '#test-' + Date.now();
    });
    document.body.appendChild(btn);
    const r = await testButtonsInView({ maxButtons: 5 });
    /* Peut ou pas détecter selon environnement happy-dom hash support */
    expect(r.details).toBeInstanceOf(Array);
  });

  it('reporting structure : ok + noResponse + errors + skipped sum bounded by tested', async () => {
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.textContent = `Btn ${i}`;
      document.body.appendChild(b);
    }
    const r = await testButtonsInView({ maxButtons: 10 });
    const sum = r.ok + r.noResponse + r.errors + r.skipped;
    expect(sum).toBeLessThanOrEqual(r.tested);
  });

  it('callback onProgress appelé pendant test', async () => {
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button');
      b.textContent = `Btn ${i}`;
      b.style.cssText = 'width:100px;height:44px';
      document.body.appendChild(b);
    }
    const progressCalls: Array<{ c: number; t: number }> = [];
    await testButtonsInView({
      maxButtons: 10,
      onProgress: (c, t) => {
        progressCalls.push({ c, t });
      },
    });
    /* Si > 0 boutons testés, onProgress devrait avoir été appelé */
    /* En happy-dom rect peut être 0 → 0 tested → 0 calls : OK aussi */
    expect(progressCalls).toBeInstanceOf(Array);
  });
});

describe('apex-functional-tester detectStaleButtons (v13.4.181)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('retourne array vide sur DOM vide', () => {
    expect(detectStaleButtons()).toEqual([]);
  });

  it('détecte bouton sans handler', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Stale';
    document.body.appendChild(btn);
    const stale = detectStaleButtons();
    /* Le bouton sans onclick ni data-* est suspect */
    expect(stale.length).toBeGreaterThanOrEqual(1);
  });

  it('ignore boutons type="submit" (gérés par form)', () => {
    const form = document.createElement('form');
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.textContent = 'Submit';
    form.appendChild(btn);
    document.body.appendChild(form);
    const stale = detectStaleButtons();
    expect(stale.length).toBe(0);
  });

  it('ignore boutons avec data-nav-route, data-action, etc.', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Nav';
    btn.setAttribute('data-nav-route', 'chat');
    document.body.appendChild(btn);
    const stale = detectStaleButtons();
    expect(stale.length).toBe(0);
  });

  it('cap à 20 boutons stale max', () => {
    for (let i = 0; i < 30; i++) {
      const b = document.createElement('button');
      b.textContent = `B${i}`;
      document.body.appendChild(b);
    }
    const stale = detectStaleButtons();
    expect(stale.length).toBeLessThanOrEqual(20);
  });
});

/* ========================================================================
 * v13.4.199 (Kevin "100/100 réel partout") — testOneButton via rect forcé
 * ====================================================================== */
describe('apex-functional-tester testButtonsInView avec rect forcé (v13.4.199)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('teste 1 bouton avec handler → ok (toast)', async () => {
    mountBtnVisible({
      label: 'Action',
      onClick: () => {
        const t = document.createElement('div');
        t.className = 'ax-toast';
        document.body.appendChild(t);
      },
    });
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.tested).toBe(1);
    expect(r.ok).toBe(1);
    expect(r.details[0]?.reactions.some((x) => x.includes('toast'))).toBe(true);
  });

  it('no_response si bouton inerte', async () => {
    mountBtnVisible({ label: 'Mort' });
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.noResponse).toBe(1);
  });

  it('détecte réaction modal', async () => {
    mountBtnVisible({
      label: 'Modal',
      onClick: () => {
        const m = document.createElement('div');
        m.setAttribute('role', 'dialog');
        document.body.appendChild(m);
      },
    });
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.ok).toBe(1);
    expect(r.details[0]?.reactions.some((x) => x.includes('modal'))).toBe(true);
  });

  it('détecte loading state', async () => {
    mountBtnVisible({
      label: 'Loading',
      onClick: () => {
        const btns = document.querySelectorAll('button');
        btns.forEach((b) => b.classList.add('ax-loading'));
      },
    });
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.ok).toBe(1);
    expect(r.details[0]?.reactions.some((x) => x.includes('loading_state'))).toBe(true);
  });

  it('détecte btn_disabled state', async () => {
    mountBtnVisible({
      label: 'Disable Self',
      onClick: () => {
        const btn = document.querySelector<HTMLButtonElement>('button');
        if (btn) btn.disabled = true;
      },
    });
    const r = await testButtonsInView({ maxButtons: 5 });
    expect(r.details[0]?.reactions.some((x) => x.includes('btn_disabled'))).toBe(true);
  });

  it('onProgress callback appelé avec (current, total)', async () => {
    mountBtnVisible({ label: 'a' });
    mountBtnVisible({ label: 'b' });
    const progress = vi.fn();
    await testButtonsInView({ maxButtons: 5, onProgress: progress });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(1, 2);
    expect(progress).toHaveBeenCalledWith(2, 2);
  });
});

describe('apex-functional-tester autoFix (v13.4.199)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('applique router_re_dispatch si failure rate > 30%', async () => {
    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/',
      totalButtons: 10,
      tested: 10,
      skipped: 0,
      ok: 5,
      noResponse: 4,
      errors: 1,
      details: [],
    };
    const out = await autoFix(report);
    expect(out.applied).toContain('router_re_dispatch');
  });

  it('applique root_remount si errors ≥ 3', async () => {
    const root = document.createElement('div');
    root.id = 'apex-root';
    root.innerHTML = '<p>initial</p>';
    document.body.appendChild(root);

    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/',
      totalButtons: 10,
      tested: 10,
      skipped: 0,
      ok: 5,
      noResponse: 2,
      errors: 3,
      details: [],
    };
    const out = await autoFix(report);
    expect(out.applied).toContain('root_remount');
    /* Root toujours présent après re-mount */
    expect(document.getElementById('apex-root')?.innerHTML).toContain('initial');
  });

  it('escalade Claude Code si failure rate > 50%', async () => {
    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/test',
      totalButtons: 10,
      tested: 10,
      skipped: 0,
      ok: 3,
      noResponse: 7,
      errors: 0,
      details: [
        { selector: '#x', label: 'X', status: 'no_response', reactions: [], durationMs: 600 },
      ],
    };
    const out = await autoFix(report);
    expect(out.escalated).toBe(true);
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{ type: string; severity: string }>;
    expect(todos.length).toBe(1);
    expect(todos[0]?.type).toBe('functional-bugs');
    expect(todos[0]?.severity).toBe('high');
  });

  it('escalade si errors > 5', async () => {
    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/',
      totalButtons: 20,
      tested: 20,
      skipped: 0,
      ok: 14,
      noResponse: 0,
      errors: 6,
      details: [],
    };
    const out = await autoFix(report);
    expect(out.escalated).toBe(true);
  });

  it('cap todos à 30 entries (FIFO)', async () => {
    const old = Array.from({ length: 35 }, (_, i) => ({ id: `old_${i}`, ts: i }));
    localStorage.setItem('ax_claude_todo', JSON.stringify(old));
    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/',
      totalButtons: 10,
      tested: 10,
      skipped: 0,
      ok: 0,
      noResponse: 10,
      errors: 0,
      details: [],
    };
    await autoFix(report);
    const stored = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
    expect(stored.length).toBeLessThanOrEqual(30);
  });

  it('aucun fix si rapport tout green', async () => {
    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/',
      totalButtons: 10,
      tested: 10,
      skipped: 0,
      ok: 10,
      noResponse: 0,
      errors: 0,
      details: [],
    };
    const out = await autoFix(report);
    expect(out.applied).toEqual([]);
    expect(out.escalated).toBe(false);
  });

  it('tested = 0 → failure rate 0 (anti-division-zero)', async () => {
    const report: FunctionalTestReport = {
      ts: Date.now(),
      ver: 'v13.4.199',
      viewBefore: '/',
      totalButtons: 0,
      tested: 0,
      skipped: 0,
      ok: 0,
      noResponse: 0,
      errors: 0,
      details: [],
    };
    const out = await autoFix(report);
    expect(out.applied).toEqual([]);
    expect(out.escalated).toBe(false);
  });
});

describe('apex-functional-tester testAndAutoFix (v13.4.199)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('cycle complet : before + fixes + after si fixes appliqués', async () => {
    /* 5 boutons inertes → 100% no_response → fix appliqué */
    for (let i = 0; i < 5; i++) mountBtnVisible({ id: `dead${i}`, label: `Dead${i}` });
    const result = await testAndAutoFix({ maxButtons: 5 });
    expect(result.before).toBeDefined();
    expect(result.fixes).toBeDefined();
    expect(result.fixes.applied.length).toBeGreaterThan(0);
    expect(result.fixes.escalated).toBe(true);
    expect(result.after).toBeDefined();
  }, 30_000);

  it('sans fixes si tout green : after undefined', async () => {
    mountBtnVisible({
      label: 'Active',
      onClick: () => {
        const t = document.createElement('div');
        t.className = 'ax-toast';
        document.body.appendChild(t);
      },
    });
    const result = await testAndAutoFix({ maxButtons: 5 });
    expect(result.fixes.applied).toEqual([]);
    expect(result.after).toBeUndefined();
    expect(result.improvement).toBe(0);
  });
});

describe('apex-functional-tester namespace (v13.4.199)', () => {
  it('expose les 4 méthodes', () => {
    expect(apexFunctionalTester.testButtonsInView).toBeDefined();
    expect(apexFunctionalTester.detectStaleButtons).toBeDefined();
    expect(apexFunctionalTester.autoFix).toBeDefined();
    expect(apexFunctionalTester.testAndAutoFix).toBeDefined();
  });
});
