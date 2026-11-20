/**
 * APEX v13 — chat-cle-rangee.ts (13.4.408, 20.11.2026, pc-config 2961)
 * Quand Kevin colle une clé / un jeton dans le chat, la zone est vidée et la clé rangée chiffrée : sans bulle de réponse il croyait
 * qu'« Apex n'a rien répondu » (il ne voyait que des pastilles qui disparaissent). Ces phrases disent ce qui s'est passé, dans le chat.
 * RIEN de la clé n'y figure : seulement le nom du service.
 */

/** Phrase de réponse après le rangement. `noms` = services reconnus (ex. « GitHub »), `github` = un jeton GitHub vient d'être rangé. */
export function phraseCleRangee(noms: readonly string[], github: boolean): string {
  const vus = [...new Set(noms.map((n) => String(n).replace(/[`*_<>]/g, '').slice(0, 40)))].slice(0, 6);
  const liste = vus.join(', ') || 'clé';
  const base = noms.length > 1 ? `🔑 J'ai rangé tes ${noms.length} clés (${liste}), chiffrées sur cet appareil. Elles ne sont jamais envoyées à une IA.` : `🔑 J'ai rangé ta clé ${liste}, chiffrée sur cet appareil. Elle n'est jamais envoyée à une IA.`;
  return github ? `${base}\n☁️ La sauvegarde GitHub (Gist) part dans quelques secondes : je te dis le résultat ici.` : base;
}

/** Phrase pour les clés refusées (jamais rangées par règle). */
export function phraseCleRefusee(noms: readonly string[]): string {
  const vus = [...new Set(noms.map((n) => String(n).replace(/[`*_<>]/g, '').slice(0, 40)))].slice(0, 6).join(', ');
  return `🚫 ${vus || 'Cette clé'} : jamais rangée (règle de sécurité). Garde-la ailleurs, je ne la stocke pas.`;
}
