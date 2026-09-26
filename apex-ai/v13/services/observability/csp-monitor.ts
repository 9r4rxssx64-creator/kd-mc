/**
 * APEX v13.3.71 — CSP Monitor (Kevin audit 2026-05-08)
 *
 * Audit Apex IA a détecté 100 violations CSP en 1h (csp-violation-watch
 * dépassé × 20). Scripts bloqués → ressources dynamiques (Pinecone, Firebase,
 * Brave Search, Tavily, etc.) plus permissives.
 *
 * Ce service :
 *  1. Écoute `securitypolicyviolation` events (en complément de bodyguard.ts)
 *  2. Aggrège violations par directive + URI (clé "directive::origin")
 *  3. Calcule rate horaire (rolling window 60 min)
 *  4. Si pattern récurrent (>5/h sur même origin) → escalade Claude Code via
 *     ax_claude_todo + auto-suggest whitelist additions si origine "fiable"
 *  5. Expose stats pour vue admin (vCspViolations)
 *
 * Anti-pattern évité : pas de double-handler avec bodyguard.ts. Bodyguard reste
 * la source de log brut (ax_csp_violations_log), csp-monitor ajoute aggregation
 * + decision logic (escalade/whitelist suggestion).
 *
 * Stockage :
 *  - ax_csp_aggregated_stats : { [key: string]: AggregatedStat } — cap 200 entries
 *  - ax_csp_whitelist_suggestions : Array<{origin, reason, ts}> — cap 50
 *
 * Hook : appeler `cspMonitor.install()` au boot (services-bootstrap.ts).
 */

import { logger } from '../../core/logger.js';
import { claudeBridge } from '../ai/claude-bridge.js';

import { auditLog } from './audit-log.js';

const STATS_KEY = 'ax_csp_aggregated_stats';
const SUGGESTIONS_KEY = 'ax_csp_whitelist_suggestions';
const MAX_STATS_ENTRIES = 200;
const MAX_SUGGESTIONS = 50;
const RATE_WINDOW_MS = 60 * 60 * 1000; /* 1h */
const ESCALATE_THRESHOLD = 5; /* >5 violations/h sur même origin → escalade */
const ESCALATE_COOLDOWN_MS = 6 * 60 * 60 * 1000; /* 6h entre escalades sur même key */

/* Origines considérées "fiables" → suggestion whitelist auto.
 * Heuristique : domaines connus (api.*, accounts.*, *.workers.dev, CDNs majeurs).
 * Si origin matche → on propose whitelist via ax_claude_todo type "fix_bug".
 * Sinon (domaine inconnu/suspect) → on flag "review_required" sans suggestion. */
const TRUSTED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/api\.[a-z0-9-]+\.(com|org|io|net|ai|dev)$/i,
  /^https:\/\/[a-z0-9-]+\.workers\.dev$/i,
  /^https:\/\/cdn\.jsdelivr\.net$/i,
  /^https:\/\/unpkg\.com$/i,
  /^https:\/\/[a-z0-9-]+\.firebaseio\.com$/i,
  /^https:\/\/[a-z0-9-]+\.firebasedatabase\.app$/i,
  /^https:\/\/accounts\.[a-z0-9-]+\.com$/i,
  /^https:\/\/oauth2?\.[a-z0-9-]+\.com$/i,
];

export interface AggregatedStat {
  directive: string;
  origin: string; /* "https://api.example.com" — extraited de blockedURI */
  count: number; /* total cumul */
  recentTs: number[]; /* timestamps dans la fenêtre 1h */
  firstSeen: number;
  lastSeen: number;
  escalatedAt?: number; /* dernier ts d'escalade pour cooldown */
  suggestionStatus?: 'pending' | 'whitelisted' | 'denied' | 'review_required';
  sample?: { sourceFile: string; lineNumber: number; columnNumber: number };
}

export interface WhitelistSuggestion {
  origin: string;
  directive: string;
  reason: string;
  ts: number;
  trusted: boolean;
}

/* Extrait l'origine canonique d'un blockedURI.
 * Cas particuliers :
 *  - blockedURI vide ou "inline"/"eval"/"self" → null (pas une URL externe)
 *  - data:/blob: → null (déjà couverts par CSP keywords)
 *  - URL malformée → null
 */
function extractOrigin(blockedURI: string): string | null {
  if (!blockedURI) return null;
  const lower = blockedURI.toLowerCase();
  if (lower === 'inline' || lower === 'eval' || lower === 'self') return null;
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return null;
  try {
    const u = new URL(blockedURI);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isTrustedOrigin(origin: string): boolean {
  return TRUSTED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

class CSPMonitor {
  private installed = false;
  private listener: ((e: SecurityPolicyViolationEvent) => void) | null = null;

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.listener = (e) => this.handleViolation(e);
    document.addEventListener('securitypolicyviolation', this.listener);
    logger.info('csp-monitor', 'installed (aggregation + escalade)');
  }

  uninstall(): void {
    if (!this.installed) return;
    if (this.listener) document.removeEventListener('securitypolicyviolation', this.listener);
    this.installed = false;
    this.listener = null;
  }

  private handleViolation(e: SecurityPolicyViolationEvent): void {
    try {
      const directive = String(e.violatedDirective || '').slice(0, 100);
      const blockedURI = String(e.blockedURI || '').slice(0, 500);
      const origin = extractOrigin(blockedURI);
      if (!origin) return; /* inline/eval/data — pas pertinent pour aggregation */

      const key = `${directive}::${origin}`;
      const stats = this.loadStats();
      const now = Date.now();
      const entry: AggregatedStat = stats[key] ?? {
        directive,
        origin,
        count: 0,
        recentTs: [],
        firstSeen: now,
        lastSeen: now,
      };
      entry.count += 1;
      entry.lastSeen = now;
      entry.recentTs.push(now);
      /* Trim window 1h */
      const cutoff = now - RATE_WINDOW_MS;
      entry.recentTs = entry.recentTs.filter((t) => t > cutoff);
      /* Sample du contexte source pour debug */
      if (!entry.sample) {
        entry.sample = {
          sourceFile: String(e.sourceFile || '').slice(0, 200),
          lineNumber: e.lineNumber || 0,
          columnNumber: e.columnNumber || 0,
        };
      }
      stats[key] = entry;
      this.persistStats(stats);

      /* Escalade si seuil dépassé + cooldown OK */
      const recentCount = entry.recentTs.length;
      const cooldownOK = !entry.escalatedAt || (now - entry.escalatedAt) > ESCALATE_COOLDOWN_MS;
      if (recentCount > ESCALATE_THRESHOLD && cooldownOK) {
        this.escalate(entry).catch((err: unknown) => {
          logger.warn('csp-monitor', 'escalate failed', { err });
        });
      }
    } catch (err: unknown) {
      logger.warn('csp-monitor', 'handleViolation failed', { err });
    }
  }

  private async escalate(entry: AggregatedStat): Promise<void> {
    const trusted = isTrustedOrigin(entry.origin);
    const recentCount = entry.recentTs.length;
    const suggestion: WhitelistSuggestion = {
      origin: entry.origin,
      directive: entry.directive,
      reason: trusted
        ? `Origin trusted pattern (api.*, workers.dev, CDN). Suggest whitelist in ${entry.directive}.`
        : `Origin unknown — review_required before whitelist.`,
      ts: Date.now(),
      trusted,
    };
    this.appendSuggestion(suggestion);

    /* Update stats : marque escalatedAt + suggestionStatus */
    const stats = this.loadStats();
    const key = `${entry.directive}::${entry.origin}`;
    const stat = stats[key];
    if (stat) {
      stat.escalatedAt = Date.now();
      stat.suggestionStatus = trusted ? 'pending' : 'review_required';
      stats[key] = stat;
      this.persistStats(stats);
    }

    /* Audit log immutable */
    void auditLog.record('csp.escalation', {
      details: {
        directive: entry.directive,
        origin: entry.origin,
        recentCount,
        trusted,
        firstSeen: entry.firstSeen,
      },
    });

    /* Push ax_claude_todo (severity dépend trusted vs unknown) */
    try {
      await claudeBridge.pushTodo({
        type: 'security_finding',
        src: 'apex',
        src_version: document.documentElement.getAttribute('data-app-ver') ?? '',
        title: `CSP violation pattern: ${entry.origin} (${recentCount}/h on ${entry.directive})`,
        description: trusted
          ? `Origin "${entry.origin}" appears trusted (matches api.*/CDN/workers pattern). ` +
            `Suggest adding to ${entry.directive} CSP whitelist in apex-ai/v13/index.html. ` +
            `Recent violations: ${recentCount} in 1h (threshold ${ESCALATE_THRESHOLD}). ` +
            `Sample sourceFile: ${entry.sample?.sourceFile ?? '(unknown)'}. ` +
            `Action: extend connect-src/script-src directive in CSP meta tag.`
          : `Origin "${entry.origin}" is UNKNOWN (does not match trusted patterns). ` +
            `Review required: legitimate dependency or potential injection? ` +
            `Recent violations: ${recentCount} in 1h on directive ${entry.directive}. ` +
            `Sample sourceFile: ${entry.sample?.sourceFile ?? '(unknown)'}. ` +
            `Action: investigate source — if legit add to whitelist, else block.`,
        context: {
          directive: entry.directive,
          origin: entry.origin,
          recentCount,
          totalCount: entry.count,
          trusted,
          sample: entry.sample,
        },
        severity: trusted ? 'medium' : 'high',
      });
      logger.info('csp-monitor', `Escalated to claude-bridge: ${entry.origin} (${recentCount}/h, trusted=${trusted})`);
    } catch (err: unknown) {
      logger.warn('csp-monitor', 'pushTodo failed', { err });
    }
  }

  /* === API publique pour vue admin / sentinelle === */

  getStats(): Record<string, AggregatedStat> {
    return this.loadStats();
  }

  /** Top N origines par count récent (1h). */
  getTopOrigins(limit = 10): Array<{ key: string; entry: AggregatedStat; recentCount: number }> {
    const stats = this.loadStats();
    const cutoff = Date.now() - RATE_WINDOW_MS;
    const arr = Object.entries(stats).map(([key, entry]) => {
      const recentTs = entry.recentTs.filter((t) => t > cutoff);
      return { key, entry, recentCount: recentTs.length };
    });
    arr.sort((a, b) => b.recentCount - a.recentCount);
    return arr.slice(0, limit);
  }

  getSuggestions(): WhitelistSuggestion[] {
    try {
      const raw = localStorage.getItem(SUGGESTIONS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as WhitelistSuggestion[];
    } catch {
      return [];
    }
  }

  /** Vide stats agrégées (admin only — après review). */
  clearStats(): void {
    try {
      localStorage.removeItem(STATS_KEY);
    } catch {
      /* noop */
    }
  }

  /** Vide suggestions (admin only — après application en CSP meta). */
  clearSuggestions(): void {
    try {
      localStorage.removeItem(SUGGESTIONS_KEY);
    } catch {
      /* noop */
    }
  }

  /* === Helpers privés === */

  private loadStats(): Record<string, AggregatedStat> {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, AggregatedStat>;
    } catch {
      return {};
    }
  }

  private persistStats(stats: Record<string, AggregatedStat>): void {
    try {
      /* Cap 200 entries — drop les plus anciens (firstSeen) */
      const entries = Object.entries(stats);
      if (entries.length > MAX_STATS_ENTRIES) {
        entries.sort((a, b) => b[1].lastSeen - a[1].lastSeen);
        const trimmed = Object.fromEntries(entries.slice(0, MAX_STATS_ENTRIES));
        localStorage.setItem(STATS_KEY, JSON.stringify(trimmed));
        return;
      }
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (err: unknown) {
      logger.warn('csp-monitor', 'persistStats failed', { err });
    }
  }

  private appendSuggestion(s: WhitelistSuggestion): void {
    try {
      const raw = localStorage.getItem(SUGGESTIONS_KEY);
      const list: WhitelistSuggestion[] = raw ? (JSON.parse(raw) as WhitelistSuggestion[]) : [];
      /* Dédupe par origin+directive : on ne ré-append pas si déjà suggéré récemment */
      const existing = list.find((x) => x.origin === s.origin && x.directive === s.directive);
      if (existing) {
        existing.ts = s.ts; /* refresh ts pour ordre récent */
        existing.reason = s.reason;
        existing.trusted = s.trusted;
      } else {
        list.push(s);
      }
      const trimmed = list.length > MAX_SUGGESTIONS ? list.slice(-MAX_SUGGESTIONS) : list;
      localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('csp-monitor', 'appendSuggestion failed', { err });
    }
  }
}

export const cspMonitor = new CSPMonitor();
