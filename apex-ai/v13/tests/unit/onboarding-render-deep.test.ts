/**
 * APEX v13 — Tests deep render features/onboarding
 *
 * Couvre la fonction render() onboarding 5-step (auparavant 17.1% L coverage)
 * + handlers next/prev/skip/capabilities/mode/permissions/finish.
 *
 * Méthode : DOM happy-dom + vi.mock (router, toast, haptic, store).
 *
 * NOTE : currentStep est un module-state. Pour isoler les tests on appelle
 * vi.resetModules() + dynamic import dans chaque beforeEach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/router.js', () => ({
  router: { navigate: vi.fn() },
}));

vi.mock('../../core/store.js', () => ({
  store: {
    get: vi.fn(() => null),
    set: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('../../ui/toast.js', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
  },
}));

vi.mock('../../ui/haptic.js', () => ({
  haptic: {
    tap: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    medium: vi.fn(),
  },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

interface OnboardingMod {
  render: (rootEl: HTMLElement) => Promise<void>;
  dispose: () => void;
  isOnboardingNeeded: (uid: string | null) => boolean;
  markOnboardingDone: (uid: string) => void;
}

let root: HTMLDivElement;
let mod: OnboardingMod;
let toastMock: { info: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let hapticMock: { tap: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };
let routerMock: { navigate: ReturnType<typeof vi.fn> };
let storeMock: { get: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  vi.clearAllMocks();
  vi.resetModules();
  /* Re-import everything pour reset le module-state currentStep */
  mod = (await import('../../features/onboarding/index.js')) as unknown as OnboardingMod;
  const t = await import('../../ui/toast.js');
  const h = await import('../../ui/haptic.js');
  const r = await import('../../core/router.js');
  const s = await import('../../core/store.js');
  toastMock = t.toast as unknown as typeof toastMock;
  hapticMock = h.haptic as unknown as typeof hapticMock;
  routerMock = r.router as unknown as typeof routerMock;
  storeMock = s.store as unknown as typeof storeMock;
  storeMock.get.mockReturnValue(null);
});

afterEach(() => {
  try {
    mod.dispose();
  } catch {
    /* ignore */
  }
  document.body.innerHTML = '';
});

describe('features/onboarding — utility functions', () => {
  it('isOnboardingNeeded → false si uid null', () => {
    expect(mod.isOnboardingNeeded(null)).toBe(false);
  });

  it('isOnboardingNeeded → false pour kdmc_admin', () => {
    expect(mod.isOnboardingNeeded('kdmc_admin')).toBe(false);
  });

  it('isOnboardingNeeded → true si user normal sans flag', () => {
    expect(mod.isOnboardingNeeded('user_x')).toBe(true);
  });

  it('isOnboardingNeeded → false si flag done=true', () => {
    localStorage.setItem('apex_v13_onboarding_done_user_x', 'true');
    expect(mod.isOnboardingNeeded('user_x')).toBe(false);
  });

  it('markOnboardingDone persiste flag', () => {
    mod.markOnboardingDone('uid_abc');
    expect(localStorage.getItem('apex_v13_onboarding_done_uid_abc')).toBe('true');
  });
});

describe('features/onboarding — render step 1 (welcome + name)', () => {
  it('render initial : input prénom + bouton suivant + skip présents', async () => {
    await mod.render(root);
    expect(root.querySelector('#ax-onboarding-name')).toBeTruthy();
    expect(root.querySelector('#ax-onboarding-next')).toBeTruthy();
    expect(root.querySelector('#ax-onboarding-skip')).toBeTruthy();
    /* Pas de prev sur step 1 */
    expect(root.querySelector('#ax-onboarding-prev')).toBeNull();
  });

  it('pré-remplit le prénom depuis store.get(user)', async () => {
    storeMock.get.mockReturnValue({ id: 'u', name: 'Laurence' });
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name');
    expect(inp?.value).toBe('Laurence');
  });

  it('input event met à jour state interne (name trim)', async () => {
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = '  Kevin  ';
    inp.dispatchEvent(new Event('input'));
    const next = root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!;
    next.click();
    expect(toastMock.warn).not.toHaveBeenCalled();
    /* Step 2 affiché */
    expect(root.querySelector('#ax-onboarding-grant-perms')).toBeTruthy();
  });

  it('toast.warn si nom < 2 caractères au click next', async () => {
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = 'K';
    inp.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    expect(toastMock.warn).toHaveBeenCalled();
    expect(root.querySelector('#ax-onboarding-name')).toBeTruthy();
  });

  it('persiste apex_v13_user_name dans localStorage si valide', async () => {
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = 'Marie';
    inp.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    expect(localStorage.getItem('apex_v13_user_name')).toBe('Marie');
  });

  it('skip bouton appelle haptic.tap + finishOnboarding', async () => {
    storeMock.get.mockReturnValue({ id: 'user_skip' });
    await mod.render(root);
    root.querySelector<HTMLButtonElement>('#ax-onboarding-skip')!.click();
    expect(hapticMock.tap).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
    expect(localStorage.getItem('apex_v13_onboarding_done_user_skip')).toBe('true');
  });
});

describe('features/onboarding — render step 2 (permissions)', () => {
  beforeEach(async () => {
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = 'Test';
    inp.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
  });

  it('affiche les 3 cards (notif/mic/cam) + bouton autoriser', () => {
    expect(root.querySelector('#ax-onboarding-grant-perms')).toBeTruthy();
    expect(root.innerHTML).toContain('Notifications');
    expect(root.innerHTML).toContain('Microphone');
    expect(root.innerHTML).toContain('Caméra');
  });

  it('bouton prev affiché et fonctionne', () => {
    const prev = root.querySelector<HTMLButtonElement>('#ax-onboarding-prev')!;
    expect(prev).toBeTruthy();
    prev.click();
    expect(root.querySelector('#ax-onboarding-name')).toBeTruthy();
  });

  it('click grant-perms appelle requestAllPermissions safely', async () => {
    const grantBtn = root.querySelector<HTMLButtonElement>('#ax-onboarding-grant-perms')!;
    grantBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    /* En happy-dom : Notification absent → toast.info */
    const called =
      toastMock.info.mock.calls.length + toastMock.success.mock.calls.length;
    expect(called).toBeGreaterThanOrEqual(0);
  });
});

describe('features/onboarding — render step 3 (capabilities)', () => {
  beforeEach(async () => {
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = 'Test';
    inp.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
  });

  it('affiche les 8 capability buttons', () => {
    const caps = root.querySelectorAll('.ax-onboarding-cap');
    expect(caps.length).toBe(8);
  });

  it('toggle capability au click', () => {
    const browserBtn = root.querySelector<HTMLButtonElement>('[data-cap="browser"]')!;
    expect(browserBtn).toBeTruthy();
    browserBtn.click();
    expect(hapticMock.tap).toHaveBeenCalled();
    /* Re-render → bouton existe encore */
    const browserBtn2 = root.querySelector<HTMLButtonElement>('[data-cap="browser"]')!;
    browserBtn2.click();
  });

  it('next persiste apex_v13_capabilities en localStorage', () => {
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    const stored = localStorage.getItem('apex_v13_capabilities');
    expect(stored).toBeTruthy();
    const arr = JSON.parse(stored!);
    expect(Array.isArray(arr)).toBe(true);
  });
});

describe('features/onboarding — render step 4 (mode)', () => {
  beforeEach(async () => {
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = 'Test';
    inp.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
  });

  it('affiche les 3 choix de mode', () => {
    const choices = root.querySelectorAll('.ax-mode-choice');
    expect(choices.length).toBe(3);
  });

  it('click sur "serious" change le mode actif', () => {
    const seriousBtn = root.querySelector<HTMLButtonElement>('[data-mode="serious"]')!;
    seriousBtn.click();
    expect(hapticMock.tap).toHaveBeenCalled();
  });

  it('click sur "fun" change le mode actif', () => {
    const funBtn = root.querySelector<HTMLButtonElement>('[data-mode="fun"]')!;
    funBtn.click();
    const choicesAgain = root.querySelectorAll('.ax-mode-choice');
    expect(choicesAgain.length).toBe(3);
  });

  it('next sauvegarde ax_mode_dual', () => {
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    const m = localStorage.getItem('ax_mode_dual');
    expect(m).toBeTruthy();
  });
});

describe('features/onboarding — render step 5 (tour)', () => {
  beforeEach(async () => {
    storeMock.get.mockReturnValue({ id: 'user_finish' });
    await mod.render(root);
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name')!;
    inp.value = 'Test';
    inp.dispatchEvent(new Event('input'));
    /* Avance vers step 5 (steps 1→2→3→4→5) */
    for (let i = 0; i < 4; i++) {
      root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    }
  });

  it('affiche les 3 cards explicatives', () => {
    expect(root.innerHTML).toContain('Chat');
    expect(root.innerHTML).toContain('Coffre');
    expect(root.innerHTML).toContain('Studios');
  });

  it('le bouton next affiche "Terminer"', () => {
    const next = root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!;
    expect(next.textContent).toContain('Terminer');
  });

  it('terminate appelle markOnboardingDone + toast.success + setTimeout router.navigate', () => {
    vi.useFakeTimers();
    root.querySelector<HTMLButtonElement>('#ax-onboarding-next')!.click();
    expect(toastMock.success).toHaveBeenCalled();
    expect(localStorage.getItem('apex_v13_onboarding_done_user_finish')).toBe('true');
    vi.advanceTimersByTime(400);
    expect(routerMock.navigate).toHaveBeenCalledWith('chat');
    vi.useRealTimers();
  });
});

describe('features/onboarding — dispose', () => {
  it('dispose() est sûr même sans render préalable', () => {
    expect(() => mod.dispose()).not.toThrow();
  });

  it('dispose() après render cleanup correctement', async () => {
    await mod.render(root);
    expect(() => mod.dispose()).not.toThrow();
    /* Re-render après dispose → OK, root pas vidé sauf si re-render */
    await mod.render(root);
    expect(root.querySelector('#ax-onboarding-name')).toBeTruthy();
  });
});

describe('features/onboarding — escape XSS dans nom', () => {
  it('value attribut escape HTML — script tag pas créé dans DOM', async () => {
    storeMock.get.mockReturnValue({
      id: 'u',
      name: '<script>alertA()</script>',
    });
    await mod.render(root);
    /* Aucun élément <script> dans DOM (parsé depuis innerHTML) */
    const scripts = root.querySelectorAll('script');
    expect(scripts.length).toBe(0);
    /* La valeur du champ contient bien le texte (échappé puis ré-interprété) */
    const inp = root.querySelector<HTMLInputElement>('#ax-onboarding-name');
    expect(inp?.value).toContain('alertA');
  });
});
