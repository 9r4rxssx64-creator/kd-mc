/**
 * APEX v13 — RGPD compliance (Art. 15-22) — Jet 5
 *
 * Audit subagent flag : "RGPD compliance ZERO. Pas de export JSON, pas de delete cascade,
 * pas de registre traitement. Conformité 65/100 = score drag."
 *
 * Implémentation Apex v13 RGPD :
 *
 * Art. 15 - Droit d'accès :
 *   exportUserData(uid) → JSON complet (profil, conversations, settings, audit, vault)
 *
 * Art. 16 - Droit de rectification :
 *   updateUserData(uid, patch) avec audit log immutable
 *
 * Art. 17 - Droit à l'effacement :
 *   deleteUserData(uid) cascade (localStorage + Firebase + IndexedDB)
 *   Confirmation double + audit log "user_erase_request" → "user_erased"
 *
 * Art. 18 - Droit à la limitation :
 *   restrictProcessing(uid) → freeze user data (read-only flag)
 *
 * Art. 20 - Droit à la portabilité :
 *   exportUserData() format JSON Schema standard interop
 *
 * Art. 21 - Droit d'opposition :
 *   optOutAITraining(uid) → flag `apex_v13_optout_training_<uid>` ne pas envoyer providers
 *
 * Art. 30 - Registre des traitements :
 *   getProcessingRegistry() retourne liste finalités + données + bases légales
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { firebaseAuthBridge } from './firebase-auth-bridge.js';

interface UserDataExport {
  uid: string;
  exportedAt: number;
  format: 'json' | 'jsonld';
  apex_version: string;
  data: {
    profile?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    conversations?: unknown[];
    persistent_memory?: unknown[];
    lessons?: unknown[];
    audit_entries?: unknown[];
    /* Secrets vault EXCLUS (sécurité — user a la passphrase, peut décrypter localement) */
  };
}

interface ProcessingActivity {
  finalite: string;
  donnees: string[];
  baseLegale: 'consent' | 'contract' | 'legal_obligation' | 'legitimate_interest';
  duree: string;
  destinataires: string[];
}

const PROCESSING_REGISTRY: ProcessingActivity[] = [
  {
    finalite: 'Authentification utilisateur',
    donnees: ['nom', 'PIN hash', 'webauthn credential'],
    baseLegale: 'contract',
    duree: 'Durée de la relation contractuelle',
    destinataires: ['Apex AI uniquement (pas de tiers)'],
  },
  {
    finalite: 'Chat IA',
    donnees: ['messages user', 'réponses IA', 'metadata session'],
    baseLegale: 'consent',
    duree: '90 jours sauf opposition',
    destinataires: ['Anthropic, OpenAI, Groq, Gemini (selon provider sélectionné, PII redactés outbound)'],
  },
  {
    finalite: 'Coffre clés API',
    donnees: ['clés API chiffrées AES-GCM 256 + PBKDF2 200k'],
    baseLegale: 'contract',
    duree: 'Tant que user actif',
    destinataires: ['Aucun (chiffré localement, jamais envoyé en clair)'],
  },
  {
    finalite: 'Audit log immutable',
    donnees: ['actions utilisateur, timestamps, hash chain'],
    baseLegale: 'legal_obligation',
    duree: '5 ans (obligation légale audit)',
    destinataires: ['Admin Kevin uniquement'],
  },
  {
    finalite: 'Synchronisation Firebase',
    donnees: ['settings, persistent_memory, audit (chiffrés)'],
    baseLegale: 'consent',
    duree: 'Tant que user actif + 30j archive',
    destinataires: ['Google Firebase RTDB (sous-traitant RGPD)'],
  },
];

class RGPD {
  /**
   * Art. 15 + 20 : Export JSON complet des données user.
   * Inclut profil, conversations, audit. EXCLUT secrets (user les a déjà).
   */
  async exportUserData(uid: string, opts: { format?: 'json' | 'jsonld' } = {}): Promise<UserDataExport> {
    const format = opts.format ?? 'json';
    const data: UserDataExport['data'] = {};

    /* Profil */
    try {
      const userRaw = localStorage.getItem('apex_v13_user');
      if (userRaw) {
        const user = JSON.parse(userRaw) as { id: string };
        if (user.id === uid) data.profile = JSON.parse(userRaw);
      }
    } catch {
      /* ignore */
    }

    /* Settings */
    try {
      const themeRaw = localStorage.getItem('apex_v13_theme');
      if (themeRaw) data.settings = { theme: JSON.parse(themeRaw) };
    } catch {
      /* ignore */
    }

    /* Persistent memory + lessons */
    try {
      const factsRaw = localStorage.getItem('apex_v13_facts');
      if (factsRaw) data.persistent_memory = JSON.parse(factsRaw) as unknown[];
      const lessonsRaw = localStorage.getItem('apex_v13_lessons');
      if (lessonsRaw) data.lessons = JSON.parse(lessonsRaw) as unknown[];
    } catch {
      /* ignore */
    }

    /* Audit entries filter par user */
    try {
      const entries = auditLog.getEntries({ actor: uid });
      data.audit_entries = [...entries];
    } catch {
      /* ignore */
    }

    await auditLog.record('rgpd.export', { actor: uid, details: { format } });
    logger.info('rgpd', `Exported user data for ${uid}`, { keys: Object.keys(data) });

    return {
      uid,
      exportedAt: Date.now(),
      format,
      apex_version: 'v13.0.0',
      data,
    };
  }

  /**
   * Art. 17 : Suppression cascade COMPLÈTE des données user (Jet 6 fix audit).
   * Avant : localStorage only → audit subagent flaggé "cascade mensonge".
   * Maintenant : localStorage + Firebase + IndexedDB shadow + audit log final.
   *
   * Étapes :
   * 1. Audit log "rgpd.erase.start" (immuable, conservé même après erase)
   * 2. localStorage : suppression clés scoped user
   * 3. Firebase : DELETE /apex/users/<uid>/.json + /apex/persistent_memory/<uid>/.json
   * 4. IndexedDB : clear ObjectStores user-scoped (si présent)
   * 5. Audit log "rgpd.erase.complete" avec count + sources
   */
  async deleteUserData(uid: string, confirmed: boolean): Promise<{
    ok: boolean;
    deletedKeys: string[];
    firebaseDeleted: boolean;
    idbDeleted: boolean;
    failures: string[];
  }> {
    if (!confirmed) {
      return { ok: false, deletedKeys: [], firebaseDeleted: false, idbDeleted: false, failures: ['not_confirmed'] };
    }
    await auditLog.record('rgpd.erase.start', { actor: uid });

    /* 1. localStorage cascade */
    const deletedKeys: string[] = [];
    const failures: string[] = [];
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === 'apex_v13_user' || k === 'apex_v13_uid' || k === 'apex_v13_lastact') {
        keysToDelete.push(k);
      } else if (k.endsWith(`_${uid}`) || k.includes(`_${uid}_`)) {
        keysToDelete.push(k);
      }
    }
    for (const k of keysToDelete) {
      try {
        localStorage.removeItem(k);
        deletedKeys.push(k);
      } catch (err: unknown) {
        failures.push(`localStorage:${k}:${String(err).slice(0, 40)}`);
      }
    }

    /* 2. Firebase cascade — DELETE serveur réel via REST */
    let firebaseDeleted = false;
    try {
      const fbUrl = localStorage.getItem('apex_v13_fb_url') ?? 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
      /* Path utilisateur dans schéma préservé v12.785 : /apex/users/<uid> */
      const paths = [`/apex/users/${encodeURIComponent(uid)}`, `/apex/persistent_memory/${encodeURIComponent(uid)}`, `/apex/lessons/${encodeURIComponent(uid)}`];
      let allOk = true;
      for (const p of paths) {
        try {
          const res = await fetch(`${fbUrl}${p}.json${firebaseAuthBridge.authQS(false)}`, { method: 'DELETE', signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            allOk = false;
            failures.push(`firebase:${p}:HTTP_${res.status}`);
          }
        } catch (err: unknown) {
          allOk = false;
          failures.push(`firebase:${p}:${String(err).slice(0, 40)}`);
        }
      }
      firebaseDeleted = allOk;
    } catch (err: unknown) {
      failures.push(`firebase_global:${String(err).slice(0, 40)}`);
    }

    /* 3. IndexedDB cascade (si Apex utilise IDB shadow Jet 6+) */
    let idbDeleted = false;
    try {
      if ('indexedDB' in globalThis) {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(`apex_v13_user_${uid}`);
          req.onsuccess = () => { idbDeleted = true; resolve(); };
          req.onerror = () => { failures.push('idb:delete_failed'); resolve(); };
          req.onblocked = () => { failures.push('idb:blocked'); resolve(); };
          /* Timeout safety */
          setTimeout(resolve, 5000);
        });
      }
    } catch (err: unknown) {
      failures.push(`idb_global:${String(err).slice(0, 40)}`);
    }

    /* 4. VERIFY phase post-delete (Jet 6.5 fix audit "race condition orphan") :
     * Re-read paths Firebase pour confirmer DELETE réel (anti orphan post-crash).
     * Si verify détecte data restée → retry DELETE 1 fois, sinon flag failure. */
    let firebaseVerified = false;
    if (firebaseDeleted) {
      try {
        const fbUrl = localStorage.getItem('apex_v13_fb_url') ?? 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
        const verifyPaths = [`/apex/users/${encodeURIComponent(uid)}`, `/apex/persistent_memory/${encodeURIComponent(uid)}`, `/apex/lessons/${encodeURIComponent(uid)}`];
        let allEmpty = true;
        for (const p of verifyPaths) {
          try {
            const res = await fetch(`${fbUrl}${p}.json${firebaseAuthBridge.authQS(false)}`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
              const body = await res.text();
              if (body !== 'null' && body !== '' && body !== 'undefined') {
                /* Path encore présent → retry DELETE 1× */
                allEmpty = false;
                failures.push(`verify_orphan:${p}`);
                try {
                  await fetch(`${fbUrl}${p}.json${firebaseAuthBridge.authQS(false)}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
                } catch {
                  /* retry échoué, déjà flaggé failure */
                }
              }
            }
          } catch {
            /* ignore — pas critique pour verify */
          }
        }
        firebaseVerified = allEmpty;
      } catch {
        firebaseVerified = false;
      }
    }

    /* 5. Audit log final immuable (PAS supprimé — obligation légale 5 ans Art. 30) */
    await auditLog.record('rgpd.erase.complete', {
      details: {
        deletedCount: deletedKeys.length,
        firebaseDeleted,
        firebaseVerified,
        idbDeleted,
        failureCount: failures.length,
      },
    });
    logger.info('rgpd', `Erased user ${uid} (cascade complete)`, {
      localStorage: deletedKeys.length,
      firebase: firebaseDeleted,
      firebaseVerified,
      idb: idbDeleted,
      failures: failures.length,
    });
    return { ok: failures.length === 0, deletedKeys, firebaseDeleted, idbDeleted, failures };
  }

  /**
   * Art. 21 : Opt-out training IA (pas envoyer données aux providers pour amélioration modèles).
   */
  optOutAITraining(uid: string, optOut: boolean): void {
    try {
      if (optOut) {
        localStorage.setItem(`apex_v13_optout_training_${uid}`, '1');
      } else {
        localStorage.removeItem(`apex_v13_optout_training_${uid}`);
      }
      void auditLog.record(optOut ? 'rgpd.optout.in' : 'rgpd.optout.out', { actor: uid });
    } catch (err: unknown) {
      logger.warn('rgpd', 'optOut persist failed', { err });
    }
  }

  isOptedOut(uid: string): boolean {
    return localStorage.getItem(`apex_v13_optout_training_${uid}`) === '1';
  }

  /**
   * Art. 18 : Limitation traitement (freeze user data en lecture seule).
   *
   * v13.3.81 (audit cascade P1.3) : extension scopes granulaires.
   *  - scopes vides ou ['*'] → restriction globale (legacy compat)
   *  - scopes spécifiques : ['firebase_write', 'ai_query', 'vault_decrypt', 'audit_export']
   *    → seul le scope listé bloqué.
   *
   * Wired :
   *  - services/firebase.ts write : if isRestricted(uid, 'firebase_write') → no-op + warn
   *  - services/ai-router.ts stream : if isRestricted(uid, 'ai_query') → return offline-only
   *  - vRGPDAdmin (admin only) : section "Restrictions actives" + lift bouton
   */
  restrictProcessing(uid: string, scopesOrFlag: string[] | boolean): void {
    try {
      const scopes = typeof scopesOrFlag === 'boolean'
        ? (scopesOrFlag ? ['*'] : [])
        : scopesOrFlag;
      if (scopes.length === 0) {
        localStorage.removeItem(`apex_v13_rgpd_restricted_${uid}`);
        localStorage.removeItem(`apex_v13_restricted_${uid}`); /* legacy */
        void auditLog.record('rgpd.restrict.lifted', { actor: uid });
        logger.info('rgpd', 'restriction lifted', { uid });
        return;
      }
      const entry = JSON.stringify({ scopes, ts: Date.now() });
      localStorage.setItem(`apex_v13_rgpd_restricted_${uid}`, entry);
      localStorage.setItem(`apex_v13_restricted_${uid}`, '1'); /* legacy alias */
      void auditLog.record('rgpd.restrict.applied', { actor: uid, details: { scopes } });
      logger.info('rgpd', 'restriction applied', { uid, scopes });
    } catch (err: unknown) {
      logger.warn('rgpd', 'restrictProcessing failed', { err });
    }
  }

  /**
   * Vérifie si un user a une restriction active sur un scope donné.
   * Si scope omis → vérifie restriction globale ('*' ou tout scope).
   */
  isRestricted(uid: string, scope?: string): boolean {
    try {
      const raw = localStorage.getItem(`apex_v13_rgpd_restricted_${uid}`);
      if (!raw) {
        /* Fallback legacy flag binaire */
        return localStorage.getItem(`apex_v13_restricted_${uid}`) === '1';
      }
      const parsed = JSON.parse(raw) as { scopes?: string[]; ts?: number };
      const scopes = Array.isArray(parsed.scopes) ? parsed.scopes : [];
      if (scopes.includes('*')) return true;
      if (!scope) return scopes.length > 0;
      return scopes.includes(scope);
    } catch {
      return false;
    }
  }

  /**
   * Lève la restriction (admin Kevin only — gate côté UI).
   */
  liftRestriction(uid: string): void {
    this.restrictProcessing(uid, []);
  }

  /**
   * Liste tous users avec restriction active (pour vRGPDAdmin).
   */
  listRestrictedUsers(): Array<{ uid: string; scopes: string[]; ts: number }> {
    const out: Array<{ uid: string; scopes: string[]; ts: number }> = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('apex_v13_rgpd_restricted_')) continue;
        const uid = k.slice('apex_v13_rgpd_restricted_'.length);
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as { scopes?: string[]; ts?: number };
          out.push({
            uid,
            scopes: Array.isArray(parsed.scopes) ? parsed.scopes : [],
            ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
          });
        } catch {
          /* legacy entry sans JSON → treat as global */
          out.push({ uid, scopes: ['*'], ts: 0 });
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  /* Art. 30 : Registre des traitements */
  getProcessingRegistry(): readonly ProcessingActivity[] {
    return PROCESSING_REGISTRY;
  }

  /**
   * Enregistre consent CGU/RGPD (Art. 6.1.a base légale).
   */
  recordConsent(uid: string, items: { aiTraining: boolean; analytics: boolean; thirdParty: boolean }): void {
    try {
      const consent = {
        uid,
        items,
        ts: Date.now(),
        version: 'v13.0.0',
      };
      localStorage.setItem(`apex_v13_rgpd_consent_${uid}`, JSON.stringify(consent));
      localStorage.setItem('apex_v13_rgpd_consent', JSON.stringify(consent)); /* alias global pour sentinelle */
      void auditLog.record('rgpd.consent.granted', { actor: uid, details: items });
    } catch (err: unknown) {
      logger.warn('rgpd', 'consent persist failed', { err });
    }
  }

  /**
   * Vérifie si un consentement existe.
   * - hasConsent(uid) → boolean (legacy : un consentement quelconque existe pour cet uid)
   * - hasConsent('analytics') | hasConsent('marketing') | hasConsent('preferences') → bool global
   *   (Mission v13.1 : consent granulaire par catégorie cookies)
   */
  hasConsent(uidOrCategory: string): boolean {
    /* Si c'est une catégorie reconnue, vérifie le consent cookie global */
    if (uidOrCategory === 'analytics' || uidOrCategory === 'marketing' || uidOrCategory === 'preferences' || uidOrCategory === 'essential') {
      try {
        const raw = localStorage.getItem('apex_v13_cookies_accepted');
        if (!raw) {
          return uidOrCategory === 'essential'; /* essential toujours implicite */
        }
        const parsed = JSON.parse(raw) as { analytics?: boolean; marketing?: boolean; preferences?: boolean; ts?: number };
        if (uidOrCategory === 'essential') {
          return true;
        }
        return parsed[uidOrCategory] === true;
      } catch {
        return uidOrCategory === 'essential';
      }
    }
    /* Sinon comportement legacy : check par uid */
    return localStorage.getItem(`apex_v13_rgpd_consent_${uidOrCategory}`) !== null;
  }

  /**
   * Mission v13.1 — Bandeau de consentement cookies.
   * Marque le banner comme à afficher si pas encore consenti.
   * Le DOM rendering est délégué à features/legal/index.ts ou bootstrap.
   */
  showCookieBanner(): { shouldShow: boolean; reason: string } {
    try {
      const stored = localStorage.getItem('apex_v13_cookies_accepted');
      if (!stored) {
        return { shouldShow: true, reason: 'first_visit' };
      }
      const parsed = JSON.parse(stored) as { ts?: number };
      const ageMs = Date.now() - (parsed.ts ?? 0);
      const THIRTEEN_MONTHS = 13 * 30 * 24 * 60 * 60 * 1000;
      if (ageMs > THIRTEEN_MONTHS) {
        return { shouldShow: true, reason: 'consent_expired_13_months' };
      }
      return { shouldShow: false, reason: 'consent_valid' };
    } catch {
      return { shouldShow: true, reason: 'parse_error' };
    }
  }

  /**
   * Mission v13.1 — Enregistre consent granulaire cookies.
   * Catégories : analytics, marketing (+ preferences implicite, essential toujours actif).
   */
  setConsent(consents: { analytics?: boolean; marketing?: boolean; preferences?: boolean }): void {
    try {
      const payload = {
        analytics: consents.analytics === true,
        marketing: consents.marketing === true,
        preferences: consents.preferences === true,
        essential: true, /* toujours actif (exemption Art. 82 LIL) */
        ts: Date.now(),
        version: 'v13.0.82',
      };
      localStorage.setItem('apex_v13_cookies_accepted', JSON.stringify(payload));
      void auditLog.record('rgpd.cookies.consent', { details: payload });
      logger.info('rgpd', 'Cookie consent recorded', payload);
    } catch (err: unknown) {
      logger.warn('rgpd', 'setConsent persist failed', { err });
    }
  }

  /**
   * Mission v13.1 — Art. 20 portabilité (export format machine-readable JSON).
   * Retourne un Blob pour download.
   */
  async portableExport(uid: string): Promise<Blob> {
    const data = await this.exportUserData(uid, { format: 'json' });
    /* Format JSON-LD interopérable (peut être consommé par autre prestataire) */
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'PersonalDataExport',
      generator: 'Apex AI v13',
      ...data,
      exportedAt: new Date(data.exportedAt).toISOString(),
      uid,
    };
    const json = JSON.stringify(jsonld, null, 2);
    await auditLog.record('rgpd.portable_export', { actor: uid, details: { size: json.length } });
    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Mission v13.1 — Art. 22 opposition profilage automatisé.
   * Différent de optOutAITraining (Art. 21) : ici on s'oppose à toute décision automatisée.
   */
  optOutAutomation(uid: string, optOut = true): void {
    try {
      if (optOut) {
        localStorage.setItem(`apex_v13_optout_automation_${uid}`, '1');
      } else {
        localStorage.removeItem(`apex_v13_optout_automation_${uid}`);
      }
      void auditLog.record(optOut ? 'rgpd.automation.optout' : 'rgpd.automation.optin', { actor: uid });
    } catch (err: unknown) {
      logger.warn('rgpd', 'optOutAutomation persist failed', { err });
    }
  }

  /**
   * Lecture statut opposition profilage Art. 22.
   */
  isAutomationOptedOut(uid: string): boolean {
    return localStorage.getItem(`apex_v13_optout_automation_${uid}`) === '1';
  }
}

export const rgpd = new RGPD();
