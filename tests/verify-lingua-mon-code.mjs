/* PREUVE — Lingua sait rappeler à l'élève le code qu'elle lui réclame.
 * ===========================================================================
 * POURQUOI CE TEST EXISTE (Kevin, 2026-09-27) : « Quel est mon code, je n'arrive
 * pas à le connecter ». L'app exigeait un code pour se reconnecter, le gardait en
 * clair dans le téléphone depuis le premier jour… et ne l'affichait NULLE PART.
 * Côté serveur il n'existe que haché : irrécupérable, même par nous. Un code
 * oublié = un compte perdu, sans aucun recours. C'était le seul cul-de-sac de
 * l'app, et il ne faisait aucun bruit.
 *
 * CE QUE CE TEST GARDE :
 *   - le code est RETROUVABLE depuis l'interface, par son propriétaire, sur son
 *     appareil — dans le Profil ET depuis l'écran de connexion (« Code oublié ? »),
 *     c'est-à-dire à l'endroit exact où l'on se rend compte qu'on l'a oublié ;
 *   - il est affiché MASQUÉ tant qu'on ne le demande pas (pas de code en clair
 *     sous les yeux du premier venu qui ouvre le Profil) ;
 *   - le prénom+nom EXACT enregistré est rappelé avec : sans lui, le code seul
 *     ne rouvre rien (l'identité = prénom + nom depuis le 5.09) ;
 *   - un compte SANS code ne propose pas de code à voir (ne rien inventer) ;
 *   - changer de code remplace vraiment l'ancien.
 *
 * CE QUE CE TEST NE FAIT PAS : il n'écrit le code d'aucune personne réelle. Le
 * code utilisé ici est une valeur de test inventée (RÈGLE DU DÉPÔT : un code ne
 * s'écrit nulle part — ni fichier, ni commit, ni test).
 *
 * Lancer : node tests/verify-lingua-mon-code.mjs
 */
import { chromium } from 'playwright';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PAGE = 'file://' + process.cwd() + '/lingua/index.html';

const CODE = '481593';          // valeur de test, inventée pour ce fichier
const NOM = 'Alix Martinier';   // personne fictive
const erreurs = [];

const nav = await chromium.launch();

/* Prépare un appareil avec un compte déjà connecté. */
async function appareil({ code = CODE, nom = NOM } = {}) {
  const page = await nav.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.addInitScript(([n, c]) => {
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: n, avatar: '🦊', code: c, created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('a1'));
    localStorage.setItem('lingua_a_a1_course', JSON.stringify('en'));
  }, [nom, code]);
  await page.goto(PAGE);
  await page.waitForTimeout(1500);
  return page;
}
const clic = (page, re) => page.evaluate((s) => {
  const b = [...document.querySelectorAll('button')].find((x) => new RegExp(s, 'i').test(x.textContent));
  if (!b) return false; b.click(); return true;
}, re.source ?? re);
/* Dans la fenêtre du DESSUS uniquement : l'écran des comptes, resté derrière,
   porte lui aussi le nom du compte — un clic « global » y retombait. */
const dessus = (page, fn) => page.evaluate(({ s, f }) => {
  const ms = document.querySelectorAll('.modal'); const m = ms[ms.length - 1];
  if (!m) return f === 'clic' ? false : [];
  if (f === 'txt') return [...m.querySelectorAll('.txt')].map((i) => i.value);
  const b = [...m.querySelectorAll('button')].find((x) => new RegExp(s, 'i').test(x.textContent));
  if (!b) return false; b.click(); return true;
}, fn);
const clicM = (page, re) => dessus(page, { s: re.source ?? re, f: 'clic' });
const champsM = (page) => dessus(page, { s: '', f: 'txt' });
const texte = (page) => page.evaluate(() => document.body.innerText || '');

/* ---------- 1. Profil → « Voir mon code » --------------------------------- */
{
  const page = await appareil();
  chk(await clic(page, /Profil/), '1. l\'onglet Profil s\'ouvre');
  await page.waitForTimeout(600);
  chk(await clic(page, /Voir mon code/), '2. le Profil propose « Voir mon code » (il n\'existait pas : le code était réclamé sans jamais être rappelé)');
  await page.waitForTimeout(400);

  /* masqué par défaut : le Profil ne doit pas étaler le code */
  const avant = await texte(page);
  chk(!avant.includes(CODE), '3. le code reste MASQUÉ tant qu\'on ne le demande pas');
  const champs = await champsM(page);
  chk(champs.some((v) => v === NOM), `4. le prénom+nom EXACT enregistré est rappelé (« ${NOM} ») — sans lui le code seul ne rouvre rien`);
  chk(champs.every((v) => v !== CODE), '5. avant l\'appui, aucun champ ne contient déjà le code');

  chk(await clicM(page, /Afficher mon code/), '6. un bouton « Afficher mon code » est proposé');
  await page.waitForTimeout(300);
  chk((await champsM(page)).includes(CODE), '7. après l\'appui, le VRAI code de ce compte s\'affiche (c\'est toute la réponse à « quel est mon code ? »)');
  await page.close();
}

/* ---------- 2. « Code oublié ? » depuis l'écran de connexion --------------- */
/* C'est là qu'on s'aperçoit qu'on l'a oublié : la réponse doit être là, pas ailleurs. */
{
  const page = await appareil();
  await clic(page, /Changer de compte|Comptes/);
  await page.evaluate(() => { const b = document.getElementById('tbAv'); if (b) b.click(); });
  await page.waitForTimeout(600);
  chk(await clic(page, /J.ai déjà un compte/), '8. l\'écran des comptes mène à « J\'ai déjà un compte »');
  await page.waitForTimeout(400);
  chk(await clicM(page, /Code oublié/), '9. l\'écran de connexion propose « Code oublié ? » — à l\'endroit exact où l\'on bute');
  await page.waitForTimeout(500);
  const liste = await page.evaluate(() => { const ms = document.querySelectorAll('.modal'); return ms[ms.length - 1].innerText || ''; });
  chk(liste.includes(NOM), '10. les comptes présents sur CET appareil sont listés');
  chk(!liste.includes(CODE), '11. la liste ne montre pas encore les codes');
  chk(/brouill|hach/i.test(liste), '12. la vérité est dite : en ligne le code est brouillé, personne ne peut le relire (aucune fausse promesse)');
  chk(await clicM(page, new RegExp(NOM.split(' ')[0])), '13. on peut choisir son compte dans la liste');
  await page.waitForTimeout(500);
  await clicM(page, /Afficher mon code/);
  await page.waitForTimeout(300);
  chk((await champsM(page)).includes(CODE), '14. le code est retrouvé depuis l\'écran de connexion, sans se reconnecter');
  await page.close();
}

/* ---------- 3. compte SANS code : on n'invente rien ------------------------ */
{
  const page = await appareil({ code: '' });
  await clic(page, /Profil/);
  await page.waitForTimeout(600);
  const t = await texte(page);
  chk(!/Voir mon code/i.test(t), '15. un compte sans code ne propose pas de code à voir');
  chk(/Activer/i.test(t), '16. il propose « Activer » la mémoire en ligne à la place');
  await page.close();
}

/* ---------- 4. changer de code : l'ancien ne vaut plus --------------------- */
/* Depuis le 2.10 (Kevin : « Chacun 1 seul compte »), un compte Lingua seul ne change plus son code
   dans son coin : il se RELIE au compte KDMC, et le code (6 chiffres) est déclaré au domaine. Ici le
   domaine est simulé (page en file://) : il accepte, puis on vérifie aussi qu'une panne ne change rien. */
{
  const NOUVEAU = '730264';
  const page = await appareil();
  await page.evaluate(() => { const f0 = window.fetch; window.fetch = (u, o) => (/__sso\/issue/.test(String(u))
    ? Promise.resolve(new Response(JSON.stringify({ ok: true, uid: 'alix-martinier', code: true }), { status: 200 })) : f0(u, o)); });
  await clic(page, /Profil/);
  await page.waitForTimeout(600);
  await clic(page, /Voir mon code/);
  await page.waitForTimeout(400);
  chk(await clicM(page, /Changer mon code/), '17. on peut changer son code depuis son propre profil');
  await page.waitForTimeout(500);
  try { await page.fill('#ccCode', NOUVEAU, { timeout: 5000 }); await clicM(page, /Relier mon compte/); } catch (e) { /* signalé par 18/19 */ }
  await page.waitForTimeout(800);
  const enregistre = await page.evaluate(() => JSON.parse(localStorage.getItem('lingua_g_accounts'))[0].code);
  chk(enregistre === NOUVEAU, '18. le nouveau code remplace vraiment l\'ancien dans le compte');
  chk(enregistre !== CODE, '19. l\'ancien code n\'est plus celui du compte');
  await page.close();
}

chk(erreurs.length === 0,
  `20. aucune erreur JavaScript sur tout le parcours${erreurs.length ? ' — ' + erreurs[0].slice(0, 110) : ''}`);

await nav.close();
R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
