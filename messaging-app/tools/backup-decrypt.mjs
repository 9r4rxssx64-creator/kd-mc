#!/usr/bin/env node
/**
 * Déchiffre une sauvegarde quotidienne Apex Chat (backups/d1-<date>.json.enc dans R2).
 *
 *   JWT_SIGN_KEY='<secret du worker>' node tools/backup-decrypt.mjs d1-2026-09-17.json.enc > backup.json
 *
 * Même dérivation que le worker (HKDF-SHA256, sel « apex-chat-backup », info « d1-backup-v1 »,
 * AES-GCM-256). Le secret se lit dans l'environnement, jamais en argument (historique shell).
 * Aucune dépendance : WebCrypto de Node ≥ 20.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const secret = process.env.JWT_SIGN_KEY;
if (!file || !secret) {
  console.error('usage : JWT_SIGN_KEY=... node tools/backup-decrypt.mjs <fichier .json.enc>');
  process.exit(2);
}
const blob = JSON.parse(readFileSync(file, 'utf8'));
if (blob.v !== 1 || !blob.iv || !blob.ct) { console.error('format inconnu (attendu {v:1, iv, ct})'); process.exit(2); }
const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('apex-chat-backup'), info: new TextEncoder().encode('d1-backup-v1') },
  ikm, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
try {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct));
  process.stdout.write(new TextDecoder().decode(pt));
} catch (e) {
  console.error('déchiffrement refusé : mauvais secret ou fichier altéré (' + (e && e.message) + ')');
  process.exit(1);
}
