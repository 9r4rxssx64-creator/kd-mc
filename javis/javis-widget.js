/* javis-widget.js — Bee, le personnage de Lingua, en assistant flottant partout.
 * ==========================================================================
 * Kevin (2026-09-16) : « Un bouton flottant avec le personnage, cliquable, seulement
 * pour moi quand j'ouvre le domaine. Il connaît tout, tourne sur Apex en gratuit
 * d'abord, peut m'ouvrir des liens. De vraies mimiques. »
 * Puis : « Bee, le personnage qu'on a créé pour apprendre les langues — Lingua. »
 *
 * ── LE PERSONNAGE : Bee, PAS un nouveau dessin ──────────────────────────────
 * On réutilise LA marionnette de Lingua, pas une copie : mêmes images
 * (`lingua.kd-mc.com/bee/v2/rig/`), mêmes classes (`bee-rig`, `rig-base`,
 * `rig-lid`, `disc-mouth`), même géométrie mesurée sur son dessin (position des
 * paupières et de la bouche en %). Si l'art de Bee évolue dans Lingua, Javis suit
 * tout seul — aucune image dupliquée à re-synchroniser (leçon #142 : deux copies
 * d'une même vérité divergent toujours).
 * Le CSS/JS ci-dessous est un PORT FIDÈLE de lingua/index.html + lingua/app.js
 * (mascotAlive) : respiration, clignement naturel, regard qui te suit, sommeil
 * avec « z », réaction au toucher, bouche qui parle, ailes qui battent plus vite
 * quand elle parle.
 *
 * ── Le reste ────────────────────────────────────────────────────────────────
 *  1. `/__sso/whoami` : le bouton n'apparaît QUE pour Kevin (admin + Face ID
 *     prouvé) — même pattern éprouvé que tools/departs/_depSsoAutoAdmin.
 *     Fail-CLOSED sur la visibilité, fail-OPEN sur le réseau (SSO muet = pas de
 *     bouton, page intacte).
 *  2. Le chat parle au DOMAINE, à la même adresse : `/__javis/ai`, servi par le routeur et
 *     réservé à Kevin (Face ID ou code, vérifié par le domaine). Le caractère de Bee y est fixé
 *     côté serveur. Qwen gratuit d'abord, bascule vers l'IA la plus adaptée selon la question.
 *  3. Bee PARLE sa réponse : sa voix est un fichier audio fabriqué par le domaine
 *     (/__lingua/tts?gratuit=1 — Google Chirp gratuit, puis la voix gratuite de Cloudflare, JAMAIS
 *     une voix payante : Kevin 02.10 « gratuit tjs »), et la voix du téléphone en repli. Sa bouche suit le son réel. Un bouton « Voix » la coupe.
 *  4. Intentions locales (ouvrir une app du domaine, météo) exécutées directement dans le
 *     navigateur, avec un vrai bouton « Ouvrir » dans la bulle. Une ACTION sur tes données
 *     part vers Apex (apex-ai.kd-mc.com) : la phrase est copiée, à coller là-bas — un script
 *     public ne détient jamais de secret d'écriture.
 *
 * ── À ajouter sur une page ──────────────────────────────────────────────────
 *   <script src="javis-widget.js" defer></script>
 *   + CSP : `img-src` ET `media-src` doivent inclure https://lingua.kd-mc.com (dessin, vidéo)
 *           `media-src` doit inclure blob: (la voix est téléchargée puis jouée depuis la mémoire, 3.10)
 *           `connect-src` doit inclure 'self' https://api.open-meteo.com
 *   (sinon échec silencieux : piège CSP⇄fetch déjà documenté dans CLAUDE.md)
 */
(function () {
  'use strict';

  /* SA VERSION DOIT ETRE LISIBLE DE DEHORS (Kevin 2026-09-17 « va plus loin »).
     Tout ce fichier vit dans une IIFE : sans cette ligne, rien ne permet de savoir
     QUELLE Bee est reellement servie -- donc impossible de prouver qu'une mise en
     ligne est passee. C'est exactement le defaut que j'ai mesure sur Lingua le meme
     jour (message m085 aux autres sessions) : je me l'applique a moi-meme.
     Une ligne, aucun effet visible. L'audit LIVE du domaine la lit tout seul. */
  var JAVIS_VER = 'v1.18';
  try { window.JAVIS_VER = JAVIS_VER; } catch (e) {}
  /* d'où ce fichier vient : la mise à jour relit CETTE adresse pour savoir quelle Bee est servie (document.currentScript
     n'existe qu'au chargement du fichier, pas plus tard) */
  var SCRIPT_SRC = '';
  try { SCRIPT_SRC = (document.currentScript && document.currentScript.src) || (document.querySelector('script[src*="javis-widget.js"]') || {}).src || ''; } catch (e) {}

  if (window.__javisWidgetLoaded) return;
  window.__javisWidgetLoaded = true;

  /* LE CERVEAU DE BEE est servi par le DOMAINE, à la même adresse que la page, et SEULEMENT
     pour Kevin (audit Bee 27.09). Avant : la passerelle IA publique du domaine, que n'importe qui pouvait faire
     payer en écrivant lui-même l'en-tête Origin, et qui JETAIT le caractère de Bee. Le caractère
     (« ne prétends jamais avoir agi, n'invente jamais ») est maintenant fixé côté serveur. */
  var AI_ENDPOINT = '/__javis/ai';
  /* LE CHOIX DU PERSONNAGE (Kevin 2026-09-17 : « integre l'ane de Lingua, avoir le choix »).
     Les DEUX personnages existent DEJA dans Lingua -- dessins ET videos. On les reutilise
     tels quels : aucun fichier duplique (lecon #142). Si leur dessin evolue chez Lingua,
     Javis suit tout seul.
     UN SEUL point de verite ici, comme MASCOTS dans lingua/app.js : dossier des images,
     dossier des clips, prenom, genre, et les PIECES articulees.
     ⚠ L'ANE N'A PAS D'AILES : ses `pieces` sont vides. Les lui ajouter chargerait deux
       images inexistantes -- un 404 silencieux a chaque affichage (constate dans Lingua,
       c'est pour ca que RIG_PIECES existe la-bas).
     ⚠ Bee : ses IMAGES sont dans `bee/v2/` (le dessin « vive » choisi par Kevin) mais ses
       CLIPS sont dans `bee/` : deux dossiers differents, d'ou les deux champs.
     Les VIDEOS ne sont chargees QUE dans l'app dediee (plein ecran) : sur une page normale
     le bouton flottant reste la marionnette CSS, qui ne coute rien en donnees mobiles. */
  var LINGUA = 'https://lingua.kd-mc.com/';
  var MASCOTTES = [
    { id: 'bee', rig: 'bee/v2', live: 'bee', nom: 'Bee', titre: "Bee l'abeille",
      emoji: '\uD83D\uDC1D', pieces: ['wing-l', 'wing-r'], gen: 'f', voix: 'nova', hauteur: 1.35 },
    { id: 'donkey', rig: 'donkey', live: 'donkey', nom: 'Bourricot', titre: "Bourricot l'\u00e2ne",
      emoji: '\uD83E\uDECF', pieces: [], gen: 'm', voix: 'onyx', hauteur: 0.8 }
  ];
  var CLIPS = ['idle', 'hello', 'dance', 'jump', 'fly', 'walk'];
  var MASC_CLE = 'javis_mascotte';
  function mascCfg() {
    var id = 'bee';
    try { var v = localStorage.getItem(MASC_CLE); if (v) id = v; } catch (e) {}
    /* le choix suit Kevin d'une app à l'autre : un cookie du domaine (sans secret) en plus du stockage de cette adresse */
    if (id === 'bee') { try { var mc = /(?:^|;\s*)kdmc_masc=(donkey|bee)(?:;|$)/.exec(document.cookie || ''); if (mc) id = mc[1]; } catch (e) {} }
    for (var i = 0; i < MASCOTTES.length; i++) { if (MASCOTTES[i].id === id) return MASCOTTES[i]; }
    return MASCOTTES[0];                       /* valeur inconnue -> on retombe sur Bee */
  }
  function rigBase(m) { return LINGUA + (m || mascCfg()).rig + '/rig/'; }
  function liveBase(m) { return LINGUA + (m || mascCfg()).live + '/live/'; }
  /* Accord en genre, comme dans Lingua : Bee est une abeille, Bourricot un ane.
     Sans ca on lit « Bourricot est prete » -- faux et moche. */
  function MG(f, m) { return mascCfg().gen === 'm' ? m : f; }
  /* Sa VRAIE voix + le vrai lip-sync : le domaine sait deja fabriquer la parole
     (routeur kd-mc.com, /__lingua/tts, cache a vie, CORS limite aux pages du domaine, fail-open). Un fichier
     audio, c'est un SON QU'ON PEUT ANALYSER : la bouche s'ouvre sur l'amplitude reelle.
     La voix du telephone (Web Speech) reste le repli : elle parle mais ne s'analyse pas. */
  var BEE_TTS = 'https://lingua.kd-mc.com/__lingua/tts';
  /* Sur le domaine, la voix est demandée À SA PROPRE ADRESSE (/__lingua/tts répond sur chaque *.kd-mc.com,
     mesuré 3.10 sur javis et arbre) : même origine → pas de CORS, et la page peut LIRE le son (fetch) pour
     faire bouger la bouche sans le faire passer par le moteur audio (voir speak). */
  function adresseVoix() {
    try { if (/(^|\.)kd-mc\.com$/.test(location.hostname)) return '/__lingua/tts'; } catch (_) {}
    return BEE_TTS;
  }
  /* VOIX RÉELLEMENT DIFFÉRENTES (règle Kevin 18.05) : Bee parle avec nova (sa voix dans Lingua),
     Bourricot avec onyx (voix d'homme) — avant, l'âne parlait avec la voix de l'abeille. */
  function voixDe(m) { return (m || mascCfg()).voix || 'nova'; }
  var STORAGE_HIST = 'javis_widget_history';
  var STORAGE_VOICE = 'javis_widget_voice_on';
  var MAX_HISTORY = 40;

  /* ============================================================
     0. Qui es-tu ? (SSO domaine — même pattern que tools/departs)
     ============================================================ */
  /* « Dis Siri, demande à Bee… » : un raccourci iPhone ouvre javis.kd-mc.com/?q=<ta phrase> (audit externe
     02.10 : rien ne permettait d'appeler Bee depuis Siri). Lue UNE fois, effacée tout de suite de l'adresse
     (ni historique, ni rechargement qui la reposerait), et posée seulement dans l'app, une fois Kevin
     reconnu par le domaine — sinon jetée. Bee n'agit sur rien : au pire, un lien piégé lui pose une question. */
  var QUESTION_ADRESSE = (function () {
    try {
      if (window.JAVIS_MODE !== 'app' || !/[?&]q=/.test(location.search)) return '';
      var p = new URLSearchParams(location.search), q = String(p.get('q') || '').trim().slice(0, 500);
      p.delete('q');
      var reste = p.toString();
      try { history.replaceState(null, '', location.pathname + (reste ? '?' + reste : '') + location.hash); } catch (_) {}
      return q;
    } catch (_) { return ''; }
  })();
  /* Un laissez-passer arrivé par l'adresse (#kdmc_sso=) n'ÉCRASE plus celui déjà rangé
     (audit Bee 27.09, mesuré : un lien piégé portant le jeton d'un AUTRE compte enfermait
     Kevin sur « Bee est personnelle à Kevin », sans aucun bouton, même après rechargement).
     Il est d'abord ESSAYÉ ; il n'est rangé que s'il ouvre Bee, ou s'il n'y avait rien avant. */
  function ssoCandidat() {
    try {
      var m = (location.hash || '').match(/[#&]kdmc_sso=([^&]+)/);
      if (!m) return '';
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
      return decodeURIComponent(m[1]);
    } catch (_) { return ''; }
  }
  function ssoToken() {
    try { return localStorage.getItem('kdmc_sso_token') || ''; } catch (_) { return ''; }
  }
  function uidDuJeton(t) {
    try { var p = String(t || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '=';
      return (JSON.parse(decodeURIComponent(escape(atob(p)))) || {}).u || ''; } catch (_) { return ''; }
  }
  function rangeJeton(t) { try { if (t) localStorage.setItem('kdmc_sso_token', t); } catch (_) {} }

  function checkAdmin(cb) {
    /* Un /__sso/whoami qui ECHOUE est deja traite (fail-CLOSED). Mais un whoami qui
       PEND -- ni reponse ni erreur, reseau qui traine -- ne rappelait JAMAIS cb :
       en mode app, l'ecran « Bee arrive... » est retire a load+900 ms, donc on
       obtenait un ecran noir SANS explication. Au bout de 4 s on tranche comme un
       refus : meme chemin que le refus rapide, donc meme message. */
    var fini = false;
    /* La RAISON accompagne le verdict (Kevin 26.09, capture iPhone : « Impossible de me
       connecter » devant un cadenas sans bouton). Le verdict ne change pas — fail-closed —
       mais l'écran doit dire LAQUELLE des trois situations c'est, et offrir la sortie. */
    var fin = function (ok, raison) { if (!fini) { fini = true; cb(ok, raison || (ok ? 'ok' : 'inconnu')); } };
    try {
      var cand = ssoCandidat(), ancien = ssoToken();
      /* le nouveau d'abord, l'ancien ensuite : le premier qui ouvre Bee gagne */
      /* sans rien de rangé, on essaie AUSSI « sans jeton » (la session par cookie, Safari) : un lien
         piégé ne doit pas remplacer Kevin reconnu par son cookie (contre-audit 27.09) */
      var essais = (cand && cand !== ancien) ? [cand, ancien] : [ancien];
      var ctrl = null;
      try { ctrl = new AbortController(); } catch (_) {}
      var minuteur = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (_) {}
        fin(false, 'muet');
      }, 4000);
      var premiere = null;
      var essai = function (n) {
        var tok = essais[n];
        var hdr = {};
        if (tok) hdr.Authorization = 'Bearer ' + tok;
        var opts = { credentials: 'include', cache: 'no-store', headers: hdr };
        if (ctrl) opts.signal = ctrl.signal;
        fetch('/__sso/whoami', opts)
          .then(function (r) { return r && r.ok ? r.json() : null; })
          .then(function (j) {
            var raison = (j && j.ok && j.verified === true && j.admin === true) ? 'ok'
              : !j ? 'panne'                                   /* le domaine a répondu une erreur */
                : !j.ok ? 'inconnu'                            /* pas de session ICI */
                  : j.verified !== true ? 'sans-faceid'        /* connecté, mais pas prouvé */
                    : 'pas-kevin';                             /* prouvé, mais pas l'admin */
            /* 8.10 : le domaine fait gagner la session PROUVÉE du cookie sur un jeton faible présenté (« la session prouvée gagne ») —
               un lien piégé portant le jeton d'un AUTRE compte répondait donc « ok » (c'était Kevin, par son cookie) et ce jeton
               était rangé à la place du sien. On ne range le nouveau que s'il est bien CELUI du compte reconnu. */
            if (raison === 'ok') { clearTimeout(minuteur); if (tok === cand && uidDuJeton(cand) === j.uid) rangeJeton(cand); return fin(true, 'ok'); }
            if (premiere === null) premiere = raison;
            if (n + 1 < essais.length) return essai(n + 1);
            clearTimeout(minuteur);
            if (cand && !ancien) rangeJeton(cand);             /* rien avant : on garde le nouveau */
            fin(false, premiere);
          })
          .catch(function () { clearTimeout(minuteur); fin(false, 'muet'); });
      };
      essai(0);
    } catch (_) { fin(false, 'muet'); }
  }

  /* ============================================================
     1. Bee — la MÊME marionnette que dans Lingua (beeRigHTML)
     ============================================================ */
  /* LE CHOIX, A UN DOIGT (Kevin : « avoir le choix des personnages »). Deux pastilles dans
     l'en-tete : on tape, le personnage change PARTOUT tout de suite (bouton flottant, mini
     portrait, video) et le choix est retenu pour les prochaines fois. Cibles de 44 px comme
     partout ailleurs sur le domaine (regle iPhone). */
  function boutonsMascottes() {
    var id = mascCfg().id, h = '';
    for (var i = 0; i < MASCOTTES.length; i++) {
      var M = MASCOTTES[i];
      h += '<button type="button" class="javis-mpick' + (M.id === id ? ' on' : '') +
           '" data-masc="' + M.id + '" title="' + M.titre + '" aria-label="' + M.titre +
           '" aria-pressed="' + (M.id === id ? 'true' : 'false') + '">' + M.emoji + '</button>';
    }
    return h;
  }

  /* Une pièce du dessin qui ne charge pas est retirée (au lieu d'une icône cassée). Écouteur en
     phase de CAPTURE (« error » ne remonte pas) : plus de gestionnaire écrit dans le HTML, que la CSP
     sans 'unsafe-inline' de l'app bloquerait. */
  try {
    document.addEventListener('error', function (e) {
      var t = e && e.target;
      if (t && t.classList && t.classList.contains('rig-piece') && t.parentNode) t.parentNode.removeChild(t);
      /* Le dessin demandé « en CORS » refusé (en-tête absent un jour) : on le redemande normalement —
         il s'affiche comme avant, simplement sans la marionnette. Jamais un personnage invisible. */
      else if (t && t.classList && t.classList.contains('rig-base') && t.getAttribute('crossorigin') !== null) {
        t.removeAttribute('crossorigin'); var u = t.src; t.src = ''; t.src = u;
      }
    }, true);
  } catch (_) {}

  function buildBeeRig(avecVideo) {
    var M = mascCfg(), B = rigBase(M), ailes = '';
    for (var i = 0; i < M.pieces.length; i++) {
      ailes += '<img class="rig-piece rig-' + (M.pieces[i] === 'wing-l' ? 'wl' : 'wr') + '" src="' +
               B + M.pieces[i] + '.webp" alt="">';   /* image absente → retirée (écouteur plus bas, sans code en ligne : CSP) */
    }
    return (
      '<div class="bee-rig" data-mascot="' + M.id + '"' + (M.id === 'bee' ? ' data-art="vive"' : '') + '>' +
      '<div class="rig-look">' +
      /* crossorigin : la marionnette (fin de fichier) peut alors poser CETTE image sur son maillage,
         sans la retélécharger (lingua.kd-mc.com répond Access-Control-Allow-Origin: *). */
      '<img class="rig-base" crossorigin="anonymous" src="' + B + 'base.webp" alt="' + M.nom + '">' +
      ailes +
      '<div class="rig-lid ll"></div><div class="rig-lid lr"></div>' +
      '<div class="disc-mouth"></div>' +
      '<div class="rig-zzz">z</div>' +
      '</div>' +
      (avecVideo ? '<video class="javis-vid" src="' + liveBase(M) + 'idle.mp4" autoplay loop muted playsinline preload="auto"></video>' : '') +
      '</div>'
    );
  }

  /* ============================================================
     2. Styles — port fidèle du rig Lingua + habillage du widget
     ============================================================ */
  function injectStyles() {
    var css =
      /* ---- le rig Bee (copié de lingua/index.html, mêmes valeurs mesurées) ---- */
      '.bee-rig{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;background:#fdf7e7}' +
      '.rig-look{position:absolute;inset:0;transform:translate(var(--lx,0),var(--ly,0)) rotate(var(--lr,0deg));transition:transform .28s cubic-bezier(.22,1,.36,1)}' +
      '.rig-base,.rig-piece{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}' +
      '.bee-rig.vivant .rig-base{animation:javis-respire 3.8s ease-in-out infinite;transform-origin:50% 88%}' +
      '@keyframes javis-respire{0%,100%{transform:scale(1,1)}50%{transform:scale(1.018,.986)}}' +
      '.rig-wl{transform-origin:34% 46%;animation:javis-wingL 1.15s ease-in-out infinite}' +
      '.rig-wr{transform-origin:66% 44%;animation:javis-wingR 1.15s ease-in-out infinite}' +
      '@keyframes javis-wingL{0%,100%{transform:rotate(0)}50%{transform:rotate(-6deg)}}' +
      '@keyframes javis-wingR{0%,100%{transform:rotate(0)}50%{transform:rotate(6deg)}}' +
      '.bee-rig.talk .rig-wl{animation:javis-wingL .32s ease-in-out infinite}' +
      '.bee-rig.talk .rig-wr{animation:javis-wingR .32s ease-in-out infinite}' +
      /* paupières et bouche : géométrie MESURÉE sur le dessin de Bee (v2 "vive") */
      '.bee-rig[data-mascot="bee"]{--lid:rgb(252,185,51);' +
      '--ll-l:28.1%;--ll-t:29.6%;--ll-w:15.5%;--ll-h:15.0%;' +
      '--lr-l:56.3%;--lr-t:29.7%;--lr-w:15.5%;--lr-h:15.5%;' +
      '--mo-l:49.8%;--mo-t:48.8%}' +
      /* Le dessin « vive » (bee/v2, celui que Bee porte ici) n'a PAS ses yeux et sa bouche au même
         endroit que le « doux » : valeurs MESURÉES dans lingua/index.html (audit Bee 27.09 : la
         bouche qui parle tombait sur le col, les paupières sur les joues). Garde de parité :
         test:javis-bee compare ces valeurs à celles de Lingua. */
      '.bee-rig[data-mascot="bee"][data-art="vive"]{--lid:rgb(253,225,87);' +
      '--ll-l:32.2%;--ll-t:27.4%;--ll-w:18.2%;--ll-h:15.0%;' +
      '--lr-l:51.3%;--lr-t:27.2%;--lr-w:17.4%;--lr-h:15.2%;' +
      '--mo-l:51%;--mo-t:43.6%}' +
      /* L'ANE : geometrie MESUREE sur SON dessin dans lingua/index.html, recopiee a
         l'identique. Ses yeux sont plus petits et plus bas que ceux de Bee, sa bouche
         plus bas encore : reutiliser les valeurs de l'abeille lui mettrait les
         paupieres sur le front. */
      '.bee-rig[data-mascot="donkey"]{--lid:rgb(231,160,64);' +
      '--ll-l:34.3%;--ll-t:39.3%;--ll-w:7.5%;--ll-h:9.5%;' +
      '--lr-l:54.0%;--lr-t:38.6%;--lr-w:8.0%;--lr-h:10.5%;' +
      '--mo-l:48.6%;--mo-t:58.6%}' +
      '.rig-lid{position:absolute;background:var(--lid,rgb(253,225,87));border:0;border-radius:46%;opacity:0;pointer-events:none;transition:opacity .05s}' +
      '.rig-lid.ll{left:var(--ll-l);top:var(--ll-t);width:var(--ll-w);height:var(--ll-h)}' +
      '.rig-lid.lr{left:var(--lr-l);top:var(--lr-t);width:var(--lr-w);height:var(--lr-h)}' +
      '.bee-rig.blink .rig-lid{opacity:1}' +
      '.disc-mouth{position:absolute;left:var(--mo-l,52.4%);top:var(--mo-t,42.6%);width:6.6%;height:5.2%;' +
      'transform:translate(-50%,-50%) scale(1);border-radius:42% 42% 50% 50%/36% 36% 64% 64%;' +
      'background:radial-gradient(60% 55% at 50% 66%,#ff5d6c 0%,#8a3018 60%,#53200f 100%);' +
      'border:2px solid #3a1c10;opacity:0;pointer-events:none}' +
      '.disc-mouth.talking{opacity:1;animation:javis-mouth .27s ease-in-out infinite alternate}' +
      '@keyframes javis-mouth{0%{transform:translate(-50%,-50%) scale(1.02,.96)}100%{transform:translate(-50%,-50%) scale(1.38,1.52)}}' +
      /* sommeil + réactions */
      '.bee-rig.dort .rig-lid{opacity:1}' +
      '.bee-rig.dort .rig-base{animation:javis-respire 6.5s ease-in-out infinite}' +
      '.bee-rig.dort .rig-piece{animation:none!important}' +
      '.rig-zzz{position:absolute;left:64%;top:16%;font-size:15%;font-weight:900;color:#cfe0ee;opacity:0;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.5)}' +
      '.bee-rig.dort .rig-zzz{animation:javis-zzz 2.6s ease-out infinite}' +
      /* ---- VRAIE VIDÉO (mode app) : elle recouvre la marionnette QUAND ELLE EST LUE.
         Tant que la vidéo n'a pas dit 'canplay', la classe .vid n'est pas posée et on voit
         la marionnette : jamais de trou noir si le réseau ou le codec lâche. ---- */
      '.javis-vid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;border-radius:inherit}' +
      '.bee-rig.vid .javis-vid{display:block}' +
      '.bee-rig.vid .rig-piece,.bee-rig.vid .rig-lid,.bee-rig.vid .disc-mouth{display:none!important}' +
      '.bee-rig.vid.talk{animation:javis-parle .5s ease-in-out infinite}' +
      '@keyframes javis-parle{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2%) scale(1.012)}}' +
      '@keyframes javis-zzz{0%{opacity:0;transform:translate(0,0) scale(.6)}25%{opacity:.95}100%{opacity:0;transform:translate(38%,-52%) scale(1.5)}}' +
      '.bee-rig.rx-poke .rig-look{animation:javis-poke .9s cubic-bezier(.34,1.56,.64,1)}' +
      '@keyframes javis-poke{0%{transform:scale(1,1)}22%{transform:scale(1.1,.88) translateY(3%)}55%{transform:scale(.94,1.09) translateY(-4%)}100%{transform:scale(1,1)}}' +
      '.bee-rig.rx-joie .rig-look{animation:javis-joie 1.5s ease-in-out}' +
      '@keyframes javis-joie{0%,100%{transform:translateY(0) rotate(0)}20%{transform:translateY(-6%) rotate(-8deg)}45%{transform:translateY(0) rotate(6deg)}70%{transform:translateY(-4%) rotate(-4deg)}}' +
      '.bee-rig.rx-reflechit .rig-look{animation:javis-pense 2s ease-in-out infinite}' +
      '@keyframes javis-pense{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}' +
      '.bee-rig.rx-coucou .rig-look{animation:javis-coucou 1.4s ease-in-out}' +
      '@keyframes javis-coucou{0%,100%{transform:rotate(0)}25%{transform:rotate(-9deg)}50%{transform:rotate(7deg)}75%{transform:rotate(-5deg)}}' +
      '@media (prefers-reduced-motion:reduce){.rig-look,.bee-rig.vivant .rig-base,.bee-rig.dort .rig-base,.rig-zzz,.rig-wl,.rig-wr,.disc-mouth.talking,.bee-rig.rx-poke .rig-look,.bee-rig.rx-joie .rig-look,.bee-rig.rx-reflechit .rig-look,.bee-rig.rx-coucou .rig-look{animation:none;transition:none}}' +
      /* mouvements du corps entier (portés de Lingua : danse, saut, vol, marche) */
      '.bee-rig.mv-dance{animation:javis-dance 1.05s ease-in-out infinite}' +
      '.bee-rig.mv-jump{animation:javis-jump .85s cubic-bezier(.36,.07,.19,.97) infinite}' +
      '.bee-rig.mv-fly{animation:javis-fly 3.6s ease-in-out infinite}' +
      '.bee-rig.mv-walk{animation:javis-walk .8s ease-in-out infinite}' +
      '.bee-rig.mv-dance .rig-wl,.bee-rig.mv-fly .rig-wl{animation:javis-wingL .3s ease-in-out infinite}' +
      '.bee-rig.mv-dance .rig-wr,.bee-rig.mv-fly .rig-wr{animation:javis-wingR .3s ease-in-out infinite}' +
      '@keyframes javis-dance{0%,100%{transform:rotate(0) translate(0,0)}20%{transform:rotate(-7deg) translate(-4%,-3%)}40%{transform:rotate(6deg) translate(4%,0)}60%{transform:rotate(-6deg) translate(-3%,-4%)}80%{transform:rotate(7deg) translate(3%,0)}}' +
      /* Saut : les 3 principes de l'animation classique — ANTICIPATION (elle se ramasse
         avant de partir), ÉTIREMENT en montant, ÉCRASEMENT à l'atterrissage, puis un petit
         rebond. Sans ça, un saut ressemble à un ascenseur. */
      '@keyframes javis-jump{0%,100%{transform:translateY(0) scale(1,1)}10%{transform:translateY(4%) scale(1.09,.88)}30%{transform:translateY(-7%) scale(.93,1.12)}48%{transform:translateY(-9%) scale(.97,1.04)}66%{transform:translateY(0) scale(1.12,.86)}80%{transform:translateY(-4%) scale(.98,1.03)}92%{transform:translateY(0) scale(1.02,.98)}}' +
      '@keyframes javis-fly{0%,100%{transform:translate(0,0) rotate(0)}12%{transform:translate(7%,-9%) rotate(5deg)}30%{transform:translate(13%,2%) rotate(-3deg)}50%{transform:translate(0,6%) rotate(0)}70%{transform:translate(-13%,-4%) rotate(4deg)}88%{transform:translate(-6%,-10%) rotate(-4deg)}}' +
      '@keyframes javis-walk{0%,100%{transform:translateY(0) rotate(-2.5deg)}25%{transform:translateY(-3%) rotate(0)}50%{transform:translateY(0) rotate(2.5deg)}75%{transform:translateY(-3%) rotate(0)}}' +
      /* Elle regarde AILLEURS quand elle cherche (comme quelqu'un qui réfléchit),
         et revient te regarder quand elle répond. */
      '.bee-rig.rx-reflechit .rig-look{--lx:-2.6%;--ly:-2.2%;--lr:-5deg}' +
      /* Elle sourit un peu plus quand elle est contente. */
      '.bee-rig.rx-joie .disc-mouth{transform:translate(-50%,-50%) scaleX(1.35) scaleY(1.15)}' +
      /* tristesse (réseau en panne) — portée de Lingua */
      '.bee-rig.rx-triste .rig-look{animation:javis-triste 1.6s ease-in-out}' +
      '@keyframes javis-triste{0%,100%{transform:rotate(0) translateY(0);filter:none}35%,70%{transform:rotate(-7deg) translateY(4%);filter:saturate(.7) brightness(.94)}}' +
      /* étincelles + bulle (portées de Lingua) */
      '.javis-spark{position:fixed;z-index:2147483002;pointer-events:none;font-size:16px;animation:javis-sparkFly .9s ease-out forwards}' +
      '@keyframes javis-sparkFly{0%{transform:translate(0,0) scale(.6);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1.25);opacity:0}}' +
      '.javis-bubble{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom) + 172px);z-index:2147483002;max-width:240px;' +
      'background:#241905;border:1px solid rgba(246,183,60,.6);border-radius:16px 16px 4px 16px;padding:10px 13px;' +
      'font:14px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;color:#f0e2bd;box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;' +
      'animation:javis-bubblePop .35s cubic-bezier(.34,1.56,.64,1)}' +
      '@keyframes javis-bubblePop{0%{transform:scale(.5) translateY(10px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}' +
      '.javis-bubble.bye{opacity:0;transform:translateY(8px);transition:all .4s}' +
      /* « elle écrit… » pendant qu'elle réfléchit */
      '.javis-typing{display:flex;gap:4px;align-self:flex-start;padding:10px 14px;background:#241905;border:1px solid rgba(246,183,60,.18);border-radius:14px;border-bottom-left-radius:4px}' +
      '.javis-typing i{width:7px;height:7px;border-radius:50%;background:#f6b73c;opacity:.4;animation:javis-dot 1.1s ease-in-out infinite}' +
      '.javis-typing i:nth-child(2){animation-delay:.18s}.javis-typing i:nth-child(3){animation-delay:.36s}' +
      '@keyframes javis-dot{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}' +
      '@media (prefers-reduced-motion:reduce){.javis-spark{display:none}.javis-bubble,.javis-typing i{animation:none}' +
      '#javis-launcher,body.javis-app #javis-launcher,.bee-rig[class*="mv-"],#javis-panel.javis-open,.disc-mouth,#javis-root.javis-ecoute #javis-launcher{animation:none!important}' +
      'body.javis-app #javis-launcher{transition:none}}' +
      /* ---- habillage du widget ---- */
      '#javis-launcher{position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom) + 96px);' +
      'z-index:2147483000;width:68px;height:68px;border:0;border-radius:50%;padding:0;cursor:pointer;' +
      'background:#fdf7e7;box-shadow:0 0 0 3px rgba(246,183,60,.55),0 10px 26px rgba(0,0,0,.4);' +
      'overflow:hidden;transition:transform .15s ease;-webkit-tap-highlight-color:transparent;' +
      'animation:javis-float 3.4s ease-in-out infinite}' +
      '@keyframes javis-float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-6px) rotate(1.5deg)}}' +
      '#javis-launcher:active{transform:scale(.93)}' +
      /* au repos (aucun geste depuis 20 s) : les animations infinies s'arrêtent — 0 image calculée */
      /* (#javis-root en plus : doit battre « body.javis-app #javis-launcher{animation:…} », dont le
         raccourci remet la lecture en marche) */
      'body.javis-repos #javis-root #javis-launcher,body.javis-repos #javis-root .rig-wl,body.javis-repos #javis-root .rig-wr,' +
      'body.javis-repos #javis-root .bee-rig.vivant .rig-base,body.javis-repos #javis-root .rig-zzz{animation-play-state:paused}' +
      /* quand la vraie vidéo joue, la respiration de l'image CACHÉE dessous ne sert à rien */
      '.bee-rig.vid .rig-base{animation:none}' +
      '#javis-panel{position:fixed;z-index:2147483001;right:12px;left:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);' +
      'max-width:420px;margin-left:auto;background:#171008;border:1px solid rgba(246,183,60,.3);border-radius:20px;' +
      'box-shadow:0 24px 60px rgba(0,0,0,.55);display:none;flex-direction:column;overflow:hidden;' +
      'max-height:min(72vh,620px);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '#javis-panel.javis-open{display:flex;animation:javis-pop .18s ease}' +
      /* LA CARTE DE CONFIRMATION d'une action (Kevin 4.10) : deux gros boutons de 44 px */
      '.javis-carte{margin:6px 0;padding:10px 12px;border-radius:14px;background:#241905;border:1px solid rgba(246,183,60,.5);color:#f3f0e6;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '.javis-carte.eleve{border-color:#dc2626;background:#2a0f0f}.javis-carte.fait{border-color:#4ade80}.javis-carte.clos{opacity:.85}' +
      '.javis-carte-t{font-weight:700;margin-bottom:4px}.javis-carte-r{margin-bottom:8px;word-break:break-word}' +
      '.javis-carte-b{display:flex;gap:8px}.javis-carte-b button{flex:1;min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer}' +
      '.javis-carte-ok{background:#f6b73c;color:#1a1204}.javis-carte-non{background:#3a2c14;color:#f3f0e6}.javis-carte-b button:disabled{opacity:.6;cursor:default}.javis-carte-f{font-size:13px}' +
      /* DANS LE CADRE d'une autre app (Bee partout) : le parent règle la taille du cadre ; la pastille est dans son coin, le chat remplit le cadre ouvert */
      'html.javis-cadre #javis-launcher{right:12px;bottom:12px}' +
      'html.javis-cadre #javis-panel{top:0;right:0;left:0;bottom:0;max-width:none;max-height:none;margin:0;border-radius:18px}' +
      'html.javis-cadre.javis-ouvert #javis-launcher{display:none}' +
      '@keyframes javis-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}' +
      '#javis-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,#241905,#171008);' +
      'border-bottom:1px solid rgba(246,183,60,.2)}' +
      '#javis-head .javis-mini{width:46px;height:46px;flex:0 0 auto;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px rgba(246,183,60,.45)}' +
      '#javis-head b{color:#f6b73c;font-size:15px}' +
      '#javis-head span{display:block;color:#d8c9a0;font-size:14px}' +
      '#javis-masc{margin-left:auto;display:flex;gap:6px}' +
      '.javis-mpick{width:44px;height:44px;border-radius:12px;border:2px solid transparent;background:rgba(246,183,60,.10);' +
      'font-size:20px;line-height:1;cursor:pointer;padding:0;color:inherit}' +
      '.javis-mpick.on{border-color:#f6b73c;background:rgba(246,183,60,.22)}' +
      '#javis-close{flex:0 0 44px;width:44px;height:44px;background:none;border:0;color:#d8c9a0;font-size:20px;line-height:1;padding:0;cursor:pointer}' +
      /* la barre d'outils : couper la voix, effacer la conversation, et la VERSION (règle Kevin :
         un badge de version visible dans chaque projet) */
      '#javis-outils{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid rgba(246,183,60,.12)}' +
      '#javis-outils button{min-height:44px;min-width:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(246,183,60,.28);' +
      'background:rgba(246,183,60,.08);color:#f0e2bd;font:600 14px/1 -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer}' +
      '#javis-outils button[aria-pressed="false"]{opacity:.75}' +
      '#javis-ver{margin-left:auto;color:#b8a57c;font-size:14px}' +
      /* une version plus récente est servie : le badge s'allume (Kevin 3.10 : « l'indicateur de version n'est pas cliquable pour mettre à jour ») */
      '#javis-outils #javis-ver.javis-ver-neuve{background:#f6b73c;border-color:#f6b73c;color:#1a1204}' +
      '.javis-lien{display:inline-flex;align-items:center;min-height:44px;margin-top:8px;padding:0 14px;border-radius:12px;' +
      'background:#f6b73c;color:#1a1204;font-weight:700;text-decoration:none}' +
      '#javis-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}' +
      '.javis-bub{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word}' +
      '.javis-bub.me{align-self:flex-end;background:#3a2c16;color:#f7efd9;border-bottom-right-radius:4px}' +
      '.javis-bub.js{align-self:flex-start;background:#241905;color:#f0e2bd;border:1px solid rgba(246,183,60,.18);border-bottom-left-radius:4px}' +
      '.javis-bub{font-size:15px}' +
      '#javis-form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(246,183,60,.2);background:#171008}' +
      '#javis-input{flex:1;background:#241905;border:1px solid rgba(246,183,60,.25);color:#f7efd9;border-radius:12px;' +
      'padding:10px 12px;font-size:16px;min-height:44px;resize:none;font-family:inherit}' +
      '#javis-input::placeholder{color:#b8a57c}' +
      '#javis-send,#javis-mic{flex:0 0 44px;height:44px;border-radius:12px;border:0;background:linear-gradient(135deg,#f6b73c,#ffd75e);' +
      'color:#241905;font-size:18px;font-weight:700;cursor:pointer}' +
      '#javis-mic.on{background:linear-gradient(135deg,#c8506a,#e2748f)}' +
      '@media (min-width:480px){#javis-panel{right:16px}}' +
      /* ---- MODE APP (javis/index.html) : plein écran, le personnage en grand ----
         Même fichier, même Bee, même chat : l'app installable n'est qu'une coquille
         qui pose window.JAVIS_MODE='app'. Zéro logique dupliquée (leçon #142). */
      'body.javis-app{margin:0;background:#0e0a04;overflow:hidden}' +
      /* HALO (02.10) : sa lumière suit sa voix (--bee-niveau, posé par lipSync) ; quand elle t'ÉCOUTE, un anneau
         doré respire autour d'elle (état « j'écoute » visible, comme Siri) */
      'body.javis-app #javis-launcher{box-shadow:0 0 calc(10px + 46px * var(--bee-niveau,0)) calc(1px + 12px * var(--bee-niveau,0)) rgba(246,183,60,calc(.18 + .62 * var(--bee-niveau,0)));transition:box-shadow .08s linear}' +
      '#javis-root.javis-ecoute #javis-launcher{animation:javis-ecoute 1.3s ease-in-out infinite!important}' +
      '@keyframes javis-ecoute{0%,100%{box-shadow:0 0 14px 3px rgba(246,183,60,.35)}50%{box-shadow:0 0 34px 12px rgba(246,183,60,.75)}}' +
      /* SUGGESTIONS (02.10) : l'écran n'est plus vide sous le bonjour, et Kevin n'a pas à taper */
      '.javis-chips{display:flex;flex-wrap:wrap;gap:8px;padding:2px 0 6px}' +
      '.javis-chips button{min-height:44px;padding:0 14px;border-radius:22px;border:1px solid rgba(246,183,60,.55);background:rgba(246,183,60,.08);' +
      'color:#f6c35c;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer}' +
      '.javis-chips button:active{transform:scale(.97)}' +
      /* dans l'app, la bulle du toucher sort de BEE (en haut, queue vers elle), plus en bas à droite où elle
         ressemblait à un message de Kevin (audit externe 02.10, capture 12-app-375-toucher-bee) */
      'body.javis-app .javis-bubble{right:16px;left:16px;bottom:auto;top:calc(env(safe-area-inset-top) + min(56vw,270px) + 6px);' +
      'margin:0 auto;width:max-content;max-width:calc(100vw - 32px);border-radius:4px 16px 16px 16px;text-align:center}' +
      'body.javis-app #javis-launcher{position:static;width:min(56vw,270px);height:min(56vw,270px);' +
      'margin:calc(env(safe-area-inset-top) + 18px) auto 8px;display:block;animation:javis-float 3.4s ease-in-out infinite}' +
      'body.javis-app #javis-root{display:flex;flex-direction:column;height:100dvh}' +
      'body.javis-app #javis-panel{position:static;display:flex;flex:1;max-width:none;max-height:none;' +
      'margin:0;border:0;border-radius:20px 20px 0 0;box-shadow:none;animation:none}' +
      'body.javis-app #javis-head .javis-mini{display:none}' +
      /* dans l'app, le panneau est TOUJOURS ouvert : la croix ne fermait rien (mesuré) → cachée */
      'body.javis-app #javis-close{display:none}' +
      /* iPhone À L'HORIZONTALE (audit complet 30.09, mesuré en 667×375 : l'abeille de 270 px poussait
         le bouton Envoyer à 501 px pour un écran de 375 — impossible d'écrire) : l'abeille rapetisse. */
      '@media (orientation:landscape) and (max-height:500px){body.javis-app #javis-launcher{width:84px;height:84px;' +
      'margin:calc(env(safe-area-inset-top) + 4px) auto 4px}}' +
      /* la barre de saisie au-dessus de la barre d'accueil de l'iPhone */
      'body.javis-app #javis-form{padding-bottom:calc(10px + env(safe-area-inset-bottom))}' +
      /* clavier ouvert : la grosse Bee se fait petite, sinon il restait 24 px pour lire (iPhone SE) */
      'body.javis-app.javis-saisie #javis-launcher{width:72px;height:72px;margin:calc(env(safe-area-inset-top) + 6px) auto 4px;animation:none}' +
      'body.javis-app.javis-closeup #javis-launcher{animation:none;transform:scale(1.18)}' +
      'body.javis-app #javis-launcher{transition:transform .45s cubic-bezier(.2,.8,.3,1)}';
    var s = document.createElement('style');
    s.id = 'javis-widget-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ============================================================
     3. Elle est vivante — port de mascotAlive() de lingua/app.js
        (respiration, clignement, regard qui suit, sommeil, toucher)
     ============================================================ */
  function mascotAlive(rig, opts) {
    if (!rig || rig._alive) return;
    rig._alive = true;
    opts = opts || {};
    var look = rig.querySelector('.rig-look') || rig;
    rig.classList.add('vivant');
    var lastTouch = Date.now(), dormi = false;

    /* Un vrai œil ne cligne pas à intervalle régulier : la durée varie, et une fois
       sur cinq le clignement est DOUBLE (deux battements rapprochés). C'est ce détail
       qui fait passer un personnage de « mécanique » à « vivant ». */
    function unClin(ms) {
      rig.classList.add('blink');
      setTimeout(function () { try { rig.classList.remove('blink'); } catch (_) {} }, ms);
    }
    /* ELLE NE CLIGNE PAS DANS LE VIDE (Kevin 2026-09-17 « performe »). Quand l'onglet n'est
       PAS regarde (autre app au premier plan, ecran verrouille), personne ne voit ces
       battements : les faire quand meme, c'est reveiller l'iPhone pour rien. On saute le
       travail et on repasse plus tard -- et elle repart des que la page redevient visible,
       sans attendre le prochain tour. UNE SEULE boucle (surtout pas une deuxieme en
       parallele : elles se marcheraient dessus et elle clignerait deux fois plus). */
    var tBlink = 0, tDouble = 0;
    function blink() {
      if (!document.contains(rig)) return;
      if (document.hidden) { tBlink = setTimeout(blink, 10000); return; }
      if (!dormi) {
        var ms = 110 + Math.random() * 70;
        unClin(ms);
        /* le 2ᵉ battement d'un double clignement vérifie AUSSI que la page est regardée
           (mesuré le 27.09 : il partait quand même après le passage en arrière-plan). */
        if (Math.random() < 0.2) tDouble = setTimeout(function () { if (!dormi && !document.hidden) unClin(ms); }, ms + 90);
      }
      tBlink = setTimeout(blink, dormi ? 9000 : (2200 + Math.random() * 3600));
    }
    blink();
    function onVisible() {
      if (!document.contains(rig)) return;
      try { clearTimeout(tBlink); clearTimeout(tDouble); } catch (_) {}
      if (document.hidden) {
        /* Passage en arrière-plan : on coupe TOUT ce qui était programmé, tout de suite
           (avant, un battement déjà prévu partait encore — 3 en 9 s, page cachée). */
        tBlink = setTimeout(blink, 10000);
        return;
      }
      tBlink = setTimeout(blink, 400);          /* elle repart tout de suite */
    }
    document.addEventListener('visibilitychange', onVisible);

    /* SON REGARD NE DOIT PAS COUTER UNE MESURE DE PAGE PAR MOUVEMENT DE DOIGT
       (Kevin 2026-09-17 « performe »). Avant : chaque evenement pointermove appelait
       getBoundingClientRect() -- ce qui FORCE le navigateur a recalculer la mise en page --
       puis ecrivait 3 variables CSS. Un doigt qui glisse envoie jusqu'a ~120 evenements par
       seconde : autant de recalculs, pour au mieux 60 images affichees. La moitie du travail
       ne servait a rien, et sur iPhone ca se sent.
       Maintenant : (a) sa position est MISE EN CACHE et seulement re-mesuree quand elle peut
       avoir bouge (defilement, rotation, redimensionnement) ; (b) l'ecriture est groupee sur
       la PROCHAINE IMAGE (requestAnimationFrame) -- au plus une par image, jamais deux. */
    var rRig = null, pend = 0, cxL = 0, cyL = 0;
    function majRect() { rRig = null; }
    function ecrire() {
      pend = 0;
      if (dormi || rig.classList.contains('rx-reflechit')) return;
      if (!rRig || !rRig.width) { rRig = rig.getBoundingClientRect(); }
      var r = rRig; if (!r.width) return;
      var dx = Math.max(-1, Math.min(1, (cxL - (r.left + r.width / 2)) / (r.width * 0.9)));
      var dy = Math.max(-1, Math.min(1, (cyL - (r.top + r.height / 2)) / (r.height * 0.9)));
      look.style.setProperty('--lx', (dx * 3.2).toFixed(2) + '%');
      look.style.setProperty('--ly', (dy * 2.2).toFixed(2) + '%');
      look.style.setProperty('--lr', (dx * 4.5).toFixed(2) + 'deg');
    }
    function suivre(cx, cy) {
      if (dormi) return;
      /* elle cherche : elle regarde ailleurs, elle ne te fixe pas */
      if (rig.classList.contains('rx-reflechit')) return;
      cxL = cx; cyL = cy;
      if (!pend) pend = requestAnimationFrame(ecrire);
    }
    function onMove(e) { var p = (e.touches && e.touches[0]) || e; if (p) suivre(p.clientX, p.clientY); reveille(); }
    document.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', majRect, { passive: true });
    window.addEventListener('resize', majRect, { passive: true });
    window.addEventListener('orientationchange', majRect, { passive: true });

    function reveille() {
      lastTouch = Date.now();
      if (dormi) { dormi = false; rig.classList.remove('dort'); react(rig, 'coucou', 1500); }
    }
    (function veille() {
      if (!document.contains(rig)) {
        /* elle a quitte la page : on retire TOUT ce qu'on a pose, sinon ca fuit */
        document.removeEventListener('pointermove', onMove);
        window.removeEventListener('scroll', majRect);
        window.removeEventListener('resize', majRect);
        window.removeEventListener('orientationchange', majRect);
        document.removeEventListener('visibilitychange', onVisible);
        desarmerAudio();
        try { clearTimeout(tBlink); } catch (_) {}
        if (pend) { try { cancelAnimationFrame(pend); } catch (_) {} pend = 0; }
        return;
      }
      if (!dormi && Date.now() - lastTouch > (opts.sommeil || 120000)) {
        dormi = true;
        rig.classList.add('dort');
        look.style.removeProperty('--lx'); look.style.removeProperty('--ly'); look.style.removeProperty('--lr');
      }
      setTimeout(veille, 4000);
    })();

    /* Tu la touches : la réaction DÉPEND de l'endroit (porté de Lingua) —
       la tête = contente, le ventre = elle rit et danse, les ailes = elle s'envole. */
    rig.style.cursor = 'pointer';
    rig.addEventListener('pointerdown', function (ev) {
      /* elle parle et tu la touches : elle se TAIT, comme on coupe quelqu'un (audit externe 02.10) */
      if (parleEncore()) { voixStop(); var rt = rig.closest && rig.closest('#javis-root'); if (rt) stopTalking(rt); bubble('Je me tais, je t\'écoute.', 2200); return; }
      var etaitEndormie = dormi;
      reveille();
      var zone = rigZone(rig, ev);
      vibrate(zone === 'ventre' ? 18 : 10);
      if (etaitEndormie) { bubble(pick(RX_LINES.reveil)); return; }
      if (zone === 'aile' && mascCfg().pieces.length) { move(rig, 'fly', 2200); }
      else { react(rig, 'poke', 900); move(rig, zone === 'ventre' ? 'dance' : 'jump', 1600); }
      sparkles(rig, zone === 'ventre' ? 10 : 6);
      tone([760, 980], .18);
      bubble(pick(RX_LINES[(zone === 'aile' && !mascCfg().pieces.length) ? 'tete' : zone] || RX_LINES.tete), 3500);
    }, { passive: true });
  }

  /* --- Ce qu'elle DIT quand tu la touches, selon l'endroit (porté de Lingua) --- */
  var RX_LINES = {
    tete: ['Oh, tu me caresses la tête !', 'Hihi, ça chatouille !', 'Merci pour le câlin !', 'Toujours là pour toi, Kevin !'],
    ventre: ['Hé, pas le ventre, ça chatouille !', 'Hihihi !', 'Arrête, je vais rire !'],
    aile: ['Attention, je décolle !', 'Regarde comme je vole bien !', 'Zzzzip !'],
    reveil: ['Oh ! Tu es revenu !', 'Je faisais un petit somme…', 'Coucou, on reprend ?'],
  };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* Où le doigt a touché, en % du personnage (porté de Lingua : _rigZone) */
  function rigZone(rig, ev) {
    var r = rig.getBoundingClientRect();
    var p = (ev.touches && ev.touches[0]) || ev;
    var x = (p.clientX - r.left) / r.width * 100, y = (p.clientY - r.top) / r.height * 100;
    if (x < 28 || x > 72) return 'aile';
    return y < 52 ? 'tete' : 'ventre';
  }

  /* Étincelles (porté de Lingua : beeSparkles) */
  function sparkles(el, n) {
    try {
      var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var em = ['✨', '⭐', '💛', '🐝', '❤️', '🌟'];
      for (var i = 0; i < (n || 8); i++) {
        var sp = document.createElement('span');
        sp.className = 'javis-spark';
        sp.textContent = pick(em);
        var a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 55;
        sp.style.left = cx + 'px'; sp.style.top = cy + 'px';
        sp.style.setProperty('--dx', (Math.cos(a) * d) + 'px');
        sp.style.setProperty('--dy', (Math.sin(a) * d - 24) + 'px');
        document.body.appendChild(sp);
        (function (x) { setTimeout(function () { x.remove(); }, 950); })(sp);
      }
    } catch (_) {}
  }

  /* Petit son (porté de Lingua : tone) — muet si la voix est coupée */
  var AC = null;
  /* iPhone EN MODE SILENCIEUX (Kevin 01.10 : « Il n'y a pas de sons », capture : cloche barrée).
     Pour que la bouche suive la voix, le son passe par le moteur audio (Web Audio) — et sur iPhone ce
     moteur se TAIT quand l'interrupteur est sur silencieux, alors qu'une vidéo ou une musique joue.
     Safari (16.4+) permet de dire « ceci est une LECTURE voulue » : navigator.audioSession.type =
     'playback' → le son sort comme une vidéo, silencieux ou pas. Kevin a demandé à entendre Bee :
     c'est une lecture voulue. Sans cette API (autre navigateur) : rien ne change. */
  function sonMemeEnSilencieux() {
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (_) {}
  }
  function tone(freqs, dur) {
    try {
      if (localStorage.getItem(STORAGE_VOICE) === '0') return;
      sonMemeEnSilencieux();
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.connect(g); g.connect(AC.destination); o.type = 'sine';
      freqs.forEach(function (f, i) { o.frequency.setValueAtTime(f, AC.currentTime + i * 0.08); });
      g.gain.setValueAtTime(.10, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + dur);
      o.start(); o.stop(AC.currentTime + dur);
    } catch (_) {}
  }
  /* Vibration : Android a navigator.vibrate ; l'iPhone NON (Safari ne l'a jamais eu : 0 vibration mesurée
     par l'audit externe 02.10). Depuis Safari 18, cocher une case « switch » fait vibrer l'iPhone : une case
     cachée, et on touche son étiquette. Rien ne s'affiche, rien n'est envoyé. */
  var _haptique = null;
  function vibrate(ms) {
    try {
      if (navigator.vibrate) { navigator.vibrate(ms); return; }
      if (!_haptique) {
        var l = document.createElement('label'), c = document.createElement('input');
        l.setAttribute('aria-hidden', 'true'); l.className = 'javis-haptique';
        l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
        c.type = 'checkbox'; c.setAttribute('switch', ''); c.tabIndex = -1;
        l.appendChild(c); document.body.appendChild(l); _haptique = l;
      }
      _haptique.click();
    } catch (_) {}
  }

  /* Bulle qui apparaît à côté d'elle (porté de Lingua : beeBubble) */
  function bubble(text, ms) {
    if (CADRE) return;   /* le cadre est un petit carré : une bulle y serait coupée */
    try {
      var old = document.querySelector('.javis-bubble'); if (old) old.remove();
      var b = document.createElement('div');
      b.className = 'javis-bubble';
      b.textContent = text;
      b.onclick = function () { b.remove(); };
      document.body.appendChild(b);
      setTimeout(function () {
        try { b.classList.add('bye'); setTimeout(function () { b.remove(); }, 400); } catch (_) {}
      }, ms || 6000);
    } catch (_) {}
  }

  /* ============================================================
     3 bis. VRAIE VIDÉO de Bee (mode app) — même discipline que Lingua
     ------------------------------------------------------------
     Règle de repli, dans cet ordre exact :
       • la vidéo ne dit jamais « canplay »  → on ne pose jamais .vid  → marionnette CSS
       • un clip d'humeur manque (404)        → on le note absent, retour à idle, ce
                                                mouvement-là repasse en marionnette
       • le clip de repos lui-même échoue     → on retire la vidéo, tout repasse en
                                                marionnette — JAMAIS d'écran vide
     ============================================================ */
  var VID = { pret: false, absent: {}, retour: 0 };
  /* LE DERNIER GESTE de Kevin (audit perf 27.09, mesuré : app ouverte sans y toucher =
     3,1 à 3,9 Mo de vidéos retéléchargées PAR MINUTE, et 60 images calculées par seconde).
     Sans geste depuis 2 min, Bee se repose : plus de clips (0 octet), animations en pause. */
  var DERNIER_GESTE = Date.now();
  var REPOS_CLIPS = 120000, REPOS_ANIM = 20000;
  function gesteVu() {
    DERNIER_GESTE = Date.now();
    try { document.body.classList.remove('javis-repos'); } catch (_) {}
    /* la vidéo de repos, arrêtée après 2 min, repart au premier geste */
    try {
      var v = VID.pret && !document.hidden && document.querySelector('#javis-launcher .javis-vid');
      if (v && v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    } catch (_) {}
  }

  function initVideo(rig) {
    if (!rig) return;
    var v = rig.querySelector('.javis-vid');
    if (!v) return;
    /* 3D D'OFFICE (Kevin 3.10) : quand la 3D est possible, c'est elle qui anime Bee — la vidéo (3 à 4 Mo retéléchargés par
       minute, mesuré le 27.09) ne se charge même pas. Si la 3D ne peut pas venir (pas de WebGL, économiseur de données),
       prefere3D() est faux et la vidéo / la marionnette 2D font comme avant. */
    try {
      if (window.KdmcMarionnette && window.KdmcMarionnette.prefere3D && window.KdmcMarionnette.prefere3D()) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); return; }
    } catch (_) {}
    v.addEventListener('canplay', function () {
      VID.pret = true;
      rig.classList.add('vid');
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }, { once: true });
    v.addEventListener('error', function () {
      var m = String(v.getAttribute('src') || '').match(/\/live\/([a-z]+)\.mp4/);
      if (VID.pret && m && m[1] !== 'idle') {
        VID.absent[m[1]] = 1;                  /* ce mouvement-là seulement */
        try { v.src = liveBase() + 'idle.mp4'; var q = v.play(); if (q && q.catch) q.catch(function () {}); } catch (_) {}
        return;
      }
      VID.pret = false;
      try { rig.classList.remove('vid'); v.remove(); } catch (_) {}
    });
  }

  /* Joue un clip et revient au repos toute seule. Rend true si elle a pu le jouer. */
  function clip(rig, nom, secs) {
    if (!VID.pret || !rig) return false;
    var v = rig.querySelector('.javis-vid');
    if (!v || !nom || VID.absent[nom] || CLIPS.indexOf(nom) < 0) return false;
    try { v.src = liveBase() + nom + '.mp4'; v.loop = true; var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (_) { return false; }
    if (VID.retour) clearTimeout(VID.retour);
    if (nom !== 'idle') {
      VID.retour = setTimeout(function () {
        try { if (!VID.pret) return; v.src = liveBase() + 'idle.mp4'; var q = v.play(); if (q && q.catch) q.catch(function () {}); } catch (_) {}
      }, Math.max(2, secs || 4) * 1000);
    }
    return true;
  }

  /* Mouvements du corps entier (porté de Lingua : beeMove) */
  function move(rig, kind, dur) {
    if (!rig) return;
    ['mv-dance', 'mv-jump', 'mv-fly', 'mv-walk'].forEach(function (c) { rig.classList.remove(c); });
    if (!kind) return;
    /* Si la vraie vidéo est là, c'est ELLE qui bouge (bien plus vivant que le CSS).
       Sinon on retombe sur la marionnette, exactement comme avant. */
    if (clip(rig, kind, (dur || 2400) / 1000)) return;
    rig.classList.add('mv-' + kind);
    setTimeout(function () { try { rig.classList.remove('mv-' + kind); } catch (_) {} }, dur || 2400);
  }

  function react(rig, kind, dur) {
    if (!rig) return;
    ['rx-poke', 'rx-joie', 'rx-triste', 'rx-reflechit', 'rx-coucou'].forEach(function (c) { rig.classList.remove(c); });
    if (!kind) return;
    void rig.offsetWidth; /* relance l'animation même si c'est la même (astuce de Lingua) */
    rig.classList.add('rx-' + kind);
    setTimeout(function () { try { rig.classList.remove('rx-' + kind); } catch (_) {} }, dur || 1500);
  }

  /* la voix en cours + l'arret de l'analyse du son (partages : stopTalking les nettoie) */
  var _voixAudio = null, _lipStop = null, _voixEl = null;
  function allRigs(root) { return Array.prototype.slice.call(root.querySelectorAll('.bee-rig')); }
  function allMouths(root) { return Array.prototype.slice.call(root.querySelectorAll('.disc-mouth')); }
  var APP_MODE = (window.JAVIS_MODE === 'app');
  /* BEE PARTOUT (Kevin 4.10) : dans les autres apps du domaine, Bee vit dans un CADRE (iframe de même origine, /__javis/cadre) posé par le
     routeur. Là, elle dit au parent quand elle est prête / ouverte / fermée (pour qu'il redimensionne le cadre) et reçoit de lui OÙ est Kevin
     (nom de l'app + titre de la page). Les CSP des apps ne s'appliquent pas dans le cadre. */
  var CADRE = false, PAGE_CTX = null;
  try { CADRE = window.top !== window.self && location.pathname === '/__javis/cadre'; } catch (_) {}
  function versParent(t) { try { if (CADRE) window.parent.postMessage({ kdmcBee: 1, t: t }, location.origin); } catch (_) {} }
  if (CADRE) {
    try {
      document.documentElement.classList.add('javis-cadre');
      window.addEventListener('message', function (e) {
        var d = e && e.data;
        if (e.origin !== location.origin || e.source !== window.parent || !d || d.kdmcBee !== 1 || d.t !== 'contexte') return;
        PAGE_CTX = { app: String(d.app || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30), titre: String(d.titre || '').slice(0, 120) };
      });
    } catch (_) {}
  }
  /* Le MARQUEUR (cookie sans secret, posé aussi par le domaine) : « cet appareil est celui de Kevin » — évite de demander à chaque visiteur de
     chaque app s'il est Kevin. Ce n'est qu'un indice ; la vérité reste celle du domaine. */
  function marqueur(poser) {
    try {
      if (!/\.?kd-mc\.com$/i.test(location.hostname)) return;
      document.cookie = 'kdmc_k=' + (poser ? '1' : '') + '; Domain=.kd-mc.com; Path=/; Max-Age=' + (poser ? 31536000 : 0) + '; Secure; SameSite=Lax';
    } catch (_) {}
  }
  function startTalking(root) {
    gesteVu();                                   /* elle parle : elle n'est pas au repos */
    allRigs(root).forEach(function (r) {
      r.classList.add('talk');
      var m = r.querySelector('.disc-mouth'); if (m) m.classList.add('talking');
    });
    /* Gros plan pendant qu'elle parle (Kevin : « en gros plan le visage ») */
    if (APP_MODE) {
      document.body.classList.add('javis-closeup');
      var gros = root.querySelector('#javis-launcher .bee-rig');
      if (gros) clip(gros, 'hello', 6);
    }
  }
  function stopTalking(root) {
    if (_lipStop) { try { _lipStop(); } catch (_) {} _lipStop = null; }
    allRigs(root).forEach(function (r) {
      r.classList.remove('talk');
      var m = r.querySelector('.disc-mouth');
      /* la bouche pilotee par le son porte un transform en ligne : le retirer,
         sinon elle reste figee grande ouverte apres la derniere syllabe. */
      if (m) { m.classList.remove('talking'); m.style.transform = ''; m.style.opacity = ''; }
    });
    if (APP_MODE) {
      document.body.classList.remove('javis-closeup');
      var gros = root.querySelector('#javis-launcher .bee-rig');
      if (gros) clip(gros, 'idle', 0);
    }
  }
  function setThinking(root, on) {
    allRigs(root).forEach(function (r) {
      r.classList[on ? 'add' : 'remove']('rx-reflechit');
      /* Le regard qui suit le doigt écrit --lx/--ly/--lr EN LIGNE, et un style en ligne
         gagne toujours sur une règle de classe : sans ce nettoyage, « elle regarde
         ailleurs » ne se verrait jamais. On le retire pendant qu'elle cherche ; dès
         qu'elle répond, le prochain mouvement du doigt la fait revenir vers toi. */
      if (on) {
        var l = r.querySelector('.rig-look');
        if (l) { l.style.removeProperty('--lx'); l.style.removeProperty('--ly'); l.style.removeProperty('--lr'); }
      }
    });
  }

  /* ============================================================
     4. Voix (Web Speech API — gratuite, native) + intentions locales
     ============================================================ */
  /* ============================================================
     4 bis. SA VOIX + LE VRAI LIP-SYNC (porte de Lingua : beeLipSync)
     ------------------------------------------------------------
     iPhone : brancher un <audio> dans le moteur audio DETOURNE le son par ce moteur.
     Si le moteur n'a pas ete reveille par un VRAI geste, le son serait COUPE. Donc :
     moteur pas pret -> on n'y touche pas, la bouche bat en CSS et le son sort normalement.
     ============================================================ */
  /* AC : le moteur audio, déclaré plus haut (avec tone) — une seule déclaration */
  /* UN SON SILENCIEUX JOUÉ PENDANT LE TOUCHER (Kevin 3.10 : « il n'y a pas de sons », mesuré sur sa capture :
     l'îlot de l'iPhone affiche une LECTURE en cours… muette). Sur iPhone, un lecteur ne peut jouer plus tard,
     tout seul (quand la réponse de l'IA arrive), que s'il a déjà joué PENDANT un geste. On l'amorce donc au
     premier toucher avec 0,05 s de silence : ensuite il a le droit de parler. */
  var _silence = '';
  function urlSilence() {
    if (_silence) return _silence;
    try {
      var n = 400, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      w(36, 'data'); v.setUint32(40, n * 2, true);
      _silence = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    } catch (_) { _silence = ''; }
    return _silence;
  }
  function amorcerVoix() {
    try {
      if (!_voixEl) _voixEl = new Audio();
      if (_voixEl._amorce || _voixAudio) return;
      var u = urlSilence(); if (!u) return;
      _voixEl._amorce = true;
      _voixEl.src = u;
      var p = _voixEl.play();
      if (p && p.then) p.then(function () { try { if (_voixEl.src === u) _voixEl.pause(); } catch (_) {} }, function () { _voixEl._amorce = false; });
    } catch (_) { try { _voixEl._amorce = false; } catch (__) {} }
  }
  function audioUnlock() {
    amorcerVoix();
    try {
      sonMemeEnSilencieux();   /* AVANT de créer le moteur : iOS fixe la catégorie audio à sa création */
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state !== 'running' && AC.resume) AC.resume();
      var b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource();
      s.buffer = b; s.connect(AC.destination); (s.start || s.noteOn).call(s, 0);
    } catch (_) {}
  }
  /* ⚠ Ces 4 ecouteurs etaient poses AU CHARGEMENT, donc AVANT le gate admin : tout
     visiteur anonyme d'une page qui embarque Bee les portait, et son premier toucher
     creait un AudioContext pour rien. Ils s'arment maintenant SEULEMENT quand Bee est
     montee (donc pour Kevin), et se retirent quand elle quitte la page. */
  var AUDIO_EV = ['touchend', 'click', 'pointerdown', 'keydown'];
  var audioArme = false;
  function armerAudio() {
    if (audioArme) return;
    audioArme = true;
    try { AUDIO_EV.forEach(function (ev) { document.addEventListener(ev, audioUnlock, { passive: true }); }); } catch (_) {}
  }
  function desarmerAudio() {
    if (!audioArme) return;
    /* changer de personnage remplace les dessins : l'ANCIEN s'en va, mais Bee est toujours là
       (mesuré 27.09 : les 4 écouteurs partaient, le son calé sur les lèvres était perdu) */
    try { if (document.querySelector('#javis-root .bee-rig')) return; } catch (_) {}
    audioArme = false;
    try { AUDIO_EV.forEach(function (ev) { document.removeEventListener(ev, audioUnlock); }); } catch (_) {}
  }

  /* La bouche s'ouvre sur l'AMPLITUDE du son reel (RMS), image par image.
     Rend une fonction d'arret, ou null si l'analyse est impossible (-> repli CSS). */
  /* LES VOYELLES FRANCAISES ET LA BOUCHE QU'ELLES FONT.
     f1/f2 = les deux resonances de la voix, en Hz (valeurs de reference de la phonetique
     du francais, voix moyenne ; elles varient d'une personne a l'autre, mais ce qui compte
     ici c'est leur POSITION RELATIVE, et celle-la est stable).
     x = largeur de la bouche, y = ouverture (1.00 / 0.30 = bouche au repos).
     Lecture simple : F1 monte quand la machoire s'ouvre, F2 monte quand la langue avance.
       « ou » : machoire fermee, langue en arriere, levres arrondies -> etroite et basse
       « a »  : machoire grande ouverte                              -> tres ouverte
       « i »  : machoire fermee, langue en avant, levres etirees     -> large et plate */
  var VOYELLES = [
    { nom: 'a',  f1: 750, f2: 1300, x: 1.15, y: 1.95 },
    { nom: 'e',  f1: 400, f2: 2100, x: 1.45, y: 1.00 },
    { nom: 'ai', f1: 550, f2: 1900, x: 1.32, y: 1.45 },   /* « e » ouvert, comme dans « mais » */
    { nom: 'i',  f1: 300, f2: 2300, x: 1.62, y: 0.62 },
    { nom: 'o',  f1: 400, f2: 800,  x: 0.80, y: 1.20 },
    { nom: 'au', f1: 550, f2: 1000, x: 0.95, y: 1.60 },   /* « o » ouvert, comme dans « sort » */
    { nom: 'ou', f1: 320, f2: 800,  x: 0.62, y: 0.85 },
    { nom: 'u',  f1: 300, f2: 1750, x: 0.70, y: 0.78 }    /* le « u » francais : levres rondes */
  ];

  /* LES DEUX FAMILLES DE CONSONNES QU'ON PEUT VRAIMENT LIRE SUR UNE BOUCHE.
     (Kevin 2026-09-17 « va plus loin » — c'etait la limite ecrite noir sur blanc juste au-dessus.)
     On ne cherche PAS a distinguer un « s » d'un « f » : personne ne lit ca sur des levres.
     Ce qui se VOIT, c'est la POSTURE, et il n'y en a que deux qui ne sont pas des voyelles :
       fricative (s, ch, f, z, j, v) -> une FENTE : levres etirees, presque fermees ;
       fermeture (m, b, p, n)        -> les levres se TOUCHENT.
     Chacune se reconnait a la FORME DU SPECTRE, pas au volume :
       une fricative, c'est du souffle : presque toute l'energie est EN HAUT, et il n'y a
         aucune resonance grave (pas de F1) -- c'est ce qui la separe d'une voyelle claire
         comme le « i », qui a bien un F1 vers 300 Hz ;
       une fermeture, c'est un bourdonnement etouffe : presque tout EN BAS, rien en haut. */
  var CONSONNES = {
    fricative: { nom: 's', x: 1.28, y: 0.26 },
    fermeture: { nom: 'm', x: 0.98, y: 0.10 }
  };

  /* L'OREILLE HORS LIGNE (3.10) : avant, la voix passait PAR le moteur audio pour qu'on mesure sa forme —
     et sur iPhone, un moteur endormi (après Siri, une notification, un retour dans l'app) rendait la voix
     MUETTE alors qu'elle « jouait » (l'îlot de la capture de Kevin). Désormais le son sort par un lecteur
     ordinaire, jamais détourné, et la bouche lit le MÊME fichier, décodé à côté : à chaque image on prend
     les 2 048 échantillons qui passent à l'instant `currentTime` et on calcule ce qu'un analyseur Web Audio
     aurait rendu (même fenêtre de Blackman, mêmes décibels ramenés sur 0-255, même lissage). Le reste du
     lip-sync (voyelles, consonnes, halo) ne voit aucune différence. */
  function fftReelle(re, im) {
    var n = re.length, i, j, k, m;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (m = 2; m <= n; m <<= 1) {
      var ang = -2 * Math.PI / m, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += m) {
        var cr = 1, ci = 0;
        for (k = 0; k < m / 2; k++) {
          var a = i + k, b = a + m / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          var nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
        }
      }
    }
  }
  function analyseurHorsLigne(audioEl, ech, sr) {
    var N = 2048, lisse = new Float32Array(N / 2), fen = new Float32Array(N), re = new Float32Array(N), im = new Float32Array(N), i;
    for (i = 0; i < N; i++) fen[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N);
    function debut() { return Math.max(0, Math.min(ech.length - N, Math.floor((audioEl.currentTime || 0) * sr) - N / 2)); }
    return {
      fftSize: N, frequencyBinCount: N / 2, sampleRate: sr, horsLigne: true,
      getByteTimeDomainData: function (u8) {
        var d = debut();
        for (var k = 0; k < u8.length; k++) { var x = ech[d + k] || 0; u8[k] = Math.max(0, Math.min(255, Math.round(128 * (1 + x)))); }
      },
      getByteFrequencyData: function (u8) {
        var d = debut(), k;
        for (k = 0; k < N; k++) { re[k] = (ech[d + k] || 0) * fen[k]; im[k] = 0; }
        fftReelle(re, im);
        for (k = 0; k < u8.length; k++) {
          lisse[k] = 0.55 * lisse[k] + 0.45 * Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
          var db = 20 * Math.log(lisse[k] || 1e-12) / Math.LN10;
          u8[k] = Math.max(0, Math.min(255, Math.round(255 * (db + 100) / 70)));
        }
      }
    };
  }
  /* ⚠ PLUS JAMAIS createMediaElementSource : brancher le lecteur sur le moteur audio détourne le son, et un
     moteur endormi le rend muet (garde test:javis-bee). La bouche lit le fichier décodé (analyseurHorsLigne). */
  function lipSync(audioEl, bouches, horsLigne) {
    if (!audioEl || !bouches.length || !horsLigne) return null;
    try {
      var an = horsLigne;
      /* 2048 et pas 256 : pour reconnaitre une VOYELLE il faut mesurer ses deux resonances
         (F1, F2), et a 256 chaque case du spectre fait 172 Hz -- on ne distingue meme pas
         un « ou » (F1 320) d'un « a » (F1 750). A 2048, chaque case fait ~21 Hz : la ou
         se joue la difference entre les voyelles. Cout : une FFT de 2048 points par image,
         negligeable pour un navigateur. */
      var buf = new Uint8Array(an.fftSize), raf = 0, maxR = 0, plat = false;
      var fbuf = new Uint8Array(an.frequencyBinCount);   /* le SPECTRE, pas que le volume */
      var hz = horsLigne.sampleRate / an.fftSize;     /* largeur d'une case du spectre */
      var cibleX = 1.0, cibleY = 0.30, derniere = '';     /* la forme visee, lissee */
      var presence = 0;                                   /* « elle est en train de parler » */
      var t0 = Date.now();
      bouches.forEach(function (m) { m.classList.remove('talking'); m.style.opacity = '1'; });
      function frame() {
        an.getByteTimeDomainData(buf);
        var acc = 0, i;
        for (i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; acc += v * v; }
        var rms = Math.sqrt(acc / buf.length);
        if (rms > maxR) maxR = rms;
        var ouv = Math.max(0, Math.min(1, (rms - 0.01) * 7));
        /* HALO : sa lumière suit sa voix (l'orbe de ChatGPT, le halo de Siri — en Bee). Une variable CSS,
           0 octet de plus, coupée en mouvement réduit (audit externe 02.10, UX n°4). */
        try { document.documentElement.style.setProperty('--bee-niveau', ouv.toFixed(2)); } catch (_) {}
        /* DE VRAIS VISEMES : elle FORME la voyelle qu'elle prononce (Kevin 2026-09-17
           « fais le, continu »).
           ─────────────────────────────────────────────────────────────────────────────
           Etape 1 (le matin) : le volume pilotait scaleX ET scaleY -> la bouche gonflait,
             forme toujours identique.
           Etape 2 : le centre de gravite du spectre donnait une forme « claire / sombre ».
             Mieux, mais ca ne reconnait toujours aucun son precis.
           Etape 3, ici : on lit les DEUX RESONANCES DE LA VOIX (les formants F1 et F2).
             C'est la vraie methode, celle de la phonetique : F1 dit combien la machoire est
             ouverte, F2 dit ou est la langue. Ces deux nombres suffisent a identifier une
             voyelle. On compare (F1,F2) aux voyelles francaises de reference et on prend la
             plus proche, puis la bouche prend LA FORME de cette voyelle.
           Etape 4 (v1.6, « va plus loin ») : les CONSONNES. Pas une par une -- ca ne se lit
             pas sur des levres -- mais par POSTURE : la fente d'une fricative (s/ch/f) et
             la fermeture des levres (m/b/p). Voir CONSONNES plus haut.
           Honnete : trois familles (voyelle / fente / fermeture), pas un phoneme par
             phoneme. Un « s » et un « f » font toujours la meme bouche -- comme chez
             un vrai visage. Ce qui manquait vraiment, c'etait la FERMETURE : sans elle,
             une bouche ne se ferme jamais au milieu d'un mot, et ca se voit. */
        an.getByteFrequencyData(fbuf);
        var pic = function (fMin, fMax) {          /* la resonance la plus forte d'une bande */
          var b0 = Math.max(1, Math.round(fMin / hz)), b1 = Math.min(fbuf.length - 1, Math.round(fMax / hz));
          var best = 0, bv = 0;
          for (var k = b0; k <= b1; k++) { if (fbuf[k] > bv) { bv = fbuf[k]; best = k; } }
          return bv < 24 ? 0 : best * hz;          /* trop faible = pas une resonance */
        };
        /* ⚠️ PIEGE MESURE (vecu ici meme) : getByteFrequencyData ne rend PAS de l'energie,
           elle rend des DECIBELS ramenes sur 0-255. Additionner ces octets tels quels, c'est
           additionner des echelles logarithmiques : une bande 40 dB plus faible (donc
           10 000 fois moins d'energie, inaudible) pese encore plus de la moitie du score.
           Mesure : un vrai « s » etait classe comme la voyelle « ai ». On repasse donc en
           ENERGIE REELLE avant de comparer. Le facteur constant se simplifie dans un
           rapport : 10^(octet * 0.027451) suffit. */
        var lin = function (b) { return Math.pow(10, b * 0.027451); };
        var somme = function (fMin, fMax) {        /* l'energie reelle d'une bande */
          var b0 = Math.max(1, Math.round(fMin / hz)), b1 = Math.min(fbuf.length - 1, Math.round(fMax / hz));
          var a = 0;
          for (var k = b0; k <= b1; k++) a += lin(fbuf[k]);
          return a;
        };
        var F1 = pic(200, 1000), F2 = pic(900, 3000);
        /* LA FORME DU SPECTRE, en deux nombres simples : quelle part de l'energie est tout
           en bas (le bourdonnement d'une bouche fermee) et quelle part est tout en haut
           (le souffle d'une fricative). Une voyelle, elle, a ses deux resonances AU MILIEU,
           donc ni l'une ni l'autre de ces deux parts ne devient dominante. */
        var sonPresent = rms > 0.008;              /* il y a vraiment quelque chose a analyser */
        var tot = sonPresent ? somme(80, 8000) : 0;
        var partBas = tot > 0 ? somme(80, 350) / tot : 0;
        var partHaut = tot > 0 ? somme(2000, 8000) / tot : 0;
        var cible = null;
        if (partBas > 0.72 && partHaut < 0.12) {
          cible = CONSONNES.fermeture;             /* m / b / p / n : les levres se touchent */
        } else if (partHaut > 0.70) {
          cible = CONSONNES.fricative;             /* s / ch / f : du souffle, rien dans le grave */
        } else if (F1 && F2) {
          var meilleur = null, dMin = 1e9;
          for (i = 0; i < VOYELLES.length; i++) {
            var v = VOYELLES[i];
            /* en echelle logarithmique : l'oreille (et la phonetique) comparent des rapports,
               pas des ecarts en Hz -- 100 Hz d'ecart ne pesent pas pareil a 300 et a 2300 Hz */
            var d = Math.pow(Math.log(F1 / v.f1), 2) + Math.pow(Math.log(F2 / v.f2), 2) * 0.8;
            if (d < dMin) { dMin = d; meilleur = v; }
          }
          cible = meilleur;
        }
        if (cible) {                               /* on glisse vers la forme, on n'y saute pas */
          cibleX = cibleX * 0.6 + cible.x * 0.4;
          cibleY = cibleY * 0.6 + cible.y * 0.4;
          derniere = cible.nom;
        } else if (!sonPresent) {                  /* plus rien : la bouche rentre au repos */
          cibleX = cibleX * 0.85 + 1.00 * 0.15;
          cibleY = cibleY * 0.85 + 0.30 * 0.15;
        }
        /* UNE BOUCHE FERMEE NE FAIT PAS DE BRUIT -- et c'est tout le probleme.
           Si la forme n'etait pilotee que par le volume DE L'INSTANT, le « m » de « maman »
           serait invisible : silencieux, donc bouche au repos, donc jamais ferme. On garde
           donc une trace de la parole en cours (`presence`), qui retombe en ~1/3 de seconde
           de vrai silence. Resultat : la fermeture se VOIT pendant le mot, et au silence
           reel on revient exactement a l'ancien repos (scaleY 0.30 / scaleX 1.00) --
           aucune regression sur la garde. */
        presence = sonPresent ? Math.max(presence, rms) : presence * 0.85;
        var poids = Math.max(ouv, Math.min(1, Math.max(0, (presence - 0.01) * 7)) * 0.8);
        var sy = 0.30 + (cibleY - 0.30) * poids;
        var sx = 1.00 + (cibleX - 1.00) * poids;
        var t = 'translate(-50%,-50%) scaleY(' + sy.toFixed(2) + ') scaleX(' + sx.toFixed(2) + ')';
        bouches.forEach(function (m) { m.style.transform = t; });
        /* amplitude plate pendant 500 ms = analyse muette (codec/navigateur) -> repli CSS */
        if (!plat && Date.now() - t0 > 500 && maxR < 0.012) {
          plat = true;
          bouches.forEach(function (m) { m.style.transform = ''; m.classList.add('talking'); });
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      return function () {
        try { cancelAnimationFrame(raf); } catch (_) {}
        try { document.documentElement.style.setProperty('--bee-niveau', '0'); } catch (_) {}
        /* le lecteur est RÉUTILISÉ (audit complet 30.09) : on le débranche de CET analyseur,
           sinon chaque phrase en ajoutait un de plus, jamais libéré */
        bouches.forEach(function (m) {
          try { m.classList.remove('talking'); m.style.transform = ''; m.style.opacity = ''; } catch (_) {}
        });
      };
    } catch (_) { return null; }
  }

  var _parole = 0;                          /* numéro de la phrase en cours */
  function parleEncore() {
    try {
      if (_voixAudio && !_voixAudio.paused && !_voixAudio.ended) return true;
      return !!(window.speechSynthesis && window.speechSynthesis.speaking);
    } catch (_) { return false; }
  }
  function voixStop() {
    _parole++;
    if (_lipStop) { try { _lipStop(); } catch (_) {} _lipStop = null; }
    /* ⚠ vider src déclenche l'événement « error » de l'ANCIEN son : son repli relisait alors
       l'ancienne phrase par-dessus la nouvelle, à CHAQUE réponse sauf la première (mesuré 27.09).
       On le marque abandonné AVANT de le vider : ses écouteurs se taisent. */
    /* removeAttribute + load() : l'ancien son s'arrête SANS événement « error » (spec HTML) */
    if (_voixAudio) { try { _voixAudio._abandon = true; _voixAudio.pause(); _voixAudio.removeAttribute('src'); _voixAudio.load(); } catch (_) {} _voixAudio = null; }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  }

  /* Repli : la voix du telephone. Elle parle, mais on ne peut PAS l'analyser
     (le navigateur la joue hors du moteur audio) -> la bouche bat en rythme. */
  function voixTelephone(root, text) {
    if (!('speechSynthesis' in window)) { stopTalking(root); return; }
    try {
      var u = new SpeechSynthesisUtterance(text.slice(0, 600));
      u.lang = 'fr-FR'; u.rate = 1.02;
      /* Hauteur BRIDÉE à 1,25 (même borne que Lingua : au-delà, la voix du téléphone devient
         métallique — plainte « trop robot » de Kevin) et une VRAIE voix par genre quand le téléphone
         en a (audit complet 30.09 : les deux mascottes avaient la même voix, seule la hauteur changeait). */
      var cfg = mascCfg();
      u.pitch = Math.min(1.25, cfg.hauteur || 1.2);
      try {
        var vs = window.speechSynthesis.getVoices().filter(function (v) { return v.lang && v.lang.indexOf('fr') === 0; });
        var FEM = /am[eé]lie|audrey|aur[eé]lie|c[eé]line|chantal|julie|marie|virginie|female|femme|woman/i;
        var MASC = /thomas|daniel|nicolas|henri|jacques|paul|male|homme|man\b/i;
        var choisie = vs.filter(function (v) {
          return cfg.gen === 'm' ? (MASC.test(v.name) && !FEM.test(v.name)) : FEM.test(v.name);   /* « female » contient « male » */
        })[0];
        if (choisie) u.voice = choisie;
      } catch (_) {}
      var id = _parole;
      u.onend = function () { if (id === _parole) stopTalking(root); };
      u.onerror = function () { if (id === _parole) stopTalking(root); };
      window.speechSynthesis.speak(u);
    } catch (_) { stopTalking(root); }
  }

  /* Ce qui se DIT n'est pas ce qui s'ÉCRIT : pas d'adresse web ni d'émoji lus à voix haute. */
  function aDire(text) {
    /* ni le CONTENU d'un <script>/<style>, ni le Markdown (« ** », « # », « ` ») ne sont lus à voix haute */
    return String(text || '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
      .replace(/\*\*|__|`+/g, '').replace(/^\s*#{1,6}\s+/gm, '').replace(/https?:\/\/\S+/g, '')
      .replace(/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]\uFE0F?|\uFE0F|\u200D/g, '')
      .replace(/\s{2,}/g, ' ').trim();
  }
  /* Jamais coupée en plein mot (audit externe 02.10 : la voix s'arrêtait net au 600e caractère) :
     au-delà de 600, on s'arrête à la DERNIÈRE fin de phrase, sinon au dernier espace. */
  function jusquAuBout(t, max) {
    var c = Array.from(t);
    if (c.length <= max) return t;
    var debut = c.slice(0, max).join('');
    var fin = Math.max(debut.lastIndexOf('. '), debut.lastIndexOf('! '), debut.lastIndexOf('? '), debut.lastIndexOf('… '));
    if (fin >= max / 3) return debut.slice(0, fin + 1);
    var esp = debut.lastIndexOf(' ');
    return esp > 0 ? debut.slice(0, esp) : debut;
  }
  function speak(root, text) {
    var on = true;
    try { on = localStorage.getItem(STORAGE_VOICE) !== '0'; } catch (_) {}
    text = jusquAuBout(aDire(text), 600);
    if (!on || !text) return;
    sonMemeEnSilencieux();
    voixStop();
    startTalking(root);

    /* 1) SA voix (le domaine la fabrique) + VRAI lip-sync — SANS le moteur audio (3.10, Kevin : « il n'y a
          pas de sons »). Le son est TÉLÉCHARGÉ (fetch, même adresse que la page), joué par UN lecteur ordinaire
          (amorcé au toucher, voir amorcerVoix) et décodé à côté pour la bouche (analyseurHorsLigne). Le moteur
          audio peut dormir, être interrompu, refuser de se réveiller : la voix sort quand même. */
    var a = _voixEl || (_voixEl = new Audio());
    a._abandon = false;
    a.removeAttribute('crossorigin');
    var id = _parole, repli = false, joue = false;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    function versTelephone() {
      if (repli || id !== _parole) return; repli = true;
      /* on COUPE la demande au domaine (audit externe 02.10 : abandonnée, elle continuait côté serveur) */
      try { if (ctrl) ctrl.abort(); } catch (_) {}
      try { a._abandon = true; a.pause(); a.removeAttribute('src'); a.load(); } catch (_) {}
      voixTelephone(root, text);
    }
    a.onended = function () { if (id === _parole) stopTalking(root); };
    a.onerror = function () { if (!a._abandon && id === _parole && !joue) versTelephone(); };
    /* le son ne vient jamais : on ne la laisse pas muette (6 s : la voix gratuite met ~1,3 s, mesuré 3.10) */
    setTimeout(function () { if (!repli && !joue && id === _parole) versTelephone(); }, 6000);
    var url = adresseVoix() + '?v=' + voixDe() + '&l=fr&gratuit=1&t=' + encodeURIComponent(text), type = 'audio/mpeg';
    fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        type = (r.headers.get('content-type') || '').split(';')[0];
        if (!r.ok || !/^audio\//.test(type)) throw new Error('pas un son');
        return r.arrayBuffer();
      })
      .then(function (donnees) {
        if (repli || id !== _parole) return;
        if (a._url) { try { URL.revokeObjectURL(a._url); } catch (_) {} }
        a._url = URL.createObjectURL(new Blob([donnees], { type: type }));
        /* VOIX RÉELLEMENT DIFFÉRENTES (règle Kevin 18.05) : quand la belle voix (MP3) n'est pas là, Bee et
           Bourricot reçoivent la MÊME voix gratuite (WAV) — Bourricot la prend alors plus grave et plus posée. */
        var grave = mascCfg().gen === 'm' && type === 'audio/wav';
        try { a.preservesPitch = !grave; a.webkitPreservesPitch = !grave; a.mozPreservesPitch = !grave; } catch (_) {}
        a.src = a._url;
        a.playbackRate = grave ? 0.86 : 1;
        _voixAudio = a;
        var p = a.play();
        joue = true;
        if (p && p.catch) p.catch(function () { joue = false; versTelephone(); });
        /* la bouche : le même fichier, décodé à côté (jamais branché sur le haut-parleur) */
        try {
          var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          var oc = new OAC(1, 1, 44100), fini = function (ab) {
            if (!ab || repli || id !== _parole) return;
            var stop = lipSync(a, allMouths(root), analyseurHorsLigne(a, ab.getChannelData(0), ab.sampleRate));
            if (stop) { if (_lipStop) { try { _lipStop(); } catch (_) {} } _lipStop = stop; }
          };
          var pr = oc.decodeAudioData(donnees.slice(0), fini, function () {});
          if (pr && pr.then) pr.then(fini, function () {});
        } catch (_) { /* pas de décodage : la bouche bat en rythme (CSS) */ }
      })
      .catch(function () { if (!(ctrl && ctrl.signal.aborted)) versTelephone(); });
  }

  /* ⚠ « apex.kd-mc.com » N'EXISTE PAS (mesuré 27.09 : le nom ne se résout même pas) — l'adresse
     d'Apex est apex-ai.kd-mc.com (kdmc-home/apps.json). Bee envoyait Kevin dans le vide.
     Garde : test:javis-bee vérifie que chaque adresse ici est une app du domaine (apps.json). */
  var APEX = 'https://apex-ai.kd-mc.com';
  /* Les apps que Bee sait OUVRIR. Chaque clé est la FIN de la phrase (« ouvre mon arbre »,
     « lance le bot crypto ») : un mot au milieu d'une phrase ne suffit plus (audit complet 30.09 :
     « montre-moi l'équipe de France de rugby » ouvrait CMCteams, « la famille royale » l'arbre). */
  var DOMAIN_APPS = {
    'arbre(?: généalogique)?|généalogie|famille|arrière.grand.père|arrière grand père': 'https://arbre.kd-mc.com',
    'lingua|langues?|monégasque': 'https://lingua.kd-mc.com',
    'apex|assistant ia avancé': APEX,
    'planning|cmcteams|équipes?|départs?': 'https://cmcteams.kd-mc.com',
    '\\bbot\\b(?: crypto)?|crypto': 'https://bot.kd-mc.com',
    '\\bstudio\\b|créa studio': 'https://studio.kd-mc.com',
    'cuisine|recettes?': 'https://cuisine.kd-mc.com',
    'boutiques?|shop': 'https://shops.kd-mc.com',
    'mes apps|mon domaine|accueil|portail': 'https://kd-mc.com',
  };

  /* Une fenêtre ouverte SANS lien de retour vers cette page. window.open(…, 'noopener') rend
     TOUJOURS null (norme HTML) : Bee disait « touche le bouton » alors que l'onglet était déjà
     ouvert, et un toucher en ouvrait un deuxième (audit complet 30.09, 9 apps sur 9). */
  function ouvrir(url) {
    var w = null;
    try { w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch (_) {} } } catch (_) { w = null; }
    return w;
  }

  /* LA PHRASE, SANS SES FIORITURES : « Bee, dis-moi quelle heure il est, s'il te plaît ? » →
     « quelle heure il est ». Les règles locales comparent la phrase ENTIÈRE : un mot trouvé au
     milieu d'une autre question ne la détourne plus (contre-audit 30.09 : « à quelle heure ferme le
     casino ? » donnait l'heure, « réécris ce message » ouvrait Apex, « les météorites » la météo). */
  function nettoie(text) {
    return String(text || '').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim()
      .replace(/^(?:(?:dis|hey|eh|ok|coucou)\s+)?(?:bee|bourricot|javis)\s*[,!:]?\s*/, '')
      .replace(/^(?:dis-moi|tu sais|sais-tu|tu peux me dire|peux-tu me dire|tu pourrais me dire)\s+/, '')
      .replace(/\s*,?\s*(?:s'il te pla[iî]t|stp|merci)\s*([?!.…]*)$/, '$1')
      .replace(/\s*[?!.…]+$/, '').trim();
  }
  var RE_HEURE = /^(?:quelle heure (?:est-il|il est|est il)|il est quelle heure|t'as l'heure|tu as l'heure|as-tu l'heure|donne-moi l'heure|l'heure qu'il est|l'heure)$/;
  var RE_DATE = /^(?:(?:on est|nous sommes|on se trouve) (?:quel jour|le combien)(?: aujourd'hui)?|quel jour (?:on est|sommes-nous|est-on|nous sommes|c'est|est-ce|aujourd'hui)(?: aujourd'hui)?|c'est quel jour(?: aujourd'hui)?|quelle (?:est la )?date(?: d'aujourd'hui| aujourd'hui| on est)?|quelle date sommes-nous|la date(?: d'aujourd'hui)?)$/;
  /* L'heure et la date : celles du téléphone, sans IA (« quelle heure est-il ? » partait à une IA
     qui ne connaît pas l'heure). Une question PLUS longue (« quelle heure est-il à New York ? »,
     « quel jour tombe Noël ? ») va à l'IA, qui connaît la date du jour (le serveur la lui donne). */
  function heureOuDate(t) {
    var d = new Date();
    if (RE_HEURE.test(t)) return 'Il est ' + d.getHours() + ' h ' + ('0' + d.getMinutes()).slice(-2) + '.';
    if (RE_DATE.test(t)) {
      var j = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()];
      var m = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][d.getMonth()];
      return 'On est ' + j + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + m + ' ' + d.getFullYear() + '.';
    }
    return '';
  }
  /* « ouvre / va sur / lance… » (poliment ou non) PUIS le nom de l'app, et RIEN après */
  var VERBE = "^(?:(?:tu peux|peux-tu|pourrais-tu|tu pourrais|je veux|j'aimerais|je voudrais)\\s+)?" +
    "(?:ouvre|ouvrir|va sur|vas sur|aller sur|montre|montrer|affiche|afficher|lance|lancer)(?:[- ](?:moi|nous))?\\s+" +
    "(?:(?:l[ae]s?|mon|ma|mes|le|l')\\s*)?(?:(?:app|appli|application|site)\\s+(?:de |d')?)?";
  var URL_3D = 'https://javis.kd-mc.com/3d.html';
  /* l'adresse suit la mascotte choisie (#bee / #bourricot) : la page 3D montre tout de suite LE bon personnage */
  function url3D() { return URL_3D + '#' + (mascCfg().id === 'bee' ? 'bee' : 'bourricot'); }
  var RE_3D = /^(?:(?:montre|affiche|fais voir|ouvre)(?:[- ](?:moi|toi|nous))?\s+)?(?:(?:toi|vous|bee|bourricot|les personnages|le personnage|bee et bourricot)\s+)?(?:en 3 ?d|en relief|en (?:r[ée]alit[ée]) augment[ée]e)$|^(?:la )?(?:3 ?d|r[ée]alit[ée] augment[ée]e)$|^pose[- ](?:toi|vous) chez moi$/;
  /* la météo : le mot « météo » ENTIER, ou une vraie question sur le temps qu'il fait */
  /* Kevin 3.10 (capture) : « Quel temps demain » n'était PAS reconnu (le motif exigeait « fait ») et partait à une IA qui répondait
     « je n'ai pas de données météo ». Ici : Monaco, aujourd'hui ou demain (réponse locale, 0 IA). Tout le reste — après-demain,
     un jour précis, la semaine, une autre ville — part à l'IA de Bee, qui a l'OUTIL météo (outils-lecture.js). */
  var RE_METEO_AILLEURS = /apr[eè]s|semaine|week-?end|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\bdans \d|(?:^|\s)(?:à|au|aux|en|pour|sur|près de)\s+(?!monaco\b|ce\b|cet\b|cette\b|ma\b|la\b|le\b|les\b|l')/;
  var CODES_MET = { 0: 'ciel dégagé', 1: 'plutôt dégagé', 2: 'partiellement nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard', 51: 'bruine', 53: 'bruine', 55: 'bruine', 56: 'bruine verglaçante', 57: 'bruine verglaçante',
    61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 66: 'pluie verglaçante', 67: 'pluie verglaçante', 71: 'neige faible', 73: 'neige', 75: 'forte neige', 77: 'grains de neige', 80: 'averses', 81: 'averses', 82: 'fortes averses', 85: 'averses de neige', 86: 'averses de neige', 95: 'orage', 96: 'orage et grêle', 99: 'orage et grêle' };
  var RE_METEO = /(?:^|[^a-zà-ÿ])m[eé]t[eé]o(?![a-zà-ÿ])|^quel temps(?: (?:aujourd'hui|demain|dehors|ici|ce soir|à monaco|en ce moment|maintenant))+$|^(?:il )?(?:fera|va faire)(?:-t-il)? (?:beau|chaud|froid|mauvais)(?: (?:aujourd'hui|demain|ce soir))?$|^quel temps (?:il )?(?:fait|fera|va faire|fera-t-il|fait-il)(?: (?:aujourd'hui|demain|dehors|ce soir|cet après-midi|ici|à monaco))?$|^(?:va-t-il|il va|est-ce qu'il va) pleuvoir(?: (?:aujourd'hui|demain|ce soir))?$|^il pleut(?: dehors)?$|^il fait (?:combien|chaud|froid)(?: dehors)?$|^quelle (?:est la )?température(?: dehors| qu'il fait| aujourd'hui| demain)?$|^combien de degrés(?: dehors| aujourd'hui| demain)?$/;
  /* une vraie ACTION sur ses données → Apex : ENVOYER un message, écrire un message À quelqu'un,
     changer le planning. « réécris ce message », « écris un poème » vont à l'IA. */
  var RE_APEX = /(?:^|\s)(?:envoie|envoyer|envoies)(?:[- ](?:lui|leur|moi))?\s.*\b(?:message|mail|e-mail|sms|texto)\b|(?:^|\s)(?:écris|écrire|ecris)(?:[- ](?:lui|leur))?\s.*\b(?:message|mail|e-mail|sms|texto)\b.*\sà\s|(?:^|\s)(?:modifie|change|échange|déplace)\b.*\bplanning\b|\bplanning\b.*\bmodifi/;

  /* ============================================================
     TA JOURNÉE (audit externe 02.10 : Bee « ne savait rien de Kevin »)
     ------------------------------------------------------------
     « je travaille quand ? », « avec qui ? », « je suis de repos samedi ? » : répondu avec le planning du
     PDF que le DOMAINE lit pour toi (/__javis/moi, réservé à Kevin) — 0 IA, 0 neurone, l'horaire exact.
     Une question plus libre (« je peux aller au resto samedi soir ? ») part à l'IA, qui reçoit les mêmes
     faits côté serveur. Bee ne devine jamais un horaire : sans planning, elle le dit.
     ============================================================ */
  var RE_JOURNEE = /\b(?:je (?:travaille|bosse|commence|finis|termine|suis de (?:service|repos|matin|soir|nuit)|suis en repos)|mon planning|mes horaires|mon horaire|mon service|mes repos|de repos|avec qui|mon [ée]quipe)\b/;
  var JOURS_SEM = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var _journee = null;
  function maJournee() {
    if (_journee && Date.now() - _journee.t < 300000) return Promise.resolve(_journee.j);
    var tok = ssoToken(), h = {};
    if (tok) h['x-kdmc-sso'] = tok;
    return fetch('/__javis/moi', { credentials: 'include', headers: h })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { if (j && j.ok) _journee = { t: Date.now(), j: j }; return j; })
      .catch(function () { return null; });
  }
  function joliNom(n) {   /* « DUPONT J » → « Dupont J. » (nom FICTIF : un vrai nom de collègue rend ce fichier privé à l'export public — 02.10) */
    return String(n || '').toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, function (_, a, b) { return a + b.toUpperCase(); })
      .replace(/ ([A-ZÀ-Ý])$/, ' $1.');
  }
  function liste(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]; }
  function maj(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function phraseJour(j, avecQui) {
    var t = maj(j.libelle) + ' : ' + j.texte;
    if (j.travail && avecQui && j.avec && j.avec.length) t += ', avec ' + liste(j.avec.map(joliNom));
    return /\.$/.test(t) ? t : t + '.';
  }
  /* Quel jour vise la question ? (index dans les 14 jours rendus par le domaine) */
  function jourVise(t, jours) {
    if (/apr[eè]s-demain/.test(t)) return 2;
    if (/demain/.test(t)) return 1;
    if (/aujourd'hui|ce soir|ce matin|cette nuit|maintenant|ce midi|tout à l'heure/.test(t)) return 0;
    for (var d = 0; d < 7; d++) {
      if (new RegExp('\\b' + JOURS_SEM[d] + '\\b').test(t)) {
        for (var k = 0; k < jours.length; k++) if (jours[k].libelle.indexOf(JOURS_SEM[d] + ' ') >= 0) return k;
      }
    }
    return -1;
  }
  function reponseJournee(t, j) {
    if (!j || !j.ok) return (j && j.reason === 'planning_absent')
      ? 'Ton planning de ce mois n\'est pas encore dans le domaine : je préfère ne rien inventer. Regarde dans CMCteams.'
      : 'Je n\'arrive pas à lire ton planning là. Réessaie dans un instant, ou regarde dans CMCteams.';
    var jours = j.jours || [], avecQui = /avec qui|[ée]quipe/.test(t), k = jourVise(t, jours), src = ' (d\'après le ' + j.source + ')';
    if (/[ée]quipe/.test(t) && k < 0) return 'Tu es en équipe ' + j.equipe + (j.miroir ? ', et ton équipe miroir est la ' + j.miroir : '') + '.' + src;
    if (k >= 0) return phraseJour(jours[k], true) + src;
    if (/repos/.test(t)) {
      var r = jours.slice(0, 7).filter(function (x) { return x.travail === false; }).map(function (x) { return x.libelle.replace(/^(aujourd'hui|demain), /, '$1 '); });
      return (r.length ? 'Tes prochains repos : ' + liste(r) + '.' : 'Pas de repos dans les 7 prochains jours.') + src;
    }
    var sem = jours.slice(0, 7).filter(function (x) { return x.travail; }).map(function (x) { return x.libelle.replace(/^(aujourd'hui|demain), /, '$1 ') + ' ' + x.texte; });
    var prochain = jours.filter(function (x) { return x.travail; })[0];
    return (sem.length ? 'Cette semaine tu travailles ' + liste(sem) + '.' : 'Tu ne travailles pas dans les 7 prochains jours.')
      + (avecQui && prochain ? ' ' + phraseJour(prochain, true) : '') + src;
  }
  /* Le bonjour du MATIN (une fois par jour, dans l'app) : ta journée + la météo de Monaco, sans rien demander.
     Météo : open-meteo (gratuit, sans clé, pas un appel au domaine), position de Monaco — aucune géolocalisation. */
  var STORAGE_BONJOUR = 'bee_bonjour_jour';
  function bonjourDuJour(root) {
    var auj = new Date().toDateString();
    try { if (localStorage.getItem(STORAGE_BONJOUR) === auj) return; localStorage.setItem(STORAGE_BONJOUR, auj); } catch (_) {}
    var meteo = fetch('https://api.open-meteo.com/v1/forecast?latitude=43.73&longitude=7.42&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=Europe%2FMonaco')
      .then(function (r) { return r.json(); }).catch(function () { return null; });
    Promise.all([maJournee(), meteo]).then(function (rs) {
      var j = rs[0], m = rs[1], morceaux = [];
      if (j && j.ok && j.jours && j.jours.length) {
        morceaux.push(phraseJour(j.jours[0], true));
        if (j.jours[1]) morceaux.push(phraseJour(j.jours[1], false));
      }
      var c = m && m.current, d = m && m.daily;
      if (c && c.temperature_2m != null) morceaux.push('Il fait ' + Math.round(c.temperature_2m) + '°C à Monaco' +
        (d && d.temperature_2m_max ? ' (jusqu\'à ' + Math.round(d.temperature_2m_max[0]) + '°C)' : '') + '.');
      if (morceaux.length) addBubble(root, 'javis', 'Ta journée 🐝 ' + morceaux.join(' '));
    });
  }

  function tryLocalIntent(text, respond, attente) {
    var t = nettoie(text);
    var hd = heureOuDate(t);
    if (hd) { respond(hd); return true; }
    /* EN 3D (Kevin 3.10 : « Modélise en 3D les personnages pour une réalité augmentée ») : « montre-toi en 3D »,
       « Bourricot en 3D », « réalité augmentée » → la page où on les tourne, les touche, et les pose chez soi */
    if (RE_3D.test(t)) {
      var w3 = ouvrir(url3D());
      respond((w3 ? 'Voilà ! ' : 'C\'est prêt, touche le bouton. ') + 'Tourne-nous du doigt, touche-nous, et sur iPhone « Le poser chez moi » nous met sur ta table.', w3 ? null : url3D());
      return true;
    }
    for (var pattern in DOMAIN_APPS) {
      if (new RegExp(VERBE + '(?:' + pattern + ')$', 'iu').test(t)) {
        var url = DOMAIN_APPS[pattern];
        /* Ouvert TOUT DE SUITE (dans le geste : sinon Safari iPhone bloque la fenêtre), et un
           VRAI bouton dans la bulle si la fenêtre a été bloquée (demande dictée à la voix). */
        var w = ouvrir(url);
        respond(w ? 'Je l\'ai ouverte dans un nouvel onglet.' : 'C\'est prêt, touche le bouton pour l\'ouvrir.', w ? null : url);
        return true;
      }
    }
    /* (après les apps : « affiche mon planning » OUVRE CMCteams) — une vraie question sur QUAND / AVEC QUI (pas « je travaille sur un projet »), et jamais une ACTION
       (« échange mon planning samedi » reste pour Apex) */
    if (RE_JOURNEE.test(t) && t.length <= 70 && !RE_APEX.test(t)
        && /quand|demain|aujourd'hui|ce soir|ce matin|cette nuit|semaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|avec qui|repos|planning|horaire|[ée]quipe|service/.test(t)) {
      if (attente) attente(true);
      maJournee().then(function (j) { respond(reponseJournee(t, j), j && j.ok ? null : 'https://cmcteams.kd-mc.com'); });
      return true;
    }
    if (RE_METEO.test(t) && !RE_METEO_AILLEURS.test(t)) {
      var demain = /demain/.test(t);
      /* elle MONTRE qu'elle cherche (audit externe 02.10, mesuré : 6 s de vide pendant que le
         téléphone cherche la position) — les petits points partent à la réponse */
      if (attente) attente(true);
      var give = function (lat, lon, place) {
        fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
              '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2&timezone=auto')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var ici = place ? ' à ' + place : '';
            var dy = j && j.daily, k = demain ? 1 : 0;
            var mx = dy && dy.temperature_2m_max && dy.temperature_2m_max[k], mn = dy && dy.temperature_2m_min && dy.temperature_2m_min[k];
            var ciel = dy && dy.weather_code && CODES_MET[dy.weather_code[k]];
            var pluie = dy && dy.precipitation_probability_max && dy.precipitation_probability_max[k];
            var jour = (mx != null && mn != null)
              ? ('entre ' + Math.round(mn) + ' et ' + Math.round(mx) + '°C' + (ciel ? ', ' + ciel : '') + (pluie != null ? ', risque de pluie ' + Math.round(pluie) + ' %' : '') + '.') : '';
            if (demain) {   /* « quel temps fera-t-il demain ? » : la prévision de DEMAIN, pas l'heure actuelle */
              return respond(jour ? ('Demain' + ici + ' : ' + jour) : 'Je n\'ai pas réussi à lire la prévision de demain, réessaie.');
            }
            var c = j && j.current;
            var temp = c ? Math.round(c.temperature_2m) : null;
            var cielNow = c && CODES_MET[c.weather_code];
            respond(temp !== null
              ? ('Il fait ' + temp + '°C' + ici + ' en ce moment' + (cielNow ? ', ' + cielNow : '') + '.' + (jour ? ' Aujourd\'hui : ' + jour : ''))
              : 'Je n\'ai pas réussi à lire la météo, réessaie.');
          })
          .catch(function () { respond('Météo indisponible là, réessaie.'); });
      };
      /* v1.18 (Kevin 06.10 « la localisation partout à chaque fois ») : Bee ne DEMANDE plus jamais la position — déjà accordée
         ici → elle s'en sert (arrondie à ~1 km, audit 30.09) ; sinon dernière position connue (6 h), sinon Monaco. */
      var monaco = function () { var m = null; try { m = JSON.parse(localStorage.getItem('javis_meteo_pos') || 'null'); } catch (_) { m = null; } if (m && Date.now() - m.t < 216e5) give(m.lat, m.lon, ''); else give(43.7325, 7.4197, 'Monaco'); };
      var gps = function () { navigator.geolocation.getCurrentPosition(function (pos) { var la = Math.round(pos.coords.latitude * 100) / 100, lo = Math.round(pos.coords.longitude * 100) / 100; try { localStorage.setItem('javis_meteo_pos', JSON.stringify({ lat: la, lon: lo, t: Date.now() })); } catch (_) { /* stockage plein */ } give(la, lo, ''); }, monaco, { timeout: 4000 }); };
      if (navigator.geolocation && navigator.permissions && typeof navigator.permissions.query === 'function') navigator.permissions.query({ name: 'geolocation' }).then(function (st) { if (st.state === 'granted') gps(); else monaco(); }, monaco); else monaco();
      return true;
    }
    if (RE_APEX.test(t)) {
      /* HONNÊTE (audit Bee 27.09) : la mémoire du navigateur est propre à CHAQUE adresse — Apex
         (apex-ai.kd-mc.com) ne voit pas ce que Bee range ici. Bee disait « ta question est déjà
         écrite » : c'était faux. On copie la phrase dans le presse-papiers, et on le DIT. */
      var dire = function (copie) {
        respond('Ça, c\'est Apex qui peut le faire : lui a accès à ton compte et peut vraiment agir. ' +
          (copie ? 'J\'ai copié ta phrase : dans Apex, touche le champ puis « Coller ».'
                 : 'Écris-lui ta demande là-bas.'), APEX + '/#chat');
      };
      ouvrir(APEX + '/#chat');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { dire(true); }, function () { dire(false); });
        } else { dire(false); }
      } catch (_) { dire(false); }
      return true;
    }
    return false;
  }

  /* ============================================================
     5. Chat — /__javis/ai (le domaine, réservé à Kevin ; Qwen gratuit d'abord)
     ============================================================ */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HIST) || '[]'); } catch (_) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(STORAGE_HIST, JSON.stringify(h.slice(-MAX_HISTORY))); } catch (_) {}
    filPousser();
  }
  /* LE FIL (Kevin : « mon assistant qui me suit dans chaque app ») : chaque app est une adresse différente, donc un téléphone-stockage différent.
     Le DOMAINE garde la conversation (/__javis/fil, Kevin seul) : on la lit à l'ouverture et on la renvoie après chaque échange.
     Sans réseau, sans être Kevin, ou en cas d'erreur : la conversation locale reste, rien ne casse. */
  var FIL_MAJ = 'javis_fil_maj', _filTimer = 0, _filEnCours = false;
  function filEntetes(json) {
    var h = {}; var tok = ssoToken(); if (tok) h['x-kdmc-sso'] = tok; if (json) h['Content-Type'] = 'application/json'; return h;
  }
  function filConnu() { return !!(window.__beeKevin || ssoToken() || /(?:^|;\s*)kdmc_k=1(?:;|$)/.test(document.cookie || '')); }
  function filPousser() {
    if (!filConnu()) return;
    clearTimeout(_filTimer);
    _filTimer = setTimeout(function () {
      _filTimer = 0;
      var corps = JSON.stringify({ fil: loadHistory().slice(-MAX_HISTORY) });
      fetch('/__javis/fil', { method: 'POST', credentials: 'include', headers: filEntetes(true), body: corps })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.ok) { try { localStorage.setItem(FIL_MAJ, String(j.maj)); } catch (_) {} } })
        .catch(function () { /* hors ligne : ce sera renvoyé au prochain échange */ });
    }, 700);
  }
  function filTirer(root) {
    if (!filConnu() || _filEnCours || _filTimer || (root && root._attente)) return;
    _filEnCours = true;
    fetch('/__javis/fil', { credentials: 'include', headers: filEntetes(false), cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        _filEnCours = false;
        if (!j || !j.ok || !Array.isArray(j.fil)) return;
        var connu = 0; try { connu = +localStorage.getItem(FIL_MAJ) || 0; } catch (_) {}
        if (!(j.maj > connu) || _filTimer || (root && root._attente)) return;   /* rien de plus récent, ou un échange est en train de partir */
        try { localStorage.setItem(FIL_MAJ, String(j.maj)); } catch (_) {}
        try { localStorage.setItem(STORAGE_HIST, JSON.stringify(j.fil.slice(-MAX_HISTORY))); } catch (_) {}
        var l = root && root.querySelector('#javis-msgs');
        if (l) { l.textContent = ''; j.fil.forEach(function (m) { addBubble(root, m.role === 'user' ? 'user' : 'javis', m.content); }); l.scrollTop = l.scrollHeight; }
      })
      .catch(function () { _filEnCours = false; });
  }
  function showTyping(root, on) {
    var list = root.querySelector('#javis-msgs');
    var t = list.querySelector('.javis-typing');
    if (on) {
      if (!t) {
        t = document.createElement('div');
        t.className = 'javis-typing';
        t.innerHTML = '<i></i><i></i><i></i>';
        list.appendChild(t);
        list.scrollTop = list.scrollHeight;
      }
    } else if (t) { t.remove(); }
  }

  var MAX_BULLES = 60;   /* le fil à l'écran ne grossit pas sans fin (mesuré : 61 bulles après 30 échanges) */
  /* Les adresses de SON domaine (https://xxx.kd-mc.com/…) deviennent des liens ; tout autre texte reste du texte (jamais de HTML, jamais d'autre site). */
  function lierLesAdresses(b) {
    try {
      var t = b.textContent, re = /https:\/\/(?:[a-z0-9-]+\.)*kd-mc\.com(?![\w-]|\.[a-z0-9-])(?:\/[^\s)»"']*)?/gi, m, last = 0, trouve = false, frag = document.createDocumentFragment();
      while ((m = re.exec(t))) {
        var u = m[0].replace(/[.,;:!?]+$/, '');
        if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
        var a = document.createElement('a');
        a.className = 'javis-lien'; a.href = u; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = u.replace(/^https:\/\//, '').replace(/\/$/, '');
        frag.appendChild(a); last = m.index + u.length; trouve = true;
      }
      if (!trouve) return;
      if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
      b.textContent = ''; b.appendChild(frag);
    } catch (_) { /* le texte brut reste */ }
  }
  function addBubble(root, role, text, lien) {
    var list = root.querySelector('#javis-msgs');
    var b = document.createElement('div');
    b.className = 'javis-bub ' + (role === 'user' ? 'me' : 'js');
    /* le gras/titres Markdown de l'IA ne s'affichent pas en « ** » bruts (texte seulement, jamais du HTML) */
    b.textContent = role === 'user' ? text : String(text).replace(/\*\*|__/g, '').replace(/^#{1,6}\s+/gm, '');
    if (role !== 'user') lierLesAdresses(b);   /* une adresse du domaine dans sa réponse devient un lien à toucher (règle Kevin : liens toujours cliquables) */
    if (lien && /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com(\/|$)/.test(lien)) {
      var a = document.createElement('a');
      a.className = 'javis-lien'; a.href = lien; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Ouvrir \u2197';
      b.appendChild(document.createElement('br')); b.appendChild(a);
    }
    list.appendChild(b);
    while (list.children.length > MAX_BULLES) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
    return b;
  }
  /* Session refusée en cours de route (403) : Face ID ICI, dans la bulle. Avant (audit complet 30.09),
     Bee disait « ferme et rouvre », mais l'identité n'était revérifiée qu'au chargement : même message
     en boucle. */
  function boutonFaceId(root, bulle) {
    var bt = document.createElement('button');
    bt.type = 'button'; bt.className = 'javis-lien'; bt.style.border = '0'; bt.style.cursor = 'pointer';
    bt.textContent = 'Face ID';
    bt.addEventListener('click', function () {
      bt.disabled = true;
      faceIdIci(function (ok, pourquoi) {
        bt.disabled = false;
        if (ok) { addBubble(root, 'javis', 'C\'est bon, je te reconnais. Repose ta question.'); bt.remove(); }
        else addBubble(root, 'javis', 'Face ID : ' + motSimple(pourquoi) + '. Tu peux réessayer.');
      });
    });
    bulle.appendChild(document.createElement('br')); bulle.appendChild(bt);
  }

  /* LA CARTE DE CONFIRMATION (Kevin 4.10 : « fais le bouton confirmation »). Bee PROPOSE ; rien ne part tant que Kevin n'a pas touché ✅.
     Le résumé vient du SERVEUR (il décrit ce qui sera VRAIMENT fait, pas ce que l'IA raconte) ; la proposition est signée et ne vaut que 5 minutes,
     une seule fois. Textes toujours posés par textContent, jamais en HTML. */
  function carteAction(root, p) {
    var list = root.querySelector('#javis-msgs'); if (!list || !p || !p.jeton) return;
    var c = document.createElement('div'); c.className = 'javis-carte' + (p.risque === 'eleve' ? ' eleve' : '');
    var t = document.createElement('div'); t.className = 'javis-carte-t'; t.textContent = (p.icone || '\u2699\uFE0F') + ' ' + String(p.titre || 'Action');
    var r = document.createElement('div'); r.className = 'javis-carte-r'; r.textContent = String(p.resume || '');
    var bs = document.createElement('div'); bs.className = 'javis-carte-b';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'javis-carte-ok'; ok.textContent = '\u2705 Confirmer';
    var non = document.createElement('button'); non.type = 'button'; non.className = 'javis-carte-non'; non.textContent = '\u2716 Annuler';
    var fin = document.createElement('div'); fin.className = 'javis-carte-f';
    bs.appendChild(ok); bs.appendChild(non);
    c.appendChild(t); c.appendChild(r); c.appendChild(bs); c.appendChild(fin);
    list.appendChild(c); list.scrollTop = list.scrollHeight;
    var fige = function (txt, bon) { ok.disabled = true; non.disabled = true; bs.style.display = 'none'; fin.textContent = txt; c.classList.add(bon ? 'fait' : 'clos'); list.scrollTop = list.scrollHeight; };
    var expire = setTimeout(function () { if (!ok.disabled) fige('\u23F3 Trop tard : redemande-le-moi.', false); }, 5 * 60 * 1000 - 5000);
    non.addEventListener('click', function () { clearTimeout(expire); fige('Annulé : rien n\'a été fait.', false); });
    ok.addEventListener('click', function () {
      ok.disabled = true; non.disabled = true; ok.textContent = '\u23F3 \u2026';
      clearTimeout(expire);
      var hd = { 'Content-Type': 'application/json' }, tok = ssoToken(); if (tok) hd['x-kdmc-sso'] = tok;
      fetch('/__javis/agir', { method: 'POST', credentials: 'include', headers: hd, body: JSON.stringify({ jeton: p.jeton, confirme: true }) })
        .then(function (r2) { return r2.json().catch(function () { return null; }).then(function (j2) { return { st: r2.status, j: j2 }; }); })
        .then(function (x) {
          var bon = !!(x.j && x.j.ok);
          var txt = (x.j && x.j.texte) || (x.st === 403 ? 'Je ne te reconnais plus : touche Face ID puis redemande.' : x.st === 429 ? 'Doucement, réessaie dans une minute.' : 'Ça n\'a pas marché (' + x.st + ').');
          fige(txt, bon);
          if (bon) { allRigs(root).forEach(function (rg) { react(rg, 'joie', 1200); }); tone([660, 880], .2); vibrate(8); }
          var h = loadHistory(); h.push({ role: 'assistant', content: (bon ? '[Action faite] ' : '[Action non faite] ') + String(p.resume || '').slice(0, 200) }); saveHistory(h);
        })
        .catch(function () { fige('Le réseau ne répond pas : rien n\'a été fait, redemande-le-moi.', false); });
    });
  }

  function askJavis(root, text) {
    if (root._attente) return false;          /* une réponse est déjà attendue : on ne mélange pas */
    addBubble(root, 'user', text);
    var hist = loadHistory();
    hist.push({ role: 'user', content: text });
    saveHistory(hist);
    /* askJavis rend true quand la question part (ou est traitée ici) */

    var handled = tryLocalIntent(text, function (reply, lien) {
      setThinking(root, false); showTyping(root, false);
      addBubble(root, 'javis', reply, lien);
      var h = loadHistory(); h.push({ role: 'assistant', content: reply }); saveHistory(h);
      speak(root, reply);
    }, function (on) { setThinking(root, on); showTyping(root, on); });
    if (handled) return true;
    root._attente = true;

    setThinking(root, true);
    showTyping(root, true);
    var messages = hist.slice(-10)
      .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant'); })
      .map(function (m) { return { role: m.role, content: m.content }; });
    var tok = ssoToken();
    var hdrs = { 'Content-Type': 'application/json' };
    if (tok) hdrs['x-kdmc-sso'] = tok;
    /* 25 s maximum : avant, les petits points « elle écrit… » pouvaient tourner à l'infini */
    var ctrlIa = null; try { ctrlIa = new AbortController(); } catch (_) {}
    var minuteurIa = setTimeout(function () { try { if (ctrlIa) ctrlIa.abort(); } catch (_) {} }, 25000);
    var statut = 0;
    fetch(AI_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: hdrs,
      signal: ctrlIa ? ctrlIa.signal : undefined,
      body: JSON.stringify({ messages: messages, mascotte: mascCfg().id, contexte: PAGE_CTX || undefined }),   /* Bourricot répond en Bourricot ; elle sait dans quelle app tu es */
    })
      .then(function (r) { statut = r.status; return r.json().catch(function () { return null; }); })
      .then(function (j) {
        root._attente = false;
        clearTimeout(minuteurIa);
        setThinking(root, false);
        showTyping(root, false);
        var ok = !!(j && j.ok && j.text);
        /* la CAUSE exacte, en mots simples (règle Kevin : détailler les erreurs) */
        var out = ok ? j.text
          : statut === 403 ? 'Je ne te reconnais plus (ta session a expiré). Touche Face ID : je te reconnais tout de suite.'
            : statut === 429 ? 'Doucement : beaucoup de questions d\'un coup. Attends une minute et repose-la.'
            : statut === 503 ? 'Aucune intelligence artificielle gratuite ne répond en ce moment (je n\'en appelle jamais de payante). Réessaie dans une minute.'
            : statut >= 500 ? 'Le domaine a un souci en ce moment (erreur ' + statut + '). Réessaie dans un instant.'
              : 'Je n\'ai pas réussi à répondre là, réessaie dans un instant.';
        var bulle = addBubble(root, 'javis', out);
        if (statut === 403) boutonFaceId(root, bulle);
        if (ok && j.propositions && j.propositions.length) j.propositions.slice(0, 3).forEach(function (p) { carteAction(root, p); });
        allRigs(root).forEach(function (r) { react(r, ok ? 'joie' : 'triste', ok ? 1200 : 1600); });
        if (ok) { tone([660, 880], .2); vibrate(8); }
        /* seule une VRAIE réponse entre dans la mémoire : un message d'erreur de Bee repartait à l'IA
           comme si elle l'avait dit (audit complet 30.09) */
        if (ok) { var h = loadHistory(); h.push({ role: 'assistant', content: out }); saveHistory(h); }
        speak(root, out);
      })
      .catch(function (e) {
        root._attente = false;
        clearTimeout(minuteurIa);
        setThinking(root, false);
        showTyping(root, false);
        allRigs(root).forEach(function (r) { react(r, 'triste', 1600); });
        addBubble(root, 'javis', (e && e.name === 'AbortError')
          ? 'Ça prend trop de temps (plus de 25 secondes). Réessaie, ou pose une question plus courte.'
          : 'Le réseau ne répond pas là, réessaie dans un instant.');
      });
    return true;
  }

  /* ============================================================
     5 bis. L'ATTITUDE — elle sait quelle heure il est, où elle est, et depuis
     combien de temps tu n'es pas venu. Elle ouvre la conversation elle-même.
     ============================================================ */
  var STORAGE_SEEN = 'javis_widget_last_seen';

  function moment() {
    var h = new Date().getHours();
    if (h < 6) return 'nuit';
    if (h < 12) return 'matin';
    if (h < 18) return 'aprem';
    return 'soir';
  }

  /* Où sommes-nous ? (pour qu'elle commente la page où elle apparaît) */
  function lieu() {
    var h = (location.hostname || '').toLowerCase();
    if (h.indexOf('arbre') === 0) return { nom: 'ton arbre de famille', quoi: 'Une question ? Je ne vois pas les fiches de l\'arbre, mais je peux t\'aider à chercher des idées.' };
    if (h.indexOf('lingua') === 0) return { nom: 'Lingua', quoi: 'Ma maison ! On révise un peu ?' };
    if (h.indexOf('cmcteams') === 0) return { nom: 'tes plannings', quoi: 'Besoin d\'un coup d\'oeil sur une équipe ?' };
    if (h.indexOf('apex') === 0) return { nom: 'Apex', quoi: 'Je te laisse la main, il fait les grosses actions.' };
    return { nom: 'ton domaine', quoi: 'Demande-moi ce que tu veux.' };
  }

  function salut() {
    var m = moment();
    var base = m === 'nuit' ? 'Tu veilles tard, Kevin 🌙'
      : m === 'matin' ? 'Bonjour Kevin ☀️'
        : m === 'aprem' ? 'Coucou Kevin 🐝'
          : 'Bonsoir Kevin 🌆';
    var absence = 0;
    try { absence = Date.now() - (parseInt(localStorage.getItem(STORAGE_SEEN), 10) || Date.now()); } catch (_) {}
    var jours = Math.floor(absence / 86400000);
    if (jours >= 2) return base + ' Ça fait ' + jours + ' jours ! Tu m\'as manqué 🍯';
    return base + ' On est sur ' + lieu().nom + '. ' + lieu().quoi;
  }

  /* Elle s'ennuie : petits gestes espacés tant que tu n'as pas ouvert le chat.
     3 fois maximum, puis elle se tient tranquille (pas de harcèlement). */
  function ennui(root) {
    var fois = 0;
    (function boucle() {
      setTimeout(function () {
        if (!document.contains(root)) return;
        var panel = root.querySelector('#javis-panel');
        var ouvert = panel && panel.classList.contains('javis-open');
        if (fois >= 3) return;                 /* 3 fois, puis elle se tient tranquille (la boucle s'arrête) */
        if (!ouvert) {
          fois++;
          var rig = root.querySelector('#javis-launcher .bee-rig');
          if (rig) {
            react(rig, 'coucou', 1400);
            move(rig, fois === 1 ? 'walk' : (fois === 2 ? 'jump' : 'dance'), 1500);
            if (fois === 1) bubble(lieu().quoi, 5000);
          }
        }
        boucle();
      }, 45000 + Math.random() * 40000);
    })();
  }

  /* ============================================================
     6. Montage
     ============================================================ */
  function mount() {
    injectStyles();
    var wrap = document.createElement('div');
    wrap.id = 'javis-root';
    wrap.innerHTML =
      '<button id="javis-launcher" type="button" aria-label="Parler à ' + mascCfg().nom + '">' + buildBeeRig(APP_MODE) + '</button>' +
      '<div id="javis-panel" role="dialog" aria-label="' + mascCfg().nom + '">' +
      '<div id="javis-head"><div class="javis-mini">' + buildBeeRig() + '</div>' +
      '<div><b>' + mascCfg().nom + '</b><span>Ton assistant' + MG('e', '') + ' · gratuit d\'abord</span></div>' +
      '<div id="javis-masc" role="group" aria-label="Choisir le personnage">' + boutonsMascottes() + '</div>' +
      '<button id="javis-close" type="button" aria-label="Fermer">✕</button></div>' +
      /* ON/OFF (règle Kevin) : couper la voix, effacer la conversation — et la version visible */
      '<div id="javis-outils"><button id="javis-voix" type="button" aria-pressed="true">\uD83D\uDD0A Voix</button>' +
      '<button id="javis-oublie" type="button">\uD83D\uDDD1 Effacer</button>' +
      '<button id="javis-info" type="button" aria-label="Où vont mes messages">\u2139\uFE0F</button>' +
      '<button id="javis-3d" type="button" aria-label="Me voir en 3D, en réalité augmentée">\uD83E\uDDF8 3D</button>' +
      '<button id="javis-ver" type="button" aria-label="Version de Bee, toucher pour mettre à jour">Bee ' + JAVIS_VER + ' \u21BB</button></div>' +
      '<div id="javis-msgs" role="log" aria-live="polite" aria-label="Conversation"></div>' +
      '<form id="javis-form"><textarea id="javis-input" aria-label="Ta question" placeholder="Demande-moi n\'importe quoi…" rows="1" maxlength="2000"></textarea>' +
      '<button id="javis-mic" type="button" aria-label="Dicter" aria-pressed="false">🎙</button>' +
      '<button id="javis-send" type="submit" aria-label="Envoyer">➤</button></form>' +
      '</div>';
    document.body.appendChild(wrap);
    if (APP_MODE) document.body.classList.add('javis-app');

    allRigs(wrap).forEach(function (r) { mascotAlive(r, { sommeil: 120000 }); });

    /* CHANGER DE PERSONNAGE SANS RECHARGER LA PAGE. On reconstruit les deux dessins (le
       bouton flottant et le petit portrait de l'en-tete), on les REMET EN VIE -- sinon on
       aurait une image fixe : la respiration, le clignement et le regard sont poses sur
       l'element, qui vient d'etre remplace -- et on remet la video au repos du nouveau
       personnage. Le choix est retenu pour les prochaines fois. */
    function changeMascotte(id) {
      try { localStorage.setItem(MASC_CLE, id); } catch (e) {}
      try { if (/\.?kd-mc\.com$/i.test(location.hostname)) document.cookie = 'kdmc_masc=' + id + '; Domain=.kd-mc.com; Path=/; Max-Age=31536000; Secure; SameSite=Lax'; } catch (e) {}
      var M = mascCfg();
      var lanceur = wrap.querySelector('#javis-launcher');
      /* l'ANCIENNE vidéo s'arrête vraiment (mesuré 27.09 : détachée de la page, elle continuait
         de jouer et de télécharger, pendant que le nouveau personnage ne bougeait plus) */
      var vieille = lanceur && lanceur.querySelector('.javis-vid');
      if (vieille) { try { vieille.pause(); vieille.removeAttribute('src'); vieille.load(); } catch (_) {} }
      if (VID.retour) { clearTimeout(VID.retour); VID.retour = 0; }
      var mini = wrap.querySelector('#javis-head .javis-mini');
      if (lanceur) { lanceur.innerHTML = buildBeeRig(APP_MODE); lanceur.setAttribute('aria-label', 'Parler à ' + M.nom); }
      if (mini) mini.innerHTML = buildBeeRig();
      var titre = wrap.querySelector('#javis-head b');
      if (titre) titre.textContent = M.nom;
      var sous = wrap.querySelector('#javis-head span');
      if (sous) sous.textContent = 'Ton assistant' + MG('e', '') + ' · gratuit d\'abord';
      var pan = wrap.querySelector('#javis-panel');
      if (pan) pan.setAttribute('aria-label', M.nom);
      var zone = wrap.querySelector('#javis-masc');
      if (zone) zone.innerHTML = boutonsMascottes();
      allRigs(wrap).forEach(function (r) { mascotAlive(r, { sommeil: 120000 }); });
      if (APP_MODE) {
        VID.pret = false; VID.absent = {};
        var g = wrap.querySelector('#javis-launcher .bee-rig');
        if (g) initVideo(g);
      }
    }
    var zoneMasc = wrap.querySelector('#javis-masc');
    if (zoneMasc) zoneMasc.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.javis-mpick') : null;
      if (!b) return;
      var id = b.getAttribute('data-masc');
      if (!id || id === mascCfg().id) return;
      changeMascotte(id);
      var r = wrap.querySelector('#javis-launcher .bee-rig');
      if (r) react(r, 'coucou', 1400);              /* il dit bonjour en arrivant */
    });
    /* Dans l'app : on branche la vraie vidéo, et elle vit d'elle-même entre deux phrases
       (elle vole, marche, danse) — porté de la vue Discussion de Lingua. */
    if (APP_MODE) {
      initVideo(wrap.querySelector('#javis-launcher .bee-rig'));
      (function vieLoop() {
        setTimeout(function () {
          if (!document.contains(wrap)) return;
          var calme = false;
          try { calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
          /* relu À CHAQUE tour : après un changement de personnage, l'ancien dessin n'existe plus */
          var gros = wrap.querySelector('#javis-launcher .bee-rig');
          var repos = Date.now() - DERNIER_GESTE > REPOS_CLIPS;
          if (VID.pret && gros && !calme && !repos && !document.hidden && !document.body.classList.contains('javis-closeup')) {
            var ks = ['fly', 'walk', 'dance'];
            clip(gros, ks[Math.floor(Math.random() * ks.length)], 2.6 + Math.random() * 1.8);
          }
          vieLoop();
        }, 9000 + Math.random() * 7000);
      })();
      /* page cachée : la vidéo s'arrête (elle continuait de jouer et de télécharger) */
      document.addEventListener('visibilitychange', function () {
        var v = wrap.querySelector('#javis-launcher .javis-vid');
        if (!v) return;
        try {
          if (document.hidden) { v.pause(); if (VID.retour) { clearTimeout(VID.retour); VID.retour = 0; } }
          else if (VID.pret) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } catch (_) {}
      });
    }
    /* le dernier geste : un toucher, une touche ou une question réveille Bee */
    ['pointerdown', 'keydown', 'focusin'].forEach(function (ev) { document.addEventListener(ev, gesteVu, { passive: true }); });
    (function repos() {
      setTimeout(function () {
        if (!document.contains(wrap)) return;
        var calme = Date.now() - DERNIER_GESTE;
        if (!document.hidden && calme > REPOS_ANIM && !document.body.classList.contains('javis-closeup')) {
          document.body.classList.add('javis-repos');
        }
        /* 2 min sans geste : la vidéo de repos s'arrête aussi (plus aucune image décodée) */
        var vr = wrap.querySelector('#javis-launcher .javis-vid');
        if (vr && calme > REPOS_CLIPS && !vr.paused) { try { vr.pause(); } catch (_) {} }
        repos();
      }, 5000);
    })();

    var panel = wrap.querySelector('#javis-panel');
    var form = wrap.querySelector('#javis-form');
    var input = wrap.querySelector('#javis-input');
    var mic = wrap.querySelector('#javis-mic');

    var hist = loadHistory();
    if (hist.length) {
      hist.forEach(function (m) { addBubble(wrap, m.role === 'user' ? 'user' : 'javis', m.content); });
    }
    /* Elle ouvre la conversation elle-même, avec l'heure et l'endroit (attitude). */
    addBubble(wrap, 'javis', salut());
    filTirer(wrap);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) filTirer(wrap); });
    try { localStorage.setItem(STORAGE_SEEN, String(Date.now())); } catch (_) {}
    if (APP_MODE) { panel.classList.add('javis-open'); } else { ennui(wrap); }
    if (APP_MODE && QUESTION_ADRESSE) setTimeout(function () { askJavis(wrap, QUESTION_ADRESSE); }, 300);
    if (APP_MODE && !QUESTION_ADRESSE) { suggestions(wrap); bonjourDuJour(wrap); }

    wrap.querySelector('#javis-launcher').addEventListener('click', function () {
      /* dans l'app, le panneau est toujours là : toucher Bee ne doit pas ouvrir le clavier */
      if (APP_MODE) return;
      panel.classList.toggle('javis-open');
      var ouvert = panel.classList.contains('javis-open');
      if (ouvert) {
        setTimeout(function () { input.focus(); }, 150);
        allRigs(wrap).forEach(function (r) { react(r, 'coucou', 1400); });
        tone([620, 820], .16);
        var b = document.querySelector('.javis-bubble'); if (b) b.remove();
      }
    });
    wrap.querySelector('#javis-close').addEventListener('click', function () {
      panel.classList.remove('javis-open');
    });
    /* Échap ferme le panneau (bouton flottant) */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !APP_MODE && panel.classList.contains('javis-open')) panel.classList.remove('javis-open');
    });
    /* 🔊 / 🔇 : la voix se coupe d'un toucher, et reste coupée (les tons aussi) */
    var bVoix = wrap.querySelector('#javis-voix');
    var majVoix = function () {
      var on = true; try { on = localStorage.getItem(STORAGE_VOICE) !== '0'; } catch (_) {}
      bVoix.setAttribute('aria-pressed', on ? 'true' : 'false');
      bVoix.textContent = on ? '\uD83D\uDD0A Voix' : '\uD83D\uDD07 Muette';
    };
    majVoix();
    bVoix.addEventListener('click', function () {
      var on = true; try { on = localStorage.getItem(STORAGE_VOICE) !== '0'; } catch (_) {}
      try { localStorage.setItem(STORAGE_VOICE, on ? '0' : '1'); } catch (_) {}
      if (on) { voixStop(); stopTalking(wrap); }
      majVoix();
    });
    brancherMaj(wrap);
    /* 🧸 3D (Kevin 3.10 : « même la petite fenêtre, partout où il y a le personnage… toujours en 3D partout ») : la porte de la 3D est dans la
       barre d'outils de TOUTES les Bee — l'app, et la petite fenêtre flottante de chaque site du domaine */
    wrap.querySelector('#javis-3d').addEventListener('click', function () {
      vibrate(10);
      var w3 = ouvrir(url3D());
      if (!w3) addBubble(wrap, 'javis', 'Touche le bouton pour nous voir en 3D.', url3D());
    });
    /* 🗑 : la conversation gardée sur ce téléphone est effacée */
    wrap.querySelector('#javis-oublie').addEventListener('click', function () {
      try { localStorage.removeItem(STORAGE_HIST); } catch (_) {}
      if (filConnu()) { fetch('/__javis/fil', { method: 'POST', credentials: 'include', headers: filEntetes(true), body: JSON.stringify({ effacer: true }) }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.ok) { try { localStorage.setItem(FIL_MAJ, String(j.maj)); } catch (_) {} } }).catch(function () {}); }
      voixStop(); stopTalking(wrap);
      var l = wrap.querySelector('#javis-msgs'); if (l) l.textContent = '';
      addBubble(wrap, 'javis', 'C\'est effacé. On repart de zéro !');
    });
    /* ℹ️ OÙ VONT MES MESSAGES (plan d'amélioration de l'audit, vie privée) : dit, en clair et sans
       rien cacher, qui voit quoi. Chaque phrase ici doit rester VRAIE (garde test:javis-bee). */
    wrap.querySelector('#javis-info').addEventListener('click', function () {
      /* Audit complet 30.09 : l'ancien texte taisait OpenAI (qui reçoit aussi des questions quand le
         gratuit manque), la position météo, la dictée et les durées de conservation. */
      addBubble(wrap, 'javis', 'Où vont tes messages : ta question part à ton domaine kd-mc.com, qui vérifie que c\'est bien toi. ' +
        'Il la confie à une IA GRATUITE (Qwen de Cloudflare, Groq, Gemini, Mistral, OpenRouter ou Cerebras) ; si aucune ne répond, je te le dis : je n\'appelle jamais d\'IA payante. ' +
        'Ma voix est fabriquée gratuitement par Google (Chirp), sinon par la voix gratuite de Cloudflare, sinon par la voix de ton téléphone — jamais par une voix payante. Ton domaine la garde jusqu\'à 400 jours (1 jour pour celle de Cloudflare), et ce téléphone jusqu\'à 1 an. ' +
        'Ton planning : ton domaine lit le PDF importé dans CMCteams, et c\'est lui qui me donne tes horaires ; « avec qui » est calculé chez toi, sans IA, et aucun nom de collègue n\'est jamais envoyé à une IA. ' +
        'La météo envoie ta position arrondie à 1 km à open-meteo (le bonjour du matin, lui, utilise Monaco). ' +
        'Quand je cherche pour toi : le nom d\'une ville part à open-meteo, tes mots de recherche partent à Wikipédia ou à Google Actualités, et l\'adresse d\'un lien que tu me donnes part à r.jina.ai (un lecteur de pages gratuit) — je ne fais que LIRE, je n\'écris nulle part. La dictée passe par le service vocal de ton téléphone. ' +
        'Pour AGIR (programmer un rappel, répondre à un message, retenir un fait, arrêter le robot), je prépare une carte : rien ne part tant que tu n\'as pas touché ✅ Confirmer, et seul toi peux le faire. Ce que tu me demandes de retenir est gardé sur ton domaine ; tu peux me demander de l\'oublier. ' +
        'Pour que je te suive d\'une app à l\'autre, ta conversation (les 40 derniers messages) est gardée sur ton domaine, visible par toi seul, et sur ce téléphone : Effacer la supprime PARTOUT, dans toutes les apps.');
    });
    /* clavier ouvert : la grosse Bee se fait petite (app), pour laisser lire la conversation */
    input.addEventListener('focus', function () { document.body.classList.add('javis-saisie'); });
    input.addEventListener('blur', function () { document.body.classList.remove('javis-saisie'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim();
      if (!v) return;
      var ch = wrap.querySelector('.javis-chips'); if (ch) ch.remove();
      if (askJavis(wrap, v) === false) {   /* texte gardé : renvoyable après la réponse */
        vibrate(30);
        /* Safari iPhone ne vibre pas : un signal VISIBLE, une seule fois (contre-audit 30.09) */
        var der = wrap.querySelector('#javis-msgs .javis-bub:last-child');
        if (!der || !der._patiente) { var pb = addBubble(wrap, 'javis', 'Une seconde : je réponds d\'abord à ta question précédente. La tienne reste dans le champ.'); pb._patiente = true; }
        return;
      }
      input.value = '';
      vibrate(6);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });

    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Recognition) {
      var rec = new Recognition();
      rec.lang = 'fr-FR';
      rec.interimResults = false;
      var micMinuteur = null;
      var micOff = function () { mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); wrap.classList.remove('javis-ecoute'); clearTimeout(micMinuteur); };
      mic.addEventListener('click', function () {
        if (mic.classList.contains('on')) { try { rec.stop(); } catch (_) {} return; }
        /* tu parles : Bee se TAIT (audit externe 02.10 : elle continuait de parler pendant ta dictée) */
        voixStop(); stopTalking(wrap);
        try {
          /* le micro a besoin d'une session « écoute » : la session « lecture » (mode silencieux) est
             rendue au système le temps de la dictée, et reprise à la prochaine phrase de Bee */
          try { if (navigator.audioSession && navigator.audioSession.type === 'playback') navigator.audioSession.type = 'auto'; } catch (_) {}
          rec.start(); mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true'); wrap.classList.add('javis-ecoute'); vibrate(12);
          /* jamais un micro allumé pour rien : arrêt tout seul au bout de 10 s */
          micMinuteur = setTimeout(function () { try { rec.stop(); } catch (_) {} micOff(); }, 10000);
        } catch (_) { micOff(); }
      });
      rec.onresult = function (e) {
        var t = e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript;
        if (t) { input.value = t; form.requestSubmit(); }
      };
      rec.onend = micOff;
      /* un micro qui échoue le DIT (avant : il s'éteignait sans un mot) */
      rec.onerror = function (e) {
        micOff();
        var c = e && e.error;
        if (c === 'aborted') return;
        addBubble(wrap, 'javis', (c === 'not-allowed' || c === 'service-not-allowed')
          ? 'Je n\'ai pas accès au micro. Sur iPhone : Réglages › Safari › Micro › Autoriser. En attendant, écris-moi.'
          : c === 'no-speech' ? 'Je n\'ai rien entendu. Touche 🎙 et parle juste après.'
            : 'Le micro n\'a pas marché cette fois. Écris-moi, ou réessaie.');
      };
    } else { mic.style.display = 'none'; }
  }

  /* ============================================================
     MISE À JOUR FORCÉE (Kevin 3.10 : « l'indicateur de version n'est pas cliquable pour mettre à jour. Maj auto
     forcée normalement » — règle MAJ AUTO FORCÉE TOUJOURS TOUS PROJETS). Bee n'avait NI l'un NI l'autre :
     le badge était un simple texte et rien ne relisait la version servie.
     - le badge est un bouton (44 px) : un toucher purge les copies gardées (service worker + caches) et recharge ;
     - la version servie est relue (les ~8 premiers Ko du fichier de Bee, jamais le fichier entier) à l'ouverture,
       au retour dans l'app, puis toutes les 2 min tant que l'écran est visible ;
     - dans l'APP (écran d'accueil) : plus récente → mise à jour toute seule, sauf pendant qu'on tape ou qu'elle parle ;
       sur une page de l'un de tes sites : le badge s'allume en doré (on ne recharge pas ta page sans te le demander).
     - garde-fou : jamais deux rechargements à moins de 90 s (une copie encore en cache ne fait pas boucler). */
  function verNum(v) { var g = String(v || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/); return g ? (+g[1] * 1e6 + +g[2] * 1e3 + +(g[3] || 0)) : 0; }
  function versionServie() {
    if (!SCRIPT_SRC || !window.fetch) return Promise.resolve('');
    var u = SCRIPT_SRC.split('?')[0] + '?_v=' + Date.now();
    return fetch(u, { cache: 'reload', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok || !r.body || !r.body.getReader) return r.ok ? r.text() : '';
      var rd = r.body.getReader(), dec = new TextDecoder(), txt = '';
      var lire = function () {
        return rd.read().then(function (x) {
          if (x.value) txt += dec.decode(x.value, { stream: true });
          var m = txt.match(/JAVIS_VER = '([^']+)'/);
          if (m || x.done || txt.length > 12000) { try { rd.cancel(); } catch (e) {} return txt; }
          return lire();
        });
      };
      return lire();
    }).then(function (t) { var m = String(t).match(/JAVIS_VER = '([^']+)'/); return m ? m[1] : ''; }).catch(function () { return ''; });
  }
  /* purge tout ce qui retient l'ancienne version, puis recharge avec un cache-buster (même méthode que Lingua) */
  function majForcee() {
    try { localStorage.setItem('javis_upd_ts', String(Date.now())); } catch (e) {}
    var fini = function () { try { location.replace(location.pathname + '?_upd=' + Date.now() + (location.hash || '')); } catch (e) { location.reload(); } };
    var p = Promise.resolve();
    if ('serviceWorker' in navigator) {
      p = p.then(function () { return navigator.serviceWorker.getRegistrations(); })
        .then(function (rs) { return Promise.all((rs || []).map(function (r) { return r.unregister().catch(function () {}); })); }).catch(function () {});
    }
    if (window.caches) {
      p = p.then(function () { return caches.keys(); })
        .then(function (ks) { return Promise.all((ks || []).map(function (k) { return caches.delete(k).catch(function () {}); })); }).catch(function () {});
    }
    p.then(fini, fini);
  }
  function brancherMaj(root) {
    var b = root.querySelector('#javis-ver'); if (!b) return;
    var neuve = '';
    var affiche = function () {
      if (neuve) { b.textContent = '\uD83D\uDD04 ' + neuve + ' \u2014 toucher'; b.classList.add('javis-ver-neuve'); }
      else { b.textContent = 'Bee ' + JAVIS_VER + ' \u21BB'; b.classList.remove('javis-ver-neuve'); }
    };
    var occupe = function () {
      var ae = document.activeElement, tag = ae && ae.tagName;
      var saisie = (tag === 'TEXTAREA' || tag === 'INPUT') && ae.value;
      return !!saisie || !!root.querySelector('.bee-rig.talk');
    };
    var verifier = function () {
      if (document.hidden) return;
      versionServie().then(function (v) {
        if (!v || verNum(v) <= verNum(JAVIS_VER)) { neuve = ''; affiche(); return; }
        neuve = v; affiche();
        var dernier = 0; try { dernier = +localStorage.getItem('javis_upd_ts') || 0; } catch (e) {}
        if (APP_MODE && Date.now() - dernier > 90000 && !occupe()) {
          b.textContent = '\uD83D\uDD04 Mise à jour\u2026';
          setTimeout(majForcee, 600);
        }
      });
    };
    b.addEventListener('click', function () {
      vibrate(10); b.textContent = '\uD83D\uDD04 Mise à jour\u2026'; b.disabled = true;
      setTimeout(majForcee, 250);
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) verifier(); });
    setInterval(verifier, 120000);
    setTimeout(verifier, 1500);
    window.__javisVerifierMaj = verifier;   /* pour les gardes (test:javis-bee) */
  }

  /* SUGGESTIONS (audit externe 02.10 : 45 % de l'écran vide sous le bonjour, et tout passait par le clavier) :
     trois boutons de 44 px qui posent la question à ta place ; ils partent dès que la conversation commence. */
  function suggestions(root) {
    var list = root.querySelector('#javis-msgs');
    if (!list || list.querySelector('.javis-chips')) return;
    var box = document.createElement('div');
    box.className = 'javis-chips'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Suggestions');
    [['🗓 Ma semaine', 'Je travaille quand cette semaine ?'], ['☀️ La météo', 'Quel temps fait-il ?'], ['🐝 Ma journée demain', 'Je travaille demain ?'], ['🧸 En 3D', 'Montre-toi en 3D']]
      .forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = s[0];
        b.addEventListener('click', function () { box.remove(); vibrate(10); askJavis(root, s[1]); });
        box.appendChild(b);
      });
    list.appendChild(box);
  }

  /* ============================================================
     7. Go — visibilité fail-closed (admin only), réseau fail-open
     ============================================================ */
  /* ÉCRAN DE VERROU — Kevin 26.09.2026, capture iPhone à 23h19 : « Impossible de me connecter ».
     L'ancien écran disait « connecte-toi d'abord sur le domaine, puis rouvre Bee » SANS bouton.
     Or sur iPhone une app posée sur l'écran d'accueil a ses cookies ISOLÉS : se connecter
     ailleurs ne sert à rien, et rouvrir Bee retombe au même endroit. C'était une impasse.
     Maintenant : la cause EXACTE (trois cas), et UN bouton qui va se connecter sur le domaine
     puis REVIENT ici avec le laissez-passer signé (#kdmc_sso=, que Bee sait lire). Le verdict
     ne change pas : sans identité prouvée, Bee reste fermée (fail-closed).
     Construit en DOM, jamais en innerHTML : l'adresse de retour vient de location. */
  function ecranVerrou(raison) {
    var TXT = {
      'inconnu': ['Bee ne te reconnaît pas ici',
        'Sur iPhone, une app posée sur l\'écran d\'accueil garde sa propre mémoire : ta connexion au domaine n\'arrive pas jusqu\'ici. Touche Face ID : Bee te reconnaît directement, puis toute seule les fois suivantes.'],
      'sans-faceid': ['Il manque Face ID',
        'Tu es bien connecté, mais sans Face ID. Bee est réservée à toi seul : elle demande la preuve Face ID. Touche Face ID, et c\'est ouvert.'],
      'pas-kevin': ['Bee est personnelle à Kevin',
        'Ce compte n\'est pas celui de Kevin : Bee reste fermée. Si c\'est toi, Kevin, touche Face ID.'],
      'muet': ['Le domaine ne répond pas',
        'Pas de réponse du domaine — réseau lent ou coupé. Réessaie dans un instant.'],
      'panne': ['Le domaine a un souci',
        'Il a répondu, mais par une erreur. Ce n\'est pas toi : réessaie dans un instant.']
    };
    var aFaceId = !!window.PublicKeyCredential;
    var installee = false;
    try { installee = !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); } catch (_) {}
    if (raison === 'inconnu' && !installee) {
      TXT.inconnu = ['Bee ne te reconnaît pas ici',
        aFaceId ? 'Touche Face ID : Bee te reconnaît directement, puis toute seule les fois suivantes.'
                : 'Touche « Me connecter » : tu reviens ici reconnu.'];
    } else if (raison === 'inconnu' && !aFaceId) {
      TXT.inconnu[1] = 'Sur iPhone, une app posée sur l\'écran d\'accueil garde sa propre mémoire. Touche « Me connecter » : tu reviens ici reconnu.';
    }
    var t = TXT[raison] || TXT.inconnu;
    var d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'min-height:100dvh;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:14px;padding:24px;text-align:center;background:#0e0a04;' +
      'color:#a4906a;font:15px/1.5 -apple-system,sans-serif';
    var ic = document.createElement('div'); ic.style.fontSize = '44px';
    ic.textContent = (raison === 'muet' || raison === 'panne') ? '\uD83D\uDCE1' : '\uD83D\uDD12';
    var b = document.createElement('b'); b.style.cssText = 'color:#f6b73c;font-size:17px';
    b.textContent = t[0];
    var p = document.createElement('p'); p.style.cssText = 'max-width:320px;margin:0';
    p.textContent = t[1];
    d.appendChild(ic); d.appendChild(b); d.appendChild(p);
    var PLEIN = 'display:inline-flex;align-items:center;justify-content:center;min-height:52px;' +
      'min-width:240px;padding:0 22px;border-radius:14px;background:#f6b73c;color:#1a1204;border:0;' +
      'font-weight:700;font-size:17px;text-decoration:none;margin-top:6px;font-family:inherit';
    var CREUX = PLEIN.replace('background:#f6b73c;color:#1a1204;border:0', 'background:transparent;color:#f6b73c;border:1px solid #6b5423')
      .replace('font-size:17px', 'font-size:15px');
    /* FACE ID SUR PLACE (Kevin 26.09 : « je suis normalement reconnu auto admin dans mon domaine et
       chaque app », puis « Oui aux 2 »). Mesuré : depuis l'app de l'écran d'accueil (stockage VIDE),
       passer par kd-mc.com menait à « Créer mon compte ». Le passkey de Kevin (rpId kd-mc.com,
       trousseau iCloud) marche ICI : on le prouve sans quitter Bee, le domaine vérifie la signature
       et rend une session FORTE, gardée 24 h dans CETTE app (laissez-passer admin, choix « B » de Kevin) → reconnu tout seul ensuite. */
    var faceId = (raison === 'inconnu' || raison === 'sans-faceid' || raison === 'pas-kevin') && aFaceId;
    if (faceId) {
      var f = document.createElement('button');
      f.id = 'bee-faceid'; f.type = 'button';
      f.style.cssText = PLEIN;
      f.textContent = '\uD83D\uDD13 Face ID';
      var err = document.createElement('p');
      err.id = 'bee-faceid-err';
      err.style.cssText = 'max-width:320px;margin:0;min-height:20px;color:#ff8a7a;font-size:14px';
      var lancer = function (auto) {
        f.disabled = true; f.textContent = '\u2026';
        faceIdIci(function (ok, pourquoi) {
          if (ok) {
            try { localStorage.setItem('bee_faceid_ok', '1'); } catch (_) {}
            location.reload();   /* rechargée : reconnue (le fragment #kdmc_sso est déjà retiré) */
            return;
          }
          f.disabled = false; f.textContent = '\uD83D\uDD13 Face ID';
          if (!auto) err.textContent = 'Face ID n\'a pas abouti (' + motSimple(pourquoi) + '). Réessaie, ou passe par kd-mc.com.';
        });
      };
      f.addEventListener('click', function () { lancer(false); });
      d.appendChild(f); d.appendChild(err);
      /* Déjà réussi une fois sur cet appareil → on le relance SANS attendre un toucher (session
         expirée au bout de 24 h). Si l'iPhone exige un toucher, rien ne s'affiche : le bouton reste. */
      var deja = false; try { deja = localStorage.getItem('bee_faceid_ok') === '1'; } catch (_) {}
      if (deja) setTimeout(function () { lancer(true); }, 300);
    }
    if (raison === 'pas-kevin') {
      /* Plus d'impasse : on oublie ce compte-là (le laissez-passer rangé ICI), et on recommence. */
      var o = document.createElement('button');
      o.id = 'bee-oublier'; o.type = 'button';
      o.style.cssText = CREUX;
      o.textContent = 'Changer de compte';
      o.addEventListener('click', function () {
        try { localStorage.removeItem('kdmc_sso_token'); localStorage.removeItem('bee_faceid_ok'); } catch (_) {}
        location.reload();
      });
      d.appendChild(o);
    } else if (raison === 'muet' || raison === 'panne') {
      var re = document.createElement('button');
      re.id = 'bee-connexion'; re.type = 'button';
      re.style.cssText = faceId ? CREUX : PLEIN;
      re.textContent = 'Réessayer';
      re.addEventListener('click', function () { location.reload(); });
      d.appendChild(re);
    } else {
      var a = document.createElement('a');
      a.id = 'bee-connexion';
      a.style.cssText = faceId ? CREUX : PLEIN;
      a.textContent = faceId ? 'Passer par kd-mc.com'
        : (raison === 'sans-faceid' ? 'Valider avec Face ID' : 'Me connecter');
      /* Retour vers CETTE page, sans fragment (un vieux #kdmc_sso ne doit pas repartir). */
      var ret = location.origin + location.pathname + location.search;
      a.href = 'https://kd-mc.com/?return=' + encodeURIComponent(ret);
      d.appendChild(a);
    }
    document.body.textContent = '';
    document.body.appendChild(d);
  }

  /* Face ID prouvé AUPRÈS DU DOMAINE, depuis cette page (/__sso/* est servi par le routeur sur
     chaque adresse). Sans uid connu : le passkey du trousseau se présente lui-même, son userHandle
     porte l'uid ; le domaine vérifie la signature avec la clé qu'IL a enregistrée. Bee ne décide
     rien : elle range le laissez-passer rendu, puis redemande /__sso/whoami au rechargement. */
  /* Ce que Kevin LIT quand Face ID échoue : jamais le message technique (anglais, JSON…) —
     mesuré 27.09 : « Unexpected token '<' … is not valid JSON », « The relying party ID is not a
     registrable domain suffix… », « Failed to fetch ». Le détail part dans la console. */
  function motSimple(p) {
    p = String(p || '');
    if (p === 'annulé') return 'annulé';
    if (p === 'aucun compte sur ce Face ID' || /passkey inconnu|inconnu/i.test(p)) return 'ce Face ID n\'est pas lié à ton compte';
    if (/fetch|network|réseau|indisponible|json|token/i.test(p)) return 'le domaine ne répond pas';
    if (p === 'non disponible') return 'Face ID n\'est pas disponible ici';
    return 'refusé';
  }
  function faceIdIci(cb) {
    function versBuf(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
      var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
    function versB64u(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    var fini = false;
    var fin = function (ok, pourquoi) {
      if (fini) return; fini = true;
      if (!ok) { try { console.warn('[Bee] Face ID :', pourquoi); } catch (_) {} }
      cb(ok, pourquoi || '');
    };
    var POST = { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } };
    try {
      fetch('/__sso/webauthn/auth/options', Object.assign({ body: '{"uid":""}' }, POST))
        .then(function (r) { return r.json(); })
        .then(function (o) {
          if (!o || !o.ok) throw new Error('domaine indisponible');
          return navigator.credentials.get({ publicKey: { challenge: versBuf(o.challenge), rpId: o.rpId,
            userVerification: 'required', timeout: 60000 } });
        })
        .then(function (cred) {
          var a = cred.response, uid = '';
          try { uid = new TextDecoder().decode(a.userHandle); } catch (_) {}
          if (!uid) throw new Error('aucun compte sur ce Face ID');
          return fetch('/__sso/webauthn/auth/verify', Object.assign({ body: JSON.stringify({ uid: uid, credId: cred.id,
            clientDataJSON: versB64u(a.clientDataJSON), authenticatorData: versB64u(a.authenticatorData),
            signature: versB64u(a.signature) }) }, POST)).then(function (r) { return r.json(); });
        })
        .then(function (j) {
          if (!(j && j.ok && j.token)) return fin(false, (j && j.reason) || 'refusé');
          try { localStorage.setItem('kdmc_sso_token', j.token); } catch (_) {}
          fin(true);
        })
        .catch(function (e) { fin(false, (e && (e.name === 'NotAllowedError' ? 'annulé' : e.message)) || 'échec'); });
    } catch (e) { fin(false, 'non disponible'); }
  }

  function boot() {
    checkAdmin(function (isAdmin, raison) {
      /* le « Bee arrive… » part dès que le domaine a tranché (avant : écran noir entre 0,9 s et le verdict) */
      try { var bt = document.getElementById('boot'); if (bt) bt.remove(); } catch (_) {}
      if (!isAdmin) {
        /* Sur une page normale : rien du tout, la page reste intacte.
           Dans l'app dédiée : on le DIT, sinon écran noir inexplicable. */
        if (window.JAVIS_MODE === 'app') ecranVerrou(raison);
        /* Dans le cadre d'une autre app : on s'efface (le parent retire le cadre) ; si c'est bien un AUTRE compte qui est reconnu ici, on retire le marqueur */
        if (CADRE) { if (raison === 'pas-kevin') marqueur(false); versParent('cache'); }
        return;
      }
      marqueur(true);                  /* cet appareil est celui de Kevin : les autres apps le sauront */
      window.__beeKevin = 1;           /* le domaine vient de le prouver : le fil de la conversation peut se synchroniser */
      armerAudio();
      mount();
      if (CADRE) {
        /* le parent redimensionne le cadre selon l'état du panneau (fermé = la pastille, ouvert = le chat) */
        try {
          var pn = document.getElementById('javis-panel');
          if (pn && window.MutationObserver) new MutationObserver(function () { var o = pn.classList.contains('javis-open'); document.documentElement.classList.toggle('javis-ouvert', o); versParent(o ? 'ouvert' : 'ferme'); }).observe(pn, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}
        versParent('pret');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ============================================================================
   LA MARIONNETTE (v1.17, Kevin 3.10 « tout le corps bouge… partout, toujours ») — tout
   le corps de Bee et de Bourricot bouge : oreilles, antennes, bras, jambes, queue, tête.
   ⚠ NE PAS MODIFIER ICI : la source est tools/javis/marionnette.js, recopiée entre les
   deux repères par `npm run sync:javis` (et aussi vers lingua/marionnette.js). La garde
   test:marionnette refuse une copie qui diverge.
   ========================================================================== */
/*<marionnette>*/
/* ============================================================================
 * MARIONNETTE — Bee et Bourricot bougent de TOUT LEUR CORPS (Kevin 2026-10-03 :
 * « je veux que tout le corps bouge, bras jambes oreilles etc pour Bee et Bourricot,
 * partout, toujours. Vrai petit personnage animé. »)
 *
 * LE PROBLÈME : leurs dessins sont UNE image plate (lingua/<mascotte>/rig/base.webp).
 * Avant, seuls les paupières, la bouche et les ailes (deux calques à part) bougeaient ;
 * le reste du corps était une photo qu'on faisait respirer d'un bloc.
 *
 * LA SOLUTION (même principe que Live2D / Spine, sans rien payer ni rien redessiner) :
 * l'image est posée sur un MAILLAGE (une grille de petits triangles) et chaque partie
 * du corps reçoit un OS — oreilles, antennes, tête, mèche, bras, jambes, queue.
 * Chaque point de la grille sait à quel(s) os il appartient, avec un fondu doux entre
 * deux os : quand un bras tourne autour de l'épaule, la peau autour suit en souplesse.
 * Comme l'image entière se déforme d'un seul tenant, il n'y a JAMAIS de trou (le fond
 * crème est uni, sa légère déformation ne se voit pas).
 *
 * UN SEUL FICHIER, PARTOUT : la source est ici (tools/javis/marionnette.js). `npm run
 * sync:javis` le recopie DANS le widget Bee (toutes les pages du domaine + l'app Javis)
 * et à côté de Lingua (lingua/marionnette.js). Il ne touche à rien d'autre : il trouve
 * tout seul chaque `img.rig-base` de la page, glisse un <canvas> dessus et lit l'humeur
 * sur les classes déjà posées par les apps (talk, mv-dance, rx-joie, dort…).
 *
 * SOBRE (règles « gratuit », « iPhone », « performe ») :
 *  - UN SEUL contexte WebGL pour toute la page (iOS en limite le nombre) ; chaque
 *    personnage a un simple canvas 2D qui reçoit sa copie ;
 *  - rien ne tourne si la page est cachée, si le personnage est hors écran, si l'app
 *    l'a mis en pause (body.javis-repos) ou s'il joue une vidéo (.vid) ;
 *  - 30 images/s pour un petit personnage (bouton flottant), 60 au-delà ;
 *  - « réduire les animations » (réglage iPhone) : on respecte, il reste immobile ;
 *  - pas de WebGL, image qui ne charge pas, contexte perdu : on retire le canvas, le
 *    dessin d'avant revient tel quel. Jamais d'écran vide.
 * ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.KdmcMarionnette) return;
  var VERSION = '2.0';
  /* D'où vient CE script : le moteur 3D (perso3d.js) est posé juste à côté, au même endroit — que la marionnette soit
     chargée seule (Lingua : lingua/marionnette.js) ou embarquée dans le widget (n'importe quelle page du domaine). */
  var SRC_ICI = '';
  try { SRC_ICI = (document.currentScript && document.currentScript.src) || ((document.querySelector('script[src*="marionnette.js"],script[src*="javis-widget.js"]') || {}).src) || ''; } catch (_) {}

  /* ---------------------------------------------------------------------------
     1. LES SQUELETTES — mesurés à la main sur chaque dessin (image 1024 × 1024).
        a = point d'attache (épaule, base de l'oreille…), le reste = le tracé de la
        partie (polyligne) et son épaisseur r. cote : -1 côté gauche de l'écran, +1
        côté droit. sens 'haut' (oreille, antenne) ou 'bas' (bras, jambe) : sert à
        traduire « ouvre-toi vers l'extérieur » dans le bon sens de rotation.
        L'ORDRE COMPTE : les petites parties d'abord (elles prennent leurs points en
        premier), le corps ensuite, la tête avant le corps.
     ------------------------------------------------------------------------- */
  var SQUELETTES = {
    /* Bee « vive » (bee/v2) : antennes en crosse, poing sur la poitrine à gauche,
       bras tendu à droite, deux jambes courtes. */
    'bee/v2': {
      os: [
        { id: 'antG', parent: 'tete', a: [432, 165], trace: [[432, 165], [372, 82], [290, 70], [262, 110]], r: 34, f: 22, cote: -1, sens: 'haut', type: 'antenne' },
        { id: 'antD', parent: 'tete', a: [552, 152], trace: [[552, 152], [600, 55], [665, 22], [710, 55]], r: 34, f: 22, cote: 1, sens: 'haut', type: 'antenne' },
        { id: 'meche', parent: 'tete', a: [490, 170], trace: [[490, 170], [500, 112]], r: 42, f: 18, cote: 0, sens: 'haut', type: 'meche' },
        { id: 'brasG', parent: 'corps', a: [395, 588], trace: [[395, 588], [350, 650], [440, 650]], r: 52, f: 26, cote: -1, sens: 'bas', type: 'bras', bornes: [-4, 9] },
        { id: 'brasD', parent: 'corps', a: [650, 590], trace: [[650, 590], [800, 585]], r: 44, f: 24, cote: 1, sens: 'bas', type: 'bras', bornes: [-10, 24] },
        { id: 'jambeG', parent: 'corps', a: [430, 835], trace: [[430, 835], [395, 945], [345, 955]], r: 48, f: 22, cote: -1, sens: 'bas', type: 'jambe' },
        { id: 'jambeD', parent: 'corps', a: [600, 835], trace: [[600, 835], [635, 945], [690, 955]], r: 48, f: 22, cote: 1, sens: 'bas', type: 'jambe' },
        { id: 'oeilG', parent: 'visage', a: [423, 357], ellipse: [423, 357, 104, 88], f: 22, type: 'oeil', cote: -1 },
        { id: 'oeilD', parent: 'visage', a: [614, 356], ellipse: [614, 356, 100, 88], f: 22, type: 'oeil', cote: 1 },
        { id: 'machoire', parent: 'visage', a: [522, 440], ellipse: [522, 494, 62, 26], f: 18, type: 'machoire', amp: 0.024 },
        { id: 'visage', parent: 'tete', a: [518, 400], ellipse: [518, 400, 205, 125], f: 40, type: 'visage' },
        { id: 'tete', parent: 'corps', a: [510, 535], ellipse: [510, 335, 245, 225], f: 34, type: 'tete' },
        { id: 'corps', parent: null, a: [512, 915], ellipse: [515, 720, 200, 185], f: 40, type: 'corps' }
      ]
    },
    /* Bee « douce » (bee) : grosse tête ronde, bras le long du corps. */
    'bee': {
      os: [
        { id: 'antG', parent: 'tete', a: [392, 160], trace: [[392, 160], [340, 95], [295, 80]], r: 36, f: 22, cote: -1, sens: 'haut', type: 'antenne' },
        { id: 'antD', parent: 'tete', a: [632, 160], trace: [[632, 160], [680, 95], [728, 78]], r: 36, f: 22, cote: 1, sens: 'haut', type: 'antenne' },
        { id: 'meche', parent: 'tete', a: [510, 130], trace: [[510, 130], [512, 70]], r: 60, f: 18, cote: 0, sens: 'haut', type: 'meche' },
        { id: 'brasG', parent: 'corps', a: [335, 655], trace: [[335, 655], [295, 765]], r: 46, f: 24, cote: -1, sens: 'bas', type: 'bras' },
        { id: 'brasD', parent: 'corps', a: [688, 655], trace: [[688, 655], [728, 765]], r: 46, f: 24, cote: 1, sens: 'bas', type: 'bras' },
        { id: 'jambeG', parent: 'corps', a: [425, 865], trace: [[425, 865], [420, 935]], r: 52, f: 20, cote: -1, sens: 'bas', type: 'jambe' },
        { id: 'jambeD', parent: 'corps', a: [598, 865], trace: [[598, 865], [600, 935]], r: 52, f: 20, cote: 1, sens: 'bas', type: 'jambe' },
        { id: 'oeilG', parent: 'visage', a: [367, 380], ellipse: [367, 380, 92, 88], f: 22, type: 'oeil', cote: -1 },
        { id: 'oeilD', parent: 'visage', a: [656, 383], ellipse: [656, 383, 92, 90], f: 22, type: 'oeil', cote: 1 },
        { id: 'machoire', parent: 'visage', a: [510, 480], ellipse: [510, 540, 64, 28], f: 20, type: 'machoire', amp: 0.026 },
        { id: 'visage', parent: 'tete', a: [511, 450], ellipse: [511, 450, 235, 150], f: 44, type: 'visage' },
        { id: 'tete', parent: 'corps', a: [512, 600], ellipse: [512, 370, 292, 255], f: 36, type: 'tete' },
        { id: 'corps', parent: null, a: [512, 920], ellipse: [512, 760, 200, 150], f: 40, type: 'corps' }
      ]
    },
    /* Bourricot (donkey) : grandes oreilles, mèche, bras, jambes, queue à touffe. */
    'donkey': {
      os: [
        { id: 'oreilleG', parent: 'tete', a: [335, 262], trace: [[335, 262], [290, 160], [238, 62]], r: 66, f: 26, cote: -1, sens: 'haut', type: 'oreille' },
        { id: 'oreilleD', parent: 'tete', a: [688, 262], trace: [[688, 262], [738, 160], [800, 62]], r: 66, f: 26, cote: 1, sens: 'haut', type: 'oreille' },
        { id: 'meche', parent: 'tete', a: [500, 290], trace: [[500, 290], [500, 150]], r: 82, f: 22, cote: 0, sens: 'haut', type: 'meche' },
        { id: 'queue', parent: 'corps', a: [712, 808], trace: [[712, 808], [752, 782], [792, 728]], r: 38, f: 18, cote: 1, sens: 'haut', type: 'queue', bornes: [-14, 24] },
        { id: 'brasG', parent: 'corps', a: [348, 695], trace: [[348, 695], [322, 812]], r: 50, f: 24, cote: -1, sens: 'bas', type: 'bras' },
        { id: 'brasD', parent: 'corps', a: [652, 695], trace: [[652, 695], [676, 822]], r: 50, f: 24, cote: 1, sens: 'bas', type: 'bras', bornes: [-8, 15] },   /* la queue est juste derrière : au-delà, le bras « rentre » dedans */
        { id: 'jambeG', parent: 'corps', a: [420, 875], trace: [[420, 875], [415, 958]], r: 50, f: 20, cote: -1, sens: 'bas', type: 'jambe' },
        { id: 'jambeD', parent: 'corps', a: [578, 875], trace: [[578, 875], [582, 958]], r: 50, f: 20, cote: 1, sens: 'bas', type: 'jambe' },
        { id: 'oeilG', parent: 'visage', a: [390, 451], ellipse: [390, 451, 58, 66], f: 18, type: 'oeil', cote: -1 },
        { id: 'oeilD', parent: 'visage', a: [594, 449], ellipse: [594, 449, 60, 68], f: 18, type: 'oeil', cote: 1 },
        { id: 'machoire', parent: 'visage', a: [498, 590], ellipse: [498, 646, 100, 34], f: 22, type: 'machoire', amp: 0.028 },
        { id: 'visage', parent: 'tete', a: [494, 525], ellipse: [494, 525, 175, 135], f: 40, type: 'visage' },
        { id: 'tete', parent: 'corps', a: [500, 650], ellipse: [500, 460, 255, 205], f: 34, type: 'tete' },
        { id: 'corps', parent: null, a: [500, 945], ellipse: [500, 775, 175, 150], f: 40, type: 'corps' }
      ]
    }
  };
  /* LES 12 IMAGES FIXES de Lingua (salut, fête, lecture, doigt levé — pour chaque dessin) :
     elles bougent elles aussi, chacune avec SON geste (la main qui fait coucou, les bras
     levés qui dansent, le pied qui tape en lisant, le doigt qui s'agite), et les ailes
     battent. Mesurées une à une sur une grille (3.10), coordonnées ramenées à 1024.
     g = le bras qui fait le geste ; les autres membres vivent leur vie. */
  function cap(id, parent, a, trace, r, extra) {
    var o = { id: id, parent: parent, a: a, trace: trace, r: r, f: 22, cote: id.charAt(id.length - 1) === 'G' ? -1 : 1, sens: 'haut' };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function fixe(haut, bras, jambes, autres, tete, corps, pose) {
    var t = haut === 'oreille' ? 'oreille' : 'antenne';
    return { pose: pose, os: [].concat(
      autres.ant.map(function (x, i) { return cap((t === 'oreille' ? 'oreille' : 'ant') + (i ? 'D' : 'G'), 'tete', x[0], x, t === 'oreille' ? 66 : 34, { type: t }); }),
      [cap('meche', 'tete', autres.meche[0], autres.meche, autres.mecheR || 50, { type: 'meche', cote: 0 })],
      autres.queue ? [cap('queueD', 'corps', autres.queue[0], autres.queue, 42, { type: 'queue', f: 18 })] : [],
      bras.map(function (x, i) { return cap('bras' + (i ? 'D' : 'G'), 'corps', x.t[0], x.t, x.r || 48, { type: 'bras', geste: !!x.g, f: 24 }); }),
      jambes.map(function (x, i) { return cap('jambe' + (i ? 'D' : 'G'), 'corps', x.t[0], x.t, x.r || 48, { type: 'jambe', tape: !!x.tape }); }),
      /* Une aile ne bat que si aucun bras ne passe DEVANT elle : sinon le bras qui bouge et l'aile
         qui bat tirent le même bout de dessin dans deux sens et il se plie (mesuré : 14 triangles
         retournés sur « fête »). Donc pas d'ailes à la fête (bras levés devant), et pas d'aile du
         côté du bras qui fait le geste. */
      (autres.ailes || []).map(function (x, i) { return cap('aile' + (i ? 'D' : 'G'), 'corps', x.a, x.t, 78, { type: 'aile', f: 30 }); })
        .filter(function (o, i) { return pose !== 'fete' && !(bras[i] && bras[i].g); }),
      [{ id: 'tete', parent: 'corps', a: tete.a, ellipse: tete.e, f: 34, type: 'tete' },
       { id: 'corps', parent: null, a: corps.a, ellipse: corps.e, f: 40, type: 'corps' }]) };
  }
  var F = SQUELETTES;
  function rond(S) { S.rond = true; return S; }
  /* — Bee vive (bee/v2) — */
  F['bee/v2:wave'] = rond(fixe('antenne',
    [{ t: [[340, 615], [325, 670], [410, 655]] }, { t: [[667, 627], [760, 560], [853, 453]], g: 1 }],
    [{ t: [[413, 853], [380, 920], [320, 960]] }, { t: [[600, 867], [620, 930], [680, 960]] }],
    { ant: [[[427, 147], [370, 80], [300, 50], [265, 95]], [[553, 133], [600, 60], [660, 35], [710, 60]]], meche: [[493, 150], [493, 80]],
      ailes: [{ a: [387, 627], t: [[110, 420], [387, 627], [230, 700]] }, { a: [667, 627], t: [[900, 390], [667, 627], [810, 700]] }] },
    { a: [513, 547], e: [513, 347, 250, 200] }, { a: [513, 930], e: [513, 747, 187, 173] }, 'salut'));
  F['bee/v2:party'] = rond(fixe('antenne',
    [{ t: [[387, 573], [250, 470], [160, 380]], r: 52 }, { t: [[640, 573], [770, 470], [850, 380]], r: 52 }],
    [{ t: [[400, 820], [300, 800], [250, 860]], r: 50 }, { t: [[560, 830], [590, 900], [600, 940]], r: 50 }],
    { ant: [[[427, 127], [360, 70], [293, 40]], [[573, 120], [650, 70], [720, 53]]], meche: [[493, 120], [493, 60]],
      ailes: [{ a: [387, 667], t: [[147, 440], [387, 667], [253, 693]] }, { a: [640, 667], t: [[907, 440], [640, 667], [747, 693]] }] },
    { a: [513, 560], e: [513, 360, 260, 217] }, { a: [513, 940], e: [513, 773, 180, 165] }, 'fete'));
  F['bee/v2:read'] = rond(fixe('antenne',
    [{ t: [[320, 667], [400, 773]] }, { t: [[667, 667], [760, 733]] }],
    [{ t: [[400, 880], [360, 933]], r: 52 }, { t: [[700, 800], [787, 853]], r: 55, tape: 1 }],
    { ant: [[[427, 140], [340, 90], [253, 80]], [[573, 133], [640, 80], [707, 73]]], meche: [[507, 150], [507, 95]],
      ailes: [{ a: [320, 600], t: [[120, 387], [320, 600], [200, 667]] }, { a: [667, 600], t: [[920, 387], [667, 600], [747, 693]] }] },
    { a: [493, 600], e: [493, 400, 277, 227] }, { a: [520, 960], e: [520, 827, 200, 160] }, 'lecture'));
  F['bee/v2:point'] = rond(fixe('antenne',
    [{ t: [[333, 667], [267, 800]] }, { t: [[680, 640], [760, 590], [805, 470]], g: 1, r: 46 }],
    [{ t: [[400, 880], [340, 950]] }, { t: [[580, 880], [650, 955]] }],
    { ant: [[[407, 133], [320, 100], [233, 100]], [[547, 127], [620, 70], [707, 60]]], meche: [[493, 145], [493, 95]],
      ailes: [{ a: [347, 613], t: [[120, 400], [347, 613], [240, 693]] }, { a: [680, 613], t: [[867, 400], [680, 613], [787, 693]] }] },
    { a: [493, 610], e: [493, 373, 273, 233] }, { a: [507, 930], e: [507, 760, 175, 160] }, 'montre'));
  /* — Bee douce (bee) — */
  F['bee:wave'] = fixe('antenne',
    [{ t: [[307, 640], [260, 580], [230, 520]], g: 1, r: 50 }, { t: [[667, 667], [727, 813]] }],
    [{ t: [[400, 880], [400, 950]], r: 50 }, { t: [[577, 880], [580, 950]], r: 50 }],
    { ant: [[[387, 167], [340, 95], [285, 70]], [[627, 167], [680, 95], [727, 73]]], meche: [[513, 140], [513, 80]], mecheR: 60,
      ailes: [{ a: [320, 640], t: [[147, 507], [320, 640], [253, 693]] }, { a: [667, 640], t: [[853, 520], [667, 640], [760, 693]] }] },
    { a: [513, 630], e: [513, 387, 293, 247] }, { a: [487, 930], e: [487, 787, 193, 147] }, 'salut');
  F['bee:party'] = fixe('antenne',
    [{ t: [[320, 627], [230, 500], [170, 400]], r: 55 }, { t: [[707, 613], [800, 500], [860, 400]], r: 55 }],
    [{ t: [[413, 840], [400, 900], [430, 920]], r: 50 }, { t: [[620, 820], [700, 800], [750, 810]], r: 50 }],
    { ant: [[[400, 167], [350, 110], [307, 80]], [[620, 160], [670, 110], [713, 80]]], meche: [[513, 150], [513, 93]], mecheR: 60,
      ailes: [{ a: [333, 667], t: [[187, 573], [333, 667], [267, 693]] }, { a: [680, 667], t: [[840, 573], [680, 667], [747, 707]] }] },
    { a: [513, 650], e: [513, 427, 273, 240] }, { a: [507, 900], e: [507, 773, 190, 150] }, 'fete');
  F['bee:read'] = fixe('antenne',
    [{ t: [[330, 680], [400, 780]] }, { t: [[680, 680], [740, 760]] }],
    [{ t: [[460, 880], [427, 907]], r: 52 }, { t: [[680, 820], [740, 880]], r: 55, tape: 1 }],
    { ant: [[[400, 173], [350, 120], [293, 93]], [[627, 173], [680, 120], [733, 87]]], meche: [[513, 140], [513, 80]], mecheR: 60,
      ailes: [{ a: [320, 627], t: [[160, 507], [320, 627], [227, 680]] }, { a: [693, 627], t: [[867, 507], [693, 627], [787, 667]] }] },
    { a: [513, 650], e: [513, 440, 293, 263] }, { a: [507, 960], e: [507, 853, 200, 140] }, 'lecture');
  F['bee:point'] = fixe('antenne',
    [{ t: [[307, 720], [240, 827]] }, { t: [[693, 693], [790, 620], [860, 470], [870, 410]], g: 1, r: 46 }],
    [{ t: [[400, 890], [400, 950]], r: 50 }, { t: [[587, 890], [590, 950]], r: 50 }],
    { ant: [[[387, 160], [330, 100], [273, 67]], [[613, 160], [670, 110], [727, 80]]], meche: [[513, 150], [513, 93]], mecheR: 60,
      ailes: [{ a: [320, 667], t: [[133, 533], [320, 667], [240, 707]] }, { a: [680, 667], t: [[840, 560], [680, 667], [747, 720]] }] },
    { a: [513, 640], e: [513, 427, 297, 233] }, { a: [513, 930], e: [513, 800, 190, 150] }, 'montre');
  /* — Bourricot (donkey) — */
  F['donkey:wave'] = fixe('oreille',
    [{ t: [[333, 747], [290, 800]], r: 50 }, { t: [[627, 720], [720, 640], [790, 545]], g: 1, r: 55 }],
    [{ t: [[400, 880], [395, 940]], r: 50 }, { t: [[585, 880], [590, 940]], r: 50 }],
    { ant: [[[320, 267], [270, 160], [235, 55]], [[667, 267], [740, 160], [800, 60]]], meche: [[495, 250], [505, 130]], mecheR: 85,
      queue: [[690, 815], [740, 800], [795, 750]] },
    { a: [487, 640], e: [487, 480, 240, 203] }, { a: [480, 950], e: [480, 827, 180, 140] }, 'salut');
  F['donkey:party'] = fixe('oreille',
    [{ t: [[333, 667], [250, 580], [195, 505]], r: 55 }, { t: [[667, 653], [740, 570], [790, 495]], r: 55 }],
    [{ t: [[400, 820], [330, 810], [290, 820]], r: 55 }, { t: [[620, 840], [680, 880], [700, 900]], r: 55 }],
    { ant: [[[333, 267], [290, 160], [255, 60]], [[667, 267], [730, 160], [765, 70]]], meche: [[493, 260], [500, 140]], mecheR: 85,
      queue: [[700, 773], [730, 720], [760, 680]] },
    { a: [493, 640], e: [493, 467, 247, 193] }, { a: [493, 940], e: [493, 800, 165, 140] }, 'fete');
  F['donkey:read'] = fixe('oreille',
    [{ t: [[300, 720], [260, 760]] }, { t: [[560, 720], [540, 770]] }],
    [{ t: [[330, 840], [280, 880]], r: 55, tape: 1 }, { t: [[560, 860], [533, 907]], r: 55 }],
    { ant: [[[327, 260], [285, 160], [245, 65]], [[667, 267], [745, 160], [805, 65]]], meche: [[493, 260], [500, 150]], mecheR: 90,
      queue: [[740, 870], [780, 800], [815, 745]] },
    { a: [500, 650], e: [493, 480, 245, 207] }, { a: [507, 960], e: [507, 853, 200, 150] }, 'lecture');
  F['donkey:point'] = fixe('oreille',
    [{ t: [[320, 693], [250, 620], [205, 550], [190, 510]], g: 1, r: 50 }, { t: [[627, 773], [673, 853]], r: 50 }],
    [{ t: [[413, 880], [410, 945]], r: 50 }, { t: [[560, 880], [565, 945]], r: 50 }],
    { ant: [[[327, 253], [285, 150], [245, 60]], [[653, 260], [740, 150], [805, 60]]], meche: [[500, 260], [505, 150]], mecheR: 85,
      queue: [[700, 840], [750, 800], [795, 740]] },
    { a: [487, 650], e: [487, 480, 240, 207] }, { a: [487, 950], e: [487, 827, 165, 140] }, 'montre');

  /* L'image d'un personnage → son squelette. Lingua écrit « bee/v2/rig/base.webp »,
     le widget « https://lingua.kd-mc.com/bee/v2/rig/base.webp » : on lit la fin. */
  function squeletteDe(src) {
    var s = String(src || ''), m = s.match(/(bee\/v2|bee|donkey)\/rig\/base\.webp(?:[?#].*)?$/);
    if (m) return m[1];
    m = s.match(/(bee\/v2|bee|donkey)\/(wave|party|read|point)\.webp(?:[?#].*)?$/);
    return m ? m[1] + ':' + m[2] : '';
  }

  /* ---------------------------------------------------------------------------
     2. LE MAILLAGE ET LES POIDS (calculés UNE fois par squelette)
     ------------------------------------------------------------------------- */
  var N = 52;                                   /* 53 × 53 points, 5 408 triangles */
  /* Le maillage DÉBORDE du cadre (MARGE de chaque côté) : seul l'anneau extérieur, hors
     de la vue, est cloué. Une antenne qui touche le haut du dessin peut donc bouger sans
     se déchirer contre un bord immobile ; ce qui déborde reprend la couleur du bord de
     l'image (le fond crème), invisible. */
  var MARGE = 0.35;
  function lisse(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function distSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    var t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    var x = ax + t * dx - px, y = ay + t * dy - py;
    return Math.sqrt(x * x + y * y);
  }
  /* Appartenance brute (0..1) d'un point à une partie : 1 dedans, fondu sur f pixels. */
  /* halo = 0 : la partie elle-même (fondu sur f pixels) ; halo > 0 : la zone de fond
     autour, qui la suit de moins en moins sur `halo` pixels. */
  function brut(o, x, y, halo) {
    var d;
    if (o.ellipse) {
      var e = o.ellipse, nx = (x - e[0]) / e[2], ny = (y - e[1]) / e[3];
      d = (Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(e[2], e[3]);   /* ≈ distance au bord, en pixels */
    } else {
      var best = 1e9, t = o.trace;
      for (var i = 0; i + 1 < t.length; i++) best = Math.min(best, distSeg(x, y, t[i][0], t[i][1], t[i + 1][0], t[i + 1][1]));
      d = best - o.r;
    }
    if (!halo) return 1 - lisse(0, o.f, d);
    return 1 - lisse(o.f, o.f + halo, d);           /* continu avec la partie : pas de marche */
  }
  function preparer(nom) {
    var S = SQUELETTES[nom];
    if (S._pret) return S;
    var os = S.os, idx = {}, i, j, k;
    for (i = 0; i < os.length; i++) idx[os[i].id] = i;
    for (i = 0; i < os.length; i++) os[i].p = os[i].parent ? idx[os[i].parent] : -1;
    /* Ordre de calcul des transformations : un parent avant ses enfants. */
    var ordre = [], vu = {};
    function visite(n) { if (vu[n]) return; vu[n] = 1; if (os[n].p >= 0) visite(os[n].p); ordre.push(n); }
    for (i = 0; i < os.length; i++) visite(i);
    var nv = (N + 1) * (N + 1), pos = new Float32Array(nv * 2), uv = new Float32Array(nv * 2);
    var poids = new Float32Array(nv * os.length);
    for (j = 0; j <= N; j++) for (i = 0; i <= N; i++) {
      var gx = -MARGE + i / N * (1 + 2 * MARGE), gy = -MARGE + j / N * (1 + 2 * MARGE);
      var v = j * (N + 1) + i, x = gx * 1024, y = gy * 1024;
      uv[v * 2] = gx; uv[v * 2 + 1] = gy;
      pos[v * 2] = gx; pos[v * 2 + 1] = gy;
      /* L'anneau extérieur (hors de la vue) ne bouge jamais. */
      if (i === 0 || j === 0 || i === N || j === N) continue;
      var reste = 1;
      for (k = 0; k < os.length && reste > 0; k++) {
        var w = brut(os[k], x, y, 0) * reste;
        poids[v * os.length + k] = w; reste -= w;
      }
      /* Le FOND autour d'une partie la suit un peu (halo large) : sans ça, une oreille
         qui se penche « rentre » dans un fond immobile, les triangles se replient et
         l'oreille paraît coupée net (vu sur la planche du 3.10). Le halo ne prend que
         ce qui reste après toutes les parties : il ne déforme que le fond, uni. */
      /* Partage du fond entre les halos : au plus PROCHE d'abord (puissance 4), pas par
         ordre de liste — sinon le halo d'un bras « volait » le fond collé à la tête et le
         cisaillait (mesuré : plis au bord de la tête). */
      if (reste > 0.001) {
        var hs = [], somme = 0, hmax = 0;
        for (k = 0; k < os.length; k++) {
          var hk = brut(os[k], x, y, os[k].ellipse ? 150 : 240);
          hs[k] = hk * hk * hk * hk; somme += hs[k]; if (hk > hmax) hmax = hk;
        }
        if (somme > 0) for (k = 0; k < os.length; k++) poids[v * os.length + k] += reste * hmax * hs[k] / somme;
      }
      /* Dessin découpé en ROND (Bee vive, images fixes) : le bord du cercle ne bouge pas,
         sinon on verrait le cadre se tordre. */
      if (S.rond) {
        var dc = Math.sqrt((x - 512) * (x - 512) + (y - 512) * (y - 512)), garde = 1 - lisse(440, 500, dc);
        for (k = 0; k < os.length; k++) poids[v * os.length + k] *= garde;
      }
    }
    var tri = new Uint16Array(N * N * 6), t = 0;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      tri[t++] = a; tri[t++] = b; tri[t++] = c; tri[t++] = b; tri[t++] = d; tri[t++] = c;
    }
    S.iTete = -1; S.iVisage = -1;
    for (i = 0; i < os.length; i++) { if (os[i].type === 'tete') S.iTete = i; if (os[i].type === 'visage') S.iVisage = i; }
    S.ordre = ordre; S.base = pos; S.uv = uv; S.poids = poids; S.tri = tri; S.nv = nv; S._pret = true;
    return S;
  }

  /* ---------------------------------------------------------------------------
     3. L'HUMEUR → LA POSE. Lue sur les classes que les apps posent DÉJÀ.
        Chaque os reçoit un angle (degrés) ; « ouvre » = vers l'extérieur / vers le
        haut, converti par cote+sens. Tout est en fonction du temps : il ne s'arrête
        jamais complètement (Kevin : « toujours »), même au repos.
     ------------------------------------------------------------------------- */
  function humeur(el) {
    var c = el ? (' ' + el.className + ' ') : '';
    function a(n) { return c.indexOf(' ' + n + ' ') >= 0; }
    if (a('dort')) return 'dort';
    if (a('rx-joie')) return 'joie';
    if (a('rx-coucou')) return 'coucou';
    if (a('rx-triste')) return 'triste';
    if (a('rx-reflechit') || a('think')) return 'pense';
    if (a('rx-poke')) return 'poke';
    if (a('mv-dance')) return 'danse';
    if (a('mv-jump')) return 'saute';
    if (a('mv-walk')) return 'marche';
    if (a('mv-fly')) return 'vole';
    if (a('talk')) return 'parle';
    return 'repos';
  }
  /* Une image fixe garde SON geste (coucou, fête, lecture, doigt levé) ; un toucher la fait
     sauter de joie (Lingua pose hop / pop / spin) ou secouer la tête (shake). */
  function humeurDe(e) {
    var h = humeur(e.rig), pose = e.S.pose;
    if (!pose) return h;
    var c = ' ' + e.rig.className + ' ';
    if (/ (hop|pop|spin) /.test(c) || h === 'joie' || h === 'danse' || h === 'saute') return 'fete';
    if (/ shake /.test(c) || h === 'triste') return 'secoue';   /* mauvaise réponse : il secoue la tête */
    return pose;                                   /* une image fixe ne dort pas : elle garde son geste */
  }
  var S1 = Math.sin, PI2 = Math.PI * 2;
  /* JUSQU'OÙ une partie peut s'ouvrir (degrés) sans que le dessin se torde : MESURÉ sur
     les planches de contrôle (3.10). Au-delà, l'image autour s'étire et ça se voit :
     ventre qui tourbillonne, oreille qui bave. Un os peut avoir ses propres bornes. */
  var BORNES = { oreille: [-12, 16], antenne: [-14, 16], meche: [-6, 6], queue: [-26, 28],
                 bras: [-8, 28], jambe: [-12, 12] };
  /* Raideur et amortissement des parties molles (ressort) : [k, c]. */
  var MOU = { oreille: [95, 9], antenne: [150, 8], queue: [70, 7], meche: [120, 10] };
  /* Les humeurs des IMAGES FIXES donnent des angles « directs » autour de la pose dessinée
     (un coucou = aller-retour de part et d'autre), d'où des bornes symétriques. */
  var FIXES = { salut: 1, fete: 1, lecture: 1, montre: 1, secoue: 1 };
  var BORNES_FIXES = { bras: [-16, 16], jambe: [-10, 10], aile: [-8, 8], oreille: [-14, 14], antenne: [-16, 16],
                       queue: [-24, 24], meche: [-6, 6] };
  function borne(o, v, fixe) {
    var b = fixe || o.type === 'aile' ? BORNES_FIXES[o.type] : (o.bornes || BORNES[o.type]);
    return b ? Math.max(b[0], Math.min(b[1], v)) : v;
  }
  /* « ouvre » d'un os, au repos, selon son type ; les tics sont des petits gestes
     spontanés (une oreille qui frémit, la queue qui fouette) tirés au hasard. */
  function poseRepos(o, t, ph, tic) {
    switch (o.type) {
      case 'oreille': return 4 * S1(t * 1.3 + ph) + tic * 16;
      case 'antenne': return 6 * S1(t * 1.9 + ph) + tic * 12;
      case 'meche': return 3 * S1(t * 2.3 + ph);
      case 'queue': return 14 * S1(t * 2.1 + ph) + tic * 22;
      case 'bras': return 4 + 4 * S1(t * 1.1 + ph) + tic * 10;
      case 'jambe': return 1.5 * S1(t * 0.9 + ph);
      default: return 0;
    }
  }
  /* Les yeux selon l'humeur : largeur, hauteur, inclinaison (degrés, vers l'extérieur), et où va le regard. */
  var EXPRESSIONS = {
    repos: { sx: 1, sy: 1, r: 0, vx: 0, vy: 0 },
    parle: { sx: 1.03, sy: 1.04, r: 0, vx: 0, vy: 0 },
    joie: { sx: 1.06, sy: 0.80, r: -4, vx: 0, vy: -0.3 }, fete: { sx: 1.06, sy: 0.80, r: -4, vx: 0, vy: -0.3 },
    danse: { sx: 1.04, sy: 0.88, r: -2, vx: 0, vy: 0 },
    coucou: { sx: 1.05, sy: 0.9, r: 0, vx: 0.4, vy: 0 }, salut: { sx: 1.05, sy: 0.92, r: 0, vx: 0.35, vy: 0 },
    poke: { sx: 1.12, sy: 1.16, r: 0, vx: 0, vy: 0 },          /* surprise : yeux écarquillés */
    triste: { sx: 0.97, sy: 0.88, r: 7, vx: 0, vy: 0.55 },     /* regard qui tombe */
    secoue: { sx: 0.98, sy: 0.9, r: 5, vx: 0, vy: 0.3 },
    pense: { sx: 1.0, sy: 0.94, r: -3, vx: -0.6, vy: -0.7 },   /* il lève les yeux pour réfléchir */
    montre: { sx: 1.08, sy: 1.08, r: 0, vx: 0.5, vy: -0.2 },
    lecture: { sx: 1.0, sy: 0.92, r: 0, vx: 0.2, vy: 0.6 },    /* les yeux dans le livre */
    dort: { sx: 1.0, sy: 0.85, r: 4, vx: 0, vy: 0.3 },
    saute: { sx: 1.08, sy: 1.1, r: 0, vx: 0, vy: -0.2 }, vole: { sx: 1.04, sy: 1.04, r: 0, vx: 0, vy: 0.3 }, marche: { sx: 1, sy: 1, r: 0, vx: 0.3, vy: 0 }
  };
  var NIV = 0.5;                                  /* volume de la voix, mis à jour à chaque image */
  function cible(o, h, t, ph, tic) {
    var r = poseRepos(o, t, ph, tic), ty = o.type, alt = o.cote < 0 ? 0 : Math.PI;
    /* les ailes (dessinées dans les images fixes) battent toujours, plus vite à la fête */
    if (ty === 'aile') return h === 'dort' ? 0 : (h === 'fete' || h === 'danse' || h === 'joie' ? 7 : 5) * S1(t * (h === 'fete' ? 22 : 15) + alt);
    switch (h) {
      case 'salut':                                        /* la main qui fait coucou */
        if (ty === 'bras') return o.geste ? 10 * S1(t * 7) : r * 0.5;
        if (ty === 'jambe') return 2 * S1(t * 1.5 + alt);
        return r;
      case 'fete':                                         /* bras levés qui dansent, pieds qui gigotent */
        if (ty === 'bras') return 6 * S1(t * 7 + alt);             /* les mains levées frôlent la tête : petit geste */
        if (ty === 'jambe') return 9 * S1(t * 7 + alt);
        if (ty === 'oreille' || ty === 'antenne') return 10 * S1(t * 7 + ph);
        if (ty === 'queue') return 14 * S1(t * 9);
        return r;
      case 'lecture':                                      /* le livre ne bouge pas ; un pied tape */
        if (ty === 'bras') return 1.2 * S1(t * 1.1);
        if (ty === 'jambe') return o.tape ? 7 * Math.max(0, S1(t * 5)) : 0;
        if (ty === 'oreille' || ty === 'antenne') return r * 0.6;
        if (ty === 'queue') return r * 0.7;
        return r * 0.5;
      case 'secoue':
        return r * 0.3;
      case 'montre':                                       /* le doigt levé s'agite */
        if (ty === 'bras') return o.geste ? 7 * S1(t * 11) : r * 0.4;
        if (ty === 'jambe') return 1.5 * S1(t * 1.2 + alt);
        return r;
      case 'parle':
        if (ty === 'bras') return 8 + (8 + 12 * NIV) * S1(t * 5.2 + alt);
        if (ty === 'oreille' || ty === 'antenne') return r + 5 * S1(t * 6.5 + ph);
        return r;
      case 'danse':
        if (ty === 'bras') return 38 + 26 * S1(t * 6 + alt);
        if (ty === 'jambe') return 12 * S1(t * 6 + alt);
        if (ty === 'oreille' || ty === 'antenne') return 14 * S1(t * 6 + ph);
        if (ty === 'queue') return 26 * S1(t * 8);
        return r;
      case 'saute': {
        var k = 0.5 + 0.5 * S1(t * PI2 / 0.85);
        if (ty === 'bras') return 20 + 40 * k;
        if (ty === 'jambe') return -10 * k;
        if (ty === 'oreille' || ty === 'antenne') return -10 * k + 4;
        return r;
      }
      case 'marche':
        if (ty === 'jambe') return 15 * S1(t * PI2 / 0.8 + alt);
        if (ty === 'bras') return 6 + 16 * S1(t * PI2 / 0.8 + alt + Math.PI);
        if (ty === 'oreille' || ty === 'antenne') return r + 4 * S1(t * PI2 / 0.4);
        return r;
      case 'vole':
        if (ty === 'jambe') return 8 + 8 * S1(t * 2.4 + alt);
        if (ty === 'bras') return 22 + 10 * S1(t * 2.4 + alt);
        if (ty === 'antenne' || ty === 'oreille') return -14 + 6 * S1(t * 3 + ph);
        return r;
      case 'joie':
        if (ty === 'bras') return 52 + 16 * S1(t * 9 + alt);
        if (ty === 'oreille' || ty === 'antenne') return -6 + 8 * S1(t * 9 + ph);
        if (ty === 'jambe') return 6 * S1(t * 9 + alt);
        if (ty === 'queue') return 30 * S1(t * 10);
        return r;
      case 'coucou':
        if (ty === 'bras' && o.cote > 0) return 48 + 22 * S1(t * 11);
        return r;
      case 'triste':
        if (ty === 'oreille') return 34;
        if (ty === 'antenne') return 22;
        if (ty === 'bras') return -2;
        if (ty === 'queue') return -10;
        return r * 0.3;
      case 'pense':
        if (ty === 'bras' && o.cote < 0) return 30;
        if (ty === 'oreille' || ty === 'antenne') return (o.cote < 0 ? -10 : 12) + 3 * S1(t * 1.4);
        return r * 0.6;
      case 'dort':
        if (ty === 'oreille') return 24 + 2 * S1(t * 0.8 + ph);
        if (ty === 'antenne') return 16 + 2 * S1(t * 0.8 + ph);
        if (ty === 'bras') return 0;
        return r * 0.25;
      case 'poke':
        if (ty === 'oreille' || ty === 'antenne') return -16;
        if (ty === 'bras') return 26;
        return r;
      default: return r;
    }
  }
  /* Le tronc et la tête : un balancement, une respiration, un hochement en parlant. */
  function poseTronc(h, t, niveau) {
    var p = { corps: 1.4 * S1(t * 0.9), tete: 2.6 * S1(t * 0.7 + 1), souffle: 0.016 * S1(t * PI2 / 3.8), dy: 0 };
    if (h === 'parle') { p.tete += 3.2 * S1(t * 7.5) * (0.4 + niveau); p.corps += 1.2 * S1(t * 3.1); p.souffle = 0.012 * niveau; }
    else if (h === 'danse') { p.corps = 7 * S1(t * 6); p.tete = -6 * S1(t * 6); }
    else if (h === 'marche') { p.corps = 3 * S1(t * PI2 / 0.8); p.dy = -0.006 * Math.abs(S1(t * PI2 / 0.8)); }
    else if (h === 'joie') { p.tete = 5 * S1(t * 9); p.dy = -0.01 * Math.abs(S1(t * 9)); }
    else if (h === 'triste') { p.tete = 4.5; p.corps = 1; p.dy = 0.01; }
    else if (h === 'pense') { p.tete = -5 + 1.2 * S1(t * 1.4); }
    else if (h === 'dort') { p.tete = 5.5 + 1.2 * S1(t * 0.8); p.souffle = 0.024 * S1(t * PI2 / 6.5); }
    else if (h === 'salut') { p.tete = 3 * S1(t * 1.6); }
    else if (h === 'fete') { p.corps = 4 * S1(t * 7); p.tete = 1.2 * S1(t * 7); p.dy = -0.012 * Math.abs(S1(t * 7)); p.souffle = 0.02 * S1(t * 14); }
    else if (h === 'lecture') { p.tete = 1.5 * S1(t * 0.9); p.corps = 0.6 * S1(t * 0.7); }
    else if (h === 'montre') { p.tete = 3 * S1(t * 2.2); }
    else if (h === 'secoue') { p.tete = 4 * S1(t * 22); }
    else if (h === 'poke') { p.souffle = -0.045; }
    else if (h === 'saute') {
      /* étire en montant, s'écrase en retombant (squash & stretch, la base du dessin animé) */
      var ph2 = (t / 0.85) % 1;
      p.souffle = ph2 < 0.15 ? -0.05 * S1(ph2 / 0.15 * Math.PI) : 0.04 * S1((ph2 - 0.15) / 0.85 * Math.PI);
    }
    return p;
  }

  /* ---------------------------------------------------------------------------
     4. LE MOTEUR WebGL (un seul contexte pour toute la page)
     ------------------------------------------------------------------------- */
  var gl = null, glCanvas = null, prog = null, bPos = null, bUv = null, bTri = null, aPos = -1, aUv = -1;
  var textures = {}, perdu = false;
  function initGL() {
    if (gl || perdu) return gl;
    try {
      glCanvas = document.createElement('canvas');
      var o = { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true };
      gl = glCanvas.getContext('webgl', o) || glCanvas.getContext('experimental-webgl', o);
      if (!gl) return null;
      var vs = 'attribute vec2 p;attribute vec2 u;varying vec2 v;void main(){v=u;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);}';
      var fs = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}';
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return null; }
      gl.useProgram(prog);
      aPos = gl.getAttribLocation(prog, 'p'); aUv = gl.getAttribLocation(prog, 'u');
      bPos = gl.createBuffer(); bUv = gl.createBuffer(); bTri = gl.createBuffer();
      glCanvas.addEventListener('webglcontextlost', function (e) {
        /* Contexte perdu (iPhone en manque de mémoire) : on rend la main au dessin d'avant. */
        try { e.preventDefault(); } catch (_) {}
        perdu = true; gl = null; textures = {};
        for (var i = 0; i < suivis.length; i++) detacher(suivis[i], true);
      }, false);
      return gl;
    } catch (_) { gl = null; return null; }
  }
  /* Texture d'un squelette. On réutilise l'image DÉJÀ affichée quand WebGL a le droit de la
     lire (même domaine — Lingua — ou balise marquée crossorigin — Bee) : aucun second
     téléchargement. Sinon, une copie demandée en CORS (lingua.kd-mc.com répond
     Access-Control-Allow-Origin: *). Un échec est retenu 5 min : sans ça, chaque
     changement de la page relancerait un téléchargement voué à l'échec. */
  var echecs = {};
  function lisible(img) {
    try { return !!img.crossOrigin || new URL(img.src, location.href).origin === location.origin; } catch (_) { return false; }
  }
  function texture(nom, img, ok, ko) {
    var T = textures[nom];
    if (T && T.tex) return ok(T.tex);
    if (echecs[nom] && Date.now() - echecs[nom] < 300000) return ko();
    if (T) { T.att.push([ok, ko]); return; }
    T = textures[nom] = { tex: null, att: [[ok, ko]] };
    function charger(im) {
      try {
        if (!gl) throw new Error('gl');
        var tx = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);   /* lève une erreur si l'image est « teintée » */
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var nw = im.naturalWidth, pot = nw === im.naturalHeight && nw >= 64 && (nw & (nw - 1)) === 0;   /* 512, 1024 : mipmaps */
        if (pot) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        T.tex = tx;
        var a = T.att; T.att = [];
        for (var i = 0; i < a.length; i++) a[i][0](tx);
        return true;
      } catch (e) { return false; }
    }
    function echec() { echecs[nom] = Date.now(); var a = T.att; delete textures[nom]; for (var i = 0; i < a.length; i++) a[i][1](); }
    function copieCors() {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { if (!charger(im)) echec(); };
      im.onerror = echec;
      im.src = img.src;
    }
    if (lisible(img)) {
      if (img.complete && img.naturalWidth) { if (!charger(img)) copieCors(); }
      else {
        img.addEventListener('load', function () { if (!charger(img)) copieCors(); }, { once: true });
        img.addEventListener('error', function () { if (textures[nom] === T && !T.tex) echec(); }, { once: true });
      }
    } else copieCors();
  }

  /* Transformation affine 2D [a b c d e f] : x' = a x + c y + e ; y' = b x + d y + f */
  function rot(px, py, deg, s, sy, dx, dy) {
    var r = deg * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    var a = co * s, b = si * s, c = -si * sy, d = co * sy;
    return [a, b, c, d, px + dx - (a * px + c * py), py + dy - (b * px + d * py)];
  }
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }

  /* ---------------------------------------------------------------------------
     5. UN PERSONNAGE SUIVI
     ------------------------------------------------------------------------- */
  var suivis = [], boucle = 0, dernier = 0;
  var REDUIT = false;
  try { REDUIT = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) {}

  /* ---------------------------------------------------------------------------
     5 bis. LA 3D D'OFFICE — le même personnage, en vrai volume (Kevin 3.10 : « 3D d'office partout, pas de bouton »).
        Le moteur (perso3d.js, ~0,15 Mo une fois compressé) se charge UNE fois, au calme (quand le navigateur n'a rien d'autre
        à faire), puis chaque personnage trouvé par la marionnette passe en 3D tout seul : même canvas, même humeur lue sur les
        classes des apps, même voix (bouche), même regard. Tant qu'il n'est pas là — ou s'il ne peut pas venir (pas de WebGL,
        réseau coupé, économiseur de données, vieux téléphone) — la marionnette 2D continue, sans trou : jamais d'écran vide.
        Pas de bouton : un seul interrupteur discret pour les gens du métier (localStorage kdmc_perso3d = 0).
     ------------------------------------------------------------------------- */
  var P3D = { etat: 0, attente: [] };            /* 0 pas demandé · 1 en route · 2 prêt · -1 impossible */
  var VEUT3D = null;
  function prefere3D() {
    if (VEUT3D !== null) return VEUT3D;
    var ok = true;
    try {
      var nav = navigator, cn = nav.connection || {};
      if (window.KDMC_PERSO3D === false || localStorage.getItem('kdmc_perso3d') === '0') ok = false;
      if (cn.saveData) ok = false;
      if (nav.deviceMemory && nav.deviceMemory < 2) ok = false;
      if (nav.hardwareConcurrency && nav.hardwareConcurrency < 2) ok = false;
    } catch (_) {}
    return (VEUT3D = ok && !REDUIT && !perdu && !!SRC_ICI && typeof WebGLRenderingContext !== 'undefined');
  }
  function charger3D(fin) {
    if (P3D.etat === 2) return fin();
    if (P3D.etat === -1) return;
    P3D.attente.push(fin);
    if (P3D.etat === 1) return;
    P3D.etat = 1;
    var go = function () {
      var s = document.createElement('script');
      s.async = true;
      s.src = SRC_ICI.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + 'perso3d.js?v=' + VERSION;
      s.onload = function () {
        if (window.KdmcPerso3D && window.KdmcPerso3D.actif()) { P3D.etat = 2; P3D.attente.splice(0).forEach(function (f) { try { f(); } catch (_) {} }); }
        else P3D.etat = -1;
      };
      s.onerror = function () { P3D.etat = -1; };
      (document.head || document.documentElement).appendChild(s);
    };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
  }
  /* Le fond du carré, pour que la 3D remplace le dessin sans changer le décor : la couleur du bord de l'image (crème). */
  var FONDS = { 'bee/v2': '#fdf7e7', 'bee': '#fee2ae', 'donkey': '#fee8b8' };
  function fondDe(e) {
    var def = FONDS[String(e.nom || '').split(':')[0]] || '#fdf7e7';
    try {
      var im = e.img, w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) return def;
      var c = document.createElement('canvas'); c.width = c.height = 1;
      var x = c.getContext('2d', { willReadFrequently: true }), pts = [[w >> 1, 2], [2, h >> 1], [w - 10, h >> 1], [w >> 1, h - 10]];
      for (var i = 0; i < pts.length; i++) {
        x.clearRect(0, 0, 1, 1); x.drawImage(im, pts[i][0], pts[i][1], 8, 8, 0, 0, 1, 1);
        var d = x.getImageData(0, 0, 1, 1).data;
        if (d[3] > 250) return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
      }
    } catch (_) {}
    return def;
  }
  function monter3D(etat) {
    if (etat.p3d || !prefere3D()) return;
    if (etat.rig && etat.rig.closest && etat.rig.closest('.pron-bee')) return;   /* « Regarde sa bouche » : le dessin ENSEIGNE la prononciation */
    charger3D(function () {
      if (etat.p3d || suivis.indexOf(etat) < 0 || !etat.cv) return;
      var p = window.KdmcPerso3D.creer(/^donkey/.test(etat.nom) ? 'bourricot' : 'bee');
      if (!p) return;
      etat.fond = fondDe(etat);
      etat.p3d = p;
      etat.rig.classList.add('p3d-on');
      demarrer();
    });
  }
  function quitter3D(etat) {
    if (!etat.p3d) return;
    try { etat.p3d.liberer(); } catch (_) {}
    etat.p3d = null;
    try { etat.rig.classList.remove('p3d-on'); } catch (_) {}
  }

  function styleUneFois() {
    if (document.getElementById('kdmc-marionnette-style')) return;
    var s = document.createElement('style');
    s.id = 'kdmc-marionnette-style';
    s.textContent =
      '.mrn-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block}' +
      '.mrn-on>.rig-base,.mrn-on .rig-look>.rig-base{visibility:hidden}' +
      '.mrn-tete{position:absolute;inset:0;pointer-events:none;will-change:transform}' +
      /* LE RELIEF (Kevin 3.10 : « mets les personnages en dimension ») : une lumière douce posée sur le dessin,
         qui glisse à l'opposé du regard — comme sur une boule qui tourne. 0 image, une variable CSS par image. */
      '.mrn-lumiere{position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;' +
      'background:radial-gradient(circle at var(--mx,38%) var(--my,30%),rgba(255,255,255,.55) 0,rgba(255,255,255,.12) 32%,rgba(0,0,0,0) 52%,rgba(40,20,0,.22) 100%)}' +
      '.bee-rig.vid .mrn-lumiere{display:none}' +
      /* la vraie bouche dessinée s'ouvre (mâchoire) : le rond rose posé par-dessus n'a plus lieu d'être — sauf dans
         « Regarde sa bouche, puis imite » de Lingua (.pron-bee), où sa forme ENSEIGNE la prononciation */
      '.mrn-on:not(.pron-bee) .disc-mouth{opacity:0!important}' +
      '.bee-rig.vid .mrn-canvas{display:none}' +
      'canvas.mrn-image{display:inline-block}' +
      /* Le corps bouge maintenant pour de vrai : l'ancienne respiration « d'un bloc »
         de l'image ferait double emploi sur le canvas. */
      '.mrn-on .mrn-canvas{animation:none!important}' +
      /* LA 3D D'OFFICE (Kevin 3.10 : « 3D d'office partout, pas de bouton ») : quand le personnage est en 3D, ses paupières,
         ses ailes dessinées, la lumière douce et la VIDÉO d'avant n'ont plus lieu d'être : la 3D a ses propres yeux, ailes,
         lumière et bouche. Le canvas reste LE MÊME, au même endroit — c'est lui qui reçoit la 3D. */
      '.p3d-on .rig-lid,.p3d-on .rig-piece,.p3d-on .mrn-lumiere,.p3d-on .javis-vid,.p3d-on .disc-vid{display:none!important}' +
      '.p3d-on .disc-mouth{opacity:0!important}' +
      '.bee-rig.vid.p3d-on .mrn-canvas{display:block!important}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* IMAGE FIXE (Lingua : <img class="mascot bee-img pose-wave">) : un <canvas> prend sa place,
     avec SES classes (les règles CSS, les animations « hop / spin », le toucher de Lingua qui
     cherche « .bee-img » le trouvent comme avant) ; l'image reste juste derrière, cachée, pour
     revenir telle quelle au moindre souci. */
  var COPIES = ['borderRadius', 'backgroundColor', 'boxShadow', 'filter', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'verticalAlign'];
  function attacherImage(img, nom) {
    if (!img.parentNode) return;
    img._mrn = true;
    styleUneFois();
    var etat = { img: img, nom: nom, S: preparer(nom), image: true, tex: null, cv: null, cx: null,
      ang: {}, tics: {}, vit: {}, ph: Math.random() * 10, t0: performance.now() / 1000, vu: true, taille: 0, mesure: 0 };
    texture(nom, img, function (tx) {
      if (!img._mrn || !img.parentNode) { img._mrn = false; return; }
      etat.tex = tx;
      var cs = getComputedStyle(img), avant = {}, k;
      for (k = 0; k < COPIES.length; k++) avant[COPIES[k]] = cs[COPIES[k]];
      var w = cs.width, hgt = cs.height;
      if (!parseFloat(w)) { img._mrn = false; return; }      /* pas encore posée : on réessaiera */
      var cv = document.createElement('canvas');
      cv.className = img.className + ' mrn-image';
      ['data-pose', 'data-size', 'title'].forEach(function (a) { var v = img.getAttribute(a); if (v != null) cv.setAttribute(a, v); });
      var alt = img.getAttribute('alt');
      if (alt) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', alt); } else cv.setAttribute('aria-hidden', 'true');
      cv.style.width = w; cv.style.height = hgt;
      img.parentNode.insertBefore(cv, img);
      etat.affichage = img.style.display;
      img.style.display = 'none';
      /* ce que l'image recevait par une règle sur la balise « img » (et pas par ses classes) */
      var cc = getComputedStyle(cv);
      for (k = 0; k < COPIES.length; k++) if (cc[COPIES[k]] !== avant[COPIES[k]]) cv.style[COPIES[k]] = avant[COPIES[k]];
      etat.cv = cv; etat.cx = cv.getContext('2d'); etat.rig = cv;
      if (!etat.cx) { detacher(etat, true); return; }
      if (typeof IntersectionObserver === 'function') {
        etat.io = new IntersectionObserver(function (en) { etat.vu = en[0] && en[0].isIntersecting; if (etat.vu) demarrer(); });
        etat.io.observe(cv);
      }
      suivis.push(etat);
      try { dessiner(etat, performance.now() / 1000, 0); } catch (_) { detacher(etat, true); return; }
      demarrer();
      monter3D(etat);
    }, function () { img._mrn = false; });
  }
  function attacher(img) {
    if (REDUIT || perdu || img._mrn) return;
    var nom = squeletteDe(img.getAttribute('src') || img.src);
    if (!nom || !SQUELETTES[nom] || !initGL()) return;
    if (SQUELETTES[nom].pose) return attacherImage(img, nom);
    var look = img.parentNode;
    if (!look) return;
    img._mrn = true;
    styleUneFois();
    var etat = {
      img: img, look: look, nom: nom, S: preparer(nom), tex: null, cv: null, cx: null,
      rig: img.closest ? (img.closest('.bee-rig') || look) : look,
      ang: {}, tics: {}, vit: {}, ph: Math.random() * 10, t0: performance.now() / 1000, vu: true, tete: null,
      pos: null, taille: 0, mesure: 0
    };
    texture(nom, img, function (tx) {
      if (!img._mrn) return;
      etat.tex = tx;
      var cv = document.createElement('canvas');
      cv.className = 'mrn-canvas';
      cv.setAttribute('aria-hidden', 'true');
      img.parentNode.insertBefore(cv, img.nextSibling);
      etat.cv = cv; etat.cx = cv.getContext('2d');
      if (!etat.cx) { detacher(etat, true); return; }
      /* Paupières et bouche suivent la TÊTE (sinon elles resteraient en l'air quand
         elle penche) : on les range dans un calque qui reçoit le mouvement de la tête. */
      var tete = document.createElement('div');
      tete.className = 'mrn-tete';
      var kids = look.querySelectorAll(':scope > .rig-lid, :scope > .disc-mouth');
      if (kids.length) {
        look.insertBefore(tete, kids[0]);
        for (var i = 0; i < kids.length; i++) tete.appendChild(kids[i]);
        etat.tete = tete;
      }
      etat.bouche = look.querySelector('.disc-mouth');
      var lum = document.createElement('div');
      lum.className = 'mrn-lumiere';
      cv.parentNode.insertBefore(lum, cv.nextSibling);
      etat.lumiere = lum;
      if (typeof IntersectionObserver === 'function') {
        etat.io = new IntersectionObserver(function (en) { etat.vu = en[0] && en[0].isIntersecting; if (etat.vu) demarrer(); });
        etat.io.observe(etat.rig);
      }
      suivis.push(etat);
      dessiner(etat, performance.now() / 1000, 0);   /* première image tout de suite… */
      etat.rig.classList.add('mrn-on');                /* …puis seulement on cache l'ancienne */
      demarrer();
      monter3D(etat);                                  /* …et la 3D prend le relais dès que son moteur est là */
    }, function () { img._mrn = false; });
  }
  function detacher(etat, rendre) {
    try { if (etat.io) etat.io.disconnect(); } catch (_) {}
    quitter3D(etat);
    try { if (etat.cv && etat.cv.parentNode) etat.cv.parentNode.removeChild(etat.cv); } catch (_) {}
    try { if (etat.lumiere && etat.lumiere.parentNode) etat.lumiere.parentNode.removeChild(etat.lumiere); } catch (_) {}
    try {
      if (etat.tete && etat.tete.parentNode) {
        while (etat.tete.firstChild) etat.tete.parentNode.insertBefore(etat.tete.firstChild, etat.tete);
        etat.tete.parentNode.removeChild(etat.tete);
      }
    } catch (_) {}
    try { if (etat.image) etat.img.style.display = etat.affichage || ''; else etat.rig.classList.remove('mrn-on'); } catch (_) {}
    if (rendre) etat.img._mrn = false;
    var i = suivis.indexOf(etat); if (i >= 0) suivis.splice(i, 1);
  }

  /* La POSE d'un instant : angles de chaque os (lissés vers leur cible), puis la peau.
     Séparé du dessin : le test le rejoue sans écran pour vérifier qu'aucun triangle ne
     se retourne (un triangle retourné = un morceau de dessin qui paraît coupé net). */
  function poser(e, h, t, dt, niveau, sansPeau) {
    NIV = niveau;
    /* Les petits gestes spontanés : de temps en temps, une partie « tique ». */
    var S = e.S, os = S.os, lerp = dt ? Math.min(1, dt * 9) : 1, i, o;
    for (i = 0; i < os.length; i++) {
      o = os[i];
      var tc = e.tics[o.id] || 0;
      if (tc > 0) e.tics[o.id] = Math.max(0, tc - dt * 3.2);
      else if (h === 'repos' && dt && !e.sansHasard && Math.random() < dt * (o.type === 'queue' ? 0.35 : o.type === 'oreille' || o.type === 'antenne' ? 0.22 : o.type === 'bras' ? 0.08 : 0)) e.tics[o.id] = 1;
      var tic = Math.sin((1 - (e.tics[o.id] || 0)) * Math.PI) * ((e.tics[o.id] || 0) > 0 ? 1 : 0);
      if (o.type === 'tete' || o.type === 'corps' || o.type === 'machoire' || o.type === 'oeil' || o.type === 'visage') continue;
      var direct = FIXES[h] || o.type === 'aile';
      var ouvre = borne(o, cible(o, h, t, i * 1.7, tic), FIXES[h]);
      var deg = direct || o.type === 'meche' ? ouvre : (o.sens === 'haut' ? o.cote : -o.cote) * ouvre;
      var a0 = e.ang[o.id] == null ? deg : e.ang[o.id];
      if (MOU[o.type] && dt) {
        /* Les parties MOLLES (oreilles, antennes, queue, mèche) ont de l'inertie : un
           ressort amorti, qui dépasse un peu sa cible et rebondit — et qui traîne quand
           la tête bouge vite. C'est ce qui fait « vrai » plutôt que « mécanique ». */
        var vk = e.vit[o.id] || 0, inertie = o.parent === 'tete' ? -(e.vTete || 0) * 0.06 : -(e.vCorps || 0) * 0.08;
        var acc = MOU[o.type][0] * (deg + inertie * 57 - a0) - MOU[o.type][1] * vk;
        var pas = Math.min(dt, 1 / 30), n = Math.ceil(dt / pas);
        for (var z = 0; z < n; z++) { vk += acc * pas; a0 += vk * pas; acc = MOU[o.type][0] * (deg + inertie * 57 - a0) - MOU[o.type][1] * vk; }
        /* le rebond ne doit jamais dépasser les bornes de plus de 6° (sinon le dessin se plie) */
        var sg = direct || o.type === 'meche' ? 1 : (o.sens === 'haut' ? o.cote : -o.cote) || 1, bo = FIXES[h] ? BORNES_FIXES[o.type] : (o.bornes || BORNES[o.type]);
        if (bo) { var ou2 = a0 / sg, lim = Math.max(bo[0] - 6, Math.min(bo[1] + 6, ou2)); if (lim !== ou2) { a0 = lim * sg; vk = 0; } }
        e.vit[o.id] = vk; e.ang[o.id] = a0;
      } else e.ang[o.id] = a0 + (deg - a0) * lerp;
    }
    var tr = poseTronc(h, t, niveau);
    ['corps', 'tete'].forEach(function (k) {
      var a0 = e.ang[k] == null ? tr[k] : e.ang[k], a1 = a0 + (tr[k] - a0) * lerp;
      if (dt) e[k === 'tete' ? 'vTete' : 'vCorps'] = (a1 - a0) / dt * Math.PI / 180;   /* vitesse (rad/s) */
      e.ang[k] = a1;
    });
    e.souffle = e.souffle == null ? tr.souffle : e.souffle + (tr.souffle - e.souffle) * lerp;
    e.dy = e.dy == null ? tr.dy : e.dy + (tr.dy - e.dy) * lerp;
    /* LA MÂCHOIRE (Kevin 3.10 : « la bouche est mal sur le personnage ») : c'est la VRAIE bouche dessinée qui
       s'ouvre, plus un rond posé par-dessus. Ouverture = la voix : la forme que le lip-sync donne au rond (son
       scaleY, toujours calculé même s'il est caché), sinon le volume publié par Bee, sinon des syllabes. */
    var ouv = 0;
    if (h === 'parle') {
      ouv = e.ouvVoix != null ? e.ouvVoix : 0.45 + 0.45 * S1(t * 15) * S1(t * 4.3 + 1);
    }
    e.jaw = e.jaw == null ? ouv : e.jaw + (ouv - e.jaw) * (dt ? Math.min(1, dt * 22) : 1);
    /* MIMIQUES (Kevin 3.10 : « réagis, mimiques ») : les yeux se plissent de joie, s'écarquillent de surprise,
       tombent de tristesse ; le visage regarde vers ton doigt (et, seul, jette des coups d'œil) pendant que le
       contour de la tête reste en place — l'illusion d'une tête qui TOURNE, en relief. */
    var X = EXPRESSIONS[h] || EXPRESSIONS.repos, fx = dt ? Math.min(1, dt * 10) : 1;
    var ex = e.expr || (e.expr = { sx: 1, sy: 1, r: 0, vx: 0, vy: 0 });
    ex.sx += (X.sx - ex.sx) * fx; ex.sy += (X.sy - ex.sy) * fx; ex.r += (X.r - ex.r) * fx;
    var rg = e.regard || { x: 0, y: 0 };
    if (!rg.actif && !e.sansHasard && dt) {                 /* personne ne le guide : un coup d'œil de temps en temps */
      e.prochainCoupDoeil = (e.prochainCoupDoeil || 0) - dt;
      if (e.prochainCoupDoeil <= 0) { e.coupDoeil = { x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * 0.9 }; e.prochainCoupDoeil = 1.6 + Math.random() * 3.2; }
      rg = e.coupDoeil || rg;
    }
    var cx2 = Math.max(-1, Math.min(1, rg.x + X.vx)), cy2 = Math.max(-1, Math.min(1, rg.y + X.vy));
    ex.vx += (cx2 - ex.vx) * (dt ? Math.min(1, dt * 7) : 1); ex.vy += (cy2 - ex.vy) * (dt ? Math.min(1, dt * 7) : 1);

    /* Transformations du monde, parent avant enfant (coordonnées 0..1). */
    var M = new Array(os.length);
    for (var q = 0; q < S.ordre.length; q++) {
      i = S.ordre[q]; o = os[i];
      var px = o.a[0] / 1024, py = o.a[1] / 1024, loc;
      if (o.type === 'corps') loc = rot(px, py, e.ang.corps, 1 - e.souffle * 0.5, 1 + e.souffle, 0, e.dy);
      else if (o.type === 'tete') loc = rot(px, py, e.ang.tete, 1, 1, 0, 0);
      else if (o.type === 'machoire') loc = rot(px, py, 0, 1 + (e.jaw || 0) * 0.04, 1, 0, (e.jaw || 0) * (o.amp || 0.02));
      else if (o.type === 'visage') loc = rot(px, py, 0, 1, 1, e.expr.vx * 0.022, e.expr.vy * 0.016);
      else if (o.type === 'oeil') loc = rot(px, py, e.expr.r * (o.cote || 1), e.expr.sx, e.expr.sy, 0, 0);
      else loc = rot(px, py, e.ang[o.id] || 0, 1, 1, 0, 0);
      M[i] = o.p >= 0 ? mul(M[o.p], loc) : loc;
    }
    e.M = M;
    if (sansPeau) return null;                      /* en 3D, la peau 2D est inutile : seuls l'état (bouche, regard, humeur) comptent */
    /* Peau : chaque point = mélange des os qui le tiennent (le reste ne bouge pas). */
    var nv = S.nv, nb = os.length, base = S.base, W = S.poids;
    var out = e.buf || (e.buf = new Float32Array(nv * 2));
    for (var v = 0; v < nv; v++) {
      var x = base[v * 2], y = base[v * 2 + 1], X = 0, Y = 0, reste = 1;
      for (i = 0; i < nb; i++) {
        var w = W[v * nb + i];
        if (!w) continue;
        var m = M[i];
        X += w * (m[0] * x + m[2] * y + m[4]); Y += w * (m[1] * x + m[3] * y + m[5]); reste -= w;
      }
      out[v * 2] = X + reste * x; out[v * 2 + 1] = Y + reste * y;
    }
    return out;
  }

  function dessiner(e, now, dt) {
    var S = e.S, t = now - e.t0 + e.ph, h = humeurDe(e);
    /* Taille réelle à l'écran (re-mesurée au plus une fois par seconde). */
    if (!e.taille || now - e.mesure > 1) {
      e.mesure = now;
      var w = e.image ? e.cv.offsetWidth : (e.img.offsetWidth || (e.rig && e.rig.offsetWidth) || 0);
      e.taille = w;
      var px = Math.max(48, Math.min(512, Math.round(w * Math.min(2, window.devicePixelRatio || 1))));
      if (e.cv.width !== px || e.cv.height !== px) { e.cv.width = px; e.cv.height = px; }
    }
    if (!e.taille) return;
    /* Le volume de sa voix (0..1), posé par le lip-sync de Bee sur <html> : plus elle
       parle fort, plus elle hoche la tête et gesticule. Sans lip-sync (Lingua) : 0,5. */
    var niveau = 0.5;
    try { var nv0 = document.documentElement.style.getPropertyValue('--bee-niveau'); if (nv0 !== '') niveau = parseFloat(nv0) || 0; } catch (_) {}
    /* ouverture de la bouche d'après le lip-sync de l'app (widget ET Lingua posent scaleY sur .disc-mouth) */
    e.ouvVoix = null;
    if (e.bouche) {
      var mY = /scaleY\(([\d.]+)\)/.exec(e.bouche.style.transform || '');
      if (mY) e.ouvVoix = Math.max(0, Math.min(1, (parseFloat(mY[1]) - 0.3) / 1.4));
    }
    /* où regarde-t-il ? Les apps posent --lx/--ly (en %) sur .rig-look quand ton doigt bouge */
    try {
      var lx = parseFloat(e.look && e.look.style.getPropertyValue('--lx')), ly = parseFloat(e.look && e.look.style.getPropertyValue('--ly'));
      e.regard = (isFinite(lx) || isFinite(ly)) ? { x: (lx || 0) / 3.2, y: (ly || 0) / 2.2, actif: true } : null;
    } catch (_) { e.regard = null; }
    var out = poser(e, h, t, dt, niveau, !!e.p3d), M = e.M;
    if (e.p3d) {
      /* LA 3D : même humeur, même bouche (lip-sync), même regard, dans le même canvas */
      var ok3 = false;
      e.ctx3D = { niveau: niveau, ouv: e.jaw || 0, regard: { x: e.expr ? e.expr.vx : 0, y: e.expr ? e.expr.vy : 0 } };
      try { ok3 = e.p3d.dessiner(e.cx, e.cv.width, h, t, e.ctx3D, e.fond, e.image ? e.img : null); } catch (_) { ok3 = false; }
      if (ok3) { e.vue = (e.vue || 0) + 1; return; }
      quitter3D(e);                                 /* la 3D lâche en route : retour au 2D, dans la même image */
      out = poser(e, h, t, 0, niveau); M = e.M;
    }
    /* Rendu dans le contexte partagé, puis copie dans le canvas du personnage. */
    var px2 = e.cv.width;
    /* largeur ET hauteur : un canvas neuf mesure 300 × 150 — vérifier la seule largeur laissait, pour un personnage
       de 300 px pile, une hauteur de 150 et un dessin zoomé, coupé (trouvé le 3.10, garde « fidélité ») */
    if (glCanvas.width !== px2 || glCanvas.height !== px2) { glCanvas.width = px2; glCanvas.height = px2; }
    gl.viewport(0, 0, px2, px2);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    if (bUv._de !== e.nom) { gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.bufferData(gl.ARRAY_BUFFER, S.uv, gl.STATIC_DRAW); bUv._de = e.nom; }
    gl.bindBuffer(gl.ARRAY_BUFFER, bUv);
    gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    if (bTri._de !== e.nom) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bTri); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, S.tri, gl.STATIC_DRAW); bTri._de = e.nom; }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bTri);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.drawElements(gl.TRIANGLES, S.tri.length, gl.UNSIGNED_SHORT, 0);
    e.cx.clearRect(0, 0, px2, px2);
    e.cx.drawImage(glCanvas, 0, 0);

    /* Le calque des paupières + bouche reçoit le mouvement de la tête. */
    if (e.tete) {
      var mt = S.iVisage >= 0 ? M[S.iVisage] : (S.iTete >= 0 ? M[S.iTete] : null);   /* paupières : avec le visage */
      if (mt) e.tete.style.transform = 'matrix(' + mt[0].toFixed(4) + ',' + mt[1].toFixed(4) + ',' + mt[2].toFixed(4) + ',' +
        mt[3].toFixed(4) + ',' + (mt[4] * e.taille).toFixed(2) + ',' + (mt[5] * e.taille).toFixed(2) + ')';
    }
    if (e.lumiere && e.expr) {
      e.lumiere.style.setProperty('--mx', (38 - e.expr.vx * 9).toFixed(1) + '%');
      e.lumiere.style.setProperty('--my', (30 - e.expr.vy * 7).toFixed(1) + '%');
    }
    e.vue = (e.vue || 0) + 1;
  }

  function demarrer() { if (!boucle && suivis.length) boucle = requestAnimationFrame(tour); }
  function tour(ms) {
    boucle = 0;
    var now = ms / 1000, dt = dernier ? Math.min(0.1, now - dernier) : 0;
    var actif = false;
    if (!document.hidden) {
      var pause = document.body && document.body.classList.contains('javis-repos');
      for (var i = suivis.length - 1; i >= 0; i--) {
        var e = suivis[i];
        if (!document.contains(e.img)) { detacher(e, false); continue; }   /* l'app a redessiné : on oublie */
        if (pause && e.rig.closest && e.rig.closest('#javis-root')) continue;
        if (!e.vu || (!e.p3d && /(^|\s)vid(\s|$)/.test(e.rig.className))) continue;
        /* petit personnage (bouton flottant) : 30 images/s suffisent */
        if (e.taille && e.taille < 140 && e.dern && now - e.dern < 1 / 31) { actif = true; continue; }
        try { dessiner(e, now, e.dern ? Math.min(0.1, now - e.dern) : dt); e.dern = now; actif = true; }
        catch (err) { detacher(e, true); }
      }
    }
    dernier = now;
    if (suivis.length && (actif || document.hidden)) {
      if (document.hidden) return;              /* la page cachée ne tourne pas ; visibilitychange relance */
      boucle = requestAnimationFrame(tour);
    }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { dernier = 0; demarrer(); } });

  /* ---------------------------------------------------------------------------
     6. TROUVER LES PERSONNAGES, PARTOUT, TOUT SEUL
     ------------------------------------------------------------------------- */
  var attente = 0, RE_IMG = /(bee\/v2|bee|donkey)\/(rig\/base|wave|party|read|point)\.webp/;
  function balayer() {
    attente = 0;
    var l = document.querySelectorAll('img');
    for (var i = 0; i < l.length; i++) if (!l[i]._mrn && RE_IMG.test(l[i].getAttribute('src') || '')) attacher(l[i]);
    demarrer();
  }
  function plusTard() { if (!attente) attente = setTimeout(balayer, 120); }
  function go() {
    balayer();
    try { new MutationObserver(plusTard).observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();

  window.KdmcMarionnette = {
    version: VERSION,
    squelettes: SQUELETTES,
    squeletteDe: squeletteDe,
    humeur: humeur,
    balayer: balayer,
    /* pour les tests : combien de personnages bougent, et combien d'images chacun */
    etat: function () { return suivis.map(function (e) { return { nom: e.nom, images: e.vue || 0, humeur: humeurDe(e), taille: e.taille, image: !!e.image, p3d: !!(e.p3d && e.p3d.ok), ctx3D: e.p3d ? e.ctx3D : null }; }); },
    actif: function () { return !!gl && !perdu && !REDUIT; },
    /* la 3D d'office : veut-on la lancer (sinon l'appelant garde ses vidéos / dessins) ? où en est le moteur ? */
    prefere3D: prefere3D,
    moteur3D: function () { return P3D.etat; },
    /* pour les tests (sans écran) : la peau d'un squelette dans une humeur, à l'instant t */
    _maillage: function (nom, h, t, pas, ouvVoix, regard) {
      var S = preparer(nom), e = { S: S, ang: {}, tics: {}, vit: {}, sansHasard: true, ouvVoix: ouvVoix == null ? null : ouvVoix, regard: regard || null }, pos;
      if (pas) for (var u = 0; u <= t; u += pas) pos = poser(e, h, u, u ? pas : 0, 0.5);
      else pos = poser(e, h, t, 0, 0.5);
      return { pos: pos, tri: S.tri, base: S.base, nv: S.nv };
    },
    /* idem, mais en jouant le temps image par image (ressorts compris) : rend toutes les
       poses d'une séquence, pour vérifier qu'aucune ne plie le dessin */
    _sequence: function (nom, h, duree, pas, cb) {
      var S = preparer(nom), e = { S: S, ang: {}, tics: {}, vit: {}, sansHasard: true };   /* rejouable à l'identique */
      for (var u = 0; u <= duree; u += pas) cb(poser(e, h, u, u ? pas : 0, 0.5), u, S, e.ang);
    }
  };
})();
/*</marionnette>*/
