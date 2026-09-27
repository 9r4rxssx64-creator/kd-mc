/* KDMC APEX — Admin domaine : fiches clients (max renseignements, enrichies à
   chaque connexion) + fonctions communes à tous les projets. Réservé admin
   (vérifié côté router via la session SSO ; l'UI ne fait que refléter). */
(function () {
  'use strict';
  /* `null` hors navigateur : ce fichier est aussi chargé par sa garde
     (tests/admin-tuiles.test.mjs) pour EXÉCUTER hub() pour de vrai —
     relire le source à coups d'expressions régulières ne prouve rien. */
  var app = (typeof document !== 'undefined') ? document.getElementById('app') : null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(ts) { if (!ts) return '—'; var d = Date.now() - ts, m = Math.floor(d / 6e4), h = Math.floor(d / 36e5), j = Math.floor(d / 864e5); if (m < 1) return "à l'instant"; if (m < 60) return 'il y a ' + m + ' min'; if (h < 24) return 'il y a ' + h + ' h'; return 'il y a ' + j + ' j'; }
  function dt(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleString('fr-FR'); } catch (e) { return '—'; } }
  function dur(ms) { ms = ms || 0; if (ms < 60000) return '< 1 min'; var m = Math.round(ms / 60000); if (m < 60) return m + ' min'; var h = Math.floor(m / 60); m = m % 60; return h + ' h' + (m ? (' ' + m) : ''); }

  function deny(s) {
    var diag;
    if (!s) {
      diag = 'Aucune <b>session du domaine</b> détectée sur cet appareil.<br>'
        + '<span style="color:var(--subtle)">(Le cookie de connexion n\'a pas été posé, ou il est bloqué par le navigateur.)</span>';
    } else {
      diag = 'Session du domaine OK ✅ — connecté en tant que <b>' + esc(s.name || '?') + '</b><br>'
        + 'identifiant : <code>' + esc(s.uid || '?') + '</code><br>'
        + '<span style="color:var(--subtle)">mais ce compte n\'est pas dans la liste administrateur.</span>';
    }
    app.innerHTML = '<div class="msg">🔒 <b>Accès administrateur</b><br><br>' + diag
      + '<br><br>Connecte-toi sur <a href="/" style="color:var(--gold)">kd-mc.com</a> avec le compte admin (Kevin).</div>';
  }
  function loading() { app.innerHTML = '<div class="kdmc-skel" style="margin-bottom:10px"></div><div class="kdmc-skel" style="margin-bottom:10px;opacity:.7"></div><div class="kdmc-skel" style="opacity:.4"></div>'; }

  function card(i, n, d, h) {
    return '<a class="kdmc-card kdmc-in cardrow" href="' + h + '"><span class="i">' + i + '</span><span class="ct"><span class="n">' + esc(n) + '</span><span class="d">' + esc(d) + '</span></span><span class="arr">›</span></a>';
  }
  /* Les sections choisies à la main : ce que Kevin ouvre le plus souvent, dans son ordre. */
  function hubHaut() {
    /* En premier, les deux pages que Kevin ouvre le plus souvent (demandé le
       24.09.2026) : celle d'où il PILOTE son business, et celle que ses clients
       VOIENT. Le tableau de bord Commerce a été retiré de la section commune
       juste en dessous : une seule tuile par destination, jamais deux (règle
       « zéro doublon UX »). */
    return '<h2 class="cat">🚀 Mon business</h2><div class="grid">'
      + card('🛒', 'Commerce — Tableau de bord', 'Ventes, file à valider, produits, vidéos, commandes', '/admin/commerce.html')
      + card('🛍', 'Kit IA — ma page de vente', 'Ce que voient mes clients — kit.kd-mc.com', 'https://kit.kd-mc.com/')
      /* Les deux autres produits en vente manquaient ici alors que Kit y etait :
         l'admin ne montrait qu'un tiers de ce que Kevin vend (mesure 26.09). */
      + card('🗓', 'Rotaplan — ma page de vente', 'Planning des equipes qui tournent — rotaplan.kd-mc.com', 'https://rotaplan.kd-mc.com/')
      + card('🃏', 'Devenir croupier — ma page', 'Le guide du metier — croupier.kd-mc.com', 'https://croupier.kd-mc.com/')
      + '</div>'
      + '<h2 class="cat">🧩 Fonctions communes — tous les projets</h2><div class="grid">'
      + card('📅', 'CMCteams — Admin', 'Plannings, équipes, employés', 'https://cmcteams.kd-mc.com/')
      + card('🤖', 'Apex AI — Admin', 'Coffre, RGPD, santé, conso', 'https://apex-ai.kd-mc.com/')
      + card('💬', 'Apex Chat — Admin', 'Users, connexions, sentinelles', 'https://apex-chat.kd-mc.com/')
      + card('📊', 'Boutiques — Dashboard', 'Commandes, produits, finances', 'https://dashboard.kd-mc.com/')
      + card('💶', 'OpenAI — ce qui consomme', 'Chiffres reels + ecouter la voix gratuite', '/admin/openai.html')
      + card('🩺', 'Santé des workers', 'État live de tous les services', 'https://github.com/9r4rxssx64-creator/cmcteams/blob/main/tools/health/workers-status.json')
      + '</div>'
      /* Deux pages d'administration du domaine n'etaient citees NULLE PART dans l'admin :
         on y arrivait seulement par le portail. Une fonction qu'on ne voit pas n'existe
         pas (mesure 26.09 : l'admin montrait 7 apps sur 26). */
      + '<h2 class="cat">🎛️ Piloter le domaine</h2><div class="grid">'
      + card('🗂️', 'Qui se connecte', 'Historique de chaque personne : apps, appareils, en ligne', 'https://admin.kd-mc.com/')
      + card('🎛️', 'Centre de contrôle', 'Tous mes liens 1-clic : apps, clés, workers, Firebase', '/liens/')
      + '</div>'
      + '<h2 class="cat">🎨 Studios de création</h2><div class="grid">'
      + card('🎨', 'Studio — La Détente', 'Créer logos & produits (POD)', 'https://shops.kd-mc.com/la-detente/studio.html')
      + card('🎨', 'Studio — Chez Lolo', 'Créer logos & produits (POD)', 'https://chez-lolo.kd-mc.com/studio.html')
      + '</div>'
      /* Kevin 26.09.2026 : « je ne vois pas la tuile dans mon domaine admin » (il cherchait
         Tor en clair). MESURE du jour : 21 des 30 apps du registre étaient ABSENTES de cette
         page — Tor était routée, dans le périmètre, dans le custom_domain, surveillée par la
         sonde, et affichée sur le portail… mais pas ici. Même trou que la leçon #142/m128 :
         une liste écrite à la main finit toujours par diverger de la réalité.
         Donc : cette dernière section n'est PAS écrite à la main. Elle se déduit d'APP_NAMES
         — la même liste, déjà tenue à jour depuis /apps.json (source unique) et gardée par
         apps-consistency. Une app ajoutée demain apparaîtra ici TOUTE SEULE, sans que
         personne y pense. */
      ;
  }
  function hub() { return hubHaut() + toutesLesApps(); }
  /* Les apps du registre qui ne sont pas déjà citées plus haut (règle « zéro doublon UX » :
     une destination, une tuile) et sans les alias (cocina/cujina = la même cuisine). */
  function toutesLesApps() {
    var dejaCite = hubHaut();   /* on lit le HTML rendu : rien à tenir à jour en double */
    var vus = {}, tuiles = [];
    Object.keys(APP_NAMES).forEach(function (host) {
      if (/^(www\.)?kd-mc\.com$/.test(host)) return;          /* le portail, pas une app */
      /* « Déjà cité » = la RACINE de l'app est citée en haut. Chercher juste le nom
         d'hôte quelque part dirait à tort « couvert » pour une app dont seule une
         sous-page est citée (mesuré : shops.kd-mc.com n'était présent QUE via
         .../la-detente/studio.html — le portail boutiques n'avait donc aucune tuile). */
      if (dejaCite.indexOf('href="https://' + host + '/"') >= 0) return;
      var nom = APP_NAMES[host];
      if (vus[nom]) return;                                     /* alias du même site */
      vus[nom] = 1;
      var ic = nom.split(' ')[0], lib = nom.slice(ic.length).trim() || host;
      tuiles.push(card(ic, lib, host, 'https://' + host + '/'));
    });
    if (!tuiles.length) return '';
    return '<h2 class="cat">🌐 Toutes mes apps du domaine</h2><div class="grid">'
      + tuiles.join('') + '</div>';
  }
  if (typeof module === 'object' && module && module.exports) module.exports = { hub: hub };

  function kvp(k, v) { return '<div><span>' + k + '</span><br>' + v + '</div>'; }
  /* ---- Présence : qui est connecté, combien, cliquable → fiche ---- */
  var ONLINE_MS = 5 * 60e3, RECENT_MS = 60 * 60e3;
  function ini(a) { return (String(a.name || a.uid || '?').trim().charAt(0) || '?').toUpperCase(); }
  function prow(a) {
    var on = Date.now() - (a.last_seen || 0) < ONLINE_MS;
    var meta = ago(a.last_seen) + (a.last_device ? ' · ' + a.last_device : '') + (a.last_place ? ' · ' + a.last_place : '');
    return '<a class="kdmc-card kdmc-in cardrow onrow" href="#fiche-' + esc(a.uid) + '">'
      + '<span class="i">' + esc(ini(a)) + '</span>'
      + '<span class="ct"><span class="n">' + esc(a.name || a.uid) + '</span>'
      + '<span class="d"><span class="don' + (on ? '' : ' rec') + '"></span>' + esc(meta) + '</span></span>'
      + '<span class="arr">›</span></a>';
  }
  function globalPills(accounts) {
    var withCgu = accounts.filter(function (a) { return a.cgu_at; }).length;
    var hits = accounts.reduce(function (s, a) { return s + (a.hits || 0); }, 0);
    /* Combien sont limités à une app : c'est la file de ce que Kevin a à décider
       (chaque nouvel inscrit y entre). Visible d'un coup d'œil, sans dérouler. */
    var limites = accounts.filter(function (a) { return a.portee === 'app'; }).length;
    return '<div class="pill kdmc-in"><b>' + accounts.length + '</b> comptes clients</div>'
      + '<div class="pill kdmc-in" id="pill-limites" title="Personnes qui n\'ont accès qu\'aux applications cochées sur leur fiche"><b>' + limites + '</b> limité' + (limites > 1 ? 's' : '') + ' à une app</div>'
      + '<div class="pill kdmc-in"><b>' + withCgu + '</b> CGU acceptées</div>'
      + '<div class="pill kdmc-in"><b>' + hits + '</b> connexions cumulées</div>';
  }
  function presence(accounts) {
    var now = Date.now();
    var on = accounts.filter(function (a) { return a.last_seen && now - a.last_seen < ONLINE_MS; });
    var rec = accounts.filter(function (a) { return a.last_seen && now - a.last_seen >= ONLINE_MS && now - a.last_seen < RECENT_MS; });
    var h = '<h2 class="cat">🟢 Connectés <button class="refresh" id="prefresh" type="button">↻ Rafraîchir</button></h2>'
      + '<div class="stat">'
      + '<div class="pill kdmc-in"><b>' + on.length + '</b> en ligne <span style="color:var(--subtle)">vus &lt; 5 min</span></div>'
      + '<div class="pill kdmc-in"><b>' + rec.length + '</b> récents <span style="color:var(--subtle)">&lt; 1 h</span></div>'
      + '</div>'
      + (on.length ? '<div>' + on.map(prow).join('') + '</div>'
        : '<div class="msg" style="padding:18px 16px">Personne en ligne à l\'instant.</div>');
    if (rec.length) h += '<h2 class="cat" style="margin-top:14px">🟡 Récents <span style="color:var(--subtle);text-transform:none;letter-spacing:0;font-weight:500">— moins d\'une heure</span></h2><div>' + rec.map(prow).join('') + '</div>';
    return h;
  }
  function wirePresence() { var b = document.getElementById('prefresh'); if (b) b.addEventListener('click', function () { loadAccounts(0, true); }); }

  /* ---- Historique des connexions : 1 personne (pas de doublon), avec quels sites ---- */
  /* Copie de REPLI (hors-ligne). SOURCE UNIQUE = /apps.json (chargée au boot,
     fusionnée par-dessus). Le test apps-consistency garantit qu'elles ne divergent pas. */
  var APP_NAMES = {
    'cmcteams.kd-mc.com': '📅 CMCteams', 'cmcteams-light.kd-mc.com': '🎯 CMCteams light', 'departs.kd-mc.com': '🎯 CMCteams light',
    'apex-ai.kd-mc.com': '🤖 Apex AI', 'apex-chat.kd-mc.com': '💬 Apex Chat',
    'dashboard.kd-mc.com': '📊 Dashboard', 'sourcing.kd-mc.com': '📦 Sourcing', 'coffre.kd-mc.com': '🔐 Coffre',
    'kd-mc.com': '🏠 Portail', 'www.kd-mc.com': '🏠 Portail', 'la-detente.kd-mc.com': '🌿 La Détente', 'chez-lolo.kd-mc.com': '🎨 Chez Lolo', 'bot.kd-mc.com': '🤖 Bot Crypto', 'beatbot.kd-mc.com': '🌊 PoolPilot', 'autorisations.kd-mc.com': '🆔 Autorisations', 'arbre.kd-mc.com': '🌳 Arbre', 'lingua.kd-mc.com': '🐝 Lingua', 'studio.kd-mc.com': '🎬 Créa Studio', 'cuisine.kd-mc.com': '🍽️ A Cüjina de Mùnegu', 'cocina.kd-mc.com': '🍽️ A Cüjina de Mùnegu', 'cujina.kd-mc.com': '🍽️ A Cüjina de Mùnegu', 'worldmonitor.kd-mc.com': '🌍 World Monitor', 'osint.kd-mc.com': '🔎 OSINT', 'ia.kd-mc.com': '🧠 Outils IA', 'outils.kd-mc.com': '🧰 Mes outils gratuits', 'tor.kd-mc.com': '🧅 Tor en clair', 'shops.kd-mc.com': '🏬 Portail boutiques', 'rotaplan.kd-mc.com': '🗓️ Rotaplan', 'kit.kd-mc.com': '🧰 Kit IA de l\'indépendant', 'croupier.kd-mc.com': '🃏 Devenir croupier', 'javis.kd-mc.com': '🐝 Javis', 'dossiers.kd-mc.com': '🗂️ Dossiers publics'
  };
  try {
    fetch('/apps.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var a = j && j.apps; if (!a) return;
      Object.keys(a).forEach(function (h) { APP_NAMES[h] = (a[h].icon ? a[h].icon + ' ' : '') + (a[h].name || h); });
    }).catch(function () { /* repli intégré */ });
  } catch (e) { /* repli intégré */ }
  function appName(host) { return APP_NAMES[host] || ('🌐 ' + (host || '?')); }
  function appsSummary(apps) {
    if (!apps) return '—';
    var keys = Object.keys(apps).sort(function (x, y) { return (apps[y].last || 0) - (apps[x].last || 0); });
    if (!keys.length) return '—';
    return keys.map(function (h) { return appName(h) + ' ×' + (apps[h].sessions || 1); }).join(' · ');
  }
  function histRow(a) {
    var hist = a.history || [];
    var tl = hist.length
      ? hist.slice(0, 40).map(function (e) {
        return '<div class="tlrow">' + esc(dt(e.ts)) + ' · <b>' + esc(appName(e.app)) + '</b>'
          + ' · <span class="tdur">⏱ ' + esc(dur((e.end || e.ts) - e.ts)) + '</span>'
          + (e.device ? ' · ' + esc(e.device) : '') + (e.place ? ' · ' + esc(e.place) : '') + '</div>';
      }).join('')
      : '<div class="tlrow" style="color:var(--subtle)">Aucune connexion enregistrée pour l\'instant — l\'historique se remplit à la prochaine connexion.</div>';
    var n = a.hits || 0;
    var total = hist.reduce(function (s, e) { return s + Math.max(0, (e.end || e.ts) - e.ts); }, 0);
    return '<details class="histrow kdmc-card kdmc-in">'
      + '<summary><span class="i">' + esc(ini(a)) + '</span>'
      + '<span class="ct"><span class="n">' + esc(a.name || a.uid) + '</span>'
      + '<span class="d">' + n + ' connexion' + (n > 1 ? 's' : '') + (total ? ' · ⏱ ' + esc(dur(total)) + ' au total' : '') + ' · ' + esc(appsSummary(a.apps)) + '</span></span>'
      + '<span class="when"><span class="kdmc-dot"></span>' + ago(a.last_seen) + '</span></summary>'
      + '<div class="timeline">' + tl + '</div></details>';
  }
  function histSection(accounts) {
    return '<h2 class="cat">🕘 Historique des connexions</h2>'
      + '<input class="search" id="hq" placeholder="🔎 Filtrer (nom, site…)" autocomplete="off" autocapitalize="off">'
      + (accounts.length ? '<div id="histlist">' + accounts.map(histRow).join('') + '</div>'
        : '<div class="msg">Aucune connexion pour l\'instant.</div>');
  }
  function wireHist() {
    var hq = document.getElementById('hq');
    if (hq) hq.addEventListener('input', function () {
      var v = hq.value.toLowerCase(), list = document.querySelectorAll('#histlist .histrow');
      for (var i = 0; i < list.length; i++) list[i].style.display = list[i].textContent.toLowerCase().indexOf(v) >= 0 ? '' : 'none';
    });
  }

  /* Détail par site : nom + dernière fois VU sur ce site (la donnée existait
     déjà dans apps[host].last, elle n'était juste pas affichée). */
  function appsDetail(apps) {
    if (!apps) return '—';
    var keys = Object.keys(apps).sort(function (x, y) { return (apps[y].last || 0) - (apps[x].last || 0); });
    if (!keys.length) return '—';
    return keys.map(function (h) {
      return esc(appName(h)) + ' ×' + (apps[h].sessions || 1)
        + ' <span style="color:var(--subtle)">— vu ' + esc(ago(apps[h].last)) + '</span>';
    }).join('<br>');
  }
  /* Renseignements donnés par la personne à sa 1re connexion (light / CMCteams — Kevin
     2026-09-26). Rangés dans SON dossier du domaine, lisibles ici seulement. */
  function ficheRens(f) {
    if (!f || typeof f !== 'object') return '';
    var L = [['matricule', 'Matricule SBM'], ['anneeSbm', 'Entrée à la SBM'], ['anneeJeux', 'Entrée aux jeux'],
      ['poste', 'Poste'], ['telephone', 'Téléphone'], ['email', 'E-mail'], ['dateNaissance', 'Naissance'],
      ['adresse', 'Adresse'], ['usm', 'N° USM']];
    var rows = L.filter(function (x) { return f[x[0]] != null && f[x[0]] !== ''; })
      .map(function (x) { return kvp(x[1], esc(String(f[x[0]]))); });
    if (!rows.length) return '';
    return '<div class="kv"><div style="grid-column:1/-1"><span>📋 Fiche de renseignements'
      + (f.maj ? ' — mise à jour ' + esc(ago(f.maj)) : '') + '</span></div>' + rows.join('') + '</div>';
  }
  function fiche(a) {
    var places = (a.places || []).map(esc).join(' · ') || esc(a.last_place || '—');
    var devs = (a.devices || []).map(esc).join(' · ') || esc(a.last_device || '—');
    var anom = a.anomaly && a.anomaly.at
      ? '<div class="anom">⚠️ Connexion suspecte — <b>' + esc(a.anomaly.from || '?') + ' → ' + esc(a.anomaly.to || '?') + '</b> en ' + esc(String(a.anomaly.mins || '?')) + ' min · ' + esc(ago(a.anomaly.at)) + '</div>'
      : '';
    return '<div class="kdmc-card kdmc-in fiche" id="fiche-' + esc(a.uid) + '">'
      + '<div class="fhead"><div><h3>' + esc(a.name || a.uid) + '</h3><div class="uid">' + esc(a.uid) + '</div></div>'
      + '<div class="when"><span class="kdmc-dot"></span>' + ago(a.last_seen) + '</div></div>'
      + anom
      + '<div class="kv">'
      + kvp('Compte créé', dt(a.created))
      + kvp('CGU acceptée', a.cgu_at ? dt(a.cgu_at) : '—')
      + kvp('Connexions', String(a.hits || 0))
      + kvp('Sites utilisés', appsDetail(a.apps))
      + kvp('Appareils', devs)
      + kvp('Lieux', places)
      + kvp('Dernière connexion', dt(a.last_seen))
      + '</div>'
      + ficheRens(a.fiche)
      + blocAcces(a)
      + '<button class="revoke" data-uid="' + esc(a.uid) + '" type="button" '
      + 'title="Coupe toutes ses sessions ouvertes (appareil perdu/volé). Il pourra se reconnecter normalement.">🚪 Déconnecter partout</button>'
      + '</div>';
  }

  /* ---- Où cette personne a le droit d'aller (Kevin 2026-09-15) -------------
     « Quelqu'un d'extérieur peut s'enregistrer et être seulement dans une app,
     d'autres font partie du domaine entier […] admin possibilité de bloquer
     dans une app. » Ici c'est LE bouton qui décide — le routeur applique.
     Deux réglages séparés, parce qu'ils répondent à deux questions différentes :
       · la PORTÉE  = « où elle a le droit d'être »
       · la FERMETURE = « sauf ici » (marche même en portée domaine)
     Mélanger les deux dans une seule liste de cases rend le sens ambigu (la même
     case voudrait dire « ouvre » ou « ferme » selon le réglage d'à côté). */
  var APPS_LISTE = [];
  function chip(uid, groupe, app, coche) {
    var id = 'acc-' + groupe + '-' + uid + '-' + app;
    return '<label class="chipacc" for="' + esc(id) + '">'
      + '<input type="checkbox" id="' + esc(id) + '" data-grp="' + groupe + '" data-app="' + esc(app) + '"'
      + (coche ? ' checked' : '') + '> ' + esc(app) + '</label>';
  }
  function blocAcces(a) {
    if (!APPS_LISTE.length) return '';
    var portee = a.portee === 'app' ? 'app' : 'domaine';
    var acces = a.acces || [], bloque = a.bloque || [];
    var resume = portee === 'domaine'
      ? ('Tout le domaine' + (bloque.length ? ' · sauf ' + esc(bloque.join(', ')) : ''))
      : (acces.length ? esc(acces.join(', ')) : '⚠️ aucune app');
    return '<details class="acces" data-uid="' + esc(a.uid) + '">'
      + '<summary>🔐 Où elle peut aller <b>' + resume + '</b></summary>'
      + '<div class="accbody">'
      + '<label class="accradio"><input type="radio" name="p-' + esc(a.uid) + '" data-portee="domaine"'
      + (portee === 'domaine' ? ' checked' : '') + '> Partout dans le domaine <span class="d">(la partie admin reste réservée)</span></label>'
      + '<label class="accradio"><input type="radio" name="p-' + esc(a.uid) + '" data-portee="app"'
      + (portee === 'app' ? ' checked' : '') + '> Seulement les applications cochées</label>'
      + '<div class="chips grpacces">' + APPS_LISTE.map(function (x) { return chip(a.uid, 'acces', x, acces.indexOf(x) >= 0); }).join('') + '</div>'
      + '<details class="sousbloc"><summary>🚫 Fermer une application précise</summary>'
      + '<div class="d">Marche même si la personne a accès à tout le domaine.</div>'
      + '<div class="chips">' + APPS_LISTE.map(function (x) { return chip(a.uid, 'bloque', x, bloque.indexOf(x) >= 0); }).join('') + '</div>'
      + '</details>'
      + '<button class="savacc" data-uid="' + esc(a.uid) + '" type="button">💾 Enregistrer</button>'
      + '<span class="accmsg"></span>'
      + '</div></details>';
  }
  function wireAcces() {
    var list = document.getElementById('list');
    if (!list) return;
    /* Les cases « autorisée » n'ont de sens qu'en portée « une app » : on les
       grise sinon, pour qu'on ne coche pas quelque chose qui ne servira à rien. */
    function majEtat(box) {
      var app = box.querySelector('input[data-portee="app"]');
      var chips = box.querySelector('.grpacces');
      if (!app || !chips) return;
      chips.style.opacity = app.checked ? '1' : '.45';
      var ins = chips.querySelectorAll('input');
      for (var i = 0; i < ins.length; i++) ins[i].disabled = !app.checked;
    }
    var boxes = list.querySelectorAll('details.acces');
    for (var i = 0; i < boxes.length; i++) majEtat(boxes[i]);
    list.addEventListener('change', function (e) {
      var box = e.target && e.target.closest ? e.target.closest('details.acces') : null;
      if (box) majEtat(box);
    });
    list.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.savacc') : null;
      if (!b) return;
      var box = b.closest('details.acces'), uid = b.getAttribute('data-uid') || '';
      var portee = box.querySelector('input[data-portee="app"]').checked ? 'app' : 'domaine';
      var lu = function (grp) {
        var out = [], ins = box.querySelectorAll('input[data-grp="' + grp + '"]');
        for (var i = 0; i < ins.length; i++) if (ins[i].checked) out.push(ins[i].getAttribute('data-app'));
        return out;
      };
      var acces = lu('acces'), bloque = lu('bloque');
      var msg = box.querySelector('.accmsg');
      /* On prévient AVANT d'enregistrer : « une app » sans app cochée = la
         personne n'a plus accès à rien, et elle ne comprendrait pas pourquoi. */
      if (portee === 'app' && !acces.length) {
        msg.textContent = '⚠️ Coche au moins une application.';
        return;
      }
      b.disabled = true; msg.textContent = '…';
      fetch('/__admin/acces', {
        method: 'POST', credentials: 'include',
        headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()),
        body: JSON.stringify({ uid: uid, portee: portee, acces: acces, bloque: bloque }),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          b.disabled = false;
          if (j && j.ok) {
            msg.textContent = '✅ Enregistré';
            var s = box.querySelector('summary b');
            if (s) s.textContent = portee === 'domaine'
              ? ('Tout le domaine' + (bloque.length ? ' · sauf ' + bloque.join(', ') : ''))
              : acces.join(', ');
            loadAudit();
          } else msg.textContent = '⚠️ ' + ((j && j.reason) || 'Échec — réessaie');
        })
        .catch(function () { b.disabled = false; msg.textContent = '⚠️ Réseau — réessaie'; });
    });
  }
  function chargerApps(puis) {
    fetch('/__admin/acces', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.apps) APPS_LISTE = j.apps; })
      .catch(function () { /* section optionnelle : sans la liste, le bloc ne s'affiche pas */ })
      .then(puis);
  }

  /* ---- Journal admin (événements sensibles, tracés côté serveur) ---- */
  var AUD_EV = {
    admin_login_ok: '🔓 Connexion admin réussie', admin_login_fail: '⛔️ Code admin refusé',
    revoke_sessions: '🚪 Déconnexion forcée', new_device: '📱 Nouvel appareil', fbtoken_mint: '🔥 Jeton Firebase admin émis',
    perimetre: '🔐 Périmètre modifié', nouvel_inscrit: '🆕 Nouvel inscrit (limité à une app)'
  };
  function audRow(e) {
    return '<div class="tlrow">' + esc(dt(e.ts)) + ' · <b>' + esc(AUD_EV[e.ev] || e.ev) + '</b>'
      + (e.uid ? ' · ' + esc(e.uid) : '') + (e.detail ? ' · ' + esc(e.detail) : '')
      + (e.ip ? ' · <span style="color:var(--subtle)">ip ' + esc(e.ip) + '</span>' : '') + '</div>';
  }
  function loadAudit() {
    fetch('/__admin/audit', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var el2 = document.getElementById('audsec');
        if (!el2 || !j || !j.ok) return;
        var log = j.log || [];
        el2.innerHTML = '<h2 class="cat">🛡 Journal admin</h2>'
          + '<details class="histrow kdmc-card kdmc-in"><summary><span class="i">🛡</span>'
          + '<span class="ct"><span class="n">Événements sensibles</span>'
          + '<span class="d">' + log.length + ' entrée' + (log.length > 1 ? 's' : '') + ' — connexions admin, nouveaux appareils, déconnexions forcées</span></span></summary>'
          + '<div class="timeline">' + (log.length ? log.slice(0, 60).map(audRow).join('') : '<div class="tlrow" style="color:var(--subtle)">Rien pour l\'instant.</div>') + '</div></details>';
      })
      .catch(function () { /* silencieux : section optionnelle */ });
  }

  function wireRevoke() {
    var list = document.getElementById('list');
    if (!list) return;
    list.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.revoke') : null;
      if (!b) return;
      var uid = b.getAttribute('data-uid') || '';
      if (!confirm('Déconnecter « ' + uid + ' » de TOUS ses appareils ?\n\nSes sessions ouvertes seront coupées immédiatement.\nIl pourra se reconnecter normalement (Face ID ou nom + code).')) return;
      b.disabled = true; b.textContent = '…';
      fetch('/__admin/revoke', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ uid: uid }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok) { b.textContent = '✅ Déconnecté partout'; loadAudit(); }
          else { b.disabled = false; b.textContent = '⚠️ Échec — réessaie'; }
        })
        .catch(function () { b.disabled = false; b.textContent = '🚪 Déconnecter partout'; });
    });
  }

  function render(accounts, kv) {
    app.innerHTML =
      '<div id="presence">' + presence(accounts) + '</div>'
      + (kv ? '' : '<div class="note">⚙️ Le registre central (KV) s\'activera au prochain déploiement du router : les fiches apparaîtront alors automatiquement. Les fonctions communes ci-dessous marchent déjà.</div>')
      + '<h2 class="cat">📊 Tous les comptes</h2>'
      + '<div class="stat" id="gstat">' + globalPills(accounts) + '</div>'
      + histSection(accounts)
      + '<input class="search" id="q" placeholder="🔎 Rechercher un client (nom, lieu, appareil)…" autocomplete="off" autocapitalize="off">'
      + '<h2 class="cat">👥 Fiches clients</h2>'
      + (accounts.length ? '<div id="list">' + accounts.map(fiche).join('') + '</div>'
        : '<div class="msg">Aucune fiche pour l\'instant.<br>Les comptes apparaissent ici dès leur 1ʳᵉ connexion sur le domaine.</div>')
      + '<div id="audsec"></div>'
      + hub();
    wirePresence();
    wireHist();
    wireRevoke();
    wireAcces();
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () {
      var v = q.value.toLowerCase();
      var list = document.querySelectorAll('#list .fiche');
      for (var i = 0; i < list.length; i++) list[i].style.display = list[i].textContent.toLowerCase().indexOf(v) >= 0 ? '' : 'none';
    });
    loadAudit();
    startPolling();
  }
  /* Rafraîchissement présence : non-intrusif (ne touche QUE #presence + #gstat,
     ne réinitialise ni la recherche ni le scroll). 25 s, seulement onglet visible. */
  var _poll = null, _lastPres = '', _lastPills = '';
  function startPolling() {
    if (_poll) return;
    _poll = setInterval(function () { if (document.visibilityState === 'visible') loadAccounts(0, true); }, 25000);
  }

  /* Le grant admin (preuve du code) voyage en header x-kdmc-admin pour marcher
     même en PWA installée (cookie isolé par app sur iOS). */
  var ADMIN_TOK = 'kdmc_admin_token';
  function adminHeaders() { var t = ''; try { t = localStorage.getItem(ADMIN_TOK) || ''; } catch (e) { /* */ } return t ? { 'x-kdmc-admin': t } : {}; }

  function denyViaWhoami() {
    var who = window.kdmcSSO ? window.kdmcSSO.whoami() : Promise.resolve(null);
    who.then(function (s) { deny(s); }).catch(function () { deny(null); });
  }

  function promptAdminCode(err) {
    app.innerHTML = '<div class="msg" style="max-width:360px;margin:24px auto;text-align:center">'
      + '🔒 <b>Accès administrateur</b><br><br>'
      + 'Entre ton <b>code admin</b> pour voir les fiches clients.<br>'
      + '<span style="color:var(--subtle);font-size:13px">(Le nom seul ne suffit pas — sécurité.)</span><br><br>'
      + '<input id="acode" type="password" inputmode="numeric" autocomplete="off" placeholder="Code admin" '
      + 'style="width:100%;max-width:240px;padding:12px 14px;border-radius:12px;border:1px solid var(--line,#2a2a32);background:#0a120c;color:#f3f0e6;font-size:18px;text-align:center;letter-spacing:4px">'
      + (err ? '<div style="color:#ff6b6b;font-size:13px;margin-top:8px">' + esc(err) + '</div>' : '')
      + '<br><button id="ago2" style="margin-top:12px;padding:12px 22px;border:none;border-radius:12px;background:linear-gradient(135deg,#f6d97a,#e8b830);color:#11160c;font-weight:700;font-size:15px;cursor:pointer;min-height:46px">Déverrouiller</button>'
      + '</div>';
    var inp = document.getElementById('acode'), btn = document.getElementById('ago2');
    function go() {
      var code = (inp.value || '').trim(); if (!code) return;
      btn.disabled = true; btn.textContent = '…';
      fetch('/__admin/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code }) })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          if (j && j.ok && j.grant) { try { localStorage.setItem(ADMIN_TOK, j.grant); } catch (e) { /* */ } loading(); loadAccounts(0); return; }
          var msg = (j && j.reason === 'code_invalide') ? 'Code invalide.'
            : (j && j.reason === 'admin_pin_not_configured') ? "Le verrou admin n'est pas encore déployé (réessaie dans 1 min)."
              : 'Erreur, réessaie.';
          promptAdminCode(msg);
        })
        .catch(function () { promptAdminCode('Réseau indisponible, réessaie.'); });
    }
    if (btn) btn.addEventListener('click', go);
    if (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); inp.focus(); }
  }

  var _appsCharge = false;
  function loadAccounts(tries, silent) {
    /* La liste des apps du domaine est nécessaire pour afficher le bloc « Où elle
       peut aller ». Chargée UNE fois, avant le premier rendu. Son absence ne bloque
       rien : sans elle, les fiches s'affichent exactement comme avant (fail-open).
       Drapeau DÉDIÉ : réutiliser `silent` ici avalerait la demande du code admin
       au premier chargement (silent = « ne casse pas la vue sur hoquet réseau »). */
    if (!_appsCharge) {
      _appsCharge = true;
      return chargerApps(function () { loadAccounts(tries, silent); });
    }
    return fetch('/__admin/accounts', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }).catch(function () { return { st: r.status, j: null }; }); })
      .then(function (res) {
        var j = res.j;
        if (res.st === 403 || !j || !j.ok) {
          if (silent) return; /* refresh auto : ne casse pas la vue si hoquet réseau/grant */
          if (j && j.reason === 'need_admin_code') { try { localStorage.removeItem(ADMIN_TOK); } catch (e) { /* */ } promptAdminCode(); return; }
          denyViaWhoami(); return; /* rollout sans hash : ancien diag par nom */
        }
        var accounts = j.accounts || [];
        /* KV éventuellement cohérent : retente 1-2× (2s) si index vide après 1ʳᵉ connexion. */
        if (accounts.length === 0 && j.kv !== false && (tries || 0) < 2) {
          setTimeout(function () { loadAccounts((tries || 0) + 1, silent); }, 2000);
        }
        if (silent) {
          /* Mise à jour ciblée + IDEMPOTENTE (leçon #94) : ne réécrit le DOM que
             si le HTML a réellement changé → 0 mutation au repos, 0 clignotement. */
          var p = document.getElementById('presence'), g = document.getElementById('gstat');
          if (!p || !g) { render(accounts, j.kv !== false); return; }
          var ph = presence(accounts), gh = globalPills(accounts);
          if (_lastPres !== ph) { _lastPres = ph; p.innerHTML = ph; wirePresence(); }
          if (_lastPills !== gh) { _lastPills = gh; g.innerHTML = gh; }
          return;
        }
        render(accounts, j.kv !== false);
      })
      .catch(function () { if (!silent) denyViaWhoami(); });
  }
  function boot() { loading(); loadAccounts(0); }
  /* On ne démarre que dans un navigateur : chargée par sa garde (node), la page
     n'a ni #app ni réseau — seul hub() est appelé, et il doit l'être sans effet de bord. */
  if (app) boot();
})();
