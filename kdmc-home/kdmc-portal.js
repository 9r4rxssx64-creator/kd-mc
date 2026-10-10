/* KDMC APEX — portail PWA : 1ʳᵉ connexion = création de compte (prénom+nom+code
   + CGU unique), session unique kd-mc.com, puis installation PWA. Reconnu auto
   ensuite. 100% côté client (code haché PBKDF2 200k, jamais en clair) + session
   SSO signée côté router. Fail-open : si SSO indispo, le compte local marche
   quand même sur cet appareil. */
(function () {
  'use strict';
  var LS_ACCOUNT = 'kdmc_account_v1';
  var LS_CGU = 'kdmc_cgu_accepted_v1';
  var gate = document.getElementById('gate');
  var hub = document.getElementById('hub');
  var hello = document.getElementById('hello');
  var installWrap = document.getElementById('install');
  var deferredPrompt = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lg(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function ls(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota */ } }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_.]+/g, ' ').trim(); }
  function slug(s) { return norm(s).replace(/\s+/g, '-').slice(0, 60); }

  /* ---- PBKDF2 (Web Crypto) : haché du code, jamais le code en clair ---- */
  function rndSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function hashCode(code, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(code), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 200000, hash: 'SHA-256' }, k, 256); })
      .then(function (bits) { return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); });
  }
  function timingEq(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

  /* ---------------------------- Vues ---------------------------- */
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  /* Si une app a renvoyé l'utilisateur ici pour se connecter (?return=<url app>),
     on le ramène dans l'app une fois la session domaine posée. Sécurité anti
     open-redirect : on n'autorise QUE les sous-domaines de kd-mc.com. */
  function safeReturnUrl() {
    try {
      var raw = new URLSearchParams(location.search).get('return');
      if (!raw) return null;
      var u = new URL(raw, location.origin);
      if (u.protocol !== 'https:') return null;
      var h = u.hostname;
      if (h === 'kd-mc.com' || h.slice(-10) === '.kd-mc.com') return u.href;
      return null;
    } catch (e) { return null; }
  }
  /* Consommateurs CONNUS du pass en fragment (lisent ET nettoient #kdmc_sso=).
     Même allowlist que _decorateAppLinks (leçon #101 : une app à routeur #hash qui
     ne consomme pas le jeton casse — « Page introuvable » — ou le laisse traîner
     dans son URL/historique). Sourcing consomme (bootSSO → consumeHashToken). */
  /* UNE SEULE LISTE (26.09.2026). Il y en avait DEUX — celle-ci (retour après connexion) et
     celle des tuiles (_decorateAppLinks) — et elles avaient déjà divergé : sourcing dans
     l'une, pas dans l'autre. Surtout, javis.kd-mc.com n'était dans AUCUNE, alors que Bee
     lit et nettoie #kdmc_sso= (tools/javis/javis-widget.js, ssoToken). Mesuré sur l'iPhone
     de Kevin le 26.09 à 23h19 : Bee ouverte depuis l'app de l'écran d'accueil, cookies
     isolés, aucun laissez-passer → « Bee est personnelle à Kevin » et aucune issue.
     Garde : npm run test:laissez-passer (toute app qui LIT #kdmc_sso= doit être ici). */
  /* Ajoutées le même soir, vérifiées une par une (aucune ne navigue par « # », toutes retirent le
     laissez-passer de l'adresse) : la Light, la cuisine, le studio et Chez Lolo LISAIENT déjà
     #kdmc_sso= au retour de connexion — mais ne le recevaient jamais : même trou que Bee.
     PAS CMCteams : il navigue par « # » (leçon #101), il lui faut sa propre preuve navigateur. */
  var SSO_PASS_CONSUMERS = { 'apex-chat.kd-mc.com': 1, 'dashboard.kd-mc.com': 1, 'sourcing.kd-mc.com': 1,
    'bot.kd-mc.com': 1, 'javis.kd-mc.com': 1,
    'departs.kd-mc.com': 1, 'cmcteams-light.kd-mc.com': 1, 'cuisine.kd-mc.com': 1, 'cocina.kd-mc.com': 1,
    'cujina.kd-mc.com': 1, 'studio.kd-mc.com': 1, 'chez-lolo.kd-mc.com': 1,
    'lingua.kd-mc.com': 1 };   /* 27.09 : Lingua lit et retire #kdmc_sso= (kdmcToken), aucune navigation par « # » */
  function gotoReturnIfAny() {
    var r = safeReturnUrl();
    if (r) {
      /* On ajoute le "pass signé" dans le fragment (#) — non envoyé aux serveurs,
         non journalisé — SEULEMENT vers les apps qui le consomment. Les autres
         reçoivent l'URL propre (elles se reconnaissent par cookie même-contexte). */
      var host = ''; try { host = new URL(r).hostname; } catch (e) { /* */ }
      var t = SSO_PASS_CONSUMERS[host] && window.kdmcSSO && window.kdmcSSO.token ? window.kdmcSSO.token() : '';
      if (t) r += (r.indexOf('#') >= 0 ? '&' : '#') + 'kdmc_sso=' + encodeURIComponent(t);
      /* ET, pour TOUTES les apps (27.09.2026, « reconnu par n'importe quel chemin ») : on passe
         par la porte /__sso/entrer de l'app, qui dépose la session dans le stockage de l'app
         installée — y compris CMCteams, qui ne peut pas lire le fragment. */
      if (window.kdmcSSO && window.kdmcSSO.porte) { window.kdmcSSO.porte(r).then(function (u) { location.replace(u); }); }
      else location.replace(r);
      return true;
    }
    return false;
  }

  /* La zone Administration est cachée par défaut (hidden dans le HTML). On ne la
     révèle QUE si la session du domaine dit admin === true (vérifié côté serveur
     via whoami). Les clients/Laurence ne la voient jamais. */
  /* MESSAGES LINGUA POUR L'ADMIN, SUR LE PORTAIL (Kevin 2.10 : « une notification dans une partie de mon domaine,
     visible, pour ne pas la rater à chaque message »). La boîte n'est rendue qu'à la session admin (vérifiée par le
     serveur) ; ailleurs le bandeau reste caché. Relu toutes les 2 min tant que la page est ouverte. */
  var _alerteT = null;
  function alerteCercle() {
    var a = document.getElementById('cercle-alerte'); if (!a) return;
    fetch('/__cercle/admin/boite', { credentials: 'include', cache: 'no-store', headers: window.kdmcSSO && window.kdmcSSO.token && window.kdmcSSO.token() ? { authorization: 'Bearer ' + window.kdmcSSO.token() } : {} })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok) { a.hidden = true; return; }
        var n = j.nonLus || 0, c = j.connectes || 0;
        a.textContent = '';
        var t = document.createElement('span');
        t.textContent = n ? '💬 ' + (n > 1 ? n + ' nouveaux messages' : '1 nouveau message') + ' dans Lingua' : '💬 Lingua : aucun message en attente';
        a.appendChild(t);
        if (n) { var b = document.createElement('span'); b.className = 'n'; b.textContent = String(n); a.appendChild(b); }
        var d = document.createElement('span'); d.textContent = '· ' + c + ' connecté(s)'; a.appendChild(d);
        a.className = n ? '' : 'calme'; a.hidden = false;
      })
      .catch(function () { /* réseau : on retentera */ });
    if (!_alerteT) { try { _alerteT = setInterval(alerteCercle, 120000); } catch (e) { /* */ } }
  }
  function applyAdminVisibility(deja) {   /* `deja` : le résultat whoami déjà lu par showHub (un seul appel au domaine) */
    var priv = document.getElementById('priv-zone');
    if (!priv) return;
    var done = function (s) {
      /* Espace privé regroupé (Sourcing, Coffre-fort, Dashboard, Admin) :
         Kevin + Laurence (Lolo) OU admin. Les autres clients ne le voient jamais.
         /admin/ reste protégé par le code admin côté serveur (fail-closed). */
      var named = /kevin|desarzens|laurence|lolo|saint.?polit/.test(norm(s && s.name || ''));
      /* Visuel réservé : admin (prouvé serveur via ADMIN_UIDS) OU identité FORTE Face ID
         (verified) + nom autorisé. Un inconnu qui tape "Kevin"/"Laurence" SANS Face ID
         n'est PAS verified → ne voit rien (leçon #99 : un nom auto-déclaré n'accorde aucun droit). */
      var isPriv = !!(s && s.admin) || (!!(s && s.verified) && named);
      priv.hidden = !isPriv;
      /* Bot crypto : tuile visible dès que la session porte le nom Kevin/Laurence
         (OU admin/verified). Pas d'exigence Face ID car la page bot.kd-mc.com est
         protégée par son propre code admin — la tuile ne donne AUCUN accès (≠ leçon #99
         qui vise l'ACCÈS, pas l'affichage d'un raccourci vers une page déjà verrouillée). */
      var botZone = document.getElementById('bot-zone');
      if (botZone) botZone.hidden = !(isPriv || named);
      /* « Qui se connecte » : même règle que le bot — la page admin.kd-mc.com a son PROPRE
         code admin (vérifié serveur) donc afficher le raccourci n'accorde aucun accès. Sans ça, la tuile
         restait invisible sur l'iPhone de Kevin (Face ID non prouvé) = fonction inexistante. */
      var accessZone = document.getElementById('access-zone');
      if (accessZone) accessZone.hidden = !(isPriv || named);
      /* Tor : même logique que le bot (sinon invisible sur l'iPhone de Kevin, Face ID non
         prouvé = fonction inexistante). Mais réservé à KEVIN seul : la page n'a rien de
         sensible, c'est un choix de discrétion, pas une protection. */
      if (s && s.admin) { if (window.kdmcBoite) window.kdmcBoite.demarrer(); else alerteCercle(); }   /* 3.10 : la boîte unique (toutes les apps) ; l'ancien bandeau Lingua reste en secours */
      var torZone = document.getElementById('tor-zone');
      var estKevin = /kevin|desarzens/.test(norm(s && s.name || ''));
      if (torZone) torZone.hidden = !(!!(s && s.admin) || estKevin);
      /* Bee (Javis) : MEME regle que Tor, et pour la meme raison. L'app est deja
         fail-closed cote javis-widget.js (whoami + admin verifie) : montrer la tuile
         n'ouvre rien, la cacher rend juste l'app introuvable (vecu 17.09). */
      var javisZone = document.getElementById('javis-zone');
      if (javisZone) javisZone.hidden = !(!!(s && s.admin) || estKevin);
      renderSelfService(s); /* « Mes appareils / connexions » — pour TOUT connecté */
      renderCodeNudge(s);   /* 8.10 : un compte sans code au domaine s'ouvre sur son seul nom → on propose d'en choisir un, ici, sur son appareil */
    };
    /* 8.10 : « compte sans code » n'est pas « aucune session » — l'écran du code s'affiche, bloquant, et rien d'autre ne s'ouvre. */
    var lu = function (r) {
      if (r && r.state === 'code_requis') { renderCodeObligatoire(r.session); done(null); return; }
      done(r && r.state === 'session' ? r.session : null);
    };
    if (deja && deja.state) { lu(deja); }
    else if (window.kdmcSSO && window.kdmcSSO.whoamiResult) { window.kdmcSSO.whoamiResult().then(lu).catch(function () { done(null); }); }
    else if (window.kdmcSSO) { window.kdmcSSO.whoami().then(done).catch(function () { done(null); }); } else { done(null); }
  }

  /* ===== « EN ATTENTE DE L'ADMINISTRATEUR » (10.10, Kevin : « Si pas de WhatsApp, validation admin. Au choix ») =====
     Le compte existe (nom + code) mais le domaine le garde fermé partout sauf ici tant que Kevin ne l'a pas ouvert. L'écran
     redemande au domaine toutes les 30 s (en pause quand l'écran est caché) et s'ouvre tout seul dès que c'est accepté. */
  var _attenteTimer = null;
  function renderAttenteAdmin(s) {
    var old = document.getElementById('attente-admin'); if (old) old.remove();
    clearInterval(_attenteTimer); _attenteTimer = null;
    var refuse = s && s.attente_admin === 'refuse';
    var box = document.createElement('div'); box.id = 'attente-admin'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', refuse ? 'Compte non validé' : 'En attente de l\'administrateur');
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b1409;color:#f3f0e6;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto';
    box.innerHTML = '<div style="max-width:360px;width:100%;text-align:center"><div style="font-size:44px">' + (refuse ? '🚫' : '⏳') + '</div>'
      + '<h1 style="font-size:19px;color:#f6d97a;margin:8px 0 6px">' + (refuse ? 'Compte non validé' : 'Ton compte attend l\'administrateur') + '</h1>'
      + '<p style="color:#cfd8cc;margin:0 0 14px"><b>' + esc((s && s.name) || 'Ton compte') + '</b>, '
      + (refuse ? 'l\'administrateur n\'a pas validé ce compte. Tu peux te déconnecter, ou recréer un compte en confirmant ton téléphone par WhatsApp.'
        : 'ton compte est bien créé. Tu n\'as pas confirmé par WhatsApp : l\'administrateur le valide lui-même. Cette page s\'ouvrira toute seule dès qu\'il l\'aura accepté.') + '</p>'
      + (refuse ? '' : '<p id="aa-etat" aria-live="polite" style="color:#93a58f;font-size:13px;margin:0 0 12px">Je vérifie toutes les 30 secondes…</p>'
        + '<button class="btn" id="aa-go" type="button" style="min-height:50px;width:100%">Vérifier maintenant</button>')
      + '<button class="btn ghost" id="aa-out" type="button" style="min-height:48px;width:100%;margin-top:8px">Me déconnecter</button></div>';
    document.body.appendChild(box);
    /* 10.10 (réactivité) : « Vérifier maintenant » réagit tout de suite (texte + bouton grisé), et demande une réponse NEUVE au domaine. */
    var verifier = function (manuel) {
      if ((!manuel && document.hidden) || !window.kdmcSSO || !window.kdmcSSO.whoamiResult) return;
      var b = document.getElementById('aa-go'), e0 = document.getElementById('aa-etat');
      if (manuel && b) { b.disabled = true; b.textContent = 'Vérification…'; if (e0) e0.textContent = 'Je demande au domaine…'; }
      var rendre = function () { var b2 = document.getElementById('aa-go'); if (b2) { b2.disabled = false; b2.textContent = 'Vérifier maintenant'; } };
      window.kdmcSSO.whoamiResult({ frais: !!manuel }).then(function (r) {
        if (r && r.state === 'session' && r.session && !r.session.attente_admin) { clearInterval(_attenteTimer); box.remove(); showHub(r.session.name, r); return; }
        if (r && r.state === 'session' && r.session && r.session.attente_admin === 'refuse') { renderAttenteAdmin(r.session); return; }
        rendre();
        var e = document.getElementById('aa-etat'); if (e) e.textContent = 'Pas encore validé — je revérifie dans 30 secondes.';
      }).catch(function () { rendre(); /* réseau : prochain tour */ });
    };
    var go = document.getElementById('aa-go'); if (go) go.addEventListener('click', function () { verifier(true); });
    document.getElementById('aa-out').addEventListener('click', function () {
      clearInterval(_attenteTimer); box.remove();
      if (window.kdmcSSO) window.kdmcSSO.logout();
      try { localStorage.removeItem(LS_ACCOUNT); } catch (e) { /* */ }
      hide(hub); renderCreate(); show(gate);
    });
    if (!refuse) _attenteTimer = setInterval(verifier, 30000);
  }

  /* ===== « CRÉE TON CODE » — écran BLOQUANT (8.10 soir, Kevin : « Les anciens comptes sans code se voient afficher à leur prochaine
     connexion la création d'un code obligatoire. Sinon pas d'accès ») =====
     Le domaine a répondu code_requis : la session est à la personne, son compte n'a pas de code. Tout l'écran est couvert ; la seule
     sortie est de choisir son code (2 fois). Le domaine n'accepte de poser le code d'un compte existant que depuis sa propre session
     (memeSession) : ici, c'est le cas. Un compte qui a déjà un code (posé avant le 8.10) l'entre une fois : le domaine le reconnaît.
     Ensuite : retour à l'app d'où l'on vient (?return=), sinon le portail se recharge, connecté. */
  function renderCodeObligatoire(s) {
    var old = document.getElementById('code-oblig'); if (old) old.remove();
    if (!s || !s.uid || !window.kdmcSSO || !window.kdmcSSO.issueDetail) return;
    var box = document.createElement('div'); box.id = 'code-oblig'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Crée ton code');
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b1409;color:#f3f0e6;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto';
    box.innerHTML = '<div style="max-width:360px;width:100%"><div style="font-size:44px;text-align:center">🔐</div>'
      + '<h1 style="font-size:19px;color:#f6d97a;margin:8px 0 6px;text-align:center">Crée ton code</h1>'
      + '<p style="color:#cfd8cc;margin:0 0 14px"><b>' + esc(s.name || 'Ton compte') + '</b>, ton compte n\'a pas encore de code. Pour continuer, choisis ton code (6 caractères ou plus) : il te servira dans toutes les apps KDMC. Sans code, plus d\'accès.</p>'
      + '<input class="fld" id="co-code" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Mon code (6 caractères ou plus)" aria-label="Mon code" style="min-height:48px;font-size:18px;width:100%;box-sizing:border-box;margin-bottom:10px">'
      + '<input class="fld" id="co-code2" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Le même code, une 2e fois" aria-label="Confirme ton code" style="min-height:48px;font-size:18px;width:100%;box-sizing:border-box;margin-bottom:10px">'
      + '<button class="btn" id="co-go" type="button" style="min-height:50px;width:100%">Créer mon code</button>'
      + '<p class="g-err" id="co-err" role="alert" aria-live="polite" style="min-height:22px"></p>'
      + '<p style="font-size:12.5px;color:#93a58f;text-align:center">Tu as déjà un code ? Entre-le ici (2 fois) : le domaine le reconnaît.</p></div>';
    document.body.appendChild(box);
    var go = function () {
      var c1 = (document.getElementById('co-code').value || '').trim(), c2 = (document.getElementById('co-code2').value || '').trim();
      var err = document.getElementById('co-err'), b = document.getElementById('co-go');
      if (c1.length < 6) { err.textContent = 'Au moins 6 caractères.'; return; }
      if (c1 !== c2) { err.textContent = 'Les deux codes ne sont pas identiques.'; return; }
      b.disabled = true; b.textContent = '…';
      window.kdmcSSO.issueDetail(s.uid, s.name, true, safeReturnUrl(), c1).then(function (j) {
        if (j && j.ok && j.code) {
          box.querySelector('div').innerHTML = '<p style="text-align:center;font-size:17px">✅ Ton code est créé : nom + code dans toutes les apps KDMC.</p>';
          setTimeout(function () { if (!gotoReturnIfAny()) location.reload(); }, 700); return;
        }
        err.textContent = (j && j.reason === 'code_incorrect') ? 'Ce compte a déjà un code, et ce n\'est pas celui-là.'
          : (j && j.reason === 'code_en_attente') ? (j.message || 'Ton code est transmis à l\'administrateur : dès qu\'il l\'accepte, reconnecte-toi avec.')
          : (j && j.message) || 'Le domaine n\'a pas pu enregistrer le code, réessaie.';
        b.disabled = false; b.textContent = 'Créer mon code';
      }).catch(function () { err.textContent = 'Erreur réseau, réessaie.'; b.disabled = false; b.textContent = 'Créer mon code'; });
    };
    document.getElementById('co-go').addEventListener('click', go);
    document.getElementById('co-code2').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    try { document.getElementById('co-code').focus(); } catch (e) { /* */ }
  }

  /* ===== « Protège ton compte par un code » (8.10, sécurité +++) =====
     Vécu : un PC Windows chez un hébergeur suédois a ouvert des sessions au nom de Laurence — son compte n'avait pas de code au
     domaine, un nom suffisait. Le domaine le dit (whoami.code_pose === false) ; ici on propose de choisir le code TOUT DE SUITE,
     sur l'appareil de la personne (le domaine n'accepte de poser le code d'un compte existant que depuis sa propre session).
     Un compte qui a déjà un code (posé avant le 8.10, fiche sans `code_at`) le confirme une fois : le domaine le reconnaît. */
  function renderCodeNudge(s) {
    var old = document.getElementById('code-nudge'); if (old) old.remove();
    if (!s || !s.uid || s.admin || s.code_pose !== false || !window.kdmcSSO || !window.kdmcSSO.issueDetail) return;
    var box = document.createElement('div'); box.id = 'code-nudge'; box.className = 'g-sub'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Protéger mon compte');
    box.innerHTML = '<p>🔐 <b>Ton compte n\'a pas encore de code.</b> Sans code, quelqu\'un qui tape ton nom pourrait entrer à ta place. Choisis-en un maintenant (6 chiffres ou plus) — il marchera dans toutes les apps KDMC.</p>'
      + '<input class="fld" id="cn-code" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Mon code (6 chiffres ou plus)" aria-label="Mon code">'
      + '<button class="btn" id="cn-go" type="button">Protéger mon compte</button>'
      + '<p class="g-err" id="cn-err" role="alert" aria-live="polite"></p>';
    var anchor = document.getElementById('self-svc');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor); else if (hub) hub.insertBefore(box, hub.firstChild);
    document.getElementById('cn-go').addEventListener('click', function () {
      var code = (document.getElementById('cn-code').value || '').trim(), err = document.getElementById('cn-err'), b = document.getElementById('cn-go');
      if (code.length < 6) { err.textContent = 'Au moins 6 caractères.'; return; }
      b.disabled = true; b.textContent = '…';
      window.kdmcSSO.issueDetail(s.uid, s.name, true, safeReturnUrl(), code).then(function (j) {
        if (j && j.ok && j.code) { box.innerHTML = '<p>✅ Ton compte est protégé : nom + code dans toutes les apps KDMC.</p>'; return; }
        err.textContent = (j && j.reason === 'code_incorrect') ? 'Ce compte a déjà un code : entre celui-là pour le confirmer.' : (j && j.message) || 'Le domaine n\'a pas pu enregistrer le code, réessaie.';
        b.disabled = false; b.textContent = 'Protéger mon compte';
      }).catch(function () { err.textContent = 'Erreur réseau, réessaie.'; b.disabled = false; b.textContent = 'Protéger mon compte'; });
    });
  }

  /* ===== Self-service : chacun voit/gère SES appareils + SON historique ===== */
  function _ago(ts) {
    if (!ts) return '—';
    var d = Date.now() - ts, m = Math.floor(d / 6e4), h = Math.floor(d / 36e5), j = Math.floor(d / 864e5);
    if (m < 1) return "à l'instant"; if (m < 60) return 'il y a ' + m + ' min'; if (h < 24) return 'il y a ' + h + ' h'; return 'il y a ' + j + ' j';
  }
  function _dt(ts) { try { return ts ? new Date(ts).toLocaleString('fr-FR') : '—'; } catch (e) { return '—'; } }
  function _dur(ms) { ms = ms || 0; if (ms < 60000) return '< 1 min'; var m = Math.round(ms / 60000); if (m < 60) return m + ' min'; var h = Math.floor(m / 60); m = m % 60; return h + ' h' + (m ? (' ' + m) : ''); }
  function _dayKey(ts) { try { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); } catch (e) { return String(ts); } }
  function _hm(ts) { try { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; } }
  function _dayLabel(ts) {
    var dk = _dayKey(ts);
    if (dk === _dayKey(Date.now())) return "Aujourd'hui";
    if (dk === _dayKey(Date.now() - 864e5)) return 'Hier';
    try { return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return dk; }
  }
  /* Copie de REPLI (hors-ligne). La SOURCE UNIQUE = /apps.json (chargée au boot,
     fusionnée par-dessus). Le test apps-consistency garantit qu'elles ne divergent pas. */
  var APP_NM = {
    'cmcteams.kd-mc.com': '📅 CMCteams', 'apex-ai.kd-mc.com': '🤖 Apex AI', 'apex-chat.kd-mc.com': '💬 Apex Chat',
    'dashboard.kd-mc.com': '📊 Dashboard', 'sourcing.kd-mc.com': '📦 Sourcing', 'coffre.kd-mc.com': '🔐 Coffre',
    'kd-mc.com': '🏠 Portail', 'www.kd-mc.com': '🏠 Portail', 'la-detente.kd-mc.com': '🌿 La Détente',
    'chez-lolo.kd-mc.com': '🎨 Chez Lolo', 'departs.kd-mc.com': '🎯 CMCteams light', 'cmcteams-light.kd-mc.com': '🎯 CMCteams light', 'bot.kd-mc.com': '🤖 Bot Crypto', 'beatbot.kd-mc.com': '🌊 PoolPilot', 'autorisations.kd-mc.com': '🆔 Autorisations', 'arbre.kd-mc.com': '🌳 Arbre', 'lingua.kd-mc.com': '🐝 Lingua', 'studio.kd-mc.com': '🎬 Créa Studio', 'cuisine.kd-mc.com': '🍽️ A Cüjina de Mùnegu', 'cocina.kd-mc.com': '🍽️ A Cüjina de Mùnegu', 'cujina.kd-mc.com': '🍽️ A Cüjina de Mùnegu', 'worldmonitor.kd-mc.com': '🌍 World Monitor', 'osint.kd-mc.com': '🔎 OSINT', 'ia.kd-mc.com': '🧠 Outils IA', 'outils.kd-mc.com': '🧰 Mes outils gratuits', 'tor.kd-mc.com': '🧅 Tor en clair', 'shops.kd-mc.com': '🏬 Portail boutiques', 'rotaplan.kd-mc.com': '🗓️ Rotaplan', 'kit.kd-mc.com': '🧰 Kit IA de l\'indépendant', 'croupier.kd-mc.com': '🃏 Devenir croupier', 'javis.kd-mc.com': '🐝 Javis', 'dossiers.kd-mc.com': '🗂️ Dossiers publics'
  };
  try {
    fetch('/apps.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var a = j && j.apps; if (!a) return;
      Object.keys(a).forEach(function (h) { APP_NM[h] = (a[h].icon ? a[h].icon + ' ' : '') + (a[h].name || h); });
    }).catch(function () { /* repli intégré */ });
  } catch (e) { /* repli intégré */ }
  function _appNm(h) { return APP_NM[h] || ('🌐 ' + (h || '?')); }
  var _ssUid = ''; /* uid de la session courante (pour l'enrôlement Face ID depuis le hub) */
  var _ssVerified = false; /* session prouvée par Face ID ? → cet appareil est enrôlé (reconnu AUTO) */
  function renderSelfService(s) {
    var box = document.getElementById('self-svc');
    if (!box) return;
    if (!s || !s.uid) { _ssUid = ''; _ssVerified = false; box.hidden = true; box.innerHTML = ''; return; }
    _ssUid = s.uid;
    _ssVerified = !!(s && s.verified);
    box.hidden = false;
    /* ADMIN : plus de « Mes connexions » ICI — c'était un DOUBLON de la page
       « Qui se connecte » (qui montre tout le monde, lui compris, à partir de la
       MÊME donnée). Règle « zéro doublon, source unique » (Kevin 2026-08-05 :
       « enlève ça et intègre le dedans. Je suis admin. »).
       Les NON-admins gardent leur historique perso ici : c'est leur seul accès
       (ils n'entrent pas dans la page admin) → retirer pour tous serait une régression. */
    /* MÊME RÈGLE QUE LA TUILE « Qui se connecte » (admin OU nom reconnu).
       Vécu 2026-08-05 : tester `s.admin` SEUL ne suffisait pas — la session de Kevin
       le reconnaît par son NOM sans être « admin prouvé » (Face ID), donc il voyait la
       tuile MAIS gardait l'historique en double en bas du portail. Les deux gates
       doivent être IDENTIQUES, sinon le doublon revient pour celui qui voit la tuile. */
    var hasUnified = !!(s && s.admin) || /kevin|desarzens|laurence|lolo|saint.?polit/.test(norm(s && s.name || ''));
    box.innerHTML = '<h2 class="cat">🔐 Mes appareils' + (hasUnified ? '' : ' &amp; connexions') + '</h2>'
      + '<div id="ss-pk" class="ss-card">Chargement…</div>'
      + (hasUnified
        ? '<div class="ss-card ss-mut">🕘 Ton historique complet est dans <a href="https://admin.kd-mc.com/">Qui se connecte</a> — avec celui de tout le monde.</div>'
        : '<div id="ss-hist" class="ss-card"></div>');
    loadMyPasskeys();
    if (!hasUnified) loadMyHistory();
  }
  function loadMyPasskeys() {
    var el = document.getElementById('ss-pk');
    if (!el || !window.kdmcSSO || !window.kdmcSSO.myPasskeys) return;
    window.kdmcSSO.myPasskeys().then(function (j) {
      if (!el) return;
      if (!j || !j.ok) { el.innerHTML = '<b>📱 Mes appareils Face ID</b><div class="ss-mut">Indisponible pour le moment.</div>'; return; }
      var pk = j.passkeys || [];
      /* Activation Face ID DÉCOUVRABLE en permanence (pas seulement au modal post-login
         qu'on peut esquiver). Sans Face ID → pas « verified » → ni auto-login cross-app
         ni espace privé. Ce bouton comble ce manque. */
      var canEnroll = _pkSupported();
      var mine = _myCred(_ssUid); /* credId (b64u) du passkey de CET appareil, si connu */
      /* la liste renvoie k.id = 12 premiers car. du credId → « ce téléphone » = mine commence par k.id */
      var credMatch = !!(mine && pk.some(function (k) { return mine.indexOf(k.id) === 0; }));
      /* RECONNU AUTO : si la session est prouvée par Face ID (verified) ET qu'il existe
         au moins un passkey, c'est que CE téléphone s'est authentifié en Face ID → il est
         enrôlé. Plus besoin de taper « Activer/vérifier » pour l'ancien enrôlement. */
      var enrolledHere = credMatch || (_ssVerified && pk.length > 0);
      /* quand on ne connaît pas le credId exact mais qu'il n'y a qu'UNE clé, c'est celle-ci */
      var soleHere = !credMatch && _ssVerified && pk.length === 1;
      var rows = pk.length
        ? pk.map(function (k) {
          var here = (mine && mine.indexOf(k.id) === 0) || soleHere;
          return '<div class="ss-row"><span>🔑 Appareil <code>' + esc(k.id) + '…</code>'
            + (here ? '<span class="ss-here"> · cet appareil ✓</span>' : '')
            + '<span class="ss-mut"> — ajouté ' + esc(_ago(k.created)) + '</span></span>'
            + '<button class="ss-del" data-pk="' + esc(k.id) + '" type="button">Retirer</button></div>';
        }).join('')
        : '<div class="ss-mut">Aucun appareil Face ID.' + (canEnroll
          ? ' Active-le pour te connecter d\'un regard <b>et</b> débloquer l\'auto-connexion sur toutes tes apps + ton espace privé.'
          : ' (Face ID non disponible sur cet appareil.)') + '</div>';
      /* Action selon l'état de CET appareil (fin du bouton « Activer » qui s'affiche à vie
         et empile des doublons — cf. capture Kevin 4 clés) :
         - déjà enrôlé ici → statut vert « actif » + petit lien pour un AUTRE appareil ;
         - pas encore reconnu → si des passkeys existent, on tente d'abord une assertion
           (Face ID) qui RECONNAÎT ce téléphone sans créer de doublon, sinon on enrôle. */
      var actBtn = '';
      if (canEnroll && enrolledHere) {
        actBtn = '<div class="ss-ok" id="ss-active">✅ Face ID est actif sur cet appareil</div>'
          + '<button class="ss-act ss-sub" id="ss-enroll" type="button">➕ Ajouter un autre appareil</button>';
      } else if (canEnroll) {
        actBtn = '<button class="ss-act" id="ss-enroll" type="button" style="border-color:rgba(232,184,48,.5);color:var(--gold2,#f6d97a)">'
          + (pk.length ? '🔎 Activer / vérifier Face ID sur cet appareil' : '➕ Activer Face ID sur cet appareil') + '</button>';
      }
      el.innerHTML = '<b>📱 Mes appareils Face ID</b>' + rows + actBtn
        + (pk.length ? '<button class="ss-act" id="ss-revoke" type="button">🚪 Déconnecter mes autres appareils</button>' : '');
      var en = document.getElementById('ss-enroll');
      if (en) en.addEventListener('click', function () {
        var addMore = enrolledHere; /* clic « Ajouter un autre appareil » → on CRÉE un nouveau passkey */
        en.disabled = true; en.textContent = '…';
        var step = (!addMore && pk.length && window.kdmcSSO.loginPasskey)
          ? window.kdmcSSO.loginPasskey(_ssUid).then(function (v) {
              if (v && v.ok && v.credId) { if (_ssUid) _setPasskey(_ssUid, v.credId); return { ok: true }; }
              return window.kdmcSSO.registerPasskey(); /* pas de passkey sur ce téléphone → on enrôle */
            })
          : window.kdmcSSO.registerPasskey();
        step.then(function (r) {
          if (r && r.ok) { try { if (_ssUid) _setPasskey(_ssUid, r.credId); } catch (e) { /* */ } loadMyPasskeys(); applyAdminVisibility(); }
          else { en.disabled = false; en.textContent = '➕ Activer Face ID — réessaie (' + ((r && r.reason) || 'annulé') + ')'; }
        });
      });
      var rv = document.getElementById('ss-revoke');
      if (rv) rv.addEventListener('click', function () {
        if (!confirm('Déconnecter tous tes AUTRES appareils ?\n\nCE téléphone reste connecté ; les autres devront se reconnecter (Face ID ou code).')) return;
        rv.disabled = true; rv.textContent = '…';
        window.kdmcSSO.revokeMyOtherSessions().then(function (r) {
          rv.textContent = (r && r.ok) ? '✅ Autres appareils déconnectés' : '⚠️ Échec — réessaie';
          if (!(r && r.ok)) rv.disabled = false;
        });
      });
      el.querySelectorAll('.ss-del').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Retirer cet appareil Face ID ?\n\nTu pourras toujours te connecter avec ton nom + code.')) return;
          b.disabled = true; b.textContent = '…';
          window.kdmcSSO.deletePasskey(b.getAttribute('data-pk')).then(function (r) {
            if (r && r.ok) loadMyPasskeys();
            else { b.disabled = false; b.textContent = (r && r.reason === 'Face ID requis pour gérer tes appareils') ? '🔒 Face ID requis' : 'Réessaie'; }
          });
        });
      });
    });
  }
  function loadMyHistory() {
    var el = document.getElementById('ss-hist');
    if (!el || !window.kdmcSSO || !window.kdmcSSO.myHistory) return;
    window.kdmcSSO.myHistory().then(function (j) {
      if (!el) return;
      if (!j || !j.ok) { el.innerHTML = ''; return; }
      var hist = (j.history || []).slice(0, 60);
      if (!hist.length) {
        el.innerHTML = '<b>🕘 Mes connexions</b><div class="ss-mut">Aucune connexion enregistrée pour l\'instant.</div>';
        return;
      }
      /* Dossiers repliables PAR JOUR (au lieu d'une longue liste). Aujourd'hui ouvert,
         les autres jours repliés → 1 tap pour dérouler. */
      var groups = [], byDay = {};
      hist.forEach(function (e) {
        var k = _dayKey(e.ts);
        if (!byDay[k]) { byDay[k] = { ts: e.ts, items: [] }; groups.push(byDay[k]); }
        byDay[k].items.push(e);
      });
      var todayK = _dayKey(Date.now());
      var folders = groups.map(function (g, i) {
        var open = (i === 0 || _dayKey(g.ts) === todayK) ? ' open' : '';
        var rows = g.items.map(function (e) {
          return '<div class="ss-hrow">' + esc(_hm(e.ts)) + ' · <b>' + esc(_appNm(e.app)) + '</b>'
            + ' <span class="ss-dur">⏱ ' + esc(_dur((e.end || e.ts) - e.ts)) + '</span>'
            + (e.place ? ' <span class="ss-mut">· ' + esc(e.place) + '</span>' : '') + '</div>';
        }).join('');
        return '<details class="ss-fold"' + open + '><summary>📅 ' + esc(_dayLabel(g.ts))
          + ' <span class="ss-mut">· ' + g.items.length + ' connexion' + (g.items.length > 1 ? 's' : '') + '</span></summary>'
          + rows + '</details>';
      }).join('');
      el.innerHTML = '<b>🕘 Mes connexions</b>'
        + '<div class="ss-mut" style="margin:2px 0 8px">' + (j.hits || 0) + ' au total · touche un jour pour le détail.</div>'
        + folders;
    });
  }

  /* `deja` (10.10, réactivité) : le résultat whoami que l'appelant vient de lire. Sans lui, l'accueil redemandait whoami EN SÉRIE
     (mesuré : 2 allers-retours avant de voir les tuiles, 3,3 s sur réseau mobile + processeur lent). */
  function showHub(name, deja) {
    var suite = function (r) {
      /* 8.10 (revue extérieure) : un compte sans code renvoyé vers l'app AVANT l'écran du code = ping-pong app ⇄ portail.
         Le domaine a le dernier mot : code_requis → l'écran bloquant, et on ne repart pas. */
      if (r && r.state === 'code_requis') { renderCodeObligatoire(r.session); return; }
      /* 10.10 : inscrit sans WhatsApp, pas encore ouvert par l'administrateur → l'écran d'attente, et on ne repart PAS vers l'app
         (elle refuserait : ping-pong). Le domaine a le dernier mot (whoami.attente_admin). */
      if (r && r.state === 'session' && r.session && r.session.attente_admin) { renderAttenteAdmin(r.session); return; }
      if (gotoReturnIfAny()) return; /* session posée → on rebascule dans l'app */
      if (hello) hello.textContent = name ? ('Bonjour ' + name) : 'Bienvenue';
      hide(gate); show(hub);
      applyAdminVisibility(r);
      maybeOfferInstall();
      /* la tuile touchée part sans attendre : le laissez-passer est lu pendant que Kevin regarde l'accueil */
      if (r && r.state === 'session' && window.kdmcSSO && window.kdmcSSO.prechargerPorte) { try { window.kdmcSSO.prechargerPorte(); } catch (e) { /* */ } }
    };
    if (deja && deja.state) { suite(deja); return; }
    if (window.kdmcSSO && window.kdmcSSO.whoamiResult) { window.kdmcSSO.whoamiResult().then(suite).catch(function () { suite(null); }); } else { suite(null); }
  }

  function cguBlock() {
    // Kevin « CGU le plus bref, vague possible » + « pas de CGU pas de connexion ».
    // Texte minimal/vague ; la case reste OBLIGATOIRE (doCreate bloque si non cochée).
    return '<label class="cgu"><input type="checkbox" id="cgu-ok"> '
      + 'J\'accepte les <a href="#" id="cgu-link">conditions</a>.</label>'
      + '<div id="cgu-text" class="cgu-text" hidden>'
      + 'Un seul compte pour toutes les apps KDMC. Tes informations restent privées et ne servent qu\'à te reconnaître. '
      + 'Tu peux te déconnecter ou demander l\'effacement quand tu veux.</div>';
  }
  /* Le texte vient du domaine (/__sso/cgu) : UN texte pour toutes les apps ; celui ci-dessus n'est
     que le repli hors ligne. */
  function chargerCgu() {
    if (!window.kdmcSSO || !window.kdmcSSO.cgu) return;
    window.kdmcSSO.cgu().then(function (j) { var t = document.getElementById('cgu-text'); if (!(j && j.ok && j.texte && t)) return;
      /* 7.10 (Kevin : « toutes les autorisations et informations nécessaires dans les CGU, sommairement ») : le texte + la liste du domaine */
      t.textContent = j.texte;
      if (Array.isArray(j.points) && j.points.length) { var ul = document.createElement('ul'); j.points.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); }); t.appendChild(ul); } });
  }

  function renderCreate() {
    /* « J'AI DÉJÀ UN COMPTE » — Face ID d'abord (26.09.2026, mesuré sur le parcours de l'iPhone
       de Kevin) : une app de l'écran d'accueil a un stockage VIDE ; « Me connecter » l'amenait
       ici, et la page ne proposait QUE « Créer mon compte » — Kevin, admin, ne pouvait pas
       rentrer (son Face ID refusé sur une session nouvelle, par sécurité). Le passkey du
       trousseau iCloud, lui, est là : Face ID le retrouve sans qu'on sache encore qui c'est. */
    var pk = _pkSupported();
    gate.innerHTML =
      (pk ? '<button class="btn" id="f-pk" type="button">🔓 J\'ai déjà un compte — Face ID</button>'
        + '<p class="g-err" id="f-pk-err" role="alert" aria-live="polite"></p>'
        + '<p class="g-sub" style="text-align:center;margin:10px 0 14px">— ou, première fois ici —</p>' : '')
      + '<button class="btn ghost" id="f-deja" type="button">🔑 J\'ai déjà un compte — nom + code</button>'
      + '<div id="f-deja-box" hidden>'
      +   '<input class="fld" id="l-nom" type="text" autocomplete="username" placeholder="Prénom et nom">'
      +   '<input class="fld" id="l-code" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Ton code">'
      +   '<button class="btn" id="l-go" type="button">Me connecter</button>'
      +   '<p class="g-err" id="l-err" role="alert" aria-live="polite"></p>'
      + '</div>'
      /* « Je suis l'administrateur » RETIRÉ (Kevin 10.10 : « inutile si je suis reconnu auto ») : Kevin est reconnu par Face ID, et
         sur un appareil neuf il tape simplement son nom + son code admin dans « J'ai déjà un compte » — c'est le DOMAINE qui
         reconnaît son nom (admin_requis) et juge le code. Le bloc reste caché, ouvert seulement quand le domaine le demande. */
      + adminBlock()
      + '<p class="g-sub" style="text-align:center;margin:10px 0 14px">— ou, première fois ici —</p>'
      + '<h2 class="g-title">Créer mon compte KDMC</h2>'
      + '<p class="g-sub">Première connexion. Un seul compte pour tout ton univers.</p>'
      + '<input class="fld" id="f-prenom" type="text" autocomplete="given-name" placeholder="Prénom" inputmode="text">'
      + '<input class="fld" id="f-nom" type="text" autocomplete="family-name" placeholder="Nom">'
      + '<input class="fld" id="f-code" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Code secret (6 chiffres min.)">'
      + '<input class="fld" id="f-code2" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Confirme le code">'
      + cguBlock()
      + '<button class="btn" id="f-create">Créer mon compte</button>'
      + '<p class="g-err" id="f-err" role="alert" aria-live="polite"></p>'
      + telBlock();
    wireCgu();
    document.getElementById('f-create').addEventListener('click', doCreate);
    wireTel();
    telExige();   /* lue d'avance (voir telExige) */
    document.getElementById('f-deja').addEventListener('click', function () {
      var box = document.getElementById('f-deja-box'); box.hidden = !box.hidden;
      if (!box.hidden) document.getElementById('l-nom').focus();
    });
    document.getElementById('l-go').addEventListener('click', doLoginCode);
    wireAdmin();
    document.getElementById('l-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLoginCode(); });
    var bpk = document.getElementById('f-pk');
    if (bpk) bpk.addEventListener('click', function () {
      bpk.disabled = true; bpk.textContent = '…';
      window.kdmcSSO.loginPasskey().then(function (j) {
        if (j && j.ok && j.uid) { _setPasskey(j.uid, j.credId); showHub(j.name || ''); return; }
        document.getElementById('f-pk-err').textContent = 'Face ID : ' + ((j && j.reason) || 'échec')
          + '. Aucun compte avec Face ID sur cet appareil ? Crée-le ci-dessous.';
        bpk.disabled = false; bpk.textContent = '🔓 J\'ai déjà un compte — Face ID';
      });
    });
  }

  function renderUnlock(acc) {
    var hasPk = _hasPasskey(acc.uid) && _pkSupported();
    gate.innerHTML =
      '<h2 class="g-title">Bonjour ' + esc(acc.name.split(' ')[0]) + '</h2>'
      + '<p class="g-sub">' + (hasPk ? 'Déverrouille avec Face ID, ou ton code.' : 'Entre ton code pour ouvrir ton univers KDMC.') + '</p>'
      + (hasPk ? '<button class="btn" id="u-pk">🔓 Se connecter avec Face ID</button>' : '')
      + '<input class="fld" id="u-code" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Code secret"' + (hasPk ? ' style="margin-top:8px"' : '') + '>'
      + '<button class="btn' + (hasPk ? ' ghost' : '') + '" id="u-go">' + (hasPk ? 'Utiliser mon code' : 'Se connecter') + '</button>'
      + '<button class="btn ghost" id="u-other">Ce n\'est pas moi</button>'
      + '<p class="g-err" id="u-err" role="alert" aria-live="polite"></p>';
    if (hasPk) document.getElementById('u-pk').addEventListener('click', function () {
      var b = document.getElementById('u-pk'); b.disabled = true; b.textContent = '…';
      window.kdmcSSO.loginPasskey(acc.uid).then(function (j) {
        if (j && j.ok) { showHub(acc.name); }
        else { document.getElementById('u-err').textContent = 'Face ID : ' + ((j && j.reason) || 'échec') + ' — utilise ton code.'; b.disabled = false; b.textContent = '🔓 Se connecter avec Face ID'; }
      });
    });
    document.getElementById('u-go').addEventListener('click', function () { doUnlock(acc); });
    document.getElementById('u-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') doUnlock(acc); });
    document.getElementById('u-other').addEventListener('click', function () {
      if (confirm('Créer un autre compte sur cet appareil ? (ton compte actuel reste enregistré)')) renderCreate();
    });
  }

  function wireCgu() {
    chargerCgu();
    var link = document.getElementById('cgu-link');
    if (link) link.addEventListener('click', function (e) { e.preventDefault(); var t = document.getElementById('cgu-text'); if (t) t.hidden = !t.hidden; });
  }

  /* ── CONFIRMATION DU TÉLÉPHONE PAR WHATSAPP (9.10, gratuite) ─────────────────────────────────────────────
     La personne envoie « KDMC DXXXXXXX » depuis WhatsApp (lien prérempli), le domaine lui RÉPOND un code à 6
     chiffres, elle le tape ici. Le domaine juge (/__sso/tel/verifie) et rend une preuve signée que l'inscription
     emporte. Cette page ne range ni le code ni la preuve : tout reste en mémoire le temps de l'inscription. */
  var _validation = '', _telPreuve = '', _telDemande = '', _telJeton = '', _telFin = 0, _telHorloge = null, _telEcoute = null;
  function telBlock() {
    var cases = '';
    for (var i = 1; i <= 6; i++) cases += '<input class="fld t-case" type="text" inputmode="numeric" maxlength="6"' + (i === 1 ? ' autocomplete="one-time-code"' : '') + ' aria-label="Chiffre ' + i + '">';
    return '<div id="t-box" hidden>'
      + '<h2 class="g-title">Confirme ton téléphone</h2>'
      + '<p class="g-sub">Gratuit, par WhatsApp : ouvre WhatsApp et envoie le message déjà écrit. <b>C\'est tout</b> — cette page se valide toute seule. (Sinon, tape le code à 6 chiffres reçu en réponse.)</p>'
      + '<a class="btn" id="t-wa" href="#" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Ouvrir WhatsApp</a>'
      + '<div class="t-otp" role="group" aria-label="Code à 6 chiffres" style="display:flex;gap:6px;margin:12px 0 4px">' + cases + '</div>'
      + '<p class="g-sub" id="t-infos" style="display:flex;justify-content:space-between;gap:8px"><span id="t-min"></span><span id="t-ess"></span></p>'
      + '<p class="g-sub" id="t-attente" aria-live="polite" style="text-align:center">⏳ En attente de ton message WhatsApp…</p>'
      + '<button class="btn" id="t-go" type="button">Confirmer et créer mon compte</button>'
      + '<button class="btn ghost" id="t-new" type="button" hidden>Recevoir un nouveau code</button>'
      + '<p class="g-err" id="t-err" role="alert" aria-live="polite"></p>'
      /* 10.10 (Kevin : « Si pas de WhatsApp, validation admin. Au choix ») : l'autre chemin, au choix de la personne. */
      + '<button class="btn ghost" id="t-admin" type="button">Je n\'ai pas WhatsApp — demander la validation à l\'administrateur</button>'
      + '<p class="g-sub" style="text-align:center;font-size:12.5px">Ton compte sera créé tout de suite, et ouvert dès que l\'administrateur l\'aura accepté.</p>'
      + '</div>';
  }
  function _tCases() { return [].slice.call(document.querySelectorAll('#t-box .t-case')); }
  function _tSaisi() { return _tCases().map(function (c) { return c.value; }).join(''); }
  function _tDit(t) { var e = document.getElementById('t-err'); if (e) e.textContent = t || ''; }
  function _tMin(fin) { var s = Math.max(0, Math.ceil((fin - Date.now()) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  /* 10.10 (réactivité) : la question « le domaine exige-t-il le téléphone ? » est posée dès que l'écran d'inscription s'affiche,
     pendant que la personne tape son nom — « Créer mon compte » n'attend plus cet aller-retour (mesuré : 1,5 s de moins).
     Une réponse ratée n'est pas gardée (la suivante redemande) ; et si le domaine l'exige quand même, /issue répond tel_requis. */
  var _telEtatP = null;
  function telExige() {
    if (_telEtatP) return _telEtatP;
    var p = _telEtatP = fetch('/__sso/tel/etat', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(function (j) { return !!(j && j.obligatoire); })
      .catch(function () { if (_telEtatP === p) _telEtatP = null; return false; });
    return p;
  }
  function telDemarrer() {
    var box = document.getElementById('t-box'); if (!box) return;
    _tDit('');
    fetch('/__sso/tel/demande', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { box.hidden = false; _tDit((j && j.message) || 'Ça n\'a pas marché. Réessaie.'); document.getElementById('t-new').hidden = false; return; }
        _telDemande = j.demande; _telJeton = j.jeton || ''; _telFin = Date.now() + j.validite_s * 1000;
        telEcouter();
        document.getElementById('t-wa').href = j.lien;
        document.getElementById('t-ess').textContent = j.essais + ' essais';
        document.getElementById('t-min').textContent = 'Code valable encore ' + _tMin(_telFin);
        document.getElementById('t-go').disabled = false; document.getElementById('t-new').hidden = true;
        _tCases().forEach(function (c) { c.value = ''; });
        box.hidden = false;
        try { box.scrollIntoView({ block: 'start' }); } catch (e) { /* */ }
        clearInterval(_telHorloge);
        _telHorloge = setInterval(function () {
          var reste = _telFin - Date.now();
          document.getElementById('t-min').textContent = reste > 0 ? 'Code valable encore ' + _tMin(_telFin) : 'Code expiré';
          if (reste <= 0) { clearInterval(_telHorloge); document.getElementById('t-go').disabled = true; document.getElementById('t-new').hidden = false; }
        }, 1000);
      })
      .catch(function () { box.hidden = false; _tDit('Le domaine ne répond pas. Réessaie dans un instant.'); });
  }
  /* VALIDATION AUTOMATIQUE : la page demande au domaine « mon message est-il arrivé ? » toutes les 4 s (en pause quand
     l'écran est caché, arrêt à l'expiration). Dès qu'il est arrivé, le domaine rend la preuve et le compte se crée tout seul. */
  function telArreterEcoute() { clearInterval(_telEcoute); _telEcoute = null; }
  function telEcouter() {
    telArreterEcoute();
    if (!_telJeton) return;
    var enCours = false;
    _telEcoute = setInterval(function () {
      if (enCours || document.hidden) return;
      if (Date.now() > _telFin || _telPreuve) { telArreterEcoute(); return; }
      enCours = true;
      fetch('/__sso/tel/statut', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r: _telDemande, jeton: _telJeton }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && j.confirme && j.preuve) { telArreterEcoute(); telReussi(j); return; }
          if (j && j.reason === 'tel_plein') { telArreterEcoute(); _tDit(j.message); }
          if (j && j.ok && j.encore === false && !j.confirme) telArreterEcoute();
        })
        .catch(function () { /* réseau : on réessaie au prochain tour */ })
        .then(function () { enCours = false; });
    }, 4000);
  }
  function telReussi(j) {
    _telPreuve = j.preuve; clearInterval(_telHorloge);
    _tDit(''); document.getElementById('t-box').hidden = true;
    document.getElementById('f-err').textContent = 'Téléphone confirmé ✓ ' + (j.tel_masque || '');
    doCreate();
  }
  function telValider() {
    var code6 = _tSaisi(), go = document.getElementById('t-go');
    if (code6.length !== 6 || go.disabled) return;
    go.disabled = true;
    fetch('/__sso/tel/verifie', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r: _telDemande, code: code6 }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.preuve) { telArreterEcoute(); telReussi(j); return; }
        if (j && j.reason === 'code_faux') {
          var n = j.essais_restants;
          _tDit('Code incorrect. ' + n + ' essai' + (n > 1 ? 's' : '') + ' restant' + (n > 1 ? 's' : '') + '.');
          document.getElementById('t-ess').textContent = n + ' essai' + (n > 1 ? 's' : '');
          _tCases().forEach(function (c) { c.value = ''; }); _tCases()[0].focus(); go.disabled = false; return;
        }
        _tDit((j && j.message) || 'Ça n\'a pas marché.');
        if (j && (j.reason === 'trop_essais' || j.reason === 'expire')) { clearInterval(_telHorloge); document.getElementById('t-new').hidden = false; }
        else go.disabled = false;
      })
      .catch(function () { go.disabled = false; _tDit('Le domaine ne répond pas. Réessaie.'); });
  }
  function wireTel() {
    var cs = _tCases(); if (!cs.length) return;
    cs.forEach(function (c, i) {
      c.addEventListener('input', function () {
        var ch = String(c.value || '').replace(/\D/g, '');
        if (ch.length > 1) {   /* collage, ou code proposé par iOS : 6 chiffres = depuis la 1re case, où qu'on ait collé */
          var depart = ch.length >= 6 ? 0 : i;
          ch.slice(0, 6).split('').forEach(function (d, k) { if (cs[depart + k]) cs[depart + k].value = d; });
        } else c.value = ch;
        var vide = cs.filter(function (x) { return !x.value; })[0];
        if (vide && c.value) vide.focus();
        if (_tSaisi().length === 6) telValider();
      });
      c.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !c.value && i > 0) { cs[i - 1].value = ''; cs[i - 1].focus(); } });
    });
    document.getElementById('t-go').addEventListener('click', telValider);
    document.getElementById('t-new').addEventListener('click', telDemarrer);
    var ta = document.getElementById('t-admin');
    if (ta) ta.addEventListener('click', function () {
      telArreterEcoute(); clearInterval(_telHorloge); _tDit('');
      _validation = 'admin';
      document.getElementById('t-box').hidden = true;
      doCreate();
    });
  }

  function doCreate() {
    var prenom = (document.getElementById('f-prenom').value || '').trim();
    var nom = (document.getElementById('f-nom').value || '').trim();
    var code = (document.getElementById('f-code').value || '').trim();
    var code2 = (document.getElementById('f-code2').value || '').trim();
    var cgu = document.getElementById('cgu-ok').checked;
    var err = document.getElementById('f-err');
    err.textContent = '';
    if (prenom.length < 2 || nom.length < 2) { err.textContent = 'Prénom ET nom requis (sécurité).'; return; }
    if (code.length < 6) { err.textContent = 'Code trop court (6 chiffres minimum).'; return; }
    if (code !== code2) { err.textContent = 'Les deux codes ne correspondent pas.'; return; }
    if (!cgu) { err.textContent = 'Merci d\'accepter les conditions pour continuer.'; return; }
    /* Téléphone d'abord (9.10, Kevin « OTP pour toutes inscriptions ») — seulement si le domaine l'exige (WhatsApp branché). */
    if (!_telPreuve && _validation !== 'admin') {
      var btn0 = document.getElementById('f-create'); btn0.disabled = true; btn0.textContent = 'Vérification…';   /* 10.10 : réaction immédiate (le domaine répond en 1-2 s sur mobile) */
      return telExige().then(function (oblig) {
        btn0.disabled = false; btn0.textContent = 'Créer mon compte';
        if (oblig) { telDemarrer(); return; }
        creerCompte(prenom, nom, code);
      });
    }
    creerCompte(prenom, nom, code);
  }

  function creerCompte(prenom, nom, code) {
    var err = document.getElementById('f-err');
    var name = prenom + ' ' + nom;
    var uid = slug(name) || ('u-' + Date.now());
    var salt = rndSalt();
    var btn = document.getElementById('f-create'); btn.disabled = true; btn.textContent = 'Création…';
    hashCode(code, salt).then(function (h) {
      var acc = { uid: uid, name: name, salt: salt, codeHash: h, created: Date.now() };
      ls(LS_ACCOUNT, acc);
      ls(LS_CGU, { at: Date.now(), v: 1 });
      /* 4e argument = l'app d'où la personne vient (?return=) : le domaine ouvre son
         NOUVEAU compte à cette app-là, pas au portail (qui n'est que la réception). */
      /* Le CODE part au domaine (27.09) : il en garde l'empreinte, et le même nom + code
         marchera sur tous les appareils et dans toutes les apps. */
      if (!window.kdmcSSO || !window.kdmcSSO.issueDetail) return acc;
      return window.kdmcSSO.issueDetail(uid, name, true, safeReturnUrl(), code, _telPreuve, _telPreuve ? '' : _validation).then(function (j) {
        if (j && !j.ok && (j.reason === 'code_requis' || j.reason === 'code_incorrect')) {
          localStorage.removeItem(LS_ACCOUNT);
          throw { deja: true };
        }
        /* le domaine exige le téléphone (ou la preuve a expiré) : on ouvre l'étape, rien n'est créé */
        if (j && !j.ok && j.reason === 'tel_requis') { localStorage.removeItem(LS_ACCOUNT); _telPreuve = ''; _validation = ''; throw { tel: true }; }
        if (j && !j.ok && j.message) throw { message: j.message };
        if (j && j.ok && j.admin_requis) { localStorage.removeItem(LS_ACCOUNT); throw { admin: true }; }
        /* 7.10 (Kevin : « aucune connexion au domaine ou app sans inscription complète et accord ») : plus de compte « local » quand le
           domaine ne répond pas — il n'existerait nulle part ailleurs. Et l'accord coché ici part au domaine, une fois pour toutes. */
        if (!j || !j.ok) { localStorage.removeItem(LS_ACCOUNT); throw { message: 'Le domaine ne répond pas : ton compte n\'a pas pu être créé. Réessaie dans un instant.' }; }
        if (window.kdmcSSO.accepterCgu) return window.kdmcSSO.accepterCgu().then(function (c) { try { if (c && c.ok) localStorage.setItem('kdmc_cgu_v', String(c.version || '')); } catch (_) { /* */ } return acc; }, function () { return acc; });
        return acc;
      });
    }).then(function (acc) {
      _postLogin(acc);
    }).catch(function (e) {
      if (e && e.admin) { btn.disabled = false; btn.textContent = 'Créer mon compte'; montrerAdmin('Tu es l\'administrateur : entre ton code admin, tu seras reconnu partout.'); return; }
      if (e && e.tel) { btn.disabled = false; btn.textContent = 'Créer mon compte'; telDemarrer(); return; }
      err.textContent = (e && e.deja) ? 'Ce nom a déjà un compte. Touche « J\'ai déjà un compte — nom + code » ci-dessus.'
        : ((e && e.message) || 'Erreur, réessaie.');
      btn.disabled = false; btn.textContent = 'Créer mon compte';
    });
  }

  /* JE SUIS L'ADMINISTRATEUR (Kevin 27.09.2026 : « reconnu par n'importe quel chemin sur mes
     appareils : domaine, chaque app, internet, bureau »). Sur un appareil sans Face ID (le PC, un
     navigateur neuf), le code admin — vérifié par le domaine, jamais gardé ici — donne la session
     vérifiée de l'admin, reconnue par toutes les apps ; on propose ensuite Face ID / Windows Hello
     pour ne plus jamais le retaper sur cet appareil. */
  function adminBlock() {
    return '<div id="f-admin-box" hidden>'
      + '<input class="fld" id="a-code" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="Code administrateur">'
      + '<button class="btn" id="a-go" type="button">Me reconnaître partout</button>'
      + '<p class="g-err" id="a-err" role="alert" aria-live="polite"></p>'
      + '</div>';
  }
  function wireAdmin() {
    /* le bouton visible n'existe plus (10.10) : le champ caché doit rester branché, il s'ouvre quand le domaine le demande */
    var b = document.getElementById('f-admin');
    if (b) b.addEventListener('click', function () { montrerAdmin(); });
    if (!document.getElementById('a-go')) return;
    document.getElementById('a-go').addEventListener('click', doAdminCode);
    document.getElementById('a-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdminCode(); });
  }
  function montrerAdmin(message) {
    var box = document.getElementById('f-admin-box'); if (!box) return;
    box.hidden = false;
    if (message) document.getElementById('a-err').textContent = message;
    try { document.getElementById('a-code').focus(); } catch (e) { /* */ }
  }
  function doAdminCode() {
    var code = (document.getElementById('a-code').value || '').trim();
    var err = document.getElementById('a-err'); err.textContent = '';
    if (!code) { err.textContent = 'Ton code administrateur.'; return; }
    var b = document.getElementById('a-go'); b.disabled = true; b.textContent = '…';
    window.kdmcSSO.adminCode(code).then(function (j) {
      document.getElementById('a-code').value = '';
      if (!j || !j.ok) {
        err.textContent = (j && j.reason === 'rate_limited') ? 'Trop d\'essais. Réessaie dans ' + Math.ceil((j.wait || 900) / 60) + ' min.' : 'Code administrateur incorrect.';
        b.disabled = false; b.textContent = 'Me reconnaître partout'; return;
      }
      /* Le compte admin est gardé sur CET appareil (sans code) : la prochaine fois, Face ID —
         ou de nouveau le code admin (jamais un « code de compte » pour l'admin). */
      var acc = { uid: j.uid || 'kdmc_admin', name: 'Kevin Desarzens', salt: '', codeHash: '', admin: true, created: Date.now() };
      ls(LS_ACCOUNT, acc); ls(LS_CGU, { at: Date.now(), v: 1 });
      _postLogin(acc);
    });
  }

  /* Appareil NEUF (ou app installée au stockage vide) : nom + code vérifiés par le domaine.
     Réussi → on garde aussi le compte sur CET appareil, pour que la prochaine fois le code
     (ou Face ID) suffise, sans retaper le nom. */
  function doLoginCode() {
    var nom = (document.getElementById('l-nom').value || '').trim();
    var code = (document.getElementById('l-code').value || '').trim();
    var err = document.getElementById('l-err'); err.textContent = '';
    if (nom.split(/\s+/).length < 2) { err.textContent = 'Prénom ET nom.'; return; }
    if (code.length < 6) { err.textContent = 'Ton code (6 caractères minimum).'; return; }
    var b = document.getElementById('l-go'); b.disabled = true; b.textContent = '…';
    window.kdmcSSO.login(nom, code).then(function (j) {
      /* 10.10 : le domaine reconnaît le nom de l'administrateur → le code tapé part comme code ADMIN, jugé par le domaine
         (une seule étape sur un appareil neuf, plus de bouton « Je suis l'administrateur »). */
      if (j && !j.ok && j.reason === 'admin_requis' && window.kdmcSSO.adminCode) {
        return window.kdmcSSO.adminCode(code).then(function (a) {
          document.getElementById('l-code').value = '';
          if (!a || !a.ok) { err.textContent = 'Nom ou code incorrect.'; b.disabled = false; b.textContent = 'Me connecter'; return; }
          _postLogin({ uid: a.uid || 'kdmc_admin', name: a.name || nom });
        });
      }
      /* 8.10 : compte sans code, appareil inconnu → le code proposé attend l'administrateur (le message vient du domaine) */
      if (!j || !j.ok) { err.textContent = (j && j.message) || 'Nom ou code incorrect.'; b.disabled = false; b.textContent = 'Me connecter'; return; }
      var salt = rndSalt();
      return hashCode(code, salt).then(function (h) {
        var acc = { uid: j.uid, name: j.name, salt: salt, codeHash: h, created: Date.now() };
        ls(LS_ACCOUNT, acc); ls(LS_CGU, { at: Date.now(), v: 1 });
        _postLogin(acc);   /* → showHub → retour dans l'app d'origine (liste des apps qui lisent le laissez-passer) */
      });
    });
  }

  /* KEVIN RECONNU PARTOUT (Kevin 5.10.2026 : « je me connecte à mon domaine, et CMCteams / la light me
     redemandent nom, prénom, U… »). MESURÉ : le portail ouvrait Kevin avec une session seulement DÉCLARÉE
     (son ancien code de compte, ou un nom) — le domaine le signalait (admin_requis) et le portail l'ignorait.
     Les apps n'ouvrent l'admin qu'à une session PROUVÉE : elles lui redemandaient tout. Désormais, dès que la
     session est celle de Kevin sans preuve, le portail demande la preuve UNE fois : Face ID (sa clé d'accès)
     ou le code admin — et toutes les apps le reconnaissent ensuite. La liste ci-dessous ne sert qu'à
     l'AFFICHAGE : la preuve reste décidée par le domaine (whoami verified/admin), jamais ici. */
  var UID_KEVIN = { 'kdmc_admin': 1, 'kevin-desarzens': 1 };
  function _kevinNonProuve(sess) { return !!(sess && sess.uid && UID_KEVIN[sess.uid] && !sess.verified); }
  function renderPreuveAdmin(message) {
    var pk = _pkSupported();
    gate.innerHTML = '<h2 class="g-title">Bonjour Kevin</h2>'
      + '<p class="g-sub">' + esc(message || 'Pour être reconnu tout seul dans CMCteams, la light et toutes tes apps, prouve que c\'est toi une fois : Face ID, ou ton code admin.') + '</p>'
      + (pk ? '<button class="btn" id="pa-pk" type="button">🔓 Face ID — ma clé d\'accès</button>' : '')
      + '<input class="fld" id="a-code" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="Code administrateur"' + (pk ? ' style="margin-top:8px"' : '') + '>'
      + '<button class="btn' + (pk ? ' ghost' : '') + '" id="a-go" type="button">Me reconnaître partout</button>'
      + '<p class="g-err" id="a-err" role="alert" aria-live="polite"></p>'
      + '<button class="btn ghost" id="pa-plus-tard" type="button">Plus tard</button>';
    show(gate); hide(hub);
    document.getElementById('a-go').addEventListener('click', doAdminCode);
    document.getElementById('a-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdminCode(); });
    document.getElementById('pa-plus-tard').addEventListener('click', function () { var a0 = lg(LS_ACCOUNT, null); showHub((a0 && a0.name) || 'Kevin Desarzens'); });
    var b = document.getElementById('pa-pk');
    if (b) b.addEventListener('click', function () {
      b.disabled = true; b.textContent = '…';
      window.kdmcSSO.loginPasskey().then(function (j) {
        if (j && j.ok && j.verified !== false && UID_KEVIN[j.uid]) {
          ls(LS_ACCOUNT, { uid: j.uid, name: 'Kevin Desarzens', salt: '', codeHash: '', admin: true, created: Date.now() });
          _setPasskey(j.uid, j.credId); showHub('Kevin Desarzens'); return;
        }
        document.getElementById('a-err').textContent = 'Face ID : ' + ((j && j.reason) || (j && j.ok ? 'ce n\'est pas la clé de l\'admin' : 'échec')) + ' — utilise ton code admin.';
        b.disabled = false; b.textContent = '🔓 Face ID — ma clé d\'accès';
      });
    });
  }

  function doUnlock(acc) {
    var code = (document.getElementById('u-code').value || '').trim();
    var err = document.getElementById('u-err'); err.textContent = '';
    if (!code) { err.textContent = 'Entre ton code.'; return; }
    var btn = document.getElementById('u-go'); btn.disabled = true; btn.textContent = '…';
    if (acc.admin || !acc.codeHash) {
      /* Compte admin sur cet appareil : le code tapé est le code ADMIN, vérifié par le domaine. */
      return window.kdmcSSO.adminCode(code).then(function (j) {
        document.getElementById('u-code').value = '';
        if (!j || !j.ok) { err.textContent = 'Code administrateur incorrect.'; btn.disabled = false; btn.textContent = 'Se connecter'; return; }
        _postLogin(acc);
      });
    }
    /* 8.10 (revue extérieure, règle d'or 8 : « une page ne vérifie jamais un code elle-même ») : le code part AU DOMAINE, qui seul
       le juge. L'ancienne empreinte locale (PBKDF2, d'avant le 27.09) ne sert plus qu'au repli SANS client SSO (jamais sur le domaine). */
    var local = function () {
      return hashCode(code, acc.salt).then(function (h) {
        if (!timingEq(h, acc.codeHash)) { err.textContent = 'Code incorrect.'; btn.disabled = false; btn.textContent = 'Se connecter'; return; }
        _postLogin(acc);
      });
    };
    if (!window.kdmcSSO || !window.kdmcSSO.issueDetail) return local().catch(function () { err.textContent = 'Erreur, réessaie.'; btn.disabled = false; btn.textContent = 'Se connecter'; });
    Promise.resolve().then(function () {
      /* Le code part au domaine : la 1re fois, il y est enregistré (migration), ensuite c'est
         le domaine qui a le dernier mot (un code changé ailleurs l'emporte). */
      return window.kdmcSSO.issueDetail(acc.uid, acc.name, true, safeReturnUrl(), code).then(function (j) {
        /* (5.10.2026) Le domaine dit « c'est l'admin » : un code de compte n'en fait qu'une session DÉCLARÉE,
           que CMCteams et la light refusent. On demande la preuve au lieu d'ouvrir le portail à moitié. */
        if (j && j.ok && j.admin_requis) { renderPreuveAdmin(); return; }
        if (j && !j.ok && (j.reason === 'code_incorrect' || j.reason === 'trop_essais')) {
          err.textContent = j.reason === 'trop_essais' ? j.message : 'Ton code a été changé sur un autre appareil : utilise ce code-là.';
          btn.disabled = false; btn.textContent = 'Se connecter'; return;
        }
        /* 8.10 : compte sans code au domaine, appareil que le domaine ne connaît pas → le code attend l'administrateur (jamais une session sur un nom) */
        if (j && !j.ok && j.reason === 'code_en_attente') { err.textContent = j.message || 'Ton code est transmis à l\'administrateur : dès qu\'il l\'accepte, reconnecte-toi avec ton nom et ce code.'; btn.disabled = false; btn.textContent = 'Se connecter'; return; }
        if (j && !j.ok && j.reason === 'code_requis') { err.textContent = j.message || 'Ce compte a un code : entre-le.'; btn.disabled = false; btn.textContent = 'Se connecter'; return; }
        _postLogin(acc);
      });
    }).catch(function () { err.textContent = 'Erreur, réessaie.'; btn.disabled = false; btn.textContent = 'Se connecter'; });
  }

  /* ===== Passkey (Face ID) — fait de l'appareil une preuve d'identité FORTE ===== */
  var LS_PASSKEY = 'kdmc_passkey_v1';
  function _hasPasskey(uid) { try { return !!(lg(LS_PASSKEY, {})[uid]); } catch (e) { return false; } }
  /* Stocke le credId (b64u) du passkey de CET appareil (ou 1 si inconnu) → l'UI sait
     que ce téléphone est déjà enrôlé et n'affiche plus « Activer » (anti-doublon). */
  function _setPasskey(uid, credId) { try { var m = lg(LS_PASSKEY, {}); m[uid] = credId || m[uid] || 1; ls(LS_PASSKEY, m); } catch (e) { /* */ } }
  function _myCred(uid) { try { var v = lg(LS_PASSKEY, {})[uid]; return (typeof v === 'string') ? v : ''; } catch (e) { return ''; } }
  function _pkSupported() { return !!(window.kdmcSSO && window.kdmcSSO.supportsPasskey && window.kdmcSSO.supportsPasskey()); }
  /* Après connexion : propose l'enrôlement Face ID si supporté + pas déjà fait. */
  function _postLogin(acc, deja) {
    var skipped = false; try { skipped = !!sessionStorage.getItem('kdmc_pk_skip'); } catch (e) { /* */ }
    if (_pkSupported() && !_hasPasskey(acc.uid) && !skipped) { renderPasskeyOffer(acc); } else { showHub(acc.name, deja); }
  }
  function renderPasskeyOffer(acc) {
    hide(hub); show(gate); /* boot avec session existante : le hub peut être affiché → on remontre la porte */
    gate.innerHTML =
      '<h2 class="g-title">🔐 Active Face ID</h2>'
      + '<p class="g-sub">Reconnecte-toi sans code — et ton appareil devient ta <b>preuve d\'identité forte</b> sur tout KDMC (Face ID / Touch ID).</p>'
      + '<button class="btn" id="pk-go">Activer Face ID / Touch ID</button>'
      + '<button class="btn ghost" id="pk-skip">Plus tard</button>'
      + '<p class="g-err" id="pk-err" role="alert" aria-live="polite"></p>';
    document.getElementById('pk-skip').addEventListener('click', function () { try { sessionStorage.setItem('kdmc_pk_skip', '1'); } catch (e) { /* */ } showHub(acc.name); });
    document.getElementById('pk-go').addEventListener('click', function () {
      var b = document.getElementById('pk-go'); b.disabled = true; b.textContent = '…';
      window.kdmcSSO.registerPasskey().then(function (j) {
        if (j && j.ok) { _setPasskey(acc.uid, j.credId); showHub(acc.name); }
        else if (j && /code admin/i.test(j.reason || '')) { renderCreate(); montrerAdmin('Ce compte est protégé : entre ton code admin, puis active Face ID.'); }
        else { document.getElementById('pk-err').textContent = 'Face ID non activé (' + ((j && j.reason) || 'annulé') + '). Tu peux réessayer plus tard.'; b.disabled = false; b.textContent = 'Activer Face ID / Touch ID'; }
      });
    });
  }

  /* ---------------------------- PWA install ---------------------------- */
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function maybeOfferInstall() {
    if (!installWrap || isStandalone()) return;
    if (deferredPrompt) {
      installWrap.innerHTML = '<button class="btn install" id="pwa-go">📲 Installer KDMC sur mon appareil</button>';
      installWrap.hidden = false;
      document.getElementById('pwa-go').addEventListener('click', function () {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () { deferredPrompt = null; installWrap.hidden = true; });
      });
    } else if (isIOS()) {
      installWrap.innerHTML = '<div class="ios-tip">📲 Pour installer : appuie sur <b>Partager</b> puis <b>« Sur l\'écran d\'accueil »</b>.</div>';
      installWrap.hidden = false;
    }
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; if (hub && !hub.hidden) maybeOfferInstall(); });

  /* ---------------------------- Logout ---------------------------- */
  var lo = document.getElementById('logout');
  if (lo) lo.addEventListener('click', function () {
    if (window.kdmcSSO) window.kdmcSSO.logout();
    /* 8.10 (revue extérieure) : « Te déconnecter » laissait le cookie admin (kdmc_admin, 12 h) en place → on le retire aussi. Fail-safe. */
    try { fetch('/__admin/logout', { method: 'POST', credentials: 'include' }).catch(function () { /* */ }); } catch (e) { /* */ }
    hide(hub);
    var acc = lg(LS_ACCOUNT, null);
    if (acc) renderUnlock(acc); else renderCreate();
    show(gate);
  });

  /* SSO sur la tuile Apex Chat UNIQUEMENT : on injecte le pass signé FRAIS dans le
     fragment (#kdmc_sso=) — non envoyé aux serveurs ni journalisé. Indispensable
     iPhone : une PWA installée a ses cookies ISOLÉS, donc le cookie de session
     .kd-mc.com ne traverse pas ; Apex Chat se reconnaît via ce pass (Bearer) et sait
     CONSOMMER+nettoyer le fragment (_kdmcConsumeHashPass).
     ⚠ RESTREINT À apex-chat : les apps à routeur #hash qui NE consomment PAS le jeton
     (ex Apex AI v13) prenaient « #kdmc_sso=… » pour une route → « Page introuvable ».
     Donc on ne décore QUE le consommateur connu. Fail-open : pas de jeton → lien brut. */
  function _decorateAppLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a.card') : null;
      if (!a || !a.getAttribute('href')) return;
      var host; try { host = new URL(a.href).hostname; } catch (_) { return; }
      /* Consommateurs connus du fragment (lisent+nettoient #kdmc_sso=) : Apex Chat ET
         le Dashboard boutiques (cookie isolé en PWA iOS → besoin du pass Bearer). Ne
         JAMAIS décorer une app à routeur #hash qui ne consomme pas le jeton (leçon #101). */
      if (!SSO_PASS_CONSUMERS[host]) return;   /* la MÊME liste que le retour après connexion */
      var t = (window.kdmcSSO && window.kdmcSSO.token) ? window.kdmcSSO.token() : '';
      if (!t) return;
      var base = a.href.replace(/([#&])kdmc_sso=[^&]*/, '$1').replace(/[#&]+$/, '');
      a.href = base + (base.indexOf('#') >= 0 ? '&' : '#') + 'kdmc_sso=' + encodeURIComponent(t);
    }, true);
    /* (5.10.2026) LA SESSION SUIT LA TUILE, VERS TOUTES LES APPS (CMCteams compris). Une app installée sur
       l'écran d'accueil a ses propres cookies : un simple lien y arrivait sans session, et Kevin devait tout
       retaper. On passe par la porte /__sso/entrer de l'app (déjà utilisée au retour après connexion), qui
       dépose la session du domaine dans SON stockage puis ouvre la page. Sans session : le lien tel quel. */
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a.card') : null;
      if (!a || a.classList.contains('soon') || a.getAttribute('aria-disabled') === 'true' || a.target === '_blank') return;
      var u; try { u = new URL(a.href); } catch (_) { return; }
      if (u.protocol !== 'https:' || u.hostname === location.hostname || !/\.kd-mc\.com$/.test(u.hostname)) return;
      if (!(window.kdmcSSO && window.kdmcSSO.porte)) return;
      e.preventDefault();
      /* 10.10 (réactivité, mesuré : 1,5 s sans AUCUN changement à l'écran → Kevin re-touchait) : la tuile réagit TOUT DE SUITE
         (grisée, « ⏳ »), et un 2e toucher pendant le départ ne relance rien. */
      if (a.classList.contains('ouvre')) return;
      a.classList.add('ouvre'); a.setAttribute('aria-busy', 'true');
      var arr = a.querySelector('.arr'); if (arr) { arr.setAttribute('data-arr', arr.textContent); arr.textContent = '⏳'; }
      setTimeout(_tuilesNormales, 10000);
      window.kdmcSSO.porte(a.href).then(function (dest) { location.href = dest; }, function () { location.href = a.href; });
    });
    /* toucher = lire le laissez-passer dès le doigt posé (avant le « click », ~100-300 ms plus tard sur iPhone) */
    document.addEventListener('pointerdown', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a.card') : null;
      if (a && window.kdmcSSO && window.kdmcSSO.prechargerPorte && /\.kd-mc\.com$/.test(a.hostname || '')) { try { window.kdmcSSO.prechargerPorte(); } catch (_) { /* */ } }
    }, { passive: true });
    /* retour arrière (page gardée en mémoire par Safari), ou départ qui n'a pas abouti en 10 s : les tuiles redeviennent normales */
    window.addEventListener('pageshow', _tuilesNormales);
  }
  function _tuilesNormales() {
    document.querySelectorAll('a.card.ouvre').forEach(function (a) {
      a.classList.remove('ouvre'); a.removeAttribute('aria-busy');
      var arr = a.querySelector('.arr'); if (arr && arr.hasAttribute('data-arr')) { arr.textContent = arr.getAttribute('data-arr'); arr.removeAttribute('data-arr'); }
    });
  }
  _decorateAppLinks();

  /* ---------------------------- Boot ---------------------------- */
  function boot() {
    var acc = lg(LS_ACCOUNT, null);
    var done = function (sess, r) {
      if (_kevinNonProuve(sess)) { renderPreuveAdmin(); show(gate); return; }
      if (sess && sess.uid) { _postLogin({ uid: sess.uid, name: sess.name || (acc && acc.name) }, r); return; }   /* r : whoami déjà lu → l'accueil ne le redemande pas */
      if (acc) renderUnlock(acc); else renderCreate();
      show(gate);
    };
    /* 8.10 (revue extérieure) : au démarrage, whoami() aplatissait « compte sans code » en « aucune session » → l'écran bloquant
       « Crée ton code » n'était jamais atteint depuis une app (?code=1&return=…). On lit l'état détaillé : code_requis → l'écran. */
    if (window.kdmcSSO && window.kdmcSSO.whoamiResult) {
      window.kdmcSSO.whoamiResult().then(function (r) {
        if (r && r.state === 'code_requis') { renderCodeObligatoire(r.session); return; }
        done(r && r.state === 'session' ? r.session : null, r);
      }).catch(function () { done(null); });
    } else if (window.kdmcSSO) { window.kdmcSSO.whoami().then(done); } else { done(null); }
  }
  boot();

  /* Service worker (MAJ auto, offline). Fail-safe. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
  }
})();
