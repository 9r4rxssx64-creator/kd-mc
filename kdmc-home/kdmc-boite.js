/* 📬 LA BOÎTE UNIQUE — vue admin du portail (Kevin 3.10.2026 : « tous les messages de n'importe quelle app du domaine sur ma
   vue admin, un visuel permanent, ne rien rater, je peux répondre directement par là, j'ai toutes les infos »).
   Rien n'est affiché sans la session admin PROUVÉE par le domaine : la page ne décide de rien, elle lit /__boite/admin
   (401 sinon → bandeau caché). Tout le texte reçu passe par textContent (jamais innerHTML : ce sont des messages de tiers). */
(function () {
  'use strict';
  var URL_BOITE = '/__boite/admin', PAS_BANDEAU = 30000, PAS_OUVERT = 12000;   /* quasi temps réel : relu aussi au retour sur l'onglet et dès qu'une notification ouvre #messages */
  var D = null, filtre = 'tous', ouvert = '', timer = null, ouverte = false, enCours = false;

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
  function lire() {
    return fetch(URL_BOITE, { credentials: 'include', cache: 'no-store', headers: entetes(false) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.ok ? j : null; })
      .catch(function () { return null; });
  }
  function ecrire(chemin, corps) {
    return fetch('/__boite/admin/' + chemin, { method: 'POST', credentials: 'include', cache: 'no-store', headers: entetes(true), body: JSON.stringify(corps) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'reponse_illisible' }; }); })
      .catch(function () { return { ok: false, reason: 'reseau' }; });
  }

  /* ── le bandeau permanent (toujours en haut, collant) ─────────────────────────────────────────────────── */
  function bandeau() {
    var a = document.getElementById('cercle-alerte'); if (!a) return;
    if (!D) { a.hidden = true; return; }
    var n = D.nonLus || 0, ni = (D.inscriptions || []).length;
    a.textContent = '';
    var t = el('span', 'bt', n ? '📬 ' + (n > 1 ? n + ' nouveaux messages' : '1 nouveau message') : ni ? '📬 Rien de nouveau dans les messages' : '📬 Aucun message en attente');
    a.appendChild(t);
    if (n + ni) a.appendChild(el('span', 'n', String(n + ni)));
    /* 7.10 (Kevin : « je dois voir les inscriptions en attente dans le domaine, en dessous des messages ») : comptées dans l'alerte. */
    if (ni) a.appendChild(el('span', 'qui', '📝 ' + ni + ' inscription' + (ni > 1 ? 's' : '') + ' à valider'));
    var qui = (D.sources || []).filter(function (s) { return s.nonLus && s.id !== 'alertes'; }).map(function (s) { return s.icone + ' ' + s.nom.split(' · ')[0] + ' ' + s.nonLus; });
    if (qui.length) a.appendChild(el('span', 'qui', qui.join(' · ')));
    if (D.nonLusAlertes) a.appendChild(el('span', 'qui', '🔔 ' + D.nonLusAlertes + ' alerte' + (D.nonLusAlertes > 1 ? 's' : '')));
    a.appendChild(el('span', 'qui', '· ' + (D.connectes || 0) + ' connecté(s)'));
    var hs = (D.sources || []).filter(function (s) { return s.etat !== 'ok'; });
    if (hs.length) a.appendChild(el('span', 'qui warn', '⚠️ ' + hs.map(function (s) { return s.nom.split(' · ')[0]; }).join(', ') + ' indisponible'));
    a.className = n + ni ? '' : 'calme'; a.hidden = false;
    try { document.title = (n + ni ? '(' + (n + ni) + ') ' : '') + document.title.replace(/^\(\d+\)\s*/, ''); } catch (e) { /* */ }
  }

  /* ── la fenêtre ───────────────────────────────────────────────────────────────────────────────────────── */
  function racine() {
    var r = document.getElementById('boite-fen'); if (r) return r;
    r = el('div'); r.id = 'boite-fen'; r.hidden = true; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'Mes messages');
    document.body.appendChild(r); return r;
  }
  function ouvrir() { ouverte = true; var r = racine(); r.hidden = false; document.documentElement.classList.add('boite-ouverte'); dessiner(); rafraichir(); armer(); }
  function fermer() { ouverte = false; var r = racine(); r.hidden = true; document.documentElement.classList.remove('boite-ouverte'); armer(); }
  function armer() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState === 'visible') rafraichir(); }, ouverte ? PAS_OUVERT : PAS_BANDEAU);
  }
  function rafraichir() {
    if (enCours) return Promise.resolve(); enCours = true;
    return lire().then(function (j) { enCours = false; D = j; bandeau(); if (ouverte) dessiner(true); }).catch(function () { enCours = false; });
  }

  function dessiner(garderSaisie) {
    var r = racine(); if (r.hidden) return;
    var saisie = ''; if (garderSaisie) { var ta0 = r.querySelector('textarea'); if (ta0) saisie = ta0.value; }
    var defil = r.querySelector('.bf-liste'); var pos = defil ? defil.scrollTop : 0;
    r.textContent = '';
    var tete = el('div', 'bf-tete');
    var fer = el('button', 'bf-x', '✕'); fer.type = 'button'; fer.setAttribute('aria-label', 'Fermer'); fer.onclick = fermer;
    tete.appendChild(el('h2', null, '📬 Mes messages'));
    var act = el('button', 'bf-r', '↻'); act.type = 'button'; act.setAttribute('aria-label', 'Actualiser'); act.onclick = function () { rafraichir(); };
    tete.appendChild(act); tete.appendChild(fer); r.appendChild(tete);
    if (!D) { r.appendChild(el('p', 'bf-vide', 'Chargement… (si ça dure : ta session admin a peut-être expiré, reconnecte-toi).')); return; }
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
      tl.onclick = function () { ecrire('lu', { cles: nonLus.map(function (m) { return m.cle; }) }).then(rafraichir); };
      liste.appendChild(tl);
    }
    if (!items.length) liste.appendChild(el('p', 'bf-vide', filtre === 'tous' ? 'Aucun message pour le moment. Cette fenêtre se met à jour toute seule.' : 'Rien dans cette app.'));
    items.forEach(function (m) { liste.appendChild(carte(m, garderSaisie ? saisie : '')); });
    r.appendChild(liste); liste.scrollTop = pos;
    r.appendChild(inscriptions());
    r.appendChild(el('p', 'bf-pied', 'Mis à jour ' + quand(D.maj) + ' · se rafraîchit toute seule'));
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
      reseau: 'pas de réseau, réessaie', inscription_introuvable: 'inscription introuvable (déjà supprimée ?)', admin_requis: 'session admin expirée, reconnecte-toi', reponse_par_email: 'réponds par e-mail' })[r] || 'impossible pour le moment (' + (r || '?') + ')';
  }

  var demarre = false;
  function demarrer() {
    var a = document.getElementById('cercle-alerte'); if (!a || demarre) return; demarre = true;
    a.setAttribute('role', 'button'); a.removeAttribute('href');
    a.onclick = function (e) { e.preventDefault(); ouvrir(); };
    a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } };
    a.tabIndex = 0;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ouverte) fermer(); });
    var surHash = function () { if (/[#&]messages\b/.test(location.hash)) { if (!ouverte) ouvrir(); else rafraichir(); } };
    if (/[#&]messages\b/.test(location.hash)) setTimeout(ouvrir, 400);
    window.addEventListener('hashchange', surHash);                                   // une notification touchée alors que le portail est déjà ouvert
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') rafraichir(); });
    window.addEventListener('focus', rafraichir); window.addEventListener('online', rafraichir); window.addEventListener('pageshow', rafraichir);
    rafraichir(); armer();
  }
  window.kdmcBoite = { demarrer: demarrer, rafraichir: rafraichir, ouvrir: ouvrir, fermer: fermer };
})();
