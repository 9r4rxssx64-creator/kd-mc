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
  const texte = String(phrase ?? '').slice(0, 180);
  try {
    const w = window as unknown as { kdmcJournal?: (t: string, ty?: string) => void };
    if (typeof w.kdmcJournal === 'function') {
      w.kdmcJournal(texte, type);
      return;
    }
    /* v13.4.399 (cloud-installer 2676, mesuré en réel) : la CSP d'Apex AI (strict-dynamic) refuse /__boite/bouton.js, donc
       window.kdmcJournal n'existe JAMAIS ici. On parle alors directement à la porte du domaine (même origine, cookie de session). */
    if (typeof fetch === 'function') {
      void fetch('/__boite/journal', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: type === 'message' ? 'message' : 'modif', detail: texte }),
      }).catch(() => undefined);
    }
  } catch {
    /* le journal ne gêne jamais l'app */
  }
}
