/* Tests du moteur « programme » PoolPilot : garde-fous de démarrage auto (jamais à
   l'aveugle) + validation de la config de programmation. Déterministe (pas de dépendance
   à l'heure réelle). node tuya-schedule.test.mjs */
import mod from './worker.js';
import { tuyaStartClean } from './worker.js';
import { createHash, createHmac } from 'crypto';

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

const CFG = { access_id: 'cid', access_secret: 'sec', host: 'openapi.tuyaeu.com', region: 'eu', device_id: 'bf62' };
function mkEnv() { const m = new Map(); return { ACCOUNTS: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => m.set(k, String(v)), delete: async (k) => m.delete(k) }, _m: m }; }

/* Simulateur cloud Tuya paramétrable (online + statut + batterie) */
const realFetch = globalThis.fetch;
function setRobot({ online = true, status = 'standby', batt = 100, cmdOk = true } = {}) {
  globalThis.fetch = async (input) => {
    const u = typeof input === 'string' ? input : input.url; const url = new URL(u);
    if (url.pathname === '/v1.0/token') return new Response(JSON.stringify({ success: true, result: { access_token: 'tok', expire_time: 7200 } }), { status: 200 });
    if (/\/devices\/[^/]+\/status$/.test(url.pathname)) return new Response(JSON.stringify({ success: true, result: [{ code: 'status', value: status }, { code: 'battery_percentage', value: batt }] }), { status: 200 });
    if (/\/devices\/[^/]+\/commands$/.test(url.pathname)) return new Response(JSON.stringify({ success: cmdOk, result: cmdOk }), { status: 200 });
    if (/\/devices\/[^/]+$/.test(url.pathname)) return new Response(JSON.stringify({ success: true, result: { online, name: 'AquaSense 2 Ultra' } }), { status: 200 });
    return realFetch(input);
  };
}

try {
  /* 1) robot en ligne + en veille + batterie OK → démarrage accepté (commande envoyée) */
  setRobot({ online: true, status: 'standby', batt: 100 });
  let r = await tuyaStartClean(mkEnv(), CFG, { suction: 'strong', minBatt: 20 });
  ok(r.ok === true, 'démarre quand en ligne + standby + batterie OK');

  /* 2) hors ligne (sous l'eau / rangé) → JAMAIS de démarrage à l'aveugle */
  setRobot({ online: false });
  r = await tuyaStartClean(mkEnv(), CFG, {});
  ok(r.ok === false && r.reason === 'offline', 'refuse si robot hors ligne');

  /* 3) déjà en train de nettoyer → pas de double démarrage */
  setRobot({ online: true, status: 'cleaning', batt: 80 });
  r = await tuyaStartClean(mkEnv(), CFG, {});
  ok(r.ok === false && r.reason === 'already_cleaning', 'refuse si déjà en nettoyage');

  /* 4) batterie sous le minimum → refuse (évite un cycle qui meurt en route) */
  setRobot({ online: true, status: 'standby', batt: 10 });
  r = await tuyaStartClean(mkEnv(), CFG, { minBatt: 20 });
  ok(r.ok === false && r.reason === 'low_batt', 'refuse si batterie < minimum');

  /* 5) validation de la config de programmation via l'endpoint (admin) */
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signSso = (s, uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', s).update(p).digest()); };
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const grant = signSso('sso', '__kdmc_admin__');
  function env2() { const m = new Map([['tuya:cfg', JSON.stringify(CFG)]]); return { ACCOUNTS: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => m.set(k, String(v)), delete: async (k) => m.delete(k) }, KDMC_SSO_SECRET: 'sso', KDMC_ADMIN_PIN_SHA256: sha('424242'), _m: m }; }
  const e = env2();
  const req = new Request('https://beatbot.kd-mc.com/__beatbot/tuya/schedule', { method: 'POST', headers: { 'x-kdmc-admin': grant, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, autoResume: true, suction: 'strong', minBatt: 25, slots: [{ dow: 1, hm: '09:00' }, { dow: 9, hm: '25:99' }, { dow: 3, hm: 'bad' }] }) });
  const res = await mod.fetch(req, e); const jj = await res.json();
  ok(jj.ok && jj.schedule.enabled === true && jj.schedule.autoResume === true, 'POST schedule accepté (enabled+autoResume)');
  ok(jj.schedule.slots.length === 1 && jj.schedule.slots[0].dow === 1 && jj.schedule.slots[0].hm === '09:00', 'créneaux invalides filtrés (garde le valide)');
  ok(jj.schedule.suction === 'strong' && jj.schedule.minBatt === 25, 'aspiration + batterie mini validées');
  const saved = JSON.parse(await e._m.get('tuya:schedule'));
  ok(saved && saved.enabled === true, 'programmation persistée en KV');
} finally { globalThis.fetch = realFetch; }

console.log(`Tuya schedule engine test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
