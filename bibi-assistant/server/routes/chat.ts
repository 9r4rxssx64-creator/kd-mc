// Discussion en flux (SSE) avec secours automatique vers un autre fournisseur GRATUIT.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { erreur } from "../security/auth.js";
import type { ProviderHub } from "../providers/hub.js";
import { ProviderError, type ProviderErrorCode } from "../providers/types.js";

const corps = z.object({
  provider: z.string().min(1).max(40),
  model: z.string().max(200).optional(),
  messages: z
    .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(20_000) }))
    .min(1)
    .max(80),
  temperature: z.number().min(0).max(2).optional(),
  fallback: z.boolean().optional(),
});

const SECOURS_POSSIBLE: ProviderErrorCode[] = ["quota", "unavailable", "timeout", "network", "invalid_key", "not_configured"];

export function routesChat(app: FastifyInstance, hub: ProviderHub): void {
  app.post("/api/chat", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = corps.safeParse(req.body);
    if (!p.success) return erreur(reply, 400, "bad_input", "Message invalide.");
    const b = p.data;
    const total = b.messages.reduce((n, m) => n + m.content.length, 0);
    if (total > 120_000) return erreur(reply, 413, "too_long", "Conversation trop longue : commence une nouvelle conversation.");

    const ordre = [b.provider, ...(b.fallback === false ? [] : hub.fallbackOrder().filter((x) => x !== b.provider))];

    const ctrl = new AbortController();
    req.raw.on("close", () => ctrl.abort());

    reply.hijack();
    reply.raw.writeHead(200, {
      ...reply.getHeaders(),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    } as Record<string, string>);
    const envoyer = (o: unknown) => {
      if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(o)}\n\n`);
    };

    let derniere: ProviderError | null = null;
    for (let i = 0; i < ordre.length; i++) {
      const id = ordre[i]!;
      let emis = false;
      try {
        const def = hub.definition(id);
        const model = i === 0 && b.model ? b.model : hub.status().find((s) => s.id === id)!.defaultModel;
        if (!model) throw new ProviderError("not_configured", `Aucun modèle choisi pour ${def.name}.`);
        await hub.assertModelAllowed(id, model);
        const prov = hub.get(id);
        envoyer({ type: "start", provider: id, providerName: def.name, model });
        for await (const t of prov.streamResponse({ model, messages: b.messages, temperature: b.temperature, signal: ctrl.signal })) {
          emis = true;
          envoyer({ type: "delta", text: t });
        }
        envoyer({ type: "done" });
        reply.raw.end();
        return;
      } catch (e) {
        if (ctrl.signal.aborted) {
          reply.raw.end();
          return;
        }
        const pe =
          e instanceof ProviderError ? e : new ProviderError("unavailable", "Erreur inattendue chez le fournisseur.");
        derniere = pe;
        const suivant = ordre[i + 1];
        if (!emis && suivant && SECOURS_POSSIBLE.includes(pe.code)) {
          envoyer({ type: "fallback", from: id, to: suivant, code: pe.code, message: pe.message });
          continue;
        }
        break;
      }
    }
    envoyer({
      type: "error",
      code: derniere?.code ?? "unavailable",
      message: derniere?.message ?? "Aucune réponse.",
      retryAfterSeconds: derniere?.retryAfterSeconds,
    });
    reply.raw.end();
  });
}
