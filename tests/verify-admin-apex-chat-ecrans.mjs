/* GARDE — LES 13 ÉCRANS D'ADMINISTRATION D'APEX CHAT SONT MESURÉS SANS ADMIN RÉEL (Apex Chat 1.1.362, 07.11.2026)
   Constat : le robot public (Servi) est reconnu « utilisateur » par Apex Chat et le Chrome des agents du Lenovo n'a pas la session de Kevin : personne ne voyait ces écrans.
   Ici : la VRAIE page messaging-app/index.html est servie en local (réseau simulé, données vides), le compte admin est posé comme le fait l'app (`K.user.is_admin === true`,
   garde côté client seulement ; le serveur reste le seul juge des données), puis chacune des 13 vues est affichée (K.sv) et mesurée avec la mesure du domaine :
   cibles tactiles < 44 px (largeur ET hauteur, 390 px), contrôles recouverts EN BAS DE PAGE (en haut, ce qui est sous la barre fixe se révèle en défilant : pas un défaut),
   erreurs JavaScript. Limite honnête : données vides — un état très chargé n'est pas couvert.
   node tests/verify-admin-apex-chat-ecrans.mjs  ·  SABOTAGE=1 : retire la largeur minimale de `.btn-sm` (le « ← » faisait 42 px) — doit être rouge */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { mesurer } from '../tools/plateformes/verif-affichage-domaine.mjs';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
let html = readFileSync(new URL('../messaging-app/index.html', import.meta.url), 'utf8');
if (process.env.SABOTAGE) html = html.replace('min-height:44px;min-width:44px;font-size:.9em}', 'min-height:44px;font-size:.9em}');
const VUES = ['admin', 'admin-diag', 'admin-users', 'admin-connections', 'admin-toggles', 'admin-sentinels', 'admin-audit', 'admin-invite-book', 'admin-trusted-circle', 'admin-search', 'admin-timeline', 'admin-map', 'admin-premium'];
const ALIAS = { 'admin-timeline': 'admin-live-users' };   /* sans données, la chronologie d'une personne renvoie à la liste des comptes (comportement de l'app) */
const nav = await chromium.launch();
for (const [nom, w, h, tel] of [['iPhone 390×664', 390, 664, true], ['portable 1250×700', 1250, 700, false]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', isMobile: tel, hasTouch: tel });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 100)));
  await p.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname !== 'apex-chat.test') return r.abort();
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/__')) return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"users":[],"conversations":[],"connections":[],"events":[],"items":[],"list":[]}' });
    return r.fulfill({ status: 200, contentType: u.pathname.endsWith('.js') ? 'text/javascript' : 'text/plain', body: '' }); });
  await p.goto('https://apex-chat.test/'); await p.waitForTimeout(2500);
  t(await p.evaluate(() => typeof window.K) === 'object', `${nom} : la vraie page d'Apex Chat est chargée`);
  await p.evaluate(() => { K.user = { id: 'u-admin', is_admin: true, display_name: 'Essai', pseudo: 'essai' }; K.token = 'local-essai'; document.querySelector('#splash') && document.querySelector('#splash').classList.add('h'); ['#topbar', '#bnav'].forEach((s) => document.querySelector(s) && document.querySelector(s).classList.remove('h')); });
  const defauts = [];
  for (const v of VUES) {
    await p.evaluate((x) => { try { K.sv(x); } catch (e) { window.__sverr = String(e).slice(0, 80); } }, v); await p.waitForTimeout(700);
    const aff = await p.evaluate(() => K.view);
    await p.evaluate(() => { window.scrollTo(0, 1e6); const a = document.getElementById('app'); if (a) a.scrollTop = 1e6; document.querySelectorAll('#app *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = 1e6; }); }); await p.waitForTimeout(250);
    const m = await p.evaluate(mesurer, tel).catch(() => null);
    const bon = m && (aff === v || aff === ALIAS[v]) && m.cache === 0 && m.petit === 0 && m.deborde === 0;
    if (!bon) defauts.push(`${v}: ${aff !== v && aff !== ALIAS[v] ? 'non affichée (' + aff + ')' : ''}${m ? ` cache ${m.cache} petit ${m.petit}${m.petitEx && m.petitEx.length ? ' ' + m.petitEx.join('|') : ''} déborde ${m.deborde}` : ' mesure impossible'}`);
  }
  t(defauts.length === 0, `${nom} : les 13 vues sont affichées, sans cible < 44 px, sans contrôle recouvert, sans débordement${defauts.length ? ' — ' + defauts.join(' ; ') : ''}`);
  t(erreurs.length === 0, `${nom} : aucune erreur JavaScript${erreurs.length ? ' — ' + erreurs.slice(0, 2).join(' ; ') : ''}`);
  await ctx.close();
}
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
