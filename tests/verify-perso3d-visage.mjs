/* GARDE — LE VISAGE VIVANT DE BEE ET BOURRICOT EN 3D (Kevin 7.11.2026 : « mouvements naturels, humains, toutes les mimiques, vraiment vraies »)
 * Sans navigateur : on interroge la description (tools/3d/personnages-def.mjs). Ce que ça PROUVE :
 *  1. les clignements sont IRRÉGULIERS (écarts très variables, de temps en temps un double), ni trop rares ni mitraillette ;
 *  2. le regard SAUTE (saccades) puis se POSE : il n'est pas un flottement continu ;
 *  3. chaque humeur nommée a son VISAGE (paupières + sourcils) ; les paupières se ferment par l'angle, pas en écrasant l'œil ;
 *  4. dort = fermé en permanence ; surprise = grand ouvert, sourcils hauts ; triste = sourcils inclinés, MIROIR gauche / droite ;
 *  5. l'iris suit le doigt (le reflet, lui, reste) ; sans doigt, les yeux bougent tout seuls.
 * SABOTAGE : DEF=<ancienne description> doit rendre ce test ROUGE (npm run test:perso3d-visage).  */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const D = await import(process.env.DEF ? pathToFileURL(path.resolve(process.env.DEF)).href : pathToFileURL(path.join(ROOT, 'tools/3d/personnages-def.mjs')).href);

console.log('1. Clignements irréguliers');
if (typeof D.clignementVivant !== 'function') chk(false, 'clignementVivant absent : la description n\'a pas le visage vivant');
else {
  const debuts = []; let avant = 0;
  for (let t = 0; t < 300; t += 0.01) { const c = D.clignementVivant(t); if (c > 0.5 && avant <= 0.5) debuts.push(t); avant = c; }
  const ecarts = debuts.slice(1).map((v, i) => v - debuts[i]);
  const moy = ecarts.reduce((a, b) => a + b, 0) / ecarts.length, sd = Math.sqrt(ecarts.reduce((a, b) => a + (b - moy) ** 2, 0) / ecarts.length);
  chk(moy > 1.8 && moy < 5, `écart moyen entre clignements ${moy.toFixed(1)} s (naturel : 2 à 5 s)`);
  chk(sd > 0.7, `écarts très variables (écart-type ${sd.toFixed(2)} s) : rien de mécanique`);
  chk(ecarts.some((e) => e < 0.45), 'il y a des DOUBLES clignements');
  chk(Math.max(...ecarts) < 7 && Math.min(...ecarts) > 0.2, `jamais plus de 7 s les yeux ouverts (${Math.max(...ecarts).toFixed(1)} s), jamais de mitraillette (${Math.min(...ecarts).toFixed(2)} s)`);
  const duree = (() => { let n = 0; for (let t = 0; t < 3; t += 0.001) if (D.clignementVivant(t) > 0.5) n++; return n; })();
  chk(D.clignementVivant(0.0) >= 0 && duree < 400, 'un clignement dure moins d\'un quart de seconde');
  chk(Array.from({ length: 6 }, (_, g) => debuts.length && D.clignementVivant(7.3, g)).some((v, _, a) => v !== a[0]) || D.clignementVivant(1, 0) !== D.clignementVivant(1, 5), 'deux personnages (graines) ne clignent pas ensemble');
}

console.log('2. Regard : il saute puis se pose');
if (typeof D.regardVivant !== 'function') chk(false, 'regardVivant absent');
else {
  let vmax = 0, immobile = 0, n = 0, prev = D.regardVivant(0);
  for (let t = 0.01; t < 120; t += 0.01) { const r = D.regardVivant(t), v = Math.hypot(r.x - prev.x, r.y - prev.y) / 0.01; vmax = Math.max(vmax, v); if (v < 0.05) immobile++; n++; prev = r; }
  chk(vmax > 6, `les saccades sont RAPIDES (vitesse max ${vmax.toFixed(0)} /s)`);
  chk(immobile / n > 0.8, `entre deux saccades il se POSE (${(100 * immobile / n).toFixed(0)} % du temps immobile)`);
  const lim = Array.from({ length: 2000 }, (_, i) => D.regardVivant(i * 0.37)).every((r) => Math.abs(r.x) <= 1 && Math.abs(r.y) <= 1);
  chk(lim, 'il reste toujours dans le cadre de l\'œil (|x|, |y| ≤ 1)');
}

console.log('3. Un visage par humeur');
const noms = [...new Set([...Object.keys(D.HUMEURS), ...Object.keys(D.HUMEUR_REACTION), 'repos'])];
chk(D.VISAGES && noms.every((h) => D.VISAGES[h]), D.VISAGES ? 'chaque humeur a son visage' : 'VISAGES absent');
const piece = (perso, nom) => D.PERSONNAGES[perso].pieces.find((p) => p.nom === nom);
for (const perso of ['bee', 'bourricot']) {
  const need = ['paupiereG', 'paupiereD', 'sourcilG', 'sourcilD', 'regardG', 'regardD'];
  chk(need.every((n) => piece(perso, n)), `${perso} a ses paupières, sourcils et iris à part`);
}
if (D.VISAGES) {
  const lid = (h, t, g = 'paupiereG', perso = 'bee') => D.poseHumeur(piece(perso, g), h, t, {}).r[0];
  const mini = (h, g = 'paupiereG', perso = 'bee') => Math.min(...Array.from({ length: 80 }, (_, i) => lid(h, i * 0.05, g, perso)));
  const maxi = (h, g = 'paupiereG', perso = 'bee') => Math.max(...Array.from({ length: 80 }, (_, i) => lid(h, i * 0.05, g, perso)));
  chk(mini('dort') > 80, `dort : paupières fermées en permanence (≥ ${mini('dort').toFixed(0)}°)`);
  chk(mini('poke') < -60 && mini('repos') < -50, 'surprise et repos : paupières grandes ouvertes entre deux clignements');
  chk(mini('triste') > mini('repos') + 20 && mini('joie') > mini('repos') + 20, 'triste et joie : paupières à demi baissées (regard doux / sourire plissé)');
  chk(maxi('repos') > 60, 'au repos il cligne bien (paupière jusqu\'à ' + maxi('repos').toFixed(0) + '°)');
  const wink = Array.from({ length: 80 }, (_, i) => lid('coucou', i * 0.05, 'paupiereD') - lid('coucou', i * 0.05, 'paupiereG'));
  chk(Math.max(...wink) > 40, 'coucou : un clin d\'œil (l\'œil droit seulement)');
  const sr = (h, g, perso = 'bee') => D.poseHumeur(piece(perso, g), h, 1, {});
  chk(sr('poke', 'sourcilG').p[1] > sr('repos', 'sourcilG').p[1] + 0.005, 'surprise : les sourcils montent');
  chk(sr('triste', 'sourcilG').r[2] > 10 && sr('triste', 'sourcilD').r[2] < -10 && Math.abs(sr('triste', 'sourcilG').r[2] + sr('triste', 'sourcilD').r[2]) < 0.001, 'triste : sourcils inclinés, en MIROIR gauche / droite');
  chk(sr('pense', 'sourcilG').p[1] > sr('pense', 'sourcilD').p[1] + 0.003, 'pense : un seul sourcil monte');
  const yeux = D.poseHumeur(piece('bee', 'yeux'), 'dort', 1, {}).s;
  chk(yeux[1] >= 1 && yeux[0] >= 1, 'l\'œil n\'est jamais écrasé (c\'est la paupière qui ferme)');
}

console.log('4. L\'iris suit le doigt, le reflet reste');
if (D.VISAGES) {
  const iris = (x, y, perso = 'bee') => D.poseHumeur(piece(perso, 'regardG'), 'repos', 3, { regard: { x, y } }).p;
  chk(iris(1, 0)[0] - iris(-1, 0)[0] > 0.008 && iris(0, 1)[1] - iris(0, -1)[1] > 0.007, 'l\'iris glisse de gauche à droite et de bas en haut');
  const o1 = D.poseHumeur(piece('bee', 'regardG'), 'repos', 1.3, {}).p, o2 = D.poseHumeur(piece('bee', 'regardG'), 'repos', 9.7, {}).p, o3 = D.poseHumeur(piece('bee', 'regardG'), 'repos', 17.1, {}).p;
  chk(new Set([o1[0], o2[0], o3[0]]).size > 1, 'sans doigt, les yeux bougent tout seuls');
  const reflets = piece('bee', 'yeux').formes.filter((f) => f.c === D.C.blanc).length;
  chk(reflets >= 6, 'le blanc et les deux reflets restent dans la pièce « yeux » (la lumière ne suit pas la pupille)');
}

console.log(`\n${ok} contrôles OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
