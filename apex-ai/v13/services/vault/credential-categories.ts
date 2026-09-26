/**
 * APEX v13 — Credential Criticality Categories.
 *
 * Kevin règle absolue 2026-05-08 : le notif "71 credentials manquants" est
 * un faux positif — Kevin n'a pas besoin de configurer 80+ services optionnels.
 *
 * Trois niveaux de criticité :
 *  - ESSENTIAL : au moins 1 IA provider doit être présent (sinon Apex IA ne marche
 *    pas). Si TOUS absents → notif WARN + alerte Kevin.
 *  - RECOMMENDED : services importants (GitHub, push notifs, search…). 5+ manquants
 *    → notif INFO discrète.
 *  - OPTIONAL : tout le reste (Spotify, Notion, Linear, Datadog, banques, crypto,
 *    réseaux sociaux…). JAMAIS de notif. Si Kevin n'a pas configuré son compte
 *    Spotify, c'est NORMAL.
 *
 * La règle "AU MOINS 1 IA" s'applique au groupe ESSENTIAL : si Kevin a Anthropic,
 * il n'a pas besoin de OpenAI/OpenRouter/etc. Pas de notif si 1+ providers OK.
 *
 * v13.3.80 (Kevin fix faux positif notif spam 2026-05-08).
 */

export type CredentialCriticality = 'essential' | 'recommended' | 'optional';

/**
 * ESSENTIAL — au moins UN parmi cette liste DOIT être présent pour qu'Apex
 * fonctionne (au minimum un provider IA). Max 8 entrées.
 *
 * Logique notif : si 0/N de ces clés présentes → WARN. Si ≥1 présent → OK,
 * pas de notif même si les 7 autres sont absents.
 */
export const ESSENTIAL_KEYS: ReadonlyArray<string> = [
  'ax_anthropic_key',
  'ax_openrouter_key',
  'ax_groq_key',
  'ax_google_key', /* alias Gemini */
  'ax_gemini_key',
  'ax_openai_key',
  'ax_mistral_key',
  'ax_cohere_key',
];

/**
 * RECOMMENDED — utile pour features Apex (GitHub auto-fix, push notifs, web search,
 * comms, crypto). Pas critique : si manquants Apex tourne, mais sans ces capacités.
 *
 * Logique notif : si ≥5 manquantes → INFO. Sinon silence.
 */
export const RECOMMENDED_KEYS: ReadonlyArray<string> = [
  'ax_github_token',
  'ax_kevin_whatsapp_phone',
  'ax_brave_key',
  'ax_tavily_key',
  'ax_replicate_key',
  'ax_pinecone_key',
  'ax_telegram_token',
  'ax_telegram_chat_id',
  'ax_stripe_sk',
  'ax_resend_key',
  'ax_elevenlabs_key',
  'ax_discord_webhook_url',
];

/**
 * Détecte la criticité d'une clé donnée (fallback OPTIONAL si non listée).
 */
export function getCriticality(storageKey: string): CredentialCriticality {
  if (ESSENTIAL_KEYS.includes(storageKey)) return 'essential';
  if (RECOMMENDED_KEYS.includes(storageKey)) return 'recommended';
  return 'optional';
}

/**
 * Statistiques croisées présence/criticité pour une liste de clés présentes.
 *
 * @param presentKeys liste des storage_key actuellement en localStorage (déchiffrables).
 * @returns counts par catégorie + booléens "au moins une essential présente".
 */
export interface CategoryStats {
  essential: { present: number; total: number; missing: string[] };
  recommended: { present: number; total: number; missing: string[] };
  optional: { present: number; total_known: number; missing_known: string[] };
  /** TRUE si AU MOINS un provider IA essential présent (pas besoin notif WARN). */
  has_any_essential: boolean;
}

export function computeStats(
  presentKeys: ReadonlyArray<string>,
  allKnownKeys: ReadonlyArray<string>,
): CategoryStats {
  const present = new Set(presentKeys);

  const essentialMissing = ESSENTIAL_KEYS.filter((k) => !present.has(k));
  const essentialPresent = ESSENTIAL_KEYS.length - essentialMissing.length;

  const recommendedMissing = RECOMMENDED_KEYS.filter((k) => !present.has(k));
  const recommendedPresent = RECOMMENDED_KEYS.length - recommendedMissing.length;

  /* Optional = toutes les clés connues SAUF essential + recommended */
  const optionalKeys = allKnownKeys.filter(
    (k) => !ESSENTIAL_KEYS.includes(k) && !RECOMMENDED_KEYS.includes(k),
  );
  const optionalMissing = optionalKeys.filter((k) => !present.has(k));
  const optionalPresent = optionalKeys.length - optionalMissing.length;

  return {
    essential: {
      present: essentialPresent,
      total: ESSENTIAL_KEYS.length,
      missing: essentialMissing,
    },
    recommended: {
      present: recommendedPresent,
      total: RECOMMENDED_KEYS.length,
      missing: recommendedMissing,
    },
    optional: {
      present: optionalPresent,
      total_known: optionalKeys.length,
      missing_known: optionalMissing,
    },
    has_any_essential: essentialPresent > 0,
  };
}
