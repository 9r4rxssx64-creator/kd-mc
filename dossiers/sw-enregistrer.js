(function () {
  try {
    if (!('serviceWorker' in navigator)) return;
    var rl = false;
    /* 17.11 (robot d'affichage, pont 2608) : à la PREMIÈRE visite il n'y a pas d'ancien service worker ; recharger coupait la feuille de
       style en plein chargement (boutons à 17 px). On ne recharge que pour une vraie mise à jour (un ancien service worker contrôlait la page). */
    var avant = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (rl || !avant || !sessionStorage.getItem('kdmc-sw-vu')) return;
      rl = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (r) {
      sessionStorage.setItem('kdmc-sw-vu', '1');
      try { var u=r.update();if(u&&u.catch)u.catch(function(){}); } catch (e) { /* mise à jour au prochain chargement */ }
    }).catch(function () { /* hors ligne ou refus : la page marche sans */ });
  } catch (e) { /* navigateur sans service worker */ }
})();
