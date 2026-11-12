import { buildApp, type Built } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { demarrerFaux, type Fake } from "./fake-upstream.js";

export const H = { "x-bibi": "1", "content-type": "application/json" };

export async function monter(env: Record<string, string> = {}): Promise<Built & { fake: Fake; fermer(): Promise<void> }> {
  const fake = await demarrerFaux();
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
    SESSION_SECRET: "x".repeat(40),
    GEMINI_BASE_URL: `${fake.url}/gemini`,
    GROQ_BASE_URL: `${fake.url}/groq`,
    OPENROUTER_BASE_URL: `${fake.url}/openrouter`,
    ELEVENLABS_BASE_URL: `${fake.url}/eleven`,
    ...env,
  });
  const b = await buildApp(config, { staticDir: "/nonexistent" });
  return { ...b, fake, fermer: async () => { await b.app.close(); await fake.close(); } };
}

/** Lit le flux SSE de /api/chat et rend la liste des événements. */
export async function chat(app: Built["app"], body: unknown, headers: Record<string, string> = H) {
  const r = await app.inject({ method: "POST", url: "/api/chat", headers, payload: body as object });
  const events = r.body
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  return { status: r.statusCode, events, raw: r.body };
}
