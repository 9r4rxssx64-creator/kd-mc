// Configuration du serveur, lue depuis les variables d'environnement (.env non versionné).
// Aucune clé n'est jamais renvoyée au navigateur : ce fichier ne sert que côté serveur.
import { z } from "zod";

const bool = (def: boolean) =>
  z.preprocess((v) => (v === undefined || v === "" ? def : String(v).toLowerCase() === "true"), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  AI_DEFAULT_PROVIDER: z.enum(["gemini", "groq", "openrouter", "custom"]).default("gemini"),
  GEMINI_API_KEY: z.string().default(""),
  GROQ_API_KEY: z.string().default(""),
  OPENROUTER_API_KEY: z.string().default(""),
  ELEVENLABS_API_KEY: z.string().default(""),
  // Fournisseur supplémentaire compatible OpenAI (Ollama, LM Studio, vLLM, Together…)
  CUSTOM_AI_BASE_URL: z.string().default(""),
  CUSTOM_AI_API_KEY: z.string().default(""),
  CUSTOM_AI_NAME: z.string().default("Fournisseur personnalisé"),
  CUSTOM_AI_MODELS: z.string().default(""),
  CUSTOM_AI_FREE: bool(false),
  // Voix serveur facultatives
  PIPER_URL: z.string().default(""),
  PIPER_VOICES: z.string().default(""),
  KOKORO_URL: z.string().default(""),
  // Données
  DATABASE_URL: z.string().default(""),
  DATA_DIR: z.string().default("data"),
  SESSION_SECRET: z.string().default(""),
  ENABLE_CLOUD_SYNC: bool(false),
  ENABLE_LOCAL_MEMORY: bool(true),
  ALLOW_PAID_PROVIDERS: bool(false),
  ALLOW_REGISTRATION: bool(false),
  BIBI_ACCESS_CODE: z.string().default(""),
  BIBI_ALLOW_OPEN: bool(false),
  // Essais locaux seulement (http://127.0.0.1) : ne pas forcer https. Sans effet si l'écoute n'est pas en boucle locale.
  BIBI_HTTP_LOCAL: bool(false),
  CORS_ORIGIN: z.string().default(""),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  // Pour les tests : URL de base remplacées (faux fournisseurs locaux)
  GEMINI_BASE_URL: z.string().default("https://generativelanguage.googleapis.com"),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  ELEVENLABS_BASE_URL: z.string().default("https://api.elevenlabs.io"),
});

export type Config = z.infer<typeof schema> & { sessionSecret: string; dbPath: string; secure: boolean };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lignes = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration invalide (.env) :\n${lignes}`);
  }
  const c = parsed.data;
  const prod = c.NODE_ENV === "production";
  if (prod && c.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET doit faire au moins 32 caractères en production (voir .env.example).");
  }
  if (prod && !c.BIBI_ACCESS_CODE && !c.ENABLE_CLOUD_SYNC && !c.BIBI_ALLOW_OPEN) {
    throw new Error(
      "En production, protège Bibi : renseigne BIBI_ACCESS_CODE (code d'accès) ou ENABLE_CLOUD_SYNC=true (comptes). " +
        "Pour l'ouvrir volontairement à tous, mets BIBI_ALLOW_OPEN=true (déconseillé : tes clés d'IA seraient utilisables par n'importe qui).",
    );
  }
  const db = c.DATABASE_URL.trim();
  if (db && db !== ":memory:" && !db.startsWith("sqlite:")) {
    throw new Error(
      "DATABASE_URL n'est pas pris en charge : seul SQLite existe dans cette version (valeurs permises : vide ou sqlite:/chemin/bibi.db). " +
        "PostgreSQL / Supabase ne sont pas implémentés.",
    );
  }
  const sessionSecret = c.SESSION_SECRET || "dev-secret-non-securise-changez-moi-0123456789";
  const dbPath = c.DATABASE_URL.startsWith("sqlite:")
    ? c.DATABASE_URL.slice("sqlite:".length)
    : c.DATABASE_URL === ":memory:"
      ? ":memory:"
      : `${c.DATA_DIR}/bibi.db`;
  return { ...c, sessionSecret, dbPath, secure: prod && !(c.BIBI_HTTP_LOCAL && (c.HOST === "127.0.0.1" || c.HOST === "localhost")) };
}
