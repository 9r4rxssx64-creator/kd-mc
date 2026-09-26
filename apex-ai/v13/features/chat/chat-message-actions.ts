/**
 * APEX v13 — chat-message-actions.ts
 * Actions sur un message assistant : 🔊 lecture vocale (TTS), 📋 copie,
 * 📄 export PDF (jsPDF lazy CDN).
 *
 * Extrait de features/chat/index.ts (v13.4.310, refactor monolithe). Aucune
 * dépendance d'état module. Appelés par la délégation d'actions de render().
 */
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

import type { DisplayMessage } from './index.js';

export async function handleSpeakAction(btn: HTMLButtonElement, msg: DisplayMessage): Promise<void> {
  haptic.tap();
  /* Toggle stop si déjà playing */
  if (btn.classList.contains('ax-playing')) {
    try {
      const { stopAll } = await import('../../services/ai/voice.js');
      stopAll();
    } catch {
      /* ignore — reset UI quoi qu'il arrive */
    }
    btn.classList.remove('ax-playing');
    btn.textContent = '🔊';
    return;
  }
  /* Stop tout autre playback en cours (un seul à la fois) */
  try {
    const { stopAll, speak, getActiveVoice } = await import('../../services/ai/voice.js');
    stopAll();
    /* Reset autres boutons playing */
    document.querySelectorAll<HTMLButtonElement>('.ax-msg-action.ax-playing').forEach((b) => {
      b.classList.remove('ax-playing');
      b.textContent = '🔊';
    });
    btn.classList.add('ax-playing');
    btn.textContent = '⏸';
    const voiceId = getActiveVoice();
    const result = await speak(msg.text, voiceId);
    if (!result.ok) {
      toast.warn(`Lecture impossible : ${result.reason ?? 'erreur'}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'erreur';
    toast.warn(`Lecture vocale échouée : ${message}`);
  } finally {
    /* Reset UI après speak (sync ou fail) */
    btn.classList.remove('ax-playing');
    btn.textContent = '🔊';
  }
}

/**
 * Handler pour bouton 📋 — copie texte dans presse-papiers.
 */
export async function handleCopyAction(msg: DisplayMessage): Promise<void> {
  haptic.tap();
  try {
    if (!navigator.clipboard?.writeText) {
      toast.warn('Presse-papiers non supporté par ton navigateur');
      return;
    }
    await navigator.clipboard.writeText(msg.text);
    haptic.success();
    toast.success('Copié dans presse-papiers');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'erreur';
    toast.warn(`Copie échouée : ${message}`);
  }
}

/**
 * Handler pour bouton 📄 — export PDF (lazy-load jsPDF).
 */
export async function handleExportPdfAction(msg: DisplayMessage): Promise<void> {
  haptic.tap();
  try {
    /* Lazy-load jsPDF via CDN. Dynamic import URL → bypass type-checking via variable. */
    const cdnUrl: string = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm';
    const mod = (await import(/* @vite-ignore */ cdnUrl)) as {
      jsPDF?: new () => unknown;
      default?: { jsPDF?: new () => unknown } | (new () => unknown);
    };
    const defaultExport = mod.default;
    const JsPDFCtor: unknown =
      mod.jsPDF ??
      (typeof defaultExport === 'function'
        ? defaultExport
        : (defaultExport as { jsPDF?: new () => unknown } | undefined)?.jsPDF);
    if (typeof JsPDFCtor !== 'function') {
      toast.warn('Export PDF indisponible');
      return;
    }
    const Ctor = JsPDFCtor as new () => {
      splitTextToSize: (t: string, w: number) => string[];
      text: (lines: string | string[], x: number, y: number) => void;
      addPage: () => void;
      save: (name: string) => void;
      internal: { pageSize: { getHeight: () => number; getWidth: () => number } };
    };
    const doc = new Ctor();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lines = doc.splitTextToSize(msg.text, 180);
    let cursorY = 20;
    const lineHeight = 7;
    for (const line of lines) {
      if (cursorY > pageHeight - 20) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(line, 15, cursorY);
      cursorY += lineHeight;
    }
    doc.save(`apex-${Date.now()}.pdf`);
    haptic.success();
    toast.success('PDF téléchargé');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'erreur';
    toast.warn(`Export PDF échoué : ${message}`);
  }
}
