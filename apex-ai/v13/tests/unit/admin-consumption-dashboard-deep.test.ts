/**
 * APEX v13 — Tests deep features/admin/consumption-dashboard
 *
 * Cible : pousser features/admin/consumption-dashboard.ts vers 100% L+B.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/observability/consumption-monitor.js', () => ({
  consumptionMonitor: {
    formatForUI: vi.fn(() => ({
      total_alerts: 0,
      services: [
        {
          service: 'anthropic',
          emoji: '🤖',
          pct_used: 50,
          severity: 'ok',
          used: 500,
          budget: 1000,
          billing_url: 'https://console.anthropic.com/billing',
        },
      ],
    })),
    getUpgradePlans: vi.fn(() => [
      {
        name: 'Pro',
        price_eur_month: 20,
        description: 'Plan pro plus quota',
        upgrade_url: 'https://x.com/up',
      },
      {
        name: 'Free',
        price_eur_month: 0,
        description: 'Free tier',
        upgrade_url: 'https://x.com/free',
      },
    ]),
    recommendUpgrade: vi.fn(() => ({
      needed: false,
      reason: 'OK',
    })),
  },
}));

vi.mock('../../core/store.js', () => ({
  store: { get: vi.fn(() => ({ id: 'test_uid' })) },
}));

vi.mock('../../services/auth/feature-guard.js', () => ({
  guardFeatureEnabled: vi.fn(() => true),
}));

import { render } from '../../features/admin/consumption-dashboard.js';
import { consumptionMonitor } from '../../services/observability/consumption-monitor.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

let root: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('consumption-dashboard — render', () => {
  it('rend le dashboard avec card service', () => {
    render(root);
    expect(root.querySelector('.ax-consumption-dashboard')).toBeTruthy();
    expect(root.querySelector('.ax-consumption-card')).toBeTruthy();
    expect(root.querySelector('.ax-consumption-card')?.getAttribute('data-service')).toBe('anthropic');
  });

  it('affiche banner OK si total_alerts=0', () => {
    render(root);
    expect(root.querySelector('.ax-banner-ok')).toBeTruthy();
    expect(root.querySelector('.ax-banner-alert')).toBeFalsy();
  });

  it('affiche banner alert si total_alerts>0', () => {
    (consumptionMonitor.formatForUI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      total_alerts: 2,
      services: [],
    });
    render(root);
    expect(root.querySelector('.ax-banner-alert')?.textContent).toMatch(/2 services/);
  });

  it('affiche "1 service" en singulier si total_alerts=1', () => {
    (consumptionMonitor.formatForUI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      total_alerts: 1,
      services: [],
    });
    render(root);
    expect(root.querySelector('.ax-banner-alert')?.textContent).toMatch(/1 service en alerte/);
  });

  it('couleur warn pour severity=warn', () => {
    (consumptionMonitor.formatForUI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      total_alerts: 1,
      services: [{
        service: 'x', emoji: '⚠️', pct_used: 75, severity: 'warn',
        used: 750, budget: 1000, billing_url: 'https://x.com',
      }],
    });
    render(root);
    expect(root.querySelector<HTMLElement>('.ax-consumption-bar-fill')?.style.background).toBe('#ffaa00');
  });

  it('couleur critical pour severity=critical', () => {
    (consumptionMonitor.formatForUI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      total_alerts: 3,
      services: [{
        service: 'y', emoji: '🚨', pct_used: 95, severity: 'critical',
        used: 950, budget: 1000, billing_url: 'https://y.com',
      }],
    });
    render(root);
    expect(root.querySelector<HTMLElement>('.ax-consumption-bar-fill')?.style.background).toBe('#ff4444');
  });

  it('cap barre à 100% même si pct_used > 100', () => {
    (consumptionMonitor.formatForUI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      total_alerts: 1,
      services: [{
        service: 'overflow', emoji: '🔥', pct_used: 150, severity: 'critical',
        used: 1500, budget: 1000, billing_url: 'https://o.com',
      }],
    });
    render(root);
    const fill = root.querySelector<HTMLElement>('.ax-consumption-bar-fill');
    expect(fill?.style.width).toBe('100%');
  });
});

describe('consumption-dashboard — interactions', () => {
  it('click "Plans" ouvre modal', () => {
    render(root);
    const btn = root.querySelector<HTMLButtonElement>('[data-action="upgrade-plans"]')!;
    btn.click();
    const mount = root.querySelector('#ax-consumption-modal-mount')!;
    expect(mount.innerHTML).toContain('Plans ANTHROPIC');
    expect(mount.innerHTML).toContain('Pro');
    expect(mount.innerHTML).toContain('Free');
  });

  it('modal affiche bandeau reco si needed=true', () => {
    (consumptionMonitor.recommendUpgrade as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      needed: true,
      reason: 'Vous consommez 90%',
      suggested: 'Pro',
    });
    render(root);
    root.querySelector<HTMLButtonElement>('[data-action="upgrade-plans"]')!.click();
    const mount = root.querySelector('#ax-consumption-modal-mount')!;
    expect(mount.innerHTML).toContain('ax-reco-banner');
    expect(mount.innerHTML).toContain('Vous consommez 90%');
    expect(mount.innerHTML).toContain('Pro');
  });

  it('modal sans suggested ne montre pas le block plan', () => {
    (consumptionMonitor.recommendUpgrade as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      needed: true,
      reason: 'Limite proche',
    });
    render(root);
    root.querySelector<HTMLButtonElement>('[data-action="upgrade-plans"]')!.click();
    const mount = root.querySelector('#ax-consumption-modal-mount')!;
    expect(mount.innerHTML).toContain('Limite proche');
    expect(mount.innerHTML).not.toContain('Plan suggéré');
  });

  it('click "close-modal" ferme la modal', () => {
    render(root);
    root.querySelector<HTMLButtonElement>('[data-action="upgrade-plans"]')!.click();
    expect(root.querySelector('#ax-consumption-modal-mount')!.innerHTML).toContain('Plans');
    /* close */
    const closeBtn = root.querySelector<HTMLButtonElement>('[data-action="close-modal"]')!;
    closeBtn.click();
    expect(root.querySelector('#ax-consumption-modal-mount')!.innerHTML).toBe('');
  });
});

describe('consumption-dashboard — guard feature', () => {
  it('si guardFeatureEnabled false → render skip', () => {
    (guardFeatureEnabled as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(root);
    /* render guard renvoie tôt → root reste tel quel ou affiche message */
    expect(consumptionMonitor.formatForUI).not.toHaveBeenCalled();
  });

  it('user store sans id → uid="anon" passé au guard', async () => {
    /* mock store.get retourne null */
    const { store } = (await import('../../core/store.js')) as { store: { get: ReturnType<typeof vi.fn> } };
    (store.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    render(root);
    expect(guardFeatureEnabled).toHaveBeenCalledWith('admin.consumption', expect.anything(), 'anon');
  });
});
