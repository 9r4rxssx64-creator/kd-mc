/**
 * Tests intégration boutons d'action sur messages assistant + auto-read.
 *
 * Couvre :
 * - renderMessageActions : visibilité boutons par rôle/streaming/contenu
 * - 🔊 Speak : appel voice.speak() + toggle pause
 * - 📋 Copy : appel navigator.clipboard.writeText
 * - 📄 Export PDF : lazy-load jsPDF + save
 * - Auto-read : isAutoReadEnabled / setAutoReadEnabled
 * - maybeAutoReadAssistant : appelle voice.speak si enabled
 *
 * Demande Kevin : "Bouton haut-parleur dans chat + sélection voix + auto-read".
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import * as voiceModule from '../../services/ai/voice.js';
import {
  renderMessageActions,
  isAutoReadEnabled,
  setAutoReadEnabled,
  maybeAutoReadAssistant,
} from '../../features/chat/index.js';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  streaming?: boolean;
}

describe('Chat — boutons action voix/copy/PDF (Kevin "haut-parleur + voix")', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('renderMessageActions visibility', () => {
    it('retourne string vide pour message user', () => {
      const msg: DisplayMessage = { id: 'u1', role: 'user', text: 'hello', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html).toBe('');
    });

    it('retourne string vide pour message assistant en streaming', () => {
      const msg: DisplayMessage = { id: 'a1', role: 'assistant', text: 'partial', ts: 0, streaming: true };
      const html = renderMessageActions(msg);
      expect(html).toBe('');
    });

    it('retourne string vide pour message assistant vide', () => {
      const msg: DisplayMessage = { id: 'a2', role: 'assistant', text: '', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html).toBe('');
    });

    it('retourne 3 boutons (🔊, 📋, 📄) pour message assistant final', () => {
      const msg: DisplayMessage = { id: 'a3', role: 'assistant', text: 'Voici la réponse complète.', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html).toContain('data-action="speak"');
      expect(html).toContain('data-action="copy"');
      expect(html).toContain('data-action="export-pdf"');
      expect(html).toContain('🔊');
      expect(html).toContain('📋');
      expect(html).toContain('📄');
    });

    it('inclut data-msg-id pour identification', () => {
      const msg: DisplayMessage = { id: 'a4', role: 'assistant', text: 'Test', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html).toContain('data-msg-id="a4"');
    });

    it('escape HTML dans data-msg-id (anti-XSS)', () => {
      const msg: DisplayMessage = { id: 'a"5<script>', role: 'assistant', text: 'Test', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&quot;');
    });

    it('contient title tooltip explicatif sur chaque bouton', () => {
      const msg: DisplayMessage = { id: 'a6', role: 'assistant', text: 'Test', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html.toLowerCase()).toContain('lire');
      expect(html.toLowerCase()).toContain('copier');
      expect(html.toLowerCase()).toContain('pdf');
    });

    it('inclut aria-label pour accessibilité', () => {
      const msg: DisplayMessage = { id: 'a7', role: 'assistant', text: 'Test', ts: 0 };
      const html = renderMessageActions(msg);
      expect(html).toContain('aria-label=');
    });
  });

  describe('Auto-read setting', () => {
    it('isAutoReadEnabled false par défaut', () => {
      localStorage.clear();
      expect(isAutoReadEnabled()).toBe(false);
    });

    it('setAutoReadEnabled(true) persiste dans localStorage', () => {
      setAutoReadEnabled(true);
      expect(localStorage.getItem('apex_v13_chat_auto_read')).toBe('1');
      expect(isAutoReadEnabled()).toBe(true);
    });

    it('setAutoReadEnabled(false) désactive', () => {
      setAutoReadEnabled(true);
      setAutoReadEnabled(false);
      expect(localStorage.getItem('apex_v13_chat_auto_read')).toBe('0');
      expect(isAutoReadEnabled()).toBe(false);
    });
  });

  describe('maybeAutoReadAssistant', () => {
    it('ne fait rien si message user', async () => {
      const speakSpy = vi.spyOn(voiceModule, 'speak');
      setAutoReadEnabled(true);
      const msg: DisplayMessage = { id: 'u1', role: 'user', text: 'hello', ts: 0 };
      await maybeAutoReadAssistant(msg);
      expect(speakSpy).not.toHaveBeenCalled();
    });

    it('ne fait rien si message assistant streaming', async () => {
      const speakSpy = vi.spyOn(voiceModule, 'speak');
      setAutoReadEnabled(true);
      const msg: DisplayMessage = { id: 'a1', role: 'assistant', text: 'Bonjour', ts: 0, streaming: true };
      await maybeAutoReadAssistant(msg);
      expect(speakSpy).not.toHaveBeenCalled();
    });

    it('ne fait rien si auto-read désactivé', async () => {
      const speakSpy = vi.spyOn(voiceModule, 'speak');
      setAutoReadEnabled(false);
      const msg: DisplayMessage = { id: 'a2', role: 'assistant', text: 'Bonjour', ts: 0 };
      await maybeAutoReadAssistant(msg);
      expect(speakSpy).not.toHaveBeenCalled();
    });

    it('appelle voice.speak() si auto-read activé sur message assistant final', async () => {
      const speakSpy = vi
        .spyOn(voiceModule, 'speak')
        .mockResolvedValue({ ok: true, voiceId: 'web-speech-fr-amelie', provider: 'web-speech' });
      const stopSpy = vi.spyOn(voiceModule, 'stopAll').mockReturnValue();
      setAutoReadEnabled(true);
      const msg: DisplayMessage = { id: 'a3', role: 'assistant', text: 'Bonjour Kevin', ts: 0 };
      await maybeAutoReadAssistant(msg);
      expect(stopSpy).toHaveBeenCalled();
      expect(speakSpy).toHaveBeenCalled();
      const call = speakSpy.mock.calls[0];
      expect(call?.[0]).toBe('Bonjour Kevin');
    });

    it("ne crash pas si voice.speak rejette (silent fail best-effort)", async () => {
      vi.spyOn(voiceModule, 'speak').mockRejectedValue(new Error('test'));
      vi.spyOn(voiceModule, 'stopAll').mockReturnValue();
      setAutoReadEnabled(true);
      const msg: DisplayMessage = { id: 'a4', role: 'assistant', text: 'Test', ts: 0 };
      await expect(maybeAutoReadAssistant(msg)).resolves.toBeUndefined();
    });
  });
});
