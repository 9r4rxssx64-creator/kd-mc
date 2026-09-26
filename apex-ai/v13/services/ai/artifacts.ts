/**
 * APEX v13 — Artifacts / Canvas.
 *
 * Parité flagship 2026 (ChatGPT Canvas, Claude Artifacts, Gemini Canvas) :
 * détecte un "artifact" (bloc de code/HTML/SVG substantiel) dans une réponse et
 * l'ouvre dans un panneau éditable avec aperçu live. Ici : extraction pure/testable
 * des artifacts d'un texte (features/canvas rend l'éditeur + aperçu sandbox).
 */

export type ArtifactKind = 'html' | 'svg' | 'mermaid' | 'code';

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  lang: string;
  code: string;
  /** true si rendu live possible dans un iframe sandbox (html/svg). */
  previewable: boolean;
}

const PREVIEW_LANGS = new Set(['html', 'htm', 'svg', 'xml']);
const MIN_CODE_LEN = 40; /* évite de traiter un `x=1` inline comme un artifact */

function kindFor(lang: string, code: string): ArtifactKind {
  const l = lang.toLowerCase();
  if (l === 'svg' || /^\s*<svg[\s>]/i.test(code)) return 'svg';
  if (l === 'html' || l === 'htm' || l === 'xml' || /<!doctype html|<html[\s>]|<body[\s>]/i.test(code)) return 'html';
  if (l === 'mermaid') return 'mermaid';
  return 'code';
}

/**
 * Extrait les artifacts (blocs ```lang … ```) d'un texte assistant.
 * Ne retient que les blocs assez longs (MIN_CODE_LEN). Ordre = ordre d'apparition.
 */
export function extractArtifacts(text: string): Artifact[] {
  if (!text) return [];
  const out: Artifact[] = [];
  const re = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    const lang = (m[1] ?? '').trim();
    const code = (m[2] ?? '').replace(/\s+$/, '');
    if (code.trim().length < MIN_CODE_LEN) continue;
    const kind = kindFor(lang, code);
    out.push({
      id: `art_${i}_${code.length}`,
      kind,
      lang: lang || kind,
      code,
      previewable: kind === 'html' || kind === 'svg' || PREVIEW_LANGS.has(lang.toLowerCase()),
    });
    i++;
  }
  return out;
}

/** Le meilleur artifact à ouvrir dans le Canvas : le 1er prévisualisable, sinon le 1er, sinon null. */
export function pickBestArtifact(text: string): Artifact | null {
  const arts = extractArtifacts(text);
  if (!arts.length) return null;
  return arts.find((a) => a.previewable) ?? arts[0]!;
}

export function hasArtifact(text: string): boolean {
  return extractArtifacts(text).length > 0;
}

const CANVAS_SESSION_KEY = 'apex_v13_canvas_artifact';

/** Dépose l'artifact à ouvrir dans le Canvas (appelé avant navigate('canvas')). */
export function setCanvasArtifact(art: Artifact): void {
  try {
    sessionStorage.setItem(CANVAS_SESSION_KEY, JSON.stringify(art));
  } catch {
    /* sessionStorage indispo → no-op */
  }
}

/** Lit l'artifact déposé pour le Canvas (ou null). */
export function readCanvasArtifact(): Artifact | null {
  try {
    const raw = sessionStorage.getItem(CANVAS_SESSION_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Artifact;
    if (a && typeof a.code === 'string' && typeof a.kind === 'string') return a;
    return null;
  } catch {
    return null;
  }
}

/** Construit le document srcdoc de l'aperçu sandbox (html direct, svg wrappé). */
export function buildPreviewDoc(art: Artifact): string {
  if (art.kind === 'svg') {
    return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:100%;max-height:100%}</style>${art.code}`;
  }
  /* html : si déjà un doc complet, tel quel ; sinon wrap minimal */
  if (/<!doctype html|<html[\s>]/i.test(art.code)) return art.code;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>${art.code}`;
}
