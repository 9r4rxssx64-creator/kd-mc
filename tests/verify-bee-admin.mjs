/* GARDE — BEE SUR LA PAGE ADMIN (admin.kd-mc.com), DANS UN VRAI NAVIGATEUR (Kevin 23.10.2026 : « Oui, je veux qu'il soit partout »).
 * admin.kd-mc.com est un worker à part (kdmc-access) : le routeur ne lui pose rien. On fait tourner le VRAI worker kdmc-access derrière un petit serveur,
 * avec le VRAI code de Bee du routeur (partout.js, cadre) derrière le relais, et on prouve dans Chromium :
 *  A. session déjà lisible (cookie) : la page admin arrive, Bee apparaît (cadre 92×92 en bas à droite), la page admin est intacte, 0 erreur JS ;
 *  B. app installée (aucun cookie, pass rangé) : l'ENTRÉE remplace le document par la page — Bee y apparaît aussi ;
 *  C. visiteur sans session : ni page, ni Bee, ni relais ; interrupteur BEE_PARTOUT=0 : plus de Bee ;
 *  D. le relais ne sert que /__javis/ (rien d'autre n'est relayé). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import worker from '../services/kdmc-access/worker.js';
import { handlePartout } from '../services/kdmc-router/bee-partout.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const vusDomaine = [];
/* le « domaine » (kd-mc.com) : sa vérification de session et SON Bee (le vrai code du routeur) */
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const url = new URL(String(u && u.url || u));
  if (url.hostname !== 'kd-mc.com') return vraiFetch(u, o);
  vusDomaine.push(url.pathname);
  const h = new Headers(o && o.headers);
  const kevin = /kdmc_sso=ok/.test(h.get('cookie') || '') || /^Bearer (ok|pass-kevin)$/.test(h.get('authorization') || '');
  if (url.pathname === '/__sso/whoami') return new Response(JSON.stringify(kevin ? { ok: true, uid: 'kdmc_admin', name: 'Kevin', admin: true, verified: true } : { ok: false }), { status: kevin ? 200 : 401 });
  if (url.pathname.startsWith('/__javis/')) {
    const rep = await handlePartout(new Request(url.href, { method: (o && o.method) || 'GET', headers: h }), url, { BEE_PARTOUT: BEE_PARTOUT_ENV }, { qui: async () => kevin });
    return rep || new Response('{}', { status: 404 });
  }
  return new Response('{}', { status: 404 });
};
let BEE_PARTOUT_ENV = '1';

const srv = http.createServer(async (q, r) => {
  const chunks = []; for await (const c of q) chunks.push(c);
  const req = new Request('https://admin.kd-mc.com' + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : Buffer.concat(chunks) });
  try {
    const rep = await worker.fetch(req, { ACCES_PAGE_COMPTE: '1', BEE_PARTOUT: BEE_PARTOUT_ENV });
    const h = {}; rep.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
    r.writeHead(rep.status, h); r.end(Buffer.from(await rep.arrayBuffer()));
  } catch (e) { r.writeHead(500); r.end(String(e)); }
}).listen(0, '127.0.0.1');
await new Promise((o) => srv.on('listening', o));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const MIME = { '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function ouvre({ cookie = true, jeton = false, marqueur = true } = {}) {
  const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await ctx.route('https://javis.kd-mc.com/**', (rt) => {
    const f = path.join(ROOT, 'javis', new URL(rt.request().url()).pathname.replace(/^\//, ''));
    if (!fs.existsSync(f) || f.endsWith('.mp4')) return rt.fulfill({ status: 404, body: '' });
    rt.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await ctx.route('https://api.open-meteo.com/**', (rt) => rt.fulfill({ status: 200, body: '{}' }));
  const ck = []; if (cookie) ck.push({ name: 'kdmc_sso', value: 'ok', url: BASE }); if (marqueur) ck.push({ name: 'kdmc_k', value: '1', url: BASE });
  if (ck.length) await ctx.addCookies(ck);
  if (jeton) await ctx.addInitScript(() => { try { localStorage.setItem('kdmc_sso_token', 'pass-kevin'); } catch (_) {} });
  const page = await ctx.newPage(); const err = [];
  page.on('pageerror', (e) => err.push(e.message));
  vusDomaine.length = 0;
  await page.goto(BASE + '/');
  return { ctx, page, err };
}
const cadre = (page) => page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); if (!f) return null; const r = f.getBoundingClientRect(); return { d: getComputedStyle(f).display, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(window.innerWidth - r.right) }; });
const attendBee = (page) => page.waitForFunction(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); return f && getComputedStyle(f).display === 'block'; }, null, { timeout: 20000 }).catch(() => {});

console.log('A. Kevin sur l\'admin (session lisible)');
{
  const { ctx, page, err } = await ouvre();
  await attendBee(page);
  const c = await cadre(page);
  chk(c && c.d === 'block' && c.w === 92 && c.h === 92 && c.right === 8, 'le cadre de Bee apparaît sur la page admin, en bas à droite (' + JSON.stringify(c) + ')');
  chk(await page.evaluate(() => !!document.getElementById('vbadge')), 'la page « Qui se connecte » est intacte (sa bulle de version est là)');
  const fr = page.frames().find((f) => /__javis\/cadre/.test(f.url()));
  await fr.waitForSelector('#javis-launcher', { timeout: 10000 }).catch(() => {});
  chk(await fr.evaluate(() => !!document.getElementById('javis-launcher')), 'Bee est dessinée dans le cadre (ses fichiers viennent de javis.kd-mc.com)');
  chk(vusDomaine.some((p) => p === '/__javis/partout.js') && vusDomaine.some((p) => p === '/__javis/cadre'), 'le script et le cadre ont été relayés au domaine (' + vusDomaine.filter((p) => /javis/.test(p)).join(', ') + ')');
  chk(err.filter((e) => !/Failed to fetch|NetworkError|history|log/i.test(e)).length === 0, 'aucune erreur JS' + (err[0] ? ' — ' + err[0] : ''));
  await ctx.close();
}
console.log('B. App installée : aucun cookie, pass rangé → l\'entrée fait entrer la page');
{
  const { ctx, page, err } = await ouvre({ cookie: false, jeton: true, marqueur: true });
  await attendBee(page);
  const c = await cadre(page);
  chk(c && c.d === 'block' && c.w === 92, 'passée par l\'entrée (document remplacé), Bee apparaît quand même (' + JSON.stringify(c) + ')');
  chk(await page.evaluate(() => !!document.getElementById('vbadge')), 'et la page admin est là');
  chk(err.filter((e) => !/Failed to fetch|NetworkError|history|log/i.test(e)).length === 0, 'aucune erreur JS' + (err[0] ? ' — ' + err[0] : ''));
  await ctx.close();
}
console.log('C. Personne d\'autre ; interrupteur');
{
  const { ctx, page } = await ouvre({ cookie: false, jeton: false, marqueur: false });
  await dors(1500);
  chk(await cadre(page) === null && !(await page.evaluate(() => !!document.getElementById('vbadge'))), 'sans session : pas de page admin, pas de Bee');
  chk(!vusDomaine.some((p) => /__javis/.test(p)), 'et rien n\'est relayé au domaine');
  await ctx.close();
  BEE_PARTOUT_ENV = '0';
  const o = await ouvre();
  await dors(2000);
  chk(await cadre(o.page) === null && await o.page.evaluate(() => !!document.getElementById('vbadge')), 'BEE_PARTOUT=0 : la page admin s\'ouvre, sans Bee');
  await o.ctx.close(); BEE_PARTOUT_ENV = '1';
}
console.log('D. Le relais ne sert que /__javis/');
{
  const r1 = await fetch(BASE + '/__autre/x'); const r2 = await fetch(BASE + '/__javisx/agir');
  chk(!vusDomaine.some((p) => /__autre|__javisx/.test(p)), 'rien d\'autre que /__javis/ n\'est relayé (' + r1.status + ', ' + r2.status + ')');
}
await nav.close(); srv.close();
console.log(`\n${ok} ✓ / ${ko} ✗`);
process.exit(ko ? 1 : 0);
