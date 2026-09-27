/* COMPTE UNIQUE (Kevin 2026-08-05 : « Je ne veux pas plusieurs comptes, qu'ils
   soient tous reliés à mon compte admin »).
   Ce qu'on prouve :
   - toutes les apps de Kevin alimentent UN SEUL dossier (plus de fiche par app) ;
   - les fiches déjà éparpillées sont FUSIONNÉES automatiquement, sans rien perdre
     (connexions additionnées, historiques concaténés, appareils/lieux/apps réunis) ;
   - l'ancienne fiche devient un RENVOI et n'apparaît plus comme une personne ;
   - une AUTRE personne n'est JAMAIS absorbée dans le compte admin (le vrai risque) ;
   - un prénom seul auto-déclaré ne suffit pas à se ranger dans le dossier admin.
   node --test (depuis services/kdmc-router) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './worker.js';

function mkEnv() {
  const store = new Map();
  return {
    store,
    env: {
      KDMC_SSO_SECRET: 'sec',
      ACCOUNTS: {
        get: async (k) => (store.has(k) ? store.get(k) : null),
        put: async (k, v) => { store.set(k, v); },
        delete: async (k) => { store.delete(k); },
      },
    },
  };
}
const issue = (env, uid, name) => mod.fetch(new Request('https://kd-mc.com/__sso/issue', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ uid, name, cgu: true }),
}), env);
const acc = (store, uid) => JSON.parse(store.get('acc:' + uid) || 'null');

test('les apps de Kevin alimentent UN SEUL dossier (kdmc_admin)', async () => {
  const { store, env } = mkEnv();
  await issue(env, 'U11804', 'Kevin DESARZENS');       /* CMCteams */
  await issue(env, 'kdmc_admin', 'Kevin Desarzens');   /* Apex */
  await issue(env, 'lingua_7', 'kevin desarzens');     /* Lingua */
  const k = acc(store, 'kdmc_admin');
  assert.ok(k, 'le dossier canonique existe');
  /* NB : 3 visites rapprochées = 1 seule SESSION (prolongée, pas dupliquée) — c'est
     le comportement voulu. Ce qui compte ici : elles atterrissent toutes au MÊME endroit. */
  assert.ok(k.hits >= 1, 'la visite est comptée dans le dossier unique');
  assert.equal(acc(store, 'U11804'), null, 'aucune fiche séparée créée pour CMCteams');
  assert.equal(acc(store, 'lingua_7'), null, 'aucune fiche séparée créée pour Lingua');
  const idx = JSON.parse(store.get('idx:uids') || '[]');
  assert.deepEqual(idx, ['kdmc_admin'], 'UN SEUL dossier indexé pour Kevin (avant : un par app)');
});

test('les fiches DÉJÀ éparpillées sont fusionnées, sans rien perdre', async () => {
  const { store, env } = mkEnv();
  /* Ancien monde : deux fiches distinctes du même Kevin (dont une à 191 connexions). */
  store.set('idx:uids', JSON.stringify(['vieux_kevin', 'laurence-sp']));
  store.set('acc:vieux_kevin', JSON.stringify({
    uid: 'vieux_kevin', name: 'Kevin DESARZENS', hits: 191, created: 1000, last_seen: 2000,
    devices: ['mobile·iOS'], places: ['Nice, FR'],
    apps: { 'cmcteams.kd-mc.com': { first: 1000, last: 2000, sessions: 40, ms: 600000 } },
    history: [{ ts: 1500, end: 1600, app: 'cmcteams.kd-mc.com' }],
  }));
  store.set('acc:laurence-sp', JSON.stringify({ uid: 'laurence-sp', name: 'Laurence Saint-Polit', hits: 12, apps: {}, history: [] }));

  await issue(env, 'kdmc_admin', 'Kevin Desarzens'); /* déclenche la fusion auto */

  const k = acc(store, 'kdmc_admin');
  assert.ok(k.hits >= 192, 'les 191 connexions sont RÉCUPÉRÉES (+ la nouvelle), got ' + k.hits);
  assert.ok(k.history.length >= 1, 'historique repris');
  assert.ok(k.apps['cmcteams.kd-mc.com'].sessions >= 40, 'sessions par app reprises');
  assert.ok(k.apps['cmcteams.kd-mc.com'].ms >= 600000, 'temps par app repris');
  assert.ok((k.places || []).includes('Nice, FR'), 'lieux repris');
  assert.equal(k.created, 1000, 'la « 1re fois » remonte à la plus ancienne');
  assert.ok((k.aliases || []).includes('vieux_kevin'), 'ancien identifiant tracé');

  const old = acc(store, 'vieux_kevin');
  assert.equal(old.merged_into, 'kdmc_admin', 'ancienne fiche = simple renvoi');

  /* Une AUTRE personne ne doit JAMAIS être absorbée. */
  const l = acc(store, 'laurence-sp');
  assert.equal(l.hits, 12, 'Laurence intacte');
  assert.ok(!l.merged_into, 'Laurence JAMAIS fusionnée dans le compte admin');
});

test('les fiches fusionnées ne réapparaissent PAS comme des personnes', async () => {
  const { store, env } = mkEnv();
  const { createHash } = await import('node:crypto');
  const PIN = createHash('sha256').update('424242').digest('hex');
  env.KDMC_ADMIN_PIN_SHA256 = PIN;
  store.set('idx:uids', JSON.stringify(['vieux_kevin']));
  store.set('acc:vieux_kevin', JSON.stringify({ uid: 'vieux_kevin', name: 'Kevin DESARZENS', hits: 191, apps: {}, history: [] }));
  await issue(env, 'kdmc_admin', 'Kevin Desarzens');
  const r = await mod.fetch(new Request('https://kd-mc.com/__admin/domain-log', { headers: { 'x-apex-pin': PIN } }), env);
  const d = await r.json();
  const noms = d.people.map((p) => p.uid);
  assert.ok(noms.includes('kdmc_admin'), 'le dossier unique est listé');
  assert.ok(!noms.includes('vieux_kevin'), 'le doublon a disparu de la liste');
});

test('UN COMPTE PAR PERSONNE : vaut pour tout le monde, pas seulement l\'admin', async () => {
  const { store, env } = mkEnv();
  /* Laurence arrive par 3 apps avec 3 identifiants différents. */
  await issue(env, 'lau_cmc', 'Laurence Saint-Polit');
  await issue(env, 'lau_apex', 'laurence saint polit');   /* casse + tiret différents */
  await issue(env, 'lau_lingua', 'LAURENCE SAINT-POLIT');
  const idx = JSON.parse(store.get('idx:uids') || '[]');
  const vivants = idx.filter((u) => { const a = acc(store, u); return a && !a.merged_into; });
  assert.deepEqual(vivants, ['lau_cmc'], 'UN SEUL dossier pour Laurence, malgré 3 identifiants');
  assert.equal(acc(store, 'lau_apex'), null, 'aucune fiche séparée créée');
  assert.equal(acc(store, 'lau_lingua'), null, 'aucune fiche séparée créée');
});

test('les fiches déjà éparpillées d\'un EMPLOYÉ sont fusionnées comme celles de Kevin', async () => {
  const { store, env } = mkEnv();
  store.set('idx:uids', JSON.stringify(['vieux_marc']));
  store.set('acc:vieux_marc', JSON.stringify({
    uid: 'vieux_marc', name: 'Marc Dupont', hits: 47, created: 500, last_seen: 900,
    devices: ['mobile·Android'], places: ['Monaco, MC'], apps: {}, history: [{ ts: 700, end: 800, app: 'cmcteams.kd-mc.com' }],
  }));
  await issue(env, 'marc_apex', 'MARC DUPONT');
  /* Ce qui compte : il ne reste QU'UN dossier vivant, et il contient tout son passé.
     (Peu importe lequel des deux identifiants le porte — l'autre devient un renvoi.) */
  const idx = JSON.parse(store.get('idx:uids') || '[]');
  const vivants = idx.map((u) => acc(store, u)).filter((a) => a && !a.merged_into);
  assert.equal(vivants.length, 1, 'un seul dossier vivant pour Marc, got ' + vivants.length);
  const canon = vivants[0];
  assert.ok(canon.hits >= 48, 'ses 47 connexions sont conservées, got ' + canon.hits);
  assert.ok((canon.places || []).includes('Monaco, MC'), 'ses lieux sont conservés');
  assert.equal(canon.created, 500, 'sa « 1re fois » d\'origine est conservée');
  assert.ok((canon.history || []).length >= 1, 'son historique est conservé');
});

test('deux personnes DIFFÉRENTES ne sont JAMAIS fusionnées', async () => {
  const { store, env } = mkEnv();
  await issue(env, 'a1', 'Marc Dupont');
  await issue(env, 'b1', 'Marc Durand');   /* nom différent */
  await issue(env, 'c1', 'Sophie Dupont'); /* prénom différent */
  ['a1', 'b1', 'c1'].forEach((u) => {
    const a = acc(store, u);
    assert.ok(a && !a.merged_into, u + ' garde son propre dossier');
  });
});

test('un prénom seul auto-déclaré ne se range PAS dans le dossier admin', async () => {
  const { store, env } = mkEnv();
  const r1 = await issue(env, 'inconnu_1', 'Kevin');       /* prénom seul */
  await issue(env, 'inconnu_2', 'Kevin Martin'); /* homonyme */
  assert.equal(acc(store, 'kdmc_admin'), null, 'aucun dossier admin créé par un nom incomplet');
  /* Depuis le 27.09 (Kevin : « renseignements obligatoires partout pour les nouveaux »), un
     prénom seul ne crée plus de fiche du tout — encore plus strict qu'une fiche séparée. */
  assert.equal(r1.status, 400, 'un prénom seul est refusé à l\'inscription');
  assert.equal(acc(store, 'inconnu_1'), null, 'aucune fiche créée pour un prénom seul');
  assert.ok(acc(store, 'inconnu_2'), 'un homonyme garde sa propre fiche');
});

/* ── Deux défauts CONSTATÉS EN VRAI le 2026-08-06 sur le journal live ────────────
   (1) « Connexions RÉELLES → 8 personnes » listait DEUX « kevin Desarzens »
       (196 et 116 connexions) : la fusion portait un drapeau DÉFINITIF, donc une
       fiche en double apparue APRÈS le premier passage n'était plus jamais absorbée.
   (2) « Ronan Desarzens » (nom de famille identique, prénom différent) était
       reconnu comme l'admin → sa fiche AURAIT ÉTÉ absorbée dans celle de Kevin. */

test('une fiche en double apparue APRÈS la 1re fusion est bien absorbée ensuite', async () => {
  const { store, env } = mkEnv();
  await issue(env, 'kdmc_admin', 'Kevin Desarzens');           /* 1re fusion : rien à absorber */
  const k1 = acc(store, 'kdmc_admin');
  assert.ok(k1.merged_at, 'la date de dernière fusion est enregistrée');

  /* Une vieille fiche du même Kevin refait surface (import, autre app, migration…). */
  store.set('idx:uids', JSON.stringify(['kdmc_admin', 'kevin_ancien']));
  store.set('acc:kevin_ancien', JSON.stringify({
    uid: 'kevin_ancien', name: 'Kevin DESARZENS', hits: 116, apps: {}, history: [],
  }));
  /* On simule le temps qui passe (le re-passage est au plus 1×/semaine). */
  const k = acc(store, 'kdmc_admin');
  k.merged_at = Date.now() - 8 * 24 * 3600e3;
  k.last_seen = Date.now() - 8 * 24 * 3600e3; /* sinon la visite est « trop rapprochée » et rien n'est réécrit */
  store.set('acc:kdmc_admin', JSON.stringify(k));

  await issue(env, 'kdmc_admin', 'Kevin Desarzens');           /* visite suivante */

  const k2 = acc(store, 'kdmc_admin');
  assert.ok(k2.hits >= 116, 'les 116 connexions du doublon sont récupérées, got ' + k2.hits);
  assert.equal(acc(store, 'kevin_ancien').merged_into, 'kdmc_admin', 'le doublon devient un renvoi');
});

test('Ronan Desarzens garde SON compte (même nom de famille ≠ même personne)', async () => {
  const { store, env } = mkEnv();
  await issue(env, 'kdmc_admin', 'Kevin Desarzens');
  await issue(env, 'ronan_1', 'Ronan Desarzens');
  const r = acc(store, 'ronan_1');
  assert.ok(r, 'Ronan a bien sa propre fiche');
  assert.ok(!r.merged_into, 'Ronan n\'est JAMAIS absorbé dans le compte admin');
  assert.notEqual(r.name, undefined);
  /* et l'inverse : Kevin ne récupère pas les connexions de Ronan */
  const k = acc(store, 'kdmc_admin');
  assert.ok(!(k.aliases || []).includes('ronan_1'), 'aucun rattachement de Ronan à Kevin');
});

test('« Desarzens K » (nom + initiale) reste bien reconnu comme l\'admin', async () => {
  const { store, env } = mkEnv();
  /* Le dossier de Kevin existe (c'est le cas en vrai) : « DESARZENS K » n'est donc pas une
     inscription NOUVELLE — il doit être rangé chez l'admin, pas refusé ni dédoublé. (Seule une
     inscription neuve exige prénom + nom complets, depuis le 27.09.) */
  await issue(env, 'kdmc_admin', 'Kevin Desarzens');
  const r = await issue(env, 'u1', 'DESARZENS K');
  assert.equal(r.status, 200, 'accepté : ce n\'est pas un nouveau compte');
  assert.ok(acc(store, 'kdmc_admin'), 'rangé dans le dossier admin');
  assert.equal(acc(store, 'u1'), null, 'aucun dossier séparé « u1 » créé');
});
