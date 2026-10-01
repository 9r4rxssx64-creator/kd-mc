/* verify-bee-comportements — les comportements de Bee qu'AUCUN test n'attrapait (audit complet 30.09).
 * Matrice de sabotage de l'auditeur des tests : 29 mutants sur 66 survivaient (XSS des bulles, voix
 * superposées, Face ID sans preuve biométrique, domaine muet…). Chaque bloc en ferme un, puis les
 * correctifs du 30.09 (phrases comprises de travers, heure/date, un seul lecteur audio, une question
 * à la fois, Face ID dans la bulle, erreurs hors mémoire, Bourricot, paysage, ℹ️ 44 px).
 * npm run test:bee-comportements   (≈ 40 s, vrai Chromium, 0 réseau)
 */
import http from 'node:http';
import fs from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.env.BEE_ROOT || new URL('..', import.meta.url).pathname;
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/* un vrai son WAV de 3 s (silence) : assez long pour qu'une 2e réponse arrive PENDANT la 1re voix */
function wav(sec) {
  const n = 8000 * sec, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  b.fill(128, 44); return b;
}
const SON = wav(3);

let WHO = 'kevin';
const IA = [];
const IA_CORPS = [];
let IA_PEND = false;
let IA_STATUT = 200;
let IA_HTML = false;      /* le domaine répond une page d'erreur HTML (502 de Cloudflare) */
let TTS_KO = false;       /* la voix du domaine en panne → repli sur la voix du téléphone */
const TTS = [];
const METEO = [];
const srv = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p === '/__sso/whoami') {
    if (WHO === 'reseau') return req.socket.destroy();
    if (WHO === 'pend') return;                                     /* ne répond jamais */
    res.writeHead(200, { 'content-type': 'application/json' });
    if (WHO === 'bob') return res.end(JSON.stringify({ ok: true, uid: 'bob', verified: true, admin: false }));
    if (WHO === 'anonyme') return res.end(JSON.stringify({ ok: false }));
    return res.end(JSON.stringify({ ok: true, uid: 'kdmc_admin', verified: true, admin: true }));
  }
  if (p === '/__sso/webauthn/auth/options') { res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, challenge: 'AAAAAAAAAAAAAAAAAAAAAA', rpId: '127.0.0.1' })); }
  if (p === '/__javis/ai') {
    let c = ''; req.on('data', (d) => { c += d; });
    req.on('end', () => { try { IA_CORPS.push(JSON.parse(c)); } catch (_) { IA_CORPS.push(null); }
      if (IA_PEND) return;
      if (IA_HTML) { res.writeHead(IA_STATUT, { 'content-type': 'text/html' }); return res.end('<html><body>502 Bad Gateway</body></html>'); }
      res.writeHead(IA_STATUT, { 'content-type': 'application/json' });
      res.end(JSON.stringify(IA.shift() || { ok: true, text: 'Coucou' })); });
    return;
  }
  const f = join(ROOT, 'javis', p === '/' ? 'index.html' : p.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function ouvre(init, opts) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, opts || {}));
  await ctx.route('https://api.open-meteo.com/**', (r) => { METEO.push(r.request().url());
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ current: { temperature_2m: 21.2 }, daily: { temperature_2m_max: [22, 24.4], temperature_2m_min: [15, 16.2] } }) }); });
  /* Playwright : la DERNIÈRE route déclarée gagne → le « tout le reste en 404 » d'abord, la voix ensuite */
  await ctx.route('https://lingua.kd-mc.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/lingua\.kd-mc\.com\/__lingua\/tts/, (r) => { TTS.push(r.request().url());
    if (TTS_KO) return r.fulfill({ status: 500, body: '' });
    r.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' }, body: SON }); });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__audios = []; const O = window.Audio;
    window.Audio = function () { const a = new O(); window.__audios.push(a); return a; };
    window.__ouvertes = []; window.open = (u, n, f) => { window.__ouvertes.push(String(u)); return /noopener/.test(f || '') ? null : {}; };   /* comme la norme : « noopener » rend TOUJOURS null */
    window.__armes = []; const ael = Document.prototype.addEventListener;
    Document.prototype.addEventListener = function (t, f, o) { if (f && f.name === 'audioUnlock') window.__armes.push(t); return ael.call(this, t, f, o); };
    window.__uv = null;
    try { navigator.credentials.get = (o) => { window.__uv = o && o.publicKey && o.publicKey.userVerification; return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); }; } catch (_) {}
    /* la voix du TÉLÉPHONE, observable : chaque phrase dite est gardée, avec sa hauteur et sa voix */
    window.__utt = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    try { window.speechSynthesis.speak = (u) => { window.__utt.push(u); }; window.speechSynthesis.cancel = () => {};
      window.speechSynthesis.getVoices = () => [{ name: 'Thomas', lang: 'fr-FR' }, { name: 'Amélie', lang: 'fr-CA' }, { name: 'Samantha', lang: 'en-US' }]; } catch (_) {}
    /* le moteur audio, observable (pour l'endormir) */
    window.__acs = []; const AC0 = window.AudioContext;
    if (AC0) window.AudioContext = function (o) { const c = new AC0(o); window.__acs.push(c); return c; };
  });
  if (init) await page.addInitScript(init);
  await page.goto(BASE + '/');
  return { ctx, page };
}
const demande = (page, q) => page.evaluate((q) => { document.querySelector('#javis-input').value = q;
  document.querySelector('#javis-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }, q);

try {
  /* 1. XSS — la réponse de l'IA et l'historique sont du TEXTE, jamais du HTML (mutant W01) */
  { WHO = 'kevin'; IA.push({ ok: true, text: '<img src=x id=pirate onerror="window.__pwn=1">' });
    const { ctx, page } = await ouvre(() => { try { localStorage.setItem('javis_widget_history',
      JSON.stringify([{ role: 'assistant', content: '<img src=x id=pirate2 onerror="window.__pwn2=1">' }])); } catch (_) {} });
    await page.waitForSelector('#javis-launcher', { timeout: 8000 });
    await demande(page, 'test'); await dors(800);
    const r = await page.evaluate(() => ({ el: !!document.getElementById('pirate'), el2: !!document.getElementById('pirate2'), pwn: !!(window.__pwn || window.__pwn2),
      txt: [...document.querySelectorAll('.javis-bub.js')].some((b) => b.textContent.includes('<img')) }));
    chk(!r.el && !r.el2 && !r.pwn && r.txt, `réponse IA + historique en HTML → affichés en texte, aucun code exécuté (${JSON.stringify(r)})`);
    await ctx.close(); }

  /* 2. réponse « ok » sans texte → message clair, jamais « undefined » (mutant W25) */
  { IA.push({ ok: true }); const { ctx, page } = await ouvre();
    await page.waitForSelector('#javis-launcher'); await demande(page, 'vide'); await dors(600);
    const t = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    chk(t.trim().length > 0 && !/undefined/.test(t), `réponse vide → un vrai message, jamais une bulle vide ou « undefined » (« ${t.slice(0, 40)} »)`); await ctx.close(); }

  /* 3. historique borné à 40 (mutant W20) */
  { const { ctx, page } = await ouvre(() => { try { localStorage.setItem('javis_widget_history',
      JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i })))); } catch (_) {} });
    await page.waitForSelector('#javis-launcher'); await demande(page, 'encore'); await dors(600);
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('javis_widget_history')).length);
    chk(n <= 40, `historique gardé sur le téléphone : ${n} messages (≤ 40)`); await ctx.close(); }

  /* 4. une adresse web n'est pas lue à voix haute (mutant W21) */
  { IA.push({ ok: true, text: 'Va voir https://exemple.org/page maintenant' }); TTS.length = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'lien'); await dors(900);
    const t = TTS.map((u) => new URL(u).searchParams.get('t') || '').join(' | ');
    chk(TTS.length >= 1 && !/https?:|exemple\.org/.test(t), `voix : l'adresse web n'est pas lue (« ${t} »)`); await ctx.close(); }

  /* 5. UNE voix, UN lecteur : la 2e réponse coupe la 1re, et le même lecteur est réutilisé (fuite
        mesurée le 30.09 : 30 lecteurs vivants après 30 réponses) */
  { IA.push({ ok: true, text: 'Première réponse assez longue.' }, { ok: true, text: 'Deuxième.' }, { ok: true, text: 'Troisième.' });
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await page.mouse.click(200, 700);
    await demande(page, 'un'); await dors(1200);
    await demande(page, 'deux'); await dors(1200);
    await demande(page, 'trois'); await dors(1200);
    const r = await page.evaluate(() => window.__audios.map((a) => ({ paused: a.paused, src: decodeURIComponent(a.getAttribute('src') || '') })));
    const jouent = r.filter((a) => !a.paused);
    chk(r.length >= 1 && r.length <= 2 && jouent.length <= 1 && (!jouent.length || /Troisi/.test(jouent[0].src)),
      `trois réponses : ${r.length} lecteur(s) créé(s) (≤ 2), une seule voix à la fois, la dernière (${JSON.stringify(r).slice(0, 160)})`); await ctx.close(); }

  /* 6. vers Apex : la phrase de Kevin ne part PAS dans l'adresse (mutant W17) */
  { const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'envoie un message à Laurence : secret'); await dors(500);
    const o = await page.evaluate(() => window.__ouvertes);
    chk(o.length === 1 && o[0] === 'https://apex-ai.kd-mc.com/#chat', `Apex ouvert sans la phrase dans l'adresse (${o.join(', ')})`); await ctx.close(); }

  /* 7. visiteur qui n'est pas Kevin : aucun écouteur audio armé (mutant W15) */
  { WHO = 'anonyme'; const { ctx, page } = await ouvre(); await dors(1200);
    const a = await page.evaluate(() => window.__armes);
    chk(a.length === 0, `pas Kevin → aucun écouteur « réveil audio » posé (${a.join(',') || 'aucun'})`); await ctx.close(); }

  /* 8. Face ID sur place : preuve biométrique EXIGÉE (mutant W24) */
  { WHO = 'anonyme'; const { ctx, page } = await ouvre(); await page.waitForSelector('#bee-faceid', { timeout: 8000 });
    await page.click('#bee-faceid'); await dors(600);
    const uv = await page.evaluate(() => window.__uv);
    chk(uv === 'required', `Face ID demandé avec userVerification = « ${uv} » (doit être required)`); await ctx.close(); }

  /* 9. « Changer de compte » oublie VRAIMENT le laissez-passer rangé (mutant W23) */
  { WHO = 'bob'; const { ctx, page } = await ouvre(() => { try { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('kdmc_sso_token', 'JETON-DE-BOB'); } } catch (_) {} });
    await page.waitForSelector('#bee-oublier', { timeout: 8000 });
    await Promise.all([page.waitForNavigation({ timeout: 8000 }).catch(() => {}), page.click('#bee-oublier')]);
    const t = await page.evaluate(() => localStorage.getItem('kdmc_sso_token'));
    chk(!t, `« Changer de compte » → laissez-passer retiré (reste : ${t})`); await ctx.close(); }

  /* 10. le domaine injoignable → Bee FERMÉE, et elle dit pourquoi (mutant W03) */
  { WHO = 'reseau'; const { ctx, page } = await ouvre(); await dors(1500);
    const r = await page.evaluate(() => ({ bee: !!document.querySelector('#javis-launcher'), t: document.body.innerText }));
    chk(!r.bee && /ne répond pas/.test(r.t), `réseau coupé → Bee fermée + « Le domaine ne répond pas » (bee=${r.bee})`); await ctx.close(); }

  /* 11. le domaine qui PEND → au bout de 4 s, Bee FERMÉE (mutant W04) */
  { WHO = 'pend'; const { ctx, page } = await ouvre(); await dors(5200);
    const r = await page.evaluate(() => ({ bee: !!document.querySelector('#javis-launcher'), t: document.body.innerText }));
    chk(!r.bee && /ne répond pas/.test(r.t), `domaine muet 4 s → Bee fermée + message (bee=${r.bee})`); await ctx.close(); }

  /* 12. IA qui ne répond jamais → au bout de 25 s, message clair (mutant W19) — horloge simulée */
  { WHO = 'kevin'; IA_PEND = true; const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await page.clock.install(); await demande(page, 'long'); await page.clock.runFor(26000); await dors(300);
    const t = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    chk(/25 secondes/.test(t), `IA muette → « Ça prend trop de temps (plus de 25 secondes) » (« ${t.slice(0, 50)} »)`);
    IA_PEND = false; await ctx.close(); }

  /* 13. LA TABLE DES PHRASES (audit + contre-audit 30.09) : ce que Bee fait SEULE, et tout le reste va à
         l'IA. Chaque ligne est un piège mesuré (v1.11 : 6 phrases ordinaires sur 6 détournées ; v1.12 :
         « à quelle heure ferme le casino ? » donnait l'heure, « réécris ce message » ouvrait Apex…). */
  { WHO = 'kevin'; const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    const TABLE = [
      /* → l'IA */
      ['Écris un poème à ma mère', 'ia'], ['Montre-moi comment on dit famille en anglais', 'ia'], ['Affiche une blague sur la famille', 'ia'],
      ['Prévision pour le match de ce soir', 'ia'], ['Depuis combien de temps ça fait ça ?', 'ia'], ['À quelle heure ferme le casino ce soir ?', 'ia'],
      ['Je commence à quelle heure demain ?', 'ia'], ['Quel jour tombe Noël cette année ?', 'ia'], ['Quelle heure est-il à New York ?', 'ia'],
      ['Réécris ce message plus gentiment : salut toi', 'ia'], ["Montre-moi l'équipe de France de rugby", 'ia'], ['Parle-moi de la famille royale', 'ia'],
      ['Explique-moi les météorites', 'ia'], ['Il fait combien de kilomètres, le tour de Monaco ?', 'ia'], ["Écris-moi un message d'anniversaire", 'ia'],
      ['Lance-toi, raconte une histoire', 'ia'], ['Quelle est la meilleure recette de pâtes ?', 'ia'], ["Ouvre ton cœur, qu'est-ce qui te rend heureuse ?", 'ia'],
      /* → une app du domaine */
      ['Ouvre mon arbre', 'https://arbre.kd-mc.com'], ["Ouvre moi l'arbre", 'https://arbre.kd-mc.com'], ['Peux-tu lancer Apex ?', 'https://apex-ai.kd-mc.com'],
      ["Tu peux ouvrir Lingua s'il te plaît", 'https://lingua.kd-mc.com'], ['Vas sur la cuisine', 'https://cuisine.kd-mc.com'], ['Bee, affiche mon planning', 'https://cmcteams.kd-mc.com'],
      ['lance le bot crypto', 'https://bot.kd-mc.com'], ["Ouvre l'arbre généalogique", 'https://arbre.kd-mc.com'], ['montre-moi mes équipes', 'https://cmcteams.kd-mc.com'],
      /* → l'heure, la date, la météo, sans IA */
      ['Quelle heure est-il ?', 'heure'], ["T'as l'heure ?", 'heure'], ['Bee, dis-moi quelle heure il est stp', 'heure'],
      ['On est quel jour ?', 'date'], ["Quelle est la date d'aujourd'hui ?", 'date'], ['Quel jour sommes-nous ?', 'date'],
      ['Quel temps fait-il ?', 'meteo'], ['Il fait combien dehors ?', 'meteo'], ['Quelle est la météo ?', 'meteo'], ["Va-t-il pleuvoir aujourd'hui ?", 'meteo'],
      ['Quel temps fera-t-il demain ?', 'demain'],
      /* → Apex (une vraie action sur ses données) */
      ['Envoie un message à Laurence : je rentre tard', 'apex'], ['Écris un SMS à Laurence pour lui dire bonjour', 'apex'], ['Change mon planning de demain', 'apex'],
    ];
    const rates = [];
    for (const [q, attendu] of TABLE) {
      IA_CORPS.length = 0; METEO.length = 0; await page.evaluate(() => { window.__ouvertes = []; });
      IA.push({ ok: true, text: 'ok' }); await demande(page, q); await dors(attendu === 'meteo' || attendu === 'demain' ? 700 : 350);
      const o = await page.evaluate(() => window.__ouvertes);
      const b = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
      let vu;
      if (IA_CORPS.length) vu = 'ia';
      else if (o.length && o[0] === 'https://apex-ai.kd-mc.com/#chat') vu = 'apex';
      else if (o.length) vu = o[0];
      else if (/^Il est \d/.test(b)) vu = 'heure';
      else if (/^On est /.test(b)) vu = 'date';
      else if (/^Demain(?: à [^:]+)? : entre \d+ et \d+°C/.test(b)) vu = 'demain';
      else if (/°C|Météo/.test(b)) vu = 'meteo';
      else vu = '? ' + b.slice(0, 40);
      if (vu !== attendu) rates.push(`« ${q} » → ${vu} (attendu : ${attendu})`);
      /* la file d'attente de l'IA simulée ne doit pas déborder sur la phrase suivante */
      if (vu !== 'ia') IA.length = 0;
    }
    chk(!rates.length, `table des phrases : ${TABLE.length - rates.length}/${TABLE.length} comprises${rates.length ? ' — ' + rates.join(' ; ') : ''}`);
    /* la météo ne part qu'avec une position ARRONDIE (~1 km) */
    await ctx.close(); }
  { const { ctx, page } = await ouvre(null, { geolocation: { latitude: 43.739812, longitude: 7.427345 }, permissions: ['geolocation'] });
    await page.waitForSelector('#javis-launcher'); METEO.length = 0;
    await demande(page, 'Quelle est la météo ?'); await dors(900);
    chk(METEO.length === 1 && /latitude=43\.74&longitude=7\.43&/.test(METEO[0]), `météo : position arrondie à 1 km (${METEO[0] ? METEO[0].split('?')[1].slice(0, 40) : 'aucune requête'})`);
    await ctx.close(); }

  /* 14. l'heure et la date, sans IA */
  { const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    IA_CORPS.length = 0;
    await demande(page, 'Quelle heure est-il ?'); await dors(400);
    const h = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    await demande(page, 'On est quel jour ?'); await dors(400);
    const d = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    const an = new Date().getFullYear();
    chk(/^Il est \d{1,2} h \d{2}\.$/.test(h) && new RegExp('^On est [a-z]+ (1er|\\d{1,2}) [a-zéû]+ ' + an).test(d) && IA_CORPS.length === 0,
      `heure et date répondues par le téléphone, 0 appel IA (« ${h} » / « ${d} »)`);
    await ctx.close(); }

  /* 15. une question à la fois : pendant l'attente, la 2e reste dans le champ (réponses mélangées avant) */
  { IA_PEND = true; IA_CORPS.length = 0; const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'première'); await dors(300);
    await demande(page, 'seconde'); await dors(300);
    const r = await page.evaluate(() => ({ champ: document.querySelector('#javis-input').value, bulles: [...document.querySelectorAll('.javis-bub.me')].map((b) => b.textContent) }));
    chk(IA_CORPS.length === 1 && r.champ === 'seconde' && r.bulles.join('|') === 'première', `une seule question en route ; la 2e reste dans le champ (${JSON.stringify(r)})`);
    await demande(page, 'seconde'); await dors(200);
    const pat = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].map((b) => b.textContent).filter((t) => /Une seconde/.test(t)).length);
    chk(pat === 1, `2e question refusée → un message VISIBLE (Safari ne vibre pas), une seule fois même en insistant (${pat})`);
    IA_PEND = false; await ctx.close(); }

  /* 16. session refusée (403) → bouton Face ID DANS la bulle ; 17. une erreur n'entre pas dans la mémoire */
  { IA_STATUT = 403; IA.push({ ok: false, reason: 'kevin_seulement' }); const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'coucou'); await dors(600);
    const r = await page.evaluate(() => { const x = [...document.querySelectorAll('.javis-bub.js')].pop();
      const bt = x.querySelector('button'); const hh = bt ? bt.getBoundingClientRect().height : 0;
      return { t: x.textContent, bouton: bt ? bt.textContent : '', h: hh, hist: JSON.parse(localStorage.getItem('javis_widget_history') || '[]') }; });
    chk(r.bouton === 'Face ID' && r.h >= 44 && !/Ferme Bee/.test(r.t), `403 → bouton « Face ID » (${r.h} px) dans la bulle, plus « ferme et rouvre » (« ${r.t.slice(0, 60)} »)`);
    chk(r.hist.length && r.hist[r.hist.length - 1].role === 'user', `le message d'erreur n'entre PAS dans la mémoire envoyée à l'IA (${JSON.stringify(r.hist.slice(-2))})`);
    IA_STATUT = 200; await ctx.close(); }

  /* 18. Bourricot répond en Bourricot : la page dit au domaine quelle mascotte parle */
  { IA_CORPS.length = 0; const { ctx, page } = await ouvre(() => { try { localStorage.setItem('javis_mascotte', 'donkey'); } catch (_) {} });
    await page.waitForSelector('#javis-launcher'); await demande(page, 'qui es-tu ?'); await dors(500);
    chk(IA_CORPS[0] && IA_CORPS[0].mascotte === 'donkey', `l'âne choisi → la question porte « mascotte: donkey » (${IA_CORPS[0] && IA_CORPS[0].mascotte})`);
    await ctx.close(); }

  /* 19. iPhone à l'horizontale (667×375) : on peut écrire ; 20. ℹ️ fait au moins 44 px */
  { const ctx = await nav.newContext({ viewport: { width: 667, height: 375 } });
    await ctx.route('https://lingua.kd-mc.com/**', (r) => r.fulfill({ status: 404, body: '' }));
    const page = await ctx.newPage(); await page.goto(BASE + '/'); await page.waitForSelector('#javis-send', { timeout: 8000 });
    const r = await page.evaluate(() => { const s = document.querySelector('#javis-send').getBoundingClientRect(), i = document.querySelector('#javis-info').getBoundingClientRect();
      return { bas: Math.round(s.bottom), info: Math.round(Math.min(i.width, i.height)) }; });
    chk(r.bas <= 375, `paysage 667×375 : le bouton Envoyer est visible (bas à ${r.bas} px ≤ 375)`);
    chk(r.info >= 44, `bouton ℹ️ : ${r.info} px (≥ 44)`);
    await ctx.close(); }

  /* 21. les correctifs de la v1.12 qu'AUCUN test ne gardait (contre-audit 30.09 : 11 sabotages survivaient) */
  /* (a) une erreur HTML du domaine (502) et un 429 ont LEUR message ; (b) Markdown ni lu ni affiché brut */
  { IA_STATUT = 502; IA_HTML = true; const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'coucou'); await dors(500);
    const t502 = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    IA_HTML = false; IA_STATUT = 429; IA.push({ ok: false, reason: 'trop_vite' });
    await demande(page, 'encore'); await dors(500);
    const t429 = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    IA_STATUT = 200; TTS.length = 0; IA.push({ ok: true, text: '**Gras** et voilà\n# Un titre\n`code`' });
    await page.mouse.click(200, 700); await demande(page, 'markdown'); await dors(900);
    const tmd = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].pop().textContent);
    const dit = TTS.map((u) => new URL(u).searchParams.get('t') || '').pop() || '';
    chk(/souci/.test(t502) && /502/.test(t502) && !/réseau/.test(t502), `502 en HTML → « le domaine a un souci (erreur 502) », pas « le réseau » (« ${t502.slice(0, 60)} »)`);
    chk(/Doucement/.test(t429), `429 → « Doucement… attends une minute » (« ${t429.slice(0, 50)} »)`);
    chk(!/\*\*|^#/m.test(tmd) && /Gras et voilà/.test(tmd) && !/[*#`]/.test(dit) && /Gras/.test(dit), `Markdown : ni « ** » ni « # » à l'écran ni dans la voix (écran « ${tmd.replace(/\n/g, ' ')} » / voix « ${dit} »)`);
    /* (c) un long texte en caractères « doubles » est coupé SANS casser un caractère (la voix du domaine part quand même) */
    TTS.length = 0; IA.push({ ok: true, text: 'a' + '𝔸'.repeat(700) });   /* « a » d'abord : la coupure à 600 tombe AU MILIEU d'un caractère si on coupe en unités  */
    await demande(page, 'long'); await dors(900);
    const u = TTS.pop() || ''; let propre = false, n = 0;
    try { const tx = new URL(u).searchParams.get('t') || ''; n = Array.from(tx).length; propre = n > 0 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(tx); } catch (_) {}
    chk(propre && n <= 600, `700 caractères « doubles » → voix du domaine avec ${n} caractères entiers (≤ 600), aucun demi-caractère`);
    /* (d) le champ n'accepte pas plus de 2 000 caractères (le serveur coupe au-delà, sans le dire) */
    const ml = await page.evaluate(() => document.querySelector('#javis-input').getAttribute('maxlength'));
    chk(ml === '2000', `champ de saisie : maxlength = ${ml}`);
    /* (e) le fil à l'écran ne grossit pas sans fin (≤ 60 bulles) */
    for (let i = 0; i < 32; i++) await demande(page, 'Quelle heure est-il ?');
    await dors(300);
    const nb = await page.evaluate(() => document.querySelectorAll('#javis-msgs .javis-bub').length);
    chk(nb <= 60, `après 32 questions de plus : ${nb} bulles à l'écran (≤ 60)`);
    await ctx.close(); }

  /* (f) voix du TÉLÉPHONE : la fin de l'ANCIENNE phrase ne fige pas la bouche de la nouvelle ; hauteur ≤ 1,25 ;
         une vraie voix par genre (Amélie pour Bee, Thomas pour Bourricot) */
  { TTS_KO = true; IA.push({ ok: true, text: 'Première phrase.' }, { ok: true, text: 'Deuxième phrase.' });
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'un'); await dors(900); await demande(page, 'deux'); await dors(900);
    const r = await page.evaluate(() => { const u = window.__utt; if (u.length < 2) return { n: u.length };
      try { u[0].onend && u[0].onend(); } catch (_) {}
      const parle = !!document.querySelector('#javis-root .bee-rig.talk');
      return { n: u.length, parle, pitch: u[1].pitch, voix: u[1].voice && u[1].voice.name }; });
    chk(r.n >= 2 && r.parle, `voix du téléphone : la fin de l'ancienne phrase ne coupe pas la nouvelle (elle parle encore : ${r.parle}, ${r.n} phrases)`);
    chk(r.pitch <= 1.25 && r.voix === 'Amélie', `Bee au téléphone : hauteur ${r.pitch} (≤ 1,25), voix « ${r.voix} » (féminine)`);
    await ctx.close();
    IA.push({ ok: true, text: 'Hi-han.' });
    const d = await ouvre(() => { try { localStorage.setItem('javis_mascotte', 'donkey'); } catch (_) {} }); await d.page.waitForSelector('#javis-launcher');
    await demande(d.page, 'un'); await dors(900);
    const vd = await d.page.evaluate(() => { const u = window.__utt.pop(); return u ? { pitch: u.pitch, voix: u.voice && u.voice.name } : null; });
    chk(vd && vd.voix === 'Thomas' && vd.pitch <= 1.25, `Bourricot au téléphone : voix « ${vd && vd.voix} » (masculine), hauteur ${vd && vd.pitch}`);
    await d.ctx.close(); TTS_KO = false; }

  /* (g) le moteur audio ENDORMI : un lecteur neuf (non branché) joue, sinon la voix serait muette */
  { IA.push({ ok: true, text: 'Une.' }, { ok: true, text: 'Deux après le sommeil.' });
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await page.mouse.click(200, 700); await demande(page, 'un'); await dors(1200);
    const branche = await page.evaluate(async () => { for (const c of window.__acs) { try { await c.suspend(); } catch (_) {} } return window.__acs.length; });
    await demande(page, 'deux'); await dors(1200);
    const a = await page.evaluate(() => window.__audios.map((x) => ({ paused: x.paused, src: decodeURIComponent(x.getAttribute('src') || '') })));
    const der = a[a.length - 1] || {};
    chk(branche >= 1 && a.length === 2 && /sommeil/.test(der.src) && !der.paused, `moteur audio endormi → un lecteur NEUF dit la phrase (${a.length} lecteurs, ${branche} moteur(s))`);
    await ctx.close(); }

  /* (g bis) iPhone en MODE SILENCIEUX (Kevin 01.10 : « Il n'y a pas de sons ») : la voix passe par le moteur
            audio, que l'interrupteur silencieux coupe — Bee déclare une LECTURE voulue (audioSession = playback) */
  { IA.push({ ok: true, text: 'Tu m\'entends ?' });
    const { ctx, page } = await ouvre(() => { try { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); } catch (_) {} });
    await page.waitForSelector('#javis-launcher');
    const avant = await page.evaluate(() => navigator.audioSession.type);
    await page.mouse.click(200, 700); await demande(page, 'son ?'); await dors(900);
    const apres = await page.evaluate(() => navigator.audioSession.type);
    chk(avant === 'auto' && apres === 'playback', `mode silencieux : la session audio passe en « lecture » (${avant} → ${apres}), le son sort comme une vidéo`);
    await ctx.close(); }

  /* (h) « Bee arrive… » reste jusqu'au verdict du domaine, puis part ; (i) le dessin préchargé est celui de LA mascotte,
         seulement sur un appareil déjà reconnu */
  { const { ctx, page } = await ouvre(() => { try { localStorage.setItem('kdmc_sso_token', 'x.y'); localStorage.setItem('javis_mascotte', 'donkey'); } catch (_) {} });
    await page.waitForSelector('#javis-launcher'); await dors(200);
    const r = await page.evaluate(() => ({ boot: !!document.getElementById('boot'), pre: [...document.querySelectorAll('link[rel=preload][as=image]')].map((l) => l.href) }));
    chk(!r.boot && r.pre.length === 1 && /\/donkey\/rig\/base\.webp$/.test(r.pre[0]), `verdict rendu → « Bee arrive… » retiré ; dessin préchargé = Bourricot (${r.pre.join(', ')})`);
    await ctx.close(); }
  { WHO = 'anonyme'; const { ctx, page } = await ouvre(); await dors(1200);
    const n = await page.evaluate(() => document.querySelectorAll('link[rel=preload][as=image]').length);
    chk(n === 0, `appareil inconnu (écran verrou) : aucun dessin préchargé pour rien (${n})`);
    WHO = 'kevin'; await ctx.close(); }
} catch (e) { chk(false, 'exception : ' + (e && e.message)); }
await nav.close(); srv.close();
R.ok.forEach((m) => console.log('  ✅', m)); R.ko.forEach((m) => console.log('  ❌', m));
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)`);
process.exit(R.ko.length ? 1 : 0);
