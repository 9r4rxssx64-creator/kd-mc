/**
 * APEX v13 — Style Injector (CSP strict — élimination unsafe-inline)
 *
 * Mission : injecter du CSS dynamique au runtime SANS `unsafe-inline` dans
 * `style-src`. Utilise les Constructible Stylesheets API (`CSSStyleSheet` +
 * `document.adoptedStyleSheets`).
 *
 * Compatibilité (vérifiée 2026-05-08) :
 * - Chrome 73+   : ✅ natif
 * - Edge 79+     : ✅ natif
 * - Safari 16.4+ : ✅ natif
 * - Firefox 101+ : ✅ natif
 * - Polyfill     : fallback `<style nonce>` si `CSSStyleSheet` non supporté
 *
 * Anti-pattern : injection via `<style>` HTML inline → bloqué par CSP strict.
 *
 * Usage :
 *   import { styleInjector } from '@services/core-svc/style-injector.js';
 *   const id = styleInjector.inject('toast', `.ax-toast { ... }`);
 *   styleInjector.remove(id);  // optionnel
 *
 * Pour styles éphémères (modals, drawers), utiliser inject() au mount,
 * remove() au unmount. Pour styles permanents (theme, components), inject()
 * suffit (idempotent par id).
 */

interface InjectedSheet {
  id: string;
  css: string;
  /** Constructible stylesheet si supporté */
  sheet?: CSSStyleSheet;
  /** Fallback <style> element si polyfill */
  el?: HTMLStyleElement;
}

class StyleInjector {
  private sheets: Map<string, InjectedSheet> = new Map();
  /** Nonce CSP injecté par vite-csp-nonce-plugin (lu depuis 1er <script nonce>) */
  private nonce: string | null = null;
  /** Capabilities détectées au 1er appel */
  private supportsConstructible: boolean | null = null;

  private detectCapabilities(): void {
    if (this.supportsConstructible !== null) return;
    try {
      this.supportsConstructible =
        typeof CSSStyleSheet !== 'undefined' &&
        'replaceSync' in CSSStyleSheet.prototype &&
        Array.isArray((document as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets);
    } catch {
      this.supportsConstructible = false;
    }
  }

  /**
   * Récupère le nonce CSP depuis le DOM (premier <script nonce> trouvé).
   * Cache le résultat. Retourne null si non trouvé.
   */
  private getNonce(): string | null {
    if (this.nonce !== null) return this.nonce;
    if (typeof document === 'undefined') return null;
    try {
      const scriptWithNonce = document.querySelector('script[nonce]') as HTMLScriptElement | null;
      this.nonce = scriptWithNonce?.nonce || scriptWithNonce?.getAttribute('nonce') || null;
      return this.nonce;
    } catch {
      return null;
    }
  }

  /**
   * Injecte du CSS dans le document.
   *
   * @param id - Identifiant unique. Si réinjection avec même id, remplace
   *             (utile pour theme switching / hot-update).
   * @param css - Texte CSS valide.
   * @returns id (même que paramètre, pour chainage).
   */
  inject(id: string, css: string): string {
    this.detectCapabilities();
    /* Idempotence : si même id, remplace plutôt que d'ajouter */
    const existing = this.sheets.get(id);
    if (existing) {
      this.update(id, css);
      return id;
    }

    if (this.supportsConstructible === true) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        const doc = document as Document & { adoptedStyleSheets: CSSStyleSheet[] };
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        this.sheets.set(id, { id, css, sheet });
        return id;
      } catch {
        /* Tombe en fallback */
      }
    }

    /* Fallback : <style> element avec nonce CSP (si dispo) */
    if (typeof document === 'undefined') {
      this.sheets.set(id, { id, css });
      return id;
    }
    const el = document.createElement('style');
    el.dataset['styleInjectorId'] = id;
    el.textContent = css;
    const nonce = this.getNonce();
    if (nonce) {
      el.setAttribute('nonce', nonce);
    }
    document.head.appendChild(el);
    this.sheets.set(id, { id, css, el });
    return id;
  }

  /**
   * Met à jour le CSS d'un sheet existant. No-op si id inconnu.
   */
  update(id: string, css: string): boolean {
    const sheet = this.sheets.get(id);
    if (!sheet) return false;
    sheet.css = css;
    if (sheet.sheet) {
      try {
        sheet.sheet.replaceSync(css);
        return true;
      } catch {
        return false;
      }
    }
    if (sheet.el) {
      sheet.el.textContent = css;
      return true;
    }
    return false;
  }

  /**
   * Retire un sheet du document. No-op si id inconnu.
   */
  remove(id: string): boolean {
    const sheet = this.sheets.get(id);
    if (!sheet) return false;
    if (sheet.sheet) {
      try {
        const doc = document as Document & { adoptedStyleSheets: CSSStyleSheet[] };
        doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet.sheet);
      } catch {
        /* ignore */
      }
    }
    if (sheet.el && sheet.el.parentNode) {
      sheet.el.parentNode.removeChild(sheet.el);
    }
    this.sheets.delete(id);
    return true;
  }

  /**
   * Vérifie si un sheet est injecté.
   */
  has(id: string): boolean {
    return this.sheets.has(id);
  }

  /**
   * Liste tous les ids injectés (debug / audit).
   */
  list(): readonly string[] {
    return Array.from(this.sheets.keys());
  }

  /**
   * Supprime tous les sheets (utile en tests).
   */
  clear(): void {
    for (const id of Array.from(this.sheets.keys())) {
      this.remove(id);
    }
  }

  /**
   * Indique si Constructible Stylesheets sont supportés.
   */
  isConstructibleSupported(): boolean {
    this.detectCapabilities();
    return this.supportsConstructible === true;
  }
}

export const styleInjector = new StyleInjector();
export { StyleInjector };
