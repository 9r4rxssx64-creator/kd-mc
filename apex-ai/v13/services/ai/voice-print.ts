/**
 * APEX v13 — Voice Print + "Dis Apex" wake word (P0 audit gaps).
 *
 * Demande Kevin (CLAUDE.md règle absolue 2026-04-26 + 2026-05-03) :
 * "Apex doit reconnaître ma voix quand je dis 'Dis Apex'"
 * "Reconnaître les voix de chaque utilisateur dans chaque compte
 *  et ne réagir qu'à son utilisateur (pas confondre avec entourage)"
 * "Mémoriser les voix et accumuler des infos pour cibler de plus en plus"
 *
 * Pipeline :
 * 1. Enrôlement : 3 samples audio user → fingerprint stocké
 * 2. Wake word "Dis Apex" : SpeechRecognition continuous
 * 3. Match wake → capture suite + identifyBy fingerprint
 * 4. Si match user → agir, sinon → ignorer (anti-confusion entourage)
 *
 * Architecture (Jet 8.1 minimal viable, Jet 9 enrichira avec meyda MFCC) :
 * - Fingerprint simple : pitch moyen + ZCR + énergie via AnalyserNode
 * - Voiceprint stocké par user dans ax_voice_print_<uid> (FB_LOCAL strict)
 * - Cosine similarity sur 3 dimensions (pitch, ZCR, energy)
 * - Threshold 0.75 par défaut (configurable)
 *
 * Anti-pattern Kevin :
 * - FB_LOCAL strict (jamais sync Firebase — données biométriques sensibles)
 * - Consent CGU obligatoire avant enrôlement
 * - User peut supprimer son voiceprint (RGPD Art. 17)
 */

import { logger } from '../../core/logger.js';
import { isFeatureEnabled } from '../auth/feature-toggles.js';
import { auditLog } from '../observability/audit-log.js';

export interface VoiceFingerprint {
  uid: string;
  pitch_avg: number;
  zcr_avg: number;
  energy_avg: number;
  spectral_centroid_avg?: number;
  spectral_rolloff_avg?: number;
  samples_count: number;
  enrolled_at: number;
  last_match: number;
  match_score_avg: number;
  /* v13.3.43 (Kevin 2026-05-07 "exclusivité user") :
   * Confidence score (0-1) basé sur samples_count (max après 20 samples).
   * Tracking false-positives/negatives pour calibration auto. */
  confidence_score?: number;
  false_positive_count?: number;
  false_negative_count?: number;
  last_calibration?: number;
}

export interface VoiceMatchResult {
  uid: string | null;
  score: number;
  confident: boolean;
  /* v13.3.43 : confidence du voiceprint matché (pas just score similarity) */
  print_confidence?: number;
  /* v13.3.43 : flag spécial Kevin admin reconnu (pour mode admin temp) */
  isKevinAdmin?: boolean;
  /* v13.3.44 : phase courante d'apprentissage (open|learning|refining|exclusive) */
  phase?: VoicePhase;
  /* v13.3.44 : threshold dynamique appliqué pour ce match */
  threshold_used?: number;
  /* v13.3.44 : true si le match est "identified" (compte tenu de la phase open qui accepte tout) */
  identified?: boolean;
}

/* v13.3.44 (Kevin 2026-05-07 "il écoute tout le monde puis affine pour finir exclusif utilisateur") :
 * 4 phases de threshold dynamique selon le nombre de samples accumulés.
 * - open       : accepte tout (apprentissage initial, < 4 samples)
 * - learning   : threshold relâché 0.50 (4-9 samples)
 * - refining   : threshold intermédiaire 0.65 (10-19 samples)
 * - exclusive  : threshold strict 0.85 (≥ 20 samples)
 */
export type VoicePhase = 'open' | 'learning' | 'refining' | 'exclusive';

const SIMILARITY_THRESHOLD_DEFAULT = 0.75;
/* v13.3.43 : nombre de samples pour atteindre confidence 1.0 (linéaire) */
const CONFIDENCE_FULL_AT_SAMPLES = 20;
/* v13.3.43 : kevin admin uid (pour mode admin reconnu dans vue Laurence) */
const ADMIN_UID = 'kdmc_admin';
/* v13.3.43 : log unknown attempts (max 100 FIFO, FB_LOCAL strict) */
const UNKNOWN_ATTEMPTS_KEY = 'ax_voice_unknown_attempts';
const UNKNOWN_ATTEMPTS_MAX = 100;
/* v13.3.43 : settings (toggle exclusif default ON, calibration interval 30j) */
const EXCLUSIVE_MODE_KEY = 'ax_voice_exclusive_mode';
const CALIBRATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; /* 30 jours */
const CALIBRATION_LOW_CONFIDENCE = 0.85;

/* v13.3.44 : seuils par phase (Kevin 2026-05-07). */
const PHASE_THRESHOLDS: Record<VoicePhase, number> = {
  open: 0.0 /* accepte tout */,
  learning: 0.5,
  refining: 0.65,
  exclusive: 0.85,
};
/* v13.3.44 : bornes samples_count pour chaque phase. */
const PHASE_BOUNDS: Record<VoicePhase, { min: number; max: number }> = {
  open: { min: 0, max: 3 },
  learning: { min: 4, max: 9 },
  refining: { min: 10, max: 19 },
  exclusive: { min: 20, max: Number.MAX_SAFE_INTEGER },
};
/* v13.3.44 : samples_count minimum pour activer le mode exclusif anticipé. */
const EXCLUSIVE_ANTICIPATED_MIN_SAMPLES = 10;
/* v13.3.44 : clé localStorage du toggle "Mode exclusif anticipé". */
const EXCLUSIVE_ANTICIPATED_KEY = 'ax_voice_exclusive_anticipated';

/**
 * v13.3.44 — Threshold dynamique selon nombre de samples accumulés (Kevin 2026-05-07).
 * Au début Apex écoute tout le monde, puis affine progressivement, jusqu'à devenir exclusif user.
 *
 * @param samples_count nombre de samples enrôlés/appris pour ce voiceprint
 * @returns threshold cosine similarity à appliquer
 */
export function getThresholdForUser(samples_count: number): number {
  if (samples_count < PHASE_BOUNDS.learning.min) return PHASE_THRESHOLDS.open;
  if (samples_count < PHASE_BOUNDS.refining.min) return PHASE_THRESHOLDS.learning;
  if (samples_count < PHASE_BOUNDS.exclusive.min) return PHASE_THRESHOLDS.refining;
  return PHASE_THRESHOLDS.exclusive;
}

/**
 * v13.3.44 — Phase courante du voiceprint (open|learning|refining|exclusive).
 */
function phaseFromSamples(samples_count: number): VoicePhase {
  if (samples_count < PHASE_BOUNDS.learning.min) return 'open';
  if (samples_count < PHASE_BOUNDS.refining.min) return 'learning';
  if (samples_count < PHASE_BOUNDS.exclusive.min) return 'refining';
  return 'exclusive';
}

/**
 * v13.3.44 — Lit le toggle "Mode exclusif anticipé" (force phase exclusif dès 10 samples).
 */
function isExclusiveAnticipated(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(EXCLUSIVE_ANTICIPATED_KEY) === '1';
  } catch {
    return false;
  }
}

/* Variantes phonétiques étendues — Web Speech API FR confond souvent "dis"/"dit"/"dix",
 * "apex"/"apexs"/"appex"/"hapex"/"dispex" (concat) selon micro/débit. */
const WAKE_PATTERNS: RegExp[] = [
  /\b(?:dis|dit|di|dix|d['e])\s*ap[ep]x[s]?\b/i,
  /\bhey\s*ap[ep]x[s]?\b/i,
  /\bok\s*ap[ep]x[s]?\b/i,
  /\bdispex[s]?\b/i /* concat phonétique */,
  /\bhapex[s]?\b/i /* h aspirée mal détectée */,
  /\bap[ep]x[s]?\b/i /* "apex" seul (dernier recours) */,
];

const MAX_NO_SPEECH_RETRIES = 20;
const NO_SPEECH_SUSPEND_MS = 30_000; /* 30s pause après burst no-speech */
const RESTART_DELAY_MS = 500;
const VOICE_LOG_KEY = 'ax_voice_log';
const VOICE_LOG_MAX = 100;
const PERMISSION_DENIED_KEY = 'ax_voice_permission_denied_ts';

interface VoiceLogEntry {
  ts: number;
  evt:
    | 'start'
    | 'result'
    | 'interim'
    | 'wake'
    | 'error'
    | 'end'
    | 'restart'
    | 'suspend'
    | 'permission';
  src: 'wake-word' | 'dictation';
  detail?: string;
}

function isiOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  /* iPad iOS 13+ déguisé en MacIntel — détecter via maxTouchPoints */
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

function isWakeMatch(transcript: string): boolean {
  if (!transcript) return false;
  const norm = transcript.toLowerCase().trim();
  return WAKE_PATTERNS.some((p) => p.test(norm));
}

/* Logger structuré (max 100 entries, FIFO) — exposé pour panel admin diagnostic */
function pushVoiceLog(entry: VoiceLogEntry): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(VOICE_LOG_KEY);
    const arr: VoiceLogEntry[] = raw ? (JSON.parse(raw) as VoiceLogEntry[]) : [];
    arr.push(entry);
    while (arr.length > VOICE_LOG_MAX) arr.shift();
    localStorage.setItem(VOICE_LOG_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota / parse */
  }
}

export function getVoiceLog(): VoiceLogEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(VOICE_LOG_KEY);
    return raw ? (JSON.parse(raw) as VoiceLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearVoiceLog(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(VOICE_LOG_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Check permission micro avant démarrage STT.
 * Retourne 'granted' | 'denied' | 'prompt' | 'unknown'.
 */
export async function checkMicrophonePermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unknown'
> {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'unknown';
  }
}

class VoicePrint {
  private wakeRecognition: unknown = null; /* SpeechRecognition instance */
  private wakeListening = false;
  private threshold = SIMILARITY_THRESHOLD_DEFAULT;
  private wakeCallbacks: Array<(transcript: string) => void> = [];
  private wakeNoSpeechRetries = 0;
  private wakeSuspendTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeInterimCallback: ((transcript: string, isFinal: boolean) => void) | null = null;

  /**
   * Vérifie si Web Speech + Audio APIs disponibles.
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasSpeech =
      typeof (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition !==
        'undefined' ||
      typeof (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition !== 'undefined';
    const hasAudio =
      typeof window.AudioContext !== 'undefined' ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !==
        'undefined';
    return hasSpeech && hasAudio;
  }

  /**
   * Calcule fingerprint enrichi (Jet 8.1+ : pitch + ZCR + RMS + spectral centroid + spectral rolloff).
   * (Jet 9 enrichira encore avec meyda MFCC 13 coefficients + chroma 12 bins)
   */
  computeFingerprint(audioBuffer: AudioBuffer): {
    pitch: number;
    zcr: number;
    energy: number;
    spectral_centroid: number;
    spectral_rolloff: number;
  } {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    /* Energy = RMS — itération directe Float32Array (TypedArray garantit number) */
    let energy = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] ?? 0;
      energy += v * v;
    }
    energy = Math.sqrt(energy / data.length);

    /* ZCR */
    let zcr = 0;
    for (let i = 1; i < data.length; i++) {
      const cur = data[i] ?? 0;
      const prev = data[i - 1] ?? 0;
      if (cur >= 0 !== prev >= 0) zcr++;
    }
    zcr /= data.length;

    /* Pitch via autocorrélation */
    let pitch = 0;
    const minLag = Math.floor(sampleRate / 500);
    const maxLag = Math.floor(sampleRate / 80);
    let bestCorr = 0;
    for (let lag = minLag; lag < maxLag && lag < data.length / 2; lag++) {
      let corr = 0;
      for (let i = 0; i < data.length - lag; i++) {
        const a = data[i] ?? 0;
        const b = data[i + lag] ?? 0;
        corr += a * b;
      }
      corr /= data.length - lag;
      if (corr > bestCorr) {
        bestCorr = corr;
        pitch = sampleRate / lag;
      }
    }

    /* Spectral features via FFT simplifié (DFT light pour chunks 256-512) */
    const fftSize = Math.min(512, Math.pow(2, Math.floor(Math.log2(data.length))));
    const magnitudes = this.computeMagnitudeSpectrum(data, fftSize);
    const totalEnergy = magnitudes.reduce((s, m) => s + m, 0);
    let weightedSum = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      weightedSum += i * (magnitudes[i] ?? 0);
    }
    const spectralCentroid =
      totalEnergy > 0 ? (weightedSum / totalEnergy) * (sampleRate / fftSize / 2) : 0;

    /* Spectral rolloff (85% energy threshold) */
    const threshold = totalEnergy * 0.85;
    let cumulative = 0;
    let rolloffBin = magnitudes.length - 1;
    for (let i = 0; i < magnitudes.length; i++) {
      cumulative += magnitudes[i] ?? 0;
      if (cumulative >= threshold) {
        rolloffBin = i;
        break;
      }
    }
    const spectralRolloff = (rolloffBin / magnitudes.length) * (sampleRate / 2);

    return {
      pitch,
      zcr,
      energy,
      spectral_centroid: spectralCentroid,
      spectral_rolloff: spectralRolloff,
    };
  }

  /**
   * DFT simplifié (magnitude spectrum, pas de FFT optimisée — OK pour chunks petits).
   */
  private computeMagnitudeSpectrum(data: Float32Array, fftSize: number): number[] {
    const magnitudes: number[] = [];
    const halfSize = fftSize / 2;
    /* Window Hann pour smoother FFT */
    for (let k = 0; k < halfSize; k++) {
      let real = 0;
      let imag = 0;
      const limit = Math.min(fftSize, data.length);
      for (let n = 0; n < limit; n++) {
        const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (fftSize - 1));
        const sample = (data[n] ?? 0) * window;
        const angle = (-2 * Math.PI * k * n) / fftSize;
        real += sample * Math.cos(angle);
        imag += sample * Math.sin(angle);
      }
      magnitudes.push(Math.sqrt(real * real + imag * imag));
    }
    return magnitudes;
  }

  /**
   * Enrôle voix user (3 samples audio recommandés).
   *
   * v13.3.43 : si voiceprint existe déjà → merge incrémental (apprentissage continu)
   * au lieu d'écraser. Garde l'historique de confidence.
   */
  async enroll(
    uid: string,
    audioSamples: AudioBuffer[],
  ): Promise<{ ok: boolean; reason?: string; samples_count?: number; confidence_score?: number }> {
    if (audioSamples.length < 1) return { ok: false, reason: 'Aucun sample audio' };
    /* Wire admin feature toggles (Kevin règle 2026-05-04 — ON/OFF tout).
       Trois toggles convergent sur l'enrôlement vocal :
       - voice.biometric : feature voix biométrique (général)
       - auth.voice_print : auth via voiceprint spécifiquement
       Si l'un OU l'autre est OFF, on bloque l'enrôlement. */
    if (!isFeatureEnabled('voice.biometric', uid)) {
      return { ok: false, reason: 'voice.biometric désactivé par admin' };
    }
    if (!isFeatureEnabled('auth.voice_print', uid)) {
      return { ok: false, reason: 'auth.voice_print désactivé par admin' };
    }
    /* Calcule fingerprints enrichis + moyenne (5 features) */
    const fps = audioSamples.map((s) => this.computeFingerprint(s));
    const newAvg = {
      pitch_avg: fps.reduce((s, f) => s + f.pitch, 0) / fps.length,
      zcr_avg: fps.reduce((s, f) => s + f.zcr, 0) / fps.length,
      energy_avg: fps.reduce((s, f) => s + f.energy, 0) / fps.length,
      spectral_centroid_avg: fps.reduce((s, f) => s + f.spectral_centroid, 0) / fps.length,
      spectral_rolloff_avg: fps.reduce((s, f) => s + f.spectral_rolloff, 0) / fps.length,
    };

    let print: VoiceFingerprint;
    try {
      /* v13.3.43 : merge si voiceprint existant (apprentissage continu) */
      const existing = localStorage.getItem(`ax_voice_print_${uid}`);
      if (existing) {
        const old = JSON.parse(existing) as VoiceFingerprint;
        /* Moyenne pondérée : ancien * (n/(n+m)) + nouveau * (m/(n+m)) */
        const n = old.samples_count;
        const m = audioSamples.length;
        const total = n + m;
        print = {
          ...old,
          pitch_avg: (old.pitch_avg * n + newAvg.pitch_avg * m) / total,
          zcr_avg: (old.zcr_avg * n + newAvg.zcr_avg * m) / total,
          energy_avg: (old.energy_avg * n + newAvg.energy_avg * m) / total,
          spectral_centroid_avg:
            ((old.spectral_centroid_avg ?? 0) * n + newAvg.spectral_centroid_avg * m) / total,
          spectral_rolloff_avg:
            ((old.spectral_rolloff_avg ?? 0) * n + newAvg.spectral_rolloff_avg * m) / total,
          samples_count: total,
          confidence_score: this.computeConfidenceScore(total),
          last_calibration: Date.now(),
        };
      } else {
        print = {
          uid,
          ...newAvg,
          samples_count: audioSamples.length,
          enrolled_at: Date.now(),
          last_match: 0,
          match_score_avg: 0,
          confidence_score: this.computeConfidenceScore(audioSamples.length),
          false_positive_count: 0,
          false_negative_count: 0,
          last_calibration: Date.now(),
        };
      }
      /* FB_LOCAL strict — jamais sync Firebase (biométrique) */
      localStorage.setItem(`ax_voice_print_${uid}`, JSON.stringify(print));
      void auditLog.record('voice.enrolled', {
        details: {
          uid,
          samples: audioSamples.length,
          total_samples: print.samples_count,
          confidence: print.confidence_score,
        },
      });
      return {
        ok: true,
        samples_count: print.samples_count,
        confidence_score:
          print.confidence_score ?? this.computeConfidenceScore(print.samples_count),
      };
    } catch (err: unknown) {
      logger.warn('voice-print', 'enroll persist failed', { err });
      return { ok: false, reason: 'Storage saturated' };
    }
  }

  /**
   * v13.3.43 : Apprentissage incrémental d'UN sample (auto-enrôlement progressif).
   * Appelé à chaque message vocal user authentifié pour améliorer le voiceprint.
   *
   * Moyenne pondérée 0.9 ancien + 0.1 nouveau (apprentissage doux).
   */
  learnFromAudio(
    uid: string,
    audioBuffer: AudioBuffer,
  ): { updated: boolean; confidence_score: number; samples_count: number } {
    if (!uid) return { updated: false, confidence_score: 0, samples_count: 0 };
    try {
      const fp = this.computeFingerprint(audioBuffer);
      const raw = localStorage.getItem(`ax_voice_print_${uid}`);
      if (!raw) {
        /* Premier sample → baseline */
        const print: VoiceFingerprint = {
          uid,
          pitch_avg: fp.pitch,
          zcr_avg: fp.zcr,
          energy_avg: fp.energy,
          spectral_centroid_avg: fp.spectral_centroid,
          spectral_rolloff_avg: fp.spectral_rolloff,
          samples_count: 1,
          enrolled_at: Date.now(),
          last_match: 0,
          match_score_avg: 0,
          confidence_score: this.computeConfidenceScore(1),
          false_positive_count: 0,
          false_negative_count: 0,
          last_calibration: Date.now(),
        };
        localStorage.setItem(`ax_voice_print_${uid}`, JSON.stringify(print));
        return { updated: true, confidence_score: print.confidence_score ?? 0, samples_count: 1 };
      }
      const print = JSON.parse(raw) as VoiceFingerprint;
      /* Moyenne pondérée 0.9 ancien + 0.1 nouveau */
      const w = 0.1;
      print.pitch_avg = print.pitch_avg * (1 - w) + fp.pitch * w;
      print.zcr_avg = print.zcr_avg * (1 - w) + fp.zcr * w;
      print.energy_avg = print.energy_avg * (1 - w) + fp.energy * w;
      print.spectral_centroid_avg =
        (print.spectral_centroid_avg ?? 0) * (1 - w) + fp.spectral_centroid * w;
      print.spectral_rolloff_avg =
        (print.spectral_rolloff_avg ?? 0) * (1 - w) + fp.spectral_rolloff * w;
      print.samples_count++;
      print.confidence_score = this.computeConfidenceScore(print.samples_count);
      localStorage.setItem(`ax_voice_print_${uid}`, JSON.stringify(print));
      return {
        updated: true,
        confidence_score: print.confidence_score ?? 0,
        samples_count: print.samples_count,
      };
    } catch (err: unknown) {
      logger.warn('voice-print', 'learnFromAudio failed', { err });
      return { updated: false, confidence_score: 0, samples_count: 0 };
    }
  }

  /**
   * v13.3.43 : confidence basé sur samples_count.
   * Linéaire : 0/20 = 0.0, 20+/20 = 1.0.
   */
  private computeConfidenceScore(samplesCount: number): number {
    if (samplesCount <= 0) return 0;
    return Math.min(1.0, samplesCount / CONFIDENCE_FULL_AT_SAMPLES);
  }

  /**
   * Identifie speaker depuis sample audio.
   *
   * v13.3.43 : enrichi avec print_confidence + isKevinAdmin + log unknown attempts.
   * v13.3.44 (Kevin 2026-05-07 "tout le monde puis exclusif user") :
   *   threshold dynamique par voiceprint selon phase (open|learning|refining|exclusive).
   *   Phase open (samples<4) → identified=true même score=0 (apprentissage initial).
   *   Toggle exclusif anticipé → force threshold exclusif dès 10 samples.
   */
  identify(audioSample: AudioBuffer): VoiceMatchResult {
    const fp = this.computeFingerprint(audioSample);
    const allPrints = this.listPrints();
    if (allPrints.length === 0) {
      return {
        uid: null,
        score: 0,
        confident: false,
        phase: 'open',
        threshold_used: 0,
        identified: false,
      };
    }

    const anticipated = isExclusiveAnticipated();
    /* v13.3.44 : seed best avec threshold_used = phase max trouvée parmi tous les prints
     * pour que les callers voient quelle exigence a été appliquée même si aucun match.
     * On utilise threshold le plus permissif (=plus bas seuil) car il s'applique à tous. */
    let best: VoiceMatchResult = {
      uid: null,
      score: 0,
      confident: false,
      phase: 'open',
      threshold_used: 0,
      identified: false,
    };
    let bestPrint: VoiceFingerprint | null = null;
    for (const print of allPrints) {
      /* Cosine similarity sur 5 dimensions (vs 3 avant) — plus précis Jet 8.1 */
      const printVec = [
        print.pitch_avg,
        print.zcr_avg,
        print.energy_avg,
        print.spectral_centroid_avg ?? 0,
        print.spectral_rolloff_avg ?? 0,
      ];
      const sampleVec = [fp.pitch, fp.zcr, fp.energy, fp.spectral_centroid, fp.spectral_rolloff];
      const score = this.cosineSimilarity(sampleVec, printVec);

      /* v13.3.44 : threshold dynamique selon samples_count du voiceprint candidat. */
      const phase = this.getPhaseForPrint(print, anticipated);
      const dynamicThreshold = this.getEffectiveThreshold(print, anticipated);
      /* Phase open : identifie = true (Apex apprend en écoutant tout le monde) */
      const isOpen = phase === 'open';
      const matches = isOpen || score >= dynamicThreshold;

      if (matches && score >= best.score) {
        best = {
          uid: print.uid,
          score,
          confident: matches,
          print_confidence:
            print.confidence_score ?? this.computeConfidenceScore(print.samples_count),
          isKevinAdmin: print.uid === ADMIN_UID,
          phase,
          threshold_used: dynamicThreshold,
          identified: matches,
        };
        bestPrint = print;
      } else if (!best.uid) {
        /* Pas de match confident encore — on garde la trace du print "le plus proche"
         * (max score parmi non-matches) pour que le caller sache quel threshold a été appliqué. */
        if (score >= best.score || bestPrint === null) {
          best = {
            uid: null,
            score,
            confident: false,
            print_confidence:
              print.confidence_score ?? this.computeConfidenceScore(print.samples_count),
            isKevinAdmin: false,
            phase,
            threshold_used: dynamicThreshold,
            identified: false,
          };
          bestPrint = print;
        }
      }
    }

    /* Update voiceprint si match confiant (auto-apprentissage) */
    if (best.confident && best.uid) {
      this.updatePrintWithSample(best.uid, fp, best.score);
    } else if (!best.confident && bestPrint) {
      /* v13.3.43 : log tentative non reconnue (anti-confusion entourage) */
      this.logUnknownAttempt(best.score, fp);
    }

    return best;
  }

  /**
   * v13.3.44 — Phase courante du voiceprint, en tenant compte du toggle "exclusif anticipé".
   */
  getPhaseForPrint(print: VoiceFingerprint, anticipated = isExclusiveAnticipated()): VoicePhase {
    const natural = phaseFromSamples(print.samples_count);
    if (anticipated && print.samples_count >= EXCLUSIVE_ANTICIPATED_MIN_SAMPLES) {
      return 'exclusive';
    }
    return natural;
  }

  /**
   * v13.3.44 — Threshold effectif (dynamique + override anticipé éventuel).
   */
  getEffectiveThreshold(print: VoiceFingerprint, anticipated = isExclusiveAnticipated()): number {
    if (anticipated && print.samples_count >= EXCLUSIVE_ANTICIPATED_MIN_SAMPLES) {
      return PHASE_THRESHOLDS.exclusive;
    }
    return getThresholdForUser(print.samples_count);
  }

  /**
   * v13.3.44 — Phase courante pour un user (Kevin 2026-05-07).
   * Si pas de voiceprint pour cet uid → phase 'open' (apprentissage initial).
   */
  getCurrentPhase(uid: string): VoicePhase {
    try {
      const raw =
        typeof localStorage !== 'undefined' ? localStorage.getItem(`ax_voice_print_${uid}`) : null;
      if (!raw) return 'open';
      const print = JSON.parse(raw) as VoiceFingerprint;
      return this.getPhaseForPrint(print);
    } catch {
      return 'open';
    }
  }

  /**
   * v13.3.44 — Détails complets de la phase pour UI Voice Bio (Kevin 2026-05-07).
   * Retourne : phase courante, samples_count, samples_to_next, threshold appliqué,
   * progress (0-1), label FR.
   */
  getPhaseDetails(uid: string): {
    phase: VoicePhase;
    samples_count: number;
    samples_to_next: number;
    threshold: number;
    progress: number;
    label: string;
    anticipated_active: boolean;
  } {
    let samples_count = 0;
    try {
      const raw =
        typeof localStorage !== 'undefined' ? localStorage.getItem(`ax_voice_print_${uid}`) : null;
      if (raw) {
        const print = JSON.parse(raw) as VoiceFingerprint;
        samples_count = print.samples_count ?? 0;
      }
    } catch {
      /* ignore */
    }
    const anticipated = isExclusiveAnticipated();
    const phase: VoicePhase =
      anticipated && samples_count >= EXCLUSIVE_ANTICIPATED_MIN_SAMPLES
        ? 'exclusive'
        : phaseFromSamples(samples_count);
    const threshold =
      anticipated && samples_count >= EXCLUSIVE_ANTICIPATED_MIN_SAMPLES
        ? PHASE_THRESHOLDS.exclusive
        : getThresholdForUser(samples_count);

    let samples_to_next = 0;
    if (phase === 'open') samples_to_next = PHASE_BOUNDS.learning.min - samples_count;
    else if (phase === 'learning') samples_to_next = PHASE_BOUNDS.refining.min - samples_count;
    else if (phase === 'refining') samples_to_next = PHASE_BOUNDS.exclusive.min - samples_count;
    else samples_to_next = 0;
    if (samples_to_next < 0) samples_to_next = 0;

    /* Progress global : 0-1 sur les 20 samples nécessaires pour atteindre exclusif. */
    const progress = Math.min(1, samples_count / CONFIDENCE_FULL_AT_SAMPLES);

    const label =
      phase === 'open'
        ? '🔓 Ouvert (apprentissage initial)'
        : phase === 'learning'
          ? '🟡 Apprentissage'
          : phase === 'refining'
            ? '🟠 Affinage (en cours)'
            : '🟢 Exclusif utilisateur';

    return {
      phase,
      samples_count,
      samples_to_next,
      threshold,
      progress,
      label,
      anticipated_active: anticipated,
    };
  }

  /**
   * v13.3.44 — Toggle "Mode exclusif anticipé" (Kevin 2026-05-07).
   * Si ON, un voiceprint avec ≥10 samples passe en phase exclusive immédiatement
   * (au lieu d'attendre 20).
   */
  isExclusiveAnticipated(): boolean {
    return isExclusiveAnticipated();
  }

  setExclusiveAnticipated(enabled: boolean): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EXCLUSIVE_ANTICIPATED_KEY, enabled ? '1' : '0');
      }
      void auditLog.record('voice.exclusive_anticipated_changed', { details: { enabled } });
    } catch {
      /* ignore */
    }
  }

  /**
   * v13.3.43 : Identification EXCLUSIVE pour wake word.
   * v13.3.44 (Kevin 2026-05-07 "tout le monde puis affine pour exclusif user") :
   *   - phase open (samples<4) → identifie=true ET apprend la voix entendue
   *   - phase learning/refining → threshold dynamique (0.50 / 0.65)
   *   - phase exclusive → strict 0.85, ignore voix divergentes
   *   - Kevin admin reconnu prime dans vue Laurence (cross-user override)
   *   - Toggle "exclusif anticipé" force phase exclusive dès 10 samples
   *
   * Returns :
   * - identified=true → voix = user enrôlé (uid + score) OU phase open (apprentissage)
   * - identified=false + uid=null → voix non reconnue (entourage / bruit)
   * - identified=true + isKevin=true → mode admin temp si dans vue Laurence
   * - phase → indique l'état d'apprentissage actuel
   */
  identifySpeaker(
    audioBuffer: AudioBuffer,
    opts: { currentUserId?: string } = {},
  ): {
    identified: boolean;
    uid: string | null;
    confidence: number;
    score: number;
    isKevin: boolean;
    print_confidence: number;
    phase: VoicePhase;
    threshold_used: number;
    reason?: string;
    learned?: boolean;
  } {
    /* Feature toggle auth.voice_print (Kevin règle ON/OFF, 2026-05-04).
       Si désactivée, retourne immédiatement un résultat "not identified" propre. */
    if (!isFeatureEnabled('auth.voice_print', opts.currentUserId)) {
      return {
        identified: false,
        uid: null,
        confidence: 0,
        score: 0,
        isKevin: false,
        print_confidence: 0,
        phase: 'open',
        threshold_used: 0,
        reason: 'auth.voice_print désactivé par admin',
      };
    }
    const allPrints = this.listPrints();
    const currentUid = opts.currentUserId;

    /* v13.3.44 : phase open = il n'y a aucun voiceprint OU le user courant a moins de 4 samples.
     * Dans ce cas, on apprend la voix entendue (apprentissage initial) et on identifie=true. */
    if (allPrints.length === 0) {
      /* Aucun voiceprint enrôlé. Si on a un currentUserId → apprend la voix. */
      if (currentUid) {
        const learn = this.learnFromAudio(currentUid, audioBuffer);
        return {
          identified: true,
          uid: currentUid,
          confidence: 0,
          score: 0,
          isKevin: currentUid === ADMIN_UID,
          print_confidence: learn.confidence_score,
          phase: 'open',
          threshold_used: PHASE_THRESHOLDS.open,
          reason: 'phase_open_initial_learning',
          learned: learn.updated,
        };
      }
      return {
        identified: false,
        uid: null,
        confidence: 0,
        score: 0,
        isKevin: false,
        print_confidence: 0,
        phase: 'open',
        threshold_used: PHASE_THRESHOLDS.open,
        reason: 'no_voiceprint_enrolled',
      };
    }

    /* v13.3.44 : capturer la phase du user courant AVANT que identify() ne mute samples_count
     * (auto-apprentissage update). Sinon un user à 3 samples passe à 4 et bascule en learning. */
    const currentPhaseBefore: VoicePhase | null = currentUid
      ? this.getCurrentPhase(currentUid)
      : null;

    const match = this.identify(audioBuffer);
    const exclusive = this.isExclusiveMode();
    const matchPhase: VoicePhase = match.phase ?? 'open';
    const thresholdUsed = match.threshold_used ?? PHASE_THRESHOLDS.open;

    /* v13.3.44 : phase open du user courant → toujours identified=true + apprentissage */
    if (currentUid && currentPhaseBefore === 'open') {
      const learn = this.learnFromAudio(currentUid, audioBuffer);
      return {
        identified: true,
        uid: currentUid,
        confidence: match.score,
        score: match.score,
        isKevin: currentUid === ADMIN_UID,
        print_confidence: learn.confidence_score,
        phase: 'open',
        threshold_used: PHASE_THRESHOLDS.open,
        reason: 'phase_open_initial_learning',
        learned: learn.updated,
      };
    }

    /* Aucun match confiant → ignoré silencieusement (anti-confusion entourage) */
    if (!match.confident || !match.uid) {
      return {
        identified: false,
        uid: null,
        confidence: 0,
        score: match.score,
        isKevin: false,
        print_confidence: match.print_confidence ?? 0,
        phase: matchPhase,
        threshold_used: thresholdUsed,
        reason: 'similarity_below_threshold',
      };
    }

    /* v13.3.44 : Kevin admin reconnu dans vue d'un autre user → override (mode admin temp).
     * Implémenté ici de manière prioritaire avant le check exclusif user. */
    if (match.uid === ADMIN_UID && currentUid && currentUid !== ADMIN_UID) {
      return {
        identified: true,
        uid: ADMIN_UID,
        confidence: match.score,
        score: match.score,
        isKevin: true,
        print_confidence: match.print_confidence ?? 0,
        phase: matchPhase,
        threshold_used: thresholdUsed,
        reason: 'kevin_admin_override',
      };
    }

    /* Mode exclusif : si user courant défini, exiger match avec celui-ci (sauf Kevin admin déjà géré) */
    if (exclusive && currentUid && match.uid !== currentUid && match.uid !== ADMIN_UID) {
      return {
        identified: false,
        uid: null,
        confidence: match.score,
        score: match.score,
        isKevin: false,
        print_confidence: match.print_confidence ?? 0,
        phase: matchPhase,
        threshold_used: thresholdUsed,
        reason: 'exclusive_mode_other_user',
      };
    }

    return {
      identified: true,
      uid: match.uid,
      confidence: match.score,
      score: match.score,
      isKevin: match.uid === ADMIN_UID,
      print_confidence: match.print_confidence ?? 0,
      phase: matchPhase,
      threshold_used: thresholdUsed,
    };
  }

  /**
   * v13.3.43 : Log tentative wake word non reconnue (entourage, bruit ambient).
   * FIFO 100 entries max. Stats utiles pour calibration.
   */
  private logUnknownAttempt(
    score: number,
    fp: {
      pitch: number;
      zcr: number;
      energy: number;
      spectral_centroid: number;
      spectral_rolloff: number;
    },
  ): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(UNKNOWN_ATTEMPTS_KEY);
      const arr: Array<{ ts: number; score: number; pitch: number; energy: number }> = raw
        ? (JSON.parse(raw) as Array<{ ts: number; score: number; pitch: number; energy: number }>)
        : [];
      arr.push({
        ts: Date.now(),
        score: Math.round(score * 100) / 100,
        pitch: Math.round(fp.pitch),
        energy: Math.round(fp.energy * 100) / 100,
      });
      while (arr.length > UNKNOWN_ATTEMPTS_MAX) arr.shift();
      localStorage.setItem(UNKNOWN_ATTEMPTS_KEY, JSON.stringify(arr));
    } catch {
      /* ignore quota / parse */
    }
  }

  /**
   * v13.3.43 : Liste tentatives non reconnues (admin diagnostic).
   */
  getUnknownAttempts(): Array<{ ts: number; score: number; pitch: number; energy: number }> {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(UNKNOWN_ATTEMPTS_KEY);
      return raw
        ? (JSON.parse(raw) as Array<{ ts: number; score: number; pitch: number; energy: number }>)
        : [];
    } catch {
      return [];
    }
  }

  clearUnknownAttempts(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(UNKNOWN_ATTEMPTS_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * v13.3.43 : Mode exclusif (default ON — sécurité).
   */
  isExclusiveMode(): boolean {
    try {
      if (typeof localStorage === 'undefined') return true;
      const raw = localStorage.getItem(EXCLUSIVE_MODE_KEY);
      if (raw === null) return true; /* default ON */
      return raw === 'true' || raw === '1';
    } catch {
      return true;
    }
  }

  setExclusiveMode(enabled: boolean): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EXCLUSIVE_MODE_KEY, enabled ? 'true' : 'false');
      }
      void auditLog.record('voice.exclusive_mode_changed', { details: { enabled } });
    } catch {
      /* ignore */
    }
  }

  /**
   * v13.3.43 : Vérifie si user a besoin d'une calibration (voix change avec temps,
   * sentinelle voice-quality-watch propose ré-enrôlement).
   */
  needsCalibration(uid: string): { needs: boolean; reason: string; confidence: number } {
    try {
      const raw = localStorage.getItem(`ax_voice_print_${uid}`);
      if (!raw) return { needs: false, reason: 'not_enrolled', confidence: 0 };
      const print = JSON.parse(raw) as VoiceFingerprint;
      const conf = print.confidence_score ?? this.computeConfidenceScore(print.samples_count);
      const lastCalib = print.last_calibration ?? print.enrolled_at;
      const ageMs = Date.now() - lastCalib;

      if (conf < CALIBRATION_LOW_CONFIDENCE) {
        return { needs: true, reason: 'low_confidence', confidence: conf };
      }
      if (ageMs > CALIBRATION_INTERVAL_MS) {
        return { needs: true, reason: 'stale_calibration', confidence: conf };
      }
      return { needs: false, reason: 'ok', confidence: conf };
    } catch {
      return { needs: false, reason: 'parse_error', confidence: 0 };
    }
  }

  /**
   * v13.3.43 : Marque calibration faite (reset timer).
   */
  markCalibrated(uid: string): void {
    try {
      const raw = localStorage.getItem(`ax_voice_print_${uid}`);
      if (!raw) return;
      const print = JSON.parse(raw) as VoiceFingerprint;
      print.last_calibration = Date.now();
      localStorage.setItem(`ax_voice_print_${uid}`, JSON.stringify(print));
    } catch {
      /* ignore */
    }
  }

  /**
   * v13.3.43 : Get voiceprint for a user (or null).
   */
  getPrintFor(uid: string): VoiceFingerprint | null {
    try {
      const raw = localStorage.getItem(`ax_voice_print_${uid}`);
      if (!raw) return null;
      return JSON.parse(raw) as VoiceFingerprint;
    } catch {
      return null;
    }
  }

  /**
   * Cosine similarity entre 2 vecteurs n-dim.
   */
  private cosineSimilarity(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      dot += av * bv;
      normA += av * av;
      normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Mise à jour voiceprint avec sample (apprentissage continu).
   */
  private updatePrintWithSample(
    uid: string,
    fp: {
      pitch: number;
      zcr: number;
      energy: number;
      spectral_centroid: number;
      spectral_rolloff: number;
    },
    score: number,
  ): void {
    try {
      const raw = localStorage.getItem(`ax_voice_print_${uid}`);
      if (!raw) return;
      const print = JSON.parse(raw) as VoiceFingerprint;
      /* Moyenne pondérée 0.9 ancien + 0.1 nouveau (5 dimensions) */
      const weight = 0.1;
      print.pitch_avg = print.pitch_avg * (1 - weight) + fp.pitch * weight;
      print.zcr_avg = print.zcr_avg * (1 - weight) + fp.zcr * weight;
      print.energy_avg = print.energy_avg * (1 - weight) + fp.energy * weight;
      print.spectral_centroid_avg =
        (print.spectral_centroid_avg ?? 0) * (1 - weight) + fp.spectral_centroid * weight;
      print.spectral_rolloff_avg =
        (print.spectral_rolloff_avg ?? 0) * (1 - weight) + fp.spectral_rolloff * weight;
      print.samples_count++;
      print.last_match = Date.now();
      print.match_score_avg =
        (print.match_score_avg * (print.samples_count - 1) + score) / print.samples_count;
      localStorage.setItem(`ax_voice_print_${uid}`, JSON.stringify(print));
    } catch {
      /* ignore */
    }
  }

  /**
   * Liste tous voiceprints enrôlés.
   */
  listPrints(): VoiceFingerprint[] {
    const prints: VoiceFingerprint[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ax_voice_print_')) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) prints.push(JSON.parse(raw) as VoiceFingerprint);
        } catch {
          /* ignore corrupt */
        }
      }
    }
    return prints;
  }

  /**
   * Suppression voiceprint user (RGPD Art. 17).
   */
  deletePrint(uid: string): boolean {
    try {
      localStorage.removeItem(`ax_voice_print_${uid}`);
      void auditLog.record('voice.deleted', { details: { uid } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set threshold similarity (admin tuning).
   */
  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Enregistre callback pour les transcriptions partielles (debug live UI).
   * Utile pour afficher "Transcription : ..." pendant que user parle.
   */
  onWakeInterim(cb: ((transcript: string, isFinal: boolean) => void) | null): void {
    this.wakeInterimCallback = cb;
  }

  /**
   * Wake word "Dis Apex" listener (continuous Web Speech API).
   *
   * iOS Safari quirks (CLAUDE.md erreur #43, fix v13.3.23) :
   * - `continuous = false` obligatoire (auto-stop après 15-30s silence)
   * - onerror 'aborted' = lifecycle normal → restart auto, NE PAS afficher en erreur
   * - onerror 'no-speech' burst → suspend 30s après 20 tentatives
   * - onerror 'not-allowed' → modal permissions iOS Settings
   * - `interimResults = true` : permet de voir transcription live
   */
  startWakeWord(callback: (transcript: string) => void): { ok: boolean; reason?: string } {
    if (!this.isSupported()) return { ok: false, reason: 'Web Speech API non supportée' };
    if (this.wakeListening) {
      this.wakeCallbacks.push(callback);
      return { ok: true };
    }
    try {
      this.wakeCallbacks = [callback];
      this.wakeListening = true;
      this.wakeNoSpeechRetries = 0;
      const isiOS = isiOSSafari();
      if (!this.spawnWakeRecognition()) {
        this.wakeListening = false;
        this.wakeRecognition = null;
        return { ok: false, reason: 'SpeechRecognition undefined' };
      }
      pushVoiceLog({
        ts: Date.now(),
        evt: 'start',
        src: 'wake-word',
        detail: isiOS ? 'iOS' : 'desktop',
      });
      return { ok: true };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      pushVoiceLog({ ts: Date.now(), evt: 'error', src: 'wake-word', detail: `start: ${reason}` });
      return { ok: false, reason };
    }
  }

  /**
   * v13.4.51 fresh-instance pattern : crée une NOUVELLE instance
   * SpeechRecognition à chaque (re)démarrage du wake word, la câble
   * (onresult/onerror/onend) et la démarre. iOS Safari throw
   * InvalidStateError si `rec.start()` est réutilisé sur une instance déjà
   * terminée — donc onend recrée une instance fraîche au lieu de réutiliser.
   */
  private spawnWakeRecognition(): boolean {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;
    if (!SpeechRec) return false;

    const isiOS = isiOSSafari();
    const rec = new SpeechRec() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (event: {
        results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> & { length: number };
      }) => void;
      onerror: (event: { error?: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = !isiOS; /* iOS Safari : continuous unstable, restart via onend */
    rec.interimResults = true;
    rec.lang = 'fr-FR';

    rec.onresult = (event) => {
      const results = event.results;
      for (let i = 0; i < results.length; i++) {
        const transcript = results[i]?.[0]?.transcript?.toLowerCase() ?? '';
        const isFinal = results[i]?.isFinal ?? false;
        /* Reset compteur no-speech dès qu'on capte du son */
        this.wakeNoSpeechRetries = 0;
        /* Live interim feedback (UI panel diagnostic ou toast progress) */
        if (this.wakeInterimCallback) {
          try {
            this.wakeInterimCallback(transcript, isFinal);
          } catch {
            /* ignore callback errors */
          }
        }
        pushVoiceLog({
          ts: Date.now(),
          evt: isFinal ? 'result' : 'interim',
          src: 'wake-word',
          detail: transcript.slice(0, 80),
        });
        if (isWakeMatch(transcript)) {
          pushVoiceLog({
            ts: Date.now(),
            evt: 'wake',
            src: 'wake-word',
            detail: transcript.slice(0, 80),
          });
          void auditLog.record('voice.wake_detected', {
            details: { transcript: transcript.slice(0, 50) },
          });
          /* Iter copie pour éviter mutation pendant exec */
          const cbs = [...this.wakeCallbacks];
          for (const cb of cbs) {
            try {
              cb(transcript);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn('voice-print', 'wake callback threw', { err: msg });
            }
          }
        }
      }
    };

    rec.onerror = (event) => {
      const err = event?.error ?? 'unknown';
      pushVoiceLog({ ts: Date.now(), evt: 'error', src: 'wake-word', detail: err });

      if (err === 'no-speech') {
        this.wakeNoSpeechRetries++;
        if (this.wakeNoSpeechRetries >= MAX_NO_SPEECH_RETRIES) {
          logger.warn(
            'voice-print',
            `${MAX_NO_SPEECH_RETRIES}× no-speech consécutifs → suspend 30s`,
          );
          pushVoiceLog({
            ts: Date.now(),
            evt: 'suspend',
            src: 'wake-word',
            detail: `${MAX_NO_SPEECH_RETRIES}× no-speech`,
          });
          /* Suspend temporaire : stop puis restart auto après 30s */
          this.suspendWakeAndResumeLater();
        }
        return;
      }

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        logger.warn('voice-print', 'permission micro refusée');
        pushVoiceLog({ ts: Date.now(), evt: 'permission', src: 'wake-word', detail: 'denied' });
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(PERMISSION_DENIED_KEY, String(Date.now()));
          }
        } catch {
          /* ignore */
        }
        this.stopWakeWord();
        return;
      }

      /* 'aborted', 'network', 'audio-capture' : recovery via onend (silencieux) */
    };

    rec.onend = () => {
      pushVoiceLog({ ts: Date.now(), evt: 'end', src: 'wake-word' });
      if (!this.wakeListening) return;
      /* Restart sur iOS (continuous=false) ou recovery erreur — instance fraîche */
      setTimeout(() => {
        if (!this.wakeListening || this.wakeSuspendTimer !== null) return;
        try {
          this.spawnWakeRecognition();
          pushVoiceLog({ ts: Date.now(), evt: 'restart', src: 'wake-word' });
        } catch {
          /* ignore double-start race InvalidStateError — restart au prochain onend */
        }
      }, RESTART_DELAY_MS);
    };

    this.wakeRecognition = rec;
    rec.start();
    return true;
  }

  /**
   * Suspend wake word 30s après burst no-speech (anti drain batterie),
   * puis tente reprise automatique si toujours en mode listening.
   */
  private suspendWakeAndResumeLater(): void {
    if (this.wakeSuspendTimer) return; /* déjà programmé */
    /* Stop micro mais garde flag listening pour reprise auto */
    if (this.wakeRecognition) {
      try {
        (this.wakeRecognition as { stop: () => void }).stop();
      } catch {
        /* ignore */
      }
    }
    this.wakeSuspendTimer = setTimeout(() => {
      this.wakeSuspendTimer = null;
      this.wakeNoSpeechRetries = 0;
      if (!this.wakeListening || !this.wakeRecognition) return;
      try {
        (this.wakeRecognition as { start: () => void }).start();
        pushVoiceLog({ ts: Date.now(), evt: 'restart', src: 'wake-word', detail: 'after-suspend' });
      } catch {
        /* ignore */
      }
    }, NO_SPEECH_SUSPEND_MS);
  }

  /**
   * Stop wake word listening.
   */
  stopWakeWord(): void {
    if (!this.wakeListening) return;
    this.wakeListening = false;
    this.wakeCallbacks = [];
    this.wakeNoSpeechRetries = 0;
    if (this.wakeSuspendTimer) {
      clearTimeout(this.wakeSuspendTimer);
      this.wakeSuspendTimer = null;
    }
    if (this.wakeRecognition) {
      try {
        (this.wakeRecognition as { stop: () => void }).stop();
      } catch {
        /* ignore */
      }
      this.wakeRecognition = null;
    }
  }

  isListening(): boolean {
    return this.wakeListening;
  }

  /**
   * Stats admin dashboard.
   */
  getStats(): { enrolled_count: number; total_samples: number; avg_match_score: number } {
    const prints = this.listPrints();
    const total = prints.reduce((s, p) => s + p.samples_count, 0);
    const avgScore =
      prints.length > 0 ? prints.reduce((s, p) => s + p.match_score_avg, 0) / prints.length : 0;
    return {
      enrolled_count: prints.length,
      total_samples: total,
      avg_match_score: Math.round(avgScore * 100) / 100,
    };
  }
}

export const voicePrint = new VoicePrint();
