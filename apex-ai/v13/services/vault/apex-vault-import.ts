/**
 * APEX v13.4.117 — Import vault depuis JSON file (Kevin "Go autonome sans mentir").
 *
 * Kevin 2026-05-15 05h15 : "Go. Toujours tout autonome. Sans mentir"
 *
 * HONNÊTETÉ : iOS Safari ne permet pas auto-lecture de fichier iCloud Drive
 * sans gesture user (Apple Privacy). Donc Kevin doit tapper UNE FOIS pour
 * sélectionner le fichier JSON. C'est le minimum possible — pas 0-clic.
 *
 * FLOW :
 *   1. Au boot, si Coffre vide → modal "📂 Importer depuis JSON ?"
 *   2. Kevin tap "Oui, importer" → <input type="file"> ouvre Files app iOS
 *   3. Kevin sélectionne apex-vault-backup-*.json depuis iCloud Drive
 *   4. Apex lit + parse + décrypte chaque entry (via vault.decryptAuto + PIN)
 *   5. Restore chaque clé via vault.setKey
 *   6. Toast "🔓 N clés restaurées depuis JSON Drive"
 *
 * SÉCURITÉ : fichier JSON contient des entries AXENC1:base64 chiffrées.
 * Sans PIN admin Kevin, impossible de décrypter. Si PIN invalide → 0 clés
 * restaurées (silent fail), pas de leak.
 */

import { logger } from '../../core/logger.js';

import { vault } from './vault.js';

interface VaultExportEntry {
  /* v13.4.121 fix : exportVaultJson utilise snake_case storage_key + value_encrypted.
   * Mon importer cherchait camelCase → BUG. Maintenant support des 2 formats. */
  storage_key?: string;
  storageKey?: string;
  name?: string;
  service?: string;
  value_encrypted?: string;
  encrypted?: string;
  encryptedValue?: string;
  ts?: number;
}

interface VaultExportPayload {
  version?: number;
  exported_at?: number | string;
  entries?: VaultExportEntry[];
  /** Legacy v13.x format */
  vault?: Record<string, string>;
  multiKeys?: VaultExportEntry[];
}

/**
 * Lit un fichier JSON via FileReader.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('FileReader result not string'));
    };
    reader.onerror = (): void => reject(new Error('FileReader error'));
    reader.readAsText(file);
  });
}

/**
 * Parse + restore un JSON export vault.
 * Retourne { restored, failed, decrypt_failed }.
 */
async function importFromJson(jsonText: string): Promise<{
  ok: boolean;
  restored: number;
  failed: number;
  decrypt_failed: number;
  error?: string;
}> {
  let parsed: VaultExportPayload;
  try {
    parsed = JSON.parse(jsonText) as VaultExportPayload;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, restored: 0, failed: 0, decrypt_failed: 0, error: `JSON parse failed: ${msg.slice(0, 60)}` };
  }

  let restored = 0;
  let failed = 0;
  let decryptFailed = 0;

  /* Format 1 : entries[] (v13.4.115+ snake_case ET camelCase fallback) */
  const entries = parsed.entries ?? parsed.multiKeys ?? [];
  for (const entry of entries) {
    /* v13.4.121 : support snake_case (exportVaultJson actuel) + camelCase legacy */
    const encrypted = entry.value_encrypted ?? entry.encrypted ?? entry.encryptedValue;
    const storageKey = entry.storage_key ?? entry.storageKey;
    if (!encrypted || !storageKey) {
      failed++;
      logger.debug('vault-import', `entry skip : encrypted=${!!encrypted} storageKey=${storageKey ?? '(none)'}`);
      continue;
    }
    /* Si déjà chiffré AXENC1: → décrypte via vault. Sinon plain → setKey direct. */
    let plaintext: string | null = null;
    if (encrypted.startsWith('AXENC1:')) {
      try {
        plaintext = await vault.decryptAuto(encrypted);
      } catch (err: unknown) {
        logger.warn('vault-import', `decrypt failed for ${storageKey}`, { err });
      }
      if (!plaintext) {
        decryptFailed++;
        continue;
      }
    } else {
      /* Pas de prefix AXENC1: → considère plain (cas legacy ou val déjà en clair) */
      plaintext = encrypted;
    }
    try {
      const r = await vault.setKey(storageKey, plaintext);
      if (r.ok) restored++;
      else failed++;
    } catch (err: unknown) {
      logger.warn('vault-import', `setKey failed for ${storageKey}`, { err });
      failed++;
    }
  }

  /* Format 2 : vault object (legacy v13.x) */
  if (parsed.vault) {
    for (const [storageKey, encrypted] of Object.entries(parsed.vault)) {
      if (!encrypted || typeof encrypted !== 'string') {
        failed++;
        continue;
      }
      try {
        const plaintext = await vault.decryptAuto(encrypted);
        if (!plaintext) {
          decryptFailed++;
          continue;
        }
        const r = await vault.setKey(storageKey, plaintext);
        if (r.ok) restored++;
        else failed++;
      } catch (err: unknown) {
        logger.warn('vault-import', `restore failed for ${storageKey}`, { err });
        failed++;
      }
    }
  }

  logger.info('vault-import', `imported: restored=${restored} failed=${failed} decrypt_failed=${decryptFailed}`);
  return {
    ok: restored > 0,
    restored,
    failed,
    decrypt_failed: decryptFailed,
  };
}

/**
 * Affiche un file picker iOS Files app pour sélectionner le JSON.
 * Retourne le résultat de l'import.
 */
async function promptAndImport(): Promise<{
  ok: boolean;
  restored: number;
  failed: number;
  decrypt_failed: number;
  cancelled?: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve({ ok: false, restored: 0, failed: 0, decrypt_failed: 0, cancelled: true });
        document.body.removeChild(input);
        return;
      }
      void (async () => {
        try {
          const text = await readFileAsText(file);
          const r = await importFromJson(text);
          resolve(r);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          resolve({ ok: false, restored: 0, failed: 0, decrypt_failed: 0, error: msg });
        } finally {
          try { document.body.removeChild(input); } catch { /* ignore */ }
        }
      })();
    });
    /* iOS Safari cancel detection : input loses focus without change */
    document.body.appendChild(input);
    input.click();
  });
}

export const apexVaultImport = {
  importFromJson,
  promptAndImport,
};
