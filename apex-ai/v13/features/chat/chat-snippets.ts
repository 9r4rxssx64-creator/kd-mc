/**
 * APEX v13.4.166 — Chat code snippets storage (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - Gère stockage snippets de code dans localStorage (max 100, FIFO)
 * - Index séparé pour listing rapide (apex_v13_code_snippets_index)
 * - Préfix unique apex_v13_code_<ts>_<id> pour sécurité delete
 *
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 */

import { logger } from '../../core/logger.js';

const INDEX_KEY = 'apex_v13_code_snippets_index';
const KEY_PREFIX = 'apex_v13_code_';
const MAX_SNIPPETS = 100;

export interface CodeSnippet {
  key: string;
  code: string;
  lang: string;
  created: number;
  lines: number;
  size: number;
}

/**
 * Sauve un snippet de code dans le coffre (clear, pas crypto — règle Kevin).
 */
export async function saveCodeSnippet(
  code: string,
  lang?: string,
): Promise<{ ok: boolean; key?: string }> {
  try {
    const ts = Date.now();
    const id = Math.random().toString(36).slice(2, 8);
    const key = `${KEY_PREFIX}${ts}_${id}`;
    const entry = {
      code,
      lang: lang ?? 'unknown',
      created: ts,
      lines: code.split('\n').length,
      size: code.length,
    };
    localStorage.setItem(key, JSON.stringify(entry));
    /* Index pour listing rapide */
    let idx: string[] = [];
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (raw) idx = JSON.parse(raw) as string[];
    } catch {
      idx = [];
    }
    idx.unshift(key);
    if (idx.length > MAX_SNIPPETS) idx = idx.slice(0, MAX_SNIPPETS);
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    return { ok: true, key };
  } catch (err: unknown) {
    logger.warn('chat-snippets', 'saveCodeSnippet failed', { err });
    return { ok: false };
  }
}

/**
 * Liste tous les snippets sauvés (triés par date desc).
 * XSS-safe : valeurs JSON parsées, jamais innerHTML.
 */
export function listCodeSnippets(): CodeSnippet[] {
  try {
    const idxRaw = localStorage.getItem(INDEX_KEY);
    if (!idxRaw) return [];
    const idx = JSON.parse(idxRaw) as string[];
    const result: CodeSnippet[] = [];
    for (const key of idx) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as {
          code: string;
          lang: string;
          created: number;
          lines: number;
          size: number;
        };
        result.push({ key, ...entry });
      } catch {
        /* Entry corrompue, skip */
      }
    }
    return result;
  } catch (err: unknown) {
    logger.warn('chat-snippets', 'listCodeSnippets failed', { err });
    return [];
  }
}

/**
 * Supprime un snippet par sa clé (security : doit commencer par préfix attendu).
 */
export function deleteCodeSnippet(key: string): boolean {
  try {
    if (!key.startsWith(KEY_PREFIX)) return false;
    localStorage.removeItem(key);
    const idxRaw = localStorage.getItem(INDEX_KEY);
    if (idxRaw) {
      const idx = (JSON.parse(idxRaw) as string[]).filter((k) => k !== key);
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    }
    return true;
  } catch (err: unknown) {
    logger.warn('chat-snippets', 'deleteCodeSnippet failed', { err, key });
    return false;
  }
}
