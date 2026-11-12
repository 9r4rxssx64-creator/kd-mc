// Liste des voix réellement disponibles (navigateur + moteurs serveur configurés). Mise en cache pour la session.
import { useCallback, useEffect, useState } from "react";
import { voixNavigateur, voixServeur, type VoiceEntry } from "../lib/voice";

let cache: { voix: VoiceEntry[]; erreurs: Record<string, string> } | null = null;

export function useVoices(): { voix: VoiceEntry[]; erreurs: Record<string, string>; chargement: boolean; recharger: () => void } {
  const [etat, setEtat] = useState(cache ?? { voix: [] as VoiceEntry[], erreurs: {} as Record<string, string> });
  const [chargement, setChargement] = useState(!cache);
  const charger = useCallback(() => {
    setChargement(true);
    void Promise.all([voixNavigateur(), voixServeur()])
      .then(([nav, srv]) => { cache = { voix: [...nav, ...srv.voix], erreurs: srv.erreurs }; setEtat(cache); })
      .catch(() => undefined)
      .finally(() => setChargement(false));
  }, []);
  useEffect(() => { if (!cache) charger(); }, [charger]);
  return { ...etat, chargement, recharger: () => { cache = null; charger(); } };
}
