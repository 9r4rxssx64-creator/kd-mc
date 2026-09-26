/**
 * APEX v13 — Tests AI Providers Health Check (audit Kevin v13.1.0).
 *
 * Couvre :
 * - Ping providers (success → ok, slow → slow, fail → down)
 * - Latency threshold 3s
 * - Consecutive failures counter (3x → down)
 * - Reset après succès
 * - Storage persistence (localStorage)
 * - getStatus() format snapshot
 * - getHealthyProviders() filtre + tri
 * - Auto-start interval 60s
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiProvidersHealth, type ProviderId } from '../../services/ai/ai-providers-health.js';

/**
 * Helper : crée une Response mockée pour fetch.
 */
function mockResponse(status: number): Response {
  return new Response(null, { status });
}

/**
 * Helper : retourne fetch promise qui se résout après délai (simule latency).
 */
function delayedResponse(status: number, delayMs: number): Promise<Response> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockResponse(status)), delayMs);
  });
}

describe('ai-providers-health — service de monitoring providers IA', () => {
  beforeEach(() => {
    localStorage.clear();
    aiProvidersHealth.reset();
    aiProvidersHealth.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    aiProvidersHealth.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('getStatus retourne unknown pour tous providers au démarrage', () => {
      const status = aiProvidersHealth.getStatus();
      expect(status.anthropic).toBe('unknown');
      expect(status.openrouter).toBe('unknown');
      expect(status.groq).toBe('unknown');
      expect(status.gemini).toBe('unknown');
      expect(status.openclaw).toBe('unknown');
    });

    it('getDetails retourne 5 providers avec status unknown initial', () => {
      const details = aiProvidersHealth.getDetails();
      expect(details.length).toBe(5);
      for (const d of details) {
        expect(d.status).toBe('unknown');
        expect(d.latency_ms).toBe(-1);
        expect(d.consecutive_failures).toBe(0);
      }
    });

    it('getHealthyProviders retourne tous providers (rank<3) au démarrage', () => {
      /* unknown rank = 2 < 3 → tous inclus */
      const healthy = aiProvidersHealth.getHealthyProviders();
      expect(healthy.length).toBe(5);
    });
  });

  describe('pingOne', () => {
    it('pingOne provider success rapide (<3s) → status ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      const result = await aiProvidersHealth.pingOne('anthropic');
      expect(result.status).toBe('ok');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.consecutive_failures).toBe(0);
    });

    it('pingOne avec HTTP 401 (auth requise) → status ok (service vivant)', async () => {
      /* 401 = endpoint vivant, juste manque auth. Service est UP */
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(401));
      const result = await aiProvidersHealth.pingOne('anthropic');
      expect(result.status).toBe('ok');
    });

    it('pingOne avec HTTP 500 → 1er fail = slow (pas encore 3 échecs)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(500));
      const result = await aiProvidersHealth.pingOne('groq');
      /* 1er échec → slow (warning), pas encore "down" strict */
      expect(result.status).toBe('slow');
      expect(result.consecutive_failures).toBe(1);
      expect(result.last_error).toBe('HTTP 500');
    });

    it('pingOne 3x échec consécutif → status down', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(500));
      await aiProvidersHealth.pingOne('groq');
      await aiProvidersHealth.pingOne('groq');
      const result = await aiProvidersHealth.pingOne('groq');
      expect(result.status).toBe('down');
      expect(result.consecutive_failures).toBe(3);
    });

    it('pingOne network error → traité comme down', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));
      const result = await aiProvidersHealth.pingOne('openrouter');
      expect(result.consecutive_failures).toBe(1);
      expect(result.last_error).toBe('Network failure');
      /* 1er échec → slow */
      expect(result.status).toBe('slow');
    });

    it('pingOne success après down → reset failures à 0', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockResolvedValueOnce(mockResponse(500));
      fetchSpy.mockResolvedValueOnce(mockResponse(500));
      fetchSpy.mockResolvedValueOnce(mockResponse(500));
      await aiProvidersHealth.pingOne('groq');
      await aiProvidersHealth.pingOne('groq');
      const downResult = await aiProvidersHealth.pingOne('groq');
      expect(downResult.status).toBe('down');

      /* Maintenant succès */
      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      const okResult = await aiProvidersHealth.pingOne('groq');
      expect(okResult.status).toBe('ok');
      expect(okResult.consecutive_failures).toBe(0);
    });
  });

  describe('latency thresholds', () => {
    it('latency <3s = ok status', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => mockResponse(200));
      const result = await aiProvidersHealth.pingOne('anthropic');
      expect(result.latency_ms).toBeLessThan(3000);
      expect(result.status).toBe('ok');
    });

    /* Note : difficile de tester latency >3s sans timer fake (timeouts).
       On vérifie la logique en mockant manuellement le state. */
    it('logique slow : latency >3s avec status alive devrait être slow', async () => {
      /* Mock fetch qui mesure latency avec délai contrôlé via Date.now */
      const realDateNow = Date.now;
      let callIdx = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callIdx++;
        /* 1ère call = start (0), 2ème call = end (4000ms = >3s) */
        return callIdx === 1 ? 1_000_000 : 1_004_000;
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      const result = await aiProvidersHealth.pingOne('anthropic');
      /* latency = 4000ms > 3000ms threshold */
      expect(result.latency_ms).toBeGreaterThanOrEqual(3000);
      expect(result.status).toBe('slow');
      vi.spyOn(Date, 'now').mockImplementation(realDateNow);
    });
  });

  describe('pingAll', () => {
    it('pingAll teste les 4 providers réels (openclaw exclu placeholder v13.3.87 P1.11)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      await aiProvidersHealth.pingAll();
      /* v13.3.87 P1.11 : openclaw était placeholder fake → exclu du PROBE_PROVIDERS,
       * statut explicite 'unknown' au lieu de faux positif 'down'. */
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      const status = aiProvidersHealth.getStatus();
      expect(status.anthropic).toBe('ok');
      expect(status.openrouter).toBe('ok');
      expect(status.groq).toBe('ok');
      expect(status.gemini).toBe('ok');
      /* openclaw : not probed → 'unknown' (pas 'ok' car non testé, pas 'down' car non fail) */
      expect(status.openclaw).toBe('unknown');
    });

    it('pingAll mix succès/échec → status mixte', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      /* anthropic OK, openrouter fail, groq OK, gemini fail, openclaw OK */
      fetchSpy.mockImplementation(async (url: unknown) => {
        const u = String(url);
        if (u.includes('openrouter') || u.includes('generativelanguage')) {
          return mockResponse(500);
        }
        return mockResponse(200);
      });
      await aiProvidersHealth.pingAll();
      const status = aiProvidersHealth.getStatus();
      expect(status.anthropic).toBe('ok');
      expect(status.openrouter).toBe('slow'); /* 1er fail */
      expect(status.gemini).toBe('slow');
    });
  });

  describe('getHealthyProviders ordering', () => {
    it('priorité ok > slow > unknown > down', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      /* anthropic ok */
      fetchSpy.mockImplementation(async (url: unknown) => {
        const u = String(url);
        if (u.includes('anthropic')) return mockResponse(200);
        if (u.includes('groq')) return mockResponse(500); /* slow (1 fail) */
        return mockResponse(200);
      });
      await aiProvidersHealth.pingOne('anthropic');
      await aiProvidersHealth.pingOne('groq');
      const healthy = aiProvidersHealth.getHealthyProviders();
      /* anthropic (ok=0) doit être avant groq (slow=1) */
      const idxAnthro = healthy.indexOf('anthropic');
      const idxGroq = healthy.indexOf('groq');
      expect(idxAnthro).toBeGreaterThanOrEqual(0);
      expect(idxGroq).toBeGreaterThan(idxAnthro);
    });

    it('providers down filtrés hors getHealthyProviders', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
        const u = String(url);
        if (u.includes('groq')) return mockResponse(500);
        return mockResponse(200);
      });
      /* Ping groq 3x pour le marquer down */
      await aiProvidersHealth.pingOne('groq');
      await aiProvidersHealth.pingOne('groq');
      await aiProvidersHealth.pingOne('groq');
      const healthy = aiProvidersHealth.getHealthyProviders();
      expect(healthy).not.toContain('groq');
    });
  });

  describe('persistence localStorage', () => {
    it('saveToStorage après pingAll', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      await aiProvidersHealth.pingAll();
      const raw = localStorage.getItem('apex_v13_provider_health');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw ?? '[]') as Array<{ provider: string; status: string }>;
      expect(parsed.length).toBeGreaterThanOrEqual(5);
      const anthroEntry = parsed.find((p) => p.provider === 'anthropic');
      expect(anthroEntry?.status).toBe('ok');
    });

    it('reset clear status à unknown + persiste storage', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      await aiProvidersHealth.pingAll();
      aiProvidersHealth.reset();
      const status = aiProvidersHealth.getStatus();
      expect(status.anthropic).toBe('unknown');
    });
  });

  describe('start / stop lifecycle', () => {
    it('start est idempotent (pas de double-interval)', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      aiProvidersHealth.start();
      aiProvidersHealth.start(); /* doit être no-op */
      aiProvidersHealth.start();
      /* Un seul setInterval enregistré */
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it('stop annule le setInterval', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
      aiProvidersHealth.start();
      aiProvidersHealth.stop();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('getStatus snapshot format', () => {
    it('getStatus retourne objet plat avec 5 providers', () => {
      const status = aiProvidersHealth.getStatus();
      const keys = Object.keys(status);
      expect(keys.sort()).toEqual(['anthropic', 'gemini', 'groq', 'openclaw', 'openrouter']);
    });

    it('chaque valeur est un HealthStatus valide', () => {
      const status = aiProvidersHealth.getStatus();
      const validStatuses = ['ok', 'slow', 'down', 'unknown'];
      const providers: ProviderId[] = ['anthropic', 'openrouter', 'groq', 'gemini', 'openclaw'];
      for (const p of providers) {
        expect(validStatuses).toContain(status[p]);
      }
    });
  });

  describe('integration : failover détecte providers sains', () => {
    it('après ping mixte, getHealthyProviders priorise ok puis slow', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
        const u = String(url);
        /* anthropic + generativelanguage (gemini) → 200 */
        if (u.includes('api.anthropic.com') || u.includes('generativelanguage')) {
          return mockResponse(200);
        }
        return mockResponse(503);
      });
      await aiProvidersHealth.pingAll();
      const healthy = aiProvidersHealth.getHealthyProviders();
      /* anthropic et gemini doivent être en tête */
      expect(healthy[0]).toMatch(/^(anthropic|gemini)$/);
      expect(healthy[1]).toMatch(/^(anthropic|gemini)$/);
    });
  });

  describe('AbortController timeout', () => {
    it('ping avec délai >5s déclenche AbortError → down', async () => {
      /* Simulate slow fetch qui dépasse PING_TIMEOUT_MS=5s
         On utilise un fetch qui rejette directement avec AbortError pour simuler
         le comportement du timer interne sans réellement attendre */
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        return new Promise((_resolve, reject) => {
          /* Écoute le signal, rejette avec AbortError immédiatement pour le test */
          const sig = init?.signal as AbortSignal | undefined;
          if (sig) {
            const abortErr = new Error('aborted');
            abortErr.name = 'AbortError';
            /* Trigger immédiat pour skip le 5s wait */
            queueMicrotask(() => {
              reject(abortErr);
            });
          } else {
            reject(new Error('no signal'));
          }
        });
      });
      const result = await aiProvidersHealth.pingOne('anthropic');
      expect(result.last_error).toBe('timeout');
      expect(result.consecutive_failures).toBe(1);
    });
  });
});
