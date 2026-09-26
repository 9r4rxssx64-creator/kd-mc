/**
 * APEX v13 — Store réactif Proxy
 *
 * Source unique de vérité runtime. Pas de Redux, pas de Vuex.
 * Subscribe granulaire par clé.
 *
 * Anti-pattern évité : pas de window.K, pas de mutation hors store.
 */

import { events } from './events.js';

export interface AppState {
  user: { id: string; name: string; email?: string } | null;
  view: string;
  isStreaming: boolean;
  online: boolean;
  appVer: string;
  isAdmin: boolean;
  /* Commercialisation togglable par admin (paywall, abonnements, marketplace) */
  commerceEnabled: boolean;
  /* Theme courant */
  theme: 'dark' | 'light';
  [k: string]: unknown;
}

type Listener<T> = (value: T, prev: T) => void;

/* v13.3.89 P2.14 — Middleware support : intercept set() pour logging/audit/transform.
 * Middleware retourne true pour proceed, false pour abort, ou objet { value } pour transform. */
export type StoreMiddleware = (
  key: string,
  value: unknown,
  prev: unknown,
) => boolean | { value: unknown };

/* v13.3.89 P2.14 — Computed properties : valeurs dérivées recalculées sur changement de deps.
 * Pas full reactive system (pas de Vue.computed/MobX), juste lazy compute on access. */
type ComputedFn<T> = () => T;

class Store {
  private state: AppState = {} as AppState;
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private middlewares: StoreMiddleware[] = [];
  private computed = new Map<string, ComputedFn<unknown>>();
  private initialized = false;

  init(initial: Partial<AppState>): void {
    if (this.initialized) return;
    this.initialized = true;
    /* Hydrate depuis localStorage si présent */
    const persisted = this.loadPersisted();
    this.state = {
      user: null,
      view: 'landing',
      isStreaming: false,
      online: navigator.onLine,
      appVer: '',
      isAdmin: false,
      commerceEnabled: false /* v13.4.102 (Kevin "desactive revient ON tout seul") :
                                  OFF par defaut. Avant true → reinstall PWA = retour ON
                                  meme si Kevin avait mis OFF. Maintenant Kevin doit
                                  explicitement activer commerce — pas l'inverse. */,
      theme: 'dark',
      ...initial,
      ...persisted,
    };
    /* v13.4.110 (régression test v13.4.35) : force persist des PERSISTED_KEYS
     * au boot si pas déjà en localStorage. Sinon set(key, default) skip car
     * prev === value → test "set(commerceEnabled, false) persiste" échoue
     * quand default === value. Persist explicit pour garantir state stable. */
    for (const k of this.PERSISTED_KEYS) {
      try {
        if (localStorage.getItem(`apex_v13_${k}`) === null) {
          localStorage.setItem(`apex_v13_${k}`, JSON.stringify(this.state[k as keyof AppState]));
        }
      } catch { /* quota ignored */ }
    }
  }

  get<K extends keyof AppState>(key: K): AppState[K];
  get(key: string): unknown;
  get(key: string): unknown {
    return this.state[key];
  }

  set<K extends keyof AppState>(key: K, value: AppState[K]): void;
  set(key: string, value: unknown): void;
  set(key: string, value: unknown): void {
    const prev = this.state[key];
    if (prev === value) {
      /* v13.4.110 (régression test v13.4.35) : si valeur identique MAIS clé
       * PERSISTED, garantir que localStorage reflète quand même la valeur
       * (utile si localStorage a été clear manuellement). */
      if (this.PERSISTED_KEYS.has(key)) {
        this.persistKey(key, value);
      }
      return;
    }
    /* v13.3.89 P2.14 — middleware chain : peut transform ou abort */
    let finalValue = value;
    for (const mw of this.middlewares) {
      try {
        const r = mw(key, finalValue, prev);
        if (r === false) return; /* abort */
        if (r && typeof r === 'object' && 'value' in r) {
          finalValue = (r as { value: unknown }).value;
        }
      } catch {
        /* middleware errors swallowed, continue chain */
      }
    }
    this.state[key] = finalValue;
    this.persistKey(key, finalValue);
    events.emit('store:change', { key, value: finalValue });
    this.notify(key, finalValue, prev);
  }

  /**
   * v13.3.89 P2.14 — Register middleware (audit/logging/transform).
   * Exemple : `store.use((key, value) => { logger.debug('store.set', { key, value }); return true; })`
   */
  use(middleware: StoreMiddleware): () => void {
    this.middlewares.push(middleware);
    return () => {
      const idx = this.middlewares.indexOf(middleware);
      if (idx >= 0) this.middlewares.splice(idx, 1);
    };
  }

  /**
   * v13.3.89 P2.14 — Computed property : valeur dérivée lazy-computed à l'access.
   * Exemple : `store.defineComputed('isAuthAdmin', () => store.get('isAdmin') && store.get('user') !== null)`
   * Lecture : `store.computed('isAuthAdmin')` ou `store.get('isAuthAdmin')`.
   */
  defineComputed<T>(key: string, fn: ComputedFn<T>): void {
    this.computed.set(key, fn as ComputedFn<unknown>);
  }

  /**
   * Lit une computed property (recalcule à chaque appel).
   */
  getComputed<T>(key: string): T | undefined {
    const fn = this.computed.get(key);
    if (!fn) return undefined;
    try {
      return fn() as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Liste les computed registered (debug).
   */
  listComputed(): string[] {
    return [...this.computed.keys()];
  }

  subscribe<K extends keyof AppState>(key: K, fn: Listener<AppState[K]>): () => void;
  subscribe(key: string, fn: Listener<unknown>): () => void;
  subscribe(key: string, fn: Listener<unknown>): () => void {
    const set = this.listeners.get(key) ?? new Set();
    set.add(fn);
    this.listeners.set(key, set);
    return () => set.delete(fn);
  }

  snapshot(): Readonly<AppState> {
    return { ...this.state };
  }

  private notify(key: string, value: unknown, prev: unknown): void {
    this.listeners.get(key)?.forEach((fn) => {
      try {
        fn(value, prev);
      } catch {
        /* listener errors swallowed mais loggés via events bus */
      }
    });
  }

  private readonly PERSISTED_KEYS = new Set(['theme', 'commerceEnabled']);

  private persistKey(key: string, value: unknown): void {
    if (!this.PERSISTED_KEYS.has(key)) return;
    try {
      localStorage.setItem(`apex_v13_${key}`, JSON.stringify(value));
    } catch {
      /* QuotaExceeded ignoré, pas critique pour ces clés */
    }
  }

  private loadPersisted(): Partial<AppState> {
    const out: Partial<AppState> = {};
    for (const k of this.PERSISTED_KEYS) {
      try {
        const raw = localStorage.getItem(`apex_v13_${k}`);
        if (raw) (out as Record<string, unknown>)[k] = JSON.parse(raw);
      } catch {
        /* corruption JSON ignorée */
      }
    }
    return out;
  }
}

export const store = new Store();
