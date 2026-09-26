/**
 * Tests features/studios/video — boost v13 (LUTs, color grading, chroma key,
 * stabilization, auto-crop vertical, multi-langue captions).
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  ASPECT_RATIOS,
  SUPPORTED_LANGS,
  applyChromaKey,
  applyColorGrading,
  applyLutPreset,
  calcAutoCrop,
  calcStabilizationOffset,
  calcTotalDuration,
  calcWatermarkCoords,
  defaultChromaKey,
  defaultColorGrading,
  defaultTransform,
  isValidLang,
  rgbDistance,
  videoStudioStore,
} from '../../features/studios/video/index.js';

describe('features/studios/video boost — LUTs presets', () => {
  it('applyLutPreset none = identité', () => {
    const r = applyLutPreset(100, 150, 200, 'none');
    expect(r).toEqual({ r: 100, g: 150, b: 200 });
  });

  it('applyLutPreset bw → gris', () => {
    const r = applyLutPreset(255, 0, 0, 'bw');
    expect(r.r).toBe(r.g);
    expect(r.g).toBe(r.b);
  });

  it('applyLutPreset sepia → tons jaune-brun', () => {
    const r = applyLutPreset(255, 255, 255, 'sepia');
    /* sépia : R > G > B */
    expect(r.r).toBeGreaterThanOrEqual(r.g);
    expect(r.g).toBeGreaterThanOrEqual(r.b);
  });

  it('applyLutPreset cinema → décalage teal-orange', () => {
    const base = applyLutPreset(128, 128, 128, 'none');
    const cinema = applyLutPreset(128, 128, 128, 'cinema');
    expect(cinema.r).not.toBe(base.r);
    /* Cinema augmente R et B, baisse G */
    expect(cinema.b).toBeGreaterThan(base.b);
  });

  it('applyLutPreset noir → high-contrast B/W (0 ou 255)', () => {
    const r = applyLutPreset(200, 200, 200, 'noir');
    expect([0, 255]).toContain(r.r);
    expect(r.r).toBe(r.g);
    expect(r.g).toBe(r.b);
  });

  it('applyLutPreset clamp [0, 255]', () => {
    const r = applyLutPreset(255, 255, 255, 'warm');
    expect(r.r).toBeLessThanOrEqual(255);
    expect(r.b).toBeLessThanOrEqual(255);
    expect(r.g).toBeGreaterThanOrEqual(0);
  });

  it('applyLutPreset cool ≠ warm', () => {
    const cool = applyLutPreset(128, 128, 128, 'cool');
    const warm = applyLutPreset(128, 128, 128, 'warm');
    /* cool boost B, warm boost R */
    expect(cool.b).toBeGreaterThan(warm.b);
    expect(warm.r).toBeGreaterThan(cool.r);
  });
});

describe('features/studios/video boost — color grading 3-way', () => {
  it('defaultColorGrading: neutre (sat=1, contrast=1, brightness=0)', () => {
    const cg = defaultColorGrading();
    expect(cg.saturation).toBe(1);
    expect(cg.contrast).toBe(1);
    expect(cg.brightness).toBe(0);
    expect(cg.lift.r).toBe(0);
    expect(cg.gain.r).toBe(1);
  });

  it('applyColorGrading neutre = identité (à arrondi près)', () => {
    const cg = defaultColorGrading();
    const r = applyColorGrading(100, 150, 200, cg);
    expect(Math.abs(r.r - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.g - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.b - 200)).toBeLessThanOrEqual(2);
  });

  it('applyColorGrading saturation 0 → gris', () => {
    const cg = defaultColorGrading();
    cg.saturation = 0;
    const r = applyColorGrading(255, 0, 0, cg);
    expect(Math.abs(r.r - r.g)).toBeLessThan(2);
    expect(Math.abs(r.g - r.b)).toBeLessThan(2);
  });

  it('applyColorGrading brightness +1 → blanc', () => {
    const cg = defaultColorGrading();
    cg.brightness = 1;
    const r = applyColorGrading(128, 128, 128, cg);
    expect(r.r).toBe(255);
    expect(r.g).toBe(255);
    expect(r.b).toBe(255);
  });

  it('applyColorGrading clamp final [0, 255]', () => {
    const cg = defaultColorGrading();
    cg.gain = { r: 5, g: 5, b: 5 };
    const r = applyColorGrading(200, 200, 200, cg);
    expect(r.r).toBeLessThanOrEqual(255);
    expect(r.r).toBeGreaterThanOrEqual(0);
  });
});

describe('features/studios/video boost — chroma key (green screen)', () => {
  it('defaultChromaKey: green screen disabled', () => {
    const ck = defaultChromaKey();
    expect(ck.enabled).toBe(false);
    expect(ck.keyColor).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('rgbDistance: identique = 0', () => {
    expect(rgbDistance({ r: 100, g: 100, b: 100 }, { r: 100, g: 100, b: 100 })).toBe(0);
  });

  it('rgbDistance: noir vs blanc = sqrt(3 * 255²)', () => {
    const d = rgbDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(d).toBeCloseTo(Math.sqrt(3 * 255 * 255), 0);
  });

  it('applyChromaKey: désactivé → opaque (255)', () => {
    const ck = defaultChromaKey();
    expect(applyChromaKey(0, 255, 0, ck)).toBe(255);
  });

  it('applyChromaKey: enabled + match exact green → transparent (0)', () => {
    const ck = { ...defaultChromaKey(), enabled: true };
    expect(applyChromaKey(0, 255, 0, ck)).toBe(0);
  });

  it('applyChromaKey: enabled + couleur très différente → opaque', () => {
    const ck = { ...defaultChromaKey(), enabled: true, threshold: 50 };
    expect(applyChromaKey(255, 0, 0, ck)).toBe(255);
  });

  it('applyChromaKey: enabled + zone smooth → semi-transparent', () => {
    const ck = { ...defaultChromaKey(), enabled: true, threshold: 100, smoothness: 0.5 };
    /* dist = sqrt((10-0)² + (245-255)² + (10-0)²) ≈ 17.3 → bien dans threshold */
    const alpha = applyChromaKey(10, 245, 10, ck);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThanOrEqual(255);
  });
});

describe('features/studios/video boost — auto-crop vertical/horizontal', () => {
  it('ASPECT_RATIOS: 9:16 = 1080×1920 (TikTok)', () => {
    expect(ASPECT_RATIOS['9:16']).toEqual({ w: 1080, h: 1920 });
  });

  it('ASPECT_RATIOS: 16:9 = 1920×1080 (YouTube)', () => {
    expect(ASPECT_RATIOS['16:9']).toEqual({ w: 1920, h: 1080 });
  });

  it('calcAutoCrop: 1920×1080 → TikTok 9:16 → crop centré', () => {
    const c = calcAutoCrop(1920, 1080, 'auto-tiktok');
    /* Source plus large → crop horizontal */
    expect(c.h).toBe(1080);
    expect(c.w).toBeLessThan(1080); /* w = h * 9/16 ≈ 607 */
    expect(c.x).toBeGreaterThan(0); /* centré */
  });

  it('calcAutoCrop: 720×1280 → YouTube 16:9 → crop vertical', () => {
    const c = calcAutoCrop(720, 1280, 'auto-youtube');
    expect(c.w).toBe(720);
    expect(c.h).toBeLessThan(720); /* h = w * 9/16 = 405 */
    expect(c.y).toBeGreaterThan(0); /* centré */
  });

  it('calcAutoCrop: manual → no crop', () => {
    const c = calcAutoCrop(1920, 1080, 'manual');
    expect(c.w).toBe(1920);
    expect(c.h).toBe(1080);
    expect(c.x).toBe(0);
  });

  it('calcAutoCrop: source invalide → tout 0', () => {
    const c = calcAutoCrop(0, 0, 'auto-tiktok');
    expect(c.targetW).toBe(0);
  });

  it('calcAutoCrop: IG 1:1 → carré', () => {
    const c = calcAutoCrop(1920, 1080, 'auto-ig');
    /* Source plus large → crop horizontal au plus petit côté */
    expect(c.h).toBe(1080);
    expect(c.w).toBe(1080);
  });

  it('calcAutoCrop: cinema 21:9 → ultra-wide', () => {
    const c = calcAutoCrop(1920, 1080, 'auto-cinema');
    /* 21:9 ratio = 2.33 ; source 16:9 = 1.78 → crop vertical */
    expect(c.w).toBe(1920);
    expect(c.h).toBeLessThan(1080);
  });
});

describe('features/studios/video boost — stabilization', () => {
  it('calcStabilizationOffset: aucun prev → courant', () => {
    const r = calcStabilizationOffset([], { x: 5, y: 3 });
    expect(r).toEqual({ x: 5, y: 3 });
  });

  it('calcStabilizationOffset: lisse vers la moyenne', () => {
    const prev = [{ x: 10, y: 10 }, { x: 12, y: 11 }];
    const r = calcStabilizationOffset(prev, { x: 100, y: 100 }, 0.7);
    /* lissage : doit être proche de la moyenne (11) plus que du courant (100) */
    expect(r.x).toBeLessThan(50);
    expect(r.y).toBeLessThan(50);
  });

  it('calcStabilizationOffset: smoothing 1 → ignore courant', () => {
    const prev = [{ x: 10, y: 10 }];
    const r = calcStabilizationOffset(prev, { x: 50, y: 50 }, 1);
    expect(r.x).toBe(10);
  });
});

describe('features/studios/video boost — watermark coords', () => {
  it('top-left avec margin 16', () => {
    const c = calcWatermarkCoords('top-left', 1920, 1080, 100, 50);
    expect(c).toEqual({ x: 16, y: 16 });
  });

  it('bottom-right correct', () => {
    const c = calcWatermarkCoords('bottom-right', 1920, 1080, 100, 50);
    expect(c.x).toBe(1920 - 100 - 16);
    expect(c.y).toBe(1080 - 50 - 16);
  });

  it('center centré', () => {
    const c = calcWatermarkCoords('center', 1920, 1080, 100, 50);
    expect(c.x).toBe((1920 - 100) / 2);
    expect(c.y).toBe((1080 - 50) / 2);
  });
});

describe('features/studios/video boost — multi-langue captions', () => {
  it('SUPPORTED_LANGS contient 30 langues', () => {
    expect(SUPPORTED_LANGS.length).toBeGreaterThanOrEqual(30);
    expect(SUPPORTED_LANGS).toContain('fr');
    expect(SUPPORTED_LANGS).toContain('en');
    expect(SUPPORTED_LANGS).toContain('zh');
    expect(SUPPORTED_LANGS).toContain('ja');
    expect(SUPPORTED_LANGS).toContain('ar');
  });

  it('isValidLang: fr/en valides, xx invalide', () => {
    expect(isValidLang('fr')).toBe(true);
    expect(isValidLang('FR')).toBe(true);
    expect(isValidLang('xx')).toBe(false);
  });
});

describe('features/studios/video boost — speed ramping + transform', () => {
  beforeEach(() => {
    videoStudioStore.clear();
  });

  it('update: speed clamp [0.25, 4]', () => {
    const c = videoStudioStore.add('A', 10);
    if (!c) throw new Error('add failed');
    videoStudioStore.update(c.id, { speed: 10 });
    expect(videoStudioStore.list()[0]?.speed).toBe(4);
    videoStudioStore.update(c.id, { speed: 0.1 });
    expect(videoStudioStore.list()[0]?.speed).toBe(0.25);
  });

  it('calcTotalDuration: respecte speed (×2 = durée /2)', () => {
    const a = videoStudioStore.add('A', 10);
    if (!a) throw new Error('add failed');
    videoStudioStore.update(a.id, { speed: 2, end: 10 });
    /* trim 0..10, speed 2 → 5s effective */
    expect(calcTotalDuration(videoStudioStore.list())).toBe(5);
  });

  it('updateTransform: rotate uniquement 0/90/180/270', () => {
    const c = videoStudioStore.add('A', 10);
    if (!c) throw new Error('add failed');
    videoStudioStore.updateTransform(c.id, { rotate: 90 });
    expect(videoStudioStore.list()[0]?.transform.rotate).toBe(90);
    /* 45 invalide → ignoré */
    videoStudioStore.updateTransform(c.id, { rotate: 45 as 0 | 90 | 180 | 270 });
    expect(videoStudioStore.list()[0]?.transform.rotate).toBe(90);
  });

  it('updateTransform: cropX clamp [0, 1]', () => {
    const c = videoStudioStore.add('A', 10);
    if (!c) throw new Error('add failed');
    videoStudioStore.updateTransform(c.id, { cropX: 2 });
    expect(videoStudioStore.list()[0]?.transform.cropX).toBe(1);
    videoStudioStore.updateTransform(c.id, { cropX: -1 });
    expect(videoStudioStore.list()[0]?.transform.cropX).toBe(0);
  });

  it('updateChromaKey: enabled toggle', () => {
    const c = videoStudioStore.add('A', 10);
    if (!c) throw new Error('add failed');
    videoStudioStore.updateChromaKey(c.id, { enabled: true });
    expect(videoStudioStore.list()[0]?.chromaKey.enabled).toBe(true);
  });

  it('updateChromaKey: keyColor clamp [0, 255]', () => {
    const c = videoStudioStore.add('A', 10);
    if (!c) throw new Error('add failed');
    videoStudioStore.updateChromaKey(c.id, { keyColor: { r: 300, g: -10, b: 128 } });
    expect(videoStudioStore.list()[0]?.chromaKey.keyColor).toEqual({ r: 255, g: 0, b: 128 });
  });

  it('updateColorGrading: lift clamp [-0.5, 0.5]', () => {
    const c = videoStudioStore.add('A', 10);
    if (!c) throw new Error('add failed');
    videoStudioStore.updateColorGrading(c.id, { lift: { r: 1, g: -1, b: 0 } });
    expect(videoStudioStore.list()[0]?.colorGrading.lift).toEqual({ r: 0.5, g: -0.5, b: 0 });
  });

  it('aspect ratio settable', () => {
    videoStudioStore.setAspectRatio('9:16');
    expect(videoStudioStore.getAspectRatio()).toBe('9:16');
    videoStudioStore.setAspectRatio('original');
  });

  it('watermark settable', () => {
    videoStudioStore.setWatermark({ enabled: true, text: 'TEST', opacity: 0.8 });
    const wm = videoStudioStore.getWatermark();
    expect(wm.enabled).toBe(true);
    expect(wm.text).toBe('TEST');
    expect(wm.opacity).toBe(0.8);
  });

  it('defaultTransform: identité (rotate=0, mirror=false, crop full)', () => {
    const t = defaultTransform();
    expect(t.rotate).toBe(0);
    expect(t.mirrorH).toBe(false);
    expect(t.cropW).toBe(1);
    expect(t.cropH).toBe(1);
  });
});
