// Preuve navigateur RÉEL (lesson #126) que le fix XSS iRemoteHub :
//  (1) un id d'appareil / une entrée de clone NFC malveillante rend INERTE (0 JS),
//  (2) la délégation dispatche toujours la bonne action avec la valeur RÉELLE.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log((c ? '✅' : '❌') + ' ' + m); };

const browser = await chromium.launch();
const page = await browser.newContext().then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(300);

const PL = `x');window.__pwned=1;//`;
const PL2 = `<img src=x onerror="window.__pwned2=1">`;

// 1) Appareil scanné avec id malveillant → carte inerte + délégation
const dev = await page.evaluate(({ pl, pl2 }) => {
  window.__pwned = undefined; window.__pwned2 = undefined;
  A.devices.set(pl, { id: pl, name: pl2, vendor: 'EvilCorp', category: 'tv', last_seen: Date.now() });
  A.view = 'accueil'; render();
  const app = document.getElementById('app');
  const card = app.querySelector('[data-act="openDevice"]');
  return {
    pwned: window.__pwned, pwned2: window.__pwned2,
    hasImg: app.innerHTML.includes('<img'),
    dataId: card ? card.getAttribute('data-id') : null,
    has: !!card,
  };
}, { pl: PL, pl2: PL2 });
ok(dev.pwned === undefined && dev.pwned2 === undefined, 'id/nom d\'appareil malveillant N\'exécute AUCUN JS');
ok(dev.hasImg === false, 'aucune balise <img> injectée (nom rendu comme texte)');
ok(dev.dataId === PL, 'data-id = id RÉEL décodé (lu via getAttribute)');
ok(dev.has, 'carte appareil rendue avec data-act=openDevice');

// clic → openDevice(id) via délégation → A.selectedDevice = id exact
await page.evaluate(() => document.querySelector('[data-act="openDevice"]').click());
const sel = await page.evaluate(() => A.selectedDevice);
ok(sel === PL, 'clic → openDevice(id) via délégation (id exact, 0 injection) : ' + sel);

// 2) Entrée de clone NFC malveillante (JSON scanné) → data-e inerte + parse correct
const clone = await page.evaluate(({ pl }) => {
  window.__pwned3 = undefined;
  window.cloneEmitNDEF = e => { window.__emitted = e; }; // stub (évite l'appel bridge)
  A.cloneLibrary = [{ id: pl, label: pl, format: 'NFC_NDEF', hardware: 'evil', payload: pl }];
  A.view = 'clone'; render();
  const btn = document.querySelector('[data-act="cloneEmitNDEF"]');
  const parsed = btn ? JSON.parse(btn.getAttribute('data-e')) : null; // doit re-parser proprement
  btn && btn.click();
  return {
    pwned3: window.__pwned3,
    hasImg: document.getElementById('app').innerHTML.includes('<img'),
    emittedId: (window.__emitted && window.__emitted.id) || null,
    parsedId: parsed ? parsed.id : null,
  };
}, { pl: PL });
ok(clone.pwned3 === undefined, 'entrée de clone NFC malveillante N\'exécute AUCUN JS');
ok(clone.hasImg === false, 'aucune balise injectée depuis la donnée NFC (rendue en texte)');
ok(clone.parsedId === PL, 'data-e re-parse en JSON valide (id exact)');
ok(clone.emittedId === PL, 'clic → cloneEmitNDEF(objet JSON) via délégation (objet exact, 0 injection)');

ok(errs.length === 0, 'aucune erreur JS runtime (' + errs.length + ')');

await browser.close();
server.close();
console.log(`\nverify-xss-delegation (iRemoteHub) : ${pass} OK / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
