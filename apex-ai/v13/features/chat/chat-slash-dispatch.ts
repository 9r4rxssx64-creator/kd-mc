/**
 * APEX v13 — chat-slash-dispatch.ts
 * Dispatcher des slash-commands du chat (handleSlashCommand) + commandes
 * conversation (/search /export /fork) + UI auto-complétion slash.
 *
 * Extrait de features/chat/index.ts (v13.4.308, refactor monolithe). conversation
 * + regenerateLastAssistant injectés une fois via setSlashDispatch (réf stable +
 * callback). Les 10 sous-handlers slash viennent de chat-slash-handlers.
 */
import { APP_VER } from '../../core/bootstrap.js';
import { store } from '../../core/store.js';
import { parseSlashCommand, helpText, SLASH_COMMANDS } from '../../services/admin/slash-commands.js';
import { pickBestArtifact, setCanvasArtifact } from '../../services/ai/artifacts.js';
import { claudeBridge } from '../../services/ai/claude-bridge.js';
import {
  getReasoningEffort,
  setReasoningEffort,
  isNativeThinkingEnabled,
  setNativeThinkingEnabled,
} from '../../services/ai/reasoning-mode.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

import { isAutoReadEnabled, setAutoReadEnabled } from './chat-autoread.js';
import { buildConversationMarkdown, buildExportFilename, buildConversationHtml, buildShareFilename } from './chat-export.js';
import { clearConversationEverywhere, persistConversation } from './chat-persistence.js';
import { renderMessages, pushAssistantMessage } from './chat-render-loop.js';
import { renderSlashAutocomplete } from './chat-renderers.js';
import { searchConversation, buildSearchResultMessage } from './chat-search.js';
import { archiveSession } from './chat-sessions-history.js';
import {
  type SlashCtx,
  handleResumeCommand, handleStatuslineCommand, handleOodaCommand,
  handleUltraReviewCommand, handleDiagCommand, handleTestCommand,
  handleLoopCommand, handlePlanCommand, handleRulesCommand,
  handleAutonomousCommand, handleResearchCommand, handleBriefCommand,
} from './chat-slash-handlers.js';
import { listCodeSnippets } from './chat-snippets.js';

import type { DisplayMessage } from './index.js';

/* État injecté (réfs/callbacks du module chat). */
let conversation: DisplayMessage[] = [];
let regenerateLastAssistant: (rootEl: HTMLElement) => Promise<void> = async () => {};

/** Lie le dispatcher slash à l'état du module chat. */
export function setSlashDispatch(
  conv: DisplayMessage[],
  regen: (rootEl: HTMLElement) => Promise<void>,
): void {
  conversation = conv;
  regenerateLastAssistant = regen;
}

export function handleSlashCommand(rootEl: HTMLElement, text: string): boolean {
  /* v13.4.295 — contexte injecté pour les handlers extraits (chat-slash-handlers.ts). */
  const slashCtx: SlashCtx = {
    pushAssistant: (t: string) => pushAssistantMessage(rootEl, t),
    getConversationLength: () => conversation.length,
  };
  /* v13.4.5 — Alias `/auto` et `/autonome` redirigés vers `/autonomous` (Kevin "mode autonome"). */
  const aliasMap: Record<string, string> = {
    auto: 'autonomous', autonome: 'autonomous',
    audit: 'ultrareview', review: 'ultrareview', ultra: 'ultrareview',
    'ultra-review': 'ultrareview', 'claude-chrome': 'chrome', navigateur: 'chrome',
    memo: 'commands', aide: 'commands', commande: 'commands',
  };
  const normalizedText = (() => {
    if (!text || !text.trim().startsWith('/')) return text;
    const body = text.trim().slice(1);
    const sp = body.indexOf(' ');
    const cmdName = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
    if (aliasMap[cmdName]) {
      const rest = sp === -1 ? '' : body.slice(sp);
      return '/' + aliasMap[cmdName] + rest;
    }
    return text;
  })();
  const parsed = parseSlashCommand(normalizedText);
  if (!parsed.isSlash) return false;
  haptic.tap();
  if (parsed.unknown) {
    /* Inconnue : montre help auto */
    pushAssistantMessage(rootEl, helpText());
    return true;
  }
  const cmd = parsed.command;
  if (!cmd) return false;
  const args = parsed.args ?? '';
  /* v13.4.250 — commandes de navigation : champ `route` -> handler générique */
  if (cmd.route) {
    try {
      store.set('view', cmd.route);
    } catch {
      toast.info('Ouvre la section depuis le menu');
    }
    return true;
  }
  /* Sécurité — commandes qui déclenchent un workflow CI (repository_dispatch).
     /audit → security-suite · /pentest → strix-scan · /web → agent-reach.
     Périmètre borné : une cible URL doit être kd-mc.com (anti-scan d'un tiers). */
  if (cmd.dispatch) {
    void handleDispatchCommand(rootEl, cmd.dispatch, args);
    return true;
  }
  switch (cmd.name) {
    case 'help':
      pushAssistantMessage(rootEl, helpText());
      return true;
    case 'clear':
      conversation.length = 0;
      renderMessages(rootEl);
      /* v13.4.284 — efface aussi local+Firebase+IDB (sinon résurrection au MAJ). */
      void clearConversationEverywhere();
      toast.success('🧹 Conversation effacée (partout)');
      return true;
    case 'voice': {
      const wasEnabled = isAutoReadEnabled();
      setAutoReadEnabled(!wasEnabled);
      toast.info(wasEnabled ? '🔇 Lecture vocale désactivée' : '🔊 Lecture vocale activée');
      return true;
    }
    case 'effort': {
      const lvl = args.trim().toLowerCase();
      const map: Record<string, 'auto' | 'low' | 'medium' | 'high'> = {
        auto: 'auto', direct: 'low', bas: 'low', low: 'low',
        moyen: 'medium', medium: 'medium', med: 'medium',
        élevé: 'high', eleve: 'high', high: 'high', max: 'high',
      };
      const target = map[lvl];
      if (!target) {
        const cur = getReasoningEffort();
        pushAssistantMessage(rootEl, `🧠 Effort de raisonnement actuel : **${cur}**.\n\nUsage : \`/effort auto|direct|moyen|élevé\` — « élevé » affiche la réflexion 💭 avant la réponse.`);
        return true;
      }
      setReasoningEffort(target);
      const labels = { auto: 'Auto', low: 'Direct', medium: 'Moyen', high: 'Élevé (montre la réflexion)' } as const;
      toast.success(`🧠 Effort : ${labels[target]}`);
      return true;
    }
    case 'thinking': {
      /* v13.4.355 : bascule le raisonnement NATIF Anthropic (extended thinking).
       * OPT-IN — n'agit qu'en combinaison avec /effort élevé + provider Anthropic. */
      const a = args.trim().toLowerCase();
      if (a === 'on' || a === '1' || a === 'oui') {
        setNativeThinkingEnabled(true);
        if (getReasoningEffort() !== 'high') setReasoningEffort('high');
        toast.success('🧠 Raisonnement natif Anthropic : ACTIVÉ (effort élevé)');
      } else if (a === 'off' || a === '0' || a === 'non') {
        setNativeThinkingEnabled(false);
        toast.info('🧠 Raisonnement natif Anthropic : désactivé');
      } else {
        const st = isNativeThinkingEnabled() ? 'ACTIVÉ' : 'désactivé';
        pushAssistantMessage(
          rootEl,
          `🧠 Raisonnement natif Anthropic : **${st}**.\n\nUsage : \`/thinking on|off\`. ` +
            'Quand activé, avec un effort « élevé » (`/effort élevé`) et le provider Anthropic, ' +
            'Apex expose sa VRAIE réflexion (extended thinking) dans un bloc repliable 🧠. ' +
            'À tester sur ton iPhone.',
        );
      }
      return true;
    }
    case 'orchestre': {
      /* v13.4.364 (Kevin « Utilise toutes les ia dispo. Orchestre d'ia ») :
       * on/off = auto-orchestration sur gros travail ; avec une question =
       * force l'orchestre (toutes les IA en parallèle + synthèse Claude). */
      const a = args.trim();
      const low = a.toLowerCase();
      void (async () => {
        const { aiOrchestrator } = await import('../../services/ai/ai-orchestrator.js');
        const { crewExperts } = await import('../../services/ai/crew-experts.js');
        if (low === 'on' || low === 'off') {
          aiOrchestrator.setEnabled(low === 'on');
          toast.success(`🎼 Orchestre d'IA auto : ${low === 'on' ? 'ACTIVÉ' : 'désactivé'}`);
          return;
        }
        if (!a) {
          const provs = crewExperts.availableProviders().map((p) => crewExperts.providerName(p)).join(', ');
          const st = aiOrchestrator.isEnabled() ? 'ACTIVÉ (auto sur gros travail)' : 'désactivé';
          pushAssistantMessage(
            rootEl,
            `🎼 **Orchestre d'IA** : ${st}.\n\nIA disponibles : ${provs}.\n\n` +
              'Usage : `/orchestre <ta question>` pour consulter TOUTES les IA en parallèle ' +
              '(synthèse par Claude, divergences citées), ou `/orchestre on|off` pour l\'auto-détection ' +
              '(mots-clés : audit, expert, complet, exhaustif…).',
          );
          return;
        }
        aiOrchestrator.forceNext();
        const { enqueueText } = await import('./chat-engine.js');
        enqueueText(rootEl, a);
      })();
      return true;
    }
    case 'approbations': {
      /* v13.4.357 — Coffre d'autorisations : ouvre la PWA où Kevin valide d'un Face ID.
       * Apex y dépose ses demandes (approval-broker) avant tout acte sensible. */
      const url = 'https://cmcteams.kd-mc.com/tools/approvals/';
      try { window.open(url, '_blank', 'noopener'); } catch { /* popup bloquée */ }
      pushAssistantMessage(
        rootEl,
        '🔐 **Coffre d\'autorisations** ouvert.\n\nJe fais tout le travail à ta place (connexion, paiement, ' +
          'signature, KYC) — il ne te reste que **ton feu vert, 1 geste Face ID**. Quand j\'ai besoin de ton ' +
          `autorisation, une demande apparaît ici : [${url}](${url}).\n\n` +
          '_Rien n\'est fait sans toi : ton Face ID est la preuve que c\'est bien toi qui autorises._',
      );
      return true;
    }
    case 'export':
      void exportConversationMarkdown();
      return true;
    case 'partager':
      void shareConversation();
      return true;
    case 'canvas': {
      const lastA = [...conversation].reverse().find((m) => m.role === 'assistant' && !m.streaming);
      const art = lastA ? pickBestArtifact(lastA.text) : null;
      if (!art) {
        pushAssistantMessage(rootEl, '🎨 Aucun artifact à ouvrir. `/canvas` ouvre le dernier bloc de code/HTML/SVG généré par Apex en édition + aperçu live.');
        return true;
      }
      setCanvasArtifact(art);
      try {
        store.set('view', 'canvas');
      } catch {
        toast.info('Ouvre le Canvas depuis le menu');
      }
      return true;
    }
    case 'snippets': {
      /* v13.4.16 — Liste snippets sauvés via paste intelligent v13.4.14 */
      const snippets = listCodeSnippets();
      if (snippets.length === 0) {
        pushAssistantMessage(rootEl, "💻 Aucun snippet sauvé.\n\nQuand tu colles du code dans le chat, Apex propose 💾 Sauver dans Coffre. Les snippets apparaîtront ici avec `/snippets`.");
        return true;
      }
      /* Format markdown listing : titre + chaque snippet (head + nombre lignes + lang) */
      const lines: string[] = [`💻 **${snippets.length} snippet${snippets.length > 1 ? 's' : ''} sauvé${snippets.length > 1 ? 's' : ''}** :\n`];
      for (let i = 0; i < snippets.length; i++) {
        const s = snippets[i];
        if (!s) continue;
        const date = new Date(s.created).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const preview = s.code.slice(0, 80).replace(/\n/g, ' ');
        lines.push(`${i + 1}. **${s.lang}** · ${s.lines} ligne${s.lines > 1 ? 's' : ''} · ${date}`);
        lines.push(`   \`${preview}${s.code.length > 80 ? '…' : ''}\``);
        lines.push('');
      }
      lines.push('_Note : pour voir un snippet complet, ouvre 🔐 Coffre (UI listing à venir v13.4.17+)._');
      pushAssistantMessage(rootEl, lines.join('\n'));
      return true;
    }
    case 'settings':
      try {
        store.set('view', 'settings');
      } catch {
        /* fallback : toast */
        toast.info('Va dans Réglages depuis le menu');
      }
      return true;
    case 'regen':
      void regenerateLastAssistant(rootEl);
      return true;
    case 'search':
      if (!args) {
        pushAssistantMessage(rootEl, 'Usage : `/search <mot-clé>`');
        return true;
      }
      void searchInConversation(rootEl, args);
      return true;
    case 'copy': {
      const last = [...conversation].reverse().find((m) => m.role === 'assistant' && !m.streaming);
      if (last) {
        void navigator.clipboard?.writeText(last.text);
        toast.success('📋 Dernière réponse copiée');
      } else {
        toast.warn('Aucune réponse Apex à copier');
      }
      return true;
    }
    case 'version':
      pushAssistantMessage(rootEl, `**Apex AI** version \`${APP_VER}\` — Créé par DK`);
      return true;
    case 'fork':
      forkConversation(rootEl);
      return true;
    /* v13.4.3 — IA IRL TikTok */
    case 'loop':
      void handleLoopCommand(slashCtx, args);
      return true;
    case 'plan':
      if (!args) {
        pushAssistantMessage(rootEl, 'Usage : `/plan <objectif>` — génère un plan structuré.');
        return true;
      }
      void handlePlanCommand(slashCtx, args);
      return true;
    case 'rules':
      void handleRulesCommand(slashCtx, args);
      return true;
    case 'recherche':
      void handleResearchCommand(slashCtx, args);
      return true;
    case 'briefing':
      void handleBriefCommand(slashCtx);
      return true;
    /* v13.4.5 — Mode autonome Apex */
    case 'autonomous':
      void handleAutonomousCommand(slashCtx, args);
      return true;
    /* v13.4.245 — commandes audit/diagnostic */
    case 'ultrareview':
      void handleUltraReviewCommand(slashCtx);
      return true;
    case 'diag':
      void handleDiagCommand(slashCtx);
      return true;
    case 'test':
      void handleTestCommand(slashCtx);
      return true;
    /* v13.4.252 — resume / statusline / ooda */
    case 'resume':
      void handleResumeCommand(slashCtx);
      return true;
    case 'statusline':
      void handleStatuslineCommand(slashCtx);
      return true;
    case 'ooda':
      if (!args) {
        pushAssistantMessage(rootEl, 'Usage : `/ooda <objectif>` — analyse Observe-Orient-Decide-Act.');
        return true;
      }
      void handleOodaCommand(slashCtx, args);
      return true;
    default:
      return false;
  }
}

async function searchInConversation(rootEl: HTMLElement, keyword: string): Promise<void> {
  /* v13.4.174 refactor : pure search + format extraits dans chat-search.ts */
  const matches = searchConversation(conversation, keyword);
  pushAssistantMessage(rootEl, buildSearchResultMessage(matches, keyword));
}

/**
 * v13.3.48 — Export conversation au format Markdown.
 */
async function exportConversationMarkdown(): Promise<void> {
  if (conversation.length === 0) {
    toast.warn('Aucune conversation à exporter');
    return;
  }
  /* v13.4.173 refactor : pure transformation extraite dans chat-export.ts */
  const now = new Date();
  const md = buildConversationMarkdown(conversation, APP_VER, now);
  const filename = buildExportFilename(now);
  try {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('📄 Conversation exportée en Markdown');
  } catch {
    /* Fallback clipboard */
    void navigator.clipboard?.writeText(md);
    toast.info('📋 Conversation copiée dans le presse-papiers');
  }
}

/* v13.4.352 — /partager : partage la conversation en HTML autonome (feuille de
 * partage iOS via Web Share API si dispo, sinon téléchargement du fichier). */
async function shareConversation(): Promise<void> {
  if (conversation.length === 0) {
    toast.warn('Aucune conversation à partager');
    return;
  }
  const now = new Date();
  const html = buildConversationHtml(conversation, APP_VER, now);
  const filename = buildShareFilename(now);
  try {
    const file = new File([html], filename, { type: 'text/html' });
    const navShare = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (navShare.share && navShare.canShare?.({ files: [file] })) {
      await navShare.share({ files: [file], title: 'Conversation Apex' });
      return;
    }
  } catch {
    /* partage annulé/échoué → repli téléchargement */
  }
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('📤 Conversation prête à partager (fichier HTML)');
  } catch {
    void navigator.clipboard?.writeText(html);
    toast.info('📋 Conversation copiée (HTML)');
  }
}

/**
 * v13.3.48 — Affiche le panneau autocomplete au-dessus de la barre de saisie.
 */
export function showSlashAutocomplete(rootEl: HTMLElement, prefix: string): void {
  const form = rootEl.querySelector<HTMLFormElement>('#ax-chat-form');
  if (!form) return;
  let panel = rootEl.querySelector<HTMLElement>('.ax-slash-autocomplete-wrap');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'ax-slash-autocomplete-wrap';
    panel.style.cssText = 'position:relative';
    form.parentNode?.insertBefore(panel, form);
  }
  panel.innerHTML = renderSlashAutocomplete(prefix);
  /* Wire clicks */
  panel.querySelectorAll<HTMLElement>('.ax-slash-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset['slashName'];
      if (!name) return;
      const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
      if (ta) {
        ta.value = `/${name}`;
        ta.focus();
        /* Si command sans args attendus, soumettre direct */
        const cmd = SLASH_COMMANDS.find((c) => c.name === name);
        if (cmd && !cmd.requiresArgs) {
          rootEl.querySelector<HTMLFormElement>('#ax-chat-form')?.requestSubmit();
        }
      }
      hideSlashAutocomplete(rootEl);
    });
  });
}

export function hideSlashAutocomplete(rootEl: HTMLElement): void {
  const panel = rootEl.querySelector('.ax-slash-autocomplete-wrap');
  if (panel) panel.remove();
}

/**
 * v13.3.48 — Fork conversation (démarre une nouvelle session, garde la précédente en historique).
 */
function forkConversation(rootEl: HTMLElement): void {
  /* v13.4.175 refactor : archive load+push+save extrait dans chat-sessions-history.ts */
  archiveSession([...conversation]);
  conversation.length = 0;
  /* v13.4.284 — persiste l'état vide pour que l'ancienne session (désormais
   * archivée dans l'historique) ne soit pas rechargée comme « active » au reload. */
  persistConversation(conversation);
  renderMessages(rootEl);
  toast.success('🌿 Nouvelle conversation démarrée');
}

/**
 * Sécurité — déclenche un workflow CI (arsenal hacker éthique) via
 * repository_dispatch. Scellé au périmètre kd-mc.com (une cible URL hors
 * domaine est refusée). Le résultat arrive de façon asynchrone dans Firebase
 * (ax_security_last / ax_strix_last / ax_agent_reach_last) — Apex le lira.
 */
async function handleDispatchCommand(rootEl: HTMLElement, dispatch: string, args: string): Promise<void> {
  const target = (args || '').trim();
  const payload: Record<string, unknown> = {};
  let label = '';

  if (dispatch === 'security-suite') {
    label = '🛡️ Suite sécurité (secrets, deps, SAST, workflows)';
    /* pas d'args : scanne le repo entier */
  } else if (dispatch === 'strix-scan') {
    /* Périmètre borné : une URL doit être kd-mc.com / github.io (anti-scan tiers). */
    if (/^https?:\/\//i.test(target) && !/^https?:\/\/([a-z0-9-]+\.)*kd-mc\.com|9r4rxssx64-creator\.github\.io/i.test(target)) {
      pushAssistantMessage(rootEl, '🚫 Pentest refusé : la cible doit être une app **kd-mc.com** (pas un tiers). Ex : `/pentest kdmc-home/worldmonitor` ou `/pentest https://kd-mc.com/worldmonitor/`.');
      return;
    }
    payload['target'] = target || 'kdmc-home/worldmonitor';
    label = `🕷️ Pentest IA (Strix) sur \`${payload['target'] as string}\``;
  } else if (dispatch === 'agent-reach') {
    if (!target) {
      pushAssistantMessage(rootEl, '🌐 Précise une URL à lire ou une requête. Ex : `/web https://example.com` ou `/web actualité séisme`.');
      return;
    }
    const isUrl = /^https?:\/\//i.test(target);
    payload['channel'] = isUrl ? 'web' : 'search';
    payload['target'] = target;
    label = isUrl ? `🌐 Lecture de \`${target}\`` : `🔎 Recherche « ${target} »`;
  } else if (dispatch === 'perf-audit') {
    /* Périmètre borné : audit perf d'une app kd-mc.com uniquement. */
    if (target && !/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com|9r4rxssx64-creator\.github\.io/i.test(target)) {
      pushAssistantMessage(rootEl, '🚫 Audit refusé : la cible doit être une app **kd-mc.com**. Ex : `/perf https://kd-mc.com/worldmonitor/`.');
      return;
    }
    payload['site'] = target || 'https://kd-mc.com/worldmonitor/';
    label = `⚡ Audit perf (Unlighthouse) de \`${payload['site'] as string}\``;
  } else {
    pushAssistantMessage(rootEl, `Commande sécurité inconnue : ${dispatch}`);
    return;
  }

  toast.info('🚀 Lancement en cours…');
  try {
    const r = await claudeBridge.dispatchWorkflow(dispatch, payload);
    if (r.ok) {
      const resultKey = dispatch === 'security-suite' ? 'security' : dispatch === 'strix-scan' ? 'strix' : dispatch === 'perf-audit' ? 'perf' : 'agent_reach';
      pushAssistantMessage(rootEl, `${label}\n\n✅ Lancé (exec \`${r.exec_id}\`). Ça tourne sur le CI (quelques minutes). Le résultat arrivera dans le Coffre/Apex (\`ax_${resultKey}_last\`). Reviens dans un instant.`);
    } else if (r.reason === 'no_github_token') {
      pushAssistantMessage(rootEl, `${label}\n\n⚠️ Impossible de lancer : aucun **jeton GitHub** dans le Coffre (\`ax_github_token\`). Ajoute-le puis relance.`);
    } else {
      pushAssistantMessage(rootEl, `${label}\n\n⚠️ Échec du lancement (${r.reason ?? 'erreur'}${r.status ? ' HTTP ' + r.status : ''}). Réessaie dans un moment.`);
    }
  } catch (err: unknown) {
    pushAssistantMessage(rootEl, `${label}\n\n⚠️ Erreur : ${String((err as Error)?.message ?? err)}`);
  }
}
