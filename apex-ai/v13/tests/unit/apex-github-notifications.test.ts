/**
 * v13.4.208 — Tests régression apex-github-notifications.
 *
 * Service v13.4.203 introduit pour Kevin "arrête les mails GitHub" :
 * nettoie inbox GitHub Actions automatiquement (sentinelle 6h + 2 tools IA).
 *
 * Tests :
 *  - Singleton exporté correctement
 *  - Guard admin sur toutes méthodes
 *  - Gère absence vault token gracefully
 *  - Structure CleanResult conforme TypeScript
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apexGithubNotifications } from '../../services/integrations/apex-github-notifications.js';

vi.mock('../../services/auth/auth.js', () => ({
  auth: {
    isAdminSync: vi.fn(() => false), /* default non-admin */
  },
}));

vi.mock('../../services/vault/vault.js', () => ({
  vault: {
    readKey: vi.fn(async () => ''), /* default no token */
  },
}));

describe('apex-github-notifications (v13.4.203)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports singleton avec toutes les méthodes', () => {
    expect(apexGithubNotifications).toBeDefined();
    expect(typeof apexGithubNotifications.listUnread).toBe('function');
    expect(typeof apexGithubNotifications.markAllRead).toBe('function');
    expect(typeof apexGithubNotifications.unsubscribeThread).toBe('function');
    expect(typeof apexGithubNotifications.muteRepo).toBe('function');
    expect(typeof apexGithubNotifications.cleanActionsNotifications).toBe('function');
  });

  it('listUnread refuse non-admin', async () => {
    const r = await apexGithubNotifications.listUnread();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only');
    expect(r.total).toBe(0);
    expect(r.actions_thread_ids).toEqual([]);
  });

  it('markAllRead refuse non-admin', async () => {
    const r = await apexGithubNotifications.markAllRead();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only');
  });

  it('muteRepo refuse non-admin', async () => {
    const r = await apexGithubNotifications.muteRepo();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only');
  });

  it('cleanActionsNotifications refuse non-admin', async () => {
    const r = await apexGithubNotifications.cleanActionsNotifications();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only');
  });

  it('unsubscribeThread retourne {ok:false} si non-admin', async () => {
    const r = await apexGithubNotifications.unsubscribeThread('thread123');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });

  it('cleanActionsNotifications gère absence token gracefully (admin mais no token)', async () => {
    const { auth } = await import('../../services/auth/auth.js');
    const { vault } = await import('../../services/vault/vault.js');
    vi.mocked(auth.isAdminSync).mockReturnValue(true);
    vi.mocked(vault.readKey).mockResolvedValue('');
    const r = await apexGithubNotifications.cleanActionsNotifications();
    expect(r.ok).toBe(false);
    /* Peut retourner 'no_github_token_in_vault' (listUnread guard) ou 'http_0' (fetch fail) */
    expect(r.error).toBeDefined();
    expect(typeof r.error).toBe('string');
  });
});
