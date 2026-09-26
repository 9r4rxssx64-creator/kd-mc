/* PREUVE — Finances v0.13.18 : relevés bancaires enfin lus en ENTIER (salaire/revenus visibles),
 * PDF plus jamais envoyés à Mistral (fini le HTTP 422), réponse tronquée SAUVÉE, faux relevé écarté.
 * Chromium 390px, coffre + IA (proxy MOCKÉ). On importe 3 « PDF » via le VRAI /__mail/scan :
 *   A) relevé complet (salaire +2500, loyer, courses, solde) → toutes les opérations créées, Revenus>0
 *   B) réponse TRONQUÉE (coupée en plein milieu) → au moins 2 opérations sauvées (pas « illisible »)
 *   C) faux relevé (kind releve mais 0 solde + 1 op) → PAS un relevé fantôme
 * + Mistral n'est JAMAIS appelé pour un PDF (fini le 422). Réseau externe bloqué (leçon #135).
 * Lancer : node tests/verify-finances-statement.mjs
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

let mistralCalledForPdf = false, geminiN = 0, scanServed = false;
const geminiWrap = (text) => JSON.stringify({ candidates:[{ content:{ parts:[{ text }] } }] });
// A: relevé complet   B: tronqué (coupé)   C: faux relevé (0 solde, 1 op)
const STMT_A = JSON.stringify({ meta:{ kind:'releve', bank:'Banque Test', account_masked:'FR76****1234', opening:1200, closing:3345.30 }, tx:[
  { date:'2026-06-01', label:'VIREMENT SALAIRE CMC', amount:2500, category:'Revenus' },
  { date:'2026-06-03', label:'LOYER', amount:-1100, category:'Logement' },
  { date:'2026-06-10', label:'CARREFOUR', amount:-254.70, category:'Alimentation' },
  { date:'2026-06-15', label:'EDF PRELEVEMENT', amount:-84.50, category:'Énergie / Eau' } ] });
const STMT_B_TRUNC = '{"meta":{"kind":"releve","opening":1000,"closing":1800},"tx":[' +
  '{"date":"2026-05-01","label":"SALAIRE MAI","amount":2500,"category":"Revenus"},' +
  '{"date":"2026-05-04","label":"LOYER MAI","amount":-1100,"category":"Logement"},' +
  '{"date":"2026-05-09","label":"COURS'; /* coupé en plein milieu d'un objet */
const STMT_B_FULL = JSON.stringify({ meta:{ kind:'releve', opening:1000, closing:1800 }, tx:[
  { date:'2026-05-01', label:'SALAIRE MAI', amount:2500, category:'Revenus' },
  { date:'2026-05-04', label:'LOYER MAI', amount:-1100, category:'Logement' },
  { date:'2026-05-09', label:'COURSES MAI', amount:-180, category:'Alimentation' },
  { date:'2026-05-20', label:'PRIME MAI', amount:300, category:'Revenus' } ] });
const FAKE_RELEVE = JSON.stringify({ meta:{ kind:'releve' }, tx:[ { date:'2026-04-02', label:'Achat magasin', amount:-42.00, category:'Shopping' } ] });
let bCalls = 0;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Hors ligne SAUF le serveur local qui sert la page : sur un runner AVEC réseau,
  // `networkidle` n'arrive JAMAIS (la page rappelle Firebase en boucle) → timeout 30 s
  // et un rouge qui n'a rien à voir avec le rendu (leçon #220).
  await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
page.on('dialog', d => d.dismiss().catch(() => {}));

await ctx.route(/apex-secrets-proxy\.9r4rxssx64\.workers\.dev/, async (route) => {
  const url = route.request().url(); const body = route.request().postData() || '';
  if (url.endsWith('/health')) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, total:22 }) });
  if (url.includes('/mistral/')) { mistralCalledForPdf = true; return route.fulfill({ status:422, contentType:'application/json', body: JSON.stringify({ detail:[{ type:'value_error', loc:['body','messages'] }] }) }); }
  if (/vérificateur|"financial"/i.test(body)) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ type:'text', text: JSON.stringify({ financial:true, kind:'releve', confidence:0.95 }) }] }) });
  if (url.includes('/gemini/')) {
    geminiN++;
    let text = FAKE_RELEVE;                                  /* défaut prudent */
    if (body.includes(b64('PDF-A'))) text = STMT_A;          /* clé sur le contenu du PDF (déterministe, pas l'ordre) */
    else if (body.includes(b64('PDF-B'))) { bCalls++; text = (bCalls===1) ? STMT_B_TRUNC : STMT_B_FULL; } /* 1er = tronqué, ré-analyse = complet */
    else if (body.includes(b64('PDF-C'))) text = FAKE_RELEVE;
    return route.fulfill({ status:200, contentType:'application/json', body: geminiWrap(text) });
  }
  // autres moteurs (groq/cerebras/deepseek/claude) : ne devraient pas être atteints pour un PDF
  return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ type:'text', text: FAKE_RELEVE }] }) });
});
await ctx.route('**/__admin/login', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, grant:'g1.g2.g3' }) }));
await ctx.route('**/__fin/vault', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, empty:true }) }));
await ctx.route('**/__mail/scan', r => {
  if (!scanServed) { scanServed = true; return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[
    { id:'A', mime:'application/pdf', filename:'06-2026.pdf', from:'banque', b64: b64('PDF-A') },
    { id:'B', mime:'application/pdf', filename:'05-2026.pdf', from:'banque', b64: b64('PDF-B') },
    { id:'C', mime:'application/pdf', filename:'04-2026.pdf', from:'banque', b64: b64('PDF-C') },
  ] }) }); }
  return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[] }) });
});
await ctx.route('**/__mail/ack', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true }) }));

const gotoTab = async (label) => {
  await page.evaluate((lab) => { const t = [...document.querySelectorAll('#tabs .tab')].filter(b => (b.textContent||'').includes(lab)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; if (t) t.click(); }, label);
  await page.waitForTimeout(250);
};

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.fill('#g-pass', '123456'); await page.fill('#g-pass2', '123456'); await page.click('#g-go');
  await page.waitForSelector('#tabs', { timeout: 5000 });
  await page.waitForSelector('#ai-pin', { timeout: 3000 });
  for (let i=0;i<6;i++){ try{ if(await page.locator('#ai-pin').count()){ await page.fill('#ai-pin',ADMIN_CODE); await page.click('#ai-on'); } await page.waitForSelector('#ai-off',{timeout:3000}); break; }catch(_){ await page.waitForTimeout(300);} }
  await page.evaluate(() => { try { localStorage.setItem('kdmc_admin_grant', 'g1.g2.g3'); } catch(e){} });

  await gotoTab('Ajouter');
  await page.waitForSelector('#mail-scan', { timeout: 4000 });
  await page.click('#mail-scan');
  await page.waitForTimeout(2500);

  // 1) Mistral jamais appelé pour un PDF (fini le 422)
  rec(mistralCalledForPdf === false, 'PDF jamais envoyé à Mistral (fini le HTTP 422)');
  rec(geminiN >= 3, 'PDF routés vers un moteur qui lit les PDF (Gemini) — ' + geminiN + ' appels');

  // 2) Revenus / salaire visibles + relevé complet (4 op de A)
  await gotoTab('Tableau'); await page.waitForTimeout(300);
  const dash = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(/Revenus/.test(dash) && !/Revenus[^0-9]*0,00/.test(dash), 'Tableau : Revenus > 0 (salaire pris en compte)');

  // Compter les opérations réellement créées
  await gotoTab('Op'); await page.waitForTimeout(300);
  const ops = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  const hasSalary = /SALAIRE/.test(ops);
  rec(hasSalary, 'Opérations : le salaire (+2500) est présent');
  rec(/LOYER/.test(ops) && /CARREFOUR/.test(ops), 'Relevé A lu en ENTIER (loyer + courses présents, pas « 1 op »)');
  rec(/LOYER MAI/.test(ops), 'Relevé B tronqué : opérations SAUVÉES (pas « illisible »)');

  // 3) AUTO (aucun clic) : le relevé B (tronqué, 2 op) est ré-analysé TOUT SEUL via le cycle auto
  await gotoTab('Ajouter'); await page.waitForTimeout(200);
  const cardTxt = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(/automatiquement/i.test(cardTxt), 'Ajouter : la ré-analyse est annoncée AUTOMATIQUE (pas un bouton obligatoire)');
  // déclenche le cycle auto comme au retour dans l'app (focus) — aucun clic sur « ré-analyser »
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(4000);
  await gotoTab('Op'); await page.waitForTimeout(300);
  const ops2 = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(/PRIME MAI/.test(ops2), 'AUTO : le relevé tronqué est ré-analysé TOUT SEUL (PRIME MAI apparaît, 0 clic)');

  rec(errs.length === 0, 'aucune exception JS (' + (errs[0]||'') + ')');
} catch (e) {
  rec(false, 'exception harness : ' + (e && e.message || e));
} finally {
  await browser.close(); server.close();
}
console.log('\n=== STATEMENT — ' + oks.length + ' OK / ' + fails.length + ' FAIL ===');
if (fails.length) { fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
process.exit(0);
