// Sessions, comptes et protections de requêtes (CSRF, accès).
import "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { Db } from "../database/db.js";
import { egalConstant, empreinte, hacherMotDePasse, nouveauJeton, verifierMotDePasse } from "./crypto.js";

export type AuthMode = "open" | "code" | "accounts";
export const COOKIE = "bibi_session";
const DUREE_MS = 30 * 24 * 3600 * 1000;

export interface Principal {
  userId: string;
  email?: string;
  owner: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export const modeAuth = (c: Config): AuthMode => (c.ENABLE_CLOUD_SYNC ? "accounts" : c.BIBI_ACCESS_CODE ? "code" : "open");

export function erreur(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

function ouvrirSession(db: Db, reply: FastifyReply, config: Config, userId: string) {
  const jeton = nouveauJeton();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    empreinte(jeton), userId, Date.now() + DUREE_MS,
  );
  reply.setCookie(COOKIE, jeton, {
    httpOnly: true, sameSite: "strict", secure: config.secure, path: "/", maxAge: DUREE_MS / 1000,
  });
}

export function installerAuth(app: FastifyInstance, config: Config, db: Db): void {
  const mode = modeAuth(config);
  app.decorateRequest("principal", null);

  // 1) Qui es-tu ?
  app.addHook("onRequest", async (req) => {
    if (mode === "open") {
      req.principal = { userId: "local", owner: true };
      return;
    }
    const jeton = req.cookies[COOKIE];
    if (!jeton) return;
    const s = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(empreinte(jeton)) as
      | { user_id: string; expires_at: number }
      | undefined;
    if (!s || s.expires_at < Date.now()) return;
    if (mode === "code") {
      req.principal = { userId: "local", owner: true };
      return;
    }
    const u = db.prepare("SELECT id, email, is_owner FROM users WHERE id = ?").get(s.user_id) as
      | { id: string; email: string; is_owner: number }
      | undefined;
    if (u) req.principal = { userId: u.id, email: u.email, owner: !!u.is_owner };
  });

  // 2) Protection CSRF : cookie SameSite=Strict + en-tête personnalisé + origine identique.
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    if (req.headers["x-bibi"] !== "1") return erreur(reply, 403, "csrf", "Requête refusée.");
    const origin = req.headers.origin;
    if (origin) {
      let h = "";
      try { h = new URL(origin).host; } catch { /* origine illisible */ }
      const permis = [req.headers.host, config.CORS_ORIGIN && new URL(config.CORS_ORIGIN).host].filter(Boolean);
      if (!permis.includes(h)) return erreur(reply, 403, "csrf", "Origine refusée.");
    }
  });

  // 3) Accès : tout l'API est fermé sauf santé, état de session et connexion.
  const publiques = new Set(["/api/health", "/api/session", "/api/auth/code", "/api/auth/login", "/api/auth/register"]);
  app.addHook("preHandler", async (req, reply) => {
    const chemin = req.url.split("?")[0]!;
    if (!chemin.startsWith("/api/") || publiques.has(chemin)) return;
    if (!req.principal) return erreur(reply, 401, "auth_required", "Connexion nécessaire.");
  });

  const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/api/auth/code", limiteAuth, async (req, reply) => {
    if (mode !== "code") return erreur(reply, 400, "not_applicable", "Pas de code d'accès configuré.");
    const code = String((req.body as { code?: string } | null)?.code ?? "");
    if (!egalConstant(code, config.BIBI_ACCESS_CODE)) return erreur(reply, 401, "bad_code", "Code incorrect.");
    ouvrirSession(db, reply, config, "local");
    return { ok: true };
  });

  const identifiants = (b: unknown): { email: string; password: string } | null => {
    const o = b as { email?: unknown; password?: unknown } | null;
    const email = String(o?.email ?? "").trim().toLowerCase();
    const password = String(o?.password ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return null;
    if (password.length < 8 || password.length > 200) return null;
    return { email, password };
  };

  app.post("/api/auth/register", limiteAuth, async (req, reply) => {
    if (mode !== "accounts") return erreur(reply, 400, "not_applicable", "Les comptes ne sont pas activés (ENABLE_CLOUD_SYNC).");
    const id = identifiants(req.body);
    if (!id) return erreur(reply, 400, "bad_input", "E-mail valide et mot de passe d'au moins 8 caractères requis.");
    const nb = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
    if (nb > 0 && !config.ALLOW_REGISTRATION)
      return erreur(reply, 403, "registration_closed", "Les inscriptions sont fermées sur ce serveur.");
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(id.email))
      return erreur(reply, 409, "exists", "Un compte existe déjà avec cet e-mail.");
    const userId = randomUUID();
    db.prepare("INSERT INTO users (id, email, password_hash, is_owner, created_at) VALUES (?, ?, ?, ?, ?)").run(
      userId, id.email, hacherMotDePasse(id.password), nb === 0 ? 1 : 0, Date.now(),
    );
    ouvrirSession(db, reply, config, userId);
    return { ok: true, owner: nb === 0 };
  });

  app.post("/api/auth/login", limiteAuth, async (req, reply) => {
    if (mode !== "accounts") return erreur(reply, 400, "not_applicable", "Les comptes ne sont pas activés (ENABLE_CLOUD_SYNC).");
    const id = identifiants(req.body);
    const u = id
      ? (db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(id.email) as
          | { id: string; password_hash: string }
          | undefined)
      : undefined;
    // Même réponse, même durée de calcul approximative, que le compte existe ou non.
    const ok = u ? verifierMotDePasse(id!.password, u.password_hash) : (verifierMotDePasse("x", hacherMotDePasse("y")), false);
    if (!ok || !u) return erreur(reply, 401, "bad_credentials", "E-mail ou mot de passe incorrect.");
    ouvrirSession(db, reply, config, u.id);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const jeton = req.cookies[COOKIE];
    if (jeton) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(empreinte(jeton));
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  // Nettoyage des sessions expirées au démarrage.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

export function userOr401(req: FastifyRequest, reply: FastifyReply): Principal | null {
  if (!req.principal) {
    erreur(reply, 401, "auth_required", "Connexion nécessaire.");
    return null;
  }
  return req.principal;
}
