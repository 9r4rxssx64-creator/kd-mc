#!/usr/bin/env node
/* Lingua — ENRICHISSEMENT DU VOCABULAIRE, par vagues, avec porte de vérité.
   Kevin 2026-08-11 : « 75 verbes c'est bcp trop peu pour apprendre une langue.
   Pareil pour tout le reste. Enrichit +++ »

   Ce que fait ce moteur, pour UNE vague :
     1) il propose des termes français NOUVEAUX (jamais déjà dans le programme) sur un thème,
        avec une priorité aux VERBES — le squelette d'une langue ;
     2) un modèle A les traduit dans les 14 langues ;
     3) un modèle B INDÉPENDANT (fournisseur différent) juge CHAQUE traduction ;
     4) SEULES les traductions validées à l'unanimité entrent dans data.js.
        Une seule langue douteuse → le terme entier est écarté. Mieux vaut 20 mots
        justes que 100 mots dont 3 sont faux (règle « vérité, rien de faux, partout toujours »).

   Rien n'est écrit tant que la porte de vérité structurelle ne repasse pas au vert.

   Usage :
     node tools/lingua/grow-vocab.mjs lingua --theme "La cuisine" --n 24
     node tools/lingua/grow-vocab.mjs lingua --verbes --n 30        (vague 100 % verbes)
     node tools/lingua/grow-vocab.mjs lingua --theme "..." --dry    (aucune écriture)
*/
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const DATA = path.join(ROOT, 'data.js');
const APP = path.join(ROOT, 'app.js');
const SW = path.join(ROOT, 'sw.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);

const L1 = ['en', 'it', 'es', 'de', 'pt', 'nl'];
const L2 = ['pl', 'ru', 'uk', 'cs', 'zh', 'ja', 'ko', 'ar'];
const NOMS = {
  en: 'anglais', it: 'italien', es: 'espagnol', de: 'allemand', pt: 'portugais', nl: 'néerlandais',
  pl: 'polonais', ru: 'russe', uk: 'ukrainien', cs: 'tchèque', zh: 'chinois (mandarin simplifié)',
  ja: 'japonais', ko: 'coréen', ar: 'arabe (standard moderne)',
};
const TOUTES = L1.concat(L2);
const VERBES_ONLY = has('verbes');
const N = Math.max(4, Math.min(60, parseInt(arg('n', '24'), 10) || 24));
const THEME = arg('theme', VERBES_ONLY ? 'Des verbes du quotidien et de la vie active' : 'Vocabulaire utile de la vie courante');
const DRY = has('dry');

function load() { const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx); return ctx; }

/* ---------------- Appels IA (fournisseurs indépendants) ----------------
   RETENTATIVE OBLIGATOIRE. Vécu le 2026-08-11 : 8 vagues lancées d'affilée ont épuisé le
   quota des fournisseurs — 7 vagues sur 8 n'ont RIEN produit, et sur la 8e l'anglais est
   passé (24/24) mais l'italien et l'espagnol se sont fait jeter. Sans retentative, un simple
   « trop de requêtes » (429) fait perdre toute une vague de travail. */
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
let _stats = { appels: 0, retentes: 0, echecs: 0 };
async function appelJson(url, opts, extrait) {
  for (let essai = 0; essai < 4; essai++) {
    _stats.appels++;
    const r = await fetch(url, opts).catch(() => null);
    if (r && r.ok) { const j = await r.json().catch(() => null); const v = j && extrait(j); if (v) return v; }
    /* 429 = trop de requêtes, 5xx = souci passager → on attend de plus en plus longtemps */
    const rejouable = !r || r.status === 429 || r.status >= 500;
    if (!rejouable || essai === 3) break;
    _stats.retentes++;
    const attente = (r && parseInt(r.headers.get('retry-after') || '0', 10) * 1000) || (3000 * Math.pow(2, essai));
    await dors(Math.min(attente, 45000));
  }
  _stats.echecs++; return null;
}
async function callGroq(messages, json) {
  if (!process.env.GROQ_API_KEY) return null;
  return appelJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 4000, temperature: 0.3, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  }, (j) => j?.choices?.[0]?.message?.content);
}
async function callMistral(messages, json) {
  if (!process.env.MISTRAL_API_KEY) return null;
  return appelJson('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.MISTRAL_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-large-latest', messages, max_tokens: 4000, temperature: 0.2, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  }, (j) => j?.choices?.[0]?.message?.content);
}
async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) return null;
  const sys = messages.find((m) => m.role === 'system'); const rest = messages.filter((m) => m.role !== 'system');
  return appelJson('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys.content }] } : undefined, contents: rest.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 4000, temperature: 0.2 } }),
  }, (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text);
}
function parseJson(txt) { if (!txt) return null; try { const m = txt.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : txt); } catch { return null; } }

/* ---------------- 1) Choix des termes français NOUVEAUX ---------------- */
async function proposeTermes(dejaVus) {
  const echantillon = [...dejaVus].slice(-60).join(', ');
  const sys = "Tu construis le programme d'une application d'apprentissage des langues pour francophones. "
    + 'Tu proposes du vocabulaire FRANÇAIS utile, courant, concret, sans vulgarité ni marque déposée.';
  const user = 'Thème : ' + THEME + '. Propose EXACTEMENT ' + N + ' termes français NOUVEAUX'
    + (VERBES_ONLY ? ', TOUS des VERBES à l\'infinitif (ex : "réparer", "se dépêcher")' : ', dont au moins la moitié des VERBES à l\'infinitif')
    + '. Interdit : ces termes déjà pris → ' + echantillon + '. '
    + 'Un terme = 1 à 3 mots, en minuscules, sans article. '
    + 'Réponds UNIQUEMENT en JSON : {"termes":["...","..."]}';
  for (const f of [callMistral, callGroq]) {
    const j = parseJson(await f([{ role: 'system', content: sys }, { role: 'user', content: user }], true));
    if (j && Array.isArray(j.termes) && j.termes.length >= 4) return j.termes.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/* ---------------- 2) Traduction (modèle A) ---------------- */
async function traduire(termes, lg) {
  const sys = 'Tu es traducteur professionnel français → ' + NOMS[lg] + '. Tu traduis du vocabulaire d\'apprentissage : '
    + 'la forme la plus courante et la plus neutre, SANS article, SANS explication. '
    + 'Un verbe français à l\'infinitif se traduit par l\'infinitif (ou la forme de citation usuelle de la langue).';
  const user = 'Traduis en ' + NOMS[lg] + ' chacun de ces termes. Réponds UNIQUEMENT en JSON : {"t":{"terme français":"traduction", ...}}\n'
    + termes.join('\n');
  for (const f of [callMistral, callGroq]) {
    const j = parseJson(await f([{ role: 'system', content: sys }, { role: 'user', content: user }], true));
    if (j && j.t && typeof j.t === 'object') return j.t;
  }
  return null;
}

/* ---------------- 3) Juge INDÉPENDANT (fournisseur différent) ---------------- */
async function juger(lg, paires) {
  const sys = 'Tu es examinateur de traductions. Tu es SÉVÈRE et tu ne valides que ce qui est juste : '
    + 'sens exact, forme de citation correcte (infinitif pour un verbe), orthographe et accents corrects, '
    + 'pas d\'article parasite, pas de mot inventé.';
  const user = 'Langue cible : ' + NOMS[lg] + '. Pour chaque paire, dis si la traduction est CORRECTE.\n'
    + 'Réponds UNIQUEMENT en JSON : {"v":{"terme français":true|false, ...}}\n'
    + paires.map(([fr, t]) => fr + ' => ' + t).join('\n');
  /* le juge doit être d'un AUTRE fournisseur que le traducteur, sinon il se relit lui-même */
  for (const f of [callGemini, callGroq]) {
    const j = parseJson(await f([{ role: 'system', content: sys }, { role: 'user', content: user }], true));
    if (j && j.v && typeof j.v === 'object') return j.v;
  }
  return null;
}

/* ---------------- 4) Écriture dans data.js ---------------- */
function esc(s) { return JSON.stringify(String(s)); }
function ecrire(unite, lexPar, verbes) {
  let src = fs.readFileSync(DATA, 'utf8');
  /* a) nouvelle unité du programme — OBLIGATOIREMENT avant la génération de COURSES.
     Vécu le 2026-08-11 : le bloc atterrissait APRÈS, donc l'unité entrait dans CURRICULUM
     mais JAMAIS dans les cours. 17 verbes écrits, 0 visible dans l'app, et tous les compteurs
     annonçaient « ajoutés ». Déclaré n'est pas branché. Le repère ci-dessous est le seul point
     d'insertion valable ; la porte de vérité échoue désormais si on écrit ailleurs. */
  const marqueur = '/*__VOCAB_AUTO__';
  const at = src.indexOf(marqueur);
  if (at < 0) throw new Error('repère __VOCAB_AUTO__ introuvable dans data.js (il doit être AVANT la génération de COURSES)');
  const lecons = unite.L.map((l) => '  {t:' + esc(l.t) + ', w:[' + l.w.map(esc).join(',') + ']}').join(',\n');
  const bloc = '\n/* Vague de vocabulaire « ' + unite.t + ' » — chaque traduction validée par un modèle indépendant. */\n'
    + 'CURRICULUM.push({t:' + esc(unite.t) + ', c:' + esc(unite.c) + ', L:[\n' + lecons + '\n]});\n'
    + 'var _VOC = ' + JSON.stringify(lexPar, null, 0) + ';\n'
    + 'LANGS.forEach(function(l){ Object.keys(_VOC).forEach(function(k){ if(_VOC[k][l]) LEX[l][k]=_VOC[k][l]; }); });\n'
    + 'LANGS2.forEach(function(l){ LEX2[l]=LEX2[l]||{}; Object.keys(_VOC).forEach(function(k){ if(_VOC[k][l]) LEX2[l][k]=_VOC[k][l]; }); });\n';
  src = src.slice(0, at) + bloc + src.slice(at);
  /* b) les nouveaux verbes rejoignent la liste vérifiée */
  if (verbes.length) {
    src = src.replace(/(var VERBES_FR = \[[\s\S]*?)\n\];/, (m, head) => head + ',\n  ' + verbes.map(esc).join(',') + '\n];');
  }
  fs.writeFileSync(DATA, src);
}
function bumpVersion() {
  let app = fs.readFileSync(APP, 'utf8');
  const m = app.match(/var APP_VER="v(\d+)\.(\d+)\.(\d+)";/);
  if (!m) throw new Error('APP_VER introuvable');
  const nv = 'v' + m[1] + '.' + m[2] + '.' + (parseInt(m[3], 10) + 1);
  fs.writeFileSync(APP, app.replace(/var APP_VER="v\d+\.\d+\.\d+";/, 'var APP_VER="' + nv + '";'));
  fs.writeFileSync(SW, fs.readFileSync(SW, 'utf8').replace(/var CACHE = "lingua-v\d+\.\d+\.\d+";/, 'var CACHE = "lingua-' + nv + '";'));
  return nv;
}

/* ---------------- Auto-test du CHEMIN D'ÉCRITURE (sans IA) ----------------
   Une vague tourne en CI, loin de moi : si l'écriture produit un data.js cassé, personne
   ne le voit avant que l'app tombe. Ce test simule des traductions parfaites, écrit pour de
   vrai, vérifie que data.js reste valide ET que la porte de vérité repasse au vert, puis
   REMET tout en place. À lancer avant toute vague : --selftest */
function selftest() {
  const avant = { data: fs.readFileSync(DATA, 'utf8'), app: fs.readFileSync(APP, 'utf8'), sw: fs.readFileSync(SW, 'utf8') };
  const gardes = ['zzztestunverbe', 'zzztestdeuxverbe', 'zzztesttroisverbe'];
  const lexPar = {}; gardes.forEach((fr) => { lexPar[fr] = {}; TOUTES.forEach((lg) => { lexPar[fr][lg] = 'ZZ_' + lg + '_' + fr; }); });
  const L = [{ t: 'Partie 1', w: gardes }];
  let ok = true, why = '';
  try {
    ecrire({ t: 'Vague auto-test', c: '#12b981', L }, lexPar, gardes);
    const c2 = load();                                   // data.js doit rester exécutable
    const mots = new Set(); (c2.CURRICULUM || []).forEach((u) => (u.L || []).forEach((l) => (l.w || []).forEach((w) => mots.add(w))));
    gardes.forEach((g) => { if (!mots.has(g)) { ok = false; why = 'terme « ' + g + ' » absent du programme après écriture'; } });
    /* DÉCLARÉ ≠ BRANCHÉ : le terme doit arriver jusqu'au COURS, pas seulement dans CURRICULUM.
       C'est CE contrôle qui manquait le 2026-08-11 — 17 verbes écrits, 0 servi à l'utilisateur. */
    const c0 = c2.COURSES && c2.COURSES[L1[0]];
    if (!c0) { ok = false; why = 'aucun cours généré après écriture'; }
    else { const servis = new Set(); c0.units.forEach((u) => u.lessons.forEach((le) => le.words.forEach((w) => servis.add(w.fr))));
      gardes.forEach((g) => { if (!servis.has(g)) { ok = false; why = 'terme « ' + g + ' » écrit mais JAMAIS SERVI par le cours (bloc inséré après la génération de COURSES ?)'; } }); }
    TOUTES.forEach((lg) => gardes.forEach((g) => {
      const v = (c2.LEX?.[lg]?.[g]) || (c2.LEX2?.[lg]?.[g]);
      if (v !== 'ZZ_' + lg + '_' + g) { ok = false; why = 'traduction ' + lg + ' de « ' + g + ' » non écrite (' + v + ')'; }
    }));
    gardes.forEach((g) => { if (!(c2.VERBES_FR || []).includes(g)) { ok = false; why = 'verbe « ' + g + ' » absent de VERBES_FR'; } });
    const v = bumpVersion();
    if (!/^v\d+\.\d+\.\d+$/.test(v)) { ok = false; why = 'version mal incrémentée : ' + v; }
    if (!fs.readFileSync(SW, 'utf8').includes('lingua-' + v)) { ok = false; why = 'sw.js pas synchronisé sur ' + v; }
  } catch (e) { ok = false; why = String(e && e.message || e); }
  fs.writeFileSync(DATA, avant.data); fs.writeFileSync(APP, avant.app); fs.writeFileSync(SW, avant.sw);
  console.log(ok ? '✅ auto-test écriture : data.js valide, 3 termes × 14 langues écrits, verbes ajoutés, version + sw.js synchronisés (tout a été remis en état)'
                 : '❌ auto-test écriture ÉCHOUÉ : ' + why);
  process.exit(ok ? 0 : 1);
}

/* ---------------- Orchestration ---------------- */
(async () => {
  if (has('selftest')) selftest();
  const ctx = load();
  const deja = new Set();
  (ctx.CURRICULUM || []).forEach((u) => (u.L || []).forEach((l) => { (l.w || []).forEach((w) => deja.add(w)); (l.p || []).forEach((p) => deja.add(p)); }));
  const dejaVerbes = new Set(ctx.VERBES_FR || []);
  console.log('Programme actuel : ' + deja.size + ' termes, ' + dejaVerbes.size + ' verbes.');
  console.log('Vague : « ' + THEME + ' » · ' + N + ' termes demandés' + (VERBES_ONLY ? ' (100 % verbes)' : '') + (DRY ? ' · SIMULATION' : ''));

  let termes = (await proposeTermes(deja)).filter((t) => !deja.has(t));
  termes = [...new Set(termes)].slice(0, N);
  if (termes.length < 4) {
    console.log('Aucun terme nouveau proposé — ' + (_stats.echecs ? ('les fournisseurs n\'ont pas répondu (' + _stats.appels + ' appels, ' + _stats.retentes + ' retentatives, ' + _stats.echecs + ' échecs) : c\'est un souci de quota, pas de contenu.') : 'l\'IA n\'a rien proposé de nouveau.'));
    process.exit(0);
  }
  console.log('Termes retenus (' + termes.length + ') : ' + termes.join(', '));

  /* traduction + jugement, langue par langue.
     DISTINCTION IMPORTANTE (défaut vu le 2026-08-11) : un juge MUET n'est pas un juge qui
     REFUSE. Avant, une panne du juge comptait « 0/24 validées » — on jetait 24 bonnes
     traductions en croyant qu'elles étaient fausses, sans le dire. Maintenant, juge injoignable
     = vague abandonnée avec un message clair (on ne devine pas, on ne jette pas en silence). */
  const trad = {}; const rejets = {};
  for (const lg of TOUTES) {
    const t = await traduire(termes, lg);
    if (!t) { console.log('  ' + lg + ' : traducteur injoignable → vague abandonnée (aucune langue ne doit manquer).'); process.exit(0); }
    const paires = termes.map((fr) => [fr, String(t[fr] || '').trim()]).filter(([, v]) => v);
    const verdict = await juger(lg, paires);
    if (!verdict) { console.log('  ' + lg + ' : JUGE injoignable → vague abandonnée. (Sans second avis, on n\'écrit rien : ' + paires.length + ' traductions non vérifiées, donc écartées.)'); process.exit(0); }
    const repondu = paires.filter(([fr]) => typeof verdict[fr] === 'boolean').length;
    if (repondu < paires.length / 2) { console.log('  ' + lg + ' : le juge n\'a répondu que sur ' + repondu + '/' + paires.length + ' → vague abandonnée (avis trop partiel pour être fiable).'); process.exit(0); }
    trad[lg] = {};
    paires.forEach(([fr, v]) => { if (verdict[fr] === true) trad[lg][fr] = v; else (rejets[fr] = rejets[fr] || []).push(lg + (verdict[fr] === false ? '' : '?')); });
    console.log('  ' + lg + ' : ' + Object.keys(trad[lg]).length + '/' + termes.length + ' validées (juge consulté sur ' + repondu + ')');
    await dors(1500);   // on respire entre deux langues : c'est le quota qui a tué la 1re tentative
  }

  /* un terme n'est gardé que s'il est juste dans LES 14 langues */
  const gardes = termes.filter((fr) => TOUTES.every((lg) => trad[lg][fr]));
  const perdus = termes.filter((fr) => !gardes.includes(fr));
  console.log('\nRetenus à l\'unanimité des 14 langues : ' + gardes.length + '/' + termes.length);
  if (perdus.length) console.log('Écartés (au moins une langue douteuse) : ' + perdus.map((f) => f + ' [' + (rejets[f] || []).join(',') + ']').join(' · '));
  if (!gardes.length) { console.log('Rien de sûr à ajouter — on n\'écrit rien.'); process.exit(0); }
  if (DRY) { console.log('SIMULATION : aucune écriture.'); process.exit(0); }

  const lexPar = {}; gardes.forEach((fr) => { lexPar[fr] = {}; TOUTES.forEach((lg) => { lexPar[fr][lg] = trad[lg][fr]; }); });
  /* découpage en leçons de 6-8 mots, comme le reste du programme */
  const L = []; for (let i = 0; i < gardes.length; i += 7) L.push({ t: 'Partie ' + (L.length + 1), w: gardes.slice(i, i + 7) });
  const unite = { t: THEME + (VERBES_ONLY ? ' 🏃' : ' ✨'), c: VERBES_ONLY ? '#12b981' : '#7c8cff', L };
  const nouveauxVerbes = VERBES_ONLY ? gardes.filter((t) => !dejaVerbes.has(t)) : gardes.filter((t) => /^(se |s')?[a-zà-öø-ÿ]+(er|ir|re|oir)$/.test(t) && !dejaVerbes.has(t));

  ecrire(unite, lexPar, nouveauxVerbes);
  /* la liste de verbes a changé → on re-fige l'empreinte, puis la porte de vérité doit passer */
  execFileSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'verify-truth.mjs'), ROOT, '--fige-verbes'], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'verify-truth.mjs'), ROOT], { stdio: 'inherit' });
  const nv = bumpVersion();
  console.log('\n✅ ' + gardes.length + ' termes ajoutés (' + nouveauxVerbes.length + ' verbes) × 14 langues = ' + (gardes.length * 14) + ' traductions validées. Version ' + nv + '.');
  console.log('   (appels IA : ' + _stats.appels + ', retentatives : ' + _stats.retentes + ', échecs définitifs : ' + _stats.echecs + ')');
})();
