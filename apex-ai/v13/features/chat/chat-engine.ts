/**
 * APEX v13 — chat-engine.ts
 * Moteur d'orchestration IA du chat : processQueue (boucle envoi/streaming +
 * failover + PII redaction + tools + commerce), buildSystemPromptDeep,
 * autoExtractAndLearn, detectAndSuggestTool, pushSuggestedTool.
 *
 * Extrait de features/chat/index.ts (v13.4.307, refactor monolithe — cœur IA).
 * conversation/queue/isProcessing sont l'état du moteur, lié une fois via
 * setEngineState() (réfs STABLES mutées in-place). Appelé par render()/input.
 */
import { errors } from '../../core/errors.js';
import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { capSystemPrompt, remainingBudget } from '../../core/prompt-budget.js';
import { store } from '../../core/store.js';
import { aiRouter, type ChatMessage } from '../../services/ai/ai-router.js';
import { customAssistants } from '../../services/ai/custom-assistants.js';
import { projects } from '../../services/ai/projects.js';
import { buildEffortInjection } from '../../services/ai/reasoning-mode.js';
import { commerce } from '../../services/integrations/commerce.js';

import { buildMessagesForApi } from './chat-api-format.js';
import { maybeAutoReadAssistant } from './chat-autoread.js';
import { escapeHtml } from './chat-markdown.js';
import { persistConversation } from './chat-persistence.js';
import { renderMessages, updateAssistantBubble, pushAssistantMessage } from './chat-render-loop.js';

import type { DisplayMessage } from './index.js';

/* État du moteur — réfs STABLES fournies une fois par setEngineState (mutées in-place). */
let conversation: DisplayMessage[] = [];
let queue: string[] = [];
let isProcessing = false;

/* v13.4.361 (Kevin screenshot "IA bloquée sur Retry auto dans 3s", 3 bulles "test" empilées) :
 * Le retry auto (erreur récupérable + réponse vide) re-queue le message SANS cap et
 * pushe une NOUVELLE bulle user à chaque tour → boucle infinie visible + empilement.
 * FIX : cap strict + retry qui NE duplique PAS la bulle user + message final clair.
 * - autoRetries : compteur pour l'attempt courant (reset au 1er envoi frais).
 * - pendingRetry : marque que le prochain processQueue() est un retry (n'incrémente pas le
 *   compteur, ne compte pas comme un nouvel envoi). */
const MAX_AUTO_RETRIES = 1;
let autoRetries = 0;
let pendingRetry = false;

/** Lie le moteur à l'état du module chat (conversation + queue, réfs stables). */
export function setEngineState(
  conv: DisplayMessage[],
  q: string[],
  pAtt: Array<{ mime: string; base64: string; name: string }>,
  pProm: Array<Promise<void>>,
): void {
  conversation = conv;
  queue = q;
  pendingAttachments = pAtt;
  pendingAttachmentPromises = pProm;
}

const MAX_CONTEXT_MESSAGES = 30;

/** v13.4.364 — Pousse un texte dans la file du moteur et lance le traitement.
 * Utilisé par /orchestre <question> (le dispatch n'a pas la réf queue). */
export function enqueueText(rootEl: HTMLElement, text: string): void {
  if (!text.trim()) return;
  queue.push(text.trim());
  void processQueue(rootEl);
}

/* Pièces jointes en attente — réfs STABLES fournies par setEngineState (mutées in-place). */
let pendingAttachments: Array<{ mime: string; base64: string; name: string }> = [];
let pendingAttachmentPromises: Array<Promise<void>> = [];

function buildSystemPrompt(): string {
  const user = store.get('user');
  return memory.buildSystemPromptContext(user);
}

async function buildSystemPromptDeep(): Promise<string> {
  /* v13.4.365 (fix « system too long », Kevin 2026-09-05) : l'injection est
   * calculée AVANT le corps, et son poids est RÉSERVÉ dans le budget.
   *
   * Avant : le corps se plafonnait tout seul à 32000, PUIS on lui collait
   * l'injection (Projet actif + Assistant perso + effort) → total > 32000 →
   * `ai-router` refusait tout message. Il a suffi que Kevin active un Projet
   * pour que le total passe à 33635 et qu'Apex ne réponde plus du tout. */
  const injection = customAssistantInjection();
  try {
    const user = store.get('user') as { id: string; name: string } | null;
    /* v13.4.7 fix Kevin "Apex redemande action admin" : timeout 1500ms → 3000ms.
     * Avec timeout 1500ms, sur iPhone Safari PWA réseau lent, deep prompt timeout
     * trop souvent → fallback minimal sans contexte profond → IA hallucine
     * "es-tu admin ?". 3000ms = budget plus safe. */
    const base = await Promise.race([
      memory.buildSystemPromptDeep(user, injection.length),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('deep prompt timeout')), 3000)),
    ]);
    return base + injection;
  } catch (err: unknown) {
    logger.warn('chat', 'buildSystemPromptDeep fallback (sync)', { err });
    return buildSystemPrompt() + injection;
  }
}

/* v13.4.345 — Assistant personnalisé actif ("Gems" / Custom GPTs). Additif :
 * préfixe les instructions de l'assistant au prompt Apex, sans toucher au routage.
 * v13.4.352 — + effort de raisonnement (nudge prompt, provider-agnostique). */
function customAssistantInjection(): string {
  let out = '';
  try {
    out += projects.buildInjection();
  } catch {
    /* fail-open */
  }
  try {
    out += customAssistants.buildInjection();
  } catch {
    /* fail-open */
  }
  try {
    out += buildEffortInjection();
  } catch {
    /* fail-open */
  }
  return out;
}

/**
 * v13.3.30 (Kevin règle "extract facts à chaque message user")
 *
 * Auto-extract facts critiques du message user → push persistent_memory_<uid>.
 * Détecte aussi mots-clés règles permanentes ("automatise", "100/100", "max")
 * et record l'auto-rappel dans lessons.
 *
 * Non-bloquant : tourne en arrière-plan, ne ralentit pas le streaming IA.
 */
async function autoExtractAndLearn(text: string): Promise<void> {
  if (!text || text.length < 5) return;
  try {
    const user = store.get('user') as { id: string; name: string } | null;
    const userId = user?.id ?? 'anon';
    /* 1. Extract facts → persistent_memory_<uid> */
    const result = await memory.extractFactsFromMessage(text, userId);
    if (result.extracted > 0) {
      logger.info('chat.extract', `${result.extracted} facts extracted from user message`, {
        categories: result.facts.map((f) => f.category),
      });
    }

    /* 2. Détection mots-clés règles permanentes — log auto-rappel
     *    Si Kevin dit "automatise", "100/100", "tout au max", ce sont des règles
     *    absolues CLAUDE.md → injecte un trigger dans lessons pour next session. */
    const ruleTriggers = [
      { kw: /\b(automatise|autonomie|tout seul)\b/i, rule: 'Automatise tout en autonomie (jamais demander si Apex peut faire)' },
      { kw: /\b100\s*\/\s*100|tout.{0,10}max(imum)?\b/i, rule: '100/100 réel chaque axe — jamais demi-mesure, niveau expert pro 200€/h' },
      { kw: /\b(rappelle.toi|n'oublie pas|note (le|ça))\b/i, rule: 'Mémoire permanente — Kevin rappelle une règle à graver' },
    ];
    for (const trig of ruleTriggers) {
      if (trig.kw.test(text)) {
        await memory.recordSessionLearning(
          'rule-reminder',
          `Kevin rappel : ${trig.rule}`,
          `Message user : ${text.slice(0, 200)}`,
          'info',
        );
      }
    }

    /* v13.4.346 — RAG : mémorise le message dans la mémoire long terme sémantique
     * (kdmc-rag/Vectorize). DÉFAUT OFF (flag) → no-op ; fail-open ; non-bloquant. */
    try {
      const { apexMemoryRag } = await import('../../services/ai/apex-memory-rag.js');
      void apexMemoryRag.remember(text, { user: userId, ts: Date.now() });
    } catch { /* fail-open */ }
  } catch (err: unknown) {
    logger.warn('chat', 'autoExtractAndLearn failed', { err });
  }
}

/**
 * Détecte intent dans message user → propose meilleur outil sur bureau
 * (Kevin règle CLAUDE.md : "outils auto-apparents par contexte").
 */
async function detectAndSuggestTool(text: string, rootEl: HTMLElement): Promise<void> {
  try {
    const { apexToolsDispatch } = await import('../../services/core-svc/apex-tools-dispatch.js');
    const intentRes = await apexToolsDispatch.execute('detect_intent', { text }, 'admin');
    if (!intentRes.ok || !intentRes.result) return;
    const intent = (intentRes.result as { intent?: string; confidence?: number }).intent;
    const confidence = (intentRes.result as { confidence?: number }).confidence ?? 0;
    if (!intent || intent === 'unknown' || confidence < 0.7) return;

    /* Kevin règle "1-clic ouverture URL" : si intent = open_url → trigger directement modal pop-up
       avec lien direct cliquable (pas window.open auto sans confirmation) */
    if (intent === 'open_url' || intent === 'open_browser') {
      /* Extract URL ou domain depuis text */
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
      const domainMatch = text.match(/\b([a-z0-9-]+\.(com|fr|io|net|org|app|dev|ai|co))\b/i);
      const url = urlMatch?.[1] ?? domainMatch?.[1] ?? 'https://www.google.com';
      void apexToolsDispatch.execute('open_url', { url }, 'admin');
      return;
    }

    const { smartToolsSuggester } = await import('../../services/ai/smart-tools-suggester.js');
    const tool = smartToolsSuggester.suggestForIntent(intent);
    if (!tool) return;

    /* Kevin 2026-05-07 : "modules apparaissent tout seuls" → toggle opt-out + dedup
     * Toggle Réglages : ax_settings.tools_auto_embed (default true).
     * Si false → toast seulement, pas de card dans chat. */
    let autoEmbed = true;
    try {
      const settings = JSON.parse(localStorage.getItem('ax_settings') ?? '{}') as Record<string, unknown>;
      if (settings['tools_auto_embed'] === false) autoEmbed = false;
    } catch { /* default true */ }

    /* Dedup : ne pas re-pousser le même tool déjà visible dans les 10 derniers msgs. */
    const recentToolIds = conversation.slice(-10).filter(m => m.role === 'tool_card').map(m => (m as DisplayMessage & { toolId?: string }).toolId);
    if (recentToolIds.includes(tool.id)) return;

    /* Toast non-intrusif "🎯 Outil détecté : Studio Mix" — TOUJOURS affiché */
    const { toast } = await import('../../ui/toast.js');
    toast.info(`${tool.emoji} ${tool.name} disponible — tape pour ouvrir`, { duration: 5000 });

    /* Track usage potentiel */
    const user = store.get('user');
    if (user?.id) smartToolsSuggester.recordUsage(tool.id, user.id);

    /* Card dans chat : seulement si toggle ON (default true) */
    if (autoEmbed) pushSuggestedTool(rootEl, tool);
  } catch (err: unknown) {
    /* Silent fail — non-bloquant pour chat */
    logger.warn('chat', 'detectAndSuggestTool failed', { err });
  }
}

function pushSuggestedTool(rootEl: HTMLElement, tool: { id: string; emoji: string; name: string; description: string; cta_label: string; cta_target: string }): void {
  const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
  if (!scroll) return;
  const cardId = `tool_${tool.id}_${Date.now()}`;
  const card = document.createElement('div');
  card.className = 'ax-msg ax-msg-tool ax-slide-up-fade';
  card.id = cardId;
  card.innerHTML = `
    <div class="ax-tool-card" style="position:relative;padding-right:52px">
      <button class="ax-tool-dismiss" aria-label="Fermer" title="Ne plus suggérer dans cette conversation" style="position:absolute;top:6px;right:6px;width:44px;height:44px;min-width:44px;min-height:44px;border:0;background:rgba(255,255,255,0.08);color:var(--ax-text-dim);border-radius:50%;cursor:pointer;font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center">✕</button>
      <div class="ax-tool-icon">${tool.emoji}</div>
      <div class="ax-tool-info">
        <strong>${escapeHtml(tool.name)}</strong>
        <p style="margin:4px 0 0;color:var(--ax-text-dim);font-size:13px">${escapeHtml(tool.description)}</p>
      </div>
      <button class="ax-btn ax-btn-primary ax-btn-sm" data-tool-cta="${escapeHtml(tool.cta_target)}">${escapeHtml(tool.cta_label)}</button>
    </div>
  `;
  scroll.appendChild(card);
  /* Track dans conversation pour dedup (role 'tool_card' → exclu API IA) */
  conversation.push({ id: cardId, role: 'tool_card', text: tool.name, ts: Date.now(), toolId: tool.id } as DisplayMessage & { toolId: string });
  /* Wire dismiss + CTA */
  card.querySelector<HTMLButtonElement>('.ax-tool-dismiss')?.addEventListener('click', () => {
    card.classList.add('ax-fade-out');
    setTimeout(() => card.remove(), 180);
  });
  card.querySelector<HTMLButtonElement>('[data-tool-cta]')?.addEventListener('click', (e) => {
    const target = (e.currentTarget as HTMLElement).getAttribute('data-tool-cta');
    if (target) location.hash = target;
  });
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
}

export async function processQueue(rootEl: HTMLElement): Promise<void> {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  const text = queue.shift();
  if (text === undefined) {
    isProcessing = false;
    return;
  }
  /* v13.4.361 : distingue un envoi FRAIS (reset le compteur de retry) d'un retry auto. */
  const isRetryAttempt = pendingRetry;
  pendingRetry = false;
  if (!isRetryAttempt) autoRetries = 0;

  const user = store.get('user');
  /* v13.4.131 (Kevin "Apex IA chat réservée admin") :
   * v13.4.132 (Kevin "Active le chat IA pour Laurence") :
   * Whitelist : admin Kevin + Laurence ont accès IA chat.
   * Autres users (clients pro/free, famille) → bloqués (coût tokens API). */
  const AI_CHAT_WHITELIST = new Set(['kdmc_admin', 'laurence_sp']);
  if (!user?.id || !AI_CHAT_WHITELIST.has(user.id)) {
    pushAssistantMessage(
      rootEl,
      "🔒 L'assistant IA est réservé à Kevin et Laurence. Tu peux lire l'historique mais pas envoyer de message à l'IA.",
    );
    queue.length = 0; /* purge messages non-admin pour éviter accumulation */
    isProcessing = false;
    return;
  }
  const consume = commerce.consumeMessage(user?.id ?? null);
  if (!consume.allowed) {
    pushAssistantMessage(rootEl, "Tu as atteint ta limite quotidienne. Passe en plan supérieur ou réessaie demain.");
    isProcessing = false;
    return;
  }

  /* WIRE smart-tools-suggester : detect intent + propose outil sur bureau
   * (Kevin demande explicite : "musique → studio mix sur bureau") */
  void detectAndSuggestTool(text, rootEl);

  /* v13.3.30 — Auto-extract facts + auto-rappel règles (non-bloquant)
   * Wire de extractFactsFromMessage Kevin règle absolue mémoire long terme. */
  void autoExtractAndLearn(text);

  /* Sprint 13.3.71 — emit chat:message:user pour message-fact-extractor + autres listeners.
   * Kevin règle absolue "extraction continue à chaque message user". */
  try {
    const u = store.get('user') as { id: string } | null;
    events.emit('chat:message:user', {
      uid: u?.id ?? 'anon',
      text,
      ts: Date.now(),
    });
  } catch (err: unknown) {
    logger.warn('chat', 'chat:message:user emit failed', { err });
  }

  /* v13.4.11/12 fix Kevin "Apex aveugle aux pièces jointes" :
   * Attendre que tous les FileReader en cours soient terminés (anti race),
   * puis prend snapshot pendingAttachments + vide queue. Le message porte
   * ses attachments, la queue est vide pour le prochain message. */
  if (pendingAttachmentPromises.length > 0) {
    try { await Promise.all(pendingAttachmentPromises); }
    catch (err: unknown) { logger.warn('chat', 'await pending attachments fail', { err }); }
  }
  const takenAttachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
  pendingAttachments.length = 0;
  /* v13.4.12 — Reset UI : masquer la div attachments et la vider visuellement
   * (chips encore visibles sinon = confusion utilisateur). */
  const attDivClear = rootEl.querySelector<HTMLDivElement>('#ax-chat-attachments');
  if (attDivClear) {
    attDivClear.innerHTML = '';
    attDivClear.style.display = 'none';
  }
  const fileInputClear = rootEl.querySelector<HTMLInputElement>('#ax-chat-file-input');
  if (fileInputClear) fileInputClear.value = '';

  const userMsg: DisplayMessage = {
    id: `u_${Date.now()}`,
    role: 'user',
    text,
    ts: Date.now(),
    ...(takenAttachments ? { attachments: takenAttachments } : {}),
  };
  conversation.push(userMsg);
  persistConversation(conversation);
  /* v13.4.361 : réf STABLE de la bulle user — `userMsg` est shadowé dans onError
   * (const userMsg = errors.toUserMessage(err)), donc le retry doit splicer via ceci. */
  const userBubble = userMsg;

  const assistantMsg: DisplayMessage = {
    id: `a_${Date.now()}`,
    role: 'assistant',
    text: '',
    ts: Date.now(),
    streaming: true,
  };
  conversation.push(assistantMsg);
  store.set('isStreaming', true);
  renderMessages(rootEl);

  /* v13.4.13 — utilise buildMessagesForApi helper exporté (testable réel). */
  const messages = buildMessagesForApi(
    conversation,
    assistantMsg,
    MAX_CONTEXT_MESSAGES,
  ) as ChatMessage[];

  /* v13.3.30 — Deep prompt avec docs + facts + lessons (Kevin règle mémoire long terme) */
  let sysPrompt = await buildSystemPromptDeep();
  /* v13.4.346 (Kevin « fais la mémoire Apex ») — RAG : injecte les souvenirs pertinents
   * (Vectorize via kdmc-rag) pour le message courant. DÉFAUT OFF (flag apex_v13_rag_enabled)
   * → recallBlock renvoie '' instantanément = 0 impact. Fail-open + timeout court (≤2.5 s). */
  try {
    const { apexMemoryRag } = await import('../../services/ai/apex-memory-rag.js');
    const memBlock = await apexMemoryRag.recallBlock(text);
    /* v13.4.365 : on n'ajoute QUE si ça tient. Un bloc qui ne rentre pas est
     * omis proprement plutôt que d'envoyer un prompt que le routeur refusera. */
    if (memBlock && memBlock.length + 2 <= remainingBudget(sysPrompt)) {
      sysPrompt = `${sysPrompt}\n\n${memBlock}`;
    }
  } catch { /* fail-open : prompt inchangé */ }
  /* 2026-07-10 (Kevin « augmente au max ta mémoire en consommant le minimum ») — mémoire
   * compacte : magasin illimité (GitHub raw, sans clé), on n'injecte que les faits durables
   * pertinents. DÉFAUT OFF (flag apex_v13_compact_mem) → '' = 0 impact. Fail-open, sans coût IA. */
  try {
    const { compactMemory } = await import('../../services/ai/compact-memory.js');
    const cBlock = await compactMemory.recallBlock(text);
    if (cBlock && cBlock.length + 2 <= remainingBudget(sysPrompt)) {
      sysPrompt = `${sysPrompt}\n\n${cBlock}`;
    }
  } catch { /* fail-open : prompt inchangé */ }
  /* v13.4.365 — FILET FINAL, au dernier point de mutation avant l'envoi.
   * C'est la garantie architecturale : peu importe ce qu'une future feature
   * concaténera au prompt, « system too long » ne peut plus bloquer Apex. */
  sysPrompt = capSystemPrompt(sysPrompt);
  /* v13.4.273 (Kevin "tout soit bien en place avec eco token") :
   * mesure latence client-side du premier au dernier chunk pour badge UI. */
  const streamT0 = Date.now();
  /* v13.4.364 (Kevin « Utilise toutes les ia dispo. Orchestre d'ia ») :
   * gros travail détecté (audit/expert/complet…) → fan-out multi-IA parallèle +
   * synthèse Anthropic chef d'orchestre. MÊME contrat de callbacks que
   * aiRouter.stream ; fail-open → route normale si l'orchestre est indispo. */
  let streamFn: typeof aiRouter.stream = aiRouter.stream.bind(aiRouter);
  try {
    const { aiOrchestrator } = await import('../../services/ai/ai-orchestrator.js');
    if (aiOrchestrator.shouldOrchestrate(text)) {
      streamFn = aiOrchestrator.stream.bind(aiOrchestrator);
    }
  } catch { /* fail-open : routeur normal */ }
  await streamFn(
    messages,
    sysPrompt,
    (chunk) => {
      /* P0 Kevin v13.1.0 : tool_use pills discrètes inline (pas card massive) */
      if (chunk.type === 'tool_use_start' && chunk.toolName) {
        if (!assistantMsg.toolPills) assistantMsg.toolPills = [];
        assistantMsg.toolPills.push({ name: chunk.toolName, status: 'running' });
        updateAssistantBubble(rootEl, assistantMsg);
        return;
      }
      if (chunk.type === 'tool_use_done') {
        /* Marque toutes les pills running comme done (batch terminé) */
        if (assistantMsg.toolPills) {
          for (const pill of assistantMsg.toolPills) {
            if (pill.status === 'running') pill.status = 'done';
          }
        }
        assistantMsg.toolBatchCount = (assistantMsg.toolBatchCount ?? 0) + (chunk.toolCount ?? 0);
        updateAssistantBubble(rootEl, assistantMsg);
        return;
      }
      /* v13.4.355 : réflexion NATIVE Anthropic (extended thinking) — streamée à part.
       * On l'accumule dans un champ dédié et JAMAIS dans assistantMsg.text (ce n'est
       * pas la réponse finale). Le rendu repliable est géré par updateAssistantBubble. */
      if (chunk.type === 'thinking') {
        assistantMsg.nativeThinking = (assistantMsg.nativeThinking ?? '') + chunk.text;
        updateAssistantBubble(rootEl, assistantMsg);
        return;
      }
      if (chunk.text) {
        assistantMsg.text += chunk.text;
        updateAssistantBubble(rootEl, assistantMsg);
      }
      if (chunk.done) {
        delete assistantMsg.streaming;
        /* v13.4.361 : réponse aboutie → reset le compteur de retry auto. */
        if (assistantMsg.text.trim().length > 0) autoRetries = 0;
        /* v13.4.273 : capture provider + latence pour badge sous la réponse */
        if (chunk.provider) assistantMsg.provider = chunk.provider;
        assistantMsg.latencyMs = Date.now() - streamT0;
        /* Coût estimé approximatif : longueur réponse en tokens × cost table provider */
        try {
          const estimatedOutTokens = Math.ceil(assistantMsg.text.length / 4);
          const COST_TABLE_EUR_PER_M: Record<string, number> = {
            anthropic: 8.0, openai: 6.0, groq: 0, gemini: 0, openrouter: 0, openclaw: 0,
          };
          const cost = (COST_TABLE_EUR_PER_M[chunk.provider ?? 'anthropic'] ?? 0) * estimatedOutTokens / 1_000_000;
          assistantMsg.costEur = cost;
        } catch {
          /* skip si pas calculable */
        }
        store.set('isStreaming', false);
        renderMessages(rootEl);
        /* v13.3.53 : persist conversation après streaming complet (Kevin "perds chat à chaque MAJ") */
        persistConversation(conversation);
        /* Auto-read si setting activé (Kevin demande "il puisse me lire les choses") */
        void maybeAutoReadAssistant(assistantMsg);
      }
    },
    (err) => {
      const userMsg = errors.toUserMessage(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const recoverable = /timeout|abort|fetch failed|network|5\d{2}|rate.?limit|429/i.test(errMsg);
      logger.warn('chat', 'AI stream error', { errMsg, recoverable, userText: text.slice(0, 80) });
      /* Auto-retry CAPÉ après 3s si erreur récupérable ET pas de texte déjà streamé
       * (Kevin règle "ZÉRO blocage user" — mais v13.4.361 : jamais en boucle, jamais
       * d'empilement de bulles user). Au-delà du cap → message final clair actionnable. */
      if (recoverable && !assistantMsg.text && autoRetries < MAX_AUTO_RETRIES) {
        autoRetries += 1;
        assistantMsg.text = `${userMsg} ⏳ Nouvelle tentative auto (${autoRetries}/${MAX_AUTO_RETRIES}) dans 3s…`;
        renderMessages(rootEl);
        setTimeout(() => {
          /* Retire la bulle assistant ET la bulle user de CETTE tentative → le re-envoi
           * en recrée exactement une de chaque (pas d'empilement). */
          const ai = conversation.indexOf(assistantMsg);
          if (ai >= 0) conversation.splice(ai, 1);
          const ui = conversation.indexOf(userBubble);
          if (ui >= 0) conversation.splice(ui, 1);
          delete assistantMsg.streaming;
          store.set('isStreaming', false);
          pendingRetry = true; /* prochain processQueue = retry, garde le compteur */
          queue.unshift(text);
          isProcessing = false;
          void processQueue(rootEl);
        }, 3000);
        return;
      }
      /* Erreur non récupérable OU réponse partielle déjà reçue → message clair.
       *
       * v13.3.75 (Kevin urgent "réponse partielle préservée" alors que tools réussissent) :
       * Si tools ont été appelés (toolBatchCount > 0) mais pas de texte final →
       * proposer relance plutôt que message générique frustrant. */
      const hadTools = (assistantMsg.toolBatchCount ?? 0) > 0;
      const hasText = !!assistantMsg.text && assistantMsg.text.trim().length > 30;
      let finalMsg: string;
      if (hadTools && !hasText) {
        finalMsg = `🛠 ${assistantMsg.toolBatchCount} outil(s) exécuté(s) ✅ mais la réponse texte n'a pas terminé. Tape "continue" ou relance ta question pour la suite.`;
      } else if (hasText) {
        finalMsg = `${assistantMsg.text}\n\n---\n⚠ ${userMsg} (réponse partielle préservée)`;
      } else if (recoverable) {
        /* v13.4.361 : retry auto épuisé sur erreur récupérable → message CLAIR + actions
         * (jamais un cul-de-sac « Serveur en panne » figé). */
        finalMsg = `${userMsg}\n\nLa nouvelle tentative auto n'a rien donné pour l'instant.\n• **Renvoie** ta question (je repars sur un provider sain)\n• Vérifie tes clés IA dans le **Coffre 🔐**\n• Tape **SOS** si ça persiste`;
      } else {
        finalMsg = userMsg;
      }
      assistantMsg.text = finalMsg;
      delete assistantMsg.streaming;
      store.set('isStreaming', false);
      renderMessages(rootEl);
    },
  );

  isProcessing = false;
  if (queue.length) void processQueue(rootEl);
}
