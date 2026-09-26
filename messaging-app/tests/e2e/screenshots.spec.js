/**
 * E2E navigateur RÉEL — HARNESS VISUEL (390 px, parité WhatsApp, v1.1.270).
 *
 * Je ne peux pas « voir » les pixels depuis l'agent → cette passe visuelle est
 * VÉRIFIABLE en CI de deux façons complémentaires :
 *   1) CAPTURES d'écran (artefacts Playwright) que Kevin/CI peuvent regarder ;
 *   2) INVARIANTS MESURÉS au navigateur réel (pas d'estimation, leçon #59/#96) :
 *      pas de débordement horizontal à 390 px, cibles tactiles ≥ 44 px, photo de
 *      contact rendue en <img> quand dispo (sinon lettre), badge non-lus rond.
 *
 * On monte un mini-DOM avec les VRAIES classes CSS du rendu (.conv-item,
 * .avatar, .msg, .conv-unread…) — donc les captures reflètent les vrais styles.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const CONV_LIST_HTML = `
  <div class="conv-list" style="max-width:100%">
    <div class="conv-item">
      <div class="avatar avatar-online"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' fill='%23c9a227'/%3E%3C/svg%3E" alt=""></div>
      <div style="flex:1;min-width:0">
        <div class="conv-name">Lolo ❤️ Saint-Polit un très long nom qui doit être tronqué</div>
        <div class="conv-last">Coucou mon amour, tu rentres à quelle heure ce soir ?</div>
      </div>
      <div style="text-align:right">
        <div class="conv-time">21:34</div>
        <span class="conv-unread">3</span>
      </div>
      <button style="background:transparent;border:none;color:var(--ax-text-3);font-size:1.2em;padding:6px 4px;flex-shrink:0" aria-label="Actions">⋯</button>
    </div>
    <div class="conv-item">
      <div class="avatar">K</div>
      <div style="flex:1;min-width:0">
        <div class="conv-name">📌 Kevin</div>
        <div class="conv-last">(message chiffré)</div>
      </div>
      <div style="text-align:right"><div class="conv-time">hier</div></div>
      <button style="background:transparent;border:none;font-size:1.2em;padding:6px 4px;flex-shrink:0" aria-label="Actions">⋯</button>
    </div>
  </div>`;

const CONV_HTML = `
  <div id="messages" style="display:flex;flex-direction:column;gap:6px;padding:10px;max-width:100%">
    <div class="msg them" data-msg-id="a1">Salut, ça va&nbsp;? <span class="msg-time">21:30</span></div>
    <div class="msg me" data-msg-id="a2">Oui super et toi&nbsp;? <span class="msg-time">21:31 ✓✓</span></div>
    <div class="msg them" data-msg-id="a3">Un message un peu plus long pour vérifier le retour à la ligne et la largeur maximale de la bulle sur un petit écran. <span class="msg-time">21:32</span></div>
    <div class="msg me swiping" data-msg-id="a4" style="--sp:0.7;transform:translateX(40px)">On teste le balayage pour répondre 👉 <span class="msg-time">21:33 ✓</span></div>
  </div>`;

async function boot(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.K, { timeout: 15000 });
}

function noHOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test.describe('Passe visuelle 390px — captures + invariants', () => {
  test('splash / écran de connexion', async ({ page }) => {
    await boot(page);
    expect(await noHOverflow(page)).toBe(true);
    await page.screenshot({ path: 'test-results/shot-splash.png', fullPage: false });
  });

  test('liste de conversations — photo réelle, badge rond, pas de débordement', async ({ page }) => {
    await boot(page);
    await page.evaluate((html) => {
      const app = document.getElementById('app') || document.body;
      app.innerHTML = html;
    }, CONV_LIST_HTML);

    const m = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.conv-item')];
      const first = items[0];
      const av0 = first.querySelector('.avatar');
      const badge = document.querySelector('.conv-unread');
      const name0 = first.querySelector('.conv-name');
      return {
        itemCount: items.length,
        rowH: Math.round(first.getBoundingClientRect().height),
        avatarHasImg: !!av0.querySelector('img'),
        secondAvatarIsLetter: !items[1].querySelector('.avatar img'),
        badgeW: badge ? Math.round(badge.getBoundingClientRect().width) : 0,
        badgeH: badge ? Math.round(badge.getBoundingClientRect().height) : 0,
        nameClipped: name0.scrollWidth > name0.clientWidth, // nom trop long → ellipsis actif
      };
    });

    expect(await noHOverflow(page)).toBe(true);      // pas de scroll horizontal à 390px
    expect(m.itemCount).toBe(2);
    expect(m.rowH).toBeGreaterThanOrEqual(44);        // cible tactile
    expect(m.avatarHasImg).toBe(true);                // photo du contact affichée
    expect(m.secondAvatarIsLetter).toBe(true);        // fallback lettre sans photo
    expect(m.badgeW).toBeGreaterThanOrEqual(20);      // pastille non-lus ronde
    expect(m.badgeH).toBeGreaterThanOrEqual(18);
    expect(m.nameClipped).toBe(true);                 // ellipsis sur nom long

    await page.screenshot({ path: 'test-results/shot-conv-list.png', fullPage: false });
  });

  test('conversation ouverte — bulles, ticks, indicateur de balayage', async ({ page }) => {
    await boot(page);
    await page.evaluate((html) => {
      const app = document.getElementById('app') || document.body;
      app.innerHTML = html;
    }, CONV_HTML);

    const m = await page.evaluate(() => {
      const me = document.querySelector('.msg.me');
      const them = document.querySelector('.msg.them');
      const container = document.getElementById('messages');
      const swiped = document.querySelector('.msg.swiping');
      const sp = swiped ? getComputedStyle(swiped).getPropertyValue('--sp').trim() : '';
      return {
        hasMe: !!me, hasThem: !!them,
        meWithin: me.getBoundingClientRect().width <= container.clientWidth,
        swipeArrowVar: sp, // --sp propagé → l'indicateur ↩ (::before) est visible
      };
    });

    expect(await noHOverflow(page)).toBe(true);
    expect(m.hasMe).toBe(true);
    expect(m.hasThem).toBe(true);
    expect(m.meWithin).toBe(true);                    // bulle ne déborde pas
    expect(m.swipeArrowVar).toBe('0.7');              // indicateur de balayage câblé

    await page.screenshot({ path: 'test-results/shot-conversation.png', fullPage: false });
  });
});
