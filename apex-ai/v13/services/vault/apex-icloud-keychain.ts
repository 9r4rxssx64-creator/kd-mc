/**
 * APEX v13.4.105 — iCloud Keychain auto-restore PAT GitHub (Kevin "zéro manip").
 *
 * Kevin 2026-05-15 03h35 : "Trouve une solution pour que je n'ai pas de
 * manipulation à faire. Tout autonome toujours"
 *
 * Cycle Coffre vide infini résolu DÉFINITIVEMENT :
 *   - PAT GitHub stocké dans iCloud Keychain Apple via Credentials Management API
 *   - Survit reinstall PWA (iCloud sync cross-device Apple ID)
 *   - Auto-restore silencieux au boot via navigator.credentials.get
 *   - Touch ID / Face ID validation utilisateur (1 tap max, pas saisie)
 *
 * FLOW SAVE (au stockage initial PAT) :
 *   1. Kevin colle PAT GitHub dans Coffre
 *   2. vault.setKey('ax_github_token', pat) succès
 *   3. Apex appelle navigator.credentials.store(new PasswordCredential({...}))
 *   4. iOS Safari prompt "Sauvegarder dans Trousseau iCloud ?"
 *   5. Kevin valide → PAT stocké dans iCloud Keychain Apple
 *
 * FLOW RESTORE (au boot après reinstall) :
 *   1. Boot Apex, Coffre vide
 *   2. navigator.credentials.get({ password: true, mediation: 'optional' })
 *   3. iOS Safari prompt Touch ID / Face ID
 *   4. Kevin valide → PasswordCredential renvoyée
 *   5. Apex extrait PAT → vault.setKey('ax_github_token', pat)
 *   6. apexGithubGistBackup.pullBackup() → restore TOUTES les clés
 *
 * SÉCURITÉ :
 *   - Credentials Management API est browser-isolated (pas d'autre domaine)
 *   - iCloud Keychain Apple e2e encrypted
 *   - Touch/Face ID requis pour get (sauf si mediation='silent')
 *   - PAT JAMAIS exposé en clair dans logs Apex
 */

import { logger } from '../../core/logger.js';

const APEX_PAT_ID = 'apex-vault-backup-github-pat';
const APEX_PAT_NAME = 'Apex Vault Backup (GitHub PAT)';

/** Détecte si Credentials Management API supporte PasswordCredential. */
function isSupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      'credentials' in navigator &&
      'PasswordCredential' in window
    );
  } catch {
    return false;
  }
}

/**
 * Save le PAT GitHub dans iCloud Keychain Apple via Credentials Management API.
 * iOS Safari demandera confirmation utilisateur (1 fois).
 *
 * @returns ok=true si sauvegarde initiée (utilisateur peut encore refuser le prompt)
 */
async function saveGithubPat(pat: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupported()) {
    return { ok: false, error: 'credentials_api_unsupported' };
  }
  if (!pat || pat.length < 10) {
    return { ok: false, error: 'pat_too_short' };
  }
  try {
    /* PasswordCredential : id = identifier visible Kevin, password = PAT */
    const PasswordCredentialCtor = (window as unknown as { PasswordCredential: new (init: {
      id: string;
      password: string;
      name?: string;
    }) => Credential }).PasswordCredential;
    const cred = new PasswordCredentialCtor({
      id: APEX_PAT_ID,
      password: pat,
      name: APEX_PAT_NAME,
    });
    /* store() resolves même si user refuse le prompt iOS (peut-être deferred) */
    await navigator.credentials.store(cred);
    logger.info('icloud-keychain', '✅ PAT GitHub stocké dans iCloud Keychain Apple');
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('icloud-keychain', 'save failed', { msg });
    return { ok: false, error: msg.slice(0, 100) };
  }
}

/**
 * Restore le PAT GitHub depuis iCloud Keychain Apple.
 * Au boot, après reinstall PWA, ça permet de récupérer le PAT en 1 Touch ID.
 *
 * mediation:
 *   - 'silent' : pas de prompt, retourne null si pas de Touch ID auto disponible
 *   - 'optional' : prompt léger si user déjà authentifié récemment
 *   - 'required' : prompt explicite Touch/Face ID toujours
 *
 * @returns { ok, pat? } pat=plaintext si trouvé+autorisé, null sinon
 */
async function loadGithubPat(opts: { mediation?: 'silent' | 'optional' | 'required' } = {}): Promise<{
  ok: boolean;
  pat?: string;
  error?: string;
}> {
  if (!isSupported()) {
    return { ok: false, error: 'credentials_api_unsupported' };
  }
  try {
    /* TypeScript : navigator.credentials.get accepts password:true en spec mais
     * types builtin TS sont restrictifs. Cast via unknown. */
    const cred = await (navigator.credentials as unknown as {
      get: (options: { password: boolean; mediation?: string }) => Promise<Credential | null>;
    }).get({
      password: true,
      mediation: opts.mediation ?? 'optional',
    });
    if (!cred) return { ok: false, error: 'no_credential_returned' };
    /* PasswordCredential a un champ 'password' */
    const pwCred = cred as unknown as { id?: string; password?: string };
    if (!pwCred.password) return { ok: false, error: 'credential_no_password' };
    /* Vérif id pour confirmer que c'est bien notre credential Apex */
    if (pwCred.id !== APEX_PAT_ID) {
      logger.debug('icloud-keychain', `loaded credential id mismatch: ${pwCred.id}`);
      return { ok: false, error: 'credential_id_mismatch' };
    }
    logger.info('icloud-keychain', '🔓 PAT GitHub restauré depuis iCloud Keychain Apple');
    return { ok: true, pat: pwCred.password };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('icloud-keychain', 'load failed (user cancel ou no creds)', { msg });
    return { ok: false, error: msg.slice(0, 100) };
  }
}

/**
 * Boot hook : tente de restaurer le PAT puis trigger Gist pull.
 * Appelé par services-bootstrap.ts safeInit('icloud-keychain-restore').
 */
async function bootRestore(): Promise<{ pat_restored: boolean; vault_restored?: number }> {
  if (!isSupported()) return { pat_restored: false };
  try {
    /* Skip si PAT déjà présent en localStorage (pas besoin de prompt) */
    const existing = localStorage.getItem('ax_github_token');
    if (existing && existing.length > 5) {
      return { pat_restored: false };
    }
    /* Tente mediation:'optional' (lightweight prompt iOS) */
    const result = await loadGithubPat({ mediation: 'optional' });
    if (!result.ok || !result.pat) {
      return { pat_restored: false };
    }
    /* Store PAT dans vault localement */
    const { vault } = await import('./vault.js');
    await vault.setKey('ax_github_token', result.pat);
    /* Trigger Gist pull pour restore vault complet */
    let restored = 0;
    try {
      const { apexGithubGistBackup } = await import('./apex-github-gist-backup.js');
      const pull = await apexGithubGistBackup.pullBackup();
      if (pull.ok && pull.restored) restored = pull.restored;
    } catch (err: unknown) {
      logger.warn('icloud-keychain', 'gist pull after restore failed', { err });
    }
    /* Toast success Kevin */
    try {
      const { toast } = await import('../../ui/toast.js');
      toast.success(
        `🔐 PAT GitHub restauré (iCloud Keychain) + ${restored} clés Vault depuis Gist privé chiffré`,
        { duration: 10000 },
      );
    } catch { /* silent */ }
    return { pat_restored: true, vault_restored: restored };
  } catch (err: unknown) {
    logger.warn('icloud-keychain', 'bootRestore failed', { err });
    return { pat_restored: false };
  }
}

export const apexIcloudKeychain = {
  isSupported,
  saveGithubPat,
  loadGithubPat,
  bootRestore,
};
