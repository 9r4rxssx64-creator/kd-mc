// Navigation par « # » : fonctionne partout (hors ligne, installé, sans réglage du serveur).
import { useEffect, useState } from "react";

export const PAGES = ["accueil", "conversations", "memoire", "notes", "taches", "rappels", "voix", "parametres"] as const;
export type Page = (typeof PAGES)[number];

export interface Route { page: Page; id: string | null }

export function lireHash(h: string): Route {
  const [, p = "", id = ""] = h.replace(/^#/, "").split("/");
  const page = (PAGES as readonly string[]).includes(p) ? (p as Page) : "accueil";
  return { page, id: page === "accueil" && id ? decodeURIComponent(id) : null };
}

export const lien = (page: Page, id?: string | null): string => `#/${page}${id ? `/${encodeURIComponent(id)}` : ""}`;
export const aller = (page: Page, id?: string | null): void => { location.hash = lien(page, id); };

export function useRoute(): Route {
  const [r, setR] = useState<Route>(() => lireHash(location.hash));
  useEffect(() => {
    const f = () => setR(lireHash(location.hash));
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return r;
}
