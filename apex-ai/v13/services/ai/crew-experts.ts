/**
 * APEX v13.3.74 — Crew Experts (multi-IA parallèle gros travail)
 *
 * Règle Kevin 2026-05-08 : "Lorsque je demande du gros travail à Apex,
 * qu'il fasse marcher plusieurs IA ensemble pour aller plus vite toujours
 * en suivant ses méthodes de travail et ses documents."
 *
 * Pattern :
 *  1. Détecter "gros travail" (audit complet, génération longue, multi-angle)
 *  2. Lancer 3-5 providers en parallèle via Promise.allSettled
 *  3. Synthétiser : consensus / debate / specialized
 *  4. Préserver méthodes de travail (system prompt enrichi pour CHAQUE provider)
 *  5. Audit log + stats par provider
 *
 * INTERDICTIONS :
 *  - Pas de provider "stripped" sans context (violation CLAUDE.md)
 *  - Pas de timeout >30s par provider (failover global)
 *  - Pas de cache provider-level (chaque run est fresh)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { aiRouter } from './ai-router.js';

export type CrewMode = 'consensus' | 'debate' | 'specialized';
/* v13.4.364 (Kevin « Utilise toutes les IA dispo ») : élargi à TOUS les providers
 * réellement appelables par le router (openclaw exclu = placeholder sans clé). */
export type CrewProvider = 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'cerebras' | 'qwen';

export interface CrewMember {
  provider: CrewProvider;
  expertise?: string; /* "security" | "code-quality" | "perf" | "ux" | "reasoning" */
  systemPromptOverride?: string;
}

export interface CrewResponse {
  provider: CrewProvider;
  expertise: string;
  text: string;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export interface CrewResult {
  task: string;
  mode: CrewMode;
  responses: CrewResponse[];
  synthesis: string;
  conflicts: string[];
  consensus: boolean;
  totalLatencyMs: number;
  ts: number;
}

export interface CrewRunOptions {
  task: string;
  systemPrompt: string;
  members: readonly CrewMember[];
  mode?: CrewMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const HISTORY_KEY = 'ax_crew_runs_history';
const HISTORY_MAX = 50;

/* Expertise par provider (cohérent règle CLAUDE.md "Hybrid LLM Orchestration") */
const EXPERTISE_MAP: Record<CrewProvider, string> = {
  anthropic: 'reasoning',
  openai: 'code-quality',
  gemini: 'vision',
  groq: 'speed',
  openrouter: 'general',
  qwen: 'multilingual', /* v13.4.366 : Qwen 3 gratuit (Workers AI) — général/multilingue */
  mistral: 'multilingual',
  cerebras: 'speed-alt',
};

/* v13.4.364 — Providers servis par le proxy Cloudflare (clé côté serveur, flag
 * apex_v13_use_secrets_proxy défaut ON) parmi ceux que le router sait appeler.
 * openrouter n'est PAS proxié → dispo seulement avec clé locale. */
const PROXIED_CREW: readonly CrewProvider[] = ['anthropic', 'openai', 'groq', 'gemini', 'mistral', 'cerebras', 'qwen'];

class CrewExpertsService {
  /**
   * Lance N providers en parallèle, synthétise leurs réponses.
   *
   * Important : chaque provider reçoit le MÊME system prompt enrichi
   * (méthodes de travail Kevin préservées partout — CLAUDE.md règle).
   */
  async run(opts: CrewRunOptions): Promise<CrewResult> {
    const tStart = Date.now();
    const mode = opts.mode ?? 'consensus';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (opts.members.length < 2) {
      throw new Error('Crew Experts requires at least 2 members');
    }

    /* Lance tous providers en parallèle */
    const promises = opts.members.map((member) =>
      this.runMember(member, opts.task, opts.systemPrompt, mode, timeoutMs, opts.signal),
    );
    const settled = await Promise.allSettled(promises);
    const responses: CrewResponse[] = settled.map((r, i) => {
      const member = opts.members[i];
      if (!member) throw new Error('member undefined');
      if (r.status === 'fulfilled') return r.value;
      const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      return {
        provider: member.provider,
        expertise: member.expertise ?? EXPERTISE_MAP[member.provider],
        text: '',
        latencyMs: 0,
        ok: false,
        error: errMsg.slice(0, 200),
      };
    });

    /* Synthèse selon mode */
    const synthesis = this.synthesize(responses, mode);
    const conflicts = this.detectConflicts(responses);
    const successful = responses.filter((r) => r.ok);
    const consensus = successful.length >= Math.ceil(responses.length / 2);

    const result: CrewResult = {
      task: opts.task.slice(0, 500),
      mode,
      responses,
      synthesis,
      conflicts,
      consensus,
      totalLatencyMs: Date.now() - tStart,
      ts: Date.now(),
    };

    /* Persist history (cap FIFO) */
    this.persistHistory(result);

    /* Audit log */
    void auditLog.record('crew.run', {
      details: {
        mode,
        members: opts.members.length,
        successful: successful.length,
        latencyMs: result.totalLatencyMs,
        consensus,
      },
    });

    logger.info(
      'crew-experts',
      `${successful.length}/${opts.members.length} providers OK · ${result.totalLatencyMs}ms · consensus=${consensus}`,
    );

    return result;
  }

  private async runMember(
    member: CrewMember,
    task: string,
    systemPrompt: string,
    mode: CrewMode,
    timeoutMs: number,
    parentSignal?: AbortSignal,
  ): Promise<CrewResponse> {
    const tStart = Date.now();
    const expertise = member.expertise ?? EXPERTISE_MAP[member.provider];
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    if (parentSignal) {
      parentSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    /* System prompt enrichi avec rôle expertise du membre */
    const enrichedPrompt = this.buildMemberPrompt(systemPrompt, expertise, mode, member.systemPromptOverride);

    let collectedText = '';
    try {
      /* v13.4.364 FIX ORCHESTRATION (Kevin « Utilise toutes les IA dispo ») :
       * avant, on passait par aiRouter.stream() = chaîne de failover → member.provider
       * était IGNORÉ et tous les « experts » tapaient la MÊME IA. streamSingle appelle
       * VRAIMENT le provider du membre (clés proxy/vault incluses, 0 failover croisé). */
      const result = await aiRouter.streamSingle(
        member.provider,
        [{ role: 'user', content: task }],
        enrichedPrompt,
        (chunk: { text?: string; done?: boolean }) => {
          if (chunk.text) collectedText += chunk.text;
        },
        ctrl.signal,
      );
      clearTimeout(timeout);
      if (!result.ok) throw new Error(result.error);
      return {
        provider: member.provider,
        expertise,
        text: result.text || collectedText,
        latencyMs: Date.now() - tStart,
        ok: true,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        provider: member.provider,
        expertise,
        text: collectedText,
        latencyMs: Date.now() - tStart,
        ok: false,
        error: errMsg.slice(0, 200),
      };
    }
  }

  private buildMemberPrompt(
    baseSystemPrompt: string,
    expertise: string,
    mode: CrewMode,
    override?: string,
  ): string {
    if (override) return override;
    let roleHint = '';
    if (mode === 'specialized') {
      roleHint = `\n\nTon expertise spécifique : ${expertise}. Concentre-toi sur cet angle.`;
    } else if (mode === 'debate') {
      roleHint = `\n\nMode débat : défends ton point de vue (expertise=${expertise}). Sois précis sur les divergences.`;
    } else {
      roleHint = `\n\nMode consensus : donne ta meilleure réponse en intégrant ton expertise (${expertise}).`;
    }
    return baseSystemPrompt + roleHint;
  }

  /**
   * Synthèse des N réponses selon mode.
   * - consensus : extrait le consensus des réponses similaires
   * - debate : présente divergences cliquables
   * - specialized : présente chaque expert avec son angle
   */
  synthesize(responses: readonly CrewResponse[], mode: CrewMode): string {
    const successful = responses.filter((r) => r.ok && r.text);
    if (successful.length === 0) return '⚠️ Aucun expert n\'a répondu. Réessaie.';
    if (successful.length === 1) {
      const r = successful[0];
      if (!r) return '';
      return r.text;
    }

    const lines: string[] = [];
    if (mode === 'specialized' || mode === 'debate') {
      lines.push(`## Synthèse ${successful.length} experts\n`);
      for (const r of successful) {
        lines.push(`### ${this.providerName(r.provider)} (${r.expertise})\n${r.text}\n`);
      }
    } else {
      /* consensus mode : prendre la réponse la plus longue (souvent la plus complète)
         + mentions des autres */
      const sorted = [...successful].sort((a, b) => b.text.length - a.text.length);
      const primary = sorted[0];
      if (!primary) return '';
      lines.push(primary.text);
      const others = sorted.slice(1);
      if (others.length > 0) {
        lines.push(`\n---\n*Aussi consulté : ${others.map((r) => this.providerName(r.provider)).join(', ')}*`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Détecte conflits significatifs entre réponses.
   * Heuristique simple : longueurs très différentes ou mots-clés contradictoires.
   */
  detectConflicts(responses: readonly CrewResponse[]): string[] {
    const successful = responses.filter((r) => r.ok && r.text);
    if (successful.length < 2) return [];
    const conflicts: string[] = [];

    /* Conflit 1 : longueurs très différentes (>3x) */
    const lengths = successful.map((r) => r.text.length);
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    if (minLen > 0 && maxLen / minLen > 3) {
      conflicts.push(`Divergence longueur : ${minLen}c → ${maxLen}c (3×+)`);
    }

    /* Conflit 2 : mots-clés contradictoires */
    const positivePhrases = ['oui', 'safe', 'sécurisé', 'recommandé', 'préférable'];
    const negativePhrases = ['non', 'dangereux', 'éviter', 'déconseillé', 'risqué'];
    for (let i = 0; i < successful.length - 1; i++) {
      for (let j = i + 1; j < successful.length; j++) {
        const r1 = successful[i];
        const r2 = successful[j];
        if (!r1 || !r2) continue;
        const t1 = r1.text.toLowerCase();
        const t2 = r2.text.toLowerCase();
        const r1Pos = positivePhrases.some((p) => t1.includes(p));
        const r1Neg = negativePhrases.some((p) => t1.includes(p));
        const r2Pos = positivePhrases.some((p) => t2.includes(p));
        const r2Neg = negativePhrases.some((p) => t2.includes(p));
        if ((r1Pos && r2Neg) || (r1Neg && r2Pos)) {
          conflicts.push(`${this.providerName(r1.provider)} vs ${this.providerName(r2.provider)} : avis opposés`);
        }
      }
    }

    return conflicts;
  }

  providerName(provider: CrewProvider): string {
    const names: Record<CrewProvider, string> = {
      anthropic: 'Claude',
      openai: 'GPT',
      gemini: 'Gemini',
      groq: 'Groq',
      openrouter: 'OpenRouter',
      mistral: 'Mistral',
      cerebras: 'Cerebras',
      qwen: 'Qwen',
    };
    return names[provider];
  }

  /**
   * v13.4.364 — TOUS les providers réellement disponibles maintenant :
   * proxy actif (défaut) → les 6 proxiés ; + tout provider avec clé locale
   * (openrouter). Anthropic toujours en tête (IA principale, leçon #124).
   */
  availableProviders(): CrewProvider[] {
    const out = new Set<CrewProvider>();
    let proxyOn = true;
    try {
      const f = localStorage.getItem('apex_v13_use_secrets_proxy');
      proxyOn = f !== 'false' && f !== '0';
    } catch { /* défaut ON */ }
    if (proxyOn) for (const p of PROXIED_CREW) out.add(p);
    const all: CrewProvider[] = ['anthropic', 'openai', 'openrouter', 'groq', 'gemini', 'mistral', 'cerebras', 'qwen'];
    for (const p of all) {
      try {
        const raw = localStorage.getItem(`ax_${p}_key`);
        if (raw && raw.length > 0) out.add(p);
      } catch { /* ignore */ }
    }
    out.add('anthropic'); /* toujours joignable (proxy) — jamais un crew vide */
    /* v13.4.367 (Kevin 2026-09-06 « Fais une concertation d'IA gratuites ») : les VOIX du
     * crew sont les gratuites d'abord (qwen/groq/gemini/cerebras/openrouter) ; Anthropic reste
     * membre ET chef d'orchestre de la synthèse (conductorSynthesis), les payants en dernier. */
    const order: CrewProvider[] = ['qwen', 'groq', 'gemini', 'cerebras', 'openrouter', 'anthropic', 'openai', 'mistral'];
    return order.filter((p) => out.has(p));
  }

  /**
   * v13.4.364 — Synthèse ORCHESTRÉE (« va plus loin ») : Anthropic relit toutes
   * les réponses des experts et produit la réponse finale fusionnée, en citant
   * les apports/divergences de chaque IA. Fallback : synthèse naïve si l'appel
   * chef d'orchestre échoue (jamais de réponse vide).
   */
  async conductorSynthesis(
    result: CrewResult,
    task: string,
    onChunk?: (chunk: { text?: string; done?: boolean }) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const successful = result.responses.filter((r) => r.ok && r.text);
    if (successful.length === 0) return result.synthesis;
    if (successful.length === 1) return result.synthesis;
    const expertBlock = successful
      .map((r) => `### ${this.providerName(r.provider)} (${r.expertise})\n${r.text.slice(0, 4000)}`)
      .join('\n\n');
    const conductorPrompt =
      'Tu es APEX, chef d\'orchestre d\'un panel multi-IA. Plusieurs IA expertes ont répondu ' +
      'indépendamment à la même question. Fusionne leurs réponses en UNE réponse finale : ' +
      'garde le meilleur de chacune, signale les divergences importantes (« Gemini dit X, GPT dit Y »), ' +
      'et termine par la recommandation la plus fiable. Réponds en français, direct, sans préambule.';
    let collected = '';
    const call = await aiRouter.streamSingle(
      'anthropic',
      [{ role: 'user', content: `Question d'origine :\n${task}\n\nRéponses des experts :\n\n${expertBlock}` }],
      conductorPrompt,
      (chunk) => {
        if (chunk.text) collected += chunk.text;
        onChunk?.(chunk);
      },
      signal,
    );
    if (call.ok && (call.text || collected)) return call.text || collected;
    logger.warn('crew-experts', 'conductor synthesis failed → fallback naïf', { err: call.ok ? '' : call.error });
    return result.synthesis;
  }

  private persistHistory(result: CrewResult): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as CrewResult[];
      const list = Array.isArray(arr) ? arr : [];
      list.push(result);
      const trimmed = list.slice(-HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('crew-experts', 'history persist failed', { err });
    }
  }

  /**
   * Liste runs récents (admin debug + vue vCrewMonitor).
   */
  history(): CrewResult[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as CrewResult[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /**
   * Détection automatique : tâche éligible crew-experts ?
   *
   * Critères trigger (cohérent CLAUDE.md règle 2026-05-08) :
   *  - Keywords explicites : audit, expert, complet, consulte, exhaustif
   *  - Question complexe (>200 caractères)
   *  - Décision critique (suppression, paiement, validation)
   */
  shouldUseCrew(taskText: string): boolean {
    const t = taskText.toLowerCase();
    const explicitKeywords = /\b(audit|expert|complet|consulte|exhaustif|approfondi|concert|tous?\s+les?\s+angles)\b/i;
    if (explicitKeywords.test(t)) return true;
    if (taskText.length > 600) return true;
    const criticalDecision = /\b(suppress|delete|effac|paiement|payer|valid|critique)\b/i;
    if (criticalDecision.test(t) && taskText.length > 100) return true;
    return false;
  }

  /**
   * Crew par défaut (utilisé par tool IA `crew_experts` + orchestre d'IA).
   * v13.4.364 (Kevin « Utilise toutes les IA dispo ») : construit depuis TOUS
   * les providers réellement disponibles, plus une liste figée de 3-4.
   */
  defaultMembers(mode: CrewMode = 'specialized'): CrewMember[] {
    const avail = this.availableProviders();
    if (mode === 'specialized') {
      const roles = ['security', 'code-quality', 'perf', 'ux', 'reasoning', 'creativity', 'edge-cases'];
      return avail.map((provider, i) => ({ provider, expertise: roles[i % roles.length]! }));
    }
    return avail.map((provider) => ({ provider }));
  }
}

export const crewExperts = new CrewExpertsService();
