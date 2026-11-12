// Google Gemini (API REST). La clé part dans l'en-tête x-goog-api-key, jamais dans l'URL (donc jamais dans un journal).
import { appeler, lireSSE } from "./http.js";
import {
  ProviderError,
  type AIProvider,
  type ChatMessage,
  type GenerateOptions,
  type ModelInfo,
  type UsageInfo,
} from "./types.js";

interface GeminiOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function versGemini(messages: ChatMessage[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return { system, contents };
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";
  private f: typeof fetch;
  private usage: UsageInfo = { limits: {}, lastSeenAt: null };

  constructor(private o: GeminiOptions) {
    this.f = o.fetchImpl ?? fetch;
  }

  private h() {
    return { "content-type": "application/json", "x-goog-api-key": this.o.apiKey };
  }

  private corps(o: GenerateOptions): string {
    const { system, contents } = versGemini(o.messages);
    return JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: o.temperature ?? 0.7, ...(o.maxTokens ? { maxOutputTokens: o.maxTokens } : {}) },
    });
  }

  private texte(j: unknown): string {
    const c = (j as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0];
    return (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  }

  async generateResponse(o: GenerateOptions): Promise<string> {
    const rep = await appeler(this.f, `${this.o.baseUrl}/v1beta/models/${encodeURIComponent(o.model)}:generateContent`, {
      method: "POST",
      headers: this.h(),
      body: this.corps(o),
      signal: o.signal,
    });
    return this.texte(await rep.json());
  }

  async *streamResponse(o: GenerateOptions): AsyncGenerator<string, void, void> {
    const rep = await appeler(
      this.f,
      `${this.o.baseUrl}/v1beta/models/${encodeURIComponent(o.model)}:streamGenerateContent?alt=sse`,
      { method: "POST", headers: this.h(), body: this.corps(o), signal: o.signal },
    );
    if (!rep.body) throw new ProviderError("unavailable", "Réponse vide du fournisseur.");
    for await (const data of lireSSE(rep.body)) {
      try {
        const t = this.texte(JSON.parse(data));
        if (t) yield t;
      } catch {
        /* ligne de service ignorée */
      }
    }
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const rep = await appeler(this.f, `${this.o.baseUrl}/v1beta/models?pageSize=200`, { headers: this.h() }, 20_000);
    const j = (await rep.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return (j.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini|gemma/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name, free: null }));
  }

  async testConnection(): Promise<{ latencyMs: number; modelCount: number }> {
    const t0 = Date.now();
    const modeles = await this.getAvailableModels();
    return { latencyMs: Date.now() - t0, modelCount: modeles.length };
  }

  getUsageInformation(): UsageInfo {
    return this.usage; // Gemini ne publie pas ses quotas dans les en-têtes : rien n'est inventé.
  }
}
