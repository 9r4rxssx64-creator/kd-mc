/* GARDE — LA QUALITÉ DES VRAIS PERSONNAGES 3D (Kevin 8.11.2026 : « Corrige tout » ; « TOP QUALITÉ, mignon, propre » ;
 * « Bourricot est mieux réussi que Bee » → Bee montée au même niveau)
 *
 * Chaque défaut corrigé a SON nombre, mesuré dans un vrai Chromium (WebGL logiciel) sur les données telles qu'elles sont servies :
 *  BEE      1. la couleur de face = celle du dessin (ΔE Lab par classe : jaune, brun) — avant : jaune ΔE 11,5 (trop orange) ;
 *           2. plus de liseré doré sur le bord (part des pixels du bord d'une autre teinte que l'intérieur) — avant : 3,0 % ;
 *           3. plus de couture face / dos (écart de peau aux sommets doublés) — avant : 24 niveaux ;
 *           4. plus de griffe au bout de l'antenne (sommets hors de la tige du dessin) — avant : 78 sommets, jusqu'à 91 px ;
 *           5. les bras ne tirent plus le ventre ni le dos (sommets du ventre / du dos portés par un bras) — avant : 1 / 187 ;
 *           6. moins de triangles étirés quand un bras se lève de 120° — avant : 375 (bras replié) / 157 (bras tendu).
 *  BOURRICOT (si ses données sont là) 1. couleur (pelage, clair, sombre) — avant : ΔE moyen 5,4 ;
 *           2. de vrais bras : 0 triangle étiré bras levé (avant : 160 / 260, la « nageoire ») ;
 *           3. la crinière de dos en mèches nettes (contraste local) — avant : 0,38 (tache floue) ;
 *           4. plus de pli entre le nez et la bouche (creux du museau, 95ᵉ centile) — avant : 0,49 ;
 *           5. plus de couture face / dos — avant : 26 niveaux.
 *  Coût : appels de dessin et triangles par image (plafonds).
 *  SABOTAGE=ancien : les mêmes contrôles sur les données d'AVANT la correction (lues dans l'historique git) → le test doit finir ROUGE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAB = process.env.SABOTAGE || '';
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* les données d'avant la correction (commits de la vraie Bee et du vrai Bourricot, avant le 8.11 soir) : seulement pour la preuve du sabotage */
const AVANT = { bee: ['8bf77c0', 'javis/perso3d-reel.js'], bourricot: ['f343ec5', 'javis/perso3d-reel-ane.js'] };
const donnees = (nom) => {
  const f = nom === 'bee' ? 'javis/perso3d-reel.js' : 'javis/perso3d-reel-ane.js';
  if (SAB !== 'ancien') return lire(f);
  try { return execFileSync('git', ['show', AVANT[nom][0] + ':' + AVANT[nom][1]], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (_) { return ''; }
};
const PERSOS = ['bee'].concat(fs.existsSync(path.join(ROOT, 'javis/perso3d-reel-ane.js')) ? ['bourricot'] : []);
const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

for (const nom of PERSOS) {
  console.log((nom === 'bee' ? 'BEE' : 'BOURRICOT') + (SAB ? ' (SABOTAGE=' + SAB + ' : données d\'avant)' : ''));
  const DATA = donnees(nom);
  if (!DATA) { chk(false, 'données d\'avant introuvables dans l\'historique (le sabotage ne peut pas se faire)'); continue; }
  const page = await nav.newPage({ viewport: { width: 400, height: 400 } });
  const err = []; page.on('pageerror', (e) => err.push(e.message));
  const base = fs.readFileSync(path.join(ROOT, nom === 'bee' ? 'lingua/bee/v2/rig/base.webp' : 'lingua/donkey/rig/base.webp')).toString('base64');
  await page.setContent('<body style="margin:0"><img id="dessin" src="data:image/webp;base64,' + base + '">');
  await page.addScriptTag({ content: DATA });
  await page.addScriptTag({ content: lire('javis/perso3d.js') });
  await page.addScriptTag({ content: lire('tests/mesure-couleur-perso3d.js') });
  await page.addScriptTag({ content: lire('tests/qualite-perso3d-reel.js') });
  const etat = await page.evaluate(async (n) => { await document.getElementById('dessin').decode(); window.KdmcPerso3D.creer(n).liberer(); return window.KdmcPerso3D.attendreReel(10000, n); }, nom);
  chk(etat === 2, `le vrai personnage se charge (état ${etat})`);
  if (etat !== 2) { await page.close(); continue; }
  const M = await page.evaluate(async (n) => ({ couleur: window.mesureCouleurPerso3D(n, document.getElementById('dessin')), bord: window.bordPerso3D(n), q: await window.qualitePerso3D(n),
    cout: (() => { const c = document.createElement('canvas'); c.width = c.height = 420; const p = window.KdmcPerso3D.creer(n); p.dessiner(c.getContext('2d'), 420, 'parle', 1, { niveau: 0.6, ouv: 0.4 }, '#fff'); const s = window.KdmcPerso3D._stats(); p.liberer(); return s; })() }), nom);
  const C = M.couleur.classes, f1 = (v) => (v == null ? '—' : v.toFixed(1));
  const ligneC = Object.entries(C).map(([k, v]) => `${k} ΔE ${f1(v.dE)} (3D ${v.rendu.join(',')} / dessin ${v.dessin.join(',')})`).join(' · ');
  if (nom === 'bee') {
    chk(C.jaune && C.brun && C.jaune.dE < 7 && C.brun.dE < 4 && M.couleur.dEmoyen < 4.5, `1. couleur de face = le dessin : ${ligneC} ; moyenne ${f1(M.couleur.dEmoyen)} (plafonds jaune 7, brun 4, moyenne 4,5)`);
    chk(M.bord.teinte < 0.015, `2. pas de liseré doré sur le bord : ${(100 * M.bord.teinte).toFixed(2)} % des pixels du bord d'une autre teinte que l'intérieur (plafond 1,5 % ; ${M.bord.bande} pixels de bord)`);
    chk(M.q.couture.ecartMoyen < 14, `3. pas de couture face / dos : écart moyen ${f1(M.q.couture.ecartMoyen)} niveaux sur ${M.q.couture.paires} sommets doublés (plafond 14)`);
    chk(M.q.griffe.sommetsHorsTige === 0 && M.q.griffe.depasseMax < 16, `4. antennes sans griffe : ${M.q.griffe.sommetsHorsTige} sommet(s) hors de la tige du dessin, au plus ${f1(M.q.griffe.depasseMax)} px (plafond 16 px, 0 sommet)`);
    chk(M.q.ventreTire.aisselle === 0, `5b. rien de la rayure jaune du ventre ne suit le bras levé : ${M.q.ventreTire.aisselle} sommet(s) sous l'aisselle (attendu 0 ; avant le 9.11 : traînée jaune sous le bras levé)`);
    chk(M.q.ventreTire.ventre === 0 && M.q.ventreTire.dos === 0, `5. le bras tendu ne tire pas le ventre (${M.q.ventreTire.ventre} sommet) et le bras replié ne tire pas le dos (${M.q.ventreTire.dos} sommet)`);
    chk(M.q.etirement.brasD <= 120 && M.q.etirement.brasG <= 300, `6. bras levé de 120° : ${M.q.etirement.brasG} triangles étirés (bras replié, plafond 300) · ${M.q.etirement.brasD} (bras tendu, plafond 120)`);
  } else {
    chk(C.pelage && C.clair && C.pelage.dE < 5 && C.clair.dE < 4 && M.couleur.dEmoyen < 3.5, `1. couleur de face = le dessin (moins orange) : ${ligneC} ; moyenne ${f1(M.couleur.dEmoyen)} (plafonds pelage 5, clair 4, moyenne 3,5)`);
    chk(M.q.etirement.brasG === 0 && M.q.etirement.brasD === 0, `2. de vrais bras, plus de nageoire : bras levés de 120°, ${M.q.etirement.brasG} + ${M.q.etirement.brasD} triangles étirés (attendu 0)`);
    chk(M.q.criniere.dos > 3, `3. la crinière de dos en mèches nettes : contraste local ${M.q.criniere.dos.toFixed(2)} (plancher 3 ; de face ${M.q.criniere.face.toFixed(1)})`);
    chk(M.q.museau.pli95 < 0.36, `4. pas de pli entre le nez et la bouche : creux ${M.q.museau.pli95.toFixed(2)} (95ᵉ centile sur ${M.q.museau.sommets} sommets, plafond 0,36)`);
    chk(M.q.couture.ecartMoyen < 18, `5. pas de couture face / dos : écart moyen ${f1(M.q.couture.ecartMoyen)} niveaux sur ${M.q.couture.paires} sommets doublés (plafond 18)`);
  }
  chk(M.cout.appels <= 24 && M.cout.triangles <= 42000, `coût : ${M.cout.appels} appels de dessin, ${M.cout.triangles} triangles par image, ombre comprise (plafonds 24 / 42 000)`);
  chk(err.length === 0, err.length ? 'ERREURS JS : ' + err[0] : 'aucune erreur JS');
  await page.close();
}
await nav.close();
if (SAB) console.log('\n(SABOTAGE=' + SAB + ' : ce passage doit finir ROUGE)');
console.log(`\n${ok} contrôles OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
