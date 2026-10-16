/**
 * firebase-auth-bridge.ts — Pont Phase 5 (côté client Apex).
 *
 * À la connexion (event `auth:login`), obtient un id_token Firebase auprès de
 * apex-auth-worker (qui valide le hash de PIN et signe le token côté serveur),
 * puis l'expose via getToken() pour que firebase.ts l'attache en RTDB `?auth=`.
 *
 * 🛟 FAIL-OPEN ABSOLU : toute erreur (worker absent, hash inconnu, réseau, parse)
 * → pas de token → getToken() renvoie '' → firebase.ts n'attache rien → comportement
 * STRICTEMENT identique à aujourd'hui. Aucune régression possible tant que les
 * règles RTDB restent ouvertes (la bascule stricte = étape séparée, gated).
 *
 * Le hash de PIN n'est PAS recalculé ici : on réutilise celui déjà stocké en
 * localStorage par auth.ts (`apex_v13_pin` admin / `apex_v13_pin_<uid>`), qui est
 * exactement la valeur que le worker compare à /apex/ax_pin_<uid>. Au 1er login
 * (record Firebase absent) → bootstrap par PUT direct (règles ouvertes phase 4) →
 * le worker pourra valider ensuite (lecture admin, même sous règles strictes).
 */
import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';

const DEFAULT_WORKER_URL = 'https://apex-auth-worker.9r4rxssx64.workers.dev';
const FB_DEFAULT = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
/* Clé Web API PUBLIQUE du projet cmcteams-c16ab (même clé que CMCteams v9.792 —
 * une clé Web Firebase est publique par design, elle n'autorise que les flux
 * Identity Toolkit ; la sécurité vient des règles RTDB). Sert au repli anonyme. */
const FB_WEB_API_KEY = 'AIzaSyDciW-0sIIg9msdmgZjQHBksqzsfA6DCMs';

const TOKEN_KEY = 'apex_v13_fb_idtoken';
const EXP_KEY = 'apex_v13_fb_idtoken_exp';
const REFRESH_KEY = 'apex_v13_fb_refresh';
const STATUS_KEY = 'apex_v13_fb_auth_status';
const ANON_TOKEN_KEY = 'apex_v13_fb_anon_token';
const ANON_EXP_KEY = 'apex_v13_fb_anon_exp';

type LoginResult = 'ok' | 'user_not_found' | string;

class FirebaseAuthBridge {
  private idToken = '';
  private exp = 0;
  private started = false;
  /* Repli anonyme (durcissement /apex auth != null — Kevin 2026-07-04).
   * Garantit qu'un client Apex a TOUJOURS un token (auth != null satisfait)
   * même avant le login PIN / sans worker Phase 5. Fail-open : échec → ''. */
  private anonToken = '';
  private anonExp = 0;
  private anonNextTs = 0;
  private anonInflight: Promise<string> | null = null;

  /** Wiré au boot (core/bootstrap.ts safeInit). Idempotent. */
  init(): void {
    if (this.started) return;
    this.started = true;

    /* Restore token encore valide (évite un appel worker à chaque reload) */
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const e = parseInt(localStorage.getItem(EXP_KEY) ?? '0', 10);
      if (t && e > Date.now() + 60_000) { this.idToken = t; this.exp = e; }
    } catch { /* ignore */ }
    /* Restore token anonyme encore valide */
    try {
      const t = localStorage.getItem(ANON_TOKEN_KEY);
      const e = parseInt(localStorage.getItem(ANON_EXP_KEY) ?? '0', 10);
      if (t && e > Date.now() + 60_000) { this.anonToken = t; this.anonExp = e; }
    } catch { /* ignore */ }

    events.on('auth:login', (p) => { void this.activate(p.uid, p.isAdmin); });
    events.on('auth:logout', () => { this.clear(); });

    /* Déjà loggé au boot mais pas de token frais → tenter activation */
    try {
      const uid = localStorage.getItem('apex_v13_uid');
      if (uid && !this.getToken()) {
        void this.activate(uid, uid === 'kdmc_admin');
      }
    } catch { /* ignore */ }
    /* Pré-chauffe le repli anonyme (non-bloquant) pour que le 1er ping RTDB
     * parte déjà authentifié quand les règles exigent auth != null. */
    if (!this.getToken()) void this.ensureAnonToken();
  }

  /** Token valide (>30s avant expiry) ou '' (fail-open). Phase 5 prioritaire,
   * sinon repli anonyme. Lecture sync. */
  getToken(): string {
    if (this.idToken && this.exp > Date.now() + 30_000) return this.idToken;
    if (this.anonToken && this.anonExp > Date.now() + 30_000) return this.anonToken;
    /* Pas de token → '' (le repli anonyme est déclenché par init() et
     * ensureFreshToken(), jamais ici : getToken() reste PURE/sync — un fetch
     * fire-and-forget ici fuirait après teardown dans les tests, lesson #89). */
    return '';
  }

  /**
   * Repli anonyme : signUp Identity Toolkit (returnSecureToken) avec la clé Web
   * publique → id_token anonyme 1h. Satisfait `auth != null` pour les lectures
   * boot / users sans PIN. Throttle 60 s après échec. FAIL-OPEN : jamais de throw.
   */
  async ensureAnonToken(): Promise<string> {
    if (this.anonToken && this.anonExp > Date.now() + 30_000) return this.anonToken;
    if (Date.now() < this.anonNextTs) return '';
    if (this.anonInflight) return this.anonInflight;
    this.anonInflight = (async () => {
      try {
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FB_WEB_API_KEY)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnSecureToken: true }),
          signal: AbortSignal.timeout(10_000),
        });
        const d = await r.json().catch(() => null) as { idToken?: string; expiresIn?: string; error?: { message?: string } } | null;
        if (d?.idToken) {
          this.anonToken = d.idToken;
          this.anonExp = Date.now() + ((parseInt(d.expiresIn ?? '3600', 10) || 3600) * 1000);
          try {
            localStorage.setItem(ANON_TOKEN_KEY, this.anonToken);
            localStorage.setItem(ANON_EXP_KEY, String(this.anonExp));
          } catch { /* ignore */ }
          return this.anonToken;
        }
        this.anonNextTs = Date.now() + 60_000;
        logger.warn('fb-auth-bridge', 'anon signUp KO (fail-open)', { status: r.status, err: d?.error?.message ?? '?' });
        return '';
      } catch (e) {
        this.anonNextTs = Date.now() + 60_000;
        logger.warn('fb-auth-bridge', 'anon signUp exception (fail-open)', { err: String((e as Error)?.message ?? e).slice(0, 80) });
        return '';
      } finally {
        this.anonInflight = null;
      }
    })();
    return this.anonInflight;
  }

  /** Query-string `?auth=`/`&auth=` prête à concaténer, '' si aucun token.
   * Pour les fetch RTDB directs hors firebase.ts (rgpd, memory-bridge). */
  authQS(hasQuery: boolean): string {
    const t = this.getToken();
    if (!t) return '';
    return `${hasQuery ? '&' : '?'}auth=${encodeURIComponent(t)}`;
  }

  /**
   * v13.4.335 (Kevin « répare Firebase ») : garantit un token frais AVANT un ping
   * RTDB. Si le token courant est valide → le renvoie. Sinon tente une activation
   * (worker /login) à partir du user connecté (apex_v13_uid) et renvoie le token
   * obtenu (ou '' si échec). FAIL-OPEN : ne throw jamais. C'est ce qui débloque le
   * « Firebase RECONNECTING » quand le token manquait/était expiré au moment du ping.
   */
  async ensureFreshToken(): Promise<string> {
    const cur = this.getToken();
    if (cur) return cur;
    try {
      let uid = '';
      try { uid = localStorage.getItem('apex_v13_uid') ?? ''; } catch { uid = ''; }
      if (uid) await this.activate(uid, uid === 'kdmc_admin');
    } catch { /* fail-open */ }
    /* Phase 5 indisponible (pas de uid/PIN, worker KO, backoff) → repli anonyme
     * pour satisfaire les règles auth != null quand même. */
    if (!this.getToken()) await this.ensureAnonToken();
    return this.getToken();
  }

  /** Dernier statut d'auth lisible (pour le diagnostic). */
  lastStatus(): Record<string, unknown> {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}') as Record<string, unknown>; }
    catch { return {}; }
  }

  private workerUrl(): string {
    try { return localStorage.getItem('ax_auth_worker_url') || DEFAULT_WORKER_URL; }
    catch { return DEFAULT_WORKER_URL; }
  }

  private fbUrl(): string {
    try { return localStorage.getItem('apex_v13_fb_url') || FB_DEFAULT; }
    catch { return FB_DEFAULT; }
  }

  private setStatus(s: Record<string, unknown>): void {
    try { localStorage.setItem(STATUS_KEY, JSON.stringify({ ...s, ts: Date.now() })); }
    catch { /* ignore */ }
  }

  /**
   * Obtient un id_token pour ce user. Fail-open : renvoie false sans jamais throw.
   *
   * v13.4.336 (Kevin « login:rate_limited ») : THROTTLE. v335 appelait /login à
   * chaque ping + chaque 401 → le worker (anti-bruteforce PIN) rate-limitait →
   * plus jamais de token. On respecte un backoff : après un échec on attend avant
   * de retenter (long sur rate_limited, court sinon). Un succès remet à zéro.
   */
  private nextAllowedTs = 0;

  async activate(uid: string, isAdmin: boolean): Promise<boolean> {
    try {
      if (!uid) return false;
      /* Backoff actif → on NE rappelle PAS le worker (sinon on entretient le
       * rate-limit). Le token reste '' ; Firebase reste en mode dégradé propre. */
      if (Date.now() < this.nextAllowedTs) return false;
      const pinKey = isAdmin ? 'apex_v13_pin' : `apex_v13_pin_${uid}`;
      const pinHash = localStorage.getItem(pinKey);
      if (!pinHash) { this.setStatus({ ok: false, reason: 'no_local_pin' }); return false; }

      let res = await this.callLogin(uid, pinHash);
      if (res === 'user_not_found') {
        /* Bootstrap : créer le record Firebase (règles ouvertes) puis réessayer */
        await this.bootstrapFirebasePin(uid, pinHash);
        res = await this.callLogin(uid, pinHash);
      }

      if (res !== 'ok') {
        /* Backoff selon la raison : rate_limited = long (5 min) pour laisser la
         * fenêtre du worker se vider ; autres erreurs = court (60 s). */
        const isRate = /rate.?limit/i.test(res);
        this.nextAllowedTs = Date.now() + (isRate ? 5 * 60_000 : 60_000);
        this.setStatus({ ok: false, reason: 'login:' + res, retry_in_s: Math.round((this.nextAllowedTs - Date.now()) / 1000) });
        return false;
      }

      this.nextAllowedTs = 0; /* succès → plus de backoff */
      this.setStatus({ ok: true, has_id_token: !!this.idToken, mode: this.idToken ? 'id_token' : 'custom_only' });
      logger.info('fb-auth-bridge', 'Phase 5 activée', { has_id_token: !!this.idToken, uid });
      return true;
    } catch (e) {
      this.nextAllowedTs = Date.now() + 60_000;
      this.setStatus({ ok: false, reason: 'exception:' + String((e as Error)?.message ?? e).slice(0, 80) });
      return false;
    }
  }

  private async callLogin(uid: string, pinHash: string): Promise<LoginResult> {
    try {
      const r = await fetch(this.workerUrl() + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, pin_hash: pinHash }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await r.json().catch(() => ({})) as {
        ok?: boolean; error?: string; id_token?: string; refresh_token?: string; expires_in?: number;
      };
      if (r.ok && data.ok) {
        if (data.id_token) {
          this.idToken = data.id_token;
          this.exp = Date.now() + ((Number(data.expires_in) || 3600) * 1000);
          try {
            localStorage.setItem(TOKEN_KEY, this.idToken);
            localStorage.setItem(EXP_KEY, String(this.exp));
            if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
          } catch { /* ignore */ }
        }
        return 'ok';
      }
      return data?.error ? String(data.error) : ('http_' + r.status);
    } catch (e) {
      return 'fetch_error:' + String((e as Error)?.message ?? e).slice(0, 60);
    }
  }

  /** PUT direct du hash dans /apex/ax_pin_<uid> (règles ouvertes phase 4). Best-effort. */
  private async bootstrapFirebasePin(uid: string, pinHash: string): Promise<void> {
    try {
      await fetch(`${this.fbUrl()}/apex/ax_pin_${encodeURIComponent(uid)}.json${this.authQS(false)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pinHash),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (e) {
      logger.warn('fb-auth-bridge', 'bootstrap pin failed (fail-open)', { err: e });
    }
  }

  clear(): void {
    this.idToken = '';
    this.exp = 0;
    this.nextAllowedTs = 0; /* v336 : logout/reset → on autorise une nouvelle tentative tout de suite */
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch { /* ignore */ }
  }
}

export const firebaseAuthBridge = new FirebaseAuthBridge();
