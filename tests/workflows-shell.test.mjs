/* GARDE — une faute de shell dans un workflow ne doit JAMAIS se découvrir en
 * production.
 *
 * Vécu le 16.09.2026 : un guillemet orphelin après `esac` dans l'étape de
 * preuve de deploy-kdmc-social.yml. Le YAML était valide, le workflow s'est
 * lancé, a tout exécuté correctement… puis est mort sur
 * « unexpected EOF while looking for matching `"' » APRÈS le déploiement.
 * Quatre minutes d'attente pour une faute de frappe qu'une seconde de
 * `bash -n` attrape.
 *
 * Mesuré ce jour-là : 659 blocs shell dans les workflows, 0 cassé une fois
 * le mien réparé. Donc AUCUNE dette à figer — la règle est dure, sans
 * cliquet et sans exception.
 *
 * node --test tests/workflows-shell.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.github/workflows');

/* Extraction volontairement SANS bibliothèque YAML (aucune n'est garantie
   installée ici) : on lit les blocs `run: |` à l'indentation, ce qui suffit —
   c'est exactement la forme qu'ont tous les workflows du dépôt. */
function blocsShell(texte) {
  const lignes = texte.split('\n');
  const blocs = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^(\s*)run:\s*\|\s*-?\s*$/);
    if (!m) continue;
    const marge = m[1].length;
    const corps = [];
    let j = i + 1;
    for (; j < lignes.length; j++) {
      const l = lignes[j];
      if (l.trim() === '') { corps.push(''); continue; }
      const ind = l.length - l.trimStart().length;
      if (ind <= marge) break;
      corps.push(l);
    }
    /* On retire l'indentation commune, sinon bash voit un décalage partout. */
    const util = corps.filter((l) => l.trim() !== '');
    const min = util.length ? Math.min(...util.map((l) => l.length - l.trimStart().length)) : 0;
    blocs.push({ ligne: i + 1, code: corps.map((l) => l.slice(min)).join('\n') });
    i = j - 1;
  }
  return blocs;
}

/* Les expressions GitHub ${{ … }} ne sont pas du shell : elles sont remplacées
   avant l'exécution. On met une valeur neutre pour ne pas créer de faux rouge. */
const neutralise = (s) => s.replace(/\$\{\{[^}]*\}\}/g, 'VALEUR');

test('chaque bloc `run:` d\'un workflow est du shell valide', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'wf-shell-'));
  const casses = [];
  let total = 0;

  for (const f of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const texte = readFileSync(join(DIR, f), 'utf8');
    for (const b of blocsShell(texte)) {
      /* PowerShell / python / node via `shell:` — on ne teste que le shell. */
      if (/^\s*(python|node|pwsh|powershell)\b/.test(b.code)) continue;
      total++;
      const chemin = join(dossier, 'bloc.sh');
      writeFileSync(chemin, neutralise(b.code));
      try {
        execFileSync('bash', ['-n', chemin], { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (e) {
        const msg = String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n')[0];
        casses.push(`${f} (ligne ${b.ligne}) → ${msg.slice(0, 120)}`);
      }
    }
  }

  assert.ok(total > 300, `seulement ${total} blocs analysés — l'extraction est cassée, ` +
    'ce test passerait au vert sans rien vérifier (faux vert)');
  assert.deepEqual(casses, [],
    'faute(s) de shell : le workflow se lancera, fera son travail, puis mourra à la ligne fautive');
  console.log(`  ${total} blocs shell vérifiés, 0 faute.`);
});
