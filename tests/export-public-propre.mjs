/* Le dépôt public n'est rempli QUE si l'export du coffre passe le vérificateur (tools/depot-public/verifier.mjs).
 * Ce contrôle ne tournait qu'APRÈS la fusion, au moment de la synchronisation : le 8.10.2026, deux fois en un jour
 * (#4395, puis #4414), une adresse mail personnelle remise dans un document exporté a bloqué TOUTE la copie
 * publique — plus aucun site ni Apex Chat ne partait, sans que la PR fautive ne voie rien.
 * Ce garde fait le même export + la même vérification AVANT la fusion (≈ 5 s), dans test:ci.
 *
 *   node tests/export-public-propre.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(mkdtempSync(join(tmpdir(), 'export-public-')), 'public');
const lancer = (outil) => spawnSync('node', [join(RACINE, 'tools/depot-public', outil), '--sortie', SORTIE], { cwd: RACINE, encoding: 'utf8', timeout: 240000 });
try {
  const ex = lancer('exporter.mjs');
  if (ex.status !== 0) { console.log('❌ l’export du dépôt public a échoué :\n' + (ex.stdout + ex.stderr).slice(-2000)); process.exit(1); }
  const ve = lancer('verifier.mjs');
  console.log((ve.stdout + ve.stderr).trim().split('\n').slice(-12).join('\n'));
  if (ve.status !== 0) {
    console.log('❌ export public REFUSÉ : cette modification bloquerait toute la copie publique (site + Apex Chat). '
      + 'Une adresse ou donnée personnelle va dans audit/prive/, jamais dans un document exporté.');
    process.exit(1);
  }
  console.log('✅ export public propre : la synchronisation pourra partir');
} finally {
  rmSync(dirname(SORTIE), { recursive: true, force: true });
}
