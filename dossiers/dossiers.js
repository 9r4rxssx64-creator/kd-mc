(function () {
  'use strict';
  var q = document.getElementById('q');
  var res = document.getElementById('resultat');
  if (!q) return;
  var fiches = [].slice.call(document.querySelectorAll('.fiche'));
  var t = null;
  function filtre() {
    var v = q.value.trim().toLowerCase();
    var n = 0;
    fiches.forEach(function (f) {
      var ok = !v || (f.getAttribute('data-cherche') || '').indexOf(v) >= 0;
      f.hidden = !ok;
      if (ok) n++;
    });
    /* Dire « rien trouvé » plutôt que laisser un écran vide. */
    res.textContent = !v ? '' : (n ? n + ' collection(s)' : 'Rien sous ce mot. Essaie « justice », « succession », « banques ».');
    res.hidden = !v;
  }
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(filtre, 150); });
})();
/* 17.11.2026 (robot d'affichage, run 43973722309, pont 2578) : sur les écrans Safari du robot, dossiers.css était annulé pendant
   le chargement (« Load request cancelled ») → boutons « Ouvrir l'original » à 17 px de haut. Si la feuille n'a pas pris, on la redemande une fois. */
window.addEventListener('load', function () {
  try {
    var b = document.querySelector('.btn');
    if (b && b.getBoundingClientRect().height < 44) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'dossiers.css?r=' + Date.now(); document.head.appendChild(l);
    }
  } catch (e) { /* la page reste lisible sans */ }
});
