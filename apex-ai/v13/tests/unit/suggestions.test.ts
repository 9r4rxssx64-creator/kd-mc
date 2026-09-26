/**
 * Tests services/suggestions — Apex v13.3.48 Chat Max
 * Demande Kevin "chat niveau Claude.ai/ChatGPT".
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  generateFollowUps,
  isFollowUpsEnabled,
  setFollowUpsEnabled,
} from '../../services/ai/suggestions.js';

describe('services/suggestions', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('apex_v13_followups_enabled');
    } catch {
      /* ignore */
    }
  });

  describe('generateFollowUps', () => {
    it('retourne 3 suggestions', () => {
      const result = generateFollowUps('Voici une recette de pâtes carbonara');
      expect(result.length).toBe(3);
    });

    it('chaque suggestion a label, prompt, emoji', () => {
      const result = generateFollowUps('Quelques infos sur la cuisine');
      for (const s of result) {
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.prompt.length).toBeGreaterThan(0);
        expect(s.emoji.length).toBeGreaterThan(0);
      }
    });

    it('détecte catégorie cuisine', () => {
      const result = generateFollowUps('Recette de gâteau au chocolat');
      const labels = result.map((s) => s.label).join(' ');
      expect(labels).toMatch(/Variantes|Allergènes|Vins/);
    });

    it('détecte catégorie code (programmation)', () => {
      const result = generateFollowUps('Voici une fonction typescript pour parser json');
      const labels = result.map((s) => s.label).join(' ');
      expect(labels).toMatch(/Optimiser|Tests|Sécurité/);
    });

    it('détecte catégorie juridique', () => {
      const result = generateFollowUps('Article 1240 du Code civil sur la responsabilité');
      const labels = result.map((s) => s.label).join(' ');
      expect(labels).toMatch(/Jurisprudence|Cas pratique|Démarches/);
    });

    it('détecte catégorie musique', () => {
      const result = generateFollowUps('Pour ton mix BPM 128 avec reverb');
      const labels = result.map((s) => s.label).join(' ');
      expect(labels).toMatch(/Effets|Mastering|Export/);
    });

    it('fallback générique si aucune catégorie', () => {
      const result = generateFollowUps('xyzabc qwerty plouf', '');
      expect(result.length).toBe(3);
      expect(result[0]?.label).toMatch(/Plus de détails|Exemple|Aller plus loin/);
    });

    it('fallback générique si vide', () => {
      const result = generateFollowUps('');
      expect(result.length).toBe(3);
    });

    it('utilise userText comme contexte additionnel', () => {
      const result = generateFollowUps('Réponse courte', 'Je veux faire un mix musical');
      const labels = result.map((s) => s.label).join(' ');
      expect(labels).toMatch(/Effets|Mastering|Export/);
    });
  });

  describe('isFollowUpsEnabled / setFollowUpsEnabled', () => {
    it('default OFF (v13.3.89 — Kevin "auto-embed pénible")', () => {
      /* v13.3.89 : default OFF pour ne pas afficher 3 chips à chaque réponse
       * (règle Kevin commit b745570 : trop verbeux dans le chat). */
      expect(isFollowUpsEnabled()).toBe(false);
    });

    it('peut être activé explicitement', () => {
      setFollowUpsEnabled(true);
      expect(isFollowUpsEnabled()).toBe(true);
    });

    it('peut être désactivé', () => {
      setFollowUpsEnabled(true);
      setFollowUpsEnabled(false);
      expect(isFollowUpsEnabled()).toBe(false);
    });

    it('toggle ON puis OFF puis ON', () => {
      setFollowUpsEnabled(true);
      setFollowUpsEnabled(false);
      setFollowUpsEnabled(true);
      expect(isFollowUpsEnabled()).toBe(true);
    });
  });
});
