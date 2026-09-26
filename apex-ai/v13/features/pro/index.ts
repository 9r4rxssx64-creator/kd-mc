/**
 * APEX v13 — Pro Modules Hub (8 modules expert).
 *
 * Demande Kevin : 8 modules pro (cuisine, médical, finance, légal, traducteur,
 * business, éducation, certifications) — niveau EXPERT (CLAUDE.md règle).
 *
 * Architecture :
 * - Catalog typé avec sources autoritaires (Légifrance, Vidal, ANSM, etc.)
 * - Render dispatcher centralisé
 * - Lazy load par module
 * - Wiring smart-tools-suggester pour intent detection
 *
 * Anti-théâtre :
 * - Sources OFFICIELLES citées
 * - Pas d'invention de données
 * - Mention prudence pour conseils sensibles (médical, juridique, fiscal)
 */

import { escapeAttr, escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';

export type ProModuleId =
  | 'cuisine' | 'medical' | 'finance' | 'legal'
  | 'translator' | 'business' | 'education' | 'certifications';

export interface ProModuleDef {
  id: ProModuleId;
  emoji: string;
  label: string;
  description: string;
  capabilities: readonly string[];
  intent_keywords: readonly string[];
  sources_autoritaires: readonly string[];
  prudence_disclaimer: boolean;
  premium: boolean;
}

export const PRO_MODULES: readonly ProModuleDef[] = [
  {
    id: 'cuisine',
    emoji: '🍳',
    label: 'Cuisine Pro',
    description: '10+ recettes, 22 cuissons, 14 allergènes INCO, calories',
    capabilities: ['recettes', 'cuissons', 'allergenes_inco', 'calories', 'conversions'],
    intent_keywords: ['recette', 'cuisson', 'ingrédient', 'cuisine', 'allergène', 'calorie'],
    sources_autoritaires: ['Règlement INCO 1169/2011', 'ANSES', 'CIQUAL'],
    prudence_disclaimer: false,
    premium: false,
  },
  {
    id: 'medical',
    emoji: '💊',
    label: 'Medical Pro',
    description: 'Vidal OTC, IMC, métabolisme, urgences SAMU',
    capabilities: ['vidal_otc', 'imc', 'metabolisme', 'urgences', 'vaccins'],
    intent_keywords: ['médical', 'vidal', 'posologie', 'symptôme', 'maladie', 'imc'],
    sources_autoritaires: ['Vidal', 'ANSM', 'Has-sante', 'Ameli'],
    prudence_disclaimer: true,
    premium: true,
  },
  {
    id: 'finance',
    emoji: '💰',
    label: 'Finance Pro',
    description: 'IR FR 2026, PFU 30%, plus-values immo, crédit immo, Monaco fiscal',
    capabilities: ['ir_fr', 'pfu', 'pv_immo', 'pv_mobilier', 'credit_immo', 'monaco_fiscal'],
    intent_keywords: ['impôt', 'IR', 'crédit', 'IBAN', 'paiement', 'fiscalité', 'plus-value'],
    sources_autoritaires: ['Impôts.gouv', 'Service-public.fr', 'Légimonaco'],
    prudence_disclaimer: true,
    premium: true,
  },
  {
    id: 'legal',
    emoji: '⚖️',
    label: 'Legal Pro',
    description: '18+ codes français + jurisprudence Cassation/CE/CJUE/CEDH + Monaco',
    capabilities: ['codes_fr', 'jurisprudence', 'monaco', 'calculs_indem', 'prescription'],
    intent_keywords: ['loi', 'article', 'tribunal', 'code', 'préfecture', 'juridique', 'légal'],
    sources_autoritaires: ['Légifrance', 'Légimonaco', 'Curia', 'CEDH', 'Cassation', 'Conseil d\'État'],
    prudence_disclaimer: true,
    premium: true,
  },
  {
    id: 'translator',
    emoji: '🌐',
    label: 'Translator Pro',
    description: '30+ langues + mode interprète temps réel',
    capabilities: ['translate', 'interprete_live', 'detect_lang', 'tts', 'stt'],
    intent_keywords: ['traduire', 'translate', 'anglais', 'italien', 'allemand', 'espagnol', 'interprète'],
    sources_autoritaires: ['DeepL', 'Google Translate'],
    prudence_disclaimer: false,
    premium: true,
  },
  {
    id: 'business',
    emoji: '💼',
    label: 'Business Pro',
    description: 'Plan de business, KPIs, MRR, churn analysis',
    capabilities: ['business_plan', 'kpis', 'mrr', 'churn', 'cac_ltv'],
    intent_keywords: ['business plan', 'kpi', 'mrr', 'churn', 'startup', 'entreprise'],
    sources_autoritaires: ['Bpifrance', 'INSEE'],
    prudence_disclaimer: false,
    premium: true,
  },
  {
    id: 'education',
    emoji: '🎓',
    label: 'Éducation Pro',
    description: 'Programmes scolaires FR, méthodes pédagogiques, exercices',
    capabilities: ['programmes', 'methodes', 'exercices', 'corrections', 'evaluation'],
    intent_keywords: ['école', 'programme scolaire', 'éducation', 'pédagogie', 'apprendre'],
    sources_autoritaires: ['Eduscol', 'Éducation Nationale'],
    prudence_disclaimer: false,
    premium: false,
  },
  {
    id: 'certifications',
    emoji: '📜',
    label: 'Certifications Pro',
    description: 'Préparation certifs (PMP, AWS, Google Cloud, ISTQB, etc.)',
    capabilities: ['quiz', 'mock_exam', 'flashcards', 'planning_revision'],
    intent_keywords: ['certification', 'pmp', 'aws', 'google cloud', 'examen', 'quiz'],
    sources_autoritaires: ['PMI.org', 'AWS Training', 'Google Cloud Skills Boost'],
    prudence_disclaimer: false,
    premium: true,
  },
] as const;

class ProModulesHub {
  list(): readonly ProModuleDef[] {
    return PRO_MODULES;
  }

  byId(id: ProModuleId): ProModuleDef | undefined {
    return PRO_MODULES.find((m) => m.id === id);
  }

  matchIntent(text: string): ProModuleDef | null {
    const lc = text.toLowerCase();
    let best: { mod: ProModuleDef; score: number } | null = null;
    for (const m of PRO_MODULES) {
      let score = 0;
      for (const kw of m.intent_keywords) {
        if (lc.includes(kw)) score++;
      }
      if (score > 0 && (!best || score > best.score)) best = { mod: m, score };
    }
    return best?.mod ?? null;
  }

  filterByPremium(premium: boolean): readonly ProModuleDef[] {
    return PRO_MODULES.filter((m) => m.premium === premium);
  }

  /**
   * Render module : délègue vers l'implémentation v13 si disponible (cuisine,
   * medical, finance, legal, translator), sinon UI minimaliste avec disclaimer.
   */
  async render(id: ProModuleId, root: HTMLElement): Promise<void> {
    const def = this.byId(id);
    if (!def) {
      logger.warn('pro-modules', `Unknown module: ${id}`);
      return;
    }
    /* Délégation vers modules v13 portés depuis v12 (Kevin sprint 2026-05-04). */
    try {
      switch (id) {
        case 'cuisine': {
          const mod = await import('./modules/cuisine/index.js');
          mod.render(root);
          return;
        }
        case 'medical': {
          const mod = await import('./modules/medical/index.js');
          mod.render(root);
          return;
        }
        case 'finance': {
          const mod = await import('./modules/finance/index.js');
          mod.render(root);
          return;
        }
        case 'legal': {
          const mod = await import('./modules/legal/index.js');
          mod.render(root);
          return;
        }
        case 'translator': {
          const mod = await import('./modules/translator/index.js');
          mod.render(root);
          return;
        }
        case 'business': {
          const mod = await import('./modules/business/index.js');
          mod.render(root);
          return;
        }
        case 'education': {
          const mod = await import('./modules/education/index.js');
          mod.render(root);
          return;
        }
        case 'certifications': {
          const mod = await import('./modules/certifications/index.js');
          mod.render(root);
          return;
        }
        default:
          break;
      }
    } catch (e) {
      logger.error('pro-modules', `module load failed ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const sourcesHtml = def.sources_autoritaires.map((s) => `<span class="ax-source">${escapeHtml(s)}</span>`).join(' ');
    const capsHtml = def.capabilities.map((c) => `<span class="ax-cap">${escapeHtml(c)}</span>`).join(' ');
    const disclaimer = def.prudence_disclaimer
      ? '<p class="ax-disclaimer">⚠️ Information indicative. Pour décision importante, consulter un professionnel qualifié.</p>'
      : '';
    root.innerHTML = `
      <div class="ax-pro-module" data-module="${escapeAttr(def.id)}">
        <header class="ax-pro-head">
          <span class="ax-pro-emoji">${escapeHtml(def.emoji)}</span>
          <h2>${escapeHtml(def.label)}</h2>
          ${def.premium ? '<span class="ax-badge-premium">PRO</span>' : ''}
        </header>
        <p class="ax-pro-desc">${escapeHtml(def.description)}</p>
        <div class="ax-pro-sources">Sources : ${sourcesHtml}</div>
        <div class="ax-pro-caps">${capsHtml}</div>
        ${disclaimer}
        <div class="ax-pro-actions">
          <button class="ax-btn-primary" data-action="open">Ouvrir</button>
        </div>
      </div>
    `;
    logger.info('pro-modules', `rendered ${def.id}`);
  }

  getStats(): { total: number; free: number; premium: number; with_disclaimer: number } {
    return {
      total: PRO_MODULES.length,
      free: PRO_MODULES.filter((m) => !m.premium).length,
      premium: PRO_MODULES.filter((m) => m.premium).length,
      with_disclaimer: PRO_MODULES.filter((m) => m.prudence_disclaimer).length,
    };
  }
}

export const proModulesHub = new ProModulesHub();

/**
 * Render router-compatible : affiche grille modules pro par défaut.
 */
export function render(root: HTMLElement): void {
  const cards = PRO_MODULES.map((m) => `
    <div class="ax-pro-card ax-gs-416" data-module="${m.id}">
      <div class="ax-pro-card-emoji ax-gs-192">${m.emoji}</div>
      <div class="ax-pro-card-label ax-gs-238">${m.label}</div>
      <div class="ax-pro-card-desc ax-gs-239">${m.description}</div>
      <div class="ax-pro-card-sources" style="font-size:11px;color:#888;margin-top:8px">${m.sources_autoritaires.slice(0, 2).join(' · ')}</div>
      ${m.premium ? '<span class="ax-badge-premium" style="background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">PRO</span>' : ''}
      ${m.prudence_disclaimer ? '<span class="ax-badge-warning" style="display:inline-block;margin-left:6px">⚠️</span>' : ''}
    </div>
  `).join('');
  root.innerHTML = `
    <div class="ax-pro-hub ax-gs-376">
      <h1 class="ax-gs-266">💼 Modules Pro Expert</h1>
      <p class="ax-subtitle ax-gs-226">${PRO_MODULES.length} modules avec sources autoritaires</p>
      <div class="ax-pro-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px">${cards}</div>
      <div id="ax-pro-detail" class="ax-gs-218"></div>
      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  /* Wire click sur cards → render module detail */
  root.querySelectorAll<HTMLDivElement>('.ax-pro-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset['module'] as ProModuleId | undefined;
      if (!id) return;
      const detail = root.querySelector<HTMLDivElement>('#ax-pro-detail');
      if (detail) void proModulesHub.render(id, detail);
    });
  });
}
