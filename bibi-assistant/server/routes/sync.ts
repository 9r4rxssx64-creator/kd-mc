// Synchronisation « dernière écriture gagne », par document, strictement par utilisateur.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../database/db.js";
import { erreur } from "../security/auth.js";

export const COLLECTIONS = ["conversations", "messages", "memories", "notes", "tasks", "reminders", "shopping", "voicenotes", "settings"] as const;

const corps = z.object({
  since: z.number().int().min(0).default(0),
  changes: z
    .array(
      z.object({
        collection: z.enum(COLLECTIONS),
        id: z.string().min(1).max(100),
        updatedAt: z.number().int().min(0),
        deleted: z.boolean().default(false),
        data: z.unknown(),
      }),
    )
    .max(500)
    .default([]),
});

export function routesSync(app: FastifyInstance, db: Db): void {
  app.post("/api/sync", { bodyLimit: 4 * 1024 * 1024, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = corps.safeParse(req.body);
    if (!p.success) return erreur(reply, 400, "bad_input", "Requête de synchronisation invalide.");
    const uid = req.principal!.userId;
    const { since, changes } = p.data;

    const lire = db.prepare("SELECT updated_at FROM sync_items WHERE user_id = ? AND collection = ? AND id = ?");
    const seqMax = db.prepare("SELECT COALESCE(MAX(server_seq), 0) AS m FROM sync_items WHERE user_id = ?");
    const ecrire = db.prepare(
      "INSERT OR REPLACE INTO sync_items (user_id, collection, id, updated_at, server_seq, deleted, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    let acceptes = 0;
    let refuses = 0;
    db.exec("BEGIN");
    try {
      for (const c of changes) {
        const json = JSON.stringify(c.data ?? null);
        if (json.length > 250_000) { refuses++; continue; }
        const ex = lire.get(uid, c.collection, c.id) as { updated_at: number } | undefined;
        if (ex && ex.updated_at > c.updatedAt) { refuses++; continue; } // le serveur a plus récent
        const seq = (seqMax.get(uid) as { m: number }).m + 1;
        ecrire.run(uid, c.collection, c.id, c.updatedAt, seq, c.deleted ? 1 : 0, json);
        acceptes++;
      }
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      return erreur(reply, 500, "internal", "Échec de la synchronisation.");
    }

    const lignes = db
      .prepare(
        "SELECT collection, id, updated_at, server_seq, deleted, data FROM sync_items WHERE user_id = ? AND server_seq > ? ORDER BY server_seq LIMIT 1000",
      )
      .all(uid, since) as { collection: string; id: string; updated_at: number; server_seq: number; deleted: number; data: string }[];
    return {
      accepted: acceptes,
      rejected: refuses,
      seq: (seqMax.get(uid) as { m: number }).m,
      changes: lignes.map((l) => ({
        collection: l.collection, id: l.id, updatedAt: l.updated_at, seq: l.server_seq,
        deleted: !!l.deleted, data: JSON.parse(l.data),
      })),
    };
  });

  // Effacement total des données d'un compte (droit à l'oubli).
  app.delete("/api/sync", async (req) => {
    db.prepare("DELETE FROM sync_items WHERE user_id = ?").run(req.principal!.userId);
    return { ok: true };
  });
}
