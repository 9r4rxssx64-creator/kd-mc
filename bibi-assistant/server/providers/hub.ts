// Centre des fournisseurs : clés (environnement ou enregistrées chiffrées), règles « gratuit d'abord »,
// et ordre de secours. C'est le seul endroit qui voit les clés ; elles ne sortent jamais d'ici.
import type { Config } from "../config.js";
import type { Db } from "../database/db.js";
import { chiffrer, dechiffrer } from "../security/crypto.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { ProviderError, type AIProvider, type ModelInfo, type ProviderDefinition } from "./types.js";

export const DEFINITIONS: ProviderDefinition[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    signupUrl: "https://aistudio.google.com/apikey",
    keyHelp: "Va sur aistudio.google.com, connecte-toi avec ton compte Google, puis « Get API key » → « Create API key ».",
    freeTierNote:
      "Niveau gratuit avec limites de requêtes par minute et par jour (elles changent : vérifie sur le site de Google). " +
      "Si ta clé est rattachée à un projet avec facturation, des frais peuvent s'appliquer : Bibi ne peut pas le détecter.",
    defaultModel: "gemini-2.0-flash",
    costUncertain: true,
  },
  {
    id: "groq",
    name: "Groq",
    signupUrl: "https://console.groq.com/keys",
    keyHelp: "Va sur console.groq.com, crée un compte, puis « API Keys » → « Create API Key ».",
    freeTierNote:
      "Niveau gratuit avec limites de requêtes et de jetons par minute et par jour (affichées dans la console Groq). " +
      "Pas d'illimité : au-delà, le service répond « quota atteint ».",
    defaultModel: "llama-3.3-70b-versatile",
    costUncertain: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    signupUrl: "https://openrouter.ai/keys",
    keyHelp: "Va sur openrouter.ai, crée un compte, puis « Keys » → « Create Key ». Choisis des modèles dont le nom finit par « :free ».",
    freeTierNote:
      "Seuls les modèles gratuits (prix 0, souvent « :free ») sont proposés tant que les fournisseurs payants sont désactivés. " +
      "Les modèles gratuits ont des limites par jour.",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    costUncertain: false,
  },
  {
    id: "custom",
    name: "Fournisseur personnalisé",
    signupUrl: "",
    keyHelp:
      "Pour Ollama, LM Studio, vLLM ou tout service compatible OpenAI : renseigne CUSTOM_AI_BASE_URL (et CUSTOM_AI_API_KEY si besoin) dans le fichier .env.",
    freeTierNote:
      "Bibi ne peut pas savoir si ce service est gratuit. Il reste bloqué tant que tu n'as pas mis CUSTOM_AI_FREE=true (service local) ou ALLOW_PAID_PROVIDERS=true.",
    defaultModel: "",
    costUncertain: true,
  },
];

export const IDS = DEFINITIONS.map((d) => d.id);

type CleSource = "env" | "saved" | "none";

export class ProviderHub {
  private cache = new Map<string, AIProvider>();

  constructor(
    private config: Config,
    private db: Db,
    private fetchImpl?: typeof fetch,
  ) {}

  definition(id: string): ProviderDefinition {
    const d = DEFINITIONS.find((x) => x.id === id);
    if (!d) throw new ProviderError("bad_request", "Fournisseur inconnu.");
    return d.id === "custom" ? { ...d, name: this.config.CUSTOM_AI_NAME || d.name } : d;
  }

  private cleEnv(id: string): string {
    switch (id) {
      case "gemini": return this.config.GEMINI_API_KEY;
      case "groq": return this.config.GROQ_API_KEY;
      case "openrouter": return this.config.OPENROUTER_API_KEY;
      case "custom": return this.config.CUSTOM_AI_API_KEY;
      default: return "";
    }
  }

  /** La clé enregistrée dans l'interface l'emporte sur celle du .env. */
  cle(id: string): { key: string; source: CleSource } {
    const row = this.db.prepare("SELECT value_enc FROM secrets WHERE name = ?").get(`ai:${id}`) as
      | { value_enc: string }
      | undefined;
    if (row) {
      const k = dechiffrer(row.value_enc, this.config.sessionSecret);
      if (k) return { key: k, source: "saved" };
    }
    const e = this.cleEnv(id);
    return e ? { key: e, source: "env" } : { key: "", source: "none" };
  }

  setKey(id: string, key: string): void {
    this.definition(id);
    if (id === "custom") throw new ProviderError("bad_request", "La clé du fournisseur personnalisé se règle dans le fichier .env.");
    this.db
      .prepare("INSERT OR REPLACE INTO secrets (name, value_enc, updated_at) VALUES (?, ?, ?)")
      .run(`ai:${id}`, chiffrer(key, this.config.sessionSecret), Date.now());
    this.cache.delete(id);
  }

  clearKey(id: string): void {
    this.definition(id);
    this.db.prepare("DELETE FROM secrets WHERE name = ?").run(`ai:${id}`);
    this.cache.delete(id);
  }

  configured(id: string): boolean {
    if (id === "custom") return !!this.config.CUSTOM_AI_BASE_URL;
    return !!this.cle(id).key;
  }

  /** Politique « gratuit d'abord » appliquée côté serveur : le navigateur ne peut pas la contourner. */
  paidBlockedReason(id: string): string | null {
    if (this.config.ALLOW_PAID_PROVIDERS) return null;
    if (id === "custom" && !this.config.CUSTOM_AI_FREE)
      return "Ce fournisseur n'est pas déclaré gratuit (CUSTOM_AI_FREE=true) et les fournisseurs payants sont désactivés.";
    return null;
  }

  get(id: string): AIProvider {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const d = this.definition(id);
    const blocage = this.paidBlockedReason(id);
    if (blocage) throw new ProviderError("paid_blocked", blocage);
    if (!this.configured(id)) throw new ProviderError("not_configured", `${d.name} n'est pas configuré (aucune clé).`);
    const { key } = this.cle(id);
    let p: AIProvider;
    switch (id) {
      case "gemini":
        p = new GeminiProvider({ baseUrl: this.config.GEMINI_BASE_URL, apiKey: key, fetchImpl: this.fetchImpl });
        break;
      case "groq":
        p = new OpenAICompatibleProvider({
          id, name: d.name, baseUrl: this.config.GROQ_BASE_URL, apiKey: key, fetchImpl: this.fetchImpl,
        });
        break;
      case "openrouter":
        p = new OpenAICompatibleProvider({
          id, name: d.name, baseUrl: this.config.OPENROUTER_BASE_URL, apiKey: key, fetchImpl: this.fetchImpl,
          extraHeaders: { "x-title": "Bibi" },
          freeFromModel: (m) => {
            const pr = m.pricing as { prompt?: string; completion?: string } | undefined;
            if (pr && pr.prompt !== undefined && pr.completion !== undefined)
              return Number(pr.prompt) === 0 && Number(pr.completion) === 0;
            return String(m.id).endsWith(":free") ? true : null;
          },
        });
        break;
      default:
        p = new OpenAICompatibleProvider({
          id, name: d.name, baseUrl: this.config.CUSTOM_AI_BASE_URL.replace(/\/$/, ""), apiKey: key,
          fetchImpl: this.fetchImpl,
          fixedModels: this.config.CUSTOM_AI_MODELS ? this.config.CUSTOM_AI_MODELS.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        });
    }
    this.cache.set(id, p);
    return p;
  }

  /** Modèles proposés : tant que le payant est coupé, OpenRouter ne montre que les gratuits prouvés. */
  async models(id: string): Promise<ModelInfo[]> {
    const tous = await this.get(id).getAvailableModels();
    if (id === "openrouter" && !this.config.ALLOW_PAID_PROVIDERS) return tous.filter((m) => m.free === true);
    return tous;
  }

  /** Refuse un modèle payant avant tout appel. */
  async assertModelAllowed(id: string, model: string): Promise<void> {
    if (this.config.ALLOW_PAID_PROVIDERS) return;
    if (id !== "openrouter") return;
    if (model.endsWith(":free")) return;
    let liste: ModelInfo[] = [];
    try {
      liste = await this.get(id).getAvailableModels();
    } catch {
      /* si la liste est inaccessible on refuse par prudence */
    }
    if (liste.find((m) => m.id === model)?.free !== true)
      throw new ProviderError(
        "paid_blocked",
        "Ce modèle n'est pas prouvé gratuit et les fournisseurs payants sont désactivés. Choisis un modèle « :free ».",
      );
  }

  fallbackOrder(): string[] {
    const r = this.db.prepare("SELECT value FROM meta WHERE key = 'ai_fallback'").get() as { value: string } | undefined;
    try {
      const a = JSON.parse(r?.value ?? "[]");
      return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === "string" && IDS.includes(x)) : [];
    } catch {
      return [];
    }
  }

  setFallbackOrder(ids: string[]): void {
    const propre = [...new Set(ids.filter((x) => IDS.includes(x)))];
    this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('ai_fallback', ?)").run(JSON.stringify(propre));
  }

  status() {
    return DEFINITIONS.map((d0) => {
      const d = this.definition(d0.id);
      const c = d.id === "custom" ? { source: this.config.CUSTOM_AI_BASE_URL ? ("env" as const) : ("none" as const) } : this.cle(d.id);
      let usage = { limits: {} as Record<string, string>, lastSeenAt: null as number | null };
      if (this.cache.has(d.id)) usage = this.cache.get(d.id)!.getUsageInformation();
      return {
        id: d.id,
        name: d.name,
        signupUrl: d.signupUrl,
        keyHelp: d.keyHelp,
        freeTierNote: d.freeTierNote,
        defaultModel: d.id === "custom" ? (this.config.CUSTOM_AI_MODELS.split(",")[0]?.trim() ?? "") : d.defaultModel,
        configured: this.configured(d.id),
        keySource: c.source,
        costUncertain: d.costUncertain,
        blockedReason: this.paidBlockedReason(d.id),
        usage,
      };
    });
  }
}
