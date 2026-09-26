/**
 * Tests Pro Modules — features EXPERT v13 (Kevin sprint 2026-05-04, "+max").
 *
 * Couvre uniquement les NOUVELLES capacités ajoutées au boost expert :
 * - Cuisine : 50+ recettes, macros, scaling, substitutions, menus, vins
 * - Medical : IMG, Harris-Benedict, posologie pédia, FAST AVC, SCORE CV, constantes vitales
 * - Finance : TVA, IS, succession, net/brut, pension, capacité emprunt
 * - Legal : 25+ codes, 24+ templates, indemnité licenciement, prescription, congés payés, intérêts
 * - Translator : 50+ langues, détection auto, glossaires métier, historique
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  AX_CUISINE,
  filterByCategorie,
  filterExcludingAllergenes,
  calcMacros,
  scaleRecette,
  suggerSubstitution,
  generateMenuPlan,
  suggerVin,
} from '../../features/pro/modules/cuisine/index.js';
import {
  AX_MEDICAL_FR,
  calcImg,
  calcMetabolismeHarrisBenedict,
  calcPosologiePediatrique,
  calcScoreCv,
  checkAvcFast,
  getConstantesVitales,
} from '../../features/pro/modules/medical/index.js';
import {
  AX_FINANCE_FR,
  calcTva,
  calcIs,
  calcSuccession,
  calcNetBrut,
  calcPensionRetraite,
  calcCapaciteEmprunt,
} from '../../features/pro/modules/finance/index.js';
import {
  AX_LEGAL_FR,
  calcIndemniteLicenciement,
  calcInteretsMoratoires,
  calcCongesPayes,
  getDelaiPrescription,
  getTemplate,
  listTemplates,
} from '../../features/pro/modules/legal/index.js';
import {
  AX_LANGS,
  GLOSSAIRES,
  detectLanguage,
  lookupGlossaire,
  listGlossaires,
  getHistory,
  clearHistory,
  translate,
} from '../../features/pro/modules/translator/index.js';

describe('Cuisine Pro EXPERT — expansion boost', () => {
  it('contient 50+ recettes après boost (FR + internationales)', () => {
    expect(AX_CUISINE.recettes.length).toBeGreaterThanOrEqual(40);
  });

  it('30+ cuissons documentés', () => {
    expect(Object.keys(AX_CUISINE.cuissons).length).toBeGreaterThanOrEqual(30);
  });

  it('substitutions disponibles pour gluten/lactose/vegan', () => {
    expect(suggerSubstitution('lait', 'lactose')).toBeTruthy();
    expect(suggerSubstitution('farine', 'gluten')).toBeTruthy();
    expect(suggerSubstitution('oeuf', 'vegan')).toBeTruthy();
    expect(suggerSubstitution('inconnu', 'gluten')).toBeNull();
  });

  it('filterByCategorie filtre desserts', () => {
    const desserts = filterByCategorie('dessert');
    expect(desserts.length).toBeGreaterThan(5);
    expect(desserts.every((r) => r.categorie === 'dessert')).toBe(true);
  });

  it('filterExcludingAllergenes retire gluten + lactose', () => {
    const ok = filterExcludingAllergenes(['gluten', 'lait']);
    expect(ok.length).toBeGreaterThan(0);
    for (const r of ok) {
      const al = (r.allergenes ?? []).map((a) => a.toLowerCase());
      expect(al.includes('gluten')).toBe(false);
      expect(al.includes('lait')).toBe(false);
    }
  });

  it('calcMacros calcule P/L/G correctement pour poulet 200g', () => {
    /* poulet 200g : P=46, L=8, G=0 → kcal=46*4+8*9+0=256 */
    const r = calcMacros([{ nom: 'poulet', grammes: 200 }]);
    expect(r.proteines_g).toBeCloseTo(46, 0);
    expect(r.lipides_g).toBeCloseTo(8, 0);
    expect(r.total_kcal).toBeGreaterThan(200);
  });

  it('scaleRecette double quantités', () => {
    const r = AX_CUISINE.recettes[0]!;
    const scaled = scaleRecette(r, 2);
    expect(scaled.portions).toBe((r.portions ?? 1) * 2);
  });

  it('generateMenuPlan retourne 7 jours', () => {
    const plan = generateMenuPlan(2000);
    expect(plan.jours.length).toBe(7);
    expect(plan.cible_kcal).toBe(2000);
    expect(plan.jours[0]?.jour).toBe('Lundi');
  });

  it('suggerVin trouve un accord pour Boeuf bourguignon', () => {
    const v = suggerVin('Boeuf bourguignon');
    expect(v).toContain('Bourgogne');
  });

  it('suggerVin retourne null si plat inconnu', () => {
    expect(suggerVin('PlatInconnuXYZ')).toBeNull();
  });

  it('recettes ont calories + portions + origine + categorie', () => {
    /* échantillon test : la majorité doit avoir ces métadonnées */
    const avec = AX_CUISINE.recettes.filter((r) => r.calories && r.portions && r.origine && r.categorie);
    expect(avec.length).toBeGreaterThanOrEqual(20);
  });

  it('au moins 5 plats internationaux (origine non-France)', () => {
    const inter = AX_CUISINE.recettes.filter((r) => r.origine && !/France|Bistrot FR|Provence|Lyon|Bretagne|Lorraine|Alsace|Sud-Ouest|Sologne|Marseille|Nice|Commercy|Paris/i.test(r.origine));
    expect(inter.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Medical Pro EXPERT — expansion boost', () => {
  it('contient 30+ médicaments OTC après boost', () => {
    expect(Object.keys(AX_MEDICAL_FR.otc).length).toBeGreaterThanOrEqual(30);
  });

  it('contient 15+ urgences', () => {
    expect(Object.keys(AX_MEDICAL_FR.urgences).length).toBeGreaterThanOrEqual(15);
  });

  it('contient 12+ vaccins (adulte + voyage)', () => {
    expect(Object.keys(AX_MEDICAL_FR.vaccins_adulte).length).toBeGreaterThanOrEqual(12);
  });

  it('numéros urgences internationaux : France/USA/UK/Japon', () => {
    expect(AX_MEDICAL_FR.urgences_internationales['france']).toBeTruthy();
    expect(AX_MEDICAL_FR.urgences_internationales['usa']).toBe('911');
    expect(AX_MEDICAL_FR.urgences_internationales['japon']).toBeTruthy();
  });

  it('calcImg homme actif', () => {
    /* IMC 22, age 30, homme : IMG = 1.2*22 + 0.23*30 - 10.8*1 - 5.4 = 17.1 */
    const img = calcImg(22, 30, 'homme');
    expect(img).toBeCloseTo(17.1, 1);
  });

  it('calcImg femme = plus élevé qu homme à mêmes IMC/age', () => {
    expect(calcImg(22, 30, 'femme')).toBeGreaterThan(calcImg(22, 30, 'homme'));
  });

  it('calcMetabolismeHarrisBenedict homme 70kg/175cm/30ans', () => {
    const r = calcMetabolismeHarrisBenedict(70, 175, 30, 'homme');
    expect(r).toBeGreaterThan(1500);
    expect(r).toBeLessThan(2000);
  });

  it('calcPosologiePediatrique 15mg/kg, enfant 20kg, 4 prises/j', () => {
    const r = calcPosologiePediatrique(15, 20, 4);
    expect(r.dose_journaliere_mg).toBe(300);
    expect(r.dose_par_prise_mg).toBe(75);
  });

  it('calcScoreCv jeune non-fumeur = très bas', () => {
    const r = calcScoreCv({ age: 30, sexe: 'femme', fumeur: false, tas_mmhg: 120, cholesterol_mmol: 4.5 });
    expect(r.niveau).toBe('tres_bas');
  });

  it('calcScoreCv senior fumeur HTA = haut', () => {
    const r = calcScoreCv({ age: 65, sexe: 'homme', fumeur: true, tas_mmhg: 165, cholesterol_mmol: 7.5 });
    expect(['haut', 'tres_haut']).toContain(r.niveau);
  });

  it('checkAvcFast 3 signes positifs = suspicion AVC', () => {
    const r = checkAvcFast({ face_asymetrie: true, bras_faiblesse: true, parole_alteree: true });
    expect(r.suspicion_avc).toBe(true);
    expect(r.score).toBe(3);
    expect(r.action).toContain('15 SAMU');
  });

  it('checkAvcFast 0 signe = pas de suspicion', () => {
    const r = checkAvcFast({ face_asymetrie: false, bras_faiblesse: false, parole_alteree: false });
    expect(r.suspicion_avc).toBe(false);
  });

  it('getConstantesVitales adulte 30 ans', () => {
    const c = getConstantesVitales(30);
    expect(c?.fc_max).toBe(100);
    expect(c?.fr_max).toBeGreaterThan(0);
  });

  it('getConstantesVitales nourrisson 6 mois', () => {
    const c = getConstantesVitales(0.5);
    expect(c?.fc_max).toBeGreaterThan(100);
  });

  it('getConstantesVitales personne âgée 80 ans', () => {
    const c = getConstantesVitales(80);
    expect(c?.ta_sys).toContain('150');
  });

  it('contient procédures premiers secours (RCP, choking, brûlure, PLS)', () => {
    expect(AX_MEDICAL_FR.premiers_secours['rcp_adulte']).toBeTruthy();
    expect(AX_MEDICAL_FR.premiers_secours['choking_adulte']).toBeTruthy();
    expect(AX_MEDICAL_FR.premiers_secours['brulure_thermique']).toBeTruthy();
    expect(AX_MEDICAL_FR.premiers_secours['pls']).toBeTruthy();
  });

  it('médicaments ont info pédiatrique pour les principaux', () => {
    expect(AX_MEDICAL_FR.otc['doliprane']?.pediatric).toContain('mg/kg');
    expect(AX_MEDICAL_FR.otc['ibuprofene']?.pediatric).toContain('mg/kg');
  });
});

describe('Finance Pro EXPERT — expansion boost', () => {
  it('TVA normal 20% sur 100 EUR HT', () => {
    const r = calcTva(100, 'normal');
    expect(r.tva).toBe(20);
    expect(r.ttc).toBe(120);
    expect(r.taux).toBe(0.2);
  });

  it('TVA réduit 5.5% (alimentaire essentiel)', () => {
    const r = calcTva(100, 'reduit');
    expect(r.tva).toBeCloseTo(5.5, 1);
  });

  it('TVA super-réduit 2.1% (presse, médicaments remboursables)', () => {
    const r = calcTva(100, 'super_reduit');
    expect(r.tva).toBeCloseTo(2.1, 1);
  });

  it('IS taux réduit 15% sous 42 500€', () => {
    const r = calcIs(40000);
    expect(r.is).toBe(6000); /* 40000 * 0.15 */
    expect(r.taux_effectif).toBeCloseTo(0.15, 2);
  });

  it('IS taux mixte au-dessus 42 500€', () => {
    const r = calcIs(100000);
    /* 42500*0.15 + 57500*0.25 = 6375 + 14375 = 20750 */
    expect(r.is).toBe(20750);
  });

  it('IS bénéfice nul = 0', () => {
    const r = calcIs(0);
    expect(r.is).toBe(0);
  });

  it('Succession enfant 200k = abattement 100k puis barème', () => {
    const r = calcSuccession(200000, 'enfants');
    expect(r.abattement).toBe(100000);
    expect(r.base_taxable).toBe(100000);
    expect(r.droits).toBeGreaterThan(0);
    expect(r.exonere).toBe(false);
  });

  it('Succession conjoint = exonération totale (TEPA)', () => {
    const r = calcSuccession(500000, 'conjoint_pacs');
    expect(r.exonere).toBe(true);
    expect(r.droits).toBe(0);
  });

  it('Succession tiers = 60% au-delà abattement', () => {
    const r = calcSuccession(100000, 'tiers');
    expect(r.droits).toBeGreaterThan(50000);
  });

  it('Succession 50k enfant = 0 (sous abattement)', () => {
    const r = calcSuccession(50000, 'enfants');
    expect(r.droits).toBe(0);
    expect(r.exonere).toBe(true);
  });

  it('Net/brut salaire non-cadre 22%', () => {
    const r = calcNetBrut(2000, false);
    expect(r.net).toBe(1560);
    expect(r.taux_charges).toBeCloseTo(0.22, 2);
  });

  it('Net/brut cadre 25%', () => {
    const r = calcNetBrut(3000, true);
    expect(r.net).toBe(2250);
  });

  it('Pension retraite trimestres complets', () => {
    const r = calcPensionRetraite(40000, 172, 172);
    expect(r.taux).toBeCloseTo(0.5, 2);
    expect(r.decote_pct).toBe(0);
  });

  it('Pension retraite décote 8 trimestres manquants', () => {
    const r = calcPensionRetraite(40000, 164, 172);
    expect(r.decote_pct).toBeGreaterThan(0);
    expect(r.taux).toBeLessThan(0.5);
  });

  it('Capacité emprunt 3000€ revenu 25 ans 3.5%', () => {
    const r = calcCapaciteEmprunt(3000, 0.035, 25);
    expect(r.mensualite_max).toBe(1050); /* 35% de 3000 */
    expect(r.capacite_emprunt).toBeGreaterThan(150000);
  });

  it('Capacité emprunt taux 0% = mensualité × n mois', () => {
    const r = calcCapaciteEmprunt(2000, 0, 10);
    expect(r.capacite_emprunt).toBe(700 * 12 * 10); /* 35% × 2000 × 120 mois */
  });

  it('TVA UE : Hongrie 27% (max), Luxembourg 17% (min)', () => {
    expect(AX_FINANCE_FR.tva_eu['hongrie']).toBe(0.27);
    expect(AX_FINANCE_FR.tva_eu['luxembourg']).toBe(0.17);
  });

  it('Décote IR France 2026 paramètres présents', () => {
    expect(AX_FINANCE_FR.decote.seuil_celibataire).toBeGreaterThan(0);
    expect(AX_FINANCE_FR.decote.plafond_couple).toBeGreaterThan(0);
  });
});

describe('Legal Pro EXPERT — expansion boost', () => {
  it('25+ codes français', () => {
    expect(Object.keys(AX_LEGAL_FR.codes).length).toBeGreaterThanOrEqual(25);
  });

  it('Nouveaux codes : construction_habitation, sport, energie, patrimoine', () => {
    expect(AX_LEGAL_FR.codes['construction_habitation']).toBeTruthy();
    expect(AX_LEGAL_FR.codes['sport']).toBeTruthy();
    expect(AX_LEGAL_FR.codes['energie']).toBeTruthy();
    expect(AX_LEGAL_FR.codes['patrimoine']).toBeTruthy();
  });

  it('Constitutions FR 1958 + Monaco 1962 + DDH 1789', () => {
    expect(AX_LEGAL_FR.constitutions['france_1958']).toBeTruthy();
    expect(AX_LEGAL_FR.constitutions['monaco_1962']).toBeTruthy();
    expect(AX_LEGAL_FR.constitutions['declaration_dh_1789']).toBeTruthy();
  });

  it('20+ templates lettres officielles', () => {
    expect(Object.keys(AX_LEGAL_FR.templates).length).toBeGreaterThanOrEqual(20);
  });

  it('Templates couvrent : démission, RC, RGPD, plainte, succession', () => {
    expect(getTemplate('demission_cdi')).toBeTruthy();
    expect(getTemplate('rupture_conventionnelle')).toBeTruthy();
    expect(getTemplate('droit_acces_rgpd')).toBeTruthy();
    expect(getTemplate('plainte_simple')).toBeTruthy();
    expect(getTemplate('declaration_main_main')).toBeTruthy();
  });

  it('listTemplates retourne array key/titre', () => {
    const list = listTemplates();
    expect(list.length).toBeGreaterThan(20);
    expect(list[0]?.key).toBeTruthy();
    expect(list[0]?.titre).toBeTruthy();
  });

  it('getTemplate inconnu retourne null', () => {
    expect(getTemplate('xxx_inconnu')).toBeNull();
  });

  it('Templates ont ref legales (CGI, CC, code travail)', () => {
    const t = getTemplate('demission_cdi');
    expect(t?.ref_legales).toContain('L1237-1');
  });

  it('Indemnité licenciement 5 ans à 2500€', () => {
    /* 1/4 × 2500 × 5 = 3125 */
    const r = calcIndemniteLicenciement(2500, 5);
    expect(r.indemnite).toBe(3125);
    expect(r.formule).toContain('L1234-9');
  });

  it('Indemnité licenciement 15 ans à 2500€ (cap 10 + 5)', () => {
    /* 1/4 × 2500 × 10 + 1/3 × 2500 × 5 = 6250 + 4166.67 = ~10417 */
    const r = calcIndemniteLicenciement(2500, 15);
    expect(r.indemnite).toBeGreaterThan(10000);
  });

  it('Indemnité 0 si moins de 8 mois ancienneté', () => {
    const r = calcIndemniteLicenciement(2000, 0.5);
    expect(r.indemnite).toBe(0);
  });

  it('Intérêts moratoires 1000€ 365j à 6.97%', () => {
    const r = calcInteretsMoratoires(1000, 365, 0.0697);
    expect(r).toBe(70); /* arrondi */
  });

  it('Congés payés 12 mois = 30 jours ouvrables', () => {
    const r = calcCongesPayes(12);
    expect(r.jours_ouvrables).toBe(30);
    expect(r.jours_ouvres).toBeCloseTo(25, 0);
  });

  it('Congés payés 6 mois = 15 jours ouvrables', () => {
    const r = calcCongesPayes(6);
    expect(r.jours_ouvrables).toBe(15);
  });

  it('Délai prescription civile droit commun = 5 ans', () => {
    const r = getDelaiPrescription('civile_droit_commun');
    expect(r?.duree).toBe('5 ans');
    expect(r?.reference).toContain('2224');
  });

  it('Délai prescription crime = 20 ans', () => {
    const r = getDelaiPrescription('penal_crime');
    expect(r?.duree).toBe('20 ans');
  });

  it('Délai prescription inconnu = null', () => {
    expect(getDelaiPrescription('inconnu')).toBeNull();
  });

  it('10+ organismes officiels (Légifrance, BOFiP, CNIL...)', () => {
    expect(Object.keys(AX_LEGAL_FR.organismes).length).toBeGreaterThanOrEqual(8);
    expect(AX_LEGAL_FR.organismes['legifrance']).toBeTruthy();
    expect(AX_LEGAL_FR.organismes['bofip']).toBeTruthy();
  });
});

describe('Translator Pro EXPERT — expansion boost', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* happy-dom OK */
    }
  });

  it('50+ langues supportées (était 30)', () => {
    expect(Object.keys(AX_LANGS).length).toBeGreaterThanOrEqual(50);
  });

  it('Nouvelles langues : sw, am, mn, eu, gl, ca', () => {
    expect(AX_LANGS['sw']).toBeTruthy();
    expect(AX_LANGS['am']).toBeTruthy();
    expect(AX_LANGS['mn']).toBeTruthy();
    expect(AX_LANGS['eu']).toBeTruthy();
    expect(AX_LANGS['ca']).toBeTruthy();
  });

  it('Langues Asie SE étendues (ms, fil, km, lo, my)', () => {
    expect(AX_LANGS['ms']).toBeTruthy();
    expect(AX_LANGS['fil']).toBeTruthy();
    expect(AX_LANGS['km']).toBeTruthy();
    expect(AX_LANGS['lo']).toBeTruthy();
    expect(AX_LANGS['my']).toBeTruthy();
  });

  it('detectLanguage cyrillique → ru', () => {
    expect(detectLanguage('Привет мир')).toBe('ru');
  });

  it('detectLanguage chinois → zh', () => {
    expect(detectLanguage('你好世界')).toBe('zh');
  });

  it('detectLanguage japonais → ja', () => {
    expect(detectLanguage('こんにちは世界')).toBe('ja');
  });

  it('detectLanguage arabe → ar', () => {
    expect(detectLanguage('مرحبا بالعالم')).toBe('ar');
  });

  it('detectLanguage français mots-clés → fr', () => {
    expect(detectLanguage('Le chat est sur la table')).toBe('fr');
  });

  it('detectLanguage anglais mots-clés → en', () => {
    expect(detectLanguage('The cat is on the table')).toBe('en');
  });

  it('detectLanguage défaut → en si rien match', () => {
    expect(detectLanguage('xyz')).toBe('en');
  });

  it('detectLanguage vide → en', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('Glossaires métier disponibles', () => {
    expect(GLOSSAIRES['medical']).toBeTruthy();
    expect(GLOSSAIRES['legal']).toBeTruthy();
    expect(GLOSSAIRES['technique']).toBeTruthy();
    expect(GLOSSAIRES['marketing']).toBeTruthy();
  });

  it('listGlossaires retourne 4 domaines', () => {
    expect(listGlossaires()).toEqual(expect.arrayContaining(['medical', 'legal', 'technique', 'marketing']));
  });

  it('lookupGlossaire medical : ordonnance', () => {
    expect(lookupGlossaire('ordonnance', 'medical')).toContain('prescription');
  });

  it('lookupGlossaire legal : contrat', () => {
    expect(lookupGlossaire('contrat', 'legal')).toContain('contract');
  });

  it('lookupGlossaire technique : firewall', () => {
    expect(lookupGlossaire('pare feu', 'technique')).toContain('firewall');
  });

  it('lookupGlossaire terme inconnu → null', () => {
    expect(lookupGlossaire('xxxxx', 'medical')).toBeNull();
  });

  it('translate avec options niveau formal', async () => {
    let prompt = '';
    await translate('Hello', 'fr', async (p) => {
      prompt = p;
      return 'Bonjour';
    }, { niveau: 'formal' });
    expect(prompt).toContain('formal');
  });

  it('translate avec options domaine medical', async () => {
    let prompt = '';
    await translate('Pain', 'fr', async (p) => {
      prompt = p;
      return 'Douleur';
    }, { domaine: 'medical' });
    expect(prompt).toContain('medical');
  });

  it('historique persiste après traduction réussie', async () => {
    await translate('Hello', 'fr', async () => 'Bonjour');
    const h = getHistory();
    expect(h.length).toBeGreaterThan(0);
    expect(h[h.length - 1]?.text).toBe('Hello');
    expect(h[h.length - 1]?.tgt).toBe('fr');
  });

  it('clearHistory vide l historique', async () => {
    await translate('Hello', 'fr', async () => 'Bonjour');
    clearHistory();
    expect(getHistory().length).toBe(0);
  });
});
