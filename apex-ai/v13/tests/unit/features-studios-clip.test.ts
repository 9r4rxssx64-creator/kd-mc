/**
 * Tests features/studios/clip.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  ASPECT_RATIOS,
  CAPTION_STYLES,
  FILTERS,
  MAX_DURATION_SEC,
  MAX_SEGMENTS,
  STORAGE_PREFIX,
  TRANSITIONS,
  addCaption,
  addSegment,
  calcTotalDuration,
  clipStudioStore,
  createProject,
  createSegment,
  escapeHtml,
  estimateBpm,
  findFilter,
  findRatio,
  findTransition,
  isWithinDurationLimit,
  moveSegment,
  removeCaption,
  removeSegment,
  setFilter,
  setRatio,
  setSpeed,
  syncToBeat,
} from '../../features/studios/clip/index.js';

const TEST_UID = 'clip_test_uid';

describe('features/studios/clip — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<p>')).toBe('&lt;p&gt;');
  });
});

describe('features/studios/clip — Catalogs', () => {
  it('TRANSITIONS contient 13 transitions', () => {
    expect(TRANSITIONS.length).toBeGreaterThanOrEqual(13);
  });
  it('FILTERS contient 18+ filtres', () => {
    expect(FILTERS.length).toBeGreaterThanOrEqual(18);
  });
  it('CAPTION_STYLES contient 8 styles', () => {
    expect(CAPTION_STYLES.length).toBe(8);
  });
  it('ASPECT_RATIOS contient 5 ratios', () => {
    expect(ASPECT_RATIOS.length).toBe(5);
  });
});

describe('features/studios/clip — find helpers', () => {
  it('findTransition trouve fade', () => {
    expect(findTransition('fade')?.label).toBe('Fondu');
  });
  it('findFilter trouve bw', () => {
    expect(findFilter('bw')?.label).toBe('N&B');
  });
  it('findRatio trouve 9:16', () => {
    expect(findRatio('9:16')?.w).toBe(1080);
  });
});

describe('features/studios/clip — createProject', () => {
  it('crée projet vide', () => {
    const p = createProject('Test', '9:16');
    expect(p.name).toBe('Test');
    expect(p.ratio).toBe('9:16');
    expect(p.segments.length).toBe(0);
    expect(p.totalDurationSec).toBe(0);
  });
  it('default name si vide', () => {
    const p = createProject('  ');
    expect(p.name).toBe('Mon clip');
  });
});

describe('features/studios/clip — createSegment', () => {
  it('crée segment 5s par défaut', () => {
    const s = createSegment('blob:1', 'video.mp4');
    expect(s.endSec - s.startSec).toBe(5);
    expect(s.filter).toBe('none');
    expect(s.speed).toBe(1);
  });
});

describe('features/studios/clip — Segment ops', () => {
  it('addSegment ajoute', () => {
    let p = createProject('X');
    const seg = createSegment('blob:1', 'a.mp4');
    p = addSegment(p, seg);
    expect(p.segments.length).toBe(1);
    expect(p.totalDurationSec).toBeGreaterThan(0);
  });
  it('addSegment respecte MAX_SEGMENTS', () => {
    let p = createProject('X');
    for (let i = 0; i < MAX_SEGMENTS + 5; i++) {
      p = addSegment(p, createSegment(`b:${i}`, `${i}.mp4`));
    }
    expect(p.segments.length).toBeLessThanOrEqual(MAX_SEGMENTS);
  });
  it('removeSegment retire', () => {
    let p = createProject('X');
    const s = createSegment('b', 'a.mp4');
    p = addSegment(p, s);
    p = removeSegment(p, s.id);
    expect(p.segments.length).toBe(0);
  });
  it('moveSegment right', () => {
    let p = createProject('X');
    const a = createSegment('b1', 'a.mp4');
    const b = createSegment('b2', 'b.mp4');
    p = addSegment(p, a);
    p = addSegment(p, b);
    p = moveSegment(p, a.id, 'right');
    expect(p.segments[1]!.id).toBe(a.id);
  });
});

describe('features/studios/clip — calcTotalDuration', () => {
  it('cumule durée /speed', () => {
    const segs = [createSegment('1', 'a'), createSegment('2', 'b')];
    expect(calcTotalDuration(segs)).toBeGreaterThan(0);
  });
});

describe('features/studios/clip — isWithinDurationLimit', () => {
  it('valide projet vide', () => {
    expect(isWithinDurationLimit(createProject('x'))).toBe(true);
  });
  it('test MAX_DURATION_SEC (boost v13 : 60 → 180)', () => {
    expect(MAX_DURATION_SEC).toBe(180);
  });
});

describe('features/studios/clip — setFilter / setSpeed / setRatio', () => {
  it('setFilter applique', () => {
    let p = createProject('X');
    const s = createSegment('b', 'a.mp4');
    p = addSegment(p, s);
    p = setFilter(p, s.id, 'bw');
    expect(p.segments[0]!.filter).toBe('bw');
  });
  it('setSpeed clampe 0.25-4', () => {
    let p = createProject('X');
    const s = createSegment('b', 'a.mp4');
    p = addSegment(p, s);
    p = setSpeed(p, s.id, 10);
    expect(p.segments[0]!.speed).toBe(4);
    p = setSpeed(p, s.id, 0.1);
    expect(p.segments[0]!.speed).toBe(0.25);
  });
  it('setRatio change', () => {
    let p = createProject('X', '9:16');
    p = setRatio(p, '16:9');
    expect(p.ratio).toBe('16:9');
  });
});

describe('features/studios/clip — Captions', () => {
  it('addCaption ajoute', () => {
    let p = createProject('X');
    p = addCaption(p, { text: 'Hello', startSec: 0, endSec: 2, style: 'tiktok', posY: 80 });
    expect(p.captions.length).toBe(1);
  });
  it('removeCaption retire', () => {
    let p = createProject('X');
    p = addCaption(p, { text: 'a', startSec: 0, endSec: 1, style: 'subtitle', posY: 50 });
    const id = p.captions[0]!.id;
    p = removeCaption(p, id);
    expect(p.captions.length).toBe(0);
  });
});

describe('features/studios/clip — BPM helpers', () => {
  it('estimateBpm null si <2 peaks', () => {
    expect(estimateBpm([])).toBeNull();
  });
  it('estimateBpm calcule un BPM raisonnable', () => {
    /* 44100 sample rate, peaks à ~0.5 sec entre = 120 BPM */
    const peaks = [0, 22050, 44100, 66150, 88200];
    const bpm = estimateBpm(peaks, 44100);
    expect(bpm).toBeGreaterThan(40);
    expect(bpm).toBeLessThan(220);
  });
  it('syncToBeat reset segments selon BPM', () => {
    let p = createProject('X');
    p = addSegment(p, createSegment('b', 'a'));
    p = addSegment(p, createSegment('b2', 'b'));
    const synced = syncToBeat(p, 120);
    expect(synced.segments[0]!.startSec).toBeDefined();
  });
});

describe('features/studios/clip — Storage', () => {
  beforeEach(() => localStorage.clear());
  it('save + load', () => {
    const p = createProject('Test');
    expect(clipStudioStore.save(TEST_UID, p)).toBe(true);
    expect(clipStudioStore.load(TEST_UID, p.id)?.id).toBe(p.id);
  });
  it('list', () => {
    clipStudioStore.save(TEST_UID, createProject('X'));
    expect(clipStudioStore.list(TEST_UID).length).toBeGreaterThanOrEqual(1);
  });
  it('STORAGE_PREFIX défini', () => {
    expect(STORAGE_PREFIX).toBeTruthy();
  });
});
