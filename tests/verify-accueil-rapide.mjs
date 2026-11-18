/* L'ACCUEIL DU DOMAINE S'OUVRE TOUT DE SUITE, SANS ATTENDRE LA RÉPONSE DU DOMAINE — vrai Chromium, latence simulée
 * (Kevin 18.11.2026 : « C'est super long à ouvrir écran accueil domaine »)
 * Cause mesurée : le hub n'apparaissait qu'APRÈS /__sso/whoami (≈ 3 s sur réseau lent) ; pendant ce temps, seul « ⏳ Connexion au
 * domaine… » était visible. Maintenant : une personne déjà connue sur cet appareil voit ses tuiles tout de suite, le domaine vérifie
 * en parallèle ; refus = retour à l'écran de connexion ; aucune donnée privée (tableau admin, Mes appareils) avant la preuve.
 *   node tests/verify-accueil-rapide.mjs        SABOTAGE=1 : ancien comportement (attendre whoami) → le test doit rougir */
import http from 'node:http';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAB = process.env.SABOTAGE === '1';
const LATENCE = 2500;
let ok = 0, ko = 0; const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const lire = (f) => readFileSync(join(ROOT, f), 'utf8');

console.log('\nLes points d\'entrée\n');
const src = lire('kdmc-home/kdmc-portal.js');
dis(/accueilImmediat/.test(src), 'le portail sait afficher l\'accueil avant la réponse du domaine');
dis(/\?v=([\d.]+)/.exec(lire('kdmc-home/index.html'))[1] === /data-version="v([\d.]+)"/.exec(lire('kdmc-home/index.html'))[1], 'les 3 scripts et la pastille portent la même version');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p === '/' || p === '') p = '/index.html';
  let c; try { c = readFileSync(join(ROOT, 'kdmc-home', p)); } catch (_) { res.writeHead(404); res.end(); return; }
  /* SABOTAGE=1 : l'ancien comportement — on n'affiche jamais l'accueil avant la réponse du domaine */
  if (SAB && p === '/kdmc-portal.js') c = Buffer.from(String(c).replace('function accueilPossible(acc, frais) {', 'function accueilPossible(acc, frais) { return false;'));
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(c);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}/`;
const browser = await chromium.launch({ headless: true });

/* Faux domaine : whoami répond après LATENCE ms. `mode` : session | invalide | refus */
async function ouvrir(mode, avecCompte) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const appels = { whoami: 0, autres: 0 };
  const err = []; page.on('pageerror', (e) => err.push(String(e.message).slice(0, 140)));
  await page.route(/\/__sso\/whoami/, async (r) => {
    appels.whoami++;
    await new Promise((x) => setTimeout(x, LATENCE));
    const corps = mode === 'session' ? { ok: true, uid: 'kdmc_test_accueil', name: 'Léa Test', cgu: true, admin: false, verified: true, app: 'kdmc-home', portee: 'domaine' }
      : { ok: false };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
  });
  await page.route(/\/__(?!sso\/whoami)[a-z]+\//, (r) => { appels.autres++; r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }); });
  await page.route(/\/apps\.json/, (r) => r.fulfill({ status: 401, body: '' }));
  await page.addInitScript((c) => {
    try { if (c) localStorage.setItem('kdmc_account_v1', JSON.stringify({ uid: 'kdmc_test_accueil', name: 'Léa Test', salt: '', codeHash: '', created: 1 })); } catch (_) {} try { sessionStorage.setItem('kdmc_pk_skip', '1'); } catch (_) {}
  }, avecCompte);
  return { ctx, page, appels, err };
}
const hubVisible = (page) => page.evaluate(() => { const h = document.getElementById('hub'); return !!h && !h.hidden && h.getBoundingClientRect().height > 100; });
const garde = (page) => page.evaluate(() => { const g = document.getElementById('gate'); return !!g && !g.hidden && g.textContent.trim().length > 0; });

console.log('\nPersonne déjà connue sur cet appareil — le domaine met ' + LATENCE + ' ms à répondre\n');
{ const { ctx, page, appels, err } = await ouvrir('session', true);
  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  let tHub = -1; for (let i = 0; i < 80; i++) { if (await hubVisible(page)) { tHub = Date.now() - t0; break; } await page.waitForTimeout(50); }
  console.log(`     → tuiles visibles après ${tHub} ms (le domaine répond à ${LATENCE} ms)`);
  dis(tHub >= 0 && tHub < LATENCE - 800, `les tuiles s'affichent AVANT la réponse du domaine (${tHub} ms < ${LATENCE - 800} ms)`);
  const prive = await page.evaluate(() => { const t = document.getElementById('tdb-haut'), s = document.getElementById('self-svc'); return { tdb: t ? t.hidden : true, svc: s ? s.hidden : true }; });
  dis(prive.tdb && prive.svc, 'avant la preuve du domaine : le tableau de bord admin et « Mes appareils » restent cachés');
  await page.waitForTimeout(LATENCE + 1200);
  dis(await hubVisible(page), 'après la réponse du domaine : les tuiles sont toujours là (pas de clignotement)');
  dis(appels.whoami <= 2, `le domaine n'est interrogé que ${appels.whoami} fois au démarrage (≤ 2)`);
  dis(err.length === 0, 'aucune erreur JavaScript' + (err.length ? ' : ' + err.join(' | ') : ''));
  await ctx.close(); }

console.log('\nPersonne connue, mais le domaine dit « pas de session » — retour à l\'écran de connexion\n');
{ const { ctx, page } = await ouvrir('invalide', true);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(LATENCE + 1500);
  dis(!(await hubVisible(page)), 'les tuiles disparaissent : la personne n\'est pas prouvée');
  dis(await garde(page), 'l\'écran de connexion est affiché à la place');
  await ctx.close(); }

console.log('\nPremier passage (aucun compte sur cet appareil) — rien n\'est montré avant la preuve\n');
{ const { ctx, page } = await ouvrir('invalide', false);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  dis(!(await hubVisible(page)), 'un visiteur inconnu ne voit pas les tuiles pendant l\'attente');
  await page.waitForTimeout(LATENCE + 1200);
  dis(await garde(page), 'il arrive sur l\'écran de création de compte');
  await ctx.close(); }

await browser.close(); serveur.close();
console.log(`\n${ok} vérifications OK · ${ko} en échec${SAB ? ' (SABOTAGE : le test DOIT rougir)' : ''}`);
process.exit(ko ? 1 : 0);
