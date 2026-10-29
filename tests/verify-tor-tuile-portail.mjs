/* Qui VOIT les entrées admin du portail kd-mc.com — Kevin 2026-09-15, réécrit le 29.10.2026 (« regroupe tout au maximum, un seul endroit »).
 *
 * 29.10 : Tor, Bot Crypto, Javis, « Qui se connecte » et Tableau KDMC ne sont PLUS des tuiles du portail : ils vivent dans le tableau de
 * bord admin (/admin/, tuile par tuile, gardées par tests/admin-tuiles.test.mjs). Ce test garde maintenant : (1) la SEULE carte admin
 * du portail (« Mon tableau de bord ») n'est visible que pour l'admin prouvé ; (2) aucune ancienne copie n'est revenue dans le portail.
 *
 * Ancien rôle (conservé pour l'histoire) : Qui VOIT la tuile « Tor en clair » sur le portail kd-mc.com — Kevin 2026-09-15.
 *
 * Une tuile invisible = une fonction qui n'existe pas (vécu le 2026-08-05 : Kevin ne voyait
 * rien sur son iPhone parce que la tuile exigeait le Face ID). Une tuile visible par tout le
 * monde = une fuite de discrétion. Ce test tranche les deux EN VRAI : vrai navigateur, vrai
 * portail servi en HTTP (il lit /apps.json à la racine), 5 profils de session simulés.
 *
 * Lancer : npm run tor:tuile   (exige Playwright — CI, pas le bac à sable)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const RACINE = new URL('../kdmc-home/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const srv = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const f = join(RACINE, rel === '/' ? 'index.html' : rel);
    const buf = await readFile(f);   /* lire AVANT d'envoyer l'en-tête : sinon un fichier
                                        absent fait planter le serveur (en-tête déjà parti) */
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('non trouvé'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/index.html';

let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
const b = await chromium.launch({ headless: true });

async function vue(session) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  /* Le vrai kdmc-sso.js s'assigne à window.kdmcSSO : on verrouille la propriété pour que la
     session simulée survive à son chargement. Et il FAUT un uid, sinon le portail ne passe
     jamais en mode connecté (boot → _postLogin → applyAdminVisibility). */
  await p.addInitScript(s => {
    const faux = { whoami: () => Promise.resolve(s), token: () => '' };
    Object.defineProperty(window, 'kdmcSSO', { configurable: false, get: () => faux, set: () => {} });
  }, session);
  await p.goto(BASE);
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const vu = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    const tdb = document.getElementById('tdb-haut');
    const copies = ['tor-zone', 'bot-zone', 'javis-zone', 'access-zone', 'tableau-zone', 'priv-zone', 'perso-zones'].filter(id => document.getElementById(id));
    return { tdb: vu(tdb), lien: tdb && tdb.querySelector('a') ? tdb.querySelector('a').getAttribute('href') : null, copies };
  });
  await ctx.close();
  return r;
}

const kevin   = await vue({ uid: 'u-kevin', name: 'Kevin DESARZENS', admin: false, verified: false });
const admin   = await vue({ uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: true });
const lolo    = await vue({ uid: 'u-lolo', name: 'Laurence Saint-Polit', admin: false, verified: false });
const inconnu = await vue({ uid: 'u-x', name: 'Jean Dupont', admin: false, verified: false });
const perso   = await vue(null);

ok('un « Kevin » au nom seul (sans admin prouvé) ne voit PAS la carte admin (23.10 : un homonyme voyait les raccourcis)', kevin.tdb === false);
ok('Kevin admin prouvé la voit', admin.tdb === true);
ok('la carte mène au tableau de bord unique (/admin/)', admin.lien === '/admin/', admin.lien);
ok('Laurence ne la voit pas', lolo.tdb === false);
ok('un client inconnu ne la voit pas', inconnu.tdb === false);
ok('un visiteur non connecté ne la voit pas', perso.tdb === false);
for (const [nom, v] of Object.entries({ kevin, admin, lolo, inconnu, perso }))
  ok('aucune copie des anciennes tuiles (Tor, Bot, Javis, Qui se connecte, Tableau, Mon espace) dans le portail — ' + nom, v.copies.length === 0, v.copies.join(','));

await b.close(); srv.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Tout passe — 5 profils vérifiés en vrai navigateur'));
process.exit(ko ? 1 : 0);
