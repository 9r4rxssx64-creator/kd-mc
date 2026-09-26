/**
 * APEX v13 — chat-badges.ts
 * Rendu pur des badges sous les messages assistant : badge provider IA
 * (provider/modèle/latence/coût) + pills d'outils (tool_use).
 *
 * Extrait de features/chat/index.ts (v13.4.292, refactor monolithe sans
 * régression) : fonctions PURES, aucune dépendance d'état module. Re-exportées
 * par index.ts (façade backward-compat — tests + callers internes inchangés).
 */
import { escapeHtml } from './chat-markdown.js';

/** Sous-type minimal requis par renderProviderBadge (compatible DisplayMessage). */
export interface ProviderBadgeMessage {
  role: 'user' | 'assistant' | 'tool_card';
  streaming?: boolean;
  provider?: string;
  modelUsed?: string;
  latencyMs?: number;
  costEur?: number;
}

/** Sous-type minimal requis par renderToolPills (compatible DisplayMessage). */
export interface ToolPillsMessage {
  toolPills?: { name: string; status: 'running' | 'done' }[];
  toolBatchCount?: number;
}

export function renderProviderBadge(msg: ProviderBadgeMessage): string {
  if (msg.role !== 'assistant' || msg.streaming || !msg.provider) return '';
  const parts: string[] = [];
  const ICONS: Record<string, string> = {
    anthropic: '🟧',
    openai: '🟢',
    openrouter: '🔵',
    groq: '⚡',
    gemini: '🔷',
    openclaw: '🐾',
  };
  const icon = ICONS[msg.provider] ?? '🤖';
  parts.push(`${icon} ${escapeHtml(msg.provider)}`);
  if (msg.modelUsed) parts.push(escapeHtml(msg.modelUsed.replace(/^claude-/, '').replace(/-20\d{6}$/, '')));
  if (typeof msg.latencyMs === 'number' && msg.latencyMs > 0) {
    parts.push(`${(msg.latencyMs / 1000).toFixed(1)}s`);
  }
  if (typeof msg.costEur === 'number' && msg.costEur > 0) {
    parts.push(`~${msg.costEur < 0.01 ? '<0,01' : msg.costEur.toFixed(3)}€`);
  } else if (typeof msg.costEur === 'number') {
    parts.push('gratuit');
  }
  return (
    `<div class="ax-provider-badge" style="display:inline-flex;gap:6px;align-items:center;padding:3px 8px;` +
    `background:rgba(255,255,255,0.04);border-radius:6px;font-size:10px;color:var(--ax-text-dim);` +
    `margin:6px 0 0;font-family:'SF Mono',Menlo,monospace;letter-spacing:0.02em" ` +
    `title="Provider utilisé par le routing IA pour cette réponse">${parts.join(' · ')}</div>`
  );
}

export function renderToolPills(msg: ToolPillsMessage): string {
  if (!msg.toolPills || msg.toolPills.length === 0) return '';
  const allDone = msg.toolPills.every((p) => p.status === 'done');
  const pillStyle =
    'padding:4px 8px;background:rgba(201,162,39,0.1);border-radius:8px;' +
    'font-size:11px;color:var(--ax-gold);display:inline-block;margin:4px 4px 4px 0;';
  /* Si tout terminé → résumé compact "▶ N opérations" repliable */
  if (allDone) {
    const count = msg.toolBatchCount ?? msg.toolPills.length;
    const labels = msg.toolPills.map((p) => escapeHtml(p.name)).join(', ');
    return (
      `<details class="ax-tool-pills" style="margin:4px 0;">` +
      `<summary style="${pillStyle}cursor:pointer;">▶ ${count} opération${count > 1 ? 's' : ''}</summary>` +
      `<div style="font-size:11px;color:var(--ax-text-muted);padding:4px 8px;">${labels}</div>` +
      `</details>`
    );
  }
  /* En cours : pills inline `🔧 [name]` */
  return msg.toolPills
    .map((p) => {
      const icon = p.status === 'running' ? '🔧' : '✅';
      return `<span class="ax-tool-pill" style="${pillStyle}">${icon} ${escapeHtml(p.name)}</span>`;
    })
    .join('');
}
