import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../../src/lib/db";
import { ajouterMessage, creerConversation, exporterConversation, genererReponse, listerConversations, messagesDe, recherche, retirerDerniereReponse, supprimerConversation, titrerSiBesoin, TITRE_PAR_DEFAUT } from "../../src/lib/chat";
import { ajouterMemoire } from "../../src/lib/memory";
import { DEFAULT_SETTINGS } from "../../src/lib/types";

/** Fabrique une réponse SSE comme celle du serveur. */
function sse(events: object[], coupures = 0): Response {
  const texte = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const octets = new TextEncoder().encode(texte);
  const morceau = Math.max(1, Math.ceil(octets.length / (coupures + 1)));
  const flux = new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < octets.length; i += morceau) c.enqueue(octets.slice(i, i + morceau)); c.close(); },
  });
  return new Response(flux, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const jsonErr = (status: number, code: string, message: string, extra: object = {}) =>
  new Response(JSON.stringify({ error: { code, message, ...extra } }), { status, headers: { "content-type": "application/json" } });

let appels: { url: string; corps: any }[];
const brancher = (rep: () => Response | Promise<Response>) => {
  appels = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { appels.push({ url, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep(); }));
};
const reglages = { ...DEFAULT_SETTINGS, provider: "groq" as const };

beforeEach(async () => { await db.reinitialiserPourTests(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("réponse en flux", () => {
  it("assemble le texte reçu morceau par morceau, même coupé au milieu d'un évènement", async () => {
    brancher(() => sse([{ type: "start", provider: "groq", providerName: "Groq", model: "m" }, { type: "delta", text: "Bon" }, { type: "delta", text: "jour !" }, { type: "done" }], 7));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const vus: string[] = [];
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: (t) => vus.push(t) });
    expect(r.issue).toBe("ok");
    expect(vus.at(-1)).toBe("Bonjour !");
    expect((await messagesDe(c.id)).map((m) => [m.role, m.content])).toEqual([["user", "Salut"], ["assistant", "Bonjour !"]]);
  });
  it("envoie le fournisseur choisi, le repli demandé, la personnalité et les souvenirs actifs", async () => {
    brancher(() => sse([{ type: "delta", text: "ok" }, { type: "done" }]));
    await ajouterMemoire("j'aime le thé");
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Coucou");
    await genererReponse({ conversationId: c.id, settings: { ...reglages, models: { groq: "llama-x" } }, fallback: true, signal: new AbortController().signal, onTexte: () => undefined });
    expect(appels[0]!.url).toBe("/api/chat");
    expect(appels[0]!.corps).toMatchObject({ provider: "groq", model: "llama-x", fallback: true });
    expect(appels[0]!.corps.messages[0]).toMatchObject({ role: "system" });
    expect(appels[0]!.corps.messages[0].content).toContain("j'aime le thé");
    expect(appels[0]!.corps.messages.at(-1)).toEqual({ role: "user", content: "Coucou" });
  });
  it("sans souvenirs quand la mémoire est coupée", async () => {
    brancher(() => sse([{ type: "delta", text: "ok" }, { type: "done" }]));
    await ajouterMemoire("la recette de grand-mère");
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Hello");
    await genererReponse({ conversationId: c.id, settings: { ...reglages, memoryEnabled: false }, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(JSON.stringify(appels[0]!.corps)).not.toContain("la recette de grand-mère");
  });
  it("ne renvoie à l'IA ni les réponses en erreur ni les réponses locales", async () => {
    brancher(() => sse([{ type: "delta", text: "ok" }, { type: "done" }]));
    const c = await creerConversation();
    await ajouterMessage(c.id, "user", "premier");
    await ajouterMessage(c.id, "assistant", "", { error: "panne" });
    await ajouterMessage(c.id, "assistant", "réponse locale", { provider: "local" });
    await ajouterMessage(c.id, "user", "second");
    await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    const envoyes = appels[0]!.corps.messages.slice(1).map((m: any) => m.content);
    expect(envoyes).toEqual(["premier", "second"]);
  });
  it("ne garde que les derniers messages selon le réglage de contexte", async () => {
    brancher(() => sse([{ type: "delta", text: "ok" }, { type: "done" }]));
    const c = await creerConversation();
    for (let i = 1; i <= 6; i++) await ajouterMessage(c.id, i % 2 ? "user" : "assistant", `m${i}`);
    await genererReponse({ conversationId: c.id, settings: { ...reglages, contextMessages: 3 }, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(appels[0]!.corps.messages.slice(1).map((m: any) => m.content)).toEqual(["m4", "m5", "m6"]);
  });
});

describe("erreurs : jamais de fausse réponse", () => {
  it("clé invalide : l'erreur du serveur est gardée telle quelle, aucun texte inventé", async () => {
    brancher(() => jsonErr(401, "invalid_key", "La clé Groq est refusée."));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(r.issue).toBe("erreur");
    expect(r.erreur).toMatchObject({ code: "invalid_key", message: "La clé Groq est refusée." });
    const ms = await messagesDe(c.id);
    expect(ms.at(-1)).toMatchObject({ role: "assistant", content: "", error: "La clé Groq est refusée." });
  });
  it("quota dépassé : transmet le délai d'attente", async () => {
    brancher(() => jsonErr(429, "quota", "Limite atteinte.", { retryAfterSeconds: 42 }));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(r.erreur).toMatchObject({ code: "quota", retryAfterSeconds: 42 });
  });
  it("hors ligne : message clair", async () => {
    appels = [];
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(r.issue).toBe("erreur"); expect(r.erreur!.code).toBe("network");
  });
  it("réponse vide du fournisseur : signalée, pas affichée comme une réponse", async () => {
    brancher(() => sse([{ type: "done" }]));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(r.erreur?.code).toBe("empty");
  });
  it("erreur après un début de réponse : le début est gardé ET l'erreur signalée", async () => {
    brancher(() => sse([{ type: "delta", text: "Début" }, { type: "error", code: "upstream", message: "coupé" }]));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: new AbortController().signal, onTexte: () => undefined });
    expect(r.issue).toBe("erreur"); expect(r.message?.content).toBe("Début");
  });
});

describe("changement de fournisseur (repli) et arrêt", () => {
  it("annonce le repli et enregistre le fournisseur qui a vraiment répondu", async () => {
    brancher(() => sse([
      { type: "start", provider: "gemini", providerName: "Gemini", model: "g" },
      { type: "fallback", from: "Gemini", to: "Groq", code: "quota", message: "limite" },
      { type: "start", provider: "groq", providerName: "Groq", model: "l" },
      { type: "delta", text: "Réponse" }, { type: "done" }]));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const infos: string[] = [];
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: true, signal: new AbortController().signal, onTexte: () => undefined, onInfo: (i) => infos.push(i) });
    expect(infos.some((i) => /Gemini ne répond pas.*Groq/.test(i))).toBe(true);
    expect(r.message?.provider).toBe("Groq");
  });
  it("« Stop » : garde ce qui est déjà arrivé et ne le présente pas comme une erreur", async () => {
    const ctl = new AbortController();
    brancher(() => sse([{ type: "delta", text: "Partiel" }, { type: "done" }]));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: ctl.signal, onTexte: () => ctl.abort() });
    expect(r.issue).toBe("interrompu"); expect(r.message?.content).toBe("Partiel");
  });
  it("« Stop » avant toute réponse : rien n'est enregistré", async () => {
    const ctl = new AbortController(); ctl.abort();
    appels = [];
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("a"), { name: "AbortError" }); }));
    const c = await creerConversation(); await ajouterMessage(c.id, "user", "Salut");
    const r = await genererReponse({ conversationId: c.id, settings: reglages, fallback: false, signal: ctl.signal, onTexte: () => undefined });
    expect(r.issue).toBe("interrompu"); expect(await messagesDe(c.id)).toHaveLength(1);
  });
});

describe("historique", () => {
  it("titre automatique, renommage, recherche, régénération, export, suppression", async () => {
    const c = await creerConversation();
    expect(c.title).toBe(TITRE_PAR_DEFAUT);
    await ajouterMessage(c.id, "user", "Comment faire une tarte aux pommes très gourmande pour dimanche ?");
    await titrerSiBesoin(c.id, "Comment faire une tarte aux pommes très gourmande pour dimanche ?");
    const [l] = await listerConversations();
    expect(l!.title.endsWith("…")).toBe(true);
    expect((await recherche("tarte")).length).toBe(1);
    expect((await recherche("zzzz")).length).toBe(0);
    await ajouterMessage(c.id, "assistant", "Voici la recette");
    const dernier = await retirerDerniereReponse(c.id);
    expect(dernier?.role).toBe("user");
    expect((await messagesDe(c.id)).map((m) => m.role)).toEqual(["user"]);
    expect(exporterConversation(l!, await messagesDe(c.id))).toContain("**Toi**");
    await supprimerConversation(c.id);
    expect(await listerConversations()).toHaveLength(0);
    expect(await messagesDe(c.id)).toHaveLength(0);
  });
});
