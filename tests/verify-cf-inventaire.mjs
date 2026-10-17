#!/usr/bin/env node
/* L'INVENTAIRE CLOUDFLARE RESTE EN LECTURE SEULE, MUET SUR LES SECRETS, ET VOIT LES FUITES (Kevin 17.10.2026 : « vérifie que tout
   ce qui est sur Cloudflare, sur mes deux comptes, soit sécurisé, confidentiel ; fais le tri »).
   Faux Cloudflare local (aucun réseau vers Cloudflare) :
     1. aucune requête autre que GET (l'outil ne peut rien modifier ni supprimer) ;
     2. la clé n'apparaît jamais dans la sortie ;
     3. il signale : worker ouvert sur workers.dev, stockage R2 public, SSL faible, jeton sans date d'expiration ;
     4. mode --public (journal du dépôt public) : seulement totaux + points à traiter, aucune ligne de liste (KV, membres, zones…) ;
     5. le robot public le lance en --public, à la main, et n'a ni cron ni écriture.
   Sabotage : retirer le filtre --public → les noms de KV apparaissent → rouge (cas 4). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };

const A = 'ffaca6f306a953f82834db0970f300f0';
const j = (r, info) => JSON.stringify({ success: true, result: r, result_info: info || { total_count: Array.isArray(r) ? r.length : 1, total_pages: 1 } });
const ROUTES = {
  '/user/tokens/verify': j({ status: 'active', expires_on: '2026-10-18T00:00:00Z' }),
  '/accounts': j([{ id: A, name: 'Kevin' }]),
  [`/accounts/${A}/pages/projects`]: j([]),
  [`/accounts/${A}/workers/subdomain`]: j({ subdomain: 'exemple-invalide' }),
  [`/accounts/${A}/workers/scripts`]: j([{ id: 'vieux-worker', modified_on: '2026-07-01T00:00:00Z' }]),
  [`/accounts/${A}/workers/scripts/vieux-worker/subdomain`]: j({ enabled: true }),
  [`/accounts/${A}/storage/kv/namespaces`]: j([{ title: 'NOM_KV_SECRET_DE_LISTE' }]),
  [`/accounts/${A}/d1/database`]: j([]),
  [`/accounts/${A}/r2/buckets`]: j({ buckets: [{ name: 'photos' }] }),
  [`/accounts/${A}/r2/buckets/photos/domains/managed`]: j({ enabled: true, domain: 'pub-x.r2.dev' }),
  [`/accounts/${A}/members`]: j([{ user: { email: 'kevin@exemple.org' }, status: 'accepted', roles: [{ name: 'Super Administrator' }] }]),
  '/zones': j([{ id: 'z1', name: 'exemple.org', status: 'active' }]),
  '/zones/z1/dns_records': j([{ type: 'A', name: 'www.exemple.org', content: '192.0.2.1', proxied: true }]),
  '/zones/z1/settings/ssl': j({ value: 'flexible' }),
  '/user/tokens': j([{ name: 'vieille-cle', status: 'active', expires_on: null, issued_on: '2026-01-01' }]),
};
const methodes = [];
const srv = http.createServer((q, r) => {
  methodes.push(q.method);
  const u = new URL(q.url, 'http://x'); const b = ROUTES[u.pathname];
  r.writeHead(b ? 200 : 404, { 'content-type': 'application/json' });
  r.end(b || JSON.stringify({ success: false, errors: [{ message: 'introuvable' }] }));
});
await new Promise((o) => srv.listen(0, '127.0.0.1', o));
const CLE = 'CLE-TEST-NE-DOIT-JAMAIS-SORTIR-0123456789';
const lancer = (extra) => new Promise((ok2) => {
  const p = spawn(process.execPath, [path.join(R, 'tools/cloudflare/inventaire-compte.mjs'), ...extra], { env: { ...process.env, CLOUDFLARE_API_TOKEN: CLE, CF_API_BASE: `http://127.0.0.1:${srv.address().port}`, CF_SONDER: '0' } });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; }); p.on('close', () => ok2(out));
});
const complet = await lancer([]);
const pub = await lancer(['--public']);
srv.close();

chk(methodes.length > 5 && methodes.every((m) => m === 'GET'), `1. lecture seule : ${methodes.length} requêtes, toutes GET`);
chk(!complet.includes(CLE) && !pub.includes(CLE), '2. la clé n\'apparaît jamais dans la sortie');
chk(/workers\.dev/.test(complet) && /R2 « photos » a son adresse publique/.test(complet) && /SSL « flexible »/.test(complet) && /SANS date d'expiration/.test(complet), '3. signale workers.dev ouvert, R2 public, SSL faible, jeton sans fin');
chk(!/NOM_KV_SECRET_DE_LISTE|kevin@|k…@exemple|192\.0\.2\.1/.test(pub) && /résumé/.test(pub) && /point\(s\) à traiter/.test(pub), '4. mode --public : totaux + points à traiter, aucune liste détaillée');
chk(!/kevin@exemple\.org/.test(complet), '4b. même en mode complet, les e-mails des membres sont masqués');
const wf = fs.readFileSync(path.join(R, '.github/workflows/cloudflare-inventaire.yml'), 'utf8');
chk(/--public/.test(wf) && /workflow_dispatch/.test(wf) && !/^\s*schedule:/m.test(wf) && /contents: read/.test(wf), '5. robot public : --public, à la main, sans cron, lecture seule');

console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
