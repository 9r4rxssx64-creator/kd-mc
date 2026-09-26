/**
 * APEX v13 — Message Fact Extractor (Sprint 13.3.71 Kevin règle absolue
 * "ENRICHISSEMENT PROFILS CONTINU" 2026-04-25)
 *
 * Hook l'event `chat:message:user` pour extraire automatiquement des faits
 * critiques (anniversaires, préférences, allergies, projets, relations,
 * adresse) depuis chaque message utilisateur, et les pousser dans
 * `persistent_memory_<uid>` (5000 entries cap).
 *
 * SAFETY :
 * - Forbidden patterns (CB / seed phrases / tokens API en clair) → SKIP extraction
 * - Best-effort : `events.on('chat:message:user', ...)` non bloquant
 * - Async dynamic import (`memory`, `persistent-memory-store`) pour éviter circular dep
 *
 * Wire : `messageFactExtractor.start()` au boot ⇒ subscribe events bus.
 *
 * Règle Kevin : "À chaque message user, extract facts critiques (NLP regex)
 * → push dans `ax_persistent_memory_<uid>` automatiquement."
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';

export interface ExtractedFact {
  category: 'profile' | 'preferences' | 'projects' | 'relationships' | 'facts';
  text: string;
  importance: number; /* 0-100 */
}

export interface ExtractionRunResult {
  uid: string;
  text: string;
  extracted: number;
  facts: ExtractedFact[];
  blocked?: boolean; /* true si forbidden pattern */
  blockedReason?: string;
}

/**
 * Patterns INTERDITS — ne JAMAIS extraire si l'un match (sécurité absolue).
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'cb', re: /\b(?:\d[ -]*?){13,19}\b/ },
  { name: 'token_api', re: /\bsk-(?:ant|proj)?[A-Za-z0-9_-]{20,}/i },
  { name: 'seed_phrase', re: /\b(?:[a-zA-Z]+\s+){11}[a-zA-Z]+\b/ },
  { name: 'github_pat', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'aws_key', re: /\bAKIA[0-9A-Z]{16}\b/ },
];

class MessageFactExtractor {
  private started = false;
  private unsubscribe: (() => void) | null = null;
  private lastRun: ExtractionRunResult | null = null;
  private totalExtracted = 0;
  private totalBlocked = 0;

  /**
   * Démarre l'écoute du bus events.
   * Idempotent (safe à appeler plusieurs fois).
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribe = events.on('chat:message:user', (payload) => {
      void this.processMessage(payload.text, payload.uid);
    });
    logger.info('message-fact-extractor', 'started (listening chat:message:user)');
  }

  /**
   * Stop écoute (utilisé pour tests + lifecycle teardown).
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.started = false;
  }

  /**
   * Process un message user en extrayant facts.
   * Public pour tests + appel direct depuis chat (sans event bus).
   */
  async processMessage(text: string, uid: string): Promise<ExtractionRunResult> {
    if (!text || text.length < 5) {
      const r: ExtractionRunResult = { uid, text, extracted: 0, facts: [] };
      this.lastRun = r;
      return r;
    }

    /* Check forbidden patterns AVANT toute extraction */
    for (const fp of FORBIDDEN_PATTERNS) {
      if (fp.re.test(text)) {
        this.totalBlocked += 1;
        const r: ExtractionRunResult = {
          uid,
          text,
          extracted: 0,
          facts: [],
          blocked: true,
          blockedReason: fp.name,
        };
        this.lastRun = r;
        logger.warn('message-fact-extractor', 'forbidden pattern detected, skip', { reason: fp.name });
        return r;
      }
    }

    const facts = this.detectFacts(text);

    if (facts.length > 0) {
      try {
        const { persistentMemory } = await import('../storage/persistent-memory-store.js');
        for (const f of facts) {
          await persistentMemory.add({
            category: f.category,
            text: f.text,
            scope: uid || 'global',
            importance: f.importance,
            source: 'chat',
          });
        }
        this.totalExtracted += facts.length;
      } catch (err: unknown) {
        logger.warn('message-fact-extractor', 'persist failed', { err });
      }
    }

    const result: ExtractionRunResult = { uid, text, extracted: facts.length, facts };
    this.lastRun = result;
    return result;
  }

  /**
   * Detect facts depuis un texte (logic regex pure, sans persistence).
   * Public pour tests directs.
   */
  detectFacts(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    const t = text.toLowerCase();

    /* Âge */
    const ageMatch = /(?:j'ai|jai|ai)\s+(\d{1,2})\s+ans/.exec(t);
    if (ageMatch?.[1]) {
      const age = parseInt(ageMatch[1], 10);
      if (age >= 1 && age <= 120) {
        facts.push({ category: 'profile', text: `Âge : ${age} ans`, importance: 70 });
      }
    }

    /* Anniversaire */
    const annivMatch = /(?:anniv(?:ersaire)?|né\s+le|naiss(?:ance)?)\s+(?:le\s+)?(\d{1,2})\s+([a-zéûôà-ÿ]+)/i.exec(text);
    if (annivMatch?.[1] && annivMatch[2]) {
      facts.push({
        category: 'profile',
        text: `Anniversaire : ${annivMatch[1]} ${annivMatch[2]}`,
        importance: 80,
      });
    }

    /* Préférences (j'aime, j'adore, je préfère) */
    const likeRe = /(?:j'aime|j'adore|je préfère|j'apprécie)\s+(?:le\s+|la\s+|les\s+|l'|du\s+|de\s+la\s+)?([a-zà-ÿ\s]{3,40}?)(?:\.|,|;|!|\?|$)/gi;
    const likeMatches = text.matchAll(likeRe);
    for (const m of likeMatches) {
      if (m[1]) {
        const v = m[1].trim();
        if (v.length >= 3) facts.push({ category: 'preferences', text: `Aime : ${v}`, importance: 50 });
      }
    }

    const dislikeRe = /(?:je déteste|je n'aime pas|j'évite)\s+(?:le\s+|la\s+|les\s+|l'|du\s+)?([a-zà-ÿ\s]{3,40}?)(?:\.|,|;|!|\?|$)/gi;
    const dislikeMatches = text.matchAll(dislikeRe);
    for (const m of dislikeMatches) {
      if (m[1]) {
        const v = m[1].trim();
        if (v.length >= 3) facts.push({ category: 'preferences', text: `N'aime pas : ${v}`, importance: 50 });
      }
    }

    /* Allergies — santé, importance haute */
    const allergyMatch = /allergique\s+(?:à\s+|au\s+|aux\s+|à\s+l')?([a-zà-ÿ\s]{3,40}?)(?:\.|,|;|!|\?|$)/i.exec(text);
    if (allergyMatch?.[1]) {
      facts.push({
        category: 'profile',
        text: `⚠️ Allergie : ${allergyMatch[1].trim()}`,
        importance: 95,
      });
    }

    /* Projets */
    const projectRe = /(?:je travaille sur|mon projet|je développe|je construis)\s+(?:le\s+|la\s+|un\s+|une\s+)?([a-zA-Zà-ÿ0-9\s]{3,50}?)(?:\.|,|;|!|\?|$)/gi;
    const projectMatches = text.matchAll(projectRe);
    for (const m of projectMatches) {
      if (m[1]) {
        const v = m[1].trim();
        if (v.length >= 3) facts.push({ category: 'projects', text: `Projet actif : ${v}`, importance: 75 });
      }
    }

    /* Relations */
    const relRe = /(?:ma\s+(?:femme|épouse|fille|sœur|mère|maman|cousine)|mon\s+(?:mari|époux|fils|frère|père|papa|cousin|collègue|ami|copain))\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)/gi;
    const relMatches = text.matchAll(relRe);
    for (const m of relMatches) {
      if (m[0] && m[1]) {
        facts.push({ category: 'relationships', text: m[0].trim(), importance: 70 });
      }
    }

    /* Lieu / ville */
    const cityMatch = /(?:j'habite|je vis|je réside)\s+(?:à\s+|au\s+|en\s+|dans\s+)?([A-ZÀ-Ÿ][a-zà-ÿ\-]{2,30}(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ\-]+)?)/.exec(text);
    if (cityMatch?.[1]) {
      facts.push({ category: 'profile', text: `Lieu : ${cityMatch[1].trim()}`, importance: 65 });
    }

    /* Métier */
    const jobMatch = /(?:je suis|je travaille comme|mon métier)\s+(?:un\s+|une\s+)?([a-zà-ÿ\-]{4,30})(?:\.|,|;|!|\?|\s+(?:à|au|chez|dans))/.exec(t);
    const STOP_WORDS = new Set(['très', 'pas', 'plus', 'fait', 'sur', 'allergique', 'sûr', 'celui']);
    if (jobMatch?.[1] && !STOP_WORDS.has(jobMatch[1])) {
      facts.push({ category: 'profile', text: `Métier : ${jobMatch[1].trim()}`, importance: 70 });
    }

    return facts;
  }

  /**
   * Stats agrégées (admin dashboard).
   */
  getStats(): {
    started: boolean;
    total_extracted: number;
    total_blocked: number;
    last_run?: ExtractionRunResult;
  } {
    const out: {
      started: boolean;
      total_extracted: number;
      total_blocked: number;
      last_run?: ExtractionRunResult;
    } = {
      started: this.started,
      total_extracted: this.totalExtracted,
      total_blocked: this.totalBlocked,
    };
    if (this.lastRun) out.last_run = this.lastRun;
    return out;
  }

  /**
   * Reset stats (tests + admin).
   */
  reset(): void {
    this.totalExtracted = 0;
    this.totalBlocked = 0;
    this.lastRun = null;
  }
}

export const messageFactExtractor = new MessageFactExtractor();
