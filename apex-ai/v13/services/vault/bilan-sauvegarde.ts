/**
 * Bilan de la copie cloud (Firebase) juste après le rangement de clés (23.10.2026, pont 622).
 * Avant : le nom de chaque clé était DEVINÉ (`ax_<nom>_key`) → pour « GitHub PAT classic » (stockée `ax_github_pat_classic`) la clé
 * cherchée n'existait jamais : « Firebase backup KO 0/1 — RISQUE de perte » à CHAQUE collage, même quand tout était bien rangé ;
 * et hors ligne (Firebase non connecté) la liste est vide : même fausse alarme.
 */
export type NiveauBilan = 'ok' | 'attente' | 'partiel' | 'ko';

export function bilanFirebase(clesRangees: string[], clesAuCloud: Set<string>, connecte: boolean): { niveau: NiveauBilan; texte: string; duree: number } {
  const n = clesRangees.length;
  if (!connecte) {
    return { niveau: 'attente', texte: `☁️ Copie cloud en attente : Firebase n'est pas joignable pour l'instant. Tes ${n} clé(s) sont bien rangées sur cet appareil ; la copie part à la reconnexion.`, duree: 7000 };
  }
  const ok = clesRangees.filter((k) => clesAuCloud.has(k)).length;
  if (ok === n) return { niveau: 'ok', texte: `💾 Firebase backup OK : ${ok}/${n} clés sauvegardées cross-device.`, duree: 5000 };
  if (ok === 0) return { niveau: 'ko', texte: `🚨 Firebase backup KO : 0/${n} sauvegardées. Tes clés sont local-only — RISQUE perte au reinstall PWA.`, duree: 10000 };
  return { niveau: 'partiel', texte: `⚠️ Firebase backup partiel : ${ok}/${n}`, duree: 7000 };
}
