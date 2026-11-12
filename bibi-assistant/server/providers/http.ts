import { ProviderError } from "./types.js";

/** Lit un flux SSE et rend chaque charge utile « data: … » (sans le préfixe). */
export async function* lireSSE(corps: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let tampon = "";
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      let i: number;
      while ((i = tampon.search(/\r?\n/)) >= 0) {
        const ligne = tampon.slice(0, i);
        tampon = tampon.slice(tampon[i] === "\r" ? i + 2 : i + 1);
        if (ligne.startsWith("data:")) yield ligne.slice(5).trim();
      }
    }
    const reste = tampon.trim();
    if (reste.startsWith("data:")) yield reste.slice(5).trim();
  } finally {
    lecteur.releaseLock();
  }
}

export function erreurDepuisStatut(status: number, corps: string, retryAfter?: string | null): ProviderError {
  let detail = "";
  try {
    const j = JSON.parse(corps);
    detail = String(j?.error?.message ?? j?.message ?? "").slice(0, 200);
  } catch {
    detail = corps.slice(0, 120);
  }
  const ra = retryAfter ? Math.min(3600, Math.max(0, Number(retryAfter) || 0)) : undefined;
  if (status === 401 || status === 403 || /api key not valid|invalid api key|API_KEY_INVALID/i.test(corps))
    return new ProviderError("invalid_key", "Clé refusée par le fournisseur.", status);
  if (status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(corps))
    return new ProviderError("quota", "Quota ou limite de débit atteint chez le fournisseur.", status, ra);
  if (status === 402) return new ProviderError("quota", "Crédit épuisé chez le fournisseur.", status);
  if (status >= 500) return new ProviderError("unavailable", "Le fournisseur est indisponible pour l'instant.", status);
  if (status === 404 || status === 400)
    return new ProviderError("bad_request", `Requête refusée par le fournisseur${detail ? ` : ${detail}` : "."}`, status);
  return new ProviderError("unavailable", `Réponse inattendue du fournisseur (${status}).`, status);
}

export async function appeler(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  timeoutMs = 60_000,
): Promise<Response> {
  const delai = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, delai]) : delai;
  let rep: Response;
  try {
    rep = await fetchImpl(url, { ...init, signal });
  } catch (e) {
    if (init.signal?.aborted) throw e; // arrêt voulu par l'utilisateur : on le laisse remonter
    if (delai.aborted) throw new ProviderError("timeout", "Le fournisseur met trop de temps à répondre.");
    throw new ProviderError("network", "Impossible de joindre le fournisseur (réseau).");
  }
  if (!rep.ok) {
    const texte = await rep.text().catch(() => "");
    throw erreurDepuisStatut(rep.status, texte, rep.headers.get("retry-after"));
  }
  return rep;
}
