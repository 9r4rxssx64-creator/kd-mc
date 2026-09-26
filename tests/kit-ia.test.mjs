/* Preuve du site kit.kd-mc.com (Kit IA de l'indépendant).
   Ce qui coûte de l'argent si c'est faux : un prix affiché ≠ prix vérifié par le
   worker, une CSP qui bloque l'appel (« pas de réseau »), un module payant qui
   fuit dans l'aperçu, un lecteur qui ne s'ouvre pas avec un code valide. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import http from 'node:http';
import { extname, join } from 'node:path';
import { __test as VENTE } from '../services/kdmc-vente/worker.js';

const DIR = new URL('../shops/kit-ia/', import.meta.url);
const INDEX = readFileSync(new URL('index.html', DIR), 'utf8');
const LIRE = readFileSync(new URL('lire.html', DIR), 'utf8');
const JS = readFileSync(new URL('kit.js', DIR), 'utf8');
const CSS = readFileSync(new URL('kit.css', DIR), 'utf8');
const PRODUIT = VENTE.PRODUITS['kit-ia'];

test('PARITÉ : chaque produit livré sur kit.kd-mc.com est dans le menu, au bon prix, avec un lien de paiement au bon montant', () => {
  assert.ok(PRODUIT, 'kit-ia absent du catalogue du worker');
  assert.equal(JS.match(/var PRODUIT = '([^']+)'/)[1], 'kit-ia');
  const surKit = Object.entries(VENTE.PRODUITS).filter(([, p]) => p.livre.startsWith('https://kit.kd-mc.com/'));
  assert.ok(surKit.length >= 2, 'kit + club attendus');
  const menu = [...INDEX.matchAll(/<option value="([a-z-]+)">([^<]+)<\/option>/g)].filter((m) => m[1].endsWith('-ia'));
  assert.deepEqual(menu.map((m) => m[1]).sort(), surKit.map(([id]) => id).sort(), 'menu « ce que tu as acheté » ≠ catalogue du worker');
  const boutons = { 'kit-ia': ['payer-paypal', 'payer-revolut'], 'club-ia': ['payer-club-paypal', 'payer-club-revolut'] };
  for (const [id, p] of surKit) {
    const prix = p.prix + ' €';
    const opt = menu.find((m) => m[1] === id);
    assert.ok(opt[2].includes(prix), `${id} : le menu dit « ${opt[2]} » mais le worker vérifie ${prix}`);
    assert.ok(p.livre.startsWith('https://kit.kd-mc.com/lire.html'), id + ' : lecteur attendu'); assert.equal(p.devise, 'EUR');
    /* Depuis le 18.09 le bouton principal est un <button data-caisse> (commande créée
       côté serveur) qui garde l'ancien paypal.me en data-secours. Le montant reste
       l'invariant : il doit valoir celui que le worker vérifiera. */
    for (const b of boutons[id] || []) {
      const ligne = INDEX.match(new RegExp('id="' + b + '"[^>]*(?:href|data-secours)="([^"]+)"[^>]*>([^<]+)<'));
      assert.ok(ligne, b + ' absent');
      assert.ok(ligne[2].includes(prix), `${b} annonce « ${ligne[2]} » mais le worker vérifie ${prix}`);
      assert.ok(ligne[1].toLowerCase().includes(String(p.prix) + 'eur'), `${b} : le lien de paiement ne porte pas le montant ${p.prix} EUR (${ligne[1]})`);
    }
  }
  /* La caisse doit être branchée sur le bon produit pour CHACUN des deux paliers,
     et pour CHACUN des trois moyens de Kevin (18.09 : « aussi mon Revolut et
     IBAN »). Un moyen oublié = des acheteurs qui repartent. */
  for (const id of ['kit-ia', 'club-ia']) {
    for (const moyen of ['paypal', 'revolut', 'virement']) {
      const re = new RegExp('data-caisse[^>]*data-moyen="' + moyen + '"[^>]*data-produit="' + id + '"');
      assert.match(INDEX, re, 'pas de bouton ' + moyen + ' pour ' + id);
    }
  }
  /* Le virement ne doit PAS être visible d'emblée : il n'existe que si l'IBAN est
     rangé côté serveur, et c'est le script qui le révèle après /health. */
  assert.match(INDEX, /<p data-moyen-virement hidden>/, 'le bouton virement est visible avant même de savoir si l\'IBAN existe');
  assert.match(JS, /h\.moyens && h\.moyens\.indexOf\('virement'\) >= 0/, 'rien ne révèle le virement quand il est ouvert');
  /* Sans JavaScript, les boutons sont inertes : il faut un chemin de secours. */
  const ns = [...INDEX.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map((m) => m[1]);
  assert.equal(ns.length, 2, 'un <noscript> par palier (kit + club) attendu');
  /* index.html ne porte QUE les deux paliers ; les niches ont leur propre page
     (contrôlées par tests/produits-fabrique.test.mjs). */
  for (const id of ['kit-ia', 'club-ia']) {
    const prix = VENTE.PRODUITS[id].prix;
    assert.ok(ns.some((t) => t.includes('paypal.me/kdmc/' + prix + 'EUR') && t.includes('revolut.me/kdmc/' + prix + 'eur')),
      id + ' : sans JavaScript, aucun moyen de payer ' + prix + ' €');
  }
  assert.ok(INDEX.includes('"price":"' + PRODUIT.prix + '"'), 'le prix des données structurées a divergé');
  assert.ok(VENTE.PRODUITS['club-ia'].contenu.includes('kit-ia'), 'le Club doit inclure le kit (c\'est ce que la page promet)');
  assert.equal(VENTE.PRODUITS['club-ia'].ttlJours, 365, 'la page promet un accès 1 an');
});

test('CSP : les deux pages ne parlent QU\'au worker de vente, aucun script en ligne', () => {
  const api = JS.match(/var API = '([^']+)'/)[1];
  for (const [nom, html] of [['index', INDEX], ['lire', LIRE]]) {
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /script-src 'self'(;|$)/, nom);
    assert.ok(!csp.includes("'unsafe-inline'") || !/script-src[^;]*'unsafe-inline'/.test(csp), nom + ' : script en ligne autorisé');
    assert.ok(csp.includes('connect-src ' + api), `${nom} : le script appelle ${api} mais la CSP ne l'autorise pas → « Load failed »`);
    assert.ok(!/<script>[^<]/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')), nom + ' : script en ligne présent');
  }
});

test('aucun secret, aucun code d\'accès en dur, aucun contenu payant dans les fichiers publics', () => {
  for (const source of [INDEX, LIRE, JS, CSS]) {
    assert.ok(!/sk-ant-api|AIza[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{20}|xkeysib-/.test(source));
    assert.ok(!/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(source), 'un code ressemblant à un accès valide est écrit en clair');
    assert.ok(!/<pre class="consigne">/.test(source), 'une consigne du kit (contenu payant) est dans un fichier public');
  }
});

test('logique pure : normaliseCode, interprete, interpreteLecture', () => {
  const fn = new Function('window', 'document', 'localStorage', 'location', JS + '\nreturn globalThis.__kit;');
  const k = fn({}, undefined, undefined, undefined);
  assert.ok(k, 'la logique pure doit être exportée même sans navigateur');
  assert.equal(k.normaliseCode(' abcd-efgh jklm npqr '), 'ABCD-EFGH-JKLM-NPQR');
  assert.equal(k.normaliseCode('ABCDEFGHJKLMNPQR'), 'ABCD-EFGH-JKLM-NPQR');
  assert.equal(k.normaliseCode('ABCD'), '', 'un code incomplet ne doit jamais passer');
  assert.equal(k.interprete({ ok: true, verifie: true, code: 'AAAA-BBBB-CCCC-DDDD' }, true).etat, 'ok');
  assert.match(k.interprete({ ok: true, en_attente: true, detail: 'jusqu\'à 3 h' }, true).texte, /3 h/, 'on DIT le délai');
  assert.equal(k.interprete({ ok: false, error: 'trop_de_tentatives' }, false).etat, 'erreur');
  const l = k.interpreteLecture;
  assert.equal(l({ ok: true, modules: [], sommaire: [] }, true, false).etat, 'apercu');
  assert.equal(l({ ok: true, modules: [], sommaire: [] }, true, true).etat, 'complet');
  assert.equal(l({ ok: false, error: 'invalide', detail: 'code inconnu' }, false, true).etat, 'code_invalide');
  assert.match(l({ ok: false, error: 'contenu_indisponible' }, false, true).texte, /code reste valable/, 'une panne de contenu ne doit pas faire croire au client que son code est mort');
  /* Vitrine Club : les plus récentes d'abord, jamais un module du kit, jamais un id brut à l'écran */
  const somm = [{ id: 'm1', ordre: 1, titre: 'Kit', source: 'kit-ia' }, { id: 's2026-38', ordre: 8, titre: 'A', source: 'club-ia' }, { id: 's2026-40', ordre: 10, titre: 'C', source: 'club-ia' }, { id: 's2026-39', ordre: 9, titre: 'B', source: 'club-ia' }];
  assert.deepEqual(k.clubRecentes(somm, 2).map((x) => x.titre), ['C', 'B']);
  assert.deepEqual(k.clubRecentes([], 3), []);
  assert.equal(k.clubSemaineLisible('s2026-38'), '38 de 2026');
  assert.equal(k.clubSemaineLisible('m1'), '');
});

function serveurLocal(racine) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  const s = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]);
    const f = join(racine, chemin === '/' ? '/index.html' : chemin);
    try { res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
    catch (_) { res.writeHead(404); res.end('non trouvé'); }
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, port: s.address().port })));
}

/* Faux worker : ce que le VRAI renvoie (mêmes formes que vente.test.mjs). */
const SOMMAIRE = [{ id: 'm1', ordre: 1, titre: 'Ton assistant en 20 min', gratuit: true }, { id: 'm2', ordre: 2, titre: 'La consigne parfaite', gratuit: false }];
const M1 = { id: 'm1', ordre: 1, titre: 'Ton assistant en 20 min', gratuit: true, html: '<h2>Module 1</h2><p class="promesse">Promesse.</p><h3>Test</h3><pre class="consigne">Tu es [métier]. Écris…</pre><div class="exemple">Résultat</div>' };
const M2 = { id: 'm2', ordre: 2, titre: 'La consigne parfaite', gratuit: false, html: '<h2>Module 2</h2><pre class="consigne">SECRET-PAYANT</pre>' };
const CLUB = [{ id: 's2026-38', ordre: 8, titre: 'Répondre à un avis négatif sans t\'énerver', gratuit: false, source: 'club-ia' },
  { id: 's2026-39', ordre: 9, titre: 'Relancer un devis sans se sentir lourd', gratuit: false, source: 'club-ia' },
  { id: 's2026-40', ordre: 10, titre: 'Préparer un rendez-vous en 5 minutes', gratuit: false, source: 'club-ia' },
  { id: 's2026-41', ordre: 11, titre: 'La plus récente', gratuit: false, source: 'club-ia' }];
function fauxWorker(page) {
  const appels = [];
  return page.route('https://kdmc-vente.9r4rxssx64.workers.dev/**', (route) => {
    const u = new URL(route.request().url()); appels.push(u.pathname + u.search);
    const rep = (obj, status) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });
    if (u.pathname === '/apercu' && u.searchParams.get('produit') === 'club-ia') {
      return rep(page.__clubVide ? { ok: false, error: 'contenu_indisponible' } : { ok: true, produit: 'club-ia', modules: [M1], sommaire: [...SOMMAIRE.map((s) => ({ ...s, source: 'kit-ia' })), ...CLUB] });
    }
    if (u.pathname === '/apercu') return rep({ ok: true, produit: 'kit-ia', modules: [M1], sommaire: SOMMAIRE });
    if (u.pathname === '/lire') {
      return u.searchParams.get('c') === 'ABCD-EFGH-JKLM-NPQR'
        ? rep({ ok: true, produit: 'kit-ia', modules: [M1, M2], sommaire: SOMMAIRE })
        : rep({ ok: false, error: 'invalide', detail: 'code inconnu ou expiré' }, 404);
    }
    if (u.pathname === '/reclamer') { const b = route.request().postDataJSON(); return rep({ ok: true, verifie: true, code: b.produit === 'club-ia' ? 'CCCC-CCCC-CCCC-CCCC' : 'ABCD-EFGH-JKLM-NPQR', livre: 'https://kit.kd-mc.com/lire.html', email_envoye: false }); }
    return rep({ ok: false, error: 'not_found' }, 404);
  }).then(() => appels);
}

async function pageTest(nav, port, chemin) {
  const page = await nav.newPage({ viewport: { width: 375, height: 812 } });
  const soucis = [];
  page.on('pageerror', (e) => soucis.push('exception: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('ERR_CERT_AUTHORITY_INVALID')) return;
    /* Un mauvais code = le worker répond 404 EXPRÈS ; Chromium le journalise comme
       une « erreur » de ressource. C'est le comportement attendu, pas un défaut de la page. */
    const loc = (m.location() || {}).url || '';
    if (/404/.test(m.text()) && loc.startsWith('https://kdmc-vente.9r4rxssx64.workers.dev/')) return;
    soucis.push('console: ' + m.text());
  });
  const appels = await fauxWorker(page);
  await page.goto('http://127.0.0.1:' + port + chemin, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => typeof window.__kit), 'object', 'kit.js n\'a pas tourné — tout le reste serait du faux vert');
  return { page, soucis, appels };
}
async function ciblesPetites(page) {
  return page.evaluate(() => [...document.querySelectorAll('input,select,button,a,summary')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : ''), h: Math.round(e.getBoundingClientRect().height) }))
    .filter((x) => x.h < 44));
}

test('vrai navigateur — page de vente : 44 px partout, 375 px sans débordement, récupération d\'accès → code', async () => {
  const { s, port } = await serveurLocal(DIR.pathname);
  const nav = await chromium.launch({ headless: true });
  try {
    const { page, soucis } = await pageTest(nav, port, '/index.html');
    assert.deepEqual(await ciblesPetites(page), [], 'cibles tactiles sous 44 px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'débordement horizontal');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('resultat')).display), 'none');
    await page.fill('#email', 'client@exemple.fr');
    await page.click('#valider');
    await page.waitForSelector('#resultat.ok');
    assert.equal(await page.textContent('#resultat code'), 'ABCD-EFGH-JKLM-NPQR');
    assert.match(await page.textContent('#resultat p'), /pas pu partir par e-mail/, 'sans e-mail envoyé, on le DIT au client');
    /* Le choix « Club » part bien au worker comme club-ia */
    await page.selectOption('#produit', 'club-ia');
    await page.click('#valider');
    await page.waitForFunction(() => (document.querySelector('#resultat code') || {}).textContent === 'CCCC-CCCC-CCCC-CCCC');
    assert.equal(await page.evaluate(() => localStorage.getItem('kit_ia_code')), 'CCCC-CCCC-CCCC-CCCC', 'le dernier code délivré doit être mémorisé pour le lecteur');
    /* Vitrine « déjà publié au Club » : 3 titres, du plus récent au plus ancien, aucun titre du kit, aucun secret */
    await page.waitForSelector('#clubSemaine:not([hidden])');
    const titres = await page.$$eval('#clubListe li strong', (els) => els.map((e) => e.textContent));
    assert.deepEqual(titres, ['La plus récente', 'Préparer un rendez-vous en 5 minutes', 'Relancer un devis sans se sentir lourd']);
    assert.match(await page.textContent('#clubListe li'), /semaine 41 de 2026/);
    assert.ok(!(await page.textContent('#clubSemaine')).includes('Ton assistant en 20 min'), 'un module du kit n\'a rien à faire dans la vitrine du Club');
    assert.ok(!(await page.content()).includes('SECRET-PAYANT'));
    assert.deepEqual(soucis, []);
  } finally { await nav.close(); s.close(); }
});

test('vrai navigateur — vitrine Club : base vide ou worker en panne → le bloc reste caché, la page vit', async () => {
  const { s, port } = await serveurLocal(DIR.pathname);
  const nav = await chromium.launch({ headless: true });
  try {
    const page = await nav.newPage({ viewport: { width: 375, height: 812 } });
    page.__clubVide = true;
    const soucis = [];
    page.on('pageerror', (e) => soucis.push('exception: ' + e.message));
    await fauxWorker(page);
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('clubSemaine')).display), 'none');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('club')).display), 'block', 'la carte Club reste visible');
    assert.deepEqual(soucis, []);
  } finally { await nav.close(); s.close(); }
});

test('vrai navigateur — lecteur : aperçu gratuit sans code, verrou sur le module 2, ouverture complète avec le code', async () => {
  const { s, port } = await serveurLocal(DIR.pathname);
  const nav = await chromium.launch({ headless: true });
  try {
    const { page, soucis, appels } = await pageTest(nav, port, '/lire.html');
    await page.waitForSelector('#module h2');
    assert.equal(await page.textContent('#module h2'), 'Module 1');
    assert.ok(appels.some((a) => a.startsWith('/apercu?produit=kit-ia')), 'sans code, le lecteur demande l\'aperçu');
    assert.equal(await page.locator('#module button.copier').count(), 1, 'chaque consigne a son bouton Copier');
    assert.deepEqual(await ciblesPetites(page), [], 'cibles tactiles sous 44 px');
    /* Module 2 = verrouillé : on voit le titre et l'invitation à acheter, jamais le secret. */
    await page.click('#suivant');
    await page.waitForSelector('#verrou:not([hidden])');
    assert.ok(!(await page.content()).includes('SECRET-PAYANT'), 'le contenu payant ne doit pas être dans la page sans code');
    /* Mauvais code → message clair, retour à l'aperçu. Bon code → tout s'ouvre. */
    await page.fill('#codeAcces', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    await page.click('#ouvrir');
    await page.waitForSelector('#resultat.erreur');
    await page.fill('#codeAcces', 'abcd efgh jklm npqr');
    await page.click('#ouvrir');
    await page.waitForFunction(() => document.getElementById('titre').textContent === 'Ton kit complet');
    await page.click('#suivant');
    await page.waitForFunction(() => document.querySelector('#module h2') && document.querySelector('#module h2').textContent === 'Module 2');
    assert.ok((await page.textContent('#module')).includes('SECRET-PAYANT'));
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('verrou')).display), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'débordement horizontal');
    assert.deepEqual(soucis, []);
  } finally { await nav.close(); s.close(); }
});
