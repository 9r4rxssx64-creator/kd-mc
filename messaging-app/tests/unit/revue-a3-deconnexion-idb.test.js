/**
 * Revue 08.10.2026 — A3 (P1) : K.logout effaçait les clés apex_chat_* du
 * localStorage mais PAS l'ombre IndexedDB écrite par ls() (idbSet) ; au démarrage,
 * idbGet('user') / idbGet('token') restauraient la session → « Te déconnecter »
 * ne déconnectait pas vraiment (session rejouée au prochain lancement).
 *
 * Prouvé sur le VRAI code de la page (extrait d'index.html, pas recopié) :
 *   1. K.logout retire `user` et `token` de l'ombre IndexedDB AVANT de recharger ;
 *   2. idbDel (nouvelle fonction) supprime bien la clé demandée et rien d'autre ;
 *   3. si IndexedDB ne répond pas, la page recharge quand même (plafond 1,5 s).
 * Sabotage : retirer l'appel idbDel de K.logout → test 1 rouge.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadDefs, extractDef, readIndex } from './client-extract.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function chargerLogout(idbDel) {
  const journal = [];
  const location = { reload: vi.fn(() => journal.push('reload')) };
  const K = { user: { id: 'u1' }, token: 'tok', conversations: [1], messages: { a: 1 }, view: 'chats' };
  const { K: KK } = loadDefs(['K.logout = function(){'], {
    K, PERSIST_PREFIX: 'apex_chat_', confirm: () => true, location,
    idbDel: vi.fn(async (k) => { journal.push('idbDel:' + k); return idbDel ? idbDel(k) : undefined; }),
  });
  return { K: KK, journal, location };
}

afterEach(() => { vi.useRealTimers(); try { localStorage.clear(); } catch (_) {} });

describe('Déconnexion : l\'ombre IndexedDB est effacée (revue 08.10.2026, A3)', () => {
  it('1. K.logout retire user + token de l\'ombre IndexedDB, puis recharge (une seule fois)', async () => {
    localStorage.setItem('apex_chat_user', '{"id":"u1"}');
    localStorage.setItem('apex_chat_token', '"tok"');
    localStorage.setItem('apex_chat_theme', '"dark"');
    const { K, journal, location } = chargerLogout();
    K.logout();
    await tick(); await tick();
    expect(journal.filter((e) => e.startsWith('idbDel:')).sort()).toEqual(['idbDel:token', 'idbDel:user']);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(journal.indexOf('reload')).toBeGreaterThan(journal.indexOf('idbDel:token'));   // effacé AVANT le rechargement
    expect(K.user).toBeNull();
    expect(K.token).toBeNull();
    expect(localStorage.getItem('apex_chat_user')).toBeNull();
    expect(localStorage.getItem('apex_chat_token')).toBeNull();
    expect(localStorage.getItem('apex_chat_theme')).toBe('"dark"');   // réglages conservés, comme avant
  });

  it('2. idbDel (vrai code de la page) supprime la clé demandée, et rien d\'autre', async () => {
    const store = new Map([['user', { id: 'u1' }], ['token', 'tok'], ['contacts', [1, 2]]]);
    const fauxDb = { transaction: () => {
      const tx = { objectStore: () => ({ delete: (k) => store.delete(k) }) };
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
      return tx;
    } };
    const src = extractDef(readIndex(), { m: 'async function idbDel(key){', end: '\n}\n' });
    // eslint-disable-next-line no-new-func
    const idbDel = new Function('idbOpen', '_idbNoteError', src + '\nreturn idbDel;')(async () => fauxDb, () => {});
    await idbDel('user');
    expect(store.has('user')).toBe(false);
    expect(store.get('token')).toBe('tok');
    expect(store.get('contacts')).toEqual([1, 2]);
  });

  it('3. IndexedDB muette → la page recharge quand même après le plafond (jamais bloquée)', async () => {
    vi.useFakeTimers();
    const { K, location } = chargerLogout(() => new Promise(() => {}));   // ne répond jamais
    K.logout();
    expect(location.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
});
