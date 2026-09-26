/* eslint-disable no-script-url -- tests vérifient explicitement le blocage de ce schéma */
/**
 * Tests agent-browser.ts (Kevin v13.4.3 — Shubham Skill #2).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { agentBrowser } from '../../services/integrations/agent-browser.js';

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn().mockImplementation((_msgs: unknown, _sys: unknown, onChunk: (c: { text?: string }) => void) => {
      onChunk({
        text: '{"summary":"Stratégie test","actions":[{"type":"click","selector":"#login","description":"Cliquer login"},{"type":"fill","selector":"input[name=email]","value":"test@test.com","description":"Email"}]}',
      });
      return Promise.resolve();
    }),
  },
}));

describe('Agent Browser (Shubham Skill)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    /* Mock fetch pour pas tenter network */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><form><input name="email"></form><button id="login">Login</button></html>'),
    }));
  });

  it('analyse une URL avec un objectif', async () => {
    const r = await agentBrowser.analyze('https://example.com', 'Se connecter');
    expect(r.url).toBe('https://example.com');
    expect(r.goal).toBe('Se connecter');
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.actions[0]?.type).toBe('click');
    expect(r.id).toMatch(/^agent_/);
  });

  it('refuse URL non-http', async () => {
    await expect(agentBrowser.analyze('javascript:alert(1)', 'X')).rejects.toThrow(/http/);
  });

  it('refuse URL ou objectif vide', async () => {
    await expect(agentBrowser.analyze('', 'goal')).rejects.toThrow(/URL/);
    await expect(agentBrowser.analyze('https://x.com', '')).rejects.toThrow(/Objectif/);
  });
});
