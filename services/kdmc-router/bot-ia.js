/* IA PILOTE des robots crypto PAPIER — Kevin 2026-10-02 :
 * « Intègre une IA indépendante gratuite qui gère en permanence les robots et les programme pour
 *   optimiser […] Pour l'instant, on reste en virtuel et on analyse. Je veux un retour sur mon lien. »
 *
 * CE QUE CE MODULE FAIT — et pourquoi il est construit ainsi :
 *  1. L'IA PROPOSE, l'ARBITRE DÉCIDE. Une IA de langage ne sait pas si un réglage « marche » : elle
 *     invente volontiers des certitudes. Elle propose donc UN changement sur UN robot papier, avec
 *     sa raison ; puis un arbitre purement chiffré compare, sur la MÊME période de marché, ce robot
 *     aux autres robots papier (médiane) et garde ou annule. C'est une expérience contrôlée, pas
 *     une intuition. Le BTC sur la même période est affiché à côté (garder du BTC sans rien faire
 *     est la barre honnête à battre).
 *  2. VIRTUEL SEULEMENT. Seuls les 5 robots papier (crypto-bot-p1..p5) sont pilotables. Le robot
 *     principal (crypto-bot, testnet, porteur de clés) est HORS de portée. Les verrous d'argent réel
 *     (TESTNET, PAPER, BOT_LIVE), les clés, l'interrupteur d'arrêt et les plafonds de perte sont
 *     INTERDITS à l'IA : une proposition qui les touche est rejetée en bloc (pas « nettoyée »).
 *  3. GRATUIT. L'IA passe par routeText (Qwen sur Workers AI d'abord, puis les autres IA gratuites —
 *     règle Kevin 2026-09-05). Si toutes sont indisponibles, une règle de secours prend le relais
 *     (règle « anti-blocage IA ») et le journal le dit.
 *
 * Tout ici est PUR (sans réseau) pour être testé : services/kdmc-router/bot-ia.test.mjs.
 */

export const BOTS_PAPIER = ['crypto-bot-p1', 'crypto-bot-p2', 'crypto-bot-p3', 'crypto-bot-p4', 'crypto-bot-p5'];
export const BOT_PRINCIPAL = 'crypto-bot';

/* Paires très liquides seulement : sur une micro-cap, un robot papier « gagne » sur des prix
   qu'aucun ordre réel n'obtiendrait. */
export const PAIRES_LIQUIDES = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
  'DOGE/USDT', 'AVAX/USDT', 'LINK/USDT', 'LTC/USDT', 'DOT/USDT', 'TRX/USDT'];

/* Ce que l'IA a le droit de régler, avec des bornes. Noms = variables lues par crypto-bot/config.py. */
export const REGLAGES_IA = {
  STRATEGY: { type: 'enum', valeurs: ['ema', 'meanrev', 'dipup'] },
  TIMEFRAME: { type: 'enum', valeurs: ['1m', '3m', '5m', '15m', '30m', '1h', '4h'] },   // 1m-5m : mode agressif (Kevin 2.10)
  EMA_FAST: { type: 'int', min: 2, max: 50 },
  EMA_SLOW: { type: 'int', min: 5, max: 200 },
  RSI_MAX: { type: 'num', min: 55, max: 85 },
  ATR_STOP_MULT: { type: 'num', min: 1, max: 5 },
  MR_STD_MULT: { type: 'num', min: 1, max: 3.5 },
  MR_RSI_BUY: { type: 'num', min: 15, max: 45 },
  MR_RSI_SELL: { type: 'num', min: 50, max: 80 },
  DU_TREND_PERIOD: { type: 'int', min: 10, max: 200 },
  DU_RSI_BUY: { type: 'num', min: 15, max: 45 },
  DU_RSI_SELL: { type: 'num', min: 50, max: 80 },
  RISK_PER_TRADE_PCT: { type: 'num', min: 0.2, max: 5 },   // papier ; en réel, LIVE_MAX_USDT plafonne tout
  MAX_POSITION_PCT: { type: 'num', min: 5, max: 90 },
  SYMBOLS: { type: 'paires', min: 1, max: 5 },
};
/* Jamais, quelle que soit la réponse de l'IA. HOLD_UNTIL_PROFIT (« ne jamais vendre à perte ») est
   interdit aussi : c'est le réglage qui transforme une petite perte en grosse. */
export const INTERDITS = /^(TESTNET|PAPER|BOT_LIVE|BOT_KILL|BOT_NAME|BINANCE_.*|.*_(KEY|SECRET|TOKEN)|DAILY_LOSS_CAP_PCT|MAX_DRAWDOWN_PCT|CATASTROPHE_STOP_PCT|HOLD_UNTIL_PROFIT|MIN_PROFIT_PCT|LOOP_SECONDS|MIN_ORDER_USDT|LIVE_.*|RAILWAY_.*)$/i;
export const MAX_CHANGEMENTS = 4;

/* Rythme : une décision au plus toutes les 12 h ; un essai est jugé après 24 h, au plus tard 72 h. */
/* Rythme AGRESSIF (Kevin 2.10 « beaucoup de trades, stratégie féroce ») : une décision toutes les 6 h,
   un essai jugé entre 12 et 48 h (les robots en 1m-5m font assez de trades pour être jugés vite). */
export const ECART_DECISIONS_MS = 6 * 3600e3;
export const ESSAI_MIN_MS = 12 * 3600e3;
export const ESSAI_MAX_MS = 48 * 3600e3;
export const VENTES_MIN_ESSAI = 1;            // un robot qui ne trade plus pendant l'essai = changement raté
export const SEUIL_ECART = 0.002;            // 0,2 % d'écart à la médiane pour trancher
export const JOURNAL_MAX = 60;

export function nomBot(b) {
  const s = String(b || '').trim().toLowerCase();
  const m = s.match(/^(?:crypto-bot-)?p([1-5])$/);
  return m ? 'crypto-bot-p' + m[1] : s;
}

function normPaire(s) {
  let p = String(s).trim().toUpperCase().replace(/[-_]/g, '/');
  if (!p.includes('/') && p.endsWith('USDT')) p = p.slice(0, -4) + '/USDT';
  return p;
}

/* Ne garde d'une configuration que les réglages pilotables (jamais une clé, jamais un verrou). */
export function reglagesVisibles(vars) {
  const out = {};
  for (const k of Object.keys(vars || {})) if (REGLAGES_IA[k] && !INTERDITS.test(k)) out[k] = String(vars[k]);
  return out;
}

/* Extrait le premier objet JSON d'une réponse d'IA (balises <think>, blocs ```json, texte autour). */
export function extraireJson(texte) {
  let t = String(texte || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const i = t.indexOf('{');
  if (i < 0) return null;
  let prof = 0, dansChaine = false, echappe = false;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (dansChaine) { if (echappe) echappe = false; else if (c === '\\') echappe = true; else if (c === '"') dansChaine = false; continue; }
    if (c === '"') dansChaine = true;
    else if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) { try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; } } }
  }
  return null;
}

/* Valide une proposition (objet ou texte brut de l'IA). `actuels` = réglages du robot ciblé, pour
   vérifier les contraintes croisées (EMA rapide < lente, RSI achat < RSI vente). */
export function validerProposition(entree, actuelsParBot) {
  const p = typeof entree === 'string' ? extraireJson(entree) : entree;
  if (!p || typeof p !== 'object') return { ok: false, err: 'réponse sans JSON lisible' };
  const bot = nomBot(p.bot);
  if (bot === BOT_PRINCIPAL) return { ok: false, err: 'le robot principal (testnet, avec clés) est hors de portée de l\'IA' };
  if (!BOTS_PAPIER.includes(bot)) return { ok: false, err: 'robot inconnu : ' + String(p.bot).slice(0, 40) };
  const r = p.reglages;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, err: 'champ « reglages » absent' };
  const cles = Object.keys(r).map((k) => [k, String(k).trim().toUpperCase()]);
  const interdites = cles.filter(([, K]) => INTERDITS.test(K)).map(([, K]) => K);
  if (interdites.length) return { ok: false, err: 'réglage INTERDIT demandé : ' + interdites.join(', ') + ' — proposition rejetée en bloc' };
  const inconnues = cles.filter(([, K]) => !REGLAGES_IA[K]).map(([, K]) => K);
  if (inconnues.length) return { ok: false, err: 'réglage non autorisé : ' + inconnues.join(', ') };
  if (!cles.length) return { ok: false, err: 'aucun réglage proposé' };
  if (cles.length > MAX_CHANGEMENTS) return { ok: false, err: 'trop de changements à la fois (' + cles.length + ' > ' + MAX_CHANGEMENTS + ') : on ne saurait plus lequel a compté' };
  const set = {};
  for (const [k, K] of cles) {
    const regle = REGLAGES_IA[K]; const v = r[k];
    if (regle.type === 'enum') {
      const s = String(v).trim().toLowerCase();
      if (!regle.valeurs.includes(s)) return { ok: false, err: K + ' doit être ' + regle.valeurs.join('/') };
      set[K] = s;
    } else if (regle.type === 'paires') {
      const arr = [...new Set((Array.isArray(v) ? v : String(v).split(',')).map(normPaire).filter(Boolean))];
      if (arr.length < regle.min || arr.length > regle.max) return { ok: false, err: 'SYMBOLS : entre ' + regle.min + ' et ' + regle.max + ' paires' };
      const hors = arr.filter((x) => !PAIRES_LIQUIDES.includes(x));
      if (hors.length) return { ok: false, err: 'paire hors liste liquide : ' + hors.join(', ') };
      set[K] = arr.join(',');
    } else {
      const n = Number(v);
      if (!isFinite(n) || n < regle.min || n > regle.max) return { ok: false, err: K + ' doit être entre ' + regle.min + ' et ' + regle.max };
      if (regle.type === 'int' && !Number.isInteger(n)) return { ok: false, err: K + ' doit être un nombre entier' };
      set[K] = String(n);
    }
  }
  const fusion = Object.assign({}, reglagesVisibles((actuelsParBot || {})[bot]), set);
  const nb = (k, d) => (fusion[k] !== undefined ? Number(fusion[k]) : d);
  if (nb('EMA_FAST', 9) >= nb('EMA_SLOW', 21)) return { ok: false, err: 'EMA_FAST doit rester plus petit que EMA_SLOW' };
  if (nb('MR_RSI_BUY', 35) >= nb('MR_RSI_SELL', 60)) return { ok: false, err: 'MR_RSI_BUY doit rester sous MR_RSI_SELL' };
  if (nb('DU_RSI_BUY', 35) >= nb('DU_RSI_SELL', 60)) return { ok: false, err: 'DU_RSI_BUY doit rester sous DU_RSI_SELL' };
  const raison = String(p.raison || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (raison.length < 8) return { ok: false, err: 'proposition sans raison : refusée (on ne change rien sans pouvoir l\'expliquer)' };
  return { ok: true, bot, set, raison, attendu: String(p.attendu || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
}

function mediane(xs) {
  const a = xs.filter((x) => isFinite(x)).sort((u, v) => u - v);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/* L'ARBITRE. `essai` = { bot, debut, equite0: {nom: équité au départ}, btc0 } ;
   `equites` = { nom: équité maintenant } ; `btc` = prix BTC maintenant (affiché, pas décisif). */
/* UN REDÉMARRAGE REMET LE PORTEFEUILLE PAPIER À 10 000 $ (crypto-bot/paper.py, start_usdt).
   Donc : le robot essayé repart de 10 000 $ (c'est sa base, pas son ancien capital) ; un AUTRE robot
   qui a redémarré pendant l'essai n'est plus comparable et sort du calcul ; tant que le robot essayé
   tourne encore sur l'ancien déploiement, on ne le mesure pas. Sans ça l'arbitre jugeait faux. */
export const PAPIER_DEPART = 10000;
export function debutEssai(bot, flotte) {
  const equite0 = {}, depl0 = {};
  (flotte || []).forEach((b) => {
    if (!BOTS_PAPIER.includes(b.name)) return;
    if (b.depl) depl0[b.name] = b.depl;
    if (b.name === bot) equite0[b.name] = PAPIER_DEPART;
    else if (Number(b.equity) > 0) equite0[b.name] = Number(b.equity);
  });
  return { equite0, depl0 };
}
export function equitesComparables(essai, flotte) {
  const out = {}, d0 = essai.depl0 || {};
  (flotte || []).forEach((b) => {
    if (!(Number(b.equity) > 0) || !BOTS_PAPIER.includes(b.name)) return;
    if (b.name === essai.bot) { if (!d0[b.name] || b.depl !== d0[b.name]) out[b.name] = Number(b.equity); }
    else if (!d0[b.name] || b.depl === d0[b.name]) out[b.name] = Number(b.equity);
  });
  return out;
}

export function arbitre(essai, equites, now, btc, ventesCible) {
  const age = now - essai.debut;
  const rend = (n) => {
    const a = Number((essai.equite0 || {})[n]), b = Number((equites || {})[n]);
    return a > 0 && b > 0 ? b / a - 1 : null;
  };
  const rc = rend(essai.bot);
  const autres = BOTS_PAPIER.filter((n) => n !== essai.bot).map(rend).filter((x) => x !== null);
  const m = mediane(autres);
  const rBtc = essai.btc0 > 0 && btc > 0 ? btc / essai.btc0 - 1 : null;
  const base = { r_cible: rc, r_mediane: m, r_btc: rBtc, heures: Math.round(age / 3600e3) };
  if (rc === null) {
    if (age >= ESSAI_MAX_MS) return Object.assign(base, { verdict: 'annuler', raison: 'aucune mesure du robot depuis 48 h : on revient aux anciens réglages par prudence' });
    return Object.assign(base, { verdict: 'attendre', raison: 'pas encore de mesure du robot' });
  }
  if (age < ESSAI_MIN_MS) return Object.assign(base, { verdict: 'attendre', raison: 'moins de 12 h d\'essai : trop tôt pour juger' });
  const ecart = rc - (m === null ? 0 : m);
  if (ventesCible !== undefined && ventesCible !== null && Number(ventesCible) < VENTES_MIN_ESSAI && ecart < SEUIL_ECART)
    return Object.assign(base, { ecart, verdict: 'annuler', raison: 'robot inactif : aucun trade bouclé en ' + base.heures + ' h — un robot agressif doit trader ; anciens réglages remis' });
  base.ecart = ecart;
  const pct = (x) => (x === null ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + ' %');
  const phrase = 'robot ' + pct(rc) + ' contre ' + pct(m) + ' pour la médiane des autres (BTC ' + pct(rBtc) + ')';
  if (ecart >= SEUIL_ECART) return Object.assign(base, { verdict: 'garder', raison: 'mieux que les autres sur la même période : ' + phrase });
  if (ecart <= -SEUIL_ECART) return Object.assign(base, { verdict: 'annuler', raison: 'moins bien que les autres sur la même période : ' + phrase });
  if (age >= ESSAI_MAX_MS) return Object.assign(base, { verdict: 'garder', raison: 'aucune différence nette en 48 h (' + phrase + ') : gardé, sans effet mesurable' });
  return Object.assign(base, { verdict: 'attendre', raison: 'écart encore trop faible pour conclure : ' + phrase });
}

/* RÈGLE DE SECOURS (IA indisponible) : le robot le moins bon copie la stratégie et le rythme du
   meilleur ; s'il les a déjà, on décale de 15 % un réglage de sa stratégie. Déterministe. */
export function propositionDeSecours(flotte, actuelsParBot) {
  const mesures = (flotte || []).filter((b) => BOTS_PAPIER.includes(b.name) && Number(b.equity) > 0)
    .sort((a, b) => Number(b.equity) - Number(a.equity));
  if (mesures.length < 2) return { ok: false, err: 'moins de deux robots mesurés : rien à comparer' };
  const champion = mesures[0], cible = mesures[mesures.length - 1];
  const vc = reglagesVisibles((actuelsParBot || {})[champion.name]);
  const vt = reglagesVisibles((actuelsParBot || {})[cible.name]);
  const set = {};
  if (vc.STRATEGY && vc.STRATEGY !== vt.STRATEGY) set.STRATEGY = vc.STRATEGY;
  if (vc.TIMEFRAME && vc.TIMEFRAME !== vt.TIMEFRAME) set.TIMEFRAME = vc.TIMEFRAME;
  if (!Object.keys(set).length) {
    const famille = { ema: 'EMA_SLOW', meanrev: 'MR_STD_MULT', dipup: 'DU_TREND_PERIOD' }[vt.STRATEGY || 'ema'] || 'EMA_SLOW';
    const regle = REGLAGES_IA[famille];
    const defaut = { EMA_SLOW: 21, MR_STD_MULT: 2, DU_TREND_PERIOD: 50 }[famille];
    let v = Number(vt[famille] !== undefined ? vt[famille] : defaut) * 1.15;
    v = Math.min(regle.max, Math.max(regle.min, v));
    set[famille] = String(regle.type === 'int' ? Math.round(v) : Math.round(v * 100) / 100);
  }
  const v = validerProposition({ bot: cible.name, reglages: set,
    raison: 'IA indisponible — règle de secours : ' + cible.name + ' (le moins bon) s\'inspire de ' + champion.name + ' (le meilleur)' }, actuelsParBot);
  return v.ok ? v : { ok: false, err: 'secours invalide : ' + v.err };
}

/* ---------- Lecteurs de données de marché (formats publics documentés, sans clé) ---------- */
export function lireFearGreed(j) {
  const d = j && Array.isArray(j.data) ? j.data : [];
  if (!d.length) return null;
  return { valeur: Number(d[0].value), libelle: String(d[0].value_classification || ''), hier: d[1] ? Number(d[1].value) : null };
}
export function lireCoingeckoGlobal(j) {
  const d = j && j.data;
  if (!d || !d.total_market_cap) return null;
  return { capi_usd: Number(d.total_market_cap.usd), var24h: Number(d.market_cap_change_percentage_24h_usd),
    dom_btc: Number((d.market_cap_percentage || {}).btc), dom_eth: Number((d.market_cap_percentage || {}).eth) };
}
export function lireBinance24h(arr) {
  if (!Array.isArray(arr)) return null;
  const voulues = new Set(PAIRES_LIQUIDES.map((p) => p.replace('/', '')));
  const lignes = arr.filter((t) => t && voulues.has(t.symbol)).map((t) => ({
    paire: t.symbol.replace(/USDT$/, '/USDT'), prix: Number(t.lastPrice), var24h: Number(t.priceChangePercent),
    vol_usdt: Number(t.quoteVolume) }));
  return lignes.sort((a, b) => b.var24h - a.var24h);
}
export function lireStooqCsv(texte) {
  const lignes = String(texte || '').trim().split(/\r?\n/);
  if (lignes.length < 2 || !/^Symbol,/i.test(lignes[0])) return null;
  const tete = lignes[0].split(',').map((s) => s.trim().toLowerCase());
  const col = (n) => tete.indexOf(n);
  return lignes.slice(1).map((l) => l.split(',')).map((c) => {
    const ouv = Number(c[col('open')]), clo = Number(c[col('close')]);
    const ok = isFinite(ouv) && isFinite(clo) && ouv > 0;
    return { symbole: c[col('symbol')], date: c[col('date')], cloture: ok ? clo : null, var_jour: ok ? (clo / ouv - 1) * 100 : null };
  });
}
function entites(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
}
export function lireRss(xml, max) {
  const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.slice(0, max || 6).map((it) => {
    const titre = entites((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 180);
    const lien = entites((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
    return { titre, lien: /^https:\/\//.test(lien) ? lien : '' };
  }).filter((x) => x.titre);
}
export function lireFundingOkx(j) {
  const d = j && Array.isArray(j.data) && j.data[0];
  return d && d.fundingRate !== undefined ? Number(d.fundingRate) : null;
}

/* Résumé court et chiffré du marché, pour le prompt (jamais de lien, jamais de secret). */
export function resumerMarche(m) {
  const L = [];
  const p = (x, d) => (x === null || x === undefined || !isFinite(x) ? '—' : Number(x).toFixed(d === undefined ? 2 : d));
  if (m.peur_avidite) L.push('Indice peur/avidité : ' + m.peur_avidite.valeur + ' (' + m.peur_avidite.libelle + '), hier ' + (m.peur_avidite.hier ?? '—'));
  if (m.global) L.push('Capitalisation crypto : ' + p(m.global.capi_usd / 1e12) + ' T$ (' + p(m.global.var24h) + ' % sur 24 h), dominance BTC ' + p(m.global.dom_btc, 1) + ' %');
  if (m.funding_btc !== null && m.funding_btc !== undefined) L.push('Financement BTC perpétuel : ' + p(m.funding_btc * 100, 4) + ' % par 8 h');
  if (Array.isArray(m.cryptos) && m.cryptos.length) L.push('24 h : ' + m.cryptos.map((c) => c.paire.replace('/USDT', '') + ' ' + p(c.var24h, 1) + '%').join(', '));
  if (Array.isArray(m.bourse) && m.bourse.length) L.push('Bourse (jour) : ' + m.bourse.filter((b) => b.var_jour !== null).map((b) => b.nom + ' ' + p(b.var_jour, 2) + '%').join(', '));
  if (Array.isArray(m.actus) && m.actus.length) L.push('Titres récents : ' + m.actus.slice(0, 5).map((a) => '« ' + a.titre + ' »').join(' ; '));
  return L.join('\n');
}

/* Le prompt : l'IA voit le marché, chaque robot et ses réglages, et le résultat de ses décisions
   passées ; elle doit répondre en JSON strict. */
export function construirePrompt(marcheTexte, flotte, actuelsParBot, journal) {
  const sys = 'Tu es un trader professionnel expérimenté et AGRESSIF qui pilote 5 robots de trading crypto en MODE PAPIER (argent '
    + 'virtuel). Objectif : un maximum de trades GAGNANTS — beaucoup d\'opérations, des sorties rapides, du capital qui travaille. '
    + 'Règle de pro : chaque trade paie ~0,2 % de frais aller-retour, donc un trade ne vaut que si le mouvement visé dépasse nettement '
    + 'ce coût ; un robot qui trade beaucoup en perdant est pire qu\'un robot calme. Sur 1m-5m, préfère les paires les plus liquides '
    + '(BTC, ETH, SOL). Ton rôle : proposer UN seul changement de réglages sur UN seul robot. Un arbitre chiffré comparera ce robot à '
    + 'la médiane des autres sur la même période (12 à 48 h), puis gardera ou annulera ton changement ; un robot sans aucun trade est '
    + 'annulé. Sois audacieux mais justifie par le marché décrit. Tu ne peux régler QUE : ' + Object.keys(REGLAGES_IA).join(', ')
    + ' (au plus ' + MAX_CHANGEMENTS + '). Paires autorisées : ' + PAIRES_LIQUIDES.join(', ') + '. '
    + 'Réponds UNIQUEMENT par un objet JSON : {"bot":"crypto-bot-pN","reglages":{...},"raison":"en français, 1 à 3 phrases","attendu":"ce que tu espères mesurer"}.';
  const bornes = Object.entries(REGLAGES_IA).map(([k, r]) => k + (r.type === 'enum' ? '∈{' + r.valeurs.join(',') + '}' : r.type === 'paires' ? ' (1-5 paires)' : '[' + r.min + '-' + r.max + ']')).join(' ; ');
  const robots = BOTS_PAPIER.map((n) => {
    const b = (flotte || []).find((x) => x.name === n) || {};
    const v = reglagesVisibles((actuelsParBot || {})[n]);
    return n + ' : équité ' + (b.equity ?? '—') + ' $, net réalisé ' + (b.net ?? '—') + ' $, ventes ' + (b.sells ?? '—')
      + ' (gagnantes ' + (b.wins ?? '—') + ') — réglages ' + JSON.stringify(v);
  }).join('\n');
  const passe = (journal || []).filter((e) => e.type === 'verdict').slice(-6)
    .map((e) => e.bot + ' ' + JSON.stringify(e.set || {}) + ' → ' + e.verdict + ' (' + (e.raison || '') + ')').join('\n') || 'aucune décision jugée pour l\'instant';
  const user = 'MARCHÉ EN DIRECT\n' + (marcheTexte || 'données indisponibles') + '\n\nROBOTS PAPIER\n' + robots
    + '\n\nBORNES\n' + bornes + '\n\nTES DÉCISIONS DÉJÀ JUGÉES\n' + passe + '\n\nTa proposition (JSON seul) :';
  return { system: sys, prompt: user };
}

export function ajouterJournal(journal, entree) {
  const j = Array.isArray(journal) ? journal.slice() : [];
  j.push(entree);
  return j.slice(-JOURNAL_MAX);
}

/* ===== PASSAGE AU RÉEL — CONTRÔLE, JAMAIS BASCULE (Kevin 2026-10-02 « prépare tout pour passer en
   argent réel quand ce sera testé et prouvé ») =====
   Ce module DIT si un robot papier a prouvé assez pour être candidat. Il ne bascule RIEN : le passage
   reste un geste de Kevin (triple verrou côté robot : TESTNET=false + BOT_LIVE=true + LIVE_MAX_USDT).
   Seuils volontairement durs : un papier « juste positif » ne prouve rien (pas de glissement, pas
   d'émotion, frais déjà comptés à 0,1 %). */
export const SEUILS_REEL = { jours: 60, ventes: 30, rendement_min: 0, avance_btc: 0.02, baisse_max: 0.15 };
/* Segment continu le plus récent d'un robot : on coupe à chaque redémarrage (portefeuille remis à
   10 000 $, compteurs d'achats/ventes remis à 0). */
export function segmentDepuisRedemarrage(hist, nom) {
  const pts = (hist || []).filter((p) => p && p.b && p.b[nom] && Number(p.b[nom].e) > 0)
    .map((p) => ({ t: Number(p.t), e: Number(p.b[nom].e), a: Number(p.b[nom].a) || 0, v: Number(p.b[nom].v) || 0, btc: Number(p.btc) || null }));
  let debut = 0;
  for (let i = 1; i < pts.length; i++) {
    const avant = pts[i - 1], ici = pts[i];
    if ((ici.a + ici.v) < (avant.a + avant.v)) debut = i;   // compteurs revenus en arrière = redémarrage
  }
  return pts.slice(debut);
}
export function pretPourLeReel(hist, nom, s) {
  const S = Object.assign({}, SEUILS_REEL, s || {});
  const seg = segmentDepuisRedemarrage(hist, nom);
  const c = [];
  const ajoute = (cle, ok, valeur, seuil) => c.push({ cle, ok: !!ok, valeur, seuil });
  if (seg.length < 2) {
    ajoute('duree', false, '0 j', S.jours + ' j');
    return { nom, pret: false, criteres: c, rendement: null };
  }
  const p0 = seg[0], p1 = seg[seg.length - 1];
  const jours = (p1.t - p0.t) / 86400e3;
  const rend = p1.e / p0.e - 1;
  let pic = 0, baisse = 0;
  for (const p of seg) { pic = Math.max(pic, p.e); baisse = Math.max(baisse, pic > 0 ? 1 - p.e / pic : 0); }
  const ventes = p1.v - p0.v;
  const b0 = (seg.find((p) => p.btc) || {}).btc, b1 = ([...seg].reverse().find((p) => p.btc) || {}).btc;
  const rBtc = b0 && b1 ? b1 / b0 - 1 : null;
  const pc = (x) => (x === null ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' %');
  ajoute('duree', jours >= S.jours, Math.floor(jours) + ' j', '≥ ' + S.jours + ' j sans redémarrage');
  ajoute('ventes', ventes >= S.ventes, ventes + ' ventes', '≥ ' + S.ventes + ' trades bouclés');
  ajoute('rendement', rend > S.rendement_min, pc(rend), '> 0 (frais compris)');
  ajoute('btc', rBtc !== null && rend - rBtc >= S.avance_btc, rBtc === null ? 'BTC non mesuré' : pc(rend - rBtc) + ' vs BTC', '≥ +' + (S.avance_btc * 100) + ' pts sur le BTC');
  ajoute('baisse', baisse <= S.baisse_max, '−' + (baisse * 100).toFixed(1) + ' %', '≤ −' + (S.baisse_max * 100) + ' % au pire');
  return { nom, pret: c.every((x) => x.ok), criteres: c, rendement: rend, jours: Math.floor(jours) };
}

/* ===== POINT VOCAL (Kevin 2026-10-02 « les voix aussi ») : texte court, en français, lu par la voix
   gratuite du domaine (Google Chirp 3 HD). Chiffres arrondis, aucun jargon. ≤ 900 caractères. */
export function resumeVocal(ia, marche) {
  const L = [];
  const pc = (x) => (x >= 0 ? 'plus ' : 'moins ') + Math.abs(Number(x)).toFixed(1).replace('.', ',') + ' pour cent';
  const m = marche || {};
  if (m.peur_avidite) L.push('Le marché crypto est à ' + m.peur_avidite.valeur + ' sur 100 sur l\'indice de peur et d\'avidité.');
  const btc = (m.cryptos || []).find((c) => c.paire === 'BTC/USDT');
  if (btc) L.push('Le bitcoin vaut ' + Math.round(btc.prix).toLocaleString('fr-FR') + ' dollars, ' + pc(btc.var24h) + ' sur vingt-quatre heures.');
  const spx = (m.bourse || []).find((b) => /S&P/.test(b.nom || '') && b.var_jour !== null);
  if (spx) L.push('Le S and P 500 est à ' + pc(spx.var_jour) + ' sur la journée.');
  const st = ia || {};
  if (st.mode === 'off') L.push('L\'IA pilote est en pause.');
  if (st.enCours) L.push('Essai en cours sur le ' + String(st.enCours.bot || '').replace('crypto-bot-p', 'robot ') + ' : ' + String(st.enCours.raison || '').slice(0, 160));
  const v = (st.journal || []).find((e) => e.type === 'verdict');
  if (v) L.push('Dernier verdict : ' + (v.verdict === 'garder' ? 'changement gardé' : v.verdict === 'annuler' ? 'changement annulé' : v.verdict) + ' sur le ' + String(v.bot || '').replace('crypto-bot-p', 'robot ') + '.');
  L.push('Rappel : c\'est du faux argent.');
  return L.join(' ').replace(/\s+/g, ' ').slice(0, 900);
}

/* ===== CONTRE-AVIS (deuxième IA gratuite, d'une autre famille) =====
   La première propose ; la seconde relit et répond OUI ou NON. NON = aucun changement ce tour-ci.
   Muet ou illisible = on suit l'arbitre (la proposition est déjà bornée et sera jugée sur chiffres). */
export function consigneContreAvis(prop, resumeMarche) {
  return {
    system: 'Tu es un gérant de risque prudent. On teste des robots de trading crypto en PAPIER (faux argent). '
      + 'Réponds UNIQUEMENT par un JSON {"avis":"OUI"|"NON","raison":"une phrase en français"}.',
    prompt: 'Marché :\n' + String(resumeMarche || '').slice(0, 1500) + '\n\nProposition : robot ' + prop.bot + ', réglages '
      + JSON.stringify(prop.set) + ', raison : « ' + String(prop.raison || '').slice(0, 300) + ' ». '
      + 'Ce changement est-il cohérent avec le marché décrit et raisonnable (pas un pari) ? OUI ou NON.',
  };
}
export function lireContreAvis(texte) {
  const j = extraireJson(String(texte || ''));
  if (!j || typeof j !== 'object') return null;
  const a = String(j.avis || '').trim().toUpperCase();
  if (a !== 'OUI' && a !== 'NON') return null;
  return { avis: a, raison: String(j.raison || '').slice(0, 300) };
}
/* Texte d'une réponse Workers AI, quel que soit son format (chat, Responses API de gpt-oss). */
export function texteReponseIa(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.response === 'string') return r.response;
  if (typeof r.output_text === 'string') return r.output_text;
  if (Array.isArray(r.output)) {
    const t = [];
    r.output.forEach((o) => (o && Array.isArray(o.content) ? o.content : []).forEach((c) => { if (c && c.type !== 'reasoning_text' && typeof c.text === 'string') t.push(c.text); }));
    if (t.length) return t.join('\n');
  }
  const ch = r.choices && r.choices[0] && r.choices[0].message;
  return ch && typeof ch.content === 'string' ? ch.content : '';
}

/* ===== SOURCES DE RELAIS (3.10.2026, mesuré dans le journal D1 du réveil de 00h00) =====
   Depuis Cloudflare : Binance 403 (adresses Cloudflare bloquées), CoinGecko 429, OKX 429, Stooq 404.
   Relais gratuits, sans clé, formats relevés sur les vraies réponses du 3.10 : Crypto.com (tous les
   prix en 1 requête), CoinPaprika (marché global), Kraken Futures (financement), Cboe (indices US
   différés), gold-api (or), Frankfurter (BCE, EUR/USD). */
export function lireCryptoComTickers(j) {
  const d = j && j.result && Array.isArray(j.result.data) ? j.result.data : null;
  if (!d) return null;
  const voulues = new Map(PAIRES_LIQUIDES.map((p) => [p.replace('/', '_'), p]));
  return d.filter((t) => t && voulues.has(t.i) && Number(t.a) > 0)
    .map((t) => ({ paire: voulues.get(t.i), prix: Number(t.a), var24h: Math.round(Number(t.c) * 10000) / 100, vol_usdt: Number(t.vv) || 0 }))
    .sort((a, b) => b.var24h - a.var24h);
}
export function lireCoinpaprikaGlobal(j) {
  if (!j || !(Number(j.market_cap_usd) > 0)) return null;
  return { capi_usd: Number(j.market_cap_usd), var24h: Number(j.market_cap_change_24h), dom_btc: Number(j.bitcoin_dominance_percentage), dom_eth: null };
}
/* Kraken Futures donne un financement ABSOLU par heure (USD par BTC) : relatif sur 8 h = taux / prix × 8,
   pour rester comparable au taux OKX/Binance (par période de 8 h). */
export function lireFundingKraken(j) {
  const t = j && Array.isArray(j.tickers) ? j.tickers.find((x) => x && x.symbol === 'PF_XBTUSD') : null;
  if (!t || !(Number(t.markPrice) > 0) || t.fundingRate === undefined) return null;
  return Number(t.fundingRate) / Number(t.markPrice) * 8;
}
export function lireCboe(j, nom) {
  const d = j && j.data;
  if (!d || !(Number(d.current_price) > 0)) return null;
  return { nom, symbole: String(d.symbol || ''), cloture: Number(d.current_price), var_jour: Number(d.price_change_percent) };
}
export function lireGoldApi(j) {
  return j && Number(j.price) > 0 ? { nom: 'Or (once)', symbole: 'XAU', cloture: Number(j.price), var_jour: null } : null;
}
export function lireFrankfurter(j) {
  const v = j && j.rates && Number(j.rates.USD);
  return v > 0 ? { nom: 'EUR/USD', symbole: 'EURUSD', cloture: v, var_jour: null } : null;
}
/* Bougies Crypto.com → format Binance [t, o, h, l, c, v] (les calculs d'indicateurs restent identiques). */
export const TF_CRYPTOCOM = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1D' };
export function bougiesCryptoCom(j) {
  const d = j && j.result && Array.isArray(j.result.data) ? j.result.data : null;
  if (!d) return null;
  return d.map((b) => [Number(b.t), String(b.o), String(b.h), String(b.l), String(b.c), String(b.v)]).sort((a, b) => a[0] - b[0]);
}
