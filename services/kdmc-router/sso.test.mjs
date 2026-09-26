/* Test régression SSO transverse kd-mc.com (router). Lance: node sso.test.mjs
   Prouve la logique HMAC issue→whoami sans navigateur (sandbox-friendly). */
import mod from './worker.js';
const env = { KDMC_SSO_SECRET: 'test-secret-123' };
const H = (o) => new Request('https://apex-ai.kd-mc.com' + o.path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

let r = await mod.fetch(H({ path: '/__sso/whoami' }), env); let j = await r.json();
ok(j.ok === false, 'whoami sans cookie → ok:false');

r = await mod.fetch(H({ path: '/__sso/issue', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: 'kdmc_admin', name: 'Kevin Desarzens', cgu: true }) }), env);
j = await r.json();
const sc = r.headers.get('set-cookie') || '';
ok(j.ok === true && j.uid === 'kdmc_admin' && j.cgu === true, 'issue → ok+uid+cgu');
ok(/Domain=\.kd-mc\.com/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc), 'cookie .kd-mc.com HttpOnly Secure SameSite=Lax');
const token = (sc.match(/kdmc_sso=([^;]+)/) || [])[1];

r = await mod.fetch(H({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + token } }), env); j = await r.json();
ok(j.ok === true && j.uid === 'kdmc_admin' && j.name === 'Kevin Desarzens' && j.cgu === true, 'whoami avec cookie → identité + cgu');

r = await mod.fetch(H({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + token.slice(0, -2) + 'XY' } }), env); j = await r.json();
ok(j.ok === false, 'token falsifié → rejeté (HMAC)');

r = await mod.fetch(H({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + token } }), { KDMC_SSO_SECRET: 'autre' }); j = await r.json();
ok(j.ok === false, 'mauvais secret → rejeté (forge impossible)');

// Canal Bearer (pass signé) — cross-PWA iOS : whoami via Authorization header SANS cookie
r = await mod.fetch(H({ path: '/__sso/whoami', headers: { authorization: 'Bearer ' + token } }), env); j = await r.json();
// SÉCU (leçon #99) : un uid admin AUTO-DÉCLARÉ (issue, sans Face ID) → admin:false.
// L'admin n'est vrai qu'après un passkey vérifié (couvert par webauthn.test.mjs).
ok(j.ok === true && j.uid === 'kdmc_admin' && j.verified === false && j.admin === false, 'whoami via Bearer (issue, non-vérifié) → identité, admin:false (nom auto-déclaré ≠ admin)');
// issue renvoie le token dans le corps (pour le mettre dans le lien de retour)
r = await mod.fetch(H({ path: '/__sso/issue', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: 'laurence_sp', name: 'Laurence Saint-Polit', cgu: true }) }), env); j = await r.json();
ok(j.ok === true && typeof j.token === 'string' && j.token.indexOf('.') > 0 && j.admin === false, 'issue → token signé dans le corps + admin:false pour client');
r = await mod.fetch(H({ path: '/__sso/whoami', headers: { authorization: 'Bearer ' + j.token } }), env); let j2 = await r.json();
ok(j2.ok === true && j2.uid === 'laurence_sp', 'le token du corps est valide en Bearer');
r = await mod.fetch(H({ path: '/__sso/whoami', headers: { authorization: 'Bearer pas.un.vrai.token' } }), env); j = await r.json();
ok(j.ok === false, 'Bearer falsifié → rejeté');

r = await mod.fetch(H({ path: '/__sso/logout', method: 'POST' }), env);
ok((r.headers.get('set-cookie') || '').includes('Max-Age=0'), 'logout → cookie effacé');

r = await mod.fetch(H({ path: '/__sso/whoami' }), {}); j = await r.json();
ok(j.ok === false && j.reason === 'sso_not_configured', 'pas de secret → fail-open');

console.log(`SSO router test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
