/**
 * APEX v13 — Firebase service
 *
 * Schémas préservés à l'identique de v12.785 :
 * - /cmcteams/*  : JAMAIS touché
 * - /apex/users/<uid>/vault/*
 * - /apex/users/<uid>/persistent_memory/*
 * - /apex/telemetry_in/*
 * - /apex/lessons_learned/*
 * - /apex/claude_todo/*
 *
 * SSE EventSource pour sync temps réel + queue offline.
 *
 * Anti-patterns évités :
 * - Pas d'écrasement localStorage avec null venant de Firebase (plain wins guard)
 * - FB_LOCAL strict pour user/uid/voice_print
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { firebaseAuthBridge } from '../auth/firebase-auth-bridge.js';

const FB_DEFAULT = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';

/**
 * v13.3.x Kevin 2026-05-08 — Auto-reconnect robuste Firebase.
 *
 * États possibles de la connexion :
 * - CONNECTED    : SSE actif + dernier ping OK
 * - RECONNECTING : tentative en cours (auto-reconnect avec backoff)
 * - DISCONNECTED : déconnecté, prochaine tentative programmée
 * - OFFLINE      : navigator.onLine = false (pas de tentative tant que online event)
 *
 * SOS rescue distingue RECONNECTING (transient → pas de warning) vs DISCONNECTED.
 */
export type FirebaseConnectionState = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'OFFLINE';

/* Backoff exponential : 2s/4s/8s/16s/30s (cap) — anti spam reconnect aggressif */
const RECONNECT_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000] as const;
/* Watchdog ping period : 60s. Détecte SSE silencieusement coupé (iOS Safari background). */
const WATCHDOG_INTERVAL_MS = 60_000;
/* Stale threshold : si dernier event SSE > 30s, considéré stale (déclenche ping de vérif). */
const STALE_EVENT_THRESHOLD_MS = 30_000;
/* Toast rate-limit par état : max 1 toast / 60s / état (anti spam). */
const TOAST_RATE_LIMIT_MS = 60_000;

export const FB_FIX: readonly string[] = [
  'apex_v13_facts',
  'apex_v13_lessons',
  'ax_telemetry_in',
  'ax_claude_todo',
  /* Pipeline temps-réel Apex↔Claude Code (Kevin 2026-05-07 v13.3.26) */
  'ax_handoff_journal',
  'ax_claude_alerts',
  /* Bridge Apex → CMCteams planning autonome (Kevin 2026-05-07 v9.601) */
  'ax_cmc_planning_pending',
  /* Admin commands cross-device (Kevin 2026-05-08 v13.3.64) — reset PIN, etc.
     Apex IA push command via tool reset_user_pin → iPhone target SSE listener
     applique action + marque processed. */
  'ax_admin_commands_pending',
  'ax_lessons_learned_struct',
  'ax_persistent_memory',
  'ax_links_registry',
  'ax_audit',
  /* Sprint 8 v13.0.63 : ajout ax_persistent_memory + apex_v13_persistent_memory pour sync auto cloud */
  'apex_v13_persistent_memory',
  /* Sprint 8 : backup vault keys chiffrées (survit clear cache iPhone) */
  'apex_v13_anthropic_key',
  'apex_v13_openai_key',
  'apex_v13_groq_key',
  'apex_v13_gemini_key',
  'apex_v13_openrouter_key',
  /* === v13.0.20+ FIX KEVIN "clés API pas en mémoire" — whitelist élargie === */
  /* AI providers */
  'ax_anthropic_key',
  'ax_openai_key',
  'ax_openai_key_proj' /* v13.4.6 Kevin "confusion OpenAI legacy vs proj" — storageKey distinct */,
  'ax_groq_key',
  'ax_google_key',
  'ax_gemini_key',
  'ax_openrouter_key',
  'ax_github_token' /* legacy compat v13.0+ */,
  'ax_github_token_classic' /* v13.4.6 Kevin "GitHub confusion" — ghp_* distinct */,
  'ax_github_token_fine' /* v13.4.6 Kevin "GitHub fine reconnu mauvais" — github_pat_* distinct */,
  'ax_perplexity_key',
  'ax_mistral_key',
  'ax_cohere_key',
  'ax_deepseek_key',
  'ax_xai_key',
  'ax_togetherai_key',
  'ax_fireworks_key',
  'ax_huggingface_key',
  'ax_replicate_key',
  'ax_elevenlabs_key',
  'ax_deepl_key',
  /* Vector DB / Storage */
  'ax_pinecone_key',
  'ax_weaviate_key',
  'ax_supabase_key',
  /* Payments / Finance */
  'ax_stripe_key',
  'ax_stripe_sk',
  'ax_stripe_pk',
  'ax_paypal_token',
  'ax_revolut_key',
  'ax_wise_key',
  'ax_shopify_key',
  /* DevOps / Hosting */
  'ax_github_token',
  'ax_cloudflare_token',
  'ax_vercel_token',
  'ax_netlify_token',
  'ax_npm_token',
  'ax_sentry_key',
  /* Communications */
  'ax_twilio_key',
  'ax_sendgrid_key',
  'ax_mailchimp_key',
  'ax_brevo_key',
  'ax_resend_key',
  'ax_telegram_token',
  'ax_telegram_chat_id', /* P2 audit fix : backup Firebase pour reinstall PWA */
  'ax_whatsapp_token',
  'ax_discord_webhook_url', /* P1 audit fix : align kevin-alerts.ts naming (was ax_discord_webhook) */
  'ax_slack_token',
  /* Productivity / SaaS */
  'ax_notion_key',
  'ax_airtable_pat',
  'ax_linear_key',
  'ax_figma_token',
  'ax_asana_token',
  'ax_trello_token',
  'ax_zapier_key',
  'ax_make_key',
  'ax_posthog_key',
  /* Sprint 9 v13.1.x : multi-key vault (failover key-level Kevin règle 2026-05-07) */
  'apex_v13_multi_keys',
];

export const FB_LOCAL: readonly string[] = [
  'apex_v13_user',
  'apex_v13_uid',
  'apex_v13_lastact',
  'ax_voice_print_',
  'apex_v13_pin',
  /* v13.4.8/15 — PIN Laurence isolé localement (anti-régression Erreur #37 CLAUDE.md
   * + règle sécu biométrique). FB_LOCAL = PAS de sync Firebase. PIN reste local au device.
   * Trade-off honnête : Kevin perd Laurence PIN si cache PWA clear. C'est volontaire :
   * un PIN biométrique synchronisé = vecteur d'exfiltration (cf. ax_user JAMAIS dans FB_FIX). */
  'apex_v13_pin_laurence_sp',
  'apex_v13_session',
];

class Firebase {
  private url = FB_DEFAULT;
  private connected = false;

  /* v13.4.291 (P1 sécu ultra-review) — Attache le token d'auth Phase 5 (RTDB `?auth=`)
   * quand il est disponible. RÉTRO-COMPATIBLE : si pas de token (getToken() === ''),
   * renvoie '' → URL identique à avant → ZÉRO régression (cf. firebase-auth-bridge.ts).
   * Débloque le durcissement des règles (database.rules.json auth.uid). */
  private authSuffix(hasQuery: boolean): string {
    let token = '';
    try {
      token = firebaseAuthBridge.getToken();
    } catch {
      token = '';
    }
    if (!token) return '';
    return `${hasQuery ? '&' : '?'}auth=${encodeURIComponent(token)}`;
  }
  private sse: EventSource | null = null;
  private queue: Array<{ key: string; value: unknown; ts: number }> = [];
  /* P0 fix audit Cure53/NCC : tracker tous les listeners SSE pour removeEventListener au disconnect.
     EventSource.close() seul ne suffit pas — les listeners persistent en mémoire si on
     redémarre l'EventSource via startSSE() (memory leak documenté Mozilla). */
  private sseListeners: Array<{ type: string; listener: EventListener }> = [];

  /* v13.3.x Kevin 2026-05-08 — État connection détaillé pour SOS + auto-reconnect.
   * Distingue RECONNECTING (transient, pas de warning SOS) de DISCONNECTED (definitive). */
  private connState: FirebaseConnectionState = 'DISCONNECTED';
  /* Compteur de tentatives consecutives échouées (reset à 0 après succès). */
  private reconnectAttempts = 0;
  /* v13.4.335 — dernier code HTTP du ping (pour diagnostic : 401/403 = auth requise). */
  private lastPingStatus = 0;
  /* Timer en cours pour la prochaine tentative de reconnect (id setTimeout). */
  private reconnectTimer: number | null = null;
  /* Watchdog ping interval (id setInterval) — détecte SSE silencieusement coupé. */
  private watchdogInterval: number | null = null;
  /* Timestamp dernier event SSE reçu (put / open) — utilisé par watchdog pour détecter staleness. */
  private lastEventTs = 0;
  /* Listeners DOM dépendants — trackés pour cleanup propre au disconnect/test. */
  private domListeners: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
  /* Anti-spam toast : timestamp dernier toast par état. */
  private lastToastTs = new Map<FirebaseConnectionState, number>();
  /* Garde anti-init multiple : si init() rappelé, on resync l'état au lieu de doubler les listeners. */
  private domListenersInstalled = false;

  async init(): Promise<void> {
    try {
      const stored = localStorage.getItem('apex_v13_fb_url');
      if (stored) this.url = stored;
    } catch {
      /* ignore */
    }

    /* Install DOM listeners une seule fois (online/offline/visibilitychange). */
    this.installDomListeners();

    /* Si navigator.onLine est false → on part en OFFLINE direct, on attend l'event 'online'. */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setState('OFFLINE');
      this.connected = false;
      return;
    }

    /* Test ping. v13.4.335/336 (Kevin « répare Firebase » / « login:rate_limited ») :
     * on garantit un token frais AVANT le ping (la DB exige `auth != null`).
     * `ensureFreshToken` est THROTTLÉ côté bridge (backoff sur rate_limited) → on
     * NE force PLUS de clear()+retry sur 401 ici (c'était ça qui martelait le
     * worker /login et déclenchait le rate-limit). Le prochain reconnect retentera,
     * en respectant le backoff. */
    try {
      await firebaseAuthBridge.ensureFreshToken();
      const ping = await fetch(`${this.url}/.json?shallow=true${this.authSuffix(true)}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.connected = ping.ok;
      this.lastPingStatus = ping.status;
      logger.info('firebase', `Connected: ${this.connected}`, { url: this.url, status: ping.status });
    } catch (err: unknown) {
      logger.warn('firebase', 'Ping failed (offline mode)', { err });
      this.connected = false;
    }

    if (this.connected) {
      this.setState('CONNECTED');
      this.reconnectAttempts = 0;
      this.lastEventTs = Date.now();
      this.startSSE();
      this.startWatchdog();
    } else {
      /* Premier ping fail : on entre en RECONNECTING + on planifie la 1ère retry. */
      this.setState('RECONNECTING');
      this.scheduleReconnect();
    }
    this.flushQueue();
    /* v13.4.258 (FIX DIAG couche-par-couche "coffre vide après reboot") :
     * restore vault TOUTES couches — voir restoreVaultAllLayers(). */
    this.restoreVaultAllLayers();
  }

  /**
   * v13.4.258 — Restore vault depuis Firebase, toutes couches. Appelé à
   * l'init SI connecté ET à CHAQUE reconnexion réussie.
   *
   * BUG corrigé (diag couche-par-couche) : avant, le restore vault était
   * gardé `if (this.connected)` UNIQUEMENT dans init(). Sur iOS Safari,
   * Firebase est quasi-toujours déconnecté au boot (SSE/ping pas encore
   * up) → le restore était sauté. attemptReconnect() faisait flushQueue()
   * mais JAMAIS le restore → les clés du backup Firebase n'étaient jamais
   * récupérées si le localStorage avait été évincé. → "Coffre vide".
   *
   * Idempotent : restoreAllFromFirebaseBackup saute les clés déjà locales.
   */
  private restoreVaultAllLayers(): void {
    if (!this.connected) return;
    /* Sprint 8 : restore clés vault depuis FB_FIX si localStorage vide. */
    void this.restoreVaultKeysFromFirebase();
    /* Couche 4 : backup dédié /apex/vault_backup/<uid>/* (survit changement
     * FB_FIX). Best-effort : offline ou pas de backup → no-op. */
    void import('../vault/vault-firebase-backup.js')
      .then(({ vaultFirebaseBackup }) => vaultFirebaseBackup.restoreAllFromFirebaseBackup())
      .catch((err: unknown) => {
        logger.debug('firebase', 'vault-fb-backup auto-restore skipped', { err });
      });
    /* v13.4.268 (Kevin "Donnée perso vide") : restore aussi les clés data
     * (persistent_memory, facts, lessons, kb, audit, links_registry) que
     * restoreVaultKeysFromFirebase ne couvre pas. Best-effort, idempotent. */
    void this.restoreDataKeysFromFirebase().catch((err: unknown) => {
      logger.debug('firebase', 'data-keys restore skipped', { err });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * v13.3.x — État connection détaillé.
   * - CONNECTED    → SSE actif + watchdog OK
   * - RECONNECTING → tentative en cours, ne PAS générer de warning SOS
   * - DISCONNECTED → échecs cumulés (>5 backoffs), warning SOS justifié
   * - OFFLINE      → navigator.onLine = false, pas de tentative
   */
  getConnectionState(): FirebaseConnectionState {
    return this.connState;
  }

  /**
   * v13.4.335 (Kevin « répare Firebase ») — détail diagnostic lisible :
   * dernier code HTTP du ping (401/403 = la DB exige une auth) + statut du pont
   * d'auth Phase 5 (pourquoi le token manque). Pur, sync, pour le diagnostic Coffre.
   */
  getDiagnostic(): { state: FirebaseConnectionState; lastPingStatus: number; authReason: string } {
    let authReason = '';
    try {
      const st = firebaseAuthBridge.lastStatus();
      if (st && st['ok'] === false) authReason = String(st['reason'] ?? 'inconnu');
      else if (firebaseAuthBridge.getToken()) authReason = 'token OK';
      else authReason = 'pas de token';
    } catch { authReason = 'inconnu'; }
    return { state: this.connState, lastPingStatus: this.lastPingStatus, authReason };
  }

  /**
   * SOS auto-fix + appel direct user : déclenche un reconnect immédiat (clear backoff).
   * - Si déjà CONNECTED → no-op (return true)
   * - Si OFFLINE → ne fait rien (attend event online)
   * - Sinon → annule timer + tente reconnect now
   * Renvoie true si la tentative a abouti (CONNECTED), false sinon.
   */
  async triggerReconnect(): Promise<boolean> {
    if (this.connState === 'CONNECTED') return true;
    if (this.connState === 'OFFLINE') {
      logger.debug('firebase', 'triggerReconnect skipped: navigator offline');
      return false;
    }
    /* Annule backoff en cours, on tente immédiatement. */
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setState('RECONNECTING');
    this.showToast('RECONNECTING', '🔄 Reconnexion Firebase...');
    return this.attemptReconnect();
  }

  /**
   * Tente effectivement le ping + restart SSE. Met à jour state + schedule next backoff si fail.
   * Public/internal — exposé pour faciliter tests + SOS.
   */
  private async attemptReconnect(): Promise<boolean> {
    try {
      /* v13.4.336 : token frais (THROTTLÉ côté bridge) avant le ping. Pas de
       * clear()+retry forcé sur 401 → ne martèle plus le worker /login. */
      await firebaseAuthBridge.ensureFreshToken();
      const ping = await fetch(`${this.url}/.json?shallow=true${this.authSuffix(true)}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.lastPingStatus = ping.status;
      if (ping.ok) {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.lastEventTs = Date.now();
        this.setState('CONNECTED');
        this.showToast('CONNECTED', '✅ Firebase reconnecté');
        this.startSSE();
        this.startWatchdog();
        this.flushQueue();
        /* v13.4.258 (FIX diag) : re-tente le restore vault à chaque
         * reconnexion — pas seulement à l'init. Sans ça, un boot offline
         * (iOS Safari typique) laissait le coffre vide à vie. */
        this.restoreVaultAllLayers();
        return true;
      }
      throw new Error(`HTTP ${ping.status}`);
    } catch (err: unknown) {
      logger.debug('firebase', 'Reconnect attempt failed', { err, attempts: this.reconnectAttempts });
      this.connected = false;
      this.reconnectAttempts++;
      /* Après MAX backoff steps consécutifs → DISCONNECTED (déclenche warning SOS).
       * Sinon RECONNECTING (transient, masque warning SOS). */
      if (this.reconnectAttempts >= RECONNECT_BACKOFF_MS.length) {
        this.setState('DISCONNECTED');
      } else {
        this.setState('RECONNECTING');
      }
      this.scheduleReconnect();
      return false;
    }
  }

  /**
   * Programme la prochaine tentative de reconnect avec backoff exponential.
   * Idempotent : annule le timer précédent si présent.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    /* Si OFFLINE — pas de timer, on attendra l'event 'online'. */
    if (this.connState === 'OFFLINE') return;
    const idx = Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1);
    const delay = RECONNECT_BACKOFF_MS[idx] ?? 30000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptReconnect();
    }, delay) as unknown as number;
  }

  private setState(next: FirebaseConnectionState): void {
    if (this.connState === next) return;
    const prev = this.connState;
    this.connState = next;
    logger.debug('firebase', `state: ${prev} → ${next}`);
    /* Émet events pour que UI / sentinelles puissent réagir. */
    try {
      if (next === 'CONNECTED') events.emit('network:online', {});
      else if (next === 'DISCONNECTED' || next === 'OFFLINE') events.emit('network:offline', {});
    } catch { /* ignore listener errors */ }
  }

  /**
   * Toast user-friendly avec rate-limit anti-spam (1 par 60s par état).
   * Best-effort : si toast indispo (test env), no-op.
   */
  private showToast(state: FirebaseConnectionState, message: string): void {
    const last = this.lastToastTs.get(state) ?? 0;
    if (Date.now() - last < TOAST_RATE_LIMIT_MS) return;
    this.lastToastTs.set(state, Date.now());
    /* Lazy import — pas chargé en SSR / tests. */
    void import('../../ui/toast.js')
      .then(({ toast }) => {
        if (state === 'CONNECTED') toast.success(message, { duration: 3000 });
        else if (state === 'RECONNECTING') toast.info(message, { duration: 2500 });
        else if (state === 'DISCONNECTED') toast.warn(message, { duration: 4000 });
        else toast.info(message, { duration: 2500 });
      })
      .catch(() => { /* test env or SSR — no toast */ });
  }

  /**
   * Install les listeners DOM (online / offline / visibilitychange) une seule fois.
   * - online       → reconnect immédiat (annule backoff)
   * - offline      → set OFFLINE, annule timer
   * - visibility   → si visible + state ≠ CONNECTED → check + reconnect (iOS Safari background)
   */
  private installDomListeners(): void {
    if (this.domListenersInstalled) return;
    if (typeof window === 'undefined') return;
    this.domListenersInstalled = true;

    const onOnline: EventListener = () => {
      logger.debug('firebase', 'event: online → trigger reconnect');
      /* Si on était OFFLINE, on bascule en RECONNECTING + tentative immédiate (reset backoff). */
      if (this.connState === 'OFFLINE') {
        this.reconnectAttempts = 0;
        this.setState('RECONNECTING');
        void this.attemptReconnect();
      } else if (this.connState !== 'CONNECTED') {
        /* Force tentative immédiate (clear backoff). */
        this.reconnectAttempts = 0;
        if (this.reconnectTimer !== null) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        void this.attemptReconnect();
      }
    };
    const onOffline: EventListener = () => {
      logger.debug('firebase', 'event: offline → pause reconnect');
      this.connected = false;
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      /* Ferme SSE — il sera redémarré au prochain online. */
      this.cleanupSSE();
      this.stopWatchdog();
      this.setState('OFFLINE');
    };
    const onVisibility: EventListener = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      logger.debug('firebase', 'event: visible → check connection');
      /* Si déjà CONNECTED, vérifie staleness via watchdog (SSE iOS Safari souvent coupé en background). */
      if (this.connState === 'CONNECTED') {
        const stale = Date.now() - this.lastEventTs > STALE_EVENT_THRESHOLD_MS;
        if (stale) {
          logger.debug('firebase', 'visibility check: stale SSE detected, reconnecting');
          this.reconnectAttempts = 0;
          this.cleanupSSE();
          void this.attemptReconnect();
        }
      } else if (this.connState !== 'OFFLINE') {
        /* On était DISCONNECTED/RECONNECTING — reset backoff + tentative immédiate. */
        this.reconnectAttempts = 0;
        if (this.reconnectTimer !== null) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        void this.attemptReconnect();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
      this.domListeners.push({ target: document, type: 'visibilitychange', listener: onVisibility });
    }
    this.domListeners.push({ target: window, type: 'online', listener: onOnline });
    this.domListeners.push({ target: window, type: 'offline', listener: onOffline });
  }

  /**
   * Watchdog ping (60s) : détecte SSE silencieusement coupé (cas iOS Safari background).
   * Si lastEventTs > STALE_THRESHOLD ET connected=true → trigger reconnect.
   */
  private startWatchdog(): void {
    if (this.watchdogInterval !== null) return;
    if (typeof window === 'undefined') return;
    this.watchdogInterval = setInterval(() => {
      if (this.connState !== 'CONNECTED') return;
      const stale = Date.now() - this.lastEventTs > STALE_EVENT_THRESHOLD_MS;
      if (!stale) return;
      /* Stale event → ping de vérification. Si fail, reconnect. */
      void fetch(`${this.url}/.json?shallow=true${this.authSuffix(true)}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => {
          if (r.ok) {
            this.lastEventTs = Date.now();
          } else {
            throw new Error(`HTTP ${r.status}`);
          }
        })
        .catch(() => {
          logger.debug('firebase', 'watchdog: ping failed, triggering reconnect');
          this.connected = false;
          this.reconnectAttempts = 0;
          this.cleanupSSE();
          this.setState('RECONNECTING');
          this.showToast('RECONNECTING', '🔄 Reconnexion Firebase...');
          void this.attemptReconnect();
        });
    }, WATCHDOG_INTERVAL_MS) as unknown as number;
  }

  private stopWatchdog(): void {
    if (this.watchdogInterval !== null) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  /**
   * Sprint 8 : Restore clés API chiffrées depuis Firebase vers localStorage si manquantes.
   * Survit "Effacer historique Safari" complet iPhone.
   *
   * v13.3.20 FIX KEVIN "Apex oublie ses codes sans cesse" (2026-05-07) :
   * - Délègue à vault.restoreFromFirebase qui VALIDE la décryption avant overwrite.
   * - Hydrate aussi IDB shadow (triple persistence règle Kevin v9.519).
   * - Skip valeurs corrompues (decrypt fail) au lieu de les écrire en localStorage.
   */
  private async restoreVaultKeysFromFirebase(): Promise<void> {
    const VAULT_KEYS = FB_FIX.filter((k) => k.endsWith('_key') || k.endsWith('_token'));
    let restored = 0;
    let skipped = 0;
    let vaultMod: typeof import('../vault/vault.js') | null = null;
    try {
      vaultMod = await import('../vault/vault.js');
    } catch { /* offline OK, fallback raw write below */ }
    for (const key of VAULT_KEYS) {
      try {
        if (localStorage.getItem(key)) continue; /* Déjà présent local */
        const url = `${this.url}/apex/${key}.json${this.authSuffix(false)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) continue;
        const value = await r.json() as unknown;
        if (typeof value !== 'string' || value.length === 0) continue;
        /* Délégation vault si dispo (validate decrypt + hydrate IDB) */
        if (vaultMod) {
          const ok = await vaultMod.vault.restoreFromFirebase(key, value);
          if (ok) restored++;
          else skipped++;
        } else {
          localStorage.setItem(key, value);
          restored++;
        }
      } catch { /* skip */ }
    }
    if (restored > 0) {
      logger.info('firebase', `🔄 ${restored} clés API restorées depuis Firebase backup (skipped: ${skipped})`);
    }
  }

  /**
   * v13.4.268 (Kevin "Donnée perso vide") :
   * Restore les clés DATA (persistent_memory, facts, lessons, kb, audit…)
   * depuis Firebase quand local + IDB sont vides. Complète restoreVaultKeysFromFirebase
   * qui ne couvre QUE les *_key/*_token. Sans cette méthode, le Dashboard Personnel
   * (apex_v13_persistent_memory + apex_v13_facts + apex_v13_lessons) reste vide tant
   * que le SSE ne pousse rien — et le SSE ne s'abonne pas à la valeur "current",
   * uniquement aux changements à venir.
   *
   * Stratégie : pour chaque clé FB_FIX qui n'est PAS un vault key (suffix _key/_token),
   * si absent en localStorage ET Firebase a une valeur → écrire local.
   * Idempotent : skip si déjà présent local.
   */
  async restoreDataKeysFromFirebase(): Promise<{ restored: number; skipped: number; details: string[] }> {
    const DATA_KEYS = FB_FIX.filter((k) => !(k.endsWith('_key') || k.endsWith('_token')));
    const result = { restored: 0, skipped: 0, details: [] as string[] };
    if (!this.connected) {
      logger.debug('firebase', 'restoreDataKeysFromFirebase skipped (offline)');
      return result;
    }
    for (const key of DATA_KEYS) {
      try {
        /* Déjà présent local → skip (anti-écrasement) */
        const existing = localStorage.getItem(key);
        if (existing && existing.length > 2) {
          result.skipped += 1;
          continue;
        }
        const url = `${this.url}/apex/${key}.json${this.authSuffix(false)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) {
          result.skipped += 1;
          continue;
        }
        const value = await r.json() as unknown;
        if (value === null || value === undefined) {
          result.skipped += 1;
          continue;
        }
        try {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
          result.restored += 1;
          result.details.push(key);
        } catch (err: unknown) {
          logger.warn('firebase', `restoreDataKeysFromFirebase persist failed for ${key}`, { err });
        }
      } catch {
        /* skip */
      }
    }
    if (result.restored > 0) {
      logger.info(
        'firebase',
        `📦 ${result.restored} données restaurées depuis Firebase : ${result.details.join(', ')}`,
      );
    }
    return result;
  }

  shouldSync(key: string): boolean {
    /* v13.4.243 (FIX Firebase backup KO) : les paths `vault_backup/<uid>/<key>`
     * (vault-firebase-backup.ts) NE sont PAS dans FB_FIX — c'est volontaire,
     * ce path dédié survit même si la whitelist FB_FIX change (cf. l. 228).
     * Sans cette exception, firebase.write() les rejetait silencieusement →
     * le backup vault n'écrivait JAMAIS rien → listAll() toujours vide → KO. */
    if (key.startsWith('vault_backup/')) return true;
    /* v13.4.319 — commandes perso Kevin par-uid (custom-commands.ts) :
     * sous-arbre dédié `custom_commands/<uid>`, hors FB_FIX (per-user, pas global). */
    if (key.startsWith('custom_commands/')) return true;
    return FB_FIX.includes(key);
  }

  isLocalOnly(key: string): boolean {
    return FB_LOCAL.some((prefix) => key === prefix || key.startsWith(prefix));
  }

  async write(key: string, value: unknown, opts?: { idempotencyKey?: string }): Promise<void> {
    if (this.isLocalOnly(key)) return;
    if (!this.shouldSync(key)) return;
    /* P1.3 v13.3.81 (audit cascade — RGPD Art. 18) :
     * Si user actif a une restriction 'firebase_write' → no-op + log warn.
     * Lazy import rgpd pour éviter circular deps au boot. */
    try {
      const uid = localStorage.getItem('apex_v13_uid');
      if (uid) {
        const { rgpd } = await import('../auth/rgpd.js');
        if (rgpd.isRestricted(uid, 'firebase_write') || rgpd.isRestricted(uid, '*')) {
          logger.warn('firebase', `write blocked (RGPD Art. 18 restriction) for ${key}`);
          return;
        }
      }
    } catch {
      /* rgpd indispo → continue (fail-open) */
    }
    if (!this.connected) {
      this.queue.push({ key, value, ts: Date.now() });
      return;
    }
    /* Jet 5 fix : idempotency hash IMMUTABLE sha256(key+value) — survie post-crash.
     * Si caller fournit idempotencyKey explicite → respect, sinon hash déterministe. */
    const idempotencyKey = opts?.idempotencyKey ?? (await this.hashIdempotency(key, value));
    if (this.recentlyWritten(idempotencyKey)) {
      logger.debug('firebase', `Idempotent skip ${key}`);
      return;
    }
    try {
      /* v13.4.278 (FIX Kevin "il perd mes infos / backup ne marche pas") :
       * encoder PAR SEGMENT pour préserver les `/` comme séparateurs de sous-arbre
       * Firebase. Avant `encodeURIComponent(key)` transformait `vault_backup/uid/key`
       * en clé PLATE `vault_backup%2Fuid%2Fkey` → listAll lisant `vault_backup/uid`
       * ne trouvait jamais ses enfants → 0 clé restaurée. Sûr pour les clés FB_FIX
       * (sans `/` → comportement identique). */
      const res = await fetch(`${this.url}/apex/${key.split('/').map(encodeURIComponent).join('/')}.json${this.authSuffix(false)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.recordWrite(idempotencyKey);
    } catch (err: unknown) {
      logger.warn('firebase', `Write failed for ${key} (queued)`, { err });
      this.queue.push({ key, value, ts: Date.now() });
    }
  }

  /* P0 fix Jet 5 audit subagent : recentWrites PERSISTÉ localStorage
   * (vs Map en mémoire seule = perte post-crash → double-write).
   * Hash déterministe sha256(key + JSON.stringify(value)) immutable entre reloads. */
  private recentWrites = new Map<string, number>();
  private recentWritesLoaded = false;

  private loadRecentWrites(): void {
    if (this.recentWritesLoaded) return;
    this.recentWritesLoaded = true;
    try {
      const raw = localStorage.getItem('apex_v13_idempotency');
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, number>;
        const cutoff = Date.now() - 60_000;
        for (const [k, ts] of Object.entries(obj)) {
          if (ts >= cutoff) this.recentWrites.set(k, ts);
        }
      }
    } catch {
      /* ignore corruption */
    }
  }

  private persistRecentWrites(): void {
    try {
      const obj: Record<string, number> = {};
      for (const [k, ts] of this.recentWrites) obj[k] = ts;
      localStorage.setItem('apex_v13_idempotency', JSON.stringify(obj));
    } catch {
      /* ignore quota */
    }
  }

  /**
   * Hash idempotency déterministe (Jet 6 fix audit P0-2 : try/catch crypto.subtle).
   * Si crypto.subtle indisponible (iframe sandbox, SW reload, vieux browser) → fallback DJB2 32-bit.
   * DJB2 ≠ cryptographique mais déterministe sur (key, value) = OK pour idempotency 60s window.
   */
  private async hashIdempotency(key: string, value: unknown): Promise<string> {
    const data = key + ':' + JSON.stringify(value);
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
      }
    } catch (err: unknown) {
      logger.warn('firebase', 'crypto.subtle failed, fallback DJB2', { err });
    }
    /* Fallback DJB2 hash (deterministic, 32-bit) */
    let hash = 5381;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) + hash + data.charCodeAt(i)) | 0;
    }
    return 'djb2_' + (hash >>> 0).toString(16).padStart(8, '0') + '_' + data.length.toString(16);
  }

  private recentlyWritten(key: string): boolean {
    this.loadRecentWrites();
    const ts = this.recentWrites.get(key);
    if (!ts) return false;
    if (Date.now() - ts > 60_000) {
      this.recentWrites.delete(key);
      this.persistRecentWrites();
      return false;
    }
    return true;
  }

  private recordWrite(key: string): void {
    this.recentWrites.set(key, Date.now());
    /* GC entries > 60s */
    if (this.recentWrites.size > 200) {
      const cutoff = Date.now() - 60_000;
      for (const [k, ts] of this.recentWrites) {
        if (ts < cutoff) this.recentWrites.delete(k);
      }
    }
    this.persistRecentWrites();
  }

  async read<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      /* v13.4.278 : encodage par segment (cf. write) — préserve les `/` pour lire
       * un vrai sous-arbre (ex listAll `vault_backup/<uid>` → ses enfants). */
      const res = await fetch(`${this.url}/apex/${key.split('/').map(encodeURIComponent).join('/')}.json${this.authSuffix(false)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (err: unknown) {
      logger.warn('firebase', `Read failed for ${key}`, { err });
      return null;
    }
  }

  private startSSE(): void {
    /* Cleanup tout SSE précédent (close + remove listeners) avant d'en recréer un nouveau */
    this.cleanupSSE();
    try {
      this.sse = new EventSource(`${this.url}/apex.json${this.authSuffix(false)}`);
      const putListener: EventListener = (event) => {
        /* Mark sign of life pour watchdog. */
        this.lastEventTs = Date.now();
        try {
          const data = JSON.parse((event as MessageEvent).data) as { path: string; data: unknown };
          this.applyRemoteChange(data.path, data.data);
        } catch (err: unknown) {
          logger.warn('firebase', 'SSE parse error', { err });
        }
      };
      this.sse.addEventListener('put', putListener);
      /* Track le listener pour pouvoir l'enlever proprement au disconnect/restart. */
      this.sseListeners.push({ type: 'put', listener: putListener });

      /* v13.3.x : SSE error → state RECONNECTING + scheduleReconnect (backoff exponential).
       * Plus de setTimeout(5000) hardcoded — backoff geré par scheduleReconnect. */
      this.sse.onerror = () => {
        this.connected = false;
        /* Si on est OFFLINE (navigator), ne rien faire — listener online prend le relais. */
        if (this.connState === 'OFFLINE') return;
        this.cleanupSSE();
        this.stopWatchdog();
        this.setState('RECONNECTING');
        this.scheduleReconnect();
      };
      this.sse.onopen = () => {
        this.connected = true;
        this.lastEventTs = Date.now();
        this.reconnectAttempts = 0;
        this.setState('CONNECTED');
        this.flushQueue();
      };
    } catch (err: unknown) {
      logger.error('firebase', 'SSE start failed', { err });
    }
  }

  /**
   * Cleanup interne SSE : remove explicite des listeners trackés + close + reset handlers + reset state.
   * Utilisé par startSSE() (avant nouveau EventSource) et disconnect() (cleanup public).
   */
  private cleanupSSE(): void {
    if (this.sse) {
      for (const { type, listener } of this.sseListeners) {
        try { this.sse.removeEventListener(type, listener); } catch { /* ignore */ }
      }
      try { this.sse.onerror = null; } catch { /* ignore */ }
      try { this.sse.onopen = null; } catch { /* ignore */ }
      try { this.sse.close(); } catch { /* ignore */ }
      this.sse = null;
    }
    this.sseListeners = [];
  }

  /**
   * Disconnect public — appelable au logout / shutdown / page unload / tests.
   * Idempotent. Garantit qu'aucun listener SSE/DOM/timer n'est laissé orphelin.
   *
   * v13.3.x : enrichi pour cleanup auto-reconnect resources :
   *   - reconnectTimer (setTimeout backoff)
   *   - watchdogInterval (setInterval ping)
   *   - domListeners (online/offline/visibilitychange)
   */
  disconnect(): void {
    this.cleanupSSE();
    this.stopWatchdog();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    /* Remove DOM listeners trackés (autorise tests + hot reload propre). */
    for (const { target, type, listener } of this.domListeners) {
      try { target.removeEventListener(type, listener); } catch { /* ignore */ }
    }
    this.domListeners = [];
    this.domListenersInstalled = false;
    this.connected = false;
    this.connState = 'DISCONNECTED';
    this.reconnectAttempts = 0;
    this.lastEventTs = 0;
    this.lastToastTs.clear();
  }

  /**
   * Audit helper : compte les listeners SSE actuellement attachés.
   * Exposé pour tests + debug.
   */
  getActiveSSEListenerCount(): number {
    return this.sseListeners.length;
  }

  /**
   * Anti-pattern v12 corrigé : si Firebase retourne null mais valeur locale existe,
   * NE PAS écraser. Source de vérité = local non-null > Firebase null.
   *
   * v13.3.20 FIX KEVIN "Apex oublie ses codes" (2026-05-07) :
   * - Si valeur Firebase = AXENC1: chiffré ET vault key (ax_*_key/_token), valider
   *   décryption AVANT d'écraser local. Si decrypt fail → garder local (plain wins).
   * - "plain wins over encrypted-corrupt" guard renforcé (Kevin règle triple persistence).
   */
  private applyRemoteChange(path: string, data: unknown): void {
    const key = path.replace(/^\//, '').split('/')[0];
    if (!key) return;
    if (this.isLocalOnly(key)) return;
    /* v13.4.243 : `vault_backup` est un sous-arbre dédié backup chiffré
     * (vault-firebase-backup.ts). Ne PAS le rapatrier comme une clé localStorage
     * top-level — il est lu à la demande via vaultFirebaseBackup.listAll/fetch. */
    if (key === 'vault_backup') return;
    /* v13.4.319 — `custom_commands/<uid>` lu à la demande (custom-commands.ts),
     * pas rapatrié comme clé localStorage top-level. */
    if (key === 'custom_commands') return;
    if (data === null) {
      const existing = localStorage.getItem(key);
      if (existing) {
        logger.debug('firebase', `Skip null overwrite for ${key} (plain wins)`);
        return;
      }
    }
    /* v13.4.x ANTI-PERTE COFFRE (#41) — le coffre central `apex_v13_multi_keys`
     * est un array de credentials. Un push Firebase périmé/vide (autre device,
     * vieux snapshot, objet {} ) NE DOIT PAS écraser un coffre local plus rempli
     * (Kevin "coffre vide, clés disparues, même réseau OK"). On refuse tout remote
     * qui RÉDUIT le nombre d'entrées ; les ajouts légitimes (≥ local) passent. */
    if (key === 'apex_v13_multi_keys') {
      try {
        const localRaw = localStorage.getItem(key);
        if (localRaw) {
          const localArr: unknown = JSON.parse(localRaw);
          const remoteArr: unknown = typeof data === 'string' ? JSON.parse(data) : data;
          const localN = Array.isArray(localArr) ? localArr.length : 0;
          const remoteN = Array.isArray(remoteArr) ? remoteArr.length : 0;
          if (localN > 0 && remoteN < localN) {
            logger.warn(
              'firebase',
              `Skip multi_keys overwrite : remote=${remoteN} < local=${localN} (anti-perte coffre)`,
            );
            return;
          }
        }
      } catch { /* parse fail → laisse passer le flux normal */ }
    }
    /* v13.3.20 : si vault key reçue chiffrée, valider decrypt avant overwrite local.
     * Évite que SSE écrase une clé locale valide par une corruption Firebase. */
    const isVaultKey = key.endsWith('_key') || key.endsWith('_token');
    if (isVaultKey && typeof data === 'string' && data.startsWith('AXENC1:')) {
      const existing = localStorage.getItem(key);
      if (existing && existing !== data) {
        /* On a déjà une valeur locale différente — on délègue à vault.restoreFromFirebase
         * qui valide le décrypt avant écrasement (anti-corruption Firebase). */
        void import('../vault/vault.js').then(({ vault }) => {
          void vault.restoreFromFirebase(key, data).catch(() => {
            logger.debug('firebase', `Vault key ${key} restore from FB skipped (decrypt fail or invalid)`);
          });
        }).catch(() => { /* offline OK */ });
        return;
      }
    }
    try {
      localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
    } catch (err: unknown) {
      logger.warn('firebase', `applyRemoteChange persist failed for ${key}`, { err });
    }
    /* Pipeline temps-réel Kevin 2026-05-07 : émet event pour que les services
     * (claude-bridge, cmc-planning-bridge) puissent réagir aux changements distants. */
    try {
      events.emit('firebase:remote_change', { key, data });
    } catch { /* ignore listener errors */ }
  }

  private flushQueue(): void {
    if (!this.connected || !this.queue.length) return;
    const batch = this.queue.slice();
    this.queue = [];
    for (const item of batch) {
      void this.write(item.key, item.value);
    }
  }
}

export const firebase = new Firebase();
