import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { erreur } from "../security/auth.js";
import type { SpeechHub } from "../speech/engines.js";
import { ProviderError } from "../providers/types.js";

const engine = z.enum(["elevenlabs", "piper", "kokoro"]);

function err(reply: Parameters<typeof erreur>[0], e: unknown) {
  if (e instanceof ProviderError) {
    const status = e.code === "paid_blocked" ? 403 : e.code === "not_configured" ? 400 : e.code === "invalid_key" ? 401 : e.code === "quota" ? 429 : 502;
    return reply.code(status).send({ error: { code: e.code, message: e.message } });
  }
  return erreur(reply, 500, "internal", "Erreur interne.");
}

export function routesSpeech(app: FastifyInstance, speech: SpeechHub): void {
  app.addContentTypeParser(/^audio\//, { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 }, (_r, body, done) => done(null, body));

  app.get("/api/speech/engines", async () => speech.engines());

  app.put("/api/speech/elevenlabs/key", async (req, reply) => {
    const k = z.object({ key: z.string().trim().min(8).max(200) }).safeParse(req.body);
    if (!k.success) return erreur(reply, 400, "bad_input", "Clé invalide.");
    speech.setElevenKey(k.data.key);
    return { ok: true };
  });
  app.delete("/api/speech/elevenlabs/key", async () => {
    speech.setElevenKey(null);
    return { ok: true };
  });

  app.get("/api/speech/voices", async (req, reply) => {
    const e = engine.safeParse((req.query as { engine?: string }).engine);
    if (!e.success) return erreur(reply, 400, "bad_input", "Moteur inconnu.");
    try {
      return { voices: await speech.voices(e.data) };
    } catch (x) {
      return err(reply, x);
    }
  });

  app.post("/api/speech/tts", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = z.object({ engine, voice: z.string().min(1).max(200), text: z.string().min(1).max(2000) }).safeParse(req.body);
    if (!b.success) return erreur(reply, 400, "bad_input", "Demande de synthèse invalide.");
    try {
      const r = await speech.synthesize(b.data.engine, b.data.voice, b.data.text);
      return reply.type(r.contentType).send(r.audio);
    } catch (x) {
      return err(reply, x);
    }
  });

  app.post("/api/speech/stt", { bodyLimit: 10 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return erreur(reply, 400, "bad_input", "Aucun son reçu.");
    const lang = String((req.query as { lang?: string }).lang ?? "fr");
    try {
      return { text: await speech.transcribe(req.body, String(req.headers["content-type"] ?? "audio/webm").split(";")[0]!, lang) };
    } catch (x) {
      return err(reply, x);
    }
  });
}
