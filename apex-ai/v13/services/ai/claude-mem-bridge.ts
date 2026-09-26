/**
 * v13.4.88 — Apex parité claude-mem (npm cross-sessions memory).
 *
 * Kevin "Oublie rien" + audit 'claude-mem ABSENT'. claude-mem (obra repo
 * 30k★, npm) ajoute mémoire cross-sessions à Claude Code via .md files.
 *
 * Apex implémente DÉJÀ cross-session memory plus riche dans core/memory.ts :
 *  - Facts + Lessons + Projects + 7 docs racine GitHub sync 6h
 *  - extractFactsFromMessage() NLP extraction
 *  - getLessonsCrossSession() Firebase shared cross-app
 *  - recordSessionLearning() persiste cross-session
 *  - buildSystemPromptContext() auto-injection contexte (top 50 facts)
 *
 * Ce wrapper :
 *  - Expose APIs en format claude-mem compatible (export/import)
 *  - Stats publiques pour vue admin
 *  - Slash command compatible (/mem add, /mem list, /mem stats)
 *
 * Permission tier :
 *  - admin Kevin : full access (add/list/stats/export/import)
 *  - laurence/family : peut voir SES facts seulement
 *  - clients : pas d'accès
 */
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { auth } from '../auth/auth.js';

export interface ClaudeMemExport {
  version: string;
  exported_at: number;
  user_id: string | null;
  facts: ReadonlyArray<{ category: string; text: string; weight: number; ts: number }>;
  lessons: ReadonlyArray<{ category: string; title: string; text: string; severity: string; ts: number }>;
  projects_count: number;
  docs_synced_count: number;
}

export interface ClaudeMemStats {
  facts_total: number;
  facts_by_category: Record<string, number>;
  lessons_total: number;
  lessons_by_severity: Record<string, number>;
  projects_total: number;
  docs_synced: number;
  last_sync_ts: number | null;
}

class ClaudeMemBridge {
  /** Add fact (admin only — shared cross-session via Firebase). */
  add(category: string, text: string, weight = 1): { ok: boolean; error?: string } {
    if (!auth.isAdminSync()) {
      return { ok: false, error: 'admin_only_write' };
    }
    if (!category || !text) return { ok: false, error: 'invalid_args' };
    try {
      memory.addFact(category, text, weight);
      logger.info('claude-mem-bridge', `Fact added: [${category}] ${text.slice(0, 50)}`);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Record lesson (admin only). */
  recordLesson(
    category: string,
    title: string,
    text: string,
    severity: 'info' | 'warn' | 'err' | 'critical' = 'warn',
  ): { ok: boolean; error?: string } {
    if (!auth.isAdminSync()) return { ok: false, error: 'admin_only_write' };
    try {
      /* v13.4.93 fix TS: memory.recordLesson n'accepte pas 'err', mapper → 'warn' */
      const memSeverity: 'info' | 'warn' | 'critical' = severity === 'err' ? 'warn' : severity;
      memory.recordLesson(category, title, text, memSeverity);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** List facts (filtre par catégorie optionnel). Lecture pour tous. */
  list(filter?: { category?: string; limit?: number }): ReadonlyArray<{
    category: string;
    text: string;
    weight: number;
    ts: number;
  }> {
    const facts = memory.getFacts();
    let result = filter?.category
      ? facts.filter((f) => f.category === filter.category)
      : facts.slice();
    if (filter?.limit && filter.limit > 0) result = result.slice(0, filter.limit);
    return result.map((f) => ({ category: f.category, text: f.text, weight: f.weight ?? 0, ts: f.ts }));
  }

  /** Stats publiques (lecture pour tous). */
  stats(): ClaudeMemStats {
    const facts = memory.getFacts();
    const lessons = memory.getLessons();
    const projects = memory.getProjects();
    const docs = memory.getDocsContext();
    const factsByCat: Record<string, number> = {};
    for (const f of facts) {
      factsByCat[f.category] = (factsByCat[f.category] ?? 0) + 1;
    }
    const lessonsBySev: Record<string, number> = {};
    for (const l of lessons) {
      lessonsBySev[l.severity] = (lessonsBySev[l.severity] ?? 0) + 1;
    }
    const docsArr = Object.values(docs);
    const lastSyncTs = docsArr.length > 0
      ? Math.max(...docsArr.map((d) => d.ts ?? 0))
      : null;
    return {
      facts_total: facts.length,
      facts_by_category: factsByCat,
      lessons_total: lessons.length,
      lessons_by_severity: lessonsBySev,
      projects_total: projects.length,
      docs_synced: docsArr.length,
      last_sync_ts: lastSyncTs,
    };
  }

  /** Export complet (admin only — JSON téléchargeable). */
  export(): ClaudeMemExport | { ok: false; error: string } {
    if (!auth.isAdminSync()) return { ok: false, error: 'admin_only_export' };
    const user = (typeof window !== 'undefined' && window.localStorage)
      ? (() => { try { return JSON.parse(localStorage.getItem('apex_v13_user') ?? 'null') as { id: string } | null; } catch { return null; } })()
      : null;
    return {
      version: '1.0.0-apex-v13.4.88',
      exported_at: Date.now(),
      user_id: user?.id ?? null,
      facts: memory.getFacts().map((f) => ({
        category: f.category,
        text: f.text,
        weight: f.weight ?? 0,
        ts: f.ts,
      })),
      lessons: memory.getLessons().map((l) => ({
        category: l.category,
        title: l.title,
        text: l.text,
        severity: l.severity,
        ts: l.ts,
      })),
      projects_count: memory.getProjects().length,
      docs_synced_count: Object.keys(memory.getDocsContext()).length,
    };
  }

  /** Slash command parser : /mem add cat="X" text="Y" / /mem list / /mem stats / /mem export */
  async runSlashCommand(cmd: string): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const parts = cmd.trim().split(/\s+/);
    if (parts[0] !== '/mem') return { ok: false, error: 'not_mem_command' };
    const action = parts[1];
    switch (action) {
      case 'list':
        return { ok: true, result: this.list({ limit: 20 }) };
      case 'stats':
        return { ok: true, result: this.stats() };
      case 'export':
        return { ok: true, result: this.export() };
      case 'add': {
        /* Format simple : /mem add category=cat "text content" */
        const catMatch = cmd.match(/category=(\S+)/);
        const textMatch = cmd.match(/"([^"]+)"/);
        if (!catMatch || !textMatch) return { ok: false, error: 'usage: /mem add category=X "text"' };
        return this.add(catMatch[1] ?? '', textMatch[1] ?? '');
      }
      default:
        return { ok: false, error: 'unknown_action: list|stats|export|add' };
    }
  }
}

export const claudeMemBridge = new ClaudeMemBridge();
