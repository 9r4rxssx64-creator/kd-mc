// Mémoire de Bibi : uniquement ce que l'utilisateur a demandé de retenir, après confirmation.
// Rien n'est inventé et rien de sensible n'est mémorisé automatiquement.
import * as db from "./db";
import type { Memory } from "./types";

/** Motifs de données sensibles : refusées même si l'utilisateur demande « retiens ». */
const SENSIBLE: { re: RegExp; raison: string }[] = [
  { re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/i, raison: "On dirait un IBAN." },
  { re: /\b(?:\d[ -]?){13,19}\b/, raison: "On dirait un numéro de carte bancaire." },
  { re: /\b(?:mot de passe|mdp|password|passwd|code secret|code pin|pin|cvv|cryptogramme)\b/i, raison: "Un mot de passe ou un code secret." },
  { re: /\b(?:api[ _-]?key|clé d'api|cle d'api|token|secret)\b/i, raison: "Une clé ou un jeton secret." },
  { re: /\b[12][ ]?\d{2}[ ]?(?:0[1-9]|1[0-2])[ ]?\d{2}[ ]?\d{3}[ ]?\d{3}(?:[ ]?\d{2})?\b/, raison: "On dirait un numéro de sécurité sociale." },
  { re: /\b(?:sk|gsk|AIza|xox[bp]|ghp|glpat)[-_A-Za-z0-9]{16,}/, raison: "On dirait une clé d'API." },
];

export function motifSensible(texte: string): string | null {
  for (const s of SENSIBLE) if (s.re.test(texte)) return s.raison;
  return null;
}

const DEMANDES = [
  /^\s*(?:bibi[ ,]+)?(?:peux-tu |pourrais-tu |tu peux )?(?:retiens|mémorise|memorise|souviens-toi|rappelle-toi|note)\s+(?:bien\s+)?(?:que\s+|qu['’]|de\s+)?(.{3,300})$/i,
  /^\s*(?:bibi[ ,]+)?n['’]oublie pas\s+(?:que\s+|qu['’])?(.{3,300})$/i,
];

/** Détecte une demande explicite « retiens que… ». Renvoie le fait proposé, sinon null. */
export function detecterDemandeMemoire(message: string): string | null {
  const une_ligne = message.trim().replace(/\s+/g, " ");
  for (const re of DEMANDES) {
    const m = re.exec(une_ligne);
    if (m && m[1]) return m[1].trim().replace(/[.!\s]+$/, "");
  }
  return null;
}

export async function listerMemoires(): Promise<Memory[]> {
  return (await db.list("memories")).sort((a, b) => b.createdAt - a.createdAt);
}

export class MemoireRefusee extends Error {}

export async function ajouterMemoire(texte: string): Promise<Memory> {
  const t = texte.trim();
  if (t.length < 2) throw new MemoireRefusee("Il n'y a rien à retenir.");
  if (t.length > 500) throw new MemoireRefusee("C'est trop long : 500 caractères au maximum.");
  const raison = motifSensible(t);
  if (raison) throw new MemoireRefusee(`Je ne retiens pas ça : ${raison} Garde-le dans un gestionnaire de mots de passe.`);
  const existant = (await db.list("memories")).find((m) => m.text.toLowerCase() === t.toLowerCase());
  if (existant) return existant;
  return db.put("memories", { text: t, enabled: true, createdAt: Date.now() });
}

export const modifierMemoire = async (id: string, texte: string): Promise<void> => {
  const t = texte.trim();
  if (t.length < 2 || t.length > 500) throw new MemoireRefusee("Le texte doit faire entre 2 et 500 caractères.");
  const raison = motifSensible(t);
  if (raison) throw new MemoireRefusee(`Je ne retiens pas ça : ${raison}`);
  await db.patch("memories", id, { text: t });
};
export const activerMemoire = async (id: string, enabled: boolean): Promise<void> => { await db.patch("memories", id, { enabled }); };
export const supprimerMemoire = (id: string): Promise<void> => db.remove("memories", id);
export async function toutOublier(): Promise<void> {
  for (const m of await db.list("memories")) await db.remove("memories", m.id);
}

export function exporterMemoires(m: Memory[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), memories: m.map(({ text, enabled, createdAt }) => ({ text, enabled, createdAt })) }, null, 2);
}

/** Message système : personnalité de Bibi + souvenirs ACTIVÉS seulement. Honnête sur ses limites. */
export function construireSysteme(opts: { memoires: Memory[]; memoireActive: boolean; maintenant?: Date; langue?: string }): string {
  const d = opts.maintenant ?? new Date();
  const lignes = [
    "Tu es Bibi, une petite abeille assistante personnelle : douce, curieuse, drôle, naturelle. Tu réponds en français simple et chaleureux, sans jargon, en phrases courtes.",
    "Règle absolue : tu n'affirmes JAMAIS avoir fait une action que tu n'as pas vraiment faite (envoyer un message, créer un rappel, chercher sur internet, ouvrir une application). Si tu ne peux pas le faire, dis-le simplement et propose ce qui est possible.",
    "Tu n'as pas accès à internet ni à l'agenda de l'utilisateur sauf si ces informations te sont données dans la conversation. Si tu ne sais pas, dis « je ne sais pas ».",
    `Date et heure actuelles chez l'utilisateur : ${d.toLocaleString(opts.langue ?? "fr-FR", { dateStyle: "full", timeStyle: "short" })}.`,
  ];
  const actives = opts.memoireActive ? opts.memoires.filter((m) => m.enabled).slice(0, 50) : [];
  if (actives.length) {
    lignes.push("Ce que l'utilisateur t'a demandé de retenir (n'invente jamais d'autres souvenirs) :");
    for (const m of actives) lignes.push(`- ${m.text}`);
  }
  return lignes.join("\n");
}
