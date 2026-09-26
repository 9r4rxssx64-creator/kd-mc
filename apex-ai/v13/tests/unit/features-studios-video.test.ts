/**
 * Tests features/studios/video (port v12 vMixVideo).
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  MAX_CLIPS,
  MAX_FILE_SIZE_MB,
  MAX_TOTAL_DURATION_S,
  ACCEPTED_FORMATS,
  calcTotalDuration,
  createClip,
  escapeHtml,
  formatDuration,
  isValidVideoFormat,
  videoStudioStore,
} from '../../features/studios/video/index.js';

describe('features/studios/video — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<b>test</b>')).toBe('&lt;b&gt;test&lt;/b&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });
});

describe('features/studios/video — constants', () => {
  it('MAX_CLIPS = 16, MAX_FILE_SIZE_MB = 200 (boost v13)', () => {
    expect(MAX_CLIPS).toBe(16);
    expect(MAX_FILE_SIZE_MB).toBe(200);
  });

  it('MAX_TOTAL_DURATION_S = 600 (10 min, boost v13)', () => {
    expect(MAX_TOTAL_DURATION_S).toBe(600);
  });

  it('ACCEPTED_FORMATS contient mp4 et webm', () => {
    expect(ACCEPTED_FORMATS).toContain('video/mp4');
    expect(ACCEPTED_FORMATS).toContain('video/webm');
  });
});

describe('features/studios/video — formatDuration', () => {
  it('formate secondes en MM:SS', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('gère valeurs invalides', () => {
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(-10)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});

describe('features/studios/video — createClip', () => {
  it('crée clip avec id, name, duration', () => {
    const c = createClip('Mon clip', 30);
    expect(c.id).toMatch(/^clip_/);
    expect(c.name).toBe('Mon clip');
    expect(c.duration).toBe(30);
    expect(c.start).toBe(0);
    expect(c.end).toBe(30);
    expect(c.transition).toBe('cut');
    expect(c.url).toBeNull();
  });

  it('défaut duration 0 si non fournie', () => {
    const c = createClip('A');
    expect(c.duration).toBe(0);
    expect(c.end).toBe(0);
  });

  it('refuse durée négative', () => {
    const c = createClip('X', -10);
    expect(c.duration).toBe(0);
  });
});

describe('features/studios/video — isValidVideoFormat', () => {
  it('accepte mp4, webm, mov, mkv', () => {
    expect(isValidVideoFormat('video/mp4')).toBe(true);
    expect(isValidVideoFormat('video/webm')).toBe(true);
    expect(isValidVideoFormat('video/quicktime')).toBe(true);
    expect(isValidVideoFormat('video/x-matroska')).toBe(true);
  });

  it('refuse audio et image', () => {
    expect(isValidVideoFormat('audio/mp3')).toBe(false);
    expect(isValidVideoFormat('image/jpeg')).toBe(false);
    expect(isValidVideoFormat('')).toBe(false);
  });
});

describe('features/studios/video — calcTotalDuration', () => {
  it('somme durées (end - start) de tous clips', () => {
    const clips = [
      createClip('A', 30),
      createClip('B', 60),
    ];
    expect(calcTotalDuration(clips)).toBe(90);
  });

  it('respecte trims (start/end)', () => {
    const c = createClip('X', 100);
    c.start = 10;
    c.end = 80;
    expect(calcTotalDuration([c])).toBe(70);
  });

  it('retourne 0 si liste vide', () => {
    expect(calcTotalDuration([])).toBe(0);
  });
});

describe('features/studios/video — videoStudioStore CRUD', () => {
  beforeEach(() => {
    videoStudioStore.clear();
  });

  it('list initial vide', () => {
    expect(videoStudioStore.list()).toEqual([]);
  });

  it('add ajoute clip et incrémente count', () => {
    expect(videoStudioStore.count()).toBe(0);
    const c = videoStudioStore.add('A', 30);
    expect(c).not.toBeNull();
    expect(videoStudioStore.count()).toBe(1);
  });

  it('add refuse au-delà MAX_CLIPS', () => {
    for (let i = 0; i < MAX_CLIPS; i++) videoStudioStore.add(`Clip ${i}`);
    const overflow = videoStudioStore.add('Overflow');
    expect(overflow).toBeNull();
  });

  it('remove supprime clip', () => {
    const c = videoStudioStore.add('A');
    if (!c) throw new Error('add failed');
    expect(videoStudioStore.remove(c.id)).toBe(true);
    expect(videoStudioStore.count()).toBe(0);
  });

  it('remove retourne false si id inexistant', () => {
    expect(videoStudioStore.remove('inexistant')).toBe(false);
  });

  it('update modifie caption et trim', () => {
    const c = videoStudioStore.add('A', 100);
    if (!c) throw new Error('add failed');
    videoStudioStore.update(c.id, { caption: 'Sous-titre', start: 10, end: 80 });
    const after = videoStudioStore.list()[0];
    expect(after?.caption).toBe('Sous-titre');
    expect(after?.start).toBe(10);
    expect(after?.end).toBe(80);
  });

  it('update clamp start/end dans [0, duration]', () => {
    const c = videoStudioStore.add('A', 50);
    if (!c) throw new Error('add failed');
    videoStudioStore.update(c.id, { start: -5, end: 999 });
    const after = videoStudioStore.list()[0];
    expect(after?.start).toBe(0);
    expect(after?.end).toBe(50);
  });

  it('update transition modifie type', () => {
    const c = videoStudioStore.add('A');
    if (!c) throw new Error('add failed');
    videoStudioStore.update(c.id, { transition: 'fade' });
    expect(videoStudioStore.list()[0]?.transition).toBe('fade');
  });

  it('reorder modifie ordre', () => {
    const a = videoStudioStore.add('A');
    const b = videoStudioStore.add('B');
    if (!a || !b) throw new Error('add failed');
    expect(videoStudioStore.reorder([b.id, a.id])).toBe(true);
    expect(videoStudioStore.list()[0]?.name).toBe('B');
  });

  it('reorder retourne false si ids incomplets', () => {
    videoStudioStore.add('A');
    videoStudioStore.add('B');
    expect(videoStudioStore.reorder(['only_one'])).toBe(false);
  });

  it('validateFileSize accepte ≤ 200 MB (boost v13)', () => {
    expect(videoStudioStore.validateFileSize(1024)).toBe(true);
    expect(videoStudioStore.validateFileSize(200 * 1024 * 1024)).toBe(true);
    expect(videoStudioStore.validateFileSize(201 * 1024 * 1024)).toBe(false);
    expect(videoStudioStore.validateFileSize(0)).toBe(false);
  });

  it('validateTotalDuration retourne ok=true si total ≤ 300s', () => {
    videoStudioStore.add('A', 60);
    videoStudioStore.add('B', 60);
    const result = videoStudioStore.validateTotalDuration();
    expect(result.ok).toBe(true);
    expect(result.total).toBe(120);
  });
});
