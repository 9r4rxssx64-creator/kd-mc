import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteDe, urlIiifAd06, travailPermis, classer, estImage, MAX_PASSAGE } from '../tools/delegue/capteur.mjs';

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

test('une page d\'erreur HTML n\'est jamais une image (Lenovo 12.11 : « Request Rejected » captée à tort)', () => {
  assert.equal(estImage(Buffer.from('<html><body>Request Rejected - The requested URL was rejected</body></html>')), false);
  assert.equal(estImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])), true);
  assert.equal(estImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), true);
  assert.equal(estImage(Buffer.from('RIFF....WEBP')), true);
  assert.equal(estImage(Buffer.alloc(0)), false);
});
