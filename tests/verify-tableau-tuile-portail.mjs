/* Qui VOIT l'entrée admin du portail kd-mc.com — réécrit le 29.10.2026 (Kevin : « un seul endroit »). La tuile « Tableau KDMC » n'est plus au
 * portail : elle est dans le tableau de bord admin (garde tests/admin-tuiles.test.mjs). Ce test garde que la SEULE carte admin du
 * portail (« Mon tableau de bord ») suit la règle admin prouvé / vue membre, et que la tuile n'est pas revenue en copie.
 *
 * Ancien rôle : Qui VOIT la tuile « 📋 Tableau KDMC » sur le portail kd-mc.com — Kevin 2026-10-22 (« Pas de tableau »).
 *
 * Le tableau « qui fait quoi » entre les branches existait (page claude.ai), mais aucun bouton
 * du portail n'y menait : Kevin ne le trouvait pas. La tuile suit la règle du tableau de bord
 * admin (`isPriv`). Vrai navigateur, vrai portail servi en HTTP, 5 profils de session simulés.
 * Sabotage : retirer la ligne `tableau-zone` de kdmc-portal.js → « Kevin admin la voit » rougit.
 *
 * Lancer : npm run test:tableau-tuile
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
    const z = document.getElementById('tableau-zone'), tdb = document.getElementById('tdb-haut');
    /* VISIBLE À L'ÉCRAN, pas seulement l'attribut : `.grid{display:grid}` battait `hidden`
       (23.10, Lenovo msg 660 : carte « Mon tableau de bord ADMIN » encore affichée en vue membre). */
    const vu = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    return { tab: !!z, tdb: vu(tdb), lien: tdb && tdb.querySelector('a') ? tdb.querySelector('a').getAttribute('href') : null };
  });
  await ctx.close();
  return r;
}

const admin   = await vue({ uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: true });
const kevinFi = await vue({ uid: 'u-kevin', name: 'Kevin DESARZENS', admin: false, verified: true });
const lolo    = await vue({ uid: 'u-lolo', name: 'Laurence Saint-Polit', admin: false, verified: false });
const inconnu = await vue({ uid: 'u-x', name: 'Jean Dupont', admin: false, verified: false });
const perso   = await vue(null);
const membre  = await vue({ uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: false, verified: true, apercu: 'membre', abonnement: 'max' });

ok('la tuile « Tableau KDMC » n\'est plus une copie dans le portail (elle vit dans le tableau de bord admin)', [admin, kevinFi, lolo, inconnu, perso, membre].every(v => v.tab === false));
ok('Kevin admin voit la carte « Mon tableau de bord ADMIN »', admin.tdb === true);
ok('elle mène au tableau de bord unique', admin.lien === '/admin/', admin.lien);
ok('un « Kevin » Face ID sans admin prouvé ne la voit pas (23.10 : admin seul)', kevinFi.tdb === false);
ok('VUE MEMBRE (👁) : la carte admin n\'est pas à l\'écran', membre.tdb === false, JSON.stringify(membre));
ok('Laurence ne la voit pas', lolo.tdb === false);
ok('un client inconnu ne la voit pas', inconnu.tdb === false);
ok('un visiteur non connecté ne la voit pas', perso.tdb === false);

await b.close(); srv.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Tout passe — 6 profils vérifiés en vrai navigateur'));
process.exit(ko ? 1 : 0);
