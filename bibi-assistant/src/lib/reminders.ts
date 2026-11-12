// Rappels : planifiés LOCALEMENT. Ils ne sonnent que si Bibi est ouverte (ou installée et active en arrière-plan).
// Aucun envoi « push » depuis un serveur n'est configuré : l'interface le dit clairement.
import * as db from "./db";
import type { Reminder } from "./types";

export const notificationsPossibles = (): boolean => typeof Notification !== "undefined";
export const permissionNotifications = (): NotificationPermission | "indisponible" =>
  notificationsPossibles() ? Notification.permission : "indisponible";

/** À appeler depuis un clic de l'utilisateur. */
export async function demanderPermission(): Promise<NotificationPermission | "indisponible"> {
  if (!notificationsPossibles()) return "indisponible";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export async function creerRappel(text: string, at: number): Promise<Reminder> {
  const t = text.trim();
  if (!t) throw new Error("Écris de quoi je dois te rappeler.");
  if (!Number.isFinite(at)) throw new Error("Choisis une date et une heure valides.");
  return db.put("reminders", { text: t, at, fired: false, createdAt: Date.now() });
}

export interface Declencheur { notifier: (titre: string, corps: string) => void; surDeclenche?: (r: Reminder) => void }

/** Notifie les rappels échus. Renvoie ceux qui viennent de sonner. */
export async function verifierRappels(d: Declencheur, now = Date.now()): Promise<Reminder[]> {
  const dus = (await db.list("reminders")).filter((r) => !r.fired && r.at <= now);
  for (const r of dus) {
    await db.patch("reminders", r.id, { fired: true });
    d.notifier("Bibi te rappelle", r.text);
    d.surDeclenche?.(r);
  }
  return dus;
}

/** Notification système si permise, sinon rien (l'appelant affiche alors une alerte dans la page). */
export function notifierSysteme(titre: string, corps: string): boolean {
  if (permissionNotifications() !== "granted") return false;
  try { new Notification(titre, { body: corps, icon: "/icons/icon-192.png", tag: "bibi-rappel" }); return true; } catch { return false; }
}

export function demarrerPlanificateur(d: Declencheur, intervalleMs = 15_000): () => void {
  void verifierRappels(d);
  const t = setInterval(() => void verifierRappels(d), intervalleMs);
  const vis = () => { if (document.visibilityState === "visible") void verifierRappels(d); };
  document.addEventListener("visibilitychange", vis);
  return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
}
