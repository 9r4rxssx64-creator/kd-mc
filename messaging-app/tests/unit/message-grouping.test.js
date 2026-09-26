/**
 * message-grouping — cœur PUR du groupage de bulles (parité WhatsApp).
 * Couverture 100 % (lib gate). Le rendu/CSS est prouvé au navigateur réel
 * (tests/e2e/screenshots.spec.js + message-grouping e2e).
 */
import { describe, it, expect } from 'vitest';
import {
  isGroupStart, isGroupEnd, groupFlags, groupClass, DEFAULT_GAP_MS,
} from '../../lib/message-grouping.js';

const A = (t) => ({ from: 'a', ts: t });
const B = (t) => ({ from: 'b', ts: t });

describe('isGroupStart', () => {
  it('pas de précédent → début de série', () => {
    expect(isGroupStart(null, A(1000))).toBe(true);
  });
  it('message courant absent → true (sûr)', () => {
    expect(isGroupStart(A(0), null)).toBe(true);
  });
  it('même expéditeur, proche dans le temps → PAS un début', () => {
    expect(isGroupStart(A(1000), A(2000))).toBe(false);
  });
  it('expéditeur différent → début de série', () => {
    expect(isGroupStart(A(1000), B(1100))).toBe(true);
  });
  it('même expéditeur mais trou de temps > seuil → début', () => {
    expect(isGroupStart(A(0), A(DEFAULT_GAP_MS + 1))).toBe(true);
  });
  it('seuil personnalisé', () => {
    expect(isGroupStart(A(0), A(5000), 4000)).toBe(true);
    expect(isGroupStart(A(0), A(3000), 4000)).toBe(false);
  });
  it('gapMs non fini → défaut appliqué', () => {
    expect(isGroupStart(A(0), A(1000), NaN)).toBe(false);
    expect(isGroupStart(A(0), A(DEFAULT_GAP_MS + 1), NaN)).toBe(true);
  });
  it('ts non numériques → traités comme 0', () => {
    expect(isGroupStart({ from: 'a', ts: 'x' }, { from: 'a', ts: undefined })).toBe(false);
  });
});

describe('isGroupEnd', () => {
  it('pas de suivant → fin de série (porte la pointe)', () => {
    expect(isGroupEnd(A(1000), null)).toBe(true);
  });
  it('message courant absent → true', () => {
    expect(isGroupEnd(null, A(1000))).toBe(true);
  });
  it('suivant même expéditeur proche → PAS une fin', () => {
    expect(isGroupEnd(A(1000), A(2000))).toBe(false);
  });
  it('suivant expéditeur différent → fin', () => {
    expect(isGroupEnd(A(1000), B(1100))).toBe(true);
  });
  it('trou de temps vers le suivant → fin', () => {
    expect(isGroupEnd(A(0), A(DEFAULT_GAP_MS + 1))).toBe(true);
  });
  it('gapMs non fini → défaut', () => {
    expect(isGroupEnd(A(0), A(1000), NaN)).toBe(false);
  });
});

describe('groupFlags / groupClass', () => {
  it('message isolé (ni prev ni next) → first & last', () => {
    expect(groupFlags(null, A(1), null)).toEqual({ first: true, last: true });
    expect(groupClass(null, A(1), null)).toBe(' grp-start grp-end');
  });
  it('milieu d\'une série même expéditeur → ni first ni last', () => {
    const flags = groupFlags(A(1000), A(2000), A(3000));
    expect(flags).toEqual({ first: false, last: false });
    expect(groupClass(A(1000), A(2000), A(3000))).toBe('');
  });
  it('début de série (prev autre, next même) → grp-start seul', () => {
    expect(groupClass(B(500), A(1000), A(2000))).toBe(' grp-start');
  });
  it('fin de série (prev même, next autre) → grp-end seul', () => {
    expect(groupClass(A(1000), A(2000), B(3000))).toBe(' grp-end');
  });

  it('scénario réel : 3 messages de A puis 1 de B', () => {
    const msgs = [A(0), A(1000), A(2000), B(3000)];
    const cls = msgs.map((m, i) => groupClass(msgs[i - 1] || null, m, msgs[i + 1] || null));
    expect(cls[0]).toBe(' grp-start');   // 1er de la série A
    expect(cls[1]).toBe('');             // milieu
    expect(cls[2]).toBe(' grp-end');     // dernier de A (pointe)
    expect(cls[3]).toBe(' grp-start grp-end'); // B isolé
  });
});
