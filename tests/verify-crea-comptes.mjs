/* PREUVE — Créa Studio « comptes » (v9.0.0) : un espace par personne.
 * Chromium mobile 390px, réseau externe bloqué (leçon #135). On prouve :
 *   1) l'app demande PRÉNOM + NOM (un seul mot est refusé — règle de Kevin)
 *   2) chacun ne voit QUE ses créations (isolation réelle, pas cosmétique)
 *   3) l'app RETIENT des choses sur chaque personne (mémoire)
 *   4) le mauvais code ne donne pas accès à un compte existant
 *   5) « Kevin Desarzens » + 200807 = admin ; un homonyme (« Ronan Desarzens »)
 *      NE devient PAS admin (leçon #166 : un nom de famille n'identifie personne)
 *   6) l'admin voit TOUT LE MONDE et peut lire la mémoire de chacun
 *   7) sauvegarde → restauration ne perd rien
 * Lancer : node tests/verify-crea-comptes.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || '200807'; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8253;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
// le bac à sable ne peut pas joindre kd-mc.com : un échec réseau n'est pas un bug de l'app
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const URL_APP = `http://127.0.0.1:${PORT}/index.html`;
await page.goto(URL_APP, { waitUntil: 'load' });
await page.waitForTimeout(400);

const login = async (name, code) => {
  await page.fill('#gateName', name); await page.fill('#gateCode', code);
  await page.click('#gateGo'); await page.waitForTimeout(350);
  return {
    entre: await page.evaluate(() => document.getElementById('gate').classList.contains('hidden')),
    hint: (await page.textContent('#gateHint')) || '',
  };
};
const addCrea = (label) => page.evaluate(async (l) => {
  const c = document.createElement('canvas'); c.width = c.height = 24;
  c.getContext('2d').fillRect(0, 0, 24, 24);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  await window.Mine.save(b, l);
}, label);
const nCreas = async () => {
  await page.click('#bnav button[data-go="mine"]'); await page.waitForTimeout(400);
  return page.locator('#mineGrid .mine-it').count();
};

// 1) l'écran de connexion apparaît, et un seul mot est refusé
chk(!(await page.evaluate(() => document.getElementById('gate').classList.contains('hidden'))),
  'l\'app demande de se connecter au premier lancement');
let r = await login('Marie', '1234');
chk(!r.entre && /PRÉNOM et ton NOM/i.test(r.hint), `un seul mot est refusé — « ${r.hint.slice(0, 44)} »`);

// 2) Marie Dupont crée son espace et ses créations
r = await login('Marie Dupont', '1234');
chk(r.entre, 'Marie Dupont entre avec prénom + nom + code');
await addCrea('Photo de Marie'); await addCrea('Vidéo de Marie');
chk((await nCreas()) === 2, 'Marie voit ses 2 créations');

// 3) l'app retient des choses sur elle
const mem = await page.evaluate(() => window.Users.memory().map(x => x.t));
chk(mem.length >= 2 && mem.some(t => /Photo de Marie/.test(t)),
  `l'app retient ce que Marie fabrique (${mem.length} souvenir(s))`);

// 4) une autre personne : isolation réelle
await page.evaluate(() => window.Account.logout());
await page.waitForTimeout(250);
r = await login('Paul Martin', '5678');
chk(r.entre, 'Paul Martin crée son propre espace');
chk((await nCreas()) === 0, 'Paul ne voit AUCUNE création de Marie (isolation réelle)');
await addCrea('Dessin de Paul');
chk((await nCreas()) === 1, 'Paul voit sa création à lui');

// 5) mauvais code sur un compte existant
await page.evaluate(() => window.Account.logout()); await page.waitForTimeout(250);
r = await login('Marie Dupont', '9999');
chk(!r.entre && /[Cc]ode incorrect/.test(r.hint), `mauvais code refusé — « ${r.hint.slice(0, 40)} »`);
r = await login('Marie Dupont', '1234');
chk(r.entre && (await nCreas()) === 2, 'Marie retrouve ses 2 créations avec son bon code');

// 6) homonyme : « Ronan Desarzens » ne doit PAS devenir admin
await page.evaluate(() => window.Account.logout()); await page.waitForTimeout(250);
r = await login('Ronan Desarzens', '4321');
const ronanAdmin = await page.evaluate(() => window.Users.isAdmin());
chk(r.entre && !ronanAdmin, 'un homonyme (Ronan Desarzens) N\'EST PAS admin');

// 7) Kevin admin : mauvais code refusé, bon code = admin
await page.evaluate(() => window.Account.logout()); await page.waitForTimeout(250);
r = await login('Kevin Desarzens', '1111');
chk(!r.entre && /administrateur/i.test(r.hint), 'code admin incorrect refusé');
r = await login('Kevin Desarzens', ADMIN_CODE);
const kevAdmin = await page.evaluate(() => window.Users.isAdmin());
chk(r.entre && kevAdmin, 'Kevin Desarzens + 200807 = administrateur');

// 8) l'admin voit tout le monde
await page.click('#bnav button[data-go="mine"]'); await page.waitForTimeout(400);
const adminVisible = await page.evaluate(() => !document.getElementById('adminBox').classList.contains('hidden'));
const nUsers = await page.locator('#adminUsers .u-row').count();
chk(adminVisible && nUsers >= 4, `l'espace admin liste toutes les personnes (${nUsers} comptes)`);

// 9) l'admin peut voir les créations de TOUT LE MONDE
const avant = await page.locator('#mineGrid .mine-it').count();
await page.click('#adminSeeAll'); await page.waitForTimeout(400);
const apres = await page.locator('#mineGrid .mine-it').count();
chk(apres >= 3 && apres > avant, `« voir tout le monde » : ${avant} → ${apres} créations`);

// 10) l'admin lit la mémoire de quelqu'un d'autre
const memMarie = await page.evaluate(() => window.Users.memory(window.Users.uidOf('Marie Dupont')).length);
chk(memMarie >= 2, `l'admin lit la mémoire de Marie (${memMarie} souvenirs)`);

// 11) sauvegarde → restauration ne perd rien
const round = await page.evaluate(async () => {
  const b = window.Users.backup();
  const before = window.Users.list().length;
  localStorage.removeItem('crea_users');            // on simule une perte totale
  const lost = window.Users.list().length;
  await window.Users.restore(new File([await b.text()], 'b.json', { type: 'application/json' }));
  return { before, lost, after: window.Users.list().length };
});
chk(round.lost === 0 && round.after === round.before,
  `sauvegarde → restauration : ${round.before} comptes perdus puis retrouvés (${round.after})`);

// 12) RECONNU AUTO : si le domaine sait qui tu es, plus besoin de code
const auto = await (async () => {
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  // on simule la réponse du domaine (kd-mc.com/__sso/whoami)
  // l'app appelle « /__sso/whoami » en MÊME ORIGINE (le routeur sert aussi studio.kd-mc.com)
  await p2.route(/__sso\/whoami/, (rt) => rt.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, uid: 'kdmc_kevin', name: 'Kevin Desarzens', verified: true, admin: true }) }));
  await p2.route(/__sso\/issue/, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await p2.route(/\/log$/, (rt) => rt.fulfill({ status: 204, body: '' }));
  await p2.goto(URL_APP, { waitUntil: 'load' });
  await p2.waitForTimeout(1200);
  const dedans = await p2.evaluate(() => document.getElementById('gate').classList.contains('hidden'));
  const admin = await p2.evaluate(() => window.Users.isAdmin());
  const qui = await p2.evaluate(() => (window.Users.current() || {}).name || '');
  await c2.close();
  return { dedans, admin, qui };
})();
chk(auto.dedans && auto.qui === 'Kevin Desarzens',
  `RECONNU AUTO : le domaine dit qui tu es ⇒ aucun code à taper (« ${auto.qui} »)`);
chk(auto.admin, 'et Kevin est directement administrateur (identité vérifiée par le domaine)');

// 13) domaine injoignable : l'app demande normalement, elle ne se bloque pas
const horsLigne = await (async () => {
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p3 = await c3.newPage();
  await p3.route(/__sso/, (rt) => rt.abort());       // domaine coupé
  await p3.route(/\/log$/, (rt) => rt.abort());
  await p3.goto(URL_APP, { waitUntil: 'load' });
  await p3.waitForTimeout(1000);
  const gateVisible = await p3.evaluate(() => !document.getElementById('gate').classList.contains('hidden'));
  await p3.fill('#gateName', 'Sophie Bernard'); await p3.fill('#gateCode', '4242');
  await p3.click('#gateGo'); await p3.waitForTimeout(500);
  const entre = await p3.evaluate(() => document.getElementById('gate').classList.contains('hidden'));
  await c3.close();
  return { gateVisible, entre };
})();
chk(horsLigne.gateVisible && horsLigne.entre,
  'domaine injoignable ⇒ l\'app demande le code normalement et laisse entrer (jamais bloquée)');

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — COMPTES ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
