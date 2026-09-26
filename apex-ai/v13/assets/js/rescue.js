/* APEX v13 — Rescue button handler externalisé (CSP strict v13.0.13).
 * Avant : onclick=" inline = besoin unsafe-inline.
 * Après : addEventListener depuis script avec nonce = CSP strict OK.
 *
 * Préserve la règle Kevin "qu'au minimum 1 bouton fonctionne TOUJOURS".
 * Reset complet : SW unregister + cache clear + reload, données préservées.
 */
(function () {
  'use strict';

  function rescueReset() {
    try {
      if (!confirm(
        "Reset Apex complet ?\n\n" +
        "• Service Worker desinstalle\n" +
        "• Caches effaces\n" +
        "• App rechargee fraiche\n\n" +
        "Tes donnees (Coffre, profil, conversations) sont PRESERVEES."
      )) return;
    } catch (_) { /* prompt bloqué : continue quand même */ }

    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          rs.forEach(function (r) { r.unregister(); });
        }).catch(function () {});
      }
    } catch (_) { /* ignore */ }

    try {
      if ('caches' in window) {
        caches.keys().then(function (ks) {
          ks.forEach(function (k) { caches.delete(k); });
        }).catch(function () {});
      }
    } catch (_) { /* ignore */ }

    setTimeout(function () {
      try {
        location.href = location.pathname + '?_reset=' + Date.now();
      } catch (_) {
        location.reload();
      }
    }, 400);
  }

  /* v13.3.74 a11y fix : skip-link bypass router hash (focus programmatique).
   * On évite href="#apex-root" qui collisionnerait avec router.dispatch (route inconnue).
   */
  function initSkipLink() {
    var skipLinks = document.querySelectorAll('a.ax-skip-link, a.skip-link');
    for (var i = 0; i < skipLinks.length; i++) {
      skipLinks[i].addEventListener('click', function (e) {
        var target = this.getAttribute('data-ax-skip-target') || 'apex-root';
        var el = document.getElementById(target);
        if (el) {
          e.preventDefault();
          /* tabindex=-1 permet focus programmatique sans entrer dans tab order */
          if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
          el.focus({ preventScroll: false });
          /* scroll smooth vers le main */
          try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
        }
      });
    }
  }

  /* v13.4.80 — Toolbar permanente HTML pur (Kevin "pas de bouton / tjs pas de coffre"). */
  function navHash(hash) {
    return function () {
      try {
        location.hash = hash;
        /* Force re-dispatch même si déjà sur la route (Apex router écoute hashchange) */
        if (location.hash === hash) {
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      } catch (_) {
        location.replace(location.pathname + hash);
      }
    };
  }

  function initRescueToolbar() {
    var bind = function (id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    bind('apex-rescue-coffre', navHash('#vault'));
    bind('apex-rescue-dashboard', navHash('#dashboard'));
    bind('apex-rescue-admin', navHash('#admin'));
    bind('apex-rescue-chat', navHash('#chat'));
    bind('apex-rescue-login', navHash('#login'));
  }

  /* v13.4.248 — Anti-zoom pinch RETIRÉ (accessibilité, Apple HIG + skill
     apex-ui-ux-pro-max "ne jamais désactiver le zoom"). Le double-tap-zoom
     reste neutralisé par CSS touch-action:manipulation (rescue.css/base.css),
     sans bloquer le pinch-zoom utilisateur. */

  /* v13.4.95 — Toolbar rescue masquable (Kevin "boutons superposés / pas accès fonctions").
     Tap long sur n'importe quel bouton toolbar → toggle visibility.
     Persistence localStorage apex_v13_rescue_hidden. */
  function initToolbarToggle() {
    try {
      /* v13.4.176 (Kevin "Toujours superposition de commandes") :
       * Toolbar rescue MASQUÉE par défaut (CSS force visibility:hidden).
       * Activée uniquement si :
       *   - body[data-apex-rescue="1"] : framework KO détecté par failSafe (6s)
       *   - body[data-apex-rescue-show="1"] : Kevin a explicitement opt-in
       * Long-press SOS bouton 800ms → toggle data-apex-rescue-show
       */
      var sosBtn = document.getElementById('apex-rescue-btn');
      if (!sosBtn) return;

      /* Restore opt-in state */
      var optIn = false;
      try { optIn = localStorage.getItem('apex_v13_rescue_show') === '1'; } catch (_) {}
      if (optIn) document.body.setAttribute('data-apex-rescue-show', '1');

      /* Long press 800ms sur SOS → toggle opt-in toolbar */
      var pressTimer = null;
      sosBtn.addEventListener('touchstart', function () {
        pressTimer = setTimeout(function () {
          var nowShown = document.body.getAttribute('data-apex-rescue-show') === '1';
          if (nowShown) {
            document.body.removeAttribute('data-apex-rescue-show');
            try { localStorage.setItem('apex_v13_rescue_show', '0'); } catch (_) {}
          } else {
            document.body.setAttribute('data-apex-rescue-show', '1');
            try { localStorage.setItem('apex_v13_rescue_show', '1'); } catch (_) {}
          }
          /* Vibration feedback si dispo */
          try { if (navigator.vibrate) navigator.vibrate(20); } catch (_) {}
        }, 800);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(function (evt) {
        sosBtn.addEventListener(evt, function () {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        }, { passive: true });
      });
    } catch (_) { /* ignore */ }
  }

  function init() {
    var btn = document.getElementById('apex-rescue-btn');
    if (btn) btn.addEventListener('click', rescueReset);
    initRescueToolbar();
    initSkipLink();
    initToolbarToggle();
  }

  /* Fail-safe : si bundle ne charge pas dans 6s, montre rescue button + toolbar */
  function failSafe() {
    setTimeout(function () {
      try {
        var root = document.getElementById('apex-root');
        if (!root || !root.innerHTML.trim()) {
          var btn = document.getElementById('apex-rescue-btn');
          if (btn) btn.classList.add('visible');
          /* v13.4.176 : framework KO → mode rescue forcé (toolbar visible) */
          document.body.setAttribute('data-apex-rescue', '1');
          var splash = document.getElementById('apex-splash');
          if (splash) {
            var hint = document.createElement('div');
            hint.className = 'apex-splash-hint';
            hint.textContent = 'Chargement plus long que prévu. Tape SOS en bas-droite si bloqué.';
            splash.appendChild(hint);
          }
        }
      } catch (_) { /* ignore */ }
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      failSafe();
    });
  } else {
    init();
    failSafe();
  }
})();
