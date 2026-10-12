/* GARDE — Finances ne re-télécharge plus la même pièce en boucle (12.10.2026)
   node tests/verify-finances-telechargements.mjs      (SABOTAGE=1 : ancien comportement, pièce jamais écartée / tour répété → la garde doit rougir)

   Kevin : « il re-télécharge tout, j'ai l'impression ». Cause (lue dans le code) : une pièce jointe qui ne s'importe pas n'était jamais acquittée ;
   le serveur la renvoyait entière (jusqu'à 8 Mo) à chaque scan — ouverture, retour sur l'app, toutes les 5 min — et jusqu'à 12 fois de suite
   dans le même scan. Vrai Chromium, domaine simulé (aucun vrai code, aucun vrai appel) : une file avec UNE pièce illisible, jamais acquittée
   tant que l'app ne le fait pas.
     1. un scan ne demande pas la file plus d'une fois quand rien n'est acquitté (≤ 1 appel, pas 12) ;
     2. la pièce est écartée (acquittée) après 3 essais, pas avant ;
     3. ensuite plus aucun téléchargement : la file est vide ;
     4. le message le dit (« illisible(s) écartée(s) »). */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAB = process.env.SABOTAGE === '1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(R, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  let corps = fs.readFileSync(f);
  if (SAB && f.endsWith('tools/finances/index.html')) corps = Buffer.from(corps.toString('utf8')
    .replace("if(!ackIds.length) break;", '').replace('fails[it.id]>=MAIL_ESSAIS', 'fails[it.id]>=99999'));
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(corps); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port;
let ok = 0, ko = 0; const chk = (c, m) => { console.log(c ? '  ✅' : '  ❌', m); c ? ok++ : ko++; };
const nav = await chromium.launch(); const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
let file = ['bad1'], scans = 0, acks = [];
const J = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => { const u = new URL(r.request().url());
  if (u.pathname === '/health') return r.fulfill(J({ ok: true }));
  if (u.pathname.includes(':generateContent')) return r.fulfill(J({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
  return r.abort(); });
await ctx.route('**/__**', (r) => { const u = new URL(r.request().url());
  if (u.pathname === '/__mail/scan') { scans++; return r.fulfill(J({ ok: true, restant: false, items: file.map((id) => ({ id, from: 'f@x.fr', filename: id + '.pdf', mime: 'application/pdf', b64: 'AAAA' })) })); }
  if (u.pathname === '/__mail/ack') { const ids = JSON.parse(r.request().postData() || '{}').ids || []; acks.push(...ids); file = file.filter((x) => !ids.includes(x)); return r.fulfill(J({ ok: true })); }
  if (u.pathname === '/__fin/vault') return r.fulfill(r.request().method() === 'PUT' ? J({ ok: true }) : { status: 404, contentType: 'application/json', body: '{"ok":false}' });
  if (u.pathname === '/__admin/login' || u.pathname === '/__admin/grant') return r.fulfill(J({ ok: true, grant: 'g-test' }));
  return r.fulfill(J({ ok: true, admin: true, verified: true })); });
const page = await ctx.newPage(); const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message)); page.on('dialog', (d) => d.dismiss());
await page.goto(B + '/tools/finances/'); await page.waitForSelector('#g-pass', { timeout: 15000 });
await page.fill('#g-pass', '482916'); await page.fill('#g-pass2', '482916'); await page.click('#g-go');
await page.waitForSelector('#btn-lock', { timeout: 20000 });
await page.locator('#tabs .tab', { hasText: 'Réglages' }).click(); await page.waitForSelector('#ai-pin');
file = ['bad1']; scans = 0; acks = [];
await page.fill('#ai-pin', 'faux-code-ok'); await page.click('#ai-on');
await page.waitForTimeout(4000);
await page.waitForTimeout(2500);
chk(scans === 1, `1. activation : la file n'est demandée qu'UNE fois quand rien n'est acquitté (${scans} appel(s), l'ancien code en faisait 12)`);
chk(acks.length === 0, `2. après 1 échec la pièce n'est pas encore écartée (acquittements : ${acks.length})`);
let dernier = '';
const dash = async () => { await page.locator('#tabs .tab', { hasText: 'Ajouter' }).click(); await page.waitForSelector('#mail-scan'); await page.click('#mail-scan'); dernier = ''; for (let i = 0; i < 24; i++) { await page.waitForTimeout(100); dernier += ' ' + await page.evaluate(() => (document.getElementById('mail-stat') || {}).textContent || ''); } };
await dash(); const s2 = scans; chk(acks.length === 0, `3. 2e essai : toujours pas écartée (acquittements : ${acks.length}, appels ${s2})`);
await dash(); chk(acks.join() === 'bad1', `4. 3e essai : la pièce illisible est écartée et acquittée (« ${acks.join()} »)`);
chk(/illisible\(s\) écartée\(s\)/.test(dernier), '   … et l\'écran le dit (« illisible(s) écartée(s) »)');
const avant = scans; await dash(); await dash();
chk(scans - avant <= 2 && file.length === 0, `5. ensuite la file est vide : 2 scans de plus = ${scans - avant} appel(s), rien n'est retéléchargé`);
chk(erreurs.length === 0, `6. ${erreurs.length} erreur JS`);
await nav.close(); srv.close();
console.log(`\n${ko ? '❌' : '✅'} finances-telechargements : ${ok}/${ok + ko}`); process.exit(ko ? 1 : 0);
