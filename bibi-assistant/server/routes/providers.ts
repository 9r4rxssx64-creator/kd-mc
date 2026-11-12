import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { erreur } from "../security/auth.js";
import { IDS, type ProviderHub } from "../providers/hub.js";
import { ProviderError } from "../providers/types.js";

function reponseErreur(reply: Parameters<typeof erreur>[0], e: unknown) {
  if (e instanceof ProviderError) {
    const status = { not_configured: 400, invalid_key: 401, quota: 429, unavailable: 502, bad_request: 400, paid_blocked: 403, timeout: 504, network: 502 }[e.code];
    return reply.code(status).send({ error: { code: e.code, message: e.message, retryAfterSeconds: e.retryAfterSeconds } });
  }
  return erreur(reply, 500, "internal", "Erreur interne.");
}

export function routesProviders(app: FastifyInstance, hub: ProviderHub): void {
  app.get("/api/providers", async () => ({
    providers: hub.status(),
    fallback: hub.fallbackOrder(),
  }));

  app.put("/api/providers/:id/key", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!IDS.includes(id)) return erreur(reply, 404, "unknown", "Fournisseur inconnu.");
    const k = z.object({ key: z.string().trim().min(8).max(400) }).safeParse(req.body);
    if (!k.success) return erreur(reply, 400, "bad_input", "Clé invalide.");
    try {
      hub.setKey(id, k.data.key);
    } catch (e) {
      return reponseErreur(reply, e);
    }
    return { ok: true }; // la clé n'est jamais renvoyée
  });

  app.delete("/api/providers/:id/key", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!IDS.includes(id)) return erreur(reply, 404, "unknown", "Fournisseur inconnu.");
    hub.clearKey(id);
    return { ok: true };
  });

  app.post("/api/providers/:id/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!IDS.includes(id)) return erreur(reply, 404, "unknown", "Fournisseur inconnu.");
    try {
      return { ok: true, ...(await hub.get(id).testConnection()) };
    } catch (e) {
      return reponseErreur(reply, e);
    }
  });

  app.get("/api/providers/:id/models", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!IDS.includes(id)) return erreur(reply, 404, "unknown", "Fournisseur inconnu.");
    try {
      return { models: await hub.models(id) };
    } catch (e) {
      return reponseErreur(reply, e);
    }
  });

  app.put("/api/settings/ai", async (req, reply) => {
    const b = z.object({ fallback: z.array(z.string()).max(10) }).safeParse(req.body);
    if (!b.success) return erreur(reply, 400, "bad_input", "Réglage invalide.");
    hub.setFallbackOrder(b.data.fallback);
    return { ok: true, fallback: hub.fallbackOrder() };
  });
}
