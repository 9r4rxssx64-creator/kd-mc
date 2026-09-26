/**
 * APEX v13.4.172 — Chat conversation persistence (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - loadPersisted : pure read localStorage
 * - persistConversation : debounce 500ms localStorage + debounce 30s Firebase
 * - tryFirebaseRestoreConversation : restore depuis cloud si local vide
 *
 * Le module garde son propre state (timeouts) pour éviter pollution chat/index.ts.
 * conversation array passé par référence (mutation in-place possible).
 *
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 *
 * v13.4.10 fix Kevin "continue recommence à zéro" : sync Firebase pour survivre
 * clear cache PWA iOS + restore au reload depuis cloud.
 */

import { logger } from '../../core/logger.js';

const CONV_STORAGE_KEY = 'apex_v13_conversation_active';
const FIREBASE_PATH = 'apex_v13_conversation_cloud';
const CONV_MAX_PERSIST = 200;
const LOCAL_DEBOUNCE_MS = 500;
const FIREBASE_DEBOUNCE_MS = 30_000;
const FIREBASE_MAX_TEXT_LEN = 8_000;
const FIREBASE_MAX_MESSAGES = 30;

/** Minimal type pour persistance (compatible DisplayMessage de chat/index.ts). */
export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
  ts: number;
  streaming?: boolean;
  toolPills?: { name: string; status: 'running' | 'done' }[];
  toolBatchCount?: number;
  attachments?: Array<{ mime: string; base64: string; name: string }>;
}

let _saveTimeout: ReturnType<typeof setTimeout> | null = null;
let _firebaseSyncTimeout: ReturnType<typeof setTimeout> | null = null;

/* v13.4.191 — Helper persist attachments en IDB (async, fire-and-forget). */
async function persistAttachmentsAsync(
  msgId: string,
  attachments: Array<{ mime: string; base64: string; name: string }>,
): Promise<void> {
  /* Skip si déjà sentinels (déjà restoré depuis IDB) */
  const fresh = attachments.filter((a) => a.base64 !== '__IDB__' && a.base64.length > 0);
  if (fresh.length === 0) return;
  try {
    const { chatAttachmentsStore } = await import('../../services/ai/chat-attachments-store.js');
    await chatAttachmentsStore.persistAttachments(msgId, fresh);
  } catch (err: unknown) {
    logger.warn('chat-persistence', 'persistAttachmentsAsync failed', { err });
  }
}

/**
 * Charge la conversation persistée depuis localStorage.
 * Strip streaming flag + filtre messages vides.
 * Retourne [] si pas de data ou JSON invalide.
 */
export function loadPersistedConversation(): PersistedMessage[] {
  try {
    const raw = localStorage.getItem(CONV_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PersistedMessage[];
    if (!Array.isArray(arr)) return [];
    const loaded = arr
      .map((m) => ({ ...m, streaming: false }))
      .filter((m) => m.text || m.role === 'tool_card' || (m.attachments && m.attachments.length > 0));
    /* v13.4.191 : restore attachments base64 depuis IDB async (fire-and-forget).
     * Les sentinels '__IDB__' sont remplacés par le vrai base64 dès que IDB
     * répond. Conversation render utilise les attachments rehydrated. */
    void restoreAttachmentsForMessages(loaded);
    return loaded;
  } catch {
    return [];
  }
}

/* v13.4.191 — Restore attachments base64 depuis IDB pour tous messages
 * avec sentinel '__IDB__'. Mute l'array conversation in-place. */
async function restoreAttachmentsForMessages(messages: PersistedMessage[]): Promise<void> {
  try {
    const { chatAttachmentsStore } = await import('../../services/ai/chat-attachments-store.js');
    for (const msg of messages) {
      if (!msg.attachments || msg.attachments.length === 0) continue;
      const hasSentinel = msg.attachments.some((a) => a.base64 === '__IDB__');
      if (!hasSentinel) continue;
      try {
        const restored = await chatAttachmentsStore.restoreAttachments(msg.id);
        if (restored.length > 0) {
          msg.attachments = restored;
        }
      } catch { /* skip ce message */ }
    }
    logger.info('chat-persistence', 'attachments restored from IDB');
  } catch (err: unknown) {
    logger.warn('chat-persistence', 'restoreAttachmentsForMessages failed', { err });
  }
}

/**
 * Persiste la conversation (debounce 500ms localStorage + 30s Firebase).
 * Idempotent : reset les timers à chaque appel.
 *
 * @param conversation - Array passé par référence (lu, jamais muté ici)
 */
export function persistConversation(conversation: readonly PersistedMessage[]): void {
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    try {
      const toSave = conversation
        .filter((m) => !m.streaming)
        .slice(-CONV_MAX_PERSIST);
      /* v13.4.191 fix Kevin "attachments perdus entre sessions" :
       * Avant : base64 attachments stockés dans localStorage → quota exceeded
       *         (5 MB iOS) → drop silencieux → fichiers perdus.
       * Après : attachments dans IDB séparé (capacité 50-500 MB) + localStorage
       *         garde uniquement métadonnées légères {mime, name} (pas base64).
       *         Restoration au load via loadPersistedConversation. */
      const lightToSave = toSave.map((m) => {
        if (!m.attachments || m.attachments.length === 0) return m;
        /* Persist heavy base64 dans IDB en async, fire-and-forget */
        void persistAttachmentsAsync(m.id, m.attachments);
        return {
          ...m,
          attachments: m.attachments.map((a) => ({
            mime: a.mime,
            name: a.name,
            base64: '__IDB__', /* sentinel : restoré depuis IDB au load */
          })),
        };
      });
      localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(lightToSave));
    } catch {
      /* Quota exceeded → trim plus agressif */
      try {
        const half = conversation
          .filter((m) => !m.streaming)
          .slice(-(CONV_MAX_PERSIST / 2))
          .map((m) => ({ ...m, attachments: m.attachments ? m.attachments.map((a) => ({ mime: a.mime, name: a.name, base64: '__IDB__' })) : undefined }));
        localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(half));
      } catch {
        /* skip */
      }
    }
  }, LOCAL_DEBOUNCE_MS);

  if (_firebaseSyncTimeout) clearTimeout(_firebaseSyncTimeout);
  _firebaseSyncTimeout = setTimeout(() => {
    void (async () => {
      try {
        const cloudPayload = conversation
          .filter((m) => !m.streaming && m.text && m.text.length < FIREBASE_MAX_TEXT_LEN)
          .slice(-FIREBASE_MAX_MESSAGES)
          .map((m) => ({ role: m.role, text: m.text, ts: m.ts }));
        const { firebase } = await import('../../services/storage/firebase.js');
        await firebase.write(FIREBASE_PATH, cloudPayload);
      } catch (err: unknown) {
        logger.warn('chat-persistence', 'Firebase sync skipped', { err });
      }
    })();
  }, FIREBASE_DEBOUNCE_MS);
}

/**
 * Restore Firebase au boot SI conversation locale vide (cache PWA clear iOS).
 * Async, non-bloquant. Push directement dans l'array passé par référence.
 *
 * @param conversation - Array muté in-place (push messages restaurés)
 */
export async function tryFirebaseRestoreConversation(
  conversation: PersistedMessage[],
): Promise<void> {
  if (conversation.length > 0) return; /* déjà chargé local */
  try {
    const { firebase } = await import('../../services/storage/firebase.js');
    const cloudRaw = await firebase.read(FIREBASE_PATH);
    if (!Array.isArray(cloudRaw) || cloudRaw.length === 0) return;
    const restored: PersistedMessage[] = (cloudRaw as Array<{ id?: string; role: 'user' | 'assistant'; text: string; ts: number }>)
      .filter((m) => m && typeof m.text === 'string' && m.text.length > 0)
      .map((m) => ({
        id: m.id ?? `restored_${m.ts}_${Math.random().toString(36).slice(2, 8)}`,
        role: m.role,
        text: m.text,
        ts: m.ts,
        streaming: false,
      }));
    if (restored.length > 0) {
      conversation.push(...restored);
      logger.info('chat-persistence', `Restored ${restored.length} msgs from Firebase`);
    }
  } catch (err: unknown) {
    logger.warn('chat-persistence', 'Firebase restore skipped', { err });
  }
}

/**
 * v13.4.284 — Efface la conversation courante de TOUTES les couches de
 * persistance (Kevin "J'ai effacé les messages mais ils reviennent avec les Maj").
 *
 * CAUSE du bug : l'ancien bouton 🗑 ne supprimait que des clés localStorage
 * ERRONÉES (`apex_v13_chat_messages_<uid>`) — jamais `apex_v13_conversation_active`
 * (la vraie) ni le backup Firebase `apex_v13_conversation_cloud`. Au reload / après
 * une MAJ (cache local vidé), `tryFirebaseRestoreConversation` restaurait depuis
 * le cloud → les messages « effacés » réapparaissaient.
 *
 * Ce helper coupe les debounces en cours PUIS vide les 3 couches :
 *  1. localStorage `apex_v13_conversation_active`
 *  2. Firebase `apex_v13_conversation_cloud` (écrit [] → restore voit vide → skip)
 *  3. IDB pièces jointes (cleanupOrphans avec keep-set vide = tout purger)
 *
 * + nettoie les clés legacy pour ne rien laisser ressusciter.
 */
export async function clearConversationEverywhere(): Promise<void> {
  /* Coupe les écritures en attente (sinon un debounce ré-écrit l'ancien état). */
  if (_saveTimeout) { clearTimeout(_saveTimeout); _saveTimeout = null; }
  if (_firebaseSyncTimeout) { clearTimeout(_firebaseSyncTimeout); _firebaseSyncTimeout = null; }

  /* 1. localStorage — la VRAIE clé + clés legacy par uid. */
  try {
    localStorage.removeItem(CONV_STORAGE_KEY);
    let uid = 'anon';
    try {
      const raw = localStorage.getItem('apex_v13_user');
      if (raw) uid = (JSON.parse(raw) as { id?: string }).id ?? 'anon';
    } catch { /* ignore */ }
    localStorage.removeItem(`apex_v13_chat_messages_${uid}`);
    localStorage.removeItem(`apex_v13_chat_pending_${uid}`);
  } catch { /* quota/ignore */ }

  /* 2. Firebase backup — écrit [] pour empêcher la résurrection au prochain boot. */
  try {
    const { firebase } = await import('../../services/storage/firebase.js');
    await firebase.write(FIREBASE_PATH, []);
  } catch (err: unknown) {
    logger.warn('chat-persistence', 'clear Firebase skipped', { err });
  }

  /* 3. IDB pièces jointes — purge totale (aucun msgId à garder). */
  try {
    const { chatAttachmentsStore } = await import('../../services/ai/chat-attachments-store.js');
    await chatAttachmentsStore.cleanupOrphans(new Set<string>());
  } catch (err: unknown) {
    logger.warn('chat-persistence', 'clear IDB attachments skipped', { err });
  }

  logger.info('chat-persistence', 'conversation effacée (localStorage + Firebase + IDB)');
}

/** Reset internal timeouts (utile en tests pour cleanup). */
export function _resetPersistenceTimeoutsForTests(): void {
  if (_saveTimeout) clearTimeout(_saveTimeout);
  if (_firebaseSyncTimeout) clearTimeout(_firebaseSyncTimeout);
  _saveTimeout = null;
  _firebaseSyncTimeout = null;
}
