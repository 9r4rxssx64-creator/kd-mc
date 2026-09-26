// media-gallery.js — « Médias, liens & docs » d'une conversation (parité
// WhatsApp/Signal). Cœur PUR, 100 % côté client : parcourt les messages d'une
// conversation et classe ce qui a été partagé en 4 onglets — Médias (images/
// vidéos), Fichiers (docs), Vocaux, Liens (URLs extraites du texte).
//
// Le DOM (grille, onglets, saut au message) vit dans index.html et est prouvé
// au navigateur réel. Ici : uniquement la logique de collecte/classement,
// entièrement testable.

const URL_RE = /\bhttps?:\/\/[^\s<>()"']+/gi;

/**
 * Extrait les URLs http(s) d'un texte, sans doublon, dans l'ordre.
 * @param {string} text
 * @returns {string[]}
 */
export function extractLinks(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const seen = new Set();
  const matches = text.match(URL_RE) || [];
  for (let u of matches) {
    // Retire la ponctuation finale collée (., ), , ; :).
    u = u.replace(/[.,;:)\]]+$/, '');
    if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

/**
 * Type de média d'un message, ou null si aucun.
 * @param {object} m
 * @returns {'image'|'video'|'file'|'voice'|null}
 */
export function mediaKind(m) {
  if (!m || m.deleted) return null;
  if (m.voice_data || m.voice_too_large) return 'voice';
  if (m.image_data) return 'image';
  if (m.media_url) {
    const mime = String(m.media_type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  }
  return null;
}

/**
 * Collecte et classe tout le contenu partagé d'une conversation.
 * Le plus récent en premier dans chaque onglet.
 * @param {Array<object>} messages
 * @returns {{ media: object[], files: object[], voices: object[], links: object[],
 *            counts: {media:number,files:number,voices:number,links:number} }}
 */
export function collectConversationMedia(messages) {
  const media = [];   // images + vidéos
  const files = [];
  const voices = [];
  const links = [];
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (!m || m.deleted) continue;
      const kind = mediaKind(m);
      const base = { id: m.id, ts: m.ts || 0 };
      if (kind === 'image' || kind === 'video') {
        media.push({ ...base, kind, mime: m.media_type || '', name: m.media_name || '',
          url: m.media_url || '', inline: m.image_data || '', enc: !!m.media_enc });
      } else if (kind === 'file') {
        // kind 'file' ⇒ media_url toujours présent (cf. mediaKind).
        files.push({ ...base, kind, mime: m.media_type || '', name: m.media_name || 'fichier',
          url: m.media_url, enc: !!m.media_enc });
      } else if (kind === 'voice') {
        voices.push({ ...base, kind, text: m.voice_text || '' });
      }
      // Liens : indépendants du média (un message peut avoir texte + média).
      for (const url of extractLinks(m.text)) {
        links.push({ id: m.id, ts: m.ts || 0, url });
      }
    }
  }
  const byTsDesc = (a, b) => (b.ts || 0) - (a.ts || 0);
  media.sort(byTsDesc); files.sort(byTsDesc); voices.sort(byTsDesc); links.sort(byTsDesc);
  return {
    media, files, voices, links,
    counts: { media: media.length, files: files.length, voices: voices.length, links: links.length },
  };
}

export default { extractLinks, mediaKind, collectConversationMedia };

// Compat navigateur : expose window.ApexGallery pour index.html.
if (typeof window !== 'undefined') {
  window.ApexGallery = { extractLinks, mediaKind, collectConversationMedia };
}
