/* Garde (18.11.2026, Kevin : « tous les tableaux de bord, UI, UX, et le général aussi » — « oui, fais-le ») : le PORTAIL général kd-mc.com
   est lisible sans effort sur iPhone — les descriptions de tuiles tiennent sur 2 lignes (Kit IA faisait 7, Rotaplan et Croupier 4),
   et la carte « messages » calme avec personne en ligne tient sur UNE ligne (plus de « · 0 connecté(s) » seul).
   Rien d'autre ne bouge : « Les boutiques » reste OUVERT d'office (Kevin 31.10), les boutiques et groupes gardent leur ordre.
   SABOTAGE=1 : ancien index.html + kdmc-boite.js (origin/main, ou ANCIEN_PORTAIL=<rév>) → doit être rouge. */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SAB = process.env.SABOTAGE === '1', REV = process.env.ANCIEN_PORTAIL || 'origin/main';
const ancien = (f) => execSync(`git -C "${racine}" show ${REV}:kdmc-home/${f}`, { maxBuffer: 20e6 });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const j = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__sso/whoami') return j({ ok: true, admin: true, verified: true, name: 'Kevin DESARZENS', uid: 'kdmc_admin', scope: ['*'] });
  if (u.pathname.startsWith('/__')) return j({ ok: true, messages: [], sources: [], nonLus: 0, nonLusAlertes: 0, connectes: 0, inscriptions: [], codes: [], inscriptionsAdmin: [], enLigne: [] });
  const f = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
  const p = join(racine, 'kdmc-home', f);
  if (SAB && (f === 'index.html' || f === 'kdmc-boite.js')) { res.writeHead(200, { 'content-type': TYPES[extname(f)] }); return res.end(ancien(f)); }
  if (!existsSync(p)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, r)); const B = 'http://127.0.0.1:' + srv.address().port;
let ko = 0; const ok = (c, m, d) => { console.log((c ? '✅ ' : '❌ ') + m + (!c && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 200) : '')); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [nom, w, h] of [['iphone-13', 390, 844], ['iphone-se', 375, 667]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
    await p.goto(B + '/'); await p.waitForTimeout(1800);
    await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /Plus tard/.test(e.textContent)); if (x) x.click(); }); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const lignes = (el) => { const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; return Math.round(el.getBoundingClientRect().height / lh); };
      const ds = (href) => { const a = document.querySelector('a.card[href^="' + href + '"] .ds'); return a ? { texte: a.textContent.trim(), lignes: lignes(a) } : null; };
      const al = document.getElementById('cercle-alerte');
      const bt = al && al.querySelector('.bt');
      const boutiques = [...document.querySelectorAll('details.grp')].find((d) => /Les boutiques/.test(d.textContent.slice(0, 60)));
      return { kit: ds('https://kit.kd-mc.com'), rota: ds('https://rotaplan.kd-mc.com'), crou: ds('https://croupier.kd-mc.com'),
        alerte: al && !al.hidden ? { texte: al.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(al.getBoundingClientRect().height), lignesTitre: bt ? lignes(bt) : 0 } : null,
        boutiquesOuvert: !!(boutiques && boutiques.open), nCartes: document.querySelectorAll('a.card').length };
    });
    const t = nom + ' : ';
    ok(r.kit && r.kit.lignes <= 2, t + `Kit IA ≤ 2 lignes (${r.kit && r.kit.lignes})`, r.kit);
    ok(r.rota && r.rota.lignes <= 2, t + `Rotaplan ≤ 2 lignes (${r.rota && r.rota.lignes})`, r.rota);
    ok(r.crou && r.crou.lignes <= 2, t + `Devenir croupier ≤ 2 lignes (${r.crou && r.crou.lignes})`, r.crou);
    ok(r.alerte && !/0 connecté/.test(r.alerte.texte) && /Aucun message en attente/.test(r.alerte.texte), t + 'carte calme, personne en ligne : « Aucun message en attente » seul, sans « 0 connecté(s) »', r.alerte);
    ok(r.alerte && r.alerte.h <= 64, t + `la carte tient sur une ligne (hauteur ${r.alerte && r.alerte.h} px ≤ 64)`, r.alerte);
    ok(r.boutiquesOuvert, t + '« Les boutiques » reste ouvert d\'office (Kevin 31.10)');
    ok(r.nCartes >= 26, t + `aucune tuile perdue (${r.nCartes} ≥ 26)`);
    ok(erreurs.length === 0, t + 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
    await c.close();
  }
  /* quand quelqu'un est en ligne, le nombre reste affiché (l'info utile n'est pas supprimée) */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await c2.route(/__(boite|cercle)\/admin(\/boite)?$/, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [], sources: [], nonLus: 0, nonLusAlertes: 0, connectes: 2, inscriptions: [], codes: [], inscriptionsAdmin: [], enLigne: [] }) }));
  const p2 = await c2.newPage(); await p2.goto(B + '/'); await p2.waitForTimeout(1800);
  await p2.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /Plus tard/.test(e.textContent)); if (x) x.click(); }); await p2.waitForTimeout(1200);
  const txt = await p2.evaluate(() => { const a = document.getElementById('cercle-alerte'); return a && !a.hidden ? a.innerText.replace(/\s+/g, ' ') : ''; });
  ok(/2 connecté/.test(txt), 'avec 2 personnes en ligne : « 2 connecté(s) » reste affiché', txt);
  await c2.close();
} finally { await b.close(); srv.close(); }
process.exit(ko ? 1 : 0);
