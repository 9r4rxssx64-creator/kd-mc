#!/usr/bin/env node
/* tableau-de-bord.mjs — fabrique la partie STATIQUE du tableau de bord Commerce
   (kd-mc.com/admin/commerce.html, Kevin 2026-09-17 « un tableau de bord où je
   peux voir tout ce que tu as créé par rapport au commerce, en tuiles »).

   Une seule source pour chaque chose, jamais recopiée à la main :
     · produits   ← tools/produits/catalogue.json (+ les produits hors catalogue
                    de la caisse : kit, Club, croupier — infos PUBLIQUES seulement)
     · vidéos     ← tools/pub/scripts.json + l'hébergement public (tools/pub/media.json)
     · programmes ← tools/pub/programmation.json (posts Metricool, ids + créneaux)
     · pages      ← ce qui existe VRAIMENT sur disque (shops/kit-ia/pour/*.html…)
     · marché     ← la recherche du 17.09 avec ses sources (chiffres cités, pas
                    inventés ; ce qui n'est pas mesuré est marqué 🔴)
   Le LIVE (ventes, file, Club, contenu en base, workflows) vient du worker
   kdmc-vente (/admin/tableau), pas d'ici.

   `node tools/produits/tableau-de-bord.mjs` écrit kdmc-home/admin/commerce-data.json
   `--verifier` = code 1 si le fichier sur disque diverge de ce que les sources
   produisent (garde CI : un catalogue qui bouge sans régénérer = tableau faux). */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { urlDe } from '../pub/media.mjs';
import { pathToFileURL } from 'node:url';
import { lireCatalogue } from './fabrique.mjs';
import { __test as caisse } from '../../services/kdmc-vente/worker.js';

export const SORTIE = new URL('../../kdmc-home/admin/commerce-data.json', import.meta.url);
const SCRIPTS = new URL('../pub/scripts.json', import.meta.url);
const PROGRAMMATION = new URL('../pub/programmation.json', import.meta.url);
const RACINE = new URL('../../', import.meta.url);
const DEPOT = 'https://github.com/9r4rxssx64-creator/cmcteams';
/* Les MP4 ne vivent plus dans une release GitHub : depuis que le dépôt est privé
   (23.09) ses adresses répondent 404 pour tout le monde. Une seule vérité —
   tools/pub/media.json, écrit par le workflow « Pub — héberge les vidéos sur R2 ». */
const MP4 = (id) => urlDe(id);

/* Produits vendus par la caisse mais qui ne vivent pas dans le catalogue de la
   fabrique (leur contenu a été écrit à la main). Infos publiques uniquement. */
export const HORS_CATALOGUE = [
  { id: 'kit-ia', court: "Kit IA de l'indépendant", page: 'https://kit.kd-mc.com/', modulesAttendus: 7, famille: 'kit', gele: false },
  { id: 'club-ia', court: 'Club IA au Boulot (1 an)', page: 'https://kit.kd-mc.com/#club', modulesAttendus: null, famille: 'club', gele: false },
  { id: 'croupier-pro', court: 'Croupier Pro — entraînement', page: 'https://croupier.kd-mc.com/', modulesAttendus: null, famille: 'casino', gele: true },
  { id: 'croupier-entretien', court: "Croupier — l'entretien", page: 'https://croupier.kd-mc.com/', modulesAttendus: null, famille: 'casino', gele: true },
];

/* Recherche marché du 17.09.2026 — chaque chiffre a sa source ; ce qui est à
   nous et non mesuré reste marqué. Aucun « rendement » promis : des relevés. */
export const MARCHE = {
  date: '2026-09-17',
  nos_ventes: { mesure: 'KV VENTES (clés code:*) lue en direct par le tableau', note: 'Tant que la caisse affiche 0, la niche la plus rentable CHEZ NOUS n\'est pas mesurable : on s\'appuie sur le marché.' },
  releves: [
    { source: 'InsightRaider — 146 271 produits Gumroad analysés (2026)', url: 'https://insightraider.com/en/answers/what-digital-products-sell-best-on-gumroad', faits: ['Business & Money : 3ᵉ catégorie en revenu total (15,4 M$)', 'Software Development : 1ʳᵉ (65,8 M$, 60 814 $ par produit)', 'Writing & Publishing : 15 750 $ par produit sur 226 produits seulement — le meilleur rapport chances/concurrence', 'La catégorie « Other » (produits atypiques, ticket élevé) : 88 048 $ par produit'] },
    { source: 'InsightRaider — 24 724 vendeurs Gumroad (taille de catalogue)', url: 'https://insightraider.com/en/blog/gumroad-catalog-size-revenue-data', faits: ['Revenu médian par produit : 134 $ avec 1 produit, 187 $ avec 2-3 produits (+40 %), 112 $ à 8 produits et plus (−40 % vs le pic)', 'Donc : peu de produits, bien tenus, plutôt qu\'une longue liste'] },
    { source: 'Reddit r/EntrepreneurRideAlong — 200 000+ produits Gumroad suivis', url: 'https://www.reddit.com/r/EntrepreneurRideAlong/comments/1s9k56c/i_tracked_200000_digital_products_on_gumroad_most/', faits: ['Graphisme : ~40 000 produits, 34 % font au moins une vente (le plus encombré)', 'La niche la plus rentable du relevé : 17 % des produits vendent, mais revenu médian 3 200 $ chez ceux qui vendent'] },
    { source: 'CreateSell — Etsy 2026', url: 'https://createsell.com/blog/best-digital-products-to-sell-on-etsy', faits: ['Planificateurs numériques : 5,8 M de vues par mois, prix moyen 6,97 $ (volume, petit ticket)', 'Modèles de site : prix moyen 44,53 $ (moins de volume, ticket plus haut)'] },
    { source: 'Pilotage IA — marché francophone', url: 'https://www.pilotage-ia.fr/produits-numeriques-ia/', faits: ['Formations : ticket moyen le plus élevé (97 € à 997 €)', 'Packs de consignes IA prêts à l\'emploi : demande soutenue en 2026 (répondre plus vite, mieux vendre, service client)'] },
  ],
  conclusion: [
    'Le meilleur rendement PAR PRODUIT va aux acheteurs qui paient déjà pour leur travail (pros, entreprises) et aux tickets élevés — pas aux planificateurs à 7 $.',
    'Chez nous, le produit le plus aligné : Kit IA de l\'agent immobilier (67 €, un pro qui gagne du temps sur chaque mandat). Ensuite : le Club (59 €/an, récurrent) et le Kit au bureau (37 €).',
    'Copié du relevé « 2-3 produits » : on n\'ouvre pas de 7ᵉ niche tant que les 6 ne vendent pas — on met la pub sur immo et sur le Club.',
    '🔴 Non mesuré : nos ventes (0 au 17.09, pub programmée du 18 au 25.09). Le tableau relit la caisse en direct : dès qu\'un chiffre apparaît, il compte plus que tout ce qui précède.',
  ],
};

export const WORKFLOWS_ATTENDUS = ['produit-fabrique.yml', 'pub-videos.yml', 'club-semaine.yml', 'audit-live.yml', 'deploy-kdmc-vente.yml'];

function lireJson(url) { return JSON.parse(readFileSync(url, 'utf8')); }

export function construit({ catalogue = lireCatalogue(), scripts = lireJson(SCRIPTS), programmation = lireJson(PROGRAMMATION), racine = RACINE } = {}) {
  const produits = catalogue.produits.map((p) => ({
    id: p.id, court: p.court, nom: p.nom, slug: p.slug, prix: p.prix, prixBarre: p.avant || null,
    page: 'https://kit.kd-mc.com/' + p.slug + '.html', lecteur: 'https://kit.kd-mc.com/lire.html?produit=' + p.id,
    modulesAttendus: p.modules.length, gratuits: p.modules.filter((m) => m.gratuit).length, cible: p.cible, famille: 'niche', gele: false,
  })).concat(HORS_CATALOGUE.map((h) => {
    /* Prix et nom = ceux de la caisse (source unique : c'est elle qui reconnaît un paiement). */
    const c = caisse.PRODUITS[h.id];
    if (!c) throw new Error('produit hors catalogue inconnu de la caisse : ' + h.id);
    return { ...h, nom: c.nom, prix: c.prix, prixBarre: null, lecteur: h.famille === 'kit' || h.famille === 'club' ? 'https://kit.kd-mc.com/lire.html' : null };
  }));

  const liens = (programmation.liens || []).map((l) => ({ ...l, url: 'https://kit.kd-mc.com/' + (l.produit === 'kit' ? '' : l.produit + '.html'), apercu: 'https://kit.kd-mc.com/og/' + l.produit + '.png' }));
  const parPost = new Map(programmation.posts.map((x) => [x.video, x]));
  const videos = scripts.videos.map((v) => {
    const pr = parPost.get(v.id) || null;
    return { id: v.id, produit: v.produit, page: v.page, theme: v.theme, cartes: v.lignes.length, mp4: MP4(v.id), post: pr ? pr.post : null, date: pr ? pr.date : null, legende: v.legende.slice(0, 120) };
  });

  const dirMetiers = new URL('shops/kit-ia/pour/', racine);
  const metiers = existsSync(dirMetiers) ? readdirSync(dirMetiers).filter((f) => f.endsWith('.html') && f !== 'index.html').length : 0;
  const pages = [
    { ic: '🧰', nom: 'Kit IA — page mère', url: 'https://kit.kd-mc.com/', quoi: 'kit 47 € + Club 59 €' },
    { ic: '📚', nom: 'Lecteur (module 1 gratuit → payant)', url: 'https://kit.kd-mc.com/lire.html', quoi: 'sert la base D1 contre un code' },
    { ic: '🔎', nom: 'L\'IA par métier', url: 'https://kit.kd-mc.com/pour/index.html', quoi: metiers + ' pages métier (SEO longue traîne)' },
    ...catalogue.produits.map((p) => ({ ic: '🏷️', nom: p.court, url: 'https://kit.kd-mc.com/' + p.slug + '.html', quoi: p.prix + ' €' })),
    { ic: '🎰', nom: 'Croupier (gelé par Kevin 16.09)', url: 'https://croupier.kd-mc.com/', quoi: '39 € / 19 € — en attente' },
    { ic: '🛍️', nom: 'Boutiques POD (6) — dashboard', url: 'https://dashboard.kd-mc.com/', quoi: 'commandes Firebase, hors caisse' },
    { ic: '🎬', nom: 'Vidéos de pub', url: MP4('index').replace(/index\.mp4$/, 'index.json'), quoi: videos.length + ' MP4 publics' },
    { ic: '📅', nom: 'Planning Metricool', url: programmation.planning, quoi: 'marque ' + programmation.marque },
  ];

  const workflows = {
    'produit-fabrique.yml': { nom: 'Fabrique : écrire un kit en base', inputs: { produit: catalogue.produits.map((p) => p.id), dry_run: ['true', 'false'], refaire: 'texte' }, defaut: { produit: 'avis-ia', dry_run: 'true' } },
    'pub-videos.yml': { nom: 'Pub : vidéos et posts-liens Facebook', inputs: { videos: ['all', ...new Set(scripts.videos.map((v) => v.id.split('-')[0]))], publier: ['false', 'true'], nouveaux: ['', 'immo:1,club:1', ...[...new Set(scripts.videos.map((v) => v.id.split('-')[0]))].map((n) => n + ':1')], lien: ['non', 'oui'], programmer: 'texte', programmer_lien: 'texte', branche: 'texte' }, defaut: { videos: 'all', publier: 'false', nouveaux: '', lien: 'non' } },
    'club-semaine.yml': { nom: 'Club : consigne de la semaine', inputs: { dry_run: ['true', 'false'], tester_email: ['false', 'true'] }, defaut: { dry_run: 'true', tester_email: 'false' } },
    'audit-live.yml': { nom: 'Audit LIVE des vraies pages', inputs: {}, defaut: {} },
    'deploy-kdmc-vente.yml': { nom: 'Redéployer la caisse', inputs: {}, defaut: {} },
  };

  return {
    _doc: 'GÉNÉRÉ par tools/produits/tableau-de-bord.mjs — ne pas éditer à la main (npm run commerce:data). Partie statique du tableau de bord Commerce ; le live vient de kdmc-vente /admin/tableau.',
    maj: catalogue.maj || null, depot: DEPOT, caisse: 'https://kdmc-vente.9r4rxssx64.workers.dev',
    produits, videos, liens, programmation: { marque: programmation.marque, planning: programmation.planning, reseaux: programmation.reseaux, fuseau: programmation.fuseau },
    pages, workflows, marche: MARCHE,
  };
}

export function texte(data) { return JSON.stringify(data, null, 2) + '\n'; }

export function principal(argv = process.argv.slice(2)) {
  const attendu = texte(construit());
  if (argv.includes('--verifier')) {
    const actuel = existsSync(SORTIE) ? readFileSync(SORTIE, 'utf8') : '';
    if (actuel !== attendu) { console.error('commerce-data.json diverge des sources — lance : node tools/produits/tableau-de-bord.mjs'); return 1; }
    console.log('commerce-data.json à jour');
    return 0;
  }
  writeFileSync(SORTIE, attendu);
  const d = JSON.parse(attendu);
  console.log('commerce-data.json écrit : ' + d.produits.length + ' produits, ' + d.videos.length + ' vidéos (' + d.videos.filter((v) => v.post).length + ' programmées), ' + d.liens.length + ' post(s)-lien, ' + d.pages.length + ' pages, ' + Object.keys(d.workflows).length + ' workflows');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = principal();
