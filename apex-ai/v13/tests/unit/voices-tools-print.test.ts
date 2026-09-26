/**
 * Tests voices-registry + smart-tools-suggester + voice-print (Jet 8.1 ULTRA).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { voicesRegistry } from '../../services/ai/voices-registry.js';
import { smartToolsSuggester } from '../../services/ai/smart-tools-suggester.js';
import { voicePrint } from '../../services/ai/voice-print.js';

describe('Voices Registry (50+ voix diversifiées Kevin)', () => {
  describe('catalogue diversifié (anti-monotonie)', () => {
    it('au moins 50 voix au total', () => {
      expect(voicesRegistry.list().length).toBeGreaterThanOrEqual(50);
    });

    it('countByCategory : pro >= 10, fun >= 15, thematic >= 15', () => {
      const c = voicesRegistry.countByCategory();
      expect(c.pro).toBeGreaterThanOrEqual(10);
      expect(c.fun).toBeGreaterThanOrEqual(15);
      expect(c.thematic).toBeGreaterThanOrEqual(15);
    });

    it('auditDiversity healthy : >= 50 + diversité', () => {
      const audit = voicesRegistry.auditDiversity();
      expect(audit.healthy).toBe(true);
      expect(audit.warnings.length).toBe(0);
    });

    it('voix FUN ne sont pas toutes les mêmes (pitch/filter variés)', () => {
      const fun = voicesRegistry.byCategory('fun');
      const filters = new Set(fun.map((v) => v.effects?.filter).filter(Boolean));
      const pitches = new Set(fun.map((v) => v.effects?.pitch).filter(Boolean));
      expect(filters.size).toBeGreaterThanOrEqual(5);
      expect(pitches.size).toBeGreaterThanOrEqual(5);
    });

    it('voix THÉMATIQUES (Yoda, Vador, Mickey, Pirate, etc.)', () => {
      const themes = voicesRegistry.byCategory('thematic');
      const ids = themes.map((v) => v.id);
      expect(ids).toContain('theme_yoda');
      expect(ids).toContain('theme_vader');
      expect(ids).toContain('theme_mickey');
      expect(ids).toContain('theme_pirate');
      expect(ids).toContain('theme_santa');
    });
  });

  describe('rotation anti-monotonie', () => {
    it('randomVoice tire aléatoirement', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 30; i++) ids.add(voicesRegistry.randomVoice().id);
      /* Sur 30 tirages, au moins 5 voix différentes */
      expect(ids.size).toBeGreaterThanOrEqual(5);
    });

    it('surpriseMe diversifie catégories', () => {
      const cats = new Set<string>();
      for (let i = 0; i < 30; i++) cats.add(voicesRegistry.surpriseMe().category);
      /* Sur 30 tirages, au moins 2 catégories différentes */
      expect(cats.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('byContext + user preference', () => {
    it('byContext halloween → theme_witch', () => {
      const v = voicesRegistry.byContext('halloween');
      expect(v?.id).toBe('theme_witch');
    });

    it('byContext christmas → theme_santa', () => {
      const v = voicesRegistry.byContext('christmas');
      expect(v?.id).toBe('theme_santa');
    });

    it('setUserPreference + getUserPreference', () => {
      voicesRegistry.setUserPreference('kevin', 'theme_yoda');
      const pref = voicesRegistry.getUserPreference('kevin');
      expect(pref?.id).toBe('theme_yoda');
    });
  });
});

describe('Smart Tools Suggester (intent → outil sur bureau)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('suggestForIntent', () => {
    it('intent studio_music → Studio Mix Pro', () => {
      const t = smartToolsSuggester.suggestForIntent('studio_music');
      expect(t?.id).toBe('studio_music_pro');
      expect(t?.domain).toBe('music');
    });

    it('intent legal_kb → Knowledge Base Juridique', () => {
      const t = smartToolsSuggester.suggestForIntent('legal_kb');
      expect(t?.domain).toBe('legal');
    });

    it('intent finance_calc → Finance Pro', () => {
      const t = smartToolsSuggester.suggestForIntent('finance_calc');
      expect(t?.domain).toBe('finance');
    });

    it('intent inconnu → null', () => {
      const t = smartToolsSuggester.suggestForIntent('unknown_xyz');
      expect(t).toBeNull();
    });
  });

  describe('bestForDomain', () => {
    it('music → Studio Mix Pro (rating max)', () => {
      const t = smartToolsSuggester.bestForDomain('music');
      expect(t?.id).toBe('studio_music_pro');
      expect(t?.rating).toBeGreaterThanOrEqual(4.5);
    });

    it('architecture → Studio Architecture (rating 4.8)', () => {
      const t = smartToolsSuggester.bestForDomain('architecture');
      expect(t?.id).toBe('studio_architecture');
    });

    it('includePremium=false skip premium', () => {
      const t = smartToolsSuggester.bestForDomain('music', false);
      /* Studio Mix Pro non-premium → reste sélectionné */
      expect(t?.is_premium).toBe(false);
    });
  });

  describe('listForDomain + search', () => {
    it('listForDomain music ordonné rating desc', () => {
      const list = smartToolsSuggester.listForDomain('music');
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.rating).toBeLessThanOrEqual(list[i - 1]!.rating);
      }
    });

    it('search "facture" trouve Studio Facture', () => {
      const found = smartToolsSuggester.search('facture');
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.some((t) => t.id === 'studio_invoice')).toBe(true);
    });
  });

  describe('recordUsage + getTopUsed', () => {
    it('recordUsage + getTopUsed retourne usage_count', () => {
      smartToolsSuggester.recordUsage('studio_music_pro', 'kev');
      smartToolsSuggester.recordUsage('studio_music_pro', 'kev');
      smartToolsSuggester.recordUsage('legal_kb', 'kev');
      const top = smartToolsSuggester.getTopUsed(5);
      expect(top.length).toBeGreaterThanOrEqual(2);
      expect(top[0]?.tool_id).toBe('studio_music_pro');
      expect(top[0]?.usage_count).toBe(2);
    });
  });
});

describe('Voice Print (Dis Apex wake word + biométrie)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isSupported', () => {
    it('isSupported retourne boolean (selon env)', () => {
      expect(typeof voicePrint.isSupported()).toBe('boolean');
    });
  });

  describe('Threshold', () => {
    it('default 0.75', () => {
      expect(voicePrint.getThreshold()).toBe(0.75);
    });

    it('setThreshold clamp [0, 1]', () => {
      voicePrint.setThreshold(2);
      expect(voicePrint.getThreshold()).toBe(1);
      voicePrint.setThreshold(-1);
      expect(voicePrint.getThreshold()).toBe(0);
      voicePrint.setThreshold(0.85);
      expect(voicePrint.getThreshold()).toBe(0.85);
    });
  });

  describe('listPrints + deletePrint', () => {
    it('liste vide initialement', () => {
      expect(voicePrint.listPrints().length).toBe(0);
    });

    it('persist voiceprint manual + listPrints', () => {
      const fp = {
        uid: 'kevin',
        pitch_avg: 150,
        zcr_avg: 0.05,
        energy_avg: 0.3,
        samples_count: 3,
        enrolled_at: Date.now(),
        last_match: 0,
        match_score_avg: 0,
      };
      localStorage.setItem('ax_voice_print_kevin', JSON.stringify(fp));
      const list = voicePrint.listPrints();
      expect(list.length).toBe(1);
      expect(list[0]?.uid).toBe('kevin');
    });

    it('deletePrint efface user voiceprint (RGPD Art. 17)', () => {
      localStorage.setItem(
        'ax_voice_print_kevin',
        JSON.stringify({ uid: 'kevin', pitch_avg: 0, zcr_avg: 0, energy_avg: 0, samples_count: 0, enrolled_at: 0, last_match: 0, match_score_avg: 0 }),
      );
      const ok = voicePrint.deletePrint('kevin');
      expect(ok).toBe(true);
      expect(voicePrint.listPrints().length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('stats vides → 0', () => {
      const s = voicePrint.getStats();
      expect(s.enrolled_count).toBe(0);
      expect(s.total_samples).toBe(0);
    });

    it('stats reflètent voiceprints stockés', () => {
      localStorage.setItem(
        'ax_voice_print_kev',
        JSON.stringify({
          uid: 'kev',
          pitch_avg: 150,
          zcr_avg: 0.05,
          energy_avg: 0.3,
          samples_count: 5,
          enrolled_at: Date.now(),
          last_match: 0,
          match_score_avg: 0.85,
        }),
      );
      const s = voicePrint.getStats();
      expect(s.enrolled_count).toBe(1);
      expect(s.total_samples).toBe(5);
      expect(s.avg_match_score).toBeCloseTo(0.85, 1);
    });
  });

  describe('startWakeWord (env test)', () => {
    it('startWakeWord ne crash pas même sans Web Speech', () => {
      const r = voicePrint.startWakeWord(() => undefined);
      /* En happy-dom : pas de SpeechRecognition → ok=false reason */
      expect(typeof r.ok).toBe('boolean');
      voicePrint.stopWakeWord();
    });

    it('isListening false par défaut', () => {
      voicePrint.stopWakeWord();
      expect(voicePrint.isListening()).toBe(false);
    });
  });
});
