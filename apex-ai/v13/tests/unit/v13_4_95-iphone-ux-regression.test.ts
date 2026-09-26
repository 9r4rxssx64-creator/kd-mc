/**
 * Test régression v13.4.95 — UX iPhone Safari critiques (Kevin "Zoom tjs UX").
 *
 * Kevin signal : "Pourquoi les tests réels ne te montrent pas ces problèmes"
 *
 * Ces tests vérifient les invariants STATIQUES qui peuvent être testés sans
 * un vrai Safari iOS :
 * 1. viewport meta autorise le zoom utilisateur (a11y — v13.4.248 : Apple HIG
 *    + skill apex-ui-ux-pro-max "ne jamais désactiver le zoom").
 * 2. rescue.js ne bloque plus le pinch-zoom (initAntiZoom retiré v13.4.248).
 * 3. rescue.js contient initToolbarToggle + apex-rescue-show
 * 4. rescue.css contient touch-action: manipulation + -webkit-text-size-adjust
 * 5. vault.ts setKey AWAIT vault-firebase-backup (au lieu void async)
 *
 * Le RUNTIME (vrai zoom Safari iOS) ne peut être testé qu'avec Playwright
 * WebKit → workflow apex-ios-simulator.yml maintenant lancé sur CHAQUE push.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

describe('v13.4.248 viewport meta iPhone Safari — zoom a11y rétabli', () => {
  const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');

  it('viewport meta NE désactive PAS le zoom (a11y Apple HIG)', () => {
    expect(indexHtml).not.toMatch(/user-scalable\s*=\s*no/);
  });

  it('viewport meta autorise le zoom (maximum-scale >= 5)', () => {
    expect(indexHtml).toMatch(/maximum-scale\s*=\s*5/);
  });

  it('viewport meta contient viewport-fit=cover (notch iPhone)', () => {
    expect(indexHtml).toMatch(/viewport-fit\s*=\s*cover/);
  });
});

describe('v13.4.248 rescue.js — pinch-zoom non bloqué + toolbar toggle', () => {
  const rescueJs = readFileSync(resolve(ROOT, 'assets/js/rescue.js'), 'utf-8');

  it("rescue.js ne contient plus initAntiZoom (zoom a11y rétabli)", () => {
    expect(rescueJs).not.toContain('initAntiZoom()');
  });

  it("rescue.js ne bloque plus gesturestart/change/end (pinch-zoom Safari iOS)", () => {
    expect(rescueJs).not.toContain('gesturestart');
    expect(rescueJs).not.toContain('gesturechange');
  });

  it("rescue.js contient initToolbarToggle (Kevin 'boutons superposés')", () => {
    expect(rescueJs).toContain('initToolbarToggle');
    expect(rescueJs).toContain('apex-rescue-show');
  });

  it("rescue.js long press 800ms cache toolbar", () => {
    expect(rescueJs).toMatch(/800/);
    expect(rescueJs).toContain('apex_v13_rescue_hidden');
  });
});

describe('v13.4.95 rescue.css anti-zoom CSS', () => {
  const rescueCss = readFileSync(resolve(ROOT, 'assets/css/rescue.css'), 'utf-8');

  it("rescue.css contient -webkit-text-size-adjust: 100%", () => {
    expect(rescueCss).toMatch(/-webkit-text-size-adjust:\s*100%/);
  });

  it("rescue.css contient touch-action: manipulation", () => {
    expect(rescueCss).toMatch(/touch-action:\s*manipulation/);
  });

  it("rescue.css force input font-size 16px (iOS zoom trigger)", () => {
    expect(rescueCss).toMatch(/input.*font-size:\s*16px/s);
  });

  it("rescue.css body padding-right libère espace toolbar", () => {
    expect(rescueCss).toMatch(/body\s*\{[^}]*padding-right:/s);
  });
});

describe('v13.4.95 vault.setKey Firebase backup AWAITED', () => {
  const vaultTs = readFileSync(resolve(ROOT, 'services/vault/vault.ts'), 'utf-8');

  it("vault.setKey contient Promise.race avec timeout pour Firebase backup", () => {
    expect(vaultTs).toContain('Promise.race');
    expect(vaultTs).toContain('vault-firebase-backup');
  });

  it("vault.setKey n'utilise plus void import non-bloquant pour fb-backup", () => {
    /* Le pattern void import().then() async était la cause "perd mémoire".
     * Maintenant on await race(fbBackupPromise, timeout 3s). */
    expect(vaultTs).toMatch(/timeoutPromise.*setTimeout.*3000/s);
  });
});

describe('v13.4.95 workflow Playwright iOS lance sur push', () => {
  const workflow = readFileSync(
    resolve(ROOT, '../../.github/workflows/apex-ios-simulator.yml'),
    'utf-8',
  );

  it("workflow apex-ios-simulator déclenché sur push branches main + claude/**", () => {
    expect(workflow).toMatch(/on:[\s\S]*push:/);
    expect(workflow).toContain("'claude/**'");
  });

  it("workflow ciblé sur apex-ai/v13/** + apex-ai-v13/**", () => {
    expect(workflow).toContain('apex-ai/v13/**');
    expect(workflow).toContain('apex-ai-v13/**');
  });
});
