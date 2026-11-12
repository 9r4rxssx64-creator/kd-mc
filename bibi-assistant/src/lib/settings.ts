// Réglages de l'utilisateur, stockés localement (collection « settings », document « main »).
import { useEffect, useState } from "react";
import * as db from "./db";
import { DEFAULT_SETTINGS, SETTINGS_ID, type SettingsDoc } from "./types";

export async function chargerReglages(): Promise<SettingsDoc> {
  const d = await db.get("settings", SETTINGS_ID);
  return { ...DEFAULT_SETTINGS, ...(d ?? {}) };
}

export async function changerReglages(champs: Partial<Omit<SettingsDoc, "id" | "updatedAt">>): Promise<SettingsDoc> {
  const actuel = await chargerReglages();
  const { id: _i, updatedAt: _u, ...reste } = { ...actuel, ...champs };
  const doc = await db.put("settings", { id: SETTINGS_ID, ...reste } as Omit<SettingsDoc, "updatedAt">);
  return doc;
}

export function useReglages(): [SettingsDoc, (c: Partial<Omit<SettingsDoc, "id" | "updatedAt">>) => Promise<void>] {
  const [s, setS] = useState<SettingsDoc>(DEFAULT_SETTINGS);
  useEffect(() => {
    let vivant = true;
    const charger = () => { void chargerReglages().then((r) => { if (vivant) setS(r); }).catch(() => undefined); };
    charger();
    const off = db.subscribe("settings", charger);
    return () => { vivant = false; off(); };
  }, []);
  return [s, async (c) => { setS((x) => ({ ...x, ...c })); await changerReglages(c); }];
}

/** Applique thème, taille de texte et animation sur <html> (CSS pilote le reste). */
export function appliquerAffichage(s: SettingsDoc): void {
  const r = document.documentElement;
  const sombre = s.theme === "dark" || (s.theme === "auto" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
  r.dataset.theme = sombre ? "dark" : "light";
  r.dataset.text = s.textSize;
  const reduit = s.animation === "reduced" || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches && s.animation !== "off");
  r.dataset.anim = s.animation === "off" ? "off" : reduit ? "reduced" : "full";
  r.lang = s.language.slice(0, 2);
}

/** Interrupteur du serveur (ENABLE_LOCAL_MEMORY=false) : la mémoire est coupée pour de bon, quoi que dise le réglage local. */
export function reglagesAvecServeur(r: SettingsDoc, features?: { localMemory: boolean } | null): SettingsDoc {
  return features && !features.localMemory ? { ...r, memoryEnabled: false } : r;
}
