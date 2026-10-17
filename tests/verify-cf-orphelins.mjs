#!/usr/bin/env node
/* ÉTEINDRE LES COPIES ORPHELINES DE L'ANCIEN COMPTE CLOUDFLARE SANS JAMAIS TOUCHER AU BON (Kevin 17.10.2026 : « rapatrie tout sur la
   même adresse… mets tout en place correctement »). Faux Cloudflare local :
     1. essai à blanc (sans --confirmer=oui) : AUCUNE requête DELETE ;
     2. clé qui ne voit pas l'ancien compte (= clé du compte principal) → refus, rien supprimé ;
     3. avec --confirmer=oui : seuls les workers de la liste fermée dont la copie principale répond sont supprimés ;
        un worker hors liste n'est jamais touché ; une copie principale muette (404) → l'ancien est GARDÉ ;
     4. la clé n'apparaît jamais dans la sortie.
   Sabotage : retirer la garde « copie principale » → l'orphelin sans copie est supprimé → rouge (cas 3). */
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };
const ANCIEN = 'ffaca6f306a953f82834db0970f300f0', PRINC = '425377ca00000000000000000000beef';
let comptes = [ANCIEN];
const supprimes = []; const methodes = [];
const j = (r) => JSON.stringify({ success: true, result: r });
const srv = http.createServer((q, r) => {
  methodes.push(q.method);
  const u = new URL(q.url, 'http://x');
  const m = u.pathname.match(/^\/sonde\/([a-z0-9-]+)\/health$/);
  if (m) { r.writeHead(m[1] === 'kdmc-live' ? 404 : 200); return r.end('ok'); }   /* kdmc-live : copie principale « absente » */
  r.setHeader('content-type', 'application/json');
  if (u.pathname === '/accounts') return r.end(j(comptes.map((id) => ({ id }))));
  if (u.pathname === `/accounts/${ANCIEN}/workers/scripts` && q.method === 'GET') return r.end(j(['coffre-r2', 'kdmc-live', 'kdmc-proxy', 'worker-a-moi-pas-dans-la-liste'].map((id) => ({ id }))));
  const d = u.pathname.match(new RegExp(`^/accounts/${ANCIEN}/workers/scripts/([a-z0-9-]+)$`));
  if (d && q.method === 'DELETE') { supprimes.push(d[1]); return r.end(j(null)); }
  if (/storage\/kv|d1\/database/.test(u.pathname)) return r.end(j([]));
  if (/r2\/buckets/.test(u.pathname)) return r.end(j({ buckets: [] }));
  r.end(JSON.stringify({ success: false, errors: [{ message: 'introuvable' }] }));
});
await new Promise((o) => srv.listen(0, '127.0.0.1', o));
const B = `http://127.0.0.1:${srv.address().port}`;
const CLE = 'CLE-ANCIEN-COMPTE-NE-DOIT-PAS-SORTIR-42';
const lancer = (extra) => new Promise((o) => {
  const p = spawn(process.execPath, [path.join(R, 'tools/cloudflare/orphelins-supprimer.mjs'), ...extra], { env: { ...process.env, CLOUDFLARE_API_TOKEN: CLE, CF_API_BASE: B, CF_SONDE_BASE: `${B}/sonde` } });
  let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; }); p.on('close', (code) => o({ out, code }));
});

const blanc = await lancer([]);
chk(!methodes.includes('DELETE') && /Essai à blanc/.test(blanc.out), '1. essai à blanc : aucune suppression');
comptes = [PRINC];
const mauvais = await lancer(['--confirmer=oui']);
chk(mauvais.code === 1 && supprimes.length === 0, '2. clé du compte principal → refus, rien supprimé');
comptes = [ANCIEN];
const vrai = await lancer(['--confirmer=oui']);
chk(JSON.stringify(supprimes.sort()) === JSON.stringify(['coffre-r2', 'kdmc-proxy']), `3. supprimés : ${supprimes.join(', ')} (liste fermée + copie principale vivante ; kdmc-proxy = démo sans copie)`);
chk(!supprimes.includes('worker-a-moi-pas-dans-la-liste') && /hors liste/.test(vrai.out), '3b. un worker hors liste n\'est jamais touché (et il est signalé)');
chk(!supprimes.includes('kdmc-live') && /kdmc-live : copie du compte principal ne répond pas/.test(vrai.out), '3c. copie principale muette → l\'ancien est GARDÉ');
chk(![blanc.out, mauvais.out, vrai.out].some((o) => o.includes(CLE)), '4. la clé n\'apparaît jamais dans la sortie');
srv.close();
console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
