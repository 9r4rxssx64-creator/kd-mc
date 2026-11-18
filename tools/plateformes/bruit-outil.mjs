/* Une erreur JavaScript qui vient de l'OUTIL (Playwright dans Firefox) et non de la page.
 * Mesuré le 18.11.2026 (robot public « Bee toutes plateformes », run 44209731102) : Firefox rend UNE fois « call to eval() blocked by CSP »
 * avec la pile « debugger eval code … builtinRequestAnimationFrame » = le script que Playwright injecte lui-même pour attendre une image ;
 * la page de Bee n'a ni eval ni new Function. Même rouge le 30.10 (run 41090972759), suivi d'un vert sans changement de Bee.
 * Règle : on n'écarte QUE les erreurs dont TOUTES les lignes de pile sont du code injecté par l'outil ; une pile qui nomme un fichier de la page
 * (javis-widget.js, index.html, …) reste une vraie erreur de Bee. */
export function estBruitOutil(e) {
  const pile = String((e && e.stack) || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const lignes = pile.filter((l) => !/^\w*Error\b/.test(l));
  if (!lignes.length) return false;
  return lignes.every((l) => /debugger eval code|builtinRequestAnimationFrame|__playwright|UtilityScript/.test(l));
}
