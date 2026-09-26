/**
 * APEX v13.4.104 — Backup vault via GitHub Gist privé chiffré (Kevin "la + sécu").
 *
 * Kevin 2026-05-15 03h25 : "La meilleur, la plus secu"
 *
 * Cycle infini résolu : tes 13 clés v13.4.91 → reinstall → 0 → recolle 8 →
 * reinstall → 0 → recolle 8 → reinstall → 0. Diagnostic v13.4.99 a révélé
 * Firebase Realtime DB KO (rules require auth = 401), donc backup Firebase
 * impossible.
 *
 * Solution sécurisée pragmatique : Gist GitHub privé chiffré.
 *
 * AVANTAGES :
 *   - AES-GCM-256 côté Apex AVANT push (server ne voit jamais plaintext)
 *   - Gist privé visible UNIQUEMENT par owner GitHub (toi via PAT)
 *   - Survit reinstall PWA : Kevin recolle PAT GitHub → Apex retrouve Gist
 *   - Pas d'infra : pas de Worker, pas de Firebase Auth, pas de Lambda
 *   - Audit GitHub : chaque accès Gist tracé
 *
 * FLOW :
 *   1. setKey() → encrypted vault JSON → push Gist (créé si pas existe)
 *   2. Au boot Coffre vide → list Gists user → find tag 'apex-vault-backup' →
 *      decrypt → restore
 *
 * Le Gist contient AXENC1:<base64 ciphertext>. Description tag stable :
 * "apex-vault-backup-v1-kdmc_admin" (ou autre uid). filename : "vault.enc".
 */

import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';

import { vault } from './vault.js';

const GIST_DESCRIPTION_PREFIX = 'apex-vault-backup-v1';
const GIST_FILENAME = 'vault.enc';
const ADMIN_KEVIN_UID = 'kdmc_admin';

interface GistApiResponse {
  id: string;
  description: string;
  files: Record<string, { content?: string; raw_url?: string }>;
  updated_at: string;
}

interface VaultBackupContent {
  v: 1;
  ts: number;
  uid: string;
  encrypted: string; /* AXENC1:... */
  count: number;
}

class ApexGithubGistBackup {
  private throttleLastPush = 0;
  private readonly THROTTLE_MS = 30_000; /* min 30s entre 2 pushes */

  /**
   * Push tout le vault encrypted vers Gist privé.
   * Idempotent : update gist existant ou crée.
   * Admin only.
   */
  async pushBackup(opts: { force?: boolean } = {}): Promise<{
    ok: boolean;
    gist_id?: string;
    error?: string;
    bytes?: number;
  }> {
    if (!auth.isAdminSync()) return { ok: false, error: 'admin_only_push' };
    const now = Date.now();
    if (!opts.force && now - this.throttleLastPush < this.THROTTLE_MS) {
      return { ok: false, error: 'throttled' };
    }
    const token = await this.readGithubToken();
    if (!token) return { ok: false, error: 'github_token_missing' };

    /* 1. Collecter toutes les clés du vault local en JSON plaintext */
    const vaultPlaintext = await this.collectVaultPlaintext();
    if (!vaultPlaintext || vaultPlaintext.count === 0) {
      return { ok: false, error: 'vault_empty_skip' };
    }

    /* 2. Chiffrer AES-GCM-256 via vault.encryptAuto (passphrase = PIN admin Kevin) */
    let encrypted: string;
    try {
      encrypted = await vault.encryptAuto(JSON.stringify(vaultPlaintext));
    } catch (err: unknown) {
      logger.error('gist-backup', 'encrypt failed', { err });
      return { ok: false, error: 'encrypt_failed' };
    }

    /* 3. Construire payload Gist content */
    const uid = this.getCurrentUid();
    const content: VaultBackupContent = {
      v: 1,
      ts: now,
      uid,
      encrypted,
      count: vaultPlaintext.count,
    };
    const contentJSON = JSON.stringify(content);
    const description = `${GIST_DESCRIPTION_PREFIX}-${uid}`;

    /* 4. Find existing gist → update, sinon create */
    const existingGist = await this.findExistingGist(token, description);
    try {
      const gistId = existingGist ? await this.updateGist(token, existingGist.id, contentJSON)
                                  : await this.createGist(token, description, contentJSON);
      this.throttleLastPush = now;
      this.persistGistId(gistId);
      logger.info('gist-backup', `pushed ${vaultPlaintext.count} keys to gist ${gistId.slice(0, 8)}…`);
      return { ok: true, gist_id: gistId, bytes: contentJSON.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('gist-backup', 'push failed', { msg });
      return { ok: false, error: `gist_api_${msg.slice(0, 60)}` };
    }
  }

  /**
   * Pull backup depuis Gist + restore vault.
   * Admin only.
   */
  async pullBackup(): Promise<{
    ok: boolean;
    restored?: number;
    error?: string;
    gist_id?: string;
  }> {
    if (!auth.isAdminSync()) return { ok: false, error: 'admin_only_pull' };
    const token = await this.readGithubToken();
    if (!token) return { ok: false, error: 'github_token_missing' };
    const uid = this.getCurrentUid();
    const description = `${GIST_DESCRIPTION_PREFIX}-${uid}`;
    const gist = await this.findExistingGist(token, description);
    if (!gist) return { ok: false, error: 'no_gist_found' };
    const file = gist.files[GIST_FILENAME];
    if (!file?.content) return { ok: false, error: 'gist_file_empty' };

    let parsed: VaultBackupContent;
    try {
      parsed = JSON.parse(file.content) as VaultBackupContent;
    } catch {
      return { ok: false, error: 'gist_json_invalid' };
    }
    if (parsed.v !== 1 || !parsed.encrypted) {
      return { ok: false, error: 'gist_version_mismatch' };
    }

    /* Décrypte */
    let plaintextJSON: string | null;
    try {
      plaintextJSON = await vault.decryptAuto(parsed.encrypted);
    } catch (err: unknown) {
      logger.error('gist-backup', 'decrypt failed', { err });
      return { ok: false, error: 'decrypt_failed' };
    }
    if (!plaintextJSON) return { ok: false, error: 'decrypt_returned_null' };

    let payload: { count: number; keys: Array<{ storageKey: string; plaintext: string }> };
    try {
      payload = JSON.parse(plaintextJSON) as { count: number; keys: Array<{ storageKey: string; plaintext: string }> };
    } catch {
      return { ok: false, error: 'plaintext_json_invalid' };
    }

    /* Re-setKey toutes les clés via vault */
    let restored = 0;
    for (const { storageKey, plaintext } of payload.keys) {
      try {
        const r = await vault.setKey(storageKey, plaintext);
        if (r.ok) restored++;
      } catch (err: unknown) {
        logger.warn('gist-backup', `restore failed for ${storageKey}`, { err });
      }
    }
    logger.info('gist-backup', `restored ${restored}/${payload.count} keys from gist ${gist.id.slice(0, 8)}…`);
    /* v13.4.254 — force le rafraîchissement de la mémoire vault d'Apex après
     * la restauration EN MASSE. Sans ça, le throttle de refreshVaultAudit fige
     * la mémoire sur la 1re clé → Apex annonce son coffre vide à tort. */
    if (restored > 0) {
      try {
        const { memory } = await import('../../core/memory.js');
        await memory.refreshVaultAudit(true);
      } catch { /* non-bloquant */ }
    }
    return { ok: true, restored, gist_id: gist.id };
  }

  /** Détecte si un backup Gist existe pour cet user. */
  async hasBackup(): Promise<{ exists: boolean; gist_id?: string; updated_at?: string }> {
    const token = await this.readGithubToken();
    if (!token) return { exists: false };
    const uid = this.getCurrentUid();
    const description = `${GIST_DESCRIPTION_PREFIX}-${uid}`;
    const gist = await this.findExistingGist(token, description);
    if (!gist) return { exists: false };
    return { exists: true, gist_id: gist.id, updated_at: gist.updated_at };
  }

  /* ===================== Internals ===================== */

  private async readGithubToken(): Promise<string> {
    /* v13.4.106 — Kevin colle un PAT classic (ghp_...) qui est stocké sous
     * ax_github_pat_classic (rename v13.4.49). Cherche dans plusieurs storageKeys :
     * 1. ax_github_pat_classic (PAT classic ghp_...)
     * 2. ax_github_pat_finegrained (PAT fine-grained github_pat_...)
     * 3. ax_github_token (legacy v13.4.x avant rename)
     * Premier qui répond plaintext > 10 chars gagne. */
    /* v13.4.255 — noms de clé historiques inclus (dérive entre versions,
     * cf. NOTES_USER.md / MEMO_RESUME.md) : ax_github_token →
     * ax_github_token_classic/_fine → ax_github_pat_classic/_finegrained. */
    const candidates = [
      'ax_github_pat_classic',
      'ax_github_pat_finegrained',
      'ax_github_token',
      'ax_github_token_classic',
      'ax_github_token_fine',
      'ax_github_pat',
    ];
    for (const k of candidates) {
      try {
        const v = await vault.readKey(k);
        if (v && v.length > 10) return v;
      } catch {
        /* try next */
      }
    }
    /* v13.4.255 — Fallback robuste (Kevin "PAT pas sûr d'où") : le PAT peut
     * avoir été stocké sous une clé inattendue (renommages entre versions,
     * mauvais classement #50). Scan TOUT le coffre pour une valeur qui matche
     * un format de PAT GitHub (ghp_… classic ou github_pat_… fine-grained). */
    const GH_PAT = /^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82,})$/;
    try {
      const seen = new Set(candidates);
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('ax_') || seen.has(k)) continue;
        try {
          const v = await vault.readKey(k);
          if (v && GH_PAT.test(v.trim())) {
            logger.info('gist-backup', `PAT GitHub retrouvé par pattern sous ${k}`);
            return v.trim();
          }
        } catch { /* skip key */ }
      }
    } catch { /* localStorage indisponible */ }
    return '';
  }

  private getCurrentUid(): string {
    try {
      const u = localStorage.getItem('apex_v13_uid');
      if (u && u !== 'anon') return u;
      const lk = localStorage.getItem('apex_v13_last_known_uid');
      if (lk && lk !== 'anon') return lk;
      if (localStorage.getItem('apex_v13_pin')) return ADMIN_KEVIN_UID;
      return ADMIN_KEVIN_UID; /* fallback Kevin admin path stable */
    } catch {
      return ADMIN_KEVIN_UID;
    }
  }

  private persistGistId(id: string): void {
    try { localStorage.setItem('apex_v13_gist_backup_id', id); } catch { /* ignore */ }
  }

  private async collectVaultPlaintext(): Promise<{ count: number; keys: Array<{ storageKey: string; plaintext: string }> }> {
    const keys: Array<{ storageKey: string; plaintext: string }> = [];
    /* Scan localStorage pour clés ax_*_key et apex_v13_multi_keys */
    const candidates: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (/^ax_.+_(?:key|token)$/.test(k)) candidates.push(k);
      }
    } catch { /* ignore */ }
    for (const k of candidates) {
      try {
        const plaintext = await vault.readKey(k);
        if (plaintext && plaintext.length > 5) {
          keys.push({ storageKey: k, plaintext });
        }
      } catch { /* skip */ }
    }
    return { count: keys.length, keys };
  }

  private async findExistingGist(token: string, description: string): Promise<GistApiResponse | null> {
    /* List Gists privés user. Pagination 30/page. Max 3 pages = 90 récents. */
    for (let page = 1; page <= 3; page++) {
      try {
        const resp = await fetch(`https://api.github.com/gists?per_page=30&page=${page}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) {
          logger.warn('gist-backup', `list gists page ${page} HTTP ${resp.status}`);
          return null;
        }
        const list = await resp.json() as GistApiResponse[];
        const match = list.find((g) => g.description === description);
        if (match) {
          /* Fetch full content (list endpoint ne retourne pas content) */
          const detailResp = await fetch(`https://api.github.com/gists/${match.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!detailResp.ok) return null;
          return await detailResp.json() as GistApiResponse;
        }
        if (list.length < 30) break; /* pas de page suivante */
      } catch (err: unknown) {
        logger.warn('gist-backup', `findExisting page ${page} failed`, { err });
        return null;
      }
    }
    return null;
  }

  private async createGist(token: string, description: string, content: string): Promise<string> {
    const resp = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description,
        public: false, /* PRIVÉ — visible uniquement owner */
        files: {
          [GIST_FILENAME]: { content },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      throw new Error(`create HTTP ${resp.status}`);
    }
    const data = await resp.json() as GistApiResponse;
    return data.id;
  }

  private async updateGist(token: string, gistId: string, content: string): Promise<string> {
    const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: { content },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      throw new Error(`update HTTP ${resp.status}`);
    }
    return gistId;
  }
}

export const apexGithubGistBackup = new ApexGithubGistBackup();
