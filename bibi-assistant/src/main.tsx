import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/bibi.css";
import "./styles/app.css";

createRoot(document.getElementById("racine")!).render(<StrictMode><App /></StrictMode>);

// Service worker : installation, mise à jour automatique (rechargement quand la nouvelle version prend la main).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").then((reg) => {
      const chercher = () => void reg.update().catch(() => undefined);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") chercher(); });
      setInterval(chercher, 30 * 60_000);
    }).catch(() => undefined);
    let deja = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!deja) { deja = true; return; } // première installation : pas de rechargement
      dispatchEvent(new Event("bibi-update"));
      setTimeout(() => location.reload(), 1500);
    });
  });
}
