/* GARDE — le détecteur d'erreurs d'affichage (tools/plateformes/verif-affichage-domaine.mjs) voit VRAIMENT les défauts dont Kevin parle
 * (25.10.2026 : « des boutons qui en cachent d'autres… le haut est caché dans l'écran, page mal positionnée »).
 * Une page PIÉGÉE (bouton recouvert, titre coupé en haut, page trop large, page sous l'encoche) doit sortir en rouge sur chaque mesure,
 * et une page PROPRE doit sortir à zéro — sinon le robot du domaine mentirait dans un sens ou dans l'autre.
 * Lancer : npm run test:affichage-detecteur
 */
import { chromium } from 'playwright';
import { mesurer } from '../tools/plateformes/verif-affichage-domaine.mjs';

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
await b.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Détecteur d’affichage : voit les défauts, ne crie pas au loup'));
process.exit(ko ? 1 : 0);
