// Lecture d'un fichier .env simple (sans dépendance). Les commentaires doivent être sur leur propre ligne :
// un « # » au milieu d'une valeur fait partie de la valeur (mots de passe, URL).
export function lireEnv(contenu: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of contenu.split(/\r?\n/)) {
    if (l.trim().startsWith("#")) continue;
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}
