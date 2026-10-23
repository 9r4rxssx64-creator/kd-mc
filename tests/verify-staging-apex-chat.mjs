/* GARDE — outil de staging d'Apex Chat (tâche 33, 23.10.2026) : la base de TEST se remplit, se remet à zéro et prouve « aucune trace »,
   et ne peut JAMAIS toucher la production.
   Vraie SQLite (node:sqlite) + les vraies migrations 0001→0028. Discriminant : après `seed` la vérification DOIT échouer
   (sinon « aucune trace » serait un tampon vide), une ligne de référence modifiée DOIT être vue, une référence partielle DOIT refuser.
   node tests/verify-staging-apex-chat.mjs */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { executeurSqlite, figer, ecarts, reset, sqlSeed, verifierNom, total, compter, PROD_ID, main } from '../tools/staging/apex-chat-staging.mjs';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const dossier = mkdtempSync(join(tmpdir(), 'staging-'));
const fichier = join(dossier, 'st.db');
try {
  /* 1. garde-fous de nom : jamais la production */
  for (const mauvais of ['apex-chat-main', 'staging', '', null, 'Staging-x', `staging-${PROD_ID}-x`.replace(PROD_ID, 'a b')]) {
    let refus = false; try { verifierNom(mauvais); } catch { refus = true; }
    ok(refus, `nom refusé : ${JSON.stringify(mauvais)}`);
  }
  ok(verifierNom('staging-apex-chat') === 'staging-apex-chat', 'staging-apex-chat accepté');
  let refusId = false; try { verifierNom(`staging-${PROD_ID}`); } catch { refusId = true; }
  ok(refusId, "l'identifiant de la base de production est refusé même derrière « staging- »");
  ok((await main(['reset', '--remote', 'apex-chat-main']).catch(() => 1)) === 1, 'reset --remote apex-chat-main : code 1, rien exécuté');

  /* 2. cycle complet sur une vraie base */
  execFileSync('node', ['tools/staging/apex-chat-staging.mjs', 'schema', '--sqlite', fichier], { stdio: 'pipe' });
  const db = new DatabaseSync(fichier); const ex = executeurSqlite(db);
  const base = await compter(ex);
  ok(total(base) > 0, `le schéma pose des lignes système lui-même (${total(base)}) : un « zéro absolu » casserait le staging`);
  let e = await ecarts(ex);
  ok(total(e.ajoutees) === 0 && e.modifiees.length === 0, 'juste après le schéma : aucune trace');

  const { sql, comptes } = sqlSeed('abc123', 1700000000000);
  ok(comptes.length === 3 && comptes.every((c) => /^test-audit-abc123[abc]$/.test(c)), 'trois comptes jetables « test-audit-… »');
  await ex.run(sql);
  e = await ecarts(ex);
  ok(total(e.ajoutees) > 10 && e.ajoutees.users === 3 && e.ajoutees.messages === 4, `le jeu de test est vu comme des traces (${JSON.stringify(e.ajoutees)}) — la vérification n'est pas un tampon vide`);

  const apres = await reset(ex);
  ok(total(apres.ajoutees) === 0 && apres.modifiees.length === 0, 'reset : retour à la référence, 0 ligne ajoutée');
  ok(JSON.stringify(await compter(ex)) === JSON.stringify(base), 'les comptes par table sont exactement ceux de la référence');

  /* 3. une ligne de référence modifiée est détectée (le simple comptage ne la verrait pas) */
  db.exec("UPDATE system_config SET value = 'trafiqué' WHERE rowid = (SELECT min(rowid) FROM system_config)");
  e = await ecarts(ex);
  ok(e.modifiees.includes('system_config'), 'une ligne de référence modifiée est signalée');

  /* 4. table SANS rowid (verrous) : une ligne ajoutée est vue puis effacée */
  db.exec("INSERT INTO heal_locks (key, ts) VALUES ('x', 1)");
  e = await ecarts(ex);
  ok(e.ajoutees.heal_locks === 1, 'heal_locks (sans rowid) : ligne ajoutée vue');
  db.exec("UPDATE system_config SET value = (SELECT value FROM system_config LIMIT 1) WHERE 0");
  await reset(ex);
  ok((await ecarts(ex)).ajoutees.heal_locks === undefined, 'heal_locks : effacée par reset');

  /* 5. référence partielle ou absente : refus, jamais un faux vert */
  db.exec("DELETE FROM _staging_base WHERE tbl = 'users'");
  let partielle = false; try { await ecarts(ex); } catch (err) { partielle = /incomplet/.test(err.message); }
  ok(partielle, 'référence partielle : refus explicite (pas de faux « aucune trace »)');
  db.exec('DROP TABLE _staging_base');
  let absente = false; try { await ecarts(ex); } catch (err) { absente = /pas d'état de référence/.test(err.message); }
  ok(absente, 'sans référence : refus explicite');
  db.close();

  /* 6. le workflow public existe et ne vise que la base de staging */
  const wf = readFileSync('.github/workflows/staging-apex-chat-donnees.yml', 'utf8');
  ok(/staging-apex-chat/.test(wf) && !new RegExp(PROD_ID).test(wf) && !/--remote apex-chat-main/.test(wf), 'le workflow ne vise que staging-apex-chat (ni identifiant ni nom de la production)');
  ok(/workflow_dispatch/.test(wf) && !/^\s*schedule:/m.test(wf) && !/\bcron:/.test(wf), 'workflow à la main uniquement, aucun cron');
} finally { rmSync(dossier, { recursive: true, force: true }); }
console.log(`\n=== ${pass} OK / ${fail} KO ===`);
process.exit(fail ? 1 : 0);
