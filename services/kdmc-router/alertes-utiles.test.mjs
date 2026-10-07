/* GARDE — SEULEMENT LES ALERTES UTILES, AVEC TOUTES LES INFOS (Kevin 4.10.2026 : « Pourquoi connexion suspecte ? … Ignore les alertes inutiles.
 * Je veux toutes les infos possibles »). Ses alertes « FR → US en 5 min », « US → FR en 26 min », « MC → US en 7 min » = le Relais privé iCloud de son
 * iPhone (sortie Cloudflare / Akamai), pas un déplacement. Prouve : changement de pays par un Relais privé / VPN / hébergeur (avant OU maintenant) → AUCUNE alerte ;
 * par des réseaux ordinaires → alerte, avec qui / app / appareil / lieu / opérateur / réseau / d'où il venait ; la boîte les déplie en lignes, écarte l'ancien format.
 * node services/kdmc-router/alertes-utiles.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { enrich, reseauMasque } from './worker.js';
import { lireBoite, _viderMemo, infosAlerte } from './boite.js';
import { schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 260) : ''}`); };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const req = (cf) => ({ cf, headers: new Headers({ 'CF-Connecting-IP': '203.0.113.7', 'user-agent': IPHONE, host: 'lingua.kd-mc.com', 'accept-language': 'fr-FR,fr;q=0.9' }), url: 'https://lingua.kd-mc.com/lecon' });
const ORANGE = { country: 'FR', city: 'Nice', region: 'Provence', asn: 3215, asOrganization: 'Orange S.A.', timezone: 'Europe/Paris' };
const MONACO = { country: 'MC', city: 'Monaco', region: 'Monaco', asn: 31122, asOrganization: 'Monaco Telecom', timezone: 'Europe/Monaco' };
const USA = { country: 'US', city: 'Ashburn', region: 'Virginia', asn: 7922, asOrganization: 'Comcast Cable', timezone: 'America/New_York' };
const RELAIS = { country: 'US', city: 'Washington', region: 'DC', asn: 13335, asOrganization: 'Cloudflare, Inc.', timezone: 'America/New_York' };
const VPN = { country: 'NL', city: 'Amsterdam', region: 'NH', asn: 9009, asOrganization: 'M247 Europe SRL (NordVPN)', timezone: 'Europe/Amsterdam' };
const pushes = [];
globalThis.fetch = async (u, o) => { if (String(u).includes('/send-all')) { pushes.push(JSON.parse(o.body).payload); return new Response('{"ok":true}', { status: 200 }); } return new Response('{}', { status: 200 }); };
const monde = () => { const m = new Map(); return { m, ACCOUNTS: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }, KDMC_SSO_SECRET: 'sec', KDMC_PUSH_URL: 'https://push.example.dev', KDMC_PUSH_TOKEN: 'tok' }; };
/* deux connexions du même compte à `min` minutes d'écart : la 1re depuis cf1, la 2e depuis cf2 */
async function deux(cf1, cf2, min, uid) {
  const env = monde(); uid = uid || 'marie-test';
  await enrich(env, req(cf1), uid, 'Marie Dupont', true);
  const a = JSON.parse(env.m.get('acc:' + uid)); a.last_seen = Date.now() - min * 60e3; env.m.set('acc:' + uid, JSON.stringify(a));
  pushes.length = 0;
  await enrich(env, req(cf2), uid, 'Marie Dupont', true);
  return { env, acc: JSON.parse(env.m.get('acc:' + uid)), log: JSON.parse(env.m.get('aud:log') || '[]'), pushes: pushes.slice() };
}
const geo = (r) => r.log.filter((e) => e.ev === 'geo_anomaly');

console.log('\nAlertes utiles, avec toutes les infos\n');
ok(reseauMasque(13335) && reseauMasque(36183) && reseauMasque(54113) && reseauMasque(0, true) && reseauMasque(8075) && !reseauMasque(3215) && !reseauMasque(31122) && !reseauMasque(7922), '1. réseaux qui masquent le pays : Cloudflare / Akamai / Fastly (Relais privé), VPN et hébergeurs (GitHub = Azure) oui ; Orange, Monaco Telecom, Comcast non');
let r = await deux(ORANGE, RELAIS, 5);
ok(!r.acc.anomaly && geo(r).length === 0 && r.pushes.filter((p) => /suspecte/.test(p.title)).length === 0, '2a. FR → US par le Relais privé iCloud (Cloudflare) en 5 min : AUCUNE alerte (le cas de Kevin)');
r = await deux(RELAIS, MONACO, 7);
ok(!r.acc.anomaly && geo(r).length === 0 && r.pushes.filter((p) => /suspecte/.test(p.title)).length === 0, '2b. US → MC en 7 min quand la connexion d\'AVANT passait par le Relais privé : aucune alerte');
r = await deux(ORANGE, VPN, 10);
ok(!r.acc.anomaly && geo(r).length === 0, '2c. FR → NL par un VPN : aucune alerte');
r = await deux(ORANGE, USA, 10);
ok(r.acc.anomaly && geo(r).length === 1 && r.pushes.filter((p) => /suspecte/.test(p.title)).length === 1, '3a. FR → US par des réseaux ORDINAIRES (Orange puis Comcast) en 10 min : l\'alerte part toujours (un vrai doute)');
const e = geo(r)[0];
ok(e.name === 'Marie Dupont' && e.uid === 'marie-test' && e.app === 'lingua.kd-mc.com' && e.page === '/lecon' && /iPhone/.test(e.device) && e.place === 'Ashburn, Virginia, US' && e.isp === 'Comcast Cable' && e.asn === '7922' && e.vpn === false && e.pays_precedent === 'FR' && e.lieu_precedent === 'Nice, Provence, FR' && e.isp_precedent === 'Orange S.A.' && e.asn_precedent === '3215' && e.mins === 10 && e.lang === 'fr-FR' && e.tz === 'America/New_York', '3b. le journal garde TOUT : qui, compte, app + page, appareil, lieu, opérateur, réseau, VPN, d\'où il venait, minutes, langue, fuseau', e);
ok(!JSON.stringify(r.log).includes('203.0.113.7'), '3c. jamais l\'adresse IP dans le journal');
const p = r.pushes.find((x) => /suspecte/.test(x.title));
ok(/Marie Dupont/.test(p.body) && /Nice, Provence, FR → Ashburn, Virginia, US/.test(p.body) && /Comcast Cable \(AS7922\)/.test(p.body) && /Orange S\.A\./.test(p.body) && /lingua/.test(p.body), '3d. la notification dit qui, d\'où à où, le réseau actuel, le réseau d\'avant, l\'app', p.body);
/* nouvel appareil : mêmes infos */
const env2 = monde(); await enrich(env2, req(ORANGE), 'm2', 'Marie Dupont', true);
const a2 = JSON.parse(env2.m.get('acc:m2')); a2.devices = ['desktop·Windows']; a2.last_seen = 0; env2.m.set('acc:m2', JSON.stringify(a2)); pushes.length = 0;
await enrich(env2, req(ORANGE), 'm2', 'Marie Dupont', true);
const nd = JSON.parse(env2.m.get('aud:log')).find((x) => x.ev === 'new_device');
ok(nd && nd.name === 'Marie Dupont' && nd.isp === 'Orange S.A.' && nd.asn === '3215' && /iPhone/.test(nd.device) && nd.app === 'lingua.kd-mc.com' && /Orange S\.A\. \(AS3215\)/.test(pushes[0].body), '4. « nouvel appareil » : même richesse (qui, appareil, lieu, opérateur, app) dans le journal et la notification', { nd, push: pushes[0] });
/* la boîte */
const db = (() => { const s = new DatabaseSync(':memory:'); const st = (sql, pp = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...pp) ?? null, all: async () => ({ results: s.prepare(sql).all(...pp) }), run: async () => { const rr = s.prepare(sql).run(...pp); return { meta: { changes: Number(rr.changes), last_row_id: Number(rr.lastInsertRowid) } }; }, _exec: () => s.prepare(sql).run(...pp) }); return { prepare: (q) => st(q), batch: async (l) => { for (const x of l) x._exec(); return []; } }; })();
await schemaCercle(db);
const T = Date.now();
const envB = { CERCLE_DB: db, ACCOUNTS: { get: async (k) => (k === 'aud:log' ? JSON.stringify([
  Object.assign({}, geo(r)[0], { ts: T - 1000 }),
  { ts: T - 2000, ev: 'geo_anomaly', uid: 'kdmc_admin', detail: 'FR → US en 5 min' },                       // ancien format (avant le 4.10) : réseau inconnu
  Object.assign({}, nd, { ts: T - 3000 }) ]) : null), put: async () => {} } };
_viderMemo();
const b = await lireBoite(envB, { fbToken: async () => '', fetch: async () => new Response('null') }, T);
const al = b.messages.filter((x) => x.source === 'alertes');
ok(al.length === 2 && !al.some((x) => x.texte === 'FR → US en 5 min'), '5a. la boîte écarte l\'ancien « FR → US en 5 min » (réseau inconnu : c\'était le Relais privé) et garde les alertes qui ont leur réseau', al.map((x) => x.texte));
const geoAl = al.find((x) => x.fil.some((f) => /suspecte/.test(f.texte)));
ok(geoAl.infos.some((l) => /👤 Marie Dupont \(marie-test\)/.test(l)) && geoAl.infos.some((l) => /📱 lingua\.kd-mc\.com\/lecon/.test(l)) && geoAl.infos.some((l) => /↔️ Avant : Nice, Provence, FR · Orange S\.A\. \(AS3215\) — il y a 10 min/.test(l)) && geoAl.infos.some((l) => /🛰️ Comcast Cable \(AS7922\)/.test(l)) && geoAl.infos.some((l) => /ni Relais privé iCloud, ni VPN/.test(l)), '5b. la carte d\'alerte se déplie : qui, app + page, d\'où il venait, réseau, et POURQUOI c\'est signalé', geoAl.infos);
ok(infosAlerte({ ev: 'new_device', name: 'A', uid: 'a', app: 'x.kd-mc.com', device: 'iPhone · iOS 18', os: 'iOS', place: 'Nice', isp: 'Orange', asn: '3215', vpn: true, lang: 'fr', tz: 'Europe/Paris' }).length === 6, '5c. toutes les lignes d\'info sont produites (compte, app, appareil, lieu, réseau + VPN, langue + fuseau)');
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
