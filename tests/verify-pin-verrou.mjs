#!/usr/bin/env node
/* Verrou d'échecs du code admin sur les robots joignables par workers.dev (audit sécurité 16.10, P2-3 / P2-5) :
   kdmc-monaco, kdmc-outlook, apex-secrets-proxy ; et la page publique de kdmc-uptime réduite aux comptes. 5 mauvais codes depuis une adresse → même le bon code est refusé
   15 min ; une autre adresse n'est pas punie. /health de Monaco ne livre son détail qu'avec le code.
   Sabotage : retirer `if (pinBloque(ip)) return false;` de services/kdmc-monaco/lib.js → rouge. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };
const H = (s) => crypto.createHash('sha256').update(s).digest('hex');
const env = { KDMC_ADMIN_PIN_SHA256: H('424242') };
const req = (pin, ip) => new Request('https://x.workers.dev/config', { method: 'POST', headers: { 'x-apex-pin': pin, 'cf-connecting-ip': ip } });

const { adminOk } = await import(pathToFileURL(path.join(RACINE, 'services/kdmc-monaco/lib.js')).href);
chk(await adminOk(req('424242', '1.1.1.1'), env), 'Monaco : le bon code passe');
for (let i = 0; i < 5; i++) await adminOk(req('000000', '6.6.6.6'), env);
chk(!(await adminOk(req('424242', '6.6.6.6'), env)), 'Monaco : après 5 échecs, même le bon code est refusé depuis cette adresse');
chk(await adminOk(req('424242', '2.2.2.2'), env), 'Monaco : une autre adresse n\'est pas punie');

const outlook = (await import(pathToFileURL(path.join(RACINE, 'services/kdmc-outlook/worker.js')).href + '?t=1')).default;
const kv = new Map(); const envO = { ...env, ACCOUNTS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
const post = (pin, ip) => outlook.fetch(new Request('https://x.workers.dev/config', { method: 'POST', headers: { 'x-apex-pin': pin, 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: '{}' }), envO, {});
for (let i = 0; i < 5; i++) await post('111111', '7.7.7.7');
chk((await post('424242', '7.7.7.7')).status === 403, 'Outlook : après 5 échecs, le bon code est refusé (403)');
chk((await post('424242', '3.3.3.3')).status !== 403, 'Outlook : une autre adresse passe');

const wf = fs.readFileSync(path.join(RACINE, '.github/workflows/sync-apex-secrets-to-cf-worker.yml'), 'utf8');
chk(/async function verifyPin\(req, env\) \{\s*const ip = [^\n]+\n\s*if \(pinBloque\(ip\)\) return false;/.test(wf), 'Relais des clés IA : le verrou est vérifié AVANT le code');
chk(/if \(!ok && req\.headers\.get\('x-apex-pin'\)\) pinEchec\(ip\);/.test(wf), 'Relais des clés IA : chaque échec est compté');

const mon = fs.readFileSync(path.join(RACINE, 'services/kdmc-monaco/worker.js'), 'utf8');
chk(/if \(!\(await adminOk\(request, env\)\)\) return J\(\{ ok: true, worker: 'kdmc-monaco', connected \}\);/.test(mon), 'Monaco /health : sans code, seulement « vivant / connecté »');
chk(/fetch\("\/health",\{cache:"no-store",headers:\$\("pin"\)\.value\.trim\(\)\?await hdr\(\):\{\}\}\)/.test(mon), 'Monaco : la page de réglage envoie le code pour voir le détail');
/* kdmc-uptime : la page publique ne donne plus que des comptes (P2-2). */
{
  const up = (await import(pathToFileURL(path.join(RACINE, 'services/kdmc-uptime/worker.js')).href)).default;
  const etat = { ok: 32, total: 33, ts: 'x', down: ['apex-chat-api'], results: [{ id: 'apex-chat-api', ms: 9, ok: false }] };
  const envU = { UPTIME_RUN_KEY: 'k', ACCOUNTS: { get: async () => etat, put: async () => {} } };
  let r = await (await up.fetch(new Request('https://kdmc-uptime.x/'), envU)).json();
  chk(r.en_panne === 1 && r.total === 33 && !('results' in r) && !JSON.stringify(r).includes('apex-chat-api'), 'Uptime : sans clé, seulement les comptes (aucun nom de service)');
  const cle = crypto.createHash('sha256').update('k:uptime-run').digest('hex');
  r = await (await up.fetch(new Request('https://kdmc-uptime.x/', { headers: { 'x-uptime-key': cle } }), envU)).json();
  chk(Array.isArray(r.results) && r.results.length === 1, 'Uptime : avec la clé, le détail complet');
}
console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
