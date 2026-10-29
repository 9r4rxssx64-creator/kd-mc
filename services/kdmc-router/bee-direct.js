/* BEE RÉPOND SANS IA QUAND LA DEMANDE EST NETTE : météo, heure ailleurs, date, calcul, conversion — exact, instantané, 0 € et JAMAIS limité par un palier gratuit
 * (Kevin 17.10 : « trouve des solutions pour tout vérifier réel, passe par le gratuit toujours »).
 *
 * MESURÉ EN RÉEL le 18.10 (robot connecté, vrai code) : après 2 questions rapides (météo, calcul) les IA gratuites à outils sont en pause (Groq ≈ 8 000 jetons/min, pause de 15 min après un
 * refus 429) et Bee retombait sur Qwen SANS OUTILS pour tout le reste : « 02:16 à Monaco, mais je ne parviens pas à consulter l'heure en temps réel », « 10 km ≈ 6,21 miles » de tête.
 * Or ces demandes n'ont pas besoin d'une IA pour être COMPRISES : « quelle heure est-il à Tokyo », « convertis 10 km en miles », « combien font 17 % de 2 340 », « quel temps demain ». Le domaine les
 * reconnaît lui-même (phrases courtes et nettes seulement), appelle le même outil exact que l'IA aurait appelé et rend son résultat tel quel. Tout ce qui est composé, long ou ambigu
 * (« et », « puis », « pourquoi »…) continue d'aller à l'IA. En cas d'échec de l'outil (réseau, ville inconnue) : on laisse l'IA répondre, comme avant.
 * Interrupteur BEE_DIRECT = '0'. node services/kdmc-router/bee-direct.test.mjs */
import { executeurs } from '../_shared/outils-lecture.js';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const COMPOSEE = /\b(?:et|puis|ensuite|apres(?![- ]demain)|avant|aussi|pourquoi|comment|explique\w*|compare\w*|resume\w*|ecris|redige\w*|si|mais|ou)\b/;
const VILLE_ICI = /^(?:monaco|ici|chez moi)$/;

/* → { outil, args } ou null. Phrases courtes (≤ 14 mots), nettes, sans mot de liaison. */
export function intentionDirecte(message) {
  const brut = String(message || '').trim();
  if (!brut || brut.length > 140) return null;
  const t = norm(brut).replace(/[?!.]+$/g, '').trim();
  if (!t || t.split(' ').length > 14 || COMPOSEE.test(t.replace(/\bpas de\b/, ''))) return null;
  let m;
  /* le point du jour : « mon brief », « le point du jour », « ma journée », « mon programme » (date + météo + planning, sans IA) */
  if (/^(?:donne[- ]moi |fais[- ]moi |bonjour bee )?(?:mon |le |un )?(?:brief|point)(?: (?:du )?(?:jour|matin|journee|soir))?$|^(?:ma journee|ma journee d'?aujourd'?hui|mon programme(?: du jour| d'?aujourd'?hui)?|quoi de neuf aujourd'?hui|le point sur ma journee)$/.test(t)) return { outil: 'brief_jour', args: {} };
  /* date */
  if (/^(?:dis[- ]moi )?(?:quel jour (?:sommes|est)[- ]nous(?: aujourd'?hui)?|on est quel jour|quelle est la date(?: d'?aujourd'?hui)?|la date(?: d'?aujourd'?hui)?|quelle date (?:sommes[- ]nous|est[- ]on))$/.test(t)) return { outil: 'date_heure', args: {} };
  /* heure */
  if (/^(?:dis[- ]moi )?(?:quelle heure est[- ]il|il est quelle heure|l'?heure)(?: (?:maintenant|en ce moment|actuellement))?$/.test(t)) return { outil: 'date_heure', args: {} };
  if ((m = t.match(/^(?:dis[- ]moi )?(?:quelle heure est[- ]il|il est quelle heure|l'?heure)(?: (?:maintenant|en ce moment|actuellement))? (?:a|au|aux|en|dans|sur) (?:la |le |les |l')?([a-z][a-z' -]{1,38})$/))) {
    const ville = m[1].replace(/\s+(?:maintenant|en ce moment|actuellement)$/, '').trim();
    return VILLE_ICI.test(ville) ? { outil: 'date_heure', args: {} } : { outil: 'heure_ailleurs', args: { ville } };
  }
  /* conversion : « convertis 10 km en miles », « 10 km en miles », « combien font 10 km en miles » */
  if ((m = t.match(/^(?:convertis(?:-moi)?|convertir|combien (?:font|fait|ca fait|y a[- ]t[- ]il)|ca fait combien)?\s*(\d+(?:[.,]\d+)?)\s*([a-z°/²]+(?: [a-z]+)?)\s+(?:en|vers|dans)\s+([a-z°/²]+(?: [a-z]+)?)$/)) && !/\d/.test(m[2] + m[3])) {
    const valeur = parseFloat(m[1].replace(',', '.'));
    if (Number.isFinite(valeur)) return { outil: 'convertir', args: { valeur, de: m[2].trim(), vers: m[3].trim() } };
  }
  /* calcul : « combien font 17 % de 2 340 », « calcule (12,5*3)+8% », « combien fait 7 fois 8 » */
  if ((m = t.match(/^(?:combien (?:font|fait|ca fait)|calcule(?:-moi)?|calcul(?: de)?|ca fait combien)\s+(.+)$/))) {
    let e = m[1].trim();
    e = e.replace(/(\d)\s+(\d{3})(?!\d)/g, '$1$2').replace(/\bfois\b/g, '*').replace(/\bmultiplie[e]? par\b/g, '*').replace(/\bdivise[e]? par\b/g, '/').replace(/\bplus\b/g, '+').replace(/\bmoins\b/g, '-');
    const p = e.match(/^(\d+(?:[.,]\d+)?)\s*%\s*de\s*(\d+(?:[.,]\d+)?)$/);
    if (p) e = p[2] + '*' + p[1] + '%';
    if (/^[\d\s+\-*/x×÷^().,%]+$/.test(e) && /\d/.test(e) && /[+\-*/x×÷^%]/.test(e)) return { outil: 'calcul', args: { expression: e } };
  }
  /* météo : « quel temps fait-il demain », « la météo demain à Nice », « quel temps aujourd'hui » */
  if ((m = t.match(/^(?:dis[- ]moi )?(?:quel temps (?:fait[- ]il|va[- ]t[- ]il faire|aura[- ]t[- ]on|fera[- ]t[- ]il)|quelle meteo|la meteo|meteo|il fait quel temps)(?: (aujourd'?hui|demain|apres[- ]demain|ce soir|maintenant|en ce moment))?(?: (?:a|au|aux|en|sur|pour) (?:la |le |les |l')?([a-z][a-z' -]{1,38}))?(?: (aujourd'?hui|demain|apres[- ]demain|ce soir))?$/))) {
    const quand = m[1] || m[3] || '';
    const dans = /apres/.test(quand) ? 2 : /demain/.test(quand) ? 1 : 0;
    const ville = (m[2] || '').trim();
    const args = { dans_jours: dans };
    if (ville && !VILLE_ICI.test(ville)) args.ville = ville;
    if (ville && /^monaco$/.test(ville)) delete args.ville;
    return { outil: 'meteo', args };
  }
  return null;
}

/* Exécute l'outil exact ; rend { texte, outil } ou null si l'outil échoue (l'IA reprendra la main). `ctx` = contexte des outils (planning absent ici). */
export async function reponseDirecte(message, env, ctx) {
  if (String(env && env.BEE_DIRECT) === '0') return null;
  const i = intentionDirecte(message);
  if (!i) return null;
  try {
    const exe = executeurs(ctx || {});
    const texte = String(await exe[i.outil](i.args)).trim();
    if (!texte) return null;
    return { texte, outil: i.outil };
  } catch (_) { return null; }
}
