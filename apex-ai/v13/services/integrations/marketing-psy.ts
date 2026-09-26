/**
 * APEX v13.4.3 — Marketing Psy service (Kevin 2026-05-09 — Shubham Skill #3)
 *
 * Génère des copies marketing avec triggers psychologiques (Cialdini's 7 principes) :
 *  - reciprocity (réciprocité)
 *  - scarcity (rareté)
 *  - authority (autorité)
 *  - consistency (cohérence/engagement)
 *  - liking (sympathie)
 *  - social-proof (preuve sociale)
 *  - unity (unité/identité partagée)
 *
 * Output : { copy, trigger, rationale } — copy = le texte marketing prêt à coller,
 * rationale = explication courte du levier psy.
 *
 * Storage : `apex_v13_marketing_psy_history` (max 30).
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const HISTORY_KEY = 'apex_v13_marketing_psy_history';
const HISTORY_MAX = 30;

export type CialdiniTrigger =
  | 'reciprocity'
  | 'scarcity'
  | 'authority'
  | 'consistency'
  | 'liking'
  | 'social-proof'
  | 'unity';

export interface MarketingSpec {
  product: string;
  audience: string;
  trigger?: CialdiniTrigger;
  /** Format souhaité (ex: tweet, email subject, ad headline, landing CTA) */
  format?: string;
  /** Tone (ex: professionnel, friendly, urgent) */
  tone?: string;
}

export interface MarketingOutput {
  id: string;
  copy: string;
  trigger: CialdiniTrigger;
  rationale: string;
  product: string;
  audience: string;
  format: string;
  tone: string;
  generatedAt: number;
  durationMs: number;
}

const TRIGGER_DESCRIPTIONS: Record<CialdiniTrigger, string> = {
  reciprocity: 'Offre quelque chose en premier (gratuit, samples, trial) pour créer une dette psychologique.',
  scarcity: 'Met en avant la rareté (édition limitée, deadline, stock limité) pour activer FOMO.',
  authority: 'Cite expert / certification / chiffre vérifiable pour transférer la légitimité.',
  consistency: 'Rappelle un engagement antérieur du user (sa valeur, son objectif) pour cohérence interne.',
  liking: 'Crée connexion personnelle (humour, story authentique, similarité avec audience).',
  'social-proof': 'Témoignages clients / nombre d\'utilisateurs / avis pour rassurer via le groupe.',
  unity: 'Active identité partagée ("nous, les créateurs", "entre nous").',
};

class MarketingPsyService {
  /**
   * Génère une copie marketing exploitant un trigger Cialdini.
   */
  async generate(spec: MarketingSpec): Promise<MarketingOutput> {
    const product = (spec.product || '').trim();
    const audience = (spec.audience || '').trim();
    if (!product) throw new Error('Produit requis');
    if (!audience) throw new Error('Audience requise');

    const trigger: CialdiniTrigger = spec.trigger ?? 'social-proof';
    const format = spec.format ?? 'CTA landing';
    const tone = spec.tone ?? 'professionnel';

    const tStart = Date.now();
    const id = `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const triggerDesc = TRIGGER_DESCRIPTIONS[trigger];
    const systemPrompt = `Tu es un expert copywriter marketing avec 15 ans d'expérience.
Tu utilises les 7 principes d'influence de Cialdini de façon ÉTHIQUE (pas manipulation).

Pour chaque demande, tu génères :
1. Une copie concise et percutante (max 280 caractères pour tweet, max 80 pour CTA, etc.)
2. Le trigger psychologique exploité : ${trigger} (${triggerDesc})
3. Une rationale courte (2 phrases) expliquant pourquoi ça marche

Format de retour STRICT JSON :
{
  "copy": "le texte marketing",
  "trigger": "${trigger}",
  "rationale": "explication courte"
}

Règles :
- Pas de superlatifs gratuits ("révolutionnaire", "incroyable")
- Pas de promesses non-tenables
- Privilégie un call-to-action clair
- Adapté au tone "${tone}" et format "${format}"`;

    let collected = '';
    try {
      await aiRouter.stream(
        [{
          role: 'user',
          content: `Produit : ${product}\nAudience : ${audience}\nFormat : ${format}\nTone : ${tone}\nTrigger Cialdini : ${trigger}`,
        }],
        systemPrompt,
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { logger.warn('marketing-psy', 'stream err', { err }); },
      );
    } catch (err: unknown) {
      logger.warn('marketing-psy', 'stream throw', { err });
    }

    let parsed: { copy: string; rationale: string };
    try {
      const m = collected.match(/\{[\s\S]*"copy"[\s\S]*\}/);
      if (!m) throw new Error('JSON manquant');
      const obj = JSON.parse(m[0]) as { copy?: unknown; rationale?: unknown };
      parsed = {
        copy: typeof obj.copy === 'string' ? obj.copy.slice(0, 1000) : '',
        rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 500) : '',
      };
      if (!parsed.copy) throw new Error('copy vide');
    } catch (err: unknown) {
      logger.warn('marketing-psy', 'parse failed, fallback', { err });
      parsed = this.fallbackCopy(product, trigger);
    }

    const output: MarketingOutput = {
      id,
      copy: parsed.copy,
      trigger,
      rationale: parsed.rationale || triggerDesc,
      product,
      audience,
      format,
      tone,
      generatedAt: Date.now(),
      durationMs: Date.now() - tStart,
    };

    this.persist(output);
    void auditLog.record('marketing-psy.generate', {
      details: { id, trigger, product: product.slice(0, 50), durationMs: output.durationMs },
    });
    logger.info('marketing-psy', `Generated copy (${trigger}, ${output.durationMs}ms)`);
    return output;
  }

  /**
   * Liste les outputs persistés.
   */
  history(): MarketingOutput[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as MarketingOutput[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  /**
   * Liste tous les triggers Cialdini disponibles.
   */
  listTriggers(): Array<{ id: CialdiniTrigger; description: string }> {
    return (Object.keys(TRIGGER_DESCRIPTIONS) as CialdiniTrigger[]).map((id) => ({
      id,
      description: TRIGGER_DESCRIPTIONS[id],
    }));
  }

  private fallbackCopy(product: string, trigger: CialdiniTrigger): { copy: string; rationale: string } {
    const fallbackMap: Record<CialdiniTrigger, string> = {
      reciprocity: `Essaie ${product} gratuitement — sans engagement.`,
      scarcity: `${product} : seulement 100 places cette semaine.`,
      authority: `${product}, recommandé par les experts du domaine.`,
      consistency: `Tu cherches X depuis longtemps ? ${product} est l'étape logique.`,
      liking: `On a créé ${product} pour les gens comme toi.`,
      'social-proof': `Rejoins 10 000+ utilisateurs satisfaits de ${product}.`,
      unity: `Entre nous, ${product} change vraiment la donne.`,
    };
    return {
      copy: fallbackMap[trigger],
      rationale: TRIGGER_DESCRIPTIONS[trigger],
    };
  }

  private persist(o: MarketingOutput): void {
    try {
      const hist = this.history();
      hist.unshift(o);
      const capped = hist.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch (err: unknown) {
      logger.warn('marketing-psy', 'persist failed', { err });
    }
  }
}

export const marketingPsy = new MarketingPsyService();
