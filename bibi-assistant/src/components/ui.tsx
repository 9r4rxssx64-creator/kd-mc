import type { ReactNode } from "react";

export function Page({ titre, aide, children, actions }: { titre: string; aide?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="page" aria-labelledby="titre-page">
      <header className="page-tete">
        <h1 id="titre-page">{titre}</h1>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {aide && <p className="aide">{aide}</p>}
      {children}
    </section>
  );
}

export function Vide({ children }: { children: ReactNode }) { return <p className="vide">{children}</p>; }

export function Alerte({ type = "info", children }: { type?: "info" | "erreur" | "ok" | "attention"; children: ReactNode }) {
  return <div className={`alerte alerte-${type}`} role={type === "erreur" ? "alert" : "status"}>{children}</div>;
}

export const heure = (t: number): string => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const jour = (t: number): string => new Date(t).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
export const dateHeure = (t: number): string => `${jour(t)} ${heure(t)}`;

export function telecharger(nom: string, contenu: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
