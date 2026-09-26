/**
 * Test régression v13.4.79 — router auto-retry "Importing a module script failed".
 *
 * Kevin 2026-05-14 22:04 iPhone PWA : après force-update v13.4.78, vu
 * "Souci de chargement / Importing a module script failed (admin debug)".
 *
 * Cause : iOS Safari SW transition v13.4.77→78 race condition ; cache local
 * vidé par activate, first fetch network du chunk peut échouer si network slow.
 *
 * Fix : router auto-retry 800ms si error match /import.*module.*script|Loading.*chunk.*failed/.
 */
import { describe, it, expect } from 'vitest';
import { router } from '../../core/router.js';

describe('v13.4.79 router auto-retry module load failure', () => {
  it("router singleton défini", () => {
    expect(router).toBeDefined();
    expect(typeof router.register).toBe('function');
    expect(typeof router.dispatch).toBe('function');
    expect(typeof router.navigate).toBe('function');
  });

  it("register() + loader qui throw 'Importing a module script failed' → retry tenté", async () => {
    /* Setup DOM minimal */
    document.body.innerHTML = '<div id="apex-root"></div>';
    router.init();

    let attempts = 0;
    router.register('test-retry-79', {
      loader: () => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error('Failed to fetch dynamically imported module: ./chunks/foo.js'));
        }
        return Promise.resolve({ render: (el: HTMLElement): void => { el.innerHTML = '<div>OK</div>'; } });
      },
    });

    /* Trigger dispatch via location.hash */
    location.hash = '#test-retry-79';
    /* Attendre le retry 800ms + un peu */
    await new Promise((r) => setTimeout(r, 1200));

    expect(attempts).toBeGreaterThanOrEqual(2);
  }, 5000);

  it("Loader qui throw erreur NON-module → pas de retry", async () => {
    document.body.innerHTML = '<div id="apex-root"></div>';
    router.init();

    let attempts = 0;
    router.register('test-no-retry-79', {
      loader: () => {
        attempts++;
        return Promise.reject(new Error('Erreur métier random'));
      },
    });

    location.hash = '#test-no-retry-79';
    await new Promise((r) => setTimeout(r, 1200));

    /* Pas de retry sur erreur non-module */
    expect(attempts).toBe(1);
  }, 5000);

  it("Loader succès direct → 1 seule tentative", async () => {
    document.body.innerHTML = '<div id="apex-root"></div>';
    router.init();

    let attempts = 0;
    router.register('test-ok-79', {
      loader: () => {
        attempts++;
        return Promise.resolve({ render: (el: HTMLElement): void => { el.innerHTML = '<div>OK1</div>'; } });
      },
    });

    location.hash = '#test-ok-79';
    await new Promise((r) => setTimeout(r, 200));

    expect(attempts).toBe(1);
  }, 3000);
});

describe('v13.4.79 router error detection patterns', () => {
  /* Vérification que la regex couvre bien les messages d'erreur réels iOS Safari */
  const ERROR_PATTERNS_THAT_MUST_RETRY = [
    'Importing a module script failed',
    'Importing a module script failed.',
    'Failed to fetch dynamically imported module: ./chunks/foo.js',
    'Loading chunk 42 failed',
    'Failed to fetch dynamically imported module',
  ];
  const ERROR_PATTERNS_NO_RETRY = [
    'Permission denied',
    'Network offline',
    'Erreur métier random',
    'Auth required',
  ];

  /* Reproduction de la regex utilisée dans router.ts */
  const RETRY_REGEX = /import.*module.*script|failed.*fetch.*dynamically.*imported|Loading.*chunk.*failed|Failed.*to.*fetch.*dynamically.*imported.*module/i;

  it("Tous les patterns iOS Safari réels matchent la regex retry", () => {
    for (const p of ERROR_PATTERNS_THAT_MUST_RETRY) {
      expect(RETRY_REGEX.test(p), `Should match: "${p}"`).toBe(true);
    }
  });

  it("Erreurs non-module ne matchent PAS (pas de retry inutile)", () => {
    for (const p of ERROR_PATTERNS_NO_RETRY) {
      expect(RETRY_REGEX.test(p), `Should NOT match: "${p}"`).toBe(false);
    }
  });
});
