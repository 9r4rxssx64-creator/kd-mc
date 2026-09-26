/**
 * APEX v13 — Credentials Audit (Kevin demande 2026-05-04 P0 SECU).
 *
 * "Vérifie que toutes les clés/codes que j'ai donnés à Apex sont bien
 *  sécurisés, mémorisés, sauvegardés, mis en appui dans les bons endroits
 *  et que tout fonctionne, toutes les IA, les liens, etc." — Kevin
 *
 * Helper qui scanne le vault + credential-patterns et retourne pour chaque
 * pattern reconnu :
 *   - storageKey : nom de la clé
 *   - configured : true si vault.readKey ≠ ''
 *   - encrypted : true si valeur stockée commence par AXENC1: (AES-GCM-256)
 *   - persisted : { local, idb, firebase } — quels backends ont la clé
 *   - dashboard_url : lien direct rechargement / config
 *   - last_test : timestamp dernier ping API (si dispo)
 *   - status : 'ok' | 'missing' | 'corrupted' | 'expired' | 'unknown'
 *
 * Utilisé par vue admin vCredentialsRegistry pour donner à Kevin un
 * dashboard live de l'état de TOUS ses credentials (88 patterns).
 *
 * Privacy : ne retourne JAMAIS la valeur en clair. Masque ***...XX en preview.
 */

import { logger } from '../../core/logger.js';

export type CredentialStatus = 'ok' | 'missing' | 'corrupted' | 'expired' | 'unknown' | 'decrypt_failed';

export interface CredentialAuditEntry {
  /** Nom du service (ex: "Anthropic API", "Stripe Connect"). */
  service_name: string;
  /** Clé localStorage (ex: 'ax_anthropic_key'). */
  storage_key: string;
  /** Catégorie (ai, banking, payment, social, etc.). */
  category: string;
  /** Configuré : true si vault.readKey() retourne non-vide. */
  configured: boolean;
  /** Chiffré : true si la valeur stockée a le préfixe AXENC1: (vrai chiffrement). */
  encrypted: boolean;
  /** Persistance : présence dans local, IDB shadow, Firebase backup. */
  persisted: { local: boolean; idb: boolean; firebase: boolean };
  /** Preview masquée (ex: "sk-ant-***...XX"). Jamais la valeur en clair. */
  preview: string;
  /** URL dashboard pour rechargement / config (cf. CREDENTIAL_PATTERNS). */
  dashboard_url?: string;
  /** URL billing (rechargement crédit). */
  billing_url?: string;
  /** Statut global. */
  status: CredentialStatus;
  /** Détail status (ex: "valeur stockée mais format invalide"). */
  status_detail?: string;
}

export interface CredentialsAuditReport {
  ts: number;
  total_patterns: number;
  configured_count: number;
  encrypted_count: number;
  /** Combien sont dans Firebase backup (résiste réinstallation PWA). */
  firebase_backup_count: number;
  /** Score sécurité 0-100 (encrypted/configured ratio). */
  security_score: number;
  /** Liste détaillée par credential. */
  entries: CredentialAuditEntry[];
  /** Catégories couvertes (ai/banking/payment/...). */
  categories_covered: string[];
  /** Recommandations actionables. */
  recommendations: string[];
}

class CredentialsAudit {
  /**
   * Scan complet du vault contre CREDENTIAL_PATTERNS.
   * Best-effort, ne throw jamais. Lit en lecture seule (pas de write).
   */
  async runFullAudit(): Promise<CredentialsAuditReport> {
    const { CREDENTIAL_PATTERNS } = await import('./credential-patterns.js');
    const { vault } = await import('./vault.js');

    const entries: CredentialAuditEntry[] = [];
    const categoriesSet = new Set<string>();

    for (const pattern of CREDENTIAL_PATTERNS) {
      categoriesSet.add(pattern.category);
      const entry = await this.auditOne(pattern, vault);
      entries.push(entry);
    }

    const configured = entries.filter((e) => e.configured);
    const encrypted = entries.filter((e) => e.encrypted);
    const fbBackup = entries.filter((e) => e.persisted.firebase);

    /* Score : encrypted / configured (max 100). Bonus persistence Firebase. */
    let securityScore = 0;
    if (configured.length > 0) {
      const encRatio = encrypted.length / configured.length;
      const fbRatio = fbBackup.length / configured.length;
      securityScore = Math.round((encRatio * 70 + fbRatio * 30) * 100) / 100;
    } else {
      securityScore = 100; /* aucune clé = pas de risque (mais pas opérationnel) */
    }

    const recommendations: string[] = [];
    /* v13.3.21 : surface decrypt_failed en P0 — Apex IA HS si clé Anthropic illisible */
    const decryptFailed = entries.filter((e) => e.status === 'decrypt_failed');
    if (decryptFailed.length > 0) {
      const services = decryptFailed.map((e) => e.service_name).slice(0, 5).join(', ');
      recommendations.push(`🚨 ${decryptFailed.length} clé(s) ILLISIBLE(S) (decrypt failed) : ${services}. Clique "🔓 Récupérer" sur la fiche pour recoller.`);
    }
    /* Recommandations actionables Kevin */
    const aiConfigured = configured.filter((e) => e.category === 'ai');
    if (aiConfigured.length === 0) {
      recommendations.push('⚠️ Aucune clé IA configurée — Apex ne pourra pas répondre. Configure au moins ax_anthropic_key.');
    } else if (aiConfigured.length < 2) {
      recommendations.push('💡 Une seule clé IA — pas de failover. Ajoute Groq/OpenAI/Gemini en backup.');
    }
    const unencrypted = configured.filter((e) => !e.encrypted);
    if (unencrypted.length > 0) {
      recommendations.push(`🔒 ${unencrypted.length} clé(s) NON chiffrée(s) en localStorage : ${unencrypted.slice(0, 5).map((e) => e.storage_key).join(', ')}. Re-stocker via vault.setKey pour activer AES-GCM-256.`);
    }
    const noFbBackup = configured.filter((e) => !e.persisted.firebase && (e.category === 'ai' || e.category === 'payment'));
    if (noFbBackup.length > 0) {
      recommendations.push(`☁️ ${noFbBackup.length} clé(s) IA/payment SANS backup Firebase — risque perte si réinstallation PWA. Re-save via vault.setKey pour push backup.`);
    }
    /* Telegram alerts canal pour sentinelles */
    const hasTelegram = configured.some((e) => e.storage_key === 'ax_telegram_token');
    const hasDiscord = configured.some((e) => e.storage_key === 'ax_discord_webhook_url');
    if (!hasTelegram && !hasDiscord) {
      recommendations.push('📡 Aucun channel d\'alerte (Telegram ou Discord). Configure ax_telegram_token + ax_telegram_chat_id pour recevoir les alertes sentinelles.');
    }

    return {
      ts: Date.now(),
      total_patterns: CREDENTIAL_PATTERNS.length,
      configured_count: configured.length,
      encrypted_count: encrypted.length,
      firebase_backup_count: fbBackup.length,
      security_score: securityScore,
      entries,
      categories_covered: [...categoriesSet].sort(),
      recommendations,
    };
  }

  /**
   * Audit d'UN seul credential. Lit local + IDB pour vérifier persistance.
   * Ne lit jamais Firebase directement (RGPD : on ne fait que vérifier
   * l'existence local — la backup Firebase est inférée par FB_FIX).
   */
  private async auditOne(
    pattern: { name: string; storageKey: string; category: string; dashboard?: string; billing?: string },
    vault: { readKey: (k: string) => Promise<string> },
  ): Promise<CredentialAuditEntry> {
    /* Lecture locale brute pour détecter chiffrement */
    const rawLocal = (() => {
      try { return localStorage.getItem(pattern.storageKey); } catch { return null; }
    })();
    /* Lecture déchiffrée via vault (pour preview masquée) */
    let decrypted = '';
    let decryptFailed = false;
    try {
      decrypted = await vault.readKey(pattern.storageKey);
      /* v13.3.21 : si AXENC1: présent en localStorage MAIS readKey retourne ''
       * → decrypt fail silencieux (passphrase rotation). Flag pour status. */
      if (!decrypted && rawLocal && rawLocal.startsWith('AXENC1:')) {
        decryptFailed = true;
      }
    } catch {
      /* corrompu */
      if (rawLocal && rawLocal.startsWith('AXENC1:')) decryptFailed = true;
    }

    const configured = decrypted.length > 0;
    const encrypted = !!rawLocal && rawLocal.startsWith('AXENC1:');

    /* IDB shadow check (best-effort) */
    let inIdb = false;
    try {
      const { FB_FIX } = await import('../storage/firebase.js');
      /* Présomption : si FB_FIX inclut la clé, elle est sync Firebase */
      if (FB_FIX.includes(pattern.storageKey) && configured) {
        inIdb = true; /* sync via Firebase implique IDB shadow */
      }
    } catch { /* ignore */ }

    /* Firebase backup : inféré via présence dans FB_FIX whitelist */
    let inFirebase = false;
    try {
      const { FB_FIX } = await import('../storage/firebase.js');
      inFirebase = FB_FIX.includes(pattern.storageKey) && configured;
    } catch { /* offline OK */ }

    /* Preview masquée — JAMAIS valeur en clair */
    const preview = configured
      ? this.maskValue(decrypted)
      : '—';

    /* Détermine status */
    let status: CredentialStatus = 'unknown';
    let statusDetail: string | undefined;
    if (decryptFailed) {
      /* v13.3.21 : decrypt_failed prioritaire sur missing — clé EXISTE en local mais illisible.
       * UI peut proposer "Récupérer cette clé" (recolle plaintext, re-chiffre passphrase courante). */
      status = 'decrypt_failed';
      statusDetail = 'Clé chiffrée présente mais illisible (passphrase rotation ?). Recolle pour récupérer.';
    } else if (!configured) {
      status = 'missing';
    } else if (rawLocal && !encrypted && rawLocal.length > 4) {
      /* Configuré mais NON chiffré = corrompu (ancienne migration v12) */
      status = 'corrupted';
      statusDetail = 'Stocké en clair dans localStorage (re-save pour chiffrer)';
    } else if (encrypted && configured) {
      status = 'ok';
    }

    const entry: CredentialAuditEntry = {
      service_name: pattern.name,
      storage_key: pattern.storageKey,
      category: pattern.category,
      configured,
      encrypted,
      persisted: { local: !!rawLocal, idb: inIdb, firebase: inFirebase },
      preview,
      status,
    };
    if (pattern.dashboard) entry.dashboard_url = pattern.dashboard;
    if (pattern.billing) entry.billing_url = pattern.billing;
    if (statusDetail) entry.status_detail = statusDetail;
    return entry;
  }

  /**
   * Masque la valeur : 4 premiers + *** + 4 derniers (jamais valeur complète).
   */
  private maskValue(value: string): string {
    if (!value) return '—';
    if (value.length <= 8) return '***';
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }

  /**
   * v13.3.36 (Kevin 2026-05-07 — credentials-watch alerte "1/16 enregistrés") :
   *
   * Sync vault → registry persistant `ax_credentials_registry`.
   *
   * Problème observé : Vault contient 10 clés mais registry n'en référence qu'1.
   * Cause : registry n'est pas re-synchronisé après chaque vault.setKey, et
   * la sentinelle credentials-watch lit le registry pour son décompte.
   *
   * Cette méthode :
   *   1. Scan tous les CREDENTIAL_PATTERNS via vault.readKey
   *   2. Construit un snapshot {storage_key, configured, encrypted, ts}
   *   3. Persiste dans `ax_credentials_registry` (FB_FIX optionnel)
   *
   * Idempotent : multi-call OK. Appelé au boot + après chaque vault.setKey.
   */
  async syncFromVault(): Promise<{ ok: boolean; total: number; configured: number; ts: number }> {
    const ts = Date.now();
    try {
      const report = await this.runFullAudit();
      const snapshot = report.entries.map((e) => ({
        storage_key: e.storage_key,
        service_name: e.service_name,
        category: e.category,
        configured: e.configured,
        encrypted: e.encrypted,
        status: e.status,
        last_synced: ts,
      }));
      const payload = {
        ts,
        total: report.total_patterns,
        configured: report.configured_count,
        encrypted: report.encrypted_count,
        firebase_backup: report.firebase_backup_count,
        security_score: report.security_score,
        entries: snapshot,
      };
      try {
        localStorage.setItem('ax_credentials_registry', JSON.stringify(payload));
      } catch (err: unknown) {
        logger.warn('credentials-audit', 'syncFromVault localStorage failed', { err });
      }
      logger.info('credentials-audit', `syncFromVault OK : ${report.configured_count}/${report.total_patterns} configurés`);
      return {
        ok: true,
        total: report.total_patterns,
        configured: report.configured_count,
        ts,
      };
    } catch (err: unknown) {
      logger.error('credentials-audit', 'syncFromVault failed', { err });
      return { ok: false, total: 0, configured: 0, ts };
    }
  }

  /**
   * v13.3.36 — Lit le registry persisté (cache rapide pour sentinelle credentials-watch
   * sans recomputer audit complet à chaque tick).
   * Retourne null si pas encore syncé.
   */
  readRegistry(): {
    ts: number;
    total: number;
    configured: number;
    encrypted: number;
    firebase_backup: number;
    security_score: number;
    entries: Array<{ storage_key: string; service_name: string; category: string; configured: boolean; encrypted: boolean; status: string; last_synced: number }>;
  } | null {
    try {
      const raw = localStorage.getItem('ax_credentials_registry');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as ReturnType<CredentialsAudit['readRegistry']>;
    } catch {
      return null;
    }
  }

  /**
   * Test ping API live pour vérifier validité d'une clé.
   * Best-effort : appelle pattern.testEndpoint si défini, sinon retourne 'unknown'.
   */
  async testCredential(storageKey: string): Promise<{
    storage_key: string;
    valid: boolean | null;
    latency_ms?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const { CREDENTIAL_PATTERNS } = await import('./credential-patterns.js');
      const pattern = CREDENTIAL_PATTERNS.find((p) => p.storageKey === storageKey);
      if (!pattern) {
        return { storage_key: storageKey, valid: null, error: 'Pattern inconnu' };
      }
      const testEndpoint = (pattern as { testEndpoint?: string }).testEndpoint;
      if (!testEndpoint) {
        return { storage_key: storageKey, valid: null, error: 'Pas d\'endpoint test (manuel requis)' };
      }
      const { vault } = await import('./vault.js');
      const value = await vault.readKey(storageKey);
      if (!value) {
        return { storage_key: storageKey, valid: false, error: 'Non configuré' };
      }
      /* Test endpoint direct (pas autoTest qui est privé) — best-effort */
      const headers: Record<string, string> = {};
      if (pattern.name.toLowerCase().includes('anthropic')) {
        headers['x-api-key'] = value;
        headers['anthropic-version'] = '2023-06-01';
      } else if (pattern.name.toLowerCase().includes('google')) {
        headers['x-goog-api-key'] = value;
      } else {
        headers['authorization'] = `Bearer ${value}`;
      }
      try {
        const res = await fetch(testEndpoint, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(8000),
        });
        return {
          storage_key: storageKey,
          valid: res.ok,
          latency_ms: Date.now() - start,
        };
      } catch (fetchErr: unknown) {
        return {
          storage_key: storageKey,
          valid: false,
          latency_ms: Date.now() - start,
          error: String(fetchErr).slice(0, 200),
        };
      }
    } catch (err: unknown) {
      logger.warn('credentials-audit', `testCredential ${storageKey} threw`, { err });
      return {
        storage_key: storageKey,
        valid: null,
        error: String(err).slice(0, 200),
      };
    }
  }
}

export const credentialsAudit = new CredentialsAudit();
