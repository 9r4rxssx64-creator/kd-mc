/* GARDE — TEMPS RÉEL DES MESSAGES (Kevin 4.10.2026 : « Tout est prévu pour les alertes, notifications, réponses, etc. ? Temps réel tjs partout »).
 * MESURÉ en relisant le code : (1) toutes les notifications de la boîte partageaient le repère `kdmc-cercle` → sur l'iPhone la 2ᵉ REMPLAÇAIT la 1ʳᵉ ;
 * (2) elles ouvraient Lingua (#admin), pas la boîte où l'on répond ; (3) la boîte relisait toutes les 45-90 s.
 * Prouve : chaque message pousse une notification à repère UNIQUE qui ouvre https://kd-mc.com/#messages ; la fraîcheur des sources (5 s D1/Firebase,
 * 60 s KV pour ne pas griller le quota de lectures) ; aucune écriture KV. node services/kdmc-router/notifications-messages.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { lireBoite, _viderMemo, LIMITES } from './boite.js';
import { ADMIN, schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 240) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (q) => st(q), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const kvEcrit = []; const kv = new Map();
const env = { CERCLE_DB: db, KDMC_SSO_SECRET: 's', KDMC_PUSH_URL: 'https://push.exemple', KDMC_PUSH_TOKEN: 'jeton',
  ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kvEcrit.push(k); kv.set(k, v); } },
  ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
const pushes = [];
globalThis.fetch = async (u, o) => {
  if (String(u).startsWith('https://push.exemple')) { pushes.push(JSON.parse(o.body).payload); return new Response('{}', { status: 200 }); }
  return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
};
import { createHmac } from 'node:crypto';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const session = (uid, nom) => { const p = b64u(JSON.stringify({ u: uid, n: nom, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 's').update(p).digest()); };
/* Aucun message sans compte (Kevin 3.10) : chaque dépôt part avec la session d'un compte du domaine. */
const post = (hote, chemin, corps, ip, qui) => mod.fetch(new Request('https://' + hote + chemin, { method: 'POST', headers: { 'content-type': 'application/json', host: hote, origin: 'https://' + hote, 'cf-connecting-ip': ip || '198.51.100.9', cookie: 'kdmc_sso=' + session(qui || 'lolo-martin', qui === 'lea-noir' ? 'Léa Noir' : 'Lolo Martin') }, body: JSON.stringify(corps) }), env, { waitUntil() {} });
const INBOX = 'https://kd-mc.com/#messages';

console.log('\nTemps réel des messages\n');
/* 1. une app dépose un message → push à repère unique qui ouvre la boîte */
pushes.length = 0;
await post('chez-lolo.kd-mc.com', '/__boite/deposer', { nom: 'Lolo', texte: 'Commande 12 prête ?' }, '198.51.100.1');
await post('shops.kd-mc.com', '/__boite/deposer', { nom: 'Léa', texte: 'Ma commande 42' }, '198.51.100.2', 'lea-noir');
ok(pushes.length === 2 && pushes.every((p) => p.url === INBOX), '1a. chaque message d\'une app pousse une notification qui ouvre la BOÎTE (kd-mc.com/#messages), pas une app', pushes);
ok(new Set(pushes.map((p) => p.tag)).size === 2, '1b. repères DIFFÉRENTS : la 2ᵉ notification ne remplace plus la 1ʳᵉ sur l\'iPhone', pushes.map((p) => p.tag));
ok(/chez-lolo/.test(pushes[0].title) && /Commande 12/.test(pushes[0].body), '1c. la notification dit de quelle app et ce qui est écrit');
/* 2. message d'un employé CMCteams */
pushes.length = 0;
await post('cmcteams.kd-mc.com', '/__notify-kevin', { name: 'Jean DUPONT', text: 'Je peux échanger samedi ?' }, '198.51.100.3');
kv.delete('push:kevin_last');   // le frein anti-rafale de 12 s est testé ailleurs : ici deux employés différents
await post('cmcteams.kd-mc.com', '/__notify-kevin', { name: 'Sophie MARTIN', text: 'Bonjour' }, '198.51.100.4');
ok(pushes.length === 2 && pushes.every((p) => p.url === INBOX) && new Set(pushes.map((p) => p.tag)).size === 2, '2. un message d\'employé CMCteams : repère unique, ouvre la boîte (réponse directe)', pushes);
/* 3. câblage : plus aucun repère commun ni lien vers l'app d'origine pour les messages */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(!/tag: 'kdmc-cercle'/.test(W) && !/tag: 'cmc-msg'[,}]/.test(W) && !/tag: 'rotaplan-demo'[,}]/.test(W), '3a. plus de repère commun (kdmc-cercle, cmc-msg, rotaplan-demo) : un message = une notification');
ok((W.match(/url: URL_MESSAGES/g) || []).length >= 4, '3b. Lingua, CMCteams, Rotaplan et l\'arbre ouvrent tous la boîte', (W.match(/url: URL_MESSAGES/g) || []).length);
/* 4. fraîcheur : D1 5 s, KV 60 s */
_viderMemo();
const T0 = 1790000000000;
const sans = { fbToken: async () => '', fetch: async () => new Response('null', { status: 200 }), now: () => T0 };
db._s.prepare('INSERT INTO profils (uid, nom, vu) VALUES (?, ?, ?)').run('zoe', 'Zoé', T0);
db._s.prepare('INSERT INTO messages (de, a, type, corps, cree) VALUES (?, ?, ?, ?, ?)').run('zoe', ADMIN, 'texte', 'premier', T0 - 1000);
kv.set('aud:log', JSON.stringify([{ ts: T0 - 1000, ev: 'new_device', detail: 'iPhone' }]));
let b = await lireBoite(env, sans, T0);
ok(b.messages.some((x) => x.texte === 'premier') && b.messages.some((x) => x.source === 'alertes'), '4a. première lecture : le message et l\'alerte');
db._s.prepare('INSERT INTO messages (de, a, type, corps, cree) VALUES (?, ?, ?, ?, ?)').run('zoe', ADMIN, 'texte', 'second', T0 + 500);
kv.set('aud:log', JSON.stringify([{ ts: T0 + 600, ev: 'geo_anomaly', detail: 'FR → US', asn: 3215 }, { ts: T0 - 1000, ev: 'new_device', detail: 'iPhone' }]));
b = await lireBoite(env, sans, T0 + 2000);
ok(b.messages.find((x) => x.cle === 'lingua:zoe').texte === 'premier', '4b. relecture 2 s après : mémo (plusieurs onglets ne multiplient pas les lectures)');
b = await lireBoite(env, sans, T0 + 6000);
ok(b.messages.find((x) => x.cle === 'lingua:zoe').texte === 'second' && LIMITES.memoMs <= 5000, '4c. 6 s après : le nouveau message de Lingua est là (D1 : quasi temps réel)', b.messages.find((x) => x.cle === 'lingua:zoe'));
ok(!b.messages.some((x) => /FR → US/.test(x.texte)) && LIMITES.memoKvMs >= 60000, '4d. les sources lues en KV (alertes, Rotaplan, arbre) restent à 60 s : 17 lectures par relecture × une page ouverte toute la journée dépasseraient le quota gratuit de lectures KV (100 000/jour)');
b = await lireBoite(env, sans, T0 + 62000);
ok(b.messages.some((x) => /FR → US/.test(x.texte)), '4e. après 60 s : la nouvelle alerte apparaît');
ok(kvEcrit.filter((k) => !/^(push:|dem:|demande)/.test(k)).length === 0, '4f. aucune écriture KV pour lire la boîte', kvEcrit);
/* 5. le portail se rafraîchit vite et à chaque retour */
const P = readFileSync(new URL('../../kdmc-home/kdmc-boite.js', import.meta.url), 'utf8');
ok(/PAS_BANDEAU = 30000, PAS_OUVERT = 12000/.test(P) && /addEventListener\('hashchange'/.test(P) && /visibilitychange/.test(P) && /addEventListener\('focus', rafraichir\)/.test(P), '5. portail : relu toutes les 30 s (12 s fenêtre ouverte), au retour sur l\'onglet, au focus, en ligne, et quand une notification ouvre #messages');
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
