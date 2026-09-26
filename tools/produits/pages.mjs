#!/usr/bin/env node
/* pages.mjs — génère UNE page de vente par produit du catalogue (fabrique de
   produits, 17.09) dans shops/kit-ia/<slug>.html, servie à kit.kd-mc.com/<slug>.html.
   Une seule source (catalogue.json) ; la CSP est COPIÉE de la page mère
   (index.html) pour qu'elle ne diverge jamais ; aucune consigne payante ici.
   `node tools/produits/pages.mjs` écrit · `--verifier` = code 1 si une page sur
   disque diffère de ce que le catalogue produit (garde CI). */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lireCatalogue } from './fabrique.mjs';
/* Le texte du consentement vient de la CAISSE : une seule vérité. S'il change là-bas,
   les pages le suivent, et la preuve enregistrée dit exactement ce qui a été affiché. */
import { CONSENTEMENT } from '../../services/kdmc-vente/worker.js';
/* Les balises d'aperçu (og:image) sont posées ICI, pendant la génération.
   Mesuré le 18.09 : régénérer les pages les effaçait, et le lien repartait en
   rectangle gris sur Facebook sans que rien ne rougisse avant la garde. */
import { pagesOg, poseBalises } from './apercus.mjs';

export const DIR = new URL('../../shops/kit-ia/', import.meta.url);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonAttr = (s) => JSON.stringify(String(s)).slice(1, -1);
const cspMere = () => readFileSync(new URL('index.html', DIR), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1];
const premierePhrase = (brief) => { const t = String(brief).split(';')[0].trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const cible = (p) => { const t = String(p.cible).split(',')[0].replace(/^un(e)? /, ''); return 'Pour ' + (p.cibleTitre || t.replace(/^(\w)/, (c) => c.toUpperCase())); };

export function page(p, csp = cspMere()) {
  const url = 'https://kit.kd-mc.com/' + p.slug + '.html';
  const lire = 'lire.html?produit=' + p.id;
  const prix = p.prix + ' €';
  const modules = p.modules.map((m, i) => '    <li><span class="n"></span><div><strong>' + esc(m.titre) + (m.gratuit ? ' <span class="tag">gratuit</span>' : '') + '</strong>' + esc(premierePhrase(m.brief)) + '.</div></li>').join('\n');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(p.court)} — ${esc(p.phrase)}</title>
<meta name="description" content="${esc(p.promesse)} ${p.modules.length} modules, ${prix}, accès 2 ans, sans coder.">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D0F14" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.court)}">
<meta property="og:description" content="${esc(p.promesse)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="product">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="kit.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${jsonAttr(p.court)}","description":"${jsonAttr(p.promesse)}","brand":{"@type":"Brand","name":"KDMC"},"offers":{"@type":"Offer","price":"${p.prix}","priceCurrency":"EUR","availability":"https://schema.org/InStock","url":"${url}"}}
</script>
</head>
<body data-produit="${p.id}">
<main>
  <p class="sur">${esc(cible(p))}</p>
  <h1>${esc(p.phrase)}</h1>
  <p class="chapeau">${esc(p.promesse)} Avec les versions <strong>gratuites</strong> de ChatGPT, Claude ou Gemini.</p>

  <p><a class="btn btn-primaire" href="${lire}">Lire le module 1 gratuitement</a></p>
  <p class="petit">Pas d'inscription. Tu vois exactement ce que tu achètes avant de payer.</p>

  <h2>Les ${p.modules.length} modules</h2>
  <ol class="modules">
${modules}
  </ol>

  <div class="encart" id="acheter">
    <p class="sur">Accès complet</p>
    <div class="prix"><span class="maintenant">${prix}</span><span class="avant">${p.avant} €</span></div>
    <p>Prix de lancement. Accès pendant <strong>2 ans</strong>, mises à jour comprises, lecture sur téléphone et ordinateur. Chaque consigne se copie en un geste.</p>
    <label for="mail-${p.slug}">Ton adresse e-mail (c'est là qu'arrive ton accès)</label>
    <input id="mail-${p.slug}" type="email" inputmode="email" autocomplete="email" placeholder="toi@exemple.fr" data-caisse-email>
    <label class="consent"><input type="checkbox" data-caisse-consentement><span>${esc(CONSENTEMENT)}</span></label>
    <p><button class="btn btn-primaire" id="payer-paypal" type="button" data-caisse data-moyen="paypal" data-produit="${p.id}" data-secours="https://paypal.me/kdmc/${p.prix}EUR">Payer ${prix} avec PayPal</button></p>
    <p><button class="btn btn-secondaire" id="payer-revolut" type="button" data-caisse data-moyen="revolut" data-produit="${p.id}" data-secours="https://revolut.me/kdmc/${p.prix}eur">Payer ${prix} avec Revolut</button></p>
    <p data-moyen-virement hidden><button class="btn btn-secondaire" id="payer-virement" type="button" data-caisse data-moyen="virement" data-produit="${p.id}">Payer ${prix} par virement</button></p>
    <div class="petit" data-caisse-avis hidden></div>
    <noscript><p class="petit">Ton navigateur n'exécute pas JavaScript. Tu peux payer directement&nbsp;: <a href="https://paypal.me/kdmc/${p.prix}EUR" rel="noopener">PayPal ${prix}</a> &middot; <a href="https://revolut.me/kdmc/${p.prix}eur" rel="noopener">Revolut ${prix}</a>. Mets ton adresse e-mail dans le message, puis écris-nous à <a href="mailto:kevind@monaco.mc">kevind@monaco.mc</a>&nbsp;: on t'ouvre l'accès à la main.</p></noscript>
    <p class="petit">Quand tu touches &laquo;&nbsp;Payer&nbsp;&raquo;, une référence s'affiche ici&nbsp;: recopie-la dans le message PayPal. Ton code part par e-mail dès que le paiement est constaté, au plus tard sous 24&nbsp;h ouvrées &mdash; on préfère le dire plutôt que promettre l'instantané. Rien reçu&nbsp;? Le formulaire juste en dessous te le renvoie.</p>
  </div>

  <div class="carte" id="recuperer">
    <h2 class="mt0">J'ai payé, je récupère mon accès</h2>
    <form id="form" novalidate>
      <label for="produit">Ce que tu as acheté</label>
      <select id="produit"><option value="${p.id}">${esc(p.court)}, ${prix}</option></select>
      <label for="methode">Payé avec</label>
      <select id="methode"><option value="paypal">PayPal</option><option value="revolut">Revolut</option><option value="virement">Virement</option></select>
      <label for="email">Ton adresse e-mail</label>
      <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="toi@exemple.fr" required>
      <p class="aide" id="aideEmail"></p>
      <label for="refPanier">Ta référence de panier</label>
      <input id="refPanier" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="K7X2M4QP">
      <p class="aide">Elle s'affiche quand tu touches &laquo;&nbsp;Payer&nbsp;&raquo; et se remplit toute seule ici. Avec elle, ton paiement est retrouvé tout de suite&nbsp;; sans elle, on cherche par e-mail.</p>
      <div id="champRef" hidden>
        <label for="reference">Référence du virement</label>
        <input id="reference" type="text" placeholder="ce que tu as mis en libellé">
      </div>
      <p class="mt16"><button class="btn btn-primaire" id="valider" type="submit">Récupérer mon accès</button></p>
    </form>
    <div id="resultat" hidden></div>
  </div>

  <h2>Questions</h2>
  <div class="faq">
    <details><summary>Il faut payer ChatGPT ou Claude en plus ?</summary><p>Non. Tout fonctionne avec les versions gratuites. Le module 1 te dit laquelle prendre.</p></details>
    <details><summary>Je ne suis pas à l'aise avec la technique.</summary><p>C'est fait pour toi : tu copies une consigne, tu remplaces les crochets par tes infos, tu colles dans l'appli. Zéro réglage, zéro code.</p></details>
    <details><summary>Comment je reçois le kit ?</summary><p>Tu reçois un code d'accès. Il ouvre le lecteur en ligne pendant 2 ans, sur tous tes appareils. Rien à installer.</p></details>
    <details><summary>Et si le paiement n'est pas trouvé tout de suite ?</summary><p>PayPal met parfois jusqu'à 3 heures à confirmer une transaction. Ta demande est enregistrée, ton accès arrive dès confirmation, tu n'as rien à refaire.</p></details>
    <details><summary>Remboursement ?</summary><p>Avant de payer, tu coches une case : tu demandes que ton accès soit ouvert tout de suite, et tu reconnais qu'ensuite tu ne peux plus te rétracter. C'est la règle européenne sur les contenus numériques livrés immédiatement — et c'est pour ça que le module 1 est gratuit : tu juges avant de payer. Si ton code n'a jamais été utilisé, écris-nous : on rembourse. <a href="cgv.html">Conditions de vente</a>.</p></details>
  </div>

  <footer>
    <p>Vendu par KDMC, Monaco. Prix TTC. Un problème avec ton accès ? Réutilise le formulaire ci-dessus avec la même adresse e-mail : ton code est renvoyé, jamais facturé deux fois.</p>
    <p class="petit"><a href="cgv.html">Conditions de vente</a> · <a href="mentions.html">Mentions légales</a> · Une question ? <a href="mailto:kevind@monaco.mc">kevind@monaco.mc</a></p>
    <p><a href="${lire}">Lire le module 1 gratuit</a> · <a href="./">Kit IA de l'indépendant</a> · <a href="https://kd-mc.com/">kd-mc.com</a></p>
  </footer>
</main>
<div class="barre" aria-label="Acheter">
  <span class="prix-mini">${prix}</span>
  <a class="btn btn-primaire" href="#acheter">Obtenir le kit</a>
</div>
<script src="kit.js"></script>
</body>
</html>
`;
}

export function attendu(catalogue = lireCatalogue()) {
  const csp = cspMere();
  const og = pagesOg(catalogue);
  return Object.fromEntries(catalogue.produits.map((p) => {
    const fiche = og.find((x) => x.slug === p.slug);
    const html = page(p, csp);
    return [p.slug + '.html', fiche ? poseBalises(html, fiche) : html];
  }));
}
export function ecarts() {
  const out = [];
  for (const [nom, html] of Object.entries(attendu())) {
    let actuel = ''; try { actuel = readFileSync(new URL(nom, DIR), 'utf8'); } catch (_) { actuel = ''; }
    if (actuel !== html) out.push(nom);
  }
  return out;
}
export function ecrire() {
  const pages = attendu();
  for (const [nom, html] of Object.entries(pages)) writeFileSync(new URL(nom, DIR), html);
  return Object.keys(pages);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--verifier')) {
    const e = ecarts();
    if (e.length) { console.error('Pages en retard sur le catalogue : ' + e.join(', ') + ' → node tools/produits/pages.mjs'); process.exit(1); }
    console.log('Pages produits à jour (' + Object.keys(attendu()).length + ').');
  } else {
    console.log('Écrit : ' + ecrire().join(', '));
  }
}
