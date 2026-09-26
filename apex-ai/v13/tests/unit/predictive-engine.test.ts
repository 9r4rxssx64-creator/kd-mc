/**
 * Tests predictive-engine.ts (ML local pour anticipation user — innovation futuriste).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { predictiveEngine } from '../../services/ai/predictive-engine.js';

describe('Predictive Engine (anticipation user actions)', () => {
  beforeEach(() => {
    localStorage.clear();
    predictiveEngine.reset();
  });

  describe('track + history', () => {
    it('track stores action avec id + ts', () => {
      predictiveEngine.track({
        uid: 'kevin',
        action_type: 'tool_used',
        context: { hour: 9, day_of_week: 1 },
        details: { tool: 'studio_music_pro' },
      });
      const stats = predictiveEngine.getStats('kevin');
      expect(stats.total_actions).toBe(1);
      expect(stats.unique_action_types).toBe(1);
    });

    it('history cap MAX_HISTORY=500', () => {
      for (let i = 0; i < 600; i++) {
        predictiveEngine.track({
          uid: 'kev',
          action_type: 'msg',
          context: { hour: 10, day_of_week: 1 },
          details: { i },
        });
      }
      const stats = predictiveEngine.getStats('kev');
      expect(stats.total_actions).toBeLessThanOrEqual(500);
    });
  });

  describe('predict avec history insuffisante', () => {
    it('< 3 actions → predictions vides', () => {
      predictiveEngine.track({
        uid: 'kev',
        action_type: 'mail',
        context: { hour: 9, day_of_week: 1 },
        details: {},
      });
      const preds = predictiveEngine.predict('kev', 9, 1);
      expect(preds.length).toBe(0);
    });
  });

  describe('predict avec patterns réguliers', () => {
    it('5x mail à 9h lundi → predict mail à 9h lundi (confidence > 0.65)', () => {
      for (let i = 0; i < 5; i++) {
        predictiveEngine.track({
          uid: 'kev',
          action_type: 'send_email',
          context: { hour: 9, day_of_week: 1 },
          details: {},
        });
      }
      const preds = predictiveEngine.predict('kev', 9, 1);
      expect(preds.length).toBeGreaterThanOrEqual(1);
      expect(preds[0]?.action_type).toBe('send_email');
      expect(preds[0]?.confidence).toBeGreaterThanOrEqual(0.65);
    });

    it('predictions limitées top 3', () => {
      for (let i = 0; i < 5; i++) {
        predictiveEngine.track({ uid: 'k', action_type: 'a', context: { hour: 9, day_of_week: 1 }, details: {} });
        predictiveEngine.track({ uid: 'k', action_type: 'b', context: { hour: 9, day_of_week: 1 }, details: {} });
        predictiveEngine.track({ uid: 'k', action_type: 'c', context: { hour: 9, day_of_week: 1 }, details: {} });
        predictiveEngine.track({ uid: 'k', action_type: 'd', context: { hour: 9, day_of_week: 1 }, details: {} });
      }
      const preds = predictiveEngine.predict('k', 9, 1);
      expect(preds.length).toBeLessThanOrEqual(3);
    });

    it('user different uids → isolation', () => {
      for (let i = 0; i < 5; i++) {
        predictiveEngine.track({ uid: 'kev', action_type: 'mail', context: { hour: 9, day_of_week: 1 }, details: {} });
      }
      const kevPreds = predictiveEngine.predict('kev', 9, 1);
      const lauPreds = predictiveEngine.predict('laurence', 9, 1);
      expect(kevPreds.length).toBeGreaterThanOrEqual(1);
      expect(lauPreds.length).toBe(0);
    });

    it('hour diff > 1 → exclu (sauf wrap minuit)', () => {
      for (let i = 0; i < 5; i++) {
        predictiveEngine.track({ uid: 'k', action_type: 'mail', context: { hour: 9, day_of_week: 1 }, details: {} });
      }
      /* Predict à 15h lundi → pas de match (hour diff = 6) */
      const preds = predictiveEngine.predict('k', 15, 1);
      expect(preds.length).toBe(0);
    });
  });

  describe('feedback loop', () => {
    it('feedback accepté améliore confidence prochain predict', () => {
      for (let i = 0; i < 5; i++) {
        predictiveEngine.track({ uid: 'k', action_type: 'studio_music', context: { hour: 18, day_of_week: 5 }, details: {} });
      }
      /* User accepte 5x suggestion */
      for (let i = 0; i < 5; i++) predictiveEngine.feedback('studio_music', true);
      const preds = predictiveEngine.predict('k', 18, 5);
      expect(preds.length).toBeGreaterThanOrEqual(1);
      const stats = predictiveEngine.getStats();
      expect(stats.feedback_total.accepted).toBe(5);
    });

    it('feedback rejeté reflété stats', () => {
      predictiveEngine.feedback('mail', false);
      predictiveEngine.feedback('mail', false);
      const stats = predictiveEngine.getStats();
      expect(stats.feedback_total.rejected).toBe(2);
    });
  });

  describe('detectPatterns transitions A→B', () => {
    it('< MIN_OCCURRENCES → vide', () => {
      predictiveEngine.track({ uid: 'k', action_type: 'a', context: { hour: 9, day_of_week: 1 }, details: {} });
      predictiveEngine.track({ uid: 'k', action_type: 'b', context: { hour: 9, day_of_week: 1 }, details: {} });
      const patterns = predictiveEngine.detectPatterns('k');
      expect(patterns.length).toBe(0);
    });

    it('mail→planning 5x détecté pattern', () => {
      const now = Date.now();
      const all: Array<{ uid: string; action_type: string; context: { hour: number; day_of_week: number }; details: Record<string, unknown> }> = [];
      for (let i = 0; i < 5; i++) {
        all.push({ uid: 'k', action_type: 'mail', context: { hour: 9, day_of_week: 1 }, details: {} });
        all.push({ uid: 'k', action_type: 'planning', context: { hour: 9, day_of_week: 1 }, details: {} });
      }
      /* Track avec timestamps incremental small (< 5min entre A et B) */
      let ts = now;
      for (const a of all) {
        predictiveEngine.track(a);
        ts += 60_000;
      }
      const patterns = predictiveEngine.detectPatterns('k');
      const mailPlanning = patterns.find((p) => p.pattern === 'mail→planning');
      expect(mailPlanning?.occurrences).toBeGreaterThanOrEqual(3);
    });
  });

  describe('classifyTime', () => {
    it('matin (5-12h)', () => {
      expect(predictiveEngine.classifyTime(5)).toBe('morning');
      expect(predictiveEngine.classifyTime(8)).toBe('morning');
      expect(predictiveEngine.classifyTime(11)).toBe('morning');
    });

    it('midi (12-14h)', () => {
      expect(predictiveEngine.classifyTime(12)).toBe('noon');
      expect(predictiveEngine.classifyTime(13)).toBe('noon');
    });

    it('après-midi (14-18h)', () => {
      expect(predictiveEngine.classifyTime(15)).toBe('afternoon');
      expect(predictiveEngine.classifyTime(17)).toBe('afternoon');
    });

    it('soir (18-23h)', () => {
      expect(predictiveEngine.classifyTime(20)).toBe('evening');
    });

    it('nuit (23-5h)', () => {
      expect(predictiveEngine.classifyTime(23)).toBe('night');
      expect(predictiveEngine.classifyTime(2)).toBe('night');
    });
  });

  describe('reset RGPD', () => {
    it('reset(uid) supprime user only', () => {
      predictiveEngine.track({ uid: 'kev', action_type: 'a', context: { hour: 9, day_of_week: 1 }, details: {} });
      predictiveEngine.track({ uid: 'lau', action_type: 'b', context: { hour: 9, day_of_week: 1 }, details: {} });
      predictiveEngine.reset('kev');
      expect(predictiveEngine.getStats('kev').total_actions).toBe(0);
      expect(predictiveEngine.getStats('lau').total_actions).toBe(1);
    });

    it('reset() global supprime tout + feedback', () => {
      predictiveEngine.track({ uid: 'k', action_type: 'a', context: { hour: 9, day_of_week: 1 }, details: {} });
      predictiveEngine.feedback('a', true);
      predictiveEngine.reset();
      const stats = predictiveEngine.getStats();
      expect(stats.total_actions).toBe(0);
      expect(stats.feedback_total.accepted).toBe(0);
    });
  });
});
