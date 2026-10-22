/* MESURE DE LA BOUCHE DE BEE : « elle bouge sur le son et revient au repos sur le silence ».
 * 22.10.2026 (pont 214) : le test réel était INSTABLE (même code, un passage vert, un rouge 23 s après : écart 0.20 → 0.19). Cause mesurée : la fenêtre « calme » était un
 * temps FIXE (1350-2050 ms après la 1re image pilotée) alors que la note finit à ~1300 ms : 50 ms de marge. Sous charge, la queue de la note se décale dans la fenêtre
 * (mesuré : 0.07 au repos, 0.11 sous charge, seuil d'échec 0.15) et une image de la note suffit à faire rater « fort > 1,3 × calme ».
 * Désormais les fenêtres s'accrochent à la FIN réelle de la parole (le moment où la bouche rend la main = fin du son, silence compris), qui ne dépend pas du retard au démarrage :
 *   · calme = les 600 dernières ms ; · fort = de 60 ms jusqu'à 900 ms avant la fin (la zone de silence est exclue).
 * `serie` = [[ms depuis la 1re image pilotée, écart au repos de l'ouverture], …]. Pur : aucun navigateur ici. */
export const RATIO = 1.3, DEBUT_MS = 60, FIN_CALME_MS = 600, ZONE_SILENCE_MS = 900, DUREE_MIN_MS = 1500, IMAGES_MIN = 20;

export function evaluerBouche(serie) {
  if (!Array.isArray(serie) || serie.length < IMAGES_MIN) return { ok: false, raison: 'trop peu d\'images pilotées (' + (serie ? serie.length : 0) + ')', fort: 0, calme: 0 };
  const fin = serie[serie.length - 1][0];
  if (fin < DUREE_MIN_MS) return { ok: false, raison: 'parole trop courte pour mesurer un silence (' + fin + ' ms)', fort: 0, calme: 0 };
  const max = (a, b) => serie.reduce((m, [t, y]) => (t >= a && t < b && y > m ? y : m), 0);
  const fort = max(DEBUT_MS, fin - ZONE_SILENCE_MS), calme = max(fin - FIN_CALME_MS, fin + 1);
  return { ok: fort > calme * RATIO, fort, calme, fin, raison: fort > calme * RATIO ? '' : 'la bouche ne se distingue pas entre le son et le silence' };
}

/* L'ANCIENNE mesure (fenêtres fixes), gardée ici seulement pour PROUVER que la nouvelle est plus robuste (voir verify-bouche-fenetres.mjs). */
export function evaluerBoucheAncienne(serie) {
  const max = (a, b) => serie.reduce((m, [t, y]) => (t >= a && t < b && y > m ? y : m), 0);
  const fort = max(60, 1050), calme = max(1350, 2050);
  return { ok: fort > calme * 1.3, fort, calme };
}
