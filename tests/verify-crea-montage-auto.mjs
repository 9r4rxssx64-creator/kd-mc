/* PREUVE — Créa Studio « 🎬 Montage auto » (v9.8.0).
 * Équivalent de video-use (l'éditeur vidéo IA), mais sur le téléphone et en
 * mieux. Ici on ne croit RIEN sur parole : on fabrique de VRAIES vidéos dans
 * le navigateur (image + son), on lance le montage, et on mesure le résultat.
 *
 * On prouve :
 *   1) on entend vraiment où ça parle (3 prises séparées par du silence)
 *   2) le seuil s'ADAPTE : la même scène enregistrée 10× plus bas est toujours
 *      trouvée (un seuil fixe, lui, n'en trouve AUCUNE — c'est le piège
 *      « ça marche sur une vidéo et rate toutes les autres »)
 *   3) on choisit les meilleurs moments SANS mélanger l'ordre et sans vider
 *      complètement un des rushes
 *   4) on regarde vraiment l'image : le noir et le flou sont reconnus
 *   5) les couleurs sont corrigées d'après la VRAIE image (sombre → éclairci,
 *      trop jaune → refroidi) et une image déjà bonne n'est pas massacrée
 *   6) les hésitations (« euh », « voilà ») sont retirées ET le reste est
 *      recalé (aucun trou dans les sous-titres)
 *   7) l'extrait sonore envoyé pour les sous-titres est un vrai fichier WAV
 *   8) BOUT EN BOUT : 2 vraies vidéos → une vidéo montée, plus courte que les
 *      rushes, rangée dans « Mes créas »
 *   9) quand l'IA des sous-titres est injoignable, l'app le DIT (elle ne fait
 *      pas semblant)
 * Lancer : node tests/verify-crea-montage-auto.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('../tools/crea-studio', import.meta.url).pathname), PORT = 8261;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// Ce test vérifie ce que fait l'app QUAND L'IA N'EST PAS JOIGNABLE (« elle le DIT au lieu de
// faire semblant »). Il ne tenait que parce que le sandbox n'a pas de réseau : sur un runner
// qui en a, l'IA répond, des sous-titres sortent, et le test rougit. On coupe donc l'extérieur
// pour de bon (le serveur local qui sert la page reste joignable). Leçon #220.
await ctx.route(/^https?:\/\//, (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:\/]/.test(r.request().url()) ? r.continue() : r.abort()));
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION|ERR_PROXY/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.fill('#gateName', 'Test Montage'); await page.fill('#gateCode', '1234');
await page.click('#gateGo'); await page.waitForTimeout(300);

/* ---------- 1 & 2) écouter : où ça parle, à n'importe quel volume ---------- */
const ecoute = await page.evaluate(() => {
  const A = window.Auto._algo, sr = 16000, n = sr * 6;
  // 3 prises de 1,2 s à 1 s / 3 s / 5 s, le reste = silence + un léger souffle
  const faire = (gain) => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const parle = (t > 1 && t < 2.2) || (t > 3 && t < 4.2) || (t > 5 && t < 5.9);
      d[i] = ((Math.random() * 2 - 1) * (parle ? 0.5 : 0.004)) * gain;
    }
    return d;
  };
  const mesure = (gain) => {
    const e = A.enveloppe(faire(gain), sr);
    return { n: A.moments(e.en, e.pas, { min: 0.6, trou: 0.30 }).length, seuil: A.seuilParole(e.en) };
  };
  const fort = mesure(1), bas = mesure(0.1);
  const e = A.enveloppe(faire(0.1), sr);
  // ce qu'un seuil FIXE (réglé pour une voix forte) trouverait sur la prise basse
  const fixe = A.moments(e.en, e.pas, { min: 0.6, trou: 0.30, seuil: 0.05 }).length;
  const seg = A.moments(A.enveloppe(faire(1), sr).en, 0.02, { min: 0.6, trou: 0.30 });
  return { fort: fort.n, bas: bas.n, fixe, debut: seg[0] ? +seg[0].a.toFixed(2) : -1, fin: seg[0] ? +seg[0].b.toFixed(2) : -1 };
});
chk(ecoute.fort === 3, `on retrouve les 3 prises de parole (${ecoute.fort} trouvées)`);
chk(ecoute.bas === 3 && ecoute.fixe === 0,
  `enregistrement 10× plus bas : toujours 3 prises (un seuil FIXE, lui, en trouve ${ecoute.fixe})`);
chk(ecoute.debut >= 0.8 && ecoute.debut <= 1.0 && ecoute.fin >= 2.2 && ecoute.fin <= 2.45,
  `la coupe tombe au bon endroit avec une petite marge (${ecoute.debut}s → ${ecoute.fin}s pour une prise 1,0→2,2 s)`);

/* ---------- 3) choisir sans casser l'ordre ni vider un rush ---------- */
const choix = await page.evaluate(() => {
  const A = window.Auto._algo, segs = [];
  for (let c = 0; c < 2; c++) for (let k = 0; k < 6; k++)
    segs.push({ clip: c, a: k * 10, b: k * 10 + 4, force: (k === 0 ? 0.02 : 0.3 + k / 20) });
  const g = A.choisir(segs, 12, 5);
  const tot = g.reduce((t, s) => t + (s.b - s.a), 0);
  const ordre = g.every((s, i) => i === 0 || g[i - 1].clip < s.clip || (g[i - 1].clip === s.clip && g[i - 1].a <= s.a));
  const parClip = [0, 1].map(c => g.filter(s => s.clip === c).length);
  const long = A.choisir([{ clip: 0, a: 0, b: 30, force: 1 }], 0, 5);
  return { n: g.length, tot: +tot.toFixed(1), ordre, parClip, coupeLong: long[0].b - long[0].a };
});
chk(choix.tot <= 12.01 && choix.n >= 3, `on tient la durée visée : ${choix.tot}s pour 12s demandées (${choix.n} moments)`);
chk(choix.ordre, 'les moments restent dans l\'ordre (un montage doit se comprendre)');
chk(choix.parClip[0] >= 1 && choix.parClip[1] >= 1, `chaque vidéo garde une trace (${choix.parClip.join(' + ')} moments)`);
chk(choix.coupeLong === 5, `un plan trop long est raccourci au rythme choisi (${choix.coupeLong}s max)`);

/* ---------- 4) regarder l'image : noir, flou, net ---------- */
const image = await page.evaluate(() => {
  const A = window.Auto._algo;
  const px = (f, w = 64, h = 64) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); f(x, w, h);
    return { d: x.getImageData(0, 0, w, h).data, w, h };
  };
  const noir = px(x => { x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64); });
  const net = px(x => { for (let y = 0; y < 64; y += 4) for (let X = 0; X < 64; X += 4) { x.fillStyle = ((X + y) / 4) % 2 ? '#fff' : '#000'; x.fillRect(X, y, 4, 4); } });
  const flou = px(x => { x.filter = 'blur(3px)'; for (let y = 0; y < 64; y += 4) for (let X = 0; X < 64; X += 4) { x.fillStyle = ((X + y) / 4) % 2 ? '#fff' : '#000'; x.fillRect(X, y, 4, 4); } });
  const n = A.noteImage(noir.d, 64, 64), q = A.noteImage(net.d, 64, 64), f = A.noteImage(flou.d, 64, 64);
  const med = q.net;                       // les autres moments du rush sont nets
  return {
    noir: n, net: q, flou: f,
    jugeNoir: A.garderImage(n, med), jugeFlou: A.garderImage(f, med), jugeNet: A.garderImage(q, med),
    // un film volontairement doux (tout est flou) ne doit PAS être vidé
    jugeDoux: A.garderImage(f, f.net)
  };
});
chk(image.noir.lum < 5, `une image noire est reconnue (luminosité ${image.noir.lum.toFixed(1)}/255)`);
chk(image.net.net > image.flou.net * 2,
  `le flou est reconnu : net ${image.net.net.toFixed(0)} contre flou ${image.flou.net.toFixed(0)} (plus de 2× moins de détail)`);
chk(!image.jugeNoir.ok && image.jugeNoir.raison === 'noir' && !image.jugeFlou.ok && image.jugeFlou.raison === 'flou' && image.jugeNet.ok,
  'un moment noir et un moment flou sont écartés du montage, un moment net est gardé');
chk(image.jugeDoux.ok,
  'un film volontairement doux (tout est flou) n\'est PAS vidé : on compare au reste du rush, pas à une valeur figée');

/* ---------- 5) couleurs corrigées d'après la vraie image ---------- */
const couleur = await page.evaluate(() => {
  const A = window.Auto._algo;
  const stats = (f) => {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const x = c.getContext('2d'); f(x);
    return A.statsCouleur(x.getImageData(0, 0, 48, 48).data, 48, 48);
  };
  const sombre = A.correction(stats(x => { x.fillStyle = '#1a1c22'; x.fillRect(0, 0, 48, 48); x.fillStyle = '#2a2d36'; x.fillRect(0, 0, 48, 24); }));
  const chaud = A.correction(stats(x => { x.fillStyle = '#c89050'; x.fillRect(0, 0, 48, 48); }));
  const froid = A.correction(stats(x => { x.fillStyle = '#5090c8'; x.fillRect(0, 0, 48, 48); }));
  // image « déjà bien exposée » : dégradé du noir au blanc sur toute la largeur
  const bonne = A.correction(stats(x => { for (let i = 0; i < 48; i++) { const v = Math.round(i * 255 / 47); x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(i, 0, 1, 48); } }));
  return { sombre, chaud: chaud.bal, froid: froid.bal, bonne };
});
chk(couleur.sombre.lumiere > 1.15 && couleur.sombre.contraste > 1.2,
  `une image sombre et plate est rattrapée (lumière ×${couleur.sombre.lumiere.toFixed(2)}, contraste ×${couleur.sombre.contraste.toFixed(2)})`);
chk(couleur.chaud && /40,90,255/.test(couleur.chaud.c) && couleur.chaud.a > 0
  && couleur.froid && /255,140,40/.test(couleur.froid.c) && couleur.froid.a > 0,
  `balance des blancs : une image trop jaune est refroidie (voile bleu ${couleur.chaud ? couleur.chaud.a : '—'}), une image trop bleue est réchauffée`);
chk(couleur.bonne.lumiere < 1.12 && couleur.bonne.contraste < 1.10,
  `une image déjà bonne n'est PAS massacrée (lumière ×${couleur.bonne.lumiere.toFixed(2)}, contraste ×${couleur.bonne.contraste.toFixed(2)})`);

/* ---------- 5 bis) cadrage : on ne coupe pas le sujet en deux ---------- */
const cadre = await page.evaluate(() => {
  const c = window.Auto._algo.cadrage;
  return {
    paysageVersTel: c(1920, 1080, 720, 1280),   // filmé à l'horizontale → format téléphone
    telVersTel: c(1080, 1920, 720, 1280),       // déjà vertical, format identique
    presque: c(1080, 1620, 720, 1280),          // vertical un peu moins allongé (2:3)
    carreVersTel: c(1080, 1080, 720, 1280),     // carré : remplir couperait la tête
    telVersLarge: c(1080, 1920, 1280, 720)
  };
});
chk(cadre.paysageVersTel.mode === 'entier' && cadre.telVersLarge.mode === 'entier',
  `une vidéo filmée à l'horizontale n'est PAS charcutée en format téléphone (on n'en garderait que ${Math.round(cadre.paysageVersTel.visible * 100)} % → image entière sur fond flou)`);
chk(cadre.carreVersTel.mode === 'entier',
  `une vidéo carrée non plus (remplir n'en garderait que ${Math.round(cadre.carreVersTel.visible * 100)} % : une tête serait coupée)`);
chk(cadre.telVersTel.mode === 'plein' && cadre.presque.mode === 'plein',
  `quand le format colle déjà, l'image remplit l'écran : pas de bandes inutiles (${Math.round(cadre.presque.visible * 100)} % conservés suffisent)`);

/* ---------- 6) hésitations retirées + tout recalé ---------- */
const hesit = await page.evaluate(() => {
  const A = window.Auto._algo;
  const segs = [
    { clip: 0, a: 0, b: 2, t0: 0, t1: 2 },      // « bonjour tout le monde »
    { clip: 0, a: 5, b: 6, t0: 2, t1: 3 },      // « euh »  → à jeter
    { clip: 0, a: 9, b: 11, t0: 3, t1: 5 }      // « on y va »
  ];
  const mots = [
    { m: 'bonjour', a: 0.1, b: 0.6 }, { m: 'tout', a: 0.7, b: 1.0 }, { m: 'le', a: 1.1, b: 1.3 }, { m: 'monde', a: 1.4, b: 1.9 },
    { m: 'euh', a: 2.2, b: 2.8 },
    { m: 'on', a: 3.2, b: 3.5 }, { m: 'y', a: 3.6, b: 3.8 }, { m: 'va', a: 3.9, b: 4.6 }
  ];
  const r = A.nettoyer(segs, mots);
  return {
    vires: r.vires, n: r.segs.length, total: r.total,
    reste: r.mots.map(m => m.m).join(' '),
    // « on » doit maintenant démarrer à 2,2 s (le trou du « euh » est refermé)
    on: +(r.mots.find(m => m.m === 'on') || {}).a.toFixed(2),
    filler: [A.estRemplissage('euh'), A.estRemplissage('Voilà,'), A.estRemplissage('bonjour')]
  };
});
chk(hesit.vires === 1 && hesit.n === 2 && hesit.reste === 'bonjour tout le monde on y va',
  `l'hésitation est retirée, le reste est intact (« ${hesit.reste} »)`);
chk(Math.abs(hesit.total - 4) < 0.01 && Math.abs(hesit.on - 2.2) < 0.05,
  `le temps est recalé : plus de trou (le mot « on » passe de 3,2 s à ${hesit.on} s)`);
chk(hesit.filler[0] && hesit.filler[1] && !hesit.filler[2],
  '« euh » et « Voilà, » sont des hésitations, « bonjour » n\'en est pas une');

/* ---------- 7) l'extrait sonore envoyé est un vrai WAV ---------- */
const wav = await page.evaluate(() => {
  const A = window.Auto._algo, f = new Float32Array(16000); // 1 s
  for (let i = 0; i < f.length; i++) f[i] = Math.sin(i / 20) * 0.5;
  const u = A.wav16(f, 16000), t = String.fromCharCode(u[0], u[1], u[2], u[3]) + String.fromCharCode(u[8], u[9], u[10], u[11]);
  const dv = new DataView(u.buffer);
  return { entete: t, octets: u.length, taux: dv.getUint32(24, true), canaux: dv.getUint16(22, true), bits: dv.getUint16(34, true) };
});
chk(wav.entete === 'RIFFWAVE' && wav.octets === 44 + 32000 && wav.taux === 16000 && wav.canaux === 1 && wav.bits === 16,
  `l'extrait envoyé pour les sous-titres est un vrai WAV 16 kHz mono (${wav.octets} octets)`);

/* ---------- 7 bis) le son est nettoyé AVANT d'être envoyé ---------- */
const son = await page.evaluate(() => {
  const A = window.Auto._algo, sr = 16000, n = sr;
  const pic = (d) => { let p = 0; for (const v of d) p = Math.max(p, Math.abs(v)); return p; };
  /* Estime la part de GRAVE : une moyenne glissante de 10 ms efface une voix
     à 300 Hz (3 périodes) mais laisse passer un grondement à 20 Hz. */
  const grave = (d) => {
    const W = 160; let s = 0, p = 0;
    for (let i = 0; i < d.length; i++) { s += d[i]; if (i >= W) { s -= d[i - W]; const m = Math.abs(s / W); if (m > p) p = m; } }
    return p;
  };
  const melange = (voixAmp, graveAmp) => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * 300 * i / sr) * voixAmp + Math.sin(2 * Math.PI * 20 * i / sr) * graveAmp;
    return d;
  };
  // 1) voix très faible seule → doit être nettement remontée
  const faible = melange(0.05, 0); const faibleAvant = pic(faible);
  A.nettoyerSon(faible, sr);
  // 2) voix + grondement → la part de grave doit chuter PAR RAPPORT à la voix
  const sale = melange(0.2, 0.6);
  const graveAvant = grave(sale) / pic(sale);
  A.nettoyerSon(sale, sr);
  const graveApres = grave(sale) / pic(sale);
  // 3) son déjà fort → pas de saturation
  const fort = melange(0.95, 0); A.nettoyerSon(fort, sr);
  return { faibleAvant, faibleApres: pic(faible), graveAvant, graveApres, fort: pic(fort) };
});
chk(son.faibleApres > son.faibleAvant * 5 && son.faibleApres <= 0.9,
  `une voix trop faible est remontée avant d'être envoyée (pic ${son.faibleAvant.toFixed(2)} → ${son.faibleApres.toFixed(2)}, sans jamais saturer)`);
chk(son.graveApres < son.graveAvant * 0.25,
  `le grondement des graves (vent, main sur le téléphone) est écrasé : il pesait ${Math.round(son.graveAvant * 100)} % du son, il n'en pèse plus que ${Math.round(son.graveApres * 100)} %`);
chk(son.fort <= 1.0 && son.fort > 0.8, `un son déjà fort n'est pas saturé (pic ${son.fort.toFixed(2)})`);

/* ---------- 8 & 9) BOUT EN BOUT : 2 vraies vidéos → 1 montage ---------- */
// On fabrique de vraies vidéos dans le navigateur : image animée + son
// (bruit fort = « on parle », silence = blanc à couper), plus un passage noir.
const fabrique = await page.evaluate(async () => {
  async function rush(sec, nom) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const x = c.getContext('2d');
    const ac = window.AudioBus.context();
    const dest = ac.createMediaStreamDestination();
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 220; g.gain.value = 0.0001;
    osc.connect(g); g.connect(dest); osc.start();
    const flux = c.captureStream(30);
    dest.stream.getAudioTracks().forEach(t => flux.addTrack(t));
    const rec = new MediaRecorder(flux, { mimeType: 'video/webm' });
    const bouts = []; rec.ondataavailable = e => { if (e.data.size) bouts.push(e.data); };
    const fin = new Promise(r => { rec.onstop = r; });
    rec.start(200);
    const t0 = performance.now();
    await new Promise(res => {
      function boucle() {
        const t = (performance.now() - t0) / 1000;
        if (t >= sec) return res();
        const parle = (t % 2) < 1.2;                 // 1,2 s de « parole » / 0,8 s de blanc
        const noir = t > sec - 1.2;                  // dernière seconde : image noire (à jeter)
        g.gain.value = parle ? 0.25 : 0.0002;
        if (noir) { x.fillStyle = '#000'; x.fillRect(0, 0, 320, 240); }
        else {
          x.fillStyle = '#20304a'; x.fillRect(0, 0, 320, 240);
          x.fillStyle = '#e8b84b'; x.fillRect(20 + (t * 40) % 200, 40, 90, 90);
          x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.fillText(nom + ' ' + t.toFixed(1), 20, 200);
        }
        requestAnimationFrame(boucle);
      }
      boucle();
    });
    rec.stop(); await fin; osc.stop();
    const b = new Blob(bouts, { type: 'video/webm' });
    return new File([b], nom + '.webm', { type: 'video/webm' });
  }
  const b64 = async (f) => {
    const buf = new Uint8Array(await f.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const f1 = await rush(6, 'rushA'), f2 = await rush(6, 'rushB');
  return { a: await b64(f1), b: await b64(f2) };
});
const dir = fs.mkdtempSync('/tmp/crea-rush-');
const p1 = path.join(dir, 'rushA.webm'), p2 = path.join(dir, 'rushB.webm');
fs.writeFileSync(p1, Buffer.from(fabrique.a, 'base64'));
fs.writeFileSync(p2, Buffer.from(fabrique.b, 'base64'));
chk(fs.statSync(p1).size > 5000 && fs.statSync(p2).size > 5000,
  `2 vraies vidéos de test fabriquées (${Math.round(fs.statSync(p1).size / 1024)} et ${Math.round(fs.statSync(p2).size / 1024)} Ko)`);

// on passe par le VRAI parcours : écran Vidéo → vraie sélection de fichiers
await page.click('#bnav button[data-go="video"]'); await page.waitForTimeout(250);
const boutonAuto = await page.locator('#videoEmpty button', { hasText: 'Montage auto' }).isVisible();
await page.setInputFiles('#fileAutoVid', [p1, p2]);
await page.waitForTimeout(1200);
const board = {
  bandeau: await page.locator('#autoBoard').isVisible(),
  panneau: await page.locator('#autoPanel').isVisible(),
  bouton: await page.locator('#autoGo').isVisible(),
  lignes: await page.locator('#autoList .autorow').count(),
  noms: (await page.locator('#autoList .nm').allTextContents()).join(' + ')
};
chk(boutonAuto, 'le bouton « ✨ Montage auto » est visible dès l\'écran Vidéo (sans chercher)');
chk(board.bandeau && board.panneau && board.bouton && board.lignes === 2,
  `l'écran « Montage auto » s'ouvre vraiment et liste les 2 rushes (${board.noms})`);

// on vise 8 s, sous-titres demandés (l'IA est injoignable ici : on veut voir si
// l'app le DIT au lieu de faire semblant)
await page.evaluate(() => {
  document.querySelector('#autoDur [data-dur="15"]').click();
  document.querySelector('#autoStyle [data-style="dyn"]').click();
  document.querySelector('#autoSub [data-sub="1"]').click();
});
const avant = await page.evaluate(async () => (await window.Mine.list()).length);
await page.click('#autoGo');
// pendant la fabrication, on doit VOIR la vidéo se faire (et le temps restant),
// pas fixer un pourcentage : un rendu dure forcément la longueur de la vidéo
await page.waitForFunction(() => {
  const s = document.getElementById('autoScene');
  return s && !s.classList.contains('hidden') && s.querySelector('canvas');
}, null, { timeout: 60000 }).catch(() => {});
const apercu = {
  visible: await page.locator('#autoScene canvas').isVisible().catch(() => false),
  boite: await page.locator('#autoScene canvas').boundingBox().catch(() => null),
  texte: await page.locator('#autoStep').textContent().catch(() => '')
};
chk(apercu.visible && apercu.boite && apercu.boite.width > 200 && apercu.boite.height > 200,
  `on VOIT la vidéo se fabriquer en direct (aperçu ${apercu.boite ? Math.round(apercu.boite.width) + '×' + Math.round(apercu.boite.height) : 'absent'} px) au lieu d'attendre devant un pourcentage`);
chk(/encore \d+ s|se fabrique|à fabriquer/.test(apercu.texte || ''),
  `le temps restant est annoncé en clair (« ${(apercu.texte || '').slice(0, 46)} »)`);
await page.waitForFunction(() => window.Auto._dernier || /n'a pas abouti/.test((document.getElementById('expTitle') || {}).textContent || ''),
  null, { timeout: 120000 }).catch(() => {});
const bilan = await page.evaluate(async () => ({
  d: window.Auto._dernier,
  titre: (document.getElementById('expTitle') || {}).textContent || '',
  desc: (document.getElementById('expDesc') || {}).textContent || '',
  galerie: (await window.Mine.list()).filter(o => o.kind === 'video').length,
  dernier: (await window.Mine.list())[0] || null
}));
const d = bilan.d || {};
chk(!!bilan.d && d.octets > 20000,
  `le montage est vraiment rendu : ${d.octets ? Math.round(d.octets / 1024) + ' Ko' : 'ÉCHEC — ' + bilan.desc} (${d.ext || '?'})`);
chk(d.total > 0 && d.total < d.brut,
  `la vidéo montée est plus courte que les rushes : ${(d.total || 0).toFixed(1)}s pour ${(d.brut || 0).toFixed(1)}s de brut`);
chk((d.coupe || 0) > 1, `les blancs sont réellement enlevés (${(d.coupe || 0).toFixed(1)}s coupés)`);
chk((d.segments || 0) >= 2 && d.clips === 2, `${d.segments} moments gardés, tirés des 2 vidéos`);
chk(bilan.galerie >= 1 && bilan.dernier && bilan.dernier.label === 'Montage auto',
  'la vidéo montée est rangée toute seule dans « Mes créas »');
chk(d.mots === 0 && /Sous-titres\s*:/.test(bilan.desc) && /IA sous-titres|indisponible/i.test(bilan.desc),
  `sans IA joignable, l'app le DIT au lieu de faire semblant (« ${(bilan.desc.match(/Sous-titres[^.]*\./) || [''])[0].slice(0, 80)} »)`);
chk(/Gardé|Enlevé/.test(bilan.desc) && bilan.titre.indexOf('montée') > 0,
  'le compte rendu explique en français simple ce qui a été fait');

chk(errs.length === 0, `0 erreur JS${errs.length ? ': ' + errs[0] : ''}`);
console.log('=== CRÉA STUDIO — MONTAGE AUTO ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length ? 1 : 0);
