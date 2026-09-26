/**
 * APEX v13.3.48 — Follow-up Suggestions service
 *
 * Demande Kevin "Chat Apex niveau Claude.ai/ChatGPT" :
 * Après chaque réponse Apex, propose 3 chips "💡 Pour aller plus loin..."
 * cliquables qui relancent une question pertinente.
 *
 * Stratégies :
 * 1. **Heuristique locale** (offline, instantanée) — basée sur keywords détectés
 *    dans la dernière réponse Apex. Couvre 80% des cas, gratuit, fiable.
 * 2. (futur) **Claude Haiku** — appel ultra-rapide pour suggestions sémantiques
 *    plus pertinentes. Désactivé par défaut pour économiser tokens.
 *
 * Patterns détectés (heuristique) :
 * - "code" / "fonction" / "bug" → "Comment optimiser ?", "Tests unitaires ?"
 * - "recette" / "cuisine" → "Variantes ?", "Allergènes ?", "Plan menu semaine ?"
 * - "loi" / "article" / "tribunal" → "Jurisprudence ?", "Cas pratique ?"
 * - "musique" / "mix" → "Effets supplémentaires ?", "Export ?", "Mastering ?"
 * - "voyage" / "ville" → "Restaurants ?", "Transport ?", "Météo ?"
 * - défaut → générique
 *
 * Pure logique (pas de DOM, pas de fetch). Wired par features/chat/index.ts.
 */

export interface FollowUpSuggestion {
  /** Texte affiché sur le chip (court, < 40 chars idéal) */
  label: string;
  /** Question complète envoyée au chat si user clique */
  prompt: string;
  /** Emoji pour décorer le chip */
  emoji: string;
}

interface CategoryRule {
  keywords: RegExp;
  suggestions: FollowUpSuggestion[];
}

/* Catalogue heuristique : 14 catégories de patterns connus.
 * NOTE : ordre IMPORTANT — la première règle qui match est utilisée.
 * Les catégories spécifiques (juridique avec "Code civil") doivent passer AVANT
 * les génériques (code/programmation). */
const CATEGORY_RULES: CategoryRule[] = [
  {
    /* Juridique en premier (le mot "Code" peut apparaître dans "Code civil",
     * doit pas matcher la règle "code/programmation") */
    keywords: /\b(loi|article|tribunal|jurisprudence|cassation|conseil d'état|juridique|code (civil|pénal|du travail|de procédure))\b/i,
    suggestions: [
      { label: 'Jurisprudence ?', prompt: 'Donne-moi 3 décisions de jurisprudence récentes sur ce sujet', emoji: '⚖️' },
      { label: 'Cas pratique', prompt: 'Donne-moi un cas pratique d\'application de cet article', emoji: '📖' },
      { label: 'Démarches ?', prompt: 'Quelles démarches concrètes pour faire valoir ce droit ?', emoji: '📋' },
    ],
  },
  {
    keywords: /\b(code [a-z]+\.[a-z]+|fonction|class|method|bug|debug|typescript|javascript|python|java|rust|nodejs|npm)\b/i,
    suggestions: [
      { label: 'Optimiser ?', prompt: 'Comment optimiser ce code (perf + lisibilité) ?', emoji: '⚡' },
      { label: 'Tests unitaires', prompt: 'Écris-moi les tests unitaires correspondants', emoji: '🧪' },
      { label: 'Sécurité ?', prompt: 'Y a-t-il des failles de sécurité à corriger ?', emoji: '🛡' },
    ],
  },
  {
    keywords: /\b(recette|cuisine|plat|ingrédient|cuisson|four|sauté|mijoté|gâteau|dessert)\b/i,
    suggestions: [
      { label: 'Variantes ?', prompt: 'Quelles sont les variantes possibles de cette recette ?', emoji: '🍴' },
      { label: 'Allergènes ?', prompt: 'Liste les allergènes INCO de cette recette', emoji: '⚠️' },
      { label: 'Vins assortis ?', prompt: 'Quels vins/boissons accompagnent ce plat ?', emoji: '🍷' },
    ],
  },
  {
    keywords: /\b(musique|mix|track|beat|mastering|reverb|EQ|compresseur|BPM)\b/i,
    suggestions: [
      { label: 'Effets +', prompt: 'Quels effets ajouter pour enrichir le mix ?', emoji: '🎛' },
      { label: 'Mastering', prompt: 'Donne-moi les étapes de mastering pour ce track', emoji: '🎚' },
      { label: 'Export ?', prompt: 'Quel format d\'export choisir (WAV/MP3/FLAC) et pourquoi ?', emoji: '💾' },
    ],
  },
  {
    keywords: /\b(vidéo|montage|clip|youtube|tiktok|capcut|premiere|effects)\b/i,
    suggestions: [
      { label: 'Transitions', prompt: 'Quelles transitions utiliser pour rythmer le montage ?', emoji: '🎬' },
      { label: 'Captions', prompt: 'Comment générer les sous-titres automatiques ?', emoji: '💬' },
      { label: 'Export ?', prompt: 'Quels paramètres d\'export pour TikTok/YouTube ?', emoji: '📤' },
    ],
  },
  {
    keywords: /\b(impôt|fiscal|déclaration|crédit|immo|plus-value|patrimoine|assurance)\b/i,
    suggestions: [
      { label: 'Optimiser', prompt: 'Comment optimiser fiscalement cette situation ?', emoji: '💰' },
      { label: 'Échéances', prompt: 'Quelles sont les échéances importantes à retenir ?', emoji: '📅' },
      { label: 'Documents', prompt: 'Quels documents conserver et combien d\'années ?', emoji: '📁' },
    ],
  },
  {
    keywords: /\b(médical|santé|symptôme|posologie|médicament|vidal|allergie|maladie)\b/i,
    suggestions: [
      { label: 'Avis médecin ?', prompt: 'Dans quels cas dois-je consulter un médecin en urgence ?', emoji: '🏥' },
      { label: 'Interactions', prompt: 'Quelles interactions médicamenteuses surveiller ?', emoji: '⚠️' },
      { label: 'Prévention', prompt: 'Comment prévenir ce problème à l\'avenir ?', emoji: '🛡' },
    ],
  },
  {
    keywords: /\b(voyage|destination|ville|pays|hôtel|vol|train|tourisme)\b/i,
    suggestions: [
      { label: 'Restaurants', prompt: 'Top 5 restaurants à essayer sur place', emoji: '🍽' },
      { label: 'Transport', prompt: 'Meilleur moyen de se déplacer sur place ?', emoji: '🚌' },
      { label: 'Météo', prompt: 'Quel est le meilleur moment pour partir ?', emoji: '☀️' },
    ],
  },
  {
    keywords: /\b(architecture|plan|maison|réno|surface|béton|RE2020|DTU|chantier)\b/i,
    suggestions: [
      { label: 'Coûts ?', prompt: 'Donne-moi un budget estimatif détaillé', emoji: '💶' },
      { label: 'Normes', prompt: 'Quelles normes RE2020/DTU s\'appliquent ?', emoji: '📐' },
      { label: 'Pros ?', prompt: 'Quels professionnels contacter et dans quel ordre ?', emoji: '👷' },
    ],
  },
  {
    keywords: /\b(traduction|traduire|anglais|italien|allemand|espagnol|chinois)\b/i,
    suggestions: [
      { label: 'Contexte ?', prompt: 'Adapte la traduction selon le contexte (formel/informel)', emoji: '🌍' },
      { label: 'Idiomes', prompt: 'Y a-t-il des expressions idiomatiques équivalentes ?', emoji: '💬' },
      { label: 'Prononciation', prompt: 'Donne-moi la prononciation phonétique', emoji: '🗣' },
    ],
  },
  {
    keywords: /\b(cv|curriculum|lettre|motivation|entretien|emploi|recrutement)\b/i,
    suggestions: [
      { label: 'Améliorer', prompt: 'Améliore et rends ce contenu plus impactant', emoji: '✨' },
      { label: 'LinkedIn', prompt: 'Comment adapter ce contenu pour LinkedIn ?', emoji: '💼' },
      { label: 'Entretien', prompt: 'Prépare-moi 5 questions probables d\'entretien', emoji: '🎤' },
    ],
  },
  {
    keywords: /\b(planning|équipe|shift|employé|RH|congé|absence|rotation)\b/i,
    suggestions: [
      { label: 'Optimiser', prompt: 'Comment optimiser ce planning ?', emoji: '📊' },
      { label: 'Conflits', prompt: 'Y a-t-il des conflits à anticiper ?', emoji: '⚠️' },
      { label: 'Convention', prompt: 'Cette répartition respecte-t-elle la convention ?', emoji: '📜' },
    ],
  },
  {
    keywords: /\b(météo|temps|climat|prévision|pluie|soleil|température)\b/i,
    suggestions: [
      { label: '7 jours', prompt: 'Donne-moi les prévisions sur 7 jours', emoji: '📅' },
      { label: 'Activités', prompt: 'Que faire avec ce temps ?', emoji: '🎯' },
      { label: 'Conseils', prompt: 'Comment me préparer (vêtements, accessoires) ?', emoji: '🧥' },
    ],
  },
  {
    keywords: /\b(jardinage|plante|jardin|potager|semer|planter|arrosage)\b/i,
    suggestions: [
      { label: 'Calendrier', prompt: 'Quel est le calendrier biodynamique pour cette plante ?', emoji: '🌱' },
      { label: 'Maladies', prompt: 'Quelles maladies surveiller et comment traiter ?', emoji: '🦠' },
      { label: 'Compagnonnage', prompt: 'Quelles plantes associer pour un meilleur rendement ?', emoji: '🌻' },
    ],
  },
];

/* Suggestions génériques (fallback si aucune catégorie ne match) */
const GENERIC_SUGGESTIONS: FollowUpSuggestion[] = [
  { label: 'Plus de détails', prompt: 'Donne-moi plus de détails sur ce point', emoji: '🔍' },
  { label: 'Exemple concret', prompt: 'Donne-moi un exemple concret', emoji: '💡' },
  { label: 'Aller plus loin', prompt: 'Comment aller plus loin sur ce sujet ?', emoji: '🚀' },
];

/**
 * Génère 3 suggestions de questions de follow-up basées sur la réponse Apex.
 *
 * @param assistantText - Texte de la dernière réponse Apex
 * @param userText - (optionnel) dernier message user (contexte additionnel)
 * @returns 3 suggestions ordonnées par pertinence
 */
export function generateFollowUps(assistantText: string, userText?: string): FollowUpSuggestion[] {
  const haystack = `${assistantText || ''} ${userText || ''}`.slice(0, 2000);
  if (!haystack.trim()) return GENERIC_SUGGESTIONS;

  /* Match toutes les catégories puis prend la première qui match */
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(haystack)) {
      return rule.suggestions;
    }
  }
  return GENERIC_SUGGESTIONS;
}

/**
 * Vérifie si les follow-ups sont activés (toggle user dans Réglages).
 * Default OFF v13.3.89 (Kevin 2026-05-08 22:50 frustré chips "Plus de détails /
 * Exemple concret / Aller plus loin" auto-injectées sans son consentement).
 * Activable via Réglages → Chat → "Suggestions automatiques après chaque
 * réponse" si Kevin veut les revoir.
 */
export function isFollowUpsEnabled(): boolean {
  try {
    const v = localStorage.getItem('apex_v13_followups_enabled');
    return v === '1'; /* v13.3.89 : default OFF (avant : default ON) */
  } catch {
    return false;
  }
}

export function setFollowUpsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('apex_v13_followups_enabled', enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
