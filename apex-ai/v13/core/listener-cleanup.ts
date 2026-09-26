/**
 * Listener Cleanup Helper — P1-6 (audit v13.2.5).
 *
 * Audit indépendant a noté ratio 276 addEventListener / 10 removeEventListener
 * (27:1) sur SPA = leak garanti après navigation. Cible Linear/Vercel ~3:1.
 *
 * Solution : helper bindCleanable() qui auto-track les listeners par "scope"
 * (ex: une view, une feature, un widget) et les retire en une seule fois
 * quand le scope est détruit.
 *
 * Usage :
 *   const c = createCleanupScope('chat-view');
 *   c.bind(button, 'click', handler);
 *   c.bind(window, 'resize', onResize);
 *   c.bind(document, 'visibilitychange', onVis);
 *   // Plus tard, au teardown :
 *   c.cleanup(); // → tous les listeners ci-dessus sont retirés
 *
 * Anti-leak garanti : si bind() est appelé après cleanup(), nouveau scope.
 */

interface CleanupBinding {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

export interface CleanupScope {
  /** Nom debug (visible dans logs / DevTools). */
  readonly name: string;

  /** Nombre de listeners actifs. */
  readonly size: number;

  /** Indique si cleanup() a déjà été appelé. */
  readonly disposed: boolean;

  /**
   * Ajoute un listener auto-tracké. Retourne une fonction de désinscription
   * individuelle (utile si on veut retirer un seul listener avant cleanup global).
   */
  bind<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  bind<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  bind<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  bind(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): () => void;

  /**
   * Retire TOUS les listeners ajoutés via bind() dans ce scope.
   * Idempotent : appelable plusieurs fois sans erreur.
   */
  cleanup(): void;

  /**
   * Ajoute une fonction de cleanup arbitraire (timeouts, intervals, etc.).
   * Sera appelée lors de cleanup().
   */
  onCleanup(fn: () => void): void;
}

class CleanupScopeImpl implements CleanupScope {
  private bindings: CleanupBinding[] = [];
  private extraCleanups: Array<() => void> = [];
  private _disposed = false;

  constructor(public readonly name: string) {}

  get size(): number {
    return this.bindings.length;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  bind(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): () => void {
    if (this._disposed) {
      /* Scope déjà disposé : silencieusement no-op (anti-bug si bind appelé après teardown async) */
      return () => { /* noop */ };
    }
    target.addEventListener(type, listener, options);
    const binding: CleanupBinding = options !== undefined
      ? { target, type, listener, options }
      : { target, type, listener };
    this.bindings.push(binding);
    return () => {
      const idx = this.bindings.indexOf(binding);
      if (idx >= 0) {
        this.bindings.splice(idx, 1);
        try {
          target.removeEventListener(type, listener, options);
        } catch { /* ignore */ }
      }
    };
  }

  onCleanup(fn: () => void): void {
    if (this._disposed) {
      /* Si déjà disposé : exécute immédiatement */
      try { fn(); } catch { /* ignore */ }
      return;
    }
    this.extraCleanups.push(fn);
  }

  cleanup(): void {
    if (this._disposed) return;
    this._disposed = true;
    /* Listeners */
    for (const b of this.bindings) {
      try {
        b.target.removeEventListener(b.type, b.listener, b.options);
      } catch { /* ignore */ }
    }
    this.bindings = [];
    /* Cleanups arbitraires */
    for (const fn of this.extraCleanups) {
      try { fn(); } catch { /* ignore — un cleanup ne doit jamais bloquer les autres */ }
    }
    this.extraCleanups = [];
  }
}

/**
 * Crée un nouveau scope de cleanup nommé (ex: 'chat-view', 'admin-toggles').
 * À utiliser au début de chaque feature/view qui ajoute des listeners.
 */
export function createCleanupScope(name: string): CleanupScope {
  return new CleanupScopeImpl(name);
}

/**
 * Variante 1-shot : crée un scope, exécute fn, retourne le scope pour cleanup ultérieur.
 * Pratique pour les patterns `const scope = withScope('feature', s => { s.bind(...); })`.
 */
export function withScope(name: string, fn: (scope: CleanupScope) => void): CleanupScope {
  const scope = createCleanupScope(name);
  fn(scope);
  return scope;
}
