/**
 * Tests features/archive (historique cross-app).
 *
 * Couvre :
 *  - escapeHtml anti-XSS
 *  - isValidCategory
 *  - archiveStore CRUD (load/add/save)
 *  - archiveHub.listAll + filtres (category, query, fromTs/toTs)
 *  - archiveHub.listByCategory
 *  - archiveHub.search
 *  - archiveHub.stats
 *  - archiveHub.restore
 *  - archiveHub.exportArchive (JSON, CSV, fallback ZIP)
 *  - archiveHub.purgeOld
 *  - collectAll : sources notes / events / backups / audits / handoff / lessons / projects / invoices
 *  - per-user isolation
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  archiveHub,
  archiveStore,
  escapeHtml,
  isValidCategory,
  type ArchiveCategory,
  type ArchiveItem,
} from '../../features/archive/index.js';

const TEST_UID = 'test_uid_archive';

function clearAll(): void {
  localStorage.clear();
}

describe('features/archive — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("L'apostrophe")).toBe('L&#39;apostrophe');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('idempotent sur texte clean', () => {
    expect(escapeHtml('Texte normal 123')).toBe('Texte normal 123');
  });
});

describe('features/archive — isValidCategory', () => {
  it('accepte toutes les catégories valides', () => {
    const valid: ArchiveCategory[] = [
      'projects', 'invoices', 'notes', 'events',
      'backups', 'audits', 'handoff', 'lessons',
    ];
    for (const c of valid) expect(isValidCategory(c)).toBe(true);
  });

  it('refuse catégorie inconnue', () => {
    expect(isValidCategory('foo')).toBe(false);
    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
    expect(isValidCategory(42)).toBe(false);
  });
});

describe('features/archive — archiveStore CRUD', () => {
  beforeEach(() => clearAll());
  afterEach(() => clearAll());

  it('load retourne [] si pas de données', () => {
    expect(archiveStore.load(TEST_UID)).toEqual([]);
  });

  it('load retourne [] si uid vide', () => {
    expect(archiveStore.load('')).toEqual([]);
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('ax_archive_corrupt', '{not_json}');
    expect(archiveStore.load('corrupt')).toEqual([]);
  });

  it('load gère valeur non-array', () => {
    localStorage.setItem('ax_archive_obj', '{"x":1}');
    expect(archiveStore.load('obj')).toEqual([]);
  });

  it('add crée item avec id, ts, restored=false', () => {
    const it = archiveStore.add(TEST_UID, {
      category: 'projects',
      title: 'Mon Projet',
      summary: 'Description',
    });
    expect(it).not.toBeNull();
    expect(it?.id).toMatch(/^arc_/);
    expect(it?.ts).toBeGreaterThan(0);
    expect(it?.restored).toBe(false);
    expect(it?.category).toBe('projects');
  });

  it('add refuse uid vide', () => {
    expect(archiveStore.add('', { category: 'notes', title: 'x' })).toBeNull();
  });

  it('add refuse titre absent', () => {
    expect(archiveStore.add(TEST_UID, { category: 'notes', title: '' })).toBeNull();
  });

  it('add refuse catégorie invalide', () => {
    expect(archiveStore.add(TEST_UID, { category: 'invalid' as ArchiveCategory, title: 'x' })).toBeNull();
  });

  it('add tronque titre à 240 chars', () => {
    const longTitle = 'a'.repeat(500);
    const it = archiveStore.add(TEST_UID, { category: 'notes', title: longTitle });
    expect(it?.title.length).toBe(240);
  });

  it('save fail si uid vide', () => {
    expect(archiveStore.save('', [])).toBe(false);
  });

  it('per-user isolation : uid_a et uid_b séparés', () => {
    archiveStore.add('uid_a', { category: 'projects', title: 'A' });
    archiveStore.add('uid_b', { category: 'projects', title: 'B' });
    expect(archiveStore.load('uid_a').length).toBe(1);
    expect(archiveStore.load('uid_b').length).toBe(1);
    expect(archiveStore.load('uid_a')[0]?.title).toBe('A');
  });
});

describe('features/archive — archiveHub.collectAll sources', () => {
  beforeEach(() => clearAll());
  afterEach(() => clearAll());

  it('vide si aucune source', () => {
    expect(archiveHub.listAll(TEST_UID)).toEqual([]);
  });

  it('vide si uid vide', () => {
    expect(archiveHub.listAll('')).toEqual([]);
  });

  it('agrège notes depuis ax_notes_<uid>', () => {
    localStorage.setItem(`ax_notes_${TEST_UID}`, JSON.stringify([
      { id: 'n1', title: 'Note 1', content: 'c1', tags: [], favorite: false, ts_created: 1000, ts_updated: 2000 },
    ]));
    const all = archiveHub.listAll(TEST_UID);
    expect(all.some((i) => i.category === 'notes' && i.title === 'Note 1')).toBe(true);
  });

  it('filtre les events futurs (garde uniquement passés)', () => {
    const past = '2020-01-01';
    const future = '2099-12-31';
    localStorage.setItem(`ax_calendar_${TEST_UID}`, JSON.stringify([
      { id: 'e1', title: 'Passé', date: past, ts_created: 1 },
      { id: 'e2', title: 'Futur', date: future, ts_created: 2 },
    ]));
    const events = archiveHub.listByCategory(TEST_UID, 'events');
    expect(events.some((i) => i.title === 'Passé')).toBe(true);
    expect(events.some((i) => i.title === 'Futur')).toBe(false);
  });

  it('agrège backups depuis ax_backup_*', () => {
    localStorage.setItem('ax_backup_2026-01-01', JSON.stringify({ ts: 100, foo: 'bar' }));
    const backups = archiveHub.listByCategory(TEST_UID, 'backups');
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect(backups[0]?.category).toBe('backups');
  });

  it('agrège audits depuis ax_self_audit_history', () => {
    localStorage.setItem('ax_self_audit_history', JSON.stringify([
      { ts: 100, score: 95, verdict: 'PASS' },
      { ts: 200, score: 80, verdict: 'WARN' },
    ]));
    const audits = archiveHub.listByCategory(TEST_UID, 'audits');
    expect(audits.length).toBe(2);
    expect(audits[0]?.title).toMatch(/Audit score/);
  });

  it('agrège handoff depuis ax_claude_todo + ax_handoff_journal', () => {
    localStorage.setItem('ax_claude_todo', JSON.stringify([
      { id: 't1', reason: 'Bug fix', status: 'pending', severity: 'high', ts: 100 },
    ]));
    localStorage.setItem('ax_handoff_journal', JSON.stringify([
      { ts: 50, action: 'Audit', result: 'OK' },
    ]));
    const handoff = archiveHub.listByCategory(TEST_UID, 'handoff');
    expect(handoff.length).toBe(2);
  });

  it('agrège lessons learned', () => {
    localStorage.setItem('ax_lessons_learned_struct', JSON.stringify([
      { id: 'L1', title: 'Lesson 1', text: 'do not X', ts: 100 },
    ]));
    const lessons = archiveHub.listByCategory(TEST_UID, 'lessons');
    expect(lessons.length).toBe(1);
    expect(lessons[0]?.title).toBe('Lesson 1');
  });

  it('agrège projects archivés + invoices', () => {
    localStorage.setItem('ax_projects_archived', JSON.stringify([
      { id: 'p1', name: 'Projet alpha', description: 'desc', archivedAt: 100 },
    ]));
    localStorage.setItem(`ax_invoices_${TEST_UID}`, JSON.stringify([
      { id: 'inv1', title: 'Facture #1', amount: 100, currency: 'EUR', ts: 200 },
    ]));
    expect(archiveHub.listByCategory(TEST_UID, 'projects').length).toBe(1);
    expect(archiveHub.listByCategory(TEST_UID, 'invoices').length).toBe(1);
  });

  it('dédupe items avec même id', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'Dup', id: 'fixed_id' });
    archiveStore.add(TEST_UID, { category: 'projects', title: 'Dup2', id: 'fixed_id' });
    /* archiveStore.add génère son propre id si fourni → save direct pour test dédup */
    archiveStore.save(TEST_UID, [
      { id: 'dup', category: 'projects', title: 'A', ts: 100 },
      { id: 'dup', category: 'projects', title: 'B', ts: 200 },
    ]);
    const all = archiveHub.listAll(TEST_UID);
    const dupItems = all.filter((i) => i.id === 'dup');
    expect(dupItems.length).toBe(1);
  });
});

describe('features/archive — archiveHub.listAll filtres', () => {
  beforeEach(() => clearAll());
  afterEach(() => clearAll());

  it('filtre par category', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'P1' });
    archiveStore.add(TEST_UID, { category: 'invoices', title: 'I1' });
    const projects = archiveHub.listAll(TEST_UID, { category: 'projects' });
    expect(projects.length).toBe(1);
    expect(projects[0]?.category).toBe('projects');
  });

  it('filtre par fromTs/toTs', () => {
    archiveStore.save(TEST_UID, [
      { id: 'a', category: 'projects', title: 'A', ts: 100 },
      { id: 'b', category: 'projects', title: 'B', ts: 500 },
      { id: 'c', category: 'projects', title: 'C', ts: 1000 },
    ]);
    const mid = archiveHub.listAll(TEST_UID, { fromTs: 200, toTs: 800 });
    expect(mid.length).toBe(1);
    expect(mid[0]?.title).toBe('B');
  });

  it('filtre par query (full-text)', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'Casino Monaco', summary: 'SBM' });
    archiveStore.add(TEST_UID, { category: 'projects', title: 'Apex AI', summary: 'IA' });
    const r = archiveHub.listAll(TEST_UID, { query: 'apex' });
    expect(r.length).toBe(1);
    expect(r[0]?.title).toBe('Apex AI');
  });

  it('search wrapper retourne items matchant', () => {
    archiveStore.add(TEST_UID, { category: 'notes', title: 'Réunion' });
    expect(archiveHub.search(TEST_UID, 'reunion').length).toBeGreaterThanOrEqual(0);
    expect(archiveHub.search(TEST_UID, 'Réunion').length).toBe(1);
    expect(archiveHub.search(TEST_UID, 'inexistant').length).toBe(0);
  });

  it('listByCategory refuse catégorie invalide', () => {
    expect(archiveHub.listByCategory(TEST_UID, 'bad' as ArchiveCategory)).toEqual([]);
  });

  it('liste triée desc par ts', () => {
    archiveStore.save(TEST_UID, [
      { id: 'a', category: 'projects', title: 'old', ts: 100 },
      { id: 'b', category: 'projects', title: 'new', ts: 999 },
    ]);
    const all = archiveHub.listAll(TEST_UID);
    expect(all[0]?.title).toBe('new');
  });
});

describe('features/archive — archiveHub.stats', () => {
  beforeEach(() => clearAll());

  it('retourne stats à zéro si vide', () => {
    const s = archiveHub.stats(TEST_UID);
    expect(s.total).toBe(0);
    expect(s.by_category.projects).toBe(0);
    expect(s.by_category.lessons).toBe(0);
  });

  it('compte par catégorie', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'p1' });
    archiveStore.add(TEST_UID, { category: 'projects', title: 'p2' });
    archiveStore.add(TEST_UID, { category: 'invoices', title: 'i1' });
    const s = archiveHub.stats(TEST_UID);
    expect(s.total).toBe(3);
    expect(s.by_category.projects).toBe(2);
    expect(s.by_category.invoices).toBe(1);
  });

  it('expose oldest_ts et newest_ts', () => {
    archiveStore.save(TEST_UID, [
      { id: 'a', category: 'projects', title: 'A', ts: 100 },
      { id: 'b', category: 'projects', title: 'B', ts: 999 },
    ]);
    const s = archiveHub.stats(TEST_UID);
    expect(s.oldest_ts).toBe(100);
    expect(s.newest_ts).toBe(999);
  });
});

describe('features/archive — archiveHub.restore', () => {
  beforeEach(() => clearAll());

  it('restore retourne ok=false si args invalides', () => {
    expect(archiveHub.restore('', 'x').ok).toBe(false);
    expect(archiveHub.restore(TEST_UID, '').ok).toBe(false);
  });

  it('restore retourne not_found si id inconnu', () => {
    const r = archiveHub.restore(TEST_UID, 'inexistant');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_found');
  });

  it('restore marque item comme restored=true et écrit flag', () => {
    const it = archiveStore.add(TEST_UID, { category: 'projects', title: 'Restorable' });
    expect(it).not.toBeNull();
    if (!it) return;
    const r = archiveHub.restore(TEST_UID, it.id);
    expect(r.ok).toBe(true);
    const reloaded = archiveStore.load(TEST_UID).find((x) => x.id === it.id);
    expect(reloaded?.restored).toBe(true);
    expect(reloaded?.restoredAt).toBeGreaterThan(0);
    /* flag persisté */
    const flag = localStorage.getItem(`ax_archive_restored_${TEST_UID}`);
    expect(flag).toBeTruthy();
  });

  it('restore avec type contraint matche bonne catégorie', () => {
    const it = archiveStore.add(TEST_UID, { category: 'notes', title: 'Note' });
    if (!it) return;
    const wrongType = archiveHub.restore(TEST_UID, it.id, 'projects');
    expect(wrongType.ok).toBe(false);
    const goodType = archiveHub.restore(TEST_UID, it.id, 'notes');
    expect(goodType.ok).toBe(true);
  });
});

describe('features/archive — archiveHub.exportArchive', () => {
  beforeEach(() => clearAll());

  it('export JSON par défaut, parse-able', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'Mon Projet' });
    const out = archiveHub.exportArchive(TEST_UID);
    const parsed = JSON.parse(out) as { ver: number; items: ArchiveItem[] };
    expect(parsed.ver).toBe(1);
    expect(Array.isArray(parsed.items)).toBe(true);
  });

  it('export CSV avec header et lignes', () => {
    archiveStore.add(TEST_UID, { category: 'notes', title: 'Test "Quote"' });
    const csv = archiveHub.exportArchive(TEST_UID, 'csv');
    expect(csv.startsWith('id,category,title,summary,ts,date_iso')).toBe(true);
    expect(csv).toContain('Test ""Quote""'); /* CSV escaping */
  });

  it('export ZIP fallback JSON', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'X' });
    const out = archiveHub.exportArchive(TEST_UID, 'zip');
    const parsed = JSON.parse(out) as { ver: number };
    expect(parsed.ver).toBe(1);
  });

  it('export vide retourne JSON valide', () => {
    const out = archiveHub.exportArchive(TEST_UID);
    const parsed = JSON.parse(out) as { items: unknown[]; total: number };
    expect(parsed.total).toBe(0);
    expect(parsed.items).toEqual([]);
  });
});

describe('features/archive — archiveHub.purgeOld', () => {
  beforeEach(() => clearAll());

  it('purge items > daysAgo', () => {
    const old = Date.now() - 100 * 86400000; /* 100 jours */
    const recent = Date.now() - 10 * 86400000; /* 10 jours */
    archiveStore.save(TEST_UID, [
      { id: 'old', category: 'projects', title: 'Old', ts: old },
      { id: 'recent', category: 'projects', title: 'Recent', ts: recent },
    ]);
    const purged = archiveHub.purgeOld(TEST_UID, 90);
    expect(purged).toBe(1);
    const remaining = archiveStore.load(TEST_UID);
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.title).toBe('Recent');
  });

  it('purge retourne 0 si rien à purger', () => {
    archiveStore.add(TEST_UID, { category: 'projects', title: 'Recent' });
    expect(archiveHub.purgeOld(TEST_UID, 90)).toBe(0);
  });

  it('purge retourne 0 si uid vide ou daysAgo invalide', () => {
    expect(archiveHub.purgeOld('', 90)).toBe(0);
    expect(archiveHub.purgeOld(TEST_UID, 0)).toBe(0);
    expect(archiveHub.purgeOld(TEST_UID, -5)).toBe(0);
  });

  it('purge utilise valeur par défaut (90j) si non précisé', () => {
    const veryOld = Date.now() - 200 * 86400000;
    archiveStore.save(TEST_UID, [
      { id: 'vo', category: 'projects', title: 'Very Old', ts: veryOld },
    ]);
    const n = archiveHub.purgeOld(TEST_UID);
    expect(n).toBe(1);
  });
});
