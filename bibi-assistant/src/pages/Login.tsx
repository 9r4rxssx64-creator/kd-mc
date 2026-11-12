import { useState } from "react";
import { Bibi } from "../components/Bibi";
import { Alerte } from "../components/ui";
import { api } from "../lib/api";
import type { SessionInfo } from "../lib/types";

/** Écran d'accès : code d'accès (mode « code ») ou compte (mode « accounts »). Jamais affiché en mode ouvert. */
export function Login({ session, surConnecte }: { session: SessionInfo; surConnecte: () => void }) {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [code, setCode] = useState("");
  const [creer, setCreer] = useState(false);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  async function envoyer(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErreur(""); setOccupe(true);
    try {
      if (session.mode === "code") await api.loginCode(code);
      else if (creer) await api.register(email, mdp);
      else await api.login(email, mdp);
      surConnecte();
    } catch (err) { setErreur((err as Error).message); }
    finally { setOccupe(false); }
  }

  return (
    <main className="login">
      <Bibi state={erreur ? "sad" : "waiting"} size={140} label="Bibi attend que tu te connectes" />
      <h1>Bibi</h1>
      <form className="carte" onSubmit={(e) => void envoyer(e)}>
        {session.mode === "code" ? (
          <>
            <p>Entre le code d'accès de cette Bibi.</p>
            <input className="champ" type="password" autoComplete="current-password" autoFocus placeholder="Code d'accès" aria-label="Code d'accès" value={code} onChange={(e) => setCode(e.target.value)} />
          </>
        ) : (
          <>
            <p>{creer ? "Créer ton compte" : "Connecte-toi"}</p>
            <input className="champ" type="email" autoComplete="email" autoFocus placeholder="Adresse e-mail" aria-label="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="champ" type="password" autoComplete={creer ? "new-password" : "current-password"} placeholder={creer ? "Mot de passe (10 caractères minimum)" : "Mot de passe"} aria-label="Mot de passe" value={mdp} onChange={(e) => setMdp(e.target.value)} />
          </>
        )}
        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
        <button className="btn btn-miel" type="submit" disabled={occupe || (session.mode === "code" ? !code : !email || !mdp)}>{occupe ? "…" : creer ? "Créer mon compte" : "Entrer"}</button>
        {session.mode === "accounts" && (session.registrationOpen
          ? <button className="lien" type="button" onClick={() => { setCreer(!creer); setErreur(""); }}>{creer ? "J'ai déjà un compte" : "Pas encore de compte ? En créer un"}</button>
          : <p className="aide">Les inscriptions sont fermées : seul le propriétaire peut ouvrir de nouveaux comptes.</p>)}
      </form>
    </main>
  );
}
