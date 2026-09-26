/**
 * APEX v13 — Business Pro Module (Outils entreprise expert).
 *
 * Module dédié aux outils business niveau startup-CFO :
 * - KPI dashboard (CA, marge, ROI, ROAS, LTV, CAC, NPS, churn)
 * - Calculs : ROI, BEP, VAN, TRI, payback, gross margin, marge nette
 * - Analyses : SWOT, BCG matrix, PESTEL, Porter 5 forces
 * - Business plan templates (30 sections)
 * - Cash flow forecast 12-24 mois
 * - Pricing strategies (cost-plus, value-based, penetration, skimming, dynamic)
 * - Funnel marketing AARRR (acquisition, activation, retention, referral, revenue)
 * - Templates pitch deck investisseurs (12 slides)
 * - Cap table simulator
 * - OKR tracker
 *
 * Sources autoritaires : Bessemer, Lean Startup, Y Combinator, INSEAD, HBS.
 */

import { escapeHtml } from '../../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../../core/logger.js';
import { store } from '../../../../core/store.js';
import { guardFeatureEnabled } from '../../../../services/auth/feature-guard.js';

export interface KpiDef {
  id: string;
  label: string;
  emoji: string;
  formula: string;
  unit: string;
  category: 'finance' | 'sales' | 'marketing' | 'product' | 'hr' | 'ops';
  benchmark?: string;
}

export interface BusinessPlanSection {
  id: string;
  label: string;
  emoji: string;
  description: string;
  template: string;
  required: boolean;
}

export interface PricingStrategy {
  id: string;
  label: string;
  description: string;
  pros: readonly string[];
  cons: readonly string[];
  bestFor: readonly string[];
}

export interface CashFlowMonth {
  month: number;
  revenue: number;
  expenses: number;
  net: number;
  cumulative: number;
}

/* ---------- 30+ KPIs ---------- */

export const KPIS: readonly KpiDef[] = [
  /* Finance (10) */
  { id: 'ca', label: 'Chiffre d\'affaires', emoji: '💰', formula: 'Ventes brutes', unit: '€', category: 'finance', benchmark: 'Croissance YoY > 30% pour startup' },
  { id: 'marge_brute', label: 'Marge brute', emoji: '📊', formula: '(CA - Coût des biens vendus) / CA × 100', unit: '%', category: 'finance', benchmark: 'SaaS > 70%, e-commerce > 40%' },
  { id: 'marge_nette', label: 'Marge nette', emoji: '💵', formula: 'Bénéfice net / CA × 100', unit: '%', category: 'finance', benchmark: 'Cible > 15%' },
  { id: 'ebitda', label: 'EBITDA', emoji: '📈', formula: 'Résultat avant intérêts, impôts, amort.', unit: '€', category: 'finance' },
  { id: 'roi', label: 'ROI', emoji: '🎯', formula: '(Gain - Coût) / Coût × 100', unit: '%', category: 'finance', benchmark: '> 20% bon' },
  { id: 'van', label: 'VAN', emoji: '🧮', formula: 'Σ Cash flow / (1+r)^t - Investissement', unit: '€', category: 'finance' },
  { id: 'tri', label: 'TRI', emoji: '⚙️', formula: 'Taux où VAN = 0', unit: '%', category: 'finance', benchmark: '> coût capital' },
  { id: 'bep', label: 'Point mort', emoji: '⚖️', formula: 'CF / (PV - CV unitaires)', unit: 'unités', category: 'finance' },
  { id: 'cash_runway', label: 'Cash runway', emoji: '🛬', formula: 'Trésorerie / Burn mensuel', unit: 'mois', category: 'finance', benchmark: '> 12 mois confortable' },
  { id: 'burn_rate', label: 'Burn rate', emoji: '🔥', formula: 'Sortie de trésorerie mensuelle', unit: '€/mois', category: 'finance' },
  /* Sales (5) */
  { id: 'mrr', label: 'MRR', emoji: '🔁', formula: 'Σ Abonnements mensuels récurrents', unit: '€/mois', category: 'sales', benchmark: 'SaaS : croissance MoM > 10%' },
  { id: 'arr', label: 'ARR', emoji: '🔄', formula: 'MRR × 12', unit: '€/an', category: 'sales' },
  { id: 'arpu', label: 'ARPU', emoji: '👤', formula: 'CA / Nombre d\'utilisateurs actifs', unit: '€/user', category: 'sales' },
  { id: 'pipeline_value', label: 'Pipeline', emoji: '📋', formula: 'Σ deals × probabilité', unit: '€', category: 'sales' },
  { id: 'win_rate', label: 'Win rate', emoji: '🏆', formula: 'Deals gagnés / Deals total × 100', unit: '%', category: 'sales', benchmark: 'B2B SaaS > 20%' },
  /* Marketing (8) */
  { id: 'cac', label: 'CAC', emoji: '💸', formula: 'Coût marketing / Nb nouveaux clients', unit: '€', category: 'marketing', benchmark: 'CAC < LTV/3' },
  { id: 'ltv', label: 'LTV', emoji: '💎', formula: 'ARPU × 1/churn × marge', unit: '€', category: 'marketing' },
  { id: 'ltv_cac', label: 'LTV:CAC', emoji: '⚖️', formula: 'LTV / CAC', unit: 'x', category: 'marketing', benchmark: '> 3x sain' },
  { id: 'roas', label: 'ROAS', emoji: '📣', formula: 'Revenue / Ad spend', unit: 'x', category: 'marketing', benchmark: '> 4x bon' },
  { id: 'cpa', label: 'CPA', emoji: '💲', formula: 'Coût pub / Conversions', unit: '€', category: 'marketing' },
  { id: 'ctr', label: 'CTR', emoji: '👆', formula: 'Clics / Impressions × 100', unit: '%', category: 'marketing', benchmark: '> 2% bon' },
  { id: 'conversion_rate', label: 'Taux conversion', emoji: '🎯', formula: 'Conversions / Visiteurs × 100', unit: '%', category: 'marketing', benchmark: 'E-com 2-5%' },
  { id: 'mql_to_sql', label: 'MQL → SQL', emoji: '🔄', formula: 'SQL / MQL × 100', unit: '%', category: 'marketing', benchmark: '> 30%' },
  /* Product (4) */
  { id: 'nps', label: 'NPS', emoji: '😊', formula: '% Promoteurs - % Détracteurs', unit: '', category: 'product', benchmark: '> 50 excellent' },
  { id: 'csat', label: 'CSAT', emoji: '⭐', formula: '% notes 4-5 / total', unit: '%', category: 'product', benchmark: '> 80%' },
  { id: 'churn', label: 'Churn', emoji: '📉', formula: 'Clients perdus / Clients début × 100', unit: '%', category: 'product', benchmark: 'SaaS B2B < 5%/mois' },
  { id: 'dau_mau', label: 'DAU/MAU', emoji: '📲', formula: 'Daily / Monthly Active Users', unit: 'ratio', category: 'product', benchmark: '> 0.5 sticky' },
  /* HR / Ops (3) */
  { id: 'employee_turnover', label: 'Turnover', emoji: '🔄', formula: 'Départs / Effectif moyen × 100', unit: '%', category: 'hr', benchmark: '< 10%' },
  { id: 'rev_per_employee', label: 'CA / employé', emoji: '👨‍💼', formula: 'CA / Nb employés', unit: '€', category: 'hr', benchmark: 'SaaS > 200k€' },
  { id: 'oncall_uptime', label: 'Uptime', emoji: '⏱️', formula: 'Temps service OK / temps total × 100', unit: '%', category: 'ops', benchmark: 'SLA > 99.9%' },
] as const;

/* ---------- Business Plan templates (30 sections) ---------- */

export const BUSINESS_PLAN_SECTIONS: readonly BusinessPlanSection[] = [
  { id: 'executive_summary', label: 'Executive Summary', emoji: '📑', description: 'Synthèse 1 page', template: '## Executive Summary\n\n**Mission** : ...\n**Vision** : ...\n**Marché cible** : ...\n**Proposition de valeur** : ...\n**Modèle économique** : ...\n**Demande de financement** : ...', required: true },
  { id: 'company_description', label: 'Description entreprise', emoji: '🏢', description: 'Histoire, structure, équipe', template: '## Notre entreprise\n\n**Nom** : ...\n**Forme juridique** : ...\n**Date de création** : ...\n**Localisation** : ...\n**Équipe fondatrice** : ...', required: true },
  { id: 'market_analysis', label: 'Analyse marché', emoji: '📊', description: 'TAM/SAM/SOM, tendances', template: '## Marché\n\n**TAM** (Total Addressable) : ...\n**SAM** (Serviceable Available) : ...\n**SOM** (Serviceable Obtainable) : ...\n**Tendances** : ...', required: true },
  { id: 'competitor_analysis', label: 'Analyse concurrence', emoji: '🥊', description: 'Concurrents directs/indirects', template: '## Concurrence\n\n| Concurrent | Forces | Faiblesses | Différenciation |\n|---|---|---|---|\n| ... | ... | ... | ... |', required: true },
  { id: 'products_services', label: 'Produits / Services', emoji: '📦', description: 'Description offre', template: '## Notre offre\n\n**Produit principal** : ...\n**Caractéristiques** : ...\n**Bénéfices client** : ...\n**Roadmap features** : ...', required: true },
  { id: 'marketing_strategy', label: 'Stratégie marketing', emoji: '📣', description: '4P, mix marketing', template: '## Marketing\n\n**Produit** : ...\n**Prix** : ...\n**Promotion** : ...\n**Distribution** : ...', required: true },
  { id: 'sales_strategy', label: 'Stratégie commerciale', emoji: '💼', description: 'Funnel, équipe sales', template: '## Stratégie commerciale\n\n**Funnel** : Lead → MQL → SQL → Deal\n**Cycle de vente** : ...\n**Canaux** : ...', required: true },
  { id: 'business_model', label: 'Modèle économique', emoji: '🔁', description: 'Revenus, coûts', template: '## Business model\n\n**Sources de revenus** : ...\n**Structure de coûts** : ...\n**Marges** : ...', required: true },
  { id: 'operations_plan', label: 'Plan opérationnel', emoji: '⚙️', description: 'Production, supply chain', template: '## Opérations\n\n**Process** : ...\n**Fournisseurs** : ...\n**Logistique** : ...', required: true },
  { id: 'team_management', label: 'Équipe & Management', emoji: '👥', description: 'Org chart, embauches', template: '## Équipe\n\n**Fondateurs** : ...\n**CEO/CTO/CMO/CFO** : ...\n**Embauches prévues** : ...', required: true },
  { id: 'financial_projections', label: 'Projections financières', emoji: '📈', description: 'P&L 3 ans', template: '## Financier\n\n**Année 1** : CA ... €, marge ...\n**Année 2** : CA ... €, marge ...\n**Année 3** : CA ... €, marge ...', required: true },
  { id: 'funding_request', label: 'Demande de financement', emoji: '💰', description: 'Tour, valuation, use of funds', template: '## Financement\n\n**Montant demandé** : ...\n**Type de tour** : Seed / Series A / B\n**Valuation pré-money** : ...\n**Use of funds** : ...', required: true },
  { id: 'risk_analysis', label: 'Analyse risques', emoji: '⚠️', description: 'Risques + mitigation', template: '## Risques\n\n| Risque | Probabilité | Impact | Mitigation |\n|---|---|---|---|', required: true },
  { id: 'milestones', label: 'Milestones', emoji: '🎯', description: 'Étapes clés 12-24 mois', template: '## Roadmap\n\n**M1** : ...\n**M3** : ...\n**M6** : ...\n**M12** : ...\n**M24** : ...', required: true },
  { id: 'exit_strategy', label: 'Stratégie de sortie', emoji: '🚪', description: 'IPO, M&A, dividendes', template: '## Exit\n\n**Horizon** : 5-7 ans\n**Type** : ...\n**Acquéreurs potentiels** : ...', required: false },
  { id: 'kpi_dashboard', label: 'Dashboard KPI', emoji: '📊', description: 'KPIs principaux à suivre', template: '## KPIs\n\n- MRR / ARR\n- CAC / LTV / Ratio\n- Churn\n- NPS', required: false },
  { id: 'tech_stack', label: 'Stack technique', emoji: '💻', description: 'Tech utilisée', template: '## Tech\n\n**Frontend** : ...\n**Backend** : ...\n**DevOps** : ...', required: false },
  { id: 'partnerships', label: 'Partenariats', emoji: '🤝', description: 'Alliances stratégiques', template: '## Partenariats\n\n**Distributeurs** : ...\n**Tech partners** : ...\n**Fournisseurs clés** : ...', required: false },
  { id: 'legal', label: 'Aspects juridiques', emoji: '⚖️', description: 'Brevets, licences', template: '## Juridique\n\n**Statut** : ...\n**Brevets** : ...\n**Licences** : ...\n**RGPD** : ...', required: false },
  { id: 'esg', label: 'ESG / Impact', emoji: '🌍', description: 'Environnement, social, gouvernance', template: '## Impact ESG\n\n**Environnement** : ...\n**Social** : ...\n**Gouvernance** : ...', required: false },
  { id: 'unit_economics', label: 'Unit Economics', emoji: '💲', description: 'Profitabilité par unité', template: '## Unit economics\n\nCAC : ...\nLTV : ...\nPayback : ...\nGross margin : ...', required: false },
  { id: 'go_to_market', label: 'Go-to-Market', emoji: '🚀', description: 'Stratégie de lancement', template: '## GTM\n\n**Phase 1 (M0-M3)** : ...\n**Phase 2 (M3-M6)** : ...', required: false },
  { id: 'pricing', label: 'Pricing', emoji: '💲', description: 'Stratégie de prix', template: '## Pricing\n\n**Stratégie** : ...\n**Plans** : Free / Pro / Enterprise', required: false },
  { id: 'cap_table', label: 'Cap Table', emoji: '📑', description: 'Répartition du capital', template: '## Cap table\n\n| Actionnaire | % | Type |\n|---|---|---|', required: false },
  { id: 'okrs', label: 'OKRs', emoji: '🎯', description: 'Objectifs annuels', template: '## OKRs Q1\n\n**O1** : ...\n  - KR1 : ...\n  - KR2 : ...', required: false },
  { id: 'glossary', label: 'Glossaire', emoji: '📚', description: 'Termes techniques', template: '## Glossaire\n\n- **TAM** : Total Addressable Market\n- **MRR** : Monthly Recurring Revenue', required: false },
  { id: 'appendix', label: 'Annexes', emoji: '📎', description: 'Tableaux détaillés, lettres', template: '## Annexes\n\n- Lettre intention\n- Détail P&L\n- Étude de marché', required: false },
  { id: 'customer_personas', label: 'Personas clients', emoji: '👤', description: 'Buyers personas', template: '## Persona 1\n\n**Nom** : ...\n**Âge** : ...\n**Job** : ...\n**Pain points** : ...', required: false },
  { id: 'value_proposition', label: 'Proposition de valeur', emoji: '🎁', description: 'Value Proposition Canvas', template: '## VP Canvas\n\n**Customer jobs** : ...\n**Pains** : ...\n**Gains** : ...\n**Products & services** : ...\n**Pain relievers** : ...\n**Gain creators** : ...', required: false },
  { id: 'lean_canvas', label: 'Lean Canvas', emoji: '🧩', description: 'Lean Canvas Ash Maurya', template: '## Lean Canvas\n\n1. Problem | 2. Solution | 3. UVP | 4. Unfair Advantage | 5. Customer Segments | 6. Key Metrics | 7. Channels | 8. Cost Structure | 9. Revenue Streams', required: false },
] as const;

/* ---------- Pricing Strategies ---------- */

export const PRICING_STRATEGIES: readonly PricingStrategy[] = [
  { id: 'cost_plus', label: 'Cost-Plus', description: 'Coût + marge fixe (% sur coût)', pros: ['Simple', 'Couvre coûts'], cons: ['Ignore valeur client', 'Non compétitif'], bestFor: ['Industrie', 'Distribution'] },
  { id: 'value_based', label: 'Value-Based', description: 'Prix selon valeur perçue par le client', pros: ['Marges fortes', 'Aligné valeur'], cons: ['Complexe à mesurer', 'Difficile au début'], bestFor: ['SaaS', 'Conseil', 'Produits premium'] },
  { id: 'penetration', label: 'Penetration', description: 'Prix bas pour capter rapidement le marché', pros: ['Acquisition rapide', 'Effet réseau'], cons: ['Marges faibles', 'Image low-cost'], bestFor: ['Marketplaces', 'Plateformes'] },
  { id: 'skimming', label: 'Skimming', description: 'Prix élevé au lancement puis baisse progressive', pros: ['Marges max', 'Cibler early adopters'], cons: ['Vol vague de prix', 'Concurrence stimulée'], bestFor: ['Tech innovation', 'Luxe'] },
  { id: 'freemium', label: 'Freemium', description: 'Gratuit + tier payant pour features avancées', pros: ['Grosse base utilisateurs', 'Word-of-mouth'], cons: ['Conversion < 5%', 'Coût servir gratuit'], bestFor: ['Apps', 'SaaS B2C'] },
  { id: 'subscription', label: 'Subscription', description: 'Abonnement mensuel/annuel récurrent', pros: ['Revenus prévisibles', 'LTV élevé'], cons: ['Churn à gérer', 'Acquisition continue'], bestFor: ['SaaS', 'Médias'] },
  { id: 'pay_per_use', label: 'Pay-per-Use', description: 'Paiement à l\'usage (consommation)', pros: ['Aligné valeur', 'Faible barrière entrée'], cons: ['Revenus volatils', 'Anti-power-user'], bestFor: ['Cloud', 'API'] },
  { id: 'tiered', label: 'Tiered', description: 'Plusieurs paliers (Bronze/Silver/Gold)', pros: ['Captures segments variés', 'Upsell facile'], cons: ['Complexité', 'Choice paralysis'], bestFor: ['SaaS', 'Services'] },
  { id: 'dynamic', label: 'Dynamic', description: 'Prix variant selon demande/temps', pros: ['Optimisation revenus', 'Yield management'], cons: ['Confusion clients', 'Complexité tech'], bestFor: ['Hôtellerie', 'Aviation', 'Uber'] },
  { id: 'bundling', label: 'Bundling', description: 'Pack de plusieurs produits à prix combiné', pros: ['Augmente panier', 'Cross-sell'], cons: ['Cannibalisation', 'Réduction marges sur composants'], bestFor: ['Software suites', 'Telecom'] },
] as const;

/* ---------- Pure helpers ---------- */

export function calcRoi(gain: number, cost: number): number {
  if (cost <= 0) return 0;
  return Math.round(((gain - cost) / cost) * 100 * 100) / 100;
}

export function calcBep(fixedCosts: number, pricePerUnit: number, variableCostPerUnit: number): number {
  const margin = pricePerUnit - variableCostPerUnit;
  if (margin <= 0) return Infinity;
  return Math.ceil(fixedCosts / margin);
}

export function calcLtv(arpu: number, monthlyChurn: number, grossMargin = 0.8): number {
  if (monthlyChurn <= 0) return Infinity;
  return Math.round((arpu / monthlyChurn) * grossMargin * 100) / 100;
}

export function calcLtvCacRatio(ltv: number, cac: number): number {
  if (cac <= 0) return 0;
  return Math.round((ltv / cac) * 100) / 100;
}

export function calcCashRunway(treasuryEur: number, monthlyBurnEur: number): number {
  if (monthlyBurnEur <= 0) return Infinity;
  return Math.round((treasuryEur / monthlyBurnEur) * 10) / 10;
}

export function calcVan(cashFlows: readonly number[], discountRate: number, initialInvestment: number): number {
  let van = -initialInvestment;
  for (let t = 0; t < cashFlows.length; t++) {
    const cf = cashFlows[t];
    if (cf !== undefined) van += cf / Math.pow(1 + discountRate, t + 1);
  }
  return Math.round(van * 100) / 100;
}

export function calcMargeBrute(ca: number, cogs: number): number {
  if (ca <= 0) return 0;
  return Math.round(((ca - cogs) / ca) * 100 * 100) / 100;
}

export function calcCac(marketingCost: number, newCustomers: number): number {
  if (newCustomers <= 0) return 0;
  return Math.round((marketingCost / newCustomers) * 100) / 100;
}

export function calcChurn(customersLost: number, customersStart: number): number {
  if (customersStart <= 0) return 0;
  return Math.round((customersLost / customersStart) * 100 * 100) / 100;
}

export function calcArpu(revenue: number, activeUsers: number): number {
  if (activeUsers <= 0) return 0;
  return Math.round((revenue / activeUsers) * 100) / 100;
}

export function calcMrrToArr(mrr: number): number {
  return mrr * 12;
}

export function generateCashFlowForecast(
  startTreasury: number,
  monthlyRevenue: number,
  monthlyExpenses: number,
  growthRate: number,
  months: number,
): CashFlowMonth[] {
  const result: CashFlowMonth[] = [];
  let cumulative = startTreasury;
  for (let m = 1; m <= months; m++) {
    const revenue = Math.round(monthlyRevenue * Math.pow(1 + growthRate, m - 1));
    const expenses = monthlyExpenses;
    const net = revenue - expenses;
    cumulative += net;
    result.push({ month: m, revenue, expenses, net, cumulative });
  }
  return result;
}

export function findKpi(id: string): KpiDef | undefined {
  return KPIS.find((k) => k.id === id);
}

export function kpisByCategory(category: KpiDef['category']): readonly KpiDef[] {
  return KPIS.filter((k) => k.category === category);
}

export function findPlanSection(id: string): BusinessPlanSection | undefined {
  return BUSINESS_PLAN_SECTIONS.find((s) => s.id === id);
}

export function findPricingStrategy(id: string): PricingStrategy | undefined {
  return PRICING_STRATEGIES.find((p) => p.id === id);
}

/* ---------- SWOT / BCG analyzers ---------- */

export interface SwotMatrix {
  strengths: readonly string[];
  weaknesses: readonly string[];
  opportunities: readonly string[];
  threats: readonly string[];
}

export function emptySwot(): SwotMatrix {
  return { strengths: [], weaknesses: [], opportunities: [], threats: [] };
}

export interface BcgItem {
  name: string;
  marketShare: number;  /* % */
  marketGrowth: number; /* % */
}

export type BcgQuadrant = 'star' | 'cash_cow' | 'question_mark' | 'dog';

export function classifyBcg(item: BcgItem, shareThreshold = 10, growthThreshold = 10): BcgQuadrant {
  const highShare = item.marketShare >= shareThreshold;
  const highGrowth = item.marketGrowth >= growthThreshold;
  if (highShare && highGrowth) return 'star';
  if (highShare && !highGrowth) return 'cash_cow';
  if (!highShare && highGrowth) return 'question_mark';
  return 'dog';
}

/* boost v13 — Frameworks analyse strategique additionnels */

export interface PorterForce {
  name: string;
  description: string;
  factors: readonly string[];
  weight: number;
}

/**
 * Porter 5 Forces - analyse competitive.
 */
export const PORTER_FIVE_FORCES: readonly PorterForce[] = [
  { name: 'Concurrence interne', description: 'Intensite de la rivalite entre concurrents existants', factors: ['Nombre concurrents', 'Croissance marche', 'Couts fixes', 'Differenciation', 'Barrieres sortie'], weight: 0.25 },
  { name: 'Menace nouveaux entrants', description: 'Probabilite d\'arrivee de nouveaux concurrents', factors: ['Barrieres entree', 'Economies d\'echelle', 'Capital requis', 'Acces canaux', 'Brevets'], weight: 0.20 },
  { name: 'Pouvoir fournisseurs', description: 'Capacite des fournisseurs a imposer leurs conditions', factors: ['Concentration', 'Cout switching', 'Differenciation input', 'Importance volume'], weight: 0.20 },
  { name: 'Pouvoir clients', description: 'Capacite des clients a negocier', factors: ['Concentration', 'Volume achete', 'Standardisation', 'Cout switching', 'Information'], weight: 0.20 },
  { name: 'Menace substituts', description: 'Produits/services alternatifs', factors: ['Performance relative', 'Cout switching', 'Propension a substituer'], weight: 0.15 },
];

/**
 * PESTEL - analyse macro-environnement.
 */
export const PESTEL_FACTORS = {
  political: ['Politique fiscale', 'Stabilite gouvernementale', 'Reglementations sectorielles', 'Politique commerce international', 'Subventions'],
  economic: ['Taux interet', 'Inflation', 'Taux change', 'Croissance PIB', 'Pouvoir achat', 'Chomage'],
  social: ['Demographie', 'Culture', 'Education', 'Tendances consommation', 'Sante', 'Inegalites'],
  technological: ['R&D', 'Automation', 'Brevets', 'Internet/Mobile', 'IA/Big Data', 'Cybersecurite'],
  environmental: ['Climat', 'Recyclage', 'Energie verte', 'Normes ESG', 'Biodiversite', 'Empreinte carbone'],
  legal: ['Droit travail', 'Concurrence', 'Consommation', 'Sante securite', 'Discrimination', 'RGPD/CCPA'],
} as const;

/**
 * 4P Marketing Mix.
 */
export const MARKETING_4P = {
  product: { questions: ['Quels besoins satisfaits ?', 'Caracteristiques cles ?', 'Differenciation ?', 'Marque ?', 'SAV ?'] },
  price: { questions: ['Strategie pricing ?', 'Positionnement ?', 'Remises ?', 'Conditions paiement ?', 'Elasticite ?'] },
  place: { questions: ['Canaux distribution ?', 'Couverture geo ?', 'Inventaire ?', 'Logistique ?', 'Online/offline ?'] },
  promotion: { questions: ['Pub ?', 'Promotions ?', 'PR ?', 'Marketing direct ?', 'Sales force ?', 'Digital ?'] },
} as const;

/**
 * 7P Marketing Mix (extension services).
 */
export const MARKETING_7P_EXTENSION = {
  people: { description: 'Personnes : equipe, employes, clients, formation, culture' },
  process: { description: 'Process : workflow, qualite, standards, customer journey' },
  physical_evidence: { description: 'Evidence : tangibles, locaux, packaging, witnesses' },
} as const;

/**
 * BMC Business Model Canvas (9 blocs Osterwalder).
 */
export const BMC_BLOCKS = {
  customer_segments: 'Pour qui ? Personas, archetypes, niches',
  value_propositions: 'Quelle valeur unique ? Pourquoi nous ?',
  channels: 'Comment atteindre ? Awareness/eval/achat/livraison/SAV',
  customer_relationships: 'Quel type de relation ? Self/Personal/Community',
  revenue_streams: 'Comment monetiser ? One-shot/recurring/usage',
  key_resources: 'Ressources critiques : humaines, financieres, IP, physiques',
  key_activities: 'Activites critiques : production, vente, plateformes',
  key_partnerships: 'Partenaires : alliances, joint-venture, fournisseurs',
  cost_structure: 'Couts principaux : fixes, variables, economies echelle',
} as const;

/**
 * OKR template avec format exemplaire.
 */
export const OKR_TEMPLATE = {
  exemple_o: 'Devenir leader marche francais e-commerce mode',
  exemple_kr: [
    'Atteindre 100k DAU (vs 30k actuels) - mesurable',
    'CA mensuel >500k EUR (vs 200k) - mesurable',
    'NPS >50 (vs 35 actuel) - mesurable',
  ],
  best_practices: [
    'Objectif inspirant et qualitatif',
    '3-5 KR maximum par O',
    'KR mesurable, datable, ambitieux (60-70% atteint = succes)',
    'Cadence trimestrielle',
    'Public et transparent',
  ],
};

/**
 * Templates pitch deck investisseurs (12 slides Y Combinator format).
 */
export const PITCH_DECK_SLIDES = [
  { num: 1, title: 'Mission/Tagline', content: '1 phrase qui resume mission' },
  { num: 2, title: 'Probleme', content: 'Pain point concret + impact financier' },
  { num: 3, title: 'Solution', content: 'Comment on resout + USP' },
  { num: 4, title: 'Marche', content: 'TAM/SAM/SOM avec sources' },
  { num: 5, title: 'Business Model', content: 'Comment on gagne argent + unit economics' },
  { num: 6, title: 'Traction', content: 'Metrics croissance: users, revenue, retention' },
  { num: 7, title: 'Concurrence', content: 'Comparison matrix + differentiateur' },
  { num: 8, title: 'Roadmap', content: 'Etapes 12-24 mois' },
  { num: 9, title: 'Equipe', content: 'Photos + experience + complementarite' },
  { num: 10, title: 'Financiers', content: 'P&L 3 ans + projections' },
  { num: 11, title: 'Tour table', content: 'Montant + valuation + use of funds' },
  { num: 12, title: 'Contact', content: 'Email + phone + site' },
] as const;

/* ---------- UI render ---------- */

export function render(root: HTMLElement): void {
  logger.info('pro-business', 'render');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('pro.business', root, uid)) return;
  const html = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">💼 Business Pro</h2>
      <p class="ax-gs-417">${KPIS.length} KPIs · ${BUSINESS_PLAN_SECTIONS.length} sections business plan · ${PRICING_STRATEGIES.length} stratégies pricing · SWOT/BCG.</p>
      <h3 class="ax-gs-418">KPIs Finance</h3>
      <ul class="ax-gs-419">
        ${kpisByCategory('finance').slice(0, 8).map((k) => `<li>${k.emoji} <strong>${escapeHtml(k.label)}</strong> — ${escapeHtml(k.formula)}</li>`).join('')}
      </ul>
      <h3 class="ax-gs-420">KPIs Marketing</h3>
      <ul class="ax-gs-419">
        ${kpisByCategory('marketing').slice(0, 6).map((k) => `<li>${k.emoji} <strong>${escapeHtml(k.label)}</strong> — ${escapeHtml(k.benchmark ?? k.formula)}</li>`).join('')}
      </ul>
      <h3 class="ax-gs-420">Pricing Strategies</h3>
      <ul class="ax-gs-419">
        ${PRICING_STRATEGIES.slice(0, 6).map((p) => `<li><strong>${escapeHtml(p.label)}</strong> — ${escapeHtml(p.description)}</li>`).join('')}
      </ul>
    </div>
  `;
  root.innerHTML = html;
}
