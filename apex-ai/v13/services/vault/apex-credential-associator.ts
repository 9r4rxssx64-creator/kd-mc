/**
 * APEX v13.4.100 — Associate credentials ↔ identifiants intelligemment.
 *
 * Kevin 2026-05-15 : "Qu'il associe identifiant et codes, etc, intelligemment
 * et teste tout toujours"
 *
 * Pour CHAQUE credential détecté, lier :
 *  - service (anthropic, github, stripe, etc.)
 *  - account_owner_uid (kdmc_admin / autre user)
 *  - account_identifier (email/login si présent dans contexte de collage)
 *  - related_credentials (clé classic + fine-grained = même compte)
 *  - associated_links (dashboard/billing/docs)
 *  - meta (plan, région, last_test_status)
 *
 * Persiste `apex_v13_credential_associations` (admin only write).
 * Test systématique au add via `axTestCredentialReal`.
 */

import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';

export interface CredentialAssociation {
  /** Service ID (ex: 'anthropic', 'github', 'stripe') */
  service: string;
  /** Masqué (ex: 'sk-***...***ab12'), JAMAIS plaintext */
  credential_masked: string;
  /** UID propriétaire (Kevin admin, Laurence, etc.) */
  account_owner_uid: string;
  /** Identifiant compte si détecté (email / login / id-client) */
  account_identifier?: string;
  /** IDs des autres credentials du même service & compte (dedup) */
  related_ids: string[];
  /** URLs liens dashboards/billing/docs */
  associated_links: string[];
  /** Métadonnées libres */
  meta: Record<string, string>;
  /** Status dernier test runtime */
  test_status: 'untested' | 'ok' | 'invalid' | 'rate_limited' | 'quota_exceeded' | 'network_error';
  /** ts dernier test */
  last_test_ts: number;
  /** ts création */
  ts: number;
  /** ID interne unique */
  id: string;
}

const STORE_KEY = 'apex_v13_credential_associations';
const MAX_ENTRIES = 200;

class ApexCredentialAssociator {
  private cache: CredentialAssociation[] | null = null;

  list(): CredentialAssociation[] {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        this.cache = [];
        return this.cache;
      }
      const parsed: unknown = JSON.parse(raw);
      this.cache = Array.isArray(parsed) ? (parsed as CredentialAssociation[]) : [];
      return this.cache;
    } catch {
      this.cache = [];
      return this.cache;
    }
  }

  listByOwner(uid: string): CredentialAssociation[] {
    return this.list().filter((a) => a.account_owner_uid === uid);
  }

  listByService(service: string): CredentialAssociation[] {
    return this.list().filter((a) => a.service === service);
  }

  /**
   * Associe un credential détecté avec son contexte.
   * Devine intelligemment account_identifier depuis le texte source proche.
   *
   * @param service ex: 'anthropic'
   * @param credentialValue plaintext (pour mask uniquement, pas stocké)
   * @param contextText texte autour du credential (max 500 chars) pour extraire email/login proche
   */
  associate(opts: {
    service: string;
    credentialValue: string;
    contextText?: string;
    associatedLinks?: string[];
    meta?: Record<string, string>;
  }): { ok: boolean; entry?: CredentialAssociation; error?: string } {
    if (!auth.isAdminSync()) {
      return { ok: false, error: 'admin_only_associate' };
    }
    if (!opts.service || !opts.credentialValue) {
      return { ok: false, error: 'invalid_input' };
    }

    const ownerUid = this.getCurrentOwnerUid();
    const accountIdentifier = this.guessAccountIdentifier(opts.service, opts.contextText ?? '');
    const masked = this.maskValue(opts.credentialValue);

    const existing = this.list();
    /* Détecte related : même service + même owner + masked similaire ou identifier matche */
    const related = existing
      .filter((e) =>
        e.service === opts.service &&
        e.account_owner_uid === ownerUid &&
        (accountIdentifier ? e.account_identifier === accountIdentifier : false),
      )
      .map((e) => e.id);

    const entry: CredentialAssociation = {
      service: opts.service,
      credential_masked: masked,
      account_owner_uid: ownerUid,
      related_ids: related,
      associated_links: opts.associatedLinks ?? [],
      meta: opts.meta ?? {},
      test_status: 'untested',
      last_test_ts: 0,
      ts: Date.now(),
      id: this.genId(),
    };
    if (accountIdentifier) entry.account_identifier = accountIdentifier;

    /* Update related entries to back-reference */
    for (const e of existing) {
      if (related.includes(e.id) && !e.related_ids.includes(entry.id)) {
        e.related_ids.push(entry.id);
      }
    }

    const updated = [...existing, entry].slice(-MAX_ENTRIES);
    this.persist(updated);
    logger.info('cred-assoc', `Associated ${opts.service} → owner=${ownerUid} identifier=${accountIdentifier ?? '(none)'} related=${related.length}`);

    return { ok: true, entry };
  }

  /**
   * Test runtime credential. Met à jour test_status + last_test_ts.
   * Admin only.
   */
  async runTest(id: string): Promise<{ ok: boolean; status: CredentialAssociation['test_status']; error?: string }> {
    if (!auth.isAdminSync()) return { ok: false, status: 'untested', error: 'admin_only_test' };
    const all = this.list();
    const entry = all.find((e) => e.id === id);
    if (!entry) return { ok: false, status: 'untested', error: 'not_found' };

    /* Lazy import pour ne pas charger axTestCredentialReal au boot si pas utilisé */
    let status: CredentialAssociation['test_status'] = 'untested';
    try {
      const tester = await import('./apex-credential-tester.js').catch(() => null);
      if (tester) {
        const r = await tester.testRuntime(entry.service);
        status = r.status;
      }
    } catch (err: unknown) {
      logger.debug('cred-assoc', `runTest ${entry.service} module load failed`, { err });
      status = 'network_error';
    }
    entry.test_status = status;
    entry.last_test_ts = Date.now();
    this.persist(all);
    logger.info('cred-assoc', `Test ${entry.service} ${id} → ${status}`);
    return { ok: true, status };
  }

  /**
   * Test runtime ALL credentials de l'admin courant. Parallel.
   * Retourne summary.
   */
  async runTestAll(): Promise<{ total: number; ok: number; invalid: number; errors: number }> {
    if (!auth.isAdminSync()) return { total: 0, ok: 0, invalid: 0, errors: 1 };
    const ownerUid = this.getCurrentOwnerUid();
    const myCreds = this.listByOwner(ownerUid);
    const results = await Promise.allSettled(myCreds.map((c) => this.runTest(c.id)));
    let ok = 0, invalid = 0, errors = 0;
    for (const r of results) {
      if (r.status === 'rejected') { errors++; continue; }
      if (r.value.status === 'ok') ok++;
      else if (r.value.status === 'invalid') invalid++;
      else errors++;
    }
    return { total: myCreds.length, ok, invalid, errors };
  }

  /**
   * Audit cohérence : trouve credentials orphelins (sans owner ou service), doublons, etc.
   */
  audit(): {
    orphans_no_owner: number;
    orphans_no_service: number;
    duplicates: number;
    untested: number;
    invalid: number;
  } {
    const all = this.list();
    const orphans_no_owner = all.filter((e) => !e.account_owner_uid || e.account_owner_uid === 'anon').length;
    const orphans_no_service = all.filter((e) => !e.service).length;
    const seen = new Map<string, number>();
    for (const e of all) {
      const k = `${e.service}::${e.credential_masked}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    let duplicates = 0;
    for (const count of seen.values()) {
      if (count > 1) duplicates += count - 1;
    }
    const untested = all.filter((e) => e.test_status === 'untested').length;
    const invalid = all.filter((e) => e.test_status === 'invalid').length;
    return { orphans_no_owner, orphans_no_service, duplicates, untested, invalid };
  }

  /* ============ helpers privés ============ */

  private getCurrentOwnerUid(): string {
    try {
      const u = localStorage.getItem('apex_v13_uid');
      if (u && u !== 'anon') return u;
      const lk = localStorage.getItem('apex_v13_last_known_uid');
      if (lk && lk !== 'anon') return lk;
      if (localStorage.getItem('apex_v13_pin')) return 'kdmc_admin';
      return 'anon';
    } catch {
      return 'anon';
    }
  }

  /**
   * Devine account_identifier depuis contexte de collage.
   * Cherche email valid OU login GitHub format / nom complet près du credential.
   */
  private guessAccountIdentifier(service: string, contextText: string): string | undefined {
    if (!contextText) return undefined;
    /* Email proche */
    const emailMatch = contextText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) return emailMatch[0];
    /* Service-specific patterns */
    if (service === 'github') {
      const m = contextText.match(/(?:github\.com\/|@)([a-zA-Z0-9-]{2,39})\b/);
      if (m && m[1]) return m[1];
    }
    if (service === 'twitter' || service === 'x') {
      const m = contextText.match(/@([a-zA-Z0-9_]{2,15})\b/);
      if (m && m[1]) return m[1];
    }
    return undefined;
  }

  private maskValue(plain: string): string {
    if (!plain) return '—';
    if (plain.length <= 12) return '••••••';
    return `${plain.slice(0, 4)}•••${plain.slice(-4)}`;
  }

  private genId(): string {
    return `assoc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private persist(entries: CredentialAssociation[]): void {
    this.cache = entries;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch (err: unknown) {
      logger.warn('cred-assoc', 'persist failed (quota?)', { err });
    }
  }
}

export const apexCredentialAssociator = new ApexCredentialAssociator();
