/**
 * APEX v13.4.5 — Registry des capacités récentes (v13.4.0 → v13.4.5).
 *
 * Source de vérité unique pour :
 *  - System prompt IA (Apex sait ce qu'il vient d'acquérir)
 *  - Vue admin "Mes capacités récentes"
 *  - Sentinelle capabilities-watch (détecte service orphelin si non listé)
 *
 * Kevin règle « Mes compétences IA » : registry mis à jour AUTOMATIQUEMENT à chaque release.
 * Quand on ajoute un service / une feature → entry ici dans le même commit.
 */

export interface Capability {
  version: string;
  name: string;
  service: string;
  method: string;
  desc: string;
  category?: 'audit' | 'ux' | 'ia' | 'security' | 'tooling' | 'memory' | 'orchestration' | 'productivity';
}

export const APEX_RECENT_CAPABILITIES: readonly Capability[] = [
  /* ───────────── v13.4.0 ───────────── */
  {
    version: 'v13.4.0',
    name: 'Dashboard santé live',
    service: 'auto-test-everything',
    method: 'runFullHealthCheck',
    desc: '5 phases auto-test : codes (vault) + liens (dashboards) + sentinelles + connecteurs MCP + vault audit. Renvoie FullHealthReport avec status/score/byCategory.',
    category: 'audit',
  },

  /* ───────────── v13.4.1 ───────────── */
  {
    version: 'v13.4.1',
    name: 'SOS conditionnel + long-press logo',
    service: 'sos-rescue',
    method: 'show/hide',
    desc: 'Caché par défaut. Déclenché long-press logo APEX 800ms ou sentinelle critical. Réduit pollution UI.',
    category: 'ux',
  },

  /* ───────────── v13.4.2 (5 Yury Plugins équivalents) ───────────── */
  {
    version: 'v13.4.2',
    name: 'Security Review',
    service: 'security-review',
    method: 'runFullScan',
    desc: 'Scan OWASP Top 10 + ASVS L2. Audit XSS/CSP/secrets/permissions. Rapport sévérité P0-P3.',
    category: 'security',
  },
  {
    version: 'v13.4.2',
    name: 'Code Review 5 agents parallèles',
    service: 'code-review-multi-agent',
    method: 'review',
    desc: 'Quality + Security + Performance + UX + Compliance. Synthèse avec divergences mises en évidence.',
    category: 'audit',
  },
  {
    version: 'v13.4.2',
    name: 'Frontend Design',
    service: 'frontend-design',
    method: 'generate',
    desc: 'Génère mockups + composants accessibles. Tokens design + WCAG AA.',
    category: 'ux',
  },
  {
    version: 'v13.4.2',
    name: 'Superpowers methodology',
    service: 'superpowers-methodology',
    method: 'start/advance',
    desc: 'Workflow guidé multi-étapes pour features non-triviales. Trace progression.',
    category: 'orchestration',
  },
  {
    version: 'v13.4.2',
    name: 'GStack pipeline',
    service: 'gstack-roles',
    method: 'spawnRole/runFullPipeline',
    desc: 'Orchestration Architect + Engineer + Reviewer + Tester. Chaîne automatique.',
    category: 'orchestration',
  },

  /* ───────────── v13.4.3 (5 Shubham + 3 IA IRL + UX) ───────────── */
  {
    version: 'v13.4.3',
    name: 'HyperFrames composer',
    service: 'hyperframes',
    method: 'compose',
    desc: 'Compose layouts complexes en 1 appel : grid + flex + variants. Sortie HTML/CSS optimisée.',
    category: 'ux',
  },
  {
    version: 'v13.4.3',
    name: 'Agent Browser',
    service: 'agent-browser',
    method: 'analyze',
    desc: 'Analyse pages web pour data extraction structurée. Schema.org + heuristiques.',
    category: 'tooling',
  },
  {
    version: 'v13.4.3',
    name: 'Marketing Psy',
    service: 'marketing-psy',
    method: 'generate',
    desc: 'Génère copies marketing avec triggers Cialdini (réciprocité, rareté, autorité, sympathie, engagement, preuve sociale).',
    category: 'productivity',
  },
  {
    version: 'v13.4.3',
    name: 'Impeccable Design',
    service: 'impeccable-design',
    method: 'applyCommand',
    desc: '23 commandes design rapide (spacing, typography, contrast, hierarchy, etc.) appliquées sans réflexion.',
    category: 'ux',
  },
  {
    version: 'v13.4.3',
    name: 'iOS Simulator preview',
    service: 'ios-simulator',
    method: 'previewURL/openPreview',
    desc: 'Preview URL dans iframe simulant iPhone. Touch targets 44px + safe-area + viewport 375px/390px.',
    category: 'ux',
  },
  {
    version: 'v13.4.3',
    name: '/loop autonomous queue',
    service: 'autonomous-loop',
    method: 'add/list/pause/resume',
    desc: 'Sentinelle 60s pop+execute. File de tâches autonomes (audits, fixes simples, refresh KB).',
    category: 'orchestration',
  },
  {
    version: 'v13.4.3',
    name: '/plan plan mode',
    service: 'plan-mode',
    method: 'createPlan',
    desc: 'JSON {steps, files, risk, rollback}. Permet validation Kevin avant exécution batch.',
    category: 'orchestration',
  },
  {
    version: 'v13.4.3',
    name: '/rules CLAUDE.md compliance',
    service: 'rules-engine',
    method: 'getTopRules/filter',
    desc: 'Parse 50+ règles permanentes CLAUDE.md, filtre par mot-clé, render markdown pour chat.',
    category: 'memory',
  },

  /* ───────────── v13.4.4 (Auto-load docs + skills + anti-régression + capabilities) ───────────── */
  {
    version: 'v13.4.4',
    name: 'Auto-load .claude/ meta files',
    service: 'memory',
    method: 'syncMetaFilesAtBoot/getSkillsContext/getRulesContext',
    desc: 'Fetch automatique skills/hooks/commands/rules .claude/ au boot, cache 6h, injection system prompt IA.',
    category: 'memory',
  },
  {
    version: 'v13.4.4',
    name: 'Rules + errors injection',
    service: 'rules-engine',
    method: 'buildSystemPromptInjection/getTopErrors/markErrorApplied',
    desc: 'Top 50 règles + top 55 erreurs documentées CLAUDE.md auto-injectés à chaque appel IA. Tracking erreurs appliquées.',
    category: 'memory',
  },
  {
    version: 'v13.4.4',
    name: 'Rules injection watch',
    service: 'rules-injection-watch',
    method: 'audit/registerSentinel',
    desc: 'Sentinelle 1×/h vérifie que system prompt contient bien règles + erreurs + skills. Si manquant → re-fetch + escalade.',
    category: 'audit',
  },
  {
    version: 'v13.4.4',
    name: 'No-regression watch',
    service: 'no-regression-watch',
    method: 'snapshotBeforeBatch/checkAll',
    desc: 'Snapshot Git auto avant batch + run subset 5 tests critiques (axHardLogout, vault watch, wake word iOS, bridge planning, mémoire long terme). Toast warn + escalade si fail.',
    category: 'audit',
  },
  {
    version: 'v13.4.4',
    name: 'Recent capabilities registry',
    service: 'apex-recent-capabilities',
    method: 'APEX_RECENT_CAPABILITIES/renderRecentCapabilitiesForPrompt',
    desc: 'Registry single source of truth des capacités v13.4.0+. Lu par memory.ts pour injection prompt + UI.',
    category: 'memory',
  },

  /* ───────────── v13.4.5 (Mode Autonome Apex — Kevin 2026-05-10) ───────────── */
  {
    version: 'v13.4.5',
    name: 'Mode Autonome Apex',
    service: 'apex-autonomous-mode',
    method: 'start/stop/pause/tick',
    desc: 'Apex prend le relais après /autonomous <objectif> et bosse seul jusqu\'à fin ou épuisement forfait. Sessions persistées (localStorage + Firebase). Auto-décomposition sous-tâches. Garde-fous : maxIterations 50, quotaLimit tokens, timeout 5min/task.',
    category: 'orchestration',
  },
  {
    version: 'v13.4.5',
    name: 'Sentinelle autonomous-watch',
    service: 'autonomous-watch',
    method: 'start/tick/forceTick',
    desc: 'Sentinelle 30s dédiée mode autonome (en plus des sentinels standard 60s). Délègue à apex-autonomous-mode.tick(). Stats tickCount + lastTickAt.',
    category: 'audit',
  },
  {
    version: 'v13.4.5',
    name: 'Telegram notifier',
    service: 'telegram-notifier',
    method: 'notify/testConfig/getRecent',
    desc: 'Bridge notifications critiques (cascade : browser push → Telegram worker → Telegram direct → log local). Dedup 6h, priorité critical bypass. Utilisé par mode autonome pour notif quota épuisé.',
    category: 'tooling',
  },
  {
    version: 'v13.4.5',
    name: 'Slash command /autonomous',
    service: 'chat-slash',
    method: 'handleAutonomousCommand',
    desc: 'Slash dans chat : /autonomous <objectif> démarre, /autonomous status affiche état live, /autonomous stop kill. Alias /auto et /autonome supportés.',
    category: 'ux',
  },
  {
    version: 'v13.4.5',
    name: 'Vue admin Mode Autonome',
    service: 'admin-autonomous',
    method: 'render',
    desc: 'Dashboard live mode autonome : session active avec progress bars (itérations/tokens), logs récents, queue + faites, history 10 dernières. Auto-refresh 5s. Kill switch + pause/resume + force-tick.',
    category: 'ux',
  },
  {
    version: 'v13.4.180',
    name: 'Auto-inspection visuelle (Layout Inspector)',
    service: 'apex-layout-inspector',
    method: 'scanDom / screenshot / startAutoMonitor',
    desc: "Apex s'auto-inspecte ! scanDom() audite le DOM courant pour overflow horizontal, boutons hors viewport, petits touch targets (<44px). screenshot() prend bitmap PNG du root via html2canvas (CDN lazy). startAutoMonitor scan toutes 30s + alerte si nouveau bug visuel. Exposé window.apexLayoutInspector pour debug + tool use IA. Kevin règle 'intègre Playwright dans Apex et qu'il sache' : Apex peut diagnostiquer ses propres problèmes UX en autonomie. Workflow CI Playwright multi-projets en complément (Apex + CMCteams + tools/).",
    category: 'audit',
  },
  {
    version: 'v13.4.181',
    name: 'Auto-test fonctionnel runtime (Functional Tester)',
    service: 'apex-functional-tester',
    method: 'testButtonsInView / detectStaleButtons / autoFix / testAndAutoFix',
    desc: "Apex teste RÉELLEMENT ses boutons ! testButtonsInView() simule click sur chaque bouton visible (skip destructifs Supprimer/Reset/Logout via regex + data-test-safe='false'), attend 600ms, observe réaction (URL hash, toast, modal, btn state). Classifie ok/no_response/error/skipped. detectStaleButtons() flag boutons sans handler. autoFix() whitelist : router.dispatch() si >30% no_response + root remount si >3 errors + escalade Claude Code via ax_claude_todo si >50% bugs. testAndAutoFix() cycle scan→fix→re-scan + reporte improvement %. Exposé window.apexFunctionalTester. Kevin règle 'teste réel toutes fonctions et corrige auto bugs comme les vues' : Apex devient son propre QA + auto-réparateur en runtime. Workflow CI Playwright étendu lui aussi (interaction tests cross-projets).",
    category: 'audit',
  },
];

/**
 * v13.4.4 — Render compact pour injection system prompt (cap 1500 chars).
 */
export function renderRecentCapabilitiesForPrompt(maxChars = 1500): string {
  const lines: string[] = ['## ⚡ Tes capacités récentes (v13.4.0 → v13.4.4)'];
  let used = lines[0]!.length + 2;
  for (const cap of APEX_RECENT_CAPABILITIES) {
    const block = `- **${cap.version} ${cap.name}** (${cap.service}.${cap.method}) — ${cap.desc.slice(0, 150)}`;
    if (used + block.length + 1 > maxChars) {
      lines.push('- […]');
      break;
    }
    lines.push(block);
    used += block.length + 1;
  }
  return lines.join('\n');
}

/**
 * v13.4.4 — Liste services référencés par version.
 */
export function listServicesByVersion(version: string): readonly Capability[] {
  return APEX_RECENT_CAPABILITIES.filter((c) => c.version === version);
}

/**
 * v13.4.4 — Permet à la sentinelle capabilities-watch de détecter
 * un service présent dans /services/ mais pas listé ici (= orphelin).
 */
export function getRegisteredServiceIds(): readonly string[] {
  return APEX_RECENT_CAPABILITIES.map((c) => c.service);
}
