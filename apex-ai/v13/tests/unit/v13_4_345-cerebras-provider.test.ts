/**
 * v13.4.345 — Cerebras ajouté comme provider de failover (Kevin « intègre les IA gratuites »).
 * Invariants : cerebras enregistré partout MAIS anthropic reste en tête (premium admin
 * inchangé, leçon #124) ; jamais placé avant anthropic.
 */
import { describe, it, expect } from 'vitest';
import { ALL_PROVIDERS_LOGICAL } from '../../services/ai/ai-router.js';
import { PROXY_PROVIDERS } from '../../services/integrations/apex-secrets-proxy-client.js';

describe('v13.4.345 — Cerebras failover provider', () => {
  it('cerebras est enregistré dans la liste logique des providers', () => {
    expect(ALL_PROVIDERS_LOGICAL).toContain('cerebras');
  });

  it('anthropic reste EN TÊTE (premium admin préservé, leçon #124)', () => {
    expect(ALL_PROVIDERS_LOGICAL[0]).toBe('anthropic');
    const iAnthropic = ALL_PROVIDERS_LOGICAL.indexOf('anthropic');
    const iCerebras = ALL_PROVIDERS_LOGICAL.indexOf('cerebras');
    /* cerebras est un FAILOVER tardif → jamais avant anthropic */
    expect(iCerebras).toBeGreaterThan(iAnthropic);
  });

  it('cerebras est routable via le proxy (secret CEREBRAS_API_KEY)', () => {
    expect(PROXY_PROVIDERS).toContain('cerebras');
  });

  it('les providers historiques restent présents (aucune régression)', () => {
    for (const p of ['anthropic', 'openai', 'openrouter', 'groq', 'gemini', 'mistral']) {
      expect(ALL_PROVIDERS_LOGICAL).toContain(p);
    }
  });
});
