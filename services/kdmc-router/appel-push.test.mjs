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
import { handleAppelPush, tickAppels, aSonner, maintenantLocal, AppelReveil, REVEIL_MS, planValide } from './appel-push.js';
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
ok(lire().find((x) => x.id && x.sub.includes('QW1')).envoye === '2026-07-10|18:30' && reste === 2, '4c. noté envoyé (date locale) ; 2 abonnés restants');
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
/* 7. CHACUN SES HORAIRES (Kevin 4.10) */
const sam = Date.parse('2026-07-11T08:05:00Z'), lun = Date.parse('2026-07-13T16:31:00Z');   // samedi 10:05 / lundi 18:31 à Paris
const plan = JSON.stringify([{ jours: [1, 2, 3, 4, 5], heure: '18:30' }, { jours: [6, 7], heure: '10:00' }]);
const p1 = { tz: 'Europe/Paris', heure: '18:30', plan, envoye: null };
ok(maintenantLocal('Europe/Paris', sam).jour === 6 && maintenantLocal('Europe/Paris', lun).jour === 1, '7. jour de la semaine local juste (samedi = 6, lundi = 1)');
ok(aSonner(p1, sam) === '10:00' && aSonner(p1, Date.parse('2026-07-11T16:31:00Z')) === null && aSonner(p1, lun) === '18:30', '7b. semaine 18:30 / week-end 10:00 → samedi 10:05 sonne, samedi 18:31 non, lundi 18:31 oui');
const deux = { tz: 'UTC', heure: '07:00', plan: JSON.stringify([{ jours: [1, 2, 3, 4, 5, 6, 7], heure: '07:00' }, { jours: [1, 2, 3, 4, 5, 6, 7], heure: '18:30' }]), envoye: '2026-07-13|07:00' };
ok(aSonner(deux, Date.parse('2026-07-13T07:05:00Z')) === null && aSonner(deux, Date.parse('2026-07-13T18:32:00Z')) === '18:30', '7c. deux créneaux le même jour : le matin déjà sonné, le soir sonne quand même');
ok(aSonner(Object.assign({}, p1, { pause: '2026-07-13' }), lun) === null && aSonner(Object.assign({}, p1, { pause: '2026-07-12' }), lun) === '18:30', '7d. pause « jusqu\'au 13 » → rien le 13 ; pause finie la veille → ça sonne');
ok(planValide([{ jours: [8, 0], heure: '18:30' }]) === null && planValide([{ jours: [1], heure: '24:00' }]) === null && planValide(new Array(5).fill({ jours: [1], heure: '10:00' })) === null && JSON.stringify(planValide([{ jours: [5, 1, 1], heure: '09:15' }])) === '[{"jours":[1,5],"heure":"09:15"}]', '7e. saisies vérifiées : jours 1-7, heure valide, 4 créneaux max ; doublons triés');
let rr = await req('/__lingua/appel-abonnement', { sub: SUB(5), plan: [{ jours: [6, 7], heure: '10:00' }, { jours: [1, 2, 3, 4, 5], heure: '18:30' }], pause: '2026-08-01', tz: 'Europe/Paris', langue: 'Anglais' });
let jj = await rr.json(); const l5 = lire().find((x) => x.sub.includes('QW5'));
ok(jj.ok && l5 && JSON.parse(l5.plan).length === 2 && l5.pause === '2026-08-01' && l5.heure === '10:00', '7f. abonnement avec 2 créneaux + pause → enregistré', JSON.stringify(jj));
ok((await req('/__lingua/appel-abonnement', { sub: SUB(5), plan: [{ jours: [], heure: '10:00' }], tz: 'Europe/Paris' })).status === 400 && (await req('/__lingua/appel-abonnement', { sub: SUB(5), plan: [{ jours: [1], heure: '10:00' }], pause: 'demain', tz: 'Europe/Paris' })).status === 400, '7g. créneau sans jour ou pause bizarre → refusés');
/* appel fait à 17:00 : couvre le créneau de 18:30 (dans les 2 h) mais pas celui de 21:00 */
const now7 = new Date(), hh7 = (m) => { const t = new Date(now7.getTime() + m * 60e3); return String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0'); };
const jourUTC = ((now7.getUTCDay() + 6) % 7) + 1;
if (now7.getUTCHours() < 20) {
  await req('/__lingua/appel-abonnement', { sub: SUB(6), plan: [{ jours: [jourUTC], heure: hh7(90) }, { jours: [jourUTC], heure: hh7(200) }], tz: 'UTC', langue: 'Anglais' });
  const jf = await (await req('/__lingua/appel-fait', { sub: SUB(6) })).json();
  ok(jf.couverts && jf.couverts.length === 1 && jf.couverts[0] === hh7(90), '7h. « appel fait » couvre le créneau proche (dans 1 h 30) mais pas celui dans 3 h 20', JSON.stringify(jf));
} else ok(true, '7h. (sauté : trop tard dans la journée UTC pour placer deux créneaux)');

/* 7i. la table existe DÉJÀ en ligne (version 3.10, sans plan ni pause) : les colonnes s'ajoutent toutes seules */
{
  const vieux = d1();
  vieux._s.prepare(`CREATE TABLE appel_push (id TEXT PRIMARY KEY, sub TEXT NOT NULL, heure TEXT NOT NULL, tz TEXT NOT NULL, mascotte TEXT, langue TEXT, envoye TEXT, cree INTEGER, echecs INTEGER DEFAULT 0)`).run();
  vieux._s.prepare("INSERT INTO appel_push (id, sub, heure, tz, mascotte, langue, cree) VALUES ('ancien', '{\"endpoint\":\"https://web.push.apple.com/OLD\",\"keys\":{\"p256dh\":\"a\",\"auth\":\"b\"}}', '18:30', 'Europe/Paris', 'bee', 'Anglais', 1)").run();
  const envV = Object.assign({}, env, { CERCLE_DB: vieux });
  const rV = await handleAppelPush(new Request('https://lingua.kd-mc.com/__lingua/appel-abonnement', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://lingua.kd-mc.com' },
    body: JSON.stringify({ sub: SUB(9), plan: [{ jours: [6, 7], heure: '10:00' }], tz: 'Europe/Paris', langue: 'Anglais' }) }), new URL('https://lingua.kd-mc.com/__lingua/appel-abonnement'), envV);
  const cols = vieux._s.prepare('PRAGMA table_info(appel_push)').all().map((c) => c.name);
  envois.length = 0; await tickAppels(envV, Date.parse('2026-07-10T16:31:00Z'));
  ok((await rV.json()).ok && cols.includes('plan') && cols.includes('pause') && envois.some((e) => e.corps.subscription.endpoint.endsWith('OLD')), '7i. table de la version d\'avant : colonnes plan/pause ajoutées, l\'ancien abonné (heure seule) sonne toujours', JSON.stringify(cols));
}

/* 6 */
let alarme = null; const state = { storage: { getAlarm: async () => alarme, setAlarm: async (t) => { alarme = t; } } };
const horloge = new AppelReveil(state, env);
await horloge.fetch(); ok(alarme && alarme - Date.now() <= 31e3, '6. horloge armée à la 1re demande');
alarme = null; await horloge.alarm(); ok(alarme && Math.abs(alarme - Date.now() - REVEIL_MS) < 2e3, '6b. reste des abonnés → réveil dans 3 min');
env.CERCLE_DB._s.prepare('DELETE FROM appel_push').run(); alarme = null; await horloge.alarm();
ok(alarme === null, '6c. plus aucun abonné → l\'horloge s\'arrête (0 réveil inutile)');
ok(kvEcrit === 0, '6d. 0 écriture KV');
console.log(`Appel push test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
