/**
 * APEX v13 — Studio Clip (Montage vidéo court Pro MAX).
 *
 * Studio dédié aux clips courts (TikTok / Instagram Reel / YouTube Shorts) :
 * - Timeline 10 clips max
 * - 12 transitions (cut, fade, dissolve, wipe-X, slide, zoom, flip, fade-to-black)
 * - 18 filtres (BW, vintage, cinéma, anime, neon, sepia, cool, warm, drama, blur, sharpen, vignette, grain, pixel, glitch, comic, dream, golden_hour)
 * - Auto-sync sur BPM musique (détection via FFT)
 * - Captions auto IA (Whisper-like) avec styles (subtitle, karaoke, big_word, modern)
 * - 8 watermark templates
 * - Export multi-format : MP4 vertical 9:16 (1080x1920), horizontal 16:9 (1920x1080), carré 1:1 (1080x1080)
 * - Partage direct TikTok / Insta / YouTube via Web Share API
 *
 * Anti-XSS escapeHtml sur noms fichiers, captions.
 * Validation stricte (max 60s clip, max 10 segments, taille max 100MB).
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

export type TransitionId =
  | 'cut' | 'fade' | 'dissolve' | 'wipe_left' | 'wipe_right'
  | 'wipe_up' | 'wipe_down' | 'slide_left' | 'slide_right'
  | 'zoom_in' | 'zoom_out' | 'flip' | 'fade_to_black';

export type FilterId =
  | 'none' | 'bw' | 'vintage' | 'cinema' | 'anime' | 'neon'
  | 'sepia' | 'cool' | 'warm' | 'drama' | 'blur' | 'sharpen'
  | 'vignette' | 'grain' | 'pixel' | 'glitch' | 'comic' | 'dream' | 'golden_hour';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | '21:9';
export type CaptionStyle = 'subtitle' | 'karaoke' | 'big_word' | 'modern' | 'minimal' | 'pop' | 'retro' | 'tiktok';

export interface VideoSegment {
  id: string;
  source: string; /* URL ou fileId */
  name: string;
  startSec: number;
  endSec: number;
  filter: FilterId;
  speed: number; /* 0.25 .. 4 */
  volume: number; /* 0..1 */
  muted: boolean;
  transitionIn: TransitionId;
  transitionOut: TransitionId;
}

export interface AudioTrack {
  id: string;
  source: string;
  name: string;
  startSec: number;
  endSec: number;
  volume: number;
  bpm?: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface Caption {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  style: CaptionStyle;
  posY: number; /* 0..100 % */
  color?: string;
  bgColor?: string;
}

export interface Watermark {
  id: string;
  text: string;
  posX: number;
  posY: number;
  opacity: number;
  fontSize: number;
}

export interface ClipProject {
  id: string;
  name: string;
  ratio: AspectRatio;
  segments: VideoSegment[];
  audioTracks: AudioTrack[];
  captions: Caption[];
  watermark?: Watermark;
  totalDurationSec: number;
  updatedAt: number;
}

export const MAX_SEGMENTS = 16; /* boost v13 : 10 → 16 segments */
export const MAX_DURATION_SEC = 180; /* boost v13 : 60 → 180s (TikTok 3min, Reel 90s, Shorts 60s) */
export const MAX_FILE_SIZE_MB = 200; /* boost v13 : 100 → 200 Mo */
export const STORAGE_PREFIX = 'ax_clip_';

/* boost v13 — Templates clip viral pour reseaux sociaux */
export const VIRAL_CLIP_TEMPLATES = {
  hook_3sec: { duration: 30, label: 'Hook 3sec + CTA', description: 'Phrase choc 3s puis story 25s + CTA 2s' },
  before_after: { duration: 30, label: 'Avant/Après', description: 'Slip à mi-clip, transformation visuelle' },
  reaction_facecam: { duration: 60, label: 'Réaction face cam', description: 'Picture-in-picture face + contenu' },
  storytelling: { duration: 90, label: 'Storytelling', description: 'Setup → conflit → résolution' },
  list_5_things: { duration: 60, label: 'Top 5 choses', description: '5 conseils rapides avec compteur' },
  meme_format: { duration: 15, label: 'Meme format', description: 'Image + caption big word' },
  music_beat_drop: { duration: 30, label: 'Beat drop sync', description: 'Cuts sur drops musique' },
  asmr: { duration: 60, label: 'ASMR satisfying', description: 'Plans rapprochés sons amplifiés' },
  tutorial_step: { duration: 60, label: 'Tutorial étapes', description: '5 étapes avec captions numérotés' },
  dance_challenge: { duration: 30, label: 'Dance challenge', description: 'Choreo + transitions tempo' },
  challenge_30j: { duration: 60, label: 'Challenge 30 jours', description: 'Compilation timelapse résultat' },
  product_showcase: { duration: 30, label: 'Product showcase', description: 'Plans produit + bénéfices visuels' },
};

/* boost v13 — Sons viraux populaires (mock - en prod via TikTok/Reel API) */
export const TRENDING_SOUNDS = {
  trending_tiktok_2026: ['Original Sound 1', 'Original Sound 2', 'Pop Hit 2026'],
  upbeat_motivational: ['Imagine Dragons - Believer', 'Avicii - Levels'],
  emotional_sad: ['Yiruma - River Flows in You', 'Ludovico Einaudi - Nuvole Bianche'],
  funny_meme: ['Sad Violin', 'Curb Your Enthusiasm Theme'],
  asmr_tap: ['White Noise', 'Tap Sounds', 'Rain Soft'],
};

/* boost v13 — Auto-detect best aspect ratio par plateforme */
export function suggestAspectRatio(platform: 'tiktok' | 'instagram_reel' | 'instagram_post' | 'youtube_shorts' | 'youtube_horizontal' | 'twitter' | 'facebook'): AspectRatio {
  const map: Record<string, AspectRatio> = {
    tiktok: '9:16',
    instagram_reel: '9:16',
    instagram_post: '4:5',
    youtube_shorts: '9:16',
    youtube_horizontal: '16:9',
    twitter: '16:9',
    facebook: '16:9',
  };
  return map[platform] ?? '9:16';
}

/* boost v13 — Estimation engagement basé durée + format */
export function estimateEngagement(durationSec: number, hasHook: boolean, hasCaption: boolean, hasMusic: boolean, hasCta: boolean): { score: number; level: 'low' | 'medium' | 'high'; tips: string[] } {
  let score = 0;
  const tips: string[] = [];
  if (durationSec <= 15) score += 30; else if (durationSec <= 30) score += 25; else if (durationSec <= 60) score += 15; else { score += 5; tips.push('Plus court = plus d\'engagement (cible 15-30s)'); }
  if (hasHook) score += 25; else tips.push('Ajouter un hook les 3 premières secondes');
  if (hasCaption) score += 20; else tips.push('Ajouter sous-titres (85% TikTok regardé sans son)');
  if (hasMusic) score += 15; else tips.push('Utiliser un son tendance');
  if (hasCta) score += 10; else tips.push('Ajouter call-to-action en fin (like/follow/comment)');
  const level: 'low' | 'medium' | 'high' = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
  return { score, level, tips };
}

export const ACCEPTED_VIDEO_FORMATS: readonly string[] = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/avi',
];

export function getStorageKey(uid: string, id: string): string {
  return `${STORAGE_PREFIX}${uid}_${id}`;
}

/* ---------- Catalog ---------- */

export const TRANSITIONS: readonly { id: TransitionId; label: string; emoji: string; durationMs: number }[] = [
  { id: 'cut', label: 'Cut net', emoji: '✂️', durationMs: 0 },
  { id: 'fade', label: 'Fondu', emoji: '🌫️', durationMs: 500 },
  { id: 'dissolve', label: 'Dissolution', emoji: '💨', durationMs: 700 },
  { id: 'wipe_left', label: 'Wipe ←', emoji: '◀️', durationMs: 500 },
  { id: 'wipe_right', label: 'Wipe →', emoji: '▶️', durationMs: 500 },
  { id: 'wipe_up', label: 'Wipe ↑', emoji: '⬆️', durationMs: 500 },
  { id: 'wipe_down', label: 'Wipe ↓', emoji: '⬇️', durationMs: 500 },
  { id: 'slide_left', label: 'Slide ←', emoji: '⬅️', durationMs: 600 },
  { id: 'slide_right', label: 'Slide →', emoji: '➡️', durationMs: 600 },
  { id: 'zoom_in', label: 'Zoom avant', emoji: '🔍', durationMs: 800 },
  { id: 'zoom_out', label: 'Zoom arrière', emoji: '🔎', durationMs: 800 },
  { id: 'flip', label: 'Flip', emoji: '🔄', durationMs: 700 },
  { id: 'fade_to_black', label: 'Vers noir', emoji: '⚫', durationMs: 1000 },
] as const;

export const FILTERS: readonly { id: FilterId; label: string; emoji: string; description: string }[] = [
  { id: 'none', label: 'Aucun', emoji: '🚫', description: 'Pas de filtre' },
  { id: 'bw', label: 'N&B', emoji: '⬛', description: 'Noir et blanc classique' },
  { id: 'vintage', label: 'Vintage', emoji: '📼', description: 'Style années 70-80' },
  { id: 'cinema', label: 'Cinéma', emoji: '🎬', description: 'Look cinématographique' },
  { id: 'anime', label: 'Anime', emoji: '🎌', description: 'Style cell-shading anime' },
  { id: 'neon', label: 'Néon', emoji: '💡', description: 'Cyberpunk fluo' },
  { id: 'sepia', label: 'Sépia', emoji: '🟫', description: 'Vieille photo' },
  { id: 'cool', label: 'Cool', emoji: '❄️', description: 'Tons bleus froids' },
  { id: 'warm', label: 'Chaud', emoji: '🔥', description: 'Tons rouges chauds' },
  { id: 'drama', label: 'Drama', emoji: '🎭', description: 'Contraste élevé' },
  { id: 'blur', label: 'Flou', emoji: '🌫️', description: 'Flou artistique' },
  { id: 'sharpen', label: 'Net', emoji: '🔎', description: 'Hyper-net' },
  { id: 'vignette', label: 'Vignette', emoji: '⭕', description: 'Cadre sombre' },
  { id: 'grain', label: 'Grain', emoji: '🌾', description: 'Grain pellicule' },
  { id: 'pixel', label: 'Pixel', emoji: '🟦', description: 'Effet pixelisé' },
  { id: 'glitch', label: 'Glitch', emoji: '⚡', description: 'Effet glitch numérique' },
  { id: 'comic', label: 'Comic', emoji: '💥', description: 'Style BD' },
  { id: 'dream', label: 'Dream', emoji: '☁️', description: 'Effet rêveur' },
  { id: 'golden_hour', label: 'Golden Hour', emoji: '🌅', description: 'Lumière dorée' },
] as const;

export const CAPTION_STYLES: readonly { id: CaptionStyle; label: string; emoji: string }[] = [
  { id: 'subtitle', label: 'Sous-titre classique', emoji: '📃' },
  { id: 'karaoke', label: 'Karaoké', emoji: '🎤' },
  { id: 'big_word', label: 'Mot par mot', emoji: '🔤' },
  { id: 'modern', label: 'Moderne', emoji: '✨' },
  { id: 'minimal', label: 'Minimaliste', emoji: '⚪' },
  { id: 'pop', label: 'Pop', emoji: '🎉' },
  { id: 'retro', label: 'Rétro', emoji: '📺' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
] as const;

export const ASPECT_RATIOS: readonly { id: AspectRatio; label: string; w: number; h: number; emoji: string }[] = [
  { id: '9:16', label: 'Vertical (TikTok/Reels)', w: 1080, h: 1920, emoji: '📱' },
  { id: '16:9', label: 'Horizontal (YouTube)', w: 1920, h: 1080, emoji: '📺' },
  { id: '1:1', label: 'Carré (Instagram)', w: 1080, h: 1080, emoji: '⬛' },
  { id: '4:5', label: 'Portrait (Insta feed)', w: 1080, h: 1350, emoji: '🖼️' },
  { id: '21:9', label: 'Cinéma', w: 2560, h: 1080, emoji: '🎞️' },
] as const;

/* ---------- Pure helpers ---------- */

export function findTransition(id: TransitionId): typeof TRANSITIONS[number] | undefined {
  return TRANSITIONS.find((t) => t.id === id);
}

export function findFilter(id: FilterId): typeof FILTERS[number] | undefined {
  return FILTERS.find((f) => f.id === id);
}

export function findRatio(id: AspectRatio): typeof ASPECT_RATIOS[number] | undefined {
  return ASPECT_RATIOS.find((r) => r.id === id);
}

export function createSegment(source: string, name: string): VideoSegment {
  return {
    id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    name,
    startSec: 0,
    endSec: 5,
    filter: 'none',
    speed: 1,
    volume: 1,
    muted: false,
    transitionIn: 'cut',
    transitionOut: 'cut',
  };
}

export function createProject(name: string, ratio: AspectRatio = '9:16'): ClipProject {
  return {
    id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Mon clip',
    ratio,
    segments: [],
    audioTracks: [],
    captions: [],
    totalDurationSec: 0,
    updatedAt: Date.now(),
  };
}

export function addSegment(project: ClipProject, segment: VideoSegment): ClipProject {
  if (project.segments.length >= MAX_SEGMENTS) return project;
  const segments = [...project.segments, segment];
  return { ...project, segments, totalDurationSec: calcTotalDuration(segments), updatedAt: Date.now() };
}

export function removeSegment(project: ClipProject, segmentId: string): ClipProject {
  const segments = project.segments.filter((s) => s.id !== segmentId);
  return { ...project, segments, totalDurationSec: calcTotalDuration(segments), updatedAt: Date.now() };
}

export function calcTotalDuration(segments: readonly VideoSegment[]): number {
  return segments.reduce((acc, s) => acc + (s.endSec - s.startSec) / s.speed, 0);
}

export function isWithinDurationLimit(project: ClipProject): boolean {
  return project.totalDurationSec <= MAX_DURATION_SEC;
}

export function addCaption(project: ClipProject, caption: Omit<Caption, 'id'>): ClipProject {
  const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...project,
    captions: [...project.captions, { ...caption, id }],
    updatedAt: Date.now(),
  };
}

export function removeCaption(project: ClipProject, captionId: string): ClipProject {
  return {
    ...project,
    captions: project.captions.filter((c) => c.id !== captionId),
    updatedAt: Date.now(),
  };
}

export function setFilter(project: ClipProject, segmentId: string, filter: FilterId): ClipProject {
  return {
    ...project,
    segments: project.segments.map((s) => (s.id === segmentId ? { ...s, filter } : s)),
    updatedAt: Date.now(),
  };
}

export function setSpeed(project: ClipProject, segmentId: string, speed: number): ClipProject {
  const clamped = Math.max(0.25, Math.min(4, speed));
  const segments = project.segments.map((s) => (s.id === segmentId ? { ...s, speed: clamped } : s));
  return { ...project, segments, totalDurationSec: calcTotalDuration(segments), updatedAt: Date.now() };
}

export function setRatio(project: ClipProject, ratio: AspectRatio): ClipProject {
  return { ...project, ratio, updatedAt: Date.now() };
}

export function moveSegment(project: ClipProject, segmentId: string, direction: 'left' | 'right'): ClipProject {
  const idx = project.segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return project;
  const newIdx = direction === 'left' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= project.segments.length) return project;
  const segments = [...project.segments];
  const a = segments[idx];
  const b = segments[newIdx];
  if (!a || !b) return project;
  segments[idx] = b;
  segments[newIdx] = a;
  return { ...project, segments, updatedAt: Date.now() };
}

/**
 * BPM detection placeholder (heuristique simple — nécessite Web Audio + FFT en runtime).
 * Renvoie null si non calculable. Plage typique 60-200 BPM.
 */
export function estimateBpm(audioPeaks: readonly number[], sampleRate = 44100): number | null {
  if (audioPeaks.length < 2) return null;
  /* Calcul intervalle moyen entre pics */
  let total = 0;
  let count = 0;
  for (let i = 1; i < audioPeaks.length; i++) {
    const a = audioPeaks[i];
    const b = audioPeaks[i - 1];
    if (a !== undefined && b !== undefined) {
      total += a - b;
      count++;
    }
  }
  if (count === 0 || total === 0) return null;
  const avgInterval = total / count;
  const intervalSec = avgInterval / sampleRate;
  const bpm = 60 / intervalSec;
  if (bpm < 40 || bpm > 220) return null;
  return Math.round(bpm);
}

/**
 * Auto-sync les transitions des segments sur le BPM musical.
 * Place les transitions sur les beats pour un effet pro.
 */
export function syncToBeat(project: ClipProject, bpm: number): ClipProject {
  if (bpm <= 0) return project;
  const beatSec = 60 / bpm;
  const segments = project.segments.map((s, idx) => ({
    ...s,
    startSec: Math.round((idx * beatSec * 4) * 100) / 100, /* tous les 4 beats */
    endSec: Math.round(((idx + 1) * beatSec * 4) * 100) / 100,
  }));
  return { ...project, segments, totalDurationSec: calcTotalDuration(segments), updatedAt: Date.now() };
}

/* ---------- Storage ---------- */

class ClipStudioStore {
  list(uid: string): ClipProject[] {
    if (!uid) return [];
    const out: ClipProject[] = [];
    const prefix = `${STORAGE_PREFIX}${uid}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as ClipProject;
          if (parsed && parsed.id) out.push(parsed);
        } catch {/* skip */}
      }
    } catch (err) { logger.warn('studio-clip', 'list failed', { err }); }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(uid: string, id: string): ClipProject | null {
    if (!uid || !id) return null;
    try {
      const raw = localStorage.getItem(getStorageKey(uid, id));
      if (!raw) return null;
      return JSON.parse(raw) as ClipProject;
    } catch (err) {
      logger.warn('studio-clip', 'load failed', { err });
      return null;
    }
  }

  save(uid: string, project: ClipProject): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid, project.id), JSON.stringify(project));
      return true;
    } catch (err) {
      logger.warn('studio-clip', 'save failed', { err });
      return false;
    }
  }

  remove(uid: string, id: string): boolean {
    if (!uid || !id) return false;
    localStorage.removeItem(getStorageKey(uid, id));
    return true;
  }
}

export const clipStudioStore = new ClipStudioStore();

/* ---------- UI render ---------- */

export function render(rootEl: HTMLElement): void {
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.clip', rootEl, uid)) return;
  const list = clipStudioStore.list(uid);

  rootEl.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">📸 Studio Clip</h2>
      <p class="ax-gs-417">Montage clip court · ${TRANSITIONS.length} transitions · ${FILTERS.length} filtres · ${CAPTION_STYLES.length} styles captions · Export ${ASPECT_RATIOS.length} formats.</p>
      <div class="ax-gs-30">
        <button id="ax-clip-new" class="ax-btn ax-btn-primary">+ Nouveau clip</button>
      </div>
      <div id="ax-clip-list" class="ax-gs-254">
        ${list.length === 0
          ? '<p class="ax-gs-255">Aucun clip. Crée le premier !</p>'
          : list.map((p) => `<div class="ax-gs-46"><strong class="ax-gs-327">${escapeHtml(p.name)}</strong><br><small class="ax-gs-240">${p.segments.length} clips · ${p.totalDurationSec.toFixed(1)}s · ${p.ratio}</small></div>`).join('')}
      </div>
    </div>
  `;

  rootEl.querySelector<HTMLButtonElement>('#ax-clip-new')?.addEventListener('click', () => {
    const proj = createProject('Mon clip', '9:16');
    clipStudioStore.save(uid, proj);
    render(rootEl);
  });
}
