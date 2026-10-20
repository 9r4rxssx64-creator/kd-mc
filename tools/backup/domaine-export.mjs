#!/usr/bin/env node
/* SAUVEGARDE DU DOMAINE — le répertoire des comptes (KV ACCOUNTS) en un seul fichier JSON (Kevin 20.10.2026 : « revérifie les sauvegardes, partout »).
   Constat du 20.10 : Firebase (arbre, CMCteams, Apex…) est sauvegardé chaque nuit, mais le KV ACCOUNTS (comptes, codes hachés, sessions) n'avait
   AUCUNE sauvegarde, et la base D1 d'Apex Chat n'était plus sauvegardée depuis le 14.08. Ce script est la partie « KV » ; les D1 passent par wrangler
   (voir .github/workflows/domaine-backup.yml). Lecture seule : liste les clés puis les lit par paquets de 100 (la lecture est gratuite, 0 écriture).
   Les clés volatiles (compteurs de visite, plafonds, verrous horaires) ne valent pas d'être sauvegardées : exclues par préfixe.
   Env : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NS (id du KV), SORTIE (fichier). Le fichier est ensuite CHIFFRÉ par le workflow avant tout dépôt. */
import fs from 'node:fs';

export const VOLATILES = ['anonv:', 'anon:', 'q:', 'dep:', 'rl:', 'rlc:', 'gtts:', 'rlcode:', 'budget:', 'sauvegarde:', 'publication:'];
export const estVolatile = (cle) => VOLATILES.some((p) => String(cle).startsWith(p));
export const aGarder = (cles) => cles.filter((c) => c && !estVolatile(c));
export const paquets = (a, n = 100) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
/* Un export est sain s'il contient au moins des comptes (acc:) — sinon on refuse : mieux vaut un robot rouge qu'une sauvegarde vide qui rassure. */
export function sain(entrees) { const n = Object.keys(entrees).filter((k) => k.startsWith('acc:')).length; return { ok: n >= 1, comptes: n }; }

async function main() {
  const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A, NS, SORTIE = 'kv-accounts.json' } = process.env;
  if (!T || !A || !NS) { console.error('::error::CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / NS absents'); process.exit(1); }
  const base = `https://api.cloudflare.com/client/v4/accounts/${A}/storage/kv/namespaces/${NS}`;
  const H = { authorization: 'Bearer ' + T };
  const cles = []; let cursor = '';
  do {
    const r = await fetch(`${base}/keys?limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { headers: H });
    const j = await r.json();
    if (!r.ok || !j.success) { console.error('::error::liste des clés refusée HTTP ' + r.status); process.exit(1); }
    for (const k of j.result) cles.push(k.name);
    cursor = (j.result_info && j.result_info.cursor) || '';
  } while (cursor);
  const garder = aGarder(cles);
  const entrees = {};
  for (const lot of paquets(garder)) {
    const r = await fetch(`${base}/bulk/get`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ keys: lot }) });
    const j = await r.json();
    if (!r.ok || !j.success) { console.error('::error::lecture groupée refusée HTTP ' + r.status); process.exit(1); }
    Object.assign(entrees, (j.result && j.result.values) || {});
  }
  const s = sain(entrees);
  console.log(`clés : ${cles.length} au total · ${garder.length} gardées (volatiles écartées) · ${Object.keys(entrees).length} lues · ${s.comptes} comptes`);
  if (!s.ok) { console.error('::error::aucun compte (acc:) dans l\'export — sauvegarde refusée'); process.exit(1); }
  fs.writeFileSync(SORTIE, JSON.stringify({ jour: new Date().toISOString(), ns: NS, entrees }));
  console.log('écrit : ' + SORTIE + ' (' + fs.statSync(SORTIE).size + ' octets)');
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main();
