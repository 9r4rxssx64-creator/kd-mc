/* Classer la réponse d'une destination de tuile : vivante, porte « fiche », ou morte.
 *
 * Pourquoi (27.09.2026, soir). « Vérif LIVE → rapport » était rouge sur `main` depuis la veille :
 * 8 destinations « mortes » sur 41. Mesuré (audit/verif-live/tuiles.md, 27/09 20:05 UTC) : ce
 * sont EXACTEMENT les 8 adresses derrière la porte « fiche » du routeur (World Monitor, OSINT,
 * Dossiers, Outils IA, Mes outils, la cuisine et son livre, Tor). Elles répondent 401 avec
 * l'en-tête `x-kdmc-porte: fiche` — la porte fait son travail, la page n'est pas morte.
 * La leçon #349 obligeait déjà à mettre à jour « la sonde en direct » avec la porte ; la
 * sonde des TUILES (tests/verif-tuiles-live.mjs), une deuxième sonde, avait été oubliée.
 *
 * Règle, stricte pour ne jamais masquer une vraie panne :
 *   · 2xx                                   → 'vivante'
 *   · 401/403 AVEC l'en-tête x-kdmc-porte   → 'porte'   (seul le routeur le pose)
 *   · tout le reste (404, 500, 401 SANS en-tête, réseau coupé) → 'morte'
 */
export function classerDestination(r) {
  if (!r || r.err) return 'morte';
  if (r.status >= 200 && r.status < 300) return 'vivante';
  if ((r.status === 401 || r.status === 403) && r.porte) return 'porte';
  return 'morte';
}
