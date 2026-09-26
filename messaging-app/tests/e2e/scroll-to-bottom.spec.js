/**
 * E2E navigateur RÉEL — le chat DESCEND au DERNIER message (v1.1.277).
 * Capture Kevin : « Les messages ne actualisent pas au dernier message ».
 * Aggravé par l'agrandissement des médias (v1.1.275) : plus de hauteur → la
 * vue restait figée en haut.
 *
 * On prouve, dans un vrai DOM scrollable :
 *  1. mon propre message (append) → colle TOUJOURS la vue au dernier ;
 *  2. message reçu quand je LIS PLUS HAUT → ne force PAS le saut (respect lecture) ;
 *  3. message reçu quand je suis EN BAS → descend ;
 *  4. _onMediaLoad pendant la fenêtre de pin → ré-ancre en bas (média qui grandit).
 */
import { test, expect } from '@playwright/test';

async function bootChat(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => window.K && window.K._appendBubble && window.K._onMediaLoad
      && window.K._chatToBottom && window.K._renderBubble && window.ApexGrouping,
    { timeout: 15000 },
  );
  // Vue chat active + boîte scrollable réelle (hauteur bornée, contenu long).
  await page.evaluate(() => {
    const K = window.K;
    K.user = { id: 'me', pseudo: 'Moi' };
    const conv = { id: 'cvs', peer_id: 'p' };
    K.view = 'chat'; K.viewData = conv; K.conversations = [conv];
    K.messages = { cvs: [] };
    const box = document.createElement('div');
    box.id = 'chat-msgs';
    box.style.cssText = 'height:300px;overflow-y:auto;position:absolute;top:0;left:0;width:340px';
    document.body.appendChild(box);
    // Assez de messages pour rendre la boîte réellement scrollable.
    for (let i = 0; i < 30; i += 1) {
      K.messages.cvs.push({ id: `seed${i}`, from: i % 2 ? 'me' : 'p', ts: 1000 + i, text: `msg ${i}` });
    }
    box.innerHTML = K.messages.cvs.map((m) => K._renderBubble(m, conv, K.messages.cvs)).join('');
    box.scrollTop = box.scrollHeight; // départ en bas
  });
}

const dist = (page) => page.evaluate(() => {
  const b = document.getElementById('chat-msgs');
  return b.scrollHeight - b.scrollTop - b.clientHeight; // 0 = collé en bas
});

test.describe('Défilement vers le dernier message (v1.1.277)', () => {
  test('mon propre message → la vue colle au dernier même si je lisais plus haut', async ({ page }) => {
    await bootChat(page);
    // Je remonte lire l'historique.
    await page.evaluate(() => { document.getElementById('chat-msgs').scrollTop = 0; });
    expect(await dist(page)).toBeGreaterThan(50);

    // J'ENVOIE un message → doit redescendre en bas.
    await page.evaluate(() => {
      const K = window.K, conv = K.viewData;
      const m = { id: 'mine', from: 'me', ts: 99999, text: 'mon message' };
      K.messages.cvs.push(m);
      K._appendBubble(conv, m);
    });
    expect(await dist(page)).toBeLessThan(4); // collé au dernier
  });

  test('message REÇU pendant que je lis plus haut → ne saute PAS (respect lecture)', async ({ page }) => {
    await bootChat(page);
    await page.evaluate(() => { document.getElementById('chat-msgs').scrollTop = 0; });

    await page.evaluate(() => {
      const K = window.K, conv = K.viewData;
      const m = { id: 'peer1', from: 'p', ts: 99999, text: 'reçu' };
      K.messages.cvs.push(m);
      K._appendBubble(conv, m);
    });
    // Je lisais en haut → on ne m'arrache pas la lecture.
    expect(await dist(page)).toBeGreaterThan(50);
  });

  test('message REÇU quand je suis déjà en bas → descend au dernier', async ({ page }) => {
    await bootChat(page); // départ en bas
    await page.evaluate(() => {
      const K = window.K, conv = K.viewData;
      const m = { id: 'peer2', from: 'p', ts: 99999, text: 'reçu bas' };
      K.messages.cvs.push(m);
      K._appendBubble(conv, m);
    });
    expect(await dist(page)).toBeLessThan(4);
  });

  test('_onMediaLoad pendant la fenêtre de pin → ré-ancre en bas (média qui grandit)', async ({ page }) => {
    await bootChat(page);
    // Simule renderChat : ouvre une fenêtre de pin, puis un média grandit APRÈS.
    await page.evaluate(() => {
      const K = window.K, box = document.getElementById('chat-msgs');
      box.scrollTop = box.scrollHeight;      // en bas
      K._pinBottomUntil = Date.now() + 1800; // fenêtre de pin (comme renderChat)
      // Un média se charge et POUSSE le contenu (hauteur +240px) → on n'est plus en bas.
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height:240px'; box.appendChild(spacer);
    });
    expect(await dist(page)).toBeGreaterThan(50); // décollé par le média

    await page.evaluate(() => window.K._onMediaLoad()); // onload du média
    expect(await dist(page)).toBeLessThan(4);          // ré-ancré en bas
  });

  test('_onMediaLoad HORS pin et loin du bas → ne bouge pas la lecture', async ({ page }) => {
    await bootChat(page);
    await page.evaluate(() => {
      const K = window.K;
      K._pinBottomUntil = 0;                                   // pas de pin
      document.getElementById('chat-msgs').scrollTop = 0;       // je lis en haut
    });
    const before = await dist(page);
    await page.evaluate(() => window.K._onMediaLoad());
    expect(await dist(page)).toBeCloseTo(before, -1); // inchangé (lecture préservée)
  });
});
