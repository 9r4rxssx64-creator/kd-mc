/* Test de la sentinelle « robot en surface » (tuyaSurfaceCheck).
   Le robot piscine n'émet pas sous l'eau : la sentinelle détecte la transition
   hors-ligne → EN LIGNE via Tuya et pousse UNE notif (anti-spam : transition
   seule + throttle 15 min). Mocks : KV + cloud Tuya + worker de push.
   node tuya-surface.test.mjs */
import { tuyaSurfaceCheck } from './worker.js';

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* KV mock */
function mkKV(init) {
  const m = new Map(Object.entries(init || {}));
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); }, _m: m };
}
/* env avec Tuya lié + token déjà en cache (pas de mint) + push configuré */
function mkEnv(kvInit) {
  const kv = mkKV(Object.assign({
    'tuya:cfg': JSON.stringify({ access_id: 'cid', access_secret: 'sec', host: 'openapi.tuyaeu.com', region: 'eu', device_id: 'dev1' }),
    'tuya:token': JSON.stringify({ token: 'tok', exp: Date.now() + 3600000 }),
  }, kvInit || {}));
  return { ACCOUNTS: kv, KDMC_PUSH_URL: 'https://push.example', KDMC_PUSH_TOKEN: 'ptok', _kv: kv };
}
/* fetch mock : cloud Tuya (online paramétrable) + push (capturé) */
const pushes = [];
let deviceOnline = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, opts) => {
  const u = typeof input === 'string' ? input : input.url;
  if (u.includes('push.example')) { pushes.push(JSON.parse((opts && opts.body) || '{}')); return new Response('{"ok":true}', { status: 200 }); }
  if (u.includes('/v1.0/devices/dev1/status')) return new Response(JSON.stringify({ success: true, result: [{ code: 'electricity_left', value: 77 }] }), { status: 200 });
  if (u.includes('/v1.0/devices/dev1')) return new Response(JSON.stringify({ success: true, result: { online: deviceOnline, name: 'AquaSense' } }), { status: 200 });
  return realFetch(input, opts);
};

try {
  /* 1) non lié → no-op propre */
  let r = await tuyaSurfaceCheck({ ACCOUNTS: mkKV() });
  ok(r.ok && r.skip === 'not_linked', 'non lié → no-op (skip not_linked)');

  /* 2) robot sous l'eau (hors ligne) → état mémorisé, pas de notif */
  const env = mkEnv();
  deviceOnline = false;
  r = await tuyaSurfaceCheck(env);
  ok(r.ok && r.online === false && !r.notified && pushes.length === 0, 'hors ligne → mémorisé, 0 notif');

  /* 3) REMONTÉE (hors-ligne → en ligne) → notif poussée avec batterie */
  deviceOnline = true;
  r = await tuyaSurfaceCheck(env);
  ok(r.ok && r.notified === true && r.batt === 77, 'transition → notif envoyée (batt 77%)');
  ok(pushes.length === 1 && /surface/i.test(pushes[0].payload.title) && /77%/.test(pushes[0].payload.body), 'payload push : titre surface + batterie');
  ok(pushes[0].payload.url === 'https://beatbot.kd-mc.com/', 'notif ouvre PoolPilot');

  /* 4) toujours en ligne → PAS de re-notif (transition seule) */
  r = await tuyaSurfaceCheck(env);
  ok(r.ok && !r.notified && pushes.length === 1, 'reste en ligne → 0 notif supplémentaire');

  /* 5) re-plongée puis re-remontée < 15 min → throttlé */
  deviceOnline = false; await tuyaSurfaceCheck(env);
  deviceOnline = true; r = await tuyaSurfaceCheck(env);
  ok(r.ok && !r.notified && r.throttled === true && pushes.length === 1, 're-remontée <15 min → throttlée (anti-spam)');

  /* 6) re-remontée avec throttle expiré → nouvelle notif */
  env._kv._m.set('tuya:surf_notif', String(Date.now() - 16 * 60 * 1000));
  deviceOnline = false; await tuyaSurfaceCheck(env);
  deviceOnline = true; r = await tuyaSurfaceCheck(env);
  ok(r.ok && r.notified === true && pushes.length === 2, 'throttle expiré → notifie à nouveau');

  /* 7) cloud Tuya en erreur → échec propre, jamais d'exception */
  const envErr = mkEnv();
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, msg: 'boom' }), { status: 200 });
  r = await tuyaSurfaceCheck(envErr);
  ok(r.ok === false && !!r.reason, 'erreur Tuya → {ok:false, reason} sans throw');
} finally { globalThis.fetch = realFetch; }

console.log(`Tuya surface sentinel test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
