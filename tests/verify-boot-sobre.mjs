/* GARDE « BOOT SOBRE » — l'ouverture de CMCteams ne frappe plus Firebase 317 fois (audit du 30.09.2026, P0-1/P0-2)
 *
 * Mesuré le 30.09 en Chromium (audit complet, § 3.e) : ouvrir index.html, AVANT tout login, émettait
 * 317 `PUT /cmcteams/cmc_known_identities.json` (learnIdentity → ls() → fbWrite, un PUT du magasin entier
 * par employé) et la vérification de version retéléchargeait index.html entier (3,4 Mo) toutes les 60 s.
 * v9.930 : lsLocal() pour les clés de tenue de maison, UN PUT groupé 30 s plus tard (0 si inchangé),
 * version.txt (6 octets) pour la vérif de version, repli lourd 1×/h.
 *
 * Ici : la VRAIE app servie depuis le disque dans un vrai Chromium (iPhone), Firebase et le reste coupés
 * mais COMPTÉS (on voit chaque PUT qui part). Trois vérités :
 *   1. pendant les 12 s qui suivent le chargement : PUT Firebase ≤ 8 (avant : 317), et AU PLUS UN pour
 *      cmc_known_identities. Mesuré après v9.930 : 6 PUT restent, tous d'amorce quand la base répond vide
 *      (cmc_e, cmc_t, cmc_chefs_t, cmc_pw, cmc_reg, cmc_audit) — c'est le sujet « last-write-wins / amorce »
 *      de l'audit (§ 3.c, R6), pas celui-ci ;
 *   2. aucune requête `index.html?_v=` (l'ancienne sonde lourde) ; au retour au premier plan, la sonde
 *      demande `version.txt?_v=` ;
 *   3. SABOTAGE : le même index.html servi avec `if(!_lsLocalOnly)fbWrite` → `fbWrite` (= l'ancien code)
 *      refait ≥ 50 PUT → ce garde rougit. Il est donc bien discriminant.
 * node tests/verify-boot-sobre.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', txt: 'text/plain' };
const HOST = 'https://cmcteams.kd-mc.com';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

async function ouvrir(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const compte = { put: 0, lourde: 0, version: 0, autres: 0, cles: [] };
  await ctx.route('**/*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (/firebasedatabase\.app|firebaseio\.com/.test(u.host)) {
      if (req.method() === 'PUT') { compte.put++; compte.cles.push(u.pathname.replace(/^.*\//, '').replace(/\.json$/, '')); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: req.method() === 'GET' ? 'null' : '{}' });
    }
    if (u.origin !== HOST) { compte.autres++; return route.abort(); }
    if (u.pathname.startsWith('/__')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
    if (u.pathname === '/index.html' && /[?&]_v=/.test(u.search)) compte.lourde++;
    if (u.pathname === '/version.txt') { compte.version++; return route.fulfill({ status: 200, contentType: 'text/plain', body: readFileSync('version.txt', 'utf8') }); }
    let p = u.pathname.replace(/^\/CMCteams\//, '/').replace(/^\//, '') || 'index.html';
    if (!existsSync(p)) return route.fulfill({ status: 404, body: '' });
    let body = readFileSync(p);
    if (opts.sabotage && p === 'index.html') body = Buffer.from(body.toString('utf8').replace('if(!_lsLocalOnly)fbWrite(k,v);', 'fbWrite(k,v);'));
    return route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'text/plain', body });
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('cmc_seen_v10_678', '1'); localStorage.setItem('cmc_cookies_consent', JSON.stringify({ ts: Date.now(), ver: 'test' })); } catch (_) {} });
  const page = await ctx.newPage();
  await page.goto(HOST + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(12000);
  return { ctx, page, compte };
}

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
console.log('\nBoot sobre : CMCteams n\'écrit plus 317 fois dans Firebase à l\'ouverture\n');
try {
  const { ctx, page, compte } = await ouvrir(browser);
  ok(compte.put <= 8, `1a. PUT Firebase pendant les 12 s après le chargement, avant login : ${compte.put} (≤ 8 ; mesuré avant v9.930 : 317 ; les restants sont l'amorce quand la base répond vide)`, compte.cles.join(', '));
  const ki = compte.cles.filter((k) => k === 'cmc_known_identities').length;
  ok(ki <= 1, `1b. cmc_known_identities : ${ki} PUT (≤ 1 ; avant : 317 — un par employé)`, compte.cles.join(', '));
  ok(compte.lourde === 0, `2a. aucune requête index.html?_v= (sonde lourde 3,4 Mo) au démarrage : ${compte.lourde}`);
  await page.evaluate(() => { try { localStorage.removeItem('cmc_last_force_update_check'); } catch (_) {} window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(1500);
  ok(compte.version >= 1 && compte.lourde === 0, `2b. retour au premier plan → la sonde lit version.txt (${compte.version}) et jamais index.html entier (${compte.lourde})`);
  await ctx.close();

  const s = await ouvrir(browser, { sabotage: true });
  ok(s.compte.put >= 50 && s.compte.cles.filter((k) => k === 'cmc_known_identities').length >= 50, `3. SABOTAGE (ancien ls() → fbWrite) : ${s.compte.put} PUT en 12 s dont ${s.compte.cles.filter((k) => k === 'cmc_known_identities').length} sur cmc_known_identities → le garde rougirait sans le correctif`, String(s.compte.put));
  await s.ctx.close();
} finally { await browser.close(); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
