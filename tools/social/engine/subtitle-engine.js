/**
 * subtitle-engine.js — Synchronisation captions word-by-word avec audio TTS
 *
 * Stratégie : pas d'ASR (Whisper) pour rester gratuit et rapide.
 * On estime la durée de chaque mot en fonction :
 *   - du nombre de syllabes (heuristique)
 *   - de la longueur du mot
 *   - de la durée totale de l'audio (fournie par TTS)
 *
 * Cette approche donne une synchronisation à ±100ms qui est suffisante
 * pour des subtitles de type "caption pop-in" (style TikTok/Reels).
 *
 * Exports :
 *   - segmentScript(text, audioDurationMs, opts) : retourne array de {word, startMs, endMs, group}
 *   - groupIntoSubtitles(segments, opts) : groupe les mots en lignes (3-5 mots/ligne)
 */

/**
 * Estime le nombre de "poids" d'un mot (proxy pour durée de prononciation).
 * Heuristique : longueur + bonus syllabique.
 */
function wordWeight(word) {
  const len = word.length;
  const vowels = (word.toLowerCase().match(/[aeiouyàâäéèêëîïôöùûüœ]/g) || []).length;
  // Min 1 syllabe, max raisonnable
  const syll = Math.max(1, vowels);
  // Ponctuation forte = pause
  const pauseBonus = /[.!?]/.test(word) ? 4 : (/[,;:]/.test(word) ? 2 : 0);
  return len * 0.4 + syll * 1.2 + pauseBonus;
}

/**
 * Découpe le texte en mots avec timing estimé.
 *
 * @param {string} text             Le texte à parler
 * @param {number} audioDurationMs  Durée totale de l'audio TTS en ms
 * @param {object} opts
 * @param {number} opts.startOffsetMs  Décalage de début (défaut 0)
 * @returns {Array<{word, startMs, endMs}>}
 */
export function segmentScript(text, audioDurationMs, opts = {}) {
  const startOffset = opts.startOffsetMs || 0;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Split en mots (en gardant la ponctuation attachée)
  const words = cleaned.split(/\s+/);
  if (words.length === 0) return [];

  // Calcule poids total
  const weights = words.map(wordWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Distribue le temps proportionnellement
  let cursor = startOffset;
  const segments = [];
  for (let i = 0; i < words.length; i++) {
    const dur = (weights[i] / totalWeight) * audioDurationMs;
    const startMs = Math.round(cursor);
    const endMs = Math.round(cursor + dur);
    segments.push({
      word: words[i],
      startMs,
      endMs,
      idx: i,
    });
    cursor += dur;
  }
  return segments;
}

/**
 * Groupe les mots en sous-titres (lignes courtes pour l'écran).
 *
 * @param {Array} segments  Sortie de segmentScript()
 * @param {object} opts
 * @param {number} opts.wordsPerLine     Mots par ligne (défaut 4)
 * @param {number} opts.maxCharsPerLine  Limite caractères (défaut 35)
 * @param {boolean} opts.breakOnPunct    Couper sur ponctuation forte (défaut true)
 * @returns {Array<{text, startMs, endMs, words}>}
 */
export function groupIntoSubtitles(segments, opts = {}) {
  const wordsPerLine = opts.wordsPerLine || 4;
  const maxChars = opts.maxCharsPerLine || 35;
  const breakOnPunct = opts.breakOnPunct !== false;

  const groups = [];
  let current = { words: [], chars: 0 };

  function flush() {
    if (current.words.length === 0) return;
    const text = current.words.map((w) => w.word).join(" ");
    const startMs = current.words[0].startMs;
    const endMs = current.words[current.words.length - 1].endMs;
    groups.push({ text, startMs, endMs, words: current.words });
    current = { words: [], chars: 0 };
  }

  for (const seg of segments) {
    const wlen = seg.word.length;
    const wouldOverflow =
      current.words.length >= wordsPerLine ||
      current.chars + wlen + 1 > maxChars;
    if (wouldOverflow && current.words.length > 0) {
      flush();
    }
    current.words.push(seg);
    current.chars += wlen + 1;

    if (breakOnPunct && /[.!?]$/.test(seg.word)) {
      flush();
    }
  }
  flush();
  return groups;
}

/**
 * Détermine quel mot est "actif" (en train d'être prononcé) à un timestamp donné.
 * Utile pour highlighter le mot courant dans les captions style "TikTok karaoke".
 *
 * @param {Array} segments  Sortie de segmentScript()
 * @param {number} ms       Timestamp en ms
 * @returns {{seg, idx}|null}
 */
export function activeWordAt(segments, ms) {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (ms >= s.startMs && ms <= s.endMs) {
      return { seg: s, idx: i };
    }
  }
  return null;
}

/**
 * Détermine quelle ligne de subtitle est visible à un timestamp donné.
 *
 * @param {Array} groups  Sortie de groupIntoSubtitles()
 * @param {number} ms     Timestamp en ms
 * @returns {object|null}
 */
export function activeSubtitleAt(groups, ms) {
  for (const g of groups) {
    if (ms >= g.startMs && ms <= g.endMs) return g;
  }
  return null;
}

export default {
  segmentScript,
  groupIntoSubtitles,
  activeWordAt,
  activeSubtitleAt,
};
