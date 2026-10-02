#!/usr/bin/env node
/* ÉCRITURE LATINE PRÉ-CALCULÉE pour le chinois (pinyin) et le japonais (rōmaji) — Lingua 2.10.
 * Kevin 2.10 : « Améliorations de tous les axes au maximum », audit : aucune écriture latine sous le
 * chinois, le japonais, le coréen, le russe, l'ukrainien → indispensable à un enfant débutant.
 * Le russe, l'ukrainien, le coréen et les kanas se transcrivent par règles DANS l'app. Le chinois et les
 * kanjis japonais demandent un dictionnaire : on le passe UNE fois ici, et l'app reçoit le résultat
 * (lingua/translit.js) — aucune bibliothèque chargée, aucune requête au moment de l'usage (gratuit).
 * Bibliothèques (lancement seulement, jamais servies) : pinyin-pro (MIT), kuroshiro (MIT) + kuromoji (Apache-2.0).
 *   npm i --no-save pinyin-pro kuroshiro@1.2.0 kuroshiro-analyzer-kuromoji@1.1.0
 *   node tools/lingua/translit-gen.mjs        (réécrit lingua/translit.js)
 * Garde : tests/verify-lingua-translit.mjs (chaque mot zh/ja a sa transcription). */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(process.env.NODE_MODULES_DIR ? process.env.NODE_MODULES_DIR + '/' : import.meta.url);
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync('lingua/data.js', 'utf8'), ctx);
const mots = (k) => { const s = new Set(); ctx.COURSES[k].units.forEach((u) => u.lessons.forEach((l) => l.words.forEach((w) => s.add(w.t)))); return [...s].sort(); };
const { pinyin } = require('pinyin-pro');
const zh = {}; for (const m of mots('zh')) zh[m] = pinyin(m, { toneType: 'symbol' }).replace(/\s+([，。！？、,.!?])/g, '$1').replace(/\s+/g, ' ').trim();
const Kuroshiro = require('kuroshiro').default || require('kuroshiro');
const Analyzer = require('kuroshiro-analyzer-kuromoji');
const an = new Analyzer(); const k = new Kuroshiro(); await k.init(an);
/* « Rien de FAUX ne se publie » (règle Lingua) : un mot que l'analyseur lit comme un NOM PROPRE (« 章 » → « akira »)
   ou dont un kanji n'a pas de lecture est ÉCARTÉ — pas d'aide plutôt qu'une aide fausse. */
const ja = {}, ecartes = [];
for (const m of mots('ja')) {
  const toks = await an.parse(m);
  const douteux = /[\u4e00-\u9fff]/.test(m) && toks.some((t) => t.pos_detail_1 === '固有名詞' || (/[\u4e00-\u9fff]/.test(t.surface_form) && (!t.reading || t.reading === '*')));
  if (douteux) { ecartes.push(m); continue; }
  ja[m] = (await k.convert(m, { to: 'romaji', mode: 'spaced', romajiSystem: 'hepburn' })).replace(/\s+/g, ' ').trim();
}
const entete = '/* KDMC Lingua — écriture latine pré-calculée (pinyin, rōmaji). GÉNÉRÉ par tools/lingua/translit-gen.mjs — ne pas éditer à la main.\n   Sources : pinyin-pro (MIT), kuroshiro (MIT) + kuromoji (Apache-2.0), passés une fois au build. */\n';
writeFileSync('lingua/translit.js', entete + 'var TRANSLIT = ' + JSON.stringify({ zh, ja }) + ';\n');
console.log(`translit.js : ${Object.keys(zh).length} mots chinois, ${Object.keys(ja).length} mots japonais (${ecartes.length} écartés, lecture douteuse : ${ecartes.slice(0, 12).join(' ')}…)`);
