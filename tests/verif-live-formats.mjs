/* VÉRIFICATION RÉELLE DES 5 FORMATS D'ÉCRAN, DE LA VITESSE ET DU HORS-LIGNE — CMCteams ET LIGHT, connecté en admin, vrai domaine
 * (Kevin 22.10.2026 : « Fais faire audit réel +++ à Lenovo — Team et light » ; le Lenovo a mesuré l'ordinateur (pont 284) et a CONFIÉ ces mesures au robot).
 *
 * Tourne au dépôt PUBLIC (gratuit, illimité). Le code admin vient du SECRET (empreinte, jamais écrite ni journalisée) et part au DOMAINE (POST /__admin/login),
 * comme quand Kevin le tape. LECTURE SEULE : on ouvre, on mesure, on ne touche à aucun bouton d'écriture. NOMBRES SEULEMENT : un journal public se lit par tous
 * et le planning contient des noms de collègues → jamais un texte de la page, jamais une capture.
 *
 * Pour CHAQUE app (CMCteams, light) × CHAQUE largeur (375, 390, 412, 768, 1200 px) :
 *   - défilement horizontal de la page (ÉCHEC si oui) ;
 *   - nombre de boutons / liens cliquables plus petits que 44 px (constat) et de textes plus petits que 14 px (constat) ;
 *   - la pastille « ← Portail » du routeur recouvre-t-elle un autre élément de l'app ? (constat, nombre d'éléments recouverts) ;
 *   - erreurs JavaScript (ÉCHEC), requêtes en échec par chemin (constat : 401 = normal quand la session n'a pas encore répondu) ;
 *   - vitesse : DOMContentLoaded, load, LCP (en ms) ;
 * puis, à 390 px : HORS LIGNE (couper le réseau, recharger : la page doit s'ouvrir avec sa copie — ÉCHEC sinon).
 *
 * node tests/verif-live-formats.mjs   (KDMC_ADMIN_PIN_SHA256 requis)
 * Essai sans domaine : ESSAI_LOCAL=1 BASE_LIGHT=http://127.0.0.1:PORT BASE_CMC=http://127.0.0.1:PORT (pages servies par un petit serveur, sans connexion). */
import { appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const LOCAL = process.env.ESSAI_LOCAL === '1';
const HASH = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const CIBLES = [
  { id: 'cmc', nom: 'CMCteams', horsLigne: true, url: process.env.BASE_CMC || 'https://cmcteams.kd-mc.com', pret: () => !!(window.A && A.user && A.user.id === 'U11804' && window.DEPARTS_GEN && window.DEPARTS_GEN.boards) },
  { id: 'light', nom: 'la light', horsLigne: false, url: process.env.BASE_LIGHT || 'https://cmcteams-light.kd-mc.com', pret: () => !!(window.DEPARTS_GEN && window.DEPARTS_GEN.boards && document.body.classList.contains('admin')) },
];
const LARGEURS = [375, 390, 412, 768, 1200];
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
let echecs = 0;
const ok = (c, m, d) => { dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + d : ''}`); if (!c) echecs++; };
const fin = (code) => { if (RESUME) try { appendFileSync(RESUME, '```\n' + lignes.join('\n') + '\n```\n'); } catch (_) { /* pas de résumé */ } process.exit(code); };

if (!LOCAL && !/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ KDMC_ADMIN_PIN_SHA256 absent ou mal formé (le robot ne peut pas se connecter)'); fin(1); }

const browser = await chromium.launch();

/* La connexion admin par le DOMAINE (comme Kevin) ; x-kdmc-verif : le domaine trace un robot de vérification, pas une connexion suspecte. */
async function connecter(page, base) {
  await page.goto(base + '/version.txt', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({}));
    try { if (j.grant) localStorage.setItem('kdmc_admin_grant', j.grant); if (j.token) localStorage.setItem('kdmc_sso_token', j.token); } catch (_) { /* stockage interdit */ }
    return { st: x.status, ok: !!j.ok };
  }, HASH);
}

/* Les mesures de mise en page, exécutées DANS la page (rien de lu n'en sort : des nombres). */
const MESURES = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0; };
  const cibles = [...document.querySelectorAll('button, a[href], [onclick], input:not([type=hidden]), select, textarea, [role=button], [role=tab]')].filter((e) => !e.disabled && !e.closest('[hidden]') && vis(e));
  const petitsBoutons = cibles.filter((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 44; }).length;
  /* quels éléments : balise + classe + taille seulement (jamais le texte : il peut porter un nom de personne) */
  const quels = {};
  for (const e of cibles) { const r = e.getBoundingClientRect(); if (Math.min(r.width, r.height) < 44) { const act = ((e.getAttribute('onclick') || '').match(/^[\s(]*([\w.$]+)/) || [])[1] || ''; const k = `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${act ? '[' + act.slice(0, 22) + ']' : ''} ${Math.round(r.width)}×${Math.round(r.height)}`; quels[k] = (quels[k] || 0) + 1; } }
  let petitsTextes = 0;
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    let propre = false;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) { propre = true; break; }
    if (propre && parseFloat(getComputedStyle(e).fontSize) < 14) petitsTextes++;
  }
  /* la pastille « ← Portail » du routeur recouvre-t-elle un élément de l'app ? on échantillonne 9 points de sa surface */
  let pastille = null, recouverts = 0;
  const p = document.querySelector('a[data-kdmc-pastille]');
  if (p && vis(p)) {
    const r = p.getBoundingClientRect(); pastille = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    const vus = new Set();
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.15, 0.5, 0.85]) {
      for (const e of document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy)) {
        if (e === p || p.contains(e) || e === document.documentElement || e === document.body) continue;
        if (e.contains(p)) continue;
        if ((e.innerText || '').trim().length > 0 || e.tagName === 'BUTTON' || e.tagName === 'A' || e.tagName === 'INPUT') vus.add(e);
      }
    }
    recouverts = vus.size;
  }
  return { debord: document.documentElement.scrollWidth - window.innerWidth, large: window.innerWidth, cibles: cibles.length, petitsBoutons, quels, petitsTextes, pastille, recouverts };
};

async function ouvrir(cible, largeur) {
  const mobile = largeur <= 768;
  const ctx = await browser.newContext({ viewport: { width: largeur, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'allow' });
  await ctx.addInitScript(() => { try { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (_) { /* pas de LCP */ } });
  const page = await ctx.newPage();
  const sonde = { erreurs: 0, echecs: new Map(), lus: new Set() };
  page.on('pageerror', () => { sonde.erreurs++; });
  page.on('response', (r) => { const s = r.status(); if (s < 400) { try { sonde.lus.add(new URL(r.url()).pathname.replace(/\/[0-9a-f]{12,}/gi, '/…').slice(0, 60)); } catch (_) { /* url illisible */ } } if (s >= 400) { let u = ''; try { u = new URL(r.url()).pathname.replace(/\/[0-9a-f]{12,}/gi, '/…'); } catch (_) { u = '?'; } const k = `${u.slice(0, 60)} ${s}`; sonde.echecs.set(k, (sonde.echecs.get(k) || 0) + 1); } });
  if (!LOCAL) { const c = await connecter(page, cible.url); if (!c.ok) { await ctx.close(); return { erreurConnexion: `HTTP ${c.st}` }; } }
  const t0 = Date.now();
  await page.goto(cible.url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  /* attente par SONDAGE depuis Node (jamais waitForFunction : une page qui interdit unsafe-eval le fait rompre aussitôt — leçon 661) */
  let pret = LOCAL;
  for (let t = Date.now(); !pret && Date.now() - t < 60000; await page.waitForTimeout(500)) pret = await page.evaluate(cible.pret).catch(() => false);
  await page.waitForTimeout(2500);   // la pastille « ← Portail » se pose à l'ouverture, le service worker s'installe
  return { ctx, page, sonde, pret, msPret: Date.now() - t0 };
}

try {
  for (const cible of CIBLES) {
    dire(`\n── ${cible.nom} (${cible.url.replace(/^https?:\/\//, '')}) ──`);
    for (const largeur of LARGEURS) {
      const o = await ouvrir(cible, largeur);
      if (o.erreurConnexion) { ok(false, `${cible.nom} ${largeur} px : connexion admin refusée`, o.erreurConnexion); continue; }
      const { ctx, page, sonde, pret, msPret } = o;
      const m = await page.evaluate(MESURES).catch((e) => ({ erreur: String(e && e.message).slice(0, 80) }));
      const perf = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] || {}; return { dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), lcp: window.__lcp || 0 }; }).catch(() => ({}));
      if (m.erreur) { ok(false, `${cible.nom} ${largeur} px : mesure impossible`, m.erreur); await ctx.close(); continue; }
      ok(pret, `${cible.nom} ${largeur} px : l'app est prête connectée en admin (${msPret} ms)`, 'planning / admin non chargés en 60 s');
      ok(m.debord <= 1, `${cible.nom} ${largeur} px : pas de défilement horizontal (débord ${m.debord} px)`, `la page déborde de ${m.debord} px`);
      ok(sonde.erreurs === 0, `${cible.nom} ${largeur} px : aucune erreur JavaScript`, `${sonde.erreurs} erreur(s)`);
      if (m.petitsBoutons) dire(`   ℹ️ ${largeur} px : petites zones (balise.classe largeur×hauteur ×nombre) : ${Object.entries(m.quels).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k} ×${n}`).join(' · ')}`);
      dire(`   ℹ️ ${largeur} px : ${m.cibles} zones cliquables dont ${m.petitsBoutons} < 44 px · ${m.petitsTextes} textes < 14 px · pastille Portail ${m.pastille ? `${m.pastille.w}×${m.pastille.h} en (${m.pastille.x},${m.pastille.y}), recouvre ${m.recouverts} élément(s)` : 'absente'} · DCL ${perf.dcl} ms · load ${perf.load} ms · LCP ${perf.lcp} ms`);
      /* un 401 suivi d'un 200 sur le même chemin = la session n'avait pas encore répondu, la donnée est bien arrivée ; sans 200 après = donnée jamais lue */
      const jamaisLus = [...sonde.echecs.keys()].filter((k) => !sonde.lus.has(k.replace(/ \d+$/, '')));
      dire(`   ℹ️ ${largeur} px : ${sonde.echecs.size - jamaisLus.length} lecture(s) refusée(s) puis relue(s) avec succès · ${jamaisLus.length} jamais relue(s)${jamaisLus.length ? ' : ' + jamaisLus.slice(0, 6).join(' · ') : ''}`);
      if (sonde.echecs.size) dire(`   ℹ️ ${largeur} px : ${sonde.echecs.size} requête(s) en échec (chemin, code) : ${[...sonde.echecs].slice(0, 8).map(([k, n]) => `${k} ×${n}`).join(' · ')}${sonde.echecs.size > 8 ? ' · …' : ''}`);
      /* HORS LIGNE, une seule fois par app (390 px) */
      if (largeur === 390) {
        await ctx.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const n = await page.evaluate(() => ((document.body && document.body.innerText) || '').trim().length).catch(() => 0);
        if (cible.horsLigne) ok(n > 100, `${cible.nom} hors ligne : la page s'ouvre avec sa copie (${n} caractères affichés)`, 'page vide hors ligne');
        else dire(`   ℹ️ ${cible.nom} hors ligne : ${n > 100 ? `la page s'ouvre avec sa copie (${n} caractères)` : `page vide (${n} caractères) — la light n'a pas de service worker : constat, pas un échec`}`);
        await ctx.setOffline(false);
      }
      await ctx.close();
    }
  }
} catch (e) {
  dire(`❌ le robot a planté : ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)}`); echecs++;
}
await browser.close();
dire(echecs ? `=== VÉRIF FORMATS : ÉCHEC (${echecs} contrôle(s))` : '=== VÉRIF FORMATS : OK');
fin(echecs ? 1 : 0);
