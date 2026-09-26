/**
 * Tests wake-word text trigger (Kevin 2026-05-08 18:00 — "dis apex" tapé en
 * texte doit activer le wake voice mode au lieu de générer une réponse IA
 * verbeuse "Plan A/B/C").
 *
 * Couvre :
 * - "dis apex" / "ok apex" / "hey apex" / "dit apex" / "hello apex" → trigger
 * - "Dis APEX où est mon dossier" (vraie question) → PAS trigger
 * - "" → no-op
 * - Patterns sont détectés case-insensitive et trim
 * - handleWakeWordTextTrigger n'envoie pas de message à l'IA
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Mock wake-word service avant l'import du chat (lazy import dans handler).
 * Vitest hoist vi.mock — on utilise vi.hoisted() pour partager les mocks. */
const mocks = vi.hoisted(() => ({
  startMock: vi.fn().mockResolvedValue({ started: true }),
  toastSuccess: vi.fn(),
  toastWarn: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  hapticTap: vi.fn(),
}));

vi.mock('../../services/ai/wake-word.js', () => ({
  wakeWord: {
    start: mocks.startMock,
    stop: vi.fn(),
    isListening: () => false,
    getStatus: () => ({ listening: false, lastDetected: null, totalDetections: 0, keyword: 'dis apex', sensitivity: 0.7 }),
  },
}));

vi.mock('../../ui/toast.js', () => ({
  toast: {
    success: mocks.toastSuccess,
    warn: mocks.toastWarn,
    info: mocks.toastInfo,
    error: mocks.toastError,
  },
}));

vi.mock('../../ui/haptic.js', () => ({
  haptic: {
    tap: mocks.hapticTap,
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import { handleWakeWordTextTrigger } from '../../features/chat/index.js';

describe('Wake word text trigger (Kevin 2026-05-08 anti-verbose)', () => {
  let rootEl: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    mocks.startMock.mockClear();
    mocks.startMock.mockResolvedValue({ started: true });
    mocks.toastSuccess.mockClear();
    mocks.toastWarn.mockClear();
    rootEl = document.createElement('div');
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('"dis apex" exact → activates wake word + returns true', async () => {
    const r = handleWakeWordTextTrigger(rootEl, 'dis apex');
    expect(r).toBe(true);
    /* Async lazy import — attendre microtasks */
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => setTimeout(res, 0));
    expect(mocks.startMock).toHaveBeenCalledTimes(1);
  });

  it('"ok apex" → trigger', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'ok apex')).toBe(true);
  });

  it('"hey apex" → trigger', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'hey apex')).toBe(true);
  });

  it('"hello apex" → trigger', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'hello apex')).toBe(true);
  });

  it('"dit apex" (variant phonétique) → trigger', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'dit apex')).toBe(true);
  });

  it('case-insensitive : "DIS APEX" / "Dis Apex" → trigger', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'DIS APEX')).toBe(true);
    expect(handleWakeWordTextTrigger(rootEl, 'Dis Apex')).toBe(true);
  });

  it('whitespace tolerant : "  dis apex  " → trigger', () => {
    expect(handleWakeWordTextTrigger(rootEl, '  dis apex  ')).toBe(true);
  });

  it('vraie question "dis apex où est mon dossier" → PAS trigger (false)', () => {
    /* C'est une vraie question, pas une commande. Le flow normal IA doit prendre. */
    expect(handleWakeWordTextTrigger(rootEl, 'dis apex où est mon dossier')).toBe(false);
    expect(mocks.startMock).not.toHaveBeenCalled();
  });

  it('"dis apex,  comment ça va" → PAS trigger (a du contenu après)', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'dis apex, comment ça va')).toBe(false);
  });

  it('texte vide / whitespace → false (no-op)', () => {
    expect(handleWakeWordTextTrigger(rootEl, '')).toBe(false);
    expect(handleWakeWordTextTrigger(rootEl, '   ')).toBe(false);
    expect(mocks.startMock).not.toHaveBeenCalled();
  });

  it('texte arbitraire "bonjour" → PAS trigger (false)', () => {
    expect(handleWakeWordTextTrigger(rootEl, 'bonjour')).toBe(false);
    expect(handleWakeWordTextTrigger(rootEl, "qu'est-ce que tu sais faire ?")).toBe(false);
  });

  it('toast success affiché si wakeWord.start() OK', async () => {
    handleWakeWordTextTrigger(rootEl, 'dis apex');
    /* Lazy dynamic import → microtask + promise chain */
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => setTimeout(res, 0));
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('toast warn si wakeWord.start() retourne started=false', async () => {
    mocks.startMock.mockResolvedValueOnce({ started: false, reason: 'mic denied' });
    handleWakeWordTextTrigger(rootEl, 'dis apex');
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => setTimeout(res, 0));
    expect(mocks.toastWarn).toHaveBeenCalled();
  });
});
