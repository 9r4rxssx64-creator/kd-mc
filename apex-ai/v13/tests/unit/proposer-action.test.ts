import { afterEach, describe, expect, it } from 'vitest';

import { ADMIN_TOOLS } from '../../services/apex-tools-registry/admin-tools';
import { ACTIONS_OUVERTES, carteHtml, confirmerAuDomaine, JETON, lireProposition, proposerAuDomaine, proposerPourKevin } from '../../services/admin/proposer-action';

/* Parité Bee (javis-bee 3016/3031) : l'IA PROPOSE, le domaine fabrique le résumé, Kevin touche ✅, seul /__javis/agir exécute. */
const JET = 'v1.' + 'a'.repeat(40) + '.' + 'b'.repeat(64);
const PROP = { action: 'arbre_commentaire', titre: 'Ajouter un commentaire', icone: '💬', risque: 'faible', resume: 'Ajouter le commentaire « bonjour » à la fiche de Marie Dupont.', jeton: JET };
const reponse = (corps: unknown, status = 200): Response => new Response(JSON.stringify(corps), { status });
afterEach(() => { document.body.innerHTML = ''; });

describe('lireProposition', () => {
  it('accepte une proposition du domaine', () => { expect(lireProposition({ ok: true, proposition: PROP })).toMatchObject({ action: 'arbre_commentaire', jeton: JET }); });
  it.each([
    ['action hors liste', { ...PROP, action: 'bot_kill' }], ['action de risque', { ...PROP, action: 'compte_creer' }], ['jeton mal formé', { ...PROP, jeton: 'v1.x.y' }], ['jeton sans signature', { ...PROP, jeton: 'v1.' + 'a'.repeat(40) + '.zz' }], ['résumé vide', { ...PROP, resume: '  ' }],
  ])('refuse : %s', (_n, p) => { expect(lireProposition({ ok: true, proposition: p })).toBeNull(); });
  it('refus ou illisible → null', () => { expect(lireProposition({ ok: false })).toBeNull(); expect(lireProposition(null)).toBeNull(); expect(lireProposition('x')).toBeNull(); });
  it('les 5 actions ouvertes = celles du domaine', () => { expect([...ACTIONS_OUVERTES]).toEqual(['arbre_info', 'arbre_champ', 'arbre_commentaire', 'arbre_lien', 'message_direct']); expect(JETON.test(JET)).toBe(true); });
});

describe('proposerAuDomaine / confirmerAuDomaine', () => {
  it('POST /__admin/proposer avec cookie de session, action + champs', async () => {
    let url = ''; let init: RequestInit | undefined;
    const f = (async (u: string, i?: RequestInit) => { url = u; init = i; return reponse({ ok: true, proposition: PROP }); }) as unknown as typeof fetch;
    const r = await proposerAuDomaine('arbre_commentaire', { personne: 'Marie Dupont', texte: 'bonjour', vide: '', rien: undefined }, f);
    expect(url).toBe('/__admin/proposer'); expect(init?.method).toBe('POST'); expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'arbre_commentaire', personne: 'Marie Dupont', texte: 'bonjour' }); expect(r.ok).toBe(true);
  });
  it('403 → raison lisible ; refus du domaine → son texte', async () => {
    expect(await proposerAuDomaine('arbre_info', {}, (async () => reponse({}, 403)) as unknown as typeof fetch)).toEqual({ ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' });
    expect(await proposerAuDomaine('arbre_info', {}, (async () => reponse({ ok: false, texte: '2 personnes correspondent : précise.' }, 409)) as unknown as typeof fetch)).toEqual({ ok: false, raison: '2 personnes correspondent : précise.' });
  });
  it('le ✅ : POST /__javis/agir { confirme:true, jeton } ; jeton mal formé → aucun appel', async () => {
    let appels = 0; let corps = ''; let url = '';
    const f = (async (u: string, i?: RequestInit) => { appels++; url = u; corps = String(i?.body); return reponse({ ok: true, texte: '💬 C\'est fait.' }); }) as unknown as typeof fetch;
    expect(await confirmerAuDomaine('pas-un-jeton', f)).toEqual({ ok: false, texte: 'Proposition invalide.' }); expect(appels).toBe(0);
    expect(await confirmerAuDomaine(JET, f)).toEqual({ ok: true, texte: '💬 C\'est fait.' }); expect(url).toBe('/__javis/agir'); expect(JSON.parse(corps)).toEqual({ confirme: true, jeton: JET });
  });
  it('refus du domaine au ✅ → pas fait, avec son texte', async () => {
    expect(await confirmerAuDomaine(JET, (async () => reponse({ ok: false, texte: 'Cette proposition a déjà été utilisée.' }, 409)) as unknown as typeof fetch)).toEqual({ ok: false, texte: 'Cette proposition a déjà été utilisée.' });
  });
});

describe('carte et outil', () => {
  it('la carte : résumé du DOMAINE échappé, « rien n\'est fait avant ✅ »', () => {
    const h = carteHtml({ ...PROP, resume: 'Ajouter <script>x</script> à Marie' } as never);
    expect(h).toMatch(/Rien n'est fait tant que tu n'as pas touché/); expect(h).not.toMatch(/<script>/);
  });
  it('rien n\'est envoyé tant qu\'on n\'a pas touché ✅ : la phrase rendue à l\'IA ne contient NI nom NI résumé NI jeton', async () => {
    const appels: string[] = [];
    const f = (async (u: string) => { appels.push(u); return reponse({ ok: true, proposition: PROP }); }) as unknown as typeof fetch;
    const t = await proposerPourKevin('arbre_commentaire', { personne: 'Marie Dupont', texte: 'bonjour' }, f);
    expect(appels).toEqual(['/__admin/proposer']);   // AUCUN appel à /__javis/agir avant le bouton
    expect(t).toMatch(/Carte de confirmation affichée/); expect(t).toMatch(/JAMAIS « c'est fait »/); expect(t).not.toMatch(/Marie|Dupont|bonjour|v1\.|kdmc/);
    expect(document.querySelector('.ax-proposition-resume')?.textContent).toMatch(/Marie Dupont/);
    expect(document.body.textContent).toMatch(/✅ Confirmer/); expect(document.body.textContent).toMatch(/✖ Annuler/);
  });
  it('action hors liste : refusée sans appel ; domaine en panne : phrase claire, aucune carte', async () => {
    let appels = 0; const f = (async () => { appels++; return reponse({}, 500); }) as unknown as typeof fetch;
    expect(await proposerPourKevin('bot_kill', {}, f)).toMatch(/pas ouverte/); expect(appels).toBe(0);
    expect(await proposerPourKevin('message_direct', { nom: 'A B', texte: 'x' }, f)).toMatch(/pas pu préparer/); expect(document.querySelector('.ax-proposition-resume')).toBeNull();
  });
  it('les 5 outils existent dans le registre, mode admin, et demandent la personne (ou le nom)', () => {
    for (const n of ACTIONS_OUVERTES) {
      const t = ADMIN_TOOLS.find((x) => x.name === n);
      expect(t?.minTier).toBe('admin'); expect(t?.inputSchema.required?.some((r) => r === 'personne' || r === 'nom')).toBe(true);
    }
  });
});
