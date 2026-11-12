// Appels au serveur Bibi. Aucune clé ici : le navigateur ne voit jamais les clés d'API.
import type { ProviderId, ProviderStatus, ServerVoice, SessionInfo, SpeechEngines } from "./types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0, public retryAfterSeconds?: number) {
    super(message);
  }
}

const EN_TETE = { "x-bibi": "1" };

async function lireErreur(r: Response): Promise<ApiError> {
  let code = "http", message = `Le serveur a répondu ${r.status}.`, retry: number | undefined;
  try {
    const j = (await r.json()) as { error?: { code?: string; message?: string; retryAfterSeconds?: number } };
    if (j.error) { code = j.error.code ?? code; message = j.error.message ?? message; retry = j.error.retryAfterSeconds; }
  } catch { /* corps non JSON */ }
  return new ApiError(code, message, r.status, retry);
}

async function appel<T>(methode: string, chemin: string, corps?: unknown, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(chemin, {
      method: methode,
      credentials: "same-origin",
      headers: methode === "GET" ? undefined : { ...EN_TETE, ...(corps !== undefined ? { "content-type": "application/json" } : {}) },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("network", "Impossible de joindre le serveur de Bibi. Es-tu hors ligne ?");
  }
  if (!r.ok) throw await lireErreur(r);
  return (await r.json()) as T;
}

export const api = {
  health: () => appel<{ ok: boolean }>("GET", "/api/health"),
  session: () => appel<SessionInfo>("GET", "/api/session"),
  loginCode: (code: string) => appel<{ ok: boolean }>("POST", "/api/auth/code", { code }),
  register: (email: string, password: string) => appel<{ ok: boolean }>("POST", "/api/auth/register", { email, password }),
  login: (email: string, password: string) => appel<{ ok: boolean }>("POST", "/api/auth/login", { email, password }),
  logout: () => appel<{ ok: boolean }>("POST", "/api/auth/logout", {}),

  providers: () => appel<{ providers: ProviderStatus[]; fallback: ProviderId[] }>("GET", "/api/providers"),
  setKey: (id: ProviderId, key: string) => appel<{ ok: boolean }>("PUT", `/api/providers/${id}/key`, { key }),
  clearKey: (id: ProviderId) => appel<{ ok: boolean }>("DELETE", `/api/providers/${id}/key`),
  testProvider: (id: ProviderId) => appel<{ ok: boolean; latencyMs: number; modelCount: number }>("POST", `/api/providers/${id}/test`, {}),
  models: (id: ProviderId) => appel<{ models: { id: string; label: string; free: boolean | null }[] }>("GET", `/api/providers/${id}/models`),
  setFallback: (ids: ProviderId[]) => appel<{ ok: boolean }>("PUT", "/api/settings/ai", { fallback: ids }),

  speechEngines: () => appel<SpeechEngines>("GET", "/api/speech/engines"),
  speechVoices: (engine: string) => appel<{ voices: ServerVoice[] }>("GET", `/api/speech/voices?engine=${encodeURIComponent(engine)}`),
  setElevenKey: (key: string) => appel<{ ok: boolean }>("PUT", "/api/speech/elevenlabs/key", { key }),
  clearElevenKey: () => appel<{ ok: boolean }>("DELETE", "/api/speech/elevenlabs/key"),
  async tts(engine: string, voice: string, text: string, signal?: AbortSignal): Promise<Blob> {
    const r = await fetch("/api/speech/tts", {
      method: "POST", credentials: "same-origin", signal,
      headers: { ...EN_TETE, "content-type": "application/json" },
      body: JSON.stringify({ engine, voice, text }),
    }).catch(() => { throw new ApiError("network", "Serveur injoignable."); });
    if (!r.ok) throw await lireErreur(r);
    return r.blob();
  },
  async stt(audio: Blob, lang: string): Promise<string> {
    const r = await fetch(`/api/speech/stt?lang=${encodeURIComponent(lang)}`, {
      method: "POST", credentials: "same-origin", headers: { ...EN_TETE, "content-type": audio.type || "audio/webm" }, body: audio,
    }).catch(() => { throw new ApiError("network", "Serveur injoignable."); });
    if (!r.ok) throw await lireErreur(r);
    return ((await r.json()) as { text: string }).text;
  },
};

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export type ChatEvent =
  | { type: "start"; provider: string; providerName: string; model: string }
  | { type: "delta"; text: string }
  | { type: "fallback"; from: string; to: string; code: string; message: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string; retryAfterSeconds?: number };

/** Lit le flux SSE de POST /api/chat. Le générateur s'arrête proprement si `signal` est annulé (bouton « Stop »). */
export async function* discuter(
  corps: { provider: ProviderId; model?: string; messages: ChatMessage[]; temperature?: number; fallback?: boolean },
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  let r: Response;
  try {
    r = await fetch("/api/chat", {
      method: "POST", credentials: "same-origin", signal,
      headers: { ...EN_TETE, "content-type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    yield { type: "error", code: "network", message: "Impossible de joindre le serveur de Bibi. Es-tu hors ligne ?" };
    return;
  }
  if (!r.ok || !r.body) {
    const e = await lireErreur(r);
    yield { type: "error", code: e.code, message: e.message, retryAfterSeconds: e.retryAfterSeconds };
    return;
  }
  const lecteur = r.body.getReader();
  const dec = new TextDecoder();
  let tampon = "";
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += dec.decode(value, { stream: true });
      let i: number;
      while ((i = tampon.indexOf("\n\n")) >= 0) {
        const bloc = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        for (const ligne of bloc.split("\n")) {
          if (!ligne.startsWith("data:")) continue;
          try { yield JSON.parse(ligne.slice(5).trim()) as ChatEvent; } catch { /* ligne cassée : ignorée */ }
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    yield { type: "error", code: "network", message: "La connexion a été coupée en cours de réponse." };
  } finally {
    try { lecteur.releaseLock(); } catch { /* déjà libéré */ }
  }
}
