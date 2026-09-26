/* Test de la découverte multi-data-center Tuya (comptes France = Central OU Western
   Europe). Vérifie l'ordre des hôtes candidats + que la découverte retient l'hôte qui
   renvoie le robot, et remonte un diagnostic honnête quand rien n'est trouvé.
   node tuya-hosts.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* KV + env mock (Tuya lié, sur Central EU au départ) */
function mkKV(init) { const m = new Map(Object.entries(init || {})); return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => m.set(k, String(v)), delete: async (k) => m.delete(k), _m: m }; }
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signSso = (s, uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', s).update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
function mkEnv() {
  const kv = mkKV({ 'tuya:cfg': JSON.stringify({ access_id: 'cid', access_secret: 'sec', host: 'openapi.tuyaeu.com', region: 'eu', device_id: null }) });
  return { ACCOUNTS: kv, KDMC_SSO_SECRET: 'sso', KDMC_ADMIN_PIN_SHA256: sha('424242'), _kv: kv };
}
const grant = signSso('sso', '__kdmc_admin__', 1);
const REQ = (p) => new Request('https://beatbot.kd-mc.com' + p, { headers: { 'x-kdmc-admin': grant } });

/* Simulateur cloud Tuya : le robot vit sur openapi-weaz.tuyaeu.com (Western Europe),
   PAS sur Central. Central répond token OK mais 0 device (exactement le bug de Kevin). */
const realFetch = globalThis.fetch;
function setCloud(deviceHost) {
  globalThis.fetch = async (input) => {
    const u = typeof input === 'string' ? input : input.url; const url = new URL(u);
    if (url.pathname === '/v1.0/token') return new Response(JSON.stringify({ success: true, result: { access_token: 'tok_' + url.hostname, expire_time: 7200 } }), { status: 200 });
    if (url.pathname.includes('associated-users/devices') || url.pathname.includes('/space/devices')) {
      const hit = url.hostname === deviceHost;
      return new Response(JSON.stringify({ success: true, result: { devices: hit ? [{ id: 'bf97', name: 'AquaSense 2 Ultra', category: 'sd', online: true }] : [] } }), { status: 200 });
    }
    return realFetch(input);
  };
}

try {
  /* 1) ordre des hôtes : courant d'abord, puis l'alternatif de la zone */
  setCloud('__none__');
  let r = await mod.fetch(REQ('/__beatbot/tuya/devices'), mkEnv()); let j = await r.json();
  const hosts = j.tried.map((t) => t.host);
  ok(hosts[0] === 'openapi.tuyaeu.com', 'hôte courant (Central EU) testé en premier');
  ok(hosts.includes('openapi-weaz.tuyaeu.com'), 'Western Europe (Azure) testé en secours');

  /* 2) robot sur Western Europe → trouvé + hôte retenu + persisté */
  setCloud('openapi-weaz.tuyaeu.com');
  const env = mkEnv();
  r = await mod.fetch(REQ('/__beatbot/tuya/devices'), env); j = await r.json();
  ok(j.ok && j.devices.length === 1 && j.devices[0].name === 'AquaSense 2 Ultra', 'robot trouvé sur la 2e zone Europe');
  ok(j.host === 'openapi-weaz.tuyaeu.com', 'hôte gagnant remonté');
  const saved = JSON.parse(await env._kv.get('tuya:cfg'));
  ok(saved.host === 'openapi-weaz.tuyaeu.com', 'hôte gagnant PERSISTÉ (les appels suivants tapent la bonne zone)');

  /* 3) robot sur Central → trouvé du 1er coup, pas de bascule inutile */
  setCloud('openapi.tuyaeu.com');
  r = await mod.fetch(REQ('/__beatbot/tuya/devices'), mkEnv()); j = await r.json();
  ok(j.ok && j.devices.length === 1 && j.host === 'openapi.tuyaeu.com', 'robot sur Central EU trouvé directement');

  /* 4) vraiment aucun robot → diagnostic honnête par hôte (aucune invention) */
  setCloud('__none__');
  r = await mod.fetch(REQ('/__beatbot/tuya/devices'), mkEnv()); j = await r.json();
  ok(j.ok && j.devices.length === 0, 'aucun robot → devices vide (jamais inventé)');
  ok(j.tried.length >= 2 && j.tried.every((t) => t.count === 0 || t.error), 'diagnostic par hôte présent (count 0 / erreur)');
} finally { globalThis.fetch = realFetch; }

console.log(`Tuya multi-host discovery test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
