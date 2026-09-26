/**
 * APEX v13.3.98 — Generic Secrets Catch-All (Kevin 2026-05-09 P0.3)
 *
 * Quand Kevin colle un secret > 20 chars qui ne matche AUCUN pattern reconnu
 * (`detectCredential` retourne null), on le stocke comme "secret générique"
 * avec un label libre que Kevin peut renommer plus tard.
 *
 * Storage : `apex_v13_generic_secrets` = Array<GenericSecret>
 * Chaque entry :
 *  - id        : UUID local
 *  - label     : étiquette user-defined (default "Secret générique #N")
 *  - cipher    : ciphertext AES-GCM via vault.encryptAuto
 *  - addedAt   : timestamp création
 *  - lastUsed? : timestamp dernier reveal
 *  - hint?     : aide texte (ex: "Token Railway prod env DATABASE_URL")
 *
 * Sécurité :
 *  - Valeur jamais en clair en mémoire après écriture (cipher only)
 *  - Backup avant suppression (`apex_v13_generic_secrets_trash`, TTL 30j)
 *  - Audit log immutable `vault.generic_secret_*` à chaque action
 *
 * Wired :
 *  - features/vault/index.ts autoDetectAndStore : fallback si detect=null
 *  - features/admin/all-secrets/index.ts : CRUD complet visualisation
 *  - tests/unit/generic-secrets.test.ts : régression
 */

import { logger } from '../../core/logger.js';

import { vault } from './vault.js';

const STORAGE_KEY = 'apex_v13_generic_secrets';
const TRASH_KEY = 'apex_v13_generic_secrets_trash';
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000; /* 30j */

export interface GenericSecret {
  id: string;
  label: string;
  cipher: string;
  addedAt: number;
  lastUsed?: number;
  hint?: string;
}

interface TrashEntry extends GenericSecret {
  deletedAt: number;
}

/* ──────────────────────── Helpers ──────────────────────── */

function uuid(): string {
  /* RFC4122 v4 best-effort sans dépendance */
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return 'gs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
}

function readAll(): GenericSecret[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is GenericSecret =>
        !!e
        && typeof (e as GenericSecret).id === 'string'
        && typeof (e as GenericSecret).label === 'string'
        && typeof (e as GenericSecret).cipher === 'string',
    );
  } catch (err: unknown) {
    logger.warn('generic-secrets', 'readAll parse failed', { err });
    return [];
  }
}

function writeAll(arr: GenericSecret[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    return true;
  } catch (err: unknown) {
    logger.warn('generic-secrets', 'writeAll failed', { err });
    return false;
  }
}

function pushTrash(entry: GenericSecret): void {
  try {
    const raw = localStorage.getItem(TRASH_KEY);
    const arr: TrashEntry[] = raw ? (JSON.parse(raw) as TrashEntry[]) : [];
    arr.push({ ...entry, deletedAt: Date.now() });
    /* Auto-purge > 30j */
    const now = Date.now();
    const cleaned = arr.filter((e) => now - e.deletedAt < TRASH_TTL_MS);
    localStorage.setItem(TRASH_KEY, JSON.stringify(cleaned));
  } catch { /* best-effort */ }
}

async function audit(action: string, details: Record<string, unknown>): Promise<void> {
  try {
    const { auditLog } = await import('../observability/audit-log.js');
    await auditLog.record(`vault.generic_secret.${action}`, { details });
  } catch { /* silent */ }
}

/* ──────────────────────── Service public ──────────────────────── */

class GenericSecretsService {
  /**
   * Liste tous les secrets génériques (cipher only — pas de plaintext).
   */
  list(): GenericSecret[] {
    return readAll();
  }

  /**
   * Compte total (pour stats UI).
   */
  count(): number {
    return readAll().length;
  }

  /**
   * Ajoute un nouveau secret générique.
   * Chiffre la valeur via vault.encryptAuto avant stockage.
   *
   * @param plaintext valeur à stocker
   * @param label optionnel — sinon "Secret générique #N"
   * @param hint optionnel — aide-mémoire user
   * @returns { ok, id?, reason? }
   */
  async add(
    plaintext: string,
    label?: string,
    hint?: string,
  ): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
    const trimmed = plaintext.trim();
    if (!trimmed) return { ok: false, reason: 'Valeur vide' };
    if (trimmed.length < 8) return { ok: false, reason: 'Trop court (< 8 chars)' };

    let cipher: string;
    try {
      cipher = await vault.encryptAuto(trimmed);
    } catch (err: unknown) {
      logger.warn('generic-secrets', 'encrypt failed', { err });
      return { ok: false, reason: 'Erreur chiffrement' };
    }

    const all = readAll();
    const id = uuid();
    const finalLabel = label?.trim() || `Secret générique #${all.length + 1}`;

    all.push({
      id,
      label: finalLabel,
      cipher,
      addedAt: Date.now(),
      ...(hint?.trim() ? { hint: hint.trim() } : {}),
    });

    if (!writeAll(all)) return { ok: false, reason: 'Erreur stockage' };

    void audit('added', { id, label: finalLabel, has_hint: !!hint });
    logger.info('generic-secrets', `added "${finalLabel}" (id=${id})`);
    return { ok: true, id };
  }

  /**
   * Renomme un secret (label + optionally hint).
   */
  rename(id: string, newLabel: string, newHint?: string): boolean {
    const all = readAll();
    const idx = all.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    const current = all[idx];
    if (!current) return false;
    const trimmedLabel = newLabel.trim();
    if (!trimmedLabel) return false;
    const updated: GenericSecret = {
      id: current.id,
      cipher: current.cipher,
      addedAt: current.addedAt,
      label: trimmedLabel,
    };
    if (current.lastUsed !== undefined) updated.lastUsed = current.lastUsed;
    if (newHint !== undefined) {
      const trimmedHint = newHint.trim();
      if (trimmedHint) updated.hint = trimmedHint;
    } else if (current.hint !== undefined) {
      updated.hint = current.hint;
    }
    all[idx] = updated;
    if (!writeAll(all)) return false;
    void audit('renamed', { id, label: trimmedLabel });
    return true;
  }

  /**
   * Décrypte un secret (mémoire courte — UI doit reveal 5s puis clear).
   * Met à jour lastUsed.
   */
  async reveal(id: string): Promise<{ ok: true; plaintext: string } | { ok: false; reason: string }> {
    const all = readAll();
    const entry = all.find((e) => e.id === id);
    if (!entry) return { ok: false, reason: 'Introuvable' };

    let plaintext: string | null;
    try {
      plaintext = await vault.decryptAuto(entry.cipher);
    } catch (err: unknown) {
      logger.warn('generic-secrets', 'decrypt failed', { err, id });
      return { ok: false, reason: 'Déchiffrement échoué' };
    }
    if (plaintext === null) {
      return { ok: false, reason: 'Déchiffrement impossible (passphrase ?)' };
    }

    /* Update lastUsed */
    entry.lastUsed = Date.now();
    writeAll(all);
    void audit('revealed', { id });

    return { ok: true, plaintext };
  }

  /**
   * Supprime (avec backup vers trash 30j).
   */
  remove(id: string): boolean {
    const all = readAll();
    const entry = all.find((e) => e.id === id);
    if (!entry) return false;
    pushTrash(entry);
    const filtered = all.filter((e) => e.id !== id);
    if (!writeAll(filtered)) return false;
    void audit('removed', { id, label: entry.label });
    return true;
  }

  /**
   * Restore depuis trash (si encore présent < 30j).
   */
  restore(id: string): boolean {
    try {
      const raw = localStorage.getItem(TRASH_KEY);
      if (!raw) return false;
      const trash = JSON.parse(raw) as TrashEntry[];
      const idx = trash.findIndex((e) => e.id === id);
      if (idx < 0) return false;
      const trashed = trash[idx];
      if (!trashed) return false;
      const { deletedAt: _del, ...entry } = trashed;
      void _del;
      const all = readAll();
      all.push(entry);
      writeAll(all);
      trash.splice(idx, 1);
      localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
      void audit('restored', { id });
      return true;
    } catch { return false; }
  }
}

export const genericSecrets = new GenericSecretsService();

/* Test helpers */
export const __test_helpers = {
  STORAGE_KEY,
  TRASH_KEY,
  TRASH_TTL_MS,
};
