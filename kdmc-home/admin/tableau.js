/* KDMC — LE TABLEAU DE BORD ADMIN UNIQUE (kd-mc.com/admin/), 10.10.2026.
   Kevin : « Fais un seul tableau de bord admin pour tout. Regroupe tout intelligemment et clairement. »

   Ce fichier ne refait AUCUNE logique métier : il range et il appelle.
     · la boîte (messages, inscriptions, codes, inscriptions sans WhatsApp) → kdmc-boite.js (window.kdmcBoite : surMaj, blocs, ouvrir)
     · les comptes (présence, fiches, périmètres, historique, journal) → admin.js (window.kdmcAdmin.monter)
     · le commerce (ventes, file, paniers, 🎁 inviter, produits, pub, caisse) → commerce.js (window.kdmcCommerce.monter)
     · les tuiles de toutes les apps → admin.js hub(), redistribuées par thème (une destination = une tuile, jamais deux)
   SÉCURITÉ : rien d'admin n'est affiché, ni demandé au réseau, tant que le DOMAINE (/__sso/whoami) ne dit pas admin ET vérifié
   (Face ID) — exactement le contrôle de commerce.js. La page ne juge aucun code. Les données reçues passent par textContent ou esc(). */
(function (global) {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sansAccent(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* Les 8 thèmes, du plus urgent au moins urgent. */
  var SECTIONS = [
    { id: 'personnes', ic: '👥', t: 'Personnes & comptes', s: 'Qui se connecte, comptes, périmètres, codes, inscriptions' },
    { id: 'messages', ic: '📬', t: 'Messages', s: 'La boîte : toutes les apps, réponse directe' },
    { id: 'commerce', ic: '🛒', t: 'Commerce', s: 'Ventes, file à valider, paniers, inviter, produits' },
    { id: 'apps', ic: '🌐', t: 'Apps du domaine', s: 'Chaque app, sa version, ouvrir' },
    { id: 'ia', ic: '🤖', t: 'IA & robots', s: 'Bee, Apex, bot, robots, santé des services' },
    { id: 'couts', ic: '💶', t: 'Coûts & quotas', s: 'Ce qui coûte, ce qui reste gratuit' },
    { id: 'reglages', ic: '⚙️', t: 'Réglages', s: 'Centre de contrôle, autorisations, coffre, code admin' }
  ];

  /* Où va chaque tuile de hub() (admin.js). Tout ce qui n'est pas cité ici reste dans « Apps du domaine ». */
  var RANGEMENT = {
    '/admin/commerce.html': 'commerce', 'https://kit.kd-mc.com/': 'commerce', 'https://rotaplan.kd-mc.com/': 'commerce',
    'https://croupier.kd-mc.com/': 'commerce', 'https://dashboard.kd-mc.com/': 'commerce',
    'https://shops.kd-mc.com/la-detente/studio.html': 'commerce', 'https://chez-lolo.kd-mc.com/studio.html': 'commerce',
    'https://admin.kd-mc.com/': 'personnes',
    'https://apex-ai.kd-mc.com/': 'ia', 'https://javis.kd-mc.com/': 'ia', 'https://bot.kd-mc.com/': 'ia',
    'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/tools/health/workers-status.json': 'ia',
    '/admin/openai.html': 'couts',
    '/liens/': 'reglages', 'https://autorisations.kd-mc.com/': 'reglages', 'https://coffre.kd-mc.com/': 'reglages'
  };
  function ranger(href) { return RANGEMENT[href] || 'apps'; }

  /* Tuiles propres au tableau (absentes de hub()) — mêmes balises que admin.js card(). */
  var TUILES = {
    ia: [['⚙️', 'Robots & vérifications (CI)', 'Les tâches automatiques du dépôt : vert / rouge', 'https://github.com/9r4rxssx64-creator/cmcteams/actions']],
    reglages: [['🔑', 'Changer mon code admin', 'Calcule l\'empreinte sur ton téléphone, rien n\'est envoyé', '/empreinte/']]
  };

  /* « Que veux-tu faire ? » — chaque action mène quelque part de précis. */
  var ACTIONS = [
    { t: 'Lire et répondre aux messages', k: 'message boite repondre lire mail whatsapp', go: 'boite' },
    { t: 'Valider une inscription', k: 'inscription valider accepter nouveau compte cmcteams', go: '#tb-attente' },
    { t: 'Accepter ou refuser un code', k: 'code valider accepter refuser connexion inconnue', go: '#tb-attente' },
    { t: 'Inscriptions sans WhatsApp', k: 'whatsapp telephone inscription accepter refuser', go: '#tb-attente' },
    { t: 'Voir qui est connecté', k: 'connecte en ligne presence qui', go: '#presence' },
    { t: 'Fiche d\'une personne', k: 'fiche client compte personne appareil lieu', go: '#list' },
    { t: 'Où une personne peut aller (périmètre)', k: 'perimetre acces app bloquer fermer autoriser', go: '#list' },
    { t: 'Déconnecter quelqu\'un partout', k: 'deconnecter revoquer session vole perdu', go: '#list' },
    { t: 'Historique des connexions', k: 'historique connexion journal qui se connecte', go: '#hq' },
    { t: 'Journal admin (alertes)', k: 'journal alerte securite evenement', go: '#audsec' },
    { t: 'Qui se connecte (admin.kd-mc.com)', k: 'qui se connecte domaine journal', go: 'https://admin.kd-mc.com/' },
    { t: 'Ventes et chiffre d\'affaires', k: 'vente chiffre affaires argent ca', go: '#commerce' },
    { t: 'Livrer une commande (file à valider)', k: 'livrer file valider commande revolut virement paypal', go: 'livrer' },
    { t: 'Paniers ouverts / relancer', k: 'panier relancer abandonne paypal', go: '#commerce' },
    { t: 'Inviter quelqu\'un gratuitement', k: 'inviter gratuit offrir cadeau lien', go: '#inviter' },
    { t: 'Produits en vente', k: 'produit kit croupier prix', go: '#commerce' },
    { t: 'Mon IBAN (virement)', k: 'iban virement banque bic', go: '#ibanIn' },
    { t: 'Commerce en plein écran', k: 'commerce plein ecran', go: '/admin/commerce.html' },
    { t: 'Ouvrir une app du domaine', k: 'app ouvrir version cmcteams lingua arbre tor cuisine', go: '#apps' },
    { t: 'Bee / Javis', k: 'bee javis assistant', go: 'https://javis.kd-mc.com/' },
    { t: 'Santé des services', k: 'sante worker service panne en ligne', go: '#ia' },
    { t: 'Robots et vérifications (CI)', k: 'robot ci github test workflow', go: 'https://github.com/9r4rxssx64-creator/cmcteams/actions' },
    { t: 'Ce qui consomme OpenAI', k: 'openai cout voix payant facture prelevement', go: '/admin/openai.html' },
    { t: 'Centre de contrôle (tous mes liens)', k: 'liens centre controle cloudflare firebase cles', go: '/liens/' },
    { t: 'Changer mon code admin', k: 'code admin empreinte changer', go: '/empreinte/' }
  ];
  function filtrer(q) {
    var mots = sansAccent(q).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return ACTIONS.filter(function (a) { var h = sansAccent(a.t + ' ' + a.k); return mots.every(function (m) { return h.indexOf(m) >= 0; }); });
  }

  /* Les compteurs du bandeau « À traiter maintenant ». `null` = pas encore lu (affiché « … » ou « — »), jamais un faux 0.
     inscriptionsAdmin ABSENT (routeur pas encore à jour) → compteur caché, aucune erreur. */
  function compteurs(boite, live, liveLu) {
    var b = boite || null;
    var lAdmin = b && Array.isArray(b.inscriptionsAdmin) ? b.inscriptionsAdmin.length : null;
    return [
      { id: 'messages', l: 'Messages non lus', n: b ? (b.nonLus || 0) : null, s: b && b.nonLusAlertes ? '+ ' + b.nonLusAlertes + ' alerte(s)' : 'toutes les apps' },
      { id: 'inscriptions', l: 'Inscriptions en attente', n: b ? (b.inscriptions || []).length : null, s: 'CMCteams' },
      { id: 'codes', l: 'Codes à valider', n: b ? (b.codes || []).length : null, s: 'appareil inconnu' },
      { id: 'sansWhatsapp', l: 'Inscriptions sans WhatsApp', n: lAdmin, s: 'à accepter ou refuser', cache: !b || lAdmin === null },
      { id: 'livrer', l: 'Ventes à livrer', n: live && live.file ? (live.file.n || 0) : null,
        s: live ? (live.intentions && live.intentions.n ? live.intentions.n + ' panier(s) ouvert(s)' : 'file à valider') : (liveLu ? 'caisse injoignable' : 'lecture de la caisse…') }
    ];
  }

  var API = { esc: esc, ranger: ranger, filtrer: filtrer, compteurs: compteurs, SECTIONS: SECTIONS, ACTIONS: ACTIONS };
  global.kdmcTableau = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  /* ── DOM ─────────────────────────────────────────────────────────────────────────────────────────── */
  var app = document.getElementById('app');
  var BOITE = null, LIVE = null, LIVE_LU = false, empAttente = '', empMess = '';

  function deny(s) {
    /* Même verrou, mêmes mots que commerce.js : sans session / pas admin / admin sans Face ID. */
    var diag = !s ? 'Aucune <b>session du domaine</b> sur cet appareil.'
      : (!s.admin ? 'Connecté en tant que <b>' + esc(s.name || '?') + '</b>, mais ce compte n\'est pas administrateur.'
        : 'Connecté en tant que <b>' + esc(s.name || '?') + '</b> (admin), mais sans <b>Face ID</b> : le tableau de bord commande le domaine, il exige l\'identité forte.');
    app.innerHTML = '<div class="msg">🔒 <b>Accès administrateur</b><br><br>' + diag + '<br><br>Connecte-toi sur <a href="/" style="color:var(--gold)">kd-mc.com</a> avec Face ID (compte Kevin).</div>';
  }

  function tuile(i, n, d, h) {
    return '<a class="kdmc-card kdmc-in cardrow" href="' + esc(h) + '"><span class="i">' + esc(i) + '</span><span class="ct"><span class="n">' + esc(n) + '</span><span class="d">' + esc(d) + '</span></span><span class="arr">›</span></a>';
  }

  function coquille() {
    var h = '<section class="traiter" id="a-traiter" aria-label="À traiter maintenant">'
      + '<h1>⚡ À traiter maintenant</h1><p class="sous" id="tb-sous">Lecture en cours…</p>'
      + '<div class="cpts" id="tb-cpts"></div></section>'
      + '<nav class="tbnav" id="tb-nav" aria-label="Sections">' + SECTIONS.map(function (s) { return '<a href="#' + s.id + '" data-nav="' + s.id + '">' + s.ic + ' ' + esc(s.t.split(' ')[0]) + '</a>'; }).join('') + '</nav>'
      + '<div class="cherche"><input id="tb-q" type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" placeholder="🔎 Que veux-tu faire ?" aria-label="Que veux-tu faire ?"><div class="res" id="tb-res" hidden></div></div>';
    SECTIONS.forEach(function (s) {
      h += '<details class="sec" id="' + s.id + '" open><summary><span class="ic">' + s.ic + '</span><span class="tt"><b>' + esc(s.t) + '</b><span>' + esc(s.s) + '</span></span></summary><div class="corps" id="corps-' + s.id + '"></div></details>';
    });
    app.innerHTML = h;
    /* une section absente ne doit jamais emporter les autres : chaque corps est posé seulement s'il existe */
    var C = function (id) { return document.getElementById('corps-' + id) || document.createElement('div'); };
    C('personnes').innerHTML = '<h2 class="cat">✋ À trancher</h2><div class="bb" id="tb-attente"><p class="info">Lecture de la boîte…</p></div>'
      + '<h2 class="cat">🔎 Qui se connecte</h2><div class="grid" id="tuiles-personnes"></div><div id="admin-comptes"></div>';
    C('messages').innerHTML = '<div id="tb-messages"><p class="info">Lecture de la boîte…</p></div><button class="grosbtn" id="tb-boite" type="button">📬 Ouvrir la boîte — lire et répondre</button>';
    C('commerce').innerHTML = '<div id="commerce-app"></div><h2 class="cat">🔗 Mes pages de vente & boutiques</h2><div class="grid" id="tuiles-commerce"></div>';
    C('apps').innerHTML = '<p class="info" id="tb-versions-info">Toutes les apps du domaine. La version affichée est celle du dépôt.</p><div class="grid" id="tuiles-apps"></div>';
    C('ia').innerHTML = '<p class="info" id="tb-sante">Santé des services : lecture…</p><div class="grid" id="tuiles-ia"></div>';
    C('couts').innerHTML = '<p class="info" id="tb-openai">OpenAI : lecture…</p><p class="info">Règle : tout reste <b>gratuit</b> ; rien de payant ne s\'allume sans ton accord.</p><div class="grid" id="tuiles-couts"></div>';
    C('reglages').innerHTML = '<div class="grid" id="tuiles-reglages"></div>';
  }

  /* Les tuiles de admin.js hub(), DÉPLACÉES (pas recopiées) dans leur thème : chaque destination reste unique sur la page. */
  function rangerTuiles(versions) {
    var tpl = document.createElement('template');
    tpl.innerHTML = global.kdmcAdmin ? global.kdmcAdmin.hub() : '';   /* HTML construit par admin.js, données passées par esc() */
    var cartes = tpl.content.querySelectorAll('a.cardrow');
    for (var i = 0; i < cartes.length; i++) {
      var a = cartes[i], href = a.getAttribute('href') || '';
      var m = /^https:\/\/([a-z0-9.-]+)\/$/.exec(href), v = m && versions && versions[m[1]] && versions[m[1]].version;
      if (v) { var d = a.querySelector('.d'); var sp = document.createElement('span'); sp.className = 'ver'; sp.textContent = v; if (d) d.appendChild(sp); }
      var g = document.getElementById('tuiles-' + ranger(href));
      if (g) g.appendChild(a);
    }
    Object.keys(TUILES).forEach(function (sec) {
      var g = document.getElementById('tuiles-' + sec); if (!g) return;
      g.insertAdjacentHTML('beforeend', TUILES[sec].map(function (t) { return tuile(t[0], t[1], t[2], t[3]); }).join(''));
    });
  }

  function aller(cible) {
    if (cible === 'boite') { if (global.kdmcBoite) global.kdmcBoite.ouvrir(); return; }
    if (cible === 'livrer') {
      var f = document.querySelector('#commerce-app [data-valider], #commerce-app [data-refuser]');
      cible = f ? null : '#commerce';
      if (f) { ouvrirParents(f); f.closest('.tile').scrollIntoView({ block: 'start' }); return; }
    }
    if (/^(https?:)?\//.test(cible)) { location.href = cible; return; }
    var el = document.querySelector(cible);
    if (!el) { el = document.getElementById('commerce'); }
    ouvrirParents(el);
    try { el.scrollIntoView({ block: 'start' }); } catch (e) { /* */ }
    if (/^(INPUT|SELECT)$/.test(el.tagName)) { try { el.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  function ouvrirParents(el) { for (var p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; }

  function dessinerCompteurs() {
    var cs = compteurs(BOITE, LIVE, LIVE_LU), z = document.getElementById('tb-cpts'); if (!z) return;
    var total = 0;
    z.textContent = '';
    cs.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-compteur', c.id);
      b.className = 'cpt' + (c.n == null ? ' inconnu' : c.n > 0 ? ' urgent' : '');
      if (c.cache) b.hidden = true;
      var n = document.createElement('span'); n.className = 'n'; n.textContent = c.n == null ? (c.id === 'livrer' && LIVE_LU ? '—' : '…') : String(c.n);
      var l = document.createElement('span'); l.className = 'l'; l.textContent = c.l;
      var s = document.createElement('span'); s.className = 's'; s.textContent = c.s;
      b.appendChild(n); b.appendChild(l); b.appendChild(s);
      b.onclick = function () { aller(c.id === 'messages' ? 'boite' : c.id === 'livrer' ? 'livrer' : '#tb-attente'); };
      if (!c.cache && c.n) total += c.n;
      z.appendChild(b);
    });
    var sous = document.getElementById('tb-sous');
    if (sous) sous.textContent = !BOITE ? 'Lecture en cours…' : total ? total + ' chose' + (total > 1 ? 's' : '') + ' t\'attend' + (total > 1 ? 'ent' : '') + '. Touche un chiffre pour y aller.' : '✅ Rien en attente pour l\'instant.';
    try { document.title = (total ? '(' + total + ') ' : '') + 'KDMC — Tableau de bord admin'; } catch (e) { /* */ }
    var nav = document.querySelector('[data-nav="personnes"]');
    if (nav) { var x = nav.querySelector('b'); var np = cs.filter(function (c) { return /inscriptions|codes|sansWhatsapp/.test(c.id) && !c.cache; }).reduce(function (t, c) { return t + (c.n || 0); }, 0); if (np) { if (!x) { x = document.createElement('b'); nav.appendChild(x); } x.textContent = String(np); } else if (x) x.remove(); }
    var nm = document.querySelector('[data-nav="messages"]');
    if (nm) { var y = nm.querySelector('b'); var nn = BOITE ? BOITE.nonLus || 0 : 0; if (nn) { if (!y) { y = document.createElement('b'); nm.appendChild(y); } y.textContent = String(nn); } else if (y) y.remove(); }
  }

  function dessinerAttente(D) {
    var e = JSON.stringify([(D.codes || []).map(function (c) { return c.uid + c.ts; }), (D.inscriptions || []).map(function (i) { return i.id; }), Array.isArray(D.inscriptionsAdmin) ? D.inscriptionsAdmin.map(function (c) { return c.uid + c.ts; }) : 'absent', D.inscriptionsEtat]);
    if (e === empAttente) return; empAttente = e;
    var z = document.getElementById('tb-attente'); if (!z || !global.kdmcBoite) return;
    var b = global.kdmcBoite.blocs(); if (!b) return;
    z.textContent = '';
    z.appendChild(b.codes); z.appendChild(b.inscriptionsAdmin); z.appendChild(b.inscriptions);
  }

  function dessinerMessages(D) {
    var e = JSON.stringify([D.nonLus, (D.messages || []).slice(0, 4).map(function (m) { return [m.cle, m.ts, m.nonLus]; }), (D.sources || []).map(function (s) { return [s.id, s.nonLus, s.etat]; })]);
    if (e === empMess) return; empMess = e;
    var z = document.getElementById('tb-messages'); if (!z) return;
    z.textContent = '';
    var p = document.createElement('p'); p.className = 'info';
    p.textContent = (D.nonLus ? D.nonLus + ' message(s) non lu(s)' : 'Aucun message non lu') + ' · ' + (D.connectes || 0) + ' personne(s) connectée(s)';
    z.appendChild(p);
    var srcs = document.createElement('div'); srcs.className = 'srcs';
    (D.sources || []).forEach(function (s) {
      if (!s.total && s.etat === 'ok') return;
      var c = document.createElement('span'); c.className = 'chip ' + (s.etat !== 'ok' ? 'err' : s.nonLus ? 'warn' : '');
      c.textContent = (s.icone || '📨') + ' ' + String(s.nom || s.id).split(' · ')[0] + (s.etat !== 'ok' ? ' · indisponible' : s.nonLus ? ' · ' + s.nonLus : '');
      srcs.appendChild(c);
    });
    if (srcs.childNodes.length) z.appendChild(srcs);
    var liste = document.createElement('div'); liste.className = 'mess';
    (D.messages || []).slice(0, 4).forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.className = m.nonLus ? 'nv' : '';
      var q = document.createElement('div'); q.className = 'qui'; q.textContent = (m.nonLus ? '● ' : '') + (m.de || '?') + ' · ' + String(m.app || '').replace('.kd-mc.com', '');
      var t = document.createElement('div'); t.className = 'quoi'; t.textContent = m.texte || '';
      b.appendChild(q); b.appendChild(t); b.onclick = function () { aller('boite'); };
      liste.appendChild(b);
    });
    if (liste.childNodes.length) z.appendChild(liste);
  }

  function surBoite(D) { BOITE = D; dessinerCompteurs(); dessinerAttente(D); dessinerMessages(D); }

  function brancherRecherche() {
    var q = document.getElementById('tb-q'), r = document.getElementById('tb-res');
    function maj() {
      var l = filtrer(q.value);
      r.textContent = '';
      if (!q.value.trim()) { r.hidden = true; return; }
      if (!l.length) { var p = document.createElement('div'); p.className = 'rien'; p.textContent = 'Rien trouvé. Essaie un autre mot (ex. « inscription », « vente », « code »).'; r.appendChild(p); }
      l.slice(0, 8).forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-action', a.go);
        b.textContent = a.t;
        var sp = document.createElement('span'); sp.textContent = /^(https?:)?\//.test(a.go) ? 'ouvrir ›' : 'aller ›'; b.appendChild(sp);
        b.onclick = function () { q.value = ''; r.hidden = true; r.textContent = ''; aller(a.go); };
        r.appendChild(b);
      });
      r.hidden = false;
    }
    q.addEventListener('input', maj);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = r.querySelector('button'); if (f) f.click(); } });
  }

  function lireJson(url) { return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  function lireAnnexes() {
    lireJson('apps-versions.json').then(function (j) {
      rangerTuiles(j && j.apps);
      var i = document.getElementById('tb-versions-info');
      if (i && j && j.genere) i.textContent = 'Toutes les apps du domaine. Version relevée dans le dépôt le ' + j.genere.split('-').reverse().join('.') + ' (la bulle de chaque app dit la version en direct).';
      versHash();
    });
    lireJson('/CMCteams/tools/health/workers-status.json').then(function (j) {
      var el = document.getElementById('tb-sante'); if (!el) return;
      if (!j || !j.workers) { el.textContent = 'Santé des services : relevé indisponible pour l\'instant.'; return; }
      var w = Object.keys(j.workers), up = w.filter(function (k) { return j.workers[k].up; }).length;
      var age = j.checked_at ? Math.floor((Date.now() - new Date(j.checked_at).getTime()) / 864e5) : null;
      el.textContent = (up === w.length && !(age > 2) ? '✅ ' : '⚠️ ') + up + '/' + w.length + ' services en ligne'
        + (j.checked_at ? ' · relevé le ' + new Date(j.checked_at).toLocaleDateString('fr-FR') : '') + (age != null && age > 2 ? ' — ⚠️ relevé ancien (' + age + ' j)' : '');
    });
    fetch('/__lingua/depense', { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var el = document.getElementById('tb-openai'); if (!el) return;
      el.textContent = j && j.ok ? 'OpenAI, 30 derniers jours : ' + (j.totalVoix || 0) + ' voix payée(s) · ' + (j.totalAppels || 0) + ' appel(s) en direct.' : 'OpenAI : chiffres indisponibles pour l\'instant.';
    }).catch(function () { var el = document.getElementById('tb-openai'); if (el) el.textContent = 'OpenAI : chiffres indisponibles pour l\'instant.'; });
  }

  /* Les anciennes adresses mènent ici (commerce.html → /admin/#commerce, openai.html → /admin/#couts) : on amène la section à l'écran. */
  function versHash() {
    var h = (location.hash || '').slice(1);
    if (h && SECTIONS.some(function (s) { return s.id === h; })) { var el = document.getElementById(h); if (el) { el.open = true; try { el.scrollIntoView({ block: 'start' }); } catch (e) { /* */ } } }
  }

  function demarrer(s) {
    coquille();
    dessinerCompteurs();
    brancherRecherche();
    document.getElementById('tb-boite').onclick = function () { aller('boite'); };
    document.addEventListener('kdmc-commerce-live', function (e) { LIVE = e.detail || null; LIVE_LU = true; dessinerCompteurs(); });
    if (global.kdmcAdmin) global.kdmcAdmin.monter(document.getElementById('admin-comptes'));
    /* 10.10 (réactivité) : la session DÉJÀ vérifiée ici (admin + Face ID) est passée au commerce — il ne redemande plus whoami
       (mesuré : un 2e whoami en série avant même de lire ses données, 1,5 s de plus sur réseau mobile). Le serveur garde son verrou. */
    if (global.kdmcCommerce && global.kdmcCommerce.monter) global.kdmcCommerce.monter(document.getElementById('commerce-app'), s);
    if (global.kdmcBoite) {
      global.kdmcBoite.surMaj(surBoite);
      global.kdmcBoite.rafraichir();
      setInterval(function () { if (document.visibilityState === 'visible') global.kdmcBoite.rafraichir(); }, 30000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') global.kdmcBoite.rafraichir(); });
    }
    lireAnnexes();
    window.addEventListener('hashchange', versHash);
  }

  function boot() {
    if (global.kdmcSSO && global.kdmcSSO.consumeHashToken) global.kdmcSSO.consumeHashToken();
    var who = global.kdmcSSO ? global.kdmcSSO.whoami() : Promise.resolve(null);
    who.then(function (s) {
      if (!s || !s.admin || !s.verified) return deny(s);
      demarrer(s);
    }).catch(function () { deny(null); });
  }
  if (app) boot();
})(typeof window !== 'undefined' ? window : globalThis);
