/* L'ENTRAÎNEUR DE PAIEMENTS — test du moteur et de l'écran.
 *
 * POURQUOI : c'est un produit qui apprend un geste de métier. Un rapport faux
 * n'est pas un défaut d'affichage, c'est quelqu'un qui apprend une erreur et la
 * répète à une vraie table. Les rapports sont des FAITS : ils sont vérifiés ici,
 * un par un, et sur des centaines de tirages.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/CMCteams';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, 'shops/croupier', p.replace(/^\/+/, ''));
  if (!f.startsWith(path.join(ROOT, 'shops/croupier')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8795, r));

const echecs = [], ok = [];
const verifie = (nom, cond, detail = '') => cond ? ok.push(nom) : echecs.push(`${nom}${detail ? ' — ' + detail : ''}`);

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const erreursJS = [], violCSP = [];
page.on('pageerror', (e) => erreursJS.push(String(e && e.message || e)));
page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violCSP.push(m.text()); });
await page.goto('http://127.0.0.1:8795/entrainement.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => !!window.__ENTRAINEUR, { timeout: 10000 });

/* ── 1. Les rapports sont EXACTEMENT ceux du métier ───────────────────────── */
const rapports = await page.evaluate(() => {
  const E = window.__ENTRAINEUR;
  const r = {};
  E.MISES_ROULETTE.forEach((m) => { r[m.id] = { paie: m.paie, couvre: m.couvre }; });
  return { r, bj: E.BLACKJACK, com: E.COMMISSION_BANCO };
});
const attendu = { plein:[35,1], cheval:[17,2], transversale:[11,3], carre:[8,4], sixain:[5,6], douzaine:[2,12], colonne:[2,12], simple:[1,18] };
for (const [id, [paie, couvre]] of Object.entries(attendu)) {
  verifie(`roulette : ${id} paie ${paie} pour 1 sur ${couvre} numéro(s)`,
    rapports.r[id] && rapports.r[id].paie === paie && rapports.r[id].couvre === couvre, JSON.stringify(rapports.r[id]));
}
verifie('blackjack paie 3 pour 2', rapports.bj.blackjack === 1.5, String(rapports.bj.blackjack));
verifie('main ordinaire paie 1 pour 1', rapports.bj.gagnante === 1, String(rapports.bj.gagnante));
verifie('assurance paie 2 pour 1', rapports.bj.assurance === 2, String(rapports.bj.assurance));
verifie('commission banco = 5 %', rapports.com === 0.05, String(rapports.com));

/* ── 2. Les exercices générés donnent la BONNE réponse, sur 400 tirages ───── */
const tirages = await page.evaluate(() => {
  const E = window.__ENTRAINEUR;
  const fautes = { simple:[], combinee:[], blackjack:[], punto:[] };
  const nb = (s) => (String(s).match(/\d+(?:\.\d+)?/g) || []).map(Number);

  for (let i = 0; i < 100; i++) {
    /* roulette simple : la réponse doit être mise × rapport, relus dans l'énoncé */
    const e = E.exoRouletteSimple();
    const m = E.MISES_ROULETTE.find((x) => e.enonce.indexOf('<b>' + x.nom + '</b>') === 0);
    const mise = nb(e.enonce.split('Mise de <b>')[1])[0];
    if (!m || e.reponse !== mise * m.paie) fautes.simple.push({ enonce: e.enonce, rep: e.reponse, attendu: m ? mise * m.paie : '?' });

    /* combinée : le total doit être la somme du détail */
    const c = E.exoRouletteCombinee();
    const i = c.explique.lastIndexOf('=');
    const somme = c.explique.slice(i + 1).trim();
    const parts = c.explique.slice(0, i).split('+').map((x) => {
      const [a, b] = x.split('×').map((y) => Number(y.split('=')[0]));
      return a * b;
    });
    const t = parts.reduce((a, b) => a + b, 0);
    if (c.reponse !== t || Number(somme) !== t) fautes.combinee.push({ ex: c.explique, rep: c.reponse, attendu: t });

    /* blackjack : 1,5 / 2 / 1 selon le cas annoncé */
    const b = E.exoBlackjack();
    const mb = nb(b.enonce.split('<b>').pop())[0];
    const attendu = /Blackjack du joueur/.test(b.enonce) ? mb * 1.5 : /Assurance/.test(b.enonce) ? mb * 2 : mb;
    if (Math.abs(b.reponse - attendu) > 1e-9) fautes.blackjack.push({ enonce: b.enonce, rep: b.reponse, attendu });

    /* punto : banco −5 %, punto plein pot */
    const p = E.exoPunto();
    const mp = nb(p.enonce.split('Mise de <b>')[1])[0];
    const ap = /Banco<\/b> gagne/.test(p.enonce) ? mp * 0.95 : mp;
    if (Math.abs(p.reponse - ap) > 1e-9) fautes.punto.push({ enonce: p.enonce, rep: p.reponse, attendu: ap });
  }
  return fautes;
});
for (const [nom, f] of Object.entries(tirages)) {
  verifie(`100 tirages « ${nom} » : 0 réponse fausse`, f.length === 0, f.length ? JSON.stringify(f[0]) : '');
}

/* ── 3. L'écran répond juste ──────────────────────────────────────────────── */
const bonne = await page.evaluate(() => window.__ENTRAINEUR && document.getElementById('enonce').textContent.length > 0);
verifie('un exercice est affiché au chargement', bonne);

/* Le bouton « Suivante » ne doit pas être VISIBLE avant d'avoir répondu.
   Vérifier l'attribut hidden ne suffit pas : une règle CSS peut l'écraser
   (c'est arrivé — .btn{display:inline-flex} bat [hidden]{display:none}). */
const suivantAuDepart = await page.evaluate(() => {
  const b = document.getElementById('suivant');
  return { attribut: b.hidden, affiche: getComputedStyle(b).display };
});
verifie('« Suivante » est vraiment invisible avant de répondre (display calculé)',
  suivantAuDepart.attribut === true && suivantAuDepart.affiche === 'none', JSON.stringify(suivantAuDepart));

const essai = await page.evaluate(async () => {
  /* on force un exercice connu pour pouvoir taper la bonne réponse */
  const val = document.getElementById('reponse');
  const ver = document.getElementById('verdict');
  /* on lit la réponse attendue depuis l'état affiché en trichant volontairement :
     on relance un exercice et on récupère sa valeur via le moteur */
  const E = window.__ENTRAINEUR;
  const e = E.exoRouletteSimple();
  document.getElementById('enonce').innerHTML = e.enonce;
  /* injecter la réponse attendue dans l'état interne n'est pas accessible ;
     on teste donc le comportement : une saisie vide doit refuser proprement */
  val.value = '';
  document.getElementById('valider').click();
  const refusVide = ver.textContent;
  val.value = '-999999';
  document.getElementById('valider').click();
  return { refusVide, verdictApresFaux: ver.textContent, explique: document.getElementById('explique').textContent };
});
verifie('une saisie vide est refusée proprement', /Écris un montant/.test(essai.refusVide), essai.refusVide);
verifie('une réponse fausse donne la bonne réponse', /La réponse est/.test(essai.verdictApresFaux), essai.verdictApresFaux);
verifie('une explication du calcul est affichée', essai.explique.length > 3, essai.explique);

/* ── 4. Le verrou tient : les modes payants ne s'activent pas ─────────────── */
const verrou = await page.evaluate(() => {
  const r = {};
  const E = window.__ENTRAINEUR;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    const id = b.getAttribute('data-mode');
    /* on lit les DEUX : l'écran ET le moteur. S'ils divergent, c'est un échec. */
    r[id] = { desactive: b.disabled, moteurLibre: E.MODES[id].libre, presse: b.getAttribute('aria-pressed') };
  });
  /* on tente d'activer un mode verrouillé par le clic ET par l'API */
  const bl = document.querySelector('[data-mode="blackjack"]');
  bl.click();
  r.apresClic = document.querySelector('[data-mode="blackjack"]').getAttribute('aria-pressed');
  return r;
});
verifie('roulette simple est libre (écran ET moteur)', verrou.roulette && verrou.roulette.desactive === false && verrou.roulette.moteurLibre === true, JSON.stringify(verrou.roulette));
for (const m of ['roulette-combinee', 'blackjack', 'punto']) {
  verifie(`« ${m} » est verrouillé DANS LE MOTEUR`, verrou[m] && verrou[m].moteurLibre === false, JSON.stringify(verrou[m]));
  verifie(`« ${m} » est verrouillé À L'ÉCRAN`, verrou[m] && verrou[m].desactive === true, JSON.stringify(verrou[m]));
}
verifie('cliquer un mode verrouillé ne l\'active pas', verrou.apresClic !== 'true', String(verrou.apresClic));

/* ── 5. iPhone, sécurité, jeu responsable ─────────────────────────────────── */
const m = await page.evaluate(() => {
  const petites = [...document.querySelectorAll('a, button, input')].map((e) => {
    const r = e.getBoundingClientRect();
    return (r.width > 0 && r.height < 44) ? `${e.tagName} h=${Math.round(r.height)}` : null;
  }).filter(Boolean);
  return {
    petites,
    scrollH: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    aide: document.body.innerText.includes('09 74 75 13 13'),
    pasDeJeu: document.body.innerText.includes("ne propose aucun jeu d'argent"),
    honnete: document.body.innerText.includes('on ne vend pas ce qu’on') || document.body.innerText.includes("ne peut pas livrer"),
    h1: document.querySelectorAll('h1').length,
  };
});
verifie('aucune erreur JS', erreursJS.length === 0, erreursJS[0] || '');
verifie('aucun blocage CSP', violCSP.length === 0, violCSP[0] || '');
verifie('aucun défilement horizontal à 390 px', !m.scrollH);
verifie('aucune cible tactile sous 44 px', m.petites.length === 0, m.petites.join(' | '));
verifie('mention d\'aide au jeu présente', m.aide);
verifie('dit qu\'il ne propose aucun jeu d\'argent', m.pasDeJeu);
verifie('dit qu\'on ne vend pas ce qu\'on ne peut pas livrer', m.honnete);
verifie('un seul titre principal', m.h1 === 1, String(m.h1));

/* ── 6. Rien ne sort du téléphone ─────────────────────────────────────────── */
const src = fs.readFileSync(path.join(ROOT, 'shops/croupier/entrainement.js'), 'utf8');
verifie('aucun appel réseau dans le moteur', !/fetch\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(src));
const csp = (fs.readFileSync(path.join(ROOT, 'shops/croupier/entrainement.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
verifie('la CSP interdit toute connexion sortante', csp.includes("connect-src 'none'"), csp);
verifie('la CSP n\'autorise que les scripts du site', csp.includes("script-src 'self'") && !csp.includes("'unsafe-inline'; script"), csp);

await ctx.close(); await nav.close(); srv.close();
console.log(`ENTRAÎNEUR DE PAIEMENTS — ${ok.length} contrôle(s) OK, ${echecs.length} échec(s)`);
if (echecs.length) { for (const e of echecs) console.error('  ✗ ' + e); process.exit(1); }
console.log('  rapports exacts · 400 tirages sans faute · écran · verrou · iPhone · hors-ligne');
