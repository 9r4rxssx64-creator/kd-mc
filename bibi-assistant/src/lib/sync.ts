// Client de synchronisation « dernière écriture gagne ». Inactif tant que le serveur n'a pas activé les comptes.
import * as db from "./db";
import { COLLECTIONS } from "./db";
import type { CollectionName, Doc } from "./types";

export interface EtatSync { etat: "inactif" | "en_cours" | "ok" | "erreur"; derniere?: number; message?: string; envoyes?: number; recus?: number }

interface Changement { collection: CollectionName; id: string; updatedAt: number; deleted: boolean; data: unknown }
interface Reponse { accepted: number; rejected: number; seq: number; changes: { collection: CollectionName; id: string; updatedAt: number; seq: number; deleted: boolean; data: Doc }[] }

const TAILLE_LOT = 200;

/** Une synchronisation complète : envoie ce qui a changé depuis la dernière fois, reçoit le reste. */
export async function synchroniser(fetchImpl: typeof fetch = fetch): Promise<EtatSync> {
  const since = (await db.metaGet<number>("sync_since")) ?? 0;
  const dernierEnvoi = (await db.metaGet<number>("sync_envoye")) ?? 0;

  const locaux: Changement[] = [];
  for (const c of COLLECTIONS) {
    for (const d of await db.list(c, { includeDeleted: true })) {
      if (d.updatedAt > dernierEnvoi) locaux.push({ collection: c, id: d.id, updatedAt: d.updatedAt, deleted: !!d.deleted, data: d });
    }
  }
  locaux.sort((a, b) => a.updatedAt - b.updatedAt);

  let envoyes = 0, recus = 0, curseur = since, plusRecentEnvoye = dernierEnvoi;
  const lots = Math.max(1, Math.ceil(locaux.length / TAILLE_LOT));
  for (let i = 0; i < lots; i++) {
    const lot = locaux.slice(i * TAILLE_LOT, (i + 1) * TAILLE_LOT);
    const r = await fetchImpl("/api/sync", {
      method: "POST", credentials: "same-origin",
      headers: { "x-bibi": "1", "content-type": "application/json" },
      body: JSON.stringify({ since: curseur, changes: lot }),
    });
    if (r.status === 404) return { etat: "inactif", message: "La synchronisation n'est pas activée sur ce serveur." };
    if (r.status === 401) return { etat: "erreur", message: "Connecte-toi à ton compte pour synchroniser." };
    if (!r.ok) return { etat: "erreur", message: `Le serveur a répondu ${r.status}.` };
    const j = (await r.json()) as Reponse;
    envoyes += j.accepted;
    for (const c of lot) plusRecentEnvoye = Math.max(plusRecentEnvoye, c.updatedAt);
    const parColl = new Map<CollectionName, Doc[]>();
    for (const ch of j.changes) {
      const doc: Doc = ch.deleted ? { id: ch.id, updatedAt: ch.updatedAt, deleted: true } : { ...ch.data, id: ch.id, updatedAt: ch.updatedAt };
      (parColl.get(ch.collection) ?? parColl.set(ch.collection, []).get(ch.collection)!).push(doc);
    }
    for (const [c, docs] of parColl) recus += await db.appliquerDistant(c, docs);
    curseur = Math.max(curseur, j.seq);
  }
  await db.metaSet("sync_since", curseur);
  await db.metaSet("sync_envoye", plusRecentEnvoye);
  return { etat: "ok", derniere: Date.now(), envoyes, recus };
}

/** Efface les données du compte sur le serveur (la copie locale reste). */
export async function effacerCloud(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const r = await fetchImpl("/api/sync", { method: "DELETE", credentials: "same-origin", headers: { "x-bibi": "1" } });
  if (r.ok) { await db.metaSet("sync_since", 0); await db.metaSet("sync_envoye", 0); }
  return r.ok;
}
