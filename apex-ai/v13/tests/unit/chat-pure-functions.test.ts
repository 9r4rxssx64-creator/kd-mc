/**
 * Tests features/chat/index.ts — fonctions pures isolables (Kevin v13.4.206).
 *
 * Cibles : isAutoReadEnabled, setAutoReadEnabled, renderToolPills.
 * Ces fonctions ont leur propre logique testable sans monter le DOM complet.
 *
 * Coverage gap : chat/index.ts est à 30% — beaucoup des fonctions ci-dessus
 * ne sont JAMAIS testées en isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isAutoReadEnabled,
  setAutoReadEnabled,
  renderToolPills,
} from '../../features/chat/index.js';

interface DisplayMessageLike {
  id: string;
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
  ts: number;
  toolPills?: { name: string; status: 'running' | 'done' }[];
  toolBatchCount?: number;
}

const AUTO_READ_KEY = 'apex_v13_chat_auto_read';

describe('features/chat — isAutoReadEnabled / setAutoReadEnabled', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('default false si key absente', () => {
    expect(isAutoReadEnabled()).toBe(false);
  });

  it('returns true si key === "1"', () => {
    localStorage.setItem(AUTO_READ_KEY, '1');
    expect(isAutoReadEnabled()).toBe(true);
  });

  it('returns false si key === "0"', () => {
    localStorage.setItem(AUTO_READ_KEY, '0');
    expect(isAutoReadEnabled()).toBe(false);
  });

  it('returns false si key value invalide', () => {
    localStorage.setItem(AUTO_READ_KEY, 'truthy');
    expect(isAutoReadEnabled()).toBe(false);
  });

  it('setAutoReadEnabled(true) → key === "1"', () => {
    setAutoReadEnabled(true);
    expect(localStorage.getItem(AUTO_READ_KEY)).toBe('1');
    expect(isAutoReadEnabled()).toBe(true);
  });

  it('setAutoReadEnabled(false) → key === "0"', () => {
    setAutoReadEnabled(false);
    expect(localStorage.getItem(AUTO_READ_KEY)).toBe('0');
    expect(isAutoReadEnabled()).toBe(false);
  });

  it('toggle round-trip true → false → true', () => {
    setAutoReadEnabled(true);
    expect(isAutoReadEnabled()).toBe(true);
    setAutoReadEnabled(false);
    expect(isAutoReadEnabled()).toBe(false);
    setAutoReadEnabled(true);
    expect(isAutoReadEnabled()).toBe(true);
  });

  it('isAutoReadEnabled silent recovery si localStorage.getItem throw', () => {
    const orig = localStorage.getItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    expect(isAutoReadEnabled()).toBe(false);
    spy.mockRestore();
    /* Sanity : restoration OK */
    expect(orig).toBeDefined();
  });

  it('setAutoReadEnabled silent recovery si quota exceeded', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setAutoReadEnabled(true)).not.toThrow();
    spy.mockRestore();
  });
});

describe('features/chat — renderToolPills', () => {
  it('returns empty string si toolPills absent', () => {
    const msg: DisplayMessageLike = { id: 'a', role: 'assistant', text: 'hi', ts: 0 };
    expect(renderToolPills(msg as never)).toBe('');
  });

  it('returns empty string si toolPills vide', () => {
    const msg: DisplayMessageLike = { id: 'a', role: 'assistant', text: 'hi', ts: 0, toolPills: [] };
    expect(renderToolPills(msg as never)).toBe('');
  });

  it('all done → résumé compact <details> repliable', () => {
    const msg: DisplayMessageLike = {
      id: 'a', role: 'assistant', text: '', ts: 0,
      toolPills: [
        { name: 'web_search', status: 'done' },
        { name: 'generate_docx', status: 'done' },
      ],
    };
    const html = renderToolPills(msg as never);
    expect(html).toContain('<details');
    expect(html).toContain('▶');
    expect(html).toContain('2 opérations');
    expect(html).toContain('web_search');
    expect(html).toContain('generate_docx');
  });

  it('singular "opération" si 1 tool', () => {
    const msg: DisplayMessageLike = {
      id: 'a', role: 'assistant', text: '', ts: 0,
      toolPills: [{ name: 'web_search', status: 'done' }],
    };
    const html = renderToolPills(msg as never);
    expect(html).toContain('1 opération');
    expect(html).not.toContain('1 opérations');
  });

  it('utilise toolBatchCount si fourni (override length)', () => {
    const msg: DisplayMessageLike = {
      id: 'a', role: 'assistant', text: '', ts: 0,
      toolPills: [
        { name: 'web_search', status: 'done' },
        { name: 'generate_docx', status: 'done' },
      ],
      toolBatchCount: 7, /* override → "7 opérations" */
    };
    const html = renderToolPills(msg as never);
    expect(html).toContain('7 opérations');
  });

  it('en cours (mix running/done) → pills inline avec icônes', () => {
    const msg: DisplayMessageLike = {
      id: 'a', role: 'assistant', text: '', ts: 0,
      toolPills: [
        { name: 'web_search', status: 'running' },
        { name: 'generate_docx', status: 'done' },
      ],
    };
    const html = renderToolPills(msg as never);
    /* allDone === false → pas de <details>, juste inline */
    expect(html).not.toContain('<details');
    expect(html).toContain('🔧');
    expect(html).toContain('✅');
    expect(html).toContain('web_search');
    expect(html).toContain('generate_docx');
  });

  it('XSS hardening : noms échappés via escapeHtml', () => {
    const msg: DisplayMessageLike = {
      id: 'a', role: 'assistant', text: '', ts: 0,
      toolPills: [{ name: '<script>alert(1)</script>', status: 'done' }],
    };
    const html = renderToolPills(msg as never);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
