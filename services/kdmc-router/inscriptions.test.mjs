/* GARDE — LES INSCRIPTIONS EN ATTENTE, VISIBLES ET VALIDABLES DE PARTOUT (Kevin 7.10.2026 : « Je n'accède pas pour confirmer
 * inscription » ; « Je dois voir les inscriptions etc en attente dans le domaine en dessous des messages et dans light. Je débloque
 * de partout où j'ai envie. J'ai une alerte visuelle d'un message ou inscription en attente »).
 * Firebase simulé (GET / PATCH, chemins /cmcteams/… et /cmcteams_secret/…), D1 = SQLite de Node. Noms fictifs.
 * Prouve : la règle « en attente » ; la boîte de l'admin les donne ; « /mes » donne à l'admin ses compteurs (pastille de chaque app) ;
 * valider écrit la fiche ET le code ; réservé à l'admin, depuis le domaine.
 * SABOTAGE=1 : la boîte ne lit plus les inscriptions → les contrôles B, C, D rougissent.
 * node services/kdmc-router/inscriptions.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { handleBoite, enAttente, _viderMemo } from './boite.js';
import { ADMIN, schema as schemaCercle } from './cercle.js';

const SAB = process.env.SABOTAGE === '1';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 260) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; } };
}
const T = Date.parse('2026-10-07T08:00:00Z');
const J = 864e5;
const racine = {
  cmcteams: {
    cmc_reg: {
      U34001: { prenom: 'Marc', nom: 'DUPONT', matricule: 'U34001', createdAt: T - 2 * J, verified: false },          // en attente
      U34002: { prenom: 'Léa', nom: 'MARTIN', matricule: 'U34002', createdAt: T - J, verified: true },              // déjà validée seule
      U34003: { prenom: 'Paul', nom: 'ROSSI', createdAt: T - 90 * J },                                                // trop ancienne
      U00015: { prenom: 'Anna', nom: 'BONO', createdAt: T - J },                                                       // dans une équipe du planning
      U34005: { prenom: 'Zoé', nom: 'BLANC', createdAt: T - 3 * J, verifiedByAdmin: true },                          // validée par Kevin
      'x/../y': { prenom: 'Pirate', nom: 'X', createdAt: T - J },                                                       // clé hostile
    },
    cmc_e: [{ id: 'U00015', name: 'BONO A', team: '3' }],
  },
  cmcteams_secret: { codes: {
    U34001: { createdAt: T - 2 * J, expiresAt: T + 600000, used: false, prenom: 'Marc', nom: 'DUPONT' },
    U34009: { createdAt: T - 60000, expiresAt: T + 600000, used: false, prenom: 'Inès', nom: 'NOIR' },               // code seul (fiche pas encore là)
    U34010: { createdAt: T - J, expiresAt: T - 1000, used: false, prenom: 'Expiré', nom: 'X' },
  } },
};
const ecritures = [];
const fetchFb = async (u, o) => {
  const chemin = decodeURIComponent(new URL(u).pathname.replace(/\.json$/, '')).split('/').filter(Boolean);
  const lire = () => chemin.reduce((a, k) => (a == null ? null : a[k]), racine) ?? null;
  if (!o || !o.method || o.method === 'GET') return new Response(JSON.stringify(SAB && /cmc_reg|codes/.test(u) ? null : lire()), { status: 200 });
  if (o.method === 'PATCH') {
    let c = racine; chemin.forEach((k) => { c[k] = c[k] || {}; c = c[k]; }); Object.assign(c, JSON.parse(o.body)); ecritures.push(chemin.join('/')); return new Response(o.body, { status: 200 });
  }
  return new Response('?', { status: 405 });
};
const db = d1(); await schemaCercle(db);
const env = { CERCLE_DB: db, ACCOUNTS: { get: async () => null, put: async () => {} } };
const qui = { kev: { uid: ADMIN, admin: true }, lea: { uid: 'lea-martin', nom: 'Léa Martin', admin: false } };
const outils = { qui: async (r) => qui[r.headers.get('x-test')] || null, now: () => T, fetch: fetchFb, fbToken: async () => 'jeton-test' };
const appel = async (q, chemin, corps, origin) => {
  const r = await handleBoite(new Request('https://kd-mc.com/__boite' + chemin, { method: corps === undefined ? 'GET' : 'POST',
    headers: { 'x-test': q || '', 'content-type': 'application/json', origin: origin || 'https://cmcteams-light.kd-mc.com' }, body: corps === undefined ? undefined : JSON.stringify(corps) }), new URL('https://kd-mc.com/__boite' + chemin), env, outils);
  return Object.assign(await r.json(), { _st: r.status });
};

console.log('\nLes inscriptions en attente, de partout' + (SAB ? '  [SABOTAGE]' : '') + '\n');
/* A — la règle */
const L = enAttente(racine.cmcteams.cmc_reg, racine.cmcteams_secret.codes, racine.cmcteams.cmc_e, T);
ok(JSON.stringify(L.map((x) => x.id)) === '["U34009","U34001"]', 'A1. en attente : la fiche non validée (U34001) et le code seul (U34009) — pas les validées, ni l\'ancienne, ni celle d\'une équipe, ni la clé hostile, ni le code expiré', L.map((x) => x.id));
ok(L.find((x) => x.id === 'U34001')?.code === true && L.find((x) => x.id === 'U34001')?.nom === 'Marc DUPONT' && L.find((x) => x.id === 'U34001')?.matricule === 'U34001', 'A2. chacune dit son nom, son matricule, et si un code a été envoyé', L[1]);

/* B — la boîte de l'admin les donne, sous les messages */
_viderMemo();
const b = await appel('kev', '/admin');
ok(b.ok && Array.isArray(b.inscriptions) && b.inscriptions.length === 2 && b.inscriptionsEtat === 'ok', 'B1. /__boite/admin : les inscriptions en attente arrivent avec les messages', b.inscriptions);
/* C — « /mes » donne à l'admin ses compteurs : la pastille de CHAQUE app (light, CMCteams, portail…) */
_viderMemo();
const mes = await appel('kev', '/mes');
ok(mes.admin === true && mes.inscriptions?.length === 2 && typeof mes.nonLus === 'number', 'C1. dans n\'importe quelle app, le bouton du domaine reçoit les compteurs de l\'admin (pastille)', mes);
ok((await appel('lea', '/mes')).inscriptions === undefined, 'C2. un membre ne voit jamais les inscriptions des autres');
/* D — valider */
ok((await appel('lea', '/admin/valider', { id: 'U34001' }))._st === 401, 'D1. un membre ne peut pas valider');
ok((await appel('kev', '/admin/valider', { id: 'U34001' }, 'https://site-pirate.example'))._st === 403, 'D2. l\'admin, depuis un site tiers : refusé');
ok((await appel('kev', '/admin/valider', { id: '../cmc_pw' }))._st === 400, 'D3. un identifiant qui ressemble à un chemin : refusé');
const v = await appel('kev', '/admin/valider', { id: 'U34001' });
const f = racine.cmcteams.cmc_reg.U34001, c = racine.cmcteams_secret.codes.U34001;
ok(v.ok && v.nom === 'Marc DUPONT' && f.verified === true && f.verifiedByAdmin === true && f.updatedAt === T, 'D4. valider : la fiche passe « validée par Kevin » (la personne entre à sa prochaine connexion)', { v, f });
ok(c.used === true && c.validatedByAdmin === true, 'D5. … et son code est marqué utilisé', c);
ok(ecritures.every((e) => /^cmcteams\/cmc_reg\/U34001$|^cmcteams_secret\/codes\/U34001$/.test(e)), 'D6. rien d\'autre n\'est écrit', ecritures);
_viderMemo();
const b2 = await appel('kev', '/admin');
ok(b2.inscriptions?.map((x) => x.id).join() === 'U34009', 'D7. elle disparaît de la liste', b2.inscriptions);
ok((await appel('kev', '/admin/valider', { id: 'U99999' })).reason === 'inscription_introuvable', 'D8. une inscription inconnue : refus clair');

const rv = await handleBoite(new Request('https://cmcteams-light.kd-mc.com/__boite/ouvrir'), new URL('https://cmcteams-light.kd-mc.com/__boite/ouvrir'), env, outils);
ok(rv.status === 302 && rv.headers.get('location') === 'https://kd-mc.com/#messages', 'E1. « Ouvrir ma boîte » depuis n\'importe quelle app : le domaine mène à la boîte du portail', rv.status);
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
