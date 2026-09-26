/**
 * Tests Pro Modules portés v12 → v13 (Kevin sprint 2026-05-04)
 *
 * 5 modules : cuisine, medical, finance, legal, translator.
 * Tests focus PURE LOGIC + intégration via proModulesHub.render() délégation.
 *
 * NB : la render() UI HTML est excluded coverage (vitest.config) — testée E2E.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { proModulesHub } from '../../features/pro/index.js';
import {
  AX_CUISINE,
  cuisineConvert,
  cuisineSearch,
  calcCalories,
  generateCourses,
} from '../../features/pro/modules/cuisine/index.js';
import {
  AX_MEDICAL_FR,
  calcBmi,
  calcMetabolismeBase,
  calcDpp,
  medicalLookup,
  medicalUrgence,
} from '../../features/pro/modules/medical/index.js';
import {
  AX_FINANCE_FR,
  calcIR,
  calcCredit,
  calcPvImmo,
  calcPvMobilier,
} from '../../features/pro/modules/finance/index.js';
import {
  AX_LEGAL_FR,
  legalLookup,
  jurisprudenceSearch,
  listCodes,
} from '../../features/pro/modules/legal/index.js';
import {
  AX_LANGS,
  translate,
  listLanguages,
  clearCache,
  getPreferredTarget,
} from '../../features/pro/modules/translator/index.js';

describe('Cuisine Pro module', () => {
  it('contient 10+ recettes FR avec ingrédients', () => {
    expect(AX_CUISINE.recettes.length).toBeGreaterThanOrEqual(10);
    for (const r of AX_CUISINE.recettes) {
      expect(r.nom).toBeTruthy();
      expect(r.ingredients.length).toBeGreaterThan(0);
    }
  });

  it('14 allergènes INCO obligatoires', () => {
    expect(AX_CUISINE.allergenes.length).toBe(14);
    expect(AX_CUISINE.allergenes).toContain('Gluten');
    expect(AX_CUISINE.allergenes).toContain('Lait');
    expect(AX_CUISINE.allergenes).toContain('Sulfites');
  });

  it('22+ modes de cuisson documentés', () => {
    expect(Object.keys(AX_CUISINE.cuissons).length).toBeGreaterThanOrEqual(22);
  });

  it('cuisineConvert convertit unités cuisine', () => {
    expect(cuisineConvert('1 cuillere a soupe')?.equivalent).toBe('15 ml');
    expect(cuisineConvert('1 tasse')?.equivalent).toBe('240 ml');
    expect(cuisineConvert('UNKNOWN')).toBeNull();
  });

  it('cuisineSearch retourne recettes contenant le mot', () => {
    const res = cuisineSearch('boeuf');
    expect(res.length).toBeGreaterThan(0);
    expect(res.some((r) => r.nom.toLowerCase().includes('boeuf') || r.ingredients.some((i) => i.includes('boeuf')))).toBe(true);
  });

  it('calcCalories somme correctement aliments', () => {
    const r = calcCalories([
      { nom: 'pain', grammes: 100 },
      { nom: 'fromage', grammes: 50 },
    ]);
    expect(r.total_kcal).toBe(260 + 175); /* 260 + 50/100*350 */
    expect(r.detail.length).toBe(2);
  });

  it('calcCalories aliment inconnu fallback 100 kcal/100g', () => {
    const r = calcCalories([{ nom: 'aliment_inconnu', grammes: 100 }]);
    expect(r.total_kcal).toBe(100);
  });

  it('generateCourses agrège ingrédients de plusieurs recettes', () => {
    const r1 = AX_CUISINE.recettes[0]!;
    const r2 = AX_CUISINE.recettes[1]!;
    const courses = generateCourses([r1, r2]);
    expect(courses.length).toBeGreaterThan(0);
    expect(courses.every((c) => /^\d+x /.test(c))).toBe(true);
  });
});

describe('Medical Pro module', () => {
  it('contient 6+ médicaments OTC avec DCI', () => {
    expect(Object.keys(AX_MEDICAL_FR.otc).length).toBeGreaterThanOrEqual(6);
    expect(AX_MEDICAL_FR.otc['doliprane']?.dci).toBe('Paracetamol');
  });

  it('numéros urgences SAMU/Pompiers/Police/112', () => {
    expect(AX_MEDICAL_FR.sources['samu']).toBe('15');
    expect(AX_MEDICAL_FR.sources['pompiers']).toBe('18');
    expect(AX_MEDICAL_FR.sources['police']).toBe('17');
    expect(AX_MEDICAL_FR.sources['urgence_europe']).toBe('112');
  });

  it('calcBmi retourne IMC + catégorie', () => {
    const r = calcBmi(70, 1.75);
    expect(r?.bmi).toBeCloseTo(22.9, 1);
    expect(r?.categorie).toBe('Normal');
  });

  it('calcBmi obésité I/II/III', () => {
    expect(calcBmi(95, 1.7)?.categorie).toBe('Obesite I');
    expect(calcBmi(115, 1.7)?.categorie).toBe('Obesite II');
    expect(calcBmi(125, 1.7)?.categorie).toBe('Obesite III morbide');
  });

  it('calcBmi entrées invalides retourne null', () => {
    expect(calcBmi(0, 1.75)).toBeNull();
    expect(calcBmi(70, 0)).toBeNull();
  });

  it('calcMetabolismeBase Mifflin-St Jeor homme/femme', () => {
    const homme = calcMetabolismeBase(70, 175, 30, 'homme');
    const femme = calcMetabolismeBase(70, 175, 30, 'femme');
    expect(homme.metabolisme_kcal).toBeGreaterThan(femme.metabolisme_kcal);
    expect(homme.maintenance_actif).toBeGreaterThan(homme.metabolisme_kcal);
  });

  it('calcDpp retourne date présumée + SA', () => {
    const r = calcDpp('2025-01-01');
    expect(r.date_presumee_accouchement).toBe('2025-10-08');
    expect(typeof r.semaines_amenorrhee).toBe('number');
  });

  it('medicalLookup retourne info OTC', () => {
    const i = medicalLookup('Doliprane');
    expect(i.dci).toBe('Paracetamol');
    expect(i.posologie).toContain('1g');
  });

  it('medicalLookup inconnu retourne URL Vidal', () => {
    const i = medicalLookup('moleculeXYZ');
    expect(i.vidal_url).toContain('vidal.fr');
  });

  it('medicalUrgence détecte symptôme connu', () => {
    const u = medicalUrgence('douleur thoracique');
    expect(u.action).toContain('SAMU');
  });

  it('medicalUrgence inconnu retourne action SAMU défaut', () => {
    const u = medicalUrgence('xyz');
    expect(u.action).toContain('15');
  });
});

describe('Finance Pro module', () => {
  it('5 tranches IR France 2026', () => {
    expect(AX_FINANCE_FR.ir_tranches.length).toBe(5);
    expect(AX_FINANCE_FR.ir_tranches[0]?.taux).toBe(0);
    expect(AX_FINANCE_FR.ir_tranches[4]?.taux).toBe(0.45);
  });

  it('calcIR revenu < tranche 1 → 0', () => {
    const r = calcIR(10000, 1);
    expect(r.ir).toBe(0);
  });

  it('calcIR revenu moyen → ~11% taux marginal', () => {
    const r = calcIR(20000, 1);
    expect(r.taux_marginal).toBe(0.11);
    expect(r.ir).toBeGreaterThan(0);
  });

  it('calcIR revenu haut → 30/41% marginal', () => {
    expect(calcIR(50000, 1).taux_marginal).toBe(0.30);
    expect(calcIR(100000, 1).taux_marginal).toBe(0.41);
    expect(calcIR(200000, 1).taux_marginal).toBe(0.45);
  });

  it('calcIR avec 2 parts (couple) divise par 2', () => {
    const r1 = calcIR(60000, 1);
    const r2 = calcIR(60000, 2);
    expect(r2.ir).toBeLessThan(r1.ir);
  });

  it('calcCredit mensualité correcte 200k 25 ans 3.5%', () => {
    const r = calcCredit(200000, 0.035, 25);
    expect(r.mensualite).toBeGreaterThan(900);
    expect(r.mensualite).toBeLessThan(1100);
    expect(r.interets).toBeGreaterThan(0);
  });

  it('calcCredit taux 0% retourne montant/mois sans intérêts', () => {
    const r = calcCredit(120000, 0, 10);
    expect(r.mensualite).toBe(1000);
    expect(r.interets).toBe(0);
  });

  it('calcPvImmo résidence principale exonérée', () => {
    const r = calcPvImmo(300000, 200000, 5, true);
    expect(r.exonere).toBe(true);
    expect(r.raison).toContain('Residence principale');
  });

  it('calcPvImmo perte (vente < achat)', () => {
    const r = calcPvImmo(150000, 200000, 10, false);
    expect(r.perte).toBe(50000);
  });

  it('calcPvImmo abattement 22 ans IR exoneration', () => {
    const r = calcPvImmo(400000, 200000, 22, false);
    expect(r.exoneration_ir).toBe(true);
    expect(r.abattement_ir).toBe(1);
  });

  it('calcPvImmo abattement 30 ans PS exoneration', () => {
    const r = calcPvImmo(400000, 200000, 30, false);
    expect(r.exoneration_ps).toBe(true);
    expect(r.abattement_ps).toBe(1);
  });

  it('calcPvMobilier PFU 30%', () => {
    const r = calcPvMobilier(15000, 10000);
    expect(r.pv).toBe(5000);
    expect(r.total).toBe(1500); /* 30% de 5000 */
    expect(r.formule).toContain('PFU');
  });

  it('calcPvMobilier moins-value', () => {
    const r = calcPvMobilier(8000, 10000);
    expect(r.pv).toBe(-2000);
    expect(r.impot).toBe(0);
  });

  it('Monaco fiscal IR résidents non-FR = 0', () => {
    expect(AX_FINANCE_FR.monaco.ir_residents_non_fr).toBe(0);
    expect(AX_FINANCE_FR.monaco.droits_succession_directs).toBe(0);
  });
});

describe('Legal Pro module', () => {
  it('contient 25+ codes français (expansion expert v13)', () => {
    expect(Object.keys(AX_LEGAL_FR.codes).length).toBeGreaterThanOrEqual(18);
  });

  it('codes principaux Civil/Pénal/Travail/Commerce', () => {
    expect(AX_LEGAL_FR.codes['civil']).toContain('legifrance.gouv.fr');
    expect(AX_LEGAL_FR.codes['penal']).toContain('legifrance.gouv.fr');
    expect(AX_LEGAL_FR.codes['travail']).toContain('legifrance.gouv.fr');
    expect(AX_LEGAL_FR.codes['commerce']).toContain('legifrance.gouv.fr');
  });

  it('5 jurisprudences (Cassation/CE/CC/CJUE/CEDH)', () => {
    expect(Object.keys(AX_LEGAL_FR.jurisprudence).length).toBe(5);
    expect(AX_LEGAL_FR.jurisprudence['cassation']).toContain('courdecassation.fr');
    expect(AX_LEGAL_FR.jurisprudence['cjue']).toContain('curia.europa.eu');
    expect(AX_LEGAL_FR.jurisprudence['cedh']).toContain('echr.coe.int');
  });

  it('Monaco Constitution + Légimonaco', () => {
    expect(AX_LEGAL_FR.monaco['constitution']).toContain('gouv.mc');
    expect(AX_LEGAL_FR.monaco['legimonaco']).toContain('legimonaco.mc');
  });

  it('legalLookup code direct retourne URL Légifrance code', () => {
    const u = legalLookup('civil');
    expect(u).toContain('LEGITEXT000006070721');
  });

  it('legalLookup terme inconnu retourne URL recherche', () => {
    const u = legalLookup('article 1240');
    expect(u).toContain('legifrance.gouv.fr/search');
    expect(u).toContain('article');
  });

  it('jurisprudenceSearch génère URL Cassation correcte', () => {
    const u = jurisprudenceSearch('cassation', 'rupture conventionnelle');
    expect(u).toContain('courdecassation.fr');
    expect(u).toContain('rupture');
  });

  it('jurisprudenceSearch source inconnue fallback Cassation', () => {
    const u = jurisprudenceSearch('foo', 'test');
    expect(u).toContain('courdecassation.fr');
  });

  it('listCodes retourne 18+ codes avec key/label/url', () => {
    const codes = listCodes();
    expect(codes.length).toBeGreaterThanOrEqual(18);
    expect(codes[0]?.key).toBeTruthy();
    expect(codes[0]?.url).toContain('legifrance');
  });
});

describe('Translator Pro module', () => {
  beforeEach(() => {
    /* Clean cache + prefs entre tests */
    try {
      localStorage.clear();
    } catch {
      /* happy-dom OK */
    }
  });

  it('30+ langues supportées', () => {
    expect(Object.keys(AX_LANGS).length).toBeGreaterThanOrEqual(30);
  });

  it('langues principales fr/en/es/de/it/zh/ja/ar', () => {
    expect(AX_LANGS['fr']).toContain('Français');
    expect(AX_LANGS['en']).toContain('English');
    expect(AX_LANGS['es']).toContain('Español');
    /* Expansion v13 : labels natifs (中文/日本語/العربية) */
    expect(AX_LANGS['zh']).toBeTruthy();
    expect(AX_LANGS['ja']).toBeTruthy();
    expect(AX_LANGS['ar']).toBeTruthy();
  });

  it('listLanguages retourne array codes', () => {
    const codes = listLanguages();
    expect(codes.length).toBeGreaterThanOrEqual(30);
    expect(codes).toContain('fr');
  });

  it('translate stub retourne marqueur reproductible sans apiCall', async () => {
    const r = await translate('Bonjour', 'en');
    expect(r).toBe('[TRANSLATE:en] Bonjour');
  });

  it('translate vide retourne string vide', async () => {
    const r = await translate('   ', 'en');
    expect(r).toBe('');
  });

  it('translate avec apiCall mocké appelle bien la fonction', async () => {
    let capturedPrompt = '';
    const r = await translate('Hello', 'fr', async (prompt) => {
      capturedPrompt = prompt;
      return 'Bonjour';
    });
    expect(r).toBe('Bonjour');
    expect(capturedPrompt).toContain('Translate to');
    expect(capturedPrompt).toContain('Français');
    expect(capturedPrompt).toContain('Hello');
  });

  it('translate lang inconnue fallback en', async () => {
    const r = await translate('Test', 'xx');
    expect(r).toBe('[TRANSLATE:en] Test');
  });

  it('translate cache hit ne re-appelle pas apiCall', async () => {
    let calls = 0;
    const apiCall = async (): Promise<string> => {
      calls++;
      return 'Cached';
    };
    await translate('Hello', 'fr', apiCall);
    await translate('Hello', 'fr', apiCall);
    expect(calls).toBe(1);
  });

  it('translate apiCall throw → fallback stub', async () => {
    const r = await translate('Hello', 'fr', async () => {
      throw new Error('API down');
    });
    expect(r).toContain('[TRANSLATE:fr]');
  });

  it('clearCache vide le cache localStorage', async () => {
    await translate('Hello', 'en', async () => 'Hi');
    clearCache();
    let calls = 0;
    await translate('Hello', 'en', async () => {
      calls++;
      return 'Hi';
    });
    expect(calls).toBe(1);
  });

  it('getPreferredTarget retourne en par défaut', () => {
    expect(getPreferredTarget()).toBe('en');
  });
});

describe('proModulesHub render delegation (intégration)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });

  it('render(cuisine) délègue vers module Cuisine Pro', async () => {
    await proModulesHub.render('cuisine', root);
    expect(root.innerHTML).toContain('Cuisine Pro');
    expect(root.innerHTML).toContain('Recettes');
  });

  it('render(medical) délègue + injecte disclaimer', async () => {
    await proModulesHub.render('medical', root);
    expect(root.innerHTML).toContain('Medical Pro');
    expect(root.innerHTML).toContain('SAMU');
    expect(root.innerHTML).toContain('Information indicative');
  });

  it('render(finance) délègue + Monaco fiscal présent', async () => {
    await proModulesHub.render('finance', root);
    expect(root.innerHTML).toContain('Finance Pro');
    expect(root.innerHTML).toContain('Monaco');
    expect(root.innerHTML).toContain('IR France 2026');
  });

  it('render(legal) délègue + 18 codes français + Monaco', async () => {
    await proModulesHub.render('legal', root);
    expect(root.innerHTML).toContain('juridique');
    expect(root.innerHTML).toContain('Codes français');
    expect(root.innerHTML).toContain('Monaco');
  });

  it('render(translator) délègue + 30 langues sélecteur', async () => {
    await proModulesHub.render('translator', root);
    expect(root.innerHTML).toContain('Traducteur Pro');
    expect(root.innerHTML).toContain('Français');
    expect(root.innerHTML).toContain('English');
  });
});
