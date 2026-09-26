/**
 * APEX v13 — SEO AI Visibility / Share of Voice (Kevin 2026-05-30).
 *
 * Remplaçant GRATUIT de Profound (suivi de citations/mentions IA) : utilise le
 * routeur multi-LLM d'Apex (clés déjà présentes : Anthropic/OpenAI/Perplexity/
 * Gemini) au lieu d'un service payant. Pour une liste de requêtes "intention
 * d'achat", on demande à l'IA d'y répondre comme un assistant, puis on mesure si
 * la MARQUE (et ses concurrents) est mentionnée → Share of Voice GEO.
 *
 * GEO 2026 : c'est exactement ce qui compte pour AI Overviews / ChatGPT /
 * Perplexity — "quand un utilisateur pose la question, mon site est-il cité ?".
 *
 * Storage : `apex_v13_seo_aiv_history` (max 30). 100% via clés existantes.
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const HISTORY_KEY = 'apex_v13_seo_aiv_history';
const HISTORY_MAX = 30;

export interface AiVisibilityInput {
  /** Marque / domaine à suivre (ex: "CMCteams" ou "cmcteams.app") */
  brand: string;
  /** Requêtes d'intention (ex: "meilleur logiciel planning casino"). Si vide → générées depuis la marque. */
  queries?: string[];
  /** Concurrents à comparer (optionnel) */
  competitors?: string[];
}

export interface AiVisibilityPerQuery {
  query: string;
  brandMentioned: boolean;
  /** position approximative de la 1re mention (index caractère, -1 si absent) */
  firstMentionAt: number;
  competitorsMentioned: string[];
  answerExcerpt: string;
}

export interface AiVisibilityOutput {
  id: string;
  brand: string;
  ok: boolean;
  /** Share of Voice 0-100 : mentions marque / (marque + concurrents) */
  shareOfVoice: number;
  /** Taux de présence : % de requêtes où la marque apparaît */
  presenceRate: number;
  queriesAnalyzed: number;
  perQuery: AiVisibilityPerQuery[];
  competitors: { name: string; mentions: number }[];
  recommendations: string[];
  engine: string;
  generatedAt: number;
  durationMs: number;
}

class SeoAiVisibilityService {
  async analyze(input: AiVisibilityInput): Promise<AiVisibilityOutput> {
    const start = Date.now();
    const id = `aiv_${start}_${Math.random().toString(36).slice(2, 7)}`;
    const brand = (input.brand || '').trim();
    const competitors = (input.competitors ?? []).map((c) => c.trim()).filter(Boolean);

    if (!brand) {
      return {
        id, brand: '', ok: false, shareOfVoice: 0, presenceRate: 0, queriesAnalyzed: 0,
        perQuery: [], competitors: [], recommendations: ['Fournir une marque/domaine à suivre.'],
        engine: 'none', generatedAt: start, durationMs: Date.now() - start,
      };
    }

    const queries = (input.queries && input.queries.length
      ? input.queries
      : this.defaultQueries(brand)
    ).slice(0, 8);

    const perQuery: AiVisibilityPerQuery[] = [];
    const compCount = new Map<string, number>(competitors.map((c) => [c, 0]));
    let engine = 'unknown';

    for (const query of queries) {
      const { answer, provider } = await this.ask(query);
      engine = provider;
      const lower = answer.toLowerCase();
      const firstMentionAt = this.indexOfTerm(lower, brand.toLowerCase());
      const brandMentioned = firstMentionAt >= 0;
      const competitorsMentioned: string[] = [];
      for (const c of competitors) {
        if (this.indexOfTerm(lower, c.toLowerCase()) >= 0) {
          competitorsMentioned.push(c);
          compCount.set(c, (compCount.get(c) ?? 0) + 1);
        }
      }
      perQuery.push({
        query, brandMentioned, firstMentionAt, competitorsMentioned,
        answerExcerpt: answer.slice(0, 280),
      });
    }

    const brandMentions = perQuery.filter((q) => q.brandMentioned).length;
    const totalCompMentions = Array.from(compCount.values()).reduce((a, b) => a + b, 0);
    const denom = brandMentions + totalCompMentions;
    const shareOfVoice = denom > 0 ? Math.round((brandMentions / denom) * 100) : 0;
    const presenceRate = queries.length ? Math.round((brandMentions / queries.length) * 100) : 0;

    const out: AiVisibilityOutput = {
      id, brand, ok: true, shareOfVoice, presenceRate,
      queriesAnalyzed: queries.length, perQuery,
      competitors: Array.from(compCount.entries()).map(([name, mentions]) => ({ name, mentions })),
      recommendations: this.recommend(presenceRate, shareOfVoice, competitors.length > 0),
      engine, generatedAt: start, durationMs: Date.now() - start,
    };

    this.persist(out);
    void auditLog.record('seo_ai_visibility', { details: { brand, shareOfVoice, presenceRate, queries: queries.length } });
    return out;
  }

  private defaultQueries(brand: string): string[] {
    return [
      `Quelles sont les meilleures solutions comme ${brand} ?`,
      `Quel outil recommandes-tu pour le même usage que ${brand} ?`,
      `Avantages et alternatives à ${brand} ?`,
      `${brand} : est-ce un bon choix ? Cite des options.`,
    ];
  }

  /** Mention "mot entier" approximative (évite les sous-chaînes accidentelles). */
  private indexOfTerm(haystack: string, term: string): number {
    if (!term) return -1;
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
    const m = re.exec(haystack);
    return m ? m.index : -1;
  }

  private async ask(query: string): Promise<{ answer: string; provider: string }> {
    const sys =
      'Tu es un assistant de recommandation. Réponds à la question en citant des ' +
      'solutions/outils/marques concrètes par leur nom, comme le ferait un moteur de ' +
      'réponse IA (AI Overviews/Perplexity). Sois factuel et concis.';
    let collected = '';
    let provider = 'unknown';
    try {
      await aiRouter.stream(
        [{ role: 'user', content: query }],
        sys,
        (chunk) => {
          if (chunk.text) collected += chunk.text;
          if (chunk.provider) provider = chunk.provider;
        },
        (err) => { logger.warn('seo-ai-visibility', 'stream err', { err }); },
      );
    } catch (err: unknown) {
      logger.warn('seo-ai-visibility', 'ask throw', { err });
    }
    return { answer: collected, provider };
  }

  private recommend(presence: number, sov: number, hasCompetitors: boolean): string[] {
    const r: string[] = [];
    if (presence < 50) r.push('Présence IA faible : crée du contenu "réponse directe" (FAQPage, données chiffrées sourcées) pour devenir citable par les moteurs IA.');
    if (presence === 0) r.push('Marque jamais citée : publie des pages d\'autorité (E-E-A-T) + llms.txt + Schema Organization pour entrer dans le corpus des LLM.');
    if (hasCompetitors && sov < 50) r.push('Part de voix IA inférieure aux concurrents : analyse les pages qu\'ils font citer (comparatifs, guides) et produis l\'équivalent en mieux.');
    if (presence >= 50 && sov >= 50) r.push('Bonne visibilité IA : maintiens la fraîcheur du contenu et surveille la dérive (re-mesurer mensuellement).');
    r.push('Re-mesurer chaque mois (Share of Voice IA = métrique GEO clé 2026).');
    return r;
  }

  private persist(out: AiVisibilityOutput): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? (JSON.parse(raw) as AiVisibilityOutput[]) : [];
      list.unshift(out);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (err: unknown) {
      logger.warn('seo-ai-visibility', 'persist failed', { err });
    }
  }

  history(): AiVisibilityOutput[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as AiVisibilityOutput[]) : [];
    } catch {
      return [];
    }
  }
}

export const seoAiVisibility = new SeoAiVisibilityService();
