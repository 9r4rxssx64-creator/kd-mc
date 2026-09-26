/**
 * Compliance — Vérification âge utilisateur (RGPD mineurs 16+)
 *
 * Mirroir typé de window.axComputeAge (apex-ai/index.html v12.551).
 * Sert de référence type-safe pour tests Vitest + future migration.
 */

export function computeAge(birthdateISO: string): number | null {
  if (!birthdateISO) return null;
  try {
    const d = new Date(birthdateISO);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
  } catch {
    return null;
  }
}

export function isMinorOrInvalid(birthdateISO: string, minAge: number = 16): boolean {
  const age = computeAge(birthdateISO);
  return age === null || age < minAge;
}
