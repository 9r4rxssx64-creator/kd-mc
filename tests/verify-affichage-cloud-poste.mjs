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
  ok(!/min-height:42px/.test(s), 'worldmonitor : plus de bouton à 42 px');
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

await b.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
