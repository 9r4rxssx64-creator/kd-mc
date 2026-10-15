/**
 * APEX v13 — Feature Chat (qualité ULTRA Claude.ai/ChatGPT level)
 *
 * Demande Kevin (rebuild plan) :
 * "J'insiste aussi sur la qualité du chat qui n'était vraiment pas à niveau"
 *
 * Standards :
 * - Streaming token-par-token avec animation typing fluide (CSS transition + RAF)
 * - Auto-scroll smooth `behavior:'smooth'` à chaque chunk
 * - Indicateur "Apex réfléchit..." live (équivalent Claude Code)
 * - Markdown rendering progressif (parser as-you-go)
 * - replaceChildren (pas innerHTML brutal)
 * - Aucune erreur technique brute affichée user
 * - Queue messages : Kevin peut envoyer 5 messages d'affilée, tous traités
 */

import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { aiRouter } from '../../services/ai/ai-router.js';
import { isFeatureEnabled, renderDisabledNotice } from '../../services/auth/feature-toggles.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
import { haptic } from '../../ui/haptic.js';
import { modalSheet } from '../../ui/modal-sheet.js';
import { skeleton } from '../../ui/skeleton.js';
import { toast } from '../../ui/toast.js';

/* v13.4.165-172 refactor : modules extraits depuis chat/index.ts pour testabilité. */
import { wireAttachments } from './chat-attach-wiring.js';
import { isAutoReadEnabled, setAutoReadEnabled, maybeAutoReadAssistant } from './chat-autoread.js';
import { renderProviderBadge, renderToolPills } from './chat-badges.js';
import { wireCameraButton } from './chat-camera-wiring.js';
import { autoAnalyzeDeviceImage } from './chat-device-analyze.js';
import { processQueue, setEngineState } from './chat-engine.js';
import { wireChatInput } from './chat-input-wiring.js';
import { openMemoryModal, setMemoryModalConversation } from './chat-memory-modal.js';
import { handleSpeakAction, handleCopyAction, handleExportPdfAction } from './chat-message-actions.js';
import { wireMicButton, wireWakeButton } from './chat-mic-wiring.js';
import { wireLogoAndModeToggle, wireMenuButton, wireSettingsAndPasteKey } from './chat-misc-wiring.js';
import {
  clearConversationEverywhere,
  loadPersistedConversation,
  tryFirebaseRestoreConversation,
} from './chat-persistence.js';
import { renderMessages, wireScrollToBottomFab, setRenderLoopConversation } from './chat-render-loop.js';
import { handleSlashCommand, showSlashAutocomplete, hideSlashAutocomplete, setSlashDispatch } from './chat-slash-dispatch.js';
import { buildChatShellHtml } from './chat-view-template.js';

/* v13.3.48 — Cap context conversation pour HTTP 400 et perf
 * Garde max 30 derniers messages user/assistant. Drop les plus anciens. */

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
  ts: number;
  streaming?: boolean;
  /* P0 Kevin v13.1.0 : pills tool_use discrètes inline pendant streaming.
     Au lieu de cards massives, on affiche `🔧 [name]` en pill horizontal
     puis `✅ N opérations` quand done. */
  toolPills?: { name: string; status: 'running' | 'done' }[];
  toolBatchCount?: number;
  /* v13.4.11 fix Kevin "Apex n'a pas accès aux pièces jointes" — base64 + mime
   * pour reconstruire content array Anthropic au moment d'appel IA. */
  attachments?: Array<{ mime: string; base64: string; name: string }>;
  /* v13.4.273 (Kevin "Revois l'utilisation des différentes ia que tout soit
   * bien en place") : badge "via [provider]" sous chaque réponse IA.
   * Renseigné par stream() depuis aiRouter — lecture seule côté UI. */
  provider?: string;
  modelUsed?: string;
  latencyMs?: number;
  costEur?: number;
  /* v13.4.355 : réflexion NATIVE Anthropic (extended thinking) streamée à part du texte.
   * Affichée dans un bloc repliable, JAMAIS concaténée au contenu de la réponse. */
  nativeThinking?: string;
}

/* v13.4.11 — Queue attachments en attente de submit (vidée après chaque user message envoyé).
 * v13.4.122 fix : utilise `var` (hoisting classique, pas de TDZ) au lieu de `let` pour
 * éviter ReferenceError "Cannot access before initialization" dans vitest happy-dom quand
 * render() est appelé pendant que le module est partiellement chargé. var réutilise la
 * même sémantique au runtime que let pour les réassignations.
 * eslint-disable-next-line no-var */
 
var pendingAttachments: Array<{ mime: string; base64: string; name: string }> = [];
/* v13.4.12 — Promises FileReader en cours, pour await au submit (anti race condition). */
 
var pendingAttachmentPromises: Array<Promise<void>> = [];

/* v13.4.172 refactor Kevin "expert sans régression" :
 * loadPersistedConversation / persistConversation / tryFirebaseRestoreConversation
 * extraits vers chat-persistence.ts (façade backward-compat).
 *
 * v13.3.77 fix TDZ : déclarer conversation EN PREMIER (init []) puis remplir.
 * Évite "Cannot access 'conversation' before initialization" en isolation Vitest. */
const conversation: DisplayMessage[] = [];
const queue: string[] = [];

/* Init populée APRÈS const conversation (pas de TDZ : conversation déjà bound) */
{
  const persisted = loadPersistedConversation();
  if (persisted.length) {
    conversation.push(...(persisted as DisplayMessage[]));
  }

/* v13.4.305 : lie la boucle de rendu (chat-render-loop.ts) a la conversation (réf stable). */
setRenderLoopConversation(conversation);
setEngineState(conversation, queue, pendingAttachments, pendingAttachmentPromises);
setSlashDispatch(conversation, regenerateLastAssistant);
setMemoryModalConversation(conversation);
}

/* v13.4.165 refactor : escapeHtml + renderMarkdownLight extraits vers chat-markdown.ts
 * Re-exportés ici pour compat tests existants (façade pattern, zéro régression).
 * Imports déjà en haut du fichier (top imports group). */
export { escapeHtml, renderMarkdownLight } from './chat-markdown.js';

/**
 * Album image rendu : grille 2-3 cols mobile, 4 desktop, thumbnails visuels.
 * Kevin règle 2026-05-07 : "je veux avoir le visuel pas une liste d'écriture, album entier".
 * Exposé pour tests.
 */
/* v13.4.171 refactor : AlbumImage + renderImageAlbum extraits vers chat-album.ts
 * (façade backward-compat, import déjà en haut du fichier). */
export { type AlbumImage, renderImageAlbum } from './chat-album.js';

/**
 * Modal lightbox plein écran avec actions transformation (cartoon/anime/video/remove-bg/stylize).
 * Kevin demande 2026-05-07 : "transforme cette photo en cartoon ou en vidéo anime".
 * Exposé pour tests.
 */
/* v13.4.294 refactor monolithe : openImageLightbox / handleLightboxAction /
 * pushTransformResult extraits vers chat-lightbox.ts (aucun état module).
 * Importé (caller render) + re-exporté ici (façade : tests + render inchangés). */
export { openImageLightbox, handleLightboxAction, pushTransformResult } from './chat-lightbox.js';

/**
 * Handler central des actions lightbox.
 * Exposé pour tests (mockable).
 */

/**
 * v13.4.14 — Détection type de paste (Kevin "visuel intelligent de tout ce que je colle").
 *
 * Routing :
 * - 'credential' : pattern AX_CREDENTIAL_PATTERNS → vault auto (déjà géré)
 * - 'code'       : bloc backtick OU 3+ lignes code (function/const/import/etc.) → coffre dossier
 * - 'url'        : URL valide → preview card
 * - 'planning'   : format SBM CMCteams → bridge (déjà géré)
 * - 'text'       : fallback normal
 */
/* v13.4.167 refactor : detectPasteKind + pushPasteCard + PasteKind extraits vers
 * chat-paste.ts (façade backward-compat). Imports déjà en haut du fichier. */
export { detectPasteKind, pushPasteCard, type PasteKind } from './chat-paste.js';

/**
 * v13.4.14 — Sauve un snippet code dans le coffre dossier "Codes & snippets".
 *
 * Clé localStorage : apex_v13_code_<timestamp>_<id>
 * Permet listing via UI vault future (préfix apex_v13_code_*).
 * Pour l'instant : stocké en clair (Kevin règle "codes = pas crypto" mais classés).
 */
/* v13.4.166 refactor : saveCodeSnippet + listCodeSnippets + deleteCodeSnippet
 * extraits vers chat-snippets.ts (façade backward-compat).
 * Imports déjà en haut du fichier. */
export { saveCodeSnippet, listCodeSnippets, deleteCodeSnippet } from './chat-snippets.js';

/**
 * v13.4.13 — Helper exporté : transforme conversation DisplayMessage → ChatMessage
 * format Anthropic API.
 *
 * Extraite de processQueue() ligne ~932 pour testabilité réelle (les tests
 * vitest appellent maintenant CETTE fonction, pas une réplique mentale).
 *
 * Règles :
 * - Filtre tool_card (pas envoyés à l'API)
 * - Cap MAX_CONTEXT_MESSAGES (v13.3.48 — perf + HTTP 400)
 * - Si message user a attachments image → content array Anthropic vision format
 * - PDF/non-image attachments ignorés silencieusement (Anthropic vision = image/* only)
 * - Messages assistant : toujours content string (les attachments leaked sont ignorés)
 */
/* v13.4.169 refactor : buildMessagesForApi extrait vers chat-api-format.ts
 * (façade backward-compat, import déjà en haut du fichier). */
export { buildMessagesForApi } from './chat-api-format.js';

/**
 * Push résultat transformation comme bulle Apex avec image générée.
 * Exposé pour tests.
 */

/* v13.4.168 refactor : getTransformEmoji extrait vers chat-renderers.ts (import top) */

/**
 * Génère le HTML des boutons d'action sur un message assistant non-streaming.
 * - 🔊 Speak (lecture vocale via voice service)
 * - 📋 Copy (clipboard)
 * - 📄 Export PDF (lazy-load jsPDF)
 *
 * Exposé pour tests.
 */
/* v13.4.170 refactor : renderMessageActions extrait vers chat-actions-render.ts
 * (façade backward-compat, import déjà en haut du fichier). */
export { renderMessageActions } from './chat-actions-render.js';

/* v13.4.165 refactor : renderMarkdownLight extrait vers chat-markdown.ts
 * (re-export façade ligne ~172). Aucun wrapper inutile pour rester lint-clean. */

/**
 * v13.3.51 — Auto-analyse device sur upload image (Kevin 2026-05-07).
 *
 * Quand Kevin colle photo compte Broadlink ou écran Smart TV → Apex doit RÉAGIR
 * automatiquement, pas ignorer. Pipeline :
 * 1. Vision Claude analyse l'image (auto-detect type)
 * 2. Si broadlink_account → propose setupBroadlink (modal 1-clic)
 * 3. Si smart_tv → stocke device + propose pilotage via Broadlink existant
 *
 * Non-bloquant : retourne silencieusement si pas device, ou erreur API.
 */

/**
 * Render follow-up chips (3 suggestions cliquables après chaque réponse Apex).
 * v13.3.48 — Demande Kevin "chat niveau Claude.ai/ChatGPT".
 * Exposé pour tests.
 */
/* v13.4.168 refactor : renderFollowUps + renderSlashAutocomplete extraits vers
 * chat-renderers.ts (façade backward-compat, imports déjà en haut du fichier). */
export { renderFollowUps, renderSlashAutocomplete } from './chat-renderers.js';


/**
 * v13.3.30 (Kevin règle "mémoire long terme + relecture profonde tous docs")
 *
 * Build le system prompt DEEP version pour CHAQUE turn IA — injecte docs + facts +
 * lessons + cross-user knowledge si admin. Async + cap budget tokens.
 *
 * Si fail (timeout, parse err) → fallback sur version sync.
 */


/**
 * v13.3.79 (Kevin 2026-05-08 18:00) — Détecte commandes wake-word texte
 * ("dis apex", "ok apex", "hey apex" tapées en texte) et active le wake word
 * voice mode. PAS de roundtrip IA, PAS de "Plan A/B/C".
 *
 * Patterns acceptés (case-insensitive, trim) :
 *   - "dis apex", "dit apex", "di apex"
 *   - "ok apex", "okay apex"
 *   - "hey apex", "hello apex"
 *
 * Variants doivent matcher EXACTEMENT (pas substring) pour éviter de
 * trigger sur "dis apex où est mon dossier" qui est une vraie question.
 *
 * Retourne true si traité, false sinon.
 */
export function handleWakeWordTextTrigger(_rootEl: HTMLElement, text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const WAKE_PATTERNS = [
    'dis apex',
    'dit apex',
    'di apex',
    'ok apex',
    'okay apex',
    'hey apex',
    'hello apex',
  ];
  if (!WAKE_PATTERNS.includes(normalized)) return false;

  haptic.tap();
  /* Activate wake word voice mode (lazy import — services/wake-word charge SpeechRecognition iOS) */
  void (async () => {
    try {
      const { wakeWord } = await import('../../services/ai/wake-word.js');
      const r = await wakeWord.start();
      if (r.started) {
        toast.success('🎙 Wake word activé — parle, je t\'écoute', { duration: 4000 });
      } else {
        const reason = r.reason ?? 'wake-word indisponible';
        toast.warn(`🎙 ${reason}`, { duration: 5000 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('chat', 'wake-word text trigger failed', { err: msg });
      toast.warn('🎙 Wake word indisponible sur ce navigateur', { duration: 4000 });
    }
  })();
  return true;
}

/**
 * v13.3.48 — Handler slash commands (Kevin "chat niveau Claude.ai/ChatGPT").
 * Retourne true si le message a été traité comme commande, false sinon.
 */

/* v13.4.252 — /resume : reprend la boucle autonome en pause. */
/* v13.4.295 refactor monolithe : les 10 handlers de slash-commands
 * (resume/statusline/ooda/ultrareview/diag/test/loop/plan/rules/autonomous)
 * extraits vers chat-slash-handlers.ts (contexte injecté SlashCtx). */

/**
 * v13.3.48 — Régénère la dernière réponse assistant en re-soumettant le dernier message user.
 */
async function regenerateLastAssistant(rootEl: HTMLElement): Promise<void> {
  /* Trouve la dernière paire user → assistant */
  let lastUserText = '';
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i];
    if (m && m.role === 'user') {
      lastUserText = m.text;
      break;
    }
  }
  if (!lastUserText) {
    toast.warn('Aucune question précédente à régénérer');
    return;
  }
  /* Remove la dernière réponse assistant */
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i];
    if (m && m.role === 'assistant') {
      conversation.splice(i, 1);
      break;
    }
  }
  /* Remove le user message correspondant aussi (re-poussé par processQueue) */
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i];
    if (m && m.role === 'user' && m.text === lastUserText) {
      conversation.splice(i, 1);
      break;
    }
  }
  renderMessages(rootEl);
  queue.push(lastUserText);
  void processQueue(rootEl);
  toast.info('🔄 Régénération en cours…');
}

/**
 * v13.3.48 — Cherche un mot-clé dans la conversation et affiche les résultats.
 */

/**
 * v13.4.286 — Modal « 📜 Mémoire » : conversations archivées (rechargeables) +
 * journal permanent de tout ce que Kevin dépose (recherche, export).
 * (Kevin "Historique de tout ce que l'on dépose" + "Ajoute le journal permanent".)
 */

/* Storage keys pour préférences voice chat (Kevin règle : auto-read toggle) */

/**
 * Lit la préférence "auto-read" (lecture automatique des réponses assistant).
 * Exposé pour tests.
 */
/* v13.4.293 refactor monolithe : isAutoReadEnabled / setAutoReadEnabled /
 * maybeAutoReadAssistant extraits vers chat-autoread.ts. Importés en haut +
 * re-exportés ici (façade backward-compat : tests + callers internes inchangés). */
export { isAutoReadEnabled, setAutoReadEnabled, maybeAutoReadAssistant };

/**
 * Handler pour bouton 🔊 — lecture vocale d'un message assistant.
 * Toggle play/pause si déjà en cours.
 * Lazy-load voice service.
 */

/**
 * Auto-read : si setting activé, lit le dernier message assistant
 * dès la fin du streaming. Lazy-load voice service.
 * Exposé pour tests.
 */

/**
 * Génère le HTML des pills tool_use pour un message.
 * Pill discret horizontal `🔧 [name]` quand running, `▶ N opérations` quand done.
 * Style inline minimal (Kevin règle : "pas de card massive").
 *
 * Exposé pour tests (anti-XSS + render).
 */
/**
 * v13.4.273 — Badge "via [provider] · latence · coût" sous chaque réponse IA.
 * Kevin règle "tout soit bien en place avec eco token et les réglages
 * consommation et performance" — il doit VOIR quel provider Apex utilise
 * pour vérifier que l'optimisation marche.
 */
/* v13.4.292 refactor monolithe : renderProviderBadge + renderToolPills extraits
 * vers chat-badges.ts (fonctions pures). Importés en haut + re-exportés ici
 * (façade backward-compat : tests + callers internes inchangés). */
export { renderProviderBadge, renderToolPills };


/* v13.4.354 — Exécute les tâches programmées dues (throttle 5 min per session). */
let _lastSchedCheck = 0;
async function checkDueScheduledTasks(
  rootEl: HTMLElement,
  queue: string[],
  runProcessQueue: (el: HTMLElement) => Promise<void>,
): Promise<void> {
  const now = Date.now();
  if (now - _lastSchedCheck < 5 * 60 * 1000) return;
  _lastSchedCheck = now;
  try {
    const { runDueTasks } = await import('../../services/ai/scheduled-tasks.js');
    await runDueTasks((prompt) => {
      queue.push(prompt);
      void runProcessQueue(rootEl);
    }, now, 3);
  } catch {
    /* fail-open : les tâches programmées ne doivent jamais casser le chat */
  }
}

export function render(rootEl: HTMLElement): void {
  /* v13.4.13 fix memory leak Kevin : si Kevin upload photo puis quitte chat
   * sans submit, base64 reste en mémoire. Reset queues au remount = clean state.
   * Trade-off documenté : Kevin perd ses attachments en attente s'il navigue
   * ailleurs puis revient — acceptable car action explicite de navigation. */
  pendingAttachments.length = 0;
  pendingAttachmentPromises.length = 0;

  const user = store.get('user');
  /* Feature toggle module.chat (Kevin règle ON/OFF général + per-user, 2026-05-04).
     Si désactivée pour ce user, afficher notice. Admin Kevin bypass via per-user override. */
  if (!isFeatureEnabled('module.chat', user?.id)) {
    rootEl.innerHTML = renderDisabledNotice('module.chat');
    return;
  }

  /* v13.4.10 fix Kevin "continue recommence à zéro" : restore Firebase conversation
   * si localStorage vide (cache PWA clear iOS). Async non-bloquant, re-render après. */
  if (conversation.length === 0) {
    void tryFirebaseRestoreConversation(conversation).then(() => {
      if (conversation.length > 0) {
        try {
          renderMessages(rootEl);
        } catch { /* skip */ }
      }
    });
  }

  /* v13.4.286 — restore le journal permanent depuis le cloud si vide (survit MAJ). */
  void import('../../services/ai/chat-journal.js').then(({ chatJournal }) => {
    void chatJournal.restoreFromCloud();
  });

  /* v13.4.45 fix Kevin "Apex doit toujours terminer son travail sans s'arrêter" :
   * Wire stream-partial-saver getResumeCandidate au boot. Si Apex avait une réponse
   * en cours interrompue (crash, background-kill iOS, network drop), proposer reprise. */
  void (async () => {
    try {
      const { streamPartialSaver } = await import('../../services/ai/stream-partial-saver.js');
      const candidate = streamPartialSaver.getResumeCandidate();
      if (candidate && candidate.partial_text) {
        /* Push message partial dans conversation comme "assistant interrompu" */
        const restoredMsg: DisplayMessage = {
          id: `a_resume_${Date.now()}`,
          role: 'assistant',
          text: candidate.partial_text + '\n\n_[💡 Réponse interrompue. Tape "continue" pour reprendre.]_',
          ts: candidate.ts_last_chunk,
        };
        conversation.push(restoredMsg);
        renderMessages(rootEl);
        logger.info('chat', `📡 Stream partial resume : ${candidate.partial_text.length} chars depuis ${candidate.provider}`);
        /* Marque comme déjà restoré (évite double-restore au prochain mount) */
        streamPartialSaver.discard();
      }
    } catch (err: unknown) {
      logger.debug('chat', 'stream resume check failed (no resume candidate)', { err });
    }
  })();
  const greeting = user ? `Bonjour ${user.name}, qu'est-ce que je peux faire pour toi ?` : 'Bienvenue dans Apex.';

  const isAdmin = store.get('isAdmin');
  const hasKey = aiRouter.hasAnyKey();

  rootEl.innerHTML = cspStyleHelper.withNonce(buildChatShellHtml({ greeting, conversationEmpty: conversation.length === 0, hasKey, isAdmin: !!isAdmin }));

  /* v13.3.72 Kevin: wire scroll-to-bottom FAB style Claude Code */
  wireScrollToBottomFab(rootEl);

  /* v13.4.3 Kevin 2026-05-09 — Suggestion chips (état vide) :
   * 4 chips cliquables qui injectent un texte préformé dans la textarea + focus.
   * Pas de submit auto — Kevin garde la main pour éditer/envoyer. */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-chat-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
      if (!ta) return;
      const text = chip.dataset['chipText'] ?? '';
      ta.value = text;
      ta.focus();
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      /* Place caret à la fin pour les chips type "/web " (espace final). */
      const len = text.length;
      try { ta.setSelectionRange(len, len); } catch { /* best-effort */ }
      haptic.tap();
    });
  });

  /* v13.4.232 finding P1.4 — empty state suggestion chips (greeting initial) */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-chat-suggest button[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
      if (!ta) return;
      const text = btn.dataset['suggest'] ?? '';
      ta.value = text;
      ta.focus();
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      const len = text.length;
      try { ta.setSelectionRange(len, len); } catch { /* best-effort */ }
      haptic.tap();
    });
  });

  wireChatInput(rootEl, { conversation, queue, processQueue, renderMessages, handleSlashCommand, handleWakeWordTextTrigger, showSlashAutocomplete, hideSlashAutocomplete });

  /* v13.4.354 — Tâches programmées : exécute les tâches DUES à l'ouverture du chat
   * (une PWA ne tourne pas en fond → on rattrape à l'ouverture). Throttle 5 min. */
  void checkDueScheduledTasks(rootEl, queue, processQueue);

  /* Kevin 2026-06-08 : commande cliquée dans la vue /commands → prefill l'input
   * (« /cmd ») puis Kevin complète la cible/args et envoie LUI-MÊME (pas d'auto-submit).
   * Consommé une seule fois (removeItem). */
  try {
    const prefill = localStorage.getItem('apex_v13_chat_prefill');
    if (prefill) {
      localStorage.removeItem('apex_v13_chat_prefill');
      const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-form textarea');
      if (ta) {
        ta.value = prefill;
        ta.dispatchEvent(new Event('input', { bubbles: true })); /* resize + autocomplete slash */
        ta.focus();
        try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  /* Mic handler : dictée vocale Web Speech API
   * Fix v13.3.23 (Kevin bug 19:10) :
   *  - 'aborted' et 'no-speech' = lifecycle iOS Safari, NE PAS afficher en erreur
   *  - Detection iOS : continuous=false + restart auto via onend
   *  - Permission micro check préalable + modal settings si denied
   *  - Log structuré ax_voice_log pour diagnostic admin */
  wireMicButton(rootEl);

  wireWakeButton(rootEl);

  /* File attach : input file + drag-drop + paste image clipboard */
  wireAttachments(rootEl, pendingAttachments, pendingAttachmentPromises, autoAnalyzeDeviceImage);

  /* Camera handler (P0 audit gap : wire smart-camera réel) */
  wireCameraButton(rootEl);

  /* v13.4.1 Kevin "SOS pas pertinent permanent" : long-press 3s logo APEX → Diagnostic admin.
   * Remplace le SOS visible permanent. Admin only ; sinon ne fait rien. */
  wireLogoAndModeToggle(rootEl);

  /* Menu hamburger ☰ : drawer modal avec navigation rapide
   * Fix Kevin v13.0.40 "le bouton paramètres et les trois traits ne fonctionnent pas" */
  wireMenuButton(rootEl);

  /* v13.3.78 Kevin: bouton 🗑 effacer chat (conversation courante) */
  const memoryBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-memory');
  memoryBtn?.addEventListener('click', () => {
    haptic.tap();
    openMemoryModal(rootEl);
  });

  const clearBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-clear');
  clearBtn?.addEventListener('click', () => {
    haptic.tap();
    if (!confirm('🗑 Effacer définitivement le chat actuel ?\n\nLes messages sont supprimés PARTOUT (local + cloud Firebase + pièces jointes) et ne reviendront pas après une mise à jour.\n\n💡 Pour garder une trace, utilise plutôt « 🌿 Nouvelle conversation » qui archive l\'ancienne dans l\'historique.')) return;
    /* v13.4.284 — efface in-memory PUIS toutes les couches (sinon Firebase
     * ressuscite les messages au prochain boot/MAJ — bug Kevin). */
    conversation.length = 0;
    renderMessages(rootEl);
    void clearConversationEverywhere().then(() => {
      void import('../../ui/toast.js').then(({ toast }) => {
        toast.success('🗑 Chat effacé partout (ne reviendra plus)', { duration: 3000 });
      });
    });
  });

  /* Bouton Paramètres ⚙️ : ouvre modal settings (clés API + mode routing + reco)
   * Fix Kevin v13.0.40 "rien ne se passe quand on tape sur paramètres" */
  wireSettingsAndPasteKey(rootEl, () => render(rootEl));

  /* Sprint 8 v13.0.69 P0 BUG FIX (Kevin "boutons header/footer marchent pas") :
     Event delegation global pour [data-nav-route="..."] qui replace onclick CSP-blocked.
     iOS Safari + CSP strict bloquent inline onclick. Solution : addEventListener listener
     unique sur rootEl qui catch tous boutons quand cliqués (avant ET après re-render). */
  rootEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const navBtn = target.closest('[data-nav-route]') as HTMLElement | null;
    if (navBtn) {
      const route = navBtn.dataset['navRoute'];
      if (route) {
        haptic.tap();
        location.hash = '#' + route;
      }
    }
  });

  /* Kevin v13 : event delegation pour boutons d'action sur messages assistant
     (🔊 Lecture vocale, 📋 Copy, 📄 Export PDF). Demande explicite Kevin :
     "bouton haut-parleur pour écouter au lieu de lire, choisir les voix". */
  rootEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    /* v13.3.48 — Follow-up chip click → re-soumet le prompt */
    const followBtn = target.closest<HTMLElement>('.ax-followup-chip');
    if (followBtn) {
      const prompt = followBtn.getAttribute('data-followup-prompt');
      if (prompt) {
        haptic.tap();
        const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
        if (ta) {
          ta.value = prompt;
          rootEl.querySelector<HTMLFormElement>('#ax-chat-form')?.requestSubmit();
        }
      }
      return;
    }

    const btn = target.closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const msgId = btn.getAttribute('data-msg-id');
    if (!action || !msgId) return;
    /* Filtre uniquement nos actions chat (évite collision avec autres data-action) */
    if (action !== 'speak' && action !== 'copy' && action !== 'export-pdf' && action !== 'regen') return;
    const msg = conversation.find((m) => m.id === msgId);
    if (!msg) return;

    if (action === 'speak') {
      void handleSpeakAction(btn, msg);
      return;
    }
    if (action === 'copy') {
      void handleCopyAction(msg);
      return;
    }
    if (action === 'export-pdf') {
      void handleExportPdfAction(msg);
      return;
    }
    if (action === 'regen') {
      haptic.tap();
      void regenerateLastAssistant(rootEl);
      return;
    }
  });

  rootEl.querySelector<HTMLButtonElement>('#ax-logout-nav')?.addEventListener('click', () => {
    haptic.tap();
    const sheet = modalSheet.open({
      title: 'Déconnexion ?',
      content: '<p>Tes données restent sauvegardées (Coffre, conversations, profil).</p>',
      actions: [
        { label: 'Annuler', variant: 'ghost', onClick: () => sheet.close() },
        {
          label: 'Déconnecter',
          variant: 'danger',
          onClick: () => {
            haptic.medium();
            sheet.close();
            void import('../../services/auth/auth.js').then((m) => {
              m.auth.logout();
              toast.info('Déconnecté');
              location.hash = '#landing';
            });
          },
        },
      ],
    });
  });

  /* v13.3.77 fix TDZ : guard contre accès `conversation` avant init module
   * (race condition Vitest isolate + services-bootstrap router.dispatch peut
   * appeler render() durant module loading, avant que le const conversation soit bound). */
  try {
    if (conversation.length) {
      renderMessages(rootEl);
    }
  } catch (e) {
    /* TDZ pendant module init — pas critique, renderMessages peut attendre next tick */
    if (!(e instanceof ReferenceError)) throw e;
    logger.warn('chat', 'conversation TDZ skipped (module init race)');
  }
  /* H3 audit fix v13.3.74 — skeleton helper exposé pour features lazy.
   * Wire opt-in via `data-ax-skeleton-host` element (modules lazy-loaded l'utilisent
   * pour placeholder pendant fetch). Idempotent : pas exécuté si pas de host. */
  const skelHost = rootEl.querySelector<HTMLElement>('[data-ax-skeleton-host="chat"]');
  if (skelHost) {
    skeleton(skelHost, 'chat-message');
  }
  logger.info('chat', 'Chat view rendered');
}
