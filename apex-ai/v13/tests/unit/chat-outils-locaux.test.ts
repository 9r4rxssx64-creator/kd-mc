/**
 * v13.4.404 (apex-cloud, pc-config 2874) : la demande « liste des comptes CMCteams avec leur identifiant SBM » ne dépend plus du bon vouloir du modèle.
 * Mesure réelle du 19.11 : le modèle répondait « je n'ai pas la base » et réclamait des accès Firebase ; l'outil n'était jamais appelé.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { adresseAOuvrir, demandeListeComptesCmcteams, repondreLocalement } from '../../features/chat/chat-outils-locaux.js';

afterEach(() => { document.body.innerHTML = ''; });
const faux = (corps: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(corps), { status })) as unknown as typeof fetch;
const REP = { ok: true, total: 2, avec_matricule: 1, sans_matricule: 1, comptes: [{ nom: 'Marie Dupont', matricule: 'U1234' }, { nom: 'Jean Martin', matricule: '' }] };

describe('la demande est reconnue', () => {
  it.each([
    'fais-moi la liste de tous ceux qui ont un compte CMCteams avec leur identifiant SBM',
    'Donne-moi la liste des comptes CMC Teams',
    'montre les comptes cmcteams et les matricules',
    'qui a un compte dans CMC Teams ?',
  ])('« %s » → outil', (t) => { expect(demandeListeComptesCmcteams(t)).toBe(true); });
  it.each([
    'comment créer un compte CMCteams ?',
    'liste des comptes Apex Chat',
    'explique-moi le planning CMCteams',
    'bonjour',
    '',
  ])('« %s » → le modèle répond comme avant', (t) => { expect(demandeListeComptesCmcteams(t)).toBe(false); });
});

describe('la réponse locale', () => {
  it('affiche la carte à Kevin et répond sans aucun nom', async () => {
    const r = await repondreLocalement('liste des comptes CMCteams avec identifiant SBM', faux(REP));
    expect(document.body.textContent).toContain('Marie Dupont');
    expect(r).toMatch(/2 comptes/);
    expect(r).not.toMatch(/Marie|Dupont|Martin|U1234/);
  });
  it('une autre demande : null, rien n\'est affiché', async () => {
    expect(await repondreLocalement('bonjour', faux(REP))).toBeNull();
    expect(document.body.textContent).not.toContain('Marie Dupont');
  });
  it('porte en erreur : phrase simple, pas d\'accès réclamé', async () => {
    const r = await repondreLocalement('liste des comptes CMCteams', faux({ ok: false }, 403));
    expect(r).toMatch(/pas pu afficher/);
    expect(r).not.toMatch(/Firebase|clé|token/i);
  });
});

describe('câblage dans le chat', () => {
  it('le chat essaie le routage local AVANT d\'appeler le modèle', () => {
    const s = readFileSync(`${process.cwd()}/features/chat/chat-engine.ts`, 'utf8');
    const i = s.indexOf('repondreLocalement');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(s.indexOf('detectAndSuggestTool(text, rootEl);'));
  });
});

describe('« ouvre-moi <adresse> » (pc-config 2906 : partait vers un lancement de robot, « HTTP 401 », aucune carte)', () => {
  it.each([
    ['ouvre-moi https://example.org', 'https://example.org'],
    ['Ouvre https://exemple.fr/page?a=1 !', 'https://exemple.fr/page?a=1'],
    ['va sur exemple.fr', 'exemple.fr'],
    ['peux-tu ouvrir le site exemple.com ?', 'exemple.com'],
  ])('« %s » → %s', (t, a) => { expect(adresseAOuvrir(t)).toBe(a); });
  it.each(['ouvre le fichier readme.md', 'ouvre-moi un compte', 'comment ouvrir une porte', 'ouvre la page', 'bonjour', 'ouvre https://exemple.fr et résume-la en trois lignes'])('« %s » → modèle', (t) => {
    expect(adresseAOuvrir(t)).toBeNull();
  });
  it('réponse locale : un bouton, rien ne s\'ouvre seul', async () => {
    let ouvert = 0;
    const avant = window.open; window.open = (() => { ouvert++; return null; }) as typeof window.open;
    const r = await repondreLocalement('ouvre-moi https://example.org', faux(REP));
    window.open = avant;
    expect(ouvert).toBe(0);
    expect(document.querySelector('a.ax-lien-externe')?.getAttribute('href')).toBe('https://example.org/');
    expect(r).toMatch(/Ouvrir/);
  });
  it('adresse refusée (http) : aucune carte, phrase claire', async () => {
    const r = await repondreLocalement('ouvre-moi http://exemple.fr', faux(REP));
    expect(r).toMatch(/Adresse refusée/);
    expect(document.querySelector('a.ax-lien-externe')).toBeNull();
  });
});
