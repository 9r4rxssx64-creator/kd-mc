/**
 * APEX v13.4.286 — Journal permanent du chat (Kevin "Ajoute le journal permanent
 * aussi" + "Historique de tout ce que l'on dépose dans le chat apex" +
 * "Apex doit savoir tout ce qu'il y a partout").
 *
 * Append-only : enregistre TOUT ce que Kevin dépose dans le chat (texte, collages,
 * plannings, questions). Contrairement à la conversation courante, ce journal :
 *  - N'est JAMAIS vidé par « Effacer le chat » (clearConversationEverywhere).
 *  - Survit aux MAJ / réinstall PWA (backup Firebase + restore au boot si local vide).
 *  - Sert de mémoire long terme « tout ce qu'il y a partout ».
 *
 * Sécurité (règle Kevin "secrets jamais en clair") :
 *  - Les clés/tokens détectés sont MASQUÉS avant stockage (« 🔑 <service> masquée »).
 *    Le journal garde la trace du DÉPÔT, jamais le secret en clair.
 *
 * Storage :
 *  - localStorage `apex_v13_chat_journal` = Array<JournalEntry> (cap 1000 FIFO)
 *  - Firebase `apex_v13_chat_journal_cloud` (backup, debounce 8s)
 */

import { logger } from '../../core/logger.js';

const STORAGE_KEY = 'apex_v13_chat_journal';
const FIREBASE_PATH = 'apex_v13_chat_journal_cloud';
const CAP = 1000;
const CLOUD_MAX = 300; /* on ne pousse que les 300 derniers vers Firebase (taille) */
const CLOUD_MAX_TEXT = 4000;
const FIREBASE_DEBOUNCE_MS = 8_000;

export type JournalSource = 'user' | 'paste' | 'planning' | 'note';

export interface JournalEntry {
  id: string;
  ts: number;
  source: JournalSource;
  /** Texte déjà redacté (secrets masqués). */
  text: string;
  /** true si un secret a été masqué dans cette entrée. */
  hadSecret?: boolean;
}

let _fbTimeout: ReturnType<typeof setTimeout> | null = null;

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return 'jr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function readAll(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is JournalEntry =>
        !!e && typeof (e as JournalEntry).id === 'string' && typeof (e as JournalEntry).text === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(arr: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* quota — trim agressif puis retry */
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-Math.floor(CAP / 2))));
    } catch { /* abandon silencieux */ }
  }
}

/**
 * Masque les secrets détectés dans le texte AVANT stockage.
 * Retourne {text, hadSecret}.
 */
async function redactSecrets(text: string): Promise<{ text: string; hadSecret: boolean }> {
  try {
    const { detectAllCredentials } = await import('../vault/credential-patterns.js');
    const found = detectAllCredentials(text);
    if (found.length === 0) return { text, hadSecret: false };
    let out = text;
    for (const { pattern, value } of found) {
      if (pattern.category === 'forbidden') {
        out = out.split(value).join('«🚫 donnée sensible masquée»');
      } else {
        out = out.split(value).join(`«🔑 ${pattern.name} masquée»`);
      }
    }
    return { text: out, hadSecret: true };
  } catch {
    return { text, hadSecret: false };
  }
}

function scheduleCloudBackup(): void {
  if (_fbTimeout) clearTimeout(_fbTimeout);
  _fbTimeout = setTimeout(() => {
    void (async () => {
      try {
        const payload = readAll().slice(-CLOUD_MAX).map((e) => ({
          id: e.id,
          ts: e.ts,
          source: e.source,
          text: e.text.slice(0, CLOUD_MAX_TEXT),
          ...(e.hadSecret ? { hadSecret: true } : {}),
        }));
        const { firebase } = await import('../storage/firebase.js');
        await firebase.write(FIREBASE_PATH, payload);
      } catch (err: unknown) {
        logger.debug('chat-journal', 'cloud backup skipped (offline ok)', { err });
      }
    })();
  }, FIREBASE_DEBOUNCE_MS);
}

class ChatJournalService {
  /**
   * Ajoute une entrée (secrets masqués). Best-effort, ne throw jamais.
   */
  async append(rawText: string, source: JournalSource = 'user'): Promise<void> {
    const trimmed = (rawText ?? '').trim();
    if (!trimmed) return;
    try {
      const { text, hadSecret } = await redactSecrets(trimmed);
      const all = readAll();
      const entry: JournalEntry = { id: uuid(), ts: Date.now(), source, text };
      if (hadSecret) entry.hadSecret = true;
      all.push(entry);
      while (all.length > CAP) all.shift();
      writeAll(all);
      scheduleCloudBackup();
    } catch (err: unknown) {
      logger.debug('chat-journal', 'append failed', { err });
    }
  }

  /** Liste complète (plus récent en dernier). */
  list(): JournalEntry[] {
    return readAll();
  }

  /** Recherche plein-texte (case-insensitive). */
  search(query: string): JournalEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return readAll();
    return readAll().filter((e) => e.text.toLowerCase().includes(q));
  }

  count(): number {
    return readAll().length;
  }

  /**
   * Restore depuis le cloud SI le journal local est vide (survit MAJ / réinstall).
   */
  async restoreFromCloud(): Promise<number> {
    if (readAll().length > 0) return 0;
    try {
      const { firebase } = await import('../storage/firebase.js');
      const cloud = await firebase.read<JournalEntry[]>(FIREBASE_PATH);
      if (!Array.isArray(cloud) || cloud.length === 0) return 0;
      const clean = cloud.filter(
        (e) => e && typeof e.id === 'string' && typeof e.text === 'string',
      );
      writeAll(clean.slice(-CAP));
      logger.info('chat-journal', `restored ${clean.length} entrées depuis le cloud`);
      return clean.length;
    } catch (err: unknown) {
      logger.debug('chat-journal', 'restore skipped', { err });
      return 0;
    }
  }

  /** Export texte lisible (pour téléchargement / copie). */
  exportText(): string {
    const lines = readAll().map((e) => {
      const d = new Date(e.ts).toLocaleString('fr-FR');
      return `[${d}] (${e.source}${e.hadSecret ? ' • secret masqué' : ''})\n${e.text}\n`;
    });
    return `# Journal permanent Apex — ${readAll().length} entrées\n\n${lines.join('\n')}`;
  }

  /**
   * Vide le journal PARTOUT (local + cloud). Action explicite et rare —
   * le journal est censé être permanent ; ce n'est PAS appelé par « Effacer le chat ».
   */
  async clearAll(): Promise<void> {
    if (_fbTimeout) { clearTimeout(_fbTimeout); _fbTimeout = null; }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try {
      const { firebase } = await import('../storage/firebase.js');
      await firebase.write(FIREBASE_PATH, []);
    } catch (err: unknown) {
      logger.debug('chat-journal', 'clear cloud skipped', { err });
    }
  }
}

export const chatJournal = new ChatJournalService();

/* Test helpers */
export const __chat_journal_test = { STORAGE_KEY, FIREBASE_PATH, CAP };
