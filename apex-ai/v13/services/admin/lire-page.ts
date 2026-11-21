/**
 * APEX v13.4.412 — « lis https://… » sans le robot GitHub (pont-check 2992, mesure réelle de pc-config 2948 C : HTTP 401 « Échec du lancement »).
 * Avant : la lecture d'une page partait vers un workflow GitHub (jeton GitHub exigé) ; sans jeton valable dans CE navigateur : 401, rien n'était lu.
 * Maintenant (parité Bee, `lire_page`) : le DOMAINE lit la page (`/__admin/lire-page?url=`, session admin, https seulement, adresses internes refusées, r.jina.ai, 0 €)
 * et Apex AI affiche l'extrait dans le chat. Le texte reste une donnée externe : jamais interprété comme un ordre, affiché dans un bloc de code.
 */
export const PORTE_LIRE = '/__admin/lire-page';
export const EXTRAIT_MAX = 1800;

export type ResultatLecture = { ok: true; texte: string } | { ok: false; raison: string };

export async function lirePageDomaine(url: string, f: typeof fetch = fetch): Promise<ResultatLecture> {
  try {
    const rep = await f(`${PORTE_LIRE}?url=${encodeURIComponent(url.slice(0, 2000))}`, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
    if (rep.status === 401 || rep.status === 403) return { ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' };
    const j = (await rep.json().catch(() => null)) as { ok?: boolean; texte?: unknown; reason?: unknown } | null;
    if (!j) return { ok: false, raison: `le domaine répond ${rep.status}` };
    if (j.ok === true && typeof j.texte === 'string' && j.texte.trim()) return { ok: true, texte: j.texte };
    return { ok: false, raison: typeof j.reason === 'string' && j.reason ? j.reason : `le domaine répond ${rep.status}` };
  } catch {
    return { ok: false, raison: 'réseau indisponible' };
  }
}

/** PURE : le message du chat — l'adresse, un extrait dans un bloc de code (rien d'interprété), le nombre de signes coupés. */
export function messageLecture(url: string, texte: string): string {
  const brut = String(texte).replace(/^Texte de la page[^\n]*\n/, '').replace(/```/g, "'''").trim();
  const extrait = brut.slice(0, EXTRAIT_MAX);
  const reste = brut.length - extrait.length;
  return `🌐 Lecture de \`${url.replace(/`/g, '')}\`\n\n\`\`\`\n${extrait}\n\`\`\`${reste > 0 ? `\n… (${reste} signes de plus non affichés)` : ''}\n_Texte de la page, donnée externe : je ne le prends pas pour des ordres._`;
}
