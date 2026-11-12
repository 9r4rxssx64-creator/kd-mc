// Assemblage de l'application serveur. buildApp() est aussi utilisé par les tests (faux fournisseurs).
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import { ouvrirBase, type Db } from "./database/db.js";
import { ProviderHub } from "./providers/hub.js";
import { SpeechHub } from "./speech/engines.js";
import { installerAuth, modeAuth } from "./security/auth.js";
import { routesChat } from "./routes/chat.js";
import { routesProviders } from "./routes/providers.js";
import { routesSync } from "./routes/sync.js";
import { routesSpeech } from "./routes/speech.js";

export interface Built {
  app: FastifyInstance;
  db: Db;
  hub: ProviderHub;
}

export async function buildApp(config: Config, opts: { fetchImpl?: typeof fetch; staticDir?: string; logger?: boolean } = {}): Promise<Built> {
  const db = ouvrirBase(config.dbPath);
  const app = Fastify({
    logger: opts.logger
      ? { level: "info", redact: ["req.headers.cookie", "req.headers.authorization", "req.headers['x-goog-api-key']"] }
      : false,
    bodyLimit: 1024 * 1024,
    trustProxy: config.NODE_ENV === "production",
  });

  // Un POST/DELETE sans corps mais déclaré en JSON est accepté (objet vide) ; un JSON cassé reste refusé (400).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const texte = String(body);
    if (texte.trim() === "") return done(null, {});
    try {
      done(null, JSON.parse(texte));
    } catch {
      const e = new Error("JSON invalide") as Error & { statusCode: number };
      e.statusCode = 400;
      done(e, undefined);
    }
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:", "data:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: config.secure,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: config.RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" });

  installerAuth(app, config, db);
  const hub = new ProviderHub(config, db, opts.fetchImpl);
  const speech = new SpeechHub(config, db, hub, opts.fetchImpl);

  app.get("/api/health", async () => ({ ok: true, name: "bibi", time: Date.now() }));

  app.get("/api/session", async (req) => ({
    mode: modeAuth(config),
    authenticated: !!req.principal,
    user: req.principal && req.principal.email ? { email: req.principal.email, owner: req.principal.owner } : null,
    registrationOpen: modeAuth(config) === "accounts",
    features: {
      cloudSync: config.ENABLE_CLOUD_SYNC,
      localMemory: config.ENABLE_LOCAL_MEMORY,
      allowPaidProviders: config.ALLOW_PAID_PROVIDERS,
      defaultProvider: config.AI_DEFAULT_PROVIDER,
    },
  }));

  routesProviders(app, hub);
  routesChat(app, hub);
  routesSync(app, db);
  routesSpeech(app, speech);

  // Contrôle d'accès à la synchro : seulement si les comptes sont activés.
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/api/sync") && !config.ENABLE_CLOUD_SYNC)
      return reply.code(404).send({ error: { code: "sync_disabled", message: "La synchronisation n'est pas activée sur ce serveur." } });
  });

  // Application web (fichiers construits par Vite)
  const dir = resolve(opts.staticDir ?? "dist");
  if (existsSync(dir)) {
    // Les fichiers existants sont servis par fastify-static : c'est ICI que se règle le cache.
    // Le service worker et l'index ne doivent jamais rester en cache, sinon la mise à jour automatique casse.
    await app.register(fastifyStatic, {
      root: dir, wildcard: false, cacheControl: false,
      setHeaders: (res, chemin) => {
        const nom = chemin.slice(dir.length).replace(/\\/g, "/");
        if (nom === "/service-worker.js" || nom === "/index.html") res.setHeader("cache-control", "no-cache");
        else if (nom.startsWith("/assets/")) res.setHeader("cache-control", "public, max-age=31536000, immutable");
      },
    });
    app.get("/*", async (req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: { code: "not_found", message: "Introuvable." } });
      const chemin = req.url.split("?")[0]!;
      // le service worker et l'index ne doivent jamais rester en cache : sinon la mise à jour automatique casse
      if (chemin === "/service-worker.js" || chemin === "/index.html" || chemin === "/") reply.header("cache-control", "no-cache");
      else if (chemin.startsWith("/assets/")) reply.header("cache-control", "public, max-age=31536000, immutable");
      return chemin.includes(".") && !chemin.endsWith(".html") ? reply.sendFile(chemin.slice(1)) : reply.sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({ ok: true, message: "API Bibi. Construis l'interface avec « npm run build » ou lance « npm run dev »." }));
  }

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: "not_found", message: "Introuvable." } }));
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err: err.message }, "erreur serveur");
    // jamais de trace ni de détail interne dans la réponse
    reply.code(status).send({
      error: { code: status === 429 ? "rate_limited" : status === 413 ? "too_large" : status >= 500 ? "internal" : "bad_request",
        message: status === 429 ? "Trop de requêtes, réessaie dans un instant." : status === 413 ? "Envoi trop volumineux." : status >= 500 ? "Erreur interne." : "Requête invalide." },
    });
  });

  return { app, db, hub };
}
