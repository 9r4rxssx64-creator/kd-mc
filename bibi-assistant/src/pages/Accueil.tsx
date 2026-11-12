import { useEffect, useRef, useState } from "react";
import { Bibi, libelleEtat } from "../components/Bibi";
import { Alerte, heure } from "../components/ui";
import { useAssistant } from "../hooks/useAssistant";
import { aller } from "../hooks/useRoute";
import { api } from "../lib/api";
import type { ProviderStatus, SettingsDoc } from "../lib/types";

export function Accueil({ conversationId, reglages }: { conversationId: string | null; reglages: SettingsDoc }) {
  const [fournisseurs, setFournisseurs] = useState<ProviderStatus[] | null>(null);
  const [fallback, setFallback] = useState(false);
  const [texte, setTexte] = useState("");
  const [copie, setCopie] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const a = useAssistant(conversationId, reglages, fallback, (id) => aller("accueil", id));

  useEffect(() => {
    void api.providers().then((r) => { setFournisseurs(r.providers); setFallback(r.fallback.length > 0); }).catch(() => setFournisseurs([]));
  }, []);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [a.messages.length, a.flux]);

  const actif = fournisseurs?.find((p) => p.id === reglages.provider);
  const aucun = fournisseurs !== null && !fournisseurs.some((p) => p.configured);

  function envoyer(): void { const t = texte; setTexte(""); void a.envoyer(t); }
  async function copier(id: string, t: string): Promise<void> {
    try { await navigator.clipboard.writeText(t); setCopie(id); setTimeout(() => setCopie(null), 1500); } catch { /* presse-papiers refusé */ }
  }
  const dernier = a.messages[a.messages.length - 1];

  return (
    <div className="accueil">
      <div className="bibi-zone">
        <Bibi state={a.etat} size={a.messages.length ? 96 : 168} label={libelleEtat(a.etat)} />
        <p className="bibi-etat" aria-live="polite">
          {a.ecoute ? (a.interim ? `« ${a.interim} »` : "Je t'écoute…") : a.parle ? "Je parle…" : a.occupe ? "Je réfléchis…" : libelleEtat(a.etat)}
        </p>
      </div>

      {aucun && (
        <Alerte type="attention">
          Aucune IA n'est encore branchée : sans clé, je ne peux pas te répondre.
          <a className="alerte-action" href="#/parametres">Ajouter une clé gratuite</a>
        </Alerte>
      )}
      {a.erreurMicro && <Alerte type="erreur">{a.erreurMicro} <button className="lien" onClick={a.effacerErreurMicro}>Fermer</button></Alerte>}

      <div className="messages" role="log" aria-live="polite" aria-label="Conversation">
        {!a.messages.length && !a.flux && (
          <p className="vide">Salut ! Écris-moi, ou touche le micro pour me parler.{actif ? ` (IA : ${actif.name})` : ""}</p>
        )}
        {a.messages.map((m) => (
          <article key={m.id} className={`msg msg-${m.role}${m.error ? " msg-erreur" : ""}`}>
            {m.error ? (
              <>
                <p><strong>Je n'ai pas pu répondre.</strong> {m.error}</p>
                {m.provider && <p className="meta">Fournisseur : {m.provider}</p>}
              </>
            ) : <p className="msg-texte">{m.content}</p>}
            <footer className="meta">
              <time dateTime={new Date(m.createdAt).toISOString()}>{heure(m.createdAt)}</time>
              {m.role === "assistant" && m.provider && m.provider !== "local" && !m.error && <span>· {m.provider}</span>}
              {m.content && <button className="lien" onClick={() => void copier(m.id, m.content)}>{copie === m.id ? "Copié ✓" : "Copier"}</button>}
              {m.role === "assistant" && m.content && <button className="lien" onClick={() => a.lireMessage(m.content)}>Écouter</button>}
            </footer>
          </article>
        ))}
        {a.flux !== null && (
          <article className="msg msg-assistant msg-flux" aria-busy="true">
            <p className="msg-texte">{a.flux || "…"}</p>
            {a.info && <p className="meta">{a.info}</p>}
          </article>
        )}
        {a.memoire && (
          <div className="carte memoire-demande" role="group" aria-label="Confirmer la mémoire">
            {a.memoire.refus ? (
              <>
                <p><strong>Je ne retiens pas ça.</strong> {a.memoire.refus} Garde-le dans un gestionnaire de mots de passe.</p>
                <div className="rang"><button className="btn" onClick={() => void a.confirmerMemoire(false)}>OK</button></div>
              </>
            ) : (
              <>
                <p>Je retiens ceci ?</p>
                <blockquote>{a.memoire.fait}</blockquote>
                <div className="rang">
                  <button className="btn btn-miel" onClick={() => void a.confirmerMemoire(true)}>Oui, retiens</button>
                  <button className="btn" onClick={() => void a.confirmerMemoire(false)}>Non</button>
                </div>
              </>
            )}
          </div>
        )}
        <div ref={fin} />
      </div>

      <div className="barre-saisie">
        <div className="barre-outils">
          {a.occupe
            ? <button className="btn btn-danger" onClick={a.arreter}>■ Stop</button>
            : dernier && dernier.role === "assistant" && <button className="btn" onClick={() => void a.regenerer()}>↻ Refaire la réponse</button>}
          {a.parle && <button className="btn" onClick={a.arreterVoix}>🔇 Me taire</button>}
          <button className={`btn${a.mainsLibres ? " btn-miel" : ""}`} aria-pressed={a.mainsLibres} onClick={a.basculerMainsLibres}>
            🗣 Mains libres {a.mainsLibres ? "activé" : ""}
          </button>
        </div>
        <form className="saisie" onSubmit={(e) => { e.preventDefault(); envoyer(); }}>
          <button type="button" className={`btn-rond${a.ecoute ? " actif" : ""}`} aria-label={a.ecoute ? "Arrêter le micro" : "Parler (démarre le micro)"} aria-pressed={a.ecoute}
            onClick={a.basculerMicro} disabled={!a.micro.navigateur && !a.micro.whisper}
            title={!a.micro.navigateur && !a.micro.whisper ? "Aucune reconnaissance vocale disponible ici" : undefined}>
            {a.micro.enregistre ? "⏹" : "🎤"}
          </button>
          <textarea value={texte} rows={1} placeholder="Écris à Bibi…" aria-label="Ton message" maxLength={4000}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }} />
          <button type="submit" className="btn-rond btn-miel" aria-label="Envoyer" disabled={!texte.trim() || a.occupe}>➤</button>
        </form>
      </div>
    </div>
  );
}
