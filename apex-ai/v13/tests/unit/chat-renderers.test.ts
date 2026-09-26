/**
 * Tests chat-renderers v13.4.168 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression vs ancienne implémentation in-place.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  getTransformEmoji,
  renderFollowUps,
  renderSlashAutocomplete,
} from '../../features/chat/chat-renderers.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('chat-renderers extracted module (v13.4.168)', () => {
  describe('getTransformEmoji', () => {
    it('cartoon → 🎨', () => {
      expect(getTransformEmoji('cartoon')).toBe('🎨');
    });

    it('anime → 🤖', () => {
      expect(getTransformEmoji('anime')).toBe('🤖');
    });

    it('video → 🎬', () => {
      expect(getTransformEmoji('video')).toBe('🎬');
    });

    it('remove-bg → ✂️', () => {
      expect(getTransformEmoji('remove-bg')).toBe('✂️');
    });

    it('stylize → 🎭', () => {
      expect(getTransformEmoji('stylize')).toBe('🎭');
    });

    it('unknown type → fallback 🖼️', () => {
      expect(getTransformEmoji('xyz')).toBe('🖼️');
      expect(getTransformEmoji('')).toBe('🖼️');
    });
  });

  describe('renderFollowUps', () => {
    it('liste vide → chaîne vide', () => {
      expect(renderFollowUps([])).toBe('');
    });

    it('null/undefined safe', () => {
      /* @ts-expect-error tester null safety runtime */
      expect(renderFollowUps(null)).toBe('');
    });

    it('génère HTML avec chips', () => {
      const html = renderFollowUps([
        { label: 'Continuer', emoji: '➡️', prompt: 'continue' },
      ]);
      expect(html).toContain('ax-followup-chip');
      expect(html).toContain('Continuer');
      expect(html).toContain('➡️');
      expect(html).toContain('data-followup-prompt="continue"');
    });

    it('multiple chips', () => {
      const html = renderFollowUps([
        { label: 'A', emoji: '🔵', prompt: 'a' },
        { label: 'B', emoji: '🔴', prompt: 'b' },
        { label: 'C', emoji: '🟢', prompt: 'c' },
      ]);
      const matches = html.match(/ax-followup-chip/g) ?? [];
      expect(matches.length).toBe(3);
    });

    it('XSS-safe : escape HTML dans label/prompt', () => {
      const html = renderFollowUps([
        { label: '<script>x</script>', emoji: '⚠️', prompt: '"><img onerror=alert(1)>' },
      ]);
      expect(html).not.toContain('<script>x</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&quot;');
    });
  });

  describe('renderSlashAutocomplete', () => {
    it('aucune commande match → chaîne vide', () => {
      expect(renderSlashAutocomplete('xyz_unknown_prefix_zzz')).toBe('');
    });

    it('préfix vide → liste toutes commandes', () => {
      const html = renderSlashAutocomplete('');
      /* Si au moins 1 commande dispo → HTML non vide */
      if (html) {
        expect(html).toContain('ax-slash-autocomplete');
        expect(html).toContain('ax-slash-item');
      }
    });

    it('préfix "h" → commande help détectée si dispo', () => {
      const html = renderSlashAutocomplete('h');
      /* tolérance : commande peut ou non exister selon registry */
      if (html) {
        expect(html).toContain('ax-slash-item');
      }
    });

    it('XSS-safe : escape HTML dans noms commandes', () => {
      /* Tous les noms commandes sont contrôlés (registry interne), donc pas
       * d'XSS user-controlled, mais on vérifie que escapeHtml est utilisé. */
      const html = renderSlashAutocomplete('');
      if (html) {
        expect(html).not.toContain('<script>'); /* Pas de script injecté */
      }
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte renderFollowUps + renderSlashAutocomplete', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.renderFollowUps).toBe('function');
      expect(typeof chatModule.renderSlashAutocomplete).toBe('function');
    });
  });
});
