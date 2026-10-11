/* GARDE — le coffre Finances fonctionne de bout en bout, et rien de lisible ne sort du téléphone (11.10.2026)
   node tests/verify-finances-parcours.mjs          (SABOTAGE=1 : la page écrit son contenu EN CLAIR → la garde doit rougir)

   Kevin : « Vérifie que finance fonctionne correctement » (après « Finances m'envoie sur CMCteams »). Vrai Chromium 390 px, domaine simulé
   (admin reconnu, jamais de vrai code ni de vrai appel) : création du coffre (code trop court / confirmation différente refusés),
   les 14 onglets s'ouvrent sans erreur, saisie manuelle, rien de lisible au repos, sauvegarde en ligne désactivée par défaut puis
   activée avec un code JUGÉ PAR LE DOMAINE (la page ne le vérifie jamais), bloc envoyé chiffré, verrouillage, mauvais code refusé,
   bon code rouvre, rechargement de la page, 0 erreur JS, 0 appel vers un site extérieur. */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAB = process.env.SABOTAGE === '1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(R, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  let corps = fs.readFileSync(f); if (SAB && f.endsWith('tools/finances/index.html')) corps = Buffer.from(corps.toString('utf8').replace('localStorage.setItem(LS_VAULT,', "localStorage.setItem('clair',JSON.stringify(VAULT));localStorage.setItem(LS_VAULT,"));
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(corps); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port;
let ok = 0, ko = 0; const chk = (c, m) => { console.log(c ? '  ✅' : '  ❌', m); c ? ok++ : ko++; };
const nav = await chromium.launch(); const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const reseau = []; const loginsRecus = []; let coffreEnLigne = null;
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => { reseau.push('EXT ' + r.request().url().slice(0, 80)); r.abort(); });
await ctx.route('**/__**', (r) => { const u = new URL(r.request().url()); reseau.push(r.request().method() + ' ' + u.pathname);
  if (u.pathname === '/__fin/vault' && r.request().method() === 'PUT') { coffreEnLigne = r.request().postData(); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.pathname === '/__fin/vault') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
  if (u.pathname === '/__admin/login') { const b = JSON.parse(r.request().postData() || '{}'); loginsRecus.push(Object.keys(b).join(','));
    return r.fulfill({ status: 200, contentType: 'application/json', body: b.code === 'faux-code-ok' || b.pin === 'faux-code-ok' ? '{"ok":true,"grant":"g-test"}' : '{"ok":false,"reason":"code_invalide"}' }); }
  if (u.pathname === '/__admin/grant') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"grant":"g-test"}' });
  if (u.pathname === '/__mail/scan') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, uid: 'kdmc_admin', name: 'Kevin', admin: true, verified: true }) }); });
const page = await ctx.newPage(); const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message)); page.on('dialog', (d) => d.dismiss());
await page.goto(B + '/tools/finances/'); await page.waitForSelector('#g-pass', { timeout: 15000 });
chk(/Nouveau coffre Finances/.test(await page.textContent('body')), '1. première ouverture : « Nouveau coffre Finances »');
await page.fill('#g-pass', '123'); await page.fill('#g-pass2', '123'); await page.click('#g-go');
chk(/trop court/.test(await page.textContent('#g-err')), '2. code de 3 caractères refusé (« Code trop court »)');
await page.fill('#g-pass', '482916'); await page.fill('#g-pass2', '482917'); await page.click('#g-go');
chk(/ne correspondent pas/.test(await page.textContent('#g-err')), '3. deux codes différents refusés');
await page.fill('#g-pass', '482916'); await page.fill('#g-pass2', '482916'); await page.click('#g-go');
await page.waitForSelector('#btn-lock', { timeout: 20000 });
chk(true, '4. coffre créé avec un bon code → l\'app s\'ouvre (🔒 visible)');
const onglets = await page.$$eval('#tabs .tab', (b) => b.map((x) => x.textContent.trim()));
chk(onglets.length >= 8, `5. ${onglets.length} onglets : ${onglets.join(' | ')}`);
/* chaque onglet s'ouvre sans erreur */
for (let i = 0; i < onglets.length; i++) {
  const avant = erreurs.length; await page.locator('#tabs .tab').nth(i).click(); await page.waitForTimeout(250);
  const vide = await page.evaluate(() => !document.getElementById('view') || document.getElementById('view').innerText.trim().length < 3);
  chk(erreurs.length === avant && !vide, `   onglet « ${onglets[i]} » : s'affiche, ${erreurs.length - avant} erreur JS`);
}
/* saisie manuelle */
await page.locator('#tabs .tab').first().click(); await page.waitForSelector('#m-add');
await page.fill('#m-amt', '-42,50'); await page.fill('#m-label', 'Boulangerie TEST'); await page.click('#m-add'); await page.waitForTimeout(600);
const nb = await page.textContent('.top .sub');
chk(/1 opérations?/.test(nb), `6. saisie manuelle : l'opération est comptée (« ${nb.trim().slice(0, 40)} »)`);
const brut = await page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
chk(!/Boulangerie|482916/.test(brut) && /"ct"/.test(brut), '7. rien de lisible au repos : ni le libellé ni le code dans le stockage (blob chiffré présent)');
chk(coffreEnLigne === null, '8. sauvegarde en ligne : désactivée par défaut, rien n\'est envoyé tant qu\'on ne l\'active pas');
await page.locator('#tabs .tab', { hasText: 'Réglages' }).click(); await page.waitForSelector('#bk-on');
await page.click('#bk-on'); await page.waitForSelector('#bk-code');
await page.fill('#bk-code', 'mauvais'); await page.click('#bk-code-go'); await page.waitForTimeout(900);
chk(/code incorrect/.test(await page.textContent('#bk-msg')), '8a. mauvais code admin : refusé par le DOMAINE (« code incorrect »), la page ne juge rien elle-même');
chk(coffreEnLigne === null, '    … et rien n\'est parti vers /__fin/vault');
await page.fill('#bk-code', 'faux-code-ok'); await page.click('#bk-code-go'); await page.waitForTimeout(2500);
chk(!!coffreEnLigne, '8b. « Activer la sauvegarde en ligne » → le coffre part vers /__fin/vault (' + (coffreEnLigne ? coffreEnLigne.length : 0) + ' octets)');
chk(coffreEnLigne && !/Boulangerie|482916/.test(coffreEnLigne) && /"ct"/.test(coffreEnLigne), '8c. le bloc envoyé au serveur est chiffré : ni le libellé ni le code n\'y sont lisibles');
/* verrouiller puis rouvrir */
await page.click('#btn-lock'); await page.waitForSelector('#g-pass');
chk(/Coffre Finances/.test(await page.textContent('body')) && !/Nouveau/.test(await page.textContent('h2')), '9. verrouillé : l\'écran demande le code (plus « Nouveau coffre »)');
await page.fill('#g-pass', '000000'); await page.click('#g-go'); await page.waitForTimeout(1500);
chk(/#btn-lock/.test('x') || (await page.$('#btn-lock')) === null, '10. mauvais code : le coffre reste fermé');
await page.fill('#g-pass', '482916'); await page.click('#g-go'); await page.waitForSelector('#btn-lock', { timeout: 20000 });
chk(true, '11. bon code : le coffre se rouvre');
chk(/1 opérations?/.test(await page.textContent('.top .sub')), '12. l\'opération saisie est toujours là après verrouillage');
/* rechargement complet de la page */
await page.reload(); await page.waitForSelector('#g-pass, #btn-lock', { timeout: 15000 });
if (await page.$('#g-pass')) { await page.fill('#g-pass', '482916'); await page.click('#g-go'); await page.waitForSelector('#btn-lock', { timeout: 20000 }); }
chk(/1 opérations?/.test(await page.textContent('.top .sub')), '13. après rechargement de la page : données retrouvées');
chk(erreurs.length === 0, `14. aucune erreur JS sur tout le parcours (${erreurs.length}${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''})`);
chk(!reseau.some((x) => x.startsWith('EXT')), `15. aucun appel vers un site extérieur au démarrage (${reseau.filter((x) => x.startsWith('EXT')).length})`);
console.log('appels au domaine :', [...new Set(reseau.filter((x) => !x.startsWith('EXT')))].join(', '));
console.log(`\n${ko ? '❌' : '✅'} finances-parcours : ${ok}/${ok + ko}`);
await nav.close(); srv.close(); process.exit(ko ? 1 : 0);
