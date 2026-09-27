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
/* SONDE_HOTE_BASE : réservé au test de cette sonde (tests/verify-sonde-porte.mjs) —
   « https://<hôte>/ » devient « <base>/<hôte>/ » sur un faux routeur local. */
const HOTE_BASE = (process.env.SONDE_HOTE_BASE || '').replace(/\/+$/, '');
function adresse({ hote, dossier }) {
  if (RACINE) return `${base}/${dossier ? dossier + '/' : ''}`;          // Pages sert à la racine
  if (HOTE_BASE) return `${HOTE_BASE}/${hote}/`;                         // test : faux routeur
  return `https://${hote}/`;                                             // le domaine, à son nom
}

/* --- l'hébergeur derrière le routeur (pour regarder DERRIÈRE une porte) ----
   Depuis le 27.09.2026 le routeur ferme certains dossiers (cuisine, World Monitor,
   OSINT…) derrière une porte « fiche » : sans session, il ne sert pas l'app mais
   une petite page 200 marquée `x-kdmc-porte`. Mesuré le 27.09 : cette sonde, qui
   ne se présentait pas comme un navigateur (pas de Sec-Fetch-Dest), recevait un
   401 texte sur les 3 adresses du livre de cuisine → le déploiement du routeur
   restait ROUGE à chaque livraison (runs 36314626122 et 36336460747), alors que
   le routeur servait très bien. Une porte fermée n'est pas une adresse morte :
   on se présente comme un navigateur, on reconnaît la porte, et on va vérifier
   que le contenu existe bien chez l'hébergeur (lu dans wrangler.toml). */
function upstreamBase() {
  if (process.env.SONDE_UPSTREAM) return process.env.SONDE_UPSTREAM.replace(/\/+$/, '');
  try {
    const toml = readFileSync('services/kdmc-router/wrangler.toml', 'utf8');
    const m = toml.match(/^\s*UPSTREAM_BASE\s*=\s*"([^"]+)"/m);
    const p = toml.match(/^\s*UPSTREAM_PREFIX\s*=\s*"([^"]*)"/m);
    return m ? m[1].replace(/\/+$/, '') + (p ? p[1] : '') : '';
  } catch { return ''; }
}
const UPSTREAM = RACINE ? '' : upstreamBase();

/* --- la sonde ------------------------------------------------------------- */
const TEMPS = 25000;
const ENTETES = {
  'cache-control': 'no-cache', 'user-agent': 'kdmc-sonde/1',
  /* comme un navigateur qui ouvre une page : c'est ce que le routeur regarde
     pour décider entre « page de porte » et « 401 texte » (estUnePage). */
  'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', accept: 'text/html,*/*;q=0.8',
};
async function sonder(r) {
  const url = adresse(r);
  const t0 = Date.now();
  try {
    let rep = await fetch(url, { redirect: 'follow', headers: ENTETES, signal: AbortSignal.timeout(TEMPS) });
    let texte = await rep.text();
    const porte = rep.status === 200 ? (rep.headers.get('x-kdmc-porte') || '') : '';
    let derriere = '';
    if (porte) {
      /* Porte fermée = le routeur connaît l'adresse et son dossier. Reste à
         prouver que le contenu existe DERRIÈRE : on l'ouvre chez l'hébergeur. */
      if (!UPSTREAM) {
        return { ...r, url, http: rep.status, octets: texte.length, ok: false, porte, ms: Date.now() - t0,
          erreur: 'porte « ' + porte + ' » mais hébergeur inconnu (UPSTREAM_BASE absent de wrangler.toml)' };
      }
      derriere = `${UPSTREAM}/${r.dossier ? r.dossier + '/' : ''}`;
      rep = await fetch(derriere, { redirect: 'follow', headers: ENTETES, signal: AbortSignal.timeout(TEMPS) });
      texte = await rep.text();
    }
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
      ...r, url, http: rep.status, octets: texte.length, html, assez, doctype, porte, derriere,
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
  const verrou = r.porte ? `🔒 porte « ${r.porte} » → contenu vérifié derrière (${r.derriere})` : '';
  console.log(`${etat} ${r.hote.padEnd(28)} ${String(r.http).padStart(3)}  ${String(r.octets).padStart(7)} car.  ${r.erreur || verrou}`);
}

const ko = res.filter((r) => !r.ok);
const fermees = res.filter((r) => r.porte);
console.log(`\n=== ${res.length - ko.length} servies / ${ko.length} en échec ===`);
if (fermees.length) {
  console.log(`🔒 ${fermees.length} adresse(s) derrière une porte du routeur (fiche obligatoire) — le contenu a été vérifié chez l'hébergeur : ` +
    [...new Set(fermees.map((r) => r.hote))].join(', '));
}

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
