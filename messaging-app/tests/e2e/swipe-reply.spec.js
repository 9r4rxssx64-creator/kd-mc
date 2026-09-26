/**
 * E2E navigateur RÉEL — geste « balayer vers la droite pour répondre »
 * (v1.1.270, parité WhatsApp). Le cœur de décision (window.ApexGesture) est
 * couvert 100 % en unitaire ; ICI on prouve le CÂBLAGE DOM : un vrai balayage
 * tactile sur une bulle .msg déclenche bien K._setReplyTo (bannière de réponse).
 *
 * On dispatche des évènements tactiles avec une progression horizontale vers la
 * droite au-delà du seuil, et on vérifie que K._replyToMsg pointe le bon message.
 * Un balayage vertical (scroll) ne doit RIEN déclencher.
 */
import { test, expect } from '@playwright/test';

async function primeConv(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => window.K && window.K._installLongPressOnce && window.ApexGesture && window.K._setReplyTo,
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const K = window.K;
    K.user = { id: 'kevin', pseudo: 'Kevin' };
    const conv = { id: 'c1', name: 'Lolo', pseudo: 'Lolo' };
    K.viewData = conv;
    K.conversations = [conv];
    K.messages = { c1: [{ id: 'm1', from: 'lolo', text: 'Coucou' }] };
    K._replyToMsg = null;
    K._installLongPressOnce();
    // Bulle réelle dans le DOM (comme rendue par la vue conversation).
    const el = document.createElement('div');
    el.className = 'msg them';
    el.setAttribute('data-msg-id', 'm1');
    el.textContent = 'Coucou';
    el.id = 'test-bubble';
    document.body.appendChild(el);
  });
}

function swipe(page, xs) {
  // xs = suite de clientX ; premier = touchstart, derniers = touchmove, fin = touchend.
  return page.evaluate((pts) => {
    const el = document.getElementById('test-bubble');
    const fire = (type, x) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', {
        value: type === 'touchend' ? [] : [{ clientX: x, clientY: 100 }],
      });
      el.dispatchEvent(ev);
    };
    fire('touchstart', pts[0]);
    for (let i = 1; i < pts.length; i++) fire('touchmove', pts[i]);
    fire('touchend', pts[pts.length - 1]);
  }, xs);
}

test.describe('Swipe-to-reply — câblage DOM réel (v1.1.270)', () => {
  test('balayage droite au-delà du seuil → ouvre la réponse sur ce message', async ({ page }) => {
    await primeConv(page);
    await swipe(page, [10, 40, 95]); // dx final = 85 > seuil 56
    const replied = await page.evaluate(() => window.K._replyToMsg && window.K._replyToMsg.id);
    expect(replied).toBe('m1');
  });

  test('petit balayage sous le seuil → aucune réponse déclenchée', async ({ page }) => {
    await primeConv(page);
    await swipe(page, [10, 25, 40]); // dx final = 30 < seuil
    const replied = await page.evaluate(() => window.K._replyToMsg);
    expect(replied).toBeNull();
  });

  test('geste vertical (scroll) → aucune réponse', async ({ page }) => {
    await primeConv(page);
    // même déplacement horizontal faible mais surtout vertical
    await page.evaluate(() => {
      const el = document.getElementById('test-bubble');
      const fire = (type, x, y) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
        el.dispatchEvent(ev);
      };
      fire('touchstart', 10, 100);
      fire('touchmove', 20, 180);
      fire('touchend', 20, 180);
    });
    const replied = await page.evaluate(() => window.K._replyToMsg);
    expect(replied).toBeNull();
  });
});
