#!/usr/bin/env node
/* Pages « l'IA pour [métier] » de kit.kd-mc.com — générateur DÉTERMINISTE.
   Source unique : tools/kit/metiers.json (47 métiers × 5 situations).
   Sortie : shops/kit-ia/pour/<slug>.html + shops/kit-ia/pour/index.html
   + les entrées du sitemap (shops/sitemap.xml, entre deux balises repères).

   Pourquoi : la page de vente ne se trouve que par son nom. Quelqu'un tape
   « devis plombier IA » ou « posts Instagram coiffeur sans montrer son visage » :
   une page par métier répond à cette recherche, avec ses objets à lui, et mène
   au module 1 gratuit puis au kit / au Club. Aucune consigne payante ici : on
   dit CE QUE l'IA fait faire, jamais COMMENT (le comment vit en base D1).

   Usage : node tools/kit/pages-metiers.mjs            écrit les fichiers
           node tools/kit/pages-metiers.mjs --verifier  0 = identique, 1 = à régénérer */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCE = join(RACINE, 'tools', 'kit', 'metiers.json');
export const DOSSIER = join(RACINE, 'shops', 'kit-ia', 'pour');
export const SITEMAP = join(RACINE, 'shops', 'sitemap.xml');
export const BASE = 'https://kit.kd-mc.com/pour/';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src https://kdmc-vente.9r4rxssx64.workers.dev; object-src 'none'; base-uri 'self'; form-action 'none'";
const REPERE_DEBUT = '<!-- kit-ia/pour : généré par tools/kit/pages-metiers.mjs, ne pas éditer à la main -->';
const REPERE_FIN = '<!-- /kit-ia/pour -->';

export function lireMetiers() { return JSON.parse(readFileSync(SOURCE, 'utf8')); }
export function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const maj1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* Les 5 situations, dans l'ordre des modules du kit (3 → 7). */
export const SITUATIONS = [
  ['devis', 'Devis et tarifs', 'Module 3'],
  ['relance', 'Clients : répondre, relancer, se faire payer', 'Module 4'],
  ['reseaux', 'Réseaux sociaux sans y passer tes soirées', 'Module 5'],
  ['paperasse', 'La paperasse', 'Module 6'],
  ['routine', 'Ce qui tourne sans toi', 'Module 7'],
];

function tete({ titre, description, canonique, ldjson }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D0F14" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">
<link rel="canonical" href="${canonique}">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonique}">
<meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../kit.css">
<script type="application/ld+json">
${JSON.stringify(ldjson)}
</script>
</head>
<body>
<main>
`;
}

const PIED = `  <footer>
    <p>Vendu par KDMC, Monaco. Prix TTC. Le kit fonctionne avec les versions gratuites de ChatGPT, Claude ou Gemini : rien d'autre à payer.</p>
    <p><a href="../">Le kit</a> · <a href="../lire.html">Module 1 gratuit</a> · <a href="index.html">Tous les métiers</a> · <a href="https://kd-mc.com/">kd-mc.com</a></p>
  </footer>
</main>
<div class="barre" aria-label="Acheter">
  <span class="prix-mini">47 €</span>
  <a class="btn btn-primaire" href="../#acheter">Obtenir le kit</a>
</div>
</body>
</html>
`;

export function pageMetier(m, tous) {
  const titre = `L'IA pour ${m.un} : devis, relances, posts et paperasse sans coder`;
  const description = `Ce qu'${m.un} fait écrire par ChatGPT, Claude ou Gemini (gratuits) depuis son téléphone : ${m.devis.split(' ').slice(0, 9).join(' ')}… 7 modules, 57 consignes prêtes à copier, module 1 gratuit.`;
  const canonique = BASE + m.slug + '.html';
  const ldjson = {
    '@context': 'https://schema.org', '@type': 'WebPage', name: titre, description, url: canonique, inLanguage: 'fr',
    isPartOf: { '@type': 'WebSite', name: "Kit IA de l'indépendant", url: 'https://kit.kd-mc.com/' },
    about: { '@type': 'Product', name: "Kit IA de l'indépendant", offers: { '@type': 'Offer', price: '47', priceCurrency: 'EUR', url: 'https://kit.kd-mc.com/#acheter' } },
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Kit IA', item: 'https://kit.kd-mc.com/' },
      { '@type': 'ListItem', position: 2, name: 'Par métier', item: BASE + 'index.html' },
      { '@type': 'ListItem', position: 3, name: maj1(m.nom), item: canonique }] },
  };
  /* Voisins : les 6 métiers suivants dans la liste (déterministe, boucle). */
  const i = tous.findIndex((x) => x.slug === m.slug);
  const voisins = Array.from({ length: 6 }, (_, k) => tous[(i + 1 + k) % tous.length]);
  const situations = SITUATIONS.map(([cle, titreS, module]) =>
    `    <li><strong>${esc(titreS)} <span class="tag">${esc(module)}</span></strong>${esc(maj1(m[cle]))}.</li>`).join('\n');
  return tete({ titre, description, canonique, ldjson }) +
`  <p class="sur"><a href="index.html">L'IA par métier</a></p>
  <h1>${esc(maj1(m.nom))} : fais écrire tes devis, tes relances et tes posts par l'IA. Sans coder.</h1>
  <p class="chapeau">Tu dictes trois infos dans ton téléphone, l'IA écrit, tu relis, tu envoies. Avec les versions <strong>gratuites</strong> de ChatGPT, Claude ou Gemini. Voici ce que ça change concrètement pour ${m.un}.</p>

  <p><a class="btn btn-primaire" href="../lire.html">Lire le module 1 gratuitement</a></p>
  <p class="petit">Pas d'inscription. Tu vois exactement ce que tu achètes avant de payer.</p>

  <h2>Cinq situations d'${m.un}, réglées en quelques minutes</h2>
  <ul class="liste">
${situations}
  </ul>
  <p class="petit">Chaque situation correspond à un module du kit : la consigne prête à copier, l'exemple de résultat, les pièges à éviter. Tu remplaces les crochets par tes infos, tu colles dans l'appli, c'est écrit.</p>

  <h2>Comment ça marche</h2>
  <ol class="modules">
    <li><span class="n"></span><div><strong>Tu copies la consigne</strong>Depuis ton téléphone, en un geste. Elle est déjà écrite pour un métier comme le tien.</div></li>
    <li><span class="n"></span><div><strong>Tu remplaces les crochets</strong>Le nom du client, le montant, la date : trois infos dictées, pas plus.</div></li>
    <li><span class="n"></span><div><strong>Tu relis, tu envoies</strong>L'IA propose, tu décides. Rien ne part sans toi, et rien de ce qu'on ne lui donne jamais n'est demandé.</div></li>
  </ol>

  <div class="encart">
    <p class="sur">Le kit complet</p>
    <div class="prix"><span class="maintenant">47 €</span><span class="avant">97 €</span></div>
    <p>7 modules, 57 consignes prêtes à copier, accès <strong>2 ans</strong> sur téléphone et ordinateur. Prix de lancement.</p>
    <p><a class="btn btn-primaire" href="../#acheter">Obtenir le kit, 47 €</a></p>
    <p><a class="btn btn-secondaire" href="../#club">Ou le Club : une consigne nouvelle chaque semaine, 59 € par an</a></p>
  </div>

  <h2>Questions que se posent les ${esc(m.pluriel)}</h2>
  <div class="faq">
    <details><summary>Il faut payer ChatGPT ou Claude en plus ?</summary><p>Non. Tout fonctionne avec les versions gratuites. Le module 1, offert, te dit laquelle prendre.</p></details>
    <details><summary>Je ne suis pas à l'aise avec la technique.</summary><p>C'est fait pour toi : copier, remplacer les crochets, coller. Zéro réglage, zéro code, tout depuis ton téléphone.</p></details>
    <details><summary>Les consignes parlent vraiment de mon métier ?</summary><p>Elles sont écrites pour être adaptées à n'importe quel indépendant. Chaque module montre deux métiers différents en exemple, et les crochets te laissent mettre ton vocabulaire, tes prix, tes clients.</p></details>
    <details><summary>Et mes données clients ?</summary><p>Le module 1 liste ce qu'on ne donne jamais à une IA (numéros de carte, mots de passe, données de santé) et comment travailler avec des initiales. Tu restes le seul à voir tes vrais fichiers.</p></details>
  </div>

  <h2>Autres métiers</h2>
  <p class="petit">${voisins.map((v) => `<a href="${v.slug}.html">${esc(maj1(v.nom))}</a>`).join(' · ')} · <a href="index.html">tous les métiers</a></p>

` + PIED;
}

export function pageIndex(tous) {
  const titre = "L'IA par métier : ce que le Kit IA de l'indépendant fait écrire pour toi";
  const description = `${tous.length} métiers, cinq situations chacun : devis, relances, réseaux, paperasse, routines. Trouve le tien et vois ce que l'IA écrit à ta place, sans coder.`;
  const canonique = BASE + 'index.html';
  const ldjson = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: titre, description, url: canonique, inLanguage: 'fr',
    isPartOf: { '@type': 'WebSite', name: "Kit IA de l'indépendant", url: 'https://kit.kd-mc.com/' } };
  const tries = [...tous].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return tete({ titre, description, canonique, ldjson }) +
`  <p class="sur"><a href="../">Kit IA de l'indépendant</a></p>
  <h1>L'IA par métier</h1>
  <p class="chapeau">${tous.length} métiers, cinq situations chacun. Trouve le tien : tu verras exactement ce que l'IA écrit à ta place, du devis au post Instagram, sans coder.</p>
  <ul class="liste">
${tries.map((m) => `    <li><strong><a href="${m.slug}.html">${esc(maj1(m.nom))}</a></strong>${esc(maj1(m.devis))}.</li>`).join('\n')}
  </ul>
  <p class="petit">Ton métier n'y est pas ? Les consignes du kit s'adaptent à n'importe quel indépendant : <a href="../lire.html">lis le module 1 gratuit</a> pour t'en rendre compte.</p>

` + PIED;
}

export function blocSitemap(tous, maj) {
  const ligne = (loc, prio) => `<url><loc>${loc}</loc><lastmod>${maj}</lastmod><priority>${prio}</priority><changefreq>monthly</changefreq></url>`;
  return [REPERE_DEBUT, ligne(BASE + 'index.html', '0.8'), ...tous.map((m) => ligne(BASE + m.slug + '.html', '0.7')), REPERE_FIN].join('\n');
}
export function sitemapAvec(xml, bloc) {
  const re = new RegExp(REPERE_DEBUT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + REPERE_FIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (re.test(xml)) return xml.replace(re, bloc);
  return xml.replace('</urlset>', bloc + '\n</urlset>');
}

/* Ce qui DOIT être sur disque : { chemin relatif → contenu }. */
export function attendu() {
  const { metiers, maj } = lireMetiers();
  const fichiers = { 'index.html': pageIndex(metiers) };
  for (const m of metiers) fichiers[m.slug + '.html'] = pageMetier(m, metiers);
  return { fichiers, sitemap: sitemapAvec(readFileSync(SITEMAP, 'utf8'), blocSitemap(metiers, maj)), metiers };
}

export function ecarts() {
  const { fichiers, sitemap } = attendu();
  const diff = [];
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const f = join(DOSSIER, nom);
    if (!existsSync(f)) diff.push('manquant : pour/' + nom);
    else if (readFileSync(f, 'utf8') !== contenu) diff.push('différent : pour/' + nom);
  }
  if (existsSync(DOSSIER)) for (const f of readdirSync(DOSSIER)) if (f.endsWith('.html') && !fichiers[f]) diff.push('orphelin : pour/' + f + ' (métier retiré de metiers.json ?)');
  if (readFileSync(SITEMAP, 'utf8') !== sitemap) diff.push('différent : shops/sitemap.xml');
  return diff;
}

export function ecrire() {
  const { fichiers, sitemap, metiers } = attendu();
  mkdirSync(DOSSIER, { recursive: true });
  for (const f of readdirSync(DOSSIER)) if (f.endsWith('.html') && !fichiers[f]) unlinkSync(join(DOSSIER, f));
  for (const [nom, contenu] of Object.entries(fichiers)) writeFileSync(join(DOSSIER, nom), contenu);
  writeFileSync(SITEMAP, sitemap);
  return metiers.length;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  if (process.argv.includes('--verifier')) {
    const d = ecarts();
    if (d.length) { console.error('pages métiers à régénérer (node tools/kit/pages-metiers.mjs) :\n  ' + d.join('\n  ')); process.exit(1); }
    console.log('pages métiers : identiques à la source');
  } else {
    console.log(ecrire() + ' pages métier + index écrits dans shops/kit-ia/pour/, sitemap mis à jour');
  }
}
