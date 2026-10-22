// @vitest-environment node
/**
 * Lot E2 (audit A5, F7) — migrations D1 : un journal, chaque fichier UNE fois, arrêt au premier échec.
 *
 * Tout sur une VRAIE SQLite :
 *  - base neuve : les 26 fichiers appliqués, journal complet, schéma identique à l'ancien procédé ;
 *  - rejeu : rien ne repart (les migrations de DONNÉES 0014/0015 et les graines 0001 non plus) ;
 *  - amorçage sur une base « prod » sans journal : fichiers anciens notés sans être rejoués ;
 *    effet manquant → fichier appliqué instruction par instruction ;
 *  - le défaut d'origine : fichier « ALTER déjà fait + CREATE ajouté plus tard » → le CREATE est
 *    VRAIMENT appliqué (l'ancien déploiement le déclarait « ok » sans l'exécuter) ;
 *  - premier vrai échec → arrêt, fichier annulé en entier, suivants non appliqués ;
 *  - fichier appliqué puis modifié → refus ; ordre indépendant de la locale.
 * Et l'ÉTAPE SHELL du workflow de déploiement, extraite du YAML et jouée avec un faux `wrangler`.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { appliquer, executeurSqlite, decouper, effet, listerMigrations, checksum, JOURNAL, AMORCE_JUSQUA, executeurWrangler } from '../../tools/d1-migrations-runner.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(ICI, '..', '..');
const MIG = join(APP, 'd1-migrations');
const RACINE = resolve(APP, '..');

const journal = (db) => db.prepare(`SELECT filename, checksum, mode FROM ${JOURNAL} ORDER BY filename`).all().map((r) => ({ ...r }));
const schema = (db) => db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> '_migrations' ORDER BY type, name").all().map((r) => ({ ...r }));
/** L'ancien procédé : chaque fichier exécuté tel quel, erreurs ignorées (= une base de prod d'avant le journal). */
// jusqua : une base de prod d'AVANT le journal n'a que les fichiers de cette époque (≤ AMORCE_JUSQUA) ; les suivants
// (ex. 0028 : ALTER TABLE … ADD COLUMN, non rejouable) arrivent ensuite par le journal.
function ancienneBase(jusqua) {
  const db = new DatabaseSync(':memory:');
  for (const f of listerMigrations(MIG)) { if (jusqua && f > jusqua) continue; try { db.exec(readFileSync(join(MIG, f), 'utf8')); } catch (_) { /* rejoué */ } }
  return db;
}
function dossier(fichiers) {
  const d = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const [n, t] of Object.entries(fichiers)) writeFileSync(join(d, n), t);
  return d;
}

describe('journal des migrations sur une vraie SQLite', () => {
  it('base neuve : tout appliqué une fois, journal complet, même schéma que l\'ancien procédé', async () => {
    const db = new DatabaseSync(':memory:');
    const r = await appliquer(executeurSqlite(db), MIG);
    const fichiers = listerMigrations(MIG);
    expect(r.ok).toBe(true);
    expect(r.amorcage).toBe(false);
    expect(fichiers).toContain('0021_lot_e2_journal_migrations.sql');
    expect(r.appliquees.map((a) => a.fichier)).toEqual(fichiers);
    expect(r.appliquees.every((a) => a.mode === 'complet')).toBe(true);
    expect(journal(db)).toEqual(fichiers.map((f) => ({ filename: f, checksum: checksum(readFileSync(join(MIG, f), 'utf8')), mode: 'complet' })));
    expect(schema(db)).toEqual(schema(ancienneBase()));
  });

  it('rejeu : rien ne repart — ni les migrations de données (0014), ni les graines (0001)', async () => {
    const db = new DatabaseSync(':memory:');
    await appliquer(executeurSqlite(db), MIG);
    db.exec("UPDATE users SET prekey_signed='GSIG1:cle-publiee' WHERE id='kdmc_admin'");
    db.exec("DELETE FROM users WHERE id='user_laurence'");   // un compte effacé ne doit pas « revenir »
    const r = await appliquer(executeurSqlite(db), MIG);
    expect(r).toMatchObject({ ok: true, appliquees: [], ignorees: listerMigrations(MIG).length });
    expect(db.prepare("SELECT prekey_signed p FROM users WHERE id='kdmc_admin'").get().p).toBe('GSIG1:cle-publiee');
    expect(db.prepare("SELECT COUNT(*) c FROM users WHERE id='user_laurence'").get().c).toBe(0);
    // l'ancien procédé, lui, rejouait 0014 et ressuscitait la graine : la différence est réelle
    const vieux = ancienneBase();
    vieux.exec("UPDATE users SET prekey_signed='GSIG1:cle-publiee' WHERE id='kdmc_admin'");
    vieux.exec("DELETE FROM users WHERE id='user_laurence'");
    for (const f of listerMigrations(MIG)) { try { vieux.exec(readFileSync(join(MIG, f), 'utf8')); } catch (_) { /* */ } }
    expect(vieux.prepare("SELECT prekey_signed p FROM users WHERE id='kdmc_admin'").get().p).toBe('PENDING_PQXDH');
    expect(vieux.prepare("SELECT COUNT(*) c FROM users WHERE id='user_laurence'").get().c).toBe(1);
  });

  it('amorçage d\'une base en service sans journal : fichiers anciens notés SANS être rejoués, les nouveaux exécutés', async () => {
    const db = ancienneBase(AMORCE_JUSQUA);
    db.exec("UPDATE users SET prekey_signed='GSIG1:x' WHERE id='kdmc_admin'");
    const r = await appliquer(executeurSqlite(db), MIG);
    expect(r.ok).toBe(true);
    expect(r.amorcage).toBe(true);
    const modes = Object.fromEntries(r.appliquees.map((a) => [a.fichier, a.mode]));
    for (const f of listerMigrations(MIG)) expect(modes[f], f).toBe(f <= AMORCE_JUSQUA ? 'amorce' : 'complet');
    expect(db.prepare("SELECT prekey_signed p FROM users WHERE id='kdmc_admin'").get().p).toBe('GSIG1:x');   // 0014 non rejouée
  });

  it('amorçage avec un effet MANQUANT : le fichier est rejoué instruction par instruction (ALTER déjà faits tolérés)', async () => {
    const db = ancienneBase();
    db.exec('DROP INDEX idx_inv_magic');   // effet de 0002, perdu
    const r = await appliquer(executeurSqlite(db), MIG);
    expect(r.ok).toBe(true);
    expect(r.appliquees.find((a) => a.fichier === '0002_admin_features.sql').mode).toBe('instruction');
    expect(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name='idx_inv_magic'").get().c).toBe(1);
  });

  it('LE défaut d\'origine : « ALTER déjà fait » + instruction ajoutée plus tard → elle est VRAIMENT appliquée', async () => {
    const d = dossier({ '0001_a.sql': 'CREATE TABLE t (id TEXT);\n', '0002_b.sql': 'ALTER TABLE t ADD COLUMN c TEXT;\n' });
    const db = new DatabaseSync(':memory:');
    try {
      expect((await appliquer(executeurSqlite(db), d)).ok).toBe(true);
      // Plus tard, quelqu'un AJOUTE une instruction à un fichier déjà appliqué ailleurs (journal perdu ici) :
      db.exec(`DELETE FROM ${JOURNAL} WHERE filename='0002_b.sql'`);
      writeFileSync(join(d, '0002_b.sql'), 'ALTER TABLE t ADD COLUMN c TEXT;\nCREATE TABLE ajoutee_plus_tard (x INTEGER);\nINSERT INTO ajoutee_plus_tard VALUES (42);\n');
      const r = await appliquer(executeurSqlite(db), d);
      expect(r.ok).toBe(true);
      expect(r.appliquees).toEqual([{ fichier: '0002_b.sql', mode: 'instruction' }]);
      expect(db.prepare('SELECT x FROM ajoutee_plus_tard').all().map((x) => x.x)).toEqual([42]);
      // l'ancien procédé : le fichier échoue sur l'ALTER, est annulé… et était déclaré « ok »
      const vieux = new DatabaseSync(':memory:');
      vieux.exec('CREATE TABLE t (id TEXT, c TEXT)');
      vieux.exec('BEGIN');
      let sortie = '';
      try { vieux.exec(readFileSync(join(d, '0002_b.sql'), 'utf8')); vieux.exec('COMMIT'); } catch (e) { vieux.exec('ROLLBACK'); sortie = e.message; }
      expect(sortie).toMatch(/duplicate column/);   // → « déjà appliquée — ok » dans l'ancien workflow
      expect(vieux.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name='ajoutee_plus_tard'").get().c).toBe(0);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('premier VRAI échec → arrêt : fichier annulé en entier, suivants non appliqués, rien noté', async () => {
    const d = dossier({
      '0001_ok.sql': 'CREATE TABLE a (x);',
      '0002_ko.sql': 'CREATE TABLE b (x);\nINSERT INTO table_inexistante VALUES (1);',
      '0003_apres.sql': 'CREATE TABLE c (x);',
    });
    const db = new DatabaseSync(':memory:');
    try {
      const r = await appliquer(executeurSqlite(db), d);
      expect(r.ok).toBe(false);
      expect(r.fichier).toBe('0002_ko.sql');
      expect(r.erreur).toMatch(/no such table/);
      expect(journal(db).map((j) => j.filename)).toEqual(['0001_ok.sql']);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('a','b','c')").all().map((t) => t.name);
      expect(tables).toEqual(['a']);   // b annulée (atomique), c jamais tentée
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('« duplicate column » ne couvre QUE l\'instruction qui crée cet objet : une autre erreur arrête tout', async () => {
    const d = dossier({ '0001_a.sql': 'CREATE TABLE t (id TEXT, c TEXT);', '0002_b.sql': 'ALTER TABLE t ADD COLUMN c TEXT;\nALTER TABLE autre ADD COLUMN z TEXT;' });
    const db = new DatabaseSync(':memory:');
    try {
      const r = await appliquer(executeurSqlite(db), d);
      expect(r).toMatchObject({ ok: false, fichier: '0002_b.sql' });
      expect(r.erreur).toMatch(/no such table: autre/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('fichier appliqué puis MODIFIÉ → refus (on ajoute une migration, on ne réécrit pas l\'histoire)', async () => {
    const d = dossier({ '0001_a.sql': 'CREATE TABLE t (id TEXT);', '0002_b.sql': 'CREATE TABLE u (id TEXT);' });
    const db = new DatabaseSync(':memory:');
    try {
      await appliquer(executeurSqlite(db), d);
      writeFileSync(join(d, '0001_a.sql'), 'CREATE TABLE t (id TEXT); -- retouche');
      writeFileSync(join(d, '0003_c.sql'), 'CREATE TABLE v (id TEXT);');
      const r = await appliquer(executeurSqlite(db), d);
      expect(r.ok).toBe(false);
      expect(r.erreur).toMatch(/MODIFIÉE après avoir été appliquée/);
      expect(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name='v'").get().c).toBe(0);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('ordre stable sans locale (deux fichiers 0013_*) et découpage SQL sûr', () => {
    const d = dossier({ '0013_users_signing_key.sql': '', '0013_users_claimed_at.sql': '', '0006g_x.sql': '', '0006a_x.sql': '', 'README.md': '', '0002_y.sql': '' });
    try {
      expect(listerMigrations(d)).toEqual(['0002_y.sql', '0006a_x.sql', '0006g_x.sql', '0013_users_claimed_at.sql', '0013_users_signing_key.sql']);
    } finally { rmSync(d, { recursive: true, force: true }); }
    expect(decouper("INSERT INTO t VALUES ('a;b', \"c;\"); -- x; y\n/* z; */ SELECT 1;")).toEqual(["INSERT INTO t VALUES ('a;b', \"c;\")", 'SELECT 1']);
    expect(decouper("CREATE TRIGGER tr AFTER INSERT ON t BEGIN UPDATE t SET a = CASE WHEN 1 THEN 2 END; DELETE FROM u; END; SELECT 2"))
      .toEqual(['CREATE TRIGGER tr AFTER INSERT ON t BEGIN UPDATE t SET a = CASE WHEN 1 THEN 2 END; DELETE FROM u; END', 'SELECT 2']);
    expect(effet('ALTER TABLE users ADD COLUMN x TEXT')).toEqual({ type: 'colonne', table: 'users', nom: 'x' });
    expect(effet('CREATE UNIQUE INDEX IF NOT EXISTS i ON t(a)')).toEqual({ type: 'index', nom: 'i' });
    expect(effet('CREATE VIEW v AS SELECT 1')).toEqual({ type: 'view', nom: 'v' });
    expect(effet("UPDATE users SET a='b'")).toBeNull();
  });
});

describe('transport D1 distant (faux wrangler) et étape shell du workflow de déploiement', () => {
  function fauxPath() {
    const bin = mkdtempSync(join(tmpdir(), 'faux-bin-'));
    const w = join(bin, 'wrangler');
    writeFileSync(w, `#!/bin/sh\nexec "${process.execPath}" --no-warnings "${join(ICI, '_support', 'faux-wrangler.mjs')}" "$@"\n`);
    chmodSync(w, 0o755);
    return bin;
  }
  /** Le bloc `run: |` d'une étape, tel que GitHub le donnera à bash. */
  function etape(yml, nom) {
    const lignes = readFileSync(join(RACINE, '.github/workflows', yml), 'utf8').split('\n');
    const i = lignes.findIndex((l) => l.includes('- name: ' + nom));
    expect(i, 'étape « ' + nom + ' » introuvable dans ' + yml).toBeGreaterThan(-1);
    const r = lignes.findIndex((l, k) => k > i && /^\s+run: \|\s*$/.test(l));
    const marge = lignes[r].length - lignes[r].trimStart().length;
    const corps = [];
    for (let k = r + 1; k < lignes.length; k++) {
      const l = lignes[k];
      if (l.trim() && l.length - l.trimStart().length <= marge) break;
      corps.push(l);
    }
    const min = Math.min(...corps.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
    return corps.map((l) => l.slice(min)).join('\n');
  }
  function jouer(script, env) {
    return spawnSync('bash', ['-e', '-c', script], { cwd: join(APP, 'workers'), env: { ...process.env, ...env }, encoding: 'utf8' });
  }

  it('l\'étape « Apply D1 migrations » du workflow, jouée en bash : journal posé, rejeu à vide, échec = sortie ≠ 0', () => {
    const bin = fauxPath();
    const tmp = mkdtempSync(join(tmpdir(), 'faux-d1-'));
    const base = join(tmp, 'd1.sqlite');
    const resume = join(tmp, 'summary.md');
    const appels = join(tmp, 'appels.jsonl');
    const env = { PATH: bin + ':' + process.env.PATH, FAUX_D1: base, GITHUB_STEP_SUMMARY: resume, FAUX_WRANGLER_JOURNAL: appels, D1_MIGRATIONS_PAUSE: '0' };
    const script = etape('deploy-apex-chat.yml', 'Apply D1 migrations');
    expect(script).toMatch(/node \.\.\/tools\/d1-migrations-runner\.mjs --remote apex-chat-main/);
    try {
      // 1) base de prod d'AVANT le journal (ancien procédé) → amorçage
      const prod = new DatabaseSync(base);
      for (const f of listerMigrations(MIG)) { if (f > AMORCE_JUSQUA) continue; try { prod.exec(readFileSync(join(MIG, f), 'utf8')); } catch (_) { /* */ } }
      prod.close();
      let r = jouer(script, env);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/::notice::Migrations D1 : \d+ appliquée\(s\).*amorçage du journal/);
      expect(readFileSync(resume, 'utf8')).toMatch(/Signet D1 avant migrations : `00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683`/);
      const db = new DatabaseSync(base);
      expect(journal(db).length).toBe(listerMigrations(MIG).length);
      db.close();
      // 2) rejeu : rien n'est exécuté en --file (aucune migration ne repart)
      writeFileSync(appels, '');
      r = jouer(script, env);
      expect(r.status).toBe(0);
      const fichiers = readFileSync(appels, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((a) => a.includes('--file'));
      expect(fichiers.length).toBe(1);   // seul le CREATE TABLE IF NOT EXISTS du journal
      // 3) une nouvelle migration cassée → l'étape échoue (le worker ne serait pas déployé), annotation lisible
      const migs = mkdtempSync(join(tmpdir(), 'migs-'));
      for (const f of listerMigrations(MIG)) writeFileSync(join(migs, f), readFileSync(join(MIG, f)));
      writeFileSync(join(migs, '0099_cassee.sql'), 'CREATE TABLE z (x);\nINSERT INTO nulle_part VALUES (1);');
      writeFileSync(join(migs, '0100_apres.sql'), 'CREATE TABLE apres (x);');
      r = jouer(script.replace('--dir ../d1-migrations', '--dir ' + migs), env);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toMatch(/::error title=Migration 0099_cassee\.sql ÉCHOUÉE::.*no such table: nulle_part/);
      const db2 = new DatabaseSync(base);
      expect(db2.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name IN ('z','apres')").get().c).toBe(0);
      db2.close();
      rmSync(migs, { recursive: true, force: true });
    } finally { rmSync(tmp, { recursive: true, force: true }); rmSync(bin, { recursive: true, force: true }); }
  }, 120000);   // ~1 processus `wrangler` (faux) par requête : quelques dizaines de secondes

  it('panne PASSAGÈRE de l\'API D1 : nouvel essai, puis succès (et une erreur réelle n\'est pas réessayée)', async () => {
    const bin = fauxPath();
    const tmp = mkdtempSync(join(tmpdir(), 'faux-d1-'));
    const pannes = join(tmp, 'pannes');
    const oldPath = process.env.PATH;
    process.env.PATH = bin + ':' + oldPath;
    process.env.FAUX_D1 = join(tmp, 'd1.sqlite');
    process.env.FAUX_PANNES_FICHIER = pannes;
    const pauses = [];
    try {
      writeFileSync(pannes, '1');
      const d = dossier({ '0001_a.sql': 'CREATE TABLE a (x);' });
      const ex = executeurWrangler('apex-chat-main', { pause: (s) => pauses.push(s) });
      const r = await appliquer(ex, d);
      expect(r.ok).toBe(true);
      expect(pauses.length).toBe(1);
      writeFileSync(join(d, '0002_b.sql'), 'INSERT INTO nulle_part VALUES (1);');
      const r2 = await appliquer(ex, d);
      expect(r2.ok).toBe(false);
      expect(pauses.length).toBe(1);   // « no such table » n'est pas passager : pas de 2e essai
      ex.nettoyer();
      rmSync(d, { recursive: true, force: true });
    } finally {
      process.env.PATH = oldPath; delete process.env.FAUX_D1; delete process.env.FAUX_PANNES_FICHIER;
      rmSync(tmp, { recursive: true, force: true }); rmSync(bin, { recursive: true, force: true });
    }
  }, 60000);
});
