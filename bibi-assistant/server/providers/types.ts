// Interface commune des fournisseurs d'IA. Ajouter un fournisseur = écrire une classe qui
// implémente AIProvider puis la déclarer dans registry.ts. Rien d'autre ne change.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** true = gratuit prouvé par le fournisseur, false = payant prouvé, null = on ne peut pas le savoir */
  free: boolean | null;
}

export interface UsageInfo {
  /** Limites lues dans les en-têtes de la dernière réponse du fournisseur (jamais inventées). */
  limits: Record<string, string>;
  lastSeenAt: number | null;
}

export type ProviderErrorCode =
  | "not_configured"
  | "invalid_key"
  | "quota"
  | "unavailable"
  | "bad_request"
  | "paid_blocked"
  | "timeout"
  | "network";

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public status?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generateResponse(opts: GenerateOptions): Promise<string>;
  streamResponse(opts: GenerateOptions): AsyncGenerator<string, void, void>;
  testConnection(): Promise<{ latencyMs: number; modelCount: number }>;
  getAvailableModels(): Promise<ModelInfo[]>;
  getUsageInformation(): UsageInfo;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  signupUrl: string;
  keyHelp: string;
  /** Texte honnête sur l'offre gratuite : jamais « illimité ». */
  freeTierNote: string;
  defaultModel: string;
  /** Un modèle peut-il coûter de l'argent sans qu'on puisse le détecter ? */
  costUncertain: boolean;
}
