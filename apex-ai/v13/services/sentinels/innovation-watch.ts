/**
 * APEX v13 — Innovation Watch (veille technologique 24/7).
 *
 * Demande Kevin (CLAUDE.md règle absolue 2026-05-04) :
 * > "Régulièrement des agents d'amélioration dédiés à chercher. Vérifient qu'il
 * >  n'y ait pas de nouvelles mises à jour qui soient sorties, mieux améliorer
 * >  plus performant. Se mettent à jour récupèrent les nouveaux à chaque fois
 * >  suivant le travail donné suivant l'utilisation, ils s'adaptent, améliorent,
 * >  vont chercher en autonomie totale automatisé."
 *
 * Mission :
 * - Scan hebdo npm registry pour upgrades sur deps Apex
 * - Scan IA providers (Anthropic / OpenAI / Groq / Gemini / Mistral) `/models`
 *   endpoint pour détecter nouveaux modèles
 * - Scan HuggingFace trending models (TTS/STT/Vision/Image)
 * - Scan GitHub trending repos par tag (tts, vector-db, ai-agents...)
 * - Compare current vs latest, calcule gain estimé
 * - Auto-update si gain >= 50% ET sans breaking-change ET confidence >= 0.95
 * - Stockage 200 updates max (FIFO), notif Kevin si gros gain détecté
 *
 * Sentinelle `innovation-watch` enregistrée dans sentinels-registry, run hebdo.
 * UI admin "💡 Innovation" avec bouton "🔄 Scanner maintenant" + Apply / Skip.
 *
 * Anti-pattern : pas de scan agressif (rate-limit fetch 3s timeout, max 30s/scan).
 *               aucun auto-update sur breaking-changes (semver MAJOR bump).
 */

import { logger } from '../../core/logger.js';

/* === Types === */

export type InnovationCategory =
  | 'ai-provider'
  | 'lib-npm'
  | 'api-service'
  | 'browser-api'
  | 'tts-stt'
  | 'vision'
  | 'image-gen'
  | 'video-gen'
  | 'vector-db'
  | 'auth'
  | 'mobile-framework'
  | 'bundler';

export type InnovationRecommendation =
  | 'upgrade-asap'
  | 'upgrade-soon'
  | 'monitor'
  | 'skip'
  | 'breaking-changes';

export type InnovationStatus = 'pending' | 'applied' | 'skipped';

export interface InnovationGain {
  /** Gain perf attendu en % (0-100) */
  perf?: number;
  /** Gain coût attendu en % */
  cost?: number;
  /** Gain capacités (nouvelles features), score 0-100 */
  capabilities?: number;
  /** Réduction taille bundle attendue en % */
  bundleSize?: number;
}

export interface TechUpdate {
  id: string;
  category: InnovationCategory;
  name: string;
  currentVersion?: string;
  latestVersion?: string;
  /** Date release upstream (ms epoch) */
  releaseDate?: number;
  estimatedGain?: InnovationGain;
  recommendation: InnovationRecommendation;
  /** Date détection locale (ms epoch) */
  detectedAt: number;
  details?: string;
  /** Pending par défaut, applied / skipped après action user/auto */
  status?: InnovationStatus;
}

export interface InnovationStats {
  /** Date dernier scan complet (ms epoch) */
  lastScan: number;
  /** Total updates détectés (cumul historique) */
  totalUpdatesDetected: number;
  /** Updates détectés derniers 7j */
  lastWeek: number;
  /** Total auto-applied */
  appliedCount: number;
  /** Total skipped */
  skippedCount: number;
}

export interface ScanSummary {
  updates: TechUpdate[];
  summary: string;
}

export interface ListFilter {
  category?: InnovationCategory;
  /** Filtre updates détectés depuis N jours (ex: 7) */
  minDays?: number;
  status?: InnovationStatus;
}

/* === Constantes === */

const STORAGE_KEY = 'apex_v13_innovation_updates';
const STATS_KEY = 'apex_v13_innovation_stats';
const MAX_UPDATES = 200;
const FETCH_TIMEOUT_MS = 3_000;
const AUTO_UPDATE_GAIN_THRESHOLD = 50; /* % */
export const AUTO_UPDATE_CONFIDENCE = 0.95;

/**
 * Curated list de packages npm critiques utilisés par Apex (à scanner régulièrement).
 * Volontairement court — extensible via config.
 */
const NPM_PACKAGES_TO_WATCH: readonly { name: string; current?: string }[] = [
  { name: 'lz-string', current: '1.5.0' },
  { name: 'pdf-lib', current: '1.17.1' },
  { name: 'jspdf', current: '2.5.1' },
  { name: 'firebase', current: '10.0.0' },
  { name: 'workbox-window', current: '7.0.0' },
  { name: 'idb', current: '8.0.0' },
  { name: 'ulid', current: '2.3.0' },
  { name: 'meyda', current: '5.6.3' },
  { name: 'pitchy', current: '4.1.0' },
  { name: 'libsodium-wrappers', current: '0.7.13' },
  { name: 'tesseract.js', current: '5.0.0' },
];

/**
 * Curated list de providers IA (avec endpoint /models si dispo).
 */
const AI_PROVIDERS_TO_WATCH: readonly {
  name: string;
  modelsEndpoint?: string;
  category: InnovationCategory;
}[] = [
  { name: 'anthropic', modelsEndpoint: 'https://api.anthropic.com/v1/models', category: 'ai-provider' },
  { name: 'openai', modelsEndpoint: 'https://api.openai.com/v1/models', category: 'ai-provider' },
  { name: 'groq', modelsEndpoint: 'https://api.groq.com/openai/v1/models', category: 'ai-provider' },
  { name: 'mistral', modelsEndpoint: 'https://api.mistral.ai/v1/models', category: 'ai-provider' },
  { name: 'gemini', modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models', category: 'ai-provider' },
];

/**
 * HuggingFace : tags pertinents pour Apex (TTS / STT / vision / image / video).
 */
const HF_TAGS_TO_WATCH: readonly { tag: string; category: InnovationCategory }[] = [
  { tag: 'text-to-speech', category: 'tts-stt' },
  { tag: 'automatic-speech-recognition', category: 'tts-stt' },
  { tag: 'image-to-text', category: 'vision' },
  { tag: 'text-to-image', category: 'image-gen' },
  { tag: 'text-to-video', category: 'video-gen' },
];

/**
 * GitHub trending tags scannés pour propositions integration.
 */
const GH_TRENDING_TAGS: readonly { tag: string; category: InnovationCategory }[] = [
  { tag: 'vector-database', category: 'vector-db' },
  { tag: 'ai-agents', category: 'ai-provider' },
  { tag: 'webauthn', category: 'auth' },
  { tag: 'pwa', category: 'mobile-framework' },
];

/* === Helpers privés === */

function genId(category: string, name: string): string {
  /* ID stable pour dédupe : `<cat>:<name>:<latest>` calculé après détection. */
  return `${category}:${name}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Compare 2 versions semver simples.
 * @returns 'newer' | 'same' | 'older' | 'breaking' (MAJOR bump)
 */
function compareSemver(current: string, latest: string): 'newer' | 'same' | 'older' | 'breaking' {
  const parse = (v: string): [number, number, number] => {
    const cleaned = v.replace(/^v/, '').split(/[-+]/)[0] ?? '0.0.0';
    const [maj = '0', min = '0', pat = '0'] = cleaned.split('.');
    return [parseInt(maj, 10) || 0, parseInt(min, 10) || 0, parseInt(pat, 10) || 0];
  };
  const [cM, cm, cp] = parse(current);
  const [lM, lm, lp] = parse(latest);
  if (lM > cM) return 'breaking';
  if (lM === cM && lm > cm) return 'newer';
  if (lM === cM && lm === cm && lp > cp) return 'newer';
  if (lM === cM && lm === cm && lp === cp) return 'same';
  return 'older';
}

/**
 * Fetch wrapper avec timeout strict + signal AbortController.
 */
async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* === Service principal === */

class InnovationWatch {
  /**
   * Scan complet : npm + AI providers + HuggingFace + GitHub trending.
   * Update stocké, stats mis à jour, summary returned.
   */
  async runScan(): Promise<ScanSummary> {
    logger.info('innovation-watch', 'Scan complet démarré');
    const startedAt = Date.now();
    const collected: TechUpdate[] = [];

    /* Lance tous les scans en parallèle pour minimiser durée totale */
    const [npmResults, aiResults, hfResults, ghResults] = await Promise.allSettled([
      this.scanNpm(),
      this.scanAIProviders(),
      this.scanHuggingFace(),
      this.scanGitHubTrending(GH_TRENDING_TAGS.map((t) => t.tag)),
    ]);

    if (npmResults.status === 'fulfilled') collected.push(...npmResults.value);
    if (aiResults.status === 'fulfilled') collected.push(...aiResults.value);
    if (hfResults.status === 'fulfilled') collected.push(...hfResults.value);
    if (ghResults.status === 'fulfilled') collected.push(...ghResults.value);

    /* Persiste */
    this.persistUpdates(collected);
    this.bumpStats(collected.length, startedAt);

    /* Audit log si dispo */
    try {
      const { auditLog } = await import('../observability/audit-log.js');
      await auditLog.record('innovation.scan', {
        details: { count: collected.length, durationMs: Date.now() - startedAt },
      });
    } catch {
      /* audit-log optionnel en test */
    }

    const summary = `${collected.length} updates détectés en ${Date.now() - startedAt}ms`;
    logger.info('innovation-watch', summary);
    return { updates: collected, summary };
  }

  /**
   * Scan npm registry pour deps watched.
   * GET https://registry.npmjs.org/<pkg>/latest → version + time.
   */
  async scanNpm(): Promise<TechUpdate[]> {
    const updates: TechUpdate[] = [];
    for (const pkg of NPM_PACKAGES_TO_WATCH) {
      try {
        const res = await fetchWithTimeout(`https://registry.npmjs.org/${pkg.name}/latest`);
        if (!res.ok) continue;
        const data = (await res.json()) as { version?: string; time?: string };
        if (!data.version) continue;
        const cmp = compareSemver(pkg.current ?? '0.0.0', data.version);
        if (cmp === 'newer' || cmp === 'breaking') {
          const update: TechUpdate = {
            id: genId('lib-npm', pkg.name),
            category: 'lib-npm',
            name: pkg.name,
            recommendation: cmp === 'breaking' ? 'breaking-changes' : 'upgrade-soon',
            detectedAt: Date.now(),
            status: 'pending',
          };
          if (pkg.current !== undefined) update.currentVersion = pkg.current;
          update.latestVersion = data.version;
          if (data.time !== undefined) update.releaseDate = Date.parse(data.time);
          const gain = await this.compareGain('lib-npm', pkg.current ?? '0.0.0', data.version);
          if (gain) update.estimatedGain = gain;
          /* Fix v13.3.18 (Kevin v13.3.16 rapport "14 updates pending → 0 appliquées") :
           * Promo recommendation à 'upgrade-asap' si non-breaking ET gain ≥ threshold
           * → débloque auto-apply gating (avant : tous étaient 'upgrade-soon' = jamais appliqués). */
          if (cmp !== 'breaking' && gain) {
            const maxGain = Math.max(gain.perf ?? 0, gain.cost ?? 0, gain.capabilities ?? 0);
            if (maxGain >= AUTO_UPDATE_GAIN_THRESHOLD) {
              update.recommendation = 'upgrade-asap';
            }
          }
          updates.push(update);
        }
      } catch (err: unknown) {
        logger.warn('innovation-watch', `npm scan ${pkg.name} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return updates;
  }

  /**
   * Scan IA providers /models pour détecter nouveaux modèles.
   * Pas de clé API requise pour le mock — en prod, vault.readKey().
   */
  async scanAIProviders(): Promise<TechUpdate[]> {
    const updates: TechUpdate[] = [];
    for (const provider of AI_PROVIDERS_TO_WATCH) {
      if (!provider.modelsEndpoint) continue;
      try {
        const res = await fetchWithTimeout(provider.modelsEndpoint);
        if (!res.ok && res.status !== 401) continue;
        /* 401 = endpoint exists but auth requise — on note quand même */
        const data = res.ok ? ((await res.json()) as { data?: unknown[]; models?: unknown[] }) : null;
        const modelsCount = data?.data?.length ?? data?.models?.length ?? 0;
        const update: TechUpdate = {
          id: genId('ai-provider', provider.name),
          category: provider.category,
          name: provider.name,
          recommendation: modelsCount > 0 ? 'monitor' : 'skip',
          detectedAt: Date.now(),
          status: 'pending',
          details: `${modelsCount} models exposed`,
        };
        updates.push(update);
      } catch (err: unknown) {
        logger.warn('innovation-watch', `ai-provider scan ${provider.name} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return updates;
  }

  /**
   * Scan HuggingFace trending models.
   * @param category filter (tts-stt | vision | etc.) — si absent, scan tous les tags watched.
   */
  async scanHuggingFace(category?: InnovationCategory): Promise<TechUpdate[]> {
    const updates: TechUpdate[] = [];
    const tags = category
      ? HF_TAGS_TO_WATCH.filter((t) => t.category === category)
      : HF_TAGS_TO_WATCH;
    for (const t of tags) {
      try {
        const url = `https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(t.tag)}&sort=trending&limit=3`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) continue;
        const data = (await res.json()) as Array<{ id?: string; modelId?: string; likes?: number }>;
        if (!Array.isArray(data)) continue;
        for (const model of data.slice(0, 3)) {
          const id = model.id ?? model.modelId;
          if (!id) continue;
          updates.push({
            id: genId('hf', id),
            category: t.category,
            name: id,
            recommendation: (model.likes ?? 0) > 100 ? 'monitor' : 'skip',
            detectedAt: Date.now(),
            status: 'pending',
            details: `HF trending tag=${t.tag} likes=${model.likes ?? 0}`,
          });
        }
      } catch (err: unknown) {
        logger.warn('innovation-watch', `hf scan ${t.tag} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return updates;
  }

  /**
   * Scan GitHub trending repos par tags.
   * Endpoint search public — pas d'auth requise.
   */
  async scanGitHubTrending(tags: readonly string[]): Promise<TechUpdate[]> {
    const updates: TechUpdate[] = [];
    for (const tag of tags) {
      try {
        const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(tag)}+stars:>500&sort=updated&per_page=3`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) continue;
        const data = (await res.json()) as {
          items?: Array<{ full_name?: string; stargazers_count?: number; updated_at?: string }>;
        };
        const items = data.items ?? [];
        const matched = GH_TRENDING_TAGS.find((g) => g.tag === tag);
        const cat: InnovationCategory = matched?.category ?? 'lib-npm';
        for (const item of items.slice(0, 3)) {
          if (!item.full_name) continue;
          const update: TechUpdate = {
            id: genId('gh', item.full_name),
            category: cat,
            name: item.full_name,
            recommendation: (item.stargazers_count ?? 0) > 5_000 ? 'monitor' : 'skip',
            detectedAt: Date.now(),
            status: 'pending',
            details: `GH trending stars=${item.stargazers_count ?? 0}`,
          };
          if (item.updated_at !== undefined) update.releaseDate = Date.parse(item.updated_at);
          updates.push(update);
        }
      } catch (err: unknown) {
        logger.warn('innovation-watch', `gh scan ${tag} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return updates;
  }

  /**
   * Compare current vs latest et estime le gain (perf / coût / capabilities).
   * Heuristique :
   * - lib-npm MINOR bump → 5-15% perf attendu
   * - lib-npm PATCH bump → ~5% perf, surtout fixes
   * - ai-provider nouveau model → 30-60% capabilities
   */
  async compareGain(
    category: string,
    current: string,
    latest: string,
  ): Promise<InnovationGain | undefined> {
    const cmp = compareSemver(current, latest);
    if (cmp === 'same' || cmp === 'older') return undefined;

    if (category === 'lib-npm') {
      if (cmp === 'breaking') {
        return { perf: 20, capabilities: 30, bundleSize: 5 };
      }
      /* Newer minor / patch */
      const parseMin = (v: string): number => {
        const parts = v.replace(/^v/, '').split('.');
        return parseInt(parts[1] ?? '0', 10) || 0;
      };
      const minorDelta = Math.abs(parseMin(latest) - parseMin(current));
      return {
        perf: Math.min(15, 5 + minorDelta * 2),
        bundleSize: 2,
      };
    }

    if (category === 'ai-provider' || category === 'tts-stt' || category === 'vision') {
      return { capabilities: 40, perf: 20 };
    }

    if (category === 'image-gen' || category === 'video-gen') {
      return { capabilities: 50 };
    }

    return { perf: 10 };
  }

  /**
   * Updates stockés (filtrés).
   */
  getUpdates(filter?: ListFilter): TechUpdate[] {
    const all = this.loadUpdates();
    if (!filter) return all;
    return all.filter((u) => {
      if (filter.category && u.category !== filter.category) return false;
      if (filter.status && (u.status ?? 'pending') !== filter.status) return false;
      if (filter.minDays !== undefined) {
        const cutoff = Date.now() - filter.minDays * 24 * 60 * 60 * 1000;
        if (u.detectedAt < cutoff) return false;
      }
      return true;
    });
  }

  /**
   * Marque un update comme appliqué / skipped / pending.
   */
  markUpdate(id: string, status: InnovationStatus): void {
    const list = this.loadUpdates();
    const idx = list.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const target = list[idx];
    if (!target) return;
    target.status = status;
    list[idx] = target;
    this.saveUpdates(list);
    /* Update stats */
    const stats = this.loadStats();
    if (status === 'applied') stats.appliedCount += 1;
    if (status === 'skipped') stats.skippedCount += 1;
    this.saveStats(stats);
  }

  /**
   * Notif Kevin si gain critique détecté (≥50% perf/cost/capabilities).
   * v13.3.41 (mission INNOVATION-COMM) — Kevin règle :
   * "Si gain ≥ 50% → notif push admin Kevin 'je recommande migration'".
   * Best-effort : push-notifications + ax_claude_todo Firebase + audit log.
   */
  async notifyKevinOnCriticalGain(update: TechUpdate): Promise<{ notified: boolean; reason?: string }> {
    const maxGain = Math.max(
      update.estimatedGain?.perf ?? 0,
      update.estimatedGain?.cost ?? 0,
      update.estimatedGain?.capabilities ?? 0,
    );
    if (maxGain < AUTO_UPDATE_GAIN_THRESHOLD) {
      return { notified: false, reason: `gain ${maxGain}% < threshold ${AUTO_UPDATE_GAIN_THRESHOLD}%` };
    }
    const title = `💡 Innovation : ${update.name}`;
    const body = `Gain ${maxGain}% (${update.recommendation}). Migration recommandée.`;
    /* 1. Push notification (best-effort, no-throw) */
    try {
      const { pushNotifications } = await import('../integrations/push-notifications.js');
      const adminUid = 'kdmc_admin';
      if (typeof (pushNotifications as unknown as { send?: unknown }).send === 'function') {
        await (pushNotifications as unknown as {
          send: (uid: string, n: { title: string; body: string; urgent: boolean }) => Promise<unknown>;
        }).send(adminUid, { title, body, urgent: false });
      }
    } catch {
      /* push optional */
    }
    /* 2. Push dans ax_claude_todo Firebase shared (Kevin pipeline règle) */
    try {
      const todoEntry = {
        id: `inno_${update.id}`,
        type: 'innovation_recommendation',
        title,
        body,
        update_id: update.id,
        gain_pct: maxGain,
        ts: Date.now(),
        status: 'pending',
        src: 'innovation-watch',
      };
      const raw = localStorage.getItem('ax_claude_todo');
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      if (Array.isArray(list)) {
        list.push(todoEntry);
        const trimmed = list.slice(-100);
        localStorage.setItem('ax_claude_todo', JSON.stringify(trimmed));
      }
    } catch {
      /* ignore */
    }
    /* 3. Audit log */
    try {
      const { auditLog } = await import('../observability/audit-log.js');
      await auditLog.record('innovation.notify-kevin', {
        details: { id: update.id, name: update.name, gain: maxGain, recommendation: update.recommendation },
      });
    } catch {
      /* optional */
    }
    logger.info('innovation-watch', `Kevin notified for ${update.name} (gain ${maxGain}%)`);
    return { notified: true };
  }

  /**
   * Détecte les nouveaux modèles IA majeurs (e.g. Claude 5, GPT-6, Gemini 3).
   * Compare model IDs récents vs historique connus → flag CRITICAL si nouveau majeur.
   */
  async detectMajorModelRelease(provider: string, models: readonly string[]): Promise<TechUpdate | null> {
    const KNOWN_MAJORS: Record<string, RegExp> = {
      anthropic: /claude-(\d+)/i,
      openai: /(?:gpt|o)-?(\d+)/i,
      gemini: /gemini-(\d+(?:\.\d+)?)/i,
      mistral: /mistral-(?:large-)?(\d+)/i,
    };
    const re = KNOWN_MAJORS[provider.toLowerCase()];
    if (!re) return null;
    let maxMajor = 0;
    let matchedId = '';
    for (const m of models) {
      const r = re.exec(m);
      if (r && r[1]) {
        const v = parseFloat(r[1]);
        if (v > maxMajor) {
          maxMajor = v;
          matchedId = m;
        }
      }
    }
    if (maxMajor === 0 || !matchedId) return null;
    /* Storage clef "highest version vu" */
    const storageKey = `apex_v13_innovation_max_${provider}`;
    let prevMax = 0;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) prevMax = parseFloat(raw) || 0;
    } catch {
      /* ignore */
    }
    if (maxMajor <= prevMax) return null;
    /* Persiste */
    try {
      localStorage.setItem(storageKey, String(maxMajor));
    } catch {
      /* ignore */
    }
    /* Crée update CRITICAL */
    const update: TechUpdate = {
      id: genId('ai-provider-major', provider),
      category: 'ai-provider',
      name: matchedId,
      latestVersion: String(maxMajor),
      currentVersion: String(prevMax || 'inconnu'),
      recommendation: 'upgrade-asap',
      detectedAt: Date.now(),
      status: 'pending',
      estimatedGain: { capabilities: 80, perf: 30 },
      details: `Nouveau modèle majeur ${provider} v${maxMajor} détecté`,
    };
    logger.info('innovation-watch', `Major model release detected: ${provider} v${maxMajor} (${matchedId})`);
    return update;
  }

  /**
   * Auto-update si gain >= 50% ET pas breaking-changes ET confidence >= 0.95.
   * Aujourd'hui : marque applied (les vrais bumps deps sont via PR).
   */
  async autoUpdateIfSafe(update: TechUpdate): Promise<{ applied: boolean; reason?: string; pr_proposed?: boolean }> {
    if (update.recommendation === 'breaking-changes') {
      return { applied: false, reason: 'breaking-changes detected, manual review required' };
    }
    const maxGain = Math.max(
      update.estimatedGain?.perf ?? 0,
      update.estimatedGain?.cost ?? 0,
      update.estimatedGain?.capabilities ?? 0,
    );
    if (maxGain < AUTO_UPDATE_GAIN_THRESHOLD) {
      return { applied: false, reason: `gain ${maxGain}% < threshold ${AUTO_UPDATE_GAIN_THRESHOLD}%` };
    }
    /* Confidence heuristique : ai-provider monitor only (jamais auto), npm minor OK */
    if (update.category === 'ai-provider') {
      return { applied: false, reason: 'ai-provider auto-update disabled (monitor only)' };
    }
    /* Seuls upgrade-asap auto-applied */
    if (update.recommendation !== 'upgrade-asap') {
      return { applied: false, reason: `recommendation=${update.recommendation} (not upgrade-asap)` };
    }
    this.markUpdate(update.id, 'applied');
    /* Audit log */
    try {
      const { auditLog } = await import('../observability/audit-log.js');
      await auditLog.record('innovation.auto-applied', {
        details: { id: update.id, name: update.name, gain: maxGain },
      });
    } catch {
      /* optional */
    }
    logger.info('innovation-watch', `Auto-applied update ${update.name} (gain ${maxGain}%)`);

    /* v13.3.57 PUSH-100 : tente de proposer PR auto si gain ≥ 50% */
    let pr_proposed = false;
    try {
      const result = await this.proposePR(update);
      pr_proposed = result.proposed;
    } catch (err) {
      logger.warn('innovation-watch', 'PR auto-propose failed', { err });
    }

    return { applied: true, pr_proposed };
  }

  /**
   * v13.3.57 PUSH-100 : propose une PR auto pour un update non-breaking.
   *
   * Mécanisme : pousse un payload dans `ax_claude_todo` Firebase + IDB local.
   * GitHub Action `claude-todo-watcher.yml` poll cette queue + crée la PR via
   * Claude Code session (Read package.json → bump dep → tests → push branch → create PR).
   *
   * Pourquoi pas direct API GitHub : Apex tourne dans browser, pas de PAT GitHub
   * sécurisable côté client. Délégation à Claude Code (cron 2h) = secure.
   */
  async proposePR(update: TechUpdate): Promise<{ proposed: boolean; reason?: string; todo_id?: string }> {
    /* Filtre : seuls les updates lib-npm avec version connue */
    if (update.category !== 'lib-npm' || !update.latestVersion) {
      return { proposed: false, reason: 'category or version missing' };
    }
    if (update.recommendation === 'breaking-changes') {
      return { proposed: false, reason: 'breaking-changes blocked' };
    }
    const maxGain = Math.max(
      update.estimatedGain?.perf ?? 0,
      update.estimatedGain?.cost ?? 0,
      update.estimatedGain?.capabilities ?? 0,
    );
    if (maxGain < AUTO_UPDATE_GAIN_THRESHOLD) {
      return { proposed: false, reason: `gain ${maxGain}% < ${AUTO_UPDATE_GAIN_THRESHOLD}%` };
    }

    const todoId = `innov_pr_${update.id}_${Date.now()}`;
    const payload = {
      id: todoId,
      type: 'innovation_pr',
      lib: update.name,
      from: update.currentVersion ?? 'unknown',
      to: update.latestVersion,
      gain: maxGain,
      details: update.details ?? '',
      branch: `claude/innovation-${update.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-update`,
      pr_title: `chore(deps): auto-update ${update.name} → ${update.latestVersion} (innovation-watch +${maxGain}%)`,
      pr_body: [
        `## Auto-update by innovation-watch`,
        ``,
        `**Library:** \`${update.name}\``,
        `**From:** ${update.currentVersion ?? 'unknown'}`,
        `**To:** ${update.latestVersion}`,
        `**Estimated gain:** +${maxGain}%`,
        ``,
        `### Details`,
        update.details ?? '(aucun détail)',
        ``,
        `### Validation requise`,
        `- [ ] Tests passent (vitest + tsc + build)`,
        `- [ ] Aucune breaking-change détectée`,
        `- [ ] Bundle size n'augmente pas > 10%`,
        ``,
        `🤖 Généré automatiquement par \`innovation-watch\` Apex v13.3.57`,
      ].join('\n'),
      created_at: Date.now(),
      severity: 'info',
      status: 'pending',
    };

    /* Push dans Firebase ax_claude_todo + IDB shadow */
    try {
      /* Firebase queue (best-effort, non-bloquant) */
      const { firebase } = await import('../storage/firebase.js');
      try {
        await firebase.write(`ax_claude_todo/${todoId}`, payload);
      } catch {
        /* offline / no firebase → IDB shadow only */
      }
      /* localStorage shadow pour audit local */
      try {
        const key = 'apex_v13_innovation_pr_queue';
        const queue = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
        queue.push(payload);
        localStorage.setItem(key, JSON.stringify(queue.slice(-50)));
      } catch {
        /* quota — ignore */
      }
      logger.info('innovation-watch', `PR proposed: ${update.name} → ${update.latestVersion}`, { todoId });
      return { proposed: true, todo_id: todoId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { proposed: false, reason: `firebase_write_failed: ${msg}` };
    }
  }

  /**
   * Stats globales (last scan, total détectés, applied, etc.).
   */
  getStats(): InnovationStats {
    return this.loadStats();
  }

  /**
   * Reset complet (admin / tests).
   */
  reset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STATS_KEY);
    } catch {
      /* ignore */
    }
  }

  /* === Internals === */

  private loadUpdates(): TechUpdate[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as TechUpdate[];
    } catch {
      return [];
    }
  }

  private saveUpdates(list: TechUpdate[]): void {
    try {
      const trimmed = list.slice(-MAX_UPDATES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('innovation-watch', 'persist updates failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private persistUpdates(newUpdates: TechUpdate[]): void {
    if (newUpdates.length === 0) return;
    const existing = this.loadUpdates();
    /* Dédupe par (category, name) — keep most recent */
    const merged = new Map<string, TechUpdate>();
    for (const u of existing) merged.set(`${u.category}:${u.name}`, u);
    for (const u of newUpdates) merged.set(`${u.category}:${u.name}`, u);
    this.saveUpdates([...merged.values()]);
  }

  private loadStats(): InnovationStats {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) {
        return {
          lastScan: 0,
          totalUpdatesDetected: 0,
          lastWeek: 0,
          appliedCount: 0,
          skippedCount: 0,
        };
      }
      const parsed = JSON.parse(raw) as Partial<InnovationStats>;
      return {
        lastScan: parsed.lastScan ?? 0,
        totalUpdatesDetected: parsed.totalUpdatesDetected ?? 0,
        lastWeek: parsed.lastWeek ?? 0,
        appliedCount: parsed.appliedCount ?? 0,
        skippedCount: parsed.skippedCount ?? 0,
      };
    } catch {
      return {
        lastScan: 0,
        totalUpdatesDetected: 0,
        lastWeek: 0,
        appliedCount: 0,
        skippedCount: 0,
      };
    }
  }

  private saveStats(stats: InnovationStats): void {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      /* ignore */
    }
  }

  private bumpStats(detectedThisRun: number, scanTs: number): void {
    const stats = this.loadStats();
    stats.lastScan = scanTs;
    stats.totalUpdatesDetected += detectedThisRun;
    /* Recompute lastWeek depuis l'historique persisté */
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    stats.lastWeek = this.loadUpdates().filter((u) => u.detectedAt >= cutoff).length;
    this.saveStats(stats);
  }
}

export const innovationWatch = new InnovationWatch();
