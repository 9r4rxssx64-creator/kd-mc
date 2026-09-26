// E2E navigateur RÉEL — réciprocité de confidentialité (v1.1.265, parité Signal).
// Prouve le câblage COMPLET : module ApexPrivacy + gating des cases WS entrantes
// (read / typing) + libellé de présence. Quand l'utilisateur COUPE son signal,
// il ne VOIT plus celui des autres.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat — réciprocité confidentialité (navigateur réel)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.ApexPrivacy && window.K && window.K._presenceLabel && window._handleWsMessage,
      { timeout: 15000 },
    );
  });

  test('accusés de lecture ET saisie masqués quand je coupe les miens', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const K = window.K;
      K.user = { id: 'me' };
      K.view = 'chats'; K.viewData = null;
      K.render = () => {}; // neutralise le rendu (on teste l'état)
      K._renderTypingIndicator = () => {};

      const readEvt = () => ({ type: 'read', userId: 'peer', message_id: 'm9' });
      const typeEvt = () => ({ type: 'typing', userId: 'peer', from_pseudo: 'Peer' });

      // 1) Réglages par défaut (tout activé) → je VOIS.
      window.ls('privacy_prefs', { readReceipts: true, typingIndicator: true, onlineStatus: true });
      K._readState = {}; K._typingState = {};
      await window._handleWsMessage(readEvt(), 'cvP');
      await window._handleWsMessage(typeEvt(), 'cvP');
      const seesRead = K._readState?.cvP?.peer === 'm9';
      const seesTyping = !!K._typingState?.cvP?.peer;

      // 2) Je COUPE lecture + saisie → je ne vois PLUS.
      window.ls('privacy_prefs', { readReceipts: false, typingIndicator: false, onlineStatus: true });
      K._readState = {}; K._typingState = {};
      await window._handleWsMessage(readEvt(), 'cvP');
      await window._handleWsMessage(typeEvt(), 'cvP');
      const hiddenRead = !(K._readState?.cvP?.peer);
      const hiddenTyping = !(K._typingState?.cvP?.peer);

      return { seesRead, seesTyping, hiddenRead, hiddenTyping };
    });
    expect(r.seesRead).toBe(true);
    expect(r.seesTyping).toBe(true);
    expect(r.hiddenRead).toBe(true);    // réciprocité : coupé → invisible
    expect(r.hiddenTyping).toBe(true);
  });

  test('présence masquée quand je coupe mon statut en ligne', async ({ page }) => {
    const r = await page.evaluate(() => {
      const K = window.K;
      K.user = { id: 'me' };
      const conv = { id: 'cvP', peer_id: 'peer' };
      K._presenceState = { peer: { status: 'online', last_seen: Date.now() } };

      window.ls('privacy_prefs', { onlineStatus: true });
      const withStatus = K._presenceLabel(conv);

      window.ls('privacy_prefs', { onlineStatus: false });
      const hidden = K._presenceLabel(conv);

      return { withStatus, hidden };
    });
    expect(r.withStatus).toContain('En ligne');   // visible quand activé
    expect(r.hidden).not.toContain('En ligne');    // masqué (réciprocité)
    expect(r.hidden).toMatch(/Chiffré|E2E/);       // libellé neutre de repli
  });
});
