/**
 * APEX v13.4.364 — Orchestre d'IA (Kevin 2026-08-06 « Utilise toutes les ia dispo.
 * Orchestre d'ia… va plus loin »).
 *
 * Pour un « gros travail » (audit, expert, complet, exhaustif…), au lieu d'une
 * seule IA : fan-out PARALLÈLE vers TOUTES les IA disponibles (crew-experts,
 * chaque expert appelle VRAIMENT son provider via aiRouter.streamSingle), puis
 * Anthropic joue le CHEF D'ORCHESTRE : il relit toutes les réponses et stream
 * la synthèse finale (divergences citées par IA).
 *
 * Contrat de callbacks IDENTIQUE à aiRouter.stream → le chat bascule d'une
 * ligne, zéro chirurgie du moteur. Fail-open total : si l'orchestre échoue,
 * on retombe sur aiRouter.stream normal (jamais de blocage — règle ANTI-BLOCAGE).
 *
 * Flag : apex_v13_orchestra ('on' par défaut pour l'admin, off via /orchestre off).
 */
import { logger } from '../../core/logger.js';

import { aiRouter, type ChatMessage, type StreamChunk } from './ai-router.js';
import { crewExperts } from './crew-experts.js';

const FLAG_KEY = 'apex_v13_orchestra';
const FORCE_ONCE_KEY = 'apex_v13_orchestra_force_once';

class AIOrchestrator {
  /** Auto-orchestration active ? (défaut ON — règle Kevin 2026-05-08 « automatiquement ») */
  isEnabled(): boolean {
    try {
      return localStorage.getItem(FLAG_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  setEnabled(on: boolean): void {
    try {
      localStorage.setItem(FLAG_KEY, on ? 'on' : 'off');
    } catch { /* ignore */ }
  }

  /** Force le prochain message à passer par l'orchestre (commande /orchestre <question>). */
  forceNext(): void {
    try {
      sessionStorage.setItem(FORCE_ONCE_KEY, '1');
    } catch { /* ignore */ }
  }

  /**
   * Ce message doit-il être orchestré ? Gros travail détecté (audit/expert/complet…)
   * OU force one-shot posé par /orchestre. Consomme le force one-shot.
   */
  shouldOrchestrate(text: string): boolean {
    try {
      if (sessionStorage.getItem(FORCE_ONCE_KEY) === '1') {
        sessionStorage.removeItem(FORCE_ONCE_KEY);
        return true;
      }
    } catch { /* ignore */ }
    if (!this.isEnabled()) return false;
    /* Minimum 2 IA disponibles sinon l'orchestre n'apporte rien */
    if (crewExperts.availableProviders().length < 2) return false;
    return crewExperts.shouldUseCrew(text);
  }

  /**
   * Contrat identique à aiRouter.stream(messages, system, onChunk, onError).
   * 1. Fan-out : toutes les IA dispo en parallèle (question = dernier message user).
   * 2. Progrès streamé (« 🎼 N IA consultées… »).
   * 3. Synthèse chef d'orchestre (Anthropic) streamée comme réponse finale.
   * Fail-open : toute erreur d'orchestre → aiRouter.stream normal.
   */
  async stream(
    messages: ChatMessage[],
    system: string,
    onChunk: (chunk: StreamChunk) => void,
    onError?: (err: Error) => void,
  ): Promise<void> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const task = typeof lastUser?.content === 'string' ? lastUser.content : '';
    if (!task) {
      return aiRouter.stream(messages, system, onChunk, onError);
    }
    try {
      const members = crewExperts.defaultMembers('specialized');
      const names = members.map((m) => crewExperts.providerName(m.provider)).join(' + ');
      onChunk({
        text: `🎼 **Orchestre d'IA** — je consulte ${members.length} IA en parallèle (${names})…\n\n`,
        done: false,
        provider: 'anthropic',
      });

      const result = await crewExperts.run({
        task,
        systemPrompt: system,
        members,
        mode: 'specialized',
      });

      const okCount = result.responses.filter((r) => r.ok && r.text).length;
      if (okCount === 0) {
        /* Aucun expert n'a répondu → route normale (failover complet), pas de cul-de-sac */
        logger.warn('ai-orchestrator', 'fan-out 0 réponse → fallback aiRouter.stream');
        return aiRouter.stream(messages, system, onChunk, onError);
      }
      onChunk({
        text: `✅ ${okCount}/${members.length} IA ont répondu (${Math.round(result.totalLatencyMs / 100) / 10}s). Synthèse en cours…\n\n---\n\n`,
        done: false,
        provider: 'anthropic',
      });

      /* Synthèse chef d'orchestre streamée en direct dans la bulle */
      const finalText = await crewExperts.conductorSynthesis(result, task, (c) => {
        if (c.text) onChunk({ text: c.text, done: false, provider: 'anthropic' });
      });
      /* Si le conducteur n'a rien streamé (fallback naïf), émet le texte d'un bloc */
      if (finalText && finalText === result.synthesis) {
        onChunk({ text: finalText, done: false, provider: 'anthropic' });
      }
      if (result.conflicts.length > 0) {
        onChunk({
          text: `\n\n> ⚖️ Divergences détectées : ${result.conflicts.join(' · ')}`,
          done: false,
          provider: 'anthropic',
        });
      }
      onChunk({ text: '', done: true, provider: 'anthropic' });
    } catch (err: unknown) {
      /* Fail-open : l'orchestre ne bloque JAMAIS — route normale */
      logger.warn('ai-orchestrator', 'orchestration failed → fallback aiRouter.stream', {
        err: err instanceof Error ? err.message : String(err),
      });
      return aiRouter.stream(messages, system, onChunk, onError);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
