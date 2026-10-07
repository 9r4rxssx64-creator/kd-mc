/* /__dep/membre — la light demande au DOMAINE si prénom + nom + matricule sont dans le planning publié
   (Kevin 5.10.2026 : « mes collègues n'arrivent plus à se connecter »). Vrai routeur, vrai planning, sans réseau.
   node membre.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './worker.js';
import { membreDansPlanning, _videCachePlanning, CLE_BANQUE } from './membre-planning.js';

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
  /* 7.10 (Kevin : « un nom présent des imports, sinon refus. Et notif admin ») : le refus dit POURQUOI, en un mot connu —
     rien de plus (la light affichait déjà « pas dans le planning » pour ce cas : aucune information nouvelle). */
  assert.deepEqual(non.j, { ok: false, reason: 'hors_planning' }, 'route : non — et seulement la raison « hors_planning »');
  const malEcrit = await demander({ matricule: 'Z15', nom: 'Dupont', prenom: 'Marc' }, 'https://cmcteams-light.kd-mc.com');
  assert.deepEqual(malEcrit.j, { ok: false, reason: 'matricule_format' }, 'route : matricule mal écrit — raison « matricule_format »');
  const tiers = await demander({ matricule: 'U00015', nom: 'Dupont', prenom: 'Marc' }, 'https://exemple.com');
  assert.equal(tiers.status, 403, 'un site tiers ne peut pas interroger le planning');
  const get = await mod.fetch(new Request('https://cmcteams-light.kd-mc.com/__dep/membre'), env, { waitUntil() {} });
  assert.equal(get.status, 405, 'GET refusé');
});

/* LE MATRICULE SBM RANGÉ SUR LA FICHE (Kevin 6.10 : « on sauvegarde sur chaque fiche au fur et à mesure des inscriptions »).
   Un KV en mémoire, le vrai routeur. SABOTAGE=1 : le registre ne range rien → les contrôles « rangé », « autre », « pris » rougissent. */
import { createHash, createHmac } from 'node:crypto';
import { verifierEtRanger, corrigerMatricule } from './membre-planning.js';
const SAB = process.env.SABOTAGE === '1';
function kvMemoire(depart) {
  const m = new Map(Object.entries(depart || {}));
  return { m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { if (!SAB) m.set(k, String(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
}
const PLAN2 = 'window.DEPARTS_GEN={"boards":{"b":{"people":[{"id":"U00015","name":"DUPONT M"},{"id":"U00016","name":"MARTIN-ROUX L"},{"id":"U00020","name":"BERNARD A"},{"id":"U00021","name":"BERNARD A"}]}}};';

test('le matricule SBM tapé à la première inscription est rangé sur la personne, puis contrôlé', async () => {
  const kv = kvMemoire({ 'fichier:/cmcteams/tools/departs/boards-gen.js': PLAN2 });
  const e = { ACCOUNTS: kv };
  const v1 = await verifierEtRanger(e, PLAN2, 'u34924', 'Dupont', 'Marc', 'cmcteams-light.kd-mc.com');
  assert.equal(v1.ok, true, '1re inscription : oui');
  assert.equal(JSON.parse(kv.m.get('matsbm:U00015') || '{}').m, 'U34924', 'rangé sur la fiche de la personne du planning (U00015)');
  assert.equal(kv.m.get('matsbm-r:U34924'), 'U00015', 'et le matricule pointe vers elle (un matricule = une personne)');
  assert.deepEqual(await verifierEtRanger(e, PLAN2, 'U34924', 'Marc', 'Dupont', 'cmcteams.kd-mc.com'), { ok: true }, 'même personne, même matricule (ordre inversé) : oui, rien n\'est réécrit');
  assert.deepEqual(await verifierEtRanger(e, PLAN2, 'U99999', 'Dupont', 'Marc'), { ok: false, reason: 'matricule_autre' }, 'même nom, AUTRE matricule : non, et on dit pourquoi');
  assert.deepEqual(await verifierEtRanger(e, PLAN2, 'U34924', 'Martin Roux', 'Léa'), { ok: false, reason: 'matricule_pris' }, 'le matricule d\'un autre collègue : non');
  assert.deepEqual(await verifierEtRanger(e, PLAN2, 'U00016', 'Dupont', 'Marc'), { ok: false, reason: 'matricule_autre' }, 'le numéro interne d\'un AUTRE : non');
  assert.deepEqual(await verifierEtRanger(e, PLAN2, 'U00015', 'Dupont', 'Marc'), { ok: true }, 'son propre numéro interne : oui');
  assert.equal(kv.m.has('matsbm-r:U00015'), false, 'un numéro interne n\'est jamais rangé comme matricule SBM');
  assert.deepEqual(await verifierEtRanger(e, PLAN2, 'U40000', 'Bernard', 'Alice'), { ok: true }, 'homonymes : oui…');
  assert.equal([...kv.m.keys()].some((k) => /U0002[01]/.test(k) || k === 'matsbm-r:U40000'), false, '… mais rien n\'est rangé (on ne saurait pas sur qui)');
  /* Kevin corrige */
  assert.deepEqual(await corrigerMatricule(e, 'U00015', 'U35000'), { ok: true, libere: '' }, 'Kevin corrige');
  assert.equal(kv.m.has('matsbm-r:U34924'), false, 'l\'ancien matricule est libéré');
  assert.equal((await verifierEtRanger(e, PLAN2, 'U35000', 'Dupont', 'Marc')).ok, true, 'le matricule corrigé passe');
  assert.equal((await corrigerMatricule(e, 'U00015', 'x1')).ok, false, 'un matricule mal écrit est refusé');
  assert.deepEqual(await corrigerMatricule(e, 'U00015', ''), { ok: true }, 'effacer');
  assert.equal(kv.m.has('matsbm:U00015') || kv.m.has('matsbm-r:U35000'), false, 'effacé partout');
});

test('par le vrai routeur : refus expliqué + alerte pour Kevin ; la liste et la correction sont à Kevin seul', async () => {
  const b64u = (b) => Buffer.from(b).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const signer = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
  _videCachePlanning();
  const kv = kvMemoire({ 'fichier:/cmcteams/tools/departs/boards-gen.js': PLAN2 });
  const e = { ACCOUNTS: kv, KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('000000').digest('hex') };
  const appel = async (chemin, init) => { const r = await mod.fetch(new Request('https://cmcteams-light.kd-mc.com' + chemin, init), e, { waitUntil() {} }); return { status: r.status, j: await r.json() }; };
  const post = (corps, h) => ({ method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://cmcteams-light.kd-mc.com' }, h || {}), body: JSON.stringify(corps) });
  assert.equal((await appel('/__dep/membre', post({ matricule: 'U34924', nom: 'Dupont', prenom: 'Marc' }))).j.ok, true, 'inscription : oui');
  const non = await appel('/__dep/membre', post({ matricule: 'U11111', nom: 'Dupont', prenom: 'Marc' }));
  assert.deepEqual(non.j, { ok: false, reason: 'matricule_autre' }, 'autre matricule : non, avec la raison');
  const log = JSON.parse(kv.m.get('aud:log') || '[]');
  assert.equal(log[0]?.ev, 'matricule_refuse', 'Kevin a une alerte dans son journal');
  assert.match(log[0]?.detail || '', /Marc Dupont a tapé U11111/, 'l\'alerte dit qui et quoi');
  assert.equal(log[0]?.app, 'cmcteams-light.kd-mc.com', 'et depuis quelle app');
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./boite.js', import.meta.url), 'utf8'), /const EV_ALERTES = \{[^}]*matricule_refuse:/, 'cette alerte arrive dans la boîte unique de Kevin');
  assert.equal((await appel('/__dep/matricules', { method: 'GET' })).status, 403, 'la liste : refusée sans session admin');
  assert.equal((await appel('/__dep/matricules', post({ id: 'U00015', m: '' }))).status, 403, 'la correction : refusée sans session admin');
  const adm = { 'x-kdmc-admin': signer('__kdmc_admin__') };
  const liste = await appel('/__dep/matricules', { method: 'GET', headers: adm });
  assert.deepEqual(liste.j.liste?.map((x) => [x.id, x.nom, x.m]), [['U00015', 'DUPONT M', 'U34924']], 'Kevin lit la liste (numéro, nom du planning, matricule)');
  const cor = await appel('/__dep/matricules', post({ id: 'U00015', m: 'U11111' }, adm));
  assert.equal(cor.j.ok, true, 'Kevin corrige');
  assert.equal((await appel('/__dep/membre', post({ matricule: 'U11111', nom: 'Dupont', prenom: 'Marc' }))).j.ok, true, 'après correction, le bon matricule passe');
});

/* 7.10 soir (Kevin « Historique banque de données exponentielle avec les imports ») : une personne vue dans un planning publié
   reste reconnue quand un import plus récent ne la montre plus ; un nom jamais vu reste refusé ; la banque ne s'écrit que
   quand un nom nouveau apparaît. */
test('la banque des noms grossit import après import et ne perd personne', async () => {
  const m = new Map(), ecritures = [];
  let publie = PLANNING;
  const envB = { ACCOUNTS: { get: async (k) => (k === 'fichier:/cmcteams/tools/departs/boards-gen.js' ? publie : m.get(k) ?? null),
    put: async (k, v) => { ecritures.push(k); m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const membre = async (corps) => (await (await mod.fetch(new Request('https://cmcteams-light.kd-mc.com/__dep/membre', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) }), envB, { waitUntil() {} })).json());
  _videCachePlanning();
  assert.equal((await membre({ matricule: 'U40001', nom: 'Martin-Roux', prenom: 'Lea' })).ok, true, 'import 1 : la collègue est dans le planning');
  assert.equal(Object.keys(JSON.parse(m.get(CLE_BANQUE) || '{}')).length, 2, 'import 1 : les 2 noms entrent dans la banque');
  publie = 'window.DEPARTS_GEN={"boards":{"2026-11-1":{"people":[{"id":"U00015","name":"DUPONT M"},{"id":"U00020","name":"LEROY P"}]}}};';
  _videCachePlanning();
  assert.equal((await membre({ matricule: 'U40002', nom: 'Leroy', prenom: 'Paul' })).ok, true, 'import 2 : le nouveau collègue est reconnu');
  assert.equal((await membre({ matricule: 'U40001', nom: 'Martin-Roux', prenom: 'Lea' })).ok, true, 'import 2 : la collègue absente du nouveau planning reste reconnue (banque)');
  assert.equal((await membre({ matricule: 'U40003', nom: 'Inconnu', prenom: 'Jean' })).reason, 'hors_planning', 'un nom jamais vu reste refusé');
  assert.deepEqual(Object.keys(JSON.parse(m.get(CLE_BANQUE))).sort(), ['U00015|DUPONT M', 'U00016|MARTIN-ROUX L', 'U00020|LEROY P'], 'la banque garde les 3 noms vus');
  const avant = ecritures.filter((k) => k === CLE_BANQUE).length;
  _videCachePlanning();
  await membre({ matricule: 'U40002', nom: 'Leroy', prenom: 'Paul' });
  assert.equal(ecritures.filter((k) => k === CLE_BANQUE).length, avant, 'sans nom nouveau, la banque n\'est pas réécrite (gratuit)');
  _videCachePlanning();
});

