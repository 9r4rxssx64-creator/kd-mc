/* Garde NAVIGATEUR de la fabrique de produits (tools/produits) — Chromium, dans test:ci.
   Séparée de produits-fabrique.test.mjs : celle-ci a besoin de playwright (npm ci),
   l'autre tourne nue sur le runner du workflow produit-fabrique.yml (mesuré le
   17.09, run 35216964609 : « Cannot find package 'playwright' »). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test as VENTE } from '../services/kdmc-vente/worker.js';

const DIR = new URL('../shops/kit-ia/', import.meta.url);

import { chromium } from 'playwright';
import http from 'node:http';
import { extname, join } from 'node:path';

function serveurLocal(racine) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  const s = http.createServer((req, res) => {
    const f = join(racine, decodeURIComponent(req.url.split('?')[0]));
    try { res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
    catch (_) { res.writeHead(404); res.end('non trouvé'); }
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, port: s.address().port })));
}
const M1 = { id: 'm1', ordre: 1, titre: 'Pourquoi répondre', gratuit: true, html: '<h2>Module 1 — Pourquoi répondre</h2><p class="promesse">Promesse.</p><h3>Test</h3><pre class="consigne">Tu es [métier].</pre><div class="exemple">Résultat</div>' };
const M2 = { id: 'm2', ordre: 2, titre: 'Cinq étoiles', gratuit: false, html: '<h2>Module 2</h2><pre class="consigne">SECRET-PAYANT</pre>' };
const SOMM = [{ id: 'm1', ordre: 1, titre: M1.titre, gratuit: true, source: 'avis-ia' }, { id: 'm2', ordre: 2, titre: M2.titre, gratuit: false, source: 'avis-ia' }];

test('vrai navigateur — avis.html : 44 px, 375 px, récupération → code mémorisé SOUS SA PROPRE CLÉ, lien vers le lecteur du bon produit ; lire.html?produit=avis-ia demande le bon aperçu', async () => {
  const { s, port } = await serveurLocal(DIR.pathname);
  const nav = await chromium.launch({ headless: true });
  try {
    const page = await nav.newPage({ viewport: { width: 375, height: 812 } });
    const soucis = []; const appels = [];
    page.on('pageerror', (e) => soucis.push('exception: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/404|ERR_CERT/.test(m.text())) soucis.push('console: ' + m.text()); });
    await page.route('https://kdmc-vente.9r4rxssx64.workers.dev/**', (route) => {
      const u = new URL(route.request().url()); appels.push(u.pathname + u.search);
      const rep = (obj, status) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });
      if (u.pathname === '/apercu') {
        const id = u.searchParams.get('produit');
        return id === 'avis-ia' ? rep({ ok: true, produit: id, nom: VENTE.PRODUITS[id].nom, prix: 17, modules: [M1], sommaire: SOMM }) : rep({ ok: false, error: 'produit' }, 404);
      }
      if (u.pathname === '/lire') {
        return u.searchParams.get('c') === 'AVIS-AVIS-AVIS-AVIS'
          ? rep({ ok: true, produit: 'avis-ia', modules: [M1, M2], sommaire: SOMM })
          : rep({ ok: false, error: 'invalide', detail: 'code inconnu ou expiré' }, 404);
      }
      if (u.pathname === '/reclamer') { const b = route.request().postDataJSON(); return rep({ ok: true, verifie: true, code: b.produit === 'avis-ia' ? 'AVIS-AVIS-AVIS-AVIS' : 'XXXX-XXXX-XXXX-XXXX', livre: VENTE.PRODUITS[b.produit].livre, email_envoye: false }); }
      return rep({ ok: false, error: 'not_found' }, 404);
    });
    await page.goto('http://127.0.0.1:' + port + '/avis.html', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => typeof window.__kit), 'object', 'kit.js n\'a pas tourné');
    const petites = await page.evaluate(() => [...document.querySelectorAll('input,select,button,a,summary')].filter((e) => e.offsetParent !== null).map((e) => ({ t: e.tagName + '#' + e.id, h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
    assert.deepEqual(petites, [], 'cibles tactiles sous 44 px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'débordement horizontal');
    assert.equal(await page.textContent('.prix-mini'), '17 €');
    await page.fill('#email', 'client@exemple.fr');
    await page.click('#valider');
    await page.waitForSelector('#resultat.ok');
    assert.equal(await page.textContent('#resultat code'), 'AVIS-AVIS-AVIS-AVIS');
    assert.ok(appels.some((a) => a === '/reclamer'), 'la réclamation part au worker');
    assert.equal(await page.getAttribute('#resultat a', 'href'), 'lire.html?produit=avis-ia&c=AVIS-AVIS-AVIS-AVIS', 'le lien « Ouvrir mon kit » doit porter le produit');
    assert.equal(await page.evaluate(() => localStorage.getItem('kit_avis_ia_code')), 'AVIS-AVIS-AVIS-AVIS', 'code mémorisé sous la clé du produit');
    assert.equal(await page.evaluate(() => localStorage.getItem('kit_ia_code')), null, 'le code d\'une niche ne doit JAMAIS écraser celui du kit (isolation)');
    /* Le lecteur du produit, avec le code mémorisé : s'ouvre complet tout seul */
    await page.goto('http://127.0.0.1:' + port + '/lire.html?produit=avis-ia', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('titre').textContent === 'Ton kit complet');
    assert.ok(appels.some((a) => a === '/lire?c=AVIS-AVIS-AVIS-AVIS'), 'le code mémorisé sous la clé du produit doit ouvrir le lecteur : ' + appels.join(' '));
    /* Sans code : l'aperçu DU produit, jamais celui du kit */
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://127.0.0.1:' + port + '/lire.html?produit=avis-ia', { waitUntil: 'networkidle' });
    await page.waitForSelector('#module h2');
    assert.ok(appels.some((a) => a === '/apercu?produit=avis-ia'), 'le lecteur doit demander l\'aperçu DU produit, pas celui du kit : ' + appels.join(' '));
    assert.ok(!appels.some((a) => a === '/apercu?produit=kit-ia'));
    assert.equal(await page.textContent('#module h2'), 'Module 1 — Pourquoi répondre');
    assert.match(await page.textContent('#sur a'), /^40 réponses aux avis clients, prêtes à adapter$/, 'le fil d\'Ariane dit le nom du produit');
    assert.ok(!(await page.content()).includes('SECRET-PAYANT'));
    assert.deepEqual(soucis, []);
  } finally { await nav.close(); s.close(); }
});
