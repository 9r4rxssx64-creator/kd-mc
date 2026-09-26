import { describe, it, expect } from 'vitest';
import {
  normPrivacy, canSeeReadReceipts, canSeeTyping, canSeePresence,
} from '../../lib/privacy-reciprocity.js';

describe('normPrivacy', () => {
  it('défauts sûrs = tout activé', () => {
    expect(normPrivacy(undefined)).toEqual({ readReceipts: true, typingIndicator: true, onlineStatus: true });
    expect(normPrivacy(null)).toEqual({ readReceipts: true, typingIndicator: true, onlineStatus: true });
    expect(normPrivacy('bad')).toEqual({ readReceipts: true, typingIndicator: true, onlineStatus: true });
    expect(normPrivacy({})).toEqual({ readReceipts: true, typingIndicator: true, onlineStatus: true });
  });
  it('seul false désactive (autres valeurs = activé)', () => {
    expect(normPrivacy({ readReceipts: false })).toMatchObject({ readReceipts: false, typingIndicator: true });
    expect(normPrivacy({ typingIndicator: 0 })).toMatchObject({ typingIndicator: true }); // 0 ≠ false strict → activé
    expect(normPrivacy({ onlineStatus: false })).toMatchObject({ onlineStatus: false });
  });
});

describe('réciprocité : voir = ne pas avoir coupé le sien', () => {
  it('accusés de lecture', () => {
    expect(canSeeReadReceipts({ readReceipts: true })).toBe(true);
    expect(canSeeReadReceipts({ readReceipts: false })).toBe(false);
    expect(canSeeReadReceipts(undefined)).toBe(true);
  });
  it('saisie', () => {
    expect(canSeeTyping({ typingIndicator: true })).toBe(true);
    expect(canSeeTyping({ typingIndicator: false })).toBe(false);
    expect(canSeeTyping(undefined)).toBe(true);
  });
  it('présence', () => {
    expect(canSeePresence({ onlineStatus: true })).toBe(true);
    expect(canSeePresence({ onlineStatus: false })).toBe(false);
    expect(canSeePresence(undefined)).toBe(true);
  });
});

describe('exposition navigateur', () => {
  it('window.ApexPrivacy', () => {
    expect(window.ApexPrivacy.canSeeReadReceipts).toBe(canSeeReadReceipts);
    expect(window.ApexPrivacy.canSeeTyping).toBe(canSeeTyping);
    expect(window.ApexPrivacy.canSeePresence).toBe(canSeePresence);
    expect(window.ApexPrivacy.normPrivacy).toBe(normPrivacy);
  });
});
