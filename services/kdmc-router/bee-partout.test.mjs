/* GARDE — BEE PARTOUT, ET SEUL KEVIN PEUT S'EN SERVIR (Kevin 4.10 : « vérifie que je sois le seul à pouvoir m'en servir. Partout, chaque app
 * du domaine et dans le domaine »). Avec le VRAI routeur (pas une lecture de texte), des sessions réelles (code admin prouvé, session d'un autre
 * compte, rien du tout) et CHAQUE adresse du domaine lue dans le routeur.
 *   1. le script de Bee est posé sur TOUTE page HTML de TOUTE adresse ouverte (comme le bouton ✉️), jamais sur un script ni une donnée, jamais
 *      sur admin.kd-mc.com ; BEE_PARTOUT=0 le retire partout ;
 *   2. ce script est une coquille publique SANS secret, du JavaScript valide, autonome (ni <style>, ni attribut style, ni innerHTML) ;
 *   3. le cadre est une coquille vide avec SA CSP (frame-ancestors 'self', pas d'objet, scripts de javis seulement) ;
 *   4. « est-ce Kevin ? » : Kevin → 200 + marqueur ; un autre compte reconnu, un inconnu, un faux marqueur, un faux cookie → 403 ;
 *   5. POUR CHAQUE ADRESSE du domaine : /__javis/ai, /__javis/moi, /__javis/agir, /__javis/qui répondent 403 à un inconnu et à un autre compte —
 *      et n'exécutent RIEN ;
 *   6. de bout en bout : une proposition signée + le bouton + Kevin → exécutée (mémoire en D1) ; la même chez un autre compte → 403 ; rejouée → 409 ;
 *      l'arrêt du robot franchit la porte admin AVEC la session de Kevin (la réponse vient de la porte du robot, pas d'un refus d'accès) ;
 *   7. la liste blanche des portes : une action ne peut appeler que les portes prévues ;
 *   8. câblage : le routeur appelle bien ces gardiens (une fonction que personne n'appelle ne protège rien).
 * node services/kdmc-router/bee-partout.test.mjs */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac } from 'node:crypto';
import mod, { injecterBouton, BOUTON_TAG } from './worker.js';
import { PARTOUT_TAG, PARTOUT_JS, CADRE_HTML, CADRE_CSP, MARQUEUR, partout, handlePartout } from './bee-partout.js';
import { proposer } from './bee-agir.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { prepare: (q) => st(q), _s: s };
}
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const SECRET = 'sec';
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', SECRET).update(p).digest()); };
const kv = new Map(); const kvEcrit = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); kvEcrit.push(k); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const env = { KDMC_SSO_SECRET: SECRET, KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CERCLE_DB: d1(), ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
const pages = [];
globalThis.fetch = async (u) => { const t = new URL(String(u && u.url || u)).pathname;
  return t.endsWith('.js') ? new Response('console.log(1)', { status: 200, headers: { 'content-type': 'text/javascript' } })
    : t.endsWith('.json') ? new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('<!doctype html><html><body><h1>App</h1></body></html>', { status: 200, headers: { 'content-type': 'text/html' } }); };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const req = async (hote, chemin, { m = 'GET', headers = {}, corps, e = env } = {}) => { const r = await mod.fetch(new Request('https://' + hote + chemin, { method: m, headers, body: corps === undefined ? undefined : JSON.stringify(corps) }), e, ctx); await Promise.allSettled(att.splice(0)); return r; };

/* Les adresses du domaine, LUES dans le routeur (une 33ᵉ adresse est couverte sans qu'on y pense) */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const hotes = [...W.match(/const ROUTES\s*=\s*\{[\s\S]*?\n\};/)[0].matchAll(/'([a-z0-9.-]+\.kd-mc\.com)':/g)].map((x) => x[1]);
ok(hotes.length >= 28, '0. ' + hotes.length + ' adresses lues dans le routeur');

/* ── Kevin (code admin prouvé), un autre compte reconnu, un inconnu ── */
const login = await req('kd-mc.com', '/__admin/login', { m: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, corps: { code: '424242' } });
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const COOKIE_KEVIN = sc.map((c) => c.split(';')[0]).join('; ');
const jl = await login.json();
ok(jl.ok && /kdmc_sso=/.test(COOKIE_KEVIN), '0b. connexion de Kevin par le code admin (session vérifiée)', JSON.stringify(jl).slice(0, 80));
const KEVIN = { cookie: COOKIE_KEVIN };
const AUTRE = { cookie: 'kdmc_sso=' + signe('laurence_sp', true) };          // un compte connu, vérifié, mais PAS l'admin
const AUTRE_BEARER = { authorization: 'Bearer ' + signe('laurence_sp', true) };
const FAUX_MARQUEUR = { cookie: 'kdmc_k=1' };                                  // le marqueur seul ne prouve RIEN
const FAUX_COOKIE = { cookie: 'kdmc_sso=pas.un.vrai; kdmc_admin=n.importe.quoi' };
const FAUX_ENTETE = { 'x-kdmc-admin': 'inventé', 'x-kdmc-sso': 'inventé' };

/* ───────── 1. le script est posé partout ───────── */
const page = '<!doctype html><html><body><h1>Boutique</h1></body></html>';
const tI = await (await injecterBouton(new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }), PARTOUT_TAG)).text();
ok(tI.includes(BOUTON_TAG) && tI.includes(PARTOUT_TAG) && tI.indexOf(PARTOUT_TAG) < tI.toLowerCase().indexOf('</body>'), '1. le script de Bee est ajouté avant </body>, à côté du bouton ✉️');
ok((await (await injecterBouton(new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }))).text()).includes(PARTOUT_TAG) === false, '1b. sans l\'argument, rien n\'est ajouté (le bouton ✉️ reste seul)');
const sans = [], portes = []; let avec = 0;
for (const h of hotes.filter((x) => x !== 'admin.kd-mc.com')) {
  const r = await req(h, '/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'x-kdmc-sonde': 't' } }); const t = await r.text();
  if (r.headers.get('x-kdmc-porte')) { portes.push(h); continue; }
  if (r.status === 200) { if (t.includes(PARTOUT_TAG)) avec++; else sans.push(h); }
}
/* les adresses qui montrent leur écran de CODE à un inconnu (beatbot, autorisations : réservées à l'admin) : avec la session de Kevin, la vraie page arrive, avec Bee */
const gardees = [];
for (const h of sans.splice(0)) { const t = await (await req(h, '/', { headers: Object.assign({ 'sec-fetch-dest': 'document', accept: 'text/html', 'x-kdmc-sonde': 't' }, KEVIN) })).text(); if (t.includes(PARTOUT_TAG)) { avec++; gardees.push(h); } else sans.push(h); }
ok(sans.length === 0 && avec >= 22, '1c. le script de Bee est sur CHAQUE adresse ouverte (' + avec + ' adresses dont ' + gardees.join(', ') + ' une fois Kevin reconnu ; sans : ' + sans.join(',') + ' ; portes fermées : ' + portes.length + ')', sans);
const xa = await (await req('admin.kd-mc.com', '/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'x-kdmc-sonde': 't' } })).text();
ok(!xa.includes(PARTOUT_TAG), '1d. pas sur admin.kd-mc.com');
const xj = await (await req('lingua.kd-mc.com', '/app.js')).text(), xk = await (await req('lingua.kd-mc.com', '/data.json')).text();
ok(!xj.includes(PARTOUT_TAG) && !xk.includes(PARTOUT_TAG), '1e. jamais dans un script ni une donnée (HTML seulement)');
const coupe = await (await req('lingua.kd-mc.com', '/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'x-kdmc-sonde': 't' }, e: Object.assign({}, env, { BEE_PARTOUT: '0' }) })).text();
ok(!coupe.includes(PARTOUT_TAG), '1f. interrupteur BEE_PARTOUT=0 : plus aucune page ne le reçoit');

/* ───────── 2. le script : public, valide, autonome, sans secret ───────── */
const rj = await req('lingua.kd-mc.com', '/__javis/partout.js');
const js = await rj.text();
let valide = true; try { new Function(js); } catch { valide = false; }
ok(rj.status === 200 && /javascript/.test(rj.headers.get('content-type')) && valide && js === PARTOUT_JS && /max-age=\d+/.test(rj.headers.get('cache-control')), '2. /__javis/partout.js est servi, valide, mis en cache 5 min');
ok(!/innerHTML|document\.write|eval\(|new Function|<style|setAttribute\('style'|https?:\/\/|\.src\s*=\s*['"]http/.test(js), '2b. autonome : aucun innerHTML, aucun <style>, aucun attribut style, aucune adresse extérieure (les CSP des apps le laissent passer)');
ok(!/KDMC_SSO_SECRET|secret|PIN_SHA|424242|Bearer [A-Za-z0-9]{12,}/i.test(js), '2c. aucun secret dans le script (il est public ; il ne nomme que la CLÉ de stockage du jeton, jamais sa valeur)');
ok(/window\.top !== window\.self/.test(js) && /kdmc_k=1/.test(js) && /\/__javis\/qui/.test(js) && /e\.origin !== location\.origin/.test(js) && /e\.source !== cadre\.contentWindow/.test(js), '2d. jamais dans un cadre ; marqueur ; demande « est-ce Kevin ? » ; ne croit QUE les messages de son propre cadre de sa propre origine');
ok(/12 \* 3600e3/.test(js), '2e. un « non » est retenu 12 h : un visiteur ordinaire ne coûte jamais plus d\'une requête par demi-journée');

/* ───────── 3. le cadre ───────── */
const rc = await req('lingua.kd-mc.com', '/__javis/cadre');
ok(rc.status === 200 && /text\/html/.test(rc.headers.get('content-type')) && rc.headers.get('content-security-policy') === CADRE_CSP && rc.headers.get('x-frame-options') === 'SAMEORIGIN', '3. le cadre est servi avec SA CSP et l\'anti-clickjacking');
ok(/frame-ancestors 'self'/.test(CADRE_CSP) && /default-src 'none'/.test(CADRE_CSP) && !/unsafe-eval|object-src|\*\s|http:\/\//.test(CADRE_CSP) && /script-src 'self' https:\/\/javis\.kd-mc\.com;/.test(CADRE_CSP), '3b. CSP du cadre : défaut fermé, cadré par le domaine seulement, scripts de javis.kd-mc.com seulement, pas d\'eval');
const th = await rc.text();
ok(th === CADRE_HTML && /javis-widget\.js/.test(th) && !/KDMC_SSO|secret|token|Bearer/i.test(th) && !/<script>[^<]/.test(th), '3c. coquille vide : charge le widget, aucun secret, aucun script en ligne');

/* ───────── 4. « est-ce Kevin ? » ───────── */
const qui = (h, headers) => req('lingua.kd-mc.com', '/__javis/qui', { headers });
let r = await qui('', KEVIN);
ok(r.status === 200 && (await r.json()).ok === true && r.headers.get('set-cookie') === MARQUEUR, '4. Kevin → 200 et le domaine pose le marqueur de son appareil');
ok(/Domain=\.kd-mc\.com/.test(MARQUEUR) && /Secure/.test(MARQUEUR) && /SameSite=Lax/.test(MARQUEUR) && !/HttpOnly/.test(MARQUEUR) && !/kdmc_sso|kdmc_admin/.test(MARQUEUR), '4b. le marqueur est un indice sans secret (ni session, ni grant)');
for (const [nom, h] of [['inconnu (rien)', {}], ['un autre compte reconnu et vérifié (cookie)', AUTRE], ['un autre compte reconnu (Bearer)', AUTRE_BEARER], ['le marqueur seul, sans session', FAUX_MARQUEUR], ['un faux cookie de session', FAUX_COOKIE], ['de faux en-têtes admin', FAUX_ENTETE]]) {
  r = await qui('', h); ok(r.status === 403 && !r.headers.get('set-cookie'), '4c. ' + nom + ' → 403 et AUCUN marqueur posé', r.status);
}
r = await req('lingua.kd-mc.com', '/__javis/qui', { headers: { cookie: 'kdmc_sso=' + signe('kdmc_admin', false) } });
ok(r.status === 403, '4d. la session de l\'uid admin mais NON vérifiée (sans Face ID ni code) → 403');

/* ───────── 5. chaque adresse : les portes de Bee restent fermées aux autres ───────── */
const JSON_ORIGINE = (h) => ({ 'content-type': 'application/json', origin: 'https://' + h });
const ouvertes = []; let testees = 0;
for (const h of hotes) {
  for (const [nom, id] of [['inconnu', {}], ['autre compte', AUTRE], ['faux admin', FAUX_ENTETE]]) {
    for (const [chemin, m, corps] of [['/__javis/ai', 'POST', { messages: [{ role: 'user', content: 'salut' }] }], ['/__javis/moi', 'GET'], ['/__javis/qui', 'GET'], ['/__javis/agir', 'POST', { jeton: 'v1.x.' + 'a'.repeat(64), confirme: true }]]) {
      const rr = await req(h, chemin, { m, headers: Object.assign({}, m === 'POST' ? JSON_ORIGINE(h) : {}, id), corps }); testees++;
      if (rr.status !== 403) ouvertes.push(h + chemin + ' (' + nom + ') → ' + rr.status);
    }
  }
}
ok(ouvertes.length === 0, '5. ' + testees + ' essais (' + hotes.length + ' adresses × 3 intrus × 4 portes) : TOUS refusés 403', ouvertes.slice(0, 6).join(' ; '));

/* ───────── 6. de bout en bout, avec le vrai routeur ───────── */
const AGIR = (headers, corps, h = 'lingua.kd-mc.com', origin = 'https://lingua.kd-mc.com') => req(h, '/__javis/agir', { m: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, origin ? { origin } : {}, headers), corps });
let pr = (await proposer(env, 'memoriser', { texte: 'Kevin aime le café serré' })).proposition;
r = await AGIR(AUTRE, { jeton: pr.jeton, confirme: true });
ok(r.status === 403 && env.CERCLE_DB._s.prepare("SELECT name FROM sqlite_master WHERE name = 'bee_memoire'").get() === undefined, '6. un AUTRE compte avec une proposition VALIDE → 403 et rien n\'est écrit', r.status);
r = await AGIR(KEVIN, { jeton: pr.jeton, confirme: true }, 'lingua.kd-mc.com', 'https://pirate.example');
ok(r.status === 403, '6b. Kevin mais depuis un autre site (Origin étranger) → 403 (un site piégé ne déclenche rien)');
r = await AGIR(KEVIN, { jeton: pr.jeton });
ok(r.status === 400 && (await r.json()).reason === 'confirmation_requise', '6c. Kevin sans le bouton (pas de confirme) → 400');
r = await AGIR(KEVIN, { jeton: pr.jeton, confirme: true });
let jr = await r.json();
ok(r.status === 200 && jr.ok && /Retenu/.test(jr.texte) && env.CERCLE_DB._s.prepare('SELECT fait FROM bee_memoire').all().length === 1, '6d. Kevin + bouton + proposition signée → exécuté : le fait est retenu en D1', JSON.stringify(jr));
r = await AGIR(KEVIN, { jeton: pr.jeton, confirme: true }); jr = await r.json();
ok(r.status === 409 && env.CERCLE_DB._s.prepare('SELECT fait FROM bee_memoire').all().length === 1, '6e. la même proposition REJOUÉE → 409, rien d\'écrit en double', JSON.stringify(jr));
pr = (await proposer(env, 'bot_arret', {})).proposition;
r = await AGIR(KEVIN, { jeton: pr.jeton, confirme: true }, 'bot.kd-mc.com', 'https://bot.kd-mc.com'); jr = await r.json();
ok(!/need_admin_code|admin_only|porte_non_autorisee/.test(JSON.stringify(jr)) && /railway|robot|bot/i.test(jr.texte || ''), '6f. l\'arrêt du robot arrive à la porte du robot AVEC la session de Kevin (réponse de la porte, pas un refus d\'accès)', JSON.stringify(jr));
pr = (await proposer(env, 'bot_arret', {})).proposition;
r = await AGIR(AUTRE_BEARER, { jeton: pr.jeton, confirme: true }, 'bot.kd-mc.com', 'https://bot.kd-mc.com');
ok(r.status === 403, '6g. un autre compte ne peut pas arrêter le robot, même avec la bonne proposition', r.status);
/* la proposition émise pour Kevin n'est pas utilisable dans un autre usage (autre secret) */
ok((await AGIR(KEVIN, { jeton: pr.jeton.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64)), confirme: true })).status === 400, '6h. signature remplacée → 400');
/* aucune écriture KV pour tout cela */
ok(!kvEcrit.some((k) => /bee|agir|rappel|memoire/i.test(k)), '6i. 0 écriture KV par Bee (tout est en D1 gratuit)', kvEcrit.join(','));

/* ───────── 7. la liste blanche des portes ───────── */
ok(/const PORTES_BEE = \['\/__boite\/admin', '\/__boite\/admin\/lu', '\/__boite\/admin\/repondre', '\/__bot\/kill', '\/__bot\/status'\];/.test(W), '7. une action ne peut appeler que 5 portes (boîte : lire / marquer lu / répondre ; robot : arrêt, état)');
ok(/if \(PORTES_BEE\.indexOf\(chemin\) < 0\) return \{ ok: false, status: 0, reason: 'porte_non_autorisee' \}/.test(W), '7b. toute autre porte est refusée avant l\'appel');
ok(!/'\/__bot\/start'|'\/__admin\/|'\/__fin\/|'\/__mail\/|'\/__beatbot\/relay'/.test(W.match(/const PORTES_BEE[^;]*;/)[0]), '7c. ni démarrage du robot, ni coffre, ni code admin, ni relais ne sont dans la liste');

/* ───────── 8. câblage ───────── */
ok(/if \(url\.pathname === '\/__javis\/agir'\) return handleAgir\(request, env, outilsBee\(env, ctx\)\)/.test(W) && /handlePartout\(request, url, env, outilsBee\(env, ctx\)\)/.test(W), '8. le routeur sert /__javis/agir et /__javis/{partout.js,cadre,qui} avec les gardiens de Kevin');
ok(/return injecterBouton\(new Response\(res\.body[^;]*PARTOUT_TAG\)/.test(W), '8b. le chemin de réponse du routeur pose bien le script de Bee');
ok(/qui: \(request\) => adminSession\(request, env\)/.test(W), '8c. « qui » = la session admin PROUVÉE par le domaine (Face ID ou code), jamais ce que dit la page');
ok(/if \(!\(await adminSession\(request, env\)\)\) return JB\(\{ ok: false, reason: 'kevin_seulement' \}, 403\);/.test(W.slice(W.indexOf('async function handleBeeIa'), W.indexOf('async function handleBeeIa') + 1800)), '8d. le cerveau de Bee exige toujours Kevin avant de lire quoi que ce soit');

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
