/**
 * Mesuré en vrai navigateur (16.10.2026) : la mise à jour automatique recharge la page et ramenait à la liste.
 * Désormais la conversation ouverte est notée avant le rechargement, puis rouverte (2 min au plus).
 * Le test exécute le VRAI code de la page (extrait d'index.html), pas une copie.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
function chargerReouverture(K) {
  const src = extractDef(html, 'K._reopenAfterUpdate = function(tries){', '\n  };');
  // eslint-disable-next-line no-new-func
  new Function('K', '_safeCatch', 'localStorage', 'setTimeout', src)(K, () => {}, localStorage, (f) => 0);
  return K._reopenAfterUpdate;
}
function chargerSafeReload(K, reloads) {
  const src = extractDef(html, 'window._apexSafeReload = function(doReload, reason){', '\n};');
  const w = { _apexReloadBlocker: () => null };
  // eslint-disable-next-line no-new-func
  new Function('window', 'K', 'document', 'localStorage', 'console', 'setTimeout', src)(w, K, { getElementById: () => null }, localStorage, { log() {} }, () => 0);
  return (reason) => w._apexSafeReload(() => reloads.push(reason), reason);
}
const pret = (o = {}) => ({ user: { id: 'u' }, token: 't', view: 'chats', openConv: vi.fn(), ...o });
beforeEach(() => { try { localStorage.clear(); } catch (_) {} });

describe('rouvrir la conversation après une mise à jour', () => {
  it('avant le rechargement, la conversation ouverte est notée', () => {
    const reloads = []; const K = pret({ view: 'chat', viewData: { id: 'conv_1' } });
    chargerSafeReload(K, reloads)('admin-force');
    expect(reloads).toEqual(['admin-force']);
    expect(JSON.parse(localStorage.getItem('apex_chat_reopen')).id).toBe('conv_1');
  });
  it('hors conversation (liste), rien n\'est noté', () => {
    const reloads = []; const K = pret({ view: 'chats' });
    chargerSafeReload(K, reloads)('sw-updated');
    expect(localStorage.getItem('apex_chat_reopen')).toBeNull();
  });
  it('au redémarrage, la conversation notée (< 2 min) est rouverte, une seule fois', () => {
    localStorage.setItem('apex_chat_reopen', JSON.stringify({ id: 'conv_1', ts: Date.now() - 5000 }));
    const K = pret(); const f = chargerReouverture(K);
    expect(f()).toBe(true);
    expect(K.openConv).toHaveBeenCalledWith('conv_1');
    expect(localStorage.getItem('apex_chat_reopen')).toBeNull();
    expect(f()).toBe(false);
  });
  it('une note trop vieille (> 2 min) ou douteuse est ignorée et effacée', () => {
    localStorage.setItem('apex_chat_reopen', JSON.stringify({ id: 'conv_1', ts: Date.now() - 600000 }));
    const K = pret(); expect(chargerReouverture(K)()).toBe(false); expect(K.openConv).not.toHaveBeenCalled(); expect(localStorage.getItem('apex_chat_reopen')).toBeNull();
    localStorage.setItem('apex_chat_reopen', JSON.stringify({ id: "x');alert(1)//", ts: Date.now() }));
    expect(chargerReouverture(pret())()).toBe(false);
  });
  it('si une conversation est déjà ouverte (lien de notification), on ne la remplace pas', () => {
    localStorage.setItem('apex_chat_reopen', JSON.stringify({ id: 'conv_1', ts: Date.now() }));
    const K = pret({ view: 'chat' }); expect(chargerReouverture(K)()).toBe(false); expect(K.openConv).not.toHaveBeenCalled();
  });
  it('branchée au démarrage', () => { expect(html).toContain('K._reopenAfterUpdate();'); });
});
