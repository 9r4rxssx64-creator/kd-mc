import { describe, expect, it } from "vitest";
import { reglagesAvecServeur } from "../../src/lib/settings";
import { DEFAULT_SETTINGS } from "../../src/lib/types";

describe("interrupteur serveur de la mémoire", () => {
  const actif = { ...DEFAULT_SETTINGS, memoryEnabled: true };
  it("serveur qui coupe la mémoire : elle est désactivée quoi que dise le réglage local", () => {
    expect(reglagesAvecServeur(actif, { localMemory: false }).memoryEnabled).toBe(false);
  });
  it("serveur qui l'autorise, ou pas encore de réponse : le réglage de la personne s'applique", () => {
    expect(reglagesAvecServeur(actif, { localMemory: true }).memoryEnabled).toBe(true);
    expect(reglagesAvecServeur(actif, null).memoryEnabled).toBe(true);
    expect(reglagesAvecServeur({ ...actif, memoryEnabled: false }, { localMemory: true }).memoryEnabled).toBe(false);
  });
  it("ne modifie pas l'objet d'origine", () => {
    reglagesAvecServeur(actif, { localMemory: false });
    expect(actif.memoryEnabled).toBe(true);
  });
});
