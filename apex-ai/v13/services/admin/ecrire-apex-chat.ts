/**
 * APEX v13.4.411 — Parité Bee / Apex AI (Kevin 18.11 : « modifier dans Apex Chat » / « envoyer un message à une personne »). Conception du 19.11 (accord avec javis-bee, pont 2853).
 * Les messages d'Apex Chat sont chiffrés de bout en bout par l'APPAREIL : le domaine ne peut pas écrire « comme Kevin ». Le DOMAINE lit l'identifiant du compte
 * (`/__admin/ecrire-apex-chat?q=<nom>&texte=<message>`, admin prouvé) et fabrique un LIEN ; la page en fait un bouton « ✍️ Écrire à <nom> » que KEVIN touche :
 * Apex Chat s'ouvre sur la conversation avec le texte déjà dans la zone de saisie (Apex Chat 1.1.373, `?to=&texte=`), Kevin relit et touche Envoyer = son ✅.
 * Rien n'est envoyé par Apex AI ni par le domaine. Jamais le nom, l'identifiant ni le lien ne sont donnés à l'IA.
 */
import { escapeHtml } from '../../core/escape-html.js';

export const PORTE_ECRIRE = '/__admin/ecrire-apex-chat';
/** Seule destination admise pour un bouton : la conversation Apex Chat du domaine, avec ?to= puis &texte=. */
export const LIEN_APEX_CHAT = /^https:\/\/apex-chat\.kd-mc\.com\/\?to=[A-Za-z0-9_.:%-]{3,160}&texte=[^\s"'<>]{1,3000}$/;
export const MAX_PERSONNES = 5;
export const TEXTE_MAX = 500;

export interface Cible { nom: string; lien: string; }
export interface ReponseEcrire { cibles: Cible[]; correspondances: number; }

/** PURE : réponse de la porte → boutons sûrs (lien Apex Chat strict, noms courts, 5 au plus). */
export function lireReponseEcrire(brut: unknown): ReponseEcrire | null {
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Record<string, unknown>;
  if (r['ok'] !== true) return null;
  const trouves = Array.isArray(r['trouves']) ? (r['trouves'] as unknown[]) : [];
  const cibles = trouves
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => LIEN_APEX_CHAT.test(String(x['lien'] ?? '')))
    .slice(0, MAX_PERSONNES)
    .map((x) => ({ nom: String(x['nom'] ?? '').slice(0, 80), lien: String(x['lien']) }));
  return { cibles, correspondances: Number(r['correspondances']) || 0 };
}

export type ResultatEcrire = { ok: true; reponse: ReponseEcrire } | { ok: false; raison: string };

export async function chargerEcrire(nom: string, texte: string, f: typeof fetch = fetch): Promise<ResultatEcrire> {
  try {
    const rep = await f(`${PORTE_ECRIRE}?q=${encodeURIComponent(nom.slice(0, 80))}&texte=${encodeURIComponent(texte.slice(0, TEXTE_MAX))}`, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
    if (rep.status === 401 || rep.status === 403) return { ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' };
    if (!rep.ok) return { ok: false, raison: `le domaine répond ${rep.status}` };
    const reponse = lireReponseEcrire(await rep.json().catch(() => null));
    return reponse ? { ok: true, reponse } : { ok: false, raison: 'réponse du domaine illisible' };
  } catch {
    return { ok: false, raison: 'réseau indisponible' };
  }
}

/** PURE : la carte montrée à Kevin — un bouton « ✍️ Écrire à <nom> » par personne, qui ouvre Apex Chat avec le message prêt. */
export function carteEcrireHtml(cibles: readonly Cible[], texte: string): string {
  const apercu = escapeHtml(texte.slice(0, TEXTE_MAX));
  return `<p style="margin:0 0 10px;opacity:.8;font-size:13px;line-height:1.4">Message prêt (rien n'est envoyé) :<br><i>« ${apercu} »</i></p>` + cibles.map((c) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #2a2a3a;min-height:44px">` +
    `<span>${escapeHtml(c.nom)}</span>` +
    `<a class="ax-btn ax-btn-primary ax-ecrire" href="${escapeHtml(c.lien)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:140px;text-decoration:none">✍️ Écrire</a></div>`).join('');
}

/** Outil `message_apex_chat` : affiche les boutons à Kevin ; rend à l'IA une phrase SANS nom, lien ni texte. */
export async function ecrireApexChat(nom: unknown, texte: unknown, f: typeof fetch = fetch): Promise<string> {
  const q = String(nom ?? '').trim().slice(0, 80);
  const msg = String(texte ?? '').trim().slice(0, TEXTE_MAX);
  if (q.length < 2) return 'Dis-moi à qui écrire (prénom et nom, comme sur le compte).';
  if (!msg) return 'Dis-moi ce que tu veux écrire.';
  const r = await chargerEcrire(q, msg, f);
  if (!r.ok) return `Je n'ai pas pu préparer ce message pour l'instant (${r.raison}). Dis-le à Kevin simplement et propose de réessayer.`;
  const { cibles, correspondances } = r.reponse;
  if (cibles.length === 0) {
    return correspondances > 0
      ? `Je connais ${correspondances} compte(s) à ce nom, mais je ne peux pas préparer de lien pour eux. Dis-le à Kevin.`
      : 'Aucun compte à ce nom dans le domaine. Dis-le à Kevin et demande-lui d\'écrire le prénom et le nom comme sur le compte.';
  }
  const { modalSheet } = await import('../../ui/modal-sheet.js');
  const sheet = modalSheet.open({
    title: 'Écrire par Apex Chat',
    content: carteEcrireHtml(cibles, msg),
    actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => sheet.close() }],
  });
  return cibles.length === 1
    ? 'Bouton « ✍️ Écrire » prêt. Kevin le touche : Apex Chat s\'ouvre avec le message dans la zone de saisie, il relit et envoie lui-même (tu ne vois ni le nom ni le lien). Dis-lui qu\'il est là.'
    : `${cibles.length} personnes correspondent : un bouton « ✍️ Écrire » par personne est affiché à Kevin, qui choisit. Rien n'est envoyé tant qu'il n'a pas touché Envoyer dans Apex Chat.`;
}
