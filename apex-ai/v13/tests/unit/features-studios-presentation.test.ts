/**
 * Tests features/studios/presentation.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  LAYOUTS,
  MAX_SLIDES,
  STORAGE_PREFIX,
  THEMES,
  addElement,
  addSlide,
  createPresentation,
  createSlide,
  duplicateSlide,
  escapeHtml,
  exportHtml,
  findLayout,
  findTheme,
  getStorageKey,
  moveSlide,
  presentationStudioStore,
  removeSlide,
  setTheme,
  totalDurationMinutes,
  updateSlide,
} from '../../features/studios/presentation/index.js';

const TEST_UID = 'pres_test_uid';

describe('features/studios/presentation — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('features/studios/presentation — Catalogs', () => {
  it('LAYOUTS contient 30+ layouts', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(28);
  });
  it('LAYOUTS ids uniques', () => {
    const ids = LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('THEMES contient 12 thèmes', () => {
    expect(THEMES.length).toBe(12);
  });
  it('THEMES contient dark_pro et casino_or', () => {
    expect(THEMES.find((t) => t.id === 'dark_pro')).toBeDefined();
    expect(THEMES.find((t) => t.id === 'casino_or')).toBeDefined();
  });
  it('chaque thème a primary, fontHeading', () => {
    THEMES.forEach((t) => {
      expect(t.primary).toBeTruthy();
      expect(t.fontHeading).toBeTruthy();
    });
  });
});

describe('features/studios/presentation — find helpers', () => {
  it('findLayout trouve title', () => {
    expect(findLayout('title')?.label).toBe('Titre');
  });
  it('findTheme trouve dark_pro', () => {
    expect(findTheme('dark_pro')?.bg).toBe('#0a0a0f');
  });
});

describe('features/studios/presentation — createPresentation', () => {
  it('crée présentation avec 4 slides initiaux', () => {
    const p = createPresentation('Test', 'dark_pro', 'Kevin');
    expect(p.slides.length).toBe(4);
    expect(p.theme).toBe('dark_pro');
    expect(p.author).toBe('Kevin');
    expect(p.ratio).toBe('16:9');
  });
  it('met "Ma présentation" si nom vide', () => {
    const p = createPresentation('  ');
    expect(p.name).toBe('Ma présentation');
  });
});

describe('features/studios/presentation — createSlide', () => {
  it('crée slide avec layout', () => {
    const s = createSlide('content');
    expect(s.layout).toBe('content');
    expect(s.transition).toBe('fade');
    expect(s.elements).toEqual([]);
  });
});

describe('features/studios/presentation — Slide ops', () => {
  it('addSlide ajoute', () => {
    const p = createPresentation('X');
    const before = p.slides.length;
    const after = addSlide(p, 'quote');
    expect(after.slides.length).toBe(before + 1);
  });
  it('addSlide respecte MAX_SLIDES', () => {
    let p = createPresentation('X');
    for (let i = 0; i < MAX_SLIDES + 10; i++) {
      p = addSlide(p, 'content');
    }
    expect(p.slides.length).toBeLessThanOrEqual(MAX_SLIDES);
  });
  it('removeSlide retire', () => {
    const p = createPresentation('X');
    const id = p.slides[0]!.id;
    const after = removeSlide(p, id);
    expect(after.slides.find((s) => s.id === id)).toBeUndefined();
  });
  it('updateSlide modifie titre', () => {
    const p = createPresentation('X');
    const id = p.slides[0]!.id;
    const after = updateSlide(p, id, { title: 'Nouveau' });
    expect(after.slides.find((s) => s.id === id)?.title).toBe('Nouveau');
  });
  it('moveSlide down déplace', () => {
    const p = createPresentation('X');
    const firstId = p.slides[0]!.id;
    const after = moveSlide(p, firstId, 'down');
    expect(after.slides[1]!.id).toBe(firstId);
  });
  it('duplicateSlide insère après', () => {
    const p = createPresentation('X');
    const before = p.slides.length;
    const id = p.slides[0]!.id;
    const after = duplicateSlide(p, id);
    expect(after.slides.length).toBe(before + 1);
  });
  it('addElement ajoute un élément', () => {
    const p = createPresentation('X');
    const id = p.slides[0]!.id;
    const after = addElement(p, id, { kind: 'text', content: 'Hello', x: 0, y: 0, width: 100, height: 50 });
    expect(after.slides[0]!.elements.length).toBe(1);
  });
});

describe('features/studios/presentation — setTheme', () => {
  it('change le thème', () => {
    const p = createPresentation('X', 'dark_pro');
    const after = setTheme(p, 'casino_or');
    expect(after.theme).toBe('casino_or');
  });
});

describe('features/studios/presentation — totalDurationMinutes', () => {
  it('calcule durée par défaut 60s/slide', () => {
    const p = createPresentation('X');
    const min = totalDurationMinutes(p);
    expect(min).toBeGreaterThan(0);
  });
});

describe('features/studios/presentation — exportHtml', () => {
  it('génère HTML avec 4 sections', () => {
    const p = createPresentation('X', 'dark_pro');
    const html = exportHtml(p);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<section');
  });
});

describe('features/studios/presentation — Storage', () => {
  beforeEach(() => localStorage.clear());
  it('save + load', () => {
    const p = createPresentation('Test');
    expect(presentationStudioStore.save(TEST_UID, p)).toBe(true);
    expect(presentationStudioStore.load(TEST_UID, p.id)?.id).toBe(p.id);
  });
  it('list', () => {
    const p = createPresentation('X');
    presentationStudioStore.save(TEST_UID, p);
    expect(presentationStudioStore.list(TEST_UID).length).toBeGreaterThanOrEqual(1);
  });
  it('remove', () => {
    const p = createPresentation('X');
    presentationStudioStore.save(TEST_UID, p);
    expect(presentationStudioStore.remove(TEST_UID, p.id)).toBe(true);
  });
  it('getStorageKey', () => {
    expect(getStorageKey('u1', 'p1')).toContain(STORAGE_PREFIX);
  });
});
