import { useMemo, useState } from "react";
import { Page, Vide, dateHeure, telecharger } from "../components/ui";
import { useLive } from "../hooks/useLive";
import { aller } from "../hooks/useRoute";
import * as chat from "../lib/chat";
import type { Conversation } from "../lib/types";

export function Conversations() {
  const { data: liste } = useLive<Conversation[]>(["conversations"], chat.listerConversations, []);
  const [q, setQ] = useState("");
  const [trouve, setTrouve] = useState<{ conversation: Conversation; extrait: string }[] | null>(null);
  const [edition, setEdition] = useState<{ id: string; titre: string } | null>(null);
  const [confirmer, setConfirmer] = useState<string | null>(null);

  const affichees = useMemo(() => trouve ? trouve.map((t) => ({ c: t.conversation, extrait: t.extrait })) : liste.map((c) => ({ c, extrait: "" })), [trouve, liste]);

  async function chercher(texte: string): Promise<void> {
    setQ(texte);
    setTrouve(texte.trim().length >= 2 ? await chat.recherche(texte) : null);
  }
  async function nouvelle(): Promise<void> { const c = await chat.creerConversation(); aller("accueil", c.id); }
  async function exporter(c: Conversation): Promise<void> {
    telecharger(`bibi-${c.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "conversation"}.md`, chat.exporterConversation(c, await chat.messagesDe(c.id)), "text/markdown");
  }

  return (
    <Page titre="Conversations" aide="Retrouve, renomme, exporte ou supprime tes discussions. Elles restent sur cet appareil."
      actions={<button className="btn btn-miel" onClick={() => void nouvelle()}>＋ Nouvelle</button>}>
      <input className="champ" type="search" placeholder="Chercher dans mes conversations…" aria-label="Chercher" value={q} onChange={(e) => void chercher(e.target.value)} />
      {!affichees.length && <Vide>{trouve ? "Rien trouvé pour cette recherche." : "Aucune conversation pour l'instant. Commence par dire bonjour à Bibi !"}</Vide>}
      <ul className="liste">
        {affichees.map(({ c, extrait }) => (
          <li key={c.id} className="carte">
            {edition?.id === c.id ? (
              <form className="rang" onSubmit={(e) => { e.preventDefault(); void chat.renommerConversation(c.id, edition.titre).then(() => setEdition(null)); }}>
                <input className="champ" autoFocus aria-label="Nouveau titre" value={edition.titre} maxLength={80} onChange={(e) => setEdition({ id: c.id, titre: e.target.value })} />
                <button className="btn btn-miel" type="submit">OK</button>
                <button className="btn" type="button" onClick={() => setEdition(null)}>Annuler</button>
              </form>
            ) : (
              <>
                <button className="lien-gros" onClick={() => aller("accueil", c.id)}>
                  <strong>{c.title}</strong>
                  <span className="meta">{dateHeure(c.updatedAt)}</span>
                  {extrait && <span className="extrait">{extrait}</span>}
                </button>
                <div className="rang">
                  <button className="btn" onClick={() => setEdition({ id: c.id, titre: c.title })}>Renommer</button>
                  <button className="btn" onClick={() => void exporter(c)}>Exporter</button>
                  {confirmer === c.id
                    ? <><button className="btn btn-danger" onClick={() => void chat.supprimerConversation(c.id).then(() => setConfirmer(null))}>Oui, supprimer</button><button className="btn" onClick={() => setConfirmer(null)}>Non</button></>
                    : <button className="btn" onClick={() => setConfirmer(c.id)}>Supprimer</button>}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </Page>
  );
}
