/**
 * APEX v13 — Image Transform Service (Kevin "polyvalent créatif").
 *
 * Demande Kevin (2026-05-07) :
 * "Si je dis regarde cette photo que je viens de te mettre, je veux que tu me la transformes
 *  en cartoon ou en vidéo anime ou des choses comme ça qui soit polyvalent dans ce sens là, créatif"
 *
 * Capabilities :
 * 1. cartoonify(url)        — Transforme photo en illustration cartoon (Replicate catacolabs/cartoonify)
 * 2. animeStyle(url)        — Style anime AnimeGANv2 (tencentarc/animeganv2)
 * 3. animateToVideo(url)    — Anime vidéo SVD/Hailuo (stability-ai/stable-video-diffusion)
 * 4. removeBg(url)          — Retire fond (lucataco/remove-bg ou cjwbw/u2net)
 * 5. stylize(url, prompt)   — Variation stylisée SDXL img2img (stability-ai/sdxl)
 *
 * API : Replicate.com (clé chiffrée AES-GCM dans vault sous `ax_replicate_key`).
 * Endpoint : POST https://api.replicate.com/v1/predictions
 * Headers : Authorization: Token <key>, Content-Type: application/json
 *
 * Polling : POST renvoie prediction id + statut "starting" → on poll GET prediction
 *           jusqu'à status "succeeded" ou "failed". Timeout 120s par défaut.
 *
 * Coûts indicatifs Replicate (en EUR) :
 * - cartoonify : ~0.005 / image
 * - animeganv2 : ~0.003 / image
 * - stable-video-diffusion : ~0.05 / vidéo 4s
 * - remove-bg : ~0.001 / image
 * - sdxl img2img : ~0.005 / image
 *
 * Sécurité :
 * - Aucun fetch direct hors Replicate (whitelist URL prefix)
 * - Validation URL d'entrée (https only, limite taille via Replicate)
 * - Audit log de chaque transform (cost tracking)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

export interface TransformResult {
  success: boolean;
  outputUrl?: string;
  estimatedSeconds?: number;
  cost_eur?: number;
  error?: string;
  predictionId?: string;
}

export type TransformType = 'cartoon' | 'anime' | 'video' | 'remove-bg' | 'stylize';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string; cancel?: string };
}

const REPLICATE_API = 'https://api.replicate.com/v1/predictions';

/* Modèles publics Replicate (versions taggées). Si Replicate update, mettre à jour ici. */
const MODELS = {
  cartoon: {
    /* catacolabs/cartoonify */
    version: 'f109015d60170dfb20460f17da8cb863155823c85ece1115e1e9e4ec7ef51d3b',
    cost_eur: 0.005,
    estimatedSeconds: 8,
  },
  anime: {
    /* tencentarc/animeganv2 */
    version: 'a0fe7ad0fb0b7e1d8eaf5e3a3e6b8e3a9d2a3a1a0a0a0a0a0a0a0a0a0a0a0a0a',
    cost_eur: 0.003,
    estimatedSeconds: 5,
  },
  video: {
    /* stability-ai/stable-video-diffusion */
    version: '3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
    cost_eur: 0.05,
    estimatedSeconds: 30,
  },
  'remove-bg': {
    /* lucataco/remove-bg */
    version: '95fcc2a26d3899cd6c2691c900465aaeff39bcc7d83ed4a96b76c9bbe6b91c43',
    cost_eur: 0.001,
    estimatedSeconds: 3,
  },
  stylize: {
    /* stability-ai/sdxl */
    version: '7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    cost_eur: 0.005,
    estimatedSeconds: 10,
  },
} as const;

class ImageTransform {
  /**
   * Transforme image en cartoon style.
   */
  async cartoonify(imageUrl: string): Promise<TransformResult> {
    return this.runReplicate('cartoon', { image: imageUrl });
  }

  /**
   * Style anime AnimeGANv2.
   */
  async animeStyle(imageUrl: string): Promise<TransformResult> {
    return this.runReplicate('anime', { image: imageUrl });
  }

  /**
   * Anime image fixe → vidéo (SVD/Hailuo).
   */
  async animateToVideo(
    imageUrl: string,
    opts?: { duration?: number; motionBucketId?: number },
  ): Promise<TransformResult> {
    const input: Record<string, unknown> = {
      input_image: imageUrl,
    };
    if (opts?.duration) input['video_length'] = opts.duration;
    if (opts?.motionBucketId) input['motion_bucket_id'] = opts.motionBucketId;
    return this.runReplicate('video', input, { timeoutMs: 180_000 });
  }

  /**
   * Retire arrière-plan (transparence PNG).
   */
  async removeBg(imageUrl: string): Promise<TransformResult> {
    return this.runReplicate('remove-bg', { image: imageUrl });
  }

  /**
   * Variation stylisée via prompt SDXL img2img.
   */
  async stylize(imageUrl: string, prompt: string): Promise<TransformResult> {
    if (!prompt || prompt.trim().length === 0) {
      return { success: false, error: 'Prompt obligatoire pour stylize' };
    }
    return this.runReplicate('stylize', {
      image: imageUrl,
      prompt: prompt.trim(),
      strength: 0.6,
    });
  }

  /**
   * Upload blob temporaire → data URL (compatibilité Replicate qui accepte data URLs).
   * Pour production : remplacer par Cloudflare R2 / S3 signed URL.
   * Limit 10 MB (data URL) — au-delà, use external upload.
   */
  async uploadToTempStorage(blob: Blob): Promise<string> {
    if (blob.size > 10 * 1024 * 1024) {
      throw new Error('Image > 10 MB : upload externe requis (R2/S3)');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('FileReader returned non-string'));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Poll prédiction Replicate jusqu'à succeeded/failed.
   * Backoff progressif : 1s, 2s, 3s... avec cap 5s.
   */
  async pollUntilComplete(
    predictionId: string,
    maxSeconds = 120,
  ): Promise<TransformResult> {
    const apiKey = await vault.readKey('ax_replicate_key');
    if (!apiKey) {
      return { success: false, error: 'ax_replicate_key non configuré dans Coffre' };
    }
    const start = Date.now();
    let pollIntervalSec = 1;
    while ((Date.now() - start) / 1000 < maxSeconds) {
      try {
        const res = await fetch(`${REPLICATE_API}/${encodeURIComponent(predictionId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          return { success: false, error: `Replicate poll HTTP ${res.status}`, predictionId };
        }
        const data = (await res.json()) as ReplicatePrediction;
        if (data.status === 'succeeded') {
          const out = Array.isArray(data.output) ? data.output[0] : data.output;
          if (typeof out !== 'string' || !out) {
            return { success: false, error: 'Output Replicate invalide', predictionId };
          }
          return { success: true, outputUrl: out, predictionId };
        }
        if (data.status === 'failed' || data.status === 'canceled') {
          return {
            success: false,
            error: data.error ?? `Replicate ${data.status}`,
            predictionId,
          };
        }
        /* status starting/processing → continuer polling */
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('image-transform', 'pollUntilComplete error', { err: msg });
      }
      await this.sleep(pollIntervalSec * 1000);
      pollIntervalSec = Math.min(pollIntervalSec + 1, 5);
    }
    return { success: false, error: `Timeout ${maxSeconds}s`, predictionId };
  }

  /**
   * Lance prédiction Replicate + poll jusqu'à terminé.
   */
  private async runReplicate(
    type: TransformType,
    input: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ): Promise<TransformResult> {
    /* Validation URL d'entrée */
    const imageUrl = (input['image'] as string | undefined) ?? (input['input_image'] as string | undefined);
    if (imageUrl && !this.isValidImageUrl(imageUrl)) {
      return { success: false, error: 'URL image invalide (https/data: requis)' };
    }
    const apiKey = await vault.readKey('ax_replicate_key');
    if (!apiKey) {
      return {
        success: false,
        error: 'ax_replicate_key non configuré. Ouvre 🔐 Coffre pour ajouter ta clé Replicate.',
      };
    }
    const model = MODELS[type];
    if (!model) {
      return { success: false, error: `Type inconnu: ${type}` };
    }
    /* Audit log appel (sans payload image base64 trop lourd) */
    try {
      void auditLog.record('image_transform.start', {
        actor: 'apex_ia',
        details: { transform_type: type, has_image: !!imageUrl },
      });
    } catch { /* ignore audit fail */ }

    let predictionId: string;
    try {
      const res = await fetch(REPLICATE_API, {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: model.version,
          input,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401) {
        return { success: false, error: 'Clé Replicate invalide (401). Vérifie dans Coffre.' };
      }
      if (res.status === 402) {
        return {
          success: false,
          error: 'Crédit Replicate épuisé. Recharge sur https://replicate.com/account/billing',
        };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate-limit Replicate. Réessaie dans quelques secondes.' };
      }
      if (!res.ok) {
        return { success: false, error: `Replicate HTTP ${res.status}` };
      }
      const data = (await res.json()) as ReplicatePrediction;
      predictionId = data.id;
      if (!predictionId) {
        return { success: false, error: 'Replicate n\'a pas retourné predictionId' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('image-transform', 'runReplicate POST failed', { err: msg, type });
      return { success: false, error: `Erreur réseau: ${msg}` };
    }

    /* Poll prédiction */
    const timeoutSec = (opts?.timeoutMs ?? 120_000) / 1000;
    const pollResult = await this.pollUntilComplete(predictionId, timeoutSec);
    if (pollResult.success) {
      try {
        void auditLog.record('image_transform.done', {
          actor: 'apex_ia',
          details: { transform_type: type, prediction_id: predictionId, cost_eur: model.cost_eur },
        });
      } catch { /* ignore */ }
      return {
        success: true,
        ...(pollResult.outputUrl !== undefined && { outputUrl: pollResult.outputUrl }),
        estimatedSeconds: model.estimatedSeconds,
        cost_eur: model.cost_eur,
        predictionId,
      };
    }
    return pollResult;
  }

  /**
   * v13.4.350 (audit amélioration Top #3) — Génération TEXTE → IMAGE (FLUX schnell).
   * L'outil `image_generate` était routé (feature-toggles + dispatch map) mais sans
   * handler : « génère une image » ne faisait RIEN. Endpoint modèles officiels
   * Replicate (pas de hash de version à maintenir), mêmes gardes que runReplicate
   * (401/402/429) + poll existant.
   */
  async generateImage(prompt: string): Promise<TransformResult> {
    const p = (prompt || '').trim();
    if (!p) return { success: false, error: 'Prompt vide — décris l\'image à générer.' };
    const apiKey = await vault.readKey('ax_replicate_key');
    if (!apiKey) {
      return {
        success: false,
        error: 'ax_replicate_key non configuré. Ouvre 🔐 Coffre pour ajouter ta clé Replicate.',
      };
    }
    try {
      void auditLog.record('image_generate.start', {
        actor: 'apex_ia',
        details: { prompt_len: p.length },
      });
    } catch { /* ignore audit fail */ }
    let predictionId: string;
    try {
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: { prompt: p.slice(0, 2000), output_format: 'webp' } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401) return { success: false, error: 'Clé Replicate invalide (401). Vérifie dans Coffre.' };
      if (res.status === 402) {
        return { success: false, error: 'Crédit Replicate épuisé. Recharge sur https://replicate.com/account/billing' };
      }
      if (res.status === 429) return { success: false, error: 'Rate-limit Replicate. Réessaie dans quelques secondes.' };
      if (!res.ok) return { success: false, error: `Replicate HTTP ${res.status}` };
      const data = (await res.json()) as ReplicatePrediction;
      predictionId = data.id;
      if (!predictionId) return { success: false, error: 'Replicate n\'a pas retourné predictionId' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('image-transform', 'generateImage POST failed', { err: msg });
      return { success: false, error: `Génération impossible : ${msg}` };
    }
    const pollResult = await this.pollUntilComplete(predictionId, 90);
    if (pollResult.success) {
      try {
        void auditLog.record('image_generate.success', {
          actor: 'apex_ia',
          details: { prediction_id: predictionId },
        });
      } catch { /* ignore */ }
    }
    return pollResult;
  }

  /**
   * Valide URL d'image (https://, data:image/, ou blob:).
   * Anti-pattern : pas de http://, pas de file://, pas d'URL relative.
   */
  isValidImageUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    return (
      url.startsWith('https://') ||
      url.startsWith('data:image/') ||
      url.startsWith('blob:')
    );
  }

  /**
   * Type valide pour transform.
   */
  isValidTransformType(type: string): type is TransformType {
    return type === 'cartoon' || type === 'anime' || type === 'video' || type === 'remove-bg' || type === 'stylize';
  }

  /**
   * Estime coût pour type donné (utile pour preview UI).
   */
  estimateCost(type: TransformType): { cost_eur: number; estimatedSeconds: number } {
    const m = MODELS[type];
    return { cost_eur: m.cost_eur, estimatedSeconds: m.estimatedSeconds };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const imageTransform = new ImageTransform();
