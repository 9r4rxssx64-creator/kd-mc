// Base SQLite intégrée à Node (node:sqlite) : aucune dépendance native à compiler.
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = DatabaseSyncType;

// Chargé par require : Vitest ne connaît pas encore le module intégré « node:sqlite ».
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
     is_owner INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS secrets (
     name TEXT PRIMARY KEY, value_enc TEXT NOT NULL, updated_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS sync_items (
     user_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL,
     updated_at INTEGER NOT NULL, server_seq INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
     data TEXT NOT NULL, PRIMARY KEY (user_id, collection, id)
   );
   CREATE INDEX IF NOT EXISTS idx_sync_seq ON sync_items (user_id, server_seq);
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export function ouvrirBase(chemin: string): Db {
  if (chemin !== ":memory:") mkdirSync(dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const v = Number(
    (db.prepare("SELECT name FROM sqlite_master WHERE name='meta'").get()
      ? (db.prepare("SELECT value FROM meta WHERE key='schema'").get() as { value: string } | undefined)?.value
      : 0) ?? 0,
  );
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]!);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)").run(String(i + 1));
  }
  return db;
}
