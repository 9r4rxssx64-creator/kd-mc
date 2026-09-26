/**
 * APEX v13 — Tests render batch1 features (signup, signup-approval, waiting-approval,
 * legal, multi-source-history, innovation).
 *
 * Couvre la fonction render() de chaque feature (auparavant 0% lines coverage)
 * + handlers click qui appellent les services mockés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ============================================================
 * MOCKS — déclarés AVANT les imports des features
 * ============================================================ */

vi.mock('../../core/router.js', () => ({
  router: { navigate: vi.fn() },
}));

vi.mock('../../ui/toast.js', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    show: vi.fn(),
  },
}));

vi.mock('../../ui/haptic.js', () => ({
  haptic: {
    tap: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    selection: vi.fn(),
  },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/auth/signup.js', () => ({
  signup: {
    /* v13.4.211 — selfSignupDirect remplace requestSignup pour flow auto */
    selfSignupDirect: vi.fn(async () => ({
      ok: true,
      uid: 'free_test_uid_123',
      loggedIn: true,
    })),
    requestSignup: vi.fn(async () => ({
      ok: true,
      requestId: 'signup_test_123',
      inviteLink: 'https://wa.me/33612345678?text=OTP123',
    })),
    listPending: vi.fn(() => [] as unknown[]),
    listProcessed: vi.fn(() => [] as unknown[]),
    approveSignup: vi.fn(async () => ({ ok: true, uid: 'user_new_abc' })),
    rejectSignup: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('../../services/core-svc/csp-style-helper.js', () => ({
  cspStyleHelper: {
    withNonce: vi.fn((html: string) => html),
  },
}));

vi.mock('../../services/auth/rgpd.js', () => ({
  rgpd: {
    showCookieBanner: vi.fn(() => ({ shouldShow: false, reason: 'set' })),
    hasConsent: vi.fn(() => false),
    getProcessingRegistry: vi.fn(() => [
      {
        finalite: 'Authentification',
        donnees: ['email', 'password'],
        baseLegale: 'Art. 6.1.b contrat',
        duree: '3 ans',
        destinataires: ['Apex'],
      },
    ]),
    portableExport: vi.fn(async () => new Blob(['{}'], { type: 'application/json' })),
    deleteUserData: vi.fn(async () => ({ ok: true, deletedKeys: ['k1', 'k2'], failures: [] as string[] })),
    setConsent: vi.fn(),
    optOutAITraining: vi.fn(),
    optOutAutomation: vi.fn(),
  },
}));

vi.mock('../../services/ai/multi-source-analyze.js', () => ({
  multiSourceAnalyze: {
    getHistory: vi.fn(() => [] as unknown[]),
    getStats: vi.fn(() => ({
      sources_total: 0,
      items_total: 0,
      items_configured: 0,
      items_tested_ok: 0,
    })),
    installAll: vi.fn(async () => ({ installed: 1, tested_ok: 1 })),
  },
}));

vi.mock('../../services/integrations/study-service.js', () => ({
  studyService: {
    listKnown: vi.fn(() => [] as unknown[]),
    refreshAll: vi.fn(async () => ({ refreshed: 3, errors: [] as string[] })),
  },
}));

vi.mock('../../core/store.js', () => ({
  store: {
    get: vi.fn((key: string) => (key === 'isAdmin' ? true : null)),
    set: vi.fn(),
  },
}));

vi.mock('../../services/sentinels/innovation-watch.js', () => ({
  innovationWatch: {
    getStats: vi.fn(() => ({
      lastScan: 0,
      totalUpdatesDetected: 0,
      lastWeek: 0,
      appliedCount: 0,
      skippedCount: 0,
    })),
    getUpdates: vi.fn(() => [] as unknown[]),
    runScan: vi.fn(async () => ({ summary: '3 updates found' })),
    markUpdate: vi.fn(),
    reset: vi.fn(),
  },
}));

/* ============================================================
 * IMPORTS — après les mocks
 * ============================================================ */

import { render as renderSignup, dispose as disposeSignup } from '../../features/signup/index.js';
import {
  render as renderSignupApproval,
  dispose as disposeSignupApproval,
} from '../../features/signup-approval/index.js';
import {
  render as renderWaiting,
  dispose as disposeWaiting,
} from '../../features/waiting-approval/index.js';
import { render as renderLegal, dispose as disposeLegal } from '../../features/legal/index.js';
import {
  render as renderMSH,
  dispose as disposeMSH,
} from '../../features/multi-source-history/index.js';
import {
  render as renderInnovation,
  dispose as disposeInnovation,
} from '../../features/innovation/index.js';

import { signup } from '../../services/auth/signup.js';
import { router } from '../../core/router.js';
import { toast } from '../../ui/toast.js';
import { rgpd } from '../../services/auth/rgpd.js';
import { multiSourceAnalyze } from '../../services/ai/multi-source-analyze.js';
import { studyService } from '../../services/integrations/study-service.js';
import { innovationWatch } from '../../services/sentinels/innovation-watch.js';
import { store } from '../../core/store.js';

/* ============================================================
 * Setup
 * ============================================================ */

let root: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  vi.clearAllMocks();
  /* default store.get returns true for isAdmin */
  (store.get as ReturnType<typeof vi.fn>).mockImplementation((k: string) =>
    k === 'isAdmin' ? true : null,
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  /* dispose all features pour éviter cross-test leaks */
  try { disposeSignup(); } catch { /* ignore */ }
  try { disposeSignupApproval(); } catch { /* ignore */ }
  try { disposeWaiting(); } catch { /* ignore */ }
  try { disposeLegal(); } catch { /* ignore */ }
  try { disposeMSH(); } catch { /* ignore */ }
  try { disposeInnovation(); } catch { /* ignore */ }
});

/* Helpers */
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

/* ============================================================
 * features/signup
 * ============================================================ */

describe('features/signup — render', () => {
  it('rend le formulaire avec inputs requis et 4 plans + champ PIN', () => {
    renderSignup(root);
    expect(root.querySelector('#signup-prenom')).toBeTruthy();
    expect(root.querySelector('#signup-nom')).toBeTruthy();
    expect(root.querySelector('#signup-email')).toBeTruthy();
    expect(root.querySelector('#signup-whatsapp')).toBeTruthy();
    expect(root.querySelector('#signup-pin')).toBeTruthy(); /* v13.4.211 */
    expect(root.querySelector('#signup-cgu')).toBeTruthy();
    expect(root.querySelector('#signup-rgpd')).toBeTruthy();
    expect(root.querySelector('#signup-submit')).toBeTruthy();
    expect(root.querySelectorAll('input[name="signup-plan"]').length).toBe(4);
  });

  it('soumet → appelle signup.selfSignupDirect avec valeurs form (v13.4.211)', async () => {
    renderSignup(root);
    (root.querySelector('#signup-prenom') as HTMLInputElement).value = 'Marc';
    (root.querySelector('#signup-nom') as HTMLInputElement).value = 'Dupont';
    (root.querySelector('#signup-email') as HTMLInputElement).value = 'marc@example.com';
    (root.querySelector('#signup-whatsapp') as HTMLInputElement).value = '+33612345678';
    (root.querySelector('#signup-pin') as HTMLInputElement).value = '1234';
    (root.querySelector('#signup-cgu') as HTMLInputElement).checked = true;
    (root.querySelector('#signup-rgpd') as HTMLInputElement).checked = true;

    const form = root.querySelector<HTMLFormElement>('#signup-form')!;
    form.dispatchEvent(new Event('submit'));
    await tick(20);

    expect(signup.selfSignupDirect).toHaveBeenCalledTimes(1);
    const arg = (signup.selfSignupDirect as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.prenom).toBe('Marc');
    expect(arg.nom).toBe('Dupont');
    expect(arg.email).toBe('marc@example.com');
    expect(arg.pin).toBe('1234');
    expect(arg.consent.cgu).toBe(true);
  });

  it('après submit success → navigate chat (login auto, v13.4.211)', async () => {
    renderSignup(root);
    const form = root.querySelector<HTMLFormElement>('#signup-form')!;
    form.dispatchEvent(new Event('submit'));
    await tick(20);
    expect(toast.success).toHaveBeenCalled();
    /* navigate vers chat triggered après setTimeout 500ms */
    await tick(600);
    expect(router.navigate).toHaveBeenCalledWith('chat');
  });

  it('soumet erreur (ok:false) → affiche message erreur', async () => {
    (signup.selfSignupDirect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: 'Email déjà utilisé',
    });
    renderSignup(root);
    const form = root.querySelector<HTMLFormElement>('#signup-form')!;
    form.dispatchEvent(new Event('submit'));
    await tick(20);
    expect(toast.error).toHaveBeenCalled();
    const errEl = root.querySelector('#signup-error');
    expect(errEl?.innerHTML).toContain('Email déjà utilisé');
  });

  it('soumet exception → affiche erreur générique', async () => {
    (signup.selfSignupDirect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    renderSignup(root);
    const form = root.querySelector<HTMLFormElement>('#signup-form')!;
    form.dispatchEvent(new Event('submit'));
    await tick(20);
    expect(toast.error).toHaveBeenCalledWith('boom');
  });

  it('bouton retour login → router.navigate("landing")', () => {
    renderSignup(root);
    const btn = root.querySelector<HTMLButtonElement>('#signup-go-login')!;
    btn.click();
    expect(router.navigate).toHaveBeenCalledWith('landing');
  });

  it('liens CGU + Privacy → router.navigate("legal")', () => {
    renderSignup(root);
    (root.querySelector('#signup-link-cgu') as HTMLAnchorElement).click();
    (root.querySelector('#signup-link-privacy') as HTMLAnchorElement).click();
    expect(router.navigate).toHaveBeenCalledWith('legal');
    expect(router.navigate).toHaveBeenCalledTimes(2);
  });

  it('dispose() puis re-render ne plante pas', () => {
    renderSignup(root);
    disposeSignup();
    expect(() => renderSignup(root)).not.toThrow();
  });
});

/* ============================================================
 * features/signup-approval
 * ============================================================ */

describe('features/signup-approval — render', () => {
  const mockRequest = (overrides: Record<string, unknown> = {}) => ({
    id: 'signup_abc',
    prenom: 'Alice',
    nom: 'Martin',
    email: 'alice@test.com',
    whatsapp: '+33611112222',
    plan: 'pro',
    consent: { cgu: true, rgpd: true, ts: Date.now() },
    otp: 'OTP456',
    inviteLink: 'https://wa.me/33',
    status: 'awaiting_kevin',
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 86400_000,
    ...overrides,
  });

  it('rend état vide quand aucune demande', () => {
    renderSignupApproval(root);
    expect(root.innerHTML).toContain('Aucune demande en attente');
    expect(root.innerHTML).toContain('Aucun historique');
  });

  it('rend cards pending avec actions', () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValueOnce([mockRequest()]);
    renderSignupApproval(root);
    expect(root.innerHTML).toContain('Alice Martin');
    expect(root.innerHTML).toContain('alice@test.com');
    expect(root.querySelector('.signup-approve-client')).toBeTruthy();
    expect(root.querySelector('.signup-approve-family')).toBeTruthy();
    expect(root.querySelector('.signup-reject')).toBeTruthy();
  });

  it('rend cards processed sans actions', () => {
    (signup.listProcessed as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      mockRequest({ status: 'approved' }),
    ]);
    renderSignupApproval(root);
    expect(root.innerHTML).toContain('Alice Martin');
    /* approved status badge */
    expect(root.innerHTML).toContain('Approuvé');
  });

  it('rend différents badges status', () => {
    (signup.listProcessed as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      mockRequest({ id: 'r1', status: 'approved' }),
      mockRequest({ id: 'r2', status: 'rejected', rejectReason: 'spam' }),
      mockRequest({ id: 'r3', status: 'expired' }),
    ]);
    renderSignupApproval(root);
    expect(root.innerHTML).toContain('Approuvé');
    expect(root.innerHTML).toContain('Refusé');
    expect(root.innerHTML).toContain('Expiré');
    expect(root.innerHTML).toContain('spam');
  });

  it('click "Approuver client" → signup.approveSignup({type:client})', async () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValue([mockRequest()]);
    renderSignupApproval(root);
    const btn = root.querySelector<HTMLButtonElement>('.signup-approve-client')!;
    btn.click();
    await tick(20);
    expect(signup.approveSignup).toHaveBeenCalledWith({
      requestId: 'signup_abc',
      type: 'client',
      adminUid: 'kdmc_admin',
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('click "Famille" → signup.approveSignup({type:family})', async () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValue([mockRequest()]);
    renderSignupApproval(root);
    const btn = root.querySelector<HTMLButtonElement>('.signup-approve-family')!;
    btn.click();
    await tick(20);
    expect(signup.approveSignup).toHaveBeenCalledWith({
      requestId: 'signup_abc',
      type: 'family',
      adminUid: 'kdmc_admin',
    });
  });

  it('approveSignup ok=false → toast.error', async () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValue([mockRequest()]);
    (signup.approveSignup as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: 'Token expired',
    });
    renderSignupApproval(root);
    root.querySelector<HTMLButtonElement>('.signup-approve-client')!.click();
    await tick(20);
    expect(toast.error).toHaveBeenCalledWith('Token expired');
  });

  it('click "Refuser" avec prompt OK → signup.rejectSignup', async () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValue([mockRequest()]);
    vi.spyOn(globalThis, 'prompt').mockReturnValueOnce('Profil incomplet');
    renderSignupApproval(root);
    root.querySelector<HTMLButtonElement>('.signup-reject')!.click();
    await tick(20);
    expect(signup.rejectSignup).toHaveBeenCalledWith({
      requestId: 'signup_abc',
      adminUid: 'kdmc_admin',
      reason: 'Profil incomplet',
    });
    expect(toast.success).toHaveBeenCalledWith('Demande rejetée');
  });

  it('click "Refuser" avec prompt cancel → no call', async () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValue([mockRequest()]);
    vi.spyOn(globalThis, 'prompt').mockReturnValueOnce(null);
    renderSignupApproval(root);
    root.querySelector<HTMLButtonElement>('.signup-reject')!.click();
    await tick(20);
    expect(signup.rejectSignup).not.toHaveBeenCalled();
  });

  it('rejectSignup ok=false → toast.error', async () => {
    (signup.listPending as ReturnType<typeof vi.fn>).mockReturnValue([mockRequest()]);
    (signup.rejectSignup as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: 'Reject error',
    });
    vi.spyOn(globalThis, 'prompt').mockReturnValueOnce('Why not');
    renderSignupApproval(root);
    root.querySelector<HTMLButtonElement>('.signup-reject')!.click();
    await tick(20);
    expect(toast.error).toHaveBeenCalledWith('Reject error');
  });

  it('dispose() → re-render ne plante pas', () => {
    renderSignupApproval(root);
    disposeSignupApproval();
    expect(() => renderSignupApproval(root)).not.toThrow();
  });
});

/* ============================================================
 * features/waiting-approval
 * ============================================================ */

describe('features/waiting-approval — render', () => {
  const mockReqInLs = (overrides: Record<string, unknown> = {}) => {
    const req = {
      id: 'signup_xyz',
      prenom: 'Bob',
      nom: 'Tester',
      email: 'b@t.com',
      whatsapp: '+33611',
      plan: 'free',
      consent: { cgu: true, rgpd: true, ts: Date.now() },
      otp: 'OTP789',
      inviteLink: 'https://wa.me/33/?text=test',
      status: 'awaiting_kevin',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 86400_000,
      ...overrides,
    };
    localStorage.setItem('apex_v13_signup_pending_id', req.id);
    localStorage.setItem('apex_v13_signup_requests', JSON.stringify([req]));
    localStorage.setItem('apex_v13_signup_invite_link', req.inviteLink);
    return req;
  };

  it('rend "Aucune demande" si pas de pending id', () => {
    renderWaiting(root);
    expect(root.innerHTML).toContain('Aucune demande en cours');
    expect(root.querySelector('#wa-back')).toBeTruthy();
    disposeWaiting();
  });

  it('bouton wa-back (état vide) → router.navigate("landing")', () => {
    renderWaiting(root);
    root.querySelector<HTMLButtonElement>('#wa-back')!.click();
    expect(router.navigate).toHaveBeenCalledWith('landing');
    disposeWaiting();
  });

  it('rend OTP + boutons quand status awaiting_kevin', () => {
    mockReqInLs({ status: 'awaiting_kevin' });
    renderWaiting(root);
    expect(root.innerHTML).toContain('OTP789');
    expect(root.innerHTML).toContain('Bob Tester');
    expect(root.querySelector('#wa-check')).toBeTruthy();
    expect(root.querySelector('#wa-cancel')).toBeTruthy();
    expect(root.querySelector('#wa-back')).toBeTruthy();
    disposeWaiting();
  });

  it('rend status approved', () => {
    mockReqInLs({ status: 'approved' });
    renderWaiting(root);
    expect(root.innerHTML).toContain('Bienvenue dans Apex');
    disposeWaiting();
  });

  it('rend status rejected avec raison', () => {
    mockReqInLs({ status: 'rejected', rejectReason: 'Doublons détectés' });
    renderWaiting(root);
    expect(root.innerHTML).toContain('Doublons détectés');
    disposeWaiting();
  });

  it('rend status expired', () => {
    mockReqInLs({ status: 'expired' });
    renderWaiting(root);
    expect(root.innerHTML).toContain('demande a expiré');
    disposeWaiting();
  });

  it('click "Vérifier" → toast.info si toujours awaiting', () => {
    mockReqInLs({ status: 'awaiting_kevin' });
    renderWaiting(root);
    root.querySelector<HTMLButtonElement>('#wa-check')!.click();
    expect(toast.info).toHaveBeenCalledWith('Toujours en attente Kevin');
    disposeWaiting();
  });

  it('click "Annuler" → clear ls + navigate signup', () => {
    mockReqInLs();
    renderWaiting(root);
    root.querySelector<HTMLButtonElement>('#wa-cancel')!.click();
    expect(localStorage.getItem('apex_v13_signup_pending_id')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith('signup');
    disposeWaiting();
  });

  it('click "Connexion" (back) → navigate landing', () => {
    mockReqInLs();
    renderWaiting(root);
    root.querySelector<HTMLButtonElement>('#wa-back')!.click();
    expect(router.navigate).toHaveBeenCalledWith('landing');
    disposeWaiting();
  });

  it('dispose() → re-render ne plante pas', () => {
    mockReqInLs();
    renderWaiting(root);
    disposeWaiting();
    expect(() => renderWaiting(root)).not.toThrow();
    disposeWaiting();
  });
});

/* ============================================================
 * features/legal
 * ============================================================ */

describe('features/legal — render', () => {
  beforeEach(() => {
    /* Mock global fetch pour loadLegalDoc */
    globalThis.fetch = vi.fn(async () =>
      new Response('# CGU\n\nConditions générales.', { status: 200 }),
    ) as unknown as typeof fetch;
  });

  it('rend tabs CGU/CGV/Privacy/Cookies/DPA/Mentions/RGPD + content area', async () => {
    renderLegal(root);
    expect(root.querySelectorAll('.ax-legal-tab').length).toBe(7);
    expect(root.querySelector('#ax-legal-content')).toBeTruthy();
    /* Wait for async loadLegalDoc */
    await tick(50);
  });

  it('click tab change → renderTabContent appelé', async () => {
    renderLegal(root);
    await tick(50);
    const cguTab = Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab')).find(
      (b) => b.dataset['tab'] === 'cgv',
    );
    cguTab?.click();
    await tick(50);
    /* fetch called for cgv file */
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('tab "rgpd" → render widget RGPD avec boutons', async () => {
    renderLegal(root);
    await tick(50);
    const rgpdTab = Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab')).find(
      (b) => b.dataset['tab'] === 'rgpd',
    );
    rgpdTab?.click();
    await tick(20);
    expect(root.querySelector('#ax-rgpd-export')).toBeTruthy();
    expect(root.querySelector('#ax-rgpd-delete')).toBeTruthy();
    expect(root.querySelector('#ax-rgpd-cookies-customize')).toBeTruthy();
    expect(rgpd.getProcessingRegistry).toHaveBeenCalled();
  });

  it('RGPD export sans uid → alert', async () => {
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    renderLegal(root);
    await tick(50);
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab'))
      .find((b) => b.dataset['tab'] === 'rgpd')
      ?.click();
    await tick(20);
    root.querySelector<HTMLButtonElement>('#ax-rgpd-export')!.click();
    await tick(20);
    expect(alertSpy).toHaveBeenCalledWith('Tu dois être connecté pour exporter tes données.');
  });

  it('RGPD export avec uid → portableExport + downloadBlob', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'uid_kevin' }));
    /* Stub URL.createObjectURL/revokeObjectURL */
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();

    renderLegal(root);
    await tick(50);
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab'))
      .find((b) => b.dataset['tab'] === 'rgpd')
      ?.click();
    await tick(20);
    root.querySelector<HTMLButtonElement>('#ax-rgpd-export')!.click();
    await tick(20);
    expect(rgpd.portableExport).toHaveBeenCalledWith('uid_kevin');

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it('RGPD delete confirmation false → no call', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'uid_kevin' }));
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false);
    renderLegal(root);
    await tick(50);
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab'))
      .find((b) => b.dataset['tab'] === 'rgpd')
      ?.click();
    await tick(20);
    root.querySelector<HTMLButtonElement>('#ax-rgpd-delete')!.click();
    await tick(20);
    expect(rgpd.deleteUserData).not.toHaveBeenCalled();
  });

  it('RGPD opt-out IA training avec uid → setOptOut', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'uid_kevin' }));
    vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    renderLegal(root);
    await tick(50);
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab'))
      .find((b) => b.dataset['tab'] === 'rgpd')
      ?.click();
    await tick(20);
    root.querySelector<HTMLButtonElement>('#ax-rgpd-optout-training')!.click();
    expect(rgpd.optOutAITraining).toHaveBeenCalledWith('uid_kevin', true);
  });

  it('RGPD opt-out automation avec uid → setOptOut', async () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'uid_kevin' }));
    vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    renderLegal(root);
    await tick(50);
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab'))
      .find((b) => b.dataset['tab'] === 'rgpd')
      ?.click();
    await tick(20);
    root.querySelector<HTMLButtonElement>('#ax-rgpd-optout-automation')!.click();
    expect(rgpd.optOutAutomation).toHaveBeenCalledWith('uid_kevin', true);
  });

  it('RGPD cookies customize → setConsent', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    renderLegal(root);
    await tick(50);
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ax-legal-tab'))
      .find((b) => b.dataset['tab'] === 'rgpd')
      ?.click();
    await tick(20);
    root.querySelector<HTMLButtonElement>('#ax-rgpd-cookies-customize')!.click();
    expect(rgpd.setConsent).toHaveBeenCalled();
  });

  it('fetch fail → fallback markdown affiché', async () => {
    /* Reset hash : tests précédents ont pu set #legal/rgpd → il faut forcer cgu pour fetch-fail */
    try { history.replaceState(null, '', '#legal/cgu'); } catch { /* ignore */ }
    globalThis.fetch = vi.fn(async () => { throw new Error('net'); }) as unknown as typeof fetch;
    renderLegal(root);
    await tick(50);
    expect(root.querySelector('#ax-legal-content')?.innerHTML).toContain('indisponible');
  });

  it('dispose() → re-render ne plante pas', () => {
    renderLegal(root);
    disposeLegal();
    expect(() => renderLegal(root)).not.toThrow();
  });
});

/* ============================================================
 * features/multi-source-history
 * ============================================================ */

describe('features/multi-source-history — render', () => {
  it('non-admin → rend "Accès admin uniquement"', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockImplementation(() => false);
    await renderMSH(root);
    expect(root.innerHTML).toContain('Accès admin uniquement');
  });

  it('admin sans history → rend stats vides + état vide', async () => {
    await renderMSH(root);
    expect(root.innerHTML).toContain('Multi-Source Extraction History');
    expect(root.innerHTML).toContain('Aucune source analysée');
    expect(root.querySelector('#ax-msh-refresh')).toBeTruthy();
    expect(root.querySelector('#ax-msh-clear')).toBeTruthy();
    expect(root.querySelector('#ax-msh-refresh-services')).toBeTruthy();
  });

  it('admin avec history → rend cards + items', async () => {
    (multiSourceAnalyze.getHistory as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      {
        ts: Date.now(),
        source_type: 'image',
        source_preview: 'preview text',
        extracted_count: 2,
        configured_count: 2,
        tested_count: 2,
        tested_ok_count: 1,
        items: [
          {
            type: 'credential',
            service: 'anthropic',
            value: 'sk-test123',
            confidence: 0.95,
            test_result: { ok: true, latency_ms: 120 },
          },
          {
            type: 'site',
            service: 'github',
            value: 'https://github.com',
            confidence: 0.8,
            test_result: { ok: false, error: 'timeout' },
            forbidden: true,
          },
        ],
        errors: ['1 element forbidden'],
      },
    ]);
    (multiSourceAnalyze.getStats as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      sources_total: 1,
      items_total: 2,
      items_configured: 2,
      items_tested_ok: 1,
    });
    (studyService.listKnown as ReturnType<typeof vi.fn>).mockReturnValueOnce([{ name: 'svc1' }]);

    await renderMSH(root);
    expect(root.innerHTML).toContain('IMAGE');
    expect(root.innerHTML).toContain('anthropic');
    expect(root.innerHTML).toContain('FORBIDDEN');
    expect(root.innerHTML).toContain('1 element forbidden');
    expect(root.querySelector('.ax-msh-reanalyze')).toBeTruthy();
  });

  it('click refresh → re-render', async () => {
    await renderMSH(root);
    const initial = (multiSourceAnalyze.getHistory as ReturnType<typeof vi.fn>).mock.calls.length;
    root.querySelector<HTMLButtonElement>('#ax-msh-refresh')!.click();
    await tick(20);
    expect(
      (multiSourceAnalyze.getHistory as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(initial);
  });

  it('click refresh-services → studyService.refreshAll + toast', async () => {
    await renderMSH(root);
    root.querySelector<HTMLButtonElement>('#ax-msh-refresh-services')!.click();
    await tick(30);
    expect(studyService.refreshAll).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('refreshAll fail → toast.error', async () => {
    (studyService.refreshAll as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('refresh err'));
    await renderMSH(root);
    root.querySelector<HTMLButtonElement>('#ax-msh-refresh-services')!.click();
    await tick(30);
    expect(toast.error).toHaveBeenCalled();
  });

  it('refreshAll avec errors → toast.warn', async () => {
    (studyService.refreshAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      refreshed: 2,
      errors: ['svc1 fail'],
    });
    await renderMSH(root);
    root.querySelector<HTMLButtonElement>('#ax-msh-refresh-services')!.click();
    await tick(30);
    expect(toast.warn).toHaveBeenCalled();
  });

  it('click clear avec confirm true → vide ls + toast', async () => {
    localStorage.setItem('ax_multi_source_history', '[1,2,3]');
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(true);
    await renderMSH(root);
    root.querySelector<HTMLButtonElement>('#ax-msh-clear')!.click();
    await tick(20);
    expect(localStorage.getItem('ax_multi_source_history')).toBeNull();
    expect(toast.success).toHaveBeenCalled();
  });

  it('click clear avec confirm false → no clear', async () => {
    localStorage.setItem('ax_multi_source_history', '[1,2,3]');
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false);
    await renderMSH(root);
    root.querySelector<HTMLButtonElement>('#ax-msh-clear')!.click();
    await tick(20);
    expect(localStorage.getItem('ax_multi_source_history')).toBe('[1,2,3]');
  });

  it('click reanalyze → multiSourceAnalyze.installAll', async () => {
    (multiSourceAnalyze.getHistory as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        ts: Date.now(),
        source_type: 'text',
        source_preview: 'preview',
        extracted_count: 1,
        configured_count: 1,
        tested_count: 1,
        tested_ok_count: 1,
        items: [],
        errors: [],
      },
    ]);
    await renderMSH(root);
    root.querySelector<HTMLButtonElement>('.ax-msh-reanalyze')!.click();
    await tick(30);
    expect(multiSourceAnalyze.installAll).toHaveBeenCalled();
  });

  it('dispose() → re-render ne plante pas', async () => {
    await renderMSH(root);
    disposeMSH();
    await expect(renderMSH(root)).resolves.not.toThrow();
  });
});

/* ============================================================
 * features/innovation
 * ============================================================ */

describe('features/innovation — render', () => {
  it('rend stats + boutons + état vide quand pas d\'updates', async () => {
    await renderInnovation(root);
    expect(root.innerHTML).toContain('Innovation Watch');
    expect(root.querySelector('#ax-inno-scan')).toBeTruthy();
    expect(root.querySelector('#ax-inno-refresh')).toBeTruthy();
    expect(root.querySelector('#ax-inno-reset')).toBeTruthy();
    expect(root.innerHTML).toContain('Aucune update en attente');
  });

  it('rend tableau d\'updates groupés par catégorie', async () => {
    (innovationWatch.getUpdates as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      {
        id: 'upd1',
        name: 'react',
        category: 'lib-npm',
        currentVersion: '18.0.0',
        latestVersion: '19.0.0',
        recommendation: 'upgrade-asap',
        estimatedGain: { perf: 30, cost: 10, capabilities: 5, bundleSize: 5 },
        details: 'big release',
        status: 'pending',
      },
      {
        id: 'upd2',
        name: 'claude-4.6',
        category: 'ai-provider',
        currentVersion: '4.5',
        latestVersion: '4.6',
        recommendation: 'upgrade-soon',
        estimatedGain: undefined,
        status: 'pending',
      },
      {
        id: 'upd3',
        name: 'react-router',
        category: 'lib-npm',
        recommendation: 'breaking-changes',
        status: 'pending',
      },
    ]);
    await renderInnovation(root);
    expect(root.innerHTML).toContain('react');
    expect(root.innerHTML).toContain('Lib npm (2)');
    expect(root.innerHTML).toContain('IA Provider (1)');
    expect(root.querySelectorAll('.ax-inno-apply').length).toBe(3);
    expect(root.querySelectorAll('.ax-inno-skip').length).toBe(3);
  });

  it('click "Scanner maintenant" → runScan + toast.success', async () => {
    await renderInnovation(root);
    root.querySelector<HTMLButtonElement>('#ax-inno-scan')!.click();
    await tick(30);
    expect(innovationWatch.runScan).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('runScan fail → toast.error', async () => {
    (innovationWatch.runScan as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('scan boom'));
    await renderInnovation(root);
    root.querySelector<HTMLButtonElement>('#ax-inno-scan')!.click();
    await tick(30);
    expect(toast.error).toHaveBeenCalled();
  });

  it('click "Rafraîchir" → re-render', async () => {
    await renderInnovation(root);
    const initial = (innovationWatch.getUpdates as ReturnType<typeof vi.fn>).mock.calls.length;
    root.querySelector<HTMLButtonElement>('#ax-inno-refresh')!.click();
    await tick(30);
    expect(
      (innovationWatch.getUpdates as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(initial);
  });

  it('click "Reset" avec confirm true → reset + toast', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(true);
    await renderInnovation(root);
    root.querySelector<HTMLButtonElement>('#ax-inno-reset')!.click();
    await tick(30);
    expect(innovationWatch.reset).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('click "Reset" avec confirm false → pas de reset', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false);
    await renderInnovation(root);
    root.querySelector<HTMLButtonElement>('#ax-inno-reset')!.click();
    await tick(30);
    expect(innovationWatch.reset).not.toHaveBeenCalled();
  });

  it('click apply → markUpdate(id, applied)', async () => {
    (innovationWatch.getUpdates as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'u-apply',
        name: 'lib-x',
        category: 'lib-npm',
        recommendation: 'upgrade-asap',
        status: 'pending',
      },
    ]);
    await renderInnovation(root);
    root.querySelector<HTMLButtonElement>('.ax-inno-apply')!.click();
    await tick(30);
    expect(innovationWatch.markUpdate).toHaveBeenCalledWith('u-apply', 'applied');
  });

  it('click skip → markUpdate(id, skipped)', async () => {
    (innovationWatch.getUpdates as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'u-skip',
        name: 'lib-y',
        category: 'lib-npm',
        recommendation: 'monitor',
        status: 'pending',
      },
    ]);
    await renderInnovation(root);
    root.querySelector<HTMLButtonElement>('.ax-inno-skip')!.click();
    await tick(30);
    expect(innovationWatch.markUpdate).toHaveBeenCalledWith('u-skip', 'skipped');
  });

  it('rend lastScan label "jamais" si stats.lastScan==0', async () => {
    await renderInnovation(root);
    expect(root.innerHTML).toContain('jamais');
  });

  it('rend lastScan formaté si stats.lastScan > 0', async () => {
    (innovationWatch.getStats as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      lastScan: Date.parse('2026-05-01T12:00:00Z'),
      totalUpdatesDetected: 5,
      lastWeek: 2,
      appliedCount: 1,
      skippedCount: 1,
    });
    await renderInnovation(root);
    /* doit contenir une partie de la date formatée */
    expect(root.innerHTML).not.toContain('jamais');
  });

  it('dispose() → re-render ne plante pas', async () => {
    await renderInnovation(root);
    disposeInnovation();
    await expect(renderInnovation(root)).resolves.not.toThrow();
  });
});
