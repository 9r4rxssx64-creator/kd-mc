// Synchronisation facultative : démarre seulement si le serveur l'autorise ET qu'on est connecté.
import { useCallback, useEffect, useRef, useState } from "react";
import { synchroniser, type EtatSync } from "../lib/sync";
import * as db from "../lib/db";

export function useSync(actif: boolean): { etat: EtatSync; maintenant: () => Promise<void> } {
  const [etat, setEtat] = useState<EtatSync>({ etat: "inactif" });
  const enCours = useRef(false);
  const maintenant = useCallback(async () => {
    if (!actif || enCours.current) return;
    enCours.current = true;
    setEtat((e) => ({ ...e, etat: "en_cours" }));
    try { setEtat(await synchroniser()); } finally { enCours.current = false; }
  }, [actif]);
  useEffect(() => {
    if (!actif) { setEtat({ etat: "inactif" }); return; }
    void maintenant();
    const t = setInterval(() => { if (document.visibilityState === "visible") void maintenant(); }, 60_000);
    let retard: ReturnType<typeof setTimeout> | undefined;
    const off = db.subscribe("*", () => { clearTimeout(retard); retard = setTimeout(() => void maintenant(), 4000); });
    return () => { clearInterval(t); clearTimeout(retard); off(); };
  }, [actif, maintenant]);
  return { etat, maintenant };
}
