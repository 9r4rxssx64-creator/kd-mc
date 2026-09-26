/**
 * Tests chat-api-format v13.4.169 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression : transformation conversation → format Anthropic API.
 */
import { describe, expect, it } from 'vitest';
import { buildMessagesForApi } from '../../features/chat/chat-api-format.js';

describe('chat-api-format buildMessagesForApi (v13.4.169)', () => {
  describe('filtrage messages', () => {
    it('filtre tool_card', () => {
      const r = buildMessagesForApi([
        { role: 'user', text: 'hello' },
        { role: 'tool_card', text: '🔧 tool' },
        { role: 'assistant', text: 'hi' },
      ]);
      expect(r.length).toBe(2);
      expect(r.every((m) => m.role !== 'tool_card' as never)).toBe(true);
    });

    it('filtre streaming sauf excludeMsg', () => {
      const streamingMsg = { role: 'assistant' as const, text: 'partial', streaming: true };
      const r = buildMessagesForApi([
        { role: 'user', text: 'hello' },
        streamingMsg,
      ]);
      expect(r.length).toBe(1); /* streamingMsg filtré */
    });

    it('excludeMsg exclu même si présent dans conversation', () => {
      const exclude = { role: 'user' as const, text: 'should exclude' };
      const r = buildMessagesForApi([
        { role: 'user', text: 'hello' },
        exclude,
        { role: 'assistant', text: 'hi' },
      ], exclude);
      expect(r.length).toBe(2);
      expect(r.find((m) => typeof m.content === 'string' && m.content === 'should exclude')).toBeUndefined();
    });

    it('cap maxContext (default 30)', () => {
      const msgs = Array.from({ length: 50 }, (_, i) => ({
        role: 'user' as const,
        text: `msg ${i}`,
      }));
      const r = buildMessagesForApi(msgs);
      expect(r.length).toBe(30);
    });

    it('maxContext custom', () => {
      const msgs = Array.from({ length: 50 }, (_, i) => ({
        role: 'user' as const,
        text: `msg ${i}`,
      }));
      const r = buildMessagesForApi(msgs, undefined, 5);
      expect(r.length).toBe(5);
    });

    it('garde derniers messages (slice -N)', () => {
      const msgs = Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        text: `msg ${i}`,
      }));
      const r = buildMessagesForApi(msgs, undefined, 3);
      expect(r.length).toBe(3);
      expect((r[0]?.content as string)).toBe('msg 7');
      expect((r[2]?.content as string)).toBe('msg 9');
    });
  });

  describe('attachments (vision Anthropic)', () => {
    it('user avec attachment image → content array', () => {
      const r = buildMessagesForApi([
        {
          role: 'user',
          text: 'Analyse cette image',
          attachments: [{ mime: 'image/png', base64: 'data:image/png;base64,AAA', name: 'cat.png' }],
        },
      ]);
      expect(Array.isArray(r[0]?.content)).toBe(true);
      const arr = r[0]?.content as Array<{ type: string; [k: string]: unknown }>;
      expect(arr[0]?.type).toBe('image');
      expect(arr[1]?.type).toBe('text');
    });

    it('strip prefix data:...;base64, du base64', () => {
      const r = buildMessagesForApi([
        {
          role: 'user',
          text: '',
          attachments: [{ mime: 'image/jpeg', base64: 'data:image/jpeg;base64,XYZ123', name: 'x.jpg' }],
        },
      ]);
      const arr = r[0]?.content as Array<{ type: string; source?: { data?: string } }>;
      expect(arr[0]?.source?.data).toBe('XYZ123');
    });

    it('attachment non-image ignoré', () => {
      const r = buildMessagesForApi([
        {
          role: 'user',
          text: 'Lire ce PDF',
          attachments: [{ mime: 'application/pdf', base64: 'data:application/pdf;base64,PDF', name: 'doc.pdf' }],
        },
      ]);
      const arr = r[0]?.content as Array<{ type: string }>;
      const imageItems = arr.filter((a) => a.type === 'image');
      expect(imageItems.length).toBe(0);
    });

    it('user sans text avec attachment → content array sans text item', () => {
      const r = buildMessagesForApi([
        {
          role: 'user',
          text: '',
          attachments: [{ mime: 'image/png', base64: 'data:image/png;base64,AAA', name: 'x.png' }],
        },
      ]);
      const arr = r[0]?.content as Array<{ type: string }>;
      expect(arr.length).toBe(1);
      expect(arr[0]?.type).toBe('image');
    });

    it('user avec text seul (pas attachment) → content string', () => {
      const r = buildMessagesForApi([
        { role: 'user', text: 'Hello' },
      ]);
      expect(typeof r[0]?.content).toBe('string');
      expect(r[0]?.content).toBe('Hello');
    });

    it('assistant avec attachments ignorés → content string', () => {
      const r = buildMessagesForApi([
        {
          role: 'assistant',
          text: 'Reply',
          attachments: [{ mime: 'image/png', base64: 'data:image/png;base64,AAA', name: 'x.png' }],
        },
      ]);
      expect(typeof r[0]?.content).toBe('string');
      expect(r[0]?.content).toBe('Reply');
    });
  });

  describe('edge cases', () => {
    it('conversation vide → []', () => {
      expect(buildMessagesForApi([])).toEqual([]);
    });

    it('uniquement tool_cards → []', () => {
      const r = buildMessagesForApi([
        { role: 'tool_card', text: 'x' },
        { role: 'tool_card', text: 'y' },
      ]);
      expect(r).toEqual([]);
    });

    it('attachments array vide → content string', () => {
      const r = buildMessagesForApi([
        { role: 'user', text: 'Hello', attachments: [] },
      ]);
      expect(typeof r[0]?.content).toBe('string');
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte buildMessagesForApi', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.buildMessagesForApi).toBe('function');
    });
  });
});
