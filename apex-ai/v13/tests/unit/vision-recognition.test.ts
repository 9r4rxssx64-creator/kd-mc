/**
 * Tests vision-recognition.ts (Kevin "camera reconnaît tout + cross-app routing").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { visionRecognition } from '../../services/ai/vision-recognition.js';

describe('Vision Recognition (camera + cross-app)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('classifyImage', () => {
    it('texte avec "blackjack" + "monaco" → planning_cmc', () => {
      const t = visionRecognition.classifyImage('PLANNING SBM CASINO MONACO BLACKJACK ROULETTE LUNDI');
      expect(t).toBe('planning_cmc');
    });

    it('texte avec lundi/horaire mais pas casino → planning_other', () => {
      const t = visionRecognition.classifyImage('Lundi 8h Mardi 9h Horaire travail');
      expect(t).toBe('planning_other');
    });

    it('texte type passeport → id_document', () => {
      const t = visionRecognition.classifyImage('PASSEPORT FRANCE NUMERO 12AB34567');
      expect(t).toBe('id_document');
    });

    it('texte type ticket caisse → receipt', () => {
      const t = visionRecognition.classifyImage('TOTAL 24.50 €  TICKET CARTE BANCAIRE TVA 20%');
      expect(t).toBe('receipt');
    });

    it('email + tel → business_card', () => {
      const t = visionRecognition.classifyImage('Jean Dupont jean.dupont@example.com Tél 0612345678');
      expect(t).toBe('business_card');
    });

    it('URL https → qr_code', () => {
      const t = visionRecognition.classifyImage('https://example.com/qr-redirect');
      expect(t).toBe('qr_code');
    });

    it('chiffres 13 chars → barcode', () => {
      const t = visionRecognition.classifyImage('3017620422003');
      expect(t).toBe('barcode');
    });

    it('hint=plant → plant', () => {
      const t = visionRecognition.classifyImage('image of green leaves', 'plant');
      expect(t).toBe('plant');
    });

    it('hint=animal → animal', () => {
      const t = visionRecognition.classifyImage('photo dog', 'animal');
      expect(t).toBe('animal');
    });

    it('texte court inconnu → unknown', () => {
      const t = visionRecognition.classifyImage('hello world');
      expect(t).toBe('unknown');
    });
  });

  describe('determineRouting', () => {
    it('planning_cmc → cmcteams', () => {
      expect(visionRecognition.determineRouting('planning_cmc')).toBe('cmcteams');
    });

    it('business_card → contacts', () => {
      expect(visionRecognition.determineRouting('business_card')).toBe('contacts');
    });

    it('id_document → vault', () => {
      expect(visionRecognition.determineRouting('id_document')).toBe('vault');
    });

    it('receipt → vault', () => {
      expect(visionRecognition.determineRouting('receipt')).toBe('vault');
    });

    it('plant → memory (KB enrichi)', () => {
      expect(visionRecognition.determineRouting('plant')).toBe('memory');
    });

    it('document → studios', () => {
      expect(visionRecognition.determineRouting('document')).toBe('studios');
    });

    it('qr_code → none (action contextuelle)', () => {
      expect(visionRecognition.determineRouting('qr_code')).toBe('none');
    });

    it('unknown → none', () => {
      expect(visionRecognition.determineRouting('unknown')).toBe('none');
    });
  });

  describe('recognize complet', () => {
    it('planning CMC → result avec routing cmcteams', () => {
      const r = visionRecognition.recognize('PLANNING CASINO MONACO BLACKJACK ROULETTE');
      expect(r.type).toBe('planning_cmc');
      expect(r.routing_target).toBe('cmcteams');
      expect(r.confidence).toBe(0.85);
    });

    it('texte unknown → confidence 0.3', () => {
      const r = visionRecognition.recognize('xyz');
      expect(r.type).toBe('unknown');
      expect(r.confidence).toBe(0.3);
    });

    it('extracted_text limité 5000 chars (anti-spam)', () => {
      const long = 'a'.repeat(10000);
      const r = visionRecognition.recognize(long);
      expect(r.extracted_text!.length).toBeLessThanOrEqual(5000);
    });
  });

  describe('route action selon target', () => {
    it('routing cmcteams → action navigate target cmcteams_import', async () => {
      const r = visionRecognition.recognize('PLANNING CASINO MONACO BLACKJACK');
      const action = await visionRecognition.route(r);
      expect(action.action).toBe('navigate');
      expect(action.target).toBe('cmcteams_import');
      expect(action.payload?.['source']).toBe('apex_vision');
    });

    it('routing vault → action modal vault_save_document', async () => {
      const r = visionRecognition.recognize('PASSEPORT FRANCE NUMERO 12AB34567');
      const action = await visionRecognition.route(r);
      expect(action.action).toBe('modal');
      expect(action.target).toBe('vault_save_document');
    });

    it('routing memory → toast + persist KB', async () => {
      const r = visionRecognition.recognize('feuille verte arbre', 'plant');
      const action = await visionRecognition.route(r);
      expect(action.action).toBe('toast');
      const memory = JSON.parse(localStorage.getItem('apex_v13_persistent_memory') ?? '[]') as Array<{ category: string }>;
      expect(memory.some((m) => m.category.includes('vision_'))).toBe(true);
    });

    it('routing none → action none', async () => {
      const r = visionRecognition.recognize('xyz random');
      const action = await visionRecognition.route(r);
      expect(action.action).toBe('none');
    });
  });

  describe('listSupportedTypes (UI tutorial)', () => {
    it('liste >= 12 types avec emoji + example', () => {
      const types = visionRecognition.listSupportedTypes();
      expect(types.length).toBeGreaterThanOrEqual(12);
      expect(types.every((t) => t.emoji && t.example)).toBe(true);
      expect(types.some((t) => t.type === 'planning_cmc')).toBe(true);
      expect(types.some((t) => t.type === 'business_card')).toBe(true);
    });
  });
});
