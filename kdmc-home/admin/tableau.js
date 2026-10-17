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

  /* Raccourcis de l'accueil : les gestes les plus fréquents, un toucher chacun. */
  var RACCOURCIS = [
    ['➕ Créer un compte', '#creer-invite'], ['🚫 Bannir ou supprimer quelqu\'un', '#list'], ['⛔ Fermer une app pour tous', '#fermgen'],
    ['📬 Lire les messages', 'boite'], ['📦 Livrer une commande', 'livrer'], ['🎁 Inviter gratuitement', '#inviter']
  ];
  /* SOUS-CATÉGORIES (onglets) de « Personnes & comptes » : on range les blocs déjà construits par admin.js et la boîte, sans les refaire.
     id du bloc → onglet ; un titre (h2.cat) → l'onglet des blocs qui le suivent. Les autres rubriques sont découpées par leurs titres. */
  var ONGLETS_PERSONNES = [['trancher', '✋ À trancher'], ['comptes', '👤 Comptes'], ['connectes', '🟢 Connectés'], ['bloquer', '🚫 Bloquer & bannir'], ['creer', '➕ Créer'], ['journal', '🕘 Historique']];
  var PAR_ID = { 'tb-creer': 'creer', 'creer-invite': 'creer', presence: 'connectes', fermgen: 'bloquer', fermlot: 'bloquer', bannis: 'bloquer', audsec: 'journal' };
  function ongletDuTitre(sec, txt) {
    var t = sansAccent(txt);
    if (sec !== 'personnes') return 'o-' + t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    if (/trancher/.test(t)) return 'trancher';
    if (/historique|qui se connecte|journal/.test(t)) return 'journal';
    if (/connect/.test(t)) return 'connectes';
    return 'comptes';
  }
  /* PUR (testé) : la liste des blocs d'une rubrique → [{el, onglet}] et les onglets dans l'ordre. `blocs` : [{id, cls, titre}]. */
  function classerBlocs(sec, blocs) {
    var cur = sec === 'personnes' ? 'trancher' : 'o-apercu', out = [], vus = [], noms = {};
    if (sec !== 'personnes') noms['o-apercu'] = 'Aperçu';
    blocs.forEach(function (b) {
      var o = sec === 'personnes' && b.id && PAR_ID[b.id] ? PAR_ID[b.id] : null;
      if (!o && sec === 'personnes' && /\bnote\b/.test(b.cls || '')) o = 'comptes';
      if (!o && b.titre != null) { cur = ongletDuTitre(sec, b.titre); o = cur; if (sec !== 'personnes') noms[cur] = String(b.titre).trim(); }
      if (!o) o = cur;
      out.push(o); if (vus.indexOf(o) < 0) vus.push(o);
    });
    var ordre = sec === 'personnes' ? ONGLETS_PERSONNES.map(function (x) { return x[0]; }).filter(function (k) { return vus.indexOf(k) >= 0; }) : vus;
    var lib = {}; ONGLETS_PERSONNES.forEach(function (x) { lib[x[0]] = x[1]; });
    return { par: out, onglets: ordre.map(function (k) { return { id: k, t: sec === 'personnes' ? lib[k] : noms[k] || k }; }) };
  }

  /* « Que veux-tu faire ? » — chaque action mène quelque part de précis. */
  var ACTIONS = [
    { t: 'Lire et répondre aux messages', k: 'message boite repondre lire mail whatsapp', go: 'boite' },
    { t: 'Valider une inscription', k: 'inscription valider accepter nouveau compte cmcteams', go: '#tb-attente' },
    { t: 'Accepter ou refuser un code', k: 'code valider accepter refuser connexion inconnue', go: '#tb-attente' },
    { t: 'Comptes en attente de leur mail de confirmation', k: 'mail inscription accepter refuser attente', go: '#tb-attente' },
    { t: 'Voir qui est connecté', k: 'connecte en ligne presence qui', go: '#presence' },
    { t: 'Fiche d\'une personne', k: 'fiche client compte personne appareil lieu', go: '#list' },
    { t: 'Où une personne peut aller (périmètre)', k: 'perimetre acces app bloquer fermer autoriser', go: '#list' },
    { t: 'Déconnecter quelqu\'un partout', k: 'deconnecter revoquer session vole perdu', go: '#list' },
    { t: 'Supprimer un compte', k: 'supprimer effacer compte personne retirer', go: '#list' },
    { t: 'Bannir quelqu\'un (ne pourra plus se réinscrire)', k: 'bannir ban interdire reinscrire supprimer', go: '#list' },
    { t: 'Personnes bannies (réautoriser)', k: 'bannis bannir liste reautoriser debannir', go: '#bannis' },
    { t: 'Pourquoi une personne est bloquée (état du compte)', k: 'etat compte bloque pourquoi ouvrir attente', go: '#list' },
    { t: 'Bloquer une personne sur une app', k: 'bloquer personne app fermer acces perimetre', go: '#list' },
    { t: 'Fermer une app pour tout le monde', k: 'fermer app tout le monde general bloquer site', go: '#fermgen' },
    { t: 'Fermer ou rouvrir des apps à plusieurs personnes', k: 'fermer rouvrir plusieurs personnes lot apps', go: '#fermlot' },
    { t: 'Créer un compte pour une personne', k: 'creer compte invite nouvelle personne inscrire', go: '#creer-invite' },
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
  /* L'INSTANTANÉ DU DERNIER RELEVÉ (13.10, Kevin : « la zone du haut apparaît tard ») : des NOMBRES seulement (jamais un nom, jamais un message),
     gardés sur l'appareil par surBoite() et redessinés dès que le domaine a dit « admin vérifié ». Il a une date : on ne le présente jamais comme neuf. */
  var CLE_CPTS = 'kdmc_tb_cpts', INST_MAX = 864e5;
  function nb(x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x < 1e6 ? Math.floor(x) : null; }
  function instantane(D, livrer) {
    var o = { ts: Date.now() };
    o.nonLus = nb(D && D.nonLus) || 0; o.nonLusAlertes = nb(D && D.nonLusAlertes) || 0; o.connectes = nb(D && D.connectes) || 0;
    o.inscriptions = ((D && D.inscriptions) || []).length; o.codes = ((D && D.codes) || []).length;
    o.sansWhatsapp = D && Array.isArray(D.inscriptionsAdmin) ? D.inscriptionsAdmin.length : null;
    o.livrer = nb(livrer);
    return o;
  }
  function instantaneValide(j) {
    if (!j || typeof j !== 'object' || typeof j.ts !== 'number' || !isFinite(j.ts) || Date.now() - j.ts > INST_MAX || j.ts > Date.now() + 6e4) return null;
    var o = { ts: j.ts };
    ['nonLus', 'nonLusAlertes', 'connectes', 'inscriptions', 'codes', 'sansWhatsapp', 'livrer'].forEach(function (k) { o[k] = nb(j[k]); });
    return o.nonLus == null && o.inscriptions == null && o.livrer == null ? null : o;
  }
  /* un faux « relevé de la boîte » fait des seuls nombres : compteurs() n'a ainsi qu'UN chemin de calcul (le même, vrai ou en cache) */
  function depuisInstantane(inst) {
    if (!inst) return null;
    var tab = function (n) { return new Array(n || 0); };
    return { nonLus: inst.nonLus || 0, nonLusAlertes: inst.nonLusAlertes || 0, connectes: inst.connectes || 0, inscriptions: tab(inst.inscriptions), codes: tab(inst.codes),
      inscriptionsAdmin: inst.sansWhatsapp == null ? undefined : tab(inst.sansWhatsapp) };
  }
  function ilYa(ts) {
    var m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    return m < 1 ? 'à l\'instant' : m < 60 ? 'il y a ' + m + ' min' : 'il y a ' + Math.floor(m / 60) + ' h';
  }

  function compteurs(boite, live, liveLu, inst) {
    var b = boite || depuisInstantane(inst);
    var lAdmin = b && Array.isArray(b.inscriptionsAdmin) ? b.inscriptionsAdmin.length : null;
    return [
      { id: 'messages', l: 'Messages non lus', n: b ? (b.nonLus || 0) : null, s: b && b.nonLusAlertes ? '+ ' + b.nonLusAlertes + ' alerte(s)' : 'toutes les apps' },
      { id: 'inscriptions', l: 'Inscriptions en attente', n: b ? (b.inscriptions || []).length : null, s: 'CMCteams' },
      { id: 'codes', l: 'Codes à valider', n: b ? (b.codes || []).length : null, s: 'appareil inconnu' },
      { id: 'sansWhatsapp', l: 'Comptes en attente de leur mail', n: lAdmin, s: 's\'ouvrent seuls au clic · ou ouvre/refuse ici', cache: !b || lAdmin === null },
      { id: 'livrer', l: 'Ventes à livrer', n: live && live.file ? (live.file.n || 0) : (!liveLu && inst && inst.livrer != null ? inst.livrer : null),
        s: live ? (live.intentions && live.intentions.n ? live.intentions.n + ' panier(s) ouvert(s)' : 'file à valider') : (liveLu ? 'caisse injoignable' : 'lecture de la caisse…') }
    ];
  }

  var API = { esc: esc, ranger: ranger, filtrer: filtrer, compteurs: compteurs, instantane: instantane, instantaneValide: instantaneValide, classerBlocs: classerBlocs, SECTIONS: SECTIONS, ACTIONS: ACTIONS, RACCOURCIS: RACCOURCIS };
  global.kdmcTableau = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  /* ── DOM ─────────────────────────────────────────────────────────────────────────────────────────── */
  var app = document.getElementById('app');
  var BOITE = null, LIVE = null, LIVE_LU = false, empAttente = '', empMess = '', INST = null;

  /* L'instantané ne vit que dans le stockage de CET appareil, en try/catch partout (mode privé, stockage plein, accès refusé : la page marche sans). */
  function lireInstantane() { try { return instantaneValide(JSON.parse(localStorage.getItem(CLE_CPTS) || 'null')); } catch (e) { return null; } }
  function garderInstantane(o) { try { localStorage.setItem(CLE_CPTS, JSON.stringify(o)); } catch (e) { /* */ } }
  function oublierInstantane() {
    INST = null;
    try { localStorage.removeItem(CLE_CPTS); } catch (e) { /* */ }
    try { if (global.kdmcBoite && global.kdmcBoite.oublier) global.kdmcBoite.oublier(); } catch (e) { /* */ }
  }

  function deny(s) {
    oublierInstantane();   /* pas (ou plus) admin vérifié : on ne garde rien du dernier relevé */
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
      /* 16.10 soir (Kevin : « Affiche ici un visuel des connectés live ») : qui est sur le domaine EN CE MOMENT, sous « À traiter ».
         Données : la boîte (présence D1, robots exclus), relue toutes les 15 s quand la page est visible. Toucher une personne → sa fiche. */
      + '<section class="live" id="tb-live" aria-label="En ligne maintenant" aria-live="polite"><h2><span class="pt" aria-hidden="true"></span>En ligne maintenant <b id="tb-live-n">…</b></h2><div class="live-l" id="tb-live-l"><p class="live-vide">Lecture…</p></div></section>'
      + '<nav class="tbnav" id="tb-nav" aria-label="Sections"><a class="retour-tb" href="#" id="tb-retour">← Tableau de bord</a>' + SECTIONS.map(function (s) { return '<a href="#' + s.id + '" data-nav="' + s.id + '">' + s.ic + ' ' + esc(s.t.split(' ')[0]) + '</a>'; }).join('') + '</nav>'
      + '<div class="cherche"><input id="tb-q" type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" placeholder="🔎 Que veux-tu faire ?" aria-label="Que veux-tu faire ?"><div class="res" id="tb-res" hidden></div></div>'
      /* 16.10 (Kevin : « je passe mon temps à tout descendre, je trouve jamais rien ») : un ACCUEIL de 7 grandes tuiles, puis une seule
         rubrique à la fois, découpée en onglets (sous-catégories). Plus de longue page à descendre. */
      + '<section class="accueil" id="tb-accueil" aria-label="Rubriques"><div class="tuiles-sec">' + SECTIONS.map(function (s) {
        return '<a class="tuile-sec" href="#' + s.id + '" data-tuile="' + s.id + '"><span class="ic">' + s.ic + '</span><span class="tt"><b>' + esc(s.t) + '</b><span class="r" data-resume="' + s.id + '">' + esc(s.s) + '</span></span><span class="bd" data-badge="' + s.id + '" hidden></span></a>';
      }).join('') + '</div>'
      + '<h2 class="cat">⚡ Raccourcis</h2><div class="raccourcis">' + RACCOURCIS.map(function (r, i) { return '<button type="button" class="racc" data-racc="' + i + '">' + esc(r[0]) + '</button>'; }).join('') + '</div></section>';
    SECTIONS.forEach(function (s) {
      h += '<details class="sec hors-vue" id="' + s.id + '" open><summary><span class="ic">' + s.ic + '</span><span class="tt"><b>' + esc(s.t) + '</b><span>' + esc(s.s) + '</span></span></summary><div class="corps" id="corps-' + s.id + '"></div></details>';
    });
    app.innerHTML = h;
    /* une section absente ne doit jamais emporter les autres : chaque corps est posé seulement s'il existe */
    var C = function (id) { return document.getElementById('corps-' + id) || document.createElement('div'); };
    C('personnes').innerHTML = '<button class="grosbtn" id="tb-creer" type="button">➕ Créer un compte pour une personne</button><h2 class="cat">✋ À trancher</h2><div class="bb" id="tb-attente"><p class="info">Lecture de la boîte…</p></div>'
      + '<h2 class="cat">🔎 Qui se connecte</h2><div class="grid" id="tuiles-personnes"></div><div id="admin-comptes"></div>';
    C('messages').innerHTML = '<div id="tb-messages"><p class="info">Lecture de la boîte…</p></div><button class="grosbtn" id="tb-boite" type="button">📬 Ouvrir la boîte — lire et répondre</button>';
    C('commerce').innerHTML = '<div id="commerce-app"></div><h2 class="cat">🔗 Mes pages de vente & boutiques</h2><div class="grid" id="tuiles-commerce"></div>';
    C('apps').innerHTML = '<p class="info" id="tb-versions-info">Toutes les apps du domaine. La version affichée est celle du dépôt.</p><div class="grid" id="tuiles-apps"></div>';
    C('ia').innerHTML = '<p class="info lien-info" id="tb-sante" data-va="https://github.com/9r4rxssx64-creator/cmcteams/actions">Santé des services : lecture…</p><div class="grid" id="tuiles-ia"></div>';
    C('couts').innerHTML = '<p class="info lien-info" id="tb-openai" data-va="/admin/openai.html">OpenAI : lecture…</p><p class="info">Règle : tout reste <b>gratuit</b> ; rien de payant ne s\'allume sans ton accord.</p><div class="grid" id="tuiles-couts"></div>';
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

  /* ── VUES : l'accueil (tuiles) OU une rubrique, et dans la rubrique UN onglet à la fois. L'adresse le dit (#personnes/bloquer) :
     le bouton retour du téléphone marche, et chaque endroit a son lien direct. */
  var VUE = 'accueil', ONGLET = {};
  /* Le libellé d'onglet = le texte du titre SANS ses boutons (« ↻ Relire la caisse » n'est pas un nom). */
  function titreSeul(h) { var c = h.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('button,a,.btn'), function (x) { x.remove(); }); return c.textContent.replace(/\s+/g, ' ').trim(); }
  function blocsDe(sec) {
    var corps = document.getElementById('corps-' + sec); if (!corps) return [];
    var l = [];
    for (var i = 0; i < corps.children.length; i++) {
      var c = corps.children[i];
      if (c.classList.contains('onglets')) continue;
      if (c.id === 'admin-comptes' || c.id === 'commerce-app') { for (var j = 0; j < c.children.length; j++) l.push(c.children[j]); continue; }
      l.push(c);
    }
    return l;
  }
  function appliquerOnglets(sec) {
    var corps = document.getElementById('corps-' + sec); if (!corps) return;
    var els = blocsDe(sec);
    var r = classerBlocs(sec, els.map(function (e) { return { id: e.id || '', cls: e.className || '', titre: e.matches && e.matches('h2.cat') ? titreSeul(e) : null }; }));
    var barre = corps.querySelector(':scope > .onglets');
    if (r.onglets.length < 2) { if (barre) barre.remove(); els.forEach(function (e) { e.classList.remove('hors-onglet'); }); return; }
    var actif = ONGLET[sec] && r.onglets.some(function (o) { return o.id === ONGLET[sec]; }) ? ONGLET[sec] : r.onglets[0].id;
    ONGLET[sec] = actif;
    if (!barre) { barre = document.createElement('div'); barre.className = 'onglets'; barre.setAttribute('role', 'tablist'); corps.insertBefore(barre, corps.firstChild); }
    var sig = r.onglets.map(function (o) { return o.id; }).join('|') + '#' + actif;
    if (barre.getAttribute('data-sig') !== sig) {
      barre.setAttribute('data-sig', sig); barre.textContent = '';
      r.onglets.forEach(function (o) {
        var a = document.createElement('a'); a.href = '#' + sec + '/' + o.id; a.setAttribute('role', 'tab'); a.setAttribute('data-onglet-btn', o.id);
        a.setAttribute('aria-selected', o.id === actif ? 'true' : 'false'); a.textContent = o.t;
        barre.appendChild(a);
      });
    }
    els.forEach(function (e, i) { e.setAttribute('data-onglet', r.par[i]); e.classList.toggle('hors-onglet', r.par[i] !== actif); });
    badgesOnglets();
  }
  function montrerVue(sec, onglet) {
    VUE = SECTIONS.some(function (x) { return x.id === sec; }) ? sec : 'accueil';
    if (onglet && VUE !== 'accueil') ONGLET[VUE] = onglet;
    document.body.setAttribute('data-vue', VUE);
    SECTIONS.forEach(function (x) { var d = document.getElementById(x.id); if (!d) return; d.classList.toggle('hors-vue', x.id !== VUE); if (x.id === VUE) d.open = true; });
    var t = document.getElementById('tb-vue-titre'), S = SECTIONS.filter(function (x) { return x.id === VUE; })[0];
    if (t) t.textContent = S ? S.ic + ' ' + S.t : '';
    var navs = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < navs.length; i++) navs[i].setAttribute('aria-current', navs[i].getAttribute('data-nav') === VUE ? 'page' : 'false');
    if (VUE !== 'accueil') appliquerOnglets(VUE);
  }
  function ongletDe(el) { for (var p = el; p; p = p.parentElement) { var o = p.getAttribute && p.getAttribute('data-onglet'); if (o) return o; } return null; }
  /* « cat:Mot » = le titre de rubrique (h2.cat) qui contient ce mot — une carte mène à SON onglet sans connaître son identifiant. */
  function cibleVa(v) {
    v = String(v || '');
    if (v.indexOf('journal:') === 0) { if (global.kdmcFiltreJournal) global.kdmcFiltreJournal(v.slice(8)); return document.getElementById('audsec') || '#audsec'; }
    if (v.indexOf('fiche:') === 0) { if (global.kdmcFiltreJournal) global.kdmcFiltreJournal(''); return document.getElementById('fiche-' + v.slice(6)); }
    if (v.indexOf('cat:') !== 0) return v;
    var mot = sansAccent(v.slice(4)), hs = document.querySelectorAll('h2.cat');
    for (var i = 0; i < hs.length; i++) if (sansAccent(titreSeul(hs[i])).indexOf(mot) >= 0) return hs[i];
    return null;
  }
  function aller(cible) {
    if (cible && cible.nodeType === 1 && cible.tagName === 'DETAILS' && cible.classList.contains('fiche')) cible.open = true;   /* fiche repliée par défaut : celle qu'on vise s'ouvre */
    if (cible === 'boite') { if (global.kdmcBoite) global.kdmcBoite.ouvrir(); return; }
    var el = cible && cible.nodeType === 1 ? cible : null;
    if (el) cible = '';
    if (cible === 'livrer') {
      el = document.querySelector('#commerce-app [data-valider], #commerce-app [data-refuser]');
      if (el) el = el.closest('.tile') || el; else cible = '#commerce';
    }
    /* admin.kd-mc.com : le pass du domaine voyage avec (app installée, cookies à part — voir admin.js ouvrirAvecPass) */
    if (!el && /^https:\/\/admin\.kd-mc\.com\//.test(cible) && global.kdmcOuvrirAvecPass) { global.kdmcOuvrirAvecPass(cible); return; }
    if (!el && /^(https?:)?\//.test(cible)) { location.href = cible; return; }
    if (!el && cible) { try { el = document.querySelector(cible); } catch (e) { el = null; } }
    if (!el) el = document.getElementById('commerce');
    var sec = el.closest && el.closest('details.sec');
    if (!sec) return;
    if (el === sec) { if (location.hash !== '#' + sec.id) location.hash = '#' + sec.id; else montrerVue(sec.id); try { window.scrollTo(0, 0); } catch (e) { /* */ } return; }
    montrerVue(sec.id);                       /* classe les blocs, puis trouve l'onglet du bloc visé */
    var o = ongletDe(el);
    var h = '#' + sec.id + (o ? '/' + o : '');
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { /* */ } }
    montrerVue(sec.id, o);
    ouvrirParents(el);
    try { el.scrollIntoView({ block: 'start' }); } catch (e) { /* */ }
    if (/^(INPUT|SELECT)$/.test(el.tagName)) { try { el.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  function ouvrirParents(el) { for (var p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; }

  function dessinerCompteurs() {
    var vieux = !BOITE && !!INST;   /* chiffres d'un relevé précédent, en attendant la boîte : jamais présentés comme neufs */
    var cs = compteurs(BOITE, LIVE, LIVE_LU, INST), z = document.getElementById('tb-cpts'); if (!z) return;
    var total = 0;
    z.textContent = '';
    cs.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-compteur', c.id);
      var perime = vieux && c.n != null && !(c.id === 'livrer' && LIVE);
      b.className = 'cpt' + (c.n == null ? ' inconnu' : c.n > 0 ? ' urgent' : '') + (perime ? ' perime' : '');
      if (perime) b.setAttribute('data-releve', String(INST.ts));
      if (c.cache) b.hidden = true;
      var n = document.createElement('span'); n.className = 'n'; n.textContent = c.n == null ? (c.id === 'livrer' && LIVE_LU ? '—' : '…') : String(c.n);
      var l = document.createElement('span'); l.className = 'l'; l.textContent = c.l;
      var s = document.createElement('span'); s.className = 's'; s.textContent = perime ? 'dernier relevé · ' + ilYa(INST.ts) : c.s;
      b.appendChild(n); b.appendChild(l); b.appendChild(s);
      b.onclick = function () { aller(c.id === 'messages' ? 'boite' : c.id === 'livrer' ? 'livrer' : '#tb-attente'); };
      if (!c.cache && c.n) total += c.n;
      z.appendChild(b);
    });
    var sous = document.getElementById('tb-sous');
    if (sous) sous.textContent = !BOITE
      ? (INST ? 'Dernier relevé ' + ilYa(INST.ts) + (total ? ' : ' + total + ' chose' + (total > 1 ? 's' : '') + '.' : ' : rien en attente.') + ' Mise à jour en cours…' : 'Lecture en cours…')
      : total ? total + ' chose' + (total > 1 ? 's' : '') + ' t\'attend' + (total > 1 ? 'ent' : '') + '. Touche un chiffre pour y aller.' : '✅ Rien en attente pour l\'instant.';
    try { document.title = (BOITE && total ? '(' + total + ') ' : '') + 'KDMC — Tableau de bord admin'; } catch (e) { /* */ }
    resumes(cs); badgesOnglets();
    var nav = document.querySelector('[data-nav="personnes"]');
    if (nav) { var x = nav.querySelector('b'); var np = cs.filter(function (c) { return /inscriptions|codes|sansWhatsapp/.test(c.id) && !c.cache; }).reduce(function (t, c) { return t + (c.n || 0); }, 0); if (np && BOITE) { if (!x) { x = document.createElement('b'); nav.appendChild(x); } x.textContent = String(np); } else if (x) x.remove(); }
    var nm = document.querySelector('[data-nav="messages"]');
    if (nm) { var y = nm.querySelector('b'); var nn = BOITE ? BOITE.nonLus || 0 : 0; if (nn) { if (!y) { y = document.createElement('b'); nm.appendChild(y); } y.textContent = String(nn); } else if (y) y.remove(); }
  }

  /* En attendant la boîte : le dernier relevé en NOMBRES (jamais un nom ni un message), daté — sinon le petit « Lecture… » d'avant. */
  function dessinerEnAttendant() {
    if (!INST) return;
    var quand = ilYa(INST.ts);
    var ph = function (id, t) { var z = document.getElementById(id); if (!z) return; z.textContent = ''; var p = document.createElement('p'); p.className = 'info attend'; p.textContent = t; z.appendChild(p); };
    var aTrancher = (INST.inscriptions || 0) + (INST.codes || 0) + (INST.sansWhatsapp || 0);
    ph('tb-attente', 'Dernier relevé ' + quand + ' : ' + (aTrancher ? aTrancher + ' à trancher' : 'rien à trancher') + '. Mise à jour en cours…');
    ph('tb-messages', 'Dernier relevé ' + quand + ' : ' + (INST.nonLus ? INST.nonLus + ' message(s) non lu(s)' : 'aucun message non lu') + '. Mise à jour en cours…');
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
    /* chaque morceau de la phrase mène à sa page : les non-lus → la boîte, les connectés → « Connectés » */
    var pNl = document.createElement('span'); pNl.setAttribute('data-va', 'boite'); pNl.className = 'lien-info';
    pNl.textContent = D.nonLus ? D.nonLus + ' message(s) non lu(s)' : 'Aucun message non lu';
    var pCo = document.createElement('span'); pCo.setAttribute('data-va', '#presence'); pCo.className = 'lien-info';
    pCo.textContent = (D.connectes || 0) + ' personne(s) connectée(s)';
    p.textContent = ''; p.appendChild(pNl); p.appendChild(document.createTextNode(' · ')); p.appendChild(pCo);
    z.appendChild(p);
    var srcs = document.createElement('div'); srcs.className = 'srcs';
    (D.sources || []).forEach(function (s) {
      if (!s.total && s.etat === 'ok') return;
      var c = document.createElement('span'); c.className = 'chip ' + (s.etat !== 'ok' ? 'err' : s.nonLus ? 'warn' : ''); c.setAttribute('data-va', 'boite');
      c.textContent = (s.icone || '📨') + ' ' + String(s.nom || s.id).split(' · ')[0] + (s.etat !== 'ok' ? ' · indisponible' : s.nonLus ? ' · ' + s.nonLus : '');
      srcs.appendChild(c);
    });
    if (srcs.childNodes.length) z.appendChild(srcs);
    var liste = document.createElement('div'); liste.className = 'mess';
    (D.messages || []).slice(0, 4).forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.className = m.nonLus ? 'nv' : '';
      var q = document.createElement('div'); q.className = 'qui'; q.textContent = (m.nonLus ? '● ' : '') + (m.de || '?') + ' · ' + String(m.app || '').replace('.kd-mc.com', '');
      var t = document.createElement('div'); t.className = 'quoi'; t.textContent = m.texte || '';
      b.appendChild(q); b.appendChild(t); b.onclick = function () { if (global.kdmcBoite) global.kdmcBoite.ouvrir(m.cle); else aller('boite'); };   /* la ligne touchée ouvre CE message */
      liste.appendChild(b);
    });
    if (liste.childNodes.length) z.appendChild(liste);
  }

  function surBoite(D) { BOITE = D; INST = instantane(D, LIVE && LIVE.file ? LIVE.file.n || 0 : null); garderInstantane(INST); dessinerCompteurs(); dessinerAttente(D); dessinerMessages(D); dessinerLive(D); }

  /* LES CONNECTÉS EN DIRECT : une pastille par personne (initiales, nom, l'app où elle est, depuis quand). Construit en DOM (textContent),
     jamais en innerHTML : un nom vient d'un visiteur. Le « il y a » se recalcule toutes les 15 s sans relire le domaine. */
  var NOMS_APPS = { cmcteams: 'CMCteams', 'cmcteams-light': 'CMCteams light', departs: 'Light', lingua: 'Lingua', arbre: 'Arbre', apex: 'Apex', 'apex-ai': 'Apex', 'apex-chat': 'Apex Chat', kit: 'Kit', croupier: 'Croupier', shops: 'Boutiques', 'la-detente': 'La Détente', 'chez-lolo': 'Chez Lolo', rotaplan: 'Rotaplan', portail: 'Portail', 'kd-mc.com': 'Portail' };
  function nomApp(a) { a = String(a || '').replace(/\.kd-mc\.com$/, ''); return NOMS_APPS[a] || (a ? a.charAt(0).toUpperCase() + a.slice(1) : 'le domaine'); }
  function initiales(n) { var m = String(n || '?').trim().split(/\s+/).filter(Boolean); return ((m[0] || '?').charAt(0) + (m.length > 1 ? m[m.length - 1].charAt(0) : '')).toUpperCase(); }
  var empLive = '';
  function dessinerLive(D) {
    var l = Array.isArray(D && D.enLigne) ? D.enLigne : [];
    var n = document.getElementById('tb-live-n'), z = document.getElementById('tb-live-l'), sec = document.getElementById('tb-live');
    if (!z || !n) return;
    n.textContent = String(l.length);
    if (sec) sec.classList.toggle('a-du-monde', l.length > 0);
    var e = JSON.stringify(l.map(function (x) { return [x.uid, x.app, Math.floor((Date.now() - x.ts) / 60000)]; }));
    if (e === empLive) return; empLive = e;
    z.textContent = '';
    if (!l.length) { var v = document.createElement('p'); v.className = 'live-vide'; v.textContent = 'Personne d\'autre que toi pour le moment.'; z.appendChild(v); return; }
    l.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'live-p'; b.setAttribute('data-va', 'fiche:' + x.uid);
      var av = document.createElement('span'); av.className = 'av'; av.textContent = initiales(x.nom); av.setAttribute('aria-hidden', 'true');
      var t = document.createElement('span'); t.className = 'tx';
      var nm = document.createElement('b'); nm.textContent = x.nom || 'Quelqu\'un';
      var o = document.createElement('span'); o.className = 'ou'; o.textContent = nomApp(x.app) + ' · ' + ilYa(x.ts);
      t.appendChild(nm); t.appendChild(o); b.appendChild(av); b.appendChild(t);
      b.setAttribute('aria-label', (x.nom || 'Quelqu\'un') + ', sur ' + nomApp(x.app) + ', ' + ilYa(x.ts) + ' — ouvrir sa fiche');
      z.appendChild(b);
    });
  }

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
    var h = decodeURIComponent((location.hash || '').slice(1)), m = h.split('/');
    if (!h) { montrerVue('accueil'); return; }
    if (SECTIONS.some(function (s) { return s.id === m[0]; })) { montrerVue(m[0], m[1] || null); try { window.scrollTo(0, 0); } catch (e) { /* */ } return; }
    /* une ancre d'avant (#list, #presence, #inviter…) : on va au bon endroit, dans la bonne rubrique et le bon onglet */
    if (/^[A-Za-z][\w-]*$/.test(h) && document.getElementById(h)) { aller('#' + h); return; }
    /* #fiche-<uid> (depuis la boîte « Sa fiche admin ») : les fiches arrivent après — on les attend 8 s au plus */
    if (/^fiche-/.test(h)) { montrerVue('personnes', 'comptes'); var t0 = Date.now(); (function attendre() { var f = document.getElementById(h); if (f) { aller(f); return; } if (Date.now() - t0 < 8000) setTimeout(attendre, 200); })(); return; }
    montrerVue('accueil');
  }
  function badgesOnglets() {
    var b = BOITE, n = b ? (b.inscriptions || []).length + (b.codes || []).length + (Array.isArray(b.inscriptionsAdmin) ? b.inscriptionsAdmin.length : 0) : 0;
    var vals = { trancher: n, connectes: b ? b.connectes || 0 : 0 };
    Object.keys(vals).forEach(function (k) {
      var a = document.querySelector('#corps-personnes .onglets [data-onglet-btn="' + k + '"]'); if (!a) return;
      var x = a.querySelector('b'); if (vals[k]) { if (!x) { x = document.createElement('b'); a.appendChild(x); } x.textContent = String(vals[k]); } else if (x) x.remove();
    });
  }
  function resumes(cs) {
    var b = BOITE, val = function (id) { var c = cs.filter(function (x) { return x.id === id; })[0]; return c && !c.cache ? c.n : null; };
    var trancher = (val('inscriptions') || 0) + (val('codes') || 0) + (val('sansWhatsapp') || 0);
    var badge = { personnes: trancher, messages: val('messages') || 0, commerce: val('livrer') || 0 };
    var txt = {
      personnes: b ? (trancher ? trancher + ' à trancher · ' : '') + (b.connectes || 0) + ' connecté(s)' : null,
      messages: b ? (b.nonLus ? b.nonLus + ' non lu(s)' : 'Tout est lu') : null,
      commerce: val('livrer') != null ? (val('livrer') ? val('livrer') + ' vente(s) à livrer' : 'Rien à livrer') : null
    };
    SECTIONS.forEach(function (s) {
      var bd = document.querySelector('[data-badge="' + s.id + '"]'); if (bd) { bd.hidden = !badge[s.id]; bd.textContent = badge[s.id] ? String(badge[s.id]) : ''; }
      var r = document.querySelector('[data-resume="' + s.id + '"]'); if (r && txt[s.id]) r.textContent = txt[s.id];
    });
  }

  function demarrer(s) {
    coquille();
    /* 16.10 (Kevin : « toutes infos doit être cliquable et atterrir au bon endroit ») : tout ce qui porte data-va (pastilles, cartes de chiffres)
       mène à son bloc et à son onglet, au doigt comme au clavier. Un seul écouteur : les cartes redessinées restent cliquables. */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-va]');
      if (!t || (e.target.closest('a,button,input,select,textarea,summary') && !e.target.closest('a,button,input,select,textarea,summary').hasAttribute('data-va'))) return;
      var c = cibleVa(t.getAttribute('data-va')); if (!c) return;
      e.preventDefault(); aller(c);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target && e.target.closest && e.target.closest('[data-va]'); if (!t || t !== e.target) return;
      var c = cibleVa(t.getAttribute('data-va')); if (c) { e.preventDefault(); aller(c); }
    });
    new MutationObserver(function () { Array.prototype.forEach.call(document.querySelectorAll('[data-va]:not([tabindex])'), function (x) { x.setAttribute('tabindex', '0'); x.setAttribute('role', 'link'); }); })
      .observe(document.body, { childList: true, subtree: true });
    /* 13.10 (Kevin : « la zone du haut apparaît un petit moment après ») : le domaine vient de dire « admin vérifié » — SEULEMENT maintenant on
       dessine le dernier relevé (des nombres, datés) et la boîte part TOUT DE SUITE, avant les comptes et le commerce (qui ont chacun leurs
       propres lectures). Avant ce « oui », rien n'est dessiné ni demandé : verify-admin-unique le prouve. */
    INST = lireInstantane();
    dessinerCompteurs();
    dessinerEnAttendant();
    brancherRecherche();
    var rac = document.querySelectorAll('[data-racc]');
    for (var ri = 0; ri < rac.length; ri++) (function (b) { b.onclick = function () { var r = RACCOURCIS[+b.getAttribute('data-racc')]; if (!r) return; if (r[1] === '#creer-invite') { var t = document.getElementById('tb-creer'); if (t) { t.click(); return; } } aller(r[1]); }; })(rac[ri]);
    /* admin.js et commerce.js redessinent leurs blocs (actualisation) : on les reclasse dans leurs onglets, sans boucle */
    if (typeof MutationObserver === 'function') ['admin-comptes', 'commerce-app'].forEach(function (id) {
      var z = document.getElementById(id); if (!z) return;
      new MutationObserver(function () { var sec = z.closest('details.sec'); if (sec && sec.id === VUE) appliquerOnglets(VUE); }).observe(z, { childList: true });
    });
    document.getElementById('tb-boite').onclick = function () { aller('boite'); };
    /* Kevin 13.10 : « je ne trouve rien » — le formulaire de création est en bas de la liste des comptes, replié : ce bouton en tête de « Personnes » l'ouvre et y amène */
    document.getElementById('tb-creer').onclick = function () {
      var d = document.getElementById('creer-invite');
      if (!d) return;
      aller('#creer-invite');
      d.open = true;
      d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var f = document.getElementById('cinv-prenom'); if (f) f.focus({ preventScroll: true });
    };
    document.addEventListener('kdmc-commerce-live', function (e) { LIVE = e.detail || null; LIVE_LU = true; if (BOITE && INST) { INST.livrer = nb(LIVE && LIVE.file ? LIVE.file.n || 0 : null); garderInstantane(INST); } dessinerCompteurs(); });
    if (global.kdmcBoite) {
      global.kdmcBoite.surMaj(surBoite);
      global.kdmcBoite.rafraichir();
      setInterval(function () { if (document.visibilityState === 'visible') global.kdmcBoite.rafraichir(); }, 15000);   /* 16.10 : 15 s pour les connectés en direct */
      setInterval(function () { if (BOITE) { empLive = ''; dessinerLive(BOITE); } }, 15000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') global.kdmcBoite.rafraichir(); });
    }
    if (global.kdmcAdmin) global.kdmcAdmin.monter(document.getElementById('admin-comptes'));
    /* 10.10 (réactivité) : la session DÉJÀ vérifiée ici (admin + Face ID) est passée au commerce — il ne redemande plus whoami
       (mesuré : un 2e whoami en série avant même de lire ses données, 1,5 s de plus sur réseau mobile). Le serveur garde son verrou. */
    if (global.kdmcCommerce && global.kdmcCommerce.monter) global.kdmcCommerce.monter(document.getElementById('commerce-app'), s);
    lireAnnexes();
    window.addEventListener('hashchange', versHash);
    versHash();
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
