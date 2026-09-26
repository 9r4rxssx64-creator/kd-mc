/**
 * Régression v13.4.313 — Coffre (Kevin 2026-06-08) :
 *  « Paiement ouvert par défaut ?! » : les catégories (dont Paiements & Finance)
 *  s'ouvraient d'office. → fermées par défaut (ouvertes seulement en recherche).
 *
 * NB : le fix safe-area de l'en-tête collant (« l'écran passe dessous ») a été
 * reverté en v13.4.314 (il bloquait le scroll côté Kevin) — à refaire proprement
 * après validation visuelle. Ce test ne couvre donc que la fermeture des catégories.
 *
 * Câblé dans test:ci → ne JAMAIS reproduire la régression « catégories ouvertes ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../core/store.js';
import { render } from '../../features/vault/index.js';

describe('v13.4.313 — Coffre : affichage + catégories (régression Kevin)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* render() déclenche un fetch fire-and-forget (santé proxy) → le neutraliser
     * pour éviter un fetch suspendu après teardown happy-dom (leçon #89). */
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no-net-in-test'))));
    /* Le Coffre est admin-only → simuler l'admin Kevin pour rendre le contenu. */
    store.set('isAdmin', true);
    store.set('user', { id: 'kdmc_admin' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    store.set('isAdmin', false);
  });

  it('catégories FERMÉES par défaut (aucun <details ax-cat open> sans recherche)', () => {
    const div = document.createElement('div');
    render(div);
    const html = div.innerHTML;
    /* Au moins une catégorie « toujours visible » est rendue (Identité/Adresses/Autres). */
    expect(html).toContain('class="ax-cat"');
    /* isOpen = (recherche active) → sans recherche, AUCUNE catégorie ouverte. */
    expect(/<details[^>]*class="ax-cat"[^>]*\sopen[\s>]/i.test(html)).toBe(false);
  });
});
