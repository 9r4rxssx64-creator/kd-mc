/**
 * APEX v13.4.9 — Stream Partial Saver (Kevin "ne s'arrête plus en plein travail").
 *
 * Pendant un stream IA, sauvegarde toutes les 1s :
 *  - Last partial text reçu
 *  - Messages sent (pour resume context)
 *  - Provider utilisé
 *  - Timestamp dernier chunk
 *
 * Au boot, si partiel récent (<10min) et incomplet → propose RESUME au user
 * via toast cliquable. Si user accepte → ré-envoie messages + recolle le partial
 * comme bootstrap pour que le nouveau provider continue d'où on était.
 *
 * Différent du failover provider :
 *  - Failover = pendant le même run, switch de provider en interne
 *  - Resume = entre 2 boots / 2 sessions / 2 reconnects
 */

import { logger } from '../../core/logger.js';

const STORAGE_KEY = 'apex_v13_streaming_partial';
const SAVE_THROTTLE_MS = 1000;
const RESUME_TTL_MS = 10 * 60 * 1000; /* 10 min */

interface PartialStream {
  ts_start: number;
  ts_last_chunk: number;
  provider: string;
  partial_text: string;
  messages_sent: Array<{ role: string; content: string | unknown[] }>;
  system: string;
  completed: boolean;
}

class StreamPartialSaver {
  private current: PartialStream | null = null;
  private lastSave = 0;

  /** Démarre une nouvelle session de streaming. */
  start(opts: {
    provider: string;
    messages: Array<{ role: string; content: string | unknown[] }>;
    system: string;
  }): void {
    this.current = {
      ts_start: Date.now(),
      ts_last_chunk: Date.now(),
      provider: opts.provider,
      partial_text: '',
      messages_sent: opts.messages,
      system: opts.system,
      completed: false,
    };
    this.persist();
    logger.debug('stream-partial', `started with provider=${opts.provider}`);
  }

  /** Ajoute un chunk text au partial courant (throttle 1s pour ne pas spammer localStorage). */
  appendChunk(text: string): void {
    if (!this.current) return;
    this.current.partial_text += text;
    this.current.ts_last_chunk = Date.now();
    const now = Date.now();
    if (now - this.lastSave > SAVE_THROTTLE_MS) {
      this.persist();
      this.lastSave = now;
    }
  }

  /** Marque le stream comme complété (success normal). */
  complete(): void {
    if (!this.current) return;
    this.current.completed = true;
    this.persist();
    /* Auto-clean après 5s (laisse le temps à un éventuel resume immédiat de voir le complete) */
    setTimeout(() => {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      this.current = null;
    }, 5000);
  }

  /** Sauve un changement de provider (failover interne). */
  switchProvider(newProvider: string): void {
    if (!this.current) return;
    logger.info('stream-partial', `provider switch ${this.current.provider} → ${newProvider}`);
    this.current.provider = newProvider;
    this.persist();
  }

  /** Détecte si un partial récent et incomplet existe → resume candidate. */
  getResumeCandidate(): PartialStream | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as PartialStream;
      if (p.completed) return null;
      if (Date.now() - p.ts_last_chunk > RESUME_TTL_MS) return null;
      if (!p.partial_text || p.partial_text.length < 5) return null;
      return p;
    } catch {
      return null;
    }
  }

  /** Efface le partial (user a refusé resume ou nouveau start). */
  discard(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    this.current = null;
  }

  private persist(): void {
    if (!this.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* quota — trim partial_text si trop gros */
      if (this.current.partial_text.length > 10_000) {
        this.current.partial_text = this.current.partial_text.slice(-8_000);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current)); } catch { /* ignore */ }
      }
    }
  }
}

export const streamPartialSaver = new StreamPartialSaver();
