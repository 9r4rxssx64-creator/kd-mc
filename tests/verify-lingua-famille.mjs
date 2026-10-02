/* GARDE — « Famille & vie privée » de Lingua (2.10), vrai navigateur + vrai routeur (KV simulé).
 *   1. mode enfant : demande un CODE PARENT, puis le Coach ne part plus vers l'IA (aucun /__lingua/ai),
 *      l'appel en direct est bloqué, et la progression envoyée ne porte ni prénom ni téléphone ;
 *   2. quitter le mode enfant exige le bon code parent (un mauvais code est refusé) ;
 *   3. thème clair appliqué et mémorisé ;
 *   4. exporter : un fichier JSON avec le compte et la progression ;
 *   5. effacer : le compte quitte l'appareil ET la copie en ligne est supprimée du stockage du domaine.
 * node tests/verify-lingua-famille.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import mod from '../services/kdmc-router/worker.js';
import { createHash } from 'node:crypto';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp' };
const appels = [];
const nav = await chromium.launch(); const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
await ctx.route(/^https:\/\/((lingua|admin)\.)?kd-mc\.com\//, async (route) => {
  const req = route.request(); const u = new URL(req.url());
  if (u.hostname === 'admin.kd-mc.com') { appels.push({ p: '/log', b: req.postData() || '' }); return route.fulfill({ status: 200, body: '{}' }); }
  if (u.pathname.startsWith('/__')) { appels.push({ p: u.pathname, b: req.postData() || '' });
    const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env, { waitUntil() {} });
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); return route.fulfill({ status: r.status, headers: h, body: Buffer.from(await r.arrayBuffer()) }); }
  const p = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
  return existsSync(p) ? route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body: readFileSync(p) }) : route.fulfill({ status: 404, body: '' });
});
const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(e.message));
const PARENT = createHash('sha256').update('parent:2468').digest('hex');
await p.addInitScript((PARENT) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1');
  localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Léo Petit', avatar: '🐰', code: '135791', created: 1, enfant: true }]));
  localStorage.setItem('lingua_g_parentHash', JSON.stringify(PARENT));
  localStorage.setItem('lingua_g_current', JSON.stringify('a1')); localStorage.setItem('lingua_a_a1_course', JSON.stringify('en'));
  localStorage.setItem('lingua_a_a1_placeAsked', 'true'); localStorage.setItem('lingua_a_a1_sound', 'false'); localStorage.setItem('lingua_a_a1_xp', '42'); }, PARENT);
const clic = (s) => p.evaluate((s) => { const b = [...document.querySelectorAll('button')].find((x) => new RegExp(s).test(x.textContent)); if (b) b.click(); return !!b; }, s);
const profil = async () => { await clic('Profil'); await p.waitForTimeout(400); };
await p.goto('https://lingua.kd-mc.com/'); await p.waitForTimeout(1500);
/* 1. mode enfant (déjà actif au démarrage : le 1er envoi de progression part au 1er enregistrement) */
const sauver = async () => { await profil(); await p.evaluate(() => { const c = document.querySelector('#setSound'); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change')); c.checked = !c.checked; c.dispatchEvent(new Event('change')); } }); await p.waitForTimeout(600); };
await sauver();
const logs = appels.filter((a) => a.p === '/log');
ok(logs.length >= 1 && logs.every((a) => !/Léo|Petit/.test(a.b) && !/"device"/.test(a.b)), `1a. la progression envoyée ne porte ni prénom ni téléphone (${logs.length ? logs[0].b.slice(0, 80) : 'RIEN envoyé — test non probant'})`);
appels.length = 0;
await clic('Coach'); await p.waitForTimeout(600);
await p.evaluate(() => { const i = document.querySelector('.coach-input'); if (i) { i.value = 'hello'; i.dispatchEvent(new Event('input')); } document.querySelector('.coach-send')?.click(); });
await p.waitForTimeout(1500);
const msgs = await p.evaluate(() => (JSON.parse(localStorage.getItem('lingua_a_a1_coachMsgs') || '[]')).length);
ok(!appels.some((a) => a.p === '/__lingua/ai') && msgs >= 2, `1b. le Coach répond (${msgs} messages) SANS IA en ligne (${appels.map((a) => a.p).join(', ') || 'aucun appel'})`);
const src = readFileSync('lingua/app.js', 'utf8');
ok(/function discLiveStart\(\)\{[^\n]*\n\s*if\(estEnfant\(\)\)\{ toast\("👶 Mode enfant : l'appel en direct est désactivé"\); return; \}/.test(src), '1c. l\'appel en direct est bloqué en mode enfant');
/* 2. quitter le mode enfant : mauvais code refusé, bon code accepté */
await profil(); await p.click('#famEnf'); await p.waitForSelector('#pcCode'); await p.fill('#pcCode', '0000'); await clic('Valider'); await p.waitForTimeout(500);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('lingua_g_accounts'))[0].enfant)) === true, '2a. un mauvais code parent est refusé');
await p.fill('#pcCode', '2468'); await clic('Valider'); await p.waitForTimeout(500);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('lingua_g_accounts'))[0].enfant)) === false, '2b. le bon code parent désactive le mode enfant');
/* 3. thème */
await profil(); await p.click('[data-th="clair"]'); await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'clair' && (await p.evaluate(() => localStorage.getItem('lingua_g_theme'))) === '"clair"', '3. thème clair appliqué et mémorisé');
/* 4. exporter */
await profil();
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#famExp')]);
let exp = null; if (dl) { try { exp = JSON.parse(readFileSync(await dl.path(), 'utf8')); } catch (e) {} }
ok(exp && exp.compte && exp.compte.nom === 'Léo Petit' && exp.progression && exp.progression.xp === 42, `4. export JSON : compte + progression (${dl ? dl.suggestedFilename() : 'aucun fichier'})`);
/* 5. effacer : on pose d'abord une copie en ligne, puis on efface */
await sauver();
await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(1500);
await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
const avant = [...kv.keys()].filter((k) => k.startsWith('lingua:')).length;
await profil(); await p.click('#famDel'); await p.waitForTimeout(300); await clic('Oui, tout effacer'); await p.waitForTimeout(1500);
const apres = [...kv.keys()].filter((k) => k.startsWith('lingua:')).length;
const reste = await p.evaluate(() => JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]').length);
ok(avant === 1 && apres === 0 && reste === 0, `5. effacé sur le téléphone ET en ligne (copies en ligne ${avant} → ${apres}, comptes ${reste})`);
ok(erreurs.length === 0, `6. aucune erreur JavaScript${erreurs.length ? ' — ' + erreurs[0] : ''}`);
await nav.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
