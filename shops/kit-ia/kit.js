/* kit.js — Kit IA de l'indépendant : page de vente (récupérer son accès) et lecteur.
   Aucune décision n'est prise ici : le contenu payant est SERVI par le worker
   contre un code valide. Un verrou dans un fichier public ne protège rien.
   Logique pure exportée AVANT le branchement navigateur (testable hors navigateur). */
(function () {
  'use strict';

  var API = 'https://kdmc-vente.9r4rxssx64.workers.dev';
  var PRODUIT = 'kit-ia';
  /* Lecteur partagé par tous les kits (fabrique de produits, 17.09) : le produit
     vient de ?produit=<id> (lettres et tirets seulement, sinon on reste sur le kit). */
  function produitDepuisUrl(search, dataProduit) {
    var m = /[?&]produit=([a-z][a-z-]{1,40})(?:&|$)/.exec(String(search || ''));
    if (m) return m[1];
    return /^[a-z][a-z-]{1,40}$/.test(String(dataProduit || '')) ? String(dataProduit) : PRODUIT;
  }
  var PRODUIT_LU = (typeof location !== 'undefined' && typeof document !== 'undefined')
    ? produitDepuisUrl(location.search, document.body && document.body.getAttribute('data-produit')) : PRODUIT;
  function lienLecteur(code) {
    return 'lire.html?' + (PRODUIT_LU !== PRODUIT ? 'produit=' + encodeURIComponent(PRODUIT_LU) + '&' : '') + 'c=' + encodeURIComponent(code);
  }
  var CLE_CODE = (PRODUIT_LU === PRODUIT ? 'kit_ia' : 'kit_' + PRODUIT_LU.replace(/-/g, '_')) + '_code';   /* localStorage scopé au produit (règle d'isolation) */
  var CLE_REF = 'kdmc_kit_ref';   /* la référence du dernier panier ouvert : elle doit survivre à l'aller-retour vers PayPal */

  /* ── Logique pure ───────────────────────────────────────────────────── */
  function emailPlausible(v) {
    return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(v || '').trim());
  }
  function normaliseCode(v) {
    var s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length !== 16) return '';
    return s.replace(/(.{4})(?=.)/g, '$1-');
  }
  /* Réponse de /reclamer → quoi afficher. Trois états : ok / attente / erreur. */
  function interprete(rep, httpOk) {
    if (!rep || typeof rep !== 'object') return { etat: 'erreur', titre: 'Réponse illisible', texte: 'Réessaie dans un instant.' };
    if (rep.ok && rep.verifie && rep.code) {
      return { etat: 'ok', titre: 'Paiement vérifié', code: rep.code, livre: rep.livre,
        texte: (rep.deja_delivre ? 'Tu avais déjà récupéré cet accès : voici le même code. ' : 'Garde ce code : il ouvre ton accès à tout moment, sur tous tes appareils. ')
          + (rep.email_envoye ? 'Il t’a aussi été envoyé par e-mail.' : 'Note-le : il n’a pas pu partir par e-mail.') };
    }
    if (rep.ok && rep.en_attente) {
      return { etat: 'attente', titre: 'Paiement enregistré, vérification en cours', texte: rep.detail || 'Ton accès arrive dès que le paiement est confirmé.' };
    }
    if (!httpOk || rep.ok === false) {
      return { etat: 'erreur', titre: rep.error === 'trop_de_tentatives' ? 'Trop d’essais' : 'Ça n’a pas marché', texte: rep.detail || 'Réessaie, ou reviens dans quelques minutes.' };
    }
    return { etat: 'erreur', titre: 'Cas imprévu', texte: 'Réessaie dans un instant.' };
  }
  /* Réponse de /lire ou /apercu → état du lecteur. */
  function interpreteLecture(rep, httpOk, avecCode) {
    if (!rep || typeof rep !== 'object') return { etat: 'erreur', texte: 'Réponse illisible.' };
    if (rep.ok && Array.isArray(rep.modules)) {
      return { etat: avecCode ? 'complet' : 'apercu', modules: rep.modules, sommaire: rep.sommaire || [] };
    }
    if (rep.error === 'invalide') return { etat: 'code_invalide', texte: rep.detail || 'Code inconnu.' };
    if (rep.error === 'contenu_indisponible') return { etat: 'erreur', texte: 'Le contenu n’est pas disponible pour le moment. Ton code reste valable.' };
    return { etat: 'erreur', texte: (rep && rep.detail) || (httpOk ? 'Cas imprévu.' : 'Le serveur ne répond pas.') };
  }

  /* Consignes du Club les plus récentes d'abord (ordre décroissant), n au plus. */
  function clubRecentes(sommaire, n) {
    return (sommaire || []).filter(function (s) { return s && s.source === 'club-ia' && s.titre; })
      .sort(function (a, b) { return (Number(b.ordre) || 0) - (Number(a.ordre) || 0); }).slice(0, n);
  }
  /* 's2026-38' → '38 de 2026' ; autre forme → '' (jamais un identifiant brut à l'écran). */
  function clubSemaineLisible(id) {
    var m = /^s(\d{4})-(\d{2})$/.exec(String(id || ''));
    return m ? String(Number(m[2])) + ' de ' + m[1] : '';
  }

  var expose = { emailPlausible: emailPlausible, normaliseCode: normaliseCode, interprete: interprete, interpreteLecture: interpreteLecture, clubRecentes: clubRecentes, clubSemaineLisible: clubSemaineLisible, produitDepuisUrl: produitDepuisUrl, lienLecteur: lienLecteur, API: API, PRODUIT: PRODUIT };
  if (typeof globalThis !== 'undefined') globalThis.__kit = expose;

  /* ── Navigateur ─────────────────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function texte(el, s) { el.textContent = s; }
  function lireStock() { try { return localStorage.getItem(CLE_CODE) || ''; } catch (_) { return ''; } }
  function ecrisRef(r) { try { localStorage.setItem(CLE_REF, r); } catch (_) { /* navigation privée */ } }
  function lisRef() { try { return localStorage.getItem(CLE_REF) || ''; } catch (_) { return ''; } }
  function ecrireStock(c) { try { localStorage.setItem(CLE_CODE, c); } catch (_) { /* navigation privée */ } }
  function fetchJson(url) {
    return fetch(url).then(function (r) { return r.json().then(function (j) { return { j: j, ok: r.ok }; }); });
  }

  function afficheResultat(boite, v) {
    boite.className = v.etat;
    boite.textContent = '';
    var h = document.createElement('h2'); texte(h, v.titre || ''); boite.appendChild(h);
    var p = document.createElement('p'); texte(p, v.texte || ''); boite.appendChild(p);
    if (v.code) {
      var c = document.createElement('code'); c.className = 'code'; texte(c, v.code); boite.appendChild(c);
      var a = document.createElement('a'); a.className = 'btn btn-primaire';
      a.href = lienLecteur(v.code); texte(a, 'Ouvrir mon kit'); boite.appendChild(a);
      ecrireStock(v.code);
    }
    boite.hidden = false;
    boite.scrollIntoView({ block: 'nearest' });
  }

  /* ── Page de vente : récupérer son accès ────────────────────────────── */
  var form = $('form');
  if (form) {
    var methode = $('methode'), champRef = $('champRef'), aideEmail = $('aideEmail'), bouton = $('valider'), email = $('email'), boite = $('resultat');
    function majMethode() {
      champRef.hidden = (methode.value !== 'virement');
      texte(aideEmail, methode.value === 'paypal' ? 'Exactement celle du compte PayPal qui a payé : c’est elle qu’on cherche.' : 'Pour recevoir ton code d’accès.');
    }
    /* De retour de PayPal : sa référence est déjà écrite pour lui. Il ne doit
       ni la retenir ni la retaper. */
    var refPanier = $('refPanier');
    if (refPanier && !refPanier.value) refPanier.value = lisRef();
    methode.addEventListener('change', majMethode); majMethode();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!emailPlausible(email.value)) { afficheResultat(boite, { etat: 'erreur', titre: 'Adresse incomplète', texte: 'Il manque quelque chose dans l’adresse e-mail.' }); email.focus(); return; }
      bouton.disabled = true; var ancien = bouton.textContent; texte(bouton, 'Vérification…');
      fetch(API + '/reclamer', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ produit: ($('produit') && $('produit').value) || PRODUIT, methode: methode.value, email: email.value.trim(), ref: ($('refPanier') && $('refPanier').value.trim()) || '', reference: ($('reference') || {}).value || '' }) })
        .then(function (r) { return r.json().then(function (j) { return { j: j, ok: r.ok }; }); })
        .then(function (x) { afficheResultat(boite, interprete(x.j, x.ok)); })
        .catch(function (e) { afficheResultat(boite, { etat: 'erreur', titre: 'Pas de réseau', texte: 'Ton paiement n’est pas perdu. Réessaie : ' + String(e.message || e) }); })
        .finally(function () { bouton.disabled = false; texte(bouton, ancien); });
    });
  }

  /* ── CAISSE — le bouton « Payer » (Kevin 2026-09-18) ─────────────────────
     Kevin garde son PayPal PERSONNEL (« Pour l'instant utilise mon PayPal comme
     ça. perso ») : il n'y a donc pas de capture automatique, et le lien
     paypal.me est le chemin RÉEL, pas un repli de secours.
     AVANT : ce lien s'ouvrait dans un autre onglet et tout se perdait — on ne
     savait pas qui avait voulu acheter, ni quoi ; l'acheteur n'avait rien à
     citer ; Kevin voyait un montant sans nom.
     MAINTENANT, dans l'ordre : (1) e-mail + consentement ; (2) on essaie la
     vraie caisse, si un jour les clés existent (redirection PayPal, capture,
     livraison immédiate) ; (3) sinon on ENREGISTRE le panier (/caisse/intention,
     aucune clé requise), on affiche la référence à recopier dans le message
     PayPal, on ouvre PayPal, et on laisse sous la main le bouton « J'ai payé ».
     Rien n'est perdu à aucune étape : même sans retour, Kevin a l'e-mail, le
     produit, le montant et le consentement horodaté. */

  /* Affiche la référence et le bouton « J'ai payé » DANS le bloc du produit :
     l'acheteur n'a rien à chercher, rien à retenir. */
  /* Une ligne « Machin : valeur » avec un bouton Copier : sur un t\u00e9l\u00e9phone,
     recopier un IBAN \u00e0 la main est le meilleur moyen de se tromper. */
  function ligneCopiable(parent, etiquette, valeur) {
    var l = document.createElement('p'); l.className = 'petit';
    var st = document.createElement('strong'); texte(st, etiquette + ' '); l.appendChild(st);
    var c = document.createElement('code'); texte(c, valeur); l.appendChild(c);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'copier'; texte(b, 'Copier');
    b.addEventListener('click', function () {
      var fini = function () { texte(b, 'Copi\u00e9 !'); setTimeout(function () { texte(b, 'Copier'); }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(valeur).then(fini, fini); else fini();
    });
    l.appendChild(b); parent.appendChild(l);
  }

  /* Affiche la r\u00e9f\u00e9rence et le bouton \u00ab J'ai pay\u00e9 \u00bb DANS le bloc du produit :
     l'acheteur n'a rien \u00e0 chercher, rien \u00e0 retenir. Trois moyens, un seul chemin. */
  function montrePanier(avis, d, produit, mail) {
    avis.textContent = ''; avis.hidden = false;
    var virement = d.moyen === 'virement';
    var p1 = document.createElement('p');
    texte(p1, virement
      ? 'Fais le virement avec ces coordonn\u00e9es. Le libell\u00e9 est obligatoire : c\'est lui qui relie ton paiement \u00e0 ton acc\u00e8s.'
      : 'Ta r\u00e9f\u00e9rence \u2014 recopie-la dans le message ' + (d.moyen === 'revolut' ? 'Revolut' : 'PayPal') + ', c\'est elle qui relie ton paiement \u00e0 ton acc\u00e8s :');
    avis.appendChild(p1);
    if (virement) {
      ligneCopiable(avis, 'IBAN', d.iban);
      if (d.bic) ligneCopiable(avis, 'BIC', d.bic);
      if (d.titulaire) ligneCopiable(avis, 'Titulaire', d.titulaire);
      ligneCopiable(avis, 'Montant', d.montant + ' ' + (d.devise || 'EUR'));
      ligneCopiable(avis, 'Libell\u00e9', d.ref);
    } else {
      var c = document.createElement('code'); c.className = 'code'; texte(c, d.ref); avis.appendChild(c);
    }
    var p2 = document.createElement('p');
    texte(p2, virement
      ? 'Un virement met 1 \u00e0 2 jours ouvr\u00e9s \u00e0 arriver. D\u00e8s qu\'il est l\u00e0, ton acc\u00e8s part par e-mail \u00e0 ' + mail + '. Touche le bouton ci-dessous pour nous pr\u00e9venir.'
      : (d.moyen === 'revolut' ? 'Revolut' : 'PayPal') + ' s\'ouvre dans un autre onglet. Une fois pay\u00e9, reviens ici et touche le bouton ci-dessous : ton acc\u00e8s part par e-mail \u00e0 ' + mail + '.');
    avis.appendChild(p2);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-primaire'; texte(b, virement ? 'J\'ai fait le virement' : 'J\'ai pay\u00e9');
    b.addEventListener('click', function () {
      b.disabled = true; texte(b, 'On enregistre\u2026');
      fetch(API + '/reclamer', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref: d.ref, produit: produit, methode: d.moyen, email: mail }) })
        .then(function (r) { return r.json().then(function (j) { return { j: j, ok: r.ok }; }); })
        .then(function (x) {
          var v = interprete(x.j, x.ok);
          var res = $('resultat');
          if (res) afficheResultat(res, v);
          else { avis.textContent = ''; var q = document.createElement('p'); texte(q, v.titre + ' \u2014 ' + v.texte); avis.appendChild(q); }
        })
        .catch(function (e) { texte(b, 'R\u00e9essaie : ' + String((e && e.message) || e)); b.disabled = false; });
    });
    avis.appendChild(b);
  }

  function ouvrePanier(btn, produit, moyen, mail, avis) {
    return fetch(API + '/caisse/intention', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ produit: produit, email: mail, moyen: moyen, consentement: true }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.ref) return false;
        ecrisRef(d.ref);
        montrePanier(avis, d, produit, mail);
        /* Le virement n'ouvre AUCUN onglet : tout ce qu'il faut est \u00e0 l'\u00e9cran.
           Le lien vient du serveur (montant pris dans NOTRE catalogue) ;
           data-secours n'est qu'un dernier filet si le worker est muet. */
        if (d.moyen !== 'virement') window.open(d.lien || btn.getAttribute('data-secours'), '_blank', 'noopener');
        return true;
      })
      .catch(function () { return false; });
  }

  function ouvreCaisse(btn) {
    var produit = btn.getAttribute('data-produit');
    var moyen = btn.getAttribute('data-moyen') || 'paypal';
    var bloc = btn.closest ? btn.closest('.encart, .carte') : null;
    var champ = bloc && bloc.querySelector('[data-caisse-email]');
    var coche = bloc && bloc.querySelector('[data-caisse-consentement]');
    var avis = bloc && bloc.querySelector('[data-caisse-avis]');
    var dis = function (t) { if (avis) { texte(avis, t); avis.hidden = !t; } };
    if (!champ || !emailPlausible(champ.value)) { dis('Mets d\u2019abord ton adresse e-mail : c\u2019est l\u00e0 qu\u2019arrive ton acc\u00e8s.'); if (champ) champ.focus(); return; }
    if (!coche || !coche.checked) { dis('Coche la case au-dessus pour qu\u2019on t\u2019ouvre l\u2019acc\u00e8s tout de suite.'); return; }
    var mail = champ.value.trim();
    var ancien = btn.textContent; btn.disabled = true; texte(btn, 'On pr\u00e9pare le paiement\u2026'); dis('');
    var fini = function () { btn.disabled = false; texte(btn, ancien); };
    var replit = function () {
      /* Dernier filet : le worker ne r\u00e9pond pas du tout. On ouvre quand m\u00eame
         le lien \u2014 on ne laisse jamais un acheteur devant un mur \u2014 et on le dit
         franchement. Sans panier, il devra passer par \u00ab J'ai pay\u00e9 \u00bb. */
      var secours = btn.getAttribute('data-secours');
      if (secours) { window.open(secours, '_blank', 'noopener'); dis('On t\u2019a ouvert le paiement. Notre serveur n\u2019a pas r\u00e9pondu : apr\u00e8s avoir pay\u00e9, redescends sur \u00ab J\u2019ai pay\u00e9, je r\u00e9cup\u00e8re mon acc\u00e8s \u00bb.'); }
      else dis('La caisse ne r\u00e9pond pas. Reviens dans un instant, ou prends un autre moyen de paiement.');
    };
    var viaPanier = function () { return ouvrePanier(btn, produit, moyen, mail, avis).then(function (ok) { if (!ok) replit(); fini(); }); };
    /* La vraie caisse PayPal (capture automatique) n'existe que pour PayPal, et
       seulement si les cl\u00e9s sont pos\u00e9es un jour. Revolut et virement passent
       directement par le panier. */
    if (moyen !== 'paypal') { viaPanier(); return; }
    fetch(API + '/caisse/commande', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ produit: produit, email: mail, consentement: true }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.approbation) { location.href = d.approbation; return; }
        return viaPanier();
      })
      .catch(viaPanier);
  }

  /* Le virement ne s'affiche QUE si l'IBAN est rang\u00e9 c\u00f4t\u00e9 serveur : un bouton
     qui m\u00e8ne \u00e0 \u00ab pas encore ouvert \u00bb est pire que pas de bouton. */
  var boutonsVirement = document.querySelectorAll('[data-moyen-virement]');
  if (boutonsVirement.length) {
    fetch(API + '/health').then(function (r) { return r.json(); }).then(function (h) {
      if (h && h.moyens && h.moyens.indexOf('virement') >= 0) {
        Array.prototype.forEach.call(boutonsVirement, function (el) { el.hidden = false; });
      }
    }).catch(function () { /* muet : on laisse les deux autres moyens */ });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-produit][data-caisse]'), function (btn) {
    btn.addEventListener('click', function (ev) { ev.preventDefault(); ouvreCaisse(btn); });
  });

  /* ── Page de vente : ce qui est déjà publié au Club (preuve de fraîcheur) ─
     /apercu ne sert que le module gratuit, mais son SOMMAIRE liste tout, dont
     les consignes hebdomadaires (source === 'club-ia'). On montre les 3 plus
     récentes, titres seulement. Caché tant que rien n'est chargé : une panne
     ou une base vide ne laisse pas de bloc vide. */
  var clubSemaine = $('clubSemaine');
  if (clubSemaine && form) {
    fetchJson(API + '/apercu?produit=club-ia').then(function (x) {
      var r = interpreteLecture(x.j, x.ok, false);
      var hebdo = (r.sommaire || []).filter(function (s) { return s.source === 'club-ia'; });
      var recentes = clubRecentes(hebdo, 3);
      if (!recentes.length) return;
      var ul = $('clubListe'); ul.textContent = '';
      recentes.forEach(function (s) {
        var li = document.createElement('li'), st = document.createElement('strong');
        texte(st, s.titre); li.appendChild(st);
        li.appendChild(document.createTextNode('Consigne-outil de la semaine ' + clubSemaineLisible(s.id) + '.'));
        ul.appendChild(li);
      });
      clubSemaine.hidden = false;
    }).catch(function () { /* silencieux : la carte Club se suffit à elle-même */ });
  }

  /* ── Lecteur ────────────────────────────────────────────────────────── */
  var sommaireEl = $('sommaire');
  if (sommaireEl) {
    var moduleEl = $('module'), etat = $('etat'), titre = $('titre'), verrou = $('verrou'), navM = $('navModules'), boiteCode = $('boiteCode'), res = $('resultat');
    var modules = [], sommaire = [], courant = 0, complet = false;

    function boutonsCopier(racine) {
      racine.querySelectorAll('pre.consigne').forEach(function (pre) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'copier'; texte(b, 'Copier');
        b.addEventListener('click', function () {
          var t = pre.textContent.replace(/^Copier\s*/, '').replace(/^Copié !\s*/, '');
          var fini = function () { texte(b, 'Copié !'); setTimeout(function () { texte(b, 'Copier'); }, 1500); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(fini, fini); else fini();
        });
        pre.insertBefore(b, pre.firstChild);
      });
    }
    function rendSommaire() {
      sommaireEl.textContent = '';
      sommaire.forEach(function (s, i) {
        var li = document.createElement('li'), a = document.createElement('a');
        a.href = '#m' + s.ordre; texte(a, s.ordre + '. ' + s.titre);
        var ouvert = complet || s.gratuit;
        if (!ouvert) { var v = document.createElement('span'); v.className = 'verrou'; texte(v, 'kit complet'); a.appendChild(v); }
        if (i === courant) a.className = 'actif';
        a.addEventListener('click', function (ev) { ev.preventDefault(); va(i); });
        li.appendChild(a); sommaireEl.appendChild(li);
      });
    }
    function va(i) {
      courant = Math.max(0, Math.min(i, sommaire.length - 1));
      var s = sommaire[courant];
      var m = modules.filter(function (x) { return x.id === s.id; })[0];
      moduleEl.textContent = '';
      if (m) {
        /* HTML rédigé par nous et servi par notre worker — jamais une saisie d'un client. */
        moduleEl.innerHTML = m.html;
        boutonsCopier(moduleEl);
        verrou.hidden = true;
      } else {
        var h = document.createElement('h2'); texte(h, s.ordre + '. ' + s.titre); moduleEl.appendChild(h);
        verrou.hidden = false;
      }
      navM.hidden = sommaire.length < 2;
      $('precedent').disabled = courant === 0;
      $('suivant').disabled = courant === sommaire.length - 1;
      rendSommaire();
      window.scrollTo({ top: moduleEl.offsetTop - 16, behavior: 'smooth' });
    }
    $('precedent').addEventListener('click', function () { va(courant - 1); });
    $('suivant').addEventListener('click', function () { va(courant + 1); });

    function charge(code) {
      texte(etat, code ? 'Ouverture de ton kit…' : 'Chargement du module gratuit…');
      var url = code ? API + '/lire?c=' + encodeURIComponent(code) : API + '/apercu?produit=' + PRODUIT_LU;
      return fetchJson(url).then(function (x) {
        var r = interpreteLecture(x.j, x.ok, !!code);
        if (r.etat === 'complet' || r.etat === 'apercu') {
          modules = r.modules; sommaire = r.sommaire; complet = (r.etat === 'complet');
          texte(titre, complet ? 'Ton kit complet' : 'Module 1 — gratuit');
          if (!complet && x.j && x.j.nom && $('sur')) { var lienSur = $('sur').querySelector('a'); if (lienSur) texte(lienSur, String(x.j.nom).split(' — ')[0]); }
          texte(etat, complet ? sommaire.length + ' modules ouverts. Chaque consigne se copie en un geste.' : 'Le reste s’ouvre avec ton code d’accès.');
          if (complet) { ecrireStock(code); boiteCode.hidden = true; }
          va(0);
          return true;
        }
        if (r.etat === 'code_invalide') {
          afficheResultat(res, { etat: 'erreur', titre: 'Code non reconnu', texte: r.texte + ' Vérifie les 16 caractères (pas de 0, O, 1, I, L).' });
          return charge('');
        }
        texte(etat, r.texte);
        return false;
      }).catch(function (e) { texte(etat, 'Pas de réseau : ' + String(e.message || e)); return false; });
    }

    $('formCode').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var c = normaliseCode($('codeAcces').value);
      if (!c) { afficheResultat(res, { etat: 'erreur', titre: 'Code incomplet', texte: 'Un code fait 16 caractères, par groupes de 4.' }); return; }
      res.hidden = true;
      charge(c);
    });

    var params = new URLSearchParams(location.search);
    var codeInitial = normaliseCode(params.get('c') || '') || normaliseCode(lireStock());
    if (codeInitial) $('codeAcces').value = codeInitial;
    charge(codeInitial);
  }
})();
