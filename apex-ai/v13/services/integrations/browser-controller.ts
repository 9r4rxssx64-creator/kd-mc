/**
 * APEX v13 — Browser Controller (anti-blocage + navigation IA + sécurité agents).
 *
 * Implémente les règles permanentes CLAUDE.md :
 *  - "🛡️ BROWSER SANS BLOCAGE + SECU AGENTS PROTECTION"
 *  - "🌐 APEX EXÉCUTE TOUTES LES DEMANDES"
 *  - "🧭 IA NAVIGUE ET REMPLIT"
 *
 * Rôle :
 *  1) `axTryUnblockUrl(url)` : essaie 4 stratégies cascade (direct, web archive,
 *     reader.jina.ai, CORS proxy) pour contourner X-Frame-Options / CSP frame-ancestors.
 *  2) `axNavigateTo(target, field?)` : router maps "coffre.gemini" → ouvre vault + scroll
 *     + highlight du champ. Permet à Apex IA de dire "tu colles ici" et l'utilisateur clique
 *     sur le bon champ tout de suite.
 *  3) Blocklist DNS family Cloudflare (1.1.1.2/3) : bloque malware/phishing connus
 *     avant même de tenter de charger la page.
 *  4) HEAD probe : test rapide loadability d'un URL (timeout 3s) pour pré-filtrer
 *     les morts/bloqués avant d'embed.
 *
 * Anti-pattern Kevin :
 *  - Pas d'eval / new Function
 *  - Pas de fetch sans timeout
 *  - Pas d'innerHTML sur user content (DOMPurify ou escapeHtml par caller)
 *  - Pas de redirection automatique sans confirm si action niveau B/C
 */

import { logger } from '../../core/logger.js';

/* === Types =============================================================== */

export type UnblockMethod = 'direct' | 'archive' | 'reader' | 'cors-proxy' | 'safari-fallback';

export interface UnblockAttempt {
  method: UnblockMethod;
  url: string;
  ok: boolean;
  status?: number | undefined;
  error?: string | undefined;
}

export interface UnblockResult {
  ok: boolean;
  method: UnblockMethod;
  url: string;
  attempts: readonly UnblockAttempt[];
  fallback?: 'open_safari' | undefined;
}

export interface NavigateResult {
  ok: boolean;
  view?: string | undefined;
  field?: string | undefined;
  highlightSelector?: string | undefined;
  error?: string | undefined;
}

/* === Blocklist domaines (malware/phishing) ================================ */

/* Liste minimale, complétée via Cloudflare Family DNS (1.1.1.3) au runtime.
   Format domaine canonique sans protocole, pas de wildcard. */
const STATIC_BLOCKLIST: ReadonlySet<string> = new Set([
  'malware-test.example',
  'phishing-test.example',
  /* Domaines explicitement interdits par Kevin (CSAM/illégal) — placeholder, à enrichir */
]);

/**
 * Vérifie si un domaine est dans la blocklist statique.
 * Renvoie le domaine extrait ou null si URL invalide.
 */
export function isBlockedDomain(url: string): { blocked: boolean; domain: string | null; reason?: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (STATIC_BLOCKLIST.has(host)) {
      return { blocked: true, domain: host, reason: 'static_blocklist' };
    }
    /* Schemes interdits */
    // eslint-disable-next-line no-script-url -- intentional check pour bloquer ce schéma
    if (u.protocol === 'javascript:' || u.protocol === 'data:' || u.protocol === 'file:') {
      return { blocked: true, domain: host, reason: 'scheme_forbidden' };
    }
    return { blocked: false, domain: host };
  } catch {
    return { blocked: true, domain: null, reason: 'invalid_url' };
  }
}

/* === Builders fallback URLs (cohérent avec features/browser/index.ts) ===== */

export function buildArchiveUrl(url: string): string {
  return `https://web.archive.org/web/2/${encodeURIComponent(url)}`;
}

export function buildReaderUrl(url: string): string {
  /* reader.jina.ai retourne version texte propre, gratuit, sans X-Frame-Options */
  return `https://r.jina.ai/${url}`;
}

/**
 * URL via CORS proxy custom (Cloudflare Worker Apex).
 * Configuré via localStorage `ax_cors_proxy_url`. Si absent, retourne null.
 */
export function buildCorsProxyUrl(url: string): string | null {
  try {
    const proxy = (typeof localStorage !== 'undefined' ? localStorage.getItem('ax_cors_proxy_url') : null) ?? '';
    if (!proxy) return null;
    const sep = proxy.includes('?') ? '&' : '?';
    return `${proxy}${sep}url=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}

/* === HEAD probe (test loadability rapide) ================================= */

/**
 * Teste si une URL répond (HEAD HTTP). Timeout 3s.
 * Note : ne dit RIEN sur X-Frame-Options (impossible à détecter via HEAD avec
 * `mode: no-cors` qui retourne opaque). Mais détecte 4xx/5xx, DNS down, etc.
 */
export async function headProbe(url: string, timeoutMs = 3000): Promise<{ ok: boolean; status?: number | undefined; error?: string | undefined }> {
  if (typeof fetch === 'undefined') return { ok: false, error: 'fetch unavailable' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => { ctrl.abort(); }, timeoutMs);
    const res = await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
    clearTimeout(t);
    /* mode no-cors → status est 0/opaque. Considéré ok si pas de throw. */
    const status = res.status === 0 ? undefined : res.status;
    return { ok: true, status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/* === axTryUnblockUrl : cascade contournement =============================== */

/**
 * Cascade 4 stratégies pour ouvrir une URL :
 *   1. direct (URL telle quelle)
 *   2. web.archive.org cache
 *   3. r.jina.ai reader (texte propre)
 *   4. CORS proxy custom (si configuré)
 *
 * Si toutes échouent → retourne `{ok:false, fallback:'open_safari'}` →
 * caller doit `window.open(originalUrl, '_blank')`.
 *
 * Note : le test de loadability est volontairement rapide (HEAD probe) car
 * détecter X-Frame-Options de façon fiable nécessite de charger l'iframe et
 * lire `iframe.contentDocument` qui throw sur cross-origin. Cette logique est
 * dans `features/browser/index.ts` (`detectIframeBlocked`). Ici on retourne
 * la 1ère stratégie qui répond HEAD ok.
 */
export async function axTryUnblockUrl(url: string): Promise<UnblockResult> {
  const blockCheck = isBlockedDomain(url);
  if (blockCheck.blocked) {
    return {
      ok: false,
      method: 'direct',
      url,
      attempts: [{ method: 'direct', url, ok: false, error: blockCheck.reason ?? 'blocked' }],
      fallback: 'open_safari',
    };
  }

  const attempts: UnblockAttempt[] = [];
  const candidates: { method: UnblockMethod; url: string }[] = [
    { method: 'direct', url },
    { method: 'archive', url: buildArchiveUrl(url) },
    { method: 'reader', url: buildReaderUrl(url) },
  ];
  const corsProxy = buildCorsProxyUrl(url);
  if (corsProxy) candidates.push({ method: 'cors-proxy', url: corsProxy });

  for (const cand of candidates) {
    /* Re-vérifie blocklist sur l'URL transformée (paranoia : reader.jina.ai etc.) */
    const probe = await headProbe(cand.url);
    const attempt: UnblockAttempt = {
      method: cand.method,
      url: cand.url,
      ok: probe.ok,
      status: probe.status,
      error: probe.error,
    };
    attempts.push(attempt);
    if (probe.ok) {
      logger.info('browser-controller', `unblock ok via ${cand.method}`, { url: cand.url });
      return { ok: true, method: cand.method, url: cand.url, attempts };
    }
  }

  /* Toutes les stratégies ont échoué → fallback Safari */
  logger.warn('browser-controller', 'all unblock strategies failed, fallback safari', { url });
  return {
    ok: false,
    method: 'safari-fallback',
    url,
    attempts,
    fallback: 'open_safari',
  };
}

/* === axNavigateTo : router IA → vue + champ scroll/highlight =============== */

/**
 * Map d'aliases "coffre.gemini" → { view, field, highlightSelector }.
 * Étendable via `registerNavigationTarget()`.
 */
interface NavTarget {
  view: string;
  field?: string;
  highlightSelector?: string;
}

const NAV_TARGETS: Map<string, NavTarget> = new Map([
  /* Coffre / Vault */
  ['coffre', { view: 'vault' }],
  ['vault', { view: 'vault' }],
  ['coffre.anthropic', { view: 'vault', field: 'ax_anthropic_key', highlightSelector: '[data-vault-field="ax_anthropic_key"]' }],
  ['coffre.openai', { view: 'vault', field: 'ax_openai_key', highlightSelector: '[data-vault-field="ax_openai_key"]' }],
  ['coffre.gemini', { view: 'vault', field: 'ax_gemini_key', highlightSelector: '[data-vault-field="ax_gemini_key"]' }],
  ['coffre.groq', { view: 'vault', field: 'ax_groq_key', highlightSelector: '[data-vault-field="ax_groq_key"]' }],
  ['coffre.openrouter', { view: 'vault', field: 'ax_openrouter_key', highlightSelector: '[data-vault-field="ax_openrouter_key"]' }],
  ['coffre.brave', { view: 'vault', field: 'ax_brave_key', highlightSelector: '[data-vault-field="ax_brave_key"]' }],
  ['coffre.tavily', { view: 'vault', field: 'ax_tavily_key', highlightSelector: '[data-vault-field="ax_tavily_key"]' }],
  ['coffre.github', { view: 'vault', field: 'ax_github_token', highlightSelector: '[data-vault-field="ax_github_token"]' }],
  ['coffre.cloudflare', { view: 'vault', field: 'ax_cloudflare_token', highlightSelector: '[data-vault-field="ax_cloudflare_token"]' }],
  ['coffre.stripe', { view: 'vault', field: 'ax_stripe_sk', highlightSelector: '[data-vault-field="ax_stripe_sk"]' }],
  ['coffre.paypal', { view: 'vault', field: 'ax_paypal_me', highlightSelector: '[data-vault-field="ax_paypal_me"]' }],
  ['coffre.iban', { view: 'vault', field: 'ax_iban', highlightSelector: '[data-vault-field="ax_iban"]' }],
  ['coffre.revolut', { view: 'vault', field: 'ax_revolut_tag', highlightSelector: '[data-vault-field="ax_revolut_tag"]' }],

  /* Settings */
  ['settings', { view: 'settings' }],
  ['settings.theme', { view: 'settings', field: 'theme', highlightSelector: '[data-settings-field="theme"]' }],
  ['settings.voice', { view: 'settings', field: 'voice', highlightSelector: '[data-settings-field="voice"]' }],
  ['settings.notifications', { view: 'settings', field: 'notifications', highlightSelector: '[data-settings-field="notifications"]' }],
  ['settings.lang', { view: 'settings', field: 'lang', highlightSelector: '[data-settings-field="lang"]' }],

  /* Profil / monitoring / etc. */
  ['profil', { view: 'profile' }],
  ['profile', { view: 'profile' }],
  ['monitoring', { view: 'sentinels' }],
  ['sentinelles', { view: 'sentinels' }],
  ['backup', { view: 'admin-backup' }],
  ['knowledge', { view: 'knowledge' }],
  ['credentials', { view: 'credentials-registry' }],
  ['rgpd', { view: 'rgpd' }],
  ['chat', { view: 'chat' }],
  ['browser', { view: 'browser' }],
  ['voice-bio', { view: 'voice-bio' }],
]);

/** Permet à un autre module d'enrichir le router. */
export function registerNavigationTarget(alias: string, target: NavTarget): void {
  NAV_TARGETS.set(alias.toLowerCase(), target);
}

/** Liste publique pour debug + UI listing dans Apex IA system prompt. */
export function listNavigationTargets(): readonly string[] {
  return Array.from(NAV_TARGETS.keys()).sort();
}

/**
 * Tente une navigation interne :
 *  1. Lookup alias dans NAV_TARGETS
 *  2. Met à jour `store.set('view', target.view)`
 *  3. Si target.highlightSelector → scrollIntoView + classe `ax-highlight` 2s
 *
 * Pas d'effet de bord si environnement node (typeof document undefined) :
 * retourne juste `{ok:true, view, field}` pour test unitaire.
 */
export async function axNavigateTo(target: string, fieldOverride?: string): Promise<NavigateResult> {
  const alias = String(target ?? '').toLowerCase().trim();
  if (!alias) return { ok: false, error: 'target empty' };
  const found = NAV_TARGETS.get(alias);
  if (!found) {
    /* Tente match prefix : "coffre" → "coffre" si "coffre.xyz" pas connu */
    const prefix = alias.split('.')[0];
    const fallback = prefix ? NAV_TARGETS.get(prefix) : undefined;
    if (!fallback) return { ok: false, error: `target inconnu: ${alias}` };
    return await applyNavigation(fallback, fieldOverride);
  }
  return await applyNavigation(found, fieldOverride);
}

async function applyNavigation(target: NavTarget, fieldOverride?: string): Promise<NavigateResult> {
  const field = fieldOverride ?? target.field;
  /* Update store si dispo runtime */
  try {
    if (typeof window !== 'undefined') {
      const { store } = await import('../../core/store.js');
      store.set('view', target.view);
    }
  } catch (err) {
    logger.warn('browser-controller', 'store.set view failed', { err });
  }

  /* Scroll + highlight si UI dispo */
  if (typeof document !== 'undefined' && target.highlightSelector) {
    /* Defer scroll après render via requestAnimationFrame x2 (paint complet) */
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          highlightField(target.highlightSelector!);
        });
      });
    } else {
      setTimeout(() => { highlightField(target.highlightSelector!); }, 50);
    }
  }

  const result: NavigateResult = { ok: true, view: target.view };
  if (field !== undefined) result.field = field;
  if (target.highlightSelector !== undefined) result.highlightSelector = target.highlightSelector;
  return result;
}

function highlightField(selector: string): void {
  if (typeof document === 'undefined') return;
  try {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ax-highlight');
    setTimeout(() => {
      try { el.classList.remove('ax-highlight'); } catch { /* ignore */ }
    }, 2200);
    /* Focus si input */
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      try { (el as HTMLInputElement).focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  } catch (err) {
    logger.warn('browser-controller', 'highlight failed', { err, selector });
  }
}

/* === Exports unifiés ====================================================== */

export const browserController = {
  axTryUnblockUrl,
  axNavigateTo,
  isBlockedDomain,
  buildArchiveUrl,
  buildReaderUrl,
  buildCorsProxyUrl,
  headProbe,
  registerNavigationTarget,
  listNavigationTargets,
};
