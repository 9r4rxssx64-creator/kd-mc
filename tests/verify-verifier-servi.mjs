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
import { adresseSure, mesurerServi, NOMS_ECRANS_SERVI, trouverEcranServi, sansTexte, aCorriger, fermerFeuilleInstalleur, fermerAccueil, ligneServi, nomsParametres, lireVersionSw, mesurerFluidite, mesurerSansFeuille, enAttente, attendreFinSplash, mesurerVuesAdminApexChat, vueAdminACorriger, ouvrirAvecReprise, avecLimite, chaineRedirections, hoteDemande } from '../tools/plateformes/verifier-servi.mjs';
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
/* 2y (7.11, arbre : « déborde 0 » mais « b droite 509 … parent div#aura » nommé) : le corps coupe le débordement (overflow-x hidden) = rien ne dépasse, personne n'est nommé. */
const coupe = await (async () => { const bc = await chromium.launch(exe ? { executablePath: exe } : {}); const pc = await bc.newPage({ viewport: { width: 390, height: 844 } }); await pc.goto(f('coupe.html', '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;overflow-x:hidden"><div id="aura"><b style="position:absolute;left:234px;width:275px;height:20px;display:block">x</b></div><p>court</p></body>')); const r = await pc.evaluate(mesurerServi); await bc.close(); return r; })();
ok('2y. un débordement coupé par le corps de page (overflow-x hidden) ne nomme personne', coupe.debordeur === null, JSON.stringify(coupe.debordeur));
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
  /* 2w (6.11 soir, ia 1280×720) : la bulle de l'app dans un pied de page SOUS l'écran + la bulle du module affichée = UNE seule visible, rien à corriger. */
  const horsEcran = await mes('<!doctype html><body style="margin:0"><div style="height:3000px"></div><footer>pied <span id="v">v9.9.9</span></footer><button id="kdmc-version-badge" style="position:fixed;left:8px;bottom:60px"><span>v9.9.9</span></button></body>', 'hors-ecran.html');
  /* 2x (7.11, arbre) : « Arbre v9.9.9 » dans l'écran du code = une pastille visible ; le numéro seul est rapporté. */
  const prefixe = await mes('<!doctype html><body style="margin:0"><div id="gateVer" style="font-size:12px">Arbre v9.9.9</div></body>', 'prefixe.html');
  /* 2z (7.11, arbre « visibles 0 » sans cause) : aucune visible = chaque texte de version dit pourquoi (ancêtre caché, hors écran, recouvert). */
  const zero = await mes('<!doctype html><body style="margin:0"><div id="gate" style="display:none"><div id="gateVer">Arbre v9.9.9</div></div><div style="height:3000px"></div><span id="ver">v9.9.9</span><span id="bas" style="position:fixed;left:8px;bottom:8px">v9.9.9</span><div id="voile" style="position:fixed;inset:0;background:#000"></div></body>', 'zero.html');
  /* 2aa (7.11, arbre admin : « v3.200 · 411 pers. ») : une pastille FIXE avec un court complément compte ; le même texte dans un paragraphe ordinaire, non. */
  const suffixe = await mes('<!doctype html><body style="margin:0"><div id="ver" style="position:fixed;left:10px;bottom:8px">v9.9.9 · 411 pers.</div><p id="note">v9.9.9 · 411 pers.</p></body>', 'suffixe.html');
  /* 2ac (8.11, javis) : « Bee v9.9.9 ↻ » (mot court + numéro + symbole) compte comme une pastille ; « v9.9.9 bêta » (un mot après) ne compte pas. */
  const symbole = await mes('<!doctype html><body style="margin:0"><button id="javis-ver">Bee v9.9.9 \u21BB</button><p id="texte">v9.9.9 bêta</p></body>', 'symbole.html');
  await bv.close(); return { deux, une, couvert, horsEcran, prefixe, zero, suffixe, symbole }; })();
ok('2v. deux pastilles de version visibles = « à corriger », nommées ; une visible + une cachée = rien', doubles.deux.badgesVisibles === 2 && aCorriger({ badgesVisibles: doubles.deux.badgesVisibles }) && doubles.deux.badgesVisiblesQui.includes('module') && doubles.une.badgesVisibles === 1 && !aCorriger({ badgesVisibles: doubles.une.badgesVisibles }) && doubles.couvert.badgesVisibles === 1, JSON.stringify([doubles.deux.badgesVisibles, doubles.deux.badgesVisiblesQui, doubles.une.badgesVisibles, doubles.couvert.badgesVisibles]));
ok('2w. une pastille de l’app sous la ligne de flottaison + la bulle du module = une seule visible, rien à corriger', doubles.horsEcran.badgesVisibles === 1 && doubles.horsEcran.badgesVisiblesQui[0] === 'module' && !aCorriger({ badgesVisibles: doubles.horsEcran.badgesVisibles }), JSON.stringify([doubles.horsEcran.badgesVisibles, doubles.horsEcran.badgesVisiblesQui]));
ok('2x. « Arbre v9.9.9 » (mot court + numéro) compte comme une pastille visible, numéro seul rapporté', doubles.prefixe.badgesVisibles === 1 && doubles.prefixe.badges[0] === 'v9.9.9' && doubles.prefixe.badgesVisiblesQui[0] === '#gateVer', JSON.stringify([doubles.prefixe.badgesVisibles, doubles.prefixe.badges, doubles.prefixe.badgesVisiblesQui]));
ok('2z. « visibles 0 » nomme la cause de chaque pastille : ancêtre caché, hors écran, recouverte', doubles.zero.badgesVisibles === 0 && (doubles.zero.badgesCaches || []).length === 3 && /#gateVer : div#gate display none/.test(doubles.zero.badgesCaches[0]) && /#ver : hors écran/.test(doubles.zero.badgesCaches[1]) && /#bas : sous div#voile/.test(doubles.zero.badgesCaches[2]) && (doubles.prefixe.badgesCaches || []).length === 0, JSON.stringify(doubles.zero.badgesCaches));
ok('2aa. une pastille fixe « v9.9.9 · 411 pers. » compte (numéro seul rapporté) ; le même texte dans un paragraphe ne compte pas', doubles.suffixe.badgesVisibles === 1 && doubles.suffixe.badgesVisiblesQui[0] === '#ver' && doubles.suffixe.badges.length === 1 && doubles.suffixe.badges[0] === 'v9.9.9', JSON.stringify([doubles.suffixe.badgesVisibles, doubles.suffixe.badgesVisiblesQui, doubles.suffixe.badges]));
ok('2ac. « Bee v9.9.9 ↻ » compte comme une pastille (numéro seul rapporté) ; « v9.9.9 bêta » ne compte pas', doubles.symbole.badgesVisibles === 1 && doubles.symbole.badgesVisiblesQui[0] === '#javis-ver' && doubles.symbole.badges.length === 1 && doubles.symbole.badges[0] === 'v9.9.9', JSON.stringify([doubles.symbole.badgesVisibles, doubles.symbole.badgesVisiblesQui, doubles.symbole.badges]));
ok('2i. l’exemple ne garde aucun texte de page', ex.length > 0 && !/secret|Dupont|Léa|Acheter/.test(JSON.stringify(ex)), JSON.stringify(ex));
/* 2j (6.11) : la feuille « Installer » du domaine (ouverte d'office pour un compte neuf) n'est pas un défaut de la page : le robot la ferme par ✕ et mesure ensuite. */
const feuille = await (async () => { const b6 = await chromium.launch(exe ? { executablePath: exe } : {}); const p6 = await b6.newPage({ viewport: { width: 390, height: 844 } });
  await p6.goto(f('feuille.html', '<!doctype html><body style="margin:0"><a id="acheter" href="#" style="display:block;width:200px;height:44px;margin:300px 20px">Acheter</a><div id="fond" style="position:fixed;inset:0;z-index:2147482500"></div><div data-kdmc-installer="feuille" style="position:fixed;left:0;right:0;bottom:0;height:200px;z-index:2147482600"><button aria-label="Fermer" type="button">✕</button></div><script>document.querySelector(\'[aria-label=Fermer]\').onclick=function(){document.getElementById("fond").remove();document.querySelector("[data-kdmc-installer]").remove();}</script></body>'));
  const avant = (await p6.evaluate(mesurer, true)).cache; const ferme = await p6.evaluate(fermerFeuilleInstalleur); const apres = (await p6.evaluate(mesurer, true)).cache; await b6.close(); return { avant, ferme, apres }; })();
ok('2j. la feuille « Installer » du domaine est fermée avant la mesure (elle couvrait la page)', feuille.avant > 0 && feuille.ferme === true && feuille.apres === 0, JSON.stringify(feuille));
/* 2ab (8.11, cmcteams : écran de bienvenue v10 voulu, pont 1891) : un écran plein cadre avec un bouton « Plus tard » est fermé avant la mesure ; une petite boîte ou une page sans accueil ne l'est pas. */
const accueil = await (async () => { const b8 = await chromium.launch(exe ? { executablePath: exe } : {}); const p8 = await b8.newPage({ viewport: { width: 390, height: 844 } });
  await p8.goto(f('accueil.html', '<!doctype html><body style="margin:0"><a id="acheter" href="#" style="display:block;width:200px;height:44px;margin:300px 20px">Acheter</a><div id="cmcV10Welcome" style="position:fixed;inset:0;z-index:10001;background:#222"><h2>Bienvenue</h2><button id="later" onclick="document.getElementById(\'cmcV10Welcome\').remove()">Plus tard</button></div><div id="petite" style="position:fixed;left:10px;bottom:10px;width:200px;height:60px"><button>Fermer</button></div></body>'));
  const avant = (await p8.evaluate(mesurer, true)).cache; const ferme = await p8.evaluate(fermerAccueil); await p8.waitForTimeout(100); const apres = (await p8.evaluate(mesurer, true)).cache; const encore = await p8.evaluate(fermerAccueil); await b8.close(); return { avant, ferme, apres, encore }; })();
ok('2ab. un écran d’accueil plein cadre (« Plus tard ») est fermé avant la mesure ; une petite boîte « Fermer » ne compte pas', accueil.avant > 0 && accueil.ferme === '#cmcV10Welcome' && accueil.apres === 0 && accueil.encore === '', JSON.stringify(accueil));
/* 2ad (8.11) : la ligne du journal nomme les cibles < 44 px, la cause d'un « visibles 0 » et l'accueil fermé. */
const ligne = ligneServi('https://x.kd-mc.com/', 'portable', { statut: 200, hoteFinal: 'x.kd-mc.com', sw: 'x-v1', badges: ['v1'], badgesVisibles: 0, badgesCaches: ['#ver : div#gate display none'], accueil: '#cmcV10Welcome', cache: 0, haut: 0, deborde: 0, petit: 2, petitEx: ['button#a', 'a.b'], fps: 60 });
ok('2ad. le journal nomme les cibles < 44 px, la cause du « visibles 0 » et l’accueil fermé', /petit 2 \[button#a \| a\.b\]/.test(ligne) && /visibles 0 \[#ver : div#gate display none\]/.test(ligne) && /accueil fermé #cmcV10Welcome/.test(ligne) && !/petit 0 \[/.test(ligneServi('u', 'e', { petit: 0, petitEx: [] })), ligne.slice(0, 160));
/* 2ag (12.11, cloud-poste-recherche 2361 : cuisine/cocina/cujina « cache 7 » = la COUVERTURE du livre, voulue, avec un bouton « Ouvrir le livre ») : ce bouton ouvre l'écran d'entrée avant la mesure. */
const livre = await (async () => { const b9 = await chromium.launch(exe ? { executablePath: exe } : {}); const p9 = await b9.newPage({ viewport: { width: 390, height: 844 } });
  await p9.goto(f('livre.html', '<!doctype html><body style="margin:0"><input class="ui" style="display:block;width:300px;height:44px;margin:300px 20px"><div id="cover" style="position:fixed;inset:0;z-index:60;background:#420"><div class="sub">A Cüjina</div><button class="enter" onclick="document.getElementById(\'cover\').remove()">Ouvrir le livre</button></div></body>'));
  const avant = (await p9.evaluate(mesurer, true)).cache; const ferme = await p9.evaluate(fermerAccueil); await p9.waitForTimeout(100); const apres = (await p9.evaluate(mesurer, true)).cache; await b9.close(); return { avant, ferme, apres }; })();
ok('2ag. la couverture d’un livre (« Ouvrir le livre ») est ouverte avant la mesure', livre.avant > 0 && livre.ferme === '#cover' && livre.apres === 0, JSON.stringify(livre));
/* 2ae (8.11, CMCteams iPhone) : une bannière de consentement fixe en bas (3 boutons dont « J'ai compris ») est fermée par son bouton d'accord. */
const cookies = await (async () => { const b9 = await chromium.launch(exe ? { executablePath: exe } : {}); const p9 = await b9.newPage({ viewport: { width: 390, height: 844 } });
  await p9.goto(f('cookies.html', '<!doctype html><body style="margin:0"><button id="bas" style="position:absolute;top:760px;left:12px;width:200px;height:44px">Pointer</button><div id="cmc-cookie-banner" role="dialog" style="position:fixed;left:8px;right:8px;bottom:8px;height:143px;z-index:99999;background:#111"><span>Infos</span><button onclick="window.open(\'cgu.html\')">CGU</button><button onclick="window.open(\'privacy.html\')">Confidentialité</button><button id="okc" onclick="document.getElementById(\'cmc-cookie-banner\').remove()">J\'ai compris</button></div></body>'));
  const avant = (await p9.evaluate(mesurer, true)).cache; const ferme = await p9.evaluate(fermerAccueil); await p9.waitForTimeout(100); const apres = (await p9.evaluate(mesurer, true)).cache; const pages = p9.context().pages().length; await b9.close(); return { avant, ferme, apres, pages }; })();
ok('2ae. une bannière cookies fixe est fermée par son bouton d’accord (pas par CGU / Confidentialité)', cookies.avant > 0 && cookies.ferme === '#cmc-cookie-banner' && cookies.apres === 0 && cookies.pages === 1, JSON.stringify(cookies));
/* 2j2 (6.11, Servi 42313704615) : la feuille « Installer » s'ouvre TARD (après les fermetures du robot, pendant la mesure) : on remesure après l'avoir refermée.
   SABOTAGE=feuille-tardive : l'ancienne mesure unique → « cache » > 0 → rouge. */
const tardive = await (async () => { const b7 = await chromium.launch(exe ? { executablePath: exe } : {}); const p7 = await b7.newPage({ viewport: { width: 390, height: 844 } });
  await p7.goto(f('feuille-tardive.html', '<!doctype html><body style="margin:0"><a id="acheter" href="#" style="display:block;width:200px;height:44px;margin:300px 20px">Acheter</a><script>setTimeout(function(){var d=document.createElement("div");d.id="fond";d.style.cssText="position:fixed;inset:0;z-index:2147482500";var s=document.createElement("div");s.setAttribute("data-kdmc-installer","feuille");s.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147482600;height:50px";var x=document.createElement("button");x.setAttribute("aria-label","Fermer");x.textContent="x";x.onclick=function(){d.remove();s.remove()};s.appendChild(x);document.body.appendChild(d);document.body.appendChild(s)},300)</script>'));
  await p7.waitForTimeout(700);
  const m = process.env.SABOTAGE === 'feuille-tardive' ? await p7.evaluate(mesurer, true) : await mesurerSansFeuille(p7, true, {}); await b7.close(); return m; })();
/* 2af (8.11, CMCteams : bannière cookies à DOMContentLoaded + 3 s) : une bannière de consentement qui s'ouvre PENDANT la mesure est refermée puis la page remesurée, et l'accueil fermé est noté. */
const banniereTardive = await (async () => { const b10 = await chromium.launch(exe ? { executablePath: exe } : {}); const p10 = await b10.newPage({ viewport: { width: 390, height: 844 } });
  await p10.goto(f('banniere-tardive.html', '<!doctype html><body style="margin:0"><button id="bas" style="position:absolute;top:760px;left:12px;width:200px;height:44px">Pointer</button><script>setTimeout(function(){var d=document.createElement("div");d.id="cmc-cookie-banner";d.style.cssText="position:fixed;left:8px;right:8px;bottom:8px;height:143px;z-index:99999;background:#111";d.innerHTML=\'<button>CGU</button><button id="okc">Compris</button>\';d.querySelector("#okc").onclick=function(){d.remove()};document.body.appendChild(d);},600);</script></body>'));
  await p10.waitForTimeout(700); const r = {}; const m = await mesurerSansFeuille(p10, true, r); await b10.close(); return { cache: m && m.cache, accueil: r.accueil }; })();
ok('2af. une bannière de consentement ouverte pendant la mesure est refermée puis la page remesurée', banniereTardive.cache === 0 && banniereTardive.accueil === '#cmc-cookie-banner', JSON.stringify(banniereTardive));
ok('2j2. une feuille « Installer » ouverte pendant la mesure est refermée puis la page remesurée', tardive && tardive.cache === 0, JSON.stringify(tardive && tardive.cache));
/* 2j3 (7.11, cloud-installer pont 1929) : un contrôle recouvert est livré avec ses RECTANGLES (nombres seulement) : on voit où il est et ce qui le cache, sans deviner. */
const rect = await (async () => { const b8 = await chromium.launch(exe ? { executablePath: exe } : {}); const p8 = await b8.newPage({ viewport: { width: 390, height: 844 } });
  await p8.goto(f('rect.html', '<!doctype html><body style="margin:0"><a id="acheter" href="#" style="display:block;width:200px;height:44px;margin:300px 20px">Acheter</a><div id="fond" style="position:fixed;inset:0;z-index:99"></div>'));
  const m = await p8.evaluate(mesurer, true); await b8.close(); return sansTexte(m.cacheEx)[0] || ''; })();
ok('2j3. un contrôle recouvert est livré avec ses rectangles (x,y largeurxhauteur), sans texte', /\[@\d+,\d+ \d+x\d+ sous @\d+,\d+ \d+x\d+\]/.test(rect) && !/Acheter/.test(rect), rect);
/* 2j4 (7.11) : un délai dépassé dit QUELLES requêtes n'avaient pas fini (hôte + chemin, jamais les paramètres). */
const attente = (() => { const q = (u) => ({ url: () => u }); const m = new Map([[q('https://apex-ai.kd-mc.com/assets/gros.js?token=SECRET'), 1000], [q('https://fonts.example.org/css'), 5000]]); return enAttente(m, 31000); })();
ok('2j4. un délai dépassé liste les requêtes en attente (hôte + chemin + secondes), sans paramètres', /apex-ai\.kd-mc\.com\/assets\/gros\.js 30s \| fonts\.example\.org\/css 26s/.test(attente) && !/SECRET|token/.test(attente), attente);
/* 2j5 (7.11) : l'écran de démarrage est attendu (et chronométré) avant la mesure ; une page sans écran de démarrage rend null ; un écran qui ne part jamais rend « toujours ». */
const splash = await (async () => { const b9 = await chromium.launch(exe ? { executablePath: exe } : {}); const p9 = await b9.newPage({ viewport: { width: 390, height: 844 } });
  await p9.goto(f('splash-court.html', '<!doctype html><body><div class="apex-splash-logo" style="width:100px;height:100px">A</div><script>setTimeout(function(){document.querySelector(".apex-splash-logo").remove()},1200)</script>'));
  const court = await attendreFinSplash(p9, 6000);
  await p9.goto(f('sans-splash.html', '<!doctype html><body><p>app</p>')); const aucun = await attendreFinSplash(p9, 3000);
  await p9.goto(f('splash-long.html', '<!doctype html><body><div class="apex-splash-logo" style="width:100px;height:100px">A</div>')); const long = await attendreFinSplash(p9, 1500);
  await b9.close(); return { court, aucun, long }; })();
ok('2j5. l\'écran de démarrage est attendu et chronométré (1,2 s → ~1 s), absent → null, éternel → « toujours »', typeof splash.court === 'number' && splash.court >= 0.5 && splash.court < 3 && splash.aucun === null && splash.long === 'toujours', JSON.stringify(splash));
/* 2j6 (7.11) : les écrans d'administration d'Apex Chat sont affichés (K.sv) puis mesurés ; un bouton de 20 px, une vue qui ne s'affiche pas et un compte non admin sont dits. */
const adminVues = await (async () => { const b10 = await chromium.launch(exe ? { executablePath: exe } : {}); const p10 = await b10.newPage({ viewport: { width: 390, height: 664 } });
  const faux = (role) => '<!doctype html><body><div id="app"></div><script>window.K={user:' + (role === 'admin' ? '{is_admin:true}' : role === 'user' ? '{is_admin:false}' : 'null') + ',view:"chats",sv:function(v){if(v==="admin-absente"){return}K.view=v;document.getElementById("app").innerHTML=v==="admin-petit"?\'<button style="width:20px;height:20px">x</button>\':\'<button style="width:200px;height:48px">ok</button>\'}}</script>';
  await p10.goto(f('admin-oui.html', faux('admin'))); const oui = await mesurerVuesAdminApexChat(p10, true, ['admin-ok', 'admin-petit', 'admin-absente'], 200);
  await p10.goto(f('admin-non.html', faux('user'))); const non = await mesurerVuesAdminApexChat(p10, true, ['admin-ok'], 200);
  await p10.goto(f('admin-aucun.html', faux('x').replace('{is_admin:false}', 'null'))); const aucun = await mesurerVuesAdminApexChat(p10, true, ['admin-ok'], 200);
  await b10.close(); return { oui, non, aucun }; })();
const [vOk, vPetit, vAbs] = adminVues.oui.vues;
ok('2j6. vues admin : mesurées (ok propre, bouton 20 px signalé, vue non affichée signalée) ; compte non admin → rien à mesurer', adminVues.oui.admin === true && vueAdminACorriger(vOk) === false && vPetit.petit >= 1 && vueAdminACorriger(vPetit) && vAbs.affichee === false && vueAdminACorriger(vAbs) && adminVues.non.admin === false && adminVues.non.vues.length === 0 && adminVues.non.role === 'utilisateur' && adminVues.aucun.role.startsWith('sans compte'), JSON.stringify({ vOk: vOk.petit, vPetit: vPetit.petit, vAbs: vAbs.affichee, non: adminVues.non.role, aucun: adminVues.aucun.role }));
/* 2j7 (7.11) : un délai dépassé ponctuel est rejoué UNE fois (et dit quelles requêtes bloquaient) ; deux délais de suite restent une erreur ; une autre erreur n'est pas rejouée. */
const reprise = await (async () => {
  const q = (u) => ({ url: () => u });
  let n = 0; const r1 = {}; const m1 = new Map([[q('https://javis.kd-mc.com/javis-widget.js?x=1'), Date.now() - 29000]]);
  const ok1 = await ouvrirAvecReprise({}, 'https://x', r1, m1, async () => { n++; if (n === 1) throw new Error('page.goto: Timeout 30000ms exceeded.'); return 'ok'; });
  let n2 = 0; let deux = null; try { await ouvrirAvecReprise({}, 'https://x', {}, new Map(), async () => { n2++; throw new Error('page.goto: Timeout 30000ms exceeded.'); }); } catch (e) { deux = n2; }
  let n3 = 0; try { await ouvrirAvecReprise({}, 'https://x', {}, new Map(), async () => { n3++; throw new Error('net::ERR_NAME_NOT_RESOLVED'); }); } catch (e) { /* attendu */ }
  return { ok1, n, r1: r1.reprise, deux, n3 };
})();
ok('2j7. un délai dépassé est rejoué une fois (dit les requêtes), deux de suite = erreur, autre erreur = pas rejoué', reprise.ok1 === 'ok' && reprise.n === 2 && /reprise après délai · en attente : javis\.kd-mc\.com\/javis-widget\.js/.test(reprise.r1) && !/x=1/.test(reprise.r1) && reprise.deux === 2 && reprise.n3 === 1, JSON.stringify(reprise));
/* 2j8 (8.11, pont-check 2104) : (a) une adresse qui ne finit pas est coupée au bout du délai et ne bloque pas la suivante ; (b) l'hôte final différent de l'hôte demandé est écrit avec la chaîne de redirections (hôte + chemin, sans paramètres). */
const limite = await (async () => {
  const t0 = Date.now(); let coupe = null; try { await avecLimite(() => new Promise(() => {}), 80); } catch (e) { coupe = String(e.message); }
  const rapide = await avecLimite(async () => 'fini', 500);
  const rep = { request: () => ({ url: () => 'https://kd-mc.com/?return=x&connexion=1', redirectedFrom: () => ({ url: () => 'https://apex-chat.kd-mc.com/', redirectedFrom: () => null }) }) };
  return { coupe, rapide, ms: Date.now() - t0, chaine: chaineRedirections(rep), dem: hoteDemande('https://apex-chat.kd-mc.com/'), dem2: hoteDemande('apex-chat.kd-mc.com') };
})();
const ligneRedir = ligneServi('https://apex-chat.kd-mc.com/', 'portable', { statut: 200, hoteFinal: 'kd-mc.com', redirige: 'apex-chat.kd-mc.com', chaine: limite.chaine });
const ligneDirecte = ligneServi('https://apex-chat.kd-mc.com/', 'iphone-13', { statut: 200, hoteFinal: 'apex-chat.kd-mc.com' });
ok('2j8. adresse bloquée coupée au délai ; redirection écrite avec sa chaîne (sans paramètres) ; pas de mention quand l\'hôte est celui demandé', /délai dépassé pour cette adresse/.test(limite.coupe || '') && limite.rapide === 'fini' && limite.ms < 3000 && limite.chaine === 'apex-chat.kd-mc.com/ → kd-mc.com/' && limite.dem === 'apex-chat.kd-mc.com' && limite.dem2 === 'apex-chat.kd-mc.com' && /REDIRIGÉ \(demandé apex-chat\.kd-mc\.com · chaîne : apex-chat\.kd-mc\.com\/ → kd-mc\.com\/\)/.test(ligneRedir) && !/REDIRIGÉ/.test(ligneDirecte) && !/return=/.test(ligneRedir), JSON.stringify(limite));
/* 2j9 (12.11, apex-cloud 2139) : la ligne REDIRIGÉ porte les NOMS des paramètres de l'URL finale (return, _ssob), jamais les valeurs ; « à défiler N » nomme les contrôles sous le pli (pont 2125). */
{ const noms = nomsParametres('https://kd-mc.com/?return=https%3A%2F%2Fapex-chat.kd-mc.com%2F&_ssob=abc&return=y');
  const l = ligneServi('https://apex-chat.kd-mc.com/', 'portable', { statut: 200, hoteFinal: 'kd-mc.com', redirige: 'apex-chat.kd-mc.com', chaine: 'apex-chat.kd-mc.com/ → kd-mc.com/', parametres: noms, cache: 0, aDefiler: 1, aDefilerEx: ['button#bas (sous div#barre au repos)'] });
  ok('2j9. REDIRIGÉ nomme les paramètres (noms seuls, dédoublonnés) ; « à défiler » nommé dans la ligne', noms.join(',') === 'return,_ssob' && nomsParametres('pas une url').length === 0 && /paramètres : return, _ssob\)/.test(l) && !/abc|apex-chat\.kd-mc\.com%2F/.test(l) && /· à défiler 1 \[button#bas \(sous div#barre au repos\)\]/.test(l), l.slice(-260)); }
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
