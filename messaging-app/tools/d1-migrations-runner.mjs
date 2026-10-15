#!/usr/bin/env node
/**
 * Applique les migrations D1 d'Apex Chat UNE SEULE FOIS chacune, dans l'ordre, avec un journal.
 *
 * Lot E2 (15.10.2026, audit A5 F7). Avant : `deploy-apex-chat.yml` rejouait les 25 fichiers à
 * chaque déploiement et classait « ok » toute sortie contenant « duplicate column ». Or D1
 * exécute un fichier de façon ATOMIQUE : un fichier qui commence par un ALTER déjà appliqué
 * échouait EN ENTIER, était annulé, puis déclaré « ok » — une instruction ajoutée plus tard à ce
 * fichier n'aurait JAMAIS été appliquée, en silence. Les migrations de données (0014 UPDATE,
 * 0015 DELETE) et les graines (0001 INSERT OR IGNORE) étaient rejouées à chaque fois. Un échec au
 * milieu n'arrêtait pas les suivantes.
 *
 * Maintenant :
 *  - table `_migrations (filename, checksum, applied_at, mode)` : un fichier noté n'est plus rejoué ;
 *    un fichier noté puis MODIFIÉ arrête tout (on ne réécrit pas une migration appliquée : on en
 *    ajoute une nouvelle) ;
 *  - ordre = tri par octets du nom (indépendant de la locale : deux fichiers 0013_* coexistent) ;
 *  - un fichier non noté est exécuté EN ENTIER, avec son inscription au journal dans le MÊME
 *    fichier (atomique côté D1 : tout ou rien) ;
 *  - s'il échoue sur « duplicate column / already exists », il est rejoué INSTRUCTION PAR
 *    INSTRUCTION : seule l'instruction qui crée ce qui existe déjà est tenue pour faite, toutes
 *    les autres s'exécutent vraiment ;
 *  - toute autre erreur (après 3 essais, pour les erreurs passagères de l'API D1) ARRÊTE la
 *    série : les fichiers suivants ne partent pas, le déploiement du worker non plus ;
 *  - amorçage (journal vide sur une base déjà en service) : un fichier ANTÉRIEUR au journal
 *    (≤ AMORCE_JUSQUA) dont TOUS les effets de schéma (tables, index, colonnes) existent déjà est
 *    noté « amorce » sans être rejoué — il a forcément tourné, l'ancien déploiement les rejouait
 *    tous. S'il manque un effet, il est appliqué instruction par instruction comme ci-dessus.
 *
 * Distant (déploiement) : node tools/d1-migrations-runner.mjs --remote apex-chat-main [--dir ../d1-migrations]
 *   → passe par `wrangler d1 execute` (le binaire `wrangler` du PATH).
 * Local : node tools/d1-migrations-runner.mjs --sqlite base.db
 * Garde : tests/unit/lot-e2-migrations-journal.test.js (vraie SQLite + faux wrangler).
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const JOURNAL = '_migrations';
export const JOURNAL_SQL = `CREATE TABLE IF NOT EXISTS ${JOURNAL} (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL, mode TEXT)`;
export const DEJA_LA = /duplicate column|already exists/i;
/** Amorçage : SEULS les fichiers qui existaient quand le journal est né (et que l'ancien déploiement
 *  rejouait tous, à chaque fois) peuvent être notés « déjà en place » sans être exécutés. Un fichier
 *  plus récent — même s'il ne contient que des données — s'exécute toujours vraiment. */
export const AMORCE_JUSQUA = '0018_lot_c2_muet_serveur.sql';

export const checksum = (txt) => createHash('sha256').update(txt, 'utf8').digest('hex');
/** Ordre stable : comparaison par unités de code, jamais par la locale (`sort` du shell). */
export function listerMigrations(dir) {
  return readdirSync(dir).filter((f) => /^\d{4}[a-z]?_[\w-]+\.sql$/.test(f)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/**
 * Découpe un fichier SQL en instructions (chaînes '…', identifiants "…", commentaires -- et
 * /* *\/, corps BEGIN…END des déclencheurs). Rend des instructions sans le `;` final.
 */
export function decouper(sql) {
  const out = []; let cur = ''; let i = 0; let profondeur = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i]; const d = sql[i + 1];
    if (c === '-' && d === '-') { const j = sql.indexOf('\n', i); i = j < 0 ? n : j + 1; cur += '\n'; continue; }
    if (c === '/' && d === '*') { const j = sql.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; cur += ' '; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < n; j++) { if (sql[j] === c) { if (sql[j + 1] === c) { j++; continue; } break; } }
      cur += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c) && !/[A-Za-z0-9_]/.test(sql[i - 1] || ' ')) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i, i + 40));
      const mot = m[0].toUpperCase();
      if (mot === 'BEGIN' && /CREATE\s+(TEMP\w*\s+)?TRIGGER/i.test(cur)) profondeur++;
      else if (mot === 'CASE' && profondeur > 0) profondeur++;
      else if (mot === 'END' && profondeur > 0) profondeur--;
      cur += m[0]; i += m[0].length; continue;
    }
    if (c === ';' && profondeur === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Effet de schéma vérifiable d'une instruction (null = instruction de données : invérifiable). */
export function effet(instr) {
  const s = instr.replace(/\s+/g, ' ').trim();
  let m = /^CREATE (?:TEMP(?:ORARY)? )?TABLE (?:IF NOT EXISTS )?["`]?(\w+)["`]?/i.exec(s);
  if (m) return { type: 'table', nom: m[1] };
  m = /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?["`]?(\w+)["`]?/i.exec(s);
  if (m) return { type: 'index', nom: m[1] };
  m = /^CREATE (?:TEMP(?:ORARY)? )?(VIEW|TRIGGER) (?:IF NOT EXISTS )?["`]?(\w+)["`]?/i.exec(s);
  if (m) return { type: m[1].toLowerCase(), nom: m[2] };
  m = /^ALTER TABLE ["`]?(\w+)["`]? ADD (?:COLUMN )?["`]?(\w+)["`]?/i.exec(s);
  if (m) return { type: 'colonne', table: m[1], nom: m[2] };
  return null;
}

async function effetPresent(ex, e) {
  if (e.type === 'colonne') {
    const cols = await ex.all(`PRAGMA table_info(${lit(e.table)})`);
    return cols.some((c) => String(c.name).toLowerCase() === e.nom.toLowerCase());
  }
  const r = await ex.all(`SELECT 1 AS x FROM sqlite_master WHERE type=${lit(e.type)} AND name=${lit(e.nom)}`);
  return r.length > 0;
}

/**
 * Le moteur, indépendant du transport. `ex` = { all(sql) → lignes, run(sql) → void|lève } où
 * run() d'un texte multi-instructions est ATOMIQUE (comme `wrangler d1 execute --file`).
 * Rend { ok, appliquees: [{fichier, mode}], ignorees, erreur?, fichier? }.
 */
export async function appliquer(ex, dir, { log = () => {}, maintenant = () => Date.now() } = {}) {
  await ex.run(JOURNAL_SQL);
  const notees = new Map((await ex.all(`SELECT filename, checksum FROM ${JOURNAL}`)).map((r) => [r.filename, r.checksum]));
  const baseEnService = !notees.size && (await ex.all("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='users'")).length > 0;
  const res = { ok: true, appliquees: [], ignorees: 0, amorcage: baseEnService };
  const noter = (f, sum, mode) => `INSERT INTO ${JOURNAL} (filename, checksum, applied_at, mode) VALUES (${lit(f)}, ${lit(sum)}, ${maintenant()}, ${lit(mode)})`;
  for (const f of listerMigrations(dir)) {
    const texte = readFileSync(join(dir, f), 'utf8');
    const sum = checksum(texte);
    if (notees.has(f)) {
      if (notees.get(f) !== sum) {
        return { ...res, ok: false, fichier: f, erreur: `${f} a été MODIFIÉE après avoir été appliquée (empreinte différente) : ajouter une nouvelle migration au lieu de réécrire celle-ci` };
      }
      res.ignorees++; continue;
    }
    const instrs = decouper(texte);
    if (baseEnService && f <= AMORCE_JUSQUA) {
      const effets = instrs.map(effet).filter(Boolean);
      let tous = true;
      for (const e of effets) { if (!(await effetPresent(ex, e))) { tous = false; break; } }
      if (tous) {
        await ex.run(noter(f, sum, 'amorce'));
        res.appliquees.push({ fichier: f, mode: 'amorce' }); log(`${f} : déjà en place (amorçage du journal)`);
        continue;
      }
    }
    try {
      await ex.run(texte.replace(/;?\s*$/, ';\n') + noter(f, sum, 'complet') + ';');
      res.appliquees.push({ fichier: f, mode: 'complet' }); log(`${f} : appliquée`);
      continue;
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (!DEJA_LA.test(msg)) return { ...res, ok: false, fichier: f, erreur: msg.slice(0, 600) };
      log(`${f} : « ${msg.match(DEJA_LA)[0]} » → reprise instruction par instruction`);
    }
    // Instruction par instruction : « déjà là » ne vaut QUE pour l'instruction qui crée cet objet.
    for (const s of instrs) {
      try { await ex.run(s); } catch (e) {
        const msg = String((e && e.message) || e);
        const eff = effet(s);
        if (DEJA_LA.test(msg) && eff && (await effetPresent(ex, eff))) { log(`  déjà en place : ${eff.type} ${eff.nom}`); continue; }
        return { ...res, ok: false, fichier: f, erreur: msg.slice(0, 600) };
      }
    }
    await ex.run(noter(f, sum, 'instruction'));
    res.appliquees.push({ fichier: f, mode: 'instruction' }); log(`${f} : appliquée instruction par instruction`);
  }
  return res;
}

/* ───────────────────────────── transports ───────────────────────────── */

/** SQLite locale (node:sqlite). run() multi-instructions dans une transaction = atomique comme D1. */
export function executeurSqlite(db) {
  return {
    all: async (sql) => db.prepare(sql).all().map((r) => ({ ...r })),
    run: async (sql) => {
      db.exec('SAVEPOINT mig');
      try { db.exec(sql); db.exec('RELEASE mig'); } catch (e) { db.exec('ROLLBACK TO mig'); db.exec('RELEASE mig'); throw e; }
    },
  };
}

/** D1 distante via le binaire `wrangler` (3 essais espacés pour les erreurs passagères de l'API). */
/** Pause entre deux essais (secondes × n° d'essai). D1_MIGRATIONS_PAUSE=0 en simulation locale. */
const PAUSE_S = Number(process.env.D1_MIGRATIONS_PAUSE ?? 10);
export function executeurWrangler(base, { wrangler = process.env.WRANGLER_BIN || 'wrangler', essais = 3, pause = (s) => { if (s > 0) execFileSync('sleep', [String(s)]); } } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'mig-'));
  const lancer = (args) => {
    let derniere = '';
    for (let k = 1; k <= essais; k++) {
      try {
        return execFileSync(wrangler, ['d1', 'execute', base, '--remote', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      } catch (e) {
        derniere = `${e.stdout || ''}\n${e.stderr || ''}\n${e.message || ''}`;
        if (DEJA_LA.test(derniere) || /syntax error|no such|constraint|malformed/i.test(derniere)) break;   // pas passager
        if (k < essais) { console.log(`::warning::wrangler d1 essai ${k}/${essais} : ${(derniere.match(/.*(error|✘|failed).*/i) || [''])[0].slice(0, 200)}`); pause(k * PAUSE_S); }
      }
    }
    throw new Error(derniere.trim().slice(-1500));
  };
  return {
    all: async (sql) => {
      const sortie = lancer(['--json', '--command', sql]);
      const j = JSON.parse(sortie.slice(sortie.indexOf('[')));
      return (j[0] && j[0].results) || [];
    },
    run: async (sql) => {
      const f = join(tmp, 'm.sql');
      writeFileSync(f, sql);
      lancer(['--file', f]);
    },
    nettoyer: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

async function main(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const ICI = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(opt('--dir') || join(ICI, '..', 'd1-migrations'));
  let ex;
  if (opt('--remote')) ex = executeurWrangler(opt('--remote'));
  else if (opt('--sqlite')) {
    const { DatabaseSync } = await import('node:sqlite');
    ex = executeurSqlite(new DatabaseSync(opt('--sqlite')));
  } else { console.error('usage : node tools/d1-migrations-runner.mjs (--remote <base> | --sqlite <fichier>) [--dir <dossier>]'); return 2; }
  try {
    const r = await appliquer(ex, dir, { log: (m) => console.log(m) });
    const resume = `${r.appliquees.length} appliquée(s) (${r.appliquees.map((a) => a.fichier + ':' + a.mode).join(', ') || 'aucune'}), ${r.ignorees} déjà au journal${r.amorcage ? ', amorçage du journal' : ''}`;
    if (!r.ok) {
      console.log(`::error title=Migration ${r.fichier} ÉCHOUÉE::${r.erreur.replace(/\s+/g, ' ').slice(0, 400)}`);
      console.log('ARRÊT : les migrations suivantes ne sont PAS appliquées. ' + resume);
      return 1;
    }
    console.log('::notice::Migrations D1 : ' + resume);
    return 0;
  } finally { if (ex.nettoyer) ex.nettoyer(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('ÉCHEC : ' + ((e && e.message) || e)); process.exit(1); });
}
