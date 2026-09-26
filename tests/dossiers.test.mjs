/* Garde de l'ARCHIVE EPSTEIN — dans test:ci.
   Kevin 2026-09-18 : « récupère tous les documents […] toutes les photos publiques et
   privées ». Réponse mesurée, et refus assumé sur deux points :
     · les « photos privées » n'existent pas en accès public — le ministère de la Justice
       et la commission du Congrès retirent l'identité des victimes ET le matériel d'abus
       sur mineurs AVANT publication. Ce qui circule ailleurs est faux ou illégal.
     · être cité dans un document ne vaut pas mise en cause — désigner quelqu'un, c'est
       l'exposition juridique de Kevin, éditeur depuis Monaco.
   Ces deux règles ne doivent pas vivre seulement dans un commentaire : une règle sans
   garde mécanique revient (leçon #142). D'où ce fichier. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lit, estOfficiel, totalPages, nbChiffrees, esc, fichiers, DOMAINES_OFFICIELS } from '../tools/dossiers/page.mjs';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const page = readFileSync(join(RACINE, 'dossiers/index.html'), 'utf8');
const d = lit();

test('chaque source est une INSTITUTION, en HTTPS — jamais un agrégateur', () => {
  /* EXÉCUTÉ, pas relu : on appelle la règle avec des cas qui doivent échouer. */
  assert.equal(estOfficiel('https://oversight.house.gov/release/x/'), true);
  assert.equal(estOfficiel('https://www.justice.gov/epstein'), true);
  assert.equal(estOfficiel('http://oversight.house.gov/x'), false, 'HTTP en clair : refusé');
  assert.equal(estOfficiel('https://oversight.house.gov.pirate.ru/x'), false, 'domaine qui IMITE une institution : refusé');
  assert.equal(estOfficiel('https://reddit.com/r/x'), false);
  assert.equal(estOfficiel('https://t.me/x'), false);
  assert.equal(estOfficiel(''), false);
  assert.equal(estOfficiel(null), false);
  for (const c of d.collections) {
    assert.ok(estOfficiel(c.url), c.id + ' : source non officielle → ' + c.url);
  }
  assert.ok(d.collections.length >= 5, 'archive trop maigre pour être utile');
});

test('AUCUNE image n\'est servie, et rien ne promet de « photos privées »', () => {
  /* Le cœur du refus. Une balise <img> vers l'extérieur, un mot « photos privées »
     dans la page, et on serait exactement dans ce que je dis ne pas faire. */
  assert.ok(!/<img\b/i.test(page), 'la page sert une image : l\'archive ne doit héberger ni servir aucune image');
  assert.ok(!/photos?\s+priv/i.test(page.replace(/Ce qui circule ailleurs[^<]*/g, '')), 'la page promet des « photos privées »');
  const csp = page.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /img-src 'self' data:/, 'la CSP autorise des images externes');
  assert.match(csp, /script-src 'self'/, 'script externe autorisé');
  assert.ok(!csp.includes('unsafe-inline') || !/script-src[^;]*unsafe-inline/.test(csp), 'script en ligne autorisé');
  /* Et le catalogue lui-même ne doit contenir aucun champ image. */
  const brut = JSON.stringify(d);
  assert.ok(!/\.(jpg|jpeg|png|gif|webp)\b/i.test(brut), 'le catalogue référence un fichier image');
});

test('la page DIT les trois choses qui protègent Kevin', () => {
  const t = page.toLowerCase();
  assert.ok(t.includes('n\'héberge aucun document') || t.includes('héberge aucun document'), 'la page ne dit pas qu\'elle n\'héberge rien');
  assert.ok(/retirent l&#39;identité des victimes|retirent l'identité des victimes/.test(page), 'la page ne dit pas que les victimes sont retirées à la source');
  assert.ok(t.includes('ne veut pas dire être coupable') || t.includes('être cité'), 'la page ne dit pas qu\'être cité ≠ être coupable');
});

test('le nombre de pages annoncé est MESURÉ, jamais arrondi au hasard', () => {
  /* Un chiffre montré au public doit venir du catalogue, pas d'une estimation
     (règle « jamais estimer »). Une collection sans compte vaut 0, pas « à peu près ». */
  assert.equal(totalPages([{ pages: 100 }, { pages: 20 }, { pages: null }]), 120);
  assert.equal(totalPages([{ pages: null }]), 0, 'une collection non chiffrée ne doit rien ajouter');
  assert.equal(totalPages([]), 0);
  assert.equal(totalPages(null), 0);
  assert.equal(nbChiffrees([{ pages: 100 }, { pages: null }]), 1);
  const total = totalPages(d.collections);
  assert.ok(total >= 50000, 'total invraisemblablement bas : ' + total);
  assert.ok(page.includes(total.toLocaleString('fr-FR')), 'le total affiché ne correspond pas au catalogue');
});

test('les liens sortants ne fuitent pas et n\'offrent pas notre référencement', () => {
  const liens = [...page.matchAll(/<a class="btn" href="([^"]+)"([^>]*)>/g)];
  assert.equal(liens.length, d.collections.length, 'un bouton par collection attendu');
  for (const [, url, attrs] of liens) {
    assert.ok(estOfficiel(url), 'lien non officiel dans la page : ' + url);
    assert.ok(attrs.includes('rel="noopener nofollow"'), url + ' : rel manquant (noopener + nofollow)');
    assert.ok(attrs.includes('target="_blank"'), url + ' : doit s\'ouvrir à côté, la page reste');
  }
});

test('texte d\'une institution = donnée, jamais du HTML', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc(null), '');
  const f = fichiers();
  assert.ok(!f['index.html'].includes('<img src=x'), 'échappement contourné');
});

test('la page tient dans un iPhone et reste utile sans JavaScript', () => {
  assert.match(page, /viewport-fit=cover/, 'encoche iPhone non gérée');
  const style = fichiers()['dossiers.css'];
  assert.match(style, /min-height:44px/, 'cible tactile sous 44px');
  assert.match(style, /font-size:16px/, 'sous 16px, iOS zoome à la saisie');
  /* Sans JS, la recherche ne marche pas — mais les collections et leurs liens
     doivent rester lisibles, et la page doit le DIRE. */
  assert.match(page, /<noscript>/, 'rien n\'est prévu sans JavaScript');
  /* `esc` : une URL à paramètres porte des & qui deviennent &amp; dans le HTML —
     chercher l'URL brute ferait échouer le contrôle sur une page pourtant juste. */
  for (const c of d.collections) assert.ok(page.includes(esc(c.url)), c.id + ' : lien absent du HTML servi (perdu si JS ne tourne pas)');
});

test('la page publiée correspond au catalogue (rien de généré à la main)', () => {
  for (const [nom, attendu] of Object.entries(fichiers())) {
    const vu = readFileSync(join(RACINE, 'dossiers/' + nom), 'utf8');
    assert.equal(vu, attendu, nom + ' : lance `node tools/dossiers/page.mjs`');
  }
  assert.ok(DOMAINES_OFFICIELS.length <= 12, 'la liste des domaines officiels s\'élargit : chaque ajout est une décision, pas un détail');
});
