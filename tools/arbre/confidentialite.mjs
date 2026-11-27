/* ARBRE — CONFIDENTIALITÉ DES RECHERCHES PAR IA GRATUITES (Kevin 26.11.2026 : « trouve des solutions pour garder la confidentialité au maximum
 * et envoie un maximum d'IA gratuite au travail… les infos de tout le monde, en privé ou en public selon les mineurs »).
 * Quatre protections, toutes en code et testées (tests/arbre-confidentialite.test.mjs) :
 *  1. NIVEAU de chaque fiche : « ouvert » (défunt dont l'état civil est public : naissance/mariage ≥ 75 ans, décès ≥ 25 ans) ou « fermé »
 *     (vivant, mineur, récent, ou doute). Une fiche fermée n'est travaillée QUE par un modèle LOCAL du Lenovo (rien ne sort de la machine).
 *  2. EXTRACTION SANS CIBLE : l'IA lit une page publique et liste TOUTES les personnes qu'elle y voit ; elle ne sait jamais qui nous cherchons.
 *     Le rapprochement avec la fiche se fait ICI, en code (correspond). Une IA gratuite qui garde ses entrées ne garde donc que du texte public.
 *  3. GARDE DE SORTIE : tout texte qui part vers une IA du nuage est refusé s'il contient le nom complet d'une fiche fermée, un secret, un e-mail ou un téléphone.
 *  4. PREUVE : un extrait n'est retenu que s'il se retrouve MOT POUR MOT dans la page ; une invention est jetée.
 * Le résultat est « privé » (tiroir admin) pour un mineur ou un vivant, « public » pour un défunt ; jamais d'adresse, téléphone, e-mail, réseau social. */
import { controleEnvoi } from '../delegue/delegue.mjs';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const annee = (d) => { const m = /(\d{4})/.exec(String(d?.date || d || '')); return m ? +m[1] : null; };
const nomComplet = (p) => ((p.prenom || '') + ' ' + (p.nom || '')).trim();

/** 'ouvert' | 'ferme' — dans le doute, fermé. */
export function niveau(p, now = new Date()) {
  const y = now.getFullYear();
  if (!p || p.vivant === true) return 'ferme';
  const n = annee(p.naissance), d = annee(p.deces);
  if (n && y - n >= 100) return 'ouvert';
  if (n && d && y - n >= 75 && y - d >= 25) return 'ouvert';
  return 'ferme';
}
export const estMineur = (p, now = new Date()) => { const n = annee(p?.naissance); return !!(n && p.vivant !== false && now.getFullYear() - n < 18); };
/** Où le résultat s'écrit : mineur → privé ; vivant → privé aussi pour tout ce qui est sensible (tiroir admin) ; défunt → public. */
export function destination(p, now = new Date()) {
  if (estMineur(p, now)) return 'prive';
  return p?.vivant === true ? 'prive-admin' : 'public';
}
/** Qui a le droit de lire cette fiche : ouvert → modèles du nuage permis (VOIES_NUAGE) ; fermé → modèle local seulement. */
export const VOIES_NUAGE = ['omniroute', 'domaine', 'llm7', 'pollinations', 'openrouter', 'groq', 'cerebras', 'mistral', 'nvidia', 'github', 'sambanova'];
export const voiesPermises = (p, now = new Date()) => (niveau(p, now) === 'ouvert' ? ['local', ...VOIES_NUAGE] : ['local']);

/** Garde de sortie vers une IA du nuage. noms = noms complets des fiches FERMÉES. Rend null si le texte peut partir, sinon la raison. */
export function gardeSortie(texte, fichesFermees = []) {
  const refus = controleEnvoi(texte); if (refus) return refus;
  const t = ' ' + norm(texte) + ' ';
  for (const p of fichesFermees) {
    const a = norm(nomComplet(p)), b = norm((p.nom || '') + ' ' + (p.prenom || ''));
    if (a.length > 5 && (t.includes(' ' + a + ' ') || t.includes(' ' + b + ' '))) return 'refusé : le texte nomme une personne vivante, mineure ou récente (' + (p.id || '?') + ') — modèle local seulement';
  }
  return null;
}

/** Consigne d'extraction SANS cible : rien de la fiche n'y figure. */
export const CONSIGNE_EXTRACTION = 'Voici le texte d\'une page d\'archives ou de généalogie publique. Liste TOUTES les personnes citées, sans en choisir. Réponds par un tableau JSON, un objet par personne : {"nom":"","prenoms":"","naissance":"","lieu":"","parents":"","evenement":"","extrait":"phrase EXACTE copiée de la page"}. Ne complète rien, n\'invente rien, laisse "" ce qui n\'est pas écrit.';

/** Garde-fou JSON : récupère le tableau même si l'IA l'entoure de texte ; jamais d'exception. */
export function lireExtraits(reponse) {
  const t = String(reponse || ''), a0 = t.indexOf('['), a1 = t.lastIndexOf(']');
  if (a0 < 0 || a1 < a0) return [];
  try { const a = JSON.parse(t.slice(a0, a1 + 1)); return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []; } catch (_) { return []; /* réponse non JSON : aucune trouvaille, jamais d'exception */ }
}
/** Preuve : l'extrait doit se retrouver dans la page (espaces et accents ignorés). */
export function verifierExtraits(extraits, textePage) {
  const page = norm(textePage);
  return extraits.filter((e) => { const x = norm(e.extrait); return x.length >= 12 && page.includes(x); });
}

/** Certaines IA laissent « naissance » vide et mettent « née à Monaco le 1er février 1901 » dans la phrase : on la relit ICI (la phrase est déjà prouvée mot pour mot dans la page). Seule l'année qui suit « né(e) » compte, jamais une autre date de la phrase. */
export function anneeNaissanceDansPhrase(phrase) {
  const m = /\bn[ée]e?\b[^.;]{0,50}?\b(1[5-9]\d\d|20[0-2]\d)\b/i.exec(String(phrase || ''));
  return m ? Number(m[1]) : null;
}
export function lieuNaissanceDansPhrase(phrase, lieuNorm) {
  const m = /\bn[ée]e?\s+(?:à|a|au)\s+([^,.;]{2,40})/i.exec(String(phrase || ''));
  return !!(m && norm(m[1]).includes(lieuNorm));
}

/** Rapprochement LOCAL extrait ↔ fiche : nom ET (année de naissance OU lieu). 'sur' = les deux + prénom ; 'piste' = nom + un des deux. */
export function correspond(e, p) {
  if (norm(e.nom) !== norm(p.nom)) return null;
  const pre = norm(p.prenom).split(' ')[0], ep = norm(e.prenoms);
  const prenomOk = !!pre && (ep === norm(p.prenom) || ep.split(' ').includes(pre));
  const ya = annee(p.naissance), ye = annee(e.naissance) || anneeNaissanceDansPhrase(`${e.extrait || ''} ${e.evenement || ''}`);
  const anneeOk = !!ya && ya === ye;
  const lieu = norm(p.naissance?.lieu).replace(/ \(.*$/, '').split(' ')[0];
  const lieuOk = !!(lieu && (norm(e.lieu).includes(lieu) || lieuNaissanceDansPhrase(`${e.extrait || ''} ${e.evenement || ''}`, lieu)));
  if (prenomOk && anneeOk && lieuOk) return 'sur';
  if (prenomOk && (anneeOk || lieuOk)) return 'piste';
  return null;
}

/** Sources publiques à interroger selon la fiche (descripteurs : le navigateur du Lenovo fait la visite, l'IA ne fait que lire). */
export function sourcesPour(p) {
  const s = [], n = annee(p.naissance), d = annee(p.deces), lieu = norm(p.naissance?.lieu);
  if (/nice|cimiez|gairaut|alpes maritimes|monaco|menton|grasse|cannes|antibes/.test(lieu) || !lieu) s.push('AD06');
  if (/haute vienne|limoges|bellac|saint|montrol|lussac/.test(lieu)) s.push('AD87');
  if (n && n >= 1847 && n <= 1901 && p.sexe === 'M') s.push('AD87-matricules');
  if ((d && ((d >= 1914 && d <= 1919) || (d >= 1939 && d <= 1946))) || (n && n >= 1870 && n <= 1930 && p.sexe === 'M')) s.push('MemoireDesHommes');
  if (d && d >= 1970) s.push('matchID-deces');
  s.push('Geneanet-public', 'Gallica-presse');
  return [...new Set(s)];
}

/** Score de priorité (même esprit que manques.py) : plus il manque, plus haut. */
export function manquesDe(p) {
  const m = [];
  const n = p.naissance?.date || '';
  if (!n || n.startsWith('~')) m.push('naissance exacte');
  if (p.vivant !== true && !p.deces?.date) m.push('décès');
  if (!p.pere && !p.mere) m.push('parents');
  if (!((p.docs || []).length || (p.originaux || []).length)) m.push('image d\'acte');
  if (!((p.sources || []).length)) m.push('source');
  return m;
}

/** Lots de travail depuis un export : { ouvert:[…], ferme:[…] }. Les fermés portent « local_seulement » et ne quittent jamais le Lenovo. */
export function lots(P, { n = 30, now = new Date() } = {}) {
  const res = { ouvert: [], ferme: [] };
  const lignes = Object.entries(P).map(([id, p]) => ({ id, p, m: manquesDe(p) })).filter((x) => x.m.length)
    .map((x) => ({ ...x, score: x.m.length * 2 + (x.m.includes('parents') ? 2 : 0) + (x.m.includes('naissance exacte') ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  for (const { id, p, m, score } of lignes) {
    const niv = niveau({ ...p, id }, now);
    if (res[niv].length >= n) continue;
    res[niv].push({ id, nom: nomComplet(p), niveau: niv, score, manques: m, sources: sourcesPour(p), destination: destination(p, now), voies: voiesPermises(p, now), ...(niv === 'ferme' ? { local_seulement: true } : {}) });
  }
  return res;
}
