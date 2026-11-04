/* ORACLE INDÉPENDANT — blackjack et punto banco de l'entraîneur du croupier.
 *
 * POURQUOI : un exercice faux apprend une erreur que le futur croupier répétera à une vraie table
 * (Kevin : « l'application croupier a de fausses réponses »). Ce contrôle ne réutilise AUCUNE fonction du moteur
 * (ni totalBlackjack, ni pointsBaccara, ni bancoTire) : il relit les cartes et les mises de l'ÉNONCÉ et du VISUEL
 * et recalcule tout avec sa propre implémentation (totaux souples, table du banquier, commission en centimes).
 *
 * Lancer : node tests/verify-croupier-cartes.mjs        (≥ 600 tirages par mode et par niveau)
 * Rouge sous SABOTAGE=1 : le moteur est servi avec ses anciens défauts remis (cartes en double, table du banquier
 * fausse, doublé sur un 21) et l'oracle doit les attraper.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'shops/croupier');
const TIRAGES = Number(process.env.TIRAGES || 600);
const SABOTAGE = process.env.SABOTAGE === '1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

/* Les anciens défauts, remis exprès sous SABOTAGE=1 (chaque remplacement DOIT s'appliquer, sinon le garde se tait). */
let source = fs.readFileSync(path.join(DIR, 'entrainement.js'), 'utf8').replace('var OUVERT_A_TOUS = true;', 'var OUVERT_A_TOUS = true;');
const appliques = [];
if (SABOTAGE) {
  const coups = [
    ['table du banquier : 5 tire dès 3', "if (b === 5) return troisiemePunto >= 4 && troisiemePunto <= 7;", "if (b === 5) return troisiemePunto >= 3 && troisiemePunto <= 7;"],
    ['commission 10 % au lieu de 5 %', "var com = arrondi(mise * COMMISSION_BANCO)", "var com = arrondi(mise * 0.10)"],
    ['cartes tirées sans contrôle (doublons)', "var cartes = mainsBlackjack(n);", "var cartes = []; for (var i = 0; i < n; i++) cartes.push(carte());"],
    ['doublé sur un 21 après séparation', "if (dbl && i1 === 'as + figure (21)') i1 = 'gagne';", ""],
  ];
  for (const [nom, bon, mauvais] of coups) {
    if (!source.includes(bon)) { console.error(`SABOTAGE impossible : « ${nom} » introuvable dans le moteur (le garde serait muet).`); process.exit(2); }
    source = source.replace(bon, mauvais); appliques.push(nom);
  }
}

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIR, p.replace(/^\/+/, ''));
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  r.end(f.endsWith('entrainement.js') ? source : fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, r));
const URL_PAGE = `http://127.0.0.1:${srv.address().port}/entrainement.html`;

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const erreursJS = [];
page.on('pageerror', (e) => erreursJS.push(String(e && e.message || e)));
await page.goto(URL_PAGE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => !!window.__ENTRAINEUR && !!window.MODES, { timeout: 10000 });

/* ── L'oracle, dans la page, sans une seule fonction du moteur ─────────────── */
const fautes = await page.evaluate((N) => {
  const F = [];
  const faute = (mode, niv, cat, ex) => F.push({ mode, niv, cat, ex: String(ex).slice(0, 260) });
  const texte = (h) => String(h).replace(/<br\s*\/?>/g, ' / ').replace(/<[^>]+>/g, '');
  const CARTE = /(10|[A2-9VDR])([♠♥♦♣])/g;
  const cartesDe = (h) => { const l = []; let m; const t = texte(h); CARTE.lastIndex = 0; while ((m = CARTE.exec(t))) l.push(m[1] + m[2]); return l; };
  const rang = (c) => c.slice(0, -1);
  const vBJ = (r) => r === 'A' ? 1 : 'VDR'.includes(r) ? 10 : Number(r);
  const vBA = (r) => { const v = vBJ(r); return v === 10 ? 0 : v; };
  /* blackjack : meilleur total, avec l'as à 11 tant que ça ne dépasse pas 21 */
  const bj = (rangs) => { let dur = 0, as = 0; rangs.forEach((r) => { dur += vBJ(r); if (r === 'A') as++; }); const souple = as > 0 && dur + 10 <= 21; return { total: souple ? dur + 10 : dur, souple }; };
  /* banquier : colonnes = 3e carte du joueur (0 à 9), lignes = points du banquier */
  const BANQUIER = { 0: '1111111111', 1: '1111111111', 2: '1111111111', 3: '1111111101', 4: '0011111100', 5: '0000111100', 6: '0000001100', 7: '0000000000' };
  const bancoTire = (b, t) => t === null ? b <= 5 : BANQUIER[b][t] === '1';
  const virg = (x) => String(x).replace('.', ',');
  const distinctes = (l) => new Set(l).size === l.length;
  const propre = (mode, niv, e) => {
    ['enonce', 'question', 'explique'].forEach((k) => { const s = e[k]; if (typeof s !== 'string' || !s.trim()) faute(mode, niv, 'texte vide : ' + k, JSON.stringify(e)); else if (/NaN|undefined|null|\[object|Infinity/.test(s)) faute(mode, niv, 'NaN/undefined dans ' + k, s); });
    if (e.type === 'choix') {
      if (!Array.isArray(e.choix) || e.choix.indexOf(e.reponse) < 0) faute(mode, niv, 'la bonne réponse n’est pas dans les choix', JSON.stringify([e.choix, e.reponse]));
      else {
        if (!window.estJuste(e, e.reponse)) faute(mode, niv, 'estJuste refuse la bonne réponse', e.reponse);
        e.choix.filter((c) => c !== e.reponse).forEach((c) => { if (window.estJuste(e, c)) faute(mode, niv, 'estJuste accepte une fausse réponse', c); });
      }
    } else {
      if (typeof e.reponse !== 'number' || !isFinite(e.reponse)) { faute(mode, niv, 'réponse non numérique', e.reponse); return; }
      [String(e.reponse), virg(e.reponse), ' ' + virg(e.reponse) + ' '].forEach((s) => { if (!window.estJuste(e, s)) faute(mode, niv, 'estJuste refuse la bonne réponse', s); });
      [e.reponse + 1, e.reponse - 1, e.reponse * 2 + 3, e.reponse + 0.5, ''].forEach((s) => { if (window.estJuste(e, String(s))) faute(mode, niv, 'estJuste accepte une fausse réponse', s + ' (juste = ' + e.reponse + ')'); });
    }
  };
  const visuelCartes = (e) => ((e.visuel && e.visuel.mains) || []).map((m) => m.cartes.map((k) => k.r + k.c));
  const mises = (e) => ((e.visuel && e.visuel.jetons) || []).map((j) => j.v);

  const ex = (k, niv) => window.MODES[k].gen(niv);
  for (const niv of ['facile', 'normal', 'croupier']) {
    for (let i = 0; i < N; i++) {
      /* ── blackjack-mains ── */
      { const k = 'blackjack-mains', e = ex(k, niv); propre(k, niv, e);
        const cE = cartesDe(e.enonce), cV = visuelCartes(e)[0] || [];
        if (cE.join() !== cV.join()) faute(k, niv, 'cartes de l’énoncé ≠ cartes du visuel', e.enonce + ' / ' + cV.join(' '));
        if (!distinctes(cE)) faute(k, niv, 'carte impossible : la même carte plusieurs fois dans une main', cE.join(' '));
        const t = bj(cE.map(rang));
        if (e.reponse !== t.total) faute(k, niv, 'RÉPONSE FAUSSE', cE.join(' ') + ' → ' + e.reponse + ' (juste = ' + t.total + ')');
        if (!e.explique.includes('→ ' + t.total)) faute(k, niv, 'explication incohérente avec le total', e.explique);
        if ((t.souple && t.total < 21) !== /main souple/.test(e.explique)) faute(k, niv, '« main souple » mal annoncée', cE.join(' ') + ' / ' + e.explique);
        if ((t.total > 21) !== /brûle/.test(e.explique)) faute(k, niv, '« brûle » mal annoncé', cE.join(' ') + ' / ' + e.explique);
        for (let n = 2; n < cE.length; n++) if (bj(cE.slice(0, n).map(rang)).total >= 21) { faute(k, niv, 'main impossible : le joueur pioche après 21 ou après avoir brûlé', cE.join(' ')); break; }
      }
      /* ── blackjack (3 pour 2, assurance) ── */
      { const k = 'blackjack', e = ex(k, niv), t = texte(e.enonce);
        const mise = Number((e.enonce.match(/<b>(\d+)<\/b>/g) || []).pop().replace(/\D/g, ''));
        const att = /^Blackjack du joueur/.test(t) ? mise * 1.5 : /^Assurance/.test(t) ? mise * 2 : /^Main gagnante/.test(t) ? mise : NaN;
        propre(k, niv, e);
        if (e.reponse !== att) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + att + ')');
        if (!e.explique.includes(virg(att))) faute(k, niv, 'explication incohérente avec le gain', e.explique);
        if (mises(e).length && mises(e)[0] !== mise) faute(k, niv, 'mise du visuel ≠ mise de l’énoncé', mises(e) + ' / ' + mise);
        const cv = visuelCartes(e)[0];
        if (/^Blackjack du joueur/.test(t) && !(cv && cv.length === 2 && bj(cv.map(rang)).total === 21)) faute(k, niv, 'le visuel du blackjack n’est pas un 21 en deux cartes', cv);
        if (/^Assurance/.test(t) && !(cv && cv.length === 1 + 1 && bj(cv.map(rang)).total === 21)) faute(k, niv, 'le croupier « a blackjack » mais le visuel n’est pas un 21 en deux cartes', cv);
      }
      /* ── blackjack-resultats ── */
      { const k = 'blackjack-resultats', e = ex(k, niv), t = texte(e.enonce); propre(k, niv, e);
        const gras = (e.enonce.match(/<b>([^<]*)<\/b>/g) || []).map((s) => s.replace(/<\/?b>/g, ''));
        if (/assurance maximale/.test(t)) {
          const x = Number(gras[0]); if (x % 2) faute(k, niv, 'assurance maximale sur une mise impaire', x);
          if (e.reponse !== x / 2) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + x / 2 + ')');
        } else if (/^Égalité/.test(t)) {
          const [pts, x] = [Number(gras[1]), Number(gras[2])];
          if (e.reponse !== 0) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = 0)');
          if (!(pts >= 17 && pts <= 21)) faute(k, niv, 'égalité à un total impossible', pts);
          if (mises(e)[0] !== x) faute(k, niv, 'mise du visuel ≠ énoncé', mises(e) + ' / ' + x);
        } else if (/doublé/.test(t) && !/séparé/.test(t)) {
          const x = Number(gras[1]), att = gras[2] === 'gagne' ? 2 * x : NaN;
          if (e.reponse !== att) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + att + ')');
          if (mises(e).join() !== [x, x].join()) faute(k, niv, 'jetons du visuel ≠ mise + double', mises(e) + ' / ' + x);
        } else if (/séparé/.test(t)) {
          const x = Number(gras[1]), dbl = /doublée/.test(t);
          const m1 = (t.match(/Main 1 : ([^·]+) ·/) || [])[1].trim(), m2 = (t.match(/Main 2 : (.+)\.\s*$/) || [])[1].trim();
          const gain = (s) => s === 'perd' || s === 'égalité' ? 0 : (s === 'gagne' || s === 'as + figure (21)') ? 1 : NaN;
          const att = gain(m1) * x * (dbl ? 2 : 1) + gain(m2) * x;
          if (e.reponse !== att) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + att + ')');
          if (dbl && m1 === 'as + figure (21)') faute(k, niv, 'main impossible : doubler une main déjà à 21 (as + figure)', t);
          if (mises(e).join() !== [dbl ? 2 * x : x, x].join()) faute(k, niv, 'jetons du visuel ≠ mises des deux mains', mises(e) + ' / ' + x);
        } else faute(k, niv, 'énoncé non reconnu par l’oracle', t);
      }
      /* ── punto-points ── */
      { const k = 'punto-points', e = ex(k, niv); propre(k, niv, e);
        const cE = cartesDe(e.enonce), cV = visuelCartes(e)[0] || [];
        if (cE.join() !== cV.join()) faute(k, niv, 'cartes de l’énoncé ≠ cartes du visuel', e.enonce + ' / ' + cV.join(' '));
        if (!distinctes(cE)) faute(k, niv, 'carte impossible : la même carte plusieurs fois dans une main', cE.join(' '));
        if (cE.length < 2 || cE.length > 3) faute(k, niv, 'nombre de cartes impossible au punto banco', cE.length);
        const somme = cE.reduce((s, c) => s + vBA(rang(c)), 0), att = somme % 10;
        if (e.reponse !== att) faute(k, niv, 'RÉPONSE FAUSSE', cE.join(' ') + ' → ' + e.reponse + ' (juste = ' + att + ')');
        if (!e.explique.includes('= ' + somme)) faute(k, niv, 'explication incohérente avec la somme', e.explique);
        if (cE.some((c) => ['10', 'V', 'D', 'R'].includes(rang(c))) && !/10 et figures valent 0/.test(e.explique)) faute(k, niv, 'rappel « figures = 0 » absent', e.explique);
        if (cE.length === 3) { const deux = cE.slice(0, 2).reduce((s, c) => s + vBA(rang(c)), 0) % 10; if (deux >= 8) faute(k, niv, 'main impossible : 3e carte tirée après un naturel (8 ou 9)', cE.join(' ')); }
      }
      /* ── punto (commission 5 %) : tout en CENTIMES entiers ── */
      { const k = 'punto', e = ex(k, niv), t = texte(e.enonce); propre(k, niv, e);
        const mise = Number((e.enonce.match(/<b>(\d+)<\/b>/g) || []).pop().replace(/\D/g, ''));
        const banco = /^Banco/.test(t), centimes = banco ? mise * 95 : mise * 100;   /* 0,95 × mise = mise × 95 centimes */
        if (Math.round(e.reponse * 100) !== centimes || Math.abs(e.reponse * 100 - centimes) > 1e-6) faute(k, niv, 'RÉPONSE FAUSSE / arrondi', t + ' → ' + e.reponse + ' (juste = ' + centimes / 100 + ')');
        if (banco) {
          const com = mise * 5 / 100, netTxt = virg(centimes / 100), comTxt = virg(com);
          if (!e.explique.includes(netTxt)) faute(k, niv, 'explication sans le net exact', e.explique + ' (net = ' + netTxt + ')');
          if (!e.explique.includes(comTxt)) faute(k, niv, 'explication sans la commission exacte', e.explique + ' (commission = ' + comTxt + ')');
          if (/\d\.\d/.test(e.explique)) faute(k, niv, 'point décimal à l’écran (la France écrit la virgule)', e.explique);
        } else if (!/sans commission/.test(e.explique)) faute(k, niv, 'Punto : « sans commission » absent', e.explique);
        if (mises(e)[0] !== mise) faute(k, niv, 'mise du visuel ≠ énoncé', mises(e) + ' / ' + mise);
      }
      /* ── punto-tirage : la table du banquier recalculée ── */
      { const k = 'punto-tirage', e = ex(k, niv), t = texte(e.enonce); propre(k, niv, e);
        const pts = e.visuel && e.visuel.type === 'points' ? e.visuel : null;
        if (!pts) faute(k, niv, 'visuel des points absent', JSON.stringify(e.visuel));
        const gras = (e.enonce.match(/<b>([^<]*)<\/b>/g) || []).map((s) => s.replace(/<\/?b>/g, ''));
        if (/Que fait le Punto/.test(e.question)) {
          const p = Number(gras[gras.length - 1].replace(/\D/g, '')); const att = p <= 5 ? 'Il tire' : 'Il reste';
          if (e.reponse !== att) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + att + ')');
          if (!(p >= 0 && p <= 7)) faute(k, niv, 'points hors 0-7 pour un Punto qui décide', p);
          if (pts && pts.punto !== p) faute(k, niv, 'visuel ≠ énoncé', JSON.stringify(pts) + ' / ' + t);
        } else {
          const b = Number(gras[gras.length - 1].replace(/\D/g, '')), reste = /est resté/.test(t);
          const tt = reste ? null : Number(gras[0]);
          const att = bancoTire(b, tt) ? 'Il tire' : 'Il reste';
          if (e.reponse !== att) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + att + ')');
          if (!(b >= 0 && b <= 7)) faute(k, niv, 'Banco hors 0-7 (un naturel ne tire pas)', b);
          if (pts && (pts.banco !== b || pts.punto !== (reste ? 'resté' : '3e : ' + tt))) faute(k, niv, 'visuel ≠ énoncé', JSON.stringify(pts) + ' / ' + t);
          /* la règle écrite en explication doit donner la même réponse */
          const r = e.explique; let ok;
          if (reste) ok = /de 0 à 5/.test(r);
          else if (b <= 2) ok = /toujours/.test(r);
          else if (b === 7) ok = /reste toujours/.test(r);
          else if (b === 3) ok = /sauf si .* un 8/.test(r);
          else { const m = r.match(/de (\d) à (\d)|(\d) ou (\d)/); const [lo, hi] = m[1] ? [+m[1], +m[2]] : [+m[3], +m[4]]; ok = (tt >= lo && tt <= hi) === (att === 'Il tire') && lo === { 4: 2, 5: 4, 6: 6 }[b] && hi === 7; }
          if (!ok) faute(k, niv, 'explication ≠ table du banquier', t + ' / ' + r);
        }
      }
      /* ── punto-egalite ── */
      { const k = 'punto-egalite', e = ex(k, niv), t = texte(e.enonce); propre(k, niv, e);
        const gras = (e.enonce.match(/<b>([^<]*)<\/b>/g) || []).map((s) => s.replace(/<\/?b>/g, ''));
        if (e.type === 'choix') {
          if (e.reponse !== 'Elle reste au joueur') faute(k, niv, 'RÉPONSE FAUSSE : sur une égalité, la mise Punto/Banco est rendue', e.reponse);
          if (!/Le joueur avait/.test(t)) faute(k, niv, 'énoncé inattendu', t);
          const pts = Number(gras[1]); if (e.visuel.punto !== pts || e.visuel.banco !== pts) faute(k, niv, 'visuel : les deux mains doivent avoir le même nombre de points', JSON.stringify(e.visuel) + ' / ' + t);
        } else if (/^Paire/.test(t)) {
          const x = Number(gras[gras.length - 1]), cV = visuelCartes(e)[0] || [], cote = gras[1];
          if (e.reponse !== x * 11) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + x * 11 + ')');
          if (!(cV.length === 2 && rang(cV[0]) === rang(cV[1]))) faute(k, niv, 'la « paire » du visuel n’est pas une paire', cV.join(' '));
          if (!distinctes(cV)) faute(k, niv, 'carte impossible : paire de deux cartes identiques', cV.join(' '));
          if (e.visuel.mains[0].titre !== cote) faute(k, niv, 'côté du visuel ≠ énoncé', e.visuel.mains[0].titre + ' / ' + cote);
          if (rang(cV[0]) !== (t.match(/\(deux (\w+)\)/) || [])[1]) faute(k, niv, 'rang de la paire ≠ énoncé', t + ' / ' + cV.join(' '));
        } else if (/^Égalité/.test(t)) {
          const pts = Number(gras[1]), x = Number(gras[2]);
          if (e.reponse !== x * 8) faute(k, niv, 'RÉPONSE FAUSSE', t + ' → ' + e.reponse + ' (juste = ' + x * 8 + ')');
          if (e.visuel.punto !== pts || e.visuel.banco !== pts) faute(k, niv, 'visuel : les deux mains doivent avoir le même nombre de points', JSON.stringify(e.visuel));
          if (mises(e)[0] !== x) faute(k, niv, 'mise du visuel ≠ énoncé', mises(e) + ' / ' + x);
        } else faute(k, niv, 'énoncé non reconnu par l’oracle', t);
      }
    }
  }
  return F;
}, TIRAGES);

/* ── L'affichage : iPhone 13 portrait et paysage, chaque mode, chaque niveau ─── */
const MODES_CARTES = ['blackjack-mains', 'blackjack', 'blackjack-resultats', 'punto-points', 'punto', 'punto-tirage', 'punto-egalite'];
const affichage = [];
for (const [w, h, nomEcran] of [[390, 844, 'iPhone 13 portrait'], [844, 390, 'iPhone 13 paysage']]) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on('pageerror', (e) => erreursJS.push(nomEcran + ' : ' + String(e && e.message || e)));
  await p.goto(URL_PAGE, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForFunction(() => !!window.__ENTRAINEUR, { timeout: 10000 });
  for (const niv of ['facile', 'normal', 'croupier']) {
    await p.evaluate((n) => changeNiveau(n), niv);
    for (const mode of MODES_CARTES) {
      await p.evaluate((m) => changeMode(m, false), mode);
      for (let i = 0; i < 12; i++) {
        const r = await p.evaluate(() => {
          nouvelExo();
          const D = document.documentElement, vp = window.innerWidth;
          const sortis = [];
          const visibles = [...document.querySelectorAll('#ecran-table button, #ecran-table input')].filter((b) => b.offsetParent !== null && !b.hidden);
          const petits = visibles.filter((b) => { const q = b.getBoundingClientRect(); return q.width < 44 || q.height < 44; }).map((b) => (b.id || b.textContent.trim().slice(0, 12)) + ' ' + Math.round(b.getBoundingClientRect().width) + '×' + Math.round(b.getBoundingClientRect().height));
          const svg = document.querySelector('#visuel svg');
          let echelle = null, rogne = false, cartesDessinees = 0;
          if (svg) {
            const q = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
            echelle = vb && vb.width ? q.width / vb.width : null;
            rogne = q.right > vp + 0.5 || q.left < -0.5;
            cartesDessinees = svg.querySelectorAll('.carte').length;
          }
          const att = window.etat && window.etat.exo && window.etat.exo.visuel && window.etat.exo.visuel.mains ? window.etat.exo.visuel.mains.reduce((s, m) => s + m.cartes.length, 0) : 0;
          return { debord: D.scrollWidth > vp + 1, sw: D.scrollWidth, vp, petits, echelle, rogne, cartesDessinees, att, caches: !document.getElementById('visuel').hidden || !(window.etat.exo.visuel) };
        });
        affichage.push({ nomEcran, niv, mode, ...r });
      }
    }
  }
  await c.close();
}

await nav.close(); srv.close();

/* ── Rapport ───────────────────────────────────────────────────────────────── */
const groupes = new Map();
for (const f of fautes) { const cle = `${f.mode} | ${f.cat}`; const g = groupes.get(cle) || { n: 0, niv: new Set(), ex: f.ex }; g.n++; g.niv.add(f.niv); groupes.set(cle, g); }
const echecs = [];
for (const [cle, g] of groupes) echecs.push(`${cle} — ${g.n}× (niveaux ${[...g.niv].join('/')}) ex : ${g.ex}`);
const aff = (pred, msg) => { const l = affichage.filter(pred); if (l.length) echecs.push(`AFFICHAGE ${msg} — ${l.length}× ex : ${JSON.stringify(l[0])}`); };
aff((r) => r.debord, 'débordement horizontal de la page');
aff((r) => r.rogne, 'visuel rogné à droite/gauche');
aff((r) => r.petits.length > 0, 'bouton/champ < 44 px');
aff((r) => r.echelle !== null && r.echelle < 0.6, 'cartes trop petites (échelle < 0,6)');
aff((r) => r.cartesDessinees !== r.att, 'nombre de cartes dessinées ≠ nombre de cartes de l’exercice');
aff((r) => !r.caches, 'visuel absent');
if (erreursJS.length) echecs.push('erreurs JavaScript : ' + erreursJS.slice(0, 3).join(' | '));

const nbTirages = TIRAGES * 3 * MODES_CARTES.length;
console.log(`Oracle blackjack + punto banco : ${nbTirages} exercices vérifiés (${TIRAGES} par mode et par niveau), ${affichage.length} affichages iPhone 13 (portrait + paysage).`);
const echelles = affichage.map((r) => r.echelle).filter((x) => x !== null);
console.log(`Affichage : échelle minimale des cartes ×${Math.min(...echelles).toFixed(2)}, ${affichage.filter((r) => r.att >= 5).length} mains de 5 cartes, ${affichage.filter((r) => r.petits.length).length} écrans avec une cible < 44 px.`);
if (SABOTAGE) console.log('SABOTAGE=1 — défauts remis : ' + appliques.join(' ; '));
if (echecs.length) {
  console.log(`\n${echecs.length} FAMILLE(S) DE DÉFAUTS :`);
  echecs.forEach((e) => console.log(' ✗ ' + e));
  process.exit(1);
}
console.log('✓ aucun défaut');
