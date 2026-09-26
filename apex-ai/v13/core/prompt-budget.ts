/**
 * APEX v13 — Budget du prompt système : SOURCE UNIQUE.
 *
 * ── Pourquoi ce fichier existe (bug Kevin 2026-09-05, v13.4.364) ────────────
 *
 * Symptôme : « Apex pré-envoi invalide : system too long (33635 > 32000) ».
 * Apex refusait TOUT message, même « Test ». Panne totale, pas dégradée.
 *
 * Cause racine : la valeur 32000 était écrite DEUX FOIS, à deux étages qui ne
 * voyaient pas la même chaîne.
 *
 *   1. `memory.buildSystemPromptDeep()` se plafonnait à 32000 — et par
 *      construction ne pouvait PAS dépasser (son `addIfRoom` refuse d'ajouter
 *      une section qui ne rentre pas).
 *   2. `chat-engine` AJOUTAIT ensuite, après ce plafond :
 *        - les instructions du Projet actif       (projects.buildInjection)
 *        - celles de l'Assistant personnalisé      (customAssistants)
 *        - le nudge d'effort de raisonnement       (buildEffortInjection)
 *        - le bloc RAG                             (apexMemoryRag, défaut OFF)
 *        - la mémoire compacte                     (compactMemory, défaut OFF)
 *   3. `ai-router.validateRequest()` mesurait le TOTAL et refusait.
 *
 * Personne ne comptait l'étape 2. Le producteur respectait le budget, le
 * validateur mesurait une chaîne devenue plus grosse. 33635 − 32000 = 1635
 * caractères : exactement le poids des ajouts. Il a suffi que Kevin active un
 * Projet pour bricker Apex.
 *
 * ── Ce que ce module garantit ───────────────────────────────────────────────
 *
 * UNE constante, importée par les deux étages (leçon #142 : une valeur métier
 * dupliquée diverge toujours — il faut la nommer une fois et l'importer).
 * `budgetForBody()` réserve la place des ajouts AVANT de construire le corps,
 * et `capSystemPrompt()` est le filet final au dernier point de mutation :
 * quoi qu'on ajoute demain, la chaîne envoyée ne peut plus dépasser.
 *
 * NOTE sur la valeur elle-même : 32000 chars ≈ 8000 tokens. Le commentaire
 * d'origine la justifiait par « Anthropic Sonnet 4.6 : 200K context » — Sonnet
 * 4.6 et Opus 5 sont aujourd'hui à 1M de contexte, donc ce plafond représente
 * moins de 1 % de ce que le modèle accepte. Il reste VOLONTAIREMENT conservateur
 * ici (un prompt système stable se met en cache : le garder compact coûte peu et
 * protège les fournisseurs de repli, plus étroits, en fin de chaîne). Le relever
 * est une décision de réglage à part — ça n'aurait PAS corrigé la panne, juste
 * déplacé le mur de quelques semaines.
 */

/**
 * Plafond dur du prompt système envoyé au fournisseur, en caractères.
 * Contrôlé par `ai-router.validateRequest()` sur la chaîne FINALE.
 */
export const MAX_SYSTEM_PROMPT_CHARS = 32000;

/**
 * Plancher garanti au corps construit par `memory.buildSystemPromptDeep()`.
 *
 * Même si les injections sont énormes, le corps garde cette place : l'identité
 * Apex/Kevin/Laurence est NON-DROPPABLE (règle absolue « Apex n'oublie jamais
 * personne »). Sans ce plancher, un Projet bavard pourrait réduire le budget
 * du corps à zéro et faire oublier à Apex qui est Kevin.
 */
export const SYSTEM_PROMPT_BODY_FLOOR = 8000;

/** Marqueur visible quand on a dû couper — jamais de troncature silencieuse. */
export const TRUNCATION_MARKER = '\n[…tronqué : budget prompt système atteint]';

/**
 * Budget alloué au corps du prompt, une fois réservée la place des ajouts.
 *
 * @param reserveChars Poids des blocs qui seront concaténés APRÈS le corps.
 * @returns Nombre de caractères que le corps peut occuper (≥ plancher).
 */
export function budgetForBody(reserveChars = 0): number {
  const reserve = Number.isFinite(reserveChars) && reserveChars > 0 ? Math.floor(reserveChars) : 0;
  return Math.max(SYSTEM_PROMPT_BODY_FLOOR, MAX_SYSTEM_PROMPT_CHARS - reserve);
}

/**
 * Filet final, au DERNIER point de mutation, juste avant l'envoi.
 *
 * À appeler après TOUTE concaténation. C'est la garantie architecturale : peu
 * importe ce qu'une future feature ajoutera au prompt, la panne « system too
 * long » ne peut plus se reproduire.
 *
 * @returns La chaîne, tronquée avec un marqueur visible si elle dépassait.
 */
export function capSystemPrompt(system: string): string {
  if (typeof system !== 'string') return '';
  if (system.length <= MAX_SYSTEM_PROMPT_CHARS) return system;
  const keep = MAX_SYSTEM_PROMPT_CHARS - TRUNCATION_MARKER.length;
  return system.slice(0, Math.max(0, keep)) + TRUNCATION_MARKER;
}

/**
 * Ce qui reste comme place pour un bloc supplémentaire.
 * Permet d'ajouter un bloc optionnel (RAG, mémoire compacte) SEULEMENT s'il
 * tient — plutôt que de l'ajouter puis de le voir tronqué en aveugle.
 */
export function remainingBudget(current: string): number {
  return Math.max(0, MAX_SYSTEM_PROMPT_CHARS - (current?.length ?? 0));
}
