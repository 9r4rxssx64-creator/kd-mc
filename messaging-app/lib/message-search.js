// message-search.js — Recherche « dans cette conversation » (parité WhatsApp).
//
// 100 % côté client, hors-ligne, déterministe, zéro réseau, zéro secret :
// complète la recherche IA (/api/ai/search) qui, elle, exige le réseau + un
// quota. Ici on fait le « rechercher dans le chat » instantané : littéral,
// insensible à la casse ET aux accents, sur le texte réellement lisible d'un
// message (texte, transcription vocale, légende, nom de fichier). Les messages
// supprimés (tombstones) et le ciphertext brut sont ignorés.
//
// Le cœur est une fonction PURE (testable à 100 %). Le DOM (barre, surlignage,
// navigation) vit dans index.html et est prouvé au navigateur réel (Playwright).

/**
 * Normalise pour comparaison : minuscule + suppression des diacritiques.
 * @param {string} s
 * @returns {string}
 */
export function normalizeForSearch(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Texte réellement recherchable d'un message (ce que l'humain lit).
 * Ignore les messages supprimés et le ciphertext non déchiffré.
 * @param {object} m
 * @param {(t:string)=>boolean} [looksCiphertext] — détecteur optionnel de ciphertext.
 * @returns {string}
 */
export function searchableText(m, looksCiphertext) {
  if (!m || m.deleted) return '';
  const parts = [];
  if (m.text && !(looksCiphertext && looksCiphertext(m.text))) parts.push(m.text);
  if (m.voice_text) parts.push(m.voice_text);
  if (m.alt) parts.push(m.alt);
  if (m.media_name) parts.push(m.media_name);
  return parts.join(' ');
}

/**
 * Trouve les messages qui contiennent la requête, dans l'ordre chronologique.
 * @param {Array<object>} messages
 * @param {string} query
 * @param {(t:string)=>boolean} [looksCiphertext]
 * @returns {{ ids: string[], total: number, query: string }}
 */
export function findInMessages(messages, query, looksCiphertext) {
  const q = normalizeForSearch(query).trim();
  if (q.length === 0 || !Array.isArray(messages)) {
    return { ids: [], total: 0, query: q };
  }
  const ids = [];
  for (const m of messages) {
    const hay = normalizeForSearch(searchableText(m, looksCiphertext));
    if (hay.includes(q)) ids.push(m.id);
  }
  return { ids, total: ids.length, query: q };
}

/**
 * Index du prochain résultat (navigation ↑/↓ avec bouclage).
 * @param {number} cur — index courant (-1 si aucun).
 * @param {number} total
 * @param {1|-1} dir — +1 = suivant, -1 = précédent.
 * @returns {number} nouvel index, ou -1 si aucun résultat.
 */
export function nextMatchIndex(cur, total, dir) {
  if (!total || total <= 0) return -1;
  const step = dir < 0 ? -1 : 1;
  if (cur < 0) return step > 0 ? 0 : total - 1;
  return ((cur + step) % total + total) % total;
}

export default { normalizeForSearch, searchableText, findInMessages, nextMatchIndex };

// Compat navigateur : expose window.ApexSearch pour le code <script> d'index.html.
if (typeof window !== 'undefined') {
  window.ApexSearch = { normalizeForSearch, searchableText, findInMessages, nextMatchIndex };
}
