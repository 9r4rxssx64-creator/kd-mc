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

  /* Confirmation par WhatsApp : 6 cases. Un collage ou une saisie rapide répartit
     les chiffres ; tout ce qui n'est pas un chiffre est ignoré. */
  function repartitCode(texte) {
    return String(texte || '').replace(/\D/g, '').slice(0, 6).split('');
  }
  /* « 9:58 » à partir d'une échéance — la page AFFICHE le temps, le worker le fait respecter. */
  function minuteur(fin, maintenant) {
    var s = Math.max(0, Math.ceil((fin - maintenant) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  /* Traduit la réponse du worker à /tel/verifie. La page ne juge JAMAIS le code. */
  function interpreteTel(rep) {
    if (!rep || typeof rep !== 'object') return { etat: 'erreur', texte: 'Réponse illisible. Réessaie.' };
    if (rep.ok) return { etat: 'ok', texte: 'Identité confirmée ✓ ' + (rep.tel_masque || '') };
    if (rep.error === 'code_faux') {
      return { etat: 'faux', essais: rep.essais_restants,
        texte: 'Code incorrect. ' + rep.essais_restants + ' essai' + (rep.essais_restants > 1 ? 's' : '') + ' restant' + (rep.essais_restants > 1 ? 's' : '') + '.' };
    }
    if (rep.error === 'trop_essais' || rep.error === 'expire') return { etat: 'fin', essais: 0, texte: rep.detail || 'Demande un nouveau code.' };
    return { etat: 'erreur', texte: rep.detail || 'Ça n’a pas marché. Réessaie.' };
  }

  /* Exporté AVANT la sortie ci-dessous : sans ça, la logique pure serait
     intestable hors navigateur (elle ne serait jamais atteinte). */
  var expose = { emailPlausible: emailPlausible, interprete: interprete, API: API,
                 repartitCode: repartitCode, minuteur: minuteur, interpreteTel: interpreteTel };
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
      proposeTel(v.code);
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

  /* ── Confirmation d'identité par WhatsApp (gratuit) ───────────────────── */
  var tel = document.getElementById('tel');
  var telEtape1 = document.getElementById('telEtape1');
  var telEtape2 = document.getElementById('telEtape2');
  var telDemander = document.getElementById('telDemander');
  var telOuvrir = document.getElementById('telOuvrir');
  var telCases = [].slice.call(document.querySelectorAll('.otp input'));
  var telValider = document.getElementById('telValider');
  var telRenvoyer = document.getElementById('telRenvoyer');
  var telMinuteur = document.getElementById('telMinuteur');
  var telEssais = document.getElementById('telEssais');
  var telMessage = document.getElementById('telMessage');
  var telEtat = { code: '', demande: '', jeton: '', fin: 0, horloge: null, ecoute: null };

  function telDit(t, classe) { texte(telMessage, t); telMessage.className = classe || ''; }
  function telVide() { telCases.forEach(function (c) { c.value = ''; }); telCases[0].focus(); }
  function telSaisi() { return telCases.map(function (c) { return c.value; }).join(''); }

  function proposeTel(code) {
    telEtat.code = code;
    fetch(API + '/acces?c=' + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) return;
        tel.hidden = false;
        if (j.tel_confirme) { telEtape1.hidden = true; telEtape2.hidden = true; telDit('Identité confirmée ✓ ' + (j.tel_masque || ''), 'ok'); return; }
        if (!j.whatsapp_confirmation) { tel.hidden = true; return; }   /* pas encore branché : on ne propose pas ce qui ne marche pas */
        telEtape1.hidden = false; telEtape2.hidden = true; telDit('');
      })
      .catch(function () { /* hors ligne : on ne propose rien, l'accès marche quand même */ });
  }

  function telHorloge() {
    clearInterval(telEtat.horloge);
    telEtat.horloge = setInterval(function () {
      var reste = telEtat.fin - Date.now();
      texte(telMinuteur, reste > 0 ? 'Code valable encore ' + minuteur(telEtat.fin, Date.now()) : 'Code expiré');
      if (reste <= 0) { clearInterval(telEtat.horloge); telValider.disabled = true; telRenvoyer.hidden = false; }
    }, 1000);
  }

  telDemander.addEventListener('click', function () {
    telDemander.disabled = true;
    fetch(API + '/tel/demande', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: telEtat.code }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok && j.error === 'deja_lie') { telEtape1.hidden = true; telDit('Identité déjà confirmée ✓ ' + (j.tel_masque || ''), 'ok'); return; }
        if (!j.ok) { telDit(j.detail || 'Ça n’a pas marché.', 'erreur'); return; }
        telEtat.demande = j.demande; telEtat.jeton = j.jeton || '';
        telEcouter();
        telEtat.fin = Date.now() + j.validite_s * 1000;
        telOuvrir.href = j.lien;
        telEtape1.hidden = true; telEtape2.hidden = false; telRenvoyer.hidden = true; telValider.disabled = false;
        texte(telEssais, j.essais + ' essais');
        texte(telMinuteur, 'Code valable encore ' + minuteur(telEtat.fin, Date.now()));
        telDit('');
        telHorloge();
      })
      .catch(function (e) { telDit('Pas de réseau : ' + String(e.message || e), 'erreur'); })
      .finally(function () { telDemander.disabled = false; });
  });

  telCases.forEach(function (c, i) {
    c.addEventListener('input', function () {
      var chiffres = repartitCode(c.value);
      if (chiffres.length > 1) {                 /* collage, ou remplissage automatique iOS */
        /* 6 chiffres = le code entier, depuis la 1re case, où qu'on ait collé (relecture 9.10 : collé en case 3,
           « 123456 » devenait « 121234 ») ; moins de 6 = à partir de la case touchée. */
        var depart = chiffres.length >= 6 ? 0 : i;
        chiffres.forEach(function (d, k) { if (telCases[depart + k]) telCases[depart + k].value = d; });
      } else c.value = chiffres[0] || '';
      var suivante = telCases.filter(function (x) { return !x.value; })[0];
      if (suivante && c.value) suivante.focus();
      if (telSaisi().length === 6) telValide();
    });
    c.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !c.value && i > 0) { telCases[i - 1].value = ''; telCases[i - 1].focus(); }
    });
  });

  /* VALIDATION AUTOMATIQUE (Kevin 10.10) : la page demande au worker, toutes les 4 s, si le message WhatsApp est arrivé.
     Dès qu'il l'est, c'est confirmé — sans rien taper. Le code reste un secours. */
  function telArreter() { clearInterval(telEtat.ecoute); telEtat.ecoute = null; }
  function telEcouter() {
    telArreter();
    if (!telEtat.jeton) return;
    var enCours = false;
    telEtat.ecoute = setInterval(function () {
      if (enCours || document.hidden) return;
      if (Date.now() > telEtat.fin) { telArreter(); return; }
      enCours = true;
      fetch(API + '/tel/statut', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r: telEtat.demande, jeton: telEtat.jeton }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && j.confirme) { telArreter(); clearInterval(telEtat.horloge); telEtape2.hidden = true; telDit('Identité confirmée ✓ ' + (j.tel_masque || ''), 'ok'); return; }
          if (j && j.error === 'deja_lie') { telArreter(); telEtape2.hidden = true; telDit('Identité déjà confirmée ✓ ' + (j.tel_masque || ''), 'ok'); return; }
          if (j && j.ok && j.encore === false) telArreter();
        })
        .catch(function () { /* réseau : prochain tour */ })
        .then(function () { enCours = false; });
    }, 4000);
  }

  function telValide() {
    var code6 = telSaisi();
    if (code6.length !== 6 || telValider.disabled) return;
    telValider.disabled = true;
    fetch(API + '/tel/verifie', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r: telEtat.demande, code: code6 }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var v = interpreteTel(j);
        telDit(v.texte, v.etat === 'ok' ? 'ok' : 'erreur');
        if (v.etat === 'ok') { telArreter(); clearInterval(telEtat.horloge); telEtape2.hidden = true; return; }
        if (typeof v.essais === 'number') texte(telEssais, v.essais + ' essai' + (v.essais > 1 ? 's' : ''));
        if (v.etat === 'fin') { clearInterval(telEtat.horloge); telRenvoyer.hidden = false; return; }
        telValider.disabled = false; telVide();
      })
      .catch(function (e) { telValider.disabled = false; telDit('Pas de réseau : ' + String(e.message || e), 'erreur'); });
  }
  telValider.addEventListener('click', telValide);
  telRenvoyer.addEventListener('click', function () { telVide(); telEtape2.hidden = true; telEtape1.hidden = false; telDemander.click(); });

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
