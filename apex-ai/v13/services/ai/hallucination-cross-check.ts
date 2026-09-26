/**
 * APEX v13.3.81 — Hallucination Cross-Check (audit cascade P1.2)
 *
 * Lance 2+ providers IA secondaires en parallèle sur la même question pour
 * détecter divergences vs réponse primaire. Si divergence > 40% (token Jaccard
 * + length delta) → warning user "⚠️ Réponses divergentes entre IA, prudence".
 *
 * Activation : opt-in admin via feature toggle 'feature.cross-check-ia'
 * (default OFF). Trigger explicite depuis chat UI.
 *
 * Cache LRU : 50 dernières questions (clé = SHA-1 truncated).
 *
 * Anti-pattern évité (CLAUDE.md "Hallucinations") : ne jamais "trust" une seule
 * réponse IA sans validation. Cette couche est l'AI Safety filet de sécurité.
 *
 * Tests : tests/unit/hallucination-cross-check.test.ts (4 cas).
 */

import { logger } from '../../core/logger.js';

import { aiRouter, type ChatMessage, type Provider, type StreamChunk } from './ai-router.js';

export interface CrossCheckResult {
  confidence: number; /* 0-1 (1 = full convergence, 0 = total divergence) */
  divergence: string[]; /* Description divergences */
  warning?: string;     /* Message user-facing si confidence < 0.6 */
  responses: Array<{ provider: Provider; text: string; latencyMs: number; ok: boolean }>;
  primaryAnswer: string;
}

interface CacheEntry {
  result: CrossCheckResult;
  ts: number;
}

const CACHE_MAX = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; /* 30 min */
const TIMEOUT_MS = 30_000;
const DIVERGENCE_THRESHOLD = 0.4; /* 40% */

class HallucinationCrossCheck {
  private cache = new Map<string, CacheEntry>();

  /**
   * Lance providers secondaires en // et compare à la réponse primaire.
   *
   * @param question  Texte question utilisateur original
   * @param primaryAnswer  Réponse primaire déjà obtenue (ex: Anthropic)
   * @param providers  Providers secondaires à tester (default ['openai','groq'])
   */
  async crossCheck(
    question: string,
    primaryAnswer: string,
    providers: Provider[] = ['openai', 'groq'],
  ): Promise<CrossCheckResult> {
    const cacheKey = await this.hashKey(question + '|' + primaryAnswer.slice(0, 100));
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      logger.info('cross-check', 'cache hit', { question: question.slice(0, 50) });
      return cached.result;
    }

    const messages: ChatMessage[] = [{ role: 'user', content: question }];
    const system = 'Tu réponds à la question utilisateur de manière concise et factuelle. Pas de salutations.';

    const startTimes: Record<string, number> = {};
    const responses = await Promise.allSettled(
      providers.map((provider) => {
        startTimes[provider] = Date.now();
        return this.streamSingleProvider(provider, messages, system);
      }),
    );

    const responsesData: CrossCheckResult['responses'] = providers.map((provider, idx) => {
      const r = responses[idx];
      const latencyMs = Date.now() - (startTimes[provider] ?? Date.now());
      if (r && r.status === 'fulfilled') {
        return { provider, text: r.value, latencyMs, ok: true };
      }
      const reason = r && r.status === 'rejected' ? String(r.reason) : 'unknown';
      logger.warn('cross-check', `provider ${provider} failed`, { err: reason });
      return { provider, text: '', latencyMs, ok: false };
    });

    const okResponses = responsesData.filter((r) => r.ok && r.text.length > 10);
    if (okResponses.length === 0) {
      const result: CrossCheckResult = {
        confidence: 0.5, /* Inconnu — pas de signal négatif ni positif */
        divergence: ['Aucun provider secondaire disponible pour cross-check'],
        responses: responsesData,
        primaryAnswer,
      };
      this.setCache(cacheKey, result);
      return result;
    }

    /* Compare chaque réponse secondaire à la primaire (Jaccard tokens + length) */
    const similarities = okResponses.map((r) => this.similarity(primaryAnswer, r.text));
    const avgSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const minSim = Math.min(...similarities);

    const divergence: string[] = [];
    okResponses.forEach((r, idx) => {
      const sim = similarities[idx]!;
      if (sim < 1 - DIVERGENCE_THRESHOLD) {
        divergence.push(
          `${r.provider}: similarité ${(sim * 100).toFixed(0)}% (delta length=${Math.abs(r.text.length - primaryAnswer.length)})`,
        );
      }
    });

    let warning: string | undefined;
    if (minSim < 1 - DIVERGENCE_THRESHOLD) {
      warning = `⚠️ Réponses divergentes entre IA (${(minSim * 100).toFixed(0)}% similarity min). Vérifiez la réponse principale auprès d'une source fiable.`;
    }

    const result: CrossCheckResult = {
      confidence: avgSim,
      divergence,
      ...(warning !== undefined ? { warning } : {}),
      responses: responsesData,
      primaryAnswer,
    };

    this.setCache(cacheKey, result);
    logger.info('cross-check', 'completed', {
      confidence: avgSim.toFixed(2),
      divergent: divergence.length,
      okProviders: okResponses.length,
    });
    return result;
  }

  /**
   * Stream UNE réponse complète d'un provider donné via aiRouter.
   * Bypass tool use (response texte pure pour comparaison).
   */
  private async streamSingleProvider(
    provider: Provider,
    messages: ChatMessage[],
    system: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: string[] = [];
      const timeoutId = setTimeout(() => {
        reject(new Error(`${provider} timeout ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);

      /* Force ce provider unique en surchargeant chaîne via localStorage temporaire */
      const originalChain = localStorage.getItem('apex_v13_failover_chain');
      try {
        localStorage.setItem('apex_v13_failover_chain', JSON.stringify([provider]));
      } catch {
        /* QuotaExceeded → continue, fallback chain */
      }

      aiRouter
        .stream(
          messages,
          system,
          (chunk: StreamChunk) => {
            if (chunk.type === 'text' || !chunk.type) {
              chunks.push(chunk.text);
            }
            if (chunk.done) {
              clearTimeout(timeoutId);
              this.restoreChain(originalChain);
              resolve(chunks.join(''));
            }
          },
          (err: Error) => {
            clearTimeout(timeoutId);
            this.restoreChain(originalChain);
            reject(err);
          },
        )
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          this.restoreChain(originalChain);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  private restoreChain(original: string | null): void {
    try {
      if (original === null) localStorage.removeItem('apex_v13_failover_chain');
      else localStorage.setItem('apex_v13_failover_chain', original);
    } catch {
      /* ignore quota */
    }
  }

  /**
   * Similarité Jaccard tokenized + bonus length match.
   * Retourne 0-1 (1 = identique).
   */
  private similarity(a: string, b: string): number {
    const tokensA = this.tokenize(a);
    const tokensB = this.tokenize(b);
    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let inter = 0;
    tokensA.forEach((t) => {
      if (tokensB.has(t)) inter += 1;
    });
    const union = tokensA.size + tokensB.size - inter;
    const jaccard = union > 0 ? inter / union : 0;
    /* Bonus si length proche (±20%) — même contenu peut avoir vocabulaire différent */
    const lenA = a.length;
    const lenB = b.length;
    const lenRatio = Math.min(lenA, lenB) / Math.max(lenA, lenB || 1);
    return jaccard * 0.7 + lenRatio * 0.3;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3),
    );
  }

  private async hashKey(input: string): Promise<string> {
    try {
      const data = new TextEncoder().encode(input);
      const buf = await crypto.subtle.digest('SHA-1', data);
      const arr = Array.from(new Uint8Array(buf));
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } catch {
      /* Fallback hash simple si crypto.subtle indispo */
      let h = 0;
      for (let i = 0; i < input.length; i += 1) {
        h = ((h << 5) - h + input.charCodeAt(i)) | 0;
      }
      return h.toString(16);
    }
  }

  private setCache(key: string, result: CrossCheckResult): void {
    if (this.cache.size >= CACHE_MAX) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { result, ts: Date.now() });
  }

  /** Test helper — clear cache. */
  clearCache(): void {
    this.cache.clear();
  }
}

export const hallucinationCrossCheck = new HallucinationCrossCheck();
