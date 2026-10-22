// Essais du robot (22.10.2026) : « preuve@example.com » avait laissé 14 « à livrer » + 10 paniers
// fantômes dans le tableau de Kevin. Une adresse example.* n'est jamais un acheteur : jamais
// comptée, effacée à la lecture admin, et un vrai acheteur n'est JAMAIS touché.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estEssai, resumeIntentions, lireSansEssais } from './worker.js';

test('estEssai : seulement les domaines réservés (RFC 2606)', () => {
  for (const e of ['preuve@example.com', 'p@example.org', 'X@EXAMPLE.NET ']) assert.equal(estEssai(e), true, e);
  for (const e of ['client@boutique.fr', 'client@example.fr', 'a@monexample.com', 'example.com@gmail.com', '', null]) assert.equal(estEssai(e), false, String(e));
});

test('resumeIntentions ne compte jamais un essai', () => {
  const r = resumeIntentions([
    { etat: 'dit_paye', email: 'preuve@example.com', montant: 17, ts: 1 },
    { etat: 'intention', email: 'preuve@example.com', montant: 17, ts: 2 },
    { etat: 'intention', email: 'vrai@boutique.fr', montant: 47, ts: 3 },
  ], 10);
  assert.equal(r.n, 1);
  assert.equal(r.dit_paye, 0);
  assert.equal(r.ca_potentiel, 47);
});

test('lireSansEssais efface les essais et garde les vrais', async () => {
  const kv = new Map([
    ['demande:a', JSON.stringify({ id: 'a', email: 'preuve@example.com' })],
    ['demande:b', JSON.stringify({ id: 'b', email: 'vraie@boutique.fr' })],
    ['demande:c', 'pas du json'],
  ]);
  const fake = { get: async (k) => kv.get(k) ?? null, delete: async (k) => { kv.delete(k); } };
  const lignes = await lireSansEssais(fake, ['demande:a', 'demande:b', 'demande:c', 'demande:absente']);
  assert.deepEqual(lignes.map((l) => l.id), ['b']);
  assert.equal(kv.has('demande:a'), false, "l'essai est effacé");
  assert.equal(kv.has('demande:b'), true, 'le vrai acheteur reste');
});

test('les écritures donnent une vie courte aux essais', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  assert.match(src, /expirationTtl: estEssai\(email\) \? TTL_ESSAI : TTL_CMD/);
  assert.equal((src.match(/expirationTtl: ttlDemande\(email\)/g) || []).length, 4);
});
