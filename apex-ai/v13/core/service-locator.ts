/**
 * APEX v13 — Service Locator (renommé depuis core/di.ts en v13.3.89)
 *
 * Audit honnête P1.8 (2026-05-08) : 0% utilisation production, seulement tests unitaires
 * (di.test.ts). Pas un vrai DI container (pas de scope, pas de lifecycle, pas de graph).
 *
 * Pattern réel utilisé partout dans le code = await import() lazy-loading dynamique.
 * Exemples production : 80+ `const { mod } = await import('./service.js')`.
 *
 * Conservé en service-locator.ts (pas DI) pour :
 * 1. Rétrocompatibilité avec tests/unit/di.test.ts (qui passent en l'état)
 * 2. Pattern futur si besoin de registry centralisé (ex: plugins marketplace v14+)
 * 3. Reste léger (46 lignes), zéro coût bundle
 *
 * Si on veut un vrai DI plus tard : Inversify, tsyringe, ou similaire.
 * Ne pas confondre avec un vrai DI container.
 */

import { logger } from './logger.js';

type Factory<T> = () => T | Promise<T>;
type ServiceEntry<T> = { factory: Factory<T>; instance?: T; loading?: Promise<T> };

class ServiceLocator {
  private services = new Map<string, ServiceEntry<unknown>>();

  register<T>(name: string, factory: Factory<T>): void {
    if (this.services.has(name)) {
      logger.warn('service-locator', `Service already registered: ${name}`);
      return;
    }
    this.services.set(name, { factory: factory as Factory<unknown> });
  }

  async resolve<T>(name: string): Promise<T> {
    const entry = this.services.get(name) as ServiceEntry<T> | undefined;
    if (!entry) throw new Error(`ServiceLocator: service not registered: ${name}`);
    if (entry.instance !== undefined) return entry.instance;
    if (entry.loading) return entry.loading;
    const promise = Promise.resolve(entry.factory());
    entry.loading = promise;
    const instance = await promise;
    entry.instance = instance;
    delete entry.loading;
    return instance;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  list(): string[] {
    return [...this.services.keys()];
  }
}

export const serviceLocator = new ServiceLocator();

/* Backward-compat alias : `di` reste exporté pour ne pas casser tests/unit/di.test.ts.
 * Marqué deprecated — nouveau code doit utiliser `serviceLocator` ou `await import()`. */
/** @deprecated Renommé v13.3.89 — utiliser `serviceLocator` ou `await import()` directement. */
export const di = serviceLocator;
