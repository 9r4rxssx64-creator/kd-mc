/**
 * APEX v13.4.404 — Routage local des demandes de parité (pc-config 2874, mesure RÉELLE du 19.11 : « fais-moi la liste de tous ceux qui ont un compte CMCteams
 * avec leur identifiant SBM » est partie au modèle d'IA, qui a répondu qu'il n'avait pas la base et a réclamé des accès Firebase — l'outil `comptes_cmcteams`
 * n'était jamais appelé). Une demande claire n'attend plus que le modèle pense à l'outil : le chat l'exécute lui-même, affiche la carte à Kevin, et répond
 * en une phrase SANS appeler le modèle (donc aucun nom ni matricule ne lui est donné, et aucun accès ne lui est réclamé).
 */
import { appeler } from '../../services/admin/appeler.js';
import { comptesCmcteams } from '../../services/admin/comptes-cmcteams.js';
import { ecrireApexChat } from '../../services/admin/ecrire-apex-chat.js';
import { lienExterne } from '../../services/admin/lien-externe.js';
import { ouvrirDomaine } from '../../services/admin/ouvrir-domaine.js';

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

/** PURE : « écris à <nom> sur Apex Chat : <message> » → { nom, texte }, sinon null. Il faut « Apex Chat » dit et un séparateur (« : » ou « que ») : jamais une phrase ordinaire. */
export function demandeEcrireApexChat(texte: string): { nom: string; texte: string } | null {
  const m = /^\s*(?:peux-tu\s+|pourrais-tu\s+)?(?:écris|ecris|écrire|ecrire|envoie(?:-moi)?(?:\s+un\s+message)?|dis)\s+(?:à|a)\s+([\p{L}][\p{L}'’ -]{1,60}?)\s+(?:sur|dans|par|via)\s+apex[\s-]?chat\s*(?::|,|-|\s+que\s+|\s+qu['’])\s*(\S[\s\S]{0,499})$/iu.exec(String(texte ?? '').slice(0, 700));
  if (!m?.[1] || !m[2]) return null;
  const msg = m[2].trim();
  return msg ? { nom: m[1].trim(), texte: msg } : null;
}

/** PURE : « ouvre-moi <adresse> » → l'adresse, sinon null. https:// explicite, ou un nom de site avec une extension connue ; jamais un nom de fichier. */
export function adresseAOuvrir(texte: string): string | null {
  const m = /^\s*(?:peux-tu\s+|pourrais-tu\s+)?(?:ouvre|ouvrir|va sur|navigue sur)(?:[- ]moi)?\s+(?:la page\s+|le site\s+|le lien\s+)?((?:https?:\/\/\S+)|(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|fr|ch|mc|io|eu|info|ai|app|dev|co)(?:[/?#]\S*)?))\s*[?.!]*\s*$/iu.exec(String(texte ?? '').slice(0, 2100));
  return m?.[1] ? m[1].replace(/[?.!]+$/, '') : null;
}

/** PURE : la phrase commence par un verbe d'ouverture (le domaine décide ensuite si c'est une ouverture NETTE : sinon le modèle répond comme avant). */
export function ressembleAOuvrir(texte: string): boolean {
  const t = String(texte ?? '').trim();
  return t.length > 0 && t.length <= 200 && /^(?:peux-tu\s+|pourrais-tu\s+|s'il te pla[iî]t\s+)?(?:ouvre|ouvrir|ouvrez|montre|montrer|affiche|afficher|emm[eè]ne|am[eè]ne|va\s+(?:sur|dans|[àa])|aller\s+(?:sur|dans|[àa])|fais[- ]moi\s+voir|je\s+(?:veux|voudrais)\s+voir|lance)(?![\p{L}])/iu.test(t);
}

/** Si la demande est connue : exécute l'outil (carte à Kevin) et rend la phrase à afficher ; sinon null (le modèle répond comme avant). */
export async function repondreLocalement(texte: string, f: typeof fetch = fetch): Promise<string | null> {
  const ecrire = demandeEcrireApexChat(texte);
  if (ecrire) {
    const t = await ecrireApexChat(ecrire.nom, ecrire.texte, f);
    if (/^(Bouton|\d+ personnes)/.test(t)) return '✍️ Le bouton « Écrire » est affiché dans la fenêtre : touche-le, Apex Chat s\'ouvre avec ton message prêt (tu relis et tu envoies toi-même).';
    return `✍️ ${t}`;
  }
  const adresse = adresseAOuvrir(texte);
  if (adresse) {
    const t = await lienExterne(adresse);
    return t.startsWith('Bouton prêt') ? '🔗 Le bouton « Ouvrir » est affiché dans la fenêtre : touche-le pour ouvrir la page.' : `🔗 ${t}`;
  }
  const nom = nomAAppeler(texte);
  if (nom) {
    const t = await appeler(nom, f);
    if (/^(Bouton|\d+ personnes)/.test(t)) return '📞 Le bouton « Appeler » est affiché dans la fenêtre : touche-le, ton iPhone compose.';
    return `📞 ${t}`;
  }
  if (!demandeListeComptesCmcteams(texte)) {
    /* 21.11 (parité Bee, ligne « classer l'arbre autrement ») : « ouvre l'arbre en vue plan », « montre l'arbre trié par naissance »… — le domaine décide comme pour Bee */
    if (ressembleAOuvrir(texte)) {
      const t = await ouvrirDomaine({ demande: texte }, f);
      if (/^Bouton/.test(t)) return '🔗 Le bouton « Ouvrir » est affiché dans la fenêtre : touche-le pour ouvrir l\'app.';
    }
    return null;
  }
  const r = await comptesCmcteams(f);
  const n = /(\d+) comptes/.exec(r)?.[1];
  if (r.startsWith('Liste prête') && n) return `📋 La liste des comptes CMCteams est affichée dans la fenêtre : ${n} comptes, avec leur identifiant SBM quand il est connu.`;
  return `📋 Je n'ai pas pu afficher la liste pour l'instant. ${r}`;
}
