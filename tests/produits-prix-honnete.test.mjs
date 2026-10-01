/* PRIX BARRÉ : interdit tant qu'il n'a pas été réellement pratiqué (24.09.2026).
 *
 * Les 4 pages produits affichaient « 17 € ~~39 €~~ · Prix de lancement ». Le
 * produit n'a JAMAIS été vendu 39 €. C'est une fausse promotion :
 *   · elle viole la règle absolue « rien de faux, partout toujours » ;
 *   · le droit de la consommation européen impose qu'un prix barré soit le prix
 *     le plus bas réellement pratiqué dans les 30 jours précédents ;
 *   · et elle fait ressembler la page à une arnaque au lieu d'un vrai produit.
 *
 * Cette garde n'interdit pas les promotions : elle exige qu'une promotion soit
 * VRAIE. Pour remettre un prix barré, il faut `avant` ET `avantPratiqueDu`
 * (la période pendant laquelle ce prix a réellement été demandé aux clients).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page } from '../tools/produits/pages.mjs';
import { lireCatalogue } from '../tools/produits/fabrique.mjs';

const catalogue = lireCatalogue();

test('aucun produit n\'annonce un prix barré sans preuve qu\'il a été pratiqué', () => {
  const fautifs = catalogue.produits
    .filter((p) => p.avant && !p.avantPratiqueDu)
    .map((p) => `${p.id} (affiche « ${p.avant} € » barré)`);
  assert.deepEqual(fautifs, [],
    'Prix barré sans période de pratique. Soit le produit a vraiment été vendu à ce '
    + 'prix — alors ajoute `avantPratiqueDu` — soit c\'est une fausse promotion : retire `avant`.');
});

test('la page rendue ne contient aucun prix barré quand le catalogue n\'en déclare pas', () => {
  for (const p of catalogue.produits) {
    if (p.avant) continue;
    const html = page(p, '');
    assert.ok(!/class="avant"/.test(html),
      `${p.id} : la page affiche un prix barré alors que le catalogue n'en déclare aucun`);
    assert.ok(!/Prix de lancement/.test(html),
      `${p.id} : « Prix de lancement » sous-entend une promotion — à ne pas écrire sans vraie baisse`);
  }
});

test('le mécanisme de promotion marche encore pour une VRAIE baisse', () => {
  const p = { ...catalogue.produits[0], avant: 99, avantPratiqueDu: '2026-01-01 → 2026-02-01' };
  const html = page(p, '');
  assert.ok(/class="avant"/.test(html) && /99 €/.test(html),
    'un produit réellement baissé doit pouvoir afficher son ancien prix');
});

test('les pages livrées ne contiennent plus de prix barré', () => {
  for (const p of catalogue.produits) {
    if (p.avant) continue;
    let html = '';
    try { html = readFileSync(new URL('../shops/kit-ia/' + p.slug + '.html', import.meta.url), 'utf8'); }
    catch (_) { continue; }
    assert.ok(!/class="avant"/.test(html), `${p.slug}.html livrée affiche encore un prix barré (régénère les pages)`);
  }
});
