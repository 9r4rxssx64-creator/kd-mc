/**
 * Tests features/notes (port v12 vNotes).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { escapeHtml, notesStore } from '../../features/notes/index.js';

const TEST_UID = 'test_uid_notes';

describe('features/notes — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("L'apostrophe")).toBe('L&#39;apostrophe');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('idempotent sur texte clean', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

describe('features/notes — notesStore CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('load retourne [] si pas de notes', () => {
    expect(notesStore.load(TEST_UID)).toEqual([]);
  });

  it('add crée note avec id, timestamps, defaults', () => {
    const n = notesStore.add(TEST_UID, { title: 'Test', content: 'Contenu' });
    expect(n).not.toBeNull();
    expect(n?.id).toMatch(/^note_/);
    expect(n?.title).toBe('Test');
    expect(n?.favorite).toBe(false);
    expect(n?.ts_created).toBeGreaterThan(0);
  });

  it('add refuse titre vide', () => {
    expect(notesStore.add(TEST_UID, { title: '   ', content: 'x' })).toBeNull();
    expect(notesStore.add(TEST_UID, { title: '', content: 'x' })).toBeNull();
  });

  it('add refuse uid vide', () => {
    expect(notesStore.add('', { title: 'X', content: '' })).toBeNull();
  });

  it('update modifie titre + ts_updated', () => {
    const n = notesStore.add(TEST_UID, { title: 'A', content: 'b' });
    if (!n) throw new Error('add failed');
    const ok = notesStore.update(TEST_UID, n.id, { title: 'B' });
    expect(ok).toBe(true);
    const list = notesStore.load(TEST_UID);
    expect(list[0]?.title).toBe('B');
  });

  it('update return false si id inexistant', () => {
    expect(notesStore.update(TEST_UID, 'nope', { title: 'x' })).toBe(false);
  });

  it('remove supprime note', () => {
    const n = notesStore.add(TEST_UID, { title: 'x', content: '' });
    if (!n) throw new Error('add failed');
    expect(notesStore.remove(TEST_UID, n.id)).toBe(true);
    expect(notesStore.load(TEST_UID)).toEqual([]);
  });

  it('toggleFavorite alterne', () => {
    const n = notesStore.add(TEST_UID, { title: 'x', content: '' });
    if (!n) throw new Error('add failed');
    expect(n.favorite).toBe(false);
    notesStore.toggleFavorite(TEST_UID, n.id);
    expect(notesStore.load(TEST_UID)[0]?.favorite).toBe(true);
    notesStore.toggleFavorite(TEST_UID, n.id);
    expect(notesStore.load(TEST_UID)[0]?.favorite).toBe(false);
  });

  it('search trouve par titre/contenu/tag', () => {
    notesStore.add(TEST_UID, { title: 'Liste courses', content: 'pommes', tags: ['food'] });
    notesStore.add(TEST_UID, { title: 'Réunion', content: 'projet APEX', tags: ['work'] });
    expect(notesStore.search(TEST_UID, 'pommes').length).toBe(1);
    expect(notesStore.search(TEST_UID, 'food').length).toBe(1);
    expect(notesStore.search(TEST_UID, 'apex').length).toBe(1);
    expect(notesStore.search(TEST_UID, 'inexistant').length).toBe(0);
  });

  it('exportJson retourne JSON valide', () => {
    notesStore.add(TEST_UID, { title: 'x', content: 'y' });
    const json = notesStore.exportJson(TEST_UID);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as unknown[];
    expect(parsed).toHaveLength(1);
  });

  it('count retourne total', () => {
    expect(notesStore.count(TEST_UID)).toBe(0);
    notesStore.add(TEST_UID, { title: 'a', content: '' });
    notesStore.add(TEST_UID, { title: 'b', content: '' });
    expect(notesStore.count(TEST_UID)).toBe(2);
  });

  it('per-user isolation : uid_a et uid_b séparés', () => {
    notesStore.add('uid_a', { title: 'A', content: '' });
    notesStore.add('uid_b', { title: 'B', content: '' });
    expect(notesStore.load('uid_a').length).toBe(1);
    expect(notesStore.load('uid_b').length).toBe(1);
    expect(notesStore.load('uid_a')[0]?.title).toBe('A');
    expect(notesStore.load('uid_b')[0]?.title).toBe('B');
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('ax_notes_corrupted', '{not json}');
    expect(notesStore.load('corrupted')).toEqual([]);
  });

  it('load gère array invalide', () => {
    localStorage.setItem('ax_notes_bad', '"not_array"');
    expect(notesStore.load('bad')).toEqual([]);
  });
});
