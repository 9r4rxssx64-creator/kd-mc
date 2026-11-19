/**
 * v13.4.403 (apex-cloud, mission parité pont 2769) : `lien_externe` dans Apex AI, mêmes règles que Bee :
 * une carte avec un bouton que Kevin touche ; https seulement ; jamais d'identifiants dans l'adresse ; pas d'adresse interne.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { adresseExterne, carteLienHtml, lienExterne } from '../../services/admin/lien-externe.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('adresse acceptée ou refusée', () => {
  it.each([
    ['https://exemple.fr/page?a=1', 'https://exemple.fr/page?a=1'],
    ['exemple.fr', 'https://exemple.fr/'],
  ])('%s est acceptée', (entree, attendu) => { expect(adresseExterne(entree)).toBe(attendu); });
  it.each([
    'http://exemple.fr', 'javascript:alert(1)', 'https://user:mdp@exemple.fr', 'https://192.168.0.1/', 'https://localhost/', 'https://machine.internal/',
    'https://exemple', '', 'data:text/html,x', 'ftp://exemple.fr',
  ])('%s est refusée', (entree) => { expect(adresseExterne(entree)).toBeNull(); });
});

describe('la carte et l\'outil', () => {
  it('la carte échappe le texte et pose rel=noopener', () => {
    const h = carteLienHtml('https://exemple.fr/', '<b>x</b>');
    expect(h).not.toContain('<b>');
    expect(h).toContain('rel="noopener noreferrer"');
  });
  it('l\'outil affiche un bouton et n\'ouvre rien tout seul', async () => {
    let ouvert = 0;
    const avant = window.open; window.open = (() => { ouvert++; return null; }) as typeof window.open;
    const t = await lienExterne('https://exemple.fr/', 'Voir');
    window.open = avant;
    expect(ouvert).toBe(0);
    expect(document.querySelector('a.ax-lien-externe')?.getAttribute('href')).toBe('https://exemple.fr/');
    expect(t).toMatch(/Kevin le touche/);
  });
  it('adresse refusée : aucune carte, message simple', async () => {
    const t = await lienExterne('http://exemple.fr');
    expect(document.querySelector('a.ax-lien-externe')).toBeNull();
    expect(t).toMatch(/refusée/);
  });
});
