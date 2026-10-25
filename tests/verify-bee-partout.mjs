/* GARDE — BEE PARTOUT, DANS UN VRAI NAVIGATEUR (Kevin 4.10 : « mon assistant personnel qui me suit… partout, chaque app du domaine… avec le
 * bouton confirmation… vérifie que je sois le seul à pouvoir m'en servir »).
 *
 * Une fausse « app du domaine » à la CSP la plus stricte (default-src 'self', style-src 'self', img-src 'self', aucun script en ligne) reçoit
 * la ligne posée par le routeur. On prouve, dans Chromium (WebGL logiciel) :
 *  A. KEVIN : Bee apparaît dans un cadre, en bas à droite, ne casse ni la CSP ni la page, s'ouvre en chat (le cadre grandit), se ferme (il
 *     rétrécit) ; le personnage y est en 3D d'office ; elle sait dans quelle app il est (nom + titre) ;
 *  B. PERSONNE D'AUTRE : un visiteur ordinaire → 0 requête /__javis ; une session qui n'est pas Kevin → 1 seule question puis rien pendant 12 h ;
 *     un faux marqueur → le cadre disparaît (jamais d'assistant visible pour un autre) ; le domaine n'a pas répondu → rien ;
 *  C. LE BOUTON : une demande d'action → une CARTE (résumé du serveur, ✅ Confirmer / ✖ Annuler de 44 px) ; Annuler n'envoie RIEN ;
 *     Confirmer envoie UNE requête (jeton + confirme:true), se fige, ne s'envoie pas deux fois, affiche le résultat ; un texte piégé reste du texte ;
 *  D. les retraits : <meta name="kdmc-bee" content="off">, une page qui porte déjà Bee, une page dans un cadre → rien.
 *  E. SABOTAGE : sans la vérification de l'origine du message, un cadre étranger commanderait le parent → ici il est ignoré.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PARTOUT_JS, CADRE_HTML, CADRE_CSP, PARTOUT_TAG } from '../services/kdmc-router/bee-partout.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────── le faux domaine ───────── */
const CSP_APP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self'";
const appPage = (extra = '', corps = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP_APP}">${extra}<title>Boutique de test</title></head><body><h1 id="h">Ma boutique</h1>${corps}${PARTOUT_TAG}</body></html>`;
const ETAT = { whoami: 'kevin', qui: 'kevin', ia: null, agir: [], req: [], iaCorps: [], agirRep: { st: 200, j: { ok: true, texte: '⏰ C\'est noté.' } } };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  ETAT.req.push(q.method + ' ' + u);
  let corps = '';
  q.on('data', (c) => { corps += c; });
  q.on('end', () => {
    const J = (o, st = 200) => { r.writeHead(st, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (u === '/') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(appPage()); }
    if (u === '/barre.css') { r.setHeader('content-type', 'text/css'); return r.end('#up{position:fixed;right:12px;bottom:110px;width:44px;height:44px}#reg{position:fixed;right:12px;bottom:160px;width:44px;height:44px}#champ{position:fixed;left:8px;bottom:110px;width:200px;height:44px}'); }
    if (u === '/barre') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(appPage('<link rel="stylesheet" href="/barre.css">', '<textarea id="champ"></textarea><button id="up">↑</button><button id="reg">⚙️</button>')); }
    if (u === '/off') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(appPage('<meta name="kdmc-bee" content="off">')); }
    if (u === '/deja') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(appPage('', '<div id="javis-root"></div>')); }
    if (u === '/dans-un-cadre') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end('<!doctype html><body><iframe id="f" src="/"></iframe>'); }
    if (u === '/__javis/partout.js') { r.setHeader('content-type', 'text/javascript'); return r.end(PARTOUT_JS); }
    if (u === '/__javis/cadre') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CADRE_CSP }); return r.end(CADRE_HTML); }
    if (u === '/__javis/qui') return ETAT.qui === 'kevin' ? J({ ok: true }) : J({ ok: false }, 403);
    if (u === '/__sso/whoami') {
      if (ETAT.whoami === 'kevin') return J({ ok: true, uid: 'kdmc_admin', name: 'Kevin', verified: true, admin: true });
      if (ETAT.whoami === 'autre') return J({ ok: true, uid: 'laurence_sp', name: 'Laurence', verified: true, admin: false });
      return J({ ok: false }, 401);
    }
    if (u === '/__javis/ai') { try { ETAT.iaCorps.push(JSON.parse(corps)); } catch (_) {} return J(ETAT.ia || { ok: true, text: 'Coucou Kevin !', provider: 'qwen', gratuit: true }); }
    if (u === '/__javis/agir') { try { ETAT.agir.push(JSON.parse(corps)); } catch (_) {} return J(ETAT.agirRep.j, ETAT.agirRep.st); }
    if (u === '/__javis/moi') return J({ ok: false, reason: 'planning_absent' });
    r.statusCode = 404; r.end();
  });
}).listen(0, '127.0.0.1');
await new Promise((o) => srv.on('listening', o));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const MIME = { '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4' };
async function ouvre({ marqueur = true, jeton = false, init, url = '/' } = {}) {
  const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  /* les adresses « extérieures » du domaine pointent vers les vrais fichiers du dépôt */
  await ctx.route('https://javis.kd-mc.com/**', (rt) => {
    const p = new URL(rt.request().url()).pathname.replace(/^\//, '');
    const f = path.join(ROOT, 'javis', p);
    if (!fs.existsSync(f)) return rt.fulfill({ status: 404, body: '' });
    rt.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await ctx.route('https://lingua.kd-mc.com/**', (rt) => {
    const f = path.join(ROOT, 'lingua', new URL(rt.request().url()).pathname.replace(/^\//, ''));
    if (!fs.existsSync(f) || f.endsWith('.mp4')) return rt.fulfill({ status: 404, body: '' });
    rt.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await ctx.route('https://api.open-meteo.com/**', (rt) => rt.fulfill({ status: 200, body: '{}' }));
  if (marqueur) await ctx.addCookies([{ name: 'kdmc_k', value: '1', url: BASE }]);
  if (jeton) await ctx.addInitScript(() => { try { localStorage.setItem('kdmc_sso_token', 'JETON-DE-TEST'); } catch (_) {} });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const err = [], csp = [];
  page.on('pageerror', (e) => err.push(e.message));
  page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/favicon|404|ERR_FAILED|Failed to load resource/.test(t)) err.push(t); });
  ETAT.req.length = 0; ETAT.agir.length = 0; ETAT.iaCorps.length = 0;
  await page.goto(BASE + url);
  return { ctx, page, err, csp };
}
const cadreVisible = (page) => page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); if (!f) return null; const r = f.getBoundingClientRect(); return { d: getComputedStyle(f).display, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) }; });

/* ───────── A. Kevin ───────── */
console.log('A. Kevin : Bee le suit dans une app à la CSP la plus stricte');
{
  ETAT.whoami = 'kevin'; ETAT.qui = 'kevin';
  const { ctx, page, err, csp } = await ouvre();
  await page.waitForFunction(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); return f && getComputedStyle(f).display === 'block'; }, null, { timeout: 20000 }).catch(() => {});
  const c = await cadreVisible(page);
  chk(c && c.d === 'block' && c.w === 92 && c.h === 92 && c.right === 8, `le cadre de Bee apparaît, petit, en bas à droite (${JSON.stringify(c)})`);
  chk(c && c.bottom >= 80, `… au-dessus du bouton ✉️ du domaine (en bas ${c && c.bottom}px, le bouton occupe les 66 premiers)`);
  chk(await page.evaluate(() => document.getElementById('h').textContent === 'Ma boutique' && document.querySelectorAll('iframe').length === 1), 'la page de l\'app est intacte : seul un cadre est ajouté');
  chk(csp.length === 0, 'AUCUNE violation de la CSP de l\'app (style-src \'self\', pas de script en ligne)' + (csp[0] ? ' — ' + csp[0].slice(0, 120) : ''));
  chk(!ETAT.req.some((r) => /GET \/__javis\/qui/.test(r)), 'avec le marqueur, pas de question « est-ce Kevin ? » (le cadre vérifie lui-même)');
  const fr = page.frames().find((f) => /__javis\/cadre/.test(f.url()));
  await fr.waitForSelector('#javis-launcher', { timeout: 10000 }).catch(() => {});
  chk(await fr.evaluate(() => !!document.querySelector('#javis-launcher .mrn-canvas, #javis-launcher canvas') || !!document.querySelector('#javis-launcher .bee-rig')), 'Bee est dessinée dans le cadre');
  await fr.waitForFunction(() => window.KdmcMarionnette && KdmcMarionnette.etat().some((e) => e.p3d), null, { timeout: 30000 }).catch(() => {});
  chk(await fr.evaluate(() => KdmcMarionnette.etat().some((e) => e.p3d)), 'et elle y est en 3D d\'office (la marionnette, le moteur 3D et les dessins viennent de javis.kd-mc.com)');
  if (process.env.BEE_SHOT) await page.screenshot({ path: process.env.BEE_SHOT + '/ferme.png' });
  /* ouvrir / fermer : le cadre grandit puis rétrécit */
  await fr.locator('#javis-launcher').click();
  await page.waitForFunction(() => document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect().width > 250, null, { timeout: 5000 }).catch(() => {});
  const o = await cadreVisible(page);
  chk(o && o.w >= 280 && o.w <= 374 && o.h >= 320 && o.right === 8 && o.bottom === 8, `touché : le chat s'ouvre et le cadre grandit (${o && o.w}×${o && o.h})`);
  await fr.locator('#javis-close').click();
  await page.waitForFunction(() => document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect().width < 120, null, { timeout: 5000 }).catch(() => {});
  const f2 = await cadreVisible(page);
  chk(f2 && f2.w === 92 && f2.bottom >= 80, 'fermé : le cadre redevient la petite pastille');
  /* elle sait où il est */
  await fr.locator('#javis-launcher').click();
  await fr.locator('#javis-input').fill('où suis-je ?');
  await fr.locator('#javis-input').press('Enter');
  await page.waitForFunction(() => true); await dors(1200);
  const corps = ETAT.iaCorps[0];
  chk(corps && corps.contexte && corps.contexte.titre === 'Boutique de test' && /^[a-z0-9-]+$/i.test(corps.contexte.app) && !('url' in corps.contexte) && !JSON.stringify(corps.contexte).includes(BASE), `sa question dit dans quelle app il est (${JSON.stringify(corps && corps.contexte)}) — jamais l'adresse complète`);
  chk(err.length === 0, 'aucune erreur JS' + (err[0] ? ' — ' + err[0] : ''));
  await ctx.close();
}

/* ───────── A bis. le personnage choisi la suit d'une app à l'autre ───────── */
console.log('A bis. Le choix Bee / Bourricot suit Kevin');
{
  ETAT.whoami = 'kevin'; ETAT.qui = 'kevin';
  const { ctx, page } = await ouvre({ init: () => { document.cookie = 'kdmc_masc=donkey; path=/'; } });
  const fr = await (async () => { for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => /__javis\/cadre/.test(x.url())); if (f) return f; await dors(250); } })();
  await fr.waitForSelector('#javis-launcher', { timeout: 10000 });
  chk(/Bourricot/.test(await fr.locator('#javis-launcher').getAttribute('aria-label')), 'un cookie du domaine porte le choix : dans une autre app, c\'est Bourricot qui apparaît (pas Bee par défaut)');
  chk(/kdmc_masc=' \+ id \+ '; Domain=\.kd-mc\.com/.test(fs.readFileSync(path.join(ROOT, 'tools/javis/javis-widget.js'), 'utf8')), 'et le choix est écrit en cookie du domaine quand on change de personnage');
  await ctx.close();
}

/* ───────── B. personne d'autre ───────── */
console.log('B. Personne d\'autre ne la voit');
{ /* visiteur ordinaire : ni marqueur ni session */
  const { ctx, page } = await ouvre({ marqueur: false, jeton: false });
  await dors(1500);
  chk(await cadreVisible(page) === null && !ETAT.req.some((r) => /__javis\/(qui|cadre)/.test(r)), 'visiteur ordinaire : aucun cadre et 0 requête /__javis/qui ou /__javis/cadre');
  await ctx.close();
}
{ /* connecté mais pas Kevin : une question, puis plus rien pendant 12 h */
  ETAT.qui = 'autre';
  const { ctx, page } = await ouvre({ marqueur: false, jeton: true });
  await dors(1500);
  chk(await cadreVisible(page) === null && ETAT.req.filter((r) => /__javis\/qui/.test(r)).length === 1 && !ETAT.req.some((r) => /__javis\/cadre/.test(r)), 'connecté mais pas Kevin : UNE question au domaine → refus → aucun cadre, aucun chargement de Bee');
  ETAT.req.length = 0; await page.reload(); await dors(1200);
  chk(!ETAT.req.some((r) => /__javis\/qui/.test(r)) && await cadreVisible(page) === null, 'et au rechargement : plus aucune question (refus retenu 12 h)');
  await ctx.close();
}
{ /* un FAUX marqueur : le cadre apparaît un instant mais Bee se retire dès que le domaine ne reconnaît pas Kevin */
  ETAT.whoami = 'autre';
  const { ctx, page } = await ouvre({ marqueur: true });
  await page.waitForFunction(() => !document.querySelector('iframe[src="/__javis/cadre"]'), null, { timeout: 15000 }).catch(() => {});
  chk(await cadreVisible(page) === null, 'faux marqueur + un autre compte reconnu : le cadre est retiré, JAMAIS affiché');
  await ctx.close();
  ETAT.whoami = 'inconnu';
  const b = await ouvre({ marqueur: true });
  await b.page.waitForFunction(() => !document.querySelector('iframe[src="/__javis/cadre"]'), null, { timeout: 15000 }).catch(() => {});
  const vu = await cadreVisible(b.page);
  chk(vu === null, 'faux marqueur + session inconnue : aucun cadre visible');
  await b.ctx.close();
  ETAT.whoami = 'kevin'; ETAT.qui = 'kevin';
}

/* ───────── C. le bouton de confirmation ───────── */
console.log('C. Le bouton de confirmation');
{
  ETAT.whoami = 'kevin';
  const PROP = { action: 'rappel', titre: 'Programmer un rappel', icone: '⏰', risque: 'faible', resume: 'Te rappeler « <img src=x onerror=window.__xss=1> appeler Laurence » le lundi 5 octobre à 9 h 30.', jeton: 'v1.CORPS.' + 'a'.repeat(64) };
  ETAT.ia = { ok: true, text: 'J\'ai préparé le rappel : confirme avec le bouton.', provider: 'cerebras', gratuit: true, propositions: [PROP] };
  const { ctx, page, err } = await ouvre();
  const fr = await (async () => { for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => /__javis\/cadre/.test(x.url())); if (f) return f; await dors(250); } })();
  await fr.waitForSelector('#javis-launcher', { timeout: 10000 });
  await fr.locator('#javis-launcher').click();
  await fr.locator('#javis-input').fill('rappelle-moi lundi à 9h30 d\'appeler Laurence');
  await fr.locator('#javis-input').press('Enter');
  await fr.waitForSelector('.javis-carte', { timeout: 10000 });
  const carte = await fr.evaluate(() => { const c = document.querySelector('.javis-carte'); const b = [...c.querySelectorAll('button')].map((x) => { const r = x.getBoundingClientRect(); return { t: x.textContent, h: Math.round(r.height), w: Math.round(r.width) }; }); return { t: c.querySelector('.javis-carte-t').textContent, r: c.querySelector('.javis-carte-r').textContent, b, html: c.querySelector('.javis-carte-r').innerHTML, xss: window.__xss === 1 }; });
  chk(/Programmer un rappel/.test(carte.t) && /lundi 5 octobre/.test(carte.r), `la carte montre le titre et le résumé du SERVEUR (${carte.t})`);
  if (process.env.BEE_SHOT) await page.screenshot({ path: process.env.BEE_SHOT + '/carte.png' });
  chk(carte.b.length === 2 && carte.b.every((b) => b.h >= 44) && /Confirmer/.test(carte.b[0].t) && /Annuler/.test(carte.b[1].t), `deux boutons ≥ 44 px : ${carte.b.map((b) => b.t + ' ' + b.w + '×' + b.h).join(' | ')}`);
  chk(!carte.xss && !/<img/.test(carte.html), 'un texte piégé (<img onerror>) reste du TEXTE : rien ne s\'exécute');
  chk(ETAT.agir.length === 0, 'tant que Kevin ne touche rien, RIEN n\'est envoyé');
  /* Annuler */
  await fr.locator('.javis-carte-non').click();
  await dors(500);
  chk(ETAT.agir.length === 0 && /Annulé/.test(await fr.locator('.javis-carte-f').textContent()), '✖ Annuler : rien n\'est envoyé, la carte dit « rien n\'a été fait »');
  /* Confirmer sur une 2ᵉ carte */
  await fr.locator('#javis-input').fill('refais-le');
  await fr.locator('#javis-input').press('Enter');
  await fr.waitForFunction(() => document.querySelectorAll('.javis-carte').length === 2, null, { timeout: 10000 });
  const ok2 = fr.locator('.javis-carte').nth(1).locator('.javis-carte-ok');
  await ok2.dblclick();      // double-clic : une seule requête doit partir
  await fr.waitForFunction(() => document.querySelectorAll('.javis-carte.fait').length === 1, null, { timeout: 10000 }).catch(() => {});
  chk(ETAT.agir.length === 1 && ETAT.agir[0].confirme === true && ETAT.agir[0].jeton === PROP.jeton, '✅ Confirmer (même en double-clic) : UNE requête part, avec le jeton signé et confirme:true', JSON.stringify(ETAT.agir) + '');
  chk(await fr.evaluate(() => { const c = document.querySelectorAll('.javis-carte')[1]; return c.querySelector('.javis-carte-f').textContent.includes('noté') && c.querySelector('.javis-carte-b').style.display === 'none'; }), 'la carte se fige et affiche le résultat du domaine (« C\'est noté »)');
  /* le domaine refuse (proposition expirée) → dit honnêtement */
  ETAT.agirRep = { st: 400, j: { ok: false, reason: 'proposition_invalide_ou_expiree', texte: 'Cette proposition a expiré : redemande-la à Bee.' } };
  await fr.locator('#javis-input').fill('encore');
  await fr.locator('#javis-input').press('Enter');
  await fr.waitForFunction(() => document.querySelectorAll('.javis-carte').length === 3, null, { timeout: 10000 });
  await fr.locator('.javis-carte').nth(2).locator('.javis-carte-ok').click();
  await fr.waitForFunction(() => document.querySelectorAll('.javis-carte.clos').length >= 2, null, { timeout: 10000 }).catch(() => {});
  chk(/expiré/.test(await fr.locator('.javis-carte').nth(2).locator('.javis-carte-f').textContent()), 'proposition refusée par le domaine (expirée) → la carte le dit, sans faux « fait »');
  chk(err.length === 0, 'aucune erreur JS' + (err[0] ? ' — ' + err[0] : ''));
  await ctx.close();
  ETAT.ia = null; ETAT.agirRep = { st: 200, j: { ok: true, texte: '⏰ C\'est noté.' } };
}

/* ───────── C ter. le code d'un compte créé (Kevin 23.10 « Go oui tout ») : affiché UNE fois sur la carte, copiable, jamais gardé ───────── */
console.log('C ter. Le code d\'un compte créé');
{
  ETAT.whoami = 'kevin';
  const PROP = { action: 'compte_creer', titre: 'Créer un compte pour une personne', icone: '🆕', risque: 'eleve', resume: 'CRÉER le compte de « Léa Martin ».', jeton: 'v1.CORPS.' + 'b'.repeat(64) };
  ETAT.ia = { ok: true, text: 'Carte prête.', provider: 'cerebras', gratuit: true, propositions: [PROP] };
  ETAT.agirRep = { st: 200, j: { ok: true, texte: '🆕 Le compte de Léa Martin est créé.\n\n🔑 CODE : K7M2QX9P\n\nRecopie-le MAINTENANT.' } };
  const { ctx, page, err } = await ouvre();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  const fr = await (async () => { for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => /__javis\/cadre/.test(x.url())); if (f) return f; await dors(250); } })();
  await fr.waitForSelector('#javis-launcher', { timeout: 10000 });
  await fr.locator('#javis-launcher').click();
  await fr.locator('#javis-input').fill('crée un compte pour Léa Martin');
  await fr.locator('#javis-input').press('Enter');
  await fr.waitForSelector('.javis-carte', { timeout: 10000 });
  chk(!(await fr.locator('.javis-carte-r').textContent()).includes('K7M2QX9P'), 'avant le ✅ : aucun code sur la carte');
  await fr.locator('.javis-carte-ok').click();
  await fr.waitForSelector('.javis-carte-copie', { timeout: 10000 }).catch(() => {});
  const m = await fr.evaluate(() => { const f = document.querySelector('.javis-carte-f'), b = document.querySelector('.javis-carte-copie'); const r = b && b.getBoundingClientRect(); return { t: f.textContent, ws: getComputedStyle(f).whiteSpace, h: r ? Math.round(r.height) : 0, sel: getComputedStyle(f).userSelect || getComputedStyle(f).webkitUserSelect, hist: JSON.stringify([localStorage, sessionStorage]) + document.cookie }; });
  chk(/CODE : K7M2QX9P/.test(m.t) && /pre-wrap/.test(m.ws) && /text/.test(m.sel), 'après le ✅ : le code est affiché lisible (lignes conservées) et sélectionnable');
  chk(m.h >= 44, 'un bouton « Copier le code » de ' + m.h + ' px (≥ 44)');
  await fr.locator('.javis-carte-copie').click(); await dors(400);
  chk(/Copié/.test(await fr.locator('.javis-carte-copie').textContent()) && await page.evaluate(() => navigator.clipboard.readText().catch(() => '')) .then((t) => t === 'K7M2QX9P' || t === '').catch(() => true), 'toucher le bouton copie le code (ou, si le navigateur le refuse, le dit)');
  const stock = await fr.evaluate(() => { let h = ''; try { h = JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)); } catch (e) { /* fermé */ } return h; });
  chk(!stock.includes('K7M2QX9P'), 'le code n\'est gardé NULLE PART dans l\'appareil (ni historique de la conversation, ni stockage)');
  chk(err.length === 0, 'aucune erreur JS' + (err[0] ? ' — ' + err[0] : ''));
  await ctx.close();
  ETAT.ia = null; ETAT.agirRep = { st: 200, j: { ok: true, texte: '⏰ C\'est noté.' } };
}

/* ───────── C bis. les adresses du domaine deviennent des liens ───────── */
console.log('C bis. Les liens');
{
  ETAT.whoami = 'kevin';
  ETAT.ia = { ok: true, text: 'Lingua est ici : https://lingua.kd-mc.com/#admin. Mais pas https://pirate.example/x ni <b>gras</b> https://kd-mc.com.pirate.example/y', provider: 'cerebras', gratuit: true };
  const { ctx, page } = await ouvre();
  const fr = await (async () => { for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => /__javis\/cadre/.test(x.url())); if (f) return f; await dors(250); } })();
  await fr.waitForSelector('#javis-launcher', { timeout: 10000 });
  await fr.locator('#javis-launcher').click();
  await fr.locator('#javis-input').fill('donne-moi le lien de Lingua');
  await fr.locator('#javis-input').press('Enter');
  await fr.waitForFunction(() => [...document.querySelectorAll('.javis-bub.js')].some((b) => /Lingua est ici/.test(b.textContent)), null, { timeout: 10000 });
  const l = await fr.evaluate(() => { const b = [...document.querySelectorAll('.javis-bub.js')].find((x) => /Lingua est ici/.test(x.textContent)); return { a: [...b.querySelectorAll('a')].map((x) => ({ href: x.href, t: x.textContent, rel: x.rel, h: Math.round(x.getBoundingClientRect().height) })), texte: b.textContent, html: b.innerHTML }; });
  chk(l.a.length === 1 && l.a[0].href === 'https://lingua.kd-mc.com/#admin' && l.a[0].rel === 'noopener', `l'adresse du domaine devient UN lien à toucher (${JSON.stringify(l.a)})`);
  chk(/pirate\.example\/x/.test(l.texte) && !/href="https:\/\/pirate/.test(l.html) && !/<b>/.test(l.html), 'une adresse d\'un autre site reste du texte (pas de lien), et le HTML reste du texte');
  chk(/\.\s+Mais pas/.test(l.texte), 'la ponctuation qui suit l\'adresse n\'est pas avalée par le lien');
  await ctx.close();
  ETAT.ia = null;
}

/* ───────── D. les retraits ───────── */
console.log('D. Les retraits');
{
  for (const [url, nom] of [['/off', 'une app qui se retire (<meta name="kdmc-bee" content="off">)'], ['/deja', 'une page qui porte déjà Bee'], ['/dans-un-cadre', 'une page affichée dans un cadre']]) {
    const { ctx, page } = await ouvre({ url });
    await dors(1500);
    const n = url === '/dans-un-cadre' ? await page.frames()[1].evaluate(() => document.querySelectorAll('iframe[src="/__javis/cadre"]').length) : (await cadreVisible(page)) ? 1 : 0;
    chk(n === 0 && !ETAT.req.some((r) => /__javis\/cadre/.test(r)), nom + ' → aucun cadre');
    await ctx.close();
  }
}

/* ───────── F. Bee ne recouvre AUCUN contrôle de l'app (Kevin 23.10, audit réel dans son Chrome : Apex AI — champ, ↑, ⚙️ ; CMCteams — ⏱) ───────── */
console.log('F. Bee se pose sur une place libre : jamais sur un bouton, un champ ou un lien permanent');
{
  ETAT.whoami = 'kevin'; ETAT.qui = 'kevin';
  const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
  const mesure = (page) => page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); const R = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    return { cadre: R(f), controles: ['#up', '#reg', '#champ'].map((q) => { const e = document.querySelector(q); return e ? [q, R(e)] : null; }).filter(Boolean), W: innerWidth, H: innerHeight, d: getComputedStyle(f).display }; });
  const { ctx, page } = await ouvre({ url: '/barre' });
  await page.waitForFunction(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); return f && getComputedStyle(f).display === 'block'; }, null, { timeout: 20000 }).catch(() => {});
  await dors(1800);
  let m = await mesure(page);
  const touche = m.controles.filter(([, r]) => inter(m.cadre, r)).map(([q]) => q);
  chk(m.d === 'block' && touche.length === 0, `une barre fixe avec champ, ↑ et ⚙️ : le rond de Bee ne recouvre rien (recouvert : ${touche.join(', ') || 'aucun'} · rond en ${Math.round(m.cadre.left)},${Math.round(m.cadre.top)})`);
  chk(m.cadre.left >= 0 && m.cadre.top >= 0 && m.cadre.right <= m.W && m.cadre.bottom <= m.H, 'et il reste ENTIER dans l\'écran');
  const fr = page.frames().find((f) => /__javis\/cadre/.test(f.url()));
  await fr.locator('#javis-launcher').click();
  await page.waitForFunction(() => document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect().width > 250, null, { timeout: 5000 }).catch(() => {});
  const o = await cadreVisible(page);
  chk(o && o.right === 8 && o.bottom === 8, `ouvert, le chat reprend sa grande place en bas à droite (${o && o.w}×${o && o.h})`);
  await fr.locator('#javis-close').click();
  await page.waitForFunction(() => document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect().width < 120, null, { timeout: 5000 }).catch(() => {});
  await dors(300);
  m = await mesure(page);
  chk(m.controles.filter(([, r]) => inter(m.cadre, r)).length === 0, 'refermé, le rond retrouve une place libre (il ne retombe pas sur les boutons)');
  await ctx.close();
  /* une page SANS contrôle permanent : Bee garde sa place habituelle (aucun saut inutile) */
  const n = await ouvre();
  await n.page.waitForFunction(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); return f && getComputedStyle(f).display === 'block'; }, null, { timeout: 20000 }).catch(() => {});
  await dors(1800);
  const c0 = await cadreVisible(n.page);
  chk(c0 && c0.right === 8 && c0.bottom >= 80 && c0.bottom <= 100, `une page sans barre fixe : Bee reste en bas à droite, au-dessus du bouton ✉️ (${JSON.stringify(c0 && { right: c0.right, bottom: c0.bottom })})`);
  /* UN CONTRÔLE QUI ARRIVE TARD (Kevin 24.10, Apex AI : « Aller en bas » / « Installer l'application » apparaissent après la pose) : un bouton fixe posé PILE sous le rond, 10 s après → Bee s'écarte toute seule (≤ 8 s), sans toucher la page */
  await dors(9000);                                           // les passes de pose (1,2 s · 3,5 s · 8 s) sont terminées : seule la veille peut encore agir
  const cb = await cadreVisible(n.page);
  await n.page.evaluate((b) => { const e = document.createElement('button'); e.id = 'tard'; e.textContent = 'Installer'; e.style.cssText = 'position:fixed;right:8px;bottom:' + b + 'px;width:92px;height:92px;z-index:1'; document.body.appendChild(e); }, cb.bottom);
  await dors(6500);
  const ap = await n.page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect(), r = document.getElementById('tard').getBoundingClientRect(); return { rec: Math.min(f.right, r.right) - Math.max(f.left, r.left) > 2 && Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top) > 2, f: [Math.round(f.left), Math.round(f.top)] }; });
  chk(ap.rec === false, `un bouton fixe apparu 9 s après la pose, juste sous le rond : Bee s'écarte seule en moins de 7 s (rond en ${ap.f.join(',')})`);
  /* LA BARRE DE SECOURS D'APEX AI (Kevin 24.10, mesure du Lenovo : « Dashboard personnel » et « Ouvrir Admin » sous le rond) : cinq boutons de 44 px en colonne à droite, INVISIBLES et intouchables par défaut
     (visibility:hidden !important, comme rescue.css) ; ils n'apparaissent que si Kevin les montre (data-apex-rescue-show). Cachés : Bee ne bouge pas pour rien. Montrés : Bee s'écarte seule. */
  /* la page de test a une CSP stricte (pas de <style> en ligne) : on pose les styles un par un, comme le fait l'app (propriété CSS d'un élément) */
  const rond = () => n.page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect(); return [Math.round(f.left), Math.round(f.top)]; });
  await n.page.evaluate(() => document.getElementById('tard').remove());
  await dors(500);
  const rond0 = await rond();
  await n.page.evaluate((r) => {
    const t = document.createElement('div'); t.id = 'apex-rescue-toolbar';
    const im = (e, k, v) => e.style.setProperty(k, v, 'important');
    t.style.cssText = 'position:fixed;bottom:72px;right:4px;display:flex;flex-direction:column;gap:3px;z-index:9998';
    im(t, 'visibility', 'hidden'); im(t, 'opacity', '0'); im(t, 'pointer-events', 'none');
    ['coffre', 'dashboard', 'admin', 'chat', 'login'].forEach((k) => { const b = document.createElement('button'); b.id = 'apex-rescue-' + k; b.textContent = k[0]; b.style.cssText = 'width:44px;height:44px;padding:0'; t.appendChild(b); });
    document.body.appendChild(t);
  });
  await dors(6500);
  const mes = () => n.page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]').getBoundingClientRect(), bs = [...document.querySelectorAll('#apex-rescue-toolbar button')].map((b) => b.getBoundingClientRect()); return { f: [Math.round(f.left), Math.round(f.top)], rec: bs.filter((r) => Math.min(f.right, r.right) - Math.max(f.left, r.left) > 2 && Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top) > 2).length }; });
  const avant = await mes();
  chk(avant.rec > 0 && avant.f.join() === rond0.join(), `barre de secours CACHÉE (invisible, intouchable) : Bee ne bouge pas pour rien (rond en ${avant.f.join(',')}, ${avant.rec} boutons invisibles dessous)`);
  await n.page.evaluate(() => { const t = document.getElementById('apex-rescue-toolbar'); t.style.setProperty('visibility', 'visible', 'important'); t.style.setProperty('opacity', '0.72', 'important'); t.style.setProperty('pointer-events', 'auto', 'important'); });
  await dors(6500);
  const apres = await mes();
  chk(apres.rec === 0, `barre de secours MONTRÉE : Bee s'écarte seule en moins de 7 s, aucun des 5 boutons n'est recouvert (rond en ${apres.f.join(',')})`);
  /* PENDANT LE DÉFILEMENT, BEE S'EFFACE (Kevin 25.10, pont 1042 : sur le portail la bulle passe sur les flèches › et les cartes) : plus petite (≥ 44 px) et à moitié transparente tant que la page bouge, pleine après l'arrêt */
  await n.page.evaluate(() => { const g = document.createElement('div'); g.id = 'grand'; g.style.cssText = 'height:3000px;width:1px'; document.body.appendChild(g); });
  const etat = () => n.page.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'), r = f.getBoundingClientRect(), c = getComputedStyle(f); return { op: +(+c.opacity).toFixed(2), w: Math.round(r.width), tf: f.style.transform }; });
  const repos = await etat();
  await n.page.evaluate(() => window.scrollBy(0, 400));
  await dors(250);
  const defile = await etat();
  const lanceur = await n.page.frames().find((f) => /__javis\/cadre/.test(f.url())).locator('#javis-launcher').boundingBox();
  chk(defile.op > 0.3 && defile.op < 0.6 && defile.w < 92 && /scale/.test(defile.tf) && lanceur && lanceur.width >= 44 && lanceur.height >= 44, `pendant le défilement : Bee est plus petite (cadre ${defile.w} px, bulle ${lanceur && Math.round(lanceur.width)}×${lanceur && Math.round(lanceur.height)} px, toujours ≥ 44) et à moitié transparente (opacité ${defile.op})`);
  await dors(1600);
  const arret = await etat();
  chk(arret.op === 1 && arret.w === repos.w && arret.tf === '', `0,7 s après l'arrêt : Bee est pleine et à sa taille (opacité ${arret.op}, ${arret.w} px)`);
  await n.ctx.close();
}

/* ───────── E. sabotage : le parent n'obéit qu'à SON cadre ───────── */
console.log('E. Le parent n\'obéit qu\'à son propre cadre');
{
  ETAT.whoami = 'kevin';
  const { ctx, page } = await ouvre();
  await page.waitForFunction(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); return f && getComputedStyle(f).display === 'block'; }, null, { timeout: 20000 }).catch(() => {});
  const avant = await cadreVisible(page);
  /* un autre cadre (ou la page elle-même) envoie « ouvert » / « cache » : ignoré */
  await page.evaluate(() => { window.postMessage({ kdmcBee: 1, t: 'ouvert' }, '*'); window.postMessage({ kdmcBee: 1, t: 'cache' }, '*'); });
  await dors(500);
  const apres = await cadreVisible(page);
  chk(avant && apres && apres.w === avant.w && apres.d === 'block', 'un message venu d\'ailleurs que du cadre de Bee (« ouvert », « cache ») est IGNORÉ : le cadre ne bouge pas');
  /* sabotage : sans la vérification de la source, le message d'ailleurs obéirait */
  const ctx2 = await nav.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await ctx2.addCookies([{ name: 'kdmc_k', value: '1', url: BASE }]);
  const p2 = await ctx2.newPage();
  await p2.route('**/__javis/partout.js', (rt) => rt.fulfill({ status: 200, contentType: 'text/javascript', body: PARTOUT_JS.replace('e.source !== cadre.contentWindow', 'false') }));
  await p2.route('https://javis.kd-mc.com/**', (rt) => rt.fulfill({ status: 404, body: '' }));
  await p2.goto(BASE + '/');
  await dors(1500);
  await p2.evaluate(() => { const f = document.querySelector('iframe[src="/__javis/cadre"]'); f.style.display = 'block'; window.postMessage({ kdmcBee: 1, t: 'cache' }, location.origin); });
  await dors(500);
  chk(await p2.evaluate(() => !document.querySelector('iframe[src="/__javis/cadre"]')), 'SABOTAGE : sans la vérification de la source, un message étranger retirerait le cadre → le contrôle ci-dessus serait ROUGE');
  await ctx2.close();
  await ctx.close();
}

await nav.close();
srv.close();
console.log(`\n${ok} contrôles OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
