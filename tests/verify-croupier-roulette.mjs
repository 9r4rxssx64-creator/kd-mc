/* ORACLE INDÉPENDANT — les 9 exercices ROULETTE de l'entraîneur de croupier.
 *
 * POURQUOI (Kevin 4.11.2026 : « l'exercice n°2 a de fausses réponses, vérifie TOUS les exercices en réel ») :
 * un exercice faux, c'est quelqu'un qui apprend une erreur et la répète à une vraie table de Monaco.
 *
 * Ce script NE RÉUTILISE PAS la logique du moteur (placeMise, gainAnnonce, compositionComplet, voisins…).
 * Il charge la vraie page dans Chromium, appelle seulement les générateurs (MODES[k].gen(niveau)), puis
 * relit CE QUI EST AFFICHÉ — le texte de l'énoncé, la question, l'explication, et le dessin SVG (jetons,
 * case sortante, secteur du cylindre) — et recalcule la réponse avec SA PROPRE table du tapis, SES
 * propres rapports (35/17/11/8/5/2/1), SES propres annonces et SON propre cylindre.
 *
 * Contrôlé sur 600 tirages par exercice ET par niveau (facile / normal / croupier) :
 *   - la réponse du moteur = celle de l'oracle ; l'explication dit la même chose que la réponse ;
 *   - l'énoncé, le dessin et la question racontent la même histoire (numéros, mises, numéro sortant) ;
 *   - la question dit sans ambiguïté « le gain seul, sans rendre la mise » quand il s'agit de payer ;
 *   - aucune mise en double, aucun NaN / undefined, une réponse que le pavé du téléphone peut taper ;
 *   - estJuste accepte la bonne réponse (dans tous les formats) et refuse les fausses.
 * Puis l'AFFICHAGE : iPhone 13 portrait (390×844) et paysage (844×390), les 9 exercices : pas de
 * débordement horizontal, pas de texte coupé, boutons ≥ 44 px, tapis lisible.
 *
 * `npm run test:croupier-roulette-oracle` · SABOTAGE=1 : un rapport et une annonce sont faussés → doit rougir.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = process.env.CROUPIER_DIR ? path.resolve(process.env.CROUPIER_DIR) : path.join(ROOT, 'shops/croupier');   /* CROUPIER_DIR=<ancien dossier> : rejouer contre une ancienne version (doit rougir) */
const SABOTAGE = process.env.SABOTAGE === '1';
const TIRAGES = Number(process.env.TIRAGES || 600);
const PORT = Number(process.env.PORT_ORACLE || 8811);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DOSSIER, p.replace(/^\/+/, ''));
  if (!f.startsWith(DOSSIER) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  if (SABOTAGE && f.endsWith('entrainement.js')) {
    /* Deux fautes de métier : le carré paie 9 au lieu de 8, et les orphelins prennent 17/21 au lieu de 17/20. */
    let s = fs.readFileSync(f, 'utf8');
    s = s.replace("couvre:4,  paie:8,", 'couvre:4,  paie:9,').replace('[[17,20],1]', '[[17,21],1]');
    return r.end(s);
  }
  r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, r));

const echecs = [], ok = [];
const verifie = (nom, cond, detail = '') => cond ? ok.push(nom) : echecs.push(`${nom}${detail ? ' — ' + detail : ''}`);

/* ══ NOS PROPRES FAITS (écrits ici, jamais lus dans le moteur) ═══════════════════════════ */
const CYL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const ROUGE = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const RAPPORT = { 1: 35, 2: 17, 3: 11, 4: 8, 6: 5, 12: 2, 18: 1 };   /* selon le nombre de numéros couverts */
const CHANCE = {
  rouge: (n) => ROUGE.has(n), noir: (n) => n >= 1 && !ROUGE.has(n), pair: (n) => n >= 1 && n % 2 === 0,
  impair: (n) => n % 2 === 1, manque: (n) => n >= 1 && n <= 18, passe: (n) => n >= 19 && n <= 36,
};
const ANN = {   /* [numéros, pièces] */
  voisins: { nom: 'Voisins du zéro', p: [[[0, 2, 3], 2], [[4, 7], 1], [[12, 15], 1], [[18, 21], 1], [[19, 22], 1], [[32, 35], 1], [[25, 26, 28, 29], 2]], pieces: 9, nums: 17 },
  tiers: { nom: 'Tiers du cylindre', p: [[[5, 8], 1], [[10, 11], 1], [[13, 16], 1], [[23, 24], 1], [[27, 30], 1], [[33, 36], 1]], pieces: 6, nums: 12 },
  orphelins: { nom: 'Orphelins', p: [[[1], 1], [[6, 9], 1], [[14, 17], 1], [[17, 20], 1], [[31, 34], 1]], pieces: 5, nums: 8 },
  jeuzero: { nom: 'Jeu zéro', p: [[[0, 3], 1], [[12, 15], 1], [[26], 1], [[32, 35], 1]], pieces: 4, nums: 7 },
};
const ANN_PAR_NOM = Object.fromEntries(Object.values(ANN).map((a) => [a.nom, a]));
const ROND = new Set([1, 2, 5, 10, 20, 25, 50, 100]);

const ligne = (n) => Math.floor((n - 1) / 3), col = (n) => (n - 1) % 3;
const tri = (l) => [...l].sort((a, b) => a - b);
const memes = (a, b) => JSON.stringify(tri(a)) === JSON.stringify(tri(b));
const rapportDe = (nums) => RAPPORT[nums.length];
const texte = (h) => String(h).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');
const gras = (h) => [...String(h).matchAll(/<b>(.*?)<\/b>/g)].map((m) => m[1]);

/* Lit un libellé de mise du moteur (« cheval 16/17 », « 2e douzaine (13 à 24) »…) et le TRADUIT en numéros avec NOTRE géométrie. */
function lis(lib) {
  let m;
  if ((m = /^plein (\d+)$/.exec(lib))) return { t: 'plein', nums: [+m[1]] };
  if ((m = /^cheval (\d+)\/(\d+)$/.exec(lib))) return { t: 'cheval', nums: [+m[1], +m[2]] };
  if ((m = /^transversale (\d+)\/(\d+)\/(\d+)$/.exec(lib))) return { t: 'transversale', nums: [+m[1], +m[2], +m[3]] };
  if ((m = /^carré (\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(lib))) return { t: 'carre', nums: [+m[1], +m[2], +m[3], +m[4]] };
  if ((m = /^sixain (\d+) à (\d+)$/.exec(lib))) return { t: 'sixain', nums: Array.from({ length: 6 }, (_, i) => +m[1] + i), fin: +m[2] };
  if ((m = /^(1re|2e|3e) douzaine \((\d+) à (\d+)\)$/.exec(lib))) {
    const k = { '1re': 1, '2e': 2, '3e': 3 }[m[1]];
    return { t: 'douzaine', nums: Array.from({ length: 12 }, (_, i) => 12 * (k - 1) + 1 + i), a: +m[2], b: +m[3], zone: `douzaine-${k}` };
  }
  if ((m = /^(1re|2e|3e) colonne$/.exec(lib))) {
    const k = { '1re': 1, '2e': 2, '3e': 3 }[m[1]];
    return { t: 'colonne', nums: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => col(n) === k - 1), zone: `colonne-${k}` };
  }
  if ((m = /^chance simple (Rouge|Noir|Pair|Impair|Manque|Passe)$/.exec(lib))) {
    const c = m[1].toLowerCase();
    return { t: 'simple', nums: Array.from({ length: 36 }, (_, i) => i + 1).filter(CHANCE[c]), zone: `simple-${c}` };
  }
  return null;
}
/* La mise est-elle POSABLE à un vrai tapis ? (forme + numéros) */
function posable(b) {
  const n = b.nums;
  if (n.some((x) => !(x >= 1 && x <= 36))) return false;
  const s = tri(n);
  switch (b.t) {
    case 'plein': return n.length === 1;
    case 'cheval': return n.length === 2 && ((s[1] - s[0] === 1 && ligne(s[0]) === ligne(s[1])) || s[1] - s[0] === 3);
    case 'transversale': return s[0] % 3 === 1 && s[1] === s[0] + 1 && s[2] === s[0] + 2;
    case 'carre': return col(s[0]) < 2 && s[1] === s[0] + 1 && s[2] === s[0] + 3 && s[3] === s[0] + 4;
    case 'sixain': return s[0] % 3 === 1 && s[5] === s[0] + 5 && b.fin === s[5];
    case 'douzaine': return b.a === s[0] && b.b === s[11] && s[11] - s[0] === 11;
    case 'colonne': return n.length === 12;
    case 'simple': return n.length === 18;
    default: return false;
  }
}
const NOM_TYPE = { plein: 'Plein', cheval: 'Cheval', transversale: 'Transversale pleine', carre: 'Carré', sixain: 'Sixain', douzaine: 'Douzaine', colonne: 'Colonne', simple: 'Chance simple' };
const COUVRE = { plein: 1, cheval: 2, transversale: 3, carre: 4, sixain: 6, douzaine: 12, colonne: 12, simple: 18 };
const AIDE = { plein: 'un seul numéro', cheval: 'deux numéros voisins', transversale: 'une ligne de trois', carre: 'quatre numéros', sixain: 'deux lignes', douzaine: '12 numéros', colonne: '12 numéros', simple: 'rouge/noir, pair/impair, manque/passe' };

/* ══ LA PAGE ═════════════════════════════════════════════════════════════════════════════ */
const MODES = ['roulette', 'roulette-combinee', 'roulette-tapis', 'roulette-complet', 'roulette-annonces', 'roulette-decomposer', 'roulette-finales', 'roulette-cylindre', 'roulette-voisins-n'];
const NIVEAUX = ['facile', 'normal', 'croupier'];

async function lanceur() {
  const essais = [undefined, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/usr/bin/google-chrome'];
  let derniere;
  for (const executablePath of essais) {
    try { return await chromium.launch(executablePath ? { executablePath } : {}); } catch (e) { derniere = e; }
  }
  throw derniere;
}
const nav = await lanceur();
const erreursJS = [];
async function ouvre(viewport) {
  const ctx = await nav.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreursJS.push(String(e && e.message || e)));
  await page.goto(`http://127.0.0.1:${PORT}/entrainement.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => !!window.__ENTRAINEUR && !!window.__VISUELS, { timeout: 10000 });
  return page;
}

/* Dans la page : tire N exercices, DESSINE le visuel, lit ce qui est affiché, teste estJuste. */
function collecte(page, mode, niveau, n) {
  return page.evaluate(({ mode, niveau, n }) => {
    const E = window.__ENTRAINEUR, V = window.__VISUELS, sortie = [];
    for (let i = 0; i < n; i++) {
      const exo = E.MODES[mode].gen(niveau);
      const boite = document.createElement('div'); document.body.appendChild(boite);
      if (exo.visuel) V.dessine(exo.visuel, boite, { revele: false });
      const dom = { present: !!boite.querySelector('svg') };
      boite.querySelectorAll('.jeton').forEach(() => { dom.jetons = dom.jetons || []; });
      dom.jetons = [...boite.querySelectorAll('.jeton')].map((g) => ({ v: +g.getAttribute('data-v'), nums: (g.getAttribute('data-nums') || '').split(',').filter(Boolean).map(Number), type: g.getAttribute('data-type'), zone: g.getAttribute('data-zone'), cx: +g.getAttribute('data-cx'), cy: +g.getAttribute('data-cy'), texte: (g.querySelector('text') || {}).textContent }));
      dom.cases = [...boite.querySelectorAll('rect[data-num]')].map((r) => ({ num: +r.getAttribute('data-num'), sortant: r.getAttribute('data-sortant') === '1', fort: r.getAttribute('stroke-width') === '3', texte: (r.parentNode.querySelector('text') || {}).textContent, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }));
      dom.zones = [...boite.querySelectorAll('rect[data-zone]')].map((r) => ({ zone: r.getAttribute('data-zone'), x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), texte: (r.parentNode.querySelector('text') || {}).textContent }));
      dom.secteurs = [...boite.querySelectorAll('path[data-num]')].map((p) => ({ num: +p.getAttribute('data-num'), etat: p.getAttribute('data-etat'), sortant: p.getAttribute('data-sortant') === '1', texte: (p.parentNode.querySelector('text') || {}).textContent }));
      boite.remove();
      /* estJuste : la bonne réponse sous toutes ses formes, et des réponses fausses */
      const r = exo.reponse, t = exo.type || 'nombre', test = { bonnes: [], fausses: [] };
      const bon = (s) => test.bonnes.push([s, !!window.estJuste(exo, s)]);
      const faux = (s) => test.fausses.push([s, !!window.estJuste(exo, s)]);
      if (t === 'liste' || t === 'suite') {
        bon(window.reponseLisible(exo)); bon(r.join(',')); bon(r.join(', '));
        bon([...r].reverse().join(','));
        faux(r.slice(1).join(',')); faux(r.concat([r[0]]).join(',')); faux(r.map((x, j) => (j === 0 ? (x + 1) % 37 : x)).join(',')); faux('');
      } else {
        bon(String(r)); bon(window.reponseLisible(exo)); bon(' ' + r + ' ');
        [r + 1, r + 2, r - 1, r * 2, Number(String(r) + '0'), 37 - r].filter((v) => v !== r).forEach((v) => faux(String(v))); faux('');
      }
      sortie.push({ enonce: exo.enonce, question: exo.question, reponse: exo.reponse, type: exo.type || 'nombre', explique: exo.explique, mode: exo.mode, visuel: exo.visuel ? exo.visuel.type : null, dom, test, lisible: window.reponseLisible(exo) });
    }
    return sortie;
  }, { mode, niveau, n });
}

/* ══ LES CONTRÔLES, UN PAR EXERCICE ══════════════════════════════════════════════════════ */
const num = (s) => (String(s).match(/\d+/g) || []).map(Number);
function valeurSure(x) { return !/NaN|undefined|null|\[object|Infinity/.test(String(x)); }

function controleGeneral(k, x, e) {
  const bad = [];
  if (!valeurSure(x.enonce) || !valeurSure(x.question) || !valeurSure(x.explique) || !valeurSure(JSON.stringify(x.reponse))) bad.push('NaN/undefined affiché');
  if (x.type === 'liste') {
    if (!Array.isArray(x.reponse) || !x.reponse.length || x.reponse.some((v) => !Number.isInteger(v) || v < 0 || v > 36)) bad.push('liste hors 0..36');
    if (new Set(x.reponse).size !== x.reponse.length) bad.push('liste avec doublon');
    if (x.reponse.join(',').length > 40) bad.push('liste trop longue pour le champ (40 car.)');
  } else {
    const min = k === 'roulette-decomposer' ? 0 : 1;   /* « avec quel numéro ? » peut avoir pour réponse le 0 */
    if (!Number.isInteger(x.reponse) || x.reponse < min) bad.push(`réponse non entière positive : ${x.reponse}`);
    if (!/^\d+$/.test(String(x.reponse))) bad.push(`réponse non saisissable au pavé : ${x.reponse}`);
  }
  x.test.bonnes.forEach(([s, v]) => { if (!v) bad.push(`estJuste refuse la bonne réponse « ${s} »`); });
  x.test.fausses.forEach(([s, v]) => { if (v) bad.push(`estJuste accepte la fausse réponse « ${s} »`); });
  if (x.mode !== k) bad.push(`mode ${x.mode}`);
  return bad;
}
/* La question demande un PAIEMENT : elle doit dire que c'est le gain seul (la mise n'est pas rendue). */
function questionPaiementClaire(q, enonce) { return /gain/i.test(q) && /(sans|hors)[^?]*mise/i.test(q); }

/* Les chances de tirage affichées : n sortant du dessin = n de l'énoncé. */
function sortantDuTapis(x) { const s = x.dom.cases.filter((c) => c.sortant); return s.length === 1 ? s[0].num : null; }

/* Le dessin du tapis dit la même chose que la mise : chaque jeton est SUR les cases qu'il couvre (ou dans la bonne boîte pour l'extérieur),
   chaque case porte le numéro qu'elle affiche, et deux jetons ne se recouvrent pas au point de cacher une valeur. */
const LIB_ZONE = { 'simple-rouge': 'Rouge', 'simple-noir': 'Noir', 'simple-pair': 'Pair', 'simple-impair': 'Impair', 'simple-manque': 'Manque', 'simple-passe': 'Passe', 'colonne-1': '2 à 1', 'colonne-2': '2 à 1', 'colonne-3': '2 à 1', 'douzaine-1': '1re 12', 'douzaine-2': '2e 12', 'douzaine-3': '3e 12' };
function controleDessinTapis(x) {
  const bad = [], cs = x.dom.cases, js = x.dom.jetons;
  cs.forEach((c) => { if (String(c.num) !== String(c.texte)) bad.push(`case ${c.num} affiche « ${c.texte} »`); });
  js.forEach((j) => {
    if (String(j.v) !== String(j.texte)) bad.push(`jeton de ${j.v} affiche « ${j.texte} »`);
    const b = lis(`${{ plein: 'plein', cheval: 'cheval', transversale: 'transversale', carre: 'carré' }[j.type] || ''}`);   /* (type seul : sert juste à tester la forme ci-dessous) */
    if (/^(douzaine|colonne|simple)$/.test(j.type)) {
      const z = x.dom.zones.find((q) => q.zone === j.zone);
      if (!z) bad.push(`jeton ${j.type} sans boîte ${j.zone}`);
      else {
        if (j.cx < z.x || j.cx > z.x + z.w || j.cy < z.y || j.cy > z.y + z.h) bad.push(`jeton ${j.zone} hors de sa boîte`);
        if (z.texte !== LIB_ZONE[j.zone]) bad.push(`boîte ${j.zone} porte l'étiquette « ${z.texte} »`);
      }
      /* la zone du dessin doit couvrir les mêmes numéros que le jeton */
      const att = j.zone.startsWith('colonne') ? Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => col(n) === +j.zone.slice(-1) - 1)
        : j.zone.startsWith('douzaine') ? Array.from({ length: 12 }, (_, i) => 12 * (+j.zone.slice(-1) - 1) + 1 + i)
          : Array.from({ length: 36 }, (_, i) => i + 1).filter(CHANCE[j.zone.slice(7)]);
      if (!memes(att, j.nums)) bad.push(`jeton ${j.zone} : numéros ≠ boîte`);
    } else {
      const sous = j.nums.map((n) => cs.find((c) => c.num === n));
      if (sous.some((c) => !c)) { bad.push(`jeton ${j.type} ${j.nums} : une case couverte n'est pas dessinée`); return; }
      const x0 = Math.min(...sous.map((c) => c.x)), x1 = Math.max(...sous.map((c) => c.x + c.w)), y0 = Math.min(...sous.map((c) => c.y)), y1 = Math.max(...sous.map((c) => c.y + c.h));
      if (j.cx < x0 - 0.5 || j.cx > x1 + 0.5 || j.cy < y0 - 0.5 || j.cy > y1 + 0.5) bad.push(`jeton ${j.type} ${j.nums} posé hors de ses cases`);
      if (j.type === 'plein' && (Math.abs(j.cx - (x0 + x1) / 2) > 1 || Math.abs(j.cy - (y0 + y1) / 2) > 1)) bad.push('plein pas au centre de sa case');
      if (j.type === 'cheval' || j.type === 'carre') { if (Math.abs(j.cx - (x0 + x1) / 2) > 1 || Math.abs(j.cy - (y0 + y1) / 2) > 1) bad.push(`${j.type} ${j.nums} pas à cheval sur ses cases`); }
    }
  });
  for (let a = 0; a < js.length; a++) for (let b = a + 1; b < js.length; b++) {
    const d = Math.hypot(js[a].cx - js[b].cx, js[a].cy - js[b].cy);
    if (d < 14) bad.push(`deux jetons (${js[a].type} ${js[a].nums} / ${js[b].type} ${js[b].nums}) se recouvrent presque (${d.toFixed(0)} px)`);
  }
  return bad;
}

const ctl = {};

ctl['roulette'] = (x, niv) => {
  const bad = [];
  const m = /^<b>(.+?)<\/b> — (.+?)<br>Mise de <b>(\d+)<\/b> sur (.+?)\. Le <b>(\d+)<\/b> sort\.$/.exec(x.enonce);
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const [, nom, aide, mise, lib, n] = [...m]; const M = +mise, N = +n;
  const b = lis(lib);
  if (!b) return ['libellé inconnu : ' + lib];
  if (!posable(b)) bad.push('mise non posable : ' + lib);
  if (nom !== NOM_TYPE[b.t]) bad.push(`nom « ${nom} » ≠ mise ${b.t}`);
  if (aide !== AIDE[b.t]) bad.push(`aide « ${aide} » ≠ ${AIDE[b.t]}`);
  if (b.nums.length !== COUVRE[b.t]) bad.push('couverture ' + b.nums.length);
  if (!b.nums.includes(N)) bad.push(`le ${N} ne gagne pas sur ${lib}`);
  const attendu = M * rapportDe(b.nums);
  if (x.reponse !== attendu) bad.push(`réponse ${x.reponse} ≠ ${attendu} (${M}×${rapportDe(b.nums)}, ${lib}, le ${N})`);
  const ex = /^(\d+) × (\d+) = (\d+)/.exec(x.explique);
  if (!ex || +ex[1] !== M || +ex[2] !== rapportDe(b.nums) || +ex[3] !== attendu) bad.push('explication ≠ réponse : ' + x.explique);
  if (!new RegExp(`paie ${rapportDe(b.nums)} fois la mise`).test(x.explique)) bad.push('explication : rapport non dit');
  if (!/mise reste au joueur/.test(x.explique)) bad.push('explication : mise non rendue non dite');
  if (!questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
  /* dessin = énoncé */
  const j = x.dom.jetons;
  if (j.length !== 1 || j[0].v !== M || !memes(j[0].nums, b.nums)) bad.push('dessin ≠ énoncé : ' + JSON.stringify(j));
  if (sortantDuTapis(x) !== N) bad.push('case sortante du dessin ≠ ' + N);
  if (niv === 'facile' && !ROND.has(M)) bad.push('facile : mise non ronde ' + M);
  return bad;
};

/* Lit « <b>M</b> en NOM (LIB) » (combinée) ou « <b>M</b> en LIB » (tapis) */
function ligneMise(l, avecNom) {
  const m = avecNom ? /^<b>(\d+)<\/b> en (.+?) \((.+)\)$/.exec(l) : /^<b>(\d+)<\/b> en (.+)$/.exec(l);
  if (!m) return null;
  return avecNom ? { v: +m[1], nom: m[2], lib: m[3] } : { v: +m[1], lib: m[2] };
}
function dessinContient(x, lignes) {
  const a = x.dom.jetons.map((j) => `${j.v}|${tri(j.nums).join(',')}`).sort();
  const b = lignes.map((l) => `${l.v}|${tri(l.b.nums).join(',')}`).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

ctl['roulette-combinee'] = (x, niv) => {
  const bad = [];
  const m = /^Le <b>(\d+)<\/b> sort\. Ces mises gagnent :<br>(.+)$/.exec(x.enonce);
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const N = +m[1];
  const lignes = m[2].split('<br>').map((l) => ligneMise(l, true));
  if (lignes.some((l) => !l)) return ['ligne illisible : ' + m[2]];
  let total = 0; const libs = new Set(); const types = new Set(); const det = [];
  lignes.forEach((l) => {
    l.b = lis(l.lib);
    if (!l.b) { bad.push('libellé inconnu ' + l.lib); return; }
    if (!posable(l.b)) bad.push('non posable ' + l.lib);
    if (l.nom !== NOM_TYPE[l.b.t].toLowerCase()) bad.push(`« ${l.nom} » ≠ ${l.lib}`);
    if (!l.b.nums.includes(N)) bad.push(`la mise ${l.lib} ne gagne pas au ${N}`);
    if (libs.has(l.lib)) bad.push('mise en double ' + l.lib); libs.add(l.lib); types.add(l.b.t);
    total += l.v * rapportDe(l.b.nums); det.push(`${l.v}×${rapportDe(l.b.nums)}=${l.v * rapportDe(l.b.nums)}`);
  });
  if (lignes.length < 2) bad.push('moins de 2 mises');
  if (niv === 'facile' && lignes.length !== 2) bad.push('facile : ' + lignes.length + ' mises');
  if (x.reponse !== total) bad.push(`réponse ${x.reponse} ≠ ${total} (${det.join(' + ')})`);
  if (x.explique !== det.join('  +  ') + '  =  ' + total) bad.push(`explication « ${x.explique} » ≠ « ${det.join('  +  ')}  =  ${total} »`);
  if (!questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
  if (!dessinContient(x, lignes)) bad.push('dessin ≠ énoncé : ' + JSON.stringify(x.dom.jetons) + ' vs ' + m[2]);
  if (sortantDuTapis(x) !== N) bad.push('case sortante du dessin ≠ ' + N);
  if (niv === 'facile' && lignes.some((l) => !ROND.has(l.v))) bad.push('facile : mise non ronde');
  return bad;
};

ctl['roulette-tapis'] = (x, niv) => {
  const bad = [];
  const m = /^Le <b>(\d+)<\/b> sort\. Sur le tapis :<br>(.+)$/.exec(x.enonce);
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const N = +m[1];
  const lignes = m[2].split('<br>').map((l) => ligneMise(l, false));
  if (lignes.some((l) => !l)) return ['ligne illisible : ' + m[2]];
  const libs = new Set();
  lignes.forEach((l) => {
    l.b = lis(l.lib);
    if (!l.b) { bad.push('libellé inconnu ' + l.lib); return; }
    if (!posable(l.b)) bad.push('non posable ' + l.lib);
    if (libs.has(l.lib)) bad.push('mise en double ' + l.lib); libs.add(l.lib);
    l.gagne = l.b.nums.includes(N);
  });
  const gag = lignes.filter((l) => l.gagne), per = lignes.filter((l) => !l.gagne);
  if (!gag.length || !per.length) bad.push(`il faut ≥1 gagnante et ≥1 perdante (${gag.length}/${per.length})`);
  if (niv === 'facile' && lignes.length !== 3) bad.push('facile : ' + lignes.length + ' mises');
  const ramasse = /ramasses/.test(x.question);
  if (ramasse) {
    const r = per.reduce((s, l) => s + l.v, 0);
    if (x.reponse !== r) bad.push(`ramasse ${x.reponse} ≠ ${r}`);
    const mm = /^Perdantes : (.+) → (\d+)\. On ramasse/.exec(x.explique);
    if (!mm) bad.push('explication illisible : ' + x.explique);
    else {
      const items = [...mm[1].matchAll(/(.+?) \((\d+)\)(?:, |$)/g)].map((q) => ({ lib: q[1], v: +q[2] }));
      const att = per.map((l) => `${l.lib}|${l.v}`).sort(), got = items.map((i) => `${i.lib}|${i.v}`).sort();
      if (JSON.stringify(att) !== JSON.stringify(got)) bad.push('explication : perdantes citées ≠ perdantes du tapis');
      if (+mm[2] !== r) bad.push('explication : total ≠ réponse');
    }
    if (!/ramasse/.test(x.question) || /gain/.test(x.question)) bad.push('question de ramassage ambiguë : ' + x.question);
  } else {
    const t = gag.reduce((s, l) => s + l.v * rapportDe(l.b.nums), 0);
    if (x.reponse !== t) bad.push(`total ${x.reponse} ≠ ${t}`);
    const partie = x.explique.split('. Les autres mises perdent')[0];
    const items = partie.split('  +  ').map((p) => /^(.+) : (\d+)×(\d+)=(\d+)(?:  =  (\d+))?$/.exec(p));
    if (items.some((i) => !i)) bad.push('explication illisible : ' + x.explique);
    else {
      const att = gag.map((l) => `${l.lib}|${l.v}|${rapportDe(l.b.nums)}|${l.v * rapportDe(l.b.nums)}`).sort();
      const got = items.map((i) => `${i[1]}|${i[2]}|${i[3]}|${i[4]}`).sort();
      if (JSON.stringify(att) !== JSON.stringify(got)) bad.push('explication : gagnantes citées ≠ gagnantes du tapis');
      const fin = items[items.length - 1][5];
      if (items.length > 1 && +fin !== t) bad.push('explication : total ≠ réponse');
    }
    if (!/Total/.test(x.question) || !questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
  }
  if (!dessinContient(x, lignes)) bad.push('dessin ≠ énoncé');
  if (sortantDuTapis(x) !== N) bad.push('case sortante du dessin ≠ ' + N);
  return bad;
};

/* Le complet : NOUS énumérons toutes les mises du tapis qui touchent le numéro (au lieu de reprendre la composition du moteur). */
function completDe(n) {
  const bets = [{ t: 'plein', nums: [n] }];
  for (let a = 1; a <= 36; a++) {
    if (col(a) < 2 && (a + 1 === n || a === n)) bets.push({ t: 'cheval', nums: [a, a + 1] });
    if (a + 3 <= 36 && (a === n || a + 3 === n)) bets.push({ t: 'cheval', nums: [a, a + 3] });
  }
  for (let a = 1; a <= 34; a += 3) if (a <= n && n <= a + 2) bets.push({ t: 'transversale', nums: [a, a + 1, a + 2] });
  for (let a = 1; a <= 32; a++) if (col(a) < 2 && [a, a + 1, a + 3, a + 4].includes(n)) bets.push({ t: 'carre', nums: [a, a + 1, a + 3, a + 4] });
  for (let a = 1; a <= 31; a += 3) if (a <= n && n <= a + 5) bets.push({ t: 'sixain', nums: [a, a + 1, a + 2, a + 3, a + 4, a + 5] });
  /* pièces proportionnelles au nombre de numéros couverts : 1-2-3-4-6 */
  bets.forEach((b) => { b.pieces = b.nums.length; });
  return bets;
}
ctl['roulette-complet'] = (x, niv) => {
  const bad = [];
  let m = /^Le <b>complet du (\d+)<\/b> \(pièces proportionnelles 1-2-3-4-6\)\.$/.exec(x.enonce), cas = 'A', U = 1, sort = null;
  if (!m) { m = /^Le <b>complet du (\d+)<\/b> à <b>(\d+)<\/b> la pièce\.$/.exec(x.enonce); cas = 'B'; if (m) U = +m[2]; }
  if (!m) { m = /^Le <b>complet du (\d+)<\/b> à <b>(\d+)<\/b> la pièce\. Le <b>(\d+)<\/b> sort\.$/.exec(x.enonce); cas = 'C'; if (m) { U = +m[2]; sort = +m[3]; } }
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const N = +m[1];
  if (sort !== null && sort !== N) bad.push('sort ≠ numéro du complet');
  const bets = completDe(N);
  const pieces = bets.reduce((s, b) => s + b.pieces, 0);
  const gainPiece = bets.reduce((s, b) => s + b.pieces * rapportDe(b.nums), 0);
  const att = cas === 'A' ? pieces : cas === 'B' ? pieces * U : gainPiece * U;
  if (x.reponse !== att) bad.push(`réponse ${x.reponse} ≠ ${att} (complet du ${N}, ${pieces} pièces, ${gainPiece}/pièce, u=${U}, cas ${cas})`);
  const q = { A: 'Combien de pièces en tout ?', B: 'Combien le joueur mise-t-il en tout ?' }[cas];
  if (q && x.question !== q) bad.push('question : ' + x.question);
  if (cas === 'C' && !questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
  const nb = (t) => bets.filter((b) => b.t === t).length;
  const mc = cas === 'C' ? [0, nb('cheval'), nb('carre')] : /^1 plein, (\d+) chevaux ×2, 1 transversale ×3, (\d+) carrés ×4, 2 sixains ×6/.exec(x.explique);
  if (!mc || +mc[1] !== nb('cheval') || +mc[2] !== nb('carre') || nb('transversale') !== 1 || nb('sixain') !== 2) bad.push(`explication : composition ≠ ${nb('cheval')} chevaux/${nb('carre')} carrés : ${x.explique}`);
  if (cas !== 'C') {
    const mp = /= (\d+) pièces/.exec(x.explique);
    if (!mp || +mp[1] !== pieces) bad.push('explication : pièces ≠ ' + pieces);
  } else {
    const mg = /= (\d+) par pièce → \d+ × (\d+) = (\d+)$/.exec(x.explique);
    if (!mg || +mg[1] !== gainPiece || +mg[2] !== U || +mg[3] !== att) bad.push('explication : gain/pièce ≠ ' + gainPiece + ' : ' + x.explique);
    const md = /^35 \+ (\d+)×2×17 \+ 3×11 \+ (\d+)×4×8 \+ 2×6×5 = /.exec(x.explique);
    if (!md || +md[1] !== nb('cheval') || +md[2] !== nb('carre')) bad.push('explication : détail du gain ≠ ' + nb('cheval') + ' chevaux/' + nb('carre') + ' carrés : ' + x.explique);
  }
  /* dessin : une jeton par mise du complet, valeur = pièces × (la pièce de l'énoncé, 1 si l'énoncé n'en donne pas) */
  const dess = x.dom.jetons.map((j) => `${tri(j.nums).join(',')}|${j.v}`).sort();
  const voulu = bets.map((b) => `${tri(b.nums).join(',')}|${b.pieces * U}`).sort();
  if (JSON.stringify(dess) !== JSON.stringify(voulu)) bad.push(`dessin ≠ complet du ${N} (cas ${cas}, u=${U}) : ${x.dom.jetons.map((j) => j.v).join(',')}`);
  if (cas === 'C' ? sortantDuTapis(x) !== N : sortantDuTapis(x) !== null) bad.push('case sortante du dessin incohérente avec l\'énoncé');
  if (N < 4 || N > 33) bad.push('numéro hors 4..33');
  return bad;
};

const nomsAnn = Object.keys(ANN_PAR_NOM);
function secteurDessine(x) { return x.dom.secteurs.filter((s) => s.etat === 'secteur' || s.etat === 'centre' || s.etat === 'masque').map((s) => s.num); }
const sortantCyl = (x) => { const s = x.dom.secteurs.filter((p) => p.sortant); return s.length === 1 ? s[0].num : null; };

ctl['roulette-annonces'] = (x, niv) => {
  const bad = [];
  let m = /^Annonce <b>« (.+?) »<\/b> à <b>(\d+)<\/b> la pièce\.$/.exec(x.enonce), cas = 'A', N = null;
  if (!m) { m = /^<b>« (.+?) »<\/b> à <b>(\d+)<\/b> la pièce\.<br>Le <b>(\d+)<\/b> sort\.$/.exec(x.enonce); cas = 'B'; if (m) N = +m[3]; }
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const a = ANN_PAR_NOM[m[1]]; const U = +m[2];
  if (!a) return ['annonce inconnue : ' + m[1]];
  const nums = [...new Set(a.p.flatMap((p) => p[0]))];
  if (nums.length !== a.nums) bad.push('(oracle) secteur');
  if (cas === 'A') {
    if (x.reponse !== a.pieces * U) bad.push(`mise totale ${x.reponse} ≠ ${a.pieces}×${U}`);
    if (x.explique !== `${a.nom} = ${a.pieces} pièces → ${a.pieces} × ${U} = ${a.pieces * U}`) bad.push('explication : ' + x.explique);
    if (x.question !== 'Combien le joueur doit-il miser en tout ?') bad.push('question : ' + x.question);
  } else {
    const gagnantes = a.p.filter((p) => p[0].includes(N));
    if (!gagnantes.length) bad.push(`le ${N} n'est pas dans ${a.nom}`);
    const t = gagnantes.reduce((s, p) => s + p[1] * U * rapportDe(p[0]), 0);
    if (x.reponse !== t) bad.push(`réponse ${x.reponse} ≠ ${t} (${a.nom}, le ${N}, u=${U})`);
    const items = x.explique.replace(/  =  \d+$/, '').split('  +  ').map((s) => /^([\d/]+) : (\d+)×(\d+)×(\d+) = (\d+)$/.exec(s));
    if (items.some((i) => !i)) bad.push('explication illisible : ' + x.explique);
    else {
      const att = gagnantes.map((p) => `${p[0].join('/')}|${p[1]}|${U}|${rapportDe(p[0])}|${p[1] * U * rapportDe(p[0])}`).sort();
      const got = items.map((i) => i.slice(1).join('|')).sort();
      if (JSON.stringify(att) !== JSON.stringify(got)) bad.push(`explication ≠ pièces gagnantes : ${x.explique}`);
      if (items.length > 1 && !x.explique.endsWith(`  =  ${t}`)) bad.push('explication : total');
    }
    if (!questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
    if (sortantCyl(x) !== N) bad.push('dessin : numéro sortant ≠ ' + N);
  }
  if (!memes(secteurDessine(x), nums)) bad.push(`dessin : secteur ${tri(secteurDessine(x))} ≠ ${tri(nums)}`);
  return bad;
};

ctl['roulette-decomposer'] = (x, niv) => {
  const bad = [];
  let m = /^Annonce <b>« (.+?) »<\/b>\. Le <b>(\d+)<\/b> y est joué à cheval\.$/.exec(x.enonce);
  if (m) {
    const a = ANN_PAR_NOM[m[1]], X = +m[2];
    if (!a) return ['annonce inconnue ' + m[1]];
    const contenant = a.p.filter((p) => p[0].includes(X));
    if (contenant.length !== 1 || contenant[0][0].length !== 2) return [`le ${X} n'a pas UN seul cheval dans ${a.nom} (${JSON.stringify(contenant)})`];
    const Y = contenant[0][0].find((v) => v !== X);
    if (x.reponse !== Y) bad.push(`réponse ${x.reponse} ≠ ${Y} (${a.nom}, ${X})`);
    if (x.question !== 'Avec quel numéro ?') bad.push('question : ' + x.question);
    if (!x.explique.startsWith(`${X}/${Y}. ${a.nom} : `)) bad.push('explication : ' + x.explique);
    if (niv === 'facile' && a.nom !== 'Tiers du cylindre') bad.push('facile : seulement les tiers');
    if (sortantCyl(x) !== X) bad.push('dessin : numéro marqué ≠ ' + X);
    if (!memes(secteurDessine(x), [...new Set(a.p.flatMap((p) => p[0]))])) bad.push('dessin : secteur de l\'annonce');
    /* le cheval lu dans l'explication doit être celui de l'annonce */
    return bad;
  }
  m = /^<b>« Voisins du zéro »<\/b> à <b>(\d+)<\/b> la pièce\.<br>Sur <b>(.+?)<\/b>, tu poses :$/.exec(x.enonce);
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const U = +m[1], lib = m[2];
  let nums;
  if ((m = /^la transversale ([\d/]+)$/.exec(lib))) nums = num(m[1]);
  else if ((m = /^le carré ([\d/]+)$/.exec(lib))) nums = num(m[1]);
  else if ((m = /^le cheval ([\d/]+)$/.exec(lib))) nums = num(m[1]);
  else return ['libellé inconnu ' + lib];
  const piece = ANN.voisins.p.find((p) => memes(p[0], nums));
  if (!piece) return [`${lib} n'est pas une pièce des voisins du zéro`];
  const genre = { 3: 'la transversale', 4: 'le carré', 2: 'le cheval' }[nums.length];
  if (!lib.startsWith(genre)) bad.push(`libellé « ${lib} » : mauvais nom de mise`);
  if (x.reponse !== piece[1] * U) bad.push(`réponse ${x.reponse} ≠ ${piece[1]}×${U} (${lib})`);
  if (!x.explique.startsWith(`${piece[1]} pièce${piece[1] > 1 ? 's' : ''} × ${U} = ${piece[1] * U}.`)) bad.push('explication : ' + x.explique);
  if (!/9 pièces/.test(x.explique)) bad.push('explication : total 9 pièces non dit');
  if (!memes(secteurDessine(x), [...new Set(ANN.voisins.p.flatMap((p) => p[0]))])) bad.push('dessin : secteur des voisins');
  return bad;
};

ctl['roulette-finales'] = (x, niv) => {
  const bad = [];
  let m = /^<b>Finale (\d)<\/b> en plein, à <b>(\d+)<\/b> la pièce\.$/.exec(x.enonce), cas = 'A', N = null;
  if (!m) { m = /^<b>Finale (\d)<\/b> en plein, à <b>(\d+)<\/b> la pièce\. Le <b>(\d+)<\/b> sort\.$/.exec(x.enonce); cas = 'B'; if (m) N = +m[3]; }
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const F = +m[1], U = +m[2];
  const nums = Array.from({ length: 37 }, (_, i) => i).filter((n) => n % 10 === F);   /* la finale 0 = 0, 10, 20, 30 */
  if (cas === 'A') {
    if (x.reponse !== nums.length * U) bad.push(`réponse ${x.reponse} ≠ ${nums.length}×${U} (finale ${F} = ${nums})`);
    if (!x.explique.startsWith(`Finale ${F} = ${nums.join(', ')} → ${nums.length} pièces × ${U} = ${nums.length * U}`)) bad.push('explication : ' + x.explique);
    if (x.question !== 'Combien de jetons faut-il en tout ?') bad.push('question : ' + x.question);
  } else {
    if (!nums.includes(N)) bad.push(`le ${N} n'est pas de la finale ${F}`);
    if (x.reponse !== 35 * U) bad.push(`réponse ${x.reponse} ≠ 35×${U}`);
    if (!x.explique.includes(`${U} × 35 = ${35 * U}`) || !x.explique.includes(`plein du ${N}`)) bad.push('explication : ' + x.explique);
    if (!questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
    const cs = x.dom.cases;
    if (!memes(cs.map((c) => c.num), nums)) bad.push('dessin : numéros ≠ finale ' + F);
    if (cs.filter((c) => c.fort).map((c) => c.num).join() !== String(N)) bad.push('dessin : numéro sortant ≠ ' + N);
    if (x.dom.jetons.some((j) => j.v !== U)) bad.push('dessin : valeur du jeton ≠ ' + U);
  }
  return bad;
};

const voisinsDe = (n, k) => { const i = CYL.indexOf(n), l = []; for (let d = 1; d <= k; d++) l.push(CYL[(i - d + 37) % 37], CYL[(i + d) % 37]); return l; };
const tranche = (n, k) => { const i = CYL.indexOf(n), l = []; for (let d = -k; d <= k; d++) l.push(CYL[(i + d + 37) % 37]); return l; };

ctl['roulette-cylindre'] = (x, niv) => {
  const bad = [];
  const m = /^Sur le cylindre : les <b>(\d+) voisins<\/b> du <b>(\d+)<\/b> \((\d+) de chaque côté\)\.$/.exec(x.enonce);
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const K = +m[3], N = +m[2];
  if (+m[1] !== 2 * K) bad.push(`« ${m[1]} voisins » ≠ 2×${K}`);
  const v = voisinsDe(N, K);
  if (!memes(x.reponse, v)) bad.push(`réponse ${x.reponse} ≠ ${tri(v)} (voisins ${K} du ${N})`);
  if (x.reponse.includes(N)) bad.push('le numéro lui-même est dans la réponse');
  const t = tranche(N, K);
  if (x.explique !== `${t.slice(0, K).join(' – ')}  [ ${N} ]  ${t.slice(K + 1).join(' – ')}`) bad.push(`explication « ${x.explique} » ≠ ${t}`);
  if (niv === 'facile' && K !== 1) bad.push('facile : k=' + K);
  const cs = x.dom.secteurs;
  if (cs.filter((s) => s.etat === 'centre').map((s) => s.num).join() !== String(N)) bad.push('dessin : centre ≠ ' + N);
  if (!memes(cs.filter((s) => s.etat === 'masque').map((s) => s.num), v)) bad.push('dessin : cases masquées ≠ voisins');
  if (cs.filter((s) => s.etat === 'masque').some((s) => s.texte !== '?')) bad.push('dessin : une case masquée montre son numéro');
  return bad;
};

ctl['roulette-voisins-n'] = (x, niv) => {
  const bad = [];
  const m = /^<b>(\d+)<\/b> et ses voisins — <b>(\d)<\/b> de chaque côté(?:, en plein)?, à <b>(\d+)<\/b> la pièce\.(?:<br>Le <b>(\d+)<\/b> sort\.)?$/.exec(x.enonce);
  if (!m) return ['énoncé illisible : ' + x.enonce];
  const N = +m[1], K = +m[2], U = +m[3], S = m[4] ? +m[4] : null;
  const tous = tranche(N, K);
  if (!/en plein|pleins/.test(texte(x.enonce))) bad.push('énoncé : ne dit pas que les numéros sont joués EN PLEIN (35 contre 1) — ambigu');
  if (x.type === 'liste') {
    if (!memes(x.reponse, tous)) bad.push(`réponse ${x.reponse} ≠ ${tri(tous)}`);
    if (x.question !== `Écris les ${2 * K + 1} numéros joués (le ${N} compris), séparés par des virgules`) bad.push('question : ' + x.question);
    if (x.explique !== tous.join(' – ')) bad.push('explication : ' + x.explique);
    if (!memes(x.dom.secteurs.filter((s) => s.etat === 'masque').map((s) => s.num), voisinsDe(N, K))) bad.push('dessin : masque');
  } else if (S === null) {
    if (x.reponse !== (2 * K + 1) * U) bad.push(`réponse ${x.reponse} ≠ ${2 * K + 1}×${U}`);
    if (x.question !== 'Combien le joueur mise-t-il en tout ?') bad.push('question : ' + x.question);
    if (x.explique !== `${2 * K + 1} pleins (${tous.join(', ')}) × ${U} = ${(2 * K + 1) * U}`) bad.push('explication : ' + x.explique);
    if (!memes(secteurDessine(x), tous)) bad.push('dessin : secteur');
  } else {
    if (!tous.includes(S)) bad.push(`le ${S} ne fait pas partie des numéros joués`);
    if (x.reponse !== 35 * U) bad.push(`réponse ${x.reponse} ≠ 35×${U}`);
    if (!questionPaiementClaire(x.question)) bad.push('question ambiguë (gain seul ?) : « ' + x.question + ' »');
    if (!x.explique.startsWith(`Un seul plein gagne : ${U} × 35 = ${35 * U}`)) bad.push('explication : ' + x.explique);
    if (sortantCyl(x) !== S) bad.push('dessin : sortant ≠ ' + S);
    if (!memes(secteurDessine(x), tous)) bad.push('dessin : secteur');
  }
  if (niv === 'facile' && K !== 2) bad.push('facile : k=' + K);
  return bad;
};

/* ══ 1. LES FAITS DU MÉTIER, relus dans la page ═════════════════════════════════════════ */
const page = await ouvre({ width: 390, height: 844 });
const faits = await page.evaluate(() => ({ cyl: window.__ENTRAINEUR.CYLINDRE, ann: window.__ENTRAINEUR.ANNONCES, paie: window.__ENTRAINEUR.PAIE_PAR_COUVERTURE, mises: window.__ENTRAINEUR.MISES_ROULETTE, rouges: window.__ENTRAINEUR.ROUGES, modes: Object.keys(window.__ENTRAINEUR.MODES).filter((k) => /^roulette/.test(k)) }));
verifie('cylindre européen : ordre exact des 37 numéros', JSON.stringify(faits.cyl) === JSON.stringify(CYL));
verifie('rouges : les 18 numéros rouges', memes(faits.rouges, [...ROUGE]));
verifie('les 9 modes roulette sont là, dans l\'ordre', JSON.stringify(faits.modes) === JSON.stringify(MODES), faits.modes.join());
verifie('rapports : plein 35, cheval 17, transversale 11, carré 8, sixain 5, douzaine/colonne 2, chance simple 1',
  faits.mises.every((b) => RAPPORT[b.couvre] === b.paie) && faits.mises.length === 8, JSON.stringify(faits.mises.map((b) => [b.id, b.couvre, b.paie])));
verifie('rapports par couverture des pièces d\'annonce', [1, 2, 3, 4].every((c) => faits.paie[c] === RAPPORT[c]), JSON.stringify(faits.paie));
Object.entries(ANN).forEach(([cle, a]) => {
  const g = faits.ann[cle];
  verifie(`annonce ${cle} : ${a.pieces} pièces, ${a.nums} numéros, mêmes pièces que l'oracle`,
    g && g.nom === a.nom && JSON.stringify(g.pieces.map((p) => [tri(p[0]), p[1]]).sort()) === JSON.stringify(a.p.map((p) => [tri(p[0]), p[1]]).sort()), cle);
});
/* le voisinage du zéro, vérifié sur la roue : voisins = 22 … 25 */
const arc = (de, a) => { const l = []; let i = CYL.indexOf(de); for (;;) { l.push(CYL[i]); if (CYL[i] === a) break; i = (i + 1) % 37; } return l; };
verifie('oracle : voisins du zéro = 17 numéros consécutifs du cylindre (du 22 au 25, par le 0)', memes(arc(22, 25), [...new Set(ANN.voisins.p.flatMap((p) => p[0]))]) && arc(22, 25).length === 17);
verifie('oracle : tiers du cylindre = 12 consécutifs (du 27 au 33)', memes(arc(27, 33), [...new Set(ANN.tiers.p.flatMap((p) => p[0]))]) && arc(27, 33).length === 12);
verifie('oracle : orphelins = 8 numéros (17-34-6 et 1-20-14-31-9 sans le 17 double)', memes([...arc(17, 6), ...arc(1, 9)], [...new Set(ANN.orphelins.p.flatMap((p) => p[0]))]));
verifie('oracle : jeu zéro = 7 numéros (12-35-3-26-0-32-15)', memes(arc(12, 15), [...new Set(ANN.jeuzero.p.flatMap((p) => p[0]))]));

/* ══ 2. LES TIRAGES, À CHAQUE NIVEAU ════════════════════════════════════════════════════ */
let totalControles = 0;
const vusParMode = {};
for (const mode of MODES) {
  for (const niv of NIVEAUX) {
    const lot = await collecte(page, mode, niv, TIRAGES);
    const defauts = {}; const exemples = {};
    lot.forEach((x) => {
      let bad = controleGeneral(mode, x);
      try { bad = bad.concat(ctl[mode](x, niv)); if (x.visuel === 'tapis') bad = bad.concat(controleDessinTapis(x)); } catch (e) { bad.push('oracle a levé : ' + e.message); }
      totalControles++;
      bad.forEach((b) => { const cle = b.replace(/\d+/g, '#').slice(0, 90); defauts[cle] = (defauts[cle] || 0) + 1; exemples[cle] = exemples[cle] || `${b} ‖ ${texte(x.enonce).replace(/\n/g, ' / ')} ‖ ${x.question} → ${x.reponse}`; });
    });
    vusParMode[`${mode}/${niv}`] = lot;
    const cles = Object.keys(defauts);
    verifie(`${mode} · ${niv} : ${TIRAGES} tirages, énoncé / dessin / réponse / explication tous d'accord avec l'oracle`, !cles.length,
      cles.map((c) => `${defauts[c]}× ${exemples[c]}`).slice(0, 4).join(' ||| '));
  }
}
/* variété : chaque exercice donne bien ses variantes (sinon un cas ne serait jamais contrôlé) */
const varietes = { 'roulette-complet': 3, 'roulette-annonces': 2, 'roulette-decomposer': 2, 'roulette-finales': 2, 'roulette-voisins-n': 3, 'roulette-tapis': 2 };
for (const [mode, nbMin] of Object.entries(varietes)) {
  const qs = new Set(vusParMode[`${mode}/normal`].map((x) => x.question.replace(/\d+/g, '#')));
  verifie(`${mode} : ${nbMin} sortes de questions au moins sont tirées`, qs.size >= nbMin, [...qs].join(' | '));
}
verifie('roulette-combinee : le niveau croupier tire jusqu\'à 4 mises, facile exactement 2',
  Math.max(...vusParMode['roulette-combinee/croupier'].map((x) => x.enonce.split('<br>').length - 1)) === 4
  && vusParMode['roulette-combinee/facile'].every((x) => x.enonce.split('<br>').length - 1 === 2));
verifie('aucune erreur JavaScript pendant les tirages', !erreursJS.length, erreursJS.join(' | '));

/* ══ 3. L'AFFICHAGE : iPhone 13 portrait + paysage, les 9 exercices ═══════════════════ */
async function ouvreMode(p, mode) {
  const b = p.locator(`[data-mode="${mode}"]`);
  if (!(await b.isVisible())) {
    for (let i = 0; i < 4 && !(await p.locator('#ecran-accueil').isVisible()); i++)
      await p.locator('.ecran:not([hidden]) [data-va="accueil"], .ecran:not([hidden]) .retour[data-va="jeu"]').first().click();
    await p.click('[data-jeu="roulette"]');
  }
  await b.click();
}
const MESURE = () => {
  const L = innerWidth, H = innerHeight, mal = [];
  const racine = document.querySelector('#ecran-table');
  if (document.documentElement.scrollWidth > L + 1) mal.push(`débordement horizontal de la page (${document.documentElement.scrollWidth} > ${L})`);
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  racine.querySelectorAll('*').forEach((e) => {
    if (!vis(e) || e.closest('svg') && e.tagName.toLowerCase() !== 'svg') return;
    const r = e.getBoundingClientRect();
    if (r.right > L + 1 || r.left < -1) mal.push(`${e.tagName.toLowerCase()}#${e.id || e.className} sort de l'écran (${Math.round(r.left)}→${Math.round(r.right)})`);
    const cs = getComputedStyle(e);
    if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1) mal.push(`texte coupé : ${e.tagName.toLowerCase()}#${e.id || e.className} (${e.scrollWidth}>${e.clientWidth})`);
    if (e.matches('#enonce, #question, #explique, #verdict, #objectif') && e.scrollWidth > e.clientWidth + 1) mal.push('texte coupé : ' + e.id);
  });
  racine.querySelectorAll('button, input, [role=button]').forEach((e) => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) mal.push(`cible trop petite : ${e.tagName.toLowerCase()} ${e.id || e.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
  });
  const svg = racine.querySelector('#visuel svg');
  let lisible = null;
  if (svg) {
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = r.width / vb.width;
    const taille = (sel) => { const t = svg.querySelector(sel); return t ? parseFloat(t.getAttribute('font-size')) * k : null; };
    lisible = { visuel: svg.getAttribute('data-visuel'), echelle: +k.toFixed(2), largeur: Math.round(r.width), hauteur: Math.round(r.height), nombre: taille('text'), jeton: taille('.jeton text') };
    if (r.right > L + 1 || r.left < -1) mal.push('dessin hors écran');
  }
  return { mal, lisible };
};
for (const [nom, vp] of [['portrait 390×844', { width: 390, height: 844 }], ['paysage 844×390', { width: 844, height: 390 }]]) {
  const p = await ouvre(vp);
  for (const mode of MODES) {
    await ouvreMode(p, mode);
    const mal = new Set(); let petit = Infinity, petitJeton = Infinity, echelleMin = Infinity;
    for (let i = 0; i < 14; i++) {
      await p.evaluate((niv) => { window.etat.niveau = niv; window.nouvelExo(); }, NIVEAUX[i % 3]);
      const r = await p.evaluate(MESURE);
      r.mal.forEach((m) => mal.add(m));
      if (r.lisible) { if (r.lisible.nombre !== null) petit = Math.min(petit, r.lisible.nombre); if (r.lisible.jeton) petitJeton = Math.min(petitJeton, r.lisible.jeton); echelleMin = Math.min(echelleMin, r.lisible.echelle); }
    }
    /* après réponse : l'explication et le verdict aussi doivent tenir */
    await p.evaluate(() => { document.getElementById('reponse').value = '1'; window.valide(); });
    const apres = await p.evaluate(MESURE); apres.mal.forEach((m) => mal.add('après réponse : ' + m));
    verifie(`affichage ${nom} · ${mode} : ni débordement, ni texte coupé, boutons ≥ 44 px`, !mal.size, [...mal].slice(0, 4).join(' ; '));
    if (petit < Infinity) console.log(`  mesure ${nom} · ${mode} : chiffres du dessin ≥ ${petit.toFixed(1)} px${petitJeton < Infinity ? `, valeur des jetons ≥ ${petitJeton.toFixed(1)} px` : ''}, échelle ×${echelleMin}`);
    if (petit < Infinity) verifie(`affichage ${nom} · ${mode} : numéros du dessin lisibles (≥ 9 px à l'écran)`, petit >= 9, `plus petit ${petit.toFixed(1)} px`);
    if (petitJeton < Infinity) verifie(`affichage ${nom} · ${mode} : valeur des jetons lisible (≥ 7,5 px à l'écran)`, petitJeton >= 7.5, `plus petit ${petitJeton.toFixed(1)} px`);
  }
  await p.context().close();
}
verifie('aucune erreur JavaScript pendant l\'affichage', !erreursJS.length, erreursJS.join(' | '));

await nav.close(); srv.close();
console.log(`\nORACLE ROULETTE — ${totalControles} exercices contrôlés (${MODES.length} modes × 3 niveaux × ${TIRAGES}) · ${ok.length} contrôles réussis · ${echecs.length} échecs${SABOTAGE ? ' (SABOTAGE actif)' : ''}`);
if (echecs.length) { console.log('\nÉCHECS :'); echecs.forEach((e) => console.log('  ✗ ' + e)); process.exit(1); }
console.log('OK');
