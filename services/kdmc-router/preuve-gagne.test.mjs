/* LA SESSION PROUVÉE GAGNE (Kevin 5.10.2026 : « je me connecte à mon domaine, et CMCteams / la light me
   redemandent nom, prénom, U… alors que je devrais être reconnu automatiquement »).
   Cause mesurée : une app gardait un vieux laissez-passer « déclaré » (non prouvé) et l'envoyait en
   en-tête ; le domaine le lisait AVANT le cookie, donc la vraie session de Kevin (prouvée par le code
   admin ou Face ID, posée par le portail) était ignorée → whoami admin:false, /__admin/grant 403.
   Ici, le vrai routeur, sans réseau :
     1. cookie PROUVÉ (code admin) + en-tête périmé non prouvé → whoami admin:true, bon jeton rendu ; grant 200
     2. en-tête PROUVÉ + cookie non prouvé → l'en-tête garde la main (rien ne change)
     3. en-tête non prouvé + cookie non prouvé → l'en-tête garde la main (rien ne change)
     4. cookie prouvé mais RÉVOQUÉ (« déconnecter partout ») → ne gagne pas
     5. un inconnu (cookie non prouvé, en-tête au nom de Kevin non prouvé) → jamais admin
   node preuve-gagne.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './worker.js';
import { createHash, createHmac } from 'node:crypto';
const b64 = (b) => Buffer.from(b).toString('base64url');
const signe = (uid, verifie, iat) => { const p = b64(JSON.stringify({ u: uid, n: uid, c: 1, v: verifie ? 1 : 0, iat: iat || Date.now(), exp: Date.now() + 864e5 })); return p + '.' + b64(createHmac('sha256', 'sec').update(p).digest()); };
let ok = 0, ko = 0;
const t = (c, m, d) => {
  if (c) { ok++; } else { ko++; }
  console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`);
};
function envNeuf() {
  const store = new Map();
  const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
  return { store, env: { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS } };
}
const whoami = async (env, hdr) => (await mod.fetch(new Request('https://cmcteams.kd-mc.com/__sso/whoami', { headers: hdr }), env, { waitUntil() {} })).json();
const grant = async (env, hdr) => (await mod.fetch(new Request('https://cmcteams.kd-mc.com/__admin/grant', { headers: hdr }), env, { waitUntil() {} })).status;

await test('la session prouvée de Kevin n\'est plus masquée par un vieux laissez-passer', async () => {
console.log('\nLa session prouvée de Kevin n\'est plus masquée par un vieux laissez-passer\n');
{ /* 1 — le cas de Kevin : portail = code admin (cookie prouvé), app = vieux laissez-passer déclaré */
  const { env } = envNeuf();
  const r = await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '424242' }) }), env, { waitUntil() {} });
  const cookieKevin = ((r.headers.getSetCookie ? r.headers.getSetCookie() : []).find((c) => c.startsWith('kdmc_sso=')) || '').split(';')[0];
  const vieux = signe('kevin-desarzens', false);
  const w = await whoami(env, { authorization: 'Bearer ' + vieux, cookie: cookieKevin });
  t(w.ok && w.admin === true && w.verified === true, '1a. cookie prouvé + vieux laissez-passer en en-tête → reconnu ADMIN', JSON.stringify(w));
  t(w.remplace === true && typeof w.token === 'string' && w.token === cookieKevin.slice('kdmc_sso='.length), '1b. le bon laissez-passer est rendu à l\'app pour remplacer le vieux', JSON.stringify({ remplace: w.remplace, a: !!w.token }));
  t((await grant(env, { authorization: 'Bearer ' + vieux, cookie: cookieKevin })) === 200, '1c. /__admin/grant (écran du code CMCteams) : 200 malgré le vieux laissez-passer');
  const sans = await whoami(env, { cookie: cookieKevin });
  t(sans.ok && sans.admin === true && !sans.remplace, '1d. sans en-tête : inchangé (cookie seul → admin)');
}
{ /* 2 — en-tête prouvé, cookie non prouvé : l'en-tête garde la main */
  const { env } = envNeuf();
  const w = await whoami(env, { authorization: 'Bearer ' + signe('kdmc_admin', true), cookie: 'kdmc_sso=' + signe('marie-curie', false) });
  t(w.ok && w.uid === 'kdmc_admin' && w.admin === true && !w.remplace, '2. en-tête prouvé + cookie déclaré → l\'en-tête décide (inchangé)', JSON.stringify(w));
}
{ /* 3 — deux sessions déclarées : l'en-tête garde la main */
  const { env } = envNeuf();
  const w = await whoami(env, { authorization: 'Bearer ' + signe('jean-rossi', false), cookie: 'kdmc_sso=' + signe('marie-curie', false) });
  t(w.ok && w.uid === 'jean-rossi' && !w.remplace, '3. deux sessions non prouvées → l\'en-tête décide (inchangé)', JSON.stringify(w));
}
{ /* 4 — cookie prouvé mais révoqué */
  const { env, store } = envNeuf();
  store.set('acc:kdmc_admin', JSON.stringify({ uid: 'kdmc_admin', revoked_at: Date.now() }));
  const w = await whoami(env, { authorization: 'Bearer ' + signe('jean-rossi', false), cookie: 'kdmc_sso=' + signe('kdmc_admin', true, Date.now() - 60000) });
  t(w.uid === 'jean-rossi' && w.admin !== true, '4. cookie prouvé mais « déconnecté partout » → ne gagne pas', JSON.stringify(w));
  t((await grant(env, { authorization: 'Bearer ' + signe('jean-rossi', false), cookie: 'kdmc_sso=' + signe('kdmc_admin', true, Date.now() - 60000) })) === 403, '4b. et /__admin/grant reste fermé');
}
{ /* 5 — un inconnu qui se déclare Kevin (rien de prouvé) */
  const { env } = envNeuf();
  const w = await whoami(env, { authorization: 'Bearer ' + signe('kevin-desarzens', false), cookie: 'kdmc_sso=' + signe('kevin-desarzens', false) });
  t(w.admin !== true, '5. se déclarer « Kevin » sans preuve → jamais admin', JSON.stringify(w));
  t((await grant(env, { authorization: 'Bearer ' + signe('kevin-desarzens', false), cookie: 'kdmc_sso=' + signe('kevin-desarzens', false) })) === 403, '5b. et /__admin/grant reste fermé');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
assert.equal(ko, 0, ko + ' contrôle(s) en échec');
});
