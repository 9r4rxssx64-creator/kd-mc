/* GARDE — bilan d'affichage du 16.11.2026 (robot verif-affichage-domaine, run 43973722309, pont 2578), part de cloud-poste-recherche.
 * 1. Robot : un onglet qui ne fait que basculer une classe (tor) n'est PAS « sans réaction » → empreintePage compte le texte visible.
 * 2. Worldmonitor : ses fenêtres plein écran sont aria-modal (les contrôles derrière ne sont pas « cachés »), bouton « Compris » ≥ 44 px.
 * 3. Cuisine / cujina / cocina : le bouton retour fait 44 px et porte data-kdmc-retour (la pastille « ← Portail » ne s'y pose plus) ;
 *    l'accueil a son propre lien vers le portail.
 * 4. ia, outils, osint, dossiers, tor, bot : l'échec de registration.update() est rattrapé (WebKit : « Script …/sw.js load failed »).
 * 5. Dossiers : si la feuille de style a été annulée, elle est redemandée une fois.
 * Vrai Chromium pour 1, 2 et 3. SABOTAGE=1 : remet l'ancienne empreinte du robot et l'ancien retour de cuisine → doit être ROUGE. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { empreintePage } from '../tools/plateformes/verif-affichage-domaine.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${c ? '' : '  ' + JSON.stringify(d)}`); };
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const SAB = process.env.SABOTAGE === '1';
const ANCIENNE = () => location.href + '|' + document.body.innerHTML.length + '|' + document.querySelectorAll('*').length;
const empreinte = SAB ? ANCIENNE : empreintePage;

const b = await chromium.launch();
const page = async (html, w = 390, h = 664) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('https://t.test/**', (r) => new URL(r.request().url()).pathname === '/'
    ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.fulfill({ status: 404, body: '' }));
  await p.goto('https://t.test/'); await p.waitForTimeout(400);
  return { p, ctx };
};

/* 1. Tor : chaque onglet change la vue, le robot doit le voir */
{
  const { p, ctx } = await page(lire('tools/tor/index.html'));
  const onglets = await p.locator('nav.tabs button[data-v]').count();
  let vus = 0;
  for (let k = 1; k < onglets; k++) {
    const avant = await p.evaluate(empreinte);
    await p.locator('nav.tabs button[data-v]').nth(k).click(); await p.waitForTimeout(250);
    if (await p.evaluate(empreinte) !== avant) vus++;
  }
  ok(onglets >= 6 && vus === onglets - 1, `tor : ${vus}/${onglets - 1} changements d'onglet vus par le robot`, { onglets, vus });
  await ctx.close();
}

/* 2. Worldmonitor */
{
  const s = lire('kdmc-home/worldmonitor/index.html');
  ok(/id="briefModal"[^>]*aria-modal="true"/.test(s), 'worldmonitor : la fenêtre « Brief IA » est aria-modal');
  ok(/m\.setAttribute\("aria-modal","true"\)/.test(s), 'worldmonitor : la fenêtre « Ajouter à l\'écran d\'accueil » est aria-modal');
  ok(/var simple=\/\^https:\\\/\\\/eonet/.test(s) && /simple\?\{signal:c\.signal,referrerPolicy:"no-referrer"\}/.test(s), 'worldmonitor : la NASA (EONET) est lue en requête simple, sans cache:no-store et SANS provenance (elle répond 403 à « Referer: worldmonitor.kd-mc.com »)');
  /* 18.11 — en VRAI navigateur : la fonction getJSON de la page, telle qu'elle est écrite, appelle la NASA SANS en-tête de provenance (les autres sources la gardent). */
  { const fn = (s.match(/async function getJSON\(url,ms\)\{[\s\S]*?finally\{clearTimeout\(t\);\}\}/) || [''])[0];
    const src = SAB ? fn.replace(',referrerPolicy:"no-referrer"', '') : fn;
    const pw = await b.newPage(); const vus = {};
    await pw.route('https://worldmonitor.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>x</p>' }));
    await pw.route(/^https:\/\/(eonet\.gsfc\.nasa\.gov|autre\.test)\//, (r) => { vus[new URL(r.request().url()).hostname] = r.request().headers().referer || ''; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":1}' }); });
    await pw.goto('https://worldmonitor.test/');
    const rep = await pw.evaluate(async (code) => { const g = new Function(code + '; return getJSON;')(); return [await g('https://eonet.gsfc.nasa.gov/api/v3/events?limit=1').catch(() => null), await g('https://autre.test/x').catch(() => null)]; }, src);
    ok(!!fn && rep[0] && rep[0].ok === 1 && vus['eonet.gsfc.nasa.gov'] === '' && /worldmonitor\.test/.test(vus['autre.test'] || ''), 'worldmonitor en vrai navigateur : appel NASA sans provenance, les autres sources la gardent', vus);
    await pw.close(); }
  ok(!/min-height:(42|38)px/.test(s), 'worldmonitor : plus de bouton à 42 ou 38 px (« Compris », « Installer »)');
}

/* 3. Cuisine : le retour fait 44 px, porte data-kdmc-retour ; l'accueil a son lien vers le portail */
{
  let s = lire('tools/cuisine/index.html');
  if (SAB) s = s.replace('width:44px;height:44px;flex:0 0 44px;', 'width:40px;height:40px;').replace(/ data-kdmc-retour="1"/g, '').replace('class="home-portail"', 'class="x"');
  const { p, ctx } = await page(s);
  const R = await p.evaluate(() => {
    const a = document.querySelector('a.home-portail[href="https://kd-mc.com/"]');
    const r = a && a.getBoundingClientRect();
    return { lien: !!a, retour: !!(a && a.hasAttribute('data-kdmc-retour')), w: r && Math.round(r.width), h: r && Math.round(r.height) };
  });
  ok(R.lien && R.retour && R.w >= 44 && R.h >= 44, 'cuisine accueil : lien « ← Portail » de l\'app, ≥ 44 px, data-kdmc-retour', R);
  ok(/<button class="back" data-kdmc-retour="1"/.test(s) && /\.top \.back\{[^}]*width:44px;height:44px/.test(s), 'cuisine : bouton retour des écrans intérieurs 44 px + data-kdmc-retour');
  await ctx.close();
}

/* 4. registration.update() rattrapé partout */
for (const f of ['kdmc-home/ia/index.html', 'kdmc-home/outils/index.html', 'kdmc-home/osint/index.html', 'dossiers/sw-enregistrer.js', 'tools/tor/index.html', 'tools/crypto-bot-dashboard/index.html']) {
  const s = lire(f);
  ok(!/(?<!u=)r\.update\(\);/.test(s) && /u\.catch\(function\(\)\{\}\)/.test(s), `${f} : échec de r.update() rattrapé`);
}

/* 5. Dossiers : la feuille annulée est redemandée */
ok(/dossiers\.css\?r=/.test(lire('dossiers/dossiers.js')), 'dossiers : feuille de style redemandée si les boutons font moins de 44 px');

/* 6. Première visite avec service worker (Chromium, comme l'écran Android du robot) : la page ne se recharge pas toute seule,
   la feuille de style arrive, les boutons font 44 px (pont 2608 : « a.btn 104x17 » sur android seulement). */
{
  const fs = await import('node:fs'); const path = await import('node:path');
  const racine = path.resolve(new URL('../dossiers', import.meta.url).pathname);
  const ctx = await b.newContext({ viewport: { width: 412, height: 839 } });
  await ctx.route('https://d.test/**', (r) => {
    let f = new URL(r.request().url()).pathname.replace(/^\//, '') || 'index.html';
    if (SAB && f === 'sw-enregistrer.js') return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(racine, f), 'utf8').replace(/ \|\| !avant/, '') });
    const p = path.join(racine, f);
    if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(p) });
  });
  const p = await ctx.newPage(); let nav = 0;
  p.on('framenavigated', (fr) => { if (fr === p.mainFrame()) nav++; });
  await p.goto('https://d.test/'); await p.waitForTimeout(3500);
  const R = await p.evaluate(() => ({ sw: !!navigator.serviceWorker.controller, h: Math.round(document.querySelector('.btn').getBoundingClientRect().height) }));
  ok(nav === 1 && R.h >= 44, `dossiers 1re visite (service worker ${R.sw ? 'actif' : 'en route'}) : ${nav} chargement(s), bouton ${R.h} px`, { nav, ...R });
  await ctx.close();
}
for (const f of ['kdmc-home/ia/index.html', 'kdmc-home/outils/index.html', 'kdmc-home/osint/index.html']) {
  ok(/var avant=!!navigator\.serviceWorker\.controller;/.test(lire(f)) && /if\(rl\|\|!avant\|\|/.test(lire(f)), `${f} : rechargement seulement pour une vraie mise à jour`);
}

await b.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
