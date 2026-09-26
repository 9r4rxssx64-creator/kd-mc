/**
 * APEX v13 — Projects / Workspaces.
 *
 * Parité flagship 2026 (ChatGPT Projects, Claude Projects, Perplexity Spaces).
 * Un projet = un ESPACE DE TRAVAIL qui regroupe des instructions + une base de
 * connaissances (notes/fichiers texte). Le projet ACTIF injecte instructions +
 * connaissances en tête du system prompt du chat → toutes les réponses sont
 * cadrées par le contexte du projet.
 *
 * Distinct des Assistants (persona seule) : ici on ajoute la BASE DE CONNAISSANCES.
 * Isolation per-user. Additif : ne touche pas le routage IA.
 */

import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';

export interface ProjectNote {
  title: string;
  content: string;
}

export interface Project {
  id: string;
  name: string;
  emoji: string;
  instructions: string;
  knowledge: ProjectNote[];
  createdAt: number;
  updatedAt: number;
}

const PREFIX = 'apex_v13_projects_';
const ACTIVE_PREFIX = 'apex_v13_active_project_';
const MAX_PROJECTS = 40;
const MAX_NOTES = 30;
const MAX_INSTR = 8000;
const MAX_NOTE_LEN = 20000;
const MAX_INJECTION = 24000; /* borne le contexte injecté (budget tokens) */

function keyFor(uid: string): string {
  return `${PREFIX}${uid}`;
}
function activeKeyFor(uid: string): string {
  return `${ACTIVE_PREFIX}${uid}`;
}
function currentUid(): string {
  const u = store.get('user') as { id?: string } | null;
  return u?.id ?? 'anon';
}

function isValid(p: unknown): p is Project {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['name'] === 'string' &&
    (o['name'] as string).length > 0 &&
    typeof o['instructions'] === 'string' &&
    Array.isArray(o['knowledge']) &&
    typeof o['createdAt'] === 'number'
  );
}

class ProjectsStore {
  list(uid: string = currentUid()): Project[] {
    try {
      const raw = localStorage.getItem(keyFor(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isValid) : [];
    } catch (err) {
      logger.warn('projects', 'list failed', { err });
      return [];
    }
  }

  private persist(uid: string, arr: Project[]): void {
    try {
      localStorage.setItem(keyFor(uid), JSON.stringify(arr.slice(0, MAX_PROJECTS)));
    } catch (err) {
      logger.warn('projects', 'persist failed', { err });
    }
  }

  get(id: string, uid: string = currentUid()): Project | null {
    return this.list(uid).find((p) => p.id === id) ?? null;
  }

  save(
    input: { id?: string; name: string; emoji?: string; instructions?: string },
    uid: string = currentUid(),
  ): Project | null {
    const name = String(input.name ?? '').trim();
    if (!name) return null;
    const emoji = String(input.emoji ?? '').trim() || '📁';
    const instructions = String(input.instructions ?? '').trim().slice(0, MAX_INSTR);
    const now = Date.now();
    const arr = this.list(uid);
    const existing = input.id ? arr.find((p) => p.id === input.id) : null;
    if (existing) {
      existing.name = name;
      existing.emoji = emoji;
      existing.instructions = instructions;
      existing.updatedAt = now;
      this.persist(uid, arr);
      return existing;
    }
    if (arr.length >= MAX_PROJECTS) return null;
    const created: Project = {
      id: `proj_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      emoji,
      instructions,
      knowledge: [],
      createdAt: now,
      updatedAt: now,
    };
    arr.unshift(created);
    this.persist(uid, arr);
    return created;
  }

  remove(id: string, uid: string = currentUid()): boolean {
    const arr = this.list(uid);
    const next = arr.filter((p) => p.id !== id);
    if (next.length === arr.length) return false;
    this.persist(uid, next);
    if (this.getActiveId(uid) === id) this.setActive(null, uid);
    return true;
  }

  addNote(id: string, note: ProjectNote, uid: string = currentUid()): boolean {
    const arr = this.list(uid);
    const p = arr.find((x) => x.id === id);
    if (!p) return false;
    const title = String(note.title ?? '').trim() || 'Note';
    const content = String(note.content ?? '').trim().slice(0, MAX_NOTE_LEN);
    if (!content) return false;
    if (p.knowledge.length >= MAX_NOTES) return false;
    p.knowledge.push({ title, content });
    p.updatedAt = Date.now();
    this.persist(uid, arr);
    return true;
  }

  removeNote(id: string, idx: number, uid: string = currentUid()): boolean {
    const arr = this.list(uid);
    const p = arr.find((x) => x.id === id);
    if (!p || idx < 0 || idx >= p.knowledge.length) return false;
    p.knowledge.splice(idx, 1);
    p.updatedAt = Date.now();
    this.persist(uid, arr);
    return true;
  }

  getActiveId(uid: string = currentUid()): string | null {
    try {
      return localStorage.getItem(activeKeyFor(uid)) || null;
    } catch {
      return null;
    }
  }
  getActive(uid: string = currentUid()): Project | null {
    const id = this.getActiveId(uid);
    return id ? this.get(id, uid) : null;
  }
  setActive(id: string | null, uid: string = currentUid()): void {
    try {
      if (id && this.get(id, uid)) localStorage.setItem(activeKeyFor(uid), id);
      else localStorage.removeItem(activeKeyFor(uid));
    } catch (err) {
      logger.warn('projects', 'setActive failed', { err });
    }
  }

  /** Injection system prompt du projet actif (instructions + base de connaissances). */
  buildInjection(uid: string = currentUid()): string {
    const p = this.getActive(uid);
    if (!p) return '';
    let out = `\n\n=== PROJET ACTIF : ${p.emoji} ${p.name} ===\n`;
    if (p.instructions) out += `Instructions du projet (prioritaires) :\n${p.instructions}\n`;
    if (p.knowledge.length) {
      out += `\nBase de connaissances du projet (source de vérité, ne rien inventer au-delà) :\n`;
      for (const n of p.knowledge) {
        out += `\n--- ${n.title} ---\n${n.content}\n`;
        if (out.length > MAX_INJECTION) {
          out += `\n[… base de connaissances tronquée pour tenir dans le contexte …]\n`;
          break;
        }
      }
    }
    out += `=== FIN PROJET ===\n`;
    return out.slice(0, MAX_INJECTION);
  }
}

export const projects = new ProjectsStore();
