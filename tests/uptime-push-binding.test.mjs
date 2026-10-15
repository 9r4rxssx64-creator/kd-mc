#!/usr/bin/env node
/**
 * Garde : la sonde envoie ses notifications par le LIEN INTERNE (Service Binding), pas par l'URL workers.dev.
 *
 * Mesuré le 15.10.2026 (run kd-mc 38750076367, premier passage avec quelque chose à signaler) :
 * « push NON envoyé : HTTP 404 error code: 1042 ». Un Worker qui ne vit que sur *.workers.dev ne peut pas
 * appeler un autre Worker du même compte par son URL workers.dev. Apex Chat avait déjà eu ce problème
 * (binding PUSH_WORKER) ; la sonde non. Le push n'étant tenté que lors d'une panne ou d'un retour,
 * l'échec était resté invisible.
 *
 * Prouve : (1) wrangler.toml déclare le lien APEX_PUSH → apex-push-worker ; (2) avec le lien, notify passe
 * par lui (jamais par fetch global) avec le bon contrat /send-all + Bearer ; (3) sans lien, repli sur l'URL ;
 * (4) sans jeton, rien ne part.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { notify } from '../services/kdmc-uptime/worker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
let fail = 0;
const check = (cond, m) => { if (cond) { ok++; console.log('  OK   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const toml = readFileSync(join(ROOT, 'services/kdmc-uptime/wrangler.toml'), 'utf8');
check(/\[\[services\]\]\s*\nbinding\s*=\s*"APEX_PUSH"\s*\nservice\s*=\s*"apex-push-worker"/.test(toml), 'wrangler.toml : lien APEX_PUSH → apex-push-worker déclaré');

let globalAppels = 0;
globalThis.fetch = async (u) => { globalAppels++; return new Response('error code: 1042', { status: 404 }); };

let vu = null;
const lien = { async fetch(u, init) { vu = { u: String(u), init }; return new Response('{"ok":true}', { status: 200 }); } };
let r = await notify({ APEX_PUSH: lien, KDMC_PUSH_URL: 'https://apex-push-worker.x.workers.dev', KDMC_PUSH_TOKEN: 'jeton' }, 'titre', 'corps');
check(r.sent === true, 'avec le lien : notification envoyée');
check(globalAppels === 0, 'avec le lien : aucun appel par l\'URL workers.dev (celui qui donne 1042)');
check(vu && /\/send-all$/.test(vu.u), 'contrat apex-push-worker : POST /send-all');
check(vu && vu.init.headers.authorization === 'Bearer jeton', 'jeton transmis en Bearer');
check(vu && JSON.parse(vu.init.body).payload.title === 'titre', 'corps { payload: { title, … } }');

r = await notify({ KDMC_PUSH_URL: 'https://apex-push-worker.x.workers.dev', KDMC_PUSH_TOKEN: 'jeton' }, 't', 'c');
check(globalAppels === 1 && r.sent === false && r.code === 404, 'sans lien : repli sur l\'URL, et l\'échec 1042 est bien rapporté (jamais caché)');

r = await notify({ APEX_PUSH: lien }, 't', 'c');
check(r.sent === false && /non configuré/.test(r.why), 'sans jeton : rien ne part');

console.log(`\n${ok} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
