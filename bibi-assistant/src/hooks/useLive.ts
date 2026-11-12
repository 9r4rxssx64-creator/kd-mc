// Lit une collection locale et se met à jour toute seule (autres onglets compris).
import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "../lib/db";
import type { CollectionName } from "../lib/types";

export function useLive<T>(collections: CollectionName[], charger: () => Promise<T>, initial: T, deps: unknown[] = []): { data: T; recharger: () => void; pret: boolean } {
  const [data, setData] = useState<T>(initial);
  const [pret, setPret] = useState(false);
  const chargerRef = useRef(charger);
  chargerRef.current = charger;
  const cle = collections.join(",");
  const recharger = useCallback(() => {
    void chargerRef.current().then((d) => { setData(d); setPret(true); }).catch(() => setPret(true));
  }, []);
  useEffect(() => {
    recharger();
    const offs = cle.split(",").map((c) => db.subscribe(c as CollectionName, recharger));
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, recharger, ...deps]);
  return { data, recharger, pret };
}
