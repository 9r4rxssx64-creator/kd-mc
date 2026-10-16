/**
 * E2E Memory Injection — Validation chain mémoire bout-en-bout
 *
 * Mission Kevin v13.0.20 (audit subagent : "Mémoire 10/20 — store OK mais E2E injection NON testée")
 *
 * Chain testée :
 *   chat.buildSystemPrompt()
 *     → memory.buildSystemPromptContext(user)
 *     → load apex_v13_persistent_memory localStorage (top 50 importance)
 *     → return string complet (KDMC projects + facts + lessons + persistent + capabilities)
 *   aiRouter.stream(messages, system, ...)
 *     → fetch Anthropic body { system: <complete system prompt> }
 *
 * (Note path : placé dans tests/unit/ car vitest config exclut tests/e2e/ — réservé Playwright.
 * Ce test reste un E2E logique de la CHAIN mémoire, exécuté via vitest pour intégration coverage.)
 */
import { it, expect, vi, beforeEach, describe } from 'vitest';

import { memory } from '../../core/memory.js';
import { aiRouter } from '../../services/ai/ai-router.js';

describe('E2E Memory Injection chain (mémoire persistante → system prompt → Anthropic body)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    memory.reload();
  });

  it('mémoire persistante injectée dans system prompt envoyé Anthropic', () => {
    /* Setup persistent-memory localStorage (clé apex_v13_persistent_memory) */
    const memEntries = [
      {
        id: 'm1',
        category: 'profile',
        text: 'Kevin DESARZENS, admin Casino Monaco',
        importance: 100,
        ts: Date.now(),
      },
      {
        id: 'm2',
        category: 'projects',
        text: 'Apex v13 + CMCteams + KDMC',
        importance: 90,
        ts: Date.now(),
      },
    ];
    localStorage.setItem('apex_v13_persistent_memory', JSON.stringify(memEntries));

    /* Build system prompt via memory.buildSystemPromptContext (chain réelle) */
    const sysPrompt = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });

    /* Vérifier que les memEntries text sont DANS le sysPrompt */
    expect(sysPrompt).toContain('Kevin DESARZENS, admin Casino Monaco');
    expect(sysPrompt).toContain('Apex v13 + CMCteams + KDMC');

    /* Vérifier mention 'mémoire persistante cross-session' */
    expect(sysPrompt.toLowerCase()).toContain('mémoire persistante');

    /* Vérifier instruction explicite IA "VRAIE MÉMOIRE" anti-hallucination */
    expect(sysPrompt).toContain('VRAIE MÉMOIRE');
  });

  it('aiRouter.stream envoie le system prompt complet à Anthropic body', async () => {
    /* Mock fetch pour capturer body envoyé (provider Anthropic) */
    const fetchMock = vi.fn(
      async () =>
        new Response(
          'event: message_start\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"OK"}}\n\nevent: message_stop\ndata: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' }, status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    /* Clé Anthropic non-chiffrée (pas AXENC1: prefix → bypass vault decrypt) */
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-' + 'X'.repeat(100));

    const SYSTEM_PROMPT = 'CONTEXTE SYSTEM TEST avec MÉMOIRE PERSISTANTE Kevin DESARZENS Casino Monaco';

    await aiRouter.stream(
      [{ role: 'user', content: 'test' }],
      SYSTEM_PROMPT,
      () => {
        /* noop chunk handler */
      },
    );

    /* Vérifier fetch appelé au moins 1× */
    expect(fetchMock).toHaveBeenCalled();

    /* Capturer body de l'appel Anthropic (premier call qui matche endpoint) */
    let anthropicBodyParsed: { system?: string; messages?: unknown[] } | null = null;
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      const init = call[1] as RequestInit | undefined;
      if (url.includes('api.anthropic.com') && init?.body) {
        anthropicBodyParsed = JSON.parse(String(init.body)) as {
          system?: string;
          messages?: unknown[];
        };
        break;
      }
    }

    expect(anthropicBodyParsed).not.toBeNull();
    /* Vérifier que body.system contient le system prompt complet
     * (preuve E2E : chat → aiRouter → fetch Anthropic transmet bien le system param)
     * Anthropic prompt caching : system est un array [{type:'text', text:'...', cache_control:{type:'ephemeral'}}] */
    const systemText = Array.isArray(anthropicBodyParsed?.system)
      ? (anthropicBodyParsed.system as Array<{ text?: string }>).map((b) => b.text ?? '').join('\n')
      : String(anthropicBodyParsed?.system ?? '');
    expect(systemText).toContain('CONTEXTE SYSTEM TEST');
    expect(systemText).toContain('MÉMOIRE PERSISTANTE');
    expect(systemText).toContain('Kevin DESARZENS');
  });

  it('chain complète : persistent-memory → buildSystemPromptContext → aiRouter → Anthropic body', async () => {
    /* Setup persistent-memory réelle */
    const memEntries = [
      {
        id: 'fact_kevin',
        category: 'profile',
        text: 'Kevin admin Casino Monaco identifiant kdmc_admin',
        importance: 100,
        ts: Date.now(),
      },
    ];
    localStorage.setItem('apex_v13_persistent_memory', JSON.stringify(memEntries));

    /* Mock fetch Anthropic */
    const fetchMock = vi.fn(
      async () =>
        new Response(
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"OK"}}\n\ndata: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' }, status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-' + 'Y'.repeat(100));

    /* Build system prompt via memory (réel — pas mocké) */
    const sys = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });

    /* Stream via aiRouter (réel) */
    await aiRouter.stream([{ role: 'user', content: 'who am I?' }], sys, () => {
      /* noop */
    });

    /* Vérifier fetch reçu Anthropic body avec persistent-memory entry inside system param */
    let bodyParsed: { system?: string } | null = null;
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      const init = call[1] as RequestInit | undefined;
      if (url.includes('api.anthropic.com') && init?.body) {
        bodyParsed = JSON.parse(String(init.body)) as { system?: string };
        break;
      }
    }
    expect(bodyParsed).not.toBeNull();
    /* Persistent memory entry doit traverser TOUTE la chain jusqu'au body fetch Anthropic */
    const systemText2 = Array.isArray(bodyParsed?.system)
      ? (bodyParsed.system as Array<{ text?: string }>).map((b) => b.text ?? '').join('\n')
      : String(bodyParsed?.system ?? '');
    expect(systemText2).toContain('Kevin admin Casino Monaco');
  });
});
