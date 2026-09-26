// message-grouping.js — Groupage des bulles par expéditeur (parité WhatsApp).
//
// WhatsApp resserre les messages consécutifs d'un même expéditeur (peu d'espace
// entre eux) et ne met la « pointe » (coin biseauté) que sur la DERNIÈRE bulle
// d'une série ; une nouvelle série (changement d'expéditeur OU trou de temps)
// reprend un espacement plus large. La DÉCISION est PURE (testable 100 %) ; les
// classes CSS (grp-start / grp-end) et le rendu vivent dans index.html et sont
// prouvés au navigateur réel (Playwright).

export const DEFAULT_GAP_MS = 180000; // 3 min — au-delà, on repart sur une nouvelle série.

function ts(m) {
  const v = m && m.ts;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ce message ouvre-t-il une nouvelle série ? (1ᵉʳ message, expéditeur différent
 * du précédent, ou trou de temps supérieur au seuil.)
 * @param {object|null} prev — message précédent (ou null).
 * @param {object} m — message courant.
 * @param {number} [gapMs=180000]
 * @returns {boolean}
 */
export function isGroupStart(prev, m, gapMs = DEFAULT_GAP_MS) {
  if (!m) return true;
  if (!prev) return true;
  if (prev.from !== m.from) return true;
  const g = Number.isFinite(gapMs) ? gapMs : DEFAULT_GAP_MS;
  return ts(m) - ts(prev) > g;
}

/**
 * Ce message termine-t-il la série ? (dernier message, expéditeur suivant
 * différent, ou trou de temps). C'est lui qui portera la pointe.
 * @param {object} m — message courant.
 * @param {object|null} next — message suivant (ou null).
 * @param {number} [gapMs=180000]
 * @returns {boolean}
 */
export function isGroupEnd(m, next, gapMs = DEFAULT_GAP_MS) {
  if (!m) return true;
  if (!next) return true;
  if (next.from !== m.from) return true;
  const g = Number.isFinite(gapMs) ? gapMs : DEFAULT_GAP_MS;
  return ts(next) - ts(m) > g;
}

/**
 * Drapeaux de groupage d'un message donné son voisin précédent et suivant.
 * @param {object|null} prev
 * @param {object} m
 * @param {object|null} next
 * @param {number} [gapMs=180000]
 * @returns {{first:boolean,last:boolean}}
 */
export function groupFlags(prev, m, next, gapMs = DEFAULT_GAP_MS) {
  return { first: isGroupStart(prev, m, gapMs), last: isGroupEnd(m, next, gapMs) };
}

/**
 * Chaîne de classes CSS de groupage (« grp-start » et/ou « grp-end »).
 * @param {object|null} prev
 * @param {object} m
 * @param {object|null} next
 * @param {number} [gapMs=180000]
 * @returns {string} ex. " grp-start grp-end" (préfixé d'un espace, prêt à concaténer).
 */
export function groupClass(prev, m, next, gapMs = DEFAULT_GAP_MS) {
  const f = groupFlags(prev, m, next, gapMs);
  return (f.first ? ' grp-start' : '') + (f.last ? ' grp-end' : '');
}

export default { isGroupStart, isGroupEnd, groupFlags, groupClass, DEFAULT_GAP_MS };

// Compat navigateur : window.ApexGrouping pour le code <script> d'index.html.
if (typeof window !== 'undefined') {
  window.ApexGrouping = { isGroupStart, isGroupEnd, groupFlags, groupClass, DEFAULT_GAP_MS };
}
