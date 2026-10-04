/* GARDE — BEE ET BOURRICOT EN 3D, POUR LA RÉALITÉ AUGMENTÉE (Kevin 3.10.2026 : « Mets les personnages
 * en dimension, vrais petits personnages animés, réagis, mimiques » / « Modélise en 3D les personnages
 * pour une réalité augmentée »).
 *
 * Ce que ce test PROUVE (fichiers lus octet par octet, puis la page dans un vrai Chromium) :
 *  A. les 6 fichiers existent et restent légers pour un téléphone (glb ≤ 800 Ko, usdz ≤ 500 Ko) ;
 *  B. chaque .glb est un glTF 2.0 valide, avec SES pièces articulées (Bee : antennes, ailes ;
 *     Bourricot : oreilles, queue ; les deux : tête, yeux, bras, jambes) et 5 animations
 *     (vie + saute, rire, surprise, coucou) qui bougent VRAIMENT (valeurs lues dans le binaire :
 *     les yeux se ferment dans « vie », les bras montent dans « saute », la boucle « vie » ne saute pas) ;
 *  C. chaque .usdz est un paquet que l'iPhone accepte (zip SANS compression, scène .usdc en premier,
 *     données alignées sur 64 octets — sinon « Coup d'œil AR » refuse de l'ouvrir) ;
 *  D. la page 3d.html : model-viewer FIGÉ avec son empreinte (integrity), CSP sans 'unsafe-inline'
 *     ni 'unsafe-eval' pour les scripts, ios-src / poster / lien rel="ar" de secours, boutons ⇄
 *     animations du modèle ; Bee sait l'ouvrir (« en 3D », « réalité augmentée », bouton 🧸) ;
 *  E. dans Chromium (taille iPhone) : les deux personnages s'affichent et bougent, 0 erreur, 0 refus
 *     CSP ; un bouton → la réaction joue PUIS il revient à sa vie ; toucher le personnage = réaction ;
 *     boutons ≥ 44 px, pas de défilement de côté ; l'empreinte du model-viewer téléchargé = celle de
 *     la page ; si model-viewer ne vient pas, l'image et le lien direct « réalité augmentée » restent.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = path.join(ROOT, 'javis');
let ok = 0, ko = 0;
function chk(c, m) { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } }
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PERSOS = {
  bee: ['corps', 'tete', 'yeux', 'antenneG', 'antenneD', 'aileG', 'aileD', 'brasG', 'brasD', 'jambeG', 'jambeD'],
  bourricot: ['corps', 'tete', 'yeux', 'oreilleG', 'oreilleD', 'brasG', 'brasD', 'jambeG', 'jambeD', 'queue'],
};
const ANIMS = ['vie', 'saute', 'rire', 'surprise', 'coucou'];

/* ---------- A. les fichiers ---------- */
console.log('A. Les fichiers 3D');
for (const n of Object.keys(PERSOS)) {
  for (const [ext, max] of [['glb', 800], ['usdz', 500], ['webp', 60]]) {
    const f = path.join(J, '3d', n + '.' + ext), t = fs.existsSync(f) ? fs.statSync(f).size : 0;
    chk(t > 1000 && t <= max * 1024, `javis/3d/${n}.${ext} existe (${Math.round(t / 1024)} Ko ≤ ${max} Ko)`);
  }
}

/* ---------- B. glTF : pièces + animations qui bougent ---------- */
console.log('B. Les modèles .glb (Android, navigateurs)');
function lireGlb(f) {
  const b = fs.readFileSync(f);
  if (b.toString('ascii', 0, 4) !== 'glTF' || b.readUInt32LE(4) !== 2) return null;
  const lj = b.readUInt32LE(12), json = JSON.parse(b.toString('utf8', 20, 20 + lj));
  const bin = b.subarray(20 + lj + 8);
  const acc = (i) => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    return new Float32Array(bin.buffer.slice(bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0) + a.count * n * 4)); };
  return { json, acc };
}
const piste = (G, anim, noeud, chemin) => {
  const a = G.json.animations.find((x) => x.name === anim); if (!a) return null;
  const ni = G.json.nodes.findIndex((x) => x.name === noeud);
  const c = a.channels.find((x) => x.target.node === ni && x.target.path === chemin); if (!c) return null;
  return G.acc(a.samplers[c.sampler].output);
};
const angle = (q, i) => 2 * Math.acos(Math.min(1, Math.abs(q[i * 4 + 3]))) * 180 / Math.PI;   // angle d'un quaternion, en degrés
for (const [n, pieces] of Object.entries(PERSOS)) {
  const G = lireGlb(path.join(J, '3d', n + '.glb'));
  chk(!!G, `${n}.glb est un glTF 2.0 binaire`);
  if (!G) continue;
  const noms = G.json.nodes.map((x) => x.name);
  const manque = pieces.filter((p) => !noms.includes(p));
  chk(!manque.length, `${n} : ${pieces.length} pièces articulées${manque.length ? ' — MANQUE ' + manque.join(', ') : ''}`);
  const an = (G.json.animations || []).map((a) => a.name);
  chk(ANIMS.every((a) => an.includes(a)), `${n} : animations ${ANIMS.join(', ')} (trouvé : ${an.join(', ')})`);
  const yeux = piste(G, 'vie', 'yeux', 'scale');
  const minY = yeux ? Math.min(...Array.from({ length: yeux.length / 3 }, (_, i) => yeux[i * 3 + 1])) : 1;
  chk(minY < 0.3, `${n} cligne des yeux dans « vie » (hauteur des yeux mini ${minY.toFixed(2)})`);
  const bras = (anim) => { const q = piste(G, anim, 'brasD', 'rotation'); return q ? Math.max(...Array.from({ length: q.length / 4 }, (_, i) => angle(q, i))) : 0; };
  chk(bras('saute') > 110, `${n} lève les bras quand il saute (bras droit jusqu'à ${bras('saute').toFixed(0)}°)`);
  const ey = (anim) => { const s = piste(G, anim, 'yeux', 'scale'); return s ? Math.max(...Array.from({ length: s.length / 3 }, (_, i) => s[i * 3 + 1])) : 1; };
  chk(ey('surprise') > 1.3, `${n} écarquille les yeux de surprise (×${ey('surprise').toFixed(2)})`);
  /* toutes les pièces bougent dans « vie » (sauf aucune : même le corps respire) */
  const immobiles = pieces.filter((p) => { const q = piste(G, 'vie', p, 'rotation'), s = piste(G, 'vie', p, 'scale');
    const dq = q ? Math.max(...Array.from({ length: q.length / 4 }, (_, i) => angle(q, i))) - Math.min(...Array.from({ length: q.length / 4 }, (_, i) => angle(q, i))) : 0;
    const ds = s ? Math.max(...s) - Math.min(...s) : 0; return dq < 1 && ds < 0.01; });
  chk(!immobiles.length, `${n} : chaque pièce bouge dans « vie »${immobiles.length ? ' — IMMOBILE : ' + immobiles.join(', ') : ''}`);
  /* la boucle ne saute pas : la dernière image = la première */
  const tr = piste(G, 'vie', 'tete', 'rotation'), k = tr ? tr.length / 4 - 1 : 0;
  chk(tr && [0, 1, 2, 3].every((j) => Math.abs(Math.abs(tr[j]) - Math.abs(tr[k * 4 + j])) < 0.01), `${n} : la boucle « vie » se referme sans à-coup`);
}

/* ---------- C. USDZ : accepté par l'iPhone ---------- */
console.log('C. Les modèles .usdz (iPhone, « Coup d\'œil AR »)');
for (const n of Object.keys(PERSOS)) {
  const b = fs.readFileSync(path.join(J, '3d', n + '.usdz'));
  const entrees = []; let o = 0;
  while (o + 30 <= b.length && b.readUInt32LE(o) === 0x04034b50) {
    const meth = b.readUInt16LE(o + 8), taille = b.readUInt32LE(o + 18), ln = b.readUInt16LE(o + 26), le = b.readUInt16LE(o + 28);
    const nom = b.toString('utf8', o + 30, o + 30 + ln), debut = o + 30 + ln + le;
    entrees.push({ nom, meth, debut }); o = debut + taille;
  }
  chk(entrees.length >= 1 && /\.usdc$/.test(entrees[0].nom), `${n}.usdz : la scène ${entrees[0] && entrees[0].nom} est en premier`);
  chk(entrees.every((e) => e.meth === 0), `${n}.usdz : aucune compression (exigé par l'iPhone)`);
  chk(entrees.every((e) => e.debut % 64 === 0), `${n}.usdz : données alignées sur 64 octets (exigé par l'iPhone)`);
  const usdc = entrees[0] ? b.subarray(entrees[0].debut, entrees[0].debut + 8).toString('ascii') : '';
  chk(usdc === 'PXR-USDC', `${n}.usdz : scène USD binaire lisible (${usdc || 'rien'})`);
}

/* ---------- D. la page ---------- */
console.log('D. La page javis/3d.html');
const H = lire('javis/3d.html'), V = lire('javis/3d/vue.js');
const mvTag = (H.match(/<script[^>]+model-viewer[^>]*><\/script>/) || [''])[0];
const SRI = (mvTag.match(/integrity="(sha384-[^"]+)"/) || [])[1];
const MV_URL = (mvTag.match(/src="([^"]+)"/) || [])[1];
chk(/@google\/model-viewer@\d+\.\d+\.\d+\//.test(MV_URL || ''), `model-viewer en version FIGÉE (${MV_URL})`);
chk(!!SRI && /crossorigin="anonymous"/.test(mvTag), 'model-viewer vérifié par son empreinte (integrity + crossorigin)');
const csp = (H.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const scriptSrc = (csp.match(/script-src ([^;]+)/) || [])[1] || '';
chk(!!csp && !/'unsafe-inline'/.test(scriptSrc) && !/'unsafe-eval'/.test(scriptSrc), `CSP : scripts sans 'unsafe-inline' ni 'unsafe-eval' (${scriptSrc.trim()})`);
chk(/'wasm-unsafe-eval'/.test(scriptSrc), "CSP : 'wasm-unsafe-eval' présent (model-viewer en a besoin : sans lui, rien ne s'affiche)");
chk(!/<script(?![^>]*\bsrc=)[^>]*>/.test(H), 'aucun script écrit dans la page (tout en fichier : rien à autoriser à la main)');
for (const n of Object.keys(PERSOS)) {
  const mv = (H.match(new RegExp(`<model-viewer[^>]*src="3d/${n}\\.glb"[^>]*>`)) || [''])[0];
  chk(new RegExp(`ios-src="3d/${n}\\.usdz"`).test(mv) && /\bar\b/.test(mv) && /quick-look/.test(mv) && new RegExp(`poster="3d/${n}\\.webp"`).test(mv) && /alt="/.test(mv),
    `${n} : glb + ios-src usdz + réalité augmentée (quick-look) + affiche + texte pour lecteur d'écran`);
  chk(new RegExp(`<a rel="ar" href="3d/${n}\\.usdz">`).test(H), `${n} : lien direct « réalité augmentée » de secours (sans model-viewer)`);
}
const boutons = [...new Set([...H.matchAll(/data-anim="([^"]+)"/g)].map((m) => m[1]))];
chk(boutons.length === 4 && boutons.every((b) => ANIMS.includes(b)), `les boutons jouent des animations qui existent (${boutons.join(', ')})`);
const ordre = (V.match(/ORDRE = \[([^\]]+)\]/) || [])[1] || '';
chk(boutons.every((b) => ordre.includes("'" + b + "'")), 'toucher le personnage fait défiler les mêmes réactions');
const WID = lire('tools/javis/javis-widget.js');
chk(/URL_3D = 'https:\/\/javis\.kd-mc\.com\/3d\.html'/.test(WID) && /\['🧸 En 3D', 'Montre-toi en 3D'\]/.test(WID), 'Bee propose « 🧸 En 3D » et sait où est la page');
const RE3 = new Function('return ' + (WID.match(/var RE_3D = (\/.+\/);/) || [])[1])();
for (const [t, attendu] of [['montre-toi en 3d', true], ['bourricot en 3d', true], ['réalité augmentée', true], ['pose-toi chez moi', true],
  ['imprime en 3d mon dessin', false], ['quel est le meilleur logiciel 3d', false]]) chk(RE3.test(t) === attendu, `« ${t} » ${attendu ? 'ouvre' : "n'ouvre pas"} la 3D`);

/* Lingua (Kevin 3.10 : « les personnages servent aussi dans Lingua ») : un bouton dans les réglages ET sur l'accueil,
   qui ouvre la page 3D sur LA mascotte choisie */
const LA = lire('lingua/app.js');
const u3 = (LA.match(/function url3D\(\)\{[^}]*\}/) || [''])[0];
chk(/https:\/\/javis\.kd-mc\.com\/3d\.html#/.test(u3) && /"bee"/.test(u3) && /"bourricot"/.test(u3), 'Lingua : url3D() vise javis.kd-mc.com/3d.html#bee / #bourricot');
chk(['bee', 'bourricot'].every((id) => new RegExp(`data-perso="${id}"`).test(H)), 'les ancres #bee et #bourricot existent dans la page 3D');
chk((LA.match(/onclick=ouvrir3D/g) || []).length >= 2 && /plan-diff b3d/.test(LA) && /row switch b3d/.test(LA), 'Lingua : le bouton « en 3D » est dans les réglages ET sur l\'accueil');
chk(!/<a [^>]*href="https:\/\/javis/.test(LA) && /noopener/.test(LA), 'Lingua : la page 3D s\'ouvre en onglet séparé (noopener)');

/* ---------- E. dans un vrai navigateur ---------- */
console.log('E. La page dans Chromium (taille iPhone)');
/* model-viewer : téléchargé une fois (curl suit le proxy du poste ; la CI a le réseau ouvert), puis
   servi au navigateur — et SON empreinte doit être celle écrite dans la page */
let MV = null;
const cache = path.join(os.tmpdir(), 'kdmc-model-viewer-' + (MV_URL || '').replace(/[^a-z0-9.]/gi, '_'));
try {
  if (!fs.existsSync(cache)) execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', cache, MV_URL], { stdio: 'pipe' });
  MV = fs.readFileSync(cache);
} catch (e) { MV = null; }
chk(!!MV, `model-viewer téléchargé depuis le CDN (${MV ? Math.round(MV.length / 1024) + ' Ko' : 'ÉCHEC'})`);
if (MV) chk('sha384-' + crypto.createHash('sha384').update(MV).digest('base64') === SRI, "l'empreinte du fichier du CDN = celle de la page (sinon le navigateur le refuserait)");

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(J, u);
  if (!f.startsWith(J) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(0);
await new Promise((r) => srv.once('listening', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
async function ouvrir(sansMV) {
  const ctx = await nav.newContext({ ...devices['iPhone 13'] });
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => (sansMV || !MV ? r.abort() : r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: MV })));
  const p = await ctx.newPage(), err = [];
  p.on('pageerror', (e) => err.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) err.push(m.text()); if (/Content Security Policy|Refused to/.test(m.text())) err.push(m.text()); });
  await p.goto(BASE + '/3d.html', { waitUntil: 'load' });
  return { ctx, p, err };
}
if (MV) {
  const { ctx, p, err } = await ouvrir(false);
  let pret = false;
  try {
    await p.waitForFunction(() => document.body.dataset.pret3d === '1', null, { timeout: 30000 });
    await p.waitForFunction(() => document.querySelector('model-viewer').loaded, null, { timeout: 60000 });
    await p.locator('[data-perso="bourricot"] model-viewer').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => [...document.querySelectorAll('model-viewer')].every((m) => m.loaded), null, { timeout: 60000 });
    pret = true;
  } catch (e) { /* compté ci-dessous */ }
  chk(pret, 'les deux personnages 3D sont chargés et affichés');
  const etat = await p.evaluate(() => [...document.querySelectorAll('model-viewer')].map((m) => ({ a: m.availableAnimations || [], nom: m.animationName, joue: !m.paused })));
  chk(etat.every((e) => ANIMS.every((a) => e.a.includes(a)) && e.nom === 'vie' && e.joue), `ils vivent tout de suite (animation « vie » qui tourne) — ${JSON.stringify(etat.map((e) => e.nom + (e.joue ? '▶' : '⏸')))}`);
  await p.evaluate(() => scrollTo(0, 0));
  await p.evaluate(() => document.querySelector('[data-perso="bee"] [data-anim="saute"]').click());
  const pendant = await p.evaluate(() => document.querySelector('model-viewer').animationName);
  chk(pendant === 'saute', `bouton « Saute » → Bee saute (${pendant})`);
  let revenu = false;
  try { await p.waitForFunction(() => document.querySelector('model-viewer').animationName === 'vie' && !document.querySelector('model-viewer').paused, null, { timeout: 6000 }); revenu = true; } catch (e) { /* compté */ }
  chk(revenu, 'puis elle revient toute seule à sa vie (et continue de bouger)');
  const bx = await p.locator('[data-perso="bee"] model-viewer').boundingBox();
  await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2);
  const touche = await p.evaluate(() => document.querySelector('model-viewer').animationName);
  chk(ANIMS.slice(1).includes(touche), `toucher Bee la fait réagir (${touche})`);
  const avantGlisse = await p.evaluate(() => document.querySelector('model-viewer').dataset.reactions);
  await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.mouse.move(bx.x + bx.width / 2 + 80, bx.y + bx.height / 2, { steps: 6 }); await p.mouse.up();
  const apresGlisse = await p.evaluate(() => document.querySelector('model-viewer').dataset.reactions);
  chk(+avantGlisse >= 2 && apresGlisse === avantGlisse, `glisser le doigt la fait tourner, sans déclencher une autre réaction (${avantGlisse} → ${apresGlisse} réactions)`);
  /* arrivée directe sur #bourricot (depuis Lingua) : Bourricot est tout de suite à l'écran */
  { const c2 = await ctx.newPage(); await c2.goto(BASE + '/3d.html#bourricot', { waitUntil: 'load' }); await c2.waitForTimeout(700);
    const hautB = await c2.evaluate(() => Math.round(document.querySelector('[data-perso="bourricot"]').getBoundingClientRect().top));
    chk(hautB >= -5 && hautB < 120, `lien Lingua #bourricot → Bourricot en haut de l'écran (à ${hautB} px du haut)`); await c2.close(); }
  const mesure = await p.evaluate(() => ({ larg: document.documentElement.scrollWidth, vue: innerWidth,
    petits: [...document.querySelectorAll('button, header a')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim()) }));
  chk(mesure.larg <= mesure.vue, `pas de défilement de côté sur iPhone (${mesure.larg} ≤ ${mesure.vue} px)`);
  chk(!mesure.petits.length, `tous les boutons font au moins 44 px${mesure.petits.length ? ' — TROP PETITS : ' + mesure.petits.join(', ') : ''}`);
  chk(!err.length, `0 erreur, 0 refus de sécurité${err.length ? ' — ' + err.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(true);
  let secours = false;
  try { await p.waitForFunction(() => document.body.classList.contains('sans-3d'), null, { timeout: 12000 }); secours = true; } catch (e) { /* compté */ }
  const vis = await p.evaluate(() => [...document.querySelectorAll('a[rel="ar"] img')].filter((i) => i.offsetParent && i.getBoundingClientRect().height > 100).length);
  chk(secours && vis === 2, `sans model-viewer (réseau coupé) : les 2 images + lien « réalité augmentée » restent (${vis} visibles)`);
  await ctx.close();
}
/* LINGUA pour de vrai (Kevin 3.10 : « les personnages servent aussi dans Lingua ») : un compte neuf, la langue choisie,
   le bouton « en 3D » de l'accueil et des réglages, pour Bee PUIS pour Bourricot */
{
  const LROOT = path.join(ROOT, 'lingua');
  const lsrv = http.createServer((q, res) => {
    let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
    if (u.startsWith('/__')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
    const f = path.join(LROOT, u);
    if (!f.startsWith(LROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  }).listen(0);
  await new Promise((r) => lsrv.once('listening', r));
  for (const [mascotte, ancre] of [['bee', '#bee'], ['donkey', '#bourricot']]) {
    const ctx = await nav.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage(), err = [];
    p.on('pageerror', (e) => err.push(e.message));
    await p.addInitScript((m) => {
      const g = (k, v) => localStorage.setItem('lingua_g_' + k, JSON.stringify(v));
      g('accounts', [{ id: 'acc_test', name: 'Test Essai', avatar: '🦊', code: '', kdmcUid: '', created: 1 }]); g('current', 'acc_test');
      localStorage.setItem('lingua_a_acc_test_mascot', JSON.stringify(m));
      window.__ouv = []; window.open = (u, n, f) => { window.__ouv.push(u + '|' + f); return {}; };
    }, mascotte);
    await p.goto(`http://127.0.0.1:${lsrv.address().port}/`, { waitUntil: 'load' }); await p.waitForTimeout(1800);
    await p.evaluate(() => { const x = [...document.querySelectorAll('button, .row, div')].find((e) => /^\s*🇬🇧/.test(e.textContent) && e.textContent.length < 40); if (x) x.click(); });
    await p.waitForTimeout(2200);
    await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /Je débute/.test(e.textContent)); if (x) x.click(); });
    await p.waitForTimeout(700);
    const home = await p.evaluate(() => { const e = document.querySelector('button.plan-diff.b3d'); return e ? { h: Math.round(e.getBoundingClientRect().height), t: e.textContent } : null; });
    chk(home && home.h >= 44, `Lingua (${mascotte}) : bouton « en 3D » sur l'accueil, ${home ? home.h : '—'} px (« ${home ? home.t : ''} »)`);
    if (home) await p.click('button.plan-diff.b3d');
    const ouv = await p.evaluate(() => window.__ouv);
    chk(ouv.length === 1 && ouv[0] === `https://javis.kd-mc.com/3d.html${ancre}|noopener`, `Lingua (${mascotte}) : le toucher ouvre ${ancre} sans lien vers Lingua (noopener) — ${JSON.stringify(ouv)}`);
    await p.evaluate(() => { const t = [...document.querySelectorAll('.tabbar button, nav button, .tab')].find((x) => /Profil/i.test(x.textContent)); if (t) t.click(); });
    await p.waitForTimeout(900);
    const reg = await p.evaluate(() => { const e = document.querySelector('.voice-card button.b3d'); return e ? Math.round(e.getBoundingClientRect().height) : 0; });
    chk(reg >= 44, `Lingua (${mascotte}) : bouton « en 3D » dans les réglages, ${reg} px`);
    chk(!err.length, `Lingua (${mascotte}) : 0 erreur JS${err.length ? ' — ' + err[0] : ''}`);
    await ctx.close();
  }
  lsrv.close();
}
await nav.close(); srv.close();

console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
