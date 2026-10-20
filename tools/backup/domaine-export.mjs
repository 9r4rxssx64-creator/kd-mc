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
/* (gardé pour les tests ; plus utilisé par l'export) */
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
  /* Lecture clé par clé, 8 à la fois (20.10, premier passage réel : la lecture « groupée » de l'API a répondu HTTP 400 — on ne s'appuie plus dessus).
     Une clé qui disparaît entre la liste et la lecture (404) est simplement ignorée ; toute autre réponse en erreur = sauvegarde refusée. */
  let i = 0, refus = 0, dernier = '';
  const lire = async () => {
    for (;;) {
      const k = garder[i++]; if (k === undefined) return;
      for (let essai = 0; essai < 3; essai++) {
        const r = await fetch(`${base}/values/${encodeURIComponent(k)}`, { headers: H });
        if (r.status === 404) break;
        if (r.ok) { entrees[k] = await r.text(); break; }
        if (essai === 2) { refus++; dernier = 'HTTP ' + r.status; }
        else await new Promise((ok) => setTimeout(ok, 400 * (essai + 1)));
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, lire));
  if (refus) { console.error(`::error::${refus} clé(s) illisible(s) (${dernier}) — sauvegarde refusée`); process.exit(1); }
  /* Les bases D1 par l'API (20.10, 2ᵉ passage réel : `wrangler d1 export` a échoué sur ce jeton). Chaque table est lue par pages de 2000 lignes et écrite en JSON.
     Une base illisible est NOTÉE (annotation) sans arrêter la sauvegarde des comptes : mieux vaut les comptes seuls que rien. */
  const d1 = {}; const D1 = (process.env.D1_NOMS || 'kdmc-cercle,kdmc-pont').split(',').map((x) => x.trim()).filter(Boolean);
  try {
    const lr = await fetch(`https://api.cloudflare.com/client/v4/accounts/${A}/d1/database?per_page=100`, { headers: H });
    const lj = await lr.json();
    if (!lr.ok || !lj.success) console.log(`::warning title=domaine-backup::liste des bases D1 refusée HTTP ${lr.status} ${((lj.errors || [])[0] || {}).message || ''}`);
    else for (const nom of D1) {
      const b = (lj.result || []).find((x) => x.name === nom);
      if (!b) { console.log(`::warning title=domaine-backup::base D1 « ${nom} » introuvable dans ce compte`); continue; }
      const q = async (sql) => { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${A}/d1/database/${b.uuid}/query`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ sql }) }); const j = await r.json(); if (!r.ok || !j.success) throw new Error('HTTP ' + r.status + ' ' + (((j.errors || [])[0] || {}).message || '')); return (j.result && j.result[0] && j.result[0].results) || []; };
      try {
        const tables = (await q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")).map((t) => t.name);
        d1[nom] = {};
        for (const t of tables) { const lignes = []; for (let off = 0; ; off += 2000) { const p = await q(`SELECT * FROM "${t.replace(/"/g, '')}" LIMIT 2000 OFFSET ${off}`); lignes.push(...p); if (p.length < 2000) break; } d1[nom][t] = lignes; }
        console.log(`::notice title=domaine-backup::D1 ${nom} : ${tables.length} tables, ${Object.values(d1[nom]).reduce((n, l) => n + l.length, 0)} lignes`);
      } catch (e) { console.log(`::warning title=domaine-backup::D1 « ${nom} » non exportée : ${String(e.message).slice(0, 160)}`); }
    }
  } catch (e) { console.log(`::warning title=domaine-backup::D1 : ${String(e.message).slice(0, 160)}`); }
  const s = sain(entrees);
  console.log(`::notice title=domaine-backup::${cles.length} clés, ${garder.length} gardées, ${Object.keys(entrees).length} lues, ${s.comptes} comptes`);
  console.log(`clés : ${cles.length} au total · ${garder.length} gardées (volatiles écartées) · ${Object.keys(entrees).length} lues · ${s.comptes} comptes`);
  if (!s.ok) { console.error('::error::aucun compte (acc:) dans l\'export — sauvegarde refusée'); process.exit(1); }
  fs.writeFileSync(SORTIE, JSON.stringify({ jour: new Date().toISOString(), ns: NS, entrees, d1 }));
  console.log('écrit : ' + SORTIE + ' (' + fs.statSync(SORTIE).size + ' octets)');
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main();
