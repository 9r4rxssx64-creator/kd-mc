/* Pages « l'IA pour [métier] » (kit.kd-mc.com/pour/) — ce qui coûte si c'est faux :
   une page qui diverge de sa source (générateur oublié), une CSP différente de la
   page de vente (fetch bloqué ou script en ligne), une consigne payante qui fuit,
   un lien mort vers le kit, une page absente du sitemap (jamais trouvée). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as G from '../tools/kit/pages-metiers.mjs';

const { metiers } = G.lireMetiers();
const INDEX_VENTE = readFileSync(join(G.DOSSIER, '..', 'index.html'), 'utf8');
const CSP_VENTE = INDEX_VENTE.match(/Content-Security-Policy" content="([^"]+)"/)[1];

test('source : 47 métiers, slugs uniques et sûrs, 5 situations remplies et distinctes', () => {
  assert.ok(metiers.length >= 40, 'au moins 40 métiers');
  assert.equal(new Set(metiers.map((m) => m.slug)).size, metiers.length, 'slug en double');
  for (const m of metiers) {
    assert.match(m.slug, /^[a-z0-9-]+$/, m.slug + ' : slug avec accent ou majuscule (URL fragile)');
    for (const k of ['nom', 'un', 'pluriel']) assert.ok(m[k] && m[k].length >= 2, m.slug + ' : ' + k + ' manquant');
    const situ = G.SITUATIONS.map(([k]) => m[k]);
    for (const [k] of G.SITUATIONS) assert.ok(m[k] && m[k].split(' ').length >= 6, m.slug + ' : situation « ' + k + ' » vide ou trop courte');
    assert.equal(new Set(situ).size, situ.length, m.slug + ' : deux situations identiques');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(m)), m.slug + ' : emoji');
  }
});

test('les pages sur disque sont EXACTEMENT ce que la source produit (générateur déterministe), sitemap compris', () => {
  assert.deepEqual(G.ecarts(), [], 'lance : node tools/kit/pages-metiers.mjs');
  assert.equal(G.attendu().sitemap, G.attendu().sitemap, 'attendu() doit être pur');
});

test('chaque page : même CSP que la vente, 0 script, 0 consigne payante, 0 secret, accents, liens qui existent', () => {
  const pages = readdirSync(G.DOSSIER).filter((f) => f.endsWith('.html'));
  assert.equal(pages.length, metiers.length + 1);
  for (const f of pages) {
    const html = readFileSync(join(G.DOSSIER, f), 'utf8');
    assert.equal(html.match(/Content-Security-Policy" content="([^"]+)"/)[1], CSP_VENTE, f + ' : CSP ≠ page de vente');
    assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), f + ' : script présent (aucun besoin, et la CSP le bloquerait)');
    assert.ok(!/<pre class="consigne">/.test(html), f + ' : consigne du kit (contenu payant) dans une page publique');
    assert.ok(!/sk-ant-api|AIza[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{20}|xkeysib-|[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(html), f + ' : secret ou code d\'accès');
    assert.ok((html.match(/[àâçéèêëîïôûùüÿœ]/gi) || []).length >= 40, f + ' : trop peu d\'accents (texte suspect)');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), f + ' : emoji');
    assert.ok(html.includes('<html lang="fr">') && html.includes('rel="canonical" href="' + G.BASE + f + '"'), f + ' : canonique');
    for (const lien of [...html.matchAll(/href="([^"#]+)(#[^"]*)?"/g)].map((x) => x[1])) {
      if (/^(https?:|data:)/.test(lien)) continue;
      const cible = join(G.DOSSIER, lien);
      assert.ok(existsSync(cible) || existsSync(join(cible, 'index.html')), f + ' : lien mort → ' + lien);
    }
    assert.ok(html.includes('href="../lire.html"') && html.includes('href="../#acheter"'), f + ' : doit mener au module 1 gratuit et à l\'achat');
    assert.ok(html.includes('"@type":"WebPage"') || html.includes('"@type":"CollectionPage"'), f + ' : données structurées');
  }
});

test('trouvables : le sitemap liste chaque page, l\'index les liste toutes, la page de vente mène à l\'index', () => {
  const sitemap = readFileSync(G.SITEMAP, 'utf8');
  const index = readFileSync(join(G.DOSSIER, 'index.html'), 'utf8');
  assert.ok(sitemap.includes('<loc>' + G.BASE + 'index.html</loc>'));
  for (const m of metiers) {
    assert.ok(sitemap.includes('<loc>' + G.BASE + m.slug + '.html</loc>'), m.slug + ' absent du sitemap');
    assert.ok(index.includes('href="' + m.slug + '.html"'), m.slug + ' absent de l\'index');
  }
  assert.equal((sitemap.match(/kit\.kd-mc\.com\/pour\//g) || []).length, metiers.length + 1, 'entrées en double ou en trop dans le sitemap');
  assert.ok(INDEX_VENTE.includes('href="pour/index.html"'), 'la page de vente ne mène pas aux pages métiers');
});

test('chaque page cite VRAIMENT son métier (5 situations à lui) et 6 voisins différents', () => {
  for (const m of metiers) {
    const html = readFileSync(join(G.DOSSIER, m.slug + '.html'), 'utf8');
    for (const [k] of G.SITUATIONS) assert.ok(html.includes(G.esc(m[k].charAt(0).toUpperCase() + m[k].slice(1))), m.slug + ' : situation « ' + k + ' » absente de sa page');
    const voisins = [...html.matchAll(/<a href="([a-z0-9-]+)\.html">/g)].map((x) => x[1]).filter((s) => s !== m.slug && s !== 'index');
    assert.equal(new Set(voisins).size, 6, m.slug + ' : 6 voisins distincts attendus');
  }
});
