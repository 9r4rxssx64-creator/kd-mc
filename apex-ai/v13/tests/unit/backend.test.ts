import { describe, it, expect, beforeEach, vi } from 'vitest';
import { backend } from '../../services/integrations/backend.js';

describe('backend client (tests Jet 6.5)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('false par défaut (pas d\'URL)', () => {
      expect(backend.isConfigured()).toBe(false);
    });

    it('true si URL configurée', () => {
      localStorage.setItem('apex_v13_backend_url', 'https://apex-v13-backend.example.workers.dev');
      expect(backend.isConfigured()).toBe(true);
    });
  });

  describe('checkIdempotency', () => {
    it('fallback si pas de URL', async () => {
      const r = await backend.checkIdempotency('hash123');
      expect(r.fallback).toBe(true);
      expect(r.skip).toBe(false);
    });

    it('appelle /idempotency/check avec hash', async () => {
      localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ skip: true, seenAt: 12345 }), { status: 200 }),
      );
      const r = await backend.checkIdempotency('abc');
      expect(r.skip).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.workers.dev/idempotency/check',
        expect.objectContaining({ method: 'POST' }),
      );
      fetchSpy.mockRestore();
    });

    it('fallback si fetch fail', async () => {
      localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await backend.checkIdempotency('xyz');
      expect(r.fallback).toBe(true);
      fetchSpy.mockRestore();
    });
  });

  describe('escalate', () => {
    it('fallback sans URL', async () => {
      const r = await backend.escalate('test', 'warn', {});
      expect(r.fallback).toBe(true);
    });

    it('appel POST /escalate avec body', async () => {
      localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true, id: 'esc_123' }), { status: 200 }),
      );
      const r = await backend.escalate('reason', 'critical', { x: 1 });
      expect(r.ok).toBe(true);
      expect(r.id).toBe('esc_123');
      fetchSpy.mockRestore();
    });
  });

  describe('aiJudge', () => {
    it('fallback retourne consistent: null', async () => {
      const r = await backend.aiJudge('prompt', 'A', 'B');
      expect(r.fallback).toBe(true);
      expect(r.consistent).toBeNull();
    });

    it('appelle /ai/judge avec promptOriginal + responseA + responseB', async () => {
      localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          consistent: true,
          confidence: 0.9,
          reason: 'same fact',
          method: 'llm_judge_haiku',
        }), { status: 200 }),
      );
      const r = await backend.aiJudge('Quelle est la capitale de la France ?', 'Paris', 'C\'est Paris');
      expect(r.consistent).toBe(true);
      expect(r.method).toBe('llm_judge_haiku');
      fetchSpy.mockRestore();
    });
  });

  describe('verifyAuth', () => {
    it('fallback sans URL', async () => {
      const r = await backend.verifyAuth('token');
      expect(r.fallback).toBe(true);
    });

    it('GET avec Bearer token', async () => {
      localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ valid: true, uid: 'kdmc_admin', isAdmin: true }), { status: 200 }),
      );
      const r = await backend.verifyAuth('mytoken');
      expect(r.valid).toBe(true);
      expect(r.uid).toBe('kdmc_admin');
      const call = fetchSpy.mock.calls[0];
      const init = call?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer mytoken');
      fetchSpy.mockRestore();
    });
  });

  describe('health', () => {
    it('ok=false sans URL', async () => {
      const r = await backend.health();
      expect(r.ok).toBe(false);
    });

    it('ok=true si backend répond', async () => {
      localStorage.setItem('apex_v13_backend_url', 'https://test.workers.dev');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true, ver: 'v13.0.0' }), { status: 200 }),
      );
      const r = await backend.health();
      expect(r.ok).toBe(true);
      expect(r.ver).toBe('v13.0.0');
      fetchSpy.mockRestore();
    });
  });
});
