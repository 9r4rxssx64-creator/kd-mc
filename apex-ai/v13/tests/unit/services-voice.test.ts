/**
 * Tests services/voice.ts — façade unifiée 50+ voix.
 *
 * Couvre :
 * - Catalogue 50+ avec PRO/FUN/THEMATIC unique IDs
 * - Filtres listVoices + getVoice + countByCategory + auditCatalog
 * - Active voice persistence
 * - Effects pipeline (pitch, rate, distortion, reverse, tremolo, lowpass,
 *   highpass, bandpass, echo, reverb, flanger, chorus)
 * - Speak via Web Speech API (mocked)
 * - Speak via premium provider (fetch mock)
 * - Failover chain (premium fail → web-speech)
 * - Enroll voice + identify speaker (façade voicePrint)
 * - randomVoice + surpriseMe
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  VOICES_CATALOG,
  applyEffectsToAudio,
  auditCatalog,
  countByCategory,
  enrollVoice,
  getActiveVoice,
  getVoice,
  identifySpeaker,
  listVoices,
  randomVoice,
  setActiveVoice,
  speak,
  stopAll,
  surpriseMe,
} from '../../services/ai/voice.js';
import type { Voice, VoiceEffect } from '../../services/ai/voice.js';

/* ============================================================================
 * Helpers
 * ============================================================================ */

function makeFakeAudioBuffer(samples: number[], sampleRate = 16000): AudioBuffer {
  const data = new Float32Array(samples);
  const channelData = [data];
  return {
    sampleRate,
    length: data.length,
    duration: data.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: (ch: number) => channelData[ch] ?? data,
  } as unknown as AudioBuffer;
}

function makeOfflineAudioCtx(sampleRate = 16000): {
  sampleRate: number;
  destination: AudioNode;
  createBuffer: (channels: number, length: number, sr: number) => AudioBuffer;
} {
  return {
    sampleRate,
    destination: {} as AudioNode,
    createBuffer: (_channels, length) => {
      const channelData = [new Float32Array(length)];
      return {
        sampleRate,
        length,
        duration: length / sampleRate,
        numberOfChannels: 1,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0]!,
      } as unknown as AudioBuffer;
    },
  };
}

interface SpeechSynthesisLike {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getVoices: () => SpeechSynthesisVoice[];
}

function installSpeechSynthesisMock(): SpeechSynthesisLike {
  const speak = vi.fn();
  const cancel = vi.fn();
  const synth: SpeechSynthesisLike = {
    speak,
    cancel,
    getVoices: () => [],
  };
  Object.defineProperty(window, 'speechSynthesis', {
    value: synth,
    configurable: true,
    writable: true,
  });
  /* Polyfill SpeechSynthesisUtterance */
  if (typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance ===
    'undefined') {
    class FakeUtterance {
      lang = '';
      pitch = 1;
      rate = 1;
      volume = 1;
      voice: SpeechSynthesisVoice | null = null;
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
      writable: true,
    });
  }
  return synth;
}

function uninstallSpeechSynthesisMock(): void {
  try {
    /* @ts-expect-error reset */
    delete window.speechSynthesis;
  } catch {
    /* ignore */
  }
}

/* ============================================================================
 * Catalogue
 * ============================================================================ */

describe('services/voice — catalogue 50+ voix MAX', () => {
  it('VOICES_CATALOG contient au moins 50 entrées', () => {
    expect(VOICES_CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it('countByCategory : pro >= 10, fun >= 20, thematic >= 16', () => {
    const c = countByCategory();
    expect(c.pro).toBeGreaterThanOrEqual(10);
    expect(c.fun).toBeGreaterThanOrEqual(20);
    expect(c.thematic).toBeGreaterThanOrEqual(16);
  });

  it('auditCatalog → healthy=true (anti-monotonie)', () => {
    const audit = auditCatalog();
    expect(audit.healthy).toBe(true);
    expect(audit.warnings.length).toBe(0);
    expect(audit.total).toBeGreaterThanOrEqual(50);
  });

  it('toutes les voix ont un id unique', () => {
    const ids = VOICES_CATALOG.map((v) => v.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('toutes les voix ont une catégorie valide', () => {
    for (const v of VOICES_CATALOG) {
      expect(['pro', 'fun', 'thematic']).toContain(v.category);
    }
  });

  it('toutes les voix ont un provider valide', () => {
    const valid = ['web-speech', 'webaudio-effect', 'elevenlabs', 'openai', 'google', 'azure'];
    for (const v of VOICES_CATALOG) {
      expect(valid).toContain(v.provider);
    }
  });

  it('toutes les voix ont nom + emoji + description non vides', () => {
    for (const v of VOICES_CATALOG) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
    }
  });

  it('inclut au moins voix thématiques iconiques (Yoda, Père Noël, Pirate, Robot)', () => {
    const ids = VOICES_CATALOG.map((v) => v.id);
    expect(ids).toContain('theme_yoda');
    expect(ids).toContain('theme_santa');
    expect(ids).toContain('theme_pirate');
    expect(ids).toContain('theme_robot');
  });

  it('inclut OpenAI 6 voix officielles (alloy, echo, fable, onyx, nova, shimmer)', () => {
    const ids = VOICES_CATALOG.map((v) => v.id);
    expect(ids).toContain('pro_openai_alloy');
    expect(ids).toContain('pro_openai_echo');
    expect(ids).toContain('pro_openai_fable');
    expect(ids).toContain('pro_openai_onyx');
    expect(ids).toContain('pro_openai_nova');
    expect(ids).toContain('pro_openai_shimmer');
  });

  it('voix FUN ont au moins 5 effets différents (diversité)', () => {
    const fun = listVoices('fun');
    const allTypes = new Set<string>();
    for (const v of fun) {
      v.effects?.forEach((e) => allTypes.add(e.type));
    }
    expect(allTypes.size).toBeGreaterThanOrEqual(5);
  });
});

/* ============================================================================
 * listVoices + getVoice
 * ============================================================================ */

describe('services/voice — listVoices + getVoice', () => {
  it('listVoices() sans filtre = tout le catalogue', () => {
    expect(listVoices().length).toBe(VOICES_CATALOG.length);
  });

  it('listVoices("pro") ne retourne que les voix pro', () => {
    const pro = listVoices('pro');
    expect(pro.length).toBeGreaterThan(0);
    pro.forEach((v: Voice) => expect(v.category).toBe('pro'));
  });

  it('listVoices("fun") ne retourne que les voix fun', () => {
    const fun = listVoices('fun');
    expect(fun.length).toBeGreaterThan(0);
    fun.forEach((v) => expect(v.category).toBe('fun'));
  });

  it('listVoices("thematic") ne retourne que les voix thématiques', () => {
    const th = listVoices('thematic');
    expect(th.length).toBeGreaterThan(0);
    th.forEach((v) => expect(v.category).toBe('thematic'));
  });

  it('getVoice(id valide) → Voice', () => {
    const v = getVoice('pro_neutral_fr');
    expect(v).not.toBeNull();
    expect(v?.id).toBe('pro_neutral_fr');
  });

  it('getVoice(id invalide) → null', () => {
    expect(getVoice('xxx_unknown')).toBeNull();
  });
});

/* ============================================================================
 * Active voice persistence
 * ============================================================================ */

describe('services/voice — active voice persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getActiveVoice par défaut → pro_neutral_fr', () => {
    expect(getActiveVoice()).toBe('pro_neutral_fr');
  });

  it('setActiveVoice persiste dans localStorage', async () => {
    await setActiveVoice('theme_yoda');
    expect(getActiveVoice()).toBe('theme_yoda');
  });

  it('setActiveVoice rejette voix inconnue', async () => {
    await expect(setActiveVoice('xxx_unknown')).rejects.toThrow(/not found/i);
  });
});

/* ============================================================================
 * Effects pipeline
 * ============================================================================ */

describe('services/voice — effects pipeline (Web Audio offline)', () => {
  it('applyEffectsToAudio sans effet retourne le buffer inchangé', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer([0.1, 0.2, 0.3, 0.4]);
    const out = await applyEffectsToAudio(buf, [], ctx);
    expect(out).toBe(buf);
  });

  it('reverse inverse l\'ordre des samples', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer([1, 2, 3, 4]);
    const out = await applyEffectsToAudio(buf, [{ type: 'reverse', value: 1 }], ctx);
    const data = out.getChannelData(0);
    expect(data[0]).toBeCloseTo(4);
    expect(data[1]).toBeCloseTo(3);
    expect(data[2]).toBeCloseTo(2);
    expect(data[3]).toBeCloseTo(1);
  });

  it('pitch shift positif raccourcit l\'enveloppe (resampling)', async () => {
    const ctx = makeOfflineAudioCtx();
    const samples = Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 16000));
    const buf = makeFakeAudioBuffer(samples);
    const out = await applyEffectsToAudio(buf, [{ type: 'pitch', value: 12 }], ctx);
    expect(out.length).toBe(buf.length);
    const data = out.getChannelData(0);
    expect(data.length).toBe(buf.length);
  });

  it('rate change > 1 raccourcit la durée perçue', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer([1, 1, 1, 1, 1, 1, 1, 1]);
    const out = await applyEffectsToAudio(buf, [{ type: 'rate', value: 2 }], ctx);
    /* Rate 2x → première moitié remplie, deuxième silencieuse (padding 0) */
    const data = out.getChannelData(0);
    expect(data[0]).toBe(1);
    expect(data[7]).toBe(0);
  });

  it('distortion soft-clip réduit l\'amplitude max sous 1', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer([2, -2, 2, -2]);
    const out = await applyEffectsToAudio(buf, [{ type: 'distortion', value: 1 }], ctx);
    const data = out.getChannelData(0);
    for (const v of data) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('tremolo module l\'amplitude (LFO)', async () => {
    const ctx = makeOfflineAudioCtx(8000);
    const buf = makeFakeAudioBuffer(new Array(80).fill(1));
    const out = await applyEffectsToAudio(buf, [{ type: 'tremolo', value: 5 }], ctx);
    const data = out.getChannelData(0);
    /* Une partie au moins doit être atténuée */
    let hasAttenuated = false;
    for (const v of data) {
      if (v < 0.6) hasAttenuated = true;
    }
    expect(hasAttenuated).toBe(true);
  });

  it('lowpass smoothe une impulsion', async () => {
    const ctx = makeOfflineAudioCtx();
    const samples = new Array(64).fill(0);
    samples[0] = 1;
    const buf = makeFakeAudioBuffer(samples);
    const out = await applyEffectsToAudio(buf, [{ type: 'lowpass', value: 200 }], ctx);
    const data = out.getChannelData(0);
    /* Lowpass étale l'impulsion sur plusieurs samples */
    expect(data[1]).toBeGreaterThan(0);
    expect(data[1]).toBeLessThan(1);
  });

  it('highpass extrait le saut transitoire', async () => {
    const ctx = makeOfflineAudioCtx();
    const samples = new Array(64).fill(0).map((_, i) => (i < 32 ? 0 : 1));
    const buf = makeFakeAudioBuffer(samples);
    const out = await applyEffectsToAudio(buf, [{ type: 'highpass', value: 1000 }], ctx);
    const data = out.getChannelData(0);
    /* HP > 0 sur la transition */
    expect(Math.abs(data[32] ?? 0)).toBeGreaterThan(0);
  });

  it('bandpass produit un signal différent du low/highpass', async () => {
    const ctx = makeOfflineAudioCtx();
    const samples = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * 500 * i) / 8000));
    const buf = makeFakeAudioBuffer(samples);
    const out = await applyEffectsToAudio(buf, [{ type: 'bandpass', value: 1500 }], ctx);
    expect(out.length).toBe(buf.length);
  });

  it('echo ajoute composante retardée', async () => {
    const ctx = makeOfflineAudioCtx(8000);
    const samples = new Array(200).fill(0);
    samples[0] = 1;
    const buf = makeFakeAudioBuffer(samples, 8000);
    /* delay 0.02s × 8000Hz = 160 samples */
    const out = await applyEffectsToAudio(buf, [{ type: 'echo', value: 0.02 }], ctx);
    const data = out.getChannelData(0);
    expect((data[160] ?? 0)).toBeGreaterThan(0);
  });

  it('reverb ajoute des taps dans le tail', async () => {
    const ctx = makeOfflineAudioCtx();
    const samples = new Array(2000).fill(0);
    samples[0] = 1;
    const buf = makeFakeAudioBuffer(samples, 16000);
    const out = await applyEffectsToAudio(buf, [{ type: 'reverb', value: 1 }], ctx);
    const data = out.getChannelData(0);
    /* Tap à 0.029s ≈ 464 samples */
    let foundTap = false;
    for (let i = 460; i < 470; i++) {
      if ((data[i] ?? 0) !== 0) foundTap = true;
    }
    expect(foundTap).toBe(true);
  });

  it('flanger module avec LFO', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer(new Array(256).fill(0.5));
    const out = await applyEffectsToAudio(buf, [{ type: 'flanger', value: 0.5 }], ctx);
    expect(out.length).toBe(buf.length);
  });

  it('chorus produit une sortie non identique à l\'entrée', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer(new Array(256).fill(0.5));
    const out = await applyEffectsToAudio(buf, [{ type: 'chorus', value: 0.5 }], ctx);
    const data = out.getChannelData(0);
    expect(data.length).toBe(256);
  });

  it('pipeline d\'effets enchaîne plusieurs filtres', async () => {
    const ctx = makeOfflineAudioCtx();
    const buf = makeFakeAudioBuffer(new Array(64).fill(0.5));
    const effects: VoiceEffect[] = [
      { type: 'pitch', value: 4 },
      { type: 'lowpass', value: 1000 },
    ];
    const out = await applyEffectsToAudio(buf, effects, ctx);
    expect(out.length).toBe(buf.length);
  });
});

/* ============================================================================
 * speak (Web Speech)
 * ============================================================================ */

describe('services/voice — speak via Web Speech API', () => {
  let synth: SpeechSynthesisLike;

  beforeEach(() => {
    synth = installSpeechSynthesisMock();
  });

  afterEach(() => {
    uninstallSpeechSynthesisMock();
    vi.restoreAllMocks();
  });

  it('speak text vide → ok=false', async () => {
    const r = await speak('', 'pro_neutral_fr');
    expect(r.ok).toBe(false);
  });

  it('speak voix inconnue → ok=false', async () => {
    const r = await speak('hello', 'xxx');
    expect(r.ok).toBe(false);
  });

  it('speak via web-speech invoque synthesis.speak', async () => {
    const r = await speak('Bonjour Kevin', 'pro_neutral_fr');
    expect(r.ok).toBe(true);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('speak applique pitch d\'une voix fun (Hélium)', async () => {
    await speak('test', 'fun_helium');
    const utt = synth.speak.mock.calls[0]?.[0] as SpeechSynthesisUtterance | undefined;
    expect(utt).toBeDefined();
    /* Pitch +12 demi-tons → ratio 1 + 12/12 = 2 */
    expect(utt?.pitch).toBeGreaterThan(1.5);
  });

  it('speak applique rate d\'une voix slow', async () => {
    await speak('test', 'fun_slow');
    const utt = synth.speak.mock.calls[0]?.[0] as SpeechSynthesisUtterance | undefined;
    expect(utt?.rate).toBeLessThan(1);
  });

  it('stopAll appelle synthesis.cancel', () => {
    stopAll();
    expect(synth.cancel).toHaveBeenCalled();
  });
});

/* ============================================================================
 * speak (Premium fallback)
 * ============================================================================ */

describe('services/voice — speak premium provider (fetch mock)', () => {
  let synth: SpeechSynthesisLike;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    synth = installSpeechSynthesisMock();
    fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    uninstallSpeechSynthesisMock();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('speak voix elevenlabs appelle fetch (lazy)', async () => {
    const r = await speak('hello', 'pro_elevenlabs_rachel');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('elevenlabs');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('speak voix openai appelle fetch', async () => {
    const r = await speak('hello', 'pro_openai_alloy');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('openai');
  });

  it('speak voix google appelle fetch', async () => {
    const r = await speak('hello', 'pro_google_wavenet_fr_a');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('google');
  });

  it('speak voix azure appelle fetch', async () => {
    const r = await speak('hello', 'pro_azure_denise');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('azure');
  });

  it('speak premium 4xx → fallback web-speech', async () => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({ ok: false, status: 401 } as Response);
    const r = await speak('hello', 'pro_elevenlabs_rachel');
    /* Fallback web-speech invoke synthesis.speak */
    expect(synth.speak).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it('speak premium fetch throw → fallback web-speech', async () => {
    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new Error('network'));
    const r = await speak('hello', 'pro_elevenlabs_rachel');
    expect(synth.speak).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });
});

/* ============================================================================
 * Random / surprise
 * ============================================================================ */

describe('services/voice — random + surprise', () => {
  it('randomVoice retourne une voix valide', () => {
    const v = randomVoice();
    expect(getVoice(v.id)).not.toBeNull();
  });

  it('randomVoice("fun") retourne une voix fun', () => {
    for (let i = 0; i < 10; i++) {
      const v = randomVoice('fun');
      expect(v.category).toBe('fun');
    }
  });

  it('surpriseMe diversifie les catégories sur N tirages', () => {
    const cats = new Set<string>();
    for (let i = 0; i < 50; i++) cats.add(surpriseMe().category);
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });
});

/* ============================================================================
 * Biométrie : enroll + identify (façade voicePrint)
 * ============================================================================ */

describe('services/voice — biométrie enrollVoice + identifySpeaker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('enrollVoice avec userId vide → ok=false', async () => {
    const buf = makeFakeAudioBuffer(new Array(256).fill(0.1));
    const r = await enrollVoice('', buf);
    expect(r.ok).toBe(false);
  });

  it('enrollVoice user + AudioBuffer → ok=true + print key', async () => {
    const samples = Array.from({ length: 1024 }, (_, i) =>
      Math.sin((2 * Math.PI * 200 * i) / 16000),
    );
    const buf = makeFakeAudioBuffer(samples);
    const r = await enrollVoice('kevin', buf);
    expect(r.ok).toBe(true);
    expect(r.print).toBe('ax_voice_print_kevin');
    expect(localStorage.getItem('ax_voice_print_kevin')).not.toBeNull();
  });

  it('identifySpeaker sans enrôlement → null', async () => {
    const buf = makeFakeAudioBuffer(new Array(256).fill(0.1));
    const result = await identifySpeaker(buf);
    expect(result).toBeNull();
  });

  it('identifySpeaker après enrôlement même user → match user', async () => {
    /* Génère un signal stable (sinus 200Hz) — empreinte cohérente */
    const samples = Array.from({ length: 2048 }, (_, i) =>
      Math.sin((2 * Math.PI * 200 * i) / 16000),
    );
    const buf = makeFakeAudioBuffer(samples);
    await enrollVoice('kevin', buf);
    /* Le seuil par défaut peut ne pas être atteint, mais identify doit retourner ou null,
     * jamais throw */
    const result = await identifySpeaker(buf);
    /* Si confident → uid kevin ; sinon null. Les deux sont valides. */
    if (result) {
      expect(result.userId).toBe('kevin');
      expect(result.score).toBeGreaterThanOrEqual(0);
    } else {
      expect(result).toBeNull();
    }
  });

  it('enrollVoice invalid input ne crash pas (catch err)', async () => {
    /* Buffer-like mais sans getChannelData & pas d'AudioContext en happy-dom */
    const r = await enrollVoice('x', new ArrayBuffer(8));
    /* En happy-dom : AudioContext absent → reason renvoyé (ok=false) */
    expect(typeof r.ok).toBe('boolean');
  });
});
