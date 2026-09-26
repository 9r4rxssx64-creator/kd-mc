/**
 * Tests media-studio.ts (génération vidéo + image + avatar BD).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mediaStudio } from '../../services/core-svc/media-studio.js';

describe('Media Studio (vidéo + image + avatar autonomie Kevin)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Providers registry', () => {
    it('list() retourne au moins 18 providers (vidéo + image + avatar + audio)', () => {
      const all = mediaStudio.list();
      expect(all.length).toBeGreaterThanOrEqual(18);
    });

    it('best-in-class providers : Sora, Runway, FLUX 2 Pro, DALL-E 4, Midjourney, HeyGen', () => {
      const all = mediaStudio.list();
      const names = new Set(all.map((p) => p.id));
      expect(names.has('openai_sora')).toBe(true);
      expect(names.has('runway_gen4')).toBe(true);
      expect(names.has('flux_2_pro')).toBe(true);
      expect(names.has('dalle_4')).toBe(true);
      expect(names.has('midjourney_v7')).toBe(true);
      expect(names.has('heygen_avatar')).toBe(true);
    });

    it('providers avatar/BD : photomaker + controlnet_cartoon', () => {
      const all = mediaStudio.list();
      expect(all.some((p) => p.id === 'photomaker')).toBe(true);
      expect(all.some((p) => p.id === 'controlnet_cartoon')).toBe(true);
    });

    it('forCapability text_to_video → Sora + Runway + Pika + Luma + Kling', () => {
      const t2v = mediaStudio.forCapability('text_to_video');
      expect(t2v.length).toBeGreaterThanOrEqual(5);
    });

    it('forCapability avatar_cartoon trouve photomaker', () => {
      const cartoon = mediaStudio.forCapability('avatar_cartoon');
      expect(cartoon.some((p) => p.id === 'photomaker')).toBe(true);
    });
  });

  describe('bestFor (qualité + budget + clé API dispo)', () => {
    it('bestFor text_to_video → preference best_in_class', () => {
      const best = mediaStudio.bestFor('text_to_video');
      expect(best?.quality).toBe('best_in_class');
    });

    it('bestFor avec budget contraint → moins cher', () => {
      const cheap = mediaStudio.bestFor('text_to_image', { maxBudgetUsd: 0.01 });
      /* SDXL Turbo $0.005 doit être le seul qui passe */
      expect(cheap?.id).toBe('sdxl_turbo');
    });

    it('bestFor capability inexistante → null', () => {
      const r = mediaStudio.bestFor('inexistant_xyz' as 'text_to_image');
      expect(r).toBeNull();
    });

    it('bestFor avec clé API stockée preferred', () => {
      localStorage.setItem('ax_replicate_key', 'r8_test_key');
      const best = mediaStudio.bestFor('avatar_cartoon');
      expect(best?.api_key_storage).toBe('ax_replicate_key');
    });
  });

  describe('createJob workflow', () => {
    it('createJob queued + persiste localStorage', () => {
      const job = mediaStudio.createJob({
        uid: 'kevin',
        capability: 'text_to_image',
        prompt: 'Logo APEX gold sur fond noir',
      });
      expect(job).not.toBeNull();
      expect(job?.status).toBe('queued');
      expect(job?.id).toMatch(/^job_/);
      const all = mediaStudio.listJobs('kevin');
      expect(all.length).toBe(1);
    });

    it('createJob respect provider_id explicit', () => {
      const job = mediaStudio.createJob({
        uid: 'kevin',
        capability: 'text_to_image',
        prompt: 'Test',
        provider_id: 'sdxl_turbo',
      });
      expect(job?.provider_id).toBe('sdxl_turbo');
    });

    it('createJob prompt 2000 chars max', () => {
      const long = 'X'.repeat(5000);
      const job = mediaStudio.createJob({
        uid: 'k',
        capability: 'text_to_image',
        prompt: long,
      });
      expect(job?.prompt.length).toBeLessThanOrEqual(2000);
    });

    it('updateJobStatus completed → duration_ms calculé', () => {
      const job = mediaStudio.createJob({
        uid: 'k',
        capability: 'text_to_image',
        prompt: 'Test',
      });
      expect(job).not.toBeNull();
      const ok = mediaStudio.updateJobStatus(job!.id, {
        status: 'completed',
        result_url: 'https://example.com/result.png',
      });
      expect(ok).toBe(true);
      const updated = mediaStudio.listJobs('k')[0];
      expect(updated?.status).toBe('completed');
      expect(updated?.completed_at).toBeGreaterThan(0);
      expect(updated?.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('updateJobStatus job inexistant → false', () => {
      expect(mediaStudio.updateJobStatus('inexistant_xyz', { status: 'failed' })).toBe(false);
    });

    it('listJobs filter uid + sort created_at desc', () => {
      mediaStudio.createJob({ uid: 'kev', capability: 'text_to_image', prompt: 'A' });
      mediaStudio.createJob({ uid: 'kev', capability: 'text_to_image', prompt: 'B' });
      mediaStudio.createJob({ uid: 'lau', capability: 'text_to_image', prompt: 'C' });
      const kevJobs = mediaStudio.listJobs('kev');
      expect(kevJobs.length).toBe(2);
      const lauJobs = mediaStudio.listJobs('lau');
      expect(lauJobs.length).toBe(1);
    });
  });

  describe('recommendForPrompt (Apex IA route le mieux)', () => {
    it('"bande dessinée de moi photo" → photomaker + controlnet_cartoon', () => {
      const r = mediaStudio.recommendForPrompt('Crée-moi une bande dessinée de moi à partir de cette photo');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r.some((rec) => rec.provider.id === 'photomaker')).toBe(true);
    });

    it('"vidéo parlante de moi" → heygen + d_id', () => {
      const r = mediaStudio.recommendForPrompt('Génère une vidéo de moi qui parle ce texte');
      expect(r.some((rec) => rec.provider.capabilities.includes('avatar_talking'))).toBe(true);
    });

    it('"vidéo de plage" → Sora ou Runway', () => {
      const r = mediaStudio.recommendForPrompt('Crée-moi une vidéo de plage tropicale');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r[0]?.provider.capabilities).toContain('text_to_video');
    });

    it('"image de chat" → FLUX ou DALL-E', () => {
      const r = mediaStudio.recommendForPrompt('Génère une image de chat persan');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r[0]?.provider.capabilities).toContain('text_to_image');
    });

    it('"logo entreprise" → Ideogram', () => {
      const r = mediaStudio.recommendForPrompt('Logo pour ma marque');
      expect(r.some((rec) => rec.provider.id === 'ideogram_v2')).toBe(true);
    });

    it('"musique pop" → Suno', () => {
      const r = mediaStudio.recommendForPrompt('Crée une musique pop happy');
      expect(r.some((rec) => rec.provider.id === 'suno_v4')).toBe(true);
    });

    it('limite 3 recommandations max', () => {
      const r = mediaStudio.recommendForPrompt('Vidéo + image + cartoon + musique en même temps');
      expect(r.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Stats dashboard', () => {
    it('getStats agrège providers + jobs + cost', () => {
      mediaStudio.createJob({ uid: 'k', capability: 'text_to_image', prompt: 'x' });
      mediaStudio.createJob({ uid: 'k', capability: 'text_to_video', prompt: 'y' });
      const stats = mediaStudio.getStats('k');
      expect(stats.total_providers).toBeGreaterThanOrEqual(18);
      expect(stats.total_jobs).toBe(2);
      expect(stats.estimated_cost_usd).toBeGreaterThan(0);
      expect(typeof stats.by_capability['text_to_image']).toBe('number');
    });
  });
});
