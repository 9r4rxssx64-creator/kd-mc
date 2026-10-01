/* PREUVE EN VRAI NAVIGATEUR — le bloc « ce que tu vas envoyer » des pages de vente.
 *
 * Kevin 24.09.2026 : « ça n'a jamais été au niveau commercialisable ». Mesuré :
 * la page qui demande 17 € contenait 0 image, 0 vidéo, 0 extrait — on demandait
 * de payer pour du texte qui promet du texte. Ce contrôle prouve que le produit
 * est désormais MONTRÉ avant l'achat, sur iPhone (375 px), en clair ET en sombre.
 * Lancer : node tests/verify-page-preuve-reelle.mjs   (Chromium Playwright)
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const RACINE = 'shops/kit-ia';
const CAPTURES = 'audit/captures-vente';
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
/* Delai court : quand le bloc MANQUE, chaque attente Playwright durerait 30 s
   (6 attentes x 2 themes = 6 min pour dire non). Une page cassee doit le dire vite. */
const T = 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = join(RACINE, u.pathname.replace(/^\/+/, '') || 'index.html');
  if (u.pathname.endsWith('/')) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(await readFile(p));
});
await new Promise((r) => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const browser = await chromium.launch();
await mkdir(CAPTURES, { recursive: true }).catch(() => {});

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: theme });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(BASE + '/avis.html', { waitUntil: 'networkidle' });

  const demo = page.locator('section.demo');
  chk(await demo.count() === 1, theme + ' : le bloc de preuve est rendu');
  const cas = page.locator('.demo-cas');
  chk(await cas.count() >= 2, theme + ' : au moins 2 cas montrés (' + (await cas.count()) + ')');

  /* Le produit doit être VISIBLE, pas seulement présent dans le HTML. */
  chk(await demo.isVisible({ timeout: T }).catch(() => false), theme + ' : le bloc est visible à l\'écran');
  const reponse = page.locator('.demo-reponse').first();
  const texte = (await reponse.innerText({ timeout: T }).catch(() => '')).trim();
  chk(texte.length > 200, theme + ' : la réponse montrée fait ' + texte.length + ' caractères (une vraie réponse, pas un extrait)');

  /* Honnêteté : la page doit DIRE que ce sont des exemples, pas de vrais clients. */
  const sous = await page.locator('section.demo > p.petit').innerText({ timeout: T }).catch(() => '');
  chk(/exemples?, pas de vrais clients/i.test(sous), theme + ' : la page dit que ce sont des exemples');

  /* Il est AVANT le prix : on montre avant de demander de payer. */
  /* .boundingBox() ATTEND l'element : sans catch, un bloc absent fait planter le
     controle en timeout 30 s au lieu d'afficher un ❌ lisible (vu au sabotage). */
  const yDemo = (await demo.boundingBox({ timeout: T }).catch(() => null))?.y ?? 1e9;
  const yPrix = (await page.locator('#acheter').boundingBox({ timeout: T }).catch(() => null))?.y ?? 0;
  chk(yDemo < yPrix, theme + ' : la preuve vient avant le prix');

  /* Lisible sur iPhone : rien ne déborde, texte assez gros, contraste non nul. */
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk(!deborde, theme + ' : aucun débordement horizontal à 375 px');
  const taille = await reponse.evaluate((el) => parseFloat(getComputedStyle(el).fontSize), null, { timeout: T }).catch(() => 0);
  chk(taille >= 15, theme + ' : texte de la réponse à ' + taille + ' px (≥ 15)');
  const couleurs = await reponse.evaluate((el) => {
    const s = getComputedStyle(el);
    return { texte: s.color, fond: s.backgroundColor };
  }, null, { timeout: T }).catch(() => ({ texte: 'absent', fond: 'absent' }));
  chk(couleurs.texte !== couleurs.fond, theme + ' : texte et fond différents (' + couleurs.texte + ' sur ' + couleurs.fond + ')');
  chk(erreurs.length === 0, theme + ' : aucune exception JS');

  await demo.screenshot({ path: join(CAPTURES, 'preuve-avis-' + theme + '.png'), timeout: T }).catch(() => {});
  await page.close();
}

await browser.close();
srv.close();

console.log('\n== La preuve produit sur la page de vente — vrai navigateur, iPhone 375 px ==\n');
R.ok.forEach((m) => console.log('  ✅ ' + m));
R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log('\n' + (R.ko.length ? '❌' : '✅') + ' ' + R.ok.length + ' OK / ' + R.ko.length + ' KO\n');
process.exit(R.ko.length ? 1 : 0);
