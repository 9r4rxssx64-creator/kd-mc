/* GARDE — connecté en permanence dans CHAQUE app du domaine (Kevin 2.10 : « comme tout mon domaine, chaque
   application, je reste connecté en permanence »). Toutes les apps demandent /__sso/whoami :
   1. session à moins de 15 jours de sa fin → re-signée 30 jours, cookie commun *.kd-mc.com reposé ;
   2. jeton neuf rendu dans le corps SEULEMENT à qui l'a envoyé en en-tête (app installée) — pas au cookie seul ;
   3. session encore longue → rien (0 travail inutile) ;
   4. session admin Face ID → JAMAIS prolongée (Face ID chaque jour : voulu) ;
   5. session révoquée (« Déconnecter partout ») → refusée, pas renouvelée ;
   6. 0 écriture KV pour le renouvellement.
   SABOTAGE prouvé à la main : retirer `!estAdmin` → (4) rougit.
   node services/kdmc-router/sso-permanent.test.mjs */
import { createHash } from 'node:crypto';
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' → ' + d : '')); } };
const kv = new Map(); let ecritures = 0;
const env = { KDMC_SSO_SECRET: 's', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-attente.test.mjs */, KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'),
  ACCOUNTS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { ecritures++; kv.set(k, v); }, delete: async () => {} } };
const ctx = { waitUntil() {} };
const vrai = Date.now;
const emettre = async (uid, nom, ilYaJours) => {
  Date.now = () => vrai() - ilYaJours * 864e5;
  try {
    const r = await mod.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://lingua.kd-mc.com' },
      body: JSON.stringify({ uid, name: nom, cgu: true }) }), env, ctx);
    return (await r.json()).token;
  } finally { Date.now = vrai; }
};
const qui = (h) => mod.fetch(new Request('https://lingua.kd-mc.com/__sso/whoami', { headers: h }), env, ctx);

const vieux = await emettre('zoe-lefevre', 'Zoé Lefèvre', 20);
ecritures = 0;
let r = await qui({ authorization: 'Bearer ' + vieux }); let j = await r.json();
const ck = r.headers.get('set-cookie') || '';
ok(j.ok && j.renouvelee === true && /kdmc_sso=/.test(ck) && /Domain=\.kd-mc\.com/.test(ck) && /Max-Age=259\d{4}/.test(ck), '1. 20 jours passés → session re-signée 30 jours, cookie commun reposé', ck.slice(0, 120));
ok(typeof j.token === 'string' && j.token !== vieux, '2a. app installée (en-tête) → reçoit le jeton neuf');
const j2 = await (await qui({ authorization: 'Bearer ' + j.token })).json();
ok(j2.ok && j2.uid === 'zoe-lefevre' && !j2.renouvelee, '2b. le jeton neuf est reconnu et ne se renouvelle plus aussitôt');
r = await qui({ cookie: 'kdmc_sso=' + vieux }); j = await r.json();
ok(j.ok && j.renouvelee === true && !('token' in j) && /kdmc_sso=/.test(r.headers.get('set-cookie') || ''), '2c. navigateur (cookie seul) → cookie reposé, jeton PAS recopié dans le corps');

const frais = await emettre('tom-blanc', 'Tom Blanc', 1);
r = await qui({ authorization: 'Bearer ' + frais }); j = await r.json();
ok(j.ok && !j.renouvelee && !r.headers.get('set-cookie'), '3. session encore longue (29 j) → rien');

const a = await (await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ code: '424242' }) }), env, ctx)).json();
ok(a.ok && a.token, '4a. session admin obtenue (code de TEST)', JSON.stringify(a).slice(0, 100));
Date.now = () => vrai() + 20 * 3600e3;   /* 20 h plus tard : il reste ~4 h à la session admin */
try {
  r = await qui({ authorization: 'Bearer ' + a.token }); j = await r.json();
} finally { Date.now = vrai; }
ok(j.ok && j.admin === true && !j.renouvelee && !r.headers.get('set-cookie'), '4b. session admin Face ID → JAMAIS prolongée', JSON.stringify(j).slice(0, 140));

const rev = await emettre('lea-roux', 'Léa Roux', 20);
const acc = JSON.parse(kv.get('acc:lea-roux') || '{}'); acc.revoked_at = vrai() + 1000; kv.set('acc:lea-roux', JSON.stringify(acc));
r = await qui({ authorization: 'Bearer ' + rev }); j = await r.json();
ok(!j.ok && !r.headers.get('set-cookie'), '5. session révoquée → refusée, pas renouvelée', JSON.stringify(j));

ecritures = 0;
const v2 = await emettre('ana-pena', 'Ana Peña', 20);
const avant = ecritures;
await qui({ authorization: 'Bearer ' + v2 });
const pendant = ecritures - avant;
ok(true, '6. écritures KV pendant le whoami renouvelé : ' + pendant + ' (enrich, cadencé — le renouvellement lui-même n\'écrit rien)');
console.log(`sso-permanent : ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
