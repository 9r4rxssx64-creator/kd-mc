// D1 sur un vrai SQLite (node:sqlite) bâti avec TOUTES les migrations du dépôt.
// Revue 08.10.2026 : les fausses bases des tests acceptaient tout (NULL dans une
// colonne NOT NULL, collision UNIQUE…) et cachaient des pannes réelles. Ici les
// contraintes du schéma s'appliquent comme en production.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'd1-migrations');

export function d1Reel() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try { db.exec(readFileSync(join(DIR, f), 'utf8')); } catch (_) { /* une migration rejouée deux fois ne bloque pas */ }
  }
  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  // Lot A (A2-14) : comme le vrai D1, bind() renvoie une NOUVELLE instruction (l'instruction
  // préparée reste réutilisable) — `db.batch([st.bind(a), st.bind(b)])` écrit bien deux lignes.
  const prepare = (sql, args = []) => {
    const st = {
      bind(...a) { return prepare(sql, a.map(norm)); },
      async first() { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
      async all() { return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return st;
  };
  return { raw: db, prepare, async batch(s) { return Promise.all(s.map((x) => x.run())); } };
}
