#!/usr/bin/env node
/**
 * Déchiffre UN fichier de sauvegarde Apex Chat (R2) vers du JSON — pour regarder, pas pour restaurer.
 * Pour reconstruire une base : tools/backup-restore.mjs (voir docs/SAUVEGARDE-RESTAURATION.md).
 *
 *   BACKUP_ENCRYPTION_KEY='…' node tools/backup-decrypt.mjs manifest.enc > manifest.json   # format v2 (lot E2)
 *   JWT_SIGN_KEY='…'          node tools/backup-decrypt.mjs d1-2026-09-17.json.enc          # ancien format v1
 *
 * Même déchiffrement que le worker (workers/lib/backup.js : HKDF-SHA256 + AES-GCM-256). Les secrets
 * se lisent dans l'environnement, jamais en argument (historique du shell). Node ≥ 20, aucune dépendance.
 */
import { readFileSync } from 'node:fs';
import { decryptBlob } from '../workers/lib/backup.js';

const file = process.argv[2];
const secrets = { bk: process.env.BACKUP_ENCRYPTION_KEY || '', jwt: process.env.JWT_SIGN_KEY || '' };
if (!file || (!secrets.bk && !secrets.jwt)) {
  console.error('usage : BACKUP_ENCRYPTION_KEY=… (ou JWT_SIGN_KEY=… pour l\'ancien format) node tools/backup-decrypt.mjs <fichier .enc>');
  process.exit(2);
}
try {
  process.stdout.write(JSON.stringify(await decryptBlob(readFileSync(file, 'utf8'), secrets)));
} catch (e) {
  console.error(String((e && e.message) || e));
  process.exit(1);
}
