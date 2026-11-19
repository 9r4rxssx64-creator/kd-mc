/**
 * APEX v13.4.403 — Parité Bee / Apex AI (Kevin 18.11 : « m'ouvrir une page internet »). Pont 2769, ligne « ouvrir une page hors domaine ».
 * Même règle que Bee (`services/kdmc-router/bee-parite.js`, `lien_externe`) : une CARTE avec un bouton que KEVIN touche — jamais de navigation
 * automatique, https seulement, jamais d'identifiants dans l'adresse, pas d'adresse interne.
 */
import { escapeHtml } from '../../core/escape-html.js';

/** PURE : une adresse qu'on propose d'ouvrir, ou null. */
export function adresseExterne(u: unknown): string | null {
  const brut = String(u == null ? '' : u).trim();
  if (!brut || brut.length > 2000) return null;
  let x: URL;
  try { x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : 'https://' + brut); } catch { return null; }
  if (x.protocol !== 'https:') return null;
  if (x.username || x.password) return null;
  const h = x.hostname.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return null;
  if (/^\d+(\.\d+){3}$/.test(h)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
  return x.toString();
}

/** PURE : la carte (HTML échappé) — le seul lien est celui que Kevin touche. */
export function carteLienHtml(url: string, libelle?: string): string {
  const hote = new URL(url).hostname;
  const texte = String(libelle ?? '').slice(0, 60).trim() || `Ouvrir ${hote}`;
  return `<p style="margin:0 0 12px;font-size:13px;word-break:break-all">${escapeHtml(url)}</p>` +
    `<a class="ax-btn ax-btn-primary ax-lien-externe" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" ` +
    `style="display:flex;align-items:center;justify-content:center;min-height:44px;text-decoration:none">${escapeHtml(texte)}</a>`;
}

/** Outil `lien_externe` : affiche la carte à Kevin ; il ne s'ouvre RIEN tout seul. */
export async function lienExterne(url: unknown, libelle?: unknown): Promise<string> {
  const adresse = adresseExterne(url);
  if (!adresse) {
    return 'Adresse refusée : il faut une adresse https complète d\'un site (pas de http, pas de mot de passe dans l\'adresse, pas d\'adresse interne). Demande-la à Kevin simplement.';
  }
  const { modalSheet } = await import('../../ui/modal-sheet.js');
  const sheet = modalSheet.open({
    title: 'Ouvrir une page',
    content: carteLienHtml(adresse, typeof libelle === 'string' ? libelle : undefined),
    actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => sheet.close() }],
  });
  return `Bouton prêt pour ${new URL(adresse).hostname}. Kevin le touche pour ouvrir la page (tu n'ouvres rien). Dis-lui en une phrase ce qu'il va trouver.`;
}
