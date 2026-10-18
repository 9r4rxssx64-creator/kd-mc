/* PREUVE (Kevin 18.10.2026 soir : « Utilise les IA gratuites que l'on possède déjà », suite Gemini/Claude
 * à sec de crédit) — Finances lit maintenant un relevé/une facture PDF via Mistral/Pixtral GRATUIT, en
 * convertissant chaque page en image (pdf.js déjà vendored pour les aperçus), au lieu de dépendre
 * uniquement de Gemini/Claude (payants, peuvent manquer de crédit). Mistral refuse un PDF BRUT (HTTP 422)
 * mais lit des images : on prouve que l'appel Mistral envoie bien des image_url (jamais le PDF brut), que
 * Mistral RÉPOND (succès), et que Gemini/Claude ne sont JAMAIS appelés quand Mistral suffit — la chaîne
 * gratuite s'arrête au premier succès, elle ne « goûte » pas les payants par réflexe.
 * Chromium mobile 390px, coffre + IA (proxy MOCKÉ). Un vrai mini-PDF (généré ici, valide pour pdf.js) est
 * importé via le VRAI flux /__mail/scan. Réseau externe bloqué (leçon #135) → tout local + mocké.
 * Lancer : node tests/verify-finances-pdf-gratuit.mjs
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

/* Mini-PDF VALIDE (1 page, 200x200, un rectangle) — pdf.js doit pouvoir le parser réellement, sinon
 * le test ne prouve rien (confirmé en local : numPages=1). Pas de dépendance externe, pas de fixture lourde. */
function minimalPdf() {
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<<>>/Contents 4 0 R>>endobj\n',
    '4 0 obj<</Length 44>>stream\n1 0 0 RG 10 10 180 180 re S\nendstream endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) { offsets.push(body.length); body += o; }
  const xrefStart = body.length;
  let xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  body += xref + 'trailer<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + xrefStart + '\n%%EOF';
  return Buffer.from(body, 'latin1').toString('base64');
}
const PDF_B64 = minimalPdf();
const FACTURE = JSON.stringify({ meta:{ kind:'facture', vendor:'TEST GRATUIT', invoice_no:'G-1', date:'2026-10-18', ht:80, tva:16, total:96 }, tx:[
  { date:'2026-10-18', label:'PRESTATION TEST', amount:-96, category:'Services' } ] });

const fails = [], oks = [];
const rec = (cond, msg) => { (cond ? oks : fails).push(msg); console.log((cond ? 'OK ' : 'FAIL ') + msg); };

let mistralImageCalls = 0, mistralRawPdfCalls = 0, geminiCalls = 0, claudeCalls = 0, scanServed = false;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
page.on('dialog', d => d.dismiss().catch(() => {}));

await ctx.route(/apex-secrets-proxy\.9r4rxssx64\.workers\.dev/, async (route) => {
  const url = route.request().url(); const body = route.request().postData() || '';
  if (url.endsWith('/health')) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, total:22 }) });
  if (/vérificateur|"financial"/i.test(body)) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ type:'text', text: JSON.stringify({ financial:true, kind:'facture', confidence:0.95 }) }] }) });
  if (url.includes('/mistral/')) {
    if (body.includes('image_url')) mistralImageCalls++; else mistralRawPdfCalls++; /* preuve : jamais le PDF brut */
    return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ choices:[{ message:{ content: FACTURE } }] }) });
  }
  /* la sonde d'activation (#ai-on, « Réponds juste: ok ») appelle Gemini directement, texte seul, HORS de
     la chaîne d'import — on ne compte que les vrais appels avec un document (inline_data). */
  if (url.includes('/gemini/')) { if (body.includes('inline_data')) geminiCalls++; return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ candidates:[{ content:{ parts:[{ text: FACTURE }] } }] }) }); }
  if (url.includes('/anthropic/')) { claudeCalls++; return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ type:'text', text: FACTURE }] }) }); }
  return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ choices:[{ message:{ content: FACTURE } }] }) });
});
await ctx.route('**/__admin/login', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, grant:'g1.g2.g3' }) }));
await ctx.route('**/__fin/vault', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, empty:true }) }));
await ctx.route('**/__mail/scan', r => {
  if (!scanServed) { scanServed = true; return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[
    { id:'X', mime:'application/pdf', filename:'facture-test.pdf', from:'test', b64: PDF_B64 },
  ] }) }); }
  return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[] }) });
});
await ctx.route('**/__mail/ack', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true }) }));

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => (document.activeElement && document.activeElement.id === 'g-pass') || !!document.getElementById('g-face'), null, { timeout: 2000 }).catch(() => {});
  for (let k = 0; k < 3; k++) {
    await page.fill('#g-pass', '123456'); await page.fill('#g-pass2', '123456');
    if (await page.evaluate(() => document.getElementById('g-pass').value === '123456' && document.getElementById('g-pass2').value === '123456')) break;
  }
  await page.click('#g-go');
  await page.waitForSelector('#tabs', { timeout: 5000 });
  await page.waitForSelector('#ai-pin', { timeout: 3000 });
  for (let i=0;i<6;i++){ try{ if(await page.locator('#ai-pin').count()){ await page.fill('#ai-pin',ADMIN_CODE); await page.click('#ai-on'); } await page.waitForSelector('#ai-off',{timeout:3000}); break; }catch(_){ await page.waitForTimeout(300);} }
  await page.evaluate(() => { try { localStorage.setItem('kdmc_admin_grant', 'g1.g2.g3'); } catch(e){} });
  /* activer l'IA lance déjà un scan mail automatique (mailAutoScan(true)) : l'import a donc pu se produire
     dès l'activation, avant même un clic sur « Ajouter ». On n'exige PAS le clic #mail-scan, on laisse le
     temps à l'auto-scan puis on clique en secours s'il est encore là (idempotent, items déjà consommés). */
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const t = [...document.querySelectorAll('#tabs .tab')].filter(b => (b.textContent||'').includes('Ajouter')).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; if (t) t.click(); });
  await page.waitForTimeout(250);
  try { await page.click('#mail-scan', { timeout: 1500 }); } catch(_) {}
  await page.waitForTimeout(2000);

  rec(mistralImageCalls >= 1, 'Mistral appelé avec des IMAGES (pages du PDF rendues) — ' + mistralImageCalls + ' appel(s)');
  rec(mistralRawPdfCalls === 0, 'Mistral jamais appelé avec le PDF BRUT (il le refuserait en 422)');
  rec(geminiCalls === 0, 'Gemini (payant) jamais appelé — Mistral (gratuit) a suffi, 1er succès = on s\'arrête');
  rec(claudeCalls === 0, 'Claude (payant) jamais appelé — pas de repli payant quand le gratuit répond');

  await page.evaluate(() => { const t = [...document.querySelectorAll('#tabs .tab')].filter(b => (b.textContent||'').includes('Op')).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; if (t) t.click(); });
  await page.waitForTimeout(300);
  const ops = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(/PRESTATION TEST/.test(ops), 'La facture lue via Mistral (gratuit) est bien importée (ligne visible)');

  rec(errs.length === 0, 'aucune exception JS (' + (errs[0]||'') + ')');
} catch (e) {
  rec(false, 'exception harness : ' + (e && e.message || e));
} finally {
  await browser.close(); server.close();
}
console.log('\n=== PDF GRATUIT (Mistral) — ' + oks.length + ' OK / ' + fails.length + ' FAIL ===');
if (fails.length) { fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
process.exit(0);
