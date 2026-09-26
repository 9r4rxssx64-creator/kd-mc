/**
 * APEX v13 — chat-slash-handlers.ts
 * Handlers des slash-commands admin/autonomie : /resume /statusline /ooda
 * /ultrareview /diag /test /loop /plan /rules /autonomous.
 *
 * Extrait de features/chat/index.ts (v13.4.295, refactor monolithe sans
 * régression). Couplage à l'état chat injecté via SlashCtx (pushAssistant +
 * getConversationLength) — le dispatcher handleSlashCommand reste dans index.ts.
 */
import { APP_VER } from '../../core/bootstrap.js';

import { escapeHtml } from './chat-markdown.js';

/** Contexte injecté : découple les handlers de l'état module de index.ts. */
export interface SlashCtx {
  /** Pousse un message assistant dans la conversation + re-render. */
  pushAssistant: (text: string) => void;
  /** Nombre de messages dans la conversation courante. */
  getConversationLength: () => number;
}

export async function handleResumeCommand(ctx: SlashCtx): Promise<void> {
  try {
    const { autonomousLoop } = await import('../../services/admin/autonomous-loop.js');
    autonomousLoop.resume();
    const snap = autonomousLoop.list();
    ctx.pushAssistant(`▶️ Boucle autonome reprise — ${snap.tasks.length} tâche(s) en file.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur resume : ${msg}`);
  }
}

/* v13.4.252 — /statusline : état synthétique d'Apex. */
export async function handleStatuslineCommand(ctx: SlashCtx): Promise<void> {
  const online = typeof navigator !== 'undefined' && navigator.onLine ? '🟢 en ligne' : '🔴 hors ligne';
  let loop = '—';
  try {
    const { autonomousLoop } = await import('../../services/admin/autonomous-loop.js');
    const snap = autonomousLoop.list();
    loop = snap.paused
      ? `⏸ pausée (${snap.tasks.length})`
      : (snap.intervalActive ? `▶ active (${snap.tasks.length})` : `⏹ arrêtée (${snap.tasks.length})`);
  } catch {
    /* boucle indisponible */
  }
  ctx.pushAssistant(
    '### 📟 Statut Apex\n\n'
    + `- **Version** : \`${APP_VER}\`\n`
    + `- **Réseau** : ${online}\n`
    + `- **Boucle autonome** : ${loop}\n`
    + `- **Conversation** : ${ctx.getConversationLength()} message(s)`,
  );
}

/* v13.4.252 — /ooda : analyse OODA, réutilise le générateur de plan. */
export async function handleOodaCommand(ctx: SlashCtx, objective: string): Promise<void> {
  await handlePlanCommand(ctx, `Analyse OODA (Observe → Orient → Decide → Act) : ${objective}`);
}

/* v13.4.245 — /ultrareview : audit complet Apex (8 axes, mode brutal). Admin only. */
export async function handleUltraReviewCommand(ctx: SlashCtx): Promise<void> {
  try {
    const { auth } = await import('../../services/auth/auth.js');
    if (!auth.isAdminSync()) {
      ctx.pushAssistant('🔒 `/ultrareview` est réservé à l\'admin.');
      return;
    }
    ctx.pushAssistant('🔍 Audit complet Apex en cours… (8 axes, mode brutal — patiente quelques secondes)');
    const { apexSelfAudit } = await import('../../services/admin/apex-self-audit.js');
    const r = await apexSelfAudit.runFullAudit(true);
    const axes = Object.entries(r.axes)
      .map(([k, v]) => `- **${k}** : ${v.score}/100 _(${v.findings_count} finding${v.findings_count > 1 ? 's' : ''})_`)
      .join('\n');
    const steps = r.next_steps.length
      ? '\n\n**Prochaines étapes**\n' + r.next_steps.map((s) => `- ${s}`).join('\n')
      : '';
    ctx.pushAssistant(
      `### 🔍 Ultra-review Apex — ${r.total_score}/100\n\n`
      + `${r.total_findings} finding(s) · ${r.auto_fixed_count} auto-corrigé(s) · `
      + `${r.escalated_count} escaladé(s) · ${(r.duration_ms / 1000).toFixed(1)} s\n\n`
      + `${axes}${steps}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur ultrareview : ${msg}`);
  }
}

/* v13.4.245 — /diag : diagnostic runtime Apex (santé live). Admin only. */
export async function handleDiagCommand(ctx: SlashCtx): Promise<void> {
  try {
    const { auth } = await import('../../services/auth/auth.js');
    if (!auth.isAdminSync()) {
      ctx.pushAssistant('🔒 `/diag` est réservé à l\'admin.');
      return;
    }
    ctx.pushAssistant('🩺 Diagnostic runtime en cours…');
    const { apexRuntimeDiagnostic } = await import('../../services/admin/apex-runtime-diagnostic.js');
    const r = await apexRuntimeDiagnostic.runAll();
    const fails = r.checks.filter((c) => !c.ok)
      .map((c) => `- ❌ **${c.label}** — ${c.detail}`).join('\n');
    ctx.pushAssistant(
      `### 🩺 Diagnostic runtime — ${r.version}\n\n`
      + `✅ ${r.okCount} OK · ❌ ${r.failCount} échec(s)\n\n`
      + `${r.summary}${fails ? '\n\n' + fails : ''}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur diag : ${msg}`);
  }
}

/* v13.4.245 — /test : auto-tests runtime. Admin only. */
export async function handleTestCommand(ctx: SlashCtx): Promise<void> {
  try {
    const { auth } = await import('../../services/auth/auth.js');
    if (!auth.isAdminSync()) {
      ctx.pushAssistant('🔒 `/test` est réservé à l\'admin.');
      return;
    }
    ctx.pushAssistant('🧪 Auto-tests runtime en cours…');
    const { autoTestRunner } = await import('../../services/admin/auto-test-runner.js');
    const r = await autoTestRunner.runAll();
    const fails = r.results.filter((t) => t.status === 'fail')
      .map((t) => `- ❌ ${t.name}${t.error ? ' — ' + t.error : ''}`).join('\n');
    ctx.pushAssistant(
      `### 🧪 Auto-tests — ${r.passed}/${r.total} OK\n\n`
      + `✅ ${r.passed} · ❌ ${r.failed} · ⏭ ${r.skipped} · ${(r.durationMs / 1000).toFixed(1)} s`
      + `${fails ? '\n\n' + fails : ''}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur test : ${msg}`);
  }
}

/* v13.4.3 — Slash command /loop */
export async function handleLoopCommand(ctx: SlashCtx, args: string): Promise<void> {
  try {
    const { autonomousLoop } = await import('../../services/admin/autonomous-loop.js');
    autonomousLoop.start();
    const sub = (args || '').trim().toLowerCase();
    if (sub === '' || sub === 'list') {
      const snap = autonomousLoop.list();
      const lines = snap.tasks.map((t, i) =>
        `- **${i + 1}.** [${t.status}] ${t.task.slice(0, 80)}${t.retries > 0 ? ` _(retries: ${t.retries})_` : ''}`,
      );
      const body = lines.length === 0 ? '_Queue vide._' : lines.join('\n');
      const status = snap.paused ? '⏸ Pausé' : (snap.intervalActive ? '▶ Actif' : '⏹ Arrêté');
      ctx.pushAssistant(`### Loop autonome (${status}, ${snap.tasks.length}/50)\n\n${body}`);
      return;
    }
    if (sub === 'pause' || sub === 'resume') {
      if (sub === 'pause') autonomousLoop.pause();
      else autonomousLoop.resume();
      ctx.pushAssistant(`🔁 Loop ${sub === 'pause' ? 'pausé' : 'repris'}.`);
      return;
    }
    if (sub === 'clear') {
      autonomousLoop.clear();
      ctx.pushAssistant('🧹 Queue loop effacée.');
      return;
    }
    /* sinon = nouvelle task */
    const entry = autonomousLoop.add(args);
    ctx.pushAssistant(`🔁 Tâche ajoutée à la queue : **${entry.task}**\n\nID : \`${entry.id}\`. Tape \`/loop list\` pour voir la queue.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur loop : ${msg}`);
  }
}

/* v13.4.3 — Slash command /plan */
export async function handlePlanCommand(ctx: SlashCtx, objective: string): Promise<void> {
  ctx.pushAssistant('🗺 Génération du plan en cours…');
  try {
    const { planMode } = await import('../../services/admin/plan-mode.js');
    const plan = await planMode.generate(objective);
    const stepsTxt = plan.steps
      .map((s, i) => `${i + 1}. **[${s.risk}]** ${s.title}${s.files.length ? ` — _${s.files.join(', ')}_` : ''}`)
      .join('\n');
    const md = `### 🗺 Plan généré (${plan.steps.length} steps, ${plan.durationMs}ms)\n\n**Objectif :** ${plan.objective}\n\n**Résumé :** ${plan.summary || '_(non précisé)_'}\n\n${stepsTxt}\n\n_Pour exécuter, tape ton message suivant — le plan sera passé en context. Pour annuler : \`planMode.revoke()\` console._`;
    ctx.pushAssistant(md);
    /* v13.4.3 affichage modal preview avec bouton Exécuter */
    try {
      const { modalSheet: ms } = await import('../../ui/modal-sheet.js');
      ms.open({
        title: '🗺 Plan validé ?',
        content: `<div style="font-family:system-ui;padding:12px"><p class="ax-gs-303">${escapeHtml(plan.summary || plan.objective)}</p><pre class="ax-gs-312">${escapeHtml(stepsTxt)}</pre></div>`,
        actions: [
          { label: 'Annuler', variant: 'ghost', onClick: () => { planMode.revoke(); ms.closeAll(); } },
          { label: '✅ Plan validé', variant: 'primary', onClick: () => ms.closeAll() },
        ],
      });
    } catch { /* modal optional */ }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur plan : ${msg}`);
  }
}

/* v13.4.3 — Slash command /rules */
export async function handleRulesCommand(ctx: SlashCtx, args: string): Promise<void> {
  try {
    const { rulesEngine } = await import('../../services/core-svc/rules-engine.js');
    const k = (args || '').trim();
    const rules = k ? rulesEngine.filter(k) : rulesEngine.top(10);
    const md = rulesEngine.renderMarkdown(rules);
    ctx.pushAssistant(md);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur rules : ${msg}`);
  }
}

/* v13.4.352 — /brief : Briefing du jour (Pulse / Daily Brief) — parité flagship.
 * Résumé proactif depuis la mémoire de l'utilisateur. Réutilise memory + aiRouter. */
export async function handleBriefCommand(ctx: SlashCtx): Promise<void> {
  ctx.pushAssistant('☀️ **Briefing du jour** — je prépare ton résumé personnalisé…');
  try {
    const { generateDailyBrief, defaultDailyBriefDeps, markShownToday } = await import('../../services/ai/daily-brief.js');
    const deps = await defaultDailyBriefDeps();
    const brief = await generateDailyBrief(deps);
    markShownToday();
    ctx.pushAssistant(brief || '_(Brief vide)_');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Briefing impossible : ${msg}`);
  }
}

/* v13.4.345 — /recherche : Recherche approfondie (Deep Research) — parité flagship.
 * Décompose → recherche web multi-sources → rapport cité. Réutilise webSearch + aiRouter. */
export async function handleResearchCommand(ctx: SlashCtx, query: string): Promise<void> {
  const q = (query || '').trim();
  if (!q) {
    ctx.pushAssistant('🔬 Usage : `/recherche <sujet>` — recherche web multi-sources + rapport cité.');
    return;
  }
  ctx.pushAssistant(
    `🔬 **Recherche approfondie** — « ${q} »\n\n_Décomposition de la question, recherche web multi-sources et synthèse citée… (patiente ~30 s)_`,
  );
  try {
    const { runDeepResearch, defaultDeepResearchDeps } = await import('../../services/ai/deep-research.js');
    const deps = await defaultDeepResearchDeps();
    const res = await runDeepResearch(q, {}, deps);
    const sourcesTxt = res.sources.length
      ? `\n\n---\n**🔗 Sources (${res.sources.length})**\n` +
        res.sources.map((s) => `[${s.n}] [${s.title}](${s.url})`).join('\n')
      : '';
    ctx.pushAssistant((res.report || '_(Aucun rapport généré)_') + sourcesTxt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Recherche approfondie impossible : ${msg}`);
  }
}

/* v13.4.5 — Slash command /autonomous (mode autonome session-driven) */
export async function handleAutonomousCommand(ctx: SlashCtx, args: string): Promise<void> {
  try {
    const { apexAutonomousMode } = await import('../../services/admin/apex-autonomous-mode.js');
    const { autonomousWatch } = await import('../../services/sentinels/autonomous-watch.js');
    autonomousWatch.start();
    const sub = (args || '').trim();
    const subLower = sub.toLowerCase();

    if (subLower === 'status' || subLower === 'list' || subLower === '') {
      const s = apexAutonomousMode.getActiveSession();
      if (!s) {
        const history = apexAutonomousMode.getHistory(3);
        const histLines = history.length
          ? history
              .map(
                (h, i) =>
                  `${i + 1}. **${h.status}** — ${h.initialObjective.slice(0, 80)} (${h.iterations} iter, ${h.tokensConsumed} tokens)`,
              )
              .join('\n')
          : '_Aucune session passée._';
        ctx.pushAssistant(
          `### 🤖 Mode Autonome\n\n**État :** Inactif.\n\nLance avec \`/autonomous <objectif>\`.\n\n#### Dernières sessions\n${histLines}`,
        );
        return;
      }
      const queue = s.taskQueue.length;
      const done = s.tasksCompleted.filter((t) => t.status === 'done').length;
      const fail = s.tasksCompleted.filter((t) => t.status === 'failed').length;
      const ageMin = Math.round((Date.now() - s.startedAt) / 60000);
      const recentLogs = s.logs.slice(-5).map((l) => `- ${l.level === 'error' ? '❌' : l.level === 'warn' ? '⚠️' : '✅'} ${l.msg.slice(0, 100)}`).join('\n');
      ctx.pushAssistant(
        `### 🤖 Mode Autonome — ${s.status.toUpperCase()}\n\n` +
          `**Objectif :** ${s.initialObjective.slice(0, 200)}\n\n` +
          `- ⏱ Démarré il y a ${ageMin} min\n` +
          `- 🔁 Itérations : ${s.iterations}\n` +
          `- ✅ Tâches faites : ${done} (${fail} fails)\n` +
          `- 📋 Queue : ${queue}\n` +
          `- 📊 Tokens : ${s.tokensConsumed}\n\n` +
          `#### Logs récents\n${recentLogs || '_(aucun)_'}\n\n` +
          `_Stop : \`/autonomous stop\`_`,
      );
      return;
    }

    if (subLower === 'stop' || subLower === 'kill') {
      apexAutonomousMode.stop(undefined, 'slash-stop');
      ctx.pushAssistant('🛑 Mode autonome arrêté.');
      return;
    }
    if (subLower === 'pause') {
      apexAutonomousMode.pause();
      ctx.pushAssistant('⏸ Mode autonome pausé. Reprends avec `/autonomous resume`.');
      return;
    }
    if (subLower === 'resume') {
      apexAutonomousMode.resume();
      ctx.pushAssistant('▶️ Mode autonome repris.');
      return;
    }

    /* Nouvelle session */
    const session = await apexAutonomousMode.start(sub);
    ctx.pushAssistant(
      `🤖 **Mode autonome activé.**\n\n` +
        `**Objectif :** ${session.initialObjective.slice(0, 300)}\n\n` +
        `Je prends le relais — tu peux fermer l'app, je continue jusqu'à fin ou épuisement forfait Anthropic. ` +
        `Tu seras notifié sur Telegram quand quota épuisé.\n\n` +
        `Suivi : \`/autonomous status\`. Arrêt : \`/autonomous stop\`.`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.pushAssistant(`⚠️ Erreur mode autonome : ${msg}`);
  }
}
