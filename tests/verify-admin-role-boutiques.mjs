/* GARDE — l'écran admin montre et pose le rôle « 🛍 Gère les boutiques » (pont 1044, 25.10.2026).
 * Avant : le droit « shops » (qui ouvre l'admin de Chez Lolo, La Détente, Sourcing et du tableau des boutiques à Laurence) n'avait AUCUN
 * écran : ni le voir, ni le poser. Kevin ne pouvait le donner qu'à la main, par une requête.
 * Vrai Chromium, vraie page admin servie en HTTP, domaine simulé (/__admin/accounts, /__admin/acces) :
 *  R1. la fiche d'une personne a une case « 🛍 Gère les boutiques » dans « 🔐 Où elle peut aller » ;
 *  R2. la case est cochée quand le domaine dit que la personne a le rôle, décochée sinon ;
 *  R3. « Enregistrer » envoie `roles:["shops"]` au domaine quand on coche, `roles:[]` quand on décoche ;
 *  R4. le résumé de la ligne dit « 🛍 boutiques » ; R5. 0 erreur JavaScript.
 * AVEC_PASS=1 (pont 1077, 25.10) : premier chargement sans laissez-passer (403 puis /__admin/grant), comme chez Kevin — la liste des apps doit
 *  être relue, sinon aucune fiche n'a « Où elle peut aller ». test:ci lance les deux scénarios.
 * SABOTAGE : `ADMIN_DIR=<ancien dossier admin>` → R1–R4 rouges (v2.7.15 : sans case ; v2.7.16 : rouge sous AVEC_PASS=1).   Lancer : npm run test:admin-role-boutiques
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const RACINE = new URL('../kdmc-home/', import.meta.url).pathname;
const ADMIN = process.env.ADMIN_DIR || join(RACINE, 'admin');
const OUTILS = new URL('../tools/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const maintenant = Date.now();
const comptes = [
  { uid: 'essai_avec', name: 'Essai Avec-Role', created: maintenant - 9e6, last_seen: maintenant - 1000, portee: 'domaine', acces: [], bloque: [], roles: ['shops'], cgu_at: maintenant },
  { uid: 'essai_sans', name: 'Essai Sans-Role', created: maintenant - 9e6, last_seen: maintenant - 2000, portee: 'domaine', acces: [], bloque: [], roles: [], cgu_at: maintenant },
];
const envois = [];
const AVEC_PASS = process.env.AVEC_PASS === '1'; /* chez Kevin : sans laissez-passer, le domaine répond 403 tant que /__admin/grant n'a pas répondu */
const GRANT = 'pass-de-test';
const json = (res, o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
const srv = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/kdmc-sso.js') { res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end("window.kdmcSSO={whoami:function(){return Promise.resolve({uid:'kdmc_admin',name:'Kevin',admin:true,verified:true});},token:function(){return '';},consumeHashToken:function(){}};"); }
    if (url === '/__admin/grant') return json(res, { ok: true, grant: GRANT });
    if (AVEC_PASS && url.startsWith('/__admin/') && req.headers['x-kdmc-admin'] !== GRANT) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"ok":false,"reason":"need_admin_code"}'); }
    if (url === '/__admin/accounts') return json(res, { ok: true, accounts: comptes, kv: true, count: comptes.length });
    if (url === '/__admin/acces' && req.method === 'GET') return json(res, { ok: true, apps: ['portail', 'shops', 'cmcteams', 'arbre'] });
    if (url === '/__admin/acces' && req.method === 'POST') {
      let corps = ''; for await (const c of req) corps += c;
      const b = JSON.parse(corps || '{}'); envois.push(b);
      return json(res, { ok: true, uid: b.uid, portee: b.portee, acces: b.acces || [], bloque: b.bloque || [], roles: b.roles || [] });
    }
    if (url.startsWith('/__')) return json(res, { ok: true });
    let f;
    if (url.startsWith('/CMCteams/tools/')) f = join(OUTILS, normalize(url.slice('/CMCteams/tools/'.length)));
    else if (url.startsWith('/admin/')) f = join(ADMIN, normalize(url.slice('/admin/'.length) || 'index.html'));
    else f = join(RACINE, normalize(url));
    const buf = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || (url.endsWith('/') ? TYPES['.html'] : 'application/octet-stream') });
    res.end(buf);
  } catch { res.writeHead(404).end('non trouvé'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: 'kdmc_k', value: '1', url: BASE }]);
const p = await ctx.newPage();
const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e)));
await p.goto(BASE + '/admin/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('details.acces[data-uid="essai_sans"]', { timeout: 15000 }).catch(() => {});

const etat = (uid) => p.evaluate((u) => {
  const box = document.querySelector('details.acces[data-uid="' + u + '"]');
  if (!box) return null;
  const c = box.querySelector('input[data-role="shops"]');
  return { existe: !!c, coche: !!(c && c.checked), libelle: c && c.parentElement ? c.parentElement.textContent.trim() : '', resume: (box.querySelector('summary') || {}).textContent || '' };
}, uid);
const avec = await etat('essai_avec'), sans = await etat('essai_sans');
ok('R1. case « 🛍 Gère les boutiques » sur la fiche', !!(avec && avec.existe && sans && sans.existe && /Gère les boutiques/.test(sans.libelle)), sans ? sans.libelle.slice(0, 60) : 'bloc « Où elle peut aller » absent');
ok('R2. cochée si le domaine donne le rôle, décochée sinon', !!(avec && avec.coche && sans && !sans.coche));
ok('R4. le résumé dit « 🛍 boutiques » pour qui a le rôle', !!(avec && /🛍 boutiques/.test(avec.resume) && sans && !/boutiques/.test(sans.resume)));

async function enregistrer(uid, cocher) {
  await p.evaluate(([u, c]) => {
    const box = document.querySelector('details.acces[data-uid="' + u + '"]'); box.open = true;
    const caseShops = box.querySelector('input[data-role="shops"]'); if (caseShops) caseShops.checked = c;
    box.querySelector('.savacc').click();
  }, [uid, cocher]);
  await p.waitForFunction((u) => /Enregistré|⚠️/.test((document.querySelector('details.acces[data-uid="' + u + '"] .accmsg') || {}).textContent || ''), uid, { timeout: 5000 }).catch(() => {});
  return envois[envois.length - 1] || {};
}
const e1 = await enregistrer('essai_sans', true).catch(() => ({}));
const e2 = await enregistrer('essai_avec', false).catch(() => ({}));
ok('R3. cocher → roles ["shops"] envoyé ; décocher → roles []', JSON.stringify(e1.roles) === '["shops"]' && e1.uid === 'essai_sans' && JSON.stringify(e2.roles) === '[]' && e2.uid === 'essai_avec',
  'envoyé : ' + JSON.stringify(e1.roles) + ' / ' + JSON.stringify(e2.roles));
const apres = await etat('essai_sans');
ok('R4b. après enregistrement, le résumé dit « 🛍 boutiques »', !!(apres && /🛍 boutiques/.test(apres.resume)));
ok('R5. 0 erreur JavaScript', erreurs.length === 0, erreurs[0] || '');

await b.close(); srv.close();
console.log(AVEC_PASS ? '(scénario : premier chargement SANS laissez-passer, comme dans le Chrome de Kevin)' : '(scénario : laissez-passer déjà rangé)');
console.log(ko ? '❌ rôle boutiques dans l\'admin : ' + ko + ' échec(s)' : '✅ rôle boutiques visible et posable dans l\'admin');
process.exit(ko ? 1 : 0);
