/**
 * gesture-core — cœur PUR du geste « balayer pour répondre » (parité WhatsApp).
 * Couverture 100 % (lib gate). Le DOM/tactile est prouvé au navigateur réel
 * (tests/e2e/swipe-reply.spec.js).
 */
import { describe, it, expect } from 'vitest';
import { swipeReplyDecision, shouldCancelLongPress } from '../../lib/gesture-core.js';

describe('swipeReplyDecision — geste réponse WhatsApp', () => {
  it('balayage franc vers la droite au-delà du seuil → déclenche + progress plein', () => {
    const d = swipeReplyDecision(70, 4);
    expect(d.trigger).toBe(true);
    expect(d.rightward).toBe(true);
    expect(d.horizontal).toBe(true);
    expect(d.progress).toBe(1);
    expect(d.translate).toBe(68); // borné à threshold+12 = 68
  });

  it('déplacement partiel vers la droite → pas de trigger, progress fractionnaire', () => {
    const d = swipeReplyDecision(28, 3); // moitié du seuil 56
    expect(d.trigger).toBe(false);
    expect(d.progress).toBeCloseTo(0.5, 5);
    expect(d.translate).toBe(28);
  });

  it('balayage vers la GAUCHE → jamais de réponse, progress/translate à 0', () => {
    const d = swipeReplyDecision(-80, 2);
    expect(d.trigger).toBe(false);
    expect(d.rightward).toBe(false);
    expect(d.progress).toBe(0);
    expect(d.translate).toBe(0);
  });

  it('geste trop vertical (scroll) → non horizontal, pas de réponse', () => {
    const d = swipeReplyDecision(30, 60); // ay > maxVertical
    expect(d.horizontal).toBe(false);
    expect(d.trigger).toBe(false);
    expect(d.progress).toBe(0);
  });

  it('diagonal insuffisamment horizontal (dx <= dy*ratio) → non horizontal', () => {
    const d = swipeReplyDecision(40, 30); // 40 <= 30*1.5=45
    expect(d.horizontal).toBe(false);
    expect(d.trigger).toBe(false);
  });

  it('seuil et ratio personnalisables', () => {
    const d = swipeReplyDecision(40, 2, { threshold: 40, dirRatio: 2, maxTranslate: 50 });
    expect(d.trigger).toBe(true);
    expect(d.progress).toBe(1);
    expect(d.translate).toBe(40);
  });

  it('maxTranslate borne la translation même très loin', () => {
    const d = swipeReplyDecision(500, 1, { threshold: 56, maxTranslate: 60 });
    expect(d.translate).toBe(60);
    expect(d.progress).toBe(1);
    expect(d.trigger).toBe(true);
  });

  it('entrées non finies (NaN/undefined) → traitées comme 0, sûr', () => {
    const d = swipeReplyDecision(NaN, undefined, { threshold: NaN, maxVertical: NaN, dirRatio: NaN, maxTranslate: NaN });
    expect(d.trigger).toBe(false);
    expect(d.progress).toBe(0);
    expect(d.translate).toBe(0);
    expect(d.horizontal).toBe(false);
    expect(d.rightward).toBe(false);
  });

  it('opts absent (undefined) → défauts appliqués', () => {
    const d = swipeReplyDecision(60);
    expect(d.trigger).toBe(true); // dy=0 → horizontal, 60>=56
  });

  it('opts null explicite → traité comme {} (défauts)', () => {
    const d = swipeReplyDecision(60, 0, null);
    expect(d.trigger).toBe(true);
  });

  it('maxVertical fini fourni → autorise un geste plus penché', () => {
    // ay=30 > défaut 45 ? non, mais avec maxVertical:100 le seuil vertical monte.
    const d = swipeReplyDecision(70, 30, { maxVertical: 100 });
    expect(d.horizontal).toBe(true); // 70 > 30*1.5=45 et 30 <= 100
    expect(d.trigger).toBe(true);
  });
});

describe('shouldCancelLongPress — annule l\'appui long dès qu\'on glisse', () => {
  it('immobile (sous le slop) → ne pas annuler', () => {
    expect(shouldCancelLongPress(3, 4)).toBe(false);
  });
  it('glisse horizontalement au-delà du slop → annuler', () => {
    expect(shouldCancelLongPress(20, 0)).toBe(true);
  });
  it('glisse verticalement au-delà du slop → annuler', () => {
    expect(shouldCancelLongPress(0, 25)).toBe(true);
  });
  it('slop personnalisé', () => {
    expect(shouldCancelLongPress(8, 0, 5)).toBe(true);
    expect(shouldCancelLongPress(8, 0, 20)).toBe(false);
  });
  it('entrées non finies → 0, ne pas annuler ; slop NaN → défaut 10', () => {
    expect(shouldCancelLongPress(NaN, undefined, NaN)).toBe(false);
    expect(shouldCancelLongPress(15, NaN, NaN)).toBe(true);
  });
});
