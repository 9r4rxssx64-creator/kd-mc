/**
 * APEX v13.4.3 — Impeccable Design service (Kevin 2026-05-09 — Shubham Skill #4)
 *
 * Réf : impeccable.style — 23 commandes design fluency pour polir une UI existante.
 *
 * Distinct de frontend-design.ts (génération from scratch) : ici on REVISE
 * un design existant via une commande spécifique (make-it-pop, tighten-spacing, ...).
 *
 * Output : { revisedDesign, changes: Array<{type, before, after}> }
 *
 * Storage : `apex_v13_impeccable_history` (max 30).
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const HISTORY_KEY = 'apex_v13_impeccable_history';
const HISTORY_MAX = 30;

export const IMPECCABLE_COMMANDS = [
  'make-it-pop',
  'add-personality',
  'tighten-spacing',
  'improve-typography',
  'add-microcopy',
  'simplify-layout',
  'add-empty-state',
  'improve-loading',
  'add-feedback',
  'improve-accessibility',
  'polish-animations',
  'add-easter-egg',
  'improve-onboarding',
  'simplify-cta',
  'add-social-proof',
  'improve-hierarchy',
  'add-dark-mode',
  'polish-icons',
  'improve-mobile',
  'add-keyboard-shortcuts',
  'improve-error-states',
  'add-empty-state-illustration',
  'polish-form-validation',
] as const;

export type ImpeccableCommand = (typeof IMPECCABLE_COMMANDS)[number];

export interface ImpeccableChange {
  type: string;
  before: string;
  after: string;
}

export interface ImpeccableResult {
  id: string;
  command: ImpeccableCommand;
  revisedDesign: string;
  changes: ImpeccableChange[];
  inputSize: number;
  outputSize: number;
  generatedAt: number;
  durationMs: number;
}

const COMMAND_DESCRIPTIONS: Record<ImpeccableCommand, string> = {
  'make-it-pop': 'Augmente le contraste, ajoute accent doré subtil, hover micro-anim.',
  'add-personality': 'Touche unique (curseur custom, transition signature, easter egg discret).',
  'tighten-spacing': 'Resserre les espacements (réduit padding gratuit, aligne sur 8px grid).',
  'improve-typography': 'Hiérarchie typo claire (heading vs body vs caption), kerning, line-height optimaux.',
  'add-microcopy': 'Ajoute textes contextuels rassurants (helper text, tooltips, exemples).',
  'simplify-layout': 'Retire éléments redondants, regroupe logiquement, hiérarchise.',
  'add-empty-state': 'État vide explicite avec icône + texte + CTA action.',
  'improve-loading': 'Skeleton screens, progress indicators, optimistic UI.',
  'add-feedback': 'Toast confirmation, haptic, sound subtil, micro-animations success/error.',
  'improve-accessibility': 'aria-labels, focus visible, contrast WCAG AA, keyboard nav.',
  'polish-animations': 'cubic-bezier intentional, GPU-accelerated transform/opacity, prefer-reduced-motion.',
  'add-easter-egg': 'Konami code, long-press logo, secret hover discret.',
  'improve-onboarding': 'Tour guidé 3-5 cards, tooltips premier launch, valeur en 60s.',
  'simplify-cta': 'CTA unique principal, hiérarchie boutons (primary/secondary/ghost).',
  'add-social-proof': 'Logos clients, témoignages courts, compteurs vivants.',
  'improve-hierarchy': 'F-pattern, focus visuel clair, zones aérées, headings tailles cohérentes.',
  'add-dark-mode': 'Token CSS dual --ax-bg-light/--ax-bg-dark, toggle persistant.',
  'polish-icons': 'Iconset cohérent (1 famille), 24px standard, alignment optique.',
  'improve-mobile': 'Touch targets 44px+, safe-area-insets, no horizontal scroll.',
  'add-keyboard-shortcuts': 'Cmd+K palette, ?, Esc, Enter, navigation arrow keys.',
  'improve-error-states': 'Erreur claire + cause + action + lien aide. Pas de stack trace user.',
  'add-empty-state-illustration': 'SVG illustration légère 200×200 + texte motivant.',
  'polish-form-validation': 'Validation live, error inline rouge, success vert, helper text.',
};

class ImpeccableDesignService {
  /**
   * Applique une commande de design fluency sur un design existant.
   */
  async applyCommand(command: string, currentDesign: string): Promise<ImpeccableResult> {
    const cmd = (command || '').trim() as ImpeccableCommand;
    if (!IMPECCABLE_COMMANDS.includes(cmd)) {
      throw new Error(`Commande inconnue. Valides : ${IMPECCABLE_COMMANDS.join(', ')}`);
    }
    const design = (currentDesign || '').trim();
    if (!design) throw new Error('Design vide');

    const tStart = Date.now();
    const id = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const description = COMMAND_DESCRIPTIONS[cmd];
    const systemPrompt = `Tu es un expert designer UI avec 10 ans d'expérience.
Tu reçois un design existant (HTML/CSS/JSX) et tu dois appliquer la commande "${cmd}".

Description de la commande : ${description}

Format de retour STRICT JSON :
{
  "revisedDesign": "le design révisé complet",
  "changes": [
    { "type": "spacing|color|typography|...", "before": "valeur avant", "after": "valeur après" },
    ...
  ]
}

Règles :
- Anti-slop : pas Inter/Roboto/Bootstrap colors. Privilégie Georgia/serif, palette douce, animations cubic-bezier(0.16,1,0.3,1).
- Conserve la structure HTML existante (modifie juste ce qui est demandé).
- 3 à 8 changes décrits.
- Pas de réécriture from scratch — RÉVISION targeted.`;

    let collected = '';
    try {
      await aiRouter.stream(
        [{ role: 'user', content: `Commande : ${cmd}\n\nDesign actuel :\n${design}` }],
        systemPrompt,
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { logger.warn('impeccable-design', 'stream err', { err }); },
      );
    } catch (err: unknown) {
      logger.warn('impeccable-design', 'stream throw', { err });
    }

    let parsed: { revisedDesign: string; changes: ImpeccableChange[] };
    try {
      const m = collected.match(/\{[\s\S]*"revisedDesign"[\s\S]*\}/);
      if (!m) throw new Error('JSON manquant');
      const obj = JSON.parse(m[0]) as { revisedDesign?: unknown; changes?: ImpeccableChange[] };
      parsed = {
        revisedDesign: typeof obj.revisedDesign === 'string' ? obj.revisedDesign : design,
        changes: Array.isArray(obj.changes) ? obj.changes.slice(0, 8).map((c) => this.sanitizeChange(c)) : [],
      };
      if (!parsed.revisedDesign) throw new Error('revisedDesign vide');
    } catch (err: unknown) {
      logger.warn('impeccable-design', 'parse failed, fallback', { err });
      parsed = this.fallbackResult(cmd, design);
    }

    const result: ImpeccableResult = {
      id,
      command: cmd,
      revisedDesign: parsed.revisedDesign,
      changes: parsed.changes,
      inputSize: design.length,
      outputSize: parsed.revisedDesign.length,
      generatedAt: Date.now(),
      durationMs: Date.now() - tStart,
    };

    this.persist(result);
    void auditLog.record('impeccable-design.apply', {
      details: { id, command: cmd, durationMs: result.durationMs },
    });
    logger.info('impeccable-design', `Applied ${cmd} (${result.changes.length} changes, ${result.durationMs}ms)`);
    return result;
  }

  /**
   * Liste les 23 commandes disponibles avec descriptions.
   */
  listCommands(): Array<{ id: ImpeccableCommand; description: string }> {
    return IMPECCABLE_COMMANDS.map((id) => ({ id, description: COMMAND_DESCRIPTIONS[id] }));
  }

  /**
   * Histoire des révisions.
   */
  history(): ImpeccableResult[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as ImpeccableResult[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private sanitizeChange(c: unknown): ImpeccableChange {
    const obj = (c ?? {}) as { type?: unknown; before?: unknown; after?: unknown };
    return {
      type: typeof obj.type === 'string' ? obj.type.slice(0, 100) : 'change',
      before: typeof obj.before === 'string' ? obj.before.slice(0, 500) : '',
      after: typeof obj.after === 'string' ? obj.after.slice(0, 500) : '',
    };
  }

  private fallbackResult(cmd: ImpeccableCommand, design: string): { revisedDesign: string; changes: ImpeccableChange[] } {
    return {
      revisedDesign: design,
      changes: [
        { type: 'fallback', before: '(non analysé)', after: `Commande "${cmd}" non appliquée — IA indisponible.` },
      ],
    };
  }

  private persist(r: ImpeccableResult): void {
    try {
      const hist = this.history();
      hist.unshift(r);
      const capped = hist.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch (err: unknown) {
      logger.warn('impeccable-design', 'persist failed', { err });
    }
  }
}

export const impeccableDesign = new ImpeccableDesignService();
