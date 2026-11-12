import { useState } from "react";
import { Page, Vide, jour } from "../components/ui";
import { useLive } from "../hooks/useLive";
import * as db from "../lib/db";
import type { ShoppingItem, Task } from "../lib/types";

export function Taches() {
  const { data: taches } = useLive<Task[]>(["tasks"], async () => (await db.list("tasks")).sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? "9") .localeCompare(b.due ?? "9") || b.createdAt - a.createdAt), []);
  const { data: courses } = useLive<ShoppingItem[]>(["shopping"], async () => (await db.list("shopping")).sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt), []);
  const [titre, setTitre] = useState("");
  const [echeance, setEcheance] = useState("");
  const [article, setArticle] = useState("");

  async function ajouterTache(): Promise<void> {
    const t = titre.trim(); if (!t) return;
    await db.put("tasks", { title: t, done: false, ...(echeance ? { due: echeance } : {}), createdAt: Date.now() });
    setTitre(""); setEcheance("");
  }
  async function ajouterArticle(): Promise<void> {
    const t = article.trim(); if (!t) return;
    await db.put("shopping", { text: t, done: false, createdAt: Date.now() });
    setArticle("");
  }
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <Page titre="Tâches et courses" aide="Ta liste de choses à faire et ta liste de courses, sur cet appareil.">
      <h2>À faire</h2>
      <form className="rang rang-champs" onSubmit={(e) => { e.preventDefault(); void ajouterTache(); }}>
        <input className="champ" value={titre} maxLength={200} placeholder="Ex. : Appeler le dentiste" aria-label="Nouvelle tâche" onChange={(e) => setTitre(e.target.value)} />
        <input className="champ champ-date" type="date" value={echeance} aria-label="Échéance (facultatif)" onChange={(e) => setEcheance(e.target.value)} />
        <button className="btn btn-miel" type="submit" disabled={!titre.trim()}>Ajouter</button>
      </form>
      {!taches.length && <Vide>Rien à faire pour l'instant. Profite !</Vide>}
      <ul className="liste">
        {taches.map((t) => (
          <li key={t.id} className={`carte ligne${t.done ? " fait" : ""}`}>
            <label className="case"><input type="checkbox" checked={t.done} onChange={(e) => void db.patch("tasks", t.id, { done: e.target.checked })} /><span>{t.title}</span></label>
            {t.due && <span className={`pastille${!t.done && t.due < aujourdhui ? " retard" : ""}`}>{jour(new Date(`${t.due}T12:00`).getTime())}{!t.done && t.due < aujourdhui ? " · en retard" : ""}</span>}
            <button className="btn btn-petit" aria-label={`Supprimer ${t.title}`} onClick={() => void db.remove("tasks", t.id)}>✕</button>
          </li>
        ))}
      </ul>
      {taches.some((t) => t.done) && <button className="btn" onClick={() => void Promise.all(taches.filter((t) => t.done).map((t) => db.remove("tasks", t.id)))}>Retirer les tâches terminées</button>}

      <h2>Liste de courses</h2>
      <form className="rang" onSubmit={(e) => { e.preventDefault(); void ajouterArticle(); }}>
        <input className="champ" value={article} maxLength={120} placeholder="Ex. : Lait" aria-label="Nouvel article" onChange={(e) => setArticle(e.target.value)} />
        <button className="btn btn-miel" type="submit" disabled={!article.trim()}>Ajouter</button>
      </form>
      {!courses.length && <Vide>La liste de courses est vide.</Vide>}
      <ul className="liste">
        {courses.map((c) => (
          <li key={c.id} className={`carte ligne${c.done ? " fait" : ""}`}>
            <label className="case"><input type="checkbox" checked={c.done} onChange={(e) => void db.patch("shopping", c.id, { done: e.target.checked })} /><span>{c.text}</span></label>
            <button className="btn btn-petit" aria-label={`Supprimer ${c.text}`} onClick={() => void db.remove("shopping", c.id)}>✕</button>
          </li>
        ))}
      </ul>
      {courses.some((c) => c.done) && <button className="btn" onClick={() => void Promise.all(courses.filter((c) => c.done).map((c) => db.remove("shopping", c.id)))}>Retirer les articles cochés</button>}
    </Page>
  );
}
