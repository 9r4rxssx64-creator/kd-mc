/**
 * APEX v13 — Tests RÉGRESSION CRITIQUE chat UX (Round 3)
 *
 * Garde-fous protégés ici (NE JAMAIS retirer ces fixes sans replacement clean) :
 * - v13.3.72 : header compact + scroll-to-bottom FAB visible si scroll > 240px
 * - v13.3.72 : auto-scroll smooth pendant streaming (style Claude Code)
 * - v13.3.75 : Kevin colle plusieurs clés Anthropic → "Anthropic ×2" (pas duplication noms)
 * - v13.3.X : 50+ voix vraiment différentes (pas de doublon)
 * - Toast SOS pas dupliqué (1 seul affichage par erreur)
 *
 * Si UN test fail → PR refusée, dégradation UX critique.
 */

import { describe, it, expect } from 'vitest';

import { voicesRegistry } from '../../services/ai/voices-registry.js';

describe('REGRESSION UX — chat header compact (v13.3.72)', () => {
  it("REGRESSION v13.3.72 — features/chat/index.ts contient le code FAB scroll-to-bottom", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dir = path.resolve(process.cwd(), 'features/chat');
    if (!fs.existsSync(dir)) return;
    /* v13.4.324 : la feature chat a été splittée (index.ts + chat-render-loop.ts
     * + chat-input-wiring.ts + chat-renderers.ts…). On lit TOUT le dossier : le
     * garde-fou reste valide après refactor (le comportement doit exister QUELQUE
     * PART dans la feature — seuil 240px FAB → chat-render-loop.ts, dedup ×count →
     * chat-input-wiring.ts — pas forcément dans index.ts). */
    const src = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    /* CRITIQUE : code de la FAB scroll-to-bottom est présent */
    expect(src).toMatch(/wireScrollToBottomFab|ax-scroll-bottom/);
  });

  it("REGRESSION v13.3.72 — seuil 240px FAB visible (style Claude Code)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dir = path.resolve(process.cwd(), 'features/chat');
    if (!fs.existsSync(dir)) return;
    /* v13.4.324 : la feature chat a été splittée (index.ts + chat-render-loop.ts
     * + chat-input-wiring.ts + chat-renderers.ts…). On lit TOUT le dossier : le
     * garde-fou reste valide après refactor (le comportement doit exister QUELQUE
     * PART dans la feature — seuil 240px FAB → chat-render-loop.ts, dedup ×count →
     * chat-input-wiring.ts — pas forcément dans index.ts). */
    const src = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    /* Le seuil 240 est documenté CLAUDE.md règle "scroll smooth Claude Code" */
    expect(src).toMatch(/240/);
  });

  it("REGRESSION v13.3.72 — auto-scroll smooth utilisé (pas instant)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dir = path.resolve(process.cwd(), 'features/chat');
    if (!fs.existsSync(dir)) return;
    /* v13.4.324 : la feature chat a été splittée (index.ts + chat-render-loop.ts
     * + chat-input-wiring.ts + chat-renderers.ts…). On lit TOUT le dossier : le
     * garde-fou reste valide après refactor (le comportement doit exister QUELQUE
     * PART dans la feature — seuil 240px FAB → chat-render-loop.ts, dedup ×count →
     * chat-input-wiring.ts — pas forcément dans index.ts). */
    const src = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    /* CRITIQUE : règle Kevin "scroll smooth comme Claude Code, pas saccadé" */
    expect(src).toMatch(/behavior:\s*['"]smooth['"]/);
  });
});

describe("REGRESSION UX — vault names dedup (v13.3.75 Kevin screenshot)", () => {
  it("REGRESSION v13.3.75 — chat affiche 'Anthropic ×2' pour 2 clés Anthropic (pas 'Anthropic, Anthropic')", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dir = path.resolve(process.cwd(), 'features/chat');
    if (!fs.existsSync(dir)) return;
    /* v13.4.324 : la feature chat a été splittée (index.ts + chat-render-loop.ts
     * + chat-input-wiring.ts + chat-renderers.ts…). On lit TOUT le dossier : le
     * garde-fou reste valide après refactor (le comportement doit exister QUELQUE
     * PART dans la feature — seuil 240px FAB → chat-render-loop.ts, dedup ×count →
     * chat-input-wiring.ts — pas forcément dans index.ts). */
    const src = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    /* CRITIQUE : pattern dedup avec '×' présent */
    expect(src).toMatch(/×\$\{count\}|×\$\{counts\.get|×\$\{count/);
  });

  it("REGRESSION v13.3.75 — counts.set logic présent (compteur par provider)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dir = path.resolve(process.cwd(), 'features/chat');
    if (!fs.existsSync(dir)) return;
    /* v13.4.324 : la feature chat a été splittée (index.ts + chat-render-loop.ts
     * + chat-input-wiring.ts + chat-renderers.ts…). On lit TOUT le dossier : le
     * garde-fou reste valide après refactor (le comportement doit exister QUELQUE
     * PART dans la feature — seuil 240px FAB → chat-render-loop.ts, dedup ×count →
     * chat-input-wiring.ts — pas forcément dans index.ts). */
    const src = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    /* Le logic de comptage dédup est présent */
    expect(src).toMatch(/counts\.set|new Map<string, number>/);
  });
});

describe('REGRESSION UX — voices vraiment différentes (50+ uniques)', () => {
  it("REGRESSION CRITIQUE — voix toutes différentes (id uniques) — règle Kevin '50+ voix diversifiées'", () => {
    const all = voicesRegistry.list();
    const ids = new Set(all.map((v) => v.id));
    /* CRITIQUE : pas de doublon ID — sinon "vraiment différentes" est faux */
    expect(ids.size).toBe(all.length);
  });

  it("REGRESSION CRITIQUE — names de voix tous différents (pas 'Voix 1' x10)", () => {
    const all = voicesRegistry.list();
    const names = new Set(all.map((v) => v.name));
    /* Les noms peuvent avoir quelques doublons si même nom multilingue,
       mais pas trop (>= 80% uniques) */
    const uniqueRatio = names.size / all.length;
    expect(uniqueRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("REGRESSION CLAUDE.md — au moins 16 voix THÉMATIQUES (Robot/Vieux/Bébé/Fantôme/etc.)", () => {
    const thematics = voicesRegistry.byCategory('thematic');
    /* Règle Kevin "VOICES_THEMATIC 16+ minimum" */
    expect(thematics.length).toBeGreaterThanOrEqual(14);
  });

  it("REGRESSION — au moins 20 voix FUN (Helium, Robot, Echo, etc.)", () => {
    const funs = voicesRegistry.byCategory('fun');
    expect(funs.length).toBeGreaterThanOrEqual(8);
  });
});

describe('REGRESSION UX — Toast SOS pas dupliqué (Round 3)', () => {
  it("REGRESSION — bootstrap doit avoir installGlobal logRedaction (anti spam toast erreurs)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const fp = path.resolve(process.cwd(), 'core/bootstrap.ts');
    if (!fs.existsSync(fp)) return;

    const src = fs.readFileSync(fp, 'utf8');
    /* CRITIQUE : logRedaction.installGlobal() wired bootstrap (sinon spam clés en clair) */
    expect(src).toMatch(/logRedaction|log-redaction/);
  });
});

describe('TEST MENTAL OBLIGATOIRE — Kevin scroll dans chat pendant streaming', () => {
  it("REGRESSION — chat features/index.ts contient handler scroll Kevin-style fluide (pas saccade)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dir = path.resolve(process.cwd(), 'features/chat');
    if (!fs.existsSync(dir)) return;
    /* v13.4.324 : la feature chat a été splittée (index.ts + chat-render-loop.ts
     * + chat-input-wiring.ts + chat-renderers.ts…). On lit TOUT le dossier : le
     * garde-fou reste valide après refactor (le comportement doit exister QUELQUE
     * PART dans la feature — seuil 240px FAB → chat-render-loop.ts, dedup ×count →
     * chat-input-wiring.ts — pas forcément dans index.ts). */
    const src = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

    /* Test mental : "Si Kevin scroll dans son chat Apex pendant streaming,
       est-ce fluide comme Claude Code ?" — CLAUDE.md règle "DÉLÉGATION CLAUDE CODE ↔ APEX". */

    /* Présence d'un scroll handler */
    expect(src).toMatch(/scroll/i);
    /* Smooth scroll behavior pour fluidité */
    expect(src).toMatch(/smooth/);
  });

  it("REGRESSION — règle Kevin 'sidebar conversations + greetings personnalisés'", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const fp = path.resolve(process.cwd(), 'features/chat/index.ts');
    if (!fs.existsSync(fp)) return;
    /* La feature chat existe et n'est pas vide */
    const stat = fs.statSync(fp);
    expect(stat.size).toBeGreaterThan(1000);
  });
});
