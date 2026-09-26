/**
 * APEX v13.4.345 — Détection d'intention → outil AUTO (Kevin 2026-07-07 :
 * « Tous les outils doivent être utilisés auto suivant les questions, travail demandé »).
 *
 * Transforme un message en langage naturel en la commande outil correspondante,
 * pour qu'Apex LANCE l'outil tout seul quand la demande l'implique clairement
 * (arsenal sécurité /audit /pentest, /web lecture de page, /perf audit perf).
 *
 * PRUDENCE (les dispatch coûtent du CI + hijack du chat = risque) : uniquement des
 * déclencheurs EXPLICITES et HAUTE CONFIANCE. Un message de conversation normal NE
 * DOIT PAS déclencher (couvert par les tests négatifs). Kill-switch :
 * localStorage `apex_v13_auto_tools` = 'off'.
 *
 * Pure logique (0 dépendance UI/DOM) → testable. Renvoie la string commande à passer
 * à handleSlashCommand (ex '/web https://…'), ou null.
 */

const KILL_KEY = 'apex_v13_auto_tools';

function autoToolsEnabled(): boolean {
  try {
    return localStorage.getItem(KILL_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Extrait la 1ʳᵉ URL http(s) du texte (ou null). */
function firstUrl(t: string): string | null {
  const m = t.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
}

function isKdmc(url: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com|9r4rxssx64-creator\.github\.io/i.test(url);
}

/**
 * @returns la commande slash à exécuter (ex '/audit', '/web https://…', '/perf'),
 *          ou null si aucune intention outil claire.
 */
export function detectToolIntent(raw: string): string | null {
  if (!autoToolsEnabled()) return null;
  const t = (raw || '').trim();
  if (!t || t.startsWith('/')) return null; /* déjà une commande */
  const low = t.toLowerCase();

  /* 🕷️ PENTEST (sécurité offensive) — verbe explicite. Cible kd-mc.com si présente. */
  if (/\b(pentest|test\s+d['’ ]?intrusion|pen[- ]?test|scan(ne|ner)?\s+(l['’ ]?app|le\s+site)\s+en\s+profondeur)\b/i.test(low)) {
    const url = firstUrl(t);
    return url && isKdmc(url) ? `/pentest ${url}` : '/pentest';
  }

  /* 🛡️ AUDIT SÉCURITÉ (scan statique du repo) — secrets / failles / outils nommés. */
  /* NB : pas de \b final — il échoue après une lettre accentuée (« sécurité » finit
   * par « é », non-\w en JS → \b ne se déclenche pas). Les alternatives sont assez
   * spécifiques pour se passer de la borne finale. */
  if (/\b(audit(e|er)?\s+(la\s+)?s[ée]curit[ée]|s[ée]curit[ée]\s+du\s+(repo|code)|scan(ne|ner)?\s+(les\s+)?secrets?|fuites?\s+de\s+secrets?|cl[ée]s?\s+expos[ée]es?|gitleaks|trufflehog|semgrep|osv[- ]?scanner|failles?\s+du\s+repo)/i.test(low)) {
    return '/audit';
  }

  /* ⚡ AUDIT PERF (Unlighthouse). Cible kd-mc.com si URL fournie. */
  if (/\b(audit\s+perf|perf(ormance)?\s+d[eu]\s+(mon\s+|l['’ ]?)?(site|app|page)|lighthouse|unlighthouse|vitesse\s+d[eu]\s+(mon\s+|l['’ ]?)?(site|app|page)|web\s*vitals)\b/i.test(low)) {
    const url = firstUrl(t);
    return url && isKdmc(url) ? `/perf ${url}` : '/perf';
  }

  /* 🌐 WEB (Agent-Reach) — lecture d'une page : verbe de lecture + URL, OU message = URL seule. */
  const url = firstUrl(t);
  if (url && !isKdmc(url)) { /* les URLs kd-mc.com internes ne partent pas en Agent-Reach */
    /* message qui est essentiellement juste l'URL (± ponctuation) */
    if (/^https?:\/\/[^\s<>"')]+[.?!]?$/i.test(t)) return `/web ${url}`;
    /* verbe de lecture explicite devant l'URL */
    if (/\b(lis|lire|r[ée]sume|r[ée]sumer|va\s+sur|ouvre|r[ée]cup[èe]re|analyse\s+cette\s+page|que\s+dit\s+cette\s+page)\b/i.test(low)) {
      return `/web ${url}`;
    }
  }

  return null;
}
