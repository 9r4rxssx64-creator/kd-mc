/* GARDE — CHAQUE IA GRATUITE À OUTILS DE BEE A SA CLÉ POSÉE AU ROUTEUR PAR LE DÉPLOIEMENT (18.10.2026, mesuré en réel : « 🩺 Test de Bee » → « IA gratuites à outils avec clé : groq, mistral »).
 * Cerebras (la 1re de la liste et la plus rapide), SambaNova et NVIDIA n'avaient JAMAIS été posées au routeur : le workflow ne poussait que Groq et Mistral. Deux IA seulement, en pause dès la
 * 3ᵉ question → Bee retombait sur Qwen sans outils (réponses de tête). Une IA déclarée dans la liste des outils sans que son secret soit poussé ne sert à rien : ce test le voit.
 *   1. pour CHAQUE fournisseur de FOURNISSEURS_OUTILS, le workflow du routeur pousse son secret (wrangler secret put) ;
 *   2. un fournisseur ajouté demain à la liste sans sa clé poussée fait rougir ce test.
 * node services/kdmc-router/bee-cles.test.mjs */
import { readFileSync } from 'node:fs';
import { FOURNISSEURS_OUTILS } from '../_shared/outils-lecture.js';
import { SECRET_NAMES } from '../_shared/ia-route.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const wf = readFileSync(new URL('../../.github/workflows/deploy-kdmc-router.yml', import.meta.url), 'utf8');

/* le secret est lu depuis ${{ secrets.NOM }} ET posé par `wrangler secret put` (en toutes lettres ou dans une boucle `for N in … NOM …`) */
const lu = (nom) => new RegExp('secrets\\.' + nom + '\\b').test(wf);
const pose = (nom) => new RegExp('wrangler secret put ' + nom + '\\b').test(wf) || new RegExp('for N in[^\\n]*\\b' + nom + '\\b[\\s\\S]{0,400}wrangler secret put "\\$N"').test(wf);

for (const p of FOURNISSEURS_OUTILS) {
  const nom = SECRET_NAMES[p];
  ok(!!nom, '1. ' + p + ' : un nom de secret est défini');
  ok(lu(nom), '2. ' + p + ' : ' + nom + ' est lu depuis les secrets du dépôt par le workflow du routeur');
  ok(pose(nom), '3. ' + p + ' : ' + nom + ' est POSÉ au routeur (wrangler secret put)');
}
ok(FOURNISSEURS_OUTILS.length >= 5, '4. la liste des IA à outils compte ' + FOURNISSEURS_OUTILS.length + ' fournisseurs');
ok(/::notice::\$N absente du dépôt/.test(wf), '5. une clé absente est signalée en clair dans le journal (pas d\'échec silencieux), sans bloquer le déploiement');
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
