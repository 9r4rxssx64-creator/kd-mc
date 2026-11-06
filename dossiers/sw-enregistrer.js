(function () {
  try {
    if (!('serviceWorker' in navigator)) return;
    var rl = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (rl || !sessionStorage.getItem('kdmc-sw-vu')) return;
      rl = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (r) {
      sessionStorage.setItem('kdmc-sw-vu', '1');
      try { r.update(); } catch (e) { /* mise à jour au prochain chargement */ }
    }).catch(function () { /* hors ligne ou refus : la page marche sans */ });
  } catch (e) { /* navigateur sans service worker */ }
})();
