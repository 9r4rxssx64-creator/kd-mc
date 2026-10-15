#!/usr/bin/env node
/**
 * Restaure une sauvegarde Apex Chat (R2) dans une base SQLite neuve, ou en fichier SQL pour D1.
 *
 * Lot E2 (15.10.2026, audit A5 F3) : il n'existait qu'un outil de DÉCHIFFREMENT (vers du JSON) ;
 * rien ne savait reconstruire une base, et aucune restauration n'avait jamais été essayée.
 *
 *   # 1. récupérer la sauvegarde (format v2 : un dossier par jour)
 *   mkdir -p /tmp/bk && cd messaging-app/workers
 *   npx wrangler r2 object get apex-chat-media/backups/d1-2026-10-15/manifest.enc --remote --file /tmp/bk/manifest.enc
 *   BACKUP_ENCRYPTION_KEY=… node ../tools/backup-restore.mjs /tmp/bk --list-parts   # noms des pages à récupérer
 *   (pour chaque nom : npx wrangler r2 object get apex-chat-media/backups/d1-2026-10-15/<nom> --remote --file /tmp/bk/<nom>)
 *   # 2. reconstruire
 *   BACKUP_ENCRYPTION_KEY=… node ../tools/backup-restore.mjs /tmp/bk --sqlite /tmp/apex.db       # base locale vérifiée
 *   BACKUP_ENCRYPTION_KEY=… node ../tools/backup-restore.mjs /tmp/bk --sql /tmp/restore.sql      # pour D1 :
 *   npx wrangler d1 execute apex-chat-restore-test --remote --file /tmp/restore.sql             # (base JETABLE d'abord)
 *
 * Ancien format (v1, un seul fichier d1-<date>.json.enc chiffré avec JWT_SIGN_KEY) : passer le
 * fichier au lieu du dossier, avec JWT_SIGN_KEY dans l'environnement ; le schéma vient alors des
 * migrations (--migrations, par défaut ../d1-migrations).
 *
 * Les secrets se lisent dans l'environnement, jamais en argument (historique du shell).
 * L'outil n'affiche QUE des noms de tables et des nombres de lignes : jamais une donnée.
 * Garde : tests/unit/lot-e2-sauvegarde-restauration.test.js (aller-retour sur une vraie base).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { decryptBlob, b64decode } from '../workers/lib/backup.js';
import { appliquer, executeurSqlite } from './d1-migrations-runner.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_PAR_DEFAUT = resolve(ICI, '..', 'd1-migrations');
const nomPage = (n) => `p${String(n).padStart(5, '0')}.enc`;
const qi = (n) => '"' + String(n).replace(/"/g, '""') + '"';

export function secretsDepuisEnv(env = process.env) {
  return { bk: env.BACKUP_ENCRYPTION_KEY || '', jwt: env.JWT_SIGN_KEY || '' };
}

/** Valeur stockée → valeur SQLite (BLOB et entiers géants ont un emballage dans la sauvegarde). */
export function decodeValue(v) {
  if (Array.isArray(v)) return Uint8Array.from(v);   // v1 : BLOB tel que rendu par D1 (tableau d'octets)
  if (v && typeof v === 'object') {
    if (typeof v.$b64 === 'string') return b64decode(v.$b64);
    if (typeof v.$int === 'string') return BigInt(v.$int);
    throw new Error('valeur inattendue dans la sauvegarde : ' + JSON.stringify(v).slice(0, 40));
  }
  return v;
}

/** Lit le manifeste (v2) et rend la liste des noms de pages attendues. */
export async function lireManifeste(dossier, secrets) {
  const f = join(dossier, 'manifest.enc');
  if (!existsSync(f)) throw new Error('manifest.enc absent de ' + dossier + ' : sauvegarde incomplète (le manifeste est écrit en dernier)');
  const m = await decryptBlob(readFileSync(f, 'utf8'), secrets);
  if (m.kind !== 'manifest' || !Number.isInteger(m.parts) || !m.tables) throw new Error('manifeste invalide');
  return m;
}
export const pagesAttendues = (m) => Array.from({ length: m.parts }, (_, i) => nomPage(i));

/**
 * Charge une sauvegarde (dossier v2 ou fichier v1) et rend { format, date, manifest, schema, pages }
 * où `pages` est un itérateur asynchrone de { table, cols, rows } — une page à la fois en mémoire.
 * Chaque page est vérifiée : même date que le manifeste, bon numéro, bonne table (pas de page
 * échangée ni rejouée d'un autre jour), et le total par table doit égaler le manifeste.
 */
export async function ouvrirSauvegarde(source, secrets) {
  if (statSync(source).isDirectory()) {
    const m = await lireManifeste(source, secrets);
    const ordre = Object.entries(m.tables).filter(([, t]) => t.first >= 0).map(([nom, t]) => ({ nom, ...t }));
    const tableDePage = (n) => { const t = ordre.find((x) => n >= x.first && n <= x.last); return t ? t.nom : null; };
    async function* pages() {
      for (let n = 0; n < m.parts; n++) {
        const f = join(source, nomPage(n));
        if (!existsSync(f)) throw new Error('page manquante : ' + nomPage(n));
        const p = await decryptBlob(readFileSync(f, 'utf8'), secrets);
        if (p.date !== m.date || p.part !== n || p.table !== tableDePage(n)) {
          throw new Error(`page ${nomPage(n)} incohérente avec le manifeste (date ${p.date}, n° ${p.part}, table ${p.table})`);
        }
        yield { table: p.table, cols: p.cols, rows: p.rows };
      }
    }
    return { format: 2, date: m.date, manifest: m, schema: m.schema || [], pages: pages() };
  }
  // v1 : un seul blob { ts, version, tables: { nom: [ {col: val} ] | {error} } }
  const b = await decryptBlob(readFileSync(source, 'utf8'), secrets);
  const tables = {};
  for (const [nom, rows] of Object.entries(b.tables || {})) tables[nom] = { rows: Array.isArray(rows) ? rows.length : 0 };
  async function* pages() {
    for (const [nom, rows] of Object.entries(b.tables || {})) {
      if (!Array.isArray(rows) || !rows.length) continue;
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      yield { table: nom, cols, rows: rows.map((r) => cols.map((c) => (c in r ? r[c] : null))) };
    }
  }
  const failed = Object.entries(b.tables || {}).filter(([, r]) => !Array.isArray(r)).map(([n]) => n);
  return { format: 1, date: new Date(b.ts || 0).toISOString().slice(0, 10),
    manifest: { tables, failed, truncated: b.truncated || [] }, schema: [], pages: pages() };
}

/**
 * Colonnes où l'on peut écrire : `SELECT *` rend aussi les colonnes GÉNÉRÉES (ex. users.shard_id),
 * qu'on ne peut pas insérer — elles se recalculent seules. Une colonne sauvegardée qui n'existe pas
 * dans la table cible (schéma plus ancien que la sauvegarde) arrête tout : jamais de perte muette.
 */
export function colonnesInserables(db, table, cols) {
  const info = db.prepare(`PRAGMA table_xinfo(${qi(table)})`).all();
  if (!info.length) throw new Error(`table ${table} absente de la base cible`);
  const normales = new Set(info.filter((c) => Number(c.hidden) === 0).map((c) => c.name));
  const generees = new Set(info.filter((c) => Number(c.hidden) !== 0).map((c) => c.name));
  const garder = [];
  cols.forEach((c, i) => {
    if (normales.has(c)) garder.push(i);
    else if (!generees.has(c)) throw new Error(`colonne ${table}.${c} absente de la base cible (schéma plus ancien que la sauvegarde ?)`);
  });
  return garder;
}

function creerSchema(db, schema, phase) {
  for (const o of schema) {
    const estTable = o.type === 'table';
    if ((phase === 'tables') !== estTable) continue;
    db.exec(o.sql);
  }
}

/**
 * Reconstruit une base SQLite. `db` = DatabaseSync ouverte (vide) ou `dbPath`.
 * Schéma : celui de la sauvegarde (v2) ; sinon (v1, ou --migrations) les migrations du dépôt.
 * Rend { ok, tables: { nom: { attendu, restaure } }, ecarts: [...] }.
 */
export async function restaurerSqlite({ source, secrets, db, dbPath, migrationsDir = null, schemaDepuisMigrations = false }) {
  const base = db || new DatabaseSync(dbPath);
  const bk = await ouvrirSauvegarde(source, secrets);
  const parMigrations = schemaDepuisMigrations || !bk.schema.length;
  base.exec('PRAGMA foreign_keys = OFF');
  if (parMigrations) {
    const r = await appliquer(executeurSqlite(base), migrationsDir || MIGRATIONS_PAR_DEFAUT);
    if (!r.ok) throw new Error('migrations : ' + r.erreur);
    // Les graines des migrations (comptes, conversations de départ) ne sont PAS la vérité :
    // la sauvegarde l'est. On vide chaque table sauvegardée avant d'y verser ses lignes.
    for (const t of Object.keys(bk.manifest.tables)) {
      if (base.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)) base.exec(`DELETE FROM ${qi(t)}`);
    }
  } else creerSchema(base, bk.schema, 'tables');
  const restaures = {};
  base.exec('BEGIN');
  try {
    for await (const p of bk.pages) {
      const idx = colonnesInserables(base, p.table, p.cols);
      const st = base.prepare(`INSERT INTO ${qi(p.table)} (${idx.map((i) => qi(p.cols[i])).join(', ')}) VALUES (${idx.map(() => '?').join(', ')})`);
      for (const row of p.rows) st.run(...idx.map((i) => decodeValue(row[i])));
      restaures[p.table] = (restaures[p.table] || 0) + p.rows.length;
    }
    base.exec('COMMIT');
  } catch (e) {
    base.exec('ROLLBACK');
    throw e;
  }
  // Index, vues, déclencheurs APRÈS les données : un déclencheur ne doit pas réécrire ce qu'on restaure.
  if (!parMigrations) creerSchema(base, bk.schema, 'reste');
  return { ...verifier(base, bk.manifest), format: bk.format, date: bk.date, schema: parMigrations ? 'migrations' : 'sauvegarde' };
}

/** Compte les lignes de chaque table et compare au manifeste. */
export function verifier(db, manifest) {
  const tables = {}; const ecarts = [];
  for (const [nom, t] of Object.entries(manifest.tables)) {
    let n = null;
    try { n = Number(db.prepare(`SELECT COUNT(*) AS c FROM ${qi(nom)}`).get().c); } catch (_) { n = null; }
    tables[nom] = { attendu: t.rows, restaure: n };
    if (n !== t.rows) ecarts.push(`${nom} : ${n} ligne(s) au lieu de ${t.rows}`);
  }
  return { ok: ecarts.length === 0 && !(manifest.failed || []).length && !(manifest.truncated || []).length, tables, ecarts,
    failed: manifest.failed || [], truncated: manifest.truncated || [] };
}

/** Littéral SQL (pour un fichier exécutable par `wrangler d1 execute --file`). */
export function litteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Uint8Array) return "X'" + Buffer.from(v).toString('hex') + "'";
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('nombre non fini'); return String(v); }
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** Écrit un fichier SQL : schéma (tables), données, puis index/vues/déclencheurs. */
export async function ecrireSql({ source, secrets, sortie }) {
  const bk = await ouvrirSauvegarde(source, secrets);
  if (!bk.schema.length) throw new Error('sauvegarde sans schéma (v1) : restaurer d\'abord en SQLite (--sqlite) avec les migrations');
  writeFileSync(sortie, '-- Restauration Apex Chat ' + bk.date + ' (généré par tools/backup-restore.mjs)\nPRAGMA defer_foreign_keys = true;\n');
  for (const o of bk.schema.filter((x) => x.type === 'table')) appendFileSync(sortie, o.sql + ';\n');
  const lignes = {};
  const brouillon = new DatabaseSync(':memory:');   // le schéma seul, pour connaître les colonnes générées
  for (const o of bk.schema.filter((x) => x.type === 'table')) brouillon.exec(o.sql);
  for await (const p of bk.pages) {
    const idx = colonnesInserables(brouillon, p.table, p.cols);
    const tete = `INSERT INTO ${qi(p.table)} (${idx.map((i) => qi(p.cols[i])).join(', ')}) VALUES `;
    let bloc = '';
    for (const row of p.rows) bloc += tete + '(' + idx.map((i) => litteral(decodeValue(row[i]))).join(', ') + ');\n';
    appendFileSync(sortie, bloc);
    lignes[p.table] = (lignes[p.table] || 0) + p.rows.length;
  }
  for (const o of bk.schema.filter((x) => x.type !== 'table')) appendFileSync(sortie, o.sql + ';\n');
  return { date: bk.date, lignes };
}

function rapport(r) {
  for (const [nom, t] of Object.entries(r.tables)) console.log(`${t.restaure === t.attendu ? 'ok ' : 'KO '} ${nom.padEnd(32)} ${t.restaure} / ${t.attendu}`);
  if (r.failed.length) console.log('tables illisibles lors de la sauvegarde : ' + r.failed.length);
  if (r.truncated.length) console.log('tables tronquées lors de la sauvegarde : ' + r.truncated.join(', '));
  console.log(r.ok ? `RESTAURATION OK — ${Object.keys(r.tables).length} tables, schéma depuis ${r.schema}` : 'RESTAURATION INCOMPLÈTE : ' + r.ecarts.join(' ; '));
}

async function main(argv) {
  const source = argv[0];
  const opt = (n) => { const i = argv.indexOf(n); return i > 0 ? argv[i + 1] : null; };
  const secrets = secretsDepuisEnv();
  if (!source || (!secrets.bk && !secrets.jwt)) {
    console.error('usage : BACKUP_ENCRYPTION_KEY=… node tools/backup-restore.mjs <dossier|fichier v1> [--list-parts] [--sqlite base.db] [--sql sortie.sql] [--migrations dossier]');
    return 2;
  }
  if (argv.includes('--list-parts')) {
    const m = await lireManifeste(source, secrets);
    for (const p of pagesAttendues(m)) console.log(p);
    return 0;
  }
  if (opt('--sql')) {
    const r = await ecrireSql({ source, secrets, sortie: opt('--sql') });
    console.log(`fichier SQL écrit (${r.date}) : ` + Object.entries(r.lignes).map(([t, n]) => `${t}=${n}`).join(' '));
    return 0;
  }
  const dbPath = opt('--sqlite') || ':memory:';
  const r = await restaurerSqlite({ source, secrets, dbPath, migrationsDir: opt('--migrations'), schemaDepuisMigrations: argv.includes('--migrations') });
  rapport(r);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('ÉCHEC : ' + ((e && e.message) || e)); process.exit(1); });
}
