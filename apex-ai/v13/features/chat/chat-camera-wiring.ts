/**
 * APEX v13 — chat-camera-wiring.ts
 * Wiring du bouton caméra (#ax-chat-camera) : ouverture smart-camera
 * (4 modes), insertion du résultat dans le chat.
 *
 * Extrait de features/chat/index.ts render() (v13.4.299, refactor monolithe
 * sans régression). Aucune dépendance d'état module : DOM via rootEl + lazy
 * import smart-camera. Appelé par render().
 */
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/** Câble le bouton caméra du chat. */
export function wireCameraButton(rootEl: HTMLElement): void {
  const cameraBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-camera');
  cameraBtn?.addEventListener('click', () => {
    haptic.tap();
    void (async () => {
      try {
        const { smartCamera } = await import('../../services/ai/smart-camera.js');
        const { adminPrompt } = await import('../../services/admin/admin-prompt.js');
        const mode = await adminPrompt.askChoice('📷 Caméra', 'Choisis le mode :', [
          { id: 'single', label: 'Photo simple', emoji: '📷', variant: 'primary' },
          { id: 'burst', label: 'Rafale (5 photos)', emoji: '⚡', variant: 'ghost' },
          { id: 'qr_live', label: 'Scanner QR/Code-barre', emoji: '⬛', variant: 'ghost' },
          { id: 'video_record', label: 'Enregistrer vidéo (30s)', emoji: '🎬', variant: 'ghost' },
        ]);
        if (!mode) return;
        if (mode === 'single') {
          const r = await smartCamera.captureSingle();
          if (!r.ok) {
            toast.error(r.reason ?? 'Capture échouée');
            return;
          }
          /* Affiche photo dans chat (data URL) */
          const dataUrl = r.dataUrls?.[0];
          if (dataUrl) {
            const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
            if (scroll) {
              const card = document.createElement('div');
              card.className = 'ax-msg ax-msg-user ax-slide-up-fade';
              /* P1 SECU XSS (audit v13.2.7) : dataUrl peut être malveillant
               * (ex: javascript: scheme via Web Capture exotique). Construire
               * via createElement + .src pour bloquer les schemes dangereux. */
              const img = document.createElement('img');
              img.alt = 'Capture caméra';
              img.style.maxWidth = '100%';
              img.style.borderRadius = '8px';
              /* Validation explicite scheme data:image/ uniquement */
              if (typeof dataUrl === 'string' && /^data:image\/[a-z+]+;base64,/i.test(dataUrl)) {
                img.src = dataUrl;
              } else if (typeof dataUrl === 'string' && /^https?:/.test(dataUrl)) {
                img.src = dataUrl;
              }
              card.appendChild(img);
              scroll.appendChild(card);
              scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
            }
            toast.success('Photo capturée');
          }
        } else if (mode === 'burst') {
          const r = await smartCamera.captureBurst(5, 200);
          toast.info(r.ok ? `${r.count} photos capturées` : (r.reason ?? 'Échec'));
        } else if (mode === 'qr_live') {
          await smartCamera.scanQrLive(
            (codes) => {
              for (const code of codes) toast.success(`📦 ${code.format}: ${code.rawValue.slice(0, 80)}`);
            },
            { durationMs: 15_000 },
          );
        } else if (mode === 'video_record') {
          const start = await smartCamera.startVideoRecord(30_000);
          if (!start.ok) {
            toast.error(start.reason ?? 'Recording impossible');
            return;
          }
          toast.info('🔴 Enregistrement 30s...');
          setTimeout(() => {
            void smartCamera.stopVideoRecord().then((stop) => {
              if (stop.ok) toast.success(`Vidéo ${Math.round((stop.blob?.size ?? 0) / 1024)}KB`);
            });
          }, 30_000);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Erreur caméra');
      }
    })();
  });
}
