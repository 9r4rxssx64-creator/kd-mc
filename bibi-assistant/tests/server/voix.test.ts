import { afterEach, describe, expect, it } from "vitest";
import { H, monter } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof monter>>;
afterEach(async () => { await ctx?.fermer(); });

// Ces tests utilisent de FAUX serveurs de voix locaux : ils prouvent que Bibi parle correctement
// au protocole attendu, pas que le vrai Piper / Kokoro / ElevenLabs répond (voir README).
describe("moteurs de voix du serveur", () => {
  it("rien n'est proposé tant que rien n'est configuré", async () => {
    ctx = await monter();
    const e = (await ctx.app.inject({ url: "/api/speech/engines" })).json();
    expect(e.piper.configured).toBe(false);
    expect(e.kokoro.configured).toBe(false);
    expect(e.elevenlabs.configured).toBe(false);
    const v = await ctx.app.inject({ url: "/api/speech/voices?engine=kokoro" });
    expect(v.statusCode).toBe(400);
    expect(v.json().error.code).toBe("not_configured");
  });

  it("Kokoro : liste les voix et synthétise", async () => {
    const fake = await (await import("./fake-upstream.js")).demarrerFaux();
    const { buildApp } = await import("../../server/app.js");
    const { loadConfig } = await import("../../server/config.js");
    const b = await buildApp(loadConfig({ NODE_ENV: "test", DATABASE_URL: ":memory:", SESSION_SECRET: "k".repeat(40), KOKORO_URL: `${fake.url}/kokoro` }), { staticDir: "/nonexistent" });
    const voix = (await b.app.inject({ url: "/api/speech/voices?engine=kokoro" })).json().voices;
    expect(voix.map((v: { id: string }) => v.id)).toEqual(["ff_siwis", "af_bella"]);
    const t = await b.app.inject({ method: "POST", url: "/api/speech/tts", headers: H, payload: { engine: "kokoro", voice: "ff_siwis", text: "Bonjour" } });
    expect(t.statusCode).toBe(200);
    expect(t.headers["content-type"]).toContain("audio/mpeg");
    expect(t.body).toBe("FAKEMP3");
    await b.app.close(); await fake.close();
  });

  it("Piper : voix déclarées dans PIPER_VOICES, synthèse par POST JSON", async () => {
    const fake = await (await import("./fake-upstream.js")).demarrerFaux();
    const { buildApp } = await import("../../server/app.js");
    const { loadConfig } = await import("../../server/config.js");
    const b = await buildApp(loadConfig({ NODE_ENV: "test", DATABASE_URL: ":memory:", SESSION_SECRET: "k".repeat(40), PIPER_URL: `${fake.url}/piper`, PIPER_VOICES: "fr_FR-siwis-medium" }), { staticDir: "/nonexistent" });
    const voix = (await b.app.inject({ url: "/api/speech/voices?engine=piper" })).json().voices;
    expect(voix).toEqual([{ id: "fr_FR-siwis-medium", name: "fr_FR-siwis-medium", lang: "fr", engine: "piper" }]);
    const t = await b.app.inject({ method: "POST", url: "/api/speech/tts", headers: H, payload: { engine: "piper", voice: "fr_FR-siwis-medium", text: "Salut" } });
    expect(t.body).toBe("FAKEWAV");
    const envoye = JSON.parse(fake.calls.find((c) => c.path === "/piper")!.body);
    expect(envoye).toEqual({ text: "Salut", voice: "fr_FR-siwis-medium" });
    await b.app.close(); await fake.close();
  });

  it("ElevenLabs reste bloqué tant que le payant n'est pas autorisé, même avec une clé", async () => {
    ctx = await monter({ ELEVENLABS_API_KEY: "el_key_1234567890" });
    const e = (await ctx.app.inject({ url: "/api/speech/engines" })).json();
    expect(e.elevenlabs).toMatchObject({ configured: true, allowed: false });
    const r = await ctx.app.inject({ method: "POST", url: "/api/speech/tts", headers: H, payload: { engine: "elevenlabs", voice: "v1", text: "Salut" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("paid_blocked");
    expect(ctx.fake.calls.some((c) => c.path.startsWith("/eleven"))).toBe(false); // aucun appel parti = aucune dépense
  });

  it("ElevenLabs autorisé : voix et synthèse, clé jamais renvoyée", async () => {
    ctx = await monter({ ELEVENLABS_API_KEY: "el_key_1234567890", ALLOW_PAID_PROVIDERS: "true" });
    const v = await ctx.app.inject({ url: "/api/speech/voices?engine=elevenlabs" });
    expect(v.json().voices[0]).toMatchObject({ id: "v1", name: "Voix 1", lang: "fr" });
    expect(v.body).not.toContain("el_key_1234567890");
    const t = await ctx.app.inject({ method: "POST", url: "/api/speech/tts", headers: H, payload: { engine: "elevenlabs", voice: "v1", text: "Salut" } });
    expect(t.body).toBe("FAKEEL");
    expect(ctx.fake.calls.find((c) => c.path.includes("text-to-speech"))!.headers["xi-api-key"]).toBe("el_key_1234567890");
  });

  it("transcription : envoie le son à Whisper (Groq) et rend le texte ; sans clé, refus clair", async () => {
    ctx = await monter();
    const sans = await ctx.app.inject({ method: "POST", url: "/api/speech/stt?lang=fr", headers: { "x-bibi": "1", "content-type": "audio/webm" }, payload: Buffer.from("son") });
    expect(sans.statusCode).toBe(400);
    await ctx.fermer();
    ctx = await monter({ GROQ_API_KEY: "gsk_stt_key_123456" });
    const r = await ctx.app.inject({ method: "POST", url: "/api/speech/stt?lang=fr", headers: { "x-bibi": "1", "content-type": "audio/webm" }, payload: Buffer.from("son") });
    expect(r.json()).toEqual({ text: "bonjour bibi" });
    const vide = await ctx.app.inject({ method: "POST", url: "/api/speech/stt", headers: { "x-bibi": "1", "content-type": "audio/webm" }, payload: Buffer.alloc(0) });
    expect(vide.statusCode).toBe(400);
  });

  it("valide les demandes de synthèse (texte trop long, moteur inconnu)", async () => {
    ctx = await monter();
    const long = await ctx.app.inject({ method: "POST", url: "/api/speech/tts", headers: H, payload: { engine: "piper", voice: "a", text: "x".repeat(2001) } });
    expect(long.statusCode).toBe(400);
    const inconnu = await ctx.app.inject({ method: "POST", url: "/api/speech/tts", headers: H, payload: { engine: "pirate", voice: "a", text: "x" } });
    expect(inconnu.statusCode).toBe(400);
  });
});
