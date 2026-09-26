/**
 * APEX v13.4.181 — Functional Tester runtime (Kevin "teste réel toutes
 * les fonctions, bouton, systèmes et corrige auto les bugs comme les vues").
 *
 * Complément à apex-layout-inspector (qui scanne le visuel) : ce testeur
 * simule CLICKS réels sur tous les boutons du DOM courant et observe les
 * réactions (navigation, toast, modal, store update, listener trigger).
 *
 * Capacités :
 * 1. testButtonsInView() : itère tous les <button> + [role=button] + a[href]
 *    du DOM courant. Simule click. Attend 600ms. Observe réaction :
 *      - URL hash changé ? (navigation OK)
 *      - Nouveau toast visible ?
 *      - Modal/dialog ouvert ?
 *      - Element disabled/loading state ?
 *      - Pas de réaction = bug "no_response"
 * 2. detectStaleListeners() : boutons sans data-wired ni listener attaché
 * 3. autoFix(report) : whitelist d'auto-fix safe (re-render vue, re-bind
 *    listeners via router.dispatch, clear state corrompu). Si échec →
 *    escalade Claude Code via ax_claude_todo Firebase.
 * 4. ai-callable : Apex IA peut appeler via tool use pour diagnostiquer
 *    en autonomie quand user signale un bug.
 *
 * SAFE-MODE : skip boutons destructifs (data-test-safe="false", "Supprimer",
 * "Effacer", "Logout", "Reset", "Vider", "Reset", "Restore") pour pas
 * casser l'app pendant le scan.
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';

export interface ButtonTestResult {
  selector: string;
  label: string;
  status: 'ok' | 'no_response' | 'skipped_destructive' | 'error' | 'disabled';
  reactions: string[];
  durationMs: number;
  errorMessage?: string;
}

export interface FunctionalTestReport {
  ts: number;
  ver: string;
  viewBefore: string;
  totalButtons: number;
  tested: number;
  skipped: number;
  ok: number;
  noResponse: number;
  errors: number;
  details: ButtonTestResult[];
}

const DESTRUCTIVE_PATTERNS = /supprim|efface|détruir|reset|vider|logout|déconnex|delete|destroy|format|purge|wipe|kill/i;
/* v13.4.255 (Kevin "le test des boutons bloqué sur certain test et s'arrête") :
 * un bouton qui relance un test / audit / diagnostic, cliqué PENDANT le scan
 * fonctionnel, re-déclenche le sous-système de test → récursion / opération
 * longue → le scan se fige. Ces boutons sont skippés pendant le scan. */
const RECURSIVE_PATTERNS = /auto.?test|self.?audit|diagnostic|\baudit\b|lancer.*(test|scan|audit)|run.*(test|audit|now)|tester.*(tout|bouton|maintenant)|re.?test|🧪/i;
const TEST_SAFE_ATTR = 'data-test-safe';
const TEST_DELAY_MS = 600;
const MAX_BUTTONS_PER_SCAN = 40;

function buildSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' && el.className
    ? '.' + el.className.split(/\s+/).slice(0, 2).join('.')
    : '';
  const text = (el.textContent ?? '').trim().slice(0, 20);
  return `${tag}${cls}${text ? `[text="${text}"]` : ''}`;
}

function captureSnapshot(): {
  url: string;
  toastCount: number;
  modalCount: number;
  hash: string;
} {
  return {
    url: location.href,
    hash: location.hash,
    toastCount: document.querySelectorAll('[class*="toast"], [class*="ax-toast"]').length,
    modalCount: document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="ax-sheet"]').length,
  };
}

function isDestructive(btn: HTMLElement): boolean {
  if (btn.getAttribute(TEST_SAFE_ATTR) === 'false') return true;
  const text = (btn.textContent ?? '').trim();
  const aria = btn.getAttribute('aria-label') ?? '';
  const title = btn.getAttribute('title') ?? '';
  return DESTRUCTIVE_PATTERNS.test(text) || DESTRUCTIVE_PATTERNS.test(aria) || DESTRUCTIVE_PATTERNS.test(title);
}

/* Bouton qui relance un test/audit/diagnostic → ne PAS le cliquer pendant
 * un scan fonctionnel (sinon récursion / blocage du scan). */
function isRecursiveTrigger(btn: HTMLElement): boolean {
  const text = (btn.textContent ?? '').trim();
  const aria = btn.getAttribute('aria-label') ?? '';
  const title = btn.getAttribute('title') ?? '';
  return RECURSIVE_PATTERNS.test(text) || RECURSIVE_PATTERNS.test(aria) || RECURSIVE_PATTERNS.test(title);
}

async function testOneButton(btn: HTMLElement): Promise<ButtonTestResult> {
  const selector = buildSelector(btn);
  const label = ((btn.textContent ?? btn.getAttribute('aria-label') ?? '').trim().slice(0, 40)) || '(no label)';
  const start = Date.now();

  if (isDestructive(btn) || isRecursiveTrigger(btn)) {
    return { selector, label, status: 'skipped_destructive', reactions: [], durationMs: 0 };
  }

  if ((btn as HTMLButtonElement).disabled) {
    return { selector, label, status: 'disabled', reactions: [], durationMs: 0 };
  }

  const before = captureSnapshot();
  const reactions: string[] = [];

  try {
    btn.click();
  } catch (err: unknown) {
    return {
      selector,
      label,
      status: 'error',
      reactions: [],
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  /* Wait for async reactions */
  await new Promise((r) => setTimeout(r, TEST_DELAY_MS));
  const after = captureSnapshot();

  if (after.hash !== before.hash) reactions.push(`nav:${before.hash}→${after.hash}`);
  if (after.url !== before.url && after.hash === before.hash) reactions.push(`url_change`);
  if (after.toastCount > before.toastCount) reactions.push(`+${after.toastCount - before.toastCount}toast`);
  if (after.modalCount > before.modalCount) reactions.push(`+${after.modalCount - before.modalCount}modal`);

  /* Check element class/disabled state changed (loading) */
  if ((btn as HTMLButtonElement).disabled) reactions.push('btn_disabled');
  if (btn.classList.contains('loading') || btn.classList.contains('ax-loading')) reactions.push('loading_state');

  const status: ButtonTestResult['status'] = reactions.length > 0 ? 'ok' : 'no_response';
  return { selector, label, status, reactions, durationMs: Date.now() - start };
}

/**
 * Test tous les boutons visibles dans le DOM courant.
 * Skip destructifs + disabled + invisibles + au-delà viewport.
 *
 * @param opts.maxButtons cap nombre boutons testés (défaut 40)
 * @param opts.onProgress callback (current, total) à chaque test
 */
export async function testButtonsInView(opts: {
  maxButtons?: number;
  onProgress?: (current: number, total: number) => void;
} = {}): Promise<FunctionalTestReport> {
  const max = opts.maxButtons ?? MAX_BUTTONS_PER_SCAN;
  const viewBefore = location.hash || '/';
  const allBtns = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a[href]'));

  /* Filter : visible + dans viewport */
  const visible = allBtns.filter((btn) => {
    const cs = getComputedStyle(btn);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    /* Skip si totalement hors viewport */
    if (rect.right < 0 || rect.bottom < 0) return false;
    if (rect.left > window.innerWidth || rect.top > window.innerHeight) return false;
    return true;
  });

  const toTest = visible.slice(0, max);
  const results: ButtonTestResult[] = [];

  /* v13.4.245 (FIX "test bloqué") : un bouton cliqué qui ouvre confirm()/
   * prompt()/alert() FIGE le thread JS jusqu'à réponse user → le scan ne
   * se termine jamais. On neutralise ces dialogues bloquants pendant le
   * scan (réponse instantanée négative) et on les restaure dans finally. */
  const origConfirm = window.confirm;
  const origPrompt = window.prompt;
  const origAlert = window.alert;
  window.confirm = () => false;
  window.prompt = () => null;
  window.alert = () => undefined;

  try {
    for (let i = 0; i < toTest.length; i++) {
      const btn = toTest[i];
      if (!btn) continue;
      opts.onProgress?.(i + 1, toTest.length);
      try {
        const result = await testOneButton(btn);
        results.push(result);
      } catch (err: unknown) {
        results.push({
          selector: buildSelector(btn),
          label: (btn.textContent ?? '').slice(0, 40) || '(error)',
          status: 'error',
          reactions: [],
          durationMs: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    window.confirm = origConfirm;
    window.prompt = origPrompt;
    window.alert = origAlert;
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const noResponse = results.filter((r) => r.status === 'no_response').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const skipped = results.filter((r) => r.status === 'skipped_destructive' || r.status === 'disabled').length;

  return {
    ts: Date.now(),
    ver: 'v13.4.181',
    viewBefore,
    totalButtons: allBtns.length,
    tested: toTest.length,
    skipped,
    ok,
    noResponse,
    errors,
    details: results,
  };
}

/**
 * Détecte boutons sans listener attaché (potential stale wire).
 * Heuristique : pas de onclick, pas de data-* handler, pas dans event delegation root.
 */
export function detectStaleButtons(): string[] {
  const stale: string[] = [];
  document.querySelectorAll<HTMLElement>('button:not([type="submit"])').forEach((btn) => {
    const hasOnclick = btn.onclick !== null;
    const hasDataHandler = Array.from(btn.attributes).some((a) => a.name.startsWith('data-') && /handler|action|route|nav|on/.test(a.name));
    /* Ignore boutons type submit (handled by form) */
    if (!hasOnclick && !hasDataHandler && btn.getAttribute('type') !== 'submit') {
      stale.push(buildSelector(btn));
    }
  });
  return stale.slice(0, 20);
}

/**
 * Auto-fix whitelist : applique fixes safe pour bugs courants.
 * Si pattern récurrent ou no_response > 30%, escalade Claude Code.
 */
export async function autoFix(report: FunctionalTestReport): Promise<{
  applied: string[];
  escalated: boolean;
}> {
  const applied: string[] = [];
  const failureRate = report.tested > 0 ? report.noResponse / report.tested : 0;

  /* Fix 1 : si > 30% no_response, force re-render via router.dispatch */
  if (failureRate > 0.3) {
    try {
      const { router } = await import('../../core/router.js');
      router.dispatch();
      applied.push('router_re_dispatch');
      logger.warn('functional-tester', `High failure rate ${(failureRate * 100).toFixed(0)}% → re-dispatched router`);
    } catch (err: unknown) {
      logger.warn('functional-tester', 'router re-dispatch failed', { err });
    }
  }

  /* Fix 2 : si plusieurs errors → clear stale event listeners via re-mount */
  if (report.errors >= 3) {
    try {
      const root = document.getElementById('apex-root');
      if (root) {
        const html = root.innerHTML;
        safeSetHTML(root, '');
        await new Promise((r) => setTimeout(r, 100));
        safeSetHTML(root, html);
        applied.push('root_remount');
      }
    } catch (err: unknown) {
      logger.warn('functional-tester', 'root remount failed', { err });
    }
  }

  /* Escalade Claude Code si trop de bugs persistants */
  let escalated = false;
  if (failureRate > 0.5 || report.errors > 5) {
    try {
      const todoKey = 'ax_claude_todo';
      const existing = JSON.parse(localStorage.getItem(todoKey) ?? '[]') as unknown[];
      existing.push({
        id: `todo_functional_${Date.now()}`,
        type: 'functional-bugs',
        report: {
          ts: report.ts,
          tested: report.tested,
          noResponse: report.noResponse,
          errors: report.errors,
          view: report.viewBefore,
          samples: report.details.filter((d) => d.status === 'no_response' || d.status === 'error').slice(0, 5),
        },
        severity: 'high',
        ts: Date.now(),
      });
      localStorage.setItem(todoKey, JSON.stringify(existing.slice(-30)));
      escalated = true;
      logger.warn('functional-tester', `Escalated ${report.noResponse + report.errors} bugs to Claude Code`);
    } catch (err: unknown) {
      logger.warn('functional-tester', 'escalation failed', { err });
    }
  }

  return { applied, escalated };
}

/**
 * Test cycle complet : scan → auto-fix → re-scan pour vérifier amélioration.
 */
export async function testAndAutoFix(opts: {
  maxButtons?: number;
} = {}): Promise<{
  before: FunctionalTestReport;
  fixes: { applied: string[]; escalated: boolean };
  after?: FunctionalTestReport;
  improvement: number;
}> {
  const before = await testButtonsInView(opts);
  const fixes = await autoFix(before);
  let after: FunctionalTestReport | undefined;
  let improvement = 0;

  if (fixes.applied.length > 0) {
    /* Wait for re-render */
    await new Promise((r) => setTimeout(r, 1000));
    after = await testButtonsInView(opts);
    improvement = (after.ok - before.ok) / Math.max(1, before.tested);
  }

  return { before, fixes, ...(after ? { after } : {}), improvement };
}

export const apexFunctionalTester = {
  testButtonsInView,
  detectStaleButtons,
  autoFix,
  testAndAutoFix,
};
