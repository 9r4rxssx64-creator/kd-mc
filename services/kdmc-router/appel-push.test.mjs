/* GARDE — 📞 Bee t'appelle MÊME APP FERMÉE (notification à l'heure choisie). Hors ligne : D1 sur SQLite,
   service de notifications simulé, Durable Object simulé.
   1. la clé publique vient du service qui SIGNE (son /health) ;
   2. abonnement : origine du domaine seulement ; adresse d'envoi = un service de notifications connu (pas
      d'envoi vers n'importe quelle adresse) ; heure, fuseau, langue validés ; l'horloge est armée ;
   3. l'heure est celle du TÉLÉPHONE (fuseau IANA, été comme hiver), fenêtre de 45 min, une fois par jour ;
   4. un passage d'horloge envoie « 📞 Bee t'appelle — Ta petite leçon d'anglais… » au bon abonné, le note AVANT
      l'envoi, ne resonne pas ; abonnement mort (410) effacé ; échecs comptés ;
   5. appel fait / refusé dans l'app → pas de notification ce jour-là ; désabonnement → effacé ;
   6. l'horloge se réarme tant qu'il reste des abonnés, s'arrête sinon ; 0 écriture KV.
   SABOTAGE prouvé à la main : retirer `ligne.envoye === l.date` de aSonner → (4) rougit (double sonnerie).
   node services/kdmc-router/appel-push.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { handleAppelPush, tickAppels, aSonner, maintenantLocal, AppelReveil, REVEIL_MS } from './appel-push.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 260) : '')); } };
function d1() { const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { s.prepare(sql).run(...p); return {}; } });
  return { prepare: (q) => st(q), _s: s }; }
const envois = []; let statutPush = 201;
globalThis.fetch = async (u, init) => { u = String(u);
  if (u.endsWith('/health')) return new Response(JSON.stringify({ ok: true, vapidPublic: 'CLE_PUBLIQUE_TEST' }));
  if (u.endsWith('/web-push')) { envois.push({ auth: init.headers.authorization, corps: JSON.parse(init.body) }); return new Response('{}', { status: statutPush }); }
  return new Response('inattendu', { status: 599 }); };
const armees = []; let kvEcrit = 0;
const env = { CERCLE_DB: d1(), KDMC_PUSH_URL: 'https://push.test', KDMC_PUSH_TOKEN: 'jeton',
  ACCOUNTS: { get: async () => null, put: async () => { kvEcrit++; } },
  APPEL_REVEIL: { idFromName: (n) => n, get: () => ({ fetch: async (u) => { armees.push(u); return new Response('{}'); } }) } };
const req = (chemin, corps, origin = 'https://lingua.kd-mc.com', m = 'POST') => handleAppelPush(new Request('https://lingua.kd-mc.com' + chemin,
  { method: m, headers: Object.assign({ 'content-type': 'application/json' }, origin ? { origin } : {}), body: m === 'GET' ? undefined : JSON.stringify(corps) }), new URL('https://lingua.kd-mc.com' + chemin), env);
const SUB = (n) => ({ endpoint: 'https://web.push.apple.com/QW' + n, keys: { p256dh: 'BP' + n, auth: 'AU' + n } });
const lire = () => env.CERCLE_DB._s.prepare('SELECT * FROM appel_push ORDER BY cree').all();

/* 1 */
let j = await (await req('/__lingua/appel-cle', null, null, 'GET')).json();
ok(j.ok && j.cle === 'CLE_PUBLIQUE_TEST', '1. clé publique lue sur le service qui signe', JSON.stringify(j));
/* 2 */
let r = await req('/__lingua/appel-abonnement', { sub: SUB(1), heure: '18:30', tz: 'Europe/Paris', langue: 'Anglais' }, 'https://pirate.example');
ok(r.status === 403, '2. abonnement depuis un site extérieur → refusé');
r = await req('/__lingua/appel-abonnement', { sub: { endpoint: 'https://kd-mc.com/__admin/x', keys: { p256dh: 'a', auth: 'b' } }, heure: '18:30', tz: 'Europe/Paris' });
ok(r.status === 400, '2b. adresse d\'envoi qui n\'est pas un service de notifications → refusée (pas de relais vers n\'importe où)');
ok((await req('/__lingua/appel-abonnement', { sub: SUB(1), heure: '25:00', tz: 'Europe/Paris' })).status === 400, '2c. heure invalide → refusée');
ok((await req('/__lingua/appel-abonnement', { sub: SUB(1), heure: '18:30', tz: 'Mars/Olympus' })).status === 400, '2d. fuseau inconnu → refusé');
ok((await req('/__lingua/appel-abonnement', { sub: SUB(1), heure: '18:30', tz: 'Europe/Paris', langue: '<script>' })).status === 400, '2e. langue bizarre → refusée');
j = await (await req('/__lingua/appel-abonnement', { sub: SUB(1), heure: '18:30', tz: 'Europe/Paris', langue: 'Anglais', mascotte: 'bee' })).json();
ok(j.ok && lire().length === 1 && armees.length === 1, '2f. abonnement valide → enregistré (D1) et horloge armée', JSON.stringify(j));
await req('/__lingua/appel-abonnement', { sub: SUB(2), heure: '07:00', tz: 'America/New_York', langue: 'Japonais', mascotte: 'donkey' });
await req('/__lingua/appel-abonnement', { sub: SUB(1), heure: '18:30', tz: 'Europe/Paris', langue: 'Anglais', mascotte: 'bee' });
ok(lire().length === 2, '2g. ré-abonnement du même téléphone → mis à jour, pas de doublon');
/* 3 */
const ete = Date.parse('2026-07-10T16:30:00Z'), hiver = Date.parse('2026-12-10T17:30:00Z');   // 18:30 à Paris (UTC+2 / UTC+1)
const l1 = { heure: '18:30', tz: 'Europe/Paris', envoye: null };
ok(maintenantLocal('Europe/Paris', ete).minutes === 18 * 60 + 30 && maintenantLocal('Europe/Paris', hiver).minutes === 18 * 60 + 30, '3. heure locale juste en été (UTC+2) ET en hiver (UTC+1)');
ok(aSonner(l1, ete) && aSonner(l1, hiver), '3b. 18:30 à Paris → ça sonne, été comme hiver');
ok(!aSonner(l1, ete - 60e3) && aSonner(l1, ete + 44 * 60e3) && !aSonner(l1, ete + 46 * 60e3), '3c. pas avant l\'heure ; jusqu\'à 45 min après (téléphone éteint) ; pas au-delà');
ok(!aSonner(Object.assign({}, l1, { envoye: '2026-07-10' }), ete), '3d. déjà sonné aujourd\'hui → plus rien');
/* 4 */
envois.length = 0;
let reste = await tickAppels(env, ete + 2 * 60e3);
ok(envois.length === 1 && envois[0].auth === 'Bearer jeton' && envois[0].corps.subscription.endpoint.endsWith('QW1'), '4. passage d\'horloge à 18:32 Paris → UNE notification, au bon téléphone, avec le jeton du routeur', JSON.stringify(envois.map((e) => e.corps.subscription.endpoint)));
const pl = (envois[0] || {}).corps?.payload || {};
ok(pl.title === "📞 Bee t'appelle" && /petite leçon d'anglais au téléphone/.test(pl.body) && pl.url === 'https://lingua.kd-mc.com/#appel' && pl.requireInteraction === true, '4b. « 📞 Bee t\'appelle — Ta petite leçon d\'anglais… », toucher → #appel', JSON.stringify(pl));
ok(lire().find((x) => x.id && x.sub.includes('QW1')).envoye === '2026-07-10' && reste === 2, '4c. noté envoyé (date locale) ; 2 abonnés restants');
envois.length = 0; await tickAppels(env, ete + 5 * 60e3);
ok(envois.length === 0, '4d. passage suivant → ne resonne PAS le même jour');
/* New York 07:00 = 11:00 UTC le 10.07 (UTC-4) → Bourricot, japonais ; mort (410) → effacé */
statutPush = 410; envois.length = 0;
reste = await tickAppels(env, Date.parse('2026-07-10T11:01:00Z'));
ok(envois.length === 1 && envois[0].corps.payload.title === "📞 Bourricot t'appelle" && /de japonais/.test(envois[0].corps.payload.body), '4e. New York 07:01 → Bourricot, « leçon de japonais »', JSON.stringify(envois.map((e) => e.corps.payload)));
ok(reste === 1 && lire().length === 1, '4f. abonnement mort (410) → effacé');
statutPush = 500; await req('/__lingua/appel-abonnement', { sub: SUB(3), heure: '12:00', tz: 'UTC', langue: 'Italien' });
await tickAppels(env, Date.parse('2026-07-11T12:00:30Z'));
ok(lire().find((x) => x.sub.includes('QW3')).echecs === 1, '4g. panne du service → échec compté (effacé seulement après 20)');
statutPush = 201;
/* 5 */
const maint = new Date(), hh = String(maint.getUTCHours()).padStart(2, '0') + ':' + String(maint.getUTCMinutes()).padStart(2, '0');
await req('/__lingua/appel-abonnement', { sub: SUB(4), heure: hh, tz: 'UTC', langue: 'Espagnol' });
j = await (await req('/__lingua/appel-fait', { sub: SUB(4) })).json();
envois.length = 0; await tickAppels(env, Date.now());
ok(j.ok && j.abonne && !envois.some((e) => e.corps.subscription.endpoint.endsWith('QW4')), '5. appel déjà fait dans l\'app aujourd\'hui (heure réelle) → pas de notification', JSON.stringify(j) + ' ' + envois.length);
env.CERCLE_DB._s.prepare("UPDATE appel_push SET envoye = NULL WHERE sub LIKE '%QW4%'").run(); envois.length = 0; await tickAppels(env, Date.now());
ok(envois.some((e) => e.corps.subscription.endpoint.endsWith('QW4')), '5a. (contre-épreuve : sans « appel fait », la même minute sonne bien)');
await req('/__lingua/appel-abonnement', { sub: SUB(3), actif: false });
ok(!lire().some((x) => x.sub.includes('QW3')), '5b. désabonnement → effacé');
/* 6 */
let alarme = null; const state = { storage: { getAlarm: async () => alarme, setAlarm: async (t) => { alarme = t; } } };
const horloge = new AppelReveil(state, env);
await horloge.fetch(); ok(alarme && alarme - Date.now() <= 31e3, '6. horloge armée à la 1re demande');
alarme = null; await horloge.alarm(); ok(alarme && Math.abs(alarme - Date.now() - REVEIL_MS) < 2e3, '6b. reste des abonnés → réveil dans 3 min');
env.CERCLE_DB._s.prepare('DELETE FROM appel_push').run(); alarme = null; await horloge.alarm();
ok(alarme === null, '6c. plus aucun abonné → l\'horloge s\'arrête (0 réveil inutile)');
ok(kvEcrit === 0, '6d. 0 écriture KV');
console.log(`Appel push test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
