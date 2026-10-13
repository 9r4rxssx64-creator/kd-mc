/**
 * APEX v13 — Auth service
 *
 * Comptes pré-configurés préservés depuis v12.785 :
 * - Kevin (DK admin) : ADMIN_ID = 'kdmc_admin', aliases multiples (reconnu privé, jamais affiché complet)
 * - Laurence : permissions tiered
 * - Familles CMCteams : bj, roulettes, cmc, cadres
 *
 * PIN PBKDF2 200k iterations + WebAuthn FaceID (Jet 2).
 *
 * Anti-pattern évité v12.240 :
 * - PIN per-user dans `apex_v13_pin_<uid>` JAMAIS dans `apex_v13_pin` global (admin only)
 *
 * Anti-pattern évité v12.241 :
 * - Login exige nom + prénom + pass tous 3, jamais substring sur 1 token
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';

const ADMIN_ID = 'kdmc_admin';

/* v13.3.65 fix Kevin "trop risqué — seulement nom+prénom et inversement, pas seulement prénom.
 * Pour tout le monde pareil toujours" :
 * Aliases courts (juste 'kevin' ou 'kdmc' seul) RETIRÉS pour cohérence avec Laurence.
 * Sécurité : MIN 2 tokens obligatoires pour TOUS users (Kevin + Laurence + clients). */
const KEVIN_ALIASES: readonly string[] = [
  'kevin desarzens',
  'desarzens kevin',
  'kevin.desarzens@gmail.com',
  'kevin desarzens kdmc',
  'kdmc desarzens',
];

interface PreconfiguredUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  family?: string;
}

/* Display names anonymisés (nom complet jamais affiché publiquement, juste prénom + initiales).
 * v13.3.62 (Kevin 2026-05-08 01:50) : Laurence aliases étendus pour matcher
 * "Laurence Saint-Polit", "Saint-Polit Laurence", "laurence sp", etc. */
const PRECONFIGURED: PreconfiguredUser[] = [
  { id: ADMIN_ID, name: 'Kevin (DK)', email: '', isAdmin: true },
  { id: 'laurence_sp', name: 'Laurence Saint-Polit', email: '', isAdmin: false },
];

/* v13.3.65 : USER_ALIASES retirés.
 * Sécurité Kevin "tout le monde pareil — pas seulement prénom" : matching strict
 * sur PRECONFIGURED.name uniquement (2 tokens minimum, ordre indifférent). */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-_.@]+/g, ' ')
    .trim();
}

class Auth {
  /**
   * Reconnaît Kevin admin via aliases (prénom+nom obligatoires, ordre indifférent).
   *
   * v13.3.65 fix sécurité Kevin "Pour tout le monde pareil toujours — pas seulement prénom" :
   * Avant : 'kevin' ou 'kdmc' seul matchait → risque impersonation.
   * Après : MIN 2 tokens obligatoires (kevin + desarzens en n'importe quel ordre).
   */
  isKevinAdmin(name: string): boolean {
    const n = normalize(name);
    if (KEVIN_ALIASES.includes(n)) return true;
    /* Email normalisé inclut "gmail com" en tokens */
    const tokens = n.split(/\s+/).filter((t) => t.length >= 4);
    /* Sécurité : min 2 tokens (prénom + nom obligatoires) */
    if (tokens.length < 2) return false;
    /* Match si tokens input ⊇ tokens alias (input plus riche que alias OK) */
    return KEVIN_ALIASES.some((alias) => {
      const aliasTokens = alias.split(/\s+/).filter((t) => t.length >= 4);
      if (aliasTokens.length < 2) return false; /* Cohérence : alias avec min 2 tokens */
      return aliasTokens.every((at) => tokens.includes(at));
    });
  }

  /**
   * P0-5 fix : isAdmin DÉRIVÉ de user.id (jamais flag stocké séparément).
   * Évite spoof DevTools `store.set('isAdmin', true)`.
   */
  async isAdmin(): Promise<boolean> {
    return this.isAdminSync();
  }

  /* Sync helper utilisable dans les guards router/admin */
  isAdminSync(): boolean {
    const user = store.get('user');
    return user?.id === ADMIN_ID;
  }

  /**
   * Comparaison string timing-safe (P0-3 fix).
   * Compare 2 chaînes hex en temps constant (XOR + OR sur tous les chars).
   * Évite timing attack qui leak info via durée de comparaison.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Hash PIN via PBKDF2 200k.
   *
   * Stratégie (v13.3.71 perf — off-main-thread) :
   * 1. Tente le crypto Worker (lazy-init au 1er appel) → ~0ms main-thread blocking.
   * 2. Si Worker indispo (legacy browser, CSP, ready timeout) → fallback main-thread
   *    Web Crypto natif (~80-150ms blocking, comportement v13.3.70).
   *
   * Backward-compat 100% : signature inchangée, output identique (hex 64 chars).
   * Tests: tests/unit/auth.test.ts continuent de passer (fallback main-thread).
   */
  async hashPin(pin: string, salt: string): Promise<string> {
    /* Try worker first (fire-and-forget si pas init). Lazy import pour éviter
     * de charger crypto-worker-client si jamais utilisé. */
    try {
      const { cryptoWorker } = await import('../storage/crypto-worker-client.js');
      const ok = await cryptoWorker.ensure();
      if (ok) {
        return await cryptoWorker.hashPin(pin, salt, 200_000);
      }
    } catch (err: unknown) {
      logger.warn('auth', 'crypto worker hashPin failed → fallback main-thread', { err });
    }
    /* Fallback main-thread : Web Crypto natif (comportement historique inchangé). */
    return this.hashPinMainThread(pin, salt);
  }

  /**
   * Hash PIN PBKDF2 main-thread (fallback). Conservé pour backward-compat.
   * Bloque ~80-150ms — utilisé seulement si Worker indispo.
   */
  private async hashPinMainThread(pin: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: 200_000, hash: 'SHA-256' },
      keyMaterial,
      256,
    );
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Login strict : nom + prénom + pin tous 3 obligatoires.
   * PIN admin → clé `apex_v13_pin` (réservée admin).
   * PIN user  → clé `apex_v13_pin_<uid>`.
   */
  async login(name: string, pin: string): Promise<{ ok: boolean; reason?: string }> {
    if (!name || !pin) return { ok: false, reason: 'Nom et code requis' };
    if (pin.length < 4) return { ok: false, reason: 'Code trop court' };

    const normalized = normalize(name);
    const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);
    /* v13.3.70 (Apex IA audit Kevin): bug `< 1` accepte juste "Laurence" → ensuite
     * matching échoue silencieusement → "Utilisateur inconnu".
     * Fix : reject early avec message actionnable si <2 tokens. */
    if (tokens.length < 2) {
      return { ok: false, reason: 'Tape ton prénom ET ton nom (ex: "Laurence Saint-Polit")' };
    }

    const isKevin = this.isKevinAdmin(name);
    let user: PreconfiguredUser | undefined = isKevin
      ? PRECONFIGURED.find((u) => u.id === ADMIN_ID)
      : PRECONFIGURED.find((u) => {
          /* v13.3.65 fix Kevin "trop risqué — seulement prénom+nom et inversement, pas juste prénom".
           *
           * SÉCURITÉ : matching STRICT avec 2 conditions cumulatives :
           * 1. MIN 2 tokens input (prénom+nom obligatoire, pas juste prénom seul)
           * 2. ALL user tokens must be in input (full name match, ordre indifférent)
           */
          if (tokens.length < 2) return false; /* Sécurité Kevin : prénom seul refusé */
          const userTokens = normalize(u.name).split(/\s+/).filter((t) => t.length >= 3);
          if (userTokens.length === 0) return false;
          const inputSet = new Set(tokens);
          /* TOUS les tokens du nom user doivent être présents dans l'input (ordre indifférent) */
          return userTokens.every((ut) => inputSet.has(ut));
        });

    /* v13.3.67 (Kevin 2026-05-08) : check signup-approved users (apex_v13_users)
     * Si pas trouvé dans PRECONFIGURED, chercher parmi clients approuvés.
     * Sécurité : MIN 2 tokens conservé (règle stricte v13.3.65). */
    if (!user && !isKevin && tokens.length >= 2) {
      try {
        const dynUsers = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{
          id: string; name: string; email: string; activated?: boolean;
        }>;
        const inputSet = new Set(tokens);
        const found = dynUsers.find((u) => {
          if (!u.activated) return false;
          const userTokens = normalize(u.name).split(/\s+/).filter((t) => t.length >= 3);
          if (userTokens.length < 2) return false;
          return userTokens.every((ut) => inputSet.has(ut));
        });
        if (found) {
          user = { id: found.id, name: found.name, email: found.email, isAdmin: false };
        }
      } catch { /* ignore */ }
    }

    if (!user) {
      /* P1 fix anti user enumeration : faire PBKDF2 de toute façon (constant-time response) */
      await this.hashPin(pin, 'fake-salt-anti-enumeration');
      this.audit('login_unknown_user', { details: { name_hash: this.shortHash(name), tokens: tokens.length } });
      /* v13.3.68 (Kevin "Laurence tjs bloqué — Utilisateur inconnu") :
       * Message d'erreur ACTIONNABLE selon le cas pour éviter blocage user. */
      if (tokens.length < 2) {
        return { ok: false, reason: 'Tape ton prénom ET ton nom (ex: "Laurence Saint-Polit")' };
      }
      return { ok: false, reason: 'Nom non reconnu. Vérifie l\'orthographe (prénom + nom complet).' };
    }

    /* Rate-limit check (P0 sécu critique parité v12.785) */
    const rateCheck = this.checkRateLimit(user.id);
    if (!rateCheck.allowed) {
      this.audit('login_rate_limited', { actor: user.id, details: { wait_min: rateCheck.waitMin } });
      return { ok: false, reason: `Trop de tentatives. Réessaie dans ${rateCheck.waitMin} min.` };
    }

    const pinKey = user.isAdmin ? 'apex_v13_pin' : `apex_v13_pin_${user.id}`;
    const storedHash = localStorage.getItem(pinKey);
    const salt = user.id;

    if (!storedHash) {
      /* Premier login : enregistrer PIN */
      const hash = await this.hashPin(pin, salt);
      try {
        localStorage.setItem(pinKey, hash);
      } catch (err: unknown) {
        logger.warn('auth', 'PIN persist failed', { err });
      }
    } else {
      const hash = await this.hashPin(pin, salt);
      /* P0-3 fix : timing-safe comparison anti-timing-attack */
      if (!this.timingSafeEqual(hash, storedHash)) {
        /* Rate-limit progressif (parité v12.785 anti brute-force) */
        this.recordFail(user.id);
        this.audit('login_pin_failure', { actor: user.id });
        return { ok: false, reason: 'Code incorrect' };
      }
      this.clearFails(user.id);
    }

    /* v13.4.314 (Kevin "tout vert mais toutes les IA KO") — Erreur #28 corrigée :
     * le proxy Cloudflare apex-secrets-proxy s'authentifie avec sha256(PIN admin
     * EN CLAIR) lu depuis le vault (ax_pin_kdmc_admin), mais RIEN ne l'y écrivait
     * → proxyFetch/tryProxyRoute renvoyaient null → appels IA en DIRECT sans clé
     * locale → 401 « clé invalide » → "Toutes les IA sont KO". On stocke donc le
     * PIN (chiffré AES-GCM via vault.setKey) au login PIN admin pour activer
     * l'auth proxy (clés server-side). Le PIN n'est JAMAIS en clair localStorage. */
    if (user.isAdmin) {
      try {
        const { vault } = await import('../vault/vault.js');
        await vault.setKey('ax_pin_kdmc_admin', pin);
      } catch (err: unknown) {
        logger.warn('auth', 'store admin pin for proxy auth failed (non bloquant)', { err });
      }
    }

    store.set('user', { id: user.id, name: user.name, email: user.email });
    store.set('isAdmin', user.isAdmin);
    try {
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: user.id, name: user.name }));
      localStorage.setItem('apex_v13_uid', user.id);
      localStorage.setItem('apex_v13_lastact', String(Date.now()));
      /* Persist last known + trust device (Kevin règle "reconnaît mon appareil") */
      localStorage.setItem('apex_v13_last_known_uid', user.id);
      localStorage.setItem('apex_v13_last_known_name', user.name);
      /* v13.4.262 (Kevin "Il doit garder mon pin en mémoire") :
       * Trust device AWAIT (pas fire-and-forget). Sans await, si Kevin navigue
       * avant que l'import dynamique device-context se termine, le trust n'est
       * jamais persisté → re-saisie PIN à chaque session. */
      await this.trustCurrentDevice(user.id);
    } catch {
      /* ignore */
    }

    events.emit('auth:login', { uid: user.id, isAdmin: user.isAdmin });
    this.kdmcDomainRegister(user.id, user.name);
    logger.info('auth', `Login ${user.name} (admin=${user.isAdmin})`);
    this.audit('login_success', { actor: user.id, details: { admin: user.isAdmin, method: 'pin' } });
    return { ok: true };
  }

  /**
   * Enregistrement auto du compte dans le domaine kd-mc.com (compte unique
   * transverse — Kevin "quand un compte est créé par une app, enregistrement
   * auto dans le domaine"). Additif + fail-open : ne tourne que sur *.kd-mc.com,
   * échec ignoré → le login de l'app reste identique.
   */
  private kdmcDomainRegister(uid: string, name: string): void {
    try {
      if (typeof location !== 'undefined' && location.hostname.indexOf('kd-mc.com') >= 0) {
        void fetch('/__sso/issue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uid, name, app: 'apex-ai' }),
        }).catch(() => {
          /* fail-open */
        });
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Login transparent sans PIN — uniquement si device est déjà trusted (auto-login).
   * Kevin règle : "S'il reconnaît mon appareil, il ne me demande pas connexion".
   * Sécurité : vérifie device fingerprint match avec apex_v13_device_trusted_v1.
   */
  async loginTrusted(uid: string, name: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      const trusted = localStorage.getItem('apex_v13_device_trusted_v1');
      if (!trusted) return { ok: false, reason: 'Device non trusted' };
      const { deviceContext } = await import('../integrations/device-context.js');
      const fp = await deviceContext.getFingerprint();
      if (fp.device_id !== trusted) return { ok: false, reason: 'Device fingerprint mismatch' };

      /* v13.4.323 SÉCU (audit) : le trust device est lié à l'UID qui l'a établi.
       * Sans ce binding, sur un device de confiance n'importe qui pouvait
       * s'auto-loguer SANS PIN en tant qu'un AUTRE user (ex: loginTrusted(
       * 'kdmc_admin') sur le device de Laurence = impersonation admin). */
      const trustUid = localStorage.getItem('apex_v13_device_trusted_uid_v1');
      if (trustUid) {
        if (trustUid !== uid) {
          this.audit('login_trusted_uid_mismatch', { actor: uid, details: { trustUid } });
          return { ok: false, reason: 'Device de confiance lié à un autre utilisateur' };
        }
      } else {
        /* Legacy : device trusté avant le binding UID → n'autoriser que le
         * dernier user connu (le flux légitime passe toujours last_known_uid),
         * puis migrer le binding. */
        const lastUid = localStorage.getItem('apex_v13_last_known_uid');
        if (lastUid && uid !== lastUid) {
          this.audit('login_trusted_uid_mismatch', { actor: uid, details: { legacy: true, lastUid } });
          return { ok: false, reason: 'Device de confiance lié à un autre utilisateur' };
        }
        try { localStorage.setItem('apex_v13_device_trusted_uid_v1', uid); } catch { /* ignore */ }
      }

      const user = PRECONFIGURED.find((u) => u.id === uid);
      if (!user) return { ok: false, reason: 'User unknown' };

      store.set('user', { id: user.id, name: name || user.name, email: user.email });
      store.set('isAdmin', user.isAdmin);
      try {
        localStorage.setItem('apex_v13_user', JSON.stringify({ id: user.id, name: name || user.name }));
        localStorage.setItem('apex_v13_uid', user.id);
        localStorage.setItem('apex_v13_lastact', String(Date.now()));
      } catch { /* ignore */ }
      events.emit('auth:login', { uid: user.id, isAdmin: user.isAdmin });
      this.kdmcDomainRegister(user.id, name || user.name);
      logger.info('auth', `loginTrusted ${name || user.name} (admin=${user.isAdmin})`);
      this.audit('login_success', { actor: user.id, details: { admin: user.isAdmin, method: 'trusted_device' } });
      return { ok: true };
    } catch (err: unknown) {
      logger.warn('auth', 'loginTrusted failed', { err });
      this.audit('login_trusted_failed', { actor: uid, details: { err: String(err).slice(0, 200) } });
      return { ok: false, reason: 'Auto-login failed' };
    }
  }

  /**
   * Marque le device courant comme trusted (skip PIN au prochain démarrage).
   * Stocke device_id fingerprint dans apex_v13_device_trusted_v1.
   */
  private async trustCurrentDevice(uid: string): Promise<void> {
    try {
      const { deviceContext } = await import('../integrations/device-context.js');
      const fp = await deviceContext.getFingerprint();
      localStorage.setItem('apex_v13_device_trusted_v1', fp.device_id);
      /* v13.4.323 SÉCU : lie le trust à l'UID qui l'a établi (anti-impersonation). */
      localStorage.setItem('apex_v13_device_trusted_uid_v1', uid);
    } catch { /* ignore */ }
  }

  /**
   * Auto-login « compte unique » kd-mc.com via session FORTE (Face ID/passkey).
   * SÉCURITÉ : ne se fie QU'au flag `verified` renvoyé par /__sso/whoami — ce flag
   * est posé par le worker UNIQUEMENT après une assertion passkey vérifiée (signature
   * ES256), et transporté dans un token HMAC re-vérifié serveur à chaque appel. Une
   * identité auto-déclarée (nom tapé) a `verified:false` → ignorée (aucun privilège).
   * Politique « Admin auto, toi seul » : seul le propriétaire (whoami.admin) est
   * auto-connecté (en ADMIN_ID). Un client verified non-admin n'a pas de compte Apex
   * ici → on ne fait rien (le nom est juste pré-rempli ailleurs). Fail-open total.
   */
  async loginVerifiedDomain(): Promise<{ ok: boolean; admin?: boolean; reason?: string }> {
    try {
      if (store.get('user')) return { ok: false, reason: 'déjà connecté' };
      const headers: Record<string, string> = {};
      let tok = '';
      try { tok = localStorage.getItem('kdmc_sso_token') || ''; } catch { /* ignore */ }
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      const r = await fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store', headers });
      if (!r.ok) return { ok: false, reason: 'no session' };
      const j = (await r.json()) as { ok?: boolean; uid?: string; name?: string; verified?: boolean; admin?: boolean };
      if (!j || !j.ok || j.verified !== true) return { ok: false, reason: 'non vérifié (Face ID requis)' };
      if (j.admin !== true) return { ok: false, reason: 'verified mais non-propriétaire' };
      if (store.get('user')) return { ok: false, reason: 'déjà connecté' };
      const user = PRECONFIGURED.find((u) => u.id === ADMIN_ID);
      if (!user) return { ok: false, reason: 'admin introuvable' };
      const name = j.name || user.name;
      store.set('user', { id: user.id, name, email: user.email });
      store.set('isAdmin', user.isAdmin);
      try {
        localStorage.setItem('apex_v13_user', JSON.stringify({ id: user.id, name }));
        localStorage.setItem('apex_v13_uid', user.id);
        localStorage.setItem('apex_v13_lastact', String(Date.now()));
        localStorage.setItem('apex_v13_last_known_uid', user.id);
      } catch { /* ignore */ }
      await this.trustCurrentDevice(user.id); /* boots suivants : reconnu sans re-Face ID */
      events.emit('auth:login', { uid: user.id, isAdmin: user.isAdmin });
      this.kdmcDomainRegister(user.id, name);
      logger.info('auth', `loginVerifiedDomain ${name} (admin=${user.isAdmin})`);
      this.audit('login_success', { actor: user.id, details: { admin: user.isAdmin, method: 'kdmc_faceid' } });
      return { ok: true, admin: user.isAdmin };
    } catch (err: unknown) {
      logger.warn('auth', 'loginVerifiedDomain failed', { err });
      return { ok: false, reason: 'erreur' };
    }
  }

  /**
   * Révoque le trust device courant (force PIN au prochain login).
   */
  untrustCurrentDevice(): void {
    try { localStorage.removeItem('apex_v13_device_trusted_v1'); } catch { /* ignore */ }
    try { localStorage.removeItem('apex_v13_device_trusted_uid_v1'); } catch { /* ignore */ }
  }

  logout(): void {
    /* Audit AVANT clear (sinon actor = null) */
    const currentUser = store.get('user') as { id?: string } | null;
    if (currentUser?.id) {
      this.audit('logout', { actor: currentUser.id });
    }
    /* Liste BLANCHE stricte des keys effacées (anti-pattern v12.297→330) */
    const SESSION_KEYS = [
      'apex_v13_user',
      'apex_v13_uid',
      'apex_v13_lastact',
      'apex_v13_session',
    ];
    for (const k of SESSION_KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    store.set('user', null);
    store.set('isAdmin', false);
    events.emit('auth:logout', {});
    logger.info('auth', 'Logout');
  }

  /**
   * Wire RGPD Art. 32 — auditLog forensic trail (login, fail, lock, logout).
   * Lazy import pour éviter circular dep + pas bloquer le login si audit-log KO.
   */
  private audit(action: string, opts: { actor?: string; details?: Record<string, unknown> } = {}): void {
    void import('../observability/audit-log.js')
      .then(({ auditLog }) => auditLog.record(`auth.${action}`, opts))
      .catch(() => { /* non-blocking */ });
  }

  /**
   * Hash court (8 hex) anti-leak quand on audit un nom inconnu (pas de PII).
   */
  private shortHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Création de compte par l'admin Kevin.
   * Tiers possibles : 'family' | 'client_pro' | 'client_free'
   * Si contact (téléphone WhatsApp) fourni → envoi automatique d'un lien d'invitation.
   */
  async createUser(opts: {
    name: string;
    tier: 'family' | 'client_pro' | 'client_free';
    email?: string;
    whatsappPhone?: string;
    initialPin?: string;
  }): Promise<{ ok: boolean; uid?: string; inviteLink?: string; reason?: string }> {
    const isAdmin = store.get('isAdmin');
    if (!isAdmin) return { ok: false, reason: 'Admin uniquement' };
    if (!opts.name.trim()) return { ok: false, reason: 'Nom requis' };

    const uid = `${opts.tier}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const userRecord = {
      id: uid,
      name: opts.name.trim(),
      email: opts.email ?? '',
      tier: opts.tier,
      whatsapp: opts.whatsappPhone ?? '',
      createdAt: Date.now(),
      createdBy: ADMIN_ID,
      activated: false,
    };
    try {
      const list = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<typeof userRecord>;
      list.push(userRecord);
      localStorage.setItem('apex_v13_users', JSON.stringify(list));
      localStorage.setItem(`apex_v13_tier_${uid}`, opts.tier);
      if (opts.initialPin) {
        const hash = await this.hashPin(opts.initialPin, uid);
        localStorage.setItem(`apex_v13_pin_${uid}`, hash);
      }
    } catch (err: unknown) {
      logger.error('auth', 'createUser persist failed', { err });
      return { ok: false, reason: 'Erreur stockage' };
    }

    /* Génère lien d'invitation 1-clic (signed token) */
    const token = await this.generateInviteToken(uid);
    const baseUrl = location.origin + location.pathname.replace(/\/index\.html$/, '/');
    const inviteLink = `${baseUrl}#invite=${token}`;
    logger.info('auth', `User created: ${opts.name} (${uid}, ${opts.tier})`);
    return { ok: true, uid, inviteLink };
  }

  private async generateInviteToken(uid: string): Promise<string> {
    /* P0-4 fix : full hash 64 chars (256 bits) + random salt (vs 16 chars/64 bits exploitable) */
    const randomSalt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = [...randomSalt].map((b) => b.toString(16).padStart(2, '0')).join('');
    const payload = `${uid}:${Date.now()}:${saltHex}`;
    const secret = ADMIN_ID + saltHex;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload + secret));
    const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return btoa(payload + ':' + hash).replace(/=+$/, '');
  }

  /* v13.4.264 (Kevin "Sécu max partout — personne ne doit pouvoir se connecter") :
   * Rate-limit progressif PIN BINDÉ AU DEVICE FINGERPRINT.
   *
   * Avant : la clé localStorage `apex_v13_pin_fails_<uid>` était la seule trace.
   * Un attaquant qui clear localStorage (DevTools, autre onglet) la résettait
   * → brute-force possible sans pénalité.
   *
   * Maintenant : `apex_v13_pin_fails_<uid>` ET `apex_v13_pin_fails_dev_<deviceId>`
   * sont les 2 verrous. Si l'un OU l'autre est locked → refus. Le device_id est
   * dérivé de `apex_v13_device_id` (stable per-device) — un attaquant qui clear
   * tout le localStorage régénère un nouveau device_id, donc bypass. Mais sur
   * un device légitime de Kevin (pas wiped), les 2 verrous se cumulent.
   *
   * Combined avec la sentinelle audit-honesty-watch + le rate-limit Cloudflare
   * Worker (à enrichir prochaine étape), c'est une défense en profondeur. */
  private getDeviceFailKey(): string {
    try {
      const did = localStorage.getItem('apex_v13_device_id');
      return did ? `apex_v13_pin_fails_dev_${did}` : 'apex_v13_pin_fails_dev_anon';
    } catch {
      return 'apex_v13_pin_fails_dev_anon';
    }
  }

  private readFails(key: string): { count: number; lockedUntil: number } {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{"count":0,"lockedUntil":0}');
    } catch {
      return { count: 0, lockedUntil: 0 };
    }
  }

  /* Rate-limit progressif PIN (P0 anti brute-force, parité v12.785) */
  private checkRateLimit(uid: string): { allowed: boolean; waitMin: number } {
    const userKey = `apex_v13_pin_fails_${uid}`;
    const devKey = this.getDeviceFailKey();
    const userFails = this.readFails(userKey);
    const devFails = this.readFails(devKey);
    const now = Date.now();
    /* Lock = max(user, device) — n'importe lequel actif suffit à bloquer */
    const lockedUntil = Math.max(userFails.lockedUntil, devFails.lockedUntil);
    if (lockedUntil > now) {
      return { allowed: false, waitMin: Math.ceil((lockedUntil - now) / 60_000) };
    }
    return { allowed: true, waitMin: 0 };
  }

  private recordFail(uid: string): void {
    const userKey = `apex_v13_pin_fails_${uid}`;
    const devKey = this.getDeviceFailKey();
    /* Échelle : 5→30s, 6→2min, 7→10min, 8→1h, 9→24h */
    const lockMs = [0, 0, 0, 0, 0, 30_000, 120_000, 600_000, 3_600_000, 86_400_000];
    for (const key of [userKey, devKey]) {
      const fails = this.readFails(key);
      fails.count += 1;
      const lock = fails.count < lockMs.length ? lockMs[fails.count] ?? 86_400_000 : 86_400_000;
      fails.lockedUntil = lock > 0 ? Date.now() + lock : 0;
      try {
        localStorage.setItem(key, JSON.stringify(fails));
      } catch {
        /* ignore quota */
      }
    }
  }

  private clearFails(uid: string): void {
    try {
      localStorage.removeItem(`apex_v13_pin_fails_${uid}`);
      localStorage.removeItem(this.getDeviceFailKey());
    } catch {
      /* ignore */
    }
  }

  listUsers(): Array<{ id: string; name: string; tier: string; activated: boolean }> {
    const isAdmin = store.get('isAdmin');
    if (!isAdmin) return [];
    try {
      return JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]');
    } catch {
      return [];
    }
  }

  restoreSession(): void {
    try {
      const raw = localStorage.getItem('apex_v13_user');
      const uid = localStorage.getItem('apex_v13_uid');
      const lastact = parseInt(localStorage.getItem('apex_v13_lastact') ?? '0', 10);
      if (!raw || !uid) return;
      /* Session TTL 8h */
      if (Date.now() - lastact > 8 * 60 * 60 * 1000) {
        this.logout();
        return;
      }
      const user = JSON.parse(raw) as { id: string; name: string; email?: string };
      /* Validation strict : user.id === uid (anti-pattern v12.272 cross-device pollution) */
      if (user.id !== uid) {
        logger.warn('auth', 'user_id_mismatch — force logout');
        this.logout();
        return;
      }
      store.set('user', user);
      store.set('isAdmin', user.id === ADMIN_ID);
    } catch (err: unknown) {
      logger.warn('auth', 'restoreSession failed', { err });
    }
  }
}

export const auth = new Auth();
