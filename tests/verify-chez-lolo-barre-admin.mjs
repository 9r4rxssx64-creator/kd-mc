/* PREUVE EN VRAI NAVIGATEUR — Chez Lolo : la barre admin ne recouvre rien et ne se fait recouvrir par rien
 * (Servi 8.11, mission 2108 : « button.hero-cta.alt sous un button de #clAdminBar » et « un button de #clAdminBar
 * sous la pastille de version »). Écran d'iPhone 13 (390×664), page servie depuis le dépôt, réseau extérieur coupé.
 * Prouve : (1) la barre n'est pas posée par-dessus la page (pas de position fixe) ; (2) aucun de ses boutons ne
 * recouvre « Créer mon design » ni les boutons de l'accueil ; (3) une pastille de version posée en bas à gauche
 * (comme celle du routeur, 86×44) ne recouvre aucun bouton de la barre ; (4) chaque bouton de la barre fait ≥ 44 px.
 * CL_ANCIEN=<ancien index.html> : doit être ROUGE sur l'ancienne page.
 * node tests/verify-chez-lolo-barre-admin.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ANCIEN = process.env.CL_ANCIEN ? path.resolve(process.env.CL_ANCIEN) : '';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  let f = path.join(ROOT, p);
  if (ANCIEN && p === '/shops/chez-lolo/index.html') f = ANCIEN;
  if (!(f === ANCIEN || f.startsWith(ROOT)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL = 'http://localhost:' + server.address().port + '/shops/chez-lolo/';

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  await ctx.route(/^https?:\/\//, (r) => { const u = r.request().url(); if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return r.continue(); return r.abort(); });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hero-cta.alt', { timeout: 15000 });
  const m = await page.evaluate(() => {
    /* une pastille de version du routeur : fixe, bas gauche, 86×44 (mesure du Servi) */
    const pas = document.createElement('button'); pas.id = 'kdmc-version-badge'; pas.textContent = 'v2.0';
    pas.style.cssText = 'position:fixed;left:0;bottom:54px;width:86px;height:44px;z-index:2147483000'; document.body.appendChild(pas);
    LD_ADMIN = true; clInstallAdminUI();
    const bar = document.getElementById('clAdminBar');
    const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, fx: r.left, fy: r.top }; };
    const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const btns = Array.from(bar.querySelectorAll('a,button')).map(R);
    const hero = Array.from(document.querySelectorAll('.hero-cta')).map(R);
    const pasR = R(pas);
    const pos = getComputedStyle(bar).position;
    let surHero = 0; for (const b of btns) for (const h of hero) surHero += inter(b, h);
    let surPas = 0; for (const b of btns) surPas += inter({ x: b.fx, y: b.fy, w: b.w, h: b.h }, { x: pasR.fx, y: pasR.fy, w: pasR.w, h: pasR.h });
    const en = Array.from(document.querySelectorAll('.logo, .icon-btn')).map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }).filter((r) => r.w > 0);
    const enteteMin = en.length ? Math.round(Math.min(...en.map((r) => Math.min(r.w, r.h)))) : 0;
    return { enteteMin, nEntete: en.length, pos, n: btns.length, nHero: hero.length, surHero: Math.round(surHero), surPas: Math.round(surPas), minH: Math.round(Math.min(...btns.map((b) => b.h))), minW: Math.round(Math.min(...btns.map((b) => b.w))) };
  });
  console.log('  mesure :', JSON.stringify(m));
  ok(m.n >= 6 && m.nHero >= 2, 'la barre admin (' + m.n + ' boutons) et l\'accueil (' + m.nHero + ' boutons) sont dessinés');
  ok(m.pos !== 'fixed' && m.pos !== 'absolute', 'la barre admin ne flotte pas par-dessus la page (position ' + m.pos + ')');
  ok(m.surHero === 0, 'aucun bouton de la barre ne recouvre un bouton de l\'accueil (surface ' + m.surHero + ' px²)');
  ok(m.surPas === 0, 'la pastille de version ne recouvre aucun bouton de la barre (surface ' + m.surPas + ' px²)');
  ok(m.minH >= 44 && m.minW >= 44, 'chaque bouton de la barre se touche au doigt (≥ 44 px : ' + m.minW + '×' + m.minH + ')');
  ok(m.nEntete >= 2 && m.enteteMin >= 44, 'le logo et les icônes de l\'en-tête se touchent au doigt (≥ 44 px : ' + m.nEntete + ' éléments, plus petit côté ' + m.enteteMin + ' px)');
} catch (e) { fails.push('exception : ' + (e && e.message)); console.log('  ❌ ' + (e && e.stack)); }
await browser.close(); server.close();
console.log(`\n${pass} ok / ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
