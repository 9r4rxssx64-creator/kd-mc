/* GARDE — « GO OUI TOUT » (Kevin 23.10.2026) : BEE CRÉE UN COMPTE ET RÈGLE LE ROBOT, derrière son ✅, SEUL KEVIN S'EN SERT.
 * Avec le VRAI routeur, de vraies sessions, de fausses IA :
 *   1. créer un compte : la carte ne montre AUCUN code ; le code est tiré au hasard par le domaine au ✅ et n'apparaît QUE sur la réponse à l'écran de Kevin —
 *      jamais dans ce que l'IA lit, dans le journal ni dans l'historique ; un code donné par l'IA est ignoré ; téléphone et prénom+nom obligatoires ; nom déjà pris : pas de code ;
 *   2. régler le robot : la carte dit « avant → après » (lu chez le domaine), bornes du domaine, jamais le mode réel ; l'exécution appelle /__bot/config avec les bons champs ;
 *   3. lire : robot_config et robot_reel (lecture seule) ;
 *   4. un autre compte, un inconnu, une signature trafiquée, une carte rejouée : rien ne bouge ;
 *   5. les portes ouvertes sont exactement 3 de plus ; le code admin, le coffre, l'arbre, le réel restent hors liste ;
 *   6. 0 € : aucun moteur payant.
 * node services/kdmc-router/bee-droits-max.test.mjs */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { CATALOGUE, ACTIONS, RE_AGIR } from './bee-agir.js';
import { DROITS_MAX, ACTIONS_DROITS_MAX, codeAuHasard, RE_DROITS_MAX } from './bee-droits-max.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

const kv = new Map();
const put = (k, v) => kv.set(k, typeof v === 'string' ? v : JSON.stringify(v));
put('acc:kdmc_admin', { uid: 'kdmc_admin', name: 'Kevin ADMIN', verified: true }); put('idx:uids', ['kdmc_admin']);
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; const RAIL = { vars: { SYMBOLS: 'BTC/USDT', TIMEFRAME: '1h', RISK_PER_TRADE_PCT: '1', MAX_POSITION_PCT: '30', DAILY_LOSS_CAP_PCT: '5', MAX_DRAWDOWN_PCT: '15', TESTNET: 'true' }, muts: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  if (/backboard\.railway\.com/.test(u)) {
    const q = JSON.parse(init.body).query;
    if (/projectToken/.test(q)) return R({ data: { projectToken: { projectId: 'p1', environmentId: 'e1' } } });
    if (/project\(id/.test(q)) return R({ data: { project: { name: 'bots', services: { edges: [{ node: { id: 's1', name: 'crypto-bot' } }] } } } });
    if (/^\s*query \{ variables/.test(q)) return R({ data: { variables: RAIL.vars } });
    RAIL.muts.push(q); return R({ data: { ok: true } });
  }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', RAILWAY_TOKEN: 'rt', AI: { run: async () => ({ response: 'ancien chemin' }) } };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const req = async (hote, chemin, { m = 'GET', headers = {}, corps } = {}) => { const r = await mod.fetch(new Request('https://' + hote + chemin, { method: m, headers, body: corps === undefined ? undefined : JSON.stringify(corps) }), env, ctx); await Promise.all(att.splice(0)); return r; };
const login = await req('kd-mc.com', '/__admin/login', { m: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, corps: { code: '424242' } });
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const KEVIN = { cookie: sc.map((c) => c.split(';')[0]).join('; ') };
const AUTRE = { cookie: 'kdmc_sso=' + signe('zelie_testard', true) };
ok(/kdmc_sso=/.test(KEVIN.cookie), '0. connexion de Kevin par le code admin (session vérifiée)');
const outil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const reset = () => { IA_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; };
const toolMsgs = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
const tout = () => JSON.stringify(IA_VUES.map((v) => v.corps));
async function bee(texte) { const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }] }) }), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => null) }; }
const AGIR = (headers, corps) => req('javis.kd-mc.com', '/__javis/agir', { m: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://javis.kd-mc.com' }, headers), corps });
async function carte(texte, action, champs) { reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('p', 'proposer_action', Object.assign({ action }, champs))] }, { content: 'Carte prête.' }]; const r = await bee(texte); return { r, p: r.j && r.j.propositions && r.j.propositions[0] }; }
const ack = async (p, h) => { const r = await AGIR(h || KEVIN, { jeton: p.jeton, confirme: true }); return { st: r.status, j: await r.json() }; };
const lireOutil = async (nom) => { reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', nom, {})] }, { content: 'Voilà.' }]; await bee('montre-moi le réglage du robot et le contrôle du réel'); return toolMsgs(); };

/* ───────── 1. CRÉER UN COMPTE ───────── */
{ const { p, r: r0 } = await carte('crée un compte pour Léa Martin, 06 12 34 56 78', 'compte_creer', { prenom: 'Léa', nom: 'Martin', telephone: '06 12 34 56 78', code: 'MONCODE12' });
  ok(p && p.risque === 'eleve' && /CRÉER le compte de « Léa Martin »/.test(p.resume) && /UNE seule fois/.test(p.resume) && !/MONCODE12/.test(p.resume + JSON.stringify(r0)), '1. la carte : risque ÉLEVÉ, dit que le code sera tiré au hasard — et le code de l\'IA n\'apparaît nulle part — ' + (p && p.resume) + toolMsgs());
  ok(!kv.has('nm:lea martin'), '1b. avant le bouton : aucun compte');
  const a = await ack(p);
  const code = (/CODE : ([A-Z0-9]+)/.exec(a.j.texte || '') || [])[1];
  ok(a.st === 200 && a.j.ok && code && code.length === 8 && !/[01OIl]/.test(code) && code !== 'MONCODE12', '1c. ✅ → le compte est créé et la carte de Kevin montre UN code de 8 signes lisibles (jamais celui de l\'IA) — ' + (a.j.texte || '').replace(/\n/g, ' '));
  const uid = kv.get('nm:lea martin');
  const acc = uid && JSON.parse(kv.get('acc:' + uid) || 'null');
  ok(acc && acc.externe === true && acc.portee === 'domaine' && acc.cgu_at === 0 && acc.fiche && /06 12 34 56 78/.test(acc.fiche.telephone) && kv.has('cred:' + uid), '1d. la fiche est celle d\'un compte invité (domaine public, conditions à accepter, téléphone saisi) et son code est posé — ' + JSON.stringify(acc).slice(0, 160));
  const dump = JSON.stringify([...kv.entries()]);
  ok(!dump.includes(code), '1e. le code n\'est écrit NULLE PART dans le registre (empreinte salée seulement)');
  ok(!tout().includes(code) && !JSON.stringify(Object.assign({}, a.j, { texte: '' })).includes(code), '1f. le code n\'est jamais passé à l\'IA ni dans une autre partie de la réponse');
  ok((await ack(p)).st === 409, '1g. la même carte rejouée : 409, pas de second compte');
  const p2 = (await carte('crée aussi le compte de Léa Martin', 'compte_creer', { prenom: 'Léa', nom: 'Martin', telephone: '06 12 34 56 78' })).p;
  const a2 = await ack(p2);
  ok(!a2.j.ok && /existe déjà/.test(a2.j.texte) && !/CODE :/.test(a2.j.texte), '1h. nom déjà pris : refusé, AUCUN code affiché — ' + a2.j.texte);
  const p3 = (await carte('crée le compte de Max Dubois', 'compte_creer', { prenom: 'Max', nom: 'Dubois', telephone: '+377 99 00 11 22' })).p;
  const a3 = await ack(p3); const code3 = (/CODE : ([A-Z0-9]+)/.exec(a3.j.texte || '') || [])[1];
  ok(code3 && code3 !== code, '1i. un autre compte, un autre code');
  for (const [nom, ch, re] of [['sans téléphone', { prenom: 'Zoé', nom: 'Petit' }, /numéro de téléphone/], ['un seul mot', { prenom: 'Zoé', telephone: '0600000000' }, /prénom ET le nom/], ['téléphone tordu', { prenom: 'Zoé', nom: 'Petit', telephone: 'abc' }, /numéro de téléphone/]]) {
    const c = await carte('crée le compte (' + nom + ')', 'compte_creer', ch); ok(!c.p && re.test(toolMsgs()), '1j. refusé avant la carte : ' + nom + ' — ' + toolMsgs().slice(-100)); }
  const adm = await ack((await carte('crée un compte Kevin Desarzens', 'compte_creer', { prenom: 'Kevin', nom: 'Desarzens', telephone: '0600000000' })).p);
  ok(!adm.j.ok && !/CODE :/.test(adm.j.texte || ''), '1k. le nom de l\'admin est réservé : refusé, aucun code — ' + adm.j.texte); }
{ const n = 3100, vus = {}; for (let i = 0; i < n; i++) for (const ch of codeAuHasard(8)) vus[ch] = (vus[ch] || 0) + 1;
  const lettres = Object.keys(vus).sort().join('');
  ok(lettres.length === 31 && !/[01OIL]/.test(lettres) && Math.min(...Object.values(vus)) > (n * 8 / 31) * 0.8, '1l. le tirage : 31 signes lisibles, répartis sans biais (' + lettres + ')'); }

/* ───────── 2. RÉGLER LE ROBOT ───────── */
{ const { p } = await carte('mets le risque par trade à 2 % et la perte du jour à 4 %', 'robot_reglage', { risque_pct: 2, perte_jour_pct: 4 });
  ok(p && p.risque === 'eleve' && /RÉGLER LE ROBOT \(testnet, jamais l'argent réel\)/.test(p.resume) && /risque par trade : 1 → 2 %/.test(p.resume) && /perte maximale du jour : 5 → 4 %/.test(p.resume), '2. la carte dit « avant → après » lu chez le domaine, testnet — ' + (p && p.resume) + ' | ' + toolMsgs().slice(-200));
  if (!p) process.exit(1);
  RAIL.muts.length = 0; const a = await ack(p);
  ok(a.j.ok && RAIL.muts.some((q) => /RISK_PER_TRADE_PCT.*value: "2"/.test(q)) && RAIL.muts.some((q) => /DAILY_LOSS_CAP_PCT.*value: "4"/.test(q)) && RAIL.muts.some((q) => /serviceInstanceRedeploy/.test(q)), '2b. ✅ → les deux variables sont posées et le robot redémarre — ' + JSON.stringify(a.j));
  ok(!RAIL.muts.some((q) => /TESTNET|BOT_LIVE/.test(q)), '2c. le mode réel n\'est jamais touché');
  const tc = await carte('mets le risque à 50 %', 'robot_reglage', { risque_pct: 50 }); if (!tc.p) console.log('DEBUG', tc.r.st, JSON.stringify(tc.r.j).slice(0,300)); const trop = await ack(tc.p);
  ok(!trop.j.ok && /Réglage refusé/.test(trop.j.texte) && /entre 0.1 et 5/.test(trop.j.texte), '2d. une valeur hors bornes est refusée par le domaine, rien ne change — ' + trop.j.texte);
  const c1 = await carte('règle le robot', 'robot_reglage', {}); ok(!c1.p && /quel réglage/.test(toolMsgs()), '2e. sans réglage : demandé, pas de carte');
  const c2 = await carte('mets le risque à abc', 'robot_reglage', { risque_pct: 'abc' }); ok(!c2.p && /doit être un nombre/.test(toolMsgs()), '2f. un réglage qui n\'est pas un nombre : refusé avant la carte');
  RAIL.vars.BOT_LIVE = 'true'; RAIL.vars.TESTNET = 'false';
  const pr = (await carte('baisse la taille max à 20', 'robot_reglage', { position_max_pct: 20 })).p;
  ok(pr && /RÉEL/.test(pr.resume), '2g. si le robot tourne en RÉEL, la carte le dit en toutes lettres — ' + (pr && pr.resume.slice(-110)));
  delete RAIL.vars.BOT_LIVE; RAIL.vars.TESTNET = 'true';
  const sym = (await carte('suis BTC et ETH sur le robot', 'robot_reglage', { symboles: ['btc/usdt', 'ETH-USDT'] })).p; RAIL.muts.length = 0; await ack(sym);
  ok(RAIL.muts.some((q) => /SYMBOLS.*value: "BTC\/USDT,ETH\/USDT"/.test(q)), '2h. les cryptos sont normalisées par le domaine (BTC/USDT,ETH/USDT)'); }

/* ───────── 3. LIRE ───────── */
{ const c = await lireOutil('robot_config'); ok(/Réglage du robot/.test(c) && /RISK_PER_TRADE_PCT/.test(c) && /testnet/.test(c) && !/rt\b.*token/i.test(c), '3. robot_config : le réglage et le mode — ' + c.slice(0, 160));
  const r = await lireOutil('robot_reel'); ok(!/porte_non_autorisee/.test(r), '3b. robot_reel : porte ouverte à Bee (lecture seule) — ' + r.slice(0, 120)); }

/* ───────── 4. LES INTRUS ───────── */
const AVANT = JSON.stringify([...kv.entries()]);
{ const prop = [(await carte('crée le compte de Eve Durand', 'compte_creer', { prenom: 'Eve', nom: 'Durand', telephone: '0611223344' })).p, (await carte('mets le risque à 3', 'robot_reglage', { risque_pct: 3 })).p];
  ok(prop.every((p) => p && p.jeton), '4. deux propositions signées pour les intrus'); RAIL.muts.length = 0;
  for (const [nom, h] of [['un autre compte reconnu', AUTRE], ['un inconnu', {}], ['de faux en-têtes admin', { 'x-kdmc-admin': 'inventé', 'x-kdmc-sso': 'inventé' }]]) {
    const codes = []; for (const p of prop) codes.push((await AGIR(h, { jeton: p.jeton, confirme: true })).status);
    ok(codes.every((c) => c === 403), '4b. ' + nom + ' avec une proposition VALIDE : 403 — ' + codes.join(',')); }
  ok((await AGIR(KEVIN, { jeton: prop[0].jeton.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64)), confirme: true })).status === 400, '4c. signature remplacée : 400');
  ok((await AGIR(KEVIN, { jeton: prop[1].jeton })).status === 400, '4d. Kevin sans le bouton : 400');
  ok(JSON.stringify([...kv.entries()]) === AVANT && RAIL.muts.length === 0, '4e. après tous ces essais, RIEN n\'a bougé (registre et robot)'); }

/* ───────── 5. LES PORTES ───────── */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const MAXSRC = readFileSync(new URL('./bee-droits-max.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PORTES = ((W.match(/const PORTES_BEE = \[([^\]]*)\]/) || [])[1] || '').split(',').map((x) => x.replace(/['\s]|\/\/.*$/g, '')).filter(Boolean);
ok(['/__admin/compte-invite', '/__bot/config', '/__bot/reel'].every((x) => PORTES.includes(x)), '5. les 3 portes ouvertes sont dans la liste blanche');
const visees = [...new Set([...MAXSRC.matchAll(/'(\/__[a-z0-9\/-]+)'/g)].map((m) => m[1]))];
ok(visees.length === 3 && visees.every((v) => PORTES.includes(v)), '5b. bee-droits-max.js ne vise que ces portes — ' + visees.join(' '));
const FERMEES = ['/__fin/vault', '/__fin/meta', '/__admin/login', '/__admin/grant', '/__admin/fbtoken', '/__admin/domain-log', '/__arbre/seed', '/__arbre/code', '/__arbre/unlock', '/__sso/login', '/__sso/issue', '/__dep/matricules', '/__notify-kevin'];
ok(FERMEES.every((f) => !PORTES.includes(f) && !MAXSRC.includes(f)), '5c. le coffre, le code admin, l\'arbre, les sessions, les noms de collègues : toujours hors liste et jamais nommés');
ok(ACTIONS_DROITS_MAX.length === 2 && ACTIONS_DROITS_MAX.every((a) => ACTIONS.includes(a) && CATALOGUE[a] === DROITS_MAX[a] && CATALOGUE[a].risque === 'eleve') && !ACTIONS_DROITS_MAX.some((a) => /reel|real|coffre|cle|secret|code_admin/i.test(a)), '5d. 2 actions, au catalogue signé, risque élevé, aucune ne touche au réel, au coffre ni au code admin');
for (const q of ['crée un compte pour Paul Durand', 'régle le risque du robot à 2', 'change la cadence en 15m', 'passe le robot en réel', 'baisse la taille max de position à 20', 'mets le risque à 50 %'])
  ok(RE_AGIR.test(q), '5e. prend les mains : « ' + q + ' »');
ok(!RE_DROITS_MAX.test('bonjour, il fait beau, la réalité est belle') && !RE_DROITS_MAX.test('quelle position pour dormir ?'), '5f. une conversation ordinaire ne prend pas les mains');
ok(!/openai|anthropic|api\.openai|stripe/i.test(MAXSRC), '5g. 0 € : aucun moteur payant');

console.log(`${pass} ✓ / ${fail} ✗  (bee-droits-max)`);
process.exit(fail ? 1 : 0);
