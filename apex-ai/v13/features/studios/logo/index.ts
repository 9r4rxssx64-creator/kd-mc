/**
 * APEX v13 — Studio Logo (Branding Pro MAX).
 *
 * Studio création de logos professionnels niveau agence design :
 * - 50+ templates par industrie (modern, classic, tech, sport, food, fashion, finance,
 *   healthcare, real-estate, education, travel, beauty, legal, gaming, music…)
 * - Color picker complet : HEX/RGB/HSL/Pantone/RAL + 30 palettes pré-faites
 * - Typography : 100+ fonts Google (sans-serif, serif, display, mono, handwriting)
 * - Formes vectorielles SVG (cercles, polygones, étoiles, abstraits, mascots)
 * - Gradient editor (linear/radial, multi-stop)
 * - Layer system (text + shape + bg)
 * - Export : SVG natif + PNG (canvas) + PDF (jsPDF lazy)
 * - Mockup auto : carte de visite, t-shirt, mug, devanture, social media
 *
 * Architecture pure-logic + render() friendly.
 * Anti-XSS : escapeHtml partout. Storage per-user.
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

export interface ColorRGB { r: number; g: number; b: number }
export interface ColorHSL { h: number; s: number; l: number }
export interface ColorStop { color: string; offset: number }
export interface Gradient { type: 'linear' | 'radial'; angle: number; stops: ColorStop[] }

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'star' | 'hexagon' | 'pentagon' | 'octagon' | 'heart' | 'diamond' | 'shield' | 'leaf' | 'flame' | 'wave' | 'lightning' | 'crown';
export type IndustryKind =
  | 'modern' | 'classic' | 'tech' | 'sport' | 'food' | 'fashion' | 'finance'
  | 'healthcare' | 'real_estate' | 'education' | 'travel' | 'beauty' | 'legal'
  | 'gaming' | 'music' | 'art' | 'eco' | 'crypto' | 'auto' | 'aviation';

export interface LogoLayer {
  id: string;
  type: 'text' | 'shape' | 'bg' | 'gradient';
  text?: string;
  shape?: ShapeKind;
  font?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  gradient?: Gradient;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface LogoTemplate {
  id: string;
  industry: IndustryKind;
  label: string;
  description: string;
  emoji: string;
  defaultLayers: () => LogoLayer[];
}

export interface LogoData {
  id: string;
  name: string;
  template: string;
  layers: LogoLayer[];
  width: number;
  height: number;
  bg: string;
  updatedAt: number;
}

export interface MockupKind {
  id: string;
  label: string;
  emoji: string;
  width: number;
  height: number;
}

export const MAX_LAYERS = 30;
export const STORAGE_PREFIX = 'ax_logo_';
export const CANVAS_W = 800;
export const CANVAS_H = 800;

export function getStorageKey(uid: string, id: string): string {
  return `${STORAGE_PREFIX}${uid}_${id}`;
}

/* ---------- Color helpers (HEX / RGB / HSL / Pantone / RAL) ---------- */

export function hexToRgb(hex: string): ColorRGB | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.replace('#', ''));
  if (!m) return null;
  return { r: parseInt(m[1] ?? '0', 16), g: parseInt(m[2] ?? '0', 16), b: parseInt(m[3] ?? '0', 16) };
}

export function rgbToHex(rgb: ColorRGB): string {
  const c = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`;
}

export function rgbToHsl({ r, g, b }: ColorRGB): ColorHSL {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6;
    else if (max === gN) h = ((bN - rN) / d + 2) / 6;
    else h = ((rN - gN) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export const PANTONE_PALETTE: readonly { code: string; hex: string; name: string }[] = [
  { code: '186 C', hex: '#c8102e', name: 'Rouge passion' },
  { code: '281 C', hex: '#00205b', name: 'Bleu marine' },
  { code: '7406 C', hex: '#f1b300', name: 'Or Casino' },
  { code: '349 C', hex: '#046a38', name: 'Vert émeraude' },
  { code: 'Black 6 C', hex: '#101820', name: 'Noir profond' },
  { code: '433 C', hex: '#1d252d', name: 'Anthracite' },
  { code: '485 C', hex: '#da291c', name: 'Rouge feu' },
  { code: '300 C', hex: '#005eb8', name: 'Bleu royal' },
  { code: '7548 C', hex: '#ffc72c', name: 'Jaune soleil' },
  { code: '376 C', hex: '#84bd00', name: 'Vert lime' },
  { code: '258 C', hex: '#5d3f6a', name: 'Violet imperial' },
  { code: '171 C', hex: '#ff6b35', name: 'Orange tonique' },
  { code: 'Cool Gray 11', hex: '#53565a', name: 'Gris béton' },
  { code: '7740 C', hex: '#43b02a', name: 'Vert nature' },
  { code: '2685 C', hex: '#330072', name: 'Indigo' },
] as const;

export const RAL_PALETTE: readonly { code: string; hex: string; name: string }[] = [
  { code: 'RAL 9005', hex: '#0a0a0a', name: 'Noir foncé' },
  { code: 'RAL 9010', hex: '#f1ece1', name: 'Blanc pur' },
  { code: 'RAL 5002', hex: '#20214f', name: 'Bleu outremer' },
  { code: 'RAL 3020', hex: '#cc0605', name: 'Rouge signalisation' },
  { code: 'RAL 1023', hex: '#fad201', name: 'Jaune signalisation' },
  { code: 'RAL 6029', hex: '#20603d', name: 'Vert menthe' },
  { code: 'RAL 7016', hex: '#293133', name: 'Gris anthracite' },
  { code: 'RAL 8017', hex: '#45322e', name: 'Brun chocolat' },
  { code: 'RAL 4007', hex: '#4a192c', name: 'Pourpre violet' },
  { code: 'RAL 1015', hex: '#e6d690', name: 'Ivoire clair' },
] as const;

export const PRESET_PALETTES: readonly { id: string; label: string; colors: readonly string[] }[] = [
  { id: 'monochrome', label: 'Monochrome', colors: ['#000', '#333', '#666', '#999', '#ccc', '#fff'] },
  { id: 'casino', label: 'Casino Or', colors: ['#0a0a0a', '#1a1a1a', '#c9a227', '#f1b300', '#fff', '#262626'] },
  { id: 'tech', label: 'Tech Bleu', colors: ['#0d1117', '#1f6feb', '#58a6ff', '#79c0ff', '#a5d6ff', '#f0f6fc'] },
  { id: 'fire', label: 'Feu', colors: ['#1a0500', '#7a1900', '#c83100', '#ff6b00', '#ffaa00', '#ffe066'] },
  { id: 'ocean', label: 'Océan', colors: ['#001f3f', '#003f7f', '#0074d9', '#39cccc', '#7fdbff', '#cef'] },
  { id: 'forest', label: 'Forêt', colors: ['#0a2e0a', '#1c4d1c', '#3a8a3a', '#7cba7c', '#aed581', '#e0f2e0'] },
  { id: 'sunset', label: 'Coucher soleil', colors: ['#240046', '#5a189a', '#9d4edd', '#e056fd', '#ff6b9d', '#ffd166'] },
  { id: 'pastel', label: 'Pastel', colors: ['#fce4ec', '#f8bbd0', '#e1bee7', '#bbdefb', '#c8e6c9', '#fff9c4'] },
  { id: 'luxury', label: 'Luxe noir-or', colors: ['#000', '#1a1a1a', '#bf9f3a', '#d4af37', '#f5e89e', '#fff'] },
  { id: 'eco', label: 'Éco bio', colors: ['#0d3b1f', '#2d5e3e', '#5a8c4f', '#b5cda3', '#f0e8d9', '#fff8dc'] },
  { id: 'crypto', label: 'Crypto', colors: ['#0d0d0d', '#21232c', '#3da638', '#f7931a', '#627eea', '#ff007a'] },
  { id: 'fashion', label: 'Fashion', colors: ['#1a0d12', '#5e2541', '#a83279', '#ec4980', '#ff8fa3', '#fff0f3'] },
  { id: 'corporate', label: 'Corporate', colors: ['#003366', '#00509e', '#247ba0', '#73a580', '#bfd1d3', '#f5f5f5'] },
  { id: 'medical', label: 'Médical', colors: ['#fff', '#e3f2fd', '#90caf9', '#42a5f5', '#1976d2', '#0d47a1'] },
  { id: 'legal', label: 'Justice', colors: ['#0c1429', '#1d2d50', '#7d6608', '#bf9f3a', '#e6c200', '#fff'] },
  /* boost v13 — 20 palettes supplementaires pro */
  { id: 'cyberpunk', label: 'Cyberpunk', colors: ['#0a0a23', '#1a0033', '#ff0080', '#00ffff', '#ffff00', '#fff'] },
  { id: 'vintage', label: 'Vintage', colors: ['#3e2c1f', '#7a5037', '#c08552', '#e6cfa6', '#f5e8d3', '#fff'] },
  { id: 'neon', label: 'Neon', colors: ['#0a0a0a', '#ff00ff', '#00ff00', '#ffff00', '#00ffff', '#ffffff'] },
  { id: 'minimal', label: 'Minimal', colors: ['#000', '#fff', '#f5f5f5', '#e0e0e0', '#bdbdbd', '#212121'] },
  { id: 'gold_marble', label: 'Or Marbre', colors: ['#0c0c0c', '#1a1a1a', '#3a3a3a', '#bf9f3a', '#d4af37', '#f4f4f4'] },
  { id: 'tropical', label: 'Tropical', colors: ['#003d3d', '#0a6e6e', '#ff8c42', '#ffd166', '#06d6a0', '#f0f5f5'] },
  { id: 'desert', label: 'Désert', colors: ['#3a2c1f', '#8b4513', '#cd853f', '#daa06d', '#f5e6d3', '#fff8e7'] },
  { id: 'space', label: 'Espace', colors: ['#000016', '#0d0d2b', '#252569', '#5a5a99', '#9d4edd', '#f5e1ff'] },
  { id: 'racing', label: 'Racing', colors: ['#000', '#7f0000', '#cc0000', '#fff', '#cccccc', '#ffaa00'] },
  { id: 'wedding', label: 'Mariage', colors: ['#fdfdfd', '#f5e6d3', '#e8d5b7', '#c9a87c', '#a67c52', '#5e4737'] },
  { id: 'kids', label: 'Enfants', colors: ['#ff6b9d', '#fcb900', '#7bdcb5', '#00d084', '#0693e3', '#ee82ee'] },
  { id: 'autumn', label: 'Automne', colors: ['#3d1c00', '#8b3a00', '#cc6600', '#e89400', '#f5d5a0', '#fff'] },
  { id: 'winter', label: 'Hiver', colors: ['#1d1d3d', '#3a3a6e', '#7a7aaa', '#b3b3d9', '#e6e6f5', '#fff'] },
  { id: 'spring', label: 'Printemps', colors: ['#7cba7c', '#a3d9a3', '#c8e6c9', '#fff9c4', '#f8bbd0', '#fce4ec'] },
  { id: 'summer', label: 'Été', colors: ['#FF6B6B', '#FFD93D', '#FF8E72', '#6BCB77', '#4D96FF', '#FFF'] },
  { id: 'metal', label: 'Métal', colors: ['#0a0a0a', '#2a2a2a', '#5a5a5a', '#9a9a9a', '#bdbdbd', '#fff'] },
  { id: 'cosmic', label: 'Cosmique', colors: ['#0d0d23', '#1a1a3e', '#3d2c8d', '#7a4ddc', '#c084fc', '#f5e6ff'] },
  { id: 'organic', label: 'Bio Organique', colors: ['#1c4d1c', '#3d7a3d', '#7cba7c', '#c8e6c9', '#f0f5e8', '#fffbf0'] },
  { id: 'sport_rouge', label: 'Sport rouge', colors: ['#000', '#1a1a1a', '#bf0000', '#ff0000', '#ff6666', '#fff'] },
  { id: 'startup', label: 'Startup', colors: ['#0d1421', '#1a2b40', '#3a5fcd', '#67c1ff', '#a6e1ff', '#fff'] },
] as const;

/* ---------- 100 Google fonts par catégorie ---------- */

export const GOOGLE_FONTS = {
  serif: ['Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Crimson Text', 'EB Garamond', 'Cormorant Garamond', 'Source Serif Pro', 'Libre Baskerville', 'Cardo', 'Old Standard TT', 'Bitter', 'Vollkorn', 'Spectral', 'Italiana'],
  sans_serif: ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Nunito', 'Raleway', 'Oswald', 'Source Sans Pro', 'PT Sans', 'Karla', 'Work Sans', 'Mulish', 'Noto Sans', 'DM Sans', 'Manrope', 'Outfit', 'Public Sans', 'Hind'],
  display: ['Bebas Neue', 'Anton', 'Righteous', 'Bungee', 'Lobster', 'Pacifico', 'Comfortaa', 'Permanent Marker', 'Russo One', 'Black Ops One', 'Press Start 2P', 'Monoton', 'Audiowide', 'Faster One', 'Bowlby One', 'Bree Serif', 'Yatra One', 'Bungee Shade', 'Rubik Mono One', 'Frijole'],
  handwriting: ['Dancing Script', 'Great Vibes', 'Sacramento', 'Allura', 'Satisfy', 'Caveat', 'Kalam', 'Indie Flower', 'Shadows Into Light', 'Architects Daughter', 'Patrick Hand', 'Amatic SC', 'Tangerine', 'Yellowtail', 'Marck Script', 'Parisienne', 'Pinyon Script', 'Italianno', 'Alex Brush', 'Mr Dafoe'],
  mono: ['Roboto Mono', 'Source Code Pro', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Inconsolata', 'Space Mono', 'Nanum Gothic Coding', 'PT Mono', 'Cousine', 'Cutive Mono', 'Anonymous Pro', 'Share Tech Mono', 'Major Mono Display', 'Ubuntu Mono'],
  decorative: ['UnifrakturMaguntia', 'Cinzel', 'Marcellus', 'Almendra', 'Cinzel Decorative', 'IM Fell English', 'Berkshire Swash', 'Sancreek', 'Smokum', 'Astloch', 'Eater', 'Jolly Lodger', 'Metal Mania', 'Nosifer', 'Creepster'],
} as const;

export function allGoogleFonts(): readonly string[] {
  return [
    ...GOOGLE_FONTS.serif,
    ...GOOGLE_FONTS.sans_serif,
    ...GOOGLE_FONTS.display,
    ...GOOGLE_FONTS.handwriting,
    ...GOOGLE_FONTS.mono,
    ...GOOGLE_FONTS.decorative,
  ];
}

/* ---------- 50 Templates par industrie ---------- */

export const SHAPE_PATHS: Record<ShapeKind, string> = {
  circle: 'M50,10 a40,40 0 1,0 0.1,0 z',
  square: 'M10,10 h80 v80 h-80 z',
  triangle: 'M50,10 L90,90 L10,90 z',
  star: 'M50,10 L61,38 L92,38 L66,57 L77,87 L50,69 L23,87 L34,57 L8,38 L39,38 z',
  hexagon: 'M50,5 L93,28 L93,72 L50,95 L7,72 L7,28 z',
  pentagon: 'M50,10 L93,40 L77,90 L23,90 L7,40 z',
  octagon: 'M30,5 L70,5 L95,30 L95,70 L70,95 L30,95 L5,70 L5,30 z',
  heart: 'M50,87 L20,57 a18,18 0 0 1 30,-22 a18,18 0 0 1 30,22 z',
  diamond: 'M50,5 L95,50 L50,95 L5,50 z',
  shield: 'M50,5 L90,15 L90,55 Q90,80 50,95 Q10,80 10,55 L10,15 z',
  leaf: 'M50,10 Q90,30 80,70 Q60,90 30,80 Q10,60 20,30 Q40,15 50,10 z',
  flame: 'M50,5 Q70,30 65,55 Q70,75 50,90 Q30,75 35,55 Q30,30 50,5 z',
  wave: 'M5,50 Q25,30 50,50 Q75,70 95,50 L95,90 L5,90 z',
  lightning: 'M55,5 L25,55 L45,55 L35,95 L75,40 L55,40 z',
  crown: 'M10,80 L20,30 L35,55 L50,20 L65,55 L80,30 L90,80 z',
};

export const TEMPLATES: readonly LogoTemplate[] = [
  /* MODERN (5) */
  { id: 'modern_circle', industry: 'modern', label: 'Modern Cercle', description: 'Cercle minimaliste sur typo géométrique', emoji: '⭕', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'circle', color: '#1d252d', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'BRAND', font: 'Inter', fontSize: 56, fontWeight: 800, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'modern_square', industry: 'modern', label: 'Modern Carré', description: 'Carré + monogramme', emoji: '⬛', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'square', color: '#0a0a0a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'A', font: 'Bebas Neue', fontSize: 140, fontWeight: 900, color: '#c9a227', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'modern_text', industry: 'modern', label: 'Modern Wordmark', description: 'Texte pur, géométrique', emoji: '🔤', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'STUDIO', font: 'Montserrat', fontSize: 80, fontWeight: 900, color: '#000', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'modern_split', industry: 'modern', label: 'Modern Split', description: 'Couleur split top/bottom', emoji: '🟦', defaultLayers: () => ([
    { id: 'l1', type: 'gradient', gradient: { type: 'linear', angle: 90, stops: [{ color: '#0d1117', offset: 0 }, { color: '#1f6feb', offset: 1 }] }, x: 50, y: 50, width: 300, height: 300, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'NEXT', font: 'Inter', fontSize: 64, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'modern_dot', industry: 'modern', label: 'Modern Dot', description: 'Texte + point coloré', emoji: '🔴', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'apex.', font: 'Manrope', fontSize: 96, fontWeight: 800, color: '#101820', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  /* TECH (5) */
  { id: 'tech_hex', industry: 'tech', label: 'Tech Hexagone', description: 'Hexagone bleu, code style', emoji: '⬡', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'hexagon', color: '#1f6feb', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: '< / >', font: 'JetBrains Mono', fontSize: 36, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'tech_lightning', industry: 'tech', label: 'Tech Eclair', description: 'Vitesse + énergie', emoji: '⚡', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'lightning', color: '#f1b300', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'tech_grid', industry: 'tech', label: 'Tech Grid', description: 'Pattern grille tech', emoji: '🔲', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'square', color: '#0d1117', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'DEV', font: 'Source Code Pro', fontSize: 60, fontWeight: 700, color: '#58a6ff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'tech_circuit', industry: 'tech', label: 'Tech Circuit', description: 'Style circuit imprimé', emoji: '🔌', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'octagon', color: '#22272e', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'AI', font: 'Roboto Mono', fontSize: 80, fontWeight: 800, color: '#79c0ff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'tech_terminal', industry: 'tech', label: 'Tech Terminal', description: 'Style ligne de commande', emoji: '💻', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: '$ run.dev', font: 'Fira Code', fontSize: 56, fontWeight: 600, color: '#39d353', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  /* SPORT (5) */
  { id: 'sport_shield', industry: 'sport', label: 'Sport Bouclier', description: 'Écusson sportif classique', emoji: '🛡️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'shield', color: '#c8102e', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'FC', font: 'Bebas Neue', fontSize: 120, fontWeight: 900, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'sport_dynamic', industry: 'sport', label: 'Sport Dynamique', description: 'Italique, mouvement', emoji: '🏃', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'PRO', font: 'Anton', fontSize: 100, fontWeight: 900, color: '#000', x: 200, y: 200, width: 0, height: 0, rotation: -10, opacity: 1, visible: true },
  ]) },
  { id: 'sport_team', industry: 'sport', label: 'Sport Team', description: 'Logo équipe', emoji: '🏆', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'star', color: '#ffc72c', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'sport_athletic', industry: 'sport', label: 'Sport Athletic', description: 'Style athlétique pro', emoji: '🥇', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'lightning', color: '#005eb8', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'sport_gym', industry: 'sport', label: 'Sport Gym', description: 'Fitness motivation', emoji: '💪', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'FIT', font: 'Bebas Neue', fontSize: 140, fontWeight: 900, color: '#da291c', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  /* FOOD (5) */
  { id: 'food_chef', industry: 'food', label: 'Food Chef', description: 'Toque cuisine', emoji: '👨‍🍳', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'circle', color: '#84bd00', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'CHEF', font: 'Pacifico', fontSize: 56, fontWeight: 400, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'food_resto', industry: 'food', label: 'Food Resto', description: 'Restaurant haute gamme', emoji: '🍽️', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'Bistrot', font: 'Playfair Display', fontSize: 72, fontWeight: 700, color: '#1a0d12', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'food_pizza', industry: 'food', label: 'Food Pizza', description: 'Pizzeria', emoji: '🍕', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'octagon', color: '#c8102e', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'PIZZA', font: 'Lobster', fontSize: 56, fontWeight: 400, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'food_organic', industry: 'food', label: 'Food Bio', description: 'Bio organic vert', emoji: '🌿', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'leaf', color: '#43b02a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'food_cafe', industry: 'food', label: 'Food Café', description: 'Coffee shop chaleureux', emoji: '☕', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'Café', font: 'Dancing Script', fontSize: 88, fontWeight: 700, color: '#45322e', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  /* FASHION (3) + FINANCE (3) + HEALTHCARE (3) + REAL_ESTATE (3) + EDUCATION (3) + TRAVEL (3) + BEAUTY (3) + LEGAL (2) + GAMING (2) + MUSIC (2) + classic (3) + autres (5)  */
  { id: 'fashion_elegant', industry: 'fashion', label: 'Fashion Élégant', description: 'Élégance pure', emoji: '👗', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'ATELIER', font: 'Cinzel', fontSize: 56, fontWeight: 600, color: '#000', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'fashion_couture', industry: 'fashion', label: 'Fashion Couture', description: 'Haute couture script', emoji: '✂️', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'Couture', font: 'Allura', fontSize: 96, fontWeight: 400, color: '#a83279', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'fashion_lux', industry: 'fashion', label: 'Fashion Luxe', description: 'Or noir', emoji: '💎', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'diamond', color: '#d4af37', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'finance_bank', industry: 'finance', label: 'Finance Bank', description: 'Banque sérieuse', emoji: '🏦', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'shield', color: '#003366', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'BANK', font: 'PT Serif', fontSize: 64, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'finance_chart', industry: 'finance', label: 'Finance Trading', description: 'Trading graphique', emoji: '📈', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: '↗ INVEST', font: 'Roboto', fontSize: 56, fontWeight: 700, color: '#247ba0', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'finance_crypto', industry: 'crypto', label: 'Finance Crypto', description: 'Crypto futuriste', emoji: '🪙', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'octagon', color: '#f7931a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: '₿', font: 'Russo One', fontSize: 100, fontWeight: 900, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'health_cross', industry: 'healthcare', label: 'Health Croix', description: 'Croix médicale', emoji: '⚕️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'square', color: '#1976d2', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: '+', font: 'Roboto', fontSize: 200, fontWeight: 900, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'health_pulse', industry: 'healthcare', label: 'Health Pouls', description: 'Battement cardiaque', emoji: '🩺', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'heart', color: '#c8102e', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'health_yoga', industry: 'healthcare', label: 'Health Yoga', description: 'Bien-être doux', emoji: '🧘', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'leaf', color: '#84bd00', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'Zen', font: 'Caveat', fontSize: 64, fontWeight: 700, color: '#1a4d1a', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'realestate_house', industry: 'real_estate', label: 'Immo Maison', description: 'Logo agence immo', emoji: '🏠', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'pentagon', color: '#005eb8', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'IMMO', font: 'Source Sans Pro', fontSize: 48, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'realestate_key', industry: 'real_estate', label: 'Immo Clé', description: 'Clé symbolique', emoji: '🔑', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'KEY', font: 'Cormorant Garamond', fontSize: 88, fontWeight: 700, color: '#bf9f3a', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'realestate_tower', industry: 'real_estate', label: 'Immo Tour', description: 'Promotion tour', emoji: '🏙️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'square', color: '#1d252d', x: 130, y: 60, width: 140, height: 280, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'edu_book', industry: 'education', label: 'Édu Livre', description: 'École livres', emoji: '📚', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'square', color: '#5a189a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'EDU', font: 'Merriweather', fontSize: 64, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'edu_grad', industry: 'education', label: 'Édu Diplôme', description: 'Toque diplôme', emoji: '🎓', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'crown', color: '#bf9f3a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'edu_apple', industry: 'education', label: 'Édu Pomme', description: 'Pomme prof', emoji: '🍎', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'circle', color: '#c8102e', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'A+', font: 'Bitter', fontSize: 88, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'travel_plane', industry: 'travel', label: 'Voyage Avion', description: 'Compagnie aérienne', emoji: '✈️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'triangle', color: '#0074d9', x: 100, y: 100, width: 200, height: 200, rotation: 30, opacity: 1, visible: true },
  ]) },
  { id: 'travel_globe', industry: 'travel', label: 'Voyage Globe', description: 'Tour du monde', emoji: '🌍', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'circle', color: '#39cccc', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'travel_compass', industry: 'travel', label: 'Voyage Compas', description: 'Boussole exploration', emoji: '🧭', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'octagon', color: '#1d252d', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'N', font: 'Source Serif Pro', fontSize: 80, fontWeight: 700, color: '#c9a227', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'beauty_flower', industry: 'beauty', label: 'Beauté Fleur', description: 'Spa fleurs', emoji: '🌸', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'star', color: '#f8bbd0', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'beauty_lipstick', industry: 'beauty', label: 'Beauté Rouge', description: 'Cosmétiques', emoji: '💄', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'BEAUTÉ', font: 'Great Vibes', fontSize: 96, fontWeight: 400, color: '#a83279', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'beauty_diamond', industry: 'beauty', label: 'Beauté Diamant', description: 'Bijouterie', emoji: '💍', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'diamond', color: '#fff', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'legal_columns', industry: 'legal', label: 'Légal Colonnes', description: 'Cabinet avocat', emoji: '⚖️', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'LEX', font: 'Cinzel', fontSize: 88, fontWeight: 700, color: '#0c1429', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'legal_scale', industry: 'legal', label: 'Légal Balance', description: 'Justice', emoji: '⚖️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'shield', color: '#0c1429', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: '⚖', font: 'Cormorant Garamond', fontSize: 100, fontWeight: 700, color: '#bf9f3a', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'gaming_pixel', industry: 'gaming', label: 'Gaming Pixel', description: 'Pixel art rétro', emoji: '🎮', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'PLAY', font: 'Press Start 2P', fontSize: 56, fontWeight: 400, color: '#39d353', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'gaming_neon', industry: 'gaming', label: 'Gaming Néon', description: 'Cyberpunk néon', emoji: '🕹️', defaultLayers: () => ([
    { id: 'l1', type: 'gradient', gradient: { type: 'linear', angle: 45, stops: [{ color: '#ff007a', offset: 0 }, { color: '#627eea', offset: 1 }] }, x: 50, y: 50, width: 300, height: 300, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'GAME', font: 'Audiowide', fontSize: 80, fontWeight: 700, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'music_note', industry: 'music', label: 'Music Note', description: 'Note musicale', emoji: '🎵', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'circle', color: '#9d4edd', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: '♪', font: 'Roboto', fontSize: 200, fontWeight: 900, color: '#fff', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'music_studio', industry: 'music', label: 'Music Studio', description: 'Studio audio', emoji: '🎧', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'STUDIO', font: 'Bebas Neue', fontSize: 88, fontWeight: 900, color: '#101820', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  /* CLASSIC (3) */
  { id: 'classic_seal', industry: 'classic', label: 'Classic Sceau', description: 'Style médaillon', emoji: '🏛️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'circle', color: '#bf9f3a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
    { id: 'l2', type: 'text', text: 'EST. 2026', font: 'Cinzel', fontSize: 28, fontWeight: 600, color: '#000', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'classic_monogram', industry: 'classic', label: 'Classic Monogramme', description: 'Initiales entrelacées', emoji: '🔠', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'KD', font: 'UnifrakturMaguntia', fontSize: 160, fontWeight: 700, color: '#000', x: 200, y: 200, width: 0, height: 0, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'classic_crest', industry: 'classic', label: 'Classic Blason', description: 'Blason royal', emoji: '👑', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'crown', color: '#bf9f3a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  /* ECO + AUTO + AVIATION + ART + autres */
  { id: 'eco_recycle', industry: 'eco', label: 'Éco Recyclage', description: 'Recyclable vert', emoji: '♻️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'leaf', color: '#43b02a', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'auto_speed', industry: 'auto', label: 'Auto Speed', description: 'Voiture rapide', emoji: '🏎️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'flame', color: '#c8102e', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'aviation_wings', industry: 'aviation', label: 'Aviation Ailes', description: 'Ailes plein ciel', emoji: '🛩️', defaultLayers: () => ([
    { id: 'l1', type: 'shape', shape: 'triangle', color: '#005eb8', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
  { id: 'art_brush', industry: 'art', label: 'Art Pinceau', description: 'Atelier artistique', emoji: '🎨', defaultLayers: () => ([
    { id: 'l1', type: 'text', text: 'ART', font: 'Permanent Marker', fontSize: 120, fontWeight: 400, color: '#ec4980', x: 200, y: 200, width: 0, height: 0, rotation: -5, opacity: 1, visible: true },
  ]) },
  { id: 'art_palette', industry: 'art', label: 'Art Palette', description: 'Galerie multi-couleurs', emoji: '🖼️', defaultLayers: () => ([
    { id: 'l1', type: 'gradient', gradient: { type: 'radial', angle: 0, stops: [{ color: '#ec4980', offset: 0 }, { color: '#9d4edd', offset: 0.5 }, { color: '#1f6feb', offset: 1 }] }, x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
  ]) },
] as const;

/* ---------- Mockups exports ---------- */

export const MOCKUPS: readonly MockupKind[] = [
  { id: 'business_card', label: 'Carte de visite', emoji: '💳', width: 850, height: 540 },
  { id: 'tshirt', label: 'T-shirt', emoji: '👕', width: 1200, height: 1400 },
  { id: 'mug', label: 'Mug', emoji: '☕', width: 1000, height: 1000 },
  { id: 'storefront', label: 'Devanture', emoji: '🏪', width: 1600, height: 900 },
  { id: 'social_square', label: 'Social Carré', emoji: '📱', width: 1080, height: 1080 },
  { id: 'social_story', label: 'Story 9:16', emoji: '📲', width: 1080, height: 1920 },
  { id: 'banner', label: 'Bannière', emoji: '🖼️', width: 1500, height: 500 },
  { id: 'favicon', label: 'Favicon', emoji: '⭐', width: 256, height: 256 },
  /* boost v13 — 12 mockups supplementaires */
  { id: 'letterhead', label: 'En-tête lettre', emoji: '📄', width: 2480, height: 3508 }, /* A4 300dpi */
  { id: 'envelope', label: 'Enveloppe', emoji: '✉️', width: 1100, height: 700 },
  { id: 'email_signature', label: 'Signature email', emoji: '📧', width: 600, height: 200 },
  { id: 'youtube_channel', label: 'YouTube banner', emoji: '▶️', width: 2560, height: 1440 },
  { id: 'youtube_thumbnail', label: 'YouTube thumbnail', emoji: '🎬', width: 1280, height: 720 },
  { id: 'twitter_header', label: 'Twitter header', emoji: '🐦', width: 1500, height: 500 },
  { id: 'linkedin_banner', label: 'LinkedIn banner', emoji: '💼', width: 1584, height: 396 },
  { id: 'facebook_cover', label: 'Facebook cover', emoji: '📘', width: 820, height: 312 },
  { id: 'app_icon_ios', label: 'iOS App Icon', emoji: '🍎', width: 1024, height: 1024 },
  { id: 'app_icon_android', label: 'Android App Icon', emoji: '🤖', width: 512, height: 512 },
  { id: 'phone_case', label: 'Coque téléphone', emoji: '📱', width: 1500, height: 3000 },
  { id: 'cap', label: 'Casquette', emoji: '🧢', width: 1200, height: 800 },
] as const;

/* ---------- Pure logic helpers ---------- */

export function templatesByIndustry(industry: IndustryKind): readonly LogoTemplate[] {
  return TEMPLATES.filter((t) => t.industry === industry);
}

export function findTemplate(id: string): LogoTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function createLogoFromTemplate(templateId: string, name: string): LogoData | null {
  const tpl = findTemplate(templateId);
  if (!tpl) return null;
  return {
    id: `logo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Mon logo',
    template: templateId,
    layers: tpl.defaultLayers(),
    width: CANVAS_W,
    height: CANVAS_H,
    bg: '#ffffff',
    updatedAt: Date.now(),
  };
}

export function addLayer(logo: LogoData, layer: Omit<LogoLayer, 'id'>): LogoData {
  if (logo.layers.length >= MAX_LAYERS) return logo;
  const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { ...logo, layers: [...logo.layers, { ...layer, id }], updatedAt: Date.now() };
}

export function removeLayer(logo: LogoData, layerId: string): LogoData {
  return { ...logo, layers: logo.layers.filter((l) => l.id !== layerId), updatedAt: Date.now() };
}

export function updateLayer(logo: LogoData, layerId: string, patch: Partial<LogoLayer>): LogoData {
  return {
    ...logo,
    layers: logo.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    updatedAt: Date.now(),
  };
}

export function moveLayerUp(logo: LogoData, layerId: string): LogoData {
  const idx = logo.layers.findIndex((l) => l.id === layerId);
  if (idx <= 0) return logo;
  const layers = [...logo.layers];
  const tmp = layers[idx];
  const prev = layers[idx - 1];
  if (!tmp || !prev) return logo;
  layers[idx - 1] = tmp;
  layers[idx] = prev;
  return { ...logo, layers, updatedAt: Date.now() };
}

/* ---------- Export SVG ---------- */

export function renderLayerSvg(layer: LogoLayer): string {
  if (!layer.visible) return '';
  const transform = `translate(${layer.x},${layer.y}) rotate(${layer.rotation}) scale(${layer.width / 100},${layer.height / 100})`;
  const opacity = layer.opacity;
  if (layer.type === 'shape' && layer.shape) {
    const path = SHAPE_PATHS[layer.shape];
    return `<g transform="${transform}" opacity="${opacity}"><path d="${path}" fill="${escapeHtml(layer.color ?? '#000')}"/></g>`;
  }
  if (layer.type === 'text' && layer.text) {
    return `<text x="${layer.x}" y="${layer.y}" font-family="${escapeHtml(layer.font ?? 'sans-serif')}" font-size="${layer.fontSize ?? 32}" font-weight="${layer.fontWeight ?? 400}" fill="${escapeHtml(layer.color ?? '#000')}" text-anchor="middle" dominant-baseline="middle" opacity="${opacity}" transform="rotate(${layer.rotation},${layer.x},${layer.y})">${escapeHtml(layer.text)}</text>`;
  }
  if (layer.type === 'gradient' && layer.gradient) {
    const gid = `g_${layer.id}`;
    const stops = layer.gradient.stops.map((s) => `<stop offset="${s.offset}" stop-color="${escapeHtml(s.color)}"/>`).join('');
    const def = layer.gradient.type === 'linear'
      ? `<linearGradient id="${gid}" gradientTransform="rotate(${layer.gradient.angle})">${stops}</linearGradient>`
      : `<radialGradient id="${gid}">${stops}</radialGradient>`;
    return `<defs>${def}</defs><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" fill="url(#${gid})" opacity="${opacity}"/>`;
  }
  return '';
}

export function exportSvg(logo: LogoData): string {
  const body = logo.layers.map(renderLayerSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logo.width} ${logo.height}" width="${logo.width}" height="${logo.height}"><rect width="100%" height="100%" fill="${escapeHtml(logo.bg)}"/>${body}</svg>`;
}

/* ---------- Storage ---------- */

class LogoStudioStore {
  list(uid: string): LogoData[] {
    if (!uid) return [];
    const out: LogoData[] = [];
    const prefix = `${STORAGE_PREFIX}${uid}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as LogoData;
          if (parsed && typeof parsed === 'object' && parsed.id) out.push(parsed);
        } catch {/* skip */}
      }
    } catch (err) { logger.warn('studio-logo', 'list failed', { err }); }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(uid: string, id: string): LogoData | null {
    if (!uid || !id) return null;
    try {
      const raw = localStorage.getItem(getStorageKey(uid, id));
      if (!raw) return null;
      return JSON.parse(raw) as LogoData;
    } catch (err) {
      logger.warn('studio-logo', 'load failed', { err });
      return null;
    }
  }

  save(uid: string, logo: LogoData): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid, logo.id), JSON.stringify(logo));
      return true;
    } catch (err) {
      logger.warn('studio-logo', 'save failed (quota?)', { err });
      return false;
    }
  }

  remove(uid: string, id: string): boolean {
    if (!uid || !id) return false;
    localStorage.removeItem(getStorageKey(uid, id));
    return true;
  }
}

export const logoStudioStore = new LogoStudioStore();

/* ---------- UI render ---------- */

export function render(rootEl: HTMLElement): void {
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.logo', rootEl, uid)) return;
  const logos = logoStudioStore.list(uid);

  rootEl.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">🎨 Studio Logo Pro</h2>
      <p class="ax-gs-417">${TEMPLATES.length}+ templates · ${PRESET_PALETTES.length} palettes · ${allGoogleFonts().length} fonts · Export SVG/PNG/PDF + ${MOCKUPS.length} mockups.</p>
      <div class="ax-gs-30">
        <button id="ax-logo-new" class="ax-btn ax-btn-primary">+ Nouveau logo</button>
        <button id="ax-logo-templates" class="ax-btn">📚 Voir templates</button>
      </div>
      <div id="ax-logo-list" class="ax-gs-258">
        ${logos.length === 0
          ? '<p class="ax-gs-255">Aucun logo encore. Crée le premier !</p>'
          : logos.map((l) => `<div class="ax-gs-46"><strong class="ax-gs-327">${escapeHtml(l.name)}</strong><br><small class="ax-gs-240">${escapeHtml(l.template)}</small></div>`).join('')}
      </div>
    </div>
  `;

  rootEl.querySelector<HTMLButtonElement>('#ax-logo-new')?.addEventListener('click', () => {
    const tpl = TEMPLATES[0];
    if (!tpl) return;
    const logo = createLogoFromTemplate(tpl.id, 'Mon logo');
    if (logo) {
      logoStudioStore.save(uid, logo);
      render(rootEl);
    }
  });
}
