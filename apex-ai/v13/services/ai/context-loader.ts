/**
 * APEX v13 — Context Loader (charge auto contexte au démarrage).
 *
 * Demande Kevin 2026-05-04 : "Loader automatique de contexte"
 *
 * Charge au boot :
 * - CLAUDE.md règles permanentes (top 7)
 * - NOTES_USER.md infos métier Kevin
 * - persistentMemory top 30 facts
 * - lessons learned top 10 critical
 * - APEX_PROJECTS_REGISTRY (10 projets)
 * - Last 10 sessions (sessionLogger)
 *
 * Injecté automatiquement dans system prompt IA via ai-router.
 * Refresh manuel via tool 'reload_context' ou cron 30 min.
 */

import { logger } from '../../core/logger.js';
import { persistentMemory } from '../storage/persistent-memory-store.js';

export interface LoadedContext {
  rules: string[];
  user_facts: string[];
  recent_memory: string[];
  lessons_critical: string[];
  projects: string[];
  recent_sessions: string[];
  loaded_at: number;
}

const KEVIN_PERMANENT_RULES = [
  '🎯 100/100 RÉEL chaque axe avant tout (Kevin 2026-05-04)',
  '👑 Kevin admin + Laurence + amis + famille = aucune règle externe',
  '🔍 Audit extérieur indépendant en continu (subagents parallèles)',
  '🔁 Reconsultation périodique CLAUDE.md + NOTES_USER + MEMO_RESUME',
  '🔬 Test en live en permanence à chaque action',
  '🤖 Automatise tout en autonomie totale',
  '🛡 PROTECTION ≠ STABILITÉ (jamais empiler wrappers protecteurs)',
];

const APEX_PROJECTS = [
  'APEX AI v13.0 (assistant personnel)',
  'CMCteams v9.593 (planning casino Monaco)',
  'Apex Chat (interface conversationnelle)',
  'Social Video Pipeline (vidéo réseaux sociaux)',
  'Télécommande KDMC (universal remote)',
  'CrackPass (gestionnaire mots de passe)',
  'KDMC / e-KDMC (apps Kevin DESARZENS)',
  'IA-KDMC (intelligence artificielle KDMC)',
];

class ContextLoader {
  private cache: LoadedContext | null = null;
  private cacheExpiry = 0;
  private readonly TTL_MS = 30 * 60 * 1000; /* 30 min */

  /**
   * Charge contexte complet (cached 30 min).
   */
  async load(scope = 'global', forceRefresh = false): Promise<LoadedContext> {
    if (!forceRefresh && this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }
    const ctx: LoadedContext = {
      rules: KEVIN_PERMANENT_RULES.slice(),
      user_facts: await this.loadUserFacts(scope),
      recent_memory: await this.loadRecentMemory(scope),
      lessons_critical: await this.loadCriticalLessons(),
      projects: APEX_PROJECTS.slice(),
      recent_sessions: await this.loadRecentSessions(),
      loaded_at: Date.now(),
    };
    this.cache = ctx;
    this.cacheExpiry = Date.now() + this.TTL_MS;
    logger.info('context-loader', `Context loaded (${ctx.rules.length} rules, ${ctx.user_facts.length} facts, ${ctx.recent_memory.length} memory entries)`);
    return ctx;
  }

  /**
   * Format pour injection system prompt IA.
   */
  async formatForSystemPrompt(scope = 'global'): Promise<string> {
    const ctx = await this.load(scope);
    const lines: string[] = [];
    lines.push('=== CONTEXTE APEX (chargé auto) ===');
    lines.push('');
    lines.push('RÈGLES PERMANENTES KEVIN (à respecter absolument):');
    for (const r of ctx.rules) lines.push(`- ${r}`);
    lines.push('');
    if (ctx.user_facts.length > 0) {
      lines.push('FAITS UTILISATEUR (mémoire):');
      for (const f of ctx.user_facts.slice(0, 20)) lines.push(`- ${f}`);
      lines.push('');
    }
    if (ctx.lessons_critical.length > 0) {
      lines.push('LEÇONS CRITIQUES (à éviter):');
      for (const l of ctx.lessons_critical.slice(0, 10)) lines.push(`- ${l}`);
      lines.push('');
    }
    lines.push('PROJETS ACTIFS:');
    for (const p of ctx.projects) lines.push(`- ${p}`);
    if (ctx.recent_sessions.length > 0) {
      lines.push('');
      lines.push('SESSIONS RÉCENTES:');
      for (const s of ctx.recent_sessions.slice(0, 5)) lines.push(`- ${s}`);
    }
    return lines.join('\n');
  }

  /**
   * Invalidate cache (force reload au prochain appel).
   */
  invalidate(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  /* === Helpers === */

  private async loadUserFacts(scope: string): Promise<string[]> {
    try {
      const facts = await persistentMemory.list({ category: 'profile', scope });
      const prefs = await persistentMemory.list({ category: 'preferences', scope });
      return [...facts, ...prefs]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 30)
        .map((f) => f.text);
    } catch {
      return [];
    }
  }

  private async loadRecentMemory(scope: string): Promise<string[]> {
    try {
      const recent = await persistentMemory.topForPrompt(scope, 30);
      return recent.map((e) => `[${e.category}] ${e.text}`);
    } catch {
      return [];
    }
  }

  private async loadCriticalLessons(): Promise<string[]> {
    try {
      const lessons = JSON.parse(localStorage.getItem('ax_lessons_learned_struct') ?? '[]') as Array<{
        title: string;
        text: string;
        severity: string;
        resolved?: boolean;
      }>;
      return lessons
        .filter((l) => l.severity === 'critical' && !l.resolved)
        .slice(-10)
        .map((l) => `${l.title}: ${l.text.slice(0, 200)}`);
    } catch {
      return [];
    }
  }

  private async loadRecentSessions(): Promise<string[]> {
    try {
      const sessions = JSON.parse(localStorage.getItem('apex_v13_sessions') ?? '[]') as Array<{
        ts: number;
        summary: string;
      }>;
      return sessions
        .slice(-10)
        .map((s) => `${new Date(s.ts).toISOString().slice(0, 10)}: ${s.summary}`);
    } catch {
      return [];
    }
  }
}

export const contextLoader = new ContextLoader();
