/**
 * APEX v13 — chat-autoread.ts
 * Lecture vocale automatique des réponses assistant (TTS best-effort).
 *
 * Extrait de features/chat/index.ts (v13.4.293, refactor monolithe sans
 * régression). Re-exporté par index.ts (façade backward-compat — tests +
 * callers internes inchangés).
 */
import { logger } from '../../core/logger.js';

const AUTO_READ_KEY = 'apex_v13_chat_auto_read';

/** Sous-type minimal requis par maybeAutoReadAssistant (compatible DisplayMessage). */
export interface AutoReadMessage {
  role: 'user' | 'assistant' | 'tool_card';
  streaming?: boolean;
  text: string;
}

export function isAutoReadEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_READ_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Active/désactive auto-read.
 */
export function setAutoReadEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_READ_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Lit à voix haute le message assistant si auto-read activé. Best-effort
 * (lazy-load du service voice, silent fail). Stoppe toute lecture en cours.
 */
export async function maybeAutoReadAssistant(msg: AutoReadMessage): Promise<void> {
  if (msg.role !== 'assistant' || msg.streaming) return;
  if (!msg.text || msg.text.length === 0) return;
  if (!isAutoReadEnabled()) return;
  try {
    const { speak, getActiveVoice, stopAll } = await import('../../services/ai/voice.js');
    stopAll();
    const voiceId = getActiveVoice();
    await speak(msg.text, voiceId);
  } catch (err: unknown) {
    /* Silent fail — auto-read est best-effort */
    logger.warn('chat', 'auto-read failed', { err });
  }
}
