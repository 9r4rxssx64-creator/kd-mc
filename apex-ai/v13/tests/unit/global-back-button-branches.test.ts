/**
 * global-back-button — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible : injectStyle/mountButton déjà présents (return), updateVisibility (routes + no-btn).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { globalBackButton } from '../../services/core-svc/global-back-button.js';

const BTN_ID = 'apex-global-back-btn';
const STYLE_ID = 'apex-global-back-style';
/* Accès aux méthodes privées pour tester les branches sans dépendre de install(). */
const gbb = globalBackButton as unknown as {
  injectStyle(): void;
  mountButton(): void;
  updateVisibility(): void;
};

function cleanDom(): void {
  document.getElementById(BTN_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

beforeEach(() => { cleanDom(); location.hash = ''; });

describe('global-back-button — injectStyle / mountButton idempotents', () => {
  it('injectStyle 2× → 2e fois style déjà présent → return', () => {
    gbb.injectStyle();
    expect(document.getElementById(STYLE_ID)).toBeTruthy();
    expect(() => gbb.injectStyle()).not.toThrow(); // branche "déjà présent"
    expect(document.querySelectorAll('#' + STYLE_ID).length).toBe(1);
  });

  it('mountButton 2× → 2e fois bouton déjà présent → return', () => {
    gbb.mountButton();
    expect(document.getElementById(BTN_ID)).toBeTruthy();
    expect(() => gbb.mountButton()).not.toThrow();
    expect(document.querySelectorAll('#' + BTN_ID).length).toBe(1);
  });
});

describe('global-back-button — updateVisibility', () => {
  it('pas de bouton → return sans crash', () => {
    cleanDom();
    expect(() => gbb.updateVisibility()).not.toThrow();
  });

  it('route chat (hash vide → #chat) → bouton caché', () => {
    gbb.mountButton();
    location.hash = '';
    gbb.updateVisibility();
    expect(document.getElementById(BTN_ID)?.classList.contains('is-hidden')).toBe(true);
  });

  it('route chatlite → caché', () => {
    gbb.mountButton();
    location.hash = '#chatlite';
    gbb.updateVisibility();
    expect(document.getElementById(BTN_ID)?.classList.contains('is-hidden')).toBe(true);
  });

  it('route vide (#) → caché (route==="")', () => {
    gbb.mountButton();
    location.hash = '#';
    gbb.updateVisibility();
    expect(document.getElementById(BTN_ID)?.classList.contains('is-hidden')).toBe(true);
  });

  it('route non-chat (#admin?x=1) → bouton visible', () => {
    gbb.mountButton();
    location.hash = '#admin?x=1';
    gbb.updateVisibility();
    expect(document.getElementById(BTN_ID)?.classList.contains('is-hidden')).toBe(false);
  });
});
