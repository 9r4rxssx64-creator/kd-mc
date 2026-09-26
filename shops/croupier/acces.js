/* acces.js — « j'ai payé, donne-moi mon accès ».
   Aucune décision n'est prise ici : la page POSE la question au worker et OBÉIT
   à sa réponse. Un verrou écrit dans un fichier public ne protège rien (le
   contenu payant est servi par le worker, pas caché dans cette page).
   Logique pure exportée en bas pour être testée hors navigateur. */
(function () {
  'use strict';

  var API = 'https://kdmc-vente.9r4rxssx64.workers.dev';

  /* ── Logique pure (testée sans navigateur) ───────────────────────────── */

  /* Une adresse e-mail plausible — on ne valide pas plus loin, c'est le
     paiement qui fait foi, pas la forme de l'adresse. */
  function emailPlausible(v) {
    return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(v || '').trim());
  }

  /* Traduit la réponse du worker en QUOI AFFICHER. Trois états seulement :
     accès donné / en attente (on explique pourquoi) / erreur. */
  function interprete(rep, httpOk) {
    if (!rep || typeof rep !== 'object') {
      return { etat: 'erreur', titre: 'Réponse illisible', texte: 'Réessaie dans un instant.' };
    }
    if (rep.ok && rep.verifie && rep.code) {
      return {
        etat: 'ok', titre: 'Paiement vérifié ✓', code: rep.code, livre: rep.livre,
        texte: rep.deja_delivre
          ? 'Tu avais déjà récupéré cet accès — voici le même code.'
          : 'Garde ce code : il ouvre ton accès à tout moment.',
      };
    }
    if (rep.ok && rep.en_attente) {
      return {
        etat: 'attente', titre: 'Paiement enregistré, vérification en cours',
        texte: rep.detail || 'Ton accès arrive dès que le paiement est confirmé.',
      };
    }
    if (!httpOk || rep.ok === false) {
      return {
        etat: 'erreur',
        titre: rep.error === 'trop_de_tentatives' ? 'Trop d’essais' : 'Ça n’a pas marché',
        texte: rep.detail || 'Réessaie, ou reviens dans quelques minutes.',
      };
    }
    return { etat: 'erreur', titre: 'Cas imprévu', texte: 'Réessaie dans un instant.' };
  }

  /* Exporté AVANT la sortie ci-dessous : sans ça, la logique pure serait
     intestable hors navigateur (elle ne serait jamais atteinte). */
  var expose = { emailPlausible: emailPlausible, interprete: interprete, API: API };
  if (typeof globalThis !== 'undefined') globalThis.__acces = expose;

  /* ── Branchement navigateur ──────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  var form = document.getElementById('form');
  var methode = document.getElementById('methode');
  var champRef = document.getElementById('champRef');
  var aideEmail = document.getElementById('aideEmail');
  var bouton = document.getElementById('valider');
  var boite = document.getElementById('resultat');
  var produit = document.getElementById('produit');
  var email = document.getElementById('email');

  /* Si on arrive avec un code déjà en poche (?c=…), on l'affiche directement. */
  var params = new URLSearchParams(location.search);
  var codeUrl = (params.get('c') || '').trim().toUpperCase();
  var prodUrl = params.get('p') || '';
  if (prodUrl && produit.querySelector('option[value="' + prodUrl.replace(/"/g, '') + '"]')) produit.value = prodUrl;

  function texte(el, s) { el.textContent = s; }

  function affiche(v) {
    boite.className = v.etat;
    boite.textContent = '';
    var h = document.createElement('h2'); texte(h, v.titre); boite.appendChild(h);
    var p = document.createElement('p'); texte(p, v.texte); boite.appendChild(p);
    if (v.code) {
      var c = document.createElement('code'); c.className = 'code'; texte(c, v.code); boite.appendChild(c);
      if (v.livre) {
        var a = document.createElement('a');
        a.className = 'lien-produit'; a.href = v.livre + '?c=' + encodeURIComponent(v.code);
        a.rel = 'noopener'; texte(a, 'Ouvrir mon accès');
        boite.appendChild(a);
      }
      try { localStorage.setItem('kdmc_acces_code', v.code); } catch (_) { /* navigation privée : pas grave */ }
    }
    boite.hidden = false;
    boite.scrollIntoView({ block: 'nearest' });
  }

  /* Le champ « référence » n'a de sens que pour un virement. */
  function majMethode() {
    var m = methode.value;
    champRef.hidden = (m !== 'virement');
    texte(aideEmail, m === 'paypal'
      ? 'Exactement celle du compte PayPal qui a payé — c’est elle qu’on cherche.'
      : 'Pour être recontacté et recevoir ton accès.');
  }
  methode.addEventListener('change', majMethode);
  majMethode();

  if (codeUrl) {
    fetch(API + '/acces?c=' + encodeURIComponent(codeUrl))
      .then(function (r) { return r.json().then(function (j) { return { j: j, ok: r.ok }; }); })
      .then(function (x) {
        affiche(x.ok && x.j.ok
          ? { etat: 'ok', titre: 'Accès valide ✓', code: codeUrl, livre: x.j.livre, texte: x.j.nom }
          : { etat: 'erreur', titre: 'Code non reconnu', texte: (x.j && x.j.detail) || 'Vérifie le code.' });
      })
      .catch(function (e) { affiche({ etat: 'erreur', titre: 'Pas de réseau', texte: String(e.message || e) }); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!emailPlausible(email.value)) {
      affiche({ etat: 'erreur', titre: 'Adresse incomplète', texte: 'Il manque quelque chose dans l’adresse e-mail.' });
      email.focus();
      return;
    }
    bouton.disabled = true;
    var ancien = bouton.textContent;
    texte(bouton, 'Vérification…');

    fetch(API + '/reclamer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        produit: produit.value,
        methode: methode.value,
        email: email.value.trim(),
        reference: (document.getElementById('reference') || {}).value || '',
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { j: j, ok: r.ok }; }); })
      .then(function (x) { affiche(interprete(x.j, x.ok)); })
      .catch(function (e) {
        affiche({ etat: 'erreur', titre: 'Pas de réseau', texte: 'Ton paiement n’est pas perdu. Réessaie : ' + String(e.message || e) });
      })
      .finally(function () { bouton.disabled = false; texte(bouton, ancien); });
  });

})();
