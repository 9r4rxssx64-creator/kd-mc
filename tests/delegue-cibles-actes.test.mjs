import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cibles, distances } from '../tools/delegue/cibles-actes.mjs';

const P = {
  seed_kevin: { prenom: 'Kevin', nom: 'X', naissance: { date: '01.01.1985', lieu: 'Nice' }, pere: 'a', mere: 'b' },
  a: { prenom: 'A', nom: 'X', naissance: { date: '1955', lieu: 'Nice' }, conjoints: ['b'] },
  b: { prenom: 'B', nom: 'Y', naissance: { date: '1957', lieu: 'Nice' }, conjoints: ['a'] },
  g: { prenom: 'G', nom: 'X', naissance: { date: '12.03.1890', lieu: 'Vallauris (Alpes-Maritimes)' }, conjoints: [], enfants: [] },
  h: { prenom: 'H', nom: 'Z', naissance: { date: '1885', lieu: 'Nice' }, prive: true },
  i: { prenom: 'I', nom: 'W', naissance: { date: '1890', lieu: '' } },
};
P.a.pere = 'g';
test('seuls les actes publics avec lieu et année sont ciblés, les privés jamais', () => {
  const c = cibles(P);
  assert.deepEqual(c.map((x) => x.id), ['g']); // b a ~1957 > 1950, h privé, i sans lieu
  assert.equal(c[0].type, 'naissance'); assert.equal(c[0].lieu, 'Vallauris');
});
test('la distance suit les liens de parenté', () => {
  const d = distances(P); assert.equal(d.a, 1); assert.equal(d.g, 2);
});
