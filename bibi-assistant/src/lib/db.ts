// Stockage local (IndexedDB) : tout fonctionne sans serveur de synchro.
// Chaque document garde `updatedAt` ; une suppression est « douce » (deleted: true) pour pouvoir être synchronisée.
import type { CollectionMap, CollectionName, Doc } from "./types";

export const COLLECTIONS: CollectionName[] = [
  "conversations", "messages", "memories", "notes", "tasks", "reminders", "shopping", "voicenotes", "settings",
];

const NOM_BASE = "bibi";
const VERSION = 1;

let ouverture: Promise<IDBDatabase> | null = null;
const abonnes = new Map<string, Set<() => void>>();
let canal: BroadcastChannel | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (ouverture) return ouverture;
  ouverture = new Promise((ok, ko) => {
    const rq = indexedDB.open(NOM_BASE, VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      for (const c of COLLECTIONS) {
        if (!db.objectStoreNames.contains(c)) {
          const s = db.createObjectStore(c, { keyPath: "id" });
          if (c === "messages") s.createIndex("conversationId", "conversationId");
        }
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    rq.onsuccess = () => {
      const db = rq.result;
      db.onversionchange = () => db.close();
      ok(db);
    };
    rq.onerror = () => ko(rq.error ?? new Error("IndexedDB indisponible"));
    rq.onblocked = () => ko(new Error("IndexedDB bloqué par un autre onglet"));
  });
  // si l'ouverture échoue, on pourra réessayer
  ouverture.catch(() => { ouverture = null; });
  if (typeof BroadcastChannel !== "undefined" && !canal) {
    try {
      canal = new BroadcastChannel("bibi-db");
      canal.onmessage = (e) => prevenir(String(e.data), false);
    } catch { canal = null; }
  }
  return ouverture;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
}
function fin(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, ko) => { tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error); });
}

function prevenir(c: string, diffuser = true): void {
  abonnes.get(c)?.forEach((f) => { try { f(); } catch { /* un abonné fautif ne bloque pas les autres */ } });
  abonnes.get("*")?.forEach((f) => { try { f(); } catch { /* idem */ } });
  if (diffuser) { try { canal?.postMessage(c); } catch { /* onglet fermé */ } }
}

/** S'abonner aux changements d'une collection (ou "*" pour toutes). Renvoie la fonction de désabonnement. */
export function subscribe(c: CollectionName | "*", f: () => void): () => void {
  let s = abonnes.get(c);
  if (!s) abonnes.set(c, (s = new Set()));
  s.add(f);
  return () => { s!.delete(f); };
}

export const nouvelId = (): string =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Horloge strictement croissante : deux écritures dans la même milliseconde gardent un ordre. */
let derniere = 0;
export function maintenant(): number {
  derniere = Math.max(Date.now(), derniere + 1);
  return derniere;
}

export async function get<C extends CollectionName>(c: C, id: string): Promise<CollectionMap[C] | undefined> {
  const db = await ouvrir();
  const d = (await req(db.transaction(c).objectStore(c).get(id))) as CollectionMap[C] | undefined;
  return d && !d.deleted ? d : undefined;
}

export async function list<C extends CollectionName>(c: C, opts: { includeDeleted?: boolean } = {}): Promise<CollectionMap[C][]> {
  const db = await ouvrir();
  const tout = (await req(db.transaction(c).objectStore(c).getAll())) as CollectionMap[C][];
  return opts.includeDeleted ? tout : tout.filter((d) => !d.deleted);
}

export async function listByIndex(c: "messages", conversationId: string): Promise<CollectionMap["messages"][]> {
  const db = await ouvrir();
  const tout = (await req(db.transaction(c).objectStore(c).index("conversationId").getAll(conversationId))) as CollectionMap["messages"][];
  // Deux messages créés dans la même milliseconde gardent leur ordre d'écriture (l'horloge `updatedAt` ne recule jamais).
  return tout.filter((d) => !d.deleted).sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt);
}

type Entree<C extends CollectionName> = Omit<CollectionMap[C], "updatedAt" | "id"> & { id?: string };

/** Crée ou remplace un document ; `updatedAt` est posé ici. */
export async function put<C extends CollectionName>(c: C, doc: Entree<C>): Promise<CollectionMap[C]> {
  const complet = { ...doc, id: doc.id ?? nouvelId(), updatedAt: maintenant() } as unknown as CollectionMap[C];
  const db = await ouvrir();
  const tx = db.transaction(c, "readwrite");
  tx.objectStore(c).put(complet);
  await fin(tx);
  prevenir(c);
  return complet;
}

/** Modifie quelques champs d'un document existant. */
export async function patch<C extends CollectionName>(c: C, id: string, champs: Partial<CollectionMap[C]>): Promise<CollectionMap[C] | undefined> {
  const db = await ouvrir();
  const tx = db.transaction(c, "readwrite");
  const st = tx.objectStore(c);
  const actuel = (await req(st.get(id))) as CollectionMap[C] | undefined;
  if (!actuel || actuel.deleted) { await fin(tx); return undefined; }
  const nouveau = { ...actuel, ...champs, id, updatedAt: maintenant() } as CollectionMap[C];
  st.put(nouveau);
  await fin(tx);
  prevenir(c);
  return nouveau;
}

/** Suppression douce : le document reste (marqué) pour que la synchro puisse l'effacer ailleurs. */
export async function remove(c: CollectionName, id: string): Promise<void> {
  const db = await ouvrir();
  const tx = db.transaction(c, "readwrite");
  const st = tx.objectStore(c);
  const actuel = (await req(st.get(id))) as Doc | undefined;
  if (actuel) st.put({ id, updatedAt: maintenant(), deleted: true } as Doc);
  await fin(tx);
  prevenir(c);
}

/** Écriture brute venant de la synchro : garde l'`updatedAt` du serveur, n'écrase jamais un document plus récent. */
export async function appliquerDistant(c: CollectionName, docs: Doc[]): Promise<number> {
  if (!docs.length) return 0;
  const db = await ouvrir();
  const tx = db.transaction(c, "readwrite");
  const st = tx.objectStore(c);
  let n = 0;
  for (const d of docs) {
    const local = (await req(st.get(d.id))) as Doc | undefined;
    if (!local || local.updatedAt < d.updatedAt) { st.put(d); n++; }
  }
  await fin(tx);
  if (n) prevenir(c);
  return n;
}

export async function metaGet<T>(cle: string): Promise<T | undefined> {
  const db = await ouvrir();
  return (await req(db.transaction("meta").objectStore("meta").get(cle))) as T | undefined;
}
export async function metaSet(cle: string, valeur: unknown): Promise<void> {
  const db = await ouvrir();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(valeur, cle);
  await fin(tx);
}

/** Efface TOUT (documents + méta) : « Effacer toutes mes données ». */
export async function toutEffacer(): Promise<void> {
  const db = await ouvrir();
  const tx = db.transaction([...COLLECTIONS, "meta"], "readwrite");
  for (const c of [...COLLECTIONS, "meta"]) tx.objectStore(c).clear();
  await fin(tx);
  for (const c of COLLECTIONS) prevenir(c);
}

/** Export complet (documents non supprimés) pour la sauvegarde. */
export async function exporterTout(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const c of COLLECTIONS) out[c] = await list(c);
  return out;
}

/** Réservé aux tests : referme la base et repart de zéro. */
export async function reinitialiserPourTests(): Promise<void> {
  if (ouverture) { try { (await ouverture).close(); } catch { /* déjà fermée */ } }
  ouverture = null;
  abonnes.clear();
  await new Promise<void>((ok) => { const r = indexedDB.deleteDatabase(NOM_BASE); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
}
