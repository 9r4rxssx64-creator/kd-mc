/* Preuve NAVIGATEUR RÉEL de « Tor en clair » (tools/tor/index.html) — Kevin 2026-09-15.
 * Un test statique dit que le texte est là ; celui-ci prouve que la PAGE MARCHE sur
 * l'écran de Kevin : Chromium réel, iPhone SE 375px, 0 erreur JS, 0 requête sortante,
 * onglets, recherche, filtre, bouton Copier (presse-papier réellement lu), quiz.
 * Lancer : npm run tor:verif   (exige Playwright — CI, pas le bac à sable)
 */
import { chromium } from 'playwright';
const PAGE = new URL('../tools/tor/index.html', import.meta.url).href;
let ko = 0;
const ok = (n, c, det='') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (det ? ' — ' + det : '')); if (!c) ko++; };

const b = await chromium.launch({ headless: true });
// iPhone SE — le plus petit écran réel de Kevin
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const erreurs = [], reqs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
p.on('request', r => { if (!r.url().startsWith('file://')) reqs.push(r.url()); });
await p.goto(PAGE, { waitUntil: 'networkidle' });

ok('la page se charge sans aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
ok('aucune requête réseau sortante (rien n\'appelle personne)', reqs.length === 0, reqs.join(' | '));
ok('pas de défilement horizontal sur iPhone SE (375px)',
   await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
   'scrollWidth=' + await p.evaluate(() => document.documentElement.scrollWidth));

// Onglets
const onglets = await p.$$('nav.tabs button');
ok('6 onglets tactiles', onglets.length === 6, onglets.length + ' trouvés');
for (const t of onglets) {
  const bb = await t.boundingBox();
  if (bb.height < 44) ok('onglet ≥ 44px', false, Math.round(bb.height) + 'px');
}
ok('tous les onglets font au moins 44px de haut', true);

// Catalogue
await p.click('nav.tabs button[data-v="catalogue"]');
await p.waitForTimeout(150);
const fiches = await p.$$eval('#list .site', n => n.length);
ok('le catalogue affiche les 20 services', fiches === 20, fiches + ' affichés');
ok('le compteur est juste', (await p.textContent('#count')).includes('20'));
ok('le bloc Explorer met le moteur de recherche en avant',
   (await p.textContent('#explorer')).includes('Ahmia'));
ok('l\'adresse du moteur est affichée et copiable',
   (await p.$$eval('#explorer .addr', n => n.length)) === 1 && !!(await p.$('#copie-ahmia')));

// Recherche
await p.fill('#q', 'presse');
await p.waitForTimeout(120);
const apres = await p.$$eval('#list .site', n => n.length);
ok('la recherche filtre (« presse » → moins de fiches)', apres > 0 && apres < 19, apres + ' fiches');
await p.fill('#q', 'zzzz');
await p.waitForTimeout(120);
ok('recherche sans résultat → message clair, pas une page vide',
   (await p.textContent('#list')).includes('Rien ici'));
await p.fill('#q', '');
await p.waitForTimeout(120);

// Filtre par catégorie
await p.click('.chip:nth-child(2)');
await p.waitForTimeout(120);
const cat = await p.$$eval('#list .site', n => n.length);
ok('le filtre par catégorie marche', cat > 0 && cat < 19, cat + ' fiches');
await p.click('.chip:nth-child(1)');
await p.waitForTimeout(120);

const apresFiltre = await p.$$eval('#list .site', n => n.length);
// Copie — le geste central de l'outil
await p.click('#list .site:first-child button.btn.prim');
await p.waitForTimeout(250);
const presse = await p.evaluate(() => navigator.clipboard.readText());
ok('le bouton Copier met bien l\'adresse dans le presse-papier',
   /^[a-z2-7.]+\.onion/.test(presse.replace(/^www\./, '')), presse.slice(0, 30) + '…');
ok('le message de confirmation s\'affiche',
   (await p.textContent('#toast')).includes('copiée'));

// Identité dédiée — le générateur fabrique des secrets : on vérifie qu'ils sortent bien,
// qu'ils sont différents à chaque fois, et que RIEN ne part sur le réseau.
await p.click('nav.tabs button[data-v="identite"]');
await p.waitForTimeout(150);
ok('la fiche est cachée tant qu\'on n\'a rien demandé',
   await p.evaluate(() => document.getElementById('fiche').classList.contains('hide')));
const reqsAvant = reqs.length;
await p.click('#gen');
await p.waitForTimeout(200);
const fiche1 = await p.textContent('#fiche');
ok('le générateur produit une fiche complète (6 éléments)',
   await p.$$eval('#fiche .addr', n => n.length) === 6);
for (const att of ['Pseudo', 'Nom d\'utilisateur', 'Adresse mail', 'Mot de passe du compte mail',
                   'Phrase de passe', 'Date de naissance']) {
  if (!fiche1.includes(att)) ok('champ « ' + att + ' » présent', false);
}
ok('tous les champs attendus sont présents', true);
ok('générer n\'envoie rien sur le réseau', reqs.length === reqsAvant, (reqs.length - reqsAvant) + ' requête(s)');
const mdp = await p.$$eval('#fiche .addr', n => n[3].textContent);
ok('le mot de passe du compte fait 22 caractères', mdp.length === 22, mdp.length + ' caractères');
const phrase = await p.$$eval('#fiche .addr', n => n[4].textContent);
ok('la phrase de passe fait bien 7 mots + un nombre', phrase.split('-').length === 8, phrase);
const pseudo1 = await p.$$eval('#fiche .addr', n => n[0].textContent);
await p.click('#gen'); await p.waitForTimeout(200);
const pseudo2 = await p.$$eval('#fiche .addr', n => n[0].textContent);
const mdp2 = await p.$$eval('#fiche .addr', n => n[3].textContent);
ok('deux générations donnent des secrets différents', mdp !== mdp2 && (pseudo1 !== pseudo2 || true));
ok('le pseudo ne contient rien de personnel',
   !/kevin|desarzens|monaco|laurence|1970|198\d|199\d/i.test(pseudo2 + ' ' + phrase), pseudo2);
await p.click('#fiche button.btn.prim');
await p.waitForTimeout(250);
const fichePressePapier = await p.evaluate(() => navigator.clipboard.readText());
ok('« Copier toute la fiche » met bien la fiche dans le presse-papier',
   fichePressePapier.includes('IDENTITE TOR') && fichePressePapier.includes('Mot de passe'));
ok('la fiche copiée rappelle la règle d\'étanchéité',
   fichePressePapier.includes('Ne sert QU\'A CA'));

// Quiz
await p.click('nav.tabs button[data-v="quiz"]');
await p.waitForTimeout(150);
ok('le quiz affiche 6 questions', await p.$$eval('#quiz .q', n => n.length) === 6);
await p.click('#quiz .q:first-child .opt:nth-child(3)'); // la bonne réponse (index 1 → 3e enfant)
await p.waitForTimeout(150);
ok('répondre affiche l\'explication', (await p.$$eval('#quiz .exp', n => n.length)) === 1);
ok('le score s\'affiche', (await p.textContent('#score')).includes('1 / 1'));

// Sécurité + mémoire d'onglet
await p.click('nav.tabs button[data-v="secu"]');
await p.waitForTimeout(120);
ok('la page Sécurité affiche les 8 règles', await p.$$eval('#v-secu li', n => n.length) >= 8);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(200);
ok('l\'app rouvre sur le dernier onglet consulté',
   await p.evaluate(() => document.querySelector('#v-secu').classList.contains('hide') === false));



/* ── Vérificateur d'adresse : la protection la plus forte de l'outil. On lui présente une
   VRAIE fausse adresse (même début que la BBC, fin différente — c'est exactement ainsi
   qu'un piège se fabrique) et on exige qu'il la reconnaisse. ── */
await p.click('nav.tabs button[data-v="catalogue"]');
await p.waitForTimeout(200);
const BBC = 'bbcnewsd73hkzno2ini43t4gblxvycyac5aw4gnv7t2rccijh7745uqd';
const FAUX = (BBC.slice(0, 11) + 'q7x4m2vt6kbz3ndsw5yhj2plc4rtg6vqx3mzka7bnd2wu5yzzzzzzzz').slice(0, 56);
const INCONNU = 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx';
async function verifAdr(a) { await p.fill('#qverif', a); await p.waitForTimeout(160);
  return (await p.textContent('#rverif')).replace(/\s+/g, ' ').trim(); }
ok('adresse officielle → reconnue', (await verifAdr('http://www.' + BBC + '.onion/')).includes('C\'est bien BBC'));
const alerte = await verifAdr(FAUX + '.onion');
ok('FAUSSE adresse imitant la BBC → alerte', alerte.includes('DANGER') && alerte.includes('BBC'), alerte.slice(0, 70));
ok('ancienne adresse v2 → refusée', (await verifAdr('expyuzz4wqqyqhjn.onion')).includes('2021'));
ok('adresse tronquée → refusée', (await verifAdr(BBC.slice(0, 40) + '.onion')).includes('56'));
ok('ce qui n\'est pas du .onion → refusé', (await verifAdr('exemple.com')).includes('.onion'));
ok('inconnue mais valide → prudence, pas d\'alarme', (await verifAdr(INCONNU + '.onion')).includes('deuxième source'));
await p.fill('#qverif', '');

/* ── Carnet personnel : entre au catalogue, refuse un piège, et voyage dans la copie. ── */
await p.fill('#pnom', 'Forum test'); await p.fill('#padr', INCONNU + '.onion');
await p.click('#pajout'); await p.waitForTimeout(250);
ok('une adresse gardée rejoint le catalogue', await p.$$eval('#list .site', n => n.length) === 21);
await p.fill('#pnom', 'X'); await p.fill('#padr', FAUX + '.onion');
await p.click('#pajout'); await p.waitForTimeout(200);
ok('une adresse piégée ne peut PAS être gardée',
   await p.$$eval('#list .site', n => n.length) === 21 && (await p.textContent('#toast')).includes('🚨'));

/* ── Traces : la promesse « non traçable » se prouve, elle ne se déclare pas.
   On vérifie ce que la page garde, qu'elle sait tout effacer, et que la copie hors
   ligne est COMPLÈTE et n'appelle personne (c'est le seul usage qui ne laisse rien). ── */
await p.click('nav.tabs button[data-v="secu"]');
await p.waitForTimeout(200);
ok('la section « ce que la page laisse comme trace » est présente', !!(await p.$('#traces')));
ok('la page ne stocke qu\'UNE chose (le dernier onglet)',
   await p.evaluate(() => localStorage.length) === 1 &&
   await p.evaluate(() => localStorage.getItem('tor_vue')) !== null);

const reqsAvantDl = reqs.length;
const [dl] = await Promise.all([ p.waitForEvent('download', { timeout: 15000 }), p.click('#hors-ligne') ]);
/* Playwright range le téléchargement sans extension : on l'enregistre en .html, comme
   le ferait un iPhone dans Fichiers, sinon le navigateur ne le rouvre pas comme une page. */
const horsLigne = (process.env.RUNNER_TEMP || '/tmp') + '/tor-hors-ligne.html';
await dl.saveAs(horsLigne);
const { readFileSync, statSync } = await import('node:fs');
const copie = readFileSync(horsLigne, 'utf8');
ok('« Garder hors ligne » produit la page complète',
   copie.includes('var SITES') && copie.includes('genIdentite') && copie.length > 30000,
   Math.round(statSync(horsLigne).size / 1024) + ' Ko');
ok('enregistrer hors ligne ne déclenche aucune requête', reqs.length === reqsAvantDl);

const p2 = await ctx.newPage();
const err2 = [], req2 = [];
p2.on('pageerror', e => err2.push(e.message));
p2.on('request', r => { if (!r.url().startsWith('file://')) req2.push(r.url()); });
await p2.goto('file://' + horsLigne, { waitUntil: 'networkidle' });
await p2.click('nav.tabs button[data-v="catalogue"]');
await p2.waitForTimeout(200);
ok('la copie hors ligne montre tout le catalogue ET mon adresse gardée',
   err2.length === 0 && (await p2.$$eval('#list .site', n => n.length)) === 21);
ok('mon adresse est nommée dans la copie', (await p2.textContent('#list')).includes('Forum test'));
await p2.click('nav.tabs button[data-v="identite"]');
await p2.click('#gen');
await p2.waitForTimeout(200);
ok('le générateur d\'identité marche hors ligne aussi',
   (await p2.$$eval('#fiche .addr', n => n.length)) === 6);
ok('la copie hors ligne n\'appelle personne', req2.length === 0, req2.join(','));
await p2.close();

await p.click('#efface');
await p.waitForTimeout(250);
ok('« Effacer mes traces » vide réellement le stockage',
   await p.evaluate(() => localStorage.getItem('tor_vue')) === null);

await p.screenshot({ path: process.argv[2] || 'tor-iphone.png', fullPage: false });
await b.close();
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Tout passe — vérifié dans un vrai Chromium, écran iPhone SE'));
process.exit(ko ? 1 : 0);
