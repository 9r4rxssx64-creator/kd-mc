#!/usr/bin/env node
/* Lingua — VÉRITÉ, RIEN DE FAUX, PARTOUT TOUJOURS (Kevin 2026-08-09).

   Vérifie TOUT le contenu de Lingua, pas seulement les histoires auto-générées :
     - CURRICULUM : chaque mot / phrase traduit dans les 6 langues (parité, aucun vide).
     - STORIES    : chaque ligne dans les 6 langues + quiz cohérent (bonne réponse dans les bornes).
     - PHRASEBOOK : chaque entrée dans les 6 langues.

   Deux modes :
     --struct    (défaut, 0 clé) : contrôle STRUCTUREL déterministe. Exit 1 si le MOINDRE faux
                 structurel (langue manquante/vide, quiz hors bornes, id en double). = garde CI « toujours ».
     --semantic  : SECOND AVIS INDÉPENDANT (modèle IA) sur les traductions + réponses de quiz.
                 N'ÉDITE JAMAIS : écrit un rapport des points DOUTEUX (audit/lingua-verite.md) pour revue.
                 (Un juge IA peut se tromper → on signale, on ne supprime pas à l'aveugle : règle « vérifier avant d'agir ».)
*/
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const DATA = path.join(ROOT, 'data.js');
const LANGS = ['en', 'it', 'es', 'de', 'pt', 'nl'];
const LNAMES = { en: 'anglais', it: 'italien', es: 'espagnol', de: 'allemand', pt: 'portugais', nl: 'néerlandais' };
/* Les 8 langues Est+Asie : leurs histoires n'étaient PAS relues sur le sens (angle mort
   trouvé le 2026-08-11) — c'est précisément là qu'ont dormi 67 fautes réelles avant d'être
   attrapées à la main. La passe sémantique les couvre désormais aussi. */
const L2 = ['pl', 'ru', 'uk', 'cs', 'zh', 'ja', 'ko', 'ar'];
const L2NAMES = { pl: 'polonais', ru: 'russe', uk: 'ukrainien', cs: 'tchèque', zh: 'chinois (mandarin simplifié)', ja: 'japonais', ko: 'coréen', ar: 'arabe (standard moderne)' };
const mode = process.argv.includes('--semantic') ? 'semantic' : 'struct';

function load() { const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx); return ctx; }

/* ---------------- Contrôle STRUCTUREL (déterministe, sans IA) ---------------- */
function structCheck(ctx) {
  const errs = [];
  const { CURRICULUM = [], LEX = {}, STORIES = [], PHRASEBOOK = {} } = ctx;
  // 1) CURRICULUM → LEX : chaque mot/phrase traduit dans les 6 langues, non vide
  const terms = new Set();
  CURRICULUM.forEach((u) => (u.L || []).forEach((l) => { (l.w || []).forEach((w) => terms.add(w)); (l.p || []).forEach((p) => terms.add(p)); }));
  terms.forEach((t) => LANGS.forEach((lg) => { const v = LEX[lg] && LEX[lg][t]; if (typeof v !== 'string' || !v.trim()) errs.push('CURRICULUM « ' + t +' » : ' + lg + ' manquant/vide'); }));
  // 2) LEX parité : mêmes clés dans les 6 langues
  const base = Object.keys(LEX.en || {});
  LANGS.forEach((lg) => { const k = new Set(Object.keys(LEX[lg] || {})); base.forEach((key) => { if (!k.has(key)) errs.push('LEX « ' + key + ' » absent en ' + lg); }); });
  // 3) STORIES
  const ids = new Set();
  STORIES.forEach((st, si) => {
    if (!st.id) errs.push('STORY#' + si + ' sans id'); else if (ids.has(st.id)) errs.push('STORY id en double : ' + st.id); ids.add(st.id);
    (st.lignes || []).forEach((l, i) => {
      if (typeof l.fr !== 'string' || !l.fr.trim()) errs.push(st.id + ' ligne ' + i + ' : fr vide');
      LANGS.forEach((lg) => { const v = l.t && l.t[lg]; if (typeof v !== 'string' || !v.trim()) errs.push(st.id + ' ligne ' + i + ' : ' + lg + ' manquant/vide'); });
    });
    (st.quiz || []).forEach((q, i) => {
      if (typeof q.q !== 'string' || !q.q.trim()) errs.push(st.id + ' q' + i + ' : question vide');
      if (!Array.isArray(q.opts) || q.opts.length < 2) errs.push(st.id + ' q' + i + ' : <2 options');
      if (typeof q.ok !== 'number' || q.ok < 0 || q.ok >= (q.opts || []).length) errs.push(st.id + ' q' + i + ' : bonne réponse hors bornes');
    });
  });
  // 3bis) PURETÉ D'ÉCRITURE + PONCTUATION des histoires (leçon des passages 1-11 :
  //   japonais dans le coréen, chinois dans l'arabe, « ؟ » sur des affirmatives — publiés
  //   avant d'être attrapés). Déterministe : bloque toute récidive.
  //   Règle ASYMÉTRIQUE : un « ? » final sans question française = faux ; l'inverse est
  //   toléré (une question française peut se traduire par une tournure de demande).
  const SCRIPT_BANS = {
    cjk: /[一-鿿぀-ゟ゠-ヿ]/, hangul: /[가-힣]/,
    cyr: /[Ѐ-ӿ]/, arab: /[؀-ۿ]/, kana: /[぀-ゟ゠-ヿ]/,
    fw: /[！？。，]/,
  };
  const ALL14 = LANGS.concat(ctx.LANGS2 || []);
  STORIES.forEach((st) => (st.lignes || []).forEach((l, i) => {
    const frQ = /\?\s*$/.test(String(l.fr || '').trim());
    ALL14.forEach((lg) => {
      const v = l.t && typeof l.t[lg] === 'string' ? l.t[lg].trim() : '';
      if (!v) return;
      const where = st.id + ' ligne ' + i + ' (' + lg + ')';
      if (!frQ && /[?？؟]\s*$/.test(v)) errs.push(where + ' : « ? » final sans question française — ' + v);
      if (lg !== 'zh' && lg !== 'ja' && SCRIPT_BANS.cjk.test(v)) errs.push(where + ' : caractère chinois/japonais égaré — ' + v);
      if (lg !== 'ko' && SCRIPT_BANS.hangul.test(v)) errs.push(where + ' : hangul égaré — ' + v);
      if (lg !== 'ru' && lg !== 'uk' && SCRIPT_BANS.cyr.test(v)) errs.push(where + ' : cyrillique égaré — ' + v);
      if (lg !== 'ar' && SCRIPT_BANS.arab.test(v)) errs.push(where + ' : écriture arabe égarée — ' + v);
      if (lg === 'zh' && SCRIPT_BANS.kana.test(v)) errs.push(where + ' : kana japonais en chinois — ' + v);
      if (lg !== 'zh' && lg !== 'ja' && SCRIPT_BANS.fw.test(v)) errs.push(where + ' : ponctuation pleine-chasse hors zh/ja — ' + v);
    });
  }));
  // 4) PHRASEBOOK : 6 langues non vides
  Object.keys(PHRASEBOOK).forEach((fr) => LANGS.forEach((lg) => { const v = PHRASEBOOK[fr] && PHRASEBOOK[fr][lg]; if (typeof v !== 'string' || !v.trim()) errs.push('PHRASEBOOK « ' + fr + ' » : ' + lg + ' manquant/vide'); }));
  // 5) NOUVELLES LANGUES (Est/Asie, cours démarrage) : aucun repli français, parité entre elles
  const { LANGS2 = [], LEX2 = {}, COURSES = {} } = ctx;
  let l2units = 0;
  if (LANGS2.length) {
    const baseKeys = Object.keys(LEX2[LANGS2[0]] || {});
    LANGS2.forEach((lg) => {
      const lex = LEX2[lg] || {};
      Object.keys(lex).forEach((k) => { if (typeof lex[k] !== 'string' || !lex[k].trim()) errs.push('LEX2 « ' + k + ' » : ' + lg + ' vide'); });
      // parité du démarrage : mêmes clés dans toutes les nouvelles langues
      const ks = new Set(Object.keys(lex));
      baseKeys.forEach((k) => { if (!ks.has(k)) errs.push('LEX2 « ' + k + ' » absent en ' + lg); });
      Object.keys(lex).forEach((k) => { if (!baseKeys.includes(k)) errs.push('LEX2 « ' + k + ' » présent en ' + lg + ' mais pas dans ' + LANGS2[0]); });
      // le cours généré ne doit contenir AUCUN repli français (mot affiché = traduction du lexique)
      const c = COURSES[lg];
      if (!c || !c.units || !c.units.length) { errs.push('COURSES.' + lg + ' : aucune unité générée'); return; }
      l2units += c.units.length;
      c.units.forEach((u) => u.lessons.forEach((le) => {
        le.words.concat(le.phrases || []).forEach((w) => { if (!lex[w.fr] || lex[w.fr] !== w.t) errs.push('COURSES.' + lg + ' « ' + w.fr + ' » : repli français ou incohérence'); });
      }));
    });
  }
  /* 6) VERBES_FR (Kevin 2026-08-11 : « exercices sur les verbes »).
     Les séances de verbes n'entraînent QUE cette liste. Trois faux possibles, tous bloqués ici :
       (a) un mot qui n'est PAS un verbe (« beurre », « lettre » — le piège d'une détection
           automatique en -er/-ir/-re, d'où une liste explicite dans data.js) ;
       (b) un verbe absent du programme → l'exercice ne pourrait pas être construit ;
       (c) un verbe non traduit dans une des 14 langues → on enseignerait du vide. */
  /* 5-bis) DÉCLARÉ ≠ BRANCHÉ (Kevin, règle du projet ; vécu le 2026-08-11).
     Une vague de vocabulaire écrite APRÈS la génération de COURSES atterrit dans CURRICULUM
     mais JAMAIS dans les cours : 17 verbes présents dans les données, 0 visible dans l'app,
     et tous les compteurs disaient « ajoutés ». Ce contrôle compare ce qui est déclaré à ce
     qui est réellement servi à l'utilisateur, langue par langue. */
  const declares = new Set(); CURRICULUM.forEach((u) => (u.L || []).forEach((l) => (l.w || []).forEach((w) => declares.add(w))));
  LANGS.forEach((lg) => {
    const c = COURSES[lg]; if (!c) { errs.push('COURSES.' + lg + ' : cours absent'); return; }
    const servis = new Set(); c.units.forEach((u) => u.lessons.forEach((le) => le.words.forEach((w) => servis.add(w.fr))));
    const perdus = [...declares].filter((t) => !servis.has(t));
    if (perdus.length) errs.push('DÉCLARÉ MAIS PAS BRANCHÉ — ' + perdus.length + ' terme(s) dans CURRICULUM absent(s) du cours ' + lg
      + ' (ex : ' + perdus.slice(0, 4).join(', ') + '). Une vague écrite APRÈS la génération de COURSES est invisible dans l\'app.');
  });
  const { VERBES_FR = [] } = ctx;
  if (VERBES_FR.length) {
    /* et chaque verbe entraîné doit être réellement servi, sinon la séance ne peut pas le poser */
    const c0 = COURSES[LANGS[0]];
    if (c0) { const s0 = new Set(); c0.units.forEach((u) => u.lessons.forEach((le) => le.words.forEach((w) => s0.add(w.fr))));
      const invisibles = VERBES_FR.filter((v) => !s0.has(v));
      if (invisibles.length) errs.push('VERBES_FR : ' + invisibles.length + ' verbe(s) jamais servi(s) par le cours (ex : ' + invisibles.slice(0, 4).join(', ') + ')'); }
    const vus = new Set();
    VERBES_FR.forEach((v) => {
      if (vus.has(v)) errs.push('VERBES_FR « ' + v + ' » en double');
      vus.add(v);
      if (!terms.has(v)) errs.push('VERBES_FR « ' + v + ' » : absent du programme (exercice impossible)');
      LANGS.forEach((lg) => { const t = LEX[lg] && LEX[lg][v]; if (typeof t !== 'string' || !t.trim()) errs.push('VERBES_FR « ' + v + ' » : ' + lg + ' manquant'); });
      (ctx.LANGS2 || []).forEach((lg) => { const t = (ctx.LEX2 && ctx.LEX2[lg] && ctx.LEX2[lg][v]) || (LEX[lg] && LEX[lg][v]); if (typeof t !== 'string' || !t.trim()) errs.push('VERBES_FR « ' + v + ' » : ' + lg + ' manquant'); });
    });
    /* GARDE-BARRIÈRE (cliquet). HONNÊTETÉ : aucun contrôle automatique ne sait dire qu'un mot
       est un verbe. Une règle « finit par -er/-ir/-re » laisse passer « beurre » et « lettre »
       (mesuré : sabotage du 2026-08-11, « beurre » ajouté → gate VERT à tort). La vraie
       protection n'est donc PAS une forme, c'est : la liste est humainement revue, ET toute
       modification fait ÉCHOUER ce gate tant qu'un humain n'a pas relu et re-figé l'empreinte.
       Re-figer volontairement : node tools/lingua/verify-truth.mjs lingua --fige-verbes */
    const empreinte = crypto.createHash('sha256').update(VERBES_FR.slice().sort().join('|')).digest('hex').slice(0, 16);
    const refPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'verbes-baseline.json');
    if (process.argv.includes('--fige-verbes')) {
      fs.writeFileSync(refPath, JSON.stringify({ n: VERBES_FR.length, sha: empreinte }, null, 2) + '\n');
      console.log('Empreinte des verbes re-figée : ' + VERBES_FR.length + ' verbes, sha ' + empreinte);
    } else if (fs.existsSync(refPath)) {
      const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
      if (ref.sha !== empreinte) {
        errs.push('VERBES_FR a changé (' + ref.n + ' → ' + VERBES_FR.length + ' verbes, sha ' + ref.sha + ' → ' + empreinte + ') : '
          + 'un humain doit relire les entrées ajoutées (est-ce bien un VERBE ?), puis re-figer avec --fige-verbes');
      }
    } else errs.push('verbes-baseline.json manquant : lancer --fige-verbes après relecture de la liste');
  }
  return { errs, counts: { terms: terms.size, lex: base.length, stories: STORIES.length, phrases: Object.keys(PHRASEBOOK).length, langs2: LANGS2.length, l2units, verbes: VERBES_FR.length } };
}

/* ---------------- SECOND AVIS INDÉPENDANT (IA) — audit, n'édite pas ---------------- */
async function callMistral(messages) {
  if (!process.env.MISTRAL_API_KEY) return null;
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.MISTRAL_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'mistral-small-latest', messages, max_tokens: 1200, temperature: 0.2, response_format: { type: 'json_object' } }) });
  if (!r.ok) return null; const j = await r.json(); return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}
async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) return null;
  const sys = messages.find((m) => m.role === 'system'); const rest = messages.filter((m) => m.role !== 'system');
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys.content }] } : undefined, contents: rest.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1200, temperature: 0.2 } }) });
  if (!r.ok) return null; const j = await r.json(); return j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
}
function parse(t) { if (!t) return null; try { const m = t.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : t); } catch { return null; } }

async function semanticAudit(ctx) {
  const { STORIES = [] } = ctx;
  const suspects = [];
  for (const st of STORIES) {
    const pairs = [];
    st.lignes.forEach((l) => LANGS.forEach((lg) => pairs.push('[' + LNAMES[lg] + '] "' + l.fr + '" => "' + l.t[lg] + '"')));
    const histoireFr = st.lignes.map((l) => l.qui + ' ' + l.fr).join('\n');
    const quizTxt = st.quiz.map((q, i) => 'Q' + (i + 1) + ' : ' + q.q + ' | options: [' + q.opts.join(' , ') + '] | réponse annoncée: "' + q.opts[q.ok] + '"').join('\n');
    const sys = "Tu es correcteur plurilingue rigoureux et PRUDENT. Tu ne signales QUE les erreurs CERTAINES et flagrantes, jamais le style ni un doute.";
    const user = 'Traductions FR→langue :\n' + pairs.join('\n')
      + "\n\nHistoire (🐝=Bee, une abeille de genre FÉMININ → « obrigada », « contente », « prête », « stanca » sont CORRECTS pour elle ; 🧑=l'ami) :\n" + histoireFr + '\n' + quizTxt
      + '\nSignale UNIQUEMENT les traductions VRAIMENT fausses (contresens, mauvais mot, faute d\'orthographe évidente) ou une réponse de quiz réellement incorrecte. RÈGLES ANTI-FAUX-ALERTE, à respecter absolument :'
      + '\n- si ta « correction » est IDENTIQUE à la traduction donnée, ce n\'est PAS une erreur → ne la signale pas ;'
      + '\n- un mot français neutre (collègue, photo, ami) peut légitimement prendre le masculin par défaut dans la langue cible → NE signale pas ;'
      + '\n- Bee est FÉMININE : les accords féminins la concernant sont corrects ;'
      + '\n- le pt est du portugais EUROPÉEN (Portugal) : « desporto », « depressa », « pequeno-almoço », « autocarro » sont CORRECTS — ne propose JAMAIS la variante brésilienne ;'
      + '\n- une contraction anglaise (it\'s vs it is), un synonyme valable ou un temps verbal équivalent ne sont PAS des erreurs ;'
      + '\n- ignore le style et la simple « préférence » ; en cas de doute, NE signale PAS.'
      + '\nRéponds UNIQUEMENT en JSON : {"faux": [{"langue":"la langue","fr":"la phrase française","traduction":"la traduction fautive","correction":"la bonne traduction (DIFFÉRENTE de la fautive)","raison":"en 6 mots max"}]}. Liste VIDE si tout est correct.';
    const raw = (await callGemini([{ role: 'system', content: sys }, { role: 'user', content: user }])) || (await callMistral([{ role: 'system', content: sys }, { role: 'user', content: user }]));
    const j = parse(raw);
    if (!j) { suspects.push({ story: st.id, notes: ['juge indisponible (ni Gemini ni Mistral)'] }); break; }
    const arr = Array.isArray(j.faux) ? j.faux : [];
    // Normalise en chaînes lisibles + jette le bruit (items sans paire fr/traduction, ou run-on absurde)
    const notes = arr.map((f) => {
      if (typeof f === 'string') return f.length <= 200 ? f : null;
      if (f && typeof f === 'object') {
        const fr = String(f.fr || '').slice(0, 80), tr = String(f.traduction || '').slice(0, 80), co = String(f.correction || '').slice(0, 80), lg = String(f.langue || '').slice(0, 20), ra = String(f.raison || '').slice(0, 60);
        if (!fr || !tr) return null; // sans paire concrète = bruit → ignoré
        if (co && co.trim().toLowerCase() === tr.trim().toLowerCase()) return null; // « correction » identique = faux positif
        return '[' + lg + '] "' + fr + '" => "' + tr + '"  (proposé: "' + co + '" · ' + ra + ')';
      }
      return null;
    }).filter(Boolean);
    if (notes.length) suspects.push({ story: st.id, notes });

    /* 2e passe : les 8 langues Est+Asie (appel séparé — 14 langues d'un coup noierait le juge). */
    const notes2 = await auditStoryL2(st);
    if (notes2.length) suspects.push({ story: st.id + ' (Est+Asie)', notes: notes2 });
  }
  return suspects;
}

/* Relecture du sens pour pl/ru/uk/cs/zh/ja/ko/ar. Mêmes garde-fous anti-fausse-alerte que
   la passe 6-langues, PLUS ceux appris à la dure : ne pas déclarer inexistant un mot courant
   (le juge a rejeté « dort » en tchèque — gâteau — en l'employant dans sa propre correction),
   et ne pas exiger un « ? » quand le français n'en a pas. */
async function auditStoryL2(st) {
  const pairs = [];
  st.lignes.forEach((l) => L2.forEach((lg) => { const v = l.t && l.t[lg]; if (v) pairs.push('[' + L2NAMES[lg] + '] "' + l.fr + '" => "' + v + '"'); }));
  if (!pairs.length) return [];
  const sys = 'Tu es correcteur plurilingue rigoureux et PRUDENT (polonais, russe, ukrainien, tchèque, chinois, japonais, coréen, arabe). Tu ne signales QUE les erreurs CERTAINES et flagrantes, jamais le style ni un doute.';
  const user = 'Traductions FR→langue (🐝 Bee est une abeille de genre FÉMININ : les accords féminins la concernant sont CORRECTS) :\n' + pairs.join('\n')
    + '\n\nSignale UNIQUEMENT les traductions VRAIMENT fausses. RÈGLES ANTI-FAUX-ALERTE, à respecter absolument :'
    + '\n- si ta « correction » est IDENTIQUE à la traduction donnée, ce n\'est PAS une erreur → ne la signale pas ;'
    + '\n- ne déclare JAMAIS « ce mot n\'existe pas » sans certitude absolue : « dort » (gâteau) est un mot tchèque courant, « tort » un mot polonais courant ;'
    + '\n- la ponctuation finale suit le FRANÇAIS : une affirmation ne doit PAS finir par « ? » — n\'exige pas un point d\'interrogation absent du français ;'
    + '\n- une tournure de demande (« une table, s\'il vous plaît ») est une traduction légitime d\'une question française ;'
    + '\n- un synonyme valable, un temps équivalent ou un registre poli différent ne sont PAS des erreurs ;'
    + '\n- en cas de doute, NE signale PAS.'
    + '\nRéponds UNIQUEMENT en JSON : {"faux": [{"langue":"la langue","fr":"la phrase française","traduction":"la traduction fautive","correction":"la bonne traduction (DIFFÉRENTE de la fautive)","raison":"en 8 mots max"}]}. Liste VIDE si tout est correct.';
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  const raw = (await callGemini(msgs)) || (await callMistral(msgs));
  const j = parse(raw);
  if (!j) return [];
  const arr = Array.isArray(j.faux) ? j.faux : [];
  return arr.map((f) => {
    if (!f || typeof f !== 'object') return null;
    const fr = String(f.fr || '').slice(0, 80), tr = String(f.traduction || '').slice(0, 80), co = String(f.correction || '').slice(0, 80), lg = String(f.langue || '').slice(0, 24), ra = String(f.raison || '').slice(0, 60);
    if (!fr || !tr) return null;
    if (co && co.trim().toLowerCase() === tr.trim().toLowerCase()) return null;  /* correction identique = faux positif */
    return '[' + lg + '] "' + fr + '" => "' + tr + '"  (proposé: "' + co + '" · ' + ra + ')';
  }).filter(Boolean);
}

/* Audit des MOTS du lexique (extension v2.56 : le juge couvre AUSSI le vocabulaire, pas que les
   histoires). Lots de 30 mots × 6 langues. GARDE ANTI-BIAIS : le pt est du portugais EUROPÉEN
   (pt-PT) — « desporto », « pequeno-almoço », « autocarro », « talho » sont CORRECTS ; ne jamais
   « corriger » vers le brésilien. Erreurs DURES uniquement (contresens / mauvais mot). */
async function wordsAudit(ctx) {
  const { LEX = {} } = ctx;
  const keys = Object.keys(LEX.en || {});
  const suspects = [];
  const BATCH = 30;
  for (let b = 0; b * BATCH < keys.length; b++) {
    const slice = keys.slice(b * BATCH, (b + 1) * BATCH);
    const pairs = slice.map((fr) => '« ' + fr + ' » → en:"' + LEX.en[fr] + '" · it:"' + LEX.it[fr] + '" · es:"' + LEX.es[fr] + '" · de:"' + LEX.de[fr] + '" · pt:"' + LEX.pt[fr] + '" · nl:"' + LEX.nl[fr] + '"');
    const sys = 'Tu es correcteur plurilingue rigoureux et PRUDENT. Tu ne signales QUE les erreurs CERTAINES (contresens, mot faux), jamais le style, jamais un synonyme valable.';
    const user = 'Lexique français → 6 langues :\n' + pairs.join('\n')
      + '\n\nRÈGLES ABSOLUES :'
      + '\n- pt = portugais EUROPÉEN (Portugal) : « desporto », « pequeno-almoço », « talho », « morada », « champô », « autocarro », « telefonar » sont CORRECTS — ne propose JAMAIS la variante brésilienne ;'
      + '\n- un synonyme correct (bonita/hermosa, taart/taartje) n\'est PAS une erreur ;'
      + '\n- les noms allemands prennent une majuscule (correct) ; les verbes donnés à l\'infinitif sont corrects ;'
      + '\n- en cas de doute, NE signale PAS.'
      + '\nSignale UNIQUEMENT une traduction VRAIMENT fausse (le mot ne veut pas dire ça).'
      + '\nRéponds UNIQUEMENT en JSON : {"faux":[{"langue":"...","fr":"le mot français","traduction":"la traduction fautive","correction":"la bonne (DIFFÉRENTE)","raison":"6 mots max"}]}. Liste VIDE si tout est correct.';
    let raw = (await callGemini([{ role: 'system', content: sys }, { role: 'user', content: user }])) || (await callMistral([{ role: 'system', content: sys }, { role: 'user', content: user }]));
    if (!raw) { await new Promise((r) => setTimeout(r, 4000)); raw = (await callGemini([{ role: 'system', content: sys }, { role: 'user', content: user }])) || (await callMistral([{ role: 'system', content: sys }, { role: 'user', content: user }])); }
    const j = parse(raw);
    /* rate-limit sur UN lot → on le note et on CONTINUE (avant : break = les lots suivants jamais audités) */
    if (!j) { suspects.push({ story: 'mots — lot ' + (b + 1), notes: ['juge indisponible sur ce lot (quota) — à réauditer'] }); await new Promise((r) => setTimeout(r, 2000)); continue; }
    const arr = Array.isArray(j.faux) ? j.faux : [];
    const notes = arr.map((f) => {
      if (!f || typeof f !== 'object') return null;
      const fr = String(f.fr || '').slice(0, 60), tr = String(f.traduction || '').slice(0, 60), co = String(f.correction || '').slice(0, 60), lg = String(f.langue || '').slice(0, 20), ra = String(f.raison || '').slice(0, 60);
      if (!fr || !tr) return null;
      if (co && co.trim().toLowerCase() === tr.trim().toLowerCase()) return null;
      return '[' + lg + '] « ' + fr + ' » => "' + tr + '"  (proposé: "' + co + '" · ' + ra + ')';
    }).filter(Boolean);
    if (notes.length) suspects.push({ story: 'mots — lot ' + (b + 1), notes });
    await new Promise((r) => setTimeout(r, 800)); /* espace les appels → moins de rate-limit */
  }
  return suspects;
}

/* Audit des NOUVELLES LANGUES (v2.68 : pl/ru/uk/cs/zh/ja/ko/ar — cours démarrage).
   Mêmes gardes anti-faux-alerte. Choix assumés (à NE PAS « corriger ») : zh/ja « frère/sœur » =
   aîné(e) (哥哥/姐姐, 兄/姉) ; ko = formes dites par une locutrice (오빠/언니, Bee est féminine) ;
   phrases zh/ja segmentées par ESPACES (blocs de mots pour l'appli) = voulu. */
async function words2Audit(ctx) {
  const { LANGS2 = [], LEX2 = {} } = ctx;
  if (!LANGS2.length) return [];
  const NAMES2 = { pl: 'polonais', ru: 'russe', uk: 'ukrainien', cs: 'tchèque', zh: 'chinois (mandarin simplifié)', ja: 'japonais', ko: 'coréen', ar: 'arabe (standard moderne)' };
  const keys = Object.keys(LEX2[LANGS2[0]] || {});
  const suspects = [];
  const BATCH = 25;
  for (let b = 0; b * BATCH < keys.length; b++) {
    const slice = keys.slice(b * BATCH, (b + 1) * BATCH);
    const pairs = slice.map((fr) => '« ' + fr + ' » → ' + LANGS2.map((l) => l + ':"' + LEX2[l][fr] + '"').join(' · '));
    const sys = 'Tu es correcteur plurilingue rigoureux et PRUDENT. Tu ne signales QUE les erreurs CERTAINES (contresens, mot faux), jamais le style, jamais un synonyme valable.';
    const user = 'Lexique français → 8 langues (pl=polonais, ru=russe, uk=ukrainien, cs=tchèque, zh=chinois simplifié, ja=japonais, ko=coréen, ar=arabe standard) :\n' + pairs.join('\n')
      + '\n\nRÈGLES ABSOLUES :'
      + '\n- zh/ja : « frère »=哥哥/兄 et « sœur »=姐姐/姉 (aîné·e) sont des choix pédagogiques CORRECTS ;'
      + '\n- ko : 오빠/언니 (dits par une locutrice) sont CORRECTS — l\'app parle par la voix de Bee, féminine ;'
      + '\n- les phrases zh/ja sont volontairement SEGMENTÉES par espaces (blocs de mots) : ce n\'est PAS une erreur ;'
      + '\n- ar : l\'arabe standard sans voyelles courtes est CORRECT ; le duel (قطان) est CORRECT pour « deux » ;'
      + '\n- un synonyme correct ou un registre voisin n\'est PAS une erreur ; en cas de doute, NE signale PAS.'
      + '\nSignale UNIQUEMENT une traduction VRAIMENT fausse (le mot ne veut pas dire ça).'
      + '\nRéponds UNIQUEMENT en JSON : {"faux":[{"langue":"...","fr":"le mot français","traduction":"la traduction fautive","correction":"la bonne (DIFFÉRENTE)","raison":"6 mots max"}]}. Liste VIDE si tout est correct.';
    let raw = (await callGemini([{ role: 'system', content: sys }, { role: 'user', content: user }])) || (await callMistral([{ role: 'system', content: sys }, { role: 'user', content: user }]));
    if (!raw) { await new Promise((r) => setTimeout(r, 4000)); raw = (await callGemini([{ role: 'system', content: sys }, { role: 'user', content: user }])) || (await callMistral([{ role: 'system', content: sys }, { role: 'user', content: user }])); }
    const j = parse(raw);
    if (!j) { suspects.push({ story: 'nouvelles langues — lot ' + (b + 1), notes: ['juge indisponible sur ce lot (quota) — à réauditer'] }); await new Promise((r) => setTimeout(r, 2000)); continue; }
    const arr = Array.isArray(j.faux) ? j.faux : [];
    const notes = arr.map((f) => {
      if (!f || typeof f !== 'object') return null;
      const fr = String(f.fr || '').slice(0, 60), tr = String(f.traduction || '').slice(0, 60), co = String(f.correction || '').slice(0, 60), lg = String(f.langue || '').slice(0, 30), ra = String(f.raison || '').slice(0, 60);
      if (!fr || !tr) return null;
      if (co && co.trim().toLowerCase() === tr.trim().toLowerCase()) return null;
      return '[' + lg + '] « ' + fr + ' » => "' + tr + '"  (proposé: "' + co + '" · ' + ra + ')';
    }).filter(Boolean);
    if (notes.length) suspects.push({ story: 'nouvelles langues — lot ' + (b + 1), notes });
    await new Promise((r) => setTimeout(r, 800));
  }
  return suspects;
}

/* ---------------- Orchestration ---------------- */
(async () => {
  const ctx = load();
  if (mode === 'struct') {
    const { errs, counts } = structCheck(ctx);
    console.log('VÉRITÉ (structure) — ' + counts.terms + ' mots, ' + counts.lex + ' entrées LEX ×6, ' + counts.stories + ' histoires, ' + counts.phrases + ' phrases' + (counts.langs2 ? ', +' + counts.langs2 + ' nouvelles langues (' + counts.l2units + ' unités démarrage, 0 repli fr)' : '') + (counts.verbes ? ', ' + counts.verbes + ' verbes vérifiés ×14 langues' : '') + '.');
    if (errs.length) { console.log('FAUX STRUCTUREL (' + errs.length + ') :\n - ' + errs.slice(0, 40).join('\n - ')); process.exit(1); }
    console.log('OK : aucun faux structurel — 6 langues partout, quiz dans les bornes, 0 doublon.');
    process.exit(0);
  }
  // semantic : histoires + MOTS du lexique (v2.56 — le juge couvre tout le contenu)
  const suspects = (await semanticAudit(ctx)).concat(await wordsAudit(ctx)).concat(await words2Audit(ctx));
  const outDir = path.resolve('audit'); try { fs.mkdirSync(outDir, { recursive: true }); } catch (_) {}
  const lines = ['# Lingua — audit VÉRITÉ (second avis indépendant)', '', 'Points DOUTEUX à revoir (l\'IA peut se tromper : vérifier avant de corriger).', ''];
  if (!suspects.length) lines.push('✅ Aucun point douteux signalé par le second modèle (histoires + lexique complet).');
  else suspects.forEach((s) => { lines.push('## ' + s.story); (s.notes || []).forEach((f) => lines.push('- ' + String(f))); lines.push(''); });
  fs.writeFileSync(path.join(outDir, 'lingua-verite.md'), lines.join('\n'));
  console.log((suspects.length ? ('SUSPECTS: ' + suspects.length + ' section(s) → audit/lingua-verite.md') : 'OK sémantique : rien de douteux signalé (histoires + lexique).'));
  process.exit(0);
})().catch((e) => { console.log('ERREUR: ' + (e && e.message || e)); process.exit(2); });
