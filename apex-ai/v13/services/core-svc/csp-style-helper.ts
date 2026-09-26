/**
 * APEX v13 — CSP Style Helper (P0 sécu — strict CSP zéro unsafe-inline)
 *
 * Mission : permettre l'injection de blocs `<style>` dans HTML dynamique
 * (innerHTML) tout en respectant un CSP strict (`style-src 'self' 'nonce-XXX'`
 * SANS `'unsafe-inline'`).
 *
 * Stratégie :
 * 1. Récupère le nonce CSP au runtime (depuis 1er <script nonce> dans le DOM)
 * 2. Fournit `withNonce(html)` qui injecte `nonce="XXX"` dans tous les
 *    `<style>` tags d'une string HTML avant qu'elle soit assignée à innerHTML
 * 3. Fournit `extractStyles(html)` pour migrer progressivement vers
 *    `styleInjector.inject()` (constructible stylesheets, supérieur sur tous
 *    les axes : CSP strict, perf, encapsulation)
 *
 * Anti-pattern : `<style>...</style>` brut dans innerHTML → bloqué CSP strict.
 *
 * Usage transitoire :
 *   import { cspStyleHelper } from '@services/core-svc/csp-style-helper.js';
 *   rootEl.innerHTML = cspStyleHelper.withNonce(`
 *     <style>.my-class { color: red }</style>
 *     <div class="my-class">Hello</div>
 *   `);
 *
 * Usage final (préféré) :
 *   import { styleInjector } from '@services/core-svc/style-injector.js';
 *   styleInjector.inject('feature-X', `.my-class { color: red }`);
 *   rootEl.innerHTML = `<div class="my-class">Hello</div>`;
 */

class CspStyleHelper {
  private nonce: string | null = null;
  private detected = false;

  /**
   * Récupère le nonce CSP courant. Lookup dans le DOM (1er script avec nonce).
   * Cache le résultat. Retourne null si pas de nonce trouvé (CSP non actif).
   */
  getNonce(): string | null {
    if (this.detected) return this.nonce;
    this.detected = true;
    if (typeof document === 'undefined') return null;
    try {
      const script = document.querySelector('script[nonce]') as HTMLScriptElement | null;
      this.nonce = script?.nonce || script?.getAttribute('nonce') || null;
      return this.nonce;
    } catch {
      return null;
    }
  }

  /**
   * Reset le cache (utile en tests).
   */
  reset(): void {
    this.nonce = null;
    this.detected = false;
  }

  /**
   * Force le nonce (utile en tests / SSR).
   */
  setNonce(nonce: string | null): void {
    this.nonce = nonce;
    this.detected = true;
  }

  /**
   * Préfixe tous les `<style>` (sans nonce existant) d'une string HTML
   * avec `<style nonce="XXX">`.
   *
   * Idempotent : `<style nonce="..."` déjà présent → laissé tel quel.
   *
   * Si pas de nonce CSP détecté → retourne la string telle quelle (no-op).
   * Le CSP bloquera le bloc, mais ne casse pas le code.
   *
   * @param html - String HTML potentiellement avec `<style>` blocks
   * @returns String avec nonce ajouté à chaque `<style>` sans nonce
   */
  withNonce(html: string): string {
    const nonce = this.getNonce();
    if (!nonce) return html;
    /* Match <style> sans attribut nonce existant */
    return html.replace(/<style(?![^>]*\bnonce=)([^>]*)>/gi, `<style nonce="${nonce}"$1>`);
  }

  /**
   * Extrait tous les blocs `<style>...</style>` d'une string HTML.
   * Retourne :
   * - `cleanHtml` : HTML sans les blocs style
   * - `styles` : array du contenu CSS de chaque bloc
   *
   * Utile pour migrer vers `styleInjector.inject()`.
   */
  extractStyles(html: string): { cleanHtml: string; styles: string[] } {
    const styles: string[] = [];
    const cleanHtml = html.replace(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
      styles.push(css); /* groupe capturant → toujours string (pas de branche morte ?? '') */
      return '';
    });
    return { cleanHtml, styles };
  }
}

export const cspStyleHelper = new CspStyleHelper();
export { CspStyleHelper };
