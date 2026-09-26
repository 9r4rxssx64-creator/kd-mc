#!/usr/bin/env node
/* Lingua — traduit les histoires EXISTANTES vers les 8 nouvelles langues
   (pl, ru, uk, cs, zh, ja, ko, ar), au fur et à mesure, SANS jamais publier de faux.

   Même principe SÛR que grow-content.mjs (« vérité, rien de faux, partout toujours ») :
     1) Un modèle A traduit les lignes d'UNE histoire (JSON strict, 8 langues par ligne).
     2) Contrôle STRUCTUREL dur : même nombre de lignes, 8 langues non vides, pas de
        copie du français (anti-repli).
     3) SECOND AVIS INDÉPENDANT : un modèle B (fournisseur différent) juge chaque paire
        fr → traduction. La moindre erreur dure → on REJETTE l'histoire (rien n'est écrit).
     4) Accepté → on complète t:{…} de chaque ligne dans data.js + bump de version.
   Ordre STRICT des histoires (la 1re d'abord) : la carte Histoires n'apparaît dans une
   nouvelle langue que quand l'histoire 1 est traduite, et la chaîne de déblocage reste
   cohérente (les histoires non traduites disent « bientôt disponibles »).

   Modes :
     --limit N                      : nombre max d'histoires traitées (défaut 2).
     --dry-run --from-file <json>   : preuve locale SANS IA ({id, lignes:[{pl..ar}]}).
*/
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lingua');
const DATA = path.join(ROOT, 'data.js');
const APP  = path.join(ROOT, 'app.js');
const SW   = path.join(ROOT, 'sw.js');
const L2 = ['pl', 'ru', 'uk', 'cs', 'zh', 'ja', 'ko', 'ar'];
const L2NAMES = { pl: 'polonais', ru: 'russe', uk: 'ukrainien', cs: 'tchèque', zh: 'chinois (mandarin simplifié)', ja: 'japonais', ko: 'coréen', ar: 'arabe (standard moderne)' };
const arg = (f) => process.argv.includes(f);
const argv = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };

function loadData() { const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx); return ctx; }
function needsTranslation(st) { return (st.lignes || []).some((l) => L2.some((lg) => typeof (l.t || {})[lg] !== 'string' || !String((l.t || {})[lg] || '').trim())); }

/* ---------- Contrôle structurel dur ---------- */
function validateTranslations(st, tr) {
  const e = [];
  if (!tr || !Array.isArray(tr.lignes)) return ['lignes manquantes'];
  if (tr.lignes.length !== st.lignes.length) return ['mauvais nombre de lignes: ' + tr.lignes.length + ' ≠ ' + st.lignes.length];
  tr.lignes.forEach((t, i) => {
    L2.forEach((lg) => {
      const v = t && t[lg];
      if (typeof v !== 'string' || !v.trim()) { e.push('ligne ' + i + ' : ' + lg + ' manquant'); return; }
      if (v.trim().toLowerCase() === st.lignes[i].fr.trim().toLowerCase()) e.push('ligne ' + i + ' : ' + lg + ' = copie du français (repli interdit)');
      /* PURETÉ D'ÉCRITURE (déterministe, avant le juge) — leçon des passages 1-11 :
         私の dans du coréen, 头/哪里 dans de l'arabe, затем dans du coréen… publiés. */
      if (lg !== 'zh' && lg !== 'ja' && /[一-鿿぀-ゟ゠-ヿ]/.test(v)) e.push('ligne ' + i + ' : ' + lg + ' contient du chinois/japonais — ' + v);
      if (lg !== 'ko' && /[가-힣]/.test(v)) e.push('ligne ' + i + ' : ' + lg + ' contient du hangul — ' + v);
      if (lg !== 'ru' && lg !== 'uk' && /[Ѐ-ӿ]/.test(v)) e.push('ligne ' + i + ' : ' + lg + ' contient du cyrillique — ' + v);
      if (lg !== 'ar' && /[؀-ۿ]/.test(v)) e.push('ligne ' + i + ' : ' + lg + ' contient de l\'écriture arabe — ' + v);
      if (lg === 'zh' && /[぀-ゟ゠-ヿ]/.test(v)) e.push('ligne ' + i + ' : kana japonais en chinois — ' + v);
    });
  });
  return e;
}

/* ---------- Appels IA (fournisseurs indépendants, mêmes clés que grow-content) ----------
   JUGES SUPPLÉMENTAIRES (leçon des passages 14-18) : avec seulement Mistral+Gemini comme
   juges possibles, une limite de débit simultanée = passage perdu. On ajoute 4 fournisseurs
   « compatibles OpenAI » déjà utilisés ailleurs dans le dépôt (mêmes clés, mêmes URLs que
   services/kdmc-crea-ai) → 6 juges candidats au lieu de 2. Aucun n'est Anthropic : l'IA
   principale de Kevin n'est pas engagée ici. */
const COMPAT = {
  cohere:   { key: 'COHERE_API_KEY',   url: 'https://api.cohere.ai/compatibility/v1/chat/completions', model: 'command-r-08-2024' },
  together: { key: 'TOGETHER_API_KEY', url: 'https://api.together.xyz/v1/chat/completions',            model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free' },
  deepseek: { key: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/chat/completions',               model: 'deepseek-chat' },
  xai:      { key: 'XAI_API_KEY',      url: 'https://api.x.ai/v1/chat/completions',                    model: 'grok-3-mini' },
};
async function callCompat(id, messages, json) {
  const p = COMPAT[id]; if (!p || !process.env[p.key]) return null;
  try {
    const r = await fetch(p.url, {
      method: 'POST', headers: { authorization: 'Bearer ' + process.env[p.key], 'content-type': 'application/json' },
      body: JSON.stringify({ model: p.model, messages, max_tokens: 2500, temperature: 0.3, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    if (!r.ok) return null; const j = await r.json();
    return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  } catch { return null; }
}
async function callGroq(messages, json) {
  if (!process.env.GROQ_API_KEY) return null;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 2500, temperature: 0.3, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!r.ok) return null; const j = await r.json();
  return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}
async function callMistral(messages, json) {
  if (!process.env.MISTRAL_API_KEY) return null;
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.MISTRAL_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-small-latest', messages, max_tokens: 2500, temperature: 0.3, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!r.ok) return null; const j = await r.json();
  return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}
async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) return null;
  const sys = messages.find((m) => m.role === 'system'); const rest = messages.filter((m) => m.role !== 'system');
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys.content }] } : undefined, contents: rest.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 2500, temperature: 0.3 } }),
  });
  if (!r.ok) return null; const j = await r.json();
  return j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
}
function parseJson(txt) { if (!txt) return null; try { const m = txt.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : txt); } catch { return null; } }

/* ---------- Traduction (modèle A) ---------- */
async function translateStory(st, skip = []) {
  const sys = 'Tu es un traducteur professionnel plurilingue. Tu traduis des phrases TRÈS simples (niveau A1) du français vers 8 langues, fidèlement et naturellement. Jamais d\'invention.';
  const lignes = st.lignes.map((l, i) => (i + 1) + '. « ' + l.fr + ' » (anglais déjà validé : "' + l.t.en + '")').join('\n');
  const user = 'Traduis CHAQUE ligne de cette mini-histoire vers : polonais (pl), russe (ru), ukrainien (uk), tchèque (cs), chinois mandarin simplifié (zh), japonais (ja), coréen (ko), arabe standard moderne (ar).\n'
    + lignes + '\n'
    + 'Réponds UNIQUEMENT en JSON strict : {"lignes":[{"pl":"...","ru":"...","uk":"...","cs":"...","zh":"...","ja":"...","ko":"...","ar":"..."}]} — une entrée PAR ligne, dans le MÊME ordre. '
    + 'Règles : traductions naturelles pour un débutant, même sens que le français (l\'anglais sert de repère), aucun mot français laissé tel quel, aucune romanisation pour zh/ja/ko/ar. '
    + 'ÉCRITURE STRICTE — chaque langue UNIQUEMENT dans son propre système : le coréen en hangul SEUL (jamais un kana ni un caractère chinois : « 私の » est INTERDIT en coréen, écris « 제/저의 »), le japonais en kana/kanji, le chinois en caractères chinois, l\'arabe en alphabet arabe, pl/cs en alphabet latin, ru/uk en cyrillique. Mélanger deux écritures dans une même phrase est une FAUTE GRAVE. '
    + 'PONCTUATION FINALE : elle suit le TYPE de la phrase française — une affirmation se termine par . (。en zh/ja), une exclamation par ! (！en zh/ja) ; le point d\'interrogation (؟ en arabe, ？en zh/ja) sert UNIQUEMENT si la phrase française est une question.';
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  /* `skip` = traducteurs déjà essayés et rejetés pour CETTE histoire : on CHANGE de
     modèle au lieu de re-solliciter celui qui vient d'échouer (une même famille de
     modèle refait la même faute — vécu : « 私の » réinjecté dans le coréen à chaque
     tentative sur l'histoire « anniv »). */
  let raw = null, by = null;
  for (const id of ['groq', 'mistral', 'gemini']) {
    if (skip.includes(id)) continue;
    raw = id === 'groq' ? await callGroq(msgs, true) : id === 'mistral' ? await callMistral(msgs, true) : await callGemini(msgs);
    if (raw) { by = id; break; }
  }
  return { tr: parseJson(raw), by };
}

/* ---------- Normalisation déterministe de la ponctuation finale ----------
   Cause racine (passages 5-11) : le modèle A terminait les affirmatives arabes
   par « ؟ » (induit par une consigne ambiguë). Le TYPE de phrase vient du
   FRANÇAIS : on reflète mécaniquement sa ponctuation finale — sans toucher au
   sens — AVANT le juge, qui garde le dernier mot sur tout le reste. */
const TERM_RE = /[.!?。！？؟…]+\s*$/;
const PUNCT_BY_LANG = {
  zh: { q: '？', x: '！', s: '。' },
  ja: { q: '？', x: '！', s: '。' },
  ar: { q: '؟', x: '!', s: '.' },
  default: { q: '?', x: '!', s: '.' },
};
function frKind(fr) {
  const m = String(fr).trim().match(/[.!?…]+$/);
  const p = m ? m[0] : '.';
  return p.includes('?') ? 'q' : p.includes('!') ? 'x' : 's';
}
function fixTerminalPunct(fr, lg, v) {
  const k = frKind(fr);
  let s = String(v).trim();
  if (lg !== 'zh' && lg !== 'ja') {
    s = s.replace(/！/g, '!').replace(/？/g, '?').replace(/。/g, '.').replace(/，/g, ',');
    /* La ponctuation pleine-chasse porte son propre blanc ; en ASCII il faut le rendre,
       sinon on colle les mots (vécu : « 고마워!나는 » relevé par l'audit sémantique). */
    s = s.replace(/([!?.,])(?=[^\s!?.,])/g, '$1 ').trim();
  }
  /* ASYMÉTRIQUE : si le français est une question, on n'impose RIEN (une tournure de
     demande « une table, s'il vous plaît. » est une traduction légitime d'une question).
     Si le français N'EST PAS une question, aucun « ?/？/؟ » final n'est toléré. */
  if (k === 'q') return s;
  const p = (PUNCT_BY_LANG[lg] || PUNCT_BY_LANG.default)[k];
  return TERM_RE.test(s) ? s.replace(TERM_RE, p) : s + p;
}
function normalizePunct(st, tr) {
  if (!tr || !Array.isArray(tr.lignes)) return tr;
  tr.lignes.forEach((t, i) => {
    if (!t || !st.lignes[i]) return;
    L2.forEach((lg) => { if (typeof t[lg] === 'string' && t[lg].trim()) t[lg] = fixTerminalPunct(st.lignes[i].fr, lg, t[lg]); });
  });
  return tr;
}

/* ---------- Second avis indépendant (modèle B, fournisseur différent) ---------- */
async function judgeTranslations(st, tr, generatorTried) {
  const pairs = [];
  st.lignes.forEach((l, i) => L2.forEach((lg) => pairs.push('[' + L2NAMES[lg] + '] « ' + l.fr + ' » => « ' + tr.lignes[i][lg] + ' »')));
  const sys = 'Tu es un correcteur professionnel plurilingue rigoureux (polonais, russe, ukrainien, tchèque, chinois, japonais, coréen, arabe). Tu vérifies des traductions de phrases très simples depuis le français.';
  const user = 'Dis si CHAQUE traduction est correcte et naturelle.\n' + pairs.join('\n')
    + '\nRéponds UNIQUEMENT en JSON : {"ok": true/false, "problemes": ["décris chaque traduction FAUSSE (sens, genre, accord, orthographe, mot inventé, romanisation au lieu de l\'écriture native) ; liste vide sinon"]}. '
    + 'Sois strict sur les vraies erreurs, mais NE signale PAS les simples préférences de style.';
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  /* CHAÎNE DE JUGES ÉLARGIE + 2 tentatives (pause 20 s) : le juge doit TOUJOURS être
     un fournisseur DIFFÉRENT du traducteur (indépendance = la valeur du second avis),
     mais il ne doit pas dépendre d'un seul candidat disponible (passages 14-18 perdus
     sur « juge indisponible » = Mistral+Gemini en limite de débit au même instant). */
  const chain = ['mistral', 'gemini', 'cohere', 'deepseek', 'together', 'xai', 'groq']
    .filter((id) => id !== generatorTried);
  let raw = null, judgedBy = null;
  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 20000));
    for (const id of chain) {
      if (raw) break;
      raw = id === 'mistral' ? await callMistral(msgs, true)
        : id === 'gemini' ? await callGemini(msgs)
        : id === 'groq' ? await callGroq(msgs, true)
        : await callCompat(id, msgs, true);
      if (raw) judgedBy = id;
    }
  }
  if (judgedBy) console.log('   juge : ' + judgedBy + ' (traducteur : ' + generatorTried + ')');
  const j = parseJson(raw);
  if (!j) return { ok: false, available: false, hard: ['juge indisponible'] };
  const problemes = Array.isArray(j.problemes) ? j.problemes : [];
  const hard = problemes.filter((p) => /incorrect|faux|erreur|fautif|mauvais|contresens|ne veut rien dire|n'existe pas|invent|manqu|genre|accord|orthograph|devrait être|wrong|romanis|translitt/i.test(String(p)));
  if (!hard.length) return { ok: true, available: true, hard: [], all: problemes, judgedBy };

  /* CONFIRMATION PAR UN 2e JUGE INDÉPENDANT (leçon vérifiée passage 21) : un juge seul
     se trompe AUSSI dans l'autre sens. Exemple prouvé dans son propre texte — il a écrit
     « 'dort' n'existe pas en tchèque ; la traduction correcte est 'Je tam dort.' », en
     employant le mot qu'il déclare inexistant (dort = gâteau, tchèque courant). Ce faux
     rejet bloquait l'histoire à CHAQUE passage.
     On ne relâche donc RIEN : on exige qu'un 2e juge, d'un fournisseur différent du
     traducteur ET du 1er juge, CONFIRME chaque faute. Une vraie faute est vue par les
     deux ; une faute hallucinée ne l'est pas. Si aucun 2e juge n'est joignable, on garde
     le verdict du 1er (on ne publie jamais un doute). */
  const confirmed = await confirmProblems(hard, [generatorTried, judgedBy]);
  if (!confirmed.available) return { ok: false, available: true, hard, all: problemes, judgedBy, confirmedBy: null };
  return { ok: confirmed.kept.length === 0, available: true, hard: confirmed.kept, all: problemes, judgedBy, confirmedBy: confirmed.by, dismissed: confirmed.dismissed };
}

/* Re-examen ciblé : le 2e juge ne revoit QUE les fautes signalées, et dit pour chacune
   si elle est réellement fautive. Réponse indexée → pas d'ambiguïté d'appariement. */
async function confirmProblems(hard, exclude) {
  const list = hard.map((p, i) => (i + 1) + '. ' + p).join('\n');
  const sys = 'Tu es un correcteur plurilingue senior. Un premier correcteur a signalé des fautes dans des traductions. Ton rôle est de dire lesquelles sont RÉELLEMENT fautives — les premiers correcteurs se trompent parfois et signalent comme « mot inexistant » un mot parfaitement courant.';
  const user = 'Pour CHAQUE reproche ci-dessous, dis s\'il est justifié.\n' + list
    + '\nRéponds UNIQUEMENT en JSON : {"verdicts":[{"n":1,"fautif":true/false,"pourquoi":"court"}]} — une entrée par numéro. '
    + 'fautif=true seulement si la traduction est VRAIMENT fautive (sens, genre, accord, orthographe, mot réellement inexistant). '
    + 'fautif=false si le reproche est infondé (le mot existe bien, la forme est correcte, ou ce n\'est qu\'une préférence de style).';
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  const chain = ['mistral', 'gemini', 'cohere', 'deepseek', 'together', 'xai', 'groq'].filter((id) => !exclude.includes(id));
  let raw = null, by = null;
  for (const id of chain) {
    if (raw) break;
    raw = id === 'mistral' ? await callMistral(msgs, true)
      : id === 'gemini' ? await callGemini(msgs)
      : id === 'groq' ? await callGroq(msgs, true)
      : await callCompat(id, msgs, true);
    if (raw) by = id;
  }
  const j = parseJson(raw);
  if (!j || !Array.isArray(j.verdicts)) return { available: false, kept: hard, dismissed: [], by: null };
  const kept = [], dismissed = [];
  hard.forEach((p, i) => {
    const v = j.verdicts.find((x) => Number(x && x.n) === i + 1);
    /* Sans verdict explicite « non fautif », on GARDE la faute (prudence). */
    if (v && v.fautif === false) dismissed.push(p + '  [écarté par ' + by + ' : ' + (v.pourquoi || 'reproche infondé') + ']');
    else kept.push(p);
  });
  return { available: true, kept, dismissed, by };
}

/* ---------- Patch de data.js (complète t:{…} de chaque ligne) ---------- */
function patchStory(st, tr) {
  let src = fs.readFileSync(DATA, 'utf8');
  const startTag = 'id:"' + st.id + '"';
  const at = src.indexOf(startTag);
  if (at < 0) throw new Error('histoire introuvable dans data.js: ' + st.id);
  let end = src.indexOf('id:"', at + startTag.length); if (end < 0) end = src.length;
  let block = src.slice(at, end);
  if (/[,{]\s*pl\s*:/.test(block)) throw new Error('histoire déjà (partiellement) traduite: ' + st.id);
  let i = 0;
  block = block.replace(/t:\{[^}]*\}/g, (m) => {
    if (i >= tr.lignes.length) return m;
    const add = L2.map((lg) => lg + ':' + JSON.stringify(String(tr.lignes[i][lg]))).join(', ');
    i++;
    return m.slice(0, -1) + ', ' + add + '}';
  });
  if (i !== st.lignes.length) throw new Error('lignes patchées ' + i + ' ≠ ' + st.lignes.length + ' (' + st.id + ')');
  src = src.slice(0, at) + block + src.slice(end);
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
  const limit = parseInt(argv('--limit') || '2', 10) || 2;
  const ctx = loadData();
  const stories = ctx.STORIES || [];
  /* ORDRE STRICT : la 1re histoire non traduite d'abord (chaîne de déblocage + carte accueil) */
  const todo = stories.filter(needsTranslation).slice(0, limit);
  if (!todo.length) { console.log('OK: rien à faire — toutes les histoires sont déjà traduites dans les 14 langues.'); process.exit(0); }

  let done = 0;
  for (const st of todo) {
    let tr = null, by = 'groq';
    if (dry && argv('--from-file')) {
      const file = JSON.parse(fs.readFileSync(argv('--from-file'), 'utf8'));
      if (file.id !== st.id) { console.log('SKIP ' + st.id + ' : le fichier fourni est pour ' + file.id); continue; }
      tr = file;
      normalizePunct(st, tr);
      const e0 = validateTranslations(st, tr);
      if (e0.length) { console.log('REJET structurel ' + st.id + ' : ' + e0.slice(0, 5).join(' | ')); continue; }
    } else {
      /* CHANGEMENT DE TRADUCTEUR en cas de rejet structurel : un même modèle refait
         la même faute (« 私の » réinjecté dans le coréen à chaque essai sur « anniv »).
         On passe donc au fournisseur suivant plutôt que de re-solliciter le fautif. */
      const tried = [];
      for (let k = 0; k < 3 && !tr; k++) {
        const g = await translateStory(st, tried);
        if (!g.by) break;                       /* plus aucun traducteur disponible */
        tried.push(g.by);
        if (!g.tr) { console.log('   ' + st.id + ' : réponse illisible de ' + g.by + ' → traducteur suivant'); continue; }
        normalizePunct(st, g.tr);
        const e = validateTranslations(st, g.tr);
        if (!e.length) { tr = g.tr; by = g.by; break; }
        console.log('   ' + st.id + ' : rejet structurel (' + g.by + ') — ' + e.slice(0, 3).join(' | ') + ' → traducteur suivant');
      }
      if (!tr) { console.log('REJET structurel ' + st.id + ' : aucun traducteur n\'a produit un texte propre (essayés : ' + (tried.join(', ') || 'aucun') + ').'); continue; }
      console.log('   traducteur retenu : ' + by);
    }
    if (!dry) {
      const judged = await judgeTranslations(st, tr, by);
      if (!judged.available) { console.log('SKIP ' + st.id + ' : juge indisponible.'); continue; }
      (judged.dismissed || []).forEach((d) => console.log('   reproche écarté (2e juge) : ' + d));
      if (!judged.ok) { console.log('REJET (second avis' + (judged.confirmedBy ? ', confirmé par ' + judged.confirmedBy : '') + ') ' + st.id + ' : ' + (judged.hard || []).slice(0, 5).join(' | ')); continue; }
    }
    patchStory(st, tr);
    /* re-vérifie après patch : les 14 langues présentes sur CHAQUE ligne de cette histoire */
    const ctx2 = loadData();
    const st2 = (ctx2.STORIES || []).find((x) => x.id === st.id);
    const bad = !st2 || st2.lignes.some((l) => ['en','it','es','de','pt','nl'].concat(L2).some((lg) => typeof l.t[lg] !== 'string' || !l.t[lg].trim()));
    if (bad) { console.log('ERREUR post-patch ' + st.id + ' — data.js à vérifier'); process.exit(1); }
    console.log('OK: « ' + st.titre + ' » (' + st.id + ') traduite en 8 langues supplémentaires.');
    done++;
  }
  if (done) {
    const nv = bumpVersion();
    const reste = loadData().STORIES.filter(needsTranslation).length;
    console.log('OK: ' + done + ' histoire(s) complétée(s) → ' + nv + '. Reste à traduire : ' + reste + '.');
  } else { console.log('Rien de publié ce coup-ci (rejets/indisponibilité) — sans risque, on réessaiera.'); }
  process.exit(0);
})().catch((e) => { console.log('SKIP erreur: ' + (e && e.message || e)); process.exit(0); });
