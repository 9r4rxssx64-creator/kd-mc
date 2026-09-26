/* Page de RETOUR après paiement (Kevin 2026-09-18 « tout est prévu jusqu'à
   l'encaissement ? »). Avant, il n'y avait RIEN ici : le bouton ouvrait
   paypal.me dans un autre onglet et l'acheteur était livré à lui-même.
   Maintenant : PayPal le renvoie ici, on capture, on livre, on affiche le code.
   Si quoi que ce soit rate, on ne le laisse JAMAIS devant une page morte :
   on lui donne sa référence et le chemin de récupération. */
(function () {
  var API = 'https://kdmc-vente.9r4rxssx64.workers.dev';
  var q = new URLSearchParams(location.search);
  var ref = (q.get('ref') || '').toUpperCase();
  var annule = q.get('annule') === '1';
  var $ = function (id) { return document.getElementById(id); };
  var montre = function (id) { $(id).hidden = false; };

  function echoue(titre, message) {
    $('titre').textContent = titre;
    $('msg').textContent = message;
    $('ref').textContent = ref || '—';
    montre('rate');
  }

  if (annule) { echoue('Paiement annulé', "Tu n'as rien payé. Tu peux revenir quand tu veux."); return; }
  if (!ref) { echoue('Référence manquante', "On n'a pas retrouvé ta commande dans l'adresse de cette page."); return; }

  fetch(API + '/caisse/capture', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ref: ref }),
  }).then(function (r) { return r.json().then(function (d) { return { http: r.status, d: d }; }); })
    .then(function (x) {
      var d = x.d || {};
      if (!d.ok) {
        var pourquoi = d.error === 'non_paye' ? "Le paiement n'est pas encore confirmé par PayPal."
          : d.error === 'commande_inconnue' ? "Cette commande n'existe plus (elle a peut-être expiré)."
          : 'HTTP ' + x.http + ' : ' + (d.detail || d.error || 'raison inconnue');
        echoue('On n’a pas pu finaliser tout seul', pourquoi);
        return;
      }
      $('titre').textContent = d.deja_delivre ? 'Ton accès est déjà ouvert' : 'C’est bon, merci !';
      $('etat').hidden = true;
      $('code').textContent = d.code;
      var lien = d.livre || 'lire.html';
      $('ouvrir').href = lien + (lien.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(d.code);
      $('mail').textContent = d.email_envoye ? 'Le code vient aussi de partir par e-mail.'
        : "On n'a pas pu envoyer l'e-mail : note bien le code ci-dessus, c'est le seul endroit où il s'affiche.";
      if (d.recu) $('recu').textContent = 'Justificatif d’achat n° ' + d.recu + ' (garde-le avec ta référence ' + ref + ').';
      try { localStorage.setItem('kdmc_code', d.code); } catch (e) { /* navigation privée */ }
      montre('ok');
    })
    .catch(function (e) { echoue('Réseau indisponible', 'On n’a pas pu joindre la caisse : ' + (e && e.message ? e.message : e)); });
})();
