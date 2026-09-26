/**
 * APEX v13 — Tests deep claude-mem-bridge.ts (push coverage 71% → 95%+).
 *
 * Couvre les branches admin (add/recordLesson/export) + slash commands +
 * stats catégories/severities + edge cases (memory throws, user JSON corrupt).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const authIsAdminSyncMock = vi.fn();
vi.mock('../../services/auth/auth.js', () => ({
  auth: { isAdminSync: () => authIsAdminSyncMock() },
}));

const memoryAddFactMock = vi.fn();
const memoryRecordLessonMock = vi.fn();
const memoryGetFactsMock = vi.fn().mockReturnValue([]);
const memoryGetLessonsMock = vi.fn().mockReturnValue([]);
const memoryGetProjectsMock = vi.fn().mockReturnValue([]);
const memoryGetDocsContextMock = vi.fn().mockReturnValue({});
vi.mock('../../core/memory.js', () => ({
  memory: {
    addFact: (...args: unknown[]) => memoryAddFactMock(...args),
    recordLesson: (...args: unknown[]) => memoryRecordLessonMock(...args),
    getFacts: () => memoryGetFactsMock(),
    getLessons: () => memoryGetLessonsMock(),
    getProjects: () => memoryGetProjectsMock(),
    getDocsContext: () => memoryGetDocsContextMock(),
  },
}));

import { claudeMemBridge } from '../../services/ai/claude-mem-bridge.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  memoryGetFactsMock.mockReturnValue([]);
  memoryGetLessonsMock.mockReturnValue([]);
  memoryGetProjectsMock.mockReturnValue([]);
  memoryGetDocsContextMock.mockReturnValue({});
});

afterEach(() => {
  localStorage.clear();
});

describe('claude-mem-bridge — add (admin path)', () => {
  it('admin + valid args → ok=true + memory.addFact appelé', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = claudeMemBridge.add('cat1', 'fait perso', 5);
    expect(r.ok).toBe(true);
    expect(memoryAddFactMock).toHaveBeenCalledWith('cat1', 'fait perso', 5);
  });

  it('admin + weight default 1', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    claudeMemBridge.add('cat', 'text');
    expect(memoryAddFactMock).toHaveBeenCalledWith('cat', 'text', 1);
  });

  it('non-admin → admin_only_write', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = claudeMemBridge.add('cat', 'text');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_write');
  });

  it('admin + category vide → invalid_args', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = claudeMemBridge.add('', 'text');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_args');
  });

  it('admin + text vide → invalid_args', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = claudeMemBridge.add('cat', '');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_args');
  });

  it('admin + addFact throw → error captured', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    memoryAddFactMock.mockImplementationOnce(() => {
      throw new Error('Memory full');
    });
    const r = claudeMemBridge.add('cat', 'text');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Memory full');
  });

  it('admin + addFact throws non-Error → string fallback', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    memoryAddFactMock.mockImplementationOnce(() => {
      /* eslint-disable-next-line no-throw-literal -- test du cas runtime non-Error */
      throw 'string error';
    });
    const r = claudeMemBridge.add('cat', 'text');
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});

describe('claude-mem-bridge — recordLesson', () => {
  it('admin + warn severity → memory.recordLesson appelé', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = claudeMemBridge.recordLesson('cat', 'titre', 'détail', 'warn');
    expect(r.ok).toBe(true);
    expect(memoryRecordLessonMock).toHaveBeenCalledWith('cat', 'titre', 'détail', 'warn');
  });

  it('admin + severity err → mapped vers warn (v13.4.93 fix)', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    claudeMemBridge.recordLesson('cat', 't', 'd', 'err');
    expect(memoryRecordLessonMock).toHaveBeenCalledWith('cat', 't', 'd', 'warn');
  });

  it('admin + critical → memory critical', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    claudeMemBridge.recordLesson('cat', 't', 'd', 'critical');
    expect(memoryRecordLessonMock).toHaveBeenCalledWith('cat', 't', 'd', 'critical');
  });

  it('non-admin → admin_only_write', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = claudeMemBridge.recordLesson('cat', 't', 'd', 'warn');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_write');
  });

  it('admin + recordLesson throw → error captured', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    memoryRecordLessonMock.mockImplementationOnce(() => {
      throw new Error('IDB down');
    });
    const r = claudeMemBridge.recordLesson('cat', 't', 'd', 'warn');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('IDB down');
  });
});

describe('claude-mem-bridge — list', () => {
  it('liste tous facts si pas de filtre', () => {
    memoryGetFactsMock.mockReturnValue([
      { category: 'a', text: 'fact1', weight: 5, ts: 1 },
      { category: 'b', text: 'fact2', weight: 3, ts: 2 },
    ]);
    const r = claudeMemBridge.list();
    expect(r).toHaveLength(2);
  });

  it('filter par category', () => {
    memoryGetFactsMock.mockReturnValue([
      { category: 'food', text: 'a', weight: 1, ts: 1 },
      { category: 'tech', text: 'b', weight: 1, ts: 2 },
    ]);
    const r = claudeMemBridge.list({ category: 'food' });
    expect(r).toHaveLength(1);
    expect(r[0]?.category).toBe('food');
  });

  it('limit limite la quantité', () => {
    memoryGetFactsMock.mockReturnValue([
      { category: 'a', text: '1', weight: 1, ts: 1 },
      { category: 'a', text: '2', weight: 1, ts: 2 },
      { category: 'a', text: '3', weight: 1, ts: 3 },
    ]);
    const r = claudeMemBridge.list({ limit: 2 });
    expect(r).toHaveLength(2);
  });

  it('weight undefined → fallback 0', () => {
    memoryGetFactsMock.mockReturnValue([{ category: 'a', text: 'x', ts: 1 }]);
    const r = claudeMemBridge.list();
    expect(r[0]?.weight).toBe(0);
  });
});

describe('claude-mem-bridge — stats', () => {
  it('compte facts/lessons/projects/docs', () => {
    memoryGetFactsMock.mockReturnValue([
      { category: 'a', text: 'x', weight: 1, ts: 1 },
      { category: 'a', text: 'y', weight: 1, ts: 2 },
      { category: 'b', text: 'z', weight: 1, ts: 3 },
    ]);
    memoryGetLessonsMock.mockReturnValue([
      { category: 'c', title: 't', text: 'x', severity: 'warn', ts: 1 },
      { category: 'c', title: 't', text: 'y', severity: 'critical', ts: 2 },
    ]);
    memoryGetProjectsMock.mockReturnValue([{ id: 'p1' }, { id: 'p2' }]);
    memoryGetDocsContextMock.mockReturnValue({
      'CLAUDE.md': { ts: 1000, content: 'x' },
      'NOTES.md': { ts: 2000, content: 'y' },
    });

    const s = claudeMemBridge.stats();
    expect(s.facts_total).toBe(3);
    expect(s.facts_by_category).toEqual({ a: 2, b: 1 });
    expect(s.lessons_total).toBe(2);
    expect(s.lessons_by_severity).toEqual({ warn: 1, critical: 1 });
    expect(s.projects_total).toBe(2);
    expect(s.docs_synced).toBe(2);
    expect(s.last_sync_ts).toBe(2000);
  });

  it('docs vides → last_sync_ts=null', () => {
    memoryGetDocsContextMock.mockReturnValue({});
    const s = claudeMemBridge.stats();
    expect(s.last_sync_ts).toBeNull();
  });

  it('docs ts manquants → fallback 0 dans max', () => {
    memoryGetDocsContextMock.mockReturnValue({
      'CLAUDE.md': { content: 'x' }, /* pas de ts */
      'NOTES.md': { ts: 500, content: 'y' },
    });
    const s = claudeMemBridge.stats();
    expect(s.last_sync_ts).toBe(500);
  });
});

describe('claude-mem-bridge — export', () => {
  it('admin → ClaudeMemExport avec version + facts + lessons', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    memoryGetFactsMock.mockReturnValue([{ category: 'a', text: 'x', weight: 5, ts: 1 }]);
    memoryGetLessonsMock.mockReturnValue([
      { category: 'l', title: 't', text: 'lesson', severity: 'info', ts: 2 },
    ]);
    memoryGetProjectsMock.mockReturnValue([{ id: 'p' }]);
    memoryGetDocsContextMock.mockReturnValue({ 'a.md': { ts: 1 } });

    const r = claudeMemBridge.export();
    if ('ok' in r && r.ok === false) {
      throw new Error('export failed');
    }
    expect(r.version).toContain('apex-v13.4.88');
    expect(r.facts).toHaveLength(1);
    expect(r.lessons).toHaveLength(1);
    expect(r.projects_count).toBe(1);
    expect(r.docs_synced_count).toBe(1);
  });

  it('admin + user JSON dans localStorage → user_id présent', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kdmc_admin' }));
    const r = claudeMemBridge.export();
    if ('ok' in r && r.ok === false) throw new Error('failed');
    expect(r.user_id).toBe('kdmc_admin');
  });

  it('admin + user JSON corrompu → user_id=null', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    localStorage.setItem('apex_v13_user', 'not json');
    const r = claudeMemBridge.export();
    if ('ok' in r && r.ok === false) throw new Error('failed');
    expect(r.user_id).toBeNull();
  });

  it('non-admin → ok=false, admin_only_export', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = claudeMemBridge.export();
    expect((r as { ok: boolean }).ok).toBe(false);
    expect((r as { error: string }).error).toBe('admin_only_export');
  });

  it('weight undefined dans fact → fallback 0', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    memoryGetFactsMock.mockReturnValue([{ category: 'a', text: 'x', ts: 1 }]);
    const r = claudeMemBridge.export();
    if ('ok' in r && r.ok === false) throw new Error('failed');
    expect(r.facts[0]?.weight).toBe(0);
  });
});

describe('claude-mem-bridge — runSlashCommand', () => {
  it('non /mem prefix → error not_mem_command', async () => {
    const r = await claudeMemBridge.runSlashCommand('/other foo');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_mem_command');
  });

  it('/mem list → returns array', async () => {
    memoryGetFactsMock.mockReturnValue([{ category: 'a', text: 'x', weight: 1, ts: 1 }]);
    const r = await claudeMemBridge.runSlashCommand('/mem list');
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.result)).toBe(true);
  });

  it('/mem stats → returns stats object', async () => {
    const r = await claudeMemBridge.runSlashCommand('/mem stats');
    expect(r.ok).toBe(true);
    expect(typeof r.result).toBe('object');
  });

  it('/mem export → si admin returns export', async () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = await claudeMemBridge.runSlashCommand('/mem export');
    expect(r.ok).toBe(true);
  });

  it('/mem add malformed → usage error', async () => {
    const r = await claudeMemBridge.runSlashCommand('/mem add');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('usage');
  });

  it('/mem add valid → admin add', async () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = await claudeMemBridge.runSlashCommand('/mem add category=tech "fait important"');
    expect(r.ok).toBe(true);
    expect(memoryAddFactMock).toHaveBeenCalledWith('tech', 'fait important', 1);
  });

  it('/mem add non-admin → admin_only', async () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = await claudeMemBridge.runSlashCommand('/mem add category=tech "text"');
    expect(r.ok).toBe(false);
  });

  it('/mem unknown_action → error', async () => {
    const r = await claudeMemBridge.runSlashCommand('/mem foobar');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown_action');
  });
});

describe('claude-mem-bridge — branches atteignables restantes (campagne 100%)', () => {
  beforeEach(() => { authIsAdminSyncMock.mockReturnValue(true); localStorage.clear(); });
  afterEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('recordLesson : memory.recordLesson throw non-Error (string) → String(err) (78)', () => {
    // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
    memoryRecordLessonMock.mockImplementation(() => { throw 'str-lesson'; });
    const r = claudeMemBridge.recordLesson('cat', 'titre', 'texte', 'warn');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('str-lesson');
  });

  it('export : apex_v13_user JSON invalide → catch interne → user_id null (130)', () => {
    localStorage.setItem('apex_v13_user', '{bad json');
    const r = claudeMemBridge.export() as { user_id: string | null };
    expect(r.user_id).toBeNull();
  });

  it('export : pas de apex_v13_user → getItem null → `?? "null"` (130)', () => {
    localStorage.removeItem('apex_v13_user');
    const r = claudeMemBridge.export() as { user_id: string | null };
    expect(r.user_id).toBeNull();
  });

  it('export : window.localStorage absent → ternaire else → user_id null (130 window.localStorage)', () => {
    vi.stubGlobal('window', {}); // window défini mais sans localStorage
    const r = claudeMemBridge.export() as { user_id: string | null };
    expect(r.user_id).toBeNull();
    vi.unstubAllGlobals();
  });
});
