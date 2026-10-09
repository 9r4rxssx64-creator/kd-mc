/* GARDE — revue extérieure du 8.10.2026 (routeur) : trois trous fermés, prouvés discriminants.
 *   1. /__sso/entrer : le grant admin (12 h d'admin) voyageait EN CLAIR dans l'adresse (`g=`) → journaux, historique. Désormais il ne passe
 *      que dans l'enveloppe signée `h` (90 s) rendue par /__sso/pass ; `g=` en clair est ignoré, `t=` seul reste accepté (session, pas le grant).
 *   2. /__lingua/ai : Origin/Referer se falsifient → une SESSION du domaine est exigée (401 sinon) ; et le plafond est FERMÉ si le KV tombe.
 *   3. le coach Lingua ne part que dans la chaîne GRATUITE ; les payantes seulement avec BEE_SECOURS_PAYANT=1.
 * SABOTAGE (prouvé à la main le 8.10) : lire `g` dans l'adresse → 1c rougit ; `catch { return true }` dans souslePlafond → 2c rougit ;
 * retirer `chain:` → 3 rougit. node services/kdmc-router/porte-enveloppe.test.mjs */
import { createHash, createHmac } from 'node:crypto';
import mod, { chaineGratuite } from './worker.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 240) : ''}`); };
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const call = (path, o = {}, e = env) => mod.fetch(new Request('https://kd-mc.com' + path, { method: o.method || 'GET', redirect: 'manual', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, o.headers || {}), body: o.body === undefined ? undefined : JSON.stringify(o.body) }), e, { waitUntil() {} });
const cookies = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']).join('|');
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (corps) => { const p = b64u(JSON.stringify(corps)); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

console.log('\n== 1. La porte /__sso/entrer : le grant admin ne voyage plus en clair ==');
const login = await call('/__admin/login', { method: 'POST', body: { code: '424242' } }); const lj = await login.json();
const grant = (cookies(login).match(/kdmc_admin=([^;]+)/) || [])[1] || '';
ok(lj.ok === true && lj.token && grant, '1.0 (décor) code admin prouvé → session vérifiée + grant', lj);
const pass1 = await (await call('/__sso/pass', { headers: { authorization: 'Bearer ' + lj.token, cookie: 'kdmc_admin=' + grant } })).json();
ok(pass1.ok === true && typeof pass1.porte === 'string' && pass1.porte.indexOf('.') > 0 && pass1.grant === grant, '1a. /__sso/pass rend une ENVELOPPE signée (porte), en plus du pass', pass1);
let r = await call('/__sso/entrer?to=%2Fapp&h=' + encodeURIComponent(pass1.porte));
ok(r.status === 302 && r.headers.get('location') === '/app' && /kdmc_sso=/.test(cookies(r)) && /kdmc_admin=/.test(cookies(r)) && r.headers.get('referrer-policy') === 'no-referrer', '1b. l\'enveloppe dépose la session ET le grant dans l\'app installée, sans Referer', { st: r.status, c: cookies(r).slice(0, 80) });
r = await call('/__sso/entrer?to=%2Fapp&t=' + encodeURIComponent(lj.token) + '&g=' + encodeURIComponent(grant));
ok(r.status === 302 && /kdmc_sso=/.test(cookies(r)) && !/kdmc_admin=/.test(cookies(r)), '1c. le grant EN CLAIR dans l\'adresse (`g=`) est IGNORÉ : la session passe, l\'admin non (SABOTAGE : relire `g` → rouge)', cookies(r).slice(0, 120));
const perimee = signe({ t: lj.token, g: grant, exp: Date.now() - 1000 });
r = await call('/__sso/entrer?to=%2Fapp&h=' + encodeURIComponent(perimee));
ok(r.status === 302 && !/kdmc_sso=/.test(cookies(r)) && !/kdmc_admin=/.test(cookies(r)), '1d. une enveloppe périmée (90 s passées) ne dépose rien', cookies(r));
const falsifiee = pass1.porte.slice(0, -3) + 'abc';
r = await call('/__sso/entrer?to=%2Fapp&h=' + encodeURIComponent(falsifiee));
ok(!/kdmc_admin=/.test(cookies(r)) && !/kdmc_sso=/.test(cookies(r)), '1e. une enveloppe falsifiée ne dépose rien');
{ const sso = (await import('node:fs')).readFileSync(new URL('../../kdmc-home/kdmc-sso.js', import.meta.url), 'utf8');
  const porte = sso.slice(sso.indexOf('function porte(url)'), sso.indexOf('function adminCode('));
  ok(/&h=' \+ encodeURIComponent\(j\.porte\)/.test(porte) && !/&g=/.test(porte), '1f. le client SSO passe par l\'enveloppe (h=) et n\'écrit plus jamais g= dans une adresse'); }

console.log('\n== 2. /__lingua/ai : un compte, et un plafond qui reste fermé quand le KV tombe ==');
const lingua = (headers, e = env) => mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', referer: 'https://lingua.kd-mc.com/', host: 'lingua.kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: JSON.stringify({ langName: 'anglais', messages: [{ role: 'user', text: 'Hello' }] }) }), e, { waitUntil() {} });
r = await lingua({}); let j = await r.json();
ok(r.status === 401 && j.reason === 'session_requise', '2a. sans session (Referer du domaine seulement, = un curl) → 401, aucune IA appelée', j);
const sess = signe({ u: 'eleve-porte', n: 'Élève Porte', c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e8 });
const AI = { run: async () => ({ response: 'Hi!' }) };
r = await lingua({ authorization: 'Bearer ' + sess }, Object.assign({}, env, { AI })); j = await r.json();
ok(r.status === 200 && j.ok === true && /Hi/.test(j.reply || ''), '2b. avec la session du domaine → le coach répond (IA gratuite)', j);
const KV_MORT = { get: async () => { throw new Error('kv en panne'); }, put: async () => { throw new Error('kv en panne'); }, delete: async () => {} };
r = await lingua({ authorization: 'Bearer ' + sess }, Object.assign({}, env, { AI, ACCOUNTS: KV_MORT })); j = await r.json();
ok(j.ok === false && j.reason === 'plafond_atteint', '2c. KV en panne → le plafond REFUSE (fermé), il ne s\'ouvre plus en grand (SABOTAGE : catch → true rougit)', j);

console.log('\n== 3. Le coach ne part que dans la chaîne gratuite ==');
const E = { AI, GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', OPEN_AI_API_KEY: 'o' };
const c1 = chaineGratuite(E, 'translation'), c2 = chaineGratuite(Object.assign({ BEE_SECOURS_PAYANT: '1' }, E), 'translation');
ok(c1.length > 0 && !c1.some((p) => /anthropic|openai/.test(p)), '3a. interrupteur éteint : ni Anthropic ni OpenAI dans la chaîne du coach (' + c1.join(', ') + ')', c1);
ok(c2.some((p) => /anthropic|openai/.test(p)) && c2.indexOf(c1[0]) === 0, '3b. interrupteur à 1 : les payantes viennent APRÈS les gratuites', c2);
{ const src = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const bloc = src.slice(src.indexOf("url.pathname === '/__lingua/ai'"), src.indexOf("url.pathname === '/__lingua/ai'") + 20000);
  ok((bloc.match(/chain: chaineGratuite\(env, 'translation'\)/g) || []).length === 2, '3c. les 2 appels IA du coach (bilan d\'appel, conversation) passent la chaîne gratuite'); }

console.log('\n== 4. La sonde déclarée ne passe la porte que depuis nos robots (GitHub Actions) ==');
const page = (host, path, headers, cf, e = env) => { const r = new Request('https://' + host + path, { headers: Object.assign({ 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': 'curl/8', 'cf-connecting-ip': '198.51.100.7' }, headers) }); Object.defineProperty(r, 'cf', { value: cf }); return mod.fetch(r, e, { waitUntil() {} }); };
r = await page('lingua.kd-mc.com', '/', { 'x-kdmc-sonde': 'deploy' }, { asn: 16509, city: 'Dublin', country: 'IE' });
ok(r.headers.get('x-kdmc-porte') === 'fiche', '4a. en-tête de sonde depuis AWS (16509) → la porte « fiche » reste fermée (SABOTAGE : ASN_NUAGES à la place d\'ASN_SONDE → rouge)', { porte: r.headers.get('x-kdmc-porte'), st: r.status });
r = await page('lingua.kd-mc.com', '/', { 'x-kdmc-sonde': 'deploy' }, { asn: 8075, city: 'Dublin', country: 'IE' });
ok(!r.headers.get('x-kdmc-porte'), '4b. la même sonde depuis GitHub Actions (Azure 8075) passe, comme avant', { porte: r.headers.get('x-kdmc-porte'), st: r.status });

console.log('\n== 5. Les données RH : même périmètre que la page, et jamais sans code ==');
const E0 = Object.assign({}, env, { KDMC_PORTE_TOTALE: '0' });   /* la porte totale coupée : seule la porte des données RH joue */
kv.set('acc:rh-bloque', JSON.stringify({ uid: 'rh-bloque', name: 'Rh Bloque', code_at: 1, bloque: ['departs'] }));
const sBloque = signe({ u: 'rh-bloque', n: 'Rh Bloque', c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 1e8 });
r = await page('cmcteams-light.kd-mc.com', '/boards-gen.js', { authorization: 'Bearer ' + sBloque, 'sec-fetch-dest': 'script' }, { asn: 6758, city: 'Monaco', country: 'MC' }, E0);
ok(r.status === 401 && r.headers.get('x-kdmc-donnees') === 'rh', '5a. bloqué sur la light (« departs ») par l\'admin → la light ne reçoit pas le planning (avant : jugé sur « cmcteams » en dur)', { st: r.status, d: r.headers.get('x-kdmc-donnees') });
r = await page('cmcteams.kd-mc.com', '/tools/departs/boards-gen.js', { authorization: 'Bearer ' + sBloque, 'sec-fetch-dest': 'script' }, { asn: 6758, city: 'Monaco', country: 'MC' }, E0);
ok(r.status !== 401, '5b. … mais CMCteams (non bloqué) le reçoit : le périmètre est celui de l\'app qui demande', { st: r.status });
kv.set('acc:rh-sans-code', JSON.stringify({ uid: 'rh-sans-code', name: 'Rh Sans Code' }));
const sSans = signe({ u: 'rh-sans-code', n: 'Rh Sans Code', c: 1, v: 0, k: 0, iat: Date.now(), exp: Date.now() + 1e8 });
r = await page('cmcteams.kd-mc.com', '/tools/departs/boards-gen.js', { authorization: 'Bearer ' + sSans, 'sec-fetch-dest': 'script' }, { asn: 6758, city: 'Monaco', country: 'MC' }, E0);
ok(r.status === 401 && r.headers.get('x-kdmc-donnees') === 'rh', '5c. un compte SANS code ne reçoit pas les données RH, même porte totale coupée (SABOTAGE : retirer codeManquant → rouge)', { st: r.status });

console.log('\n== 6. Le rôle « shops » : posé par Kevin sur la fiche, lu par whoami, jeton Firebase rôle shops (jamais admin) ==');
kv.set('acc:lolo-boutique', JSON.stringify({ uid: 'lolo-boutique', name: 'Lolo Boutique', code_at: 1 })); kv.set('nm:lolo boutique', 'lolo-boutique');
r = await call('/__admin/acces', { method: 'POST', body: { uid: 'lolo-boutique', roles: ['shops', 'root', 'admin'] }, headers: { 'x-kdmc-admin': grant } }); j = await r.json();
ok(j.ok === true && JSON.stringify(j.roles) === '["shops"]', '6a. Kevin pose roles:[shops] sur la fiche ; les rôles inconnus (root, admin) sont ignorés', j);
const sLolo = signe({ u: 'lolo-boutique', n: 'Lolo Boutique', c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 1e8 });
r = await call('/__sso/whoami', { headers: { authorization: 'Bearer ' + sLolo } }); j = await r.json();
ok(j.ok === true && JSON.stringify(j.roles) === '["shops"]', '6b. whoami renvoie roles:[shops] (les pages boutiques n\'ont plus à deviner d\'après le nom)', j);
r = await call('/__sso/fbtoken', { method: 'POST', body: {}, headers: { authorization: 'Bearer ' + sLolo } }); j = await r.json();
ok(r.status === 503 && j.reason === 'fb_not_configured', '6c. avec le rôle shops et une session prouvée (code) → la porte s\'ouvre (ici : Firebase non configuré en test = 503, pas 403)', { st: r.status, j });
const sNul = signe({ u: 'rh-bloque', n: 'Rh Bloque', c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 1e8 });
r = await call('/__sso/fbtoken', { method: 'POST', body: {}, headers: { authorization: 'Bearer ' + sNul } }); j = await r.json();
ok(r.status === 403 && j.reason === 'role_requis', '6d. sans le rôle → 403 (SABOTAGE : retirer le contrôle roleShops → rouge)', { st: r.status, j });
const sLoloNom = signe({ u: 'lolo-boutique', n: 'Lolo Boutique', c: 1, v: 0, k: 0, iat: Date.now(), exp: Date.now() + 1e8 });
r = await call('/__sso/fbtoken', { method: 'POST', body: {}, headers: { authorization: 'Bearer ' + sLoloNom } });
ok(r.status === 403, '6e. le rôle shops avec une session NON prouvée (ouverte sur un nom) → 403 : un rôle ne vaut qu\'avec une preuve');
/* tools/shared est privé (coffre) : au dépôt public ce fichier n'existe pas → contrôle sauté proprement (existsSync) */
if ((await import('node:fs')).existsSync(new URL('../../tools/shared/kdmc-fb-auth.js', import.meta.url))) { const fa = (await import('node:fs')).readFileSync(new URL('../../tools/shared/kdmc-fb-auth.js', import.meta.url), 'utf8');
  ok(/appel\('\/__sso\/fbtoken'\)/.test(fa) && !/localStorage\.setItem\(GRANT_LS/.test(fa), '6f. kdmc-fb-auth.js : repli sur /__sso/fbtoken, et plus aucune copie du grant admin sur l\'appareil'); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
