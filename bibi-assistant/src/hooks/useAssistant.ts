// Contrôleur de la conversation en cours : envoi, flux, stop, régénération, mémoire, voix, mode mains libres.
// Le micro ne démarre QUE sur un clic explicite de l'utilisateur.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as chat from "../lib/chat";
import { detecterDemandeMemoire, ajouterMemoire, MemoireRefusee, motifSensible } from "../lib/memory";
import { Ecouteur, Enregistreur, Parleur, enregistrementPossible, reconnaissanceNavigateur, voixParDefaut } from "../lib/voice";
import { api } from "../lib/api";
import type { BibiState, Message, SettingsDoc } from "../lib/types";
import { useLive } from "./useLive";
import { useVoices } from "./useVoices";

export interface DemandeMemoire { fait: string; refus: string | null }

export function useAssistant(conversationId: string | null, reglages: SettingsDoc, fallback: boolean, surNouvelleConversation: (id: string) => void) {
  const { data: messages } = useLive<Message[]>(["messages"], () => (conversationId ? chat.messagesDe(conversationId) : Promise.resolve([])), [], [conversationId]);
  const [flux, setFlux] = useState<string | null>(null); // réponse en cours d'écriture
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [parle, setParle] = useState(false);
  const [ecoute, setEcoute] = useState(false);
  const [interim, setInterim] = useState("");
  const [erreurMicro, setErreurMicro] = useState("");
  const [mainsLibres, setMainsLibres] = useState(false);
  const [memoire, setMemoire] = useState<DemandeMemoire | null>(null);
  const [humeur, setHumeur] = useState<BibiState | null>(null);
  const [whisper, setWhisper] = useState(false);
  const { voix } = useVoices();

  const ctrl = useRef<AbortController | null>(null);
  const parleur = useRef(new Parleur()).current;
  const ecouteur = useRef(new Ecouteur()).current;
  const enregistreur = useRef(new Enregistreur()).current;
  const [enregistre, setEnregistre] = useState(false);
  const reg = useRef(reglages); reg.current = reglages;
  const libres = useRef(false); libres.current = mainsLibres;
  const convRef = useRef(conversationId); convRef.current = conversationId;
  const envoyerRef = useRef<(t: string) => Promise<void>>(async () => undefined);

  useEffect(() => { parleur.onChange.push(setParle); return () => { parleur.stop(); ecouteur.arreter(); enregistreur.annuler(); ctrl.current?.abort(); }; }, [parleur, ecouteur, enregistreur]);
  useEffect(() => { void api.speechEngines().then((e) => setWhisper(e.whisper.configured && e.whisper.allowed)).catch(() => undefined); }, []);
  // l'humeur « contente / triste / surprise » ne dure qu'un instant
  useEffect(() => { if (!humeur) return; const t = setTimeout(() => setHumeur(null), 2600); return () => clearTimeout(t); }, [humeur]);

  const voixChoisie = useMemo(() => voixParDefaut(voix, reglages.voice, reglages.language), [voix, reglages.voice, reglages.language]);

  const ecouterApresReponse = useCallback(() => {
    if (!libres.current) return;
    demarrerEcoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lire = useCallback(async (texte: string) => {
    // Anti-boucle : on coupe le micro pendant que Bibi parle, sinon elle s'entendrait elle-même.
    ecouteur.arreter(); setEcoute(false); setInterim("");
    try { await parleur.dire(texte, voixChoisie, reg.current); }
    catch (e) { setErreurMicro((e as Error).message); }
  }, [ecouteur, parleur, voixChoisie]);

  const repondre = useCallback(async (id: string) => {
    ctrl.current = new AbortController();
    setOccupe(true); setFlux(""); setInfo(""); setErreurMicro("");
    try {
      const r = await chat.genererReponse({
        conversationId: id, settings: reg.current, fallback, signal: ctrl.current.signal,
        onTexte: setFlux, onInfo: setInfo,
      });
      if (r.issue === "erreur") setHumeur("error");
      else if (r.issue === "ok") {
        setHumeur("happy");
        if ((reg.current.speakReplies || libres.current) && r.message?.content) await lire(r.message.content);
      }
    } finally { setFlux(null); setOccupe(false); ctrl.current = null; ecouterApresReponse(); }
  }, [fallback, lire, ecouterApresReponse]);

  const envoyer = useCallback(async (brut: string) => {
    const texte = brut.trim();
    if (!texte || occupe) return;
    let id = convRef.current;
    if (!id) { id = (await chat.creerConversation()).id; convRef.current = id; surNouvelleConversation(id); }
    await chat.ajouterMessage(id, "user", texte);
    await chat.titrerSiBesoin(id, texte);
    const fait = detecterDemandeMemoire(texte);
    if (fait && reg.current.memoryEnabled) {
      // Pas d'appel à l'IA : elle pourrait prétendre avoir retenu quelque chose. Bibi demande d'abord confirmation.
      setMemoire({ fait, refus: motifSensible(fait) });
      return;
    }
    await repondre(id);
  }, [occupe, repondre, surNouvelleConversation]);
  envoyerRef.current = envoyer;

  const confirmerMemoire = useCallback(async (oui: boolean) => {
    const m = memoire; const id = convRef.current;
    setMemoire(null);
    if (!m || !id) return;
    if (!oui) { await chat.ajouterMessage(id, "assistant", "D'accord, je ne retiens rien.", { provider: "local" }); return; }
    try {
      await ajouterMemoire(m.fait);
      await chat.ajouterMessage(id, "assistant", `C'est noté, je retiens : « ${m.fait} ». Tu pourras le modifier ou l'effacer dans « Mémoire ».`, { provider: "local" });
      setHumeur("happy");
    } catch (e) {
      await chat.ajouterMessage(id, "assistant", e instanceof MemoireRefusee ? e.message : "Je n'ai pas pu retenir ça.", { provider: "local" });
      setHumeur("sad");
    }
  }, [memoire]);

  const arreter = useCallback(() => { ctrl.current?.abort(); parleur.stop(); }, [parleur]);

  const regenerer = useCallback(async () => {
    const id = convRef.current;
    if (!id || occupe) return;
    const dernier = await chat.retirerDerniereReponse(id);
    if (dernier) await repondre(id);
  }, [occupe, repondre]);

  // ---- micro (démarre seulement quand on l'appelle depuis un clic)
  function demarrerEcoute(): void {
    if (reconnaissanceNavigateur()) {
      setErreurMicro("");
      ecouteur.demarrer({
        langue: reg.current.language, continu: false,
        onDebut: () => setEcoute(true),
        onInterim: setInterim,
        onFinal: (t) => { setInterim(""); setEcoute(false); void envoyerRef.current(t); },
        onErreur: (m, code) => { setErreurMicro(m); setEcoute(false); if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") { libres.current = false; setMainsLibres(false); } },
        onFin: () => { setEcoute(false); if (libres.current && !ctrl.current && !parleur.parle) setTimeout(() => { if (libres.current && !ecouteur.actif && !ctrl.current && !parleur.parle) demarrerEcoute(); }, 400); },
      });
    } else if (whisper && enregistrementPossible()) {
      void enregistreur.demarrer().then(() => { setEnregistre(true); setEcoute(true); }).catch((e: Error) => setErreurMicro(e.message));
    } else setErreurMicro("Ce navigateur n'a pas de reconnaissance vocale, et le serveur n'a pas de moteur de transcription configuré.");
  }

  const basculerMicro = useCallback(() => {
    parleur.stop();
    if (enregistre) {
      setEnregistre(false); setEcoute(false);
      void enregistreur.arreter().then((b) => api.stt(b, reg.current.language.slice(0, 2))).then((t) => { if (t.trim()) void envoyerRef.current(t); else setErreurMicro("Je n'ai rien compris. Réessaie."); }).catch((e: Error) => setErreurMicro(e.message));
    } else if (ecouteur.actif) { ecouteur.arreter(); setEcoute(false); setInterim(""); }
    else demarrerEcoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enregistre, ecouteur, enregistreur, parleur, whisper]);

  const basculerMainsLibres = useCallback(() => {
    if (libres.current) { setMainsLibres(false); libres.current = false; ecouteur.arreter(); enregistreur.annuler(); setEnregistre(false); setEcoute(false); parleur.stop(); return; }
    if (!reconnaissanceNavigateur()) { setErreurMicro("Le mode mains libres a besoin de la reconnaissance vocale du navigateur (Chrome, Edge ou Safari récents)."); return; }
    setMainsLibres(true); libres.current = true;
    if (!ctrl.current) demarrerEcoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecouteur, enregistreur, parleur]);

  const lireMessage = useCallback((texte: string) => { void lire(texte); }, [lire]);

  const etat: BibiState = humeur ? humeur
    : erreurMicro && !ecoute && !occupe && !parle ? "error"
    : parle ? "speaking" : ecoute ? "listening" : occupe ? "thinking" : memoire ? "waiting" : "rest";

  return {
    messages, flux, info, occupe, parle, ecoute, interim, erreurMicro, mainsLibres, memoire, etat,
    micro: { navigateur: reconnaissanceNavigateur(), whisper: whisper && enregistrementPossible(), enregistre },
    envoyer, arreter, regenerer, basculerMicro, basculerMainsLibres, confirmerMemoire, lireMessage,
    arreterVoix: () => parleur.stop(),
    effacerErreurMicro: () => setErreurMicro(""),
  };
}
