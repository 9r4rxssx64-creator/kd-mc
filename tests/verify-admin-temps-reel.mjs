/* GARDE — le tableau de bord admin (kd-mc.com/admin/) se met à jour TOUT SEUL, et le bouton 👑 ne cache rien
 * (Kevin 24.10.2026, capture de l'admin v2.7.13 : « Vérifie que les infos soient à jour et se mettent à jour en temps réel sur cette page.
 *  Que tout fonctionne correctement, teste tout. »).
 *
 * Vrai Chromium, vraie page admin servie en HTTP, horloge accélérée (page.clock) :
 *  T1. « Messages non lus » suit la boîte toutes les 15 s (déjà vrai — témoin).
 *  T2. « Ventes à livrer » suit la caisse SANS recharger la page (avant : lue une seule fois à l'ouverture).
 *  T3. la relecture ne redessine pas le bloc Commerce pendant que Kevin y écrit (champ gardé).
 *  T4. « Santé des services » est relue (5 min) sans ramener la page en haut.
 *  T5. le bouton « 👑 Vue admin » ne recouvre pas le badge de version (iPhone app installée, 390×844).
 *  T6. (24.10, pont 970 : 401 de la caisse chez Kevin) sans laissez-passer rangé, la page demande le pass au domaine et l'envoie à la caisse.
 *  T7. (24.10, pont 970 : 404 workers-status.json) « Santé des services » lit la surveillance en direct (kdmc-uptime) et en affiche les nombres.
 * SABOTAGE : `ADMIN_DIR=<ancien dossier admin>` → T2, T6, T7 rouges ; `INSTALLER=<ancien installer-client.js>` → T5 rouge.
 * Lancer : npm run test:admin-temps-reel
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const RACINE = new URL('../kdmc-home/', import.meta.url).pathname;
const ADMIN = process.env.ADMIN_DIR || join(RACINE, 'admin');
const OUTILS = new URL('../tools/', import.meta.url).pathname;
const { INSTALLER_JS } = await import(process.env.INSTALLER ? 'file://' + process.env.INSTALLER : '../services/kdmc-router/installer-client.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const etat = { livrer: 0, nonLus: 0, sante: 0, authCaisse: [] };
const srv = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/__admin/vue') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"mode":"admin"}'); }
    if (url === '/kdmc-sso.js') { res.writeHead(200, { 'content-type': 'text/javascript' });   /* session admin vérifiée simulée (le domaine est testé ailleurs) */
      return res.end("window.kdmcSSO={whoami:function(){return Promise.resolve({uid:'kdmc_admin',name:'Kevin',admin:true,verified:true});},token:function(){return '';},consumeHashToken:function(){}};"); }
    if (url === '/__installer/installer.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(INSTALLER_JS); }
    if (url === '/__sso/pass') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"token":"pass-de-test"}'); }
    let f;
    if (url.startsWith('/CMCteams/tools/')) f = join(OUTILS, normalize(url.slice('/CMCteams/tools/'.length)));
    else if (url.startsWith('/admin/')) f = join(ADMIN, normalize(url.slice('/admin/'.length) || 'index.html'));
    else f = join(RACINE, normalize(url));
    let buf = await readFile(f);
    if (process.env.DEBUG && url === '/admin/tableau.js') buf = Buffer.from(String(buf).replace('}).catch(function () { deny(null); });', '}).catch(function (e) { console.log("DEMARRER: " + (e && e.stack)); deny(null); });'));
    if (url === '/admin/' || url === '/admin/index.html') buf = Buffer.from(String(buf).replace('</body>', '<script src="/__installer/installer.js"></script></body>'));
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || (url.endsWith('/') ? TYPES['.html'] : 'application/octet-stream') });
    res.end(buf);
  } catch { res.writeHead(404).end('non trouvé'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'kdmc_k', value: '1', url: BASE }]);
const p = await ctx.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(String(e)));
if (process.env.DEBUG) { p.on('console', m => console.log('console:', m.text().slice(0, 200))); p.on('response', r => { if (r.status() >= 400) console.log('http', r.status(), r.url()); }); }

/* La caisse (autre domaine) : ses chiffres viennent de `etat`, comme la vraie qui change quand une commande arrive. */
/* La surveillance (autre domaine) : nombres seulement, comme la vraie sans clé. */
await p.route('https://kdmc-uptime.9r4rxssx64.workers.dev/**', r => { etat.sante++; return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ ok: true, ts: new Date().toISOString(), total: 34, en_ligne: 34, en_panne: 0 }) }); });
await p.route('https://kdmc-vente.9r4rxssx64.workers.dev/**', r => { etat.authCaisse.push(r.request().headers().authorization || ''); return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ ok: true, quand: new Date().toISOString(), admin: 'Kevin', produits: [], workflows: [],
    ventes: { n: 0, ca: 0, parProduit: {}, parSource: {}, parMois: {}, dernieres: [], tronque: false },
    file: { n: etat.livrer, demandes: Array.from({ length: etat.livrer }, (_, i) => ({ id: 'd' + i, produit: 'kit-ia', email: 'x@x.fr', methode: 'revolut', etat: 'en_attente', ts_iso: new Date().toISOString() })) },
    club: { actifs: 0, expirent14j: 0, relances: 0, abonnes_total: 0 }, contenu: {}, base_detail: null,
    config: { paypal_webhook: false, paypal_recherche: false, email_code: true, contenu_prive: true, commandes: false } }) }); });
await p.route('**/__lingua/depense', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"totalVoix":0,"totalAppels":0}' }));
/* Boîte simulée (le domaine est testé ailleurs) ; app installée = badge de version tout en bas. */
await p.addInitScript(() => {
  const ecoute = []; window.__nonLus = 0;
  const boite = { surMaj: f => ecoute.push(f), rafraichir: () => { const D = { nonLus: window.__nonLus, nonLusAlertes: 0, connectes: 0, inscriptions: [], codes: [], inscriptionsAdmin: [], enLigne: [], conversations: [] }; ecoute.forEach(f => f(D)); }, demarrer() {}, oublier() {}, trier: x => x, blocs: () => ({ codes: document.createElement('div'), inscriptionsAdmin: document.createElement('div'), inscriptions: document.createElement('div') }), donnees: () => null };
  Object.defineProperty(window, 'kdmcBoite', { configurable: false, get: () => boite, set: () => {} });
  Object.defineProperty(navigator, 'standalone', { get: () => true });
});
await p.clock.install();
await p.goto(BASE + '/admin/');
await p.clock.runFor(3000);
if (process.env.DEBUG) console.log('APP:', (await p.evaluate(() => document.getElementById('app').innerHTML)).slice(0, 600));
const cpt = id => p.evaluate(i => { const e = document.querySelector('[data-compteur="' + i + '"] .n'); return e ? e.textContent : null; }, id);

ok('T6. sans pass rangé : la caisse reçoit le laissez-passer demandé au domaine', etat.authCaisse.length > 0 && etat.authCaisse.every(a => a === 'Bearer pass-de-test'), JSON.stringify(etat.authCaisse.slice(0, 3)));
const sante = await p.evaluate(() => { const e = document.getElementById('tb-sante'); return e ? e.textContent : ''; });
ok('T7. « Santé des services » = la surveillance en direct (34/34)', /34\/34 services en ligne/.test(sante) && etat.sante >= 1, sante);
ok('au départ : Messages non lus = 0, Ventes à livrer = 0', (await cpt('messages')) === '0' && (await cpt('livrer')) === '0', (await cpt('messages')) + ' / ' + (await cpt('livrer')));

await p.evaluate(() => { window.__nonLus = 3; });
await p.clock.runFor(16000);
ok('T1. un message arrive → « Messages non lus » passe à 3 en ≤ 15 s, sans recharger', (await cpt('messages')) === '3', await cpt('messages'));

etat.livrer = 2;
await p.clock.runFor(61000);
ok('T2. une vente arrive → « Ventes à livrer » passe à 2 en ≤ 60 s, sans recharger', (await cpt('livrer')) === '2', await cpt('livrer'));

await p.evaluate(() => { const r = Array.from(document.querySelectorAll('[data-racc]')).find(x => /Inviter/.test(x.textContent)); if (r) r.click(); }); await p.clock.runFor(800);
const champ = await p.evaluate(() => { const i = document.querySelector('#commerce-app #inv-pour, #commerce-app input[type=text]'); if (i) { for (let q = i; q; q = q.parentElement) if (q.tagName === 'DETAILS') q.open = true; i.scrollIntoView(); } if (!i) return null; i.value = 'en cours'; i.focus(); i.setAttribute('data-essai', '1'); return document.activeElement === i; });
etat.livrer = 5;
await p.clock.runFor(61000);
const garde = await p.evaluate(() => { const i = document.querySelector('#commerce-app [data-essai]'); return i ? i.value : null; });
ok('T3. pendant que Kevin écrit dans Commerce : le compteur suit (5) et son texte est gardé', (await cpt('livrer')) === '5' && champ === true && garde === 'en cours', (await cpt('livrer')) + ' · focus=' + champ + ' · champ=' + garde);

await p.evaluate(() => window.scrollTo(0, 600));
const y0 = await p.evaluate(() => window.scrollY);
const s0 = etat.sante;
await p.clock.runFor(301000);
const y1 = await p.evaluate(() => window.scrollY);
ok('T4. la santé des services est relue (5 min) sans ramener la page en haut', etat.sante > s0 && y1 === y0, 'relectures ' + s0 + '→' + etat.sante + ', défilement ' + y0 + '→' + y1);

await p.evaluate(() => window.scrollTo(0, 0));
const r = await p.evaluate(() => {
  const a = document.querySelector('[data-kdmc-vue]'), v = document.getElementById('kdmc-version-badge');
  if (!a || !v) return { a: !!a, v: !!v };
  const x = a.getBoundingClientRect(), y = v.getBoundingClientRect();
  return { a: true, v: true, chevauche: x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top, h: Math.round(x.height), bas: Math.round(innerHeight - x.bottom) };
});
ok('T5. le bouton « 👑 Vue admin » ne recouvre pas le badge de version (390×844, app installée)', r.a && r.v && !r.chevauche && r.h >= 44, JSON.stringify(r));
ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

await b.close(); srv.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Tableau de bord admin : chiffres en temps réel, rien caché'));
process.exit(ko ? 1 : 0);
