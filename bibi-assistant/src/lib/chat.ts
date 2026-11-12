// Moteur de conversation (sans React, donc testable) : historique local + réponse en flux.
import * as db from "./db";
import { discuter, type ChatEvent, type ChatMessage } from "./api";
import { construireSysteme, listerMemoires } from "./memory";
import type { Conversation, Message, ProviderId, SettingsDoc } from "./types";

export const TITRE_PAR_DEFAUT = "Nouvelle conversation";

export async function creerConversation(): Promise<Conversation> {
  return db.put("conversations", { title: TITRE_PAR_DEFAUT, createdAt: Date.now() });
}

export async function listerConversations(): Promise<Conversation[]> {
  return (await db.list("conversations")).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const renommerConversation = async (id: string, titre: string): Promise<void> => {
  const t = titre.trim().slice(0, 80);
  if (t) await db.patch("conversations", id, { title: t });
};

export async function supprimerConversation(id: string): Promise<void> {
  for (const m of await db.listByIndex("messages", id)) await db.remove("messages", m.id);
  await db.remove("conversations", id);
}

export const messagesDe = (id: string): Promise<Message[]> => db.listByIndex("messages", id);

export async function ajouterMessage(conversationId: string, role: Message["role"], content: string, extra: Partial<Pick<Message, "provider" | "error">> = {}): Promise<Message> {
  const m = await db.put("messages", { conversationId, role, content, createdAt: Date.now(), ...extra });
  // fait remonter la conversation en tête de liste
  await db.patch("conversations", conversationId, {});
  return m;
}

/** Le titre vient du premier message tant qu'il porte le titre par défaut. */
export async function titrerSiBesoin(conversationId: string, premierMessage: string): Promise<void> {
  const c = await db.get("conversations", conversationId);
  if (c && c.title === TITRE_PAR_DEFAUT) {
    const t = premierMessage.replace(/\s+/g, " ").trim().slice(0, 48);
    if (t) await db.patch("conversations", conversationId, { title: t.length < premierMessage.trim().length ? `${t}…` : t });
  }
}

export async function recherche(texte: string): Promise<{ conversation: Conversation; extrait: string }[]> {
  const q = texte.trim().toLowerCase();
  const convs = await listerConversations();
  if (!q) return convs.map((conversation) => ({ conversation, extrait: "" }));
  const out: { conversation: Conversation; extrait: string }[] = [];
  const tous = await db.list("messages");
  for (const c of convs) {
    if (c.title.toLowerCase().includes(q)) { out.push({ conversation: c, extrait: "" }); continue; }
    const m = tous.find((x) => x.conversationId === c.id && x.content.toLowerCase().includes(q));
    if (m) {
      const i = m.content.toLowerCase().indexOf(q);
      out.push({ conversation: c, extrait: `${i > 30 ? "…" : ""}${m.content.slice(Math.max(0, i - 30), i + 60)}` });
    }
  }
  return out;
}

/** Messages envoyés au fournisseur : système (personnalité + souvenirs actifs) puis la fin de l'historique. */
export async function preparerMessages(conversationId: string, s: Pick<SettingsDoc, "contextMessages" | "memoryEnabled" | "language">): Promise<ChatMessage[]> {
  const historique = (await messagesDe(conversationId)).filter((m) => !m.error && m.content.trim() && m.provider !== "local");
  const fin = historique.slice(-Math.max(2, s.contextMessages));
  const memoires = s.memoryEnabled ? await listerMemoires() : [];
  const systeme = construireSysteme({ memoires, memoireActive: s.memoryEnabled, langue: s.language });
  return [{ role: "system", content: systeme }, ...fin.map((m) => ({ role: m.role, content: m.content }))];
}

export type Issue = "ok" | "interrompu" | "erreur";
export interface ReponseOptions {
  conversationId: string;
  settings: SettingsDoc;
  fallback: boolean;
  signal: AbortSignal;
  /** Texte accumulé, appelé à chaque morceau reçu. */
  onTexte: (texte: string) => void;
  onInfo?: (info: string) => void;
}

/** Demande la réponse au serveur, l'affiche au fil de l'eau, puis l'enregistre. N'invente jamais de réponse. */
export async function genererReponse(o: ReponseOptions): Promise<{ issue: Issue; message?: Message; erreur?: { code: string; message: string; retryAfterSeconds?: number } }> {
  const provider: ProviderId = o.settings.provider;
  const messages = await preparerMessages(o.conversationId, o.settings);
  let texte = "";
  let fournisseur = "";
  let erreur: { code: string; message: string; retryAfterSeconds?: number } | undefined;
  const flux = discuter({ provider, model: o.settings.models[provider], messages, fallback: o.fallback }, o.signal);
  for await (const ev of flux as AsyncGenerator<ChatEvent>) {
    if (ev.type === "start") { fournisseur = ev.providerName; o.onInfo?.(`${ev.providerName} · ${ev.model}`); }
    else if (ev.type === "delta") { texte += ev.text; o.onTexte(texte); }
    else if (ev.type === "fallback") o.onInfo?.(`${ev.from} ne répond pas (${ev.message}) — essai avec ${ev.to}…`);
    else if (ev.type === "error") erreur = { code: ev.code, message: ev.message, retryAfterSeconds: ev.retryAfterSeconds };
  }
  if (erreur && !texte) {
    const message = await ajouterMessage(o.conversationId, "assistant", "", { provider: fournisseur || provider, error: erreur.message });
    return { issue: "erreur", message, erreur };
  }
  if (o.signal.aborted) {
    if (!texte.trim()) return { issue: "interrompu" };
    const message = await ajouterMessage(o.conversationId, "assistant", texte, { provider: fournisseur || provider });
    return { issue: "interrompu", message };
  }
  if (!texte.trim()) {
    const msg = "Le fournisseur n'a rien renvoyé. Réessaie ou change de modèle.";
    const message = await ajouterMessage(o.conversationId, "assistant", "", { provider: fournisseur || provider, error: msg });
    return { issue: "erreur", message, erreur: { code: "empty", message: msg } };
  }
  const message = await ajouterMessage(o.conversationId, "assistant", texte, { provider: fournisseur || provider });
  return erreur ? { issue: "erreur", message, erreur } : { issue: "ok", message };
}

/** Retire la dernière réponse (réussie ou en erreur) pour la régénérer. Renvoie le dernier message utilisateur. */
export async function retirerDerniereReponse(conversationId: string): Promise<Message | undefined> {
  const tous = await messagesDe(conversationId);
  for (let i = tous.length - 1; i >= 0 && tous[i]!.role === "assistant"; i--) await db.remove("messages", tous[i]!.id);
  return [...tous].reverse().find((m) => m.role === "user");
}

export function exporterConversation(c: Conversation, ms: Message[]): string {
  const l = [`# ${c.title}`, ""];
  for (const m of ms) l.push(`**${m.role === "user" ? "Toi" : "Bibi"}** (${new Date(m.createdAt).toLocaleString("fr-FR")})`, m.error ? `_Erreur : ${m.error}_` : m.content, "");
  return l.join("\n");
}
