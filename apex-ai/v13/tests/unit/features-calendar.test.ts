/**
 * Tests features/calendar (port v12 vCalendar).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { calendarStore, escapeHtml, isValidDate, isValidTime } from '../../features/calendar/index.js';

const TEST_UID = 'test_uid_cal';

describe('features/calendar — validators', () => {
  it('isValidDate accepte ISO YYYY-MM-DD', () => {
    expect(isValidDate('2026-01-15')).toBe(true);
    expect(isValidDate('2026-12-31')).toBe(true);
  });

  it('isValidDate refuse formats invalides', () => {
    expect(isValidDate('15/01/2026')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false); /* mois 13 */
    expect(isValidDate('2026-02-30')).toBe(false); /* février 30 */
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  it('isValidTime accepte HH:MM 00-23 et 00-59', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('14:30')).toBe(true);
  });

  it('isValidTime refuse formats invalides', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('14:60')).toBe(false);
    expect(isValidTime('14h30')).toBe(false);
    expect(isValidTime('')).toBe(false);
  });

  it('escapeHtml échappe HTML', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/calendar — calendarStore CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('load retourne [] vide', () => {
    expect(calendarStore.load(TEST_UID)).toEqual([]);
  });

  it('add crée événement valide', () => {
    const ev = calendarStore.add(TEST_UID, { title: 'Test', date: '2026-06-15' });
    expect(ev).not.toBeNull();
    expect(ev?.id).toMatch(/^evt_/);
    expect(ev?.title).toBe('Test');
    expect(ev?.date).toBe('2026-06-15');
  });

  it('add refuse titre vide', () => {
    expect(calendarStore.add(TEST_UID, { title: '', date: '2026-06-15' })).toBeNull();
  });

  it('add refuse date invalide', () => {
    expect(calendarStore.add(TEST_UID, { title: 'x', date: 'invalid' })).toBeNull();
    expect(calendarStore.add(TEST_UID, { title: 'x', date: '2026-13-99' })).toBeNull();
  });

  it('add refuse heure invalide', () => {
    expect(calendarStore.add(TEST_UID, { title: 'x', date: '2026-06-15', time: '25:00' })).toBeNull();
  });

  it('add accepte heure valide', () => {
    const ev = calendarStore.add(TEST_UID, { title: 'x', date: '2026-06-15', time: '14:30' });
    expect(ev?.time).toBe('14:30');
  });

  it('events triés par date+time', () => {
    calendarStore.add(TEST_UID, { title: 'B', date: '2026-06-20' });
    calendarStore.add(TEST_UID, { title: 'A', date: '2026-06-15' });
    calendarStore.add(TEST_UID, { title: 'C', date: '2026-06-15', time: '10:00' });
    const list = calendarStore.load(TEST_UID);
    expect(list[0]?.title).toBe('A');
    expect(list[1]?.title).toBe('C');
    expect(list[2]?.title).toBe('B');
  });

  it('remove supprime événement', () => {
    const ev = calendarStore.add(TEST_UID, { title: 'x', date: '2026-06-15' });
    if (!ev) throw new Error('add failed');
    expect(calendarStore.remove(TEST_UID, ev.id)).toBe(true);
    expect(calendarStore.load(TEST_UID)).toEqual([]);
  });

  it('byMonth filtre par YYYY-MM', () => {
    calendarStore.add(TEST_UID, { title: 'jan', date: '2026-01-15' });
    calendarStore.add(TEST_UID, { title: 'feb', date: '2026-02-20' });
    calendarStore.add(TEST_UID, { title: 'jan2', date: '2026-01-30' });
    expect(calendarStore.byMonth(TEST_UID, 2026, 1).length).toBe(2);
    expect(calendarStore.byMonth(TEST_UID, 2026, 2).length).toBe(1);
    expect(calendarStore.byMonth(TEST_UID, 2026, 13)).toEqual([]); /* invalid */
  });

  it('upcoming retourne events <= N jours', () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const future10 = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    const future40 = new Date(now.getTime() + 40 * 86400000).toISOString().slice(0, 10);
    calendarStore.add(TEST_UID, { title: 'today', date: todayStr });
    calendarStore.add(TEST_UID, { title: 'future10', date: future10 });
    calendarStore.add(TEST_UID, { title: 'future40', date: future40 });
    const upcoming7 = calendarStore.upcoming(TEST_UID, 7);
    expect(upcoming7.length).toBe(1);
    expect(upcoming7[0]?.title).toBe('today');
    const upcoming30 = calendarStore.upcoming(TEST_UID, 30);
    expect(upcoming30.length).toBe(2);
  });

  it('count total events', () => {
    expect(calendarStore.count(TEST_UID)).toBe(0);
    calendarStore.add(TEST_UID, { title: 'x', date: '2026-06-15' });
    expect(calendarStore.count(TEST_UID)).toBe(1);
  });

  it('per-user isolation', () => {
    calendarStore.add('uid_a', { title: 'A', date: '2026-06-15' });
    calendarStore.add('uid_b', { title: 'B', date: '2026-06-15' });
    expect(calendarStore.load('uid_a').length).toBe(1);
    expect(calendarStore.load('uid_b').length).toBe(1);
  });

  it('load gère storage corrompu', () => {
    localStorage.setItem('ax_calendar_bad', '{nope');
    expect(calendarStore.load('bad')).toEqual([]);
  });
});
