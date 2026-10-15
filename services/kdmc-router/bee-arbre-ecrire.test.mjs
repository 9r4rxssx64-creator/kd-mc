/* GARDE — « JE VEUX QU'IL PUISSE MODIFIER, CHERCHER, ARRANGER… PARTOUT COMME TOI ET APEX » (Kevin 15.10.2026, dans l'arbre).
 * Avec le VRAI routeur, une fausse IA gratuite et un FAUX Firebase qui se comporte comme le vrai (clés rangées par ordre alphabétique, tableaux vides
 * et null supprimés, PATCH par champ) — pour que les pièges du vrai nuage soient testés, pas supposés :
 *   1. les fonctions pures : une info s'AJOUTE (jamais de doublon), un champ vide se REMPLIT, un champ rempli ne change que sur « remplace », rien n'est
 *      supprimé, un lien incohérent est refusé, le contrôle des pertes voit toute disparition ;
 *   2. le nuage : copie de sauvegarde écrite ET RELUE avant d'écrire (sinon rien n'est écrit), écriture champ par champ (les photos ne sont ni lues ni
 *      réécrites), relecture après (sinon l'ancienne valeur est remise), 40 copies gardées, jamais de fiche écrasée à la création ;
 *   3. par le serveur de Bee : l'IA lit, cherche l'identifiant, PROPOSE ; rien n'est écrit avant le ✅ ; le résumé que Kevin lit vient du DOMAINE (vrai nom
 *      de la fiche, ancienne valeur) ; la signature, l'origine, la session admin, l'usage unique, la confirmation sont exigés ; un autre compte n'écrit rien ;
 *   4. une fiche qui a changé entre la carte et le bouton n'est pas écrasée ; l'interrupteur BEE_ARBRE_ECRIRE=0 coupe tout ;
 *   5. l'empreinte du code famille n'apparaît dans AUCUNE réponse ; 0 € : aucun moteur payant.
 * node services/kdmc-router/bee-arbre-ecrire.test.mjs */
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import {
  FB, FB_KEY, TYPES_INFO, CHAMPS, GARDES_MAX, nuage, canon, cleInfo, listeInfos, trouverPertes, preparerInfo, preparerChamp, preparerCommentaire, preparerLien,
  ACTIONS_ARBRE, NOMS_ACTIONS_ARBRE, auditerSeed, chercherDoublon, outilsBilan, REGLES_ARBRE_ECRIRE,
} from './bee-arbre-ecrire.js';
import { CATALOGUE, REGLES_AGIR } from './bee-agir.js';
import { fiche as ficheTexte } from './bee-arbre.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 400) : '')); } };
const refuse = async (f, re) => { try { await f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const sha = (t) => createHash('sha256').update(t).digest('hex');

/* ───────── 1. les fonctions pures ───────── */
const ZELIE = { id: 'p1', prenom: 'Zélie', nom: 'TESTARD', sexe: 'F', vivant: true, naissance: { date: '1981-10-02', lieu: 'Valmont-sur-Mer' }, metier: 'vendeuse', pere: 'p2', mere: 'p3', conjoints: ['p4'],
  infos: [{ type: 'Téléphone', libelle: 'portable', valeur: '06 11 22 33 44', par: 'Kevin', le: 1 }], comments: [{ id: 'c1', text: 'Aime les arbres', by: 'Luka', ts: 5 }] };
ok(TYPES_INFO.length === 11 && TYPES_INFO.includes('Téléphone') && CHAMPS.length === 6 && GARDES_MAX === 40, '1. types d\'info (11), champs (6) et 40 copies gardées');
ok(cleInfo({ type: 'Téléphone', libelle: 'Portable', valeur: '06.11.22.33.44' }) === cleInfo({ type: 'telephone', libelle: 'portable', valeur: '06 11 22 33 44' }), '1b. la clé d\'une info est celle de l\'app (téléphone sans espaces ni points, accents et casse ignorés)');
{ const r = preparerInfo(ZELIE, { type: 'E-mail', libelle: 'perso', valeur: 'zelie@example.org' });
  ok(r.patch && r.patch.infos.length === 2 && r.patch.infos[0].valeur === '06 11 22 33 44' && r.patch.infos[1].valeur === 'zelie@example.org' && r.patch.infos[1].par === 'Kevin (via Bee)', '1c. une info s\'AJOUTE à celles qui existent (l\'ancienne reste, la nouvelle dit qui l\'a ajoutée)');
  ok(/AJOUTER à la fiche de Zélie TESTARD/.test(r.phrase) && /zelie@example\.org/.test(r.phrase), '1d. la phrase lue par Kevin porte le vrai nom'); }
ok(/existe déjà/.test(preparerInfo(ZELIE, { type: 'Téléphone', libelle: 'portable', valeur: '06-11-22-33-44' }).erreur), '1e. la même info (autre écriture du numéro) : refusée, pas de doublon');
ok(/Type d'info inconnu/.test(preparerInfo(ZELIE, { type: 'Pirate', valeur: 'x' }).erreur) && /valeur/.test(preparerInfo(ZELIE, { type: 'Loisir', valeur: '  ' }).erreur), '1f. type inventé ou valeur vide : refusés');
{ const r = preparerChamp(ZELIE, { champ: 'deces.date', valeur: '2030-01-05' });
  ok(r.patch && r.patch.deces.date === '2030-01-05' && r.patch.vivant === false && /décédé/.test(r.phrase), '1g. une date de décès remplit le champ vide ET passe la fiche en « décédé(e) » (dit à Kevin)'); }
ok(/déjà rempli/.test(preparerChamp(ZELIE, { champ: 'metier', valeur: 'coiffeuse' }).erreur) && /redemande avec remplacer/.test(preparerChamp(ZELIE, { champ: 'metier', valeur: 'coiffeuse' }).erreur), '1h. un champ DÉJÀ rempli ne change pas sans « remplace »');
{ const r = preparerChamp(ZELIE, { champ: 'metier', valeur: 'coiffeuse', remplacer: true });
  ok(r.patch.metier === 'coiffeuse' && /REMPLACER son métier de Zélie TESTARD : « vendeuse » → « coiffeuse »/.test(r.phrase) && /tiroir de sauvegarde/.test(r.phrase), '1i. « remplace » : la carte montre avant → après et dit où l\'ancienne valeur reste'); }
ok(/C'est déjà/.test(preparerChamp(ZELIE, { champ: 'metier', valeur: 'vendeuse', remplacer: true }).erreur), '1j. remplacer par la même valeur : rien à faire');
ok(/Champ inconnu/.test(preparerChamp(ZELIE, { champ: 'nom', valeur: 'X' }).erreur) && /AAAA-MM-JJ/.test(preparerChamp(ZELIE, { champ: 'deces.date', valeur: 'le 5 janvier' }).erreur) && /« M » ou « F »/.test(preparerChamp(ZELIE, { champ: 'sexe', valeur: 'zzz', remplacer: true }).erreur), '1k. le NOM ne se change pas par ce chemin ; une date vague et un sexe absurde sont refusés');
{ const r = preparerChamp({ prenom: 'Léon', nom: 'X' }, { champ: 'naissance.lieu', valeur: 'Nice' });
  ok(r.patch.naissance.lieu === 'Nice' && !('vivant' in r.patch), '1l. un champ imbriqué sur une fiche sans naissance : créé sans toucher à « vivant »'); }
{ const r = preparerCommentaire(ZELIE, { texte: 'Retrouvée sur le registre de 1900' });
  ok(r.patch.comments.length === 2 && r.patch.comments[0].text === 'Aime les arbres' && r.patch.comments[1].by === 'Kevin (via Bee)', '1m. un commentaire s\'AJOUTE, les anciens restent'); }
ok(/Il manque le texte/.test(preparerCommentaire(ZELIE, { texte: '<>' }).erreur), '1n. un commentaire vide (ou fait de balises) est refusé');

const FONCTION = (o) => Object.assign({ id: 'pX', prenom: 'Néo', nom: 'NEUF' }, o || {});
{ const r = preparerLien(ZELIE, 'p1', { lien: 'enfant', prenom: 'Capucine', nom: 'TESTARD', naissance_date: '2010-05-01' }, null, '', '');
  ok(r.creations.length === 1 && r.creations[0].fiche.mere === 'p1' && r.ecritures.length === 0 && r.creations[0].fiche.naissance.date === '2010-05-01', '1o. créer un enfant d\'une femme : la nouvelle fiche porte « mère = elle », la fiche de départ n\'est même pas touchée');
  ok(/CRÉER la fiche de Capucine TESTARD/.test(r.phrase) && /Rien n'est supprimé/.test(r.phrase), '1p. la phrase dit CRÉER et « rien n\'est supprimé »'); }
{ const r = preparerLien(ZELIE, 'p1', { lien: 'conjoint', prenom: 'Léon', nom: 'DUPONT' }, null, '', '');
  ok(r.creations[0].fiche.conjoints[0] === 'p1' && r.ecritures.length === 1 && r.ecritures[0].patch.conjoints.join() === 'p4,' + r.nouvelId, '1q. créer un conjoint : liens dans LES DEUX sens, les conjoints déjà là restent'); }
{ const autre = FONCTION({ sexe: 'F' });
  ok(/incohérent/.test(preparerLien({ prenom: 'A', nom: 'B' }, 'p9', { lien: 'pere' }, autre, 'pX', '').erreur), '1r. une femme comme « père » : refusé');
  ok(/déjà un père/.test(preparerLien(ZELIE, 'p1', { lien: 'pere' }, FONCTION({ sexe: 'M' }), 'pX', '').erreur), '1s. un père déjà enregistré n\'est jamais remplacé');
  ok(/renseigne d'abord son sexe/.test(preparerLien({ prenom: 'A', nom: 'B' }, 'p9', { lien: 'enfant' }, autre, 'pX', '').erreur), '1t. « enfant » d\'une personne sans sexe : on demande, on ne devine pas');
  ok(/déjà liés/.test(preparerLien(ZELIE, 'p1', { lien: 'conjoint' }, { prenom: 'Léon', nom: 'D', conjoints: ['p1'] }, 'p4', '').erreur), '1u. deux conjoints déjà liés : rien à faire'); }
ok(/déjà dans l'arbre/.test(preparerLien(ZELIE, 'p1', { lien: 'enfant', prenom: 'Octave', nom: 'TESTARD' }, null, '', 'Octave TESTARD [id : p2]').erreur) && /Lien inconnu/.test(preparerLien(ZELIE, 'p1', { lien: 'cousin' }, null, '', '').erreur), '1v. un homonyme exact : on propose de RELIER, pas de créer un doublon ; un lien inventé est refusé');

ok(trouverPertes(ZELIE, Object.assign({}, ZELIE, { prenom: '' })).length === 1 && trouverPertes(ZELIE, Object.assign({}, ZELIE, { comments: [] })).some((x) => /comments/.test(x)) && trouverPertes(ZELIE, Object.assign({}, ZELIE, { infos: [] })).some((x) => /infos/.test(x)), '1w. le contrôle des pertes voit un nom effacé, des commentaires et des infos disparus');
ok(trouverPertes(ZELIE, Object.assign({}, ZELIE, preparerInfo(ZELIE, { type: 'Loisir', valeur: 'tennis' }).patch)).length === 0 && trouverPertes(ZELIE, Object.assign({}, ZELIE, { metier: 'coiffeuse' })).length === 0, '1x. ajouter ou remplacer une valeur n\'est PAS une perte');
ok(JSON.stringify(canon({ b: 1, a: { d: [], c: null, e: 2 } })) === '{"a":{"e":2},"b":1}', '1y. canon : clés rangées, null et tableaux vides ignorés (comme Firebase)');
ok(Object.keys(ACTIONS_ARBRE).join() === 'arbre_info,arbre_champ,arbre_commentaire,arbre_lien' && NOMS_ACTIONS_ARBRE.every((n) => CATALOGUE[n]), '1z. les 4 actions de l\'arbre sont dans la liste blanche de Bee (rien d\'autre, pas de suppression)');
ok(!NOMS_ACTIONS_ARBRE.some((n) => /suppr|efface|delete|fusion/i.test(n)) && !/supprime la fiche|fusionne/i.test(REGLES_ARBRE_ECRIRE.replace(/ne supprimes JAMAIS/, '')), '1zz. aucune action de suppression ni de fusion n\'existe');

/* ───────── 2. le nuage, avec un faux Firebase fidèle ───────── */
const CH = sha('code-famille-de-test');            /* l'empreinte du code famille (jamais le code) */
const TIROIR = '/arbre/' + sha(CH + ':sauvegardes');
const vraiFetch = globalThis.fetch;
let BD = {}; let VU = []; let PANNE = {}; const IA_SCRIPT = { cerebras: [], groq: [] }; let IA_VUES = []; let reseau = [];
const tousTextes = [];   /* tout ce que le serveur dit à Kevin / à l'IA, pour y chercher l'empreinte */
function normaliser(v) { if (Array.isArray(v)) { const a = v.map(normaliser).filter((x) => x !== null); return a.length ? a : null; } if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) { const n = normaliser(v[k]); if (n !== null) o[k] = n; } return Object.keys(o).length ? o : null; } return v === undefined ? null : v; }
const seg = (chemin) => chemin.replace(/^\/+/, '').split('/').filter(Boolean).map(decodeURIComponent);
function noeud(chemin, creer) { let n = BD; for (const s of seg(chemin)) { if (n == null || typeof n !== 'object') return undefined; if (!(s in n)) { if (!creer) return undefined; n[s] = {}; } n = n[s]; } return n; }
function poser(chemin, v) { const s = seg(chemin); if (!s.length) { BD = normaliser(v) || {}; return; } const pere = noeud('/' + s.slice(0, -1).join('/'), true); const n = normaliser(v); if (n === null) delete pere[s[s.length - 1]]; else pere[s[s.length - 1]] = n; }
function faussaire(url, init) {
  const u = new URL(String(url && url.url ? url.url : url)); const m = (init && init.method) || (url && url.method) || 'GET';
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  if (/identitytoolkit/.test(u.hostname)) { VU.push({ m, chemin: 'signUp' }); return R({ idToken: 'jeton-anonyme' }); }
  if (u.hostname !== new URL(FB).hostname) return null;
  if (!u.searchParams.get('auth')) return R({ error: 'Permission denied' }, 401);
  const chemin = decodeURIComponent(u.pathname).replace(/\.json$/, ''); const corps = init && init.body ? JSON.parse(init.body) : null;
  VU.push({ m, chemin, corps, shallow: u.searchParams.get('shallow') });
  if (m === 'GET') {
    if (PANNE.lireVide && PANNE.lireVide.test(chemin)) return R(null);
    const n = noeud(chemin); if (n === undefined) return R(null);
    if (u.searchParams.get('shallow') === 'true') return R(n && typeof n === 'object' ? Object.fromEntries(Object.keys(n).map((k) => [k, true])) : n);
    return R(n);
  }
  if (m === 'PUT') { if (PANNE.copieNonEcrite && chemin.startsWith(TIROIR)) return R(corps); poser(chemin, corps); return R(corps); }
  if (m === 'PATCH') {
    if (PANNE.patchPerdu) return R(corps);
    if (PANNE.patchCorrompu) { PANNE.patchCorrompu = false; const n2 = noeud(chemin, true); for (const k of Object.keys(corps)) if (k !== 'updatedAt' && k !== 'updatedBy') n2[k] = 'CORROMPU'; return R(corps); }
    const n = noeud(chemin, true);
    for (const k of Object.keys(corps)) { if (corps[k] === null) delete n[k]; else { const nv = normaliser(corps[k]); if (nv === null) delete n[k]; else n[k] = nv; } }
    return R(corps);
  }
  if (m === 'DELETE') { poser(chemin, null); return R(null); }
  return R({ error: 'méthode non prévue' }, 400);
}
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url); reseau.push(u);
  const f = faussaire(url, init); if (f) return f;
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const PHOTO = 'PHOTO_TRES_LOURDE_NE_JAMAIS_LIRE';
function peuplerNuage() {
  BD = { arbre: { [CH]: { persons: {
    p1: Object.assign({}, ZELIE, { photos: [{ id: 'ph1', data: PHOTO }], sources: [{ id: 's1', titre: 'acte de naissance' }], notes: 'Notes de Zélie', updatedAt: 100, updatedBy: 'Luka' }),
    p2: { id: 'p2', prenom: 'Octave', nom: 'TESTARD', sexe: 'M', vivant: true, conjoints: ['p3'], updatedAt: 100 },
    p3: { id: 'p3', prenom: 'Capucine', nom: 'MARTIN', sexe: 'F', vivant: true, conjoints: ['p2'], updatedAt: 100 },
    p4: { id: 'p4', prenom: 'Léon', nom: 'DUPONT', sexe: 'M', vivant: true, conjoints: ['p1'], updatedAt: 100 },
    p5: { id: 'p5', prenom: 'Mireille', nom: 'DUPONT', vivant: false, updatedAt: 100 },
  } } } };
  BD.arbre[CH].persons.p1 = normaliser(BD.arbre[CH].persons.p1);
  VU = []; PANNE = {};
}
const cloud = (id) => BD.arbre[CH].persons[id];
const ecritures = () => VU.filter((x) => x.m !== 'GET' && x.chemin !== 'signUp');
const nb = (t) => VU.filter((x) => x.m === t).length;

peuplerNuage();
let t = 1000000;
const cl = nuage({ fetchFn: faussaire2, codehash: async () => CH, now: () => ++t });
async function faussaire2(url, init) { return faussaire(url, init); }
{ const p = await cl.lire('p1');
  ok(p && p.prenom === 'Zélie' && p.infos.length === 1 && p.naissance.lieu === 'Valmont-sur-Mer', '2. lire : la fiche et ses champs utiles');
  ok(!VU.some((x) => /photos|sources\.json$|documents/.test(x.chemin) && x.m === 'GET'), '2b. lire ne touche NI aux photos NI aux documents (temps de calcul gratuit)');
  ok(await cl.lire('inconnu1') === null, '2c. une fiche inexistante : null, pas une erreur'); }
ok(await refuse(() => cl.lire('../etc'), /identifiant/) && await refuse(() => cl.lire('a b'), /identifiant/), '2d. un identifiant bizarre est refusé avant tout appel');
ok(await refuse(() => nuage({ fetchFn: faussaire2, codehash: async () => 'pas-un-hash' }).lire('p1'), /pas encore publié/), '2e. sans empreinte de code publiée sur le domaine : refus clair');
{ VU = [];
  const avant = await cl.lire('p1');
  const r = preparerInfo(avant, { type: 'Loisir', libelle: 'sport', valeur: 'tennis' });
  const sortie = await cl.patcher('p1', avant, r.patch, 'bee');
  const w = ecritures();
  ok(w.length >= 2 && w[0].m === 'PUT' && w[0].chemin.startsWith(TIROIR + '/b-') && VU.findIndex((x) => x.m === 'GET' && x.chemin.startsWith(TIROIR) && x.chemin.endsWith('/id')) < VU.findIndex((x) => x.m === 'PATCH'), '2f. la COPIE est écrite puis RELUE avant la première écriture sur la fiche');
  const pa = VU.find((x) => x.m === 'PATCH');
  ok(pa.chemin === '/arbre/' + CH + '/persons/p1' && Object.keys(pa.corps).sort().join() === 'infos,updatedAt,updatedBy' && pa.corps.updatedBy === 'Kevin (via Bee)', '2g. l\'écriture ne touche QUE les champs changés (+ date et auteur) — pas un seul autre champ');
  ok(!JSON.stringify(VU.map((x) => x.corps)).includes(PHOTO) && cloud('p1').photos[0].data === PHOTO && cloud('p1').sources.length === 1 && cloud('p1').notes === 'Notes de Zélie', '2h. photos, sources et notes : jamais lues ni réécrites, intactes dans le nuage');
  ok(cloud('p1').infos.length === 2 && cloud('p1').infos[0].valeur === '06 11 22 33 44' && cloud('p1').infos[1].valeur === 'tennis' && cloud('p1').updatedBy === 'Kevin (via Bee)' && cloud('p1').updatedAt > 100, '2i. la fiche a bien reçu l\'info, l\'ancienne est là, la date de mise à jour a avancé (la synchro des appareils prendra la nouvelle)');
  const sauv = cloud ? BD.arbre[sha(CH + ':sauvegardes')] : null;
  ok(sauv && sauv[sortie.copie] && sauv[sortie.copie].avant.infos.length === 1 && sauv[sortie.copie].id === 'p1', '2j. la copie de sauvegarde contient l\'état d\'AVANT');
  ok(!JSON.stringify(Object.keys(BD.arbre[CH])).includes('sauvegardes'), '2k. le tiroir de sauvegarde est HORS de la zone synchronisée des appareils'); }
{ /* PANNE : la copie n'est pas relue → RIEN n'est écrit */
  const avant = await cl.lire('p2'); VU = []; PANNE = { copieNonEcrite: true };
  const e = await refuse(() => cl.patcher('p2', avant, preparerChamp(avant, { champ: 'metier', valeur: 'cuisinier' }).patch, 'bee'), /n'a pas été relue : RIEN n'a été écrit/);
  ok(e && !VU.some((x) => x.m === 'PATCH') && cloud('p2').metier === undefined, '2l. copie non relue → AUCUNE écriture sur la fiche'); PANNE = {}; }
{ /* PANNE : l'écriture est perdue → la relecture le voit et remet l'ancien */
  const avant = await cl.lire('p2'); VU = []; PANNE = { patchPerdu: true };
  const e = await refuse(() => cl.patcher('p2', avant, preparerChamp(avant, { champ: 'metier', valeur: 'cuisinier' }).patch, 'bee'), /relecture ne correspond pas/);
  ok(e && cloud('p2').metier === undefined, '2m. écriture perdue → la relecture la détecte et Kevin est prévenu (rien de faux affiché)'); PANNE = {}; }
{ /* PANNE : le nuage enregistre une valeur ABÎMÉE → la relecture la voit et l'ANCIENNE valeur est remise (champ qui n'existait pas = retiré, pas rempli de vide) */
  const avant = await cl.lire('p2'); VU = []; PANNE = { patchCorrompu: true };
  const e = await refuse(() => cl.patcher('p2', avant, preparerChamp(avant, { champ: 'metier', valeur: 'cuisinier' }).patch, 'bee'), /l'ancienne valeur a été remise/);
  ok(e && !('metier' in cloud('p2')), '2m2. valeur abîmée par le nuage → remise à l\'état d\'avant (le champ est retiré, pas laissé abîmé ni vide)'); PANNE = {}; }
{ const avant = await cl.lire('p1'); VU = [];
  ok(await refuse(() => cl.patcher('p1', avant, { prenom: '' }, 'bee'), /ferait perdre/) && await refuse(() => cl.patcher('p1', avant, { comments: [] }, 'bee'), /ferait perdre/) && await refuse(() => cl.patcher('p1', avant, { notes: null }, 'bee'), /ne supprime rien/) && await refuse(() => cl.patcher('p1', avant, {}, 'bee'), /rien à écrire/), '2n. effacer un nom, vider les commentaires, mettre null, ne rien écrire : tout est refusé AVANT la moindre écriture');
  ok(ecritures().length === 0, '2o. et le nuage n\'a reçu aucune écriture'); }
{ /* ménage : 40 copies gardées */
  const tiroir = {}; for (let i = 0; i < 45; i++) tiroir['b-' + String(i).padStart(14, '0') + '-px'] = { ts: i, id: 'px' };
  BD.arbre[sha(CH + ':sauvegardes')] = tiroir;
  const avant = await cl.lire('p3');
  await cl.patcher('p3', avant, preparerChamp(avant, { champ: 'metier', valeur: 'pâtissière' }).patch, 'bee');
  const cles = Object.keys(BD.arbre[sha(CH + ':sauvegardes')]);
  ok(cles.length === GARDES_MAX && !cles.includes('b-' + String(0).padStart(14, '0') + '-px') && cles.some((k) => /-p3$/.test(k)), '2p. 46 copies → 40 gardées : les plus vieilles partent, la toute dernière reste'); }
{ const r = preparerLien(await cl.lire('p1'), 'p1', { lien: 'enfant', prenom: 'Capucine', nom: 'NEUVE' }, null, '', '');
  VU = []; await cl.creer(r.creations[0].id, r.creations[0].fiche);
  ok(cloud(r.creations[0].id) && cloud(r.creations[0].id).mere === 'p1' && cloud(r.creations[0].id).prenom === 'Capucine', '2q. une fiche neuve est créée et relue');
  ok(await refuse(() => cl.creer('p2', { id: 'p2', prenom: 'Pirate', nom: 'X' }), /existe déjà/) && cloud('p2').prenom === 'Octave', '2r. créer par-dessus une fiche existante : refusé, la fiche est intacte'); }
ok(!/AIza/.test(JSON.stringify(ACTIONS_ARBRE)) && FB_KEY === 'AIzaSyDciW-0sIIg9msdmgZjQHBksqzsfA6DCMs', '2s. la clé publique de l\'app n\'a pas dérivé (c\'est celle de arbre/index.html)');

/* ───────── l'arbre vu de la graine : arranger ───────── */
const SEED = { persons: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(BD.arbre[CH].persons).filter(([k]) => /^p[1-5]$/.test(k)).map(([k, v]) => [k, Object.assign({}, v, { photos: undefined })])))) };
SEED.persons.p6 = { prenom: 'Zélie', nom: 'Testard' };   /* un doublon de nom (autre casse) */
{ const b = auditerSeed(SEED, '');
  ok(/Bilan de l'arbre \(6 personnes\)/.test(b) && /sans date de naissance/.test(b) && /nom\(s\) en double/.test(b), '3. le bilan compte ce qui manque et les doublons');
  ok(/p5/.test(auditerSeed(SEED, 'décès')) && /décédés sans date de décès/.test(auditerSeed(SEED, 'décès')) && /Zélie TESTARD \[id : p1\] = Zélie Testard \[id : p6\]|Zélie Testard \[id : p6\] = Zélie TESTARD \[id : p1\]/.test(auditerSeed(SEED, 'doublons')), '3b. exemples avec leur identifiant : décédés sans date, doublons');
  ok(chercherDoublon(SEED, 'zelie', 'TESTARD').includes('[id : p1]') && chercherDoublon(SEED, 'Nouvelle', 'Personne') === '' && chercherDoublon(SEED, '', '') === '', '3c. le doublon est repéré sans tenir compte de la casse ni des accents'); }
ok(/\[id : p1\]/.test(ficheTexte(SEED, 'p1')), '3d. l\'outil arbre donne l\'IDENTIFIANT de chaque fiche (c\'est lui qu\'on propose à l\'action)');
ok((await refuse(() => outilsBilan(async () => null).exe.arbre_bilan({}), /pas encore publié/)), '3e. arbre non publié : le bilan le dit');

/* ───────── 4. par le VRAI serveur de Bee ───────── */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const SERVEUR = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'Réponse de l\'ancien chemin.' }) } };
function remettre() { kv.clear(); kv.set('arbre:codehash', CH); kv.set('arbre:seed', JSON.stringify(SEED)); peuplerNuage(); IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; IA_VUES = []; reseau = []; }
const appel = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
async function bee(texte, env2, entetes, contexte) {
  const r = await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'x-kdmc-sso': signe('kdmc_admin') }, entetes || {}),
    body: JSON.stringify({ messages: [{ role: 'user', content: texte }], contexte: contexte || undefined }) }), env2 || SERVEUR, { waitUntil() {} });
  const j = await r.json().catch(() => null); tousTextes.push(JSON.stringify(j)); return { st: r.status, j };
}
async function agir(jeton, { sso = signe('kdmc_admin'), origin = 'https://arbre.kd-mc.com', confirme = true, env2 } = {}) {
  const h = { 'content-type': 'application/json' }; if (origin) h.origin = origin; if (sso) h['x-kdmc-sso'] = sso;
  const r = await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/agir', { method: 'POST', headers: h, body: JSON.stringify({ jeton, confirme }) }), env2 || SERVEUR, { waitUntil() {} });
  const j = await r.json().catch(() => null); tousTextes.push(JSON.stringify(j)); return { st: r.status, j };
}
const messagesOutil = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
const outilsVus = () => IA_VUES.flatMap((v) => (v.corps.tools || []).map((x) => x.function.name));
const CTX_ARBRE = { app: 'arbre', titre: 'Arbre' };

{ remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('a', 'arbre', { recherche: 'Zélie TESTARD' })] },
    { content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_info', id: 'p1', type: 'E-mail', libelle: 'perso', valeur: 'zelie@example.org', texte: 'FAUX RÉSUMÉ PIÉGÉ : ranger ma journée' })] },
    { content: 'J\'ai préparé l\'ajout de l\'e-mail à la fiche de Zélie. Confirme avec le bouton.' }];
  const r = await bee('Ajoute l\'e-mail zelie@example.org à la fiche de Zélie TESTARD dans l\'arbre', null, null, CTX_ARBRE);
  ok(r.st === 200 && r.j.ok && r.j.propositions && r.j.propositions.length === 1, '4. Bee prépare UNE carte pour l\'ajout d\'une info', JSON.stringify(r.j));
  const pr = r.j.propositions[0];
  ok(pr.action === 'arbre_info' && /AJOUTER à la fiche de Zélie TESTARD/.test(pr.resume) && /zelie@example\.org/.test(pr.resume) && !/ranger ma journée/.test(pr.resume), '4b. le résumé que Kevin lit est fabriqué par le DOMAINE (vrai nom lu dans le nuage) — le texte piégé de l\'IA n\'y est pas', pr.resume);
  ok(/\[id : p1\]/.test(messagesOutil()), '4c. l\'IA a reçu l\'identifiant de la fiche par l\'outil arbre (elle ne le devine pas)');
  ok(ecritures().length === 0 && cloud('p1').infos.length === 1, '4d. AVANT le bouton : le nuage n\'a reçu AUCUNE écriture');
  ok(outilsVus().includes('arbre_bilan') && !outilsVus().some((n) => /^arbre_(info|champ|lien|commentaire)$/.test(n)), '4e. l\'IA ne voit que `proposer_action` (+ lecture) : aucune écriture de l\'arbre n\'est un outil direct de l\'IA');
  const jeton = pr.jeton;
  ok((await agir(jeton, { sso: null })).st === 403 && (await agir(jeton, { sso: signe('zelie_testard') })).st === 403, '4f. sans session, ou avec le compte de quelqu\'un d\'autre : 403, rien d\'écrit');
  ok((await agir(jeton, { origin: 'https://pirate.example' })).st === 403 && (await agir(jeton, { origin: null })).st === 403, '4g. depuis un autre site, ou sans origine : 403');
  ok((await agir(jeton, { confirme: false })).st === 400, '4h. sans le bouton (confirme ≠ true) : 400');
  ok((await agir(jeton.slice(0, -3) + (jeton.endsWith('aaa') ? 'bbb' : 'aaa'))).st === 400, '4i. une signature trafiquée : 400');
  ok(ecritures().length === 0, '4j. après tous ces refus : toujours aucune écriture dans le nuage');
  const ex = await agir(jeton);
  ok(ex.st === 200 && ex.j.ok && /C'est fait/.test(ex.j.texte) && /sauvegarde/.test(ex.j.texte), '4k. avec le ✅ de Kevin : c\'est écrit', JSON.stringify(ex.j));
  ok(cloud('p1').infos.length === 2 && cloud('p1').infos[1].valeur === 'zelie@example.org' && cloud('p1').infos[0].valeur === '06 11 22 33 44' && cloud('p1').photos[0].data === PHOTO, '4l. la fiche a l\'info, garde l\'ancienne, et ses photos sont intactes');
  ok((await agir(jeton)).st === 409, '4m. la même carte rejouée : 409 (usage unique)');
  ok(Object.keys(BD.arbre[sha(CH + ':sauvegardes')] || {}).some((k) => /-p1$/.test(k)), '4n. une copie de sauvegarde existe dans le tiroir'); }

{ /* champ déjà rempli : la carte est refusée tant que Kevin n'a pas dit « remplace » */
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_champ', id: 'p1', champ: 'metier', valeur: 'coiffeuse' })] }, { content: 'Le métier est déjà rempli, je ne le remplace pas sans ton accord.' }];
  const r = await bee('Mets coiffeuse comme métier de Zélie dans l\'arbre', null, null, CTX_ARBRE);
  ok(!(r.j.propositions && r.j.propositions.length) && /REFUS DE LA PROPOSITION/.test(messagesOutil()) && /déjà rempli/.test(messagesOutil()), '5. métier déjà rempli sans « remplace » : AUCUNE carte', messagesOutil());
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_champ', id: 'p1', champ: 'metier', valeur: 'coiffeuse', remplacer: true })] }, { content: 'Préparé : confirme.' }];
  const r2 = await bee('Remplace le métier de Zélie par coiffeuse dans l\'arbre', null, null, CTX_ARBRE);
  const pr = r2.j.propositions && r2.j.propositions[0];
  ok(pr && /REMPLACER son métier de Zélie TESTARD : « vendeuse » → « coiffeuse »/.test(pr.resume), '5b. « remplace » : la carte montre avant → après avec les VRAIS mots de la fiche', pr && pr.resume);
  await agir(pr.jeton);
  const sauv = BD.arbre[sha(CH + ':sauvegardes')]; const k = Object.keys(sauv).find((x) => /-p1$/.test(x));
  ok(cloud('p1').metier === 'coiffeuse' && sauv[k].avant.metier === 'vendeuse', '5c. remplacé, et l\'ANCIENNE valeur (« vendeuse ») est dans le tiroir de sauvegarde'); }

{ /* la fiche change entre la carte et le bouton → rien d'écrasé */
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_champ', id: 'p2', champ: 'metier', valeur: 'cuisinier' })] }, { content: 'Préparé.' }];
  const r = await bee('Note que Octave est cuisinier dans l\'arbre', null, null, CTX_ARBRE);
  const pr = r.j.propositions[0];
  cloud('p2').metier = 'jardinier';   /* un autre appareil l'a rempli entre-temps */
  VU = [];
  const ex = await agir(pr.jeton);
  ok(ex.st === 502 && !ex.j.ok && /déjà rempli/.test(ex.j.texte) && /Rien n'a été écrit/.test(ex.j.texte) && cloud('p2').metier === 'jardinier' && ecritures().length === 0, '6. la fiche a changé après la carte : au ✅ le domaine RELIT, voit le champ rempli, n\'écrase rien', JSON.stringify(ex.j)); }

{ /* relier / créer */
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_lien', id: 'p1', lien: 'enfant', prenom: 'Capucine', nom: 'TESTARD', naissance_date: '2010-05-01' })] }, { content: 'Préparé.' }];
  const r = await bee('Ajoute une fille à Zélie dans l\'arbre : Capucine TESTARD née le 2010-05-01', null, null, CTX_ARBRE);
  const pr = r.j.propositions[0];
  ok(/CRÉER la fiche de Capucine TESTARD et la relier à Zélie TESTARD comme enfant/.test(pr.resume), '7. la carte dit CRÉER et relier, avec le vrai nom du parent', pr.resume);
  const avant = Object.keys(BD.arbre[CH].persons).length;
  const ex = await agir(pr.jeton);
  const neuf = Object.keys(BD.arbre[CH].persons).filter((k) => !/^p[1-5]$/.test(k));
  ok(ex.j.ok && Object.keys(BD.arbre[CH].persons).length === avant + 1 && neuf.length === 1 && cloud(neuf[0]).mere === 'p1' && cloud(neuf[0]).updatedBy === 'Kevin (via Bee)', '7b. la fiche de l\'enfant existe, reliée à sa mère ; aucune autre fiche touchée', JSON.stringify(ex.j));
  ok(cloud('p1').infos.length === 1 && cloud('p1').prenom === 'Zélie', '7c. la fiche de la mère n\'a pas bougé');
  /* homonyme exact : refusé (pas de doublon) */
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_lien', id: 'p1', lien: 'enfant', prenom: 'Léon', nom: 'DUPONT' })] }, { content: 'Il existe déjà.' }];
  const r2 = await bee('Ajoute Léon DUPONT comme enfant de Zélie dans l\'arbre', null, null, CTX_ARBRE);
  ok(!(r2.j.propositions && r2.j.propositions.length) && /déjà dans l'arbre/.test(messagesOutil()), '7d. un nom déjà dans l\'arbre : pas de carte « créer », on propose de relier', messagesOutil()); }

{ /* fiche inconnue / id inventé */
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_commentaire', id: 'p999', texte: 'Bonjour' })] }, { content: 'Je ne trouve pas.' }];
  const r = await bee('Ajoute un commentaire à la fiche p999 dans l\'arbre', null, null, CTX_ARBRE);
  ok(!(r.j.propositions && r.j.propositions.length) && /Je ne trouve aucune fiche/.test(messagesOutil()), '8. un identifiant inventé par l\'IA : aucune carte');
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_champ', id: '../../x', champ: 'metier', valeur: 'a' })] }, { content: 'Refusé.' }];
  const r2 = await bee('Change le métier dans l\'arbre', null, null, CTX_ARBRE);
  ok(!(r2.j.propositions && r2.j.propositions.length), '8b. un identifiant piégé (../../x) : aucune carte'); }

{ /* bilan : « arrange l'arbre » */
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('a', 'arbre_bilan', { critere: 'doublons' })] }, { content: 'Il y a un doublon : Zélie TESTARD et Zélie Testard.' }];
  const r = await bee('Range l\'arbre : qu\'est-ce qui manque ?', null, null, CTX_ARBRE);
  ok(r.st === 200 && r.j.outils.join() === 'arbre_bilan' && /Bilan de l'arbre/.test(messagesOutil()) && /\[id : p6\]/.test(messagesOutil()), '9. « range l\'arbre » : l\'IA lit le bilan (ce qui manque, les doublons avec leur identifiant)');
  ok(/UNE PAR UNE/.test(IA_VUES[0].corps.messages[0].content) && /ne devine jamais une date/.test(IA_VUES[0].corps.messages[0].content), '9b. les règles de Bee : corrections UNE PAR UNE, jamais de date ou lien deviné'); }

{ /* interrupteur */
  remettre();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appel('b', 'proposer_action', { action: 'arbre_info', id: 'p1', type: 'Loisir', valeur: 'tennis' })] }, { content: 'Impossible pour le moment.' }];
  const r = await bee('Ajoute le loisir tennis à Zélie dans l\'arbre', Object.assign({}, SERVEUR, { BEE_ARBRE_ECRIRE: '0' }), null, CTX_ARBRE);
  ok(!(r.j.propositions && r.j.propositions.length) && !outilsVus().includes('arbre_bilan') && !/UNE PAR UNE/.test(IA_VUES[0].corps.messages[0].content), '10. interrupteur BEE_ARBRE_ECRIRE=0 : aucune carte, plus de bilan, plus de règles d\'écriture');
  ok(ecritures().length === 0, '10b. et le nuage ne reçoit rien'); }

/* ───────── 5. secret, gratuité, textes ───────── */
ok(!tousTextes.join('\n').includes(CH) && !IA_VUES.some((v) => JSON.stringify(v.corps).includes(CH)), '11. l\'empreinte du code famille n\'apparaît dans AUCUNE réponse ni dans rien de ce qui part à l\'IA');
ok(!reseau.some((u) => /anthropic|openai\.com|googleapis\.com\/v1beta|mistral|deepseek/i.test(u)), '11b. 0 € : aucun moteur payant appelé');
ok(!/modifier l.arbre,/.test(REGLES_AGIR) && /supprimer quoi que ce soit dans l.arbre/.test(REGLES_AGIR), '11c. les règles de Bee ne disent plus « modifier l\'arbre est fermé » : seule la SUPPRESSION l\'est');

globalThis.fetch = vraiFetch;
console.log('\n' + pass + ' ✓ / ' + fail + ' ✗  (bee-arbre-ecrire)');
process.exit(fail ? 1 : 0);
