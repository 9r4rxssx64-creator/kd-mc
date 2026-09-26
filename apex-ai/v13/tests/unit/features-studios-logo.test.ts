/**
 * Tests features/studios/logo.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  CANVAS_W,
  CANVAS_H,
  GOOGLE_FONTS,
  MAX_LAYERS,
  MOCKUPS,
  PANTONE_PALETTE,
  PRESET_PALETTES,
  RAL_PALETTE,
  SHAPE_PATHS,
  STORAGE_PREFIX,
  TEMPLATES,
  addLayer,
  allGoogleFonts,
  createLogoFromTemplate,
  escapeHtml,
  exportSvg,
  findTemplate,
  getStorageKey,
  hexToRgb,
  logoStudioStore,
  moveLayerUp,
  removeLayer,
  rgbToHex,
  rgbToHsl,
  templatesByIndustry,
  updateLayer,
} from '../../features/studios/logo/index.js';

const TEST_UID = 'logo_test_uid';

describe('features/studios/logo — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('gère apostrophes', () => {
    expect(escapeHtml("L'or & l'argent")).toContain('&#39;');
    expect(escapeHtml("L'or & l'argent")).toContain('&amp;');
  });
});

describe('features/studios/logo — Color helpers', () => {
  it('hexToRgb convertit correctement', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('zzz')).toBeNull();
  });
  it('rgbToHex convertit correctement', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });
  it('rgbToHsl retourne HSL', () => {
    const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBeGreaterThan(90);
    expect(hsl.l).toBeGreaterThan(40);
  });
});

describe('features/studios/logo — Catalogs', () => {
  it('TEMPLATES contient 30+ templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });
  it('TEMPLATES tous ids uniques', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('PANTONE_PALETTE non vide', () => {
    expect(PANTONE_PALETTE.length).toBeGreaterThanOrEqual(10);
  });
  it('RAL_PALETTE non vide', () => {
    expect(RAL_PALETTE.length).toBeGreaterThanOrEqual(5);
  });
  it('PRESET_PALETTES contient 10+ palettes', () => {
    expect(PRESET_PALETTES.length).toBeGreaterThanOrEqual(10);
  });
  it('GOOGLE_FONTS organisé par catégorie', () => {
    expect(GOOGLE_FONTS.serif.length).toBeGreaterThan(5);
    expect(GOOGLE_FONTS.sans_serif.length).toBeGreaterThan(5);
  });
  it('allGoogleFonts agrège tout', () => {
    const total = allGoogleFonts();
    expect(total.length).toBeGreaterThanOrEqual(80);
  });
  it('SHAPE_PATHS contient toutes les formes', () => {
    expect(Object.keys(SHAPE_PATHS).length).toBeGreaterThanOrEqual(15);
  });
  it('MOCKUPS contient les exports principaux', () => {
    expect(MOCKUPS.length).toBeGreaterThanOrEqual(8);
    expect(MOCKUPS.find((m) => m.id === 'business_card')).toBeDefined();
  });
});

describe('features/studios/logo — Templates', () => {
  it('findTemplate trouve modern_circle', () => {
    expect(findTemplate('modern_circle')?.label).toBe('Modern Cercle');
  });
  it('findTemplate retourne undefined sinon', () => {
    expect(findTemplate('xxx')).toBeUndefined();
  });
  it('templatesByIndustry filtre tech', () => {
    const techs = templatesByIndustry('tech');
    expect(techs.length).toBeGreaterThan(0);
    techs.forEach((t) => expect(t.industry).toBe('tech'));
  });
});

describe('features/studios/logo — createLogoFromTemplate', () => {
  it('crée un logo depuis un template valide', () => {
    const logo = createLogoFromTemplate('modern_circle', 'Test Brand');
    expect(logo).not.toBeNull();
    expect(logo?.name).toBe('Test Brand');
    expect(logo?.layers.length).toBeGreaterThan(0);
    expect(logo?.width).toBe(CANVAS_W);
    expect(logo?.height).toBe(CANVAS_H);
  });
  it('retourne null si template invalide', () => {
    expect(createLogoFromTemplate('nope', 'X')).toBeNull();
  });
  it('met "Mon logo" si nom vide', () => {
    const l = createLogoFromTemplate('modern_circle', '   ');
    expect(l?.name).toBe('Mon logo');
  });
});

describe('features/studios/logo — Layer ops', () => {
  it('addLayer ajoute', () => {
    const l = createLogoFromTemplate('modern_circle', 'X')!;
    const before = l.layers.length;
    const after = addLayer(l, { type: 'shape', shape: 'star', color: '#fff', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, visible: true });
    expect(after.layers.length).toBe(before + 1);
  });
  it('addLayer respecte MAX_LAYERS', () => {
    let l = createLogoFromTemplate('modern_circle', 'X')!;
    for (let i = 0; i < MAX_LAYERS + 5; i++) {
      l = addLayer(l, { type: 'shape', shape: 'circle', color: '#000', x: 0, y: 0, width: 50, height: 50, rotation: 0, opacity: 1, visible: true });
    }
    expect(l.layers.length).toBeLessThanOrEqual(MAX_LAYERS);
  });
  it('removeLayer enlève la couche', () => {
    const l = createLogoFromTemplate('modern_circle', 'X')!;
    const id = l.layers[0]!.id;
    const after = removeLayer(l, id);
    expect(after.layers.find((x) => x.id === id)).toBeUndefined();
  });
  it('updateLayer modifie', () => {
    const l = createLogoFromTemplate('modern_circle', 'X')!;
    const id = l.layers[0]!.id;
    const after = updateLayer(l, id, { opacity: 0.5 });
    expect(after.layers.find((x) => x.id === id)?.opacity).toBe(0.5);
  });
  it('moveLayerUp déplace', () => {
    let l = createLogoFromTemplate('modern_circle', 'X')!;
    if (l.layers.length < 2) {
      l = addLayer(l, { type: 'shape', shape: 'star', color: '#fff', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, visible: true });
    }
    const before = l.layers[1]!.id;
    const after = moveLayerUp(l, before);
    expect(after.layers[0]!.id).toBe(before);
  });
});

describe('features/studios/logo — exportSvg', () => {
  it('génère du SVG valide', () => {
    const l = createLogoFromTemplate('modern_circle', 'X')!;
    const svg = exportSvg(l);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox');
  });
});

describe('features/studios/logo — Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('save + load', () => {
    const l = createLogoFromTemplate('modern_circle', 'Test')!;
    expect(logoStudioStore.save(TEST_UID, l)).toBe(true);
    const loaded = logoStudioStore.load(TEST_UID, l.id);
    expect(loaded?.id).toBe(l.id);
  });
  it('list retourne le logo', () => {
    const l = createLogoFromTemplate('modern_circle', 'Y')!;
    logoStudioStore.save(TEST_UID, l);
    expect(logoStudioStore.list(TEST_UID).length).toBeGreaterThanOrEqual(1);
  });
  it('remove fonctionne', () => {
    const l = createLogoFromTemplate('modern_circle', 'Z')!;
    logoStudioStore.save(TEST_UID, l);
    expect(logoStudioStore.remove(TEST_UID, l.id)).toBe(true);
    expect(logoStudioStore.load(TEST_UID, l.id)).toBeNull();
  });
  it('getStorageKey préfixé', () => {
    expect(getStorageKey(TEST_UID, 'logo_x')).toContain(STORAGE_PREFIX);
  });
});
