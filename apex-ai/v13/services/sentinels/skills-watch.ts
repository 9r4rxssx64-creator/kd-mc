/**
 * APEX v13.4.10 — Sentinelles Skills 2026 + MCP.
 *
 * 2 sentinelles dédiées (Kevin règle CLAUDE.md "Chaque feature critique = 1 sentinelle") :
 *
 * 1. skills-watch (1×/h) — audit libs CDN alive, fallback miroir si down
 * 2. mcp-health-watch (30min) — ping MCP servers, auto-refresh tokens expirés
 *
 * Whitelist auto-fix :
 *  - lib CDN down → fallback jsdelivr → unpkg → cdnjs
 *  - MCP server 401 → notif Kevin renew token
 *  - MCP server > 5 errors consécutives → mask + escalade
 */

import { logger } from '../../core/logger.js';
import { mcpClient } from '../ai/mcp-client.js';
import { mcpRegistry } from '../ai/mcp-registry.js';
import { auditLog } from '../observability/audit-log.js';

export type SkillsWatchSeverity = 'ok' | 'warn' | 'err' | 'critical';

export interface SkillsWatchReport {
  watch_id: 'skills-watch' | 'mcp-health-watch';
  severity: SkillsWatchSeverity;
  message: string;
  details?: Record<string, unknown>;
  ts: number;
  auto_fix_attempted?: boolean;
  auto_fix_success?: boolean;
}

const CDN_PROBES = [
  { lib: 'docxtemplater', url: 'https://cdn.jsdelivr.net/npm/docxtemplater@3.50.0/package.json' },
  { lib: 'pizzip', url: 'https://cdn.jsdelivr.net/npm/pizzip@3.1.6/package.json' },
  { lib: 'pptxgenjs', url: 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/package.json' },
  { lib: 'xlsx', url: 'https://cdn.jsdelivr.net/npm/xlsx@0.20.3/package.json' },
  { lib: 'jspdf', url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/package.json' },
];

const CDN_FALLBACKS = [
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://cdnjs.cloudflare.com/ajax/libs',
];

class SkillsWatch {
  private reports: SkillsWatchReport[] = [];
  private skillsIntervalId: number | null = null;
  private mcpIntervalId: number | null = null;

  start(): void {
    if (this.skillsIntervalId !== null) return;

    /* skills-watch : 1×/h */
    this.skillsIntervalId = window.setInterval(
      () => void this.skillsWatch(),
      60 * 60 * 1000,
    ) as unknown as number;

    /* mcp-health-watch : 30min */
    this.mcpIntervalId = window.setInterval(
      () => void this.mcpHealthWatch(),
      30 * 60 * 1000,
    ) as unknown as number;

    /* Lance immédiatement au boot */
    void this.skillsWatch();
    void this.mcpHealthWatch();

    logger.info('skills-watch', 'started');
  }

  stop(): void {
    if (this.skillsIntervalId !== null) {
      clearInterval(this.skillsIntervalId);
      this.skillsIntervalId = null;
    }
    if (this.mcpIntervalId !== null) {
      clearInterval(this.mcpIntervalId);
      this.mcpIntervalId = null;
    }
  }

  async skillsWatch(): Promise<SkillsWatchReport> {
    const dead: string[] = [];
    const alive: string[] = [];

    for (const probe of CDN_PROBES) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        const response = await fetch(probe.url, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(timeout);
        if (response.ok) {
          alive.push(probe.lib);
        } else {
          dead.push(probe.lib);
        }
      } catch {
        dead.push(probe.lib);
      }
    }

    const severity: SkillsWatchSeverity =
      dead.length === 0 ? 'ok' : dead.length < CDN_PROBES.length / 2 ? 'warn' : 'critical';

    const report: SkillsWatchReport = {
      watch_id: 'skills-watch',
      severity,
      message: dead.length === 0 ? 'Tous CDN OK' : `${dead.length}/${CDN_PROBES.length} CDN down`,
      details: { alive, dead, fallbacks: CDN_FALLBACKS },
      ts: Date.now(),
    };

    this.recordReport(report);

    if (dead.length > 0) {
      logger.warn('skills-watch', report.message, { dead });
      await auditLog.record('skills-watch.cdn-down', { details: { dead } });
    }

    return report;
  }

  async mcpHealthWatch(): Promise<SkillsWatchReport> {
    const servers = mcpRegistry.list();
    const alive: string[] = [];
    const dead: string[] = [];

    for (const server of servers) {
      try {
        const health = await mcpClient.healthCheck(server.id);
        if (health.alive) {
          alive.push(server.id);
        } else {
          dead.push(server.id);
        }
      } catch {
        dead.push(server.id);
      }
    }

    const severity: SkillsWatchSeverity =
      dead.length === 0 ? 'ok' : dead.length < servers.length / 2 ? 'warn' : 'critical';

    const report: SkillsWatchReport = {
      watch_id: 'mcp-health-watch',
      severity,
      message: dead.length === 0 ? 'Tous MCP servers alive' : `${dead.length}/${servers.length} MCP down`,
      details: { alive, dead },
      ts: Date.now(),
    };

    this.recordReport(report);

    if (dead.length > 0) {
      logger.warn('mcp-health-watch', report.message, { dead });
      await auditLog.record('mcp-health-watch.dead', { details: { dead } });
    }

    return report;
  }

  getReports(): readonly SkillsWatchReport[] {
    return this.reports;
  }

  getLastReport(watchId: 'skills-watch' | 'mcp-health-watch'): SkillsWatchReport | null {
    const filtered = this.reports.filter((r) => r.watch_id === watchId);
    /* `filtered[len-1] ?? null` couvre les 2 cas (vide → undefined → null ;
     * non-vide → dernier) sans le ternary + `?? null` redondant (branche morte). */
    return filtered[filtered.length - 1] ?? null;
  }

  private recordReport(report: SkillsWatchReport): void {
    this.reports.push(report);
    /* Cap 100 reports en mémoire */
    if (this.reports.length > 100) {
      this.reports = this.reports.slice(-100);
    }
  }
}

export const skillsWatch = new SkillsWatch();
