/* GARDE-FOU — « Il manque la tuile dans mon domaine » (Kevin 2026-09-17).
 *
 * Ce qui s'est passé, mesuré : javis.kd-mc.com existait DE PARTOUT sauf là où ça compte.
 * L'app était écrite (javis/), l'adresse était routée (ROUTES + wrangler + sonde), son
 * nom et son emoji étaient dans apps.json, dans kdmc-portal.js et dans l'admin… mais
 * AUCUNE tuile ne la montrait sur kd-mc.com. Kevin ne pouvait donc pas l'ouvrir.
 * Trois autres pages étaient dans le même cas : rotaplan, kit, croupier.
 *
 * Une tuile absente = une app qui n'existe pas (c'est déjà écrit en commentaire dans
 * kdmc-home/index.html à propos du bot crypto — la règle ne vivait que dans un
 * commentaire, donc elle a été sautée : leçon #142, une règle sans garde finit sautée).
 *
 * `tests/portail-adresses.test.mjs` vérifie le sens TUILE → ROUTEUR (pas de lien mort).
 * Celui-ci verrouille le sens inverse, ROUTEUR → TUILE (pas d'app introuvable).
 *
 * node tests/verify-tuiles-apps.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8');

const portail = lire('kdmc-home/index.html');
const worker = lire('services/kdmc-router/worker.js');

let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* Les adresses réellement servies par le domaine (le bloc ROUTES du routeur). */
const blocRoutes = (worker.match(/const ROUTES = \{[\s\S]*?\n\};/) || [''])[0];
const ROUTES = {};
for (const m of blocRoutes.matchAll(/'([a-z0-9.-]+\.kd-mc\.com|kd-mc\.com)':\s*'([^']+)'/g)) ROUTES[m[1]] = m[2];
ok(Object.keys(ROUTES).length >= 20, `ROUTES du routeur lues : ${Object.keys(ROUTES).length} (≥20 attendu)`);

/* Adresses qui n'ont PAS à porter leur propre tuile, avec la raison écrite.
   Un alias mène au même endroit qu'une adresse déjà affichée : deux tuiles pour la
   même page, c'est du bruit. Tout le reste DOIT être atteignable. */
const ALIAS = {
  'www.kd-mc.com': 'même page que kd-mc.com',
  'departs.kd-mc.com': 'ancien nom de cmcteams-light.kd-mc.com (même page)',
  'cuisine.kd-mc.com': 'alias de la cuisine, affichée via kd-mc.com → cujina',
  'cocina.kd-mc.com': 'alias de la cuisine, affichée via kd-mc.com → cujina',
  'cujina.kd-mc.com': 'alias de la cuisine, affichée via kd-mc.com → cujina',
  'kd-mc.com': "c'est le portail lui-même",
};

/* Portails secondaires : une app peut être montrée là-bas PLUTÔT que sur kd-mc.com,
   à condition que le portail secondaire soit LUI-MÊME affiché sur kd-mc.com (sinon
   on déplace juste le problème d'un cran). */
const SOUS_PORTAILS = [{ hote: 'shops.kd-mc.com', fichier: 'shops/index.html' }];
for (const sp of SOUS_PORTAILS)
  ok(portail.includes(`https://${sp.hote}/`), `le sous-portail ${sp.hote} n'a pas de tuile sur kd-mc.com`);
const sousPortails = SOUS_PORTAILS.map((sp) => ({ ...sp, html: lire(sp.fichier) }));

/* Une app est « atteignable » si :
     · kd-mc.com porte un lien direct vers son adresse (https://hote/) ;
     · ou kd-mc.com porte un lien vers le chemin qu'elle sert (ex. /cujina) ;
     · ou un sous-portail affiché sur kd-mc.com porte un lien relatif vers son dossier. */
function atteignable(hote, chemin) {
  if (portail.includes(`href="https://${hote}/`)) return true;
  const dossier = chemin.replace(/\/+$/, '').split('/').pop();
  if (new RegExp(`href="/${dossier}(/|")`).test(portail)) return true;
  return sousPortails.some((sp) => new RegExp(`href="${dossier}/"`).test(sp.html));
}

for (const [hote, chemin] of Object.entries(ROUTES)) {
  if (ALIAS[hote]) { pass++; continue; }
  ok(atteignable(hote, chemin), `${hote} est servie par le domaine mais AUCUNE tuile ne la montre (app introuvable pour Kevin)`);
}

/* Anti-retour en arrière sur les 4 tuiles nées de cet incident. */
ok(/id="javis-zone"/.test(portail) && portail.includes('https://javis.kd-mc.com/'), 'la tuile Javis a disparu du portail');
for (const d of ['rotaplan', 'kit-ia', 'croupier'])
  ok(sousPortails[0].html.includes(`href="${d}/"`), `la tuile ${d} a disparu du portail boutiques`);

/* Chaque nom affiché dans apps.json correspond à une adresse réellement routée
   (sinon le journal des connexions affiche une app qui n'existe plus). */
const apps = JSON.parse(lire('kdmc-home/apps.json')).apps || {};
for (const hote of Object.keys(apps))
  ok(!!ROUTES[hote], `apps.json nomme ${hote}, absente des ROUTES du routeur`);

console.log(`Tuiles ⇄ apps du domaine : ${pass} vérifications OK, ${fails.length} échec(s)`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
