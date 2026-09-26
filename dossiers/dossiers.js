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
