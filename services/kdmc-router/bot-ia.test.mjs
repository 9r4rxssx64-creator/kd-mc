#!/usr/bin/env node
/* Garde de l'IA PILOTE des robots papier (services/kdmc-router/bot-ia.js) — Kevin 2026-10-02.
 * Ce qui ne doit JAMAIS casser : l'IA ne touche que les 5 robots papier, jamais un verrou d'argent
 * réel ni une clé ; elle ne change rien sans raison ; l'arbitre juge sur des chiffres ; les lecteurs
 * de marché comprennent les vrais formats publics. */
import * as ia from './bot-ia.js';

let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

console.log('=== 1. Ce que l\'IA a le droit de toucher ===');
const actuels = { 'crypto-bot-p2': { STRATEGY: 'ema', EMA_FAST: '9', EMA_SLOW: '21', TESTNET: 'true', BINANCE_API_KEY: 'x' } };
let v = ia.validerProposition({ bot: 'p2', reglages: { EMA_SLOW: 30 }, raison: 'tendance plus lente sur un marché calme' }, actuels);
dit(v.ok && v.bot === 'crypto-bot-p2' && v.set.EMA_SLOW === '30', 'une proposition normale passe (et « p2 » devient crypto-bot-p2)');
for (const k of ['TESTNET', 'PAPER', 'BOT_LIVE', 'BOT_KILL', 'BINANCE_API_KEY', 'BINANCE_API_SECRET', 'RAILWAY_TOKEN', 'DAILY_LOSS_CAP_PCT', 'MAX_DRAWDOWN_PCT', 'HOLD_UNTIL_PROFIT', 'CATASTROPHE_STOP_PCT']) {
  v = ia.validerProposition({ bot: 'p1', reglages: { EMA_SLOW: 30, [k.toLowerCase()]: 'false' }, raison: 'essai de contournement' });
  dit(!v.ok && /INTERDIT/.test(v.err), k + ' est INTERDIT — même glissé parmi des réglages normaux, la proposition est rejetée en bloc');
}
v = ia.validerProposition({ bot: 'crypto-bot', reglages: { EMA_SLOW: 30 }, raison: 'je veux le principal' });
dit(!v.ok && /hors de portée/.test(v.err), 'le robot principal (testnet, avec clés) est hors de portée');
v = ia.validerProposition({ bot: 'crypto-bot-p9', reglages: { EMA_SLOW: 30 }, raison: 'robot inventé' });
dit(!v.ok, 'un robot inexistant est refusé');
v = ia.validerProposition({ bot: 'p1', reglages: { LEVIER: 10 }, raison: 'réglage inventé' });
dit(!v.ok && /non autorisé/.test(v.err), 'un réglage inconnu est refusé');
v = ia.validerProposition({ bot: 'p1', reglages: { EMA_SLOW: 999 }, raison: 'hors bornes' });
dit(!v.ok, 'une valeur hors bornes est refusée');
v = ia.validerProposition({ bot: 'p1', reglages: { EMA_SLOW: 30.5 }, raison: 'entier attendu' });
dit(!v.ok, 'un entier attendu, un décimal reçu → refusé');
v = ia.validerProposition({ bot: 'p2', reglages: { EMA_FAST: 25 }, raison: 'rapide plus lente que la lente' }, actuels);
dit(!v.ok && /EMA_FAST/.test(v.err), 'EMA rapide ≥ EMA lente (en tenant compte des réglages actuels) → refusé');
v = ia.validerProposition({ bot: 'p1', reglages: { SYMBOLS: 'BTC/USDT,PEPE/USDT' }, raison: 'micro-cap' });
dit(!v.ok && /liquide/.test(v.err), 'une paire hors liste liquide est refusée');
v = ia.validerProposition({ bot: 'p1', reglages: { STRATEGY: 'meanrev', TIMEFRAME: '1h', MR_STD_MULT: 2.5, MR_RSI_BUY: 30, RSI_MAX: 70 }, raison: 'trop de choses' });
dit(!v.ok && /trop de changements/.test(v.err), 'plus de ' + ia.MAX_CHANGEMENTS + ' changements à la fois → refusé');
v = ia.validerProposition({ bot: 'p1', reglages: { EMA_SLOW: 30 }, raison: '' });
dit(!v.ok && /raison/.test(v.err), 'sans raison, rien ne change');

console.log('\n=== 2. Lire une vraie réponse d\'IA ===');
v = ia.validerProposition('<think>je réfléchis {pas du json}</think>Voici :\n```json\n{"bot":"crypto-bot-p3","reglages":{"STRATEGY":"MeanRev","TIMEFRAME":"1h"},"raison":"marché sans direction, le retour à la moyenne convient mieux","attendu":"moins de faux départs"}\n```');
dit(v.ok && v.set.STRATEGY === 'meanrev' && v.set.TIMEFRAME === '1h', 'balises <think> et bloc ```json ignorés, valeurs normalisées');
dit(!ia.validerProposition('désolé je ne peux pas').ok, 'une réponse sans JSON est refusée proprement');
dit(ia.extraireJson('{"raison":"accolade } dans le texte","bot":"p1"}').bot === 'p1', 'une accolade DANS une chaîne ne coupe pas le JSON');

console.log('\n=== 3. L\'arbitre juge sur les chiffres ===');
const t0 = 1_700_000_000_000, h = 3600e3;
const essai = { bot: 'crypto-bot-p1', debut: t0, btc0: 60000,
  equite0: { 'crypto-bot-p1': 1000, 'crypto-bot-p2': 1000, 'crypto-bot-p3': 1000, 'crypto-bot-p4': 1000, 'crypto-bot-p5': 1000 } };
const eq = (p1) => ({ 'crypto-bot-p1': p1, 'crypto-bot-p2': 1001, 'crypto-bot-p3': 1000, 'crypto-bot-p4': 999, 'crypto-bot-p5': 1002 });
dit(ia.arbitre(essai, eq(1050), t0 + 10 * h, 61000).verdict === 'attendre', 'moins de 24 h : on attend, même avec un bon chiffre');
let a = ia.arbitre(essai, eq(1010), t0 + 30 * h, 61000);
dit(a.verdict === 'garder' && /mieux/.test(a.raison), 'mieux que la médiane des autres → gardé');
dit(Math.abs(a.r_btc - 1 / 60) < 1e-9, 'le BTC sur la même période est mesuré (la barre honnête à battre)');
dit(ia.arbitre(essai, eq(990), t0 + 30 * h, 61000).verdict === 'annuler', 'moins bien que la médiane → annulé');
dit(ia.arbitre(essai, eq(1001), t0 + 30 * h, 61000).verdict === 'attendre', 'écart trop faible avant 72 h → on attend');
dit(ia.arbitre(essai, eq(1001), t0 + 80 * h, 61000).verdict === 'garder', 'écart trop faible après 72 h → gardé, sans effet mesurable');
dit(ia.arbitre(essai, { 'crypto-bot-p2': 1000 }, t0 + 80 * h, 61000).verdict === 'annuler', 'plus aucune mesure du robot après 72 h → annulé par prudence');

console.log('\n=== 3 ter. Mode agressif ===');
dit(ia.validerProposition({ bot: 'p1', reglages: { TIMEFRAME: '1m', RISK_PER_TRADE_PCT: 2 }, raison: 'scalping BTC sur marché nerveux' }).ok, 'bougies 1 min et risque 2 % autorisés (papier)');
dit(!ia.validerProposition({ bot: 'p1', reglages: { RISK_PER_TRADE_PCT: 4 }, raison: 'trop' }).ok, 'risque 4 % par trade → refusé (borne 2 % depuis le 8.10 : beaucoup de petites mises)');
dit(!ia.validerProposition({ bot: 'p1', reglages: { MAX_POSITION_PCT: 60 }, raison: 'trop' }).ok && ia.validerProposition({ bot: 'p1', reglages: { MAX_POSITION_PCT: 40 }, raison: 'positions moyennes sur marché nerveux' }).ok, 'position 60 % → refusée, 40 % → acceptée (borne 40 %)');
dit(/frein : −10 % sur la journée/.test(ia.construirePrompt('', [], {}, []).system), 'la consigne de l\'IA nomme le frein de −10 % par jour (robot coupé = pire issue)');
a = ia.arbitre(essai, eq(1001), t0 + 13 * h, 61000, 0);
dit(a.verdict === 'annuler' && /inactif/.test(a.raison), 'robot SANS trade après 12 h → annulé (un robot agressif doit trader)');
dit(ia.arbitre(essai, eq(1030), t0 + 13 * h, 61000, 0).verdict === 'garder', 'sans trade mais nettement meilleur → gardé (on ne punit pas un gain)');
dit(ia.arbitre(essai, eq(1001), t0 + 13 * h, 61000, null).verdict === 'attendre', 'ventes inconnues → pas de verdict d\'inactivité');
dit(/AGRESSIF/.test(ia.construirePrompt('m', [], {}, []).system) && /0,2 %/.test(ia.construirePrompt('m', [], {}, []).system), 'consigne : trader pro agressif, frais comptés');

console.log('\n=== 3 bis. Un redémarrage remet le portefeuille papier à 10 000 $ ===');
const fl0 = [{ name: 'crypto-bot-p1', equity: 10400, depl: 'd1' }, { name: 'crypto-bot-p2', equity: 9800, depl: 'd2' }, { name: 'crypto-bot-p3', equity: 10100, depl: 'd3' }];
const e0 = Object.assign({ bot: 'crypto-bot-p1', debut: t0, btc0: 60000 }, ia.debutEssai('crypto-bot-p1', fl0));
dit(e0.equite0['crypto-bot-p1'] === ia.PAPIER_DEPART && e0.equite0['crypto-bot-p2'] === 9800, 'le robot essayé part de 10 000 $ (son redémarrage), pas de son ancien capital');
let ec = ia.equitesComparables(e0, fl0);
dit(!('crypto-bot-p1' in ec), 'tant que le robot essayé tourne sur l\'ancien déploiement, il n\'est pas mesuré');
ec = ia.equitesComparables(e0, [{ name: 'crypto-bot-p1', equity: 10150, depl: 'd9' }, { name: 'crypto-bot-p2', equity: 9810, depl: 'd2' }, { name: 'crypto-bot-p3', equity: 10000, depl: 'd7' }]);
dit(ec['crypto-bot-p1'] === 10150 && ec['crypto-bot-p2'] === 9810 && !('crypto-bot-p3' in ec), 'un autre robot redémarré pendant l\'essai sort du calcul');
a = ia.arbitre(e0, ec, t0 + 30 * h, 60000);
dit(a.verdict === 'garder' && Math.abs(a.r_cible - 0.015) < 1e-9, 'robot redémarré à 10 000 $ puis 10 150 $ = +1,5 % (et non −2,4 % contre son ancien capital)');

console.log('\n=== 4. Règle de secours (IA gratuite indisponible) ===');
const flotte = [{ name: 'crypto-bot-p1', equity: 1040 }, { name: 'crypto-bot-p2', equity: 980 }, { name: 'crypto-bot-p3', equity: 1000 }];
const vars = { 'crypto-bot-p1': { STRATEGY: 'dipup', TIMEFRAME: '1h' }, 'crypto-bot-p2': { STRATEGY: 'ema', TIMEFRAME: '15m', EMA_FAST: '9', EMA_SLOW: '21' } };
let s = ia.propositionDeSecours(flotte, vars);
dit(s.ok && s.bot === 'crypto-bot-p2' && s.set.STRATEGY === 'dipup' && s.set.TIMEFRAME === '1h', 'le moins bon copie la stratégie et le rythme du meilleur');
s = ia.propositionDeSecours(flotte, { 'crypto-bot-p1': { STRATEGY: 'ema', TIMEFRAME: '15m' }, 'crypto-bot-p2': { STRATEGY: 'ema', TIMEFRAME: '15m', EMA_SLOW: '21' } });
dit(s.ok && s.set.EMA_SLOW === '24', 'même stratégie : on décale de 15 % un réglage de sa famille (21 → 24)');
dit(!ia.propositionDeSecours([{ name: 'crypto-bot-p1', equity: 1000 }], {}).ok, 'un seul robot mesuré : rien à comparer, aucun changement');

console.log('\n=== 5. Lecteurs de marché (formats publics réels) ===');
const fg = ia.lireFearGreed({ data: [{ value: '72', value_classification: 'Greed' }, { value: '65', value_classification: 'Greed' }] });
dit(fg && fg.valeur === 72 && fg.hier === 65, 'peur/avidité (alternative.me)');
const gl = ia.lireCoingeckoGlobal({ data: { total_market_cap: { usd: 2.4e12 }, market_cap_change_percentage_24h_usd: -1.2, market_cap_percentage: { btc: 56.1, eth: 13.2 } } });
dit(gl && gl.dom_btc === 56.1 && gl.var24h === -1.2, 'capitalisation et dominance (CoinGecko)');
const bn = ia.lireBinance24h([{ symbol: 'BTCUSDT', lastPrice: '61000', priceChangePercent: '1.5', quoteVolume: '9e9' },
  { symbol: 'PEPEUSDT', lastPrice: '0.00001', priceChangePercent: '40', quoteVolume: '1e8' },
  { symbol: 'ETHUSDT', lastPrice: '2500', priceChangePercent: '-2', quoteVolume: '5e9' }]);
dit(bn.length === 2 && bn[0].paire === 'BTC/USDT' && !bn.some((x) => /PEPE/.test(x.paire)), 'Binance 24 h : seulement les paires liquides, triées');
const sq = ia.lireStooqCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,2026-10-01,22:00:00,5000,5050,4990,5040,0\nXAUUSD,N/D,N/D,N/D,N/D,N/D,N/D,N/D');
dit(sq && Math.abs(sq[0].var_jour - 0.8) < 1e-9 && sq[1].cloture === null, 'bourse (Stooq) : variation du jour, et « N/D » reste vide au lieu d\'un faux zéro');
const rss = ia.lireRss('<rss><channel><item><title><![CDATA[Bitcoin &amp; ETF : <b>record</b>]]></title><link>https://ex.com/a</link></item><item><title>Sans lien sûr</title><link>javascript:alert(1)</link></item></channel></rss>');
dit(rss.length === 2 && rss[0].titre === 'Bitcoin & ETF : record' && rss[1].lien === '', 'actualités RSS : texte nettoyé, lien non-https écarté');
dit(ia.lireFundingOkx({ data: [{ fundingRate: '0.0001' }] }) === 0.0001, 'taux de financement (OKX)');

console.log('\n=== 6. Le prompt ne transporte aucun secret ===');
const pr = ia.construirePrompt('marché', [{ name: 'crypto-bot-p2', equity: 1000 }], actuels, []);
dit(!/BINANCE|TESTNET|"x"/.test(pr.prompt) && /EMA_SLOW/.test(pr.prompt), 'les réglages actuels passent, jamais une clé ni un verrou');
dit(/JSON/.test(pr.system) && /PAPIER/.test(pr.system), 'le rôle et le format JSON sont imposés');
dit(ia.ajouterJournal(Array.from({ length: 70 }, (_, i) => i), 70).length === ia.JOURNAL_MAX, 'le journal reste borné (' + ia.JOURNAL_MAX + ' entrées)');

console.log('\n=== 7. Passage au réel : contrôle dur, jamais de bascule ===');
v = ia.validerProposition({ bot: 'p1', reglages: { EMA_SLOW: 30, LIVE_MAX_USDT: 5000 }, raison: 'plus de capital' });
dit(!v.ok && /INTERDIT/.test(v.err), 'LIVE_MAX_USDT (plafond argent réel) est INTERDIT à l\'IA');
const J = 86400e3;
const serie = (n, f) => Array.from({ length: n }, (_, i) => f(i));
let histo = serie(65, (i) => ({ t: t0 + i * J, btc: 60000 * (1 + 0.001 * i), b: { 'crypto-bot-p3': { e: 10000 * (1 + 0.002 * i), a: i, v: i } } }));
let prr = ia.pretPourLeReel(histo, 'crypto-bot-p3');
dit(prr.pret && prr.jours === 64, '64 j, 64 ventes, +12,8 % contre +6,4 % BTC, aucune baisse → candidat');
histo[40].b['crypto-bot-p3'] = { e: 10000, a: 0, v: 0 };
for (let i = 41; i < 65; i++) histo[i].b['crypto-bot-p3'] = { e: 10000 + (i - 40) * 30, a: i - 40, v: i - 40 };
prr = ia.pretPourLeReel(histo, 'crypto-bot-p3');
dit(!prr.pret && prr.jours === 24, 'un redémarrage au jour 40 remet le compteur à 24 j → pas prêt');
histo = serie(65, (i) => ({ t: t0 + i * J, btc: 60000 * (1 + 0.004 * i), b: { 'crypto-bot-p3': { e: 10000 * (1 + 0.002 * i), a: i, v: i } } }));
prr = ia.pretPourLeReel(histo, 'crypto-bot-p3');
dit(!prr.pret && prr.criteres.find((c) => c.cle === 'btc').ok === false, 'gagner +12,8 % quand le BTC fait +25,6 % → PAS prêt (garder du BTC faisait mieux)');
histo = serie(65, (i) => ({ t: t0 + i * J, btc: 60000, b: { 'crypto-bot-p3': { e: i === 30 ? 8000 : 10000 * (1 + 0.003 * i), a: i, v: i } } }));
dit(ia.pretPourLeReel(histo, 'crypto-bot-p3').criteres.find((c) => c.cle === 'baisse').ok === false, 'une chute de −20 % en route → PAS prêt, même si la fin est belle');
histo = serie(65, (i) => ({ t: t0 + i * J, b: { 'crypto-bot-p3': { e: 10000 * (1 + 0.002 * i), a: i, v: i } } }));
dit(!ia.pretPourLeReel(histo, 'crypto-bot-p3').pret, 'sans mesure du BTC → PAS prêt (on ne suppose rien)');

console.log('\n=== 8. Voix et contre-avis ===');
const voc = ia.resumeVocal({ mode: 'auto', journal: [{ type: 'verdict', verdict: 'garder', bot: 'crypto-bot-p4' }] }, { peur_avidite: { valeur: 64 }, cryptos: [{ paire: 'BTC/USDT', prix: 61234.5, var24h: -1.25 }] });
dit(/64 sur 100/.test(voc) && /moins 1,3 pour cent/.test(voc) && /robot 4/.test(voc) && /faux argent/.test(voc) && voc.length <= 900, 'point vocal en français parlé (« ' + voc.slice(0, 50) + '… »)');
dit(ia.lireContreAvis('<think>hmm</think>{"avis":"non","raison":"pari"}').avis === 'NON' && ia.lireContreAvis('peut-être') === null, 'contre-avis : OUI/NON lu, réponse floue ignorée');
dit(ia.texteReponseIa({ output: [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'X' }] }, { type: 'message', content: [{ type: 'output_text', text: 'Y' }] }] }) === 'Y', 'réponse gpt-oss (Responses API) : texte final lu, raisonnement ignoré');

console.log('\n=== 9. Sources de relais (vraies réponses du 3.10) ===');
const cdc = { code: 0, result: { data: [{ i: 'ETH_USDT', a: '2670.38', c: '-0.0143', vv: '69011665.95' }, { i: 'BTCUSD-PERP', a: '84518.0', c: '-0.0046' }, { i: 'BTC_USDT', a: '84538.42', c: '-0.0048', vv: '208382921.54' }, { i: 'PEPE_USDT', a: '0.00001', c: '0.4' }] } };
const lc = ia.lireCryptoComTickers(cdc);
dit(lc.length === 2 && lc[0].paire === 'BTC/USDT' && lc[0].prix === 84538.42 && lc[0].var24h === -0.48 && lc[1].var24h === -1.43, 'Crypto.com : paires liquides seulement, variation en % (−0,0048 → −0,48 %)');
const cp = ia.lireCoinpaprikaGlobal({ market_cap_usd: 3009222774304, market_cap_change_24h: -0.5, bitcoin_dominance_percentage: 56.42 });
dit(cp && cp.dom_btc === 56.42 && cp.var24h === -0.5, 'CoinPaprika : capitalisation, variation, dominance BTC');
const fk = ia.lireFundingKraken({ tickers: [{ symbol: 'PF_ETHUSD', fundingRate: 1, markPrice: 2 }, { symbol: 'PF_XBTUSD', fundingRate: -0.6236922938033616, markPrice: 84519.55529683831 }] });
dit(Math.abs(fk - (-0.6236922938033616 / 84519.55529683831 * 8)) < 1e-15 && fk < 0 && fk > -0.001, 'Kraken : financement absolu converti en relatif sur 8 h');
const cb = ia.lireCboe({ data: { symbol: '^SPX', current_price: 7722.7202, price_change_percent: 0.734 } }, 'S&P 500');
dit(cb && cb.cloture === 7722.7202 && cb.var_jour === 0.734 && cb.nom === 'S&P 500', 'Cboe : S&P 500 et sa variation du jour');
dit(ia.lireGoldApi({ price: 4141.799805 }).cloture === 4141.799805 && ia.lireFrankfurter({ rates: { USD: 1.1225 } }).cloture === 1.1225, 'or (gold-api) et EUR/USD (BCE)');
const bg = ia.bougiesCryptoCom({ result: { data: [{ t: 2, o: '2', h: '3', l: '1', c: '2.5', v: '9' }, { t: 1, o: '1', h: '2', l: '0.5', c: '2', v: '4' }] } });
dit(bg.length === 2 && bg[0][0] === 1 && bg[1][2] === '3' && bg[1][4] === '2.5', 'bougies Crypto.com au format Binance, triées dans le temps');
dit(ia.lireCryptoComTickers({}) === null && ia.lireCoinpaprikaGlobal({}) === null && ia.lireFundingKraken({}) === null, 'réponse inattendue → vide, jamais un faux chiffre');

dit(ia.lireCoinlore([{ total_mcap: 2832738426140.09, mcap_change: '-3.88', btc_d: '59.63', eth_d: '11.59' }]).dom_btc === 59.63 && ia.lireCoinlore({}) === null, 'CoinLore : marché global (3e relais), réponse inattendue → vide');

console.log('\n=== 10. Essai fantôme et robot arrêté (vus en vrai le 4.10) ===');
const T0 = 1791021647281;
const ess = { bot: 'crypto-bot-p1', debut: T0, depl0: { 'crypto-bot-p1': 'D-ANCIEN' } };
dit(ia.essaiFantome(ess, [{ name: 'crypto-bot-p1', depl: 'D-ANCIEN' }], T0 + 3 * 3600e3), 'robot encore sur son déploiement d\'origine 3 h après la décision → essai fantôme');
dit(!ia.essaiFantome(ess, [{ name: 'crypto-bot-p1', depl: 'D-ANCIEN' }], T0 + 3600e3), 'seulement 1 h : on laisse à Railway le temps de relancer');
dit(!ia.essaiFantome(ess, [{ name: 'crypto-bot-p1', depl: 'D-NOUVEAU' }], T0 + 30 * 3600e3), 'robot relancé (nouveau déploiement) → pas fantôme');
dit(!ia.essaiFantome({ bot: 'crypto-bot-p1', debut: T0, depl0: {} }, [{ name: 'crypto-bot-p1', depl: 'D-X' }], T0 + 30 * 3600e3), 'sans déploiement d\'origine connu → on ne conclut rien');
const logsP1 = [{ message: '[18:43:40] XRP/USDT HOLD | prix=1.57 | equity=7132.12 | position conservée' },
  { message: '[18:44:20] 🔻 XRP/USDT VENTE (plafond de perte journalière atteint (-17.12% <= -10.0%)) qty=544.955725 @ 1.5698' },
  { message: '[18:44:20] 🛑 Coupure risque : plafond de perte journalière atteint (-17.12% <= -10.0%). Efface state.json / relance pour repartir.' }];
dit(/plafond de perte journalière atteint \(-17\.12% <= -10\.0%\)/.test(ia.robotArrete(logsP1)), 'vraies lignes de p1 (25.09) → arrêté par son frein, raison lue');
dit(ia.robotArrete(logsP1.slice(0, 2)) === '', 'robot qui tourne → pas arrêté');
dit(/planté \(Railway : CRASHED\)/.test(ia.robotArrete([{ message: 'requests.exceptions.HTTPError: 502 Server Error: Bad Gateway' }], 'CRASHED')) && ia.robotArrete([], 'SUCCESS') === '', 'déploiement CRASHED (7.10, testnet en 502 au démarrage) → arrêté, à relancer ; SUCCESS → non');
dit(ia.robotArrete([{ message: '🛑 KILL détecté — tout soldé, arrêt.' }]) === '', 'arrêt d\'urgence BOT_KILL → jamais considéré comme « à relancer »');
const fl = [{ name: 'crypto-bot-p1', svcId: 'S1', arrete: 'frein' }, { name: 'crypto-bot-p2', svcId: 'S2', arrete: '' }, { name: 'crypto-bot', svcId: 'S0', arrete: 'frein' }, { name: 'crypto-bot-p3', svcId: 'S3', arrete: 'frein' }];
let rel = ia.robotsARelancer(fl, null, {}, T0).map((b) => b.name);
dit(rel.join() === 'crypto-bot-p1,crypto-bot-p3', 'à relancer : les robots PAPIER arrêtés seulement, jamais le principal (testnet)');
rel = ia.robotsARelancer(fl, { bot: 'crypto-bot-p1' }, { 'crypto-bot-p3': T0 - 3600e3 }, T0).map((b) => b.name);
dit(rel.length === 0, 'pas le robot en essai (l\'arbitre s\'en charge), et pas deux relances en moins de 12 h');
dit(/ARRÊTÉ par son frein/.test(ia.construirePrompt('', [{ name: 'crypto-bot-p1', equity: 7132, arrete: 'plafond' }], {}, []).prompt), 'l\'IA est prévenue qu\'un robot était arrêté');

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
