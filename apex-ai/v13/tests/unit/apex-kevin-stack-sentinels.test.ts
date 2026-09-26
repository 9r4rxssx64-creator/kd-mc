/**
 * Tests apex-kevin-stack-sentinels v13.4.149 (Kevin "100/100 réel").
 *
 * Module : services/apex-kevin-stack-sentinels.ts (118 lines, 0% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockSentinels, mockVault } = vi.hoisted(() => ({
  mockSentinels: { register: vi.fn() },
  mockVault: { readKey: vi.fn() },
}));

vi.mock('../../services/sentinels/sentinels.js', () => ({ sentinels: mockSentinels }));
vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));

import { registerKevinStackSentinels } from '../../services/sentinels/apex-kevin-stack-sentinels.js';

describe('apex-kevin-stack-sentinels (v13.4.149 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerKevinStackSentinels', () => {
    it('enregistre 3 sentinelles', () => {
      registerKevinStackSentinels();
      expect(mockSentinels.register).toHaveBeenCalledTimes(3);
    });

    it('enregistre agent-monaco-health', () => {
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const agentMonaco = calls.find((c) => c[0].id === 'kdmc-agent-monaco-health');
      expect(agentMonaco).toBeDefined();
      expect(agentMonaco?.[0].name).toContain('Agent Monaco');
      expect(agentMonaco?.[0].intervalMs).toBe(10 * 60 * 1000);
    });

    it('enregistre bot-2026-health', () => {
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const bot = calls.find((c) => c[0].id === 'kdmc-bot-2026-health');
      expect(bot).toBeDefined();
      expect(bot?.[0].intervalMs).toBe(10 * 60 * 1000);
    });

    it('enregistre pinecone-index-status', () => {
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const pc = calls.find((c) => c[0].id === 'pinecone-index-status');
      expect(pc).toBeDefined();
      expect(pc?.[0].intervalMs).toBe(30 * 60 * 1000);
    });
  });

  describe('agent-monaco check fonction', () => {
    it('retourne ok=true si HTTP 200', async () => {
      registerKevinStackSentinels();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));
      const calls = mockSentinels.register.mock.calls;
      const agentMonacoConfig = calls.find((c) => c[0].id === 'kdmc-agent-monaco-health')?.[0];
      const r = await agentMonacoConfig?.check();
      expect(r?.ok).toBe(true);
      expect(r?.msg).toContain('UP');
    });

    it('retourne ok=false si HTTP 500', async () => {
      registerKevinStackSentinels();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
      const calls = mockSentinels.register.mock.calls;
      const agentMonacoConfig = calls.find((c) => c[0].id === 'kdmc-agent-monaco-health')?.[0];
      const r = await agentMonacoConfig?.check();
      expect(r?.ok).toBe(false);
      expect(r?.msg).toContain('DOWN');
    });

    it('retourne ok=false si fetch throw', async () => {
      registerKevinStackSentinels();
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const calls = mockSentinels.register.mock.calls;
      const agentMonacoConfig = calls.find((c) => c[0].id === 'kdmc-agent-monaco-health')?.[0];
      const r = await agentMonacoConfig?.check();
      expect(r?.ok).toBe(false);
    });
  });

  describe('pinecone check fonction', () => {
    it('retourne ok=false si pas de API key', async () => {
      mockVault.readKey.mockResolvedValue('');
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const pcConfig = calls.find((c) => c[0].id === 'pinecone-index-status')?.[0];
      const r = await pcConfig?.check();
      expect(r?.ok).toBe(false);
      expect(r?.msg).toContain('API key absente');
    });

    it('retourne ok=true si Pinecone répond OK', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxxxxxxxx');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ totalVectorCount: 1500 }), { status: 200 }),
      );
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const pcConfig = calls.find((c) => c[0].id === 'pinecone-index-status')?.[0];
      const r = await pcConfig?.check();
      expect(r?.ok).toBe(true);
      expect(r?.msg).toContain('1500 vectors');
    });

    it('retourne ok=false si Pinecone HTTP 500', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx_long_key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const pcConfig = calls.find((c) => c[0].id === 'pinecone-index-status')?.[0];
      const r = await pcConfig?.check();
      expect(r?.ok).toBe(false);
      expect(r?.msg).toContain('HTTP 500');
    });

    it('retourne ok=false si fetch throw', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx_long_key');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
      registerKevinStackSentinels();
      const calls = mockSentinels.register.mock.calls;
      const pcConfig = calls.find((c) => c[0].id === 'pinecone-index-status')?.[0];
      const r = await pcConfig?.check();
      expect(r?.ok).toBe(false);
      expect(r?.msg).toContain('failed');
    });
  });
});
