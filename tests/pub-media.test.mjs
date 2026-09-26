/* Où vivent les vidéos de pub, et à quel créneau elles partent.

   Deux pannes réelles, deux gardes :

   1) 23.09.2026 — le dépôt passe en PRIVÉ. Les adresses de la release
      « pub-videos » deviennent 404 pour tout le monde (mesuré : la MÊME vidéo
      répond 200 le 21.09 et 404 le 23.09). Metricool ne peut plus aller
      chercher les MP4 : « Failed to normalize media ». Aucun test n'était
      rouge — deux tests ENSHRINAIENT même l'adresse GitHub morte.
   2) 21.09.2026 — la vidéo immo-05 s'est vue proposer le créneau du 29.09 à
      10 h, DÉJÀ occupé par un post-lien Facebook : le choix de créneau ne
      regardait que prog.posts et ignorait prog.liens. Deux publications à la
      même minute sur la même Page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../tools/pub/media.mjs';
import * as P from '../tools/pub/programmation.mjs';
import * as L from '../tools/pub/liens.mjs';

const BASE_OK = 'https://pub-exemple.r2.dev/';
const faux = (id) => BASE_OK + id + '.mp4';

test('une adresse d\'hébergement sur GitHub est REFUSÉE (le dépôt est privé : 404 pour Metricool)', () => {
  assert.equal(M.baseValide('https://github.com/9r4rxssx64-creator/CMCteams/releases/download/pub-videos/'), false);
  assert.equal(M.baseValide('https://objects.githubusercontent.com/truc/'), false);
  assert.equal(M.baseValide('http://pub-exemple.r2.dev/'), false, 'http simple refusé');
  assert.equal(M.baseValide('https://pub-exemple.r2.dev'), false, 'sans le / final refusé');
  assert.equal(M.baseValide(null), false);
  assert.equal(M.baseValide(BASE_OK), true);
});

test('sans adresse publique écrite, on REFUSE de fabriquer une URL (jamais de lien mort en silence)', () => {
  assert.throws(() => M.urlDe('immo-05', { base: null }), /adresse publique des vidéos/);
  assert.throws(() => M.urlDe('immo-05', { base: 'https://github.com/x/' }), /adresse publique des vidéos/);
  assert.equal(M.urlDe('immo-05', { base: BASE_OK }), BASE_OK + 'immo-05.mp4');
});

test('media.json est bien le fichier écrit par le workflow (et il porte le nom du seau)', () => {
  const m = M.lire();
  assert.equal(m.seau, 'kdmc-pub-videos');
  assert.match(String(m._doc || ''), /workflow/i, 'le fichier dit qui l\'écrit');
  if (m.base !== null) assert.equal(M.baseValide(m.base), true, 'si une base est écrite, elle doit être valable');
});

test('ce qu\'on donne à Metricool ne pointe JAMAIS sur github.com', () => {
  const index = { rendu: 'x', videos: [{ id: 'neuf-01', produit: 'kit-ia', page: 'https://kit.kd-mc.com/', titre: 'T', duree: 20, legende: 'L', hashtags: ['#a'] }] };
  const prog = { marque: 1, fuseau: 'Europe/Paris', reseaux: [], posts: [], liens: [] };
  const a = P.prepare(index, prog, { mp4: faux, maintenant: new Date('2026-09-23T18:00:00Z') });
  assert.equal(a.videos[0].mp4, BASE_OK + 'neuf-01.mp4');
  assert.ok(!/github\.com/i.test(JSON.stringify(a)), 'aucune adresse GitHub dans ce qui part à Metricool');
});

test('un créneau déjà pris par un POST-LIEN n\'est jamais proposé à une vidéo', () => {
  const prog = {
    marque: 1, fuseau: 'Europe/Paris', reseaux: [], 
    posts: [{ video: 'immo-04', post: 1, date: '2026-09-28T10:00:00+02:00' }],
    liens: [{ produit: 'kit', post: 2, date: '2026-09-29T10:00:00+02:00' }],
  };
  const index = { videos: [{ id: 'immo-05', produit: 'immo-ia', page: 'p', titre: 'T', duree: 20, legende: 'L', hashtags: [] }] };
  const a = P.prepare(index, prog, { mp4: faux, maintenant: new Date('2026-09-21T08:00:00Z') });
  const pris = prog.liens.map((l) => l.date).concat(prog.posts.map((p) => p.date));
  assert.ok(!pris.includes(a.videos[0].creneau), 'créneau proposé : ' + a.videos[0].creneau + ' — déjà occupé');
  // le choix se fait APRÈS le dernier créneau occupé : le post-lien du 29 à 10 h
  // compte désormais, donc la vidéo part à 12 h — et non par-dessus lui.
  assert.equal(a.videos[0].creneau, '2026-09-29T12:00:00+02:00');
});

test('enregistrer une vidéo sur le créneau d\'un post-lien est REFUSÉ', () => {
  const prog = { marque: 1, posts: [], liens: [{ produit: 'kit', post: 2, date: '2026-09-29T10:00:00+02:00' }] };
  assert.throws(
    () => P.ajoute(prog, [{ video: 'immo-05', post: 3, date: '2026-09-29T10:00:00+02:00' }]),
    /créneau déjà pris/,
  );
});

test('une seule définition de « créneaux pris » (liens.mjs l\'importe, il ne la recopie pas)', () => {
  const src = readFileSync(new URL('../tools/pub/liens.mjs', import.meta.url), 'utf8');
  assert.ok(!/export function creneauxPris/.test(src), 'liens.mjs redéfinit creneauxPris — deux vérités qui divergeront');
  assert.equal(typeof L.prepare, 'function');
  assert.equal(P.creneauxPris({ posts: [{ date: 'a' }], liens: [{ date: 'b' }] }).length, 2);
});
