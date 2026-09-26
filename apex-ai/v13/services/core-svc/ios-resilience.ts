/**
 * APEX v13.4.259 — iOS PWA Resilience
 * (Kevin 2026-05-22 : "contourne les problèmes iOS, iPhone, arrière-plan,
 * on bloque souvent — va plus loin, crée quelque chose si besoin").
 *
 * iOS Safari en mode PWA pose 3 problèmes récurrents qui font perdre des
 * données (Coffre vide, sync interrompue, sentinelles gelées) :
 *
 *  1. STORAGE EVICTION — sous pression disque, iOS évince localStorage +
 *     IndexedDB d'un seul coup. Parade : `navigator.storage.persist()`
 *     demande au navigateur de marquer le stockage "persistant" → non
 *     évincable. C'est LA parade au "Coffre vide" + "105 % storage".
 *
 *  2. RÉSEAU COUPÉ EN ARRIÈRE-PLAN — SSE Firebase + fetch meurent dès que
 *     l'app passe en background. Parade : flush best-effort du Coffre au
 *     passage en background + re-sync immédiat au retour au premier plan.
 *
 *  3. EXÉCUTION SUSPENDUE — timers + sentinelles gelés en background.
 *     Parade : re-sync déclenché au retour (visibilitychange/pageshow).
 *
 * Service 100 % défensif et idempotent : il ne fait que DÉCLENCHER des
 * resync best-effort. Si une API manque (vieux navigateur) → no-op
 * silencieux, jamais d'exception propagée.
 */
import { logger } from '../../core/logger.js';

export interface IosResilienceStatus {
  /** Stockage marqué persistant (non-évincable) ? null = inconnu/non demandé. */
  storagePersisted: boolean | null;
  /** % d'utilisation du quota navigateur (estimate). null = indisponible. */
  usagePct: number | null;
  /** Quota total estimé (Mo). */
  quotaMb: number | null;
  /** Timestamp du dernier resync foreground. */
  lastForegroundSync: number;
  /** Timestamp du dernier flush background. */
  lastBackgroundFlush: number;
}

const PERSISTED_LS_KEY = 'apex_v13_storage_persisted';
/** Anti-spam : pas plus d'un resync foreground / 10 s. */
const FOREGROUND_THROTTLE_MS = 10_000;

class IosResilience {
  private status: IosResilienceStatus = {
    storagePersisted: null,
    usagePct: null,
    quotaMb: null,
    lastForegroundSync: 0,
    lastBackgroundFlush: 0,
  };

  private wired = false;

  /** Init au boot — wiré dans core/bootstrap.ts. */
  async init(): Promise<void> {
    if (this.wired) return;
    this.wired = true;
    await this.requestPersistentStorage();
    await this.refreshEstimate();
    this.installLifecycleListeners();
    logger.info('ios-resilience', 'initialisé', {
      persisted: this.status.storagePersisted,
      usagePct: this.status.usagePct,
    });
  }

  /**
   * Demande au navigateur de marquer le stockage "persistant" → iOS ne
   * l'évince plus sous pression disque. Sur PWA iOS installée à l'écran
   * d'accueil, c'est accordé silencieusement (pas de prompt).
   */
  private async requestPersistentStorage(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
      /* persisted() d'abord : si déjà accordé → évite un éventuel prompt. */
      const already =
        typeof navigator.storage.persisted === 'function'
          ? await navigator.storage.persisted()
          : false;
      this.status.storagePersisted = already ? true : await navigator.storage.persist();
      try {
        localStorage.setItem(PERSISTED_LS_KEY, String(this.status.storagePersisted));
      } catch {
        /* quota — non bloquant */
      }
      logger.info('ios-resilience', `storage.persist() → ${this.status.storagePersisted}`);
    } catch (err: unknown) {
      logger.debug('ios-resilience', 'storage.persist indisponible', { err });
    }
  }

  /** Rafraîchit l'estimation d'usage du quota navigateur. */
  private async refreshEstimate(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
      const est = await navigator.storage.estimate();
      const usage = est.usage ?? 0;
      const quota = est.quota ?? 0;
      this.status.usagePct = quota > 0 ? Math.round((usage / quota) * 100) : null;
      this.status.quotaMb = quota > 0 ? Math.round(quota / (1024 * 1024)) : null;
    } catch {
      /* ignore */
    }
  }

  private installLifecycleListeners(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.onBackground();
      else void this.onForeground();
    });
    /* pagehide : iOS Safari le déclenche au passage background / fermeture. */
    window.addEventListener('pagehide', () => void this.onBackground());
    /* pageshow : retour au premier plan (y compris depuis le bfcache iOS). */
    window.addEventListener('pageshow', () => void this.onForeground());
  }

  /**
   * App → arrière-plan : dernier push best-effort du Coffre avant que iOS
   * ne suspende l'exécution. syncDrift met en file d'attente si offline
   * (cf. vault-firebase-backup v13.4.257) → flush auto à la reconnexion.
   */
  private async onBackground(): Promise<void> {
    this.status.lastBackgroundFlush = Date.now();
    try {
      const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
      await vaultFirebaseBackup.syncDrift();
    } catch (err: unknown) {
      logger.debug('ios-resilience', 'background flush skip', { err });
    }
  }

  /**
   * App → premier plan : reconnexion Firebase + re-sync Coffre immédiats
   * (l'exécution était gelée en background, le SSE probablement coupé).
   */
  private async onForeground(): Promise<void> {
    if (Date.now() - this.status.lastForegroundSync < FOREGROUND_THROTTLE_MS) return;
    this.status.lastForegroundSync = Date.now();
    try {
      const { firebase } = await import('../storage/firebase.js');
      if (!firebase.isConnected()) await firebase.triggerReconnect();
      const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
      await vaultFirebaseBackup.syncDrift();
      await this.refreshEstimate();
    } catch (err: unknown) {
      logger.debug('ios-resilience', 'foreground resync skip', { err });
    }
  }

  /** État courant — exposé pour le diagnostic / vue admin. */
  getStatus(): IosResilienceStatus {
    return { ...this.status };
  }
}

export const iosResilience = new IosResilience();
