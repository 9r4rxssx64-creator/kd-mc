#!/usr/bin/env node
/* Garde de bout en bout de l'IA PILOTE dans le VRAI routeur (worker.js) — Kevin 2026-10-02.
 * Railway, les sources de marché et l'IA (env.AI) sont simulés : aucune requête réseau réelle.
 * Ce qui ne doit JAMAIS casser :
 *   1. le réveil automatique sans la bonne clé est refusé (403), et rien ne bouge sur Railway ;
 *   2. sans session admin, aucune route de l'IA ne répond ;
 *   3. une décision valable touche UN robot papier, jamais le principal ni un verrou ;
 *   4. une IA qui tente de toucher TESTNET est ignorée (règle de secours), le verrou ne bouge pas ;
 *   5. « annuler » remet les anciens réglages ET supprime ceux qui n'existaient pas. */
import mod from './worker.js';
import { reveillerIaBots } from '../kdmc-outlook/worker.js';
import { createHash } from 'crypto';
import { DatabaseSync } from 'node:sqlite';

let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const PIN_SHA = sha('424242');
const cleReveil = sha(PIN_SHA + ':bot-ia-tick');
let binanceBloque = false, propositionRelais = '';
let reponseIa = '', contreAvis = '{"avis":"OUI","raison":"cohérent avec un marché calme"}';
const appelsIa = [];
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: PIN_SHA, ACCOUNTS, RAILWAY_TOKEN: 'rt',
  ANTHROPIC_API_KEY: 'payant-a', OPEN_AI_API_KEY: 'payant-o', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', MISTRAL_API_KEY: 'm', CEREBRAS_API_KEY: 'c',   /* comme en production (3.10) */
  AI: { run: async (modele, p) => { appelsIa.push(modele); return /gpt-oss/.test(modele)
    ? { output: [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'je pense' }] }, { type: 'message', content: [{ type: 'output_text', text: (propositionRelais && /Ta proposition/.test(String(p && p.input))) ? propositionRelais : contreAvis }] }] }
    : { response: (p && Array.isArray(p.messages) && /gérant de risque/.test(p.messages[0].content)) ? '{"avis":"OUI","raison":"relu par Qwen : cohérent"}' : reponseIa }; } } };
const appelsPayants = [];

const SERVICES = [['S1', 'crypto-bot'], ['P1', 'crypto-bot-p1'], ['P2', 'crypto-bot-p2'], ['P3', 'crypto-bot-p3'], ['P4', 'crypto-bot-p4'], ['P5', 'crypto-bot-p5']];
const EQUITE = { P1: 10400, P2: 9700, P3: 10100, P4: 10000, P5: 10050 };
const VARS = { P1: { STRATEGY: 'dipup', TIMEFRAME: '1h' }, P2: { STRATEGY: 'ema', TIMEFRAME: '15m', EMA_FAST: '9' }, P3: {}, P4: {}, P5: {} };
let mutations = [];
const j = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url;
  if (/api\.openai\.com|api\.anthropic\.com/.test(u)) { appelsPayants.push(u); return new Response('{}', { status: 500 }); }
  if (u.includes('backboard.railway.com')) {
    const q = JSON.parse((init && init.body) || '{}').query || '';
    if (q.startsWith('mutation')) { mutations.push(q); return j({ data: { ok: true } }); }
    if (q.includes('projectToken')) return j({ data: { projectToken: { projectId: 'PR', environmentId: 'EN' } } });
    if (q.includes('project(id')) return j({ data: { project: { name: 'CMCteams', services: { edges: SERVICES.map(([id, name]) => ({ node: { id, name } })) } } } });
    const alD = parAlias(q, 'deployments', (args) => { const sv = (args.match(/serviceId: "([A-Z0-9]+)"/) || [])[1]; return { edges: [{ node: { id: 'D-' + sv, status: 'SUCCESS', createdAt: '2026-10-01T00:00:00Z' } }] }; });
    if (alD) return j({ data: alD });
    const alL = parAlias(q, 'deploymentLogs', (args) => { const sv = (args.match(/deploymentId: "D-([A-Z0-9]+)"/) || [])[1]; return [{ message: 'BTC/USDT HOLD | prix=60000.00 | equity=' + (EQUITE[sv] || 10000) + '.00 | rien' }]; });
    if (alL) return j({ data: alL });
    const alV = parAlias(q, 'variables', (args) => { const sv = (args.match(/serviceId: "([A-Z0-9]+)"/) || [])[1]; return Object.assign({ TESTNET: 'true', BINANCE_API_KEY: 'secret-ne-doit-pas-sortir' }, VARS[sv] || {}); });
    if (alV) return j({ data: alV });
    const svc = (q.match(/serviceId: "([A-Z0-9]+)"/) || [])[1];
    if (q.includes('deployments(')) return j({ data: { deployments: { edges: [{ node: { id: 'D-' + svc, status: 'SUCCESS', createdAt: '2026-10-01T00:00:00Z' } }] } } });
    if (q.includes('deploymentLogs')) { const s = (q.match(/deploymentId: "D-([A-Z0-9]+)"/) || [])[1]; return j({ data: { deploymentLogs: [{ message: 'BTC/USDT HOLD | prix=60000.00 | equity=' + (EQUITE[s] || 10000) + '.00 | rien' }] } }); }
    if (q.includes('variables(')) return j({ data: { variables: Object.assign({ TESTNET: 'true', BINANCE_API_KEY: 'secret-ne-doit-pas-sortir' }, VARS[svc] || {}) } });
    return j({ data: {} });
  }
  if (u.includes('binance.vision') && binanceBloque) return new Response('blocked', { status: 403 });
  if (u.includes('api.crypto.com/exchange/v1/public/get-tickers')) return j({ code: 0, result: { data: [{ i: 'BTC_USDT', a: '84538.42', c: '-0.0048', vv: '2e8' }, { i: 'ETH_USDT', a: '2670.38', c: '-0.0143', vv: '7e7' }] } });
  if (u.includes('binance.vision')) return j([{ symbol: 'BTCUSDT', lastPrice: '60000', priceChangePercent: '1', quoteVolume: '9e9' }]);
  if (u.includes('alternative.me')) return j({ data: [{ value: '50', value_classification: 'Neutral' }] });
  return new Response('indisponible', { status: 503 });
};

/* Requêtes groupées (alias GraphQL, 3.10) : « d0: deployments(...) d1: ... » → une réponse par alias. */
function parAlias(q, champ, rep) {
  const re = new RegExp('(\\w+): ' + champ + '\\(([^)]*)\\)', 'g');
  const out = {}; let m, n = 0;
  while ((m = re.exec(q))) { out[m[1]] = rep(m[2]); n++; }
  return n ? out : null;
}
/* Compteur de sous-requêtes (limite 50 par réveil sur le plan gratuit Workers ; journal D1 du 3.10 10h00). */
let sousRequetes = 0;
{ const f0 = globalThis.fetch; globalThis.fetch = (...a) => { sousRequetes++; return f0(...a); }; }
{ const r0 = env.AI.run; env.AI.run = (...a) => { sousRequetes++; return r0(...a); }; }
const REQ = (path, o = {}) => new Request('https://bot.kd-mc.com' + path, Object.assign({ method: 'GET' }, o));
const ctxW = { waitUntil() {}, passThroughOnException() {} };
const appel = async (path, o) => { const r = await mod.fetch(REQ(path, o), env, ctxW); let b = null; try { b = await r.json(); } catch { /* */ } return { s: r.status, b }; };

console.log('=== 1. Porte de réveil ===');
let r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': 'mauvaise' } });
dit(r.s === 403 && mutations.length === 0, 'mauvaise clé de réveil → 403, rien envoyé à Railway');
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil.slice(0, 63) + '0' } });
dit(r.s === 403, 'clé presque juste (1 caractère faux) → 403');
r = await appel('/__bot/ia/tick', { method: 'POST' });
dit(r.s !== 200 && mutations.length === 0, 'sans clé ni session admin → refusé (' + r.s + ')');

console.log('\n=== 2. Sans admin, rien ne répond ===');
for (const [p, m] of [['/__bot/ia', 'GET'], ['/__bot/ia/mode', 'POST'], ['/__bot/ia/annuler', 'POST']]) {
  r = await appel(p, { method: m, headers: { 'content-type': 'application/json' }, body: m === 'POST' ? '{"mode":"off"}' : undefined });
  dit(r.s !== 200 || (r.b && r.b.ok === false), p + ' sans admin → refusé (' + r.s + ')');
}

console.log('\n=== 3. Réveil valable : une décision sur UN robot papier ===');
reponseIa = '```json\n{"bot":"crypto-bot-p2","reglages":{"EMA_SLOW":30},"raison":"marché calme, tendance plus lente","attendu":"moins de faux signaux"}\n```';
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
dit(r.s === 200 && r.b && r.b.action === 'decision', 'bonne clé → décision prise (' + JSON.stringify(r.b).slice(0, 90) + ')');
const ups = mutations.filter((q) => q.includes('variableUpsert'));
dit(ups.length === 1 && /serviceId: "P2"/.test(ups[0]) && /EMA_SLOW/.test(ups[0]), 'un seul réglage changé, sur crypto-bot-p2');
dit(mutations.some((q) => /serviceInstanceRedeploy\(environmentId: "EN", serviceId: "P2"\)/.test(q)), 'le robot p2 est relancé');
dit(!mutations.some((q) => /serviceId: "S1"/.test(q)), 'le robot principal (testnet, avec clés) n\'est jamais touché');
let st = JSON.parse(store.get('bot:ia'));
dit(st.enCours && st.enCours.equite0['crypto-bot-p2'] === 10000 && st.enCours.depl0['crypto-bot-p2'] === 'D-P2', 'l\'essai part de 10 000 $ (redémarrage) et retient le déploiement d\'origine');
dit(st.enCours.avant.EMA_SLOW === null, 'EMA_SLOW n\'existait pas : « avant » le note comme absent');
dit(!JSON.stringify(st).includes('secret-ne-doit-pas-sortir'), 'aucune clé Binance n\'est stockée dans le journal');
dit(appelsPayants.length === 0, 'aucune IA PAYANTE appelée (OpenAI / Anthropic configurées mais exclues)');
dit(appelsIa.includes('@cf/openai/gpt-oss-120b') && st.journal[st.journal.length - 1].contre_avis === 'cohérent avec un marché calme', 'le contre-avis gpt-oss-120b a relu et approuvé (raison au journal)');
const releve = JSON.parse(store.get('bot:hist') || '[]');
dit(releve.length === 1 && releve[0].btc === 84538.42 && releve[0].b['crypto-bot'] && releve[0].b['crypto-bot-p2'], 'le réveil fait le relevé des 6 robots avec le prix du BTC');

console.log('\n=== 3 bis. Contre-avis NON : rien ne change ===');
const sauve = store.get('bot:ia');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0 }));
mutations = []; contreAvis = '{"avis":"NON","raison":"pari contre la tendance"}';
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
let st2 = JSON.parse(store.get('bot:ia'));
dit(r.b && r.b.action === 'refus' && mutations.length === 0, 'contre-avis NON → aucune mutation Railway');
dit(st2.journal[0].type === 'refus' && /pari/.test(st2.journal[0].contre_avis), 'le refus et sa raison sont au journal');
dit(Date.now() - st2.derniereDecision > 2 * 3600e3 && Date.now() - st2.derniereDecision < 4 * 3600e3, 'nouvel essai dans 3 h, pas dans 6 h');
store.set('bot:ia', sauve); contreAvis = '{"avis":"OUI","raison":"ok"}';

console.log('\n=== 3 ter. Mémoire KV plafonnée : aucun robot modifié ===');
const sauve2 = store.get('bot:ia');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0 }));
const putOrig = ACCOUNTS.put;
ACCOUNTS.put = async (k, v) => { if (k === 'bot:ia') throw new Error('KV put() limit exceeded for the day (10048)'); return putOrig(k, v); };
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
ACCOUNTS.put = putOrig;
dit(r.b && r.b.action === 'echec' && /KV/.test(r.b.detail) && !mutations.some((q) => /variableUpsert|Redeploy/.test(q)), 'KV refuse l\'écriture → AUCUNE mutation Railway (« ' + ((r.b && r.b.detail) || '').slice(0, 50) + ' »)');
store.set('bot:ia', sauve2);

console.log('\n=== 4. Deuxième réveil : l\'essai en cours bloque toute nouvelle décision ===');
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
dit(r.b && r.b.action === 'attente' && mutations.length === 0, 'moins de 24 h : on attend, rien ne bouge');

console.log('\n=== 5. Une IA qui vise un verrou est ignorée ===');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0 }));
mutations = [];
reponseIa = '{"bot":"crypto-bot-p1","reglages":{"TESTNET":"false","EMA_SLOW":30},"raison":"passer en réel"}';
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
dit(!mutations.some((q) => /TESTNET|BOT_LIVE|PAPER|BINANCE/.test(q)), 'aucune mutation ne touche TESTNET / PAPER / BOT_LIVE / clés');
st = JSON.parse(store.get('bot:ia'));
const dec = st.journal[st.journal.length - 1];
dit(dec && dec.source === 'secours' && /INTERDIT/.test(dec.echec_ia || ''), 'la proposition est rejetée en bloc, la règle de secours prend le relais');

console.log('\n=== 6. Annuler remet les anciens réglages ===');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], derniereDecision: Date.now(),
  enCours: { bot: 'crypto-bot-p2', debut: Date.now() - 80 * 3600e3, btc0: 60000, set: { EMA_SLOW: '30', TIMEFRAME: '1h' }, avant: { EMA_SLOW: null, TIMEFRAME: '15m' },
    equite0: { 'crypto-bot-p2': 10000, 'crypto-bot-p1': 10000 }, depl0: { 'crypto-bot-p2': 'D-ANCIEN', 'crypto-bot-p1': 'D-P1' } } }));
EQUITE.P2 = 9500; EQUITE.P1 = 10300;
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
dit(r.b && r.b.action === 'verdict' && /annuler/.test(r.b.detail), 'robot −5 % contre +3 % pour les autres → annulé (' + (r.b && r.b.detail || '').slice(0, 60) + ')');
dit(mutations.some((q) => /variableDelete/.test(q) && /EMA_SLOW/.test(q)), 'EMA_SLOW (absent avant) est SUPPRIMÉ');
dit(mutations.some((q) => /variableUpsert/.test(q) && /TIMEFRAME/.test(q) && /"15m"/.test(q)), 'TIMEFRAME revient à 15m');

console.log('\n=== 7. Le vrai réveil de kdmc-outlook ouvre la porte (même clé dérivée des deux côtés) ===');
store.set('bot:ia', JSON.stringify({ mode: 'off', journal: [] }));
let rv = await reveillerIaBots(env, (req) => mod.fetch(req, env, ctxW));
dit(rv.fait && rv.http === 200 && rv.corps && rv.corps.action === 'arretee', 'cron kdmc-outlook → routeur : accepté (IA en pause → « arretee »)');
rv = await reveillerIaBots(Object.assign({}, env, { KDMC_ADMIN_PIN_SHA256: sha('autre') }), (req) => mod.fetch(req, env, ctxW));
dit(!rv.fait && rv.http === 403, 'un autre secret côté cron → 403');

console.log('\n=== 8. Passage au réel et point vocal : admin seulement, et lisibles ===');
r = await appel('/__bot/reel'); dit(r.s === 403, '/__bot/reel sans admin → 403');
r = await appel('/__bot/ia/vocal'); dit(r.s === 403, '/__bot/ia/vocal sans admin → 403');
const lg = await appel('/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '424242' }) });
const HA = { 'x-kdmc-admin': lg.b && lg.b.grant };
r = await appel('/__bot/reel', { headers: HA });
dit(r.s === 200 && r.b.ok && r.b.robots.length === 5 && r.b.pret === false, 'avec admin : 5 robots évalués, pas prêt (trop peu d\'historique)');
dit(r.b.robots.every((x) => x.criteres.some((c) => c.cle === 'duree' && !c.ok)), 'chaque robot dit pourquoi (durée insuffisante)');
r = await appel('/__bot/ia/vocal', { headers: HA });
dit(r.s === 200 && /bitcoin/.test(r.b.texte) && /faux argent/.test(r.b.texte), 'point vocal : texte français prêt à lire (« ' + (r.b.texte || '').slice(0, 60) + '… »)');

console.log('\n=== 9. Mémoire en D1 (kdmc-bot) : 0 écriture KV, journal des réveils lisible ===');
function d1() {
  const sq = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => (d1.panne && /INTO etat/.test(sql) ? (() => { throw new Error('D1 indisponible'); })() : sq.prepare(sql).get(...p) ?? null),
    all: async () => ({ results: sq.prepare(sql).all(...p) }),
    run: async () => { if (d1.panne && /INTO etat/.test(sql)) throw new Error('D1 indisponible'); const x = sq.prepare(sql).run(...p); return { meta: { changes: Number(x.changes) } }; },
    _exec: () => sq.prepare(sql).run(...p),
  });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: sq };
}
const db = d1();
env.BOT_DB = db;
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [{ type: 'decision', t: Date.now() - 3600e3, bot: 'crypto-bot-p2', set: { STRATEGY: 'dipup' } }],
  derniereDecision: Date.now() - 3600e3, enCours: { bot: 'crypto-bot-p2', debut: Date.now() - 3600e3, set: { STRATEGY: 'dipup' }, avant: { STRATEGY: 'ema' }, equite0: { 'crypto-bot-p2': 10000 }, depl0: {} } }));
let putsIa = 0; const put0 = ACCOUNTS.put; ACCOUNTS.put = async (k, v) => { if (k === 'bot:ia') putsIa++; return put0(k, v); };
store.delete('bot:hist'); mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
const etatD1 = JSON.parse(db._s.prepare("SELECT v FROM etat WHERE k = 'ia'").get().v);
dit(r.b && r.b.action === 'attente' && etatD1.enCours && etatD1.enCours.bot === 'crypto-bot-p2', 'l\'essai en cours (venu du KV) est repris et écrit en D1');
dit(putsIa === 0, 'aucune écriture KV pour l\'état de l\'IA');
const rvD1 = db._s.prepare('SELECT * FROM reveils ORDER BY id DESC').get();
dit(rvD1 && rvD1.origine === 'cron' && rvD1.action === 'attente' && /Peur/.test(rvD1.sources || ''), 'le réveil est journalisé en D1 avec l\'état des sources (' + (rvD1 && rvD1.action) + ')');
const nRel = db._s.prepare('SELECT COUNT(*) AS n, MAX(btc) AS b FROM releves').get();
dit(nRel.n === 6 && nRel.b === 84538.42 && !store.has('bot:hist'), 'relevé des 6 robots + BTC en D1, rien en KV');
r = await appel('/__bot/reel', { headers: HA });
dit(r.s === 200 && r.b.releves >= 1, '/__bot/reel lit les relevés D1 (' + (r.b && r.b.releves) + ')');
db._s.prepare("UPDATE etat SET v = ?1 WHERE k = 'ia'").run(JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0 }));
d1.panne = true; mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
d1.panne = false; ACCOUNTS.put = put0;
dit(r.b && r.b.action === 'echec' && !mutations.some((q) => /variableUpsert|Redeploy/.test(q)), 'D1 refuse l\'écriture → AUCUNE mutation Railway');
delete env.BOT_DB;

console.log('\n=== 10. Relais mesurés le 3.10 : Binance bloqué, Qwen sans JSON ===');
binanceBloque = true;
r = await appel('/__bot/marche?frais=1', { headers: HA });
const btcRelais = r.b && (r.b.cryptos || []).find((c) => c.paire === 'BTC/USDT');
dit(btcRelais && btcRelais.prix === 84538.42 && /^ok \(Crypto\.com\)$/.test(r.b.sources['Prix 24 h des cryptos']), 'prix pris chez Crypto.com (1re source, Binance bloqué depuis Cloudflare) — la page nomme la source (' + (r.b && r.b.sources['Prix 24 h des cryptos']) + ')');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0 }));
mutations = []; reponseIa = '<think>je réfléchis longtemps au marché et je n\'ai plus de place';
propositionRelais = '{"bot":"crypto-bot-p4","reglages":{"TIMEFRAME":"5m"},"raison":"marché nerveux, sorties plus rapides","attendu":"plus de trades gagnants"}';
sousRequetes = 0;
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
const srTick = sousRequetes;
const stR = JSON.parse(store.get('bot:ia')); const decR = stR.journal[stR.journal.length - 1];
dit(r.b && r.b.action === 'decision' && decR.source === 'ia-relais' && /gpt-oss/.test(decR.modele), 'Qwen sans JSON → gpt-oss-120b propose (relais gratuit), pas la règle de secours');
dit(/réponse VIDE \(toute la place passée à réfléchir\)/.test(decR.echec_ia || ''), 'la cause du silence de Qwen est gardée au journal (début de sa réponse)');
dit(appelsIa.includes('@cf/qwen/qwen3.8-27b') && decR.modele_contre === 'qwen3.8-27b', 'contre-avis par l\'AUTRE famille (Qwen relit gpt-oss)');
dit(stR.enCours && stR.enCours.btc0 === 84538.42, 'le prix du BTC de départ est enregistré (barre à battre mesurable)');
dit(srTick <= 27, 'pire réveil (Qwen muet → gpt-oss → contre-avis Qwen → changement) : ' + srTick + ' sous-requêtes, sous le plafond de 27 (limite gratuite : 50 ; le reste sert au cache, à D1, au KV)');
binanceBloque = false; propositionRelais = '';

console.log('\n=== 11. Essai fantôme (4.10) : Railway plante au moment d\'appliquer → l\'essai est défait ===');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: 0 }));
reponseIa = '{"bot":"crypto-bot-p4","reglages":{"TIMEFRAME":"5m"},"raison":"marché nerveux","attendu":"plus de trades"}';
const f1 = globalThis.fetch;
globalThis.fetch = async (input, init) => { const b = String((init && init.body) || ''); if (/variableUpsert/.test(b)) throw new Error('Too many subrequests by single Worker invocation.'); return f1(input, init); };
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
globalThis.fetch = f1;
let stF = JSON.parse(store.get('bot:ia'));
dit(r.s === 200 && r.b && r.b.action === 'echec' && /Too many subrequests/.test(r.b.detail), 'exception Railway → échec lisible (« ' + ((r.b && r.b.detail) || r.s).toString().slice(0, 60) + ' »), pas un plantage');
dit(!stF.enCours && !stF.derniereDecision, 'aucun essai fantôme enregistré : le prochain réveil peut décider');

console.log('\n=== 12. Essai jamais appliqué (robot pas relancé en 2 h) → annulé et robot relancé ===');
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], derniereDecision: Date.now() - 19 * 3600e3,
  enCours: { bot: 'crypto-bot-p1', debut: Date.now() - 19 * 3600e3, btc0: 84589.97, set: { EMA_SLOW: '24' }, avant: { EMA_SLOW: '21' },
    equite0: { 'crypto-bot-p1': 10000, 'crypto-bot-p2': 9982 }, depl0: { 'crypto-bot-p1': 'D-P1', 'crypto-bot-p2': 'D-P2' } } }));
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
stF = JSON.parse(store.get('bot:ia'));
const vF = stF.journal[stF.journal.length - 1];
dit(r.b && r.b.action === 'verdict' && vF.verdict === 'annuler' && /jamais redémarré/.test(vF.raison), 'verdict « annuler » : le robot n\'a jamais redémarré (' + ((r.b && r.b.detail) || '').slice(0, 50) + ')');
dit(mutations.some((q) => /variableUpsert/.test(q) && /serviceId: "P1"/.test(q) && /"21"/.test(q)) && mutations.some((q) => /serviceInstanceRedeploy\(environmentId: "EN", serviceId: "P1"\)/.test(q)), 'anciens réglages remis ET p1 relancé');

console.log('\n=== 13. Robot papier coupé par son frein → relancé, jamais le principal ===');
const logsOrig = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const q = JSON.parse((init && init.body) || '{}').query || '';
  if (String(typeof input === 'string' ? input : input.url).includes('backboard.railway.com') && /deploymentLogs/.test(q)) {
    const out = parAlias(q, 'deploymentLogs', (args) => { const sv = (args.match(/deploymentId: "D-([A-Z0-9]+)"/) || [])[1];
      return (sv === 'P3' || sv === 'S1') ? [{ message: 'BTC/USDT HOLD | prix=60000.00 | equity=7132.12 | rien' }, { message: '[18:44:20] 🛑 Coupure risque : plafond de perte journalière atteint (-17.12% <= -10.0%). Efface state.json / relance pour repartir.' }]
        : [{ message: 'BTC/USDT HOLD | prix=60000.00 | equity=10000.00 | rien' }]; });
    sousRequetes++;
    return j({ data: out });
  }
  return logsOrig(input, init);
};
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: Date.now() }));
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
let stA = JSON.parse(store.get('bot:ia'));
const rlc = stA.journal.filter((e) => e.type === 'relance');
dit(rlc.length === 1 && rlc[0].bot === 'crypto-bot-p3' && rlc[0].ok && /7132\.12/.test(rlc[0].raison), 'p3 arrêté → relancé, au journal avec la raison et le capital figé');
dit(mutations.some((q) => /serviceInstanceRedeploy\(environmentId: "EN", serviceId: "P3"\)/.test(q)) && !mutations.some((q) => /serviceId: "S1"/.test(q)), 'relance de p3 seulement ; le principal (testnet), lui aussi arrêté, n\'est JAMAIS relancé');
dit(!mutations.some((q) => /variable/.test(q)), 'aucun réglage touché (les freins restent tels quels)');
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
dit(!mutations.some((q) => /Redeploy/.test(q)), 'réveil suivant : pas de 2e relance avant 12 h');
globalThis.fetch = logsOrig;

console.log('\n=== 14. Robot papier CRASHED (7.10 : bourse en panne au démarrage) → relancé ===');
globalThis.fetch = async (input, init) => {
  const q = JSON.parse((init && init.body) || '{}').query || '';
  if (String(typeof input === 'string' ? input : input.url).includes('backboard.railway.com') && /deployments\(/.test(q) && !/deploymentLogs/.test(q)) {
    const out = parAlias(q, 'deployments', (args) => { const sv = (args.match(/serviceId: "([A-Z0-9]+)"/) || [])[1];
      return { edges: [{ node: { id: 'D-' + sv, status: sv === 'P5' ? 'CRASHED' : 'SUCCESS', createdAt: '2026-10-07T06:00:33Z' } }] }; });
    return j({ data: out });
  }
  return logsOrig(input, init);
};
store.set('bot:ia', JSON.stringify({ mode: 'auto', journal: [], enCours: null, derniereDecision: Date.now() }));
mutations = [];
r = await appel('/__bot/ia/tick', { method: 'POST', headers: { 'x-bot-ia-key': cleReveil } });
stA = JSON.parse(store.get('bot:ia'));
const rlc2 = stA.journal.filter((e) => e.type === 'relance');
dit(rlc2.length === 1 && rlc2[0].bot === 'crypto-bot-p5' && /planté/.test(rlc2[0].raison) && mutations.some((q) => /serviceInstanceRedeploy\(environmentId: "EN", serviceId: "P5"\)/.test(q)), 'p5 CRASHED → relancé, au journal (« ' + ((rlc2[0] || {}).raison || '').slice(0, 60) + ' »)');
globalThis.fetch = logsOrig;

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
