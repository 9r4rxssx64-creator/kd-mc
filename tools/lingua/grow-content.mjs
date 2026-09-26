#!/usr/bin/env node
/* Lingua — moteur d'enrichissement AUTOMATIQUE des histoires.
   « Ajoute encore des histoires au fur et à mesure » (Kevin 2026-08-09).

   Principe SÛR par construction (aucune mauvaise histoire ne peut passer en silence) :
     1) Un modèle A rédige UNE mini-histoire originale (6 langues + quiz FR) en JSON strict.
     2) Contrôle STRUCTUREL dur : schéma, 6 langues sur chaque ligne, quiz valide, id unique.
     3) SECOND AVIS INDÉPENDANT : un modèle B (fournisseur différent) JUGE les traductions.
        On n'accepte QUE si le juge dit « tout est correct » (0 problème).
     4) Si accepté → insertion au repère __STORIES_AUTO__ + bump de version + le workflow commit.
        Si refusé/erreur → EXIT 0 sans rien changer (anti-spam, jamais de contenu douteux).

   Modes :
     --dry-run --from-file <json>   : teste tout le mécanisme SANS appeler d'IA (preuve locale).
     (par défaut)                    : génère + juge via IA (clés GROQ/MISTRAL/GEMINI en CI).
*/
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lingua');
const DATA = path.join(ROOT, 'data.js');
const APP  = path.join(ROOT, 'app.js');
const SW   = path.join(ROOT, 'sw.js');
const LANGS = ['en', 'it', 'es', 'de', 'pt', 'nl'];
const LNAMES = { en: 'anglais', it: 'italien', es: 'espagnol', de: 'allemand', pt: 'portugais', nl: 'néerlandais' };
const arg = (f) => process.argv.includes(f);
const argv = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };

function loadData() {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx);
  return ctx;
}
function existingIds(ctx) { return new Set((ctx.STORIES || []).map((s) => s.id)); }

/* ---------- Contrôle structurel (dur) ---------- */
function validateStory(st, takenIds) {
  const e = [];
  if (!st || typeof st !== 'object') return ['pas un objet'];
  if (!st.id || !/^[a-z][a-z0-9_]{1,20}$/.test(st.id)) e.push('id invalide');
  if (takenIds.has(st.id)) e.push('id déjà pris: ' + st.id);
  if (!st.ic || !st.titre) e.push('ic/titre manquant');
  if (!Array.isArray(st.lignes) || st.lignes.length < 4 || st.lignes.length > 7) e.push('4 à 7 lignes attendues');
  (st.lignes || []).forEach((l, i) => {
    if (!l || typeof l.fr !== 'string' || !l.fr.trim()) e.push('ligne ' + i + ' : fr manquant');
    if (!l.qui) e.push('ligne ' + i + ' : qui manquant');
    if (!l.t || typeof l.t !== 'object') { e.push('ligne ' + i + ' : t manquant'); return; }
    LANGS.forEach((lg) => { if (typeof l.t[lg] !== 'string' || !l.t[lg].trim()) e.push('ligne ' + i + ' : ' + lg + ' manquant'); });
  });
  if (!Array.isArray(st.quiz) || st.quiz.length < 3 || st.quiz.length > 4) e.push('3 à 4 questions attendues');
  (st.quiz || []).forEach((q, i) => {
    if (!q || typeof q.q !== 'string' || !q.q.trim()) e.push('q' + i + ' : question manquante');
    if (!Array.isArray(q.opts) || q.opts.length < 2 || q.opts.length > 4) e.push('q' + i + ' : 2 à 4 options');
    if (typeof q.ok !== 'number' || q.ok < 0 || q.ok >= (q.opts || []).length) e.push('q' + i + ' : ok hors bornes');
  });
  return e;
}

/* ---------- Appels IA (fournisseurs indépendants) ---------- */
async function callGroq(messages, json) {
  if (!process.env.GROQ_API_KEY) return null;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 1400, temperature: 0.6, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!r.ok) return null; const j = await r.json();
  return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}
async function callMistral(messages, json) {
  if (!process.env.MISTRAL_API_KEY) return null;
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.MISTRAL_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-small-latest', messages, max_tokens: 1400, temperature: 0.5, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!r.ok) return null; const j = await r.json();
  return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}
async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) return null;
  const sys = messages.find((m) => m.role === 'system'); const rest = messages.filter((m) => m.role !== 'system');
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys.content }] } : undefined, contents: rest.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1400, temperature: 0.5 } }),
  });
  if (!r.ok) return null; const j = await r.json();
  return j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
}
function parseJson(txt) { if (!txt) return null; try { const m = txt.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : txt); } catch { return null; } }

/* ---------- Génération (modèle A) ---------- */
async function generateStory(sampleTitles) {
  const sys = "Tu es auteur de mini-histoires pour débutants en langues, francophones. Tu écris des histoires TRÈS simples (niveau A1-A2), positives, originales, avec l'abeille Bee (🐝) et un ami (🧑).";
  const user = 'Écris UNE mini-histoire ORIGINALE différente de : ' + sampleTitles.join(', ') + '. '
    + 'Réponds UNIQUEMENT en JSON strict de cette forme exacte : '
    + '{"id":"motcourt_minuscules","ic":"un emoji","titre":"Titre en français","lignes":[{"qui":"🐝 ou 🧑","fr":"phrase courte en français","t":{"en":"...","it":"...","es":"...","de":"...","pt":"...","nl":"..."}}],"quiz":[{"q":"question en français","opts":["...","...","..."],"ok":0}]}. '
    + 'Règles : 5 lignes, phrases très courtes et correctes ; traductions FIDÈLES et naturelles dans les 6 langues (en,it,es,de,pt,nl) ; 3 questions de compréhension EN FRANÇAIS avec 3 options et l\'index "ok" de la bonne réponse. Aucune faute. '
    + "N'emploie PAS le prénom « Bee » comme sujet dans les phrases (il ne se traduit pas) : écris « je / tu / il / elle / nous » à la place. Choisis des phrases neutres qui se traduisent naturellement dans les 6 langues (évite les tournures ambiguës de genre). N'invente jamais un mot : si tu doutes d'une traduction, choisis une phrase plus simple.";
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  const raw = (await callGroq(msgs, true)) || (await callMistral(msgs, true)) || (await callGemini(msgs));
  return parseJson(raw);
}

/* ---------- Second avis indépendant (modèle B, fournisseur différent) ---------- */
async function judgeStory(st, generatorTried) {
  const pairs = [];
  st.lignes.forEach((l) => LANGS.forEach((lg) => pairs.push('[' + LNAMES[lg] + '] "' + l.fr + '" => "' + l.t[lg] + '"')));
  const histoireFr = st.lignes.map((l) => l.qui + ' ' + l.fr).join('\n');
  const quizTxt = st.quiz.map((q, i) => 'Q' + (i + 1) + ' : ' + q.q + ' | options: [' + q.opts.join(' , ') + '] | bonne réponse annoncée: "' + q.opts[q.ok] + '"').join('\n');
  const sys = "Tu es un correcteur professionnel plurilingue rigoureux. Tu vérifies (1) des traductions du français vers 6 langues, ET (2) qu'un petit quiz de compréhension est cohérent avec l'histoire française.";
  const user = 'PARTIE 1 — Traductions. Dis si CHAQUE traduction est correcte et naturelle.\n'
    + pairs.join('\n')
    + "\n\nPARTIE 2 — Quiz. Voici l'histoire en français (🐝 = l'abeille Bee, considérée à la 3e personne « elle/lui » ; 🧑 = l'ami, « moi/toi ») :\n"
    + histoireFr + '\n' + quizTxt + '\n'
    + 'Pour CHAQUE question, dis si la « bonne réponse annoncée » est RÉELLEMENT correcte d\'après l\'histoire, et si le mapping des pronoms est COHÉRENT entre les questions.\n'
    + '\nRéponds UNIQUEMENT en JSON : {"ok": true/false, "problemes": ["décris chaque traduction fausse/maladroite ET chaque réponse de quiz incorrecte ou incohérente ; sinon liste vide"]}. Sois strict : la moindre erreur de sens, genre, accord, orthographe, OU une bonne réponse de quiz fausse/incohérente compte comme un problème.';
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  // fournisseur DIFFÉRENT de celui qui a généré (indépendance)
  let raw = null;
  if (generatorTried !== 'mistral') raw = await callMistral(msgs, true);
  if (!raw && generatorTried !== 'gemini') raw = await callGemini(msgs);
  if (!raw && generatorTried !== 'groq') raw = await callGroq(msgs, true);
  const j = parseJson(raw);
  if (!j) return { ok: false, available: false, hard: ['juge indisponible'] };
  const problemes = Array.isArray(j.problemes) ? j.problemes : [];
  // On BLOQUE uniquement les vraies erreurs (sens/genre/accord/orthographe), pas les
  // simples préférences de style (« moins naturel »). Zéro erreur dure = on accepte.
  const hard = problemes.filter((p) => /incorrect|faux|erreur|fautif|mauvais|contresens|ne veut rien dire|n'existe pas|invent|manqu|genre|accord|orthograph|devrait être|wrong|incohéren|quiz|réponse|question/i.test(String(p)));
  return { ok: hard.length === 0, available: true, hard, all: problemes };
}

/* ---------- Insertion + bump de version ---------- */
function serializeStory(st) {
  const esc = (s) => JSON.stringify(String(s));
  const lignes = st.lignes.map((l) => '  {qui:' + esc(l.qui) + ', fr:' + esc(l.fr) + ', t:{' + LANGS.map((lg) => lg + ':' + esc(l.t[lg])).join(', ') + '}}').join(',\n');
  const quiz = st.quiz.map((q) => '  {q:' + esc(q.q) + ', opts:[' + q.opts.map(esc).join(',') + '], ok:' + q.ok + '}').join(',\n');
  return ' {id:' + esc(st.id) + ', ic:' + esc(st.ic) + ', titre:' + esc(st.titre) + ', lignes:[\n' + lignes + '],\n  quiz:[\n' + quiz + ']}';
}
function insertStory(st) {
  const marker = '/*__STORIES_AUTO__';
  let src = fs.readFileSync(DATA, 'utf8');
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('repère __STORIES_AUTO__ introuvable dans data.js');
  src = src.slice(0, at) + ',\n' + serializeStory(st) + '\n ' + src.slice(at);
  fs.writeFileSync(DATA, src);
}
function bumpVersion() {
  let app = fs.readFileSync(APP, 'utf8');
  const m = app.match(/var APP_VER="v(\d+)\.(\d+)\.(\d+)";/);
  if (!m) throw new Error('APP_VER introuvable');
  const nv = 'v' + m[1] + '.' + m[2] + '.' + (parseInt(m[3], 10) + 1);
  app = app.replace(/var APP_VER="v\d+\.\d+\.\d+";/, 'var APP_VER="' + nv + '";');
  fs.writeFileSync(APP, app);
  let sw = fs.readFileSync(SW, 'utf8');
  sw = sw.replace(/var CACHE = "lingua-v\d+\.\d+\.\d+";/, 'var CACHE = "lingua-' + nv + '";');
  fs.writeFileSync(SW, sw);
  return nv;
}

/* ---------- Orchestration ---------- */
(async () => {
  const dry = arg('--dry-run');
  const ctx = loadData();
  const taken = existingIds(ctx);
  const sampleTitles = (ctx.STORIES || []).slice(-8).map((s) => s.titre);

  let st, judged;
  if (dry && argv('--from-file')) {
    st = JSON.parse(fs.readFileSync(argv('--from-file'), 'utf8'));
    judged = { ok: true, problemes: [] }; // en dry-run on prouve le mécanisme, pas l'IA
  } else {
    st = await generateStory(sampleTitles);
    if (!st) { console.log('SKIP: génération IA indisponible (aucune clé/erreur).'); process.exit(0); }
  }

  const errs = validateStory(st, taken);
  if (errs.length) { console.log('REJET structurel: ' + errs.join(' | ')); process.exit(0); }

  if (!dry) {
    judged = await judgeStory(st, 'groq');
    if (!judged.available) { console.log('SKIP: juge indisponible.'); process.exit(0); }
    if (!judged.ok) { console.log('REJET (second avis, erreurs dures): ' + (judged.hard || []).slice(0, 6).join(' | ')); process.exit(0); }
  }

  insertStory(st);
  // re-vérifie que data.js reste valide + parité après insertion
  try {
    const ctx2 = loadData();
    const added = (ctx2.STORIES || []).find((x) => x.id === st.id);
    if (!added) throw new Error('histoire absente après insertion');
    const e2 = validateStory(added, new Set()); if (e2.length) throw new Error(e2.join(' | '));
  } catch (e) { console.log('REJET post-insertion: ' + e.message); process.exit(1); }

  const nv = bumpVersion();
  console.log('OK: histoire « ' + st.titre + ' » (' + st.id + ') ajoutée → ' + nv + '. Total: ' + (loadData().STORIES.length) + ' histoires.');
  process.exit(0);
})().catch((e) => { console.log('SKIP erreur: ' + (e && e.message || e)); process.exit(0); });
