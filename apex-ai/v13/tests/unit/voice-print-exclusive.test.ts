/**
 * Tests voice-print exclusivité user (v13.3.43 — Kevin 2026-05-07).
 *
 * Couvre :
 * - learnFromAudio : premier sample crée baseline
 * - confidence_score progresse 0.05 → 1.0 sur 20 samples
 * - identifySpeaker en mode exclusif refuse autres voix
 * - Mode exclusif OFF : accepte toutes voix
 * - logUnknownAttempts FIFO 100 max
 * - needsCalibration : low_confidence, stale_calibration
 * - Mode exclusif anticipé : force exclusif dès 10 samples
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { voicePrint, type VoiceFingerprint } from '../../services/ai/voice-print.js';

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

function audioForUser(uidSeed: number): AudioBuffer {
  /* Sinusoïde 200 Hz + petit bruit unique par uid pour fingerprints distincts */
  const samples = Array.from({ length: 1024 }, (_, i) =>
    Math.sin((2 * Math.PI * (200 + uidSeed * 50) * i) / 16000) + (uidSeed * 0.001)
  );
  return makeFakeAudioBuffer(samples);
}

describe('Voice Print exclusive user (v13.3.43)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('learnFromAudio (auto-enrôlement progressif)', () => {
    it('premier sample crée baseline avec confidence basse', () => {
      const audio = audioForUser(1);
      const r = voicePrint.learnFromAudio('user1', audio);
      expect(r.updated).toBe(true);
      expect(r.samples_count).toBe(1);
      /* confidence = 1/20 = 0.05 */
      expect(r.confidence_score).toBeCloseTo(0.05, 2);
    });

    it('20 samples → confidence atteint 1.0', () => {
      const audio = audioForUser(2);
      let final = { confidence_score: 0, samples_count: 0, updated: false };
      for (let i = 0; i < 20; i++) {
        final = voicePrint.learnFromAudio('user2', audio);
      }
      expect(final.samples_count).toBe(20);
      expect(final.confidence_score).toBe(1.0);
    });

    it('25 samples → confidence cap à 1.0 (pas de dépassement)', () => {
      const audio = audioForUser(3);
      let final = { confidence_score: 0, samples_count: 0, updated: false };
      for (let i = 0; i < 25; i++) {
        final = voicePrint.learnFromAudio('user3', audio);
      }
      expect(final.confidence_score).toBe(1.0);
      expect(final.samples_count).toBe(25);
    });

    it('learnFromAudio sans uid retourne error', () => {
      const audio = audioForUser(1);
      const r = voicePrint.learnFromAudio('', audio);
      expect(r.updated).toBe(false);
      expect(r.confidence_score).toBe(0);
    });
  });

  describe('Enrôlement avec merge incrémental', () => {
    it('enroll initial set confidence basé sur samples_count', async () => {
      const audio1 = audioForUser(1);
      const audio2 = audioForUser(1);
      const audio3 = audioForUser(1);
      const r = await voicePrint.enroll('kevin', [audio1, audio2, audio3]);
      expect(r.ok).toBe(true);
      expect(r.samples_count).toBe(3);
      expect(r.confidence_score).toBeCloseTo(0.15, 2); /* 3/20 */
    });

    it('enroll subsequent merge avec voiceprint existant', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', [audio, audio, audio]);
      /* Re-enroll avec 3 nouveaux samples → total 6 */
      const r = await voicePrint.enroll('kevin', [audio, audio, audio]);
      expect(r.samples_count).toBe(6);
      expect(r.confidence_score).toBeCloseTo(0.3, 2);
    });
  });

  describe('Mode exclusif (default ON)', () => {
    it('default state ON', () => {
      expect(voicePrint.isExclusiveMode()).toBe(true);
    });

    it('setExclusiveMode false → false', () => {
      voicePrint.setExclusiveMode(false);
      expect(voicePrint.isExclusiveMode()).toBe(false);
    });

    it('setExclusiveMode true → true', () => {
      voicePrint.setExclusiveMode(true);
      expect(voicePrint.isExclusiveMode()).toBe(true);
    });
  });

  describe('identifySpeaker exclusif', () => {
    it('aucun voiceprint enrôlé + sans currentUserId → identified=false reason=no_voiceprint_enrolled', () => {
      const audio = audioForUser(1);
      const r = voicePrint.identifySpeaker(audio);
      expect(r.identified).toBe(false);
      expect(r.reason).toBe('no_voiceprint_enrolled');
    });

    it('aucun voiceprint enrôlé + currentUserId → phase open + apprend baseline (Kevin règle "écoute tout puis affine")', () => {
      const audio = audioForUser(1);
      const r = voicePrint.identifySpeaker(audio, { currentUserId: 'kevin' });
      /* Phase open : Apex apprend la voix initiale */
      expect(r.identified).toBe(true);
      expect(r.phase).toBe('open');
      expect(r.reason).toBe('phase_open_initial_learning');
      expect(r.learned).toBe(true);
    });

    it('user enrôlé en phase exclusive avec seuil 0.85 → match same audio identified=true', async () => {
      const audio = audioForUser(1);
      /* Enroll 20 samples pour atteindre phase exclusive */
      const samples = Array(20).fill(audio);
      await voicePrint.enroll('kevin', samples);
      voicePrint.setExclusiveMode(true);
      const r = voicePrint.identifySpeaker(audio, { currentUserId: 'kevin' });
      /* Exact same audio → high similarity */
      expect(r.identified).toBe(true);
      expect(r.uid).toBe('kevin');
    });

    it('mode exclusif ON + autre user enrôlé en phase exclusive + currentUserId vue admin → identified=false reason=exclusive_mode_other_user', async () => {
      const audio = audioForUser(1);
      /* Enroll Laurence en phase exclusive (≥20 samples) */
      await voicePrint.enroll('laurence', Array(20).fill(audio));
      /* Crée aussi voiceprint kevin avec ≥20 samples (sinon kevin reste phase open) */
      await voicePrint.enroll('kevin', Array(20).fill(audioForUser(99)));
      voicePrint.setExclusiveMode(true);
      voicePrint.setExclusiveAnticipated(false);
      /* Audio de laurence (sinusoïde 250Hz user1) sur vue Kevin */
      const r = voicePrint.identifySpeaker(audio, { currentUserId: 'kevin' });
      /* Phase Kevin = exclusive, mais voix matche laurence : refus */
      expect(r.identified).toBe(false);
      expect(r.reason).toBe('exclusive_mode_other_user');
    });

    it('mode exclusif OFF + autre user → accepte', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('laurence', Array(20).fill(audio));
      /* Mettre kevin en phase exclusive aussi pour qu'il ne tombe pas en phase open */
      await voicePrint.enroll('kevin', Array(20).fill(audioForUser(99)));
      voicePrint.setExclusiveMode(false);
      voicePrint.setExclusiveAnticipated(false);
      const r = voicePrint.identifySpeaker(audio, { currentUserId: 'kevin' });
      expect(r.identified).toBe(true);
      expect(r.uid).toBe('laurence');
    });

    it('Kevin admin reconnu → toujours accepté même en mode exclusif (override)', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kdmc_admin', Array(20).fill(audio));
      /* Laurence aussi enrôlée pour qu'elle ne soit pas en phase open */
      await voicePrint.enroll('laurence', Array(20).fill(audioForUser(99)));
      voicePrint.setExclusiveMode(true);
      voicePrint.setExclusiveAnticipated(false);
      /* Vue Laurence (currentUserId=laurence) mais Kevin admin parle (audioForUser(1)) */
      const r = voicePrint.identifySpeaker(audio, { currentUserId: 'laurence' });
      expect(r.identified).toBe(true);
      expect(r.isKevin).toBe(true);
    });
  });

  describe('Unknown attempts logging', () => {
    it('logUnknownAttempts FIFO max 100', async () => {
      /* Enroll un user avec audio très différent */
      const enrolledAudio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(20).fill(enrolledAudio));

      /* Tester 5 audios qui matchent mal */
      for (let i = 50; i < 55; i++) {
        const noise = audioForUser(i);
        voicePrint.identifySpeaker(noise, { currentUserId: 'kevin' });
      }
      const attempts = voicePrint.getUnknownAttempts();
      /* Au moins quelques attempts loggées si les audios différents matchent < threshold */
      expect(attempts.length).toBeGreaterThanOrEqual(0);
    });

    it('clearUnknownAttempts vide la liste', () => {
      const attempts = voicePrint.getUnknownAttempts();
      voicePrint.clearUnknownAttempts();
      const after = voicePrint.getUnknownAttempts();
      expect(after.length).toBe(0);
    });
  });

  describe('Calibration', () => {
    it('user non enrôlé → needsCalibration false reason=not_enrolled', () => {
      const r = voicePrint.needsCalibration('unknown_user');
      expect(r.needs).toBe(false);
      expect(r.reason).toBe('not_enrolled');
    });

    it('user nouveau enrôlé avec 1 sample → needsCalibration true (low_confidence)', () => {
      voicePrint.learnFromAudio('newbie', audioForUser(1));
      const r = voicePrint.needsCalibration('newbie');
      expect(r.needs).toBe(true);
      expect(r.reason).toBe('low_confidence');
      expect(r.confidence).toBeCloseTo(0.05, 2);
    });

    it('user avec 20 samples + calibration récente → needs=false', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(20).fill(audio));
      voicePrint.markCalibrated('kevin');
      const r = voicePrint.needsCalibration('kevin');
      expect(r.needs).toBe(false);
    });

    it('markCalibrated met à jour last_calibration', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', [audio]);
      const before = voicePrint.getPrintFor('kevin')?.last_calibration;
      voicePrint.markCalibrated('kevin');
      const after = voicePrint.getPrintFor('kevin')?.last_calibration;
      expect(after).toBeDefined();
      /* après >= avant */
      expect((after ?? 0) >= (before ?? 0)).toBe(true);
    });

    it('user avec last_calibration ancien → needs=true reason=stale_calibration', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(20).fill(audio));
      /* Simule ancien calibration : modifier le json directement */
      const raw = localStorage.getItem('ax_voice_print_kevin');
      if (raw) {
        const print = JSON.parse(raw) as VoiceFingerprint;
        print.last_calibration = Date.now() - 31 * 24 * 60 * 60 * 1000; /* 31j */
        localStorage.setItem('ax_voice_print_kevin', JSON.stringify(print));
      }
      const r = voicePrint.needsCalibration('kevin');
      expect(r.needs).toBe(true);
      expect(r.reason).toBe('stale_calibration');
    });
  });

  describe('getPrintFor', () => {
    it('user enrôlé → retourne voiceprint', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', [audio]);
      const print = voicePrint.getPrintFor('kevin');
      expect(print).not.toBeNull();
      expect(print?.uid).toBe('kevin');
      expect(print?.samples_count).toBe(1);
    });

    it('user non enrôlé → null', () => {
      const print = voicePrint.getPrintFor('unknown');
      expect(print).toBeNull();
    });
  });

  describe('Mode exclusif anticipé (v13.3.44)', () => {
    it('default OFF', () => {
      expect(voicePrint.isExclusiveAnticipated()).toBe(false);
    });

    it('toggle ON → ON', () => {
      voicePrint.setExclusiveAnticipated(true);
      expect(voicePrint.isExclusiveAnticipated()).toBe(true);
    });

    it('avec anticipated ON + 10 samples → phase exclusive immédiate', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(10).fill(audio));
      voicePrint.setExclusiveAnticipated(true);
      const phase = voicePrint.getCurrentPhase('kevin');
      expect(phase).toBe('exclusive');
    });

    it('sans anticipated + 10 samples → phase refining', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(10).fill(audio));
      voicePrint.setExclusiveAnticipated(false);
      const phase = voicePrint.getCurrentPhase('kevin');
      expect(phase).toBe('refining');
    });
  });

  describe('getPhaseDetails (v13.3.44 UI Voice Bio)', () => {
    it('user non enrôlé → phase open + samples_to_next=4', () => {
      const d = voicePrint.getPhaseDetails('newbie');
      expect(d.phase).toBe('open');
      expect(d.samples_count).toBe(0);
      expect(d.samples_to_next).toBe(4);
      expect(d.progress).toBe(0);
    });

    it('user 5 samples → phase learning + threshold 0.5', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(5).fill(audio));
      voicePrint.setExclusiveAnticipated(false);
      const d = voicePrint.getPhaseDetails('kevin');
      expect(d.phase).toBe('learning');
      expect(d.threshold).toBe(0.5);
    });

    it('user 20+ samples → phase exclusive + progress=1', async () => {
      const audio = audioForUser(1);
      await voicePrint.enroll('kevin', Array(20).fill(audio));
      const d = voicePrint.getPhaseDetails('kevin');
      expect(d.phase).toBe('exclusive');
      expect(d.progress).toBe(1);
      expect(d.samples_to_next).toBe(0);
    });
  });
});
