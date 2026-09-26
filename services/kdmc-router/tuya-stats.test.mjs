/* Tests du collecteur d'HISTORIQUE AUTO PoolPilot : détection des cycles terminés
   (clean_time/clean_area), anti-doublon, référence gelée pendant un nettoyage,
   endpoint /stats. Déterministe. node tuya-stats.test.mjs */
import mod from './worker.js';
import { tuyaHistoryTick } from './worker.js';
import { createHash, createHmac } from 'crypto';

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

const CFG = { access_id: 'cid', access_secret: 'sec', host: 'openapi.tuyaeu.com', region: 'eu', device_id: 'bf62' };
function mkEnv() { const m = new Map([['tuya:cfg', JSON.stringify(CFG)]]); return { ACCOUNTS: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => m.set(k, String(v)), delete: async (k) => m.delete(k) }, _m: m }; }

/* Simulateur cloud Tuya : status + compteurs de session paramétrables */
const realFetch = globalThis.fetch;
function setRobot({ status = 'standby', ct = 0, ca = 0, batt = 100, temp = 26, fw = 48, mode = 'fast' } = {}) {
  globalThis.fetch = async (input) => {
    const u = typeof input === 'string' ? input : input.url; const url = new URL(u);
    if (url.pathname === '/v1.0/token') return new Response(JSON.stringify({ success: true, result: { access_token: 'tok', expire_time: 7200 } }), { status: 200 });
    if (/\/shadow\/properties$/.test(url.pathname)) return new Response(JSON.stringify({ success: true, result: { properties: [{ code: 'status', value: status }, { code: 'battery_percentage', value: batt }, { code: 'clean_time', value: ct }, { code: 'clean_area', value: ca }, { code: 'water_temperature', value: temp }, { code: 'filtered_water', value: fw }, { code: 'mode', value: mode }] } }), { status: 200 });
    if (/\/devices\/[^/]+\/status$/.test(url.pathname)) return new Response(JSON.stringify({ success: true, result: [{ code: 'status', value: status }, { code: 'battery_percentage', value: batt }, { code: 'clean_time', value: ct }, { code: 'clean_area', value: ca }] }), { status: 200 });
    if (/\/devices\/[^/]+$/.test(url.pathname)) return new Response(JSON.stringify({ success: true, result: { online: true, name: 'AquaSense 2 Ultra' } }), { status: 200 });
    return realFetch(input);
  };
}
const getJ = async (e, k) => { const v = await e.ACCOUNTS.get(k); return v ? JSON.parse(v) : null; };

try {
  const e = mkEnv();

  /* 1) première observation : référence mémorisée, AUCUNE session inventée */
  setRobot({ status: 'standby', ct: 120, ca: 30 });
  let r = await tuyaHistoryTick(e);
  ok(r.ok === true && r.first === true && !(await getJ(e, 'tuya:sessions')), 'premier tick = référence seulement, rien d\'enregistré');

  /* 2) valeurs identiques → rien */
  r = await tuyaHistoryTick(e);
  ok(r.ok === true && r.recorded === false, 'valeurs inchangées → pas de session');

  /* 3) nettoyage EN COURS avec compteurs qui bougent → pas encore enregistré, référence GELÉE */
  setRobot({ status: 'cleaning', ct: 40, ca: 12, batt: 70 });
  r = await tuyaHistoryTick(e);
  const refPendant = await getJ(e, 'tuya:lastdp');
  ok(r.recorded === false && refPendant.ct === 120, 'pendant le nettoyage : rien enregistré, référence gelée');

  /* 4) fin de cycle (standby, compteurs finaux ≠ référence) → session RÉELLE enregistrée */
  setRobot({ status: 'standby', ct: 95, ca: 22, batt: 41 });
  r = await tuyaHistoryTick(e);
  let sess = await getJ(e, 'tuya:sessions'); let stats = await getJ(e, 'tuya:stats');
  ok(r.recorded === true && sess.length === 1 && sess[0].dur === 95 && sess[0].area === 22 && sess[0].batt === 41, 'cycle terminé → session {95 min, 22 m², 41%}');
  ok(stats && stats.count === 1 && stats.minutes === 95 && stats.m2 === 22, 'compteurs cumulés à jour (1 cycle, 95 min, 22 m²)');

  /* 5) re-tick mêmes valeurs → PAS de doublon */
  r = await tuyaHistoryTick(e);
  sess = await getJ(e, 'tuya:sessions');
  ok(r.recorded === false && sess.length === 1, 'anti-doublon : mêmes compteurs → pas de 2e session');

  /* 6) cycle RATÉ (robot sous l\'eau hors wifi, jamais vu « cleaning ») : les compteurs
     ont changé entre 2 ticks → cycle quand même détecté */
  setRobot({ status: 'charging', ct: 130, ca: 31, batt: 15 });
  r = await tuyaHistoryTick(e);
  sess = await getJ(e, 'tuya:sessions'); stats = await getJ(e, 'tuya:stats');
  ok(r.recorded === true && sess.length === 2 && sess[0].dur === 130 && stats.count === 2 && stats.minutes === 225, 'cycle raté (hors wifi) détecté par le changement des compteurs');

  /* 7) reset compteur à 0 (début de session) → jamais enregistré comme cycle */
  setRobot({ status: 'standby', ct: 0, ca: 0 });
  r = await tuyaHistoryTick(e);
  sess = await getJ(e, 'tuya:sessions');
  ok(r.recorded === false && sess.length === 2, 'compteur remis à 0 → pas une session');

  /* 7bis) robot qui fait SURFACE mi-cycle (emerge, compteurs partiels) → PAS de session
     partielle, référence gelée ; puis clean_done → UNE seule session complète */
  setRobot({ status: 'emerge', ct: 40, ca: 9, batt: 70 });
  r = await tuyaHistoryTick(e);
  const refEmerge = await getJ(e, 'tuya:lastdp');
  ok(r.recorded === false && refEmerge.ct === 0, 'mi-cycle (emerge) : pas de session partielle, référence gelée');
  setRobot({ status: 'clean_done', ct: 110, ca: 25, batt: 30 });
  r = await tuyaHistoryTick(e);
  sess = await getJ(e, 'tuya:sessions');
  ok(r.recorded === true && sess.length === 3 && sess[0].dur === 110, 'clean_done → UNE session complète (110 min, pas 40+110)');

  /* 7ter) INSTANTANÉS : chaque changement observé est archivé, les valeurs identiques non */
  let snaps = await getJ(e, 'tuya:snaps');
  const nSnaps = snaps.length;
  ok(nSnaps >= 5 && snaps[0].temp === 26 && snaps[0].fw === 48 && snaps[0].mode === 'fast', 'instantanés archivés à chaque changement (avec température/eau filtrée/mode)');
  r = await tuyaHistoryTick(e); /* aucune valeur ne bouge */
  snaps = await getJ(e, 'tuya:snaps');
  ok(snaps.length === nSnaps, 'valeurs inchangées → pas de nouvel instantané (anti-spam)');

  /* 8) endpoint GET /stats (admin) renvoie sessions + compteurs */
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signSso = (s, uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', s).update(p).digest()); };
  e.KDMC_SSO_SECRET = 'sso'; e.KDMC_ADMIN_PIN_SHA256 = createHash('sha256').update('424242').digest('hex');
  const req = new Request('https://beatbot.kd-mc.com/__beatbot/tuya/stats', { headers: { 'x-kdmc-admin': signSso('sso', '__kdmc_admin__') } });
  const res = await mod.fetch(req, e); const jj = await res.json();
  ok(jj.ok === true && jj.stats.count === 3 && jj.sessions.length === 3 && jj.sessions[0].dur === 110 && Array.isArray(jj.snaps) && jj.snaps.length > 0, 'endpoint /stats : compteurs + sessions + instantanés renvoyés');

  /* 9) BASELINE officielle (fiche Beatbot 26 cycles / 148.3 h) : POST puis totaux = base + auto */
  const bReq = new Request('https://beatbot.kd-mc.com/__beatbot/tuya/stats', { method: 'POST', headers: { 'x-kdmc-admin': signSso('sso', '__kdmc_admin__'), 'content-type': 'application/json' }, body: JSON.stringify({ baseCount: 26, baseMinutes: 8898, source: 'Fiche de Nettoyage Beatbot' }) });
  const bRes = await mod.fetch(bReq, e); const bj = await bRes.json();
  ok(bj.ok === true && bj.stats.baseCount === 26 && bj.stats.baseMinutes === 8898 && bj.stats.count === 3, 'baseline posée SANS écraser les relevés auto (26 base + 3 auto)');
  const res2 = await mod.fetch(req, e); const j2 = await res2.json();
  ok(j2.ok === true && j2.stats.baseCount === 26 && j2.stats.count === 3, 'GET /stats renvoie base + auto (totaux app = 29 cycles)');
} finally { globalThis.fetch = realFetch; }

console.log(`Tuya history/stats test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
