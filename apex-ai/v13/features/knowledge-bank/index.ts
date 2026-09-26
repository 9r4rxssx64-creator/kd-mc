/**
 * APEX v13 — Vue Knowledge Bank
 *
 * Port v12 vKnowledgeBank : base de connaissances injectée dans system prompt IA.
 *
 * 12 onglets / catégories :
 * - Convention SBM (jeux casino Monaco)
 * - Bulletin codes (codes paie SBM)
 * - Rôles SBM
 * - Vidal OTC (médicaments)
 * - IR 2026 (impôts FR)
 * - Légal KB (codes français)
 * - Recettes pro
 * - Cuissons
 * - Allergènes INCO
 * - Familles CMC (équipes casino)
 * - Venues (salons SBM)
 * - Jeux SBM (8 jeux table)
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Lazy-load lourd : Fuse.js dynamic import si search complexe
 * - JSON statique inline (pas de fetch externe)
 */

import { escapeHtml } from '../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeKbScope: CleanupScope | null = null;

export function dispose(): void {
  activeKbScope?.cleanup();
  activeKbScope = null;
}

export type KbCategoryId =
  | 'convention'
  | 'bulletin_codes'
  | 'roles_sbm'
  | 'vidal_otc'
  | 'ir_2026'
  | 'legal_kb'
  | 'recettes'
  | 'cuissons'
  | 'allergenes'
  | 'familles_cmc'
  | 'venues'
  | 'jeux_sbm';

export interface KbCategory {
  id: KbCategoryId;
  icon: string;
  label: string;
  description: string;
  entries: ReadonlyArray<KbEntry>;
}

export interface KbEntry {
  id: string;
  title: string;
  content: string;
  tags?: ReadonlyArray<string>;
}

/* === KB DATA (subset of v12 KB injected in system prompt IA) === */

const KB_CONVENTION: ReadonlyArray<KbEntry> = [
  { id: 'art4', title: 'Article 4 — Recrutement', content: 'Âge minimum 21 ans pour postuler aux jeux SBM.', tags: ['recrutement'] },
  { id: 'art6', title: 'Article 6 — Contrat', content: 'Contrat initial 12 mois, période d\'essai 3 mois, CDI à 18 mois.', tags: ['contrat'] },
  { id: 'art10', title: 'Article 10 — Carrière', content: 'Niveaux 1-7 selon jeux validés. Niv 7 = Expert tous jeux.', tags: ['carrière'] },
  { id: 'art13', title: 'Article 13 — Rémunération', content: '3 parties : fixe (+200€/niveau) + %CA + %cagnottes. Min garanti 10,85 mois.', tags: ['salaire'] },
  { id: 'art17_4', title: 'Article 17.4 — Congés', content: '2 mois/an : 1 mois été (1 mai-31 oct) + 1 mois hiver, 4 sem consécutives min.', tags: ['congés'] },
  { id: 'art17_8', title: 'Article 17.8 — Pauses', content: '55+ et femmes enceintes : pause toutes 40 min (au lieu de 60).', tags: ['pauses'] },
  { id: 'art18', title: 'Article 18 — Congés familiaux', content: 'Mariage 4j · Naissance 3j · Décès proche 3j · Mariage enfant 2j · Décès beau-parent 1j.', tags: ['famille'] },
  { id: 'art23', title: 'Article 23 — Maladie', content: 'Indemnisation 85% (min 91%), max 1095 jours.', tags: ['maladie'] },
  { id: 'art26', title: 'Article 26 — Retraite', content: '10 ans=½ mois · 15 ans=1 mois · 20 ans=1,5 mois · 30 ans=2 mois. Groupe fermé=3 mois.', tags: ['retraite'] },
];

const KB_BULLETIN_CODES: ReadonlyArray<KbEntry> = [
  { id: 'P', title: 'P — Présence', content: 'Jour de travail effectif.' },
  { id: 'CP', title: 'CP — Congés payés', content: 'Jours de congés payés annuels.' },
  { id: 'RH', title: 'RH — Repos hebdo', content: 'Jour de repos hebdomadaire normal.' },
  { id: 'RTP', title: 'RTP — Repos travail prévu', content: 'Repos imprévu compensé.' },
  { id: 'M', title: 'M — Maladie', content: 'Arrêt maladie de courte durée.' },
  { id: 'AT', title: 'AT — Accident travail', content: 'Accident du travail.' },
  { id: 'AF', title: 'AF — Absence familiale', content: 'Congé pour événement familial.' },
  { id: 'FL', title: 'FL — Fête légale', content: 'Jour férié officiel.' },
  { id: 'FCP', title: 'FCP — Fête CP', content: 'Fête tombant pendant CP, à la masse.' },
  { id: 'CFL', title: 'CFL — Congé fête légale', content: 'Compensation fête légale.' },
];

const KB_ROLES: ReadonlyArray<KbEntry> = [
  { id: 'employe_n1', title: 'Employé Niv. 1', content: 'Employé 1 jeu, 2 300€/mois, 0,003% CA.' },
  { id: 'employe_n7', title: 'Employé Niv. 7 — Expert', content: 'Tous jeux, 6 113€/mois, 0,012% CA.' },
  { id: 'pit_boss', title: 'Pit Boss', content: 'Cadre supervisant un secteur de table.' },
  { id: 'inspecteur', title: 'Inspecteur', content: 'Cadre 8 295-8 710 €.' },
  { id: 'sous_directeur', title: 'Sous-directeur', content: 'Cadre 10 452 €.' },
];

const KB_VIDAL: ReadonlyArray<KbEntry> = [
  { id: 'doliprane', title: 'Doliprane (paracétamol)', content: 'Antalgique. Adulte 1g x3-4/j max, intervalle 6h. Insuffisance hépatique : avis médical.', tags: ['antalgique'] },
  { id: 'ibuprofene', title: 'Ibuprofène', content: 'AINS. Adulte 200-400mg x3/j max 1200mg/24h. Contre-indication grossesse 6+ mois.', tags: ['antalgique', 'AINS'] },
  { id: 'aspirine', title: 'Aspirine', content: 'AINS. 500mg-1g x3/j. Risque saignement. Pas pour enfants <16 ans.', tags: ['antalgique', 'AINS'] },
];

const KB_IR_2026: ReadonlyArray<KbEntry> = [
  { id: 'tranche0', title: 'Tranche 0% (jusqu\'à 11 497€)', content: 'Pas d\'imposition pour revenus jusqu\'à 11 497€.' },
  { id: 'tranche11', title: 'Tranche 11% (11 498 - 29 315€)', content: 'Taux marginal 11%.' },
  { id: 'tranche30', title: 'Tranche 30% (29 316 - 83 823€)', content: 'Taux marginal 30%.' },
  { id: 'tranche41', title: 'Tranche 41% (83 824 - 180 294€)', content: 'Taux marginal 41%.' },
  { id: 'tranche45', title: 'Tranche 45% (180 295€+)', content: 'Taux marginal 45%.' },
  { id: 'pfu', title: 'PFU (Flat tax)', content: '30% sur dividendes/intérêts (12,8% IR + 17,2% PS).' },
];

const KB_LEGAL: ReadonlyArray<KbEntry> = [
  { id: 'code_civil', title: 'Code civil', content: 'Personnes, biens, obligations, contrats, famille, succession.' },
  { id: 'code_penal', title: 'Code pénal', content: 'Infractions, peines. Légifrance source.' },
  { id: 'code_travail', title: 'Code du travail', content: 'CDI, CDD, licenciement, durée du travail, congés.' },
  { id: 'code_securite_sociale', title: 'Code sécu sociale', content: 'Maladie, retraite, prestations familiales.' },
  { id: 'monaco_loi_1103', title: 'Loi monégasque 1.103', content: 'Loi sur les jeux de hasard à Monaco.' },
];

const KB_RECETTES: ReadonlyArray<KbEntry> = [
  { id: 'boeuf_bourguignon', title: 'Bœuf bourguignon', content: 'Bœuf paleron 1kg, vin rouge 75cl, lardons 200g, oignons 4, carottes 4, bouquet garni. 3h mijotage doux.', tags: ['plat'] },
  { id: 'blanquette_veau', title: 'Blanquette de veau', content: 'Épaule veau 1kg, carottes 3, poireau 1, oignon 1 piqué clous girofle, jaunes œufs 2, crème 20cl. 1h45.', tags: ['plat'] },
  { id: 'tarte_tatin', title: 'Tarte Tatin', content: 'Pommes 6 (Reine des Reinettes), sucre 150g, beurre 100g, pâte feuilletée. Caramel + cuisson four 200°C 30min.', tags: ['dessert'] },
];

const KB_CUISSONS: ReadonlyArray<KbEntry> = [
  { id: 'boeuf_saignant', title: 'Bœuf saignant', content: 'Cœur 50°C. Cuisson rapide feu vif 1-2 min/face.' },
  { id: 'boeuf_apoint', title: 'Bœuf à point', content: 'Cœur 60°C. 3-4 min/face feu moyen.' },
  { id: 'volaille', title: 'Volaille', content: 'Cœur 75°C minimum (sécurité salmonelle). Jus clair = cuit.' },
  { id: 'poisson', title: 'Poisson', content: 'Cœur 60-65°C. Chair opaque, se détache à la fourchette.' },
];

const KB_ALLERGENES: ReadonlyArray<KbEntry> = [
  { id: 'gluten', title: 'Gluten', content: 'Blé, orge, seigle, avoine, épeautre, kamut. Cf INCO Annexe II §1.' },
  { id: 'crustaces', title: 'Crustacés', content: 'Crevettes, crabes, langoustines, homards, écrevisses.' },
  { id: 'oeufs', title: 'Œufs', content: 'Tous produits œufs (mayonnaise, pâtes, brioches, etc.).' },
  { id: 'arachides', title: 'Arachides', content: 'Cacahuètes et dérivés (beurre, huile, farine).' },
  { id: 'lait', title: 'Lait', content: 'Tous laitages (lactose). Beurre clarifié OK pour intolérants.' },
];

const KB_FAMILLES: ReadonlyArray<KbEntry> = [
  { id: 'bj', title: 'BJ — Black Jack', content: '10 équipes BJ (Éq.1 → Éq.10), tournantes par mois.' },
  { id: 'roulettes', title: 'Roulettes', content: '13 équipes (r1 → r13). Roulette anglaise + européenne.' },
  { id: 'cmc', title: 'CMC — Casino Monte Carlo', content: '13 équipes (c1 → c13). Tous jeux confondus dans un même salon.' },
  { id: 'cadres', title: 'Cadres', content: 'Pit boss + Inspecteurs + Superviseurs. Section dédiée parser PDF.' },
];

const KB_VENUES: ReadonlyArray<KbEntry> = [
  { id: 'atrium', title: 'Atrium', content: 'Salon principal Casino Monte Carlo. Hall d\'entrée historique.' },
  { id: 'renaissance', title: 'Renaissance', content: 'Salon Renaissance. Plafond peint, jeux haut de gamme.' },
  { id: 'rotonde', title: 'Rotonde', content: 'Salon Rotonde, accueil et jeux mécaniques.' },
  { id: 'medecin', title: 'Salle Médecin', content: 'Salon Salle Médecin, ambiance Belle Époque.' },
  { id: 'sun', title: 'Sun Casino', content: 'Casino du Fairmont. Jeux et salle privée.' },
];

const KB_JEUX: ReadonlyArray<KbEntry> = [
  { id: 'blackjack', title: 'Black Jack', content: '21 points sans dépasser. Croupier carte cachée. Splits, doubles, assurances. Avantage maison ~0,5%.' },
  { id: 'roulette_anglaise', title: 'Roulette Anglaise', content: '37 cases (0 + 1-36). Mises plein/cheval/transversale/colonne/dizaine/chance simple.' },
  { id: 'roulette_europeenne', title: 'Roulette Européenne', content: '37 cases (0 + 1-36). Comme Anglaise, hors quelques annonces spécifiques (voisins du zéro, tiers, orphelins).' },
  { id: 'punto_banco', title: 'Punto Banco', content: 'Variante Baccarat. Banque vs Joueur. Tirage automatisé selon table.' },
  { id: 'craps', title: 'Craps', content: 'Jeu de dés. Pass/Don\'t Pass, Come/Don\'t Come, Place bets. Volume parieur élevé.' },
  { id: 'texas_holdem', title: 'Texas Hold\'em', content: 'Poker 2 cartes privées + 5 communes. Tournois et Cash Game CMC.' },
  { id: 'poker_cash', title: 'Poker Cash Game', content: 'No-limit Texas. Buy-in min/max selon table.' },
  { id: 'punto_high_roller', title: 'Punto High Roller', content: 'Variante Punto Banco mises élevées. Salle privée.' },
];

export const KB_CATEGORIES: ReadonlyArray<KbCategory> = [
  { id: 'convention', icon: '📜', label: 'Convention SBM', description: 'Convention collective Jeux de Table SBM (1er avril 2015).', entries: KB_CONVENTION },
  { id: 'bulletin_codes', icon: '📋', label: 'Codes paie', description: 'Codes d\'activité bulletins de paie SBM (Note B. Lées 1993).', entries: KB_BULLETIN_CODES },
  { id: 'roles_sbm', icon: '👥', label: 'Rôles SBM', description: 'Niveaux et postes hiérarchiques SBM Casino.', entries: KB_ROLES },
  { id: 'vidal_otc', icon: '💊', label: 'Vidal OTC', description: 'Médicaments en vente libre (paracétamol, AINS, etc.).', entries: KB_VIDAL },
  { id: 'ir_2026', icon: '💰', label: 'IR 2026', description: 'Tranches impôt sur le revenu France 2026.', entries: KB_IR_2026 },
  { id: 'legal_kb', icon: '⚖️', label: 'Légal', description: '18+ codes français + jurisprudence Cassation/CE.', entries: KB_LEGAL },
  { id: 'recettes', icon: '🍳', label: 'Recettes', description: '10 recettes pro FR détaillées.', entries: KB_RECETTES },
  { id: 'cuissons', icon: '🌡️', label: 'Cuissons', description: '22 cuissons standardisées (températures cœur).', entries: KB_CUISSONS },
  { id: 'allergenes', icon: '⚠️', label: 'Allergènes', description: '14 allergènes INCO obligatoires.', entries: KB_ALLERGENES },
  { id: 'familles_cmc', icon: '🃏', label: 'Familles CMC', description: 'Familles d\'équipes Casino Monte Carlo.', entries: KB_FAMILLES },
  { id: 'venues', icon: '🏛️', label: 'Salons SBM', description: 'Salons et salles de jeux SBM Monaco.', entries: KB_VENUES },
  { id: 'jeux_sbm', icon: '🎲', label: 'Jeux SBM', description: '8 jeux de table proposés à la SBM.', entries: KB_JEUX },
];

let activeCategory: KbCategoryId = 'convention';
let searchQuery = '';

/**
 * Filtre les entrées d'une catégorie par query (titre/content/tags).
 */
export function searchKb(category: KbCategory, query: string): KbEntry[] {
  if (!query.trim()) return [...category.entries];
  const q = query.toLowerCase();
  return category.entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      (e.tags ?? []).some((t) => t.toLowerCase().includes(q)),
  );
}

/**
 * Recherche globale toutes catégories confondues.
 */
export function searchKbGlobal(query: string): Array<{ category: KbCategory; entry: KbEntry }> {
  if (!query.trim()) return [];
  const results: Array<{ category: KbCategory; entry: KbEntry }> = [];
  for (const cat of KB_CATEGORIES) {
    for (const entry of cat.entries) {
      const q = query.toLowerCase();
      if (
        entry.title.toLowerCase().includes(q) ||
        entry.content.toLowerCase().includes(q) ||
        (entry.tags ?? []).some((t) => t.toLowerCase().includes(q))
      ) {
        results.push({ category: cat, entry });
      }
    }
  }
  return results;
}

/**
 * Stats globaux KB.
 */
export function getKbStats(): { categories: number; entries: number } {
  return {
    categories: KB_CATEGORIES.length,
    entries: KB_CATEGORIES.reduce((acc, c) => acc + c.entries.length, 0),
  };
}

function renderCategoryTabs(): string {
  return KB_CATEGORIES.map(
    (c) => `
    <button class="ax-kb-tab ${activeCategory === c.id ? 'ax-tab-active' : ''}"
      data-kb-cat="${escapeHtml(c.id)}"
      style="background:${activeCategory === c.id ? 'rgba(201,162,39,.15)' : 'transparent'};color:${activeCategory === c.id ? '#c9a227' : '#a0a4c0'};border:1px solid rgba(201,162,39,.2);padding:8px 14px;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">
      <span>${escapeHtml(c.icon)}</span>${escapeHtml(c.label)}
      <span style="background:rgba(255,255,255,.05);padding:1px 6px;border-radius:4px;font-size:10px">${c.entries.length}</span>
    </button>`,
  ).join('');
}

function renderEntry(e: KbEntry): string {
  const tagsHtml = e.tags && e.tags.length > 0
    ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${e.tags.map((t) => `<span class="ax-gs-138">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';
  return `
    <li class="ax-kb-entry" style="background:rgba(20,20,35,0.5);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div class="ax-gs-6">
          <h4 style="margin:0 0 6px;color:#c9a227;font-size:13px">${escapeHtml(e.title)}</h4>
          <p style="margin:0;color:#fff;font-size:12px;line-height:1.5">${escapeHtml(e.content)}</p>
          ${tagsHtml}
        </div>
        <button class="ax-btn ax-btn-sm" data-kb-copy="${escapeHtml(e.id)}" style="font-size:10px;flex-shrink:0">📋</button>
      </div>
    </li>`;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeKbScope?.cleanup();
  activeKbScope = createCleanupScope('knowledge-bank');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('admin.kb', rootEl, uid)) return;
  const stats = getKbStats();
  const fallback = KB_CATEGORIES[0];
  if (!fallback) {
    rootEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a0a4c0">KB vide</div>';
    return;
  }
  const currentCategory = KB_CATEGORIES.find((c) => c.id === activeCategory) ?? fallback;
  const filtered = searchQuery ? searchKb(currentCategory, searchQuery) : [...currentCategory.entries];
  const globalResults = searchQuery && searchQuery.length >= 3 ? searchKbGlobal(searchQuery) : [];

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-268">
      <header class="ax-gs-181">
        <h1 class="ax-gs-324">📚 Base de connaissances</h1>
        <p class="ax-gs-325">
          ${stats.categories} catégories · ${stats.entries} entrées · injectées dans le system prompt IA Apex
        </p>
      </header>

      <section class="ax-gs-217">
        <input id="ax-kb-search" type="text" aria-label="Rechercher dans la banque de connaissances" placeholder="🔍 Rechercher dans toutes les catégories (3+ chars pour global)" value="${escapeHtml(searchQuery)}"
          style="width:100%;background:rgba(0,0,0,.3);color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px 12px;font-size:13px">
      </section>

      <section style="margin-bottom:16px;overflow-x:auto;white-space:nowrap;padding-bottom:6px;display:flex;gap:6px;flex-wrap:wrap">
        ${renderCategoryTabs()}
      </section>

      ${globalResults.length > 0 ? `
        <section style="margin-bottom:24px;background:rgba(201,162,39,.05);border-left:3px solid #c9a227;border-radius:8px;padding:12px">
          <h3 style="margin:0 0 10px;color:#c9a227;font-size:13px">🔍 Résultats globaux (${globalResults.length})</h3>
          <ul class="ax-gs-286">
            ${globalResults.slice(0, 20).map((r) => `
              <li style="padding:8px;border-bottom:1px solid rgba(255,255,255,.05)">
                <strong class="ax-gs-395">${escapeHtml(r.category.icon)} ${escapeHtml(r.entry.title)}</strong>
                <span style="color:#a0a4c0;font-size:11px"> · ${escapeHtml(r.category.label)}</span>
                <p class="ax-gs-396">${escapeHtml(r.entry.content.slice(0, 150))}${r.entry.content.length > 150 ? '...' : ''}</p>
              </li>
            `).join('')}
          </ul>
        </section>
      ` : ''}

      <section class="ax-gs-217">
        <div style="background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:14px;margin-bottom:12px">
          <h2 style="margin:0 0 4px;color:#fff;font-size:18px">${escapeHtml(currentCategory.icon)} ${escapeHtml(currentCategory.label)}</h2>
          <p style="margin:0;color:#a0a4c0;font-size:12px">${escapeHtml(currentCategory.description)}</p>
        </div>
        <ul class="ax-gs-286">
          ${filtered.length > 0 ? filtered.map(renderEntry).join('') : '<li class="ax-gs-209">Aucune entrée pour cette recherche.</li>'}
        </ul>
      </section>

      <section style="text-align:center;margin-top:20px">
        <button id="ax-kb-export" class="ax-btn ax-btn-sm">📥 Exporter cette catégorie (PDF)</button>
      </section>

      <p style="text-align:center;color:#666;font-size:11px;margin-top:20px">📚 KB v13 · ${stats.entries} entrées · Source de vérité IA Apex</p>
    </div>
  `;

  attachKbHandlers(rootEl);
  logger.info('feature-knowledge-bank', `rendered (cat=${activeCategory}, ${filtered.length}/${currentCategory.entries.length} entries)`);
}

function attachKbHandlers(rootEl: HTMLElement): void {
  rootEl.querySelectorAll<HTMLButtonElement>('[data-kb-cat]').forEach((btn) => {
    activeKbScope!.bind(btn, 'click', () => {
      haptic.selection();
      const cat = btn.dataset['kbCat'] as KbCategoryId | undefined;
      if (cat) activeCategory = cat;
      void render(rootEl);
    });
  });

  const searchEl = rootEl.querySelector<HTMLInputElement>('#ax-kb-search');
  if (searchEl) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    activeKbScope!.bind(searchEl, 'input', () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        searchQuery = searchEl.value;
        void render(rootEl);
      }, 250);
    });
  }

  rootEl.querySelectorAll<HTMLButtonElement>('[data-kb-copy]').forEach((btn) => {
    activeKbScope!.bind(btn, 'click', () => {
      haptic.tap();
      const id = btn.dataset['kbCopy'];
      const cat = KB_CATEGORIES.find((c) => c.id === activeCategory);
      const entry = cat?.entries.find((e) => e.id === id);
      if (!entry) return;
      const text = `${entry.title}\n${entry.content}`;
      try {
        void navigator.clipboard.writeText(text).then(() => {
          toast.success('Copié dans le presse-papier');
        });
      } catch {
        toast.warn('Copie indisponible');
      }
    });
  });

  const exportBtn = rootEl.querySelector<HTMLButtonElement>('#ax-kb-export');
  if (exportBtn && activeKbScope) activeKbScope.bind(exportBtn, 'click', () => {
    haptic.tap();
    toast.info('Export PDF à implémenter (jsPDF lazy-load Jet 5)');
  });
}
