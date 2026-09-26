/**
 * APEX v13 — Media Studio (génération vidéo/image autonome IA).
 *
 * Demande Kevin (2026-05-03) :
 * "Capable de créer des vidéos, montages vidéo en autonomie.
 *  Système avatar bande dessinée depuis photo de moi.
 *  Va chercher l'outil le plus poussé, performant, polyvalent."
 *
 * Outils intégrés (registry meilleurs providers 2026) :
 *
 * VIDÉO :
 * - Sora 2.0 (OpenAI) : text-to-video premium
 * - Runway Gen-4 : video editing IA + image-to-video
 * - Pika Labs 2.5 : video stylisée + character motion
 * - Luma Dream Machine : 3D scenes + camera control
 * - Kling 2.0 (Kuaishou) : long-form video 2 min+
 *
 * IMAGE :
 * - FLUX 2 Pro (Black Forest Labs) : photorealistic best
 * - DALL-E 4 (OpenAI) : creative + IP safe
 * - Midjourney v7 : artistic premium
 * - Stable Diffusion XL Turbo : open source
 * - Ideogram 2.0 : text rendering (logos)
 *
 * AVATAR / BD / CARTOON :
 * - Stable Diffusion + ControlNet : photo → cartoon stylé
 * - Replicate "tencentarc/photomaker" : portrait → personnages multiples
 * - HeyGen : avatar parlant vidéo
 * - D-ID : photo → vidéo parlante
 * - Lensa AI : style transfer artistique
 *
 * AUDIO :
 * - Suno v4 : musique IA paroles + instrument
 * - Udio : musique studio quality
 * - ElevenLabs Music : score cinéma
 *
 * Tous via Replicate API si config ax_replicate_key, sinon fallback
 * registries publiques + URL directes outils.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type MediaCapability =
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_video'
  | 'image_to_video'
  | 'avatar_cartoon'         /* Photo → personnage BD/cartoon */
  | 'avatar_talking'          /* Photo → vidéo parlante */
  | 'video_edit'              /* Montage timeline IA */
  | 'video_upscale'           /* Upscale 4K */
  | 'music_generation'
  | 'voice_cloning'
  | 'logo_design'
  | 'style_transfer';

export interface MediaProvider {
  id: string;
  name: string;
  capabilities: readonly MediaCapability[];
  api_endpoint?: string;
  api_key_storage?: string;
  documentation_url: string;
  pricing_per_request_usd?: number;
  quality: 'best_in_class' | 'premium' | 'standard' | 'free';
  speed_seconds_avg?: number;
  output_max_resolution?: string;
  supports_batch: boolean;
  added_v: string;
}

export interface MediaJob {
  id: string;
  uid: string;
  capability: MediaCapability;
  provider_id: string;
  prompt: string;
  inputs?: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  result_local?: string;
  cost_usd?: number;
  error?: string;
  created_at: number;
  completed_at?: number;
  duration_ms?: number;
}

const PROVIDERS: readonly MediaProvider[] = [
  /* === VIDÉO PREMIUM === */
  {
    id: 'openai_sora',
    name: 'Sora 2.0 (OpenAI)',
    capabilities: ['text_to_video', 'image_to_video'],
    api_endpoint: 'https://api.openai.com/v1/video/generations',
    api_key_storage: 'ax_openai_key',
    documentation_url: 'https://platform.openai.com/docs/sora',
    pricing_per_request_usd: 0.50,
    quality: 'best_in_class',
    speed_seconds_avg: 60,
    output_max_resolution: '1920x1080',
    supports_batch: false,
    added_v: 'v13.0.1',
  },
  {
    id: 'runway_gen4',
    name: 'Runway Gen-4',
    capabilities: ['text_to_video', 'image_to_video', 'video_edit'],
    api_endpoint: 'https://api.runwayml.com/v1/generate',
    api_key_storage: 'ax_runway_key',
    documentation_url: 'https://docs.runwayml.com',
    pricing_per_request_usd: 0.95,
    quality: 'best_in_class',
    speed_seconds_avg: 90,
    output_max_resolution: '4096x2160',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'luma_dream_machine',
    name: 'Luma Dream Machine',
    capabilities: ['text_to_video', 'image_to_video'],
    api_endpoint: 'https://api.lumalabs.ai/dream-machine',
    api_key_storage: 'ax_luma_key',
    documentation_url: 'https://docs.lumalabs.ai',
    pricing_per_request_usd: 0.35,
    quality: 'premium',
    speed_seconds_avg: 45,
    output_max_resolution: '1920x1080',
    supports_batch: false,
    added_v: 'v13.0.1',
  },
  {
    id: 'pika_labs',
    name: 'Pika Labs 2.5',
    capabilities: ['text_to_video', 'image_to_video'],
    api_endpoint: 'https://api.pika.art/v1/generate',
    api_key_storage: 'ax_pika_key',
    documentation_url: 'https://pika.art/docs',
    pricing_per_request_usd: 0.20,
    quality: 'premium',
    speed_seconds_avg: 30,
    output_max_resolution: '1920x1080',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'kling_v2',
    name: 'Kling 2.0',
    capabilities: ['text_to_video', 'image_to_video'],
    api_endpoint: 'https://api.klingai.com/v2/generate',
    api_key_storage: 'ax_kling_key',
    documentation_url: 'https://kling.kuaishou.com/docs',
    pricing_per_request_usd: 0.40,
    quality: 'premium',
    speed_seconds_avg: 120,
    output_max_resolution: '1920x1080',
    supports_batch: false,
    added_v: 'v13.0.1',
  },

  /* === IMAGE PREMIUM === */
  {
    id: 'flux_2_pro',
    name: 'FLUX 2 Pro (Black Forest Labs)',
    capabilities: ['text_to_image', 'image_to_image'],
    api_endpoint: 'https://api.bfl.ai/v1/flux-pro-1.1',
    api_key_storage: 'ax_bfl_key',
    documentation_url: 'https://docs.bfl.ai',
    pricing_per_request_usd: 0.05,
    quality: 'best_in_class',
    speed_seconds_avg: 8,
    output_max_resolution: '4096x4096',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'dalle_4',
    name: 'DALL-E 4 (OpenAI)',
    capabilities: ['text_to_image'],
    api_endpoint: 'https://api.openai.com/v1/images/generations',
    api_key_storage: 'ax_openai_key',
    documentation_url: 'https://platform.openai.com/docs/api-reference/images',
    pricing_per_request_usd: 0.08,
    quality: 'best_in_class',
    speed_seconds_avg: 12,
    output_max_resolution: '2048x2048',
    supports_batch: false,
    added_v: 'v13.0.1',
  },
  {
    id: 'midjourney_v7',
    name: 'Midjourney v7',
    capabilities: ['text_to_image', 'image_to_image', 'style_transfer'],
    api_endpoint: 'https://api.midjourney.com/v7',
    api_key_storage: 'ax_midjourney_key',
    documentation_url: 'https://docs.midjourney.com',
    pricing_per_request_usd: 0.10,
    quality: 'best_in_class',
    speed_seconds_avg: 30,
    output_max_resolution: '4096x4096',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'sdxl_turbo',
    name: 'Stable Diffusion XL Turbo',
    capabilities: ['text_to_image', 'image_to_image'],
    api_endpoint: 'https://api.replicate.com/v1/predictions',
    api_key_storage: 'ax_replicate_key',
    documentation_url: 'https://replicate.com/stability-ai/sdxl',
    pricing_per_request_usd: 0.005,
    quality: 'standard',
    speed_seconds_avg: 3,
    output_max_resolution: '1024x1024',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'ideogram_v2',
    name: 'Ideogram 2.0 (logos & text)',
    capabilities: ['text_to_image', 'logo_design'],
    api_endpoint: 'https://api.ideogram.ai/generate',
    api_key_storage: 'ax_ideogram_key',
    documentation_url: 'https://docs.ideogram.ai',
    pricing_per_request_usd: 0.06,
    quality: 'premium',
    speed_seconds_avg: 10,
    output_max_resolution: '2048x2048',
    supports_batch: false,
    added_v: 'v13.0.1',
  },

  /* === AVATAR / BD / CARTOON === */
  {
    id: 'photomaker',
    name: 'PhotoMaker (TencentARC)',
    capabilities: ['avatar_cartoon', 'image_to_image', 'style_transfer'],
    api_endpoint: 'https://api.replicate.com/v1/predictions',
    api_key_storage: 'ax_replicate_key',
    documentation_url: 'https://replicate.com/tencentarc/photomaker',
    pricing_per_request_usd: 0.012,
    quality: 'premium',
    speed_seconds_avg: 15,
    output_max_resolution: '1024x1024',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'heygen_avatar',
    name: 'HeyGen Avatar Talking',
    capabilities: ['avatar_talking'],
    api_endpoint: 'https://api.heygen.com/v2/video.generate',
    api_key_storage: 'ax_heygen_key',
    documentation_url: 'https://docs.heygen.com',
    pricing_per_request_usd: 0.30,
    quality: 'best_in_class',
    speed_seconds_avg: 40,
    output_max_resolution: '1920x1080',
    supports_batch: false,
    added_v: 'v13.0.1',
  },
  {
    id: 'd_id_talks',
    name: 'D-ID Talks (photo → vidéo parlante)',
    capabilities: ['avatar_talking'],
    api_endpoint: 'https://api.d-id.com/talks',
    api_key_storage: 'ax_did_key',
    documentation_url: 'https://docs.d-id.com',
    pricing_per_request_usd: 0.20,
    quality: 'premium',
    speed_seconds_avg: 25,
    output_max_resolution: '1920x1080',
    supports_batch: false,
    added_v: 'v13.0.1',
  },
  {
    id: 'controlnet_cartoon',
    name: 'ControlNet Cartoon Style',
    capabilities: ['avatar_cartoon', 'style_transfer'],
    api_endpoint: 'https://api.replicate.com/v1/predictions',
    api_key_storage: 'ax_replicate_key',
    documentation_url: 'https://replicate.com/lucataco/controlnet-cartoon',
    pricing_per_request_usd: 0.008,
    quality: 'premium',
    speed_seconds_avg: 12,
    output_max_resolution: '1024x1024',
    supports_batch: true,
    added_v: 'v13.0.1',
  },

  /* === AUDIO === */
  {
    id: 'suno_v4',
    name: 'Suno v4 (Music IA)',
    capabilities: ['music_generation'],
    api_endpoint: 'https://api.suno.ai/v4/generate',
    api_key_storage: 'ax_suno_key',
    documentation_url: 'https://docs.suno.ai',
    pricing_per_request_usd: 0.10,
    quality: 'best_in_class',
    speed_seconds_avg: 60,
    output_max_resolution: 'audio',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
  {
    id: 'udio',
    name: 'Udio (Music Studio Quality)',
    capabilities: ['music_generation'],
    api_endpoint: 'https://api.udio.com/v1/generate',
    api_key_storage: 'ax_udio_key',
    documentation_url: 'https://docs.udio.com',
    pricing_per_request_usd: 0.15,
    quality: 'premium',
    speed_seconds_avg: 90,
    output_max_resolution: 'audio',
    supports_batch: false,
    added_v: 'v13.0.1',
  },
  {
    id: 'elevenlabs_voice_clone',
    name: 'ElevenLabs Voice Clone',
    capabilities: ['voice_cloning'],
    api_endpoint: 'https://api.elevenlabs.io/v1/voice-cloning',
    api_key_storage: 'ax_elevenlabs_key',
    documentation_url: 'https://elevenlabs.io/docs',
    pricing_per_request_usd: 0.18,
    quality: 'best_in_class',
    speed_seconds_avg: 45,
    output_max_resolution: 'audio',
    supports_batch: false,
    added_v: 'v13.0.1',
  },

  /* === VIDEO POST-PROD === */
  {
    id: 'topaz_video_upscale',
    name: 'Topaz Video AI (Upscale 4K)',
    capabilities: ['video_upscale'],
    api_endpoint: 'https://api.topazlabs.com/v1/video/upscale',
    api_key_storage: 'ax_topaz_key',
    documentation_url: 'https://docs.topazlabs.com',
    pricing_per_request_usd: 0.50,
    quality: 'best_in_class',
    speed_seconds_avg: 180,
    output_max_resolution: '4096x2160',
    supports_batch: true,
    added_v: 'v13.0.1',
  },
];

class MediaStudio {
  /**
   * Liste tous providers.
   */
  list(): readonly MediaProvider[] {
    return PROVIDERS;
  }

  /**
   * Providers pour une capability donnée.
   */
  forCapability(capability: MediaCapability): readonly MediaProvider[] {
    return PROVIDERS.filter((p) => p.capabilities.includes(capability));
  }

  /**
   * Best provider pour capability (qualité + clé API dispo + budget user).
   */
  bestFor(
    capability: MediaCapability,
    options: { maxBudgetUsd?: number; preferQuality?: boolean } = {},
  ): MediaProvider | null {
    const candidates = this.forCapability(capability);
    if (candidates.length === 0) return null;

    /* Filter par budget */
    const maxBudget = options.maxBudgetUsd;
    const budgetFilter =
      typeof maxBudget === 'number'
        ? candidates.filter((p) => (p.pricing_per_request_usd ?? 0) <= maxBudget)
        : candidates;

    /* Filter par clé API dispo */
    const apiAvailable = budgetFilter.filter((p) => {
      if (!p.api_key_storage) return true;
      try {
        return Boolean(localStorage.getItem(p.api_key_storage));
      } catch {
        return false;
      }
    });

    const pool = apiAvailable.length > 0 ? apiAvailable : budgetFilter;
    if (pool.length === 0) return null;

    /* Tri qualité (best_in_class > premium > standard > free) puis prix */
    const QUALITY_RANK: Record<MediaProvider['quality'], number> = {
      best_in_class: 4,
      premium: 3,
      standard: 2,
      free: 1,
    };
    const sorted = [...pool].sort((a, b) => {
      const qDiff = QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality];
      if (qDiff !== 0) return qDiff;
      return (a.pricing_per_request_usd ?? 0) - (b.pricing_per_request_usd ?? 0);
    });
    return sorted[0] ?? null;
  }

  /**
   * Crée job (queued) — exécution réelle = Jet 9 worker bridge.
   */
  createJob(opts: {
    uid: string;
    capability: MediaCapability;
    prompt: string;
    inputs?: Record<string, unknown>;
    provider_id?: string;
    max_budget_usd?: number;
  }): MediaJob | null {
    const provider = opts.provider_id
      ? PROVIDERS.find((p) => p.id === opts.provider_id)
      : this.bestFor(opts.capability, opts.max_budget_usd !== undefined ? { maxBudgetUsd: opts.max_budget_usd } : {});
    if (!provider) {
      logger.warn('media-studio', `No provider for ${opts.capability}`);
      return null;
    }
    const job: MediaJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      uid: opts.uid,
      capability: opts.capability,
      provider_id: provider.id,
      prompt: opts.prompt.slice(0, 2000),
      ...(opts.inputs && { inputs: opts.inputs }),
      status: 'queued',
      cost_usd: provider.pricing_per_request_usd ?? 0,
      created_at: Date.now(),
    };
    this.persistJob(job);
    void auditLog.record('media.job_created', {
      details: { id: job.id, capability: opts.capability, provider: provider.id },
    });
    return job;
  }

  /**
   * Update job status (worker callback Jet 9 ou local execution).
   */
  updateJobStatus(jobId: string, updates: Partial<MediaJob>): boolean {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_media_jobs') ?? '[]') as MediaJob[];
      const idx = all.findIndex((j) => j.id === jobId);
      if (idx < 0) return false;
      const existing = all[idx];
      if (!existing) return false;
      const merged: MediaJob = { ...existing, ...updates };
      if (updates.status === 'completed' || updates.status === 'failed') {
        merged.completed_at = Date.now();
        merged.duration_ms = merged.completed_at - merged.created_at;
      }
      all[idx] = merged;
      localStorage.setItem('apex_v13_media_jobs', JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  }

  listJobs(uid?: string, limit = 50): MediaJob[] {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_media_jobs') ?? '[]') as MediaJob[];
      const filtered = uid ? all.filter((j) => j.uid === uid) : all;
      return filtered.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Recommandations Apex selon prompt user.
   * Ex : "fais-moi une bande dessinée de moi" → photomaker + controlnet_cartoon
   */
  recommendForPrompt(prompt: string): readonly { provider: MediaProvider; reason: string }[] {
    const lc = prompt.toLowerCase();
    const recommendations: { provider: MediaProvider; reason: string }[] = [];

    /* Detection avatar/BD/cartoon */
    if (/bande dessinée|cartoon|bd|manga|anime|stylisé/i.test(lc) && /photo|moi|portrait|visage/.test(lc)) {
      const photomaker = PROVIDERS.find((p) => p.id === 'photomaker');
      if (photomaker) recommendations.push({ provider: photomaker, reason: 'Avatar BD depuis ta photo (PhotoMaker)' });
      const controlnet = PROVIDERS.find((p) => p.id === 'controlnet_cartoon');
      if (controlnet) recommendations.push({ provider: controlnet, reason: 'Style cartoon via ControlNet' });
    }

    /* Avatar parlant */
    if (/parler|parle|talking|vidéo de moi qui dis/i.test(lc) && /photo|moi/i.test(lc)) {
      const heygen = PROVIDERS.find((p) => p.id === 'heygen_avatar');
      if (heygen) recommendations.push({ provider: heygen, reason: 'Avatar parlant (HeyGen)' });
      const did = PROVIDERS.find((p) => p.id === 'd_id_talks');
      if (did) recommendations.push({ provider: did, reason: 'Photo → vidéo parlante (D-ID)' });
    }

    /* Vidéo */
    if (/vidéo|video|montage|clip|film/i.test(lc) && !recommendations.length) {
      const sora = PROVIDERS.find((p) => p.id === 'openai_sora');
      if (sora) recommendations.push({ provider: sora, reason: 'Sora 2.0 — meilleur text-to-video' });
      const runway = PROVIDERS.find((p) => p.id === 'runway_gen4');
      if (runway) recommendations.push({ provider: runway, reason: 'Runway Gen-4 — édition + image-to-video' });
    }

    /* Image */
    if (/image|photo|illustration|dessin/i.test(lc) && !recommendations.length) {
      const flux = PROVIDERS.find((p) => p.id === 'flux_2_pro');
      if (flux) recommendations.push({ provider: flux, reason: 'FLUX 2 Pro — photoréaliste best-in-class' });
      const dalle = PROVIDERS.find((p) => p.id === 'dalle_4');
      if (dalle) recommendations.push({ provider: dalle, reason: 'DALL-E 4 — créatif + IP safe' });
    }

    /* Logo */
    if (/logo|marque|branding/i.test(lc)) {
      const ideogram = PROVIDERS.find((p) => p.id === 'ideogram_v2');
      if (ideogram) recommendations.push({ provider: ideogram, reason: 'Ideogram — text rendering excellent' });
    }

    /* Musique */
    if (/musique|song|chanson|track|beat/i.test(lc)) {
      const suno = PROVIDERS.find((p) => p.id === 'suno_v4');
      if (suno) recommendations.push({ provider: suno, reason: 'Suno v4 — musique avec paroles' });
    }

    return recommendations.slice(0, 3);
  }

  /**
   * Stats admin dashboard.
   */
  getStats(uid?: string): {
    total_providers: number;
    by_capability: Record<string, number>;
    total_jobs: number;
    completed: number;
    failed: number;
    estimated_cost_usd: number;
  } {
    const jobs = this.listJobs(uid);
    const byCap: Record<string, number> = {};
    for (const p of PROVIDERS) {
      for (const c of p.capabilities) byCap[c] = (byCap[c] ?? 0) + 1;
    }
    return {
      total_providers: PROVIDERS.length,
      by_capability: byCap,
      total_jobs: jobs.length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      estimated_cost_usd: jobs.reduce((s, j) => s + (j.cost_usd ?? 0), 0),
    };
  }

  private persistJob(job: MediaJob): void {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_media_jobs') ?? '[]') as MediaJob[];
      all.push(job);
      const trimmed = all.length > 200 ? all.slice(-200) : all;
      localStorage.setItem('apex_v13_media_jobs', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('media-studio', 'persistJob failed', { err });
    }
  }
}

export const mediaStudio = new MediaStudio();
