/* 📬 LA BOÎTE UNIQUE — vue admin du portail (Kevin 3.10.2026 : « tous les messages de n'importe quelle app du domaine sur ma
   vue admin, un visuel permanent, ne rien rater, je peux répondre directement par là, j'ai toutes les infos »).
   Rien n'est affiché sans la session admin PROUVÉE par le domaine : la page ne décide de rien, elle lit /__boite/admin
   (401 sinon → bandeau caché). Tout le texte reçu passe par textContent (jamais innerHTML : ce sont des messages de tiers). */
(function () {
  'use strict';
  var URL_BOITE = '/__boite/admin', PAS_BANDEAU = 30000, PAS_OUVERT = 12000;   /* quasi temps réel : relu aussi au retour sur l'onglet et dès qu'une notification ouvre #messages */
  var CLE_CACHE = 'kdmc_boite_cpts', CACHE_MAX = 864e5;
  var C = null;   /* le DERNIER RELEVÉ en nombres (jamais un nom ni un message), dessiné par le bandeau en attendant la vraie lecture */
  var D = null, filtre = 'tous', ouvert = '', timer = null, ouverte = false, enCours = false, HIST = {}, REV = {}, ECOUTE = [];
  /* 17.10 (Kevin : « je veux atterrir directement pour répondre ») : `conv` = la conversation ouverte plein écran ('' = la liste) ;
     `atterrir` = à l'ouverture (notification, bandeau), on saute direct sur le message non lu le plus récent auquel on peut répondre ;
     DRAFT = la réponse en cours d'écriture, gardée par conversation ; ENVOYE = « ✅ Envoyé » + message suivant après un envoi. */
  var conv = '', atterrir = false, cibleCle = '', DRAFT = {}, ENVOYE = {}, BAS = false;
  var RAPIDES = ['👍 Bien reçu, merci', '🔎 Je regarde et je reviens', '✅ C\'est réglé', '❓ Plus de détails ?'];

  function entetes(json) {
    var h = {}; try { var t = window.kdmcSSO && window.kdmcSSO.token && window.kdmcSSO.token(); if (t) h.authorization = 'Bearer ' + t; } catch (e) { /* */ }
    if (json) h['content-type'] = 'application/json';
    return h;
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function quand(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    var j = Math.floor(s / 86400); if (j < 7) return 'il y a ' + j + ' j';
    var d = new Date(ts); return d.getDate() + '/' + (d.getMonth() + 1);
  }
  /* Le dernier relevé : des NOMBRES seulement, en try/catch partout (mode privé, stockage plein). Lu et dessiné SEULEMENT après que le domaine
     a dit « admin » (demarrer() n'est appelée que pour la session admin) ; effacé dès que la session n'est plus admin (oublier). */
  function nb(x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x < 1e6 ? Math.floor(x) : null; }
  function releveDe(j) {
    return { ts: Date.now(), nonLus: nb(j.nonLus) || 0, nonLusAlertes: nb(j.nonLusAlertes) || 0, connectes: nb(j.connectes) || 0,
      ni: (j.inscriptions || []).length + (j.codes || []).length + (j.inscriptionsAdmin || []).length };
  }
  function cacheLire() {
    try {
      var j = JSON.parse(localStorage.getItem(CLE_CACHE) || 'null');
      if (!j || typeof j.ts !== 'number' || !isFinite(j.ts) || Date.now() - j.ts > CACHE_MAX || j.ts > Date.now() + 6e4) return null;
      return { ts: j.ts, nonLus: nb(j.nonLus) || 0, nonLusAlertes: nb(j.nonLusAlertes) || 0, connectes: nb(j.connectes) || 0, ni: nb(j.ni) || 0 };
    } catch (e) { return null; }
  }
  function cacheGarder(o) { try { localStorage.setItem(CLE_CACHE, JSON.stringify(o)); } catch (e) { /* */ } }
  function oublier() { C = null; try { localStorage.removeItem(CLE_CACHE); } catch (e) { /* */ } }
  function lire() {
    /* 8.10 (Kevin : « rafraîchir ne fonctionne pas ») : une lecture qui traîne (Firebase, D1, KV) bloquait `enCours` et chaque ↻ était ignoré
       en silence. Bornée à 15 s : au-delà on rend la main (le prochain ↻ repart). */
    var ctl = null; try { ctl = new AbortController(); setTimeout(function () { ctl.abort(); }, 15000); } catch (e) { ctl = null; }
    return fetch(URL_BOITE, { credentials: 'include', cache: 'no-store', headers: entetes(false), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (r.status === 401 || r.status === 403) oublier(); return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.ok ? j : null; })
      .catch(function () { return null; });
  }
  /* L'EMPREINTE de ce qui s'affiche : si rien n'a changé, on ne redessine PAS (8.10, Kevin : « ça saute ») — redessiner toutes les 12 s
     remettait le défilement en haut et faisait sauter la liste alors que seul « mis à jour il y a … » bougeait. */
  function empreinte(j) {
    if (!j) return '';
    try {
      return JSON.stringify([(j.messages || []).map(function (m) { return [m.cle, m.ts, m.nonLus, m.lu, (m.fil || []).length, m.texte, (m.infos || []).length]; }),
        (j.inscriptions || []).map(function (i) { return [i.id, i.code]; }), (j.codes || []).map(function (c) { return [c.uid, c.ts]; }), (j.inscriptionsAdmin || []).map(function (c) { return [c.uid, c.ts]; }), (j.sources || []).map(function (s) { return [s.id, s.nonLus, s.total, s.etat]; }), (j.enLigne || []).map(function (x) { return [x.nom, x.app]; }), j.nonLus, j.nonLusAlertes, j.inscriptionsEtat]);
    } catch (e) { return String(Date.now()); }
  }
  var dessine = '';   /* l'empreinte du dernier dessin */
  function ecrire(chemin, corps) {
    return fetch('/__boite/admin/' + chemin, { method: 'POST', credentials: 'include', cache: 'no-store', headers: entetes(true), body: JSON.stringify(corps) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'reponse_illisible' }; }); })
      .catch(function () { return { ok: false, reason: 'reseau' }; });
  }

  /* ── le bandeau permanent (toujours en haut, collant) ─────────────────────────────────────────────────── */
  function bandeau() {
    var a = document.getElementById('cercle-alerte'); if (!a) return;
    if (!D && !C) { a.hidden = true; return; }
    /* D = la lecture du domaine ; sinon C = le dernier relevé (nombres), daté, jamais présenté comme neuf */
    var n = D ? D.nonLus || 0 : C.nonLus, ni = D ? (D.inscriptions || []).length + (D.codes || []).length + (D.inscriptionsAdmin || []).length : C.ni;   /* les codes à valider et les inscriptions sans WhatsApp comptent comme une inscription : Kevin doit trancher */
    var nAl = D ? D.nonLusAlertes : C.nonLusAlertes, nCo = D ? D.connectes || 0 : C.connectes;
    a.textContent = '';
    var t = el('span', 'bt', n ? '📬 ' + (n > 1 ? n + ' nouveaux messages' : '1 nouveau message') : ni ? '📬 Rien de nouveau dans les messages' : '📬 Aucun message en attente');
    a.appendChild(t);
    if (n + ni) a.appendChild(el('span', 'n', String(n + ni)));
    /* 7.10 (Kevin : « je dois voir les inscriptions en attente dans le domaine, en dessous des messages ») : comptées dans l'alerte. */
    if (ni) a.appendChild(el('span', 'qui', '📝 ' + ni + ' inscription' + (ni > 1 ? 's' : '') + ' à valider'));
    var qui = D ? (D.sources || []).filter(function (s) { return s.nonLus && s.id !== 'alertes'; }).map(function (s) { return s.icone + ' ' + s.nom.split(' · ')[0] + ' ' + s.nonLus; }) : [];
    if (qui.length) a.appendChild(el('span', 'qui', qui.join(' · ')));
    if (nAl) a.appendChild(el('span', 'qui', '🔔 ' + nAl + ' alerte' + (nAl > 1 ? 's' : '')));
    a.appendChild(el('span', 'qui', '· ' + nCo + ' connecté(s)'));
    var hs = D ? (D.sources || []).filter(function (s) { return s.etat !== 'ok'; }) : [];
    if (hs.length) a.appendChild(el('span', 'qui warn', '⚠️ ' + hs.map(function (s) { return s.nom.split(' · ')[0]; }).join(', ') + ' indisponible'));
    if (!D) a.appendChild(el('span', 'qui', '· dernier relevé ' + quand(C.ts) + ' — mise à jour…'));
    a.className = (n + ni ? '' : 'calme') + (D ? '' : ' perime'); a.hidden = false;
    try { document.title = (D && n + ni ? '(' + (n + ni) + ') ' : '') + document.title.replace(/^\(\d+\)\s*/, ''); } catch (e) { /* */ }
  }

  /* ── la fenêtre ───────────────────────────────────────────────────────────────────────────────────────── */
  function racine() {
    var r = document.getElementById('boite-fen'); if (r) return r;
    r = el('div'); r.id = 'boite-fen'; r.hidden = true; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'Mes messages');
    document.body.appendChild(r); return r;
  }
  function ouvrir(cle) { ouverte = true; atterrir = true; cibleCle = typeof cle === 'string' ? cle : ''; conv = ''; var r = racine(); r.hidden = false; document.documentElement.classList.add('boite-ouverte'); dessiner(); rafraichir(); armer(); }
  function fermer() { ouverte = false; atterrir = false; conv = ''; var r = racine(); r.hidden = true; r.style.height = ''; r.style.top = ''; r.style.bottom = ''; document.documentElement.classList.remove('boite-ouverte'); armer(); }
  function armer() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState === 'visible') rafraichir(); }, ouverte ? PAS_OUVERT : PAS_BANDEAU);
  }
  function rafraichir(manuel) {
    if (enCours) { if (manuel) enCoursManuel = true; return Promise.resolve(); } enCours = true;
    var b = document.querySelector('#boite-fen .bf-r'); if (b && manuel) { b.classList.add('tourne'); b.disabled = true; }
    return lire().then(function (j) {
      enCours = false; var relancer = enCoursManuel; enCoursManuel = false;
      if (j) { D = j; cacheGarder(C = releveDe(j)); bandeau(); ECOUTE.forEach(function (f) { try { f(D); } catch (e) { /* un abonné en panne ne casse pas la boîte */ } }); }
      if (ouverte) {
        /* on ne redessine que si quelque chose a changé (ou sur ↻ : au moins le pied « mis à jour » bouge) */
        var e = empreinte(D);
        if (e !== dessine || manuel) dessiner(true); else { var p = document.querySelector('#boite-fen .bf-pied'); if (p) p.textContent = 'Mis à jour ' + quand(D && D.maj) + ' · se rafraîchit toute seule'; }
        var b2 = document.querySelector('#boite-fen .bf-r'); if (b2) { b2.classList.remove('tourne'); b2.disabled = false; b2.textContent = j ? '↻' : '⚠️ ↻'; }
      }
      if (relancer) return rafraichir(true);
    }).catch(function () { enCours = false; enCoursManuel = false; var b3 = document.querySelector('#boite-fen .bf-r'); if (b3) { b3.classList.remove('tourne'); b3.disabled = false; } });
  }
  var enCoursManuel = false;

  function dessiner(garderSaisie) {
    var r = racine(); if (r.hidden) return;
    /* jamais redessiner sous les doigts de Kevin : s'il écrit une réponse, on attend (le prochain rafraîchissement reprendra) */
    var actif = document.activeElement; if (garderSaisie && actif && actif.tagName === 'TEXTAREA' && r.contains(actif) && actif.value) return;
    var saisie = ''; if (garderSaisie) { var ta0 = r.querySelector('textarea'); if (ta0) saisie = ta0.value; }
    if (D && atterrir) choisirAtterrissage();
    if (conv) {
      var mc = trouver(conv);
      if (mc && mc.repondre === 'direct') { dessinerConv(r, mc, saisie); ajusterClavier(); return; }
      conv = '';   /* la conversation a disparu du domaine : retour à la liste */
    }
    r.removeAttribute('data-conv'); ajusterClavier();
    /* le DÉFILEMENT se garde quel que soit l'élément qui défile (la fenêtre elle-même sur iPhone, la liste ailleurs) */
    var defil = r.querySelector('.bf-liste'); var pos = defil ? defil.scrollTop : 0, posFen = r.scrollTop, posDoc = (document.scrollingElement || document.documentElement).scrollTop;
    r.textContent = '';
    var tete = el('div', 'bf-tete');
    var fer = el('button', 'bf-x', '✕'); fer.type = 'button'; fer.setAttribute('aria-label', 'Fermer'); fer.onclick = fermer;
    tete.appendChild(el('h2', null, '📬 Mes messages'));
    var act = el('button', 'bf-r', '↻'); act.type = 'button'; act.setAttribute('aria-label', 'Actualiser'); act.onclick = function () { rafraichir(true); };
    tete.appendChild(act); tete.appendChild(fer); r.appendChild(tete);
    dessine = empreinte(D);
    if (!D) { r.appendChild(el('p', 'bf-vide', 'Chargement… (si ça dure : ta session admin a peut-être expiré, reconnecte-toi).')); return; }
    /* 14.10 (Kevin « CMCteams et light en même temps, aussi les autres apps du domaine ») : qui est en ligne MAINTENANT, dans quelle app */
    var live = D.enLigne || [];
    if (live.length) {
      var lv = el('div', 'bf-live'); lv.setAttribute('data-enligne', String(live.length));
      lv.appendChild(el('b', null, '🟢 ' + live.length + ' en ligne maintenant'));
      /* 16.10 (Kevin : « toutes infos cliquables ») : un nom en ligne ouvre SA carte (historique, déconnecter, fiche) */
      var lvl = el('div', 'bf-livel');
      live.forEach(function (x) {
        var lib = x.nom + (x.app ? ' · ' + String(x.app).replace(/-/g, ' ') : '');
        if (!x.uid) { lvl.appendChild(el('span', 'bf-qui', lib)); return; }
        var bq = el('button', 'bf-qui', lib); bq.type = 'button';
        bq.onclick = function () { filtre = 'tous'; ouvert = 'perso:u:' + x.uid; dessiner(); setTimeout(function () { var c = document.querySelector('#boite-fen .bf-c.ouv'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); }, 30); };
        lvl.appendChild(bq);
      });
      lv.appendChild(lvl);
      r.appendChild(lv);
    }
    /* puces : un clic = les messages d'une seule app */
    var puces = el('div', 'bf-puces');
    function puce(id, lib, n) { var b = el('button', 'bf-p' + (filtre === id ? ' on' : ''), lib + (n ? ' · ' + n : '')); b.type = 'button'; b.onclick = function () { filtre = id; dessiner(); }; puces.appendChild(b); }
    puce('tous', 'Tous', D.nonLus || 0);
    (D.sources || []).forEach(function (s) { if (s.total || s.etat !== 'ok') puce(s.id, s.icone + ' ' + s.nom.split(' · ')[0], s.nonLus); });
    r.appendChild(puces);
    var hs = (D.sources || []).filter(function (s) { return s.etat !== 'ok'; });
    if (hs.length) r.appendChild(el('p', 'bf-warn', '⚠️ ' + hs.map(function (s) { return s.nom; }).join(', ') + ' : indisponible pour le moment — ces messages ne sont pas affichés, réessaie avec ↻.'));
    var liste = el('div', 'bf-liste');
    var items = (D.messages || []).filter(function (m) { return filtre === 'tous' || m.source === filtre; });
    var nonLus = items.filter(function (m) { return m.nonLus; });
    if (nonLus.length) {
      var tl = el('button', 'bf-tl', '✓ Tout marquer comme lu (' + nonLus.length + ')'); tl.type = 'button';
      tl.onclick = function () { tl.disabled = true; tl.textContent = '✓ Marquage…'; ecrire('lu', { cles: nonLus.map(function (m) { return m.cle; }) }).then(function () { return rafraichir(true); }); };   /* 10.10 : réaction immédiate */
      liste.appendChild(tl);
    }
    if (!items.length) liste.appendChild(el('p', 'bf-vide', filtre === 'tous' ? 'Aucun message pour le moment. Cette fenêtre se met à jour toute seule.' : 'Rien dans cette app.'));
    items.forEach(function (m) { liste.appendChild(carte(m, garderSaisie ? saisie : '')); });
    r.appendChild(liste); liste.scrollTop = pos;
    r.appendChild(codes());
    r.appendChild(inscriptionsAdmin());
    r.appendChild(inscriptions());
    r.appendChild(el('p', 'bf-pied', 'Mis à jour ' + quand(D.maj) + ' · se rafraîchit toute seule'));
    try { r.scrollTop = posFen; if (posDoc) (document.scrollingElement || document.documentElement).scrollTop = posDoc; } catch (e) { /* */ }
  }

  /* ── LA CONVERSATION : plein écran, le fil, des réponses rapides, la zone d'écriture collée en bas (Kevin 17.10) ─────────────────────── */
  function trouver(cle) { return ((D && D.messages) || []).filter(function (x) { return x.cle === cle; })[0] || null; }
  function directsNonLus(sauf) { return ((D && D.messages) || []).filter(function (x) { return x.repondre === 'direct' && x.nonLus && x.cle !== sauf; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); }
  /* le bouton « suivant » dit QUI écrit et QUOI (un nouveau message d'une autre personne arrive pendant qu'on répond : on le voit tout de suite) */
  function libSuiv(autres) { var x = autres[0], t = String(x.texte || '').replace(/\s+/g, ' ').trim(); if (t.length > 46) t = t.slice(0, 45) + '…'; return 'Message suivant (' + autres.length + ') · ' + x.de + (t ? ' : ' + t : '') + ' ›'; }
  function entrerConv(cle) {
    var m = trouver(cle); conv = cle; BAS = true; delete ENVOYE[cle]; ouvert = '';
    if (m && m.nonLus) ecrire('lu', { cles: [cle] }).then(function () { return rafraichir(); });
  }
  function choisirAtterrissage() {
    atterrir = false;
    var m = cibleCle ? trouver(cibleCle) : null; if (m && m.repondre !== 'direct') m = null;
    if (!m) m = directsNonLus('')[0];
    cibleCle = '';
    if (m) { filtre = 'tous'; entrerConv(m.cle); }
  }
  function retourListe() { conv = ''; atterrir = false; dessine = ''; dessiner(); }
  function envoyerRep(m, ta, en, st) {
    var t = ta.value.trim(); if (!t) { st.textContent = 'Écris ta réponse.'; return; }
    en.disabled = true; st.textContent = 'Envoi…';
    ecrire('repondre', { cle: m.cle, texte: t }).then(function (j) {
      if (j && j.ok) {
        delete DRAFT[m.cle]; ENVOYE[m.cle] = true; BAS = true; ta.value = '';
        m.fil = (m.fil || []).concat([{ moi: true, texte: t, ts: Date.now() }]);   /* la bulle apparaît tout de suite ; la vraie lecture la remplace */
        dessine = ''; dessiner(); rafraichir(true);
      } else { en.disabled = false; st.textContent = '❌ ' + raison(j && j.reason); }
    });
  }
  function dessinerConv(r, m, saisie) {
    var fil0 = r.querySelector('.bf-fil'), meme = !!fil0 && r.getAttribute('data-conv') === m.cle;
    var enBas = !meme || BAS || (fil0.scrollHeight - fil0.scrollTop - fil0.clientHeight < 90), pos = meme ? fil0.scrollTop : 0;
    r.textContent = ''; r.setAttribute('data-conv', m.cle); dessine = empreinte(D);
    var tete = el('div', 'bf-tete');
    var ret = el('button', 'bf-ret', '←'); ret.type = 'button'; ret.setAttribute('aria-label', 'Retour à tous les messages'); ret.onclick = retourListe;
    var tt = el('div', 'bf-ct'); tt.appendChild(el('h2', null, m.de)); tt.appendChild(el('div', 'bf-cs', srcIcone(m.source) + ' ' + String(m.app || '').replace('.kd-mc.com', '') + (m.ts ? ' · ' + quand(m.ts) : '')));
    var act = el('button', 'bf-r', '↻'); act.type = 'button'; act.setAttribute('aria-label', 'Actualiser'); act.onclick = function () { rafraichir(true); };
    var fer = el('button', 'bf-x', '✕'); fer.type = 'button'; fer.setAttribute('aria-label', 'Fermer'); fer.onclick = fermer;
    tete.appendChild(ret); tete.appendChild(tt); tete.appendChild(act); tete.appendChild(fer); r.appendChild(tete);
    var fil = el('div', 'bf-fil'); fil.setAttribute('role', 'log'); fil.setAttribute('aria-live', 'polite');
    (m.fil || []).forEach(function (x) { var b = el('div', 'bf-b ' + (x.moi ? 'moi' : 'eux')); b.appendChild(el('div', null, x.texte)); b.appendChild(el('div', 'bf-bt', (x.moi ? 'Toi · ' : '') + quand(x.ts))); fil.appendChild(b); });
    if (!(m.fil || []).length && String(m.texte || '').trim()) fil.appendChild(el('div', 'bf-b eux', m.texte));
    (m.infos || []).forEach(function (l) { fil.appendChild(el('div', 'bf-info', l)); });
    var src = (D.sources || []).filter(function (s) { return s.id === m.source; })[0];
    if (src && src.lien) { var o = el('a', 'bf-ouvrir', 'Ouvrir ' + src.nom.split(' · ')[0] + ' ↗'); o.href = src.lien; fil.appendChild(o); }
    r.appendChild(fil);
    var autres = directsNonLus(m.cle);
    if (ENVOYE[m.cle]) {
      var ap = el('div', 'bf-apres'); ap.appendChild(el('span', 'bf-ok', '✅ Envoyé'));
      if (autres.length) { var sv = el('button', 'bf-suiv', libSuiv(autres)); sv.type = 'button'; sv.onclick = function () { entrerConv(autres[0].cle); dessine = ''; dessiner(); }; ap.appendChild(sv); }
      else { var tl = el('button', 'bf-suiv', '← Tous les messages'); tl.type = 'button'; tl.onclick = retourListe; ap.appendChild(tl); }
      r.appendChild(ap);
    } else if (autres.length) {
      var sv2 = el('button', 'bf-suiv bf-suiv-bas', libSuiv(autres)); sv2.type = 'button'; sv2.onclick = function () { entrerConv(autres[0].cle); dessine = ''; dessiner(); }; r.appendChild(sv2);
    }
    var ta = el('textarea'); ta.rows = 2; ta.maxLength = 2000; ta.placeholder = 'Ta réponse…'; ta.setAttribute('aria-label', 'Ta réponse'); ta.value = saisie || DRAFT[m.cle] || '';
    var st = el('div', 'bf-st'), en = el('button', 'bf-env', 'Envoyer'); en.type = 'button';
    ta.oninput = function () { DRAFT[m.cle] = ta.value; };
    ta.onkeydown = function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); envoyerRep(m, ta, en, st); } };
    en.onclick = function () { envoyerRep(m, ta, en, st); };
    var rap = el('div', 'bf-rapides');
    RAPIDES.forEach(function (t) {
      var b = el('button', 'bf-rap', t); b.type = 'button';
      b.onclick = function () { ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + ' ' + t : t; DRAFT[m.cle] = ta.value; try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* */ } };
      rap.appendChild(b);
    });
    r.appendChild(rap);
    var compo = el('div', 'bf-compo'); compo.appendChild(ta); compo.appendChild(en); r.appendChild(compo); r.appendChild(st);
    try { fil.scrollTop = enBas ? fil.scrollHeight : pos; } catch (e) { /* */ }
    BAS = false;
  }
  /* Le clavier de l'iPhone recouvre le bas de la page : en conversation, la fenêtre suit la partie VISIBLE de l'écran, la zone d'écriture reste au-dessus. */
  function ajusterClavier(ev) {
    var r = document.getElementById('boite-fen'); if (!r || r.hidden) return;
    var vv = window.visualViewport;
    if (vv && conv) { r.style.bottom = 'auto'; r.style.height = vv.height + 'px'; r.style.top = vv.offsetTop + 'px'; var f = ev && ev.type ? r.querySelector('.bf-fil') : null; if (f) { try { f.scrollTop = f.scrollHeight; } catch (e) { /* */ } } }
    else { r.style.height = ''; r.style.top = ''; r.style.bottom = ''; }
  }

  function carte(m, saisie) {
    var c = el('div', 'bf-c' + (m.nonLus ? ' nv' : '') + (ouvert === m.cle ? ' ouv' : ''));
    var tete = el('button', 'bf-ch'); tete.type = 'button'; tete.setAttribute('aria-expanded', ouvert === m.cle ? 'true' : 'false');
    var l1 = el('div', 'bf-l1');
    l1.appendChild(el('span', 'bf-src', (srcIcone(m.source)) + ' ' + String(m.app || '').replace('.kd-mc.com', '')));
    l1.appendChild(el('span', 'bf-t', quand(m.ts)));
    if (m.nonLus) l1.appendChild(el('span', 'bf-n', String(m.nonLus)));
    tete.appendChild(l1);
    tete.appendChild(el('div', 'bf-de', m.de));
    tete.appendChild(el('div', 'bf-ap', m.texte));
    tete.onclick = function () {
      if (m.repondre === 'direct') { entrerConv(m.cle); dessiner(); return; }   /* une conversation à laquelle on répond s'ouvre plein écran, zone de réponse prête */
      ouvert = ouvert === m.cle ? '' : m.cle; dessiner();
      if (ouvert && m.nonLus) ecrire('lu', { cles: [m.cle] }).then(rafraichir);
    };
    c.appendChild(tete);
    if (ouvert === m.cle) {
      var corps = el('div', 'bf-corps');
      (m.fil || []).forEach(function (x) { var b = el('div', 'bf-b ' + (x.moi ? 'moi' : 'eux')); b.appendChild(el('div', null, x.texte)); b.appendChild(el('div', 'bf-bt', (x.moi ? 'Toi · ' : '') + quand(x.ts))); corps.appendChild(b); });
      /* 6.10 (Kevin, capture : bulle verte VIDE sous « Code admin refusé ») : pas de bulle sans texte, et l'heure exacte toujours. */
      if (!(m.fil || []).length && String(m.texte || '').trim()) corps.appendChild(el('div', 'bf-b eux', m.texte));
      if (!(m.fil || []).length && m.ts) corps.appendChild(el('div', 'bf-info', '🕒 ' + new Date(m.ts).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
      (m.infos || []).forEach(function (l) { corps.appendChild(el('div', 'bf-info', l)); });
      if (m.contact && !(m.infos || []).length) corps.appendChild(el('div', 'bf-info', '✉️ ' + m.contact));
      var bas = el('div', 'bf-bas');
      /* HISTORIQUE COMPLET d'une personne (Kevin 4.10) : sa fiche + tous ses événements (pages, lieux, questions, enregistrements…), le plus récent d'abord. */
      var uidP = /^perso:u:(.+)$/.exec(m.cle);
      if (uidP) {
        var hb = el('button', 'bf-ouvrir', HIST[uidP[1]] ? 'Masquer l\'historique' : '🕘 Historique complet'); hb.type = 'button';
        hb.onclick = function () {
          if (HIST[uidP[1]]) { delete HIST[uidP[1]]; dessiner(); return; }
          HIST[uidP[1]] = { chargement: true }; dessiner();
          fetch('/__boite/admin/personne?uid=' + encodeURIComponent(uidP[1]), { credentials: 'include', cache: 'no-store', headers: entetes(false) })
            .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { HIST[uidP[1]] = j && j.ok ? j : { erreur: true }; dessiner(); })
            .catch(function () { HIST[uidP[1]] = { erreur: true }; dessiner(); });
        };
        corps.appendChild(hb);
        /* sa fiche dans l'admin (périmètre, état du compte, supprimer, bannir) — un toucher */
        var fa = el('a', 'bf-ouvrir', '👤 Sa fiche admin'); fa.href = '/admin/#fiche-' + encodeURIComponent(uidP[1]);
        fa.onclick = function () { if (/\/admin\/?$/.test(location.pathname)) { fermer(); } };
        corps.appendChild(fa);
        /* 🚫 DÉCONNECTER PARTOUT (Kevin 8.10, « sécurité +++ » : un Windows inconnu à Stockholm sur le compte de Laurence) : d'un geste, toutes les
           sessions de ce compte tombent (/__admin/revoke, porte admin du domaine) ; le compte reste intact, la personne se reconnecte avec
           Face ID ou nom + code. Jamais sur le compte de Kevin lui-même (il se déconnecterait de sa propre boîte). */
        if (uidP[1] !== 'kdmc_admin' && uidP[1] !== 'kevin-desarzens') {
          var rb = el('button', 'bf-ouvrir bf-revoke', REV[uidP[1]] === 'ok' ? '✅ Déconnecté partout — il devra se reconnecter (Face ID ou nom + code)' : REV[uidP[1]] === 'ko' ? '❌ Déconnexion impossible pour le moment' : '🚫 Déconnecter ce compte partout'); rb.type = 'button';
          rb.disabled = REV[uidP[1]] === 'ok';
          rb.onclick = function () {
            if (!window.confirm('Déconnecter « ' + m.de + ' » de toutes ses sessions, sur tous ses appareils ? Son compte reste, il devra juste se reconnecter.')) return;
            rb.disabled = true; rb.textContent = 'Déconnexion…';
            fetch('/__admin/revoke', { method: 'POST', credentials: 'include', cache: 'no-store', headers: entetes(true), body: JSON.stringify({ uid: uidP[1] }) })
              .then(function (r) { return r.json(); }).then(function (j) { REV[uidP[1]] = j && j.ok ? 'ok' : 'ko'; dessiner(); })
              .catch(function () { REV[uidP[1]] = 'ko'; dessiner(); });
          };
          corps.appendChild(rb);
        }
        var H = HIST[uidP[1]];
        if (H) {
          var box = el('div', 'bf-hist');
          if (H.chargement) box.appendChild(el('div', 'bf-info', 'Chargement…'));
          else if (H.erreur) box.appendChild(el('div', 'bf-info', '❌ Historique indisponible pour le moment.'));
          else (H.evenements || []).forEach(function (e) { var l = el('div', 'bf-hl'); l.appendChild(el('span', 'bf-hq', quand(e.ts))); l.appendChild(el('span', null, ' ' + e.texte)); var hh = /\b((?:[a-z0-9-]+\.)?kd-mc\.com)\b/.exec(String(e.texte || '')); if (hh) { var la = el('a', 'bf-app', ' ↗ ouvrir'); la.href = 'https://' + hh[1] + '/'; la.target = '_blank'; la.rel = 'noopener'; l.appendChild(la); } if (e.appareil) l.appendChild(el('span', 'bf-hq', ' · 📲 ' + e.appareil)); box.appendChild(l); });
          corps.appendChild(box);
        }
      }
      if (m.repondre === 'direct') {
        var ta = el('textarea'); ta.rows = 2; ta.maxLength = 2000; ta.placeholder = 'Ta réponse…'; ta.value = saisie || ''; ta.setAttribute('aria-label', 'Ta réponse');
        var st = el('div', 'bf-st'); var en = el('button', 'bf-env', 'Envoyer'); en.type = 'button';
        en.onclick = function () {
          var t = ta.value.trim(); if (!t) { st.textContent = 'Écris ta réponse.'; return; }
          en.disabled = true; st.textContent = 'Envoi…';
          ecrire('repondre', { cle: m.cle, texte: t }).then(function (j) {
            if (j && j.ok) { ouvert = m.cle; rafraichir(); }
            else { en.disabled = false; st.textContent = '❌ ' + raison(j && j.reason); }
          });
        };
        bas.appendChild(ta); bas.appendChild(en); bas.appendChild(st);
      } else if (m.repondre === 'mailto' && m.mailto) {
        var a = el('a', 'bf-env', '✉️ Répondre par e-mail'); a.href = m.mailto; bas.appendChild(a);
      }
      var src = (D.sources || []).filter(function (s) { return s.id === m.source; })[0];
      if (src && src.lien) { var o = el('a', 'bf-ouvrir', (m.source === 'alertes' ? 'Ouvrir le journal des alertes' : 'Ouvrir ' + src.nom.split(' · ')[0]) + ' ↗'); o.href = src.lien; bas.appendChild(o); }
      corps.appendChild(bas); c.appendChild(corps);
    }
    return c;
  }
  /* 8.10 — LES CODES À VALIDER (Kevin : « la connexion inconnue sur le compte de Laurence ne doit plus jamais arriver ») : un compte sans code
     ne s'ouvre plus sur son nom ; quand quelqu'un propose un code depuis un appareil inconnu, c'est ICI que Kevin tranche, avec l'appareil, le
     lieu et le réseau sous les yeux. Accepter = ce code devient celui du compte ; refuser = rien ne change. Rien n'est affiché sans demande. */
  /* 17.10 (Kevin : « ferme par défaut, ça prend trop de place ») : l'explication répétée au-dessus de chaque liste à trancher se replie
     en « ℹ️ Comment décider ? » ; les cartes (nom, appareil, lieu, réseau, boutons) restent à l'écran : ce sont des décisions. */
  function aide(texte) {
    var d = el('details', 'bf-aide'); d.appendChild(el('summary', '', 'ℹ️ Comment décider ?')); d.appendChild(el('p', 'bf-vide', texte)); return d;
  }
  function codes() {
    var z = el('div', 'bf-ins'), L = D.codes || [];
    z.id = 'bf-codes';
    if (!L.length) { z.hidden = true; return z; }
    z.appendChild(el('h3', 'bf-ins-t', '🔐 Codes à valider (' + L.length + ')'));
    z.appendChild(aide('Un compte sans code ne s\'ouvre plus sur son nom. Si c\'est bien la personne (son appareil, sa ville, son opérateur), accepte : ce code devient le sien. Sinon refuse.'));
    L.forEach(function (c) {
      var k = el('div', 'bf-c nv'), h = el('div', 'bf-ch');
      h.appendChild(el('div', 'bf-de', c.nom + ' (' + c.uid + ')'));
      var info = el('div', 'bf-ap', [c.appareil, c.lieu, c.reseau].filter(Boolean).join(' · ') + ' · ' + quand(c.ts) + (c.app ? ' · depuis ' + c.app : ''));
      h.appendChild(info); k.appendChild(h);
      var bas = el('div', 'bf-bas');
      var oui = el('button', 'bf-env', '✅ Accepter ce code'); oui.type = 'button';
      var non = el('button', 'bf-ouvrir', '✖ Refuser'); non.type = 'button';
      var decider = function (accepter) {
        oui.disabled = true; non.disabled = true; info.textContent = accepter ? 'Acceptation…' : 'Refus…';
        ecrire('code-valider', { uid: c.uid, accepter: accepter }).then(function (j) {
          if (j && j.ok) { info.textContent = accepter ? '✅ Code accepté — ' + c.nom + ' se connecte avec son nom + ce code' : '✖ Refusé — rien n\'a changé'; oui.remove(); non.remove(); setTimeout(rafraichir, 800); }
          else { oui.disabled = false; non.disabled = false; info.textContent = '❌ ' + raison(j && j.reason); }
        });
      };
      /* 8.10 (revue extérieure) : accepter un code, c'est donner le compte à qui l'a proposé — jamais sur un tap par erreur. */
      oui.onclick = function () { if (window.confirm('Accepter ce code pour « ' + c.nom + ' » ? La personne (' + [c.appareil, c.lieu].filter(Boolean).join(', ') + ') se connectera avec.')) decider(true); };
      non.onclick = function () { if (window.confirm('Refuser ce code pour « ' + c.nom + ' » ? La personne devra en proposer un autre.')) decider(false); };
      bas.appendChild(oui); bas.appendChild(non); k.appendChild(bas); z.appendChild(k);
    });
    return z;
  }
  /* 10.10 — 🪪 LES INSCRIPTIONS SANS WHATSAPP (Kevin : quand WhatsApp ne peut pas confirmer le téléphone, c'est lui qui tranche) : même
     modèle que les codes à valider. Le domaine renvoie `inscriptionsAdmin` [{uid, nom, appareil, lieu, reseau, app, ts}] ; la décision part en
     POST /__boite/admin/inscription-admin {uid, accepter} → {ok, accepte}. Champ absent (routeur pas encore à jour) : rien n'est affiché. */
  function inscriptionsAdmin() {
    var z = el('div', 'bf-ins'), L = D.inscriptionsAdmin;
    z.id = 'bf-inscriptions-admin';
    if (!Array.isArray(L) || !L.length) { z.hidden = true; return z; }
    z.appendChild(el('h3', 'bf-ins-t', '🪪 Comptes du domaine à valider (' + L.length + ')'));
    z.appendChild(aide('Ces personnes ont reçu un mail de confirmation : dès qu\'elles le touchent, leur compte s\'ouvre tout seul et elles disparaissent d\'ici. Tu n\'as rien à faire. Si tu reconnais quelqu\'un (appareil, ville, opérateur), tu peux l\'ouvrir tout de suite ; si c\'est louche, refuse.'));
    L.forEach(function (c) {
      var k = el('div', 'bf-c nv'), h = el('div', 'bf-ch');
      h.appendChild(el('div', 'bf-de', (c.nom || '?') + ' (' + (c.uid || '?') + ')'));
      var info = el('div', 'bf-ap', [c.appareil, c.lieu, c.reseau].filter(Boolean).join(' · ') + ' · ' + quand(c.ts) + (c.app ? ' · depuis ' + c.app : ''));
      h.appendChild(info); k.appendChild(h);
      var bas = el('div', 'bf-bas');
      var oui = el('button', 'bf-env', '✅ Accepter'); oui.type = 'button'; oui.setAttribute('data-ins-admin', 'accepter'); oui.setAttribute('data-uid', c.uid || '');
      var non = el('button', 'bf-ouvrir', '✖ Refuser'); non.type = 'button'; non.setAttribute('data-ins-admin', 'refuser'); non.setAttribute('data-uid', c.uid || '');
      var decider = function (accepter) {
        oui.disabled = true; non.disabled = true; info.textContent = accepter ? 'Acceptation…' : 'Refus…';
        ecrire('inscription-admin', { uid: c.uid, accepter: accepter }).then(function (j) {
          if (j && j.ok) { info.textContent = j.accepte ? '✅ Accepté — le compte de ' + (c.nom || c.uid) + ' est ouvert' : '✖ Refusé — le compte reste fermé'; oui.remove(); non.remove(); setTimeout(rafraichir, 800); }
          else { oui.disabled = false; non.disabled = false; info.textContent = '❌ ' + raison(j && j.reason); }
        });
      };
      /* Accepter ouvre un compte : jamais sur un tap par erreur (même règle que les codes). */
      oui.onclick = function () { if (window.confirm('Accepter l\'inscription de « ' + (c.nom || c.uid) + ' » ? (' + [c.appareil, c.lieu].filter(Boolean).join(', ') + ')')) decider(true); };
      non.onclick = function () { if (window.confirm('Refuser l\'inscription de « ' + (c.nom || c.uid) + ' » ?')) decider(false); };
      bas.appendChild(oui); bas.appendChild(non); k.appendChild(bas); z.appendChild(k);
    });
    return z;
  }
  /* 7.10 — LES INSCRIPTIONS EN ATTENTE, sous les messages : chacune se valide ici d'un geste (le domaine écrit, jamais la page). */
  function inscriptions() {
    var z = el('div', 'bf-ins'), L = D.inscriptions || [];
    z.id = 'bf-inscriptions';
    z.appendChild(el('h3', 'bf-ins-t', '📝 Inscriptions à valider' + (L.length ? ' (' + L.length + ')' : '')));
    if (D.inscriptionsEtat && D.inscriptionsEtat !== 'ok') z.appendChild(el('p', 'bf-warn', '⚠️ Inscriptions CMCteams indisponibles pour le moment — réessaie avec ↻.'));
    else if (!L.length) z.appendChild(el('p', 'bf-vide', 'Aucune inscription en attente.'));
    L.forEach(function (i) {
      var c = el('div', 'bf-c nv'), h = el('div', 'bf-ch');
      h.appendChild(el('div', 'bf-de', i.nom));
      var info = el('div', 'bf-ap', (i.matricule ? 'Matricule ' + i.matricule + ' · ' : '') + 'CMCteams · ' + quand(i.ts) + (i.code ? ' · code envoyé' : ''));
      h.appendChild(info); c.appendChild(h);
      var b = el('button', 'bf-env', '✅ Valider l\'inscription'); b.type = 'button';
      b.onclick = function () {
        b.disabled = true; b.textContent = 'Validation…';
        ecrire('valider', { id: i.id }).then(function (j) {
          if (j && j.ok) { info.textContent = '✅ Validé — ' + i.nom + ' peut se connecter'; b.remove(); setTimeout(rafraichir, 800); }
          else { b.disabled = false; b.textContent = '✅ Valider l\'inscription'; info.textContent = '❌ ' + raison(j && j.reason); }
        });
      };
      c.appendChild(b); z.appendChild(c);
    });
    return z;
  }
  function srcIcone(id) { var s = ((D && D.sources) || []).filter(function (x) { return x.id === id; })[0]; return s ? s.icone : '📨'; }
  function raison(r) {
    return ({ bloque: 'cette personne a bloqué les messages', conversation_introuvable: 'conversation introuvable', conversation_invalide: 'conversation invalide', reponse_vide: 'écris ta réponse',
      reseau: 'pas de réseau, réessaie', inscription_introuvable: 'inscription introuvable (déjà supprimée ?)', demande_introuvable: 'demande introuvable (déjà traitée ?)', admin_requis: 'session admin expirée, reconnecte-toi', reponse_par_email: 'réponds par e-mail' })[r] || 'impossible pour le moment (' + (r || '?') + ')';
  }

  var demarre = false;
  function demarrer() {
    var a = document.getElementById('cercle-alerte'); if (!a || demarre) return; demarre = true;
    a.setAttribute('role', 'button'); a.removeAttribute('href');
    a.onclick = function (e) { e.preventDefault(); ouvrir(); };   /* le bandeau mène DIRECT au dernier message non lu */
    a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } };
    a.tabIndex = 0;
    /* 13.10 (Kevin : « la zone du haut apparaît tard ») : le domaine a déjà dit « admin » (c'est lui qui appelle demarrer) — le dernier relevé
       s'affiche tout de suite, daté, pendant que la vraie lecture part. Sans relevé gardé : rien, comme avant. */
    if (!D) { C = cacheLire(); if (C) bandeau(); }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ouverte) { if (conv) retourListe(); else fermer(); } });
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', ajusterClavier); window.visualViewport.addEventListener('scroll', ajusterClavier); }
    /* `#messages` = le dernier message non lu auquel on peut répondre ; `#messages/<clé>` = cette conversation-là */
    var cibleDe = function () { var m = /[#&]messages(?:\/([^&]+))?/.exec(location.hash); try { return m && m[1] ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; } };
    var surHash = function () { if (/[#&]messages\b/.test(location.hash)) { if (!ouverte) ouvrir(cibleDe()); else { atterrir = true; cibleCle = cibleDe(); dessine = ''; rafraichir(true); } } };
    if (/[#&]messages\b/.test(location.hash)) setTimeout(function () { ouvrir(cibleDe()); }, 400);
    window.addEventListener('hashchange', surHash);                                   // une notification touchée alors que le portail est déjà ouvert
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') rafraichir(); });
    window.addEventListener('focus', rafraichir); window.addEventListener('online', rafraichir); window.addEventListener('pageshow', rafraichir);
    rafraichir(); armer();
  }
  /* 10.10 — le TABLEAU DE BORD UNIQUE (kd-mc.com/admin/) lit la même boîte, sans la recopier : il s'abonne aux lectures (surMaj) et
     affiche les MÊMES blocs « à trancher » (codes, inscriptions sans WhatsApp, inscriptions), construits ici, une seule fois. */
  function blocs() {
    if (!D) return null;
    var o = { codes: codes(), inscriptionsAdmin: inscriptionsAdmin(), inscriptions: inscriptions() };
    Object.keys(o).forEach(function (k) { o[k].removeAttribute('id'); });   /* la fenêtre garde ses id ; ici, des copies sans id */
    return o;
  }
  function surMaj(f) { if (typeof f === 'function') { ECOUTE.push(f); if (D) { try { f(D); } catch (e) { /* */ } } } }
  window.kdmcBoite = { oublier: oublier, demarrer: demarrer, rafraichir: rafraichir, ouvrir: ouvrir, fermer: fermer, surMaj: surMaj, blocs: blocs, donnees: function () { return D; } };
})();
