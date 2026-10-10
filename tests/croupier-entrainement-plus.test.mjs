/* L'ENTRAÎNEUR DE CROUPIER+++ — garde des jeux ajoutés le 9.10.2026.
 *
 * POURQUOI : un rapport faux, une annonce mal décomposée ou une règle de tirage
 * inversée, c'est quelqu'un qui apprend une erreur et la répète à une vraie table.
 * Ce test ne fait PAS confiance au moteur : il a ses PROPRES tables (cylindre,
 * annonces, tirage du punto, cotes du craps, classement poker) et recalcule
 * chaque réponse à partir de l'énoncé affiché, sur des centaines de tirages.
 *
 * Il vérifie aussi la règle de Kevin (« comme aujourd'hui ») : un exercice
 * gratuit par jeu, le reste verrouillé dans le moteur ET à l'écran, et que la
 * révision des erreurs ne rouvre jamais un exercice verrouillé.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, 'shops/croupier', p.replace(/^\/+/, ''));
  if (!f.startsWith(path.join(ROOT, 'shops/croupier')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8796, r));

const echecs = [], ok = [];
const verifie = (nom, cond, detail = '') => cond ? ok.push(nom) : echecs.push(`${nom}${detail ? ' — ' + detail : ''}`);

/* ── Nos propres faits (écrits indépendamment du moteur) ─────────────────── */
const CYL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const arc = (de, a) => { const l = []; let i = CYL.indexOf(de); for (;;) { l.push(CYL[i]); if (CYL[i] === a) break; i = (i + 1) % 37; } return l; };
const ATTENDU_ANNONCES = {
  voisins:   { pieces: 9, numeros: arc(22, 25) },          /* 22 … 0 … 25 : 17 numéros */
  tiers:     { pieces: 6, numeros: arc(27, 33) },          /* 27 … 33 : 12 numéros */
  orphelins: { pieces: 5, numeros: [...arc(17, 6), ...arc(1, 9)] }, /* 17-34-6 et 1-20-14-31-9 */
  jeuzero:   { pieces: 4, numeros: arc(12, 15) },          /* 12-35-3-26-0-32-15 */
};
const PAIE = { 1: 35, 2: 17, 3: 11, 4: 8 };
/* Position sur le tapis : le 0 en tête, puis 12 lignes de 3. */
const pos = (n) => n === 0 ? null : { l: Math.ceil(n / 3), c: (n - 1) % 3 };
function pieceValide(nums) {
  if (nums.length === 1) return true;
  if (nums.includes(0)) {
    const autres = nums.filter((x) => x !== 0);
    return autres.every((x) => x >= 1 && x <= 3) && (autres.length === 1 || (autres.length === 2 && Math.abs(autres[0] - autres[1]) === 1));
  }
  const p = nums.map(pos);
  if (nums.length === 2) return (p[0].l === p[1].l && Math.abs(p[0].c - p[1].c) === 1) || (p[0].c === p[1].c && Math.abs(p[0].l - p[1].l) === 1);
  if (nums.length === 4) {
    const ls = [...new Set(p.map((x) => x.l))], cs = [...new Set(p.map((x) => x.c))];
    return ls.length === 2 && cs.length === 2 && Math.abs(ls[0] - ls[1]) === 1 && Math.abs(cs[0] - cs[1]) === 1;
  }
  return false;
}
/* Tableau du punto banco : [points du Banco][3e carte du Punto] → tire ? (ligne « - » = Punto resté) */
const TABLE_BANCO = {
  0: '1111111111', 1: '1111111111', 2: '1111111111',
  3: '1111111101', 4: '0011111100', 5: '0000111100', 6: '0000001100', 7: '0000000000',
};
const valBj = (r) => r === 'A' ? 1 : ['V', 'D', 'R'].includes(r) ? 10 : Number(r);
const valBac = (r) => { const v = valBj(r); return v >= 10 ? 0 : v; };
const cartesDe = (html) => (html.match(/<b>([^<]+)<\/b>/) || [])[1].trim().split(/\s+/).map((t) => ({ r: t.slice(0, -1), c: t.slice(-1) }));
function classe(cartes) {           /* autre chemin que le moteur : par histogramme de rangs */
  const rang = (r) => ({ A: 14, R: 13, D: 12, V: 11 }[r] || Number(r));
  const h = new Array(15).fill(0);
  cartes.forEach((k) => { h[rang(k.r)]++; if (k.r === 'A') h[1]++; });
  const flush = new Set(cartes.map((k) => k.c)).size === 1;
  let suite = false, haut = 0;
  for (let d = 1; d <= 10; d++) if ([0, 1, 2, 3, 4].every((i) => h[d + i] === 1)) { suite = true; haut = d + 4; }
  const n = h.slice(2).filter((x) => x > 0).sort((a, b) => b - a);
  if (suite && flush) return haut === 14 ? 'Quinte flush royale' : 'Quinte flush';
  if (n[0] === 4) return 'Carré';
  if (n[0] === 3 && n[1] === 2) return 'Full';
  if (flush) return 'Couleur';
  if (suite) return 'Quinte';
  if (n[0] === 3) return 'Brelan';
  if (n[0] === 2 && n[1] === 2) return 'Double paire';
  if (n[0] === 2) return 'Paire';
  return 'Carte haute';
}
const nombres = (s) => (String(s).replace(/<[^>]+>/g, ' ').match(/\d+/g) || []).map(Number);

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const erreursJS = [];
page.on('pageerror', (e) => erreursJS.push(String(e && e.message || e)));
await page.goto('http://127.0.0.1:8796/entrainement.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => !!window.__ENTRAINEUR, { timeout: 10000 });

/* v2.0.0 : l'accueil liste les jeux, un jeu ouvre ses exercices. Un exercice s'ouvre donc par les VRAIS
   boutons (accueil → jeu → exercice), comme au doigt — avant, tous les boutons étaient sur une seule page. */
async function ouvreMode(mode) {
  const b = page.locator(`[data-mode="${mode}"]`);
  if (!(await b.isVisible())) {
    const jeu = await page.evaluate((m) => { const l = document.querySelector(`[data-mode="${m}"]`).closest('[data-liste]'); return l ? l.getAttribute('data-liste') : null; }, mode);
    for (let i = 0; i < 4 && !(await page.locator('#ecran-accueil').isVisible()); i++)
      await page.locator('.ecran:not([hidden]) [data-va="accueil"], .ecran:not([hidden]) .retour[data-va="jeu"]').first().click();
    if (jeu) await page.click(`[data-jeu="${jeu}"]`);
  }
  await b.click();
}

/* ── 1. Le cylindre et les annonces sont ceux du métier ───────────────────── */
const faits = await page.evaluate(() => {
  const E = window.__ENTRAINEUR;
  return { cyl: E.CYLINDRE, annonces: E.ANNONCES, paie: E.PAIE_PAR_COUVERTURE };
});
verifie('cylindre : l’ordre européen exact', JSON.stringify(faits.cyl) === JSON.stringify(CYL), JSON.stringify(faits.cyl));
verifie('cylindre : 37 cases, chaque numéro une fois', new Set(faits.cyl).size === 37 && faits.cyl.every((x) => x >= 0 && x <= 36));
for (const [cle, att] of Object.entries(ATTENDU_ANNONCES)) {
  const a = faits.annonces[cle];
  const pieces = a ? a.pieces.reduce((s, p) => s + p[1], 0) : -1;
  const couverts = a ? [...new Set(a.pieces.flatMap((p) => p[0]))].sort((x, y) => x - y) : [];
  verifie(`annonce ${cle} : ${att.pieces} pièces`, pieces === att.pieces, String(pieces));
  verifie(`annonce ${cle} : couvre exactement son secteur du cylindre`,
    JSON.stringify(couverts) === JSON.stringify([...att.numeros].sort((x, y) => x - y)), couverts.join(','));
  verifie(`annonce ${cle} : chaque pièce est une mise posable sur le tapis`, a && a.pieces.every((p) => pieceValide(p[0])),
    a ? JSON.stringify(a.pieces.filter((p) => !pieceValide(p[0]))) : '');
}
const tousCouverts = new Set(['voisins', 'tiers', 'orphelins'].flatMap((k) => faits.annonces[k].pieces.flatMap((p) => p[0])));
verifie('voisins + tiers + orphelins = tout le cylindre (37 numéros)', tousCouverts.size === 37, String(tousCouverts.size));
verifie('rapports par couverture : 35 / 17 / 11 / 8', JSON.stringify(faits.paie) === JSON.stringify(PAIE), JSON.stringify(faits.paie));

/* ── 2. Chaque exercice donne la bonne réponse, recalculée par NOTRE chemin ──
   v2.0.0 : les contrôles sont rangés par générateur (CONTROLE) pour être rejoués
   sur les 9 nouveaux exercices ET aux trois niveaux (Facile / Normal / Croupier). */
const ROUGES_T = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const CHANCES_T = { rouge: (n) => ROUGES_T.includes(n), noir: (n) => n > 0 && !ROUGES_T.includes(n), pair: (n) => n > 0 && n % 2 === 0,
  impair: (n) => n % 2 === 1, manque: (n) => n >= 1 && n <= 18, passe: (n) => n >= 19 };
const PAIE_T = { plein: 35, cheval: 17, transversale: 11, carre: 8, sixain: 5, douzaine: 2, colonne: 2, simple: 1 };
const NOM_T = { 'Plein': 'plein', 'Cheval': 'cheval', 'Transversale pleine': 'transversale', 'Carré': 'carre', 'Sixain': 'sixain', 'Douzaine': 'douzaine', 'Colonne': 'colonne', 'Chance simple': 'simple' };
const egal = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));
const de1a36 = Array.from({ length: 36 }, (_, i) => i + 1);
/* Une mise est-elle posable telle quelle sur le tapis ? (notre propre géométrie) */
function miseValide(m) {
  const n = m.nums || [];
  if (!n.every((x) => x >= 1 && x <= 36)) return false;
  const p = n.map(pos);
  switch (m.t) {
    case 'plein': return n.length === 1;
    case 'cheval': case 'carre': return n.length === (m.t === 'cheval' ? 2 : 4) && pieceValide(n);
    case 'transversale': return n.length === 3 && new Set(p.map((x) => x.l)).size === 1 && new Set(p.map((x) => x.c)).size === 3;
    case 'sixain': { const ls = [...new Set(p.map((x) => x.l))].sort((a, b) => a - b); return n.length === 6 && ls.length === 2 && ls[1] - ls[0] === 1 && new Set(n).size === 6; }
    case 'douzaine': { const d = Number((m.zone || '').split('-')[1]); return egal(n, de1a36.filter((x) => Math.ceil(x / 12) === d)); }
    case 'colonne': { const k = Number((m.zone || '').split('-')[1]); return egal(n, de1a36.filter((x) => (x - 1) % 3 === k - 1)); }
    case 'simple': { const c = CHANCES_T[(m.zone || '').split('-')[1]]; return !!c && egal(n, de1a36.filter(c)); }
    default: return false;
  }
}
/* Toutes les pièces intérieures du tapis (1 à 36), trouvées par force brute : le « complet » se recalcule d'ici. */
const PIECES_TAPIS = (() => {
  const l = [];
  for (const a of de1a36) {
    l.push({ t: 'plein', nums: [a] });
    for (const b of de1a36) if (b > a && pieceValide([a, b])) l.push({ t: 'cheval', nums: [a, b] });
  }
  for (let r = 1; r <= 12; r++) l.push({ t: 'transversale', nums: [3 * r - 2, 3 * r - 1, 3 * r] });
  for (let r = 1; r < 12; r++) { for (let c = 1; c <= 2; c++) { const a = 3 * (r - 1) + c; l.push({ t: 'carre', nums: [a, a + 1, a + 3, a + 4] }); }
    l.push({ t: 'sixain', nums: [3 * r - 2, 3 * r - 1, 3 * r, 3 * r + 1, 3 * r + 2, 3 * r + 3] }); }
  return l;
})();
const POIDS_COMPLET = { plein: 1, cheval: 2, transversale: 3, carre: 4, sixain: 6 };
const CHEVAUX_ANNONCES = { 'Tiers du cylindre': [[5, 8], [10, 11], [13, 16], [23, 24], [27, 30], [33, 36]], 'Orphelins': [[6, 9], [14, 17], [17, 20], [31, 34]],
  'Voisins du zéro': [[4, 7], [12, 15], [18, 21], [19, 22], [32, 35]], 'Jeu zéro': [[0, 3], [12, 15], [32, 35]] };
const ISSUES_T = { 'gagne': 1, 'égalité': 0, 'perd': 0, 'as + figure (21)': 1 };
const FIELD_T = { 2: 2, 3: 1, 4: 1, 9: 1, 10: 1, 11: 1, 12: 2 };
const ODDS = { 4: 2, 10: 2, 5: 1.5, 9: 1.5, 6: 1.2, 8: 1.2 }, PLACE = { 4: 1.8, 10: 1.8, 5: 1.4, 9: 1.4, 6: 7 / 6, 8: 7 / 6 };
const PROPS = { 'Any seven': 4, 'Any craps': 7, 'Hard 4': 7, 'Hard 10': 7, 'Hard 6': 9, 'Hard 8': 9, 'Onze (yo)': 15, 'Deux (aces)': 30, 'Douze (midnight)': 30 };
const BLIND = { 'Quinte flush royale': 500, 'Quinte flush': 50, 'Carré': 10, 'Full': 3, 'Couleur': 1.5, 'Quinte': 1, 'Brelan': 0, 'Double paire': 0 };
const NOMS_ANNONCES = { 'Voisins du zéro': 'voisins', 'Tiers du cylindre': 'tiers', 'Orphelins': 'orphelins', 'Jeu zéro': 'jeuzero' };
const proche = (a, b) => Math.abs(a - b) < 1e-9;

/* Chaque contrôle renvoie la liste de ses fautes : [libellé, valeur attendue]. */
const CONTROLE = {
  exoRouletteSimple(e) {
    const nom = Object.keys(NOM_T).find((x) => e.enonce.indexOf('<b>' + x + '</b>') === 0);
    const mise = nombres(e.enonce.split('Mise de')[1])[0];
    const n = nombres(e.enonce.split('Le ')[1] || '')[0];
    const m = e.visuel && e.visuel.mises[0];
    const att = nom ? mise * PAIE_T[NOM_T[nom]] : NaN;
    if (!nom || e.reponse !== att) return [['roulette-simple', att]];
    if (!m || m.t !== NOM_T[nom] || !miseValide(m) || !m.nums.includes(n) || e.visuel.sortant !== n || m.v !== mise) return [['roulette-simple (jeton mal posé)', JSON.stringify(m)]];
    return [];
  },
  exoRouletteCombinee(e) {
    const n = nombres(e.enonce)[0], ms = e.visuel.mises;
    const att = ms.reduce((s, m) => s + m.v * PAIE_T[m.t], 0);
    const lignes = e.enonce.split('<br>').slice(1);
    if (e.reponse !== att || lignes.length !== ms.length) return [['roulette-combinee', att]];
    if (!ms.every((m) => miseValide(m) && m.nums.includes(n)) || e.visuel.sortant !== n || new Set(ms.map((m) => m.t)).size !== ms.length) return [['roulette-combinee (mise impossible)', n]];
    if (!ms.every((m, i) => nombres(lignes[i])[0] === m.v)) return [['roulette-combinee (énoncé ≠ jetons)', n]];
    return [];
  },
  exoRouletteTapis(e) {
    const n = nombres(e.enonce)[0], ms = e.visuel.mises;
    const lignes = e.enonce.split('<br>').slice(1);
    if (!ms.every(miseValide) || e.visuel.sortant !== n || lignes.length !== ms.length || !ms.every((m, i) => nombres(lignes[i])[0] === m.v)) return [['roulette-tapis (tapis incohérent)', n]];
    const gagn = ms.filter((m) => m.nums.includes(n)), perd = ms.filter((m) => !m.nums.includes(n));
    if (!gagn.length || !perd.length) return [['roulette-tapis (il faut des gagnantes ET des perdantes)', n]];
    const att = /ramasses/.test(e.question) ? perd.reduce((s, m) => s + m.v, 0) : gagn.reduce((s, m) => s + m.v * PAIE_T[m.t], 0);
    return e.reponse === att ? [] : [['roulette-tapis', att]];
  },
  exoRouletteComplet(e) {
    const [n, u] = nombres(e.enonce.split('complet du')[1]);
    const comp = PIECES_TAPIS.filter((p) => p.nums.includes(n));
    const pieces = comp.reduce((s, p) => s + POIDS_COMPLET[p.t], 0), gain = comp.reduce((s, p) => s + POIDS_COMPLET[p.t] * PAIE_T[p.t], 0);
    const att = /pièces en tout/.test(e.question) ? pieces : /mise-t-il/.test(e.question) ? pieces * u : gain * u;
    if (n < 4 || n > 33 || e.reponse !== att) return [['roulette-complet', att]];
    if (e.visuel.mises.length !== comp.length || !e.visuel.mises.every(miseValide)) return [['roulette-complet (jetons ≠ composition)', comp.length]];
    return [];
  },
  exoRouletteDecomposer(e) {
    if (/joué à cheval/.test(e.enonce)) {
      const nom = Object.keys(CHEVAUX_ANNONCES).find((x) => e.enonce.includes('« ' + x + ' »'));
      const x = nombres(e.enonce.split('»')[1])[0];
      const paires = (CHEVAUX_ANNONCES[nom] || []).filter((p) => p.includes(x));
      if (paires.length !== 1) return [['roulette-decomposer (question ambiguë)', x]];
      const att = paires[0][0] === x ? paires[0][1] : paires[0][0];
      return e.reponse === att ? [] : [['roulette-decomposer', att]];
    }
    const u = nombres(e.enonce.split('»')[1])[0];
    const lib = (e.enonce.match(/Sur <b>([^<]+)<\/b>/) || [])[1] || '';
    const att = (/0\/2\/3|25\/26\/28\/29/.test(lib) ? 2 : 1) * u;
    return CHEVAUX_ANNONCES['Voisins du zéro'].some((p) => lib.includes(p.join('/'))) || /0\/2\/3|25\/26\/28\/29/.test(lib)
      ? (e.reponse === att ? [] : [['roulette-decomposer', att]]) : [['roulette-decomposer (pièce inconnue)', lib]];
  },
  exoRouletteVoisinsN(e) {
    const [N, k, u, X] = nombres(e.enonce);
    const i = CYL.indexOf(N), sect = [];
    for (let d = -k; d <= k; d++) sect.push(CYL[(i + d + 37) % 37]);
    if (k !== 2 && k !== 3) return [['voisins-n (2 ou 3 de chaque côté)', k]];
    if (e.type === 'liste') return egal(e.reponse, sect) ? [] : [['voisins-n', sect.join(',')]];
    if (/sort/.test(e.enonce)) return sect.includes(X) && e.reponse === 35 * u ? [] : [['voisins-n', 35 * u]];
    return e.reponse === (2 * k + 1) * u ? [] : [['voisins-n', (2 * k + 1) * u]];
  },
  exoRouletteAnnonces(e) {
    const nom = Object.keys(NOMS_ANNONCES).find((n) => e.enonce.includes('« ' + n + ' »'));
    const cle = NOMS_ANNONCES[nom];
    const a = faits.annonces[cle];
    const [u, n] = nombres(e.enonce.split('»')[1]);
    let att;
    if (/sort/.test(e.enonce)) att = a.pieces.filter((p) => p[0].includes(n)).reduce((s, p) => s + p[1] * u * PAIE[p[0].length], 0);
    else att = ATTENDU_ANNONCES[cle].pieces * u;
    return (!nom || e.reponse !== att) ? [['annonces', att]] : [];
  },
  exoRouletteFinales(e) {
    const [f, u] = nombres(e.enonce);
    const nb = [0, ...de1a36].filter((x) => x % 10 === f).length;
    const att = /sort/.test(e.enonce) ? u * 35 : nb * u;
    const out = [];
    if (e.reponse !== att) out.push(['finales', att]);
    if (/sort/.test(e.enonce) && nombres(e.enonce)[2] % 10 !== f) out.push(['finales (numéro hors finale)', f]);
    return out;
  },
  exoRouletteCylindre(e) {
    const [k2, n] = nombres(e.enonce); const k = k2 / 2;
    const i = CYL.indexOf(n), att = [];
    for (let d = 1; d <= k; d++) att.push(CYL[(i + 37 - d) % 37], CYL[(i + d) % 37]);
    return (e.type !== 'liste' || !egal(e.reponse, att)) ? [['cylindre', att]] : [];
  },
  exoBlackjackMains(e) {
    const c = cartesDe(e.enonce);
    let t = c.reduce((s, k) => s + valBj(k.r), 0);
    if (c.some((k) => k.r === 'A') && t + 10 <= 21) t += 10;
    return e.reponse !== t ? [['blackjack-mains', t]] : [];
  },
  exoBlackjack(e) {
    const mb = nombres(e.enonce.split('<b>').pop())[0];
    const att = /Blackjack du joueur/.test(e.enonce) ? mb * 1.5 : /Assurance/.test(e.enonce) ? mb * 2 : mb;
    return proche(e.reponse, att) ? [] : [['blackjack', att]];
  },
  exoBlackjackResultats(e) {
    const x = nombres(e.enonce)[0];
    let att;
    if (/assurance maximale/.test(e.enonce)) att = x / 2;
    else if (/<b>Égalité<\/b>/.test(e.enonce)) att = 0;
    else if (/<b>doublé<\/b>/.test(e.enonce)) att = 2 * x;
    else if (/<b>séparé<\/b>/.test(e.enonce)) {
      const i1 = (e.enonce.match(/Main 1 : <b>([^<]+)<\/b>/) || [])[1], i2 = (e.enonce.match(/Main 2 : <b>([^<]+)<\/b>/) || [])[1];
      if (!(i1 in ISSUES_T) || !(i2 in ISSUES_T)) return [['blackjack-resultats (issue inconnue)', i1 + '/' + i2]];
      att = ISSUES_T[i1] * x * (/<b>doublée<\/b>/.test(e.enonce) ? 2 : 1) + ISSUES_T[i2] * x;
    } else return [['blackjack-resultats (cas inconnu)', e.enonce]];
    return proche(e.reponse, att) ? [] : [['blackjack-resultats', att]];
  },
  exoPuntoPoints(e) {
    const att = cartesDe(e.enonce).reduce((s, k) => s + valBac(k.r), 0) % 10;
    return e.reponse !== att ? [['punto-points', att]] : [];
  },
  exoPunto(e) {
    const mp = nombres(e.enonce.split('Mise de')[1])[0];
    const ap = /Banco<\/b> gagne/.test(e.enonce) ? mp * 0.95 : mp;
    return proche(e.reponse, Math.round(ap * 100) / 100) ? [] : [['punto', ap]];
  },
  exoPuntoTirage(e) {
    let tireAtt;
    if (/Que fait le Punto/.test(e.question)) tireAtt = nombres(e.enonce)[0] <= 5;
    else {
      const resté = /est resté/.test(e.enonce);
      const ns = nombres(e.enonce);
      const b = resté ? ns[0] : ns[ns.length - 1];
      const t = resté ? null : nombres(e.enonce.split('vaut')[1])[0];
      tireAtt = t === null ? b <= 5 : TABLE_BANCO[b][t] === '1';
    }
    const att = tireAtt ? 'Il tire' : 'Il reste';
    return (e.type !== 'choix' || e.reponse !== att || !e.choix.includes(att)) ? [['punto-tirage', att]] : [];
  },
  exoPuntoEgalite(e) {
    if (e.type === 'choix') return e.reponse === 'Elle reste au joueur' && e.choix.includes(e.reponse) && /Égalité/.test(e.enonce) ? [] : [['punto-egalite', 'Elle reste au joueur']];
    const x = nombres(e.enonce.split(':').pop())[0];
    const att = /<b>Paire<\/b>/.test(e.enonce) ? 11 * x : /<b>Égalité<\/b>/.test(e.enonce) ? 8 * x : NaN;
    return e.reponse === att ? [] : [['punto-egalite', att]];
  },
  exoCrapsLigne(e) {
    const ns = nombres(e.enonce);
    const att = /odds/.test(e.enonce) ? ns[1] * ODDS[ns[0]] : ns[0];
    return (!proche(e.reponse, att) || !Number.isInteger(e.reponse)) ? [['craps-ligne', att]] : [];
  },
  exoCrapsPlace(e) {
    const [n, mise] = nombres(e.enonce);
    const att = mise * PLACE[n];
    return (!proche(e.reponse, att) || !Number.isInteger(e.reponse)) ? [['craps-place', att]] : [];
  },
  exoCrapsField(e) {
    const [x, a, b] = nombres(e.enonce);
    const att = x * (FIELD_T[a + b] || 0);
    if (!/Variante de cette table : 2 et 12 paient double/.test(e.enonce)) return [['craps-field (variante non dite)', '']];
    if (!(a >= 1 && a <= 6 && b >= 1 && b <= 6) || JSON.stringify(e.visuel.des) !== JSON.stringify([a, b])) return [['craps-field (dés)', a + '+' + b]];
    return e.reponse === att ? [] : [['craps-field', att]];
  },
  exoCrapsPropositions(e) {
    const nom = Object.keys(PROPS).find((p) => e.enonce.startsWith('<b>' + p + '</b>'));
    const mise = nombres(e.enonce.split('Mise de')[1])[0];
    return (!nom || e.reponse !== mise * PROPS[nom]) ? [['craps-propositions', nom ? mise * PROPS[nom] : '?']] : [];
  },
  exoThuMains(e) {
    const c = cartesDe(e.enonce);
    const att = classe(c);
    const distinctes = new Set(c.map((k) => k.r + k.c)).size === 5;
    return (e.reponse !== att || !distinctes || e.choix.length !== 4 || new Set(e.choix).size !== 4 || !e.choix.includes(att)) ? [['thu-mains', att]] : [];
  },
  exoThuBlind(e) {
    const main = Object.keys(BLIND).find((m) => e.enonce.includes('<b>' + m + '</b>'));
    const mise = nombres(e.enonce.split('Blind')[1])[0];
    const att = Math.round(mise * BLIND[main] * 100) / 100;
    return (main === undefined || !proche(e.reponse, att)) ? [['thu-blind', att]] : [];
  },
  exoCalculTables(e) { const [a, b] = nombres(e.enonce); return e.reponse !== a * b ? [['calcul-tables', a * b]] : []; },
  exoCalculSerie(e) {
    const [f, a, b] = nombres(e.enonce);
    return (f !== b || ![35, 17, 11, 8, 5].includes(f) || e.reponse !== a * b) ? [['calcul-serie', a * b]] : [];
  },
  exoCalculAdditions(e) { const ns = nombres(e.enonce.split('<br>')[1]); const s = ns.reduce((x, y) => x + y, 0); return e.reponse === s && ns.length >= 2 ? [] : [['calcul-additions', s]]; },
  exoCalculJetons(e) {
    const ns = nombres(e.enonce);
    let att;
    if (/change/.test(e.enonce)) att = ns[0] / ns[1];
    else { att = 0; for (let i = 0; i < ns.length; i += 2) att += ns[i] * ns[i + 1]; }
    return e.reponse !== att ? [['calcul-jetons', att]] : [];
  },
  exoCalculMemoire(e) {
    const att = nombres(e.enonce.split('<br>')[1]);
    return (e.type !== 'suite' || e.reponse.join() !== att.join() || !(e.cache > 0)) ? [['calcul-memoire', att]] : [];
  },
};

const N = 300;
const tirages = await page.evaluate((N) => {
  const E = window.__ENTRAINEUR, out = {};
  for (const k of ['exoRouletteAnnonces', 'exoRouletteFinales', 'exoRouletteCylindre', 'exoBlackjackMains', 'exoPuntoPoints',
                   'exoPuntoTirage', 'exoCrapsLigne', 'exoCrapsPlace', 'exoCrapsPropositions', 'exoThuMains', 'exoThuBlind',
                   'exoCalculTables', 'exoCalculJetons', 'exoCalculMemoire', 'exoExamen']) {
    out[k] = []; for (let i = 0; i < N; i++) out[k].push(E[k]());
  }
  return out;
}, N);

const fautes = {};
const faute = (k, e, attendu) => { (fautes[k] = fautes[k] || []).push({ enonce: e.enonce, rep: e.reponse, attendu }); };
const vues = {};
for (const [k, liste] of Object.entries(tirages)) {
  if (k === 'exoExamen') continue;
  for (const e of liste) {
    for (const [lib, att] of CONTROLE[k](e)) faute(lib, e, att);
    if (k === 'exoThuMains') { const a = classe(cartesDe(e.enonce)); vues[a] = (vues[a] || 0) + 1; }
  }
}
const libresMoteur = await page.evaluate(() => Object.keys(window.__ENTRAINEUR.MODES).filter((k) => window.__ENTRAINEUR.MODES[k].libre));
for (const e of tirages.exoExamen) {
  if (!libresMoteur.includes(e.vraiMode) || e.vraiMode === 'examen') faute('examen (mode verrouillé tiré)', e, e.vraiMode);
}
for (const k of ['annonces', 'finales', 'finales (numéro hors finale)', 'cylindre', 'blackjack-mains', 'punto-points', 'punto-tirage', 'craps-ligne',
  'craps-place', 'craps-propositions', 'thu-mains', 'thu-blind', 'calcul-tables', 'calcul-jetons', 'calcul-memoire', 'examen (mode verrouillé tiré)']) {
  const f = fautes[k] || [];
  verifie(`${N} tirages « ${k} » : 0 réponse fausse`, f.length === 0, f.length ? JSON.stringify(f[0]) : '');
}
verifie('poker : au moins 7 combinaisons différentes sortent sur 300 mains', Object.keys(vues).length >= 7, JSON.stringify(vues));
const tiragesTypes = new Set(tirages.exoPuntoTirage.map((e) => e.reponse));
verifie('punto 3e carte : les deux réponses sortent', tiragesTypes.size === 2);

/* ── 2 bis. v2.0.0 : TOUS les générateurs (dont les 9 nouveaux), aux TROIS niveaux, 200 tirages chacun ── */
const N2 = 200;
const NOUVEAUX = ['exoRouletteTapis', 'exoRouletteComplet', 'exoRouletteDecomposer', 'exoRouletteVoisinsN', 'exoBlackjackResultats',
  'exoPuntoEgalite', 'exoCrapsField', 'exoCalculSerie', 'exoCalculAdditions'];
const TOUS = Object.keys(CONTROLE);
const parNiveau = await page.evaluate(({ N2, TOUS }) => {
  const E = window.__ENTRAINEUR, out = {};
  for (const niv of ['facile', 'normal', 'croupier']) {
    out[niv] = {};
    for (const k of TOUS) { out[niv][k] = []; for (let i = 0; i < N2; i++) out[niv][k].push(E[k](niv)); }
  }
  out.serie = {}; for (const f of [35, 17, 11, 8, 5]) { out.serie[f] = []; for (let i = 0; i < 40; i++) out.serie[f].push(E.exoCalculSerie('normal', f)); }
  return out;
}, { N2, TOUS });
for (const k of TOUS) {
  const f = [];
  for (const niv of ['facile', 'normal', 'croupier']) for (const e of parNiveau[niv][k]) for (const [lib, att] of CONTROLE[k](e)) f.push({ niv, lib, enonce: e.enonce, q: e.question, rep: e.reponse, att });
  verifie(`${NOUVEAUX.includes(k) ? 'NOUVEAU ' : ''}${k} : ${N2} tirages × 3 niveaux recalculés, 0 faute`, f.length === 0, f.length ? JSON.stringify(f[0]) : '');
}
verifie('série chronométrée : la table demandée est bien celle de la série (35, 17, 11, 8, 5)',
  Object.entries(parNiveau.serie).every(([f, l]) => l.every((e) => nombres(e.enonce)[0] === Number(f) && e.facteur === Number(f))));
/* les variantes de chaque nouvel exercice sortent toutes (sinon une partie n'est jamais entraînée) */
const variantes = (k, fn) => new Set(['facile', 'normal', 'croupier'].flatMap((n) => parNiveau[n][k].map(fn)));
verifie('lire le tapis : on demande de ramasser ET de payer', variantes('exoRouletteTapis', (e) => /ramasses/.test(e.question)).size === 2);
verifie('complet : les 3 questions sortent (pièces, mise totale, paiement)', variantes('exoRouletteComplet', (e) => e.question).size === 3);
verifie('blackjack : split, double, égalité et assurance sortent', variantes('exoBlackjackResultats', (e) => (e.enonce.match(/séparé|doublé|Égalité|assurance maximale/) || ['?'])[0]).size === 4);
verifie('punto : égalité, paire et mises sur égalité sortent', variantes('exoPuntoEgalite', (e) => e.type === 'choix' ? 'pb' : (e.enonce.match(/Paire|Égalité/) || ['?'])[0]).size === 3);
verifie('field : des jets gagnants et perdants sortent', variantes('exoCrapsField', (e) => e.reponse > 0).size === 2);
const complet17 = await page.evaluate(() => { const c = window.__ENTRAINEUR.compositionComplet(17), d = window.__ENTRAINEUR.compositionComplet(16);
  return [c.reduce((s, p) => s + p.pieces, 0), d.reduce((s, p) => s + p.pieces, 0)]; });
verifie('complet : 40 pièces pour le 17 (colonne du milieu), 30 pour le 16 (bord)', complet17[0] === 40 && complet17[1] === 30, complet17.join('/'));

/* ── 2 ter. Les niveaux changent VRAIMENT les tirages ─────────────────────── */
const moyenne = (l) => l.reduce((a, b) => a + b, 0) / l.length;
const misesSimples = (niv) => parNiveau[niv].exoRouletteSimple.map((e) => nombres(e.enonce.split('Mise de')[1])[0]);
const [mF, mN, mC] = ['facile', 'normal', 'croupier'].map((n) => moyenne(misesSimples(n)));
verifie('niveaux : mise moyenne Facile < Normal < Croupier', mF < mN && mN < mC, `${mF.toFixed(1)} / ${mN.toFixed(1)} / ${mC.toFixed(1)}`);
const rond = (x) => x === 1 || x === 2 || x % 5 === 0;
verifie('niveau Facile : que des mises rondes', misesSimples('facile').every(rond), misesSimples('facile').filter((x) => !rond(x)).join(','));
const nonRondes = misesSimples('croupier').filter((x) => !rond(x)).length / N2;
verifie('niveau Croupier : au moins 30 % de mises non rondes', nonRondes >= 0.3, String(nonRondes));
const nbCumul = (niv) => moyenne(parNiveau[niv].exoRouletteCombinee.map((e) => e.visuel.mises.length));
verifie('niveaux : plus de mises cumulées au niveau Croupier', nbCumul('facile') === 2 && nbCumul('croupier') >= 3, `${nbCumul('facile')} / ${nbCumul('croupier')}`);
const nbCartes = (niv) => moyenne(parNiveau[niv].exoBlackjackMains.map((e) => cartesDe(e.enonce).length));
verifie('niveaux : plus de cartes à compter au niveau Croupier', nbCartes('facile') < nbCartes('normal') && nbCartes('normal') < nbCartes('croupier'));
const memo = (niv) => moyenne(parNiveau[niv].exoCalculMemoire.map((e) => e.reponse.length));
verifie('niveaux : plus de numéros à retenir au niveau Croupier', memo('facile') < memo('normal') && memo('normal') < memo('croupier'));
const chronos = await page.evaluate(() => { const E = window.__ENTRAINEUR;
  return Object.keys(E.MODES).filter((k) => !(E.objectifNiveau(k, 'facile') > E.objectifNiveau(k, 'normal') && E.objectifNiveau(k, 'normal') > E.objectifNiveau(k, 'croupier'))); });
verifie('niveaux : le chrono visé est plus large en Facile et plus serré en Croupier, pour chaque exercice', chronos.length === 0, chronos.join(','));

/* ── 3. Le juge des réponses ──────────────────────────────────────────────── */
const juge = await page.evaluate(() => {
  const j = window.__ENTRAINEUR.estJuste;
  return {
    listeDesordre: j({ type: 'liste', reponse: [3, 26, 32, 15] }, '15 32 26 3'),
    listeManque: j({ type: 'liste', reponse: [3, 26, 32, 15] }, '15 32 26'),
    suiteOrdre: j({ type: 'suite', reponse: [7, 0, 36] }, '7 0 36'),
    suiteDesordre: j({ type: 'suite', reponse: [7, 0, 36] }, '0 7 36'),
    virgule: j({ reponse: 52.5 }, '52,5'),
    faux: j({ reponse: 52.5 }, '52'),
    choix: j({ type: 'choix', reponse: 'Il tire' }, 'Il tire'),
    choixFaux: j({ type: 'choix', reponse: 'Il tire' }, 'Il reste'),
  };
});
verifie('liste : l’ordre ne compte pas', juge.listeDesordre === true);
verifie('liste : il manque un numéro → faux', juge.listeManque === false);
verifie('suite (mémoire) : dans l’ordre → juste', juge.suiteOrdre === true);
verifie('suite (mémoire) : dans le désordre → faux', juge.suiteDesordre === false);
verifie('montant : la virgule est acceptée (52,5)', juge.virgule === true);
verifie('montant : 52 au lieu de 52,5 → faux', juge.faux === false);
verifie('choix : le bon bouton → juste, l’autre → faux', juge.choix === true && juge.choixFaux === false);

/* ── 4. Un exercice gratuit par jeu, le reste verrouillé (moteur ET écran) ── */
const verrou = await page.evaluate(() => {
  const E = window.__ENTRAINEUR, parJeu = {}, ecart = [];
  for (const [k, m] of Object.entries(E.MODES)) {
    if (k === 'examen') continue;
    parJeu[m.jeu] = (parJeu[m.jeu] || 0) + (m.libre ? 1 : 0);
  }
  const boutons = [...document.querySelectorAll('[data-mode]')].map((b) => b.getAttribute('data-mode'));
  for (const k of Object.keys(E.MODES)) {
    const b = document.querySelector(`[data-mode="${k}"]`);
    if (!b || b.disabled === E.MODES[k].libre) ecart.push(k);
  }
  return { parJeu, ecart, boutons, modes: Object.keys(E.MODES), examenLibre: E.MODES.examen.libre };
});
for (const [jeu, n] of Object.entries(verrou.parJeu)) verifie(`${jeu} : exactement 1 exercice gratuit`, n === 1, String(n));
verifie('6 jeux proposés', Object.keys(verrou.parJeu).length === 6, Object.keys(verrou.parJeu).join(', '));
verifie('l’examen blanc est gratuit', verrou.examenLibre === true);
verifie('chaque exercice a son bouton, et le bouton suit le verrou du moteur', verrou.ecart.length === 0, verrou.ecart.join(', '));
verifie('aucun bouton sans exercice dans le moteur', verrou.boutons.every((b) => verrou.modes.includes(b)));

/* ── 5. Révision des erreurs : marche, et n'ouvre jamais un verrou ────────── */
const revision = await page.evaluate(() => {
  const E = window.__ENTRAINEUR;
  localStorage.removeItem('croupier_erreurs_v1');
  /* une « erreur » fabriquée sur un exercice VERROUILLÉ ne doit pas être rejouable */
  localStorage.setItem('croupier_erreurs_v1', JSON.stringify([{ mode: 'roulette-annonces', enonce: 'X', reponse: 1 }]));
  const filtre = E.litErreurs().length;
  localStorage.removeItem('croupier_erreurs_v1');
  return { filtre };
});
verifie('une erreur venue d’un exercice verrouillé est ignorée (pas de porte dérobée)', revision.filtre === 0, String(revision.filtre));

await ouvreMode('blackjack-mains');
await page.fill('#reponse', '99');
await page.click('#valider');
const apresFaute = await page.evaluate(() => ({
  bouton: document.getElementById('revoir').textContent, visible: !document.getElementById('revoir').hidden,
  stockees: JSON.parse(localStorage.getItem('croupier_erreurs_v1') || '[]'),
  enonce: document.getElementById('enonce').innerHTML,
}));
verifie('une mauvaise réponse est gardée pour la révision', apresFaute.stockees.length === 1 && apresFaute.visible && /\(1\)/.test(apresFaute.bouton), apresFaute.bouton);
await page.click('#revoir');
const enRevision = await page.evaluate(() => document.getElementById('enonce').innerHTML);
verifie('la révision remontre la question ratée', enRevision === apresFaute.enonce, enRevision);
await page.fill('#reponse', String(apresFaute.stockees[0].reponse));
await page.click('#valider');
const apresRevision = await page.evaluate(() => ({
  verdict: document.getElementById('verdict').textContent,
  reste: JSON.parse(localStorage.getItem('croupier_erreurs_v1') || '[]').length,
}));
verifie('juste en révision → l’erreur sort de la liste', /Juste/.test(apresRevision.verdict) && apresRevision.reste === 0, JSON.stringify(apresRevision));

/* ── 5b. Points trouvés par la relecture indépendante du 9.10 ──────────────── */
await ouvreMode('calcul-tables');
await page.fill('#reponse', '1');
await page.press('#reponse', 'Enter');
const apresEntree = await page.evaluate(() => ({ verdict: document.getElementById('verdict').textContent,
  suivante: document.getElementById('suivant').getClientRects().length > 0, mode: document.getElementById('reponse').inputMode }));
verifie('Entrée dans le champ : la correction RESTE affichée (pas de saut à la question suivante)', /Non|Juste/.test(apresEntree.verdict) && apresEntree.suivante, JSON.stringify(apresEntree));
verifie('clavier « decimal » (iPhone : chiffres + virgule pour séparer les numéros)', apresEntree.mode === 'decimal', apresEntree.mode);
const affichage = await page.evaluate(() => {
  const E = window.__ENTRAINEUR, mauvais = [];
  for (let i = 0; i < 300; i++) { const p = E.exoPunto(); if (/\d[.,]\d{3,}/.test(String(p.reponse)) || /\d[.,]\d{3,}/.test(p.explique)) mauvais.push(p.explique); }
  for (let i = 0; i < 100; i++) { const c = E.exoRouletteCylindre(), m = E.exoCalculMemoire(); if (!/virgules/.test(c.question) || !/virgules/.test(m.question)) mauvais.push(c.question); }
  const b = E.exoBlackjackMains();
  if (/sans dépasser 21/.test(b.question)) mauvais.push(b.question);
  return mauvais;
});
verifie('Punto : aucun montant affiché avec des décimales parasites (2,8499999…) ; listes « séparés par des virgules » ; énoncé blackjack cohérent', affichage.length === 0, affichage[0] || '');
verifie('juge : une liste séparée par des virgules est lue', await page.evaluate(() => window.__ENTRAINEUR.estJuste({ type: 'liste', reponse: [32, 15] }, '15,32')));

/* ── 6. Les boutons de choix, l'examen, les résultats ─────────────────────── */
await ouvreMode('thu-mains');
const choixUI = await page.evaluate(() => {
  const bs = [...document.querySelectorAll('#choix button')];
  return { n: bs.length, saisieCachee: getComputedStyle(document.getElementById('saisie')).display === 'none',
           hauteurs: bs.map((b) => b.getBoundingClientRect().height) };
});
verifie('poker : 4 boutons de choix, la saisie est cachée', choixUI.n === 4 && choixUI.saisieCachee, JSON.stringify(choixUI));
verifie('poker : boutons de choix ≥ 44 px', choixUI.hauteurs.every((h) => h >= 44), choixUI.hauteurs.join(','));
await page.click('#choix button');
const apresChoix = await page.evaluate(() => ({
  verdict: document.getElementById('verdict').textContent,
  bon: document.querySelectorAll('#choix button.bon').length,
  suivante: document.getElementById('suivant').getClientRects().length > 0,   /* vraie boîte à l'écran : un parent caché compte */
}));
verifie('après un choix : verdict affiché et la bonne réponse marquée', /Juste|Non/.test(apresChoix.verdict) && apresChoix.bon === 1, JSON.stringify(apresChoix));
/* trouvé le 9.10 : « Suivante » vivait dans la zone de saisie, cachée pour les questions à boutons */
verifie('après un choix : « Suivante » est VISIBLE (boîte réelle à l’écran)', apresChoix.suivante === true, JSON.stringify(apresChoix));

await ouvreMode('examen');
for (let i = 0; i < 10; i++) {
  const estChoix = await page.evaluate(() => !document.getElementById('choix').hidden);
  if (estChoix) await page.click('#choix button');
  else { await page.fill('#reponse', '999999'); await page.click('#valider'); }
  if (i < 9) {
    if (await page.locator('#suivant').isHidden()) { verifie('examen : « Suivante » visible après chaque réponse', false, 'question ' + (i + 1)); break; }
    await page.click('#suivant', { timeout: 5000 });
  }
}
const finExamen = await page.evaluate(() => document.getElementById('verdict').textContent);
verifie('examen blanc : un bilan après 10 questions', /Examen terminé : \d+\/10/.test(finExamen), finExamen);

const ecran = await page.evaluate(() => {
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  const petites = [...document.querySelectorAll('a, button, input, summary')].map((e) => {
    const r = e.getBoundingClientRect();
    return (r.width > 0 && r.height < 44) ? `${e.tagName}#${e.id || e.textContent.trim().slice(0, 20)} h=${Math.round(r.height)}` : null;
  }).filter(Boolean);
  return { petites, scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
           stats: document.querySelectorAll('#stats li').length, h1: document.querySelectorAll('h1').length,
           glossaire: document.querySelectorAll('.glossaire dt').length };
});
verifie('mes résultats : une ligne par exercice joué', ecran.stats >= 2, String(ecran.stats));
verifie('glossaire présent (≥ 10 termes)', ecran.glossaire >= 10, String(ecran.glossaire));
verifie('375 px : aucun défilement horizontal, tout ouvert', !ecran.scroll);
verifie('375 px : aucune cible tactile sous 44 px, tout ouvert', ecran.petites.length === 0, ecran.petites.join(' | '));
verifie('un seul titre principal', ecran.h1 === 1, String(ecran.h1));
verifie('aucune erreur JS', erreursJS.length === 0, erreursJS[0] || '');

/* ── 7. Toujours rien qui sorte du téléphone ──────────────────────────────── */
const src = fs.readFileSync(path.join(ROOT, 'shops/croupier/entrainement.js'), 'utf8');
/* v2.0.0 : un seul appel réseau possible, la question « ce code est-il valable ? » à /acces du worker de vente
   (avant : « aucun appel réseau »). Les deux autres fichiers de l'entraîneur n'en font aucun. */
const autres = ['entrainement-visuels.js', 'entrainement-lecons.js'].map((f) => fs.readFileSync(path.join(ROOT, 'shops/croupier', f), 'utf8')).join('\n');
verifie('un seul appel réseau (worker de vente /acces) et aucune donnée de progression envoyée',
  (src.match(/fetch\(/g) || []).length === 1 && /fetch\(API_ACCES \+ encodeURIComponent\(code\), \{ method:'GET', credentials:'omit', cache:'no-store' \}\)/.test(src)
  && !/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(autres) && !/XMLHttpRequest|sendBeacon|WebSocket/.test(src));
verifie('le hasard des tirages vient de crypto.getRandomValues (plus aucun Math.random(), alerte SonarCloud 10.10)', !/Math\.random\(/.test(src) && /crypto\.getRandomValues\(u\)/.test(src));
verifie('les choix sont écrits en texte, jamais en HTML', /b\.textContent = c;/.test(src) && !/choix[^\n]*innerHTML/.test(src));

await ctx.close(); await nav.close(); srv.close();
console.log(`ENTRAÎNEUR DE CROUPIER+++ — ${ok.length} contrôle(s) OK, ${echecs.length} échec(s)`);
if (echecs.length) { for (const e of echecs) console.error('  ✗ ' + e); process.exit(1); }
console.log('  cylindre · annonces · 15 générateurs × 300 tirages recalculés · 1 gratuit par jeu · révision · examen · iPhone');
