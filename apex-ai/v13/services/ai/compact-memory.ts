/*
 * compact-memory.ts — Mémoire compacte à récupération pour Apex (jumeau du CLI tools/memory/mem.cjs).
 *
 * Kevin 2026-07-10 « augmente au max ta mémoire en consommant le minimum ». Le magasin
 * (tools/memory/apex-memory.json, versionné, servi par GitHub raw = public, sans clé) peut
 * contenir des milliers de faits ; on n'injecte JAMAIS que les k plus pertinents dans le prompt
 * → empreinte contexte minuscule. Recherche = BM25-lite locale (0 appel IA, 0 clé, 0 embedding).
 *
 * FLAG `apex_v13_compact_mem` (défaut OFF) : tant qu'il est OFF, tout est no-op → 0 impact.
 * FAIL-OPEN total : JSON absent/KO → Apex marche comme avant. Cache localStorage 6 h.
 */

/* Chemin dans le dépôt — l'adresse réelle est décidée par
   services/integrations/depot-github (lecture publique aujourd'hui, relais
   le jour où le dépôt passera en privé). */
const CHEMIN_MEMOIRE = 'tools/memory/apex-memory.json';
import { lireFichier as lireFichierDepot } from '../integrations/depot-github.js';

const CACHE_KEY = 'apex_v13_compact_mem_cache';
const FLAG = 'apex_v13_compact_mem';
const TTL = 6 * 60 * 60 * 1000;

export interface MemItem { t: string; g: string[]; i: number }

const STOP = new Set(
  ('le la les un une des de du et ou a à au aux en dans par pour sur ce cette ces mon ma mes ton ' +
   'ta tes son sa ses que qui quoi dont où est sont être avoir fait il elle je tu on nous vous ils ' +
   'elles se ne pas plus tout tous the a an of to in is are and or for').split(/\s+/),
);

function norm(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function toks(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Recherche pure et testable — aucune I/O. Renvoie les k items les plus pertinents. */
export function searchIn(items: MemItem[], query: string, k = 4): MemItem[] {
  if (!items || !items.length || !query) return [];
  const df: Record<string, number> = {};
  const docs = items.map((e) => {
    const dt = toks(e.t + ' ' + (e.g || []).join(' '));
    new Set(dt).forEach((t) => { df[t] = (df[t] || 0) + 1; });
    return dt;
  });
  const N = items.length;
  const idf: Record<string, number> = {};
  Object.keys(df).forEach((t) => { idf[t] = Math.log(1 + N / (df[t] || 1)); });
  const qToks = toks(query);
  return items
    .map((e, i) => {
      const tf: Record<string, number> = {};
      (docs[i] || []).forEach((t) => { tf[t] = (tf[t] || 0) + 1; });
      let m = 0; // score de correspondance (termes de la requête présents)
      const seen = new Set<string>();
      qToks.forEach((q) => {
        if (seen.has(q)) return; seen.add(q);
        const f = tf[q] || 0;
        if (!f) return;
        m += (idf[q] || 0) * ((f * 2.2) / (f + 1.2));
      });
      // Biais d'importance UNIQUEMENT si au moins un terme matche (sinon le doc ne sort pas)
      const s = m > 0 ? m + (e.i || 50) / 1000 : 0;
      return { e, s };
    })
    .filter((r) => r.s > 0.001)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((r) => r.e);
}

function isEnabled(): boolean {
  // ON par défaut (Kevin 2026-07-10 « tout auto ») : la mémoire compacte est gratuite
  // (recherche locale, sans clé ni embedding) → active sauf si explicitement coupée.
  try { return localStorage.getItem(FLAG) !== 'false'; } catch { return true; }
}

async function load(): Promise<MemItem[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.ts && Date.now() - c.ts < TTL && Array.isArray(c.items)) return c.items;
    }
  } catch { /* ignore */ }
  try {
    const brut = await lireFichierDepot(CHEMIN_MEMOIRE, { timeoutMs: 4000 });
    if (brut === null) return [];
    const items = JSON.parse(brut) as MemItem[];
    if (!Array.isArray(items)) return [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items })); } catch { /* quota */ }
    return items;
  } catch { return []; }
}

/**
 * Bloc à injecter dans le system prompt : les k souvenirs pertinents, ou '' (fail-open).
 * No-op si le flag est OFF → 0 consommation par défaut.
 */
export const compactMemory = {
  isEnabled,
  enable(on: boolean): void { try { localStorage.setItem(FLAG, on ? 'true' : 'false'); } catch { /* ignore */ } },
  searchIn,
  async recallBlock(query: string, k = 4): Promise<string> {
    if (!isEnabled() || !query || query.length < 3) return '';
    try {
      const hits = searchIn(await load(), query, k);
      if (!hits.length) return '';
      return 'Mémoire compacte (faits durables pertinents) :\n' +
        hits.map((h) => '- ' + h.t).join('\n');
    } catch { return ''; }
  },
};
