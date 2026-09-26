/**
 * APEX v13.4.10 — Vue admin "🎯 Skills 2026" (Kevin 2026-05-14).
 *
 * Liste tous les skills 2026 actifs + tools disponibles :
 *   - generate_docx/pptx/xlsx/pdf
 *   - mcp_bofip_search, mcp_almanac_research, mcp_legal_search
 *   - generate_design_system, generate_marketing_copy
 *   - skill_factory_create, security_review, code_review
 *   - video_edit, futuristic_module_invoke
 *
 * Stats utilisation (audit log) + bouton "🧪 Tester" par skill.
 * Sécurité : admin-only.
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { skillsWatch } from '../../../services/sentinels/skills-watch.js';
import { toast } from '../../../ui/toast.js';

interface SkillInfo {
  id: string;
  emoji: string;
  name: string;
  description: string;
  tool: string;
  tier: string;
  testParams: Record<string, unknown>;
}

const SKILLS_2026: SkillInfo[] = [
  {
    id: 'docx',
    emoji: '📄',
    name: 'Doc Word (.docx)',
    description: 'Lettres, contrats, CV, rapports — 6 templates',
    tool: 'generate_docx',
    tier: 'client_free',
    testParams: { template: 'letter-formal', data: { subject: 'Test Apex', body: 'Hello' } },
  },
  {
    id: 'pptx',
    emoji: '📊',
    name: 'PowerPoint (.pptx)',
    description: 'Slides pitch, présentations — 7 templates pro+fun',
    tool: 'generate_pptx',
    tier: 'client_free',
    testParams: {
      template: 'pitch-startup',
      title: 'Test',
      author: 'Apex',
      slides: [{ title: 'Test', content: 'Bullet 1' }],
    },
  },
  {
    id: 'xlsx',
    emoji: '📈',
    name: 'Excel (.xlsx)',
    description: 'Tableaux multi-feuilles, formules, formats',
    tool: 'generate_xlsx',
    tier: 'client_free',
    testParams: {
      filename: 'test.xlsx',
      sheets: [{ name: 'Sheet1', data: [['A', 'B'], [1, 2]] }],
    },
  },
  {
    id: 'pdf',
    emoji: '📑',
    name: 'PDF',
    description: 'Factures, devis, certificats — 8 templates',
    tool: 'generate_pdf',
    tier: 'client_free',
    testParams: { template: 'invoice', data: { number: 'TEST-001' } },
  },
  {
    id: 'design',
    emoji: '🎨',
    name: 'Design System',
    description: 'Palette WCAG AA + Impeccable vocab (23 termes)',
    tool: 'generate_design_system',
    tier: 'family',
    testParams: { type: 'palette', mood: 'premium' },
  },
  {
    id: 'marketing',
    emoji: '💡',
    name: 'Marketing Copy',
    description: '23 frameworks (Cialdini, AIDA, FOMO, etc.)',
    tool: 'generate_marketing_copy',
    tier: 'family',
    testParams: { product: 'Apex AI', target_audience: 'Pros' },
  },
  {
    id: 'mcp-bofip',
    emoji: '🇫🇷',
    name: 'MCP BOFiP fiscal',
    description: 'Doctrine fiscale française officielle',
    tool: 'mcp_bofip_search',
    tier: 'client_free',
    testParams: { query: 'TVA jeux de casino' },
  },
  {
    id: 'mcp-almanac',
    emoji: '🔍',
    name: 'MCP Almanac',
    description: 'Deep Research multi-sources',
    tool: 'mcp_almanac_research',
    tier: 'family',
    testParams: { topic: 'AI trends 2026', depth: 'shallow' },
  },
  {
    id: 'mcp-legal',
    emoji: '⚖️',
    name: 'MCP Legal Hunter',
    description: '18M+ docs juridiques 110+ pays',
    tool: 'mcp_legal_search',
    tier: 'family',
    testParams: { country: 'FR', namespace: 'caselaw', query: 'rupture conventionnelle' },
  },
  {
    id: 'security',
    emoji: '🛡',
    name: 'Security Review',
    description: 'Scan vulnérabilités OWASP/CWE — admin only',
    tool: 'security_review',
    tier: 'admin',
    testParams: { scope: 'recent_changes' },
  },
  {
    id: 'code-review',
    emoji: '👀',
    name: 'Code Review (4 agents)',
    description: 'CLAUDE.md compliance + bugs + git history',
    tool: 'code_review',
    tier: 'admin',
    testParams: { files: ['apex-ai/v13/core/memory.ts'] },
  },
  {
    id: 'skill-factory',
    emoji: '🏭',
    name: 'Skill Factory',
    description: 'Crée nouveaux skills à la volée — admin only',
    tool: 'skill_factory_create',
    tier: 'admin',
    testParams: {
      name: 'test-skill',
      description: 'Test',
      when_to_use: 'Test',
    },
  },
  {
    id: 'video-edit',
    emoji: '🎬',
    name: 'Vidéo Edit (ffmpeg.wasm)',
    description: 'Cut, fade, captions, watermark',
    tool: 'video_edit',
    tier: 'family',
    testParams: { operation: 'cut', video_source: 'blob:mock' },
  },
  {
    id: 'futuristic',
    emoji: '🚀',
    name: 'Modules futuristes (60+)',
    description: 'FLUX2, Sora 2, Suno v5, Meshy v4, Kyber post-quantum, WebAR...',
    tool: 'futuristic_module_invoke',
    tier: 'family',
    testParams: { module_id: 'apex-image-gen-flux2-pro' },
  },
];

export function render(rootEl: HTMLElement): void {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `<div class="ax-gs-37">🔒 Réservé admin Kevin</div>`;
    return;
  }

  const skillsCdnReport = skillsWatch.getLastReport('skills-watch');
  const mcpReport = skillsWatch.getLastReport('mcp-health-watch');

  const skillsList = SKILLS_2026.map((skill) => {
    const tierColor =
      skill.tier === 'admin' ? '#ef4444' : skill.tier === 'family' ? '#f59e0b' : '#10b981';
    return `
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
          <div class="ax-gs-6">
            <div class="ax-gs-108">${skill.emoji} ${escapeHtml(skill.name)}</div>
            <div class="ax-gs-109">${escapeHtml(skill.description)}</div>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
              <code style="background:#1e293b;padding:2px 6px;border-radius:4px;font-size:11px;color:#cbd5e1">${escapeHtml(skill.tool)}</code>
              <span style="font-size:11px;color:${tierColor};font-weight:600;text-transform:uppercase">${escapeHtml(skill.tier)}</span>
            </div>
          </div>
          <button
            data-skill-test="${escapeHtml(skill.id)}"
            style="padding:8px 14px;background:#3b82f6;color:#fff;border:0;border-radius:6px;font-size:12px;cursor:pointer;min-height:36px;white-space:nowrap">
            🧪 Tester
          </button>
        </div>
      </div>`;
  }).join('');

  rootEl.innerHTML = `
    <div class="ax-gs-59">
      <h1 class="ax-gs-289">🎯 Skills 2026 — Apex IA</h1>
      <p class="ax-gs-194">
        ${SKILLS_2026.length} skills actifs. Apex IA les utilise <strong>systématiquement</strong> sans demander confirmation.
      </p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:24px">
        <div style="background:#0f172a;border-left:4px solid ${skillsCdnReport?.severity === 'ok' ? '#10b981' : '#f59e0b'};padding:12px 16px;border-radius:8px">
          <div class="ax-gs-117">CDN Libs</div>
          <div class="ax-gs-118">${skillsCdnReport ? escapeHtml(skillsCdnReport.message) : 'Pas encore audité'}</div>
        </div>
        <div style="background:#0f172a;border-left:4px solid ${mcpReport?.severity === 'ok' ? '#10b981' : '#f59e0b'};padding:12px 16px;border-radius:8px">
          <div class="ax-gs-117">MCP Servers</div>
          <div class="ax-gs-118">${mcpReport ? escapeHtml(mcpReport.message) : 'Pas encore audité'}</div>
        </div>
      </div>

      <div>${skillsList}</div>

      <div class="ax-gs-116">
        💡 <strong>Note Kevin :</strong> Tous ces skills sont auto-invoqués par Apex IA selon
        l'intent détecté dans le chat user. Aucune action manuelle Kevin requise.
        Voir <a href="?view=mcp-servers" class="ax-gs-200">🔌 MCP Servers</a> pour
        gérer les serveurs MCP.
      </div>
    </div>
  `;

  /* Wire test buttons */
  rootEl.querySelectorAll('[data-skill-test]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).getAttribute('data-skill-test') ?? '';
      const skill = SKILLS_2026.find((s) => s.id === id);
      if (!skill) return;
      toast.info(`🧪 Test ${skill.tool}...`);
      try {
        const { apexToolsDispatch } = await import('../../../services/core-svc/apex-tools-dispatch.js');
        const result = await apexToolsDispatch.execute(skill.tool, skill.testParams, 'admin');
        const success = (result as { success?: boolean })?.success;
        if (success) {
          toast.success(`✅ ${skill.tool} OK`);
        } else {
          toast.warn(`⚠️ ${skill.tool} : ${JSON.stringify(result).slice(0, 100)}`);
        }
        logger.info('skills.test', `${skill.tool} result`, { result });
      } catch (err) {
        toast.error(`❌ ${skill.tool} : ${err instanceof Error ? err.message : 'error'}`);
        logger.warn('skills.test', 'failed', { err });
      }
    });
  });
}

export function dispose(): void {
  /* No interval — render is idempotent */
}
