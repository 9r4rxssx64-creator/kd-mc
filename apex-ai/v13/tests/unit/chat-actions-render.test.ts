/**
 * Tests chat-actions-render v13.4.170 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression : génération HTML boutons actions message assistant.
 */
import { describe, expect, it } from 'vitest';
import {
  renderMessageActions,
  type MessageActionInput,
} from '../../features/chat/chat-actions-render.js';

describe('chat-actions-render renderMessageActions (v13.4.170)', () => {
  const baseMsg: MessageActionInput = {
    id: 'msg_xyz',
    role: 'assistant',
    text: 'Hello world',
  };

  describe('return empty string cases', () => {
    it('rôle user → chaîne vide', () => {
      expect(renderMessageActions({ ...baseMsg, role: 'user' })).toBe('');
    });

    it('rôle tool_card → chaîne vide', () => {
      expect(renderMessageActions({ ...baseMsg, role: 'tool_card' })).toBe('');
    });

    it('streaming=true → chaîne vide', () => {
      expect(renderMessageActions({ ...baseMsg, streaming: true })).toBe('');
    });

    it('text vide → chaîne vide', () => {
      expect(renderMessageActions({ ...baseMsg, text: '' })).toBe('');
    });
  });

  describe('génère HTML pour assistant non-streaming', () => {
    it('container .ax-msg-actions présent', () => {
      const r = renderMessageActions(baseMsg);
      expect(r).toContain('ax-msg-actions');
    });

    it('4 boutons : speak + copy + regen + export-pdf', () => {
      const r = renderMessageActions(baseMsg);
      expect(r).toContain('data-action="speak"');
      expect(r).toContain('data-action="copy"');
      expect(r).toContain('data-action="regen"');
      expect(r).toContain('data-action="export-pdf"');
    });

    it('icons emoji présents', () => {
      const r = renderMessageActions(baseMsg);
      expect(r).toContain('🔊');
      expect(r).toContain('📋');
      expect(r).toContain('🔄');
      expect(r).toContain('📄');
    });

    it('data-msg-id propagé sur chaque bouton', () => {
      const r = renderMessageActions({ ...baseMsg, id: 'specific_id_123' });
      const matches = r.match(/data-msg-id="specific_id_123"/g) ?? [];
      expect(matches.length).toBe(4);
    });

    it('aria-labels accessibles', () => {
      const r = renderMessageActions(baseMsg);
      expect(r).toContain('aria-label="Lire la réponse"');
      expect(r).toContain('aria-label="Copier le texte"');
      expect(r).toContain('aria-label="Régénérer"');
      expect(r).toContain('aria-label="Exporter PDF"');
    });

    it('title tooltips présents', () => {
      const r = renderMessageActions(baseMsg);
      expect(r).toContain('title="Lire la réponse à voix haute"');
      expect(r).toContain('title="Copier dans presse-papiers"');
      expect(r).toContain('title="Régénérer une autre réponse"');
      expect(r).toContain('title="Exporter en PDF"');
    });
  });

  describe('XSS-safe escape', () => {
    it('escape HTML dans msg.id', () => {
      const r = renderMessageActions({
        ...baseMsg,
        id: '<script>alert(1)</script>',
      });
      expect(r).not.toContain('<script>alert(1)</script>');
      expect(r).toContain('&lt;script&gt;');
    });

    it('escape quotes dans id', () => {
      const r = renderMessageActions({
        ...baseMsg,
        id: 'abc"xyz',
      });
      expect(r).toContain('&quot;');
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte renderMessageActions', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.renderMessageActions).toBe('function');
    });
  });
});
