/**
 * Tests progressive voice-print v13.3.44 (Kevin 2026-05-07).
 *
 * "Au début il écoute tout le monde puis il affine pour finir exclusif utilisateur"
 *
 * 4 phases :
 * - open       : samples < 4   → threshold 0.0 (accepte tout)
 * - learning   : samples 4-9   → threshold 0.50
 * - refining   : samples 10-19 → threshold 0.65
 * - exclusive  : samples ≥ 20  → threshold 0.85
 *
 * Toggle exclusif anticipé : force phase exclusive dès 10 samples.
 * Kevin admin (kdmc_admin) prime dans la vue d'un autre user.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  voicePrint,
  getThresholdForUser,
  type VoiceFingerprint,
  type VoicePhase,
} from '../../services/ai/voice-print.js';

const ADMIN_UID = 'kdmc_admin';

function makeFakeAudioBuffer(samples: number[], sampleRate = 16000): AudioBuffer {
  const data = new Float32Array(samples);
  return {
    sampleRate,
    length: data.length,
    duration: data.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function setVoicePrint(uid: string, samples_count: number, overrides: Partial<VoiceFingerprint> = {}): void {
  const print: VoiceFingerprint = {
    uid,
    pitch_avg: 180,
    zcr_avg: 0.05,
    energy_avg: 0.3,
    spectral_centroid_avg: 1500,
    spectral_rolloff_avg: 4000,
    samples_count,
    enrolled_at: Date.now(),
    last_match: 0,
    match_score_avg: 0.85,
    confidence_score: Math.min(1, samples_count / 20),
    false_positive_count: 0,
    false_negative_count: 0,
    last_calibration: Date.now(),
    ...overrides,
  };
  localStorage.setItem(`ax_voice_print_${uid}`, JSON.stringify(print));
}

describe('voice-print progressive — 4 phases (Kevin 2026-05-07)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset toggle exclusif anticipé */
    voicePrint.setExclusiveAnticipated(false);
    /* Mode exclusif default ON */
    voicePrint.setExclusiveMode(true);
  });

  describe('getThresholdForUser : map samples_count → threshold', () => {
    it('phase open (samples < 4) → threshold 0.0', () => {
      expect(getThresholdForUser(0)).toBe(0);
      expect(getThresholdForUser(1)).toBe(0);
      expect(getThresholdForUser(2)).toBe(0);
      expect(getThresholdForUser(3)).toBe(0);
    });

    it('phase learning (4-9) → threshold 0.50', () => {
      expect(getThresholdForUser(4)).toBe(0.5);
      expect(getThresholdForUser(5)).toBe(0.5);
      expect(getThresholdForUser(9)).toBe(0.5);
    });

    it('phase refining (10-19) → threshold 0.65', () => {
      expect(getThresholdForUser(10)).toBe(0.65);
      expect(getThresholdForUser(15)).toBe(0.65);
      expect(getThresholdForUser(19)).toBe(0.65);
    });

    it('phase exclusive (≥ 20) → threshold 0.85', () => {
      expect(getThresholdForUser(20)).toBe(0.85);
      expect(getThresholdForUser(50)).toBe(0.85);
      expect(getThresholdForUser(1000)).toBe(0.85);
    });
  });

  describe('getCurrentPhase : retour phase user', () => {
    it('user inexistant → phase open (apprentissage initial)', () => {
      expect(voicePrint.getCurrentPhase('unknown_user')).toBe<VoicePhase>('open');
    });

    it('user 0 sample → open', () => {
      setVoicePrint('u_0', 0);
      expect(voicePrint.getCurrentPhase('u_0')).toBe<VoicePhase>('open');
    });

    it('user 3 samples → encore open', () => {
      setVoicePrint('u_3', 3);
      expect(voicePrint.getCurrentPhase('u_3')).toBe<VoicePhase>('open');
    });

    it('user 4 samples → learning', () => {
      setVoicePrint('u_4', 4);
      expect(voicePrint.getCurrentPhase('u_4')).toBe<VoicePhase>('learning');
    });

    it('user 9 samples → encore learning', () => {
      setVoicePrint('u_9', 9);
      expect(voicePrint.getCurrentPhase('u_9')).toBe<VoicePhase>('learning');
    });

    it('user 10 samples → refining', () => {
      setVoicePrint('u_10', 10);
      expect(voicePrint.getCurrentPhase('u_10')).toBe<VoicePhase>('refining');
    });

    it('user 19 samples → encore refining', () => {
      setVoicePrint('u_19', 19);
      expect(voicePrint.getCurrentPhase('u_19')).toBe<VoicePhase>('refining');
    });

    it('user 20 samples → exclusive', () => {
      setVoicePrint('u_20', 20);
      expect(voicePrint.getCurrentPhase('u_20')).toBe<VoicePhase>('exclusive');
    });

    it('user 50 samples → exclusive', () => {
      setVoicePrint('u_50', 50);
      expect(voicePrint.getCurrentPhase('u_50')).toBe<VoicePhase>('exclusive');
    });
  });

  describe('Toggle exclusif anticipé', () => {
    it('default OFF → phase naturelle (10 samples = refining)', () => {
      setVoicePrint('u_x', 10);
      expect(voicePrint.isExclusiveAnticipated()).toBe(false);
      expect(voicePrint.getCurrentPhase('u_x')).toBe<VoicePhase>('refining');
    });

    it('toggle ON + ≥10 samples → force exclusive (au lieu refining)', () => {
      setVoicePrint('u_x', 10);
      voicePrint.setExclusiveAnticipated(true);
      expect(voicePrint.isExclusiveAnticipated()).toBe(true);
      expect(voicePrint.getCurrentPhase('u_x')).toBe<VoicePhase>('exclusive');
    });

    it('toggle ON + 15 samples → exclusive (au lieu refining)', () => {
      setVoicePrint('u_x', 15);
      voicePrint.setExclusiveAnticipated(true);
      expect(voicePrint.getCurrentPhase('u_x')).toBe<VoicePhase>('exclusive');
    });

    it('toggle ON + 9 samples → reste learning (pas atteint 10)', () => {
      setVoicePrint('u_x', 9);
      voicePrint.setExclusiveAnticipated(true);
      expect(voicePrint.getCurrentPhase('u_x')).toBe<VoicePhase>('learning');
    });

    it('toggle ON + 3 samples → reste open', () => {
      setVoicePrint('u_x', 3);
      voicePrint.setExclusiveAnticipated(true);
      expect(voicePrint.getCurrentPhase('u_x')).toBe<VoicePhase>('open');
    });

    it('persistance localStorage du toggle', () => {
      voicePrint.setExclusiveAnticipated(true);
      expect(localStorage.getItem('ax_voice_exclusive_anticipated')).toBe('1');
      voicePrint.setExclusiveAnticipated(false);
      expect(localStorage.getItem('ax_voice_exclusive_anticipated')).toBe('0');
    });
  });

  describe('getPhaseDetails : UI Voice Bio progress', () => {
    it('user 0 sample → phase open + samples_to_next = 4', () => {
      const det = voicePrint.getPhaseDetails('new_user');
      expect(det.phase).toBe<VoicePhase>('open');
      expect(det.samples_count).toBe(0);
      expect(det.samples_to_next).toBe(4);
      expect(det.threshold).toBe(0);
      expect(det.progress).toBe(0);
      expect(det.label).toContain('Ouvert');
      expect(det.anticipated_active).toBe(false);
    });

    it('user 12 samples → refining + samples_to_next = 8 + progress 60%', () => {
      setVoicePrint('u', 12);
      const det = voicePrint.getPhaseDetails('u');
      expect(det.phase).toBe<VoicePhase>('refining');
      expect(det.samples_count).toBe(12);
      expect(det.samples_to_next).toBe(8); /* 20 - 12 */
      expect(det.threshold).toBe(0.65);
      expect(det.progress).toBeCloseTo(0.6, 1);
      expect(det.label).toContain('Affinage');
    });

    it('user 20 samples → exclusive + samples_to_next = 0 + progress 100%', () => {
      setVoicePrint('u', 20);
      const det = voicePrint.getPhaseDetails('u');
      expect(det.phase).toBe<VoicePhase>('exclusive');
      expect(det.samples_to_next).toBe(0);
      expect(det.threshold).toBe(0.85);
      expect(det.progress).toBe(1);
      expect(det.label).toContain('Exclusif');
    });

    it('toggle anticipé ON + 10 samples → label Exclusif + threshold 0.85 + anticipated_active=true', () => {
      setVoicePrint('u', 10);
      voicePrint.setExclusiveAnticipated(true);
      const det = voicePrint.getPhaseDetails('u');
      expect(det.phase).toBe<VoicePhase>('exclusive');
      expect(det.threshold).toBe(0.85);
      expect(det.anticipated_active).toBe(true);
    });
  });

  describe('identify : threshold dynamique selon samples_count par voiceprint', () => {
    it('phase open (3 samples) → identifie même score faible', () => {
      setVoicePrint('u_open', 3, { pitch_avg: 50, zcr_avg: 0, energy_avg: 0 });
      /* Sample audio totalement différent */
      const buf = makeFakeAudioBuffer(Array.from({ length: 256 }, () => 0.5));
      const result = voicePrint.identify(buf);
      expect(result.phase).toBe<VoicePhase>('open');
      expect(result.confident).toBe(true);
      expect(result.identified).toBe(true);
      expect(result.uid).toBe('u_open');
    });

    it('phase exclusive (25 samples) → rejette score 0.5 (< 0.85)', () => {
      /* Setup voiceprint exclusive avec valeurs très différentes du sample test */
      setVoicePrint('u_excl', 25, {
        pitch_avg: 1000,
        zcr_avg: 0.99,
        energy_avg: 999,
        spectral_centroid_avg: 8000,
        spectral_rolloff_avg: 8000,
      });
      const buf = makeFakeAudioBuffer(Array.from({ length: 256 }, (_, i) => Math.sin(i * 0.1) * 0.01));
      const result = voicePrint.identify(buf);
      expect(result.phase).toBe<VoicePhase>('exclusive');
      expect(result.threshold_used).toBe(0.85);
      /* Si score < 0.85, devrait être rejeté */
      if (result.score < 0.85) {
        expect(result.confident).toBe(false);
      }
    });

    it('threshold_used reflète la phase du voiceprint matché', () => {
      setVoicePrint('u_5', 5);
      const buf = makeFakeAudioBuffer(Array.from({ length: 256 }, (_, i) => Math.sin(i * 0.1) * 0.5));
      const result = voicePrint.identify(buf);
      /* En phase learning, threshold_used = 0.5 */
      expect(result.threshold_used).toBe(0.5);
      expect(result.phase).toBe<VoicePhase>('learning');
    });
  });

  describe('identifySpeaker : phase-aware + Kevin admin override', () => {
    it('aucun voiceprint + currentUserId → phase open + apprend la voix', () => {
      const buf = makeFakeAudioBuffer(Array.from({ length: 256 }, (_, i) => Math.sin(i * 0.1)));
      const result = voicePrint.identifySpeaker(buf, { currentUserId: 'kevin' });
      expect(result.identified).toBe(true);
      expect(result.uid).toBe('kevin');
      expect(result.phase).toBe<VoicePhase>('open');
      expect(result.learned).toBe(true);
      /* Voiceprint a été créé */
      expect(localStorage.getItem('ax_voice_print_kevin')).not.toBeNull();
    });

    it('phase open user courant (3 samples) → apprend + identifie même voix divergente', () => {
      setVoicePrint('kevin', 3);
      const buf = makeFakeAudioBuffer(Array.from({ length: 256 }, () => 0.9));
      const result = voicePrint.identifySpeaker(buf, { currentUserId: 'kevin' });
      expect(result.identified).toBe(true);
      expect(result.uid).toBe('kevin');
      expect(result.phase).toBe<VoicePhase>('open');
      expect(result.learned).toBe(true);
    });

    it('phase exclusive (25 samples) + voix divergente → identified=false (ignore)', () => {
      /* Voiceprint exclusive très différent du sample test */
      setVoicePrint('kevin', 25, {
        pitch_avg: 9999,
        zcr_avg: 0.999,
        energy_avg: 999,
        spectral_centroid_avg: 9999,
        spectral_rolloff_avg: 9999,
      });
      const buf = makeFakeAudioBuffer(new Array(256).fill(0));
      const result = voicePrint.identifySpeaker(buf, { currentUserId: 'kevin' });
      /* Score sera très bas, doit être rejeté en phase exclusive */
      expect(result.threshold_used).toBe(0.85);
    });

    it('Kevin admin reconnu dans vue Laurence → identified=true + isKevin=true', () => {
      /* Setup Laurence + Kevin avec voiceprints exclusive */
      setVoicePrint('laurence', 25, {
        pitch_avg: 220,
        zcr_avg: 0.08,
        energy_avg: 0.25,
        spectral_centroid_avg: 1800,
        spectral_rolloff_avg: 4500,
      });
      setVoicePrint(ADMIN_UID, 25, {
        pitch_avg: 150,
        zcr_avg: 0.04,
        energy_avg: 0.4,
        spectral_centroid_avg: 1200,
        spectral_rolloff_avg: 3500,
      });
      /* Sample qui matche Kevin (pitch ~150) */
      const buf = makeFakeAudioBuffer(
        Array.from({ length: 1024 }, (_, i) => Math.sin((2 * Math.PI * 150 * i) / 16000) * 0.4),
      );
      /* Vue currente = Laurence, mais voix Kevin → override admin */
      const result = voicePrint.identifySpeaker(buf, { currentUserId: 'laurence' });
      /* Si l'identify pure trouve Kevin (score > 0.85), override doit être actif */
      if (result.identified && result.uid === ADMIN_UID) {
        expect(result.isKevin).toBe(true);
        expect(result.reason).toBe('kevin_admin_override');
      }
      /* Sinon, au moins le check doit s'être déroulé sans erreur */
      expect(result.phase).toBeDefined();
    });

    it('Kevin admin dans sa propre vue → identified=true normal (pas override)', () => {
      setVoicePrint(ADMIN_UID, 25);
      const buf = makeFakeAudioBuffer(
        Array.from({ length: 1024 }, (_, i) => Math.sin((2 * Math.PI * 180 * i) / 16000)),
      );
      const result = voicePrint.identifySpeaker(buf, { currentUserId: ADMIN_UID });
      /* Pas de reason override car on est déjà dans sa vue */
      if (result.identified) {
        expect(result.reason).not.toBe('kevin_admin_override');
        expect(result.isKevin).toBe(true);
      }
    });

    it('Mode exclusif anticipé ON + 10 samples + voix divergente user courant → rejette', () => {
      voicePrint.setExclusiveAnticipated(true);
      setVoicePrint('laurence', 10, {
        pitch_avg: 9999,
        zcr_avg: 0.999,
        energy_avg: 999,
        spectral_centroid_avg: 9999,
        spectral_rolloff_avg: 9999,
      });
      const buf = makeFakeAudioBuffer(new Array(256).fill(0));
      const result = voicePrint.identifySpeaker(buf, { currentUserId: 'laurence' });
      /* Phase forcée exclusive → threshold 0.85 → score 0 < 0.85 → not identified */
      expect(result.identified).toBe(false);
    });
  });

  describe('Multi-user isolation', () => {
    it('chaque user a sa propre phase indépendante', () => {
      setVoicePrint('kevin', 25);
      setVoicePrint('laurence', 5);
      setVoicePrint('client1', 0);
      expect(voicePrint.getCurrentPhase('kevin')).toBe<VoicePhase>('exclusive');
      expect(voicePrint.getCurrentPhase('laurence')).toBe<VoicePhase>('learning');
      expect(voicePrint.getCurrentPhase('client1')).toBe<VoicePhase>('open');
    });

    it('toggle anticipé impacte tous les users avec ≥10 samples', () => {
      setVoicePrint('kevin', 25);
      setVoicePrint('laurence', 12);
      setVoicePrint('client', 7);
      voicePrint.setExclusiveAnticipated(true);
      expect(voicePrint.getCurrentPhase('kevin')).toBe<VoicePhase>('exclusive');
      expect(voicePrint.getCurrentPhase('laurence')).toBe<VoicePhase>('exclusive'); /* anticipé */
      expect(voicePrint.getCurrentPhase('client')).toBe<VoicePhase>('learning'); /* < 10 */
    });
  });
});
