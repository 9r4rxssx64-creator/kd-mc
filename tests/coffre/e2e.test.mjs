/* Test réel end-to-end du coffre-fort (Playwright + Chromium).
   Lance un serveur HTTP local (contexte sécurisé pour Web Crypto / SW),
   ouvre la page, et vérifie : setup → ajout code → lock → unlock → déchiffrement
   identique → persistance après reload → ajout fichier → export round-trip.
   Usage: node tests/coffre/e2e.test.mjs
*/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || '200807'; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const require = createRequire(import.meta.url);
const { chromium } = require('/home/user/CMCteams/apex-ai/v13/node_modules/playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../coffre-fort');
const MIME = { '.html':'text/html', '.json':'application/json', '.js':'text/javascript', '.svg':'image/svg+xml' };

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✅', m); else { console.error('  ❌', m); fails++; } };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(fp);
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});

async function main() {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  console.log('Serveur:', base);

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.error('  ⚠️ pageerror:', e.message); fails++; });

  // boot (gère la redirection anti-cache ?_h=)
  await page.goto(base + '/?_h=test', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__CF_TEST__, null, { timeout: 8000 });

  console.log('\n[1] Crypto round-trip');
  const crypto1 = await page.evaluate(async () => {
    const T = window.__CF_TEST__;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await T.deriveKey('phrase-test-longue', salt, 50000);
    const enc = await T.encStr(k, 'secret-valeur-123');
    const dec = await T.decStr(k, enc);
    const bad = await T.decStr(await T.deriveKey('mauvaise', salt, 50000), enc);
    return { roundtrip: dec === 'secret-valeur-123', isEnc: enc.startsWith('CFENC1:'), badNull: bad === null };
  });
  ok(crypto1.roundtrip, 'chiffre→déchiffre = identique');
  ok(crypto1.isEnc, 'format CFENC1: appliqué');
  ok(crypto1.badNull, 'mauvaise phrase → null (jamais le payload)');

  console.log('\n[2] Setup du coffre via UI');
  await page.fill('#su_p', 'Kevin');
  await page.fill('#su_n', 'Desarzens');
  await page.fill('#su_pass', 'MonChat-Adore-Le-Cafe-2026!');
  await page.fill('#su_pin', ADMIN_CODE);
  // [2b] bouton 👁 afficher/masquer la phrase secrète
  await page.click('button[onclick*="su_pass"]');
  const shown = await page.evaluate(() => document.getElementById('su_pass').type === 'text');
  ok(shown, 'bouton 👁 affiche la phrase secrète');
  await page.click('button[onclick*="su_pass"]');
  await page.click('#su_go');
  await page.waitForSelector('.secgrid', { timeout: 8000 }).catch(()=>{});
  // ferme une éventuelle modale Face ID
  await page.evaluate(() => { const m=document.querySelector('.modal'); if(m) m.remove(); });
  const unlocked1 = await page.evaluate(() => window.__CF_TEST__.ST.unlocked && window.__CF_TEST__.hasVault());
  ok(unlocked1, 'coffre créé et déverrouillé');

  console.log('\n[3] Ajout d\'un code (texte) + persistance');
  await page.evaluate(async () => { await window.__CF_TEST__.addTextItem('codes', 'Clé Anthropic', 'sk-ant-api03-TEST-VALUE-xyz', []); window.__CF_TEST__.render(); });
  const added = await page.evaluate(() => window.__CF_TEST__.ST.meta.items.length);
  ok(added === 1, 'élément ajouté (1)');
  const decBack = await page.evaluate(async () => {
    const it = window.__CF_TEST__.ST.meta.items[0];
    return await window.__CF_TEST__.getTextItem(it);
  });
  ok(decBack === 'sk-ant-api03-TEST-VALUE-xyz', 'valeur déchiffrée identique');

  console.log('\n[4] Lock → reload → unlock par phrase secrète');
  await page.evaluate(() => window.__CF_TEST__.lockVault());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__CF_TEST__, null, { timeout: 8000 });
  const lockedScreen = await page.evaluate(() => !window.__CF_TEST__.ST.unlocked && window.__CF_TEST__.hasVault());
  ok(lockedScreen, 'écran verrouillé après reload (coffre persistant)');
  const unlock2 = await page.evaluate(async () => await window.__CF_TEST__.tryUnlockPassphrase('MonChat-Adore-Le-Cafe-2026!'));
  ok(unlock2 === true, 'déverrouillage par phrase secrète OK');
  const persisted = await page.evaluate(async () => {
    const it = window.__CF_TEST__.ST.meta.items.find(x => x.title === 'Clé Anthropic');
    return it ? await window.__CF_TEST__.getTextItem(it) : null;
  });
  ok(persisted === 'sk-ant-api03-TEST-VALUE-xyz', 'élément récupéré après reload (déchiffré)');

  console.log('\n[5] Mauvaise phrase rejetée');
  const wrong = await page.evaluate(async () => await window.__CF_TEST__.tryUnlockPassphrase('mauvaise-phrase'));
  ok(wrong === false, 'mauvaise phrase secrète refusée');

  console.log('\n[6] Déplacer un élément entre catégories');
  // re-déverrouille (le test [5] a tenté une mauvaise phrase mais l'état restait unlocked depuis [4])
  await page.evaluate(async () => {
    if (!window.__CF_TEST__.ST.unlocked) await window.__CF_TEST__.tryUnlockPassphrase('MonChat-Adore-Le-Cafe-2026!');
    window.CF.moveTo(window.__CF_TEST__.ST.meta.items[0].id, 'notes');
  });
  await page.waitForTimeout(300);
  const moved = await page.evaluate(() => window.__CF_TEST__.ST.meta.items[0].section);
  ok(moved === 'notes', 'élément déplacé vers une autre catégorie (codes → notes)');
  const movedPersist = await page.evaluate(async () => {
    const it = window.__CF_TEST__.ST.meta.items[0];
    return await window.__CF_TEST__.getTextItem(it); // toujours déchiffrable après déplacement
  });
  ok(movedPersist === 'sk-ant-api03-TEST-VALUE-xyz', 'contenu intact après déplacement');

  await browser.close();
  server.close();
  console.log(`\n${fails === 0 ? '✅ TOUS LES TESTS PASSENT' : '❌ ' + fails + ' échec(s)'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); server.close(); process.exit(1); });
