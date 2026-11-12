import { useEffect, useState } from "react";
import { Bibi } from "./components/Bibi";
import { useReglages, appliquerAffichage, reglagesAvecServeur } from "./lib/settings";
import { demarrerPlanificateur, notifierSysteme } from "./lib/reminders";
import { aller, lien, useRoute, type Page } from "./hooks/useRoute";
import { useSession } from "./hooks/useSession";
import { useSync } from "./hooks/useSync";
import { Accueil } from "./pages/Accueil";
import { Conversations } from "./pages/Conversations";
import { Memoire } from "./pages/Memoire";
import { Notes } from "./pages/Notes";
import { Taches } from "./pages/Taches";
import { Rappels } from "./pages/Rappels";
import { Voix } from "./pages/Voix";
import { Parametres } from "./pages/Parametres";
import { Login } from "./pages/Login";

const MENU: { page: Page; icone: string; nom: string }[] = [
  { page: "accueil", icone: "🐝", nom: "Accueil" },
  { page: "conversations", icone: "💬", nom: "Conversations" },
  { page: "memoire", icone: "🧠", nom: "Mémoire" },
  { page: "notes", icone: "📝", nom: "Notes" },
  { page: "taches", icone: "✅", nom: "Tâches" },
  { page: "rappels", icone: "⏰", nom: "Rappels" },
  { page: "voix", icone: "🔊", nom: "Voix" },
  { page: "parametres", icone: "⚙️", nom: "Réglages" },
];

export function App() {
  const [reglages, changer] = useReglages();
  const route = useRoute();
  const { session, erreur, recharger } = useSession();
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [miseAJour, setMiseAJour] = useState(false);
  const [rappel, setRappel] = useState<string | null>(null);

  useEffect(() => { appliquerAffichage(reglages); }, [reglages]);
  useEffect(() => {
    const m = matchMedia?.("(prefers-color-scheme: dark)");
    const f = () => appliquerAffichage(reglages);
    m?.addEventListener?.("change", f);
    return () => m?.removeEventListener?.("change", f);
  }, [reglages]);
  useEffect(() => {
    const on = () => setEnLigne(true), off = () => setEnLigne(false);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);
  useEffect(() => {
    const f = () => setMiseAJour(true);
    addEventListener("bibi-update", f);
    return () => removeEventListener("bibi-update", f);
  }, []);
  // Rappels : locaux, tant que la page est ouverte. Notification système si permise, sinon bandeau dans la page.
  useEffect(() => demarrerPlanificateur({
    notifier: (titre, corps) => { if (!notifierSysteme(titre, corps)) setRappel(corps); },
  }), []);

  const connecte = !session || session.mode === "open" || session.authenticated;
  const sync = useSync(!!session?.features.cloudSync && connecte);

  if (!session && !erreur) return <main className="chargement"><Bibi state="waiting" size={120} label="Chargement" /><p>Bibi se réveille…</p></main>;
  if (session && !connecte) return <Login session={session} surConnecte={recharger} />;

  // Interrupteur du serveur (ENABLE_LOCAL_MEMORY=false) : la mémoire est coupée pour de bon, quoi que dise le réglage local.
  const memoireAutorisee = !session || session.features.localMemory;
  const reglagesEffectifs = reglagesAvecServeur(reglages, session?.features);

  const Contenu = () => {
    switch (route.page) {
      case "accueil": return <Accueil conversationId={route.id} reglages={reglagesEffectifs} />;
      case "conversations": return <Conversations />;
      case "memoire": return <Memoire reglages={reglagesEffectifs} changer={changer} memoireAutorisee={memoireAutorisee} />;
      case "notes": return <Notes reglages={reglages} />;
      case "taches": return <Taches />;
      case "rappels": return <Rappels />;
      case "voix": return <Voix reglages={reglages} changer={changer} />;
      case "parametres": return <Parametres reglages={reglagesEffectifs} changer={changer} memoireAutorisee={memoireAutorisee} session={session} sync={sync} surDeconnexion={recharger} />;
    }
  };

  return (
    <div className="app">
      <a className="saut" href="#contenu">Aller au contenu</a>
      {!enLigne && <div className="bandeau bandeau-hors" role="status">Tu es hors ligne : tes notes, tâches et conversations restent lisibles. Bibi ne pourra pas répondre avant le retour d'internet.</div>}
      {erreur && <div className="bandeau bandeau-erreur" role="alert">Serveur injoignable ({erreur}). Les données locales restent disponibles.</div>}
      {miseAJour && <div className="bandeau" role="status">Une nouvelle version de Bibi est prête. <button className="lien" onClick={() => location.reload()}>Recharger maintenant</button></div>}
      {rappel && <div className="bandeau bandeau-rappel" role="alert">⏰ {rappel} <button className="lien" onClick={() => setRappel(null)}>OK</button></div>}
      <main id="contenu" tabIndex={-1}><Contenu /></main>
      <nav className="menu" aria-label="Menu principal">
        {MENU.map((m) => (
          <a key={m.page} href={lien(m.page)} aria-current={route.page === m.page ? "page" : undefined} onClick={(e) => { if (route.page === m.page && m.page === "accueil") { e.preventDefault(); aller("accueil"); } }}>
            <span aria-hidden="true">{m.icone}</span><span className="menu-nom">{m.nom}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
