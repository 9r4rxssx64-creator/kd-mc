/* AUDIT « à la place de Kevin » de l'app Finances (tools/finances/index.html).
 * Chromium mobile 390px, coffre créé+déverrouillé, IA activée (proxy MOCKÉ), données
 * réelles semées via les VRAIS flux, puis VÉRIFIE sur CHAQUE onglet : (a) 0 exception JS,
 * (b) chaque bouton réagit sans écran blanc, (c) 0 défilement horizontal, (d) inputs
 * ≥16px (pas de zoom iOS), (e) cibles tactiles ≥44px (Apple HIG), (f) capture par vue.
 * Réseau externe bloqué (leçon #135) → tout local + mocké. Sortie P0/P1/P2.
 * Lancer : node tests/verify-finances-as-kevin.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || '200807'; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.FIN_AUDIT_OUT || '/tmp/finances-audit';
try { fs.mkdirSync(OUT, { recursive: true }); } catch (_) {}
const MIME = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.css':'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'text/plain' });
  res.end(fs.readFileSync(fp));
});

const P0 = [], P1 = [], P2 = [], pass = [];
const rec = (cond, sev, msg) => { (cond ? pass : sev).push(msg); console.log((cond ? 'OK ' : (sev === P0 ? 'P0 ' : sev === P1 ? 'P1 ' : 'P2 ')) + msg); };

await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URL = 'http://localhost:' + PORT + '/tools/finances/';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  // Hors ligne SAUF le serveur local qui sert la page : sur un runner AVEC réseau,
  // `networkidle` n'arrive JAMAIS (la page rappelle Firebase en boucle) → timeout 30 s
  // et un rouge qui n'a rien à voir avec le rendu (leçon #220).
  await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => { errs.push(String(e.message || e).slice(0, 200)); });
page.on('dialog', d => { d.dismiss().catch(() => {}); });
page.on('download', d => { d.path().catch(() => {}); });

let releveN = 0;
await ctx.route(/apex-secrets-proxy\.9r4rxssx64\.workers\.dev/, async (route) => {
  const url = route.request().url();
  if (url.endsWith('/health')) return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, total:22 }) });
  const isGemini = url.includes('/gemini/');
  const body = route.request().postData() || '';
  let text;
  // v0.13.9 : 2e avis indépendant (VERIFY_PROMPT) — un doc-facture texte déclenche une vérif du type.
  // Le mock confirme « financier » pour que la vraie facture soit bien comptée.
  if (/vérificateur|"financial"/i.test(body)) text = JSON.stringify({ financial:true, kind: body.includes('FACTURE_TEST')?'facture':'facture', confidence:0.9, reason:'facture réelle' });
  else if (body.includes('Réponds juste: ok')) text = 'ok';
  else if (body.includes('QUESTION :')) text = 'D apres tes documents, tu as depense 120,00 EUR chez Garage Manuel.';
  else if (body.includes('FACTURE_TEST')) text = JSON.stringify({ meta:{kind:'facture',vendor:'Garage Manuel',invoice_no:'F-2026-42',date:'2026-06-15',ht:100,tva:20,tva_rate:20,total:120}, tx:[{date:'2026-06-15',label:'Reparation freins',amount:-120,category:'Vehicule / Reparations',vendor:'Garage Manuel',ht:100,tva:20,tva_rate:20}] });
  // v0.13.15 — facture au montant POSITIF (l'IA a oublié le signe) : le filet de
  // signe (audit P2) doit la compter en DÉPENSE, pas en revenu.
  else if (body.includes('FACTURE_MISSIGNED')) text = JSON.stringify({ meta:{kind:'facture',vendor:'SignTest Garage',invoice_no:'F-2026-88',date:'2026-06-20',total:88}, tx:[{date:'2026-06-20',label:'Vidange SignTest',amount:88,category:'Vehicule / Reparations',vendor:'SignTest Garage'}] });
  else if (body.includes('BILAN') || body.includes('expert-comptable')) text = 'BILAN — revenus superieurs aux depenses, flux positif. Conseils : provisionner l engagement accepte, comparer 2 devis, epargner 10%.';
  else if (body.includes('negociateur') || body.includes('compar')) text = 'Analyse : compare 2 garages avant chaque intervention, economie possible ~400 EUR.';
  else { const n = ++releveN, dd = String(n).padStart(2,'0'); text = JSON.stringify({ meta:{kind:'releve',bank:'Banque Test',account_masked:'FR76****1234',period:'juin 2026',opening:1200,closing:3645.8}, tx:[ {date:'2026-06-'+dd,label:'VIREMENT SALAIRE CMC '+n,amount:2500,category:'Revenus'}, {date:'2026-06-'+dd,label:'CARREFOUR MONACO '+n,amount:-54.20,category:'Alimentation'}, {date:'2026-06-'+dd,label:'NETFLIX '+n,amount:-13.49,category:'Abonnements'} ] }); }
  const respBody = isGemini ? JSON.stringify({ candidates:[{ content:{ parts:[{ text }] } }] }) : JSON.stringify({ content:[{ type:'text', text }] });
  return route.fulfill({ status:200, contentType:'application/json', body: respBody });
});
await ctx.route('**/__admin/login', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, grant:'g1.g2.g3' }) }));
let finBlob = null;
await ctx.route('**/__fin/vault', r => {
  if (r.request().method() === 'PUT') { try { finBlob = JSON.parse(r.request().postData()||'{}'); } catch(e){} return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, savedAt: Date.now() }) }); }
  return r.fulfill({ status:200, contentType:'application/json', body: finBlob ? JSON.stringify({ ok:true, blob: finBlob.blob }) : JSON.stringify({ ok:true, empty:true }) });
});
await ctx.route('**/__mail/scan', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, items: [] }) }));
await ctx.route('**/__mail/ack', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true }) }));

const shot = async (name) => { try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch (_) {} };
const errAt = () => errs.length;

const TABS = [
  ['add','Ajouter'], ['dash','Tableau'], ['bilan','Bilan'], ['expert','Expert'],
  ['comptes','Comptes'], ['compta','Comptabilit'], ['compare','Comparateur'],
  ['ask','Demander'], ['tx','Op'], ['devis','Devis'], ['budget','Budget'], ['set','glages'],
];
// Un clic sur un montant/chiffre ouvre un overlay drill-down (#drillov, feature légitime,
// leçon #148) OU l'aperçu d'un document (#docov). Il couvre la page → il faut le fermer
// avant l'action suivante, exactement comme closeDrill()/closeDocOverlay() (o.remove()).
const dismissOverlays = () => page.evaluate(() => {
  document.querySelectorAll('#drillov,#docov').forEach((e) => e.remove());
}).catch(() => {});
const gotoTab = async (label) => {
  await dismissOverlays();
  // v0.11.0 a 2 onglets contenant « Bilan » (🔎 Bilan + 📑 Bilan complet). Les labels du test
  // sont partiels (« Op », « glages »…) → on clique, parmi les .tab qui CONTIENNENT le label,
  // celui au texte le PLUS COURT (🔎 Bilan < 📑 Bilan complet), via son vrai onclick.
  const ok = await page.evaluate((lab) => {
    const tabs = [...document.querySelectorAll('#tabs .tab')].filter((b) => (b.textContent || '').includes(lab));
    if (!tabs.length) return false;
    tabs.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    tabs[0].click();
    return true;
  }, label);
  if (!ok) await page.locator('#tabs .tab', { hasText: label }).first().click();
  await page.waitForTimeout(250);
};

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  await page.fill('#g-pass', '123456'); await page.fill('#g-pass2', '123456'); await page.click('#g-go');
  await page.waitForSelector('#tabs', { timeout: 5000 });
  rec(true, P0, 'coffre cree -> UI principale (12 onglets)');
  await page.waitForSelector('#ai-pin', { timeout: 3000 });
  // Activation robuste. Le handler #ai-on affiche « ✅ IA activée » dans #ai-msg PUIS
  // fait setTimeout(render,700) qui RECONSTRUIT la carte → #ai-msg est transitoire (~700ms).
  // Le signal STABLE d'activation = le bouton « Désactiver » (#ai-off, rendu uniquement quand
  // aiOn=true après le re-render). On attend CE signal, pas le message fugace, et on re-clique
  // si nécessaire (on re-remplit #ai-pin s'il est encore là). Rien n'est simulé à la place de
  // l'app : c'est SON handler qui pose aiPinHash → SON render qui affiche #ai-off.
  let aiActivated = false;
  for (let attempt = 0; attempt < 6 && !aiActivated; attempt++) {
    try {
      if (await page.locator('#ai-pin').count()) {
        await page.fill('#ai-pin', ADMIN_CODE);
        await page.click('#ai-on');
      }
      await page.waitForSelector('#ai-off', { timeout: 3000 });
      aiActivated = true;
    } catch (_) { await page.waitForTimeout(300); }
  }
  if (!aiActivated) throw new Error('activation IA jamais confirmée (#ai-off absent) après 6 tentatives');
  await page.waitForTimeout(500);
  rec(true, P0, 'classement IA active (proxy mocke)');
  await page.evaluate(() => { try { localStorage.setItem('kdmc_admin_grant', 'g1.g2.g3'); } catch(e){} });
  await gotoTab('Ajouter');
  await page.fill('#paste', 'BANQUE TEST — juin 2026\n01/06 VIREMENT SALAIRE 2500,00\n03/06 CARREFOUR -54,20'); await page.click('#paste-go');
  await page.waitForFunction(() => /3 op/.test(document.querySelector('.top h1 .sub')?.textContent||''), { timeout: 6000 });
  await gotoTab('Ajouter');
  await page.fill('#paste', 'FACTURE_TEST — Garage Manuel, freins, 120 EUR TTC'); await page.click('#paste-go');
  await page.waitForFunction(() => /4 op/.test(document.querySelector('.top h1 .sub')?.textContent||''), { timeout: 6000 });

  // v0.13.15 — FILET DE SIGNE FACTURE (audit P2) : une facture au montant POSITIF
  // renvoyée par l'IA (signe oublié) DOIT être stockée en DÉPENSE (montant négatif),
  // jamais en revenu. On importe une facture +88 et on lit le SIGNE réel de l'op
  // via le drill de sa catégorie (rendu propre de l'app : .am.neg si amount<0).
  await gotoTab('Ajouter');
  await page.fill('#paste', 'FACTURE_MISSIGNED — SignTest Garage, 88 EUR'); await page.click('#paste-go');
  await page.waitForFunction(() => /5 op/.test(document.querySelector('.top h1 .sub')?.textContent||''), { timeout: 6000 });
  await dismissOverlays();
  await gotoTab('Tableau');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#view .catrow')].find(r => /R[ée]parations/i.test(r.textContent));
    if (row) row.click();
  });
  await page.waitForTimeout(300);
  const sign = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#drillov .tx, #view .tx')];
    const r = rows.find(x => /Vidange SignTest/i.test(x.textContent));
    if (!r) return null;
    const am = r.querySelector('.am');
    return am ? { neg: am.classList.contains('neg'), pos: am.classList.contains('pos'), txt: am.textContent.trim() } : null;
  });
  rec(!!sign && sign.neg && !sign.pos, P1,
    'filet signe : facture +88 stockée en DÉPENSE (Vidange SignTest = ' + (sign ? sign.txt + ' .' + (sign.neg ? 'neg' : 'pos') : 'introuvable') + ')');
  await dismissOverlays();

  await gotoTab('Ajouter');
  await page.setInputFiles('#file', { name:'devis.csv', mimeType:'text/csv', buffer: Buffer.from('Date;Libelle;Montant;Type\n2026-06-10;Devis peinture Touareg;1200,00;devis\n','utf8') });
  await page.waitForSelector('.card:has-text("attente de d")', { timeout: 6000 });
  rec(true, P0, 'donnees semees : 4 operations + 1 devis (via les vrais flux)');

  const smallTouch = {};
  for (const [id, label] of TABS) {
    const before = errAt();
    await gotoTab(label);
    const viewLen = await page.evaluate(() => (document.getElementById('view')?.innerText || '').trim().length);
    rec(viewLen > 5, P0, 'onglet ' + id + ' : la vue s affiche (contenu rendu)');
    rec(errAt() === before, P0, 'onglet ' + id + ' : 0 exception JS au rendu');
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    rec(ov <= 1, P1, 'onglet ' + id + ' : pas de defilement horizontal (deborde de ' + ov + 'px)');
    await shot(id);
    const under = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll('#view button, #view a[href], #view select, #view input:not([type=hidden]):not([type=checkbox]), #topbar .ic, #tabs .tab');
      els.forEach(el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; if (r.height < 44) out.push({ t:(el.textContent||el.id||el.tagName).trim().slice(0,24), h: Math.round(r.height), c: el.className }); });
      return out;
    });
    under.forEach(u => { const k = (String(u.c).split(' ')[0] || u.t); if (!smallTouch[k] || u.h < smallTouch[k]) smallTouch[k] = u.h; });
  }

  let minFont = 99;
  for (const [, label] of TABS) {
    await gotoTab(label);
    const mf = await page.evaluate(() => { let m=99; document.querySelectorAll('#view input:not([type=checkbox]), #view select, #view textarea').forEach(el => { const f=parseFloat(getComputedStyle(el).fontSize)||16; if(f<m)m=f; }); return m; });
    if (mf < minFont) minFont = mf;
  }
  rec(minFont >= 16, P1, 'champs de saisie >=16px (pas de zoom iOS) — min ' + (minFont === 99 ? 'n/a' : minFont + 'px'));

  const EXCLUDE = /effacer|verrouiller|d.sactiver|supprimer|wipe|lock|refuser|logout|connexion/i;
  let clicked = 0, crashed = 0, blanked = 0;
  for (const [, label] of TABS) {
    await gotoTab(label);
    const n = await page.locator('#view button:visible').count();
    for (let i = 0; i < n; i++) {
      await gotoTab(label);
      const btns = page.locator('#view button:visible');
      const cnt = await btns.count(); if (i >= cnt) break;
      const b = btns.nth(i);
      const txt = ((await b.textContent().catch(() => '')) || '').trim();
      if (EXCLUDE.test(txt)) continue;
      const before = errAt();
      clicked++;
      try { await b.click({ timeout: 1200 }); } catch (_) {}
      await page.waitForTimeout(120);
      await dismissOverlays(); // referme un drill/doc éventuel avant le bouton suivant
      const alive = await page.locator('#tabs').count();
      if (alive === 0) { blanked++; P0.push('bouton ' + (txt||('#'+i)) + ' (' + label + ') -> ecran blanc'); }
      if (errAt() !== before) { crashed++; P0.push('bouton ' + (txt||('#'+i)) + ' (' + label + ') -> exception JS'); }
    }
  }
  rec(crashed === 0 && blanked === 0, P0, 'balayage boutons : ' + clicked + ' cliques, 0 crash, 0 ecran blanc' + (crashed||blanked?(' (' + crashed + ' exceptions, ' + blanked + ' blancs)'):''));

  await gotoTab('Tableau');
  rec(await page.locator('.kpi').count() > 0, P1, 'Tableau : cartes KPI presentes');
  rec(await page.locator('#view svg').count() > 0, P1, 'Tableau : graphiques rendus');
  await gotoTab('Bilan');
  await page.fill('#bq', 'Garage'); await page.click('#bgo'); await page.waitForTimeout(400);
  rec(/Garage/i.test(await page.locator('#view').innerText()), P1, 'Bilan : recherche Garage -> resultat rendu');
  await gotoTab('Comptabilit');
  rec(/TVA|HT/.test(await page.locator('#view').innerText()), P1, 'Comptabilite : recap TVA/HT present');

  const tk = Object.keys(smallTouch);
  if (tk.length === 0) rec(true, P1, 'cibles tactiles : toutes >=44px');
  else tk.forEach(k => rec(false, P1, 'cible tactile < 44px : ' + k + ' = ' + smallTouch[k] + 'px (Apple HIG: 44px)'));

  rec(errs.length === 0, P0, 'aucune exception JS sur toute la session' + (errs.length ? ' -> ' + errs.slice(0,3).join(' | ') : ''));
} catch (e) {
  P0.push('EXCEPTION HARNESS: ' + (e.message || e));
  console.log('EXCEPTION', e);
  await shot('exception');
}

await browser.close();
server.close();
console.log('\n=== AUDIT FINANCES — ' + pass.length + ' OK / ' + P0.length + ' P0 / ' + P1.length + ' P1 / ' + P2.length + ' P2 ===');
if (P0.length) console.log('P0 (bloquant):\n - ' + P0.join('\n - '));
if (P1.length) console.log('P1 (a corriger):\n - ' + P1.join('\n - '));
if (P2.length) console.log('P2 (mineur):\n - ' + P2.join('\n - '));
console.log('\nCaptures : ' + OUT);
process.exit(P0.length ? 1 : 0);
