/**
 * APEX v13 — Force Update Banner.
 *
 * Demande Kevin 2026-05-08 21h00 :
 * "Apex ne veut pas se mettre à jour comme tu avais prévu. J'ai fermé plusieurs
 *  fois l'app, j'ai du bureau, je l'ai réouvert, refermé, réouverte. J'ai
 *  effacé l'historique dans réglages de la iPhone, mais ça ne fonctionne
 *  toujours pas."
 *
 * iOS Safari PWA cache SW est notoirement collant. Solution : détecter au
 * boot si version distante > version locale, afficher banner ROUGE non-
 * dismissible avec **bouton 1-clic** qui :
 *
 * 1. Unregister TOUS les service workers
 * 2. Clear TOUS les caches (caches.delete pour chacun)
 * 3. Clear localStorage clés cache (pas vault, pas user)
 * 4. window.location.replace avec query param `?_force_upd_<ts>` pour
 *    bust le cache HTTP
 *
 * Auto-detect : fetch de `index.html` distant + parse `data-app-ver=` →
 * compare à `APP_VER` constant local. Si différent → banner.
 *
 * Périodicité : check au boot + toutes les 10 min en background.
 */

import { APP_VER } from '../../core/bootstrap.js';
import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';

import { styleInjector } from './style-injector.js';

const BANNER_ID = 'apex-force-update-banner';
const STYLE_INJECTOR_ID = 'apex-force-update-banner';
const REMOTE_URL = './index.html';
/* v13.4.44 Kevin "L'app devrait se mettre à jour autonome temps réel toujours" :
 * 10 min → 60 sec. Temps réel = polling fréquent sans drainer batterie excessivement.
 * 60s = bon compromis : Kevin voit MAJ <1 min après push, pas de battery drain notable. */
const CHECK_INTERVAL_MS = 60 * 1000; /* 60 sec (était 10 min) */
const RECENT_CHECK_KEY = 'apex_v13_last_version_check_ts';
/* v13.4.8 fix C5 (Ultra Review) — single source of truth pour anti-race
 * (cf. bootstrap.ts qui n'a plus que forceUpdateBanner.install()). */
const FORCE_UPDATE_IN_PROGRESS_KEY = 'apex_v13_force_update_in_progress';
const FORCE_UPDATE_PROGRESS_TTL_MS = 30_000;

interface VersionCheckResult {
  remote_ver: string | null;
  local_ver: string;
  is_stale: boolean;
}

class ForceUpdateBanner {
  private installed = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  /* v13.4.8 fix I-5 (Ultra Review² — auto-audit) : named listener pour
   * permettre proper uninstall + éviter double-register si install() rappelé. */
  private visibilityListener: (() => void) | null = null;

  /** Install au boot. Idempotent. */
  install(): void {
    if (this.installed || typeof document === 'undefined') return;
    this.installed = true;
    /* v13.4.39 Kevin "force-updates iPhone ne marchent pas" :
     * Check IMMÉDIAT 1s après boot (au lieu de 3s) → première vérif rapide. */
    setTimeout(() => void this.checkAndMaybeShow(), 1000);
    /* Check récurrent */
    this.intervalHandle = setInterval(() => void this.checkAndMaybeShow(), CHECK_INTERVAL_MS);
    /* v13.4.8 fix C5 (Ultra Review) : visibilitychange listener — single ownership.
     * v13.4.39 fix Kevin : throttle 30min → 60s (Kevin revient souvent iPhone PWA,
     * 30 min trop long → manque les MAJ). */
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      this.visibilityListener = (): void => {
        if (document.visibilityState !== 'visible') return;
        const lastCheck = parseInt(localStorage.getItem('apex_v13_last_visibility_update_check') ?? '0', 10);
        if (Date.now() - lastCheck < 60 * 1000) return; /* 1 min throttle (était 30 min) */
        try { localStorage.setItem('apex_v13_last_visibility_update_check', String(Date.now())); } catch { /* quota */ }
        void this.checkAndMaybeShow();
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
      /* v13.4.39 — Aussi focus window event (plus fiable iOS Safari PWA) */
      window.addEventListener('focus', this.visibilityListener);
    }
    logger.info('force-update', 'banner installed (sole owner force-update flow v13.4.39)');
  }

  /**
   * v13.4.8 fix C5 (Ultra Review) — guard anti-race "déjà en cours de force-update".
   * Empêche les checks concurrents (cron, visibility, banner-click) de tous nuke en parallèle.
   */
  private isUpdateInProgress(): boolean {
    try {
      const ts = parseInt(sessionStorage.getItem(FORCE_UPDATE_IN_PROGRESS_KEY) ?? '0', 10);
      if (!ts) return false;
      if (Date.now() - ts > FORCE_UPDATE_PROGRESS_TTL_MS) {
        sessionStorage.removeItem(FORCE_UPDATE_IN_PROGRESS_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  private markUpdateInProgress(): void {
    try { sessionStorage.setItem(FORCE_UPDATE_IN_PROGRESS_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  /** Stop listener (cleanup). v13.4.8 — removes visibilitychange + clears interval.
   * v13.4.39 — Aussi retire focus window listener. */
  uninstall(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    if (this.visibilityListener) {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.visibilityListener);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', this.visibilityListener);
      }
    }
    this.visibilityListener = null;
    this.removeBanner();
    this.installed = false;
  }

  /** Check version distante vs locale.
   *  v13.4.188 (Kevin "MAJ auto force ne marche pas") :
   *  cache:'reload' + sw.js skip `?_v=` URL → garantit fetch réseau sans SW. */
  async checkVersion(): Promise<VersionCheckResult> {
    try {
      const res = await fetch(`${REMOTE_URL}?_v=${Date.now()}`, {
        cache: 'reload', /* v13.4.188 : reload = bypass HTTP cache + bypass SW si SW skip */
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
      });
      if (!res.ok) {
        logger.warn('force-update', `version check fetch failed: ${res.status}`);
        return { remote_ver: null, local_ver: APP_VER, is_stale: false };
      }
      const html = await res.text();
      const match = html.match(/data-app-ver="([^"]+)"/);
      const remote_ver = match?.[1] ?? null;
      const is_stale = remote_ver !== null && remote_ver !== APP_VER;
      try {
        localStorage.setItem(RECENT_CHECK_KEY, String(Date.now()));
      } catch { /* quota */ }
      return { remote_ver, local_ver: APP_VER, is_stale };
    } catch (err: unknown) {
      logger.warn('force-update', 'version check failed', { err });
      return { remote_ver: null, local_ver: APP_VER, is_stale: false };
    }
  }

  private async checkAndMaybeShow(): Promise<void> {
    /* v13.4.8 fix C5 — abort si force-update déjà en cours (anti-race) */
    if (this.isUpdateInProgress()) {
      logger.debug('force-update', 'check skipped — update already in progress');
      return;
    }
    const r = await this.checkVersion();
    if (r.is_stale && r.remote_ver) {
      /* v13.4.188 (Kevin "MAJ auto forcé TOUJOURS tous projets") :
       * MAJ silencieuse automatique TOUJOURS dès que stale détecté.
       * Conditions de sécurité MINIMALES (drop isIdle qui bloquait app foreground) :
       *   1. Pas de fetch IA en cours (axe pas couper Apex pendant streaming)
       *   2. Pas de typing user actif (Kevin tape)
       *   3. Throttle 10s entre 2 tentatives auto-MAJ
       * Plus de isIdle/visibilityState — Kevin avec app foreground reçoit MAJ. */
      const lastAuto = parseInt(localStorage.getItem('apex_v13_auto_maj_last') ?? '0', 10);
      const throttleOK = Date.now() - lastAuto > 10 * 1000; /* 10s (était 30s) */
      const isSafe = !this.hasActiveFetch() && !this.hasUserTyping();
      if (throttleOK && isSafe) {
        logger.info('force-update', `AUTO-MAJ silencieuse (${r.local_ver} → ${r.remote_ver})`);
        localStorage.setItem('apex_v13_auto_maj_last', String(Date.now()));
        /* Toast info bref */
        try {
          const { toast } = await import('../../ui/toast.js');
          toast.info(`🔄 Mise à jour ${r.remote_ver} en cours…`);
        } catch { /* ignore */ }
        await this.forceUpdate();
      } else {
        this.showBanner(r.remote_ver);
      }
    } else {
      this.removeBanner();
    }
  }

  /** v13.4.6 — Détecte si user tape activement (textarea/input focus) */
  private hasUserTyping(): boolean {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName?.toLowerCase();
    return tag === 'textarea' || tag === 'input' || active.getAttribute('contenteditable') === 'true';
  }

  /** v13.4.6 — Détecte si une requête fetch IA est en cours (anti-coupure pendant streaming) */
  private hasActiveFetch(): boolean {
    try {
      /* Heuristique : window flag set par les services chat/anthropic */
      const w = window as unknown as { __apexActiveStream?: boolean };
      return w.__apexActiveStream === true;
    } catch {
      return false;
    }
  }

  /** v13.4.6 — Détecte si la page est idle (pas d'interaction depuis 30s).
   *  v13.4.188 : déprécié (auto-MAJ ne dépend plus de isIdle, Kevin règle absolue
   *  "MAJ auto forcé toujours" — l'app peut être foreground). Conservé pour
   *  diagnostic console + futures features sensibles. */
  // @ts-expect-error v13.4.188 helper conservé pour diagnostic
  private isUserIdle(): boolean {
    try {
      const lastInteraction = parseInt(localStorage.getItem('apex_v13_last_interaction') ?? '0', 10);
      if (!lastInteraction) return true;
      return Date.now() - lastInteraction > 30_000;
    } catch {
      return true;
    }
  }

  private showBanner(remoteVer: string): void {
    if (document.getElementById(BANNER_ID)) return;
    this.injectStyle();
    /* v13.4.8 fix C2 (Ultra Review) — pousse le badge statique vers la gauche
     * pour libérer la place quand le banner s'affiche (banner = top, pas conflit
     * réel, mais on s'assure que les 3 elements bottom-right ne se chevauchent jamais). */
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    safeSetHTML(banner, `
      <div class="apex-fu-content">
        <div class="apex-fu-icon">🔄</div>
        <div class="apex-fu-text">
          <strong>Nouvelle version Apex disponible</strong>
          <span class="apex-fu-versions">Local: ${APP_VER} → Remote: ${remoteVer}</span>
        </div>
        <button class="apex-fu-btn" id="${BANNER_ID}-btn" type="button">
          🔄 Forcer mise à jour
        </button>
      </div>
    `);
    document.body.appendChild(banner);
    const btn = document.getElementById(`${BANNER_ID}-btn`);
    btn?.addEventListener('click', () => {
      void this.forceUpdate();
    });
    logger.info('force-update', `banner shown (local=${APP_VER}, remote=${remoteVer})`);
  }

  private removeBanner(): void {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
  }

  private injectStyle(): void {
    /* v13.4.8 fix C1 (Ultra Review) — utilise styleInjector (CSP-safe, nonce auto)
     * au lieu de createElement('style') brut qui était bloqué par CSP strict
     * style-src 'self' 'nonce-XXX' (le banner apparaissait sans style en prod). */
    if (styleInjector.has(STYLE_INJECTOR_ID)) return;
    const css = `
      #${BANNER_ID} {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 8px);
        left: max(env(safe-area-inset-left, 8px), 8px);
        right: max(env(safe-area-inset-right, 8px), 8px);
        z-index: 999998;
        background: linear-gradient(135deg, #d32f2f, #b71c1c);
        color: #fff;
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        animation: apex-fu-slide 280ms cubic-bezier(0.16, 1, 0.3, 1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      @keyframes apex-fu-slide {
        from { opacity: 0; transform: translateY(-12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .apex-fu-content {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .apex-fu-icon {
        font-size: 20px;
        animation: apex-fu-spin 1.6s linear infinite;
      }
      @keyframes apex-fu-spin {
        from { transform: rotate(0); }
        to   { transform: rotate(360deg); }
      }
      .apex-fu-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .apex-fu-text strong {
        font-size: 13px;
        font-weight: 700;
      }
      .apex-fu-versions {
        font-size: 11px;
        opacity: 0.85;
        font-family: ui-monospace, 'SF Mono', monospace;
      }
      .apex-fu-btn {
        background: #fff;
        color: #b71c1c;
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        min-height: 44px;
        -webkit-tap-highlight-color: transparent;
        transition: transform 120ms;
      }
      .apex-fu-btn:active { transform: scale(0.96); }
      @media (prefers-reduced-motion: reduce) {
        #${BANNER_ID}, .apex-fu-icon { animation: none !important; }
        .apex-fu-btn:active { transform: none !important; }
      }
    `;
    styleInjector.inject(STYLE_INJECTOR_ID, css);
  }

  /**
   * NUCLEAR option — force update immédiat.
   * iOS Safari PWA-aware : unregister SW, clear caches, clear cache-related
   * localStorage, reload avec query param fresh.
   */
  async forceUpdate(): Promise<void> {
    /* v13.4.8 fix C5 (Ultra Review) — race-guard d'abord pour éviter double-nuke
     * si user clique le bouton + cron + visibilitychange tirent quasi simultanément. */
    if (this.isUpdateInProgress()) {
      logger.warn('force-update', 'force-update already in progress, skipped');
      return;
    }
    this.markUpdateInProgress();
    logger.info('force-update', 'NUCLEAR force-update triggered by Kevin');
    /* v13.4.6 — Pré-snapshot OBLIGATOIRE avant toute purge (Kevin "ne jamais
     * rien perdre"). Si PRESERVE_PREFIXES rate qqc, on peut tout restaurer
     * via autoBackup.restoreLatest() au prochain boot. */
    try {
      const { autoBackup } = await import('../storage/auto-backup.js');
      const backup = await autoBackup.snapshot('pre-rollback');
      logger.info('force-update', `pre-update snapshot OK : ${backup.id} (${backup.size_bytes}b)`);
    } catch (err: unknown) {
      logger.warn('force-update', 'pre-update snapshot failed (non bloquant)', { err });
    }
    /* Étape 1 : unregister tous les Service Workers */
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
        logger.info('force-update', `${regs.length} SW unregistered`);
      } catch (err: unknown) {
        logger.warn('force-update', 'SW unregister failed', { err });
      }
    }
    /* Étape 2 : clear tous les Cache Storage */
    if (typeof caches !== 'undefined') {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
        logger.info('force-update', `${keys.length} caches cleared`);
      } catch (err: unknown) {
        logger.warn('force-update', 'caches clear failed', { err });
      }
    }
    /* Étape 3 : clear localStorage clés CACHE uniquement (pas vault/user) */
    try {
      /* v13.3.93 P0 CRITIQUE Kevin "j'ai collé toutes les clés une après l'autre
       * et rien ne fonctionne" — TROUVÉ : le PRESERVE_PREFIXES v13.3.92 utilisait
       * `apex_v13_pin_` (avec underscore final) MAIS la vraie clé du PIN hash est
       * `apex_v13_pin` (SANS underscore). Donc startsWith ne matchait pas →
       * PIN hash effacé → getDeviceBoundPassphrase() régénérait random différent
       * → ANCIENNE clé chiffrée avec ancien PIN devenait indéchiffrable.
       * Fix : enlever les underscores de fin pour matcher BOTH 'apex_v13_pin'
       * ET 'apex_v13_pin_xxx'. */
      const PRESERVE_PREFIXES = [
        'apex_v13_vault',
        'apex_v13_user',
        'apex_v13_users',
        'apex_v13_uid',
        'apex_v13_pin',
        'apex_v13_multi_keys',          /* v13.4.6 FIX CRITIQUE — VRAIE clé du coffre (était 'multikey_vault' faux) */
        'apex_v13_multikey_vault',       /* legacy fallback (v13.3.x avant rename) */
        'apex_v13_passphrase_history',
        'apex_v13_persistent_memory',
        'apex_v13_credentials',
        'apex_v13_device_obf',
        'apex_v13_device_passphrase',
        'apex_v13_device_trusted',
        'apex_v13_backup_index',         /* v13.4.6 FIX — index des snapshots */
        'apex_v13_backup_',              /* v13.4.6 FIX — chaque snapshot ax_backup_xxx */
        'apex_v13_last_known_name',      /* v13.4.6 FIX — reconnaissance Kevin */
        'apex_v13_last_known_uid',
        'apex_v13_lastact',
        'apex_v13_lessons',
        'apex_v13_kb',
        'apex_v13_audit',
        'apex_v13_xp',
        'apex_v13_streak',
        'apex_v13_attachments',          /* v13.4.6 FIX — pièces jointes session */
        'ax_v13_attachments',
        'apex_v13_paste_recovery_',      /* v13.4.6 — anti-perte clés collées par Kevin */
        'ax_pin',
        'ax_user',
        'ax_uid',
        'ax_persistent_memory',
        'ax_anthropic',
        'ax_openai',
        'ax_groq',
        'ax_gemini',
        'ax_google',
        'ax_openrouter',
        'ax_mistral',
        'ax_cohere',
        'ax_deepseek',
        'ax_perplexity',
        'ax_xai',
        'ax_huggingface',
        'ax_hf_',
        'ax_replicate',
        'ax_stripe',
        'ax_brevo',
        'ax_resend',
        'ax_telegram',
        'ax_discord',
        'ax_github',
        'ax_gitlab',
        'ax_cloudflare',
        'ax_notion',
        'ax_airtable',
        'ax_dropbox',
        'ax_spotify',
        'ax_pinata',
        'ax_pinecone',
        'ax_qdrant',
        'ax_weaviate',
        'ax_brave',
        'ax_tavily',
        'ax_deepl',
        'ax_finnhub',
        'ax_coingecko',
        'ax_coinmarketcap',
        'ax_etherscan',
        'ax_openweathermap',
        'ax_owm',
        'ax_opencage',
        'ax_mapbox',
        'ax_unsplash',
        'ax_pixabay',
        'ax_pexels',
        'ax_elevenlabs',
        'ax_newsapi',
        'ax_credentials_deleted',
        'ax_shared_api_key',
        'ax_api_key',
      ];
      const toDelete: string[] = [];
      /* v13.4.8 fix M1 (Ultra Review) — patterns anchored explicites au lieu de
       * key.includes('cache') qui matchait n'importe quel substring (ex:
       * apex_v13_recovery_cache_chat aurait été nuke par mégarde). */
      const CACHE_KEY_PATTERNS: ReadonlyArray<RegExp> = [
        /^apex_v13_sw_cache_/,
        /^apex_v13_static_cache_/,
        /^apex_v13_runtime_cache_/,
        /^apex_v13_app_ver$/,
        /^apex_v13_cache_index$/,
        /^apex_v13_route_cache_/,
      ];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const isPreserved = PRESERVE_PREFIXES.some((p) => key.startsWith(p));
        if (isPreserved) continue;
        if (CACHE_KEY_PATTERNS.some((re) => re.test(key))) {
          toDelete.push(key);
        }
      }
      toDelete.forEach((k) => localStorage.removeItem(k));
      logger.info('force-update', `${toDelete.length} cache localStorage keys cleared (vault/user preserved)`);
    } catch (err: unknown) {
      logger.warn('force-update', 'localStorage clear failed', { err });
    }
    /* Étape 4 : reload avec query param fresh */
    const fresh = `${location.pathname}?_force_upd=${Date.now()}${location.hash}`;
    location.replace(fresh);
  }
}

export const forceUpdateBanner = new ForceUpdateBanner();
