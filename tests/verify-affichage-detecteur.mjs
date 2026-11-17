/* GARDE — le détecteur d'erreurs d'affichage (tools/plateformes/verif-affichage-domaine.mjs) voit VRAIMENT les défauts dont Kevin parle
 * (25.10.2026 : « des boutons qui en cachent d'autres… le haut est caché dans l'écran, page mal positionnée »).
 * Une page PIÉGÉE (bouton recouvert, titre coupé en haut, page trop large, page sous l'encoche) doit sortir en rouge sur chaque mesure,
 * et une page PROPRE doit sortir à zéro — sinon le robot du domaine mentirait dans un sens ou dans l'autre.
 * Lancer : npm run test:affichage-detecteur
 */
import { chromium } from 'playwright';
import { mesurer, candidatsNavigation, aUnRetour, fermerFeuilleToujours } from '../tools/plateformes/verif-affichage-domaine.mjs';

const PIEGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>p</title>
<style>body{margin:0;font:16px sans-serif} header{position:relative;top:-30px;height:60px;background:#333;color:#fff}
#a{position:absolute;top:100px;left:10px;width:120px;height:50px} #voile{position:absolute;top:90px;left:0;width:200px;height:80px;background:rgba(0,0,0,.6)}
.large{width:900px;height:20px;background:red}</style></head><body>
<header><h1>Titre</h1></header><button id="a">Envoyer</button><div id="voile"></div><div class="large"></div></body></html>`;
const PROPRE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>p</title>
<style>body{margin:0;padding-top:env(safe-area-inset-top);font:16px sans-serif} button{min-width:48px;min-height:48px;margin:8px}</style></head><body>
<header><h1>Titre</h1></header><button>Envoyer</button><a href="#x" style="display:inline-block;min-width:48px;min-height:48px">Lien</a></body></html>`;

let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await p.setContent(PIEGE); const m1 = await p.evaluate(mesurer, true);
ok('piège : bouton recouvert repéré', m1.cache === 1 && /button#a/.test(m1.cacheEx[0]), JSON.stringify(m1.cacheEx));
ok('piège : haut coupé repéré', m1.haut >= 1, JSON.stringify(m1.hautEx));
ok('piège : page trop large repérée', m1.deborde > 400, String(m1.deborde));
ok('piège : page sous l’encoche iPhone repérée', m1.encoche === true);
await p.setContent(PROPRE); const m2 = await p.evaluate(mesurer, true);
ok('page propre : 0 caché, 0 haut coupé, 0 débordement, encoche gérée, 0 bouton < 44 px', m2.cache === 0 && m2.haut === 0 && m2.deborde === 0 && m2.encoche === false && m2.petit === 0, JSON.stringify(m2));
/* un message éphémère (toast) qui passe sur un bouton n'est pas compté comme « caché » (il part seul) ; une carte non plus */
await p.setContent(`<!doctype html><title>t</title><button id="b" style="position:absolute;top:40px;left:10px;width:100px;height:50px">Ok</button><div class="toast show" style="position:absolute;top:30px;left:0;width:200px;height:80px;background:#000">Enregistré</div>`);
const m5 = await p.evaluate(mesurer, true);
ok('toast sur un bouton : compté à part, pas « caché »', m5.cache === 0 && m5.toast === 1, JSON.stringify([m5.cache, m5.toast]));
/* iPhone en PAYSAGE : une page propre ne « déborde » pas (25.10 : faux +360 px quand on comparait à la largeur du portrait) */
const pl = await (await b.newContext({ viewport: { width: 750, height: 342 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await pl.setContent(PROPRE); const m3 = await pl.evaluate(mesurer, true);
ok('paysage : page propre = 0 débordement', m3.deborde === 0, String(m3.deborde));
await pl.setContent(PIEGE); const m4 = await pl.evaluate(mesurer, true);
ok('paysage : page piégée (900 px) = débordement vu', m4.deborde > 100, String(m4.deborde));
/* exploration : les onglets sont trouvés, l'onglet ouvert et les boutons dangereux (supprimer, payer…) ne sont JAMAIS touchés ; la flèche retour se voit */
await p.setContent(`<!doctype html><title>t</title><nav><button class="active">Accueil</button><button>Planning</button><button>Supprimer mon compte</button><a href="#fiche">Fiches</a></nav><main></main>`);
const nb = await p.evaluate(candidatsNavigation);
const marques = await p.evaluate(() => [...document.querySelectorAll('[data-kdmc-explo]')].map((e) => e.textContent.trim()));
ok('exploration : 2 onglets à toucher (ni l’onglet ouvert, ni « Supprimer »)', nb === 2 && marques.join(',') === 'Planning,Fiches', JSON.stringify(marques));
ok('flèche retour absente → vue absente', (await p.evaluate(aUnRetour)) === false);
await p.setContent(`<!doctype html><title>t</title><header><a href="#">← Retour</a></header><h1>Fiche</h1>`);
ok('flèche retour présente → vue', (await p.evaluate(aUnRetour)) === true);
/* 6.11 (Kevin : « la pastille Javis Bee Lingua ne cache jamais rien ») : le détecteur dit QUI recouvre — ici le cadre de Bee */
await p.setContent(`<!doctype html><title>t</title><button id="ok" style="position:absolute;top:500px;left:300px;width:60px;height:50px">Ok</button><iframe src="/__javis/cadre" style="position:fixed;top:480px;left:290px;width:92px;height:92px;border:0;z-index:2147483000"></iframe>`);
const m6 = await p.evaluate(mesurer, true);
await p.setContent(`<!doctype html><title>t</title><div id="liste" style="position:absolute;top:0;left:0;width:300px;height:200px;overflow-y:auto"><div style="height:400px"></div><button id="loin" style="display:block;height:44px">Tester</button></div><form style="position:absolute;top:380px;left:0;width:300px;height:120px"><textarea style="width:280px;height:100px"></textarea></form>`);
const m7 = await p.evaluate(mesurer, true);
ok('un bouton à faire défiler dans sa liste n\'est pas « caché » (6.11, chat de Javis)', m7.cache === 0, JSON.stringify(m7.cacheEx));
ok('un bouton sous le cadre de Bee est attribué à « bee »', m6.cache === 1 && m6.parFlottant && m6.parFlottant.bee === 1, JSON.stringify(m6.parFlottant));
/* 8.11 : le débordement est NOMMÉ (La Détente iPhone SE : « déborde +63px » sans nom) ; une liste qui défile d'elle-même ne compte pas */
{ const vp = p.viewportSize(); await p.setViewportSize({ width: 320, height: 568 });
  await p.setContent('<!doctype html><title>t</title><div style="overflow-x:auto"><div id="liste" style="width:900px">liste</div></div><div id="large" style="width:383px;height:20px">trop large</div>');
  const md = await p.evaluate(mesurer, true);
  ok('le débordement est nommé (élément + positions), la liste qui défile ne l\'est pas', md.deborde > 0 && md.debordeEx.length === 1 && /div#large/.test(md.debordeEx[0]), JSON.stringify(md.debordeEx));
  await p.setViewportSize(vp); }
/* 8.11 : la feuille « Installer l'application » qui s'ouvre APRÈS la fermeture par le robot est refermée dès qu'elle apparaît (sinon elle masque toute la page mesurée) */
/* 12.11 (CMCteams) : un bouton de la page sous la barre FIXE du bas se dégage en défilant → pas « caché » ; s'il n'y a pas assez de page dessous, ou s'il est fixe lui-même → caché */
{ const barre = '<nav style="position:fixed;left:0;right:0;bottom:0;height:60px;background:#000"><span>barre</span></nav>';
  const H0 = await p.evaluate(() => innerHeight);
  await p.setContent(`<!doctype html><title>t</title><body style="margin:0"><div style="height:${H0 - 50}px"></div><button id="flux" style="display:block;width:120px;height:44px">Admin</button><div style="height:600px"></div>${barre}`);
  const ma = await p.evaluate(mesurer, true); ok('un bouton de la page sous la barre fixe du bas, page qui défile : pas compté caché', ma.cache === 0, JSON.stringify(ma.cacheEx));
  await p.setContent(`<!doctype html><title>t</title><body style="margin:0;height:${H0}px;overflow:hidden"><button id="coince" style="position:absolute;top:${H0 - 50}px;left:0;width:120px;height:44px">Admin</button>${barre}`);
  const mb = await p.evaluate(mesurer, true); ok('le même bouton quand la page ne peut PAS défiler : caché', mb.cache === 1, JSON.stringify(mb.cacheEx));
  ok('… et le robot dit POURQUOI (le visiteur ne peut pas faire défiler)', /ne peut pas faire défiler/.test(mb.cacheEx[0] || ''), mb.cacheEx[0]);
  await p.setContent(`<!doctype html><title>t</title><body style="margin:0"><div style="height:${H0 - 50}px"></div><button id="flux2" style="display:block;width:120px;height:44px">Admin</button><div style="height:900px"></div>${barre}<div id="voile" style="position:fixed;left:0;right:0;top:120px;height:${H0 - 300}px;background:#333">voile</div>`);
  const md2 = await p.evaluate(mesurer, true); ok('recouvert par un AUTRE élément fixe après défilement : caché, et le robot NOMME cet élément et la distance défilée', md2.cache === 1 && /après défilement \(\d+ px\) : bouton @\d+,\d+ sous div#voile/.test(md2.cacheEx[0] || ''), JSON.stringify([md2.cacheEx, md2.aDefilerEx, md2.toast, H0]));
  await p.setContent(`<!doctype html><title>t</title><body style="margin:0"><div style="height:2000px"></div><button id="fixe" style="position:fixed;bottom:8px;right:8px;width:52px;height:44px">+</button>${barre}`);
  const mc = await p.evaluate(mesurer, true); ok('un bouton FIXE sous la barre fixe (cas #fab) : toujours caché, même si la page défile', mc.cache === 1, JSON.stringify(mc.cacheEx)); }
await p.setContent('<!doctype html><title>t</title><button id="b">Ok</button>');
await p.evaluate(fermerFeuilleToujours);
await p.evaluate(() => setTimeout(() => { const f = document.createElement('div'); f.setAttribute('data-kdmc-installer', 'feuille'); f.style.cssText = 'position:fixed;inset:0;z-index:2147482600;background:#000'; const x = document.createElement('button'); x.setAttribute('aria-label', 'Fermer'); x.onclick = () => f.remove(); f.appendChild(x); document.body.appendChild(f); }, 300));
await p.waitForTimeout(800);
ok('la feuille d\'installation ouverte en retard est refermée aussitôt', await p.evaluate(() => !document.querySelector('[data-kdmc-installer="feuille"]')));
/* 7.11 (pont 1929) : chaque recouvrement par un flottant est NOMMÉ avec ses positions, pas seulement compté (2-3 exemples ne suffisaient pas pour corriger) */
ok('le recouvrement par Bee est nommé : élément + positions', Array.isArray(m6.flotEx) && m6.flotEx.length === 1 && /^bee : button#ok .*\[@\d+,\d+ \d+x\d+ sous @/.test(m6.flotEx[0]), JSON.stringify(m6.flotEx));
{ const { bilan } = await import('../tools/plateformes/verif-affichage-domaine.mjs'); const B = bilan([{ app: 'x', ecran: 'iphone-se', flotEx: m6.flotEx }, { app: 'x', ecran: 'portable', flotEx: m6.flotEx }]); ok('le bilan garde chaque recouvrement par écran', B.x.flotEx && B.x.flotEx.length === 2 && /^\[iphone-se\] bee : /.test(B.x.flotEx[0]), JSON.stringify(B.x.flotEx)); }
/* 12.11 (cmcteams-pdf, pont 2125 : barre « J'arrive » de la light et barre du bas de CMCteams comptées « cachées » alors qu'elles sont sous le pli) : un contrôle sous une barre FIXE de l'app,
   atteignable au défilement, est « à faire défiler », pas caché ; s'il reste recouvert (page qui ne défile pas) il est caché ; l'abeille garde la règle stricte (Kevin 6.11 : elle ne cache jamais rien). */
{ const BARRE = (style, filler = 2000) => `<!doctype html><title>t</title><style>body{margin:0}${style}</style><div style="height:${filler}px"></div><button id="bas" style="position:absolute;top:800px;left:20px;width:120px;height:50px">J'arrive</button><div id="barre" style="position:fixed;bottom:0;left:0;right:0;height:80px;background:#333"><span>barre</span></div>`;
  await p.setContent(BARRE('')); const ma = await p.evaluate(mesurer, true); const sy = await p.evaluate(() => scrollY);
  ok('barre fixe de l\'app : le bouton sous le pli est « à faire défiler », pas caché ; défilement remis à 0', ma.cache === 0 && ma.aDefiler === 1 && /^button#bas \(sous div#barre au repos\)/.test(ma.aDefilerEx[0]) && sy === 0, JSON.stringify([ma.cache, ma.aDefilerEx, sy]));
  await p.setContent(BARRE('html,body{overflow:hidden}')); const mb = await p.evaluate(mesurer, true);
  await p.setContent(BARRE('', 0)); const mb2 = await p.evaluate(mesurer, true);
  ok('page que le visiteur ne peut pas faire défiler (overflow caché, ou rien sous le pli) : le bouton sous la barre reste caché', mb.cache === 1 && mb.aDefiler === 0 && /button#bas/.test(mb.cacheEx[0]) && mb2.cache === 1 && mb2.aDefiler === 0, JSON.stringify([mb.cache, mb.cacheEx, mb2.cache]));
  await p.setContent(`<!doctype html><title>t</title><div style="height:2000px"></div><button id="ok" style="position:absolute;top:500px;left:300px;width:60px;height:50px">Ok</button><iframe src="/__javis/cadre" style="position:fixed;top:480px;left:290px;width:92px;height:92px;border:0;z-index:2147483000"></iframe>`);
  const mc = await p.evaluate(mesurer, true);
  ok('l\'abeille garde la règle stricte : un bouton sous elle est caché même si la page défile', mc.cache === 1 && mc.parFlottant && mc.parFlottant.bee === 1 && mc.aDefiler === 0, JSON.stringify([mc.cache, mc.parFlottant, mc.aDefiler])); }
/* 12.11 nuit (pont 2344, Servi après Bee v1.38) : un bouton sous une barre FIXE de l'app, qui, une fois défilé au centre, se retrouve sous le cadre de Bee (pas encore replacé,
   il attend 350 ms) est « à faire défiler », pas « caché » ; la même page avec un voile fixe de l'APP au centre reste « caché ». */
{ const pn = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const PAGE = (centre) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title><style>body{margin:0}</style><div style="height:2000px"></div><button id="bas" style="position:absolute;top:800px;left:296px;width:60px;height:50px">Ok</button><div id="barre" style="position:fixed;bottom:0;left:0;right:0;height:80px;background:#333"><span>barre</span></div>${centre}`;
  await pn.setContent(PAGE('<iframe src="/__javis/cadre" style="position:fixed;top:376px;left:296px;width:92px;height:92px;border:0"></iframe>')); const mbee = await pn.evaluate(mesurer, true);
  ok('sous la barre de l\'app puis sous le cadre de Bee juste après le défilement : à faire défiler, pas caché', mbee.cache === 0 && mbee.aDefiler === 1, JSON.stringify([mbee.cache, mbee.aDefiler, mbee.cacheEx]));
  await pn.setContent(PAGE('<div id="voile" style="position:fixed;top:376px;left:296px;width:92px;height:92px;background:#000"></div>')); const mvoile = await pn.evaluate(mesurer, true);
  ok('même page avec un voile fixe de l\'app au centre : le bouton reste caché', mvoile.cache === 1 && mvoile.aDefiler === 0, JSON.stringify([mvoile.cache, mvoile.aDefiler]));
  /* 17.11 (pont 2608, CMCteams Android : « span @55,673 sous #pointageBtn » restait caché) : la languette « 👑 Vue admin » du routeur se range à `top:50%` quand le bas est pris ; le robot amène
     le contrôle AU CENTRE de l'écran, donc pile sous elle, et mesure avant qu'elle ait eu ses 500 ms pour se replacer (installer-client.js, `degager`). Comme pour Bee : à faire défiler, pas caché. */
  await pn.setContent(PAGE('<button data-kdmc-vue="1" style="position:fixed;top:400px;left:260px;width:121px;height:44px;border:0;background:#222;color:#fff">👑 Vue admin</button>')); const mvue = await pn.evaluate(mesurer, true);
  ok('sous la barre de l\'app puis sous la languette « Vue admin » du domaine juste après le défilement : à faire défiler, pas caché', mvue.cache === 0 && mvue.aDefiler === 1, JSON.stringify([mvue.cache, mvue.aDefiler, mvue.cacheEx]));
  await pn.setContent(PAGE('<button id="autre" style="position:fixed;top:400px;left:260px;width:121px;height:44px;border:0;background:#222;color:#fff">Autre</button>')); const mautre = await pn.evaluate(mesurer, true);
  ok('même page avec un bouton fixe de l\'APP au centre : le bouton reste caché', mautre.cache === 1 && mautre.aDefiler === 0, JSON.stringify([mautre.cache, mautre.aDefiler]));
}
/* 12.11 (passe Servi iPhone 13 : worldmonitor « petit 57 » = 57 épingles Leaflet) : une épingle de carte n'est pas une cible < 44 px ; un petit bouton de l'app et une commande de la carte le restent */
{ await p.setContent('<!doctype html><title>t</title><div class="leaflet-container" style="position:relative;width:390px;height:400px"><div class="leaflet-marker-pane"><div class="leaflet-marker-icon leaflet-zoom-animated" tabindex="0" role="button" style="position:absolute;left:100px;top:100px;width:25px;height:41px" onclick="void 0"></div><div class="leaflet-marker-icon" role="button" style="position:absolute;left:200px;top:150px;width:25px;height:41px"></div></div><div class="leaflet-control-container"><a href="#" class="leaflet-control-zoom-in" style="position:absolute;left:10px;top:10px;width:30px;height:30px;display:block">+</a></div></div><button id="mini" style="width:30px;height:30px">x</button>');
  const mm = await p.evaluate(mesurer, true);
  ok('les épingles de carte ne comptent pas « < 44 px » ; la commande de zoom et le petit bouton de l\'app, si', mm.petit === 2 && !mm.petitEx.some((x) => /marker/.test(x)) && mm.petitEx.some((x) => /leaflet-control-zo/.test(x)) && mm.petitEx.some((x) => /button#mini/.test(x)), JSON.stringify([mm.petit, mm.petitEx]));
  ok('un « trop petit » dit sa taille et son parent (ex. « button#mini 30x30 dans … »)', mm.petitEx.every((x) => /\s\d+x\d+ dans \S+/.test(x)), JSON.stringify(mm.petitEx)); }
/* 16.11 : le grand robot ferme l'écran d'accueil AVANT chaque mesure (sinon « cmcteams cache 162 » sous l'écran de bienvenue, run 43778650553) */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  const n = (src.match(/for \(let k = 0; k < 3 && await page\.evaluate\(fermerAccueil\)[^\n]*\n\s*(?:const m2|m) = await page\.evaluate\(mesurer, tel\)/g) || []).length;
  ok('le grand robot ferme l\'accueil (jusqu\'à 3 écrans : bienvenue, consentement) avant ses 2 mesures', n === 2, String(n)); }
/* 16.11 (apex-cloud 2540) : sous une fenêtre modale ouverte, la page derrière n'est pas « cachée » ; le même voile SANS aria-modal le reste. Et un écran de démarrage se laisse attendre. */
{ const pm = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const page0 = (attr) => '<!doctype html><title>t</title><body style="margin:0"><button id="derriere" style="position:absolute;left:20px;top:200px;width:120px;height:48px">x</button><div ' + attr + ' style="position:fixed;inset:0;background:rgba(0,0,0,.6)"><button id="fermer" style="position:absolute;right:10px;top:10px;width:48px;height:48px">✕</button></div></body>';
  await pm.setContent(page0('role="dialog" aria-modal="true"')); const avec = await pm.evaluate(mesurer, true);
  await pm.setContent(page0('class="voile"')); const sans = await pm.evaluate(mesurer, true);
  ok('sous une fenêtre aria-modal : 0 caché ; sous le même voile sans aria-modal : 1 caché', avec.cache === 0 && sans.cache === 1, JSON.stringify([avec.cache, sans.cache]));
  const { ecranDemarrageParti } = await import('../tools/plateformes/verif-affichage-domaine.mjs');
  await pm.setContent('<!doctype html><title>t</title><body style="margin:0"><div id="splash" class="splash" style="position:fixed;inset:0;background:#000"></div></body>'); const la = await pm.evaluate(ecranDemarrageParti);
  await pm.evaluate(() => { document.getElementById('splash').style.display = 'none'; }); const parti = await pm.evaluate(ecranDemarrageParti);
  ok('écran de démarrage : vu tant qu\'il est affiché, parti une fois masqué', la === false && parti === true, JSON.stringify([la, parti]));
  await pm.close(); }
/* 16.11 (run 43965271962 : « Page crashed » sur 20 apps) : le grand robot relance son navigateur et rejoue l'adresse une fois */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  const { estPlantage } = await import('../tools/plateformes/verif-affichage-domaine.mjs');
  ok('plantage reconnu (« Page crashed », « context or browser has been closed ») ; une erreur de page ne l\'est pas', estPlantage('page.goto: Page crashed') && estPlantage(new Error('page.evaluate: Target page, context or browser has been closed')) && !estPlantage('page.goto: Timeout 30000ms exceeded') && !estPlantage('net::ERR_NAME_NOT_RESOLVED'));
  ok('le grand robot : page morte → navigateur relancé avant l\'adresse ; plantage → adresse rejouée UNE fois (2 essais au plus)', /if \(!\(await page\.evaluate\(\(\) => 1\)\.catch\(\(\) => 0\)\)\) \{ await ouvrir\(\);/.test(src) && /for \(let essai = 0; essai < 2; essai\+\+\)/.test(src) && /if \(!err \|\| essai \|\| !estPlantage\(err\)\) break;/.test(src) && /debrancher\(\); await ouvrir\(\); brancher\(\);/.test(src)); }
/* 17.11 (apex-cloud 2592 + run 43973722309) : un bouton en pointer-events:none et le crédit d'une carte ne sont ni « cachés » ni « petits » ; les mêmes sans ces marques le restent. Et un bouton sans réaction est NOMMÉ sans son texte. */
{ const pn = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const page1 = (stylePastille, classeCredit) => '<!doctype html><title>t</title><body style="margin:0"><button id="pastille" style="position:fixed;left:10px;top:300px;width:70px;height:18px;' + stylePastille + '">v1</button><div style="position:fixed;left:0;top:290px;width:200px;height:40px;background:#123"></div><div class="' + classeCredit + '" style="position:fixed;right:0;bottom:0"><a href="https://exemple.test" style="display:inline-block;width:51px;height:14px">©</a></div></body>';
  await pn.setContent(page1('pointer-events:none', 'leaflet-control-attribution')); const ign = await pn.evaluate(mesurer, true);
  await pn.setContent(page1('', 'credit')); const vu = await pn.evaluate(mesurer, true);
  ok('pointer-events:none et crédit de carte : 0 caché, 0 petit ; les mêmes sans ces marques : 1 caché, 2 petits', ign.cache === 0 && ign.petit === 0 && vu.cache === 1 && vu.petit === 2, JSON.stringify([ign.cache, ign.petit, vu.cache, vu.petit]));
  const { nomSansTexte } = await import('../tools/plateformes/verif-affichage-domaine.mjs');
  await pn.setContent('<!doctype html><title>t</title><body style="margin:0"><button id="tabPlus" class="tab gros autre" style="position:absolute;left:12px;top:40px;width:80px;height:44px">Jean Dupont</button></body>');
  const nom = await pn.locator('#tabPlus').evaluate(nomSansTexte);
  ok('un bouton sans réaction est nommé par balise, id, classes et position, jamais par son texte', nom === 'button#tabPlus.tab.gros @12,40', nom);
  const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  ok('le grand robot écrit le nom du bouton sans réaction', /cible\.evaluate\(nomSansTexte\)/.test(src) && /'sans réaction : ' \+ \(nomCible \|\| 'n°' \+ k\)/.test(src));
  await pn.close(); }
/* 17.11 (run 43973722309 : une erreur de l'arbre comptée sur « autorisations », l'adresse suivante) : le grand robot vide la page avant d'écouter les erreurs de l'adresse suivante */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  ok('le grand robot vide la page (about:blank) AVANT de brancher l\'écoute des erreurs', /await page\.goto\('about:blank'\)\.catch\(\(\) => \{\}\); await page\.waitForTimeout\(400\);\n\s*brancher\(\);/.test(src)); }
/* 17.11 (cloud-poste-recherche 2597) : sur les écrans WebKit, le grand robot bloque le service worker (sinon ses requêtes filtrées sont annulées et le style ne charge pas) */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  ok('le grand robot ouvre ses écrans WebKit sans service worker (et seulement ceux-là)', /newContext\(\{ \.\.\.opts, \.\.\.\(moteur === bw \? \{ serviceWorkers: 'block' \} : \{\}\) \}\)/.test(src)); }
/* 17.11 (kit « déborde 102 » après un toucher, sans dire quoi) : le grand robot nomme ce qui déborde après un toucher, et la page « sans retour » */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  ok('le grand robot nomme le débordement après un toucher et la page sans retour', /explo\.ex\.push\('déborde après ' \+ \(nomCible/.test(src) && /'pas de retour après ' \+ \(nomCible/.test(src)); }
/* 17.11 (lingua « onglets sans réaction », réactifs en local) : après un rechargement le grand robot attend la page prête ; un « sans réaction » dit ce qui est posé sur le bouton ; un toucher impossible est nommé */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  ok('le grand robot : rechargement → page attendue prête ; « sans réaction » avec ce qui est dessus ; « toucher impossible » nommé', /if \(changePage\) \{ await page\.goto\(url\(h\)[^\n]*waitForFunction\(ecranDemarrageParti[^\n]*fermerAccueil[^\n]*candidatsNavigation\)/.test(src) && /\(dessus : ' \+ dessus/.test(src) && /'toucher impossible : n°'/.test(src)); }
/* 17.11 (studio : « Choisir une photo » compté sans réaction) : un toucher qui ouvre le choix d'un fichier ou une boîte du navigateur est une réaction */
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../tools/plateformes/verif-affichage-domaine.mjs', import.meta.url), 'utf8');
  ok('le grand robot écoute « filechooser » et « dialog » pendant le toucher et ne compte pas ces boutons morts', /page\.on\('filechooser', surFichier\); page\.on\('dialog', surBoite\);/.test(src) && /if \(apres === avant && !hors\)/.test(src) && /page\.off\('filechooser', surFichier\); page\.off\('dialog', surBoite\);/.test(src));
  const pf = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await pf.setContent('<!doctype html><title>t</title><body><input type="file" id="f" style="display:none"><button id="choisir" onclick="document.getElementById(\'f\').click()">Choisir</button></body>');
  let vu = false; const sur = () => { vu = true; }; pf.on('filechooser', sur); await pf.click('#choisir'); await pf.waitForTimeout(300); pf.off('filechooser', sur);
  ok('vrai navigateur : un bouton « choisir un fichier » déclenche bien l\'événement écouté', vu === true); await pf.close(); }
await b.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Détecteur d’affichage : voit les défauts, ne crie pas au loup'));
process.exit(ko ? 1 : 0);
