#!/usr/bin/env node
/* verify-boutiques-admin-domaine — Chez Lolo et La Détente : l'admin ne s'ouvre QUE par le domaine.
 *
 * Tâche 77 du pont (25.10.2026, règle d'or 8 : « une page ne vérifie jamais un code elle-même ») : les deux boutiques
 * portaient l'empreinte d'un mot de passe admin (LD_ADMIN_HASH, lisible par tous) et le vérifiaient dans le navigateur ;
 * une marque locale « ld_admin_trust » (que n'importe qui peut écrire) ouvrait l'admin au chargement. Et La Détente
 * revidait son catalogue local à chaque ouverture (drapeau de juin illisible depuis le 401 de la base).
 * Ce test ouvre les VRAIES pages (Chromium, 390 px), /__sso/whoami simulé, et vérifie pour chaque boutique :
 *  1. la source ne contient plus d'empreinte ni de calcul de mot de passe ;
 *  2. anonyme + marque locale « ld_admin_trust=1 » → PAS admin ;
 *  3. domaine : admin + Face ID → admin ;  4. rôle « shops » + code prouvé → admin ;  5. rôle « shops » sans preuve → PAS admin ;
 *  6. la fenêtre « Accès admin » n'a aucun champ mot de passe et mène à la connexion du domaine ;
 *  7. aucune requête DELETE vers la base au chargement ; 8. 0 erreur JavaScript.
 * Sabotage : BOUTIQUES_RACINE=<ancienne copie> → rouge.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const RACINE = process.env.BOUTIQUES_RACINE || new URL('..', import.meta.url).pathname;
const BOUTIQUES = ['shops/chez-lolo', 'shops/la-detente'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

let whoami = null; // réponse simulée du domaine
const serveur = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/__sso/whoami') {
    if (!whoami) { r.writeHead(401, { 'content-type': 'application/json' }); return r.end('{"ok":false}'); }
    r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(whoami));
  }
  let f = path.join(RACINE, u.replace(/^\/CMCteams/, ''));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(RACINE)) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => serveur.listen(0, ok));
const port = serveur.address().port;
const navigateur = await chromium.launch();

async function ouvrir(boutique, { qui = null, marque = false } = {}) {
  whoami = qui;
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 800 } });
  if (marque) await ctx.addInitScript(() => { try { localStorage.setItem('ld_admin_trust', '1'); localStorage.setItem('ld_admin', '1'); } catch (_) {} });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  const effacements = [];
  await page.route(/firebasedatabase\.app|firebaseio\.com/, (route) => {
    if (route.request().method() === 'DELETE') effacements.push(route.request().url());
    return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"error":"Permission denied"}' });
  });
  await page.goto(`http://127.0.0.1:${port}/${boutique}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._kdmcWhoamiFini === true, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const admin = await page.evaluate(() => typeof LD_ADMIN !== 'undefined' && LD_ADMIN === true);
  return { ctx, page, admin, erreurs, effacements };
}

for (const b of BOUTIQUES) {
  console.log('— ' + b);
  const src = fs.readFileSync(path.join(RACINE, b, 'index.html'), 'utf8');
  vrai(!/LD_ADMIN_HASH|LD_ADMIN_SALT|PBKDF2|deriveBits/.test(src), 'aucune empreinte ni calcul de mot de passe dans la page');

  let o = await ouvrir(b, { marque: true });
  vrai(!o.admin, 'anonyme + marque locale « ld_admin_trust=1 » → pas admin');
  vrai(o.effacements.length === 0, `aucune requête DELETE vers la base au chargement (mesuré : ${o.effacements.length})`);
  const fen = await o.page.evaluate(() => { if (typeof ldAdminPrompt !== 'function') return null; ldAdminPrompt(); const m = document.getElementById('ldAdminModal'); if (!m) return null; const a = m.querySelector('a[href]'); return { mdp: m.querySelectorAll('input[type=password]').length, lien: a ? a.getAttribute('href') : '' }; });
  vrai(!!fen && fen.mdp === 0 && /^https:\/\/kd-mc\.com\/\?return=/.test(fen.lien), `« Accès admin » : 0 champ mot de passe, mène à la connexion du domaine (${fen ? fen.mdp + ' champ(s), ' + fen.lien.slice(0, 32) : 'fenêtre absente'})`);
  vrai(o.erreurs.length === 0, `0 erreur JavaScript (mesuré : ${o.erreurs.length}${o.erreurs.length ? ' — ' + o.erreurs[0] : ''})`);
  await o.ctx.close();

  o = await ouvrir(b, { qui: { ok: true, admin: true, verified: true, name: 'Kevin' } });
  vrai(o.admin, 'domaine : admin + Face ID → admin'); await o.ctx.close();
  o = await ouvrir(b, { qui: { ok: true, admin: false, roles: ['shops'], code: true, name: 'Essai' } });
  vrai(o.admin, 'domaine : rôle « shops » + code prouvé → admin'); await o.ctx.close();
  o = await ouvrir(b, { qui: { ok: true, admin: false, roles: ['shops'], code: false, verified: false, name: 'Essai' } });
  vrai(!o.admin, 'domaine : rôle « shops » sans preuve → pas admin'); await o.ctx.close();
}
await navigateur.close(); serveur.close();
console.log(`\nboutiques, admin par le domaine seul : ${ok} ok / ${ko} ko`);
process.exit(ko ? 1 : 0);
