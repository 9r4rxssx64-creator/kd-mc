import { afterEach, describe, expect, it } from "vitest";
import { chat, H, monter } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof monter>>;
afterEach(async () => { await ctx?.fermer(); });

const msg = (t = "Salut Bibi") => [{ role: "user", content: t }];

describe("discussion en flux", () => {
  it("envoie un message et reçoit la réponse en direct (Groq)", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_test_key_123456" });
    const r = await chat(ctx.app, { provider: "groq", model: "llama-3.3-70b-versatile", messages: msg() });
    expect(r.status).toBe(200);
    expect(r.events[0]).toMatchObject({ type: "start", provider: "groq" });
    const texte = r.events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    expect(texte).toBe("Bonjour depuis groq : Salut Bibi");
    expect(r.events.at(-1)).toEqual({ type: "done" });
  });

  it("la clé part au fournisseur mais n'apparaît jamais dans les réponses", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_secret_ABCDEFGH" });
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.raw).not.toContain("gsk_secret_ABCDEFGH");
    const prov = await ctx.app.inject({ url: "/api/providers" });
    expect(prov.body).not.toContain("gsk_secret_ABCDEFGH");
    expect(ctx.fake.calls.find((c) => c.path.includes("chat/completions"))?.headers.authorization).toBe("Bearer gsk_secret_ABCDEFGH");
  });

  it("répond avec Gemini (clé en en-tête, jamais dans l'URL)", async () => {
    ctx = await monter({ GEMINI_API_KEY: "AIza_fake_key_000111" });
    const r = await chat(ctx.app, { provider: "gemini", model: "gemini-2.0-flash", messages: msg() });
    expect(r.events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Salut de Gemini");
    const appel = ctx.fake.calls.find((c) => c.path.includes("streamGenerateContent"))!;
    expect(appel.path).not.toContain("AIza_fake_key_000111");
    expect(appel.headers["x-goog-api-key"]).toBe("AIza_fake_key_000111");
  });

  it("clé invalide : message clair, pas de plantage", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_bad_key_12345" });
    ctx.fake.mode.groq = "401";
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.events.at(-1)).toMatchObject({ type: "error", code: "invalid_key" });
  });

  it("quota atteint : bascule automatique vers le fournisseur de secours choisi", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_quota_key_123", GEMINI_API_KEY: "AIza_fallback_key1" });
    await ctx.app.inject({ method: "PUT", url: "/api/settings/ai", headers: H, payload: { fallback: ["gemini"] } });
    ctx.fake.mode.groq = "429";
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.events.some((e) => e.type === "fallback" && e.from === "groq" && e.to === "gemini" && e.code === "quota")).toBe(true);
    expect(r.events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Salut de Gemini");
  });

  it("sans secours configuré : le quota est annoncé tel quel", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_quota_key_123", GEMINI_API_KEY: "AIza_fallback_key1" });
    ctx.fake.mode.groq = "429";
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.events.at(-1)).toMatchObject({ type: "error", code: "quota", retryAfterSeconds: 12 });
  });

  it("fournisseur en panne (500) : erreur « indisponible »", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_down_key_12345" });
    ctx.fake.mode.groq = "500";
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.events.at(-1)).toMatchObject({ type: "error", code: "unavailable" });
  });

  it("fournisseur non configuré : erreur claire", async () => {
    ctx = await monter();
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.events.at(-1)).toMatchObject({ type: "error", code: "not_configured" });
  });

  it("refuse un modèle OpenRouter non prouvé gratuit tant que le payant est coupé", async () => {
    ctx = await monter({ OPENROUTER_API_KEY: "sk-or-fake-1234567" });
    const payant = await chat(ctx.app, { provider: "openrouter", model: "openai/gpt-4o", messages: msg() });
    expect(payant.events.at(-1)).toMatchObject({ type: "error", code: "paid_blocked" });
    const gratuit = await chat(ctx.app, { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", messages: msg() });
    expect(gratuit.events.at(-1)).toEqual({ type: "done" });
  });

  it("n'affiche que les modèles gratuits d'OpenRouter ; tous si le payant est autorisé", async () => {
    ctx = await monter({ OPENROUTER_API_KEY: "sk-or-fake-1234567" });
    const a = await ctx.app.inject({ url: "/api/providers/openrouter/models" });
    expect(a.json().models.map((m: { id: string }) => m.id)).toEqual(["meta-llama/llama-3.3-70b-instruct:free"]);
    await ctx.fermer();
    ctx = await monter({ OPENROUTER_API_KEY: "sk-or-fake-1234567", ALLOW_PAID_PROVIDERS: "true" });
    const b = await ctx.app.inject({ url: "/api/providers/openrouter/models" });
    expect(b.json().models).toHaveLength(2);
  });

  it("le fournisseur personnalisé reste bloqué s'il n'est pas déclaré gratuit", async () => {
    ctx = await monter({ CUSTOM_AI_BASE_URL: "http://127.0.0.1:1/custom" });
    const r = await chat(ctx.app, { provider: "custom", model: "m", messages: msg() });
    expect(r.events.at(-1)).toMatchObject({ type: "error", code: "paid_blocked" });
  });

  it("le fournisseur personnalisé fonctionne quand il est déclaré gratuit", async () => {
    ctx = await monter({ CUSTOM_AI_BASE_URL: "PLACEHOLDER", CUSTOM_AI_FREE: "true" });
    await ctx.fermer();
    // on remonte avec l'adresse du faux serveur
    const fake = await (await import("./fake-upstream.js")).demarrerFaux();
    const { buildApp } = await import("../../server/app.js");
    const { loadConfig } = await import("../../server/config.js");
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: ":memory:", SESSION_SECRET: "y".repeat(40), CUSTOM_AI_BASE_URL: `${fake.url}/custom`, CUSTOM_AI_FREE: "true", CUSTOM_AI_MODELS: "model-b" });
    const b = await buildApp(config, { staticDir: "/nonexistent" });
    const r = await chat(b.app, { provider: "custom", model: "model-b", messages: msg() });
    expect(r.events.at(-1)).toEqual({ type: "done" });
    await b.app.close();
    await fake.close();
    ctx = await monter();
  });

  it("valide l'entrée : message vide, rôle inconnu, conversation trop longue", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_valid_key_1234" });
    const a = await ctx.app.inject({ method: "POST", url: "/api/chat", headers: H, payload: { provider: "groq", messages: [] } });
    expect(a.statusCode).toBe(400);
    const b = await ctx.app.inject({ method: "POST", url: "/api/chat", headers: H, payload: { provider: "groq", messages: [{ role: "hacker", content: "x" }] } });
    expect(b.statusCode).toBe(400);
    const grosse = Array.from({ length: 10 }, () => ({ role: "user", content: "a".repeat(15_000) }));
    const c = await ctx.app.inject({ method: "POST", url: "/api/chat", headers: H, payload: { provider: "groq", messages: grosse } });
    expect(c.statusCode).toBe(413);
  });
});

describe("fournisseurs : test de connexion, clés enregistrées", () => {
  it("test de connexion réussi, puis clé refusée", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_test_conn_1234" });
    const ok = await ctx.app.inject({ method: "POST", url: "/api/providers/groq/test", headers: H });
    expect(ok.json()).toMatchObject({ ok: true, modelCount: 2 });
    ctx.fake.mode.groq = "401";
    const ko = await ctx.app.inject({ method: "POST", url: "/api/providers/groq/test", headers: H });
    expect(ko.statusCode).toBe(401);
    expect(ko.json().error.code).toBe("invalid_key");
  });

  it("enregistre une clé saisie dans l'interface : chiffrée en base, jamais renvoyée", async () => {
    ctx = await monter();
    const put = await ctx.app.inject({ method: "PUT", url: "/api/providers/groq/key", headers: H, payload: { key: "gsk_saved_in_ui_9999" } });
    expect(put.json()).toEqual({ ok: true });
    const st = (await ctx.app.inject({ url: "/api/providers" })).json().providers.find((p: { id: string }) => p.id === "groq");
    expect(st).toMatchObject({ configured: true, keySource: "saved" });
    expect(JSON.stringify(st)).not.toContain("gsk_saved_in_ui_9999");
    const brut = ctx.db.prepare("SELECT value_enc FROM secrets WHERE name='ai:groq'").get() as { value_enc: string };
    expect(brut.value_enc).not.toContain("gsk_saved_in_ui_9999");
    const r = await chat(ctx.app, { provider: "groq", model: "m", messages: msg() });
    expect(r.events.at(-1)).toEqual({ type: "done" });
    await ctx.app.inject({ method: "DELETE", url: "/api/providers/groq/key", headers: H });
    const apres = (await ctx.app.inject({ url: "/api/providers" })).json().providers.find((p: { id: string }) => p.id === "groq");
    expect(apres.configured).toBe(false);
  });

  it("limites lues dans les en-têtes du fournisseur, rien d'inventé", async () => {
    ctx = await monter({ GROQ_API_KEY: "gsk_usage_key_1234" });
    await ctx.app.inject({ method: "POST", url: "/api/providers/groq/test", headers: H });
    const st = (await ctx.app.inject({ url: "/api/providers" })).json().providers.find((p: { id: string }) => p.id === "groq");
    expect(st.usage.limits["x-ratelimit-limit-requests"]).toBe("30");
    const gem = (await ctx.app.inject({ url: "/api/providers" })).json().providers.find((p: { id: string }) => p.id === "gemini");
    expect(gem.usage.limits).toEqual({});
    expect(gem.freeTierNote).not.toMatch(/illimit/i);
  });
});
