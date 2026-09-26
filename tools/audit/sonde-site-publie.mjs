#!/usr/bin/env node
/* ============================================================================
 * SONDE — « est-ce que CHAQUE adresse du domaine est vraiment servie ? »
 * ----------------------------------------------------------------------------
 * Kevin 2026-09-15 : « passe tout en privé, personne ne doit voir le code ; seuls
 * les sites restent accessibles. »
 *
 * Passer le dépôt en privé ÉTEINT GitHub Pages (vérifié : Pages depuis un dépôt
 * privé exige un abonnement payant, Kevin est en gratuit). Le site doit donc
 * déménager AVANT. Cette sonde est le garde-fou de ce déménagement : elle ouvre
 * réellement chaque adresse sur le nouvel hébergeur et refuse de dire « ça
 * marche » sans l'avoir vu.
 *
 * La liste des adresses est LUE dans la table ROUTES du routeur — jamais
 * recopiée. Une liste recopiée dérive, et c'est exactement comme ça qu'on
 * oublie une adresse (vécu le 10.09 : cuisine et le portail boutiques étaient
 * absents de la copie de secours depuis un mois, sans que rien ne le voie).
 *
 * Usage :
 *   node tools/audit/sonde-site-publie.mjs https://kdmc-site.pages.dev --racine
 *   node tools/audit/sonde-site-publie.mjs https://kd-mc.com
 *
 *   --racine : l'hébergeur sert à la RACINE (Cloudflare Pages) → on retire le
 *              préfixe /CMCteams, exactement comme le fait le routeur quand
 *              UPSTREAM_PREFIX est vide.
 *   (sans)   : on interroge le domaine lui-même, chaque sous-domaine à son nom.
 * ========================================================================== */

import { readFileSync } from 'node:fs';

const base = (process.argv[2] || '').replace(/\/+$/, '');
const RACINE = process.argv.includes('--racine');
if (!base) {
  console.error('Usage : node tools/audit/sonde-site-publie.mjs <adresse> [--racine]');
  process.exit(2);
}

/* --- les adresses, lues dans le routeur ----------------------------------- */
const src = readFileSync('services/kdmc-router/worker.js', 'utf8');
const bloc = src.slice(src.indexOf('const ROUTES'), src.indexOf('// Proxy MÊME ORIGINE'));
const ROUTES = [...bloc.matchAll(/'([a-z0-9.-]+\.kd-mc\.com|kd-mc\.com)'\s*:\s*'\/CMCteams\/?([^']*)'/g)]
  .map((m) => ({ hote: m[1], dossier: m[2] }));

if (ROUTES.length < 20) {
  console.error(`❌ MESURE IMPOSSIBLE : ${ROUTES.length} adresses lues dans la table ROUTES, c'est trop peu.`);
  console.error('   Le format de la table a dû changer — je préfère m\'arrêter que de rassurer à tort.');
  process.exit(2);
}

/* --- où interroger chaque adresse ----------------------------------------- */
function adresse({ hote, dossier }) {
  if (RACINE) return `${base}/${dossier ? dossier + '/' : ''}`;          // Pages sert à la racine
  return `https://${hote}/`;                                             // le domaine, à son nom
}

/* --- la sonde ------------------------------------------------------------- */
const TEMPS = 25000;
async function sonder(r) {
  const url = adresse(r);
  const t0 = Date.now();
  try {
    const rep = await fetch(url, {
      redirect: 'follow',
      headers: { 'cache-control': 'no-cache', 'user-agent': 'kdmc-sonde/1' },
      signal: AbortSignal.timeout(TEMPS),
    });
    const texte = await rep.text();
    /* Une page vide ou un 404 déguisé en 200 ne compte pas comme « servie ».
       On exige un vrai document HTML avec du contenu.
       ⚠️ On n'exige PAS <!doctype> ni <html> : mesuré le 15.09, la page cuisine
       commence directement par <title> et s'affiche très bien (prouvé au
       navigateur : 1921 caractères visibles). Exiger le doctype ici, c'était
       trois faux rouges sur une page qui marche. On le SIGNALE à part plutôt
       que de le taire — sans en faire un échec. */
    const html = /<(!doctype|html|head|title|body|div|style|meta|script)\b/i.test(texte);
    const assez = texte.length >= 500;
    const doctype = /^\s*<!doctype/i.test(texte);
    return {
      ...r, url, http: rep.status, octets: texte.length, html, assez, doctype,
      /* Empreinte du contenu : sert à repérer deux adresses qui servent la
         MÊME page alors qu'elles ne devraient pas (cf. contrôle plus bas). */
      tete: texte.slice(0, 2000),
      ok: rep.status === 200 && html && assez, ms: Date.now() - t0,
    };
  } catch (e) {
    return { ...r, url, http: 0, octets: 0, ok: false, erreur: String(e.message).slice(0, 60), ms: Date.now() - t0 };
  }
}

console.log(`Sonde de ${ROUTES.length} adresses sur ${base}${RACINE ? ' (servi à la racine)' : ''}\n`);
const res = [];
/* Par paquets de 6 : assez rapide, sans marteler l'hébergeur. */
for (let i = 0; i < ROUTES.length; i += 6) {
  res.push(...await Promise.all(ROUTES.slice(i, i + 6).map(sonder)));
}

console.log('adresse                        HTTP   contenu   ');
console.log('────────────────────────────────────────────────');
for (const r of res) {
  const etat = r.ok ? '✅' : '❌';
  console.log(`${etat} ${r.hote.padEnd(28)} ${String(r.http).padStart(3)}  ${String(r.octets).padStart(7)} car.  ${r.erreur || ''}`);
}

const ko = res.filter((r) => !r.ok);
console.log(`\n=== ${res.length - ko.length} servies / ${ko.length} en échec ===`);

/* Signalé, pas caché : une page sans <!doctype> s'affiche en « mode bizarre »
   (quirks) — le navigateur applique des règles de mise en page d'avant 2001.
   Ça marche, mais ça peut décaler la mise en page sur iPhone. */
const sansDoctype = [...new Set(res.filter((r) => r.ok && !r.doctype).map((r) => r.dossier || '(racine)'))];
if (sansDoctype.length) {
  console.log(`\nℹ️  ${sansDoctype.length} page(s) sans <!doctype html> — elles s'affichent, mais en « mode bizarre » :`);
  console.log(`   ${sansDoctype.join(', ')}  (à corriger quand l'occasion se présente, ce n'est pas bloquant)`);
}
/* ── CHAQUE ADRESSE SERT-ELLE SA PROPRE APPLICATION ? ─────────────────────
   Kevin 2026-09-19 : « pourquoi l'app a plusieurs adresses ? »
   MESURÉ : rotaplan, kit et croupier n'avaient aucune page dans le paquet
   publié. L'hébergeur, ne trouvant rien, répond par /index.html — donc par
   CMCteams — AVEC UN CODE 200. Trois adresses servaient l'app à la place de
   leur boutique, et ce contrôle-ci disait « 32 servies / 0 en échec » : il
   vérifiait que ça répond, pas que ça répond LA BONNE CHOSE.
   Deux adresses qui pointent sur le MÊME dossier (cuisine/cocina/cujina,
   departs/cmcteams-light, kd-mc.com/www) ont le droit d'être identiques. */
const memeDossier = (a, b) => (a.dossier || '') === (b.dossier || '');
const jumeaux = [];
for (let i = 0; i < res.length; i++) {
  for (let j = i + 1; j < res.length; j++) {
    const a = res[i], b = res[j];
    if (!a.ok || !b.ok || memeDossier(a, b)) continue;
    if (a.octets === b.octets && a.tete === b.tete) jumeaux.push([a, b]);
  }
}
if (jumeaux.length) {
  console.log(`\n❌ ${jumeaux.length} paire(s) d'adresses servent la MÊME page alors qu'elles`);
  console.log('   ont chacune leur propre application. C\'est le repli de l\'hébergeur :');
  console.log('   la page demandée n\'existe pas là-bas, il renvoie l\'accueil avec un code 200.');
  for (const [a, b] of jumeaux) console.log(`   · ${a.hote} (${a.dossier || 'racine'}) == ${b.hote} (${b.dossier || 'racine'})`);
  console.log('\n   À corriger dans services/kdmc-router/prepare-secours.mjs : chaque adresse');
  console.log('   de la table ROUTES doit avoir son dossier dans le paquet publié.');
}

if (ko.length) {
  console.log('\nCe qui ne répond pas — à régler AVANT de couper l\'ancien hébergeur :');
  for (const r of ko) console.log(`  · ${r.hote} → ${r.url}  (HTTP ${r.http}${r.erreur ? ', ' + r.erreur : ''})`);
}

/* Un réseau coupé donnerait « tout en échec » : on le DIT au lieu de conclure
   à une panne du site (leçon du 5.09 : sans cette distinction, un pare-feu se
   lit comme une panne — et l'inverse rassure à tort). */
if (jumeaux.length && ko.length !== res.length) {
  console.log('\n=== ADRESSES QUI SERVENT LA MAUVAISE APPLICATION : ' + jumeaux.length + ' ===');
  process.exit(1);
}
if (ko.length === res.length) {
  console.log('\n⚠️  TOUTES les adresses échouent — c\'est plus probablement le réseau d\'ici');
  console.log('   que le site. Relance depuis un runner CI (réseau ouvert) avant de conclure.');
  process.exit(2);
}
process.exit(ko.length ? 1 : 0);
