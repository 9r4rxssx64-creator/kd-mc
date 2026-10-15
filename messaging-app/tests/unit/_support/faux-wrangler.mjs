#!/usr/bin/env node
/**
 * FAUX `wrangler` pour simuler EN LOCAL les étapes shell des workflows qui parlent à D1
 * (tests/unit/lot-e2-migrations-journal.test.js). Il ne touche jamais Cloudflare : il exécute
 * sur une base SQLite locale (FAUX_D1), avec la sémantique utile de D1 :
 *   - `d1 execute <base> --remote --file f`   → fichier ATOMIQUE (tout ou rien), comme D1 ;
 *   - `d1 execute <base> --remote --command q [--json]` → résultats (JSON comme wrangler) ;
 *   - `d1 time-travel info <base>`            → un faux signet ;
 *   - `r2 object get <seau>/<clé> --remote --file f` → copie depuis FAUX_R2_DIR.
 * FAUX_PANNES_FICHIER : fichier contenant N → les N prochains `--file` échouent « Internal error »
 * (panne passagère de l'API D1). FAUX_WRANGLER_JOURNAL : chaque appel y est consigné.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const a = process.argv.slice(2);
if (process.env.FAUX_WRANGLER_JOURNAL) appendFileSync(process.env.FAUX_WRANGLER_JOURNAL, JSON.stringify(a) + '\n');
if (a[0] === 'd1' && a[1] === 'time-travel' && a[2] === 'info') {
  console.log('🚧 Time Traveling...\n⚡️ The current bookmark is \'00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683\'');
  process.exit(0);
}
// FAUX_R2_DIR : `r2 object get <seau>/<clé> --remote --file f` lit <FAUX_R2_DIR>/<seau>/<clé> (exercice de restauration).
if (a[0] === 'r2' && a[1] === 'object' && a[2] === 'get' && a.includes('--remote')) {
  const src = process.env.FAUX_R2_DIR + '/' + a[3];
  if (!existsSync(src)) { console.error('✘ [ERROR] The specified key does not exist.'); process.exit(1); }
  writeFileSync(a[a.indexOf('--file') + 1], readFileSync(src));
  console.log('Downloading "' + a[3] + '"');
  process.exit(0);
}
if (a[0] !== 'd1' || a[1] !== 'execute' || !a.includes('--remote')) {
  console.error('faux wrangler : commande non simulée « ' + a.join(' ') + ' »');
  process.exit(2);
}
const db = new DatabaseSync(process.env.FAUX_D1);
const iC = a.indexOf('--command');
const iF = a.indexOf('--file');
try {
  if (iF > 0) {
    const pannes = process.env.FAUX_PANNES_FICHIER;
    if (pannes && existsSync(pannes)) {
      const n = Number(readFileSync(pannes, 'utf8')) || 0;
      if (n > 0) { writeFileSync(pannes, String(n - 1)); throw new Error('D1_ERROR: Internal error, please try again (code 7500)'); }
    }
    const sql = readFileSync(a[iF + 1], 'utf8');
    db.exec('BEGIN');
    try { db.exec(sql); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    console.log('🚣 Executed ' + sql.split(';').length + ' commands');
  } else if (iC > 0) {
    const rows = db.prepare(a[iC + 1]).all().map((r) => ({ ...r }));
    if (a.includes('--json')) console.log(JSON.stringify([{ results: rows, success: true, meta: {} }], null, 2));
    else for (const r of rows) console.log(Object.values(r).join(' | '));
  }
} catch (e) {
  console.error('✘ [ERROR] ' + e.message);
  process.exit(1);
}
