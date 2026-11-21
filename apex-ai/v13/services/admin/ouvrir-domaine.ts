/**
 * APEX v13.4.414 — Parité Bee / Apex AI (Kevin 19.11 : « classer l'arbre autrement » ; Bee `ouvrir`, `bee-ouvrir.js`, arbre v3.235 : #vue= et #tri=).
 * Le DOMAINE décide (`GET /__admin/ouvrir?q=<phrase>` ou `?app=&personne=&famille=&vue=&tri=&page=`, admin prouvé) avec la MÊME logique que Bee
 * (`intentionOuvrir` / `adresse` : listes FERMÉES de vues et de tris, apps du domaine seulement) ; la page affiche un bouton « Ouvrir » que KEVIN touche.
 * Rien ne s'ouvre tout seul. L'adresse rendue doit être du domaine (https, kd-mc.com ou un de ses sous-domaines).
 */
import { lienExterne } from './lien-externe.js';

export const PORTE_OUVRIR = '/__admin/ouvrir';
export const HOTE_DOMAINE = /^(?:[a-z0-9-]+\.)*kd-mc\.com$/;

export interface CibleOuvrir { url: string; libelle: string; }

/** PURE : réponse de la porte → une cible du domaine, ou null (adresse hors domaine, http, identifiants… refusés). */
export function lireReponseOuvrir(brut: unknown): CibleOuvrir | null {
  if (!brut || typeof brut !== 'object') return null;
  const r = brut as Record<string, unknown>;
  if (r['ok'] !== true) return null;
  let x: URL;
  try { x = new URL(String(r['url'] ?? '')); } catch { return null; }
  if (x.protocol !== 'https:' || x.username || x.password || !HOTE_DOMAINE.test(x.hostname.toLowerCase())) return null;
  return { url: x.toString(), libelle: String(r['libelle'] ?? '').replace(/[<>"`]/g, ' ').slice(0, 60).trim() };
}

export type ResultatOuvrir = { ok: true; cible: CibleOuvrir } | { ok: false; raison: string; pasUneOuverture?: boolean };

export async function chargerOuvrir(requete: URLSearchParams, f: typeof fetch = fetch): Promise<ResultatOuvrir> {
  try {
    const rep = await f(`${PORTE_OUVRIR}?${requete.toString()}`, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
    if (rep.status === 401 || rep.status === 403) return { ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' };
    const j = (await rep.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j) return { ok: false, raison: `le domaine répond ${rep.status}` };
    const cible = lireReponseOuvrir(j);
    if (cible) return { ok: true, cible };
    return j['reason'] === 'pas_une_ouverture' ? { ok: false, raison: 'pas une ouverture', pasUneOuverture: true } : { ok: false, raison: typeof j['reason'] === 'string' ? String(j['reason']).slice(0, 120) : 'réponse du domaine illisible' };
  } catch {
    return { ok: false, raison: 'réseau indisponible' };
  }
}

/** Outil `ouvrir` (même nom que chez Bee) : app, page, personne, famille, vue (arbre|plan|paysage|lignee), tri (alpha|nom|naissance|recent), ou une phrase « demande ». Rend une phrase SANS adresse ni nom. */
export async function ouvrirDomaine(p: Record<string, unknown>, f: typeof fetch = fetch): Promise<string> {
  const q = new URLSearchParams();
  const demande = typeof p['demande'] === 'string' ? p['demande'].trim().slice(0, 300) : '';
  if (typeof p['app'] === 'string' && p['app'].trim()) {
    for (const k of ['app', 'page', 'personne', 'famille', 'vue', 'tri', 'libelle']) if (typeof p[k] === 'string' && (p[k] as string).trim()) q.set(k, (p[k] as string).trim().slice(0, 120));
  } else if (demande) q.set('q', demande);
  else return 'Dis-moi quoi ouvrir (une app du domaine, l\'arbre, une personne de l\'arbre…).';
  const r = await chargerOuvrir(q, f);
  if (!r.ok) return r.pasUneOuverture ? 'Je ne sais pas quoi ouvrir avec cette demande. Demande à Kevin de préciser l\'app (arbre, lingua, cmcteams…).' : `Je n'ai pas pu préparer l'ouverture pour l'instant (${r.raison}). Dis-le à Kevin simplement.`;
  const t = await lienExterne(r.cible.url, r.cible.libelle || undefined);
  return t.startsWith('Bouton prêt') ? 'Bouton « Ouvrir » prêt. Kevin le touche pour ouvrir l\'app (tu n\'ouvres rien). Dis-lui qu\'il est là.' : t;
}
