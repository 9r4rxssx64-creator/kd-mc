/**
 * v13.4.340 — le skip « no key » silencieux ne doit plus exister quand le proxy est ON.
 *
 * Cause racine « toujours openai » (après v337/v338/v339) : sans clé locale,
 * streamWithKeyFailover exigeait proxyCoversProvider() = health RÉSEAU ; getProxyHealth
 * ne cache que les succès → un health raté au 1er provider (anthropic) le skippait
 * « no key » en silence, le health RETENTÉ pour openai réussissait → openai répond.
 * Répété → anthropic DEAD 1h → badge openai permanent.
 *
 * Fix : flag proxy ON → tentative OPTIMISTE (l'erreur réelle, s'il y en a une, est
 * capturée par last-ai-fail et visible au Diagnostic). Flag OFF → comportement
 * historique (« no key »), désormais capturé aussi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRouter } from '../../services/ai/ai-router.js';
import { getLastAiFails } from '../../services/ai/last-ai-fail.js';

type StreamOk = { status: string; provider?: string };
interface RouterPrivates {
  streamWithKeyFailover(
    provider: string,
    messages: Array<{ role: string; content: string }>,
    system: string,
    onChunk: (c: unknown) => void,
    signal: AbortSignal,
  ): Promise<StreamOk>;
  getApiKeyWithId(provider: string): Promise<null>;
  getApiKeyDecrypted(provider: string): Promise<string>;
  proxyCoversProvider(provider: string): Promise<boolean>;
  streamFromProvider(...args: unknown[]): Promise<unknown>;
}
const router = aiRouter as unknown as RouterPrivates;

const MSGS = [{ role: 'user', content: 'ping' }];

describe('v13.4.340 — no-key optimiste (flag proxy ON)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* multi-key vault vide + pas de clé legacy + health proxy KO ponctuel */
    vi.spyOn(router, 'getApiKeyWithId').mockResolvedValue(null);
    vi.spyOn(router, 'getApiKeyDecrypted').mockResolvedValue('');
    vi.spyOn(router, 'proxyCoversProvider').mockResolvedValue(false);
  });
  afterEach(() => {
    vi.restoreAllMocks(); /* leçon #84 : spies sur singleton TOUJOURS restaurés */
  });

  it('flag proxy ON + health KO → tente QUAND MÊME streamFromProvider (pas de skip muet)', async () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    const streamSpy = vi.spyOn(router, 'streamFromProvider').mockResolvedValue({
      assistantText: 'ok',
      toolUses: [],
    });
    const r = await router.streamWithKeyFailover('anthropic', MSGS, 'sys', () => {}, new AbortController().signal);
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('ok');
  });

  it('flag proxy OFF → « no key » historique, mais CAPTURÉ (visible Diagnostic)', async () => {
    /* pas de flag → off */
    const streamSpy = vi.spyOn(router, 'streamFromProvider').mockResolvedValue({
      assistantText: 'ok',
      toolUses: [],
    });
    const r = await router.streamWithKeyFailover('anthropic', MSGS, 'sys', () => {}, new AbortController().signal);
    expect(r.status).toBe('error');
    expect(streamSpy).not.toHaveBeenCalled();
    expect(getLastAiFails()['anthropic']?.msg).toContain('proxy désactivé');
  });

  it('échec réel du stream (proxy ON) → erreur CAPTURÉE avec le message exact', async () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    vi.spyOn(router, 'streamFromProvider').mockRejectedValue(new Error('anthropic HTTP 529: overloaded'));
    const r = await router.streamWithKeyFailover('anthropic', MSGS, 'sys', () => {}, new AbortController().signal);
    expect(r.status).toBe('error');
    const f = getLastAiFails()['anthropic'];
    expect(f?.msg).toContain('HTTP 529');
    expect(f?.status).toBe(529);
  });

  /* v13.4.341 — cause racine FINALE : sans clé locale + proxy indisponible à cet
   * instant (PIN vault non lisible = course au boot), l'ancien code faisait un fetch
   * DIRECT avec clé VIDE → 401 → classé auth → anthropic DEAD 1h. La nouvelle garde
   * throw une erreur contenant « network » → classifyError = 'network' → backoff/
   * retry, JAMAIS markDead. Ce test verrouille cette classification. */
  it('v341 : l\'erreur « proxy indisponible » est classée network (jamais DEAD)', async () => {
    const { classifyError } = await import('../../services/ai/ai-key-rotation.js');
    const msg = 'anthropic network: proxy indisponible à cet instant (PIN vault non lisible ou health KO) — retry auto';
    expect(classifyError({ message: msg })).toBe('network');
    /* contre-exemple : le 401 direct (ancien comportement) était classé auth → DEAD */
    expect(classifyError({ status: 401, message: 'invalid x-api-key' })).not.toBe('network');
  });
});
