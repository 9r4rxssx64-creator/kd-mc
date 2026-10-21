/**
 * « Rémi m'a envoyé un message, je ne reçois rien » (Kevin 21.10.2026). Robot temps-reel-apex (2 téléphones, vrai domaine), run 39617501908 : B → A arrive en 1 s (conversation ouverte),
 * mais A → B n'arrive PAS chez B en 20 s : B ne connaît pas encore la conversation neuve, et la liste ne se rafraîchissait que toutes les 3 minutes (la connexion en direct est par conversation OUVERTE).
 * Sans dépasser le budget de requêtes (≤ 100 /h, garde Lot E1) : le battement (75 s, app visible) reçoit du serveur « du nouveau pour toi » ; l'app ne relance la liste que si ça a changé.
 * Le test exécute le VRAI code de la page (extrait d'index.html).
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
function monter(vue = 'chats') {
  const K = { view: vue, _refreshConvs: vi.fn(), _fetchContacts: vi.fn() };
  const toasts = [];
  const src = extractDef(html, 'K._applyPulse = function(r){');
  // eslint-disable-next-line no-new-func
  new Function('K', 'toast', '_safeCatch', src)(K, (m) => toasts.push(m), () => {});
  return { K, toasts };
}

describe('signal « du nouveau pour toi » porté par le battement', () => {
  it('le 1er signal sert de repère : aucun rafraîchissement', () => {
    const { K } = monter();
    expect(K._applyPulse({ ok: true, convs_ts: 100, convs_n: 2 })).toBe(false);
    expect(K._refreshConvs).not.toHaveBeenCalled();
  });
  it('rien de nouveau : rien ne se relance (aucune requête gaspillée)', () => {
    const { K } = monter();
    K._applyPulse({ convs_ts: 100, convs_n: 2 }); K._applyPulse({ convs_ts: 100, convs_n: 2 });
    expect(K._refreshConvs).not.toHaveBeenCalled();
  });
  it('un message récent OU une conversation neuve relance la liste', () => {
    const a = monter(); a.K._applyPulse({ convs_ts: 100, convs_n: 2 }); a.K._applyPulse({ convs_ts: 250, convs_n: 2 });
    expect(a.K._refreshConvs).toHaveBeenCalledTimes(1);
    const b = monter(); b.K._applyPulse({ convs_ts: 100, convs_n: 2 }); b.K._applyPulse({ convs_ts: 100, convs_n: 3 });
    expect(b.K._refreshConvs).toHaveBeenCalledTimes(1);
  });
  it('admin : une nouvelle inscription prévient (bandeau) et recharge l\'annuaire s\'il est ouvert', () => {
    const ouvert = monter('contacts'); ouvert.K._applyPulse({ convs_ts: 1, convs_n: 1, users_n: 7 }); ouvert.K._applyPulse({ convs_ts: 1, convs_n: 1, users_n: 8 });
    expect(ouvert.K._fetchContacts).toHaveBeenCalledTimes(1); expect(ouvert.toasts.join()).toMatch(/Nouvelle inscription/);
    const ferme = monter('chats'); ferme.K._applyPulse({ convs_ts: 1, convs_n: 1, users_n: 7 }); ferme.K._applyPulse({ convs_ts: 1, convs_n: 1, users_n: 8 });
    expect(ferme.K._fetchContacts).not.toHaveBeenCalled(); expect(ferme.toasts.join()).toMatch(/Nouvelle inscription/);
  });
  it('réponse sans signal (ancien serveur, erreur) : rien ne casse', () => {
    const { K } = monter();
    expect(K._applyPulse(null)).toBe(false); expect(K._applyPulse({ ok: true })).toBe(false);
  });
});

describe('le battement porte le signal, dans le budget', () => {
  it('le battement lit la réponse du serveur, toutes les 75 s (plus 3 min)', () => {
    expect(html).toMatch(/_apexPoll\('heartbeat', 75 \* 1000, \(\) => K\._sendHeartbeat\(\), \{ idle: 1\.5 \}\);/);
    expect(html).toMatch(/const r = await K\._api\('POST', '\/api\/users\/heartbeat', payload\);\s+K\._applyPulse && K\._applyPulse\(r\);/);
  });
  it('la liste complète n\'est plus qu\'un filet de sécurité (30 min) ; retour à l\'app / focus la relancent', () => {
    expect(html).toMatch(/_apexPoll\('conversations', 30 \* 60000, \(\) => K\._refreshConvs && K\._refreshConvs\(\), \{ idle: 2 \}\);/);
    expect(html).toMatch(/document\.addEventListener\('visibilitychange', \(\) => K\._refreshConvsSoon\(\)\);/);
    expect(html).toMatch(/window\.addEventListener\('focus', \(\) => K\._refreshConvsSoon\(\)\);/);
  });
});
