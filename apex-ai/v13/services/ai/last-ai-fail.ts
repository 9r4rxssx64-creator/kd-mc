/**
 * last-ai-fail.ts — v13.4.339 (Kevin « Toutes les IA KO » + badge openai).
 *
 * Diag leçon #97/#101 : le proxy répond 200 à TOUT ce qu'on peut tester à distance
 * (CI : simple, app-like stream+tools, préflight CORS — tous verts), et les 200
 * tools sont valides. Donc l'échec anthropic réel n'existe QUE sur le device →
 * il faut CAPTURER le message exact au moment où il se produit et l'AFFICHER
 * dans le Diagnostic (Coffre) pour que Kevin le copie en 1 capture.
 *
 * Léger, idempotent, fail-open : jamais d'exception propagée.
 */

const KEY = 'apex_v13_last_ai_fail';
const MAX_MSG = 400;

export interface LastAiFail {
  ts: number;
  msg: string;
  status?: number | undefined;
}

type FailMap = Record<string, LastAiFail>;

function read(): FailMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as FailMap;
  } catch {
    return {};
  }
}

/** Enregistre le dernier échec d'un provider (écrase le précédent — on veut le + récent). */
export function recordLastAiFail(provider: string, message: string, status?: number): void {
  try {
    const map = read();
    map[provider] = {
      ts: Date.now(),
      msg: String(message).slice(0, MAX_MSG),
      ...(typeof status === 'number' ? { status } : {}),
    };
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* fail-open */
  }
}

/** Efface l'échec d'un provider (appelé sur succès → l'entrée ne reste pas périmée). */
export function clearLastAiFail(provider: string): void {
  try {
    const map = read();
    if (!(provider in map)) return; /* idempotent : pas d'écriture inutile */
    delete map[provider];
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* fail-open */
  }
}

/** Tous les derniers échecs (pour le Diagnostic). */
export function getLastAiFails(): Readonly<FailMap> {
  return read();
}

/** Format lisible pour le Diagnostic : « anthropic il y a 2 min — HTTP 400 — … ». */
export function formatLastAiFails(now = Date.now()): string[] {
  const map = read();
  const out: string[] = [];
  for (const [provider, f] of Object.entries(map)) {
    const ageMin = Math.max(0, Math.round((now - f.ts) / 60_000));
    const http = typeof f.status === 'number' ? `HTTP ${f.status} — ` : '';
    out.push(`${provider} (il y a ${ageMin} min) : ${http}${f.msg}`);
  }
  return out;
}
