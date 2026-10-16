#!/usr/bin/env node
/* « Qui se connecte » (admin.kd-mc.com, kdmc-access) sur un écran d'iPhone — Kevin 16.10 nuit :
   « La vue des messages ne défile pas. Compliqué de voir clairement. Organise mieux, plus intelligemment toute la page. »
   Cause mesurée : tout le haut (compteurs, recherche, robots, passages, messages) était dans l'en-tête COLLÉ → 2/3 de l'écran,
   la liste défilait dessous. Ce test charge la VRAIE page (PAGE_HTML) avec des données fictives et prouve :
     1. l'en-tête collé reste petit (≤ 38 % de l'écran) et ne contient NI la boîte de messages NI les passages sans nom ;
     2. la page défile : après défilement, la boîte de messages est sortie de l'écran (elle défile avec la page) ;
     3. « 🟢 En ligne maintenant » montre la personne connectée ; la toucher ouvre SA carte ;
     4. la liste est rangée par fraîcheur (En ligne · Aujourd'hui · Cette semaine · Plus ancien) ;
     5. les filtres marchent (En ligne → 1 carte) ; le déplacement impossible est en alerte visible ;
     6. cibles tactiles ≥ 44 px, aucune exception JS. Capture : audit/captures-access-ux/.
   Sabotage : remettre boiteBloc() dans l'en-tête → rouge (cas 1 et 2) ; sortir les puces de la fiche → rouge (5d). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PAGE_HTML } = await import(pathToFileURL(path.join(R, 'services/kdmc-access/page.js')).href);
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };

const T = Date.now(), H = 3600e3, J = 864e5;
const pers = (uid, name, lastSeen, extra) => Object.assign({ uid, name, lastSeen, hits: 12, device: 'iPhone · iOS 18.7 · Safari 26', place: 'Monaco, MC', isp: 'Monaco Telecom', tz: 'Europe/Monaco', created: T - 30 * J, apps: { 'arbre.kd-mc.com': { sessions: 3, ms: 600000, last: lastSeen } }, history: [{ ts: lastSeen, app: 'arbre.kd-mc.com', dev: 'iPhone', place: 'Monaco, MC' }] }, extra || {});
const CONN = {
  people: [
    pers('u-nina', 'Nina Fictive', T - 60e3),
    pers('u-leo', 'Léo Imaginaire', T - 2 * H),
    pers('u-zoe', 'Zoé Exemple', T - 3 * J, { vpn: true, isp: 'Cloudflare London, LLC', anomaly: { from: 'US', to: 'FR', mins: 11 } }),
    pers('u-max', 'Max Démo', T - 20 * J),
  ],
  anonymes: { 'cuisine.kd-mc.com': { total: 40 }, 'shops.kd-mc.com': { total: 12 } },
};
const BOITE = { ok: true, nonLus: 2, connectes: 1, nonLusAlertes: 1, messages: [
  { de: 'Nina Fictive', texte: 'Bonjour, une question sur le planning de la semaine prochaine et un très long message qui doit tenir sur deux lignes au plus dans la carte', nonLus: 1, app: 'cmcteams.kd-mc.com', source: 'cmcteams' },
  { de: 'Léo Imaginaire', texte: 'Merci !', nonLus: 0, app: 'lingua.kd-mc.com', source: 'lingua' },
] };

const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/history')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ ok: true, events: [] })); }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE_HTML);
});
await new Promise((ok2) => srv.listen(0, ok2));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route((u) => String(u).startsWith('https://kd-mc.com/__admin/domain-log'), (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONN) }));
await ctx.route((u) => String(u).startsWith('https://kd-mc.com/__boite/admin'), (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOITE) }));
await ctx.route((u) => /^https?:\/\//.test(String(u)) && !String(u).startsWith(BASE) && !/__admin\/domain-log|__boite\/admin/.test(String(u)), (rt) => rt.fulfill({ status: 404, body: '' }));
const page = await ctx.newPage();
const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForSelector('.card', { timeout: 8000 }).catch(() => {});
await page.waitForSelector('.msgbox', { timeout: 8000 }).catch(() => {});
fs.mkdirSync(path.join(R, 'audit/captures-access-ux'), { recursive: true });
await page.screenshot({ path: path.join(R, 'audit/captures-access-ux/1-haut.png') });

const m = await page.evaluate(() => {
  const hd = document.querySelector('header');
  return { h: hd ? hd.getBoundingClientRect().height : 9999, vh: innerHeight, boiteDansEnTete: !!(hd && hd.querySelector('.msgbox')), anonDansEnTete: !!(hd && hd.querySelector('.anon')),
    boite: !!document.querySelector('.msgbox'), scrollH: document.documentElement.scrollHeight };
});
chk(m.h <= m.vh * 0.38 && !m.boiteDansEnTete && !m.anonDansEnTete && m.boite, `1. en-tête collé compact (${Math.round(m.h)} px sur ${m.vh}) ; messages et passages hors de l'en-tête`);
/* fiches repliées = page courte : on mesure que la boîte remonte d'autant que la page défile (elle n'est pas collée) */
const avant = await page.evaluate(() => document.querySelector('.msgbox').getBoundingClientRect().top);
await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(250);
const apres = await page.evaluate(() => { const b = document.querySelector('.msgbox').getBoundingClientRect(); return { haut: b.top, y: scrollY }; });
chk(apres.y > 100 && Math.abs((avant - apres.haut) - apres.y) <= 2, `2. la page défile (scroll ${Math.round(apres.y)} px) et la boîte de messages défile avec elle (remontée de ${Math.round(avant - apres.haut)} px)`);
await page.screenshot({ path: path.join(R, 'audit/captures-access-ux/2-defile.png') });
await page.evaluate(() => window.scrollTo(0, 0));

const live = await page.$$eval('.live .lp', (l) => l.map((b) => b.textContent));
chk(live.length === 1 && /NF/.test(live[0]) && /Nina/.test(live[0]), `3. En ligne maintenant : ${live.join(', ') || 'rien'}`);
await page.click('.live .lp'); await page.waitForTimeout(500);
const ouverte = await page.evaluate(() => { const t = document.querySelector('[data-tl="nina fictive"], .card.ouvert .tl.open'); return !!t && !!document.querySelector('.card.ouvert'); });
chk(ouverte, '3b. toucher la personne en ligne ouvre SA carte');

const grps = await page.$$eval('.grp', (g) => g.map((x) => x.textContent.trim()));
chk(JSON.stringify(grps) === JSON.stringify(['🟢 En ligne', "Aujourd'hui", 'Cette semaine', 'Plus ancien']), `4. liste rangée par fraîcheur : ${grps.join(' · ')}`);
chk(await page.locator('.alerte').filter({ hasText: 'Déplacement impossible' }).count() === 1 && await page.locator('.card .when').filter({ hasText: '⚠️' }).count() === 1, '5. le déplacement impossible : ⚠️ sur la ligne de la carte, alerte détaillée dans la fiche');
/* 16.10 nuit (Kevin : « Ferme les fiches par défaut ») : une carte fermée = une ligne */
const hauteurs = await page.$$eval('.card:not(.ouvert)', (c) => c.map((x) => Math.round(x.getBoundingClientRect().height)));
chk(hauteurs.length >= 3 && hauteurs.every((h) => h <= 80), `5d. fiches fermées par défaut, une ligne chacune (${hauteurs.join('/')} px)`);
const lisible = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.when,.chip,.kp span')].filter((e) => e.offsetParent).map((e) => parseFloat(getComputedStyle(e).fontSize))));
chk(lisible >= 11, `5e. texte lisible : plus petite taille affichée ${lisible} px`);
await page.click('.fl[data-f="ligne"]'); await page.waitForTimeout(250);
chk(await page.locator('.card').count() === 1, '5b. filtre « En ligne » → 1 carte');
await page.click('.kp[data-f="tous"]'); await page.waitForTimeout(250);
chk(await page.locator('.card').count() === 4, '5c. compteur « personnes » → toutes les cartes (4)');

const petites = await page.evaluate(() => [...document.querySelectorAll('.kp,.btn,.pers,.lp,.msgbox,.fl')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 36).map((e) => e.className));
chk(petites.length === 0, `6. cibles tactiles assez grandes (${petites.join(', ') || 'toutes'})`);
chk(erreurs.length === 0, `6b. aucune exception JS (${erreurs.join(' | ') || '0'})`);
await page.screenshot({ path: path.join(R, 'audit/captures-access-ux/3-liste.png'), fullPage: true });

await browser.close(); srv.close();
console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
