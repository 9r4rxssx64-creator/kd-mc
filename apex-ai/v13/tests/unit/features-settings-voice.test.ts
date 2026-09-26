/**
 * Tests Settings — section Voice (61 voix + auto-read + test ▶ + définir défaut).
 *
 * Demande Kevin : "que je choisisse les voix".
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import * as voiceModule from '../../services/ai/voice.js';
import { store } from '../../core/store.js';

describe('Settings — section Voice', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="apex-root"></div>';
    root = document.getElementById('apex-root')!;
    store.init({ appVer: 'v13.0.0' });
    store.set('user', { id: 'kdmc_admin', name: 'Kevin', tier: 'admin' });
    store.set('isAdmin', true);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Render', () => {
    it('section Voice rendue avec titre 🔊', async () => {
      const { render } = await import('../../features/settings/index.js');
      render(root);
      expect(root.innerHTML).toContain('Voix');
      expect(root.innerHTML).toContain('🔊');
    });

    it('toggle auto-read présent', async () => {
      const { render } = await import('../../features/settings/index.js');
      render(root);
      const toggle = root.querySelector('#ax-settings-auto-read');
      expect(toggle).not.toBeNull();
      expect(toggle?.getAttribute('type')).toBe('checkbox');
    });

    it('div #ax-voice-list présent pour les voix', async () => {
      const { render } = await import('../../features/settings/index.js');
      render(root);
      expect(root.querySelector('#ax-voice-list')).not.toBeNull();
    });

    it('boutons catégorie (Tous/PRO/FUN/Thématique) présents', async () => {
      const { render } = await import('../../features/settings/index.js');
      render(root);
      const cats = root.querySelectorAll('.ax-voice-cat-btn');
      expect(cats.length).toBeGreaterThanOrEqual(4);
      const labels = Array.from(cats).map((c) => c.textContent?.trim());
      expect(labels).toContain('Tous');
      expect(labels).toContain('PRO');
      expect(labels).toContain('FUN');
    });
  });

  describe('wireVoiceSection', () => {
    it('hydrate la liste des voix après wire', async () => {
      const { render, wireVoiceSection } = await import('../../features/settings/index.js');
      render(root);
      await wireVoiceSection(root);
      const list = root.querySelector('#ax-voice-list');
      expect(list).not.toBeNull();
      const items = list?.querySelectorAll('.ax-voice-item') ?? [];
      /* Catalogue >= 50 voix attendu d'après audit Kevin */
      expect(items.length).toBeGreaterThanOrEqual(50);
    });

    it('hydrate auto-read toggle depuis localStorage', async () => {
      localStorage.setItem('apex_v13_chat_auto_read', '1');
      const { render, wireVoiceSection } = await import('../../features/settings/index.js');
      render(root);
      await wireVoiceSection(root);
      const toggle = root.querySelector<HTMLInputElement>('#ax-settings-auto-read');
      expect(toggle?.checked).toBe(true);
    });

    it('toggle auto-read change persiste dans localStorage', async () => {
      const { render, wireVoiceSection } = await import('../../features/settings/index.js');
      render(root);
      await wireVoiceSection(root);
      const toggle = root.querySelector<HTMLInputElement>('#ax-settings-auto-read');
      expect(toggle).not.toBeNull();
      toggle!.checked = true;
      toggle!.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 30));
      expect(localStorage.getItem('apex_v13_chat_auto_read')).toBe('1');
    });

    it('click bouton ▶ Test appelle voice.speak avec l\'id de la voix', async () => {
      const speakSpy = vi
        .spyOn(voiceModule, 'speak')
        .mockResolvedValue({ ok: true, voiceId: 'test', provider: 'web-speech' });
      vi.spyOn(voiceModule, 'stopAll').mockReturnValue();

      const { render, wireVoiceSection } = await import('../../features/settings/index.js');
      render(root);
      await wireVoiceSection(root);
      const testBtn = root.querySelector<HTMLButtonElement>('.ax-voice-item__action--test[data-test-voice]');
      expect(testBtn).not.toBeNull();
      const voiceId = testBtn!.getAttribute('data-test-voice');
      testBtn!.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(speakSpy).toHaveBeenCalled();
      const call = speakSpy.mock.calls[0];
      expect(call?.[1]).toBe(voiceId);
    });

    it('click bouton ★ Set appelle voice.setActiveVoice et persiste', async () => {
      const setSpy = vi.spyOn(voiceModule, 'setActiveVoice').mockResolvedValue();
      const { render, wireVoiceSection } = await import('../../features/settings/index.js');
      render(root);
      await wireVoiceSection(root);
      const setBtn = root.querySelector<HTMLButtonElement>('.ax-voice-item__action--set[data-set-voice]');
      expect(setBtn).not.toBeNull();
      const voiceId = setBtn!.getAttribute('data-set-voice');
      setBtn!.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(setSpy).toHaveBeenCalledWith(voiceId);
    });

    it('filtre catégorie PRO réduit la liste aux voix PRO', async () => {
      const { render, wireVoiceSection } = await import('../../features/settings/index.js');
      render(root);
      await wireVoiceSection(root);
      const proBtn = root.querySelector<HTMLButtonElement>('.ax-voice-cat-btn[data-cat="pro"]');
      expect(proBtn).not.toBeNull();
      proBtn!.click();
      await new Promise((r) => setTimeout(r, 30));
      const items = root.querySelectorAll('#ax-voice-list .ax-voice-item');
      /* Au moins 10 voix PRO d'après audit catalog Kevin */
      expect(items.length).toBeGreaterThanOrEqual(10);
    });
  });
});
