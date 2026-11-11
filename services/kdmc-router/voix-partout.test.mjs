/* 🎙️ Les voix partout (Kevin 11.11) — routes et pose du script (SANS navigateur : ce dossier est testé par le robot de déploiement, qui n'en a pas).
   Le script dans un vrai Chromium : tests/verify-voix-partout-navigateur.mjs.  node services/kdmc-router/voix-partout.test.mjs */
const M = await import(process.env.VOIX_MODULE || './voix-partout.js');
const { injecterBouton } = await import('./worker.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

/* ── routes ── */
const get = (p, init) => M.handleVoixPartout(new Request('https://kd-mc.com' + p, init), new URL('https://kd-mc.com' + p), {});
const js = await get('/__voix/partout.js');
ok(js && js.status === 200 && /javascript/.test(js.headers.get('content-type')), 'le script est servi en JavaScript');
const jsT = await js.text();
ok(/^\(function\(\)\{var __name=function\(f\)\{return f\};/.test(jsT), 'le script servi définit l\'aide __name (sinon « __name is not defined » dans la page, mesuré en ligne)');
ok(/kdmc_voix/.test(jsT) && !/(?:api[_-]?key|secret|token)\s*[:=]/i.test(jsT), 'le script lit le cookie de choix et ne contient aucun secret');
const mot = await get('/__voix/moteur');
ok(mot.status === 200 && /frame-ancestors https:\/\/kd-mc\.com/.test(mot.headers.get('content-security-policy')) && /script-src[^;]*cdn\.jsdelivr\.net/.test(mot.headers.get('content-security-policy')), 'le cadre du moteur a sa propre CSP (jsDelivr seulement, pas d\'autre site d\'embarquement)');
ok(!/default-src[^;]*\*/.test(mot.headers.get('content-security-policy')), 'la CSP du moteur n\'ouvre pas tout');
const ch = await get('/__voix/choisir');
ok(ch.status === 200 && /Choisir mes voix/.test(await ch.text()), 'la page « Choisir mes voix » est servie');
ok((await get('/__voix/partout.js', { method: 'POST' })) === null, 'seul GET est servi');
ok(M.DEFAUT.length === 10 && M.DEFAUT.every((c) => Object.values(M.CHOIX).includes(c) && M.NOMS[c]) && new Set(M.DEFAUT).size === 10, 'l\'ordre de secours par défaut couvre les 10 voix, une fois chacune');
ok(Object.keys(M.CHOIX).length === 10 && Object.values(M.CHOIX).every((v) => /^(gemini|piper)\.[a-z0-9]+$/.test(v)), 'les choix valides sont une liste fermée moteur.param');

/* ── pose du script ── */
const page = '<!doctype html><html><body><p>app</p></body></html>';
const avec = await (await injecterBouton(new Response(page, { headers: { 'content-type': 'text/html' } }), '', { hote: 'app.kd-mc.com', voix: M.VOIX_TAG })).text();
const sans = await (await injecterBouton(new Response(page, { headers: { 'content-type': 'text/html' } }), '', { hote: 'app.kd-mc.com', voix: '' })).text();
ok(avec.includes('/__voix/partout.js'), 'la page reçoit le script des voix');
ok(!sans.includes('/__voix/partout.js'), 'interrupteur VOIX_PARTOUT=0 : rien n\'est posé');
const stricte = await (await injecterBouton(new Response(page, { headers: { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; script-src 'none'" } }), '', { hote: 'app.kd-mc.com', voix: M.VOIX_TAG })).text();
ok(!stricte.includes('/__voix/partout.js'), 'une page dont la CSP refuse nos scripts n\'en reçoit pas');

console.log(`${pass} ok / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
