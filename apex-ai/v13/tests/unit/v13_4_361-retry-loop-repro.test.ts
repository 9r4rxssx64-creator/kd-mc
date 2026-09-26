/**
 * v13.4.361 — Reproduction du bug "IA bloquée sur Retry auto dans 3s" (Kevin screenshot 17:45).
 *
 * Symptôme : Kevin tape "test" 1×, l'IA affiche "🛠 Serveur Anthropic en panne, je bascule
 * failover OpenRouter/Groq… ⏳ Retry auto dans 3s…" et RESTE bloquée ; 3 bulles "test"
 * s'empilent (= le retry re-queue le message, chaque tour pushant une NOUVELLE bulle user,
 * SANS cap → boucle infinie tant que le provider est en 5xx).
 *
 * On pilote le VRAI processQueue avec un aiRouter mocké qui simule "tous providers en panne 5xx"
 * en émettant onError SANS texte streamé (le cas EXACT du screenshot).
 *
 * AVANT fix : userBubbles grimpe (2, 3, …) + stream rappelé sans limite.
 * APRÈS fix : 1 seule bulle user, ≤1 retry auto, message final CLAIR (pas figé sur "Retry auto").
 *
 * NB : timers RÉELS (le retry interne est un setTimeout 3s ; les fake timers cassent la
 * chaîne async interne de processQueue → 0 bulle, cf. debug). On borne les attentes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '../../core/store.js';

let _streamImpl: (
  messages: unknown,
  system: string,
  onChunk: (c: { text?: string; done?: boolean; provider?: string }) => void,
  onError?: (e: Error) => void,
) => Promise<void> = async () => {};

vi.mock('../../services/ai/ai-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ai/ai-router.js')>();
  return {
    ...actual,
    aiRouter: new Proxy(actual.aiRouter, {
      get(target, prop, receiver) {
        if (prop === 'stream') {
          return (m: unknown, s: string, oc: (c: never) => void, oe?: (e: Error) => void) =>
            _streamImpl(m, s, oc as never, oe);
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    }),
  };
});

import type { DisplayMessage } from '../../features/chat/index.js';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function drive(
  impl: typeof _streamImpl,
): Promise<{ conv: DisplayMessage[] }> {
  _streamImpl = impl;
  const { setEngineState, processQueue } = await import('../../features/chat/chat-engine.js');
  const conv: DisplayMessage[] = [];
  const queue: string[] = ['test'];
  setEngineState(conv, queue, [], []);
  await processQueue(document.getElementById('apex-root')!);
  return { conv };
}

describe('v13.4.361 — retry loop reproduction + fix', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    store.init({ appVer: 'v13.4.361' });
    store.set('user', { id: 'kdmc_admin', name: 'Kevin', tier: 'admin' });
    store.set('isAdmin', true);
  });

  it('A) onError 5xx SANS texte : jamais bloqué "Retry auto", pas d\'empilement de bulles user', async () => {
    let calls = 0;
    const { conv } = await drive(async (_m, _s, _oc, onError) => {
      calls += 1;
      onError?.(new Error('anthropic HTTP 503 service unavailable'));
    });

    /* Laisse largement le temps à 1 retry (3s) + une éventuelle boucle de s'exprimer. */
    await wait(4200);

    const userBubbles = conv.filter((m) => m.role === 'user');
    const assistantBubbles = conv.filter((m) => m.role === 'assistant');
    const lastA = assistantBubbles[assistantBubbles.length - 1];

    /* FIX : 1 seule bulle user (pas 2/3/…), stream ≤ 2 fois (1 + 1 retry cap),
     * message final clair (ne reste PAS sur "Retry auto dans 3s"), pas de streaming figé. */
    expect(userBubbles.length).toBe(1);
    expect(calls).toBeLessThanOrEqual(2);
    expect(lastA).toBeTruthy();
    expect(lastA!.text).not.toContain('Retry auto dans 3s');
    expect(lastA!.text.length).toBeGreaterThan(10);
    expect(store.get('isStreaming')).toBe(false);
  }, 15000);

  it('B) fallback texte + onError : réponse dégradée préservée, aucun retry', async () => {
    let calls = 0;
    const { conv } = await drive(async (_m, _s, onChunk, onError) => {
      calls += 1;
      onChunk({ text: 'Apex est temporairement en mode dégradé. Vérifie le Coffre 🔐.', done: false, provider: 'anthropic' });
      onChunk({ text: '', done: true, provider: 'anthropic' });
      onError?.(new Error('anthropic HTTP 500 internal server'));
    });
    await wait(4200);

    const userBubbles = conv.filter((m) => m.role === 'user');
    expect(userBubbles.length).toBe(1);
    expect(calls).toBe(1);
    const lastA = conv.filter((m) => m.role === 'assistant').pop();
    expect(lastA!.text).toContain('mode dégradé');
    expect(store.get('isStreaming')).toBe(false);
  }, 15000);
});
