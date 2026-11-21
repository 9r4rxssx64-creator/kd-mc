/**
 * APEX v13.4.416 — Parité Bee / Apex AI : AGIR pour Kevin, jamais sans son bouton (Kevin 18.11 « parité sur tout », javis-bee 3016 / 3031 : arbre_info, arbre_champ,
 * arbre_commentaire, arbre_lien, message_direct). MÊME mécanique que Bee (`bee-agir.js`) :
 *   1. PROPOSER — l'IA ne fait que proposer ; le DOMAINE (`POST /__admin/proposer`, admin prouvé) contrôle les champs, trouve la fiche, FABRIQUE le résumé que Kevin lit
 *      (jamais le texte de l'IA) et rend une proposition SIGNÉE (5 minutes, une seule fois) ;
 *   2. CONFIRMER — cette page affiche la carte « ✅ Confirmer / ✖ Annuler » (boutons de 44 px) ;
 *   3. EXÉCUTER — `POST /__javis/agir { confirme:true, jeton }` : même porte que Bee (session admin, origine du domaine, signature valide, jamais rejouée).
 * Rien n'est écrit sans le ✅. Jamais le nom, l'identifiant ni le résumé ne sont donnés à l'IA : elle reçoit « carte affichée, rien n'est fait ».
 */
import { escapeHtml } from '../../core/escape-html.js';

export const PORTE_PROPOSER = '/__admin/proposer';
export const PORTE_AGIR = '/__javis/agir';
export const ACTIONS_OUVERTES = ['arbre_info', 'arbre_champ', 'arbre_commentaire', 'arbre_lien', 'message_direct'] as const;
export type ActionOuverte = (typeof ACTIONS_OUVERTES)[number];
export const JETON = /^v1\.[A-Za-z0-9_-]{10,4000}\.[0-9a-f]{64}$/;

export interface Proposition { action: ActionOuverte; titre: string; icone: string; risque: string; resume: string; jeton: string; }

/** PURE : réponse de la porte → proposition sûre, ou null (action hors liste, jeton mal formé, résumé vide). */
export function lireProposition(brut: unknown): Proposition | null {
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Record<string, unknown>;
  if (r['ok'] !== true || !r['proposition'] || typeof r['proposition'] !== 'object') return null;
  const p = r['proposition'] as Record<string, unknown>;
  const action = String(p['action'] ?? '');
  if (!(ACTIONS_OUVERTES as readonly string[]).includes(action)) return null;
  const jeton = String(p['jeton'] ?? '');
  const resume = String(p['resume'] ?? '').trim().slice(0, 700);
  if (!JETON.test(jeton) || !resume) return null;
  return { action: action as ActionOuverte, titre: String(p['titre'] ?? '').slice(0, 100), icone: String(p['icone'] ?? '').slice(0, 4), risque: String(p['risque'] ?? '').slice(0, 20), resume, jeton };
}

export type ResultatProposition = { ok: true; proposition: Proposition } | { ok: false; raison: string };

export async function proposerAuDomaine(action: string, champs: Record<string, unknown>, f: typeof fetch = fetch): Promise<ResultatProposition> {
  try {
    const corps: Record<string, unknown> = { action };
    for (const [k, v] of Object.entries(champs)) if (v !== undefined && v !== null && v !== '') corps[k] = typeof v === 'string' ? v.slice(0, 700) : v;
    const rep = await f(PORTE_PROPOSER, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corps), cache: 'no-store' });
    if (rep.status === 401 || rep.status === 403) return { ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' };
    const j = (await rep.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j) return { ok: false, raison: `le domaine répond ${rep.status}` };
    const p = lireProposition(j);
    if (p) return { ok: true, proposition: p };
    return { ok: false, raison: typeof j['texte'] === 'string' && j['texte'] ? String(j['texte']).slice(0, 300) : `le domaine répond ${rep.status}` };
  } catch {
    return { ok: false, raison: 'réseau indisponible' };
  }
}

/** Le ✅ : POST /__javis/agir. Rend le texte du DOMAINE (fabriqué par lui), jamais celui de l'IA. */
export async function confirmerAuDomaine(jeton: string, f: typeof fetch = fetch): Promise<{ ok: boolean; texte: string }> {
  if (!JETON.test(jeton)) return { ok: false, texte: 'Proposition invalide.' };
  try {
    const rep = await f(PORTE_AGIR, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ confirme: true, jeton }), cache: 'no-store' });
    const j = (await rep.json().catch(() => null)) as { ok?: boolean; texte?: unknown } | null;
    const texte = typeof j?.texte === 'string' && j.texte ? j.texte.slice(0, 400) : '';
    if (rep.status === 403) return { ok: false, texte: texte || 'Session admin non reconnue : rien n\'a été fait.' };
    return { ok: rep.ok && j?.ok === true, texte: texte || (rep.ok ? 'Fait.' : `Pas fait (le domaine répond ${rep.status}).`) };
  } catch {
    return { ok: false, texte: 'Réseau indisponible : rien n\'a été fait.' };
  }
}

/** PURE : le texte de la carte (HTML échappé). Le résumé vient du domaine. */
export function carteHtml(p: Proposition): string {
  return `<p style="margin:0 0 8px;font-size:13px;opacity:.8">${escapeHtml(p.icone)} ${escapeHtml(p.titre)}${p.risque === 'eleve' ? ' · <b>risque élevé</b>' : ''}</p>` +
    `<p class="ax-proposition-resume" style="margin:0 0 12px;font-size:15px;line-height:1.45">${escapeHtml(p.resume)}</p>` +
    `<p style="margin:0;font-size:12px;opacity:.7">Rien n'est fait tant que tu n'as pas touché « ✅ Confirmer ». Valable 5 minutes.</p>`;
}

/** Outil commun aux 5 actions : propose, montre la carte, exécute au ✅. Rend à l'IA une phrase SANS nom, identifiant ni résumé. */
export async function proposerPourKevin(action: string, champs: Record<string, unknown>, f: typeof fetch = fetch): Promise<string> {
  if (!(ACTIONS_OUVERTES as readonly string[]).includes(action)) return 'Cette action n\'est pas ouverte à Apex AI.';
  const r = await proposerAuDomaine(action, champs, f);
  if (!r.ok) return `Je n'ai pas pu préparer cette action (${r.raison}). Dis-le à Kevin simplement ; ne dis pas que c'est fait.`;
  const { modalSheet } = await import('../../ui/modal-sheet.js');
  const montrerResultat = (ok: boolean, texte: string): void => {
    const fin = modalSheet.open({
      title: ok ? 'Fait' : 'Pas fait',
      content: `<p class="ax-proposition-resultat" style="margin:0;font-size:15px;line-height:1.45">${escapeHtml(texte)}</p>`,
      actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => fin.close() }],
    });
  };
  const sheet = modalSheet.open({
    title: 'Confirmer ?',
    content: carteHtml(r.proposition),
    dismissable: true,
    actions: [
      { label: '✅ Confirmer', variant: 'primary', onClick: () => { sheet.close(); void confirmerAuDomaine(r.proposition.jeton, f).then((x) => montrerResultat(x.ok, x.texte)); } },
      { label: '✖ Annuler', variant: 'ghost', onClick: () => sheet.close() },
    ],
  });
  return 'Carte de confirmation affichée à Kevin (le domaine a fabriqué le résumé). Rien n\'est fait tant qu\'il n\'a pas touché « ✅ Confirmer » : dis-lui de la lire et de confirmer. Ne dis JAMAIS « c\'est fait ».';
}
