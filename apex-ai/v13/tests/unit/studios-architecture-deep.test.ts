/**
 * APEX v13 — Tests deep features/studios/architecture (calculs RE2020 + render)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/store.js', () => ({
  store: { get: vi.fn(() => ({ id: 'test_uid' })) },
}));
vi.mock('../../services/auth/feature-guard.js', () => ({
  guardFeatureEnabled: vi.fn(() => true),
}));
vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('../../ui/haptic.js', () => ({
  haptic: { tap: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import {
  render,
  dispose,
  escapeHtml,
  calcSurfaceHabitable,
  calcBeton,
  calcPeinture,
  calcRevetement,
  checkBlondel,
  RE2020_ZONES,
  BETON_DOSAGES,
  PMR_NORMS,
  HSP_MIN_FR,
  HSP_MIN_MONACO,
  BLONDEL_MIN,
  BLONDEL_MAX,
} from '../../features/studios/architecture/index.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

let root: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  dispose();
});

afterEach(() => {
  document.body.innerHTML = '';
  dispose();
});

describe('studios-architecture — pure helpers', () => {
  describe('escapeHtml', () => {
    it('échappe caractères spéciaux', () => {
      expect(escapeHtml('<a&"\'>')).toBe('&lt;a&amp;&quot;&#39;&gt;');
    });
  });

  describe('calcSurfaceHabitable', () => {
    it('100m² brute → 95m² habitable', () => {
      expect(calcSurfaceHabitable(100)).toBe(95);
    });
    it('0 → 0', () => {
      expect(calcSurfaceHabitable(0)).toBe(0);
    });
    it('négatif → 0', () => {
      expect(calcSurfaceHabitable(-50)).toBe(0);
    });
    it('NaN → 0', () => {
      expect(calcSurfaceHabitable(NaN)).toBe(0);
    });
    it('Infinity → 0', () => {
      expect(calcSurfaceHabitable(Infinity)).toBe(0);
    });
  });

  describe('calcBeton', () => {
    it('1m³ dosage 300 → quantités correctes', () => {
      const r = calcBeton(1, 'Béton dosage 300');
      expect(r).not.toBeNull();
      expect(r!.ciment_kg).toBe(300);
      expect(r!.sacs_ciment_35kg).toBe(Math.ceil(300 / 35));
    });
    it('volume 0 → null', () => {
      expect(calcBeton(0, 'Béton dosage 250')).toBeNull();
    });
    it('volume négatif → null', () => {
      expect(calcBeton(-1, 'Béton dosage 250')).toBeNull();
    });
    it('volume NaN → null', () => {
      expect(calcBeton(NaN, 'Béton dosage 250')).toBeNull();
    });
    it('dosage inconnu → null', () => {
      expect(calcBeton(1, 'Inconnu')).toBeNull();
    });
    it('5m³ dosage 350 → 1750kg ciment', () => {
      expect(calcBeton(5, 'Béton dosage 350')?.ciment_kg).toBe(1750);
    });
  });

  describe('calcPeinture', () => {
    it('5×4×2.5 → calcule surfaces', () => {
      const r = calcPeinture(5, 4, 2.5);
      expect(r).not.toBeNull();
      expect(r!.surface_a_peindre_m2).toBeGreaterThan(0);
      expect(r!.litres_total).toBeGreaterThan(0);
    });
    it('longueur invalide → null', () => {
      expect(calcPeinture(0, 4, 2.5)).toBeNull();
    });
    it('largeur invalide → null', () => {
      expect(calcPeinture(5, -1, 2.5)).toBeNull();
    });
    it('hauteur invalide → null', () => {
      expect(calcPeinture(5, 4, 0)).toBeNull();
    });
    it('NaN → null', () => {
      expect(calcPeinture(NaN, 4, 2.5)).toBeNull();
      expect(calcPeinture(5, NaN, 2.5)).toBeNull();
      expect(calcPeinture(5, 4, NaN)).toBeNull();
    });
    it('couches < 1 → null', () => {
      expect(calcPeinture(5, 4, 2.5, 0)).toBeNull();
    });
    it('couches > 5 → null', () => {
      expect(calcPeinture(5, 4, 2.5, 6)).toBeNull();
    });
    it('1 couche valide', () => {
      const r1 = calcPeinture(5, 4, 2.5, 1);
      const r2 = calcPeinture(5, 4, 2.5, 2);
      expect(r1!.litres_total).toBeLessThanOrEqual(r2!.litres_total);
    });
    it('petite pièce → pots_2_5l peut être 0', () => {
      const r = calcPeinture(0.5, 0.5, 2);
      expect(r!.pots_2_5l).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calcRevetement', () => {
    it('5×4 + 10% chutes → 22m²', () => {
      const r = calcRevetement(5, 4, 10);
      expect(r!.surface_m2).toBe(20);
      expect(r!.surface_avec_chutes_m2).toBe(22);
    });
    it('chutes par défaut 10%', () => {
      const r = calcRevetement(10, 10);
      expect(r!.surface_avec_chutes_m2).toBe(110);
    });
    it('longueur invalide → null', () => {
      expect(calcRevetement(0, 4)).toBeNull();
    });
    it('largeur invalide → null', () => {
      expect(calcRevetement(5, -1)).toBeNull();
    });
    it('NaN → null', () => {
      expect(calcRevetement(NaN, 4)).toBeNull();
    });
  });

  describe('checkBlondel', () => {
    it('17cm + 28cm = 62 → ok', () => {
      const r = checkBlondel(17, 28);
      expect(r.ok).toBe(true);
      expect(r.valeur).toBe(62);
    });
    it('valeur < 60 → trop bas', () => {
      const r = checkBlondel(15, 28);
      expect(r.ok).toBe(false);
      expect(r.recommandation).toMatch(/trop bas|trop court/);
    });
    it('valeur > 64 → trop haut', () => {
      const r = checkBlondel(20, 28);
      expect(r.ok).toBe(false);
      expect(r.recommandation).toMatch(/trop haut|trop long/);
    });
  });
});

describe('studios-architecture — constantes', () => {
  it('RE2020_ZONES contient 8 zones', () => {
    expect(RE2020_ZONES.length).toBe(8);
  });
  it('Monaco H2d référencée', () => {
    expect(RE2020_ZONES.find((z) => z.zone === 'H2d')?.description).toMatch(/Monaco/i);
  });
  it('BETON_DOSAGES contient 5 entries', () => {
    expect(BETON_DOSAGES.length).toBe(5);
  });
  it('PMR_NORMS contient 6 normes', () => {
    expect(PMR_NORMS.length).toBe(6);
  });
  it('constantes hauteur', () => {
    expect(HSP_MIN_FR).toBe(240);
    expect(HSP_MIN_MONACO).toBe(230);
    expect(BLONDEL_MIN).toBeLessThan(BLONDEL_MAX);
  });
});

describe('studios-architecture — render', () => {
  it('rend tous les inputs + boutons', () => {
    render(root);
    expect(root.querySelector('#ax-archi-surface')).toBeTruthy();
    expect(root.querySelector('#ax-archi-surface-btn')).toBeTruthy();
    expect(root.querySelector('#ax-archi-vol')).toBeTruthy();
    expect(root.querySelector('#ax-archi-dosage')).toBeTruthy();
    expect(root.querySelector('#ax-archi-beton-btn')).toBeTruthy();
    expect(root.querySelector('#ax-archi-l')).toBeTruthy();
    expect(root.querySelector('#ax-archi-w')).toBeTruthy();
    expect(root.querySelector('#ax-archi-h')).toBeTruthy();
    expect(root.querySelector('#ax-archi-paint-btn')).toBeTruthy();
    expect(root.querySelector('#ax-archi-zone')).toBeTruthy();
  });

  it('feature guard false → skip', () => {
    (guardFeatureEnabled as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(root);
    expect(root.querySelector('#ax-archi-surface')).toBeFalsy();
  });

  it('zone select pré-rempli avec description', () => {
    render(root);
    /* updateZone appelé immédiatement */
    expect(root.querySelector('#ax-archi-zone-out')?.textContent).toMatch(/Bbio max/);
  });
});

describe('studios-architecture — handlers', () => {
  it('btn surface : valeur valide → affiche m²', () => {
    render(root);
    (root.querySelector('#ax-archi-surface') as HTMLInputElement).value = '100';
    root.querySelector<HTMLButtonElement>('#ax-archi-surface-btn')!.click();
    expect(root.querySelector('#ax-archi-surface-out')?.textContent).toMatch(/95 m²/);
  });

  it('btn surface : valeur invalide → "Saisis une surface valide"', () => {
    render(root);
    (root.querySelector('#ax-archi-surface') as HTMLInputElement).value = '';
    root.querySelector<HTMLButtonElement>('#ax-archi-surface-btn')!.click();
    expect(root.querySelector('#ax-archi-surface-out')?.textContent).toMatch(/valide/);
  });

  it('btn beton : OK → affiche quantités', () => {
    render(root);
    (root.querySelector('#ax-archi-vol') as HTMLInputElement).value = '2';
    /* Le 1er option est sélectionné par défaut */
    root.querySelector<HTMLButtonElement>('#ax-archi-beton-btn')!.click();
    expect(root.querySelector('#ax-archi-beton-out')?.textContent).toMatch(/Ciment/);
  });

  it('btn beton : volume invalide → "Volume invalide"', () => {
    render(root);
    (root.querySelector('#ax-archi-vol') as HTMLInputElement).value = '0';
    root.querySelector<HTMLButtonElement>('#ax-archi-beton-btn')!.click();
    expect(root.querySelector('#ax-archi-beton-out')?.textContent).toMatch(/Volume invalide/);
  });

  it('btn paint : OK → affiche litres', () => {
    render(root);
    (root.querySelector('#ax-archi-l') as HTMLInputElement).value = '5';
    (root.querySelector('#ax-archi-w') as HTMLInputElement).value = '4';
    (root.querySelector('#ax-archi-h') as HTMLInputElement).value = '2.5';
    root.querySelector<HTMLButtonElement>('#ax-archi-paint-btn')!.click();
    expect(root.querySelector('#ax-archi-paint-out')?.textContent).toMatch(/litres/);
  });

  it('btn paint : invalide → "Dimensions invalides"', () => {
    render(root);
    (root.querySelector('#ax-archi-l') as HTMLInputElement).value = '0';
    (root.querySelector('#ax-archi-w') as HTMLInputElement).value = '4';
    (root.querySelector('#ax-archi-h') as HTMLInputElement).value = '2.5';
    root.querySelector<HTMLButtonElement>('#ax-archi-paint-btn')!.click();
    expect(root.querySelector('#ax-archi-paint-out')?.textContent).toMatch(/Dimensions invalides/);
  });

  it('change zone select met à jour out', () => {
    render(root);
    const sel = root.querySelector<HTMLSelectElement>('#ax-archi-zone')!;
    sel.value = 'H1a';
    sel.dispatchEvent(new Event('change'));
    expect(root.querySelector('#ax-archi-zone-out')?.textContent).toMatch(/H1a/);
  });
});

describe('studios-architecture — dispose', () => {
  it('dispose ne plante pas', () => {
    render(root);
    expect(() => dispose()).not.toThrow();
    expect(() => dispose()).not.toThrow();
  });

  it('re-render après dispose', () => {
    render(root);
    dispose();
    render(root);
    expect(root.querySelector('#ax-archi-surface')).toBeTruthy();
  });
});
