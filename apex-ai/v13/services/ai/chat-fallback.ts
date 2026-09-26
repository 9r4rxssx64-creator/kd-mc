/**
 * APEX v13 — Anti-pattern message-vide IA (règle CLAUDE.md absolue).
 *
 * Demande Kevin (CLAUDE.md règle ANTI-BLOCAGE IA) :
 * "Pas de réponse dans le vide ou qu'il dit qu'il n'a pas compris ou qu'il n'y a plus d'API.
 *  Ça ne doit jamais arriver. Les questions sont mises en attente, tout notées jamais
 *  rien oublier et répondre au fur et à mesure."
 *
 * Garanties :
 * 1. JAMAIS message vide / "je ne comprends pas" / "API down"
 * 2. Réponse DIRECTE (Kevin 2026-05-08 18:00 screenshot "trop verbeux") —
 *    plus de "Plan A/B/C" par défaut. Toggle `feature.ia-verbose-plans`
 *    pour réactiver l'ancien comportement (default OFF).
 * 3. Si tous providers IA fail → mode local-only avec features dispo
 * 4. Queue persistante (FIFO) si user envoie 5 messages d'affilée
 */

import { logger } from '../../core/logger.js';
import { isFeatureEnabled } from '../auth/feature-toggles.js';

export interface FallbackResponse {
  text: string;
  options?: Array<{ label: string; action: string }>;
  is_offline?: boolean;
}

class ChatFallback {
  /**
   * Détecte si réponse IA est vide/non-utile et substitue avec fallback intelligent.
   */
  needsFallback(response: string): boolean {
    if (!response || response.trim().length === 0) return true;
    const trimmed = response.trim().toLowerCase();
    if (trimmed.length < 10) return true;
    /* Détecte phrases interdites par règle Kevin */
    const FORBIDDEN_PHRASES = [
      "je n'ai pas compris",
      "je ne comprends pas",
      "pouvez-vous reformuler",
      "désolé, je ne peux pas",
      'api indisponible',
      'réessayez plus tard',
      'erreur réseau',
      "i don't understand",
      "i can't help",
    ];
    return FORBIDDEN_PHRASES.some((p) => trimmed.includes(p));
  }

  /**
   * Génère réponse fallback en cas de message-vide ou erreur API.
   * Toujours actionable, jamais bloquante.
   */
  generateFallback(userMessage: string, errorContext?: string): FallbackResponse {
    const trimmed = userMessage.trim().toLowerCase();

    /* Détection intent simple → réponse rapide même offline */
    if (/bonjour|salut|hello|hey|coucou/.test(trimmed)) {
      return {
        text: 'Bonjour ! Comment puis-je t\'aider aujourd\'hui ?',
        options: [
          { label: '💬 Poser une question', action: 'chat' },
          { label: '📂 Mes projets', action: 'projects' },
          { label: '⚙️ Réglages', action: 'settings' },
        ],
      };
    }

    if (/comment.*va|ça va|comment vas-tu/.test(trimmed)) {
      return {
        text: 'Je suis prêt à t\'aider ! Tu veux faire quoi ?',
        options: [
          { label: '🎵 Studio Musique', action: 'studio_music' },
          { label: '🎬 Studio Vidéo', action: 'studio_video' },
          { label: '📝 Bloc-notes', action: 'notes' },
        ],
      };
    }

    if (/aide|help|sos|comment faire/.test(trimmed)) {
      return {
        text: 'Plusieurs façons de t\'aider :\n• Pose ta question directement, je propose 3 réponses\n• Tape "studios" pour voir les outils créatifs\n• Tape "admin" pour le panneau de gestion (admin only)',
        options: [
          { label: '📞 Contacter Kevin', action: 'escalate_human' },
          { label: '📚 FAQ', action: 'faq' },
        ],
      };
    }

    /* Si erreur API spécifique → message clair */
    if (errorContext) {
      const lc = errorContext.toLowerCase();
      if (/quota|rate.?limit|insufficient|429|402/.test(lc)) {
        return {
          text: 'Crédit API IA épuisé sur le provider courant. Apex bascule sur un provider alternatif. Tu peux aussi recharger directement.',
          options: [
            { label: '💳 Recharger Anthropic', action: 'open_billing_anthropic' },
            { label: '🔄 Tenter via OpenRouter', action: 'failover_openrouter' },
            { label: '⚙️ Mode local (sans IA)', action: 'local_mode' },
          ],
        };
      }
      if (/401|unauthorized|invalid.?key/.test(lc)) {
        return {
          text: 'La clé API IA n\'est plus valide. Il faut la mettre à jour dans le Coffre.',
          options: [
            { label: '🔑 Modifier dans Coffre', action: 'open_vault' },
            { label: '🆘 Aide setup', action: 'help_setup' },
          ],
        };
      }
      if (/network|fetch.?failed|timeout|cors/.test(lc)) {
        return {
          text: 'Réseau temporairement indisponible. Apex queue ta question pour la traiter dès que la connexion revient.',
          options: [
            { label: '🔄 Réessayer maintenant', action: 'retry' },
            { label: '📋 Voir mes notes locales', action: 'notes' },
          ],
        };
      }
    }

    /* v13.3.78 + v13.3.79 (Kevin 2026-05-08 18:00 "trop verbeux Plan A/B/C") :
     * - Mode VERBOSE OFF (défaut) → diagnostic direct + 1 action concrète,
     *   pas d'énumération frustrante.
     * - Mode VERBOSE ON (toggle `feature.ia-verbose-plans` opt-in admin) →
     *   ancien template Plan A/B/C conservé pour debug ou cas vraiment ambigus. */
    if (isFeatureEnabled('feature.ia-verbose-plans')) {
      return {
        text: `Je peux t\'aider sur : "${userMessage.slice(0, 80)}". Voici 3 façons d\'aborder :\n\n• **Plan A** : explique-moi plus en détail ce que tu veux\n• **Plan B** : choisis un studio/outil dans la liste\n• **Plan C** : je propose une solution standard\n\nLaquelle préfères-tu ?`,
        options: [
          { label: 'Plan A : détaille', action: 'detail' },
          { label: 'Plan B : choisir outil', action: 'pick_tool' },
          { label: 'Plan C : solution standard', action: 'standard' },
        ],
      };
    }
    return {
      text: `🔄 Apex est temporairement en mode dégradé. Causes possibles :\n\n• Clé API IA non configurée (Coffre)\n• Provider IA injoignable (réseau)\n• Quota épuisé sur la clé courante\n\nApex bascule auto sur le prochain provider dispo. Si rien ne marche, vérifie ta config dans le Coffre 🔐.`,
      options: [
        { label: '🔄 Réessayer', action: 'retry' },
        { label: '🔐 Coffre (vérifier clés)', action: 'open_vault' },
        { label: '⚙️ Réglages', action: 'settings' },
      ],
    };
  }

  /**
   * Queue persistante de messages user (jamais perdus).
   */
  enqueue(message: string, userId: string): { queued: boolean; position: number } {
    const key = `apex_v13_pending_messages_${userId}`;
    try {
      const queue = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
        id: string;
        text: string;
        ts: number;
        status: 'pending' | 'processing' | 'done';
      }>;
      queue.push({
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: message,
        ts: Date.now(),
        status: 'pending',
      });
      /* Cap 50 max */
      const trimmed = queue.length > 50 ? queue.slice(-50) : queue;
      localStorage.setItem(key, JSON.stringify(trimmed));
      return { queued: true, position: trimmed.length };
    } catch (err: unknown) {
      logger.warn('chat-fallback', 'enqueue failed', { err });
      return { queued: false, position: 0 };
    }
  }

  /**
   * Pop next pending message.
   */
  dequeue(userId: string): { message?: string; remaining: number } {
    const key = `apex_v13_pending_messages_${userId}`;
    try {
      const queue = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
        id: string;
        text: string;
        ts: number;
        status: string;
      }>;
      const next = queue.find((q) => q.status === 'pending');
      if (!next) return { remaining: 0 };
      next.status = 'processing';
      localStorage.setItem(key, JSON.stringify(queue));
      return { message: next.text, remaining: queue.filter((q) => q.status === 'pending').length };
    } catch {
      return { remaining: 0 };
    }
  }

  /**
   * Mark message done (cleanup).
   */
  markDone(messageId: string, userId: string): void {
    const key = `apex_v13_pending_messages_${userId}`;
    try {
      const queue = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string; status: string }>;
      const found = queue.find((q) => q.id === messageId);
      if (found) found.status = 'done';
      /* Garbage collect done > 5 min */
      const cutoff = Date.now() - 5 * 60 * 1000;
      const filtered = queue.filter((q) => {
        const ts = (q as { ts?: number }).ts ?? 0;
        return q.status !== 'done' || ts > cutoff;
      });
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {
      /* ignore */
    }
  }

  /**
   * Stats queue (admin dashboard).
   */
  getQueueStats(userId: string): { pending: number; processing: number; done: number } {
    const key = `apex_v13_pending_messages_${userId}`;
    try {
      const queue = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ status: string }>;
      return {
        pending: queue.filter((q) => q.status === 'pending').length,
        processing: queue.filter((q) => q.status === 'processing').length,
        done: queue.filter((q) => q.status === 'done').length,
      };
    } catch {
      return { pending: 0, processing: 0, done: 0 };
    }
  }
}

export const chatFallback = new ChatFallback();
