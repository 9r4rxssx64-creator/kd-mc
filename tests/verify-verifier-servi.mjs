/* GARDE — l'outil « vérifier ce qui est servi » (Kevin 25.10 : « ne jamais être bloqué comme ça »).
 *  1. il n'ouvre QUE des adresses *.kd-mc.com (jamais kd-mc.com.autre.com, jamais http) ;
 *  2. sur une page piégée (titre collé sous la pastille « ← Portail ») il le DIT (sousPastille=true) ; sur la page propre, non ;
 *  3. il ne rend jamais de texte de page : la mesure ne contient que balise#id.classe, des nombres et « vX.Y.Z » ;
 *  4. le workflow public existe, n'a pas de cron, et lit le secret APEX_ADMIN_PIN_SHA256 sans l'écrire. SABOTAGE=1 : pastille ignorée → rouge. */
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { adresseSure, mesurerServi, NOMS_ECRANS_SERVI, trouverEcranServi, sansTexte, aCorriger, fermerFeuilleInstalleur, lireVersionSw, mesurerFluidite } from '../tools/plateformes/verifier-servi.mjs';
import { mesurer } from '../tools/plateformes/verif-affichage-domaine.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('./../messaging-app/node_modules/playwright')); }
const exe = process.env.PW_EXE || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
let ko = 0; const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };

ok('1a. adresse du domaine acceptée', adresseSure('autorisations') === 'https://autorisations.kd-mc.com/' && !!adresseSure('https://kd-mc.com/liens/'));
ok('1b. adresse étrangère, faux sous-domaine et http refusés', !adresseSure('https://evil.com/') && !adresseSure('https://kd-mc.com.evil.com/') && !adresseSure('http://kd-mc.com/') && !adresseSure('javascript:alert(1)'));

const PASTILLE = '<a href="https://kd-mc.com/" data-kdmc-pastille="routeur" style="position:fixed;top:8px;left:8px;min-height:44px;min-width:60px;display:inline-flex;align-items:center;padding:0 14px;background:#111;color:#fff">← Portail</a>';
const page = (marge) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><html data-app-ver="v9.9.9"><body style="margin:0;padding:${marge}px 12px">${PASTILLE}<h1 id="titre" class="g" style="margin:0">Texte secret de page Léa Dupont</h1><span>v9.9.9</span></body></html>`;
const dir = mkdtempSync(join(tmpdir(), 'servi-'));
const f = (nom, h) => { const p = join(dir, nom); writeFileSync(p, h); return 'file://' + p; };
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const lire = async (u) => { await p.goto(u); return p.evaluate(mesurerServi); };
const piege = await lire(f('piege.html', page(12))), propre = await lire(f('propre.html', page(64)));
await b.close();
ok('2a. page piégée : titre sous la pastille détecté', piege.sousPastille === true && piege.premier.top < piege.pastilleBas, JSON.stringify(piege.premier));
ok('2b. page propre : rien à signaler', propre.sousPastille === false && propre.premier.top >= propre.pastilleBas, JSON.stringify(propre.premier));
ok('2c. version lue (data-app-ver et badge)', propre.appVer === 'v9.9.9' && propre.badges.includes('v9.9.9'));
const large = await (async () => { const b2 = await chromium.launch(exe ? { executablePath: exe } : {}); const p2 = await b2.newPage({ viewport: { width: 390, height: 844 } }); await p2.goto(f('large.html', '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0"><div id="trop" class="bandeau" style="width:700px;height:20px">x</div><p>court</p></body>')); const r = await p2.evaluate(mesurerServi); await b2.close(); return r; })();
ok('2d. débordement : le plus large élément est nommé avec ses nombres', large.debordeur && large.debordeur.s === 'div#trop.bandeau' && large.debordeur.droite === 700 && propre.debordeur === null, JSON.stringify(large.debordeur));
/* 2e (29.10, light iPhone « déborde 52 » mais « table#grid » désignée) : une grille large DANS une zone qui défile ne déborde pas la page ;
   le robot doit nommer le vrai responsable, et ne rien nommer quand seule la grille contenue dépasse. */
const zone = '<div class="scroll" style="overflow-x:auto"><table id="grid" style="width:1800px"><tr><td>x</td></tr></table></div>';
const contenu = await (async () => { const b3 = await chromium.launch(exe ? { executablePath: exe } : {}); const p3 = await b3.newPage({ viewport: { width: 390, height: 844 } });
  const lit = async (nom, corps) => { await p3.goto(f(nom, '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0">' + corps + '</body>')); return p3.evaluate(mesurerServi); };
  const r = { seul: await lit('zone.html', zone), avec: await lit('zone-coupable.html', zone + '<div id="coupable" style="width:442px;height:10px"></div>') }; await b3.close(); return r; })();
ok('2e. une grille contenue dans une zone qui défile n’est pas le responsable ; le vrai l’est', contenu.seul.debordeur === null && contenu.avec.debordeur && contenu.avec.debordeur.s === 'div#coupable' && contenu.avec.debordeur.droite === 442,
  JSON.stringify({ seul: contenu.seul.debordeur, avec: contenu.avec.debordeur }));
/* 2f (4.11, pont 1639 : javis.kd-mc.com « 1er texte div.javis-bub y=-187 sous la pastille OUI ») : un message de chat qui a défilé vers le haut DANS sa liste
   (zone à overflow auto) est coupé par la liste : il n'est pas sous la pastille. Le robot mesure la part VISIBLE ; et une liste qui monte vraiment sous la pastille reste signalée. */
const liste = (haut) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><html data-app-ver="v9.9.9"><body style="margin:0">${PASTILLE}<div id="msgs" style="position:absolute;left:0;right:0;top:${haut}px;height:300px;overflow-y:auto"><div class="javis-bub" style="height:600px;padding:0 12px">Message du chat</div></div></body>`;
const chat = await (async () => { const b4 = await chromium.launch(exe ? { executablePath: exe } : {}); const p4 = await b4.newPage({ viewport: { width: 390, height: 844 } });
  const lit = async (nom, haut) => { await p4.goto(f(nom, liste(haut))); await p4.evaluate(() => { document.getElementById('msgs').scrollTop = 250; }); return p4.evaluate(mesurerServi); };
  const r = { rogne: await lit('chat-rogne.html', 70), dessous: await lit('chat-dessous.html', 0) }; await b4.close(); return r; })();
ok('2f. un message défilé hors de sa liste n’est PAS « sous la pastille » (part visible mesurée)', chat.rogne.sousPastille === false && chat.rogne.premier && chat.rogne.premier.top >= chat.rogne.pastilleBas, JSON.stringify(chat.rogne.premier));
ok('2g. une liste qui monte vraiment sous la pastille est toujours signalée', chat.dessous.sousPastille === true && chat.dessous.premier.top < chat.dessous.pastilleBas, JSON.stringify(chat.dessous.premier));
/* 2h (6.11, kit.kd-mc.com « cache 4 » compté sans être nommé ni signalé) : un bouton recouvert par un élément flottant est un défaut,
   le robot dit QUI recouvre QUOI (sélecteurs), sans aucun texte de page. SABOTAGE=cache : ignoré → rouge. */
const couvert = await (async () => { const b5 = await chromium.launch(exe ? { executablePath: exe } : {}); const p5 = await b5.newPage({ viewport: { width: 1280, height: 720 } });
  await p5.goto(f('couvert.html', '<!doctype html><body style="margin:0"><a id="acheter" class="btn" href="#" style="position:absolute;top:600px;left:1180px;width:80px;height:44px">Acheter Léa Dupont</a><div id="abeille" class="flottant" style="position:fixed;bottom:40px;right:10px;width:120px;height:120px;z-index:9">secret</div></body>'));
  const m = await p5.evaluate(mesurer, false); await b5.close(); return m; })();
const ex = sansTexte(couvert.cacheEx);
ok('2h. un bouton recouvert est compté, nommé (lui ET ce qui le recouvre) et rend la page « à corriger »', couvert.cache === 1 && /a#acheter/.test(ex[0] || '') && /div#abeille/.test(ex[0] || '') && aCorriger({ cache: couvert.cache }), JSON.stringify(ex));
/* 2v (6.11, Studio : « v9.22.11 » DEUX FOIS l'une sur l'autre) : deux pastilles de version VISIBLES = défaut ; une visible + une cachée (display:none) = normal. */
const doubles = await (async () => { const bv = await chromium.launch(exe ? { executablePath: exe } : {}); const pv = await bv.newPage({ viewport: { width: 390, height: 844 } });
  const mes = async (h, nom) => { await pv.goto(f(nom, h)); return pv.evaluate(mesurerServi); };
  const deux = await mes('<!doctype html><body><span id="vbadge" style="position:fixed;left:8px;bottom:60px">v9.9.9</span><button id="kdmc-version-badge" style="position:fixed;left:8px;bottom:60px"><span>v9.9.9</span></button></body>', 'deux.html');
  const une = await mes('<!doctype html><body><span id="vbadge" style="position:fixed;left:8px;bottom:60px">v9.9.9</span><button id="kdmc-version-badge" style="position:fixed;left:8px;bottom:60px;display:none"><span>v9.9.9</span></button></body>', 'une.html');
  const couvert = await mes('<!doctype html><body><span id="vbadge" style="position:fixed;left:8px;bottom:60px">v9.9.9</span><button style="position:fixed;left:0;bottom:50px;width:120px;height:50px;background:#000">Action</button><button id="kdmc-version-badge" style="position:fixed;left:8px;bottom:5px"><span>v9.9.9</span></button></body>', 'couvert-pastille.html');
  await bv.close(); return { deux, une, couvert }; })();
ok('2v. deux pastilles de version visibles = « à corriger », nommées ; une visible + une cachée = rien', doubles.deux.badgesVisibles === 2 && aCorriger({ badgesVisibles: doubles.deux.badgesVisibles }) && doubles.deux.badgesVisiblesQui.includes('module') && doubles.une.badgesVisibles === 1 && !aCorriger({ badgesVisibles: doubles.une.badgesVisibles }) && doubles.couvert.badgesVisibles === 1, JSON.stringify([doubles.deux.badgesVisibles, doubles.deux.badgesVisiblesQui, doubles.une.badgesVisibles, doubles.couvert.badgesVisibles]));
ok('2i. l’exemple ne garde aucun texte de page', ex.length > 0 && !/secret|Dupont|Léa|Acheter/.test(JSON.stringify(ex)), JSON.stringify(ex));
/* 2j (6.11) : la feuille « Installer » du domaine (ouverte d'office pour un compte neuf) n'est pas un défaut de la page : le robot la ferme par ✕ et mesure ensuite. */
const feuille = await (async () => { const b6 = await chromium.launch(exe ? { executablePath: exe } : {}); const p6 = await b6.newPage({ viewport: { width: 390, height: 844 } });
  await p6.goto(f('feuille.html', '<!doctype html><body style="margin:0"><a id="acheter" href="#" style="display:block;width:200px;height:44px;margin:300px 20px">Acheter</a><div id="fond" style="position:fixed;inset:0;z-index:2147482500"></div><div data-kdmc-installer="feuille" style="position:fixed;left:0;right:0;bottom:0;height:200px;z-index:2147482600"><button aria-label="Fermer" type="button">✕</button></div><script>document.querySelector(\'[aria-label=Fermer]\').onclick=function(){document.getElementById("fond").remove();document.querySelector("[data-kdmc-installer]").remove();}</script></body>'));
  const avant = (await p6.evaluate(mesurer, true)).cache; const ferme = await p6.evaluate(fermerFeuilleInstalleur); const apres = (await p6.evaluate(mesurer, true)).cache; await b6.close(); return { avant, ferme, apres }; })();
ok('2j. la feuille « Installer » du domaine est fermée avant la mesure (elle couvrait la page)', feuille.avant > 0 && feuille.ferme === true && feuille.apres === 0, JSON.stringify(feuille));
/* 2k (6.11, tâche 108) : « sw vide / sans CACHE_VERSION » sur 16 hôtes était du vocabulaire de robot, pas des défauts : la version se lit aussi dans
   `CACHE` / `CACHE_NAME` / `VERSION`, la porte servie à la place de /sw.js n'est pas un worker, et « aucun » ne se dit que si le navigateur n'a
   AUCUN worker enregistré. SABOTAGE=sw : l'ancienne lecture (CACHE_VERSION seul) → rouge. */
const js = (v, nom = 'CACHE') => `var ${nom} = "${v}";\nself.addEventListener("install", function (e) { self.skipWaiting(); });`;
const lus = {
  cache: lireVersionSw({ texte: js('javis-v1.30'), type: 'application/javascript', statut: 200, enregistre: true }),
  nom: lireVersionSw({ texte: js('lingua-v2.142.11', 'CACHE_NAME'), type: 'application/javascript', statut: 200, enregistre: true }),
  version: lireVersionSw({ texte: js('kdmc-ia-v1.0.2', 'CACHE_VERSION'), type: 'application/javascript', statut: 200, enregistre: true }),
  porte: lireVersionSw({ texte: '<!doctype html><title>Staging — connexion</title>', type: 'text/html; charset=utf-8', statut: 200, enregistre: true }),
  sans: lireVersionSw({ texte: '', type: '', statut: 404, enregistre: false }),
  porteSans: lireVersionSw({ texte: '<!doctype html><title>Dashboard — connexion</title>', type: 'text/html', statut: 200, enregistre: false }),
  erreur: lireVersionSw({ erreur: true }),
};
ok('2k. la version du worker se lit dans CACHE, CACHE_NAME et CACHE_VERSION', lus.cache === 'javis-v1.30' && lus.nom === 'lingua-v2.142.11' && lus.version === 'kdmc-ia-v1.0.2', JSON.stringify(lus));
ok('2l. la porte servie à la place de /sw.js n’est pas « vide » ; sans worker enregistré c’est « aucun » ; une erreur reste « illisible »',
  lus.porte === 'enregistré, /sw.js derrière la porte' && lus.sans === 'aucun' && lus.porteSans === 'aucun' && lus.erreur === 'illisible', JSON.stringify(lus));
/* 6 (Kevin 6.11 : « creuse toujours ») : la fluidité est mesurée ET le script qui bloque est nommé. SABOTAGE=fluidite : on ne regarde pas qui bloque → rouge. */
const srv = createServer((q, r) => {
  if (q.url === '/bloqueur.js') { r.setHeader('content-type', 'text/javascript'); r.end('setInterval(()=>{const t=performance.now();while(performance.now()-t<120);},130);'); return; }
  r.setHeader('content-type', 'text/html');
  r.end(q.url === '/lent.html' ? '<!doctype html><body><script src="/bloqueur.js"></script><p>x</p>' : '<!doctype html><body><p>x</p>');
}); /* http local : l'API long-animation-frame ne nomme les scripts que pour http(s), jamais pour file:// */
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const b2 = await chromium.launch(exe ? { executablePath: exe } : {}); const p2 = await b2.newPage();
await p2.goto(base + '/calme.html'); const fc = await p2.evaluate(mesurerFluidite);
await p2.goto(base + '/lent.html'); const fl = await p2.evaluate(mesurerFluidite);
await b2.close(); srv.close();
ok('6a. page calme : plus de 20 images/s, aucun script ne bloque', fc.fps > 20 && fc.bloque.length === 0, JSON.stringify(fc));
ok('6b. page saturée : fluidité basse ET le fichier qui bloque est nommé', fl.fps < fc.fps / 2 && (process.env.SABOTAGE === 'fluidite' ? false : fl.bloque.some((x) => x.startsWith('bloqueur.js') || x.includes('/bloqueur.js'))), JSON.stringify(fl));
const sortie = JSON.stringify(propre) + JSON.stringify(piege);
ok('3. aucun texte de page dans la mesure', !/secret|Dupont|Léa/.test(sortie), sortie.slice(0, 120));
const wf = readFileSync(new URL('../.github/workflows/verifier-servi.yml', import.meta.url), 'utf8');
ok('4a. workflow : à la main seulement, jamais de cron', /workflow_dispatch:/.test(wf) && !/^\s*schedule:/m.test(wf) && !/cron:/.test(wf));
ok('4b. workflow : lit le secret sans l’écrire', /secrets\.APEX_ADMIN_PIN_SHA256/.test(wf) && !/echo[^\n]*APEX_ADMIN_PIN/.test(wf));
/* 5 (Kevin 29.10 : « portrait ET paysage sur tous les appareils, toujours » — minimum iPhone 390x844 et 844x390,
   iPad 820x1180 et 1180x820) : les 5 écrans sont bien ceux mesurés, avec les dimensions exactes demandées. */
ok('5a. iPhone 13 portrait = 390×664 (déjà mesuré, écran partagé ECRANS inchangé)', trouverEcranServi('iphone-13')?.viewport?.width === 390 && trouverEcranServi('iphone-13').viewport.height === 664);
ok('5b. iPhone 13 paysage = 844×390', trouverEcranServi('iphone-13-paysage')?.viewport?.width === 844 && trouverEcranServi('iphone-13-paysage').viewport.height === 390);
ok('5c. iPad portrait = 820×1180', trouverEcranServi('ipad-portrait')?.viewport?.width === 820 && trouverEcranServi('ipad-portrait').viewport.height === 1180);
ok('5d. iPad paysage = 1180×820', trouverEcranServi('ipad-paysage')?.viewport?.width === 1180 && trouverEcranServi('ipad-paysage').viewport.height === 820);
ok('5e. les 5 écrans sont bien ceux parcourus par le robot', NOMS_ECRANS_SERVI.length === 5 && NOMS_ECRANS_SERVI.every((n) => !!trouverEcranServi(n)), NOMS_ECRANS_SERVI.join(','));
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Vérifier le servi : domaine seul, pastille détectée, aucun texte, robot public sans cron'));
process.exit(ko ? 1 : 0);
