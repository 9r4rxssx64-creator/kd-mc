// PREUVE EN VRAI NAVIGATEUR (v1.1.285) — audit P1 « admin décidé côté serveur ».
//
// Les tests unitaires prouvent que les motifs fautifs ont disparu du fichier.
// CE script prouve le COMPORTEMENT réel : on charge la vraie page dans un vrai
// Chromium et on vérifie que l'onglet Admin ne s'affiche QUE si le serveur a
// renvoyé is_admin===true — jamais parce que l'utilisateur s'appelle « Kevin ».
//
// Lancer : node tests/runtime-admin-server-only.mjs
// Sortie : code 0 si tout est prouvé, 1 sinon (chiffres réels, jamais estimés).

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p) || !p.startsWith(ROOT)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});

const fail = [];
const ok = [];
const check = (cond, label) => (cond ? ok : fail).push(label);

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
// Chromium préinstallé dans l'image (build figé) : on le désigne explicitement
// au lieu de télécharger (interdit ici, et le numéro de build diffère de celui
// que @playwright/test attend).
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(
  existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {}
);

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Coupe le réseau sortant → exerce AUSSI le repli hors-ligne (le vecteur P1).
  await page.route('**', (route) => {
    const u = route.request().url();
    return u.includes(`127.0.0.1:${port}`) || u.includes(`localhost:${port}`)
      ? route.continue()
      : route.abort();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.K === 'object' && typeof window.K.login === 'function',
    null, { timeout: 15000 });

  const hidden = () => page.evaluate(() =>
    !!document.querySelector('#bnav-admin')?.classList.contains('h'));

  check(await hidden(), 'au démarrage, l\'onglet Admin est masqué');

  // 1) Utilisateur nommé « Kevin DESARZENS » MAIS sans is_admin du serveur
  //    (exactement ce que produit désormais le repli hors-ligne).
  await page.evaluate(async () => {
    try {
      await window.K.login({
        id: 'local_test', pseudo: 'kevin', real_name: 'Kevin DESARZENS',
        phone: '+33600000000', is_admin: false, created_at: Date.now(),
      }, 'local-token-test');
    } catch (_) { /* le reste du boot peut échouer hors-ligne, on s'en moque */ }
  });
  await page.waitForTimeout(400);
  const nameOnlyHidden = await hidden();
  const nameOnlyFlag = await page.evaluate(() => window.K?.user?.is_admin === true);
  check(nameOnlyHidden, 'nom « Kevin DESARZENS » sans is_admin serveur → Admin RESTE masqué');
  check(!nameOnlyFlag, 'nom « Kevin DESARZENS » sans is_admin serveur → K.user.is_admin n\'est PAS true');

  // 2) Même utilisateur, mais le SERVEUR a accordé l'admin → l'onglet doit apparaître
  //    (preuve qu'on n'a pas simplement tout cassé : l'admin légitime marche).
  await page.evaluate(async () => {
    try {
      await window.K.login({
        id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS',
        phone: '+33600000000', is_admin: true, created_at: Date.now(),
      }, 'server-jwt-test');
    } catch (_) {}
  });
  await page.waitForTimeout(400);
  check(!(await hidden()), 'is_admin=true renvoyé par le serveur → l\'onglet Admin s\'affiche');

  check(errors.length === 0, `aucune exception JS au boot (mesuré : ${errors.length})`);
  if (errors.length) console.log('   exceptions :', errors.slice(0, 3));
} finally {
  await browser.close();
  server.close();
}

console.log('\n=== PREUVE NAVIGATEUR RÉEL — admin décidé par le SERVEUR ===');
ok.forEach((l) => console.log('  ✅', l));
fail.forEach((l) => console.log('  ❌', l));
console.log(`\n${ok.length} prouvé(s), ${fail.length} échec(s)`);
process.exit(fail.length ? 1 : 0);
