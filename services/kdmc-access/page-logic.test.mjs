/* Teste la LOGIQUE RÉELLEMENT LIVRÉE dans la page « Qui se connecte ».
   Les fonctions sont extraites du HTML servi (pas d'une copie) → si quelqu'un modifie
   la page, le test suit. Deux bugs vécus le 2026-08-05 sont verrouillés ici :
   1) Kevin affichait « 2 connexions » au lieu de ~191 : deux comptes portant le même
      nom, et le 2e ÉCRASAIT le 1er (`=` au lieu de `+=`).
   2) « CI Smoke » (167 connexions depuis un runner GitHub) et « Vérification
      automatique » comptaient comme des PERSONNES → total faussé, vraies personnes noyées.
   node --test (depuis services/kdmc-access) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { PAGE_HTML } from './page.js';

/* Extrait une fonction nommée du script de la page (accolades équilibrées). */
function grab(name) {
  const src = PAGE_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'fonction ' + name + ' introuvable dans la page livrée');
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  return src.slice(start, end);
}

const ctx = vm.createContext({});
vm.runInContext(grab('norm') + '\n' + grab('isBot'), ctx);
const isBot = (p) => vm.runInContext('isBot(' + JSON.stringify(p) + ')', ctx);

test('les robots de test ne sont PAS des personnes', () => {
  assert.equal(isBot({ name: 'CI Smoke', uids: ['ci_smoke'] }), true);
  assert.equal(isBot({ name: 'Vérification automatique', uids: ['__verif__'] }), true);
  assert.equal(isBot({ name: 'uptime monitor', uids: [] }), true);
  assert.equal(isBot({ name: 'x', uids: [], tiers: { test: 3 } }), true);
});

test('les vraies personnes ne sont JAMAIS prises pour des robots', () => {
  assert.equal(isBot({ name: 'kevin Desarzens', uids: ['kdmc_admin'] }), false);
  assert.equal(isBot({ name: 'Ronan Desarzens', uids: ['ronan'] }), false);
  assert.equal(isBot({ name: 'Laurence Saint-Polit', uids: ['laurence-sp'] }), false);
  /* Piège : un prénom contenant « ci » (Cindy, Patricia) ne doit pas être filtré. */
  assert.equal(isBot({ name: 'Cindy Martin', uids: ['cindy'] }), false);
  assert.equal(isBot({ name: 'Patricia Rossi', uids: ['patricia'] }), false);
});

test('deux comptes d\'une même personne s\'ADDITIONNENT (bug des « 2 connexions »)', () => {
  /* Rejoue la fusion telle qu'écrite dans la page, sur le cas réel de Kevin. */
  const src = PAGE_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(/m\.conns=\(m\.conns\|\|0\)\+\(p\.hits\|\|0\)/.test(src.replace(/\s/g, '')),
    'les connexions doivent être ADDITIONNÉES (+=), jamais écrasées (=)');
  assert.ok(/m\.hist=\(m\.hist\|\|\[\]\)\.concat/.test(src.replace(/\s/g, '')),
    'les historiques des différents comptes doivent être CONCATÉNÉS');
  assert.ok(!/m\.conns=p\.hits/.test(src.replace(/\s/g, '')),
    'régression : écrasement des connexions réintroduit');
});

test('les compteurs du haut ne comptent que les PERSONNES (robots exclus)', () => {
  const src = PAGE_HTML.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\s/g, '');
  assert.ok(/varhumans=all\.filter\(function\(p\)\{return!isBot\(p\)\}\)/.test(src), 'liste « humains » calculée');
  assert.ok(/humans\.reduce/.test(src), 'le total des connexions se calcule sur les humains');
  assert.ok(/humans\.length/.test(src), 'le nombre de personnes se calcule sur les humains');
});

/* ═══ UNE PERSONNE = UNE CARTE, MÊME ÉCRITE AUTREMENT (22.09.2026) ═══
   Sur la capture de Kevin, il apparaissait DEUX FOIS : « DESARZENS K » (format SBM,
   108 actions) et « kevin Desarzens » (format du portail, 393 connexions) — donc des
   compteurs coupés en deux et une page qui ment sur le nombre de personnes.
   On exécute ici la VRAIE logique livrée dans la page, pas une copie. */
vm.runInContext(grab('ident') + '\n' + grab('memePersonne'), ctx);
const meme = (a, b) => vm.runInContext(
  'memePersonne(ident(' + JSON.stringify(a) + '), ident(' + JSON.stringify(b) + '))', ctx);

test('le même Kevin écrit de deux façons est UNE seule personne', () => {
  assert.equal(meme('DESARZENS K', 'kevin Desarzens'), true);
  assert.equal(meme('kevin Desarzens', 'DESARZENS K'), true);   // dans les deux sens
  assert.equal(meme('Desarzens Kevin', 'Kevin DESARZENS'), true); // ordre inversé
  assert.equal(meme('MORTER V', 'Vincent Morter'), true);        // un employé quelconque
});

test('deux personnes différentes ne sont JAMAIS confondues', () => {
  /* Le piège déjà écrit dans nos règles : un nom de famille partagé n'identifie personne. */
  assert.equal(meme('Ronan Desarzens', 'kevin Desarzens'), false);
  assert.equal(meme('DESARZENS K', 'Ronan Desarzens'), false);
  /* Deux prénoms entiers différents, même initiale : jamais réunis. */
  assert.equal(meme('Karine Desarzens', 'Kevin Desarzens'), false);
  /* Noms de famille différents, mêmes initiales. */
  assert.equal(meme('Kevin Dupont', 'Kevin Durand'), false);
  /* Un seul mot ne regroupe rien (même règle que la connexion : prénom + nom). */
  assert.equal(vm.runInContext('ident("Marianne")', ctx), null);
});

test('la page regroupe VRAIMENT les deux écritures en une carte', () => {
  /* Bout en bout : on fait tourner people() de la page sur les deux sources, avec
     les deux écritures, et on exige UNE carte dont les compteurs sont ADDITIONNÉS. */
  const src = PAGE_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  const c2 = vm.createContext({ CONN: null, DATA: null });
  vm.runInContext(grab('norm') + '\n' + grab('ident') + '\n' + grab('memePersonne') + '\n' + grab('people'), c2);
  c2.CONN = { people: [{ uid: 'kdmc_admin', name: 'kevin Desarzens', hits: 393, history: [], places: [], apps: {}, devices: [], lastSeen: 2 }] };
  c2.DATA = { people: [{ key: 'desarzens_k', name: 'DESARZENS K', count: 108, recent: [], appsList: [], devicesList: [], lastSeen: 1 }] };
  const list = vm.runInContext('people()', c2);
  assert.equal(list.length, 1, 'une seule carte pour Kevin (avant : deux)');
  assert.equal(list[0].conns, 393);
  assert.equal(list[0].actions, 108);
});

/* ═══ CHAQUE ADRESSE DU DOMAINE A UN NOM LISIBLE (22.09.2026) ═══
   Kevin lit cette page sur son iPhone. Une adresse absente de la table s'affiche
   en brut (« cmcteams-light.kd-mc.com ») au milieu de noms clairs : il doit
   deviner de quelle app on parle. Mesuré ce jour-là : 15 adresses sur 32 étaient
   dans ce cas — dont l'app light, justement celle dont il demandait les infos.
   La liste est lue DANS le routeur : une 33e adresse créée demain fera échouer
   ce contrôle tant qu'elle n'a pas son nom. */
test('les 32 adresses du domaine ont toutes un nom lisible', () => {
  const routeur = readFileSync(new URL('../kdmc-router/worker.js', import.meta.url), 'utf8');
  const bloc = routeur.match(/const ROUTES\s*=\s*\{[\s\S]*?\n\};/)[0];
  const hosts = [...bloc.matchAll(/'([a-z0-9.-]+)':\s*'/g)].map((m) => m[1]);
  const table = PAGE_HTML.match(/var APPNM=\{([\s\S]*?)\};/)[1];
  const connus = new Set([...table.matchAll(/'([^']+)':'/g)].map((m) => m[1]));
  const sansNom = hosts.filter((h) => !connus.has(h));
  assert.deepEqual(sansNom, [], 'adresses affichées en brut à Kevin : ' + sansNom.join(', '));
  assert.ok(hosts.length >= 30, 'adresses trouvées : ' + hosts.length);
});
