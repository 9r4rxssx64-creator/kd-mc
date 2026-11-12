import { useState } from "react";
import { Alerte, Page, Vide, dateHeure, telecharger } from "../components/ui";
import { useLive } from "../hooks/useLive";
import * as mem from "../lib/memory";
import type { Memory, SettingsDoc } from "../lib/types";

export function Memoire({ reglages, changer, memoireAutorisee = true }: { reglages: SettingsDoc; changer: (c: Partial<SettingsDoc>) => Promise<void>; memoireAutorisee?: boolean }) {
  const { data: liste } = useLive<Memory[]>(["memories"], mem.listerMemoires, []);
  const [nouveau, setNouveau] = useState("");
  const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  const [message, setMessage] = useState<{ type: "erreur" | "ok"; texte: string } | null>(null);
  const [toutEffacer, setToutEffacer] = useState(false);

  async function attraper(f: () => Promise<unknown>, ok?: string): Promise<boolean> {
    try { await f(); setMessage(ok ? { type: "ok", texte: ok } : null); return true; }
    catch (e) { setMessage({ type: "erreur", texte: (e as Error).message }); return false; }
  }

  return (
    <Page titre="Ma mémoire avec Bibi" aide="Bibi ne retient que ce que tu lui demandes, après ton accord. Rien de sensible n'est enregistré, et elle n'invente jamais de souvenir.">
      {!memoireAutorisee && <Alerte type="info">La mémoire est coupée par la personne qui gère ce serveur (<code>ENABLE_LOCAL_MEMORY=false</code>). Bibi ne s'en sert pas et ne propose rien. Tes souvenirs déjà enregistrés restent visibles et exportables.</Alerte>}
      <label className="interrupteur">
        <input type="checkbox" disabled={!memoireAutorisee} checked={reglages.memoryEnabled} onChange={(e) => void changer({ memoryEnabled: e.target.checked })} />
        <span>La mémoire est {reglages.memoryEnabled ? "activée" : "désactivée"}{!reglages.memoryEnabled && " — Bibi ne s'en sert pas et ne propose rien."}</span>
      </label>
      {message && <Alerte type={message.type}>{message.texte}</Alerte>}

      <form className="rang" onSubmit={(e) => { e.preventDefault(); void attraper(() => mem.ajouterMemoire(nouveau), "C'est noté.").then((ok) => ok && setNouveau("")); }}>
        <input className="champ" value={nouveau} maxLength={500} placeholder="Ex. : J'aime le thé sans sucre" aria-label="Nouveau souvenir" onChange={(e) => setNouveau(e.target.value)} />
        <button className="btn btn-miel" type="submit" disabled={nouveau.trim().length < 2}>Ajouter</button>
      </form>

      {!liste.length && <Vide>Je ne me souviens encore de rien. Dis-moi « Bibi, retiens que… » dans la discussion, ou ajoute un souvenir ici.</Vide>}
      <ul className="liste">
        {liste.map((m) => (
          <li key={m.id} className={`carte${m.enabled ? "" : " inactif"}`}>
            {edition?.id === m.id ? (
              <form className="rang" onSubmit={(e) => { e.preventDefault(); void attraper(() => mem.modifierMemoire(m.id, edition.texte)).then((ok) => ok && setEdition(null)); }}>
                <input className="champ" autoFocus aria-label="Modifier le souvenir" value={edition.texte} maxLength={500} onChange={(e) => setEdition({ id: m.id, texte: e.target.value })} />
                <button className="btn btn-miel" type="submit">OK</button>
                <button className="btn" type="button" onClick={() => setEdition(null)}>Annuler</button>
              </form>
            ) : (
              <>
                <p className="souvenir">{m.text}</p>
                <p className="meta">Ajouté {dateHeure(m.createdAt)}{!m.enabled && " · désactivé"}</p>
                <div className="rang">
                  <button className="btn" onClick={() => void mem.activerMemoire(m.id, !m.enabled)}>{m.enabled ? "Désactiver" : "Réactiver"}</button>
                  <button className="btn" onClick={() => setEdition({ id: m.id, texte: m.text })}>Modifier</button>
                  <button className="btn" onClick={() => void mem.supprimerMemoire(m.id)}>Supprimer</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="rang rang-fin">
        <button className="btn" disabled={!liste.length} onClick={() => telecharger("bibi-memoire.json", mem.exporterMemoires(liste))}>Exporter ma mémoire</button>
        {toutEffacer
          ? <><button className="btn btn-danger" onClick={() => void mem.toutOublier().then(() => setToutEffacer(false))}>Oui, tout effacer</button><button className="btn" onClick={() => setToutEffacer(false)}>Non</button></>
          : <button className="btn btn-danger-doux" disabled={!liste.length} onClick={() => setToutEffacer(true)}>Tout oublier</button>}
      </div>
    </Page>
  );
}
