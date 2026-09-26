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
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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

/* Aucune adresse déclarée DEUX FOIS : en JavaScript la 2e écrase la 1re en silence,
   donc un correctif appliqué à la première ligne serait invisible. Trouvé le 26.09 :
   rotaplan et croupier étaient chacun déclarés deux fois dans APPS (même valeur, donc
   sans dégât — mais c'est exactement le pattern « la 2e gagne » de l'erreur #28). */
{
  const blocApps = (worker.match(/const APPS = \{[\s\S]*?\n\};/) || [''])[0];
  for (const [nom, bloc] of [['ROUTES', blocRoutes], ['APPS', blocApps]]) {
    const vus = [...bloc.matchAll(/'((?:[a-z0-9.-]+\.)?kd-mc\.com)':/g)].map((m) => m[1]);
    const doublons = [...new Set(vus.filter((h, i) => vus.indexOf(h) !== i))];
    ok(doublons.length === 0, `${nom} déclare ${doublons.length} adresse(s) DEUX fois (la 2e écrase la 1re en silence) : ${doublons.join(', ')}`);
  }
}

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

/* ─────────────────────────────────────────────────────────────────────────────
   Les DEUX trous que la première version de cette garde ne voyait pas (26.09) :
   elle ne lisait que `ROUTES`, donc ni les pages servies en SOUS-CHEMIN de
   kd-mc.com, ni les dossiers du portail boutiques.
   Vécu : `kd-mc.com/empreinte/` — la page qui calcule l'empreinte du nouveau code
   admin, celle dont Kevin a besoin pour le changer — existait, était servie, et
   AUCUN lien du domaine ne la citait. Introuvable autrement qu'en tapant l'adresse.
   Et `shops/ecocraft/` (une boutique de 116 Ko) manquait au portail boutiques
   alors que ses 3 sœurs y étaient.
   ───────────────────────────────────────────────────────────────────────────── */

/* Toutes les pages du domaine qui peuvent porter un lien (le portail, ses
   sous-pages, le portail boutiques). Un lien entrant compte où qu'il soit. */
const TOUTES_PAGES = [];
(function ramasser(dir) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const f = join(dir, e);
    let st; try { st = statSync(f); } catch { continue; }
    if (st.isDirectory()) ramasser(f);
    else if (/\.(html|js)$/.test(e)) TOUTES_PAGES.push(readFileSync(f, 'utf8'));
  }
})(join(ROOT, 'kdmc-home'));
TOUTES_PAGES.push(lire('shops/index.html'));
const TOUT = TOUTES_PAGES.join('\n');

/* 1. Une sous-page du portail est atteignable par son chemin OU par sa belle adresse. */
for (const d of readdirSync(join(ROOT, 'kdmc-home'))) {
  if (!existsSync(join(ROOT, 'kdmc-home', d, 'index.html'))) continue;
  const parChemin = new RegExp(`href="/${d}(/|")`).test(TOUT);
  const parAdresse = TOUT.includes(`https://${d}.kd-mc.com/`);
  ok(parChemin || parAdresse,
    `kd-mc.com/${d}/ est servie mais AUCUN lien du domaine ne la cite (page orpheline : introuvable sans taper l'adresse)`);
}

/* 2. Chaque boutique a sa tuile dans le portail boutiques — sauf exception écrite. */
const BOUTIQUES_HORS_VITRINE = {
  sourcing: 'back-office fournisseurs : sa place est dans l\'espace privé du portail, pas dans une vitrine publique',
};
const htmlShops = lire('shops/index.html');
for (const d of readdirSync(join(ROOT, 'shops'))) {
  if (!existsSync(join(ROOT, 'shops', d, 'index.html'))) continue;
  if (BOUTIQUES_HORS_VITRINE[d]) {
    ok(TOUT.includes(`https://${d}.kd-mc.com/`) || new RegExp(`href="/${d}(/|")`).test(TOUT),
      `${d} est hors vitrine (${BOUTIQUES_HORS_VITRINE[d]}) mais doit rester atteignable ailleurs`);
    continue;
  }
  ok(new RegExp(`href="${d}/"`).test(htmlShops),
    `shops/${d}/ existe mais n'a aucune tuile dans le portail boutiques (boutique invisible)`);
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

/* ── LE MAILLON QUI MANQUAIT (26.09.2026) ────────────────────────────────────────
   Tout ce qui précède prouve qu'une tuile est dans le FICHIER. Rien ici ne prouve que
   Kevin la VOIT : entre le fichier et son iPhone il y a une publication, un routeur et
   un cache. Mesuré le 26.09 : les Actions étaient à l'arrêt deux jours, ce garde était
   vert, et le domaine servait l'ancienne page. Le contrôle en vrai existe désormais
   (tests/verif-tuiles-live.mjs, il tourne sur la machine GitHub car *.kd-mc.com répond
   403 depuis une session) — et, leçon du garde `specs-lances`, un contrôle que RIEN ne
   lance ne protège de rien : on exige donc qu'un workflow l'exécute vraiment. */
const VERIF_LIVE = 'tests/verif-tuiles-live.mjs';
ok(existsSync(join(ROOT, VERIF_LIVE)), `${VERIF_LIVE} manque : plus aucun contrôle des tuiles EN VRAI`);
const dossierWF = join(ROOT, '.github/workflows');
const lanceurs = readdirSync(dossierWF)
  .filter((f) => /\.ya?ml$/.test(f))
  .filter((f) => new RegExp('run:[^\\n]*' + VERIF_LIVE.replace(/[/.]/g, (c) => '\\' + c)).test(readFileSync(join(dossierWF, f), 'utf8')));
ok(lanceurs.length > 0,
  `aucun workflow n'exécute ${VERIF_LIVE} : un contrôle que personne ne lance ne protège de rien (garde specs-lances)`);
if (lanceurs.length) {
  const wf = readFileSync(join(dossierWF, lanceurs[0]), 'utf8');
  /* Et ici la leçon de `specs-lances` prise au mot : une MENTION du rapport ne compte pas.
     Écrit d'abord en cherchant `audit/verif-live/tuiles.md` n'importe où dans le fichier —
     le sabotage (retirer le dépôt du rapport) est passé VERT, parce que le nom apparaît
     aussi dans le filet anti-plantage. Ce qu'il faut exiger, c'est le geste : `git add`. */
  const ajoute = (wf.match(/^\s*git add[^\n]*/gm) || []).some((l) => l.includes('audit/verif-live/tuiles.md'));
  ok(ajoute,
    `${lanceurs[0]} lance le contrôle mais ne DÉPOSE pas son rapport (git add audit/verif-live/tuiles.md) : illisible pour l'agent comme pour Kevin`);
}

console.log(`Tuiles ⇄ apps du domaine : ${pass} vérifications OK, ${fails.length} échec(s)`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
