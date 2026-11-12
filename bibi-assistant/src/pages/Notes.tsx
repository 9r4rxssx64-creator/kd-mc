import { useEffect, useMemo, useRef, useState } from "react";
import { Alerte, Page, Vide, dateHeure } from "../components/ui";
import { useLive } from "../hooks/useLive";
import * as db from "../lib/db";
import { Ecouteur, reconnaissanceNavigateur } from "../lib/voice";
import type { Note, SettingsDoc, VoiceNote } from "../lib/types";

const sansAccent = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Notes({ reglages }: { reglages: SettingsDoc }) {
  const { data: notes } = useLive<Note[]>(["notes"], async () => (await db.list("notes")).sort((a, b) => b.updatedAt - a.updatedAt), []);
  const { data: vocales } = useLive<VoiceNote[]>(["voicenotes"], async () => (await db.list("voicenotes")).sort((a, b) => b.createdAt - a.createdAt), []);
  const [q, setQ] = useState("");
  const [edition, setEdition] = useState<{ id: string | null; titre: string; corps: string } | null>(null);
  const [dicte, setDicte] = useState(false);
  const [interim, setInterim] = useState("");
  const [brouillon, setBrouillon] = useState("");
  const [erreur, setErreur] = useState("");
  const ecouteur = useRef(new Ecouteur()).current;
  useEffect(() => () => ecouteur.arreter(), [ecouteur]);

  const filtre = (t: string): boolean => !q.trim() || sansAccent(t).includes(sansAccent(q.trim()));
  const notesVues = useMemo(() => notes.filter((n) => filtre(`${n.title} ${n.body}`)), [notes, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const vocalesVues = useMemo(() => vocales.filter((n) => filtre(`${n.title} ${n.transcript}`)), [vocales, q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer(): Promise<void> {
    if (!edition) return;
    const titre = edition.titre.trim() || edition.corps.trim().slice(0, 40) || "Sans titre";
    if (!edition.titre.trim() && !edition.corps.trim()) { setEdition(null); return; }
    if (edition.id) await db.patch("notes", edition.id, { title: titre, body: edition.corps });
    else await db.put("notes", { title: titre, body: edition.corps, createdAt: Date.now() });
    setEdition(null);
  }

  function dicter(): void {
    if (dicte) { ecouteur.arreter(); return; }
    setErreur(""); setBrouillon(""); setInterim("");
    ecouteur.demarrer({
      langue: reglages.language, continu: true,
      onDebut: () => setDicte(true),
      onInterim: setInterim,
      onFinal: (t) => { setBrouillon((b) => `${b} ${t}`.trim()); setInterim(""); },
      onErreur: (m) => { setErreur(m); setDicte(false); },
      onFin: () => setDicte(false),
    });
  }
  async function garderVocale(): Promise<void> {
    const t = `${brouillon} ${interim}`.trim();
    if (!t) return;
    await db.put("voicenotes", { title: `Note vocale du ${dateHeure(Date.now())}`, transcript: t, createdAt: Date.now() });
    setBrouillon(""); setInterim("");
  }

  return (
    <Page titre="Notes" aide="Écris une note ou dicte-la à voix haute. Tout reste sur cet appareil (et se synchronise seulement si tu actives le compte).">
      <input className="champ" type="search" placeholder="Chercher dans mes notes…" aria-label="Chercher dans les notes" value={q} onChange={(e) => setQ(e.target.value)} />

      {edition ? (
        <form className="carte" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
          <input className="champ" autoFocus placeholder="Titre" aria-label="Titre" maxLength={120} value={edition.titre} onChange={(e) => setEdition({ ...edition, titre: e.target.value })} />
          <textarea className="champ" rows={6} placeholder="Ta note…" aria-label="Contenu" maxLength={20000} value={edition.corps} onChange={(e) => setEdition({ ...edition, corps: e.target.value })} />
          <div className="rang"><button className="btn btn-miel" type="submit">Enregistrer</button><button className="btn" type="button" onClick={() => setEdition(null)}>Annuler</button></div>
        </form>
      ) : <button className="btn btn-miel" onClick={() => setEdition({ id: null, titre: "", corps: "" })}>＋ Nouvelle note</button>}

      {!notesVues.length && <Vide>{q ? "Aucune note ne correspond." : "Pas encore de note."}</Vide>}
      <ul className="liste">
        {notesVues.map((n) => (
          <li key={n.id} className="carte">
            <strong>{n.title}</strong>
            <p className="corps-note">{n.body}</p>
            <p className="meta">{dateHeure(n.updatedAt)}</p>
            <div className="rang">
              <button className="btn" onClick={() => setEdition({ id: n.id, titre: n.title, corps: n.body })}>Modifier</button>
              <button className="btn" onClick={() => void db.remove("notes", n.id)}>Supprimer</button>
            </div>
          </li>
        ))}
      </ul>

      <h2>Notes vocales</h2>
      {reconnaissanceNavigateur() ? (
        <div className="carte">
          <p className="aide">Touche « Dicter », parle, puis garde le texte. Le micro ne démarre que sur ton clic. Dans Chrome, la reconnaissance vocale passe par les serveurs de Google.</p>
          <div className="rang">
            <button className={`btn${dicte ? " btn-danger" : " btn-miel"}`} onClick={dicter} aria-pressed={dicte}>{dicte ? "■ Arrêter" : "🎤 Dicter"}</button>
            <button className="btn" disabled={!`${brouillon}${interim}`.trim() || dicte} onClick={() => void garderVocale()}>Garder la note</button>
          </div>
          {(brouillon || interim) && <p className="dictee">{brouillon} <span className="interim">{interim}</span></p>}
        </div>
      ) : <Alerte type="info">La dictée n'est pas disponible dans ce navigateur (essaie Chrome, Edge ou Safari récents).</Alerte>}
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {!vocalesVues.length && <Vide>Aucune note vocale.</Vide>}
      <ul className="liste">
        {vocalesVues.map((n) => (
          <li key={n.id} className="carte">
            <strong>{n.title}</strong>
            <p className="corps-note">{n.transcript}</p>
            <div className="rang"><button className="btn" onClick={() => void db.remove("voicenotes", n.id)}>Supprimer</button></div>
          </li>
        ))}
      </ul>
    </Page>
  );
}
