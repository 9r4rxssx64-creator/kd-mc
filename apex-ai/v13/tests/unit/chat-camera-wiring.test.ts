/**
 * Tests intégration camera button dans chat (anti-théâtre P0).
 * Prouve que le bouton 📷 dans chat est vraiment wired vers smart-camera.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '../../core/store.js';

describe('Chat camera button wiring (anti-théâtre)', () => {
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

  describe('Camera button rendered', () => {
    it('bouton ax-chat-camera présent dans render', async () => {
      const { render } = await import('../../features/chat/index.js');
      render(root);
      const btn = root.querySelector('#ax-chat-camera');
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('aria-label')).toContain('caméra');
    });

    it('bouton 📷 emoji visible', async () => {
      const { render } = await import('../../features/chat/index.js');
      render(root);
      const btn = root.querySelector('#ax-chat-camera');
      expect(btn?.textContent).toContain('📷');
    });

    it('title tooltip contient infos modes (photo, scan, QR, vidéo)', async () => {
      const { render } = await import('../../features/chat/index.js');
      render(root);
      const btn = root.querySelector('#ax-chat-camera');
      const title = btn?.getAttribute('title') ?? '';
      expect(title.toLowerCase()).toMatch(/photo|scan|qr|vid/i);
    });
  });

  describe('Camera button click → modal-sheet 4 modes', () => {
    it('click ouvre modal-sheet avec 4 choix', async () => {
      const { render } = await import('../../features/chat/index.js');
      render(root);
      const btn = root.querySelector<HTMLButtonElement>('#ax-chat-camera');
      btn?.click();
      /* Wait async dynamic imports + modal animation */
      await new Promise((r) => setTimeout(r, 250));
      const sheet = document.body.querySelector('.ax-sheet');
      expect(sheet).not.toBeNull();
      const choices = document.body.querySelectorAll('[data-choice]');
      expect(choices.length).toBe(4);
    });

    it('modal contient choix single + burst + qr_live + video_record', async () => {
      const { render } = await import('../../features/chat/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('#ax-chat-camera')?.click();
      await new Promise((r) => setTimeout(r, 250));
      const choiceIds = Array.from(document.body.querySelectorAll('[data-choice]')).map((el) => el.getAttribute('data-choice'));
      expect(choiceIds).toContain('single');
      expect(choiceIds).toContain('burst');
      expect(choiceIds).toContain('qr_live');
      expect(choiceIds).toContain('video_record');
    });

    it('choix single → smart-camera.captureSingle appelé (env happy-dom)', async () => {
      const { smartCamera } = await import('../../services/ai/smart-camera.js');
      const captureSpy = vi.spyOn(smartCamera, 'captureSingle');
      const { render } = await import('../../features/chat/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('#ax-chat-camera')?.click();
      await new Promise((r) => setTimeout(r, 250));
      const singleBtn = document.body.querySelector<HTMLButtonElement>('[data-choice="single"]');
      singleBtn?.click();
      await new Promise((r) => setTimeout(r, 350));
      /* En happy-dom : captureSingle ok=false reason=MediaDevices, mais le wiring est confirmé */
      expect(captureSpy).toHaveBeenCalled();
      captureSpy.mockRestore();
    });

    it('choix burst → smart-camera.captureBurst appelé', async () => {
      const { smartCamera } = await import('../../services/ai/smart-camera.js');
      const burstSpy = vi.spyOn(smartCamera, 'captureBurst');
      const { render } = await import('../../features/chat/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('#ax-chat-camera')?.click();
      await new Promise((r) => setTimeout(r, 250));
      const burstBtn = document.body.querySelector<HTMLButtonElement>('[data-choice="burst"]');
      burstBtn?.click();
      await new Promise((r) => setTimeout(r, 350));
      expect(burstSpy).toHaveBeenCalled();
      burstSpy.mockRestore();
    });

    it('choix qr_live → smart-camera.scanQrLive appelé', async () => {
      const { smartCamera } = await import('../../services/ai/smart-camera.js');
      const qrSpy = vi.spyOn(smartCamera, 'scanQrLive');
      const { render } = await import('../../features/chat/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('#ax-chat-camera')?.click();
      await new Promise((r) => setTimeout(r, 250));
      const qrBtn = document.body.querySelector<HTMLButtonElement>('[data-choice="qr_live"]');
      qrBtn?.click();
      await new Promise((r) => setTimeout(r, 350));
      expect(qrSpy).toHaveBeenCalled();
      qrSpy.mockRestore();
    });

    it('choix video_record → smart-camera.startVideoRecord appelé', async () => {
      const { smartCamera } = await import('../../services/ai/smart-camera.js');
      const videoSpy = vi.spyOn(smartCamera, 'startVideoRecord');
      const { render } = await import('../../features/chat/index.js');
      render(root);
      root.querySelector<HTMLButtonElement>('#ax-chat-camera')?.click();
      await new Promise((r) => setTimeout(r, 250));
      const videoBtn = document.body.querySelector<HTMLButtonElement>('[data-choice="video_record"]');
      videoBtn?.click();
      await new Promise((r) => setTimeout(r, 350));
      expect(videoSpy).toHaveBeenCalled();
      videoSpy.mockRestore();
    });
  });
});
