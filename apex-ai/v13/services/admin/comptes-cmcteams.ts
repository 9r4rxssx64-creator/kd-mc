/**
 * APEX v13.4.402 — Parité Bee / Apex AI (Kevin 18.11 : « fais-moi la liste de toutes les personnes qui ont un compte dans CMC Teams,
 * les noms avec leur identifiant SBM à côté »). Pont 2769 (pont-check) · porte du domaine `/__admin/comptes-cmcteams` (cloud-installer 2795).
 *
 * GARDE-FOU (règle parité-bee-apex.md) : les NOMS et MATRICULES de collègues ne partent JAMAIS à une IA. Le navigateur de Kevin lit la porte du domaine
 * (session admin prouvée, même domaine), fabrique la CARTE et l'affiche à Kevin ; l'IA ne reçoit que « liste prête (N comptes) » (`resumePourIA`).
 */
import { escapeHtml } from '../../core/escape-html.js';

export const PORTE_COMPTES_CMCTEAMS = '/__admin/comptes-cmcteams';
export const MAX_COMPTES = 400;

export interface CompteCmcteams { nom: string; matricule: string; }
export interface ListeComptes {
  comptes: CompteCmcteams[];
  total: number;
  avecMatricule: number;
  sansMatricule: number;
}
export type ResultatComptes = { ok: true; liste: ListeComptes } | { ok: false; raison: string };

const texte = (v: unknown, n: number): string => String(v == null ? '' : v).slice(0, n);

/** PURE : réponse de la porte → liste sûre (nom court, matricule de forme U1234 ou vide, bornes). */
export function lireReponsePorte(brut: unknown): ListeComptes | null {
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Record<string, unknown>;
  if (r['ok'] !== true || !Array.isArray(r['comptes'])) return null;
  const comptes = (r['comptes'] as unknown[]).slice(0, MAX_COMPTES).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const m = String(o['matricule'] ?? '');
    return { nom: texte(o['nom'], 80), matricule: /^U\d{3,6}$/.test(m) ? m : '' };
  });
  const total = Number(r['total']) || comptes.length;
  const avec = Number(r['avec_matricule']);
  const sans = Number(r['sans_matricule']);
  return {
    comptes,
    total,
    avecMatricule: Number.isFinite(avec) ? avec : comptes.filter((c) => c.matricule).length,
    sansMatricule: Number.isFinite(sans) ? sans : comptes.filter((c) => !c.matricule).length,
  };
}

/** Lit la porte du domaine avec la session de Kevin. Jamais d'exception : une raison lisible. */
export async function chargerComptes(f: typeof fetch = fetch): Promise<ResultatComptes> {
  try {
    const rep = await f(PORTE_COMPTES_CMCTEAMS, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
    if (rep.status === 401 || rep.status === 403) return { ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' };
    if (!rep.ok) return { ok: false, raison: `le domaine répond ${rep.status}` };
    const liste = lireReponsePorte(await rep.json().catch(() => null));
    return liste ? { ok: true, liste } : { ok: false, raison: 'réponse du domaine illisible' };
  } catch (e) {
    return { ok: false, raison: 'réseau indisponible' + (e instanceof Error ? '' : '') };
  }
}

/** PURE : la carte (HTML échappé) montrée à Kevin. */
export function carteHtml(l: ListeComptes): string {
  const lignes = l.comptes.map((c) =>
    `<li style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #2a2a3a;min-height:44px;align-items:center">` +
    `<span>${escapeHtml(c.nom)}</span><strong style="color:${c.matricule ? 'var(--ax-gold)' : '#888'}">${c.matricule ? escapeHtml(c.matricule) : 'pas d\'identifiant'}</strong></li>`).join('');
  return `<p style="margin:0 0 8px;font-size:13px">${l.total} compte${l.total > 1 ? 's' : ''} · ${l.avecMatricule} avec identifiant SBM · ${l.sansMatricule} sans</p>` +
    `<ul class="ax-comptes-cmcteams" style="list-style:none;margin:0;padding:0;max-height:55vh;overflow:auto">${lignes || '<li>Aucun compte.</li>'}</ul>`;
}

/** PURE : ce que l'IA reçoit — des NOMBRES seulement, jamais un nom ni un matricule. */
export function resumePourIA(l: ListeComptes): string {
  return `Liste prête : ${l.total} comptes (${l.avecMatricule} avec identifiant SBM). Elle est affichée à Kevin, que tu ne vois pas : dis-lui qu'elle est sous ses yeux, sans inventer aucun nom.`;
}

/** Outil `comptes_cmcteams` : charge, affiche la carte à Kevin, rend le résumé sans donnée à l'IA. */
export async function comptesCmcteams(f: typeof fetch = fetch): Promise<string> {
  const r = await chargerComptes(f);
  if (!r.ok) return `Je n'ai pas pu lire la liste pour l'instant (${r.raison}). Dis-le à Kevin simplement et propose de réessayer.`;
  const { modalSheet } = await import('../../ui/modal-sheet.js');
  const sheet = modalSheet.open({
    title: 'Comptes CMCteams',
    content: carteHtml(r.liste),
    actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => sheet.close() }],
  });
  return resumePourIA(r.liste);
}
