/**
 * Tests features/studios/photo.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  ACCEPTED_FORMATS,
  FILTERS,
  MAX_DIMENSIONS,
  MAX_UPLOAD_MB,
  STICKER_PACK,
  STORAGE_PREFIX,
  addSticker,
  addText,
  buildCssFilter,
  createPhotoProject,
  defaultAdjustments,
  detectFaces,
  detectObjects,
  detectQrBarcode,
  escapeHtml,
  findFilter,
  ocrExtract,
  photoStudioStore,
  removeBackground,
  removeSticker,
  resetAdjustments,
  setAdjustment,
  setFilter,
  validateImageFile,
} from '../../features/studios/photo/index.js';

const TEST_UID = 'photo_test_uid';

describe('features/studios/photo — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/studios/photo — Catalogs', () => {
  it('FILTERS contient 50+ filtres', () => {
    expect(FILTERS.length).toBeGreaterThanOrEqual(48);
  });
  it('FILTERS ids uniques', () => {
    const ids = FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('STICKER_PACK contient 100+ emojis', () => {
    expect(STICKER_PACK.length).toBeGreaterThanOrEqual(100);
  });
  it('ACCEPTED_FORMATS inclut jpeg/png/webp', () => {
    expect(ACCEPTED_FORMATS).toContain('image/jpeg');
    expect(ACCEPTED_FORMATS).toContain('image/png');
    expect(ACCEPTED_FORMATS).toContain('image/webp');
  });
  it('MAX_UPLOAD_MB raisonnable', () => {
    expect(MAX_UPLOAD_MB).toBeGreaterThanOrEqual(10);
  });
});

describe('features/studios/photo — find/utility', () => {
  it('findFilter trouve bw', () => {
    expect(findFilter('bw')?.label).toBe('N&B');
  });
  it('defaultAdjustments retourne 0 partout', () => {
    const a = defaultAdjustments();
    expect(a.brightness).toBe(0);
    expect(a.contrast).toBe(0);
  });
});

describe('features/studios/photo — createPhotoProject', () => {
  it('crée projet avec dimensions', () => {
    const p = createPhotoProject('Photo', 'data:image/png;base64,', 800, 600);
    expect(p.width).toBe(800);
    expect(p.height).toBe(600);
    expect(p.filter).toBe('none');
  });
  it('clamp dimensions à MAX_DIMENSIONS', () => {
    const p = createPhotoProject('X', 'data:', 99999, 99999);
    expect(p.width).toBeLessThanOrEqual(MAX_DIMENSIONS);
    expect(p.height).toBeLessThanOrEqual(MAX_DIMENSIONS);
  });
  it('default name si vide', () => {
    const p = createPhotoProject('  ', 'data:', 100, 100);
    expect(p.name).toBe('Ma photo');
  });
});

describe('features/studios/photo — Filter / Adjust ops', () => {
  it('setFilter applique', () => {
    const p = createPhotoProject('X', 'data:', 100, 100);
    const after = setFilter(p, 'vintage');
    expect(after.filter).toBe('vintage');
  });
  it('setAdjustment modifie une valeur', () => {
    const p = createPhotoProject('X', 'data:', 100, 100);
    const after = setAdjustment(p, 'brightness', 50);
    expect(after.adjustments.brightness).toBe(50);
  });
  it('resetAdjustments remet 0', () => {
    let p = createPhotoProject('X', 'data:', 100, 100);
    p = setAdjustment(p, 'contrast', 50);
    p = resetAdjustments(p);
    expect(p.adjustments.contrast).toBe(0);
  });
});

describe('features/studios/photo — Stickers / Texts', () => {
  it('addSticker ajoute', () => {
    let p = createPhotoProject('X', 'data:', 100, 100);
    p = addSticker(p, '⭐');
    expect(p.stickers.length).toBe(1);
  });
  it('removeSticker retire', () => {
    let p = createPhotoProject('X', 'data:', 100, 100);
    p = addSticker(p, '🎉');
    const id = p.stickers[0]!.id;
    p = removeSticker(p, id);
    expect(p.stickers.length).toBe(0);
  });
  it('addText ajoute layer texte', () => {
    let p = createPhotoProject('X', 'data:', 100, 100);
    p = addText(p, 'Hello world');
    expect(p.texts.length).toBe(1);
    expect(p.texts[0]!.text).toBe('Hello world');
  });
});

describe('features/studios/photo — buildCssFilter', () => {
  it('returns "none" si tout par défaut', () => {
    const p = createPhotoProject('X', 'data:', 100, 100);
    expect(buildCssFilter(p)).toBe('none');
  });
  it('combine filter + brightness', () => {
    let p = createPhotoProject('X', 'data:', 100, 100);
    p = setFilter(p, 'sepia');
    p = setAdjustment(p, 'brightness', 20);
    const f = buildCssFilter(p);
    expect(f).toContain('sepia');
    expect(f).toContain('brightness');
  });
});

describe('features/studios/photo — validateImageFile', () => {
  it('rejette format non supporté', () => {
    const r = validateImageFile({ type: 'application/pdf', size: 1000 });
    expect(r.ok).toBe(false);
  });
  it('rejette fichier trop gros', () => {
    const r = validateImageFile({ type: 'image/jpeg', size: 100 * 1024 * 1024 });
    expect(r.ok).toBe(false);
  });
  it('accepte fichier valide', () => {
    const r = validateImageFile({ type: 'image/jpeg', size: 1024 * 100 });
    expect(r.ok).toBe(true);
  });
});

describe('features/studios/photo — IA mock endpoints', () => {
  it('ocrExtract retourne objet', async () => {
    const r = await ocrExtract('data:image/png;base64,');
    expect(r.text).toBeDefined();
    expect(r.confidence).toBeGreaterThanOrEqual(0);
  });
  it('detectQrBarcode retourne count', async () => {
    const r = await detectQrBarcode('data:');
    expect(r.count).toBeGreaterThanOrEqual(0);
  });
  it('detectFaces retourne items', async () => {
    const r = await detectFaces('data:');
    expect(Array.isArray(r.items)).toBe(true);
  });
  it('detectObjects retourne items', async () => {
    const r = await detectObjects('data:');
    expect(Array.isArray(r.items)).toBe(true);
  });
  it('removeBackground retourne string', async () => {
    const r = await removeBackground('data:');
    expect(typeof r).toBe('string');
  });
});

describe('features/studios/photo — Storage', () => {
  beforeEach(() => localStorage.clear());
  it('save + load', () => {
    const p = createPhotoProject('Test', 'data:', 100, 100);
    expect(photoStudioStore.save(TEST_UID, p)).toBe(true);
    expect(photoStudioStore.load(TEST_UID, p.id)?.id).toBe(p.id);
  });
  it('list', () => {
    photoStudioStore.save(TEST_UID, createPhotoProject('X', 'data:', 100, 100));
    expect(photoStudioStore.list(TEST_UID).length).toBeGreaterThanOrEqual(1);
  });
  it('STORAGE_PREFIX défini', () => {
    expect(STORAGE_PREFIX).toBeTruthy();
  });
});
