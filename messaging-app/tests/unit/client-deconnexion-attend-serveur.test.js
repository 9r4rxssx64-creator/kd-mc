/**
 * Mesuré sur WebKit iPhone (robot, 16.10.2026) : « Te déconnecter » rechargeait la page sans attendre la requête de
 * déconnexion du serveur ; Safari l'annulait et le jeton restait valable. Désormais on attend la réponse (au plus
 * 1,5 s), puis on recharge ; le serveur injoignable ne bloque jamais la déconnexion locale.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadDefs } from './client-extract.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
function charger(fetchImpl) {
  const journal = [];
  const location = { reload: vi.fn(() => journal.push('reload')) };
  const K = { user: { id: 'u1' }, token: 'tok', conversations: [], messages: {}, view: 'chats' };
  const { K: KK } = loadDefs(['K.logout = function(){'], {
    K, PERSIST_PREFIX: 'apex_chat_', confirm: () => true, location, API_BASE: 'https://api.test', _safeCatch: () => {},
    fetch: vi.fn((...a) => { journal.push('fetch'); return fetchImpl(...a); }),
    idbDel: vi.fn(async () => {}),
  });
  K._keyStoreDelete = async () => {};
  return { K: KK, journal, location };
}
afterEach(() => { vi.useRealTimers(); });

describe('déconnexion : le serveur d\'abord, le rechargement ensuite', () => {
  it('la page ne se recharge PAS tant que le serveur n\'a pas répondu', async () => {
    let fini; const attente = new Promise((r) => { fini = r; });
    const { K, journal, location } = charger(() => attente);
    K.logout();
    await tick(50);
    expect(journal).toContain('fetch');
    expect(location.reload).not.toHaveBeenCalled();
    fini({ ok: true });
    await tick(50);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(journal.indexOf('reload')).toBeGreaterThan(journal.indexOf('fetch'));
  });
  it('serveur muet : rechargement quand même au bout de 1,5 s (jamais coincé)', async () => {
    vi.useFakeTimers();
    const { K, location } = charger(() => new Promise(() => {}));
    K.logout();
    await vi.advanceTimersByTimeAsync(1400);
    expect(location.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
  it('serveur en erreur ou hors ligne : déconnexion locale et rechargement sans attendre davantage', async () => {
    const { K, location } = charger(() => Promise.reject(new Error('offline')));
    K.logout();
    await tick(50);
    expect(K.token).toBeNull();
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
  it('la requête n\'est plus « keepalive » (Safari l\'annule au rechargement)', async () => {
    const seen = [];
    const { K } = charger((u, o) => { seen.push(o); return Promise.resolve({}); });
    K.logout(); await tick(50);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].keepalive).toBeUndefined();
  });
});
