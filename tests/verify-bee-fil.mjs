/* GARDE EN VRAI NAVIGATEUR — LA CONVERSATION DE BEE SUIT KEVIN D'UNE APP À L'AUTRE (Kevin 4.10 : « mon assistant qui me suit »).
 * Deux « apps » = deux adresses (deux ports) = deux stockages séparés, comme lingua.kd-mc.com et arbre.kd-mc.com. Un faux domaine garde le fil
 * en mémoire, comme /__javis/fil. On MESURE, avec le vrai widget dans Chromium :
 *   1. dans l'app A, Kevin pose une question → le fil part au domaine ;
 *   2. dans l'app B (stockage vierge), la même conversation est déjà là, à l'ouverture ;
 *   3. un échange dans B repart au domaine, et A le retrouve en rouvrant ;
 *   4. 🗑 dans B efface le fil pour A aussi ;
 *   5. quelqu'un qui n'est PAS Kevin : le domaine refuse, le widget n'appelle JAMAIS /__javis/fil ;
 *   6. le domaine en panne (503) : la conversation locale marche quand même.
 * node tests/verify-bee-fil.mjs */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = { ok: [], ko: [] };
const chk = (c, m, d) => (c ? R.ok : R.ko).push(m + (c || d === undefined ? '' : ' → ' + String(d).slice(0, 200)));
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

/* le faux domaine (partagé par les deux apps) */
const DOMAINE = { fil: [], maj: 0, kevin: true, panne: false, appels: [], ia: 0 };
function creer() {
  return http.createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    const json = (o, st) => { res.writeHead(st || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (p === '/__sso/whoami') return json(DOMAINE.kevin ? { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', verified: true, admin: true } : { ok: false });
    if (p === '/__javis/fil') {
      DOMAINE.appels.push(req.method);
      if (!DOMAINE.kevin) return json({ ok: false, reason: 'kevin_seulement' }, 403);
      if (DOMAINE.panne) return json({ ok: false, reason: 'base_indisponible' }, 503);
      if (req.method === 'GET') return json({ ok: true, fil: DOMAINE.fil, maj: DOMAINE.maj });
      let c = ''; req.on('data', (x) => { c += x; });
      return req.on('end', () => { const b = JSON.parse(c || '{}'); DOMAINE.fil = b.effacer ? [] : (b.fil || []); DOMAINE.maj = Date.now(); json({ ok: true, maj: DOMAINE.maj }); });
    }
    if (p === '/__javis/ai') { let c = ''; req.on('data', (x) => { c += x; }); return req.on('end', () => { DOMAINE.ia++; json({ ok: true, provider: 'qwen', gratuit: true, text: 'Réponse ' + DOMAINE.ia + ' de Bee' }); }); }
    const f = join(ROOT, 'javis', p === '/' ? 'index.html' : p.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': TYPES[f.slice(f.lastIndexOf('.'))] || 'text/plain' }); res.end(fs.readFileSync(f));
  });
}
const A = creer(), B = creer();
await Promise.all([new Promise((r) => A.listen(0, r)), new Promise((r) => B.listen(0, r))]);
const URL_A = `http://127.0.0.1:${A.address().port}/`, URL_B = `http://127.0.0.1:${B.address().port}/`;
const nav = await chromium.launch({ headless: true });

async function ouvre(url) {
  const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('kdmc_perso3d', '0'); localStorage.setItem('javis_widget_bonjour', 'x'); } catch (_) {} });
  const page = await ctx.newPage();
  const fautes = []; page.on('pageerror', (e) => fautes.push(String(e && e.message)));
  for (const h of ['https://lingua.kd-mc.com/**', 'https://apis.kd-mc.com/**']) await page.route(h, (r) => r.fulfill({ status: 404, body: 'absent' }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { ctx, page, fautes };
}
const bulles = (page) => page.evaluate(() => [...document.querySelectorAll('#javis-msgs .javis-msg, #javis-msgs .javis-bubble, #javis-msgs > div')].map((e) => (e.textContent || '').trim()).filter(Boolean));
const pret = async (page) => { await page.waitForSelector('#javis-input', { timeout: 15000 }); await dors(500); };
const poser = async (page, t) => { await page.fill('#javis-input', t); await page.press('#javis-input', 'Enter'); await page.waitForFunction((x) => document.body.innerText.includes(x), 'de Bee', { timeout: 15000 }); await dors(1200); };

/* 1. app A */
const a = await ouvre(URL_A); await pret(a.page);
await poser(a.page, 'Dis-moi un mot sur la ville de Monaco');
chk(DOMAINE.fil.length >= 2 && DOMAINE.fil.some((m) => m.role === 'user' && m.content.includes('Monaco')) && DOMAINE.fil.some((m) => m.role === 'assistant' && m.content.includes('de Bee')), '1. dans l\'app A, la question et la réponse sont parties au domaine', JSON.stringify(DOMAINE.fil));
chk(DOMAINE.appels.includes('POST'), '1b. le widget a écrit au domaine (POST /__javis/fil)');
chk(a.fautes.length === 0, '1c. aucune erreur de page dans A', a.fautes.join(' | '));

/* 2. app B vierge */
const b = await ouvre(URL_B); await pret(b.page); await dors(1500);
const txtB = (await bulles(b.page)).join(' | ');
chk(/Monaco/.test(txtB) && /Réponse 1 de Bee/.test(txtB), '2. dans l\'app B (stockage vierge), la conversation de A est déjà là', txtB);
const hB = await b.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('javis_widget_history') || '[]'); } catch (e) { return []; } });
chk(hB.length >= 2, '2b. elle est rangée dans B (la mémoire de Bee la reprend pour répondre)', JSON.stringify(hB).slice(0, 100));

/* 3. un échange dans B, retrouvé par A */
await poser(b.page, 'Note pour après-demain, un autre sujet');
chk(DOMAINE.fil.length >= 4 && DOMAINE.fil.some((m) => m.content.includes('après-demain')) && DOMAINE.fil.some((m) => m.content.includes('Monaco')), '3. l\'échange fait dans B s\'ajoute au même fil (rien perdu)', JSON.stringify(DOMAINE.fil).slice(0, 200));
await a.page.reload({ waitUntil: 'domcontentloaded' }); await pret(a.page); await dors(1500);
chk(/après-demain/.test((await bulles(a.page)).join(' | ')), '3b. en rouvrant A, on retrouve ce qui s\'est dit dans B');

/* 4. effacer */
await b.page.evaluate(() => document.getElementById('javis-oublie').click()); await dors(1200);
chk(DOMAINE.fil.length === 0, '4. 🗑 dans B efface le fil au domaine', JSON.stringify(DOMAINE.fil));
await a.page.reload({ waitUntil: 'domcontentloaded' }); await pret(a.page); await dors(1500);
const txtA = (await bulles(a.page)).join(' | ');
chk(!/Monaco|après-demain/.test(txtA), '4b. …et A repart de zéro aussi', txtA);
await a.ctx.close(); await b.ctx.close();

/* 5. pas Kevin */
DOMAINE.kevin = false; DOMAINE.fil = [{ role: 'user', content: 'SECRET DE KEVIN' }]; DOMAINE.appels.length = 0;
const c = await ouvre(URL_A); await dors(3000);
chk(DOMAINE.appels.length === 0, '5. quelqu\'un qui n\'est pas Kevin : le widget n\'appelle JAMAIS /__javis/fil', DOMAINE.appels.join(','));
chk(!(await c.page.evaluate(() => document.body.innerText)).includes('SECRET DE KEVIN'), '5b. et ne voit rien de sa conversation');
await c.ctx.close();

/* 6. domaine en panne */
DOMAINE.kevin = true; DOMAINE.panne = true; DOMAINE.fil = [];
const d = await ouvre(URL_A); await pret(d.page); await poser(d.page, 'Coucou la panne');
chk(/Coucou la panne/.test((await bulles(d.page)).join(' | ')) && d.fautes.length === 0, '6. domaine en panne (503) : la conversation locale marche quand même, sans erreur', d.fautes.join(' | '));
await d.ctx.close();

await nav.close(); A.close(); B.close();
for (const m of R.ok) console.log('  ✓ ' + m);
for (const m of R.ko) console.log('  ✗ ' + m);
console.log(`\n${R.ok.length} ✓ / ${R.ko.length} ✗`);
process.exit(R.ko.length ? 1 : 0);
