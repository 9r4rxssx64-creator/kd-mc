import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../../src/lib/db";
import { creerRappel, notifierSysteme, permissionNotifications, verifierRappels } from "../../src/lib/reminders";

beforeEach(async () => { await db.reinitialiserPourTests(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("rappels locaux", () => {
  it("refuse un rappel vide ou sans date valide", async () => {
    await expect(creerRappel("  ", Date.now())).rejects.toThrow(/rappeler/);
    await expect(creerRappel("Appeler Léa", Number.NaN)).rejects.toThrow(/date/);
  });
  it("sonne une seule fois, seulement quand l'heure est passée", async () => {
    const r = await creerRappel("Appeler Léa", 1000);
    const vus: string[] = [];
    const d = { notifier: (t: string, c: string) => vus.push(`${t}|${c}`) };
    expect(await verifierRappels(d, 999)).toHaveLength(0);
    expect((await verifierRappels(d, 1000)).map((x) => x.id)).toEqual([r.id]);
    expect(await verifierRappels(d, 5000)).toHaveLength(0);
    expect(vus).toEqual(["Bibi te rappelle|Appeler Léa"]);
    expect((await db.get("reminders", r.id))?.fired).toBe(true);
  });
  it("plusieurs rappels échus sonnent chacun une fois", async () => {
    await creerRappel("a", 10); await creerRappel("b", 20); await creerRappel("c", 9999);
    expect(await verifierRappels({ notifier: () => undefined }, 100)).toHaveLength(2);
  });
});

describe("notifications système : honnêteté", () => {
  it("sans API de notification : indisponible, rien d'envoyé", () => {
    vi.stubGlobal("Notification", undefined);
    expect(permissionNotifications()).toBe("indisponible");
    expect(notifierSysteme("t", "c")).toBe(false);
  });
  it("permission non accordée : renvoie false (la page affichera l'alerte à la place)", () => {
    const ctor = vi.fn();
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "default" }));
    expect(notifierSysteme("t", "c")).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });
  it("permission accordée : une vraie notification est créée", () => {
    const ctor = vi.fn();
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "granted" }));
    expect(notifierSysteme("Titre", "Corps")).toBe(true);
    expect(ctor).toHaveBeenCalledWith("Titre", expect.objectContaining({ body: "Corps" }));
  });
});
