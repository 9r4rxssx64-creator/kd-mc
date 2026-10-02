/**
 * kdmc-router — Routeur de domaine personnalisé KDMC (kd-mc.com)
 * ----------------------------------------------------------------------------
 * 1) Reverse-proxy : chaque sous-domaine -> son app GitHub Pages.
 * 2) SSO transverse : /__sso/* (session unique signée, cookie .kd-mc.com).
 * 3) Admin domaine : /__admin/* (fiches clients enrichies + fonctions communes),
 *    réservé à la session admin (Kevin). Registre dans Cloudflare KV (ACCOUNTS),
 *    enrichi à chaque connexion (device + géo request.cf + horodatage). Fail-open.
 */

import { makeChallenge, parseRegistration, verifyAssertion, b64uEnc, b64uDec } from './webauthn.js';
import { mintShopsAdminIdToken } from './fb-token.js';
/* Kevin 2026-09-05 « Qwen l'IA gratuite en principal, pareil dans mes autres projets » :
   UN routage IA commun au domaine (Qwen Workers AI d'abord, bascule par type de question). */
import { routeText, FREE_PROVIDERS, detectDomain, planChain, availableProviders } from '../_shared/ia-route.js';
import * as IA from './bot-ia.js';
import { handleCercle } from './cercle.js';   // Cercle Lingua : invitations, amis, présence, messages, cadeaux (D1 kdmc-cercle)
/* Audit 30.09.2026 (P0-3 / R3) : les fichiers RH nominatifs ne sortent qu'à une personne reconnue. */
import { DONNEES_RH_NORMALISEES, cleKV } from './donnees-rh.js';

/* D'où viennent les pages. Historiquement GitHub Pages — mais le dépôt est
   PRIVÉ depuis le 23/09/2026 (« que personne ne voie mon code ») et GitHub
   Pages depuis un dépôt privé exige un abonnement payant : github.io ne sert
   plus RIEN. La source de production est Cloudflare Pages (kdmc-site), publiée
   par `publier-site-prive.yml`.
   Ces deux valeurs restent RÉGLABLES depuis le tableau de bord Cloudflare
   (Variables du Worker) et sont posées par wrangler.toml [vars] :
     UPSTREAM_BASE   = https://kdmc-site-bj5.pages.dev
     UPSTREAM_PREFIX = ''                             (Pages sert à la racine)

   ⚠️ CE DÉFAUT EST UN FILET DE SÉCURITÉ, PAS UNE DÉCORATION (incident 23.09.2026).
   Ce jour-là, `deploy-kdmc-router.yml` s'est lancé depuis une branche de travail
   dont le wrangler.toml n'avait PAS encore ces deux variables. Un `wrangler
   deploy` REMPLACE les variables du worker par celles de SON wrangler.toml :
   le worker est donc reparti sur le défaut… qui pointait encore sur github.io,
   éteint. Résultat mesuré : les 26 adresses du domaine en 404 pendant ~50 min
   (12/12 KO sur kit.kd-mc.com à 21h03). Le défaut pointe désormais sur
   l'hébergeur RÉEL : une branche en retard ne peut plus éteindre le domaine. */
const UPSTREAM_DEFAUT = 'https://kdmc-site-bj5.pages.dev';
const PAGES_PREFIX_DEFAUT = '/CMCteams';

/* La règle du préfixe de sortie, SORTIE du corps de `fetch` pour être TESTABLE
   en l'exécutant (un test qui relit le source à coups d'expressions régulières
   ne prouve pas le comportement). Voir l'incident du 23.09.2026 plus haut.
     · préfixe réglé à la main  → on l'utilise tel quel (espaces et barre finale
       nettoyés : un tableau de bord n'accepte pas toujours un champ vide) ;
     · rien de réglé + github.io → /CMCteams (l'ancien rangement) ;
     · rien de réglé + autre     → '' (Cloudflare Pages sert à la racine). */
export function prefixeSortie(upstream, prefixeRegle) {
  if (typeof prefixeRegle === 'string') return prefixeRegle.trim().replace(/\/+$/, '');
  let hote = '';
  try { hote = new URL(upstream).hostname; } catch { hote = ''; }
  return /(^|\.)github\.io$/i.test(hote) ? PAGES_PREFIX_DEFAUT : '';
}

const ROUTES = {
  'kd-mc.com': '/CMCteams/kdmc-home',
  'www.kd-mc.com': '/CMCteams/kdmc-home',
  'cmcteams.kd-mc.com': '/CMCteams',
  'apex-ai.kd-mc.com': '/CMCteams/apex-ai-v13',
  'apex-chat.kd-mc.com': '/CMCteams/messaging-app',
  'la-detente.kd-mc.com': '/CMCteams/la-detente',
  'chez-lolo.kd-mc.com': '/CMCteams/shops/chez-lolo',
  'dashboard.kd-mc.com': '/CMCteams/shops/dashboard',
  'sourcing.kd-mc.com': '/CMCteams/shops/sourcing',
  'coffre.kd-mc.com': '/CMCteams/coffre-fort',
  'departs.kd-mc.com': '/CMCteams/tools/departs',
  'cmcteams-light.kd-mc.com': '/CMCteams/tools/departs', // « CMCteams light » (Kevin 2026-07-01) — alias nommé de la page Départs (departs.kd-mc.com reste actif)
  'bot.kd-mc.com': '/CMCteams/tools/crypto-bot-dashboard', // Tableau de bord crypto-bot (Kevin 2026-07-03) — admin-gated via /__bot/*
  'beatbot.kd-mc.com': '/CMCteams/tools/poolrobot', // PoolPilot — app robot piscine Beatbot (Kevin 2026-07-05)
  'autorisations.kd-mc.com': '/CMCteams/tools/approvals', // Coffre d'autorisations — admin only (Kevin 2026-07-10)
  'arbre.kd-mc.com': '/CMCteams/arbre', // Arbre généalogique familial — protégé par code famille (Kevin 2026-08-03)
  'lingua.kd-mc.com': '/CMCteams/lingua', // KDMC Lingua — app d'apprentissage de langues (Kevin 2026-08-04)
  'studio.kd-mc.com': '/CMCteams/tools/crea-studio', // Créa Studio — montage vidéo + retouche photo (niveau Photoshop/GIMP) + dessin animé, 100% client-side (Kevin 2026-08-04)
  'cuisine.kd-mc.com': '/CMCteams/tools/cuisine', // Le Grand Répertoire de la Riviera — livre de cuisine numérique (Monaco/Riviera + Ligurie), 113+ recettes illustrées (Kevin 2026-08-13)
  'cocina.kd-mc.com': '/CMCteams/tools/cuisine',  // alias — même livre (Kevin 2026-08-13)
  'cujina.kd-mc.com': '/CMCteams/tools/cuisine',
  // Belles adresses des apps qui n'en avaient pas — Kevin 2026-08-13 « pourquoi les adresses
  // ne sont pas pareilles ». Règle KDMC_ADRESSES.md : UNE belle adresse par projet. Les
  // anciens chemins (kd-mc.com/worldmonitor…) restent valides : rien ne casse, on ajoute.
  'worldmonitor.kd-mc.com': '/CMCteams/kdmc-home/worldmonitor',
  'osint.kd-mc.com': '/CMCteams/kdmc-home/osint',
  'ia.kd-mc.com': '/CMCteams/kdmc-home/ia',
  'outils.kd-mc.com': '/CMCteams/kdmc-home/outils',
  // Portail boutiques : vivait SEULEMENT sur github.io (le portail y renvoyait en dur,
  // hors du domaine, en affichant « kd-mc.com → shops » — une adresse fausse).
  'javis.kd-mc.com': '/CMCteams/javis', // Javis / Bee — l'assistant de Kevin, app installable (Kevin 2026-09-16)
  'tor.kd-mc.com': '/CMCteams/tools/tor', // « Tor en clair » — comprendre le web .onion, y aller en sécurité, catalogue de services légitimes (Kevin 2026-09-15)
  'rotaplan.kd-mc.com': '/CMCteams/shops/rotaplan',
  'kit.kd-mc.com': '/CMCteams/shops/kit-ia', // Kit IA de l'indépendant — produit numérique neuf (Kevin 2026-09-16)
  'dossiers.kd-mc.com': '/CMCteams/dossiers', // Archive Epstein : INDEX des sources officielles, aucun document hébergé (Kevin 2026-09-18)
  'croupier.kd-mc.com': '/CMCteams/shops/croupier', // Devenir croupier — guide de métier (Kevin 2026-09-15) // Rotaplan — planning des équipes en rotation, offre B2B (Kevin 2026-09-15)
  'shops.kd-mc.com': '/CMCteams/shops',  // « A Cüjina de Mùnegu » — adresse au nom monégasque correct/sourcé (Kevin 2026-08-13)
};

/* ═══════════════════════════════════════════════════════════════════════════
   PÉRIMÈTRE : « chaque app distincte, mais toutes liées dans le domaine »
   (Kevin 2026-09-15)

   Ce qu'il a demandé, mot pour mot : « quelqu'un d'extérieur peut s'enregistrer
   et être seulement dans une app, et d'autres feront partie du domaine entier
   (sauf partie admin) […] admin possibilité de bloquer dans une app ».

   Une personne a donc une PORTÉE :
     · 'app'     → elle n'existe que dans les apps listées dans `acces`
     · 'domaine' → elle circule dans toutes les apps (l'admin reste à part :
                   il ne s'obtient QUE par Face ID sur un uid admin, jamais ici)
   Plus une liste `bloque` : l'admin ferme UNE app précise, même en portée domaine.

   OÙ C'EST APPLIQUÉ, ET POURQUOI ICI : au routeur, jamais dans les apps. Le
   routeur est la seule porte par laquelle passent les 26 adresses ; recopier la
   règle dans 26 pages, c'est 26 versions qui divergent (leçon #142), et il
   suffirait d'en oublier une pour que le périmètre ne veuille plus rien dire.

   COMMENT : une personne hors périmètre n'est pas « bloquée », elle n'est pas
   RECONNUE — `/__sso/whoami` répond `ok:false`. Les apps publiques (boutiques,
   cuisine) restent donc visitables par tout le monde comme avant : l'inconnu
   reste un inconnu. Les apps qui exigent une identité (arbre, coffre, CMCteams)
   refusent d'elles-mêmes. Aucune des 26 apps n'a une ligne à changer, et rien ne
   peut casser si ce code se trompe : au pire il ne reconnaît personne.

   ALIAS : plusieurs adresses = UNE app (cuisine/cocina/cujina, departs et
   cmcteams-light). Sinon on bloquerait quelqu'un sur l'alias de l'app qu'on
   vient de lui ouvrir.

   PARITÉ OBLIGATOIRE avec ROUTES : une adresse servie sans clé d'app ici
   échapperait au périmètre en SILENCE. La garde `test:perimetre-apps` refuse
   qu'un sous-domaine existe des deux côtés sans correspondance.
   ═══════════════════════════════════════════════════════════════════════════ */
const APPS = {
  'kd-mc.com': 'portail', 'www.kd-mc.com': 'portail',
  'cmcteams.kd-mc.com': 'cmcteams',
  'apex-ai.kd-mc.com': 'apex-ai',
  'apex-chat.kd-mc.com': 'apex-chat',
  'la-detente.kd-mc.com': 'la-detente',
  'chez-lolo.kd-mc.com': 'chez-lolo',
  'dashboard.kd-mc.com': 'dashboard',
  'sourcing.kd-mc.com': 'sourcing',
  'coffre.kd-mc.com': 'coffre',
  'departs.kd-mc.com': 'departs', 'cmcteams-light.kd-mc.com': 'departs',
  'bot.kd-mc.com': 'bot',
  'beatbot.kd-mc.com': 'beatbot',
  'autorisations.kd-mc.com': 'autorisations',
  'arbre.kd-mc.com': 'arbre',
  'lingua.kd-mc.com': 'lingua',
  'studio.kd-mc.com': 'studio',
  'cuisine.kd-mc.com': 'cuisine', 'cocina.kd-mc.com': 'cuisine', 'cujina.kd-mc.com': 'cuisine',
  'worldmonitor.kd-mc.com': 'worldmonitor',
  'osint.kd-mc.com': 'osint',
  'ia.kd-mc.com': 'ia',
  'outils.kd-mc.com': 'outils',
  'shops.kd-mc.com': 'shops',
  'kit.kd-mc.com': 'kit',
  'dossiers.kd-mc.com': 'dossiers',
  'tor.kd-mc.com': 'tor',
  'rotaplan.kd-mc.com': 'rotaplan',
  'croupier.kd-mc.com': 'croupier',
  'javis.kd-mc.com': 'javis',
};
/* Prénom ET nom : au moins deux mots d'au moins deux lettres (accents, tirets, apostrophes
   admis : « Anne-Sophie SAINT-POLIT », « D'Amico Luca »). Et les conditions acceptées. */
function renseignementsComplets(name, cgu) {
  if (cgu !== true) return false;
  const mots = String(name || '').trim().split(/\s+/).filter((m) => /\p{L}.*\p{L}/u.test(m));
  return mots.length >= 2;
}
function appDe(host) { return APPS[String(host || '').toLowerCase().replace(/:.*$/, '')] || ''; }

/* Décide si CETTE fiche a le droit d'exister dans CETTE app. Fonction PURE :
   aucune entrée/sortie, testable en vrai (elle est exportée et exécutée par la
   garde, pas cherchée au texte — un contrôle qui lit une chaîne de caractères
   ment dans les deux sens, leçon #103).

   FAIL-OPEN VOULU, et c'est le point le plus important de tout ce fichier :
   sans fiche, ou sur une adresse inconnue, on répond OUI. Les ~191 comptes déjà
   enregistrés n'ont pas de champ `portee` → ils restent dans TOUT le domaine.
   Personne ne perd un accès le jour où ce code part en ligne ; la restriction
   ne s'applique qu'à ceux que l'admin range, et aux NOUVEAUX inscrits. */
/* Les surfaces qui sont LE MÊME OUTIL pour les mêmes gens. Ouvrir l'une ouvre
   l'autre — et rien de plus. Liste volontairement minuscule et fermée : chaque
   ligne ajoutée ici élargit ce que voit un inscrit, donc elle se décide avec
   Kevin, jamais toute seule. */
const SURFACES_JUMELLES = [['cmcteams', 'departs']];
/* COMPTE UNIQUE (Kevin 2026-09-27) : « Lorsqu'une personne crée son compte et code dans le
   domaine ou une app, il peut se connecter aux autres apps du domaine avec les mêmes. Reconnu
   auto. » → un compte né n'importe où est reconnu PARTOUT. Ce qui reste fermé par défaut à un
   compte que l'admin n'a jamais rangé : les apps PERSONNELLES de Kevin (règle du 15.09 :
   « domaine entier, sauf partie admin »). L'admin les ouvre d'un geste (liste `acces`, ou en
   rangeant la personne en « domaine » depuis /admin → `acces_at`). Liste fermée, gardée par
   test:perimetre-apps : l'allonger se décide avec Kevin. */
const APPS_PRIVEES = ['arbre', 'coffre', 'bot', 'dashboard'];
function perimetre(acc, app) {
  if (!app) return { ok: true, raison: 'adresse_hors_domaine' };
  /* LE PORTAIL EST LA RÉCEPTION : toujours ouvert, à tout le monde. C'est par lui
     que CHAQUE app fait passer l'inscription et la connexion (`ensureSession`
     renvoie sur kd-mc.com/?return=…). Le fermer à quelqu'un = lui interdire de
     se connecter nulle part, y compris à l'app qu'on vient de lui ouvrir. Trouvé
     en suivant le VRAI parcours d'un nouvel inscrit, pas par les tests : ils
     inscrivaient chacun directement sur son app, ce que le domaine ne fait jamais. */
  if (app === 'portail') return { ok: true, raison: 'portail' };
  if (!acc) return { ok: true, raison: 'sans_fiche' };
  const bloque = Array.isArray(acc.bloque) ? acc.bloque : [];
  if (bloque.indexOf(app) >= 0) return { ok: false, raison: 'bloque_ici' };
  const acces = Array.isArray(acc.acces) ? acc.acces : [];
  if (acces.indexOf(app) >= 0) return { ok: true, raison: 'app_autorisee' };
  /* Rangé par l'admin (`acces_at`) : sa décision s'applique telle quelle, dans les deux sens.
     Sans champ `portee` (comptes d'avant le 15.09) : tout le domaine, comme toujours. */
  const rangeParAdmin = !!acc.acces_at;
  if (!acc.portee || (rangeParAdmin && acc.portee !== 'app')) return { ok: true, raison: 'domaine' };
  if (!rangeParAdmin) {
    /* Compte jamais rangé (nouvel inscrit, OU enfermé par défaut entre le 15.09 et le 27.09) :
       reconnu partout, sauf les apps personnelles de Kevin. */
    if (APPS_PRIVEES.indexOf(app) >= 0) return { ok: false, raison: 'app_privee' };
    return { ok: true, raison: 'compte_unique' };
  }
  /* DEUX SURFACES, UN SEUL OUTIL (Kevin 2026-09-22, choix explicite : « les deux
     comptent comme une seule app »). CMCteams et CMCteams light, ce sont les mêmes
     260 personnes et le même planning — la light s'appelle littéralement « CMCteams
     light ». Un employé déclaré par l'une doit être reconnu par l'autre, sinon il
     reste anonyme une visite sur deux et Kevin ne le voit qu'à moitié.
     ⚠️ CETTE PORTE N'OUVRE QUE CELLE-LÀ : la liste est fermée et figée par une
     garde. Elle n'ouvre ni Lingua, ni les boutiques, ni le coffre, ni rien d'autre
     — sinon une inscription sur une app ouvrirait le domaine, exactement ce que le
     périmètre existe pour empêcher. */
  for (const groupe of SURFACES_JUMELLES) {
    if (groupe.indexOf(app) >= 0 && groupe.some((a2) => acces.indexOf(a2) >= 0)) {
      return { ok: true, raison: 'meme_outil' };
    }
  }
  return { ok: false, raison: 'hors_perimetre' };
}

// Proxy MÊME ORIGINE vers l'API des décès INSEE (matchID) — données PUBLIQUES,
// lecture seule. L'API matchID ne renvoie PAS d'en-tête CORS → un appel direct
// depuis arbre.kd-mc.com est bloqué par le navigateur (Kevin « je ne vois rien »).
// Ici arbre.kd-mc.com/__deces?q=… reste same-origin → 0 CORS, marche sur iPhone.
async function handleDeces(request, url) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': '*' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const q = (url.searchParams.get('q') || '').trim();
  let size = parseInt(url.searchParams.get('size') || '25', 10); if (!(size > 0)) size = 25; if (size > 50) size = 50;
  if (q.length < 2) return new Response(JSON.stringify({ response: { persons: [] } }), { headers: { 'content-type': 'application/json', ...cors } });
  const api = 'https://deces.matchid.io/deces/api/v1/search?q=' + encodeURIComponent(q) + '&size=' + size;
  try {
    const r = await fetch(api, { headers: { accept: 'application/json' } });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', ...cors } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy', message: String((e && e.message) || e) }), { status: 502, headers: { 'content-type': 'application/json', ...cors } });
  }
}

/* ===== ARBRE GÉNÉALOGIQUE — les DONNÉES sortent du fichier public (fait n°12, 5.09.2026) =====
   Avant : arbre/index.html (dépôt PUBLIC) embarquait ~100 personnes (noms, dates de
   naissance) ET l'empreinte du code famille comparée dans le navigateur → n'importe qui
   lisant le fichier avait les données, et l'empreinte donnait le chemin Firebase.
   Maintenant : le code se vérifie ICI (empreinte en KV, jamais dans le dépôt), et les
   données de départ (« seed ») ne sont servies qu'à qui prouve le code. Même origine
   (arbre.kd-mc.com/__arbre/…) → 0 CORS, iPhone OK. Préfixe KV `arbre:` (isolé).
   - POST /__arbre/unlock {hash}      → {ok, seed} · essais limités par IP (rlFail), journalisés
   - GET  /__arbre/seed  (x-arbre-code: hash) → {ok, seed, savedAt}
   - PUT  /__arbre/seed  {codehash?, persons, meta}  → ADMIN (grant /__admin/login) : publie
   - POST /__arbre/code  {old, new}   → rotation du code famille (preuve = ancien hash, ou admin)
   - GET  /__arbre/status             → {code:bool, seed:bool, count, savedAt} — aucun secret
   FAIL-OPEN côté app : l'app garde son contrôle local (empreinte mémorisée sur l'appareil)
   si le domaine est muet. FAIL-CLOSED ici : sans empreinte publiée → « code_non_publie ». */
const ARBRE_HEX64 = /^[a-f0-9]{64}$/;
function hexEq(a, b) {
  a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase();
  if (!ARBRE_HEX64.test(a) || !ARBRE_HEX64.test(b)) return false;
  let d = 0; for (let i = 0; i < 64; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/* Amorce D1 (base `kdmc-arbre`, binding ARBRE_DB, table kv(k,v,saved_at)) : déposée par une session
   Claude (données récupérées de l'historique GitLab v3.14) pour que le domaine serve l'arbre AVANT toute
   publication depuis l'iPhone. KV (publication admin depuis l'app) a TOUJOURS priorité sur D1. Fail-open. */
async function arbreD1(env, k) {
  if (!env || !env.ARBRE_DB || !env.ARBRE_DB.prepare) return null;
  try { const row = await env.ARBRE_DB.prepare('SELECT v, saved_at FROM kv WHERE k = ?1').bind(k).first(); return row && row.v != null ? row : null; } catch { return null; }
}
async function arbreCodehash(env) {
  const kv = await env.ACCOUNTS.get('arbre:codehash');
  if (kv) return kv;
  const row = await arbreD1(env, 'codehash');
  return row ? String(row.v).trim().toLowerCase() : null;
}
async function arbreSeedOut(env) {
  let seed = null, meta = null;
  try { const raw = await env.ACCOUNTS.get('arbre:seed'); if (raw) seed = JSON.parse(raw); } catch { seed = null; }
  try { meta = JSON.parse((await env.ACCOUNTS.get('arbre:meta')) || 'null'); } catch { meta = null; }
  if (!seed) {
    const row = await arbreD1(env, 'seed');
    if (row) { try { seed = JSON.parse(row.v); meta = { savedAt: row.saved_at || 0, count: Object.keys(seed.persons || {}).length, seedVersion: seed.meta && seed.meta.seedVersion || 0, source: 'd1' }; } catch { seed = null; } }
  }
  const seedVersion = (meta && meta.seedVersion) || (seed && seed.meta && seed.meta.seedVersion) || 0;
  return { seed, savedAt: meta && meta.savedAt || 0, count: meta && meta.count || 0, seedVersion, source: meta && meta.source || (seed ? 'kv' : null) };
}
async function handleArbre(request, url, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const path = url.pathname;
  if (!env || !env.ACCOUNTS) return J({ ok: false, reason: 'kv_absent' });
  const stored = await arbreCodehash(env);

  if (path === '/__arbre/status' && request.method === 'GET') {
    const m = await arbreSeedOut(env);
    return J({ ok: true, code: !!stored, seed: !!m.seed, count: m.count, savedAt: m.savedAt, seedVersion: m.seedVersion, source: m.source });
  }

  /* Publication (admin seulement) : l'app envoie SES données (texte, sans photos) + l'empreinte
     du code qu'elle connaît. C'est le seul chemin d'écriture des données. */
  if (path === '/__arbre/seed' && request.method === 'PUT') {
    const me = await adminSession(request, env);
    if (!me) return J({ ok: false, reason: (env.KDMC_ADMIN_PIN_SHA256 ? 'need_admin_code' : 'admin_only') }, null, 403);
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const persons = b && b.persons && typeof b.persons === 'object' ? b.persons : null;
    const count = persons ? Object.keys(persons).length : 0;
    if (!count) return J({ ok: false, reason: 'persons_vides' });
    const s = JSON.stringify({ persons, meta: b.meta && typeof b.meta === 'object' ? b.meta : {} });
    if (s.length > 5 * 1024 * 1024) return J({ ok: false, reason: 'trop_gros' });
    if (b.codehash != null && String(b.codehash) !== '') {
      const ch = String(b.codehash).toLowerCase();
      if (!ARBRE_HEX64.test(ch)) return J({ ok: false, reason: 'codehash_invalide' });
      await env.ACCOUNTS.put('arbre:codehash', ch);
    } else if (!stored) return J({ ok: false, reason: 'codehash_requis' });
    const savedAt = Date.now();
    await env.ACCOUNTS.put('arbre:seed', s);
    await env.ACCOUNTS.put('arbre:meta', JSON.stringify({ savedAt, count, size: s.length, seedVersion: +(b.meta && b.meta.seedVersion) || 0, source: 'kv' }));
    await audLog(env, { ev: 'arbre_seed_publish', count, size: s.length });
    return J({ ok: true, savedAt, count });
  }

  if (path === '/__arbre/unlock' && request.method === 'POST') {
    const ipHash = await sha256Hex((request.headers.get('CF-Connecting-IP') || '') + '|arbre-ul');
    const wait = await rlBlocked(env, ipHash);
    if (wait) return J({ ok: false, reason: 'rate_limited', wait });
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const hash = String(b.hash || '').trim().toLowerCase();
    if (!ARBRE_HEX64.test(hash)) return J({ ok: false, reason: 'hash_requis' });
    if (!stored) return J({ ok: false, reason: 'code_non_publie' });
    if (!hexEq(hash, stored)) { await rlFail(env, ipHash); await audLog(env, { ev: 'arbre_unlock_fail', ip: ipHash.slice(0, 12) }); return J({ ok: false, reason: 'code_invalide' }); }
    await rlReset(env, ipHash);
    await audLog(env, { ev: 'arbre_unlock_ok', ip: ipHash.slice(0, 12) });
    const m = await arbreSeedOut(env);
    return J({ ok: true, seed: m.seed, savedAt: m.savedAt, seedVersion: m.seedVersion });
  }

  if (path === '/__arbre/seed' && request.method === 'GET') {
    const hash = String(request.headers.get('x-arbre-code') || '').trim().toLowerCase();
    if (!stored) return J({ ok: false, reason: 'code_non_publie' });
    if (!hexEq(hash, stored)) return J({ ok: false, reason: 'code_invalide' }, null, 403);
    const m = await arbreSeedOut(env);
    return J({ ok: true, seed: m.seed, savedAt: m.savedAt, seedVersion: m.seedVersion });
  }

  /* Rotation du code famille : prouver l'ANCIEN (ou être admin). Le nouveau n'est jamais
     transmis en clair — seulement son empreinte, calculée sur l'appareil. */
  if (path === '/__arbre/code' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const nu = String(b.new || '').trim().toLowerCase();
    if (!ARBRE_HEX64.test(nu)) return J({ ok: false, reason: 'hash_requis' });
    const me = await adminSession(request, env);
    const old = String(b.old || '').trim().toLowerCase();
    if (!me) {
      if (!stored) return J({ ok: false, reason: 'code_non_publie' });
      const ipHash = await sha256Hex((request.headers.get('CF-Connecting-IP') || '') + '|arbre-ul');
      const wait = await rlBlocked(env, ipHash);
      if (wait) return J({ ok: false, reason: 'rate_limited', wait });
      if (!hexEq(old, stored)) { await rlFail(env, ipHash); return J({ ok: false, reason: 'code_invalide' }); }
    }
    await env.ACCOUNTS.put('arbre:codehash', nu);
    await audLog(env, { ev: 'arbre_code_rotate', by: me ? 'admin' : 'famille' });
    return J({ ok: true });
  }
  return J({ ok: false, reason: 'not_found' }, null, 404);
}

const ROUTEUR = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    /* Source des pages : réglable sans redéploiement (cf. commentaire en tête). */
    const UPSTREAM = ((env && env.UPSTREAM_BASE) || UPSTREAM_DEFAUT).trim().replace(/\/+$/, '');
    /* ⚠️ Deux usages DIFFÉRENTS du préfixe, à ne pas confondre :
       - à l'ENTRÉE, les pages contiennent des liens en /CMCteams/… (c'est ainsi
         que GitHub Pages les a construites) → on reconnaît toujours
         PAGES_PREFIX_DEFAUT, quoi qu'il arrive ;
       - à la SORTIE, le nouvel hébergeur peut servir à la racine → on remplace
         alors ce préfixe par UPSTREAM_PREFIX (souvent vide).
       Utiliser une seule variable pour les deux ferait correspondre TOUTES les
       adresses dès que le préfixe est vide (p.startsWith('/') = toujours vrai). */
    /* .trim() : un tableau de bord n'accepte pas toujours un champ vide, et
       Kevin pourrait y mettre un espace. Sans nettoyage, le préfixe deviendrait
       « » et toutes les adresses seraient cassées. Une barre oblique finale est
       retirée aussi (« /kd-mc-sites/ » → « /kd-mc-sites »), sinon on obtient des
       doubles barres. */
    /* Le préfixe de SORTIE, quand personne ne l'a réglé, se DÉDUIT de l'hébergeur
       au lieu d'être supposé (incident 23.09.2026) : GitHub Pages rangeait le
       site sous /CMCteams, Cloudflare Pages le sert à la RACINE. Supposer
       « /CMCteams » sur un hébergeur qui sert à la racine, c'est demander
       kdmc-site.pages.dev/CMCteams/… → 404 sur tout le domaine. */
    const PREFIX_SORTIE = prefixeSortie(UPSTREAM, env && env.UPSTREAM_PREFIX);

    // Recherche décès INSEE (proxy same-origin, public read-only) — pour l'arbre.
    if (url.pathname === '/__deces') return handleDeces(request, url);
    // Arbre : code famille vérifié ici + données servies à qui le prouve (fait n°12).
    if (url.pathname.startsWith('/__arbre/')) return handleArbre(request, url, env);

    // SSO transverse (session unique + CGU). Même origine par sous-domaine.
    if (url.pathname.startsWith('/__sso/')) return handleSso(request, url, env);
    // Admin domaine (fiches clients + fonctions communes). Réservé admin.
    if (url.pathname.startsWith('/__admin/')) return handleAdmin(request, url, env);
    // Coffre Finances : sauvegarde EN LIGNE chiffrée de bout en bout. Réservé admin
    // (même grant que /__admin). Le serveur ne stocke qu'un bloc illisible (AES-GCM
    // côté client) → même le worker/KV ne peut PAS lire. Cf. tools/finances/.
    if (url.pathname.startsWith('/__fin/')) return handleFin(request, url, env);
    if (url.pathname.startsWith('/__mail/')) return handleMail(request, url, env);
    // Crypto-bot Railway (statut + kill switch). Réservé admin (même grant que /__admin).
    if (url.pathname.startsWith('/__bot/')) return handleBot(request, url, env);
    // Relais Beatbot (contrôle réel du robot piscine) — admin-gated, HTTPS public only, même origine que l'app beatbot.kd-mc.com.
    if (url.pathname.startsWith('/__beatbot/')) return handleBeatbot(request, url, env);
    // Push « message CMCteams light » → Kevin même app fermée (token serveur, anti-spam KV).
    if (url.pathname === '/__notify-kevin' && request.method === 'POST') return handleNotifyKevin(request, env);
    // Mémoire cloud KDMC Lingua : sauvegarde/restauration de la progression par « clé
    // de compte » (hash nom+code = capacité). Données NON sensibles (XP/série/nom choisi).
    // ISOLÉ (préfixe KV lingua:), FAIL-OPEN (jamais throw → la mémoire locale reste).
    if (url.pathname.startsWith('/__lingua/')) return handleLingua(request, url, env);
    /* CERCLE (Kevin 2.10) : invitations, amis, présence, messages, cadeaux — base D1 gratuite, jamais le KV. */
    if (url.pathname.startsWith('/__cercle/')) return handleCercle(request, url, env, outilsCercle(env));
    // Demande de démonstration Rotaplan (formulaire SANS script : champs obligatoires imposés par le
    // navigateur, REVÉRIFIÉS ici). Kevin 27.09 « renseignements obligatoires partout pour les nouveaux ».
    if (url.pathname === '/__demande') return handleDemande(request, env, host);
    /* 🐝 LE CERVEAU DE BEE — même adresse que la page, et SEULEMENT pour Kevin (audit Bee 27.09).
       Avant : Bee appelait apis.kd-mc.com/ai, que n'importe qui pouvait faire payer en écrivant
       lui-même l'en-tête Origin (mesuré : 200 appels Anthropic d'un seul curl, aucun plafond),
       et le serveur JETAIT le caractère de Bee (« ne prétends pas avoir agi »). Ici : la session
       admin est vérifiée PAR LE DOMAINE (Face ID ou code), le caractère est fixé côté serveur,
       et le client ne peut envoyer que des messages « user » / « assistant ». */
    if (url.pathname === '/__javis/ai') return handleBeeIa(request, env);

    if (url.pathname === '/__demandes' && request.method === 'GET') {
      if (!(await adminSession(request, env))) return new Response(JSON.stringify({ ok: false, reason: 'admin requis' }), { status: 403, headers: { 'content-type': 'application/json' } });
      const idx = (env && env.ACCOUNTS) ? JSON.parse((await env.ACCOUNTS.get('demandes:idx')) || '[]') : [];
      const liste = [];
      for (const k of idx.slice(-100).reverse()) { const v = await env.ACCOUNTS.get(k); if (v) liste.push(JSON.parse(v)); }
      return new Response(JSON.stringify({ ok: true, n: liste.length, demandes: liste }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }

    const base = ROUTES[host];
    if (!base) return Response.redirect('https://kd-mc.com/', 302);

    /* 📒 ON FICHE LA VISITE — toutes les apps, y compris celles qui ne demandent
       jamais rien au domaine (16 sur 28 le 22.09). En arrière-plan : la page part
       sans attendre. Si `waitUntil` n'existe pas (test hors Cloudflare), on le fait
       quand même, mais sans bloquer la suite. */
    {
      const journal = ficheLaVisite(request, url, env, host);
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(journal);
      else journal.catch(() => { /* jamais bloquant */ });
    }

    let p = url.pathname;

    /* UNE SEULE ADRESSE POUR LINGUA (Kevin 27.09 soir : « L'icône envoie toujours sur CMCteams.
       Il ne reconnaît pas mon code sauf en passant par mon domaine »).
       Mesuré dans ce fichier : depuis kd-mc.com, /CMCteams/lingua/ servait Lingua sur une
       DEUXIÈME origine (autre mémoire locale → le compte n'y est pas, le code « n'est pas
       reconnu »), et /lingua/ demandait /kdmc-home/lingua/ à l'hébergeur, qui répond « 200 +
       page d'accueil » à ce qu'il ne connaît pas — la dernière fois que ça a été mesuré
       (19/09, run 35458650075), cette page d'accueil était CMCteams. Une icône posée depuis
       l'une de ces adresses reproduit exactement les deux symptômes.
       Règle KDMC_ADRESSES.md : UNE belle adresse par projet. Tout chemin de Lingua sur le
       domaine principal renvoie donc, en 301, vers lingua.kd-mc.com — même page, même requête. */
    if (host === 'kd-mc.com' || host === 'www.kd-mc.com') {
      /* Le reste du chemin est repris tel quel : les fichiers de l'app gardent leur casse. */
      const cl = p.match(/^\/+(?:cmcteams\/+)?lingua(\/.*)?$/i);
      if (cl) {
        const reste = cl[1] || '/';
        const canon = new URL('https://lingua.kd-mc.com' + reste + url.search);
        return new Response(null, { status: 301, headers: { location: canon.toString(), 'cache-control': 'no-store', 'x-kdmc-router': host + ' (lingua vers belle adresse)' } });
      }
      /* MÊME RÈGLE POUR TOUTES LES APPS (Kevin 27.09 nuit, capture : l'icône de l'écran d'accueil
         ouvre « kd-mc.com » et montre la connexion CMCteams). MESURÉ en vrai :
         https://kd-mc.com/tools/cuisine/index.html → 200 + CMCteams v9.926 — l'hébergeur ne
         trouve pas /kdmc-home/tools/cuisine/ et répond par SA page d'accueil (CMCteams). Une page
         d'app ouverte sous le portail part donc, en 301, vers la belle adresse de l'app.
         Seulement pour une PAGE qu'on ouvre : images, scripts et données que le portail charge
         depuis ces dossiers restent servis tels quels (aucune requête d'arrière-plan redirigée). */
      if (estUnePage(request)) {
        const vers = belleAdresseDe(p);
        if (vers) return new Response(null, { status: 301, headers: { location: vers + url.search, 'cache-control': 'no-store', 'x-kdmc-router': host + ' (page d\'app vers sa belle adresse)' } });
      }
    }

    /* PORTES PAR DOSSIER (Kevin 27.09 : « le domaine comme chaque app doit être bien sécurisé.
       Personne ne peut entrer ou modifier. Renseignements obligatoires partout pour les nouveaux »).
       Avant, PoolPilot et le coffre d'autorisations n'étaient verrouillés que sur LEUR adresse :
       mesuré le 27.09, kd-mc.com/CMCteams/tools/poolrobot/ servait l'app SANS code (toute adresse
       du domaine peut demander un dossier par /CMCteams/…). La porte se décide donc sur le
       DOSSIER réellement demandé, quel que soit le chemin pris. Voir `porteFermee`. */
    {
      const cheminCMC = p.startsWith(PAGES_PREFIX_DEFAUT + '/') ? p : (p === '/' || p === '' ? base + '/' : base + p);
      const ferme = await porteFermee(request, url, env, cheminCMC);
      if (ferme) return ferme;
      /* DONNÉES RH (audit 30.09, P0-3) : 291 noms + plannings ne sortent qu'à une personne reconnue. */
      const rh = await donneesRhFermees(request, env, cheminCMC);
      if (rh) return rh;
    }

    // Livre de cuisine « A Cüjina de Mùnegu » aussi accessible en CHEMIN du domaine
    // principal (Kevin 2026-08-13, « je dois pouvoir l'ouvrir même en 4G »). kd-mc.com
    // est déjà résolu par tous les réseaux/opérateurs → 0 attente de propagation DNS,
    // contrairement à un sous-domaine tout neuf (cujina/cocina). Chemins : /cujina,
    // /cuisine, /livre. Redirection vers le / final pour que les images relatives marchent.
    if ((host === 'kd-mc.com' || host === 'www.kd-mc.com')) {
      if (/^\/(cujina|cuisine|livre)$/.test(p)) return Response.redirect('https://' + host + p + '/', 301);
      const cm = p.match(/^\/(cujina|cuisine|livre)(\/.*)?$/);
      if (cm) {
        const rest = cm[2] || '/';
        /* ⚠️ BASCULE D'HÉBERGEUR — ce chemin l'OUBLIAIT (mesuré le 19/09/2026).
           Il fabriquait l'adresse avec « /CMCteams/… » EN DUR, sans appliquer
           PREFIX_SORTIE comme le fait le chemin normal une vingtaine de lignes plus bas.
           Depuis la bascule vers un hébergeur qui sert à la RACINE (UPSTREAM_PREFIX = ""),
           il demandait donc une adresse qui n'existe pas là-bas — et cet hébergeur répond
           « 200 + page d'accueil » quand il ne trouve rien : kd-mc.com/cujina/ servait
           l'app CMCteams (v9.914) au lieu du livre de cuisine (run 35458650075). */
        let chemin2 = '/CMCteams/tools/cuisine' + rest;
        { const ferme2 = await porteFermee(request, url, env, chemin2); if (ferme2) return ferme2; }
        if (PREFIX_SORTIE !== PAGES_PREFIX_DEFAUT && chemin2.startsWith(PAGES_PREFIX_DEFAUT + '/')) {
          chemin2 = PREFIX_SORTIE + chemin2.slice(PAGES_PREFIX_DEFAUT.length);
        }
        const upstreamUrl2 = UPSTREAM + chemin2 + url.search;
        const rh2 = new Headers(request.headers); rh2.delete('host');
        const res2 = await fetch(new Request(upstreamUrl2, {
          method: request.method, headers: rh2,
          body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
          redirect: 'manual',
        }));
        const res2g = await sansCmcteamsParAccident(res2, host, p, request);
        if (res2g !== res2 && (res2g.status === 301 || res2g.status === 404)) return res2g;
        const oh2 = new Headers(res2g.headers);
        oh2.set('x-kdmc-router', host + ' (cuisine-path)');
        if (!oh2.has('x-content-type-options')) oh2.set('x-content-type-options', 'nosniff');
        if (!oh2.has('x-frame-options')) oh2.set('x-frame-options', 'SAMEORIGIN');
        if (!oh2.has('strict-transport-security')) oh2.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
        return new Response(res2g.body, { status: res2g.status, statusText: res2g.statusText, headers: oh2 });
      }
    }

    let upstreamPath;
    if (p === '/' || p === '') upstreamPath = base + '/';
    else if (p.startsWith(PAGES_PREFIX_DEFAUT + '/')) upstreamPath = p;
    else upstreamPath = base + p;
    /* Bascule d'hébergeur : on retire le préfixe /CMCteams si la nouvelle
       source sert à la racine (Cloudflare Pages, par exemple). */
    /* ⚠️ On GARDE le chemin d'AVANT la bascule : la bouée de secours (copie
       embarquée, plus bas) est rangée avec le préfixe /CMCteams/… Sans cette
       mémoire, basculer sur un hébergeur qui sert à la racine rendrait la
       bouée MUETTE en silence (elle chercherait /tools/departs/index.html
       dans un dossier qui range /CMCteams/tools/departs/index.html). */
    const upstreamPathAvantBascule = upstreamPath;
    /* Même bascule appliquée à la BASE de l'app : c'est ce préfixe-là que l'amont
       renvoie dans ses redirections (ex « /shops/kit-ia/bureau »), pas /CMCteams/… */
    let baseAmont = base;
    if (PREFIX_SORTIE !== PAGES_PREFIX_DEFAUT && baseAmont.startsWith(PAGES_PREFIX_DEFAUT + '/')) {
      baseAmont = PREFIX_SORTIE + baseAmont.slice(PAGES_PREFIX_DEFAUT.length);
    }
    if (PREFIX_SORTIE !== PAGES_PREFIX_DEFAUT && upstreamPath.startsWith(PAGES_PREFIX_DEFAUT + '/')) {
      upstreamPath = PREFIX_SORTIE + upstreamPath.slice(PAGES_PREFIX_DEFAUT.length);
    }

    const upstreamUrl = UPSTREAM + upstreamPath + url.search;
    const reqHeaders = new Headers(request.headers);
    reqHeaders.delete('host');
    const upstreamReq = new Request(upstreamUrl, {
      method: request.method,
      headers: reqHeaders,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    let res;
    try {
      res = await fetch(upstreamReq);
    } catch (e) {
      res = new Response('upstream injoignable', { status: 502 });
    }
    /* ---- BOUÉE DE SECOURS (Kevin 2026-08-14) --------------------------------
       Le compte GitHub a été suspendu → GitHub Pages s'est éteint et les 20
       sous-domaines renvoyaient 404 (« 404 » constaté par Kevin sur iPhone).
       Si une COPIE des pages a été embarquée dans le Worker (binding ASSETS,
       cf. prepare-secours.mjs), on la sert au lieu de la page morte.
       Ce repli ne se déclenche QUE sur échec de l'amont : dès que GitHub
       revient, le comportement est identique à avant, sans rien remettre. */
    if (env && env.ASSETS && (res.status === 404 || res.status === 403 || res.status >= 500)) {
      try {
        /* Deux rangements possibles pour la copie : celui de l'amont du jour
           (après bascule) ET celui d'origine (/CMCteams/…). On essaie les
           deux, dans cet ordre — la bouée doit marcher quel que soit
           l'hébergeur choisi, sinon elle ne sert à rien le jour d'une panne. */
        const candidats = [upstreamPath];
        if (upstreamPathAvantBascule !== upstreamPath) candidats.push(upstreamPathAvantBascule);
        /* ── LE STOCKAGE RÉPOND-IL « oui » À TOUT ? (mesuré le 19/09/2026) ──────────
           Beaucoup de stockages statiques servent « 200 + la page d'accueil » pour un
           chemin inconnu (repli monopage). La bouée faisait confiance à n'importe quel
           200 : sur le VRAI domaine, 12 surfaces renvoyaient alors l'app CMCteams à la
           place de leur page — kit.kd-mc.com/lire.html, /bureau.html (page de vente
           37 €), kd-mc.com/cujina/, kd-mc.com/admin/commerce.html… (run 35458650075).
           Pour un visiteur c'est PIRE qu'un 404 : rien ne signale l'erreur.
           On pose donc une SONDE sur un chemin qui ne peut pas exister. Si le stockage
           lui répond 200, c'est qu'il répond à tout : sa copie ne prouve rien pour ce
           chemin-là, et on garde la réponse d'origine (404 honnête).
           Aucune régression : un stockage honnête répond 404 à la sonde, et la bouée
           sert la copie exactement comme avant. */
        let repondATout = false;
        try {
          const sonde = await env.ASSETS.fetch(new Request(
            new URL('/__sonde-inexistante-' + Date.now() + '.html', url.origin).toString(),
            { method: 'GET' },
          ));
          repondATout = !!(sonde && sonde.ok);
        } catch (e) { /* sonde impossible → on reste prudent, on ne bloque rien */ }
        let secours = null;
        for (const cand of candidats) {
          const local = new Request(new URL(cand, url.origin).toString(), { method: 'GET', headers: request.headers });
          secours = await env.ASSETS.fetch(local);
          /* Un dossier sans fichier exact → on tente son index.html (le
             comportement de GitHub Pages, qu'on doit reproduire fidèlement). */
          if (!secours.ok && !/\.[a-z0-9]{2,5}$/i.test(cand)) {
            const avecIndex = cand.replace(/\/?$/, '/') + 'index.html';
            secours = await env.ASSETS.fetch(new Request(new URL(avecIndex, url.origin).toString(), { method: 'GET', headers: request.headers }));
          }
          if (secours.ok) break;
        }
        if (secours && secours.ok && !repondATout) {
          const hs = new Headers(secours.headers);
          hs.set('x-kdmc-secours', 'assets');   /* honnêteté : on DIT que c'est la copie */
          res = new Response(secours.body, { status: 200, headers: hs });
        }
      } catch (e) { /* le secours ne doit JAMAIS aggraver : on garde la réponse d'origine */ }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        const h = new Headers(res.headers);
        /* La redirection vient de l'hébergeur du jour : on lui passe SON rangement
           (base après bascule) EN PLUS de l'historique, et SON nom de domaine. */
        h.set('location', rewriteLocation(loc, base, host, baseAmont, UPSTREAM));
        return new Response(null, { status: res.status, headers: h });
      }
    }
    /* Jamais CMCteams par accident (repli de l'hébergeur) hors de cmcteams.kd-mc.com — voir sansCmcteamsParAccident. */
    res = await sansCmcteamsParAccident(res, host, p, request);
    if (res.status === 301 || res.status === 404 && /repli/.test(res.headers.get('x-kdmc-router') || '')) return res;
    const outHeaders = new Headers(res.headers);
    outHeaders.delete('content-security-policy-report-only');
    outHeaders.set('x-kdmc-router', host);
    /* En-têtes sécurité (ajoutés seulement si l'upstream ne les pose pas) :
       nosniff + Referrer-Policy (renforce la confidentialité du pass #kdmc_sso=). */
    if (!outHeaders.has('x-content-type-options')) outHeaders.set('x-content-type-options', 'nosniff');
    if (!outHeaders.has('referrer-policy')) outHeaders.set('referrer-policy', 'strict-origin-when-cross-origin');
    /* Anti-clickjacking (équivaut à frame-ancestors 'self', impossible en <meta>) +
       HSTS (tous les sous-domaines kd-mc.com sont en HTTPS via Cloudflare). */
    if (!outHeaders.has('x-frame-options')) outHeaders.set('x-frame-options', 'SAMEORIGIN');
    if (!outHeaders.has('strict-transport-security')) outHeaders.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  },
  /* Cron 5 min (wrangler.toml [triggers]) : sentinelle « robot en surface » — no-op tant
     que Tuya n'est pas lié ; notifie Kevin à CHAQUE remontée du robot (transition seule). */
  async scheduled(event, env, ctx) { ctx.waitUntil(Promise.all([tuyaSurfaceCheck(env), tuyaScheduleTick(env), tuyaHistoryTick(env)])); },
};

/* PORTE D'ENTRÉE UNIQUE (audit du domaine, 27.09.2026 — sonde run 36336678721).
   Mesuré de l'extérieur : les en-têtes de sécurité n'étaient posés QUE sur le chemin
   « page servie par l'hébergeur ». Toutes les réponses fabriquées par le routeur lui-même
   (porte fermée 401 de cuisine/osint/ia/outils/tor/worldmonitor/dossiers, admin.kd-mc.com,
   autorisations, beatbot) partaient SANS HSTS, sans anti-iframe, sans nosniff — note 0/100.
   Et http://kd-mc.com/ répondait 200 en clair au lieu de rediriger vers https.
   Ici, CHAQUE réponse passe par le même durcissement, quel que soit le chemin qui l'a faite :
   un nouveau `return new Response(...)` ne peut plus l'oublier. */
/* ─── UNE APP N'EST SERVIE QU'À SA BELLE ADRESSE — et CMCteams jamais par accident ───────────
   Kevin 27.09 nuit : « Personne ne doit atterrir sur CMCteams ou light sans se connecter ou
   s'inscrire complètement », puis une capture : icône → « kd-mc.com » → connexion CMCteams.
   Deux causes, deux protections :
   1. belleAdresseDe(chemin) : sur kd-mc.com, un chemin qui est le DOSSIER d'une app
      (/tools/cuisine/…, /CMCteams/tools/cuisine/…) → https://<son sous-domaine>/<reste>.
   2. estPageCmcteams(texte) : l'hébergeur répond « 200 + SA page d'accueil » (= CMCteams) à
      tout chemin qu'il ne connaît pas. Hors de cmcteams.kd-mc.com, une telle réponse n'est
      JAMAIS servie : page « introuvable » honnête (404), ou renvoi vers cmcteams.kd-mc.com
      quand c'est vraiment l'accueil de CMCteams qui était demandé. */
export function belleAdresseDe(chemin) {
  const c = cheminNormal(chemin);
  for (const h of Object.keys(ROUTES)) {
    if (h === 'kd-mc.com' || h === 'www.kd-mc.com') continue;
    const dossier = ROUTES[h].toLowerCase();                          // ex. /cmcteams/tools/cuisine
    const rel = dossier.replace(/^\/cmcteams/, '');                   // ex. /tools/cuisine
    if (!rel || rel.startsWith('/kdmc-home')) continue;               // CMCteams lui-même / pages du portail
    for (const pre of [dossier, rel]) {
      if (c === pre || c.startsWith(pre + '/')) {
        const reste = String(chemin).slice(pre.length) || '/';        // casse d'origine gardée
        return 'https://' + h + (reste.startsWith('/') ? reste : '/' + reste);
      }
    }
  }
  return '';
}
export function estPageCmcteams(texte) {
  const debut = String(texte || '').slice(0, 20000);
  /* La page PRINCIPALE de CMCteams seulement : « CMCteams light » (départs) et « CMCteams - Force MAJ »
     sont d'autres pages, légitimes à leurs adresses — mesuré sur tout le dépôt. */
  return /<title>\s*CMCteams\s*[—–-]\s*Planning/i.test(debut) || /var APP_VER="v9\.\d+"/.test(String(texte || ''));
}
/* Garde appliquée à une page HTML de l'hébergeur avant de la servir (hors cmcteams.kd-mc.com). */
async function sansCmcteamsParAccident(res, host, chemin, request) {
  if (host === 'cmcteams.kd-mc.com') return res;
  if (!res || res.status !== 200 || request.method !== 'GET') return res;
  if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;
  const texte = await res.text();
  if (!estPageCmcteams(texte)) { const h = new Headers(res.headers); h.delete('content-length'); return new Response(texte, { status: res.status, statusText: res.statusText, headers: h }); }
  const c = cheminNormal(chemin);
  if (/^\/cmcteams\/?(index\.html)?$/.test(c)) {
    return new Response(null, { status: 301, headers: { location: 'https://cmcteams.kd-mc.com/', 'cache-control': 'no-store', 'x-kdmc-router': host + ' (CMCteams à sa belle adresse)' } });
  }
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>Page introuvable — kd-mc.com</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1409;color:#f3f0e6;font:15px/1.5 -apple-system,sans-serif;padding:24px;text-align:center}.c{max-width:340px}h1{font-size:19px;color:#f6d97a}a{display:inline-block;margin-top:14px;min-height:48px;line-height:48px;padding:0 20px;border-radius:13px;background:#e8b830;color:#11160c;font-weight:700;text-decoration:none}</style></head>'
    + '<body><div class="c"><div style="font-size:44px">🧭</div><h1>Cette page n’existe pas ici</h1><p>L’adresse ouverte ne correspond à aucune page. Si c’est une icône de ton écran d’accueil, supprime-la et repose-la depuis l’app.</p><a href="https://kd-mc.com/">Aller à mon espace</a></div></body></html>';
  return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-kdmc-router': host + ' (repli de l\'hébergeur refusé)' } });
}

export function durcirReponse(res) {
  if (!res || res.status === 101 || res.webSocket) return res;   // WebSocket : on n'y touche pas
  const h = new Headers(res.headers);
  if (!h.has('x-content-type-options')) h.set('x-content-type-options', 'nosniff');
  if (!h.has('referrer-policy')) h.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (!h.has('x-frame-options')) h.set('x-frame-options', 'SAMEORIGIN');
  if (!h.has('strict-transport-security')) h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    if (u.protocol === 'http:' && /(^|\.)kd-mc\.com$/i.test(u.hostname)) {
      u.protocol = 'https:';
      return durcirReponse(new Response(null, { status: 301, headers: { location: u.toString() } }));
    }
    return durcirReponse(await ROUTEUR.fetch(request, env, ctx));
  },
  scheduled(event, env, ctx) { return ROUTEUR.scheduled(event, env, ctx); },
};

/* Réécrit le « Location » d'une redirection de l'amont vers l'adresse publique.
   TROUVÉ LE 19/09/2026 (run 35460096029) : cette fonction ne connaissait que
   l'hébergeur historique — `github.io` et le rangement `/CMCteams/…`. Depuis la
   bascule du 18/09 vers un hébergeur qui sert à la RACINE, elle cassait DEUX fois :
     · une redirection venant de `*.pages.dev` était jugée douteuse → on renvoyait
       le visiteur à la racine de l'app au lieu de la page demandée ;
     · une redirection RELATIVE (« /shops/kit-ia/bureau ») ne commençait plus par
       `base` (« /CMCteams/shops/kit-ia ») → le préfixe n'était pas retiré et on
       fabriquait « kit.kd-mc.com/shops/kit-ia/bureau », que le routeur re-préfixe
       en « /CMCteams/shops/kit-ia/shops/kit-ia/bureau ». Cette adresse n'existe
       nulle part, et l'hébergeur répond « 200 + sa page d'accueil » — laquelle est
       l'app CMCteams. D'où les 11 pages du Kit qui affichaient v9.914 au lieu de
       leur contenu : elles sont servies après une redirection (cet hébergeur
       redirige « /page.html » vers « /page »).
   FAIL-SECURE conservé : on n'accepte une redirection absolue que si elle vient de
   github.io OU de l'hébergeur configuré ; jamais de CRLF ; tout cas douteux → racine. */
function rewriteLocation(loc, base, host, baseAmont, upstream) {
  try {
    let path = loc;
    if (/^https?:\/\//i.test(loc)) {
      const u = new URL(loc);
      let hoteAmont = '';
      try { hoteAmont = upstream ? new URL(upstream).hostname : ''; } catch { hoteAmont = ''; }
      const permis = u.hostname.endsWith('github.io') || (hoteAmont && u.hostname === hoteAmont);
      if (!permis) return 'https://' + host + '/';
      path = u.pathname + u.search + u.hash;
    }
    if (/[\r\n]/.test(path)) return 'https://' + host + '/';
    /* On retire le préfixe de l'app, quel que soit l'hébergeur : celui d'aujourd'hui
       (baseAmont) comme l'historique (base). Le plus LONG d'abord, sinon un préfixe
       vide ou plus court mangerait l'autre. */
    const prefixes = [baseAmont, base].filter((p) => typeof p === 'string' && p !== '')
      .sort((a, b) => b.length - a.length);
    for (const p of prefixes) {
      if (path.startsWith(p + '/')) { path = path.slice(p.length); break; }
      if (path === p) { path = '/'; break; }
    }
    return 'https://' + host + path;
  } catch { return 'https://' + host + '/'; }
}

/* ===================== SSO transverse kd-mc.com ===================== */
const SSO_COOKIE = 'kdmc_sso';
/* Un battement de présence (whoami toutes les 60 s) n'écrit la fiche qu'à cette cadence — voir enrich(). */
const ENRICH_CADENCE = 10 * 60e3;
/* CONDITIONS — UN SEUL TEXTE POUR TOUT LE DOMAINE (Kevin 2026-09-27 : « le CGU doit être demandé
   qu'une seule fois dans n'importe quelle app et sauvegardé pour chaque app du domaine. CGU rapide,
   vague, simplifié »). Servi par /__sso/cgu ; l'acceptation vit dans la fiche (`cgu_at`) et vaut
   dans toutes les apps. Changer la version redemande l'accord une fois, partout. */
const CGU_VERSION = 2;
const CGU_TEXTE = 'Un seul compte pour toutes les apps KDMC. Tes informations restent privées et ne servent qu\'à te reconnaître. Tu peux te déconnecter ou demander l\'effacement quand tu veux.';
const SSO_TTL = 30 * 24 * 3600;
/* Admins du domaine (peuvent voir les fiches clients). uid = slug prénom-nom. */
const ADMIN_UIDS = ['kdmc_admin', 'kevin-desarzens'];
/* LE LAISSEZ-PASSER ADMIN VIT 24 H (Kevin 30.09 : « B » — « 24 heures, puis Face ID une fois par jour »).
   Audit complet Bee 30.09 : le laissez-passer VÉRIFIÉ de l'admin (v=1) valait 30 jours et est rangé dans
   chaque app installée (localStorage, obligatoire sur iPhone) : une faille dans UNE app du domaine
   = l'admin de tout le domaine pendant 30 jours. Désormais 24 h pour lui ; les autres comptes gardent
   30 jours (leur laissez-passer n'ouvre que LEURS données — règle « reconnu auto après 1re connexion »). */
const SSO_TTL_ADMIN = 24 * 3600;
function ssoTtl(uid, verified) { return verified && ADMIN_UIDS.indexOf(uid) >= 0 ? SSO_TTL_ADMIN : SSO_TTL; }
/* la durée du cookie = celle qui reste au laissez-passer qu'il porte (jamais plus longue) */
function maxAgeDe(token) {
  try { const d = JSON.parse(b64urlToStr(String(token).split('.')[0])); return Math.max(60, Math.floor(((d.exp || 0) - Date.now()) / 1000)); }
  catch (_) { return 60; }
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(str) { return b64url(new TextEncoder().encode(str)); }
function b64urlToStr(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return atob(s); }
async function ssoHmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))));
}
async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function ssoSign(secret, uid, name, cgu, verified, codeProuve) {
  /* v=1 → identité FORTE (prouvée par passkey/Face ID). v=0 → faible (nom+code
     auto-asserté). Les apps ne doivent accorder de confiance qu'à v=1. */
  /* k=1 → le CODE du compte a été prouvé au domaine (27.09) : plus que « auto-déclaré », moins
     que Face ID. N'accorde JAMAIS l'admin (seul v=1 le peut). */
  const p = b64urlStr(JSON.stringify({ u: uid, n: name, c: cgu ? 1 : 0, v: verified ? 1 : 0, k: codeProuve ? 1 : 0, iat: Date.now(), exp: Date.now() + ssoTtl(uid, verified) * 1000 }));
  return p + '.' + (await ssoHmac(secret, p));
}
/* ===== CODE DU COMPTE, VÉRIFIÉ PAR LE DOMAINE (Kevin 2026-09-27) =====
   « Lorsqu'une personne crée son compte et code dans le domaine ou une app, il peut se
   connecter aux autres apps du domaine avec les mêmes. Reconnu auto. »
   Avant : le code n'existait QUE dans le téléphone (kdmc-portal.js, PBKDF2 local) ; le domaine
   rangeait par NOM sans rien vérifier → sur un appareil neuf, taper un nom suffisait pour
   recevoir la session de cette personne, et le même nom + code ne marchait nulle part ailleurs.
   Maintenant : empreinte PBKDF2-SHA256 (100 000 passes — plafond des Workers, sel aléatoire par
   compte) en KV `cred:<uid canonique>`. Jamais le code. Jamais pour l'identité admin (Face ID). */
const CRED_ITER = 100000;
async function credHash(code, saltHex) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(String(saltHex).match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: CRED_ITER }, k, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function credGet(env, uid) {
  if (!env || !env.ACCOUNTS) return null;
  try { return JSON.parse((await env.ACCOUNTS.get('cred:' + uid)) || 'null'); } catch { return null; }
}
async function credSet(env, uid, code) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const rec = { s: salt, h: await credHash(code, salt), i: CRED_ITER, at: Date.now() };
  await env.ACCOUNTS.put('cred:' + uid, JSON.stringify(rec));
  return rec;
}
async function credOk(rec, code) {
  if (!rec || !rec.s || !rec.h) return false;
  return hexEq(await credHash(code, rec.s), rec.h);
}
/* Essais limités PAR COMPTE, FERMÉ en cas de doute (au contraire de rlFail) : si le registre
   ne répond pas, on refuse d'essayer un code plutôt que de laisser deviner sans limite.
   5 erreurs → 15 min, puis doublement (plafond 24 h). */
async function credVerrou(env, uid) {
  try {
    const r = JSON.parse((await env.ACCOUNTS.get('rlc:' + uid)) || 'null');
    return r && r.until > Date.now() ? Math.ceil((r.until - Date.now()) / 1000) : 0;
  } catch { return 900; }
}
async function credEchec(env, uid) {
  try {
    const r = JSON.parse((await env.ACCOUNTS.get('rlc:' + uid)) || 'null') || { f: 0 };
    r.f = (r.f || 0) + 1;
    r.until = r.f >= 5 ? Date.now() + Math.min(900e3 * Math.pow(2, r.f - 5), 86400e3) : 0;
    await env.ACCOUNTS.put('rlc:' + uid, JSON.stringify(r), { expirationTtl: 86400 });
  } catch { /* le verrou reste fermé au prochain essai (credVerrou refuse si illisible) */ }
}
async function credReussite(env, uid) { try { if (env.ACCOUNTS.delete) await env.ACCOUNTS.delete('rlc:' + uid); } catch { /* */ } }
const CODE_VALIDE = (c) => typeof c === 'string' && c.length >= 6 && c.length <= 64;
async function ssoVerify(secret, token) {
  if (!token || token.indexOf('.') < 0) return null;
  const dot = token.indexOf('.'); const p = token.slice(0, dot); const sig = token.slice(dot + 1);
  const expect = await ssoHmac(secret, p);
  if (sig.length !== expect.length) return null;
  let diff = 0; for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return null;
  /* ACCENTS (2.10, mesuré) : ssoSign écrit le passe en UTF-8 (TextEncoder) mais on le relisait octet par octet
     → « Zoé Lefèvre » revenait « ZoÃ© LefÃ¨vre » dans TOUTES les apps. On relit en UTF-8 (tous les passes émis le sont). */
  let d; try { const bin = b64urlToStr(p); d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))); } catch { return null; }
  if (!d || !d.u || !d.exp || d.exp < Date.now()) return null;
  return { uid: d.u, name: d.n || '', cgu: d.c === 1, verified: d.v === 1, code: d.k === 1, iat: d.iat || 0, exp: d.exp };
}
/* Révocation à distance (« Déconnecter partout ») : un token émis AVANT
   acc.revoked_at est refusé. Le user peut se RE-connecter (nouveau token,
   iat > revoked_at) — on tue les sessions perdues/volées, jamais le compte. */
function revoked(acc, s) { return !!(acc && acc.revoked_at && (s.iat || 0) < acc.revoked_at); }
function ssoCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (_) { return ''; }   /* cookie mal encodé = pas de cookie, jamais une exception (erreur 1101) */
}
/* Source du pass de session : header Authorization Bearer EN PRIORITÉ (marche
   même avec les PWA installées sur iOS, où chaque app a un jar de cookies isolé),
   sinon le cookie (Safari même-origine). Rend le compte unique iPhone-proof. */
/* Origine acceptée pour ÉMETTRE une session (/__sso/issue) : le domaine lui-même (racine ou
   sous-domaine), une app native (capacitor:// / ionic://), ou AUCUN en-tête Origin (outil,
   app installée qui ne l'envoie pas : pas de navigateur tiers en jeu). « null » (iframe
   sandbox, fichier local) et tout autre site → refusé. Strix vuln-0001, 11/09/2026. */
/* Fiche de renseignements : on ne garde que des champs CONNUS, bornés, au bon format
   (jamais de HTML, jamais de champ inventé). Un champ vide ou invalide est ignoré, pas
   effacé : une erreur de frappe ne détruit pas ce qui était juste. Fonction PURE (testée). */
const FICHE_TEXTES = [['poste', 60], ['adresse', 160], ['usm', 30]];
function ficheTxt(v, n) {
  return String(v == null ? '' : v).replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}
/* E-mail : un seul « @ », pas d'espace, un point dans le domaine (ni au début ni à la fin).
   Contrôle par indices, sans expression régulière à retour arrière. */
function ficheMailOk(m) {
  if (!m || m.length > 120 || /\s/.test(m)) return false;
  const i = m.indexOf('@');
  if (i < 1 || i !== m.lastIndexOf('@')) return false;
  const dom = m.slice(i + 1), p = dom.lastIndexOf('.');
  return p > 0 && p < dom.length - 1;
}
function ficheAnnee(v, min, max) {
  const y = Number.parseInt(v, 10);
  return y >= min && y <= max ? y : null;
}
function ficheNaissanceOk(s, an) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  return y >= 1930 && y <= an - 16;
}
function ficheNettoyee(b) {
  const src = b || {}, o = {}, an = new Date().getFullYear();
  const mat = ficheTxt(src.matricule, 12).toUpperCase();
  if (/^U\d{3,6}$/.test(mat)) o.matricule = mat;
  for (const k of ['anneeSbm', 'anneeJeux']) {
    const y = ficheAnnee(ficheTxt(src[k], 4), 1950, an);
    if (y !== null) o[k] = y;
  }
  const tel = ficheTxt(src.telephone, 24);
  if (/^\+?[0-9 .()-]{6,24}$/.test(tel)) o.telephone = tel;
  const mail = ficheTxt(src.email, 120).toLowerCase();
  if (ficheMailOk(mail)) o.email = mail;
  const nais = ficheTxt(src.dateNaissance, 10);
  if (ficheNaissanceOk(nais, an)) o.dateNaissance = nais;
  for (const [k, n] of FICHE_TEXTES) { const v = ficheTxt(src[k], n); if (v) o[k] = v; }
  return o;
}
function ssoOriginOk(origin, selfHost) {
  if (!origin) return true;
  const o = String(origin).trim().toLowerCase();
  if (o === 'null') return false;
  if (/^(capacitor|ionic):\/\/localhost$/.test(o)) return true;
  let host = '';
  try { host = new URL(o).host; } catch { return false; }
  /* même origine que l'hôte appelé (portail local, test navigateur sur 127.0.0.1:port) :
     par définition pas un site tiers. Mesuré le 11/09 : sans cette ligne, le test SSO réel
     (tools/kdmc-sso-e2e) perdait 2 contrôles — le portail servi en local ne pouvait plus
     émettre de session. */
  if (selfHost && host === String(selfHost).toLowerCase()) return true;
  const hn = host.replace(/:\d+$/, '');
  return hn === 'kd-mc.com' || hn.endsWith('.kd-mc.com');
}
function ssoTokenSansAdresse(request) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return (request.headers.get('x-kdmc-sso') || '').trim() || ssoCookie(request, SSO_COOKIE);
}
function ssoToken(request) {
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  /* (27.09.2026, inventaire « reconnu partout ») : Créa Studio installé envoyait son pass en
     en-tête x-kdmc-sso et en ?t= — que seule adminSession lisait. Toute porte du domaine lit
     désormais les mêmes canaux : Bearer, x-kdmc-sso, ?t=, cookie. */
  const x = (request.headers.get('x-kdmc-sso') || '').trim();
  if (x) return x;
  try { const t = new URL(request.url).searchParams.get('t'); if (t) return t.trim(); } catch { /* */ }
  return ssoCookie(request, SSO_COOKIE);
}
/* Les passkeys de l'admin vivent sous UNE clé (l'uid canonique), quel que soit l'uid de la session
   qui les a enrôlés : sinon `pk:kevin-desarzens` pouvait être VIDE pendant que `pk:kdmc_admin` était
   plein, et un inconnu déclarant « kevin-desarzens » passait le « bootstrap » (trou trouvé le 27.09). */
function pkKey(uid) { return 'pk:' + (ADMIN_UIDS.indexOf(uid) >= 0 ? CANON_UID : uid); }
function J(o, setCookie, status) {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-kdmc-sso': '1', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
  for (const c of Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : [])) h.append('set-cookie', c);
  return new Response(JSON.stringify(o), { status: status || 200, headers: h });
}

/* ===== Mémoire cloud KDMC Lingua (progression apprenants) =====
   Stocke/restaure un blob par « clé de compte » = hash(nom+code) fourni par le client
   (accès par CAPACITÉ : il faut connaître nom+code). Données NON sensibles (XP, série,
   prénom choisi). Isolé par préfixe KV `lingua:`. FAIL-OPEN : ne jette jamais → si KV
   absent/erreur, l'app garde sa mémoire locale. Même origine (lingua.kd-mc.com) mais on
   autorise le CORS en lecture large (endpoints par capacité, non sensibles). */
/* ═══ LES DEUX PORTES QUI DÉPENSENT L'ARGENT DE KEVIN ═══════════════════════
 *
 * Kevin, 22.09.2026 : « j'ai eu des prélèvements OpenAI, dis-moi ce qui consomme ».
 * Mesuré : deux portes du routeur appellent api.openai.com avec SA clé —
 *   • GET  /__lingua/tts        → la voix naturelle (facturée au caractère) ;
 *   • POST /__lingua/rt-session → l'appel en direct (le produit OpenAI le PLUS
 *     cher, facturé à la minute d'audio).
 * Elles étaient ouvertes à TOUT LE MONDE : pas d'identification, CORS « * ».
 * Prouvé en exécutant le code : un simple `curl`, sans rien d'autre, faisait
 * partir un appel OpenAI ; 160 demandes = 160 appels, sans aucun plafond.
 * N'importe qui connaissant l'adresse pouvait donc dépenser sans limite.
 *
 * DEUX VERROUS, volontairement simples et FAIL-OPEN côté utilisateur :
 *   1. la demande doit venir d'une page du domaine (Origin OU Referer) ;
 *   2. un plafond par appareil et par heure, pour que même une page du domaine
 *      détournée ne puisse pas vider le compte.
 * Dans les deux cas de refus on répond 200 avec ok:false : l'app retombe sur la
 * voix du téléphone, comme elle le fait déjà quand la clé est absente. Jamais de
 * page cassée — juste plus de facture. */
const DOMAINE_PAGE = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com(\/|$)/;
function vientDuDomaine(request) {
  const o = request.headers.get('Origin') || '';
  if (o) return DOMAINE_PAGE.test(o);
  /* Une balise <audio src="…"> de même origine n'envoie PAS d'Origin, mais elle
     envoie un Referer. Un script en ligne de commande n'envoie ni l'un ni l'autre. */
  const r = request.headers.get('Referer') || '';
  return !!r && DOMAINE_PAGE.test(r);
}
/* Plafond simple : N demandes par appareil et par fenêtre. FAIL-OPEN si le KV
   tombe (on ne casse pas la voix pour un souci de stockage). */
async function souslePlafond(env, quoi, request, max, fenetreS) {
  try {
    if (!env || !env.ACCOUNTS) return true;
    const ip = request.headers.get('CF-Connecting-IP') || 'inconnu';
    const seau = Math.floor(Date.now() / (fenetreS * 1000));
    const cle = 'q:' + quoi + ':' + (await sha256Hex(ip + '|' + quoi)).slice(0, 24) + ':' + seau;
    const n = parseInt((await env.ACCOUNTS.get(cle)) || '0', 10) || 0;
    if (n >= max) return false;
    await env.ACCOUNTS.put(cle, String(n + 1), { expirationTtl: fenetreS + 60 });
    return true;
  } catch { return true; }
}

/* ═══ LA VOIX GRATUITE, QUAND LA VOIX PAYANTE N'EST PAS DISPONIBLE ═════════
 *
 * Kevin, 22.09.2026 : « trouve une solution pour le faire en gratuit ».
 * Cloudflare offre un moteur de voix compris dans le compte (binding `AI`,
 * AUCUNE clé, aucune facture). Il est utilisé quand — et seulement quand — la
 * voix payante ne peut pas répondre : clé absente, plafond atteint, ou OpenAI
 * en panne. Avant, ces trois cas retombaient sur la voix du TÉLÉPHONE, celle
 * qui sonne robot. C'est donc un gain, pas un recul.
 *
 * HONNÊTE : ce moteur gratuit n'a pas la finesse de la voix payante. Il n'est
 * donc PAS mis par défaut — la voix normale de Lingua ne change pas d'un iota.
 * Le résultat est rangé À PART (« gratuite: », 1 jour — audit complet 30.09) : une
 * phrase dépannée en gratuit ne prend jamais la place de la belle voix.
 *
 * DÉFENSIF : selon les modèles, Workers AI renvoie soit du binaire, soit un
 * objet { audio: "<base64>" }. On accepte les deux, et si on ne reconnaît
 * rien, on renvoie null → l'app retombe sur la voix du téléphone, exactement
 * comme aujourd'hui. Aucun risque de régression. */
/* ═══ COMPTEUR DE DÉPENSE — « dis-moi QUOI consomme mon OpenAI » ═════════
 *
 * Kevin, 22.09.2026 : « j'ai eu des prélèvements, quelque chose consomme mon
 * OpenAI, dis-moi quoi ». On ne peut pas lire SA facture OpenAI depuis ici
 * (il faudrait une clé d'administration de son compte, qu'on n'a pas, et qu'on
 * ne demandera pas). En revanche on peut compter EXACTEMENT ce que NOTRE
 * domaine fait partir chez OpenAI : chaque appel réellement PAYÉ (un son déjà
 * en cache ne compte pas, il est gratuit) incrémente un compteur du jour.
 *
 * C'est une mesure, pas une estimation : 0 appel compté = notre domaine n'est
 * pas la cause du prélèvement, et il faut chercher ailleurs (un autre outil,
 * un autre appareil). Lisible sur /__lingua/depense (admin seulement).
 * Si le compteur ne peut pas être écrit, on NE PAIE PAS (audit complet 30.09) : la voix
 * gratuite prend le relais — la voix marche quand même, sans facture hors compteur. */
/* Plafond GLOBAL du jour, tous appareils confondus : LIT le compteur que compteDepense tient déjà
   (aucune écriture de plus : le plafond d'écritures KV du compte a été atteint le 27.09). */
async function sousLePlafondDuJour(env, quoi, max) {
  try {
    if (!env || !env.ACCOUNTS) return true;
    const n = parseInt((await env.ACCOUNTS.get('dep:' + new Date().toISOString().slice(0, 10) + ':' + quoi)) || '0', 10) || 0;
    return n < max;
  } catch { return false; }   /* compteur illisible → on NE paie PAS (la voix gratuite prend le relais) */
}
/* Barrière GLOBALE sans KV (binding Rate Limiting, clé unique) ; absente ou en panne → laisse passer. */
async function limiteTous(limiteur, quoi) {
  try {
    if (!limiteur || typeof limiteur.limit !== 'function') return true;
    const r = await limiteur.limit({ key: 'tous:' + quoi });
    return !(r && r.success === false);
  } catch { return true; }
}

/* Rend true si la dépense a bien été COMPTÉE. Audit complet 30.09 (mesuré) : quand l'écriture KV
   échoue (plafond d'écritures du compte, atteint le 27.09), le compteur restait figé et 400 voix sur
   400 étaient payées sous un plafond de 300. Les appelants qui paient ne paient donc QUE si c'est compté. */
async function compteDepense(env, quoi) {
  try {
    if (!env || !env.ACCOUNTS) return false;
    const jour = new Date().toISOString().slice(0, 10);
    const cle = 'dep:' + jour + ':' + quoi;
    const n = parseInt((await env.ACCOUNTS.get(cle)) || '0', 10) || 0;
    await env.ACCOUNTS.put(cle, String(n + 1), { expirationTtl: 60 * 60 * 24 * 100 });
    return true;
  } catch (_) { return false; }
}

/* ═══ LA VOIX GRATUITE DE QUALITÉ — Google Gemini ════════════════════════
 *
 * Kevin, 22.09.2026 : « trouve une solution pour le faire en gratuit, avec les
 * mêmes performances et les mêmes résultats ». Le moteur Cloudflare plus bas
 * est gratuit mais sonne moins bien, et ne parle que français : ce n'est pas
 * « le même résultat » pour une app qui enseigne 8 langues.
 *
 * Gemini TTS, lui, a un palier gratuit, parle les mêmes langues, et accepte
 * une CONSIGNE DE JEU en langage normal — exactement comme le moteur payant
 * (c'est ce qui avait sorti la voix du registre robotique le 18.09).
 *
 * ⚠️ PIÈGE : Gemini ne rend PAS du MP3, il rend du son BRUT (PCM 16 bits,
 * 24 kHz, mono) encodé en base64. Une balise <audio> ne sait pas lire ça : il
 * faut lui coller devant l'en-tête WAV de 44 octets. Sans ça, silence total —
 * et on croirait que le moteur ne marche pas.
 *
 * Il n'est PAS mis par défaut : Kevin doit d'abord l'ENTENDRE et trancher
 * (la qualité d'une voix est un choix qui lui appartient, pas une mesure).
 * On l'atteint avec `?m=gemini`, et la page de comparaison lui fait écouter
 * les deux en un doigt. Le jour où il dit « prends Gemini », une constante
 * change et tout le domaine bascule sans un centime. */
function _wavDepuisPcm(pcm, freq) {
  const oct = pcm.byteLength, hdr = new ArrayBuffer(44), v = new DataView(hdr);
  const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + oct, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, freq, true); v.setUint32(28, freq * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, oct, true);
  const out = new Uint8Array(44 + oct);
  out.set(new Uint8Array(hdr), 0); out.set(new Uint8Array(pcm), 44);
  return out.buffer;
}
const GEMINI_TTS_MODELE = 'gemini-2.5-flash-preview-tts';
const GEMINI_VOIX = { alloy: 'Kore', nova: 'Aoede', shimmer: 'Leda', echo: 'Puck', fable: 'Charon', onyx: 'Orus' };
async function voixGemini(env, texte, voix, consigne, cleCache) {
  try {
    if (!env || !env.GEMINI_API_KEY) return null;
    const rr = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_TTS_MODELE + ':generateContent?key=' + env.GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: (consigne ? consigne + '\n\n' : '') + String(texte || '').slice(0, 2000) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOIX[voix] || 'Kore' } } },
        },
      }),
    });
    if (!rr.ok) return null;
    const j = await rr.json().catch(() => null);
    const part = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0];
    const b64 = part && part.inlineData && part.inlineData.data;
    if (!b64) return null;
    /* Le type annoncé porte la fréquence (« audio/L16;rate=24000 ») : on la lit
       plutôt que de la supposer — un jour le modèle pourra changer de cadence,
       et un WAV avec la mauvaise fréquence donne une voix de canard. */
    const mime = String((part.inlineData && part.inlineData.mimeType) || '');
    const freq = parseInt((mime.match(/rate=(\d+)/) || [])[1] || '24000', 10) || 24000;
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const buf = _wavDepuisPcm(u8.buffer, freq);
    if (!buf || buf.byteLength < 1024) return null;
    try { if (cleCache) await env.ACCOUNTS.put(cleCache, buf, { expirationTtl: 60 * 60 * 24 * 400 }); } catch (_) { /* cache best-effort */ }
    return new Response(buf, { status: 200, headers: { 'content-type': 'audio/wav', 'cache-control': 'public, max-age=31536000, immutable', 'x-voix': 'gemini-gratuite' } });
  } catch (_) { return null; }
}

const VOIX_GRATUITE_MODELE = '@cf/myshell-ai/melotts';
/* cleCache = la clé de la voix PAYANTE ; le son gratuit est rangé À PART (« gratuite: », 1 jour).
   Audit complet 30.09 (sonde exécutée) : rangé sous la clé payante pour 400 jours, un dépannage gratuit
   remplaçait à jamais la belle voix de cette phrase — même le lendemain, une fois le plafond remis à zéro. */
/* Langues que MeloTTS sait dire (Cloudflare Workers AI). Audit voix 2.10 : la langue était figée sur « fr » →
   une phrase anglaise ou chinoise sortait avec l'accent français. Langue hors liste (it, de, ru, ar, ja, ko…) →
   null : la voix du téléphone (bonne langue, bon accent) prend le relais plutôt qu'un accent faux.
   Sans `l=` (Bee, javis, l'arbre : pages françaises) → « fr », comme avant. */
const MELO_LANGUES = { fr: 'fr', en: 'en', es: 'es', zh: 'zh' };
function meloLangue(l) { if (!l) return 'fr'; return MELO_LANGUES[String(l).toLowerCase().slice(0, 2)] || ''; }
async function voixGratuite(env, texte, cleCache, cors, l) {
  const lang = meloLangue(l);
  if (!lang) return null;
  const cleG = cleCache ? 'gratuite:' + cleCache + (lang === 'fr' ? '' : ':' + lang) : '';
  /* les MÊMES en-têtes CORS que la belle voix : Bee sur javis ou l'arbre lit ce son (contre-audit 30.09) */
  /* audio/wav, pas audio/mpeg : MeloTTS rend du WAV (mesuré le 2.10, run 36943228057 : « RIFF … WAVE audio, PCM 16 bit, 44100 Hz ») */
  const entetes = { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=86400', 'x-voix': 'gratuite', ...cors };   // étaler undefined est permis : rien à ajouter
  try {
    if (cleG) { const deja = (await lireCacheVoix(cleG)) || (env && env.ACCOUNTS ? await env.ACCOUNTS.get(cleG, 'arrayBuffer') : null); if (deja) return new Response(deja, { status: 200, headers: entetes }); }
  } catch (_) { /* cache best-effort */ }
  try {
    if (!env || !env.AI || typeof env.AI.run !== 'function') return null;
    const sortie = await env.AI.run(VOIX_GRATUITE_MODELE, { prompt: String(texte || '').slice(0, 1000), lang });
    let buf = null;
    if (sortie instanceof ArrayBuffer) buf = sortie;
    else if (sortie && sortie.audio && typeof sortie.audio === 'string') {
      const bin = atob(sortie.audio);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    } else if (sortie && typeof sortie.arrayBuffer === 'function') buf = await sortie.arrayBuffer();
    if (!buf || buf.byteLength < 64) return null;   // rien d'exploitable → repli téléphone
    /* cache du bord d'abord (0 écriture KV : le quota de 1 000/jour est saturé), KV seulement s'il manque */
    try { if (cleG && !(await ecrireCacheVoix(cleG, buf))) await env.ACCOUNTS.put(cleG, buf, { expirationTtl: 60 * 60 * 24 }); } catch (_) { /* cache best-effort */ }
    return new Response(buf, { status: 200, headers: entetes });
  } catch (_) { return null; }
}

/* 🎙️ VOIX GOOGLE CHIRP 3 HD — gratuite jusqu'à 1 M de caractères par mois (Kevin 1.10.2026 : « améliore toutes les
   voix en permanence en gratuit, niveau commercial professionnel »). Sonde réelle (run 36926219938) : l'API Cloud
   Text-to-Speech n'était pas activée sur le projet de la clé → 403 ; dès que Kevin l'active, ce moteur prend la tête,
   sans redéploiement. GRATUIT GARANTI : compteur de caractères du JOUR (1 M ÷ 31 ≈ 30 000 → défaut 28 000, réglable
   par GTTS_PLAFOND_JOUR) compté AVANT d'appeler ; compteur illisible = on n'appelle pas. Refus 401/403 → pause d'une
   heure (une seule écriture KV, pas un appel refusé par visiteur). Seulement si la page dit la langue (`l=`) :
   une voix fr-FR qui lirait de l'anglais aurait l'accent faux. Même nom de voix que Gemini (même famille Google)
   → chaque voix de l'app garde SA voix, toutes différentes (règle « voix réellement différentes »). */
/* Toutes les langues de Lingua (2.10) : Chirp 3 HD les couvre — liste officielle
   https://cloud.google.com/text-to-speech/docs/chirp3-hd#language_availability (pt-PT absent → pt-BR,
   ar → ar-XA « générique », zh → cmn-CN mandarin). */
const GTTS_LANGUES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', it: 'it-IT', de: 'de-DE', pt: 'pt-BR', nl: 'nl-NL',
  pl: 'pl-PL', ru: 'ru-RU', uk: 'uk-UA', cs: 'cs-CZ', ar: 'ar-XA', zh: 'cmn-CN', ja: 'ja-JP', ko: 'ko-KR' };
/* CACHE GRATUIT (2.10) : l'audio d'une phrase se garde dans le cache Cloudflare (Cache API, gratuit et
   illimité) au lieu du KV, dont le plafond de 1 000 écritures/jour a été atteint le 27.09 et le 2.10.
   Une phrase neuve passe de 2 écritures KV (compteur + audio) à 1 (le compteur, qui garantit le gratuit). */
function cacheVoix(cle) { return new Request('https://voix.cache.kd-mc.com/' + encodeURIComponent(cle)); }
async function lireCacheVoix(cle) {
  try { if (typeof caches === 'undefined' || !caches.default || !cle) return null; const r = await caches.default.match(cacheVoix(cle)); return r ? await r.arrayBuffer() : null; } catch (_) { return null; }
}
async function ecrireCacheVoix(cle, buf) {
  try { if (typeof caches === 'undefined' || !caches.default || !cle) return false;
    await caches.default.put(cacheVoix(cle), new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=31536000' } })); return true; } catch (_) { return false; }
}
function gttsLangue(l) { const k = String(l || '').toLowerCase().slice(0, 2); return GTTS_LANGUES[k] || ''; }
async function voixGoogle(env, texte, voix, langue, cleCache, cors) {
  try {
    const cle = env && (env.GOOGLE_TTS_KEY || env.GEMINI_API_KEY);
    if (!cle || !env.ACCOUNTS || !langue) return null;
    if (await env.ACCOUNTS.get('gtts:pause')) return null;
    const t = String(texte || '').slice(0, 1000);
    const kj = 'gtts:' + new Date().toISOString().slice(0, 10);
    const deja = parseInt((await env.ACCOUNTS.get(kj)) || '0', 10) || 0;
    const plafond = parseInt(env.GTTS_PLAFOND_JOUR, 10) || 28000;
    if (deja + t.length > plafond) return null;
    await env.ACCOUNTS.put(kj, String(deja + t.length), { expirationTtl: 60 * 60 * 48 });   // compté AVANT (si l'écriture échoue → catch → null)
    const nom = langue + '-Chirp3-HD-' + (GEMINI_VOIX[voix] || 'Kore');
    const rr = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + cle, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text: t }, voice: { languageCode: langue, name: nom }, audioConfig: { audioEncoding: 'MP3' } }),
    });
    if (rr.status === 401 || rr.status === 403) { try { await env.ACCOUNTS.put('gtts:pause', String(rr.status), { expirationTtl: 3600 }); } catch (_) { /* best-effort */ } return null; }
    if (!rr.ok) return null;
    const j = await rr.json().catch(() => null);
    if (!j || !j.audioContent) return null;
    const bin = atob(j.audioContent);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (u8.byteLength < 512) return null;
    /* Cache Cloudflare d'abord (0 écriture KV) ; le KV seulement s'il n'existe pas (tests, autre runtime). */
    try { if (cleCache && !(await ecrireCacheVoix(cleCache, u8.buffer))) await env.ACCOUNTS.put(cleCache, u8.buffer, { expirationTtl: 60 * 60 * 24 * 400 }); } catch (_) { /* cache best-effort */ }
    return new Response(u8.buffer, { status: 200, headers: Object.assign({ 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=31536000', 'x-voix': 'google-chirp3hd' }, cors || {}) });
  } catch (_) { return null; }
}

/* ═══ PERSONNE N'ENTRE SANS ÊTRE FICHÉ — au ROUTEUR, pas dans chaque app ══
 *
 * Kevin, 22.09.2026 : « vérifie les connexions au domaine, les logins etc.
 * Sois sûr que personne ne puisse entrer sans être fiché. »
 *
 * MESURÉ CE JOUR-LÀ : sur 28 apps du domaine, **16 ne demandaient JAMAIS** au
 * domaine « qui es-tu ? ». Quelqu'un pouvait donc passer une heure sur Lingua,
 * la Détente, le coffre, World Monitor, OSINT, le robot de piscine… sans
 * apparaître une seule fois dans « Qui se connecte ». La page n'était pas
 * fausse : elle ne voyait qu'un tiers du domaine.
 *
 * POURQUOI ICI ET PAS DANS LES 16 PAGES : recopier trois lignes dans seize
 * fichiers, c'est seize versions qui divergent (leçon #142), seize CSP à
 * penser, et la 33ᵉ adresse créée demain qui repart invisible. Le routeur, lui,
 * sert TOUTES les pages : une fiche posée ici couvre le domaine entier,
 * aujourd'hui et plus tard, sans qu'aucune app n'ait une ligne à changer.
 *
 * DEUX NIVEAUX, parce qu'ils ne disent pas la même chose :
 *   • personne RECONNUE (session du domaine) → sa fiche est enrichie, comme si
 *     l'app avait demandé elle-même. C'est le trou qu'on bouche.
 *   • visiteur ANONYME → on ne peut pas le nommer (et on ne cherche pas à le
 *     nommer : vie privée). On COMPTE sa visite, par app et par jour, pour que
 *     Kevin voie enfin l'activité qui n'apparaissait nulle part.
 *
 * NE RALENTIT RIEN : uniquement sur une vraie page (pas les images ni les
 * scripts), et le travail part en arrière-plan (`waitUntil`) — la page est
 * servie sans l'attendre. `enrich` a déjà son propre frein (une 2ᵉ visite en
 * moins de 2 minutes ne réécrit rien).
 * NE CASSE RIEN : tout est dans un try/catch. Une panne du stockage fait perdre
 * une ligne de journal, jamais une page. */
/* ===== PORTES PAR DOSSIER ================================================================
   « admin » : ton code admin / Face ID (même preuve que /__admin) — PoolPilot, Autorisations.
   « fiche » : une personne CONNUE du domaine (fiche remplie : prénom + nom + code + conditions,
     ou Face ID), non révoquée, et ouverte sur cette app (périmètre). Kevin 27.09 : sites
     d'information = fiche AVANT d'entrer ; boutiques et pages de vente = fiche à la COMMANDE
     (elles restent donc hors de cette liste).
   Le dossier est comparé DÉCODÉ, en minuscules, barres doublées fusionnées : « pool%72obot »,
   « POOLROBOT » ou « //tools » ne passent pas à côté (l'hébergeur les servirait quand même). */
const PORTES = [
  { dossier: '/CMCteams/tools/poolrobot', niveau: 'admin', verrou: () => beatbotLock() },
  { dossier: '/CMCteams/tools/approvals', niveau: 'admin', verrou: () => approvalsLock() },
  { dossier: '/CMCteams/tools/cuisine', niveau: 'fiche', app: 'cuisine.kd-mc.com', nom: 'A Cüjina de Mùnegu' },
  { dossier: '/CMCteams/kdmc-home/worldmonitor', niveau: 'fiche', app: 'worldmonitor.kd-mc.com', nom: 'World Monitor' },
  { dossier: '/CMCteams/kdmc-home/osint', niveau: 'fiche', app: 'osint.kd-mc.com', nom: 'OSINT' },
  { dossier: '/CMCteams/kdmc-home/ia', niveau: 'fiche', app: 'ia.kd-mc.com', nom: 'Outils IA' },
  { dossier: '/CMCteams/kdmc-home/outils', niveau: 'fiche', app: 'outils.kd-mc.com', nom: 'Mes outils gratuits' },
  { dossier: '/CMCteams/tools/tor', niveau: 'fiche', app: 'tor.kd-mc.com', nom: 'Tor en clair' },
  { dossier: '/CMCteams/dossiers', niveau: 'fiche', app: 'dossiers.kd-mc.com', nom: 'Dossiers publics' },
];
function cheminNormal(chemin) {
  let c = String(chemin || '');
  for (let i = 0; i < 3; i++) { try { const d = decodeURIComponent(c); if (d === c) break; c = d; } catch { break; } }
  return c.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
}
function porteDe(cheminCMC) {
  const c = cheminNormal(cheminCMC);
  for (const g of PORTES) {
    const d = g.dossier.toLowerCase();
    if (c === d || c.startsWith(d + '/')) return g;
  }
  return null;
}
/* Fichiers qu'un iPhone demande SANS cookie pour installer l'app (nom, icône, mise à jour) :
   aucun contenu, ils restent ouverts — sinon l'app installée n'aurait ni nom ni icône. */
function libreSansFiche(cheminCMC) {
  return /\/(manifest\.json|[^/]*\.webmanifest|sw\.js|robots\.txt|(apple-touch-icon|favicon|icon)[^/]*\.(png|svg|ico))$/.test(cheminNormal(cheminCMC));
}
async function porteFermee(request, url, env, cheminCMC) {
  const g = porteDe(cheminCMC);
  if (!g) return null;
  if (g.niveau === 'admin') {
    /* Fail-open si le code admin n'est pas déployé (anti-verrouillage au déploiement,
       leçons #99/#100) — comme les deux verrous d'avant, qui ne regardaient que l'adresse. */
    if (!(env && env.KDMC_ADMIN_PIN_SHA256)) return null;
    if (await adminSession(request, env)) return null;
    return g.verrou();
  }
  /* niveau « fiche » */
  const secret = env && env.KDMC_SSO_SECRET;
  if (!secret) return null;                                    /* domaine sans SSO (test) : ouvert */
  if (libreSansFiche(cheminCMC)) return null;
  const s = await ssoVerify(secret, ssoToken(request));
  if (s && s.uid) {
    const acc = await accGet(env, s.uid);
    if (!revoked(acc, s)) {
      const estAdmin = ADMIN_UIDS.indexOf(s.uid) >= 0 && !!s.verified;
      const per = perimetre(acc, appDe(g.app));
      if (per.ok || estAdmin) return null;                    /* connu et ouvert ici : entre */
      return ficheRefusee(g, per.raison);                     /* connu mais pas ouvert ici : pas de boucle */
    }
  }
  /* Inconnu (ou session révoquée) : fiche obligatoire — la porte se montre ICI, sans quitter l'app
     (voir portePage) ; un navigateur ordinaire part remplir sa fiche au portail, puis revient. */
  if (estUnePage(request)) return portePage(g, url);
  return new Response('Connexion au domaine requise.', { status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-kdmc-porte': 'fiche' } });
}
/* ===== DONNÉES RH NOMINATIVES (audit complet du 30.09.2026, P0-3 / R3) ==========================
   Mesuré : `tools/departs/boards-gen.js` (291 noms + plannings), `planning-seed.js`, `seances-seed.js`
   (154 personnes) étaient servis à QUICONQUE connaissait l'adresse — les apps les chargent par
   <script> avant toute connexion. Ici : sans session du domaine (cookie, Bearer, x-kdmc-sso, ?t=),
   401 + `x-kdmc-porte: fiche` ; les apps (CMCteams v9.931, light v1.62) se font reconnaître à la
   connexion puis se rechargent UNE fois. Avec session non révoquée et non bloquée sur CMCteams :
   on sert la copie déposée dans le KV par la publication (clé `fichier:<chemin>`), et si elle n'y
   est pas encore, on laisse l'hébergeur répondre (le fichier y reste jusqu'à l'étape B du chantier).
   Pas de « fail-open » sur le secret : comme les portes « fiche », un domaine sans KDMC_SSO_SECRET
   (tests) reste ouvert — en production le secret est injecté à chaque déploiement.
   Les fichiers d'installation (manifest, sw, icônes) ne sont pas dans la liste : rien de nominatif. */
async function donneesRhFermees(request, env, cheminCMC) {
  const c = cheminNormal(cheminCMC);
  if (!DONNEES_RH_NORMALISEES.has(c)) return null;
  const secret = env && env.KDMC_SSO_SECRET;
  if (!secret) return null;
  const refus = () => new Response('Connexion au domaine requise.', { status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-kdmc-porte': 'fiche', 'x-kdmc-donnees': 'rh' } });
  const s = await ssoVerify(secret, ssoToken(request));
  if (!s || !s.uid) return refus();
  const acc = await accGet(env, s.uid);
  if (revoked(acc, s)) return refus();
  const estAdmin = ADMIN_UIDS.indexOf(s.uid) >= 0 && !!s.verified;
  if (!estAdmin && !perimetre(acc, 'cmcteams').ok) return refus();  /* bloqué sur CMCteams par l'admin : pas de planning */
  if (env.ACCOUNTS && typeof env.ACCOUNTS.get === 'function') {
    let corps = null;
    try { corps = await env.ACCOUNTS.get(cleKV(c), { type: 'stream', cacheTtl: 300 }); } catch { corps = null; }
    if (corps) {
      return new Response(request.method === 'HEAD' ? null : corps, { status: 200,
        headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'private, no-cache',
          'x-content-type-options': 'nosniff', 'x-kdmc-donnees': 'rh-kv' } });
    }
  }
  return null;                                                 /* reconnu, KV vide : l'hébergeur répond */
}
/* PORTE « FICHE » SANS QUITTER L'APP (Kevin 27.09 : « Quand je clique sur l'app de l'écran
   d'accueil j'atterris sur CMCteams ! »).
   Mesuré : une app posée sur l'écran d'accueil de l'iPhone a ses cookies À PART — la session prise
   dans Safari n'y est pas. Depuis la porte par dossier du matin, l'app du livre de cuisine était
   renvoyée en 302 sur le portail kd-mc.com : l'app de l'écran d'accueil affichait donc le portail
   KDMC (première tuile : CMCteams) à la place du livre. Ici, la porte est servie SUR LA MÊME ADRESSE
   (l'app ne bouge pas) et son script, dans l'ordre : (1) réutilise le laissez-passer que l'app
   garde en localStorage (#kdmc_sso= reçu du portail) pour reposer le cookie (/__sso/cookie),
   (2) sinon propose Face ID SUR PLACE (accepté depuis les adresses du routeur depuis le 26.09),
   (3) sinon renvoie remplir sa fiche au portail — un navigateur ordinaire sans laissez-passer y va
   tout seul, comme avant. Le CONTENU n'est jamais servi sans session valide : fail-closed inchangé
   (robots et scripts : 401 comme avant). Garde : portes.test.mjs (rejoue l'app de l'écran d'accueil). */
function portePage(g, url) {
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const portail = 'https://kd-mc.com/?return=' + encodeURIComponent(url.href);
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="robots" content="noindex"><meta name="theme-color" content="#0b1409"><title>' + esc(g.nom) + ' — connexion</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1409;color:#f3f0e6;font:15px/1.5 -apple-system,sans-serif;padding:24px;text-align:center}'
    + '.c{max-width:340px;width:100%}h1{font-size:19px;color:#f6d97a;margin:8px 0 6px}p{margin:0 0 14px;color:#cfd8cc;min-height:22px}'
    + 'button,a.b{display:block;width:100%;box-sizing:border-box;margin-top:12px;min-height:50px;line-height:50px;padding:0 20px;border:none;border-radius:13px;background:#e8b830;color:#11160c;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer}'
    + 'button:disabled{opacity:.6}a.b.s{background:transparent;color:#f6d97a;border:1px solid rgba(232,184,48,.45);line-height:48px}</style></head>'
    + '<body data-return="' + esc(url.href) + '" data-portail="' + esc(portail) + '"><div class="c"><div style="font-size:44px">🔒</div><h1>' + esc(g.nom) + '</h1>'
    + '<p id="msg">Un instant…</p>'
    + '<div id="acts" hidden><button id="pk" type="button">🔓 Face ID — j&#39;ai déjà un compte</button>'
    + '<a class="b s" id="fiche" href="' + esc(portail) + '">Remplir ma fiche sur kd-mc.com</a></div>'
    + '<noscript><a class="b" href="' + esc(portail) + '">Remplir ma fiche sur kd-mc.com</a></noscript></div>'
    + '<script src="/__sso/porte.js?v=2"></script></body></html>';
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'x-kdmc-porte': 'fiche', 'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
/* Le script de la porte, servi par le routeur lui-même (/__sso/porte.js) : aucune dépendance à
   l'hébergeur, testable tel quel dans Node (portes.test.mjs le fait tourner avec un faux iPhone). */
const PORTE_JS = `(function(){
'use strict';
var LS='kdmc_sso_token';
var body=document.body; var ret=body.getAttribute('data-return')||location.href;
var portail=body.getAttribute('data-portail')||('https://kd-mc.com/?return='+encodeURIComponent(ret));
var msg=document.getElementById('msg'), acts=document.getElementById('acts'), pk=document.getElementById('pk');
function say(t){ if(msg)msg.textContent=t; }
function tok(){ try{ return localStorage.getItem(LS)||''; }catch(e){ return ''; } }
function setTok(t){ try{ if(t)localStorage.setItem(LS,t); else localStorage.removeItem(LS); }catch(e){} }
function standalone(){ try{ return navigator.standalone===true||!!(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches); }catch(e){ return false; } }
function pkOk(){ return !!(window.PublicKeyCredential&&navigator.credentials&&navigator.credentials.get); }
function b64uToBuf(s){ s=String(s||'').replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; var bin=atob(s),a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i); return a.buffer; }
function bufToB64u(b){ var a=new Uint8Array(b),s=''; for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]); return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); }
function entrer(){ location.replace(ret); }
/* 1. laissez-passer arrivé dans l'adresse (#kdmc_sso=…, posé par le portail) : on le garde */
try{ var m=(location.hash||'').match(/[#&]kdmc_sso=([^&]+)/); if(m){ setTok(decodeURIComponent(m[1])); try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){} } }catch(e){}
/* 2. laissez-passer gardé → le domaine repose le cookie sur CETTE app, puis on entre */
function cookieDepuisPass(){ var t=tok(); if(!t) return Promise.resolve({ok:false,reason:'aucun'});
  return fetch('/__sso/cookie',{method:'POST',credentials:'include',headers:{'authorization':'Bearer '+t,'content-type':'application/json'},body:'{}'})
    .then(function(r){ return r.json(); }).then(function(j){ j=j||{ok:false}; if(!j.ok&&(j.reason==='pass_invalide'||j.reason==='session_revoquee'))setTok(''); return j; })
    .catch(function(){ return {ok:false,reason:'reseau'}; }); }
/* 3. Face ID sur place : le passkey du trousseau se présente, le domaine vérifie la signature */
function faceId(){ if(!pkOk()) return Promise.resolve({ok:false,reason:'non supporté'});
  return fetch('/__sso/webauthn/auth/options',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{"uid":""}'})
    .then(function(r){ return r.json(); }).then(function(o){ if(!o||!o.ok) return {ok:false,reason:(o&&o.reason)||'options'};
      return navigator.credentials.get({publicKey:{challenge:b64uToBuf(o.challenge),rpId:o.rpId,userVerification:'required',timeout:60000}}).then(function(cred){
        var a=cred.response; var uid=''; try{ uid=new TextDecoder().decode(a.userHandle); }catch(e){}
        if(!uid) return {ok:false,reason:'passkey sans compte'};
        return fetch('/__sso/webauthn/auth/verify',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},
          body:JSON.stringify({uid:uid,credId:cred.id,clientDataJSON:bufToB64u(a.clientDataJSON),authenticatorData:bufToB64u(a.authenticatorData),signature:bufToB64u(a.signature)})})
          .then(function(r){ return r.json(); }).then(function(j){ j=j||{ok:false}; if(j.ok&&j.token)setTok(j.token); return j; }); }); })
    .catch(function(e){ return {ok:false,reason:String((e&&e.message)||e).slice(0,120)}; }); }
if(pk) pk.addEventListener('click',function(){ pk.disabled=true; say('Face ID…');
  faceId().then(function(j){ if(j.ok){ say('Bonjour '+(j.name||'')+' — ouverture…'); entrer(); }
    else { pk.disabled=false; say('Face ID refusé ('+(j.reason||'annulé')+'). Réessaie, ou remplis ta fiche.'); } }); });
cookieDepuisPass().then(function(j){
  if(j.ok){ say('Bonjour '+(j.name||'')+' — ouverture…'); entrer(); return; }
  if(j.hors_perimetre){ say(j.message||'Ton compte n\\'est pas ouvert sur cette application.'); if(acts)acts.hidden=false; if(pk)pk.hidden=true; return; }
  /* On reste ICI, TOUJOURS — plus aucun départ automatique vers le portail (Kevin 27.09 soir :
     « L'icône emmène encore sur CMCteams »). Le portail kd-mc.com affiche CMCteams : y partir
     tout seul, c'est exactement ce que Kevin voit. Et « suis-je une app de l'écran d'accueil ? »
     n'est pas fiable (icône ouverte dans Safari, réglage « Ouvrir comme app web » coupé) : ce
     test décidait du renvoi, il ne sert plus qu'au message. Le portail reste UN BOUTON. */
  say(standalone()?'Réservé aux personnes connues du domaine.':'Réservé aux personnes connues du domaine — touche Face ID pour entrer.');
  if(acts)acts.hidden=false;
  if(pk&&!pkOk())pk.hidden=true;
});
})();`;
function ficheRefusee(g, raison) {
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const msg = raison === 'bloque_ici' ? 'Ton accès à cette application a été fermé par l\'administrateur.'
    : 'Ton compte n\'est pas encore ouvert sur cette application. Demande à l\'administrateur de l\'ouvrir.';
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>' + esc(g.nom) + ' — accès</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1409;color:#f3f0e6;font:15px/1.5 -apple-system,sans-serif;padding:24px;text-align:center}'
    + '.c{max-width:340px}h1{font-size:19px;color:#f6d97a}a{display:inline-block;margin-top:14px;min-height:48px;line-height:48px;padding:0 20px;border-radius:13px;background:#e8b830;color:#11160c;font-weight:700;text-decoration:none}</style></head>'
    + '<body><div class="c"><div style="font-size:44px">🔒</div><h1>' + esc(g.nom) + '</h1><p>' + esc(msg) + '</p><a href="https://kd-mc.com/">Retour à mon espace</a></div></body></html>';
  return new Response(html, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-kdmc-porte': 'perimetre' } });
}
/* ===== DEMANDE DE DÉMO (Rotaplan) ======================================================
   La page Rotaplan n'exécute AUCUN script (CSP script-src 'none', voulu) : ses champs sont
   obligatoires par l'attribut HTML `required` (le navigateur bloque l'envoi tout seul), et ce
   routeur les REVÉRIFIE — une règle affichée à l'écran seulement ne tient que pour les honnêtes.
   Prénom + nom (2 lettres min.), e-mail, établissement, conditions acceptées. Piège à robots
   (champ caché « site ») + 5 demandes par jour et par connexion. Rangée en KV (liste pour
   l'admin : GET /__demandes), et Kevin est prévenu sur son iPhone (push existant). */
function lettres2(v) { return (String(v || '').match(/\p{L}/gu) || []).length >= 2; }
function pageDemande(titre, texte, ok) {
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Rotaplan — ' + esc(titre) + '</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f4ef;color:#1d1d1b;font:16px/1.55 -apple-system,sans-serif;padding:24px}'
    + '.c{max-width:420px;text-align:center}h1{font-size:22px}a{display:inline-block;margin-top:16px;min-height:48px;line-height:48px;padding:0 22px;border-radius:12px;background:#1d1d1b;color:#fff;text-decoration:none;font-weight:700}</style></head>'
    + '<body><div class="c"><div style="font-size:44px">' + (ok ? '✅' : '✍️') + '</div><h1>' + esc(titre) + '</h1><p>' + esc(texte) + '</p>'
    + '<a href="https://rotaplan.kd-mc.com/' + (ok ? '' : '#demander') + '">' + (ok ? 'Retour à Rotaplan' : 'Compléter ma demande') + '</a></div></body></html>';
  return new Response(html, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
async function handleDemande(request, env, host) {
  if (request.method !== 'POST') return pageDemande('Demande de démonstration', 'Utilise le formulaire de la page Rotaplan.', false);
  if (!ssoOriginOk(request.headers.get('origin'), host)) return pageDemande('Envoi refusé', 'Cette demande ne vient pas du site Rotaplan.', false);
  let f;
  try { f = new URLSearchParams(await request.text()); } catch { return pageDemande('Envoi illisible', 'Réessaie depuis la page Rotaplan.', false); }
  const v = (k, n) => String(f.get(k) || '').trim().replace(/\s+/g, ' ').slice(0, n || 120);
  if (v('site')) return pageDemande('Merci', 'Ta demande est bien partie.', true);       /* robot : on ne dit rien */
  const d = { prenom: v('prenom', 40), nom: v('nom', 40), email: v('email', 120).toLowerCase(), fonction: v('fonction', 80),
    etablissement: v('etablissement', 120), effectif: v('effectif', 20), rotations: String(f.get('rotations') || '').trim().slice(0, 1500) };
  const manque = [];
  if (!lettres2(d.prenom)) manque.push('ton prénom');
  if (!lettres2(d.nom)) manque.push('ton nom');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) manque.push('une adresse e-mail valide');
  if (!lettres2(d.etablissement)) manque.push('ton établissement');
  if (f.get('cgu') !== 'on') manque.push('l\'acceptation des conditions');
  if (manque.length) return pageDemande('Il manque quelque chose', 'Pour qu\'on te réponde : ' + manque.join(', ') + '.', false);
  if (env && env.ACCOUNTS) {
    const jour = new Date().toISOString().slice(0, 10);
    const ip = await sha256Hex((request.headers.get('CF-Connecting-IP') || '') + '|kdmc-dem');
    const cleIp = 'dem:ip:' + ip.slice(0, 24) + ':' + jour;
    const n = parseInt((await env.ACCOUNTS.get(cleIp)) || '0', 10) || 0;
    if (n >= 5) return pageDemande('Déjà reçu', 'On a déjà plusieurs demandes depuis cette connexion aujourd\'hui. On te répond sous 24 h ouvrées.', false);
    await env.ACCOUNTS.put(cleIp, String(n + 1), { expirationTtl: 86400 * 2 });
    const cle = 'demande:' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    await env.ACCOUNTS.put(cle, JSON.stringify({ ...d, produit: 'rotaplan', cgu: { acceptees: true, ts_iso: new Date().toISOString() }, ts: Date.now() }), { expirationTtl: 86400 * 400 });
    const idx = JSON.parse((await env.ACCOUNTS.get('demandes:idx')) || '[]'); idx.push(cle);
    await env.ACCOUNTS.put('demandes:idx', JSON.stringify(idx.slice(-500)));
  }
  await notifyPush(env, '🗓️ Rotaplan — demande de démo', d.prenom + ' ' + d.nom + ' · ' + d.etablissement + ' · ' + d.email, { tag: 'rotaplan-demo', url: 'https://kd-mc.com/__demandes' });
  return pageDemande('Demande bien reçue', 'Merci ' + d.prenom + '. On te répond sous 24 h ouvrées, à ' + d.email + '.', true);
}
function estUnePage(request) {
  if (request.method !== 'GET') return false;
  const dest = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  if (dest) return dest === 'document';           // navigateur moderne : sans ambiguïté
  return /text\/html/i.test(request.headers.get('accept') || '');
}
async function ficheLaVisite(request, url, env, host) {
  try {
    if (!env || !env.ACCOUNTS || !estUnePage(request)) return;
    /* LES SONDES NE S'ÉCRIVENT PAS (27.09 soir). Le stockage KV est plafonné à 1 000 écritures
       PAR JOUR pour tout le compte ; mesuré ce soir : plafond atteint (« KV put() limit exceeded
       for the day »), toutes les apps sans écriture jusqu'à minuit UTC. Or chaque robot de
       vérification vient d'une adresse IP neuve et ouvre ~39 surfaces : 2 écritures par
       surface (marqueur + compteur) — 13 « Audit domaine » + 5 « Vérif LIVE » + 2 « Vérif
       RÉELLE » + 4 « Audit Lingua » dans la même soirée suffisaient à vider le quota. Un
       contrôle qui casse ce qu'il contrôle est pire que pas de contrôle. Une sonde se déclare
       par l'en-tête `x-kdmc-sonde` et n'est ni fichée ni comptée. Quelqu'un qui le poserait à
       la main n'obtient rien de plus que de ne pas figurer dans un compteur de visites. */
    if (request.headers.get('x-kdmc-sonde')) return;
    const s = await ssoVerify(env.KDMC_SSO_SECRET, ssoToken(request));
    if (s && s.uid) {
      const acc = await accGet(env, s.uid);
      if (revoked(acc, s)) return;                 // session révoquée : on ne fiche rien
      await enrich(env, request, s.uid, s.name, s.cgu, acc, { hote: host });
      return;
    }
    /* Anonyme : on compte, on ne nomme pas. Un compteur par app et par jour,
       gardé 100 jours. Aucune donnée personnelle — l'adresse IP ne sert qu'à
       fabriquer une empreinte à sens unique, jamais stockée en clair.

       ⚠️ ON COMPTE DES VISITEURS, PAS DES PAGES. Deux raisons, et la seconde est
       la plus grave : (a) « 300 » veut dire quelque chose si ce sont 300 personnes,
       rien du tout si c'est une personne qui a cliqué 300 fois ; (b) le stockage
       gratuit de Cloudflare autorise ~1 000 ÉCRITURES par jour — compter chaque
       page ferait sauter ce plafond sur une boutique un peu visitée, et ce sont les
       FICHES des vraies personnes qui cesseraient de s'enregistrer. Un mécanisme
       de surveillance qui casse ce qu'il surveille est pire que pas de surveillance.
       On ne compte donc qu'une fois par visiteur, par app et par heure. */
    const ip = request.headers.get('CF-Connecting-IP') || 'inconnu';
    const heure = Math.floor(Date.now() / 3600000);
    const dejaVu = 'anonv:' + (await sha256Hex(ip + '|' + host)).slice(0, 20) + ':' + heure;
    if (await env.ACCOUNTS.get(dejaVu)) return;             // même visiteur, même heure → rien
    await env.ACCOUNTS.put(dejaVu, '1', { expirationTtl: 7200 });
    const jour = new Date().toISOString().slice(0, 10);
    const cle = 'anon:' + jour + ':' + host;
    const n = parseInt((await env.ACCOUNTS.get(cle)) || '0', 10) || 0;
    await env.ACCOUNTS.put(cle, String(n + 1), { expirationTtl: 60 * 60 * 24 * 100 });
  } catch (_) { /* le journal ne doit JAMAIS empêcher une page de s'afficher */ }
}

async function handleLingua(request, url, env) {
  /* CORS : les pages DU DOMAINE seulement (audit complet 30.09 : « * » laissait n'importe quel site lire
     la voix, et la progression dès qu'il tenait une clé). Bee sur l'arbre ou javis lit la voix de Lingua :
     son adresse est renvoyée telle quelle ; une page hors domaine ne reçoit AUCUN en-tête CORS. */
  const origineL = request.headers.get('origin') || '';
  const cors = { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' };
  if (/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i.test(origineL)) cors['access-control-allow-origin'] = origineL;
  const JL = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, cors) });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env || !env.ACCOUNTS) return JL({ ok: false, reason: 'kv_absent' }); // fail-open (200)
  try {
    const okKey = (k) => /^[a-f0-9]{16,64}$/.test(k);
    /* COMPTE DU DOMAINE (Kevin 27.09 : « fais Lingua ») : sans clé `k`, la sauvegarde est celle de la
       SESSION du domaine (cookie ou Bearer) → clé `lingua:u:<uid>`. Plus besoin d'un code Lingua : la
       progression suit le compte KDMC sur tous les appareils. Les anciennes clés (empreinte nom+code)
       restent lisibles pour ne perdre personne. */
    const cleSession = async () => {
      const s = await ssoVerify(env.KDMC_SSO_SECRET, ssoToken(request));
      if (!s || revoked(await accGet(env, s.uid), s)) return '';
      return 'u:' + s.uid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
    };
    if (url.pathname === '/__lingua/load' && request.method === 'GET') {
      let k = url.searchParams.get('k') || '';
      if (!k) { k = await cleSession(); if (!k) return JL({ ok: false, reason: 'session_requise' }, 401); }
      else if (!okKey(k)) return JL({ ok: false, reason: 'bad_key' }, 400);
      const blob = await env.ACCOUNTS.get('lingua:' + k);
      return JL({ ok: true, data: blob ? JSON.parse(blob) : null, cle: k.startsWith('u:') ? 'compte' : 'code' });
    }
    if (url.pathname === '/__lingua/save' && request.method === 'POST') {
      let b; try { b = await request.json(); } catch { return JL({ ok: false, reason: 'bad_json' }, 400); }
      let k = String(b && b.k || '');
      if (!k) { k = await cleSession(); if (!k) return JL({ ok: false, reason: 'session_requise' }, 401); }
      else if (!okKey(k)) return JL({ ok: false, reason: 'bad_key' }, 400);
      const s = JSON.stringify(b && b.data || {});
      if (s.length > 200000) return JL({ ok: false, reason: 'too_big' }, 413);
      await env.ACCOUNTS.put('lingua:' + k, s, { expirationTtl: 60 * 60 * 24 * 400 }); // ~400 j, renouvelé à chaque save
      return JL({ ok: true });
    }
    /* EFFACER MES DONNÉES (2.10, droit à l'effacement) : même preuve que l'enregistrement — la clé (nom +
       code) ou la session du compte KDMC. Qui peut écrire la sauvegarde peut l'effacer, personne d'autre. */
    if (url.pathname === '/__lingua/effacer' && request.method === 'POST') {
      let b; try { b = await request.json(); } catch { return JL({ ok: false, reason: 'bad_json' }, 400); }
      let k = String(b && b.k || '');
      if (!k) { k = await cleSession(); if (!k) return JL({ ok: false, reason: 'session_requise' }, 401); }
      else if (!okKey(k)) return JL({ ok: false, reason: 'bad_key' }, 400);
      try { await env.ACCOUNTS.delete('lingua:' + k); } catch (e) { return JL({ ok: false, reason: 'error', detail: String(e && e.message || e).slice(0, 120) }); }
      return JL({ ok: true });
    }
    // Voix naturelle : synthèse OpenAI TTS, mise en CACHE KV (1 mot = 1 synthèse à vie).
    // FAIL-OPEN : si clé absente ou erreur → le client repasse en voix navigateur.
    if (url.pathname === '/__lingua/tts' && request.method === 'GET') {
      /* VERROU 1 — seulement depuis une page du domaine. VERROU 2 — plafond.
         Refus = 200 + ok:false → l'app retombe sur la voix du téléphone. */
      if (!vientDuDomaine(request)) return JL({ ok: false, reason: 'hors_domaine' });
      /* Kevin 2026-08-08 « elle ne lit pas toute la phrase, s'arrête avant la fin » :
         la limite 200 coupait les textes longs (réponse du Coach, explications) au milieu.
         1000 couvre tout le contenu de l'app ; tts-1 accepte jusqu'à 4096, et l'URL GET
         reste largement sous les limites Workers/CDN. */
      const text = (url.searchParams.get('t') || '').slice(0, 1000);
      /* Bee (gratuit=1) : Google Chirp (palier gratuit) puis la voix gratuite de Cloudflare, puis la voix
         du téléphone — JAMAIS OpenAI ni Replicate (Kevin 02.10 « gratuit tjs »). */
      const gratuitSeul = url.searchParams.get('gratuit') === '1';
      /* Kevin 2026-08-11 « la voix est trop robot » : les 6 voix historiques marchent sur les
         DEUX moteurs ; les 5 voix « HD » (coral, sage, ash, ballad, verse) n'existent QUE sur
         gpt-4o-mini-tts → REPLI obligatoire vers leur cousine tts-1, sinon OpenAI répond 400. */
      const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      const VOIX_HD = { coral: 'nova', sage: 'shimmer', ash: 'onyx', ballad: 'fable', verse: 'echo' };
      let voice = (url.searchParams.get('v') || 'nova').toLowerCase();
      const isAntonin = voice === 'antonin'; // 🎙️ vraie voix CLONÉE d'Antonin (Kevin a validé à l'oreille)
      if (!isAntonin && VOICES.indexOf(voice) < 0 && !VOIX_HD[voice]) voice = 'nova';
      // Vitesse de GÉNÉRATION (0.25–2) : permet la voix « fillette » — générée lente puis
      // accélérée côté client (pitch monte, tempo net redevient normal). Clampée + cachée à part.
      let speed = parseFloat(url.searchParams.get('s') || '1');
      if (!(speed >= 0.25 && speed <= 2)) speed = 1;
      speed = Math.round(speed * 100) / 100;
      if (!text.trim()) return JL({ ok: false, reason: 'no_text' }, 400);
      /* UNE seule décision « peut-on payer ? » pour TOUTES les voix payantes, OpenAI ET Replicate
         (audit complet 30.09, mesuré : la voix clonée « antonin » passait sous tous les plafonds —
         20 appels Replicate sur 20 au-delà du plafond, jamais comptés). Plafond global du jour,
         barrière par minute sans KV, plafond par appareil, et la dépense doit être COMPTÉE avant. */
      let _peut;
      const peutPayerVoix = async () => (_peut !== undefined ? _peut : (_peut =
        (await sousLePlafondDuJour(env, 'tts', parseInt(env && env.TTS_PLAFOND_JOUR, 10) || 300))
        && (await limiteTous(env && env.LIMITE_VOIX, 'tts'))
        && (await souslePlafond(env, 'tts', request, 150, 3600))
        && (await compteDepense(env, 'tts'))));
      const audioHdr = Object.assign({ 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=31536000' }, cors);
      const hashOf = async (s) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return Array.prototype.map.call(new Uint8Array(b), (x) => ('0' + x.toString(16)).slice(-2)).join(''); };
      /* 🎙️ ANTONIN — voix clonée via Replicate (minimax/speech-02-hd, voice_id du clone).
         Cache KV : 1 phrase = 1 génération à vie. FAIL-OPEN : si clé absente / Replicate KO,
         on retombe sur onyx (voix d'homme proche) SANS jamais cacher le repli sous la clé
         Antonin (sinon une panne passagère collerait la mauvaise voix pour toujours). */
      if (isAntonin) {
        const aSpeed = Math.max(0.5, speed); // MiniMax accepte 0.5–2 (OpenAI descend à 0.25)
        const akey = 'ltts:' + (await hashOf('antonin:' + aSpeed + ':' + text));
        const acached = await env.ACCOUNTS.get(akey, 'arrayBuffer');
        if (acached) return new Response(acached, { status: 200, headers: audioHdr });
        if (env.AX_REPLICATE_KEY && !gratuitSeul && (await peutPayerVoix())) {
          try {
            const rp = await fetch('https://api.replicate.com/v1/models/minimax/speech-02-hd/predictions', {
              method: 'POST',
              headers: { 'authorization': 'Bearer ' + env.AX_REPLICATE_KEY, 'content-type': 'application/json', 'prefer': 'wait' },
              body: JSON.stringify({ input: { text: text, voice_id: env.ANTONIN_VOICE_ID || 'R8_QFPX9IXV', speed: aSpeed } }),
            });
            const j = await rp.json().catch(() => null);
            const out = j && (typeof j.output === 'string' ? j.output : (Array.isArray(j.output) ? j.output[0] : null));
            if (rp.ok && j && j.status === 'succeeded' && out) {
              const af = await fetch(out);
              if (af.ok) {
                const abuf = await af.arrayBuffer();
                try { await env.ACCOUNTS.put(akey, abuf, { expirationTtl: 60 * 60 * 24 * 400 }); } catch (_) { /* best-effort */ }
                return new Response(abuf, { status: 200, headers: audioHdr });
              }
            }
          } catch (_) { /* fail-open → onyx ci-dessous */ }
        }
        voice = 'onyx'; // repli honnête : voix d'homme OpenAI, cachée sous SA clé onyx (jamais sous Antonin)
      }
      /* 🗣️ MOTEUR DE VOIX — Kevin 2026-08-11 : « la voix est trop robot, dur de comprendre ».
         Cause mesurée : on synthétisait avec « tts-1 », le plus ancien moteur OpenAI. On passe
         à gpt-4o-mini-tts, nettement plus humain, PLUS une consigne de jeu (« instructions »)
         qui n'existe que sur ce moteur : ton chaleureux de prof, articulation nette.
         GARDE-FOU : la vitesse (bouton 🐢 Lent, syllabes) n'est fiable que sur tts-1 → dès que
         la vitesse n'est pas normale, on RESTE sur tts-1. Le 🐢 continue donc de marcher.
         REPLI : si le nouveau moteur refuse (modèle/voix/quota), on refait avec tts-1 → jamais
         de silence. La CLÉ DE CACHE contient le moteur : sans ça, tous les mots déjà entendus
         resteraient servis dans leur ancienne version robotique — Kevin n'entendrait AUCUN
         changement (c'est le piège classique du cache). */
      const HD_MODELE = 'gpt-4o-mini-tts';
      /* 🎭 STYLES DE JEU (Kevin 2026-09-18 « la voix, c'est pas le top, on dirait un robot ») :
         le moteur HD accepte une consigne de jeu. Elle était figée sur « professeur de langue »
         — juste pour Lingua, scolaire et plate dans une PUB. On ouvre un paramètre `i=<style>`,
         mais en LISTE BLANCHE : cet endpoint est PUBLIC, du texte libre laisserait un inconnu
         piloter notre moteur de voix (et notre facture). Défaut inchangé = 0 régression Lingua. */
      const STYLES = {
        prof: "Voix humaine et chaleureuse de professeur de langue : articulation nette, rythme posé et naturel, ton bienveillant, jamais robotique. Prononce le texte dans sa propre langue, avec l'accent d'un locuteur natif.",
        pub: "Voix française naturelle, proche du micro, comme si tu parlais à un ami en face de toi. Ton direct et complice, JAMAIS commercial ni publicitaire. Rythme vif mais pas pressé : tu poses une courte respiration après la première phrase, tu appuies légèrement le mot qui compte, tu finis en descendant, tranquille. Aucune emphase forcée, aucun sourire commercial.",
        calme: "Voix française posée et basse, presque confidentielle. Débit lent, longues respirations, articulation douce. Rassurante, jamais monocorde.",
        energie: "Voix française vive et souriante, énergie franche mais tenue, débit rapide sans jamais manger les fins de mots. Tu donnes envie d'écouter la suite.",
      };
      const style = Object.prototype.hasOwnProperty.call(STYLES, String(url.searchParams.get('i') || '')) ? String(url.searchParams.get('i')) : 'prof';
      const HD_CONSIGNE = STYLES[style];
      const hd = speed === 1;                       // vitesse normale → nouveau moteur
      const modele = hd ? HD_MODELE : 'tts-1';
      const voixPour = (m) => (m === 'tts-1' && VOIX_HD[voice]) ? VOIX_HD[voice] : voice;
      /* Le style entre dans la clé : sans lui, une phrase déjà lue en « prof » resterait servie
         telle quelle en « pub » — on n'entendrait AUCUN changement (piège du cache, vécu le 11.08). */
      const cle = async (m) => 'ltts:' + (await hashOf(m + ':' + voixPour(m) + ':' + speed + ':' + (m === HD_MODELE ? style + ':' : '') + text));
      /* 🆓 MOTEUR GRATUIT DEMANDÉ EXPRESSÉMENT (`?m=gemini`) : la page de
         comparaison s'en sert pour faire écouter les deux voix à Kevin. Son cache
         est SÉPARÉ (le moteur entre dans la clé), donc écouter le gratuit ne
         remplace jamais la voix normale de personne. */
      const moteurDemande = String(url.searchParams.get('m') || '');
      if (moteurDemande === 'gemini') {
        const gkey = 'ltts:' + (await hashOf('gemini:' + voice + ':' + style + ':' + text));
        const gc = await env.ACCOUNTS.get(gkey, 'arrayBuffer');
        if (gc) return new Response(gc, { status: 200, headers: { 'content-type': 'audio/wav', 'cache-control': 'public, max-age=31536000, immutable', 'x-voix': 'gemini-gratuite' } });
        /* Gratuit ne veut pas dire sans limite : le palier gratuit de Google a
           lui aussi un quota. Un plafond large (assez pour comparer à l'oreille
           autant qu'on veut) empêche qu'une page emballée l'épuise pour tout le
           monde. Compté APRÈS le cache, comme pour la voix payante. */
        if (!(await souslePlafond(env, 'gemini', request, 60, 3600))) return JL({ ok: false, reason: 'plafond_atteint' });
        const g = await voixGemini(env, text, voice, HD_CONSIGNE, gkey);
        if (g) return g;
        return JL({ ok: false, reason: 'gemini_indisponible' }); // fail-open (200) → repli navigateur
      }
      /* 🆓 GOOGLE CHIRP 3 HD EN TÊTE (gratuit par défaut, Kevin 30.09 + 1.10) : quand la page dit la langue (`l=`) et
         vitesse normale. Cache SÉPARÉ (moteur + langue dans la clé). Refus/plafond → la suite d'avant, inchangée.
         `?m=chirp` / `?m=gratuite` : écoute forcée d'un moteur (page de comparaison, robot de sonde). */
      const vGoogle = VOIX_HD[voice] || voice;
      const langue = gttsLangue(url.searchParams.get('l')) || (moteurDemande === 'chirp' ? 'fr-FR' : '');
      if (moteurDemande === 'gratuite') {
        if (!(await souslePlafond(env, 'gratuite', request, 60, 3600))) return JL({ ok: false, reason: 'plafond_atteint' });
        const g = await voixGratuite(env, text, '', cors, url.searchParams.get('l'));
        return g || JL({ ok: false, reason: 'gratuite_indisponible' });
      }
      if (langue && (speed === 1 || moteurDemande === 'chirp')) {
        const gk = 'ltts:' + (await hashOf('gchirp:' + langue + ':' + vGoogle + ':' + text));
        const gc = (await lireCacheVoix(gk)) || (await env.ACCOUNTS.get(gk, 'arrayBuffer'));
        if (gc) return new Response(gc, { status: 200, headers: Object.assign({}, audioHdr, { 'x-voix': 'google-chirp3hd' }) });
        const g = await voixGoogle(env, text, vGoogle, langue, gk, cors);
        if (g) return g;
        if (moteurDemande === 'chirp') return JL({ ok: false, reason: 'chirp_indisponible' });
      }
      if (gratuitSeul) {
        if (!(await souslePlafond(env, 'gratuite', request, 60, 3600))) return JL({ ok: false, reason: 'plafond_atteint' });
        const g = await voixGratuite(env, text, '', cors, url.searchParams.get('l'));
        return g || JL({ ok: false, reason: 'gratuite_indisponible' });
      }
      const ckey = await cle(modele);
      const cached = await env.ACCOUNTS.get(ckey, 'arrayBuffer');
      if (cached) return new Response(cached, { status: 200, headers: audioHdr });
      /* Le plafond ne compte QUE ce qui coûte : un mot déjà en cache est gratuit,
         il ne doit donc pas être décompté (sinon une leçon normale serait bridée). */
      /* Plafond GLOBAL du jour (audit Bee 27.09) : le plafond par IP ne tient pas face à 200 IP
         (mesuré : 200 voix payées). Au-delà, la voix gratuite prend le relais — jamais de silence. */
      const peutPayer = !!env.OPEN_AI_API_KEY && (await peutPayerVoix());
      if (!peutPayer) {
        const g = await voixGratuite(env, text, ckey, cors, url.searchParams.get('l'));
        if (g) return g;
        return JL({ ok: false, reason: env.OPEN_AI_API_KEY ? 'plafond_atteint' : 'tts_absent' }); // fail-open (200) → repli navigateur
      }
      const synth = async (m) => {
        const corps = { model: m, voice: voixPour(m), input: text, response_format: 'mp3' };
        if (m === HD_MODELE) corps.instructions = HD_CONSIGNE; else corps.speed = speed;
        return fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { 'authorization': 'Bearer ' + env.OPEN_AI_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify(corps),
        });
      };
      /* (la dépense est déjà comptée par peutPayerVoix : on ne paie jamais sans l'avoir comptée) */
      let mUse = modele, rr = await synth(mUse);
      if (!rr.ok && mUse === HD_MODELE) { mUse = 'tts-1'; rr = await synth(mUse); } // repli honnête, jamais de silence
      if (!rr.ok) {
        const g = await voixGratuite(env, text, ckey, cors, url.searchParams.get('l'));
        if (g) return g;
        return JL({ ok: false, reason: 'tts_err', status: rr.status }); // fail-open (200)
      }
      const buf = await rr.arrayBuffer();
      try { await env.ACCOUNTS.put(await cle(mUse), buf, { expirationTtl: 60 * 60 * 24 * 400 }); } catch (_) { /* cache best-effort */ }
      return new Response(buf, { status: 200, headers: audioHdr });
    }
    // Mode « APPEL EN DIRECT » (voix-à-voix temps réel) : on frappe un JETON ÉPHÉMÈRE OpenAI Realtime
    // côté serveur (la vraie clé ne quitte jamais le worker) ; le navigateur ouvre ensuite la WebRTC
    // avec ce jeton court. FAIL-OPEN : si pas de clé / erreur, on renvoie ok:false → repli conversation normale.
    /* 💶 « DIS-MOI QUOI CONSOMME MON OPENAI » — la réponse en chiffres.
       Renvoie, jour par jour, le nombre d'appels que NOTRE domaine a réellement
       fait PAYER chez OpenAI (voix + appel en direct). Un son déjà en cache ne
       compte pas : il est gratuit. ADMIN SEULEMENT : ces chiffres disent
       combien l'app est utilisée, ça ne regarde personne d'autre. */
    if (url.pathname === '/__lingua/depense' && request.method === 'GET') {
      /* Même exigence que partout ailleurs sur le domaine (leçon #99) : être
         admin ne suffit pas, il faut une identité FORTE (Face ID prouvé). Un
         jeton auto-déclaré reste verified:false → refusé ici aussi. */
      /* Porte ADMIN : jamais par l'adresse (?t=), et « déconnecter partout » la ferme (audit complet 30.09). */
      const sess = await ssoVerify(env && env.KDMC_SSO_SECRET, ssoTokenSansAdresse(request));
      if (!sess || !sess.verified || ADMIN_UIDS.indexOf(sess.uid) < 0 || revoked(await accGet(env, sess.uid), sess)) return JL({ ok: false, reason: 'admin_seulement' }, 403);
      const jours = [];
      const d0 = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(d0.getTime() - i * 86400000).toISOString().slice(0, 10);
        const [v, a] = await Promise.all([
          env.ACCOUNTS.get('dep:' + d + ':tts'),
          env.ACCOUNTS.get('dep:' + d + ':appel-direct'),
        ]);
        const voix = parseInt(v || '0', 10) || 0, appels = parseInt(a || '0', 10) || 0;
        if (voix || appels) jours.push({ jour: d, voix, appels });
      }
      const totalVoix = jours.reduce((n, j) => n + j.voix, 0);
      const totalAppels = jours.reduce((n, j) => n + j.appels, 0);
      /* 📜 ET AVANT LE COMPTEUR ? Il n'existe que depuis aujourd'hui, il ne peut pas
         remonter le temps. Mais il reste une trace du passé : CHAQUE phrase payée a
         laissé son son en mémoire (cache de 400 jours). Compter ces entrées donne
         donc, à peu près, le nombre de synthèses payées DEPUIS TOUJOURS — la seule
         réponse chiffrée qu'on puisse donner sur le passé sans lire la facture.
         Honnête sur la limite : on s'arrête à 10 pages, et on le DIT (« au moins »)
         plutôt que de faire tourner le serveur indéfiniment. */
      let sonsEnMemoire = 0, curseur = undefined, complet = true;
      try {
        for (let i = 0; i < 10; i++) {
          const lot = await env.ACCOUNTS.list({ prefix: 'ltts:', limit: 1000, cursor: curseur });
          sonsEnMemoire += (lot.keys || []).length;
          if (lot.list_complete) { curseur = undefined; break; }
          curseur = lot.cursor;
          if (i === 9) complet = false;
        }
      } catch (_) { complet = false; }
      return JL({
        ok: true, jours, totalVoix, totalAppels,
        sonsEnMemoire, sonsComplet: complet,
        note: totalVoix + totalAppels === 0
          ? "Sur 30 jours, le domaine kd-mc.com n'a fait payer AUCUN appel OpenAI. Le prelevement vient donc d'ailleurs."
          : 'Chaque « voix » = une phrase synthetisee pour la premiere fois (les suivantes sont gratuites, servies du cache). Chaque « appel » = une conversation en direct ouverte.',
      });
    }
    if (url.pathname === '/__lingua/rt-session' && request.method === 'POST') {
      /* Le produit OpenAI le plus cher : plafond BEAUCOUP plus serré que la voix.
         6 appels par heure et par appareil suffisent largement à un apprenant. */
      if (!vientDuDomaine(request)) return JL({ ok: false, reason: 'hors_domaine' });
      if (!(await sousLePlafondDuJour(env, 'appel-direct', parseInt(env && env.RT_PLAFOND_JOUR, 10) || 30))) return JL({ ok: false, reason: 'plafond_jour' });
      if (!(await limiteTous(env && env.LIMITE_APPEL, 'rt'))) return JL({ ok: false, reason: 'plafond_atteint' });
      if (!(await souslePlafond(env, 'rt', request, 6, 3600))) return JL({ ok: false, reason: 'plafond_atteint' });
      if (!env.OPEN_AI_API_KEY) return JL({ ok: false, reason: 'no_key' });
      let b = {}; try { b = await request.json(); } catch (_) { /* corps optionnel */ }
      const langName = String((b && b.langName) || 'la langue cible').slice(0, 40);
      const level = String((b && b.level) || 'Débutant').slice(0, 30);
      const model = env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
      const voice = env.OPENAI_REALTIME_VOICE || 'coral';
      const instructions = 'Tu es Bee, une abeille tutrice de ' + langName + ' chaleureuse et vivante, pour un francophone (niveau ' + level + '). '
        + 'Conversation ORALE naturelle, phrases COURTES. Parle surtout en ' + langName + ' ; reviens au français seulement si l\'apprenant bloque. '
        + 'Suis le sujet qu\'il lance (tout thème), réagis comme une vraie amie, puis relance par une petite question. '
        + 'Corrige ses fautes EN DOUCEUR : reformule correctement puis explique en une phrase simple en français. Reste encourageante.';
      await compteDepense(env, 'appel-direct');  // ce jeton ouvre une conversation facturée à la minute
      try {
        // API Realtime GA : jeton éphémère via /v1/realtime/client_secrets (l'ancien /sessions a disparu).
        const rr = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
          method: 'POST', headers: { authorization: 'Bearer ' + env.OPEN_AI_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ session: { type: 'realtime', model, instructions, audio: { output: { voice } } } }),
        });
        const j = await rr.json().catch(() => null);
        const secret = j && (j.value || (j.client_secret && j.client_secret.value)); // GA: {value}; compat ancien {client_secret:{value}}
        if (!rr.ok || !secret) return JL({ ok: false, reason: 'openai_error', detail: (j && j.error && j.error.message) || ('http ' + rr.status) });
        return JL({ ok: true, client_secret: secret, expires_at: (j.expires_at) || (j.client_secret && j.client_secret.expires_at) || 0, model });
      } catch (e) { return JL({ ok: false, reason: 'error', detail: String((e && e.message) || e).slice(0, 120) }); }
    }
    // Coach IA (conversation) : IA gratuite via clé serveur (jamais exposée). FAIL-OPEN.
    if (url.pathname === '/__lingua/ai' && request.method === 'POST') {
      /* La chaîne est gratuite d'abord (Qwen), mais un repli peut atteindre un
         moteur payant : même verrou, plafond large (une conversation, ça parle). */
      if (!vientDuDomaine(request)) return JL({ ok: false, reason: 'hors_domaine' });
      if (!(await souslePlafond(env, 'ai', request, 120, 3600))) return JL({ ok: false, reason: 'plafond_atteint' });
      let b; try { b = await request.json(); } catch { return JL({ ok: false, reason: 'bad_json' }, 400); }
      const langName = String((b && b.langName) || 'la langue cible').slice(0, 40);
      const level = String((b && b.level) || 'Débutant').slice(0, 30);
      const lvi = Math.max(0, Math.min(4, parseInt((b && b.levelIndex), 10) || 0));
      const weak = Array.isArray(b && b.weak) ? b.weak.slice(0, 15).map((x) => String(x).slice(0, 60)) : [];
      const scenario = String((b && b.scenario) || '').slice(0, 120); // jeu de rôle (scène originale choisie côté app)
      const msgs = Array.isArray(b && b.messages) ? b.messages.slice(-12) : [];
      const share = ['surtout en français, avec seulement quelques mots simples de ' + langName,
                     'moitié français, moitié ' + langName + ' (phrases très simples)',
                     'surtout en ' + langName + ', et en français uniquement si besoin',
                     'presque entièrement en ' + langName,
                     'entièrement en ' + langName][lvi];
      const sys = 'Tu es un professeur de ' + langName + ' expert et bienveillant, spécialisé dans l\'enseignement aux francophones, 20 ans d\'expérience. '
        + "Niveau actuel de l'apprenant : " + level + '. Parle ' + share + '. '
        + 'Style : conversation orale NATURELLE, réponses COURTES (1 à 4 phrases), chaleureuses, jamais scolaires ni robotiques. '
        + "Fais parler l'apprenant : termine presque toujours par une petite question adaptée à son niveau. "
        + (!scenario ? ("CONVERSATION LIBRE IMPROVISÉE : c'est l'apprenant qui mène. Suis le SUJET QU'IL LANCE, quel qu'il soit (son week-end, un film, le travail, l'actualité, un souvenir, un rêve, une opinion, la cuisine, le sport, ses projets, la philosophie… absolument tout) et RESTE dessus tant qu'il l'anime — ne le ramène JAMAIS de force à une leçon. Réagis d'abord comme un vrai ami natif : intérêt sincère, une petite réaction ou un avis personnel court, rebondis sur un détail précis qu'il vient de dire, puis relance par une question qui APPROFONDIT (va plus loin : le pourquoi, un exemple, un ressenti, une suite). S'il change de thème, enchaîne naturellement sans résister. Objectif : un vrai échange vivant et spontané, pas un questionnaire ni une interrogation scolaire. ") : '')
        + "CORRECTION EXPERTE ET DOUCE : si l'apprenant fait une faute (grammaire, orthographe, conjugaison, syntaxe, accord, genre, préposition, temps), reformule d'abord correctement de façon naturelle, puis explique l'erreur en UNE phrase simple en français, sans le décourager ; valorise ce qui est juste. "
        + "Enseigne la langue VIVANTE : au bon moment, glisse une expression idiomatique, une tournure familière ou un mot de jargon courant, en précisant le registre (familier / courant / soutenu) et quand l'employer. "
        + "Progression : introduis peu à peu du vocabulaire et des structures un cran au-dessus de son niveau pour le tirer vers le haut, sans le noyer. Objectif : l'amener au BILINGUE, pas à pas. "
        + (weak.length ? ('Points à retravailler en priorité avec lui : ' + weak.join(', ') + '. ') : '')
        + (scenario ? ("JEU DE RÔLE : joue la scène suivante avec l'apprenant et RESTE DANS TON PERSONNAGE du début à la fin : " + scenario + ". C'est TOI qui joues l'autre rôle de la scène (pas le professeur), en " + langName + " selon le dosage indiqué. Ouvre la scène toi-même par une première réplique courte et naturelle. Les corrections restent douces et en une phrase, glissées sans casser la scène. ") : '')
        /* Kevin 2026-08-11 : « le coach n'est pas au point, il donne les réponses, demande de
           remplir un mot dans un texte mais on peut pas écrire dessus ». Trois règles dures :
           une seule question à la fois, JAMAIS la réponse avant l'essai, et le format ___ que
           l'application transforme en vraie case à remplir. */
        + "EXERCICES — RÈGLES ABSOLUES : (1) UNE SEULE question ou phrase à la fois, jamais une liste de 2, 3 ou 4 exercices d'un coup ; "
        + "(2) ne DONNE JAMAIS la réponse dans le message où tu poses la question — tu attends la réponse de l'apprenant, même s'il se trompe ou s'il ne répond pas ; ne mets ni la solution, ni un exemple qui la contient, ni un indice qui la révèle ; "
        + "(3) pour un mot à compléter, écris la phrase avec exactement trois tirets bas ___ à l'endroit du mot manquant (l'application les transforme en case à remplir) ; un seul ___ par phrase, et jamais de ___ dans une phrase d'exemple déjà corrigée ; "
        /* Vu EN VRAI le 2026-08-11 sur le domaine : le coach proposait « J'ai ___ mon sac à dos »
           à quelqu'un qui apprend l'anglais. Un trou dans une phrase FRANÇAISE n'enseigne rien
           de la langue étudiée. La phrase de l'exercice est TOUJOURS dans la langue apprise. */
        + "(3 bis) la phrase de l'exercice est TOUJOURS écrite en " + langName + " — jamais en français : un trou dans une phrase française n'apprend rien de " + langName + ". Seule ta consigne autour peut être en français ; "
        + "(3 ter) va droit au but : quand l'apprenant demande un exercice, donne-le tout de suite, sans enchaîner d'abord plusieurs questions de politesse ; "
        + "(4) quand il a répondu : dis d'abord si c'est juste, donne la forme correcte, explique en UNE phrase, puis propose la phrase SUIVANTE avec un nouveau ___. "
        + "N'utilise ni listes à puces ni titres : reste dans le style d'un vrai échange, avec une orthographe et une ponctuation irréprochables dans les deux langues.";
      const chat = [{ role: 'system', content: sys }].concat(msgs.map((m) => ({ role: (m && m.role === 'user') ? 'user' : 'assistant', content: String((m && m.text) || '').slice(0, 500) })));
      if (!chat.some((m) => m.role === 'user')) chat.push({ role: 'user', content: 'Bonjour !' });
      /* Kevin 2026-09-05 : le coach = TRADUCTION/conversation multilingue → routage commun,
         QWEN (Workers AI, 0 clé, multilingue) en premier, puis Gemini / Groq / Mistral gratuits,
         Anthropic en secours s'il existe. On sait toujours qui a répondu (`by`). */
      const ai = await routeText(env, { messages: chat, domain: 'translation', maxTokens: 300, temperature: 0.75, timeoutMs: 15000 });
      if (ai.ok) return JL({ ok: true, reply: ai.text, by: ai.provider, model: ai.model });
      return JL({ ok: false, reason: 'ai_absent', tried: ai.tried }); // aucune IA/erreur → message hors-ligne côté client (fail-open)
    }
    return JL({ ok: false, reason: 'bad_route' }, 404);
  } catch (e) {
    return JL({ ok: false, reason: 'error', detail: String((e && e.message) || e).slice(0, 120) }); // fail-open (200)
  }
}

/* Garde anti-rejeu WebAuthn : deny-list des challenges DÉJÀ consommés (KV).
   - 1ʳᵉ utilisation d'un challenge → 'fresh' (jamais bloquée : anti-lockout absolu).
   - rejeu du même challenge → 'replay' (refusé).
   - KV absent / erreur / pas de challenge → 'skip' (fail-open, comportement actuel).
   Complète le TTL HMAC 2 min : un (challenge, assertion) capté ne peut être rejoué. */
async function challengeConsume(env, clientDataJSONB64) {
  if (!env || !env.ACCOUNTS) return 'skip';
  try {
    const cd = JSON.parse(new TextDecoder().decode(b64uDec(clientDataJSONB64)));
    const ch = cd && cd.challenge;
    if (!ch) return 'skip';
    const key = 'chx:' + (await sha256Hex(ch));
    if (await env.ACCOUNTS.get(key)) return 'replay';
    await env.ACCOUNTS.put(key, '1', { expirationTtl: 300 });
    return 'fresh';
  } catch { return 'skip'; }
}

/* ---- Rate-limit serveur du code admin (anti brute-force du PIN 6 chiffres) ----
   Compteur d'échecs par IP (hashée) en KV, lockout progressif. Fail-open : si KV
   absent/KO, on n'enferme jamais l'admin légitime (la sécurité repose alors sur le
   hash du PIN seul). TTL KV 24h = auto-nettoyage. */
const RL_STEPS = { 5: 30e3, 6: 120e3, 7: 600e3, 8: 3600e3, 9: 86400e3 };
async function rlGet(env, ipHash) {
  if (!env || !env.ACCOUNTS) return null;
  try { return JSON.parse((await env.ACCOUNTS.get('al:' + ipHash)) || 'null'); } catch { return null; }
}
async function rlBlocked(env, ipHash) {
  const rec = await rlGet(env, ipHash);
  if (rec && rec.until && rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 1000);
  return 0;
}
async function rlFail(env, ipHash) {
  if (!env || !env.ACCOUNTS) return;
  try {
    const rec = (await rlGet(env, ipHash)) || { fails: 0 };
    rec.fails = (rec.fails || 0) + 1;
    rec.until = rec.fails >= 5 ? Date.now() + (RL_STEPS[Math.min(rec.fails, 9)] || 86400e3) : 0;
    await env.ACCOUNTS.put('al:' + ipHash, JSON.stringify(rec), { expirationTtl: 86400 });
  } catch { /* fail-open */ }
}
async function rlReset(env, ipHash) {
  if (!env || !env.ACCOUNTS || !env.ACCOUNTS.delete) return;
  try { await env.ACCOUNTS.delete('al:' + ipHash); } catch { /* fail-open */ }
}

/* ---- Quota d'INSCRIPTIONS par adresse IP (anti-épuisement du registre) -------
 *
 * MESURÉ le 23.09.2026 avec une sonde (50 inscriptions fabriquées d'affilée, sans
 * la moindre authentification) : une inscription NEUVE coûte **5 écritures KV**
 * (`nm:` + `aud:log` + `acc:` + `idx:uids` + le re-tampon de la fusion). Le quota
 * gratuit Cloudflare est de **1000 écritures par jour pour tout le compte** →
 * **200 faux comptes suffisaient à le vider**, et le registre des connexions de
 * TOUT le domaine cessait alors de se mettre à jour.
 *
 * `/__sso/issue` n'avait aucune limite. C'est le seul point d'écriture du domaine
 * ouvert sans authentification (vérifié endpoint par endpoint : webauthn/register
 * exige une session, /__bot/*, /__beatbot/relay et /__mail/ack passent par
 * `adminSession`, et webauthn/auth/verify n'écrit qu'après une signature valide).
 *
 * ── CE QUI EST COMPTÉ, ET CE QUI NE L'EST PAS ────────────────────────────────
 * On compte UNIQUEMENT la création d'une fiche NEUVE. Quelqu'un de déjà inscrit
 * peut se reconnecter autant de fois qu'il veut dans la journée, depuis autant
 * d'apps qu'il veut : il ne croise jamais cette limite. C'est toute la différence
 * avec `rlFail()`, qui compte des ÉCHECS — ici il n'y a pas d'échec, chaque appel
 * réussit, et c'est précisément le problème.
 *
 * ── UN REFUS NE DOIT RIEN ÉCRIRE ─────────────────────────────────────────────
 * Volontairement AUCUN `audLog` ni `notifyPush` sur le chemin refusé : journaliser
 * un refus, c'est une écriture KV de plus par requête refusée — l'attaquant
 * épuiserait le quota AVEC la protection censée l'en empêcher. Le refus coûte donc
 * deux LECTURES et zéro écriture. Seul le franchissement du frein d'urgence
 * (une fois par jour au plus) prévient Kevin.
 *
 * ── FAIL-OPEN ────────────────────────────────────────────────────────────────
 * Sans KV, ou si KV tombe : on laisse passer. Une inscription ne doit jamais être
 * cassée par la limite elle-même (règle « jamais régresser », anti-lock-out).
 */
/* Une famille, un café, un bureau partagent une seule IP publique → large. */
const INSCR_PAR_IP_JOUR = 10;
/* Frein d'urgence tout le domaine. Le registre comptait ~191 personnes au total
   après des mois : 50 inscriptions en UNE journée n'est pas un afflux, c'est une
   attaque. Au pire ça coûte 50 × 7 = 350 écritures, il en reste largement pour
   les gens déjà inscrits — c'est ce plafond qui garantit que le domaine continue
   de fonctionner même pendant l'attaque. */
const INSCR_TOTAL_JOUR = 50;
/* Les deux plafonds sont RÉGLABLES sans toucher au code (variables du worker).
   Raison concrète : le jour où 260 employés s'inscrivent depuis le wifi du casino,
   ils partagent UNE seule adresse IP publique — il faut pouvoir ouvrir en grand
   pour la journée, sans redéployer. Valeur illisible → on garde le défaut. */
function plafond(env, nom, defaut) {
  const v = parseInt((env && env[nom]) || '', 10);
  return Number.isFinite(v) && v > 0 ? v : defaut;
}
function jourUTC(now) { return new Date(now || Date.now()).toISOString().slice(0, 10); }
async function quotaInscription(env, ipHash) {
  if (!env || !env.ACCOUNTS) return { ok: true, raison: 'sans_kv' };
  const maxIp = plafond(env, 'KDMC_INSCR_IP_JOUR', INSCR_PAR_IP_JOUR);
  const maxTot = plafond(env, 'KDMC_INSCR_TOTAL_JOUR', INSCR_TOTAL_JOUR);
  const j = jourUTC();
  const kIp = 'qi:' + j + ':' + String(ipHash || '').slice(0, 32);
  const kTot = 'qi:' + j + ':_total';
  try {
    const nIp = parseInt((await env.ACCOUNTS.get(kIp)) || '0', 10) || 0;
    if (nIp >= maxIp) {
      /* UN SEUL avertissement par jour, tout le domaine (pas un par adresse : une
         attaque distribuée remplirait la boîte de Kevin — règle anti-spam). Sans
         ça, un groupe légitime derrière une seule IP (wifi d'entreprise) serait
         bloqué EN SILENCE et personne ne saurait pourquoi. */
      const kAl = 'qi:' + j + ':_alerte_ip';
      let dejaDit = true;
      try { dejaDit = (await env.ACCOUNTS.get(kAl)) === '1'; } catch { /* fail-open */ }
      if (!dejaDit) {
        await env.ACCOUNTS.put(kAl, '1', { expirationTtl: 172800 });
        await notifyPush(env, 'ℹ️ KDMC — inscriptions freinées depuis une connexion',
          'Une même connexion a créé ' + maxIp + ' comptes aujourd\'hui, les suivants sont refusés. Si c\'est normal (tout un groupe sur le même wifi), dis-le moi et j\'ouvre pour la journée.',
          { tag: 'kdmc-quota-ip', url: 'https://kd-mc.com/admin/' });
      }
      return { ok: false, raison: 'quota_ip' };
    }
    const nTot = parseInt((await env.ACCOUNTS.get(kTot)) || '0', 10) || 0;
    if (nTot >= maxTot) return { ok: false, raison: 'quota_domaine' };
    /* TTL 48 h : la clé du jour disparaît toute seule, rien à nettoyer. */
    await env.ACCOUNTS.put(kIp, String(nIp + 1), { expirationTtl: 172800 });
    await env.ACCOUNTS.put(kTot, String(nTot + 1), { expirationTtl: 172800 });
    /* Une seule alerte, au moment EXACT où le frein se ferme. */
    if (nTot + 1 >= maxTot) {
      await audLog(env, { ev: 'quota_inscriptions_atteint', detail: maxTot + ' inscriptions aujourd\'hui — nouvelles inscriptions suspendues jusqu\'à demain' });
      await notifyPush(env, '🛑 KDMC — trop d\'inscriptions aujourd\'hui',
        maxTot + ' comptes créés en une journée : les nouvelles inscriptions sont suspendues jusqu\'à demain pour protéger le domaine. Les personnes déjà inscrites ne sont pas touchées.',
        { tag: 'kdmc-quota-inscriptions', url: 'https://kd-mc.com/admin/' });
    }
    return { ok: true, reste: maxIp - nIp - 1 };
  } catch { return { ok: true, raison: 'kv_ko' }; }
}

/* ===== COMPTE UNIQUE PAR PERSONNE (Kevin 2026-08-05 : « Je ne veux pas plusieurs
   comptes, qu'ils soient tous reliés à mon compte admin ») =====
   CAUSE RACINE : /__sso/issue accepte l'uid envoyé par CHAQUE app (CMCteams → U11804,
   Apex → kdmc_admin, Lingua → lingua_xxx…) → une fiche par app pour la MÊME personne,
   donc des connexions éparpillées (« 2 » affichées au lieu de ~191).
   RÈGLE ABSOLUE déjà écrite dans CLAUDE.md (« COMPTE ADMIN UNIQUE KEVIN ») : tous les
   alias de Kevin désignent UN SEUL compte. On applique la même idée à la fiche. */
const CANON_UID = 'kdmc_admin';
/* Intervalle de re-passage de la fusion « un compte par personne ». Une fusion
   DÉFINITIVE laisse passer les doublons créés ensuite (constaté en vrai) → on repasse. */
const MERGE_RESCAN_MS = 7 * 24 * 60 * 60 * 1000;
function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
/* Le nom est-il celui de l'admin ? Exige 2 tokens OU un alias explicite — jamais un
   prénom seul auto-déclaré (règle « login = prénom + nom », leçon #99 : un nom
   auto-déclaré n'accorde AUCUN droit ; ici il ne fait que RANGER la fiche au bon
   endroit, il ne donne aucun privilège). */
function isAdminName(name) {
  const n = normName(name);
  if (!n) return false;
  if (n === 'kdmc' || n === 'kdmc admin') return true;
  const t = n.split(' ').filter(Boolean);
  /* Le NOM DE FAMILLE seul ne suffit PAS : « Ronan Desarzens » est quelqu'un d'autre.
     Il faut le nom de famille ET le prénom (ou son initiale) — « Desarzens K » compte. */
  return t.indexOf('desarzens') >= 0 && t.some((x) => x === 'kevin' || x === 'k');
}
/* Identifiant CANONIQUE : toutes les fiches d'une même personne pointent vers un
   seul dossier. Ne change JAMAIS l'uid de session (les apps s'en servent pour leur
   propre logique) — uniquement l'endroit où le dossier est rangé.
   Kevin 2026-08-05 : « Personne ne doit avoir plusieurs comptes. Un compte par
   personne » → la règle vaut pour TOUT LE MONDE, pas seulement l'admin.
   Annuaire `nm:<prénom nom>` → uid canonique : le PREMIER identifiant vu pour un nom
   complet devient le dossier de cette personne ; tous les suivants y sont rattachés.
   EXIGE 2 mots (prénom + nom) — même règle que la connexion : un prénom seul ne
   regroupe rien (sinon tous les « Marie » finiraient dans le même dossier). */
/* `opts.sansCreer` = SIMPLE LECTURE : on cherche le dossier de cette personne sans
   réserver le nom. Indispensable devant le quota d'inscriptions ci-dessous : une
   demande qu'on s'apprête à refuser ne doit RIEN écrire, sinon le refus coûte lui
   aussi une écriture et le quota ne protège plus rien. `enrich` appelle ensuite la
   version normale, donc le nom est bien réservé dès qu'une fiche est vraiment créée. */
async function canonFor(env, uid, name, opts) {
  if (uid === CANON_UID) return uid;
  if (isAdminName(name)) return CANON_UID;
  if (!env || !env.ACCOUNTS) return uid;
  const n = normName(name);
  if (n.split(' ').filter(Boolean).length < 2) return uid;
  try {
    const cur = await env.ACCOUNTS.get('nm:' + n);
    if (cur) return cur;
    if (opts && opts.sansCreer) return uid;
    await env.ACCOUNTS.put('nm:' + n, uid);
  } catch { /* fail-open : au pire on garde l'uid d'origine */ }
  return uid;
}
/* Registre des fiches clients (Cloudflare KV ACCOUNTS). Fail-open si absent. */
async function accGet(env, uid) {
  if (!env || !env.ACCOUNTS) return null;
  try { return JSON.parse((await env.ACCOUNTS.get('acc:' + uid)) || 'null'); } catch { return null; }
}
async function accPut(env, acc, knownExisting) {
  if (!env || !env.ACCOUNTS || !acc || !acc.uid) return;
  try {
    await env.ACCOUNTS.put('acc:' + acc.uid, JSON.stringify(acc));
    if (knownExisting) return; /* fiche déjà indexée → pas de relecture idx (chemin chaud) */
    const idx = JSON.parse((await env.ACCOUNTS.get('idx:uids')) || '[]');
    if (idx.indexOf(acc.uid) < 0) { idx.push(acc.uid); await env.ACCOUNTS.put('idx:uids', JSON.stringify(idx.slice(-5000))); }
  } catch { /* fail-open */ }
}
/* Alerte push « nouvel appareil » vers l'iPhone de Kevin, via le worker de push
   existant (POST /send-all, Bearer). OPT-IN par config : sans KDMC_PUSH_URL +
   KDMC_PUSH_TOKEN, on ne fait RIEN (le journal admin reste la trace = repli).
   Fail-open total : timeout 2 s, jamais d'exception propagée, ne bloque jamais
   la connexion. Corps volontairement générique (pas de donnée sensible). */
async function notifyPush(env, title, body, opts) {
  const url = env && env.KDMC_PUSH_URL, tok = env && env.KDMC_PUSH_TOKEN;
  if (!url || !tok) return; /* non configuré → repli = journal admin */
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2000);
    await fetch(url.replace(/\/$/, '') + '/send-all', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok },
      body: JSON.stringify({ payload: { title, body, tag: (opts && opts.tag) || 'kdmc-new-device', url: (opts && opts.url) || 'https://kd-mc.com/admin/' } }),
    }).catch(() => {});
    clearTimeout(to);
  } catch { /* fail-open : jamais d'échec de connexion à cause d'une notif */ }
}
/* Push « nouveau message CMCteams light » → iPhone de Kevin même app fermée, via le
   worker de push existant (token gardé SERVEUR, jamais exposé à la page). Appelé par la
   page CMCteams light quand un employé écrit. Anti-spam : throttle KV 12 s. Fail-open.
   Corps générique + tronqué (pas de donnée sensible au-delà du prénom + court aperçu). */
async function handleNotifyKevin(request, env) {
  const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json' } });
  try {
    const host = (request.headers.get('host') || '').toLowerCase().replace(/:.*$/, '');
    if (!ROUTES[host]) return J({ ok: false, reason: 'bad_host' }, 403);
    let b = {}; try { b = await request.json(); } catch { /* corps vide */ }
    const name = String((b && b.name) || '').slice(0, 60).replace(/[\r\n]+/g, ' ').trim() || 'Employé';
    const text = String((b && b.text) || '').slice(0, 140).replace(/[\r\n]+/g, ' ').trim();
    if (!text) return J({ ok: true, skipped: 'empty' });
    /* NOUVELLE CONNEXION (Kevin 27.09 : « Pas besoin que je valide si tous les champs des
       renseignements sont fournis, juste une alerte pour moi d'une nouvelle connexion »).
       Un nouvel inscrit CMCteams (validé tout seul) ou une première connexion à la light →
       notification dédiée. Son propre anti-doublon : UNE alerte par personne et par app sur 12 h
       (clé KV), jamais avalée par le frein des messages (12 s). */
    if (b && b.kind === 'nouveau') {
      const app = appDe(host) || host;
      if (env && env.ACCOUNTS) {
        try {
          const cle = 'push:nouveau:' + app + ':' + name.toLowerCase().replace(/[^a-z0-9àâäçéèêëîïôöùûüÿ]+/g, '_').slice(0, 60);
          if (await env.ACCOUNTS.get(cle)) return J({ ok: true, deja: true });
          await env.ACCOUNTS.put(cle, '1', { expirationTtl: 12 * 3600 });
        } catch { /* fail-open */ }
      }
      await notifyPush(env, '🆕 Nouvelle connexion — ' + name, text, { tag: 'kdmc-nouveau', url: 'https://admin.kd-mc.com/' });
      await audLog(env, { type: 'nouvelle_connexion', app, name, text });
      return J({ ok: true, alerte: true });
    }
    if (env && env.ACCOUNTS) {
      try {
        const last = parseInt((await env.ACCOUNTS.get('push:kevin_last')) || '0', 10) || 0;
        if (Date.now() - last < 12000) return J({ ok: true, throttled: true });
        await env.ACCOUNTS.put('push:kevin_last', String(Date.now()));
      } catch { /* fail-open */ }
    }
    await notifyPush(env, '💬 ' + name, text, { tag: 'cmc-msg', url: 'https://cmcteams.kd-mc.com/' });
    return J({ ok: true });
  } catch { return J({ ok: false }, 200); }
}
/* Journal d'audit ADMIN (KV, FIFO 200) : trace les événements sensibles —
   connexions admin (ok/échec), déconnexions forcées, nouveaux appareils, mints
   Firebase. L'action la plus sensible du domaine doit laisser une trace. Fail-open. */
async function audLog(env, entry) {
  if (!env || !env.ACCOUNTS) return;
  try {
    const log = JSON.parse((await env.ACCOUNTS.get('aud:log')) || '[]');
    log.unshift(Object.assign({ ts: Date.now() }, entry));
    await env.ACCOUNTS.put('aud:log', JSON.stringify(log.slice(0, 200)));
  } catch { /* fail-open */ }
}
/* Lecture FINE de l'appareil depuis l'User-Agent : modèle, OS + version, navigateur
   + version. Côté SERVEUR → ni CSP ni bloqueur ne peut l'empêcher, et ça marche même
   si l'app ne coopère pas. Tolérant : tout champ inconnu reste vide (jamais d'erreur). */
function uaParse(ua) {
  const s = String(ua || '');
  let model = 'Autre';
  if (/iPhone/i.test(s)) model = 'iPhone';
  else if (/iPad/i.test(s)) model = 'iPad';
  else if (/Android/i.test(s)) { const m = s.match(/;\s*([^;()]+?)\s*(?:Build\/|\))/); model = (m && m[1] && m[1].trim()) || 'Android'; }
  else if (/Macintosh|Mac OS X/i.test(s)) model = 'Mac';
  else if (/Windows/i.test(s)) model = 'PC Windows';
  else if (/Linux/i.test(s)) model = 'Linux';
  let os = '', osv = '', m;
  if ((m = s.match(/(?:iPhone |CPU )?OS (\d+[._]\d+)/))) { os = 'iOS'; osv = m[1].replace(/_/g, '.'); }
  else if ((m = s.match(/Android (\d+(?:\.\d+)?)/))) { os = 'Android'; osv = m[1]; }
  else if ((m = s.match(/Mac OS X (\d+[._]\d+)/))) { os = 'macOS'; osv = m[1].replace(/_/g, '.'); }
  else if (/Windows NT 10/.test(s)) { os = 'Windows'; osv = '10/11'; }
  else if (/Windows/i.test(s)) { os = 'Windows'; }
  else if (/Linux/i.test(s)) { os = 'Linux'; }
  let br = '', brv = '';
  if ((m = s.match(/Edg\/(\d+)/))) { br = 'Edge'; brv = m[1]; }
  else if ((m = s.match(/OPR\/(\d+)/))) { br = 'Opera'; brv = m[1]; }
  else if (/Chrome\//.test(s) && !/Edg\//.test(s)) { m = s.match(/Chrome\/(\d+)/); br = 'Chrome'; brv = m ? m[1] : ''; }
  else if ((m = s.match(/Firefox\/(\d+)/))) { br = 'Firefox'; brv = m[1]; }
  else if ((m = s.match(/Version\/(\d+)[^)]*Safari/))) { br = 'Safari'; brv = m[1]; }
  else if (/Safari/i.test(s)) { br = 'Safari'; }
  return { model, os, osv, br, brv };
}
/* Opérateur/hébergeur → distingue 4G, box maison, WiFi public… et signale un
   VPN/serveur (quelqu'un qui masque sa provenance). Signal de sécurité utile. */
function ispInfo(cf) {
  const isp = String((cf && cf.asOrganization) || '');
  const vpn = /vpn|proxy|host|server|cloud|data ?cent|ovh|hetzner|digitalocean|linode|vultr|amazon|aws|google|azure|m247|nordvpn|surfshark|expressvpn|mullvad|cloudflare warp/i.test(isp);
  return { isp, vpn };
}
/* Enrichit (ou crée) la fiche à chaque connexion : MAX de renseignements. */
/* Identités de ROBOT (sonde de déploiement) : leur session sert à prouver que la chaîne SSO marche,
   mais un robot n'est pas une personne. Kevin 2.10 : « Chacun 1 seul compte » — et aucun compte
   pour ce qui n'est pas quelqu'un. Mesuré le 2.10 : « CI Smoke » réécrit à chaque déploiement. */
const UID_ROBOTS_SANS_FICHE = new Set(['ci_smoke']);
async function enrich(env, request, uid, name, cgu, pre, opts) {
  if (!env || !env.ACCOUNTS) return;
  if (UID_ROBOTS_SANS_FICHE.has(uid)) return;
  /* opts.origine = l'app d'où vient un NOUVEL inscrit (transmise par le portail).
     Ne sert qu'à la création de la fiche ; une fiche existante n'en tient pas compte. */
  const origine = (opts && opts.origine) || '';
  /* Toutes les apps de la même personne alimentent UN SEUL dossier. */
  const inUid = uid;
  uid = await canonFor(env, uid, name);
  if (uid !== inUid) pre = undefined; /* la fiche préchargée était celle de l'ancien uid */
  const cf = request.cf || {};
  const ipHash = await sha256Hex((request.headers.get('CF-Connecting-IP') || '') + '|kdmc');
  const ua = request.headers.get('user-agent') || '';
  const device = /mobile|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
  const os = /iphone|ipad|ios/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /mac/i.test(ua) ? 'macOS' : /windows/i.test(ua) ? 'Windows' : /linux/i.test(ua) ? 'Linux' : '';
  /* Détail « espion » : modèle + versions + opérateur + géo fine + fuseau. */
  const D = uaParse(ua);
  const NET = ispInfo(cf);
  const devFull = [D.model, D.os + (D.osv ? ' ' + D.osv : ''), D.br + (D.brv ? ' ' + D.brv : '')].filter(function (x) { return x && x.trim(); }).join(' · ');
  const place = [cf.city, cf.region, cf.country].filter(Boolean).join(', ');
  const now = Date.now();
  /* L'adresse visitée. On accepte qu'elle soit FOURNIE par l'appelant (`opts.hote`) :
     le routeur l'a déjà calculée proprement, et l'en-tête `host` n'est pas garanti
     partout (HTTP/2 utilise `:authority`, et certains harnais ne le posent pas du
     tout — mesuré : la fiche se serait écrite sans dire DANS QUELLE APP). */
  const rawHost = ((opts && opts.hote) || request.headers.get('host') || '').toLowerCase().replace(/:.*$/, '');
  /* Whitelist ROUTES : un en-tête Host forgé ne crée JAMAIS de clé apps/history
     parasite (la map apps reste bornée aux vrais sous-domaines du domaine). */
  const host = ROUTES[rawHost] ? rawHost : '';
  /* `pre` = fiche préchargée par l'appelant (whoami la lit déjà pour la révocation)
     → évite une 2e lecture KV sur le chemin chaud. undefined = on lit nous-même. */
  const prev = pre !== undefined ? pre : await accGet(env, uid);
  const isNew = !prev;
  /* PÉRIMÈTRE — une NOUVELLE fiche naît fermée : elle n'existe que dans l'app où la
     personne s'est inscrite (Kevin 2026-09-15 : « quelqu'un d'extérieur peut
     s'enregistrer et être seulement dans une app »). C'est l'admin qui ouvre ensuite
     au domaine entier. Le sens compte : une inscription n'ouvre JAMAIS toutes les
     portes toute seule, et un oubli de rangement laisse la personne dehors plutôt que
     partout (moindre privilège).
     Les fiches DÉJÀ existantes ne reçoivent rien ici : sans champ `portee`, elles
     restent en portée domaine — personne ne perd un accès le jour du déploiement. */
  /* L'app ouverte au nouvel inscrit = celle d'où il VIENT (origine transmise par le
     portail), sinon l'adresse où il s'inscrit. Jamais « portail » seul : c'est la
     réception, elle est ouverte à tous — l'y enfermer reviendrait à ne l'ouvrir
     nulle part. Sans origine connue, la liste reste vide : la personne a le
     portail (toujours) et Kevin est prévenu pour décider. */
  const appIci = host ? (APPS[host] || '') : '';
  const premiere = (origine && origine !== 'portail') ? origine : (appIci && appIci !== 'portail' ? appIci : '');
  const acc = prev || {
    uid, name, created: now, cgu_at: 0, hits: 0, devices: [], places: [], apps: {}, history: [],
    /* Compte unique (27.09) : né « domaine », reconnu partout sauf APPS_PRIVEES ; `acces`
       garde l'app d'arrivée (utile à l'admin) — SAUF une app privée : l'origine vient du
       client, et « je viens du coffre » ne doit jamais ouvrir le coffre. */
    portee: 'domaine', acces: (premiere && APPS_PRIVEES.indexOf(premiere) < 0) ? [premiere] : [], bloque: [],
  };
  const prevSeen = acc.last_seen || 0;
  const prevCountry = acc.last_country || '';
  /* `structural` = quelque chose de NOUVEAU à persister tout de suite (nouvelle fiche,
     CGU, nouvel appareil/lieu, nouvelle session). Un simple heartbeat n'en est pas un. */
  let structural = isNew;
  if (name && name !== acc.name) { acc.name = name; structural = true; }
  if (cgu && !acc.cgu_at) { acc.cgu_at = now; structural = true; }
  acc.last_seen = now;
  acc.last_ip_hash = ipHash;
  acc.last_place = place;
  acc.last_device = devFull || (device + (os ? ' · ' + os : ''));
  acc.last_app = host || acc.last_app || '';
  /* Renseignements fins conservés sur la fiche (dernier état connu). */
  acc.last_isp = NET.isp; acc.last_vpn = !!NET.vpn;
  acc.last_tz = cf.timezone || acc.last_tz || '';
  acc.last_geo = { city: cf.city || '', postal: cf.postalCode || '', lat: cf.latitude || '', lon: cf.longitude || '' };
  /* MAX DE RENSEIGNEMENTS — tout ce que le réseau nous donne déjà, gratuitement,
     côté serveur (impossible à bloquer par le navigateur ou un bloqueur de pub). */
  acc.last_lang = (request.headers.get('accept-language') || '').split(',')[0].trim().slice(0, 12) || acc.last_lang || '';
  acc.last_net = {
    asn: cf.asn || '', colo: cf.colo || '', continent: cf.continent || '',
    region: cf.regionCode || '', http: cf.httpProtocol || '', tls: cf.tlsVersion || '',
  };
  /* Par où il est entré (app d'origine) et sur quelle page il est tombé. */
  try {
    const ref = request.headers.get('referer') || '';
    acc.last_from = ref ? new URL(ref).hostname : acc.last_from || '';
  } catch { /* referer illisible */ }
  try { acc.last_path = new URL(request.url).pathname.slice(0, 80) || acc.last_path || ''; } catch { /* url illisible */ }
  /* RYTHME : à quelles heures cette personne se connecte (histogramme 24 h, cumulatif). */
  acc.hours = acc.hours || {};
  const hh = String(new Date(now).getUTCHours());
  acc.hours[hh] = (acc.hours[hh] || 0) + 1;
  /* devKey VOLONTAIREMENT sans version : sinon chaque mise à jour d'iOS/navigateur
     compterait comme un « nouvel appareil » → alerte push à chaque update (spam). */
  const devKey = device + (os ? '·' + os : '');
  const newDevice = (acc.devices || []).indexOf(devKey) < 0;
  if (newDevice) structural = true;
  acc.devices = Array.from(new Set([...(acc.devices || []), devKey])).slice(-10);
  if (place && (acc.places || []).indexOf(place) < 0) structural = true;
  if (place) acc.places = Array.from(new Set([...(acc.places || []), place])).slice(-20);
  /* Détection d'anomalie SIMPLE (pas de ML) : changement de PAYS entre deux
     connexions rapprochées (< 60 min) = déplacement géographiquement impossible
     (compte partagé/volé, ou VPN). On FLAGUE (jamais on ne bloque : anti-lockout ;
     un VPN reste légitime). Le drapeau est affiché en admin + poussé en alerte. */
  const curCountry = cf.country || '';
  const geoAnomaly = !isNew && curCountry && prevCountry && curCountry !== prevCountry && (now - prevSeen) < 60 * 60e3;
  if (geoAnomaly) { acc.anomaly = { at: now, from: prevCountry, to: curCountry, place: place, mins: Math.round((now - prevSeen) / 60e3) }; structural = true; }
  if (curCountry) acc.last_country = curCountry;
  /* Historique de connexions PAR SITE, avec DURÉE. Une "connexion" = une session :
     début à la 1re activité, PROLONGÉE par les pings de présence tant que l'app
     reste ouverte, TERMINÉE dès ~3 min sans ping (= app fermée). Durée = end - ts.
     Les pings ne créent PAS de doublon (ils prolongent la session en cours).
     hits = nombre de vraies sessions. */
  /* CADENCE DES ÉCRITURES DE PRÉSENCE (mesuré le 1.10.2026, API Analytics KV, robot mesure-kv) : 1 264
     écritures avant 10h27 UTC, pics à 05h (428) et 03h (235) — aucun robot GitHub à ces heures. Lecture du
     code : chaque app ouverte envoie /__sso/whoami toutes les 60 s, et une écriture partait dès que
     last_seen avait 2 min → 30 écritures par heure et par personne, app simplement ouverte. 260 personnes,
     plafond 1 000/jour tout le compte (fiches, codes, sauvegardes Lingua, voix…) : il tombait avant midi.
     Maintenant : un battement sans rien de nouveau n'écrit que toutes les ENRICH_CADENCE (10 min) → ÷ 5.
     Ce qui est NOUVEAU (fiche, appareil, lieu, session, CGU) s'écrit toujours tout de suite. Le gap de
     session suit la cadence (sinon chaque écriture ouvrirait une « nouvelle session »). Précision des
     durées : ± 10 min ; « en ligne » dans l'admin = vu depuis moins de ENRICH_CADENCE + 3 min. */
  const SESSION_GAP = ENRICH_CADENCE + 3 * 60e3;
  acc.apps = acc.apps || {};
  acc.history = acc.history || [];
  if (host) {
    const a = acc.apps[host] || { first: now, last: 0, sessions: 0 };
    const prevLast = a.last || 0;
    const cont = a.sessions > 0 && (now - prevLast) <= SESSION_GAP; /* session encore en cours ? */
    a.last = now;
    let cur = null; /* la session la plus récente pour CE site */
    for (let i = 0; i < acc.history.length; i++) { if (acc.history[i].app === host) { cur = acc.history[i]; break; } }
    if (cont && cur) {
      cur.end = now; /* prolonge la session ouverte → la durée grandit */
      /* TEMPS CUMULÉ réellement passé sur cette app (somme des prolongations). */
      a.ms = (a.ms || 0) + Math.max(0, now - prevLast);
    } else {
      a.sessions = (a.sessions || 0) + 1;
      acc.hits = (acc.hits || 0) + 1;
      /* Chaque session garde SON contexte (appareil détaillé, opérateur, VPN, coords)
         → on voit l'évolution dans le temps, pas seulement le dernier état. */
      acc.history.unshift({
        ts: now, end: now, app: host, device: devKey, place: place,
        dev: devFull, isp: NET.isp, vpn: NET.vpn ? 1 : 0,
        lat: cf.latitude || '', lon: cf.longitude || '', tz: cf.timezone || '',
      });
      if (acc.history.length > 80) acc.history = acc.history.slice(0, 80);
      structural = true;
    }
    acc.apps[host] = a;
  } else if (!acc.hits) {
    acc.hits = 1;
  }
  /* THROTTLE écritures KV (quota free = 1 000 writes/jour, partagé compte) : un battement qui ne change
     rien de structurel n'écrit que si last_seen stocké a plus de ENRICH_CADENCE (voir plus haut). */
  if (!structural && now - prevSeen < ENRICH_CADENCE) return;
  /* Nouvel appareil sur une fiche EXISTANTE → trace dans le journal admin
     (signal fort avec si peu d'utilisateurs) + alerte push si configurée. */
  /* NOUVEL INSCRIT fermé à une app → Kevin doit le SAVOIR, sinon la personne
     attend une ouverture que personne ne sait devoir faire. Journal admin + push
     (opt-in par config, fail-open : jamais une connexion cassée par une notif). */
  if (isNew) {
    /* Compte unique (27.09) : un nouvel inscrit n'attend plus de décision de Kevin (il est
       reconnu partout sauf APPS_PRIVEES) → plus de notification sur l'iPhone (règle anti-spam),
       le JOURNAL admin garde chaque arrivée. */
    const arrivee = (acc.acces && acc.acces.length) ? acc.acces.join(', ') : 'portail';
    await audLog(env, { ev: 'nouvel_inscrit', uid, detail: (acc.name || uid) + ' · arrivé par : ' + arrivee + ' · reconnu partout sauf ' + APPS_PRIVEES.join('/') });
  }
  if (newDevice && !isNew) {
    await audLog(env, { ev: 'new_device', uid, detail: devKey + (place ? ' · ' + place : '') });
    await notifyPush(env, '🔐 KDMC — nouvel appareil',
      'Nouvelle connexion (' + (acc.name || uid) + ') depuis ' + devKey + (place ? ' · ' + place : '') + '.');
  }
  if (geoAnomaly) {
    await audLog(env, { ev: 'geo_anomaly', uid, detail: prevCountry + ' → ' + curCountry + ' en ' + acc.anomaly.mins + ' min' });
    await notifyPush(env, '⚠️ KDMC — connexion suspecte',
      (acc.name || uid) + ' : ' + prevCountry + ' → ' + curCountry + ' en ' + acc.anomaly.mins + ' min (déplacement impossible).');
  }
  await accPut(env, acc, !isNew);
  /* Fusion AUTOMATIQUE des fiches éparpillées, sans aucune action de Kevin. Rien n'est
     perdu : les connexions s'additionnent, les historiques se concatènent, appareils/
     lieux/apps s'unissent. L'ancienne fiche n'est pas effacée : elle devient un renvoi.
     MESURÉ le 2026-08-06 : deux fiches « kevin Desarzens » (196 + 116 connexions)
     coexistaient encore — parce que le drapeau `merged_v1` était DÉFINITIF : une fiche
     en double apparue APRÈS la première fusion n'était plus jamais absorbée. On repasse
     donc régulièrement (au plus 1×/semaine par dossier, coût négligeable) au lieu d'une
     seule fois. Les dossiers déjà fusionnés (merged_v1 sans date) repassent une fois. */
  const lastMerge = acc.merged_at || 0;
  if (now - lastMerge > MERGE_RESCAN_MS) { try { await mergeIntoCanon(env, acc); } catch { /* fail-open */ } }
}

/* Absorbe dans la fiche canonique toutes les fiches de la MÊME personne (autres uid).
   « Même personne » = même nom complet normalisé (accents/casse/tirets ignorés), ou
   tout alias de l'admin. Jamais sur un prénom seul → deux « Marie » restent distinctes. */
async function mergeIntoCanon(env, acc) {
  /* Borné : on ne relit jamais plus de 300 dossiers dans une même requête. */
  const idx = JSON.parse((await env.ACCOUNTS.get('idx:uids')) || '[]').slice(-300);
  const me = normName(acc.name);
  const admin = acc.uid === CANON_UID;
  const stamp = async () => { acc.merged_v1 = 1; acc.merged_at = Date.now(); await accPut(env, acc, true); };
  if (!admin && me.split(' ').filter(Boolean).length < 2) { await stamp(); return; }
  const others = [];
  for (const u of idx) {
    if (u === acc.uid) continue;
    const o = await accGet(env, u);
    if (!o || o.merged_into) continue;
    const same = admin ? isAdminName(o.name) : (normName(o.name) === me && !isAdminName(o.name));
    if (same) others.push(o);
  }
  if (!others.length) { await stamp(); return; }
  for (const o of others) {
    acc.hits = (acc.hits || 0) + (o.hits || 0);
    acc.history = (acc.history || []).concat(o.history || [])
      .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 80);
    acc.devices = Array.from(new Set([...(acc.devices || []), ...(o.devices || [])])).slice(-10);
    acc.places = Array.from(new Set([...(acc.places || []), ...(o.places || [])])).slice(-20);
    acc.apps = acc.apps || {};
    for (const [h, s] of Object.entries(o.apps || {})) {
      const t = acc.apps[h] || { first: s.first || 0, last: 0, sessions: 0, ms: 0 };
      t.sessions = (t.sessions || 0) + (s.sessions || 0);
      t.ms = (t.ms || 0) + (s.ms || 0);
      t.last = Math.max(t.last || 0, s.last || 0);
      t.first = Math.min(t.first || s.first || 0, s.first || t.first || 0) || t.first;
      acc.apps[h] = t;
    }
    if (o.created && (!acc.created || o.created < acc.created)) acc.created = o.created;
    if (o.cgu_at && !acc.cgu_at) acc.cgu_at = o.cgu_at;
    if ((o.last_seen || 0) > (acc.last_seen || 0)) acc.last_seen = o.last_seen;
    acc.aliases = Array.from(new Set([...(acc.aliases || []), o.uid])).slice(-20);
    /* L'ancienne fiche devient un RENVOI (jamais supprimée : traçabilité + réversible). */
    await env.ACCOUNTS.put('acc:' + o.uid, JSON.stringify({ uid: o.uid, name: o.name, merged_into: acc.uid, merged_at: Date.now() }));
  }
  await stamp();
  await audLog(env, { ev: 'accounts_merged', uid: acc.uid, detail: others.map((o) => o.uid).join(', ') + ' → ' + acc.uid });
}

async function handleSso(request, url, env) {
  const secret = env && env.KDMC_SSO_SECRET;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!secret) return J({ ok: false, reason: 'sso_not_configured' });
  const path = url.pathname;
  if (path === '/__sso/porte.js' && request.method === 'GET') {
    return new Response(PORTE_JS, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' } });
  }
  if (path === '/__sso/cookie' && request.method === 'POST') {
    /* Repose le cookie de session à partir du laissez-passer (Bearer) que l'app garde en
       localStorage : une app de l'écran d'accueil (cookies à part) redevient reconnue par le
       ROUTEUR à la navigation, pas seulement par ses propres appels. Même garde-fou anti-CSRF
       de connexion que /__sso/issue (origine du domaine seulement) ; le pass est vérifié
       (signature, expiration, révocation, périmètre) et reposé TEL QUEL, avec sa durée
       restante — aucune session nouvelle n'est fabriquée ici. */
    if (!ssoOriginOk(request.headers.get('origin'), url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1].trim() : '';
    const s = token ? await ssoVerify(secret, token) : null;
    if (!s) return J({ ok: false, reason: 'pass_invalide' }, undefined, 401);
    const acc = await accGet(env, s.uid);
    if (revoked(acc, s)) return J({ ok: false, reason: 'session_revoquee' }, undefined, 401);
    const estAdmin = ADMIN_UIDS.indexOf(s.uid) >= 0 && !!s.verified;
    const app = appDe(url.host); /* l'adresse appelée (pas l'en-tête Host, absent hors navigateur) */
    const per = perimetre(acc, app);
    if (!per.ok && !estAdmin) {
      return J({ ok: false, reason: per.raison, hors_perimetre: true, app,
        message: per.raison === 'bloque_ici' ? 'Ton accès à cette application a été fermé par l\'administrateur.' : 'Ton compte n\'est pas ouvert sur cette application.' });
    }
    const restant = Math.max(60, Math.floor(((s.exp || 0) - Date.now()) / 1000));
    const cookie = `${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${restant}; Secure; HttpOnly; SameSite=Lax`;
    return J({ ok: true, uid: s.uid, name: s.name, verified: !!s.verified, admin: estAdmin }, cookie);
  }
  /* CONNEXION PERMANENTE (Kevin 2.10 : « je reste connecté en permanence, partout ») : une session valide qui
     approche de sa fin est renouvelée (30 jours de plus), avec EXACTEMENT les mêmes droits. Quelqu'un qui revient
     au moins une fois par quinzaine ne se déconnecte jamais. Ne prolonge JAMAIS : une session révoquée (« déconnecter
     partout » reste efficace), ni le laissez-passer ADMIN Face ID (règle Kevin 30.09 : 24 h, puis Face ID une fois par
     jour). Même garde-fou d'origine que /__sso/issue. */
  if (path === '/__sso/prolonger' && request.method === 'POST') {
    if (!ssoOriginOk(request.headers.get('origin'), url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    const tok = ssoTokenSansAdresse(request);
    const s = tok ? await ssoVerify(secret, tok) : null;
    if (!s) return J({ ok: false, reason: 'pas_de_session' }, undefined, 401);
    if (revoked(await accGet(env, s.uid), s)) return J({ ok: false, reason: 'session_revoquee' }, undefined, 401);
    if (s.verified && ADMIN_UIDS.indexOf(s.uid) >= 0) return J({ ok: true, prolonge: false, raison: 'admin_face_id_quotidien' });
    const reste = (s.exp || 0) - Date.now();
    if (reste > 15 * 24 * 3600e3) return J({ ok: true, prolonge: false, reste_jours: Math.floor(reste / 864e5) });
    const neuf = await ssoSign(secret, s.uid, s.name, s.cgu, s.verified, s.code);
    const cookie = `${SSO_COOKIE}=${neuf}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(neuf)}; Secure; HttpOnly; SameSite=Lax`;
    return J({ ok: true, prolonge: true, token: neuf }, cookie);
  }
  if (path === '/__sso/whoami' && request.method === 'GET') {
    const s = await ssoVerify(secret, ssoToken(request));
    /* SÉCU (leçon #99) : admin EXIGE une identité FORTE (verified = Face ID prouvé).
       Un uid admin auto-déclaré via /__sso/issue reste verified:false → admin:false. */
    if (s) {
      const acc = await accGet(env, s.uid);
      /* Révocation à distance : token émis avant « Déconnecter partout » → refusé. */
      if (revoked(acc, s)) return J({ ok: false, reason: 'session_revoquee' });
      /* PÉRIMÈTRE (Kevin 2026-09-15) : cette personne existe-t-elle dans CETTE app ?
         Hors périmètre → on ne la RECONNAÎT pas (ok:false), on ne la « bloque » pas :
         les apps publiques restent visitables comme par n'importe quel inconnu, les
         apps à identité refusent d'elles-mêmes. Zéro ligne à changer dans les 26 apps.
         L'admin (uid admin + Face ID prouvé) n'est jamais restreint — sinon une erreur
         de rangement enfermerait Kevin dehors de son propre domaine. */
      const estAdmin = ADMIN_UIDS.indexOf(s.uid) >= 0 && !!s.verified;
      const app = appDe(request.headers.get('host'));
      const per = perimetre(acc, app);
      if (!per.ok && !estAdmin) {
        return J({
          ok: false, reason: per.raison, hors_perimetre: true, app,
          message: per.raison === 'bloque_ici'
            ? 'Ton accès à cette application a été fermé par l\'administrateur.'
            : 'Ton compte n\'est pas ouvert sur cette application.',
        });
      }
      await enrich(env, request, s.uid, s.name, s.cgu, acc);
      /* CONNECTÉ EN PERMANENCE, DANS CHAQUE APP (Kevin 2.10 : « comme tout mon domaine, chaque application, je
         reste connecté en permanence »). Toutes les apps demandent whoami : quand il reste moins de 15 jours, la
         session est re-signée (30 jours) et le cookie commun à *.kd-mc.com repart — 0 écriture KV, 0 ligne à
         changer dans les apps. Jamais la session admin Face ID (24 h, Face ID chaque jour : voulu). Le jeton neuf
         n'est rendu dans le corps qu'à qui l'a envoyé en en-tête (app installée, stockage à elle). */
      const reste = (s.exp || 0) - Date.now();
      let neuf = null, cookieNeuf;
      if (!estAdmin && reste > 0 && reste < 15 * 24 * 3600e3) {
        neuf = await ssoSign(secret, s.uid, s.name, s.cgu, s.verified, s.code);
        cookieNeuf = `${SSO_COOKIE}=${neuf}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(neuf)}; Secure; HttpOnly; SameSite=Lax`;
      }
      const parEnTete = !!(request.headers.get('authorization') || request.headers.get('x-kdmc-sso'));
      /* `cgu` = accepté UNE fois, n'importe où (fiche `cgu_at`), pas seulement dans ce pass. */
      const rep = { ok: true, uid: s.uid, name: s.name, cgu: !!(s.cgu || (acc && acc.cgu_at)), verified: !!s.verified, code: !!s.code, admin: estAdmin, app, portee: (acc && acc.portee === 'app') ? 'app' : 'domaine' };
      if (neuf) { rep.renouvelee = true; if (parEnTete) rep.token = neuf; }
      return J(rep, cookieNeuf);
    }
    return J({ ok: false });
  }

  /* ===== WebAuthn (passkey / Face ID) — fait du domaine un IdP à identité FORTE ===== */
  /* rpId/origins surchargés par env UNIQUEMENT pour les tests (localhost) ;
     en prod aucune de ces vars n'est posée → valeurs kd-mc.com. */
  const RP_ID = (env && env.KDMC_RP_ID) || 'kd-mc.com';
  const RP_ORIGINS = (env && env.KDMC_RP_ORIGINS) ? env.KDMC_RP_ORIGINS.split(',') : ['https://kd-mc.com', 'https://www.kd-mc.com'];
  /* SE CONNECTER par Face ID (auth, pas l'enrôlement) : aussi depuis NOS apps (Kevin 26.09,
     « Oui aux 2 »). Mesuré le 26.09 : une app posée sur l'écran d'accueil de l'iPhone a un stockage
     VIDE et isolé — « Me connecter » renvoyait au portail, qui n'y connaissait personne et
     affichait « Créer mon compte ». Avec rpId kd-mc.com, le passkey de Kevin (trousseau iCloud)
     marche aussi sur javis.kd-mc.com : l'app le prouve SUR PLACE. Liste = les adresses que CE
     routeur sert (ROUTES), jamais un joker ; la preuve reste la signature Face ID vérifiée ici avec
     la clé enregistrée. L'ENRÔLEMENT d'un nouvel appareil reste au portail seul (RP_ORIGINS). */
  const RP_ORIGINS_AUTH = (env && env.KDMC_RP_ORIGINS) ? RP_ORIGINS
    : RP_ORIGINS.concat(Object.keys(ROUTES).map((h) => 'https://' + h).filter((o) => RP_ORIGINS.indexOf(o) < 0));
  if (path === '/__sso/webauthn/register/options' && request.method === 'POST') {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    if (revoked(await accGet(env, s.uid), s)) return J({ ok: false, reason: 'session révoquée — reconnecte-toi' });
    const challenge = await makeChallenge(secret, 'reg');
    return J({ ok: true, challenge, rp: { id: RP_ID, name: 'KDMC APEX' }, user: { id: b64uEnc(new TextEncoder().encode(s.uid)), name: s.name || s.uid, displayName: s.name || s.uid }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] });
  }
  if (path === '/__sso/webauthn/register/verify' && request.method === 'POST') {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    if (revoked(await accGet(env, s.uid), s)) return J({ ok: false, reason: 'session révoquée — reconnecte-toi' });
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    let reg;
    try { reg = await parseRegistration(secret, b.attestationObject, b.clientDataJSON); }
    catch (e) { return J({ ok: false, reason: String((e && e.message) || e).slice(0, 120) }); }
    if (!RP_ORIGINS.includes(reg.origin)) return J({ ok: false, reason: 'origin non autorisée' });
    if ((await challengeConsume(env, b.clientDataJSON)) === 'replay') return J({ ok: false, reason: 'challenge déjà utilisé (rejeu)' });
    if (env && env.ACCOUNTS) {
      const list = JSON.parse((await env.ACCOUNTS.get(pkKey(s.uid))) || '[]');
      const already = list.some((k) => k.credId === reg.credId);
      /* SÉCU (leçon #99) : l'identité SSO est AUTO-DÉCLARÉE. Interdit de GREFFER un
         passkey sur un UID ADMIN dont la liste est déjà NON VIDE depuis une session
         non-vérifiée — sinon un inconnu déclarant "kevin-desarzens" au portail
         pourrait enrôler SON Face ID sur le compte admin. Bootstrap (liste vide) OK ;
         une session déjà vérifiée OU une preuve du code admin (grant /__admin/login)
         autorise l'ajout d'un nouvel appareil → Kevin n'est JAMAIS bloqué (il connaît
         le PIN admin). Les comptes non-admin (Laurence, etc.) restent multi-appareils. */
      /* (27.09.2026) PLUS D'EXCEPTION « liste vide » : depuis que le code admin donne à Kevin une session
         vérifiée sur n'importe quel appareil (/__admin/login), il n'a jamais besoin du bootstrap — et
         ce bootstrap était le seul chemin par lequel un inconnu pouvait greffer SON Face ID sur le
         compte admin. Un passkey admin s'ajoute avec une session vérifiée OU le grant du code admin. */
      const isAdminUid = ADMIN_UIDS.indexOf(s.uid) >= 0;
      if (isAdminUid && !already && !s.verified) {
        if (!(await grantValide(env, secret, adminGrantTok(request)))) {
          return J({ ok: false, reason: 'compte admin protégé — prouve le code admin (/__admin/login) pour ajouter un appareil' });
        }
      }
      if (!already) list.push({ credId: reg.credId, jwk: reg.jwk, created: Date.now() });
      await env.ACCOUNTS.put(pkKey(s.uid), JSON.stringify(list.slice(-10)));
      const acc = await accGet(env, s.uid);
      if (acc) { acc.passkey = true; acc.passkey_at = acc.passkey_at || Date.now(); await accPut(env, acc); }
    }
    /* Émet immédiatement une session FORTE (verified) — l'enrôlement prouve Face ID. */
    await enrich(env, request, s.uid, s.name, s.cgu);
    const token = await ssoSign(secret, s.uid, s.name, s.cgu, true);
    const cookie = `${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(token)}; Secure; HttpOnly; SameSite=Lax`;
    return J({ ok: true, verified: true, token }, cookie);
  }
  if (path === '/__sso/webauthn/auth/options' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const uid = String(b.uid || '').slice(0, 80).trim();
    let allow = [];
    if (env && env.ACCOUNTS && uid) {
      const list = JSON.parse((await env.ACCOUNTS.get(pkKey(uid))) || '[]');
      allow = list.map((k) => ({ type: 'public-key', id: k.credId }));
    }
    const challenge = await makeChallenge(secret, 'auth');
    return J({ ok: true, challenge, rpId: RP_ID, allowCredentials: allow });
  }
  if (path === '/__sso/webauthn/auth/verify' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const uid = String(b.uid || '').slice(0, 80).trim();
    const credId = String(b.credId || '');
    if (!uid || !credId) return J({ ok: false, reason: 'uid+credId requis' });
    const list = (env && env.ACCOUNTS) ? JSON.parse((await env.ACCOUNTS.get(pkKey(uid))) || '[]') : [];
    const rec = list.find((k) => k.credId === credId);
    if (!rec) return J({ ok: false, reason: 'passkey inconnu' });
    const r = await verifyAssertion(secret, rec.jwk, { clientDataJSON: b.clientDataJSON, authenticatorData: b.authenticatorData, signature: b.signature }, { origins: RP_ORIGINS_AUTH, rpId: RP_ID });
    if (!r.ok) return J({ ok: false, reason: r.reason });
    if ((await challengeConsume(env, b.clientDataJSON)) === 'replay') return J({ ok: false, reason: 'challenge déjà utilisé (rejeu)' });
    /* Détection de clone par compteur de signature : on ne rejette QUE si le compteur
       régresse alors que les deux valeurs sont > 0 (no-op pour les passkeys Apple/Google
       synchronisés, qui restent à 0 — jamais de faux rejet, jamais de lockout). */
    if (env && env.ACCOUNTS) {
      if (r.count > 0 && (rec.count || 0) > 0 && r.count <= rec.count) return J({ ok: false, reason: 'compteur de signature régressé (clone suspecté)' });
      if ((r.count || 0) > (rec.count || 0)) { rec.count = r.count; try { await env.ACCOUNTS.put(pkKey(uid), JSON.stringify(list)); } catch { /* fail-open */ } }
    }
    const acc = await accGet(env, uid);
    const name = (acc && acc.name) || uid;
    await enrich(env, request, uid, name, true);
    const token = await ssoSign(secret, uid, name, true, true);
    const cookie = `${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(token)}; Secure; HttpOnly; SameSite=Lax`;
    return J({ ok: true, uid, name, verified: true, token }, cookie);
  }
  if (path === '/__sso/issue' && request.method === 'POST') {
    /* SÉCU (Strix vuln-0001, 11/09/2026 — CWE-287/CSRF de connexion) : un site TIERS pouvait
       POSTer ici depuis le navigateur d'un visiteur (requête « simple » text/plain) et lui
       POSER un cookie kdmc_sso à un nom choisi par l'attaquant → toutes les apps du domaine
       l'auraient « reconnu » sous ce nom. L'émission reste auto-déclarée (jamais admin ni
       verified), mais elle n'est acceptée que depuis le domaine lui-même (portail, apps
       *.kd-mc.com) ou une app native (capacitor:// / ionic://). Sans en-tête Origin (outil,
       app installée qui ne l'envoie pas) → inchangé : aucun navigateur tiers n'est en jeu. */
    if (!ssoOriginOk(request.headers.get('origin'), url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const uid = String(b.uid || '').slice(0, 80).trim();
    const name = String(b.name || '').slice(0, 80).trim();
    const cgu = !!b.cgu;
    if (!uid || !name) return J({ ok: false, reason: 'uid+name requis' });
    /* PÉRIMÈTRE : inutile de fabriquer une session que `whoami` refusera juste après
       (sinon la page boucle : « connecte-toi » → connecté → pas reconnu → « connecte-toi »).
       On répond ici, une fois, avec la raison en clair. La fiche se cherche à son
       emplacement CANONIQUE : une même personne a un seul dossier, quel que soit
       l'identifiant que l'app envoie (sinon on contournerait le périmètre en se
       présentant sous l'uid d'une autre app). */
    /* `pour` = l'app d'où la personne VIENT (le portail la reçoit avec ?return=…
       et nous le transmet). C'est cette app-là qu'on ouvre à un nouvel inscrit —
       pas le portail, qui n'est qu'une réception. Adresse contrôlée : si ce n'est
       pas un sous-domaine servi, on l'ignore (jamais d'app inventée). */
    const origine = appDe(String(b.pour || '').replace(/^https?:\/\//, '').split('/')[0]);
    {
      const app = appDe(request.headers.get('host'));
      /* `sansCreer` : on CHERCHE le dossier sans réserver le nom — une demande
         qu'on va peut-être refuser deux lignes plus bas ne doit rien écrire. */
      const accCanon = await accGet(env, await canonFor(env, uid, name, { sansCreer: true }));
      const per = perimetre(accCanon, app);
      if (!per.ok) {
        return J({
          ok: false, reason: per.raison, hors_perimetre: true, app,
          message: per.raison === 'bloque_ici'
            ? 'Ton accès à cette application a été fermé par l\'administrateur.'
            : 'Ton compte n\'est pas ouvert sur cette application.',
        });
      }
      /* RENSEIGNEMENTS OBLIGATOIRES pour un NOUVEAU (Kevin 27.09 : « renseignements obligatoires
         partout pour les nouveaux »). Le portail les exigeait déjà à l'écran, mais le DOMAINE ne
         vérifiait rien : un script créait une fiche avec un seul mot et sans accepter les
         conditions. Prénom ET nom (règle absolue : jamais un seul mot) + conditions acceptées.
         Quelqu'un de déjà inscrit n'est jamais bloqué par ce contrôle. */
      if (!accCanon && !renseignementsComplets(name, cgu)) {
        return J({ ok: false, reason: 'renseignements_requis', message: 'Pour créer ton compte : prénom ET nom, et accepter les conditions.' }, undefined, 400);
      }
      /* QUOTA — seulement pour une fiche NEUVE. Quelqu'un de déjà inscrit passe
         toujours, autant de fois qu'il veut : `accCanon` existe, on ne compte rien. */
      if (!accCanon) {
        const ipHash = await sha256Hex((request.headers.get('CF-Connecting-IP') || '') + '|kdmc');
        const q = await quotaInscription(env, ipHash);
        if (!q.ok) {
          return J({
            ok: false, reason: q.raison, quota: true,
            message: q.raison === 'quota_ip'
              ? 'Trop de comptes créés depuis cette connexion aujourd\'hui. Réessaie demain, ou demande à l\'administrateur d\'ouvrir ton accès.'
              : 'Les inscriptions sont momentanément suspendues sur le domaine. Réessaie demain — les comptes existants fonctionnent normalement.',
          }, undefined, 429);
        }
      }
    }
    /* CODE DU COMPTE (27.09) — voir credHash. `cle` = le dossier canonique de la personne. */
    let codeProuve = false;
    {
      const code = typeof b.code === 'string' ? b.code : '';
      const accC = await accGet(env, await canonFor(env, uid, name, { sansCreer: true }));
      const cle = accC ? accC.uid : uid;
      if (cle !== CANON_UID && env.ACCOUNTS) {
        const rec = await credGet(env, cle);
        const sess = await ssoVerify(secret, ssoToken(request));
        const memeSession = !!(sess && (sess.uid === cle || sess.uid === uid) && !revoked(accC, sess));
        if (code) {
          if (!CODE_VALIDE(code)) return J({ ok: false, reason: 'code_invalide', message: 'Le code doit faire au moins 6 caractères.' }, undefined, 400);
          const attente = await credVerrou(env, cle);
          if (attente) return J({ ok: false, reason: 'trop_essais', attente, message: 'Trop d\'essais. Réessaie dans ' + Math.ceil(attente / 60) + ' min.' }, undefined, 429);
          if (rec) {
            if (!(await credOk(rec, code))) {
              await credEchec(env, cle);
              return J({ ok: false, reason: 'code_incorrect', message: 'Ce nom a déjà un compte, et ce n\'est pas son code.' }, undefined, 401);
            }
            await credReussite(env, cle); codeProuve = true;
          } else if (!accC || memeSession) {
            /* Nouveau compte, OU la personne elle-même (session déjà à elle, sur son appareil) :
               on enregistre son code au domaine. Un inconnu sur un appareil neuf ne peut PAS
               poser le code d'un compte existant (il enfermerait le vrai propriétaire dehors). */
            await credSet(env, cle, code); codeProuve = true;
          }
        } else if (rec && !memeSession) {
          /* Nom protégé par un code, et personne ne le prouve : on ne délivre plus la session de
             quelqu'un d'autre sur la foi de son nom. (Les apps qui déclarent leur utilisateur
             sans code restent fonctionnelles : leur appel est « jamais bloquant ».) */
          return J({ ok: false, reason: 'code_requis', message: 'Ce nom a un compte protégé par un code : connecte-toi avec ton nom et ton code.' }, undefined, 401);
        }
      }
    }
    await enrich(env, request, uid, name, cgu, undefined, { origine });
    const token = await ssoSign(secret, uid, name, cgu, false, codeProuve);
    const cookie = `${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(token)}; Secure; HttpOnly; SameSite=Lax`;
    /* token renvoyé dans le corps : le portail le met dans le lien de retour
       (#kdmc_sso=) pour les apps installées (où le cookie ne traverse pas). */
    /* /issue = identité AUTO-DÉCLARÉE (aucune preuve) → jamais admin/verified ici.
       L'admin ne s'obtient que par un passkey Face ID vérifié (auth/verify). */
    /* L'identité admin ne se prouve pas par un code de compte : on le dit au portail, qui propose
       alors le code ADMIN (→ session vérifiée) au lieu de laisser Kevin « auto-déclaré ». */
    const adminRequis = (await canonFor(env, uid, name, { sansCreer: true })) === CANON_UID;
    return J({ ok: true, uid, name, cgu, token, admin: false, code: codeProuve, admin_requis: adminRequis }, cookie);
  }
  /* CONNEXION SUR UN APPAREIL NEUF (ou dans n'importe quelle app) : nom + code → la session du
     compte. Même message pour « nom inconnu » et « mauvais code » (on ne confirme pas qu'un nom
     existe). Essais limités par compte, fermé en cas de doute. */
  if (path === '/__sso/login' && request.method === 'POST') {
    if (!ssoOriginOk(request.headers.get('origin'), url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const name = String(b.name || '').slice(0, 80).trim();
    const code = typeof b.code === 'string' ? b.code : '';
    const NON = { ok: false, reason: 'identifiants', message: 'Nom ou code incorrect. (Si tu n\'as pas rouvert ton compte depuis le 27.09, ouvre-le une fois sur ton appareil habituel : ton code y sera enregistré.)' };
    if (!name || !CODE_VALIDE(code) || !env.ACCOUNTS) return J(NON, undefined, 401);
    /* Prénom Nom OU Nom Prénom (règle « recherche nom/prénom toujours flexible ») : on cherche
       le nom tel quel, puis mots inversés (« Curie Marie », « SAINT-POLIT Laurence »). */
    const mots = name.split(/\s+/).filter(Boolean);
    let cle = await canonFor(env, '', name, { sansCreer: true });
    if (!cle && mots.length >= 2) cle = await canonFor(env, '', mots.slice(1).join(' ') + ' ' + mots[0], { sansCreer: true });
    if (!cle && mots.length >= 2) cle = await canonFor(env, '', mots[mots.length - 1] + ' ' + mots.slice(0, -1).join(' '), { sansCreer: true });
    if (!cle || cle === CANON_UID) return J(NON, undefined, 401);
    const attente = await credVerrou(env, cle);
    if (attente) return J({ ok: false, reason: 'trop_essais', attente, message: 'Trop d\'essais. Réessaie dans ' + Math.ceil(attente / 60) + ' min.' }, undefined, 429);
    const rec = await credGet(env, cle);
    const acc = await accGet(env, cle);
    if (!rec || !acc || !(await credOk(rec, code))) { if (rec) await credEchec(env, cle); return J(NON, undefined, 401); }
    await credReussite(env, cle);
    const per = perimetre(acc, appDe(request.headers.get('host')));
    if (!per.ok) return J({ ok: false, reason: per.raison, hors_perimetre: true, message: 'Ton compte n\'est pas ouvert sur cette application.' });
    await enrich(env, request, acc.uid, acc.name || name, true, undefined, {});
    const token = await ssoSign(secret, acc.uid, acc.name || name, true, false, true);
    const cookie = `${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(token)}; Secure; HttpOnly; SameSite=Lax`;
    return J({ ok: true, uid: acc.uid, name: acc.name || name, cgu: true, token, admin: false, code: true }, cookie);
  }
  /* ENTRER PAR N'IMPORTE QUELLE PORTE (Kevin 2026-09-27 : « reconnu par n'importe quel chemin sur
     mes appareils : domaine, chaque app, internet, bureau »). Une app INSTALLÉE sur l'écran
     d'accueil (iPhone, PC) a un stockage de cookies ISOLÉ : la session posée sur kd-mc.com ne
     la suit pas. Jusqu'ici le portail passait le laissez-passer en fragment (#kdmc_sso=) — que
     seules les apps de la liste SSO_PASS_CONSUMERS savaient lire, et jamais CMCteams (routeur
     par « # »). Ici, le laissez-passer est déposé DANS le stockage de l'app elle-même : cette
     adresse est servie sur CHAQUE hôte du domaine par le même routeur ; elle vérifie le pass,
     pose le cookie (dans le pot de l'app installée) et renvoie vers la page demandée, adresse
     propre. Marche pour les 32 adresses, sans une ligne à changer dans les apps.
     Sécurité : pass vérifié (signature + expiration + révocation) ; `to` = chemin du MÊME hôte
     seulement (jamais une autre adresse) ; le grant admin (`g`) n'est accepté que signé.
     Fail-closed : pass invalide → on renvoie quand même vers la page, sans rien poser. */
  /* Mon laissez-passer, pour le déposer dans une app installée (via /__sso/entrer). Même
     niveau d'exposition que /issue et /login, qui renvoient déjà le pass dans le corps.
     Lisible seulement par une page du domaine (aucun en-tête CORS → un site tiers n'y lit rien). */
  /* Les conditions : le texte (pour l'afficher au même endroit dans chaque app) et, avec une
     session, « déjà acceptées ? ». POST = j'accepte (une fois, pour tout le domaine). */
  if (path === '/__sso/cgu' && request.method === 'GET') {
    const s = await ssoVerify(secret, ssoToken(request));
    const acc = s ? await accGet(env, s.uid) : null;
    return J({ ok: true, version: CGU_VERSION, texte: CGU_TEXTE, acceptees: !!(acc && acc.cgu_at && (acc.cgu_v || 1) >= CGU_VERSION) || !!(s && s.cgu && !acc), session: !!s });
  }
  if (path === '/__sso/cgu' && request.method === 'POST') {
    if (!ssoOriginOk(request.headers.get('origin'), url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    const acc = await accGet(env, s.uid);
    if (!acc || revoked(acc, s)) return J({ ok: false, reason: 'compte introuvable' });
    if (!acc.cgu_at || (acc.cgu_v || 1) < CGU_VERSION) { acc.cgu_at = Date.now(); acc.cgu_v = CGU_VERSION; await accPut(env, acc, true); }
    return J({ ok: true, acceptees: true, version: CGU_VERSION });
  }
  if (path === '/__sso/pass' && request.method === 'GET') {
    const t = ssoToken(request);
    const s = await ssoVerify(secret, t);
    if (!s || revoked(await accGet(env, s.uid), s)) return J({ ok: false });
    const g = adminGrantTok(request);
    return J({ ok: true, token: t, grant: (await grantValide(env, secret, g)) ? g : '' });
  }
  if (path === '/__sso/entrer' && request.method === 'GET') {
    const t = url.searchParams.get('t') || '';
    const g = url.searchParams.get('g') || '';
    let to = url.searchParams.get('to') || '/';
    if (!/^\/(?!\/)/.test(to) || /[\r\n]/.test(to)) to = '/';
    const h = new Headers({ location: to, 'cache-control': 'no-store' });
    const s = await ssoVerify(secret, t);
    if (s && !revoked(await accGet(env, s.uid), s)) {
      h.append('set-cookie', `${SSO_COOKIE}=${t}; Domain=.kd-mc.com; Path=/; Max-Age=${Math.max(60, Math.floor((s.exp - Date.now()) / 1000))}; Secure; HttpOnly; SameSite=Lax`);
    }
    const gs = await grantValide(env, secret, g);
    if (gs) {
      h.append('set-cookie', `kdmc_admin=${g}; Domain=.kd-mc.com; Path=/; Max-Age=${Math.max(60, Math.min(43200, Math.floor((gs.exp - Date.now()) / 1000)))}; Secure; HttpOnly; SameSite=Lax`);   // 12 h, comme /__admin/login
    }
    return new Response(null, { status: 302, headers: h });
  }
  if (path === '/__sso/logout' && request.method === 'POST') {
    return J({ ok: true }, `${SSO_COOKIE}=; Domain=.kd-mc.com; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
  }

  /* ===== Self-service utilisateur : chacun ne voit/gère QUE SES données =====
     (uid pris dans SON token vérifié — jamais un paramètre → aucun accès croisé). */

  /* Ma fiche (Kevin 2026-09-26 : « à la première connexion dans light ou CMCteams, demander
     tous les renseignements, SBM, etc. auto »). La light est ouverte au personnel sans compte
     CMCteams : ses renseignements ne vont PAS dans Firebase (lisible par toute session
     anonyme) mais ICI, dans le dossier de la personne (KV ACCOUNTS), que seul l'admin lit
     (/__admin/accounts). Chacun ne lit et n'écrit QUE sa fiche : uid pris dans SON token. */
  if (path === '/__sso/fiche' && (request.method === 'GET' || request.method === 'POST')) {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    const acc = await accGet(env, s.uid);
    if (revoked(acc, s)) return J({ ok: false, reason: 'session_revoquee' });
    if (request.method === 'GET') return J({ ok: true, fiche: acc?.fiche || {} });
    if (!ssoOriginOk(request.headers.get('origin'), url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    if (!acc) return J({ ok: false, reason: 'compte introuvable' });
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const f = ficheNettoyee(b);
    acc.fiche = { ...acc.fiche, ...f, maj: Date.now(), app: appDe(request.headers.get('host')) };
    await accPut(env, acc, true);
    return J({ ok: true, champs: Object.keys(f) });
  }
  /* Mes appareils (passkeys Face ID) : liste. Session requise. */
  if (path === '/__sso/passkeys' && request.method === 'GET') {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    if (revoked(await accGet(env, s.uid), s)) return J({ ok: false, reason: 'session_revoquee' });
    let list = [];
    if (env && env.ACCOUNTS) { try { list = JSON.parse((await env.ACCOUNTS.get(pkKey(s.uid))) || '[]'); } catch { /* fail-open */ } }
    /* On ne renvoie JAMAIS la clé publique/jwk — juste un aperçu non sensible. */
    const items = list.map((k) => ({ id: String(k.credId || '').slice(0, 12), created: k.created || 0 }));
    return J({ ok: true, passkeys: items, count: items.length });
  }
  /* Supprimer un de MES appareils. Session VÉRIFIÉE requise (tu as prouvé Face ID
     cette session) → un token faible volé ne peut pas retirer tes passkeys.
     Pas de lockout : sans passkey, le login retombe sur nom+code (fail-open). */
  if (path === '/__sso/passkeys/delete' && request.method === 'POST') {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    if (!s.verified) return J({ ok: false, reason: 'Face ID requis pour gérer tes appareils' });
    if (revoked(await accGet(env, s.uid), s)) return J({ ok: false, reason: 'session_revoquee' });
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const id = String(b.id || b.credId || '').trim();
    if (!id || !env || !env.ACCOUNTS) return J({ ok: false, reason: 'id requis' });
    let list = []; try { list = JSON.parse((await env.ACCOUNTS.get(pkKey(s.uid))) || '[]'); } catch { /* */ }
    const next = list.filter((k) => String(k.credId || '').slice(0, 12) !== id && k.credId !== id);
    await env.ACCOUNTS.put(pkKey(s.uid), JSON.stringify(next));
    if (next.length === 0) { const acc = await accGet(env, s.uid); if (acc && acc.passkey) { acc.passkey = false; await accPut(env, acc, true); } }
    return J({ ok: true, removed: list.length - next.length, remaining: next.length });
  }
  /* Mon historique de connexions (le mien uniquement). Session requise. */
  if (path === '/__sso/me/history' && request.method === 'GET') {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    /* SÉCU (Strix vuln-0001, 11/09) : un token FAIBLE se fabrique avec n'importe quel uid
       (/issue est auto-déclaré) → sans cette ligne, quiconque tapait « kdmc_admin » lisait
       les appareils, apps et connexions de Kevin. Lire SON historique exige Face ID prouvé. */
    if (!s.verified) return J({ ok: false, reason: 'Face ID requis pour lire ton historique' });
    /* Lire le dossier CANONIQUE (sinon on afficherait la fiche partielle de l'app
       d'où vient la session, au lieu de l'historique complet de la personne). */
    const acc = await accGet(env, await canonFor(env, s.uid, s.name));
    if (revoked(acc, s)) return J({ ok: false, reason: 'session_revoquee' });
    return J({
      ok: true, uid: s.uid, name: s.name,
      hits: (acc && acc.hits) || 0,
      devices: (acc && acc.devices) || [],
      apps: (acc && acc.apps) || {},
      history: (acc && acc.history) || [],
    });
  }
  /* « Déconnecter mes AUTRES appareils » : je révoque mes sessions puis on émet un
     token frais pour CE device (il reste connecté) → les autres tombent. */
  if (path === '/__sso/me/revoke' && request.method === 'POST') {
    const s = await ssoVerify(secret, ssoToken(request));
    if (!s) return J({ ok: false, reason: 'session requise' });
    /* SÉCU (Strix vuln-0001, 11/09) : avec un token FAIBLE forgé sur « kdmc_admin », n'importe
       qui posait revoked_at sur la fiche de Kevin → TOUTES ses sessions (Face ID comprises)
       tombaient : déconnexion forcée de l'admin par un inconnu. Révoquer exige Face ID prouvé. */
    if (!s.verified) return J({ ok: false, reason: 'Face ID requis pour déconnecter tes appareils' });
    const acc = (await accGet(env, s.uid)) || { uid: s.uid, name: s.name };
    if (revoked(acc, s)) return J({ ok: false, reason: 'session_revoquee' });
    acc.revoked_at = Date.now();
    await accPut(env, acc, true);
    /* token frais pour CE device (iat >= revoked_at → survit ; les autres non) */
    const token = await ssoSign(secret, s.uid, s.name, s.cgu, s.verified);
    const cookie = `${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(token)}; Secure; HttpOnly; SameSite=Lax`;
    return J({ ok: true, token, revoked_at: acc.revoked_at }, cookie);
  }
  return J({ ok: false, reason: 'not_found' });
}

/* ===================== Admin domaine (fiches clients) ===================== */
/* SÉCU : l'identité SSO est AUTO-ASSERTÉE (n'importe qui peut taper le nom
   "Kevin Desarzens" au portail). On NE peut donc PAS accorder l'accès admin
   (fiches clients) sur la seule base du nom. Quand un hash de code admin est
   configuré (env.KDMC_ADMIN_PIN_SHA256 = sha256 du PIN admin), l'accès /__admin/*
   exige un GRANT signé, obtenu en prouvant le code via /__admin/login. Le grant
   voyage en cookie HttpOnly (Safari) ET en header x-kdmc-admin (PWA iOS isolées).
   Fail-open vers l'ancien contrôle par nom UNIQUEMENT si le hash n'est pas encore
   déployé (évite tout verrouillage pendant le rollout). */
function adminGrantTok(request) {
  const h = request.headers.get('x-kdmc-admin') || '';
  const m = h.match(/^(?:Bearer\s+)?(.+)$/i);
  if (m && m[1].trim()) return m[1].trim();
  return ssoCookie(request, 'kdmc_admin');
}
/* LE grant du code admin, vérifié AU MÊME ENDROIT partout (contre-audit 30.09, prouvé : l'enrôlement
   Face ID acceptait encore un grant expiré ou révoqué — de quoi greffer un Face ID sur le compte admin
   et rouvrir tout le reste). Valide = signé, uid admin, moins de 12 h (= Max-Age de son cookie), et émis
   APRÈS le dernier « déconnecter partout » de l'admin. */
const GRANT_TTL_MS = 43200 * 1000;
async function adminRevoque(env, s) {
  for (const u of ADMIN_UIDS) if (revoked(await accGet(env, u), s)) return true;   /* alias compris (kevin-desarzens) */
  return false;
}
async function grantValide(env, secret, tok) {
  const g = tok ? await ssoVerify(secret, tok) : null;
  if (!(g && g.uid === '__kdmc_admin__')) return null;
  if (!(Date.now() - (g.iat || 0) < GRANT_TTL_MS)) return null;
  if (await adminRevoque(env, g)) return null;
  return g;
}

/* ═══ BEE — le caractère, écrit côté serveur (le client ne peut pas le remplacer) ═══ */
const BEE_REGLES = "Réponds court, chaleureuse, enjouée, avec le tutoiement, en français, sans jargon technique (Kevin n'est pas codeur), sans flatterie. "
  + "Tu n'as AUCUN accès aux données de Kevin (planning, messages, fiches, comptes) et tu ne peux agir sur rien : "
  + "ne prétends jamais avoir fait une action, et n'invente jamais une donnée (un horaire, un planning, un chiffre, une adresse web). "
  + "Si tu ne sais pas ou si tu n'es pas sûre, dis-le simplement. Si la demande exige une vraie action, dis que c'est Apex qui peut la faire.";
/* Tu parles TOUJOURS à Kevin (seul lui ouvre Bee), et « Javis » est TON autre nom (Kevin 01.10, capture :
   « Bonjour Javi » → Bee répondait « Bonjour Javi ! », comme si c'était le prénom de Kevin). */
const QUI_PARLE = "Tu parles toujours à Kevin : c'est lui, et lui seul, qui t'écrit. Il t'appelle parfois Javis (ou Javi) : c'est ton autre nom, jamais le sien. ";
export const BEE_CARACTERE = "Tu es Bee, l'assistante personnelle de Kevin sur son domaine kd-mc.com (le même personnage que dans son app Lingua). " + QUI_PARLE + BEE_REGLES;
/* Bourricot (l'âne, 2e mascotte) : MÊMES règles, autre voix. Avant (audit 30.09), le serveur ignorait le
   choix de mascotte et l'âne répondait « Je suis Bee ». Les règles sont écrites UNE fois. */
export const BOURRICOT_CARACTERE = "Tu es Bourricot, l'âne malicieux et bon vivant, assistant personnel de Kevin sur son domaine kd-mc.com (l'autre mascotte, à côté de Bee l'abeille). "
  + "Tu parles toujours à Kevin : c'est lui, et lui seul, qui t'écrit. "
  + BEE_REGLES.replace('chaleureuse, enjouée', 'chaleureux, pince-sans-rire').replace("pas sûre", "pas sûr");
/* La date du jour à Monaco (audit 30.09 : « quel jour on est ? » partait à une IA qui ne la connaît pas). */
function dateMonaco(d) {
  try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Monaco', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d || new Date()); }
  catch (_) { return new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
}
/* COÛT DE BEE (audit complet 30.09, mesuré : 200 questions → 200 appels IA, 0 refus ; sans IA gratuite,
   bascule payante sans limite ; 4 à 7 appels modèle par question ; réponse jusqu'à 36 s alors que le
   widget abandonne à 25 s). Désormais :
     · barrière par minute SANS KV (binding LIMITE_BEE) : une boucle de la page s'arrête net ;
     · les IA GRATUITES d'abord, toujours ; le payant seulement si elles ont toutes échoué, sous un
       plafond du JOUR, et après avoir RÉSERVÉ la dépense (KV qui n'écrit plus → pas de payant) ;
     · le type de question est deviné par mots-clés (0 appel IA), plus de « conseil » : 1 appel par
       question dans le cas normal, Qwen gratuit d'abord (règle Kevin 05.09) ;
     · tout tient dans 22 s. */
const BEE_BUDGET_MS = 22000;
async function handleBeeIa(request, env) {
  const JB = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (request.method !== 'POST') return JB({ ok: false, reason: 'methode' }, 405);
  /* Une autre page du web ne peut pas faire parler Bee au nom de Kevin : JSON obligatoire
     (préflight CORS, auquel on ne répond pas) + Origin, s'il est là, sur le domaine. */
  if (!/^application\/json/i.test(request.headers.get('content-type') || '')) return JB({ ok: false, reason: 'json_requis' }, 415);
  const origine = request.headers.get('origin');
  if (origine && !/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i.test(origine)) return JB({ ok: false, reason: 'hors_domaine' }, 403);
  if (!(await adminSession(request, env))) return JB({ ok: false, reason: 'kevin_seulement' }, 403);
  if (!(await limiteTous(env && env.LIMITE_BEE, 'bee'))) return JB({ ok: false, reason: 'trop_vite' }, 429);
  let b = {}; try { b = await request.json(); } catch (_) { return JB({ ok: false, reason: 'json_invalide' }, 400); }
  /* Tours alternés user/assistant (Gemini et Anthropic l'exigent) : deux tours de suite du même rôle
     sont fusionnés, et la conversation commence par Kevin. */
  const messages = [];
  for (const m of (Array.isArray(b && b.messages) ? b.messages : [])
    .filter((x) => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
    .slice(-10)) {
    const c = m.content.slice(0, 2000), d = messages[messages.length - 1];
    if (d && d.role === m.role) d.content = (d.content + '\n' + c).slice(0, 2000); else messages.push({ role: m.role, content: c });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return JB({ ok: false, reason: 'question_requise' }, 400);
  const caractere = (b && b.mascotte === 'donkey' ? BOURRICOT_CARACTERE : BEE_CARACTERE) + ' Nous sommes le ' + dateMonaco() + ' (heure de Monaco).';
  /* Bee n'agit sur rien : une « action » (planning, déploiement…) n'a pas à réveiller un moteur payant
     juste pour répondre « c'est Apex » → traitée comme une question simple (Qwen d'abord). */
  let domaine = detectDomain(messages[messages.length - 1].content);
  /* Bee n'envoie que du TEXTE : « photo » dans une phrase (« comment prendre une belle photo ? ») ne
     fait pas d'elle une question d'image (audit externe 02.10, mesuré : classée « vision », Qwen était
     exclu et seule Gemini restait). */
  if (domaine === 'admin' || domaine === 'vision') domaine = 'general';
  /* GRATUIT D'ABORD, QUEL QUE SOIT LE TYPE DE QUESTION (contre-audit 30.09, mesuré : un poème ou une
     recherche partait chez Anthropic alors que Qwen marchait, et le ℹ️ disait « d'abord une IA
     gratuite »). Le type de question choisit l'ORDRE parmi les gratuites, puis parmi les payantes. */
  const ordre = planChain(domaine, availableProviders(env), {});
  const gratuites = ordre.filter((p) => FREE_PROVIDERS.indexOf(p) >= 0);
  /* GRATUIT TOUJOURS (Kevin 02.10 : « gratuit tjs ») : le secours payant est ÉTEINT par défaut.
     Il ne se rallume que par l'interrupteur BEE_SECOURS_PAYANT = '1' (bouton ON/OFF, règle Kevin) ;
     sinon, si toutes les gratuites échouent, Bee le dit honnêtement (503) — jamais une facture. */
  const payantes = String(env && env.BEE_SECOURS_PAYANT) === '1' ? ordre.filter((p) => FREE_PROVIDERS.indexOf(p) < 0) : [];
  const fin = Date.now() + BEE_BUDGET_MS;
  const base = { messages, system: caractere, domain: domaine, maxTokens: 500, temperature: 0.7, timeoutMs: 12000 };
  /* on garde 8 s au payant s'il est permis, sinon tout le budget aux gratuites */
  let r = gratuites.length ? await routeText(env, Object.assign({}, base, { chain: gratuites, finMs: payantes.length ? fin - 8000 : fin })) : null;
  if (!(r && r.ok && r.text) && payantes.length && fin - Date.now() > 3000
      && (await sousLePlafondDuJour(env, 'bee-payant', parseInt(env && env.BEE_PLAFOND_PAYANT_JOUR, 10) || 100))
      /* la dépense est RÉSERVÉE (comptée) AVANT de payer : KV qui n'écrit plus → on ne paie pas (leçon #368) */
      && (await compteDepense(env, 'bee-payant'))) {
    r = await routeText(env, Object.assign({}, base, { chain: payantes, finMs: fin }));
  }
  if (!r || !r.ok || !r.text) return JB({ ok: false, reason: 'ia_indisponible' }, 503);
  return JB({ ok: true, text: r.text, provider: r.provider, gratuit: FREE_PROVIDERS.indexOf(r.provider) >= 0 });
}

/* Outils du Cercle : QUI parle (dossier canonique, un compte par personne), et la notification de Kevin.
   L'admin = session Face ID vérifiée de Kevin OU laissez-passer admin (même règle que toutes les portes admin). */
function outilsCercle(env) {
  return {
    qui: async (request) => {
      const secret = env && env.KDMC_SSO_SECRET; if (!secret) return null;
      if (await adminSession(request, env)) return { uid: 'kdmc_admin', nom: 'Admin KDMC', admin: true };
      const s = await ssoVerify(secret, ssoTokenSansAdresse(request));
      if (!s || !s.uid) return null;
      const uid = await canonFor(env, s.uid, s.name, { sansCreer: true });
      if (revoked(await accGet(env, uid), s)) return null;
      return { uid, nom: s.name || '', admin: false };
    },
    notifier: (titre, texte) => notifyPush(env, titre, texte, { tag: 'kdmc-cercle', url: 'https://lingua.kd-mc.com/#admin' }),
  };
}
async function adminSession(request, env) {
  const secret = env && env.KDMC_SSO_SECRET;
  if (!secret) return null;
  const adminHash = env && env.KDMC_ADMIN_PIN_SHA256;
  /* FAIL-CLOSED (leçons #98/#99) : l'identité SSO est AUTO-ASSERTÉE (n'importe qui
     peut taper le nom "Kevin Desarzens"). Le nom seul ne donne donc JAMAIS l'accès
     admin. Sans hash de PIN configuré → aucun accès (au lieu de l'ancien fail-open
     par nom). Le hash est déployé en prod ; un déploiement sans hash FERME l'admin
     plutôt que de l'ouvrir. L'accès exige un GRANT signé prouvé via /__admin/login. */
  if (!adminHash) return null;
  /* 1) GRANT prouvé par le CODE admin (/__admin/login) — cookie kdmc_admin ou header x-kdmc-admin. */
  /* Le grant ne vit pas plus que son cookie (Max-Age 12 h) et « déconnecter partout » le coupe aussi
     (audit complet 30.09, mesuré : un grant restait valable 30 jours, révocation ignorée). */
  if (await grantValide(env, secret, adminGrantTok(request))) return { uid: '__kdmc_admin__', name: 'Admin', grant: true };
  /* 2) Session SSO FORTE (Face ID = verified) d'un UID ADMIN connu. Une session verified
     n'est émise QUE par le flux WebAuthn (passkey), et un passkey ne peut être GREFFÉ sur
     un uid admin qu'après bootstrap + preuve du code pour tout appareil suivant (voir
     enrôlement, leçon #99) → « verified + uid∈ADMIN_UIDS » = Kevin, même confiance que
     whoami admin:true. Jeton via header x-kdmc-sso (PWA iOS = cookies isolés) OU cookie
     kdmc_sso (Safari). Permet le Face ID sur bot.kd-mc.com sans retaper le code. */
  /* (27.09.2026) Les MÊMES canaux que whoami (Bearer, x-kdmc-sso, ?t=, cookie) : une app installée qui
     n'a que son pass en localStorage et l'envoie en Bearer était traitée comme inconnue → « code admin ». */
  /* JAMAIS par l'adresse (?t=) pour une porte ADMIN (plan audit Bee 27.09) : une adresse fuit par
     l'historique, les journaux et l'en-tête Referer. En-tête ou cookie seulement. */
  const ssoRaw = (request.headers.get('x-kdmc-sso') || '').replace(/^Bearer\s+/i, '').trim() || ssoTokenSansAdresse(request);
  if (ssoRaw) {
    const s = await ssoVerify(secret, ssoRaw);
    /* « Déconnecter partout » doit AUSSI couper l'admin (contre-audit Bee 27.09, mesuré : un jeton de
       Kevin révoqué — whoami répondait « session_revoquee » — ouvrait encore Bee, /__demandes et
       /__admin/accounts). Même règle que whoami : un jeton émis avant la révocation ne vaut plus rien. */
    if (s && s.verified && ADMIN_UIDS.indexOf(s.uid) >= 0 && !(await adminRevoque(env, s))) return { uid: s.uid, name: s.name, faceid: true };
  }
  return null;
}
async function handleAdmin(request, url, env) {
  /* `domain-log` est le SEUL endpoint admin lu depuis un autre sous-domaine
     (admin.kd-mc.com) : son préflight a besoin des en-têtes CORS, donc il ne doit
     PAS être avalé par ce 204 générique — sinon le navigateur bloque la lecture et
     la page « Qui se connecte » reste vide sans le moindre message (bug attrapé par
     domain-log.test.mjs avant la mise en ligne). */
  if (request.method === 'OPTIONS' && url.pathname !== '/__admin/domain-log') return new Response(null, { status: 204 });
  const secret = env && env.KDMC_SSO_SECRET;
  const path = url.pathname;
  /* Login admin (preuve du code) — AVANT le gate, sinon poule-œuf. */
  if (path === '/__admin/login' && request.method === 'POST') {
    const adminHash = env && env.KDMC_ADMIN_PIN_SHA256;
    if (!secret || !adminHash) return J({ ok: false, reason: 'admin_pin_not_configured' });
    const ipHash = await sha256Hex((request.headers.get('CF-Connecting-IP') || '') + '|kdmc-al');
    /* FERMÉ EN CAS DE DOUTE (audit du domaine 27.09, P1) : si le registre des essais est illisible,
       on refuse d'essayer un code plutôt que de laisser deviner sans limite. */
    let wait = 0;
    try { if (env.ACCOUNTS) { await env.ACCOUNTS.get('al:' + ipHash); } wait = await rlBlocked(env, ipHash); }
    catch { return J({ ok: false, reason: 'rate_limited', wait: 900 }, undefined, 429); }
    if (wait) return J({ ok: false, reason: 'rate_limited', wait });
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const code = String(b.code || '').trim();
    /* Accepte le CODE (sha256(code)===secret) OU directement le HASH (=== secret).
       Le hash est déjà l'équivalent porteur du PIN dans ce système (header x-apex-pin,
       leçon #95) : il déverrouille déjà l'IA (capacité plus sensible), donc l'accepter
       pour émettre le grant mail/sauvegarde n'ouvre aucune faille — et un hash 64-hex est
       plus dur à forcer qu'un PIN à 6 chiffres. → une app qui a déjà le hash (Finances)
       obtient le grant SANS redemander le code (« à la connexion ensuite plus besoin »). */
    const hash = String(b.hash || '').trim().toLowerCase();
    if (!code && !hash) return J({ ok: false, reason: 'code_requis' });
    const okHash = !!hash && hash === String(adminHash).toLowerCase();
    const okCode = !!code && (await sha256Hex(code)) === adminHash;
    if (!okHash && !okCode) { await rlFail(env, ipHash); await audLog(env, { ev: 'admin_login_fail', ip: ipHash.slice(0, 12) }); return J({ ok: false, reason: 'code_invalide' }); }
    await rlReset(env, ipHash);
    await audLog(env, { ev: 'admin_login_ok', ip: ipHash.slice(0, 12) });
    const grant = await ssoSign(secret, '__kdmc_admin__', 'admin', 1);
    const cookie = `kdmc_admin=${grant}; Domain=.kd-mc.com; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Lax`;
    /* RECONNU PAR N'IMPORTE QUEL CHEMIN (Kevin 2026-09-27 : « domaine, chaque app, internet, bureau »).
       Le code admin prouvé = c'est Kevin. Sur un appareil sans Face ID synchronisé (le PC, un
       navigateur neuf), la seule preuve d'identité forte possible est ce code : on émet donc AUSSI
       la session VÉRIFIÉE de l'admin (v=1), celle que toutes les apps reconnaissent — au lieu de le
       laisser avec une session « auto-déclarée » que rien ne distingue d'un inconnu. Une session
       vérifiée déjà présente est conservée telle quelle. Le pass revient dans le corps pour les apps
       installées (cookie isolé) ; le portail le dépose via /__sso/entrer. */
    const dejaVerifiee = await ssoVerify(secret, ssoToken(request));
    let token = (dejaVerifiee && dejaVerifiee.verified && ADMIN_UIDS.indexOf(dejaVerifiee.uid) >= 0) ? ssoToken(request) : '';
    const cookies = [cookie];
    if (!token) {
      const accA = await accGet(env, CANON_UID);
      const nomA = (accA && accA.name) || 'Kevin Desarzens';
      await enrich(env, request, CANON_UID, nomA, true, undefined, {});
      token = await ssoSign(secret, CANON_UID, nomA, true, true);
      cookies.push(`${SSO_COOKIE}=${token}; Domain=.kd-mc.com; Path=/; Max-Age=${maxAgeDe(token)}; Secure; HttpOnly; SameSite=Lax`);
    }
    return J({ ok: true, grant, token, uid: CANON_UID, admin: true, verified: true }, cookies);
  }
  /* LE GRANT SANS CODE (Kevin 27.09 : « moi tout s'ouvre automatiquement : fiches privées, chaque app,
     domaine ») : une session VÉRIFIÉE de l'admin (Face ID ou code admin déjà prouvé) vaut le code. Les
     apps qui gardaient un grant (fiches privées, admin, écritures boutiques, bot, arbre, finances)
     l'obtiennent ici sans rien demander ; le code admin ne reste que pour un appareil que le domaine
     ne connaît pas. GET ou POST, tous canaux (Bearer, x-kdmc-sso, cookie). */
  if (path === '/__admin/grant' && (request.method === 'GET' || request.method === 'POST')) {
    const me = await adminSession(request, env);
    if (!me) return J({ ok: false, reason: 'need_admin_code' }, undefined, 403);
    const grant = me.grant ? adminGrantTok(request) : await ssoSign(secret, '__kdmc_admin__', 'admin', 1);
    const cookie = `kdmc_admin=${grant}; Domain=.kd-mc.com; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Lax`;
    if (!me.grant) await audLog(env, { ev: 'admin_grant_session', uid: me.uid });
    return J({ ok: true, grant, via: me.grant ? 'grant' : 'session' }, cookie);
  }
  if (path === '/__admin/logout' && request.method === 'POST') {
    return J({ ok: true }, 'kdmc_admin=; Domain=.kd-mc.com; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
  }

  /* « Qui se connecte » (admin.kd-mc.com) — SOURCE UNIQUE des connexions du domaine.
     Le journal des connexions existe DÉJÀ ici (KV ACCOUNTS : hits, history[], devices,
     places, apps). Kevin 2026-08-05 : « enlève ça et intègre le dedans » → plutôt qu'un
     2e journal en parallèle (doublon interdit par « zéro doublon, source unique »), la
     page admin lit CETTE donnée — la vraie, déjà peuplée (191 connexions).
     AUTH PAR EN-TÊTE, pas par cookie : `x-apex-pin` = sha256(code admin), déjà équivalent
     -porteur ailleurs (leçon #95 ; /__admin/login l'accepte tel quel). Sans cookie → aucune
     autorité ambiante → AUCUNE surface CSRF ajoutée (en-tête personnalisé = préflight
     obligatoire, non forgeable par un site tiers). CORS limité à admin.kd-mc.com. Lecture seule. */
  if (path === '/__admin/domain-log' && (request.method === 'GET' || request.method === 'OPTIONS')) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origin === 'https://admin.kd-mc.com' ? origin : 'https://admin.kd-mc.com',
      'Access-Control-Allow-Credentials': 'true',   /* (27.09) la session vérifiée de Kevin suffit, plus besoin de retaper le code */
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'x-apex-pin',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const jc = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, cors) });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const expected = env && env.KDMC_ADMIN_PIN_SHA256;
    const given = request.headers.get('x-apex-pin') || '';
    /* Comparaison en temps constant + fail-closed si le code n'est pas configuré. */
    let same = !!expected && given.length === expected.length;
    if (same) { let d = 0; for (let i = 0; i < expected.length; i++) d |= expected.charCodeAt(i) ^ given.charCodeAt(i); same = d === 0; }
    /* (27.09.2026) OU la session VÉRIFIÉE de l'admin (Face ID / code admin déjà prouvé au domaine) :
       Kevin ne retape pas son code sur la page « Qui se connecte ». Lecture seule, réponse lisible
       par admin.kd-mc.com seulement (CORS) → aucune surface CSRF utile. */
    if (!same) { const s = await ssoVerify(secret, ssoTokenSansAdresse(request)); same = !!(s && s.verified && ADMIN_UIDS.indexOf(s.uid) >= 0 && !revoked(await accGet(env, s.uid), s)); }
    if (!same) return jc({ ok: false, reason: 'unauthorized' }, 401);
    if (!env.ACCOUNTS) return jc({ ok: true, people: [], kv: false });
    const idx = JSON.parse((await env.ACCOUNTS.get('idx:uids')) || '[]');
    /* Les fiches FUSIONNÉES ne sont que des renvois → jamais listées comme personnes
       (sinon les doublons que Kevin veut supprimer réapparaîtraient dans la page). */
    const accs = (await Promise.all(idx.slice(-500).map((uid) => accGet(env, uid))))
      .filter(Boolean).filter((a) => !a.merged_into);
    /* Projection MINIMALE (RGPD : le nécessaire — ni e-mail, ni jeton, ni contenu privé). */
    const people = accs.map((a) => ({
      uid: a.uid, name: a.name || '', hits: a.hits || 0, lastSeen: a.last_seen || 0,
      devices: (a.devices || []).slice(0, 8), places: (a.places || []).slice(0, 8),
      apps: a.apps || {}, history: (a.history || []).slice(0, 80),
      /* Renseignements fins (dernier état) : appareil complet, opérateur, VPN,
         fuseau, géo approximative, 1re fois, anomalie de déplacement détectée. */
      device: a.last_device || '', isp: a.last_isp || '', vpn: !!a.last_vpn,
      tz: a.last_tz || '', geo: a.last_geo || null, place: a.last_place || '',
      lastApp: a.last_app || '', created: a.created || 0, cguAt: a.cgu_at || 0,
      anomaly: a.anomaly || null,
      /* Renseignements réseau/entrée + rythme + appareil déclaré par l'app. */
      lang: a.last_lang || '', net: a.last_net || null, from: a.last_from || '',
      path: a.last_path || '', hours: a.hours || null, ua: a.last_ua || null,
      aliases: a.aliases || [], passkey: !!a.passkey,
    })).sort((x, y) => (y.lastSeen || 0) - (x.lastSeen || 0));
    /* 👣 LES PASSAGES ANONYMES — « personne ne doit entrer sans être fiché ».
       Un visiteur sans session ne peut pas être NOMMÉ (et on ne cherche pas à le
       nommer : on ne garde ni son adresse IP ni rien de personnel). Mais son
       passage ne doit plus être INVISIBLE : on le compte, par app et par jour.
       Avant, cette activité-là n'apparaissait nulle part — la page laissait croire
       qu'il ne se passait rien sur les apps publiques. 14 jours suffisent à voir
       une tendance sans alourdir la lecture. */
    const anonymes = {};
    try {
      const j0 = Date.now();
      for (let i = 0; i < 14; i++) {
        const jour = new Date(j0 - i * 86400000).toISOString().slice(0, 10);
        const lot = await env.ACCOUNTS.list({ prefix: 'anon:' + jour + ':', limit: 200 });
        for (const k of (lot.keys || [])) {
          const app = String(k.name).split(':').slice(2).join(':');
          const n = parseInt((await env.ACCOUNTS.get(k.name)) || '0', 10) || 0;
          if (!n) continue;
          anonymes[app] = anonymes[app] || { total: 0, jours: {} };
          anonymes[app].total += n; anonymes[app].jours[jour] = n;
        }
      }
    } catch (_) { /* le compteur anonyme ne doit jamais empêcher la lecture des personnes */ }
    return jc({ ok: true, people, count: people.length, anonymes, ts: Date.now() });
  }

  const me = await adminSession(request, env);
  if (!me) {
    const needCode = !!(env && env.KDMC_ADMIN_PIN_SHA256);
    return new Response(JSON.stringify({ ok: false, reason: needCode ? 'need_admin_code' : 'admin_only' }), { status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (path === '/__admin/accounts' && request.method === 'GET') {
    if (!env.ACCOUNTS) return J({ ok: true, accounts: [], kv: false });
    const idx = JSON.parse((await env.ACCOUNTS.get('idx:uids')) || '[]');
    /* PERF : lectures KV en PARALLÈLE (avant : boucle `await` séquentielle → ~5 s
       pour 500 fiches, re-tirée toutes les 25 s par l'admin). ?limit= borne. */
    const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '500', 10) || 500));
    const accounts = (await Promise.all(idx.slice(-lim).map((uid) => accGet(env, uid)))).filter(Boolean);
    accounts.sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
    return J({ ok: true, accounts, kv: true, count: accounts.length });
  }
  /* Journal d'audit admin : connexions admin ok/échec, déconnexions forcées,
     nouveaux appareils, mints Firebase. FIFO 200 en KV. */
  if (path === '/__admin/audit' && request.method === 'GET') {
    if (!env.ACCOUNTS) return J({ ok: true, log: [] });
    let log = []; try { log = JSON.parse((await env.ACCOUNTS.get('aud:log')) || '[]'); } catch { /* fail-open */ }
    return J({ ok: true, log });
  }
  /* « Déconnecter partout » : révoque toutes les sessions ÉMISES d'un compte
     (perte/vol d'appareil). Le compte reste intact : une reconnexion (Face ID ou
     nom+code) émet un token frais (iat > revoked_at) qui marche normalement. */
  if (path === '/__admin/revoke' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const uid = String(b.uid || '').slice(0, 80).trim();
    if (!uid) return J({ ok: false, reason: 'uid requis' });
    const acc = await accGet(env, uid);
    if (!acc) return J({ ok: false, reason: 'not_found' });
    acc.revoked_at = Date.now();
    await accPut(env, acc, true);
    await audLog(env, { ev: 'revoke_sessions', uid });
    return J({ ok: true, uid, revoked_at: acc.revoked_at });
  }
  /* ── PÉRIMÈTRE : qui a le droit d'exister dans quelle app (Kevin 2026-09-15) ──
     GET  ?uid=…                       → l'état de cette personne + la liste des apps
     POST {uid, portee, acces, bloque} → range la personne
     Derrière le MÊME portail admin que le reste (`me` = grant du code admin prouvé
     via /__admin/login, ou session Face ID d'un uid admin). Aucun second mot de
     passe inventé pour l'occasion : un secret par app est un secret qu'on oublie
     de changer.  */
  if (path === '/__admin/acces' && request.method === 'GET') {
    const uid = url.searchParams.get('uid') || '';
    const apps = [...new Set(Object.values(APPS))].sort();
    if (!uid) return J({ ok: true, apps });
    const a = await accGet(env, uid);
    if (!a) return J({ ok: false, reason: 'not_found', apps });
    return J({
      ok: true, uid, name: a.name || '', apps,
      portee: a.portee === 'app' ? 'app' : 'domaine',
      acces: Array.isArray(a.acces) ? a.acces : [],
      bloque: Array.isArray(a.bloque) ? a.bloque : [],
      /* Par où elle est réellement passée — pour ouvrir en connaissance de cause
         au lieu de deviner. */
      vues: Object.keys(a.apps || {}).map(appDe).filter(Boolean),
    });
  }
  if (path === '/__admin/acces' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* corps vide */ }
    const uid = String(b.uid || '').slice(0, 80).trim();
    if (!uid) return J({ ok: false, reason: 'uid requis' });
    const acc = await accGet(env, uid);
    if (!acc) return J({ ok: false, reason: 'not_found' });
    /* On n'accepte QUE des clés d'app connues : une valeur libre créerait un accès
       vers une app qui n'existe pas (et un « blocage » qui ne bloque rien). */
    const connues = new Set(Object.values(APPS));
    const propre = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x || '').trim()))]
      .filter((x) => connues.has(x)).slice(0, 40);
    if (b.portee !== undefined) acc.portee = b.portee === 'app' ? 'app' : 'domaine';
    if (b.acces !== undefined) acc.acces = propre(b.acces);
    if (b.bloque !== undefined) acc.bloque = propre(b.bloque);
    /* Garde-fou : enfermer quelqu'un dans « une app » sans dire LAQUELLE le met
       dehors de partout, en silence. On refuse plutôt que de le faire à moitié. */
    if (acc.portee === 'app' && (!acc.acces || !acc.acces.length)) {
      return J({ ok: false, reason: 'portée « une app » sans aucune app choisie — la personne n\'aurait accès à rien' });
    }
    acc.acces_at = Date.now();
    await accPut(env, acc, true);
    await audLog(env, { ev: 'perimetre', uid, portee: acc.portee, acces: acc.acces, bloque: acc.bloque });
    return J({ ok: true, uid, portee: acc.portee, acces: acc.acces || [], bloque: acc.bloque || [] });
  }
  /* Code oublié : l'admin efface le code enregistré au domaine ; la personne en choisit un
     nouveau à sa prochaine connexion depuis son appareil (ou en recréant son compte). */
  if (path === '/__admin/code' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* corps vide */ }
    const uid = String(b.uid || '').slice(0, 80).trim();
    if (!uid) return J({ ok: false, reason: 'uid requis' });
    try { await env.ACCOUNTS.delete('cred:' + uid); await env.ACCOUNTS.delete('rlc:' + uid); } catch { return J({ ok: false, reason: 'registre indisponible' }); }
    await audLog(env, { ev: 'code_efface', uid });
    return J({ ok: true, uid });
  }
  if (path === '/__admin/account' && request.method === 'GET') {
    const uid = url.searchParams.get('uid') || '';
    const a = await accGet(env, uid);
    return a ? J({ ok: true, account: a }) : J({ ok: false, reason: 'not_found' });
  }
  if (path === '/__admin/me' && request.method === 'GET') {
    return J({ ok: true, uid: me.uid, name: me.name });
  }
  /* Lockdown shops (custom-token par rôle) : derrière le GRANT admin (prouvé via
     /__admin/login = PIN sha256), mint un id_token Firebase role:admin pour que les
     écritures shops_admin_v1/(products|logos) + shops_sourcing_v1/selection exigent
     auth.token.role==='admin'. FAIL-SAFE si secrets FB absents (client fail-open). */
  if (path === '/__admin/fbtoken' && request.method === 'POST') { // POST-only (durcissement audit P2-d : réduit la surface CSRF via cookie SameSite=Lax sur GET)
    const out = await mintShopsAdminIdToken(env);
    if (out.ok) await audLog(env, { ev: 'fbtoken_mint' });
    return out.ok ? J(out) : J(out, null, 503);
  }
  return J({ ok: false, reason: 'not_found' });
}

/* ===================== Crypto-bot Railway (bot.kd-mc.com) ===================== */
/* Tableau de bord du bot de trading (service Railway "crypto-bot").
   SÉCU : réservé admin — MÊME grant signé que /__admin (fail-closed, leçons #98/#99).
   Le RAILWAY_TOKEN (secret worker, posé par deploy-kdmc-router.yml) ne quitte JAMAIS
   le worker ; la page ne reçoit que du JSON déjà filtré.
   Erreurs : cause EXACTE relayée dans `detail` (règle "détailler les erreurs"). */
const BOT_SERVICE_NAME = 'crypto-bot';
async function railGql(env, query) {
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Project-Access-Token': env.RAILWAY_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  let j = null; try { j = await r.json(); } catch { /* corps non-JSON */ }
  return { http: r.status, j };
}

/* ===== IA PILOTE des robots PAPIER (Kevin 2026-10-02) — orchestration =====
   La logique (liste blanche, arbitre, lecteurs de marché, prompt) vit dans bot-ia.js, testée sans
   réseau (bot-ia.test.mjs). Ici : les appels réels (Railway, sources de marché, IA gratuite, KV).
   Réveil toutes les 2 h par le cron de kdmc-outlook (Service Binding ROUTER, clé DÉRIVÉE du secret
   admin — le secret ne circule jamais) : le compte Cloudflare est déjà à 5 crons sur 5 (gratuit).
   UNE écriture KV par réveil au plus (« bot:ia ») ; le marché passe par le cache, zéro écriture. */
const IA_KV = 'bot:ia';
const IA_CHAINE_GRATUITE = ['qwen', 'gemini', 'groq', 'cerebras', 'mistral', 'openrouter'];
const IA_CONTRE_AVIS_MODELE = '@cf/openai/gpt-oss-120b';
/* MÉMOIRE DE L'IA EN D1 (base gratuite kdmc-bot, 100 000 écritures/jour) — 2.10.2026 : le KV du
   domaine (1 000 écritures/jour) a saturé deux fois ce jour-là. D1 d'abord ; sans base liée, le KV
   comme avant. La base est AUSSI lisible par l'agent (Cloudflare MCP) : le journal se vérifie en vrai
   sans robot GitHub (règle crypto : jamais sur GitHub Actions) ni Face ID. */
let botDbPret = false;
async function botDb(env) {
  const db = env && env.BOT_DB;
  if (!db || typeof db.prepare !== 'function') return null;
  if (!botDbPret) {
    await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS etat (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS reveils (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, origine TEXT, action TEXT, detail TEXT, sources TEXT)'),
      db.prepare('CREATE TABLE IF NOT EXISTS releves (t INTEGER NOT NULL, nom TEXT NOT NULL, e REAL, n REAL, a INTEGER, v INTEGER, btc REAL, PRIMARY KEY (t, nom))'),
    ]);
    botDbPret = true;
  }
  return db;
}
async function iaEtat(env) {
  let st = null;
  try {
    const db = await botDb(env);
    if (db) { const row = await db.prepare('SELECT v FROM etat WHERE k = ?1').bind('ia').first(); if (row) st = JSON.parse(row.v); }
  } catch { st = null; }
  if (!st) { try { st = JSON.parse((await env.ACCOUNTS.get(IA_KV)) || 'null'); } catch { st = null; } }   // reprise de l'état d'avant D1
  return Object.assign({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0, dernierTick: 0, dernier: '' }, st || {});
}
/* Lève une erreur si l'écriture échoue : iaTick en dépend (« enregistrer d'abord, agir ensuite »). */
async function iaEcrire(env, st) {
  const db = await botDb(env);
  if (db) { await db.prepare('INSERT INTO etat (k, v, t) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v = excluded.v, t = excluded.t').bind('ia', JSON.stringify(st), Date.now()).run(); return; }
  await env.ACCOUNTS.put(IA_KV, JSON.stringify(st));
}
/* Une ligne par réveil : ce que l'IA a fait ET l'état de chaque source de marché. Garde 2 000 lignes. Fail-open. */
async function iaJournaliserReveil(env, origine, res) {
  try {
    const db = await botDb(env); if (!db) return;
    let sources = null; try { sources = (await botMarche(env)).sources || null; } catch { /* */ }
    const t = Date.now();
    await db.batch([
      db.prepare('INSERT INTO reveils (t, origine, action, detail, sources) VALUES (?1, ?2, ?3, ?4, ?5)').bind(t, origine, String((res && res.action) || ''), String((res && res.detail) || '').slice(0, 600), sources ? JSON.stringify(sources) : null),
      db.prepare('DELETE FROM reveils WHERE id <= (SELECT MAX(id) FROM reveils) - 2000'),
    ]);
  } catch { /* le journal de vérification ne bloque jamais l'IA */ }
}
async function iaTickJournalise(env, ctx, origine, force) {
  let res;
  try { res = await iaTick(env, ctx, origine, force); } catch (e) { res = { ok: false, action: 'erreur', detail: String((e && e.message) || e).slice(0, 300) }; }
  await iaJournaliserReveil(env, origine, res);
  return res;
}
/* Relevé des robots pour le passage au réel : D1 (1 par heure au plus), sinon l'ancien relevé KV. */
async function botReleverD1(env, bots, now, btc) {
  const db = await botDb(env).catch(() => null);
  if (!db) return botSnapshot(env, bots, now, btc);
  try {
    const der = await db.prepare('SELECT MAX(t) AS t FROM releves').first();
    if (der && der.t && now - Number(der.t) < BOT_SNAP_MS) return;
    const lignes = (bots || []).filter((x) => x && x.name && x.equity != null && isFinite(Number(x.equity)));
    if (!lignes.length) return;
    await db.batch(lignes.map((x) => db.prepare('INSERT OR IGNORE INTO releves (t, nom, e, n, a, v, btc) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(now, x.name, Math.round(Number(x.equity) * 100) / 100, Number(x.net) || 0, Number(x.buys) || 0, Number(x.sells) || 0, Number(btc) > 0 ? Number(btc) : null)));
  } catch { /* fail-open */ }
}
/* Historique pour /__bot/reel : relevés KV d'avant + relevés D1, triés, au format de bot:hist. */
async function botHistComplet(env) {
  let hist = []; try { hist = JSON.parse((await env.ACCOUNTS.get('bot:hist')) || '[]'); } catch { hist = []; }
  try {
    const db = await botDb(env);
    if (db) {
      const r = await db.prepare('SELECT t, nom, e, n, a, v, btc FROM releves ORDER BY t').all();
      const parT = new Map();
      for (const l of (r && r.results) || []) {
        if (!parT.has(l.t)) parT.set(l.t, { t: l.t, b: {} });
        const p = parT.get(l.t); p.b[l.nom] = { e: l.e, n: l.n, a: l.a, v: l.v }; if (l.btc) p.btc = l.btc;
      }
      hist = hist.concat([...parT.values()]).sort((x, y) => x.t - y.t);
    }
  } catch { /* KV seul */ }
  return hist;
}
async function iaCleReveil(env) {
  const base = env && env.KDMC_ADMIN_PIN_SHA256;
  if (!base) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base + ':bot-ia-tick'));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function egalTempsConstant(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/* Stats de flotte (même calcul que /__bot/fleet, factorisé pour l'IA). */
async function botFleetStats(env, ctx, names) {
  return Promise.all(names.map(async (name) => {
    const svc = (ctx.services || []).find((s) => s.name === name);
    if (!svc) return { name, status: 'absent' };
    const dp = await railGql(env, `query { deployments(first: 1, input: { projectId: "${ctx.projectId}", serviceId: "${svc.id}", environmentId: "${ctx.environmentId}" }) { edges { node { id status createdAt } } } }`);
    const node = ((((dp.j || {}).data || {}).deployments || { edges: [] }).edges[0] || {}).node;
    if (!node) return { name, svcId: svc.id, status: 'aucun_deploiement' };
    const rl = await railGql(env, `query { deploymentLogs(deploymentId: "${node.id}", limit: 1000) { message } }`);
    const logs = (((rl.j || {}).data || {}).deploymentLogs || []);
    const st = fleetTradeStats(logs);
    let equity = null;
    for (let i = logs.length - 1; i >= 0; i--) {
      const m = String(logs[i].message || '').match(/equity=([0-9.]+)/);
      if (m) { equity = Number(m[1]); break; }
    }
    return Object.assign({ name, svcId: svc.id, depl: node.id, status: node.status, equity }, st);
  }));
}
async function botVarsVisibles(env, ctx, svcId) {
  const vq = await railGql(env, `query { variables(projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${svcId}") }`);
  return IA.reglagesVisibles(((vq.j || {}).data || {}).variables || {});
}
/* Applique des réglages DÉJÀ validés (liste blanche) à UN robot papier, puis le relance.
   Dernier verrou : même ici, une clé hors liste blanche ou interdite est refusée. */
async function botAppliquer(env, ctx, svcId, set) {
  for (const [name, value] of Object.entries(set)) {
    if (!IA.REGLAGES_IA[name] || IA.INTERDITS.test(name)) return { ok: false, err: 'réglage refusé au dernier verrou : ' + name };
    const up = value === null
      ? await railGql(env, `mutation { variableDelete(input: { projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${svcId}", name: "${name}" }) }`)
      : await railGql(env, `mutation { variableUpsert(input: { projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${svcId}", name: "${name}", value: ${JSON.stringify(String(value))} }) }`);
    if (!up.j || up.j.errors) return { ok: false, err: name + ' : ' + JSON.stringify((up.j && up.j.errors) || up.http).slice(0, 160) };
  }
  const rd = await railGql(env, `mutation { serviceInstanceRedeploy(environmentId: "${ctx.environmentId}", serviceId: "${svcId}") }`);
  if (!rd.j || rd.j.errors) return { ok: false, err: 'relance : ' + JSON.stringify((rd.j && rd.j.errors) || rd.http).slice(0, 160) };
  return { ok: true };
}
/* MARCHÉS EN DIRECT — sources publiques, sans clé ; chaque source dit si elle a répondu. */
const BOURSE_NOMS = { '^SPX': 'S&P 500', '^NDQ': 'Nasdaq', '^DAX': 'DAX', '^CAC': 'CAC 40', 'XAUUSD': 'Or', 'EURUSD': 'EUR/USD' };
async function lireSource(url, type) {
  try {
    const r = await fetch(url, { headers: { 'accept': type === 'json' ? 'application/json' : '*/*', 'user-agent': 'Mozilla/5.0 (kd-mc.com tableau de bord)' }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 120 } });
    if (!r.ok) return { err: 'HTTP ' + r.status };
    return { val: type === 'json' ? await r.json() : await r.text() };
  } catch (e) { return { err: String((e && e.message) || e).slice(0, 60) }; }
}
async function botMarche(env, sansCache) {
  const cle = new Request('https://bot.kd-mc.com/__cache/marche-v1');
  const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
  if (cache && !sansCache) { try { const c = await cache.match(cle); if (c) return await c.json(); } catch { /* */ } }
  const paires = encodeURIComponent(JSON.stringify(IA.PAIRES_LIQUIDES.map((p) => p.replace('/', ''))));
  const [fg, gl, bn, okx, sq, ct, jdc, cd] = await Promise.all([
    lireSource('https://api.alternative.me/fng/?limit=2', 'json'),
    lireSource('https://api.coingecko.com/api/v3/global', 'json'),
    lireSource('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + paires, 'json'),
    lireSource('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP', 'json'),
    lireSource('https://stooq.com/q/l/?s=%5Espx+%5Endq+%5Edax+%5Ecac+xauusd+eurusd&f=sd2t2ohlcv&h&e=csv', 'texte'),
    lireSource('https://cointelegraph.com/rss', 'texte'),
    lireSource('https://journalducoin.com/feed/', 'texte'),
    lireSource('https://www.coindesk.com/arc/outboundfeeds/rss/', 'texte'),
  ]);
  const etat = (x, ok) => (x.err ? x.err : (ok ? 'ok' : 'format inattendu'));
  const m = { le: Date.now() };
  m.peur_avidite = fg.val ? IA.lireFearGreed(fg.val) : null;
  m.global = gl.val ? IA.lireCoingeckoGlobal(gl.val) : null;
  m.cryptos = bn.val ? IA.lireBinance24h(bn.val) : null;
  m.funding_btc = okx.val ? IA.lireFundingOkx(okx.val) : null;
  const bourse = sq.val ? IA.lireStooqCsv(sq.val) : null;
  m.bourse = bourse ? bourse.map((b) => Object.assign({ nom: BOURSE_NOMS[String(b.symbole).toUpperCase()] || b.symbole }, b)) : null;
  const actus = [];
  for (const [src, x] of [['Cointelegraph', ct], ['Journal du Coin', jdc], ['CoinDesk', cd]]) {
    if (x.val) IA.lireRss(x.val, 4).forEach((a) => actus.push(Object.assign({ source: src }, a)));
  }
  m.actus = actus;
  m.sources = {
    'Peur & avidité (alternative.me)': etat(fg, !!m.peur_avidite), 'Marché global (CoinGecko)': etat(gl, !!m.global),
    'Prix 24 h (Binance)': etat(bn, !!(m.cryptos && m.cryptos.length)), 'Financement BTC (OKX)': etat(okx, m.funding_btc !== null),
    'Bourse (Stooq)': etat(sq, !!(m.bourse && m.bourse.length)), 'Actus Cointelegraph': etat(ct, true),
    'Actus Journal du Coin': etat(jdc, true), 'Actus CoinDesk': etat(cd, true),
  };
  if (cache) { try { await cache.put(cle, new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' } })); } catch { /* */ } }
  return m;
}
/* LIENS D'ANALYSE — vérifiés EN DIRECT depuis Cloudflare (règle « vérifie tes liens en réel ») :
   ✅ s'ouvre ; 🛡️ le site refuse les robots (401/403/429) mais s'ouvre sur un iPhone ; ❌ mort. */
const LIENS_ANALYSE = [
  ['Crypto', 'TradingView — marchés crypto', 'https://www.tradingview.com/markets/cryptocurrencies/'],
  ['Crypto', 'CoinGlass — liquidations & financement', 'https://www.coinglass.com/'],
  ['Crypto', 'CoinMarketCap', 'https://coinmarketcap.com/'],
  ['Crypto', 'CoinGecko', 'https://www.coingecko.com/'],
  ['Crypto', 'Indice peur & avidité', 'https://alternative.me/crypto/fear-and-greed-index/'],
  ['Crypto', 'DefiLlama — DeFi & stablecoins', 'https://defillama.com/'],
  ['Crypto', 'Glassnode Studio — on-chain', 'https://studio.glassnode.com/'],
  ['Crypto', 'CryptoQuant — flux des plateformes', 'https://cryptoquant.com/'],
  ['Crypto', 'Whale Alert — gros transferts', 'https://whale-alert.io/'],
  ['Crypto', 'Mempool — réseau Bitcoin', 'https://mempool.space/'],
  ['Bourse', 'TradingView — carte des actions', 'https://www.tradingview.com/heatmap/stock/'],
  ['Bourse', 'Finviz — carte du S&P 500', 'https://finviz.com/map.ashx'],
  ['Bourse', 'Calendrier économique (Investing)', 'https://fr.investing.com/economic-calendar/'],
  ['Bourse', 'Boursorama — bourse', 'https://www.boursorama.com/bourse/'],
  ['Bourse', 'Yahoo Finance', 'https://finance.yahoo.com/'],
  ['Bourse', 'FRED — taux et macro', 'https://fred.stlouisfed.org/'],
  ['Actus', 'Cointelegraph (français)', 'https://fr.cointelegraph.com/'],
  ['Actus', 'Journal du Coin', 'https://journalducoin.com/'],
  ['Actus', 'CoinDesk', 'https://www.coindesk.com/'],
];
async function botLiens() {
  const cle = new Request('https://bot.kd-mc.com/__cache/liens-v1');
  const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
  if (cache) { try { const c = await cache.match(cle); if (c) return await c.json(); } catch { /* */ } }
  const out = await Promise.all(LIENS_ANALYSE.map(async ([cat, nom, url]) => {
    let code = 0;
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, signal: AbortSignal.timeout(6000) });
      code = r.status; if (r.body) await r.body.cancel();
    } catch { code = 0; }
    const etat = code >= 200 && code < 400 ? 'ok' : [401, 403, 429].includes(code) ? 'protege' : 'mort';
    return { cat, nom, url, code, etat };
  }));
  const res = { le: Date.now(), liens: out };
  if (cache) { try { await cache.put(cle, new Response(JSON.stringify(res), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=21600' } })); } catch { /* */ } }
  return res;
}
/* LE RÉVEIL DE L'IA. `force` (bouton « lancer maintenant ») saute seulement l'attente de 12 h ;
   un essai en cours est TOUJOURS jugé par l'arbitre d'abord. */
async function iaTick(env, ctx, origine, force) {
  const st = await iaEtat(env);
  const now = Date.now();
  if (st.mode === 'off') return { ok: true, action: 'arretee', detail: 'IA en pause (bouton du tableau de bord)' };
  /* Les 6 robots pour le relevé (le principal testnet compte pour le passage au réel), mais l'IA ne voit
     QUE les 5 papier. */
  const [tous, marche] = await Promise.all([botFleetStats(env, ctx, [IA.BOT_PRINCIPAL].concat(IA.BOTS_PAPIER)), botMarche(env)]);
  const flotte = tous.filter((b) => IA.BOTS_PAPIER.includes(b.name));
  const btc = ((marche.cryptos || []).find((c) => c.paire === 'BTC/USDT') || {}).prix || null;
  st.dernierTick = now;
  /* Relevé de la flotte à chaque réveil (avec le prix du BTC) : l'historique du passage au réel ne dépend
     plus de l'ouverture de la page. 1 relevé par heure au plus (garde dans botSnapshot). */
  await botReleverD1(env, tous, now, btc);
  if (st.enCours) {
    const cibleEssai = flotte.find((b) => b.name === st.enCours.bot) || {};
    /* Les ventes du robot ne comptent que si on lit son NOUVEAU déploiement (compteurs remis à 0 au redémarrage). */
    const ventesEssai = cibleEssai.depl && (st.enCours.depl0 || {})[st.enCours.bot] && cibleEssai.depl !== st.enCours.depl0[st.enCours.bot] ? Number(cibleEssai.sells) || 0 : null;
    const v = IA.arbitre(st.enCours, IA.equitesComparables(st.enCours, flotte), now, btc, ventesEssai);
    if (v.verdict === 'attendre') { st.dernier = 'essai en cours sur ' + st.enCours.bot + ' : ' + v.raison; await iaEcrire(env, st); return { ok: true, action: 'attente', detail: v.raison }; }
    let restaure = null;
    if (v.verdict === 'annuler') {
      const b = flotte.find((x) => x.name === st.enCours.bot);
      restaure = b && b.svcId ? await botAppliquer(env, ctx, b.svcId, st.enCours.avant || {}) : { ok: false, err: 'robot introuvable' };
    }
    st.journal = IA.ajouterJournal(st.journal, { type: 'verdict', t: now, bot: st.enCours.bot, set: st.enCours.set, avant: st.enCours.avant,
      verdict: v.verdict, raison: v.raison, r_cible: v.r_cible, r_mediane: v.r_mediane, r_btc: v.r_btc, heures: v.heures,
      restaure: restaure ? (restaure.ok ? 'anciens réglages remis' : 'ÉCHEC de la remise : ' + restaure.err) : null });
    st.enCours = null; st.dernier = 'essai jugé : ' + v.verdict;
    await iaEcrire(env, st);
    await audLog(env, { ev: 'bot_ia_verdict', set: v.verdict });
    return { ok: true, action: 'verdict', detail: v.verdict + ' — ' + v.raison };
  }
  if (!force && now - (st.derniereDecision || 0) < IA.ECART_DECISIONS_MS) {
    st.dernier = 'prochaine décision dans ' + Math.ceil((IA.ECART_DECISIONS_MS - (now - st.derniereDecision)) / 3600e3) + ' h';
    await iaEcrire(env, st);
    return { ok: true, action: 'attente', detail: st.dernier };
  }
  const actuels = {};
  await Promise.all(flotte.filter((b) => b.svcId).map(async (b) => { actuels[b.name] = await botVarsVisibles(env, ctx, b.svcId); }));
  const { system, prompt } = IA.construirePrompt(IA.resumerMarche(marche), flotte, actuels, st.journal);
  let prop = null, source = 'ia', modele = '', echecIa = '';
  try {
    /* GRATUIT SEULEMENT (Kevin 30.09 + 2.10) : jamais Anthropic ni OpenAI payants, même s'ils sont configurés.
       Qwen 3.8 27B (Workers AI) d'abord = le plus fort des gratuits (mesure publique 09.2026), puis les paliers gratuits. */
    const r = await routeText(env, { system, prompt, maxTokens: 500, temperature: 0.3, budgetMs: 25000, domain: 'reasoning', chain: IA_CHAINE_GRATUITE });
    modele = [r.provider, r.model].filter(Boolean).join(' · ');
    prop = IA.validerProposition(r.text || '', actuels);
    if (!prop.ok) echecIa = prop.err;
  } catch (e) { echecIa = String((e && e.message) || e).slice(0, 120); }
  if (!prop || !prop.ok) { prop = IA.propositionDeSecours(flotte, actuels); source = 'secours'; }
  if (!prop.ok) {
    st.dernier = 'aucune proposition valable : ' + prop.err + (echecIa ? ' (IA : ' + echecIa + ')' : '');
    await iaEcrire(env, st);
    return { ok: true, action: 'rien', detail: st.dernier };
  }
  /* CONTRE-AVIS : une 2e IA gratuite d'une autre famille (gpt-oss-120b, OpenAI open-weight, Workers AI)
     relit la proposition. NON = rien ne change ; on réessaie dans 3 h. Muette = on suit l'arbitre. */
  let contre = null;
  if (source === 'ia' && env.AI && typeof env.AI.run === 'function') {
    try {
      const ca = IA.consigneContreAvis(prop, IA.resumerMarche(marche));
      const r2 = await Promise.race([
        env.AI.run(IA_CONTRE_AVIS_MODELE, { instructions: ca.system, input: ca.prompt, reasoning: { effort: 'low' } }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 20000)),
      ]);
      contre = IA.lireContreAvis(IA.texteReponseIa(r2));
    } catch { contre = null; }
    if (contre && contre.avis === 'NON') {
      st.derniereDecision = now - IA.ECART_DECISIONS_MS + 3 * 3600e3;
      st.journal = IA.ajouterJournal(st.journal, { type: 'refus', t: now, bot: prop.bot, set: prop.set, raison: prop.raison,
        contre_avis: contre.raison, modele, modele_contre: IA_CONTRE_AVIS_MODELE.split('/').pop(), origine });
      st.dernier = 'proposition refusée par le contre-avis : ' + contre.raison;
      await iaEcrire(env, st);
      return { ok: true, action: 'refus', detail: st.dernier };
    }
  }
  const cible = flotte.find((b) => b.name === prop.bot);
  if (!cible || !cible.svcId) { st.dernier = 'robot ' + prop.bot + ' introuvable sur Railway'; await iaEcrire(env, st); return { ok: false, action: 'rien', detail: st.dernier }; }
  const avant = {}; const va = actuels[prop.bot] || {};
  /* null = le réglage n'existait pas : l'annulation le SUPPRIME (sinon la nouvelle valeur resterait). */
  Object.keys(prop.set).forEach((k) => { avant[k] = va[k] !== undefined ? va[k] : null; });
  /* ENREGISTRER D'ABORD, APPLIQUER ENSUITE (2.10, KV plafonné ce jour-là, code 10048) : si le KV refuse
     l'écriture, on ne touche à AUCUN robot — sinon l'essai tournerait sans être suivi ni jugé, et le
     réveil suivant lancerait un 2e changement par-dessus. */
  const journalAvant = st.journal;
  st.enCours = Object.assign({ bot: prop.bot, debut: now, btc0: btc, set: prop.set, avant, raison: prop.raison, attendu: prop.attendu, source, modele }, IA.debutEssai(prop.bot, flotte));
  st.derniereDecision = now;
  st.journal = IA.ajouterJournal(st.journal, { type: 'decision', t: now, bot: prop.bot, set: prop.set, avant, raison: prop.raison,
    attendu: prop.attendu, source, modele, echec_ia: source === 'secours' ? echecIa : '', origine,
    contre_avis: contre ? contre.raison : '', modele_contre: contre ? IA_CONTRE_AVIS_MODELE.split('/').pop() : '' });
  st.dernier = 'nouvel essai sur ' + prop.bot;
  try { await iaEcrire(env, st); } catch (e) {
    return { ok: false, action: 'echec', detail: 'mémoire du domaine (KV) indisponible : aucun robot modifié — ' + String((e && e.message) || e).slice(0, 80) };
  }
  const ap = await botAppliquer(env, ctx, cible.svcId, prop.set);
  if (!ap.ok) {
    st.enCours = null; st.derniereDecision = 0; st.journal = journalAvant;
    st.dernier = 'application échouée : ' + ap.err;
    try { await iaEcrire(env, st); } catch { /* l'arbitre verra un essai sans effet et le gardera neutre */ }
    return { ok: false, action: 'echec', detail: st.dernier };
  }
  await audLog(env, { ev: 'bot_ia_decision', set: Object.keys(prop.set).join(',') });
  return { ok: true, action: 'decision', detail: prop.bot + ' ' + JSON.stringify(prop.set) };
}
async function botCtx(env) {
  const pt = await railGql(env, 'query { projectToken { projectId environmentId } }');
  const projectId = pt.j && pt.j.data && pt.j.data.projectToken && pt.j.data.projectToken.projectId;
  const environmentId = pt.j && pt.j.data && pt.j.data.projectToken && pt.j.data.projectToken.environmentId;
  if (!projectId) return { err: 'token_railway_invalide', detail: JSON.stringify(pt.j || pt.http).slice(0, 300) };
  const pr = await railGql(env, `query { project(id: "${projectId}") { name services { edges { node { id name } } } } }`);
  const edges = (((pr.j || {}).data || {}).project || { services: { edges: [] } }).services.edges || [];
  const services = edges.map((e) => e.node);
  const svc = services.find((n) => n.name === BOT_SERVICE_NAME);
  if (!svc) return { err: 'service_bot_introuvable', detail: 'services: ' + services.map((n) => n.name).join(', ') };
  return { projectId, environmentId, serviceId: svc.id, projectName: (((pr.j || {}).data || {}).project || {}).name, services };
}
/* Compte les VRAIS trades dans les logs d'un bot (mêmes règles que
   crypto-bot/trade_stats.py) : appariement FIFO 🟢 ACHAT → 🔻 VENTE par paire,
   net = Σ qty×(prix_vente − prix_achat). Jamais d'estimation : uniquement les
   lignes réellement présentes dans les logs visibles. */
/* ===== Indicateurs techniques (analyse expert style TradingView, Kevin 2026-07-10)
   Formules STANDARD (EMA, RSI Wilder, MACD, Stochastique, CCI) calculées sur les
   VRAIES bougies Binance publiques — jamais d'estimation, pas de clé requise. ===== */
function taEmaSeries(v, p) {
  const k = 2 / (p + 1); const out = []; let e = v[0];
  for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; out.push(e); }
  return out;
}
function taRsi(c, p) {
  if (c.length < p + 2) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= p; l /= p;
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function taStoch(h, l, c, p, dP) {
  if (c.length < p + dP) return null;
  const ks = [];
  for (let j = c.length - dP; j < c.length; j++) {
    const hh = Math.max(...h.slice(j - p + 1, j + 1)), ll = Math.min(...l.slice(j - p + 1, j + 1));
    ks.push(hh === ll ? 50 : ((c[j] - ll) / (hh - ll)) * 100);
  }
  return { k: ks[ks.length - 1], d: ks.reduce((a, b) => a + b, 0) / ks.length };
}
function taCci(h, l, c, p) {
  if (c.length < p) return null;
  const tp = c.map((_, i) => (h[i] + l[i] + c[i]) / 3);
  const win = tp.slice(-p); const sma = win.reduce((a, b) => a + b, 0) / p;
  const dev = win.reduce((a, b) => a + Math.abs(b - sma), 0) / p;
  return dev === 0 ? 0 : (tp[tp.length - 1] - sma) / (0.015 * dev);
}
/* Notation façon TradingView : votes moyennes mobiles + oscillateurs → score −1..+1. */
function taRating(h, l, c) {
  const price = c[c.length - 1];
  let maBuy = 0, maSell = 0, oscBuy = 0, oscSell = 0, oscNeu = 0;
  [10, 20, 50, 100, 200].forEach((p) => {
    if (c.length < p) return;
    const e = taEmaSeries(c, p)[c.length - 1];
    if (price > e) maBuy++; else maSell++;
  });
  const rsi = taRsi(c, 14);
  if (rsi != null) { if (rsi < 30) oscBuy++; else if (rsi > 70) oscSell++; else oscNeu++; }
  const macdS = taEmaSeries(c, 12).map((v, i) => v - taEmaSeries(c, 26)[i]);
  const sig = taEmaSeries(macdS, 9);
  const macd = macdS[macdS.length - 1], macdSig = sig[sig.length - 1];
  if (macd > macdSig) oscBuy++; else oscSell++;
  const st = taStoch(h, l, c, 14, 3);
  if (st) { if (st.k < 20 && st.k > st.d) oscBuy++; else if (st.k > 80 && st.k < st.d) oscSell++; else oscNeu++; }
  const cci = taCci(h, l, c, 20);
  if (cci != null) { if (cci < -100) oscBuy++; else if (cci > 100) oscSell++; else oscNeu++; }
  const mom = c.length > 10 ? price - c[c.length - 11] : 0;
  if (mom > 0) oscBuy++; else if (mom < 0) oscSell++;
  const buy = maBuy + oscBuy, sell = maSell + oscSell, total = buy + sell + oscNeu;
  const score = total ? (buy - sell) / total : 0;
  const label = score >= 0.5 ? 'Achat fort' : score >= 0.1 ? 'Achat' : score > -0.1 ? 'Neutre' : score > -0.5 ? 'Vente' : 'Vente forte';
  return { price, score: Math.round(score * 100) / 100, label, rsi: rsi == null ? null : Math.round(rsi * 10) / 10, ma_buy: maBuy, ma_sell: maSell, osc_buy: oscBuy, osc_sell: oscSell, macd_up: macd > macdSig };
}
/* ===== SCANNER DE MARCHÉ — Choppiness Index (Kevin 2026-09-12, capture pub Facebook
   « Captain Trading ») =====
   CE QUI EST VRAI DANS LA PUB, CE QUI NE L'EST PAS : le Choppiness Index (E.W. Dreiss,
   1990er) est un VRAI indicateur technique standard, formule ci-dessous, aucune
   invention. « Claude AI scanne le marché pour toi » est une phrase publicitaire — je
   n'ai aucun accès magique à TradingView ; ce que je peux VRAIMENT faire est calculer
   ce même indicateur, honnêtement, sur les VRAIES bougies Binance publiques (même
   source que /__bot/analysis), et te montrer le résultat sans l'habiller de promesses.
   FORMULE (standard, non modifiée) : CI(n) = 100 · log10( Σ TrueRange(n) / (PlusHaut(n)
   − PlusBas(n)) ) / log10(n). CI proche de 100 = marché SANS direction (comprimé,
   "coiled" — pourrait partir dans un sens ou l'autre). CI proche de 0 = tendance
   FORTE et directionnelle déjà en cours. Ni l'un ni l'autre n'est une prédiction —
   c'est une PHOTO technique du moment, exactement comme /__bot/analysis le dit déjà.
   Lecture SEULE : le scan ne modifie AUCUN réglage d'AUCUN bot — Kevin décide. */
function taChoppiness(h, l, c, p) {
  if (c.length < p + 1) return null;
  let trSum = 0;
  for (let i = c.length - p; i < c.length; i++) {
    trSum += Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  const hh = Math.max(...h.slice(-p)), ll = Math.min(...l.slice(-p));
  const rng = hh - ll;
  if (rng <= 0) return 0;
  return (100 * Math.log10(trSum / rng)) / Math.log10(p);
}
/* Liste CURATÉE (pas l'intégralité du marché — évite les micro-caps illiquides/
   pump-and-dump qu'un scan "toutes paires" ferait remonter) : 24 paires USDT parmi
   les plus liquides de Binance, sous la limite de 50 sous-requêtes/appel du Worker
   Cloudflare (24 fetch en parallèle, marge large). */
const SCAN_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT',
  'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'LTC/USDT', 'BCH/USDT',
  'ATOM/USDT', 'UNI/USDT', 'ETC/USDT', 'XLM/USDT', 'NEAR/USDT', 'APT/USDT',
  'ARB/USDT', 'OP/USDT', 'FIL/USDT', 'ICP/USDT', 'HBAR/USDT', 'SUI/USDT',
];
async function taScanPair(sym) {
  const pair = sym.replace('/', '');
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=1h&limit=60`);
    if (!r.ok) return { symbol: sym, err: 'binance HTTP ' + r.status };
    const k = await r.json();
    if (!Array.isArray(k) || k.length < 30) return { symbol: sym, err: 'bougies insuffisantes (' + (k.length || 0) + ')' };
    const h = k.map((x) => Number(x[2])), l = k.map((x) => Number(x[3])), c = k.map((x) => Number(x[4]));
    const ciNow = taChoppiness(h, l, c, 14);
    const ciPrev = taChoppiness(h.slice(0, -10), l.slice(0, -10), c.slice(0, -10), 14);
    const price = c[c.length - 1];
    const chg24 = c.length > 24 ? ((price / c[c.length - 25] - 1) * 100) : null;
    if (ciNow == null) return { symbol: sym, err: 'CI incalculable (pas assez de bougies)' };
    const delta = ciPrev == null ? null : ciNow - ciPrev;
    let cat = 'neutre';
    if (delta != null && delta <= -15) cat = 'sort_du_calme';        // CI chute vite = tendance qui démarre
    else if (ciNow >= 61.8) cat = 'comprime';                        // seuil usuel du Choppiness Index
    return {
      symbol: sym, price, chg24: chg24 == null ? null : Math.round(chg24 * 100) / 100,
      ci: Math.round(ciNow * 10) / 10, ci_delta: delta == null ? null : Math.round(delta * 10) / 10,
      cat,
    };
  } catch (e) { return { symbol: sym, err: String(e && e.message || e).slice(0, 120) }; }
}
/* ===== JOURNAL PERSISTANT DE LA FLOTTE (Kevin 2026-09-11 « bilan de ce qu'ils ont
   pu gagner ou perdre ») =====
   POURQUOI : jusqu'ici le bilan se lisait UNIQUEMENT dans les logs Railway, qui sont
   PURGÉS (mesuré le 11.09 : plus rien avant le 19 août) et qui repartent de zéro à
   chaque redéploiement (un bot papier relancé réaffiche equity=10000). Résultat :
   impossible de répondre à « combien ont-ils gagné depuis le début ». Le journal
   ci-dessous garde la trace DANS KV, donc elle survit aux deux.
   COMMENT : à chaque consultation de la flotte, on enregistre un relevé — au plus un
   par heure (BOT_SNAP_MS) pour ne pas marteler KV. `bot:hist` garde les 720 derniers
   relevés (~30 jours d'historique horaire), `bot:first` garde le TOUT PREMIER relevé
   de chaque bot et n'est JAMAIS écrasé : c'est lui qui permet de dire « depuis le
   (date), ce bot est passé de X à Y », même bien au-delà des 30 jours.
   Fail-open total : une panne KV ne doit jamais casser l'affichage de la flotte. */
const BOT_SNAP_MS = 60 * 60 * 1000;   /* au plus 1 relevé par heure */
const BOT_HIST_CAP = 1500;            /* ≥ 60 jours (relevé toutes les 1-2 h) : le critère « 60 j » du passage au réel */
async function botSnapshot(env, bots, now, btc) {
  if (!env || !env.ACCOUNTS || !Array.isArray(bots)) return;
  const t = Number(now) || Date.now();
  try {
    const hist = JSON.parse((await env.ACCOUNTS.get('bot:hist')) || '[]');
    const last = hist.length ? hist[hist.length - 1] : null;
    if (last && t - Number(last.t || 0) < BOT_SNAP_MS) return;   /* déjà relevé il y a moins d'une heure */
    const b = {};
    for (const x of bots) {
      if (!x || !x.name || x.equity == null || !isFinite(Number(x.equity))) continue;
      b[x.name] = { e: Math.round(Number(x.equity) * 100) / 100, n: Number(x.net) || 0, a: Number(x.buys) || 0, v: Number(x.sells) || 0 };
    }
    if (!Object.keys(b).length) return;   /* rien de chiffré à enregistrer */
    hist.push(Number(btc) > 0 ? { t, b, btc: Number(btc) } : { t, b });
    await env.ACCOUNTS.put('bot:hist', JSON.stringify(hist.slice(-BOT_HIST_CAP)));
    /* Premier relevé par bot : écrit UNE fois, jamais modifié ensuite. */
    const first = JSON.parse((await env.ACCOUNTS.get('bot:first')) || '{}');
    let addedFirst = false;
    for (const [name, v] of Object.entries(b)) {
      if (!first[name]) { first[name] = { t, e: v.e }; addedFirst = true; }
    }
    if (addedFirst) await env.ACCOUNTS.put('bot:first', JSON.stringify(first));
  } catch { /* fail-open : le bilan est un bonus, jamais un blocage */ }
}
/* Bilan lisible : pour chaque bot, d'où il part, où il en est, et l'écart.
   `reprises` compte les remises à zéro visibles (un bot papier redéployé repart à
   son capital de départ) — sans ça, un écart nul cacherait un redémarrage. */
function botBilan(hist, first) {
  const out = {};
  const names = new Set();
  (hist || []).forEach((p) => Object.keys(p.b || {}).forEach((n) => names.add(n)));
  Object.keys(first || {}).forEach((n) => names.add(n));
  for (const name of names) {
    const pts = (hist || []).filter((p) => p.b && p.b[name] != null).map((p) => ({ t: p.t, ...p.b[name] }));
    const f = (first || {})[name] || (pts[0] ? { t: pts[0].t, e: pts[0].e } : null);
    const l = pts.length ? pts[pts.length - 1] : null;
    let reprises = 0;
    for (let i = 1; i < pts.length; i++) {
      /* une chute de plus de 1 % pile sur la valeur ronde de départ = redémarrage */
      if (pts[i].a === 0 && pts[i].v === 0 && pts[i - 1].a + pts[i - 1].v > 0) reprises++;
    }
    out[name] = {
      depuis: f ? f.t : null,
      depart: f ? f.e : null,
      actuel: l ? l.e : null,
      ecart: (f && l) ? Math.round((l.e - f.e) * 100) / 100 : null,
      achats: l ? l.a : null,
      ventes: l ? l.v : null,
      net_realise: l ? l.n : null,
      releves: pts.length,
      vu_le: l ? l.t : null,
      reprises,
    };
  }
  return out;
}
function fleetTradeStats(logs) {
  const fifo = {}; let buys = 0, sells = 0, wins = 0, losses = 0, net = 0;
  for (const l of logs) {
    const m = String((l && l.message) || '');
    let mm = m.match(/🟢\s+(\S+)\s+ACHAT\s+qty=([\d.]+)\s+@\s+([\d.]+)/);
    if (mm) { buys++; (fifo[mm[1]] = fifo[mm[1]] || []).push({ q: Number(mm[2]), p: Number(mm[3]) }); continue; }
    mm = m.match(/🔻\s+(\S+)\s+VENTE\s+\([^)]*\)\s+qty=([\d.]+)\s+@\s+([\d.]+)/);
    if (mm) {
      sells++; let q = Number(mm[2]); const ps = Number(mm[3]); let pnl = 0; const lot = fifo[mm[1]] || [];
      while (q > 1e-12 && lot.length) {
        const b = lot[0]; const take = Math.min(q, b.q);
        pnl += take * (ps - b.p); b.q -= take; q -= take;
        if (b.q <= 1e-12) lot.shift();
      }
      net += pnl; if (pnl >= 0) wins++; else losses++;
    }
  }
  let open = 0; Object.keys(fifo).forEach((k) => { if (fifo[k].length) open++; });
  return { buys, sells, wins, losses, net: Math.round(net * 100) / 100, open };
}
/* Validation serveur des « gros réglages » (défense en profondeur — la page valide
   aussi). Renvoie { set:{VAR:val} } ou { err:"cause exacte" }. */
function botValidateConfig(b) {
  const set = {};
  if (b.symbols !== undefined) {
    const arr = (Array.isArray(b.symbols) ? b.symbols : String(b.symbols).split(','))
      .map((s) => String(s).trim().toUpperCase().replace(/[-_]/g, '/'))
      .map((s) => (!s.includes('/') && s.endsWith('USDT') ? s.slice(0, -4) + '/USDT' : s))
      .filter(Boolean);
    const uniq = [...new Set(arr)];
    if (uniq.length < 1 || uniq.length > 8) return { err: 'choisis entre 1 et 8 cryptos' };
    for (const s of uniq) {
      if (!/^[A-Z0-9]{2,15}\/USDT$/.test(s)) return { err: 'paire invalide: ' + s + ' (format attendu ex BTC/USDT, cotation en USDT)' };
    }
    set.SYMBOLS = uniq.join(',');
  }
  const num = (key, envName, min, max) => {
    if (b[key] === undefined) return null;
    const n = Number(b[key]);
    if (!isFinite(n) || n < min || n > max) return envName + ' doit être entre ' + min + ' et ' + max;
    set[envName] = String(n);
    return null;
  };
  const errs = [
    (b.timeframe !== undefined) ? (['5m', '15m', '30m', '1h', '4h'].includes(String(b.timeframe)) ? (set.TIMEFRAME = String(b.timeframe), null) : 'timeframe: 5m/15m/30m/1h/4h') : null,
    num('risk', 'RISK_PER_TRADE_PCT', 0.1, 5),
    num('maxpos', 'MAX_POSITION_PCT', 5, 90),
    num('dailyloss', 'DAILY_LOSS_CAP_PCT', 1, 20),
    num('maxdd', 'MAX_DRAWDOWN_PCT', 3, 40),
  ].filter(Boolean);
  if (errs.length) return { err: errs.join(' ; ') };
  if (!Object.keys(set).length) return { err: 'aucun réglage fourni' };
  return { set };
}
/* Coffre Finances — sauvegarde en ligne CHIFFRÉE DE BOUT EN BOUT (admin only).
   Le client (tools/finances/) chiffre tout en AES-GCM-256 avec le code du coffre AVANT
   d'envoyer. Le serveur ne voit qu'un bloc {salt,iv,ct} illisible → confidentialité même
   vis-à-vis du worker/KV. Réutilise le KV ACCOUNTS (clés fin:*) — aucun binding en plus.
   Réservé admin (adminSession : grant prouvé via /__admin/login, cookie/x-kdmc-admin). */
async function handleFin(request, url, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const me = await adminSession(request, env);
  if (!me) {
    const needCode = !!(env && env.KDMC_ADMIN_PIN_SHA256);
    return new Response(JSON.stringify({ ok: false, reason: needCode ? 'need_admin_code' : 'admin_only' }), { status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (!env.ACCOUNTS) return J({ ok: false, reason: 'kv_absent' });
  const path = url.pathname;
  if (path === '/__fin/vault' && request.method === 'GET') {
    const blob = await env.ACCOUNTS.get('fin:vault:main');
    if (!blob) return J({ ok: true, empty: true });
    let meta = null; try { meta = JSON.parse((await env.ACCOUNTS.get('fin:meta:main')) || 'null'); } catch { /* */ }
    let parsed = null; try { parsed = JSON.parse(blob); } catch { return J({ ok: false, reason: 'corrupt' }); }
    return J({ ok: true, blob: parsed, meta });
  }
  if (path === '/__fin/meta' && request.method === 'GET') {
    let meta = null; try { meta = JSON.parse((await env.ACCOUNTS.get('fin:meta:main')) || 'null'); } catch { /* */ }
    return J({ ok: true, meta });
  }
  if (path === '/__fin/vault' && request.method === 'PUT') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    if (!b || !b.blob || !b.blob.ct || !b.blob.salt || !b.blob.iv) return J({ ok: false, reason: 'blob_invalide' });
    const s = JSON.stringify(b.blob);
    if (s.length > 20 * 1024 * 1024) return J({ ok: false, reason: 'trop_gros' });
    const savedAt = b.savedAt || Date.now();
    await env.ACCOUNTS.put('fin:vault:main', s);
    await env.ACCOUNTS.put('fin:meta:main', JSON.stringify({ savedAt, size: s.length, tx: b.tx || 0 }));
    await audLog(env, { ev: 'fin_backup', size: s.length });
    return J({ ok: true, savedAt });
  }
  return new Response(JSON.stringify({ ok: false, reason: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
}

/* Boîte factures@kd-mc.com : le worker "kdmc-mail" (Cloudflare Email Routing) dépose les
   pièces jointes des mails reçus dans KV (mail:p:<id>). Ici, l'app admin les récupère,
   les classe, puis les acquitte (supprime). E2E : l'app chiffre les originaux localement. */
async function handleMail(request, url, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const me = await adminSession(request, env);
  if (!me) {
    const needCode = !!(env && env.KDMC_ADMIN_PIN_SHA256);
    return J({ ok: false, reason: needCode ? 'need_admin_code' : 'admin_only' }, null, 403);
  }
  if (!env.ACCOUNTS) return J({ ok: false, reason: 'kv_absent' });
  const path = url.pathname;
  if (path === '/__mail/scan' && request.method === 'GET') {
    const CAP = 120;   // vide plus vite (gros arriéré) ; l'app boucle en plus jusqu'à file vide
    const items = []; let cursor;
    // Le plan KV gratuit plafonne list() à ~1000/jour (namespace PARTAGÉ). Si le budget est
    // épuisé, list() lève → on renvoie la CAUSE EXACTE (leçon #97) au lieu d'un http_500 opaque,
    // pour que l'app affiche « budget du jour atteint, ça reprend demain » au lieu d'une erreur.
    try {
      do {
        const l = await env.ACCOUNTS.list({ prefix: 'mail:p:', cursor });
        for (const k of l.keys) {
          if (items.length >= CAP) break;
          const raw = await env.ACCOUNTS.get(k.name); if (!raw) continue;
          try { const it = JSON.parse(raw); it.id = k.name.slice('mail:p:'.length); items.push(it); } catch { /* */ }
        }
        cursor = l.list_complete ? null : l.cursor;
      } while (cursor && items.length < CAP);
    } catch (e) {
      const detail = String(e && e.message || e);
      const quota = /limit exceeded|rate limit|429|quota/i.test(detail);
      return J({ ok: false, reason: quota ? 'kv_quota_jour' : 'scan_error', detail }, null, 200);
    }
    return J({ ok: true, items });
  }
  if (path === '/__mail/ack' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const ids = Array.isArray(b.ids) ? b.ids : [];
    for (const id of ids) { try { await env.ACCOUNTS.delete('mail:p:' + String(id)); } catch { /* */ } }
    await audLog(env, { ev: 'mail_ack', n: ids.length });
    return J({ ok: true, deleted: ids.length });
  }
  return J({ ok: false, reason: 'not_found' }, null, 404);
}

async function handleBot(request, url, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  /* Réveil de l'IA pilote par le cron de kdmc-outlook : clé DÉRIVÉE du secret admin, comparée en
     temps constant. Sans clé valide → 403, et rien d'autre n'est accessible par ce chemin. */
  if (url.pathname === '/__bot/ia/tick' && request.method === 'POST' && request.headers.get('x-bot-ia-key')) {
    const attendue = await iaCleReveil(env);
    if (!attendue || !egalTempsConstant(request.headers.get('x-bot-ia-key'), attendue)) return J({ ok: false, reason: 'cle_reveil_invalide' }, null, 403);
    if (!env.RAILWAY_TOKEN) return J({ ok: false, reason: 'railway_token_absent' });
    const ctxR = await botCtx(env);
    if (ctxR.err) return J({ ok: false, reason: ctxR.err });
    return J(await iaTickJournalise(env, ctxR, 'cron', false));
  }
  const me = await adminSession(request, env);
  if (!me) {
    const needCode = !!(env && env.KDMC_ADMIN_PIN_SHA256);
    return J({ ok: false, reason: needCode ? 'need_admin_code' : 'admin_only' }, null, 403);
  }
  const path = url.pathname;

  /* SCANNER DE MARCHÉ (Choppiness Index, Kevin 2026-09-12) : lecture SEULE, ne
     touche à AUCUN réglage d'AUCUN bot. Traité AVANT botCtx() exprès : le scan
     ne parle qu'à Binance (public, sans clé) — il n'a besoin ni de RAILWAY_TOKEN
     ni de résoudre le service Railway, donc il marcherait même si la flotte de
     bots était en panne. 24 paires liquides en parallèle, ≤50 sous-requêtes
     Worker (marge large). Classé : ce qui bouge déjà en premier (sort_du_calme),
     ce qui est comprimé ensuite (comprime), le reste après — à l'intérieur de
     chaque groupe, l'écart au seuil décide. */
  if (path === '/__bot/scan' && request.method === 'GET') {
    const out = await Promise.all(SCAN_PAIRS.map(taScanPair));
    const rank = { sort_du_calme: 0, comprime: 1, neutre: 2 };
    out.sort((a, b) => {
      const ra = rank[a.cat] != null ? rank[a.cat] : 3, rb = rank[b.cat] != null ? rank[b.cat] : 3;
      if (ra !== rb) return ra - rb;
      const da = a.ci_delta != null ? a.ci_delta : 0, db = b.ci_delta != null ? b.ci_delta : 0;
      if (da !== db) return da - db;                       // chute la plus forte d'abord
      return (b.ci != null ? b.ci : -1) - (a.ci != null ? a.ci : -1); // plus comprimé d'abord
    });
    return J({ ok: true, scanned: SCAN_PAIRS.length, results: out });
  }

  /* MARCHÉS EN DIRECT + LIENS D'ANALYSE (Kevin 2026-10-02) : lecture seule, sans Railway. */
  /* PASSAGE AU RÉEL (contrôle seulement, jamais de bascule) + POINT VOCAL — Kevin 2026-10-02. */
  if (path === '/__bot/reel' && request.method === 'GET') {
    const hist = await botHistComplet(env);
    const robots = IA.BOTS_PAPIER.map((n) => IA.pretPourLeReel(hist, n));
    const principal = IA.segmentDepuisRedemarrage(hist, 'crypto-bot');
    const joursTestnet = principal.length > 1 ? Math.floor((principal[principal.length - 1].t - principal[0].t) / 86400e3) : 0;
    return J({ ok: true, seuils: IA.SEUILS_REEL, robots, testnet: { jours: joursTestnet, ok: joursTestnet >= 14 }, releves: hist.length,
      depuis: hist.length ? hist[0].t : null, pret: robots.some((x) => x.pret) && joursTestnet >= 14 });
  }
  if (path === '/__bot/ia/vocal' && request.method === 'GET') {
    const [st, marche] = await Promise.all([iaEtat(env), botMarche(env)]);
    return J({ ok: true, texte: IA.resumeVocal(st, marche) });
  }
  if (path === '/__bot/marche' && request.method === 'GET') return J(Object.assign({ ok: true }, await botMarche(env, url.searchParams.get('frais') === '1')));
  if (path === '/__bot/liens' && request.method === 'GET') return J(Object.assign({ ok: true }, await botLiens()));
  if (!env.RAILWAY_TOKEN) return J({ ok: false, reason: 'railway_token_absent', detail: 'Secret RAILWAY_TOKEN non déployé sur le worker (relancer deploy-kdmc-router).' });
  const ctx = await botCtx(env);
  if (ctx.err) return J({ ok: false, reason: ctx.err, detail: ctx.detail });
  /* IA PILOTE (Kevin 2026-10-02) — état, pause/relance, lancer maintenant, annuler l'essai en cours. */
  if (path === '/__bot/ia' && request.method === 'GET') {
    const st = await iaEtat(env);
    return J({ ok: true, mode: st.mode, enCours: st.enCours, derniereDecision: st.derniereDecision, dernierTick: st.dernierTick,
      dernier: st.dernier, journal: (st.journal || []).slice().reverse(), robots: IA.BOTS_PAPIER,
      rythme: { decision_h: IA.ECART_DECISIONS_MS / 3600e3, essai_min_h: IA.ESSAI_MIN_MS / 3600e3, essai_max_h: IA.ESSAI_MAX_MS / 3600e3 } });
  }
  if (path === '/__bot/ia/mode' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* */ }
    if (!['auto', 'off'].includes(b.mode)) return J({ ok: false, reason: 'mode_invalide', detail: 'auto ou off' });
    const st = await iaEtat(env); st.mode = b.mode; await iaEcrire(env, st);
    await audLog(env, { ev: 'bot_ia_mode', set: b.mode });
    return J({ ok: true, mode: b.mode });
  }
  if (path === '/__bot/ia/tick' && request.method === 'POST') return J(await iaTickJournalise(env, ctx, 'kevin', true));
  if (path === '/__bot/ia/annuler' && request.method === 'POST') {
    const st = await iaEtat(env);
    if (!st.enCours) return J({ ok: false, reason: 'aucun_essai' });
    const flotte = await botFleetStats(env, ctx, [st.enCours.bot]);
    const ap = flotte[0] && flotte[0].svcId ? await botAppliquer(env, ctx, flotte[0].svcId, st.enCours.avant || {}) : { ok: false, err: 'robot introuvable' };
    if (!ap.ok) return J({ ok: false, reason: 'remise_echouee', detail: ap.err });
    st.journal = IA.ajouterJournal(st.journal, { type: 'verdict', t: Date.now(), bot: st.enCours.bot, set: st.enCours.set, avant: st.enCours.avant,
      verdict: 'annuler', raison: 'annulé à la main par Kevin', restaure: 'anciens réglages remis' });
    st.enCours = null; st.dernier = 'essai annulé par Kevin'; await iaEcrire(env, st);
    await audLog(env, { ev: 'bot_ia_annule' });
    return J({ ok: true });
  }

  if (path === '/__bot/status' && request.method === 'GET') {
    const dp = await railGql(env, `query { deployments(first: 1, input: { projectId: "${ctx.projectId}", serviceId: "${ctx.serviceId}", environmentId: "${ctx.environmentId}" }) { edges { node { id status createdAt } } } }`);
    const node = ((((dp.j || {}).data || {}).deployments || { edges: [] }).edges[0] || {}).node;
    if (!node) return J({ ok: false, reason: 'aucun_deploiement', detail: JSON.stringify(dp.j || dp.http).slice(0, 300) });
    const rl = await railGql(env, `query { deploymentLogs(deploymentId: "${node.id}", limit: 80) { timestamp message } }`);
    const logs = (((rl.j || {}).data || {}).deploymentLogs || []).map((l) => ({ t: l.timestamp, m: String(l.message || '').slice(0, 300) }));
    return J({ ok: true, project: ctx.projectName, status: node.status, since: node.createdAt, logs });
  }

  /* Classement de la FLOTTE : bot principal (testnet) + 5 bots papier — tournoi de
     stratégies (Kevin 2026-07-06 « Je ne les vois pas dans l'app »). Net = gains/pertes
     RÉALISÉS comptés dans les logs visibles (FIFO, cf fleetTradeStats). Le RAILWAY_TOKEN
     ne quitte jamais le worker ; les 6 services sont interrogés EN PARALLÈLE. */
  if (path === '/__bot/fleet' && request.method === 'GET') {
    const FLEET = ['crypto-bot', 'crypto-bot-p1', 'crypto-bot-p2', 'crypto-bot-p3', 'crypto-bot-p4', 'crypto-bot-p5'];
    /* Même calcul que l'IA pilote (botFleetStats) ; l'identifiant Railway ne sort pas du worker. */
    const bots = (await botFleetStats(env, ctx, FLEET)).map((b) => { const c = Object.assign({}, b); delete c.svcId; delete c.depl; return c; });
    /* Tri par net réalisé décroissant ; les bots absents/sans logs en dernier. */
    bots.sort((a, b) => (((b.net == null) ? -1e9 : b.net) - ((a.net == null) ? -1e9 : a.net)));
    /* Trace durable (survit à la purge des logs Railway et aux redéploiements). */
    await botSnapshot(env, bots, Date.now());
    return J({ ok: true, bots });
  }

  /* Bilan DURABLE (Kevin 2026-09-11) : ce que le journal KV a vu, pas ce que les logs
     Railway veulent bien garder. Renvoie le résumé par bot + la série pour la courbe. */
  if (path === '/__bot/history' && request.method === 'GET') {
    let hist = [], first = {};
    try { hist = JSON.parse((await env.ACCOUNTS.get('bot:hist')) || '[]'); } catch { hist = []; }
    try { first = JSON.parse((await env.ACCOUNTS.get('bot:first')) || '{}'); } catch { first = {}; }
    const bilan = botBilan(hist, first);
    /* La série complète peut peser : on rend au plus 200 points, les plus récents. */
    return J({ ok: true, bilan, points: hist.slice(-200), releves: hist.length });
  }

  /* ANALYSE EXPERT (Kevin 2026-07-10 « qu'il serve à faire des analyses ») :
     notation Achat/Vente par crypto façon TradingView, calculée dans le worker
     depuis les VRAIES bougies Binance publiques (data-api.binance.vision, sans clé —
     api.binance.com renvoie HTTP 451 géo-bloqué hors UE). Timeframe validé (?tf=1h|4h|1d), symboles
     lus depuis la config réelle du bot. Aucune promesse : c'est une photo technique. */
  if (path === '/__bot/analysis' && request.method === 'GET') {
    const TFS = { '1h': '1h', '4h': '4h', '1d': '1d' };
    const tf = TFS[url.searchParams.get('tf') || '1h'] || '1h';
    const vq = await railGql(env, `query { variables(projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${ctx.serviceId}") }`);
    const vars = ((vq.j || {}).data || {}).variables || {};
    const syms = String(vars.SYMBOLS || 'BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,XRP/USDT')
      .split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{2,15}\/USDT$/.test(s)).slice(0, 8);
    const out = await Promise.all(syms.map(async (sym) => {
      const pair = sym.replace('/', '');
      try {
        const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${tf}&limit=250`);
        if (!r.ok) return { symbol: sym, err: 'binance HTTP ' + r.status };
        const k = await r.json();
        if (!Array.isArray(k) || k.length < 60) return { symbol: sym, err: 'bougies insuffisantes (' + (k.length || 0) + ')' };
        const h = k.map((x) => Number(x[2])), l = k.map((x) => Number(x[3])), c = k.map((x) => Number(x[4]));
        return Object.assign({ symbol: sym }, taRating(h, l, c));
      } catch (e) { return { symbol: sym, err: String(e && e.message || e).slice(0, 120) }; }
    }));
    return J({ ok: true, tf, analysis: out });
  }

  /* Réglages (« gros réglages » choisis par Kevin ; le bot gère le reste).
     GET = valeurs actuelles ; POST = applique + redéploie. TESTNET non modifiable
     ici (bascule argent réel = décision volontaire hors dashboard). */
  const BOT_KNOBS = ['SYMBOLS', 'TIMEFRAME', 'RISK_PER_TRADE_PCT', 'MAX_POSITION_PCT', 'DAILY_LOSS_CAP_PCT', 'MAX_DRAWDOWN_PCT'];
  if (path === '/__bot/config' && request.method === 'GET') {
    const vq = await railGql(env, `query { variables(projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${ctx.serviceId}") }`);
    const vars = ((vq.j || {}).data || {}).variables || {};
    const cfg = {};
    BOT_KNOBS.forEach((k) => { if (vars[k] != null) cfg[k] = vars[k]; });
    return J({ ok: true, config: cfg, testnet: (vars.TESTNET !== 'false'), live: (vars.BOT_LIVE === 'true'), symbol_default: 'BTC/USDT' });
  }
  if (path === '/__bot/config' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* ignore */ }
    const v = botValidateConfig(b);
    if (v.err) return J({ ok: false, reason: 'reglage_invalide', detail: v.err });
    for (const [name, value] of Object.entries(v.set)) {
      const up = await railGql(env, `mutation { variableUpsert(input: { projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${ctx.serviceId}", name: "${name}", value: "${value}" }) }`);
      if (!up.j || up.j.errors) return J({ ok: false, reason: 'variable_upsert_echec', detail: name + ': ' + JSON.stringify((up.j && up.j.errors) || up.http).slice(0, 200) });
    }
    const rd = await railGql(env, `mutation { serviceInstanceRedeploy(environmentId: "${ctx.environmentId}", serviceId: "${ctx.serviceId}") }`);
    if (!rd.j || rd.j.errors) return J({ ok: false, reason: 'redeploy_echec', detail: JSON.stringify((rd.j && rd.j.errors) || rd.http).slice(0, 200) });
    await audLog(env, { ev: 'bot_config', set: Object.keys(v.set).join(',') });
    return J({ ok: true, set: v.set });
  }

  /* Kill switch / relance : pose BOT_KILL puis redéploie (le bot lit BOT_KILL au
     cycle suivant → vend et s'arrête proprement ; exit 0 + ON_FAILURE = pas de restart). */
  if ((path === '/__bot/kill' || path === '/__bot/start') && request.method === 'POST') {
    const val = path === '/__bot/kill' ? '1' : '0';
    const up = await railGql(env, `mutation { variableUpsert(input: { projectId: "${ctx.projectId}", environmentId: "${ctx.environmentId}", serviceId: "${ctx.serviceId}", name: "BOT_KILL", value: "${val}" }) }`);
    if (!up.j || up.j.errors) return J({ ok: false, reason: 'variable_upsert_echec', detail: JSON.stringify((up.j && up.j.errors) || up.http).slice(0, 300) });
    const rd = await railGql(env, `mutation { serviceInstanceRedeploy(environmentId: "${ctx.environmentId}", serviceId: "${ctx.serviceId}") }`);
    if (!rd.j || rd.j.errors) return J({ ok: false, reason: 'redeploy_echec', detail: JSON.stringify((rd.j && rd.j.errors) || rd.http).slice(0, 300) });
    await audLog(env, { ev: path === '/__bot/kill' ? 'bot_kill' : 'bot_start' });
    return J({ ok: true, action: path === '/__bot/kill' ? 'kill' : 'start' });
  }

  return J({ ok: false, reason: 'not_found' });
}

function beatbotLock() {
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#08131f"><title>PoolPilot — privé</title>'
  + '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#08131f,#050c14);color:#e8f1fa;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}'
  + '.c{width:100%;max-width:340px;text-align:center}.lg{font-size:44px}h1{font-size:19px;margin:10px 0 4px}p{color:#93b0c8;font-size:13px;margin:0 0 18px}'
  + 'input{width:100%;background:#0d1c2c;border:1px solid #1f3d5a;color:#e8f1fa;border-radius:12px;padding:14px;font-size:20px;text-align:center;letter-spacing:6px}'
  + 'button{width:100%;margin-top:12px;background:linear-gradient(135deg,#39c2ff,#0e88c9);color:#052034;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:700}'
  + '.e{color:#f2b632;font-size:12.5px;margin-top:10px;min-height:16px}a{color:#39c2ff}</style></head><body>'
  + '<div class="c"><div class="lg">🔒🌊</div><h1>PoolPilot — espace privé</h1><p>Réservé à l\'administrateur. Déverrouille avec ton code (Face ID te reconnaît ensuite automatiquement).</p>'
  + '<input id="pin" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="••••••" maxlength="12">'
  + '<button id="go">Déverrouiller</button><div class="e" id="err"></div>'
  + '<p style="margin-top:18px;font-size:11.5px">Déjà connecté sur <a href="https://kd-mc.com">kd-mc.com</a> ? Recharge cette page.</p></div>'
  + '<script>var b=document.getElementById("go"),pin=document.getElementById("pin"),err=document.getElementById("err");'
  + 'function sub(){var c=(pin.value||"").trim();if(!c){err.textContent="Entre ton code.";return;}b.disabled=true;err.textContent="Vérification…";'
  + 'fetch("/__admin/login",{method:"POST",headers:{"content-type":"application/json"},credentials:"include",body:JSON.stringify({code:c})}).then(function(r){return r.json();}).then(function(j){'
  + 'if(j.ok){location.reload();}else{b.disabled=false;err.textContent=j.reason==="rate_limited"?("Trop d\'essais, attends "+Math.ceil((j.wait||0)/1000)+"s"):(j.reason==="code_invalide"?"Code incorrect.":"Erreur : "+(j.reason||"?"));}}).catch(function(e){b.disabled=false;err.textContent="Réseau : "+e;});}'
  + 'b.onclick=sub;pin.addEventListener("keydown",function(e){if(e.key==="Enter")sub();});pin.focus();</script></body></html>';
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
}
function approvalsLock() {
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b0f0a"><title>Coffre d\'autorisations — privé</title>'
  + '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0b0f0a,#05070a);color:#f2efe0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}'
  + '.c{width:100%;max-width:340px;text-align:center}.lg{font-size:44px}h1{font-size:19px;margin:10px 0 4px}p{color:#a9b39a;font-size:13px;margin:0 0 18px}'
  + 'input{width:100%;background:#0b1108;border:1px solid #2a331f;color:#f2efe0;border-radius:12px;padding:14px;font-size:20px;text-align:center;letter-spacing:6px}'
  + 'button{width:100%;margin-top:12px;background:linear-gradient(135deg,#e8c766,#c9a94a);color:#0b0f0a;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:700}'
  + '.e{color:#e0a83a;font-size:12.5px;margin-top:10px;min-height:16px}a{color:#e8c766}</style></head><body>'
  + '<div class="c"><div class="lg">🔐🆔</div><h1>Coffre d\'autorisations — espace privé</h1><p>Réservé à l\'administrateur. Déverrouille avec ton code (Face ID te reconnaît ensuite automatiquement).</p>'
  + '<input id="pin" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="••••••" maxlength="12">'
  + '<button id="go">Déverrouiller</button><div class="e" id="err"></div>'
  + '<p style="margin-top:18px;font-size:11.5px">Déjà connecté sur <a href="https://kd-mc.com">kd-mc.com</a> ? Recharge cette page.</p></div>'
  + '<script>var b=document.getElementById("go"),pin=document.getElementById("pin"),err=document.getElementById("err");'
  + 'function sub(){var c=(pin.value||"").trim();if(!c){err.textContent="Entre ton code.";return;}b.disabled=true;err.textContent="Vérification…";'
  + 'fetch("/__admin/login",{method:"POST",headers:{"content-type":"application/json"},credentials:"include",body:JSON.stringify({code:c})}).then(function(r){return r.json();}).then(function(j){'
  + 'if(j.ok){location.reload();}else{b.disabled=false;err.textContent=j.reason==="rate_limited"?("Trop d\'essais, attends "+Math.ceil((j.wait||0)/1000)+"s"):(j.reason==="code_invalide"?"Code incorrect.":"Erreur : "+(j.reason||"?"));}}).catch(function(e){b.disabled=false;err.textContent="Réseau : "+e;});}'
  + 'b.onclick=sub;pin.addEventListener("keydown",function(e){if(e.key==="Enter")sub();});pin.focus();</script></body></html>';
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
}
/* ---- Relais Beatbot : contrôle réel du robot piscine (PoolPilot / beatbot.kd-mc.com) ----
   L'app découvre l'API cloud Beatbot depuis une CAPTURE que Kevin exporte de SON iPhone
   (seul geste manuel possible), puis relaie start/stop/mode/base + carte via ce proxy.
   SÉCURITÉ : admin-gated (même grant Face ID/PIN que /__admin), HTTPS public uniquement
   (blocage IP privées/métadonnées → anti-SSRF), même origine (0 CORS), audité, réponse cap 256 Ko.
   AUCUNE modif firmware (garantie intacte) : on relaie les MÊMES requêtes que l'app officielle. */
function beatbotTargetOk(rawUrl) {
  let u; try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const h = (u.hostname || '').toLowerCase();
  if (!h || h.indexOf(':') >= 0) return false;           // pas d'IPv6 littéral
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (!h.includes('.')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {              // IPv4 littéral → bloque plages privées/link-local/multicast
    const p = h.split('.').map(Number);
    if (p.some((n) => n > 255)) return false;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
  }
  return true;
}
function abToB64(ab) { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function handleBeatbot(request, url, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const me = await adminSession(request, env);
  if (!me) { const needCode = !!(env && env.KDMC_ADMIN_PIN_SHA256); return J({ ok: false, reason: needCode ? 'need_admin_code' : 'admin_only' }, null, 403); }
  const path = url.pathname;
  if (path === '/__beatbot/health' && request.method === 'GET') return J({ ok: true, relay: 'ready' });
  if (path.startsWith('/__beatbot/tuya/')) return handleTuya(request, path, env);
  if (path === '/__beatbot/relay' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    if (!beatbotTargetOk(b.url)) return J({ ok: false, reason: 'target_refuse', detail: 'URL cible invalide (HTTPS public uniquement, IP privées interdites).' });
    const method = String(b.method || 'GET').toUpperCase();
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].indexOf(method) < 0) return J({ ok: false, reason: 'method_refuse' });
    const headers = new Headers();
    if (b.headers && typeof b.headers === 'object') for (const k in b.headers) { const kl = k.toLowerCase(); if (['host', 'cookie', 'content-length'].indexOf(kl) < 0) headers.set(k, String(b.headers[k])); }
    let resp;
    try { resp = await fetch(b.url, { method, headers, body: (method === 'GET' || method === 'HEAD') ? undefined : (typeof b.body === 'string' ? b.body : JSON.stringify(b.body || {})), redirect: 'manual' }); }
    catch (e) { return J({ ok: false, reason: 'fetch_fail', detail: String((e && e.message) || e).slice(0, 300) }); }
    const ct = resp.headers.get('content-type') || '';
    const raw = await resp.arrayBuffer();
    const capped = raw.byteLength > 262144 ? raw.slice(0, 262144) : raw;
    const isText = /text|json|xml|javascript|urlencoded/.test(ct);
    const bodyOut = isText ? { text: new TextDecoder().decode(capped) } : { b64: abToB64(capped) };
    try { await audLog(env, { ev: 'beatbot_relay', host: new URL(b.url).hostname, st: resp.status }); } catch { /* fail-open */ }
    return J({ ok: true, status: resp.status, ct, size: raw.byteLength, body: bodyOut });
  }
  return J({ ok: false, reason: 'not_found' });
}

/* ---- Tuya OpenAPI : contrôle RÉEL du robot piscine via l'écosystème cloud Tuya ----
   Le robot Beatbot AquaSense 2 Ultra passe par le cloud Tuya (« plug-in » + ID/UUID
   robot). La capture .har de l'app est bloquée (certificate pinning) ; l'API Tuya, elle,
   est officielle, documentée, SANS bidouille firmware → garantie intacte. Kevin lie une
   fois son compte robot à un projet Tuya IoT et colle 2 clés (Access ID + Secret) DANS
   PoolPilot ; le worker les garde côté serveur (KV ACCOUNTS, préfixe `tuya:`, jamais
   renvoyées au client), signe chaque requête (HMAC-SHA256, algo Tuya v2) et relaie
   status/commandes. Admin-gated (handleTuya n'est atteint qu'après adminSession OK).
   Honnête : on lit/écrit les VRAIS « data points » du robot (batterie, état, mode,
   marche/arrêt, retour base…). La position live n'est exposée que si le robot publie un
   DP de position — sinon l'app le dit franchement (aucune invention). */
async function tuyaSha256Hex(str) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str || ''));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function tuyaHmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
/* stringToSign Tuya = METHOD \n SHA256(body) \n (headers vides) \n url?query-trié */
async function tuyaStringToSign(method, pathWithQuery, bodyStr) {
  return String(method).toUpperCase() + '\n' + (await tuyaSha256Hex(bodyStr || '')) + '\n' + '' + '\n' + pathWithQuery;
}
/* sign = HMAC-SHA256( clientId + [access_token] + t + nonce("") + stringToSign , secret ) */
async function tuyaSign(clientId, secret, token, t, s2s) {
  return tuyaHmacHex(secret, clientId + (token || '') + t + '' + s2s);
}
const TUYA_HOSTS = { eu: 'openapi.tuyaeu.com', us: 'openapi.tuyaus.com', cn: 'openapi.tuyacn.com', in: 'openapi.tuyain.com' };
/* Chaque zone Tuya a parfois 2 data centers (ex Europe : Central + Western/Azure). Un
   compte France peut être sur l'un OU l'autre → on essaie tous les hôtes de la zone à la
   découverte, et on retient celui qui renvoie le robot (leçon : mesurer, pas deviner). */
const TUYA_ALT_HOSTS = {
  eu: ['openapi.tuyaeu.com', 'openapi-weaz.tuyaeu.com'],
  us: ['openapi.tuyaus.com', 'openapi-ueaz.tuyaus.com'],
  cn: ['openapi.tuyacn.com'],
  in: ['openapi.tuyain.com'],
};
function tuyaCandidateHosts(region, current) {
  const list = (TUYA_ALT_HOSTS[region] || TUYA_ALT_HOSTS.eu).slice();
  if (current && !list.includes(current)) list.unshift(current);
  const i = current ? list.indexOf(current) : -1;
  if (i > 0) { list.splice(i, 1); list.unshift(current); } /* hôte courant d'abord */
  return list;
}
/* Appel Tuya signé sur un hôte + token DONNÉS (pas de cache) — utilisé pour tester
   chaque data center à la découverte. Retourne {ok, http, result, msg, code}. */
async function tuyaFetchSigned(host, clientId, secret, token, method, pathWithQuery, bodyObj) {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const t = Date.now();
  const sign = await tuyaSign(clientId, secret, token, t, await tuyaStringToSign(method, pathWithQuery, bodyStr));
  let r; try {
    r = await fetch('https://' + host + pathWithQuery, { method, headers: { client_id: clientId, access_token: token, sign, t: String(t), sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json' }, body: bodyStr || undefined });
  } catch (e) { return { ok: false, reason: 'fetch_fail', detail: String((e && e.message) || e).slice(0, 200) }; }
  const j = await r.json().catch(() => ({}));
  return { ok: j && j.success === true, http: r.status, result: j && j.result, msg: j && j.msg, code: j && j.code };
}
async function tuyaCfg(env) { if (!env || !env.ACCOUNTS) return null; try { return JSON.parse((await env.ACCOUNTS.get('tuya:cfg')) || 'null'); } catch { return null; } }
async function tuyaSaveCfg(env, cfg) { if (env && env.ACCOUNTS) await env.ACCOUNTS.put('tuya:cfg', JSON.stringify(cfg)); }
async function tuyaMintToken(host, clientId, secret) {
  const p = '/v1.0/token?grant_type=1', t = Date.now();
  const sign = await tuyaSign(clientId, secret, '', t, await tuyaStringToSign('GET', p, ''));
  const r = await fetch('https://' + host + p, { headers: { client_id: clientId, sign, t: String(t), sign_method: 'HMAC-SHA256' } });
  const j = await r.json().catch(() => ({}));
  if (!j || j.success !== true || !j.result) return { ok: false, detail: (j && (j.msg || ('code ' + j.code))) || ('HTTP ' + r.status) };
  return { ok: true, token: j.result.access_token, exp: Date.now() + Math.max(60, (j.result.expire_time || 7200) - 60) * 1000 };
}
async function tuyaEnsureToken(env, cfg) {
  let tok = null; try { tok = JSON.parse((await env.ACCOUNTS.get('tuya:token')) || 'null'); } catch { /* */ }
  if (tok && tok.token && tok.exp > Date.now()) return tok.token;
  const m = await tuyaMintToken(cfg.host, cfg.access_id, cfg.access_secret);
  if (!m.ok) return null;
  await env.ACCOUNTS.put('tuya:token', JSON.stringify({ token: m.token, exp: m.exp }), { expirationTtl: 7200 });
  return m.token;
}
/* Appel métier signé (status, commandes, découverte…). Retourne {ok, http, result, msg}. */
async function tuyaBiz(env, cfg, method, pathWithQuery, bodyObj) {
  const token = await tuyaEnsureToken(env, cfg);
  if (!token) return { ok: false, reason: 'token_fail', detail: 'Clés Tuya refusées (Access ID/Secret ou région incorrects).' };
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const t = Date.now();
  const sign = await tuyaSign(cfg.access_id, cfg.access_secret, token, t, await tuyaStringToSign(method, pathWithQuery, bodyStr));
  let r; try {
    r = await fetch('https://' + cfg.host + pathWithQuery, { method, headers: { client_id: cfg.access_id, access_token: token, sign, t: String(t), sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json' }, body: bodyStr || undefined });
  } catch (e) { return { ok: false, reason: 'fetch_fail', detail: String((e && e.message) || e).slice(0, 200) }; }
  const j = await r.json().catch(() => ({}));
  return { ok: j && j.success === true, http: r.status, result: j && j.result, msg: j && j.msg, code: j && j.code };
}
async function handleTuya(request, path, env) {
  const seg = path.slice('/__beatbot/tuya/'.length);
  const need = () => J({ ok: false, reason: 'not_linked', detail: 'Robot non lié. Colle tes clés Tuya (Access ID + Secret) dans PoolPilot.' });
  /* état de liaison (jamais le secret) */
  if (seg === 'state' && request.method === 'GET') {
    const c = await tuyaCfg(env);
    return J({ ok: true, linked: !!c, host: c && c.host, region: c && c.region, device_id: c && c.device_id, id_hint: c && c.access_id ? c.access_id.slice(0, 4) + '…' : null });
  }
  /* lier : stocke les clés + teste le token */
  if (seg === 'link' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const region = (b.region || 'eu').toLowerCase();
    const host = TUYA_HOSTS[region] || TUYA_HOSTS.eu;
    const access_id = String(b.access_id || '').trim(), access_secret = String(b.access_secret || '').trim();
    if (!access_id || !access_secret) return J({ ok: false, reason: 'missing', detail: 'Access ID et Access Secret requis.' });
    const m = await tuyaMintToken(host, access_id, access_secret);
    if (!m.ok) return J({ ok: false, reason: 'auth_fail', detail: m.detail });
    const cfg = { access_id, access_secret, host, region, device_id: (b.device_id || '').trim() || null };
    await tuyaSaveCfg(env, cfg);
    await env.ACCOUNTS.put('tuya:token', JSON.stringify({ token: m.token, exp: m.exp }), { expirationTtl: 7200 });
    try { await audLog(env, { ev: 'tuya_link', region }); } catch { /* */ }
    return J({ ok: true, linked: true, region });
  }
  const cfg = await tuyaCfg(env);
  if (!cfg) return need();
  /* HISTORIQUE AUTO : compteurs cumulés + dernières sessions détectées côté serveur */
  if (seg === 'stats' && request.method === 'GET') {
    let stats = null, sessions = [], snaps = [];
    try { stats = JSON.parse((await env.ACCOUNTS.get('tuya:stats')) || 'null'); } catch { /* */ }
    try { sessions = JSON.parse((await env.ACCOUNTS.get('tuya:sessions')) || '[]'); } catch { /* */ }
    try { snaps = JSON.parse((await env.ACCOUNTS.get('tuya:snaps')) || '[]'); } catch { /* */ }
    return J({ ok: true, stats, sessions: sessions.slice(0, 60), snaps: snaps.slice(0, 48) });
  }
  /* BASELINE officielle (fiche de nettoyage de l'app Beatbot, fournie par Kevin) :
     totaux affichés = base + relevés auto → l'app colle aux compteurs d'origine */
  if (seg === 'stats' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    let stats = null; try { stats = JSON.parse((await env.ACCOUNTS.get('tuya:stats')) || 'null'); } catch { /* */ }
    if (!stats) stats = { count: 0, minutes: 0, m2: 0, since: Date.now() };
    if (Number.isFinite(+b.baseCount)) stats.baseCount = Math.max(0, Math.round(+b.baseCount));
    if (Number.isFinite(+b.baseMinutes)) stats.baseMinutes = Math.max(0, Math.round(+b.baseMinutes));
    if (Number.isFinite(+b.baseM2)) stats.baseM2 = Math.max(0, Math.round(+b.baseM2));
    stats.baseSource = String(b.source || 'app Beatbot').slice(0, 120);
    stats.baseAt = Date.now();
    await env.ACCOUNTS.put('tuya:stats', JSON.stringify(stats));
    try { await audLog(env, { ev: 'tuya_stats_baseline', c: stats.baseCount, m: stats.baseMinutes }); } catch { /* */ }
    return J({ ok: true, stats });
  }
  /* MODÈLE PROFOND (thing model v2.0) : TOUS les DP du produit, y compris ceux absents
     de /specifications — pour vérifier s'il existe un DP « mode/surface » caché. Lecture seule. */
  if (seg === 'model' && request.method === 'GET') {
    if (!cfg.device_id) return J({ ok: false, reason: 'no_device' });
    const r = await tuyaBiz(env, cfg, 'GET', '/v2.0/cloud/thing/' + encodeURIComponent(cfg.device_id) + '/model', null);
    return J({ ok: r.ok, model: r.result || null, detail: r.ok ? undefined : (r.msg || ('code ' + r.code)) });
  }
  /* PROPRIÉTÉS COMPLÈTES (shadow properties v2.0) : les VALEURS live de TOUS les DP
     (température d'eau, litres filtrés, position, mode courant…) — /status n'en
     renvoie qu'un sous-ensemble. Lecture seule. */
  if (seg === 'props' && request.method === 'GET') {
    if (!cfg.device_id) return J({ ok: false, reason: 'no_device' });
    const r = await tuyaBiz(env, cfg, 'GET', '/v2.0/cloud/thing/' + encodeURIComponent(cfg.device_id) + '/shadow/properties', null);
    const props = (r.result && r.result.properties) || [];
    return J({ ok: r.ok, properties: props.map((p) => ({ code: p.code, value: p.value, time: p.time })), detail: r.ok ? undefined : (r.msg || ('code ' + r.code)) });
  }
  /* découverte des robots : essaie TOUS les data centers de la zone, retient celui qui
     renvoie le robot, et remonte le diagnostic brut par hôte (compte/erreur) pour qu'on
     voie la vérité si c'est encore vide (leçon #56/#97 : mesurer + détailler). */
  if (seg === 'devices' && request.method === 'GET') {
    const map = (d) => ({ id: d.id, name: d.name, category: d.category, product_name: d.product_name, online: d.online });
    const paths = ['/v1.0/iot-01/associated-users/devices', '/v2.0/cloud/thing/space/devices'];
    const tried = [];
    for (const host of tuyaCandidateHosts(cfg.region, cfg.host)) {
      const m = await tuyaMintToken(host, cfg.access_id, cfg.access_secret);
      if (!m.ok) { tried.push({ host, error: m.detail || 'auth_fail' }); continue; }
      for (const p of paths) {
        const r = await tuyaFetchSigned(host, cfg.access_id, cfg.access_secret, m.token, 'GET', p, null);
        const devs = (r.result && (r.result.devices || (Array.isArray(r.result) ? r.result : null))) || [];
        if (!r.ok) { tried.push({ host, path: p, error: r.msg || ('code ' + r.code) }); continue; }
        tried.push({ host, path: p, count: devs.length });
        if (devs.length) {
          if (host !== cfg.host) { cfg.host = host; await tuyaSaveCfg(env, cfg); }
          await env.ACCOUNTS.put('tuya:token', JSON.stringify({ token: m.token, exp: m.exp }), { expirationTtl: 7200 });
          return J({ ok: true, devices: devs.map(map), host, tried });
        }
      }
    }
    return J({ ok: true, devices: [], tried }); /* honnête : rien trouvé + diag par hôte */
  }
  /* choisir le robot actif */
  if (seg === 'select' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const id = String(b.device_id || '').trim(); if (!id) return J({ ok: false, reason: 'missing' });
    cfg.device_id = id; await tuyaSaveCfg(env, cfg);
    return J({ ok: true, device_id: id });
  }
  if (seg === 'unlink' && request.method === 'POST') {
    try { await env.ACCOUNTS.delete('tuya:cfg'); await env.ACCOUNTS.delete('tuya:token'); await env.ACCOUNTS.delete('tuya:online'); } catch { /* */ }
    return J({ ok: true, linked: false });
  }
  /* état de surface (sentinelle) : dernier état connu + check live à la demande */
  if (seg === 'surface' && request.method === 'GET') {
    const r = await tuyaSurfaceCheck(env);
    let last = null; try { last = JSON.parse((await env.ACCOUNTS.get('tuya:online')) || 'null'); } catch { /* */ }
    return J({ ok: true, check: r, last });
  }
  /* PROGRAMMATION (planning horaire + auto-relance après charge) — lit/écrit la config KV.
     N'exige pas de robot choisi pour LIRE, mais le moteur cron n'agit que si device choisi. */
  if (seg === 'schedule' && request.method === 'GET') {
    let s = null; try { s = JSON.parse((await env.ACCOUNTS.get('tuya:schedule')) || 'null'); } catch { /* */ }
    return J({ ok: true, schedule: s || { enabled: false, tz: 'Europe/Monaco', slots: [], suction: 'strong', autoResume: false, minBatt: 20 } });
  }
  if (seg === 'schedule' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const slots = Array.isArray(b.slots) ? b.slots.slice(0, 21).filter((x) => x && /^[0-6]$/.test(String(x.dow)) && /^\d{1,2}:\d{2}$/.test(String(x.hm))).map((x) => ({ dow: +x.dow, hm: String(x.hm) })) : [];
    const s = { enabled: !!b.enabled, tz: 'Europe/Monaco', slots, suction: ['strong', 'normal', 'gentle'].includes(b.suction) ? b.suction : 'strong', autoResume: !!b.autoResume, minBatt: Math.max(0, Math.min(90, Number(b.minBatt) || 20)) };
    await env.ACCOUNTS.put('tuya:schedule', JSON.stringify(s));
    try { await audLog(env, { ev: 'tuya_schedule_set', slots: slots.length, enabled: s.enabled, autoResume: s.autoResume }); } catch { /* */ }
    return J({ ok: true, schedule: s });
  }
  /* les routes suivantes ont besoin d'un robot choisi */
  if (!cfg.device_id) return J({ ok: false, reason: 'no_device', detail: 'Choisis d\'abord ton robot (découverte).' });
  const idp = encodeURIComponent(cfg.device_id);
  /* démarrage serveur d'un cycle complet (bouton « Lancer maintenant » côté app) */
  if (seg === 'start' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* */ }
    const r = await tuyaStartClean(env, cfg, { suction: b && b.suction, src: 'manual' });
    return J(r);
  }
  if (seg === 'status' && request.method === 'GET') {
    const info = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp, null);
    const st = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/status', null);
    if (!st.ok && !info.ok) return J({ ok: false, reason: 'tuya_error', detail: st.detail || st.msg || info.msg || ('code ' + st.code) });
    return J({ ok: true, online: info.result && info.result.online, name: info.result && info.result.name, status: st.result || [] });
  }
  if (seg === 'functions' && request.method === 'GET') {
    const r = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/functions', null);
    if (!r.ok) return J({ ok: false, reason: 'tuya_error', detail: r.detail || r.msg || ('code ' + r.code) });
    return J({ ok: true, functions: (r.result && r.result.functions) || [] });
  }
  /* modèle COMPLET du robot : toutes les commandes écrivables + tous les capteurs (le
     data model Tuya, souvent plus riche que /functions). Sert à exploiter le MAX réel. */
  if (seg === 'spec' && request.method === 'GET') {
    const r = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/specifications', null);
    if (!r.ok) return J({ ok: false, reason: 'tuya_error', detail: r.detail || r.msg || ('code ' + r.code) });
    return J({ ok: true, category: r.result && r.result.category, functions: (r.result && r.result.functions) || [], status: (r.result && r.result.status) || [] });
  }
  if (seg === 'command' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
    const cmds = Array.isArray(b.commands) ? b.commands : null;
    if (!cmds || !cmds.length) return J({ ok: false, reason: 'missing', detail: 'commands[] requis.' });
    const safe = cmds.filter((c) => c && typeof c.code === 'string').map((c) => ({ code: c.code, value: c.value }));
    const r = await tuyaBiz(env, cfg, 'POST', '/v1.0/devices/' + idp + '/commands', { commands: safe });
    try { await audLog(env, { ev: 'tuya_command', codes: safe.map((c) => c.code).join(',') }); } catch { /* */ }
    if (!r.ok) return J({ ok: false, reason: 'tuya_error', detail: r.detail || r.msg || ('code ' + r.code) });
    return J({ ok: true, sent: safe });
  }
  return J({ ok: false, reason: 'not_found' });
}

/* ---- Sentinelle « robot en surface » (le robot n'émet pas sous l'eau) ----
   Le robot ne redevient joignable QUE quand il remonte (surface/base) — fenêtre de
   quelques minutes. Cron Cloudflare toutes les 5 min : lit l'état Tuya, détecte la
   transition hors-ligne → EN LIGNE, et pousse une notif iPhone à Kevin (« 🌊 Robot en
   surface — batterie X% ») via l'infra push existante. S'active AUTOMATIQUEMENT dès que
   les clés Tuya sont liées ; sans liaison → no-op (1 lecture KV). ANTI-SPAM : notifie
   UNIQUEMENT à la transition + throttle 15 min. Fail-open total (jamais d'exception). */
async function tuyaSurfaceCheck(env) {
  try {
    if (!env || !env.ACCOUNTS) return { ok: true, skip: 'no_kv' };
    const cfg = await tuyaCfg(env);
    if (!cfg || !cfg.device_id) return { ok: true, skip: 'not_linked' };
    const idp = encodeURIComponent(cfg.device_id);
    const info = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp, null);
    if (!info.ok) return { ok: false, reason: info.msg || info.reason || ('code ' + info.code) };
    const online = !!(info.result && info.result.online);
    let prev = null; try { prev = JSON.parse((await env.ACCOUNTS.get('tuya:online')) || 'null'); } catch { /* */ }
    await env.ACCOUNTS.put('tuya:online', JSON.stringify({ online, ts: Date.now() }));
    if (!(online && prev && prev.online === false)) return { ok: true, online, notified: false };
    /* transition plongée → SURFACE : notif (throttle 15 min) */
    const lastN = Number((await env.ACCOUNTS.get('tuya:surf_notif')) || 0);
    if (Date.now() - lastN < 15 * 60 * 1000) return { ok: true, online, notified: false, throttled: true };
    let batt = null;
    const st = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/status', null);
    if (st.ok) (st.result || []).forEach((s) => { const k = String(s.code || '').toLowerCase(); if (batt == null && /electric|battery|soc|residual/.test(k) && typeof s.value === 'number' && s.value >= 0 && s.value <= 100) batt = Math.round(s.value); });
    await notifyPush(env, '🌊 Robot en surface', 'Ton robot piscine est joignable' + (batt != null ? ' — batterie ' + batt + '%' : '') + '. Fenêtre pour commandes et données.', { tag: 'poolpilot-surface', url: 'https://beatbot.kd-mc.com/' });
    await env.ACCOUNTS.put('tuya:surf_notif', String(Date.now()), { expirationTtl: 86400 });
    try { await audLog(env, { ev: 'tuya_surface_notif', batt }); } catch { /* */ }
    return { ok: true, online, notified: true, batt };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 200) }; }
}

/* ---- HISTORIQUE AUTO (comme l'app d'origine) : le robot remonte clean_time /
   clean_area / batterie via Tuya → à chaque tick cron (5 min) on détecte les cycles
   TERMINÉS et on les enregistre côté serveur (KV), même app fermée. Aucune invention :
   uniquement les valeurs RÉELLES remontées par le robot. Astuce fiabilité : sous l'eau
   le robot est hors wifi → on peut rater le passage « cleaning » ; mais les DP gardent
   les compteurs de la DERNIÈRE session → tout CHANGEMENT de clean_time/clean_area
   (hors nettoyage en cours) = un cycle réel qui vient de finir. */
async function tuyaHistoryTick(env) {
  try {
    if (!env || !env.ACCOUNTS) return { ok: true, skip: 'no_kv' };
    const cfg = await tuyaCfg(env);
    if (!cfg || !cfg.device_id) return { ok: true, skip: 'not_linked' };
    const idp = encodeURIComponent(cfg.device_id);
    /* shadow properties = TOUTES les valeurs (status/compteurs + température d'eau,
       litres filtrés, mode…) en UN appel — repli sur /status si indisponible */
    let dps = null;
    const sh = await tuyaBiz(env, cfg, 'GET', '/v2.0/cloud/thing/' + idp + '/shadow/properties', null);
    if (sh.ok && sh.result && Array.isArray(sh.result.properties)) dps = sh.result.properties;
    if (!dps) {
      const st = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/status', null);
      if (!st.ok) return { ok: false, reason: st.msg || st.reason || ('code ' + st.code) };
      dps = st.result || [];
    }
    let ct = null, ca = null, batt = null, status = '', temp = null, fw = null, mode = null;
    (dps || []).forEach((s) => {
      const k = String(s.code || '').toLowerCase(), v = s.value;
      if (k === 'status') status = String(v);
      if (k === 'mode') mode = String(v);
      if (k === 'water_temperature' && typeof v === 'number') temp = v;
      if (k === 'filtered_water' && typeof v === 'number') fw = v;
      if (ct == null && /clean_time|work_time/.test(k) && typeof v === 'number') ct = v;
      if (ca == null && /clean_area|^area$/.test(k) && typeof v === 'number') ca = v;
      if (batt == null && /battery|electric|residual|soc/.test(k) && typeof v === 'number' && v >= 0 && v <= 100) batt = Math.round(v);
    });
    /* INSTANTANÉS pendant le travail : à CHAQUE changement observé (remontée, progression,
       température…), on archive un point {ts,…} → « toutes les infos, auto, temps réel » */
    try {
      let snaps = []; try { snaps = JSON.parse((await env.ACCOUNTS.get('tuya:snaps')) || '[]'); } catch { /* */ }
      const lastSnap = snaps[0] || {};
      const snap = { ts: Date.now(), st: status, batt, ct, ca, temp, fw, mode };
      const moved = ['st', 'batt', 'ct', 'ca', 'temp', 'fw', 'mode'].some((k) => snap[k] !== lastSnap[k]);
      if (moved) { snaps.unshift(snap); if (snaps.length > 288) snaps = snaps.slice(0, 288); await env.ACCOUNTS.put('tuya:snaps', JSON.stringify(snaps)); }
    } catch { /* jamais bloquant */ }
    let last = null; try { last = JSON.parse((await env.ACCOUNTS.get('tuya:lastdp')) || 'null'); } catch { /* */ }
    const cur = { ct, ca, batt, status, ts: Date.now() };
    if (!last) { await env.ACCOUNTS.put('tuya:lastdp', JSON.stringify(cur)); return { ok: true, first: true }; }
    /* états « cycle EN COURS » mesurés via thing model (2026-07-21) : le robot peut faire
       surface mi-cycle (emerge/diving/return_trip) → ne PAS finaliser sur ces états,
       sinon on compterait une session partielle + une complète (double comptage) */
    const inProgress = /cleaning|diving|emerge|clean_wait|return_trip/.test(status);
    const changed = (ct != null && ct !== last.ct) || (ca != null && ca !== last.ca);
    const finished = changed && !inProgress && ct != null && ct >= 3;
    if (finished) {
      let sessions = []; try { sessions = JSON.parse((await env.ACCOUNTS.get('tuya:sessions')) || '[]'); } catch { /* */ }
      sessions.unshift({ ts: Date.now(), dur: ct, area: ca, batt, src: 'auto' });
      if (sessions.length > 300) sessions = sessions.slice(0, 300);
      await env.ACCOUNTS.put('tuya:sessions', JSON.stringify(sessions));
      let stats = null; try { stats = JSON.parse((await env.ACCOUNTS.get('tuya:stats')) || 'null'); } catch { /* */ }
      if (!stats) stats = { count: 0, minutes: 0, m2: 0, since: Date.now() };
      stats.count += 1; stats.minutes += ct; stats.m2 += (ca || 0);
      await env.ACCOUNTS.put('tuya:stats', JSON.stringify(stats));
      try { await audLog(env, { ev: 'tuya_session_logged', dur: ct, area: ca, batt }); } catch { /* */ }
    }
    /* la référence n'avance PAS pendant un cycle en cours (sinon on rate la fin) */
    if (!inProgress) await env.ACCOUNTS.put('tuya:lastdp', JSON.stringify(cur));
    return { ok: true, recorded: !!finished };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 200) }; }
}

/* Grant admin MACHINE : produit le même jeton signé que /__admin/login, mais à
   partir du SECRET SSO (pas du code PIN). Sert à l'agent de contrôle GitHub Actions
   pour s'authentifier en admin et vérifier le bot À LA PLACE de Kevin, sans jamais
   détenir son Face ID. Minter un jeton exige déjà le secret → n'affaiblit rien.
   Utilise le MÊME ssoSign que le worker → zéro dérive (le jeton est forcément accepté). */
async function adminGrant(secret) { return ssoSign(secret, '__kdmc_admin__', 'admin', 1); }

/* ---- Moteur « programme » PoolPilot (par-dessus les 4 vraies commandes) ----
   Le firmware du robot est fermé/signé : on ne le modifie PAS. À la place, on lui ajoute
   des capacités par orchestration serveur des commandes réelles : planning horaire +
   auto-relance après charge. Garde-fous stricts (jamais de démarrage à l'aveugle). */
async function tuyaStartClean(env, cfg, opts) {
  opts = opts || {};
  const idp = encodeURIComponent(cfg.device_id);
  const info = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp, null);
  if (!info.ok) return { ok: false, reason: info.msg || info.reason || ('code ' + info.code) };
  if (!(info.result && info.result.online)) return { ok: false, reason: 'offline' };
  const st = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/status', null);
  let status = '', batt = null;
  if (st.ok) (st.result || []).forEach((s) => { const k = String(s.code || '').toLowerCase(); if (k === 'status') status = String(s.value); if (batt == null && /battery|electric|residual|soc/.test(k) && typeof s.value === 'number') batt = s.value; });
  if (/cleaning/.test(status)) return { ok: false, reason: 'already_cleaning' };
  const minB = typeof opts.minBatt === 'number' ? opts.minBatt : 20;
  if (batt != null && batt < minB) return { ok: false, reason: 'low_batt', batt };
  const suc = ['strong', 'normal', 'gentle'].includes(opts.suction) ? opts.suction : 'strong';
  const r = await tuyaBiz(env, cfg, 'POST', '/v1.0/devices/' + idp + '/commands', { commands: [{ code: 'suction', value: suc }, { code: 'switch', value: true }, { code: 'switch_go', value: true }] });
  if (r.ok) { try { await audLog(env, { ev: 'tuya_autostart', src: opts.src || 'sched', batt, suction: suc }); } catch { /* */ } }
  return { ok: r.ok, reason: r.ok ? null : (r.detail || r.msg || ('code ' + r.code)), batt };
}
/* Tick cron (toutes les 5 min) : auto-relance après charge + déclenchements planifiés
   (Europe/Monaco, DST-safe via Intl). Fail-open total ; no-op si non lié / non activé. */
async function tuyaScheduleTick(env) {
  try {
    if (!env || !env.ACCOUNTS) return { ok: true, skip: 'no_kv' };
    const cfg = await tuyaCfg(env);
    if (!cfg || !cfg.device_id) return { ok: true, skip: 'not_linked' };
    let sched = null; try { sched = JSON.parse((await env.ACCOUNTS.get('tuya:schedule')) || 'null'); } catch { /* */ }
    if (!sched) return { ok: true, skip: 'no_schedule' };
    const idp = encodeURIComponent(cfg.device_id);
    /* AUTO-RELANCE : mémorise le statut ; si on a nettoyé puis chargé, relance à charge_done */
    if (sched.autoResume) {
      const st = await tuyaBiz(env, cfg, 'GET', '/v1.0/devices/' + idp + '/status', null);
      let status = '';
      if (st.ok) (st.result || []).forEach((s) => { if (String(s.code || '').toLowerCase() === 'status') status = String(s.value); });
      let prev = ''; try { prev = (await env.ACCOUNTS.get('tuya:laststatus')) || ''; } catch { /* */ }
      if (status) await env.ACCOUNTS.put('tuya:laststatus', status);
      if (/cleaning/.test(prev) && /goto_charge|charging/.test(status)) await env.ACCOUNTS.put('tuya:resume_pending', '1', { expirationTtl: 86400 });
      let want = false; try { want = (await env.ACCOUNTS.get('tuya:resume_pending')) === '1'; } catch { /* */ }
      if (want && /charge_done/.test(status)) {
        const r = await tuyaStartClean(env, cfg, { suction: sched.suction, minBatt: sched.minBatt, src: 'resume' });
        await env.ACCOUNTS.delete('tuya:resume_pending');
        if (r.ok) await notifyPush(env, '🔁 Robot relancé', 'Rechargé — je relance le nettoyage pour finir la piscine.', { tag: 'poolpilot-resume', url: 'https://beatbot.kd-mc.com/' });
      }
    }
    /* PLANNING HORAIRE */
    if (sched.enabled && Array.isArray(sched.slots) && sched.slots.length) {
      const tz = sched.tz || 'Europe/Monaco';
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      const wk = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      let dow = -1, hh = 0, mm = 0;
      parts.forEach((p) => { if (p.type === 'weekday') dow = wk[p.value]; if (p.type === 'hour') hh = +p.value; if (p.type === 'minute') mm = +p.value; });
      const nowMin = hh * 60 + mm;
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      for (const sl of sched.slots) {
        if (+sl.dow !== dow) continue;
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(sl.hm || ''));
        if (!m) continue;
        const slotMin = (+m[1]) * 60 + (+m[2]);
        if (slotMin < nowMin || slotMin >= nowMin + 5) continue; /* fenêtre du tick (cron 5 min) */
        const firedKey = 'tuya:fired:' + dateKey + ':' + sl.dow + ':' + sl.hm;
        let already = false; try { already = (await env.ACCOUNTS.get(firedKey)) === '1'; } catch { /* */ }
        if (already) continue;
        await env.ACCOUNTS.put(firedKey, '1', { expirationTtl: 172800 });
        const r = await tuyaStartClean(env, cfg, { suction: sched.suction, minBatt: sched.minBatt, src: 'sched' });
        await notifyPush(env, r.ok ? '🗓️ Nettoyage programmé lancé' : '🗓️ Nettoyage non lancé', r.ok ? ('Le robot démarre (aspiration ' + (sched.suction || 'strong') + ').') : ('Impossible : ' + (r.reason || '?') + '. Vérifie qu\'il est dans l\'eau et chargé.'), { tag: 'poolpilot-sched', url: 'https://beatbot.kd-mc.com/' });
      }
    }
    return { ok: true };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 200) }; }
}

/* Export nommé pour les tests régression (Cloudflare utilise seulement le default export). */
export { APPS, ROUTES, appDe, perimetre, ssoSign, ficheNettoyee, enrich, adminGrant, quotaInscription, INSCR_PAR_IP_JOUR, INSCR_TOTAL_JOUR, beatbotTargetOk, tuyaStringToSign, tuyaSign, tuyaSha256Hex, tuyaHmacHex, tuyaSurfaceCheck, tuyaScheduleTick, tuyaStartClean, tuyaHistoryTick };
