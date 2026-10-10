/* KDMC APEX — client SSO transverse (session unique kd-mc.com).
   Tout est fail-open : si le router SSO est indisponible, les fonctions
   renvoient null/false et l'appelant retombe sur son comportement normal.

   Deux canaux de session, pour être iPhone-proof :
   1) Cookie HttpOnly .kd-mc.com (posé par le router) — marche dans Safari.
   2) "Pass signé" en localStorage + header Authorization Bearer — marche AUSSI
      entre des PWA installées séparément (iOS isole les cookies par app).
   Le pass est récupéré depuis le lien (#kdmc_sso=...) que le domaine ajoute en
   renvoyant l'utilisateur vers l'app, puis stocké localement et envoyé en Bearer. */
(function (global) {
  'use strict';
  var BASE = '/__sso';
  var LS_TOK = 'kdmc_sso_token';
  /* Dernier refus « hors périmètre » reçu du domaine (app, reason, message) —
     lisible par l'app via kdmcSSO.refus() pour l'expliquer en français. */
  var _refus = null;

  function storedToken() { try { return localStorage.getItem(LS_TOK) || ''; } catch (e) { return ''; } }
  /* RÉACTIVITÉ (10.10.2026, Kevin : « on attend bcp trop avant l'exécution ») : `_gen` change à CHAQUE changement de session
     (pass posé, retiré, connexion, déconnexion) → une réponse lue AVANT ne sert jamais APRÈS (whoami partagé, laissez-passer d'avance). */
  var _gen = 0;
  function setToken(t) { _gen++; try { if (t) localStorage.setItem(LS_TOK, t); else localStorage.removeItem(LS_TOK); } catch (e) { /* quota */ } }
  function authHeaders(extra) {
    var h = extra || {};
    var t = storedToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  /* À appeler au boot d'une app : récupère le pass signé passé dans l'URL
     (#kdmc_sso=...) par le domaine, le stocke, et nettoie l'URL. → true si trouvé. */
  function consumeHashToken() {
    try {
      var h = location.hash || '';
      var m = h.match(/[#&]kdmc_sso=([^&]+)/);
      if (!m) return false;
      setToken(decodeURIComponent(m[1]));
      var clean = h.replace(/([#&])kdmc_sso=[^&]*/, '$1').replace(/[#&]+$/, '');
      try { history.replaceState(null, '', location.pathname + location.search + (clean && clean !== '#' ? clean : '')); } catch (e) { /* ignore */ }
      return true;
    } catch (e) { return false; }
  }

  /* Résultat détaillé de whoami pour distinguer 3 états (anti-lockout) :
     - 'session' : session valide (avec l'objet session)
     - 'invalid' : le serveur a répondu explicitement « pas de session » (HTTP 200 ok:false)
     - 'neterr'  : réseau/serveur KO (non-200, JSON cassé, exception) → on NE jette PAS le pass */
  /* UN SEUL whoami À LA FOIS (10.10.2026, mesuré : le portail en lançait 3 au démarrage — le battement de présence, le démarrage,
     puis l'accueil — et le tableau admin 3 aussi). Deux demandes simultanées reçoivent la MÊME réponse (une seule requête au
     domaine). Rien n'est gardé après la réponse : la demande suivante repart au domaine. Une session qui change entre-temps
     (`_gen`) relance une vraie requête. `{ frais: true }` (bouton « Vérifier maintenant ») : toujours une requête neuve. */
  var _whoP = null, _whoGen = -1;
  function whoamiResult(opts) {
    if (!(opts && opts.frais) && _whoP && _whoGen === _gen) return _whoP;
    var g = _gen;
    var p = _whoamiReseau().then(function (r) { if (_whoP === p) _whoP = null; return r; });
    _whoP = p; _whoGen = g;
    return p;
  }
  function _whoamiReseau() {
    return fetch(BASE + '/whoami', { method: 'GET', credentials: 'include', cache: 'no-store', headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) return { state: 'neterr' };
        return r.json().then(function (j) {
          if (j && j.ok) return { state: 'session', session: { uid: j.uid, name: j.name, cgu: !!j.cgu, admin: !!j.admin, verified: !!j.verified, app: j.app || '', portee: j.portee || '', attente_admin: j.attente_admin || '' } };
          /* 4e état — 'hors_perimetre' : la session est VALIDE, mais cette personne
             n'existe pas dans CETTE app (périmètre décidé par l'admin, 2026-09-15).
             Ce n'est PAS un pass invalide : le jeter déconnecterait la personne de
             l'app où elle EST chez elle, juste pour avoir ouvert une autre porte.
             On garde le pass, on n'envoie pas au portail (il redonnerait la même
             réponse), et on retient le message pour que l'app puisse l'afficher. */
          if (j && j.hors_perimetre) {
            _refus = { app: j.app || '', reason: j.reason || 'hors_perimetre', message: j.message || 'Ton compte n\'est pas ouvert sur cette application.' };
            return { state: 'hors_perimetre', refus: _refus };
          }
          /* 5e état — 'code_requis' (8.10, Kevin : « sinon pas d'accès ») : la session est VALIDE mais le compte n'a PAS de code au
             domaine → plus rien ne s'ouvre tant que la personne n'a pas créé son code. On GARDE le pass : c'est lui qui prouve, au
             portail, que c'est bien elle qui pose SON code (memeSession côté routeur), sans attendre l'administrateur. */
          if (j && j.code_requis) return { state: 'code_requis', session: { uid: j.uid || '', name: j.name || '', code_pose: false, message: j.message || '' } };
          return { state: 'invalid' };
        }).catch(function () { return { state: 'neterr' }; });
      })
      .catch(function () { return { state: 'neterr' }; });
  }

  function whoami() {
    /* → { uid, name, cgu, admin } si session valide, sinon null.
       Le champ `admin` DOIT être propagé. Envoie le pass en Bearer (cross-PWA)
       ET les cookies (Safari) — l'un ou l'autre suffit. */
    return whoamiResult().then(function (r) { return r.state === 'session' ? r.session : null; });
  }

  /* ===== Passkey (Face ID / Touch ID) — identité FORTE (verified) ===== */
  function _b64uToBuf(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function _bufToB64u(buf) { var u = new Uint8Array(buf); var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function supportsPasskey() { return typeof window !== 'undefined' && !!window.PublicKeyCredential; }

  /* Enrôle un passkey pour la session courante (nécessite une session). Émet une
     session FORTE (verified). → {ok, reason?}. */
  function registerPasskey() {
    if (!supportsPasskey()) return Promise.resolve({ ok: false, reason: 'non supporté sur cet appareil' });
    return fetch(BASE + '/webauthn/register/options', { method: 'POST', credentials: 'include', headers: authHeaders({ 'content-type': 'application/json' }), body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function (o) {
        if (!o || !o.ok) return { ok: false, reason: (o && o.reason) || 'options' };
        return navigator.credentials.create({ publicKey: {
          challenge: _b64uToBuf(o.challenge),
          rp: o.rp,
          user: { id: _b64uToBuf(o.user.id), name: o.user.name, displayName: o.user.displayName },
          pubKeyCredParams: o.pubKeyCredParams,
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
          timeout: 60000, attestation: 'none',
        } }).then(function (cred) {
          var att = cred.response;
          var _cid = cred.id; /* id (b64u) du passkey de CET appareil → l'UI peut le reconnaître (anti-doublon) */
          return fetch(BASE + '/webauthn/register/verify', { method: 'POST', credentials: 'include', headers: authHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ attestationObject: _bufToB64u(att.attestationObject), clientDataJSON: _bufToB64u(att.clientDataJSON) }) })
            .then(function (r) { return r.json(); })
            .then(function (j) { if (j && j.ok && j.token) setToken(j.token); if (j && j.ok && !j.credId) j.credId = _cid; return j || { ok: false }; });
        });
      })
      .catch(function (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 120) }; });
  }

  /* Connexion par passkey (Face ID). → {ok, verified, uid, name, ...} ; stocke le pass.
     Sans uid (appareil qui ne connaît encore personne : app de l'écran d'accueil au stockage vide,
     26.09) : Face ID propose lui-même le passkey du trousseau, et on lit l'uid dans la réponse
     signée (userHandle = l'uid posé à l'enrôlement). Le serveur vérifie la signature avec la clé
     qu'IL a enregistrée pour cet uid : annoncer un autre uid ne donne rien. */
  function loginPasskey(uid) {
    if (!supportsPasskey()) return Promise.resolve({ ok: false, reason: 'non supporté' });
    return fetch(BASE + '/webauthn/auth/options', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: uid || '' }) })
      .then(function (r) { return r.json(); })
      .then(function (o) {
        if (!o || !o.ok) return { ok: false, reason: (o && o.reason) || 'options' };
        if (uid && (!o.allowCredentials || !o.allowCredentials.length)) return { ok: false, reason: 'aucun passkey' };
        var pk = { challenge: _b64uToBuf(o.challenge), rpId: o.rpId, userVerification: 'required', timeout: 60000 };
        if (uid) pk.allowCredentials = o.allowCredentials.map(function (c) { return { type: 'public-key', id: _b64uToBuf(c.id) }; });
        return navigator.credentials.get({ publicKey: pk }).then(function (cred) {
          var a = cred.response;
          var _cid = cred.id; /* id (b64u) du passkey utilisé sur CET appareil */
          if (!uid) { try { uid = new TextDecoder().decode(a.userHandle); } catch (e) { uid = ''; } }
          if (!uid) return { ok: false, reason: 'passkey sans compte' };
          return fetch(BASE + '/webauthn/auth/verify', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: uid, credId: cred.id, clientDataJSON: _bufToB64u(a.clientDataJSON), authenticatorData: _bufToB64u(a.authenticatorData), signature: _bufToB64u(a.signature) }) })
            .then(function (r) { return r.json(); })
            .then(function (j) { if (j && j.ok && j.token) setToken(j.token); if (j && j.ok && !j.credId) j.credId = _cid; return j || { ok: false }; });
        });
      })
      .catch(function (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 120) }; });
  }

  function issue(uid, name, cgu) {
    /* Établit la session unique pour tout le domaine. Stocke le pass signé
       (pour le canal Bearer / les PWA). → true/false. */
    /* `pour` = l'adresse de l'app d'où la personne vient (le portail la reçoit en
       ?return=). Le domaine ouvre le NOUVEAU compte à cette app-là — pas au portail,
       qui n'est qu'une réception. Optionnel : sans lui, rien ne change. */
    var pour = '';
    try { if (arguments[3]) pour = new URL(String(arguments[3]), location.origin).hostname; } catch (e) { pour = ''; }
    return fetch(BASE + '/issue', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uid: uid, name: name, cgu: !!cgu, pour: pour }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok && j.token) setToken(j.token);
        if (j && j.hors_perimetre) _refus = { app: j.app || '', reason: j.reason || 'hors_perimetre', message: j.message || '' };
        return !!(j && j.ok);
      })
      .catch(function () { return false; });
  }

  /* Même chose qu'issue(), mais avec le CODE du compte (vérifié par le domaine depuis le 27.09)
     et la réponse complète (raison + message en français) au lieu d'un simple oui/non.
     → objet {ok, reason, message, code, …}, ou null si le domaine ne répond pas. */
  /* `telPreuve` (9.10) : la preuve signée par le domaine que le téléphone est confirmé (/__sso/tel/verifie) — exigée à la
     création quand WhatsApp est branché. La page la transporte, elle ne la fabrique ni ne la juge. */
  /* `validation` (10.10, Kevin « si pas de WhatsApp, validation admin. Au choix ») : 'admin' = la personne choisit d'attendre Kevin
     au lieu de WhatsApp. Le domaine crée le compte FERMÉ partout sauf le portail, jusqu'à ce que Kevin l'ouvre. */
  function issueDetail(uid, name, cgu, returnUrl, code, telPreuve, validation) {
    var pour = '';
    try { if (returnUrl) pour = new URL(String(returnUrl), location.origin).hostname; } catch (e) { pour = ''; }
    return fetch(BASE + '/issue', {
      method: 'POST', credentials: 'include', headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ uid: uid, name: name, cgu: !!cgu, pour: pour, code: code ? String(code) : undefined, tel_preuve: telPreuve ? String(telPreuve) : undefined, validation: validation === 'admin' ? 'admin' : undefined }),
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (j && j.ok && j.token) setToken(j.token);
        if (j && j.hors_perimetre) _refus = { app: j.app || '', reason: j.reason || 'hors_perimetre', message: j.message || '' };
        return j;
      })
      .catch(function () { return null; });
  }
  /* Appareil neuf, ou n'importe quelle app du domaine : nom + code → la session du compte. */
  function login(name, code) {
    return fetch(BASE + '/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: String(name || ''), code: String(code || '') }),
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'neterr' }; }); })
      .then(function (j) { if (j && j.ok && j.token) setToken(j.token); return j; })
      .catch(function () { return { ok: false, reason: 'neterr', message: 'Le domaine ne répond pas. Réessaie dans un instant.' }; });
  }

  /* ENTRER PAR N'IMPORTE QUELLE PORTE (27.09.2026). Une app installée (iPhone, PC) a ses cookies
     à elle : on passe par SON adresse /__sso/entrer, qui dépose la session (et le grant admin)
     dans SON stockage, puis renvoie sur la page voulue. Marche pour toute adresse du domaine.
     → Promise<string> : l'adresse à ouvrir (l'adresse d'origine si rien à déposer). */
  /* LE LAISSEZ-PASSER LU D'AVANCE (10.10.2026, mesuré : toucher une tuile attendait un aller-retour complet à /__sso/pass AVANT de
     partir — 1,5 s de « rien ne se passe » sur un réseau mobile). Le portail le lit dès que l'accueil s'affiche (prechargerPorte),
     on le garde 60 s en mémoire de la page (l'enveloppe en vaut 90 : marge de 30 s), et une session qui change (`_gen`) le jette. */
  var _passP = null, _passAt = 0, _passGen = -1, PASS_MS = 60000;
  function _lirePass() {
    if (_passP && _passGen === _gen && Date.now() - _passAt < PASS_MS) return _passP;
    _passAt = Date.now(); _passGen = _gen;
    var p = fetch(BASE + '/pass', { credentials: 'include', cache: 'no-store', headers: authHeaders() }).then(function (r) { return r.json(); }).catch(function () { return null; });
    p.then(function (j) { if (_passP === p && !(j && j.ok)) _passP = null; });   /* pas de session : on ne garde pas le « non » */
    _passP = p;
    return p;
  }
  function prechargerPorte() { _lirePass(); }   /* le cookie de session est HttpOnly (invisible ici) : on demande, le domaine répond ok:false sans session */
  function porte(url) {
    var u; try { u = new URL(String(url), location.origin); } catch (e) { return Promise.resolve(String(url)); }
    if (u.protocol !== 'https:' || !/(^|\.)kd-mc\.com$/.test(u.hostname)) return Promise.resolve(u.href);
    /* 8.10 (revue extérieure) : le domaine rend une ENVELOPPE signée de 90 s (`porte`) : session + grant admin voyagent dedans,
       jamais le grant en clair dans l'adresse (journaux, historique). Repli : la session seule (`t`), sans grant. */
    var lire = _lirePass();
    return lire.then(function (j) {
      var to = u.pathname + u.search + u.hash;
      if (j && j.ok && j.porte) return u.origin + '/__sso/entrer?to=' + encodeURIComponent(to) + '&h=' + encodeURIComponent(j.porte);
      var t = (j && j.ok && j.token) || storedToken();
      if (!t) return u.href;
      return u.origin + '/__sso/entrer?to=' + encodeURIComponent(to) + '&t=' + encodeURIComponent(t);
    });
  }

  /* JE SUIS L'ADMINISTRATEUR (27.09.2026). Le code admin, vérifié par le domaine, donne la
     session VÉRIFIÉE de l'admin sur cet appareil (celle que toutes les apps reconnaissent), plus le
     grant des portes admin — même sans Face ID (PC, navigateur neuf). Le code ne reste nulle part. */
  function adminCode(code) {
    return fetch('/__admin/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: String(code || '') }),
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'neterr' }; }); })
      .then(function (j) { _gen++; if (j && j.ok && j.token) setToken(j.token); return j || { ok: false }; })
      .catch(function () { return { ok: false, reason: 'neterr' }; });
  }

  /* CONDITIONS — une fois pour tout le domaine (27.09.2026). `cgu()` → {ok, version, texte, acceptees} ;
     une app n'affiche sa case QUE si `acceptees` est faux, puis appelle `accepterCgu()`. */
  function cgu() {
    return fetch(BASE + '/cgu', { credentials: 'include', cache: 'no-store', headers: authHeaders() })
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false, acceptees: false, texte: '' }; });
  }
  function accepterCgu() {
    return fetch(BASE + '/cgu', { method: 'POST', credentials: 'include', headers: authHeaders({ 'content-type': 'application/json' }), body: '{}' })
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  }

  function logout() {
    setToken('');
    return fetch(BASE + '/logout', { method: 'POST', credentials: 'include', headers: authHeaders() })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  /* Pour les APPS : garantit une session du domaine.
     - Récupère un éventuel pass dans l'URL.
     - whoami : si session → la retourne.
     - sinon → redirige vers le domaine pour se connecter (et revenir avec le pass),
       SAUF si on a déjà tenté (on a un pass mais invalide) → anti-boucle : retourne
       null et l'app garde son login normal (jamais de verrouillage). */
  function ensureSession(returnUrl) {
    var hadToken = !!storedToken();
    var got = consumeHashToken();
    return whoamiResult().then(function (r) {
      if (r.state === 'session') return r.session;
      /* réseau/serveur KO → on GARDE le pass (il est peut-être valide) et l'app
         retombe sur son login normal. Jamais de verrouillage, jamais de purge. */
      if (r.state === 'neterr') return null;
      /* hors périmètre : pass VALIDE mais pas pour cette app. On le GARDE (elle est
         chez elle ailleurs) et on ne renvoie PAS au portail (même réponse). L'app
         retombe sur son écran normal et peut afficher kdmcSSO.refus().message. */
      if (r.state === 'hors_perimetre') return null;
      /* compte sans code (8.10) : on GARDE le pass et on envoie au portail, qui affiche l'écran « Crée ton code » et ramène ici. */
      if (r.state === 'code_requis') {
        try { location.replace('https://kd-mc.com/?code=1&return=' + encodeURIComponent(returnUrl || location.href)); } catch (e) { /* ignore */ }
        return null;
      }
      /* serveur a dit explicitement « pas de session » : si on avait déjà un pass,
         il est réellement invalide → on le jette, mais on NE reboucle PAS. */
      if (got || hadToken) { setToken(''); return null; }
      try {
        var u = 'https://kd-mc.com/?return=' + encodeURIComponent(returnUrl || location.href);
        location.replace(u);
      } catch (e) { /* ignore */ }
      return null;
    }).catch(function () { return null; });
  }

  /* ===== POLITIQUE DE CONFIANCE CROSS-APP (« Admin auto, toi seul ») =====
     Décide si une app peut ouvrir une session AUTOMATIQUE depuis la session du
     domaine — et avec quel rôle. RÈGLE DE SÉCURITÉ ABSOLUE :
       - role 'admin' UNIQUEMENT si l'identité est PROUVÉE par Face ID (verified)
         ET propriétaire (admin = uid dans la liste blanche côté domaine).
       - verified mais non-propriétaire → role 'user' (session normale).
       - NON vérifié (nom auto-déclaré, code choisi) → AUCUN auto-login (null).
         L'app peut quand même pré-remplir le nom via whoami(), mais ne DOIT pas
         accorder de session/privilège sur cette seule base (faille d'usurpation).
     Récupère d'abord un éventuel pass signé dans l'URL (#kdmc_sso=). Fail-open :
     toute erreur → null → l'app garde son login normal (jamais de verrouillage). */
  function autoLogin() {
    try { consumeHashToken(); } catch (e) { /* ignore */ }
    return whoami().then(function (s) {
      if (!s) return null;
      if (!s.verified) return null; /* jamais d'auto-login sans preuve Face ID */
      return { uid: s.uid, name: s.name, cgu: !!s.cgu, role: s.admin ? 'admin' : 'user', verified: true };
    }).catch(function () { return null; });
  }

  /* ===== Battement de présence (« connecté en direct ») =====
     Tant qu'une page du domaine reste OUVERTE et VISIBLE, on rafraîchit discrètement
     la session (whoami → le router met à jour last_seen) pour que la présence reste
     "verte" dans l'Admin domaine. Économe : coupé en arrière-plan (batterie), ping
     immédiat au retour au 1er plan, et s'arrête tout seul si la session disparaît. */
  /* 150 s (pas 60) : la présence admin est « en ligne < 5 min » → 150 s garde la
     pastille verte tout en divisant les écritures KV (quota free 1000/jour). */
  var _beatTimer = null, _beatMs = 150000, _beatWired = false;
  function _beatTick() {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    whoami().then(function (s) { if (!s) _beatStop(); }).catch(function () { /* on retentera */ });
  }
  function _beatStop() { if (_beatTimer) { clearInterval(_beatTimer); _beatTimer = null; } }
  function _beatStart() { if (!_beatTimer) { try { _beatTimer = setInterval(_beatTick, _beatMs); } catch (e) { /* */ } } }
  function startHeartbeat(intervalMs) {
    if (intervalMs && intervalMs >= 20000) _beatMs = intervalMs; /* plancher 20s */
    if (!_beatWired) {
      _beatWired = true;
      try {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') { _beatTick(); _beatStart(); } else _beatStop();
        });
      } catch (e) { /* ignore */ }
    }
    _beatTick();  /* met à jour la présence tout de suite */
    _beatStart(); /* puis périodiquement (s'auto-arrête si déconnecté) */
  }

  global.kdmcSSO = {
    whoami: whoami,
    whoamiResult: whoamiResult,   /* 8.10 : le portail distingue « compte sans code » (écran bloquant) d'« aucune session » */
    issue: issue,
    issueDetail: issueDetail,
    login: login,
    porte: porte,
    prechargerPorte: prechargerPorte,   /* 10.10 : le portail lit le laissez-passer dès l'accueil → la tuile part sans attendre */
    adminCode: adminCode,
    cgu: cgu,
    accepterCgu: accepterCgu,
    logout: logout,
    consumeHashToken: consumeHashToken,
    ensureSession: ensureSession,
    autoLogin: autoLogin,
    token: storedToken,
    /* Dernier refus « hors périmètre » ({app, reason, message}) ou null — pour
       que l'app dise en français POURQUOI, au lieu d'un écran de connexion muet. */
    refus: function () { return _refus; },
    supportsPasskey: supportsPasskey,
    registerPasskey: registerPasskey,
    loginPasskey: loginPasskey,
    startHeartbeat: startHeartbeat,
    /* Self-service : chacun gère SES appareils / connexions (uid pris dans le token). */
    myPasskeys: function () { return _selfFetch('/__sso/passkeys'); },
    deletePasskey: function (id) { return _selfFetch('/__sso/passkeys/delete', 'POST', { id: id }); },
    myHistory: function () { return _selfFetch('/__sso/me/history'); },
    revokeMyOtherSessions: function () {
      return _selfFetch('/__sso/me/revoke', 'POST').then(function (j) {
        if (j && j.ok && j.token) setToken(j.token); /* garde CE device connecté */
        return j;
      });
    },
  };
  /* fetch self-service : joint le pass Bearer (PWA iOS cookie isolé) + cookie. */
  function _selfFetch(path, method, body) {
    return fetch(path, {
      method: method || 'GET', credentials: 'include', cache: 'no-store',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .catch(function () { return { ok: false, reason: 'neterr' }; });
  }

  /* Auto-démarrage : toute page qui charge kdmc-sso.js garde sa présence à jour.
     Si pas de session, le 1er whoami renvoie null et le battement s'arrête (0 spam). */
  try {
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { startHeartbeat(); });
      else startHeartbeat();
    }
  } catch (e) { /* ignore */ }
})(window);
