/* GARDE — la sauvegarde Firebase repart toute seule, une fois par jour, sans cron GitHub (audit 30.09.2026, R7)
 *
 * Mesuré : aucune sauvegarde du 14.08 au 1.10 (47 jours) — les crons GitHub avaient été retirés (suspension du
 * 15.08) et rien ne les avait remplacés. Chaîne mise en place : cron Cloudflare de kdmc-outlook (toutes les 2 h)
 * → `declencherSauvegarde` → repository_dispatch `sauvegarde-quotidienne` → `firebase-backup.yml` au coffre.
 *   1. firebase-backup.yml écoute `repository_dispatch: sauvegarde-quotidienne` et n'a AUCUN `schedule:` ;
 *   2. le worker appelle `declencherSauvegarde` dans `scheduled` ; le robot du coffre pose le secret ;
 *   3. logique (fetch et horloge simulés) : rien avant 03h UTC ; à 04h, UN POST au bon dépôt avec le bon
 *      évènement et le jeton ; un 2e tick le même jour ne POSTe pas ; le lendemain, oui ; GitHub qui refuse
 *      (401) ne marque pas le jour (nouvel essai au tick suivant) ; sans jeton : rien, sans plantage ;
 *   4. SABOTAGE prouvé : sans la marque KV `sauvegarde:jour`, le 2e tick POSTerait → ce garde rougit.
 * node tests/verify-sauvegarde-quotidienne.mjs */
import { readFileSync } from 'node:fs';
import { declencherSauvegarde, SAUVEGARDE_DEPOT, SAUVEGARDE_EVENEMENT } from '../services/kdmc-outlook/worker.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

/* 1-2. les fichiers */
const wf = readFileSync('.github/workflows/firebase-backup.yml', 'utf8');
ok(/repository_dispatch:\s*\n\s*types:\s*\[sauvegarde-quotidienne\]/.test(wf), '1a. firebase-backup.yml écoute repository_dispatch sauvegarde-quotidienne');
ok(!/^\s*schedule:/m.test(wf), '1b. firebase-backup.yml n\'a aucun cron GitHub');
ok(/JSON\.parse/.test(wf) && /t\.length<1024/.test(wf), '1c. firebase-backup.yml refuse une archive vide ou tronquée');
const worker = readFileSync('services/kdmc-outlook/worker.js', 'utf8');
const sched = worker.slice(worker.indexOf('async scheduled('), worker.indexOf('async scheduled(') + 1500);
ok(/declencherSauvegarde\(env\)/.test(sched), '2a. le cron du worker appelle declencherSauvegarde');
const arme = readFileSync('.github/workflows/coffre-arme-sauvegarde.yml', 'utf8');
ok(/wrangler secret put GITHUB_SAUVEGARDE_TOKEN/.test(arme) && /secrets\.APEX_GITHUB_PAT/.test(arme) && /workflow_dispatch/.test(arme) && !/schedule:/.test(arme), '2b. le robot du coffre pose GITHUB_SAUVEGARDE_TOKEN depuis APEX_GITHUB_PAT, à la main, sans cron');
ok(SAUVEGARDE_DEPOT === '9r4rxssx64-creator/CMCteams' && SAUVEGARDE_EVENEMENT === 'sauvegarde-quotidienne', '2c. la cible est le coffre et l\'évènement celui qu\'écoute le robot');

/* 3. logique */
const kv = new Map(); const appels = [];
const env = { GITHUB_SAUVEGARDE_TOKEN: 'ghp_test', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
let statut = 204;
const faux = async (url, init) => { appels.push({ url, init }); return { status: statut }; };
const a = await declencherSauvegarde(env, new Date('2026-10-02T02:30:00Z'), faux);
ok(!a.fait && appels.length === 0, `3a. 02h30 UTC → rien (${a.raison})`);
const b = await declencherSauvegarde(env, new Date('2026-10-02T04:00:00Z'), faux);
const corps = appels[0] && JSON.parse(appels[0].init.body);
ok(b.fait && appels.length === 1 && appels[0].url === 'https://api.github.com/repos/9r4rxssx64-creator/CMCteams/dispatches' && appels[0].init.method === 'POST' && appels[0].init.headers.authorization === 'Bearer ghp_test' && corps.event_type === 'sauvegarde-quotidienne' && corps.client_payload.jour === '2026-10-02',
  '3b. 04h UTC → UN POST au coffre, évènement sauvegarde-quotidienne, jeton Bearer, jour dans la charge', JSON.stringify(appels[0]));
const c = await declencherSauvegarde(env, new Date('2026-10-02T06:00:00Z'), faux);
ok(!c.fait && appels.length === 1, `3c. 2e tick du même jour → pas de 2e POST (${c.raison})`);
const d = await declencherSauvegarde(env, new Date('2026-10-03T04:00:00Z'), faux);
ok(d.fait && appels.length === 2 && JSON.parse(appels[1].init.body).client_payload.jour === '2026-10-03', '3d. le lendemain → nouveau POST');
statut = 401;
const e = await declencherSauvegarde(env, new Date('2026-10-04T04:00:00Z'), faux);
ok(!e.fait && /401/.test(e.raison) && kv.get('sauvegarde:jour') === '2026-10-03', '3e. GitHub refuse (401) → le jour n\'est pas marqué, nouvel essai au tick suivant');
statut = 204;
const f = await declencherSauvegarde(env, new Date('2026-10-04T06:00:00Z'), faux);
ok(f.fait && kv.get('sauvegarde:jour') === '2026-10-04', '3f. tick suivant → le POST part et le jour est marqué');
const g = await declencherSauvegarde({ ACCOUNTS: env.ACCOUNTS }, new Date('2026-10-05T04:00:00Z'), faux);
ok(!g.fait && /jeton absent/.test(g.raison) && appels.length === 4, '3g. sans jeton → rien, sans plantage');
ok(kv.size === 1, `3h. une seule clé KV pour tout ça (${kv.size}) — 1 écriture par jour`);

/* 4. sabotage : sans la marque KV, un 2e tick POSTerait */
const sansKv = { GITHUB_SAUVEGARDE_TOKEN: 'ghp_test' };
await declencherSauvegarde(sansKv, new Date('2026-10-06T04:00:00Z'), faux); await declencherSauvegarde(sansKv, new Date('2026-10-06T06:00:00Z'), faux);
ok(appels.length === 6, '4. SABOTAGE (pas de KV) : deux ticks = deux POST — c\'est bien la marque KV qui tient le « une fois par jour »');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
