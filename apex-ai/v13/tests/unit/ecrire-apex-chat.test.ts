import { afterEach, describe, expect, it } from 'vitest';

import { carteEcrireHtml, chargerEcrire, ecrireApexChat, lireReponseEcrire, LIEN_APEX_CHAT } from '../../services/admin/ecrire-apex-chat';

const LIEN = 'https://apex-chat.kd-mc.com/?to=kdmc_marie-dupont&texte=Bonjour%20Marie';
const rep = (corps: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(corps), { status })) as typeof fetch;
afterEach(() => { document.body.innerHTML = ''; });

describe('ecrire-apex-chat : lecture de la réponse du domaine', () => {
  it('garde les liens Apex Chat stricts, rien d\'autre', () => {
    const r = lireReponseEcrire({ ok: true, correspondances: 4, trouves: [
      { nom: 'Marie Dupont', lien: LIEN },
      { nom: 'Piège http', lien: 'http://apex-chat.kd-mc.com/?to=kdmc_x1&texte=a' },
      { nom: 'Piège autre hôte', lien: 'https://evil.example/?to=kdmc_x1&texte=a' },
      { nom: 'Piège hôte collé', lien: 'https://apex-chat.kd-mc.com.evil.example/?to=kdmc_x1&texte=a' },
      { nom: 'Piège js', lien: 'javascript:alert(1)' },
    ] });
    expect(r?.cibles).toEqual([{ nom: 'Marie Dupont', lien: LIEN }]);
    expect(LIEN_APEX_CHAT.test('https://apex-chat.kd-mc.com/?to=ab&texte=x')).toBe(false);
  });
  it('refus ou réponse illisible → null', () => {
    expect(lireReponseEcrire({ ok: false })).toBeNull(); expect(lireReponseEcrire(null)).toBeNull(); expect(lireReponseEcrire('x')).toBeNull();
  });
  it('5 personnes au plus', () => {
    const trouves = Array.from({ length: 9 }, (_, i) => ({ nom: 'P' + i, lien: `https://apex-chat.kd-mc.com/?to=kdmc_p${i}x&texte=a` }));
    expect(lireReponseEcrire({ ok: true, trouves })?.cibles).toHaveLength(5);
  });
});

describe('ecrire-apex-chat : appel de la porte et carte', () => {
  it('appelle la porte avec le nom ET le texte encodés, cookie de session', async () => {
    let url = ''; let init: RequestInit | undefined;
    const f = (async (u: string, i?: RequestInit) => { url = u; init = i; return new Response(JSON.stringify({ ok: true, trouves: [], correspondances: 0 })); }) as unknown as typeof fetch;
    await chargerEcrire('Marie Dupont', 'Salut, ça va ?', f);
    expect(url).toBe('/__admin/ecrire-apex-chat?q=Marie%20Dupont&texte=Salut%2C%20%C3%A7a%20va%20%3F'); expect(init?.credentials).toBe('include');
  });
  it('401/403 → raison lisible', async () => {
    expect(await chargerEcrire('Marie', 'x', rep({}, 403))).toEqual({ ok: false, raison: 'session admin non reconnue ici : ouvre Apex AI connecté en admin' });
  });
  it('la carte : un lien <a target=_blank rel=noopener> par personne, texte échappé, jamais window.open', () => {
    const h = carteEcrireHtml([{ nom: 'Marie <b>', lien: LIEN }], '<script>x</script>');
    expect(h).toMatch(/<a [^>]*class="ax-btn ax-btn-primary ax-ecrire"[^>]*href="https:\/\/apex-chat\.kd-mc\.com\/\?to=kdmc_marie-dupont[^"]*"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(h).not.toMatch(/<script>|<b>/); expect(h).not.toMatch(/window\.open|onclick/);
  });
});

describe('ecrire-apex-chat : l\'outil', () => {
  it('une personne → bouton affiché ; la phrase rendue à l\'IA ne contient NI nom NI lien NI texte', async () => {
    const t = await ecrireApexChat('Marie Dupont', 'Texte secret de Kevin', rep({ ok: true, correspondances: 1, trouves: [{ nom: 'Marie Dupont', lien: LIEN }] }));
    expect(t).toMatch(/^Bouton « ✍️ Écrire » prêt/);
    expect(t).not.toMatch(/Marie|Dupont|apex-chat\.kd-mc|kdmc_|Texte secret/);
    expect(document.querySelector('a.ax-ecrire')?.getAttribute('href')).toBe(LIEN);
  });
  it('rien ne s\'envoie ni ne s\'ouvre tout seul', async () => {
    let ouvert = 0; const avant = window.open; window.open = (() => { ouvert++; return null; }) as typeof window.open;
    await ecrireApexChat('Marie Dupont', 'Bonjour', rep({ ok: true, correspondances: 1, trouves: [{ nom: 'Marie Dupont', lien: LIEN }] }));
    window.open = avant; expect(ouvert).toBe(0);
  });
  it('plusieurs correspondances → un bouton chacun', async () => {
    const t = await ecrireApexChat('Marie', 'Bonjour', rep({ ok: true, correspondances: 2, trouves: [
      { nom: 'Marie A', lien: 'https://apex-chat.kd-mc.com/?to=kdmc_a-marie&texte=Bonjour' }, { nom: 'Marie B', lien: 'https://apex-chat.kd-mc.com/?to=kdmc_b-marie&texte=Bonjour' }] }));
    expect(t).toMatch(/^2 personnes/); expect(document.querySelectorAll('a.ax-ecrire')).toHaveLength(2);
  });
  it('aucun compte / nom ou texte manquant / porte en panne : phrases claires, aucune carte', async () => {
    expect(await ecrireApexChat('Zzz', 'x', rep({ ok: true, correspondances: 0, trouves: [] }))).toMatch(/Aucun compte/);
    expect(await ecrireApexChat('', 'x', rep({}))).toMatch(/à qui écrire/); expect(await ecrireApexChat('Marie', '  ', rep({}))).toMatch(/ce que tu veux écrire/);
    expect(await ecrireApexChat('Marie', 'x', rep({}, 500))).toMatch(/pas pu préparer/);
    expect(document.querySelector('a.ax-ecrire')).toBeNull();
  });
});
