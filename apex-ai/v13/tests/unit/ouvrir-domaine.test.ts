import { afterEach, describe, expect, it } from 'vitest';

import { ressembleAOuvrir, repondreLocalement } from '../../features/chat/chat-outils-locaux';
import { chargerOuvrir, lireReponseOuvrir, ouvrirDomaine } from '../../services/admin/ouvrir-domaine';

/* Parité Bee, ligne « classer l'arbre autrement » (pont-check 2992 b) : « ouvre l'arbre en vue plan », « l'arbre trié par naissance »… */
const URL_ARBRE = 'https://arbre.kd-mc.com/#vue=plan';
const rep = (corps: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(corps), { status })) as typeof fetch;
afterEach(() => { document.body.innerHTML = ''; });

describe('ouvrir-domaine : lecture de la réponse du domaine', () => {
  it('accepte une adresse du domaine (https, kd-mc.com ou sous-domaine)', () => {
    expect(lireReponseOuvrir({ ok: true, url: URL_ARBRE, libelle: 'l\'arbre · vue plan' })).toEqual({ url: URL_ARBRE, libelle: 'l\'arbre · vue plan' });
    expect(lireReponseOuvrir({ ok: true, url: 'https://kd-mc.com/liens/', libelle: 'x' })?.url).toBe('https://kd-mc.com/liens/');
  });
  it.each([
    'http://arbre.kd-mc.com/', 'https://evil.example/', 'https://kd-mc.com.evil.example/', 'https://arbre.kd-mc.com@evil.example/', 'javascript:alert(1)', 'https://user:pw@arbre.kd-mc.com/',
  ])('refuse : %s', (u) => { expect(lireReponseOuvrir({ ok: true, url: u, libelle: 'x' })).toBeNull(); });
  it('refus du domaine ou réponse illisible → null', () => { expect(lireReponseOuvrir({ ok: false })).toBeNull(); expect(lireReponseOuvrir(null)).toBeNull(); });
});

describe('ouvrir-domaine : appel de la porte', () => {
  it('forme « phrase » : ?q= ; forme structurée : app, personne, vue, tri…', async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ ok: false, reason: 'pas_une_ouverture' })); }) as unknown as typeof fetch;
    await ouvrirDomaine({ demande: 'ouvre l\'arbre en vue plan' }, f);
    await ouvrirDomaine({ app: 'arbre', vue: 'plan', personne: 'Yann Lorenzi', inconnu: 'x' }, f);
    expect(urls[0]).toBe('/__admin/ouvrir?q=ouvre+l%27arbre+en+vue+plan');
    expect(urls[1]).toBe('/__admin/ouvrir?app=arbre&personne=Yann+Lorenzi&vue=plan');
  });
  it('403 → raison lisible ; pas une ouverture → marqué', async () => {
    expect(await chargerOuvrir(new URLSearchParams('q=x'), rep({}, 403))).toEqual({ ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' });
    expect(await chargerOuvrir(new URLSearchParams('q=x'), rep({ ok: false, reason: 'pas_une_ouverture' }))).toMatchObject({ ok: false, pasUneOuverture: true });
  });
  it('outil : bouton affiché ; la phrase rendue à l\'IA ne contient NI adresse NI nom', async () => {
    const t = await ouvrirDomaine({ app: 'arbre', personne: 'Yann Lorenzi' }, rep({ ok: true, url: URL_ARBRE, libelle: 'l\'arbre · Yann Lorenzi' }));
    expect(t).toMatch(/^Bouton « Ouvrir » prêt/); expect(t).not.toMatch(/Yann|Lorenzi|kd-mc\.com/);
    expect(document.querySelector('a.ax-lien-externe')?.getAttribute('href')).toBe(URL_ARBRE);
  });
  it('rien ne s\'ouvre tout seul', async () => {
    let ouvert = 0; const avant = window.open; window.open = (() => { ouvert++; return null; }) as typeof window.open;
    await ouvrirDomaine({ demande: 'ouvre l\'arbre' }, rep({ ok: true, url: URL_ARBRE, libelle: 'l\'arbre' }));
    window.open = avant; expect(ouvert).toBe(0);
  });
  it('ni app ni demande : phrase claire, aucun appel', async () => {
    let appels = 0; const f = (async () => { appels++; return new Response('{}'); }) as unknown as typeof fetch;
    expect(await ouvrirDomaine({}, f)).toMatch(/quoi ouvrir/); expect(appels).toBe(0);
  });
});

describe('chat : « ouvre l\'arbre en vue plan » (routage local)', () => {
  it.each(['ouvre l\'arbre en vue plan', 'Montre-moi l\'arbre trié par naissance', 'affiche l\'arbre de Yann Lorenzi', 'va sur l\'arbre en vue lignée'])('commence par un verbe d\'ouverture : « %s »', (t) => { expect(ressembleAOuvrir(t)).toBe(true); });
  it.each(['bonjour', 'comment ouvrir un compte ?', 'qui a ouvert l\'arbre', '', 'ouvre'.padEnd(300, 'x')])('pas une demande d\'ouverture : « %s »', (t) => { expect(ressembleAOuvrir(t)).toBe(false); });
  it('réponse locale : un bouton vers l\'arbre en vue plan, aucune adresse ni nom dans la phrase', async () => {
    const f = rep({ ok: true, url: URL_ARBRE, libelle: 'l\'arbre · vue plan', texte: 'Je t\'ouvre l\'arbre en vue plan.' });
    const r = await repondreLocalement('ouvre l\'arbre en vue plan', f);
    expect(r).toMatch(/« Ouvrir » est affiché/); expect(r).not.toMatch(/kd-mc|#vue/);
    expect(document.querySelector('a.ax-lien-externe')?.getAttribute('href')).toBe(URL_ARBRE);
  });
  it('le domaine dit « pas une ouverture » : le chat rend la main au modèle (null)', async () => {
    expect(await repondreLocalement('ouvre le dossier et résume-le', rep({ ok: false, reason: 'pas_une_ouverture' }))).toBeNull();
    expect(document.querySelector('a.ax-lien-externe')).toBeNull();
  });
});
