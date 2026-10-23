/* VUE ADMIN ⇄ VUE MEMBRE + PAGES PRIVÉES FERMÉES (Kevin 23.10.2026 : « un bouton où je me connecte admin et je me déconnecte, comme dans la light,
   pour mon domaine ; pas connecté admin, tu simules que je suis abonné avec les meilleurs abonnements ; aucune fuite, aucun bouton, aucune possibilité
   pour les autres d'atterrir dans ma partie »). Vrai routeur (worker.js), hébergeur simulé. Prouve :
   1. un MEMBRE du domaine (fiche sans périmètre = tout le domaine) n'ouvre AUCUNE page privée de l'admin (page ni fichier) ; l'admin les ouvre ;
   2. /__admin/vue : 403 pour un membre ; l'admin bascule en vue membre et revient ;
   3. whoami de l'admin en vue membre : admin:false, apercu:'membre', abonnement:'max' ; un MEMBRE qui se fabrique le cookie n'obtient RIEN de plus ;
   4. déconnexion = cookie de vue effacé ; le bouton n'est dans la page que pour les appareils de Kevin (marqueur kdmc_k).
   SABOTAGE=1 : retire les portes ajoutées → (1) doit rougir.   node vue-admin.test.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, createHmac } from 'crypto';
let mod;
if (process.env.SABOTAGE) {
  const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8').replace(/\n  \{ dossier: '[^']+', niveau: 'admin', verrou: \(\) => priveLock\([^\n]*\},/g, '');
  const f = new URL('./__sabotage-vue-admin.mjs', import.meta.url); writeFileSync(f, src); mod = (await import(f.href)).default;
} else mod = (await import('./worker.js')).default;
import { INSTALLER_JS } from './installer-client.js';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input); };
const NAV = { 'sec-fetch-dest': 'document', accept: 'text/html' };
const va = async (url, extra, init) => { const r = await mod.fetch(new Request(url, Object.assign({ headers: Object.assign({}, (init && init.method) ? {} : NAV, extra || {}) }, init || {})), env, { waitUntil() {} });
  const t = r.status === 302 ? '' : await r.text(); return { st: r.status, servi: /^CONTENU /.test(t), t, cookie: r.headers.get('set-cookie') || '' }; };

kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' }));   // membre « tout le domaine » (fiche d'avant le 15.09)
const anne = 'kdmc_sso=' + signe('anne-martin', 0);
const kevin = 'kdmc_sso=' + signe('kdmc_admin', 1);
const grant = signe('__kdmc_admin__', 1);

/* 1 — pages privées */
const PRIVEES = ['https://coffre.kd-mc.com/', 'https://bot.kd-mc.com/', 'https://dashboard.kd-mc.com/', 'https://sourcing.kd-mc.com/', 'https://kd-mc.com/admin/', 'https://kd-mc.com/admin/commerce.html', 'https://kd-mc.com/liens/',
  'https://kd-mc.com/clone/', 'https://kd-mc.com/empreinte/', 'https://cmcteams.kd-mc.com/tools/finances/', 'https://cmcteams.kd-mc.com/tools/messages/'];
for (const u of PRIVEES) {
  const m = await va(u, { cookie: anne }); ok(!m.servi && /espace privé|Réservé à l'administrateur/.test(m.t), 'MEMBRE → ' + u + ' : verrou admin, rien de servi  [' + m.st + ']');
  const a = await va(u, { 'x-kdmc-admin': grant }); ok(a.servi, 'ADMIN (code) → ' + u + ' s\'ouvre  [' + a.st + ']');
  const f = await va(u, { cookie: kevin }); ok(f.servi, 'ADMIN (Face ID, cookie du domaine) → ' + u + ' s\'ouvre  [' + f.st + ']');
  const v = await va(u, { cookie: kevin + '; kdmc_vue=membre' }); ok(v.servi, 'ADMIN en VUE MEMBRE → ' + u + ' s\'ouvre encore (il garde ses pages)  [' + v.st + ']');
}
for (const u of ['https://kd-mc.com/admin/admin.js', 'https://kd-mc.com/liens/liens.json', 'https://kd-mc.com/admin/tableau.js']) {
  const r = await mod.fetch(new Request(u, { headers: { cookie: anne } }), env, { waitUntil() {} }); const t = await r.text();
  ok(!/^CONTENU /.test(t), 'MEMBRE → fichier ' + u + ' : rien de servi  [' + r.status + ']');
}
/* ce qui reste ouvert aux membres (rien n'est cassé) */
for (const u of ['https://kd-mc.com/', 'https://osint.kd-mc.com/']) { const r = await va(u, { cookie: anne }); ok(r.st === 200 && !/espace privé/.test(r.t), 'MEMBRE → ' + u + ' reste ouvert  [' + r.st + ']'); }

/* 2 — le bouton */
const post = (corps, extra) => va('https://kd-mc.com/__admin/vue', Object.assign({ 'content-type': 'application/json', origin: 'https://kd-mc.com' }, extra), { method: 'POST', body: JSON.stringify(corps) });
{ const r = await post({ mode: 'membre' }, { cookie: anne }); ok(r.st === 403 && !/kdmc_vue=membre/.test(r.cookie), 'MEMBRE → /__admin/vue refusé (403), aucun cookie  [' + r.st + ']'); }
{ const r = await va('https://kd-mc.com/__admin/vue', { cookie: anne }, { method: 'GET' }); ok(r.st === 403, 'MEMBRE → GET /__admin/vue 403'); }
let ck = '';
{ const r = await post({ mode: 'membre' }, { cookie: kevin }); ck = r.cookie; ok(r.st === 200 && /kdmc_vue=membre/.test(r.cookie) && /Domain=\.kd-mc\.com/.test(r.cookie), 'ADMIN → bascule en vue membre (cookie sur tout le domaine)  [' + r.st + ']'); }
{ const r = await post({ mode: 'membre' }, { cookie: kevin, origin: 'https://pirate.example' }); ok(r.st === 403, 'bascule depuis un site extérieur → refusée'); }

/* 3 — whoami */
const who = async (c) => JSON.parse((await va('https://cmcteams.kd-mc.com/__sso/whoami', { cookie: c }, { method: 'GET' })).t);
{ const j = await who(kevin); ok(j.ok && j.admin === true && !j.apercu, 'ADMIN sans vue membre : admin:true'); }
{ const j = await who(kevin + '; kdmc_vue=membre'); ok(j.ok && j.admin === false && j.apercu === 'membre' && j.abonnement === 'max' && j.simulation === true, 'ADMIN en vue membre : admin:false, apercu membre, abonnement max (simulé)  ' + JSON.stringify({ a: j.admin, p: j.apercu, ab: j.abonnement })); }
{ const j = await who(anne + '; kdmc_vue=membre'); ok(j.ok && j.admin === false && !j.apercu && !j.abonnement, 'MEMBRE avec cookie fabriqué : rien de plus (ni apercu ni abonnement)'); }
{ const r = await post({ mode: 'admin' }, { cookie: kevin + '; kdmc_vue=membre' }); ok(r.st === 200 && /kdmc_vue=;/.test(r.cookie) && /Max-Age=0/.test(r.cookie), 'ADMIN → retour en vue admin (cookie effacé)'); }

/* 4 — déconnexion et bouton */
{ const r = await mod.fetch(new Request('https://kd-mc.com/__sso/logout', { method: 'POST' }), env, { waitUntil() {} }); const c = [...r.headers.entries()].filter(([k]) => k === 'set-cookie').map(([, v]) => v).join(' | ');
  ok(/kdmc_vue=;/.test(c), 'déconnexion : le cookie de vue est effacé'); }
ok(/kdmc_k=1/.test(INSTALLER_JS) && /data-kdmc-vue/.test(INSTALLER_JS) && /\/__admin\/vue/.test(INSTALLER_JS), 'le bouton 👑/👁 n\'apparaît que sur les appareils de Kevin (marqueur kdmc_k) et passe par /__admin/vue');

console.log('\n' + (fail ? '❌' : '✅') + ' vue admin / membre : ' + pass + ' OK / ' + fail + ' échec(s)'); process.exit(fail ? 1 : 0);
