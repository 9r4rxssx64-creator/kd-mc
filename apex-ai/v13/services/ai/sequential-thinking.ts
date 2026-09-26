/**
 * APEX v13 — Sequential Thinking MCP (raisonnement multi-étapes).
 *
 * Innovation gratuite (audit Apex v13.3.73 issue #240) :
 * Permet à Apex IA de raisonner étape par étape sur problèmes complexes,
 * réviser une étape précédente si nouvelle info, brancher sur une alternative.
 * Inspiré du serveur officiel `@modelcontextprotocol/server-sequential-thinking`.
 *
 * Pourquoi (Kevin règle "tout au max") :
 * Plutôt que de répondre direct à un problème complexe (audit, debug, planification),
 * Apex décompose en N étapes traçables. Chaque étape peut être révisée ou branchée
 * (exploration alternative). À la fin, toute la chaîne est auditée → meilleure
 * qualité de réponse + traçabilité pour Kevin admin.
 *
 * Stockage IndexedDB (`apex_thoughts`) — 1000 thoughts max (FIFO rotation).
 *
 * API publique :
 *  - startThought(problem, estimated_steps?) → { thoughtId }
 *  - addStep(thoughtId, content, opts?) → { stepIndex, total }
 *  - revise(thoughtId, stepIndex, newContent) → mark step revised + log original
 *  - branch(thoughtId, fromStep, alternative) → create branch step
 *  - complete(thoughtId, conclusion) → return full chain
 *  - getThought(thoughtId) → entire chain pour audit UI
 *  - listThoughts(limit?) → recent thoughts (debug / UI)
 *  - getStats() → counts pour UI admin
 *
 * Anti-pattern Kevin : pas d'eval, pas d'écriture libre dans IDB hors classe,
 * cap stepIndex (200 max par thought pour éviter loop infinies),
 * status enum strict (active|completed|abandoned).
 */

import { logger } from '../../core/logger.js';

/* ========================================================================== */
/* Types publics */
/* ========================================================================== */

export type ThoughtStatus = 'active' | 'completed' | 'abandoned';
export type StepKind = 'thought' | 'revision' | 'branch';

export interface ThoughtStep {
  index: number;
  kind: StepKind;
  content: string;
  reflections?: string;
  /** Si kind=revision, index original que cette step revoit. */
  revises_step?: number;
  /** Si kind=branch, index parent depuis lequel branche commence. */
  branches_from?: number;
  /** Identifiant logique de la branche (default 'main', alternative names). */
  branch_id: string;
  can_revise: boolean;
  ts: number;
}

export interface Thought {
  id: string;
  problem: string;
  estimated_steps: number;
  steps: ThoughtStep[];
  status: ThoughtStatus;
  conclusion?: string;
  ts: number;
  updated_at: number;
}

export interface ThinkingStats {
  total: number;
  active: number;
  completed: number;
  abandoned: number;
  ready: boolean;
  storage: 'idb' | 'memory-fallback';
}

export interface AddStepOptions {
  reflections?: string;
  can_revise?: boolean;
  branch_id?: string;
}

/* ========================================================================== */
/* Constantes */
/* ========================================================================== */

const IDB_NAME = 'apex_thoughts';
const IDB_VERSION = 1;
const STORE = 'thoughts';

const MAX_THOUGHTS = 1_000;
const MAX_STEPS_PER_THOUGHT = 200;
const DEFAULT_ESTIMATED_STEPS = 5;

/* ========================================================================== */
/* Classe */
/* ========================================================================== */

class SequentialThinkingService {
  private initialized = false;
  private storage: ThinkingStats['storage'] = 'idb';

  /** In-memory mirror (mode memory-fallback uniquement). */
  private memThoughts = new Map<string, Thought>();

  /**
   * Init lazy (idempotent). Tente IDB ; si KO → memory-fallback.
   */
  async init(): Promise<ThinkingStats> {
    if (this.initialized) return this.getStats();
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IDB unavailable');
      await this.openDb();
      this.storage = 'idb';
      logger.info('sequential-thinking', 'init OK (IDB)');
    } catch (err: unknown) {
      this.storage = 'memory-fallback';
      logger.warn('sequential-thinking', 'IDB unavailable → memory-fallback', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    this.initialized = true;
    return this.getStats();
  }

  /* ======================================================================== */
  /* API publique */
  /* ======================================================================== */

  /**
   * Démarre un nouveau raisonnement. Retourne thoughtId à utiliser pour les
   * appels suivants.
   */
  async startThought(
    problem: string,
    estimatedSteps?: number,
  ): Promise<{ thoughtId: string }> {
    if (!this.initialized) await this.init();
    const cleanProblem = String(problem ?? '').trim();
    if (!cleanProblem) throw new Error('problem required');
    const steps = Math.max(
      1,
      Math.min(MAX_STEPS_PER_THOUGHT, estimatedSteps ?? DEFAULT_ESTIMATED_STEPS),
    );
    const id = `thought_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const thought: Thought = {
      id,
      problem: cleanProblem,
      estimated_steps: steps,
      steps: [],
      status: 'active',
      ts: now,
      updated_at: now,
    };
    await this.save(thought);
    await this.maybeRotate();
    return { thoughtId: id };
  }

  /**
   * Ajoute une étape de raisonnement à un thought existant et actif.
   */
  async addStep(
    thoughtId: string,
    content: string,
    opts: AddStepOptions = {},
  ): Promise<{ stepIndex: number; total: number }> {
    if (!this.initialized) await this.init();
    const thought = await this.requireActive(thoughtId);
    const cleanContent = String(content ?? '').trim();
    if (!cleanContent) throw new Error('content required');
    if (thought.steps.length >= MAX_STEPS_PER_THOUGHT) {
      throw new Error(`max steps reached (${MAX_STEPS_PER_THOUGHT})`);
    }
    const step: ThoughtStep = {
      index: thought.steps.length,
      kind: 'thought',
      content: cleanContent,
      branch_id: typeof opts.branch_id === 'string' && opts.branch_id ? opts.branch_id : 'main',
      can_revise: opts.can_revise !== false,
      ts: Date.now(),
    };
    if (typeof opts.reflections === 'string' && opts.reflections.trim()) {
      step.reflections = opts.reflections.trim();
    }
    thought.steps.push(step);
    thought.updated_at = Date.now();
    await this.save(thought);
    return { stepIndex: step.index, total: thought.steps.length };
  }

  /**
   * Revoit une étape précédente : remplace son contenu par newContent et marque
   * la révision. L'étape originale est conservée comme history dans `reflections`.
   */
  async revise(
    thoughtId: string,
    stepIndex: number,
    newContent: string,
  ): Promise<{ ok: true; revised_index: number; revision_step: number }> {
    if (!this.initialized) await this.init();
    const thought = await this.requireActive(thoughtId);
    const idx = Number(stepIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= thought.steps.length) {
      throw new Error(`stepIndex out of range: ${stepIndex}`);
    }
    const original = thought.steps[idx];
    if (!original) throw new Error(`step missing at index ${idx}`);
    if (!original.can_revise) {
      throw new Error(`step ${idx} marked non-revisable`);
    }
    if (thought.steps.length >= MAX_STEPS_PER_THOUGHT) {
      throw new Error(`max steps reached (${MAX_STEPS_PER_THOUGHT})`);
    }
    const cleanNew = String(newContent ?? '').trim();
    if (!cleanNew) throw new Error('newContent required');

    /* Crée step revision (kind=revision) qui pointe vers original */
    const revisionStep: ThoughtStep = {
      index: thought.steps.length,
      kind: 'revision',
      content: cleanNew,
      revises_step: idx,
      branch_id: original.branch_id,
      can_revise: true,
      ts: Date.now(),
      reflections: `original_content=${original.content}`,
    };
    thought.steps.push(revisionStep);
    thought.updated_at = Date.now();
    await this.save(thought);
    return { ok: true, revised_index: idx, revision_step: revisionStep.index };
  }

  /**
   * Crée une branche alternative depuis une étape donnée.
   * Le step de branche a kind='branch', branches_from=fromStep, et un branch_id
   * différent (par défaut 'branch_<n>').
   */
  async branch(
    thoughtId: string,
    fromStep: number,
    alternative: string,
  ): Promise<{ ok: true; branch_step: number; branch_id: string }> {
    if (!this.initialized) await this.init();
    const thought = await this.requireActive(thoughtId);
    const idx = Number(fromStep);
    if (!Number.isInteger(idx) || idx < 0 || idx >= thought.steps.length) {
      throw new Error(`fromStep out of range: ${fromStep}`);
    }
    if (thought.steps.length >= MAX_STEPS_PER_THOUGHT) {
      throw new Error(`max steps reached (${MAX_STEPS_PER_THOUGHT})`);
    }
    const cleanAlt = String(alternative ?? '').trim();
    if (!cleanAlt) throw new Error('alternative required');

    /* Compte branches existantes pour générer un id unique */
    const branchCount = thought.steps.filter((s) => s.kind === 'branch').length;
    const branchId = `branch_${branchCount + 1}`;
    const branchStep: ThoughtStep = {
      index: thought.steps.length,
      kind: 'branch',
      content: cleanAlt,
      branches_from: idx,
      branch_id: branchId,
      can_revise: true,
      ts: Date.now(),
    };
    thought.steps.push(branchStep);
    thought.updated_at = Date.now();
    await this.save(thought);
    return { ok: true, branch_step: branchStep.index, branch_id: branchId };
  }

  /**
   * Complète un thought. Retourne la chaîne complète pour audit/usage.
   */
  async complete(thoughtId: string, conclusion: string): Promise<Thought> {
    if (!this.initialized) await this.init();
    const thought = await this.requireActive(thoughtId);
    const cleanConclusion = String(conclusion ?? '').trim();
    if (!cleanConclusion) throw new Error('conclusion required');
    thought.conclusion = cleanConclusion;
    thought.status = 'completed';
    thought.updated_at = Date.now();
    await this.save(thought);
    return { ...thought, steps: thought.steps.map((s) => ({ ...s })) };
  }

  /**
   * Abandonne un thought (status='abandoned'). Préservé pour audit.
   */
  async abandon(thoughtId: string, reason?: string): Promise<{ ok: true }> {
    if (!this.initialized) await this.init();
    const thought = await this.requireActive(thoughtId);
    thought.status = 'abandoned';
    if (reason) thought.conclusion = `[abandoned] ${reason}`;
    thought.updated_at = Date.now();
    await this.save(thought);
    return { ok: true };
  }

  /**
   * Récupère un thought par id (toutes étapes incluses).
   */
  async getThought(thoughtId: string): Promise<Thought | null> {
    if (!this.initialized) await this.init();
    const t = await this.load(thoughtId);
    if (!t) return null;
    /* Deep clone pour éviter mutation accidentelle par le caller */
    return { ...t, steps: t.steps.map((s) => ({ ...s })) };
  }

  /**
   * Liste les N derniers thoughts (debug / UI admin).
   */
  async listThoughts(limit = 50): Promise<Thought[]> {
    if (!this.initialized) await this.init();
    const cap = Math.max(1, Math.min(MAX_THOUGHTS, limit));
    if (this.storage === 'memory-fallback') {
      const all = Array.from(this.memThoughts.values());
      all.sort((a, b) => b.updated_at - a.updated_at);
      return all.slice(0, cap).map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s })) }));
    }
    const all = await this.idbGetAll();
    all.sort((a, b) => b.updated_at - a.updated_at);
    return all.slice(0, cap).map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s })) }));
  }

  /**
   * Stats pour UI admin.
   */
  async getStats(): Promise<ThinkingStats> {
    const base: ThinkingStats = {
      total: 0,
      active: 0,
      completed: 0,
      abandoned: 0,
      ready: this.initialized,
      storage: this.storage,
    };
    if (!this.initialized) return base;
    const all = this.storage === 'memory-fallback'
      ? Array.from(this.memThoughts.values())
      : await this.idbGetAll();
    base.total = all.length;
    for (const t of all) {
      if (t.status === 'active') base.active += 1;
      else if (t.status === 'completed') base.completed += 1;
      else base.abandoned += 1;
    }
    return base;
  }

  /**
   * Reset complet (debug / RGPD erase).
   */
  async reset(): Promise<void> {
    if (this.storage === 'memory-fallback') {
      this.memThoughts.clear();
      return;
    }
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('reset failed'));
      });
    } catch (err) {
      logger.warn('sequential-thinking', 'reset failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /* ======================================================================== */
  /* IDB internals */
  /* ======================================================================== */

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('ts', 'ts', { unique: false });
          store.createIndex('updated_at', 'updated_at', { unique: false });
        }
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => reject(req.error ?? new Error('IDB open failed'));
    });
  }

  private async save(thought: Thought): Promise<void> {
    if (this.storage === 'memory-fallback') {
      this.memThoughts.set(thought.id, thought);
      return;
    }
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(thought);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void => reject(tx.error ?? new Error('save failed'));
    });
  }

  private async load(id: string): Promise<Thought | null> {
    if (this.storage === 'memory-fallback') {
      return this.memThoughts.get(id) ?? null;
    }
    try {
      const db = await this.openDb();
      return await new Promise<Thought | null>((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(id);
          req.onsuccess = (): void => resolve((req.result as Thought | undefined) ?? null);
          req.onerror = (): void => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  private async idbGetAll(): Promise<Thought[]> {
    try {
      const db = await this.openDb();
      return await new Promise<Thought[]>((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = (): void => resolve((req.result as Thought[]) ?? []);
          req.onerror = (): void => resolve([]);
        } catch {
          resolve([]);
        }
      });
    } catch {
      return [];
    }
  }

  private async requireActive(thoughtId: string): Promise<Thought> {
    const cleanId = String(thoughtId ?? '').trim();
    if (!cleanId) throw new Error('thoughtId required');
    const t = await this.load(cleanId);
    if (!t) throw new Error(`thought not found: ${cleanId}`);
    if (t.status !== 'active') {
      throw new Error(`thought is ${t.status} (cannot mutate)`);
    }
    return t;
  }

  private async maybeRotate(): Promise<void> {
    if (this.storage === 'memory-fallback') {
      if (this.memThoughts.size <= MAX_THOUGHTS) return;
      const sorted = Array.from(this.memThoughts.values()).sort((a, b) => a.ts - b.ts);
      const toDelete = sorted.slice(0, sorted.length - MAX_THOUGHTS);
      for (const t of toDelete) this.memThoughts.delete(t.id);
      return;
    }
    const all = await this.idbGetAll();
    if (all.length <= MAX_THOUGHTS) return;
    all.sort((a, b) => a.ts - b.ts);
    const toDelete = all.slice(0, all.length - MAX_THOUGHTS);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const t of toDelete) store.delete(t.id);
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error('rotate failed'));
      });
    } catch (err) {
      logger.warn('sequential-thinking', 'maybeRotate failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/* ========================================================================== */
/* Singleton */
/* ========================================================================== */

export const sequentialThinking = new SequentialThinkingService();
