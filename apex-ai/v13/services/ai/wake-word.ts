/**
 * APEX v13 — Wake Word "Dis Apex" (Kevin v13.1.0 audit P0).
 *
 * Pourquoi (Kevin) : "Dis Apex" doit déclencher Apex sans tap, comme Siri/Alexa.
 * Continuous listening Web Speech API + détection regex + capture 5 s + callback.
 *
 * Quirks iOS Safari (CLAUDE.md erreur #43) :
 * - SpeechRecognition.continuous = true non fiable → continuous = !isiOS
 * - onend() recovery via setTimeout 500 ms qui restart
 * - Limit retry no-speech à 20 max (drain batterie)
 *
 * Sécurité :
 * - Audit chaque détection (auditLog.record('wake.detected'))
 * - Pas de capture audio sans `start()` explicite (consent user)
 * - Stop net via stop() — release tracks micro
 *
 * Conformité brief :
 * - start(): Promise<{ started, reason? }>
 * - stop(): void
 * - setKeyword(keyword), setSensitivity(value)
 * - onWake(cb)
 * - isListening(), getStatus()
 */

import { logger } from '../../core/logger.js';
import { isFeatureEnabled } from '../auth/feature-toggles.js';
import { auditLog } from '../observability/audit-log.js';

/* ============================================================================
 * Types publics
 * ============================================================================ */

export interface WakeWordConfig {
  keyword: string;
  sensitivity: number; /* 0.0 — 1.0 */
  enabled: boolean;
  customWakeWord?: string;
}

export interface WakeStartResult {
  started: boolean;
  reason?: string;
}

export interface WakeStatus {
  listening: boolean;
  lastDetected: number | null;
  totalDetections: number;
  keyword: string;
  sensitivity: number;
}

export type WakeCallback = (transcript: string) => void;

/* ============================================================================
 * Constantes
 * ============================================================================ */

const DEFAULT_KEYWORD = 'dis apex';
const DEFAULT_SENSITIVITY = 0.7;
const RESTART_DELAY_MS = 500;
const MAX_NO_SPEECH_RETRIES = 20;
const STATUS_KEY = 'apex_v13_wake_word_status';

/* Variantes phonétiques tolérées (mauvaise reconnaissance Web Speech FR) */
const KEYWORD_VARIANTS_BASE = [
  'dis apex',
  'dit apex',
  'di apex',
  'hey apex',
  'ok apex',
  'dispex',
  'hapex',
];

const VOICE_LOG_KEY = 'ax_voice_log';
const VOICE_LOG_MAX = 100;

interface VoiceLogEntry {
  ts: number;
  evt: string;
  src: string;
  detail?: string;
}

function pushVoiceLog(entry: VoiceLogEntry): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(VOICE_LOG_KEY);
    const arr: VoiceLogEntry[] = raw ? (JSON.parse(raw) as VoiceLogEntry[]) : [];
    arr.push(entry);
    while (arr.length > VOICE_LOG_MAX) arr.shift();
    localStorage.setItem(VOICE_LOG_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/* Type minimal SpeechRecognition (pas dans lib.dom std) */
interface MinimalSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: { results: ArrayLike<{ 0: { transcript: string } }> & { length: number } }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/* ============================================================================
 * Helpers
 * ============================================================================ */

function isiOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  /* iPad iOS 13+ déguisé en MacIntel — détecter via maxTouchPoints */
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => MinimalSpeechRecognition;
    webkitSpeechRecognition?: new () => MinimalSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function buildKeywordRegex(keyword: string): RegExp {
  const variants = new Set<string>([keyword.toLowerCase().trim(), ...KEYWORD_VARIANTS_BASE]);
  /* Échappe regex spec chars */
  const parts = [...variants].filter(Boolean).map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${parts.join('|')})\\b`, 'i');
}

/* ============================================================================
 * WakeWord class
 * ============================================================================ */

class WakeWord {
  private config: WakeWordConfig = {
    keyword: DEFAULT_KEYWORD,
    sensitivity: DEFAULT_SENSITIVITY,
    enabled: false,
  };
  private listening = false;
  private callbacks: WakeCallback[] = [];
  private recognition: MinimalSpeechRecognition | null = null;
  private lastDetected: number | null = null;
  private totalDetections = 0;
  private noSpeechRetries = 0;
  private keywordRegex: RegExp = buildKeywordRegex(DEFAULT_KEYWORD);

  constructor() {
    /* Hydrate stats persistées (cross-session) */
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STATUS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { totalDetections?: number; lastDetected?: number };
          this.totalDetections =
            typeof parsed.totalDetections === 'number' ? parsed.totalDetections : 0;
          this.lastDetected = typeof parsed.lastDetected === 'number' ? parsed.lastDetected : null;
        }
      }
    } catch {
      /* ignore — pas critique */
    }
  }

  /**
   * Active listening continu. Demande permission micro implicitement via Web Speech API.
   */
  async start(): Promise<WakeStartResult> {
    if (this.listening) return { started: true };
    /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
    if (!isFeatureEnabled('voice.wake_word')) {
      return { started: false, reason: 'wake-word désactivé par admin' };
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return { started: false, reason: 'Web Speech API non supportée sur ce navigateur' };
    }
    try {
      this.listening = true;
      this.config.enabled = true;
      this.noSpeechRetries = 0;
      this.spawnRecognition();
      pushVoiceLog({
        ts: Date.now(),
        evt: 'start',
        src: 'wake-word-svc',
        detail: isiOS() ? 'iOS' : 'desktop',
      });

      void auditLog.record('wake.start', {
        details: { keyword: this.config.keyword, ios: isiOS() },
      });
      return { started: true };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.listening = false;
      this.recognition = null;
      logger.warn('wake-word', 'start failed', { err: reason });
      return { started: false, reason };
    }
  }

  /**
   * v13.4.51 fresh-instance pattern : crée une NOUVELLE instance
   * SpeechRecognition à chaque (re)démarrage, la câble et la démarre. iOS
   * Safari throw InvalidStateError si `rec.start()` est réutilisé sur une
   * instance déjà terminée — onend recrée donc une instance fraîche.
   */
  private spawnRecognition(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) throw new Error('Web Speech API non supportée sur ce navigateur');

    const rec = new Ctor();
    rec.continuous = !isiOS(); /* iOS Safari : continuous instable */
    rec.interimResults = true;
    rec.lang = 'fr-FR';

    rec.onresult = (event) => {
      const results = event.results;
      for (let i = 0; i < results.length; i++) {
        const transcript = (results[i]?.[0]?.transcript ?? '').toLowerCase();
        pushVoiceLog({
          ts: Date.now(),
          evt: 'interim',
          src: 'wake-word-svc',
          detail: transcript.slice(0, 80),
        });
        if (this.keywordRegex.test(transcript)) {
          this.handleWakeDetected(transcript);
        }
      }
      /* reset no-speech compteur dès qu'on a un résultat */
      this.noSpeechRetries = 0;
    };

    rec.onerror = (event) => {
      const err = event.error ?? 'unknown';
      pushVoiceLog({ ts: Date.now(), evt: 'error', src: 'wake-word-svc', detail: err });
      if (err === 'no-speech') {
        this.noSpeechRetries++;
        if (this.noSpeechRetries >= MAX_NO_SPEECH_RETRIES) {
          logger.warn(
            'wake-word',
            'Trop de no-speech consécutifs, stop pour éviter drain batterie',
          );
          pushVoiceLog({
            ts: Date.now(),
            evt: 'suspend',
            src: 'wake-word-svc',
            detail: `${MAX_NO_SPEECH_RETRIES}× no-speech`,
          });
          this.stop();
        }
        return;
      }
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        logger.warn('wake-word', 'Permission micro refusée');
        pushVoiceLog({ ts: Date.now(), evt: 'permission', src: 'wake-word-svc', detail: 'denied' });
        this.stop();
        return;
      }
      /* aborted, network, audio-capture : recovery via onend (silencieux) */
    };

    rec.onend = () => {
      pushVoiceLog({ ts: Date.now(), evt: 'end', src: 'wake-word-svc' });
      if (!this.listening) return;
      /* Restart sur iOS (continuous=false) ou recovery erreur — instance fraîche */
      setTimeout(() => {
        if (!this.listening) return;
        try {
          this.spawnRecognition();
          pushVoiceLog({ ts: Date.now(), evt: 'restart', src: 'wake-word-svc' });
        } catch {
          /* ignore double-start race InvalidStateError */
        }
      }, RESTART_DELAY_MS);
    };

    this.recognition = rec;
    rec.start();
  }

  /**
   * Stop listening + release micro. Idempotent.
   */
  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    this.config.enabled = false;
    this.callbacks = [];
    this.noSpeechRetries = 0;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
    void auditLog.record('wake.stop', {});
  }

  /**
   * Configure le mot-clé custom. Ré-applique regex.
   */
  setKeyword(keyword: string): void {
    const normalized = (keyword || '').trim().toLowerCase();
    if (!normalized) {
      logger.warn('wake-word', 'setKeyword: vide ignoré');
      return;
    }
    this.config.keyword = normalized;
    this.config.customWakeWord = normalized;
    this.keywordRegex = buildKeywordRegex(normalized);
  }

  /**
   * Sensibilité 0.0–1.0. Clamp + persist en config (utilisé pour scoring fuzzy futur).
   */
  setSensitivity(value: number): void {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      logger.warn('wake-word', 'setSensitivity: valeur invalide ignorée');
      return;
    }
    this.config.sensitivity = Math.max(0, Math.min(1, value));
  }

  /**
   * Enregistre callback wake. Multi-callbacks supportés.
   */
  onWake(callback: WakeCallback): void {
    if (typeof callback !== 'function') return;
    this.callbacks.push(callback);
  }

  /**
   * Retire tous les callbacks (utile pour cleanup tests).
   */
  clearCallbacks(): void {
    this.callbacks = [];
  }

  isListening(): boolean {
    return this.listening;
  }

  getStatus(): WakeStatus {
    return {
      listening: this.listening,
      lastDetected: this.lastDetected,
      totalDetections: this.totalDetections,
      keyword: this.config.keyword,
      sensitivity: this.config.sensitivity,
    };
  }

  /**
   * Renvoie la config courante (read-only copy).
   */
  getConfig(): Readonly<WakeWordConfig> {
    return { ...this.config };
  }

  /* ==========================================================================
   * Internals
   * ========================================================================== */

  private handleWakeDetected(transcript: string): void {
    this.lastDetected = Date.now();
    this.totalDetections++;
    this.persistStats();
    void auditLog.record('wake.detected', {
      details: { transcript: transcript.slice(0, 80), ts: this.lastDetected },
    });
    /* Copy callbacks pour éviter mutation pendant iteration */
    const cbs = [...this.callbacks];
    for (const cb of cbs) {
      try {
        cb(transcript);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('wake-word', 'callback threw', { err: msg });
      }
    }
  }

  private persistStats(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        STATUS_KEY,
        JSON.stringify({
          totalDetections: this.totalDetections,
          lastDetected: this.lastDetected,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }
}

export const wakeWord = new WakeWord();
