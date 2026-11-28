import { afterEach, describe, expect, it } from 'vitest';

import { aideEcriture, demandeEcritureArbre, demandeMessageDirect, repondreLocalement } from '../../features/chat/chat-outils-locaux';

/* pc-config 3092 (mesure réelle sur v13.4.416, modèle groq gratuit) : « ajoute le commentaire "test carte" à la fiche de … » → AUCUN outil appelé, le modèle INVENTE « Modification appliquée :
   data/team.json… commit automatisé » ; « écris à … dans CMCteams : test » → « Message envoyé » (FAUX). Les phrases ci-dessous sont celles du test. */
const JET = 'v1.' + 'a'.repeat(40) + '.' + 'b'.repeat(64);
const PROP = { action: 'arbre_commentaire', titre: 'Ajouter un commentaire', icone: '💬', risque: 'faible', resume: 'Ajouter le commentaire « test carte » à la fiche de Marie Dupont.', jeton: JET };
afterEach(() => { document.body.innerHTML = ''; });

describe('demandeEcritureArbre', () => {
  it('commentaire (la phrase du test de pc-config)', () => {
    expect(demandeEcritureArbre('ajoute le commentaire "test carte" à la fiche de Marie Dupont')).toEqual({ action: 'arbre_commentaire', champs: { personne: 'Marie Dupont', texte: 'test carte' } });
    expect(demandeEcritureArbre('Ajoute le commentaire « vu en 1990 à Nice » à la fiche de Jean-Paul Roux.')).toEqual({ action: 'arbre_commentaire', champs: { personne: 'Jean-Paul Roux', texte: 'vu en 1990 à Nice' } });
  });
  it('info : téléphone, e-mail, site', () => {
    expect(demandeEcritureArbre('ajoute le téléphone 06 12 34 56 78 à la fiche de Marie Dupont')).toEqual({ action: 'arbre_info', champs: { personne: 'Marie Dupont', type: 'Téléphone', valeur: '06 12 34 56 78' } });
    expect(demandeEcritureArbre('ajoute l\'e-mail marie@exemple.fr à la fiche de Marie Dupont')).toMatchObject({ action: 'arbre_info', champs: { type: 'E-mail', valeur: 'marie@exemple.fr' } });
  });
  it('champ : date de naissance (jj/mm/aaaa → AAAA-MM-JJ), « corrige » = remplacer', () => {
    expect(demandeEcritureArbre('corrige la date de naissance de Louis Maiffret : 16/06/1880')).toEqual({ action: 'arbre_champ', champs: { personne: 'Louis Maiffret', champ: 'naissance.date', valeur: '1880-06-16', remplacer: true } });
    expect(demandeEcritureArbre('renseigne le métier de Louis Maiffret : tailleur')).toEqual({ action: 'arbre_champ', champs: { personne: 'Louis Maiffret', champ: 'metier', valeur: 'tailleur', remplacer: false } });
  });
  it.each(['ajoute le commentaire à la fiche de Marie', 'bonjour', 'comment ajouter une fiche ?', 'ajoute un commentaire', 'peux-tu me dire qui est Marie Dupont ?', 'ajoute le commentaire x à la fiche'])('pas assez net : « %s »', (t) => {
    expect(demandeEcritureArbre(t)).toBeNull();
  });
});

describe('demandeMessageDirect', () => {
  it.each([
    ['écris à Marie Dupont dans CMCteams : test', 'Marie Dupont', 'test'],
    ['Envoie un message à Léa Martin dans la light - rendez-vous demain', 'Léa Martin', 'rendez-vous demain'],
    ['dis à Jean-Paul Roux dans CMCteams que la réunion est à 14 h', 'Jean-Paul Roux', 'la réunion est à 14 h'],
  ])('« %s »', (t, nom, texte) => { expect(demandeMessageDirect(t)).toEqual({ nom, texte }); });
  it.each(['écris à Marie', 'écris à Marie dans CMCteams', 'écris à Marie sur Apex Chat : x', 'comment écrire à quelqu\'un dans CMCteams : exemple', 'dis à Marie bonjour'])('pas pour nous : « %s »', (t) => { expect(demandeMessageDirect(t)).toBeNull(); });
});

describe('aideEcriture : jamais un « c\'est fait » inventé', () => {
  it('une demande d\'écriture dans l\'arbre pas assez nette → aide locale, « je n\'ai rien modifié »', () => {
    const a = aideEcriture('ajoute une info à la fiche de Marie');
    expect(a).toMatch(/Pour écrire dans l'arbre/); expect(a).toMatch(/Je n'ai rien modifié/);
  });
  it('un message vers CMCteams pas assez net → aide locale, « je n\'ai rien envoyé »', () => {
    const a = aideEcriture('écris à Marie dans CMCteams'); expect(a).toMatch(/Je n'ai rien envoyé/);
  });
  it.each(['bonjour', 'quelle heure est-il', 'résume cette page', 'ajoute 2 et 3'])('une phrase ordinaire n\'est pas touchée : « %s »', (t) => { expect(aideEcriture(t)).toBeNull(); });
});

describe('pc-config 3162 (mesure réelle 13.4.417, 0 carte sur 5) : les phrases réelles ne partent JAMAIS au modèle', () => {
  it.each([
    'mets le champ naissance de la fiche Zzzzzz Qqqqq à 1900',
    'envoie un message à Zzzzzz Qqqqq : bonjour test',
    'envoie un message à Zzzzzz Qqqqq',
    'écris un message à Zzzzzz Qqqqq : bonjour',
    'change le champ naissance de la fiche Zzzzzz Qqqqq en 1900',
    'supprime la fiche de Zzzzzz Qqqqq',
  ])('« %s » → aide locale qui dit « rien modifié / rien envoyé »', (t) => {
    const a = aideEcriture(t);
    expect(a).not.toBeNull(); expect(a).toMatch(/Je n'ai rien (modifié|envoyé)/);
  });
  it('« ajoute un commentaire à la fiche de X : texte » (forme naturelle) → la carte, avec la personne et le texte', () => {
    expect(demandeEcritureArbre('ajoute un commentaire à la fiche de Marie Dupont : test parité')).toEqual({ action: 'arbre_commentaire', champs: { personne: 'Marie Dupont', texte: 'test parité' } });
  });
  it.each(['mets-moi la fiche technique en PDF', 'envoie-moi la météo', 'dis à voix haute la fiche', 'écris à Paul une lettre de remerciement'])('une phrase ordinaire n\'est pas détournée : « %s »', (t) => { expect(aideEcriture(t)).toBeNull(); });
});

describe('chat : la carte passe AVANT le modèle', () => {
  it('« ajoute le commentaire … » → carte de confirmation, aucun appel d\'exécution, phrase sans nom ni texte', async () => {
    const appels: string[] = [];
    const f = (async (u: string) => { appels.push(u); return new Response(JSON.stringify({ ok: true, proposition: PROP })); }) as unknown as typeof fetch;
    const r = await repondreLocalement('ajoute le commentaire "test carte" à la fiche de Marie Dupont', f);
    expect(appels).toEqual(['/__admin/proposer']);   // jamais /__javis/agir avant le bouton
    expect(r).toMatch(/carte de confirmation est affichée/); expect(r).not.toMatch(/Marie|Dupont|test carte|appliquée|commit/i);
    expect(document.querySelector('.ax-proposition-resume')?.textContent).toMatch(/Marie Dupont/);
  });
  it('« écris à … dans CMCteams : test » → carte de message, rien d\'envoyé', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, proposition: { ...PROP, action: 'message_direct', resume: 'Écrire à Marie Dupont : « test ».' } }))) as unknown as typeof fetch;
    const r = await repondreLocalement('écris à Marie Dupont dans CMCteams : test', f);
    expect(r).toMatch(/carte de confirmation est affichée/); expect(r).toMatch(/Rien n'est envoyé avant/); expect(r).not.toMatch(/envoyé à|délivré|bien été/i);
  });
  it('nom inconnu → le domaine refuse, le chat le dit (aucune fiche inventée, aucune carte)', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: false, reason: 'introuvable', texte: 'Je ne trouve personne à ce nom dans l\'arbre.' }), { status: 404 })) as unknown as typeof fetch;
    const r = await repondreLocalement('ajoute le commentaire x à la fiche de Zzzzzz Qqqqq', f);
    expect(r).toMatch(/Je ne trouve personne à ce nom/); expect(document.querySelector('.ax-proposition-resume')).toBeNull();
  });
  it('demande d\'écriture trop floue → aide locale (le modèle n\'est pas appelé)', async () => {
    let appels = 0; const f = (async () => { appels++; return new Response('{}'); }) as unknown as typeof fetch;
    const r = await repondreLocalement('modifie la fiche de Marie', f);
    expect(r).toMatch(/Je n'ai rien modifié/); expect(appels).toBe(0);
  });
});

describe('arbre_lien : « relie X comme père de Y »', () => {
  it('relier deux fiches existantes → carte arbre_lien (X = id2, Y = fiche de départ)', () => {
    expect(demandeEcritureArbre('relie Jean Roux comme père de Marie Dupont')).toEqual({ action: 'arbre_lien', champs: { personne: 'Marie Dupont', personne2: 'Jean Roux', lien: 'pere' } });
    expect(demandeEcritureArbre('Rattache Anne Roux comme la conjointe de Paul Martin.')).toEqual({ action: 'arbre_lien', champs: { personne: 'Paul Martin', personne2: 'Anne Roux', lien: 'conjoint' } });
    expect(demandeEcritureArbre("relie Léa Roux comme l'enfant de Jean Roux")).toMatchObject({ action: 'arbre_lien', champs: { lien: 'enfant' } });
  });
  it('un lien inconnu ou une phrase ordinaire ne déclenche rien', () => {
    expect(demandeEcritureArbre('relie Jean Roux comme voisin de Marie Dupont')).toBeNull();
    expect(demandeEcritureArbre('relie mon téléphone comme source de musique')).toBeNull();
    expect(demandeEcritureArbre('parle-moi comme le père de Marie')).toBeNull();
  });
  it('la phrase passe par la porte avec personne et personne2, jamais un faux succès', async () => {
    const appels: Array<{ url: string; corps: Record<string, unknown> }> = [];
    const f = (async (url: string, init?: { body?: string }) => { appels.push({ url: String(url), corps: JSON.parse(String(init?.body ?? '{}')) }); return new Response(JSON.stringify({ ok: false, reason: 'introuvable', texte: 'Je ne trouve personne à ce nom dans l\'arbre.' }), { status: 404 }); }) as unknown as typeof fetch;
    const r = await repondreLocalement('relie Jean Roux comme père de Marie Dupont', f);
    expect(appels[0]?.url).toContain('/__admin/proposer');
    expect(appels[0]?.corps).toMatchObject({ action: 'arbre_lien', personne: 'Marie Dupont', personne2: 'Jean Roux', lien: 'pere' });
    expect(r).toContain('🌳');
  });
});

describe('capture de Kevin 28.11 : la précision entre parenthèses et le faux « enregistré »', () => {
  it('« corrige la date de naissance de X (née le …) : 16/06/1880 » → carte arbre_champ, la précision part avec le nom', () => {
    expect(demandeEcritureArbre('corrige la date de naissance de Laurence Saint-Polit (née le 05/06/1950) : 16/06/1880')).toEqual({ action: 'arbre_champ', champs: { personne: 'Laurence Saint-Polit née le 05/06/1950', champ: 'naissance.date', valeur: '1880-06-16', remplacer: true } });
    expect(demandeEcritureArbre('ajoute le commentaire "vu à Nice" à la fiche de Jean Roux (1920)')).toEqual({ action: 'arbre_commentaire', champs: { personne: 'Jean Roux 1920', texte: 'vu à Nice' } });
    expect(demandeEcritureArbre('ajoute le téléphone 06 00 00 00 00 à la fiche de Jean Roux (né en 1950)')).toMatchObject({ action: 'arbre_info', champs: { personne: 'Jean Roux né en 1950' } });
  });
  it('sans parenthèses rien ne change', () => {
    expect(demandeEcritureArbre('corrige la date de naissance de Louis Maiffret : 16/06/1880')).toMatchObject({ champs: { personne: 'Louis Maiffret' } });
  });
  it('une demande qui parle d\'un champ de fiche mais reste floue reçoit l\'AIDE, jamais le modèle (plus de faux « enregistré »)', () => {
    expect(aideEcriture('corrige la date de naissance de Laurence Saint-Polit, c\'est 1880')).toContain('carte');
    expect(aideEcriture('change le métier de Paul Martin en menuisier svp')).toContain('carte');
    expect(aideEcriture('change la date de décès de Paul Martin')).toContain('carte');
  });
  it('les phrases ordinaires restent au modèle', () => {
    expect(aideEcriture('change la date de mon rendez-vous')).toBeNull();
    expect(aideEcriture('raconte-moi le métier de boulanger')).toBeNull();
  });
});

describe('pc-connecteurs 3444 (v13.4.422) : « relie A (1979) comme père de B (2007) » donnait « Mise à jour effectuée » sans carte', () => {
  it('l\'année entre parenthèses de CHAQUE nom part avec lui, la carte arbre_lien est proposée', () => {
    expect(demandeEcritureArbre('relie Jean Roux (1979) comme père de Marie Dupont (2007)')).toEqual({ action: 'arbre_lien', champs: { personne: 'Marie Dupont 2007', personne2: 'Jean Roux 1979', lien: 'pere' } });
    expect(demandeEcritureArbre('relie Jean Roux comme père de Marie Dupont (2007).')).toMatchObject({ action: 'arbre_lien', champs: { personne: 'Marie Dupont 2007', personne2: 'Jean Roux' } });
  });
});
