/**
 * Tests services/notification-actions (Kevin v13.4.208 "Continu sans s'arrêter").
 *
 * Couvre resolveNotificationRoute + handleNotificationClick :
 * - Mapping action/tag/source → route
 * - URL absolue → extract hash OU null
 * - Hash route → strip #
 * - Fallback chat
 * - router.navigate vs location.hash fallback
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { navigate: vi.fn() },
}));

vi.mock('../../core/router.js', () => ({ router: mockRouter }));

import {
  handleNotificationClick,
  notificationActions,
  resolveNotificationRoute,
} from '../../services/integrations/notification-actions.js';

describe('services/notification-actions — resolveNotificationRoute', () => {
  it('input null → null', () => {
    expect(resolveNotificationRoute(null)).toBeNull();
  });

  it('input undefined → null', () => {
    expect(resolveNotificationRoute(undefined)).toBeNull();
  });

  it('input string vide → null', () => {
    expect(resolveNotificationRoute('')).toBeNull();
  });

  it('input whitespace only → null', () => {
    expect(resolveNotificationRoute('   ')).toBeNull();
  });

  it('hash route #admin → strip # → "admin"', () => {
    expect(resolveNotificationRoute('#admin')).toBe('admin');
  });

  it('hash route #/admin → strip #/ → "admin"', () => {
    expect(resolveNotificationRoute('#/admin')).toBe('admin');
  });

  it('URL absolue avec hash → extract hash', () => {
    expect(resolveNotificationRoute('https://apex.com/#/credentials')).toBe('credentials');
  });

  it('URL absolue sans hash → null (SW openWindow)', () => {
    expect(resolveNotificationRoute('https://google.com')).toBeNull();
  });

  it('URL invalide → null', () => {
    /* "https://" + chars qui crashent URL parser */
    expect(resolveNotificationRoute('https://[invalid')).toBeNull();
  });

  it('mapping credentials_missing → admin-credentials-status', () => {
    expect(resolveNotificationRoute('credentials_missing')).toBe('admin-credentials-status');
  });

  it('mapping kebab-case alias credentials-missing', () => {
    expect(resolveNotificationRoute('credentials-missing')).toBe('admin-credentials-status');
  });

  it('mapping auto-restore-watch → admin-credentials-status', () => {
    expect(resolveNotificationRoute('auto-restore-watch')).toBe('admin-credentials-status');
  });

  it('mapping auto_reset → self-diag', () => {
    expect(resolveNotificationRoute('auto_reset')).toBe('self-diag');
  });

  it('mapping ai-providers-health → smart-router', () => {
    expect(resolveNotificationRoute('ai-providers-health')).toBe('smart-router');
  });

  it('mapping backup-watch → admin-backup', () => {
    expect(resolveNotificationRoute('backup-watch')).toBe('admin-backup');
  });

  it('mapping vault-watch → vault', () => {
    expect(resolveNotificationRoute('vault-watch')).toBe('vault');
  });

  it('mapping memory-watch → knowledge', () => {
    expect(resolveNotificationRoute('memory-watch')).toBe('knowledge');
  });

  it('mapping handoff_received → admin', () => {
    expect(resolveNotificationRoute('handoff_received')).toBe('admin');
  });

  it('mapping iot-providers → iot-providers (self)', () => {
    expect(resolveNotificationRoute('iot-providers')).toBe('iot-providers');
  });

  it('mapping signup_otp → signup-approval', () => {
    expect(resolveNotificationRoute('signup_otp')).toBe('signup-approval');
  });

  it('case-insensitive fallback (UPPERCASE_INPUT)', () => {
    expect(resolveNotificationRoute('CREDENTIALS_MISSING')).toBe('admin-credentials-status');
  });

  it('mapping default → chat', () => {
    expect(resolveNotificationRoute('default')).toBe('chat');
  });

  it('unknown string → retourne tel quel (assume route)', () => {
    expect(resolveNotificationRoute('my-custom-route')).toBe('my-custom-route');
  });
});

describe('services/notification-actions — handleNotificationClick', () => {
  beforeEach(() => {
    mockRouter.navigate.mockReset();
    location.hash = '';
  });

  afterEach(() => {
    location.hash = '';
    vi.clearAllMocks();
  });

  it('url valide → router.navigate appelé + retour true', () => {
    const result = handleNotificationClick({ url: '#admin' });
    expect(result).toBe(true);
    expect(mockRouter.navigate).toHaveBeenCalledWith('admin');
  });

  it('tag fallback si url absent', () => {
    const result = handleNotificationClick({ tag: 'credentials_missing' });
    expect(result).toBe(true);
    expect(mockRouter.navigate).toHaveBeenCalledWith('admin-credentials-status');
  });

  it('source fallback si url+tag absents', () => {
    const result = handleNotificationClick({ source: 'auto-restore-watch' });
    expect(result).toBe(true);
    expect(mockRouter.navigate).toHaveBeenCalledWith('admin-credentials-status');
  });

  it('candidates vide → fallback chat + retour false', () => {
    const result = handleNotificationClick({});
    expect(result).toBe(false);
    /* router.navigate appelé avec 'chat' en fallback */
    expect(mockRouter.navigate).toHaveBeenCalledWith('chat');
  });

  it('router.navigate throw → fallback location.hash', () => {
    mockRouter.navigate.mockImplementationOnce(() => {
      throw new Error('route not found');
    });
    const result = handleNotificationClick({ url: '#admin' });
    expect(result).toBe(true);
    expect(location.hash).toBe('#admin');
  });

  it('url null + tag null + source null → fallback chat', () => {
    const result = handleNotificationClick({ url: null, tag: null, source: null });
    expect(result).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith('chat');
  });

  it('priorité url > tag > source', () => {
    handleNotificationClick({ url: '#chat', tag: 'credentials_missing', source: 'auto-restore-watch' });
    /* url '#chat' → resolves to 'chat' → router.navigate('chat') */
    expect(mockRouter.navigate).toHaveBeenCalledWith('chat');
  });

  it('si url ne resolve pas mais tag oui → utilise tag', () => {
    handleNotificationClick({ url: 'https://google.com', tag: 'credentials_missing' });
    expect(mockRouter.navigate).toHaveBeenCalledWith('admin-credentials-status');
  });

  it('fallback chat avec router.navigate fail aussi → location.hash', () => {
    mockRouter.navigate.mockImplementationOnce(() => { throw new Error('fail'); });
    handleNotificationClick({});
    /* Fallback chat avec navigate fail → location.hash */
    expect(location.hash).toBe('#chat');
  });
});

describe('services/notification-actions — namespace', () => {
  it('expose resolveRoute + handleClick', () => {
    expect(notificationActions.resolveRoute).toBeDefined();
    expect(notificationActions.handleClick).toBeDefined();
  });
});
