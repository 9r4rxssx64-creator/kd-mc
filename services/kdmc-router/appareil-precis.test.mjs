/* GARDE — « MON MATÉRIEL » (Kevin 29.10.2026 : « vérifie si c'est une tablette Lenovo… il faut que mes appareils soient reconnus, qu'on sache quand c'est moi »).
 * Chrome Android masque le modèle (« Android 10; K ») : l'indice client Sec-CH-UA-Model (demandé par Accept-CH) le rend. Pour l'ADMIN seulement, l'appareil
 * se compte au MODÈLE : une tablette de plus sur ma fiche devient un « nouvel appareil » (journal + fil d'activité) ; les autres comptes gardent la clé grossière.
 * node services/kdmc-router/appareil-precis.test.mjs   (SABOTAGE=1 : retire l'indice → doit échouer) */
import { enrich } from './worker.js';
import { schema as schemaCercle } from './cercle.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d) : ''}`); };
const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ORANGE = { country: 'FR', city: 'Montpellier', region: 'Occitanie', asn: 3215, asOrganization: 'Orange S.A.', timezone: 'Europe/Paris' };
globalThis.fetch = async () => new Response('{"ok":true}', { status: 200 });
const monde = () => { const m = new Map(); return { m, ACCOUNTS: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }, KDMC_SSO_SECRET: 'sec', KDMC_PUSH_URL: 'https://push.example.dev', KDMC_PUSH_TOKEN: 'tok' }; };
const req = (ua, modele) => ({ cf: ORANGE, headers: new Headers({ 'CF-Connecting-IP': '203.0.113.7', 'user-agent': ua, host: 'kd-mc.com', ...(modele && process.env.SABOTAGE !== '1' ? { 'sec-ch-ua-model': '"' + modele + '"' } : {}) }) });
const lire = (env, uid) => JSON.parse(env.m.get('acc:' + uid));
console.log('\nMon matériel : le modèle exact, pour l\'admin\n');
let env = monde();
await enrich(env, req(ANDROID, 'Lenovo TB-J606F'), 'kdmc_admin', 'Kevin Desarzens', true);
let a = lire(env, 'kdmc_admin');
ok(/Lenovo TB-J606F/.test(a.last_device), '1. « Android 10; K » + indice client → la fiche dit « Lenovo TB-J606F », plus « K »', a.last_device);
ok(a.devices.includes('Lenovo TB-J606F·Android'), '2. l\'admin compte l\'appareil au modèle', a.devices);
await enrich(env, req(IPHONE, ''), 'kdmc_admin', 'Kevin Desarzens', true);
a = lire(env, 'kdmc_admin');
ok(a.devices.includes('iPhone·iOS') && a.devices.length === 2, '3. un iPhone est un second appareil, distinct de la tablette', a.devices);
await enrich(env, req(ANDROID, 'SM-S918B'), 'kdmc_admin', 'Kevin Desarzens', true);
a = lire(env, 'kdmc_admin');
ok(a.devices.includes('SM-S918B·Android') && a.devices.length === 3, '4. un AUTRE Android (autre modèle) = nouvel appareil sur la fiche admin', a.devices);
const env2 = monde();
await enrich(env2, req(ANDROID, 'Lenovo TB-J606F'), 'marie-test', 'Marie Dupont', true);
await enrich(env2, req(ANDROID, 'SM-S918B'), 'marie-test', 'Marie Dupont', true);
ok(lire(env2, 'marie-test').devices.length === 1, '5. les autres comptes gardent la clé grossière (pas d\'alerte à chaque appareil)', lire(env2, 'marie-test').devices);
const sale = monde();
await enrich(sale, req(ANDROID, 'X"<script>alert(1)</script>'), 'kdmc_admin', 'Kevin Desarzens', true);
ok(!/[<>"]/.test(lire(sale, 'kdmc_admin').last_device), '6. l\'indice client est assaini (jamais de balise dans la fiche)', lire(sale, 'kdmc_admin').last_device);
console.log(`\n${pass} OK / ${fail} échec(s)`); if (fail) process.exit(1);
