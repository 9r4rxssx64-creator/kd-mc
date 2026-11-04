/* ORACLE INDÉPENDANT — Craps, Poker Ultimate (THU), Pré-école de l'entraîneur croupier.
 *
 * POURQUOI : Kevin (2026-11) : « l'application croupier a de fausses réponses dans ses exercices ». Un rapport ou un
 * libellé faux n'est pas un défaut d'affichage : un élève apprend l'erreur et la répète à une vraie table de Monaco.
 *
 * MÉTHODE : ce fichier N'UTILISE PAS la logique du moteur pour juger. Il relit chaque énoncé (texte + visuel) et
 * recalcule la réponse avec SA table de rapports, SON classement de mains (comptage des rangs, énumération complète des
 * 2 598 960 mains confrontée aux effectifs connus), SA monnaie. Il charge la vraie page dans un vrai Chromium
 * (les `var` de entrainement.js sont globaux : window.MODES[k].gen(niv)).
 *
 * 600 tirages par mode et par niveau (facile / normal / croupier) ; puis affichage iPhone 13 portrait (390x844) et
 * paysage (844x390) de CHAQUE mode : aucun débordement horizontal, texte non coupé, boutons >= 44 px.
 *
 * SABOTAGE=1 : on sert le moteur et les fiches avec les anciens libellés « 9 pour 5 / 3 pour 2 » (le défaut corrigé) :
 * le test DOIT devenir rouge. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SABOTAGE = process.env.SABOTAGE === '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'shops/croupier');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const N = Number(process.env.TIRAGES || 600);

/* Les anciens textes, remis tels quels sous SABOTAGE=1 (preuve que le garde voit le défaut). */
const ANCIEN = [
  ['(place \'+n+\' : \'+r[0]+\' contre \'+r[1]+\', soit \'+r[0]+\' gagnés pour \'+r[1]+\' misés)', '(place \'+n+\' : \'+r[0]+\' pour \'+r[1]+\' misés)'],
  ['mise+\' × \'+virgule(r)+\' = \'', 'mise+\' × \'+r+\' = \''],
  ['[\'Place 4 et 10\',\'9 contre 5\'],[\'Place 5 et 9\',\'7 contre 5\'],[\'Place 6 et 8\',\'7 contre 6\']', '[\'Place 4 et 10\',\'9 pour 5\'],[\'Place 5 et 9\',\'7 pour 5\'],[\'Place 6 et 8\',\'7 pour 6\']'],
  ['[\'Couleur\',\'3 contre 2\']', '[\'Couleur\',\'3 pour 2\']'],
  ['places (7 contre 6)', 'places (7 pour 6)'],
  ['(r === 1.5 ? \'3 contre 2\' : r+\' contre 1\')', '(r === 1.5 ? \'3 pour 2\' : r+\' contre 1\')'],
];
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIR, p.replace(/^\/+/, ''));
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  let b = fs.readFileSync(f);
  if (SABOTAGE && /entrainement(-lecons)?\.js$/.test(f)) {
    let t = b.toString('utf8');
    for (const [nouveau, ancien] of ANCIEN) t = t.split(nouveau).join(ancien);
    b = t;
  }
  if (SABOTAGE && f.endsWith('entrainement.html'))   /* l'ancien titre : une ligne, coupé par « … » */
    b = b.toString('utf8').replace('white-space:normal;overflow-wrap:anywhere}', 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
  r.end(b);
});
await new Promise((r) => srv.listen(0, r));
const URL0 = `http://127.0.0.1:${srv.address().port}/entrainement.html`;

const echecs = [], ok = [];
const verifie = (nom, cond, detail = '') => cond ? ok.push(nom) : echecs.push(`${nom}${detail ? ' — ' + detail : ''}`);

/* ───────────── L'oracle (aucune ligne copiée du moteur) ───────────── */
const nu = (h) => String(h).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const fmt = (x) => String(x).replace('.', ',');
const entiers = (s) => (String(s).match(/\d+/g) || []).map(Number);

/* Craps — les rapports du métier, écrits ici une fois pour toutes. */
const ODDS = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
const PLACE = { 4: [9, 5], 10: [9, 5], 5: [7, 5], 9: [7, 5], 6: [7, 6], 8: [7, 6] };
const PROP = { 'Any seven': 4, 'Any craps': 7, 'Hard 4': 7, 'Hard 10': 7, 'Hard 6': 9, 'Hard 8': 9, 'Onze (yo)': 15, 'Deux (aces)': 30, 'Douze (midnight)': 30 };
const FIELD = { 2: 2, 3: 1, 4: 1, 9: 1, 10: 1, 11: 1, 12: 2, 5: 0, 6: 0, 7: 0, 8: 0 };
const desOk = (d) => Array.isArray(d) && d.length === 2 && d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6);
function desDeProposition(nom, d) {
  const t = d[0] + d[1];
  switch (nom) {
    case 'Any seven': return t === 7;
    case 'Any craps': return [2, 3, 12].includes(t);
    case 'Hard 4': return d[0] === 2 && d[1] === 2;
    case 'Hard 6': return d[0] === 3 && d[1] === 3;
    case 'Hard 8': return d[0] === 4 && d[1] === 4;
    case 'Hard 10': return d[0] === 5 && d[1] === 5;
    case 'Onze (yo)': return t === 11;
    case 'Deux (aces)': return d[0] === 1 && d[1] === 1;
    case 'Douze (midnight)': return d[0] === 6 && d[1] === 6;
  }
  return false;
}
/* Cohérence « ce que l'énoncé annonce » / « ce que les dés montrent » — sert aussi à relire les dés DESSINÉS. */
function fautesDes(mode, texte, des) {
  const f = [];
  if (!desOk(des)) return ['dés invalides ' + JSON.stringify(des)];
  const t = des[0] + des[1];
  let m;
  if (mode === 'craps-ligne') {
    if ((m = texte.match(/^(Pass line|Come|Don’t pass) gagne/))) {
      const ok2 = m[1] === 'Don’t pass' ? [2, 3].includes(t) : [7, 11].includes(t);
      if (!ok2) f.push(`${m[1]} gagne mais les dés font ${t}`);
    } else if ((m = texte.match(/Le point est (\d+)\./))) {
      if (t !== Number(m[1])) f.push(`point ${m[1]} mais dés ${t}`);
    } else f.push('énoncé craps-ligne inconnu : ' + texte);
  } else if (mode === 'craps-place') {
    m = texte.match(/^Place (\d+), mise de (\d+)\. Le (\d+) sort\./);
    if (!m || Number(m[1]) !== Number(m[3]) || t !== Number(m[1])) f.push(`place : ${texte} / dés ${t}`);
  } else if (mode === 'craps-field') {
    m = texte.match(/Les dés : (\d) et (\d)\./);
    if (!m || Number(m[1]) !== des[0] || Number(m[2]) !== des[1]) f.push(`field : dés annoncés ≠ dés montrés (${texte.slice(0, 60)} / ${des})`);
  } else if (mode === 'craps-propositions') {
    m = texte.match(/^(.+) gagne \(stickman\)\./);
    if (!m || !(m[1] in PROP)) f.push('proposition inconnue : ' + texte);
    else if (!desDeProposition(m[1], des)) f.push(`${m[1]} gagne mais les dés sont ${des}`);
  }
  return f;
}

/* Poker — classement par comptage des rangs, sans reprendre le moteur. */
const VAL = { A: 14, R: 13, D: 12, V: 11 };
const rang = (r) => VAL[r] || Number(r);
function categorie(cartes) {
  const rs = cartes.map((c) => rang(c.r)), cs = new Set(cartes.map((c) => c.c));
  const eff = {}; rs.forEach((x) => { eff[x] = (eff[x] || 0) + 1; });
  const motif = Object.values(eff).sort((a, b) => b - a).join('');
  const uniques = Object.keys(eff).map(Number).sort((a, b) => a - b);
  const suite = uniques.length === 5 && (uniques[4] - uniques[0] === 4 || uniques.join() === '2,3,4,5,14');
  const couleur = cs.size === 1;
  if (suite && couleur) return uniques.join() === '10,11,12,13,14' ? 'Quinte flush royale' : 'Quinte flush';
  if (motif === '41') return 'Carré';
  if (motif === '32') return 'Full';
  if (couleur) return 'Couleur';
  if (suite) return 'Quinte';
  if (motif === '311') return 'Brelan';
  if (motif === '221') return 'Double paire';
  if (motif === '2111') return 'Paire';
  return 'Carte haute';
}
const EFFECTIFS = { 'Quinte flush royale': 4, 'Quinte flush': 36, 'Carré': 624, 'Full': 3744, 'Couleur': 5108, 'Quinte': 10200, 'Brelan': 54912, 'Double paire': 123552, 'Paire': 1098240, 'Carte haute': 1302540 };
const ORDRE_MAINS = ['Quinte flush royale', 'Quinte flush', 'Carré', 'Full', 'Couleur', 'Quinte', 'Brelan', 'Double paire', 'Paire', 'Carte haute'];
const BLIND = { 'Quinte flush royale': 500, 'Quinte flush': 50, 'Carré': 10, 'Full': 3, 'Couleur': 1.5, 'Quinte': 1 };
const lireCartes = (s) => [...s.matchAll(/(10|[2-9AVDR])([♠♥♦♣])/g)].map((m) => ({ r: m[1], c: m[2] }));

/* Pré-école */
const UNITES_JETONS = [1, 5, 10, 25, 100, 500];
const lireMemo = (html) => entiers(nu((html.match(/<b class="memo">(.*?)<\/b>/) || [, ''])[1]));

/* ───────────── Contrôle d'UN exercice ───────────── */
function controle(e, niv) {
  const f = [];
  const ou = `[${e.mode}/${niv}]`;
  const txt = nu(e.enonce);
  const tout = [txt, e.question, e.explique, ...(e.choix || [])].join(' ');
  if (/NaN|undefined|null|\[object|Infinity/.test(tout)) f.push(ou + ' texte avec NaN/undefined : ' + tout.slice(0, 90));
  if (!e.question || !e.explique) f.push(ou + ' question/explication vide');
  if (/\d\.\d/.test(e.explique)) f.push(ou + ' virgule décimale française attendue : ' + e.explique.slice(0, 80));
  const exp = (x) => {   /* l'explication doit citer la bonne réponse */
    if (x === 0) return true;
    return new RegExp('(^|[^0-9,.])' + fmt(x).replace('.', '\\.') + '([^0-9]|$)').test(e.explique);
  };
  const compare = (attendu, label) => {
    if (typeof e.reponse !== 'number' || Math.abs(e.reponse - attendu) > 1e-9) f.push(`${ou} ${label} : attendu ${attendu}, le moteur dit ${e.reponse} (${txt.slice(0, 90)})`);
    else if (!exp(attendu)) f.push(`${ou} explication ne cite pas ${attendu} : ${e.explique.slice(0, 100)}`);
  };
  let m;
  switch (e.mode) {
    case 'craps-ligne': {
      f.push(...fautesDes('craps-ligne', txt, e.visuel.des).map((x) => ou + ' ' + x));
      if ((m = txt.match(/^(Pass line|Come|Don’t pass) gagne\. Mise de (\d+)\./))) {
        compare(Number(m[2]), 'ligne 1 contre 1');
        if (e.visuel.jetons[0].v !== Number(m[2])) f.push(ou + ' jeton dessiné ≠ mise');
      } else if ((m = txt.match(/^Le point est (\d+)\. Le joueur a (\d+) en odds derrière la ligne\. Le (\d+) sort\./))) {
        const p = Number(m[1]), mise = Number(m[2]);
        if (!ODDS[p] || p !== Number(m[3])) { f.push(ou + ' point incohérent'); break; }
        const g = mise * ODDS[p][0] / ODDS[p][1];
        if (!Number.isInteger(g)) f.push(`${ou} odds ${p} mise ${mise} : paiement non entier ${g}`);
        compare(g, `odds ${p} (${ODDS[p][0]} contre ${ODDS[p][1]}) sur ${mise}`);
        if (e.visuel.jetons[0].v !== mise) f.push(ou + ' jeton dessiné ≠ mise');
        if (!/contre/.test(e.explique) || / pour /.test(e.explique)) f.push(ou + ' explication : « contre » attendu : ' + e.explique);
      } else f.push(ou + ' énoncé inconnu ' + txt);
      break;
    }
    case 'craps-place': {
      f.push(...fautesDes('craps-place', txt, e.visuel.des).map((x) => ou + ' ' + x));
      m = txt.match(/^Place (\d+), mise de (\d+)\./);
      const n = Number(m[1]), mise = Number(m[2]), r = PLACE[n];
      const g = mise * r[0] / r[1];
      if (!Number.isInteger(g)) f.push(`${ou} place ${n} mise ${mise} : paiement non entier ${g}`);
      compare(g, `place ${n} (${r[0]} contre ${r[1]}) sur ${mise}`);
      if (e.visuel.jetons[0].v !== mise) f.push(ou + ' jeton dessiné ≠ mise');
      if (/\d pour \d+ misés/.test(e.explique)) f.push(ou + ' explication « pour » au lieu de « contre » : ' + e.explique);
      break;
    }
    case 'craps-field': {
      f.push(...fautesDes('craps-field', txt, e.visuel.des).map((x) => ou + ' ' + x));
      m = txt.match(/^Field, mise de (\d+)\. Les dés : (\d) et (\d)\./);
      const t = Number(m[2]) + Number(m[3]);
      compare(Number(m[1]) * FIELD[t], `field total ${t}`);
      if (!/2 et 12 paient double/.test(txt)) f.push(ou + ' la variante de la table n’est pas dite');
      if (e.visuel.jetons[0].v !== Number(m[1])) f.push(ou + ' jeton dessiné ≠ mise');
      break;
    }
    case 'craps-propositions': {
      f.push(...fautesDes('craps-propositions', txt, e.visuel.des).map((x) => ou + ' ' + x));
      m = txt.match(/^(.+) gagne \(stickman\)\. Mise de (\d+)\./);
      compare(Number(m[2]) * PROP[m[1]], `${m[1]} paie ${PROP[m[1]]} contre 1`);
      if (e.visuel.jetons[0].v !== Number(m[2])) f.push(ou + ' jeton dessiné ≠ mise');
      break;
    }
    case 'thu-mains': {
      const cartes = lireCartes(txt);
      const ids = cartes.map((c) => c.r + c.c);
      if (cartes.length !== 5) f.push(`${ou} ${cartes.length} cartes lues`);
      if (new Set(ids).size !== ids.length) f.push(`${ou} CARTE EN DOUBLE ${ids}`);
      const vis = e.visuel.mains[0].cartes.map((c) => c.r + c.c).sort().join();
      if (vis !== ids.slice().sort().join()) f.push(ou + ' cartes dessinées ≠ cartes écrites');
      const vraie = categorie(cartes);
      if (e.reponse !== vraie) f.push(`${ou} main ${ids.join(' ')} : c’est « ${vraie} », le moteur dit « ${e.reponse} »`);
      if (!e.choix || e.choix.length !== 4 || new Set(e.choix).size !== 4 || !e.choix.includes(vraie)) f.push(ou + ' choix invalides ' + JSON.stringify(e.choix));
      if (e.choix && e.choix.some((c) => !ORDRE_MAINS.includes(c))) f.push(ou + ' choix hors classement');
      if (!e.explique.includes(vraie) || !e.explique.includes(ORDRE_MAINS.join(' > '))) f.push(ou + ' explication incohérente');
      break;
    }
    case 'thu-blind': {
      m = txt.match(/^Le joueur gagne avec (.+)\. Sa Blind est de (\d+)\./);
      const main = m[1], mise = Number(m[2]);
      if (!ORDRE_MAINS.includes(main)) { f.push(ou + ' main inconnue ' + main); break; }
      const g = mise * (BLIND[main] || 0);
      compare(Math.round(g * 100) / 100, `Blind ${main} sur ${mise}`);
      if (e.visuel.titre !== main || e.visuel.jetons[0].v !== mise) f.push(ou + ' visuel ≠ énoncé');
      if (BLIND[main]) {
        const attendu = BLIND[main] === 1.5 ? '3 contre 2' : BLIND[main] + ' contre 1';
        if (!e.explique.includes(attendu)) f.push(`${ou} explication doit dire « ${attendu} » : ${e.explique}`);
        if (/ pour \d/.test(e.explique)) f.push(ou + ' « pour » dans l’explication : ' + e.explique);
      } else if (!/reste/.test(e.explique)) f.push(ou + ' push mal expliqué : ' + e.explique);
      break;
    }
    case 'calcul-tables':
    case 'calcul-serie': {
      m = txt.match(/(\d+) × (\d+)$/);
      const b = Number(m[1]), fa = Number(m[2]);
      if (![35, 17, 11, 8, 5].includes(fa)) f.push(ou + ' table hors 35/17/11/8/5 : ' + fa);
      if (b < 2 || b > 99) f.push(ou + ' multiplicande hors plage ' + b);
      compare(b * fa, `${b} × ${fa}`);
      if (e.mode === 'calcul-serie' && e.facteur !== fa) f.push(ou + ' série : facteur annoncé ≠ facteur du calcul');
      if (e.mode === 'calcul-serie' && !new RegExp('Table de ' + fa + '\\b').test(txt)) f.push(ou + ' en-tête de table faux');
      break;
    }
    case 'calcul-additions': {
      const vals = entiers(txt.replace(/^.*?paiements :/, ''));
      const calc = [...e.explique.matchAll(/(\d+)×(\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
      if (calc.length !== vals.length) f.push(ou + ' nombre de termes ≠ explication');
      calc.forEach(([x, r], i) => { if (![35, 17, 11, 8, 5, 2, 1].includes(r) || x * r !== vals[i]) f.push(`${ou} terme ${vals[i]} ≠ ${x}×${r}`); });
      compare(vals.reduce((a, b) => a + b, 0), 'somme ' + vals.join('+'));
      const attendK = niv === 'facile' ? [2, 2] : niv === 'normal' ? [3, 4] : [4, 5];
      if (vals.length < attendK[0] || vals.length > attendK[1]) f.push(`${ou} ${vals.length} termes hors plage du niveau`);
      break;
    }
    case 'calcul-jetons': {
      if ((m = txt.match(/^Le joueur change (\d+) en jetons de (\d+)\./))) {
        const S = Number(m[1]), U = Number(m[2]);
        if (S % U !== 0) f.push(`${ou} ${S} pas divisible par ${U} (monnaie impossible)`);
        compare(S / U, `${S} en jetons de ${U}`);
        if (e.visuel.piles[0].v !== U) f.push(ou + ' jeton dessiné ≠ unité');
      } else if (/^Une pile de jetons :/.test(txt)) {
        const lignes = [...txt.matchAll(/(\d+) × (\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
        const total = lignes.reduce((a, [q, v]) => a + q * v, 0);
        if (lignes.some(([, v]) => !UNITES_JETONS.includes(v))) f.push(ou + ' valeur de jeton inconnue');
        if (new Set(lignes.map((l) => l[1])).size !== lignes.length) f.push(ou + ' valeur répétée');
        const dess = e.visuel.piles.map((p) => p.n + '×' + p.v).join();
        if (dess !== lignes.map(([q, v]) => q + '×' + v).join()) f.push(ou + ' piles dessinées ≠ énoncé');
        compare(total, 'pile ' + lignes.map((l) => l.join('×')).join('+'));
      } else f.push(ou + ' énoncé jetons inconnu');
      break;
    }
    case 'calcul-memoire': {
      const liste = lireMemo(e.enonce);
      if (e.type !== 'suite' || JSON.stringify(liste) !== JSON.stringify(e.reponse)) f.push(`${ou} numéros montrés ${liste} ≠ réponse ${e.reponse}`);
      if (liste.some((x) => x < 0 || x > 36)) f.push(ou + ' numéro hors cylindre 0-36');
      const [a, b] = niv === 'facile' ? [3, 4] : niv === 'normal' ? [4, 6] : [6, 8];
      if (liste.length < a || liste.length > b) f.push(`${ou} ${liste.length} numéros hors plage du niveau`);
      if (!(e.cache > 0)) f.push(ou + ' pas de temps de mémorisation');
      if (JSON.stringify(entiers(e.explique)) !== JSON.stringify(liste)) f.push(ou + ' explication ≠ numéros');
      break;
    }
    default: f.push(ou + ' mode inattendu');
  }
  return f;
}

/* ───────────── La vraie page ───────────── */
const nav = await chromium.launch();
const ctx0 = await nav.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx0.newPage();
const erreursJS = [];
page.on('pageerror', (e) => erreursJS.push(String(e && e.message || e)));
await page.goto(URL0, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => !!window.__ENTRAINEUR && !!window.MODES, { timeout: 10000 });

/* 1. Les données du moteur ET des fiches = la table de l'oracle (une seule vérité affichée). */
const donnees = await page.evaluate(() => ({
  craps: window.CRAPS, thu: window.THU_BLIND, mains: window.MAINS_POKER,
  fiches: { craps: window.__LECONS.fiches.craps, thu: window.__LECONS.fiches.thu },
  glossaire: window.__LECONS.glossaireDonnees,
}));
for (const p of [4, 5, 6, 8, 9, 10]) {
  verifie(`moteur : odds ${p} = ${ODDS[p].join(':')}`, JSON.stringify(donnees.craps.odds[p]) === JSON.stringify(ODDS[p]));
  verifie(`moteur : place ${p} = ${PLACE[p].join(':')}`, JSON.stringify(donnees.craps.place[p]) === JSON.stringify(PLACE[p]));
}
verifie('moteur : propositions = tableau du métier', JSON.stringify(Object.fromEntries(donnees.craps.propositions.map((x) => [x.nom, x.paie]))) === JSON.stringify(PROP));
verifie('moteur : field 2 et 12 doubles, 3,4,9,10,11 simples, 5-8 perdent', Object.entries(FIELD).every(([t, v]) => (donnees.craps.field[t] || 0) === v), JSON.stringify(donnees.craps.field));
verifie('moteur : ligne 1 contre 1', donnees.craps.ligne === 1);
verifie('moteur : table de la Blind 500/50/10/3/1,5/1', JSON.stringify(donnees.thu) === JSON.stringify(BLIND), JSON.stringify(donnees.thu));
verifie('moteur : classement des mains', JSON.stringify(donnees.mains) === JSON.stringify(ORDRE_MAINS));
/* Les fiches « Apprendre » affichent la table : elle doit être celle UTILISÉE. */
const lignesTab = (fiche) => fiche.sections.filter((s) => s.tableau).flatMap((s) => s.tableau);
const rap = (t) => { const m = /^(\d+) contre (\d+)$/.exec(t); return m ? [Number(m[1]), Number(m[2])] : null; };
const tabC = Object.fromEntries(lignesTab(donnees.fiches.craps));
const attC = { 'Pass line, come, don’t pass': [1, 1], 'Odds 4 et 10': ODDS[4], 'Odds 5 et 9': ODDS[5], 'Odds 6 et 8': ODDS[6], 'Place 4 et 10': PLACE[4], 'Place 5 et 9': PLACE[5], 'Place 6 et 8': PLACE[6],
  'Any seven': [4, 1], 'Any craps': [7, 1], 'Hard 4, hard 10': [7, 1], 'Hard 6, hard 8': [9, 1], 'Onze (yo)': [15, 1], 'Deux, douze': [30, 1] };
for (const [k, v] of Object.entries(attC)) {
  verifie(`fiche craps « ${k} » = ${v.join(' contre ')} (écrit en « contre », jamais en « pour »)`, JSON.stringify(rap(tabC[k] || '')) === JSON.stringify(v), `affiché : ${tabC[k]}`);
}
const tabT = Object.fromEntries(lignesTab(donnees.fiches.thu));
const attT = { 'Quinte flush royale': [500, 1], 'Quinte flush': [50, 1], 'Carré': [10, 1], 'Full': [3, 1], 'Couleur': [3, 2], 'Quinte': [1, 1] };
for (const [k, v] of Object.entries(attT)) {
  verifie(`fiche Blind « ${k} » = ${v.join(' contre ')}`, JSON.stringify(rap(tabT[k] || '')) === JSON.stringify(v), `affiché : ${tabT[k]}`);
  verifie(`fiche Blind « ${k} » = la valeur UTILISÉE par le moteur`, (donnees.thu[k] === v[0] / v[1]));
}
verifie('fiche Blind : moins qu’une quinte = égalité (push)', /égalité/.test(tabT['Moins qu’une quinte (joueur gagnant)'] || ''));
{
  const textesCraps = JSON.stringify(donnees.fiches.craps) + JSON.stringify(donnees.fiches.thu);
  verifie('fiches craps/THU : plus aucun « N pour M » de rapport (la fiche dit elle-même que « pour » comprend la mise)', !/\d+ pour \d+(?! misés)/.test(textesCraps.replace(/5 pour 1 » veut dire 4 contre 1/g, '')), (textesCraps.match(/.{20}\d+ pour \d+.{10}/g) || []).slice(0, 3).join(' | '));
}

/* 2. Le classement des mains : les 2 598 960 mains, comptées par le moteur ET par l'oracle. */
const effMoteur = await page.evaluate(() => {
  const deck = []; for (const c of ['♠', '♥', '♦', '♣']) for (const r of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R']) deck.push({ r, c });
  const eff = {}; const h = [0, 0, 0, 0, 0].map(() => null);
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++) for (let c = b + 1; c < 50; c++) for (let d = c + 1; d < 51; d++) for (let e = d + 1; e < 52; e++) {
    const k = classeMain([deck[a], deck[b], deck[c], deck[d], deck[e]]); eff[k] = (eff[k] || 0) + 1;
  }
  return eff;
});
const effOracle = {};
{
  const deck = []; for (const c of ['♠', '♥', '♦', '♣']) for (const r of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R']) deck.push({ r, c });
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++) for (let c = b + 1; c < 50; c++) for (let d = c + 1; d < 51; d++) for (let e = d + 1; e < 52; e++) {
    const k = categorie([deck[a], deck[b], deck[c], deck[d], deck[e]]); effOracle[k] = (effOracle[k] || 0) + 1;
  }
}
verifie('oracle poker : effectifs des 10 catégories = valeurs connues (2 598 960 mains)', JSON.stringify(effOracle) === JSON.stringify(EFFECTIFS) || ORDRE_MAINS.every((k) => effOracle[k] === EFFECTIFS[k]), JSON.stringify(effOracle));
verifie('moteur poker : classeMain donne les mêmes effectifs sur les 2 598 960 mains', ORDRE_MAINS.every((k) => effMoteur[k] === EFFECTIFS[k]), JSON.stringify(effMoteur));

/* mainDeCategorie : EXACTEMENT la catégorie annoncée, jamais une main supérieure, aucune carte en double. */
const parCat = await page.evaluate((cats) => {
  const out = {};
  for (const c of cats) { out[c] = []; for (let i = 0; i < 300; i++) out[c].push(mainDeCategorie(c)); }
  return out;
}, ORDRE_MAINS);
for (const cat of ORDRE_MAINS) {
  const mauvaises = parCat[cat].filter((m) => !m || m.length !== 5 || categorie(m) !== cat || new Set(m.map((c) => c.r + c.c)).size !== 5);
  verifie(`mainDeCategorie('${cat}') : 300 mains exactement « ${cat} », 5 cartes distinctes`, mauvaises.length === 0, mauvaises[0] ? JSON.stringify(mauvaises[0]) : '');
}

/* 3. Tirages : N par mode et par niveau. */
const MODES_A_VOIR = ['craps-ligne', 'craps-place', 'craps-field', 'craps-propositions', 'thu-mains', 'thu-blind', 'calcul-tables', 'calcul-serie', 'calcul-additions', 'calcul-jetons', 'calcul-memoire'];
const NIVEAUX = ['facile', 'normal', 'croupier'];
let totalTirages = 0;
for (const mode of MODES_A_VOIR) {
  for (const niv of NIVEAUX) {
    const lot = await page.evaluate(({ mode, niv, N }) => {
      const sortie = [];
      for (let i = 0; i < N; i++) {
        const e = window.MODES[mode].gen(niv);
        /* estJuste accepte la bonne réponse, refuse une fausse */
        let bon, faux1, faux2;
        if (e.type === 'choix') { bon = e.reponse; faux1 = e.choix.find((c) => c !== e.reponse); faux2 = 'zzz'; }
        else if (e.type === 'suite' || e.type === 'liste') {
          bon = e.reponse.join(', ');
          const r = e.reponse.slice(); r[0] = (r[0] + 1) % 37; faux1 = r.join(', ');
          faux2 = e.reponse.slice(0, -1).join(', ');
        } else { bon = String(e.reponse).replace('.', ','); faux1 = String(e.reponse + 1); faux2 = String(e.reponse * 2 + 3); }
        e.__bon = estJuste(e, bon); e.__faux1 = estJuste(e, faux1); e.__faux2 = estJuste(e, faux2);
        sortie.push(e);
      }
      return sortie;
    }, { mode, niv, N });
    let fautes = [], jugeFaux = 0;
    for (const e of lot) {
      fautes.push(...controle(e, niv));
      if (!e.__bon || e.__faux1 || e.__faux2) jugeFaux++;
      totalTirages++;
    }
    verifie(`${mode} / ${niv} : ${N} tirages justes (réponse, explication, visuel, dés)`, fautes.length === 0, `${fautes.length} faute(s), ex. ${fautes.slice(0, 2).join(' || ')}`);
    verifie(`${mode} / ${niv} : estJuste accepte la bonne réponse et refuse les fausses`, jugeFaux === 0, `${jugeFaux} mal jugés`);
  }
}
/* variété : les générateurs couvrent toutes les cases (sinon un cas faux pourrait se cacher) */
{
  const couv = await page.evaluate(() => {
    const vu = { prop: new Set(), field: new Set(), place: new Set(), odds: new Set(), cat: new Set(), blind: new Set(), table: new Set(), ligneType: new Set() };
    const nu = (h) => String(h).replace(/<[^>]+>/g, ' ');
    for (let i = 0; i < 1500; i++) {
      let e = MODES['craps-propositions'].gen('normal'); vu.prop.add(nu(e.enonce).split(' gagne')[0].trim());
      e = MODES['craps-field'].gen('normal'); vu.field.add(e.visuel.des[0] + e.visuel.des[1]);
      e = MODES['craps-place'].gen('normal'); vu.place.add(e.visuel.des[0] + e.visuel.des[1]);
      e = MODES['craps-ligne'].gen('normal'); vu.odds.add(/odds/.test(e.enonce) ? e.visuel.des[0] + e.visuel.des[1] : 'ligne:' + nu(e.enonce).split(' gagne')[0].trim());
      e = MODES['thu-mains'].gen('normal'); vu.cat.add(e.reponse);
      e = MODES['thu-blind'].gen('normal'); vu.blind.add(nu(e.enonce).match(/avec (.+?)\. Sa/)[1]);
      e = MODES['calcul-tables'].gen('normal'); vu.table.add(nu(e.enonce).split('×')[1].trim());
    }
    return Object.fromEntries(Object.entries(vu).map(([k, v]) => [k, [...v].sort()]));
  });
  verifie('couverture : les 9 propositions sortent', couv.prop.length === 9, couv.prop.join('|'));
  verifie('couverture : field 2 à 12 tous sortent (gagnants ET perdants)', couv.field.length === 11, couv.field.join(','));
  verifie('couverture : place 4,5,6,8,9,10', couv.place.join() === '10,4,5,6,8,9', couv.place.join());
  verifie('couverture : odds sur 4,5,6,8,9,10 + 3 paris de ligne', couv.odds.length === 9, couv.odds.join('|'));
  verifie('couverture : au moins 9 catégories de mains (hors royale rare)', couv.cat.length >= 9, couv.cat.join('|'));
  verifie('couverture : Blind — 8 mains (6 payantes + brelan + double paire)', couv.blind.length === 8, couv.blind.join('|'));
  verifie('couverture : tables 35,17,11,8,5', couv.table.join() === '11,17,35,5,8', couv.table.join());
}
{ /* série : une table à la fois, les 5 tables, 3 niveaux */
  const lot = await page.evaluate(() => { const o = []; for (const n of ['facile', 'normal', 'croupier']) for (const f of [35, 17, 11, 8, 5]) for (let i = 0; i < 80; i++) o.push({ n, f, e: exoCalculSerie(n, f) }); return o; });
  const fautes = lot.flatMap(({ n, f, e }) => (e.facteur !== f ? [`facteur ${e.facteur}≠${f}`] : controle(e, n)));
  verifie(`calcul-serie : 5 tables × 3 niveaux × 80 tirages, la table demandée est celle posée`, fautes.length === 0, fautes.slice(0, 2).join(' || '));
}
{ /* examen blanc */
  const lot = await page.evaluate(() => { const o = []; for (const n of ['facile', 'normal', 'croupier']) for (let i = 0; i < 400; i++) { const e = exoExamen(n); o.push({ n, e, libres: modesLibres() }); } return o; });
  let f = [];
  for (const { n, e, libres } of lot) {
    if (!libres.includes(e.vraiMode)) f.push('vraiMode hors libres ' + e.vraiMode);
    if (e.mode !== e.vraiMode) f.push(`mode ${e.mode} ≠ vraiMode ${e.vraiMode}`);
    if (MODES_A_VOIR.includes(e.mode)) f.push(...controle(e, n));
  }
  const vus = new Set(lot.map((x) => x.e.vraiMode));
  verifie('examen blanc : 1200 questions, chacune du bon mode, mes 11 modes justes quand ils sortent', f.length === 0, f.slice(0, 2).join(' || '));
  verifie('examen blanc : tire dans tous les jeux ouverts (au moins une question craps, THU, calcul)', [...vus].some((m) => m.startsWith('craps')) && [...vus].some((m) => m.startsWith('thu')) && [...vus].some((m) => m.startsWith('calcul')), [...vus].join());
}
verifie('aucune erreur JavaScript pendant les tirages', erreursJS.length === 0, erreursJS[0] || '');
await ctx0.close();

/* 4. L'écran, mode par mode, iPhone 13 portrait et paysage. */
const ECRANS = [{ nom: 'portrait 390x844', w: 390, h: 844 }, { nom: 'paysage 844x390', w: 844, h: 390 }];
const JEU_DE = (m) => m.startsWith('craps') ? 'craps' : m.startsWith('thu') ? 'thu' : 'calcul';
for (const ec of ECRANS) {
  const ctx = await nav.newContext({ viewport: { width: ec.w, height: ec.h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  for (const mode of [...MODES_A_VOIR, 'examen']) {
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e && e.message || e)));
    await p.goto(URL0, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForFunction(() => !!window.__ENTRAINEUR);
    if (mode !== 'examen') await p.click(`[data-jeu="${JEU_DE(mode)}"]`);
    await p.click(`[data-mode="${mode}"]`);
    await p.waitForSelector('#ecran-table:not([hidden])');
    await p.waitForFunction(() => !document.getElementById('reponse').disabled || document.querySelector('.choix-btn'), { timeout: 12000 });
    const mesure = () => p.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const cadre = document.querySelector('.ecran:not([hidden])');
      const boutons = [...cadre.querySelectorAll('button, [role="button"], a.btn')].filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent || b.getAttribute('aria-label') || b.id).trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) }; });
      const coupes = ['enonce', 'question', 'verdict', 'explique', 'table-titre', 'objectif'].map((id) => document.getElementById(id)).filter((el) => el && vis(el)).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.id);
      const debord = [...cadre.querySelectorAll('*')].filter(vis).filter((el) => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).slice(0, 3).map((el) => el.tagName + '.' + (el.className.baseVal ?? el.className));
      const des = [...document.querySelectorAll('#visuel .de')].map((d) => Number(d.getAttribute('data-de')));
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, boutons, coupes, debord, des,
        enonce: document.getElementById('enonce').innerText, svg: !!document.querySelector('#visuel svg') };
    });
    let m1 = await mesure();
    const nom = `${mode} @ ${ec.nom}`;
    verifie(`${nom} : pas de débordement horizontal de la page`, m1.sw <= m1.iw, `${m1.sw} > ${m1.iw}`);
    verifie(`${nom} : aucun élément ne dépasse l'écran`, m1.debord.length === 0, m1.debord.join(','));
    verifie(`${nom} : énoncé, question, titre non coupés`, m1.coupes.length === 0, m1.coupes.join(','));
    const petits = m1.boutons.filter((b) => b.h < 44 || b.w < 44);
    verifie(`${nom} : tous les boutons >= 44 px`, petits.length === 0, JSON.stringify(petits.slice(0, 3)));
    /* dés dessinés = dés annoncés par l'énoncé AFFICHÉ */
    const vraiMode = await p.evaluate(() => { const t = document.getElementById('table-titre').textContent; return t; });
    if (mode.startsWith('craps')) {
      const fd = fautesDes(mode, m1.enonce.replace(/\s+/g, ' ').trim(), m1.des);
      verifie(`${nom} : les dés dessinés correspondent à l'énoncé affiché`, fd.length === 0, fd.join(';') + ' / ' + m1.enonce.slice(0, 80));
    }
    verifie(`${nom} : visuel présent quand il y en a un (cartes, dés, jetons, mise)`, ['thu-mains', 'thu-blind', 'craps-ligne', 'craps-place', 'craps-field', 'craps-propositions', 'calcul-jetons'].includes(mode) ? m1.svg : true);
    /* répondre juste (sauf mémoire : on tape une réponse quelconque) puis relire la correction */
    if (mode === 'thu-mains') {
      const cartes = lireCartes(m1.enonce);
      await p.click(`.choix-btn:text-is("${categorie(cartes)}")`);
    } else if (mode !== 'calcul-memoire' && mode !== 'examen') {
      await p.fill('#reponse', '1');
      await p.click('#valider');
    } else if (mode === 'calcul-memoire') {
      await p.fill('#reponse', '1, 2');
      await p.click('#valider');
    } else if (await p.locator('.choix-btn').count()) {
      await p.locator('.choix-btn').first().click();
    } else {
      await p.fill('#reponse', '1');
      await p.click('#valider');
    }
    await p.waitForSelector('#suivant:not([hidden])', { timeout: 5000 }).catch(() => {});
    const m2 = await mesure();
    verifie(`${nom} : après réponse, verdict + explication lisibles, rien ne déborde`, m2.sw <= m2.iw && m2.coupes.length === 0 && m2.debord.length === 0, JSON.stringify({ sw: m2.sw, iw: m2.iw, c: m2.coupes, d: m2.debord }));
    verifie(`${nom} : après réponse, boutons >= 44 px`, m2.boutons.filter((b) => b.h < 44 || b.w < 44).length === 0, JSON.stringify(m2.boutons.filter((b) => b.h < 44 || b.w < 44).slice(0, 3)));
    verifie(`${nom} : aucune erreur JS`, errs.length === 0, errs[0] || '');
    await p.close();
  }
  await ctx.close();
}

await nav.close();
srv.close();
console.log(`\nORACLE CRAPS / POKER THU / PRÉ-ÉCOLE${SABOTAGE ? ' [SABOTAGE=1]' : ''} — ${ok.length} contrôle(s) OK, ${echecs.length} échec(s) — ${totalTirages} tirages relus`);
if (echecs.length) { echecs.slice(0, 40).forEach((e) => console.log('  ✗ ' + e)); process.exit(1); }
console.log('  rapports · fiches · classement des 2 598 960 mains · tirages 3 niveaux · examen · iPhone portrait + paysage');
