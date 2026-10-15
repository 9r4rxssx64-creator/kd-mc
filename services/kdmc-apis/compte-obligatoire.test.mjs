/* AUCUNE CONSULTATION SANS COMPTE — LA PASSERELLE apis.kd-mc.com AUSSI (Kevin 3.10 et 8.10.2026 :
   « Aucune consultation sans compte nulle part », « code obligatoire pour tous »).
   Mesuré le 15.10 depuis l'extérieur, sans compte : les routes « keyless » répondaient 200, `/` listait la configuration IA,
   et `Origin: https://kd-mc.com` écrit à la main dans un curl obtenait une réponse d'IA. Ce test passe par le VRAI worker et prouve :
     · un inconnu reçoit 401 compte_requis sur CHAQUE route (liste LUE dans le code, pas recopiée), même avec un Origin falsifié,
       et l'amont n'est jamais appelé ;
     · faux jeton, jeton expiré, signature trafiquée, contenu trafiqué, mauvais secret, compte révoqué, « Kevin » sans Face ID,
       pass d'iPhone présenté depuis Windows, compte sans code, invité au téléphone non confirmé, inscrit en attente → 401 ;
     · un compte valide passe (route keyless et /ai), par les TROIS canaux : Authorization Bearer, x-kdmc-sso, cookie kdmc_sso ;
     · CORS : origine exacte + Allow-Credentials pour une origine de confiance, jamais '*' ;
     · OPTIONS passe ; GET /health ne dit que {ok:true} ; `/` ne montre plus la configuration ;
     · Kevin garde ses moteurs payants ; un compte ordinaire non ;
     · sans secret, sans KV, KV en panne → refus (fermé) ;
     · 0 écriture KV ;
     · SABOTAGES : sans le contrôle, sans la révocation, sans la liaison à l'appareil, sans le code → ce test devient rouge.
   node services/kdmc-apis/compte-obligatoire.test.mjs */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const ICI = new URL('./', import.meta.url);
const SRC = readFileSync(new URL('./worker.js', ICI), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

/* ---------- jetons au format du routeur (ssoSign) ---------- */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, o = {}) => {
  const corps = { u: uid, n: o.n || uid, c: 1, v: o.v ? 1 : 0, k: o.k === 0 ? 0 : 1, iat: o.iat || Date.now(), exp: o.exp || Date.now() + 1e9 };
  if (o.d) corps.d = o.d;
  const p = b64u(JSON.stringify(corps));
  return p + '.' + b64u(createHmac('sha256', o.secret || 'sec').update(p).digest());
};
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

/* ---------- KV des comptes (le même que le routeur) : chaque scénario a le sien (le worker garde un mémo de 15 s par KV) ---------- */
let ecritures = 0;
const kvDe = (entrees = {}) => { const m = new Map(Object.entries(entrees).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async () => { ecritures++; }, delete: async () => { ecritures++; } }; };

/* ---------- l'amont (open-meteo, IA…) simulé : on compte qui l'appelle ---------- */
let amont = [];
globalThis.fetch = async (input) => {
  const u = typeof input === 'string' ? input : input.url;
  amont.push(u);
  if (/api\.anthropic\.com/.test(u)) return new Response(JSON.stringify({ content: [{ type: 'text', text: 'payant' }] }), { status: 200 });
  if (/api\.openai\.com|x\.ai|deepseek|perplexity|together/.test(u)) return new Response(JSON.stringify({ choices: [{ message: { content: 'payant' } }] }), { status: 200 });
  return new Response(JSON.stringify({ ok: true, source: u }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const fakeAI = { run: async (model, input) => (/classificateur/i.test(String(input.messages && input.messages[0] && input.messages[0].content)) ? { response: '?' } : { response: 'Qwen gratuit répond' }) };

/* ---------- LES ROUTES, LUES DANS LE CODE ---------- */
const keyless = [...SRC.match(/export const KEYLESS = \{[\s\S]*?\n\};/)[0].matchAll(/\n {2}([a-z]+): \(p\)/g)].map((x) => x[1]);
const nommees = [...SRC.matchAll(/routeName === '([a-z]+)'/g)].map((x) => x[1]);
const keyed = JSON.parse(SRC.match(/export const ROUTES_KEYED = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const ROUTES = [...new Set([...keyless, ...nommees, ...keyed])].sort();
ok(keyless.length >= 10 && keyed.length >= 6 && ROUTES.length >= 20, 'routes lues dans worker.js : ' + ROUTES.length + ' (' + ROUTES.join(', ') + ')');
const CHEMINS = ROUTES.map((r) => '/' + r).concat(['/', '/ai/analyse', '/printify/catalog/blueprints.json', '/route-qui-n-existe-pas']);

const ORIGINE = 'https://kd-mc.com';
const corpsIA = (extra) => JSON.stringify(Object.assign({ messages: [{ role: 'user', content: 'quelle heure ouvre le casino ?' }] }, extra || {}));

async function verifier(mod, etiquette) {
  const worker = mod.default;
  const echecs = { controle: [], revocation: [], appareil: [], code: [], autre: [] };
  let total = 0;
  const note = (cat, c, m) => { total++; if (!c) echecs[cat].push(m); };
  const envDe = (kv, plus) => Object.assign({ KDMC_SSO_SECRET: 'sec', ACCOUNTS: kv, AI: fakeAI, ANTHROPIC_API_KEY: 'k' }, plus || {});
  const va = async (chemin, { method = 'GET', headers = {}, env, body } = {}) => {
    const h = Object.assign({ Origin: ORIGINE }, headers);
    if (method === 'POST') h['content-type'] = 'application/json';
    let r;
    try { r = await worker.fetch(new Request('https://apis.kd-mc.com' + chemin, { method, headers: h, body: method === 'POST' ? (body || corpsIA()) : undefined }), env || envDe(kvDe()), { waitUntil() {} }); }
    catch (e) { return { st: 1101, j: null, t: String(e && e.message), h: new Headers() }; }   /* une exception = erreur Cloudflare 1101, jamais un refus propre */
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (_) { /* texte */ }
    return { st: r.status, j, t, h: r.headers };
  };
  const refuse = (r) => r.st === 401 && r.j && r.j.ok === false && r.j.error === 'compte_requis' && typeof r.j.detail === 'string' && r.j.detail.length > 10;

  /* 1. Un inconnu : 401 sur CHAQUE route, en GET et en POST, avec un Origin de confiance écrit à la main ; l'amont n'est jamais appelé. */
  for (const c of CHEMINS) {
    for (const method of ['GET', 'POST']) {
      amont = [];
      const r = await va(c, { method });
      note('controle', refuse(r), etiquette + ' inconnu ' + method + ' ' + c + ' → ' + r.st);
      note('controle', amont.length === 0, etiquette + ' inconnu ' + method + ' ' + c + ' : l\'amont a été appelé (' + amont.join(',') + ')');
      note('autre', r.h.get('Access-Control-Allow-Origin') !== '*', etiquette + ' jamais * : ' + c);
    }
  }
  /* sans Origin du tout (curl nu), et avec un Origin étranger */
  for (const o of [undefined, 'https://evil.example']) {
    const h = o ? { Origin: o } : {};
    const r = await worker.fetch(new Request('https://apis.kd-mc.com/weather', { headers: h }), envDe(kvDe()), { waitUntil() {} });
    note('controle', r.status === 401, etiquette + ' /weather sans compte (Origin ' + (o || 'absent') + ') → ' + r.status);
    note('autre', !r.headers.get('Access-Control-Allow-Origin'), etiquette + ' origine étrangère/absente : aucune autorisation CORS');
  }

  /* 2. Jetons qui ne sont pas un compte ouvert. */
  const vrai = signe('anne-martin');
  const [pv, sv] = vrai.split('.');
  const contenuTrafique = b64u(JSON.stringify({ u: 'kdmc_admin', n: 'x', c: 1, v: 1, k: 1, iat: Date.now(), exp: Date.now() + 1e9 })) + '.' + sv;
  const mauvais = [
    ['faux jeton', 'nimportequoi', 'controle'],
    ['jeton sans point', 'abc', 'controle'],
    ['jeton expiré', signe('anne-martin', { exp: Date.now() - 1000 }), 'controle'],
    ['signature trafiquée', pv + '.' + (sv.slice(0, -1) + (sv.slice(-1) === 'A' ? 'B' : 'A')), 'controle'],
    ['contenu trafiqué (uid changé, vieille signature)', contenuTrafique, 'controle'],
    ['signé avec un autre secret', signe('anne-martin', { secret: 'faux' }), 'controle'],
    ['« Kevin » sans Face ID', signe('kdmc_admin', { v: 0 }), 'controle'],
  ];
  for (const [nom, tok, cat] of mauvais) {
    for (const [canal, h] of [['Bearer', { Authorization: 'Bearer ' + tok }], ['x-kdmc-sso', { 'x-kdmc-sso': tok }], ['cookie', { cookie: 'kdmc_sso=' + encodeURIComponent(tok) }]]) {
      amont = [];
      const r = await va('/weather', { headers: h });
      note(cat, refuse(r) && amont.length === 0, etiquette + ' ' + nom + ' (' + canal + ') → ' + r.st);
    }
  }
  /* révoqué : « Déconnecter partout » posé APRÈS l'émission du jeton */
  { const iat = Date.now() - 60000; const tok = signe('anne-martin', { iat });
    const r = await va('/weather', { headers: { Authorization: 'Bearer ' + tok }, env: envDe(kvDe({ 'acc:anne-martin': { uid: 'anne-martin', revoked_at: iat + 1000 } })) });
    note('revocation', refuse(r), etiquette + ' compte révoqué → ' + r.st);
    const r2 = await va('/weather', { headers: { Authorization: 'Bearer ' + signe('anne-martin', { iat: iat + 5000 }) }, env: envDe(kvDe({ 'acc:anne-martin': { uid: 'anne-martin', revoked_at: iat + 1000 } })) });
    note('autre', r2.st === 200, etiquette + ' reconnecté APRÈS la révocation → 200 (on tue les sessions, pas le compte) : ' + r2.st);
    const kevinIat = Date.now() - 60000;
    const r3 = await va('/weather', { headers: { 'x-kdmc-sso': signe('kdmc_admin', { v: 1, iat: kevinIat }) }, env: envDe(kvDe({ 'acc:kevin-desarzens': { uid: 'kevin-desarzens', revoked_at: kevinIat + 1000 } })) });
    note('revocation', refuse(r3), etiquette + ' Kevin révoqué sur son alias → ' + r3.st); }
  /* pass lié à la famille d'appareil */
  { const tok = signe('anne-martin', { d: 'iphone' });
    const r = await va('/weather', { headers: { Authorization: 'Bearer ' + tok, 'user-agent': UA_WINDOWS } });
    note('appareil', refuse(r), etiquette + ' pass d\'iPhone présenté depuis Windows → ' + r.st);
    const r2 = await va('/weather', { headers: { Authorization: 'Bearer ' + tok, 'user-agent': UA_IPHONE } });
    note('autre', r2.st === 200, etiquette + ' même pass depuis l\'iPhone → 200 : ' + r2.st); }
  /* code obligatoire pour tous */
  { const tok = signe('paul-durand', { k: 0 });
    const r = await va('/weather', { headers: { Authorization: 'Bearer ' + tok }, env: envDe(kvDe({ 'acc:paul-durand': { uid: 'paul-durand' } })) });
    note('code', refuse(r), etiquette + ' compte sans code → ' + r.st);
    const r2 = await va('/weather', { headers: { Authorization: 'Bearer ' + tok }, env: envDe(kvDe({ 'acc:paul-durand': { uid: 'paul-durand' }, 'cred:paul-durand': { s: '00', h: '11' } })) });
    note('autre', r2.st === 200, etiquette + ' même compte, code posé (cred:) → 200 : ' + r2.st);
    const r3 = await va('/weather', { headers: { Authorization: 'Bearer ' + tok }, env: envDe(kvDe({ 'acc:paul-durand': { uid: 'paul-durand', code_at: Date.now() } })) });
    note('autre', r3.st === 200, etiquette + ' même compte, code_at sur la fiche → 200 : ' + r3.st); }
  /* invité au téléphone non confirmé, inscrit en attente de Kevin */
  for (const [nom, fiche] of [['téléphone non confirmé', { tel_requis: 1 }], ['en attente de Kevin', { attente_admin: 'attente' }], ['refusé par Kevin', { attente_admin: 'refuse' }]]) {
    const r = await va('/weather', { headers: { Authorization: 'Bearer ' + signe('zoe-lefevre') }, env: envDe(kvDe({ 'acc:zoe-lefevre': Object.assign({ uid: 'zoe-lefevre' }, fiche) })) });
    note('autre', refuse(r), etiquette + ' ' + nom + ' → ' + r.st);
  }

  /* 3. Un compte valide passe, par les trois canaux, sur une route keyless et sur /ai. */
  for (const [canal, h] of [['Bearer', { Authorization: 'Bearer ' + vrai }], ['x-kdmc-sso', { 'x-kdmc-sso': vrai }], ['cookie', { cookie: 'autre=1; kdmc_sso=' + encodeURIComponent(vrai) }]]) {
    amont = [];
    const r = await va('/weather?lat=43.7&lon=7.4', { headers: h });
    note('autre', r.st === 200 && amont.some((u) => u.includes('open-meteo')), etiquette + ' compte valide (' + canal + ') /weather → ' + r.st);
    note('autre', r.h.get('Access-Control-Allow-Origin') === ORIGINE && r.h.get('Access-Control-Allow-Credentials') === 'true', etiquette + ' CORS exact + credentials (' + canal + ')');
    const a = await va('/ai', { method: 'POST', headers: h });
    note('autre', a.st === 200 && a.j && a.j.ok && a.j.provider === 'qwen', etiquette + ' compte valide (' + canal + ') /ai → ' + a.st + ' ' + (a.j && a.j.provider));
  }
  /* un vieux jeton d'app expiré en en-tête n'empêche pas le cookie valide */
  { const r = await va('/weather', { headers: { Authorization: 'Bearer ' + signe('anne-martin', { exp: Date.now() - 1 }), cookie: 'kdmc_sso=' + vrai } });
    note('autre', r.st === 200, etiquette + ' en-tête expiré + cookie valide → 200 : ' + r.st); }
  /* `/` avec un compte : ne montre pas la configuration ; l'Origin falsifié sans jeton reste refusé sur /ai */
  { const r = await va('/', { headers: { Authorization: 'Bearer ' + vrai } });
    note('autre', r.st === 200 && r.j && !r.j.keys && !r.j.ia_routing, etiquette + ' `/` pour un compte ordinaire : pas de configuration');
    amont = [];
    const f = await va('/ai', { method: 'POST', headers: { Origin: 'https://kd-mc.com' } });
    note('controle', refuse(f) && amont.length === 0, etiquette + ' Origin falsifié sans jeton sur /ai → ' + f.st); }

  /* 4. OPTIONS et /health */
  { const r = await worker.fetch(new Request('https://apis.kd-mc.com/ai', { method: 'OPTIONS', headers: { Origin: 'https://cmcteams.kd-mc.com' } }), envDe(kvDe()), { waitUntil() {} });
    note('autre', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://cmcteams.kd-mc.com' && r.headers.get('Access-Control-Allow-Credentials') === 'true' && /authorization/i.test(r.headers.get('Access-Control-Allow-Headers')), etiquette + ' OPTIONS passe (204, origine exacte, credentials, Authorization autorisé)');
    const e = await worker.fetch(new Request('https://apis.kd-mc.com/ai', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), envDe(kvDe()), { waitUntil() {} });
    note('autre', e.status === 204 && !e.headers.get('Access-Control-Allow-Origin'), etiquette + ' OPTIONS d\'une origine étrangère : 204 mais aucune autorisation');
    const h = await va('/health');
    note('autre', h.st === 200 && h.t === '{"ok":true}', etiquette + ' /health sans compte = {"ok":true} et rien d\'autre : ' + h.t.slice(0, 80));
    const hk = await va('/health', { headers: { 'x-kdmc-sso': signe('kdmc_admin', { v: 1 }) } });
    note('autre', hk.st === 200 && hk.j && hk.j.keys && Array.isArray(hk.j.keyless), etiquette + ' /health pour Kevin : le détail'); }

  /* 5. Moteurs payants : Kevin oui, un compte ordinaire non */
  { amont = [];
    const k = await va('/ai', { method: 'POST', headers: { 'x-kdmc-sso': signe('kdmc_admin', { v: 1 }) }, body: corpsIA({ premium: true }) });
    note('autre', k.st === 200 && k.j && k.j.provider === 'anthropic', etiquette + ' Kevin (Face ID) + premium → anthropic : ' + (k.j && k.j.provider));
    amont = [];
    const o = await va('/ai', { method: 'POST', headers: { Authorization: 'Bearer ' + vrai }, body: corpsIA({ premium: true }) });
    note('autre', o.st === 200 && o.j.provider === 'qwen' && !amont.some((u) => /anthropic/.test(u)), etiquette + ' compte ordinaire + premium → gratuit : ' + (o.j && o.j.provider));
    const f = await va('/ai', { method: 'POST', headers: { Authorization: 'Bearer ' + vrai }, body: corpsIA({ provider: 'anthropic' }) });
    note('autre', f.st === 403, etiquette + ' compte ordinaire qui force anthropic → 403 : ' + f.st); }

  /* 6. Fermé en cas de doute : sans secret, sans KV, KV en panne */
  for (const [nom, env] of [
    ['sans secret', { ACCOUNTS: kvDe(), AI: fakeAI }],
    ['sans KV', { KDMC_SSO_SECRET: 'sec', AI: fakeAI }],
    ['KV en panne', { KDMC_SSO_SECRET: 'sec', AI: fakeAI, ACCOUNTS: { get: async () => { throw new Error('KV'); } } }],
  ]) {
    amont = [];
    const r = await va('/weather', { headers: { Authorization: 'Bearer ' + vrai }, env });
    note('controle', refuse(r) && amont.length === 0, etiquette + ' ' + nom + ' : refus, jamais l\'accès → ' + r.st);
  }
  /* l'export lui-même */
  if (typeof mod.compteVerifie === 'function') {
    const c = await mod.compteVerifie(new Request('https://apis.kd-mc.com/x', { headers: { Authorization: 'Bearer ' + vrai } }), envDe(kvDe()));
    note('autre', c && c.uid === 'anne-martin' && c.admin === false, etiquette + ' compteVerifie rend le compte');
    note('autre', (await mod.compteVerifie(new Request('https://apis.kd-mc.com/x'), envDe(kvDe()))) === null, etiquette + ' compteVerifie sans jeton → null');
  } else note('autre', false, etiquette + ' compteVerifie exportée');
  Object.defineProperty(echecs, 'total', { value: total, enumerable: false });
  return echecs;
}

/* ===== LE VRAI WORKER ===== */
const vrai = await import('./worker.js');
ok(JSON.stringify([...vrai.ROUTES_KEYLESS, ...vrai.ROUTES_KEYED].sort()) === JSON.stringify(ROUTES.filter((r) => [...vrai.ROUTES_KEYLESS, ...vrai.ROUTES_KEYED].includes(r)).sort()) && ROUTES.every((r) => vrai.ROUTES_KEYLESS.includes(r) || vrai.ROUTES_KEYED.includes(r)), 'les routes lues dans le code = celles exportées (aucune route oubliée)');
ok(vrai.SSO_COOKIE === readFileSync(new URL('../kdmc-router/worker.js', ICI), 'utf8').match(/const SSO_COOKIE = '([^']+)'/)[1], 'même nom de cookie que le routeur (' + vrai.SSO_COOKIE + ')');
const r0 = await verifier(vrai, 'vrai');
for (const [cat, l] of Object.entries(r0)) for (const m of l) ok(false, '[' + cat + '] ' + m);
pass += r0.total - Object.values(r0).reduce((n, l) => n + l.length, 0);   /* chaque vérification du vrai worker compte comme un contrôle */
ok(ecritures === 0, 'aucune écriture KV (' + ecritures + ')');

/* ===== PARITÉ AVEC LE ROUTEUR : un pass accepté par le routeur est accepté ici, un pass qu'il refuse est refusé ici ===== */
{ const { default: routeur } = await import('../kdmc-router/worker.js');
  const kv = kvDe({ 'acc:anne-martin': { uid: 'anne-martin', name: 'Anne Martin' } });
  for (const [nom, tok, attendu] of [['valide', signe('anne-martin'), true], ['expiré', signe('anne-martin', { exp: Date.now() - 5 }), false], ['autre secret', signe('anne-martin', { secret: 'x' }), false]]) {
    const w = await (await routeur.fetch(new Request('https://lingua.kd-mc.com/__sso/whoami', { headers: { Authorization: 'Bearer ' + tok } }), { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', ACCOUNTS: kv }, { waitUntil() {} })).json().catch(() => ({}));
    const a = !!(await vrai.compteVerifie(new Request('https://apis.kd-mc.com/x', { headers: { Authorization: 'Bearer ' + tok } }), { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', ACCOUNTS: kv }));
    ok(!!(w && w.ok && w.uid) === attendu && a === attendu, 'parité routeur/apis (' + nom + ') : routeur ' + !!(w && w.ok) + ', apis ' + a);
  }
}

/* ===== SABOTAGES : chaque contrôle retiré doit rendre ce test rouge ===== */
const SABOTAGES = [
  ['le contrôle du compte retiré du routeur de la passerelle', 'controle', 'if (!compte) return refusCompte(origin);', ''],
  ['la révocation ignorée', 'revocation', 'if (revoque(acc, s)) return null;', '/* sabotage */'],
  ['la liaison à l\'appareil ignorée', 'appareil', 'if (request && d.d && d.d !== appareilDe(request)) return null;', '/* sabotage */'],
  ['le code obligatoire ignoré', 'code', "const codeObligatoire = String(env.KDMC_CODE_OBLIGATOIRE || '1') !== '0';", 'const codeObligatoire = false;'],
];
for (const [nom, cat, avant, apres] of SABOTAGES) {
  ok(SRC.split(avant).length === 2, 'sabotage « ' + nom + ' » : la ligne visée existe une seule fois');
  const f = new URL('./.sabotage-compte-' + cat + '.tmp.mjs', ICI);
  writeFileSync(f, SRC.replace(avant, apres));
  try {
    const mod = await import(f.href + '?' + Date.now());
    const r = await verifier(mod, 'sabotage');
    ok(r[cat].length > 0, 'SABOTAGE « ' + nom + ' » : le test devient rouge (' + r[cat].length + ' échec(s) détecté(s))');
    console.log('  sabotage « ' + nom + ' » → ' + r[cat].length + ' échec(s) [' + cat + '], ex. : ' + (r[cat][0] || '—'));
  } finally { unlinkSync(f); }
}

console.log((fail ? '❌' : '✅') + ' compte obligatoire sur apis.kd-mc.com : ' + pass + ' contrôles OK, ' + fail + ' en échec');
process.exit(fail ? 1 : 0);
