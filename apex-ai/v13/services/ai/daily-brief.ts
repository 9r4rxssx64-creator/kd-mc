/**
 * APEX v13 — Briefing du jour (Pulse / Daily Brief).
 *
 * Parité flagship 2026 (ChatGPT Pulse, Gemini Daily Brief) : un résumé proactif
 * construit à partir de la mémoire de l'utilisateur (faits, préférences) + la date.
 * Ici : génération à la demande (`/brief`) avec une porte "1×/jour" (réutilisable
 * par une future surface proactive). Injection de dépendances → testable hors réseau.
 */

const LAST_DAY_KEY = 'apex_v13_last_brief_day';

export interface BriefFact {
  category: string;
  text: string;
}

export interface DailyBriefDeps {
  /** Faits mémoire de l'utilisateur (les plus récents en tête, idéalement). */
  getFacts: () => readonly BriefFact[];
  /** Complétion one-shot. */
  ask: (prompt: string, system: string) => Promise<string>;
}

/** Clé "jour local" AAAA-MM-JJ à partir d'une date. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** true si le brief n'a pas encore été montré aujourd'hui. */
export function shouldShowToday(now: Date = new Date()): boolean {
  try {
    return localStorage.getItem(LAST_DAY_KEY) !== dayKey(now);
  } catch {
    return true;
  }
}

export function markShownToday(now: Date = new Date()): void {
  try {
    localStorage.setItem(LAST_DAY_KEY, dayKey(now));
  } catch {
    /* quota / indispo → no-op */
  }
}

const BRIEF_SYSTEM =
  'Tu génères un briefing du jour personnel, court et utile. Ton chaleureux et direct. ' +
  'Pas d\'invention : n\'utilise QUE les faits fournis. Si peu de contexte, propose 2-3 ' +
  'pistes générales utiles. Jamais de secret/clé.';

/** Construit le prompt du brief à partir des faits + date (pur/testable). */
export function buildBriefPrompt(facts: readonly BriefFact[], now: Date = new Date()): string {
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const top = facts.slice(0, 30);
  const ctx = top.length
    ? top.map((f) => `- [${f.category}] ${f.text}`).join('\n')
    : '(aucun fait mémorisé pour l\'instant)';
  return (
    `Nous sommes ${date}.\n\n` +
    `Contexte connu sur l'utilisateur :\n${ctx}\n\n` +
    `Rédige un briefing du jour en français (Markdown), 5-8 lignes max :\n` +
    `1) une accroche personnalisée ;\n` +
    `2) 2-4 suggestions/rappels concrets et actionnables tirés du contexte ;\n` +
    `3) une question ouverte pour lancer la journée.\n` +
    `Sois concis, zéro remplissage.`
  );
}

/** Génère le briefing du jour. */
export async function generateDailyBrief(deps: DailyBriefDeps, now: Date = new Date()): Promise<string> {
  let facts: readonly BriefFact[] = [];
  try {
    facts = deps.getFacts() ?? [];
  } catch {
    facts = [];
  }
  const brief = await deps.ask(buildBriefPrompt(facts, now), BRIEF_SYSTEM);
  return (brief || '').trim();
}

/** Dépendances par défaut (prod) : memory.getFacts + aiRouter.stream collecté. */
export async function defaultDailyBriefDeps(): Promise<DailyBriefDeps> {
  const [{ memory }, { aiRouter }] = await Promise.all([
    import('../../core/memory.js'),
    import('./ai-router.js'),
  ]);
  const getFacts = (): readonly BriefFact[] => {
    try {
      return memory.getFacts().slice(-30).reverse().map((f) => ({ category: f.category, text: f.text }));
    } catch {
      return [];
    }
  };
  const ask = async (prompt: string, system: string): Promise<string> => {
    let out = '';
    await aiRouter.stream([{ role: 'user', content: prompt }], system, (chunk) => {
      if (chunk.text) out += chunk.text;
    });
    return out.trim();
  };
  return { getFacts, ask };
}
