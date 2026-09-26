/**
 * APEX v13 — Recherche approfondie (Deep Research).
 *
 * Parité flagship 2026 (ChatGPT/Gemini/Perplexity/Grok/Mistral Deep Research) :
 * agent multi-étapes qui (1) décompose la question en sous-questions, (2) lance
 * une recherche web par sous-question, (3) dédoublonne les sources, (4) synthétise
 * un rapport structuré AVEC citations numérotées [1][2]….
 *
 * Réutilise l'existant : `webSearch` (Brave/Tavily via vault) + `aiRouter.stream`.
 * Injection de dépendances (`DeepResearchDeps`) → 100% testable hors réseau
 * (le comportement LIVE — vraies clés Brave/Tavily + vrai LLM — s'exécute en prod).
 *
 * Additif : ne touche ni le routage IA ni le streaming du chat.
 */

import { logger } from '../../core/logger.js';

export interface DeepResearchSource {
  n: number;
  title: string;
  url: string;
  snippet: string;
}

export interface DeepResearchResult {
  query: string;
  subQuestions: string[];
  sources: DeepResearchSource[];
  report: string;
}

export type ResearchPhase = 'planning' | 'searching' | 'synthesizing' | 'done' | 'error';

export interface DeepResearchProgress {
  phase: ResearchPhase;
  step?: number;
  total?: number;
  label?: string;
}

export interface DeepResearchDeps {
  /** Complétion one-shot (retourne le texte complet). Défaut : aiRouter.stream collecté. */
  ask: (prompt: string, system: string) => Promise<string>;
  /** Recherche web. Défaut : webSearch (Brave/Tavily). */
  search: (query: string, max?: number) => Promise<{ results: unknown[]; provider: string }>;
}

export interface DeepResearchOptions {
  maxSubQuestions?: number;
  resultsPerQuestion?: number;
  onProgress?: (p: DeepResearchProgress) => void;
  signal?: AbortSignal;
}

/** Extrait un tableau JSON de chaînes depuis une réponse LLM (tolérant au bruit / fences). */
export function parseSubQuestions(raw: string, fallback: string, max: number): string[] {
  const out: string[] = [];
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]) as unknown;
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (typeof x === 'string' && x.trim()) out.push(x.trim());
        }
      }
    }
  } catch {
    /* fallthrough vers extraction ligne-à-ligne */
  }
  if (!out.length) {
    /* Repli : lignes type "1. ..." / "- ..." */
    for (const line of raw.split('\n')) {
      const cleaned = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim();
      if (cleaned && cleaned.length > 8 && !/^[[{]/.test(cleaned)) out.push(cleaned);
    }
  }
  const uniq = Array.from(new Set(out.map((s) => s.replace(/^["']|["']$/g, '').trim()))).filter(Boolean);
  if (!uniq.length) uniq.push(fallback);
  return uniq.slice(0, Math.max(1, max));
}

/** Normalise un résultat de recherche (Brave/Tavily/…) en {title,url,snippet}. */
export function normalizeResult(r: unknown): { title: string; url: string; snippet: string } | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const url = String(o['url'] ?? o['link'] ?? o['href'] ?? '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = String(o['title'] ?? o['name'] ?? url).trim().slice(0, 200);
  const snippet = String(o['description'] ?? o['content'] ?? o['snippet'] ?? o['text'] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  return { title, url, snippet };
}

/** Dédoublonne + numérote les sources (par URL normalisée). */
export function dedupeSources(raw: Array<{ title: string; url: string; snippet: string }>): DeepResearchSource[] {
  const seen = new Set<string>();
  const out: DeepResearchSource[] = [];
  for (const s of raw) {
    const key = s.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: out.length + 1, title: s.title, url: s.url, snippet: s.snippet });
  }
  return out;
}

function buildSynthesisPrompt(query: string, subQs: string[], sources: DeepResearchSource[]): string {
  const src = sources
    .map((s) => `[${s.n}] ${s.title}\n${s.url}\n${s.snippet}`)
    .join('\n\n');
  return (
    `Question de recherche : ${query}\n\n` +
    `Sous-questions explorées :\n${subQs.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n` +
    `Sources trouvées (numérotées) :\n${src || '(aucune source — indique-le honnêtement)'}\n\n` +
    `Rédige un rapport de synthèse en français, structuré (titres ##, listes), qui répond ` +
    `à la question. CITE chaque affirmation factuelle avec [n] renvoyant à la source. ` +
    `Ne fabrique AUCUNE source ni fait absent des sources. Si les sources sont insuffisantes, ` +
    `dis-le clairement. Termine par une section "## Sources" listant [n] titre — url.`
  );
}

const PLAN_SYSTEM =
  'Tu es un planificateur de recherche. Tu décomposes une question en sous-questions ' +
  'précises et complémentaires pour une recherche web. Réponds UNIQUEMENT par un ' +
  'tableau JSON de chaînes, rien d\'autre.';
const SYNTH_SYSTEM =
  'Tu es un analyste de recherche rigoureux. Tu synthétises des sources web en un rapport ' +
  'cité, honnête, sans invention. Chaque fait renvoie à une source [n].';

/**
 * Lance une recherche approfondie. Déterministe et testable via `deps`.
 * NB : le comportement live (vraies clés + vrai LLM) s'exécute en production.
 */
export async function runDeepResearch(
  query: string,
  opts: DeepResearchOptions,
  deps: DeepResearchDeps,
): Promise<DeepResearchResult> {
  const q = String(query ?? '').trim();
  const maxSubQ = Math.min(Math.max(opts.maxSubQuestions ?? 4, 1), 8);
  const perQ = Math.min(Math.max(opts.resultsPerQuestion ?? 4, 1), 8);
  const emit = (p: DeepResearchProgress): void => {
    try {
      opts.onProgress?.(p);
    } catch {
      /* progress ne doit jamais casser la recherche */
    }
  };
  if (!q) {
    emit({ phase: 'error', label: 'Question vide' });
    return { query: q, subQuestions: [], sources: [], report: '' };
  }

  /* 1) PLAN — décomposition en sous-questions */
  emit({ phase: 'planning', label: 'Décomposition de la question…' });
  let subQuestions: string[] = [q];
  try {
    const planRaw = await deps.ask(
      `Décompose cette question de recherche en ${maxSubQ} sous-questions web précises ` +
        `(tableau JSON de chaînes) :\n"${q}"`,
      PLAN_SYSTEM,
    );
    subQuestions = parseSubQuestions(planRaw, q, maxSubQ);
  } catch (err) {
    logger.warn('deep-research', 'plan failed → fallback single query', { err });
    subQuestions = [q];
  }

  /* 2) SEARCH — une recherche par sous-question, collecte + dédup */
  const rawSources: Array<{ title: string; url: string; snippet: string }> = [];
  for (let i = 0; i < subQuestions.length; i++) {
    if (opts.signal?.aborted) break;
    emit({ phase: 'searching', step: i + 1, total: subQuestions.length, label: subQuestions[i] ?? '' });
    try {
      const res = await deps.search(subQuestions[i]!, perQ);
      for (const r of res.results ?? []) {
        const n = normalizeResult(r);
        if (n) rawSources.push(n);
      }
    } catch (err) {
      logger.warn('deep-research', 'search failed for sub-question', { i, err });
    }
  }
  const sources = dedupeSources(rawSources);

  /* 3) SYNTHESIS — rapport cité */
  emit({ phase: 'synthesizing', label: 'Synthèse du rapport…' });
  let report = '';
  try {
    report = await deps.ask(buildSynthesisPrompt(q, subQuestions, sources), SYNTH_SYSTEM);
  } catch (err) {
    logger.warn('deep-research', 'synthesis failed', { err });
    report =
      `⚠️ La synthèse a échoué. ${sources.length} source${sources.length > 1 ? 's' : ''} trouvée${sources.length > 1 ? 's' : ''} :\n\n` +
      sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`).join('\n');
  }

  emit({ phase: 'done', label: `${sources.length} sources` });
  return { query: q, subQuestions, sources, report };
}

/** Dépendances par défaut (prod) : aiRouter.stream collecté + webSearch Brave/Tavily. */
export async function defaultDeepResearchDeps(): Promise<DeepResearchDeps> {
  const [{ aiRouter }, dispatch] = await Promise.all([
    import('./ai-router.js'),
    import('../apex-tools-dispatch/utils-misc.js'),
  ]);
  const ask = async (prompt: string, system: string): Promise<string> => {
    let out = '';
    await aiRouter.stream([{ role: 'user', content: prompt }], system, (chunk) => {
      if (chunk.text) out += chunk.text;
    });
    return out.trim();
  };
  return { ask, search: dispatch.webSearch };
}
