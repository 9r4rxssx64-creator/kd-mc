import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../../src/lib/db";
import { ajouterMemoire, activerMemoire, construireSysteme, detecterDemandeMemoire, exporterMemoires, listerMemoires, MemoireRefusee, modifierMemoire, motifSensible, supprimerMemoire, toutOublier } from "../../src/lib/memory";

beforeEach(async () => { await db.reinitialiserPourTests(); });

describe("détection « retiens que… » (jamais de mémoire sans demande explicite)", () => {
  it("reconnaît les demandes claires", () => {
    expect(detecterDemandeMemoire("Retiens que j'aime le thé vert")).toBe("j'aime le thé vert");
    expect(detecterDemandeMemoire("Bibi, souviens-toi que ma sœur s'appelle Léa.")).toBe("ma sœur s'appelle Léa");
    expect(detecterDemandeMemoire("N'oublie pas que je suis allergique aux noix !")).toBe("je suis allergique aux noix");
  });
  it("ne déclenche rien sur une phrase ordinaire", () => {
    expect(detecterDemandeMemoire("Quel temps fait-il ?")).toBeNull();
    expect(detecterDemandeMemoire("J'aime le thé vert")).toBeNull();
  });
});

describe("données sensibles : refusées même sur demande", () => {
  it.each([
    ["mon mot de passe est abc123", /mot de passe/i],
    ["ma carte 4970 1015 1234 5678", /carte/i],
    ["mon IBAN FR76 3000 6000 0112 3456 7890 189", /IBAN/],
    ["ma clé api sk-abcdefghijklmnopqrstuvwxyz", /clé/i],
  ])("refuse %s", async (texte, motif) => {
    expect(motifSensible(texte)).toMatch(motif);
    await expect(ajouterMemoire(texte)).rejects.toBeInstanceOf(MemoireRefusee);
    expect(await listerMemoires()).toHaveLength(0);
  });
  it("refuse aussi à la modification", async () => {
    const m = await ajouterMemoire("j'aime la mer");
    await expect(modifierMemoire(m.id, "mon code secret est 1234")).rejects.toBeInstanceOf(MemoireRefusee);
    expect((await listerMemoires())[0]!.text).toBe("j'aime la mer");
  });
  it("accepte une phrase normale", () => { expect(motifSensible("mon chat s'appelle Moka")).toBeNull(); });
});

describe("gestion des souvenirs", () => {
  it("ajoute, évite les doublons, modifie, désactive, supprime", async () => {
    const a = await ajouterMemoire("j'habite à Nice");
    const b = await ajouterMemoire("J'HABITE À NICE");
    expect(b.id).toBe(a.id);
    await modifierMemoire(a.id, "j'habite à Lyon");
    await activerMemoire(a.id, false);
    const [m] = await listerMemoires();
    expect(m).toMatchObject({ text: "j'habite à Lyon", enabled: false });
    await supprimerMemoire(a.id);
    expect(await listerMemoires()).toHaveLength(0);
  });
  it("refuse le vide et le trop long", async () => {
    await expect(ajouterMemoire(" ")).rejects.toBeInstanceOf(MemoireRefusee);
    await expect(ajouterMemoire("x".repeat(501))).rejects.toBeInstanceOf(MemoireRefusee);
  });
  it("« tout oublier » vide la mémoire", async () => {
    await ajouterMemoire("souvenir un"); await ajouterMemoire("souvenir deux");
    await toutOublier();
    expect(await listerMemoires()).toHaveLength(0);
  });
  it("l'export ne contient que le texte, l'état et la date", async () => {
    await ajouterMemoire("j'aime le café");
    const j = JSON.parse(exporterMemoires(await listerMemoires())) as { memories: Record<string, unknown>[] };
    expect(Object.keys(j.memories[0]!).sort()).toEqual(["createdAt", "enabled", "text"]);
  });
});

describe("message système envoyé à l'IA", () => {
  it("contient seulement les souvenirs activés", async () => {
    const a = await ajouterMemoire("souvenir actif"); const b = await ajouterMemoire("souvenir coupé");
    await activerMemoire(b.id, false);
    const s = construireSysteme({ memoires: await listerMemoires(), memoireActive: true });
    expect(s).toContain("souvenir actif"); expect(s).not.toContain("souvenir coupé"); void a;
  });
  it("n'envoie aucun souvenir si la mémoire est coupée", async () => {
    await ajouterMemoire("souvenir actif");
    expect(construireSysteme({ memoires: await listerMemoires(), memoireActive: false })).not.toContain("souvenir actif");
  });
  it("interdit à l'IA d'affirmer une action non faite", () => {
    expect(construireSysteme({ memoires: [], memoireActive: false })).toMatch(/JAMAIS avoir fait une action/);
  });
});
