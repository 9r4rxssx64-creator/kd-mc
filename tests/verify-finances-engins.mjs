/* PREUVE (leçon #96) — Finances v0.14.0 : suivi des dépenses PAR ENGIN / VÉHICULE.
 * Chromium mobile 390px, coffre + IA (proxy MOCKÉ). On importe une facture type EASYFLEX
 * (réparation de 2 vérins) via le VRAI flux /__mail/scan :
 *   - l'IA renvoie asset:"Komatsu PC35-R8" sur la ligne VC.177 → engin détecté TOUT SEUL
 *   - VC.178 + BANJO sans engin → apparaissent dans « 📥 À ranger »
 * Puis on prouve le rangement MANUEL en 1 tap : on ouvre « À ranger », on tape « 🚜 Ranger sous
 * un engin » sur la ligne VC.178, on crée « Piaggio Porter » → elle se range dessous.
 * L'onglet 🚜 Engins montre alors Komatsu 342 € + Piaggio 336 €, chacun cliquable (drill).
 * Réseau externe bloqué (leçon #135) → tout local + mocké.
 * Lancer : node tests/verify-finances-engins.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || '200807'; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'text/plain' }); res.end(fs.readFileSync(fp));
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URL = 'http://localhost:' + PORT + '/tools/finances/';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const fails = [], oks = [];
const rec = (cond, msg) => { (cond ? oks : fails).push(msg); console.log((cond ? 'OK ' : 'FAIL ') + msg); };

let scanServed = false;
const geminiWrap = (text) => JSON.stringify({ candidates:[{ content:{ parts:[{ text }] } }] });
// Facture EASYFLEX : VC.177 auto-taggée Komatsu par l'IA ; VC.178 + BANJO sans engin.
const FACTURE = JSON.stringify({ meta:{ kind:'facture', vendor:'EASYFLEX', invoice_no:'MA212853', date:'2026-07-23', ht:632.98, tva:126.60, total:759.58 }, tx:[
  { date:'2026-07-23', label:'PRESTATION VERIN VC.177 JAUNE', amount:-342.00, category:'Véhicule / Réparations', asset:'Komatsu PC35-R8', qty:1, unit_price:285 },
  { date:'2026-07-23', label:'PRESTATION VERIN VC.178', amount:-336.00, category:'Véhicule / Réparations', asset:'', qty:1, unit_price:280 },
  { date:'2026-07-23', label:'BANJO BSP', amount:-22.34, category:'Véhicule / Réparations', asset:'', qty:2, unit_price:9.31 } ] });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Hors ligne SAUF le serveur local qui sert la page : sur un runner AVEC réseau,
  // `networkidle` n'arrive JAMAIS (la page rappelle Firebase en boucle) → timeout 30 s
  // et un rouge qui n'a rien à voir avec le rendu (leçon #220).
  await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
page.on('dialog', d => d.accept().catch(() => {}));   /* accepte les confirm() éventuels */

await ctx.route(/apex-secrets-proxy\.9r4rxssx64\.workers\.dev/, async (route) => {
  const url = route.request().url(); const body = route.request().postData() || '';
  if (url.endsWith('/health')) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, total:22 }) });
  if (/vérificateur|"financial"/i.test(body)) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ type:'text', text: JSON.stringify({ financial:true, kind:'facture', confidence:0.96 }) }] }) });
  if (url.includes('/gemini/')) return route.fulfill({ status:200, contentType:'application/json', body: geminiWrap(FACTURE) });
  return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ type:'text', text: FACTURE }] }) });
});
await ctx.route('**/__admin/login', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, grant:'g1.g2.g3' }) }));
await ctx.route('**/__fin/vault', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, empty:true }) }));
await ctx.route('**/__mail/scan', r => {
  if (!scanServed) { scanServed = true; return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[
    { id:'f1', mime:'application/pdf', filename:'Facture_EASYFLEX.pdf', from:'depannage@easyflex.pro', b64: b64('FACTURE-EASYFLEX-VERINS') },
  ] }) }); }
  return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[] }) });
});
await ctx.route('**/__mail/ack', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true }) }));

const gotoTab = async (label) => {
  await page.evaluate((lab) => { const t = [...document.querySelectorAll('#tabs .tab')].filter(b => (b.textContent||'').includes(lab)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; if (t) t.click(); }, label);
  await page.waitForTimeout(250);
};
const clickBtnWithText = (txt, root) => page.evaluate(([t,r]) => {
  const scope = r ? document.querySelector(r) : document;
  const b = [...(scope||document).querySelectorAll('button')].find(x => (x.textContent||'').includes(t));
  if (b) { b.click(); return true; } return false;
}, [txt, root||null]);

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.fill('#g-pass', '123456'); await page.fill('#g-pass2', '123456'); await page.click('#g-go');
  await page.waitForSelector('#tabs', { timeout: 5000 });
  await page.waitForSelector('#ai-pin', { timeout: 3000 });
  for (let i=0;i<6;i++){ try{ if(await page.locator('#ai-pin').count()){ await page.fill('#ai-pin',ADMIN_CODE); await page.click('#ai-on'); } await page.waitForSelector('#ai-off',{timeout:3000}); break; }catch(_){ await page.waitForTimeout(300);} }
  await page.evaluate(() => { try { localStorage.setItem('kdmc_admin_grant', 'g1.g2.g3'); } catch(e){} });

  // Importer la facture via le VRAI bouton « Vérifier maintenant »
  await gotoTab('Ajouter');
  await page.waitForSelector('#mail-scan', { timeout: 4000 });
  await page.click('#mail-scan');
  await page.waitForTimeout(2200);

  // 1) L'onglet Engins existe et compte l'engin auto-détecté (Komatsu)
  const tabTxt = await page.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(b=>b.textContent).join(' | '));
  rec(/🚜 Engins/.test(tabTxt), 'Onglet « 🚜 Engins » présent');
  rec(/🚜 Engins \(1\)/.test(tabTxt), 'Engin détecté TOUT SEUL par l\'IA → compteur (1)');

  // 2) Vue Engins : Komatsu à 342 €, VC.178+BANJO « à ranger »
  await gotoTab('Engins');
  let eng = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(/Komatsu PC35-R8/.test(eng), 'Engins : « Komatsu PC35-R8 » affiché');
  rec(/342/.test(eng), 'Engins : total Komatsu = 342 € (VC.177)');
  rec(/À ranger \(2\)/.test(eng), 'Engins : 2 dépenses encore « à ranger » (VC.178 + BANJO)');

  // 3) Rangement MANUEL en 1 tap : ouvrir « À ranger », taguer VC.178 → créer « Piaggio Porter »
  await clickBtnWithText('Ranger ces');
  await page.waitForSelector('#drillov', { timeout: 3000 });
  const opened = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#drillov .tx')];
    const r = rows.find(x => /VC\.178/.test(x.textContent));
    if (!r) return false;
    const b = [...r.querySelectorAll('button')].find(x => /Ranger sous un engin/.test(x.textContent));
    if (!b) return false; b.click(); return true;
  });
  rec(opened, 'Drill « À ranger » : bouton « 🚜 Ranger sous un engin » présent sur VC.178');
  await page.waitForSelector('#assetpick', { timeout: 3000 });
  rec(await page.locator('#assetpick').count() > 0, 'Sélecteur d\'engin ouvert (chips + nouvel engin)');
  // l'engin auto Komatsu doit être proposé comme chip
  const chipTxt = await page.evaluate(() => document.getElementById('assetpick')?.innerText || '');
  rec(/Komatsu PC35-R8/.test(chipTxt), 'Sélecteur : l\'engin Komatsu existant est proposé en chip');
  await page.fill('#asset-new', 'Piaggio Porter');
  await clickBtnWithText('Créer et ranger dessous', '#assetpick');
  await page.waitForTimeout(600);

  // 4) Vue Engins mise à jour : Komatsu 342 + Piaggio 336, 1 seule dépense reste à ranger
  await gotoTab('Engins');
  eng = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(/Piaggio Porter/.test(eng), 'Engins : « Piaggio Porter » créé et rangé (VC.178)');
  rec(/336/.test(eng), 'Engins : total Piaggio = 336 € (VC.178)');
  rec(/À ranger \(1\)/.test(eng), 'Engins : il ne reste plus qu\'1 dépense à ranger (BANJO)');
  rec(/Total dépensé sur tous les engins/.test(eng), 'Engins : total général affiché');

  // 5) Drill d'un engin : cliquer Piaggio ouvre ses opérations
  const drilled = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#view .card')];
    const c = cards.find(x => /Piaggio Porter/.test(x.textContent) && /336/.test(x.textContent));
    if (!c) return false; c.click(); return true;
  });
  await page.waitForTimeout(400);
  const drill = await page.evaluate(() => document.getElementById('drillov')?.innerText || '');
  rec(drilled && /VC\.178/.test(drill), 'Engins : cliquer « Piaggio Porter » ouvre ses opérations (VC.178)');

  rec(errs.length === 0, 'aucune exception JS (' + (errs[0]||'') + ')');
} catch (e) {
  rec(false, 'exception harness : ' + (e && e.message || e));
} finally {
  await browser.close(); server.close();
}
console.log('\n=== ENGINS — ' + oks.length + ' OK / ' + fails.length + ' FAIL ===');
if (fails.length) { fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
process.exit(0);
