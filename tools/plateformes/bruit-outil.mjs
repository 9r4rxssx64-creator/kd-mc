/* Une erreur JavaScript qui vient de l'OUTIL (Playwright dans Firefox) et non de la page.
 * Mesuré le 18.11.2026 (robot public « Bee toutes plateformes », run 44209731102) : Firefox rend UNE fois « call to eval() blocked by CSP »
 * avec la pile « debugger eval code … builtinRequestAnimationFrame » = le script que Playwright injecte lui-même pour attendre une image ;
 * la page de Bee n'a ni eval ni new Function. Même rouge le 30.10 (run 41090972759), suivi d'un vert sans changement de Bee.
 * Règle : on n'écarte QUE les erreurs dont TOUTES les lignes de pile sont du code injecté par l'outil ; une pile qui nomme un fichier de la page
 * (javis-widget.js, index.html, …) reste une vraie erreur de Bee. */
export function estBruitOutil(e) {
  const pile = String((e && e.stack) || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const msg = String((e && e.message) || '').trim();
  // 18.11 (run 44219934002) : sur Firefox l'en-tête de la pile peut être le MESSAGE SEUL (sans « Error: ») — ce n'est pas une ligne de code.
  // 18.11 (run 44221390129, pile entière) : la dernière ligne d'une pile Firefox est « evaluateFunction (chrome://juggler/content/content/Runtime.js) » = le moteur d'automatisation de Playwright, pas la page.
  const lignes = pile.filter((l) => !/^\w*Error\b/.test(l) && !(msg && l.includes(msg)));
  if (!lignes.length) return false;
  return lignes.every((l) => /debugger eval code|builtinRequestAnimationFrame|__playwright|UtilityScript|chrome:\/\/juggler\//.test(l));
}
