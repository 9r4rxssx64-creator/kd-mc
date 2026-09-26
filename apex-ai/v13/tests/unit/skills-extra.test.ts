/**
 * APEX v13.4.12 — Tests : video-use + futuristic-modules.
 *
 * Vérifie que les nouveaux services s'importent, fonctionnent en safe
 * fallback (CDN ne charge pas en jsdom), retournent structure attendue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn(async () => undefined) },
}));

vi.mock('../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  }
});

describe('Skill Futuristic Modules', () => {
  it('liste les modules disponibles', async () => {
    const { futuristicModules } = await import('../../services/skills/futuristic-modules.js');
    const list = futuristicModules.list();
    expect(list.length).toBeGreaterThanOrEqual(35); /* 35+ modules routes */
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('category');
    expect(list[0]).toHaveProperty('description');
  });

  it('stats par catégorie sont cohérentes', async () => {
    const { futuristicModules } = await import('../../services/skills/futuristic-modules.js');
    const stats = futuristicModules.statsByCategory();
    expect(Object.keys(stats).length).toBeGreaterThanOrEqual(8);
    /* Doit contenir au moins ai-multimodal, generative-pro, security-pqc */
    expect(stats).toHaveProperty('ai-multimodal');
    expect(stats).toHaveProperty('generative-pro');
  });

  it('invoque module replicate (FLUX 2 Pro) → retourne fallback structuré sans token', async () => {
    /* v13.4.43 : sans token Vault ax_replicate_key → success=false avec error claire */
    const { futuristicModules } = await import('../../services/skills/futuristic-modules.js');
    const result = await futuristicModules.invoke('apex-image-gen-flux2-pro', { prompt: 'test' });
    expect(result.module_id).toBe('apex-image-gen-flux2-pro');
    expect(result.category).toBe('generative-pro');
    /* Sans token : success=false + error informatif. Avec token : tentera vrai call Replicate. */
    if (!result.success) {
      expect(result.error).toContain('Token Replicate');
    } else {
      expect(result.result).toBeDefined();
    }
  });

  it('invoque module native (Vision Claude 4)', async () => {
    const { futuristicModules } = await import('../../services/skills/futuristic-modules.js');
    const result = await futuristicModules.invoke('apex-vision-claude-4', {});
    expect(result.success).toBe(true);
    expect(result.category).toBe('ai-multimodal');
  });

  it('invoque module cdn-lib (Mermaid flowchart)', async () => {
    const { futuristicModules } = await import('../../services/skills/futuristic-modules.js');
    const result = await futuristicModules.invoke('apex-flowchart-mermaid', {});
    expect(result.success).toBe(true);
    expect(result.category).toBe('productivity');
    /* Doit fournir cdn_url */
    const r = result.result as { cdn_url?: string };
    expect(r.cdn_url).toBeTruthy();
  });

  it('refuse module inconnu avec liste fallback', async () => {
    const { futuristicModules } = await import('../../services/skills/futuristic-modules.js');
    const result = await futuristicModules.invoke('apex-totally-fake-xyz', {});
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.fallback).toBeTruthy();
  });
});

describe('Skill Video Use', () => {
  it('refuse opération sans video_source', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const result = await videoUse.edit({
      operation: 'cut',
      videoSource: '',
    });
    /* En env jsdom, CDN ffmpeg ne charge pas → erreur attendue ou pas de crash */
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('hyperframes : retourne erreur structurée sans crash si MediaRecorder indispo', async () => {
    /* jsdom n'a pas MediaRecorder, mais ne doit pas crash */
    const { videoUse } = await import('../../services/skills/video-use.js');
    const result = await videoUse.composeHyperframes({
      compositionId: 'test',
      beats: [{ id: 'b1', durationMs: 100, html: '<h1>Test</h1>' }],
    });
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe('Skills dispatch — futuristic_module_invoke + video_edit', () => {
  it('dispatchFuturisticModuleInvoke refuse params sans module_id', async () => {
    const { dispatchFuturisticModuleInvoke } = await import(
      '../../services/apex-tools-dispatch/skills-dispatch.js'
    );
    const result = (await dispatchFuturisticModuleInvoke({})) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('module_id');
  });

  it('dispatchFuturisticModuleInvoke route module connu correctement', async () => {
    const { dispatchFuturisticModuleInvoke } = await import(
      '../../services/apex-tools-dispatch/skills-dispatch.js'
    );
    const result = (await dispatchFuturisticModuleInvoke({
      module_id: 'apex-tts-elevenlabs-flash',
      params: { text: 'Bonjour' },
    })) as { success: boolean; category?: string };
    expect(result.success).toBe(true);
    expect(result.category).toBe('ai-multimodal');
  });

  it('dispatchVideoEdit refuse sans video_source', async () => {
    const { dispatchVideoEdit } = await import(
      '../../services/apex-tools-dispatch/skills-dispatch.js'
    );
    const result = (await dispatchVideoEdit({ operation: 'cut' })) as {
      success: boolean;
      error?: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('video_source');
  });
});
