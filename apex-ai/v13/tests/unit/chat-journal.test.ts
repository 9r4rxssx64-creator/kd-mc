/**
 * Tests services/ai/chat-journal (v13.4.286) — journal permanent du chat.
 *
 * Couverture :
 * - append enregistre + masque les secrets (clé jamais en clair)
 * - append n'est PAS vidé par un clear de conversation (indépendant)
 * - search filtre
 * - cap FIFO
 * - clearAll vide local + cloud
 * - restoreFromCloud restaure si local vide
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatJournal, __chat_journal_test } from '../../services/ai/chat-journal.js';

const KEY = __chat_journal_test.STORAGE_KEY;

describe('chat-journal append + redaction', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('append enregistre une entrée texte simple', async () => {
    await chatJournal.append('Rappelle-moi mon rendez-vous demain', 'user');
    const all = chatJournal.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.text).toContain('rendez-vous');
    expect(all[0]?.source).toBe('user');
  });

  it('MASQUE une clé API — le secret n\'est jamais stocké en clair', async () => {
    const key = 'sk-ant-api03-' + 'A'.repeat(95);
    await chatJournal.append(`Voici ma clé ${key} à garder`, 'paste');
    const raw = localStorage.getItem(KEY) ?? '';
    expect(raw).not.toContain(key); /* clé absente du stockage */
    expect(raw).toContain('masquée');
    expect(chatJournal.list()[0]?.hadSecret).toBe(true);
  });

  it('append vide est ignoré', async () => {
    await chatJournal.append('   ', 'user');
    expect(chatJournal.count()).toBe(0);
  });

  it('search filtre case-insensitive', async () => {
    await chatJournal.append('Adresse appartement Nice', 'note');
    await chatJournal.append('Question sur le planning', 'user');
    expect(chatJournal.search('NICE')).toHaveLength(1);
    expect(chatJournal.search('')).toHaveLength(2);
  });

  it('cap FIFO respecté (drop le plus ancien)', async () => {
    const cap = __chat_journal_test.CAP;
    /* injecte cap+5 entrées directement pour rester rapide */
    const arr = Array.from({ length: cap + 5 }, (_, i) => ({
      id: `e${i}`, ts: i, source: 'user' as const, text: `msg ${i}`,
    }));
    localStorage.setItem(KEY, JSON.stringify(arr));
    await chatJournal.append('dernier', 'user');
    const all = chatJournal.list();
    expect(all.length).toBeLessThanOrEqual(cap);
    expect(all[all.length - 1]?.text).toBe('dernier');
    expect(all.find((e) => e.text === 'msg 0')).toBeUndefined(); /* le plus vieux droppé */
  });

  it('survit indépendamment d\'un clear de conversation (clés distinctes)', async () => {
    await chatJournal.append('je dépose ceci', 'user');
    /* simule clearConversationEverywhere qui touche conversation_active, PAS le journal */
    localStorage.removeItem('apex_v13_conversation_active');
    expect(chatJournal.count()).toBe(1);
  });

  it('clearAll vide local + écrit [] dans le cloud', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../services/storage/firebase.js', () => ({ firebase: { write: writeSpy, read: vi.fn() } }));
    await chatJournal.append('a effacer', 'user');
    await chatJournal.clearAll();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(writeSpy).toHaveBeenCalledWith(__chat_journal_test.FIREBASE_PATH, []);
  });

  it('restoreFromCloud restaure si local vide', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockResolvedValue([
          { id: 'c1', ts: 1, source: 'user', text: 'depuis le cloud' },
        ]),
        write: vi.fn().mockResolvedValue(undefined),
      },
    }));
    vi.resetModules();
    const { chatJournal: jr } = await import('../../services/ai/chat-journal.js');
    localStorage.clear();
    const n = await jr.restoreFromCloud();
    expect(n).toBe(1);
    expect(jr.list()[0]?.text).toBe('depuis le cloud');
  });

  it('restoreFromCloud ne fait rien si local déjà rempli', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: { read: vi.fn().mockResolvedValue([{ id: 'x', ts: 1, source: 'user', text: 'cloud' }]), write: vi.fn() },
    }));
    vi.resetModules();
    const { chatJournal: jr } = await import('../../services/ai/chat-journal.js');
    localStorage.setItem(KEY, JSON.stringify([{ id: 'local1', ts: 1, source: 'user', text: 'déjà là' }]));
    const n = await jr.restoreFromCloud();
    expect(n).toBe(0);
    expect(jr.list()[0]?.text).toBe('déjà là');
  });
});
