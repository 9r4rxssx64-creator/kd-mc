/* 📞 L'APPEL DE LA MASCOTTE — de bout en bout, vrai navigateur + VRAI routeur (IA simulée au niveau de la liaison AI).
 * Kevin 3.10.2026 : « Bee ou Bourricot te téléphone réellement et te tient une conversation, une leçon, un exercice
 * supplémentaire régulièrement… copie, améliore, intègre intelligemment ».
 *   1. la carte « Appeler Bee » est sur l'accueil ; le lien du calendrier (#appel) fait SONNER l'appel entrant ;
 *   2. on décroche : Bee parle, puis écoute TOUTE SEULE (micro simulé : un vrai SpeechRecognition remplacé),
 *      8 répliques ; l'IA reçoit le mode appel et les phases dans l'ordre debut → lecon → exercice → libre → fin,
 *      avec le prénom, le thème du jour, la mascotte ;
 *   3. fin d'appel : +26 XP, +5 💎 (1er appel du jour), succès « Allô ? », appel du jour noté ;
 *   4. « Pas aujourd'hui » : plus de sonnerie ce jour-là (même à l'heure fixe) ; « Plus tard » : rappel dans 1 h ;
 *   5. sans micro (navigateur sans reconnaissance) : le clavier s'ouvre, l'appel marche à l'écrit ;
 *   6. 🐢 plus lentement : la voix est demandée plus lente ; 🆘 ne compte pas comme une réplique ;
 *   7. mode enfant : pas de carte, pas d'appel ; aucune erreur JavaScript.
 * node tests/verify-lingua-appel.mjs   (CAPTURE=chemin.png pour les captures) */
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright';
import mod from '../services/kdmc-router/worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 260) : ''}`); };
const kv = new Map(); const appelsIA = [];
const AI = { run(model, input) { const sys = (input.messages || [])[0]?.content || ''; const ph = (sys.match(/PHASE ([A-ZÀ-Ü-]+)/) || [])[1] || 'COACH';
  appelsIA.push({ sys, ph }); const r = { 'DÉBUT': 'Hi Kevin! Ready?', 'MINI-LEÇON': 'Say: delicious.', 'EXERCICE': 'Translate: I eat.', 'CONVERSATION': 'Nice! And you?', 'FIN': 'Great job. Bye!' }[ph] || 'Hello!';
  return { response: r }; } };
const env = { KDMC_SSO_SECRET: 'sec', AI, ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', webmanifest: 'application/manifest+json', mp4: 'video/mp4' };
const ttsDemandes = [];
async function brancher(ctx) {
  await ctx.route(/^https:\/\/((lingua|admin)\.)?kd-mc\.com\//, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.hostname === 'admin.kd-mc.com') return route.fulfill({ status: 204, body: '' });
    if (u.pathname.startsWith('/__lingua/tts')) { ttsDemandes.push(u.search); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"reason":"test"}' }); }
    if (u.pathname.startsWith('/__')) {
      const h = Object.assign({}, req.headers(), { referer: 'https://lingua.kd-mc.com/' });
      const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env, { waitUntil() {} });
      const hh = {}; r.headers.forEach((v, k) => { hh[k] = v; }); return route.fulfill({ status: r.status, headers: hh, body: Buffer.from(await r.arrayBuffer()) }); }
    if (u.hostname !== 'lingua.kd-mc.com') return route.fulfill({ status: 404, body: '' });
    const p = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
    return existsSync(p) ? route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body: readFileSync(p) }) : route.fulfill({ status: 404, body: '' });
  });
}
/* Un compte local prêt (cours d'anglais), son coupé (Bee « parle » en sous-titres, vite), micro simulé. */
async function appareil(nav, opts = {}) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'fr-FR' }); await brancher(ctx);
  await ctx.addInitScript((o) => {
    if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1');
      localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'k', name: 'Kevin Test', avatar: '🦊', code: '', created: 1, enfant: !!o.enfant }]));
      localStorage.setItem('lingua_g_current', JSON.stringify('k'));
      localStorage.setItem('lingua_a_k_course', JSON.stringify('en')); localStorage.setItem('lingua_a_k_placeAsked', 'true');
      localStorage.setItem('lingua_a_k_sound', 'false'); localStorage.setItem('lingua_a_k_voice', JSON.stringify('device'));
      if (o.appels) localStorage.setItem('lingua_a_k_appels', JSON.stringify(o.appels)); }
    window.__micro = 0;
    if (o.sansMicro) { try { delete window.SpeechRecognition; } catch (e) {} window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; return; }
    const PHRASES = ['Hello Bee', 'Delicious, the cake is delicious', 'I eat', 'I eat pasta', 'Yes I like it', 'I cook every day', 'My favourite is pizza', 'Thank you', 'Bye'];
    class FauxSR { constructor() { this.lang = ''; } start() { const t = PHRASES[window.__micro++ % PHRASES.length]; window.__langEcoute = this.lang;
      setTimeout(() => { this.onresult && this.onresult({ results: [Object.assign([{ transcript: t }], { isFinal: true })] }); setTimeout(() => this.onend && this.onend(), 60); }, 250); }
      stop() { this.onend && this.onend(); } abort() {} }
    window.SpeechRecognition = FauxSR; window.webkitSpeechRecognition = FauxSR;
  }, opts);
  const p = await ctx.newPage(); p._err = []; p.on('pageerror', (e) => p._err.push(e.message)); return { ctx, p };
}
const texte = (p) => p.evaluate(() => document.body.innerText);
const lire = (p, k) => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem('lingua_a_k_' + k)); } catch { return null; } }, k);
const nav = await chromium.launch();
console.log('\nL\'appel de la mascotte — vrai navigateur, vrai routeur\n');
try {
  /* 1. la carte + le lien du calendrier fait sonner */
  const A = await appareil(nav);
  await A.p.goto('https://lingua.kd-mc.com/'); await A.p.waitForTimeout(2500);
  ok(/Appeler Bee/.test(await texte(A.p)), '1. la carte « 📞 Appeler Bee » est sur l\'accueil');
  await A.p.goto('https://lingua.kd-mc.com/#appel'); await A.p.waitForTimeout(3200);
  const entrant = await A.p.evaluate(() => { const o = document.querySelector('.appel-ov'); return o ? o.innerText : ''; });
  ok(/Bee/.test(entrant) && /t'appelle/.test(entrant) && /Décrocher/.test(entrant) && /Pas aujourd'hui/.test(entrant) && /1 h/.test(entrant), '1b. lien du calendrier (#appel) → l\'appel entrant SONNE (Décrocher / Pas aujourd\'hui / Plus tard)', entrant.slice(0, 160));
  ok(await A.p.evaluate(() => location.hash === ''), '1c. le #appel est retiré de l\'adresse');
  if (process.env.CAPTURE) await A.p.screenshot({ path: process.env.CAPTURE.replace('.png', '-entrant.png') });

  /* 2. on décroche : 8 répliques, toutes les phases */
  appelsIA.length = 0;
  await A.p.click('.ap-decroche');
  if (process.env.CAPTURE) { await A.p.waitForTimeout(3800); await A.p.screenshot({ path: process.env.CAPTURE.replace('.png', '-encours.png') }); }
  await A.p.waitForFunction(() => !!document.querySelector('.ap-fin'), { timeout: 150000 }).catch(() => {});
  const fin = await A.p.evaluate(() => { const f = document.querySelector('.ap-fin'); return f ? f.innerText : ''; });
  if (process.env.CAPTURE) await A.p.screenshot({ path: process.env.CAPTURE.replace('.png', '-fin.png') });
  const phases = appelsIA.map((a) => a.ph);
  ok(phases.join(',') === 'DÉBUT,MINI-LEÇON,MINI-LEÇON,EXERCICE,EXERCICE,CONVERSATION,CONVERSATION,CONVERSATION,FIN', '2. l\'IA reçoit les phases dans l\'ordre : bonjour → leçon → exercice → conversation → au revoir (9 répliques de Bee)', phases.join(','));
  const s0 = (appelsIA[0] || {}).sys || '';
  ok(/TÉLÉPHONES/.test(s0) && /Son prénom : Kevin\./.test(s0) && /Thème de l'appel du jour : /.test(s0) && /Bee, une abeille/.test(s0), '2b. mode appel, prénom, thème du jour et mascotte transmis à l\'IA', s0.slice(0, 160));
  ok(await A.p.evaluate(() => window.__micro) === 8 && await A.p.evaluate(() => window.__langEcoute) === 'en-US', '2c. elle écoute TOUTE SEULE après chaque réplique (8 fois), en anglais', await A.p.evaluate(() => window.__micro + ' / ' + window.__langEcoute));
  ok(/Appel terminé — bravo/.test(fin) && /8 répliques/.test(fin) && /\+26 XP/.test(fin) && /\+5 💎/.test(fin), '3. fin d\'appel : 8 répliques, +26 XP, +5 💎 (1er appel du jour)', fin.slice(0, 200));
  const ap = await lire(A.p, 'appels'); const achv = await lire(A.p, 'achv');
  ok(ap && ap.n === 1 && Object.keys(ap.jours || {}).length === 1 && achv && achv.appel1, '3b. appel du jour noté (n = 1) et succès « Allô ? » débloqué', JSON.stringify(ap) + ' ' + JSON.stringify(Object.keys(achv || {})));
  await A.p.click('.ap-fin .btn-main'); await A.p.waitForTimeout(600);
  ok(!(await A.p.$('.disc-overlay')) && /appel du jour fait/.test(await texte(A.p)), '3c. « Continuer » ferme l\'appel ; la carte dit « appel du jour fait ✓ »');

  /* 4. Pas aujourd'hui / Plus tard */
  const B = await appareil(nav, { appels: { n: 0, jours: {}, heure: '00:00', apresLecon: true } });
  await B.p.goto('https://lingua.kd-mc.com/'); await B.p.waitForTimeout(8500);
  ok(!!(await B.p.$('.appel-ov')), '4. heure fixe passée (00:00) → ça sonne tout seul sur l\'accueil');
  await B.p.click('.ap-refus'); await B.p.waitForTimeout(400);
  const refus = await lire(B.p, 'appels');
  ok(refus && refus.refus && !(await B.p.$('.appel-ov')), '4b. « Pas aujourd\'hui » → noté, plus d\'appel', JSON.stringify(refus));
  await B.p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await B.p.waitForTimeout(3600);
  ok(!(await B.p.$('.appel-ov')), '4c. au retour sur l\'app, ça ne resonne PAS le même jour');
  const C = await appareil(nav, { appels: { n: 0, jours: {}, heure: '00:00' } });
  await C.p.goto('https://lingua.kd-mc.com/'); await C.p.waitForTimeout(8500);
  await C.p.click('.ap-plustard').catch(() => {}); await C.p.waitForTimeout(300);
  const tard = await lire(C.p, 'appels');
  ok(tard && tard.report > Date.now() + 3500e3 && tard.report < Date.now() + 3700e3, '4d. « Plus tard » → rappel dans 1 h', JSON.stringify(tard));

  /* 4e-4g. CHACUN SES HORAIRES : un autre jour → rien ; en pause → rien ; l'éditeur de créneaux */
  const auj = ((new Date().getDay() + 6) % 7) + 1, autre = auj === 7 ? 1 : auj + 1;
  const F = await appareil(nav, { appels: { n: 0, jours: {}, plan: [{ jours: [autre], heure: '00:00' }], apresLecon: false } });
  await F.p.goto('https://lingua.kd-mc.com/'); await F.p.waitForTimeout(8500);
  ok(!(await F.p.$('.appel-ov')), '4e. créneau choisi pour un AUTRE jour de la semaine → ça ne sonne pas aujourd\'hui');
  const iso = new Date(); const isoS = iso.getFullYear() + '-' + String(iso.getMonth() + 1).padStart(2, '0') + '-' + String(iso.getDate()).padStart(2, '0');
  const G = await appareil(nav, { appels: { n: 0, jours: {}, plan: [{ jours: [1, 2, 3, 4, 5, 6, 7], heure: '00:00' }], pause: isoS, apresLecon: false } });
  await G.p.goto('https://lingua.kd-mc.com/'); await G.p.waitForTimeout(8500);
  ok(!(await G.p.$('.appel-ov')), '4f. en pause (vacances) jusqu\'à aujourd\'hui inclus → ça ne sonne pas');
  await G.p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Appeler Bee/.test(b.innerText))?.click()); await G.p.waitForTimeout(600);
  const ed = await G.p.evaluate(() => ({ cren: document.querySelectorAll('.ap-cren').length, jours: document.querySelectorAll('.ap-cren .ap-jour').length, ajout: /Ajouter un créneau/.test(document.body.innerText), pause: document.querySelector('#apPause')?.value }));
  ok(ed.cren === 1 && ed.jours === 7 && ed.ajout && ed.pause === isoS, '4g. éditeur : mes créneaux (7 jours à cocher + heure), « ➕ Ajouter un créneau », la pause affichée', JSON.stringify(ed));
  if (process.env.CAPTURE) { await G.p.evaluate(() => [...document.querySelectorAll('.modal .coach-chip')].find((b) => /week-end/.test(b.innerText))?.click()); await G.p.waitForTimeout(300); await G.p.evaluate(() => { const b = document.querySelector('.modal .modal-body, .modal'); if (b) b.scrollTop = 0; }); await G.p.locator('.modal').last().screenshot({ path: process.env.CAPTURE.replace('.png', '-horaires.png') }); }

  /* 5. sans micro + 6. lent / aide */
  const D = await appareil(nav, { sansMicro: true });
  await D.p.goto('https://lingua.kd-mc.com/'); await D.p.waitForTimeout(2200);
  appelsIA.length = 0; ttsDemandes.length = 0;
  await D.p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Appeler Bee/.test(b.innerText))?.click()); await D.p.waitForTimeout(500);
  await D.p.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /maintenant/.test(b.innerText))?.click()); await D.p.waitForTimeout(1200);
  ok(await D.p.evaluate(() => { const k = document.querySelector('.ap-clavier'); return !!k && !k.hidden; }), '5. sans reconnaissance vocale : le clavier s\'ouvre tout seul');
  await D.p.click('.ap-lent'); await D.p.waitForTimeout(3500);
  ok(await D.p.evaluate(() => document.querySelector('.ap-lent').getAttribute('aria-pressed') === 'true'), '6a. 🐢 « plus lentement » s\'active (voix ralentie à 0,82 / 0,72)');
  await D.p.click('.ap-aide'); await D.p.waitForTimeout(3500);
  ok(appelsIA.length === 2 && appelsIA[1].ph === 'DÉBUT', '6. 🆘 « répète plus simplement » ne compte pas comme une réplique (on reste à la phase début)', appelsIA.map((a) => a.ph).join(','));
  await D.p.fill('.ap-input', 'Hello Bee, I am fine'); await D.p.click('.ap-envoi'); await D.p.waitForTimeout(3000);
  ok(appelsIA.length === 3 && appelsIA[2].ph === 'MINI-LEÇON', '5b. réponse écrite envoyée → phase suivante (leçon)', appelsIA.map((a) => a.ph).join(','));
  await D.p.click('.ap-raccroche'); await D.p.waitForTimeout(500);
  const finD = await D.p.evaluate(() => (document.querySelector('.ap-fin') || {}).innerText || '');
  ok(/1 réplique/.test(finD) && /au moins 2 fois/.test(finD) && !/XP/.test(finD.replace('XP 🙂', '')), '5c. raccrocher tôt : pas de récompense (au moins 2 répliques), et c\'est dit', finD.slice(0, 160));

  /* 7. mode enfant */
  const E = await appareil(nav, { enfant: true });
  await E.p.goto('https://lingua.kd-mc.com/#appel'); await E.p.waitForTimeout(3500);
  ok(!/Appeler Bee/.test(await texte(E.p)) && !(await E.p.$('.appel-ov')), '7. mode enfant : ni carte, ni appel (rien ne part vers une IA)');
  for (const [n, P] of [['A', A.p], ['B', B.p], ['C', C.p], ['D', D.p], ['E', E.p], ['F', F.p], ['G', G.p]]) ok(P._err.length === 0, `7b. aucune erreur JavaScript (${n})`, P._err.join(' | '));
} finally { await nav.close(); }
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
