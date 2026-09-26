/**
 * video-use — branches restantes (campagne 100% réel, 2026-06-03).
 * Cibles : ffmpegInstance déjà chargé (2e appel), concat `?? []` + `if(!src) continue`,
 * String(err) dans edit() et composeHyperframes().
 * Mocke les imports CDN dynamiques ffmpeg via vi.mock + vi.hoisted (impls mutables).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  writeFile: async (..._a: unknown[]): Promise<void> => {},
  exec: async (..._a: unknown[]): Promise<number> => 0,
}));

vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: { record: vi.fn() } }));
vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('https://esm.sh/@ffmpeg/ffmpeg@0.12.10', () => ({
  FFmpeg: class {
    async load(): Promise<void> {}
    writeFile(...a: unknown[]): Promise<void> { return h.writeFile(...a); }
    exec(...a: unknown[]): Promise<number> { return h.exec(...a); }
    async readFile(): Promise<Uint8Array> { return new Uint8Array([1, 2, 3]); }
  },
}));
vi.mock('https://esm.sh/@ffmpeg/util@0.12.1', () => ({
  toBlobURL: async (u: string): Promise<string> => u,
  fetchFile: async (): Promise<Uint8Array> => new Uint8Array([9]),
}));

beforeEach(() => {
  h.writeFile = async () => {};
  h.exec = async () => 0;
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no net')); // force fetchToBytes→catch→fetchFile
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('video-use — branches', () => {
  it('edit cut ×2 → 2e appel réutilise ffmpegInstance (early return)', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r1 = await videoUse.edit({ operation: 'cut', videoSource: 'v.mp4', params: { start_sec: 0, end_sec: 5 } });
    expect(r1.success).toBe(true); // 1er → charge ffmpeg
    const r2 = await videoUse.edit({ operation: 'cut', videoSource: 'v.mp4' });
    expect(r2.success).toBe(true); // 2e → branche `if (ffmpegInstance) return`
  });

  it('concat sans sources → `?? []` + guard < 2', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'concat', videoSource: 'v.mp4' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('2+ sources');
  });

  it('concat avec source vide → branche `if (!src) continue`', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({
      operation: 'concat',
      videoSource: 'v.mp4',
      params: { sources: ['a.mp4', '', 'b.mp4'] },
    });
    expect(r.success).toBe(true);
  });

  it('edit : writeFile throw non-Error (string) → catch String(err)', async () => {
    // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
    h.writeFile = async () => { throw 'boom-edit'; };
    const { videoUse } = await import('../../services/skills/video-use.js');
    const r = await videoUse.edit({ operation: 'cut', videoSource: 'v.mp4' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom-edit');
  });

  it('composeHyperframes : throw non-Error (string) → catch String(err)', async () => {
    const { videoUse } = await import('../../services/skills/video-use.js');
    // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => { throw 'boom-hf'; });
    const r = await videoUse.composeHyperframes({ compositionId: 'c1', beats: [] });
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom-hf');
  });
});
