/**
 * v13.4.405 (apex-cloud, mission parité pont 2769) : `appeler` dans Apex AI, mêmes règles que Bee : boutons « 📞 Appeler » (tel:) que Kevin touche,
 * le domaine lit le numéro, l'IA ne voit ni nom ni numéro ; « appelle <nom> » est traité par le chat lui-même (leçon : ne pas compter sur le modèle).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { appeler, carteAppelHtml, lireReponseAppel } from '../../services/admin/appeler.js';
import { nomAAppeler, repondreLocalement } from '../../features/chat/chat-outils-locaux.js';

afterEach(() => { document.body.innerHTML = ''; });
const faux = (corps: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(corps), { status })) as unknown as typeof fetch;
const REP = { ok: true, trouves: [{ nom: 'Marie Dupont', tel: 'tel:+33612345678' }], sans_tel: 0, correspondances: 1 };

describe('lecture de la porte', () => {
  it('garde seulement les liens tel: stricts', () => {
    const r = lireReponseAppel({ ok: true, trouves: [{ nom: 'A', tel: 'tel:+33612345678' }, { nom: 'B', tel: 'javascript:alert(1)' }, { nom: 'C', tel: 'tel:12' }, { nom: 'D', tel: 'https://x.fr' }], correspondances: 4 });
    expect(r?.appels.map((a) => a.nom)).toEqual(['A']);
  });
  it('au plus 5 boutons ; réponse sans ok:true refusée', () => {
    const t = Array.from({ length: 9 }, (_, i) => ({ nom: 'P' + i, tel: 'tel:+3361234567' + (i % 10) }));
    expect(lireReponseAppel({ ok: true, trouves: t })?.appels.length).toBe(5);
    expect(lireReponseAppel({ ok: false })).toBeNull();
  });
});

describe('la carte et ce que reçoit l\'IA', () => {
  it('la carte échappe les noms et porte le lien tel:', () => {
    const h = carteAppelHtml([{ nom: '<b>x</b>', tel: 'tel:+33612345678' }]);
    expect(h).not.toContain('<b>');
    expect(h).toContain('href="tel:+33612345678"');
  });
  it('l\'outil affiche le bouton ; l\'IA ne reçoit ni nom ni numéro', async () => {
    const t = await appeler('Marie Dupont', faux(REP));
    expect(document.querySelector('a.ax-appel')?.getAttribute('href')).toBe('tel:+33612345678');
    expect(t).not.toMatch(/Marie|Dupont|\+33|0612/);
  });
  it('nom inconnu ou sans numéro : aucun bouton, message simple', async () => {
    const t = await appeler('Inconnu Total', faux({ ok: true, trouves: [], correspondances: 0 }));
    expect(document.querySelector('a.ax-appel')).toBeNull();
    expect(t).toMatch(/Aucun compte/);
    const t2 = await appeler('Marie Dupont', faux({ ok: true, trouves: [], correspondances: 1 }));
    expect(t2).toMatch(/aucun numéro/);
  });
  it('porte refusée : aucun bouton', async () => {
    const t = await appeler('Marie Dupont', faux({ ok: false }, 403));
    expect(document.querySelector('a.ax-appel')).toBeNull();
    expect(t).toMatch(/pas pu chercher/);
  });
});

describe('le chat traite « appelle <nom> » lui-même', () => {
  it.each([
    ['appelle Marie Dupont', 'Marie Dupont'],
    ['Appelle Jean-Pierre Martin !', 'Jean-Pierre Martin'],
    ['peux-tu appeler Léa Saint-Polit ?', 'Léa Saint-Polit'],
  ])('« %s » → %s', (t, nom) => { expect(nomAAppeler(t)).toBe(nom); });
  it.each(['comment appeler une fonction en JS ?', 'appelle-moi un taxi', 'appelle un plombier', 'bonjour', 'rappelle-toi la règle'])('« %s » → modèle', (t) => {
    expect(nomAAppeler(t)).toBeNull();
  });
  it('réponse locale : bouton affiché, aucune donnée dans la phrase', async () => {
    const r = await repondreLocalement('appelle Marie Dupont', faux(REP));
    expect(document.querySelector('a.ax-appel')).not.toBeNull();
    expect(r).toMatch(/Appeler/);
    expect(r).not.toMatch(/Marie|Dupont|\+33/);
  });
});
