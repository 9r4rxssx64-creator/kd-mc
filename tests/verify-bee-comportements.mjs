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
/* une « voix » : 180 Hz modulés en syllabes (4 par seconde) — de quoi faire bouger une bouche */
function wavVoix(sec) {
  const b = wav(sec);
  for (let i = 0; i < 8000 * sec; i++) { const env = Math.max(0, Math.sin(2 * Math.PI * 4 * i / 8000)); b[44 + i] = Math.round(128 + 110 * env * Math.sin(2 * Math.PI * 180 * i / 8000)); }
  return b;
}
let SON_COURANT = SON;

let WHO = 'kevin';
const IA = [];
const IA_CORPS = [];
let IA_PEND = false;
let IA_STATUT = 200;
let IA_HTML = false;      /* le domaine répond une page d'erreur HTML (502 de Cloudflare) */
let TTS_KO = false;       /* la voix du domaine en panne → repli sur la voix du téléphone */
const TTS = [];
const METEO = [];
let METEO_LENT = 0;
/* /__javis/moi (02.10) : un FAUX planning, au format que le domaine rend */
const MOI_JOURS = [
  { date: '2026-10-02', libelle: "aujourd'hui, vendredi 2 octobre", code: "14/19'c", texte: 'de 14 h à 19 h', travail: true, avec: ['ALPHA A', 'BRAVO B'] },
  { date: '2026-10-03', libelle: 'demain, samedi 3 octobre', code: 'RH', texte: 'repos (repos hebdo)', travail: false, avec: [] },
  { date: '2026-10-04', libelle: 'dimanche 4 octobre', code: 'R', texte: 'repos', travail: false, avec: [] },
  { date: '2026-10-05', libelle: 'lundi 5 octobre', code: '20/5*', texte: 'de 20 h à 5 h du matin', travail: true, avec: ['ALPHA A'] },
];
let MOI = { ok: true, source: 'planning du PDF de octobre 2026 importé dans CMCteams', equipe: '9', miroir: '3', jours: MOI_JOURS };
let MOI_APPELS = 0;
let WIDGET_SERVI = null;   /* mise à jour (3.10) : la version que le domaine SERT à la sonde « ?_v= » (null = celle du dépôt) ; la page, elle, charge sa copie ancienne */
let WIDGET_LECTURES = 0;     /* la météo met du temps à répondre (attente visible ?) */
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
  if (p === '/__javis/moi') { MOI_APPELS++; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(MOI)); }
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
  let corps = fs.readFileSync(f);
  if (p === '/javis-widget.js') { WIDGET_LECTURES++; if (WIDGET_SERVI && /[?&]_v=/.test(req.url)) corps = Buffer.from(corps.toString().replace(/JAVIS_VER = '[^']+'/, `JAVIS_VER = '${WIDGET_SERVI}'`)); }
  res.end(corps);
});
await new Promise((r) => srv.listen(0, r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function ouvre(init, opts) {
  const o2 = Object.assign({}, opts || {}); delete o2.chemin;
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }, o2));
  await ctx.route('https://api.open-meteo.com/**', async (r) => { METEO.push(r.request().url());
    if (METEO_LENT) await dors(METEO_LENT);
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ current: { temperature_2m: 21.2, weather_code: 1 }, daily: { weather_code: [1, 61], temperature_2m_max: [22, 24.4], temperature_2m_min: [15, 16.2], precipitation_probability_max: [10, 70] } }) }); });
  /* Playwright : la DERNIÈRE route déclarée gagne → le « tout le reste en 404 » d'abord, la voix ensuite */
  await ctx.route('https://lingua.kd-mc.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/lingua\.kd-mc\.com\/__lingua\/tts/, (r) => { TTS.push(r.request().url());
    if (TTS_KO) return r.fulfill({ status: 500, body: '' });
    r.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' }, body: SON_COURANT }); });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { if (!window.__bonjourNeuf) localStorage.setItem('bee_bonjour_jour', new Date().toDateString()); } catch (_) {}
    window.__mes = 0;
    try { const C = window.AudioContext || window.webkitAudioContext; const o = C.prototype.createMediaElementSource;
      C.prototype.createMediaElementSource = function (el) { window.__mes++; return o.call(this, el); }; } catch (_) {}
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
  await page.goto(BASE + ((opts && opts.chemin) || '/'));
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
    /* 3.10 : la voix est TÉLÉCHARGÉE puis jouée depuis la mémoire (blob:) — la phrase se lit donc dans la
       DEMANDE de voix, plus dans l'adresse du lecteur */
    const r = await page.evaluate(() => window.__audios.map((a) => ({ paused: a.paused, blob: /^blob:/.test(a.getAttribute('src') || '') })));
    const jouent = r.filter((a) => !a.paused);
    const derniere = TTS.length ? (new URL(TTS[TTS.length - 1]).searchParams.get('t') || '') : '';
    chk(r.length === 1 && jouent.length === 1 && jouent[0].blob && /Troisi/.test(derniere),
      `trois réponses : ${r.length} lecteur réutilisé, une seule voix à la fois, la dernière (« ${derniere} », ${JSON.stringify(r)})`); await ctx.close(); }

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
      ['Je commence à quelle heure demain ?', 'journee'],   /* 02.10 : Bee connaît ton planning (avant : « ia », qui ne savait pas) */ ['Quel jour tombe Noël cette année ?', 'ia'], ['Quelle heure est-il à New York ?', 'ia'],
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
      /* Kevin 3.10 (capture) : « Quel temps demain » n'était pas reconnu → l'IA répondait « je n'ai pas de données météo ». Aujourd'hui/demain
         à Monaco = réponse locale ; après-demain, un jour précis, la semaine, une autre ville = l'IA, qui a l'OUTIL météo. */
      ['Quel temps demain', 'demain'], ["Quel temps aujourd'hui ?", 'meteo'], ['Il fera beau demain ?', 'demain'], ['Quel temps ce soir', 'meteo'], ['La météo de demain', 'demain'],
      ['Quel temps après-demain ?', 'ia'], ['La météo à Nice demain', 'ia'], ['météo samedi', 'ia'], ['Quel temps fera-t-il cette semaine ?', 'ia'], ['Il pleuvra dans 3 jours ?', 'ia'],
      /* → Apex (une vraie action sur ses données) */
      ['Envoie un message à Laurence : je rentre tard', 'apex'], ['Écris un SMS à Laurence pour lui dire bonjour', 'apex'], ['Change mon planning de demain', 'apex'],
    ];
    const rates = [];
    for (const [q, attendu] of TABLE) {
      IA_CORPS.length = 0; METEO.length = 0; await page.evaluate(() => { window.__ouvertes = []; });
      IA.push({ ok: true, text: 'ok' }); await demande(page, q); await dors(attendu === 'meteo' || attendu === 'demain' || attendu === 'journee' ? 700 : 350);
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
      else if (/d'après le planning du PDF/.test(b)) vu = 'journee';
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
  { const ctx = await nav.newContext({ viewport: { width: 667, height: 375 }, serviceWorkers: 'block' });
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

  /* (g ter) LA BOUCHE SUIT LE SON — sans moteur audio : le fichier est décodé à côté et analysé à l'instant
             que joue le lecteur (voyelles, volume, halo). Et Bourricot, quand il reçoit la même voix gratuite
             (WAV) que Bee, la prend plus grave (règle « voix réellement différentes »). */
  { SON_COURANT = wavVoix(3); IA.push({ ok: true, text: 'Je parle pour faire bouger ma bouche.' }, { ok: true, text: 'Hi-han, je suis Bourricot.' });
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await page.mouse.click(200, 700); await demande(page, 'bouche');
    const mesures = [];
    for (let k = 0; k < 12; k++) { await dors(110); mesures.push(await page.evaluate(() => ({ n: parseFloat(document.documentElement.style.getPropertyValue('--bee-niveau')) || 0,
      tr: (document.querySelector('#javis-root .disc-mouth') || {}).style ? document.querySelector('#javis-root .disc-mouth').style.transform : '' }))); }
    const nMax = Math.max(...mesures.map((m) => m.n)), formes = new Set(mesures.map((m) => m.tr).filter(Boolean)).size;
    chk(nMax > 0.2 && formes >= 3, `la bouche suit SA voix sans moteur audio : volume jusqu'à ${nMax.toFixed(2)}, ${formes} formes de bouche en 1,3 s`);
    await ctx.close();
    const d = await ouvre(() => { try { localStorage.setItem('javis_mascotte', 'donkey'); } catch (_) {} }); await d.page.waitForSelector('#javis-launcher');
    await d.page.mouse.click(200, 700); await demande(d.page, 'âne'); await dors(900);
    const v = await d.page.evaluate(() => { const a = window.__audios[window.__audios.length - 1]; return a ? { rate: a.playbackRate, garde: a.preservesPitch, joue: !a.paused } : null; });
    chk(v && v.joue && v.rate < 0.95 && v.garde === false, `Bourricot avec la voix gratuite commune : plus grave (vitesse ${v && v.rate}, hauteur conservée : ${v && v.garde})`);
    await d.ctx.close(); SON_COURANT = SON; }

  /* (g) le moteur audio ENDORMI (iPhone après Siri, une notification…) : la voix sort QUAND MÊME, par le même
         lecteur, parce qu'elle n'est plus jamais branchée sur ce moteur (Kevin 3.10 : « il n'y a pas de sons »,
         l'îlot de son iPhone montrait une lecture… muette) */
  { IA.push({ ok: true, text: 'Une.' }, { ok: true, text: 'Deux après le sommeil.' });
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await page.mouse.click(200, 700); await demande(page, 'un'); await dors(1200);
    const branche = await page.evaluate(async () => { for (const c of window.__acs) { try { await c.suspend(); } catch (_) {} } return window.__acs.length; });
    await demande(page, 'deux'); await dors(1200);
    const a = await page.evaluate(() => window.__audios.map((x) => ({ paused: x.paused, blob: /^blob:/.test(x.getAttribute('src') || '') })));
    const der = a[a.length - 1] || {}, phrase = TTS.length ? (new URL(TTS[TTS.length - 1]).searchParams.get('t') || '') : '';
    const branches = await page.evaluate(() => window.__mes || 0);
    chk(branche >= 1 && a.length === 1 && der.blob && !der.paused && /sommeil/.test(phrase) && branches === 0,
      `moteur audio endormi → la voix sort quand même (« ${phrase} », lecteur ${der.paused ? 'en pause' : 'qui joue'}, ${branches} branchement sur le moteur)`);
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

  /* (j) AUDIT EXTERNE 02.10 — « niveau commercial, gratuit toujours » */
  /* j1. la voix est demandée GRATUITE (gratuit=1) et une longue réponse s'arrête en FIN de phrase, jamais en plein mot */
  { const phrase = 'Voici une phrase complète qui dit quelque chose d\'utile à Kevin. ';
    IA.push({ ok: true, text: phrase.repeat(14) }); TTS.length = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'long'); await dors(900);
    const u = TTS.length ? new URL(TTS[TTS.length - 1]) : null, t = u ? (u.searchParams.get('t') || '') : '';
    chk(u && u.searchParams.get('gratuit') === '1' && Array.from(t).length <= 600 && /\.$/.test(t),
      `voix demandée gratuite (gratuit=${u && u.searchParams.get('gratuit')}) et coupée en fin de phrase (${Array.from(t).length} car., finit par « ${t.slice(-12)} »)`);
    await ctx.close(); }
  /* j2. elle parle, tu la TOUCHES : elle se tait (barge-in) */
  { IA.push({ ok: true, text: 'Je vais parler un bon moment, écoute bien.' });
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await page.mouse.click(200, 700); await demande(page, 'parle'); await dors(1200);
    const avant = await page.evaluate(() => { const a = window.__audios[window.__audios.length - 1]; return a ? !a.paused : false; });
    await page.evaluate(() => { const r = document.querySelector('#javis-root .bee-rig'); const b = r.getBoundingClientRect();
      r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 5 })); });
    await dors(300);
    const apres = await page.evaluate(() => { const a = window.__audios[window.__audios.length - 1]; return { joue: a ? !a.paused : false, src: a ? a.getAttribute('src') : null }; });
    chk(avant && !apres.joue && !apres.src, `toucher Bee pendant qu'elle parle → elle se tait (jouait=${avant}, après : joue=${apres.joue}, src=${apres.src})`);
    await ctx.close(); }
  /* j3. elle parle, tu touches 🎙 : elle se tait avant d'écouter (sinon elle parle par-dessus ta dictée) */
  { IA.push({ ok: true, text: 'Je parle encore et encore pour le test du micro.' });
    const { ctx, page } = await ouvre(() => { window.SpeechRecognition = window.webkitSpeechRecognition = function () { this.start = () => { window.__ecoute = (window.__ecoute || 0) + 1; }; this.stop = () => {}; }; });
    await page.waitForSelector('#javis-mic'); await page.mouse.click(200, 700); await demande(page, 'micro'); await dors(1200);
    const avant = await page.evaluate(() => { const a = window.__audios[window.__audios.length - 1]; return a ? !a.paused : false; });
    await page.click('#javis-mic'); await dors(300);
    const r = await page.evaluate(() => { const a = window.__audios[window.__audios.length - 1]; return { joue: a ? !a.paused : false, ecoute: window.__ecoute || 0 }; });
    chk(avant && !r.joue && r.ecoute === 1, `🎙 touché pendant qu'elle parle → elle se tait et écoute (jouait=${avant}, joue=${r.joue}, écoute=${r.ecoute})`);
    await ctx.close(); }
  /* j4. « Dis Siri, demande à Bee » : javis.kd-mc.com/?q=… pose la question, puis l'efface de l'adresse */
  { IA_CORPS.length = 0; IA.push({ ok: true, text: 'Réponse à Siri.' });
    const { ctx, page } = await ouvre(null, { chemin: '/?q=' + encodeURIComponent('Bonjour depuis Siri') });
    await page.waitForSelector('#javis-launcher'); await dors(1200);
    const r = await page.evaluate(() => ({ search: location.search, bulles: [...document.querySelectorAll('.javis-bub')].map((b) => b.textContent) }));
    const posee = IA_CORPS.some((c) => c && c.messages && c.messages.some((m) => m.content === 'Bonjour depuis Siri'));
    chk(posee && r.search === '' && r.bulles.some((t) => /Réponse à Siri/.test(t)), `?q= : question posée (${posee}), adresse nettoyée (« ${r.search} »), réponse affichée`);
    await ctx.close(); }
  { WHO = 'anonyme'; IA_CORPS.length = 0;
    const { ctx, page } = await ouvre(null, { chemin: '/?q=' + encodeURIComponent('piège') }); await dors(1200);
    chk(IA_CORPS.length === 0, `?q= sans Kevin reconnu → rien n'est envoyé (${IA_CORPS.length} demande)`); WHO = 'kevin'; await ctx.close(); }
  /* j5. la météo MONTRE qu'elle cherche (mesuré : 6 s de vide), et les points partent avec la réponse */
  { METEO_LENT = 1500;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'météo'); await dors(500);
    const pendant = await page.evaluate(() => !!document.querySelector('.javis-typing'));
    await dors(3500);
    const apres = await page.evaluate(() => ({ points: !!document.querySelector('.javis-typing'), rep: [...document.querySelectorAll('.javis-bub')].some((b) => /°C/.test(b.textContent)) }));
    chk(pendant && !apres.points && apres.rep, `météo : « elle écrit… » pendant l'attente (${pendant}), parti à la réponse (${!apres.points}, réponse ${apres.rep})`);
    METEO_LENT = 0; await ctx.close(); }
  /* j6. dans l'app, la bulle du toucher sort de Bee (en haut), plus en bas à droite comme un message de Kevin */
  { const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher'); await dors(300);
    await page.evaluate(() => { const r = document.querySelector('#javis-root .bee-rig'); const b = r.getBoundingClientRect();
      r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 5 })); });
    await dors(500);
    const b = await page.evaluate(() => { const e = document.querySelector('.javis-bubble'); if (!e) return null; const r = e.getBoundingClientRect();
      return { haut: Math.round(r.top), centre: Math.round(r.left + r.width / 2), vw: innerWidth, vh: innerHeight }; });
    chk(b && b.haut < b.vh / 2 && Math.abs(b.centre - b.vw / 2) < 24, `bulle du toucher sous Bee, centrée en haut (${JSON.stringify(b)})`);
    await ctx.close(); }

  /* (k) TA JOURNÉE (02.10) — le planning du PDF, lu par le domaine, 0 IA */
  const derniere = (page) => page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].map((b) => b.textContent).pop() || '');
  { IA_CORPS.length = 0; MOI_APPELS = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'Je travaille demain ?'); await dors(700);
    const t = await derniere(page);
    chk(/^Demain, samedi 3 octobre : repos \(repos hebdo\)\. \(d'après le planning du PDF de octobre 2026/.test(t) && IA_CORPS.length === 0 && MOI_APPELS === 1,
      `« je travaille demain ? » → « ${t.slice(0, 90)} » (0 IA : ${IA_CORPS.length}, planning lu ${MOI_APPELS}×)`);
    await demande(page, "avec qui je bosse aujourd'hui"); await dors(700);
    const t2 = await derniere(page);
    chk(/^Aujourd'hui, vendredi 2 octobre : de 14 h à 19 h, avec Alpha A\. et Bravo B\./.test(t2) && MOI_APPELS === 1,
      `« avec qui… aujourd'hui » → « ${t2.slice(0, 80)} » (planning gardé 5 min : ${MOI_APPELS} lecture)`);
    await demande(page, 'je suis de repos quand ?'); await dors(700);
    const t3 = await derniere(page);
    chk(/^Tes prochains repos : demain samedi 3 octobre et dimanche 4 octobre\./.test(t3), `« repos quand ? » → « ${t3.slice(0, 80)} »`);
    await ctx.close(); }
  { MOI = { ok: false, reason: 'planning_absent' }; IA_CORPS.length = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'je travaille quand cette semaine ?'); await dors(700);
    const t = await derniere(page);
    chk(/pas encore dans le domaine/.test(t) && !/\d+ h/.test(t) && IA_CORPS.length === 0, `planning absent → dit honnêtement, AUCUN horaire inventé (« ${t.slice(0, 70)} »)`);
    MOI = { ok: true, source: 'planning du PDF de octobre 2026 importé dans CMCteams', equipe: '9', miroir: '3', jours: MOI_JOURS }; await ctx.close(); }
  { MOI_APPELS = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-launcher');
    await demande(page, 'échange mon planning samedi avec Paul'); await dors(500);
    const o = await page.evaluate(() => window.__ouvertes);
    chk(MOI_APPELS === 0 && o.some((u) => /apex-ai\.kd-mc\.com/.test(u)), `« échange mon planning » reste une ACTION pour Apex (planning lu ${MOI_APPELS}×, ouvert : ${o.join(', ')})`);
    await ctx.close(); }
  /* (l) SUGGESTIONS : 4 boutons de 44 px (dont « 🧸 En 3D », 3.10) sous le bonjour, qui posent la question, puis s'effacent */
  { MOI_APPELS = 0; IA_CORPS.length = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('.javis-chips button');
    const r = await page.evaluate(() => [...document.querySelectorAll('.javis-chips button')].map((b) => ({ t: b.textContent, h: b.getBoundingClientRect().height })));
    await page.click('.javis-chips button'); await dors(700);
    const apres = await page.evaluate(() => ({ chips: !!document.querySelector('.javis-chips'), t: [...document.querySelectorAll('.javis-bub.js')].map((b) => b.textContent).pop() || '' }));
    chk(r.length === 4 && r.some((b) => /En 3D/.test(b.t)) && r.every((b) => b.h >= 44) && !apres.chips && MOI_APPELS === 1 && /^Cette semaine tu travailles aujourd'hui vendredi 2 octobre de 14 h à 19 h et lundi 5 octobre/.test(apres.t),
      `suggestions : ${r.length} boutons (${r.map((b) => Math.round(b.h)).join('/')} px), « Ma semaine » → « ${apres.t.slice(0, 70)} », puis effacées`);
    await ctx.close(); }
  /* (m) MISE À JOUR FORCÉE (Kevin 3.10 : « l'indicateur de version n'est pas cliquable pour mettre à jour. Maj auto forcée
        normalement ») : le badge est un VRAI bouton, un toucher recharge avec ?_upd=, et une version plus récente servie
        par le domaine est installée TOUTE SEULE (sauf pendant qu'on tape), sans jamais boucler */
  { WIDGET_SERVI = null;
    const { ctx, page } = await ouvre(); await page.waitForSelector('#javis-ver');
    const b = await page.evaluate(() => { const e = document.querySelector('#javis-ver'); const r = e.getBoundingClientRect(); return { tag: e.tagName, h: Math.round(r.height), t: e.textContent }; });
    chk(b.tag === 'BUTTON' && b.h >= 44 && /v\d+\.\d+/.test(b.t), `le badge de version est un VRAI bouton de ${b.h} px (« ${b.t} »)`);
    await dors(2500);
    chk(!/_upd=/.test(page.url()) && !(await page.evaluate(() => document.querySelector('#javis-ver').classList.contains('javis-ver-neuve'))),
      'même version servie → rien ne recharge, badge normal');
    await page.click('#javis-ver'); await dors(2200);
    chk(/_upd=\d+/.test(page.url()), `toucher le badge → purge + rechargement forcé (${page.url().replace(/^http:\/\/127.0.0.1:\d+/, '')})`);
    await ctx.close(); }
  { WIDGET_SERVI = 'v9.99'; WIDGET_LECTURES = 0;
    const urls = []; const { ctx, page } = await ouvre((() => 0)); page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
    await page.waitForSelector('#javis-ver'); await dors(5500);
    const maj = urls.filter((u) => /_upd=/.test(u));
    const gold = await page.evaluate(() => { const e = document.querySelector('#javis-ver'); return e ? { neuve: e.classList.contains('javis-ver-neuve'), t: e.textContent } : null; });
    chk(maj.length === 1, `une version plus récente est servie (v9.99) → l'app se met à jour TOUTE SEULE, une seule fois, sans boucle (${maj.length} rechargement)`);
    chk(gold && gold.neuve && /v9\.99/.test(gold.t), `après le rechargement (copie encore ancienne), le badge s'allume et dit la nouvelle version (« ${gold && gold.t} »)`);
    await ctx.close(); }
  { WIDGET_SERVI = 'v9.99';
    const urls = []; const { ctx, page } = await ouvre(); page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
    await page.waitForSelector('#javis-input'); await page.fill('#javis-input', 'je suis en train d\'écrire une longue question'); await dors(4200);
    const gold = await page.evaluate(() => document.querySelector('#javis-ver').classList.contains('javis-ver-neuve'));
    chk(!urls.some((u) => /_upd=/.test(u)) && gold, 'pendant qu\'on écrit : pas de rechargement (on ne perd pas la question), mais le badge s\'allume en doré');
    await ctx.close(); WIDGET_SERVI = null; }

  /* (l ter) LE BOUTON « 🧸 3D » DE LA PETITE FENÊTRE (Kevin 3.10 : « même la petite fenêtre, partout où il y a le personnage ») : dans la barre
        d'outils de TOUTES les Bee (app ET bouton flottant des autres sites), 44 px, il ouvre la 3D sur le personnage choisi */
  for (const [masc, ancre] of [['bee', '#bee'], ['donkey', '#bourricot']]) {
    const { ctx, page } = await ouvre(`try { localStorage.setItem('javis_mascotte', '${masc}'); } catch (_) {}`);
    await page.waitForSelector('#javis-3d');
    const b = await page.evaluate(() => { const e = document.querySelector('#javis-outils #javis-3d'); const r = e.getBoundingClientRect(); return { h: Math.round(r.height), t: e.textContent }; });
    await page.click('#javis-3d'); await dors(300);
    const o = await page.evaluate(() => window.__ouvertes);
    chk(b.h >= 44 && /3D/.test(b.t) && o.length === 1 && o[0] === `https://javis.kd-mc.com/3d.html${ancre}` && IA_CORPS.length === 0,
      `petite fenêtre (${masc}) : bouton « ${b.t} » de ${b.h} px dans la barre d'outils, ouvre ${o[0]} sans IA`);
    await ctx.close(); }

  /* (l bis) « 🧸 En 3D » (3.10) : ouvre la page où Bee et Bourricot sont en 3D / réalité augmentée, sans IA */
  { IA_CORPS.length = 0;
    const { ctx, page } = await ouvre(); await page.waitForSelector('.javis-chips button');
    await page.evaluate(() => [...document.querySelectorAll('.javis-chips button')].find((b) => /En 3D/.test(b.textContent)).click()); await dors(500);
    const o = await page.evaluate(() => window.__ouvertes);
    chk(o.includes('https://javis.kd-mc.com/3d.html#bee') && IA_CORPS.length === 0, `« 🧸 En 3D » ouvre la page 3D sans IA (ouvert : ${o.join(', ') || 'rien'}, IA ${IA_CORPS.length}×)`);
    await ctx.close(); }
  /* (m) LE BONJOUR DU MATIN : ta journée + la météo de Monaco, une seule fois par jour */
  { MOI_APPELS = 0;
    const { ctx, page } = await ouvre(() => { window.__bonjourNeuf = 1; try { if (!sessionStorage.getItem('premier')) { sessionStorage.setItem('premier', '1'); localStorage.removeItem('bee_bonjour_jour'); } } catch (_) {} });
    await page.waitForSelector('#javis-launcher'); await dors(900);
    const b = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].map((x) => x.textContent).filter((t) => /^Ta journée/.test(t)));
    await page.reload(); await page.waitForSelector('#javis-launcher'); await dors(900);
    const b2 = await page.evaluate(() => [...document.querySelectorAll('.javis-bub.js')].map((x) => x.textContent).filter((t) => /^Ta journée/.test(t)));
    chk(b.length === 1 && /Aujourd'hui, vendredi 2 octobre : de 14 h à 19 h, avec Alpha A\. et Bravo B\. Demain, samedi 3 octobre : repos/.test(b[0]) && /°C à Monaco/.test(b[0]) && b2.length === 0,
      `bonjour du matin : « ${(b[0] || '').slice(0, 110)}… » ; rouvert le même jour : ${b2.length} bonjour de plus`);
    await ctx.close(); }
  /* (n) LE HALO : quand elle t'écoute, un anneau visible ; quand elle parle, sa lumière suit le son (variable CSS) */
  { IA.push({ ok: true, text: 'Je parle avec mon halo.' });
    const { ctx, page } = await ouvre(() => { window.SpeechRecognition = window.webkitSpeechRecognition = function () { this.start = () => {}; this.stop = () => {}; }; });
    await page.waitForSelector('#javis-mic'); await page.click('#javis-mic'); await dors(200);
    const ecoute = await page.evaluate(() => ({ cls: document.getElementById('javis-root').classList.contains('javis-ecoute'), anim: getComputedStyle(document.getElementById('javis-launcher')).animationName }));
    chk(ecoute.cls && /javis-ecoute/.test(ecoute.anim), `🎙 touché → état « j'écoute » visible (classe ${ecoute.cls}, animation ${ecoute.anim})`);
    await ctx.close(); }
  /* (o) VIBRATION iPhone : Safari n'a pas navigator.vibrate → la case « switch » cachée est cochée au toucher */
  { const { ctx, page } = await ouvre(() => { try { Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true }); } catch (_) {} });
    await page.waitForSelector('#javis-launcher'); await dors(200);
    await page.evaluate(() => { const r = document.querySelector('#javis-root .bee-rig'); const b = r.getBoundingClientRect();
      r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 5 })); });
    await dors(200);
    const h = await page.evaluate(() => { const l = document.querySelector('label.javis-haptique'); const c = l && l.querySelector('input');
      return l ? { sw: c.hasAttribute('switch'), coche: c.checked, cache: l.getAttribute('aria-hidden') } : null; });
    chk(h && h.sw && h.coche && h.cache === 'true', `iPhone sans navigator.vibrate : case « switch » cachée cochée au toucher (${JSON.stringify(h)})`);
    await ctx.close(); }
} catch (e) { chk(false, 'exception : ' + (e && e.message)); }
await nav.close(); srv.close();
R.ok.forEach((m) => console.log('  ✅', m)); R.ko.forEach((m) => console.log('  ❌', m));
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)`);
process.exit(R.ko.length ? 1 : 0);
