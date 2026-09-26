/* Preuve de la page « Récupérer mon accès ».
   Le contrôle qui compte vraiment : la page et le worker parlent du MÊME
   catalogue. Sinon un client choisit un produit qui n'existe pas côté serveur
   et sa vente part en file manuelle pour rien. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import http from 'node:http';
import { extname, join } from 'node:path';
import { __test as VENTE } from '../services/kdmc-vente/worker.js';

const HTML = readFileSync(new URL('../shops/croupier/acces.html', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../shops/croupier/acces.js', import.meta.url), 'utf8');

test('PARITÉ : chaque produit du menu existe côté worker, et inversement', () => {
  const dansLaPage = [...HTML.matchAll(/<option value="(croupier-[a-z-]+)"/g)].map((m) => m[1]);
  /* Seuls les produits LIVRÉS sur croupier.kd-mc.com ont leur place dans ce menu :
     le catalogue du worker sert aussi d'autres sites (kit.kd-mc.com…). */
  const dansLeWorker = Object.keys(VENTE.PRODUITS).filter((id) => VENTE.PRODUITS[id].livre.startsWith('https://croupier.kd-mc.com/'));
  assert.deepEqual([...dansLaPage].sort(), [...dansLeWorker].sort(),
    'menu de la page et catalogue du worker ont divergé — un client pourrait choisir un produit inexistant');
});

test('PARITÉ : le prix affiché dans le menu est celui que le worker vérifie', () => {
  for (const [id, p] of Object.entries(VENTE.PRODUITS)) {
    if (!p.livre.startsWith('https://croupier.kd-mc.com/')) continue;
    const ligne = HTML.match(new RegExp('<option value="' + id + '">([^<]+)</option>'));
    assert.ok(ligne, `produit ${id} absent du menu`);
    assert.ok(ligne[1].includes(p.prix + ' ' + (p.devise === 'EUR' ? '€' : p.devise)),
      `le menu annonce « ${ligne[1]} » mais le worker vérifie ${p.prix} ${p.devise} — le client paierait le mauvais montant`);
  }
});

test('CSP : la page ne peut parler QU\'au worker de vente', () => {
  const csp = HTML.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src https:\/\/kdmc-vente\.9r4rxssx64\.workers\.dev(;|$)/);
  assert.match(csp, /script-src 'self'/);
  assert.ok(!csp.includes("script-src 'unsafe-inline'"), 'pas de script en ligne');
  const api = JS.match(/var API = '([^']+)'/)[1];
  assert.ok(csp.includes(api), `le script appelle ${api} mais la CSP ne l'autorise pas → « Load failed »`);
});

test('aucun secret, aucun code en dur dans la page', () => {
  for (const source of [HTML, JS]) {
    assert.ok(!/sk-ant-api|AIza[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{20}|xkeysib-/.test(source));
    /* Un code d'accès ressemble à ABCD-EFGH-IJKL-MNOP : il ne doit jamais
       être écrit dans un fichier public, sinon tout le monde l'utilise. */
    assert.ok(!/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(source), 'un code ressemblant à un accès valide est écrit en clair');
  }
});

test('interprete() : les trois états, et le message honnête sur le délai', async () => {
  /* On charge la logique pure sans navigateur (le module se tait si document
     n'existe pas — c'est voulu). */
  const bac = { globalThis: undefined };
  const fn = new Function('window', 'document', 'localStorage', 'location', JS + '\nreturn globalThis.__acces;');
  const __acces = fn({}, undefined, undefined, undefined);
  assert.ok(__acces, 'la logique pure doit être exportée même sans navigateur');
  const i = __acces.interprete;

  const ok = i({ ok: true, verifie: true, code: 'AAAA-BBBB-CCCC-DDDD', livre: 'https://croupier.kd-mc.com/entrainement.html' }, true);
  assert.equal(ok.etat, 'ok');
  assert.equal(ok.code, 'AAAA-BBBB-CCCC-DDDD');

  const att = i({ ok: true, en_attente: true, detail: 'PayPal met jusqu\'à 3 h' }, true);
  assert.equal(att.etat, 'attente');
  assert.match(att.texte, /3 h/, 'on doit DIRE le délai, pas laisser croire à une panne');

  const err = i({ ok: false, error: 'trop_de_tentatives', detail: 'trop d\'essais' }, false);
  assert.equal(err.etat, 'erreur');

  assert.equal(i(null, true).etat, 'erreur');
  assert.equal(__acces.emailPlausible('a@b.co'), true);
  assert.equal(__acces.emailPlausible('pasunmail'), false);
});

/* En VRAI navigateur, servi par HTTP — surtout PAS setContent + script en ligne :
   la CSP de la page (script-src 'self') le refuse, le script ne tourne jamais, et
   toutes les assertions passent À VIDE. Faux vert vécu le 16.09.2026. */
function serveurLocal(racine) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  const s = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]);
    const f = join(racine, chemin === '/' ? '/acces.html' : chemin);
    try {
      const corps = readFileSync(f);
      res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' });
      res.end(corps);
    } catch (_) { res.writeHead(404); res.end('non trouvé'); }
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, port: s.address().port })));
}

/* Le piège des deux fois : `.btn{display:inline-flex}` bat `[hidden]`,
   et un bloc censé être caché s'affiche quand même. */
test('vrai navigateur : le script tourne VRAIMENT, rien ne fuit, 44 px partout', async () => {
  const { s, port } = await serveurLocal(new URL('../shops/croupier/', import.meta.url).pathname);
  const nav = await chromium.launch({ headless: true });
  try {
  const page = await nav.newPage({ viewport: { width: 375, height: 812 } });
  const soucis = [];
  page.on('pageerror', (e) => soucis.push('exception: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    /* Le bac à sable CI passe par un proxy dont Chromium ne reconnaît pas le
       certificat : les polices Google échouent ICI et seulement ici. Ce n'est
       pas un défaut de la page — on l'écarte NOMMÉMENT, jamais en bloc. */
    if (m.text().includes('ERR_CERT_AUTHORITY_INVALID')) return;
    soucis.push('console: ' + m.text());
  });
  await page.goto('http://127.0.0.1:' + port + '/acces.html', { waitUntil: 'networkidle' });

  /* Sans ça, tout le reste passerait à vide (la CSP peut bloquer le script). */
  assert.equal(await page.evaluate(() => typeof window.__acces), 'object',
    'le script acces.js n\'a pas tourné — toutes les mesures suivantes seraient du faux vert');

  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('resultat')).display), 'none',
    'le bloc résultat doit être invisible tant qu\'on n\'a rien demandé');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('champRef')).display), 'none',
    'la référence de virement ne concerne pas PayPal');

  const petits = await page.evaluate(() => [...document.querySelectorAll('input,select,button,a')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: e.tagName + (e.id ? '#' + e.id : ''), h: Math.round(e.getBoundingClientRect().height) }))
    .filter((x) => x.h < 44));
  assert.deepEqual(petits, [], 'cibles tactiles sous 44 px sur iPhone');

  /* Choisir « virement » doit faire apparaître le champ référence. */
  await page.selectOption('#methode', 'virement');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById('champRef')).display), 'none');

  const debord = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(debord, false, 'débordement horizontal sur 375 px');
  assert.deepEqual(soucis, [], 'la page doit se charger sans une seule erreur');
  } finally { await nav.close(); s.close(); }
});
