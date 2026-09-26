/**
 * APEX v13.4.2 — Frontend Design Generator (Yury Plugin équivalent #3)
 *
 * Génère un composant UI production-grade depuis un prompt user via IA + anti-slop.
 *
 * Anti-slop guidelines (CLAUDE.md règle UX premium) :
 *  - INTERDIT : Inter, Roboto, Open Sans (fonts génériques sans personnalité)
 *  - OBLIGATOIRE : typographies distinctives (Georgia/serif premium ou system-ui curated)
 *  - INTERDIT : box-shadow flat sans intention
 *  - OBLIGATOIRE : animations cubic-bezier(0.16, 1, 0.3, 1) ou similaires (intentional)
 *  - INTERDIT : couleurs Bootstrap par défaut (#007bff, #28a745, etc.)
 *  - OBLIGATOIRE : palette cohérente avec brand Apex (or premium #c9a227 / #e8b830)
 *
 * Output : { html, css, js } — prêt à intégrer dans une preview iframe sandbox.
 *
 * Frameworks supportés : 'vanilla' (HTML+CSS+JS pur) et 'react' (JSX + CSS).
 * Cible PWA browser → pas de SSR, pas de build pipeline.
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

export type Framework = 'vanilla' | 'react';

export interface DesignSpec {
  prompt: string;
  framework?: Framework;
  /** Couleurs de marque optionnelles à respecter */
  brandColors?: { primary?: string; secondary?: string; bg?: string };
  /** Largeur cible (mobile-first) */
  targetWidth?: 'mobile' | 'tablet' | 'desktop';
}

export interface DesignOutput {
  html: string;
  css: string;
  js: string;
  framework: Framework;
  generatedAt: number;
  durationMs: number;
  rawText: string;
}

const HISTORY_KEY = 'apex_v13_frontend_designs_history';
const HISTORY_MAX = 15;

/* Patterns interdits par anti-slop guideline */
const SLOP_PATTERNS: ReadonlyArray<{ rx: RegExp; replacement: string; reason: string }> = [
  { rx: /font-family:\s*['"]?Inter['"]?/gi, replacement: "font-family: Georgia, 'Times New Roman', serif", reason: 'Inter banni (slop)' },
  { rx: /font-family:\s*['"]?Roboto['"]?/gi, replacement: "font-family: Georgia, serif", reason: 'Roboto banni (slop)' },
  { rx: /color:\s*#007bff/gi, replacement: 'color: #c9a227', reason: 'Bootstrap blue banni (slop)' },
  { rx: /background:\s*#28a745/gi, replacement: 'background: #c9a227', reason: 'Bootstrap green banni (slop)' },
];

class FrontendDesignService {
  /**
   * Génère un composant UI depuis prompt user.
   */
  async generate(spec: DesignSpec): Promise<DesignOutput> {
    const tStart = Date.now();
    const framework = spec.framework ?? 'vanilla';

    const systemPrompt = this.buildSystemPrompt(framework, spec);
    const userPrompt = `Crée un composant pour : ${spec.prompt}\n\nRetourne STRICTEMENT en JSON : {"html": "...", "css": "...", "js": "..."}`;

    let collectedText = '';
    let lastErr: Error | undefined;
    try {
      await aiRouter.stream(
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
        (chunk) => {
          if (chunk.text) collectedText += chunk.text;
        },
        (err) => { lastErr = err; },
      );
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }

    if (lastErr || !collectedText) {
      logger.warn('frontend-design', 'IA generation failed, fallback skeleton', { err: lastErr?.message });
      return this.fallbackSkeleton(spec, framework, tStart, collectedText);
    }

    /* Parse JSON output */
    let parsed: { html: string; css: string; js: string };
    try {
      const match = collectedText.match(/\{[\s\S]*"html"[\s\S]*\}/);
      if (!match) throw new Error('JSON manquant');
      parsed = JSON.parse(match[0]) as { html: string; css: string; js: string };
    } catch (err: unknown) {
      logger.warn('frontend-design', 'parse failed, fallback', { err });
      return this.fallbackSkeleton(spec, framework, tStart, collectedText);
    }

    /* Apply anti-slop sanitization */
    const sanitized = {
      html: this.sanitizeHtml(parsed.html ?? ''),
      css: this.applyAntiSlop(parsed.css ?? ''),
      js: this.sanitizeJs(parsed.js ?? ''),
    };

    const output: DesignOutput = {
      html: sanitized.html,
      css: sanitized.css,
      js: sanitized.js,
      framework,
      generatedAt: Date.now(),
      durationMs: Date.now() - tStart,
      rawText: collectedText.slice(0, 5000),
    };

    this.persistOutput(spec, output);
    void auditLog.record('frontend-design.generate', {
      details: { framework, prompt: spec.prompt.slice(0, 100), durationMs: output.durationMs },
    });
    logger.info('frontend-design', `Generated ${framework} component (${output.durationMs}ms)`);
    return output;
  }

  /**
   * Bibliothèque designs récents.
   */
  history(): Array<{ spec: DesignSpec; output: DesignOutput }> {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as Array<{ spec: DesignSpec; output: DesignOutput }>;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /**
   * Construit un srcdoc iframe sandbox prêt à mounter (preview UI).
   */
  buildPreviewSrcdoc(output: DesignOutput): string {
    const reactRuntime = output.framework === 'react'
      ? `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
         <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
         <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>`
      : '';
    const scriptType = output.framework === 'react' ? 'text/babel' : 'text/javascript';
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apex Frontend Preview</title>
${reactRuntime}
<style>${output.css}</style>
</head>
<body>
${output.html}
<script type="${scriptType}">${output.js}</script>
</body>
</html>`;
  }

  buildSystemPrompt(framework: Framework, spec: DesignSpec): string {
    const brand = spec.brandColors;
    const primary = brand?.primary ?? '#c9a227';
    const secondary = brand?.secondary ?? '#e8b830';
    const bg = brand?.bg ?? '#0f0f1a';
    const target = spec.targetWidth ?? 'mobile';

    return `Tu es un designer frontend SENIOR niveau Apple/Linear (production-grade).

ANTI-SLOP STRICT (interdiction absolue) :
 - PAS de fonts génériques : ban Inter, Roboto, Open Sans, Helvetica
 - PAS de couleurs Bootstrap par défaut (#007bff, #28a745, etc.)
 - PAS de box-shadow flat sans intention
 - PAS de border-radius 4px (= flat = mort)
 - PAS de transitions linear (toujours cubic-bezier intentionnel)

OBLIGATOIRE :
 - Typographie distinctive : Georgia/serif premium OU system-ui CURATED
 - Palette brand Apex : primary=${primary}, secondary=${secondary}, bg=${bg}
 - Animations cubic-bezier(0.16, 1, 0.3, 1) ou (0.34, 1.56, 0.64, 1)
 - border-radius >= 12px (ou 0 = brutalist intentionnel)
 - Mobile-first ${target} → touch targets >= 44px
 - Accessibilité : aria-label sur tous les boutons
 - prefers-reduced-motion respecté

Framework cible : ${framework}
${framework === 'react' ? 'Utilise JSX, hooks, pas de class components.' : 'HTML5 + CSS3 + JS vanilla, pas de jQuery.'}

Output : JSON STRICT { "html": "...", "css": "...", "js": "..." }
PAS de markdown, PAS d'explications hors JSON.`;
  }

  applyAntiSlop(css: string): string {
    let out = css;
    for (const pattern of SLOP_PATTERNS) {
      out = out.replace(pattern.rx, pattern.replacement);
    }
    return out;
  }

  private sanitizeHtml(html: string): string {
    /* Strip script tags inline (doivent être dans output.js séparé) */
    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
  }

  private sanitizeJs(js: string): string {
    /* Strip dangerous globals (eval, document.write — XSS vectors) */
    return js.replace(/\beval\s*\(/g, '/* eval blocked */(').replace(/document\.write\s*\(/g, '/* doc.write blocked */(');
  }

  private fallbackSkeleton(spec: DesignSpec, framework: Framework, tStart: number, rawText: string): DesignOutput {
    const safePrompt = spec.prompt
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return {
      html: `<div class="ax-fallback"><h2>${safePrompt}</h2><p>Génération IA indisponible. Skeleton de secours.</p></div>`,
      css: `.ax-fallback{font-family:Georgia,serif;background:#0f0f1a;color:#e8b830;padding:24px;border-radius:14px;border:1px solid rgba(232,184,48,0.3)}`,
      js: '/* fallback no-op */',
      framework,
      generatedAt: Date.now(),
      durationMs: Date.now() - tStart,
      rawText: rawText.slice(0, 500),
    };
  }

  private persistOutput(spec: DesignSpec, output: DesignOutput): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as Array<{ spec: DesignSpec; output: DesignOutput }>;
      const list = Array.isArray(arr) ? arr : [];
      list.push({ spec, output });
      const trimmed = list.slice(-HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('frontend-design', 'persist failed', { err });
    }
  }
}

export const frontendDesign = new FrontendDesignService();
