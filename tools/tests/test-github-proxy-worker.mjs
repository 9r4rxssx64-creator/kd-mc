/*
 * Le relais de lecture du dépôt fait-il vraiment ce qu'il promet ?
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * Ce relais portera le jeton GitHub passe-partout de Kevin — celui qui donne
 * accès à TOUS ses dépôts, pas seulement CMCteams. Le déployer sans l'avoir
 * exercé serait exactement l'erreur « c'est écrit donc ça marche ».
 *
 * Deux trous ont été trouvés à la relecture, avant tout déploiement :
 *   1. une requête sans en-tête d'origine passait (porte ouverte) ;
 *   2. un chemin contenant « .. » sortait du dépôt autorisé et permettait de
 *      lire un AUTRE dépôt privé, avec le jeton.
 * Ces tests les figent : si quelqu'un rouvre l'un des deux, ça devient rouge.
 *
 * Lancement : node tools/tests/test-github-proxy-worker.mjs
 */

import { readFile } from 'node:fs/promises';
import worker from '../github-proxy-worker.js';

const ORIGINE_OK = 'https://kd-mc.com';
let echecs = 0;

/* On remplace l'appel réseau : on ne veut PAS appeler GitHub, on veut savoir
   quelle adresse le relais aurait appelée. */
let derniereUrl = '';
globalThis.fetch = async (url) => {
  derniereUrl = String(url);
  return new Response('contenu factice', { status: 200, headers: { 'Content-Type': 'text/plain' } });
};

const env = { GITHUB_PAT: 'jeton-factice' };

async function appeler(params, origine) {
  derniereUrl = '';
  const url = 'https://relais.exemple.workers.dev?' + new URLSearchParams(params);
  const entetes = origine ? { Origin: origine } : {};
  return worker.fetch(new Request(url, { headers: entetes }), env);
}

function verifier(nom, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${nom}`);
  } else {
    console.log(`  ❌ ${nom}${detail ? ' — ' + detail : ''}`);
    echecs++;
  }
}

console.log('\n1. Qui a le droit de lire ?');
{
  const r = await appeler({ action: 'read', path: 'CLAUDE.md' }, ORIGINE_OK);
  verifier('une page de kd-mc.com est servie', r.status === 200, `reçu ${r.status}`);
}
{
  const r = await appeler({ action: 'read', path: 'CLAUDE.md' }, 'https://site-pirate.example');
  verifier('une page inconnue est refusée', r.status === 403, `reçu ${r.status}`);
}
{
  /* Le cas qui était grand ouvert : pas d'en-tête d'origine du tout. */
  const r = await appeler({ action: 'read', path: 'CLAUDE.md' }, null);
  verifier('une requête SANS origine est refusée', r.status === 403, `reçu ${r.status}`);
}

console.log('\n2. Peut-on sortir du dépôt autorisé ?');
{
  const r = await appeler(
    { action: 'read', path: '../../autre-depot/main/secret.txt' },
    ORIGINE_OK,
  );
  verifier('un chemin avec « .. » est refusé', r.status === 400, `reçu ${r.status}`);
  verifier('…et aucun appel n’est parti vers GitHub', derniereUrl === '');
}
{
  const r = await appeler({ action: 'read', path: 'x', branch: '../../autre' }, ORIGINE_OK);
  verifier('une branche avec « .. » est refusée', r.status === 400, `reçu ${r.status}`);
}

console.log('\n3. Les lectures légitimes marchent-elles encore ?');
for (const chemin of ['CLAUDE.md', '.claude/skills/x.md', 'tools/memory/apex-memory.json']) {
  const r = await appeler({ action: 'read', path: chemin }, ORIGINE_OK);
  verifier(
    `« ${chemin} » est lu dans le bon dépôt`,
    r.status === 200 &&
      derniereUrl === `https://raw.githubusercontent.com/9r4rxssx64-creator/CMCteams/main/${chemin}`,
    derniereUrl,
  );
}
{
  const r = await appeler({ action: 'list', path: '.claude/skills' }, ORIGINE_OK);
  verifier(
    'lister un dossier interroge le bon dépôt',
    r.status === 200 && derniereUrl.includes('/repos/9r4rxssx64-creator/CMCteams/contents/'),
    derniereUrl,
  );
}

console.log('\n4. Le jeton reste-t-il côté serveur ?');
{
  const r = await appeler({ action: 'read', path: 'CLAUDE.md' }, ORIGINE_OK);
  const corps = await r.text();
  const entetes = JSON.stringify([...r.headers]);
  verifier(
    'le jeton n’apparaît ni dans la réponse ni dans les en-têtes',
    !corps.includes('jeton-factice') && !entetes.includes('jeton-factice'),
  );
}

console.log('\n5. CHAQUE adresse du domaine peut-elle lire ?');
{
  /* POURQUOI CE CONTRÔLE EXISTE (22.09.2026)
   * ----------------------------------------
   * Apex est servi sur `apex-ai.kd-mc.com`. Cette adresse ne figurait pas
   * dans la liste du relais : il répondait donc 403, et le navigateur
   * n'affichait que « net::ERR_FAILED ». Tant que le dépôt était public,
   * personne ne l'a vu — Apex lisait GitHub en direct. Le jour du passage en
   * privé, ce relais est devenu le SEUL chemin, et il était fermé : Apex a
   * cessé de relire ses documents EN SILENCE (le code ignore un document
   * manquant).
   *
   * La garde compare donc le relais à la SOURCE DE VÉRITÉ des adresses
   * servies — la table du routeur — au lieu d'une liste recopiée à la main
   * qui redeviendrait fausse au prochain sous-domaine (leçon #142). */
  const routeur = await readFile(
    new URL('../../services/kdmc-router/worker.js', import.meta.url),
    'utf8',
  );
  const table = routeur.slice(routeur.indexOf('const ROUTES'));
  const hotes = [
    ...new Set((table.slice(0, table.indexOf('};')).match(/'[a-z0-9.-]+\.kd-mc\.com'/g) || [])
      .map((h) => h.replace(/'/g, ''))),
  ];
  verifier('la table du routeur a bien été lue', hotes.length >= 20, `${hotes.length} adresse(s)`);
  const refusees = [];
  for (const hote of hotes) {
    const r = await appeler({ action: 'read', path: 'CLAUDE.md' }, 'https://' + hote);
    if (r.status !== 200) refusees.push(hote + ' → ' + r.status);
  }
  verifier(
    `les ${hotes.length} adresses du domaine sont servies`,
    refusees.length === 0,
    refusees.join(', '),
  );
}
{
  /* Le contrôle préalable du navigateur (OPTIONS) doit renvoyer L'ADRESSE DE
     L'APPELANT, pas une autre : si l'en-tête ne correspond pas, le navigateur
     bloque et affiche… « net::ERR_FAILED », exactement le symptôme du 22.09. */
  const url = 'https://relais.exemple.workers.dev?action=read&path=CLAUDE.md';
  const r = await worker.fetch(
    new Request(url, { method: 'OPTIONS', headers: { Origin: 'https://apex-ai.kd-mc.com' } }),
    env,
  );
  verifier(
    'le contrôle préalable (OPTIONS) renvoie bien l’adresse d’Apex',
    r.status === 204 &&
      r.headers.get('access-control-allow-origin') === 'https://apex-ai.kd-mc.com',
    `${r.status} / ${r.headers.get('access-control-allow-origin')}`,
  );
}
{
  /* Le domaine s'ouvre — pas ce qui lui ressemble. */
  for (const faux of [
    'https://kd-mc.com.site-pirate.example',
    'https://faux-kd-mc.com',
    'http://apex-ai.kd-mc.com',
  ]) {
    const r = await appeler({ action: 'read', path: 'CLAUDE.md' }, faux);
    verifier(`« ${faux} » est refusé`, r.status === 403, `reçu ${r.status}`);
  }
}

console.log(
  echecs === 0
    ? '\n✅ Tout est conforme : le relais est refermé et ne sort pas de CMCteams.\n'
    : `\n❌ ${echecs} vérification(s) en échec — NE PAS DÉPLOYER.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
