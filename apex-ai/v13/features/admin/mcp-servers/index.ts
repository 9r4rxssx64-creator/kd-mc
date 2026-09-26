/**
 * APEX v13.4.10 — Vue admin "🔌 MCP Servers" (Kevin 2026-05-14).
 *
 * Liste serveurs MCP enregistrés (BOFiP fiscal, Almanac, Legal Hunter, custom).
 * - Status alive/dead + bouton re-test
 * - Tools exposés par chaque server
 * - Add custom server (URL + tokenKey Vault)
 * - Last health check + error count
 *
 * Sécurité : admin-only.
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { mcpClient } from '../../../services/ai/mcp-client.js';
import { mcpRegistry } from '../../../services/ai/mcp-registry.js';
import { skillsWatch } from '../../../services/sentinels/skills-watch.js';
import { toast } from '../../../ui/toast.js';

function statusBadge(status: string): string {
  const palette: Record<string, { color: string; emoji: string }> = {
    alive: { color: '#10b981', emoji: '🟢' },
    dead: { color: '#ef4444', emoji: '🔴' },
    unknown: { color: '#94a3b8', emoji: '⚪' },
  };
  const p = palette[status] ?? palette['unknown']!;
  return `<span style="color:${p.color};font-weight:600">${p.emoji} ${escapeHtml(status)}</span>`;
}

export function render(rootEl: HTMLElement): void {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `<div class="ax-gs-37">🔒 Réservé admin Kevin</div>`;
    return;
  }

  void mcpRegistry.init();
  const servers = mcpRegistry.list();
  const lastHealth = skillsWatch.getLastReport('mcp-health-watch');

  const serversList = servers
    .map((s) => {
      const toolsCount = s.toolsExposed?.length ?? 0;
      const lastCheckStr = s.lastCheck
        ? new Date(s.lastCheck).toLocaleString('fr-FR')
        : 'jamais';
      return `
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
            <div>
              <div class="ax-gs-108">${escapeHtml(s.name)}</div>
              <div class="ax-gs-109">${escapeHtml(s.id)}</div>
            </div>
            ${statusBadge(s.status)}
          </div>
          <div style="font-size:12px;color:#cbd5e1;margin:8px 0;word-break:break-all">
            ${escapeHtml(s.url)}
          </div>
          <div style="display:flex;gap:12px;font-size:12px;color:#94a3b8;flex-wrap:wrap;margin-bottom:12px">
            <span>🔧 ${toolsCount} tools</span>
            <span>⏱ ${escapeHtml(lastCheckStr)}</span>
            ${s.errorCount > 0 ? `<span class="ax-gs-110">❌ ${s.errorCount} erreurs</span>` : ''}
          </div>
          <div class="ax-gs-7">
            <button
              data-mcp-test="${escapeHtml(s.id)}"
              style="padding:8px 14px;background:#3b82f6;color:#fff;border:0;border-radius:8px;font-size:13px;cursor:pointer;min-height:36px">
              🧪 Tester
            </button>
            <button
              data-mcp-discover="${escapeHtml(s.id)}"
              style="padding:8px 14px;background:#8b5cf6;color:#fff;border:0;border-radius:8px;font-size:13px;cursor:pointer;min-height:36px">
              🔍 Découvrir tools
            </button>
            ${
              ['bofip', 'almanac', 'legal-hunter'].includes(s.id)
                ? ''
                : `<button
                    data-mcp-remove="${escapeHtml(s.id)}"
                    style="padding:8px 14px;background:#ef4444;color:#fff;border:0;border-radius:8px;font-size:13px;cursor:pointer;min-height:36px">
                    🗑 Retirer
                  </button>`
            }
          </div>
          ${
            toolsCount > 0
              ? `<details style="margin-top:12px;padding:8px;background:#1e293b;border-radius:6px">
                  <summary style="cursor:pointer;font-size:13px;color:#cbd5e1">📋 Voir ${toolsCount} tools exposés</summary>
                  <ul style="margin:8px 0 0 16px;font-size:12px;color:#94a3b8">
                    ${s.toolsExposed.map((t) => `<li>${escapeHtml(t.name)} — ${escapeHtml(t.description)}</li>`).join('')}
                  </ul>
                </details>`
              : ''
          }
        </div>`;
    })
    .join('');

  rootEl.innerHTML = `
    <div class="ax-gs-59">
      <h1 class="ax-gs-289">🔌 MCP Servers</h1>
      <p class="ax-gs-194">
        Model Context Protocol servers connectés à Apex. ${servers.length} server${servers.length > 1 ? 's' : ''} enregistré${servers.length > 1 ? 's' : ''}.
      </p>

      ${
        lastHealth
          ? `<div style="background:#0f172a;border-left:4px solid ${lastHealth.severity === 'ok' ? '#10b981' : '#f59e0b'};padding:12px 16px;border-radius:8px;margin-bottom:24px">
              <div style="font-size:14px;color:#cbd5e1">${escapeHtml(lastHealth.message)}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px">
                Dernier check : ${new Date(lastHealth.ts).toLocaleString('fr-FR')}
              </div>
            </div>`
          : ''
      }

      <div class="ax-gs-180">
        ${serversList || '<p style="color:#94a3b8">Aucun server MCP enregistré.</p>'}
      </div>

      <div style="background:#0f172a;border:1px dashed #334155;border-radius:12px;padding:16px;margin-top:24px">
        <h3 style="font-size:16px;margin-bottom:12px;color:#f1f5f9">➕ Ajouter un MCP server custom</h3>
        <input id="mcp-new-id" placeholder="ID (kebab-case)" class="ax-gs-290">
        <input id="mcp-new-name" placeholder="Nom affiché" class="ax-gs-290">
        <input id="mcp-new-url" placeholder="URL MCP (https://...)" class="ax-gs-290">
        <input id="mcp-new-token-key" placeholder="Clé Vault (optionnel, ex: my_server_token)" style="width:100%;padding:10px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#f1f5f9;margin-bottom:12px;font-size:14px">
        <button id="mcp-new-submit" style="padding:10px 18px;background:#10b981;color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer;min-height:40px">
          ➕ Enregistrer le server
        </button>
      </div>

      <div style="margin-top:32px;padding:16px;background:#0f172a;border-radius:8px;font-size:12px;color:#94a3b8">
        💡 <strong>Note Kevin :</strong> Tokens MCP stockés chiffrés AES-GCM-256 dans Vault Apex.
        Rate-limit 30 req/min par server. Cache LRU 50 entries TTL 1h.
      </div>
    </div>
  `;

  /* Wire handlers */
  rootEl.querySelectorAll('[data-mcp-test]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).getAttribute('data-mcp-test') ?? '';
      toast.info(`Test MCP ${id}...`);
      try {
        const health = await mcpClient.healthCheck(id);
        if (health.alive) {
          toast.success(`✅ ${id} alive (${health.latencyMs}ms)`);
        } else {
          toast.error(`🔴 ${id} dead`);
        }
        render(rootEl);
      } catch (err) {
        toast.error(`Erreur test ${id}`);
        logger.warn('mcp.test', 'failed', { err });
      }
    });
  });

  rootEl.querySelectorAll('[data-mcp-discover]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).getAttribute('data-mcp-discover') ?? '';
      toast.info(`Discovery ${id}...`);
      try {
        await mcpRegistry.discoverTools(id);
        toast.success(`✅ Tools discovered for ${id}`);
        render(rootEl);
      } catch (err) {
        toast.error(`Erreur discovery ${id}`);
        logger.warn('mcp.discover', 'failed', { err });
      }
    });
  });

  rootEl.querySelectorAll('[data-mcp-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).getAttribute('data-mcp-remove') ?? '';
      if (!confirm(`Retirer le server MCP "${id}" ?`)) return;
      await mcpRegistry.unregister(id);
      toast.success(`✅ ${id} retiré`);
      render(rootEl);
    });
  });

  rootEl.querySelector('#mcp-new-submit')?.addEventListener('click', async () => {
    const id = (rootEl.querySelector('#mcp-new-id') as HTMLInputElement | null)?.value?.trim() ?? '';
    const name = (rootEl.querySelector('#mcp-new-name') as HTMLInputElement | null)?.value?.trim() ?? '';
    const url = (rootEl.querySelector('#mcp-new-url') as HTMLInputElement | null)?.value?.trim() ?? '';
    const tokenKey =
      (rootEl.querySelector('#mcp-new-token-key') as HTMLInputElement | null)?.value?.trim() ?? '';

    if (!id || !name || !url) {
      toast.error('ID, nom et URL obligatoires');
      return;
    }
    if (!/^[a-z][a-z0-9-]+$/.test(id)) {
      toast.error('ID doit être kebab-case');
      return;
    }
    if (!url.startsWith('https://')) {
      toast.error('URL doit commencer par https://');
      return;
    }

    const ok = await mcpRegistry.register({
      id,
      name,
      url,
      ...(tokenKey ? { tokenKey } : {}),
    });
    if (ok) {
      toast.success(`✅ ${id} ajouté`);
      render(rootEl);
    } else {
      toast.error(`❌ ${id} existe déjà`);
    }
  });
}

export function dispose(): void {
  /* No interval to clean — render is idempotent */
}
