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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      if (!urlSure(page.url())) throw new Error('redirigée hors des adresses permises');
      const html = await page.content();
      return htmlEnTexte(html.slice(0, 1500000), page.url());
    } finally { await fermer(); }
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
  let pause = 60000, derniereImage = 0;
  do {
    /* v30.10 : dossier d'images déposées (DELEGUE_DOSSIER_IMAGES), une toutes les 2 min au plus : captures de Chrome (Monaco…), lues par les yeux gratuits */
    try { if (process.env.DELEGUE_DOSSIER_IMAGES && Date.now() - derniereImage > Number(process.env.DELEGUE_PAUSE_IMAGE_MS || 120000)) { if (await traiterDossier(process.env.DELEGUE_DOSSIER_IMAGES, { journal })) derniereImage = Date.now(); } } catch (e) { journal('⚠️ dossier d\'images : ' + e.message); }
    try { const r = await faireUnTravail({ pour, lirePage, journal }); if (r) { journal(`travail ${r.id} rendu (${r.statut}) ${JSON.stringify(r.stats || {})}`); pause = 15000; } else pause = Math.min(120000, Math.max(60000, pause)); }
    catch (e) { journal('⚠️ ' + e.message); pause = 120000; }
    if (!args.includes('--boucle')) break;
    await new Promise((ok) => setTimeout(ok, pause));
  } while (true);
  if (browser) await browser.close();
}
