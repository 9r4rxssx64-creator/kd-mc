/**
 * v13.4.402 (apex-cloud, mission parité pont 2769, Kevin 18.11) : Apex AI a l'outil `comptes_cmcteams` comme Bee.
 * Les noms et matricules ne vont JAMAIS à l'IA : la carte est affichée à Kevin, l'IA reçoit « liste prête (N comptes) ».
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { carteHtml, chargerComptes, comptesCmcteams, lireReponsePorte, resumePourIA, PORTE_COMPTES_CMCTEAMS } from '../../services/admin/comptes-cmcteams.js';
import { ADMIN_TOOLS } from '../../services/apex-tools-registry/admin-tools.js';

const REP = {
  ok: true, total: 3, avec_matricule: 2, sans_matricule: 1,
  comptes: [{ nom: 'Marie Dupont', matricule: 'U1234' }, { nom: 'Jean Martin', matricule: 'U5678' }, { nom: 'Léa <img src=x onerror=alert(1)>', matricule: '' }],
};
const faux = (corps: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

afterEach(() => { document.body.innerHTML = ''; });

describe('lecture de la porte', () => {
  it('lit la liste, refuse un matricule mal formé, borne les noms', () => {
    const l = lireReponsePorte({ ...REP, comptes: [{ nom: 'A'.repeat(300), matricule: 'x; drop' }] });
    expect(l?.comptes[0]?.nom.length).toBe(80);
    expect(l?.comptes[0]?.matricule).toBe('');
  });
  it('une réponse sans ok:true est refusée', () => {
    expect(lireReponsePorte({ ok: false })).toBeNull();
    expect(lireReponsePorte(null)).toBeNull();
  });
  it('appelle la porte du domaine avec la session (même domaine)', async () => {
    const f = vi.fn(faux(REP)) as unknown as typeof fetch;
    await chargerComptes(f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PORTE_COMPTES_CMCTEAMS);
    expect(init.credentials).toBe('include');
  });
  it('401/403 : raison lisible, pas d\'exception', async () => {
    const r = await chargerComptes(faux({ ok: false }, 403));
    expect(r.ok).toBe(false);
  });
});

describe('la carte et ce que reçoit l\'IA', () => {
  it('la carte montre noms et matricules, échappés', () => {
    const l = lireReponsePorte(REP)!;
    const h = carteHtml(l);
    expect(h).toContain('Marie Dupont');
    expect(h).toContain('U1234');
    expect(h).not.toContain('<img');
    expect(h).toContain('2 avec identifiant SBM');
  });
  it('l\'IA ne reçoit que des nombres : aucun nom, aucun matricule', () => {
    const t = resumePourIA(lireReponsePorte(REP)!);
    expect(t).toMatch(/3 comptes/);
    expect(t).not.toMatch(/Marie|Dupont|Martin|Léa|U1234|U5678/);
  });
  it('l\'outil affiche la carte à Kevin et rend à l\'IA le résumé sans donnée', async () => {
    const t = await comptesCmcteams(faux(REP));
    expect(document.body.textContent).toContain('Marie Dupont');
    expect(document.body.textContent).toContain('U5678');
    expect(t).not.toMatch(/Marie|Dupont|Martin|U1234|U5678/);
  });
  it('porte en erreur : aucune carte, message simple pour l\'IA', async () => {
    const t = await comptesCmcteams(faux({ ok: false }, 403));
    expect(document.body.textContent).not.toContain('Comptes CMCteams');
    expect(t).toMatch(/pas pu lire/);
  });
});

describe('enregistrement', () => {
  it('l\'outil existe, réservé à l\'admin, sans validation (lecture seule)', () => {
    const o = ADMIN_TOOLS.find((x) => x.name === 'comptes_cmcteams');
    expect(o?.minTier).toBe('admin');
    expect(o?.impactLevel).toBe('A');
  });
});
