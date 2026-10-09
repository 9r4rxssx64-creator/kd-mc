/* CADENCE DES ÉCRITURES DE PRÉSENCE — le battement ne vide plus le plafond KV (mesuré le 1.10.2026)
 *
 * Mesuré (robot mesure-kv, API Analytics) : 1 264 écritures KV avant 10h27 UTC, plafond gratuit 1 000/jour.
 * Cause lue dans le code : /__sso/whoami toutes les 60 s par app ouverte, écriture dès 2 min → 30/h/personne.
 * Ici, le VRAI routeur, une personne connectée dont l'app bat toutes les 60 s pendant 40 min (horloge simulée) :
 *   1. ≤ 5 écritures de fiche en 40 min (avant : 20) et au moins 3 (la présence reste tenue) ;
 *   2. une SEULE session dans l'historique (les écritures espacées prolongent la session, n'en ouvrent pas) ;
 *   3. durée cumulée ≈ 40 min (± la cadence) ;
 *   4. un changement STRUCTUREL (nouvel appareil) s'écrit tout de suite, même 1 min après la dernière écriture ;
 *   5. SABOTAGE : avec la cadence d'avant (2 min), le même scénario ferait ≥ 15 écritures → ce test rougirait.
 * node services/kdmc-router/enrich-cadence.test.mjs */
import { createHmac } from 'node:crypto';
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m + (d ? '  → ' + d : '')); } };
const kv = new Map(); let ecrituresAcc = 0;
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { if (k.startsWith('acc:')) ecrituresAcc++; kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* 8.10 : ce test ne porte pas sur le code du compte — le blocage « crée ton code » (codeManquant) est prouvé dans code-attente.test.mjs § 7 */, ACCOUNTS };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jeton = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: 'Marie Curie', c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

/* horloge simulée : Date.now() avance d'une minute par battement */
const T0 = Date.now(); let horloge = T0; const vraiNow = Date.now; Date.now = () => horloge;
const battement = async (ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile') => {
  const r = await mod.fetch(new Request('https://cmcteams.kd-mc.com/__sso/whoami', { headers: { cookie: 'kdmc_sso=' + jeton('u-marie'), host: 'cmcteams.kd-mc.com', 'user-agent': ua, 'cf-connecting-ip': '203.0.113.9' } }), env, { waitUntil() {} });
  return r.status;
};

console.log('\nPrésence : le battement écrit à la cadence, pas à chaque minute\n');
try {
  for (let i = 0; i < 40; i++) { await battement(); horloge += 60e3; }
  ok(ecrituresAcc <= 5 && ecrituresAcc >= 3, `1. 40 battements à 60 s → ${ecrituresAcc} écriture(s) de fiche (attendu 3 à 5 ; avant : 20)`);
  const acc = JSON.parse(kv.get('acc:u-marie') || kv.get([...kv.keys()].find((k) => k.startsWith('acc:')) || '') || 'null');
  ok(acc && acc.history && acc.history.filter((h) => h.app === 'cmcteams.kd-mc.com').length === 1, '2. une seule session dans l\'historique (les écritures espacées la prolongent)', JSON.stringify(acc && acc.history));
  const ms = acc && acc.apps && acc.apps['cmcteams.kd-mc.com'] && acc.apps['cmcteams.kd-mc.com'].ms;
  ok(ms >= 25 * 60e3 && ms <= 40 * 60e3, `3. durée cumulée ≈ 40 min à la cadence près (${Math.round((ms || 0) / 60e3)} min)`);
  const avant = ecrituresAcc; horloge += 60e3;
  await battement('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120');
  ok(ecrituresAcc === avant + 1, `4. nouvel appareil 1 min après la dernière écriture → écrit tout de suite (${ecrituresAcc - avant})`);
  ok(ecrituresAcc < 15, `5. SABOTAGE implicite : la cadence d'avant (2 min) aurait donné ≥ 20 écritures ; ici ${ecrituresAcc}`);
} finally { Date.now = vraiNow; }
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
