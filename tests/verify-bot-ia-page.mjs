/* PREUVE EN VRAI NAVIGATEUR — cartes « IA pilote », « Marchés en direct » et « Liens »
 * du tableau de bord crypto (bot.kd-mc.com, tools/crypto-bot-dashboard/index.html). Kevin 2026-10-02.
 * Le domaine est simulé ; la page est chargée dans Chromium à 375 px (iPhone) :
 *   1. l'IA affiche son mode, l'essai en cours (avant → après), le journal et les verdicts chiffrés
 *   2. un texte piégé (<img onerror>) venu de l'IA ou d'une actu reste du TEXTE, jamais du code
 *   3. « Lancer maintenant » appelle POST /__bot/ia/tick ; « Pause » envoie {mode:"off"}
 *   4. marchés : peur/avidité, cryptos, bourse, actus, état des sources ; liens classés
 *   5. 0 exception JS, 0 débordement horizontal, boutons de l'IA ≥ 44 px
 * Lancer : node tests/verify-bot-ia-page.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PIEGE = '<img src=x onerror="window.__pwned=1">';
const H = 3600e3, now = Date.now();
const IA = { ok: true, mode: 'auto', dernierTick: now - 600e3, dernier: 'essai en cours sur crypto-bot-p2', robots: [],
  enCours: { bot: 'crypto-bot-p2', debut: now - 5 * H, set: { EMA_SLOW: '30' }, avant: { EMA_SLOW: null }, raison: 'marché calme ' + PIEGE, attendu: 'moins de faux signaux', source: 'ia', modele: 'qwen · qwen3' },
  journal: [
    { type: 'relance', t: now - 1 * H, bot: 'crypto-bot-p5', ok: true, raison: 'robot papier arrêté par son frein (plafond de perte journalière atteint, capital figé à 7132.12 $) : relancé, il repart à 10 000 $ virtuels' },
    { type: 'refus', t: now - 2 * H, bot: 'crypto-bot-p3', set: { STRATEGY: 'meanrev' }, raison: 'tenter le creux', contre_avis: 'pari contre la tendance', modele_contre: 'gpt-oss-120b' },
    { type: 'decision', t: now - 5 * H, contre_avis: 'cohérent', modele_contre: 'gpt-oss-120b', bot: 'crypto-bot-p2', set: { EMA_SLOW: '30' }, avant: { EMA_SLOW: null }, raison: 'marché calme', source: 'ia', modele: 'qwen', origine: 'cron' },
    { type: 'verdict', t: now - 30 * H, bot: 'crypto-bot-p4', set: { TIMEFRAME: '1h' }, avant: { TIMEFRAME: '15m' }, verdict: 'garder', raison: 'mieux que les autres', r_cible: 0.021, r_mediane: 0.004, r_btc: 0.012, heures: 26 },
    { type: 'verdict', t: now - 90 * H, bot: 'crypto-bot-p1', set: { STRATEGY: 'meanrev' }, avant: { STRATEGY: 'ema' }, verdict: 'annuler', raison: 'moins bien', r_cible: -0.03, r_mediane: 0.001, r_btc: -0.01, heures: 30, restaure: 'anciens réglages remis' },
  ] };
const MARCHE = { ok: true, le: now, peur_avidite: { valeur: 64, libelle: 'Greed', hier: 60 }, global: { capi_usd: 2.4e12, var24h: -1.2, dom_btc: 56.1 }, funding_btc: 0.0001,
  cryptos: [{ paire: 'BTC/USDT', prix: 61000, var24h: 1.5 }, { paire: 'ETH/USDT', prix: 2500, var24h: -2 }],
  bourse: [{ nom: 'S&P 500', symbole: '^SPX', cloture: 5040, var_jour: 0.8 }, { nom: 'Or', symbole: 'XAUUSD', cloture: null, var_jour: null }],
  actus: [{ source: 'CoinDesk', titre: 'Bitcoin ' + PIEGE, lien: 'https://ex.com/a' }, { source: 'Journal du Coin', titre: 'Sans lien', lien: 'javascript:alert(1)' }],
  sources: { 'Peur & avidité (alternative.me)': 'ok', 'Prix 24 h des cryptos': 'ok (Crypto.com ; Binance HTTP 403)', 'Bourse (Stooq)': 'HTTP 503' } };
const LIENS = { ok: true, le: now, liens: [{ cat: 'Crypto', nom: 'CoinGecko', url: 'https://www.coingecko.com/', etat: 'ok' }, { cat: 'Bourse', nom: 'Finviz', url: 'https://finviz.com/map.ashx', etat: 'protege' }, { cat: 'Actus', nom: 'Piège', url: 'javascript:alert(1)', etat: 'ok' }] };
const REEL = { ok: true, pret: false, releves: 40, testnet: { jours: 3, ok: false }, robots: [
  { nom: 'crypto-bot-p1', pret: false, criteres: [{ cle: 'duree', ok: false, valeur: '2 j', seuil: '≥ 60 j sans redémarrage' }, { cle: 'btc', ok: true, valeur: '+3.0 % vs BTC', seuil: '≥ +2 pts' }] },
  { nom: 'crypto-bot-p4', pret: true, criteres: [{ cle: 'duree', ok: true, valeur: '61 j', seuil: '≥ 60 j' }] }] };
const posts = [], tts = [];
const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let corps = ''; for await (const c of req) corps += c;
  const J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(await readFile('tools/crypto-bot-dashboard/index.html')); }
  if (u.pathname === '/__admin/grant') return J({ ok: true, grant: 'g' });
  if (req.method === 'POST' && u.pathname.startsWith('/__bot/ia')) { posts.push([u.pathname, corps]); return J({ ok: true, detail: 'fait' }); }
  if (u.pathname === '/__bot/ia') return J(IA);
  if (u.pathname === '/__bot/reel') return J(REEL);
  if (u.pathname === '/__bot/ia/vocal') return J({ ok: true, texte: 'Le bitcoin vaut 61 000 dollars. Rappel : c\'est du faux argent.' });
  if (u.pathname === '/__lingua/tts') { tts.push(u.search); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false,"reason":"simulé"}'); }
  if (u.pathname === '/__bot/marche') return J(MARCHE);
  if (u.pathname === '/__bot/liens') return J(LIENS);
  if (u.pathname.startsWith('/__bot/')) return J({ ok: false, reason: 'simulé' });
  res.writeHead(404); res.end('404');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const nav = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await nav.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /gardé/.test(document.getElementById('iaJournal').textContent), null, { timeout: 8000 }).catch(() => {});

const t = (id) => page.$eval('#' + id, (e) => e.textContent).catch(() => '');
chk(/Active/.test(await t('iaMode')), 'IA : mode « Active » affiché');
const enc = await t('iaEnCours');
chk(/Robot P2/.test(enc) && /\(défaut\)/.test(enc) && /30/.test(enc), 'IA : essai en cours avec avant → après (« (défaut) → 30 ») : ' + enc.slice(0, 80));
chk(/1 gardé\(s\) · 1 annulé\(s\)/.test(await t('iaScore')), 'IA : score des essais jugés');
const jr = await t('iaJournal');
chk(/\+2\.10 %/.test(jr) && /\+0\.40 %/.test(jr) && /\+1\.20 %/.test(jr), 'IA : verdict chiffré robot / autres / BTC');
chk(/anciens réglages remis/.test(jr), 'IA : la remise des anciens réglages est écrite');
chk(!(await page.$('#iaAnnulerBtn.hid')), 'IA : bouton « Annuler l\'essai » visible pendant un essai');
chk(/Greed/.test(await t('mkFg')) && /64/.test(await t('mkFg')), 'Marchés : peur/avidité');
chk(/BTC\/USDT/.test(await t('mkCryptos')) && /\+1\.50 %/.test(await t('mkCryptos')), 'Marchés : cryptos 24 h');
chk(/S&P 500/.test(await t('mkBourse')) && /fermé/.test(await t('mkBourse')), 'Marchés : bourse, et « fermé » au lieu d\'un faux zéro');
chk(/HTTP 503/.test(await t('mkSources')), 'Marchés : une source en panne est signalée');
chk(/✅ Crypto\.com/.test(await t('mkSources')), 'Marchés : une source servie par un relais est verte et nomme le relais');
chk((await page.$$('#liens a.coin')).length === 2, 'Liens : 2 liens https affichés, le lien javascript: écarté');
chk((await page.$$('#mkActus a')).length === 1, 'Actus : seul le lien https devient cliquable');
chk(!(await page.evaluate(() => window.__pwned)) && (await page.$$('#iaCard img, #mkActus img')).length === 0, 'Texte piégé : affiché en texte, jamais exécuté');
const tailles = await page.$$eval('#iaCard button:not(.hid)', (bs) => bs.map((b) => b.getBoundingClientRect().height));
chk(tailles.length >= 2 && tailles.every((h) => h >= 44), 'Boutons de l\'IA ≥ 44 px : ' + tailles.join(', '));
chk(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Aucun débordement horizontal à 375 px');

await page.click('text=⚡ Lancer maintenant');
await page.waitForTimeout(300);
chk(posts.some(([p]) => p === '/__bot/ia/tick'), '« Lancer maintenant » → POST /__bot/ia/tick');
await page.click('#iaModeBtn');
await page.waitForTimeout(300);
chk(posts.some(([p, b]) => p === '/__bot/ia/mode' && /"off"/.test(b)), '« Mettre en pause » → POST /__bot/ia/mode {mode:"off"}');
await page.click('#iaAnnulerBtn');
await page.waitForTimeout(300);
chk(posts.some(([p]) => p === '/__bot/ia/annuler'), '« Annuler l\'essai » → POST /__bot/ia/annuler (après confirmation)');
chk(/🔄/.test(jr) && /relancé/.test(jr) && /capital figé à 7132\.12/.test(jr), 'Journal : un robot arrêté par son frein puis relancé est affiché avec sa raison');
chk(/refusé par le contre-avis/.test(jr) && /pari contre la tendance/.test(jr), 'Journal : un refus du contre-avis est affiché avec sa raison');
chk(/gpt-oss-120b : cohérent/.test(jr), 'Journal : l\'avis de la 2e IA est affiché sur la décision');
const reel = await t('reelRobots');
chk(/Pas encore/.test(await t('reelPill')) && /Robot P1/.test(reel) && /❌ Durée : 2 j/.test(reel) && /✅ candidat/.test(reel), 'Passage au réel : chaque critère ✅/❌ avec la valeur mesurée');
chk(/3 j sans redémarrage/.test(await t('reelTestnet')), 'Passage au réel : durée du testnet affichée');
chk(!/BOT_LIVE=true/.test(await page.$eval('#reelRobots', (e) => e.innerHTML)) && (await page.$$('button[onclick*="reel"], button[onclick*="live"]')).length === 0, 'Aucun bouton ne bascule en argent réel');
await page.click('text=Leda (femme)');
await page.click('#iaVoixBtn');
await page.waitForTimeout(600);
chk(tts.length === 1 && /l=fr/.test(tts[0]) && /v=shimmer/.test(tts[0]) && /faux%20argent/.test(tts[0]), 'Voix : le point est envoyé à la voix gratuite du domaine, voix choisie (Leda) : ' + (tts[0] || '').slice(0, 50));
chk(/voix du téléphone|Lecture impossible/.test(await t('iaOk') + await t('iaErr')), 'Voix du domaine indisponible → repli voix du téléphone annoncé');
chk(erreurs.length === 0, '0 exception JS' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
const src = await readFile('tools/crypto-bot-dashboard/index.html', 'utf8');
chk(/data-version="v1\.5\.2"/.test(src), 'badge de version v1.5.2');
await page.screenshot({ path: process.env.CAPTURE || '/dev/null', fullPage: false }).catch(() => {});
await nav.close(); srv.close();

R.ok.forEach((m) => console.log('  ✅ ' + m));
R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log(`\n${R.ok.length} OK · ${R.ko.length} échec(s)`);
process.exit(R.ko.length ? 1 : 0);
