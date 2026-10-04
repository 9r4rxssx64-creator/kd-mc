/* Bee et Bourricot en 3D — ce qui les fait RÉAGIR (javis/3d.html).
 * - un bouton (Saute, Rigole, Oh !, Coucou) ou un simple toucher sur le personnage → il joue la
 *   réaction (2 s, une fois), avec un petit bruit fabriqué sur place (aucun fichier son, gratuit),
 *   puis il retourne à sa vie (respire, cligne des yeux, bouge oreilles / antennes / queue) ;
 * - si l'affichage 3D ne vient pas (vieux téléphone, réseau coupé) : l'image + le lien direct
 *   « réalité augmentée » de l'iPhone restent, jamais un écran vide. */
(function () {
  'use strict';
  var ORDRE = ['saute', 'rire', 'surprise', 'coucou'];
  var son = null;

  /* petits bruits synthétisés (Web Audio) : créés pendant le toucher, donc permis par l'iPhone */
  function bruit(nom) {
    try {
      son = son || new (window.AudioContext || window.webkitAudioContext)();
      if (son.state === 'suspended') son.resume();
      var t = son.currentTime;
      var notes = {
        saute: [[330, 660, 0, 0.18]],
        rire: [[520, 480, 0, 0.07], [560, 500, 0.1, 0.07], [600, 520, 0.2, 0.07], [640, 540, 0.3, 0.09]],
        surprise: [[300, 880, 0, 0.22]],
        coucou: [[660, 660, 0, 0.12], [880, 880, 0.14, 0.18]]
      }[nom] || [];
      notes.forEach(function (n) {
        var o = son.createOscillator(), g = son.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(n[0], t + n[2]);
        o.frequency.exponentialRampToValueAtTime(n[1], t + n[2] + n[3]);
        g.gain.setValueAtTime(0.0001, t + n[2]);
        g.gain.exponentialRampToValueAtTime(0.18, t + n[2] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[2] + n[3]);
        o.connect(g); g.connect(son.destination);
        o.start(t + n[2]); o.stop(t + n[2] + n[3] + 0.02);
      });
    } catch (e) { /* pas de son possible : la réaction se joue quand même */ }
  }

  var DUREE = 2000;   // une réaction dure 2 s (tools/3d/personnages.mjs, DUREE_REACTION)

  function revenir(mv) {
    clearTimeout(mv._retour);
    mv.dataset.reaction = '';
    mv.animationName = 'vie';
    Promise.resolve(mv.updateComplete).then(function () { mv.play(); });
  }

  function reagir(mv, nom) {
    if (!mv || typeof mv.play !== 'function') return;
    mv.dataset.reaction = nom;
    mv.dataset.reactions = String((+mv.dataset.reactions || 0) + 1);   // compteur (lu par test:3d)
    mv._debut = Date.now();
    mv.animationName = nom;
    /* model-viewer change d'animation à sa prochaine mise à jour : lancer play() AVANT la jouait sur
       l'ancienne (mesuré le 3.10 : la réaction tournait en boucle sans jamais revenir à la vie) */
    Promise.resolve(mv.updateComplete).then(function () { mv.currentTime = 0; mv.play({ repetitions: 1 }); });
    /* filet : même si l'événement « finished » ne vient pas, il revient à sa vie */
    clearTimeout(mv._retour);
    mv._retour = setTimeout(function () { if (mv.dataset.reaction === nom) revenir(mv); }, DUREE + 400);
    bruit(nom);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* rien */ } }
  }

  function brancher(carte) {
    var mv = carte.querySelector('model-viewer');
    if (!mv) return;
    var suivant = 0;
    /* fin d'une réaction → retour à la vie, en boucle */
    /* (un « finished » arrive aussi pour l'animation QU'ON QUITTE — mesuré le 3.10 : sans ce délai minimum,
       Bee revenait à sa vie 0,3 s après le toucher et la réaction ne se voyait pas) */
    mv.addEventListener('finished', function () { if (mv.dataset.reaction && Date.now() - (mv._debut || 0) > DUREE - 300) revenir(mv); });
    carte.querySelectorAll('[data-anim]').forEach(function (b) {
      b.addEventListener('click', function () { reagir(mv, b.getAttribute('data-anim')); });
    });
    /* toucher le personnage (sans le faire tourner) = la réaction suivante */
    var x0 = 0, y0 = 0;
    mv.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; });
    mv.addEventListener('pointerup', function (e) {
      if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 10) return;   // c'était un glissé : il tourne
      if (e.target && e.target.closest && e.target.closest('[slot="ar-button"]')) return;
      reagir(mv, ORDRE[suivant++ % ORDRE.length]);
    });
  }

  function demarrer() {
    var cartes = document.querySelectorAll('[data-perso]');
    cartes.forEach(brancher);
    /* arrivée depuis Lingua / Bee (#bee, #bourricot) : on montre TOUT DE SUITE le personnage choisi */
    var cible = document.querySelector('[data-perso="' + String(location.hash || '').replace(/[^a-z]/g, '') + '"]');
    if (cible) setTimeout(function () { try { cible.scrollIntoView({ block: 'start' }); } catch (e) { /* rien */ } }, 60);
    /* la flèche ← ramène là d'où on vient (Lingua, un autre site…) ; sinon, à Bee */
    var retour = document.getElementById('retour');
    if (retour) retour.addEventListener('click', function (e) {
      var ext = false; try { ext = !!document.referrer && new URL(document.referrer).origin !== location.origin; } catch (x) { /* rien */ }
      if (ext && history.length > 1) { e.preventDefault(); history.back(); }
    });
    /* la 3D n'est pas venue en 8 s → l'image et le lien direct vers la réalité augmentée */
    setTimeout(function () {
      if (!window.customElements || !customElements.get('model-viewer')) document.body.classList.add('sans-3d');
    }, 8000);
    if (window.customElements && customElements.whenDefined) {
      customElements.whenDefined('model-viewer').then(function () {
        document.body.classList.remove('sans-3d');
        document.body.dataset.pret3d = '1';
      });
    }
  }

  window.KdmcVue3D = { reactions: ORDRE.slice(), reagir: reagir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
