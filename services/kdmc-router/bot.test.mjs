/* Test régression /__bot/* (tableau de bord crypto-bot, bot.kd-mc.com).
   node bot.test.mjs
   - Gate FAIL-CLOSED : même grant admin que /__admin (leçons #98/#99).
   - Railway GraphQL mocké (backboard.railway.com) — aucune requête réseau réelle.
   - Erreurs : la cause exacte doit remonter dans `detail` (règle #97). */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

/* Forge un jeton SSO (même format que worker.ssoSign) pour tester le Face ID. */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signSso(secret, uid, verified) {
  const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: verified ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 }));
  return p + '.' + b64u(createHmac('sha256', secret).update(p).digest());
}

const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const CODE = '424242';
const envBase = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha(CODE), ACCOUNTS };

const REQ = (o) => new Request('https://bot.kd-mc.com' + o.path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* ---- Mock Railway GraphQL (le worker appelle backboard.railway.com via fetch) ---- */
const gqlCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url;
  /* Mock bougies Binance pour /__bot/analysis : BTC monte (48h de hausse régulière),
     ETH descend — la notation doit refléter la tendance dans chaque sens. */
  if (u.includes('data-api.binance.vision')) {
    /* /__bot/scan (Choppiness Index) demande limit=60 — /__bot/analysis demande
       limit=250 : on distingue sur le paramètre, sinon ETHUSDT/BNBUSDT/etc.
       collisionnent entre les deux endpoints et cassent l'un des deux. */
    if (u.includes('limit=60')) {
      if (u.includes('BNBUSDT')) {
        /* Choppy 50 bougies, puis casse en forte tendance sur les 10 dernières
           -> CI chute nettement -> catégorie "sort_du_calme". */
        const k = [];
        for (let i = 0; i < 50; i++) {
          const base = 100 + (i % 2 === 0 ? 1 : -1) * 3;
          k.push([0, String(base + 1), String(base + 2), String(base - 2), String(base), '1']);
        }
        let price = 100;
        for (let i = 0; i < 10; i++) {
          price *= 1.05;
          k.push([0, String(price - 0.1), String(price + 0.2), String(price - 0.3), String(price), '1']);
        }
        return new Response(JSON.stringify(k), { headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('SOLUSDT')) return new Response('erreur', { status: 500 });
      if (u.includes('XRPUSDT')) {
        const k = [];
        for (let i = 0; i < 10; i++) k.push([0, '1', '1.1', '0.9', '1', '1']);
        return new Response(JSON.stringify(k), { headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('ETHUSDT')) {
        /* Choppy sur TOUTE la fenêtre -> CI reste haut, delta ~0 -> "comprime". */
        const k = [];
        for (let i = 0; i < 60; i++) {
          const base = 200 + (i % 2 === 0 ? 1 : -1) * 6;
          k.push([0, String(base + 1), String(base + 2), String(base - 2), String(base), '1']);
        }
        return new Response(JSON.stringify(k), { headers: { 'content-type': 'application/json' } });
      }
      /* Repli scan : toute autre paire de la liste curatée -> tendance douce, neutre. */
      const kf = [];
      for (let i = 0; i < 60; i++) {
        const base = 50 + i * 0.2;
        kf.push([0, String(base), String(base + 0.5), String(base - 0.5), String(base + 0.1), '1']);
      }
      return new Response(JSON.stringify(kf), { headers: { 'content-type': 'application/json' } });
    }
    const up = u.includes('BTCUSDT');
    const k = [];
    for (let i = 0; i < 250; i++) {
      const base = up ? 100 + i * 0.5 : 250 - i * 0.5;
      k.push([0, String(base), String(base + 1), String(base - 1), String(base + (up ? 0.4 : -0.4)), '1']);
    }
    return new Response(JSON.stringify(k), { headers: { 'content-type': 'application/json' } });
  }
  if (u.includes('backboard.railway.com')) {
    const q = JSON.parse(init.body).query;
    gqlCalls.push(q);
    const j = (d) => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
    if (q.includes('projectToken')) return j({ data: { projectToken: { projectId: 'P1', environmentId: 'E1' } } });
    if (q.includes('project(id')) return j({ data: { project: { name: 'CMCteams', services: { edges: [{ node: { id: 'S0', name: 'CMCteams' } }, { node: { id: 'S1', name: 'crypto-bot' } }, { node: { id: 'S2', name: 'crypto-bot-p1' } }] } } } });
    if (q.includes('deployments(')) return j({ data: { deployments: { edges: [{ node: { id: 'D1', status: 'SUCCESS', createdAt: '2026-07-03T00:00:00Z' } }] } } });
    /* /__bot/fleet lit limit: 1000 (avec trades) ; /__bot/status lit limit: 80 (ligne HOLD). */
    if (q.includes('deploymentLogs') && q.includes('limit: 1000')) return j({ data: { deploymentLogs: [
      { message: '🟢 BTC/USDT ACHAT qty=0.5 @ 100.00 (stop 90.00)' },
      { message: '🔻 BTC/USDT VENTE (signal) qty=0.5 @ 110.00' },
      { message: 'HOLD | prix=61500.00 | equity=10005.00 | pas de signal' },
    ] } });
    if (q.includes('deploymentLogs')) return j({ data: { deploymentLogs: [{ timestamp: '2026-07-03T00:01:00Z', message: 'HOLD | prix=61500.00 | equity=71500.00 | pas de signal' }] } });
    if (q.includes('variables(')) return j({ data: { variables: { SYMBOLS: 'BTC/USDT,ETH/USDT', TIMEFRAME: '15m', RISK_PER_TRADE_PCT: '1', MAX_POSITION_PCT: '25', TESTNET: 'true' } } });
    if (q.includes('variableUpsert')) return j({ data: { variableUpsert: true } });
    if (q.includes('serviceInstanceRedeploy')) return j({ data: { serviceInstanceRedeploy: true } });
    return j({ errors: [{ message: 'query inconnue (mock)' }] });
  }
  /* Relais Crypto.com (3.10) : jamais le vrai réseau en test. SOL échoue aussi ici, BNB/ETH/XRP sont servis
     par Binance plus haut ; tout autre appel Crypto.com = 503 (le scan doit le dire, pas planter). */
  if (u.includes('api.crypto.com')) return new Response('indisponible', { status: u.includes('SOL_USDT') ? 500 : 503 });
  return realFetch(input, init);
};

/* 1) Sans grant → 403 need_admin_code (fail-closed) */
let r = await mod.fetch(REQ({ path: '/__bot/status' }), envBase);
ok(r.status === 403 && (await r.json()).reason === 'need_admin_code', '/__bot sans grant → 403 need_admin_code');

/* Grant admin via /__admin/login (preuve du code) */
r = await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), envBase);
const grant = (await r.json()).grant;
ok(!!grant, 'login admin → grant signé');
const H = { 'x-kdmc-admin': grant };

/* 2) Grant OK mais RAILWAY_TOKEN absent → cause exacte, pas de crash */
r = await mod.fetch(REQ({ path: '/__bot/status', headers: H }), envBase);
let j = await r.json();
ok(j.ok === false && j.reason === 'railway_token_absent', 'sans RAILWAY_TOKEN → railway_token_absent (cause exacte)');

/* 3) Statut complet avec token (Railway mocké) */
const env = { ...envBase, RAILWAY_TOKEN: 'rw_test' };
r = await mod.fetch(REQ({ path: '/__bot/status', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.status === 'SUCCESS' && j.project === 'CMCteams', 'status → ok + SUCCESS + projet CMCteams');
ok(Array.isArray(j.logs) && j.logs.length === 1 && j.logs[0].m.includes('prix=61500.00'), 'status → logs runtime relayés');

/* 4) Kill : variableUpsert BOT_KILL=1 + redeploy */
gqlCalls.length = 0;
r = await mod.fetch(REQ({ path: '/__bot/kill', method: 'POST', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.action === 'kill', 'kill → ok');
ok(gqlCalls.some((q) => q.includes('variableUpsert') && q.includes('BOT_KILL') && q.includes('"1"')), 'kill → variableUpsert BOT_KILL=1 envoyé');
ok(gqlCalls.some((q) => q.includes('serviceInstanceRedeploy')), 'kill → redeploy envoyé');

/* 5) Start : BOT_KILL=0 */
gqlCalls.length = 0;
r = await mod.fetch(REQ({ path: '/__bot/start', method: 'POST', headers: H }), env);
j = await r.json();
ok(j.ok === true && gqlCalls.some((q) => q.includes('BOT_KILL') && q.includes('"0"')), 'start → BOT_KILL=0 + ok');

/* 6) Kill SANS grant → 403 (les mutations ne partent jamais) */
gqlCalls.length = 0;
r = await mod.fetch(REQ({ path: '/__bot/kill', method: 'POST' }), env);
ok(r.status === 403 && gqlCalls.length === 0, 'kill sans grant → 403, zéro appel Railway');

/* 7) Config GET → réglages actuels + testnet */
r = await mod.fetch(REQ({ path: '/__bot/config', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.config.SYMBOLS === 'BTC/USDT,ETH/USDT' && j.testnet === true, 'config GET → réglages + testnet');

/* 8) Config POST valide → upsert normalisé (eth-usdt → ETH/USDT) + redeploy */
gqlCalls.length = 0;
r = await mod.fetch(REQ({ path: '/__bot/config', method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ symbols: ['btc-usdt', 'ETH/USDT', 'SOLUSDT'], timeframe: '1h', risk: 1.5, maxpos: 30 }) }), env);
j = await r.json();
ok(j.ok === true && j.set.SYMBOLS === 'BTC/USDT,ETH/USDT,SOL/USDT', 'config POST normalise + accepte');
ok(j.set.TIMEFRAME === '1h' && j.set.RISK_PER_TRADE_PCT === '1.5', 'config POST applique timeframe + risk');
ok(gqlCalls.some((q) => q.includes('serviceInstanceRedeploy')), 'config POST → redeploy');

/* 9) Config POST invalide → cause exacte, aucun upsert */
gqlCalls.length = 0;
r = await mod.fetch(REQ({ path: '/__bot/config', method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ symbols: ['BTC/EUR'], risk: 99 }) }), env);
j = await r.json();
ok(j.ok === false && j.reason === 'reglage_invalide' && /USDT|BTC\/EUR/.test(j.detail), 'config POST invalide (devise ≠ USDT) → cause exacte');
ok(!gqlCalls.some((q) => q.includes('variableUpsert')), 'config invalide → aucun upsert Railway');

/* 10) Config POST sans grant → 403 */
r = await mod.fetch(REQ({ path: '/__bot/config', method: 'POST', body: '{}' }), env);
ok(r.status === 403, 'config POST sans grant → 403');

/* 11) Grant admin MACHINE (agent de contrôle GitHub) : adminGrant(secret) doit être
   accepté par /__bot/status exactement comme un login admin (même ssoSign). */
import { adminGrant } from './worker.js';
const machineTok = await adminGrant('sec');
r = await mod.fetch(REQ({ path: '/__bot/status', headers: { 'x-kdmc-admin': machineTok } }), env);
j = await r.json();
ok(j.ok === true && j.status === 'SUCCESS', 'grant machine (adminGrant) accepté par /__bot/status');
const badTok = await adminGrant('MAUVAIS_SECRET');
r = await mod.fetch(REQ({ path: '/__bot/status', headers: { 'x-kdmc-admin': badTok } }), env);
ok(r.status === 403, 'grant signé avec un mauvais secret → 403 (forge rejetée)');

/* 12) FACE ID : session SSO VÉRIFIÉE d'un uid admin (via x-kdmc-sso) → accès accordé
   SANS le code (déverrouillage Face ID depuis bot.kd-mc.com). */
r = await mod.fetch(REQ({ path: '/__bot/status', headers: { 'x-kdmc-sso': signSso('sec', 'kevin-desarzens', true) } }), env);
j = await r.json();
ok(j.ok === true && j.status === 'SUCCESS', 'Face ID vérifié + uid admin → /__bot/status accordé');

/* 13) SÉCU : session NON vérifiée (nom auto-déclaré, pas de Face ID) → refusée (leçon #99). */
r = await mod.fetch(REQ({ path: '/__bot/status', headers: { 'x-kdmc-sso': signSso('sec', 'kevin-desarzens', false) } }), env);
ok(r.status === 403, 'SSO non vérifié (sans Face ID) → 403');

/* 14) SÉCU : session vérifiée mais uid NON admin → refusée. */
r = await mod.fetch(REQ({ path: '/__bot/status', headers: { 'x-kdmc-sso': signSso('sec', 'un-inconnu', true) } }), env);
ok(r.status === 403, 'Face ID vérifié mais uid non-admin → 403');

/* 15) SÉCU : jeton SSO signé avec un mauvais secret → refusé (forge). */
r = await mod.fetch(REQ({ path: '/__bot/status', headers: { 'x-kdmc-sso': signSso('MAUVAIS', 'kevin-desarzens', true) } }), env);
ok(r.status === 403, 'SSO forgé (mauvais secret) → 403');

/* 16) Route inconnue → not_found */
r = await mod.fetch(REQ({ path: '/__bot/xyz', headers: H }), env);
ok((await r.json()).reason === 'not_found', 'route inconnue → not_found');

/* 17) FLOTTE sans grant → 403 (fail-closed, comme le reste de /__bot) */
r = await mod.fetch(REQ({ path: '/__bot/fleet' }), env);
ok(r.status === 403, '/__bot/fleet sans grant → 403');

/* 18) FLOTTE avec grant : 6 entrées, trades FIFO comptés, absents honnêtes */
r = await mod.fetch(REQ({ path: '/__bot/fleet', headers: H }), env);
j = await r.json();
ok(j.ok === true && Array.isArray(j.bots) && j.bots.length === 6, 'fleet → 6 bots listés');
const alive = (j.bots || []).filter((b) => b.status === 'SUCCESS');
const absent = (j.bots || []).filter((b) => b.status === 'absent');
ok(alive.length === 2 && absent.length === 4, 'fleet → 2 déployés (crypto-bot, p1) + 4 absents (honnête)');
ok(alive.every((b) => b.buys === 1 && b.sells === 1 && b.wins === 1 && b.losses === 0), 'fleet → trades FIFO comptés (1 achat, 1 vente gagnante)');
ok(alive.every((b) => b.net === 5 && b.equity === 10005), 'fleet → net FIFO = 0.5×(110−100) = 5 $ + équité extraite');
ok(j.bots[0].net === 5 && j.bots[5].status === 'absent', 'fleet → trié par net, absents en dernier');

/* 19) ANALYSE EXPERT sans grant → 403 */
r = await mod.fetch(REQ({ path: '/__bot/analysis' }), env);
ok(r.status === 403, '/__bot/analysis sans grant → 403');

/* 20) ANALYSE EXPERT : symboles depuis la config bot, notation cohérente avec la tendance */
r = await mod.fetch(REQ({ path: '/__bot/analysis?tf=1h', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.tf === '1h' && Array.isArray(j.analysis) && j.analysis.length === 2, 'analysis → 2 cryptos (SYMBOLS de la config)');
const btc = j.analysis.find((a) => a.symbol === 'BTC/USDT');
const eth = j.analysis.find((a) => a.symbol === 'ETH/USDT');
ok(btc && !btc.err && btc.score > 0 && /^Achat/.test(btc.label), 'BTC en hausse → notation Achat (score ' + (btc && btc.score) + ')');
ok(eth && !eth.err && eth.score < 0 && /^Vente/.test(eth.label), 'ETH en baisse → notation Vente (score ' + (eth && eth.score) + ')');
ok(btc.rsi != null && btc.rsi > 50 && eth.rsi != null && eth.rsi < 50, 'RSI cohérent (hausse > 50 > baisse)');
ok(btc.ma_buy === 5 && eth.ma_sell === 5, 'votes moyennes mobiles : 5/5 dans le sens de la tendance');

/* 21) Timeframe invalide → replié sur 1h (pas d'injection) */
r = await mod.fetch(REQ({ path: '/__bot/analysis?tf=;DROP', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.tf === '1h', 'tf invalide → replié sur 1h');

/* ===== 22-29) JOURNAL PERSISTANT DU BILAN (Kevin 2026-09-11)
   Le bilan ne doit PLUS dépendre des logs Railway (purgés) ni survivre au hasard d'un
   redéploiement : il vit dans KV. On vérifie l'écriture, le throttle, le premier relevé
   jamais écrasé, le gate admin, et le fail-open si KV tombe. ===== */

/* 22) /__bot/history est admin-gated comme le reste (fail-closed) */
r = await mod.fetch(REQ({ path: '/__bot/history' }), env);
ok(r.status === 403, '/__bot/history sans grant → 403');

/* 23) Consulter la flotte écrit un relevé durable dans KV */
store.delete('bot:hist'); store.delete('bot:first');
r = await mod.fetch(REQ({ path: '/__bot/fleet', headers: H }), env);
ok((await r.json()).ok === true, 'fleet → ok (le relevé ne casse pas la réponse)');
let hist = JSON.parse(store.get('bot:hist') || '[]');
ok(hist.length === 1 && hist[0].b['crypto-bot'] && hist[0].b['crypto-bot'].e === 10005, 'fleet → 1 relevé écrit, equity 10005 enregistrée');
ok(hist[0].b['crypto-bot'].n === 5 && hist[0].b['crypto-bot'].a === 1 && hist[0].b['crypto-bot'].v === 1, 'relevé → net/achats/ventes enregistrés');

/* 24) Throttle : une 2e consultation dans l'heure n'ajoute PAS de relevé */
r = await mod.fetch(REQ({ path: '/__bot/fleet', headers: H }), env);
await r.json();
hist = JSON.parse(store.get('bot:hist') || '[]');
ok(hist.length === 1, 'deux consultations rapprochées → un seul relevé (throttle 1 h)');

/* 25) Après plus d'une heure, un nouveau relevé s'ajoute */
hist[0].t = Date.now() - 2 * 60 * 60 * 1000;
store.set('bot:hist', JSON.stringify(hist));
r = await mod.fetch(REQ({ path: '/__bot/fleet', headers: H }), env);
await r.json();
hist = JSON.parse(store.get('bot:hist') || '[]');
ok(hist.length === 2, 'plus d\'une heure après → 2e relevé ajouté');

/* 26) Le PREMIER relevé de chaque bot n'est jamais écrasé (c'est le point de départ du bilan) */
const first = JSON.parse(store.get('bot:first') || '{}');
ok(first['crypto-bot'] && first['crypto-bot'].e === 10005, 'bot:first → point de départ mémorisé');
const firstTs = first['crypto-bot'].t;
/* On fait « vieillir » le dernier relevé pour que le throttle laisse passer un nouveau
   snapshot : sans ça le test passerait même si bot:first était réécrit (faux vert). */
const aged = JSON.parse(store.get('bot:hist'));
aged[aged.length - 1].t = Date.now() - 2 * 60 * 60 * 1000;
store.set('bot:hist', JSON.stringify(aged));
r = await mod.fetch(REQ({ path: '/__bot/fleet', headers: H }), env);
await r.json();
ok(JSON.parse(store.get('bot:hist')).length === 3, 'un 3e relevé a bien été écrit (sinon le test suivant serait un faux vert)');
ok(JSON.parse(store.get('bot:first'))['crypto-bot'].t === firstTs, 'bot:first → jamais réécrit');

/* 27) Le bilan restitue départ, actuel et écart */
r = await mod.fetch(REQ({ path: '/__bot/history', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.bilan && j.bilan['crypto-bot'], 'history → bilan par bot');
ok(j.bilan['crypto-bot'].depart === 10005 && j.bilan['crypto-bot'].actuel === 10005 && j.bilan['crypto-bot'].ecart === 0, 'bilan → départ/actuel/écart chiffrés');
ok(j.releves >= 2 && Array.isArray(j.points), 'history → nombre de relevés + série pour la courbe');

/* 28) Un bot « absent » (jamais déployé) n'entre pas dans le journal — pas de faux zéro */
ok(!hist[0].b['crypto-bot-p5'], 'bot absent → aucun relevé inventé');

/* 29) FAIL-OPEN : si KV tombe, la flotte s'affiche quand même */
const envKO = { ...env, ACCOUNTS: { get: async () => { throw new Error('KV down'); }, put: async () => { throw new Error('KV down'); }, delete: async () => {} } };
const grantKO = grant;   /* le grant est signé, il ne dépend pas de KV */
r = await mod.fetch(REQ({ path: '/__bot/fleet', headers: { 'x-kdmc-admin': grantKO } }), envKO);
j = await r.json();
ok(j.ok === true && Array.isArray(j.bots), 'KV en panne → la flotte reste affichée (fail-open)');

/* ===== 30-38) SCANNER DE MARCHÉ — Choppiness Index (Kevin 2026-09-12, capture
   pub Facebook « Captain Trading ») — lecture seule, ne touche AUCUN réglage. ===== */

/* 30) /__bot/scan sans grant -> 403 (même gate que tout /__bot/*) */
r = await mod.fetch(REQ({ path: '/__bot/scan' }), env);
ok(r.status === 403, '/__bot/scan sans grant → 403');

/* 30bis) /__bot/scan ne dépend PAS de Railway : marche même SANS RAILWAY_TOKEN
   (contrairement à /__bot/status qui exige railway_token_absent — test #2) */
r = await mod.fetch(REQ({ path: '/__bot/scan', headers: H }), envBase);
j = await r.json();
ok(j.ok === true && Array.isArray(j.results), 'scan → marche même sans RAILWAY_TOKEN (Binance seul)');

/* 31) Scan complet : les 24 paires curatées, toutes présentes dans le résultat */
r = await mod.fetch(REQ({ path: '/__bot/scan', headers: H }), env);
j = await r.json();
ok(j.ok === true && j.scanned === 24 && Array.isArray(j.results) && j.results.length === 24,
   'scan → ok + 24 paires scannées');

/* 32) Choppy 50 bougies puis casse en tendance forte -> CI chute -> "sort_du_calme" */
const scBnb = j.results.find((x) => x.symbol === 'BNB/USDT');
ok(scBnb && scBnb.cat === 'sort_du_calme' && scBnb.ci_delta <= -15,
   'BNB choppy→breakout → catégorie sort_du_calme, CI en chute nette (delta ' + (scBnb && scBnb.ci_delta) + ')');

/* 33) Choppy sur TOUTE la fenêtre -> CI reste haut -> "comprime" (pas de fausse alerte breakout) */
const scEth = j.results.find((x) => x.symbol === 'ETH/USDT');
ok(scEth && scEth.cat === 'comprime' && scEth.ci >= 61.8,
   'ETH choppy stable → catégorie comprime, CI ≥ 61.8 (CI=' + (scEth && scEth.ci) + ')');

/* 34) Tendance douce et stable -> ni comprimé ni en train de sortir -> "neutre" */
const scBtc = j.results.find((x) => x.symbol === 'BTC/USDT');
ok(scBtc && scBtc.cat === 'neutre', 'BTC tendance stable → catégorie neutre (pas de faux signal)');

/* 35) Erreur HTTP sur une paire -> cause exacte remontée, le SCAN CONTINUE (les 23 autres) */
const scSol = j.results.find((x) => x.symbol === 'SOL/USDT');
ok(scSol && scSol.err === 'binance HTTP 500, crypto.com HTTP 500' && scSol.cat === undefined,
   'SOL en erreur HTTP → cause exacte, pas de crash du scan entier');

/* 36) Trop peu de bougies -> cause exacte, pas un crash silencieux */
const scXrp = j.results.find((x) => x.symbol === 'XRP/USDT');
ok(scXrp && /bougies insuffisantes/.test(scXrp.err || ''), 'XRP peu de bougies → cause exacte lisible');

/* 37) Tri : ce qui bouge déjà (sort_du_calme) avant ce qui est comprimé (comprime),
   avant le neutre, avant les erreurs (rejetées en fin de liste, pas en tête) */
const idx = (sym) => j.results.findIndex((x) => x.symbol === sym);
ok(idx('BNB/USDT') < idx('ETH/USDT') && idx('ETH/USDT') < idx('BTC/USDT') && idx('BTC/USDT') < idx('SOL/USDT'),
   'tri : sort_du_calme < comprime < neutre < erreur (BNB=' + idx('BNB/USDT') + ' ETH=' + idx('ETH/USDT') +
   ' BTC=' + idx('BTC/USDT') + ' SOL=' + idx('SOL/USDT') + ')');

/* 38) Lecture SEULE : aucune mutation Railway envoyée pendant un scan (ni variableUpsert
   ni redeploy) — contrairement à /__bot/config POST ou /__bot/kill. */
gqlCalls.length = 0;
r = await mod.fetch(REQ({ path: '/__bot/scan', headers: H }), env);
await r.json();
ok(gqlCalls.length === 0, 'scan → 0 appel Railway (lecture seule, aucun réglage de bot touché)');

globalThis.fetch = realFetch;
console.log(`bot.test.mjs : ${pass} OK / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
