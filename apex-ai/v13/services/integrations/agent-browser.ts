/**
 * APEX v13.4.3 — Agent Browser service (Kevin 2026-05-09 — Shubham Skill #2)
 *
 * Mode "agent pilote browser" : reçoit URL + objectif, fetch HTML public, IA analyse DOM
 * et propose actions structurées (click selector, fill form, extract data).
 *
 * Pas d'automation runtime (pas de Playwright in-browser PWA), juste recommandations
 * que Kevin peut appliquer manuellement dans le browser embed Apex.
 *
 * Output : { actions: Array<{type, selector, value}>, summary: string }
 *
 * Anti-CORS : utilise le proxy axGetCachePassthrough déjà existant (services/cache-proxy)
 * sinon best-effort fetch direct.
 *
 * Storage : `apex_v13_agent_browser_history` (max 20 analyses).
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const HISTORY_KEY = 'apex_v13_agent_browser_history';
const HISTORY_MAX = 20;

export type AgentActionType = 'click' | 'fill' | 'extract' | 'navigate' | 'wait' | 'scroll';

export interface AgentAction {
  type: AgentActionType;
  selector?: string;
  value?: string;
  description?: string;
}

export interface AgentBrowserResult {
  id: string;
  url: string;
  goal: string;
  summary: string;
  actions: AgentAction[];
  fetchedAt: number;
  durationMs: number;
  domSize: number;
  fetchOk: boolean;
}

class AgentBrowserService {
  /**
   * Analyse une URL pour atteindre un objectif et retourne les actions à faire.
   */
  async analyze(url: string, goal: string): Promise<AgentBrowserResult> {
    const trimmedUrl = (url || '').trim();
    const trimmedGoal = (goal || '').trim();
    if (!trimmedUrl) throw new Error('URL vide');
    if (!trimmedGoal) throw new Error('Objectif vide');
    if (!/^https?:\/\//i.test(trimmedUrl)) throw new Error('URL doit commencer par http(s)://');

    const tStart = Date.now();
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    /* Fetch HTML public (best-effort, fallback skeleton si CORS) */
    let domHtml = '';
    let fetchOk = false;
    try {
      const r = await fetch(trimmedUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
      if (r.ok) {
        domHtml = await r.text();
        fetchOk = true;
      }
    } catch (err: unknown) {
      logger.info('agent-browser', 'fetch CORS blocked, fallback skeleton', { err });
    }

    /* Trim DOM si trop gros (Anthropic context limit ~200k tokens, on garde 30k chars) */
    const trimmed = this.extractRelevantDom(domHtml).slice(0, 30000);

    const systemPrompt = `Tu es un agent pilote browser. L'utilisateur te donne une URL et un objectif.
Tu analyses le DOM extrait et tu retournes une liste d'actions structurées au format JSON STRICT :
{
  "summary": "résumé 1-2 phrases de la stratégie",
  "actions": [
    { "type": "click|fill|extract|navigate|wait|scroll", "selector": "CSS selector", "value": "valeur si fill", "description": "ce que ça fait" },
    ...
  ]
}

Règles :
- 3 à 10 actions max
- selectors CSS standard (préfère [aria-label], [data-testid], #id, .class)
- type "fill" doit avoir "value"
- type "extract" doit avoir "selector" (ce qu'on extrait)
- description courte humaine`;

    let collected = '';
    try {
      await aiRouter.stream(
        [{
          role: 'user',
          content: `URL : ${trimmedUrl}\nObjectif : ${trimmedGoal}\n\nDOM extrait :\n${trimmed || '(non récupéré, CORS)'}`,
        }],
        systemPrompt,
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { logger.warn('agent-browser', 'stream err', { err }); },
      );
    } catch (err: unknown) {
      logger.warn('agent-browser', 'stream throw', { err });
    }

    let parsed: { summary: string; actions: AgentAction[] };
    try {
      const m = collected.match(/\{[\s\S]*"actions"[\s\S]*\}/);
      if (!m) throw new Error('JSON manquant');
      const obj = JSON.parse(m[0]) as { summary?: string; actions?: AgentAction[] };
      parsed = {
        summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 500) : '',
        actions: Array.isArray(obj.actions) ? obj.actions.slice(0, 10).map((a) => this.sanitizeAction(a)) : [],
      };
    } catch (err: unknown) {
      logger.warn('agent-browser', 'parse failed, fallback', { err });
      parsed = this.fallbackPlan(trimmedGoal);
    }

    const result: AgentBrowserResult = {
      id,
      url: trimmedUrl,
      goal: trimmedGoal,
      summary: parsed.summary || `Plan pour atteindre : ${trimmedGoal}`,
      actions: parsed.actions,
      fetchedAt: Date.now(),
      durationMs: Date.now() - tStart,
      domSize: trimmed.length,
      fetchOk,
    };

    this.persist(result);
    void auditLog.record('agent-browser.analyze', {
      details: { id, url: trimmedUrl, goal: trimmedGoal, actions: result.actions.length },
    });
    logger.info('agent-browser', `Analyzed ${trimmedUrl} (${result.actions.length} actions, ${result.durationMs}ms)`);
    return result;
  }

  /**
   * Liste les analyses persistées.
   */
  history(): AgentBrowserResult[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as AgentBrowserResult[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  /**
   * Extrait les zones intéressantes du DOM (forms, buttons, headings, links).
   */
  private extractRelevantDom(html: string): string {
    if (!html) return '';
    /* Crude extract — strip <script>, <style>, comments */
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    /* Grab heading + form + button + link blocks */
    const matches = stripped.match(/<(?:h[1-6]|button|a|form|input|label|select|textarea|nav|main|header)[^>]*>[^<]{0,200}/gi) ?? [];
    return matches.join('\n');
  }

  private sanitizeAction(a: unknown): AgentAction {
    const obj = (a ?? {}) as { type?: unknown; selector?: unknown; value?: unknown; description?: unknown };
    const validTypes: AgentActionType[] = ['click', 'fill', 'extract', 'navigate', 'wait', 'scroll'];
    const type: AgentActionType = validTypes.includes(obj.type as AgentActionType)
      ? (obj.type as AgentActionType)
      : 'extract';
    const result: AgentAction = {
      type,
      selector: typeof obj.selector === 'string' ? obj.selector.slice(0, 200) : '',
      description: typeof obj.description === 'string' ? obj.description.slice(0, 200) : '',
    };
    if (typeof obj.value === 'string') result.value = obj.value.slice(0, 500);
    return result;
  }

  private fallbackPlan(goal: string): { summary: string; actions: AgentAction[] } {
    return {
      summary: `Plan fallback pour : ${goal}`,
      actions: [
        { type: 'wait', description: 'Attendre chargement page' },
        { type: 'scroll', description: 'Scroller pour découvrir contenu' },
        { type: 'extract', selector: 'main', description: 'Extraire contenu principal' },
      ],
    };
  }

  private persist(r: AgentBrowserResult): void {
    try {
      const hist = this.history();
      hist.unshift(r);
      const capped = hist.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch (err: unknown) {
      logger.warn('agent-browser', 'persist failed', { err });
    }
  }
}

export const agentBrowser = new AgentBrowserService();
