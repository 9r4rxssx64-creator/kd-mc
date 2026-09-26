/**
 * APEX v13.4.365 — Non-régression « system too long » (Kevin 2026-09-05).
 *
 * ── Le bug ──────────────────────────────────────────────────────────────────
 * Écran Kevin : « Apex pré-envoi invalide : system too long (33635 > 32000) ».
 * Apex refusait TOUT message, même « Test ». Panne totale.
 *
 * La valeur 32000 était écrite en dur DEUX FOIS :
 *   - `core/memory.ts`          → le corps se plafonnait tout seul
 *   - `services/ai/ai-router.ts` → le validateur mesurait la chaîne FINALE
 * Entre les deux, `chat-engine` concaténait les injections (Projet actif,
 * Assistant personnalisé, effort, RAG, mémoire compacte). Personne ne les
 * comptait : le corps respectait son budget, le validateur voyait plus gros.
 * 33635 − 32000 = 1635 chars = exactement le poids des ajouts.
 *
 * ── Ce que ces tests verrouillent ───────────────────────────────────────────
 * 1. La valeur vit à UN seul endroit (garde de contenu, leçon #142 : un test
 *    d'égalité ne suffit pas, il faut interdire la re-déclaration).
 * 2. Le budget du corps RÉSERVE la place des ajouts.
 * 3. L'identité garde toujours un plancher (règle « Apex n'oublie jamais
 *    personne ») même si un Projet est bavard.
 * 4. Le filet final borne la chaîne quoi qu'on y ajoute demain.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  MAX_SYSTEM_PROMPT_CHARS,
  SYSTEM_PROMPT_BODY_FLOOR,
  TRUNCATION_MARKER,
  budgetForBody,
  capSystemPrompt,
  remainingBudget,
} from '../../core/prompt-budget.js';

/** Le dépassement réel mesuré sur l'écran de Kevin le 2026-09-05. */
const KEVIN_OVERFLOW_CHARS = 33635 - 32000; /* 1635 */

/**
 * Lit un fichier source du projet.
 * `import.meta.url` n'est pas un chemin fichier sous l'environnement jsdom des
 * tests → on résout depuis le cwd, que vitest soit lancé depuis apex-ai/v13 ou
 * depuis la racine du dépôt.
 */
function readSource(relPath: string): string {
  for (const base of ['.', 'apex-ai/v13']) {
    const p = resolve(process.cwd(), base, relPath);
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error(`Source introuvable : ${relPath} (cwd=${process.cwd()})`);
}

describe('v13.4.365 — Budget prompt système : source unique', () => {
  it('ai-router NE redéclare PAS la constante en dur (sinon les 2 étages divergent)', () => {
    const src = readSource('services/ai/ai-router.ts');
    /* La re-déclaration locale est EXACTEMENT ce qui a causé la panne. */
    expect(src).not.toMatch(/const\s+MAX_SYSTEM_PROMPT_CHARS\s*=/);
    expect(src).toMatch(/import\s*\{[^}]*MAX_SYSTEM_PROMPT_CHARS[^}]*\}\s*from\s*'\.\.\/\.\.\/core\/prompt-budget\.js'/);
  });

  it('memory NE redéclare PAS son propre plafond (MAX_PROMPT_TOKENS * 4)', () => {
    const src = readSource('core/memory.ts');
    expect(src).not.toMatch(/MAX_PROMPT_TOKENS\s*\*\s*4/);
    expect(src).toMatch(/budgetForBody/);
  });

  it('chat-engine applique le filet final au dernier point de mutation', () => {
    const src = readSource('features/chat/chat-engine.ts');
    expect(src).toMatch(/capSystemPrompt\(sysPrompt\)/);
    /* L'injection doit être mesurée AVANT le corps, pas collée après coup. */
    expect(src).toMatch(/memory\.buildSystemPromptDeep\(user,\s*injection\.length\)/);
  });
});

describe('v13.4.365 — budgetForBody réserve la place des ajouts', () => {
  it('sans ajout : le corps dispose du budget entier', () => {
    expect(budgetForBody(0)).toBe(MAX_SYSTEM_PROMPT_CHARS);
    expect(budgetForBody()).toBe(MAX_SYSTEM_PROMPT_CHARS);
  });

  it('LE CAS KEVIN : corps + injection de 1635 chars tient sous le plafond', () => {
    const body = 'X'.repeat(budgetForBody(KEVIN_OVERFLOW_CHARS));
    const injection = 'Y'.repeat(KEVIN_OVERFLOW_CHARS);
    const final = body + injection;
    /* AVANT le fix : 32000 + 1635 = 33635 → routeur refuse → Apex muet. */
    expect(final.length).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_CHARS);
  });

  it('injection énorme : le corps garde son plancher (identité non-droppable)', () => {
    expect(budgetForBody(999_999)).toBe(SYSTEM_PROMPT_BODY_FLOOR);
    expect(budgetForBody(999_999)).toBeGreaterThan(0);
  });

  it('entrées aberrantes : jamais de budget négatif ni NaN', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const b = budgetForBody(bad as number);
      expect(Number.isFinite(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(SYSTEM_PROMPT_BODY_FLOOR);
      expect(b).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_CHARS);
    }
  });
});

describe('v13.4.365 — capSystemPrompt : filet final', () => {
  it('borne une chaîne trop longue et signale la coupe (jamais silencieuse)', () => {
    const capped = capSystemPrompt('X'.repeat(40000));
    expect(capped.length).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_CHARS);
    expect(capped.endsWith(TRUNCATION_MARKER)).toBe(true);
  });

  it('laisse intacte une chaîne qui tient', () => {
    const ok = 'Apex identité Kevin';
    expect(capSystemPrompt(ok)).toBe(ok);
  });

  it('résiste aux entrées non-string (fail-open, jamais de crash)', () => {
    expect(capSystemPrompt(null as unknown as string)).toBe('');
    expect(capSystemPrompt(undefined as unknown as string)).toBe('');
  });

  it('pile à la limite : aucune troncature parasite', () => {
    const exact = 'X'.repeat(MAX_SYSTEM_PROMPT_CHARS);
    expect(capSystemPrompt(exact)).toBe(exact);
  });
});

describe('v13.4.365 — remainingBudget pilote les blocs optionnels', () => {
  it('un bloc qui tient est acceptable, un bloc trop gros est refusé', () => {
    const sys = 'X'.repeat(MAX_SYSTEM_PROMPT_CHARS - 100);
    expect(remainingBudget(sys)).toBe(100);
    expect(50 + 2 <= remainingBudget(sys)).toBe(true);   /* petit bloc RAG : OK */
    expect(500 + 2 <= remainingBudget(sys)).toBe(false); /* gros bloc : omis   */
  });

  it('jamais négatif si la chaîne dépasse déjà', () => {
    expect(remainingBudget('X'.repeat(50000))).toBe(0);
  });
});
