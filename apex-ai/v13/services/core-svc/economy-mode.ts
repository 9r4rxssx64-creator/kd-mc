/**
 * APEX v13.4.36 — Mode Économie tokens admin (Kevin 2026-05-14 directive).
 *
 * Kevin demande :
 * "Bouton économique, Token suivant le travail demandé. Si mode économie, Apex me
 *  dit et me demande si je désactive pour ce travail. Ensuite il remet
 *  automatiquement. Sinon va plus loin (sans économie)."
 *
 * Comportement :
 * 1. Toggle global persisté localStorage `apex_v13_economy_mode`
 * 2. Quand actif : preferences modèle/tokens réduites (claude-haiku au lieu de
 *    sonnet/opus, max_tokens divisé par 2, max_iterations divisé par 2)
 * 3. Pour tâche "expensive" (long-form/image-gen/multi-step) → confirmAndBypass()
 *    affiche modal "Désactiver pour ce travail ?" + restore auto après tâche
 * 4. tempDisabled bypass temporaire — re-armé automatiquement après expiration
 *
 * Critères "expensive task" :
 * - 'long_form_writing' : output > 2000 tokens attendu
 * - 'image_gen' : génération image (DALL-E, SDXL, etc.)
 * - 'video_gen' : génération vidéo
 * - 'multi_step_agent' : pipeline avec 5+ tool calls
 * - 'deep_research' : web search multi-iterations
 * - 'audio_transcription_long' : audio > 10 min
 *
 * Tests : v13_4_36-economy-mode.test.ts
 */

import { logger } from '../../core/logger.js';

export type ExpensiveTaskType =
  | 'long_form_writing'
  | 'image_gen'
  | 'video_gen'
  | 'multi_step_agent'
  | 'deep_research'
  | 'audio_transcription_long';

export interface EconomyState {
  active: boolean;
  tempDisabled: boolean;
  restoreAt: number | null;
  modelOverride: string | null;
  maxTokensFactor: number;
  maxIterationsFactor: number;
}

const STORAGE_KEY = 'apex_v13_economy_mode';
const DEFAULT_TEMP_DURATION_MS = 5 * 60 * 1000; /* 5 min bypass auto */
const ECONOMY_MODEL = 'claude-haiku-4-5-20251001'; /* Plus économique vs opus/sonnet */

const EXPENSIVE_TASK_LABELS: Record<ExpensiveTaskType, string> = {
  long_form_writing: 'Rédaction longue (> 2000 tokens)',
  image_gen: 'Génération image (DALL-E, SDXL)',
  video_gen: 'Génération vidéo',
  multi_step_agent: 'Agent multi-étapes (5+ tool calls)',
  deep_research: 'Recherche approfondie (multi-iterations)',
  audio_transcription_long: 'Transcription audio longue (> 10 min)',
};

class EconomyMode {
  private state: EconomyState = {
    active: false,
    tempDisabled: false,
    restoreAt: null,
    modelOverride: null,
    maxTokensFactor: 1,
    maxIterationsFactor: 1,
  };

  /** Charge depuis localStorage au boot. Reset tempDisabled (bypass NON persisté). */
  init(): void {
    /* v13.4.37 fix : reset tempDisabled au boot — bypass ne survit pas reload
     * (sinon Kevin redémarre l'app avec bypass actif d'une ancienne session). */
    this.state.tempDisabled = false;
    this.state.restoreAt = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EconomyState>;
        if (typeof parsed.active === 'boolean') {
          this.state.active = parsed.active;
          this.applyModelOverride();
        }
      }
    } catch (err: unknown) {
      logger.warn('economy-mode', 'init read failed', { err });
    }
  }

  /** Retourne true si mode économie actif (et pas en bypass temporaire). */
  isActive(): boolean {
    this.checkRestoreExpiry();
    return this.state.active && !this.state.tempDisabled;
  }

  /** Toggle global du mode économie. */
  setActive(active: boolean): void {
    this.state.active = active;
    if (!active) {
      this.state.tempDisabled = false;
      this.state.restoreAt = null;
    }
    this.applyModelOverride();
    this.persist();
    logger.info('economy-mode', `Mode économie ${active ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
  }

  /** Toggle helper. */
  toggle(): boolean {
    this.setActive(!this.state.active);
    return this.state.active;
  }

  /** Retourne snapshot state pour UI/audit. */
  getState(): Readonly<EconomyState> {
    return { ...this.state };
  }

  /** Vérifie si tâche nécessite confirmation user (expensive + mode actif). */
  needsConfirmation(_taskType: ExpensiveTaskType): boolean {
    return this.isActive(); /* En économie actif → toute task expensive demande confirm */
  }

  /**
   * Bypass temporaire pour tâche unique.
   * @param taskType type de tâche pour le label modal
   * @param durationMs durée bypass (défaut 5 min)
   * @returns true si bypass activé, false si refus user (caller doit décider)
   *
   * Note : caller doit appeler `restoreAfter()` manuellement OU laisser
   * le timer auto-restore expirer (5 min par défaut).
   */
  bypassFor(taskType: ExpensiveTaskType, durationMs = DEFAULT_TEMP_DURATION_MS): {
    bypassed: boolean;
    label: string;
    restoreAt: number;
  } {
    this.state.tempDisabled = true;
    this.state.restoreAt = Date.now() + durationMs;
    this.persist();
    logger.info('economy-mode', `Bypass temporaire ${EXPENSIVE_TASK_LABELS[taskType]} (${Math.round(durationMs / 1000)}s)`);
    return {
      bypassed: true,
      label: EXPENSIVE_TASK_LABELS[taskType],
      restoreAt: this.state.restoreAt,
    };
  }

  /** Force restore immédiat (sans attendre timer). */
  restoreNow(): void {
    if (this.state.tempDisabled) {
      this.state.tempDisabled = false;
      this.state.restoreAt = null;
      this.persist();
      logger.info('economy-mode', 'Bypass restoré (mode économie ré-activé)');
    }
  }

  /** Auto-check si bypass expiré → restore automatique. */
  private checkRestoreExpiry(): void {
    if (this.state.tempDisabled && this.state.restoreAt !== null && Date.now() >= this.state.restoreAt) {
      this.state.tempDisabled = false;
      this.state.restoreAt = null;
      this.persist();
      logger.info('economy-mode', 'Auto-restore bypass expiré');
    }
  }

  /** Retourne le modèle à utiliser (override économie ou normal). */
  resolveModel(defaultModel: string): string {
    return this.isActive() && this.state.modelOverride ? this.state.modelOverride : defaultModel;
  }

  /** Retourne max_tokens ajusté selon mode économie. */
  resolveMaxTokens(defaultMax: number): number {
    if (!this.isActive()) return defaultMax;
    return Math.max(256, Math.floor(defaultMax * this.state.maxTokensFactor));
  }

  /** Retourne max iterations ajusté (multi-step agent). */
  resolveMaxIterations(defaultMax: number): number {
    if (!this.isActive()) return defaultMax;
    return Math.max(1, Math.floor(defaultMax * this.state.maxIterationsFactor));
  }

  /** Retourne le label user-friendly pour task type. */
  getTaskLabel(taskType: ExpensiveTaskType): string {
    return EXPENSIVE_TASK_LABELS[taskType];
  }

  /** Build message confirmation pour modal UI. */
  buildConfirmationMessage(taskType: ExpensiveTaskType): string {
    const label = this.getTaskLabel(taskType);
    return `🔋 Mode économie ACTIF.\n\nLa tâche « ${label} » nécessite plus de ressources (modèle premium + tokens étendus + plus d'itérations).\n\nVeux-tu désactiver le mode économie pour cette tâche uniquement ?\n\n• Si OUI → je débloque, je fais, puis remets en économie automatiquement (5 min).\n• Si NON → je continue avec les contraintes économie (résultat possiblement plus court ou moins précis).`;
  }

  private applyModelOverride(): void {
    this.state.modelOverride = this.state.active ? ECONOMY_MODEL : null;
    this.state.maxTokensFactor = this.state.active ? 0.5 : 1;
    this.state.maxIterationsFactor = this.state.active ? 0.5 : 1;
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        active: this.state.active,
        /* tempDisabled + restoreAt NON persistés : reset au boot */
      }));
    } catch (err: unknown) {
      logger.warn('economy-mode', 'persist failed', { err });
    }
  }
}

export const economyMode = new EconomyMode();
