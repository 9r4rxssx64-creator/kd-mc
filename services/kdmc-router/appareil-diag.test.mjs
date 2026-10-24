/* Tâche 60 (24.10.2026) : un pass refusé pour « appareil » dit QUELLES familles ne collent pas, et d'où vient le pass — pour trouver le coupable
   chez le robot d'inscription sans deviner. Jamais l'agent complet ni rien de personnel : seulement « iphone », « windows »…   node appareil-diag.test.mjs */
import { createHmac } from 'crypto';
import mod from './worker.js';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (o) => { const p = b64u(JSON.stringify(o)); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', ACCOUNTS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async (k) => kv.delete(k), list: async () => ({ keys: [], list_complete: true }) } };
kv.set('acc:jean-essai', JSON.stringify({ uid: 'jean-essai', name: 'Jean Essai' }));
const UA = { iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' };
const pass = signe({ u: 'jean-essai', n: 'Jean Essai', c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 1e9, d: 'iphone' });
const who = async (h) => JSON.parse(await (await mod.fetch(new Request('https://apex-chat.kd-mc.com/__sso/whoami', { headers: h }), env, { waitUntil() {} })).text());
let ko = 0; const ok = (c, m, d) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c ? '' : ' → ' + JSON.stringify(d))); if (!c) ko++; };
const a = await who({ cookie: 'kdmc_sso=' + pass, 'user-agent': UA.iphone });
ok(a.ok === true, 'même famille (iPhone → iPhone) : reconnu', a);
const b = await who({ cookie: 'kdmc_sso=' + pass, 'user-agent': UA.windows });
ok(b.ok === false && b.cause === 'appareil' && b.pass_appareil === 'iphone' && b.requete_appareil === 'windows' && b.source === 'cookie', 'autre famille : cause « appareil » + familles nommées + source cookie', b);
const c = await who({ authorization: 'Bearer ' + pass });
ok(c.cause === 'appareil' && c.requete_appareil === 'autre' && c.source === 'en-tete', 'appel serveur sans agent (cas d\'un worker) : « autre », source en-tête', c);
ok(!JSON.stringify(b).includes('Windows NT'), 'l\'agent complet n\'est jamais renvoyé', b);
const faux = pass.slice(0, -3) + 'abc';
const d = await who({ cookie: 'kdmc_sso=' + faux, 'user-agent': UA.windows });
ok(d.cause === 'signature' && d.pass_appareil === undefined, 'pass falsifié : « signature », rien de son contenu n\'est relu', d);
console.log(ko ? '❌ ' + ko + ' échec(s)' : '✅ refus « appareil » lisible'); process.exit(ko ? 1 : 0);
