/* LE BOUTON « INSTALLER L'APPLICATION » ET « ACTIVER LES NOTIFICATIONS », sur CHAQUE page de CHAQUE app du domaine (Kevin 22.10.2026 :
 * « toutes mes applications doivent avoir un bouton pour installer l'application sur l'écran d'accueil… et que toutes les autorisations soient acceptées,
 * application fermée, écran éteint, comme n'importe quelle application »). Ce fichier est servi tel quel sur /__installer/installer.js ; le routeur
 * l'ajoute à chaque page HTML (même mécanisme que ✉️). Il tient dans une chaîne : AUCUN guillemet inversé ni « ${ » dedans (garde test:installer).
 * · Android / ordinateur (Chrome, Edge) : le vrai bouton « Installer » du navigateur (beforeinstallprompt).
 * · iPhone / iPad : Apple n'offre aucun bouton programmable → un guide en 3 gestes, avec la flèche Partager dessinée ; hors Safari : « ouvre dans Safari ».
 * · Notifications : demandées PAR UN TOUCHER (obligatoire partout), abonnement push signé par le service de notifications du domaine, envoyées
 *   même app fermée / écran éteint (iPhone : seulement une fois l'app posée sur l'écran d'accueil — règle d'Apple, dite clairement).
 * · Ne fait RIEN dans un cadre (iframe), ni dans l'admin, ni sur apex-chat (qui a ses propres notifications). */
export const INSTALLER_JS = String.raw`(function () {
  'use strict';
  try {
    if (window.__kdmcInstaller || window.top !== window.self) return;
    window.__kdmcInstaller = 1;
    var HOTE = location.hostname, UA = navigator.userAgent || '';
    /* 👑 / 👁 VUE ADMIN ⇄ VUE MEMBRE, sur chaque page du domaine (Kevin 23.10.2026 : « comme dans la light, un bouton où je me connecte admin et je
       me déconnecte »). Le bouton n'apparaît que sur les appareils de Kevin (marqueur kdmc_k, posé seulement à l'admin prouvé) : AUCUNE requête
       pour les autres. Il ne décide rien : le domaine vérifie l'admin à chaque bascule (403 sinon, et le bouton disparaît). */
    try { if (/(?:^|;\s*)kdmc_k=1(?:;|$)/.test(document.cookie)) {
      var poserVue = function () {
        if (!document.body || document.querySelector('[data-kdmc-vue]')) return;
        var membre = /(?:^|;\s*)kdmc_vue=membre(?:;|$)/.test(document.cookie);   /* première idée, corrigée par le domaine juste après */
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-kdmc-vue', membre ? 'membre' : 'admin');
        b.textContent = membre ? '👁 Vue membre' : '👑 Vue admin';
        b.setAttribute('aria-label', membre ? 'Tu vois le domaine comme un membre abonné. Toucher pour revenir en admin.' : 'Tu es en admin. Toucher pour voir le domaine comme un membre abonné.');
        b.style.cssText = 'position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:2147481900;min-height:44px;padding:0 14px;border-radius:22px;font:700 14px/1 -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.45);'
          + (membre ? 'background:#1d4ed8;color:#fff;border:2px solid #93c5fd' : 'background:#0b1409;color:#e8b830;border:1px solid #e8b830');
        b.onclick = function () {
          b.disabled = true; b.textContent = '…';
          fetch('/__admin/vue', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: membre ? 'admin' : 'membre' }) })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (j) { if (j && j.ok) location.reload(); else { b.textContent = 'Reconnecte-toi admin (kd-mc.com)'; setTimeout(function () { b.remove(); }, 4000); } })
            .catch(function () { b.disabled = false; b.textContent = membre ? '👁 Vue membre' : '👑 Vue admin'; });
        };
        document.body.appendChild(b);
        /* 24.10 (capture de Kevin, admin v2.7.13) : le badge de version est aussi en bas à gauche — dans l'app installée ils se chevauchaient.
           Le bouton se pose AU-DESSUS de tout ce qui occupe déjà son coin (badge chargé plus tard : on revérifie). */
        var degager = function () {
          var bas = 8, autres = document.querySelectorAll('#kdmc-version-badge');
          for (var k = 0; k < autres.length; k++) {
            var o = autres[k].getBoundingClientRect(), m = b.getBoundingClientRect();
            if (o.width && o.left < m.right && o.right > m.left) bas = Math.max(bas, Math.round(window.innerHeight - o.top + 8));
          }
          b.style.bottom = bas > 8 ? bas + 'px' : 'calc(env(safe-area-inset-bottom,0px) + 8px)';   /* au-dessus d'un voisin : sa hauteur mesurée inclut déjà la zone de sécurité */
        };
        degager(); setTimeout(degager, 800); setTimeout(degager, 3000); window.addEventListener('resize', degager);
        /* 23.10 soir (Kevin : « Tableau KDMC a disparu… je ne suis pas connecté en admin… il était censé y avoir un bouton admin partout ») :
           le marqueur dure 1 an, la session admin moins. Le bouton affichait « 👑 Vue admin » alors que l'admin avait expiré, puis disparaissait.
           Il demande maintenant l'état VRAI au domaine (1 requête, appareils de Kevin seulement) ; admin expiré → « 🔑 Connexion admin »
           qui mène à l'écran du code / Face ID (kd-mc.com/admin/). Ce bouton n'ouvre rien : c'est le domaine qui vérifie. */
        fetch('/__admin/vue', { credentials: 'include' }).then(function (r) { return r.status === 403 ? { ok: false, reason: 'admin_requis' } : r.json(); })
          .then(function (j) {
            if (j && j.ok) {
              membre = j.mode === 'membre'; b.setAttribute('data-kdmc-vue', membre ? 'membre' : 'admin');
              b.textContent = membre ? '👁 Vue membre' : '👑 Vue admin';
              return;
            }
            if (j && j.reason === 'admin_requis') {
              b.setAttribute('data-kdmc-vue', 'connexion'); b.textContent = '🔑 Connexion admin';
              b.setAttribute('aria-label', 'Ta session admin a expiré. Toucher pour te reconnecter (code ou Face ID).');
              b.style.background = '#3a2a05'; b.style.color = '#ffd76a'; b.style.border = '1px solid #e8b830';
              b.onclick = function () { location.href = 'https://kd-mc.com/admin/'; };
            }
          }).catch(function () { /* hors ligne : on garde le bouton tel quel */ });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poserVue); else poserVue();
    } } catch (e) { /* */ }
    if (/^admin\./.test(HOTE)) return;
    var IOS = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var SAFARI = IOS ? !/crios|fxios|edgios|opios|gsa\//i.test(UA) : /^((?!chrome|android|crios|fxios).)*safari/i.test(UA);
    var ANDROID = /android/i.test(UA);
    var INSTALLEE = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var PROPRES_NOTIFS = /^apex-chat\./.test(HOTE);   /* Apex Chat gère ses propres notifications */
    var PUSH_OK = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window) && !PROPRES_NOTIFS;
    var differe = null, installeeMaintenant = false;
    function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    /* 23.10 (Kevin : « quand l'application est déjà installée sur l'appareil qui consulte, enlever les petits visuels pour l'ajouter, partout ») :
       l'app ouverte depuis l'écran d'accueil le note (ici, et au domaine pour l'iPhone où Safari ne partage rien avec l'app) ; le navigateur de ce
       même appareil n'affiche alors plus ni 📲, ni feuille d'installation, ni les boutons « Installer » propres aux apps. */
    var DEJA_TTL = 14 * 86400000;
    function appareil() {
      var plat = IOS ? (/ipad/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ipad' : 'iphone') : ANDROID ? 'android' : /mac/i.test(UA) ? 'mac' : /windows/i.test(UA) ? 'win' : /cros/i.test(UA) ? 'chromeos' : 'autre';
      var os = (UA.match(/OS (\d+)_/) || UA.match(/Android (\d+)/) || UA.match(/Windows NT (\d+)/) || [0, 0])[1];
      var w = 0, h = 0, d = 1; try { w = Math.min(screen.width, screen.height) | 0; h = Math.max(screen.width, screen.height) | 0; d = Math.round((window.devicePixelRatio || 1) * 100) / 100; } catch (e) { /* */ }
      return (plat + '-' + os + '-' + w + 'x' + h + '@' + d).toLowerCase().replace(/[^a-z0-9_.@x-]/g, '').slice(0, 60);
    }
    function dejaIci() { var t = +lire('kdmc_app_installee_at') || 0; return t > 0 && Date.now() - t < DEJA_TTL; }
    var DEJA = !INSTALLEE && dejaIci();   /* l'app est installée sur cet appareil, et on la regarde dans le navigateur */
    var MASQUER = { '*': '#install-hint,#install-bar,#btnInstall,#pwa-go', 'kd-mc.com': '#install', 'www.kd-mc.com': '#install' };
    function masquerBoutonsDesApps() {
      try {
        if (document.getElementById('kdmc-inst-masque')) return;
        var sel = MASQUER['*'] + (MASQUER[HOTE] ? ',' + MASQUER[HOTE] : '');
        var st = document.createElement('style'); st.id = 'kdmc-inst-masque'; st.textContent = sel + '{display:none!important}';
        (document.head || document.documentElement).appendChild(st);
        document.documentElement.setAttribute('data-kdmc-app-installee', '1');
      } catch (e) { /* */ }
    }
    function marquerDeja() { DEJA = true; ecrire('kdmc_app_installee_at', String(Date.now())); masquerBoutonsDesApps(); if (!feuille) majPastille(); }
    function signalerInstallee() {
      ecrire('kdmc_app_installee_at', String(Date.now()));
      if (Date.now() - (+lire('kdmc_inst_signale') || 0) < 7 * 86400000) return;
      api('/__push/installee', { appareil: appareil(), installee: true }).then(function (r) { if (r && r.ok) ecrire('kdmc_inst_signale', String(Date.now())); }).catch(function () { /* */ });
    }
    function demanderSiInstallee() {
      if (INSTALLEE || DEJA) return;
      /* Chrome / Edge (ordinateur, Android) : l'app installée mais jamais ouverte se voit quand même (manifeste avec related_applications) — retour du Lenovo, pont 507 */
      try { if (navigator.getInstalledRelatedApps) navigator.getInstalledRelatedApps().then(function (l) { if (l && l.length && !INSTALLEE) marquerDeja(); }).catch(function () { /* */ }); } catch (e) { /* */ }
      api('/__push/installee?appareil=' + encodeURIComponent(appareil())).then(function (r) { if (r && r.ok && r.installee) marquerDeja(); }).catch(function () { /* */ });
    }
    function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

    /* 1. Rendre l'app INSTALLABLE même si sa page n'a pas prévu manifeste ni icône (jamais de doublon : on n'ajoute que ce qui manque) */
    function preparer() {
      var h = document.head || document.documentElement;
      if (!document.querySelector('link[rel="manifest"]')) { var m = document.createElement('link'); m.rel = 'manifest'; m.href = '/__installer/manifest.webmanifest'; h.appendChild(m); }
      if (!document.querySelector('link[rel="apple-touch-icon"]')) { var a = document.createElement('link'); a.rel = 'apple-touch-icon'; a.href = '/__installer/apple-touch-icon.png'; h.appendChild(a); }
      if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) { var c = document.createElement('meta'); c.name = 'apple-mobile-web-app-capable'; c.content = 'yes'; h.appendChild(c); }
      if (!document.querySelector('meta[name="mobile-web-app-capable"]')) { var d = document.createElement('meta'); d.name = 'mobile-web-app-capable'; d.content = 'yes'; h.appendChild(d); }
    }
    /* 2. Un service worker est NÉCESSAIRE aux notifications : si l'app n'en a aucun, on pose le nôtre (portée « / ») */
    function assurerSW() {
      if (!('serviceWorker' in navigator)) return Promise.reject(new Error('sw_absent'));
      return navigator.serviceWorker.getRegistration().then(function (r) {
        if (r) return r;
        return navigator.serviceWorker.register('/__installer/sw.js', { scope: '/' });
      }).then(function () { return navigator.serviceWorker.ready; });
    }
    function cleEnOctets(b64) { var p = '='.repeat((4 - b64.length % 4) % 4), s = (b64 + p).replace(/-/g, '+').replace(/_/g, '/'), r = atob(s), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
    function api(chemin, corps) {
      return fetch(chemin, { method: corps === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store', headers: corps === undefined ? {} : { 'content-type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'reponse_illisible' }; }); });
    }
    function etatNotifs() { return !('Notification' in window) ? 'indisponible' : Notification.permission; }
    function abonne() {
      return assurerSW().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { return !!s; }).catch(function () { return false; });
    }
    /* 3. Activer : permission (par le toucher), abonnement, enregistrement au domaine */
    function activerNotifs() {
      if (!PUSH_OK) return Promise.resolve({ ok: false, raison: IOS && !INSTALLEE ? 'ios_installer_d_abord' : 'non_supporte' });
      if (IOS && !INSTALLEE) return Promise.resolve({ ok: false, raison: 'ios_installer_d_abord' });
      return Notification.requestPermission().then(function (p) {
        if (p !== 'granted') return { ok: false, raison: p === 'denied' ? 'refusee' : 'ignoree' };
        return Promise.all([assurerSW(), api('/__push/cle')]).then(function (r) {
          var reg = r[0], cle = r[1];
          if (!cle || !cle.ok || !cle.cle) return { ok: false, raison: 'service_notifs_absent' };
          return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(cle.cle) }); }).then(function (sub) {
            return api('/__push/abonner', { sub: sub.toJSON(), app: HOTE, installee: INSTALLEE }).then(function (rep) {
              if (rep && rep.ok) { ecrire('kdmc_notifs_ok', String(Date.now())); return { ok: true }; }
              return { ok: false, raison: rep && rep.reason === 'connexion_requise' ? 'connexion_requise' : 'enregistrement_refuse' };
            });
          });
        });
      }).catch(function (e) { return { ok: false, raison: 'erreur', detail: String(e && e.message || e).slice(0, 80) }; });
    }
    /* 4. Installer */
    function installer() {
      if (differe) {
        var p = differe; differe = null;
        p.prompt();
        return p.userChoice.then(function (c) { if (c && c.outcome === 'accepted') { installeeMaintenant = true; ecrire('kdmc_installee', '1'); } return { ok: !!(c && c.outcome === 'accepted'), raison: c && c.outcome }; });
      }
      return Promise.resolve({ ok: false, raison: IOS ? 'ios_guide' : 'pas_de_bouton_navigateur' });
    }
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); differe = e; majPastille(); });
    window.addEventListener('appinstalled', function () { installeeMaintenant = true; ecrire('kdmc_installee', '1'); ecrire('kdmc_app_installee_at', String(Date.now())); masquerBoutonsDesApps(); majPastille(); if (feuille) ouvrir(); });

    /* 5. Interface : UNE petite pastille 📲 (haut à droite), une feuille avec deux gros boutons */
    var pastille = null, feuille = null, fond = null;
    var NOIR = '#0b1409', OR = '#e8b830', TEXTE = '#f3f0e6';
    function majPastille() {
      if (!document.body) return;
      var tout = DEJA || ((INSTALLEE || installeeMaintenant) && (PROPRES_NOTIFS || etatNotifs() === 'granted' || !PUSH_OK));
      if (tout && !feuille) { if (pastille) { pastille.remove(); pastille = null; } return; }
      if (!pastille) {
        pastille = el('button', 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:2147482000;min-width:44px;min-height:44px;border-radius:22px;border:1px solid ' + OR + ';background:' + NOIR + ';color:' + OR + ';font:700 18px/1 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);cursor:pointer;padding:0 12px', (INSTALLEE || installeeMaintenant) ? '🔔' : '📲');
        pastille.type = 'button'; pastille.setAttribute('aria-label', (INSTALLEE || installeeMaintenant) ? 'Activer les notifications' : "Installer l'application et activer les notifications"); pastille.setAttribute('data-kdmc-installer', 'pastille');
        pastille.onclick = ouvrir; document.body.appendChild(pastille);
        placer(); setTimeout(placer, 1500); setTimeout(placer, 5000); setTimeout(placer, 12000); setTimeout(placer, 25000);
      }
    }
    /* 22.10 (Lenovo, pont 383) : sur CMCteams la pastille couvrait « ✕ Déconnexion ». Elle choisit un coin où elle ne couvre RIEN de cliquable. */
    var COINS = ['top:calc(env(safe-area-inset-top,0px) + 8px);right:8px', 'bottom:calc(env(safe-area-inset-bottom,0px) + 84px);left:8px', 'bottom:calc(env(safe-area-inset-bottom,0px) + 84px);right:8px', 'top:50%;left:8px', 'top:50%;right:8px', 'top:calc(env(safe-area-inset-top,0px) + 8px);left:8px'];
    function cliquable(n) { var k = 0; while (n && n.nodeType === 1 && k++ < 6) { var t = n.tagName; if (t === 'BUTTON' || t === 'A' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || n.getAttribute('role') === 'button' || n.onclick) return true; try { if (getComputedStyle(n).cursor === 'pointer') return true; } catch (e) { /* */ } n = n.parentNode; } return false; }
    function couvre() {
      if (!pastille || !document.elementsFromPoint) return false;
      var r = pastille.getBoundingClientRect(), pts = [[.15, .15], [.85, .15], [.5, .5], [.15, .85], [.85, .85]];
      for (var i = 0; i < pts.length; i++) {
        var x = r.left + r.width * pts[i][0], y = r.top + r.height * pts[i][1], l = document.elementsFromPoint(x, y);
        if (l.length && l[0] !== pastille && !(l[0].getAttribute && l[0].getAttribute('data-kdmc-installer')) && l[0] !== document.body && l[0] !== document.documentElement) return true;   /* quelque chose (la mascotte d'Apex Chat, un cadre) est PAR-DESSUS la pastille : on change de coin */
        for (var j = 0; j < l.length; j++) { if (l[j] === pastille || l[j].getAttribute('data-kdmc-installer') || l[j] === document.body || l[j] === document.documentElement) continue; if (cliquable(l[j])) return true; break; }
      }
      return false;
    }
    function placer() {
      if (!pastille || feuille) return;
      var base = 'position:fixed;z-index:2147482000;min-width:44px;min-height:44px;border-radius:22px;border:1px solid ' + OR + ';background:' + NOIR + ';color:' + OR + ';font:700 18px/1 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);cursor:pointer;padding:0 12px;';
      for (var i = 0; i < COINS.length; i++) { pastille.style.cssText = base + COINS[i]; if (!couvre()) return; }
      pastille.style.cssText = base + COINS[0];
    }
    window.addEventListener('resize', function () { placer(); });
    function ligne(titre, aide, bouton, onclick, fait) {
      var l = el('div', 'background:#16210f;border:1px solid #2a3a22;border-radius:14px;padding:14px;margin:0 0 12px');
      l.appendChild(el('div', 'font:700 16px/1.3 -apple-system,sans-serif;color:' + TEXTE + ';margin:0 0 4px', titre));
      l.appendChild(el('div', 'font:14px/1.45 -apple-system,sans-serif;color:#cfd8cc;margin:0 0 10px', aide));
      var b = el('button', 'width:100%;min-height:50px;border-radius:13px;border:0;font:700 16px/1 -apple-system,sans-serif;cursor:pointer;background:' + (fait ? '#2a3a22' : OR) + ';color:' + (fait ? '#9fd08a' : NOIR), bouton);
      b.type = 'button'; if (fait) b.disabled = true; else b.onclick = onclick; l.appendChild(b); return l;
    }
    function fermer() { if (feuille) { feuille.remove(); feuille = null; } if (fond) { fond.remove(); fond = null; } majPastille(); }
    function ouvrir() {
      fermer();
      fond = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147482500'); fond.onclick = fermer;
      feuille = el('div', 'position:fixed;left:0;right:0;bottom:0;z-index:2147482600;background:' + NOIR + ';color:' + TEXTE + ';border-radius:20px 20px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom,0px) + 18px);max-height:86vh;overflow:auto;box-shadow:0 -8px 30px rgba(0,0,0,.6)');
      feuille.setAttribute('role', 'dialog'); feuille.setAttribute('aria-label', 'Installer et notifications'); feuille.setAttribute('data-kdmc-installer', 'feuille');
      var tete = el('div', 'display:flex;align-items:center;justify-content:space-between;margin:0 0 12px');
      var dejaInst = INSTALLEE || installeeMaintenant;
      tete.appendChild(el('div', 'font:700 19px/1.2 -apple-system,sans-serif;color:' + OR, dejaInst ? '🔔 Notifications' : '📲 Sur ton téléphone'));
      var x = el('button', 'min-width:44px;min-height:44px;border:0;background:transparent;color:' + TEXTE + ';font-size:22px;cursor:pointer', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = fermer; tete.appendChild(x);
      feuille.appendChild(tete);
      var msg = el('div', 'font:14px/1.45 -apple-system,sans-serif;color:#f6d97a;min-height:20px;margin:0 0 8px', '');
      var aideInst = (differe ? "Un toucher, tu acceptes, et elle arrive sur ton écran d'accueil." : (IOS ? "Sur iPhone, Apple demande 3 gestes : je te les montre." : "Ouvre le menu du navigateur puis « Installer l'application »."));
      if (!dejaInst) feuille.appendChild(ligne("Installer l'application", aideInst, "📲 Installer sur l'écran d'accueil", function () {
        installer().then(function (r) {
          if (r.ok) { ouvrir(); if (feuille && feuille.lastChild) feuille.lastChild.textContent = '✅ Installée. Ouvre-la depuis ton écran d\'accueil, puis active les notifications.'; }
          else if (r.raison === 'ios_guide') guideIOS();
          else if (r.raison === 'dismissed') msg.textContent = "Pas d'installation pour l'instant : tu peux revenir ici quand tu veux.";
          else msg.textContent = IOS ? '' : "Ton navigateur n'a pas proposé l'installation : ouvre son menu ⋮ puis « Installer l'application ».";
        });
      }, false));
      if (IOS && !INSTALLEE && !installeeMaintenant && !PROPRES_NOTIFS) {
        feuille.appendChild(ligne('Notifications', "Sur iPhone, d'abord installer l'application (étape au-dessus), puis l'ouvrir depuis l'écran d'accueil : le bouton d'activation apparaîtra tout seul.", "🔔 Après l'installation", function () {}, true));
      } else if (PUSH_OK) {
        var etat = etatNotifs();
        var aideN = etat === 'granted' ? 'Autorisées : tu reçois messages, appels et alertes, même application fermée et écran éteint.'
          : etat === 'denied' ? "Bloquées par ton navigateur : ouvre les réglages du site (le cadenas près de l'adresse) et passe « Notifications » sur Autoriser."
          : (IOS && !INSTALLEE ? "Sur iPhone, d'abord installer l'application (étape au-dessus), puis revenir ici." : "Un toucher, tu acceptes : messages, appels et alertes arrivent même application fermée, écran éteint.");
        feuille.appendChild(ligne('Notifications', aideN, etat === 'granted' ? '✅ Activées' : '🔔 Activer les notifications', function () {
          msg.textContent = '…';
          activerNotifs().then(function (r) {
            if (r.ok) { msg.textContent = '✅ Notifications activées.'; ouvrir(); }
            else msg.textContent = { refusee: 'Refusées : réglages du site pour les autoriser.', ignoree: "Tu n'as pas répondu : touche de nouveau le bouton.", ios_installer_d_abord: "Installe d'abord l'application sur l'écran d'accueil.", connexion_requise: "Connecte-toi d'abord (portail kd-mc.com), puis réessaie.", service_notifs_absent: 'Service de notifications indisponible : réessaie plus tard.', non_supporte: "Ce navigateur ne sait pas recevoir de notifications." }[r.raison] || ('Impossible pour le moment (' + (r.detail || r.raison) + ').');
          });
        }, etat === 'granted'));
        if (etat === 'granted') {
          var t = el('button', 'width:100%;min-height:44px;border-radius:12px;border:1px solid #2a3a22;background:transparent;color:' + TEXTE + ';font:600 15px/1 -apple-system,sans-serif;margin:0 0 12px;cursor:pointer', '🔔 Envoie-moi une notification de test'); t.type = 'button';
          t.onclick = function () { msg.textContent = '…'; abonne().then(function (ok) { return ok ? api('/__push/test', {}) : activerNotifs().then(function (r) { return r.ok ? api('/__push/test', {}) : { ok: false, reason: r.raison }; }); }).then(function (r) { msg.textContent = r && r.ok ? '✅ Envoyée : elle arrive dans quelques secondes (même écran éteint).' : 'Pas envoyée (' + ((r && (r.reason || r.raison)) || 'erreur') + ').'; }); };
          feuille.appendChild(t);
        }
      } else if (PROPRES_NOTIFS) {
        feuille.appendChild(el('div', 'font:14px/1.45 -apple-system,sans-serif;color:#cfd8cc;margin:0 0 12px', "Les notifications d'Apex Chat se règlent dans l'application (Réglages)."));
      }
      feuille.appendChild(msg);
      document.body.appendChild(fond); document.body.appendChild(feuille);
    }
    function guideIOS() {
      if (!feuille) ouvrir();
      var g = el('div', 'background:#16210f;border:1px solid ' + OR + ';border-radius:14px;padding:14px;margin:0 0 12px;font:15px/1.5 -apple-system,sans-serif');
      if (!SAFARI) {
        g.innerHTML = '<b style="color:' + OR + '">Ouvre cette page dans Safari</b><br>Sur iPhone, seule l\'application Safari peut poser une app sur l\'écran d\'accueil. Copie l\'adresse, ouvre Safari, colle-la, puis reviens ici.';
        var cp = el('button', 'width:100%;min-height:48px;border-radius:12px;border:0;background:' + OR + ';color:' + NOIR + ';font:700 16px/1 -apple-system,sans-serif;margin:10px 0 0', "Copier l'adresse"); cp.type = 'button';
        cp.onclick = function () { try { navigator.clipboard.writeText(location.href.split('#')[0]); cp.textContent = '✅ Adresse copiée'; } catch (e) { cp.textContent = location.href; } };
        g.appendChild(cp);
      } else {
        g.innerHTML = '<b style="color:' + OR + '">3 gestes, 10 secondes</b><ol style="margin:8px 0 0;padding-left:20px">'
          + '<li style="margin:0 0 8px">Touche le bouton <b>Partager</b> <span style="display:inline-block;border:1.5px solid ' + TEXTE + ';border-radius:6px;padding:0 6px;font-size:16px">⬆︎</span> en bas de Safari.</li>'
          + '<li style="margin:0 0 8px">Fais défiler et touche <b>« Sur l\'écran d\'accueil »</b>.</li>'
          + '<li>Touche <b>Ajouter</b> en haut à droite. Ouvre ensuite l\'app depuis ton écran d\'accueil : tu pourras activer les notifications.</li></ol>'
          + '<div style="text-align:center;font-size:28px;margin-top:8px" aria-hidden="true">⬇︎</div>';
      }
      feuille.insertBefore(g, feuille.children[1]);
    }
    /* 22.10 (Kevin : « le mieux, c'est de le proposer à l'inscription, à tous les comptes ») : dès qu'une personne est connectée (nouveau compte ou première connexion sur cet appareil)
       et que l'app n'est pas installée, la feuille « 📲 Installer » s'ouvre d'elle-même, UNE fois par compte et par appareil. Compte pas encore créé : on surveille quelques minutes. */
    function proposerALInscription() {
      if (INSTALLEE || installeeMaintenant || DEJA) return;
      var essais = 0;
      function verifier() {
        if (INSTALLEE || installeeMaintenant || DEJA || feuille) return;
        essais++;
        try {
          fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
            if (j && j.ok && j.uid) {
              var cle = 'kdmc_inst_inscr_' + String(j.uid).slice(0, 40);
              if (lire(cle)) return;
              /* l'app est peut-être déjà sur cet appareil (iPhone : seul le domaine le sait) : on demande AVANT d'ouvrir la feuille */
              api('/__push/installee?appareil=' + encodeURIComponent(appareil())).then(function (r) { return r; }, function () { return null; }).then(function (r) {
                if (r && r.ok && r.installee) { marquerDeja(); return; }
                ecrire(cle, String(Date.now()));
                setTimeout(function () { if (!feuille && !(INSTALLEE || installeeMaintenant || DEJA)) ouvrir(); }, 1500);
              });
              return;
            } else if (essais < 24) setTimeout(verifier, 10000);
          }).catch(function () { /* silencieux */ });
        } catch (e) { /* silencieux */ }
      }
      setTimeout(verifier, 2500);
    }
    /* 6. Démarrage : préparer, puis montrer la pastille ; première ouverture de l'app INSTALLÉE : proposer les notifications (une fois par jour) */
    function demarrer() {
      preparer();
      if (INSTALLEE) signalerInstallee();
      if (INSTALLEE || DEJA) masquerBoutonsDesApps();
      majPastille();
      demanderSiInstallee();
      proposerALInscription();
      if (INSTALLEE && PUSH_OK && etatNotifs() === 'default') {
        var dernier = +lire('kdmc_notifs_propose') || 0;
        if (Date.now() - dernier > 86400000) { ecrire('kdmc_notifs_propose', String(Date.now())); setTimeout(ouvrir, 1200); }
      }
      /* déjà autorisée : s'assurer que l'abonnement est bien enregistré au domaine (appareil changé, abonnement expiré) */
      if (PUSH_OK && etatNotifs() === 'granted' && Date.now() - (+lire('kdmc_notifs_ok') || 0) > 6 * 86400000) { activerNotifs(); }
    }
    window.kdmcInstaller = { ouvrir: ouvrir, installer: installer, activerNotifs: activerNotifs, etat: function () { return { ios: IOS, safari: SAFARI, android: ANDROID, installee: INSTALLEE || installeeMaintenant, dejaSurAppareil: DEJA, appareil: appareil(), installable: !!differe, notifs: etatNotifs(), push: PUSH_OK }; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
  } catch (e) { /* jamais d'erreur dans la page de quelqu'un */ }
})();`;
