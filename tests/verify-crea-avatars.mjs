/* GARDE — Créa Studio « Avatars & marionnettes » (Kevin 29.10.2026) : le cœur du moteur, SANS navigateur.
 * Mesure (jamais « ça devrait ») :
 *  A. le maillage sur les VRAIS 478 points de 4 personnes fictives (homme, femme de trois-quarts, homme à lunettes-barbe, chien) + le rig « à la main » :
 *     triangulation propre, trou de la bouche vide, identité (déformation nulle au repos), chaque réglage bouge LA bonne partie et rien d'autre ;
 *     3 000 réglages tirés au hasard : jamais de NaN, jamais d'explosion ;
 *  B. la voix : synchro des lèvres sur des voyelles synthétiques (a > i > u pour l'ouverture, i > u pour l'étirement, silence = bouche fermée),
 *     changement de hauteur (durée gardée, fréquence mesurée par FFT), caméra (52 expressions → réglages), tête (matrice → angles, signe vérifié) ;
 *  C. le tour de tête (choix des vues), le paquet d'avatar (formats refusés : SVG, nombres fous, trop de vues…) ;
 *  D. les 8 personnages × accessoires × teintes dessinés sur un faux contexte : aucun appel avec NaN, tout tient dans le cadre ;
 *  E. le câblage : bouton, section, scripts dans l'ordre, service worker, worker IA (looks d'avatar), pas de réseau inattendu.
 * Sabotage (--sabotage) : 7 mutations du code, chacune DOIT faire rougir au moins un contrôle. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module'; import { spawnSync } from 'node:child_process'; import vm from 'node:vm';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(R, 'tools/crea-studio');
const DIR = process.env.AVATAR_DIR || SOURCE;
const require = createRequire(import.meta.url);

const MUTATIONS = [
  ['la bouche ne s\'ouvre plus', 'avatar-core.js', 'var ouv = P.jaw * 0.62 * mw;', 'var ouv = 0;'],
  ['les paupières ne se ferment plus', 'avatar-core.js', 'poignee(a, 0, gap * 0.98 * B - gap * 0.30 * W * (1 - B), 1);', 'poignee(a, 0, 0, 1);'],
  ['la bouche reste ouverte sur le silence', 'avatar-core.js', 'var jaw = voise ? clamp(Math.pow(nivel, 0.65) * (0.35 + 0.75 * ouvert), 0, 1) : 0;', 'var jaw = 0.5;'],
  ['la voix ne change plus de hauteur', 'avatar-core.js', 'return reechantillonner(etirerWSOLA(x, ratio), ratio);', 'return x;'],
  ['le paquet accepte une image SVG', 'avatar-core.js', "!/^data:image\\/(jpeg|png|webp);base64,/.test(v.img)", "false"],
  ['le signe de la tête est inversé', 'avatar-core.js', 'var yaw = Math.asin(clamp(d[8], -1, 1))', 'var yaw = -Math.asin(clamp(d[8], -1, 1))'],
  ['les coins des yeux ne sont plus épinglés', 'avatar-core.js', "(g.eyeCoinL || []).concat(g.eyeCoinR || []).forEach(function (i) { poignee(i, 0, 0, 1); });", "void 0;"]
];

if (process.argv.includes('--sabotage')) {
  let rouges = 0; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatars-sabotage-'));
  for (const [nom, fichier, avant, apres] of MUTATIONS) {
    const d = fs.mkdtempSync(path.join(tmp, 'm-')); for (const f of fs.readdirSync(SOURCE)) if (/^avatar-.*\.js$/.test(f)) fs.copyFileSync(path.join(SOURCE, f), path.join(d, f));
    const src = fs.readFileSync(path.join(d, fichier), 'utf8');
    if (!src.includes(avant)) { console.log(`  ❌ mutation « ${nom} » : le texte à saboter n'existe plus (le garde ne protège plus rien)`); continue; }
    fs.writeFileSync(path.join(d, fichier), src.replace(avant, apres));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, AVATAR_DIR: d }, encoding: 'utf8', timeout: 240000 });
    const fails = ((r.stdout || '').match(/^FAIL /gm) || []).length;
    const rouge = r.status !== 0 && fails > 0; if (rouge) rouges++;
    console.log(`  ${rouge ? '✅' : '❌'} sabotage « ${nom} » → ${fails} contrôle(s) rouge(s)${rouge ? '' : ' (DEVAIT rougir)'}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n=== ${rouges}/${MUTATIONS.length} sabotages détectés ${rouges === MUTATIONS.length ? '— le garde est discriminant' : '— GARDE TROP MOU'}`); process.exit(rouges === MUTATIONS.length ? 0 : 1);
}

const C = require(path.join(DIR, 'avatar-core.js'));
let ko = 0, ok = 0; const t = (c, m) => { if (c) ok++; else ko++; console.log((c ? 'OK   ' : 'FAIL ') + m); };
const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(R, `tests/avatars-donnees/fictif-${n}.lm.json`), 'utf8'));
const rigDe = (n) => { const f = fixture(n); return { f, rig: C.rigDepuisMediaPipe(f.lm.map((p) => ({ x: p[0], y: p[1] })), 640, 640) }; };
const NOMS = ['homme', 'femme', 'barbe', 'chien'];

/* ===== A. le maillage ===== */
{
  let seed = 5; const al = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pts = Array.from({ length: 70 }, () => [al() * 100, al() * 100]); const tri = C.delaunay(pts);
  let propre = tri.length > 100;
  for (const [a, b, c] of tri) {
    const A = pts[a], B = pts[b], Cc = pts[c], D = 2 * (A[0] * (B[1] - Cc[1]) + B[0] * (Cc[1] - A[1]) + Cc[0] * (A[1] - B[1])); if (Math.abs(D) < 1e-9) continue;
    const ux = ((A[0] ** 2 + A[1] ** 2) * (B[1] - Cc[1]) + (B[0] ** 2 + B[1] ** 2) * (Cc[1] - A[1]) + (Cc[0] ** 2 + Cc[1] ** 2) * (A[1] - B[1])) / D, uy = ((A[0] ** 2 + A[1] ** 2) * (Cc[0] - B[0]) + (B[0] ** 2 + B[1] ** 2) * (A[0] - Cc[0]) + (Cc[0] ** 2 + Cc[1] ** 2) * (B[0] - A[0])) / D;
    const r2 = (A[0] - ux) ** 2 + (A[1] - uy) ** 2;
    pts.forEach((p, i) => { if (i !== a && i !== b && i !== c && (p[0] - ux) ** 2 + (p[1] - uy) ** 2 < r2 * (1 - 1e-7)) propre = false; });
  }
  t(propre, `A1 Delaunay : ${tri.length} triangles sur 70 points, aucun point dans un cercle circonscrit`);
}
for (const n of NOMS) {
  const { rig } = rigDe(n), g = C.MP;
  let degeneres = 0, hors = 0; const couverts = new Set();
  for (const [a, b, c] of rig.tri) { if (a >= rig.n || b >= rig.n || c >= rig.n) hors++; couverts.add(a); couverts.add(b); couverts.add(c); const ar = Math.abs((rig.pts[b][0] - rig.pts[a][0]) * (rig.pts[c][1] - rig.pts[a][1]) - (rig.pts[c][0] - rig.pts[a][0]) * (rig.pts[b][1] - rig.pts[a][1])) / 2; if (ar < 0.05) degeneres++; }
  t(rig.n >= 540 && rig.n <= 580 && rig.tri.length >= 850 && rig.tri.length <= 1100 && degeneres === 0 && hors === 0, `A2 ${n} : ${rig.n} points, ${rig.tri.length} triangles, ${degeneres} dégénéré(s), ${hors} hors-liste`);
  const trou = g.lipIU.concat(g.lipIL.slice(1, -1).reverse()).map((i) => rig.pts[i]);
  const aire = ([a, b, c]) => Math.abs((rig.pts[b][0] - rig.pts[a][0]) * (rig.pts[c][1] - rig.pts[a][1]) - (rig.pts[c][0] - rig.pts[a][0]) * (rig.pts[b][1] - rig.pts[a][1])) / 2;
  const dansTrou = rig.tri.filter((T) => C.dansPolygone((rig.pts[T[0]][0] + rig.pts[T[1]][0] + rig.pts[T[2]][0]) / 3, (rig.pts[T[0]][1] + rig.pts[T[1]][1] + rig.pts[T[2]][1]) / 3, trou));
  const airePerdue = dansTrou.reduce((s2, T) => s2 + aire(T), 0);
  /* les points du MILIEU des lèvres (anneau entre le bord et l'intérieur) ne sont pas dessinés : la couronne des lèvres les remplace — ils doivent tous être DANS le contour des lèvres */
  const polyO = g.lipOU.map((i) => rig.pts[i]).concat(g.lipOL.slice(1, -1).reverse().map((i) => rig.pts[i]));
  const interne = new Set(g.lipIU.concat(g.lipIL)); let oublies = 0, dehors = 0; for (let i = 0; i < rig.n; i++) if (!interne.has(i) && !couverts.has(i)) { oublies++; if (!C.dansPolygone(rig.pts[i][0], rig.pts[i][1], polyO)) dehors++; }
  t(airePerdue < 2 && dehors === 0 && oublies < 60, `A2 ${n} : trou de la bouche vide (${dansTrou.length} miette de ${airePerdue.toFixed(1)} px²), ${oublies} points du milieu des lèvres remplacés par la couronne, ${dehors} point oublié ailleurs`);
  const D0 = C.deformer(rig, C.paramsNeutres()); let maxId = 0; for (let i = 0; i < rig.n; i++) maxId = Math.max(maxId, Math.abs(D0[i * 2] - rig.pts[i][0]), Math.abs(D0[i * 2 + 1] - rig.pts[i][1]));
  t(maxId < 1e-3, `A3 ${n} : au repos le visage est IDENTIQUE à la photo (écart max ${maxId.toExponential(1)} px)`);
  const P = (o) => C.assainir(o), mw = rig.mw, io = rig.io, y = (D, i) => D[i * 2 + 1], x = (D, i) => D[i * 2];
  const Dj = C.deformer(rig, P({ jaw: 1 }));
  t(y(Dj, 17) - y(D0, 17) >= 0.4 * mw && y(Dj, 152) - y(D0, 152) >= 0.4 * mw && y(Dj, 0) - y(D0, 0) <= 0 && y(Dj, 0) - y(D0, 0) > -0.2 * mw && Math.abs(y(Dj, 1) - y(D0, 1)) < 0.5 && Math.abs(y(Dj, 159) - y(D0, 159)) < 0.1 * io,
    `A3 ${n} : bouche ouverte → lèvre du bas ↓ ${(y(Dj, 17) - y(D0, 17)).toFixed(0)} px, menton ↓ ${(y(Dj, 152) - y(D0, 152)).toFixed(0)} px, lèvre du haut ↑, nez et yeux immobiles`);
  const geo0 = C.geometrieBouche(rig, D0, P({})), geoJ = C.geometrieBouche(rig, Dj, P({ jaw: 1 }));
  /* le chien : MediaPipe voit « une bouche » sur sa truffe, déjà entrouverte → on teste seulement qu'elle s'ouvre PLUS (c'est pour ça qu'il y a le mode « à la main ») */
  t((n === 'chien' ? geo0.ouverture < 0.25 * mw : geo0.ouverture < 2) && geoJ.ouverture > geo0.ouverture + 0.35 * mw, `A3 ${n} : ouverture de la bouche ${geo0.ouverture.toFixed(1)} px → ${geoJ.ouverture.toFixed(0)} px`);
  const Db = C.deformer(rig, P({ blinkL: 1 })), gap = y(D0, 145) - y(D0, 159);
  t((y(Db, 159) - y(D0, 159)) >= 0.7 * gap && Math.abs(y(Db, 386) - y(D0, 386)) < 0.01 && Math.abs(y(Db, 374) - y(D0, 374)) < 0.01 && Math.abs(y(Db, 33) - y(D0, 33)) < 0.5 && Math.abs(y(Db, 133) - y(D0, 133)) < 0.5, `A3 ${n} : clin d'œil → paupière gauche ↓ ${(y(Db, 159) - y(D0, 159)).toFixed(1)} px sur ${gap.toFixed(1)}, œil droit immobile, coins de l'œil immobiles (${Math.abs(y(Db, 33) - y(D0, 33)).toFixed(2)} px)`);
  const Dbr = C.deformer(rig, P({ browL: 1 })); const dbl = Math.max(...g.browL.map((i) => y(D0, i) - y(Dbr, i))), dbr = Math.max(...g.browR.map((i) => Math.abs(y(D0, i) - y(Dbr, i))));
  t(dbl >= 0.05 * io && dbr < 0.01 * io, `A3 ${n} : sourcil gauche levé ↑ ${dbl.toFixed(1)} px, sourcil droit immobile (${dbr.toFixed(2)})`);
  const Ds = C.deformer(rig, P({ smile: 1 })), Dw = C.deformer(rig, P({ wide: -1 }));
  t(y(D0, 61) - y(Ds, 61) >= 0.1 * mw && y(D0, 291) - y(Ds, 291) >= 0.1 * mw && x(Dw, 61) - x(D0, 61) >= 0.2 * mw && x(D0, 291) - x(Dw, 291) >= 0.2 * mw, `A3 ${n} : sourire → coins ↑ ${(y(D0, 61) - y(Ds, 61)).toFixed(0)} px ; bouche en cœur → coins ↔ ${(x(Dw, 61) - x(D0, 61)).toFixed(0)} px`);
  const Dy = C.deformer(rig, P({ yaw: 0.4 })), Dr = C.deformer(rig, P({ roll: 0.3 }));
  t(x(Dy, 1) - x(D0, 1) >= 0.1 * io && Math.abs(x(Dr, 1) - x(D0, 1)) + Math.abs(y(Dr, 1) - y(D0, 1)) > 0.5, `A3 ${n} : tête tournée à droite → nez → ${(x(Dy, 1) - x(D0, 1)).toFixed(0)} px ; roulis bouge le visage`);
  /* 3 000 réglages au hasard, même hors limites */
  let seed = 99; const al = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; let nan = 0, explose = 0; const H = rig.face.y1 - rig.face.y0;
  for (let k = 0; k < 750; k++) {
    const p = {}; C.NOMS_PARAMS.forEach((nm) => { p[nm] = (al() - 0.5) * 6; if (al() < 0.05) p[nm] = NaN; });
    const D = C.deformer(rig, C.assainir(p)); let mx = 0; for (let i = 0; i < rig.n; i++) { if (!isFinite(D[i * 2]) || !isFinite(D[i * 2 + 1])) nan++; mx = Math.max(mx, Math.hypot(D[i * 2] - rig.pts[i][0], D[i * 2 + 1] - rig.pts[i][1])); }
    if (mx > 1.6 * H) explose++;
  }
  t(nan === 0 && explose === 0, `A4 ${n} : 750 réglages au hasard (hors limites, NaN) → ${nan} NaN, ${explose} explosion(s)`);
}
{
  const dessus = C.rigManuel(640, 640, [246, 158], [394, 160], [324, 362]), dessous = C.rigManuel(640, 640, [394, 160], [246, 158], [324, 362]);
  for (const [nom, rig] of [['yeux dans l\'ordre', dessus], ['yeux inversés', dessous]]) {
    const g = rig.g, D0 = C.deformer(rig, C.paramsNeutres()), Dj = C.deformer(rig, C.assainir({ jaw: 1, smile: 0.5 }));
    let nan = 0; for (const v of Dj) if (!isFinite(v)) nan++;
    const trou = g.lipIU.concat(g.lipIL.slice(1, -1).reverse()).map((i) => rig.pts[i]);
    const dedans = rig.tri.filter(([a, b, c]) => C.dansPolygone((rig.pts[a][0] + rig.pts[b][0] + rig.pts[c][0]) / 3, (rig.pts[a][1] + rig.pts[b][1] + rig.pts[c][1]) / 3, trou)).length;
    const ouv = C.geometrieBouche(rig, Dj, C.assainir({ jaw: 1 })).ouverture;
    t(rig.manuel && rig.tri.length > 150 && nan === 0 && dedans === 0 && ouv > 0.3 * rig.mw && Math.abs(D0[g.lipOU[5] * 2 + 1] - rig.pts[g.lipOU[5]][1]) < 1e-3, `A5 rig à la main (${nom}) : ${rig.tri.length} triangles, trou vide, bouche ${ouv.toFixed(0)} px ouverte, ${nan} NaN`);
  }
}

/* ===== B. la voix, la caméra, la tête ===== */
function voyelle(sr, sec, f0, formants, vol) { const n = Math.round(sr * sec), x = new Float32Array(n); for (let h = 1; h * f0 < 5500; h++) { const f = h * f0; let a = 0; for (const [fc, bw, ga] of formants) a += ga * Math.exp(-((f - fc) ** 2) / (2 * bw * bw)); for (let i = 0; i < n; i++) x[i] += a * Math.sin(2 * Math.PI * f * i / sr) / h; } let mx = 0; for (const v of x) mx = Math.max(mx, Math.abs(v)); for (let i = 0; i < n; i++) x[i] = x[i] / mx * vol; return x; }
function bruit(sr, sec, vol) { const n = Math.round(sr * sec), x = new Float32Array(n); let s = 1, prev = 0; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; const b = (s / 4294967296 - 0.5); x[i] = (b - prev * 0.97) * vol; prev = b; } return x; }
function colle(...a) { const n = a.reduce((s, v) => s + v.length, 0), o = new Float32Array(n); let p = 0; for (const v of a) { o.set(v, p); p += v.length; } return o; }
{
  const sr = 16000, sil = new Float32Array(sr * 0.2);
  const A = voyelle(sr, 0.4, 120, [[800, 120, 1], [1200, 150, 0.8]], 0.5), I = voyelle(sr, 0.4, 120, [[300, 60, 1], [2300, 200, 0.9]], 0.5), U = voyelle(sr, 0.4, 120, [[300, 60, 1], [800, 120, 0.6]], 0.5), S = bruit(sr, 0.4, 0.25);
  const frames = C.analyserVoix(colle(sil, A, sil, I, sil, U, sil, S, sil), sr, 30);
  const seg = (k) => frames.slice(Math.round((0.2 + k * 0.6) * 30) + 3, Math.round((0.2 + k * 0.6 + 0.4) * 30) - 2);
  const moy = (a, f) => a.reduce((s, v) => s + v[f], 0) / a.length;
  const jA = moy(seg(0), 'jaw'), jI = moy(seg(1), 'jaw'), jU = moy(seg(2), 'jaw'), jS = moy(seg(3), 'jaw'), wA = moy(seg(0), 'wide'), wI = moy(seg(1), 'wide'), wU = moy(seg(2), 'wide'), wS = moy(seg(3), 'wide');
  const silence = frames.slice(0, 4).concat(frames.slice(Math.round(0.6 * 30) + 1, Math.round(0.6 * 30) + 4));
  t(Math.max(...silence.map((f) => f.jaw)) < 0.02, `B1 silence → bouche fermée (jaw max ${Math.max(...silence.map((f) => f.jaw)).toFixed(3)})`);
  t(jA > 0.35 && jA > jI + 0.12 && jA > jU + 0.12, `B1 voyelle « a » plus ouverte que « i » et « ou » : ${jA.toFixed(2)} > ${jI.toFixed(2)}, ${jU.toFixed(2)}`);
  t(wI > wU + 0.3 && wI > wA, `B1 « i » étirée, « ou » en cœur : wide i=${wI.toFixed(2)} ou=${wU.toFixed(2)} a=${wA.toFixed(2)}`);
  t(jS < 0.3 && wS > 0, `B1 sifflante (s) : dents, bouche presque fermée (jaw ${jS.toFixed(2)}, wide ${wS.toFixed(2)})`);
  const lis = C.lisser([...Array(10)].map(() => ({ jaw: 0, wide: 0 })).concat([...Array(10)].map(() => ({ jaw: 1, wide: 0 }))).concat([...Array(10)].map(() => ({ jaw: 0, wide: 0 }))), 30);
  t(lis[11].jaw > 0.5 && lis[21].jaw > 0.2 && lis[29].jaw < lis[21].jaw, `B2 lissage : s'ouvre vite (${lis[11].jaw.toFixed(2)} après 2 images), se referme moins vite (${lis[21].jaw.toFixed(2)})`);
}
function frequence(x, sr) { const N = 8192, re = new Float64Array(N), im = new Float64Array(N), d0 = Math.floor((x.length - N) / 2); for (let i = 0; i < N; i++) { re[i] = x[d0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); } C.fft(re, im); let best = 1, bv = 0; for (let k = 1; k < N / 2; k++) { const v = Math.hypot(re[k], im[k]); if (v > bv) { bv = v; best = k; } } return best * sr / N; }
{
  const sr = 16000, n = sr * 1.5, sin = new Float32Array(n); for (let i = 0; i < n; i++) sin[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / sr);
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  for (const [ratio, attendu] of [[1.5, 330], [0.75, 165], [1.25, 275]]) {
    const o = C.changerHauteur(sin, ratio), f = frequence(o, sr), dur = o.length / n, r = rms(o) / rms(sin); let nan = 0; for (const v of o) if (!isFinite(v)) nan++;
    t(Math.abs(dur - 1) < 0.03 && Math.abs(f - attendu) < 0.03 * attendu && r > 0.6 && r < 1.35 && nan === 0, `B3 hauteur ×${ratio} : durée ${(dur * 100).toFixed(1)} %, fréquence ${f.toFixed(0)} Hz (attendu ${attendu}), niveau ×${r.toFixed(2)}`);
  }
  t(C.changerHauteur(sin, 1) === sin, 'B3 hauteur ×1 : le son est rendu tel quel');
}
{
  const f = C.fusionner({ smile: 0.4 }, { smile: 0.3, browIn: 0.5 }, { jaw: 0.7, wide: 0.2 }, { blinkL: 1, yaw: 0.05 });
  t(f.jaw === 0.7 && Math.abs(f.smile - 0.7) < 1e-9 && f.blinkL === 1 && f.browIn === 0.5 && f.wide === 0.2, 'B4 fusion : la voix commande la bouche, le reste s\'additionne');
  const a = C.assainir({ jaw: 9, wide: -9, yaw: 5, blinkL: NaN, gazeX: 'x', smile: -3 });
  t(a.jaw === 1 && a.wide === -1 && a.yaw === 0.9 && a.blinkL === 0 && a.gazeX === 0 && a.smile === 0, 'B4 assainir : limites respectées, NaN et texte → 0');
}
{
  const h = fixture('homme'), fe = fixture('femme');
  const catsH = Object.entries(h.top).map(([k, v]) => ({ categoryName: k, score: v })), catsF = Object.entries(fe.top).map(([k, v]) => ({ categoryName: k, score: v }));
  const ph = C.depuisBlendshapes(catsH, true), pf = C.depuisBlendshapes(catsF, true);
  t(ph.jaw < 0.15 && ph.browIn > 0.2 && C.NOMS_PARAMS.every((k) => isFinite(ph[k]) && isFinite(pf[k])), `B5 expressions réelles de la photo « homme » : bouche fermée (${ph.jaw.toFixed(2)}), sourcils internes levés (${ph.browIn.toFixed(2)})`);
  const open = C.depuisBlendshapes([{ categoryName: 'jawOpen', score: 0.8 }, { categoryName: 'mouthSmileLeft', score: 0.6 }, { categoryName: 'mouthSmileRight', score: 0.6 }, { categoryName: 'eyeBlinkLeft', score: 0.9 }], true);
  const mir = C.depuisBlendshapes([{ categoryName: 'eyeBlinkLeft', score: 0.9 }], false);
  t(open.jaw > 0.85 && open.smile > 0.8 && open.blinkL > 0.9 && open.blinkR === 0 && mir.blinkR > 0.9 && mir.blinkL === 0, 'B5 caméra : bouche, sourire, œil gauche ; l\'option miroir échange bien gauche et droite');
  const poseH = C.poseDepuisMatrice(h.matrice, false), poseF = C.poseDepuisMatrice(fe.matrice, false), poseFm = C.poseDepuisMatrice(fe.matrice, true);
  t(Math.abs(poseH.yaw) < 0.05 && poseF.yaw > 0.3 && poseF.yaw < 0.5 && poseFm.yaw < -0.3, `B5 tête : homme de face ${poseH.yaw.toFixed(2)} rad, femme tournée vers la droite de l'image ${poseF.yaw.toFixed(2)} rad (≈ ${(poseF.yaw * 57.3).toFixed(0)}°), miroir inverse ${poseFm.yaw.toFixed(2)}`);
  const rep = C.fabriquerRepos(3), rep2 = C.fabriquerRepos(4); let blinks = 0, prev = 0, borne = true, diff = 0;
  for (let ts = 0; ts < 60; ts += 0.02) { const b = rep(ts).blinkL; if (b < 0 || b > 1.0001) borne = false; if (b > 0.5 && prev <= 0.5) blinks++; prev = b; if (Math.abs(rep(ts).blinkL - rep2(ts).blinkL) > 0.5) diff++; }
  t(blinks >= 8 && blinks <= 25 && borne && diff > 5, `B6 repos : ${blinks} clignements en 60 s, bornés [0,1], deux graines = deux rythmes`);
}

/* ===== C. le tour de tête, le paquet ===== */
{
  const cands = [-0.7, -0.55, -0.3, -0.25, 0, 0.02, 0.3, 0.26, 0.56, 0.7].map((yaw, i) => ({ yaw, pitch: 0.02, nette: i % 2 ? 2 : 1, neutre: 0.9 })); cands.push({ yaw: 0.0, pitch: 0.6, nette: 5, neutre: 1 });
  const ch = C.choisirVues(cands, 5), ys = ch.map((i) => cands[i].yaw);
  t(ch.length === 5 && ys.every((v, i) => i === 0 || v > ys[i - 1]) && Math.abs(ys[0] + 0.55) < 0.2 && Math.abs(ys[4] - 0.55) < 0.2 && !ch.includes(cands.length - 1), `C1 tour de tête : 5 vues triées (${ys.map((v) => v.toFixed(2)).join(', ')}), l'image trop penchée est écartée`);
  t(C.choisirVues([{ yaw: 0.1, pitch: 0, nette: 1, neutre: 1 }], 5).length === 1 && C.choisirVues([], 5).length === 0, 'C1 une seule vue → on la garde ; aucune → rien');
  const ya = [-0.5, 0, 0.5], m1 = C.melangerVues(ya, -0.9), m2 = C.melangerVues(ya, 0.25), m3 = C.melangerVues(ya, 0.7), m4 = C.melangerVues(ya, 0.1), m5 = C.melangerVues(ya, 0.4);
  t(m1.a === 0 && m1.b === 0 && m3.a === 2 && m2.a === 1 && m2.b === 2 && m2.t > 0.3 && m2.t < 0.7 && m4.t < m2.t && m2.t < m5.t, 'C2 fondu entre vues : bouts bloqués, milieu ≈ 50 %, croissant avec l\'angle');
}
{
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(100), pts = fixture('homme').lm.map((p) => [p[0] * 640, p[1] * 640]);
  const bon = C.empaqueter({ type: 'photo', nom: 'Test', vues: [{ yaw: 0, pitch: 0, w: 640, h: 640, img, pts }] });
  t(C.validerPaquet(bon).ok && JSON.stringify(bon).length < 60000, `C3 paquet valide (${JSON.stringify(bon).length} octets sans image)`);
  const cas = [['version inconnue', { ...bon, v: 2 }], ['image SVG', { ...bon, vues: [{ ...bon.vues[0], img: 'data:image/svg+xml;base64,AAAA' }] }], ['point fou', { ...bon, vues: [{ ...bon.vues[0], pts: bon.vues[0].pts.map((p, i) => i === 5 ? [NaN, 1] : p) }] }],
    ['trop de vues', { ...bon, vues: Array(8).fill(bon.vues[0]) }], ['image énorme', { ...bon, vues: [{ ...bon.vues[0], img: 'data:image/jpeg;base64,' + 'A'.repeat(4.1e6) }] }], ['mauvais nombre de points', { ...bon, vues: [{ ...bon.vues[0], pts: bon.vues[0].pts.slice(0, 100) }] }],
    ['manuel sans repères', { ...bon, vues: [{ ...bon.vues[0], manuel: true, pts: [] }] }], ['type inconnu', { ...bon, type: 'x' }], ['perso sans id', { v: 1, type: 'perso', perso: {} }], ['pas un objet', 'x']];
  const refus = cas.filter(([, o]) => !C.validerPaquet(o).ok).map(([n]) => n);
  t(refus.length === cas.length, `C3 paquets refusés : ${refus.length}/${cas.length}` + (refus.length < cas.length ? ' — ACCEPTÉS À TORT : ' + cas.filter(([, o]) => C.validerPaquet(o).ok).map(([n]) => n).join(', ') : ''));
  t(C.validerPaquet({ v: 1, type: 'perso', perso: { id: 'panda' } }).ok && C.validerPaquet(C.empaqueter({ type: 'perso', perso: { id: 'lapin', teinte: 'givre' } })).ok, 'C3 paquet de personnage accepté');
}

/* ===== D. les personnages (faux contexte : on vérifie chaque appel) ===== */
/* avatar-persos.js s'attache à `self` : on le charge dans un contexte minimal */
{
  const sandbox = { self: {}, console }; sandbox.self = sandbox; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'avatar-persos.js'), 'utf8'), sandbox);
  const A = sandbox.AvatarPersos;
  let appels = 0, mauvais = 0, derniere = '';
  const faux = () => new Proxy({}, { get(cible, nom) {
    if (nom === 'createRadialGradient' || nom === 'createLinearGradient') return (...a) => { a.forEach((v) => { if (typeof v === 'number' && !isFinite(v)) { mauvais++; derniere = nom; } }); return { addColorStop() {} }; };
    if (typeof nom === 'symbol') return undefined;
    if (cible[nom] !== undefined) return cible[nom];
    return (...a) => { appels++; a.forEach((v) => { if (typeof v === 'number' && !isFinite(v)) { mauvais++; derniere = String(nom); } }); };
  }, set(cible, nom, v) { cible[nom] = v; return true; } });
  const ids = A.ORDRE, acc = Object.keys(A.ACCESSOIRES), teintes = Object.keys(A.TEINTES), extremes = [C.paramsNeutres(), C.assainir({ jaw: 1, smile: 1, blinkL: 1, blinkR: 1, browL: 1, browR: -1, browIn: 1, eyeWide: 1, gazeX: 1, gazeY: -1, yaw: 0.9, pitch: -0.6, roll: 0.6, wide: -1 }), C.assainir({ jaw: 0.5, wide: 1, frown: 1, browIn: -1 })];
  let erreurs = 0; let total = 0;
  for (const id of ids) for (const a of acc) for (const te of teintes) for (const P2 of extremes) { total++; try { A.dessiner(faux(), id, P2, 540, 960, { accessoire: a, teinte: te, t: 1.7 }); } catch (e) { erreurs++; derniere = id + ' ' + a + ' ' + e.message; } }
  t(erreurs === 0 && mauvais === 0 && appels > 20000, `D1 ${ids.length} personnages × ${acc.length} accessoires × ${teintes.length} teintes × 3 expressions = ${total} dessins : ${erreurs} exception(s), ${mauvais} valeur(s) non numérique(s) ${derniere}, ${appels} appels de tracé`);
  const ext = ids.map((id) => A.etendue(A.PERSOS[id], 'fete'));
  t(ext.every((e) => e.haut > 0.8 && e.bas > 0.8 && e.demi > 0.8 && isFinite(e.haut + e.bas + e.demi)) && A.etendue(A.PERSOS.lapin, 'aucun').haut > A.etendue(A.PERSOS.panda, 'aucun').haut + 0.5, 'D2 cadrage : les grandes oreilles (lapin, âne) demandent plus de place que le panda');
  t(ids.every((id) => C.HAUTEURS[A.PERSOS[id].voix] > 0) && ids.length === 8, 'D3 chaque personnage a sa hauteur de voix');
  const hex = /^#[0-9a-f]{6}$/; let bonnes = true; ids.forEach((id) => teintes.forEach((te) => { const e = A.PERSOS[id]; [e.tete.c, e.tete.c2, e.contour, e.oeil.c].forEach((c) => { if (!hex.test(A.teinter(c, A.TEINTES[te]))) bonnes = false; }); }));
  t(bonnes, 'D4 teintes : toujours une couleur #rrggbb valide');
}

/* ===== E. le câblage ===== */
{
  const html = lire('tools/crea-studio/index.html'), sw = lire('tools/crea-studio/sw.js'), w = lire('services/kdmc-crea-ai/worker.js');
  const boutons = (html.match(/<button[^>]*data-go="/g) || []).length;
  t((html.match(/data-go="avatar"/g) || []).length === 1 && (html.match(/id="s-avatar"/g) || []).length === 1 && boutons === 10, `E1 page : bouton « Avatars » (1) et section (1), ${boutons} boutons dans la barre`);
  const ordre = ['avatar-core.js', 'avatar-rendu.js', 'avatar-persos.js', 'avatar-studio.js'].map((f) => html.indexOf(`<script src="${f}"`));
  t(ordre.every((v, i) => v > 0 && (i === 0 || v > ordre[i - 1])) && ordre[0] > html.indexOf('Account.init()'), 'E1 les 4 scripts sont chargés dans l\'ordre (cœur, rendu, personnages, écran), après le script principal');
  t(/Avatar\.pause\(\)/.test(html) && /Avatar\.activer\(\)/.test(html) && /Avatar\.partager\(\)/.test(html), 'E1 go() éteint la caméra de l\'avatar en sortant et le réveille en entrant ; « Exporter » partage la vidéo');
  const vApp = (html.match(/var APP_VER='(v[\d.]+)'/) || [])[1], vSw = (sw.match(/crea-studio-(v[\d.]+)/) || [])[1];
  t(vApp && vApp === vSw && ['core', 'rendu', 'persos', 'studio'].every((n) => sw.includes(`./avatar-${n}.js`)), `E2 service worker : version ${vSw} = page ${vApp}, les 4 fichiers sont gardés hors ligne`);
  t(/crea-studio-mediapipe-v1/.test(sw) && /k\.indexOf\('crea-studio-mediapipe'\) !== 0/.test(sw) && /storage\\.googleapis\\.com\\\/mediapipe-models/.test(sw), 'E2 le suivi de visage (13 Mo) est gardé hors ligne et survit aux mises à jour');
  t(/feutre:/.test(w) && /peluche:/.test(w) && /lego:/.test(w) && /const KEEP_AVATAR/.test(w) && /avatar: !!\(body && body\.avatar === true\)/.test(w) && /promptCartoon\(opts\.style, opts\.extra, opts\.avatar\)/.test(w), 'E3 worker IA : looks feutre / peluche / brique et consigne « tête de face, bouche fermée » quand avatar=true');
  const fichiers = ['core', 'rendu', 'persos', 'studio'].map((n) => lire(`tools/crea-studio/avatar-${n}.js`)).join('\n');
  const hotes = [...fichiers.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => new URL(m[0].replace(/[,;]$/, '')).hostname).filter((h, i, a) => a.indexOf(h) === i);
  t(hotes.every((h) => ['cdn.jsdelivr.net', 'storage.googleapis.com'].includes(h)), `E4 seuls réseaux nommés : ${hotes.join(', ')} (module + modèle de suivi de visage)`);
  const innerHTML = [...fichiers.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim()); const sures = innerHTML.every((v) => /^(''|'[^'+]*'|"[^"+]*")$/.test(v));
  t(sures && !/\beval\(|new Function\(|document\.write\(/.test(fichiers), `E4 aucune donnée dans innerHTML (${innerHTML.length} affectation(s), toutes des textes fixes) ; ni eval ni document.write`);
  const pk = lire('package.json'); t(/"test:crea-avatars"/.test(pk) && /npm run test:crea-avatars/.test(pk.match(/"test:ci":\s*"([^"]*)"/)[1]), 'E5 le garde est câblé dans test:ci');
}

console.log(`\n${ko ? '❌ ' + ko + ' échec(s) sur ' + (ok + ko) : '✅ ' + ok + ' contrôles OK — moteur d\'avatars : maillage, voix, caméra, tête, paquet, personnages, câblage'}`);
process.exit(ko ? 1 : 0);
