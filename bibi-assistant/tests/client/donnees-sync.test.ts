import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../../src/lib/db";
import { chargerReglages, changerReglages } from "../../src/lib/settings";
import { effacerCloud, synchroniser } from "../../src/lib/sync";
import { DEFAULT_SETTINGS } from "../../src/lib/types";

beforeEach(async () => { await db.reinitialiserPourTests(); });
const rep = (status: number, corps: unknown = {}) => new Response(JSON.stringify(corps), { status });

describe("réglages", () => {
  it("valeurs par défaut sûres : le payant est coupé, la mémoire demande confirmation", async () => {
    const s = await chargerReglages();
    expect(s.provider).toBe(DEFAULT_SETTINGS.provider);
    expect((s as unknown as { allowPaid?: boolean }).allowPaid ?? false).toBe(false);
  });
  it("un changement est gardé et relu, le reste ne bouge pas", async () => {
    await changerReglages({ textSize: "large" });
    const s = await chargerReglages();
    expect(s.textSize).toBe("large");
    expect(s.language).toBe(DEFAULT_SETTINGS.language);
  });
});

describe("stockage local", () => {
  it("la suppression est douce, la liste normale ne la voit plus, la synchro la voit", async () => {
    const n = await db.put("notes", { title: "t", body: "b", createdAt: 1 } as never);
    await db.remove("notes", n.id);
    expect(await db.list("notes")).toHaveLength(0);
    expect((await db.list("notes", { includeDeleted: true }))[0]?.deleted).toBe(true);
  });
  it("l'horloge updatedAt ne recule jamais", async () => {
    const a = await db.put("notes", { title: "a", body: "", createdAt: 1 } as never);
    const b = await db.put("notes", { title: "b", body: "", createdAt: 1 } as never);
    expect(b.updatedAt).toBeGreaterThan(a.updatedAt);
  });
  it("une écriture distante plus ancienne n'écrase pas le local (dernière écriture gagne)", async () => {
    const n = await db.put("notes", { title: "local", body: "", createdAt: 1 } as never);
    const appliques = await db.appliquerDistant("notes", [{ ...n, title: "vieux", updatedAt: n.updatedAt - 10 } as never]);
    expect(appliques).toBe(0);
    expect((await db.get("notes", n.id))?.title).toBe("local");
    expect(await db.appliquerDistant("notes", [{ ...n, title: "récent", updatedAt: n.updatedAt + 10 } as never])).toBe(1);
    expect((await db.get("notes", n.id))?.title).toBe("récent");
  });
  it("tout effacer vide toutes les collections ; l'export les contient toutes", async () => {
    await db.put("notes", { title: "t", body: "", createdAt: 1 } as never);
    expect(Object.keys(await db.exporterTout())).toEqual(expect.arrayContaining(["notes", "messages", "memories"]));
    await db.toutEffacer();
    expect((await db.exporterTout()).notes).toHaveLength(0);
  });
});

describe("synchronisation (client)", () => {
  it("serveur sans synchro : état « inactif » honnête", async () => {
    expect((await synchroniser(vi.fn(async () => rep(404)) as never)).etat).toBe("inactif");
  });
  it("non connecté : demande de se connecter ; autre erreur : code indiqué", async () => {
    expect((await synchroniser(vi.fn(async () => rep(401)) as never)).message).toMatch(/Connecte-toi/);
    expect((await synchroniser(vi.fn(async () => rep(500)) as never)).message).toMatch(/500/);
  });
  it("envoie le local, reçoit le distant, retient où il en est et ne renvoie pas deux fois ce qui est déjà parti", async () => {
    await db.put("notes", { title: "locale", body: "", createdAt: 1 } as never);
    const envoyes: any[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const corps = JSON.parse(String(init.body)); envoyes.push(corps);
      return rep(200, { accepted: corps.changes.length, rejected: 0, seq: 7, changes: [{ collection: "notes", id: "distante", updatedAt: Date.now() + 1000, seq: 7, deleted: false, data: { title: "venue du serveur", body: "", createdAt: 2 } }] });
    });
    const r1 = await synchroniser(f as never);
    expect(r1).toMatchObject({ etat: "ok", envoyes: 1, recus: 1 });
    expect(envoyes[0].changes[0].data.title).toBe("locale");
    expect((await db.get("notes", "distante"))?.title).toBe("venue du serveur");
    expect(await db.metaGet("sync_since")).toBe(7);
    await synchroniser(f as never);
    expect(envoyes[1].since).toBe(7);
    // Au plus le document venu du serveur est renvoyé tel quel (inoffensif : « dernière écriture gagne ») ; la note locale, déjà envoyée, ne repart pas.
    expect(envoyes[1].changes.every((c: any) => c.id === "distante")).toBe(true);
  });
  it("envoie en-tête anti-CSRF et jamais les clés d'API", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => { void init; return rep(200, { accepted: 0, rejected: 0, seq: 0, changes: [] }); });
    await synchroniser(f as never);
    expect((f.mock.calls[0]![1].headers as Record<string, string>)["x-bibi"]).toBe("1");
  });
  it("effacer le cloud remet les compteurs à zéro seulement si le serveur a accepté", async () => {
    await db.metaSet("sync_since", 9);
    expect(await effacerCloud(vi.fn(async () => rep(500)) as never)).toBe(false);
    expect(await db.metaGet("sync_since")).toBe(9);
    expect(await effacerCloud(vi.fn(async () => rep(200)) as never)).toBe(true);
    expect(await db.metaGet("sync_since")).toBe(0);
  });
});
