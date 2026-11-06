/* Garde (6.11.2026, robot d'affichage en ligne : dans l'app Javis, « 👑 Vue admin » du domaine passait SOUS le chat).
 * Cause : en mode app, #javis-panel est un enfant de flex (#javis-root) ; un enfant de flex respecte z-index même « static » → son z 2147483001
 * le mettait au-dessus de tous les boutons flottants du domaine (Vue admin z 2147481900, 📲, ✉️). Correctif : z-index:auto en mode app.
 * On sert l'app Javis (Kevin simulé), on pose un bouton fixe du domaine en bas à gauche et en bas à droite : chacun doit être le premier élément sous le doigt.
 * JAVIS_DIR=<dossier d'une ancienne app Javis> doit être ROUGE. */
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const DIR = process.env.JAVIS_DIR || path.resolve('javis');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0];
  if (u === '/__sso/whoami') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ ok: true, verified: true, admin: true, uid: 'kdmc_admin' })); }
  if (u.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
  const p = path.join(DIR, u === '/' ? 'index.html' : u); if (!p.startsWith(DIR) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  let c = fs.readFileSync(p);
  if (p.endsWith('index.html')) c = String(c).replace('</body>', '<button id="vue" style="position:fixed;left:8px;bottom:8px;z-index:2147481900;width:124px;height:44px">Vue admin</button><button id="boite" style="position:fixed;right:14px;bottom:14px;z-index:2147481900;width:52px;height:52px">✉</button></body>');
  r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(c); }).listen(0);
const b = await chromium.launch(); let ko = 0;
for (const [w, h] of [[390, 664], [844, 390], [1280, 720]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto('http://127.0.0.1:' + srv.address().port + '/');
  await p.waitForFunction(() => document.body.classList.contains('javis-app'), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ['vue', 'boite'].map((id) => { const e = document.getElementById(id), x = e.getBoundingClientRect(), d = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2); return [id, d === e || e.contains(d), d && (d.id || d.tagName)]; }));
  for (const [id, bon, dessus] of r) { if (!bon) ko++; console.log(`  ${bon ? '✅' : '❌'} ${w}×${h} bouton du domaine « ${id} » ${bon ? 'touchable' : 'caché sous ' + dessus}`); }
  await p.close();
}
await b.close(); srv.close();
console.log(ko ? `\n❌ ${ko} bouton(s) du domaine caché(s) par l'app Javis` : '\n✅ dans l\'app Javis, les boutons du domaine restent au-dessus du chat'); process.exit(ko ? 1 : 0);
