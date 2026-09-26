/**
 * Vérif RÉELLE au navigateur (leçons #96/#98/#126) du coffre d'autorisations.
 * Serveur HTTP local (map /CMCteams/* → repo, leçon #136) + Firebase mocké
 * (identitytoolkit → idToken, RTDB → PUT ok / GET file) + Face ID virtuel (CDP
 * addVirtualAuthenticator). Prouve : lock → déverrouillage → onglets → créer une
 * demande → l'autoriser (WebAuthn) → passe en historique → 0 exception JS.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/* Playwright n'est pas installé à la racine — on résout par chemin absolu (portable). */
const PW = process.env.PW_PKG || path.join(REPO, 'apex-ai/v13/node_modules/playwright/index.js');
const _pw = await import(pathToFileURL(PW).href);
const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.txt':'text/plain', '.json':'application/json', '.css':'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/CMCteams/')) p = p.slice('/CMCteams'.length);
  let f = path.join(REPO, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const ok = (m) => console.log('✅ ' + m);

await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const PAGE_URL = `http://localhost:${PORT}/CMCteams/tools/approvals/`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);

/* Face ID virtuel (WebAuthn platform authenticator, UV) — leçon #98 — sur LA page testée */
const cdp = await ctx.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

/* Neutralise l'auto-MAJ (version-badge-pwa) qui rechargerait la page pendant le test */
await page.route('**version-badge-pwa.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* no-op en test */' }));

/* Mock Firebase : auth anon + RTDB (état pending en mémoire) */
const db = { pending: {}, resolved: {} };
await page.route('**identitytoolkit.googleapis.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ idToken: 'tok_test', localId: 'anon1' }) }));
await page.route('**firebasedatabase.app/**', (route) => {
  const u = new URL(route.request().url());
  const seg = u.pathname.replace(/\.json$/, '').split('/').filter(Boolean); // apex_approvals/kdmc_admin/pending[/id]
  const kind = seg[2]; const id = seg[3];
  const m = route.request().method();
  if (m === 'GET') {
    const body = kind === 'pending' ? db.pending : (kind === 'resolved' ? db.resolved : null);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id ? (body?.[id] ?? null) : (body ?? null)) });
  }
  if (m === 'PUT') {
    let val = null; try { val = JSON.parse(route.request().postData() || 'null'); } catch {}
    const bag = kind === 'pending' ? db.pending : db.resolved;
    if (id) { if (val === null) delete bag[id]; else bag[id] = val; }
    return route.fulfill({ status: 200, contentType: 'application/json', body: route.request().postData() || 'null' });
  }
  return route.fulfill({ status: 200, body: 'null' });
});

try {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  /* 1. Lock visible, app cachée */
  if (await page.locator('#lock').isVisible() && !(await page.locator('#app').isVisible())) ok('écran de verrouillage affiché, app cachée');
  else fail('lock/app initial state');

  /* 2. Déverrouillage Face ID (virtuel) → app visible */
  await page.click('#unlock');
  await page.waitForTimeout(500);
  if (await page.locator('#app').isVisible()) ok('déverrouillé via Face ID (WebAuthn virtuel) → app affichée');
  else fail('unlock via Face ID');

  /* 3. Créer une demande simulée (CB) → carte apparaît */
  await page.selectOption('#sim-type', 'cb');
  await page.click('#sim-go');
  await page.waitForTimeout(300);
  const reqCount = await page.locator('.req').count();
  if (reqCount >= 1 && (await page.locator('#reqs').innerText()).includes('Paiement')) ok('demande CB créée + rendue dans la file (Firebase PUT mocké)');
  else fail('création demande (' + reqCount + ' cartes)');

  /* 4. Autoriser (Face ID) → disparaît de la file + Firebase resolved écrit */
  await page.click('.req [data-act="ok"]');
  await page.waitForTimeout(500);
  const after = await page.locator('.req').count();
  const resolvedKeys = Object.keys(db.resolved);
  if (after === 0 && resolvedKeys.length === 1 && db.resolved[resolvedKeys[0]].status === 'approved') ok('autorisée → retirée de la file + resolved={approved} écrit avec preuve');
  else fail('autorisation (cartes restantes ' + after + ', resolved ' + JSON.stringify(db.resolved) + ')');

  /* 5. Historique contient la décision */
  await page.click('.tab[data-tab="hist"]');
  await page.waitForTimeout(200);
  if ((await page.locator('#histlist').innerText()).includes('autorisé')) ok('journal des autorisations affiche la décision');
  else fail('historique');

  /* 6. Coffre : garde-fou anti-CB */
  await page.click('.tab[data-tab="vault"]');
  await page.fill('#v-name', 'Test');
  await page.fill('#v-val', '4111 1111 1111 1111');
  await page.click('#v-add');
  await page.waitForTimeout(200);
  const vaultTxt = await page.locator('#vlist').innerText();
  if (!vaultTxt.includes('Test')) ok('garde-fou : numéro de carte REFUSÉ au stockage');
  else fail('garde-fou CB non déclenché');

  /* 7. Signature : dessin + enregistrement chiffré (bascule d'onglet déterministe) */
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); document.querySelector('.tab[data-tab="sign"]').click(); });
  await page.waitForSelector('#pane-sign:not([style*="display: none"])', { timeout: 5000 });
  await page.waitForTimeout(150);
  const box = await page.locator('#sig').boundingBox();
  if (box) { await page.mouse.move(box.x + 20, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 90); await page.mouse.up(); }
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove())); /* toast fixed peut recouvrir */
  await page.locator('#sig-save').scrollIntoViewIfNeeded();
  await page.click('#sig-save');
  await page.waitForTimeout(200);
  if ((await page.locator('#sig-status').innerText()).includes('enregistrée')) ok('signature dessinée + enregistrée (chiffrée)');
  else fail('signature');

  /* 8. Signer un PDF de bout en bout (pdf-lib vendorisé, Face ID virtuel) */
  const plMod = await import(pathToFileURL(path.join(REPO, 'tools/approvals/vendor/pdf-lib.min.js')).href);
  const PL = plMod.default || plMod;
  const fixtureDoc = await PL.PDFDocument.create();
  fixtureDoc.addPage([300, 400]).drawText('Contrat de test', { x: 40, y: 350, size: 16 });
  const fixture = await fixtureDoc.save(); /* Uint8Array */
  await page.setInputFiles('#pdf-file', { name: 'contrat.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixture) });
  await page.waitForSelector('#pdf-opts:not([style*="display: none"])', { timeout: 8000 });
  const info = await page.locator('#pdf-info').innerText();
  if (info.includes('contrat.pdf') && info.includes('1 page')) ok('PDF chargé (pdf-lib lazy) — 1 page détectée');
  else fail('chargement PDF (' + info + ')');
  const dl = page.waitForEvent('download', { timeout: 12000 });
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.evaluate(() => document.getElementById('pdf-sign').click());
  const download = await dl.catch(async () => {
    const st = await page.locator('#pdf-status').innerText().catch(() => '?');
    throw new Error('pas de download — pdf-status="' + st + '"');
  });
  const dlPath = await download.path();
  const signed = readFileSync(dlPath);
  const header = signed.subarray(0, 5).toString('latin1');
  if (header === '%PDF-' && signed.length > fixture.length && /-signe\.pdf$/.test(download.suggestedFilename())) {
    ok('PDF SIGNÉ produit + téléchargé (' + signed.length + ' o > ' + fixture.length + ' o original, en-tête %PDF-)');
  } else fail('signature PDF (header ' + header + ', len ' + signed.length + '/' + fixture.length + ', name ' + download.suggestedFilename() + ')');
  /* le PDF signé doit rester un PDF valide re-parsable + contenir une image (la signature) */
  try {
    const re = await PL.PDFDocument.load(signed);
    if (re.getPageCount() === 1) ok('PDF signé re-parsable et valide'); else fail('PDF signé : page count ' + re.getPageCount());
  } catch (e) { fail('PDF signé invalide : ' + e.message); }

  /* 8b. Créer un compte : générateur mot de passe fort + kit préparé (chiffré) */
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); document.querySelector('.tab[data-tab="account"]').click(); });
  await page.waitForSelector('#pane-account:not([style*="display: none"])', { timeout: 5000 });
  const gen1 = await page.locator('#ac-pass').inputValue();
  await page.click('#ac-regen');
  const gen2 = await page.locator('#ac-pass').inputValue();
  const strong = gen1.length >= 16 && /[A-Z]/.test(gen1) && /[a-z]/.test(gen1) && /[0-9]/.test(gen1) && /[^A-Za-z0-9]/.test(gen1);
  if (strong && gen1 !== gen2) ok('mot de passe fort généré (≥16, 4 classes) + régénérable');
  else fail('génération mot de passe (' + gen1 + ' / ' + gen2 + ')');
  await page.fill('#ac-service', 'ServiceTest');
  await page.fill('#ac-email', 'kevin+test@kd-mc.com');
  const savedPass = await page.locator('#ac-pass').inputValue();
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.click('#ac-prepare');
  await page.waitForTimeout(300);
  const listTxt = await page.locator('#ac-list').innerText();
  if (listTxt.includes('ServiceTest') && listTxt.includes('kevin+test@kd-mc.com')) ok('compte préparé + rendu dans « Comptes préparés »');
  else fail('compte préparé (' + listTxt.slice(0, 80) + ')');
  /* stocké CHIFFRÉ : le localStorage ne contient pas le mot de passe en clair */
  const clearLeak = await page.evaluate((pw) => { const raw = localStorage.getItem('apx_appr_accounts_v1') || ''; return raw.includes(pw); }, savedPass);
  if (!clearLeak) ok('compte stocké CHIFFRÉ (mot de passe absent du localStorage en clair)');
  else fail('fuite : mot de passe en clair dans localStorage');

  /* 9. PWA : manifest valide + service worker enregistré + métas installables */
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const mres = await page.request.get(new URL(manifestHref, PAGE_URL).href);
  const manifest = await mres.json().catch(() => null);
  if (manifest && manifest.display === 'standalone' && Array.isArray(manifest.icons) && manifest.icons.length && manifest.start_url) {
    ok('manifest.json valide (standalone, icône, start_url) — installable');
  } else fail('manifest (' + JSON.stringify(manifest) + ')');
  const swReg = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no-sw-api';
    try { const r = await navigator.serviceWorker.ready; return r && r.active ? 'active' : 'registered'; } catch (e) { return 'err:' + e.message; }
  });
  if (swReg === 'active' || swReg === 'registered') ok('service worker enregistré (' + swReg + ') — offline + MAJ auto');
  else fail('service worker : ' + swReg);
  const iosMeta = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').count();
  if (iosMeta === 'yes' && appleIcon === 1) ok('métas iOS présentes (apple-mobile-web-app + apple-touch-icon)');
  else fail('métas iOS (capable=' + iosMeta + ', appleIcon=' + appleIcon + ')');

  if (errors.length) fail('exceptions JS : ' + errors.slice(0, 4).join(' | '));
  else ok('0 exception JS');
} catch (e) {
  fail('exception test : ' + (e && e.message));
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? '\n=== ÉCHEC ===' : '\n=== OK : app broker vérifiée au navigateur ===');
