/* LE ROBOT DE VÉRIFICATION NE DOIT PLUS SALIR LE JOURNAL DE KEVIN (Kevin 07.10.2026 : « Efface tes connexions »).
 *
 * Le robot « vérifie réel » (tests/verif-live-equipes.mjs) se connecte en admin depuis un runner CI (PC Linux, à
 * l'étranger). Avant ce correctif, chaque passage :
 *   - était journalisé « 🔓 Connexion admin réussie » (admin_login_ok), impossible à distinguer d'un vrai Kevin ;
 *   - ENRICHISSAIT la fiche admin (acc:kdmc_admin) avec l'appareil/le pays du runner → « Qui se connecte » montrait
 *     un PC Linux à l'étranger, et pouvait lever une « connexion suspecte ».
 * Le correctif : l'en-tête x-kdmc-verif=1 fait TRACER la connexion comme admin_login_verif (rien n'est caché) mais
 * SANS enrichir la fiche de Kevin. Une VRAIE connexion admin (sans l'en-tête) reste tracée admin_login_ok ET enrichie
 * → un intrus déclenche toujours l'alerte appareil/géo.
 *
 * node services/kdmc-router/admin-verif-login.test.mjs */
import mod from './worker.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : (fail++, console.log('  ✗ ' + m + (d !== undefined ? '  → ' + JSON.stringify(d) : ''))); };
const CODE = '424242';
const HASH = createHash('sha256').update(CODE).digest('hex');
const mkEnv = () => { const s = new Map(); return { store: s, env: { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS: { get: async (k) => (s.has(k) ? s.get(k) : null), put: async (k, v) => { s.set(k, v); }, delete: async (k) => { s.delete(k); } } } }; };
const login = (env, extra) => mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/CI' }, extra || {}), body: JSON.stringify({ code: CODE }) }), env);
const auditOf = (store) => { try { return JSON.parse(store.get('aud:log') || '[]'); } catch { return []; } };

console.log('\nLe robot de vérification ne salit plus le journal de Kevin\n');

/* 1. VRAIE connexion admin (sans en-tête) : tracée admin_login_ok ET fiche enrichie (le signal protecteur reste). */
{
  const { store, env } = mkEnv();
  const j = await (await login(env)).json();
  const log = auditOf(store);
  ok(j.ok === true && typeof j.grant === 'string' && j.admin === true && j.verified === true, '1a. connexion admin normale → grant admin émis');
  ok(log.some((e) => e.ev === 'admin_login_ok') && !log.some((e) => e.ev === 'admin_login_verif'), '1b. journalisée « admin_login_ok » (comme un vrai Kevin)', log.map((e) => e.ev));
  ok(store.has('acc:kdmc_admin'), '1c. la fiche admin EST enrichie (appareil/pays tracés → un intrus lève l\'alerte)');
}

/* 2. Connexion du ROBOT (x-kdmc-verif=1) : tracée admin_login_verif, fiche NON enrichie, mais l'admin marche (lecture seule). */
{
  const { store, env } = mkEnv();
  const j = await (await login(env, { 'x-kdmc-verif': '1' })).json();
  const log = auditOf(store);
  ok(j.ok === true && typeof j.grant === 'string' && j.admin === true && j.verified === true, '2a. le robot obtient quand même la session admin (la vérification lecture seule fonctionne)');
  ok(log.some((e) => e.ev === 'admin_login_verif') && !log.some((e) => e.ev === 'admin_login_ok'), '2b. journalisée « admin_login_verif » (robot, jamais confondue avec Kevin ; rien n\'est caché)', log.map((e) => e.ev));
  ok(!store.has('acc:kdmc_admin'), '2c. la fiche admin de Kevin N\'EST PAS enrichie par le runner CI (plus de fausse « connexion suspecte »)');
}

/* 3. DISCRIMINANT (sabotage lu à la source) : si le garde disparaît, le robot re-salit le journal → ce test DOIT rougir. */
{
  const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  ok(/const estVerif = request\.headers\.get\('x-kdmc-verif'\) === '1';/.test(src), '3a. le garde lit l\'en-tête x-kdmc-verif');
  ok(/ev: estVerif \? 'admin_login_verif' : 'admin_login_ok'/.test(src), '3b. le journal distingue robot vs vrai admin');
  ok(/if \(!estVerif\) await enrich\(env, request, CANON_UID/.test(src), '3c. l\'enrichissement de la fiche admin est SAUTÉ pour le robot');
}

console.log(`\nVérif-login robot : ${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
