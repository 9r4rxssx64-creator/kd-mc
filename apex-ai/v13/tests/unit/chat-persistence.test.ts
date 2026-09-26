/**
 * Tests chat-persistence v13.4.172 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression :
 * - loadPersistedConversation lit localStorage + strip streaming flag + filtre vides
 * - persistConversation debounce 500ms localStorage + 30s Firebase
 * - tryFirebaseRestoreConversation push mutate in-place si conversation vide
 *
 * Cap CONV_MAX_PERSIST=200, fallback half si quota exceeded.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import {
  type PersistedMessage,
  _resetPersistenceTimeoutsForTests,
  loadPersistedConversation,
  persistConversation,
  tryFirebaseRestoreConversation,
} from '../../features/chat/chat-persistence.js';

const STORAGE_KEY = 'apex_v13_conversation_active';

function makeMsg(id: string, text: string, opts: Partial<PersistedMessage> = {}): PersistedMessage {
  return {
    id,
    role: 'user',
    text,
    ts: Date.now(),
    ...opts,
  };
}

describe('chat-persistence loadPersistedConversation (v13.4.172)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage vide → tableau vide', () => {
    expect(loadPersistedConversation()).toEqual([]);
  });

  it('JSON invalide → tableau vide (silent recovery)', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(loadPersistedConversation()).toEqual([]);
  });

  it('non-array sérialisé → tableau vide', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(loadPersistedConversation()).toEqual([]);
  });

  it('strip streaming:true → streaming:false au load', () => {
    const stored: PersistedMessage[] = [makeMsg('a1', 'hi', { streaming: true })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const loaded = loadPersistedConversation();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.streaming).toBe(false);
  });

  it('filtre messages text vide sauf tool_card', () => {
    const stored: PersistedMessage[] = [
      makeMsg('a1', 'hello'),
      makeMsg('a2', '', { role: 'tool_card' }),
      makeMsg('a3', ''),
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const loaded = loadPersistedConversation();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((m) => m.id)).toEqual(['a1', 'a2']);
  });
});

describe('chat-persistence persistConversation (v13.4.172)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    _resetPersistenceTimeoutsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetPersistenceTimeoutsForTests();
  });

  it('debounce 500ms avant écriture localStorage', () => {
    const conv: PersistedMessage[] = [makeMsg('a1', 'hi')];
    persistConversation(conv);
    /* Avant 500ms : pas encore écrit */
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(500);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as PersistedMessage[];
    expect(parsed).toHaveLength(1);
  });

  it('reset timer à chaque appel (debounce idempotent)', () => {
    const conv1: PersistedMessage[] = [makeMsg('a1', 'first')];
    persistConversation(conv1);
    vi.advanceTimersByTime(300);
    /* Re-appel avant échéance reset timer */
    const conv2: PersistedMessage[] = [makeMsg('a1', 'first'), makeMsg('a2', 'second')];
    persistConversation(conv2);
    vi.advanceTimersByTime(300);
    /* À 600ms total mais seulement 300ms depuis dernier appel → pas écrit */
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(200);
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedMessage[];
    expect(parsed).toHaveLength(2);
  });

  it('filtre messages streaming avant save', () => {
    const conv: PersistedMessage[] = [
      makeMsg('a1', 'done'),
      makeMsg('a2', 'partial', { streaming: true }),
    ];
    persistConversation(conv);
    vi.advanceTimersByTime(500);
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedMessage[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('a1');
  });

  it('cap CONV_MAX_PERSIST=200 (drop oldest)', () => {
    const conv: PersistedMessage[] = Array.from({ length: 250 }, (_, i) =>
      makeMsg(`a${i}`, `msg-${i}`),
    );
    persistConversation(conv);
    vi.advanceTimersByTime(500);
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedMessage[];
    expect(parsed).toHaveLength(200);
    /* derniers 200 (indices 50..249) */
    expect(parsed[0]?.id).toBe('a50');
    expect(parsed[199]?.id).toBe('a249');
  });

  it('fallback half cap si QuotaExceededError', () => {
    const conv: PersistedMessage[] = Array.from({ length: 250 }, (_, i) =>
      makeMsg(`a${i}`, `msg-${i}`),
    );
    const original = localStorage.setItem.bind(localStorage);
    let throwCount = 0;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === STORAGE_KEY && throwCount === 0) {
        throwCount++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      original(k, v);
    });
    try {
      persistConversation(conv);
      vi.advanceTimersByTime(500);
      expect(throwCount).toBe(1);
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedMessage[];
      /* Half cap = 100 */
      expect(parsed).toHaveLength(100);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('chat-persistence tryFirebaseRestoreConversation (v13.4.172)', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetPersistenceTimeoutsForTests();
    vi.restoreAllMocks();
  });

  it('conversation non vide → no-op (return early)', async () => {
    const conv: PersistedMessage[] = [makeMsg('a1', 'existing')];
    await tryFirebaseRestoreConversation(conv);
    expect(conv).toHaveLength(1);
    expect(conv[0]?.id).toBe('a1');
  });

  it('Firebase read non-array → conversation reste vide', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockResolvedValue(null),
      },
    }));
    const conv: PersistedMessage[] = [];
    await tryFirebaseRestoreConversation(conv);
    expect(conv).toHaveLength(0);
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('Firebase read array vide → conversation reste vide', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockResolvedValue([]),
      },
    }));
    const conv: PersistedMessage[] = [];
    await tryFirebaseRestoreConversation(conv);
    expect(conv).toHaveLength(0);
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('Firebase throw → silent recovery (no rethrow)', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockRejectedValue(new Error('network')),
      },
    }));
    const conv: PersistedMessage[] = [];
    await expect(tryFirebaseRestoreConversation(conv)).resolves.toBeUndefined();
    expect(conv).toHaveLength(0);
    vi.doUnmock('../../services/storage/firebase.js');
  });

  /* v13.4.205 — Firebase restore avec data valide push in-place */
  it('Firebase read array valide → push messages in-place', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockResolvedValue([
          { id: 'cloud_1', role: 'user', text: 'Hello cloud', ts: 1000 },
          { id: 'cloud_2', role: 'assistant', text: 'Response cloud', ts: 2000 },
        ]),
      },
    }));
    /* vi.resetModules pour que tryFirebase utilise le mock fraichement défini */
    vi.resetModules();
    const { tryFirebaseRestoreConversation: tryRestore } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = [];
    await tryRestore(conv);
    expect(conv).toHaveLength(2);
    expect(conv[0]?.id).toBe('cloud_1');
    expect(conv[1]?.text).toBe('Response cloud');
    /* streaming false par défaut au restore */
    expect(conv[0]?.streaming).toBe(false);
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('Firebase read messages sans id → génère id restored_<ts>_<random>', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockResolvedValue([
          { role: 'user', text: 'Sans id', ts: 5000 },
        ]),
      },
    }));
    vi.resetModules();
    const { tryFirebaseRestoreConversation: tryRestore } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = [];
    await tryRestore(conv);
    expect(conv).toHaveLength(1);
    expect(conv[0]?.id).toMatch(/^restored_5000_/);
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('Firebase read filtre messages text vide/non-string', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: {
        read: vi.fn().mockResolvedValue([
          { id: 'a', role: 'user', text: 'valid', ts: 1 },
          { id: 'b', role: 'user', text: '', ts: 2 }, /* vide → filtré */
          { id: 'c', role: 'user', ts: 3 }, /* text undefined → filtré */
          null, /* falsy → filtré */
        ]),
      },
    }));
    vi.resetModules();
    const { tryFirebaseRestoreConversation: tryRestore } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = [];
    await tryRestore(conv);
    expect(conv).toHaveLength(1);
    expect(conv[0]?.id).toBe('a');
    vi.doUnmock('../../services/storage/firebase.js');
  });
});

/* ========================================================================
 * v13.4.205 (Kevin "Continu sans t'arrêter") — Firebase sync 30s debounce
 * ====================================================================== */
describe('chat-persistence Firebase sync 30s debounce (v13.4.205)', () => {
  let firebaseWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    _resetPersistenceTimeoutsForTests();
    firebaseWriteMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../services/storage/firebase.js', () => ({
      firebase: { write: firebaseWriteMock, read: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetPersistenceTimeoutsForTests();
    vi.doUnmock('../../services/storage/firebase.js');
  });

  it('Firebase sync DECLENCHEE après 30s post-persist', async () => {
    vi.resetModules();
    const { persistConversation: persist } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = [makeMsg('m1', 'Hi cloud')];
    persist(conv);
    /* localStorage écrit à 500ms */
    await vi.advanceTimersByTimeAsync(500);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    /* Firebase NON encore écrit (debounce 30s) */
    expect(firebaseWriteMock).not.toHaveBeenCalled();
    /* Avance à 30s total */
    await vi.advanceTimersByTimeAsync(30_000);
    /* Firebase écrit */
    expect(firebaseWriteMock).toHaveBeenCalledTimes(1);
    const [path, payload] = firebaseWriteMock.mock.calls[0]!;
    expect(path).toBe('apex_v13_conversation_cloud');
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].text).toBe('Hi cloud');
    expect(payload[0].role).toBe('user');
    /* Cloud payload n'inclut PAS id ni streaming (légère) */
    expect(payload[0].id).toBeUndefined();
  });

  it('Firebase sync filtre messages streaming + texte > 8000 chars', async () => {
    vi.resetModules();
    const { persistConversation: persist } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = [
      makeMsg('m1', 'short'),
      makeMsg('m2', 'partial', { streaming: true }), /* skip stream */
      makeMsg('m3', 'x'.repeat(9000)), /* skip trop long */
      makeMsg('m4', 'also-short'),
    ];
    persist(conv);
    await vi.advanceTimersByTimeAsync(30_500);
    expect(firebaseWriteMock).toHaveBeenCalledTimes(1);
    const payload = firebaseWriteMock.mock.calls[0]?.[1] as Array<{ text: string }>;
    expect(payload).toHaveLength(2);
    expect(payload.map((p) => p.text)).toEqual(['short', 'also-short']);
  });

  it('Firebase sync cap FIREBASE_MAX_MESSAGES=30 (derniers)', async () => {
    vi.resetModules();
    const { persistConversation: persist } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = Array.from({ length: 50 }, (_, i) => makeMsg(`m${i}`, `t${i}`));
    persist(conv);
    await vi.advanceTimersByTimeAsync(30_500);
    expect(firebaseWriteMock).toHaveBeenCalledTimes(1);
    const payload = firebaseWriteMock.mock.calls[0]?.[1] as unknown[];
    expect(payload).toHaveLength(30);
  });

  it('Firebase write throw → silent recovery (logger.warn)', async () => {
    firebaseWriteMock.mockRejectedValueOnce(new Error('network'));
    vi.resetModules();
    const { persistConversation: persist } = await import('../../features/chat/chat-persistence.js');
    const conv: PersistedMessage[] = [makeMsg('m1', 'Hi')];
    persist(conv);
    await vi.advanceTimersByTimeAsync(30_500);
    expect(firebaseWriteMock).toHaveBeenCalled();
    /* Pas de throw qui sort */
  });
});

/* ========================================================================
 * v13.4.205 — attachments persistence path (IDB integration)
 * ====================================================================== */
describe('chat-persistence attachments → IDB sentinel (v13.4.205)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    _resetPersistenceTimeoutsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetPersistenceTimeoutsForTests();
  });

  it('attachments avec base64 → remplace par sentinel __IDB__ dans localStorage', () => {
    const conv: PersistedMessage[] = [
      makeMsg('att-1', 'See image', {
        attachments: [{ mime: 'image/png', base64: 'aGVsbG8=', name: 'photo.png' }],
      }),
    ];
    persistConversation(conv);
    vi.advanceTimersByTime(500);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedMessage[];
    expect(stored[0]?.attachments).toBeDefined();
    expect(stored[0]?.attachments?.[0]?.base64).toBe('__IDB__');
    expect(stored[0]?.attachments?.[0]?.mime).toBe('image/png');
    expect(stored[0]?.attachments?.[0]?.name).toBe('photo.png');
  });

  it('message sans attachments → pas modifié', () => {
    const conv: PersistedMessage[] = [makeMsg('plain', 'pas d\'image')];
    persistConversation(conv);
    vi.advanceTimersByTime(500);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistedMessage[];
    expect(stored[0]?.attachments).toBeUndefined();
  });
});

describe('chat-persistence clearConversationEverywhere (v13.4.284 — anti-résurrection)', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetPersistenceTimeoutsForTests();
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('../../services/storage/firebase.js');
    vi.doUnmock('../../services/ai/chat-attachments-store.js');
  });

  it('supprime la VRAIE clé localStorage (apex_v13_conversation_active)', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    const cleanupSpy = vi.fn().mockResolvedValue(0);
    vi.doMock('../../services/storage/firebase.js', () => ({ firebase: { write: writeSpy } }));
    vi.doMock('../../services/ai/chat-attachments-store.js', () => ({
      chatAttachmentsStore: { cleanupOrphans: cleanupSpy },
    }));
    const { clearConversationEverywhere: clearAll } = await import('../../features/chat/chat-persistence.js');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'm1', role: 'user', text: 'salut', ts: 1 }]));
    await clearAll();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('écrit [] dans le backup Firebase (empêche la résurrection au boot)', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../services/storage/firebase.js', () => ({ firebase: { write: writeSpy } }));
    vi.doMock('../../services/ai/chat-attachments-store.js', () => ({
      chatAttachmentsStore: { cleanupOrphans: vi.fn().mockResolvedValue(0) },
    }));
    const { clearConversationEverywhere: clearAll } = await import('../../features/chat/chat-persistence.js');
    await clearAll();
    expect(writeSpy).toHaveBeenCalledWith('apex_v13_conversation_cloud', []);
  });

  it('purge les pièces jointes IDB (cleanupOrphans avec keep-set vide)', async () => {
    const cleanupSpy = vi.fn().mockResolvedValue(3);
    vi.doMock('../../services/storage/firebase.js', () => ({ firebase: { write: vi.fn().mockResolvedValue(undefined) } }));
    vi.doMock('../../services/ai/chat-attachments-store.js', () => ({
      chatAttachmentsStore: { cleanupOrphans: cleanupSpy },
    }));
    const { clearConversationEverywhere: clearAll } = await import('../../features/chat/chat-persistence.js');
    await clearAll();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    const arg = cleanupSpy.mock.calls[0]?.[0] as Set<string>;
    expect(arg instanceof Set).toBe(true);
    expect(arg.size).toBe(0);
  });

  it('reste silencieux si Firebase échoue (best-effort, pas de throw)', async () => {
    vi.doMock('../../services/storage/firebase.js', () => ({ firebase: { write: vi.fn().mockRejectedValue(new Error('offline')) } }));
    vi.doMock('../../services/ai/chat-attachments-store.js', () => ({
      chatAttachmentsStore: { cleanupOrphans: vi.fn().mockResolvedValue(0) },
    }));
    const { clearConversationEverywhere: clearAll } = await import('../../features/chat/chat-persistence.js');
    await expect(clearAll()).resolves.toBeUndefined();
  });
});
