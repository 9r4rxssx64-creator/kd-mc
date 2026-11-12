import { useEffect, useState } from "react";
import { Alerte, Page, dateHeure, telecharger } from "../components/ui";
import { api } from "../lib/api";
import * as db from "../lib/db";
import { effacerCloud, type EtatSync } from "../lib/sync";
import type { ProviderId, ProviderStatus, SessionInfo, SettingsDoc } from "../lib/types";

type Changer = (c: Partial<SettingsDoc>) => Promise<void>;
type Retour = { type: "ok" | "erreur"; texte: string } | null;

/** Nom du site pour le lien d'inscription ; jamais d'exception si l'adresse est mal formée. */
export function hoteDe(adresse: string): string {
  try { return new URL(adresse).hostname; } catch { return "le site du fournisseur"; }
}

function Fournisseur({ p, reglages, changer, recharger }: { p: ProviderStatus; reglages: SettingsDoc; changer: Changer; recharger: () => void }) {
  const [cle, setCle] = useState("");
  const [retour, setRetour] = useState<Retour>(null);
  const [occupe, setOccupe] = useState(false);
  const [modeles, setModeles] = useState<{ id: string; label: string; free: boolean | null }[] | null>(null);
  const bloque = !!p.blockedReason;

  async function action(f: () => Promise<string>): Promise<void> {
    setOccupe(true); setRetour(null);
    try { setRetour({ type: "ok", texte: await f() }); recharger(); }
    catch (e) { setRetour({ type: "erreur", texte: (e as Error).message }); }
    finally { setOccupe(false); }
  }
  const tester = () => action(async () => { const r = await api.testProvider(p.id); return `Ça marche : ${r.modelCount} modèle(s) vus en ${r.latencyMs} ms.`; });
  const enregistrer = () => action(async () => { await api.setKey(p.id, cle.trim()); setCle(""); return "Clé enregistrée sur le serveur (chiffrée, jamais renvoyée au navigateur). Teste-la avec le bouton « Tester »."; });
  const retirer = () => action(async () => { await api.clearKey(p.id); return "Clé retirée."; });
  const chargerModeles = () => action(async () => { const r = await api.models(p.id); setModeles(r.models); return `${r.models.length} modèle(s) disponible(s).`; });

  return (
    <div className="carte fournisseur">
      <h3>{p.name} <span className={`pastille ${p.configured ? "ok" : ""}`}>{p.configured ? "clé présente" : "pas de clé"}</span></h3>
      <p className="aide">{p.freeTierNote}</p>
      {p.costUncertain && <Alerte type="attention">Le coût de ce service n'est pas garanti gratuit. Bibi ne l'utilise que sur ta demande explicite.</Alerte>}
      {bloque && <Alerte type="attention">{p.blockedReason}</Alerte>}
      {Object.keys(p.usage.limits).length > 0 && (
        <p className="meta">Limites annoncées par le service{p.usage.lastSeenAt ? ` (vues ${dateHeure(p.usage.lastSeenAt)})` : ""} : {Object.entries(p.usage.limits).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
      )}
      <details>
        <summary>Comment obtenir une clé ?</summary>
        <p>{p.keyHelp}</p>
        <p><a href={p.signupUrl} target="_blank" rel="noreferrer">Ouvrir {hoteDe(p.signupUrl)}</a></p>
      </details>
      {p.keySource === "env" && <p className="aide">La clé vient de la configuration du serveur (<code>.env</code>) : elle ne se modifie pas ici.</p>}
      {p.keySource !== "env" && (
        <div className="rang rang-champs">
          <input className="champ" type="password" autoComplete="off" placeholder={p.configured ? "Remplacer la clé…" : "Colle ta clé ici"} aria-label={`Clé ${p.name}`} value={cle} onChange={(e) => setCle(e.target.value)} />
          <button className="btn btn-miel" disabled={occupe || cle.trim().length < 8} onClick={() => void enregistrer()}>Enregistrer</button>
        </div>
      )}
      <div className="rang">
        <button className="btn" disabled={occupe || !p.configured || bloque} onClick={() => void tester()}>Tester</button>
        <button className="btn" disabled={occupe || !p.configured || bloque} onClick={() => void chargerModeles()}>Voir les modèles</button>
        {p.keySource === "saved" && <button className="btn btn-danger-doux" disabled={occupe} onClick={() => void retirer()}>Retirer la clé</button>}
      </div>
      {retour && <Alerte type={retour.type}>{retour.texte}</Alerte>}
      <label className="champ-lib">Modèle (laisser vide = {p.defaultModel})
        {modeles ? (
          <select className="champ" value={reglages.models[p.id] ?? ""} onChange={(e) => void changer({ models: { ...reglages.models, [p.id]: e.target.value || undefined } })}>
            <option value="">{p.defaultModel} (par défaut)</option>
            {modeles.map((m) => <option key={m.id} value={m.id}>{m.label}{m.free === true ? " — gratuit" : m.free === false ? " — payant" : ""}</option>)}
          </select>
        ) : (
          <input className="champ" placeholder={p.defaultModel} value={reglages.models[p.id] ?? ""} maxLength={120} onChange={(e) => void changer({ models: { ...reglages.models, [p.id]: e.target.value.trim() || undefined } })} />
        )}
      </label>
    </div>
  );
}

export function Parametres({ reglages, changer, session, sync, surDeconnexion, memoireAutorisee = true }: {
  memoireAutorisee?: boolean; reglages: SettingsDoc; changer: Changer; session: SessionInfo | null; sync: { etat: EtatSync; maintenant: () => Promise<void> }; surDeconnexion: () => void;
}) {
  const [liste, setListe] = useState<{ providers: ProviderStatus[]; fallback: ProviderId[] } | null>(null);
  const [erreur, setErreur] = useState("");
  const [retour, setRetour] = useState<Retour>(null);
  const recharger = () => { void api.providers().then((r) => { setListe(r); setErreur(""); }).catch((e) => setErreur((e as Error).message)); };
  useEffect(recharger, []);

  const fallback = liste?.fallback ?? [];
  async function basculerRepli(id: ProviderId, actif: boolean): Promise<void> {
    const nouveau = actif ? [...new Set([...fallback, id])] : fallback.filter((x) => x !== id);
    try { await api.setFallback(nouveau); recharger(); } catch (e) { setRetour({ type: "erreur", texte: (e as Error).message }); }
  }
  async function exporter(): Promise<void> {
    telecharger(`bibi-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exporterTout(), null, 2));
  }
  async function toutEffacer(): Promise<void> {
    if (!window.confirm("Effacer TOUTES les données de Bibi sur cet appareil (conversations, souvenirs, notes, tâches, rappels, réglages) ? Cette action est définitive.")) return;
    await db.toutEffacer();
    setRetour({ type: "ok", texte: "Toutes les données locales ont été effacées." });
  }
  async function effacerLeCloud(): Promise<void> {
    if (!window.confirm("Effacer toutes tes données sur le serveur ? Les données de cet appareil restent.")) return;
    setRetour((await effacerCloud()) ? { type: "ok", texte: "Données du serveur effacées." } : { type: "erreur", texte: "Le serveur n'a pas pu effacer tes données." });
  }

  const sync_on = !!session?.features.cloudSync;
  return (
    <Page titre="Paramètres" aide="">
      <section className="carte">
        <h2>Affichage</h2>
        <label className="champ-lib">Langue
          <select className="champ" value={reglages.language} onChange={(e) => void changer({ language: e.target.value })}>
            <option value="fr-FR">Français</option><option value="en-US">English</option><option value="es-ES">Español</option><option value="de-DE">Deutsch</option><option value="it-IT">Italiano</option>
          </select>
        </label>
        <label className="champ-lib">Thème
          <select className="champ" value={reglages.theme} onChange={(e) => void changer({ theme: e.target.value as SettingsDoc["theme"] })}>
            <option value="auto">Automatique (comme l'appareil)</option><option value="light">Clair</option><option value="dark">Sombre</option>
          </select>
        </label>
        <label className="champ-lib">Taille du texte
          <select className="champ" value={reglages.textSize} onChange={(e) => void changer({ textSize: e.target.value as SettingsDoc["textSize"] })}>
            <option value="small">Petit</option><option value="normal">Normal</option><option value="large">Grand</option>
          </select>
        </label>
        <label className="champ-lib">Animation de Bibi
          <select className="champ" value={reglages.animation} onChange={(e) => void changer({ animation: e.target.value as SettingsDoc["animation"] })}>
            <option value="full">Complète</option><option value="reduced">Réduite</option><option value="off">Aucune</option>
          </select>
        </label>
        <p className="aide">Les réglages de voix (voix, vitesse, hauteur, volume) sont dans la page « Voix ».</p>
      </section>

      <section>
        <h2>Intelligence artificielle</h2>
        <Alerte type="info">Bibi ne dépense jamais d'argent sans que tu le saches. Les services payants sont <strong>bloqués</strong> tant que le serveur n'a pas <code>ALLOW_PAID_PROVIDERS=true</code>, et Bibi ne bascule jamais d'elle-même vers un service payant. Les offres gratuites ont des limites (par minute et par jour) : elles ne sont pas illimitées.</Alerte>
        {erreur && <Alerte type="erreur">Impossible de joindre le serveur : {erreur}</Alerte>}
        {liste && (
          <>
            <label className="champ-lib">Service utilisé en premier
              <select className="champ" value={reglages.provider} onChange={(e) => void changer({ provider: e.target.value as ProviderId })}>
                {liste.providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.configured ? "" : " (pas de clé)"}</option>)}
              </select>
            </label>
            <fieldset className="carte">
              <legend>Si le service choisi ne répond pas</legend>
              <p className="aide">Bibi essaie alors ceux que tu coches (gratuits seulement, dans cet ordre) et te dit lequel a répondu.</p>
              {liste.providers.filter((p) => p.id !== reglages.provider).map((p) => (
                <label key={p.id} className="interrupteur"><input type="checkbox" checked={fallback.includes(p.id)} disabled={!p.configured || !!p.blockedReason} onChange={(e) => void basculerRepli(p.id, e.target.checked)} /><span>{p.name}{!p.configured ? " (pas de clé)" : p.blockedReason ? " (bloqué)" : ""}</span></label>
              ))}
            </fieldset>
            {liste.providers.map((p) => <Fournisseur key={p.id} p={p} reglages={reglages} changer={changer} recharger={recharger} />)}
          </>
        )}
      </section>

      <section className="carte">
        <h2>Mémoire et confidentialité</h2>
        <label className="interrupteur"><input type="checkbox" disabled={!memoireAutorisee} checked={reglages.memoryEnabled} onChange={(e) => void changer({ memoryEnabled: e.target.checked })} /><span>Bibi utilise mes souvenirs dans ses réponses</span></label>
        <label className="champ-lib">Messages relus à chaque réponse : {reglages.contextMessages}
          <input type="range" min={2} max={60} step={2} value={reglages.contextMessages} onChange={(e) => void changer({ contextMessages: Number(e.target.value) })} />
        </label>
        <p className="aide">Gérer, modifier ou effacer les souvenirs : page « Mémoire ». Tes données restent sur cet appareil ; le texte de ta conversation est envoyé au service d'IA choisi pour qu'il réponde. La reconnaissance vocale de Chrome envoie le son aux serveurs de Google.</p>
      </section>

      <section className="carte">
        <h2>Synchronisation et compte</h2>
        {!sync_on && <p>La synchronisation est <strong>désactivée</strong> : tout reste sur cet appareil. (Pour l'activer, l'administrateur règle <code>ENABLE_CLOUD_SYNC=true</code> sur le serveur.)</p>}
        {sync_on && (
          <>
            <p>État : <strong>{{ inactif: "en attente", en_cours: "en cours…", ok: "à jour", erreur: "erreur" }[sync.etat.etat]}</strong>{sync.etat.derniere ? ` · dernière synchro ${dateHeure(sync.etat.derniere)}` : ""}</p>
            {sync.etat.message && <Alerte type={sync.etat.etat === "erreur" ? "erreur" : "info"}>{sync.etat.message}</Alerte>}
            {session?.user && <p>Connecté : {session.user.email}</p>}
            <div className="rang">
              <button className="btn" onClick={() => void sync.maintenant()} disabled={sync.etat.etat === "en_cours"}>Synchroniser maintenant</button>
              <button className="btn btn-danger-doux" onClick={() => void effacerLeCloud()}>Effacer mes données du serveur</button>
            </div>
          </>
        )}
        {session && session.mode !== "open" && session.authenticated && <button className="btn" onClick={() => { void api.logout().finally(surDeconnexion); }}>Me déconnecter</button>}
      </section>

      <section className="carte">
        <h2>Mes données</h2>
        <div className="rang">
          <button className="btn" onClick={() => void exporter()}>Exporter tout (JSON)</button>
          <button className="btn btn-danger" onClick={() => void toutEffacer()}>Tout effacer sur cet appareil</button>
        </div>
        {retour && <Alerte type={retour.type}>{retour.texte}</Alerte>}
      </section>
    </Page>
  );
}
