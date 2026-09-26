/* PREUVE — Lingua s'ouvre et se laisse UTILISER, du premier écran au bouton d'écoute.
 * ===========================================================================
 * POURQUOI CE TEST EXISTE (panne réelle, message m051 du 6.09) :
 * la « Vérif RÉELLE » lancée sur le VRAI domaine avait 27 surfaces vertes et
 * **une seule rouge** — `https://lingua.kd-mc.com/` :
 *     deep: exception deep: TimeoutError: page.fill: Timeout 30000ms exceeded
 * La page ne se montait pas assez pour qu'on puisse seulement REMPLIR un champ.
 * Un élève tombait sur une page **vide**, sans message, sans erreur visible —
 * la panne la plus pénible : celle qui ne fait aucun bruit.
 *
 * CAUSE, mesurée le 10.09 : `unitDone()` lit `S.prog[S.course]["u0-0"]`. Quand la
 * progression du cours manque, la lecture se fait sur `undefined`, l'erreur
 * remonte au démarrage, et l'app rend **2 boutons au lieu de 607**. Corrigé à la
 * racine dans `loadS()` (la clé est recréée VIDE — aucune progression inventée).
 *
 * CE QUE CE TEST GARDE, et que les autres ne gardaient pas : le PARCOURS. Les
 * tests existants partent d'un compte déjà fabriqué en mémoire ; ils ne
 * passaient donc jamais par l'écran d'arrivée, la création de compte, ni le
 * choix de la langue — exactement les trois étapes cassées en production.
 *
 * Lancer : node tests/verify-lingua-parcours.mjs
 */
import { chromium } from 'playwright';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PAGE = 'file://' + process.cwd() + '/lingua/index.html';

const nav = await chromium.launch();
const erreurs = [];

/* ---------- 1. le parcours d'un nouvel élève, de bout en bout -------------- */
{
  const page = await nav.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(PAGE);

  /* arrivée : l'écran doit exister, pas une page blanche */
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((b) => /Nouveau compte/i.test(b.textContent)), null, { timeout: 15000 })
    .catch(() => {});
  const arrivee = await page.evaluate(() => (document.body.innerText || '').trim().length);
  chk(arrivee > 20, `1. l'écran d'arrivée s'affiche (${arrivee} caractères — une page blanche en ferait ~0)`);

  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((b) => /Nouveau compte/i.test(b.textContent)).click());

  /* LE geste qui expirait en production */
  let remplissable = true;
  try {
    await page.waitForSelector('#acPrenom', { timeout: 8000 });
    await page.fill('#acPrenom', 'Kevin');
    await page.fill('#acNom', 'Desarzens');
    await page.fill('#acCode', '200807');
  } catch (e) { remplissable = false; }
  chk(remplissable, '2. on peut REMPLIR les champs — c\'est ce geste précis qui expirait sur le vrai domaine (m051)');

  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((b) => /Créer mon compte|Commencer|C.est parti/i.test(b.textContent))?.click());
  await page.waitForTimeout(2000);

  /* choix de la langue puis vrai écran de cours */
  const aLangue = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Anglais|English/i.test(x.textContent));
    if (b) { b.click(); return true; } return false;
  });
  chk(aLangue, '3. on arrive à l\'écran « choisis une langue »');
  await page.waitForTimeout(2500);

  const n = await page.evaluate(() => document.querySelectorAll('button').length);
  chk(n > 100, `4. le cours s'affiche vraiment (${n} boutons — l'app cassée en rendait 2)`);
  chk(await page.evaluate(() => !!document.querySelector('.pod-say')),
    '5. le bouton d\'écoute 🔊 de la phrase du jour est là');
  await page.close();
}

/* ---------- 2. le cas EXACT de la panne : cours choisi, progression perdue -- */
/* Il suffit qu'un navigateur vide une partie du stockage, ou qu'une sauvegarde
   restaurée d'avant une mise à jour n'ait pas cette clé. */
for (const cours of ['en', 'es', 'it', 'de', 'mc']) {
  const page = await nav.newPage();
  page.on('pageerror', (e) => erreurs.push(`[${cours}] ${e.message}`));
  await page.addInitScript((c) => {
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Kevin Desarzens', avatar: '🐝', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('a1'));
    localStorage.setItem('lingua_a_a1_course', JSON.stringify(c));
    /* AUCUNE clé de progression : c'est tout le sujet */
  }, cours);
  await page.goto(PAGE);
  await page.waitForTimeout(2000);
  const n = await page.evaluate(() => document.querySelectorAll('button').length);
  chk(n > 100, `6. cours « ${cours} » sans progression → l'app s'ouvre quand même (${n} boutons)`);
  await page.close();
}

chk(erreurs.length === 0,
  `7. aucune erreur JavaScript sur tout le parcours${erreurs.length ? ' — ' + erreurs[0].slice(0, 110) : ''}`);

await nav.close();
R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
