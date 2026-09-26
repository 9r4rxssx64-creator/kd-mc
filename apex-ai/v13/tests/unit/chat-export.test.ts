/**
 * Tests chat-export v13.4.173 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression :
 * - buildConversationMarkdown formate header/role/séparateur correctement
 * - tool_card filtré (jamais exporté)
 * - buildExportFilename génère nom YYYY-MM-DDTHH-MM-SS
 */
import { describe, expect, it } from 'vitest';

import {
  type ExportableMessage,
  buildConversationMarkdown,
  buildExportFilename,
  buildConversationHtml,
  buildShareFilename,
} from '../../features/chat/chat-export.js';

describe('chat-export buildConversationMarkdown (v13.4.173)', () => {
  const FIXED_DATE = new Date('2026-05-15T14:30:00Z');

  it('conversation vide → header seul + body vide', () => {
    const md = buildConversationMarkdown([], 'v13.4.173', FIXED_DATE);
    expect(md).toContain('# Conversation Apex');
    expect(md).toContain('Version : v13.4.173');
    expect(md).toContain('---');
    /* Pas de "## 👤 Toi" ni "## 🤖 Apex" */
    expect(md).not.toContain('👤');
    expect(md).not.toContain('🤖');
  });

  it('1 message user → header + bloc user', () => {
    const messages: ExportableMessage[] = [{ role: 'user', text: 'Bonjour Apex' }];
    const md = buildConversationMarkdown(messages, 'v13.4.173', FIXED_DATE);
    expect(md).toContain('## 👤 Toi');
    expect(md).toContain('Bonjour Apex');
  });

  it('1 message assistant → bloc Apex', () => {
    const messages: ExportableMessage[] = [{ role: 'assistant', text: 'Salut Kevin' }];
    const md = buildConversationMarkdown(messages, 'v13.4.173', FIXED_DATE);
    expect(md).toContain('## 🤖 Apex');
    expect(md).toContain('Salut Kevin');
  });

  it('échange user→assistant→user séparé par `---`', () => {
    const messages: ExportableMessage[] = [
      { role: 'user', text: 'Q1' },
      { role: 'assistant', text: 'R1' },
      { role: 'user', text: 'Q2' },
    ];
    const md = buildConversationMarkdown(messages, 'v13.4.173', FIXED_DATE);
    /* Header --- séparateur + entre-tours --- */
    const seps = md.match(/\n---\n/g);
    expect(seps).not.toBeNull();
    /* 1 séparateur header + 2 entre les 3 messages = 3 minimum */
    expect((seps ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('tool_card est filtré (jamais dans le markdown)', () => {
    const messages: ExportableMessage[] = [
      { role: 'user', text: 'Lance un outil' },
      { role: 'tool_card', text: 'Tool: search_web result' },
      { role: 'assistant', text: 'Voici le résultat' },
    ];
    const md = buildConversationMarkdown(messages, 'v13.4.173', FIXED_DATE);
    expect(md).not.toContain('Tool: search_web result');
    expect(md).toContain('Lance un outil');
    expect(md).toContain('Voici le résultat');
  });

  it('header inclut date formatée FR + version', () => {
    const messages: ExportableMessage[] = [];
    const md = buildConversationMarkdown(messages, 'v99.99.99', FIXED_DATE);
    expect(md).toContain('Version : v99.99.99');
    /* Date FR : contient 2026 (année) */
    expect(md).toMatch(/2026/);
  });

  it('readonly array supporté (signature)', () => {
    const messages: readonly ExportableMessage[] = Object.freeze([
      { role: 'user' as const, text: 'froze' },
    ]);
    expect(() => buildConversationMarkdown(messages, 'v1.0.0', FIXED_DATE)).not.toThrow();
  });
});

describe('chat-export buildExportFilename (v13.4.173)', () => {
  it('génère nom YYYY-MM-DDTHH-MM-SS', () => {
    const filename = buildExportFilename(new Date('2026-05-15T14:30:45Z'));
    expect(filename).toBe('apex-conversation-2026-05-15T14-30-45.md');
  });

  it('extension .md toujours', () => {
    const filename = buildExportFilename(new Date());
    expect(filename).toMatch(/\.md$/);
  });

  it('préfixe apex-conversation- toujours', () => {
    const filename = buildExportFilename(new Date());
    expect(filename.startsWith('apex-conversation-')).toBe(true);
  });

  it('aucun caractère spécial filename-unsafe (:, .)', () => {
    const filename = buildExportFilename(new Date());
    /* `.` est OK pour l'extension finale, mais pas dans le timestamp */
    const withoutExt = filename.replace(/\.md$/, '');
    expect(withoutExt).not.toMatch(/[:.]/);
  });
});

describe('chat-export buildConversationHtml (v13.4.352 — partage)', () => {
  const D = new Date('2026-05-15T14:30:00Z');
  const msgs: ExportableMessage[] = [
    { role: 'user', text: 'Bonjour <b>xss</b>' },
    { role: 'assistant', text: 'Salut !' },
    { role: 'tool_card', text: 'IGNORÉ' },
  ];

  it('produit un document HTML autonome valide', () => {
    const html = buildConversationHtml(msgs, 'v13.4.352', D);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('v13.4.352');
  });
  it('échappe le contenu utilisateur (anti-XSS)', () => {
    const html = buildConversationHtml(msgs, 'v', D);
    expect(html).toContain('&lt;b&gt;xss&lt;/b&gt;');
    expect(html).not.toContain('<b>xss</b>');
  });
  it('filtre les tool_card', () => {
    const html = buildConversationHtml(msgs, 'v', D);
    expect(html).not.toContain('IGNORÉ');
  });
  it('inclut les deux rôles', () => {
    const html = buildConversationHtml(msgs, 'v', D);
    expect(html).toContain('👤 Toi');
    expect(html).toContain('🤖 Apex');
  });
  it('buildShareFilename → .html sans caractère unsafe', () => {
    const f = buildShareFilename(D);
    expect(f).toMatch(/\.html$/);
    expect(f.replace(/\.html$/, '')).not.toMatch(/[:.]/);
  });
});
