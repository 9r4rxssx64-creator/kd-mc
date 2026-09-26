/**
 * impeccable-design — couverture branches complète (campagne 100% réel, 2026-06-02).
 * Mock aiRouter configurable + auditLog. Couvre applyCommand (validation/stream/parse/
 * fallback), history, sanitizeChange, persist.
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
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: { record: vi.fn() } }));

import { impeccableDesign } from '../../services/core-svc/impeccable-design.js';

const HISTORY_KEY = 'apex_v13_impeccable_history';
const DESIGN = '<div class="card">Hello</div>';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  streamImpl = (onChunk) => {
    onChunk({ text: '{"revisedDesign":"<div class=\\"card pop\\">Hi</div>","changes":[{"type":"color","before":"#fff","after":"#c9a227"}]}' });
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe('impeccable-design — validation', () => {
  it('commande inconnue → throw', async () => {
    await expect(impeccableDesign.applyCommand('inconnue', DESIGN)).rejects.toThrow(/Commande inconnue/);
  });

  it('commande vide → throw', async () => {
    await expect(impeccableDesign.applyCommand('', DESIGN)).rejects.toThrow(/Commande inconnue/);
  });

  it('design vide → throw Design vide', async () => {
    await expect(impeccableDesign.applyCommand('make-it-pop', '   ')).rejects.toThrow(/Design vide/);
  });

  it('design falsy ("") → throw Design vide (branche || \'\')', async () => {
    await expect(impeccableDesign.applyCommand('make-it-pop', '')).rejects.toThrow(/Design vide/);
  });
});

describe('impeccable-design — applyCommand succès & parse', () => {
  it('JSON valide → revisedDesign + changes sanitizés + persist', async () => {
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.revisedDesign).toContain('pop');
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].type).toBe('color');
    expect(r.command).toBe('make-it-pop');
    expect(r.inputSize).toBe(DESIGN.length);
    expect(impeccableDesign.history()).toHaveLength(1);
  });

  it('changes > 8 → tronqué à 8', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `{"type":"t${i}","before":"a","after":"b"}`).join(',');
    streamImpl = (onChunk) => { onChunk({ text: `{"revisedDesign":"<x/>","changes":[${many}]}` }); };
    const r = await impeccableDesign.applyCommand('tighten-spacing', DESIGN);
    expect(r.changes).toHaveLength(8);
  });

  it('revisedDesign non-string → fallback sur design original', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"revisedDesign":123,"changes":[]}' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.revisedDesign).toBe(DESIGN);
  });

  it('changes non-array → []', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"revisedDesign":"<x/>","changes":"pas-un-array"}' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes).toEqual([]);
  });

  it('chunk sans text → ignoré', async () => {
    streamImpl = (onChunk) => { onChunk({}); onChunk({ text: '{"revisedDesign":"<y/>","changes":[]}' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.revisedDesign).toContain('<y');
  });
});

describe('impeccable-design — fallback', () => {
  it('stream onError → log warn (puis parse échoue → fallback)', async () => {
    streamImpl = (_onChunk, onError) => { onError(new Error('provider err')); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0].type).toBe('fallback');
    expect(r.revisedDesign).toBe(DESIGN);
  });

  it('stream throw → catch → fallback', async () => {
    streamImpl = () => { throw new Error('boom'); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0].type).toBe('fallback');
  });

  it('JSON absent → match null → fallback', async () => {
    streamImpl = (onChunk) => { onChunk({ text: 'aucun json' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0].type).toBe('fallback');
  });

  it('JSON invalide → parse throw → fallback', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"revisedDesign": cassé}' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0].type).toBe('fallback');
  });

  it('revisedDesign vide ("") → throw interne → fallback', async () => {
    // obj.revisedDesign === '' → typeof string → parsed.revisedDesign='' → if(!'') throw → fallback
    streamImpl = (onChunk) => { onChunk({ text: '{"revisedDesign":"","changes":[]}' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0].type).toBe('fallback');
  });
});

describe('impeccable-design — sanitizeChange (via changes hétérogènes)', () => {
  it('champs manquants/non-string → défauts (type=change, before/after vides)', async () => {
    streamImpl = (onChunk) => {
      onChunk({ text: '{"revisedDesign":"<x/>","changes":[{},{"type":42,"before":99,"after":null}]}' });
    };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0]).toEqual({ type: 'change', before: '', after: '' });
    expect(r.changes[1]).toEqual({ type: 'change', before: '', after: '' });
  });

  it('change null dans le tableau → sanitizé sans crash', async () => {
    streamImpl = (onChunk) => { onChunk({ text: '{"revisedDesign":"<x/>","changes":[null]}' }); };
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.changes[0].type).toBe('change');
  });
});

describe('impeccable-design — listCommands & history', () => {
  it('listCommands → 23 commandes avec description', () => {
    const list = impeccableDesign.listCommands();
    expect(list).toHaveLength(23);
    expect(list[0].description).toBeTruthy();
  });

  it('history vide (pas de clé) → []', () => {
    expect(impeccableDesign.history()).toEqual([]);
  });

  it('history JSON corrompu → catch → []', () => {
    localStorage.setItem(HISTORY_KEY, '{bad');
    expect(impeccableDesign.history()).toEqual([]);
  });

  it('history stocké non-array → []', () => {
    localStorage.setItem(HISTORY_KEY, '{"x":1}');
    expect(impeccableDesign.history()).toEqual([]);
  });

  it('persist setItem throw → catch (applyCommand réussit quand même)', async () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const r = await impeccableDesign.applyCommand('make-it-pop', DESIGN);
    expect(r.revisedDesign).toContain('pop');
    spy.mockRestore();
  });
});
