import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { SessionInfo } from "../lib/types";

export function useSession(): { session: SessionInfo | null; erreur: string; recharger: () => Promise<void> } {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [erreur, setErreur] = useState("");
  const recharger = useCallback(async () => {
    try { setSession(await api.session()); setErreur(""); }
    catch (e) { setErreur((e as Error).message); }
  }, []);
  useEffect(() => { void recharger(); }, [recharger]);
  return { session, erreur, recharger };
}
