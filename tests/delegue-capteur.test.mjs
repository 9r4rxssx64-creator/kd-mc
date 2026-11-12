import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteDe, urlIiifAd06, travailPermis, classer, MAX_PASSAGE } from '../tools/delegue/capteur.mjs';

test('site reconnu par l\'adresse, pas par un faux domaine', () => {
  assert.equal(siteDe('https://archives06.fr/x'), 'ad06');
  assert.equal(siteDe('https://archives18.fr/a'), 'ad18');
  assert.equal(siteDe('https://archives.seinesaintdenis.fr/z'), 'ad93');
  assert.equal(siteDe('https://recherche-archives.tarn.fr/'), 'tarn');
  assert.equal(siteDe('https://davel-vd.ch/eb'), 'davel');
  assert.equal(siteDe('https://exemple.com'), 'autre');
  assert.equal(siteDe('https://archives06.fr.evil.com/x'), 'autre');
});

test('image IIIF AD06 au format de la recette, zone en pourcentage, paramètres vides refusés', () => {
  assert.equal(urlIiifAd06({ dossier: '02MIEC_114', vue: 2, fichier: '02MIEC_114_002_000245' }), 'https://archives06.fr/iiif/Etat-Civil/02MIEC_114/002//02MIEC_114_002_000245.jpg/full/1800,/0/default.jpg');
  assert.ok(urlIiifAd06({ dossier: 'A', vue: 1, fichier: 'F', zone: 'pct:0,50,100,50' }).includes('/pct:0,50,100,50/1100,/'));
  assert.throws(() => urlIiifAd06({ dossier: '../x', vue: '', fichier: '' }));
});

test('travail permis ; identifiant piégé, adresse interne et site inconnu refusés', () => {
  assert.equal(travailPermis({ id: 'a-1', url: 'https://archives18.fr/x' }), '');
  assert.notEqual(travailPermis({ id: '../x', url: 'https://archives18.fr/x' }), '');
  assert.notEqual(travailPermis({ id: 'a', url: 'http://127.0.0.1/x' }), '');
  assert.notEqual(travailPermis({ id: 'a', url: 'https://exemple.com/x' }), '');
});

test('attente Anubis ≠ captcha (le captcha arrête, jamais contourné) ; 100 images au plus', () => {
  assert.equal(classer('Calcul en cours…'), 'anubis');
  assert.equal(classer('Veuillez cocher : je ne suis pas un robot'), 'captcha');
  assert.equal(classer('Registre'), 'ok');
  assert.equal(MAX_PASSAGE, 100);
});
