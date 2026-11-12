import { useEffect, useMemo, useRef, useState } from "react";
import { Alerte, Page, Vide } from "../components/ui";
import { useVoices } from "../hooks/useVoices";
import { api } from "../lib/api";
import { Parleur, filtrerVoix, languesDisponibles, syntheseDisponible, voixKey, voixParDefaut, reconnaissanceNavigateur, enregistrementPossible } from "../lib/voice";
import type { VoiceChoice, SettingsDoc, SpeechEngines } from "../lib/types";

const MOTEURS: Record<string, string> = { browser: "Voix de l'appareil", piper: "Piper", kokoro: "Kokoro", elevenlabs: "ElevenLabs (payant)" };
const PHRASE = "Bonjour, je suis Bibi, ta petite abeille. Voilà comment je parle.";

export function Voix({ reglages, changer }: { reglages: SettingsDoc; changer: (c: Partial<SettingsDoc>) => Promise<void> }) {
  const { voix, erreurs, chargement, recharger } = useVoices();
  const [recherche, setRecherche] = useState("");
  const [langue, setLangue] = useState(reglages.language.slice(0, 2).toLowerCase());
  const [moteur, setMoteur] = useState("all");
  const [locales, setLocales] = useState(false);
  const [moteurs, setMoteurs] = useState<SpeechEngines | null>(null);
  const [cle, setCle] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const parleur = useRef(new Parleur()).current;

  useEffect(() => { void api.speechEngines().then(setMoteurs).catch(() => setMoteurs(null)); }, []);
  useEffect(() => () => parleur.stop(), [parleur]);

  const visibles = useMemo(() => filtrerVoix(voix, { recherche, langue, moteur, localesSeulement: locales }), [voix, recherche, langue, moteur, locales]);
  const langues = useMemo(() => languesDisponibles(voix), [voix]);
  const actuelle = voixParDefaut(voix, reglages.voice, reglages.language);

  async function essayer(v: (typeof voix)[number]): Promise<void> {
    setMessage(null);
    if (enCours === voixKey(v)) { parleur.stop(); setEnCours(null); return; }
    setEnCours(voixKey(v));
    try { await parleur.dire(PHRASE, v, reglages); }
    catch (e) { setMessage({ type: "erreur", texte: (e as Error).message }); }
    finally { setEnCours((c) => (c === voixKey(v) ? null : c)); }
  }
  const choisir = (v: (typeof voix)[number]): Promise<void> => changer({ voice: { engine: v.engine, id: v.id } as VoiceChoice });

  async function enregistrerCle(): Promise<void> {
    try { await api.setElevenKey(cle.trim()); setCle(""); setMessage({ type: "ok", texte: "Clé ElevenLabs enregistrée sur le serveur (elle ne revient jamais dans le navigateur)." }); setMoteurs(await api.speechEngines()); recharger(); }
    catch (e) { setMessage({ type: "erreur", texte: (e as Error).message }); }
  }
  async function retirerCle(): Promise<void> {
    try { await api.clearElevenKey(); setMoteurs(await api.speechEngines()); recharger(); setMessage({ type: "ok", texte: "Clé ElevenLabs retirée." }); }
    catch (e) { setMessage({ type: "erreur", texte: (e as Error).message }); }
  }

  return (
    <Page titre="Voix" aide="Choisis la voix de Bibi. Seules les voix réellement disponibles sur ton appareil et sur ton serveur sont listées.">
      {!syntheseDisponible() && voix.length === 0 && !chargement && <Alerte type="attention">Ce navigateur ne sait pas lire à voix haute et aucun moteur vocal du serveur n'est configuré : Bibi restera silencieuse.</Alerte>}
      {message && <Alerte type={message.type}>{message.texte}</Alerte>}

      <div className="carte">
        <h2>Voix actuelle</h2>
        <p>{actuelle ? <><strong>{actuelle.name}</strong> · {actuelle.lang} · {MOTEURS[actuelle.engine]}</> : "Aucune voix disponible pour le moment."}</p>
        <label className="interrupteur"><input type="checkbox" checked={reglages.speakReplies} onChange={(e) => void changer({ speakReplies: e.target.checked })} /><span>Lire les réponses à voix haute automatiquement</span></label>
        <label className="curseur">Vitesse : {reglages.rate.toFixed(1)}×<input type="range" min={0.5} max={2} step={0.1} value={reglages.rate} onChange={(e) => void changer({ rate: Number(e.target.value) })} /></label>
        <label className="curseur">Hauteur : {reglages.pitch.toFixed(1)}<input type="range" min={0.5} max={2} step={0.1} value={reglages.pitch} onChange={(e) => void changer({ pitch: Number(e.target.value) })} /></label>
        <label className="curseur">Volume : {Math.round(reglages.volume * 100)} %<input type="range" min={0} max={1} step={0.05} value={reglages.volume} onChange={(e) => void changer({ volume: Number(e.target.value) })} /></label>
        <p className="aide">La hauteur ne s'applique qu'aux voix de l'appareil. Les moteurs du serveur utilisent la vitesse et le volume.</p>
      </div>

      <div className="carte">
        <h2>Écoute (micro)</h2>
        <p>Reconnaissance vocale du navigateur : <strong>{reconnaissanceNavigateur() ? "disponible" : "absente"}</strong>.</p>
        <p>Secours Whisper (serveur) : <strong>{moteurs ? (moteurs.whisper.configured ? "configuré" : "non configuré") : "inconnu"}</strong>{moteurs && !moteurs.whisper.configured ? ` — ${moteurs.whisper.note}` : ""}</p>
        {!reconnaissanceNavigateur() && !(moteurs?.whisper.configured && enregistrementPossible()) && <Alerte type="info">Aucune écoute vocale possible ici. Tu peux toujours écrire à Bibi. Dans Chrome ou Safari récents, le micro fonctionne ; dans Chrome, le son passe par les serveurs de Google.</Alerte>}
        <p className="aide">Le micro ne démarre jamais tout seul : seulement quand tu touches le bouton 🎤.</p>
      </div>

      <div className="carte">
        <h2>Moteurs du serveur</h2>
        {!moteurs && <p className="aide">Le serveur n'a pas répondu : seules les voix de l'appareil sont proposées.</p>}
        {moteurs && (["piper", "kokoro", "elevenlabs"] as const).map((m) => (
          <p key={m}><strong>{MOTEURS[m]}</strong> : {moteurs[m].configured ? (moteurs[m].allowed ? "prêt" : "configuré mais bloqué") : "non configuré"} — {moteurs[m].note}{erreurs[m] ? ` Erreur : ${erreurs[m]}` : ""}</p>
        ))}
        {moteurs && (
          <details>
            <summary>ElevenLabs : ajouter ma clé</summary>
            <p className="aide">ElevenLabs est payant au-delà d'un petit quota gratuit. Bibi ne l'utilise que si <code>ALLOW_PAID_PROVIDERS=true</code> est réglé sur le serveur. Crée une clé sur <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">elevenlabs.io</a> (Profil → Clés d'API).</p>
            <input className="champ" type="password" autoComplete="off" placeholder="Colle la clé ici" aria-label="Clé ElevenLabs" value={cle} onChange={(e) => setCle(e.target.value)} />
            <div className="rang"><button className="btn btn-miel" disabled={cle.trim().length < 8} onClick={() => void enregistrerCle()}>Enregistrer</button><button className="btn" onClick={() => void retirerCle()}>Retirer la clé</button></div>
          </details>
        )}
      </div>

      <h2>Bibliothèque de voix</h2>
      <div className="carte filtres">
        <input className="champ" type="search" placeholder="Chercher une voix…" aria-label="Chercher une voix" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <div className="rang">
          <select className="champ" aria-label="Langue" value={langue} onChange={(e) => setLangue(e.target.value)}>
            <option value="all">Toutes les langues</option>
            {langues.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
          <select className="champ" aria-label="Moteur" value={moteur} onChange={(e) => setMoteur(e.target.value)}>
            <option value="all">Tous les moteurs</option>
            {[...new Set(voix.map((v) => v.engine))].map((m) => <option key={m} value={m}>{MOTEURS[m]}</option>)}
          </select>
        </div>
        <label className="interrupteur"><input type="checkbox" checked={locales} onChange={(e) => setLocales(e.target.checked)} /><span>Seulement les voix qui marchent sans internet</span></label>
        <p className="aide">{chargement ? "Chargement des voix…" : `${visibles.length} voix sur ${voix.length}.`} <button className="lien" onClick={recharger}>Actualiser</button></p>
      </div>
      {!chargement && !visibles.length && <Vide>{voix.length ? "Aucune voix ne correspond à ces filtres." : "Aucune voix disponible."}</Vide>}
      <ul className="liste">
        {visibles.slice(0, 200).map((v) => {
          const choisie = !!actuelle && voixKey(actuelle) === voixKey(v);
          return (
            <li key={voixKey(v)} className={`carte ligne${choisie ? " choisie" : ""}`}>
              <span><strong>{v.name}</strong><br /><span className="meta">{v.lang} · {MOTEURS[v.engine]}{v.local ? " · sans internet" : ""}</span></span>
              <span className="rang">
                <button className="btn" onClick={() => void essayer(v)} aria-label={`${enCours === voixKey(v) ? "Arrêter" : "Écouter"} ${v.name}`}>{enCours === voixKey(v) ? "■" : "▶"}</button>
                <button className={`btn${choisie ? "" : " btn-miel"}`} disabled={choisie} onClick={() => void choisir(v)}>{choisie ? "Choisie ✓" : "Choisir"}</button>
              </span>
            </li>
          );
        })}
      </ul>
      {visibles.length > 200 && <p className="aide">Affichage limité à 200 voix : affine la recherche.</p>}
    </Page>
  );
}
