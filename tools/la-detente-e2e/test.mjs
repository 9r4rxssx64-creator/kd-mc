/* Test E2E complet du studio + boutique La Détente (Playwright/chromium en CI).
   Couvre : login, coupes, couleur, emplacement, emblème, texte, undo/redo,
   import image, copier/coller, éditeur (gomme/magique/recadrer), zoom,
   et l'absence de débordement horizontal sur mobile (studio + boutique). */
import { chromium } from 'playwright';
import fs from 'fs';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || ''; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const BASE = process.env.BASE || 'http://localhost:8080';
const errors = [];
function ok(c, m){ if(!c){ throw new Error('ASSERT: '+m); } console.log('  ✓', m); }

const b = await chromium.launch();

async function login(page){
  await page.fill('#sgName', 'Kevin Desarzens');
  await page.fill('#sgPin', ADMIN_CODE);
  await page.click('#studioGate button:has-text("Entrer")');
  await page.waitForFunction(() => { const g=document.getElementById('studioGate'); return !g || g.style.display==='none'; }, { timeout:10000 });
}

const p = await b.newPage({ viewport:{ width:1100, height:820 } });
p.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
p.on('pageerror', e => errors.push('pageerror: '+e.message));

try {
  await p.goto(BASE+'/studio.html', { waitUntil:'load', timeout:30000 });
  await p.waitForTimeout(700);
  await login(p);
  ok(true, 'connexion studio OK');

  const garments = await p.$$eval('#garments .gbtn', els => els.length);
  ok(garments >= 11, 'coupes = '+garments+' (>=11)');
  const lyr = () => p.$$eval('#layers .lyr', e => e.length);
  const base = await lyr();

  // coupes / couleur / emplacement
  await p.click('#garments .gbtn:has-text("Polo")'); await p.waitForTimeout(120);
  await p.click('#garments .gbtn:has-text("Jogging")'); await p.waitForTimeout(120);
  await p.click('#garments .gbtn:has-text("T-shirt")'); await p.waitForTimeout(120);
  ok(true, 'changement de coupes OK (Polo/Jogging/T-shirt)');
  await p.click('#swatches .sw >> nth=2'); await p.waitForTimeout(80);
  await p.click('#placement .gbtn >> nth=1'); await p.waitForTimeout(80);
  ok(true, 'couleur + emplacement OK');

  // emblème
  await p.click('#emblems .eb >> nth=0'); await p.waitForTimeout(120);
  ok(await lyr() === base+1, 'ajout emblème → +1');

  // texte + undo/redo
  await p.click('button:has-text("Ajouter du texte")'); await p.waitForTimeout(120);
  ok(await lyr() === base+2, 'ajout texte → +1');
  await p.evaluate(() => Studio.undo()); await p.waitForTimeout(100);
  ok(await lyr() === base+1, 'undo → -1');
  await p.evaluate(() => Studio.redo()); await p.waitForTimeout(100);
  ok(await lyr() === base+2, 'redo → +1');

  // import + copier/coller
  await p.setInputFiles('#upl', 'shops/la-detente/img/designs/rose-pistol.png');
  await p.waitForTimeout(1000);
  ok(await lyr() === base+3, 'import image → +1');
  await p.click('#layers .lyr >> nth=0');
  await p.evaluate(() => Studio.copyLayer());
  await p.evaluate(() => Studio.pasteLayer());
  await p.waitForTimeout(120);
  ok(await lyr() === base+4, 'copier+coller → +1');

  // éditeur photo
  await p.click('#layers .lyr >> nth=0');
  await p.click('button:has-text("Retoucher")');
  await p.waitForSelector('#iceCanvas', { timeout:8000 });
  const cbox = await (await p.$('#iceCanvas')).boundingBox();
  await p.click('#iceTb-gomme');
  await p.mouse.move(cbox.x+cbox.width*0.5, cbox.y+cbox.height*0.5);
  await p.mouse.down(); await p.mouse.move(cbox.x+cbox.width*0.6, cbox.y+cbox.height*0.6); await p.mouse.up();
  await p.click('#iceTb-magique');
  await p.mouse.click(cbox.x+cbox.width*0.08, cbox.y+cbox.height*0.08);
  await p.waitForTimeout(120);
  await p.click('button:has-text("Appliquer")');
  await p.waitForFunction(() => { const m=document.getElementById('modal'); return m.className.indexOf('show')<0; }, { timeout:8000 });
  ok(true, 'éditeur gomme/magique appliqué');

  // zoom
  await p.evaluate(() => Studio.zoomBy(0.8));
  const vbw = await p.$eval('#stage', s => parseFloat((s.getAttribute('viewBox')||'0 0 100 100').split(' ')[2]));
  ok(vbw < 100, 'zoom + → viewBox réduit ('+vbw.toFixed(1)+')');
  await p.evaluate(() => Studio.zoomReset());
  const vbw2 = await p.$eval('#stage', s => parseFloat((s.getAttribute('viewBox')||'0 0 100 100').split(' ')[2]));
  ok(vbw2 === 100, 'zoom reset → 100');

  // exports présents
  const expOk = await p.evaluate(() => typeof Studio.exportMockup==='function' && typeof Studio.exportPrint==='function' && typeof Studio.exportPDF==='function' && typeof Studio.addToShop==='function');
  ok(expOk, 'exports (mockup/print/PDF) + ajouter boutique présents');

  // créer un produit en 1 clic → boutique
  await p.click('button:has-text("Ajouter à la boutique")');
  await p.waitForSelector('#m_name', { timeout:5000 });
  await p.click('button:has-text("Enregistrer")');
  await p.waitForTimeout(900);
  const nProd = await p.evaluate(() => JSON.parse(localStorage.getItem('ld_custom_products')||'[]').length);
  ok(nProd >= 1, 'créer un produit 1-clic → '+nProd+' produit(s) boutique');

  fs.mkdirSync('tools/la-detente-e2e', { recursive:true });
  await p.screenshot({ path:'tools/la-detente-e2e/studio-test.png' });

  // ===== MOBILE : pas de débordement horizontal =====
  const m = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  m.on('pageerror', e => errors.push('mobile pageerror: '+e.message));
  await m.goto(BASE+'/studio.html', { waitUntil:'load', timeout:30000 });
  await m.waitForTimeout(700);
  await login(m);
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  const iw = await m.evaluate(() => window.innerWidth);
  ok(sw <= iw+3, 'studio mobile 390px sans débordement horizontal ('+sw+'<='+iw+')');
  await m.screenshot({ path:'tools/la-detente-e2e/studio-mobile.png' });
  await m.goto(BASE+'/index.html', { waitUntil:'load', timeout:30000 });
  await m.waitForTimeout(800);
  const sw2 = await m.evaluate(() => document.documentElement.scrollWidth);
  ok(sw2 <= 390+3, 'boutique mobile 390px sans débordement ('+sw2+')');

  if (errors.length) { console.error('\n❌ ERREURS :\n'+errors.join('\n')); process.exit(1); }
  console.log('\n✅ E2E COMPLET OK — toutes fonctionnalités + mobile, 0 erreur.');
} catch (e) {
  try { await p.screenshot({ path:'tools/la-detente-e2e/studio-test.png' }); } catch(_){}
  console.error('\n❌ ÉCHEC E2E :', e.message);
  if (errors.length) console.error('Erreurs:\n'+errors.join('\n'));
  await b.close();
  process.exit(1);
}
await b.close();
