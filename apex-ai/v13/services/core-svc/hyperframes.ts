/**
 * APEX v13.4.3 — HyperFrames service (Kevin 2026-05-09 — Shubham Skill #1)
 *
 * Réf : hyperframes.dev — IA compose une vidéo via HTML/CSS/JS multi-frames timeline.
 *
 * Output : { html, frames, duration } où html contient :
 *  - data-composition-id="apex-comp-N"
 *  - data-frame-N divs pour chaque frame
 *  - <script> qui peuple window.__timelines avec timeline 30fps
 *
 * Cible PWA browser : preview dans iframe sandbox. Pas d'export MP4 (impossible web pure
 * sans MediaRecorder + canvas — out of scope cette itération).
 *
 * Storage : `apex_v13_hyperframes_history` (max 10 compositions).
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const HISTORY_KEY = 'apex_v13_hyperframes_history';
const HISTORY_MAX = 10;
const DEFAULT_FPS = 30;

export interface HyperFrameComposition {
  id: string;
  prompt: string;
  html: string;
  frames: number;
  duration: number;
  fps: number;
  generatedAt: number;
  durationMs: number;
}

class HyperFramesService {
  /**
   * Compose une animation HTML/CSS/JS multi-frames depuis prompt.
   */
  async compose(prompt: string): Promise<HyperFrameComposition> {
    const trimmed = (prompt || '').trim();
    if (!trimmed) throw new Error('Prompt vide');
    const tStart = Date.now();
    const id = `apex-comp-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const systemPrompt = `Tu es un compositeur d'animations HTML/CSS/JS multi-frames.
Pour chaque demande user, tu génères :
1. Un container <div data-composition-id="${id}"> avec frames data-frame-0, data-frame-1, ..., data-frame-N
2. Du CSS pour styliser chaque frame (background, color, font, layout)
3. Du JS qui populate window.__timelines avec :
   window.__timelines = window.__timelines || {};
   window.__timelines["${id}"] = { fps: 30, frames: N, duration: D };
   Et un setInterval qui affiche chaque frame séquentiellement.

Format de retour STRICT JSON :
{
  "frames": <int>,        // nombre de frames (3-30)
  "duration": <int>,      // durée totale en ms
  "html": "<div data-composition-id=...><style>...</style><script>...</script></div>"
}

Règles :
- Frames 3 à 30 max
- duration = frames * (1000/fps) approximativement
- HTML autonome (CSS et JS embedded inline)
- Anti-slop : pas Inter/Roboto, utilise Georgia/serif ou system-ui
- Couleurs cohérentes (palette douce, pas Bootstrap)
- Pas de \\n littéraux dans JSON (échappe correctement)`;

    let collected = '';
    let lastErr: Error | undefined;
    try {
      await aiRouter.stream(
        [{ role: 'user', content: `Compose une animation pour : ${trimmed}` }],
        systemPrompt,
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { lastErr = err; },
      );
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }

    if (lastErr || !collected) {
      logger.warn('hyperframes', 'IA failed, fallback', { err: lastErr?.message });
      return this.fallbackComposition(id, trimmed, tStart);
    }

    let parsed: { frames: number; duration: number; html: string };
    try {
      const m = collected.match(/\{[\s\S]*"frames"[\s\S]*"html"[\s\S]*\}/);
      if (!m) throw new Error('JSON manquant');
      const obj = JSON.parse(m[0]) as { frames?: unknown; duration?: unknown; html?: unknown };
      const frames = typeof obj.frames === 'number' ? Math.max(3, Math.min(30, obj.frames)) : 5;
      const duration = typeof obj.duration === 'number' ? obj.duration : frames * (1000 / DEFAULT_FPS);
      const html = typeof obj.html === 'string' ? obj.html : '';
      if (!html) throw new Error('html vide');
      parsed = { frames, duration, html };
    } catch (err: unknown) {
      logger.warn('hyperframes', 'parse failed, fallback', { err });
      return this.fallbackComposition(id, trimmed, tStart);
    }

    const composition: HyperFrameComposition = {
      id,
      prompt: trimmed,
      html: this.sanitizeHtml(parsed.html),
      frames: parsed.frames,
      duration: parsed.duration,
      fps: DEFAULT_FPS,
      generatedAt: Date.now(),
      durationMs: Date.now() - tStart,
    };

    this.persist(composition);
    void auditLog.record('hyperframes.compose', {
      details: { id, frames: composition.frames, durationMs: composition.durationMs },
    });
    logger.info('hyperframes', `Composed ${composition.frames} frames (${composition.durationMs}ms)`);
    return composition;
  }

  /**
   * Construit srcdoc complet pour iframe sandbox preview.
   */
  buildPreviewSrcdoc(comp: HyperFrameComposition): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>body{margin:0;font-family:Georgia,serif;background:#0e0e1c;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}</style>
</head>
<body>
${comp.html}
</body>
</html>`;
  }

  /**
   * Liste les compositions persistées.
   */
  history(): HyperFrameComposition[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as HyperFrameComposition[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private sanitizeHtml(html: string): string {
    /* Retire iframe imbriquées (sécu) et limite taille */
    return html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '').slice(0, 50000);
  }

  private fallbackComposition(id: string, prompt: string, tStart: number): HyperFrameComposition {
    const frames = 6;
    const html = `<div data-composition-id="${id}" style="position:relative;width:300px;height:200px;background:linear-gradient(135deg,#1a1a2e,#0e0e1c);border-radius:12px;overflow:hidden">
${Array.from({ length: frames }, (_, i) =>
  `<div data-frame-${i} style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-family:Georgia,serif;color:#e8b830;font-size:18px">Frame ${i + 1}</div>`,
).join('\n')}
<script>
(function(){
  var id="${id}";var frames=${frames};var fps=${DEFAULT_FPS};
  window.__timelines = window.__timelines || {};
  /* v13.4.246 — anti timer zombie : clear le timer d'un rendu précédent du même id. */
  var prev = window.__timelines[id];
  if(prev && prev.timer){ try{ clearInterval(prev.timer); }catch(e){} }
  var meta = { fps: fps, frames: frames, duration: frames*(1000/fps) };
  window.__timelines[id] = meta;
  var c=document.querySelector('[data-composition-id="'+id+'"]');
  if(!c)return;
  var i=0;
  var arr=[];for(var k=0;k<frames;k++){var f=c.querySelector('[data-frame-'+k+']');if(f)arr.push(f);}
  if(arr.length===0)return;arr[0].style.display='flex';
  meta.timer=setInterval(function(){arr[i].style.display='none';i=(i+1)%arr.length;arr[i].style.display='flex';},1000/fps);
})();
</script>
</div>`;
    return {
      id,
      prompt,
      html,
      frames,
      duration: frames * (1000 / DEFAULT_FPS),
      fps: DEFAULT_FPS,
      generatedAt: Date.now(),
      durationMs: Date.now() - tStart,
    };
  }

  private persist(comp: HyperFrameComposition): void {
    try {
      const hist = this.history();
      hist.unshift(comp);
      const capped = hist.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch (err: unknown) {
      logger.warn('hyperframes', 'persist failed', { err });
    }
  }
}

export const hyperframes = new HyperFramesService();
