#!/usr/bin/env node
/* LE CAPTEUR D'IMAGES GRATUIT (Kevin 11-12.11.2026 : « les robots gratuits doivent travailler comme les branches du Lenovo »).
 * Ouvre une page d'archives publique dans un Chromium neuf, SANS compte, ni formulaire, ni contournement de captcha, et dépose l'IMAGE du registre dans le dossier d'images ;
 * vision.mjs (Gemini gratuit) la lit ensuite. Recette site par site : arbre-pc, pont n° 2263.
 *   node tools/delegue/capteur.mjs travaux.json [--dossier <dir>] [--max 40]
 *   travaux.json : [{ "id": "bourges-1911-569", "site": "ad06|ad93|ad18|tarn|davel|autre", "url": "https://…" }, …]
 * Règles : une requête à la fois, 3 s entre deux ; 100 images au plus par passage (blocage IP au-delà, constaté sur AD06) ; page « Calcul en cours » (Anubis, tarn, AD06) :
 * on ATTEND qu'elle passe seule (8 s, accueil d'abord) ; un VRAI captcha ou « je ne suis pas un robot » = ARRÊT du site (statut « captcha »), jamais contourné. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { urlSure } from '../../services/kdmc-apis/adresses.mjs';

export const SITES = { ad06: /(^|\.)archives06\.fr$/i, ad93: /(^|\.)archives\.seinesaintdenis\.fr$/i, ad18: /(^|\.)archives18\.fr$/i, tarn: /(^|\.)recherche-archives\.tarn\.fr$/i, davel: /(^|\.)davel-vd\.ch$/i };
export const PAUSE_MS = 3000, MAX_PASSAGE = 100, ATTENTE_ANUBIS_MS = 8000;
export const ANUBIS = /calcul en cours|checking your browser|anubis/i;
export const CAPTCHA = /captcha|je ne suis pas un robot|are you human|verify you are human/i;

/** Quel site ? (par l'adresse, jamais par ce que dit le travail) */
export function siteDe(url) {
  try {
    const h = new URL(url).hostname;
    return Object.keys(SITES).find((k) => SITES[k].test(h)) || 'autre';
  } catch (e) {
    return 'autre'; // adresse illisible : site inconnu, donc refusée plus loin
  }
}
/** Image directe AD06 (IIIF) : dossier du registre, numéro de vue, nom de fichier ; zone optionnelle en pourcentage (haut/bas de page, zoom). */
export function urlIiifAd06({ dossier, vue, fichier, zone, largeur }) {
  const d = String(dossier || '').replace(/[^A-Za-z0-9_-]/g, '');
  const v = String(vue || '').replace(/\D/g, '').padStart(3, '0');
  const f = String(fichier || '').replace(/[^A-Za-z0-9_.-]/g, '');
  if (!d || !v || !f) throw new Error('dossier, vue et fichier requis');
  const zoneOk = zone && /^pct:[\d.]+,[\d.]+,[\d.]+,[\d.]+$/.test(zone);
  const cadre = zoneOk ? zone + '/1100,' : 'full/' + Math.min(+largeur || 1800, 2400) + ',';
  return `https://archives06.fr/iiif/Etat-Civil/${d}/${v}//${f}.jpg/${cadre}/0/default.jpg`;
}
/** Un travail est-il permis ? (https public, site connu, identifiant sûr) */
export function travailPermis(t) {
  if (!t || !/^[A-Za-z0-9_.-]{1,80}$/.test(String(t.id || ''))) return 'identifiant invalide';
  if (!urlSure(t.url)) return 'adresse non permise';
  if (siteDe(t.url) === 'autre') return 'site hors liste (ad06, ad93, ad18, tarn, davel)';
  return '';
}
export function classer(texte) {
  if (CAPTCHA.test(texte)) return 'captcha';
  return ANUBIS.test(texte) ? 'anubis' : 'ok';
}

async function loadPlaywright() {
  for (const n of ['playwright', 'playwright-core']) {
    try {
      return await import(n);
    } catch (e) {
      continue; // module absent : on essaie le suivant
    }
  }
  if (process.env.PW_MODULE_DIR) return import(pathToFileURL(path.join(process.env.PW_MODULE_DIR, 'node_modules', 'playwright-core', 'index.mjs')).href);
  throw new Error('playwright introuvable');
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const texteDe = (page) => page.evaluate(() => (document.body ? document.body.innerText.slice(0, 2000) : '')).catch(() => '');

/** Lit l'état de la page ; si c'est la page d'attente, laisse-lui le temps de passer seule puis relit. */
async function etatApresAttente(page, relancer) {
  let etat = classer(await texteDe(page));
  if (etat !== 'anubis') return etat;
  await dormir(ATTENTE_ANUBIS_MS);
  if (relancer) await relancer();
  etat = classer(await texteDe(page));
  return etat;
}

/** Passe la page d'attente (accueil du site, 8 s, puis l'adresse voulue) ; s'arrête sur un vrai captcha. */
export async function ouvrir(page, url) {
  await page.goto(new URL(url).origin + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  if ((await etatApresAttente(page, null)) === 'captcha') return 'captcha';
  const aller = () => page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
  const r = await aller();
  if (r && !r.ok() && r.status() !== 304) return 'http-' + r.status();
  return etatApresAttente(page, aller);
}

/** Vrai seulement si les octets sont bien ceux d'une image (JPEG, PNG ou WebP) : une page d'erreur HTML n'est jamais « captée ». */
export function estImage(b) {
  if (!b || b.length < 12) return false;
  return (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP');
}

/** Dépose l'image d'un travail (image directe ou capture de la page). */
async function deposer(page, t, dossier) {
  const direct = /\.(jpe?g|png|webp)(\?|$)/i.test(new URL(t.url).pathname) || t.url.includes('/default.jpg');
  const fichier = path.join(dossier, t.id + (direct ? '.jpg' : '.png'));
  if (!direct) {
    await page.screenshot({ path: fichier, fullPage: false });
    return { id: t.id, statut: 'capte', fichier, site: siteDe(t.url) };
  }
  const r = await page.request.get(t.url).catch(() => null);
  if (!r?.ok()) return { id: t.id, statut: 'http-' + (r ? r.status() : 'x') };
  const octets = await r.body();
  if (!estImage(octets)) return { id: t.id, statut: 'pas-une-image', detail: 'le site a répondu autre chose qu\'une image (' + octets.length + ' octets)' };
  fs.writeFileSync(fichier, octets);
  return { id: t.id, statut: 'capte', fichier, site: siteDe(t.url) };
}

/** Un travail : permis ? site arrêté ? page ouverte ? puis image déposée. Une seule requête à la fois, 3 s d'écart. */
async function unTravail(page, t, dossier, bloques) {
  const refus = travailPermis(t);
  if (refus) return { id: t.id, statut: 'refuse', detail: refus };
  const site = siteDe(t.url);
  if (bloques.has(site)) return { id: t.id, statut: 'site-arrete', detail: 'captcha plus tôt sur ' + site };
  const etat = await ouvrir(page, t.url).catch((e) => 'erreur : ' + String(e.message).slice(0, 80));
  if (etat === 'captcha') bloques.add(site);
  const res = etat === 'ok' ? await deposer(page, t, dossier) : { id: t.id, statut: etat };
  await dormir(PAUSE_MS);
  return res;
}

export async function capter(travaux, { dossier, max = MAX_PASSAGE, chrome } = {}) {
  if (!dossier) throw new Error("dossier d'images requis (DELEGUE_DOSSIER_IMAGES)");
  fs.mkdirSync(dossier, { recursive: true });
  const pw = await loadPlaywright();
  const nav = await pw.chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const bloques = new Set();
  try {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    // en file, un à la fois (jamais en parallèle : blocage IP des sites d'archives)
    return await travaux.slice(0, Math.min(max, MAX_PASSAGE)).reduce(async (suite, t) => {
      const rendu = await suite;
      rendu.push(await unTravail(page, t, dossier, bloques));
      return rendu;
    }, Promise.resolve([]));
  } finally {
    await nav.close();
  }
}

if (process.argv[1] && /(^|[\\/])capteur\.mjs$/.test(process.argv[1])) {
  const a = process.argv.slice(2);
  const arg = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  try {
    if (!a[0] || a[0].startsWith('--')) { console.error('usage : capteur.mjs travaux.json [--dossier <dir>] [--max 40]'); process.exit(2); }
    const out = await capter(JSON.parse(fs.readFileSync(a[0], 'utf8')), { dossier: arg('--dossier', process.env.DELEGUE_DOSSIER_IMAGES), max: +arg('--max', MAX_PASSAGE), chrome: process.env.CHROME_PATH });
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('❌ ' + e.message);
    process.exit(1);
  }
}
