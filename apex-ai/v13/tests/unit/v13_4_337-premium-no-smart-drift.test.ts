/**
 * v13.4.337 — Régression : en mode 'premium'/'forced', le smart-router NE DOIT PAS
 * ré-ordonner la chaîne et remettre openai en tête (drift que premium corrige).
 *
 * Kevin 2026-06-19 « toujours openai » : v336 mettait decision.primary=anthropic en
 * premium, mais buildPolicyAwareChain appliquait le PREFIX smart-router AVANT
 * push(decision.primary) → openai (scoré haut après quelques succès) repassait en
 * tête. Le fix saute le prefix smart-router quand le mode est explicite (premium/forced).
 *
 * Ce test reproduit le drift en 'auto' (chain[0]=openai) puis prouve qu'il disparaît
 * en 'premium' (chain[0]=anthropic), avec un smart-router mocké qui préfère openai.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* smart-router mocké : préfère TOUJOURS openai avec un score élevé (>50). */
vi.mock('../../services/ai/smart-router.js', () => ({
  smartRouter: {
    getBest: vi.fn(async () => 'openai'),
    scoreProvider: vi.fn(async () => ({ total: 90 })),
    getOverride: vi.fn(() => null),
  },
}));

import { aiRouter } from '../../services/ai/ai-router.js';

type ChainFn = (messages: Array<{ role: string; content: string }>) => Promise<readonly string[]>;
const buildChain = (
  aiRouter as unknown as { buildPolicyAwareChain: ChainFn }
).buildPolicyAwareChain.bind(aiRouter);

const MESSAGES = [{ role: 'user', content: 'Bonjour, peux-tu m\'aider ?' }];

describe('v13.4.337 — premium/forced ignore le prefix smart-router', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mode auto : le smart-router peut dériver vers openai (reproduction du bug)', async () => {
    localStorage.setItem('apex_v13_routing_mode', 'auto');
    const chain = await buildChain(MESSAGES);
    expect(chain[0]).toBe('openai');
    expect(chain).toContain('anthropic');
  });

  it('mode premium : Anthropic reste EN TÊTE malgré le smart-router pro-openai', async () => {
    localStorage.setItem('apex_v13_routing_mode', 'premium');
    const chain = await buildChain(MESSAGES);
    expect(chain[0]).toBe('anthropic');
  });

  it('admin kdmc_admin par défaut = free-smart : question simple → IA gratuite, JAMAIS le drift openai (v13.4.362)', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    const chain = await buildChain(MESSAGES);
    /* v13.4.362 : défaut admin = free-smart. « Bonjour » = domaine general (simple)
     * → provider gratuit en tête. Le smart-router (pro-openai) reste SKIP → 0 drift. */
    expect(chain[0]).not.toBe('openai');
    expect(['qwen', 'gemini', 'groq', 'openrouter']).toContain(chain[0]); /* v13.4.366 : qwen = gratuit en tête */
    /* Anthropic toujours joignable en secours */
    expect(chain).toContain('anthropic');
  });

  it('mode forced openai : openai en tête (choix admin explicite respecté)', async () => {
    localStorage.setItem('apex_v13_routing_mode', 'forced');
    localStorage.setItem('apex_v13_routing_forced_provider', 'openai');
    const chain = await buildChain(MESSAGES);
    expect(chain[0]).toBe('openai');
  });

  /* v13.4.338 — cause racine réelle de « toujours openai » malgré v337 :
   * un mode 'economy' posé AUTOMATIQUEMENT (apex-self-audit, sans flag explicite)
   * était honoré AVANT le défaut premium → l'admin n'était pas en premium → drift.
   * Le fix : pour l'admin, un mode stocké NON explicite est ignoré → premium. */
  it('admin + economy AUTO (sans flag explicite) → IGNORÉ → défaut free-smart (pas de drift openai)', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_routing_mode', 'economy'); /* posé par auto-fix, pas de flag */
    const chain = await buildChain(MESSAGES);
    /* Le mode auto-fix non-explicite est ignoré → défaut admin free-smart. Question
     * simple → gratuit en tête, openai jamais préfixé (le drift que v337/362 corrigent). */
    expect(chain[0]).not.toBe('openai');
    expect(['qwen', 'gemini', 'groq', 'openrouter']).toContain(chain[0]); /* v13.4.366 : qwen = gratuit en tête */
    expect(chain).toContain('anthropic');
  });

  it('admin + economy EXPLICITE (flag) → honoré (choix user respecté, leçon #124)', async () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_routing_mode', 'economy');
    localStorage.setItem('apex_v13_routing_mode_explicit', '1'); /* Kevin a choisi via ⚡ */
    const { aiRoutingPolicy } = await import('../../services/ai/ai-routing-policy.js');
    expect(aiRoutingPolicy.getMode()).toBe('economy');
  });

  it('setMode(mode, true) pose le flag explicite ; setMode(mode) le retire', async () => {
    const { aiRoutingPolicy } = await import('../../services/ai/ai-routing-policy.js');
    aiRoutingPolicy.setMode('premium', true);
    expect(localStorage.getItem('apex_v13_routing_mode_explicit')).toBe('1');
    aiRoutingPolicy.setMode('economy'); /* auto (non explicite) */
    expect(localStorage.getItem('apex_v13_routing_mode_explicit')).toBeNull();
  });

  it('client (non-admin) + economy stocké → honoré (comportement inchangé)', async () => {
    localStorage.setItem('apex_v13_uid', 'laurence_sp');
    localStorage.setItem('apex_v13_routing_mode', 'economy');
    const { aiRoutingPolicy } = await import('../../services/ai/ai-routing-policy.js');
    expect(aiRoutingPolicy.getMode()).toBe('economy');
  });
});
