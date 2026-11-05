#!/usr/bin/env node
/* L'AGENT GRATUIT DU LENOVO (et de toute machine allumée) — il PREND les travaux de la file, les fait avec les IA gratuites, RENDS le rapport (Kevin 29.10.2026).
 *   node tools/delegue/agent.mjs --boucle [--navigateur]     reste en veille : un coup d'œil toutes les 60 s (15 s après un travail), 0 jeton du forfait
 *   node tools/delegue/agent.mjs --une-fois [--navigateur]   prend au plus un travail, le fait, s'arrête
 * Nom de la machine : DELEGUE_MACHINE (défaut « lenovo ») = le champ `pour` des travaux qu'elle prend.
 * --navigateur : lit les pages avec un Chromium NEUF (Playwright), SANS cookie ni profil : jamais le Chrome connecté de Kevin (ses comptes Cloudflare, GitHub, Google, admin
 * ne sont pas à la portée d'une IA gratuite ni d'une page qui tenterait de l'influencer). Sans --navigateur : simple lecture réseau (pages statiques).
 * Ce que l'agent NE fait jamais : cliquer, remplir un formulaire, se connecter, télécharger, ouvrir une adresse que la branche n'a pas donnée ou que la page n'offre pas
 * dans la même site (désignée par numéro), garder un cookie. Lecture seule et rapport. */
import { api, BASE } from './jobs.mjs';
import { chercher, lirePageFetch, htmlEnTexte } from './chercheur.mjs';
import { urlSure } from '../../services/kdmc-apis/adresses.mjs';
import { lireMedia, estMedia, traiterDossier } from './vision.mjs';

export async function lirePageNavigateur(contexteNeuf) {   // contexteNeuf() → { page, fermer } d'un navigateur isolé
  return async (url) => {
    if (!urlSure(url)) throw new Error('adresse non permise');
    const { page, fermer } = await contexteNeuf();
    try {
      const rep = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      if (!urlSure(page.url())) throw new Error('redirigée hors des adresses permises');
      /* 5.11 (mesure de pc-config sur le Lenovo : Geneanet « Just a moment… » et Gallica « Attention Required! » = mur Cloudflare, HTTP 403, rendus « lus, 0 trouvaille ») :
         une page refusée n'est JAMAIS une page lue. Le mur n'est pas contourné (règle) ; la page est comptée « refusée », pas « lue ». */
      const etat = rep && typeof rep.status === 'function' ? rep.status() : 0;
      const titre = typeof page.title === 'function' ? String(await page.title().catch(() => '') || '') : '';
      if (etat >= 400 || /just a moment|attention required|access denied|un instant|vérification de sécurité/i.test(titre)) throw new Error('page refusée HTTP ' + (etat || '?'));
      const html = await page.content();
      return htmlEnTexte(html.slice(0, 1500000), page.url());
    } finally { await fermer(); }
  };
}

/** 5.11 (mesure des 80 derniers travaux : Google Livres refuse 54 % des lectures par « trop de demandes », 429) : UNE pause minimale entre deux lectures d'un même site, et UNE nouvelle tentative après un 429 / 5xx.
 *  Les API JSON publiques (Europeana, archive.org, Wikipédia / Wikidata / Wikisource / Commons, matchID) se lisent par simple requête : plus rapide, aucun mur, pas de Chromium. */
export const API_JSON = /^https:\/\/(api\.europeana\.eu\/|archive\.org\/(services|advancedsearch)|[a-z]+\.(wikipedia|wikisource|wikimedia)\.org\/w\/api\.php|www\.wikidata\.org\/w\/api\.php|deces\.matchid\.io\/)/i;
/** Europeana et la recherche plein texte d'archive.org rendent un JSON énorme (50 Ko) dont l'IA n'en lit que 12 000 caractères : on le ramène à UNE ligne par résultat (titre, année, fonds, extrait, adresse). */
export function compacterApi(url, texte) {
  try {
    const j = JSON.parse(texte), t = (x, n = 200) => [].concat(x || []).join(' / ').replace(/\s+/g, ' ').slice(0, n);
    if (/api\.europeana\.eu/.test(url)) return (j.items || []).map((i, n) => `${n + 1}. ${t(i.title)} | ${t(i.year, 20)} | ${t(i.dataProvider, 60)} | ${t(i.dcDescription, 300)} | ${String(i.guid || '').split('?')[0]}`).join('\n') || 'aucun résultat';
    const hits = j.response && j.response.body && j.response.body.hits && j.response.body.hits.hits;
    if (/archive\.org\/services\/search/.test(url) && Array.isArray(hits)) return hits.map((h, n) => { const f = h.fields || {}; return `${n + 1}. ${t(f.title)} | ${t(f.creator, 80)} | https://archive.org/details/${f.identifier} | ${t(((h.highlight || {}).text || []).join(' … ').replace(/\{\{\{|\}\}\}/g, ''), 500)}`; }).join('\n') || 'aucun résultat';
  } catch (_) { /* pas du JSON attendu : on rend le texte tel quel */ }
  return texte;
}
export async function lireApi(url, opts) { const r = await lirePageFetch(url, opts); return { texte: compacterApi(url, r.texte), liens: [] }; }
export function avecPolitesse(lirePageNavigateurOuFetch, { pauseMs = 1500, attenteMs = 8000, fetchLire = lireApi, dormir = (ms) => new Promise((ok) => setTimeout(ok, ms)) } = {}) {
  const dernier = new Map();
  return async (url) => {
    const h = new URL(url).hostname, lire = API_JSON.test(url) ? fetchLire : lirePageNavigateurOuFetch;
    const attendre = async () => { const d = (dernier.get(h) || 0) + pauseMs - Date.now(); if (d > 0) await dormir(d); dernier.set(h, Date.now()); };
    await attendre();
    try { return await lire(url); }
    catch (e) {
      if (!/\b(429|50[0-9])\b/.test(String(e && e.message))) throw e;
      await dormir(attenteMs); await attendre();
      return await lire(url);
    }
  };
}

export async function faireUnTravail({ pour, lirePage, fetchImpl, demander, base = BASE(), jeton, journal = () => {}, lireImage = lireMedia }) {
  const o = { fetchImpl, base, jeton };
  const { job } = await api('/next?pour=' + encodeURIComponent(pour), o);
  if (!job) return null;
  journal(`travail ${job.id} de ${job.de} : ${job.urls.length} adresse(s)`);
  let rapport, statut = 'fait';
  /* v30.10 : une adresse d'image ou de PDF (registre scanné, acte manuscrit) est lue par les yeux gratuits (vision.mjs), le reste par la page */
  const lire = (u) => (estMedia(u) ? lireImage(u) : lirePage(u));
  try { rapport = await chercher({ consigne: job.consigne, urls: job.urls, maxPages: job.max_pages, domaine: job.domaine, lirePage: lire, demander, journal }); }
  catch (e) { statut = 'echec'; rapport = { version: 1, erreur: String(e && e.message || e).slice(0, 200) }; }
  await api(`/${job.id}/resultat`, { ...o, methode: 'POST', corps: { statut, resultat: rapport } });
  return { id: job.id, statut, stats: rapport.stats };
}

if (process.argv[1] && /(^|[\\/])agent\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2), pour = process.env.DELEGUE_MACHINE || 'lenovo';
  const journal = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
  let lirePage = lirePageFetch, browser = null;
  if (args.includes('--navigateur')) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    lirePage = await lirePageNavigateur(async () => { const c = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' }); const page = await c.newPage(); page.on('dialog', (d) => d.dismiss().catch(() => {})); return { page, fermer: () => c.close() }; });
  }
  journal(`agent « ${pour} » prêt (${args.includes('--navigateur') ? 'navigateur neuf, sans cookie' : 'lecture réseau'}) — file : ${BASE()}`);
  /* 5.11 (Kevin : « qu'ils travaillent à fond, sans limite ») : N recherches EN PARALLÈLE (--parallele N, défaut 3 en boucle ; la file donne un travail différent à chacun, la prise est atomique), 3 s de repos entre deux travaux quand la file n'est pas vide
     (avant : 15 s), 30 s quand elle est vide (avant : 60 à 120 s). Un seul Chromium, un contexte neuf par page. Toujours : lecture seule, sans cookie. */
  const iPar = args.indexOf('--parallele'), nPar = Math.max(1, Math.min(6, iPar >= 0 ? Number(args[iPar + 1]) || 3 : (args.includes('--boucle') ? 3 : 1)));
  const lirePoli = avecPolitesse(lirePage);
  let derniereImage = 0;
  const unTour = async (num) => {
    let pause = 30000;
    try { if (process.env.DELEGUE_DOSSIER_IMAGES && Date.now() - derniereImage > Number(process.env.DELEGUE_PAUSE_IMAGE_MS || 120000)) { if (await traiterDossier(process.env.DELEGUE_DOSSIER_IMAGES, { journal })) derniereImage = Date.now(); } } catch (e) { journal('⚠️ dossier d\'images : ' + e.message); }
    try { const r = await faireUnTravail({ pour, lirePage: lirePoli, journal: (m) => journal(`[${num}] ${m}`) }); if (r) { journal(`[${num}] travail ${r.id} rendu (${r.statut}) ${JSON.stringify(r.stats || {})}`); pause = 3000; } else pause = 30000; }
    catch (e) { journal(`[${num}] ⚠️ ` + e.message); pause = 120000; }
    return pause;
  };
  const boucle = async (num) => { do { const pause = await unTour(num); if (!args.includes('--boucle')) break; await new Promise((ok) => setTimeout(ok, pause + num * 700)); } while (true); };
  await Promise.all(Array.from({ length: nPar }, (_, i) => boucle(i + 1)));
  if (browser) await browser.close();
}
