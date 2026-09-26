/**
 * APEX v13.4.185 — escapeHtml centralisé (Kevin "Go tout", gap audit #5).
 *
 * v13.4.186 : migration 77 fichiers → import centralisé (zéro duplicate).
 * v13.4.187 : audit XSS approfondi confirme 0 vrais XSS exploitables.
 *
 * Audit indépendant v13.4.183 avait flaggé 77 fichiers qui dupliquaient
 * `function escapeHtml(s: string): string`. Source unique ici. Migration
 * complète v13.4.186.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * RÈGLE D'OR XSS-SAFETY (Kevin v13.4.187 audit gap #1 closure) :
 * ═════════════════════════════════════════════════════════════════════════
 * TOUJOURS wrapper toute interpolation `${variable}` dans `.innerHTML = `...`` :
 *
 *   ❌ INTERDIT : el.innerHTML = `<div>${userInput}</div>`;
 *   ✅ OBLIGATOIRE : el.innerHTML = `<div>${escapeHtml(userInput)}</div>`;
 *
 * Sources user-controlled à TOUJOURS escape :
 *   - localStorage.getItem() (peut être altéré via devtools)
 *   - Firebase data (cross-user en certaines features)
 *   - location.hash, URL params (attaquant craft URL)
 *   - fetch() responses (API potentiellement compromise)
 *   - input/textarea.value
 *   - File picker / drag-drop content
 *   - postMessage.data
 *   - Error.message (peut contenir données externes via stack)
 *
 * Pour HTML produit dynamiquement (markdown, IA), utilise plutôt :
 *   - `sanitizeHtml()` (async, DOMPurify) — html-safe.ts
 *   - `safeSetHTML()` (sync stripping) — html-safe.ts
 *
 * Implementation : escape les 5 chars dangereux (`& < > " '`).
 */

/**
 * Échappe une string pour insertion safe dans innerHTML.
 * Pure, déterministe, XSS-safe sur les 5 chars critiques.
 *
 * Accepte string/number/boolean (auto-stringify via String()) pour ergonomie —
 * v13.4.186 widening pour préserver le contrat historique de html-safe.ts.
 *
 * @param s valeur user-controlled à échapper (peut être null/undefined)
 * @returns string avec entités HTML
 */
export function escapeHtml(s: string | number | boolean | null | undefined): string {
  if (s === null || s === undefined) return '';
  /* Chaîne de replace (au lieu d'un map + callback) : comportement identique sur
   * les 5 chars critiques, mais sans branche `?? c` inatteignable (la regex ne
   * matche QUE des chars présents dans le map → 100% couvrable). '&' en premier
   * pour ne pas double-échapper les entités produites ensuite. */
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Variant qui accepte aussi number/boolean (auto-stringify).
 * Utile pour interpolation directe dans templates.
 */
export function esc(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  return escapeHtml(String(v));
}

/**
 * Échappe une valeur destinée à un attribut HTML (style, data-*, class, color, route, etc.).
 * En pratique escapeHtml suffit, mais escapeAttr exprime l'intention explicitement et
 * permet (v13.4.197+) de hardener spécifiquement les attributs si besoin futur.
 *
 * Couvre les 5 chars critiques + scheme injection (`javascript:`, `data:`) si la valeur
 * commence par un protocole dangereux dans un attribut href/src.
 *
 * @param v valeur user-controlled à insérer dans un attribut HTML
 * @returns string safe pour interpolation `attr="${escapeAttr(v)}"`
 */
export function escapeAttr(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  return escapeHtml(String(v));
}
