/* PREUVE EN VRAI NAVIGATEUR — les tuiles de l'admin du domaine (kd-mc.com/admin/).
 *
 * Kevin, 24.09.2026 : « intègre les deux à voir dans mon domaine (tuile) admin ».
 * La garde de logique (admin-tuiles.test.mjs) prouve que hub() les rend ; celle-ci
 * prouve que la PAGE les affiche vraiment, sur iPhone (375 px), avec le domaine
 * simulé : tuiles visibles, cibles ≥ 44 px, bonnes destinations, 0 exception JS,
 * 0 débordement horizontal — et le verrou qui tient si on n'est pas admin.
 * Lancer : node tests/verify-admin-tuiles-reel.mjs   (Chromium Playwright)
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const RACINE = 'kdmc-home';
const CAPTURES = 'audit/captures-admin';
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let SESSION = null;
const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const j = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__sso/whoami') return j(SESSION || { ok: false });
  /* Le verrou est tenu par le DOMAINE, pas par la page (l'UI ne fait que le
     refléter — c'est écrit en tête de admin.js). On simule donc le vrai
     comportement du routeur : sans session admin PROUVÉE par Face ID, 403.
     Un faux serveur trop gentil ferait croire à une fuite qui n'existe pas. */
  const estAdmin = !!(SESSION && SESSION.ok && SESSION.admin && SESSION.verified);
  if (u.pathname === '/__admin/accounts') {
    if (!estAdmin) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: false })); }
    return j({ ok: true, accounts: [], kv: true });
  }
  if (u.pathname.startsWith('/__admin/')) {
    if (!estAdmin) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: false })); }
    return j({ ok: true });
  }
  if (u.pathname === '/apps.json') return j({ apps: [] });
  /* Un chemin qui finit par « / » est un DOSSIER : on sert son index.html, comme
     le fait le vrai hébergeur. Sans ça la page ne se charge même pas et le test
     accuse à tort les tuiles (piège vécu en l'écrivant). */
  let p = join(RACINE, u.pathname.replace(/^\/+/, ''));
  if (u.pathname === '/' || u.pathname.endsWith('/')) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end('404'); }
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(500); res.end('500'); }
});
await new Promise((r) => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message)));

const ouvre = async () => {
  await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
};

/* 1. Pas de session → verrou, aucune tuile */
SESSION = null;
await ouvre();
chk(await page.locator('#app .msg').count() > 0, 'sans session : le verrou s\'affiche');
chk(await page.locator('a.cardrow').count() === 0, 'sans session : aucune tuile servie');

/* 2. Admin reconnu MAIS non vérifié (pas de Face ID) → verrou */
SESSION = { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: false };
await ouvre();
chk(await page.locator('a.cardrow').count() === 0, 'admin non vérifié : toujours aucune tuile');

/* 3. Admin vérifié → les deux tuiles demandées */
SESSION = { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: true };
await ouvre();

const commerce = page.locator('a.cardrow[href="/admin/commerce.html"]');
const vente = page.locator('a.cardrow[href="https://kit.kd-mc.com/"]');
chk(await commerce.count() === 1, 'tuile Commerce : exactement une');
chk(await vente.count() === 1, 'tuile « ma page de vente » : exactement une');
chk(await commerce.isVisible().catch(() => false), 'tuile Commerce visible à l\'écran');
chk(await vente.isVisible().catch(() => false), 'tuile page de vente visible à l\'écran');

/* Elles sont EN HAUT : au-dessus de la première tuile des fonctions communes.
   ⚠️ Délai court + filet : si une tuile MANQUE, on veut un message clair, pas
   30 s d'attente puis une pile d'exception (vécu en sabotant ce test). */
const boite = async (l) => { try { return await l.first().boundingBox({ timeout: 2000 }); } catch { return null; } };
const yDe = async (l) => (await boite(l))?.y ?? 1e9;
const yCommerce = await yDe(commerce), yVente = await yDe(vente);
const yAutre = await yDe(page.locator('a.cardrow[href="https://cmcteams.kd-mc.com/"]'));
chk(yCommerce < yAutre && yVente < yAutre, 'les deux sont au-dessus des fonctions communes');

/* Tactile iPhone : cible ≥ 44 px (règle Apple HIG) */
for (const [nom, l] of [['Commerce', commerce], ['page de vente', vente]]) {
  const b = await boite(l);
  chk(!!b && b.height >= 44, 'tuile ' + nom + ' : hauteur ' + Math.round(b?.height || 0) + ' px (≥ 44)');
}

/* Libellés lisibles, pas de jargon vide */
const texte = async (l) => { try { return await l.first().innerText({ timeout: 2000 }); } catch { return ''; } };
chk((await texte(commerce.locator('.n'))).trim().length > 2, 'tuile Commerce : libellé non vide');
chk((await texte(vente.locator('.d'))).includes('kit.kd-mc.com'), 'tuile page de vente : l\'adresse est dite');

/* ── Kevin 26.09 : « je ne vois pas la tuile dans mon domaine admin » ──────────
   Il cherchait Tor. Le HTML ne suffit pas à le prouver : une tuile peut être
   dans le source et invisible à l'écran (masquée, hors cadre, hauteur nulle).
   On l'exige donc VISIBLE, tactile (≥ 44 px) et à la bonne adresse. */
const tor = page.locator('a.cardrow[href="https://tor.kd-mc.com/"]');
chk(await tor.count() === 1, 'tuile « Tor en clair » : exactement une');
chk(await tor.isVisible().catch(() => false), 'tuile Tor VISIBLE à l\'écran');
const bTor = await boite(tor);
chk(!!bTor && bTor.height >= 44, 'tuile Tor : hauteur ' + Math.round(bTor?.height || 0) + ' px (≥ 44)');

/* Et, plus large que Tor : aucune app du registre ne doit être introuvable ici. */
const registre = JSON.parse(readFileSync(new URL('../kdmc-home/apps.json', import.meta.url), 'utf8')).apps;
const rendus = (await page.locator('a.cardrow').evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''))).join(' ');
const parNom = new Map();
for (const [host, a] of Object.entries(registre)) {
  if (/^(www\.)?kd-mc\.com$/.test(host)) continue;
  const nom = (a.icon ? a.icon + ' ' : '') + (a.name || host);
  parNom.set(nom, [...(parNom.get(nom) || []), host]);
}
const orphelines = [...parNom].filter(([, hosts]) => !hosts.some((h) => rendus.includes(h))).map(([n]) => n);
chk(orphelines.length === 0, orphelines.length
  ? orphelines.length + ' app(s) INTROUVABLES depuis l\'admin : ' + orphelines.join(' · ')
  : 'les ' + parNom.size + ' apps du domaine sont toutes joignables depuis l\'admin');

/* Pas de doublon de destination dans toute la page */
const hrefs = await page.locator('a.cardrow').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
chk(new Set(hrefs).size === hrefs.length, 'aucune destination en double (' + hrefs.length + ' tuiles)');

/* Rien ne déborde à 375 px, aucune exception JS */
const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
chk(!deborde, 'aucun débordement horizontal à 375 px');
chk(erreurs.length === 0, 'aucune exception JS' + (erreurs.length ? ' (' + erreurs[0].slice(0, 120) + ')' : ''));

await mkdir(CAPTURES, { recursive: true }).catch(() => {});
await page.screenshot({ path: join(CAPTURES, 'admin-tuiles-375.png'), fullPage: true }).catch(() => {});

await browser.close();
srv.close();

console.log('\n== Tuiles de l\'admin — vrai navigateur, iPhone 375 px ==\n');
R.ok.forEach((m) => console.log('  ✅ ' + m));
R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log('\n' + (R.ko.length ? '❌' : '✅') + ' ' + R.ok.length + ' OK / ' + R.ko.length + ' KO\n');
process.exit(R.ko.length ? 1 : 0);
