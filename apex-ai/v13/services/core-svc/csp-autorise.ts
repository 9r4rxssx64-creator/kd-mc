/**
 * cspAutorise(url) — LA CSP DE LA PAGE DÉCIDE AVANT LE FETCH (16.10.2026, v13.4.375/376).
 *
 * Mesuré au dépôt public (Lighthouse, runs 38955866488 puis 38958462368) et en vrai Chromium : à chaque ouverture, la
 * veille technologique (npm, Hugging Face, GitHub) puis le registre MCP (29 serveurs mcp.*) appelaient des hôtes absents
 * de « connect-src » dans index.html → 16 + 58 violations CSP par ouverture, des services muets, une console illisible.
 * Règle : un hôte que la CSP interdit n'est pas appelé ; l'appelant saute, et le dit une fois.
 */
export function cspAutorise(url: string): boolean {
  if (typeof document === 'undefined' || typeof location === 'undefined') return true;
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
  const politique = meta?.getAttribute('content') ?? '';
  const m = /(?:^|;)\s*connect-src\s+([^;]+)/i.exec(politique);
  if (!m) return true; /* pas de connect-src : rien n'interdit */
  let cible: URL;
  try { cible = new URL(url, location.href); } catch { return false; }
  for (const brut of (m[1] ?? '').trim().split(/\s+/)) {
    const src = brut.replace(/^'|'$/g, '');
    if (src === '*') return true;
    if (src === 'self') { if (cible.origin === location.origin) return true; continue; }
    if (/^[a-z]+:$/i.test(src)) { if (cible.protocol === src.toLowerCase()) return true; continue; }
    const hote = (src.replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? '').split(':')[0] ?? '';
    if (!hote) continue;
    if (hote.startsWith('*.')) {
      const dom = hote.slice(2);
      if (cible.hostname === dom || cible.hostname.endsWith('.' + dom)) return true;
    } else if (cible.hostname === hote) return true;
  }
  return false;
}
