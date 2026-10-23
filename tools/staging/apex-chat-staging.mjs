#!/usr/bin/env node
/**
 * Staging d'Apex Chat (tâche 33, 23.10.2026) : la base de TEST — jamais la production.
 *   schema        applique les migrations 0001→0028 (journal _migrations, comme le déploiement) puis note l'état de référence
 *   seed          3 comptes jetables « test-audit-… » + 1 conversation + 1 groupe + des messages (chiffrés factices)
 *   compter       nombre de lignes par table (avant / après)
 *   figer         note l'état de RÉFÉRENCE (après `schema` : les comptes système et réglages que les migrations posent eux-mêmes)
 *   reset         supprime tout ce qui a été ajouté depuis la référence, puis relit : « aucune trace »
 *   aucune-trace  échoue (code 1) s'il reste une ligne ajoutée OU si une ligne de référence a changé (empreinte)
 * Garde-fous : le nom de la base DOIT commencer par « staging- » ; l'identifiant de la base de production est refusé.
 * Distant : node tools/staging/apex-chat-staging.mjs <action> --remote staging-apex-chat   (wrangler du PATH, dossier courant = celui du wrangler.toml staging)
 * Local   : node tools/staging/apex-chat-staging.mjs <action> --sqlite fichier.db          (essai à blanc, vraie SQLite)
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PROD_ID = 'afee673e-83e9-4ae3-a578-96fabbfdd023';
export const GARDES = new Set(['_migrations', 'sqlite_sequence', '_cf_KV']);

export function verifierNom(nom) {
  if (!/^staging-[a-z0-9-]+$/.test(String(nom || ''))) throw new Error(`refusé : « ${nom} » n'est pas une base de staging (nom attendu : staging-…)`);
  if (String(nom).includes(PROD_ID)) throw new Error('refusé : identifiant de la base de production');
  return nom;
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Instructions SQL du jeu de données de test. `jeton` = suffixe aléatoire commun (3 comptes). */
export function sqlSeed(jeton = randomBytes(3).toString('hex'), maintenant = Date.now()) {
  const comptes = ['a', 'b', 'c'].map((l, i) => ({
    id: `staging_test-audit-${jeton}${l}`,
    uid: `test-audit-${jeton}${l}`,
    pseudo: `testaudit${jeton}${l}`,
    nom: `Test Audit ${l.toUpperCase()}`,
    tel: `+3360000${String(i + 1).padStart(4, '0')}`,
  }));
  const k = (c) => 'STAGING-' + c.id;
  const sql = [];
  for (const c of comptes) {
    sql.push(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, created_at, identity_key_pub, pq_key_pub, prekey_signed, kdmc_uid, source, status) VALUES (${lit(c.id)}, ${lit(c.pseudo)}, ${lit(c.nom)}, ${lit(c.tel)}, ${lit('h-' + c.id)}, ${maintenant}, ${lit(k(c))}, ${lit(k(c))}, ${lit(k(c))}, ${lit(c.uid)}, 'staging', 'active')`);
  }
  const [a, b, c] = comptes;
  const dm = `staging_dm-${jeton}`;
  const gr = `staging_gr-${jeton}`;
  sql.push(`INSERT INTO conversations (id, type, created_by, created_at, sharded_to_do, member_count) VALUES (${lit(dm)}, 'dm', ${lit(a.id)}, ${maintenant}, ${lit('do-' + dm)}, 2)`);
  sql.push(`INSERT INTO conversations (id, type, name, created_by, created_at, sharded_to_do, member_count) VALUES (${lit(gr)}, 'group', 'Groupe de test', ${lit(a.id)}, ${maintenant}, ${lit('do-' + gr)}, 3)`);
  for (const [conv, membres] of [[dm, [a, b]], [gr, [a, b, c]]]) for (const m of membres) sql.push(`INSERT INTO conversation_members (conv_id, user_id, role, joined_at) VALUES (${lit(conv)}, ${lit(m.id)}, 'member', ${maintenant})`);
  for (let i = 0; i < 4; i++) {
    const conv = i < 2 ? dm : gr;
    sql.push(`INSERT INTO messages (id, conv_id, sender_id, ciphertext, ts) VALUES (${lit(`staging_m-${jeton}-${i}`)}, ${lit(conv)}, ${lit((i % 2 ? b : a).id)}, ${lit('E2EM1:factice-' + i)}, ${maintenant + i})`);
  }
  return { sql, comptes: comptes.map((x) => x.uid), jeton };
}

export function sqlTables() { return "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"; }

/** Exécuteurs : { all(sql) → lignes, run(sql | [sql…]) }. */
export function executeurSqlite(db) {
  return { all: async (s) => db.prepare(s).all(), run: async (s) => { for (const x of [].concat(s)) db.exec(x); } };
}
export function executeurWrangler(base, { wrangler = process.env.WRANGLER_BIN || 'wrangler' } = {}) {
  const sh = (args) => execFileSync(wrangler, ['d1', 'execute', base, '--remote', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  return {
    all: async (s) => { const o = JSON.parse(sh(['--json', '--command', s])); return (o[0] && o[0].results) || []; },
    run: async (s) => { for (const x of [].concat(s)) sh(['--command', x]); },
  };
}

export const BASE = '_staging_base';

export async function compter(ex) {
  const out = {};
  for (const { name } of await ex.all(sqlTables())) {
    if (GARDES.has(name) || name === BASE) continue;
    const r = await ex.all(`SELECT count(*) AS n FROM "${name}"`);
    out[name] = Number(r[0].n);
  }
  return out;
}
export const total = (o) => Object.values(o).reduce((s, n) => s + n, 0);

const tablesDonnees = async (ex) => (await ex.all(sqlTables())).map((t) => t.name).filter((n) => !GARDES.has(n) && n !== BASE);
const empreinte = (lignes) => createHash('sha256').update(JSON.stringify(lignes)).digest('hex');

const sansRowid = async (ex, t) => /WITHOUT\s+ROWID/i.test(String((await ex.all(`SELECT sql FROM sqlite_master WHERE name=${lit(t)}`))[0]?.sql || ''));

/** Note, pour chaque table, le plus grand rowid et l'empreinte des lignes présentes : c'est l'état « propre ».
 *  Table WITHOUT ROWID : max_rowid = -1, l'empreinte porte sur toutes les lignes (verrous, vides à la référence). Tout ou rien. */
export async function figer(ex) {
  const lignes = [];
  for (const t of await tablesDonnees(ex)) {
    if (await sansRowid(ex, t)) {
      lignes.push(`INSERT INTO ${BASE} (tbl, max_rowid, empreinte) VALUES (${lit(t)}, -1, ${lit(empreinte(await ex.all(`SELECT * FROM "${t}"`)))})`);
      continue;
    }
    const max = Number((await ex.all(`SELECT coalesce(max(rowid),0) AS m FROM "${t}"`))[0].m);
    lignes.push(`INSERT INTO ${BASE} (tbl, max_rowid, empreinte) VALUES (${lit(t)}, ${max}, ${lit(empreinte(await ex.all(`SELECT * FROM "${t}" ORDER BY rowid`)))})`);
  }
  await ex.run([`CREATE TABLE IF NOT EXISTS ${BASE} (tbl TEXT PRIMARY KEY, max_rowid INTEGER NOT NULL, empreinte TEXT NOT NULL)`, `DELETE FROM ${BASE}`, ...lignes]);
}

async function reference(ex) {
  const ref = await ex.all(`SELECT tbl, max_rowid, empreinte FROM ${BASE}`).catch(() => []);
  const attendues = await tablesDonnees(ex);
  if (!ref.length) throw new Error("pas d'état de référence : lancer `figer` après `schema`");
  const manque = attendues.filter((t) => !ref.some((r) => r.tbl === t));
  if (manque.length) throw new Error('état de référence incomplet (tables absentes : ' + manque.join(', ') + ') : relancer `schema`');
  return ref;
}

/** Écarts avec la référence : lignes ajoutées (par table) et tables dont une ligne de référence a changé. */
export async function ecarts(ex) {
  const ajoutees = {}; const modifiees = [];
  for (const { tbl, max_rowid: max, empreinte: h } of await reference(ex)) {
    if (Number(max) < 0) {
      const toutes = await ex.all(`SELECT * FROM "${tbl}"`);
      if (empreinte(toutes) !== h) { if (toutes.length) ajoutees[tbl] = toutes.length; else modifiees.push(tbl); }
      continue;
    }
    const n = Number((await ex.all(`SELECT count(*) AS n FROM "${tbl}" WHERE rowid > ${Number(max)}`))[0].n);
    if (n) ajoutees[tbl] = n;
    if (empreinte(await ex.all(`SELECT * FROM "${tbl}" WHERE rowid <= ${Number(max)} ORDER BY rowid`)) !== h) modifiees.push(tbl);
  }
  return { ajoutees, modifiees };
}

export async function reset(ex) {
  for (const { tbl, max_rowid: max } of await reference(ex)) {
    if (Number(max) < 0) {
      /* sans rowid : seule une table vide à la référence peut être remise à zéro sans ambiguïté */
      const vide = empreinte([]);
      const ref = (await ex.all(`SELECT empreinte FROM ${BASE} WHERE tbl=${lit(tbl)}`))[0].empreinte;
      if (ref === vide) await ex.run(`DELETE FROM "${tbl}"`);
      continue;
    }
    await ex.run(`DELETE FROM "${tbl}" WHERE rowid > ${Number(max)}`);
  }
  return ecarts(ex);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const action = argv[0];
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  let ex; let nom;
  if (opt('--sqlite')) { const { DatabaseSync } = await import('node:sqlite'); ex = executeurSqlite(new DatabaseSync(opt('--sqlite'))); nom = 'staging-local'; }
  else if (opt('--remote')) { nom = verifierNom(opt('--remote')); ex = executeurWrangler(nom); }
  else { console.error('usage : apex-chat-staging.mjs (schema|seed|compter|reset|aucune-trace) (--remote staging-… | --sqlite fichier)'); return 2; }
  if (action === 'schema') {
    const runner = fileURLToPath(new URL('../../messaging-app/tools/d1-migrations-runner.mjs', import.meta.url));
    const dir = fileURLToPath(new URL('../../messaging-app/d1-migrations', import.meta.url));
    const args = opt('--sqlite') ? ['--sqlite', opt('--sqlite')] : ['--remote', nom];
    execFileSync('node', [runner, ...args, '--dir', dir], { stdio: 'inherit' });
    await figer(ex);
    console.log('état de référence noté après le schéma');
    return 0;
  }
  if (action === 'figer') { await figer(ex); console.log('état de référence noté : ' + JSON.stringify(await compter(ex))); return 0; }
  if (action === 'seed') { const { sql, comptes } = sqlSeed(); await ex.run(sql); console.log(`jeu de test posé : ${comptes.join(', ')}`); const e = await ecarts(ex); console.log('lignes ajoutées : ' + JSON.stringify(e.ajoutees)); return 0; }
  if (action === 'compter') { const c = await compter(ex); console.log(JSON.stringify(c)); console.log(`total : ${total(c)}`); const e = await ecarts(ex).catch(() => null); if (e) console.log(`ajoutées depuis la référence : ${total(e.ajoutees)}`); return 0; }
  if (action === 'reset') {
    const avant = await ecarts(ex); const apres = await reset(ex);
    console.log(`ajoutées avant : ${total(avant.ajoutees)} — après : ${total(apres.ajoutees)} ; lignes de référence modifiées : ${apres.modifiees.length}`);
    if (total(apres.ajoutees) !== 0 || apres.modifiees.length) { console.error('::error::traces restantes : ' + JSON.stringify(apres)); return 1; }
    return 0;
  }
  if (action === 'aucune-trace') { const e = await ecarts(ex); const ok = total(e.ajoutees) === 0 && e.modifiees.length === 0; console.log(ok ? 'aucune trace : 0 ligne ajoutée, 0 ligne de référence modifiée' : 'TRACES : ' + JSON.stringify(e)); return ok ? 0 : 1; }
  console.error('action inconnue : ' + action); return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().then((c) => process.exit(c), (e) => { console.error('::error::' + e.message); process.exit(1); });
