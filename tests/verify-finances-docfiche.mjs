/* PREUVE ciblée (leçon #96) — Finances v0.13.16 : « fini corps-du-mail partout + fiche riche ».
 * Chromium mobile 390px, coffre + IA (proxy MOCKÉ), on IMPORTE 2 corps de mail (name = "corps-du-mail.txt")
 * via le VRAI flux /__mail/scan :
 *   A) une facture EDF (émetteur connu)   → doit s'afficher « EDF » (jamais « corps du mail »)
 *   B) un relevé SANS banque (émetteur vide) → doit s'afficher « Relevé bancaire » (type, jamais « corps... » ni « mail-... »)
 * Puis on ouvre « 🔎 Analyser » sur la facture EDF → la FICHE riche montre Émetteur/Date/Échéance/N°/HT/TVA/TTC/Articles.
 * Réseau externe bloqué (leçon #135) → tout local + mocké.
 * Lancer : node tests/verify-finances-docfiche.mjs
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
const EDF_BODY = 'EDFBODY — Facture EDF electricite. Client Kevin. Montant 84,50 EUR TTC. TVA 14,08. HT 70,42. N° facture F-2026-777. A regler avant le 30/07/2026 par prelevement.';
const REL_BODY = 'RELEVEBODY — Releve de compte du mois. Solde debut 1200,00. Solde fin 1345,30. Operations detaillees ci-dessous.';

let scanServed = false;
const fails = [], oks = [];
const rec = (cond, msg) => { (cond ? oks : fails).push(msg); console.log((cond ? 'OK ' : 'FAIL ') + msg); };

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

// Proxy IA mocké : classe EDFBODY → facture EDF, RELEVEBODY → relevé sans banque ; verify → financial.
await ctx.route(/apex-secrets-proxy\.9r4rxssx64\.workers\.dev/, async (route) => {
  const url = route.request().url(); const isGemini = url.includes('/gemini/');
  const body = route.request().postData() || '';
  let text;
  if (url.endsWith('/health')) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, total:22 }) });
  if (/vérificateur|"financial"/i.test(body)) text = JSON.stringify({ financial:true, kind:'facture', confidence:0.95, reason:'reel' });
  else if (body.includes('EDFBODY')) text = JSON.stringify({ meta:{ kind:'facture', vendor:'EDF', vendor_id:'FR 03 552081317', vendor_addr:'22 Av. de Wagram, 75008 Paris', client:'Kevin Desarzens', invoice_no:'F-2026-777', date:'2026-07-05', due_date:'2026-07-30', payment_method:'Prélèvement', ht:70.42, tva:14.08, tva_rate:20, total:84.50 }, tx:[{ date:'2026-07-05', label:'Abonnement électricité', amount:-84.50, category:'Énergie / Eau', vendor:'EDF', qty:2, unit_price:42.25, ht:70.42, tva:14.08, tva_rate:20 }] });
  else if (body.includes('RELEVEBODY')) text = JSON.stringify({ meta:{ kind:'releve', bank:'', account_masked:'', period:'', opening:1200, closing:1345.30 }, tx:[{ date:'2026-07-02', label:'VIREMENT SALAIRE', amount:2500, category:'Revenus' }, { date:'2026-07-03', label:'LOYER', amount:-1100, category:'Logement' }, { date:'2026-07-04', label:'COURSES', amount:-254.70, category:'Alimentation' }] });
  else text = JSON.stringify({ meta:{ kind:'releve' }, tx:[] });
  const respBody = isGemini ? JSON.stringify({ candidates:[{ content:{ parts:[{ text }] } }] }) : JSON.stringify({ content:[{ type:'text', text }] });
  return route.fulfill({ status:200, contentType:'application/json', body: respBody });
});
await ctx.route('**/__admin/login', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, grant:'g1.g2.g3' }) }));
await ctx.route('**/__fin/vault', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, empty:true }) }));
await ctx.route('**/__mail/scan', r => {
  // 1er scan : les 2 corps de mail (name 'corps-du-mail.txt'). Ensuite : vide.
  if (!scanServed) { scanServed = true; return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[
    { id:'a1', mime:'text/plain', filename:'corps-du-mail.txt', from:'facturation@edf.fr', b64: b64(EDF_BODY) },
    { id:'b1', mime:'text/plain', filename:'corps-du-mail.txt', from:'noreply@banque.test', b64: b64(REL_BODY) },
  ] }) }); }
  return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items:[] }) });
});
await ctx.route('**/__mail/ack', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true }) }));

const gotoTab = async (label) => {
  await page.evaluate((lab) => {
    const t = [...document.querySelectorAll('#tabs .tab')].filter(b => (b.textContent||'').includes(lab)).sort((a,b)=>a.textContent.length-b.textContent.length)[0];
    if (t) t.click();
  }, label);
  await page.waitForTimeout(250);
};

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.fill('#g-pass', '123456'); await page.fill('#g-pass2', '123456'); await page.click('#g-go');
  await page.waitForSelector('#tabs', { timeout: 5000 });
  // Activer l'IA (son handler pose aiPinHash → #ai-off apparaît)
  await page.waitForSelector('#ai-pin', { timeout: 3000 });
  for (let i=0;i<6;i++){ try{ if(await page.locator('#ai-pin').count()){ await page.fill('#ai-pin',ADMIN_CODE); await page.click('#ai-on'); } await page.waitForSelector('#ai-off',{timeout:3000}); break; }catch(_){ await page.waitForTimeout(300);} }
  await page.evaluate(() => { try { localStorage.setItem('kdmc_admin_grant', 'g1.g2.g3'); } catch(e){} });

  // Importer les corps de mail via le VRAI bouton « Vérifier maintenant »
  await gotoTab('Ajouter');
  await page.waitForSelector('#mail-scan', { timeout: 4000 });
  await page.click('#mail-scan');
  // Attendre que les 2 documents soient créés
  await page.waitForFunction(() => (document.querySelector('.top h1 .sub')?.textContent||'').match(/\d+ document/), { timeout: 8000 }).catch(()=>{});
  await page.waitForTimeout(1200);

  await gotoTab('Comptes');
  await page.waitForTimeout(400);

  const full = await page.evaluate(() => document.getElementById('view')?.innerText || '');
  rec(!/corps[- ]?du[- ]?mail/i.test(full), 'Comptes : le texte « corps du mail » n\'apparaît NULLE PART');
  rec(/EDF/.test(full), 'Comptes : la facture s\'affiche par son émetteur « EDF »');
  rec(/Relev[ée] bancaire/.test(full), 'Comptes : le relevé sans banque s\'affiche « Relevé bancaire » (type)');
  rec(!/mail-|corps-du-mail\.txt/i.test(full), 'Comptes : aucun nom technique (mail-…, corps-du-mail.txt)');

  // Ouvrir la fiche riche de la facture EDF via « 🔎 Analyser »
  const opened = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#view .doc')];
    const edf = rows.find(r => /EDF/.test(r.textContent));
    if (!edf) return false;
    const btn = [...edf.querySelectorAll('button')].find(b => /Analyser/.test(b.textContent));
    if (!btn) return false; btn.click(); return true;
  });
  rec(opened, 'Comptes : bouton « 🔎 Analyser » présent sur la facture EDF');
  await page.waitForTimeout(400);
  const fiche = await page.evaluate(() => {
    const ov = document.getElementById('drillov') || document.querySelector('.docfiche')?.closest('.ov') || document.body;
    return (ov.innerText || '');
  });
  rec(/🏪 Vendeur/.test(fiche) && /EDF/.test(fiche), 'Fiche : Vendeur = EDF (libellé selon le type)');
  rec(/🧾 SIRET \/ TVA/.test(fiche) && /552081317/.test(fiche), 'Fiche : SIRET/TVA du vendeur');
  rec(/📍 Adresse/.test(fiche) && /Wagram/.test(fiche), 'Fiche : adresse du vendeur');
  rec(/👤 Client/.test(fiche) && /Kevin Desarzens/.test(fiche), 'Fiche : client (acheteur)');
  rec(/2×/.test(fiche) && /42,25/.test(fiche), 'Fiche : article avec quantité × prix unitaire');
  rec(/#️⃣ N° facture/.test(fiche) && /F-2026-777/.test(fiche), 'Fiche : N° facture affiché');
  rec(/⏰ Échéance/.test(fiche) && /30\/07\/2026/.test(fiche), 'Fiche : échéance au 30/07/2026 (va plus loin)');
  rec(/🧮 Hors taxe/.test(fiche), 'Fiche : Hors taxe présent');
  rec(/➕ TVA/.test(fiche), 'Fiche : TVA présente');
  rec(/💶 Montant TTC/.test(fiche) && /84,50/.test(fiche), 'Fiche : Montant TTC 84,50 €');
  rec(/📋 Lignes/.test(fiche) && /électricit/i.test(fiche), 'Fiche : lignes/articles listés');
  rec(/💳 Paiement/.test(fiche), 'Fiche : moyen de paiement affiché');

  rec(errs.length === 0, 'aucune exception JS (' + (errs[0]||'') + ')');
} catch (e) {
  rec(false, 'exception harness : ' + (e && e.message || e));
} finally {
  await browser.close(); server.close();
}
console.log('\n=== DOCFICHE — ' + oks.length + ' OK / ' + fails.length + ' FAIL ===');
if (fails.length) { fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
process.exit(0);
