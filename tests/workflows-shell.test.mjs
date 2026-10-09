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

/* ─────────────────────────────────────────────────────────────────────────────
 * RÈGLE 2 (revue indépendante du 8.10.2026) — UNE ENTRÉE NE S'ÉCRIT JAMAIS DANS LE SHELL.
 *
 * `${{ inputs.x }}`, `${{ github.event.inputs.x }}` et `${{ github.event.client_payload.x }}`
 * sont remplacés par GitHub AVANT que bash (ou le JavaScript de github-script) ne lise la
 * ligne. Une valeur qui contient `"; rm -rf …` ou un retour à la ligne devient donc une
 * commande — avec les droits du robot (apex-execute.yml avait `contents: write`).
 * La bonne forme : la valeur passe par `env:` (KEY: ${{ inputs.x }}), puis le shell lit
 * "$KEY" — là, ce n'est plus que du texte.
 *
 * Ce qui est rouge : une de ces expressions dans un bloc `run:` (une ligne ou `run: |`)
 * ou dans un `script:` de github-script. Une ligne `env:` n'est pas un bloc run.
 * Seule exception : le CHOIX ENTRE DEUX LITTÉRAUX, `${{ inputs.x && '--drapeau' || '' }}`,
 * dont le résultat est toujours l'un des deux textes écrits ici — la valeur de l'entrée
 * n'y apparaît jamais (arbre-nuage.yml s'en sert pour ses boutons).
 *
 * Dette figée le 8.10 (fichiers non encore réécrits, compte par fichier) : elle ne peut
 * que DESCENDRE ; tout fichier hors de cette liste est à ZÉRO. Prouvé par sabotage dans le
 * test lui-même (cas fabriqués qui doivent rougir).
 * ───────────────────────────────────────────────────────────────────────────── */
/* Jusqu'au premier `}}` : un `{0}` de format() contient une accolade seule et ne ferme rien. */
const ENTREE = /\$\{\{(.*?)\}\}/g;
const DANGEREUSE = /\b(?:github\.event\.)?inputs\.|github\.event\.client_payload/;
/* `inputs.x && 'texte' || 'texte'` : le résultat est un des deux textes, jamais l'entrée. */
const CHOIX_LITTERAL = /^\s*(?:github\.event\.)?inputs\.[\w.-]+\s*&&\s*'[^'${}]*'\s*(?:\|\|\s*'[^'${}]*')?\s*$/;

export function entreesDansShell(texte) {
  const lignes = texte.split('\n');
  const trouvees = [];
  const examiner = (ligne, numero) => {
    for (const m of ligne.matchAll(ENTREE)) {
      const expr = m[1];
      if (!DANGEREUSE.test(expr) || CHOIX_LITTERAL.test(expr)) continue;
      trouvees.push({ ligne: numero, extrait: ('${{' + expr + '}}').trim().slice(0, 80) });
    }
  };
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^(\s*)(?:-\s+)?(run|script):\s*(.*)$/);
    if (!m) continue;
    const marge = m[1].length;
    const reste = m[3].trim();
    if (reste === '' || /^[|>][+-]?\s*$/.test(reste)) {
      /* bloc multi-lignes : tout ce qui est plus indenté que la clé */
      let j = i + 1;
      for (; j < lignes.length; j++) {
        const l = lignes[j];
        if (l.trim() === '') continue;
        if (l.length - l.trimStart().length <= marge) break;
        examiner(l, j + 1);
      }
      i = j - 1;
    } else examiner(reste, i + 1);
  }
  return trouvees;
}

/* Dette figée le 8.10.2026 : fichier → nombre d'entrées encore interpolées dans un shell.
   Chaque fichier réécrit sort d'ici. Un nombre ne peut que baisser. */
const DETTE_ENTREES = {
  'agent-toolkit-sync.yml': 2,
  'ai-review-independent.yml': 1,
  'auto-merge-claude.yml': 1,
  'build-ios.yml': 1,
  'clayscore-extract-private.yml': 1,
  'clayscore-verif-prix.yml': 2,
  'coffre-pdf-refresh.yml': 1,
  'deploy-apex-depot-relais.yml': 1,
  'deploy-cloudflare-workers.yml': 2,
  'deploy-firebase-rules.yml': 1,
  'domaine-secrets-tri.yml': 1,
  'ios-apps-testflight.yml': 1,
  'ios-testflight.yml': 3,
  'lingua-stories-langs.yml': 1,
  'lingua-vocab.yml': 2,
  'live-check-studio.yml': 2,
  'mesure-kv.yml': 2,
  'pilote-pages-javis.yml': 7,
  'publier-site-prive.yml': 1,
  'pub-videos.yml': 4,
  'seo-audit.yml': 2,
  'social-publish.yml': 1,
  'social-scheduler.yml': 2,
  'sync-secrets-to-cloudflare.yml': 1,
  'verifie-ia-gratuites.yml': 1,
};

test('aucune entrée (inputs / client_payload) n\'est interpolée dans un bloc run: ou script:', () => {
  /* 1. SABOTAGE — le garde doit rougir sur chaque forme dangereuse, et rester vert sur la bonne forme. */
  const cas = [
    ['run une ligne, inputs', '      run: node x.mjs "${{ inputs.url }}"\n', 1],
    ['run bloc, github.event.inputs', '      run: |\n        A="${{ github.event.inputs.a }}"\n        echo ok\n', 1],
    ['run bloc, client_payload', '      run: |\n        T="${{ github.event.client_payload.task }}"\n', 1],
    ['script github-script', '        with:\n          script: |\n            const x = \'${{ inputs.id }}\';\n', 1],
    ['toJSON du payload', '      run: |\n        echo \'${{ toJSON(github.event.client_payload.params) }}\'\n', 1],
    ['env: puis "$VAR" (bonne forme)', '        env:\n          URL: ${{ inputs.url }}\n        run: node x.mjs "$URL"\n', 0],
    ['choix entre deux littéraux (toléré)', '      run: node x.mjs ${{ inputs.audit && \'--audit\' || \'\' }}\n', 0],
    ['format() avec l\'entrée (rouge)', '      run: node x.mjs ${{ inputs.voir && format(\'--voir "{0}"\', inputs.voir) || \'\' }}\n', 1],
    ['if: n\'est pas un shell', '        if: ${{ inputs.visuel }}\n        run: echo ok\n', 0],
  ];
  for (const [nom, src, attendu] of cas) {
    assert.equal(entreesDansShell(src).length, attendu, `sabotage « ${nom} » : attendu ${attendu} rouge(s)`);
  }

  /* 2. Les vrais workflows. */
  const rouges = [];
  const dette = {};
  let examines = 0;
  for (const f of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    examines++;
    const t = entreesDansShell(readFileSync(join(DIR, f), 'utf8'));
    if (!t.length) continue;
    const plafond = DETTE_ENTREES[f] || 0;
    if (t.length > plafond) {
      rouges.push(`${f} : ${t.length} entrée(s) dans un shell (toléré ${plafond}) → ` +
        t.map((x) => `ligne ${x.ligne} ${x.extrait}`).join(' · '));
    } else dette[f] = t.length;
  }
  for (const [f, n] of Object.entries(DETTE_ENTREES)) {
    if (!(f in dette) && readdirSync(DIR).includes(f)) rouges.push(`${f} : plus aucune entrée dans un shell — retire-le de DETTE_ENTREES (la dette ne doit que baisser)`);
  }
  assert.ok(examines > 100, `seulement ${examines} workflows lus — l'extraction est cassée`);
  assert.deepEqual(rouges, [],
    'une entrée écrite dans un shell devient une commande : passe-la par env: puis "$VAR"');
  const reste = Object.values(dette).reduce((a, b) => a + b, 0);
  console.log(`  ${examines} workflows examinés, 0 nouvelle entrée dans un shell (dette figée restante : ${reste} dans ${Object.keys(dette).length} fichiers).`);
});

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
