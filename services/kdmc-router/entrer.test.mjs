/* ENTRER PAR N'IMPORTE QUELLE PORTE — /__sso/entrer (Kevin 27.09.2026 : « reconnu par n'importe quel
   chemin sur mes appareils »). Une app installée (cookies isolés) reçoit son cookie de session
   directement dans SON stockage, sur SON adresse, et arrive sur une page propre.
   Prouvé discriminant : retirer la route → 1, 2, 5 échouent ; retirer le contrôle de `to` → 4 échoue ;
   retirer la vérification du pass → 3 échoue.
   node services/kdmc-router/entrer.test.mjs */
import mod from './worker.js';
import { createHmac } from 'crypto';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v, exp) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: exp || Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const entrer = (host, q) => mod.fetch(new Request('https://' + host + '/__sso/entrer?' + q), env, { waitUntil() {} });
const cookies = (r) => r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];

console.log('\n/__sso/entrer : le laissez-passer déposé dans le stockage de l\'app installée\n');
const tok = signe('marie-curie', 0);
{ const r = await entrer('cmcteams.kd-mc.com', 'to=' + encodeURIComponent('/?v=1#plan') + '&t=' + encodeURIComponent(tok));
  const c = cookies(r).join('|');
  ok(r.status === 302 && r.headers.get('location') === '/?v=1#plan' && c.includes('kdmc_sso=' + tok) && /HttpOnly/.test(c) && /Domain=\.kd-mc\.com/.test(c),
    '1. CMCteams (app à routeur « # ») : cookie de session posé + retour sur la page demandée, adresse propre', `${r.status} ${r.headers.get('location')} ${c.slice(0, 60)}`); }
{ const r = await entrer('arbre.kd-mc.com', 't=' + encodeURIComponent(tok));
  ok(r.status === 302 && r.headers.get('location') === '/' && cookies(r).join('|').includes('kdmc_sso='), '2. sans `to` → la racine de l\'app'); }
{ const r = await entrer('cuisine.kd-mc.com', 'to=%2F&t=' + encodeURIComponent(tok.slice(0, -3) + 'xxx'));
  ok(r.status === 302 && !cookies(r).join('|').includes('kdmc_sso='), '3. pass falsifié → on renvoie vers la page mais AUCUN cookie posé'); }
{ const r = await entrer('cuisine.kd-mc.com', 'to=' + encodeURIComponent('https://attaquant.example/') + '&t=' + encodeURIComponent(tok));
  const r2 = await entrer('cuisine.kd-mc.com', 'to=' + encodeURIComponent('//attaquant.example/') + '&t=' + encodeURIComponent(tok));
  ok(r.headers.get('location') === '/' && r2.headers.get('location') === '/', '4. `to` vers une autre adresse → ignoré (jamais de redirection ouverte)', r.headers.get('location') + ' ' + r2.headers.get('location')); }
{ const grant = signe('__kdmc_admin__', 1);
  const r = await entrer('beatbot.kd-mc.com', 'to=%2F&t=' + encodeURIComponent(signe('kdmc_admin', 1)) + '&g=' + encodeURIComponent(grant));
  const c = cookies(r).join('|');
  ok(c.includes('kdmc_sso=') && c.includes('kdmc_admin=' + grant) && /Max-Age=43200/.test(c.split('|').find((x) => x.startsWith('kdmc_admin')) || ''),
    '5. le grant admin (porte du robot piscine, autorisations) suit aussi, 12 h maximum', c.slice(0, 120)); }
{ const r = await entrer('beatbot.kd-mc.com', 'to=%2F&t=' + encodeURIComponent(tok) + '&g=' + encodeURIComponent(signe('marie-curie', 1)));
  ok(!cookies(r).join('|').includes('kdmc_admin='), '6. un faux grant (signé pour un autre uid) n\'est PAS posé'); }
{ kv.set('acc:revoque', JSON.stringify({ uid: 'revoque', revoked_at: Date.now() + 1000 }));
  const r = await entrer('cuisine.kd-mc.com', 'to=%2F&t=' + encodeURIComponent(signe('revoque', 0)));
  ok(!cookies(r).join('|').includes('kdmc_sso='), '7. une session révoquée (« Déconnecter partout ») n\'entre pas'); }
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
