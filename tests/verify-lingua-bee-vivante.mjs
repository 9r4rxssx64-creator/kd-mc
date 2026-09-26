/* GARDE EN VRAI NAVIGATEUR — Bee est VIVANTE dans Lingua (pas seulement dans le widget).
 *
 * Les trois améliorations remontées du widget Javis le 16.09 ne se prouvent pas à la
 * lecture : un clignement, un saut et un regard, ça se MESURE pendant que ça bouge.
 *
 *   1. le clignement n'est pas mécanique : durées VARIÉES + parfois un DOUBLE battement ;
 *   2. le saut suit les 3 temps du dessin animé : ramassé, étiré, écrasé, rebond ;
 *   3. quand elle réfléchit, elle regarde AILLEURS (et ça l'emporte sur le regard-qui-suit).
 *
 * node tests/verify-lingua-bee-vivante.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

const css = fs.readFileSync(join(ROOT, 'lingua/index.html'), 'utf8');
const app = fs.readFileSync(join(ROOT, 'lingua/app.js'), 'utf8');

/* --- 0. la source dit bien ce qu'on croit (avant même d'ouvrir un navigateur) ------ */
chk(/function beeClinNaturel/.test(app), 'le clignement a UNE seule source (beeClinNaturel)');
chk((app.match(/classList\.add\("blink"\)/g) || []).length <= 2,
  'plus de boucle de clignement recopiée ailleurs (leçon #142)');
chk(/beeClinNaturel\(rig, function\(\)\{ return dormi; \}\)/.test(app), 'la mascotte l\'utilise');
chk(/function coachFaceLife\(face\)\{ beeClinNaturel/.test(app), 'le gros plan du coach l\'utilise');

/* --- 1. un vrai navigateur applique les images-clés ------------------------------- */
const nav = await chromium.launch({ headless: true });
const page = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const styles = css.slice(css.indexOf('<style>'), css.lastIndexOf('</style>'));
await page.setContent(
  '<!doctype html><meta charset="utf-8">' + styles + '</style>' +
  '<div class="bee-rig" style="width:200px;height:200px;position:relative">' +
  '<div class="rig-look"><div class="rig-base" style="width:100%;height:100%"></div></div></div>');

const rig = page.locator('.bee-rig');
const look = page.locator('.rig-look');
const matrice = (loc) => loc.evaluate((e) => getComputedStyle(e).transform);

/* 1a. le saut : on échantillonne le vrai rendu pendant le mouvement */
await rig.evaluate((e) => e.classList.add('mv-jump'));
const suivi = await rig.evaluate(async (e) => {
  const v = [];
  for (let i = 0; i < 26; i++) {
    const m = getComputedStyle(e).transform.match(/matrix\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(Number); v.push({ sx: p[0], sy: p[3], ty: p[5] }); }
    await new Promise((r) => setTimeout(r, 34));
  }
  return v;
});
await rig.evaluate((e) => e.classList.remove('mv-jump'));
const ecrase = suivi.some((p) => p.sx > 1.06 && p.sy < 0.92);   /* ramassé / atterrissage */
const etire  = suivi.some((p) => p.sx < 0.96 && p.sy > 1.08);   /* étiré en montant     */
const haut   = Math.min(...suivi.map((p) => p.ty));
chk(ecrase, ecrase ? 'le saut ÉCRASE (elle se ramasse et encaisse l\'atterrissage)' : 'aucun écrasement mesuré');
chk(etire, etire ? 'le saut ÉTIRE (elle s\'allonge en montant)' : 'aucun étirement mesuré');
chk(haut < -8, `elle décolle vraiment (${haut.toFixed(0)} px au plus haut)`);

/* 1b. elle réfléchit → elle regarde ailleurs, MÊME si le regard suit le doigt */
await look.evaluate((e) => {            /* le regard-qui-suit écrit ça EN LIGNE */
  e.style.setProperty('--lx', '3%'); e.style.setProperty('--ly', '2%'); e.style.setProperty('--lr', '4deg');
});
const avant = await matrice(look);
await rig.evaluate((e) => e.classList.add('rx-reflechit'));
await page.waitForTimeout(260);
const pendant = await matrice(look);
const lit = (t) => { const m = t.match(/matrix\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(',').map(Number); return { x: p[4], y: p[5] }; };
const a = lit(avant), b = lit(pendant);
chk(!!a && !!b && (b.x < a.x - 1 || b.y < a.y - 1),
  (a && b) ? `en réfléchissant elle détourne les yeux (x ${a.x.toFixed(1)} → ${b.x.toFixed(1)}, y ${a.y.toFixed(1)} → ${b.y.toFixed(1)})`
           : 'le regard ne bouge pas quand elle réfléchit');
chk(!!b && (b.x !== a.x || b.y !== a.y),
  'et ça l\'emporte sur le regard-qui-suit écrit en ligne (pas de conflit possible)');
await rig.evaluate((e) => e.classList.remove('rx-reflechit'));

/* 1c. le clignement : durées variées + double battement.
   On donne à chaque battement son PROPRE élément : la fonction se replanifie toute seule
   toutes les 2-6 s, donc l'appeler 40 fois sur le même nœud mélangerait les battements et
   la mesure ne voudrait plus rien dire (première version de ce test : 0–24 ms, absurde). */
const clins = await page.evaluate(async (src) => {
  const fn = new Function(src + '; return beeClinNaturel;')();
  const durees = [], doubles = [];
  const sujets = [];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.className = 'bee-rig'; document.body.appendChild(el);
    const vus = [];
    new MutationObserver(() => vus.push({ t: performance.now(), on: el.classList.contains('blink') }))
      .observe(el, { attributes: true, attributeFilter: ['class'] });
    sujets.push(vus); fn(el, false);
  }
  await new Promise((r) => setTimeout(r, 900));      /* un battement dure ~110-180 ms */
  sujets.forEach((vus) => {
    let n = 0;
    for (let i = 0; i < vus.length - 1; i++) if (vus[i].on && !vus[i + 1].on) { durees.push(vus[i + 1].t - vus[i].t); n++; }
    doubles.push(n);
  });
  return { durees, doubles };
}, app.slice(app.indexOf('function beeClinNaturel'), app.indexOf('function mascotReact')));

const uniques = new Set(clins.durees.map((d) => Math.round(d / 10)));
const nbDoubles = clins.doubles.filter((n) => n >= 2).length;
chk(clins.durees.length >= 40, `les yeux clignent vraiment (${clins.durees.length} battements sur 40 sujets)`);
chk(uniques.size >= 4, uniques.size >= 4
  ? `la durée VARIE (${uniques.size} durées différentes) — plus de clignement mécanique`
  : `durée trop régulière (${uniques.size} valeur(s)) : c'est encore mécanique`);
const min = Math.min(...clins.durees), max = Math.max(...clins.durees);
chk(min >= 90 && max <= 300, `chaque battement reste bref et naturel (${min.toFixed(0)}–${max.toFixed(0)} ms)`);
chk(nbDoubles >= 2 && nbDoubles <= 20, nbDoubles >= 2 && nbDoubles <= 20
  ? `et environ une fois sur cinq c'est un DOUBLE battement (${nbDoubles}/40)`
  : `le double battement ne se produit pas comme prévu (${nbDoubles}/40)`);

await nav.close();

console.log('\n  Bee est vivante dans Lingua — mesuré, pas déduit\n');
R.ok.forEach((m) => console.log('  ✅ ' + m));
R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)\n`);
process.exit(R.ko.length ? 1 : 0);
