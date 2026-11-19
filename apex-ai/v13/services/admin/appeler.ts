/**
 * APEX v13.4.405 — Parité Bee / Apex AI (Kevin 18.11 : « appeler telle ou telle personne »). Pont 2769, dernière ligne du garde de parité.
 * Même règle que Bee (`bee-parite.js`, `appeler`) : le DOMAINE lit le numéro dans la fiche du compte (`/__admin/appel?q=<nom>`, admin prouvé) ;
 * la page fabrique des boutons « 📞 Appeler » (lien tel:) que KEVIN touche ; l'iPhone compose. 0 €, jamais le numéro ni le nom donnés à l'IA.
 */
import { escapeHtml } from '../../core/escape-html.js';

export const PORTE_APPEL = '/__admin/appel';
export const TEL = /^tel:\+?[0-9]{6,20}$/;
export const MAX_APPELS = 5;

export interface Appel { nom: string; tel: string; }
export interface ReponseAppel { appels: Appel[]; correspondances: number; }

/** PURE : réponse de la porte → boutons sûrs (tel: strict, noms courts, 5 au plus). */
export function lireReponseAppel(brut: unknown): ReponseAppel | null {
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Record<string, unknown>;
  if (r['ok'] !== true) return null;
  const trouves = Array.isArray(r['trouves']) ? (r['trouves'] as unknown[]) : [];
  const appels = trouves
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => TEL.test(String(x['tel'] ?? '')))
    .slice(0, MAX_APPELS)
    .map((x) => ({ nom: String(x['nom'] ?? '').slice(0, 80), tel: String(x['tel']) }));
  return { appels, correspondances: Number(r['correspondances']) || 0 };
}

export type ResultatAppel = { ok: true; reponse: ReponseAppel } | { ok: false; raison: string };

export async function chargerAppel(nom: string, f: typeof fetch = fetch): Promise<ResultatAppel> {
  try {
    const rep = await f(`${PORTE_APPEL}?q=${encodeURIComponent(nom.slice(0, 80))}`, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
    if (rep.status === 401 || rep.status === 403) return { ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' };
    if (!rep.ok) return { ok: false, raison: `le domaine répond ${rep.status}` };
    const reponse = lireReponseAppel(await rep.json().catch(() => null));
    return reponse ? { ok: true, reponse } : { ok: false, raison: 'réponse du domaine illisible' };
  } catch {
    return { ok: false, raison: 'réseau indisponible' };
  }
}

/** PURE : la carte montrée à Kevin — un bouton « 📞 Appeler » par personne. */
export function carteAppelHtml(appels: readonly Appel[]): string {
  return appels.map((a) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #2a2a3a;min-height:44px">` +
    `<span>${escapeHtml(a.nom)}</span>` +
    `<a class="ax-btn ax-btn-primary ax-appel" href="${escapeHtml(a.tel)}" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:120px;text-decoration:none">📞 Appeler</a></div>`).join('');
}

/** Outil `appeler` : affiche les boutons à Kevin ; rend à l'IA une phrase SANS nom ni numéro. */
export async function appeler(nom: unknown, f: typeof fetch = fetch): Promise<string> {
  const q = String(nom ?? '').trim().slice(0, 80);
  if (q.length < 2) return 'Dis-moi qui appeler (prénom et nom, comme sur le compte).';
  const r = await chargerAppel(q, f);
  if (!r.ok) return `Je n'ai pas pu chercher ce numéro pour l'instant (${r.raison}). Dis-le à Kevin simplement et propose de réessayer.`;
  const { appels, correspondances } = r.reponse;
  if (appels.length === 0) {
    return correspondances > 0
      ? `Je connais ${correspondances} compte(s) à ce nom, mais aucun numéro n'est dans la fiche. Dis-le à Kevin et propose-lui de le demander à la personne.`
      : 'Aucun compte à ce nom dans le domaine. Dis-le à Kevin et demande-lui d\'écrire le prénom et le nom comme sur le compte.';
  }
  const { modalSheet } = await import('../../ui/modal-sheet.js');
  const sheet = modalSheet.open({
    title: 'Appeler',
    content: carteAppelHtml(appels),
    actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => sheet.close() }],
  });
  return appels.length === 1
    ? 'Bouton « 📞 Appeler » prêt. Kevin le touche, son iPhone compose (tu ne vois ni le nom ni le numéro). Dis-lui qu\'il est là.'
    : `${appels.length} personnes correspondent : un bouton « 📞 Appeler » par personne est affiché à Kevin, qui choisit. Dis-lui seulement de toucher le bon.`;
}
