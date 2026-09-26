/* Garde du MOTEUR DE VOIX du domaine (/__lingua/tts) — dans test:ci.
   Kevin 2026-09-18 : « les voix, c'est pas le top, on dirait un robot ».
   Cause mesurée : le moteur HD (gpt-4o-mini-tts) accepte une CONSIGNE DE JEU, mais
   elle était figée sur « professeur de langue » — écrite pour Lingua, donc scolaire
   et plate dans une publicité. Ce que cette garde protège :
     1. la consigne est choisie par `i=<style>` dans une LISTE BLANCHE (endpoint PUBLIC :
        du texte libre laisserait un inconnu piloter notre moteur et notre facture) ;
     2. le défaut reste « prof » → Lingua ne change pas d'un cheveu (0 régression) ;
     3. le style entre dans la CLÉ DE CACHE : sans lui, une phrase déjà lue en « prof »
        resterait servie telle quelle en « pub » et on n'entendrait AUCUN changement
        (le piège du cache, déjà vécu le 11.08 en changeant de moteur) ;
     4. la pub demande bien un style de pub, pas la voix de l'école. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../services/kdmc-router/worker.js', import.meta.url), 'utf8');
const video = readFileSync(new URL('../tools/pub/video.mjs', import.meta.url), 'utf8');

test('les styles de voix sont une liste blanche, jamais du texte libre', () => {
  const m = worker.match(/const STYLES = \{[\s\S]*?\n      \};/);
  assert.ok(m, 'la table STYLES a disparu');
  for (const s of ['prof', 'pub', 'calme', 'energie']) assert.ok(new RegExp('\\n\\s*' + s + ':').test(m[0]), 'style manquant : ' + s);
  /* Le paramètre doit être VÉRIFIÉ contre la table, pas injecté tel quel. */
  assert.ok(/hasOwnProperty\.call\(STYLES, String\(url\.searchParams\.get\('i'\)/.test(worker),
    "le style n'est pas vérifié contre la liste blanche — un inconnu pourrait dicter la consigne");
  assert.ok(!/corps\.instructions = [^S]*searchParams/.test(worker), 'du texte libre part vers le moteur');
});

test('le défaut reste « prof » : Lingua ne change pas', () => {
  assert.ok(/\) \? String\(url\.searchParams\.get\('i'\)\) : 'prof'/.test(worker), 'le style par défaut n\'est plus « prof »');
  assert.ok(/professeur de langue/.test(worker), 'la consigne historique de Lingua a disparu');
});

test('le style entre dans la clé de cache, sinon on n\'entend aucun changement', () => {
  const m = worker.match(/const cle = async \(m\) => [^\n]*/);
  assert.ok(m, 'la clé de cache a disparu');
  assert.ok(/style/.test(m[0]), 'le style n\'est PAS dans la clé de cache : la phrase déjà lue resterait servie à l\'ancienne');
  assert.ok(/m === HD_MODELE/.test(m[0]), 'le style doit ne compter que pour le moteur HD (tts-1 ne le lit pas)');
});

test('la pub demande un style de pub, pas la voix de l\'école', () => {
  assert.ok(/export const STYLE_VOIX = 'pub'/.test(video), 'video.mjs ne demande pas le style « pub »');
  assert.ok(/[?&]i=' \+ style|[?&]i=' \+ encodeURIComponent\(style\)|i=' \+ STYLE_VOIX/.test(video),
    'video.mjs n\'envoie pas le style au moteur de voix');
});
