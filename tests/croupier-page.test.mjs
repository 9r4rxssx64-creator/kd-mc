/* Garde de la page « Devenir croupier » (shops/croupier/index.html).
 *
 * POURQUOI : c'est un produit commercial public, sur un sujet sensible (casino).
 * Trois choses doivent rester vraies quoi qu'il arrive :
 *   1. la page ne devient JAMAIS une méthode pour jouer — c'est un guide de MÉTIER ;
 *   2. les rapports de paiement affichés sont EXACTS (35:1, 17:1… sont des faits) ;
 *   3. la mention d'aide au jeu et les liens légaux restent en place.
 * Le rendu réel (3 affichages, polices, contrastes, 0 débordement) se mesure en
 * navigateur ; ce fichier fige ce qui doit rester vrai dans la source.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const h = readFileSync(join(RACINE, 'shops/croupier/index.html'), 'utf8');
const echecs = [];
const verifie = (nom, ok, detail = '') => { if (!ok) echecs.push(`${nom}${detail ? ' — ' + detail : ''}`); };

/* 1. Sécurité : page publique sur domaine public. */
const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
verifie('CSP présente', !!csp);
verifie("CSP interdit tout script", csp.includes("script-src 'none'"));
verifie('pas de frame-ancestors en <meta> (ignoré par le navigateur)', !csp.includes('frame-ancestors'));

/* 2. LE POINT LE PLUS IMPORTANT : ça reste un guide de métier, jamais une méthode de jeu. */
verifie("dit explicitement que ce n'est pas une méthode pour gagner",
  h.includes("Ce n'est pas une méthode pour gagner au casino"));
verifie('mention d\'aide au jeu présente (09 74 75 13 13)', h.includes('09 74 75 13 13'));
verifie('dit que le site ne propose aucun jeu d\'argent', h.includes("ne propose aucun jeu d'argent"));
for (const interdit of ['gagner plus', 'battre la banque', 'martingale', 'système gagnant', 'astuce pour gagner']) {
  verifie(`n'emploie pas « ${interdit} »`, !new RegExp(interdit, 'i').test(h));
}

/* 3. Les rapports de paiement sont des FAITS : ils ne doivent pas dériver. */
const paiements = [
  ['Plein', '35 : 1'], ['Cheval', '17 : 1'], ['Transversale pleine', '11 : 1'],
  ['Carré', '8 : 1'], ['Sixain', '5 : 1'], ['Douzaine', '2 : 1'],
];
for (const [mise, taux] of paiements) {
  const re = new RegExp(`<td>${mise}[^<]*</td>[\\s\\S]{0,80}?<td>${taux.replace(/ /g, '\\s*')}</td>`);
  verifie(`roulette : ${mise} paie ${taux}`, re.test(h));
}
verifie('blackjack paie 3 : 2', /Blackjack du joueur<\/td>\s*<td>3\s*:\s*2<\/td>/.test(h));
verifie('assurance paie 2 : 1', /Assurance<\/td>\s*<td>2\s*:\s*1<\/td>/.test(h));
verifie('commission banco 5 %', h.includes('1 : 1 − 5 %'));

/* 3 bis. Kevin 26.09 : « Rectifie les horaires, les jeux… vérifie toutes les informations ».
   Les faits du métier viennent de NOS documents, jamais d'une supposition : horaires = codes
   des plannings des jeux de table (14/19, 16/22, 16/3, 19/4, 20/5, 22/6) ; pauses, collation,
   âge, contrat, écoles, promotions = convention collective du 1er avril 2015 (art. 4, 5, 6,
   10, 11, 13, 17.8, 17.9). La page disait « prise de service 20:30 · fermeture 04:00 » (inventé),
   « après un certain âge », et oubliait le Texas Hold'em et le poker cash game. */
const texte = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
for (const [a, b] of [['14 h', '19 h'], ['16 h', '22 h'], ['16 h', '3 h'], ['19 h', '4 h'], ['20 h', '5 h'], ['22 h', '6 h']]) {
  verifie(`service ${a} → ${b} cité (plannings réels)`, texte.includes(`${a} → ${b}`));
}
verifie('plus d\'horaire inventé (20:30 / 04:00 fermeture)', !/<b>20:30<\/b>|<b>04:00<\/b>/.test(h));
verifie('55 ans et femmes enceintes : pause toutes les 40 minutes (art. 17.8)',
  /55 ans/.test(texte) && /femmes enceintes/.test(texte) && /40 minutes/.test(texte) && /17\.8/.test(texte));
verifie('collation de nuit entre 3 h et 7 h (art. 17.9)', texte.includes('entre 3 h et 7 h'));
for (const jeu of ['blackjack', 'roulette anglaise', "Texas Hold'em", 'punto banco', 'roulette européenne', 'craps', 'poker cash game']) {
  verifie(`jeu cité : ${jeu}`, texte.includes(jeu));
}
verifie('niveaux 1 à 7 selon les jeux validés (art. 10)', /de 1 \(un jeu\) à 7/.test(texte));
verifie('âge minimum 21 ans (art. 4)', texte.includes('21 ans'));
verifie('contrat 12 mois dont 3 d\'essai, décision à 18 mois (art. 6)', /12 mois/.test(texte) && /3 mois d'essai/.test(texte) && /18 mois/.test(texte));
verifie('écoles : jusqu\'à 5 dans les 9 ans, un an entre deux (art. 5)', /jusqu'à 5 dans les 9 ans/.test(texte) && /au moins un an entre deux/.test(texte));
verifie('école d\'intégration : 8 sur 20 éliminatoire, 3 mois minimum (art. 5.1)', /8 sur 20/.test(texte) && /au moins 3 mois/.test(texte));

/* 4. Système de design « editorial » : les jetons restent ceux du système. */
verifie('système nommé cité en commentaire', h.includes('awesome-design-skills/skills/editorial'));
verifie('primaire du système conservé', h.includes('--primaire:#111111'));
verifie('serif Gelasio du système', h.includes('"Gelasio"'));
verifie('mono Ubuntu Mono du système', h.includes('Ubuntu+Mono') && h.includes('"Ubuntu Mono"'));
verifie('or assombri pour passer AA (l\'or vif ne passe pas)', h.includes('--accent:#8A6A1F'));
verifie('variante sombre présente', h.includes('prefers-color-scheme: dark'));
verifie('animations coupées si demandé', h.includes('prefers-reduced-motion'));
verifie('focus clavier visible', h.includes(':focus-visible'));

/* 5. Liens et référencement. */
for (const lien of [...h.matchAll(/href="(\/shops\/[^"#]+)"/g)].map((m) => m[1])) {
  verifie(`lien interne ${lien} existe`, existsSync(join(RACINE, lien.replace(/^\//, ''))));
}
const canon = (h.match(/rel="canonical" href="([^"]+)"/) || [])[1] || '';
verifie('adresse canonique déclarée', !!canon);
verifie('présente dans le sitemap à son adresse canonique',
  readFileSync(join(RACINE, 'shops/sitemap.xml'), 'utf8').includes(canon), canon);
verifie('un seul titre principal', (h.match(/<h1[\s>]/g) || []).length === 1);
verifie('cible tactile de la marque ≥ 44 px', /\.marque\{[^}]*min-height:44px/.test(h));

/* 6. Honnêteté commerciale : rien n'est vendu tant que rien n'est livrable. */
verifie('la partie gratuite de l\'entraîneur est annoncée comme gratuite pour toujours',
  h.includes('gratuite, pour toujours'));
verifie('dit que rien n\'est en vente tant que l\'encaissement n\'est pas branché',
  h.includes("rien n'est en vente tant que l'encaissement n'est\n      pas branché") || /rien n'est en vente tant que l'encaissement/.test(h.replace(/\s+/g, ' ')));
verifie('ne demande ni préinscription ni adresse',
  /Aucune préinscription, aucune adresse courriel demandée/.test(h.replace(/\s+/g, ' ')));
verifie('mène bien à l\'entraîneur', h.includes('href="/entrainement.html"'));
verifie('aucun lien de paiement tant que le produit n\'existe pas', !/paypal\.me|checkout|payer maintenant/i.test(h));

if (echecs.length) {
  console.error(`Page Devenir croupier : ${echecs.length} échec(s)`);
  for (const e of echecs) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('Page Devenir croupier : 0 échec (sécurité · jeu responsable · exactitude des paiements · système editorial · liens · honnêteté commerciale)');
