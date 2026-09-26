/* Les tuiles de l'admin du domaine (admin.kd-mc.com / kd-mc.com/admin/).
 *
 * Kevin, 24.09.2026 : « intègre les deux à voir dans mon domaine (tuile) admin »
 * — les deux pages qu'il ouvre le plus : celle d'où il PILOTE son business
 * (Commerce) et celle que ses clients VOIENT (sa page de vente).
 *
 * La garde EXÉCUTE hub() et lit le HTML rendu. Relire le source à coups
 * d'expressions régulières ne prouverait pas qu'une tuile est réellement rendue.
 * Elle tient aussi la règle « zéro doublon UX » : une destination, une tuile.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { hub } = require('../kdmc-home/admin/admin.js');
const html = hub();

const compte = (re) => (html.match(re) || []).length;

test('la tuile « Commerce » est rendue, une seule fois', () => {
  assert.equal(compte(/href="\/admin\/commerce\.html"/g), 1,
    'le tableau de bord Commerce doit avoir exactement UNE tuile (0 = perdue, 2 = doublon)');
  assert.ok(/Commerce — Tableau de bord/.test(html), 'le libellé de la tuile Commerce a disparu');
});

test('la tuile « ma page de vente » est rendue, une seule fois', () => {
  assert.equal(compte(/href="https:\/\/kit\.kd-mc\.com\/"/g), 1,
    'la page de vente doit avoir exactement UNE tuile');
  assert.ok(/ma page de vente/.test(html), 'le libellé de la tuile page de vente a disparu');
});

test('les deux sont en tête, dans « Mon business », avant les fonctions communes', () => {
  const iBiz = html.indexOf('Mon business');
  const iCom = html.indexOf('Fonctions communes');
  assert.ok(iBiz >= 0, 'la section « Mon business » a disparu');
  assert.ok(iCom > iBiz, 'les fonctions communes doivent venir APRÈS « Mon business »');
  const section = html.slice(iBiz, iCom);
  assert.ok(section.includes('/admin/commerce.html'), 'Commerce doit être dans « Mon business »');
  assert.ok(section.includes('https://kit.kd-mc.com/'), 'la page de vente doit être dans « Mon business »');
});

test('aucune destination en double dans tout le hub', () => {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const vus = new Set(), doubles = [];
  for (const h of hrefs) { if (vus.has(h)) doubles.push(h); vus.add(h); }
  assert.deepEqual(doubles, [], 'deux tuiles mènent au même endroit : ' + doubles.join(', '));
  assert.ok(hrefs.length >= 8, 'le hub a perdu des tuiles (' + hrefs.length + ')');
});

test('chaque tuile a un libellé et une description non vides', () => {
  const noms = [...html.matchAll(/<span class="n">([^<]*)<\/span><span class="d">([^<]*)<\/span>/g)];
  assert.equal(noms.length, [...html.matchAll(/href="/g)].length, 'une tuile sans libellé/description');
  for (const [, n, d] of noms) {
    assert.ok(n.trim().length > 2, 'libellé vide : ' + JSON.stringify(n));
    assert.ok(d.trim().length > 4, 'description vide pour « ' + n + ' »');
  }
});
