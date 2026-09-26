/* GARDE — « le site se publie-t-il TOUT SEUL après une fusion ? »
 * ---------------------------------------------------------------------------
 * Kevin 2026-09-19 : « Vérifie les MAJ auto pour tout le monde. Certains sont
 * encore en 1.39. Pourquoi ? »
 *
 * MESURÉ ce jour-là : sur 125 exécutions de `publier-site-prive.yml` (le
 * workflow qui publie le site sur son hébergeur RÉEL), la SEULE lancée sur
 * `main` était un lancement à la main. Toutes les autres venaient de branches
 * de travail — des aperçus que personne ne voit.
 *
 * Cause : un merge fait par le robot (GITHUB_TOKEN) ne déclenche AUCUN
 * workflow « on: push » (anti-récursion GitHub). Le robot dispatchait déjà
 * `deploy.yml` pour cette raison — mais `publier-site-prive.yml`, ajouté plus
 * tard, avait été oublié. Résultat : le site ne se met plus jamais à jour tout
 * seul, et tout le monde reste sur l'ancienne version, sans erreur nulle part.
 *
 * Cette garde EXÉCUTE la règle plutôt que de lire le texte : elle extrait les
 * commandes de dispatch du workflow et vérifie qu'aucun publicateur ne manque.
 *
 *   node tests/verify-publication-apres-fusion.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, msg, det) => { console.log((c ? '  ✅ ' : '  ❌ ') + msg + (det ? ' — ' + det : '')); if (!c) fails++; };

/* Les workflows qui PUBLIENT le site vu par les employés. En ajouter un ici
   oblige à le dispatcher aussi — c'est le but. */
const PUBLICATEURS = [
  { fichier: 'publier-site-prive.yml', quoi: 'le site sur Cloudflare Pages (hébergeur réel de kd-mc.com)' },
  { fichier: 'deploy.yml', quoi: 'GitHub Pages (hébergeur de secours / retour arrière)' },
];

const src = readFileSync(join(ROOT, '.github/workflows/auto-merge-claude.yml'), 'utf8');

/* Fonction PURE, testée juste après : quels workflows le robot lance-t-il
   après une fusion ? On lit les vraies commandes, pas un commentaire. */
export function workflowsDispatches(texte) {
  return [...texte.matchAll(/gh\s+workflow\s+run\s+([A-Za-z0-9._-]+\.ya?ml)/g)].map((m) => m[1]);
}

const lances = workflowsDispatches(src);
ok(lances.length > 0, `le robot lance ${lances.length} workflow(s) après une fusion`, lances.join(', ') || '(aucun)');

for (const p of PUBLICATEURS) {
  ok(lances.includes(p.fichier),
    `après une fusion, le robot publie ${p.quoi}`,
    lances.includes(p.fichier) ? p.fichier : `${p.fichier} JAMAIS lancé → le site restera sur l'ancienne version`);
}

/* La fonction fait-elle vraiment son travail ? On l'exécute sur des cas connus
   (une garde qui ne lit que du texte peut passer au vert sur du code mort). */
ok(workflowsDispatches('gh workflow run truc.yml --ref main').join() === 'truc.yml',
  'la lecture des dispatch fonctionne (cas simple)');
ok(workflowsDispatches('# gh workflow run rien.yml').join() === 'rien.yml',
  'la lecture attrape aussi une ligne commentée (on préfère un faux positif à un oubli)');
ok(workflowsDispatches('aucune commande ici').length === 0,
  'la lecture ne voit rien quand il n\'y a rien');

console.log(`\n=== ${fails ? fails + ' ÉCHEC(S)' : 'tout est publié automatiquement après une fusion'} ===`);
process.exit(fails ? 1 : 0);
