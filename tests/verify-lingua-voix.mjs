/* PREUVE — les voix de KDMC Lingua : langue, vitesse, intonation, prononciation.
 * ===========================================================================
 * Kevin 2026-09-03 : « Vérifie les voix, là. Vitesse, l'intonation, prononciation. »
 *
 * On charge la VRAIE page dans un vrai navigateur, avec :
 *   · un téléphone SIMULÉ portant une liste de voix réaliste (iPhone) ;
 *   · la voix « en ligne » COUPÉE — c'est l'état réel aujourd'hui, puisqu'elle
 *     passe par lingua.kd-mc.com, domaine indisponible ;
 *   · chaque phrase prononcée capturée : texte, langue, voix choisie, vitesse,
 *     hauteur. On mesure ce que Kevin ENTEND, on ne lit pas le code.
 *
 * Ce qu'on exige :
 *   1. le mot à apprendre est dit par une voix DE SA LANGUE (une voix française
 *      lisant de l'anglais = accent faux, mot méconnaissable — plainte de Kevin
 *      du 11.08) ;
 *   2. il est dit LÉGÈREMENT RALENTI (0,80–0,95) : c'est un mot à apprendre ;
 *   3. sa HAUTEUR n'est pas trafiquée (les effets « mignons » de la mascotte ne
 *      doivent jamais toucher le vocabulaire) ;
 *   4. si le téléphone n'a aucune voix de cette langue, l'app le DIT au lieu de
 *      massacrer le mot ;
 *   5. démarrage à froid (le téléphone n'a pas encore chargé ses voix) : l'app
 *      ne doit pas accuser à tort le téléphone.
 *
 * Lancer : node tests/verify-lingua-voix.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PAGE = 'file://' + process.cwd() + '/lingua/index.html';

/* Voix telles qu'un iPhone français les expose (échantillon réaliste) */
const VOIX_IPHONE = [
  { name: 'Thomas', lang: 'fr-FR', localService: true },
  { name: 'Amélie', lang: 'fr-CA', localService: true },
  { name: 'Samantha', lang: 'en-US', localService: true },
  { name: 'Daniel', lang: 'en-GB', localService: true },
  { name: 'Siri Voice 4 (Enhanced)', lang: 'en-US', localService: true },
  { name: 'Mónica', lang: 'es-ES', localService: true },
  { name: 'Alice', lang: 'it-IT', localService: true },
  { name: 'Anna', lang: 'de-DE', localService: true },
];

const nav = await chromium.launch();
const ctx = await nav.newContext();

async function parle({ cours, voix = VOIX_IPHONE, froid = false }) {
  const page = await ctx.newPage();
  await page.addInitScript(([c, vs, fr]) => {
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Kevin', avatar: '🐝', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('a1'));
    localStorage.setItem('lingua_a_a1_course', JSON.stringify(c));
    /* SANS cette clé, l'app plante au démarrage — « Cannot read properties of undefined
       (reading 'u0-0') » — et rend une page BLANCHE : aucun bouton, donc le test attendait
       15 s un 🔊 qui ne pouvait pas exister (mesuré 10.09 : le parcours utilisateur réel,
       lui, l'affiche bien — c'était le montage du test qui était périmé, pas l'app).
       Il faut la progression DE LA LANGUE testée : `{}` seul ne suffit pas. */
    localStorage.setItem('lingua_a_a1_prog', JSON.stringify({ [c]: {} }));
    localStorage.setItem('lingua_a_a1_sound', JSON.stringify(true));
    localStorage.setItem('lingua_a_a1_voice', JSON.stringify('coral'));  /* une voix « en ligne » */
    window.__dit = [];
    /* la voix EN LIGNE est coupée : c'est l'état réel (domaine indisponible) */
    window.Audio = function () {
      const o = { play: () => Promise.reject(new Error('reseau')), pause() {}, addEventListener() {}, currentTime: 0, paused: true };
      setTimeout(() => { if (o.onerror) o.onerror(); }, 5);
      return o;
    };
    /* La vraie classe du navigateur REFUSE qu'on lui affecte une voix qui n'est
       pas une SpeechSynthesisVoice — l'app le fait dans un try/catch, donc
       l'erreur serait avalée et on ne mesurerait RIEN. On la remplace par une
       classe simple pour que l'affectation passe, comme sur un vrai téléphone. */
    window.SpeechSynthesisUtterance = function (t) {
      this.text = t; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1;
      this.onend = null; this.onerror = null;
    };
    /* téléphone simulé : au 1er appel la liste peut être VIDE (iOS charge ses
       voix en différé) — c'est le cas « démarrage à froid » */
    let appels = 0;
    const liste = vs.map((v) => Object.assign({ voiceURI: v.name, default: false }, v));
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false, paused: false, pending: false,
        getVoices: () => (fr && appels++ === 0 ? [] : liste),
        cancel() {}, pause() {}, resume() {},
        speak(u) {
          window.__dit.push({ texte: String(u.text || '').slice(0, 40), lang: u.lang,
            voix: u.voice ? u.voice.name : null, vitesse: u.rate, hauteur: u.pitch });
          setTimeout(() => { if (u.onend) u.onend(); }, 5);
        },
        addEventListener() {}, removeEventListener() {},
      },
    });
  }, [cours, voix, froid]);

  await page.goto(PAGE);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '🔊'),
    null, { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '🔊').click());
  await page.waitForTimeout(1200);
  const dit = await page.evaluate(() => window.__dit || []);
  const toasts = (await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent))).join(' | ');
  await page.close();
  return { dit, toasts };
}

/* --- 1/2/3. chaque langue est dite par une voix de CETTE langue -------------- */
const ATTENDU = { en: 'en', es: 'es', it: 'it', de: 'de' };
for (const [cours, base] of Object.entries(ATTENDU)) {
  const { dit } = await parle({ cours });
  /* le MOT à apprendre = la phrase demandée dans la langue du cours. Bee, elle,
     parle en français juste après : ce n'est pas elle qu'on juge ici. */
  const u = dit.find((x) => String(x.lang || '').startsWith(base));
  if (!u) { chk(false, `1. cours « ${cours} » : rien n'a été prononcé dans la langue (${JSON.stringify(dit.map((x) => x.lang))})`); continue; }
  /* Chaque phrase ne doit être dite QU'UNE FOIS. Mesuré le 3.09 avant correctif :
     le mot partait 2 fois à 1 ms d'écart (onerror + play().catch tous les deux)
     puis une 3e fois 2,5 s après (le chronomètre) → début haché et répétition. */
  const paquets = {};
  dit.forEach((x) => { paquets[x.texte] = (paquets[x.texte] || 0) + 1; });
  const doubles = Object.entries(paquets).filter(([, n]) => n > 1);
  chk(doubles.length === 0,
    doubles.length === 0
      ? `0. cours « ${cours} » : chaque phrase dite UNE seule fois (${dit.length} prise(s) de parole)`
      : `0. cours « ${cours} » : phrase(s) répétée(s) → ${doubles.map(([t, n]) => `« ${t.slice(0, 22)} » ×${n}`).join(', ')}`);
  chk(String(u.lang || '').startsWith(base),
    `1. cours « ${cours} » : demandé en ${u.lang} (attendu ${base}-…)`);
  chk(u.voix && VOIX_IPHONE.find((v) => v.name === u.voix && v.lang.startsWith(base)),
    `1. cours « ${cours} » : voix retenue « ${u.voix} » — bien une voix ${base}`);
  chk(u.vitesse >= 0.8 && u.vitesse <= 0.95,
    `2. cours « ${cours} » : vitesse ${u.vitesse} (ralenti pour apprendre, 0,80–0,95)`);
  chk(u.hauteur === undefined || u.hauteur === 1,
    `3. cours « ${cours} » : hauteur ${u.hauteur === undefined ? 'non touchée' : u.hauteur} — le vocabulaire n'est pas déformé`);
}

/* --- 1bis. la MEILLEURE voix disponible est préférée ------------------------ */
{
  const { dit } = await parle({ cours: 'en' });
  const u = dit.find((x) => String(x.lang || '').startsWith('en')) || {};
  chk(/Siri|Enhanced|Premium|Natural/i.test(u.voix || ''),
    `1bis. anglais : la voix la plus naturelle du téléphone est choisie (« ${u.voix} »)`);
}

/* --- 4. aucune voix de la langue → on le DIT, on ne massacre pas ------------ */
{
  const sansItalien = VOIX_IPHONE.filter((v) => !v.lang.startsWith('it'));
  const { dit, toasts } = await parle({ cours: 'it', voix: sansItalien });
  const u = dit.find((x) => String(x.lang || '').startsWith('it'));
  chk(!u || !u.voix,
    '4. sans voix italienne, le mot n\'est PAS lu avec une voix française');
  chk(/pas de voix|Accessibilité|Contenu énoncé/i.test(toasts),
    `4. et l'app explique quoi faire (« ${toasts.slice(0, 80)}… »)`);
}

/* --- 5. démarrage à froid : pas d'accusation injustifiée ------------------- */
{
  const { toasts } = await parle({ cours: 'en', froid: true });
  chk(!/n'a pas de voix/i.test(toasts),
    `5. démarrage à froid (voix pas encore chargées) : on n'accuse PAS le téléphone à tort${toasts ? ' — messages : ' + toasts.slice(0, 70) : ''}`);
}

/* --- 6. le message de repli doit rester vrai -------------------------------- */
{
  const src = readFileSync('lingua/app.js', 'utf8');
  const i = src.indexOf('_voixCloudKO');
  const msg = src.slice(i, i + 1400);   /* fenêtre large : la fonction + son message */
  chk(/hors-ligne/i.test(msg),
    '6. quand la belle voix tombe, on NOMME la seule voix qui marche sans réseau');
  chk(!/Vérifie ta connexion/i.test(msg),
    '6bis. on n\'accuse plus la connexion de Kevin : les 12 belles voix passent par le MÊME serveur, en changer n\'y change rien');
}

await nav.close();
R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
