/* GARDE — LA SÉCURITÉ D'UNE PAGE NE CACHE PAS BEE À KEVIN, ET NE CHANGE RIEN POUR LES AUTRES (Kevin 17.10 : « Bee dans TOUTES mes applications »).
 * Mesuré en réel en local (vrai routeur empaqueté + vraies pages + Chromium) : 6 adresses sur 28 sans Bee — CMCteams et le Bot (leur CSP ne laisse passer aucun cadre), Rotaplan et
 * Croupier (`script-src 'none'`), Apex AI (nonce + strict-dynamic), Cuisine (page sans balise <body>). Corrigé : sur un appareil au marqueur « Kevin » SEULEMENT, la CSP de la page reçoit
 * `frame-src 'self'` (en gardant l'existant) et, si elle refuse nos scripts, un nonce aléatoire par réponse pour le seul script de Bee.
 *   1. cspPourBee : chaque cas réel (none, strict-dynamic, frame-src d'un tiers, gate default-src 'none', plusieurs politiques, unsafe-inline sans 'self' → intact) ;
 *   2. un visiteur ordinaire (sans nonce) : la page est EXACTEMENT celle d'avant (CSP intacte, pas de script de Bee sur une page qui refuse) ;
 *   3. Kevin : le script de Bee porte le nonce ET la CSP (en-tête comme balise <meta>) le contient ; pas de bouton ✉️ sur une page qui refuse nos scripts ; aucun cache ;
 *   4. un nonce différent à chaque réponse ; 5. câblage : seul le marqueur « Kevin » déclenche, BEE_PARTOUT=0 coupe.
 * node services/kdmc-router/bee-csp.test.mjs */
import { readFileSync } from 'node:fs';
import { injecterBouton, BOUTON_TAG } from './worker.js';
import { PARTOUT_TAG, cspPourBee, cspAccepteBee, nonceBee, marqueurKevin } from './bee-partout.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 400) : '')); } };
const N = 'abc123XYZ';
const dir = (csp, n) => { const m = String(csp).match(new RegExp('(?:^|;)\\s*' + n + '\\s+([^;]*)')); return m ? m[1].trim().split(/\s+/) : null; };

/* ───── 1. cspPourBee ───── */
{
  const rota = "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
  const r = cspPourBee(rota, N);
  ok(dir(r, 'script-src').join(' ') === "'nonce-" + N + "'" && !/'none'.*nonce|nonce.*'none'/.test(dir(r, 'script-src').join(' ')), '1a. Rotaplan / Croupier : script-src \'none\' → le seul nonce de Bee', r);
  ok(dir(r, 'frame-src') === null && /connect-src 'none'/.test(r) && /object-src 'none'/.test(r), '1b. le reste est INTACT (connect-src \'none\', object-src \'none\'), aucun cadre ajouté quand default-src \'self\' suffit');
  const bot = "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src https://s.tradingview.com https://www.tradingview.com; object-src 'none'";
  const rb = cspPourBee(bot, N);
  ok(dir(rb, 'frame-src').join(' ') === "https://s.tradingview.com https://www.tradingview.com 'self'" && dir(rb, 'script-src').join(' ') === "'self' 'unsafe-inline'", '1c. le Bot : frame-src garde TradingView et gagne \'self\' ; script-src (qui accepte déjà) n\'est pas touché', rb);
  const cmc = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; frame-src data: https://www.openstreetmap.org";
  ok(dir(cspPourBee(cmc, N), 'frame-src').join(' ') === "data: https://www.openstreetmap.org 'self'", '1d. CMCteams : OpenStreetMap et data: gardés, \'self\' ajouté');
  const gate = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const rg = cspPourBee(gate, N);
  ok(dir(rg, 'frame-src').join(' ') === "'self'" && dir(rg, 'script-src').join(' ') === "'self'" && /frame-ancestors 'none'/.test(rg), '1e. écran de connexion (default-src \'none\') : frame-src \'self\' ajouté, scripts et frame-ancestors intacts', rg);
  const apex = "default-src 'self'; script-src 'self' 'nonce-deb60e' 'strict-dynamic' https://cdn.jsdelivr.net; style-src 'self' 'nonce-deb60e'";
  const ra = cspPourBee(apex, N);
  ok(dir(ra, 'script-src').includes("'nonce-" + N + "'") && dir(ra, 'script-src').includes("'nonce-deb60e'") && dir(ra, 'script-src').includes("'strict-dynamic'"), '1f. Apex AI (nonce + strict-dynamic) : notre nonce s\'ajoute SANS retirer celui de la page', ra);
  const inl = "default-src 'self'; script-src 'unsafe-inline'";
  ok(dir(cspPourBee(inl, N), 'script-src').join(' ') === "'unsafe-inline'", '1g. \'unsafe-inline\' sans \'self\' : script-src NON touché (un nonce couperait les scripts en ligne de la page)');
  const deux = cspPourBee("default-src 'self'; script-src 'none', default-src 'self'; frame-src 'none'", N).split(', ');
  ok(deux.length === 2 && /nonce-/.test(deux[0]) && dir(deux[1], 'frame-src').join(' ') === "'self'", '1h. plusieurs politiques (séparées par une virgule) : chacune est adaptée, frame-src \'none\' devient \'self\'');
  ok(cspPourBee('', N) === '' && cspPourBee(null, N) === '', '1i. pas de CSP : rien n\'est inventé');
  ok(cspPourBee("default-src 'self'; script-src 'self'", '') === "default-src 'self'; script-src 'self'", '1j. sans nonce, une page qui accepte déjà reste identique (hors cadre)');
  ok(cspAccepteBee(rota, N) === false && cspAccepteBee(cspPourBee(rota, N), N) === true && cspAccepteBee(gate, N) === true && cspAccepteBee(apex, N) === false && cspAccepteBee(cspPourBee(apex, N), N) === true && cspAccepteBee(inl, N) === false && cspAccepteBee('', N) === true, '1k. cspAccepteBee : refuse avant, accepte après (sauf unsafe-inline sans self : toujours refusé, dit tel quel)');
}

/* ───── 2/3. injecterBouton (chemin texte, comme en test Node ; le vrai HTMLRewriter est vérifié par verif-local-bee-presence.mjs) ───── */
const page = (corps, ent) => new Response(corps, { status: 200, headers: Object.assign({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', etag: '"x"' }, ent || {}) });
const metaRota = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'none\'; connect-src \'none\'">';
{
  const html = '<html><head>' + metaRota + '</head><body><p>Rotaplan</p></body></html>';
  const ordinaire = await (await injecterBouton(page(html), PARTOUT_TAG, { hote: 'rotaplan.kd-mc.com' })).text();
  /* 22.10 (Kevin : « toutes mes applications… un bouton pour installer ») : la SEULE exception pour un visiteur ordinaire = le script d'installation, avec son nonce ; ni Bee, ni ✉️, aucune autre ouverture */
  ok(!ordinaire.includes('partout.js') && !ordinaire.includes(BOUTON_TAG) && !ordinaire.includes("script-src 'none'") && /script-src 'nonce-[^']+'/.test(ordinaire) && ordinaire.includes('/__installer/installer.js') && (ordinaire.match(/nonce=/g) || []).length === 1, '2a. VISITEUR ORDINAIRE : la page qui refuse nos scripts ne reçoit QUE le script d\'installation (avec son nonce) : ni Bee, ni bouton ✉️', ordinaire);
  const rk = await injecterBouton(page(html), PARTOUT_TAG, { hote: 'rotaplan.kd-mc.com', nonce: N });
  const kevin = await rk.text();
  ok(kevin.includes('<script nonce="' + N + '" src="/__javis/partout.js" defer></script>') && kevin.includes("script-src 'nonce-" + N + "'") && !kevin.includes(BOUTON_TAG), '3a. KEVIN, balise <meta> : le script de Bee porte le nonce, la CSP de la page le contient, pas de bouton ✉️ (la page refuse nos scripts)', kevin);
  ok(/connect-src 'none'/.test(kevin), '3b. le reste de la CSP est intact');
  const hdr = await injecterBouton(page('<html><body>x</body></html>', { 'content-security-policy': "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'" }), PARTOUT_TAG, { hote: 'croupier.kd-mc.com', nonce: N });
  const th = await hdr.text();
  ok(hdr.headers.get('content-security-policy').includes("'nonce-" + N + "'") && /frame-src 'self'/.test(hdr.headers.get('content-security-policy')) && th.includes('nonce="' + N + '"'), '3c. KEVIN, CSP en en-tête : l\'en-tête contient le nonce et un cadre autorisé, la balise le porte', hdr.headers.get('content-security-policy'));
  ok(hdr.headers.get('cache-control') === 'no-store' && !hdr.headers.get('etag'), '3d. une réponse personnalisée par un nonce n\'est jamais mise en cache (ni ETag)');
  const ordHdr = await injecterBouton(page('<html><body>x</body></html>', { 'content-security-policy': "default-src 'none'; script-src 'none'" }), PARTOUT_TAG, { hote: 'croupier.kd-mc.com' });
  { const c = ordHdr.headers.get('content-security-policy') || ''; ok(/^default-src 'none'; script-src 'nonce-[^']+'$/.test(c) && ordHdr.headers.get('cache-control') === 'no-store', "3e. visiteur ordinaire, en-tête : seul un nonce (script-src) est ajouté — rien d'autre — et la page n'est pas mise en cache", c); }
  const ok1 = await (await injecterBouton(page('<html><body>x</body></html>', { 'content-security-policy': "default-src 'self'; script-src 'self'; frame-src https://tiers.example" }), PARTOUT_TAG, { hote: 'cmcteams.kd-mc.com', nonce: N })).text();
  ok(ok1.includes(BOUTON_TAG) && ok1.includes('src="/__javis/partout.js"') && !ok1.includes('nonce='), '3f. une page qui accepte déjà nos scripts : balises normales (bouton + Bee), sans nonce inutile');
  const inl = await (await injecterBouton(page('<html><body>x</body></html>', { 'content-security-policy': "script-src 'unsafe-inline'" }), PARTOUT_TAG, { hote: 'a.kd-mc.com', nonce: N })).text();
  ok(!inl.includes('partout.js'), '3g. \'unsafe-inline\' sans \'self\' : on ne casse pas la page, Bee n\'y est pas (dit honnêtement)');
}
/* ───── 4. un nonce par réponse ───── */
{ const a = nonceBee(), b = nonceBee();
  ok(a !== b && /^[A-Za-z0-9_-]{20,}$/.test(a), '4. un nonce aléatoire à chaque réponse (' + a.length + ' caractères)'); }
/* ───── 5. câblage ───── */
{
  const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  ok(/nonce: String\(env && env\.BEE_PARTOUT\) !== '0' && marqueurKevin\(request\) \? nonceBee\(\) : ''/.test(W), '5a. le routeur ne crée un nonce que pour le marqueur « Kevin », et pas si BEE_PARTOUT=0');
  const mk = (c) => ({ headers: new Headers(c ? { cookie: c } : {}) });
  ok(marqueurKevin(mk('a=1; kdmc_k=1; b=2')) && !marqueurKevin(mk('kdmc_k=0')) && !marqueurKevin(mk('xkdmc_k=1')) && !marqueurKevin(mk('')) && !marqueurKevin({}), '5b. marqueurKevin : seulement kdmc_k=1 exact');
  ok(/onDocument\(\{ end\(fin\)/.test(W), '5c. une page sans balise <body> (Cuisine) reçoit Bee à la fin du document');
}
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
