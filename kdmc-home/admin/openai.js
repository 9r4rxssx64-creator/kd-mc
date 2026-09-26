/* KDMC ADMIN — « Qu'est-ce qui consomme mon OpenAI ? » + la voix gratuite à écouter.
 *
 * POURQUOI CETTE PAGE (Kevin 2026-09-22)
 * --------------------------------------
 * « J'ai eu des prélèvements. Quelque chose consomme mon OpenAI, dis-moi quoi,
 *   et trouve une solution pour le faire en gratuit, avec les mêmes résultats. »
 *
 * Deux réponses, sur un seul écran :
 *
 *  1. CE QUI CONSOMME — des CHIFFRES, pas une supposition. Le domaine compte
 *     désormais chaque appel réellement PAYÉ chez OpenAI (un son déjà en cache
 *     est gratuit et ne compte pas). Si le total est 0 sur 30 jours, le domaine
 *     de Kevin n'est PAS la cause du prélèvement, et il faut chercher ailleurs.
 *     On ne peut pas lire SA facture OpenAI d'ici : ça demanderait une clé
 *     d'administration de son compte, qu'on n'a pas et qu'on ne demandera pas.
 *     On mesure donc ce qu'on peut mesurer honnêtement : ce que NOUS envoyons.
 *
 *  2. LA VOIX GRATUITE — Kevin ÉCOUTE les deux et tranche. La qualité d'une
 *     voix ne se mesure pas, elle s'entend ; et il avait justement râlé le
 *     18.09 (« on dirait un robot »). Je ne bascule donc pas tout le domaine
 *     sur le gratuit dans son dos : il appuie, il compare, il dit. Le jour où
 *     il dit « prends la gratuite », une seule constante change côté serveur.
 */
(function () {
  'use strict';
  var app = document.getElementById('app');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* La phrase d'essai est VOLONTAIREMENT une vraie phrase de leçon, avec une
     liaison et une intonation de question : c'est là qu'un moteur médiocre
     s'entend. Un « bonjour » sec ne départage rien. */
  var PHRASE = "Bonjour ! Aujourd'hui, on apprend à commander au restaurant. Tu es prêt ?";

  function deny(raison) {
    app.innerHTML = '<div class="tile"><h3>🔒 Accès administrateur</h3>'
      + '<p>' + esc(raison || "Cette page n'est visible que par l'administrateur du domaine.") + '</p>'
      + '<p>Connecte-toi sur <a href="/" style="color:var(--gold)">kd-mc.com</a> avec ton compte, puis reviens ici.</p></div>';
  }

  function tableau(j) {
    if (!j.jours || !j.jours.length) {
      return '<p>Aucun appel payant enregistré depuis la mise en place du compteur. '
        + 'C\'est normal juste après : le compteur ne connaît que ce qui s\'est passé APRÈS son installation, '
        + 'il ne peut pas remonter le temps.</p>';
    }
    return '<table><thead><tr><th>Jour</th><th class="n">Voix payées</th><th class="n">Appels en direct</th></tr></thead><tbody>'
      + j.jours.map(function (d) {
        return '<tr><td>' + esc(d.jour) + '</td><td class="n">' + d.voix + '</td><td class="n">' + d.appels + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function rendre(j) {
    app.innerHTML =
      '<h2 class="cat">💶 Ce que ton domaine fait payer chez OpenAI</h2>'
      + '<div class="kpis">'
      + '<div class="kpi"><span class="l">Voix payées (30 j)</span><span class="v">' + j.totalVoix + '</span><span class="s">1 = une phrase dite pour la 1re fois</span></div>'
      + '<div class="kpi"><span class="l">Appels en direct (30 j)</span><span class="v">' + j.totalAppels + '</span><span class="s">le plus cher : facturé à la minute</span></div>'
      + '<div class="kpi"><span class="l">Phrases payées depuis le début</span><span class="v">'
      + (j.sonsComplet ? '' : '≥ ') + (j.sonsEnMemoire == null ? '—' : j.sonsEnMemoire) + '</span>'
      + '<span class="s">chacune n\'a été payée qu\'UNE fois</span></div>'
      + '<div class="kpi"><span class="l">Depuis le compteur</span><span class="v">aujourd\'hui</span>'
      + '<span class="s">il ne peut pas remonter le temps</span></div>'
      + '</div>'
      + '<div class="tile"><p>' + esc(j.note || '') + '</p>'
      + '<p style="color:var(--subtle)">Une phrase déjà entendue ne coûte plus rien : elle est gardée 400 jours et resservie telle quelle. '
      + 'C\'est pour ça que le chiffre reste bas même quand l\'app tourne beaucoup.</p>'
      + '<p style="color:var(--subtle)"><b>Sur le passé</b> — le compteur date d\'aujourd\'hui, il ne peut pas remonter le temps. '
      + 'Mais chaque phrase payée a laissé son son en mémoire : les compter donne, à peu près, '
      + 'le nombre de synthèses payées <b>depuis toujours</b>. C\'est la seule réponse chiffrée possible sur le passé '
      + 'sans lire ta facture OpenAI — que je ne peux pas lire d\'ici.</p>'
      + tableau(j) + '</div>'

      + '<h2 class="cat">🔊 La voix gratuite — écoute et tranche</h2>'
      + '<div class="tile"><p>Même phrase, deux moteurs. Appuie sur les deux, écoute, et dis-moi lequel tu gardes. '
      + 'Tant que tu n\'as rien dit, <b>rien ne change</b> : tout le monde continue d\'entendre la voix actuelle.</p>'
      + '<div class="deux">'
      + '<button class="btn" id="b-payante">▶︎ Voix actuelle <span style="color:var(--mut);font-weight:400">(payante)</span></button>'
      + '<button class="btn" id="b-gratuite">▶︎ Voix gratuite <span style="color:var(--mut);font-weight:400">(0 €)</span></button>'
      + '</div>'
      + '<div class="etat" id="etat"></div>'
      + '<p style="color:var(--subtle)">La voix gratuite passe par Google, avec la clé que tu as déjà. '
      + 'Elle parle les mêmes langues et reçoit la même consigne de jeu que l\'autre. '
      + 'Si elle te plaît, on bascule et ces appels-là ne te coûteront plus rien.</p>'
      + '</div>';

    var etat = document.getElementById('etat');
    var enCours = null;
    function joue(bouton, url, nom) {
      var b = document.getElementById(bouton);
      if (!b) return;
      b.addEventListener('click', function () {
        if (enCours) { try { enCours.pause(); } catch (e) { /* rien */ } }
        etat.textContent = '⏳ ' + nom + ' — préparation du son…';
        b.classList.add('on');
        var a = new Audio(url + '&_=' + Date.now());
        enCours = a;
        a.addEventListener('playing', function () { etat.textContent = '🔊 ' + nom + ' — écoute…'; });
        a.addEventListener('ended', function () { etat.textContent = '✅ ' + nom + ' — terminé.'; b.classList.remove('on'); });
        a.addEventListener('error', function () {
          /* JAMAIS un échec muet : on dit ce qui s'est passé, en français. */
          etat.textContent = '⚠️ ' + nom + " n'a pas pu être lue (moteur indisponible ou son refusé par le navigateur). Réessaie.";
          b.classList.remove('on');
        });
        var p = a.play();
        if (p && p.catch) p.catch(function () {
          etat.textContent = "⚠️ Ton navigateur a refusé de lancer le son. Appuie une seconde fois.";
          b.classList.remove('on');
        });
      });
    }
    var base = '/__lingua/tts?v=nova&t=' + encodeURIComponent(PHRASE);
    joue('b-payante', base, 'Voix actuelle');
    joue('b-gratuite', base + '&m=gemini', 'Voix gratuite');
  }

  fetch('/__lingua/depense', { credentials: 'include', cache: 'no-store' })
    .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
    .then(function (o) {
      if (o.s === 403 || !o.j || o.j.ok !== true) { deny(); return; }
      rendre(o.j);
    })
    .catch(function (e) {
      /* On dit la vraie cause plutôt qu'un « erreur » creux (règle : toujours
         détailler l'erreur, sinon on ne peut pas savoir pourquoi ça a raté). */
      deny('Le domaine n\'a pas répondu : ' + String((e && e.message) || e).slice(0, 80));
    });
})();
