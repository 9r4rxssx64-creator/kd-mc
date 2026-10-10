#!/usr/bin/env node
/* COUPER LE COMPTEUR DE VISITES CLOUDFLARE (Web Analytics / RUM) SUR kd-mc.com — Kevin, 10.10.2026 : « Coupe ».
 *
 * Mesuré le 10.10 par le robot de vérification réelle (run 38069453066) : Cloudflare pose tout seul
 * `static.cloudflareinsights.com/beacon.min.js` dans CHAQUE page HTML du domaine, et la règle de sécurité des pages
 * (CSP `script-src 'self'`) le refuse → une erreur console à chaque ouverture, zéro visite comptée, et un bruit qui
 * cache les vraies erreurs. Décision de Kevin : couper l'injection, ne rien ouvrir dans les pages.
 *
 * DEUX VOIES, toutes deux par l'API Cloudflare (jeton du coffre, jamais écrit ici) :
 *   A. le compte : chaque « site » Web Analytics de l'hôte passe `auto_install: false` (plus d'injection, données gardées) ;
 *   B. la zone : une règle de configuration `disable_rum: true` sur toutes les requêtes (gagne toujours sur Web Analytics).
 * Puis la PREUVE : la page d'accueil est rechargée depuis le vrai domaine jusqu'à ce que la balise ait disparu.
 * Si le jeton n'a pas le droit (403), le script le dit mot pour mot et sort en échec — rien n'est deviné.
 * Les identifiants mis dans les adresses (compte, zone, site) viennent tous des RÉPONSES de l'API, jamais de l'environnement.
 *
 * Lancement : CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID pour choisir le compte) → node tools/cloudflare/analytics-couper.mjs
 * (robot : .github/workflows/coffre-cloudflare-analytics-couper.yml, à la main). Garde : test:cloudflare-analytics-couper.
 */
import { setTimeout as dormir } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const HOTE = 'kd-mc.com';
export const BALISE = /static\.cloudflareinsights\.com\/beacon\.min\.js/;
export const DESCRIPTION = 'KDMC — compteur Web Analytics coupé (Kevin 10.10.2026)';

/* La page servie porte-t-elle la balise posée par Cloudflare ? */
export const beaconPresent = (html) => BALISE.test(String(html ?? ''));
/* Les « sites » Web Analytics de l'hôte (et de ses sous-domaines) encore en injection automatique. */
export const sitesACouper = (sites, hote = HOTE) => (sites ?? []).filter((s) => s?.auto_install === true
  && (s.host === hote || String(s.host ?? '').endsWith('.' + hote)));
/* Une règle de configuration qui coupe déjà le RUM est-elle posée (et active) ? */
export const regleDejaPosee = (regles) => (regles ?? []).some((r) => r?.enabled !== false && r?.action === 'set_config'
  && r?.action_parameters?.disable_rum === true);
/* Les règles existantes, inchangées (sans les champs de version que l'API refuse en écriture), plus la nôtre à la fin. */
export const avecRegle = (regles) => {
  const gardees = (regles ?? []).map((r) => { const c = { ...r }; delete c.version; delete c.last_updated; return c; });
  return [...gardees, { expression: 'true', description: DESCRIPTION, action: 'set_config', action_parameters: { disable_rum: true }, enabled: true }];
};

const API = 'https://api.cloudflare.com/client/v4';
const JETON = String(process.env.CLOUDFLARE_API_TOKEN ?? '').trim();
const COMPTE_VOULU = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
/* Rien de ce qui vient du réseau n'écrit de retour à la ligne dans le journal (injection de journal). */
const propre = (t) => String(t ?? '').replace(/[\r\n\t\0]+/g, ' ');
const dire = (t) => console.log(propre(t));
/* Un identifiant d'API (compte, zone, site) n'entre dans une adresse que s'il a la forme attendue — sinon on s'arrête. */
export function identifiant(v) {
  const s = String(v ?? '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw new Error('identifiant inattendu dans la réponse de l\'API');
  return encodeURIComponent(s);
}

async function cf(methode, chemin, corps) {
  const r = await fetch(API + chemin, { method: methode, headers: { authorization: 'Bearer ' + JETON, 'content-type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && j.success !== false, result: j.result, erreurs: propre((j.errors ?? []).map((e) => `${e.code} ${e.message}`).join(' ; ')) };
}
/* La vraie page, depuis le vrai domaine (sonde déclarée au routeur, jamais mise en cache). */
export async function pageServie() {
  const r = await fetch(`https://${HOTE}/`, { headers: { 'x-kdmc-sonde': 'cloudflare-analytics-couper', 'cache-control': 'no-cache' } });
  return { status: r.status, beacon: beaconPresent(await r.text()) };
}
/* Le compte, tel que l'API le connaît (l'identifiant de l'environnement ne sert qu'à choisir parmi ceux du jeton). */
async function compte() {
  const l = await cf('GET', '/accounts?per_page=50');
  if (!l.ok) return { erreur: `comptes du jeton illisibles : HTTP ${l.status} ${l.erreurs}` };
  const tous = l.result ?? [];
  const choisi = tous.find((a) => a.id === COMPTE_VOULU) ?? (tous.length === 1 ? tous[0] : null);
  return choisi ? { id: identifiant(choisi.id) } : { erreur: `${tous.length} compte(s) vus par le jeton, aucun ne correspond à CLOUDFLARE_ACCOUNT_ID` };
}

/* Voie A — le compte : auto_install=false sur chaque site de l'hôte. */
async function voieCompte(idCompte) {
  const l = await cf('GET', `/accounts/${idCompte}/rum/site_info/list?per_page=100`);
  if (!l.ok) return { fait: false, erreur: `liste des sites Web Analytics refusée : HTTP ${l.status} ${l.erreurs}` };
  const sites = sitesACouper(l.result);
  dire(`   compte : ${(l.result ?? []).length} site(s) Web Analytics, ${sites.length} en injection automatique sur ${HOTE}`);
  if (!sites.length) return { fait: false, rien: true };
  const reponses = await Promise.all(sites.map((s) => cf('PUT', `/accounts/${idCompte}/rum/site_info/${identifiant(s.site_tag)}`,
    { host: s.host, zone_tag: s.zone_tag, auto_install: false })));
  const refus = [];
  reponses.forEach((p, i) => {
    dire(`   ${sites[i].host} → auto_install=false : ${p.ok ? 'fait' : 'REFUSÉ HTTP ' + p.status + ' ' + p.erreurs}`);
    if (!p.ok) refus.push(`${sites[i].host} : HTTP ${p.status} ${p.erreurs}`);
  });
  return refus.length ? { fait: false, erreur: refus.join(' | ') } : { fait: true };
}
/* Voie B — la zone : règle de configuration disable_rum sur toutes les requêtes. */
async function voieZone() {
  const z = await cf('GET', `/zones?name=${HOTE}`);
  const brut = z.ok ? z.result?.[0]?.id : null;
  if (!brut) return { fait: false, erreur: `zone ${HOTE} introuvable : HTTP ${z.status} ${z.erreurs}` };
  const zone = identifiant(brut);
  const e = await cf('GET', `/zones/${zone}/rulesets/phases/http_config_settings/entrypoint`);
  if (e.status !== 404 && !e.ok) return { fait: false, erreur: `règles de configuration illisibles : HTTP ${e.status} ${e.erreurs}` };
  const regles = e.ok ? (e.result?.rules ?? []) : [];
  if (regleDejaPosee(regles)) {
    dire('   zone : la règle « RUM coupé » est déjà posée');
    return { fait: true };
  }
  const p = await cf('PUT', `/zones/${zone}/rulesets/phases/http_config_settings/entrypoint`, { rules: avecRegle(regles) });
  dire(`   zone : règle disable_rum ${p.ok ? 'posée' : 'REFUSÉE HTTP ' + p.status + ' ' + p.erreurs}`);
  return p.ok ? { fait: true } : { fait: false, erreur: `règle refusée : HTTP ${p.status} ${p.erreurs}` };
}
/* Jusqu'à une minute pour que la balise disparaisse de la vraie page. */
async function attendreDisparition(essais = 6) {
  const etat = await pageServie();
  if (!etat.beacon || essais <= 0) return etat;
  await dormir(10000);
  return attendreDisparition(essais - 1);
}
const nomVoie = (a, b) => { if (a.fait) return 'voie A : compte'; if (b.fait) return 'voie B : règle de zone'; return 'déjà coupé'; };

async function principal() {
  if (!JETON) { dire('❌ CLOUDFLARE_API_TOKEN absent — rien tenté.'); process.exit(1); }
  const avant = await pageServie();
  dire(`Avant : https://${HOTE}/ → HTTP ${avant.status}, balise Cloudflare ${avant.beacon ? 'PRÉSENTE' : 'absente'}`);
  const c = await compte();
  let a = { fait: false, erreur: c.erreur };
  if (!c.erreur) a = await voieCompte(c.id);
  if (a.erreur) dire(`   voie A (compte) : ${a.erreur}`);
  let b = { fait: false };
  if (!a.fait) {
    b = await voieZone();
    if (b.erreur) dire(`   voie B (zone) : ${b.erreur}`);
  }
  const apres = await attendreDisparition();
  dire(`Après : https://${HOTE}/ → HTTP ${apres.status}, balise Cloudflare ${apres.beacon ? 'TOUJOURS PRÉSENTE' : 'absente'}`);
  if (!apres.beacon) {
    dire(`✅ Compteur Cloudflare coupé sur ${HOTE} (${nomVoie(a, b)}).`);
    return;
  }
  dire('❌ La balise est toujours servie. Ce que le jeton n\'a pas pu faire est écrit ci-dessus, mot pour mot.');
  dire('   Un seul interrupteur chez Cloudflare : Web Analytics → kd-mc.com → Manage site → désactiver « Automatic setup ».');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await principal();
  } catch (e) {
    dire(`❌ ${e?.message ?? e}`);
    process.exit(1);
  }
}
