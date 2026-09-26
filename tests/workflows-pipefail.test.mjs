/* GARDE-FOU — « un contrôle qui ment est pire que pas de contrôle » (Kevin 2026-08-07).
 *
 * Le piège, constaté en vrai : dans une étape GitHub Actions, `commande | tee fichier`
 * renvoie le code de sortie de `tee` — donc TOUJOURS 0. Le shell par défaut est `bash -e`,
 * qui ne couvre PAS ce cas.
 *   · Mesuré sur le run 31129784556 : l'audit imprimait « AUDIT LIVE ÉCHEC (2 surface(s)) »
 *     et le job s'affichait VERT.
 *   · Pire, le même piège existait sur 15 DÉPLOIEMENTS (dont le routeur kd-mc.com) :
 *     un `wrangler deploy` en échec ressortait VERT.
 *
 * Deux niveaux, volontairement :
 *  1. RÈGLE DURE — aucun `wrangler deploy … | tee` sans pipefail, jamais. Un déploiement
 *     raté doit être rouge. Aucune exception.
 *  2. CLIQUET — pour le reste (résumés, `curl` informatifs, scanners volontairement
 *     tolérants), on FIGE l'existant : y ajouter pipefail rendrait rouges des workflows
 *     aujourd'hui verts (= régression interdite). Le compte ne doit jamais AUGMENTER.
 *
 * node tests/workflows-pipefail.test.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { workflowAuCoffre } from '../tools/depot-public/au-coffre.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.github/workflows');

/* Dette existante figée au 2026-08-07, APRÈS avoir sécurisé les 15 déploiements.
   Ce nombre ne doit que DESCENDRE. */
const BASELINE_TOLERES = 35;

let pass = 0;
const fails = [];
const toleres = [];

for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
  const txt = readFileSync(join(DIR, f), 'utf8');
  /* Par ÉTAPE : un `shell:` ne couvre que son étape, pas la suivante. */
  for (const step of txt.split(/(?=\n\s*- name:)/)) {
    if (!/\|\s*tee\b/.test(step)) continue;
    /* Exiger la DIRECTIVE `shell:`, pas le mot « pipefail » : sinon un simple commentaire
       contenant le mot suffirait à faire passer le test (défaut trouvé en le sabotant). */
    const protege = /^\s*shell:.*pipefail/m.test(step);
    /* TROU BOUCHÉ le 2026-08-13 : la règle dure ne voyait QUE `wrangler deploy` en début de
       ligne. Or `npx --yes wrangler@3 deploy … | tee` passait à travers et n'était que
       « toléré » — donc un DÉPLOIEMENT RATÉ serait ressorti VERT (exactement ce que ce test
       existe pour empêcher). Trouvé en vrai dans deploy-apex-depot-relais.yml. */
    const estDeploiement = /^\s*(?:npx\s+(?:--yes\s+)?)?wrangler(?:@[\w.]+)?\s+deploy\b.*\|\s*tee\b/m.test(step);

    if (protege) { pass++; continue; }
    if (estDeploiement) {
      const l = (step.match(/^\s*(?:npx\s+(?:--yes\s+)?)?wrangler(?:@[\w.]+)?\s+deploy\b.*$/m) || [''])[0].trim().slice(0, 70);
      fails.push(`${f} — DÉPLOIEMENT « ${l} » sans pipefail : un échec ressortirait VERT`);
    } else {
      toleres.push(f);
    }
  }
}

/* Le cas d'origine doit rester couvert (sinon le test devient vide et passe toujours). */
/* Dans le dépôt PUBLIC, verif-reelle.yml vit au coffre (il se connecte en tant que Kevin) :
   ce contrôle-là tourne là-bas, où le fichier existe. */
if (workflowAuCoffre('verif-reelle.yml')) pass++;
else if (/pipefail/.test(readFileSync(join(DIR, 'verif-reelle.yml'), 'utf8'))) pass++;
else fails.push('verif-reelle.yml a perdu son pipefail (régression du 1er run réel)');

if (toleres.length > BASELINE_TOLERES) {
  fails.push(
    `dette en HAUSSE : ${toleres.length} « | tee » non protégés (plafond figé ${BASELINE_TOLERES}). ` +
    'Ajoute `shell: bash -eo pipefail {0}` à ta nouvelle étape, ou baisse le plafond.',
  );
}

console.log(
  `Pipefail des workflows : ${pass} étape(s) protégée(s), ` +
  `${toleres.length}/${BASELINE_TOLERES} dette tolérée, ${fails.length} échec(s)`,
);
fails.forEach((x) => console.log('  ✗ ' + x));
process.exit(fails.length ? 1 : 0);
