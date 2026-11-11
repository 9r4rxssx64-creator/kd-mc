/* 🎙️ Le script des voix dans un VRAI Chromium (Kevin 11.11). Prouve : (1) sans choix, aucune requête et la voix d'origine de l'app parle ; (2) avec un choix, la voix du
   domaine est demandée avec la bonne voix, start / end reviennent à l'app, la voix d'origine ne parle pas ; (3) voix choisie en panne : la voix d'origine prend le relais ;
   (4) une page peut se retirer ; (5) un cookie truqué est ignoré.
   VOIX_MODULE=<copie sans le garde « aucun choix = rien » ou sans repli> doit rendre ce test ROUGE.  node tests/verify-voix-partout-navigateur.mjs */
import http from 'node:http';
import { createRequire } from 'node:module';
const M = await import(process.env.VOIX_MODULE || '../services/kdmc-router/voix-partout.js');
const { chromium } = createRequire(new URL('../package.json', import.meta.url).pathname)('playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
/* ── le script dans un vrai navigateur ── */
const wav = (() => { const n = 2400, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b; })();
let mode = 'ok'; const appels = []; const echecs = new Set();
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/__voix/partout.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); return r.end(M.SCRIPT_JS || ('(' + M.partoutVoix.toString() + ')();')); }
  if (u.pathname === '/__voix/choisir') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(M.pageChoisir()); }
  if (u.pathname === '/__voix/catalogue') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ ok: true, voix: [{ id: 'gemini-aoede', nom: 'Aoede', genre: 'f', licence: 'Google' }, { id: 'piper-tom', nom: 'Piper · Tom', genre: 'h', licence: 'AGPL' }, { id: 'kokoro-ff-siwis', nom: 'Kokoro', genre: 'f', licence: 'Apache' }] })); }
  if (u.pathname === '/__lingua/tts') { appels.push(u.searchParams.get('v') + '|' + u.searchParams.get('l') + '|' + u.searchParams.get('t')); if (mode === 'panne' || echecs.has(u.searchParams.get('v'))) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":false}'); } r.writeHead(200, { 'content-type': 'audio/wav' }); return r.end(wav); }
  r.writeHead(200, { 'content-type': 'text/html' });
  r.end('<!doctype html><title>t</title>' + (u.searchParams.get('retrait') ? '<meta name="kdmc-voix" content="off">' : '') + '<script>window.log=[];var o=speechSynthesis.speak.bind(speechSynthesis);speechSynthesis.speak=function(u){window.log.push("origine");};</script><script src="/__voix/partout.js"></script>');
});
await new Promise((r) => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
async function essai(cookie, query, m) {
  mode = m || 'ok'; appels.length = 0;
  const ctx = await b.newContext(); if (cookie) await ctx.addCookies([{ name: 'kdmc_voix', value: cookie, url: base }]);
  const p = await ctx.newPage(); await p.goto(base + '/' + (query || ''));
  const res = await p.evaluate(() => new Promise((ok) => { const u = new SpeechSynthesisUtterance('Bonjour Kevin. Voici ta voix.'); u.lang = 'fr-FR'; const ev = []; u.onstart = () => ev.push('start'); u.onend = () => { ev.push('end'); ok({ ev, log: window.log }); }; speechSynthesis.speak(u); setTimeout(() => ok({ ev, log: window.log, delai: true }), 4000); }));
  await ctx.close(); return res;
}
let r = await essai('', '');
ok(r.log.length === 1 && appels.length === 0, 'sans choix : la voix de l\'app parle, AUCUNE requête au domaine');
r = await essai('gemini.nova', '');
ok(!r.delai && r.ev.join() === 'start,end' && r.log.length === 0, 'avec un choix : événements start puis end rendus à l\'app, la voix d\'origine ne parle pas (' + r.ev.join() + ')');
ok(appels.length >= 1 && appels.every((a) => a.startsWith('nova|fr|')) && /Bonjour Kevin/.test(appels[0]), 'le domaine reçoit la bonne voix (nova), la langue (fr) et le texte : ' + appels.join(' ; ').slice(0, 90));
r = await essai('gemini.onyx', '', 'panne');
ok(r.log.length === 1, 'voix choisie en panne : la voix d\'origine prend le relais (jamais de silence)');
r = await essai('gemini.nova', '?retrait=1');
ok(r.log.length === 1 && appels.length === 0, 'une page qui se retire (<meta name="kdmc-voix" content="off">) garde sa voix');
r = await essai('piper.<script>', '');
ok(r.log.length === 1 && appels.length === 0, 'un cookie truqué est ignoré');

/* ── la liste ORDONNÉE : repli automatique, pause, et les apps qui demandent un son au domaine ── */
async function page(cookie, query) { const ctx = await b.newContext(); if (cookie) await ctx.addCookies([{ name: 'kdmc_voix', value: cookie, url: base }]); const p = await ctx.newPage(); await p.goto(base + '/' + (query || '')); return { ctx, p }; }
const dire = (p) => p.evaluate(() => new Promise((ok) => { const u = new SpeechSynthesisUtterance('Bonjour Kevin.'); u.lang = 'fr-FR'; const ev = []; u.onstart = () => ev.push('start'); u.onend = () => { ev.push('end'); ok({ ev, log: window.log }); }; speechSynthesis.speak(u); setTimeout(() => ok({ ev, log: window.log, delai: true }), 4000); }));
{
  mode = 'ok'; echecs.clear(); echecs.add('nova'); appels.length = 0;   // la n°1 (Aoede = nova) n'a plus de quota
  const { ctx, p } = await page('gemini.nova_gemini.alloy_gemini.onyx');
  let r = await dire(p);
  ok(!r.delai && r.ev.join() === 'start,end' && r.log.length === 0, 'quota de la n°1 épuisé : la n°2 parle, start/end rendus, la voix de l\'app ne parle pas (' + r.ev.join() + ')');
  ok(appels.length >= 2 && appels[0].startsWith('nova|') && appels[1].startsWith('alloy|'), 'ordre respecté : nova essayée, puis alloy : ' + appels.map((a) => a.split('|')[0]).join(','));
  ok(await p.locator('a[href="/__voix/choisir"]').count() === 1 && /Kore/.test(await p.locator('a[href="/__voix/choisir"]').textContent()) && /secours/.test(await p.locator('a[href="/__voix/choisir"]').textContent()), 'un rappel « voix de secours · changer » mène à la page de choix');
  const avant = appels.length; appels.length = 0;
  r = await dire(p);
  ok(!r.delai && appels.length >= 1 && appels.every((a) => a.startsWith('alloy|')), 'la voix en échec est mise en pause : 2ᵉ phrase = alloy direct, nova n\'est plus redemandée (' + appels.map((a) => a.split('|')[0]).join(',') + ')');
  await ctx.close();
}
{
  mode = 'ok'; echecs.clear(); appels.length = 0;
  const { ctx, p } = await page('gemini.nova');
  const r = await p.evaluate(async () => { const x = await fetch('/__lingua/tts?gratuit=1&l=fr&i=douce&v=onyx&t=' + encodeURIComponent('Bonjour Kevin. Deux phrases.')); return { st: x.status, ct: x.headers.get('content-type'), voix: x.headers.get('x-voix'), n: (await x.arrayBuffer()).byteLength }; });
  ok(r.st === 200 && /audio/.test(r.ct) && r.voix === 'kdmc-choix:gemini.nova' && r.n > 1000, 'une app qui demande un son au domaine (v=onyx) reçoit celui de la voix CHOISIE : ' + JSON.stringify(r));
  ok(appels.length >= 1 && appels.every((a) => a.startsWith('nova|')), 'le domaine n\'a reçu que la voix choisie (nova), pas celle de l\'app (onyx)');
  await ctx.close();
}
{
  mode = 'ok'; echecs.clear(); appels.length = 0;
  const { ctx, p } = await page('');
  const r = await p.evaluate(async () => { const x = await fetch('/__lingua/tts?gratuit=1&l=fr&v=onyx&t=Bonjour'); return { voix: x.headers.get('x-voix'), ct: x.headers.get('content-type') }; });
  ok(r.voix === null && appels.length === 1 && appels[0].startsWith('onyx|'), 'sans choix : la demande d\'origine part telle quelle (onyx), rien n\'est changé');
  await ctx.close();
}
{
  mode = 'panne'; echecs.clear(); appels.length = 0;
  const { ctx, p } = await page('gemini.nova_gemini.alloy');
  const r = await p.evaluate(async () => { const x = await fetch('/__lingua/tts?gratuit=1&l=fr&v=onyx&t=Bonjour'); return { ct: x.headers.get('content-type'), corps: (await x.text()).slice(0, 20) }; });
  ok(/json/.test(r.ct) && /ok/.test(r.corps), 'TOUTE la liste en échec : la demande d\'origine de l\'app part et reçoit sa propre réponse (l\'app gère son repli comme avant)');
  await ctx.close();
}

/* la page « Choisir mes voix » : ne propose que les voix qui marchent, essaie une voix, retient le choix */
{
  mode = 'ok'; appels.length = 0;
  const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(base + '/__voix/choisir'); await p.waitForSelector('#l li');
  const noms = await p.$$eval('#l li .nom', (x) => x.map((e) => e.firstChild.textContent));
  ok(noms.join() === 'Aoede,Piper · Tom', 'la page ne propose que les voix du catalogue qui marchent (pas Kokoro) : ' + noms.join());
  await p.locator('#l li').first().getByRole('button', { name: /^Écouter/ }).click(); await p.waitForTimeout(1500);
  ok(appels.length >= 1 && appels[0].startsWith('nova|fr|'), 'Écouter essaie la voix choisie sans la poser : ' + appels.join(' ; ').slice(0, 60));
  ok(!(await ctx.cookies()).some((c) => c.name === 'kdmc_voix'), 'écouter ne pose aucun choix');
  await p.locator('#l li').nth(1).getByRole('button', { name: /^Monter/ }).click();
  const ck = (await ctx.cookies()).find((c) => c.name === 'kdmc_voix');
  ok(ck && ck.value.split('_')[0] === 'piper.tom', 'monter une voix change l\'ordre et le garde dans le cookie : ' + (ck && ck.value));
  ok((await p.$$eval('#l li .nom', (x) => x.map((e) => e.firstChild.textContent)))[0] === 'Piper · Tom', 'la liste affichée suit le nouvel ordre');
  const hauteurs = await p.$$eval('#l button', (x) => x.map((e) => Math.min(e.offsetHeight, e.offsetWidth)));
  ok(hauteurs.every((h) => h >= 44), 'tous les boutons se touchent au doigt (≥ 44 px) : ' + Math.min(...hauteurs));
  await ctx.close();
}
await b.close(); srv.close();
console.log(`${pass} ok / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
