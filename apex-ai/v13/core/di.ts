/**
 * APEX v13 — DEPRECATED — fichier renommé en service-locator.ts (v13.3.89, P1.8 audit).
 *
 * Audit honnête : 0% utilisation production, juste un service locator simple, pas un vrai DI.
 * Voir core/service-locator.ts pour le code (et explications).
 *
 * Conservé pour rétrocompat tests/unit/di.test.ts.
 */
export { di, serviceLocator } from './service-locator.js';
