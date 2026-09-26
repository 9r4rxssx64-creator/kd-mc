/**
 * APEX v13 — Effort de raisonnement + affichage de la réflexion.
 *
 * Parité flagship 2026 (molette d'effort low/medium/high de Claude/Grok/Gemini +
 * "thinking display"). Approche SÛRE et provider-agnostique : on NE touche PAS au
 * cœur du streaming/routage IA (leçons #124/#129). À la place :
 *  - un réglage d'effort (`ax_settings.reasoning_effort`) qui NUDGE le system prompt
 *    (raisonnement plus/moins détaillé, exposé dans un bloc <thinking>…</thinking>) ;
 *  - un extracteur `extractThinking()` qui sépare la réflexion de la réponse pour un
 *    rendu repliable dans la bulle (updateAssistantBubble).
 *
 * Fonctionne avec TOUS les providers (le modèle émet le bloc dans le texte normal).
 */

export type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high';

const SETTINGS_KEY = 'ax_settings';
const FIELD = 'reasoning_effort';
const VALID: ReadonlySet<ReasoningEffort> = new Set(['auto', 'low', 'medium', 'high']);

function readSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const o = raw ? (JSON.parse(raw) as unknown) : {};
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getReasoningEffort(): ReasoningEffort {
  const v = readSettings()[FIELD];
  return typeof v === 'string' && VALID.has(v as ReasoningEffort) ? (v as ReasoningEffort) : 'auto';
}

export function setReasoningEffort(effort: ReasoningEffort): boolean {
  if (!VALID.has(effort)) return false;
  try {
    const s = readSettings();
    s[FIELD] = effort;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================================
 * Raisonnement NATIF Anthropic (extended thinking) — OPT-IN, OFF par défaut.
 * =========================================================================
 * Le mode ci-dessus (buildEffortInjection + extractThinking) est un nudge de
 * prompt provider-agnostique : il marche partout mais la « réflexion » est
 * simulée par le modèle dans le texte. Anthropic expose en plus un VRAI mode
 * `thinking` (blocs thinking_delta streamés séparément du texte). On le câble
 * derrière un flag SÉPARÉ (`apex_v13_native_thinking`), OFF par défaut, pour
 * ne PAS déstabiliser le cœur du streaming (leçons #124/#129) tant que Kevin
 * ne l'a pas testé sur son iPhone. Quand ON + effort='high' + provider
 * anthropic → le body ajoute `thinking:{type:'enabled', budget_tokens}` et le
 * parseSSE émet des events `thinking` distincts.
 */
const NATIVE_THINKING_KEY = 'apex_v13_native_thinking';
/** Budget de tokens de réflexion native (doit rester < max_tokens output). */
export const NATIVE_THINKING_BUDGET_TOKENS = 2000;

/** true si le raisonnement NATIF Anthropic est activé (flag opt-in, OFF par défaut). */
export function isNativeThinkingEnabled(): boolean {
  try {
    const v = localStorage.getItem(NATIVE_THINKING_KEY);
    return v === 'true' || v === '1';
  } catch {
    return false;
  }
}

/** Active/désactive le raisonnement NATIF Anthropic (persisté localStorage). */
export function setNativeThinkingEnabled(on: boolean): boolean {
  try {
    if (on) localStorage.setItem(NATIVE_THINKING_KEY, 'true');
    else localStorage.removeItem(NATIVE_THINKING_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Bloc à ajouter au system prompt selon l'effort choisi (vide si 'auto'). */
export function buildEffortInjection(effort: ReasoningEffort = getReasoningEffort()): string {
  switch (effort) {
    case 'high':
      return (
        '\n\n=== EFFORT DE RAISONNEMENT : ÉLEVÉ ===\n' +
        'AVANT ta réponse finale, expose ton raisonnement étape par étape à l\'intérieur ' +
        'd\'un unique bloc `<thinking>…</thinking>` (concis, en français). Puis donne la ' +
        'réponse finale APRÈS la balise fermante. Ne mets JAMAIS de secret/clé dans le bloc.\n' +
        '=== FIN EFFORT ==='
      );
    case 'medium':
      return (
        '\n\n=== EFFORT DE RAISONNEMENT : MOYEN ===\n' +
        'Si la question est non-triviale, expose un raisonnement bref dans un bloc ' +
        '`<thinking>…</thinking>` avant la réponse finale. Sinon réponds directement.\n' +
        '=== FIN EFFORT ==='
      );
    case 'low':
      return (
        '\n\n=== EFFORT DE RAISONNEMENT : DIRECT ===\n' +
        'Réponds directement et brièvement, sans détour ni bloc de réflexion.\n' +
        '=== FIN EFFORT ==='
      );
    case 'auto':
    default:
      return '';
  }
}

/**
 * Sépare la réflexion (`<thinking>…</thinking>`) de la réponse finale.
 * Tolérant : accepte <thinking>, <think>, ```thinking, et un bloc non fermé (streaming).
 * Retourne { thinking, answer } — thinking='' si aucun.
 */
export function extractThinking(text: string): { thinking: string; answer: string } {
  if (!text) return { thinking: '', answer: '' };
  /* Bloc balisé fermé */
  const tag = text.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
  if (tag) {
    const thinking = tag[1]!.trim();
    const answer = (text.slice(0, tag.index) + text.slice(tag.index! + tag[0].length)).trim();
    return { thinking, answer };
  }
  /* Fence ```thinking … ``` */
  const fence = text.match(/```think(?:ing)?\s*\n([\s\S]*?)```/i);
  if (fence) {
    const thinking = fence[1]!.trim();
    const answer = (text.slice(0, fence.index) + text.slice(fence.index! + fence[0].length)).trim();
    return { thinking, answer };
  }
  /* Bloc ouvert non fermé (pendant le streaming) : tout après <thinking> = réflexion en cours */
  const open = text.match(/<think(?:ing)?>([\s\S]*)$/i);
  if (open) {
    return { thinking: open[1]!.trim(), answer: text.slice(0, open.index).trim() };
  }
  return { thinking: '', answer: text };
}
