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
    return '<h2 class="cat">⚡ Raccourcis du domaine</h2><div class="grid">'
      /* Kevin 15.10.2026 : « Ajoute les tuiles qu'il manque dans le domaine » → « Raccourcis admin du domaine ». Ce que Kevin fait CHAQUE jour
         dans l'admin (valider, voir qui est là, ouvrir ou supprimer un compte, créer un invité, fermer des apps, lire le journal) avait des boutons
         enfouis plus bas : une fonction qu'on ne voit pas n'existe pas. Une destination, une tuile (zéro doublon). */
      + card('📬', 'Mes messages · inscriptions à valider', 'Messages de toutes les apps, inscriptions et codes à accepter', 'https://kd-mc.com/#messages')
      + card('🟢', 'Qui est en ligne', 'Connectés et récents, dans toutes les apps', '#presence')
      + card('🔎', 'Un compte : état, ouvrir, supprimer', 'Fiches clients : pourquoi quelqu\'un est bloqué, l\'ouvrir, le supprimer', '#list')
      + card('➕', 'Créer un compte invité', 'Un accès pour quelqu\'un, avec son code', '#creer-invite')
      + card('🚫', 'Fermer des applications', 'Pour tout le monde, ou pour des personnes précises', '#fermgen')
      + card('🛡', 'Journal admin', 'Connexions, validations, suppressions, appareils', '#journal')
      + '</div>'
      + '<h2 class="cat">🚀 Mon business</h2><div class="grid">'
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

  function kvp(k, v, va) { return '<div' + (va ? ' data-va="' + esc(va) + '"' : '') + '><span>' + k + '</span><br>' + v + '</div>'; }
  /* ---- Présence : qui est connecté, combien, cliquable → fiche ---- */
  /* « En ligne » = vu depuis moins de 13 min : le routeur n'écrit la présence que toutes les 10 min
     (ENRICH_CADENCE, services/kdmc-router/worker.js — plafond KV 1 000 écritures/jour, mesuré 1.10.2026). */
  var ONLINE_MS = 13 * 60e3, RECENT_MS = 60 * 60e3;
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
    return '<div class="pill kdmc-in" data-va="#list"><b>' + accounts.length + '</b> comptes clients</div>'
      + '<div class="pill kdmc-in" id="pill-limites" data-va="#list" title="Personnes qui n\'ont accès qu\'aux applications cochées sur leur fiche"><b>' + limites + '</b> limité' + (limites > 1 ? 's' : '') + ' à une app</div>'
      + '<div class="pill kdmc-in" data-va="#list"><b>' + withCgu + '</b> CGU acceptées</div>'
      + '<div class="pill kdmc-in" data-va="#audsec"><b>' + hits + '</b> connexions cumulées</div>';
  }
  function presence(accounts) {
    var now = Date.now();
    var on = accounts.filter(function (a) { return a.last_seen && now - a.last_seen < ONLINE_MS; });
    var rec = accounts.filter(function (a) { return a.last_seen && now - a.last_seen >= ONLINE_MS && now - a.last_seen < RECENT_MS; });
    var h = '<h2 class="cat">🟢 Connectés <button class="refresh" id="prefresh" type="button">↻ Rafraîchir</button></h2>'
      + '<div class="stat">'
      + '<div class="pill kdmc-in" data-va="#presence"><b>' + on.length + '</b> en ligne <span style="color:var(--subtle)">vus &lt; 13 min</span></div>'
      + '<div class="pill kdmc-in" data-va="#presence"><b>' + rec.length + '</b> récents <span style="color:var(--subtle)">&lt; 1 h</span></div>'
      + '</div>'
      + (on.length ? '<div>' + on.map(prow).join('') + '</div>'
        : '<div class="msg" style="padding:18px 16px">Personne en ligne à l\'instant.</div>');
    if (rec.length) h += '<h2 class="cat" style="margin-top:14px">🟡 Récents <span style="color:var(--subtle);text-transform:none;letter-spacing:0;font-weight:500">— moins d\'une heure</span></h2><div>' + rec.map(prow).join('') + '</div>';
    return h;
  }
  /* 10.10 (réactivité, mesuré : 1,5 s sans rien à l'écran) : le bouton réagit tout de suite, et revient à la réponse. */
  function wirePresence() {
    var b = document.getElementById('prefresh'); if (!b) return;
    b.addEventListener('click', function () {
      if (b.disabled) return;
      b.disabled = true; b.textContent = '↻ …';
      var rendre = function () { var b2 = document.getElementById('prefresh'); if (b2) { b2.disabled = false; b2.textContent = '↻ Rafraîchir'; } };
      Promise.resolve(loadAccounts(0, true)).then(rendre, rendre);
    });
  }

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
        return '<div class="tlrow"' + (a.uid ? ' data-va="fiche:' + esc(a.uid) + '"' : '') + '>' + esc(dt(e.ts)) + ' · <b>' + esc(appName(e.app)) + '</b>'
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
    /* 17.10 (capture de Kevin : « CMCteams light » ×2, « A Cüjina de Mùnegu » ×3 dans la même fiche) : une ligne par APP (les adresses
       d'une même app sont regroupées, connexions additionnées, dernière visite gardée) ; les 5 plus récentes à l'écran, le reste replié. */
    var parNom = {}, ordre = [];
    Object.keys(apps).forEach(function (h) {
      var n = appName(h), a = apps[h] || {};
      if (!parNom[n]) { parNom[n] = { h: h, n: n, s: 0, last: 0 }; ordre.push(n); }
      var g = parNom[n]; g.s += (a.sessions || 1);
      if ((a.last || 0) > g.last) { g.last = a.last || 0; g.h = h; }
    });
    var L = ordre.map(function (n) { return parNom[n]; }).sort(function (x, y) { return y.last - x.last; });
    if (!L.length) return '—';
    var ligne = function (g) {
      /* 16.10 (Kevin : « toutes infos cliquables ») : le nom de l'app ouvre l'app */
      var nom = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.kd-mc\.com$|^kd-mc\.com$/.test(String(g.h)) ? '<a href="https://' + esc(g.h) + '/" target="_blank" rel="noopener">' + esc(g.n) + '</a>' : esc(g.n);
      return nom + ' ×' + g.s + ' <small class="vu">· ' + esc(ago(g.last)) + '</small>';
    };
    var h = L.slice(0, 5).map(ligne).join('<br>');
    if (L.length > 5) h += '<details class="plus"><summary>+ ' + (L.length - 5) + ' autre' + (L.length - 5 > 1 ? 's' : '') + ' site' + (L.length - 5 > 1 ? 's' : '') + '</summary>' + L.slice(5).map(ligne).join('<br>') + '</details>';
    return h;
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
    /* 16.10 nuit (Kevin : « Ferme les fiches par défaut, ça prend trop de place, et fais plus lisible ») : une fiche est une ligne
       (nom · dernière connexion · nombre de connexions · ⚠️ si suspecte) ; tout le détail s'ouvre d'un toucher. Une fiche visée
       (#fiche-<uid>, « Sa fiche admin ») s'ouvre toute seule (tableau.js, aller()). */
    return '<details class="kdmc-card kdmc-in fiche" id="fiche-' + esc(a.uid) + '">'
      + '<summary class="fhead"><span class="fqui"><h3>' + esc(a.name || a.uid) + '</h3>'
      + '<span class="fres">' + esc(ago(a.last_seen)) + ' · ' + (a.hits || 0) + ' connexion' + ((a.hits || 0) > 1 ? 's' : '') + (a.anomaly && a.anomaly.at ? ' · <b class="fsusp">⚠️ suspecte</b>' : '') + '</span></span>'
      + '<span class="fchev" aria-hidden="true">›</span></summary>'
      + '<div class="fcorps"><div class="uid">' + esc(a.uid) + ' · <span class="lien-info" data-va="journal:' + esc(a.uid) + '">journal</span></div>'
      + anom
      + (a.uid === 'kdmc_admin' ? '' : '<button class="savacc ouvrir-compte" data-uid="' + esc(a.uid) + '" type="button" style="margin:6px 0 10px" title="Ouvre ce compte : la personne n\'attend plus ton accord.">✅ Ouvrir ce compte</button>')
      + '<div class="kv">'
      + kvp('Compte créé', dt(a.created), 'journal:' + a.uid)
      + kvp('CGU acceptée', a.cgu_at ? dt(a.cgu_at) : '—', 'journal:' + a.uid)
      + kvp('Connexions', String(a.hits || 0), 'journal:' + a.uid)
      + kvp('Sites utilisés', appsDetail(a.apps))
      + kvp('Appareils', devs, 'journal:' + a.uid)
      + kvp('Lieux', places, 'journal:' + a.uid)
      + kvp('Dernière connexion', dt(a.last_seen), 'journal:' + a.uid)
      + '</div>'
      + ficheRens(a.fiche)
      + blocAcces(a)
      + '<button class="etatcompte" data-uid="' + esc(a.uid) + '" type="button" title="Dit pourquoi cette personne est bloquée (ou pas), et permet de l\'ouvrir.">🔎 État du compte</button>'
      + '<div class="etatbox" data-uid="' + esc(a.uid) + '" hidden></div>'
      + '<button class="revoke" data-uid="' + esc(a.uid) + '" type="button" '
      + 'title="Coupe toutes ses sessions ouvertes (appareil perdu/volé). Il pourra se reconnecter normalement.">🚪 Déconnecter partout</button>'
      + '</div></details>';
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
  /* → une promesse qui ne rejette jamais (section optionnelle : sans la liste, le bloc ne s'affiche pas). */
  function chargerApps() {
    /* les deux lectures partent ENSEMBLE (réactivité : jamais une file d'attente de plus) */
    var fermees = fetch('/__admin/apps-fermees', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) FERMEES_GEN = j.fermees || []; })
      .catch(function () { /* fail-open */ });
    return fetch('/__admin/acces', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.apps) APPS_LISTE = j.apps; })
      .then(function () { return fermees; })
      .catch(function () { /* fail-open */ });
  }
  /* ---- Fermer une ou plusieurs apps POUR TOUT LE MONDE (Kevin 13.10 : « je peux bloquer un ou plusieurs sites, général et individuel »).
     Général = ici (une liste pour tout le domaine, l'admin entre toujours) ; individuel = « 🚫 Fermer une application précise » sur chaque fiche. */
  var FERMEES_GEN = [];
  function blocFermees() {
    if (!APPS_LISTE.length) return '';
    var apps = APPS_LISTE.filter(function (x) { return x !== 'portail'; });
    return '<details class="fermgen" id="fermgen"' + (FERMEES_GEN.length ? ' open' : '') + '>'
      + '<summary>🚧 Fermer des applications pour tout le monde <b>' + (FERMEES_GEN.length ? esc(FERMEES_GEN.join(', ')) : 'aucune') + '</b></summary>'
      + '<div class="accbody"><div class="d">Coche une ou plusieurs apps : plus personne n\'y entre, sauf toi. Pour fermer une app à UNE personne seulement, ouvre sa fiche ci-dessous.</div>'
      + '<div class="chips">' + apps.map(function (x) { return chip('gen', 'ferme', x, FERMEES_GEN.indexOf(x) >= 0); }).join('') + '</div>'
      + '<button class="savacc" id="fermgen-save" type="button">💾 Enregistrer</button><span class="accmsg" id="fermgen-msg"></span></div></details>';
  }
  /* ---- Créer un compte INVITÉ (Kevin 13.10 : « un compte pour une personne qui ne fera peut-être pas partie du casino… accès au planning, aux départs, à MC Lite, à CMC Teams, et tout le domaine public sauf les admins ») ----
     Prénom + nom + code (+ téléphone facultatif) → POST /__admin/compte-invite. Le code n'est jamais gardé ici : on le voit UNE fois pour le donner à la personne. */
  var MSG_INVITE = { prenom_nom_requis: 'Il faut un prénom ET un nom (au moins 2 lettres chacun).', nom_reserve: 'Ce nom est réservé à l\'administrateur.',
    code_invalide: 'Le code doit faire au moins 6 caractères.', telephone_invalide: 'Numéro de téléphone mal écrit (ex. +377 06 12 34 56).',
    deja_existe: 'Ce prénom et ce nom ont déjà un compte.', telephone_requis: 'Le téléphone est obligatoire : tape le numéro (ex. +377 06 12 34 56).', whatsapp_pas_pret: 'WhatsApp n\'est pas encore branché sur le domaine : tape le numéro toi-même.', indisponible: 'Le registre est indisponible, réessaie dans un instant.', need_admin_code: 'Reconnecte-toi en admin puis réessaie.' };
  function blocCreer() {
    return '<details class="fermgen" id="creer-invite">'
      + '<summary>➕ Créer un compte pour une personne (invitée, même hors casino)</summary>'
      + '<div class="accbody"><div class="d">La personne n\'a pas besoin d\'être dans le planning ni d\'avoir un matricule SBM. Elle aura le planning, les départs, MC Lite, CMC Teams et tout le domaine public — jamais ta partie admin. Elle se connecte avec ce nom et ce code, accepte les conditions une seule fois, puis entre dans l\'app de son choix.</div>'
      + '<input class="search" id="cinv-prenom" placeholder="Prénom" autocomplete="off" autocapitalize="words">'
      + '<input class="search" id="cinv-nom" placeholder="Nom" autocomplete="off" autocapitalize="words">'
      + '<input class="search" id="cinv-code" placeholder="Code (6 caractères ou plus)" autocomplete="off" autocapitalize="off">'
      + '<div class="d" style="margin-top:8px"><b>📱 Téléphone obligatoire</b></div>'
      /* WhatsApp mis de côté (Kevin 13.10 : « mets de côté la validation WhatsApp tant que je l'ai pas faite, enlève-la du visuel ») : le choix n'apparaît QUE quand le domaine a WhatsApp branché */
      + '<div id="cinv-modes" hidden>'
      + '<label class="chipacc" for="cinv-mode-saisi" style="display:flex;margin:4px 0"><input type="radio" name="cinv-mode" id="cinv-mode-saisi" value="saisi" checked> <span>📝 Je tape le numéro maintenant</span></label>'
      + '<label class="chipacc" for="cinv-mode-wa" id="cinv-wa-lbl" style="display:flex;margin:4px 0"><input type="radio" name="cinv-mode" id="cinv-mode-wa" value="whatsapp"> <span>💬 La personne le confirme elle-même par WhatsApp (rien ne s\'ouvre avant)</span></label>'
      + '</div>'
      + '<input class="search" id="cinv-tel" placeholder="Téléphone (ex. +377 06 12 34 56)" autocomplete="off" inputmode="tel">'
      + '<div><button class="savacc" id="cinv-gen" type="button">🎲 Choisir un code</button> <button class="savacc" id="cinv-go" type="button">➕ Créer le compte</button></div>'
      + '<span class="accmsg" id="cinv-msg"></span></div></details>';
  }
  function wireCreer() {
    var go = document.getElementById('cinv-go'), gen = document.getElementById('cinv-gen');
    if (!go) return;
    function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
    /* WhatsApp branché sur le domaine ? sinon l'option est grisée (le domaine la refuserait de toute façon) */
    function modeWa() { var e = document.getElementById('cinv-mode-wa'); return !!(e && e.checked); }
    function majMode() { var t = document.getElementById('cinv-tel'); if (t) t.style.display = modeWa() ? 'none' : ''; }
    [document.getElementById('cinv-mode-saisi'), document.getElementById('cinv-mode-wa')].forEach(function (e) { if (e) e.addEventListener('change', majMode); });
    fetch('/__sso/tel/etat', { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var m = document.getElementById('cinv-modes');
      if (j && j.pret && m) m.hidden = false;   /* WhatsApp branché : le 2e choix apparaît ; sinon rien de WhatsApp à l'écran, le numéro tapé est cru */
    }).catch(function () { /* domaine muet : pas de choix WhatsApp */ });
    gen.addEventListener('click', function () {
      var t = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(t);
      document.getElementById('cinv-code').value = String(10000000 + (t[0] % 90000000));
    });
    go.addEventListener('click', function () {
      var msg = document.getElementById('cinv-msg'), code = val('cinv-code'), prenom = val('cinv-prenom'), nom = val('cinv-nom');
      if (!prenom || !nom) { msg.textContent = '⚠️ ' + MSG_INVITE.prenom_nom_requis; return; }
      if (code.length < 6) { msg.textContent = '⚠️ ' + MSG_INVITE.code_invalide; return; }
      if (!modeWa() && !val('cinv-tel')) { msg.textContent = '⚠️ ' + MSG_INVITE.telephone_requis; return; }
      go.disabled = true; msg.textContent = '…';
      fetch('/__admin/compte-invite', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()),
        body: JSON.stringify({ prenom: prenom, nom: nom, code: code, tel_mode: modeWa() ? 'whatsapp' : 'saisi', telephone: modeWa() ? '' : val('cinv-tel') }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          go.disabled = false;
          if (j && j.ok) {
            msg.textContent = '✅ Compte créé pour ' + (j.name || prenom + ' ' + nom) + '. Donne-lui son nom complet et ce code : ' + code + ' — il ne sera plus affiché.' + (modeWa() ? ' À sa première connexion elle confirmera son téléphone par WhatsApp.' : '');
            ['cinv-prenom', 'cinv-nom', 'cinv-code', 'cinv-tel'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; });
            /* pas de rechargement de la liste ici : il reconstruirait l'écran et effacerait le code à transmettre ; la fiche apparaît au prochain « ↻ Rafraîchir » */
          } else msg.textContent = '⚠️ ' + ((j && MSG_INVITE[j.reason]) || 'Impossible de créer le compte pour le moment.');
        })
        .catch(function () { go.disabled = false; msg.textContent = '⚠️ Réseau — réessaie'; });
    });
  }
  /* ---- Fermer / rouvrir des apps à UNE ou PLUSIEURS personnes d'un coup (Kevin 13.10 : « pour une seule personne comme plusieurs ») ---- */
  function blocLot(accounts) {
    if (!APPS_LISTE.length || !accounts || !accounts.length) return '';
    var apps = APPS_LISTE.filter(function (x) { return x !== 'portail'; });
    var pers = accounts.filter(function (a) { return a && a.uid && a.uid !== 'kdmc_admin'; }).sort(function (x, y) { return String(x.name || x.uid).localeCompare(String(y.name || y.uid), 'fr'); });
    return '<details class="fermgen" id="fermlot">'
      + '<summary>🚫 Fermer ou rouvrir des applications à une ou plusieurs personnes</summary>'
      + '<div class="accbody"><div class="d">1) Coche les applications · 2) Coche les personnes · 3) Ferme ou rouvre. On ajoute (ou on retire) seulement ces apps : le reste de leurs réglages ne bouge pas.</div>'
      + '<div class="chips">' + apps.map(function (x) { return chip('lot', 'lotapp', x, false); }).join('') + '</div>'
      + '<input class="search" id="lot-q" placeholder="🔎 Chercher une personne…" autocomplete="off" autocapitalize="off">'
      + '<div id="lot-pers" style="max-height:260px;overflow:auto;-webkit-overflow-scrolling:touch">'
      + pers.map(function (a) { var id = 'lotp-' + a.uid; return '<label class="chipacc" for="' + esc(id) + '" data-nom="' + esc(String(a.name || a.uid).toLowerCase()) + '" style="display:flex;margin:4px 0"><input type="checkbox" id="' + esc(id) + '" data-grp="lotpers" data-uid="' + esc(a.uid) + '"> ' + esc(a.name || a.uid) + '</label>'; }).join('')
      + '</div>'
      + '<div><button class="savacc" id="lot-fermer" type="button">🚫 Fermer ces apps à ces personnes</button> <button class="savacc" id="lot-rouvrir" type="button">✅ Rouvrir</button></div>'
      + '<span class="accmsg" id="lot-msg"></span></div></details>';
  }
  function wireLot() {
    var q = document.getElementById('lot-q'), fer = document.getElementById('lot-fermer'), rou = document.getElementById('lot-rouvrir');
    if (!fer) return;
    if (q) q.addEventListener('input', function () {
      var v = q.value.toLowerCase(), ls = document.querySelectorAll('#lot-pers label');
      for (var i = 0; i < ls.length; i++) ls[i].style.display = ls[i].getAttribute('data-nom').indexOf(v) >= 0 ? 'flex' : 'none';
    });
    function coches(sel, attr) { var out = [], ins = document.querySelectorAll(sel); for (var i = 0; i < ins.length; i++) if (ins[i].checked) out.push(ins[i].getAttribute(attr)); return out; }
    function agir(action) {
      var apps = coches('#fermlot input[data-grp="lotapp"]', 'data-app'), uids = coches('#fermlot input[data-grp="lotpers"]', 'data-uid'), msg = document.getElementById('lot-msg');
      if (!apps.length) { msg.textContent = '⚠️ Coche au moins une application.'; return; }
      if (!uids.length) { msg.textContent = '⚠️ Coche au moins une personne.'; return; }
      fer.disabled = rou.disabled = true; msg.textContent = '…';
      fetch('/__admin/acces-lot', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ uids: uids, apps: apps, action: action }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          fer.disabled = rou.disabled = false;
          if (j && j.ok) msg.textContent = '✅ ' + (action === 'fermer' ? 'Fermé' : 'Rouvert') + ' : ' + apps.join(', ') + ' pour ' + j.faits.length + ' personne' + (j.faits.length > 1 ? 's' : '') + (j.absents && j.absents.length ? ' · ' + j.absents.length + ' introuvable(s)' : '');
          else msg.textContent = '⚠️ ' + ((j && (j.reason || j.message)) || 'refusé');
        })
        .catch(function () { fer.disabled = rou.disabled = false; msg.textContent = '⚠️ Réseau — réessaie'; });
    }
    fer.addEventListener('click', function () { agir('fermer'); });
    rou.addEventListener('click', function () { agir('rouvrir'); });
  }
  function wireFermees() {
    var b = document.getElementById('fermgen-save');
    if (!b) return;
    b.addEventListener('click', function () {
      var liste = [], ins = document.querySelectorAll('#fermgen input[data-grp="ferme"]'), msg = document.getElementById('fermgen-msg');
      for (var i = 0; i < ins.length; i++) if (ins[i].checked) liste.push(ins[i].getAttribute('data-app'));
      b.disabled = true; msg.textContent = '…';
      fetch('/__admin/apps-fermees', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ apps: liste }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          b.disabled = false;
          if (j && j.ok) { FERMEES_GEN = j.fermees || []; msg.textContent = '✅ Enregistré'; var sb = document.querySelector('#fermgen summary b'); if (sb) sb.textContent = FERMEES_GEN.length ? FERMEES_GEN.join(', ') : 'aucune'; }
          else msg.textContent = '⚠️ ' + ((j && (j.reason || j.message)) || 'refusé');
        })
        .catch(function () { b.disabled = false; msg.textContent = '⚠️ Réseau — réessaie'; });
    });
  }

  /* ---- Journal admin (événements sensibles, tracés côté serveur) ---- */
  var AUD_EV = {
    admin_login_ok: '🔓 Connexion admin réussie', admin_login_verif: '🤖 Vérification automatique (robot, lecture seule)', admin_login_fail: '⛔️ Code admin refusé',
    revoke_sessions: '🚪 Déconnexion forcée', new_device: '📱 Nouvel appareil', fbtoken_mint: '🔥 Jeton Firebase admin émis',
    perimetre: '🔐 Périmètre modifié', apps_fermees: '🚧 Apps fermées pour tout le monde', nouvel_inscrit: '🆕 Nouvel inscrit (limité à une app)',
    geo_anomaly: '⚠️ Connexion suspecte', nouvelle_connexion: '🆕 Nouvelle connexion', quota_inscriptions_atteint: '🛑 Inscriptions suspendues',
    matricule_refuse: '🪪 Matricule SBM refusé', matricule_corrige: '🪪 Matricule SBM corrigé', compte_invite_cree: '➕ Compte invité créé'
  };
  /* 16.10 (Kevin : « toutes infos cliquables, au bon endroit ») : depuis une fiche, « Connexions », « Appareils »… ouvrent le journal
     de CETTE personne ; « ✕ Tout voir » rend la liste entière. Rien n'est relu : on masque les lignes des autres. */
  var FILTRE_JOURNAL = '';
  function filtrerJournal(uid) {
    FILTRE_JOURNAL = uid || '';
    var el2 = document.getElementById('audsec'); if (!el2) return;
    var d = el2.querySelector('details'); if (d && uid) d.open = true;
    var n = 0;
    Array.prototype.forEach.call(el2.querySelectorAll('.tlrow'), function (r) {
      var garde = !uid || r.getAttribute('data-uid') === uid; r.hidden = !garde; if (garde && r.getAttribute('data-uid')) n++;
    });
    var b = el2.querySelector('.filtre-journal');
    if (!uid) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'filtre-journal'; el2.insertBefore(b, el2.firstChild.nextSibling); }
    b.textContent = '';
    var t = document.createElement('span'); t.textContent = 'Journal de ' + uid + ' — ' + (n ? n + ' événement(s)' : 'aucun événement sensible pour cette personne') + ' ';
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕ Tout voir'; x.onclick = function () { filtrerJournal(''); };
    b.appendChild(t); b.appendChild(x);
  }
  if (typeof window !== "undefined") window.kdmcFiltreJournal = filtrerJournal;
  function audRow(e) {
    return '<div class="tlrow"' + (e.uid ? ' data-uid="' + esc(e.uid) + '" data-va="fiche:' + esc(e.uid) + '"' : '') + '>' + esc(dt(e.ts)) + ' · <b>' + esc(AUD_EV[e.ev] || e.ev) + '</b>'
      + (e.uid ? ' · ' + esc(e.uid) : '') + (e.detail ? ' · ' + esc(e.detail) : '') + (e.text ? ' · ' + esc(e.text) : '')
      + (e.app ? ' · depuis ' + esc(e.app) : '') + (e.pays ? ' · ' + esc(e.pays) : '')
      + (e.ip ? ' · <span style="color:var(--subtle)">ip ' + esc(e.ip) + '</span>' : '') + '</div>';
  }
  function loadAudit() {
    fetch('/__admin/audit', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var el2 = document.getElementById('audsec');
        if (!el2 || !j || !j.ok) return;
        var log = j.log || [];
        /* 6.10 : « Ouvrir le journal des alertes » de la boîte arrive ici (#journal) — section dépliée et amenée à l'écran. */
        var viens = /^#(journal|alertes)$/.test(location.hash || '');
        el2.innerHTML = '<h2 class="cat" id="journal">🛡 Journal admin</h2>'
          + '<details class="histrow kdmc-card kdmc-in"' + (viens ? ' open' : '') + '><summary><span class="i">🛡</span>'
          + '<span class="ct"><span class="n">Événements sensibles</span>'
          + '<span class="d">' + log.length + ' entrée' + (log.length > 1 ? 's' : '') + ' — connexions admin, nouveaux appareils, déconnexions forcées</span></span></summary>'
          + '<div class="timeline">' + (log.length ? log.slice(0, 60).map(audRow).join('') : '<div class="tlrow" style="color:var(--subtle)">Rien pour l\'instant.</div>') + '</div></details>';
        if (viens) { try { el2.scrollIntoView({ block: 'start' }); } catch (_) { /* vieux navigateur : la section est dépliée quand même */ } }
        if (FILTRE_JOURNAL) filtrerJournal(FILTRE_JOURNAL);
      })
      .catch(function () { /* silencieux : section optionnelle */ });
  }

  /* ---- ÉTAT DU COMPTE (Kevin 15.10 : « Yann reste bloqué… trouve des solutions pour voir son compte… ajoute le bouton ») ----------------
     PURE : ce que la fiche dit de la personne, en phrases simples. Elle répond à « pourquoi est-elle bloquée ? » avec ce que le domaine
     lit vraiment sur la fiche (jamais un code, jamais un numéro). */
  function etatCompte(a) {
    a = a || {};
    var f = a.fiche || {}, L = [], verdict = '✅ Rien ne bloque cette personne côté domaine.', probleme = false;
    if (a.attente_admin === 'refuse') { L.push('🚫 Inscription REFUSÉE par toi.'); verdict = '🚫 Compte refusé : elle reste fermée tant que tu ne l\'ouvres pas.'; probleme = true; }
    else if (a.attente_admin) { L.push('⏳ En attente de ton accord (fiche marquée « attente_admin »).'); verdict = '⏳ Elle voit « ton compte attend l\'administrateur ». Touche « Ouvrir ce compte ».'; probleme = true; }
    else L.push('✅ Pas en attente de ton accord' + (a.valide_admin_at ? ' (ouverte par toi ' + dt(a.valide_admin_at) + ')' : '') + '.');
    if (a.revoked_at) L.push('🚪 Sessions coupées ' + dt(a.revoked_at) + ' : elle doit se reconnecter.');
    if (!a.cgu_at) { L.push('📜 Conditions pas encore acceptées : elle les verra à sa prochaine page.'); }
    if (!a.code_at) { L.push('🔑 Pas encore de code posé : le portail lui demandera d\'en choisir un.'); }
    if (a.tel_requis && !a.tel) { L.push('📱 Numéro à confirmer : tant que ce n\'est pas fait, rien d\'autre ne s\'ouvre.'); if (!probleme) verdict = '📱 Elle doit confirmer son numéro.'; probleme = true; }
    else L.push('📱 Numéro : ' + (a.tel || f.telephone ? 'confirmé' : 'non demandé') + '.');
    var bq = a.bloque || [];
    L.push('🔐 Portée : ' + (a.portee === 'app' ? 'seulement ' + ((a.acces || []).join(', ') || '⚠️ aucune app') : 'tout le domaine') + (bq.length ? ' · fermé : ' + bq.join(', ') : ''));
    if (a.portee === 'app' && !(a.acces || []).length) { verdict = '⚠️ Portée « une app » sans aucune app cochée : elle n\'a accès à rien.'; probleme = true; }
    if (bq.indexOf('arbre') >= 0) { L.push('🌳 L\'arbre lui est FERMÉ (case « Fermer une application précise »).'); verdict = '🌳 L\'arbre est fermé pour elle : décoche « arbre » dans « Où elle peut aller ».'; probleme = true; }
    L.push('🕓 Dernière connexion ' + dt(a.last_seen) + ' · ' + String(a.hits || 0) + ' connexion(s).');
    return { lignes: L, verdict: verdict, attente: !!a.attente_admin, probleme: probleme };
  }
  var _comptes = [];   /* les comptes de la DERNIÈRE lecture (la liste se rafraîchit toute seule : le bouton lit toujours les plus récents) */
  /* ---- PERSONNES BANNIES (Kevin 15.10 : « l'option bannir… si besoin ») : la liste, et « Autoriser de nouveau ». ---- */
  /* PURE : les comptes FERMÉS « en attente / refusé » d'après les fiches elles-mêmes (pas d'après la file de demandes, qui peut les avoir perdus). */
  function comptesBloques(list) {
    return (list || []).filter(function (a) { return a && a.uid && a.attente_admin && a.uid !== 'kdmc_admin'; })
      .map(function (a) { return { uid: a.uid, nom: a.name || a.uid, refuse: a.attente_admin === 'refuse', vu: a.last_seen || a.created || 0 }; })
      .sort(function (x, y) { return (x.refuse - y.refuse) || (y.vu - x.vu); });
  }
  function blocBloques(accounts) {
    var L = comptesBloques(accounts);
    if (!L.length) return '<div class="note" id="bloques">✅ Personne n\'est bloqué : tous les comptes sont ouverts.</div>';
    return '<div class="note" id="bloques" style="border-color:#c9a227"><b>⏳ ' + L.length + ' compte' + (L.length > 1 ? 's' : '') + ' fermé' + (L.length > 1 ? 's' : '') + ' — ils attendent ton accord</b>'
      + L.map(function (x) {
        return '<div style="display:flex;gap:8px;align-items:center;margin:8px 0"><span style="flex:1">' + esc(x.nom) + (x.refuse ? ' <span class="d">· refusé</span>' : '') + '</span>'
          + '<button class="savacc ouvrir-bloque" data-uid="' + esc(x.uid) + '" type="button">✅ Ouvrir</button></div>';
      }).join('') + '</div>';
  }
  function wireBloques() {
    var z = document.getElementById('bloques');
    if (!z || z._ok) return; z._ok = true;
    z.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.ouvrir-bloque') : null;
      if (!b) return;
      b.disabled = true; b.textContent = '…';
      fetch('/__admin/compte-ouvrir', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ uid: b.getAttribute('data-uid') }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) { b.textContent = '✅ Ouvert'; b.parentNode.style.opacity = '.6'; } else { b.disabled = false; b.textContent = '⚠️ Échec — réessaie'; } })
        .catch(function () { b.disabled = false; b.textContent = '⚠️ Échec — réessaie'; });
    });
  }
  /* PERSONNES ATTENDUES : un nom inscrit d'avance entre sans attendre (usage unique ; code toujours exigé ; jamais un banni). */
  function blocAttendus() {
    return '<details class="fermgen" id="attendus"><summary>👋 Personnes attendues <span class="d">(un nom connu entre sans attendre ton accord)</span></summary>'
      + '<div style="display:flex;gap:8px;margin:8px 0"><input id="attendu-nom" class="search" style="margin:0;flex:1" placeholder="Prénom et nom (ex. Yann Lorenzi)" autocomplete="off">'
      + '<button class="savacc" id="attendu-ajout" type="button">➕ Ajouter</button></div>'
      + '<div id="attendus-liste" class="d">Touche pour charger…</div></details>';
  }
  function wireAttendus() {
    var det = document.getElementById('attendus');
    if (!det || det._ok) return; det._ok = true;
    var liste = document.getElementById('attendus-liste');
    function dessiner(l) {
      liste.innerHTML = l.length ? l.map(function (x) {
        return '<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><span style="flex:1">' + esc(x.nom) + ' <span class="d">· ajouté ' + esc(dt(x.at)) + '</span></span>'
          + '<button class="savacc attendu-retirer" data-nom="' + esc(x.nom) + '" type="button">✖ Retirer</button></div>';
      }).join('') : 'Personne n\'est attendu pour l\'instant.';
    }
    function appeler(corps) {
      var opt = corps ? { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify(corps) } : { credentials: 'include', headers: adminHeaders() };
      return fetch('/__admin/attendus', opt).then(function (r) { return r.json(); });
    }
    function charger() { liste.textContent = 'Je lis la liste…'; appeler(null).then(function (j) { dessiner((j && j.attendus) || []); }).catch(function () { liste.textContent = '⚠️ Liste illisible — réessaie.'; }); }
    det.addEventListener('toggle', function () { if (det.open) charger(); });
    det.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var aj = t.closest('#attendu-ajout'), re = t.closest('.attendu-retirer');
      if (aj) {
        var inp = document.getElementById('attendu-nom'), nom = (inp.value || '').trim();
        if (nom.split(/\s+/).length < 2) { liste.textContent = 'Écris le prénom ET le nom.'; return; }
        appeler({ nom: nom }).then(function (j) { if (j && j.ok) { inp.value = ''; dessiner(j.attendus || []); } else liste.textContent = '⚠️ ' + ((j && j.reason) || 'échec') + ' — réessaie.'; }).catch(function () { liste.textContent = '⚠️ Échec — réessaie.'; });
      } else if (re) {
        appeler({ nom: re.getAttribute('data-nom'), retirer: true }).then(function (j) { if (j && j.ok) dessiner(j.attendus || []); }).catch(function () { liste.textContent = '⚠️ Échec — réessaie.'; });
      }
    });
  }
  function blocBannis() {
    return '<details class="fermgen" id="bannis"><summary>🚫 Personnes bannies <span class="d">(ne peuvent pas se réinscrire)</span></summary>'
      + '<div id="bannis-liste" class="d">Touche pour charger…</div></details>';
  }
  function wireBannis() {
    var det = document.getElementById('bannis');
    if (!det || det._ok) return; det._ok = true;
    var liste = document.getElementById('bannis-liste');
    function charger() {
      liste.textContent = 'Je lis la liste…';
      fetch('/__admin/bannis', { credentials: 'include', headers: adminHeaders() }).then(function (r) { return r.json(); }).then(function (j) {
        var l = (j && j.bannis) || [];
        liste.innerHTML = l.length ? l.map(function (x) {
          return '<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><span style="flex:1">' + esc(x.nom || x.uid) + ' <span class="d">· ' + esc(dt(x.at)) + '</span></span>'
            + '<button class="savacc debannir" data-id="' + esc(x.id) + '" type="button">✅ Autoriser de nouveau</button></div>';
        }).join('') : 'Personne n\'est banni.';
      }).catch(function () { liste.textContent = '⚠️ Liste illisible — réessaie.'; });
    }
    det.addEventListener('toggle', function () { if (det.open) charger(); });
    det.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.debannir') : null;
      if (!b) return;
      if (!confirm('Autoriser de nouveau cette personne à s\'inscrire ?')) return;
      b.disabled = true; b.textContent = '…';
      fetch('/__admin/debannir', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ id: b.getAttribute('data-id') }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) charger(); else { b.disabled = false; b.textContent = '⚠️ Échec — réessaie'; } })
        .catch(function () { b.disabled = false; b.textContent = '⚠️ Échec — réessaie'; });
    });
  }
  /* PURE : un compte supprimable depuis l'écran = jamais l'admin (Kevin) ; le domaine refuse aussi, quoi qu'on envoie. */
  function peutSupprimer(a) {
    if (!a || !a.uid || a.uid === 'kdmc_admin') return false;
    var t = String(a.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
    return !(t.indexOf('desarzens') >= 0 && (t.indexOf('kevin') >= 0 || t.indexOf('k') >= 0));
  }
  function wireEtat() {
    var list = document.getElementById('list');
    if (!list || list._etat) return; list._etat = true;
    list.addEventListener('click', function (e) {
      var ouvrir = e.target && e.target.closest ? e.target.closest('.ouvrir-compte') : null;
      if (ouvrir) {
        var u = ouvrir.getAttribute('data-uid') || ''; ouvrir.disabled = true; ouvrir.textContent = '…';
        fetch('/__admin/compte-ouvrir', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ uid: u }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { ouvrir.textContent = j && j.ok ? '✅ Compte ouvert — demande-lui de rouvrir la page' : '⚠️ Échec — réessaie'; if (!(j && j.ok)) ouvrir.disabled = false; })
          .catch(function () { ouvrir.disabled = false; ouvrir.textContent = '⚠️ Échec — réessaie'; });
        return;
      }
      var suppr = e.target && e.target.closest ? e.target.closest('.supprimer-compte') : null;
      if (suppr) {
        var su = suppr.getAttribute('data-uid') || '', sa = (_comptes || []).filter(function (x) { return x.uid === su; })[0];
        if (!sa || !peutSupprimer(sa)) return;
        var bannir = !!(suppr.parentNode.querySelector('.bannir-aussi') || {}).checked;
        if (!confirm('SUPPRIMER le compte « ' + (sa.name || su) + ' » ?\n\nSa fiche et son code sont effacés. ' + (bannir ? 'BANNI : elle ne pourra PAS se réinscrire (même nom, même téléphone confirmé). Tu pourras l\'autoriser de nouveau dans « Personnes bannies ».' : 'Elle pourra se réinscrire plus tard (son nom redevient libre).') + '\nOn ne peut pas annuler depuis l\'écran.')) return;
        suppr.disabled = true; suppr.textContent = '…';
        fetch('/__admin/compte-supprimer', { method: 'POST', credentials: 'include', headers: Object.assign({ 'content-type': 'application/json' }, adminHeaders()), body: JSON.stringify({ uid: su, confirmer: true, bannir: bannir }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && j.ok) { suppr.textContent = j.banni ? '✅ Supprimé et banni' : '✅ Compte supprimé'; var f = document.getElementById('fiche-' + su); if (f) f.style.opacity = '.45'; }
            else { suppr.disabled = false; suppr.textContent = j && j.reason === 'admin_protege' ? '🔒 Compte admin : jamais supprimé' : '⚠️ Échec — réessaie'; }
          })
          .catch(function () { suppr.disabled = false; suppr.textContent = '⚠️ Échec — réessaie'; });
        return;
      }
      var b = e.target && e.target.closest ? e.target.closest('.etatcompte') : null;
      if (!b) return;
      var uid = b.getAttribute('data-uid') || '', box = b.parentNode.querySelector('.etatbox[data-uid="' + uid.replace(/"/g, '') + '"]');
      if (!box) return;
      var a = (_comptes || []).filter(function (x) { return x.uid === uid; })[0];
      if (!a) { box.hidden = false; box.textContent = 'Compte introuvable dans la liste : recharge la page.'; return; }
      var r = etatCompte(a);
      box.hidden = false;
      box.innerHTML = '<div><b>' + esc(r.verdict) + '</b></div>' + r.lignes.map(function (l) { return '<div class="d">' + esc(l) + '</div>'; }).join('')
        + '<button class="savacc ouvrir-compte" data-uid="' + esc(uid) + '" type="button">' + (r.attente ? '✅ Ouvrir ce compte' : '✅ Ouvrir ce compte quand même') + '</button>'
        + (peutSupprimer(a) ? ' <label class="chipacc" style="display:flex;margin:8px 0"><input type="checkbox" class="bannir-aussi"> 🚫 Bannir aussi : ne pourra pas se réinscrire (même nom, même téléphone confirmé)</label><button class="savacc supprimer-compte" data-uid="' + esc(uid) + '" type="button" style="background:#5a1d1d;color:#ffd9d9">🗑️ Supprimer ce compte</button>' : '');
    });
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
      + blocBloques(accounts)
      + blocAttendus()
      + blocFermees()
      + blocCreer()
      + blocLot(accounts)
      + blocBannis()
      + '<h2 class="cat">📊 Tous les comptes</h2>'
      + '<div class="stat" id="gstat">' + globalPills(accounts) + '</div>'
      + histSection(accounts)
      + '<input class="search" id="q" placeholder="🔎 Rechercher un client (nom, lieu, appareil)…" autocomplete="off" autocapitalize="off">'
      + '<h2 class="cat">👥 Fiches clients</h2>'
      + (accounts.length ? '<div id="list">' + accounts.map(fiche).join('') + '</div>'
        : '<div class="msg">Aucune fiche pour l\'instant.<br>Les comptes apparaissent ici dès leur 1ʳᵉ connexion sur le domaine.</div>')
      + '<div id="audsec"></div>'
      + (SANS_HUB ? '' : hub());   /* dans le tableau unique, les tuiles sont rangées par thème ailleurs (tableau.js) */
    wirePresence();
    wireHist();
    _comptes = accounts || [];
    /* Les tuiles « Raccourcis » pointent vers des sections repliées : on les déplie quand on y arrive (une seule écoute pour toute la vie de la page). */
    if (!window._ancreEcoutee) {
      window._ancreEcoutee = true;
      window.addEventListener('hashchange', function () { var el = document.getElementById(String(location.hash || '').slice(1)); if (el && el.tagName === 'DETAILS') el.open = true; });
    }
    wireRevoke();
    wireEtat();
    wireBannis();
    wireBloques();
    wireAttendus();
    wireAcces();
    wireFermees();
    wireCreer();
    wireLot();
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
  function adminHeaders() { var t = '', p = ''; try { t = localStorage.getItem(ADMIN_TOK) || ''; p = localStorage.getItem('kdmc_sso_token') || ''; } catch (e) { /* */ }
    var h = {}; if (t) h['x-kdmc-admin'] = t; if (p) h['Authorization'] = 'Bearer ' + p;   /* (27.09) la session vérifiée de Kevin vaut le code */
    return h; }

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

  var _appsP = null;
  function loadAccounts(tries, silent) {
    /* La liste des apps du domaine est nécessaire pour afficher le bloc « Où elle
       peut aller ». Chargée UNE fois, avant le premier rendu. Son absence ne bloque
       rien : sans elle, les fiches s'affichent exactement comme avant (fail-open).
       Drapeau DÉDIÉ : réutiliser `silent` ici avalerait la demande du code admin
       au premier chargement (silent = « ne casse pas la vue sur hoquet réseau »). */
    /* 10.10 (réactivité) : la liste des apps et les comptes partent ENSEMBLE (avant : l'un après l'autre, 1 aller-retour de plus) ;
       le premier rendu attend les deux, comme avant. */
    if (!_appsP) _appsP = chargerApps();
    var comptesP = fetch('/__admin/accounts', { credentials: 'include', cache: 'no-store', headers: adminHeaders() })
      .then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }).catch(function () { return { st: r.status, j: null }; }); });
    return Promise.all([comptesP, _appsP]).then(function (x) { return x[0]; })
      .then(function (res) {
        var j = res.j;
        if (res.st === 403 || !j || !j.ok) {
          if (silent) return; /* refresh auto : ne casse pas la vue si hoquet réseau/grant */
          if (j && j.reason === 'need_admin_code') { try { localStorage.removeItem(ADMIN_TOK); } catch (e) { /* */ }
            /* (27.09) d'abord le grant SANS code, par la session vérifiée du domaine ; le code seulement si le domaine ne connaît pas cet appareil */
            fetch('/__admin/grant', { credentials: 'include', headers: adminHeaders() }).then(function (r) { return r.json().catch(function () { return null; }); })
              .then(function (g) { if (g && g.ok && g.grant) { try { localStorage.setItem(ADMIN_TOK, g.grant); } catch (e) { /* */ } loading(); loadAccounts(0); } else promptAdminCode(); })
              .catch(function () { promptAdminCode(); });
            return; }
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
  /* 10.10 — TABLEAU DE BORD UNIQUE (Kevin : « un seul tableau de bord admin pour tout ») : kd-mc.com/admin/ porte
     data-tableau-unique ; tableau.js vérifie d'abord la session (admin + Face ID, /__sso/whoami), puis MONTE ces fiches dans
     sa section « Personnes & comptes ». Le serveur garde son propre verrou (/__admin/* → 403 sans preuve). */
  var SANS_HUB = false;
  if (typeof window !== 'undefined') window.kdmcAdmin = { hub: hub, monter: function (el) { if (!el) return; app = el; SANS_HUB = true; boot(); } };
  /* « Qui se connecte » (admin.kd-mc.com) — 15.10.2026. Cette page n'est plus servie sans compte du domaine, et une app
     installée sur l'écran d'accueil a ses cookies à part : un lien nu y arrivait SANS session (porte). Les tuiles de cet
     admin étaient des liens nus, contrairement à celles du portail. On passe donc par kdmcSSO.porte() (comme le portail) :
     admin.kd-mc.com/__sso/entrer remet le pass à la page par le lien (#kdmc_sso=), et le domaine le vérifie. */
  function ouvrirAvecPass(href) {
    var S = window.kdmcSSO;
    if (!(S && S.porte)) { location.href = href; return; }
    S.porte(href).then(function (dest) { location.href = dest; }, function () { location.href = href; });
  }
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    window.kdmcOuvrirAvecPass = ouvrirAvecPass;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href^="https://admin.kd-mc.com"]') : null;
      if (!a || a.target === '_blank') return;
      e.preventDefault();
      ouvrirAvecPass(a.href);
    }, true);
  }
  /* On ne démarre que dans un navigateur : chargée par sa garde (node), la page
     n'a ni #app ni réseau — seul hub() est appelé, et il doit l'être sans effet de bord. */
  if (app && !document.documentElement.hasAttribute('data-tableau-unique')) boot();
})();
