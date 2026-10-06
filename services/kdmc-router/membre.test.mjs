/* /__dep/membre — la light demande au DOMAINE si prénom + nom + matricule sont dans le planning publié
   (Kevin 5.10.2026 : « mes collègues n'arrivent plus à se connecter »). Vrai routeur, vrai planning, sans réseau.
   node membre.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './worker.js';
import { membreDansPlanning, _videCachePlanning } from './membre-planning.js';

/* Un planning FICTIF, du même format que le vrai (boards-gen.js) : ce test reste public et tourne à chaque
   déploiement du routeur (le vrai planning, lui, n'existe qu'au coffre). Noms inventés. */
const PLANNING = 'window.DEPARTS_GEN={"boards":{"2026-10-1":{"people":[{"id":"U00015","name":"DUPONT M"},{"id":"U00016","name":"MARTIN-ROUX L"}]}}};';
const env = { ACCOUNTS: { get: async (k) => (k === 'fichier:/cmcteams/tools/departs/boards-gen.js' ? PLANNING : null) } };
const demander = async (corps, origin) => {
  const h = { 'content-type': 'application/json' };
  if (origin) h.origin = origin;
  const r = await mod.fetch(new Request('https://cmcteams-light.kd-mc.com/__dep/membre', { method: 'POST', headers: h, body: JSON.stringify(corps) }), env, { waitUntil() {} });
  return { status: r.status, j: await r.json() };
};

test('le domaine reconnaît un collègue du planning, et lui seul', async () => {
  _videCachePlanning();
  assert.equal(membreDansPlanning(PLANNING, 'U00015', 'Dupont', 'Marc'), true, 'bon trio');
  assert.equal(membreDansPlanning(PLANNING, 'u00015', 'DUPONT', 'm.'), false, 'prénom trop court (1 lettre) refusé');
  assert.equal(membreDansPlanning(PLANNING, 'U00015', 'Dupont', 'Paul'), false, 'initiale différente');
  assert.equal(membreDansPlanning(PLANNING, 'U00015', 'Rossi', 'Marc'), false, 'autre nom');
  assert.equal(membreDansPlanning(PLANNING, 'U34999', 'Dupont', 'Marc'), true, 'vrai matricule SBM (le planning n\'a que des numéros internes) : le nom identifie');
  assert.equal(membreDansPlanning(PLANNING, 'U34999', 'Inconnu', 'Marc'), false, 'nom absent du planning : refusé');
  assert.equal(membreDansPlanning(PLANNING, 'Z34999', 'Dupont', 'Marc'), false, 'matricule mal écrit : refusé');
  assert.equal(membreDansPlanning(PLANNING, 'U0001.*', 'Dupont', 'Marc'), false, 'motif dans le matricule refusé');
  assert.equal(membreDansPlanning('{"id":"U00001","name":"DURAND JE"}', 'U00001', 'Durand', 'Jean'), true, 'initiale de 2 lettres');
  assert.equal(membreDansPlanning('{"id":"U00016","name":"MARTIN-ROUX L"}', 'U00016', 'Martin Roux', 'Léa'), true, 'nom composé avec tiret');
  assert.equal(membreDansPlanning('{"id":"U00001","name":"ÉTIENNE V"}', 'U00001', 'Etienne', 'Valérie'), true, 'accents ignorés');

  const oui = await demander({ matricule: 'U00015', nom: 'Dupont', prenom: 'Marc' }, 'https://cmcteams-light.kd-mc.com');
  assert.deepEqual([oui.status, oui.j.ok], [200, true], 'route : oui');
  const non = await demander({ matricule: 'U00015', nom: 'Rossi', prenom: 'Marc' }, 'https://cmcteams-light.kd-mc.com');
  assert.deepEqual([non.status, non.j.ok], [200, false], 'route : non');
  assert.deepEqual(Object.keys(non.j), ['ok'], 'la réponse ne dit rien d\'autre que oui / non');
  const tiers = await demander({ matricule: 'U00015', nom: 'Dupont', prenom: 'Marc' }, 'https://exemple.com');
  assert.equal(tiers.status, 403, 'un site tiers ne peut pas interroger le planning');
  const get = await mod.fetch(new Request('https://cmcteams-light.kd-mc.com/__dep/membre'), env, { waitUntil() {} });
  assert.equal(get.status, 405, 'GET refusé');
});
