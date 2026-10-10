/* L'ENTRAÎNEUR DE CROUPIER v2 — l'écran, en vrai Chromium à 375 px.
 *
 * POURQUOI : un visuel faux est aussi grave qu'un rapport faux. Un jeton posé sur la
 * mauvaise case, c'est un élève qui apprend à payer une mise qui n'existe pas ; une
 * carte affichée qui n'est pas celle de l'énoncé, c'est une main comptée deux fois.
 * Ce test lit les attributs des éléments SVG dessinés (data-num, data-nums, cx/cy…)
 * et recalcule où chaque jeton DOIT être, par sa propre géométrie.
 *
 * Il prouve aussi le déverrouillage par code (Kevin 10.10) : sans code → verrous ;
 * code accepté par le worker → tout s'ouvre (moteur ET écran) ; code refusé, autre
 * produit, ou réseau coupé → rien ne change, sans message effrayant. Les réponses du
 * worker sont simulées (page.route) : aucune session sur le vrai domaine.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, 'shops/croupier', p.replace(/^\/+/, ''));
  if (!f.startsWith(path.join(ROOT, 'shops/croupier')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8797, r));
const URL0 = 'http://127.0.0.1:8797/entrainement.html';
const WORKER = 'https://kdmc-vente.9r4rxssx64.workers.dev/';

const echecs = [], ok = [];
const verifie = (nom, cond, detail = '') => cond ? ok.push(nom) : echecs.push(`${nom}${detail ? ' — ' + detail : ''}`);
const nombres = (s) => (String(s).replace(/<[^>]+>/g, ' ').match(/\d+/g) || []).map(Number);

const nav = await chromium.launch();
async function ouvre({ url = URL0, worker = null, stockage = null } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const erreurs = [], appels = [];
  page.on('pageerror', (e) => erreurs.push(String(e && e.message || e)));
  await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
  await ctx.route(WORKER + '**', (route) => {
    appels.push({ url: route.request().url(), methode: route.request().method(), corps: route.request().postData() });
    if (!worker || worker === 'coupe') return route.abort();
    return route.fulfill({ status: worker.status || 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(worker.json) });
  });
  if (stockage) await ctx.addInitScript((c) => { try { localStorage.setItem('kdmc_acces_code', c); } catch (e) {} }, stockage);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__ENTRAINEUR && document.querySelectorAll('[data-mode]').length > 20, { timeout: 10000 });
  await page.waitForTimeout(400);
  return { ctx, page, erreurs, appels };
}
const etatVerrous = (page) => page.evaluate(() => {
  const E = window.__ENTRAINEUR, ecart = [];
  const libres = Object.keys(E.MODES).filter((k) => E.MODES[k].libre);
  document.querySelectorAll('[data-mode]').forEach((b) => { if (b.disabled === E.MODES[b.getAttribute('data-mode')].libre) ecart.push(b.getAttribute('data-mode')); });
  return { libres: libres.length, total: Object.keys(E.MODES).length, origine: Object.values(E.LIBRE_D_ORIGINE).filter(Boolean).length,
    ecart, badge: !document.getElementById('acces-ok').hidden, texte: document.body.innerText };
});
async function versExercice(page, jeu, mode) {
  for (let i = 0; i < 4 && !(await page.locator('#ecran-accueil').isVisible()); i++)
    await page.locator('.ecran:not([hidden]) [data-va="accueil"], .ecran:not([hidden]) .retour[data-va="jeu"]').first().click();
  await page.click(`[data-jeu="${jeu}"]`);
  await page.click(`[data-mode="${mode}"]`);
}

/* ═══ 1. Le déverrouillage par code ═══ */
let texteSansCode = '';
{
  const { ctx, page, erreurs, appels } = await ouvre();
  const v = await etatVerrous(page);
  verifie('sans code : les verrous sont en place (seuls les exercices gratuits + l\'examen sont ouverts)', v.libres === v.origine && v.libres === 7 && v.ecart.length === 0 && !v.badge, JSON.stringify({ ...v, texte: '' }));
  verifie('sans code : AUCUN appel réseau', appels.length === 0, JSON.stringify(appels));
  verifie('sans code : aucune erreur JS', erreurs.length === 0, erreurs[0] || '');
  texteSansCode = v.texte;
  await ctx.close();
}
{
  const { ctx, page, erreurs, appels } = await ouvre({ url: URL0 + '?c=TEST-CODE-OK', worker: { json: { ok: true, produit: 'croupier-pro', nom: 'Croupier Pro' } } });
  await page.waitForFunction(() => !document.getElementById('acces-ok').hidden, { timeout: 5000 }).catch(() => {});
  const v = await etatVerrous(page);
  verifie('code accepté (?c=) : TOUS les modes libres dans le moteur', v.libres === v.total, `${v.libres}/${v.total}`);
  verifie('code accepté : TOUS les boutons ouverts à l\'écran (aucun écart avec le moteur)', v.ecart.length === 0 && v.libres === v.total, v.ecart.join(','));
  verifie('code accepté : « Accès complet ✓ » affiché', v.badge && /Accès complet ✓/.test(v.texte));
  const a = appels[0] || {};
  verifie('code accepté : un seul appel, GET /acces?c=CODE, sans corps', appels.length === 1 && a.methode === 'GET' && a.url === WORKER + 'acces?c=TEST-CODE-OK' && !a.corps, JSON.stringify(appels));
  const range = await page.evaluate(() => ({ code: localStorage.getItem('kdmc_acces_code'), url: location.search }));
  verifie('code accepté : rangé sur le téléphone et retiré de l\'adresse', range.code === 'TEST-CODE-OK' && range.url === '', JSON.stringify(range));
  await versExercice(page, 'roulette', 'roulette-tapis');
  const tapis = await page.evaluate(() => ({ jetons: document.querySelectorAll('#visuel [data-visuel="tapis"] .jeton[data-type]').length, enonce: document.getElementById('enonce').textContent }));
  verifie('code accepté : un exercice payant (lire le tapis) s\'ouvre et se dessine', tapis.jetons >= 3 && /sort/.test(tapis.enonce), JSON.stringify(tapis));
  verifie('code accepté : aucune erreur JS', erreurs.length === 0, erreurs[0] || '');
  await ctx.close();
}
for (const [cas, worker, url, stockage] of [
  ['code refusé (404 du worker)', { status: 404, json: { ok: false, error: 'invalide', detail: 'code inconnu ou expiré' } }, URL0 + '?c=FAUX-CODE', null],
  ['code d\'un autre produit (kit-ia)', { json: { ok: true, produit: 'kit-ia' } }, URL0 + '?c=AUTRE-PRODUIT', null],
  ['réseau coupé', 'coupe', URL0 + '?c=TEST-CODE-OK', null],
  ['réponse « ok » sans produit', { json: { ok: true } }, URL0, 'SANS-PRODUIT'],
]) {
  const { ctx, page, erreurs, appels } = await ouvre({ url, worker, stockage });
  await page.waitForTimeout(300);
  const v = await etatVerrous(page);
  verifie(`${cas} : les verrous restent en place (moteur ET écran)`, v.libres === v.origine && v.ecart.length === 0 && !v.badge && appels.length === 1, JSON.stringify({ libres: v.libres, ecart: v.ecart, badge: v.badge, appels: appels.length }));
  verifie(`${cas} : l'écran est EXACTEMENT celui sans code (aucun message), aucune erreur JS`, v.texte === texteSansCode && erreurs.length === 0, erreurs[0] || '');
  await ctx.close();
}
{
  const { ctx, page } = await ouvre({ stockage: 'CODE-RANGE-OK', worker: { json: { ok: true, produit: 'croupier-entretien' } } });
  await page.waitForTimeout(300);
  const v = await etatVerrous(page);
  verifie('code rangé par acces.js (localStorage kdmc_acces_code) et accepté : tout s\'ouvre', v.libres === v.total && v.badge);
  await ctx.close();
}

/* ═══ 2. Les visuels, l'écran, le pavé ═══ */
const { ctx, page, erreurs } = await ouvre();

/* 2a. Les jetons de roulette sont sur les bonnes cases : 4 générateurs × 3 niveaux × 40 tirages, dessinés puis relus. */
const placement = await page.evaluate(() => {
  const E = window.__ENTRAINEUR, V = window.__VISUELS, fautes = [];
  const boite = document.createElement('div'); boite.style.cssText = 'position:absolute;left:-9999px;width:360px'; document.body.appendChild(boite);
  let vus = 0;
  for (const k of ['exoRouletteSimple', 'exoRouletteCombinee', 'exoRouletteTapis', 'exoRouletteComplet'])
    for (const niv of ['facile', 'normal', 'croupier'])
      for (let i = 0; i < 40; i++) {
        const e = E[k](niv); boite.textContent = ''; V.dessine(e.visuel, boite);
        const svg = boite.querySelector('svg');
        const cases = {}; svg.querySelectorAll('rect[data-num]').forEach((r) => { cases[r.getAttribute('data-num')] = { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; });
        const zones = {}; svg.querySelectorAll('rect[data-zone]').forEach((r) => { zones[r.getAttribute('data-zone')] = { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; });
        const jetons = [...svg.querySelectorAll('g.jeton[data-type]')];
        if (jetons.length !== e.visuel.mises.length) { fautes.push(k + ' : ' + jetons.length + ' jetons pour ' + e.visuel.mises.length + ' mises'); continue; }
        e.visuel.mises.forEach((m, j) => {
          const g = jetons[j], c = g.querySelectorAll('circle')[1];
          const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
          if (g.getAttribute('data-type') !== m.t || g.getAttribute('data-nums') !== m.nums.join(',') || +g.getAttribute('data-v') !== m.v) { fautes.push(k + ' : attributs du jeton ≠ mise ' + JSON.stringify(m)); return; }
          vus++;
          if (m.zone) {
            const z = zones[m.zone];
            if (!z || cx < z.x || cx > z.x + z.w || cy < z.y || cy > z.y + z.h) fautes.push(k + ' : jeton hors de la case ' + m.zone);
            return;
          }
          const rs = m.nums.map((n) => cases[n]);
          if (rs.some((r) => !r)) { fautes.push(k + ' : case absente du tapis pour ' + m.nums); return; }
          const ex = (m.t === 'transversale' || m.t === 'sixain') ? Math.min(...rs.map((r) => r.x)) : rs.reduce((s, r) => s + r.x + r.w / 2, 0) / rs.length;
          const ey = rs.reduce((s, r) => s + r.y + r.h / 2, 0) / rs.length;
          if (Math.abs(cx - ex) > 0.5 || Math.abs(cy - ey) > 0.5) fautes.push(`${k} : ${m.t} ${m.nums} posé en (${cx},${cy}), attendu (${ex},${ey})`);
        });
        const sortant = svg.querySelector('rect[data-sortant]');
        if (e.visuel.sortant && (!sortant || +sortant.getAttribute('data-num') !== e.visuel.sortant)) fautes.push(k + ' : numéro sorti mal marqué');
      }
  boite.remove();
  return { fautes, vus };
});
verifie(`roulette : ${placement.vus} jetons dessinés, chacun sur SA case (plein, cheval, transversale, carré, sixain, douzaine, colonne, chances simples)`,
  placement.fautes.length === 0 && placement.vus > 1000, placement.fautes.slice(0, 3).join(' | '));

/* 2b. Les cartes affichées sont celles de l'énoncé. */
const cartes = await page.evaluate(() => {
  const E = window.__ENTRAINEUR, V = window.__VISUELS, fautes = [];
  const boite = document.createElement('div'); document.body.appendChild(boite);
  let n = 0;
  for (const k of ['exoBlackjackMains', 'exoPuntoPoints', 'exoThuMains'])
    for (const niv of ['facile', 'normal', 'croupier'])
      for (let i = 0; i < 30; i++) {
        const e = E[k](niv); boite.textContent = ''; V.dessine(e.visuel, boite);
        const enonce = (e.enonce.match(/<b>([^<]+)<\/b>/) || [])[1].trim().split(/\s+/);
        /* on lit l'attribut ET ce qui est réellement dessiné (le rang écrit dans le coin) */
        const vues = [...boite.querySelectorAll('[data-carte]')].map((g) => g.getAttribute('data-carte'));
        const dessinees = [...boite.querySelectorAll('[data-carte]')].map((g) => g.querySelector('text').textContent);
        if (JSON.stringify(dessinees) !== JSON.stringify(enonce.map((c) => c.slice(0, -1)))) fautes.push(k + ' : rang dessiné ' + dessinees.join(' ') + ' ≠ ' + enonce.join(' '));
        n++;
        if (JSON.stringify(vues) !== JSON.stringify(enonce)) fautes.push(k + ' : ' + vues.join(' ') + ' ≠ ' + enonce.join(' '));
        const rouges = [...boite.querySelectorAll('[data-carte]')].filter((g) => /[♥♦]$/.test(g.getAttribute('data-carte')));
        if (rouges.some((g) => g.querySelector('text').getAttribute('fill') !== '#C0262D')) fautes.push(k + ' : carte rouge dessinée en noir');
      }
  boite.remove();
  return { fautes, n };
});
verifie(`cartes : ${cartes.n} mains dessinées = les cartes de l'énoncé (rouge pour cœur et carreau)`, cartes.fautes.length === 0, cartes.fautes.slice(0, 2).join(' | '));

/* 2c. Dés et piles de jetons = l'énoncé. */
const autres = await page.evaluate(() => {
  const E = window.__ENTRAINEUR, V = window.__VISUELS, fautes = [];
  const boite = document.createElement('div'); document.body.appendChild(boite);
  for (let i = 0; i < 60; i++) {
    const f = E.exoCrapsField('normal'); boite.textContent = ''; V.dessine(f.visuel, boite);
    const d = [...boite.querySelectorAll('[data-de]')].map((g) => +g.getAttribute('data-de'));
    const n = (f.enonce.replace(/<[^>]+>/g, ' ').match(/\d+/g) || []).map(Number);
    if (d.join() !== [n[1], n[2]].join()) fautes.push('field : dés ' + d + ' ≠ énoncé ' + n);
    const j = E.exoCalculJetons('normal'); boite.textContent = ''; V.dessine(j.visuel, boite);
    if (!/change/.test(j.enonce)) {
      const piles = [...boite.querySelectorAll('[data-pile-v]')].map((g) => g.getAttribute('data-pile-n') + '×' + g.getAttribute('data-pile-v'));
      const lignes = j.enonce.split('<br>').slice(1).map((l) => (l.replace(/<[^>]+>/g, '').match(/\d+/g) || []).join('×'));
      if (piles.join() !== lignes.join()) fautes.push('jetons : piles ' + piles + ' ≠ ' + lignes);
    }
  }
  const c = V.couleurJeton;
  if (!(c(5)[1] !== c(25)[1] && c(25)[1] !== c(100)[1] && c(17)[1] === c(10)[1] && c(1)[1] === c(1)[1])) fautes.push('couleurs des jetons incohérentes');
  boite.remove();
  return fautes;
});
verifie('dés du field et piles de jetons = l\'énoncé ; une couleur par valeur de jeton', autres.length === 0, autres.slice(0, 2).join(' | '));

/* 2d. Le cylindre cache les voisins à trouver, puis les montre après la réponse. */
await page.evaluate(() => { localStorage.setItem('croupier_niveau_v1', '"normal"'); });
await versExercice(page, 'roulette', 'roulette');
const ecranTable = await page.evaluate(() => ({ visuel: !!document.querySelector('#visuel:not([hidden]) svg[data-visuel="tapis"]'),
  jeton: document.querySelectorAll('#visuel .jeton[data-type]').length, enonce: document.getElementById('enonce').innerHTML,
  sortant: (document.querySelector('#visuel rect[data-sortant]') || {}).getAttribute ? document.querySelector('#visuel rect[data-sortant]').getAttribute('data-num') : null }));
verifie('écran « table » roulette : le tapis vert est dessiné, un jeton posé, le numéro sorti marqué = celui de l\'énoncé',
  ecranTable.visuel && ecranTable.jeton === 1 && ecranTable.sortant !== null && ecranTable.enonce.includes('Le <b>' + ecranTable.sortant + '</b> sort'), JSON.stringify(ecranTable));
const cyl = await page.evaluate(() => {
  const E = window.__ENTRAINEUR, V = window.__VISUELS, b = document.createElement('div'); document.body.appendChild(b);
  const e = E.exoRouletteCylindre('croupier'); V.dessine(e.visuel, b);
  const caches = [...b.querySelectorAll('path[data-etat="masque"]')].map((p) => +p.getAttribute('data-num'));
  const points = [...b.querySelectorAll('text')].filter((t) => t.textContent === '?').length;
  b.textContent = ''; V.dessine(e.visuel, b, { revele: true });
  const apres = [...b.querySelectorAll('text')].filter((t) => t.textContent === '?').length;
  b.remove();
  return { caches: caches.sort((x, y) => x - y).join(), attendu: [...e.reponse].sort((x, y) => x - y).join(), points, apres };
});
verifie('cylindre : les voisins à trouver sont cachés (« ? ») puis révélés après la réponse', cyl.caches === cyl.attendu && cyl.points === cyl.attendu.split(',').length && cyl.apres === 0, JSON.stringify(cyl));

/* 2e. Le pavé numérique tape la bonne valeur, efface, et valide. */
await versExercice(page, 'calcul', 'calcul-tables');
const touche = async (t) => page.click(`#pave [data-touche="${t}"]`);
for (const t of ['1', '7', ',', '5']) await touche(t);
const v1 = await page.inputValue('#reponse');
await touche('retour'); const v2 = await page.inputValue('#reponse');
await touche('00'); const v3 = await page.inputValue('#reponse');
await touche('C'); const v4 = await page.inputValue('#reponse');
verifie('pavé : 1 7 , 5 → « 17,5 » ; ⌫ → « 17, » ; 00 → « 17,00 » ; C → vide', v1 === '17,5' && v2 === '17,' && v3 === '17,00' && v4 === '', [v1, v2, v3, v4].join(' | '));
const [a, b] = nombres(await page.locator('#enonce').innerHTML());
for (const ch of String(a * b)) await touche(ch);
await page.click('#valider');
const verdict = await page.textContent('#verdict');
verifie('pavé : taper la bonne réponse au doigt puis ✓ → « Juste »', /Juste/.test(verdict), `${a}×${b} → ${verdict}`);
const paveTailles = await page.evaluate(() => [...document.querySelectorAll('#pave button')].map((x) => Math.round(x.getBoundingClientRect().height)));
verifie('pavé : 15 touches, toutes ≥ 44 px (C rouge, ✓ or)', paveTailles.length === 15 && paveTailles.every((h) => h >= 44)
  && await page.evaluate(() => getComputedStyle(document.querySelector('[data-touche="C"]')).color === 'rgb(255, 255, 255)' && /linear-gradient/.test(getComputedStyle(document.getElementById('valider')).backgroundImage)), paveTailles.join(','));

/* 2f. Les niveaux : onglets, chrono visé, gardés sur le téléphone. */
await page.click('[data-niveau="facile"]'); const oF = await page.textContent('#objectif');
await page.click('[data-niveau="croupier"]'); const oC = await page.textContent('#objectif');
const nivEtat = await page.evaluate(() => ({ presse: document.querySelector('[data-niveau="croupier"]').getAttribute('aria-pressed'), garde: localStorage.getItem('croupier_niveau_v1') }));
verifie('niveaux : Facile → Croupier change le temps visé (plus serré) et le choix est gardé', nombres(oF)[0] > nombres(oC)[0] && nivEtat.presse === 'true' && nivEtat.garde === '"croupier"', `${oF} / ${oC} / ${JSON.stringify(nivEtat)}`);
await page.click('[data-niveau="normal"]');

/* 2g. Le glossaire : recherche, catégories, langues. */
await page.locator('.ecran:not([hidden]) .retour[data-va="jeu"]').click();
await page.locator('.ecran:not([hidden]) [data-va="accueil"]').click();
await page.click('[data-va="glossaire"]');
await page.fill('#gloss-recherche', 'cheval');
const g1 = await page.evaluate(() => [...document.querySelectorAll('#gloss-liste dt')].map((d) => d.textContent));
await page.fill('#gloss-recherche', '');
await page.click('[data-cat="craps"]');
const g2 = await page.evaluate(() => [...document.querySelectorAll('#gloss-liste dt')].map((d) => d.textContent));
await page.click('[data-cat="roulette"]'); await page.click('[data-langue="it"]');
const g3 = await page.evaluate(() => document.getElementById('gloss-liste').innerText);
verifie('glossaire : la recherche « cheval » trouve Cheval', g1.includes('Cheval') && g1.length < 6, g1.join(','));
verifie('glossaire : la pastille Craps ne montre que le craps', g2.includes('Field') && !g2.includes('Cheval'), g2.join(','));
verifie('glossaire : la langue IT montre le terme italien (Cavallo)', /Cavallo/.test(g3));
await page.click('[data-cat="tout"]'); await page.click('[data-langue="en"]');

/* 2h. Chaque écran : ≥ 44 px, aucun débordement à 375 px, une fiche « Apprendre » pour chaque jeu. */
const mesure = () => page.evaluate(() => {
  const petites = [...document.querySelectorAll('a, button, input, summary')].map((e) => { const r = e.getBoundingClientRect();
    return (r.width > 0 && r.height < 44) ? `${e.tagName}#${e.id || e.textContent.trim().slice(0, 16)} h=${Math.round(r.height)}` : null; }).filter(Boolean);
  const deborde = [...document.querySelectorAll('.ecran:not([hidden]) *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1; }).map((e) => e.tagName + '.' + e.className).slice(0, 3);
  return { petites, scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, deborde,
    ecran: [...document.querySelectorAll('.ecran')].filter((e) => !e.hidden).map((e) => e.id).join() };
});
const ecrans = [];
ecrans.push(await mesure());
await page.locator('.ecran:not([hidden]) [data-va="accueil"]').click(); ecrans.push(await mesure());
const fiches = [];
for (const jeu of ['roulette', 'blackjack', 'punto', 'craps', 'thu', 'calcul']) {
  await page.click(`[data-jeu="${jeu}"]`); ecrans.push(await mesure());
  await page.click('.ecran:not([hidden]) [data-va="lecon"]');
  fiches.push(await page.evaluate(() => ({ titres: [...document.querySelectorAll('#lecon-corps .lecon-h')].map((h) => h.textContent), texte: document.getElementById('lecon-corps').innerText.length })));
  ecrans.push(await mesure());
  await page.locator('.ecran:not([hidden]) .retour[data-va="jeu"]').click();
  await page.locator('.ecran:not([hidden]) [data-va="accueil"]').click();
}
await page.click('[data-va="progres"]'); ecrans.push(await mesure());
await page.locator('.ecran:not([hidden]) [data-va="accueil"]').click();
await versExercice(page, 'blackjack', 'blackjack-mains'); ecrans.push(await mesure());
await versExercice(page, 'thu', 'thu-mains'); ecrans.push(await mesure());
const mauvais = ecrans.filter((m) => m.petites.length || m.scroll || m.deborde.length);
verifie(`375 px : ${ecrans.length} écrans (accueil, 6 jeux, 6 fiches, glossaire, progrès, tables) sans cible < 44 px ni débordement`, mauvais.length === 0, JSON.stringify(mauvais[0] || ''));
verifie('chaque jeu a sa fiche « Apprendre » (rapports ou règles, gestes ou astuces, pièges)', fiches.length === 6 && fiches.every((f) => f.titres.length >= 3 && f.texte > 400), JSON.stringify(fiches.map((f) => f.titres.length)));
verifie('la fiche roulette contient les rapports, les gestes et les pièges', /rapports/i.test(fiches[0].titres.join()) && /gestes/i.test(fiches[0].titres.join()) && /pièges/i.test(fiches[0].titres.join()));
const bj = await page.evaluate(() => ({ cartes: [...document.querySelectorAll('#visuel [data-carte]')].length }));
verifie('écran poker : les 5 cartes sont dessinées en grand', bj.cartes === 5, JSON.stringify(bj));

/* 2i. Bouton retour de l'iPhone : on revient à l'écran précédent, pas hors de la page. */
await page.goBack(); await page.waitForTimeout(200);
const retour = await page.evaluate(() => [...document.querySelectorAll('.ecran')].filter((e) => !e.hidden).map((e) => e.id).join());
verifie('bouton retour du navigateur : revient à l\'écran précédent dans la page', retour === 'ecran-jeu' && page.url().startsWith(URL0), retour);

/* 2j. Thème sombre par défaut, contraste AA du texte principal. */
const theme = await page.evaluate(() => {
  const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const fond = getComputedStyle(document.body).backgroundColor;
  const cs = getComputedStyle(document.documentElement);
  return { fond, sombre: !document.documentElement.getAttribute('data-theme'),
    or: ratio(cs.getPropertyValue('--or').trim().replace(/^#(..)(..)(..)$/, (m, a, b, c) => `rgb(${parseInt(a, 16)},${parseInt(b, 16)},${parseInt(c, 16)})`), fond),
    texte3: ratio(cs.getPropertyValue('--texte3').trim().replace(/^#(..)(..)(..)$/, (m, a, b, c) => `rgb(${parseInt(a, 16)},${parseInt(b, 16)},${parseInt(c, 16)})`), fond) };
});
verifie('thème sombre par défaut ; or et texte discret ≥ 4,5:1 sur le fond (AA)', theme.sombre && theme.or >= 4.5 && theme.texte3 >= 4.5, JSON.stringify(theme));
verifie('aucune erreur JS sur tout le parcours', erreurs.length === 0, erreurs[0] || '');

/* 2k. Sécurité : les visuels ne passent jamais par une chaîne HTML. */
const visuSrc = fs.readFileSync(path.join(ROOT, 'shops/croupier/entrainement-visuels.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'shops/croupier/entrainement-lecons.js'), 'utf8');
verifie('visuels et leçons : aucun innerHTML / insertAdjacentHTML / outerHTML', !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(visuSrc));
const html = fs.readFileSync(path.join(ROOT, 'shops/croupier/entrainement.html'), 'utf8');
verifie('bulle de version v2.0.0 en bas de la page', /version-badge-pwa\.js"[^>]*data-version="v2\.0\.0"/.test(html));

await ctx.close(); await nav.close(); srv.close();
console.log(`ENTRAÎNEUR — DESIGN ET ACCÈS — ${ok.length} contrôle(s) OK, ${echecs.length} échec(s)`);
if (echecs.length) { for (const e of echecs) console.error('  ✗ ' + e); process.exit(1); }
console.log('  code d\'accès (6 cas) · jetons sur leurs cases · cartes · dés · cylindre · pavé · niveaux · glossaire · 375 px · thème');
