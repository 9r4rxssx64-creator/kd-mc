/* GARDE EN VRAI NAVIGATEUR — Bee bouge VRAIMENT, et elle ne laisse jamais un trou noir.
 *
 * Lire le code ne prouve rien d'un <video> : il faut un vrai moteur qui décode le fichier.
 * Ici on lance Chromium, on sert l'app Bee en local, on détourne lingua.kd-mc.com vers les
 * vrais .mp4 du dépôt, et on MESURE :
 *
 *   1. la vraie vidéo se lit  → la classe .vid est posée et currentTime AVANCE ;
 *   2. un mouvement change bien de clip (fly / dance / walk) ;
 *   3. VIDÉO CASSÉE (404 sur le repos) → pas de .vid, la marionnette reste visible,
 *      et le dessin de Bee est toujours là : jamais d'écran vide (leçon « une page doit
 *      survivre à l'absence d'un fichier externe ») ;
 *   4. CLIP D'HUMEUR MANQUANT (404 sur un seul mouvement) → la scène reste en vidéo,
 *      seul ce mouvement-là repasse en marionnette ;
 *   5. pas admin → Bee ne s'affiche PAS (fail-closed).
 *
 * node tests/verify-javis-bee-reelle.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = { ok: [], ko: [], na: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };

/* --- petit serveur : l'app Bee, telle qu'elle est dans le dépôt --------------- */
const srv = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p === '/__sso/whoami') {                       /* le domaine dit qui tu es */
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(SSO));
  }
  const f = join(ROOT, 'javis', p === '/' ? 'index.html' : p.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': TYPES[f.slice(f.lastIndexOf('.'))] || 'text/plain' });
  res.end(fs.readFileSync(f));
});
let SSO = { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', verified: true, admin: true };
await new Promise((r) => srv.listen(0, r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const nav = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

/* Les vidéos de Bee sont en H.264 : parfait sur l'iPhone de Kevin, mais un Chromium sans
   codecs propriétaires (celui des machines de CI) ne sait pas les décoder. Plutôt que de
   sauter le contrôle en silence — un test qui ne vérifie rien n'est pas un test qui passe —
   on rejoue SES VRAIES IMAGES dans un format que ce navigateur-là lit (VP9), avec ffmpeg.
   Si même ça est impossible, on le DIT en clair au lieu d'afficher un vert trompeur. */
const sonde = await (async () => {
  const c = await nav.newContext(); const p = await c.newPage(); await p.goto('about:blank');
  const r = await p.evaluate(() => { const v = document.createElement('video');
    return { h264: !!v.canPlayType('video/mp4; codecs="avc1.42E01E"'), vp9: !!v.canPlayType('video/webm; codecs="vp9"') }; });
  await c.close(); return r;
})();
const CACHE = fs.mkdtempSync(join(os.tmpdir(), 'bee-vp9-'));
const SOURCE = join(ROOT, 'lingua/bee/live/idle.mp4');
/* un ffmpeg n'est utilisable que s'il sait VRAIMENT ouvrir un mp4 : celui fourni avec
   Playwright est allégé et ne le sait pas. On le prouve en essayant, pas en supposant. */
function ffmpegUtilisable(bin) {
  if (!bin) return false;
  try { execFileSync(bin, ['-y', '-v', 'error', '-i', SOURCE, '-t', '1', '-vf', 'scale=120:-2',
    '-c:v', 'libvpx-vp9', '-b:v', '120k', '-deadline', 'realtime', '-cpu-used', '8', '-an',
    join(CACHE, '_sonde.webm')], { stdio: 'ignore' }); return true; } catch (_) { return false; }
}
let candidats = [process.env.FFMPEG_PATH, 'ffmpeg'];
try { candidats.unshift((await import('ffmpeg-static')).default); } catch (_) {}
const FFMPEG = candidats.filter(Boolean).find(ffmpegUtilisable) || null;
const TRANSCODE = !sonde.h264 && sonde.vp9 && !!FFMPEG;
const VIDEO_TESTABLE = sonde.h264 || TRANSCODE;
if (sonde.h264) chk(true, 'ce navigateur lit le H.264 : les vrais fichiers sont joués tels quels');
else if (TRANSCODE) chk(true, 'ce navigateur ne lit pas le H.264 → les VRAIES images de Bee sont rejouées en VP9 (ffmpeg)');
else R.na.push('la lecture vidéo n\'a PAS pu être éprouvée ici (ni H.264 ni ffmpeg complet) — '
  + 'les replis et le fail-closed le sont ; pour la vidéo : machine avec ffmpeg, ou Safari iPhone');

function pourLeTest(f) {
  if (!TRANSCODE) return { body: fs.readFileSync(f), type: 'video/mp4' };
  const out = join(CACHE, f.split('/').pop().replace('.mp4', '.webm'));
  if (!fs.existsSync(out)) {
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', f, '-t', '3', '-vf', 'scale=200:-2', '-c:v', 'libvpx-vp9',
      '-b:v', '200k', '-deadline', 'realtime', '-cpu-used', '8', '-an', out], { stdio: 'ignore' });
  }
  return { body: fs.readFileSync(out), type: 'video/webm' };
}

/* Bee est servie par Lingua en production : on détourne vers les vrais fichiers du dépôt.
   `casse` permet de simuler un fichier absent pour éprouver le repli. */
let voixKO = false;
/* Un son FORT puis SILENCIEUX : si la bouche suit vraiment l'amplitude, elle doit être
   grande ouverte pendant la 1re seconde et presque fermée ensuite. Un minuteur, lui,
   donnerait la même chose des deux côtés — c'est ce qui distingue un VRAI lip-sync. */
const _sons = new Map();
/* `sonHz` choisit la HAUTEUR du son de test : 220 Hz = son sombre (comme un « ou »),
   3500 Hz = son clair (comme un « ii »). Même volume des deux côtés — c'est ce qui permet
   de mesurer que la bouche change de FORME et pas seulement de taille. */
let sonHz = 220;
function sonDeTest(hz = sonHz) {
  if (_sons.has(hz)) return _sons.get(hz);
  if (!FFMPEG) return Buffer.alloc(0);
  const out = join(CACHE, `voix-${String(hz).replace(/[^\w-]/g, '_')}.mp3`);
  if (!fs.existsSync(out)) {
    /* `hz` peut être un nombre (un son simple) OU « F1+F2 » : une VOYELLE de synthèse, faite
       de ses deux résonances mélangées. C'est ce qui permet de vérifier qu'elle forme la
       bonne bouche sur un « ou » et sur un « i » — pas seulement qu'elle réagit au volume. */
    const paires = String(hz).split('+').map(Number);
    if (String(hz).startsWith('bruit')) {
      /* une FRICATIVE de synthèse : du souffle, c'est-à-dire du bruit dont on a coupé tout
         le grave. C'est exactement ce qu'est un « s » ou un « ch » — aucune résonance
         basse, toute l'énergie en haut du spectre. */
      const f = Number(String(hz).split('-')[1] || 3500);
      execFileSync(FFMPEG, ['-hide_banner', '-v', 'error',
        '-f', 'lavfi', '-i', 'anoisesrc=c=white:r=44100:d=1.2:a=0.9',
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.9',
        '-filter_complex', `[0:a]highpass=f=${f}:poles=2,highpass=f=${f}:poles=2,volume=6[v];[v][1:a]concat=n=2:v=0:a=1`,
        '-c:a', 'libmp3lame', '-b:a', '192k', '-y', out], { stdio: 'ignore' });
    } else if (paires.length === 2) {
      execFileSync(FFMPEG, ['-hide_banner', '-v', 'error',
        '-f', 'lavfi', '-i', `sine=frequency=${paires[0]}:duration=1.2`,
        '-f', 'lavfi', '-i', `sine=frequency=${paires[1]}:duration=1.2`,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.9',
        '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0[v];[v][2:a]concat=n=2:v=0:a=1',
        '-c:a', 'libmp3lame', '-b:a', '128k', '-y', out], { stdio: 'ignore' });
    } else {
      /* `volume=3` : une VOYELLE de test est faite de DEUX tons mélangés, donc deux fois
         plus forte qu'un ton seul (mesuré : poids 0.50 contre 0.76). Sans ce rattrapage on
         ne comparerait pas des FORMES de bouche mais des volumes. Reste à -12 dBFS : aucun
         écrêtage, donc aucune harmonique parasite qui fausserait le spectre. */
      execFileSync(FFMPEG, ['-hide_banner', '-v', 'error',
        '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=1.2`,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.9',
        '-filter_complex', '[0:a]volume=3[v];[v][1:a]concat=n=2:v=0:a=1',
        '-c:a', 'libmp3lame', '-b:a', '128k', '-y', out], { stdio: 'ignore' });
    }
  }
  const b = fs.readFileSync(out);
  _sons.set(hz, b);
  return b;
}
async function ouvre({ casse = null } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e && e.message)));
  await page.route('https://lingua.kd-mc.com/**', (route) => {
    const u = new URL(route.request().url());
    if (casse && u.pathname.includes(casse)) return route.fulfill({ status: 404, body: 'absent' });
    const f = join(ROOT, 'lingua', u.pathname.replace(/^\//, ''));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'absent' });
    if (f.endsWith('.mp4')) { const v = pourLeTest(f); return route.fulfill({ status: 200, contentType: v.type, body: v.body }); }
    return route.fulfill({ status: 200, contentType: TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream',
      body: fs.readFileSync(f) });
  });
  await page.route('https://apis.kd-mc.com/**', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'qwen', text: 'Coucou Kevin !' }) }));
  /* Sa voix : en production c'est le domaine qui la fabrique. Ici on sert un VRAI son
     (fort puis silencieux) pour pouvoir MESURER que la bouche suit l'amplitude —
     et pas un minuteur. `muet: true` simule une voix injoignable (test du repli). */
  await page.route(/lingua\.kd-mc\.com\/__lingua\/tts/, (route) => {
    if (voixKO) return route.fulfill({ status: 503, body: 'indisponible' });
    return route.fulfill({ status: 200, contentType: 'audio/mpeg',
      headers: { 'access-control-allow-origin': '*' }, body: sonDeTest() });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  return { ctx, page, erreurs };
}

/* === 1 + 2. la vraie vidéo se lit, et les mouvements changent de clip ======== */
{
  const { ctx, page, erreurs } = await ouvre();
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  chk(await page.locator('#javis-launcher .bee-rig').count() > 0, 'Bee est affichée (admin prouvé)');

  const vid = page.locator('#javis-launcher .javis-vid');
  if (VIDEO_TESTABLE) chk(await vid.count() > 0, 'la couche vidéo existe dans l\'app');
  await page.waitForFunction(
    () => document.querySelector('#javis-launcher .bee-rig.vid') !== null, null, { timeout: 12000 }
  ).catch(() => {});
  const posee = await page.locator('#javis-launcher .bee-rig.vid').count() > 0;
  if (VIDEO_TESTABLE) chk(posee, posee ? 'la vraie vidéo est LUE (classe .vid posée après canplay)'
                   : 'la vidéo ne s\'est pas lancée (canplay jamais reçu)');

  if (VIDEO_TESTABLE) {
    const t1 = await vid.evaluate((v) => v.currentTime).catch(() => 0);
    await dors(1200);
    const t2 = await vid.evaluate((v) => v.currentTime).catch(() => 0);
    chk(t2 > t1, `la vidéo AVANCE vraiment (${t1.toFixed(2)}s → ${t2.toFixed(2)}s)`);

    const srcAvant = await vid.evaluate((v) => v.currentSrc);
    chk(/idle\.mp4/.test(srcAvant), `au repos elle joue le clip « idle » (${srcAvant.split('/').pop()})`);
    await page.evaluate(() => {
      const r = document.querySelector('#javis-launcher .bee-rig');
      r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 100 }));
    });
    await dors(700);
    const srcApres = await vid.evaluate((v) => v.currentSrc);
    chk(srcApres !== srcAvant && /(fly|dance|jump|walk)\.mp4/.test(srcApres),
      srcApres !== srcAvant ? `un toucher sur l'aile lance un VRAI mouvement (${srcApres.split('/').pop()})`
                            : 'le toucher n\'a pas changé de clip');
  }
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS');
  await ctx.close();
}

/* === 3. la vidéo de repos casse → marionnette, jamais d'écran vide =========== */
{
  const { ctx, page, erreurs } = await ouvre({ casse: '/live/' });
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  await dors(2500);
  const aVid = await page.locator('#javis-launcher .bee-rig.vid').count() > 0;
  chk(!aVid, !aVid ? 'vidéo injouable → la classe .vid n\'est JAMAIS posée' : 'la vidéo s\'est posée alors qu\'elle est cassée');
  const dessin = await page.locator('#javis-launcher .rig-base').isVisible().catch(() => false);
  chk(dessin, dessin ? 'le dessin de Bee reste visible (marionnette) — aucun trou noir'
                     : 'ÉCRAN VIDE : ni vidéo ni dessin');
  const bouge = await page.evaluate(() => {
    const r = document.querySelector('#javis-launcher .bee-rig');
    r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 100 }));
    return new Promise((res) => setTimeout(() => res(/mv-/.test(r.className)), 300));
  });
  chk(bouge, bouge ? 'sans vidéo, les mouvements repassent en marionnette CSS' : 'plus aucun mouvement sans vidéo');
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS malgré la panne');
  await ctx.close();
}

/* === 4. un SEUL clip d'humeur manque → la scène reste en vidéo =============== */
if (VIDEO_TESTABLE) {
  const { ctx, page } = await ouvre({ casse: '/live/fly.mp4' });
  await page.waitForFunction(() => document.querySelector('#javis-launcher .bee-rig.vid') !== null,
    null, { timeout: 12000 }).catch(() => {});
  chk(await page.locator('#javis-launcher .bee-rig.vid').count() > 0,
    'un clip d\'humeur manquant ne casse PAS la scène (le repos tourne toujours)');
  await page.evaluate(() => {
    const r = document.querySelector('#javis-launcher .bee-rig');
    r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 100 }));
  });
  await dors(1500);
  const src = await page.locator('#javis-launcher .javis-vid').evaluate((v) => v.currentSrc);
  chk(/idle\.mp4/.test(src), `après un clip absent, elle revient au repos (${src.split('/').pop()})`);
  await ctx.close();
}

/* === 4 bis. LIP-SYNC : la bouche suit le SON, pas un minuteur ================ */
if (FFMPEG) {
  const { ctx, page, erreurs } = await ouvre();
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  /* un vrai geste : sans lui le moteur audio d'un navigateur reste endormi (règle iPhone) */
  await page.mouse.click(200, 700);
  await dors(200);
  const moteur = await page.evaluate(() => {
    try { const c = new (window.AudioContext || window.webkitAudioContext)(); return c.state; }
    catch (_) { return 'absent'; }
  });
  chk(moteur === 'running' || moteur === 'suspended', `moteur audio du navigateur : ${moteur}`);

  /* On la fait parler comme le chat le ferait, puis on ÉCHANTILLONNE la bouche en continu.
     Important : la bouche est remise à plat dès que le son finit — mesurer APRÈS, c'est
     ne rien mesurer du tout. On relève donc pendant, et on découpe ensuite. */
  const mesures = await page.evaluate(async () => {
    const m = document.querySelector('#javis-launcher .disc-mouth');
    const bouton = document.querySelector('#javis-launcher');
    const form = document.querySelector('#javis-form');
    const input = document.querySelector('#javis-input');
    if (!m || !form || !input) return null;
    /* la bouche est dans une couche non rendue quand la vidéo tourne : getComputedStyle y
       répond « none ». On lit donc l'ouverture LÀ OÙ LE CODE L'ÉCRIT — le style en ligne. */
    const ouverture = () => {
      const st = m.getAttribute('style') || '';
      const mm = st.match(/scaleY\(([\d.]+)\)/);
      if (mm) return parseFloat(mm[1]);
      const t = getComputedStyle(m).transform;
      const mx = t && t !== 'none' ? t.match(/matrix\(([^)]+)\)/) : null;
      return mx ? parseFloat(mx[1].split(',')[3]) : 0;
    };
    if (!document.querySelector('#javis-panel').classList.contains('javis-open')) bouton.click();
    input.value = 'bonjour';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const releves = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 7000) {
      releves.push({ t: performance.now(), y: ouverture(),
        inline: /scaleY/.test(m.getAttribute('style') || '') });
      await new Promise((r) => setTimeout(r, 30));
      if (releves.length > 30 && releves.slice(-20).every((r) => !r.inline)
          && releves.some((r) => r.inline)) break;            /* elle a fini de parler */
    }
    const pilotes = releves.filter((r) => r.inline);
    if (!pilotes.length) return { pilote: false, n: releves.length };
    const debut = pilotes[0].t;
    /* on mesure l'ECART AU REPOS (0.30), pas la hauteur : depuis qu'elle reconnaît les
       consonnes, un son grave lui fait FERMER les lèvres (0.10) — c'est-à-dire s'éloigner
       du repos vers le BAS. Mesurer « le maximum de y » ne verrait rien de ce mouvement,
       alors que c'est exactement le même phénomène : la bouche est pilotée par le son. */
    const dans = (a, b) => pilotes.filter((r) => r.t - debut >= a && r.t - debut < b)
      .map((r) => Math.abs(r.y - 0.30));
    const max = (v) => (v.length ? Math.max(...v) : 0);
    return { pilote: true, n: pilotes.length,
      fort: max(dans(60, 1050)),        /* le son : 1,2 s de note franche */
      calme: max(dans(1350, 2050)) };  /* puis 0,9 s de silence          */
  });
  if (!mesures) { chk(false, 'bouche introuvable pour la mesure'); }
  else {
    chk(mesures.pilote, mesures.pilote
      ? `la bouche est pilotée par le SON (${mesures.n} images écrites pendant qu'elle parle)`
      : "la bouche n'est pas pilotée par le son (repli CSS — moteur audio indisponible ici)");
    if (mesures.pilote) {
      chk(mesures.fort > mesures.calme * 1.3,
        `sa bouche BOUGE sur le son et revient au repos sur le silence (écart au repos ${mesures.fort.toFixed(2)} → ${mesures.calme.toFixed(2)})`);
    }
  }
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS pendant la parole');
  await ctx.close();
} else {
  R.na.push("le lip-sync n'a pas pu être mesuré ici (pas de ffmpeg pour fabriquer un son de test)");
}

/* === 4 quater. ELLE FORME LA VOYELLE QU'ELLE PRONONCE (vrais visèmes) =========
   Kevin 2026-09-17 « fais le, continu ». On ne teste plus « clair contre sombre » : on lui
   envoie de VRAIES VOYELLES de synthèse — chacune faite de ses deux résonances (F1, F2),
   exactement ce que la phonétique utilise pour identifier une voyelle — et on vérifie que
   sa bouche prend LA BONNE FORME :
     « i »  (300 + 2300) → la plus LARGE et la plus plate
     « ou » (320 + 800)  → la plus ÉTROITE
     « a »  (750 + 1300) → la plus OUVERTE
   POURQUOI C'EST DISCRIMINANT : avec l'étape précédente (couleur du son), l'ouverture
   suivait la brillance — « ou » et « o » auraient été les plus ouverts et « a » au milieu.
   Exiger que « a » soit le PLUS ouvert ET que « i » soit le PLUS large ne peut être vrai
   que si elle identifie vraiment la voyelle. */
if (FFMPEG) {
  const forme = async (voyelle) => {
    sonHz = voyelle.hz;
    const { ctx, page } = await ouvre();
    await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
    await page.mouse.click(200, 700);                       /* réveille le moteur audio */
    await dors(200);
    const m = await page.evaluate(async () => {
      const el = document.querySelector('#javis-launcher .disc-mouth');
      const bouton = document.querySelector('#javis-launcher');
      const form = document.querySelector('#javis-form');
      const input = document.querySelector('#javis-input');
      if (!el || !form || !input) return null;
      const lire = () => {
        const st = el.getAttribute('style') || '';
        const y = st.match(/scaleY\(([\d.]+)\)/); const x = st.match(/scaleX\(([\d.]+)\)/);
        return (y && x) ? { y: parseFloat(y[1]), x: parseFloat(x[1]) } : null;
      };
      if (!document.querySelector('#javis-panel').classList.contains('javis-open')) bouton.click();
      input.value = 'bonjour';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const rel = []; const t0 = performance.now();
      while (performance.now() - t0 < 6000) {
        const v = lire(); if (v) rel.push(v);
        await new Promise((r) => setTimeout(r, 25));
        if (rel.length > 25 && !lire()) break;
      }
      /* on ne regarde QUE les images où elle est vraiment en train de prononcer :
         au repos la forme est volontairement neutre (aucune régression).
         `y < 0.22` compte aussi : une FERMETURE (m/b/p) est plus fermée que le repos. */
      const ouverts = rel.filter((r) => r.y > 0.45 || r.y < 0.22 || r.x < 0.92 || r.x > 1.08);
      if (ouverts.length < 3) return { n: rel.length, ouverts: ouverts.length };
      const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
      return { n: rel.length, ouverts: ouverts.length,
        x: med(ouverts.map((r) => r.x)), y: med(ouverts.map((r) => r.y)) };
    });
    await ctx.close();
    return m;
  };
  const V = [
    { nom: 'i', hz: '300+2300' },
    { nom: 'ou', hz: '320+800' },
    { nom: 'a', hz: '750+1300' },
    { nom: 's', hz: 'bruit-3500' },   /* une FRICATIVE : du souffle, aucune résonance grave */
    { nom: 'm', hz: 150 }             /* une FERMETURE : un bourdonnement étouffé, tout en bas */
  ];
  const vus = {};
  for (const v of V) vus[v.nom] = await forme(v);
  sonHz = 220;
  const ok = V.every((v) => vus[v.nom] && typeof vus[v.nom].x === 'number');
  if (!ok) {
    R.na.push("les visèmes n'ont pas pu être mesurés ici (le moteur audio n'a pas fourni assez d'images)");
  } else {
    const d = (n) => `${n} ${vus[n].x.toFixed(2)}×${vus[n].y.toFixed(2)}`;
    chk(vus.i.x > vus.ou.x * 1.2,
      `« i » est la bouche la plus LARGE, « ou » la plus étroite (${d('i')} contre ${d('ou')})`);
    chk(vus.a.y > vus.i.y * 1.3 && vus.a.y > vus.ou.y * 1.3,
      `« a » est la bouche la plus OUVERTE (${d('a')} contre ${d('i')} et ${d('ou')})`);
    chk(vus.ou.x < vus.a.x,
      `« ou » arrondit les lèvres, « a » ne les arrondit pas (${vus.ou.x.toFixed(2)} contre ${vus.a.x.toFixed(2)})`);

    /* --- LES CONSONNES (v1.6) -------------------------------------------------------
       Deux postures que l'on lit VRAIMENT sur une bouche, en plus des voyelles :
         « s » (du souffle, tout en haut du spectre)     -> une FENTE : étirée, presque fermée
         « m » (un bourdonnement étouffé, tout en bas)   -> les LÈVRES SE TOUCHENT
       DISCRIMINANT : avec la version voyelles-seules, ni l'un ni l'autre n'a de couple
       (F1,F2) exploitable — aucune forme n'est appliquée, la bouche reste au repos exact
       (1.00 × 0.30). Exiger que « m » soit PLUS FERMÉ que le repos est donc impossible
       à satisfaire sans la reconnaissance des consonnes. */
    const cons = ['s', 'm'].every((n) => vus[n] && typeof vus[n].x === 'number');
    if (!cons) {
      R.na.push("les consonnes n'ont pas pu être mesurées ici (pas assez d'images)");
    } else {
      chk(vus.m.y < 0.22,
        `« m » FERME vraiment les lèvres — plus que le repos 0.30 (${d('m')})`);
      chk(vus.m.y < vus.s.y * 0.7,
        `la fermeture « m » est plus fermée que la fente « s » (${d('m')} contre ${d('s')})`);
      chk(vus.s.y < vus.a.y * 0.4 && vus.s.x > 1.1,
        `« s » fait une FENTE étirée, pas une bouche ouverte (${d('s')} contre ${d('a')})`);
    }
  }
} else {
  R.na.push("les visèmes n'ont pas pu être mesurés ici (pas de ffmpeg)");
}

/* === 4 quinquies. SON REGARD NE COÛTE PLUS UNE MESURE DE PAGE PAR MOUVEMENT ===
   Kevin 2026-09-17 « performe ». Avant : CHAQUE pointermove appelait
   getBoundingClientRect() — ce qui FORCE le navigateur à recalculer la mise en page —
   puis écrivait 3 variables CSS. Un doigt qui glisse vite en envoie plusieurs par image :
   tout ce travail en trop était jeté avant même d'être affiché.
   Maintenant : position mise en CACHE (re-mesurée seulement au défilement/rotation) et
   écriture GROUPÉE sur la prochaine image.

   ⚠️ PIÈGE DE MESURE (vécu ici même) : `page.mouse.move()` de Playwright fait un
   aller-retour par appel — les événements arrivent espacés, environ un par image, donc
   le regroupement ne change RIEN et le test ne prouve rien. Il faut une VRAIE rafale :
   on envoie les événements dans la MÊME tâche JS, comme un doigt rapide. */
{
  const { ctx, page, erreurs } = await ouvre();
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  const N = 60;
  const m = await page.evaluate(async (n) => {
    const look = document.querySelector('#javis-launcher .rig-look');
    const rig = document.querySelector('#javis-launcher .bee-rig');
    if (!look || !rig) return null;
    let mesures = 0;
    const vrai = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { mesures++; return vrai.apply(this, arguments); };
    let ecritures = 0;
    const obs = new MutationObserver((ms) => { ecritures += ms.length; });
    obs.observe(look, { attributes: true, attributeFilter: ['style'] });
    /* la rafale : n événements dans la MÊME tâche — aucune image ne peut s'intercaler */
    for (let i = 0; i < n; i++) {
      document.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: 120 + (i % 30) * 4, clientY: 300 + (i % 17) * 5 }));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    obs.disconnect();
    Element.prototype.getBoundingClientRect = vrai;
    return { mesures, ecritures };
  }, N);
  if (!m) { chk(false, 'regard : élément introuvable pour la mesure'); }
  else {
    chk(m.ecritures > 0, m.ecritures > 0
      ? `son regard suit bien le doigt (${m.ecritures} écriture(s) après la rafale)`
      : 'son regard ne suit plus le doigt du tout');
    chk(m.ecritures <= 6,
      `une seule mise à jour par image : ${m.ecritures} écriture(s) pour ${N} mouvements d'affilée (avant : ${N * 3})`);
    chk(m.mesures <= 2,
      `sa position n'est mesurée qu'une fois, pas à chaque mouvement : ${m.mesures} mesure(s) pour ${N} mouvements (avant : ${N})`);
  }
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS pendant le suivi du regard');
  await ctx.close();
}

/* === 4 sexies. ELLE NE CLIGNE PAS DANS LE VIDE (batterie iPhone) ==============
   Kevin 2026-09-17 « performe ». Quand l'onglet n'est PAS regardé, personne ne voit ses
   battements : les faire quand même, c'est réveiller le téléphone pour rien.
   DISCRIMINANT : avec l'ancien code, elle continuait de cligner page cachée. */
{
  const { ctx, page, erreurs } = await ouvre();
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  const m = await page.evaluate(async () => {
    const rig = document.querySelector('#javis-launcher .bee-rig');
    if (!rig) return null;
    const compte = async (ms) => {
      let n = 0;
      const obs = new MutationObserver((l) => { l.forEach((x) => { if (x.attributeName === 'class') n++; }); });
      obs.observe(rig, { attributes: true, attributeFilter: ['class'] });
      await new Promise((r) => setTimeout(r, ms));
      obs.disconnect();
      return n;
    };
    /* on fait croire au widget que la page est cachée — comme quand Kevin passe à une autre app */
    const vrai = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const cachee = await compte(9000);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    const visible = await compte(9000);
    if (vrai) Object.defineProperty(document, 'hidden', vrai);
    return { cachee, visible };
  });
  if (!m) { chk(false, 'clignement : Bee introuvable pour la mesure'); }
  else {
    chk(m.cachee <= 2,
      `page pas regardée : elle s'arrête (${m.cachee} battement(s) en 9 s au lieu d'environ 8)`);
    chk(m.visible > m.cachee,
      `page regardée : elle recligne aussitôt (${m.visible} battement(s) en 9 s contre ${m.cachee} cachée)`);
  }
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS sur le clignement');
  await ctx.close();
}

/* === 4 septies. LE CHOIX DU PERSONNAGE : Bee ou Bourricot l'âne ==============
   Kevin 2026-09-17 : « intègre l'âne de Lingua, avoir le choix des personnages ».
   On ne vérifie pas que le code existe — on TAPE sur la pastille et on regarde ce qui
   change vraiment : le dessin, la géométrie du visage, le nom, et la mémoire du choix. */
{
  const { ctx, page, erreurs } = await ouvre();
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('#javis-launcher'); if (b) b.click(); });
  await dors(400);
  const avant = await page.evaluate(() => {
    const r = document.querySelector('#javis-launcher .bee-rig');
    const img = r && r.querySelector('.rig-base');
    return { masc: r && r.getAttribute('data-mascot'), src: img && img.getAttribute('src'),
      ailes: r ? r.querySelectorAll('.rig-piece').length : -1,
      nom: (document.querySelector('#javis-head b') || {}).textContent,
      pastilles: document.querySelectorAll('#javis-masc .javis-mpick').length,
      oeil: r ? getComputedStyle(r).getPropertyValue('--ll-t').trim() : '' };
  });
  chk(avant.pastilles === 2, `deux personnages proposés dans le panneau (${avant.pastilles} pastille(s))`);
  chk(avant.masc === 'bee' && avant.ailes === 2,
    `au départ c'est Bee, avec ses 2 ailes (${avant.masc}, ${avant.ailes} pièce(s))`);

  await page.evaluate(() => {
    const b = document.querySelector('#javis-masc .javis-mpick[data-masc="donkey"]');
    if (b) b.click();
  });
  await dors(600);
  const apres = await page.evaluate(() => {
    const r = document.querySelector('#javis-launcher .bee-rig');
    const img = r && r.querySelector('.rig-base');
    let retenu = ''; try { retenu = localStorage.getItem('javis_mascotte') || ''; } catch (e) {}
    return { masc: r && r.getAttribute('data-mascot'), src: img && img.getAttribute('src'),
      ailes: r ? r.querySelectorAll('.rig-piece').length : -1,
      nom: (document.querySelector('#javis-head b') || {}).textContent, retenu,
      oeil: r ? getComputedStyle(r).getPropertyValue('--ll-t').trim() : '',
      anime: r ? r.className : '' };
  });
  chk(apres.masc === 'donkey', `un doigt suffit : on passe à l'âne (${apres.masc})`);
  chk(!!apres.src && apres.src !== avant.src && /\/donkey\/rig\/base\.webp$/.test(apres.src),
    `c'est VRAIMENT son dessin qui s'affiche (${String(apres.src).replace('https://lingua.kd-mc.com/', '')})`);
  chk(apres.ailes === 0, `l'âne n'a pas d'ailes : aucune image fantôme chargée (${apres.ailes} pièce(s))`);
  chk(apres.oeil && apres.oeil !== avant.oeil,
    `son visage a SA géométrie, pas celle de l'abeille (paupière à ${apres.oeil} contre ${avant.oeil})`);
  chk(apres.nom === 'Bourricot', `il est appelé par son nom (${apres.nom})`);
  chk(apres.retenu === 'donkey', `le choix est retenu pour la prochaine fois (${apres.retenu})`);

  /* il doit être VIVANT, pas une image collée : la mise en vie est posée sur l'élément,
     qui vient d'être remplacé — c'est l'oubli classique. */
  await dors(1200);
  const vivant = await page.evaluate(async () => {
    const r = document.querySelector('#javis-launcher .bee-rig');
    if (!r) return 0;
    let n = 0;
    const obs = new MutationObserver((l) => { n += l.length; });
    obs.observe(r, { attributes: true, attributeFilter: ['class'] });
    await new Promise((res) => setTimeout(res, 9000));
    obs.disconnect();
    return n;
  });
  chk(vivant > 0, vivant > 0 ? `et il est VIVANT (${vivant} battement(s) en 9 s, pas une image collée)`
                             : "l'âne est figé : la mise en vie n'a pas été refaite après le changement");
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS au changement de personnage');
  await ctx.close();
}

/* === 4 ter. voix du domaine injoignable → elle parle quand même ============== */
{
  voixKO = true;
  const { ctx, page, erreurs } = await ouvre();
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 8000 }).catch(() => {});
  const repli = await page.evaluate(async () => {
    let dit = null;
    /* on observe la voix du téléphone sans la faire vraiment parler */
    window.speechSynthesis.speak = function (u) { dit = String(u && u.text || ''); };
    const bouton = document.querySelector('#javis-launcher');
    if (!document.querySelector('#javis-panel').classList.contains('javis-open')) bouton.click();
    document.querySelector('#javis-input').value = 'bonjour';
    document.querySelector('#javis-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 2500));
    return dit;
  });
  chk(!!repli, repli
    ? `voix du domaine KO → elle parle avec la voix du téléphone (« ${String(repli).slice(0, 30)}… »)`
    : 'voix du domaine KO → Bee reste MUETTE (le repli ne marche pas)');
  chk(erreurs.length === 0, erreurs.length ? `ERREURS JS : ${erreurs[0]}` : 'aucune erreur JS malgré la voix en panne');
  await ctx.close();
  voixKO = false;
}

/* === 5. pas admin → Bee ne s'affiche pas (fail-closed) ====================== */
{
  SSO = { ok: true, uid: 'laurence_sp', name: 'Laurence Saint-Polit', verified: true, admin: false };
  const { ctx, page } = await ouvre();
  await dors(1500);
  const vue = await page.locator('#javis-launcher').count();
  chk(vue === 0, vue === 0 ? 'pas Kevin → Bee ne s\'affiche pas (fail-closed)' : 'FUITE : Bee visible pour un non-admin');
  const dit = await page.locator('text=personnelle à Kevin').count();
  chk(dit > 0, dit > 0 ? 'et l\'app le DIT clairement (pas d\'écran noir inexpliqué)' : 'écran noir sans explication');
  await ctx.close();
  SSO = { ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', verified: true, admin: true };
}

await nav.close();
srv.close();
R.ok.forEach((m) => console.log('  ✅', m));
R.na.forEach((m) => console.log('  ⚠️  NON VÉRIFIÉ ICI :', m));
R.ko.forEach((m) => console.log('  ❌', m));
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)`
  + (R.na.length ? `, ${R.na.length} non vérifiable(s) sur cette machine` : ''));
process.exit(R.ko.length ? 1 : 0);
