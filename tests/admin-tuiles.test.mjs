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

/* ── Kevin 26.09.2026 : « je ne vois pas la tuile dans mon domaine admin » ──────
 * Il cherchait « Tor en clair ». MESURE du jour : 21 des 30 apps du registre
 * n'avaient AUCUNE tuile ici. Tor était pourtant routée, dans le périmètre, dans
 * le custom_domain, surveillée par la sonde et affichée sur le portail — mais pas
 * dans l'admin. Les tests d'avant ne pouvaient pas le voir : ils vérifiaient les
 * tuiles NOMMÉES une par une, jamais que le registre était couvert.
 * Ces deux gardes ferment ça pour toutes les apps futures, pas seulement Tor.  */
test('« Tor en clair » a sa tuile (le cas signalé par Kevin le 26.09)', () => {
  assert.ok(/href="https:\/\/tor\.kd-mc\.com\/"/.test(html),
    'la tuile Tor a disparu de l\'admin — c\'est exactement ce que Kevin ne voyait pas');
});

test('aucune app du registre n\'est orpheline de l\'admin', () => {
  const registre = require('../kdmc-home/apps.json').apps;
  /* Un même site a parfois plusieurs adresses (cuisine/cocina/cujina,
     cmcteams-light/departs) : on exige que chaque SITE soit joignable, pas
     chaque alias — sinon on demanderait des tuiles en double. */
  const parNom = new Map();
  for (const [host, a] of Object.entries(registre)) {
    if (/^(www\.)?kd-mc\.com$/.test(host)) continue;            /* le portail lui-même */
    const nom = (a.icon ? a.icon + ' ' : '') + (a.name || host);
    if (!parNom.has(nom)) parNom.set(nom, []);
    parNom.get(nom).push(host);
  }
  const orphelines = [];
  for (const [nom, hosts] of parNom) {
    if (!hosts.some((h) => html.includes(h))) orphelines.push(nom + ' (' + hosts.join(', ') + ')');
  }
  assert.deepEqual(orphelines, [],
    orphelines.length + ' app(s) du domaine sont INTROUVABLES depuis l\'admin : '
    + orphelines.join(' · ') + '. Une app qu\'on ne voit pas n\'existe pas.');
});
