/* LES ROBOTS DE VÉRIFICATION N'USENT PLUS LE REGISTRE (19.11, facture Cloudflare — mesure-kv : 1 572 écritures le 17.11 pour un plafond gratuit de 1 000).
   Un robot connecté en admin coûtait 1 écriture + 1 suppression par connexion et 1 écriture par app ouverte. Maintenant : la 1re connexion d'une rafale est notée,
   le reste n'écrit rien — SAUF ce qui compte pour la sécurité (nouvel appareil, nouveau lieu), qui s'écrit et alerte comme avant. Une vraie personne n'est pas touchée.
   node services/kdmc-router/robots-sans-ecritures.test.mjs */
import { createHash } from 'node:crypto';
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const kv = new Map(); let ops = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); ops.push('PUT ' + k); }, delete: async (k) => { kv.delete(k); ops.push('DEL ' + k); }, list: async () => ({ keys: [], list_complete: true }) };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
const att = [], ctx = { waitUntil: (p) => att.push(p), passThroughOnException() {} };
globalThis.fetch = async () => new Response('<html><head></head><body>ok</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
const ROBOT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const HUMAIN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const mesure = async (f) => { ops = []; await f(); await Promise.allSettled(att.splice(0)); return ops.slice(); };
const cf = (ville) => ({ city: ville, region: 'X', country: ville === 'Tokyo' ? 'JP' : 'MC', asn: 3303 });
let jeton = '', grant = '', cookie = '';
const login = (ua) => mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com', 'x-kdmc-verif': '1', 'user-agent': ua, 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify({ code: '424242' }) }), env, ctx)
  .then(async (r) => { const j = await r.json(); jeton = j.token || jeton; grant = j.grant || grant; cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ') || cookie; return j; });
const page = (hote, ua, ville) => { const q = new Request('https://' + hote + '/', { headers: { cookie, authorization: 'Bearer ' + jeton, 'x-kdmc-admin': grant, 'user-agent': ua, host: hote, 'sec-fetch-dest': 'document', accept: 'text/html', 'cf-connecting-ip': '1.2.3.4' } }); Object.defineProperty(q, 'cf', { value: cf(ville) }); return mod.fetch(q, env, ctx); };

/* mise en place : le robot s'est déjà connecté une fois depuis Monaco (son appareil et son lieu sont connus) */
await login(ROBOT); await page('kd-mc.com', ROBOT, 'Monaco'); await Promise.allSettled(att.splice(0));
ok(/kdmc_admin/.test([...kv.keys()].join()) , '0. mise en place : la fiche de l\'admin existe, appareil et lieu du robot connus');

let o = await mesure(() => login(ROBOT));
ok(o.length === 0, '1. une 2e connexion de robot dans la demi-heure : 0 écriture, 0 suppression (avant : 1 + 1)', o);
o = await mesure(async () => { for (const h of ['lingua.kd-mc.com', 'arbre.kd-mc.com', 'cmcteams.kd-mc.com', 'kd-mc.com']) await page(h, ROBOT, 'Monaco'); });
ok(o.length === 0, '2. le robot ouvre 4 apps (appareil et lieu connus) : 0 écriture au registre (avant : 1 par app)', o);
const fiche = JSON.parse(kv.get('acc:kdmc_admin'));
ok(!Object.keys(fiche.apps || {}).includes('lingua.kd-mc.com'), '3. et aucune « session » de robot ne s\'ajoute à la fiche de l\'admin', Object.keys(fiche.apps || {}));

/* SÉCURITÉ : ce qui est nouveau s'écrit et se voit, même avec un appareil de robot */
o = await mesure(() => page('lingua.kd-mc.com', ROBOT, 'Tokyo'));
ok(o.some((x) => x === 'PUT acc:kdmc_admin') && JSON.parse(kv.get('acc:kdmc_admin')).places.includes('Tokyo, X, JP'), '4. SÉCURITÉ : le même « robot » depuis un lieu JAMAIS vu → la fiche s\'écrit, le lieu est noté', o);
/* une vraie personne (appareil ordinaire) n'est pas concernée */
o = await mesure(() => page('arbre.kd-mc.com', HUMAIN, 'Monaco'));
ok(o.some((x) => x === 'PUT acc:kdmc_admin') && o.some((x) => x === 'PUT aud:log'), '5. un appareil ORDINAIRE jamais vu → fiche écrite ET ligne « nouvel appareil » au journal admin (rien n\'a changé)', o);
o = await mesure(() => page('cmcteams.kd-mc.com', HUMAIN, 'Monaco'));
ok(o.some((x) => x === 'PUT acc:kdmc_admin') && Object.keys(JSON.parse(kv.get('acc:kdmc_admin')).apps).includes('cmcteams.kd-mc.com'), '6. une vraie session (appareil ordinaire connu) s\'écrit comme avant', o);
/* une connexion admin ordinaire reste toujours notée */
const login2 = () => mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': HUMAIN, 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify({ code: '424242' }) }), env, ctx);
o = await mesure(async () => { await login2(); await login2(); });
ok(o.filter((x) => x === 'PUT aud:log').length === 2, '7. deux vraies connexions admin de suite : les DEUX sont au journal (seules les rafales de robots sont réunies)', o);
/* un code refusé laisse une trace qu'une connexion réussie efface encore */
await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': ROBOT, 'x-kdmc-verif': '1', 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify({ code: '000000' }) }), env, ctx);
const avant = [...kv.keys()].filter((k) => k.startsWith('al:')).length;
await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': ROBOT, 'x-kdmc-verif': '1', 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify({ code: '424242' }) }), env, ctx);
ok(avant >= 1 && [...kv.keys()].filter((k) => k.startsWith('al:')).length === avant - 1, '8. après un code refusé, la connexion réussie efface bien le compteur d\'essais (la suppression n\'a lieu que s\'il existe)', [avant]);
console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
