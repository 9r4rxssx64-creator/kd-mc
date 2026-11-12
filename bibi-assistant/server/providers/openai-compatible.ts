// Fournisseurs compatibles « OpenAI chat completions » : Groq, OpenRouter, Ollama, LM Studio, vLLM…
import { appeler, lireSSE } from "./http.js";
import {
  ProviderError,
  type AIProvider,
  type GenerateOptions,
  type ModelInfo,
  type UsageInfo,
} from "./types.js";

export interface OpenAICompatOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Décide si un modèle est gratuit à partir de l'objet renvoyé par /models. */
  freeFromModel?: (m: Record<string, unknown>) => boolean | null;
  extraHeaders?: Record<string, string>;
  fixedModels?: string[];
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  private usage: UsageInfo = { limits: {}, lastSeenAt: null };
  private f: typeof fetch;

  constructor(private o: OpenAICompatOptions) {
    this.id = o.id;
    this.name = o.name;
    this.f = o.fetchImpl ?? fetch;
  }

  private entetes(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json", ...(this.o.extraHeaders ?? {}) };
    if (this.o.apiKey) h.authorization = `Bearer ${this.o.apiKey}`;
    return h;
  }

  private retenirLimites(rep: Response): void {
    const limites: Record<string, string> = {};
    rep.headers.forEach((v, k) => {
      if (/^x-ratelimit-|^retry-after$/i.test(k)) limites[k.toLowerCase()] = v.slice(0, 80);
    });
    if (Object.keys(limites).length) this.usage = { limits: limites, lastSeenAt: Date.now() };
  }

  private corps(o: GenerateOptions, stream: boolean): string {
    return JSON.stringify({
      model: o.model,
      messages: o.messages,
      stream,
      temperature: o.temperature ?? 0.7,
      ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
    });
  }

  async generateResponse(o: GenerateOptions): Promise<string> {
    const rep = await appeler(this.f, `${this.o.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.entetes(),
      body: this.corps(o, false),
      signal: o.signal,
    });
    this.retenirLimites(rep);
    const j = (await rep.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? "";
  }

  async *streamResponse(o: GenerateOptions): AsyncGenerator<string, void, void> {
    const rep = await appeler(this.f, `${this.o.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.entetes(),
      body: this.corps(o, true),
      signal: o.signal,
    });
    this.retenirLimites(rep);
    if (!rep.body) throw new ProviderError("unavailable", "Réponse vide du fournisseur.");
    for await (const data of lireSSE(rep.body)) {
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        if (j.error) throw new ProviderError("unavailable", String(j.error.message ?? "Erreur du fournisseur").slice(0, 160));
        const t = j.choices?.[0]?.delta?.content;
        if (t) yield t;
      } catch (e) {
        if (e instanceof ProviderError) throw e; // sinon : ligne de service (keep-alive…) ignorée
      }
    }
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    if (this.o.fixedModels?.length) return this.o.fixedModels.map((id) => ({ id, label: id, free: null }));
    const rep = await appeler(this.f, `${this.o.baseUrl}/models`, { headers: this.entetes() }, 20_000);
    this.retenirLimites(rep);
    const j = (await rep.json()) as { data?: Record<string, unknown>[] };
    return (j.data ?? [])
      .filter((m) => typeof m.id === "string" && !/whisper|tts|guard|embed|moderation|audio/i.test(String(m.id)))
      .map((m) => ({
        id: String(m.id),
        label: String(m.name ?? m.id),
        free: this.o.freeFromModel ? this.o.freeFromModel(m) : null,
      }));
  }

  async testConnection(): Promise<{ latencyMs: number; modelCount: number }> {
    const t0 = Date.now();
    const modeles = await this.getAvailableModels();
    return { latencyMs: Date.now() - t0, modelCount: modeles.length };
  }

  getUsageInformation(): UsageInfo {
    return this.usage;
  }
}
