/**
 * E2E navigateur RÉEL — groupage des bulles façon WhatsApp (v1.1.273).
 * Prouve le CÂBLAGE (K._renderBubble injecte grp-start/grp-end depuis
 * window.ApexGrouping) + le CSS (espace avant une nouvelle série, pointe
 * seulement sur la dernière) + la ré-organisation à l'append incrémental.
 * La DÉCISION pure est déjà couverte 100 % par tests/unit/message-grouping.
 */
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => window.K && window.K._renderBubble && window.ApexGrouping,
    { timeout: 15000 },
  );
  await page.evaluate(() => { window.K.user = { id: 'me', pseudo: 'Moi' }; });
}

test.describe('Groupage des bulles (v1.1.273)', () => {
  test('_renderBubble injecte grp-start/grp-end selon les voisins', async ({ page }) => {
    await boot(page);
    const cls = await page.evaluate(() => {
      const K = window.K;
      const conv = { id: 'c1' };
      // 3 messages de moi (série) puis 1 de l'autre.
      const msgs = [
        { id: 'a', from: 'me', ts: 1000, text: 'un' },
        { id: 'b', from: 'me', ts: 2000, text: 'deux' },
        { id: 'c', from: 'me', ts: 3000, text: 'trois' },
        { id: 'd', from: 'other', ts: 4000, text: 'salut' },
      ];
      return msgs.map((m) => {
        const html = K._renderBubble(m, conv, msgs);
        const div = new DOMParser().parseFromString(html, 'text/html').querySelector('.msg');
        return div ? div.className : '';
      });
    });
    expect(cls[0]).toContain('grp-start');       // 1ʳᵉ de ma série
    expect(cls[0]).not.toContain('grp-end');
    expect(cls[1]).not.toContain('grp-start');   // milieu : ni l'un ni l'autre
    expect(cls[1]).not.toContain('grp-end');
    expect(cls[2]).toContain('grp-end');         // dernière de ma série (pointe)
    expect(cls[2]).not.toContain('grp-start');
    expect(cls[3]).toContain('grp-start');       // l'autre : bulle isolée
    expect(cls[3]).toContain('grp-end');
  });

  test('CSS : nouvelle série = plus d\'espace ; pointe seulement sur la dernière', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const K = window.K;
      const box = document.createElement('div');
      box.className = 'chat-messages'; box.id = 'chat-msgs';
      document.body.appendChild(box);
      const conv = { id: 'c2' };
      const msgs = [
        { id: 'a', from: 'me', ts: 1000, text: 'un' },   // grp-start
        { id: 'b', from: 'me', ts: 2000, text: 'deux' },  // milieu
        { id: 'c', from: 'me', ts: 3000, text: 'trois' }, // grp-end (pointe)
      ];
      box.innerHTML = msgs.map((m) => K._renderBubble(m, conv, msgs)).join('');
      const els = box.querySelectorAll('.msg');
      const cs = (el) => getComputedStyle(el);
      return {
        startMarginTop: parseFloat(cs(els[0]).marginTop),
        midMarginTop: parseFloat(cs(els[1]).marginTop),
        midRadius: parseFloat(cs(els[1]).borderBottomRightRadius),  // pas la dernière → arrondi
        lastRadius: parseFloat(cs(els[2]).borderBottomRightRadius), // dernière → pointe (petit)
      };
    });
    expect(r.startMarginTop).toBeGreaterThan(r.midMarginTop); // série resserrée, espace avant
    expect(r.midRadius).toBeGreaterThan(r.lastRadius);        // pointe uniquement sur la dernière
  });

  test('append incrémental : la bulle précédente perd sa pointe si la série continue', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const K = window.K;
      const box = document.createElement('div');
      box.id = 'chat-msgs';
      document.body.appendChild(box);
      const conv = { id: 'c3' };
      K.view = 'chat'; K.viewData = conv; K.messages = { c3: [] };

      // 1er message → rendu seul : grp-start + grp-end (pointe).
      K.messages.c3.push({ id: 'a', from: 'me', ts: 1000, text: 'un' });
      K._appendBubble(conv, K.messages.c3[0]);
      const firstHadEnd = box.querySelector('[data-msg-id="a"]').classList.contains('grp-end');

      // 2ᵉ message du même expéditeur → continue la série : le 1er ne doit plus
      // avoir la pointe (grp-end retiré), le 2ᵉ la porte.
      K.messages.c3.push({ id: 'b', from: 'me', ts: 2000, text: 'deux' });
      K._appendBubble(conv, K.messages.c3[1]);
      return {
        firstHadEnd,
        firstStillEnd: box.querySelector('[data-msg-id="a"]').classList.contains('grp-end'),
        secondEnd: box.querySelector('[data-msg-id="b"]').classList.contains('grp-end'),
      };
    });
    expect(r.firstHadEnd).toBe(true);    // seule au départ → pointe
    expect(r.firstStillEnd).toBe(false); // la série continue → pointe retirée
    expect(r.secondEnd).toBe(true);      // nouvelle dernière → pointe
  });
});
