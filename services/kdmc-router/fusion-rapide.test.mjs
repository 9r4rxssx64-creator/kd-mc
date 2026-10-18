/* GARDE — « personne ne doit galérer à se connecter ou créer son inscription » (Kevin 18.10.2026)
   node services/kdmc-router/fusion-rapide.test.mjs
   Mesuré en réel (robot parcours-invite, 3 passages) : le tout PREMIER « nom + code » d'un compte neuf prenait 10,5 à 12 s, dont 11 049 ms dans `enrich` ; les suivants 150 ms.
   Cause : la relecture des dossiers pour fusionner les doublons (`mergeIntoCanon`) lisait les comptes UN PAR UN. Ici, avec le VRAI routeur et un registre KV dont chaque
   lecture dure 15 ms :
     1. le premier « nom + code » d'un compte neuf lit les dossiers PAR PAQUETS (au moins 5 lectures en vol en même temps) ;
     2. il met bien moins de temps que la somme des lectures (25 dossiers × 15 ms = 375 ms de lectures en série) ;
     3. le résultat est le même : un vrai doublon (même nom, autre identifiant) est toujours absorbé, une homonyme au nom différent non ;
     4. la fusion ne se refait pas au 2e passage (marque `merged_v1`). */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import mod from './worker.js';
import { schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const kv = new Map(); let enVol = 0, maxVol = 0;
const attente = (ms) => new Promise((r) => setTimeout(r, ms));
const ACCOUNTS = {
  get: async (k) => { const lecture = /^acc:/.test(k); if (lecture) { enVol++; maxVol = Math.max(maxVol, enVol); await attente(15); enVol--; } return kv.has(k) ? kv.get(k) : null; },
  put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); },
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CERCLE_DB: db };
globalThis.fetch = async () => new Response('null', { status: 200 });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const appel = async (path, body, e = env, ua = UA) => { const r = new Request('https://kd-mc.com' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': ua, 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); const x = await mod.fetch(r, e, { waitUntil() {} }); return { st: x.status, j: await x.json().catch(() => ({})) }; };

console.log('\n== Premier « nom + code » d\'un compte neuf, parmi 25 dossiers ==');
const c = await appel('/__sso/issue', { uid: 'nina-neuve', name: 'Nina Neuve', cgu: true, code: '123456', telephone: '+377 06 12 34 56' });
ok(c.j.ok === true, '0. (décor) le compte existe', c);
const idx = JSON.parse(kv.get('idx:uids') || '[]');
for (let i = 0; i < 24; i++) { const uid = 'autre-' + i; const nom = i === 7 ? 'Nina Neuve' : 'Personne Numero' + i; kv.set('acc:' + uid, JSON.stringify({ uid, name: nom, created: 1, hits: 2, devices: [], places: [], apps: {}, history: [] })); idx.push(uid); }
kv.set('idx:uids', JSON.stringify(idx));
{ const a = JSON.parse(kv.get('acc:nina-neuve')); delete a.merged_v1; delete a.merged_at; kv.set('acc:nina-neuve', JSON.stringify(a)); }
maxVol = 0; const t0 = Date.now();
const env2 = { ...env, ACCOUNTS: { ...ACCOUNTS } };   /* autre isolat : le mémo de 15 s des fiches (acc-memo.js) est par KV, il ne masque pas nos retouches */
const r = await appel('/__sso/login', { name: 'Nina Neuve', code: '123456' }, env2, UA_MAC);   /* 1er passage depuis un autre appareil = « structurel » : la fiche est enrichie */
const dt = Date.now() - t0;
ok(r.st === 200 && r.j.ok === true, '1. le « nom + code » réussit', r);
ok(maxVol >= 5, `2. les dossiers sont lus PAR PAQUETS (${maxVol} lectures en vol en même temps, attendu ≥ 5)`, maxVol);
ok(dt < 330, `3. ${dt} ms au total : bien moins que 25 × 15 ms de lectures en série (≈ 375 ms) + le reste`, dt);
const nina = JSON.parse(kv.get('acc:nina-neuve'));
ok((nina.aliases || []).includes('autre-7') && JSON.parse(kv.get('acc:autre-7')).merged_into === 'nina-neuve', '4. le vrai doublon (même nom) est absorbé : le résultat est le même qu\'avant', nina.aliases);
ok(!(nina.aliases || []).some((u) => u !== 'autre-7'), '4b. aucun homonyme au nom différent n\'est absorbé', nina.aliases);
ok(nina.merged_v1 === 1, '5. la fusion est marquée faite (pas de relecture au passage suivant)');
maxVol = 0; await appel('/__sso/login', { name: 'Nina Neuve', code: '123456' }, { ...env, ACCOUNTS: { ...ACCOUNTS } }, UA_MAC);
ok(maxVol <= 2, `5b. au 2e passage les dossiers ne sont plus relus (${maxVol} lecture(s) de dossier en vol)`, maxVol);
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
