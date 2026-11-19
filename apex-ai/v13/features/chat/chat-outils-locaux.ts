/**
 * APEX v13.4.404 — Routage local des demandes de parité (pc-config 2874, mesure RÉELLE du 19.11 : « fais-moi la liste de tous ceux qui ont un compte CMCteams
 * avec leur identifiant SBM » est partie au modèle d'IA, qui a répondu qu'il n'avait pas la base et a réclamé des accès Firebase — l'outil `comptes_cmcteams`
 * n'était jamais appelé). Une demande claire n'attend plus que le modèle pense à l'outil : le chat l'exécute lui-même, affiche la carte à Kevin, et répond
 * en une phrase SANS appeler le modèle (donc aucun nom ni matricule ne lui est donné, et aucun accès ne lui est réclamé).
 */
import { appeler } from '../../services/admin/appeler.js';
import { comptesCmcteams } from '../../services/admin/comptes-cmcteams.js';

const W = (...mots: string[]): string => `(?<![\\p{L}\\p{N}])(?:${mots.join('|')})(?![\\p{L}\\p{N}])`;
const CMC = '(?<![\\p{L}\\p{N}])cmc\\s?-?teams?(?![\\p{L}\\p{N}])';
const VERBE_LISTE = W('liste', 'listes', 'lister', 'donne', 'donnes', 'montre', 'montres', 'affiche', 'affiches', 'fais', 'tous ceux', 'toutes les personnes', 'qui a', 'qui ont');
const OBJET_COMPTE = W('compte', 'comptes', 'inscrits?', 'identifiants?\\s+sbm', 'matricules?');
const RE_CMC = new RegExp(CMC, 'iu');
const RE_VERBE = new RegExp(VERBE_LISTE, 'iu');
const RE_OBJET = new RegExp(OBJET_COMPTE, 'iu');

/** PURE : la demande est-elle « la liste des comptes CMCteams (avec identifiant SBM) » ? (un mot de liste ET un mot de compte ET CMCteams) */
export function demandeListeComptesCmcteams(texte: string): boolean {
  const t = String(texte ?? '').slice(0, 500);
  return RE_CMC.test(t) && RE_VERBE.test(t) && RE_OBJET.test(t);
}

/** PURE : « appelle <nom> » → le nom, sinon null. Une phrase qui commence par le verbe (jamais « comment appeler… », « appelle-moi un taxi »). */
export function nomAAppeler(texte: string): string | null {
  const m = /^\s*(?:peux-tu\s+|pourrais-tu\s+)?(?:appelle|appeler|téléphone à|telephone a|passe un appel à|passe un appel a)\s+(?!moi\b|un\b|une\b|le\b|la\b|les\b)([\p{L}][\p{L}'’ -]{1,60})\s*[?.!]*\s*$/iu.exec(String(texte ?? '').slice(0, 200));
  return m?.[1] ? m[1].trim() : null;
}

/** Si la demande est connue : exécute l'outil (carte à Kevin) et rend la phrase à afficher ; sinon null (le modèle répond comme avant). */
export async function repondreLocalement(texte: string, f: typeof fetch = fetch): Promise<string | null> {
  const nom = nomAAppeler(texte);
  if (nom) {
    const t = await appeler(nom, f);
    if (/^(Bouton|\d+ personnes)/.test(t)) return '📞 Le bouton « Appeler » est affiché dans la fenêtre : touche-le, ton iPhone compose.';
    return `📞 ${t}`;
  }
  if (!demandeListeComptesCmcteams(texte)) return null;
  const r = await comptesCmcteams(f);
  const n = /(\d+) comptes/.exec(r)?.[1];
  if (r.startsWith('Liste prête') && n) return `📋 La liste des comptes CMCteams est affichée dans la fenêtre : ${n} comptes, avec leur identifiant SBM quand il est connu.`;
  return `📋 Je n'ai pas pu afficher la liste pour l'instant. ${r}`;
}
