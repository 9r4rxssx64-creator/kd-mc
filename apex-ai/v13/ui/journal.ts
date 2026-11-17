/**
 * APEX v13 — Journal du domaine (« qui a fait quoi »).
 *
 * v13.4.398 (cloud-installer 2632 / 2637, Kevin 17.11 : « qui a fait quoi, quand, de tout le domaine, chaque app ») :
 * après un enregistrement RÉUSSI par une personne, une phrase courte part au journal du domaine
 * (`window.kdmcJournal`, posé par le routeur sur chaque page).
 * Règles : la phrase dit QUOI ; jamais le texte d'un message, un nom de projet, un code ni un identifiant ;
 * jamais d'appel sur un échec ni dans une boucle ; sans le script du domaine, ou hors ligne : rien ne se passe, aucune erreur.
 */
export function journalDomaine(phrase: string, type?: 'message'): void {
  try {
    const f = (window as unknown as { kdmcJournal?: (t: string, ty?: string) => void }).kdmcJournal;
    if (typeof f === 'function') f(String(phrase ?? '').slice(0, 180), type);
  } catch {
    /* le journal ne gêne jamais l'app */
  }
}
