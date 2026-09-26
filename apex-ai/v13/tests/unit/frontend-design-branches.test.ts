/**
 * frontend-design — couverture branches complète (campagne 100% réel, 2026-06-02).
 * Mock aiRouter configurable + auditLog. Couvre generate (succès/erreur/parse), history,
 * buildSystemPrompt (defaults), sanitize, fallbackSkeleton, persistOutput.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ChunkCb = (c: { text?: string }) => void;
type ErrCb = (e: Error) => void;
let streamImpl: (onChunk: ChunkCb, onError: ErrCb) => Promise<void> | void;

vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: (_m: unknown, _s: unknown, onChunk: ChunkCb, onError: ErrCb) => streamImpl(onChunk, onError),
  },
}));
vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn() },
}));

import { frontendDesign } from '../../services/core-svc/frontend-design.js';

const HISTORY_KEY = 'apex_v13_frontend_designs_history';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  streamImpl = (onChunk) => { onChunk({ text: '{"html":"<b>x</b>","css":".a{}","js":"var a=1"}' }); };
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('frontend-design — generate succès & sanitize', () => {
  it('JSON valide → output sanitizé + persisté', async () => {
    streamImpl = (onChunk) => {
      onChunk({ text: '{"html":"<p>ok</p><script>bad()</script>","css":"a{color:#007bff}","js":"eval(1);document.write(2)"}' });
    };
    const out = await frontendDesign.generate({ prompt: 'carte profil' });
    expect(out.html).not.toContain('<script>');
    expect(out.css).toContain('#c9a227'); // anti-slop bootstrap blue → brand
    expect(out.js).toContain('eval blocked');
    expect(out.js).toContain('doc.write blocked');
    expect(out.framework).toBe('vanilla');
    expect(frontendDesign.history().length).toBe(1);
  });

  it('champs html/css/js absents → défauts vides (??)', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"html":"<i>only</i>"}' }); }; // pas de css/js
    const out = await frontendDesign.generate({ prompt: 'x', framework: 'react' });
    expect(out.css).toBe('');
    expect(out.js).toBe('');
    expect(out.framework).toBe('react');
  });

  it('parsed.html null → défaut vide (?? sur html)', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"html":null,"css":"a{}","js":"b"}' }); };
    const out = await frontendDesign.generate({ prompt: 'x' });
    expect(out.html).toBe('');
  });

  it('chunk sans text → ignoré (branche chunk.text falsy)', async () => {
    streamImpl = (onChunk) => {
      onChunk({}); // pas de text
      onChunk({ text: '{"html":"<x/>","css":"","js":""}' });
    };
    const out = await frontendDesign.generate({ prompt: 'x' });
    expect(out.html).toContain('<x');
  });
});

describe('frontend-design — generate erreurs → fallback', () => {
  it('onError appelé → lastErr → fallbackSkeleton', async () => {
    streamImpl = (_onChunk, onError) => { onError(new Error('provider down')); };
    const out = await frontendDesign.generate({ prompt: 'a<b>"\'' });
    expect(out.html).toContain('ax-fallback');
    expect(out.html).toContain('&lt;b&gt;'); // safePrompt échappe les caractères
  });

  it('stream throw → catch → fallback', async () => {
    streamImpl = () => { throw new Error('boom'); };
    const out = await frontendDesign.generate({ prompt: 'z' });
    expect(out.html).toContain('ax-fallback');
  });

  it('stream throw non-Error (string) → String(err) → fallback', async () => {
    // eslint-disable-next-line no-throw-literal -- test INTENTIONNEL : couvre la branche String(err) (throw non-Error)
    streamImpl = () => { throw 'str-boom'; };
    const out = await frontendDesign.generate({ prompt: 'z' });
    expect(out.html).toContain('ax-fallback');
  });

  it('collectedText vide (aucun chunk) → fallback', async () => {
    streamImpl = () => { /* rien émis */ };
    const out = await frontendDesign.generate({ prompt: 'vide' });
    expect(out.html).toContain('ax-fallback');
  });

  it('JSON absent du texte → match null → fallback', async () => {
    streamImpl = (onChunk) => { onChunk({ text: 'pas de json ici du tout' }); };
    const out = await frontendDesign.generate({ prompt: 'x' });
    expect(out.html).toContain('ax-fallback');
  });

  it('JSON présent mais invalide → parse throw → fallback', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"html": broken json}' }); };
    const out = await frontendDesign.generate({ prompt: 'x' });
    expect(out.html).toContain('ax-fallback');
  });
});

describe('frontend-design — history', () => {
  it('vide par défaut → []', () => {
    expect(frontendDesign.history()).toEqual([]);
  });

  it('JSON corrompu → catch → []', () => {
    localStorage.setItem(HISTORY_KEY, '{bad json');
    expect(frontendDesign.history()).toEqual([]);
  });

  it('stocké non-array → []', () => {
    localStorage.setItem(HISTORY_KEY, '{"not":"array"}');
    expect(frontendDesign.history()).toEqual([]);
  });
});

describe('frontend-design — buildSystemPrompt & buildPreviewSrcdoc', () => {
  it('defaults (sans brand/target) → couleurs brand par défaut + mobile', () => {
    const p = frontendDesign.buildSystemPrompt('vanilla', { prompt: 'x' });
    expect(p).toContain('#c9a227');
    expect(p).toContain('mobile');
    expect(p).toContain('vanilla');
  });

  it('brandColors + target desktop + react → valeurs respectées', () => {
    const p = frontendDesign.buildSystemPrompt('react', {
      prompt: 'x',
      brandColors: { primary: '#111', secondary: '#222', bg: '#333' },
      targetWidth: 'desktop',
    });
    expect(p).toContain('#111');
    expect(p).toContain('desktop');
    expect(p).toContain('JSX');
  });

  it('srcdoc vanilla → pas de runtime React', () => {
    const out = { html: '<x/>', css: '', js: '', framework: 'vanilla' as const, generatedAt: 0, durationMs: 0, rawText: '' };
    const doc = frontendDesign.buildPreviewSrcdoc(out);
    expect(doc).toContain('text/javascript');
    expect(doc).not.toContain('react.production');
  });

  it('srcdoc react → runtime React + babel', () => {
    const out = { html: '<x/>', css: '', js: '', framework: 'react' as const, generatedAt: 0, durationMs: 0, rawText: '' };
    const doc = frontendDesign.buildPreviewSrcdoc(out);
    expect(doc).toContain('react.production');
    expect(doc).toContain('text/babel');
  });
});

describe('frontend-design — applyAntiSlop & persist', () => {
  it('applyAntiSlop remplace Inter/Roboto/bootstrap', () => {
    const css = frontendDesign.applyAntiSlop("font-family: Inter; font-family: Roboto; color: #007bff; background: #28a745");
    expect(css).toContain('Georgia');
    expect(css).toContain('#c9a227');
    expect(css).not.toContain('Inter');
  });

  it('persist : historique JSON non-array → repart de [] (branche Array.isArray)', async () => {
    localStorage.setItem(HISTORY_KEY, '{"x":1}'); // JSON valide mais pas un tableau
    const out = await frontendDesign.generate({ prompt: 'persist-test' });
    expect(out.html).toBeTruthy();
    expect(frontendDesign.history().length).toBe(1); // reparti propre
  });

  it('persist : setItem throw → catch (pas de crash)', async () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const out = await frontendDesign.generate({ prompt: 'x' });
    expect(out.html).toBeTruthy(); // generate réussit malgré persist KO
    spy.mockRestore();
  });
});
