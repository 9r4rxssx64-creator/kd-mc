import { useMemo, useState } from "react";
import { Alerte, Page, Vide, dateHeure, jour } from "../components/ui";
import { useLive } from "../hooks/useLive";
import * as db from "../lib/db";
import { creerRappel, demanderPermission, permissionNotifications } from "../lib/reminders";
import type { Reminder, Task } from "../lib/types";

const localIso = (d: Date): string => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function Rappels() {
  const { data: rappels } = useLive<Reminder[]>(["reminders"], async () => (await db.list("reminders")).sort((a, b) => a.at - b.at), []);
  const { data: taches } = useLive<Task[]>(["tasks"], () => db.list("tasks"), []);
  const [texte, setTexte] = useState("");
  const [quand, setQuand] = useState(() => localIso(new Date(Date.now() + 3600_000)));
  const [erreur, setErreur] = useState("");
  const [permission, setPermission] = useState(permissionNotifications());

  async function ajouter(): Promise<void> {
    try { await creerRappel(texte, new Date(quand).getTime()); setTexte(""); setErreur(""); }
    catch (e) { setErreur((e as Error).message); }
  }

  // Agenda : rappels à venir + tâches avec échéance, regroupés par jour.
  const agenda = useMemo(() => {
    const m = new Map<string, { t: number; texte: string; type: "rappel" | "tâche" }[]>();
    const poser = (t: number, texte: string, type: "rappel" | "tâche") => {
      const cle = new Date(t).toISOString().slice(0, 10);
      m.set(cle, [...(m.get(cle) ?? []), { t, texte, type }]);
    };
    for (const r of rappels) if (!r.fired) poser(r.at, r.text, "rappel");
    for (const t of taches) if (t.due && !t.done) poser(new Date(`${t.due}T12:00`).getTime(), t.title, "tâche");
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rappels, taches]);

  return (
    <Page titre="Rappels et agenda" aide="">
      <Alerte type="attention">
        <strong>Important :</strong> les rappels sont gérés sur cet appareil. Ils ne sonnent que si Bibi est ouverte (ou installée et active en arrière-plan). Aucun envoi à distance (SMS, e-mail, notification push du serveur) n'est configuré : je ne te promets donc pas qu'un rappel arrivera si l'application est fermée.
      </Alerte>
      {permission !== "granted" && (
        <div className="carte">
          {permission === "indisponible" && <p>Ce navigateur ne sait pas afficher de notifications : le rappel s'affichera dans la page.</p>}
          {permission === "denied" && <p>Les notifications sont bloquées pour Bibi. Autorise-les dans les réglages du navigateur ; en attendant, le rappel s'affichera dans la page.</p>}
          {permission === "default" && (
            <>
              <p>Pour être prévenu(e) même quand la page est en arrière-plan, autorise les notifications.</p>
              <button className="btn btn-miel" onClick={() => void demanderPermission().then(setPermission)}>Autoriser les notifications</button>
            </>
          )}
        </div>
      )}
      {permission === "granted" && <Alerte type="ok">Notifications autorisées (rappels locaux, application ouverte).</Alerte>}

      <form className="carte" onSubmit={(e) => { e.preventDefault(); void ajouter(); }}>
        <input className="champ" value={texte} maxLength={200} placeholder="Ex. : Sortir le linge" aria-label="Texte du rappel" onChange={(e) => setTexte(e.target.value)} />
        <input className="champ" type="datetime-local" value={quand} aria-label="Date et heure" onChange={(e) => setQuand(e.target.value)} />
        <button className="btn btn-miel" type="submit" disabled={!texte.trim()}>Programmer le rappel</button>
      </form>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}

      <h2>Agenda</h2>
      {!agenda.length && <Vide>Rien de prévu. Ajoute un rappel ou une tâche avec une échéance.</Vide>}
      {agenda.map(([cle, items]) => (
        <div key={cle} className="carte">
          <h3>{jour(new Date(`${cle}T12:00`).getTime())}</h3>
          <ul className="liste-simple">
            {items.sort((a, b) => a.t - b.t).map((i, k) => <li key={k}>{i.type === "rappel" ? `⏰ ${new Date(i.t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "✓ échéance"} — {i.texte}</li>)}
          </ul>
        </div>
      ))}

      <h2>Tous les rappels</h2>
      {!rappels.length && <Vide>Aucun rappel.</Vide>}
      <ul className="liste">
        {rappels.map((r) => (
          <li key={r.id} className={`carte ligne${r.fired ? " fait" : ""}`}>
            <span><strong>{r.text}</strong><br /><span className="meta">{dateHeure(r.at)} · {r.fired ? "déjà sonné" : r.at < Date.now() ? "en attente (ouvre Bibi)" : "à venir"}</span></span>
            <button className="btn btn-petit" aria-label={`Supprimer le rappel ${r.text}`} onClick={() => void db.remove("reminders", r.id)}>✕</button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
