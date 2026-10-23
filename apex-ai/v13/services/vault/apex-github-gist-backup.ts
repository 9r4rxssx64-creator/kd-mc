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


const GITHUB_CLES = [
  'ax_github_pat_classic',
  'ax_github_pat_finegrained',
  'ax_github_token',
  'ax_github_token_classic',
  'ax_github_token_fine',
  'ax_github_pat',
];
const GH_PAT = /^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82,})$/;

/** v13.4.383 (pont tâche 22) : la VRAIE cause d'un refus GitHub, lisible, sans jamais le jeton. */
export function causeGithub(status: number): string {
  if (status === 401) return 'jeton GitHub refusé (expiré ou révoqué)';
  if (status === 403) return 'jeton GitHub sans le droit « gist » ou limite atteinte';
  if (status === 404) return 'jeton GitHub sans accès aux gists (droit « gist » manquant)';
  if (status === 422) return 'contenu refusé par GitHub';
  if (status >= 500) return 'GitHub indisponible';
  if (status === 0) return 'réseau injoignable';
  return `réponse GitHub inattendue (HTTP ${status})`;
}

/** Page de création d'un jeton GitHub déjà remplie : nom + seule case « gist ». */
export const LIEN_NOUVEAU_JETON_GIST = 'https://github.com/settings/tokens/new?scopes=gist&description=Apex-AI-GIST';

/** Vrai quand TOUS les jetons du coffre ont été refusés (401/403/404) : le remède est un jeton neuf, pas un réessai. */
export function jetonAChanger(erreur?: string): boolean {
  return typeof erreur === 'string' && erreur.startsWith('gist_refus')
    && /refusé|sans le droit|sans accès/.test(erreur) && !/indisponible|réseau/.test(erreur);
}

/** Dernier résultat d'une VRAIE tentative d'envoi au Gist (collage d'un jeton, envoi du jour, bouton) : lu par l'écran, jamais le jeton. */
export const NOTE_GIST = 'apex_v13_gist_backup_dernier';
export function noterResultatGist(r: { ok: boolean; clefs?: number; jeton?: string; erreur?: string }): void {
  try {
    localStorage.setItem(NOTE_GIST, JSON.stringify({ ts: Date.now(), ok: r.ok, ...(r.clefs !== undefined ? { clefs: r.clefs } : {}), ...(r.jeton ? { jeton: r.jeton } : {}), ...(r.ok ? {} : { erreur: String(r.erreur ?? 'inconnu').slice(0, 200) }) }));
  } catch { /* quota */ }
}
/** Phrase pour Kevin, en français simple, à partir de la note (ou rien si aucun envoi n'a eu lieu). */
export function phraseGist(maintenant = Date.now()): string | null {
  try {
    const n = JSON.parse(localStorage.getItem(NOTE_GIST) ?? 'null') as { ts?: number; ok?: boolean; clefs?: number; erreur?: string } | null;
    if (!n || typeof n.ts !== 'number') return null;
    const min = Math.max(0, Math.round((maintenant - n.ts) / 60_000));
    const quand = min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.round(min / 60)} h`;
    return n.ok
      ? `☁️ Sauvegarde GitHub faite ${quand}${n.clefs ? ` : ${n.clefs} clé(s) chiffrée(s)` : ''}`
      : `⚠️ Sauvegarde GitHub non faite (${quand}) : ${n.erreur ?? 'cause inconnue'}`;
  } catch { return null; }
}

class ApexGithubGistBackup {
  private throttleLastPush = 0;
  private readonly THROTTLE_MS = 30_000; /* min 30s entre 2 pushes */

  /**
   * 23.10.2026 (Kevin « Vérifier que la sauvegarde GitHub part enfin », pont 447) : GitHub a montré que le jeton
   * « gist » n'avait JAMAIS servi et que le dernier gist datait de mai. Cause : l'envoi ne partait que quand Kevin
   * collait une clé ; depuis la 383 une clé restaurée ne le déclenche plus (voulu : fin du QR à chaque ouverture),
   * donc plus rien ne l'envoyait. Ici : un envoi silencieux (ni fenêtre, ni QR, ni bulle) au plus une fois par 24 h
   * après un succès, et une nouvelle tentative au bout d'une heure après un échec. Le résultat (et la cause, jamais
   * le jeton) est noté dans `apex_v13_gist_backup_dernier`.
   */
  async pushSiDu(): Promise<{ fait: boolean; ok?: boolean; erreur?: string }> {
    if (!auth.isAdminSync()) return { fait: false };
    const CLE = NOTE_GIST;
    try {
      const note = JSON.parse(localStorage.getItem(CLE) ?? 'null') as { ts?: number; ok?: boolean } | null;
      if (note && typeof note.ts === 'number') {
        const age = Date.now() - note.ts;
        if (note.ok && age < 24 * 3600_000) return { fait: false };
        if (!note.ok && age < 3600_000) return { fait: false };
      }
    } catch { /* note illisible : on tente */ }
    const debut = Date.now();
    const r = await this.pushBackup({ force: true });
    /* Rien à sauvegarder ou pas de jeton : pas une panne, on réessaiera au prochain démarrage. */
    if (!r.ok && (r.error === 'github_token_missing' || r.error === 'vault_empty_skip' || r.error === 'admin_only_push')) {
      return { fait: false, ok: false, erreur: r.error };
    }
    /* La note (ts, ok, cause, nombre de clés) est écrite par pushBackup lui-même, y compris pour un collage de jeton ;
     * si elle n'a pas été mise à jour pendant cet appel (envoi remplacé, doublure de test), on la note ici. */
    try {
      const n = JSON.parse(localStorage.getItem(CLE) ?? 'null') as { ts?: number } | null;
      if (!n || typeof n.ts !== 'number' || n.ts < debut) noterResultatGist({ ok: r.ok, ...(r.ok ? {} : { erreur: String(r.error ?? 'inconnu') }) });
    } catch { /* note illisible */ }
    if (!r.ok) logger.warn('gist-backup', `sauvegarde quotidienne non faite : ${r.error ?? 'inconnu'}`);
    if (!r.ok && jetonAChanger(r.error)) void this.prevenirJetonAChanger();
    return { fait: true, ok: r.ok, ...(r.ok ? {} : { erreur: r.error ?? 'inconnu' }) };
  }

  /**
   * 23.10.2026 (pont 497, tâche 4) : tous les jetons du coffre sont refusés par GitHub → le seul remède est un jeton neuf
   * avec le droit « gist ». Une alerte (cloche + notification), au plus une fois par 24 h, avec un lien qui ouvre la page de
   * création DÉJÀ remplie (nom + case gist) ; Kevin n'a qu'à valider, copier le jeton et le coller dans le chat d'Apex.
   */
  async prevenirJetonAChanger(): Promise<boolean> {
    const CLE = 'apex_v13_gist_alerte_ts';
    try {
      const dernier = Number(localStorage.getItem(CLE) ?? '0');
      if (Date.now() - dernier < 24 * 3600_000) return false;
      localStorage.setItem(CLE, String(Date.now()));
    } catch { /* quota : on alerte quand même */ }
    try {
      const { kevinAlerts } = await import('../admin/kevin-alerts.js');
      await kevinAlerts.alertKevin({
        severity: 'warn',
        title: '🔑 Sauvegarde GitHub : un jeton neuf est nécessaire',
        body: 'GitHub refuse le jeton enregistré. 1) Touche cette alerte : la page GitHub s’ouvre déjà remplie (nom Apex-AI-GIST, case gist cochée). 2) Touche « Generate token » en bas, puis copie le jeton affiché. 3) Reviens ici et colle-le dans le chat d’Apex : il le range tout seul et lance la sauvegarde.',
        source: 'gist-backup',
        cta_url: LIEN_NOUVEAU_JETON_GIST,
      });
      return true;
    } catch (err: unknown) {
      logger.warn('gist-backup', 'alerte jeton à changer non envoyée', { msg: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

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
    /* v13.4.383 (pont 249) : le jeton neuf était « Never used » chez GitHub — un ancien jeton (sans le droit gist)
     * passait avant lui. On essaie maintenant CHAQUE jeton du coffre, et on dit lequel (son nom, jamais sa valeur). */
    const jetons = await this.readGithubTokens();
    if (jetons.length === 0) return { ok: false, error: 'github_token_missing' };

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

    /* 4. Find existing gist → update, sinon create — jeton par jeton */
    const causes: string[] = [];
    for (const { cle, jeton: token } of jetons) {
      const existingGist = await this.findExistingGist(token, description);
      if (!existingGist && this.erreurListe !== 0) {
        causes.push(`${cle} : ${causeGithub(Math.max(0, this.erreurListe))}`);
        continue;
      }
      try {
        const gistId = existingGist ? await this.updateGist(token, existingGist.id, contentJSON)
                                    : await this.createGist(token, description, contentJSON);
        this.throttleLastPush = now;
        this.persistGistId(gistId);
        logger.info('gist-backup', `pushed ${vaultPlaintext.count} keys to gist ${gistId.slice(0, 8)}… (jeton ${cle})`);
        noterResultatGist({ ok: true, clefs: vaultPlaintext.count, jeton: cle });
        return { ok: true, gist_id: gistId, bytes: contentJSON.length };
      } catch (err: unknown) {
        causes.push(`${cle} : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const resume = causes.join(' · ').slice(0, 300);
    logger.error('gist-backup', `sauvegarde impossible : ${resume}`);
    noterResultatGist({ ok: false, erreur: resume });
    return { ok: false, error: `gist_refus: ${resume}` };
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
        const r = await vault.setKey(storageKey, plaintext, { origine: 'restauration' });
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

  /** Tous les jetons GitHub lisibles du coffre, sans doublon, dans l'ordre de préférence. */
  private async readGithubTokens(): Promise<Array<{ cle: string; jeton: string }>> {
    const out: Array<{ cle: string; jeton: string }> = [];
    const vus = new Set<string>();
    const ajouter = (cle: string, v: string) => {
      const j = v.trim();
      if (j.length > 10 && !vus.has(j)) { vus.add(j); out.push({ cle, jeton: j }); }
    };
    for (const k of GITHUB_CLES) {
      try { ajouter(k, (await vault.readKey(k)) || ''); } catch { /* suivante */ }
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('ax_') || GITHUB_CLES.includes(k)) continue;
        try {
          const v = (await vault.readKey(k)) || '';
          if (GH_PAT.test(v.trim())) ajouter(k, v);
        } catch { /* skip key */ }
      }
    } catch { /* localStorage indisponible */ }
    return out;
  }

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

  /** Dernier échec de la liste des gists (HTTP, -1 = réseau, 0 = aucun) : sans lui, un 401 créait un 2ᵉ gist (et échouait). */
  private erreurListe = 0;

  private async findExistingGist(token: string, description: string): Promise<GistApiResponse | null> {
    this.erreurListe = 0;
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
          this.erreurListe = resp.status;
          logger.warn('gist-backup', `liste des gists HTTP ${resp.status} : ${causeGithub(resp.status)}`);
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
        this.erreurListe = -1;
        logger.warn('gist-backup', `liste des gists : ${causeGithub(0)}`, { msg: err instanceof Error ? err.message : String(err) });
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
      throw new Error(`create HTTP ${resp.status} : ${causeGithub(resp.status)}`);
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
      throw new Error(`update HTTP ${resp.status} : ${causeGithub(resp.status)}`);
    }
    return gistId;
  }
}

export const apexGithubGistBackup = new ApexGithubGistBackup();
