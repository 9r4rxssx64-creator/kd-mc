/* FICHE ACHETEUR OBLIGATOIRE, vérifiée par le SERVEUR de vente (Kevin 27.09.2026 : « renseignements
   obligatoires partout pour les nouveaux » ; boutiques = à la commande). Avant : un e-mail suffisait,
   et aucune acceptation des conditions de vente n'était demandée (la case ne portait que sur la
   rétractation). On appelle le VRAI worker (KV simulé) : prénom, nom et CGV manquants → 400 ; fiche
   complète → panier enregistré AVEC l'identité et l'acceptation datée.
   node --test services/kdmc-vente/fiche-commande.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './worker.js';

const kv = new Map();
const VENTES = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) };
const env = { VENTES };
const poste = async (chemin, corps) => {
  const r = await mod.fetch(new Request('https://kdmc-vente.9r4rxssx64.workers.dev' + chemin, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://kit.kd-mc.com' }, body: JSON.stringify(corps) }), env);
  return { st: r.status, j: await r.json().catch(() => ({})) };
};
const BASE = { produit: 'kit-ia', email: 'marie.rossi@exemple.fr', moyen: 'paypal', consentement: true };

for (const [chemin, pas] of [['/caisse/intention', 'int'], ['/caisse/commande', 'cmd']]) {
  test(chemin + ' : sans prénom → refusé', async () => {
    const r = await poste(chemin, { ...BASE, nom: 'Rossi', cgv: true });
    assert.equal(r.st, 400); assert.equal(r.j.error, 'prenom'); assert.equal(r.j.step, pas + '_prenom');
  });
  test(chemin + ' : sans nom → refusé', async () => {
    const r = await poste(chemin, { ...BASE, prenom: 'Marie', cgv: true });
    assert.equal(r.st, 400); assert.equal(r.j.error, 'nom');
  });
  test(chemin + ' : « nom » d\'une seule lettre ou de chiffres → refusé', async () => {
    assert.equal((await poste(chemin, { ...BASE, prenom: 'Marie', nom: 'R', cgv: true })).st, 400);
    assert.equal((await poste(chemin, { ...BASE, prenom: '12', nom: 'Rossi', cgv: true })).st, 400);
  });
  test(chemin + ' : conditions de vente NON acceptées → refusé', async () => {
    const r = await poste(chemin, { ...BASE, prenom: 'Marie', nom: 'Rossi' });
    assert.equal(r.st, 400); assert.equal(r.j.error, 'cgv');
    const r2 = await poste(chemin, { ...BASE, prenom: 'Marie', nom: 'Rossi', cgv: 'oui' });
    assert.equal(r2.st, 400, 'seul un vrai « true » compte');
  });
}

test('/caisse/intention : fiche complète → panier enregistré avec identité + CGV datées', async () => {
  const r = await poste('/caisse/intention', { ...BASE, prenom: '  Marie ', nom: 'Rossi-Dupont', cgv: true });
  assert.equal(r.st, 200); assert.equal(r.j.ok, true); assert.ok(r.j.ref);
  const cmd = JSON.parse(kv.get('cmd:' + r.j.ref));
  assert.deepEqual(cmd.acheteur, { prenom: 'Marie', nom: 'Rossi-Dupont' });
  assert.equal(cmd.cgv.acceptees, true);
  assert.match(cmd.cgv.ts_iso, /^20\d\d-\d\d-\d\dT/);
  assert.match(cmd.cgv.texte, /conditions de vente/);
  assert.equal(cmd.consentement.donne, true, 'le consentement de rétractation reste enregistré');
});

test('/caisse/commande : fiche complète → passe le contrôle (puis « caisse absente » sans clés PayPal)', async () => {
  const r = await poste('/caisse/commande', { ...BASE, prenom: 'Marie', nom: 'Rossi', cgv: true });
  assert.equal(r.j.error, 'caisse_absente', 'la fiche est acceptée : on s\'arrête seulement faute de clés PayPal (comportement inchangé)');
});
