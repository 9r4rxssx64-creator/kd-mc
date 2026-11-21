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
import { proposerPourKevin } from '../../services/admin/proposer-action.js';

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


/* ───────── ÉCRIRE POUR KEVIN, DERRIÈRE SON ✅ (pc-config 3092, mesure réelle du 21.11 sur v13.4.416 : sur « ajoute le commentaire… à la fiche de… » le modèle gratuit n'appelait AUCUN outil et
   INVENTAIT « Modification appliquée : data/team.json… commit automatisé » ; « écris à … dans CMCteams » : « Message envoyé » — FAUX). Les modèles gratuits ne choisissent pas les outils de façon fiable :
   une demande NETTE est donc routée ICI, sans modèle, vers la carte « ✅ Confirmer / ✖ Annuler » du domaine ; une demande d'écriture PAS assez nette reçoit une réponse locale qui dit comment la formuler
   (jamais une réponse inventée par le modèle). ───────── */
const NOM = "([\\p{L}][\\p{L}'’ -]{1,60}?)";
const FICHE_DE = "\\s+(?:à|a|sur|dans)\\s+la\\s+fiche\\s+(?:de\\s+|d['’]\\s*|du\\s+|des\\s+)";
const nettoyerValeur = (v: string): string => v.trim().replace(/^[«"“'‘]\s*/, '').replace(/\s*[»"”'’]$/, '').trim();
const dateIso = (v: string): string => { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v.trim()); return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : v.trim(); };

export type EcritureArbre =
  | { action: 'arbre_commentaire'; champs: { personne: string; texte: string } }
  | { action: 'arbre_info'; champs: { personne: string; type: string; valeur: string } }
  | { action: 'arbre_champ'; champs: { personne: string; champ: string; valeur: string; remplacer: boolean } };

const TYPES_INFO: Record<string, string> = { 'téléphone': 'Téléphone', 'telephone': 'Téléphone', 'numéro de téléphone': 'Téléphone', 'e-mail': 'E-mail', 'email': 'E-mail', 'mail': 'E-mail', 'adresse': 'Adresse postale', 'site web': 'Site web', 'site': 'Site web', 'profession': 'Profession détaillée', 'loisir': 'Loisir' };
const CHAMPS_FICHE: Record<string, string> = { 'date de naissance': 'naissance.date', 'lieu de naissance': 'naissance.lieu', 'date de décès': 'deces.date', 'date de deces': 'deces.date', 'lieu de décès': 'deces.lieu', 'lieu de deces': 'deces.lieu', 'métier': 'metier', 'metier': 'metier', 'sexe': 'sexe' };

/** PURE : « ajoute le commentaire "…" à la fiche de X », « ajoute le téléphone … à la fiche de X », « corrige la date de naissance de X : 16/06/1880 » → l'action à PROPOSER, sinon null. */
export function demandeEcritureArbre(texte: string): EcritureArbre | null {
  const t = String(texte ?? '').trim().slice(0, 900);
  let m = new RegExp(`^(?:peux-tu\\s+|pourrais-tu\\s+)?(?:ajoute|ajouter|mets|mettre|note|noter)\\s+(?:le|un|ce)\\s+commentaire\\s*[:,-]?\\s*(.+)${FICHE_DE}${NOM}\\s*[.!?]*$`, 'iu').exec(t);
  if (m?.[1] && m[2]) { const x = nettoyerValeur(m[1]); return x ? { action: 'arbre_commentaire', champs: { personne: m[2].trim(), texte: x } } : null; }
  m = new RegExp(`^(?:peux-tu\\s+|pourrais-tu\\s+)?(?:ajoute|ajouter|mets|mettre|note|noter)\\s+(?:le\\s+|la\\s+|l['’]\\s*|un\\s+|une\\s+)?(num[ée]ro de t[ée]l[ée]phone|t[ée]l[ée]phone|e-?mail|mail|adresse|site web|site|profession|loisir)\\s*[:,-]?\\s*(.+)${FICHE_DE}${NOM}\\s*[.!?]*$`, 'iu').exec(t);
  if (m?.[1] && m[2] && m[3]) { const type = TYPES_INFO[m[1].toLowerCase().replace('é', 'é')] ?? TYPES_INFO[m[1].toLowerCase()]; const v = nettoyerValeur(m[2]); return type && v ? { action: 'arbre_info', champs: { personne: m[3].trim(), type, valeur: v } } : null; }
  m = new RegExp(`^(?:peux-tu\\s+|pourrais-tu\\s+)?(corrige|corriger|modifie|modifier|change|changer|mets|mettre|renseigne|renseigner)\\s+(?:la\\s+|le\\s+|l['’]\\s*)?(date de naissance|lieu de naissance|date de d[ée]c[èe]s|lieu de d[ée]c[èe]s|m[ée]tier|sexe)\\s+(?:de\\s+|d['’]\\s*|du\\s+)${NOM}\\s*(?::|=|\\s+à\\s+|\\s+a\\s+|\\s+en\\s+|\\s+par\\s+)\\s*(\\S[\\s\\S]{0,120})$`, 'iu').exec(t);
  if (m?.[1] && m[2] && m[3] && m[4]) {
    const champ = CHAMPS_FICHE[m[2].toLowerCase()]; const v = nettoyerValeur(m[4]).replace(/[.!?]+$/, '');
    if (!champ || !v) return null;
    return { action: 'arbre_champ', champs: { personne: m[3].trim(), champ, valeur: champ.endsWith('.date') ? dateIso(v) : v, remplacer: /^(corrige|corriger|modifie|modifier|change|changer)$/i.test(m[1]) } };
  }
  return null;
}

/** PURE : « écris à X dans CMCteams (ou la light) : <message> » → { nom, texte }, sinon null. « CMCteams » (ou la light) dit ET un séparateur (« : », « que », « - ») : jamais une phrase ordinaire. */
export function demandeMessageDirect(texte: string): { nom: string; texte: string } | null {
  const m = new RegExp(`^\\s*(?:peux-tu\\s+|pourrais-tu\\s+)?(?:écris|ecris|écrire|ecrire|envoie(?:-moi)?(?:\\s+un\\s+message)?|dis)\\s+(?:à|a)\\s+${NOM}\\s+(?:dans|sur|via|par)\\s+(?:cmc[\\s-]?teams?(?:[\\s-]light)?|la\\s+light|l['’]app\\s+cmc[\\s-]?teams?)\\s*(?::|,|-|\\s+que\\s+|\\s+qu['’])\\s*(\\S[\\s\\S]{0,499})$`, 'iu').exec(String(texte ?? '').slice(0, 700));
  if (!m?.[1] || !m[2]) return null;
  const msg = nettoyerValeur(m[2]);
  return msg ? { nom: m[1].trim(), texte: msg } : null;
}

/** PURE : une demande d'ÉCRITURE dans l'arbre ou de message direct qui n'a pas été assez nette pour la carte : on le dit (jamais un « c'est fait » inventé par le modèle). */
export function aideEcriture(texte: string): string | null {
  const t = String(texte ?? '').trim().slice(0, 400);
  if (/^(?:peux-tu\s+|pourrais-tu\s+)?(?:ajoute|ajouter|corrige|corriger|modifie|modifier|compl[èe]te|compl[ée]ter|renseigne|renseigner|relie|relier|change|changer)\b[\s\S]*\b(?:fiche|arbre)\b/iu.test(t)) {
    return '🌳 Pour écrire dans l\'arbre, dis-le ainsi (je te montre une carte, rien n\'est écrit avant ton « ✅ Confirmer ») :\n• « ajoute le commentaire "…" à la fiche de Prénom Nom »\n• « ajoute le téléphone 06… à la fiche de Prénom Nom »\n• « corrige la date de naissance de Prénom Nom : 16/06/1880 »\nJe n\'ai rien modifié.';
  }
  if (/^(?:peux-tu\s+|pourrais-tu\s+)?(?:écris|ecris|écrire|ecrire|envoie|dis)\s+(?:à|a)(?=\s)[\s\S]*\b(?:cmc[\s-]?teams?|la\s+light)\b/iu.test(t)) {
    return '✉️ Pour écrire à quelqu\'un dans CMCteams, dis-le ainsi : « écris à Prénom Nom dans CMCteams : ton message ». Je te montre une carte, rien n\'est envoyé avant ton « ✅ Confirmer ». Je n\'ai rien envoyé.';
  }
  return null;
}

/** Si la demande est connue : exécute l'outil (carte à Kevin) et rend la phrase à afficher ; sinon null (le modèle répond comme avant). */
export async function repondreLocalement(texte: string, f: typeof fetch = fetch): Promise<string | null> {
  const ecrire = demandeEcrireApexChat(texte);
  if (ecrire) {
    const t = await ecrireApexChat(ecrire.nom, ecrire.texte, f);
    if (/^(Bouton|\d+ personnes)/.test(t)) return '✍️ Le bouton « Écrire » est affiché dans la fenêtre : touche-le, Apex Chat s\'ouvre avec ton message prêt (tu relis et tu envoies toi-même).';
    return `✍️ ${t}`;
  }
  const ea = demandeEcritureArbre(texte);
  if (ea) {
    const t = await proposerPourKevin(ea.action, ea.champs, f);
    return t.startsWith('Carte de confirmation') ? '✅ Une carte de confirmation est affichée : lis le résumé écrit par le domaine, puis touche « ✅ Confirmer » (ou « ✖ Annuler »). Rien n\'est écrit avant.' : `🌳 ${t}`;
  }
  const md = demandeMessageDirect(texte);
  if (md) {
    const t = await proposerPourKevin('message_direct', md, f);
    return t.startsWith('Carte de confirmation') ? '✅ Une carte de confirmation est affichée : lis-la, puis touche « ✅ Confirmer » (ou « ✖ Annuler »). Rien n\'est envoyé avant.' : `✉️ ${t}`;
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
  const aide = aideEcriture(texte);
  if (aide) return aide;
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
