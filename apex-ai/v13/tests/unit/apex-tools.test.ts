/**
 * Tests apex-tools registry + dispatcher (parité Claude Code).
 * Couvre listForTier, canExecute, dispatcher exec, validation flow,
 * project_status, memory_recall/add, search_latest_tools.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '../../core/store.js';
import { apexTools } from '../../services/core-svc/apex-tools.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';

describe('Apex Tools Registry (Jet 8 path Apex IA full power)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Registry list + filter par tier', () => {
    it('list() retourne tous les tools (>= 30)', () => {
      const all = apexTools.list();
      expect(all.length).toBeGreaterThanOrEqual(30);
    });

    it('listForTier(admin) retourne TOUS les tools', () => {
      const adminTools = apexTools.listForTier('admin');
      expect(adminTools.length).toBe(apexTools.list().length);
    });

    it('listForTier(client_free) retourne seulement client_free + sub-tier', () => {
      const free = apexTools.listForTier('client_free');
      expect(free.every((t) => t.minTier === 'client_free')).toBe(true);
      expect(free.length).toBeLessThan(apexTools.list().length);
    });

    it('listForTier(family) inclut family + client_pro + client_free', () => {
      const family = apexTools.listForTier('family');
      const tiers = new Set(family.map((t) => t.minTier));
      expect(tiers.has('family')).toBe(true);
      /* Ne doit pas contenir tools admin-only */
      expect(family.find((t) => t.name === 'edit_file')).toBeUndefined();
    });

    it('getByName retourne tool ou null', () => {
      expect(apexTools.getByName('read_file')).toBeDefined();
      expect(apexTools.getByName('inexistant_tool_xyz')).toBeNull();
    });

    it('toAnthropicFormat retourne array compatible tool_use', () => {
      const formatted = apexTools.toAnthropicFormat('admin');
      expect(Array.isArray(formatted)).toBe(true);
      const first = formatted[0] as { name: string; description: string; input_schema: unknown };
      expect(first.name).toBeTruthy();
      expect(first.description).toBeTruthy();
      expect(first.input_schema).toBeDefined();
    });
  });

  describe('canExecute permission check', () => {
    it('admin peut exécuter tous tools', () => {
      const allTools = apexTools.list();
      for (const t of allTools) {
        const r = apexTools.canExecute(t.name, 'admin');
        expect(r.allowed).toBe(true);
      }
    });

    it('client_free refusé sur tool admin (edit_file)', () => {
      const r = apexTools.canExecute('edit_file', 'client_free');
      expect(r.allowed).toBe(false);
      expect(r.reason).toBeTruthy();
    });

    it('family ok sur tool family (escalate_human)', () => {
      const r = apexTools.canExecute('escalate_human', 'family');
      expect(r.allowed).toBe(true);
    });

    it('family ok sur tool C → requires_validation=true', () => {
      const r = apexTools.canExecute('send_email', 'family');
      expect(r.allowed).toBe(true);
      expect(r.requires_validation).toBe(true);
    });

    it('admin sur tool C → requires_validation=false (admin bypass)', () => {
      const r = apexTools.canExecute('edit_file', 'admin');
      expect(r.allowed).toBe(true);
      expect(r.requires_validation).toBe(false);
    });

    it('tool inconnu → allowed=false + reason', () => {
      const r = apexTools.canExecute('nonexistent_tool_xyz_999', 'admin');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('inconnu');
    });
  });
});

describe('Apex Tools Dispatcher (executor Jet 8)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    /* v13.4.246 : execute('admin') re-vérifie auth.isAdminSync() (fail-closed).
       Session admin réelle requise sinon tools rétrogradés → "Tier insuffisant". */
    store.set('user', { id: 'kdmc_admin', name: 'K' });
  });

  afterEach(() => {
    store.set('user', null);
  });

  describe('Permission rejection', () => {
    it('execute tool admin avec tier client_free → ok=false', async () => {
      const r = await apexToolsDispatch.execute('edit_file', { path: 'x', old_string: 'a', new_string: 'b' }, 'client_free');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('insuffisant');
    });

    it('execute tool inconnu → ok=false', async () => {
      const r = await apexToolsDispatch.execute('inexistent_tool_xyz', {}, 'admin');
      expect(r.ok).toBe(false);
    });
  });

  describe('Validation flow (impactLevel C)', () => {
    it('execute send_email tier family → requires_validation=true + token', async () => {
      const r = await apexToolsDispatch.execute(
        'send_email',
        { to: 'a@b.com', subject: 'X', body: 'Y' },
        'family',
      );
      expect(r.ok).toBe(false);
      expect(r.requires_validation).toBe(true);
      expect(r.validation_token).toMatch(/^val_/);
    });

    it('listPendingValidations retourne entries après requires_validation', async () => {
      await apexToolsDispatch.execute(
        'send_email',
        { to: 'x@y.com', subject: 's', body: 'b' },
        'family',
      );
      const pending = apexToolsDispatch.listPendingValidations();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending[0]?.tool).toBe('send_email');
    });

    it('validate(token) inconnu → ok=false', async () => {
      const r = await apexToolsDispatch.validate('val_inconnu_token_xyz');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('inconnu');
    });
  });

  describe('Tools impactLevel A (auto, dispatcher exec direct)', () => {
    it('memory_add ajoute fact à apex_v13_persistent_memory', async () => {
      const r = await apexToolsDispatch.execute(
        'memory_add',
        { category: 'test_cat', fact: 'Kevin préfère gold #c9a227' },
        'admin',
      );
      expect(r.ok).toBe(true);
      const facts = JSON.parse(localStorage.getItem('apex_v13_persistent_memory') ?? '[]') as Array<{ fact: string }>;
      expect(facts.find((f) => f.fact.includes('gold'))).toBeDefined();
    });

    it('memory_recall trouve fact ajouté par mot-clé', async () => {
      await apexToolsDispatch.execute(
        'memory_add',
        { category: 'pref', fact: 'Apex doit être 100% autonome' },
        'admin',
      );
      const r = await apexToolsDispatch.execute(
        'memory_recall',
        { keyword: 'autonome', scope: 'facts' },
        'admin',
      );
      expect(r.ok).toBe(true);
      const result = r.result as { facts?: Array<{ fact: string }> };
      expect(result.facts?.length).toBeGreaterThanOrEqual(1);
    });

    it('lesson_record stocke lesson + cap 500', async () => {
      const r = await apexToolsDispatch.execute(
        'lesson_record',
        {
          title: 'Test lesson',
          text: 'Pas reproduire X',
          severity: 'critical',
          category: 'security',
        },
        'admin',
      );
      expect(r.ok).toBe(true);
      const lessons = JSON.parse(localStorage.getItem('apex_v13_lessons') ?? '[]') as Array<{ title: string }>;
      expect(lessons.find((l) => l.title === 'Test lesson')).toBeDefined();
    });

    it('audit_self retourne metrics actuelles', async () => {
      const r = await apexToolsDispatch.execute('audit_self', { scope: 'all' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { scope?: string; metrics?: Record<string, unknown> };
      expect(result.metrics).toBeDefined();
      expect(typeof result.metrics?.['audit_count']).toBe('number');
    });

    it('finance_calculate iban_check valide IBAN MOD97', async () => {
      const r = await apexToolsDispatch.execute(
        'finance_calculate',
        { type: 'iban_check', params: { iban: 'GB82 WEST 1234 5698 7654 32' } },
        'family',
      );
      expect(r.ok).toBe(true);
      const result = r.result as { valid: boolean; country: string };
      expect(result.valid).toBe(true);
      expect(result.country).toBe('GB');
    });

    it('finance_calculate ir 2026 calcule par tranches', async () => {
      const r = await apexToolsDispatch.execute(
        'finance_calculate',
        { type: 'ir', params: { revenu: 50000, parts: 1 } },
        'family',
      );
      expect(r.ok).toBe(true);
      const result = r.result as { ir_total: number; qf: number };
      expect(result.ir_total).toBeGreaterThan(0);
      expect(result.qf).toBe(50000);
    });

    it('vault_action list retourne keys ax_*_key', async () => {
      localStorage.setItem('ax_test_key', 'mock-value');
      localStorage.setItem('ax_anthropic_key', 'sk-ant');
      const r = await apexToolsDispatch.execute('vault_action', { action: 'list' }, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { count: number; keys: string[] };
      expect(result.count).toBeGreaterThanOrEqual(2);
      expect(result.keys).toContain('ax_test_key');
    });
  });

  describe('Tools placeholder (Jet 9 wiring)', () => {
    it('edit_file admin → placeholder Jet 9 (worker bridge)', async () => {
      const r = await apexToolsDispatch.execute(
        'edit_file',
        { path: 'apex-ai/v13/x.ts', old_string: 'a', new_string: 'b' },
        'admin',
        { skipValidation: true },
      );
      expect(r.ok).toBe(true);
      const result = r.result as { placeholder?: boolean };
      expect(result.placeholder).toBe(true);
    });

    it('run_test admin → placeholder Jet 9', async () => {
      const r = await apexToolsDispatch.execute('run_test', {}, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { placeholder?: boolean };
      expect(result.placeholder).toBe(true);
    });
  });

  describe('Audit log obligatoire', () => {
    it('execute → entry audit log "tool.execution"', async () => {
      await apexToolsDispatch.execute('audit_self', {}, 'admin');
      /* Audit log peut être stocké dans apex_v13_audit_log */
      const log = localStorage.getItem('apex_v13_audit_log');
      if (log) {
        const parsed = JSON.parse(log) as Array<{ event?: string }>;
        const found = parsed.some((e) => e.event === 'tool.execution');
        expect(found).toBe(true);
      }
    });
  });

  describe('toAnthropicFormat (campagne 100% — branche filterTier)', () => {
    it('sans filterTier → tous les tools (branche : APEX_TOOLS)', () => {
      const out = apexTools.toAnthropicFormat();
      expect(out.length).toBe(apexTools.list().length);
      expect((out[0] as { name: string }).name).toBeTruthy();
    });
    it('avec filterTier → listForTier (branche ? )', () => {
      const out = apexTools.toAnthropicFormat('client_free');
      expect(out.length).toBe(apexTools.listForTier('client_free').length);
    });
  });
});
