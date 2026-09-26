/* Quand l'hébergeur ne sert pas une page, le routeur ne doit JAMAIS servir
   CELLE D'UNE AUTRE APP.  node amont-404.test.mjs

   POURQUOI CE TEST EXISTE (mesuré le 19/09/2026, run 35458650075, vraie Vérif
   RÉELLE sur kd-mc.com) : 12 surfaces répondaient 200 en servant
   « version servie : v9.914 » — c'est-à-dire l'application CMCteams — à la place
   de leur propre page : kit.kd-mc.com/lire.html, /pour/index.html,
   /pour/plombier.html, /bureau.html, /etudiant.html, /avis.html, /immo.html,
   les 4 lecteurs ?produit=…, kd-mc.com/cujina/ et kd-mc.com/admin/commerce.html.
   La racine de chaque app, elle, était verte. Pour un visiteur, une page de vente
   à 37 € affiche l'app de planning du casino : c'est pire qu'un 404 honnête,
   parce que rien ne signale l'erreur.

   Ce que ce test verrouille, indépendamment de la cause d'hébergement :
   la BOUÉE DE SECOURS ne doit accepter une copie que si elle correspond
   VRAIMENT au chemin demandé. Un stockage qui répond « 200 + index.html »
   à n'importe quel chemin (repli type application-monopage) ne doit pas
   pouvoir transformer un 404 en mauvaise page servie. */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const PAGE_CMCTEAMS = '<!doctype html><html><head><title>CMCteams</title>'
  + '<script>var APP_VER="v9.914";</script></head><body>planning</body></html>';

const realFetch = globalThis.fetch;
/* L'hébergeur ne trouve rien : tout est en 404 (le cas d'une page pas encore
   publiée, d'un dossier oublié dans la copie, ou d'un déploiement en cours). */
globalThis.fetch = async () => new Response('Not Found', { status: 404 });

/* Stockage PATHOLOGIQUE mais réel : beaucoup d'hébergeurs statiques répondent
   « 200 + la page d'accueil » pour un chemin inconnu (repli monopage). */
const ASSETS_MONOPAGE = {
  fetch: async () => new Response(PAGE_CMCTEAMS, { status: 200, headers: { 'content-type': 'text/html' } }),
};

const cas = [
  ['kit.kd-mc.com', '/lire.html', 'Kit IA — lecteur'],
  ['kit.kd-mc.com', '/pour/index.html', 'Kit IA — index métiers'],
  ['kit.kd-mc.com', '/bureau.html', 'Kit IA — page de vente 37 €'],
  ['lingua.kd-mc.com', '/app.js', 'Lingua — ressource'],
  ['arbre.kd-mc.com', '/photos/x.html', 'Arbre — page interne'],
];

console.log('\n== AMONT INJOIGNABLE : jamais la page d\'une autre app ==\n');
for (const [host, chemin, nom] of cas) {
  const res = await mod.fetch(new Request('https://' + host + chemin), { ASSETS: ASSETS_MONOPAGE });
  const corps = await res.text();
  const estCMCteams = corps.includes('APP_VER="v9.914"') || corps.includes('<title>CMCteams</title>');
  ok(!(res.status === 200 && estCMCteams),
    nom + ' (' + host + chemin + ') → ' + res.status
    + (estCMCteams ? ' MAIS le corps est l\'app CMCteams (mauvaise page servie)' : ' sans servir une autre app'));
}

/* L'inverse doit rester vrai : une copie qui correspond VRAIMENT au chemin
   demandé doit toujours être servie (la bouée doit rester utile en panne). */
const ASSETS_FIDELE = {
  fetch: async (req) => {
    const p = new URL(req.url).pathname;
    if (p === '/CMCteams/shops/kit-ia/lire.html') {
      return new Response('<html><h1>Kit IA — lecteur</h1></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('nope', { status: 404 });
  },
};
const res2 = await mod.fetch(new Request('https://kit.kd-mc.com/lire.html'), { ASSETS: ASSETS_FIDELE });
const corps2 = await res2.text();
ok(res2.status === 200 && corps2.includes('Kit IA — lecteur'),
  'la bouée sert toujours la BONNE copie quand elle existe (elle reste utile en panne)');

globalThis.fetch = realFetch;
console.log('\n' + (fail ? '❌' : '✅') + ' amont-404 : ' + pass + ' OK / ' + fail + ' FAIL\n');
process.exit(fail ? 1 : 0);
