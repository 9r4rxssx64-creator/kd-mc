// Types partagés de l'interface. Chaque document porte `updatedAt` (synchro « dernière écriture gagne »).
export interface Doc { id: string; updatedAt: number; deleted?: boolean }

export interface Conversation extends Doc { title: string; createdAt: number }
export interface Message extends Doc {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  provider?: string;
  error?: string; // message d'erreur lisible si la réponse a échoué
}
export interface Memory extends Doc { text: string; enabled: boolean; createdAt: number }
export interface Note extends Doc { title: string; body: string; createdAt: number }
export interface Task extends Doc { title: string; done: boolean; due?: string; createdAt: number }
export interface Reminder extends Doc { text: string; at: number; fired: boolean; createdAt: number }
export interface ShoppingItem extends Doc { text: string; done: boolean; createdAt: number }
export interface VoiceNote extends Doc { title: string; transcript: string; createdAt: number }

export type CollectionName =
  | "conversations" | "messages" | "memories" | "notes" | "tasks" | "reminders" | "shopping" | "voicenotes" | "settings";

export interface CollectionMap {
  conversations: Conversation; messages: Message; memories: Memory; notes: Note;
  tasks: Task; reminders: Reminder; shopping: ShoppingItem; voicenotes: VoiceNote; settings: SettingsDoc;
}

export type ProviderId = "gemini" | "groq" | "openrouter" | "custom";

export interface VoiceChoice {
  /** « browser » = voix du navigateur ; sinon moteur serveur. */
  engine: "browser" | "piper" | "kokoro" | "elevenlabs";
  id: string; // voiceURI (navigateur) ou identifiant serveur
}

export interface SettingsDoc extends Doc {
  language: string;            // langue de l'interface et de la voix, ex. « fr-FR »
  theme: "light" | "dark" | "auto";
  textSize: "small" | "normal" | "large";
  animation: "full" | "reduced" | "off";
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  voice: VoiceChoice | null;
  rate: number; pitch: number; volume: number;
  speakReplies: boolean;
  memoryEnabled: boolean;
  /** Nombre maximal de messages renvoyés au fournisseur d'IA. */
  contextMessages: number;
}

export const SETTINGS_ID = "main";

export const DEFAULT_SETTINGS: SettingsDoc = {
  id: SETTINGS_ID, updatedAt: 0,
  language: "fr-FR", theme: "auto", textSize: "normal", animation: "full",
  provider: "gemini", models: {}, voice: null,
  rate: 1, pitch: 1, volume: 1, speakReplies: false, memoryEnabled: true, contextMessages: 20,
};

export type BibiState =
  | "rest" | "waiting" | "listening" | "thinking" | "speaking" | "happy" | "surprised" | "sad" | "error" | "sleep";

/** Fournisseur tel que décrit par GET /api/providers (jamais de clé). */
export interface ProviderStatus {
  id: ProviderId;
  name: string;
  signupUrl: string;
  keyHelp: string;
  freeTierNote: string;
  defaultModel: string;
  configured: boolean;
  keySource: "env" | "saved" | "none" | null;
  costUncertain: boolean;
  blockedReason: string | null;
  usage: { limits: Record<string, string>; lastSeenAt: number | null };
}

export interface SessionInfo {
  mode: "open" | "code" | "accounts";
  authenticated: boolean;
  user: { email: string; owner: boolean } | null;
  registrationOpen: boolean;
  features: { cloudSync: boolean; localMemory: boolean; allowPaidProviders: boolean; defaultProvider: ProviderId };
}

export interface SpeechEngineInfo { configured: boolean; allowed: boolean; note: string }
export type SpeechEngines = Record<"elevenlabs" | "piper" | "kokoro" | "whisper", SpeechEngineInfo>;
export interface ServerVoice { id: string; name: string; lang: string; engine: "elevenlabs" | "piper" | "kokoro"; previewUrl?: string }
