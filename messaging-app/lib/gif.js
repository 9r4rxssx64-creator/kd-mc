// gif.js — recherche de GIF (Giphy) via le worker-proxy. Cœur PUR (100 %
// testable) : construction des URLs Giphy (clé côté SERVEUR, jamais exposée au
// navigateur) + normalisation des résultats vers la forme app { id, title,
// preview, full }. La clé vit en secret Cloudflare ; sans clé → proxy fail-open
// (résultats vides), le bouton GIF se désactive proprement (leçon #130).

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

/**
 * URL Giphy « search » (appel SERVEUR uniquement).
 * @param {string} query
 * @param {string} key — clé API Giphy (secret worker).
 * @param {number} [limit=24]
 * @returns {string}
 */
export function giphySearchUrl(query, key, limit = 24) {
  const q = encodeURIComponent(String(query || '').slice(0, 100));
  const n = Math.max(1, Math.min(50, limit | 0 || 24));
  return `${GIPHY_BASE}/search?api_key=${encodeURIComponent(key)}&q=${q}&limit=${n}&rating=pg-13&lang=fr&bundle=messaging_non_clips`;
}

/**
 * URL Giphy « trending » (appel SERVEUR uniquement).
 * @param {string} key
 * @param {number} [limit=24]
 * @returns {string}
 */
export function giphyTrendingUrl(key, limit = 24) {
  const n = Math.max(1, Math.min(50, limit | 0 || 24));
  return `${GIPHY_BASE}/trending?api_key=${encodeURIComponent(key)}&limit=${n}&rating=pg-13&bundle=messaging_non_clips`;
}

/**
 * Normalise la réponse Giphy vers la forme app. Ignore les entrées sans URL.
 * @param {object} json — réponse Giphy { data: [...] }.
 * @returns {Array<{id:string,title:string,preview:string,full:string,mime:string}>}
 */
export function mapGiphyResults(json) {
  const data = json && Array.isArray(json.data) ? json.data : [];
  const out = [];
  for (const g of data) {
    const img = (g && g.images) || {};
    const preview = (img.fixed_width_small && img.fixed_width_small.url)
      || (img.fixed_width && img.fixed_width.url) || '';
    const full = (img.downsized_medium && img.downsized_medium.url)
      || (img.fixed_width && img.fixed_width.url)
      || (img.original && img.original.url) || '';
    if (!preview || !full) continue;
    out.push({ id: String(g.id || ''), title: String(g.title || 'GIF'), preview, full, mime: 'image/gif' });
  }
  return out;
}

export default { giphySearchUrl, giphyTrendingUrl, mapGiphyResults };

// Compat navigateur : expose window.ApexGif (mapGiphyResults utile côté client).
if (typeof window !== 'undefined') {
  window.ApexGif = { mapGiphyResults };
}
