/* GARDE — TOUTE APP QUI LIT LE LAISSEZ-PASSER DOIT LE RECEVOIR, ET SEULEMENT ELLE (26.09.2026)
 *
 * Sur iPhone, une app posée sur l'écran d'accueil garde ses cookies ISOLÉS : la session du
 * domaine ne la traverse que par un laissez-passer signé glissé dans le lien (#kdmc_sso=).
 * Le portail (kdmc-home/kdmc-portal.js) ne l'ajoute QUE pour les apps de sa liste
 * SSO_PASS_CONSUMERS.
 *
 * Mesuré le 26.09 à 23h19 sur l'iPhone de Kevin : javis.kd-mc.com LIT ce laissez-passer
 * (tools/javis/javis-widget.js, ssoToken) mais n'était PAS dans la liste → « Bee est personnelle
 * à Kevin » pour Kevin lui-même, sans issue. Il y avait en plus DEUX listes dans le portail, déjà
 * divergentes. Les deux sens comptent :
 *   · une app qui LIT #kdmc_sso= mais n'est pas listée → l'utilisateur est bloqué dehors ;
 *   · une app listée qui NE le lit PAS → le jeton traîne dans l'adresse, et une app à routeur #hash
 *     affiche « Page introuvable » (leçon #101).
 * On LIT le code de chaque app (dossier donné par la table ROUTES du routeur) : rien de recopié.
 *
 * node tests/verify-laissez-passer.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* 1. La liste du portail — et une SEULE. */
const portail = readFileSync(join(ROOT, 'kdmc-home/kdmc-portal.js'), 'utf8');
const m = portail.match(/var SSO_PASS_CONSUMERS\s*=\s*\{([\s\S]*?)\};/);
ok(!!m, 'kdmc-portal.js : la liste SSO_PASS_CONSUMERS est introuvable');
const liste = new Set(m ? [...m[1].matchAll(/'([a-z0-9.-]+\.kd-mc\.com)'\s*:\s*1/g)].map((x) => x[1]) : []);
ok(liste.size > 0, 'la liste des apps qui reçoivent le laissez-passer est vide');
/* Plus de seconde liste écrite en dur (c'est comme ça qu'elles avaient divergé). */
ok(!/host\s*!==\s*'[a-z0-9-]+\.kd-mc\.com'/.test(portail),
  'kdmc-portal.js compare encore un hôte écrit en dur : une seconde liste réapparaît (elles avaient divergé)');

/* 2. Qui LIT le laissez-passer ? On le demande au code de chaque app. */
const worker = readFileSync(join(ROOT, 'services/kdmc-router/worker.js'), 'utf8');
const routes = [...(worker.match(/const ROUTES = \{([\s\S]*?)\n\};/) || ['', ''])[1]
  .matchAll(/'([a-z0-9.-]*kd-mc\.com)'\s*:\s*'\/CMCteams\/?([^']*)'/g)].map((x) => ({ hote: x[1], dossier: x[2] }));
ok(routes.length > 10, `table ROUTES du routeur illisible (${routes.length} entrées lues)`);
const LIT = /(?:match|test|exec)\([^)]*kdmc_sso=|kdmc_sso=\(\[\^&\]\+\)|consumeHashToken|_kdmcConsumeHashPass/;
/* Ce que le portail ouvre, c'est la PAGE D'ENTRÉE de l'app (sa racine) : c'est elle qui doit lire le
   laissez-passer. On lit donc son index.html + les scripts LOCAUX qu'il charge (<script src>), rien
   d'autre. Trois faux coupables trouvés en écrivant cette garde (leçon #331 : une garde qui ne regarde
   pas au bon endroit accuse du code sain) quand elle fouillait tout le dossier :
   · shops.kd-mc.com « lisait » le laissez-passer… par ses sous-dossiers dashboard, sourcing (d'autres
     apps, avec leur propre adresse), une vieille copie shops/la-detente (l'adresse la-detente pointe
     ailleurs) et _shared/kdmc-shop-admin.js (chargé par 4 boutiques de démo, pas par l'accueil) ;
   · la copie de Bee embarquée dans l'arbre lit le laissez-passer pour Bee, pas pour l'arbre.
   La racine (cmcteams.kd-mc.com → dossier vide) = index.html de la racine. */
function lit(dossier) {
  if (dossier === 'kdmc-home') return false;                        /* le portail ÉMET, il ne consomme pas */
  const entree = join(ROOT, dossier, 'index.html');
  if (!existsSync(entree)) return false;
  const html = readFileSync(entree, 'utf8');
  if (LIT.test(html)) return true;
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"'#?]+)/gi)) {
    if (/^(?:[a-z]+:)?\/\//i.test(src)) continue;                    /* script externe : pas le nôtre */
    const f = src.startsWith('/') ? join(ROOT, src.replace(/^\/(?:CMCteams\/)?/, '')) : join(dirname(entree), src);
    if (!existsSync(f) || statSync(f).size > 4e6) continue;
    if (/javis-widget\.js$/.test(f) && dossier !== 'javis') continue; /* Bee embarquée : lit pour Bee */
    if (LIT.test(readFileSync(f, 'utf8'))) return true;
  }
  return false;
}
/* Apps qui LISENT le laissez-passer mais ne le reçoivent PAS encore — chacune avec sa raison.
   Une app qui lit sans être listée NI ici échoue : c'est le trou qui a enfermé Kevin hors de Bee. */
const PAS_ENCORE = {
  'cmcteams.kd-mc.com': 'CMCteams navigue par « # » (leçon #101 : un fragment inattendu y donne « Page introuvable »). '
    + 'L\'ajouter demande sa propre preuve en vrai navigateur sur l\'app des 260 employés — pas un ajout de nuit (26.09).',
};
const vus = new Map();
for (const r of routes) if (!vus.has(r.hote)) vus.set(r.hote, lit(r.dossier));
for (const [hote, consomme] of vus) {
  if (PAS_ENCORE[hote]) {                                            /* exception écrite, avec sa raison */
    ok(!liste.has(hote), `${hote} a été ajoutée à la liste du portail alors qu'elle est en exception (${PAS_ENCORE[hote]}) : `
      + 'apporter d\'abord sa preuve en vrai navigateur, PUIS retirer l\'exception');
    continue;
  }
  if (consomme) ok(liste.has(hote),
    `${hote} LIT le laissez-passer (#kdmc_sso=) mais le portail ne le lui donne pas : sur iPhone (app de l'écran d'accueil, cookies isolés) l'utilisateur reste DEHORS — c'est ce qui a bloqué Kevin sur Bee le 26.09`);
}
for (const hote of liste) {
  ok(vus.has(hote), `${hote} est dans la liste du portail mais n'est pas une adresse du routeur`);
  if (vus.has(hote)) ok(vus.get(hote),
    `${hote} reçoit le laissez-passer mais son code ne le LIT pas : le jeton traînerait dans l'adresse (et « Page introuvable » sur une app à routeur #hash, leçon #101)`);
}
/* Une exception qui ne sert plus (l'app ne lit plus, ou n'existe plus) est retirée, pas gardée. */
for (const hote of Object.keys(PAS_ENCORE)) ok(vus.get(hote) === true,
  `${hote} est en exception PAS_ENCORE mais ne lit plus le laissez-passer (ou n'est plus routée) : retirer l'exception`);
ok(liste.has('javis.kd-mc.com'), 'javis.kd-mc.com doit recevoir le laissez-passer (panne du 26.09)');

console.log(`Laissez-passer du domaine : ${pass} vérifications OK, ${fails.length} échec(s)`);
console.log(`  (${liste.size} app(s) dans la liste : ${[...liste].join(', ')} · ${[...vus.values()].filter(Boolean).length} app(s) lisent le laissez-passer)`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
