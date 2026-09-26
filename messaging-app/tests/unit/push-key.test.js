/**
 * push-key — cohérence de clé VAPID pour l'abonnement push (couverture 100%).
 * Racine du bug « 201 accepté mais rien reçu » (diag v1.1.276) : l'app
 * s'abonnait avec une clé hardcodée ≠ clé de signature du worker → Apple DROP.
 */
import { describe, it, expect } from 'vitest';
import { isValidVapidKey, effectiveVapidKey, needsResubscribe } from '../../lib/push-key.js';

const REAL = 'BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY'; // 87c
const OTHER = 'BOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyXYZ123456'; // 87c

describe('isValidVapidKey', () => {
  it('vraie clé P-256 base64url (~87c) → valide', () => {
    expect(isValidVapidKey(REAL)).toBe(true);
  });
  it('chaîne trop courte / vide → invalide', () => {
    expect(isValidVapidKey('')).toBe(false);
    expect(isValidVapidKey('trop-court')).toBe(false);
  });
  it('non-string → invalide', () => {
    expect(isValidVapidKey(null)).toBe(false);
    expect(isValidVapidKey(undefined)).toBe(false);
    expect(isValidVapidKey(12345)).toBe(false);
  });
});

describe('effectiveVapidKey', () => {
  it('clé serveur valide → on prend la clé SERVEUR (source de vérité)', () => {
    expect(effectiveVapidKey(OTHER, REAL)).toBe(OTHER);
  });
  it('clé serveur vide/invalide → repli sur la clé embarquée (fail-open)', () => {
    expect(effectiveVapidKey('', REAL)).toBe(REAL);
    expect(effectiveVapidKey(null, REAL)).toBe(REAL);
  });
});

describe('needsResubscribe', () => {
  it('aucun abonnement existant → il faut s\'abonner', () => {
    expect(needsResubscribe('', REAL, false)).toBe(true);
    expect(needsResubscribe(REAL, REAL, false)).toBe(true);
  });
  it('clé serveur inconnue/invalide → garder l\'existant (fail-open)', () => {
    expect(needsResubscribe(REAL, '', true)).toBe(false);
    expect(needsResubscribe(REAL, null, true)).toBe(false);
  });
  it('clé de l\'abonnement ≠ clé serveur → recréer (cause du 201-dropped)', () => {
    expect(needsResubscribe(OTHER, REAL, true)).toBe(true);
    expect(needsResubscribe('', REAL, true)).toBe(true); // jamais mémorisée
  });
  it('clé identique → ne rien recréer', () => {
    expect(needsResubscribe(REAL, REAL, true)).toBe(false);
  });
});
