/**
 * Tests skills-dispatch v13.4.144 (Kevin "100/100 réel").
 *
 * Module : services/apex-tools-dispatch/skills-dispatch.ts (305 stmts, était 9.2% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/skills/docx-generator.js', () => ({
  docxGenerator: { generate: vi.fn().mockResolvedValue({ success: true, blob_url: 'blob:fake' }) },
}));
vi.mock('../../services/skills/pdf-generator.js', () => ({
  pdfGenerator: { generate: vi.fn().mockResolvedValue({ success: true, blob_url: 'blob:pdf' }) },
}));
vi.mock('../../services/skills/pptx-generator.js', () => ({
  pptxGenerator: { generate: vi.fn().mockResolvedValue({ success: true, blob_url: 'blob:pptx' }) },
}));
vi.mock('../../services/skills/xlsx-generator.js', () => ({
  xlsxGenerator: { generate: vi.fn().mockResolvedValue({ success: true, blob_url: 'blob:xlsx' }) },
}));
vi.mock('../../services/ai/mcp-client.js', () => ({
  mcpClient: { call: vi.fn().mockResolvedValue({ success: true, data: 'mcp-result' }) },
}));
vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../services/skills/video-use.js', () => ({
  videoUse: {
    edit: vi.fn().mockResolvedValue({ success: true }),
    composeHyperframes: vi.fn().mockResolvedValue({ success: true }),
  },
}));
vi.mock('../../services/admin/apex-self-audit.js', () => ({
  apexSelfAudit: { runFullAudit: vi.fn().mockResolvedValue({ score: 95 }) },
}));
vi.mock('../../services/skills/futuristic-modules.js', () => ({
  futuristicModules: { invoke: vi.fn().mockResolvedValue({ success: true, output: 'fm-result' }) },
}));

import {
  dispatchGenerateDocx,
  dispatchGeneratePptx,
  dispatchGenerateXlsx,
  dispatchGeneratePdf,
  dispatchMcpBofipSearch,
  dispatchMcpAlmanacResearch,
  dispatchMcpLegalSearch,
  dispatchVideoEdit,
  dispatchVideoComposeHyperframes,
  dispatchSkillFactoryCreate,
  dispatchSecurityReview,
  dispatchCodeReview,
  dispatchGenerateDesignSystem,
  dispatchGenerateMarketingCopy,
  dispatchFuturisticModuleInvoke,
} from '../../services/apex-tools-dispatch/skills-dispatch.js';

describe('skills-dispatch (v13.4.144 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Documents generators', () => {
    it('dispatchGenerateDocx avec template+data', async () => {
      const r = await dispatchGenerateDocx({ template: 'letter-formal', data: { name: 'Kevin' } });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchGeneratePptx avec slides', async () => {
      const r = await dispatchGeneratePptx({
        title: 'Test',
        slides: [{ type: 'cover', title: 'X' }],
        author: 'Apex',
      });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchGenerateXlsx avec sheets', async () => {
      const r = await dispatchGenerateXlsx({
        sheets: [{ name: 'Sheet1', rows: [['A', 'B']] }],
      });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchGeneratePdf avec template', async () => {
      const r = await dispatchGeneratePdf({ template: 'report', data: { title: 'X' } });
      expect((r as { success?: boolean }).success).toBe(true);
    });
  });

  describe('MCP dispatchers', () => {
    it('dispatchMcpBofipSearch', async () => {
      const r = await dispatchMcpBofipSearch({ query: 'TVA' });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchMcpAlmanacResearch', async () => {
      const r = await dispatchMcpAlmanacResearch({ topic: 'AI safety', depth: 'deep' });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchMcpLegalSearch', async () => {
      const r = await dispatchMcpLegalSearch({ country: 'FR', query: 'travail' });
      expect((r as { success?: boolean }).success).toBe(true);
    });
  });

  describe('Video dispatchers', () => {
    it('dispatchVideoEdit refuse si pas video_source', async () => {
      const r = await dispatchVideoEdit({ operation: 'cut' });
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('dispatchVideoEdit avec video_source OK', async () => {
      const r = await dispatchVideoEdit({
        operation: 'cut',
        video_source: 'blob:test',
      });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchVideoComposeHyperframes refuse si pas beats', async () => {
      const r = await dispatchVideoComposeHyperframes({ composition_id: 'x' });
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('dispatchVideoComposeHyperframes avec beats OK', async () => {
      const r = await dispatchVideoComposeHyperframes({
        composition_id: 'comp1',
        beats: [{ id: 'b1', html: '<div></div>' }],
      });
      expect((r as { success?: boolean }).success).toBe(true);
    });
  });

  describe('dispatchSkillFactoryCreate', () => {
    it('refuse nom invalide', async () => {
      const r = await dispatchSkillFactoryCreate({ name: 'BadName!' });
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('refuse nom trop court', async () => {
      const r = await dispatchSkillFactoryCreate({ name: 'ab' });
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('refuse description trop courte', async () => {
      const r = await dispatchSkillFactoryCreate({
        name: 'test-skill',
        description: 'short',
      });
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('refuse when_to_use trop court', async () => {
      const r = await dispatchSkillFactoryCreate({
        name: 'test-skill',
        description: 'desc long enough for valid',
        when_to_use: 'x',
      });
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('crée skill valide', async () => {
      const r = await dispatchSkillFactoryCreate({
        name: 'my-new-skill',
        description: 'desc long enough for valid',
        when_to_use: 'when user asks something specific',
        allowed_tools: ['read', 'write'],
        anti_patterns: ['ne pas X'],
      });
      expect((r as { success?: boolean }).success).toBe(true);
      const registry = JSON.parse(localStorage.getItem('ax_apex_skills_registry') ?? '[]');
      expect(registry.length).toBe(1);
    });

    it('refuse duplicate', async () => {
      const params = {
        name: 'dup-skill',
        description: 'desc long enough',
        when_to_use: 'when user asks',
      };
      await dispatchSkillFactoryCreate(params);
      const r = await dispatchSkillFactoryCreate(params);
      expect((r as { success?: boolean }).success).toBe(false);
    });
  });

  describe('dispatchSecurityReview / CodeReview', () => {
    it('dispatchSecurityReview retourne report', async () => {
      const r = await dispatchSecurityReview({ scope: 'recent_changes' });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchSecurityReview mode full', async () => {
      const r = await dispatchSecurityReview({ scope: 'full' });
      expect((r as { success?: boolean }).success).toBe(true);
    });

    it('dispatchCodeReview avec files', async () => {
      const r = await dispatchCodeReview({ files: ['a.ts', 'b.ts'], commits_to_analyze: 10 });
      expect((r as { success?: boolean }).success).toBe(true);
      expect((r as { files_scanned?: number }).files_scanned).toBe(2);
    });
  });

  describe('dispatchGenerateDesignSystem', () => {
    it('retourne palette premium par défaut', async () => {
      const r = await dispatchGenerateDesignSystem({});
      const data = r as { success?: boolean; mood?: string; palette?: Record<string, string> };
      expect(data.success).toBe(true);
      expect(data.mood).toBe('premium');
      expect(data.palette?.primary).toBeTypeOf('string');
    });

    it('respecte mood playful', async () => {
      const r = await dispatchGenerateDesignSystem({ mood: 'playful' });
      expect((r as { mood?: string }).mood).toBe('playful');
    });

    it('mood editorial = typography spéciale', async () => {
      const r = await dispatchGenerateDesignSystem({ mood: 'editorial' });
      const data = r as { typography?: { heading?: string } };
      expect(data.typography?.heading).toBe('Playfair Display');
    });

    it('fallback premium si mood inconnu', async () => {
      const r = await dispatchGenerateDesignSystem({ mood: 'unknown_mood' });
      expect((r as { success?: boolean }).success).toBe(true);
    });
  });

  describe('dispatchGenerateMarketingCopy', () => {
    it('retourne copy structurée AIDA', async () => {
      const r = await dispatchGenerateMarketingCopy({
        product: 'Apex AI',
        target_audience: 'pros',
        framework: 'AIDA',
      });
      const data = r as { success?: boolean; copy?: Record<string, string>; framework_used?: string };
      expect(data.success).toBe(true);
      expect(data.framework_used).toBe('AIDA');
      expect(data.copy?.headline).toContain('Apex AI');
    });

    it('utilise AIDA par défaut', async () => {
      const r = await dispatchGenerateMarketingCopy({
        product: 'X',
        target_audience: 'Y',
      });
      expect((r as { framework_used?: string }).framework_used).toBe('AIDA');
    });
  });

  describe('dispatchFuturisticModuleInvoke', () => {
    it('refuse sans module_id', async () => {
      const r = await dispatchFuturisticModuleInvoke({});
      expect((r as { success?: boolean }).success).toBe(false);
    });

    it('appelle invoke si module_id valide', async () => {
      const r = await dispatchFuturisticModuleInvoke({
        module_id: 'apex-image-gen-flux2-pro',
        params: { prompt: 'cat' },
      });
      expect((r as { success?: boolean }).success).toBe(true);
    });
  });
});
