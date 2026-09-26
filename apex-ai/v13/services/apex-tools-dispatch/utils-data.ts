/**
 * APEX v13 — Dispatch utilities: utils-data.
 * Auto-split from services/apex-tools-dispatch.ts (refactor 2026-05-08).
 */

import { firebase } from '../storage/firebase.js';

export function jsonValidate(json: string): {
  valid: boolean;
  parsed?: unknown;
  error?: string;
  depth?: number;
  keys_count?: number;
} {
  if (!json) return { valid: false, error: 'Empty input' };
  try {
    const parsed: unknown = JSON.parse(json);
    const computeDepth = (obj: unknown, d = 0): number => {
      if (obj === null || typeof obj !== 'object') return d;
      const values = Array.isArray(obj) ? obj : Object.values(obj as Record<string, unknown>);
      if (values.length === 0) return d;
      return Math.max(...values.map((v) => computeDepth(v, d + 1)));
    };
    const countKeys = (obj: unknown): number => {
      if (obj === null || typeof obj !== 'object') return 0;
      if (Array.isArray(obj)) return obj.reduce<number>((acc, v) => acc + countKeys(v), 0);
      const entries = Object.entries(obj as Record<string, unknown>);
      return entries.length + entries.reduce<number>((acc, [, v]) => acc + countKeys(v), 0);
    };
    return {
      valid: true,
      parsed,
      depth: computeDepth(parsed),
      keys_count: countKeys(parsed),
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
export function csvParse(
  csv: string,
  delimiter?: string,
): { headers: string[]; rows: Record<string, string>[]; total: number } {
  if (!csv) throw new Error('csv required');
  const lines = csv.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [], total: 0 };
  const firstLine = lines[0] ?? '';
  const sep =
    delimiter ??
    (firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',');
  const headers = firstLine.split(sep).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(sep);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
  return { headers, rows, total: rows.length };
}
export function textDiff(
  before: string,
  after: string,
): { added: string[]; removed: string[]; unchanged: number; total_changes: number } {
  const beforeLines = (before ?? '').split('\n');
  const afterLines = (after ?? '').split('\n');
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const added = afterLines.filter((l) => !beforeSet.has(l));
  const removed = beforeLines.filter((l) => !afterSet.has(l));
  const unchanged = beforeLines.filter((l) => afterSet.has(l)).length;
  return {
    added,
    removed,
    unchanged,
    total_changes: added.length + removed.length,
  };
}
export async function hashText(text: string, algo = 'SHA-256'): Promise<{ algo: string; hash: string }> {
  if (!text) throw new Error('text required');
  const validAlgos = ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'];
  const safeAlgo = validAlgos.includes(algo) ? algo : 'SHA-256';
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest(safeAlgo, enc);
  const hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { algo: safeAlgo, hash };
}
export function base64EncodeDecode(mode: string, text: string): { mode: string; result: string } {
  if (!text) throw new Error('text required');
  if (mode === 'encode') {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return { mode, result: btoa(bin) };
  }
  if (mode === 'decode') {
    const bin = atob(text.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mode, result: new TextDecoder().decode(bytes) };
  }
  throw new Error(`Mode invalide: ${mode}`);
}
export function regexTest(
  pattern: string,
  text: string,
  flags?: string,
): { matches: string[]; groups: string[][]; total: number; valid: boolean; error?: string } {
  if (!pattern) throw new Error('pattern required');
  try {
    const safeFlags = (flags ?? '').replace(/[^gimsuy]/g, '');
    const re = new RegExp(pattern, safeFlags || 'g');
    const matches: string[] = [];
    const groups: string[][] = [];
    const txt = text ?? '';
    if (re.global) {
      for (const m of txt.matchAll(re)) {
        matches.push(m[0]);
        groups.push(m.slice(1).filter((g): g is string => g !== undefined));
      }
    } else {
      const m = txt.match(re);
      if (m) {
        matches.push(m[0]);
        groups.push(m.slice(1).filter((g): g is string => g !== undefined));
      }
    }
    return { matches, groups, total: matches.length, valid: true };
  } catch (err) {
    return {
      matches: [],
      groups: [],
      total: 0,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
export function jwtDecode(token: string): {
  valid: boolean;
  header?: unknown;
  payload?: unknown;
  error?: string;
} {
  if (!token) return { valid: false, error: 'Empty token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, error: 'JWT must have 3 parts' };
  try {
    const decode = (s: string): unknown => {
      const padded = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
      return JSON.parse(atob(pad)) as unknown;
    };
    return {
      valid: true,
      header: decode(parts[0] ?? ''),
      payload: decode(parts[1] ?? ''),
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
export function uuidGenerate(count = 1): { uuids: string[]; total: number } {
  const safeCount = Math.max(1, Math.min(50, Math.floor(count)));
  const uuids: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    uuids.push(typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : fallbackUuid());
  }
  return { uuids, total: uuids.length };
}
export function fallbackUuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  if (b[6] !== undefined) b[6] = (b[6] & 0x0f) | 0x40;
  if (b[8] !== undefined) b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function summarizeText(text: string, sentences = 3): { summary: string; total_sentences: number } {
  if (!text) throw new Error('text required');
  const allSentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
  if (allSentences.length === 0) {
    return { summary: text.slice(0, 200), total_sentences: 0 };
  }
  const stopwords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais',
    'que', 'qui', 'pour', 'dans', 'sur', 'avec', 'sans', 'this', 'that',
    'the', 'and', 'for', 'with', 'from', 'have', 'has', 'had', 'are', 'was',
  ]);
  const wordFreq: Record<string, number> = {};
  for (const s of allSentences) {
    const words = s.toLowerCase().match(/[\p{L}]{4,}/gu) ?? [];
    for (const w of words) {
      if (!stopwords.has(w)) wordFreq[w] = (wordFreq[w] ?? 0) + 1;
    }
  }
  const scored = allSentences.map((s, idx) => {
    const words = s.toLowerCase().match(/[\p{L}]{4,}/gu) ?? [];
    const score = words.reduce((acc, w) => acc + (wordFreq[w] ?? 0), 0);
    return { idx, sentence: s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const n = Math.max(1, Math.min(allSentences.length, sentences));
  const top = scored.slice(0, n).sort((a, b) => a.idx - b.idx);
  return {
    summary: top.map((s) => s.sentence).join(' '),
    total_sentences: allSentences.length,
  };
}
export function wordCount(text: string): {
  words: number;
  chars: number;
  chars_no_spaces: number;
  sentences: number;
  paragraphs: number;
  reading_time_minutes: number;
  flesch_score: number;
} {
  if (!text) {
    return {
      words: 0,
      chars: 0,
      chars_no_spaces: 0,
      sentences: 0,
      paragraphs: 0,
      reading_time_minutes: 0,
      flesch_score: 0,
    };
  }
  const words = (text.match(/\S+/g) ?? []).length;
  const chars = text.length;
  const chars_no_spaces = text.replace(/\s/g, '').length;
  const sentences = (text.match(/[.!?]+/g) ?? []).length || 1;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1;
  const reading_time_minutes = Math.max(1, Math.round(words / 200));
  const syllables = (text.toLowerCase().match(/[aeiouyàâéèêëîïôöùûü]+/g) ?? []).length || 1;
  const flesch =
    206.835 -
    1.015 * (words / sentences) -
    84.6 * (syllables / Math.max(1, words));
  return {
    words,
    chars,
    chars_no_spaces,
    sentences,
    paragraphs,
    reading_time_minutes,
    flesch_score: Math.round(flesch * 10) / 10,
  };
}
export function detectLanguage(text: string): { detected: string; confidence: number; scores: Record<string, number> } {
  if (!text) throw new Error('text required');
  const langWords: Record<string, string[]> = {
    fr: ['le', 'de', 'la', 'et', 'à', 'les', 'des', 'est', 'un', 'une', 'pour', 'que', 'qui', 'dans', 'sur', 'pas', 'avec', 'au', 'ce', 'sont'],
    en: ['the', 'of', 'and', 'to', 'a', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'with', 'as', 'his', 'they', 'be'],
    it: ['il', 'di', 'che', 'è', 'la', 'e', 'a', 'per', 'un', 'in', 'sono', 'mi', 'si', 'ho', 'lo', 'ha', 'le', 'una', 'ma', 'ti'],
    es: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para'],
    de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als'],
    pt: ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais'],
  };
  const lower = text.toLowerCase();
  const tokens = lower.match(/[\p{L}]+/gu) ?? [];
  const scores: Record<string, number> = {};
  for (const [lang, stops] of Object.entries(langWords)) {
    const hits = tokens.filter((t) => stops.includes(t)).length;
    scores[lang] = tokens.length > 0 ? hits / tokens.length : 0;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0] ?? ['fr', 0];
  return {
    detected: top[0],
    confidence: Math.round(top[1] * 1000) / 1000,
    scores,
  };
}
export function mindMapGenerate(topic: string, branches: string[]): { topic: string; markdown: string; nodes: number } {
  if (!topic) throw new Error('topic required');
  const safeBranches = Array.isArray(branches) ? branches.filter((b) => typeof b === 'string') : [];
  let md = `# ${topic}\n\n`;
  safeBranches.forEach((b, i) => {
    md += `## ${i + 1}. ${b}\n\n`;
  });
  if (safeBranches.length === 0) {
    md += `_(Pas de branches fournies — utilise le tool avec branches:[...])_\n`;
  }
  return {
    topic,
    markdown: md,
    nodes: 1 + safeBranches.length,
  };
}
export function createTask(
  title: string,
  description?: string,
  due?: string,
  priority: 'low' | 'normal' | 'high' | 'critical' = 'normal',
): { ok: boolean; task_id: string; total: number } {
  if (!title) throw new Error('title required');
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const task = {
    id: taskId,
    title: title.slice(0, 200),
    description: description?.slice(0, 1000) ?? '',
    due: due ?? '',
    priority,
    status: 'open',
    ts: Date.now(),
  };
  try {
    const list = JSON.parse(localStorage.getItem('apex_v13_tasks') ?? '[]') as unknown[];
    list.push(task);
    const trimmed = list.length > 500 ? list.slice(-500) : list;
    localStorage.setItem('apex_v13_tasks', JSON.stringify(trimmed));
    void firebase.write('apex_v13_tasks', trimmed);
    return { ok: true, task_id: taskId, total: trimmed.length };
  } catch {
    return { ok: false, task_id: taskId, total: 0 };
  }
}
