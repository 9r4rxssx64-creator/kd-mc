import { afterEach, describe, expect, it, vi } from "vitest";
import { decouper, filtrerVoix, languesDisponibles, messageErreurMicro, voixKey, voixNavigateur, voixParDefaut, voixServeur, type VoiceEntry } from "../../src/lib/voice";

const V: VoiceEntry[] = [
  { engine: "browser", id: "a", name: "Amélie", lang: "fr-CA", local: true },
  { engine: "browser", id: "b", name: "Thomas", lang: "fr-FR", local: true },
  { engine: "browser", id: "c", name: "Samantha", lang: "en-US", local: false },
  { engine: "piper", id: "p1", name: "Siwis", lang: "fr_FR" },
  { engine: "elevenlabs", id: "e1", name: "Rachel", lang: "en-US" },
];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("bibliothèque de voix : filtres et recherche", () => {
  it("filtre par langue, moteur, recherche sans accent, locales seulement", () => {
    expect(filtrerVoix(V, { langue: "fr" }).map((v) => v.id)).toEqual(["a", "b", "p1"]);
    expect(filtrerVoix(V, { moteur: "piper" }).map((v) => v.id)).toEqual(["p1"]);
    expect(filtrerVoix(V, { recherche: "amelie" }).map((v) => v.id)).toEqual(["a"]);
    expect(filtrerVoix(V, { localesSeulement: true }).some((v) => v.id === "c")).toBe(false);
    expect(filtrerVoix(V, { langue: "all", moteur: "all" })).toHaveLength(5);
    expect(filtrerVoix(V, { recherche: "introuvable" })).toEqual([]);
  });
  it("liste les langues réellement présentes, sans doublon", () => { expect(languesDisponibles(V)).toEqual(["en", "fr"]); });
  it("clé unique moteur:identifiant", () => { expect(voixKey(V[3]!)).toBe("piper:p1"); });
});

describe("choix de la voix : jamais de voix inventée", () => {
  it("garde la voix choisie si elle existe", () => { expect(voixParDefaut(V, { engine: "browser", id: "b" }, "fr-FR")?.id).toBe("b"); });
  it("sinon prend une voix locale de la langue", () => { expect(voixParDefaut(V, { engine: "browser", id: "disparue" }, "fr-FR")?.id).toBe("a"); });
  it("aucune voix de la langue → null (pas d'invention)", () => { expect(voixParDefaut(V, null, "de-DE")).toBeNull(); expect(voixParDefaut([], null, "fr-FR")).toBeNull(); });
});

describe("voix du navigateur", () => {
  it("renvoie une liste vide si la synthèse n'existe pas (au lieu de faire semblant)", async () => { expect(await voixNavigateur(10)).toEqual([]); });
  it("liste les voix déclarées par l'appareil", async () => {
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    vi.stubGlobal("speechSynthesis", { getVoices: () => [{ voiceURI: "u1", name: "Voix 1", lang: "fr-FR", localService: true }], addEventListener() {}, removeEventListener() {} });
    expect(await voixNavigateur(10)).toEqual([{ engine: "browser", id: "u1", name: "Voix 1", lang: "fr-FR", local: true }]);
  });
  it("si l'appareil ne charge aucune voix, la liste reste vide après le délai", async () => {
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    vi.stubGlobal("speechSynthesis", { getVoices: () => [], addEventListener() {}, removeEventListener() {} });
    expect(await voixNavigateur(20)).toEqual([]);
  });
});

describe("voix du serveur : seulement les moteurs réellement configurés", () => {
  it("n'appelle que les moteurs prêts et rapporte les erreurs des autres", async () => {
    const reponses: Record<string, unknown> = {
      "/api/speech/engines": { piper: { configured: true, allowed: true }, kokoro: { configured: false, allowed: true }, elevenlabs: { configured: true, allowed: true }, whisper: { configured: false, allowed: true } },
      "/api/speech/voices?engine=piper": { voices: [{ id: "p1", name: "Siwis", lang: "fr_FR" }] },
    };
    const vus: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      vus.push(u);
      if (u.includes("engine=elevenlabs")) return new Response(JSON.stringify({ error: { code: "invalid_key", message: "Clé ElevenLabs refusée." } }), { status: 401 });
      return new Response(JSON.stringify(reponses[u] ?? {}), { status: 200 });
    }));
    const r = await voixServeur();
    expect(r.voix.map((v) => voixKey(v))).toEqual(["piper:p1"]);
    expect(r.erreurs.elevenlabs).toMatch(/refusée/);
    expect(vus.some((u) => u.includes("kokoro"))).toBe(false);
  });
});

describe("découpage du texte à lire", () => {
  it("coupe aux phrases, jamais au milieu d'un mot, sans rien perdre", () => {
    const t = "Bonjour à toi. Comment vas-tu aujourd'hui ? Moi je vais très bien, merci beaucoup ! On y va ensemble.";
    const morceaux = decouper(t, 40);
    expect(morceaux.every((m) => m.length <= 40)).toBe(true);
    expect(morceaux.join(" ").replace(/\s+/g, " ")).toBe(t);
  });
  it("un texte vide ne donne rien", () => { expect(decouper("   ")).toEqual([]); });
});

describe("erreurs du micro : en français simple", () => {
  it("refus d'autorisation", () => { expect(messageErreurMicro("not-allowed")).toMatch(/autoris/i); });
  it("code inconnu : phrase française qui garde le code pour comprendre la cause", () => { const m = messageErreurMicro("zzz-inconnu"); expect(m).toMatch(/^La reconnaissance vocale/); expect(m).toContain("zzz-inconnu"); });
});
