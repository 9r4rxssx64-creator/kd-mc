/**
 * E2E navigateur RÉEL — bug « les messages reviennent après effacement » (Kevin,
 * v1.1.268). Avant v1.1.269, « supprimer pour moi » n'était que local : au reload,
 * le rejeu d'historique serveur (`_handleWsMessage` type:'history') re-poussait le
 * message → il RÉAPPARAISSAIT. Fix : set persistant d'ids supprimés par conv, que
 * le rejeu (et le temps réel) respectent ; + tombstone « 🗑 supprimé » pour un
 * message effacé côté serveur (suppression pour tout le monde).
 *
 * On rejoue le VRAI `_handleWsMessage` de prod et on prouve la non-résurrection.
 */
import { test, expect } from '@playwright/test';

test.describe('Suppression durable — un message effacé ne revient plus (fix v1.1.269)', () => {
  test('rejeu history : msg supprimé-pour-moi ABSENT, tombstone rendu, reste intact', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._markDeletedLocal && window.K._isDeletedLocal && typeof window._handleWsMessage === 'function',
      { timeout: 15000 },
    );

    const r = await page.evaluate(async () => {
      const K = window.K;
      const conv = 'convX';
      K.user = { id: 'kevin' };
      K.view = 'chats';                 // pas 'chat' → évite un render() pendant le test
      K.messages = K.messages || {};
      K.messages[conv] = [];
      try { localStorage.removeItem('apex_chat_deleted_msgs_' + conv); } catch (_) {}
      K._markDeletedLocal(conv, 'm1');  // j'ai supprimé m1 « pour moi »

      // Le serveur rejoue l'historique (reconnexion / nouvel appareil) AVEC m1.
      await window._handleWsMessage({
        type: 'history', conv_id: conv,
        messages: [
          { id: 'm1', sender_id: 'lolo', ciphertext: 'coucou supprimé', ts: 1 }, // doit rester ABSENT
          { id: 'm2', sender_id: 'lolo', ciphertext: 'message normal', ts: 2 },   // présent
          { id: 'm3', sender_id: 'lolo', ciphertext: null, ts: 3 },               // tombstone (suppr. tout le monde)
        ],
      }, conv);

      const msgs = K.messages[conv];
      const byId = (id) => msgs.find(m => m.id === id);
      return {
        hasM1: !!byId('m1'),
        m2Text: byId('m2') && byId('m2').text,
        m3Text: byId('m3') && byId('m3').text,
        m3Deleted: !!(byId('m3') && byId('m3').deleted),
        stillDeletedFlag: K._isDeletedLocal(conv, 'm1'), // persiste (localStorage)
      };
    });

    expect(r.hasM1).toBe(false);                     // ← ne revient PLUS (avant : true)
    expect(r.m2Text).toBe('message normal');         // le reste de la conv intact
    expect(r.m3Text).toBe('🗑 Message supprimé');    // tombstone au lieu d'une bulle vide
    expect(r.m3Deleted).toBe(true);
    expect(r.stillDeletedFlag).toBe(true);           // trace durable (survit au reload)
  });

  test('2e rejeu (comme un reload) : le message supprimé reste absent', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._markDeletedLocal && typeof window._handleWsMessage === 'function',
      { timeout: 15000 },
    );
    const stillGone = await page.evaluate(async () => {
      const K = window.K; const conv = 'convY';
      K.user = { id: 'kevin' }; K.view = 'chats'; K.messages = K.messages || {}; K.messages[conv] = [];
      try { localStorage.removeItem('apex_chat_deleted_msgs_' + conv); } catch (_) {}
      K._markDeletedLocal(conv, 'gone');
      const replay = () => window._handleWsMessage({
        type: 'history', conv_id: conv,
        messages: [{ id: 'gone', sender_id: 'lolo', ciphertext: 'texte', ts: 1 }],
      }, conv);
      await replay();
      K.messages[conv] = []; // simule un vidage mémoire (reload)
      await replay();        // le serveur re-rejoue → doit TOUJOURS être filtré
      return K.messages[conv].some(m => m.id === 'gone');
    });
    expect(stillGone).toBe(false);
  });
});
