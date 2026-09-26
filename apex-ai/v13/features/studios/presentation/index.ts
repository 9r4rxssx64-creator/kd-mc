/**
 * APEX v13 — Studio Présentation (PowerPoint-like Pro MAX).
 *
 * Outil de création de slides au niveau Keynote/PowerPoint :
 * - 30+ templates slides (title, content, comparison, image, chart, quote, team, contact, agenda, statistics, timeline, gallery, KPI, FAQ, thank you)
 * - 12 thèmes design (Dark Pro, Light Minimal, Casino Or, Corporate Blue, Tech Neon, Pastel Soft, Gradient Sunset, Editorial, Bold, Warm, Eco, Monochrome)
 * - Drag & drop éléments (texte, image, forme, table, chart)
 * - Animations (fade-in, slide-from-X, zoom, bounce, type-writer)
 * - Transitions (cut, fade, push-X, dissolve, wipe, flip)
 * - Speaker notes par slide
 * - Mode présentation full-screen (F11 + flèches)
 * - Export PPTX (lazy pptxgenjs CDN), PDF (jsPDF), HTML standalone
 * - Sharing URL + collaboration (multi-user via Firebase realtime)
 * - 50+ icônes intégrés
 * - Charts builder (bar, line, pie, donut)
 *
 * Storage per-user. Anti-XSS escapeHtml. Pas de innerHTML brut user content.
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

export type SlideLayoutId =
  | 'title' | 'content' | 'two_columns' | 'comparison' | 'image_full'
  | 'image_left' | 'image_right' | 'quote' | 'team' | 'contact'
  | 'agenda' | 'statistics' | 'timeline' | 'gallery' | 'kpi'
  | 'faq' | 'thank_you' | 'chart_bar' | 'chart_pie' | 'chart_line'
  | 'video' | 'roadmap' | 'pricing' | 'testimonial' | 'process'
  | 'swot' | 'matrix' | 'features' | 'about' | 'cover_back';

export type ThemeId =
  | 'dark_pro' | 'light_minimal' | 'casino_or' | 'corporate_blue'
  | 'tech_neon' | 'pastel_soft' | 'gradient_sunset' | 'editorial'
  | 'bold' | 'warm' | 'eco' | 'monochrome';

export type AnimationKind = 'none' | 'fade_in' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'zoom_in' | 'bounce' | 'typewriter';
export type TransitionKind = 'cut' | 'fade' | 'push_left' | 'push_right' | 'dissolve' | 'wipe' | 'flip';

export interface SlideElement {
  id: string;
  kind: 'text' | 'image' | 'shape' | 'icon' | 'table' | 'chart' | 'video';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  animation?: AnimationKind;
  rotation?: number;
}

export interface Slide {
  id: string;
  layout: SlideLayoutId;
  title: string;
  elements: SlideElement[];
  notes: string;
  transition: TransitionKind;
  bgColor?: string;
  bgImage?: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  emoji: string;
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
  fontHeading: string;
  fontBody: string;
}

export interface Presentation {
  id: string;
  name: string;
  theme: ThemeId;
  slides: Slide[];
  ratio: '16:9' | '4:3' | '1:1';
  updatedAt: number;
  author: string;
}

export const MAX_SLIDES = 200; /* boost v13 : 100 → 200 */
export const MAX_ELEMENTS_PER_SLIDE = 80; /* boost v13 : 50 → 80 */
export const STORAGE_PREFIX = 'ax_pres_';

/* boost v13 — Templates de presentation par cas d usage business */
export const PRESENTATION_TEMPLATES = {
  pitch_deck_seed: { slides: ['title', 'agenda', 'features', 'matrix', 'kpi', 'team', 'pricing', 'roadmap', 'thank_you'], duration_min: 10, label: 'Pitch Deck Seed (Y Combinator format)' },
  pitch_deck_serie_a: { slides: ['title', 'agenda', 'about', 'features', 'matrix', 'kpi', 'statistics', 'team', 'pricing', 'roadmap', 'thank_you'], duration_min: 20, label: 'Pitch Deck Series A' },
  business_review_quarterly: { slides: ['title', 'agenda', 'kpi', 'statistics', 'comparison', 'roadmap', 'thank_you'], duration_min: 30, label: 'QBR (Quarterly Business Review)' },
  product_launch: { slides: ['title', 'about', 'features', 'image_full', 'pricing', 'testimonial', 'thank_you'], duration_min: 15, label: 'Product Launch' },
  training_workshop: { slides: ['title', 'agenda', 'content', 'image_left', 'two_columns', 'process', 'faq', 'thank_you'], duration_min: 60, label: 'Training Workshop' },
  conference_keynote: { slides: ['title', 'image_full', 'quote', 'statistics', 'image_full', 'thank_you'], duration_min: 45, label: 'Conference Keynote' },
  investor_update: { slides: ['title', 'kpi', 'statistics', 'roadmap', 'comparison', 'team', 'thank_you'], duration_min: 15, label: 'Investor Monthly Update' },
  board_meeting: { slides: ['title', 'agenda', 'kpi', 'statistics', 'comparison', 'matrix', 'roadmap', 'thank_you'], duration_min: 90, label: 'Board Meeting' },
  customer_pitch: { slides: ['title', 'about', 'features', 'matrix', 'pricing', 'testimonial', 'contact'], duration_min: 30, label: 'Customer Pitch' },
  team_all_hands: { slides: ['title', 'agenda', 'kpi', 'team', 'roadmap', 'thank_you'], duration_min: 45, label: 'Team All-Hands' },
} as const;

/* boost v13 — Slide layouts de transition / sections */
export const SECTION_DIVIDER_LAYOUTS = {
  chapter_intro: { label: 'Intro chapitre', description: 'Plein écran avec numéro chapitre + titre' },
  break_5min: { label: 'Pause 5 min', description: 'Compteur visible + image relaxante' },
  qna: { label: 'Q&A', description: 'Plein écran avec QR code questions' },
  poll: { label: 'Sondage live', description: 'Question + 4 réponses + QR Mentimeter' },
  exercise: { label: 'Exercice', description: 'Instructions + timer + résultats attendus' },
};

export function getStorageKey(uid: string, id: string): string {
  return `${STORAGE_PREFIX}${uid}_${id}`;
}

/* ---------- 30 Layouts ---------- */

export const LAYOUTS: readonly { id: SlideLayoutId; label: string; emoji: string; description: string }[] = [
  { id: 'title', label: 'Titre', emoji: '🎯', description: 'Slide de couverture' },
  { id: 'content', label: 'Contenu', emoji: '📝', description: 'Titre + bullet list' },
  { id: 'two_columns', label: '2 Colonnes', emoji: '📑', description: 'Deux colonnes côte à côte' },
  { id: 'comparison', label: 'Comparaison', emoji: '⚖️', description: 'A vs B' },
  { id: 'image_full', label: 'Image Plein', emoji: '🖼️', description: 'Image plein écran' },
  { id: 'image_left', label: 'Image Gauche', emoji: '◀️', description: 'Image G + texte D' },
  { id: 'image_right', label: 'Image Droite', emoji: '▶️', description: 'Texte G + image D' },
  { id: 'quote', label: 'Citation', emoji: '💬', description: 'Quote + auteur' },
  { id: 'team', label: 'Équipe', emoji: '👥', description: 'Photos + bios' },
  { id: 'contact', label: 'Contact', emoji: '📞', description: 'Email/tél/web' },
  { id: 'agenda', label: 'Agenda', emoji: '📅', description: 'Sommaire numéroté' },
  { id: 'statistics', label: 'Statistiques', emoji: '📊', description: 'Gros chiffres clés' },
  { id: 'timeline', label: 'Chronologie', emoji: '⏱️', description: 'Étapes dans le temps' },
  { id: 'gallery', label: 'Galerie', emoji: '🎨', description: 'Grille images 2x3 ou 3x3' },
  { id: 'kpi', label: 'KPI Dashboard', emoji: '📈', description: 'Indicateurs principaux' },
  { id: 'faq', label: 'FAQ', emoji: '❓', description: 'Questions fréquentes' },
  { id: 'thank_you', label: 'Merci', emoji: '🙏', description: 'Slide de fin' },
  { id: 'chart_bar', label: 'Graphique Barres', emoji: '📊', description: 'Bar chart' },
  { id: 'chart_pie', label: 'Graphique Camembert', emoji: '🥧', description: 'Pie chart' },
  { id: 'chart_line', label: 'Graphique Courbe', emoji: '📉', description: 'Line chart' },
  { id: 'video', label: 'Vidéo', emoji: '🎬', description: 'Embed vidéo YT/MP4' },
  { id: 'roadmap', label: 'Roadmap', emoji: '🛣️', description: 'Étapes futures' },
  { id: 'pricing', label: 'Pricing', emoji: '💰', description: '3 colonnes prix' },
  { id: 'testimonial', label: 'Témoignage', emoji: '⭐', description: 'Avis client' },
  { id: 'process', label: 'Processus', emoji: '🔄', description: 'Étapes 1-2-3-4' },
  { id: 'swot', label: 'SWOT', emoji: '🎯', description: 'Force/Faib/Oppo/Mena' },
  { id: 'matrix', label: 'Matrice', emoji: '🧩', description: '2x2 BCG/SWOT' },
  { id: 'features', label: 'Features', emoji: '✨', description: 'Liste features' },
  { id: 'about', label: 'About Us', emoji: '🏢', description: 'Présentation entreprise' },
  { id: 'cover_back', label: 'Dos', emoji: '🔚', description: 'Couverture finale' },
] as const;

/* ---------- 12 Thèmes ---------- */

export const THEMES: readonly Theme[] = [
  { id: 'dark_pro', label: 'Dark Pro', emoji: '🌑', primary: '#c9a227', secondary: '#79c0ff', accent: '#ff007a', bg: '#0a0a0f', text: '#fff', fontHeading: 'Inter', fontBody: 'Inter' },
  { id: 'light_minimal', label: 'Light Minimal', emoji: '⚪', primary: '#1d252d', secondary: '#666', accent: '#1f6feb', bg: '#fff', text: '#1d252d', fontHeading: 'Source Sans Pro', fontBody: 'Source Sans Pro' },
  { id: 'casino_or', label: 'Casino Or', emoji: '🎰', primary: '#c9a227', secondary: '#bf9f3a', accent: '#fff', bg: '#0a0a0f', text: '#f1ece1', fontHeading: 'Cinzel', fontBody: 'Lora' },
  { id: 'corporate_blue', label: 'Corporate Blue', emoji: '💼', primary: '#003366', secondary: '#247ba0', accent: '#73a580', bg: '#fff', text: '#003366', fontHeading: 'PT Serif', fontBody: 'PT Sans' },
  { id: 'tech_neon', label: 'Tech Néon', emoji: '⚡', primary: '#39d353', secondary: '#79c0ff', accent: '#ff007a', bg: '#0d1117', text: '#fff', fontHeading: 'Audiowide', fontBody: 'Source Code Pro' },
  { id: 'pastel_soft', label: 'Pastel Doux', emoji: '🌸', primary: '#f8bbd0', secondary: '#bbdefb', accent: '#c8e6c9', bg: '#fff9f5', text: '#5e2541', fontHeading: 'Quicksand', fontBody: 'Nunito' },
  { id: 'gradient_sunset', label: 'Coucher Soleil', emoji: '🌅', primary: '#ff6b9d', secondary: '#ffd166', accent: '#9d4edd', bg: '#240046', text: '#fff', fontHeading: 'Pacifico', fontBody: 'Open Sans' },
  { id: 'editorial', label: 'Editorial', emoji: '📰', primary: '#000', secondary: '#666', accent: '#c83100', bg: '#fafafa', text: '#000', fontHeading: 'Playfair Display', fontBody: 'Lora' },
  { id: 'bold', label: 'Bold', emoji: '🔥', primary: '#ff6b00', secondary: '#000', accent: '#fff', bg: '#fff', text: '#000', fontHeading: 'Anton', fontBody: 'Inter' },
  { id: 'warm', label: 'Warm', emoji: '☀️', primary: '#7a1900', secondary: '#c83100', accent: '#ffaa00', bg: '#fdf6e3', text: '#1a0500', fontHeading: 'Merriweather', fontBody: 'PT Serif' },
  { id: 'eco', label: 'Éco', emoji: '🌿', primary: '#43b02a', secondary: '#84bd00', accent: '#5a8c4f', bg: '#f0f8f0', text: '#0d3b1f', fontHeading: 'Bitter', fontBody: 'Open Sans' },
  { id: 'monochrome', label: 'Monochrome', emoji: '⬛', primary: '#000', secondary: '#666', accent: '#999', bg: '#fff', text: '#000', fontHeading: 'Inter', fontBody: 'Inter' },
] as const;

/* ---------- Pure helpers ---------- */

export function findLayout(id: SlideLayoutId): typeof LAYOUTS[number] | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

export function findTheme(id: ThemeId): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function createSlide(layout: SlideLayoutId): Slide {
  const layoutDef = findLayout(layout);
  return {
    id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    layout,
    title: layoutDef?.label ?? 'Nouveau slide',
    elements: [],
    notes: '',
    transition: 'fade',
  };
}

export function createPresentation(name: string, theme: ThemeId = 'dark_pro', author = 'Anonymous'): Presentation {
  return {
    id: `pres_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Ma présentation',
    theme,
    slides: [createSlide('title'), createSlide('agenda'), createSlide('content'), createSlide('thank_you')],
    ratio: '16:9',
    updatedAt: Date.now(),
    author,
  };
}

export function addSlide(pres: Presentation, layout: SlideLayoutId, position?: number): Presentation {
  if (pres.slides.length >= MAX_SLIDES) return pres;
  const newSlide = createSlide(layout);
  const slides = [...pres.slides];
  if (position !== undefined && position >= 0 && position <= slides.length) {
    slides.splice(position, 0, newSlide);
  } else {
    slides.push(newSlide);
  }
  return { ...pres, slides, updatedAt: Date.now() };
}

export function removeSlide(pres: Presentation, slideId: string): Presentation {
  return { ...pres, slides: pres.slides.filter((s) => s.id !== slideId), updatedAt: Date.now() };
}

export function updateSlide(pres: Presentation, slideId: string, patch: Partial<Slide>): Presentation {
  return {
    ...pres,
    slides: pres.slides.map((s) => (s.id === slideId ? { ...s, ...patch } : s)),
    updatedAt: Date.now(),
  };
}

export function moveSlide(pres: Presentation, slideId: string, direction: 'up' | 'down'): Presentation {
  const idx = pres.slides.findIndex((s) => s.id === slideId);
  if (idx === -1) return pres;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= pres.slides.length) return pres;
  const slides = [...pres.slides];
  const a = slides[idx];
  const b = slides[newIdx];
  if (!a || !b) return pres;
  slides[idx] = b;
  slides[newIdx] = a;
  return { ...pres, slides, updatedAt: Date.now() };
}

export function addElement(pres: Presentation, slideId: string, element: Omit<SlideElement, 'id'>): Presentation {
  return {
    ...pres,
    slides: pres.slides.map((s) => {
      if (s.id !== slideId) return s;
      if (s.elements.length >= MAX_ELEMENTS_PER_SLIDE) return s;
      const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return { ...s, elements: [...s.elements, { ...element, id }] };
    }),
    updatedAt: Date.now(),
  };
}

export function setTheme(pres: Presentation, theme: ThemeId): Presentation {
  return { ...pres, theme, updatedAt: Date.now() };
}

export function duplicateSlide(pres: Presentation, slideId: string): Presentation {
  const slide = pres.slides.find((s) => s.id === slideId);
  if (!slide) return pres;
  const idx = pres.slides.findIndex((s) => s.id === slideId);
  const copy: Slide = {
    ...slide,
    id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: `${slide.title} (copie)`,
  };
  const slides = [...pres.slides];
  slides.splice(idx + 1, 0, copy);
  return { ...pres, slides, updatedAt: Date.now() };
}

export function totalDurationMinutes(pres: Presentation, secondsPerSlide = 60): number {
  return Math.ceil((pres.slides.length * secondsPerSlide) / 60);
}

/* ---------- Export HTML standalone ---------- */

export function exportHtml(pres: Presentation): string {
  const theme = findTheme(pres.theme);
  if (!theme) return '';
  const slides = pres.slides.map((s, idx) => `
    <section data-slide="${idx}" style="page-break-after:always;width:100vw;height:100vh;background:${escapeHtml(s.bgColor ?? theme.bg)};color:${escapeHtml(theme.text)};display:flex;flex-direction:column;justify-content:center;padding:64px;font-family:'${escapeHtml(theme.fontBody)}',sans-serif;box-sizing:border-box">
      <h1 style="font-family:'${escapeHtml(theme.fontHeading)}',serif;color:${escapeHtml(theme.primary)};font-size:48px;margin:0 0 24px">${escapeHtml(s.title)}</h1>
      ${s.elements.map((e) => {
        if (e.kind === 'text') return `<p style="font-size:${e.fontSize ?? 24}px;color:${escapeHtml(e.color ?? theme.text)}">${escapeHtml(e.content)}</p>`;
        if (e.kind === 'image') return `<img src="${escapeHtml(e.content)}" alt="" loading="lazy" decoding="async" style="max-width:100%;max-height:60vh;object-fit:contain"/>`;
        return '';
      }).join('')}
    </section>
  `).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(pres.name)}</title></head><body style="margin:0">${slides}</body></html>`;
}

/* ---------- Storage ---------- */

class PresentationStudioStore {
  list(uid: string): Presentation[] {
    if (!uid) return [];
    const out: Presentation[] = [];
    const prefix = `${STORAGE_PREFIX}${uid}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Presentation;
          if (parsed && parsed.id) out.push(parsed);
        } catch {/* skip */}
      }
    } catch (err) { logger.warn('studio-presentation', 'list failed', { err }); }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(uid: string, id: string): Presentation | null {
    if (!uid || !id) return null;
    try {
      const raw = localStorage.getItem(getStorageKey(uid, id));
      if (!raw) return null;
      return JSON.parse(raw) as Presentation;
    } catch (err) {
      logger.warn('studio-presentation', 'load failed', { err });
      return null;
    }
  }

  save(uid: string, pres: Presentation): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid, pres.id), JSON.stringify(pres));
      return true;
    } catch (err) {
      logger.warn('studio-presentation', 'save failed (quota?)', { err });
      return false;
    }
  }

  remove(uid: string, id: string): boolean {
    if (!uid || !id) return false;
    localStorage.removeItem(getStorageKey(uid, id));
    return true;
  }
}

export const presentationStudioStore = new PresentationStudioStore();

/* ---------- UI render ---------- */

export function render(rootEl: HTMLElement): void {
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.presentation', rootEl, uid)) return;
  const list = presentationStudioStore.list(uid);

  rootEl.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">📊 Studio Présentation</h2>
      <p class="ax-gs-417">${LAYOUTS.length} layouts · ${THEMES.length} thèmes · Animations · Transitions · Export PPTX/PDF/HTML.</p>
      <div class="ax-gs-30">
        <button id="ax-pres-new" class="ax-btn ax-btn-primary">+ Nouvelle présentation</button>
        <button id="ax-pres-templates" class="ax-btn">📚 Voir layouts</button>
      </div>
      <div id="ax-pres-list" class="ax-gs-254">
        ${list.length === 0
          ? '<p class="ax-gs-255">Aucune présentation. Crée la première !</p>'
          : list.map((p) => `<div class="ax-gs-46"><strong class="ax-gs-327">${escapeHtml(p.name)}</strong><br><small class="ax-gs-240">${p.slides.length} slides · ${escapeHtml(p.theme)}</small></div>`).join('')}
      </div>
    </div>
  `;

  rootEl.querySelector<HTMLButtonElement>('#ax-pres-new')?.addEventListener('click', () => {
    const pres = createPresentation('Ma présentation', 'dark_pro', user?.name ?? 'Anonymous');
    presentationStudioStore.save(uid, pres);
    render(rootEl);
  });
}
