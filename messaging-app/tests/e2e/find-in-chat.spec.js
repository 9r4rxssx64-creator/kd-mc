// E2E navigateur RÉEL — recherche « dans cette conversation » (v1.1.263).
// Prouve le câblage COMPLET : module ApexSearch chargé + fonctions K._find*
// + classes DOM réelles (find-hit / find-active) + navigation ↑/↓ bouclée.
// Monte un mini-DOM de bulles .msg[data-msg-id] (comme le rendu réel) et
// exerce la vraie logique sur le vrai moteur. Aucun réseau externe requis.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat — recherche dans le chat (navigateur réel)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.ApexSearch && window.ApexSearch.findInMessages && window.K && window.K._findApply,
      { timeout: 15000 },
    );
  });

  test('surligne les résultats, compte n/total, navigue ↑/↓ avec bouclage', async ({ page }) => {
    const r = await page.evaluate(() => {
      const K = window.K;
      // Mini conversation + messages (dont accents/casse + un supprimé).
      K.viewData = { id: 'cvF' };
      K.messages = { cvF: [
        { id: 'm1', text: 'Rendez-vous au Café demain' },
        { id: 'm2', text: 'Autre sujet' },
        { id: 'm3', voice_text: 'le CAFÉ était bon' },
        { id: 'm4', text: 'supprimé au café', deleted: true },
        { id: 'm5', text: 'encore un cafe' },
      ]};
      // Mini-DOM de bulles comme le vrai rendu.
      const box = document.createElement('div');
      box.innerHTML = K.messages.cvF.map(m =>
        `<div class="msg" data-msg-id="${m.id}">x</div>`).join('');
      document.body.appendChild(box);

      K._findBarOpen = true;
      K._findQuery = 'cafe';
      K._findApply(true); // reset position

      const hits = [...document.querySelectorAll('.msg.find-hit')].map(e => e.getAttribute('data-msg-id'));
      const total = K._findTotal;
      const firstActive = document.querySelector('.msg.find-active')?.getAttribute('data-msg-id');

      // Navigation suivante ×2 puis bouclage.
      K._findStep(1);
      const act2 = document.querySelector('.msg.find-active')?.getAttribute('data-msg-id');
      K._findStep(1);
      const act3 = document.querySelector('.msg.find-active')?.getAttribute('data-msg-id');
      K._findStep(1); // boucle → revient au 1er
      const wrapped = document.querySelector('.msg.find-active')?.getAttribute('data-msg-id');
      // Précédent depuis le 1er → dernier.
      K._findStep(-1);
      const prevWrap = document.querySelector('.msg.find-active')?.getAttribute('data-msg-id');

      // Fermeture : nettoie tout.
      K._toggleFindBar(); // était ouvert → ferme
      const afterClose = {
        open: K._findBarOpen,
        hits: document.querySelectorAll('.msg.find-hit').length,
        active: document.querySelectorAll('.msg.find-active').length,
      };
      return { hits, total, firstActive, act2, act3, wrapped, prevWrap, afterClose };
    });

    expect(r.total).toBe(3);                       // m1, m3, m5 (m4 supprimé ignoré)
    expect(r.hits).toEqual(['m1', 'm3', 'm5']);
    expect(r.firstActive).toBe('m1');              // position 0 active
    expect(r.act2).toBe('m3');
    expect(r.act3).toBe('m5');
    expect(r.wrapped).toBe('m1');                  // bouclage avant
    expect(r.prevWrap).toBe('m5');                 // bouclage arrière
    expect(r.afterClose.open).toBe(false);
    expect(r.afterClose.hits).toBe(0);             // surlignages nettoyés
    expect(r.afterClose.active).toBe(0);
  });

  test('aucun résultat → compteur 0/0, aucun surlignage', async ({ page }) => {
    const r = await page.evaluate(() => {
      const K = window.K;
      K.viewData = { id: 'cvG' };
      K.messages = { cvG: [{ id: 'a', text: 'bonjour' }, { id: 'b', text: 'salut' }] };
      const box = document.createElement('div');
      box.innerHTML = '<div class="msg" data-msg-id="a">x</div><div class="msg" data-msg-id="b">x</div>';
      document.body.appendChild(box);
      K._findBarOpen = true;
      K._findQuery = 'zzzintrouvable';
      K._findApply(true);
      K._findStep(1); // ne doit rien casser sans résultat
      return { total: K._findTotal, pos: K._findPos, hits: document.querySelectorAll('.msg.find-hit').length };
    });
    expect(r.total).toBe(0);
    expect(r.pos).toBe(-1);
    expect(r.hits).toBe(0);
  });
});
