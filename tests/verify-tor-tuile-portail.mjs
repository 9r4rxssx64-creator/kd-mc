/* Qui VOIT la tuile « Tor en clair » sur le portail kd-mc.com — Kevin 2026-09-15.
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
    const z = document.getElementById('tor-zone'), bot = document.getElementById('bot-zone');
    return { tor: z ? !z.hidden : null, bot: bot ? !bot.hidden : null,
             lien: z && z.querySelector('a') ? z.querySelector('a').href : null };
  });
  await ctx.close();
  return r;
}

const kevin   = await vue({ uid: 'u-kevin', name: 'Kevin DESARZENS', admin: false, verified: false });
const admin   = await vue({ uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: true });
const lolo    = await vue({ uid: 'u-lolo', name: 'Laurence Saint-Polit', admin: false, verified: false });
const inconnu = await vue({ uid: 'u-x', name: 'Jean Dupont', admin: false, verified: false });
const perso   = await vue(null);

ok('Kevin, reconnu par son nom SANS Face ID, voit la tuile', kevin.tor === true);
ok('Kevin admin prouvé la voit aussi', admin.tor === true);
ok('la tuile pointe sur tor.kd-mc.com', (kevin.lien || '').includes('tor.kd-mc.com'), kevin.lien);
ok('Laurence ne la voit pas', lolo.tor === false);
ok('un client inconnu ne la voit pas', inconnu.tor === false);
ok('un visiteur non connecté ne la voit pas', perso.tor === false);
ok('aucune régression : Laurence voit toujours le bot', lolo.bot === true);
ok('aucune régression : l\'inconnu ne voit toujours pas le bot', inconnu.bot === false);

await b.close(); srv.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Tout passe — 5 profils vérifiés en vrai navigateur'));
process.exit(ko ? 1 : 0);
