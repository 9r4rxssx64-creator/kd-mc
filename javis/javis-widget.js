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
 *  2. Le chat parle à `apis.kd-mc.com/ai` (DÉJÀ en prod) → gratuit Qwen d'abord,
 *     bascule Anthropic pour code/raisonnement/action. Zéro backend nouveau.
 *  3. Bee PARLE sa réponse (Web Speech API, native, gratuite) et sa bouche
 *     s'anime pendant — pas un lip-sync phonétique, un vrai mouvement synchronisé.
 *  4. Intentions locales (ouvrir une app du domaine, météo) exécutées directement dans le
 *     navigateur. Une ACTION sur tes données part vers Apex authentifié
 *     (`apex_v13_chat_prefill`) : un script public ne détient jamais de secret
 *     d'écriture.
 *
 * ── À ajouter sur une page ──────────────────────────────────────────────────
 *   <script src="javis-widget.js" defer></script>
 *   + CSP : `img-src` doit inclure https://lingua.kd-mc.com (les images de Bee)
 *           `connect-src` doit inclure https://apis.kd-mc.com https://api.open-meteo.com
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
  var JAVIS_VER = 'v1.6';
  try { window.JAVIS_VER = JAVIS_VER; } catch (e) {}

  if (window.__javisWidgetLoaded) return;
  window.__javisWidgetLoaded = true;

  var AI_ENDPOINT = 'https://apis.kd-mc.com/ai';
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
      emoji: '\uD83D\uDC1D', pieces: ['wing-l', 'wing-r'], gen: 'f' },
    { id: 'donkey', rig: 'donkey', live: 'donkey', nom: 'Bourricot', titre: "Bourricot l'\u00e2ne",
      emoji: '\uD83E\uDECF', pieces: [], gen: 'm' }
  ];
  var CLIPS = ['idle', 'hello', 'dance', 'jump', 'fly', 'walk'];
  var MASC_CLE = 'javis_mascotte';
  function mascCfg() {
    var id = 'bee';
    try { var v = localStorage.getItem(MASC_CLE); if (v) id = v; } catch (e) {}
    for (var i = 0; i < MASCOTTES.length; i++) { if (MASCOTTES[i].id === id) return MASCOTTES[i]; }
    return MASCOTTES[0];                       /* valeur inconnue -> on retombe sur Bee */
  }
  function rigBase(m) { return LINGUA + (m || mascCfg()).rig + '/rig/'; }
  function liveBase(m) { return LINGUA + (m || mascCfg()).live + '/live/'; }
  /* Accord en genre, comme dans Lingua : Bee est une abeille, Bourricot un ane.
     Sans ca on lit « Bourricot est prete » -- faux et moche. */
  function MG(f, m) { return mascCfg().gen === 'm' ? m : f; }
  /* Sa VRAIE voix + le vrai lip-sync : le domaine sait deja fabriquer la parole
     (routeur kd-mc.com, /__lingua/tts, cache a vie, CORS ouvert, fail-open). Un fichier
     audio, c'est un SON QU'ON PEUT ANALYSER : la bouche s'ouvre sur l'amplitude reelle.
     La voix du telephone (Web Speech) reste le repli : elle parle mais ne s'analyse pas. */
  var BEE_TTS = 'https://lingua.kd-mc.com/__lingua/tts';
  var BEE_VOIX = 'nova'; /* la meme voix que Bee dans Lingua */
  var STORAGE_HIST = 'javis_widget_history';
  var STORAGE_VOICE = 'javis_widget_voice_on';
  var MAX_HISTORY = 40;

  /* ============================================================
     0. Qui es-tu ? (SSO domaine — même pattern que tools/departs)
     ============================================================ */
  function ssoToken() {
    try {
      var m = (location.hash || '').match(/[#&]kdmc_sso=([^&]+)/);
      if (m) {
        try { localStorage.setItem('kdmc_sso_token', decodeURIComponent(m[1])); } catch (_) {}
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
      }
      return localStorage.getItem('kdmc_sso_token') || '';
    } catch (_) { return ''; }
  }

  function checkAdmin(cb) {
    try {
      var tok = ssoToken();
      var hdr = {};
      if (tok) hdr.Authorization = 'Bearer ' + tok;
      fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store', headers: hdr })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (j) { cb(!!(j && j.ok && j.verified === true && j.admin === true)); })
        .catch(function () { cb(false); });
    } catch (_) { cb(false); }
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

  function buildBeeRig(avecVideo) {
    var M = mascCfg(), B = rigBase(M), ailes = '';
    for (var i = 0; i < M.pieces.length; i++) {
      ailes += '<img class="rig-piece rig-' + (M.pieces[i] === 'wing-l' ? 'wl' : 'wr') + '" src="' +
               B + M.pieces[i] + '.webp" alt="" onerror="this.remove()">';
    }
    return (
      '<div class="bee-rig" data-mascot="' + M.id + '"' + (M.id === 'bee' ? ' data-art="vive"' : '') + '>' +
      '<div class="rig-look">' +
      '<img class="rig-base" src="' + B + 'base.webp" alt="' + M.nom + '">' +
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
      '--mo-l:51.1%;--mo-t:54.9%}' +
      /* L'ANE : geometrie MESUREE sur SON dessin dans lingua/index.html, recopiee a
         l'identique. Ses yeux sont plus petits et plus bas que ceux de Bee, sa bouche
         plus bas encore : reutiliser les valeurs de l'abeille lui mettrait les
         paupieres sur le front. */
      '.bee-rig[data-mascot="donkey"]{--lid:rgb(231,160,64);' +
      '--ll-l:34.3%;--ll-t:39.3%;--ll-w:7.5%;--ll-h:9.5%;' +
      '--lr-l:54.0%;--lr-t:38.6%;--lr-w:8.0%;--lr-h:10.5%;' +
      '--mo-l:51%;--mo-t:58.9%}' +
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
      '@keyframes javis-joie{0%,100%{transform:translateY(0) rotate(0)}20%{transform:translateY(-13%) rotate(-8deg)}45%{transform:translateY(0) rotate(6deg)}70%{transform:translateY(-8%) rotate(-4deg)}}' +
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
      '@keyframes javis-jump{0%,100%{transform:translateY(0) scale(1,1)}10%{transform:translateY(4%) scale(1.09,.88)}30%{transform:translateY(-14%) scale(.93,1.12)}48%{transform:translateY(-18%) scale(.97,1.04)}66%{transform:translateY(0) scale(1.12,.86)}80%{transform:translateY(-4%) scale(.98,1.03)}92%{transform:translateY(0) scale(1.02,.98)}}' +
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
      'font:13.5px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;color:#f0e2bd;box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;' +
      'animation:javis-bubblePop .35s cubic-bezier(.34,1.56,.64,1)}' +
      '@keyframes javis-bubblePop{0%{transform:scale(.5) translateY(10px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}' +
      '.javis-bubble.bye{opacity:0;transform:translateY(8px);transition:all .4s}' +
      /* « elle écrit… » pendant qu'elle réfléchit */
      '.javis-typing{display:flex;gap:4px;align-self:flex-start;padding:10px 14px;background:#241905;border:1px solid rgba(246,183,60,.18);border-radius:14px;border-bottom-left-radius:4px}' +
      '.javis-typing i{width:7px;height:7px;border-radius:50%;background:#f6b73c;opacity:.4;animation:javis-dot 1.1s ease-in-out infinite}' +
      '.javis-typing i:nth-child(2){animation-delay:.18s}.javis-typing i:nth-child(3){animation-delay:.36s}' +
      '@keyframes javis-dot{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}' +
      '@media (prefers-reduced-motion:reduce){.javis-spark{display:none}.javis-bubble,.javis-typing i{animation:none}}' +
      /* ---- habillage du widget ---- */
      '#javis-launcher{position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom) + 96px);' +
      'z-index:2147483000;width:68px;height:68px;border:0;border-radius:50%;padding:0;cursor:pointer;' +
      'background:#fdf7e7;box-shadow:0 0 0 3px rgba(246,183,60,.55),0 10px 26px rgba(0,0,0,.4);' +
      'overflow:hidden;transition:transform .15s ease;-webkit-tap-highlight-color:transparent;' +
      'animation:javis-float 3.4s ease-in-out infinite}' +
      '@keyframes javis-float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-6px) rotate(1.5deg)}}' +
      '#javis-launcher:active{transform:scale(.93)}' +
      '#javis-panel{position:fixed;z-index:2147483001;right:12px;left:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);' +
      'max-width:420px;margin-left:auto;background:#171008;border:1px solid rgba(246,183,60,.3);border-radius:20px;' +
      'box-shadow:0 24px 60px rgba(0,0,0,.55);display:none;flex-direction:column;overflow:hidden;' +
      'max-height:min(72vh,620px);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '#javis-panel.javis-open{display:flex;animation:javis-pop .18s ease}' +
      '@keyframes javis-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}' +
      '#javis-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,#241905,#171008);' +
      'border-bottom:1px solid rgba(246,183,60,.2)}' +
      '#javis-head .javis-mini{width:46px;height:46px;flex:0 0 auto;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px rgba(246,183,60,.45)}' +
      '#javis-head b{color:#f6b73c;font-size:15px}' +
      '#javis-head span{display:block;color:#c9b98a;font-size:11px}' +
      '#javis-masc{margin-left:auto;display:flex;gap:6px}' +
      '.javis-mpick{width:44px;height:44px;border-radius:12px;border:2px solid transparent;background:rgba(246,183,60,.10);' +
      'font-size:20px;line-height:1;cursor:pointer;padding:0;color:inherit}' +
      '.javis-mpick.on{border-color:#f6b73c;background:rgba(246,183,60,.22)}' +
      '#javis-close{background:none;border:0;color:#c9b98a;font-size:20px;line-height:1;padding:6px;cursor:pointer}' +
      '#javis-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}' +
      '.javis-bub{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word}' +
      '.javis-bub.me{align-self:flex-end;background:#3a2c16;color:#f7efd9;border-bottom-right-radius:4px}' +
      '.javis-bub.js{align-self:flex-start;background:#241905;color:#f0e2bd;border:1px solid rgba(246,183,60,.18);border-bottom-left-radius:4px}' +
      '.javis-bub.js small{display:block;margin-top:4px;color:#8a7550;font-size:10px}' +
      '#javis-form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(246,183,60,.2);background:#171008}' +
      '#javis-input{flex:1;background:#241905;border:1px solid rgba(246,183,60,.25);color:#f7efd9;border-radius:12px;' +
      'padding:10px 12px;font-size:14px;min-height:44px;resize:none;font-family:inherit}' +
      '#javis-send,#javis-mic{flex:0 0 44px;height:44px;border-radius:12px;border:0;background:linear-gradient(135deg,#f6b73c,#ffd75e);' +
      'color:#241905;font-size:18px;font-weight:700;cursor:pointer}' +
      '#javis-mic.on{background:linear-gradient(135deg,#c8506a,#e2748f)}' +
      '@media (min-width:480px){#javis-panel{right:16px}}' +
      /* ---- MODE APP (javis/index.html) : plein écran, le personnage en grand ----
         Même fichier, même Bee, même chat : l'app installable n'est qu'une coquille
         qui pose window.JAVIS_MODE='app'. Zéro logique dupliquée (leçon #142). */
      'body.javis-app{margin:0;background:#0e0a04;overflow:hidden}' +
      'body.javis-app #javis-launcher{position:static;width:min(56vw,270px);height:min(56vw,270px);' +
      'margin:calc(env(safe-area-inset-top) + 18px) auto 8px;display:block;animation:javis-float 3.4s ease-in-out infinite}' +
      'body.javis-app #javis-root{display:flex;flex-direction:column;height:100dvh}' +
      'body.javis-app #javis-panel{position:static;display:flex;flex:1;max-width:none;max-height:none;' +
      'margin:0;border:0;border-radius:20px 20px 0 0;box-shadow:none;animation:none}' +
      'body.javis-app #javis-head .javis-mini{display:none}' +
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
    var tBlink = 0;
    function blink() {
      if (!document.contains(rig)) return;
      if (document.hidden) { tBlink = setTimeout(blink, 10000); return; }
      if (!dormi) {
        var ms = 110 + Math.random() * 70;
        unClin(ms);
        if (Math.random() < 0.2) setTimeout(function () { if (!dormi) unClin(ms); }, ms + 90);
      }
      tBlink = setTimeout(blink, dormi ? 9000 : (2200 + Math.random() * 3600));
    }
    blink();
    function onVisible() {
      if (document.hidden || !document.contains(rig)) return;
      try { clearTimeout(tBlink); } catch (_) {}
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
      var etaitEndormie = dormi;
      reveille();
      var zone = rigZone(rig, ev);
      vibrate(zone === 'ventre' ? 18 : 10);
      if (etaitEndormie) { bubble(pick(RX_LINES.reveil)); return; }
      if (zone === 'aile') { move(rig, 'fly', 2200); }
      else { react(rig, 'poke', 900); move(rig, zone === 'ventre' ? 'dance' : 'jump', 1600); }
      sparkles(rig, zone === 'ventre' ? 10 : 6);
      tone([760, 980], .18);
      bubble(pick(RX_LINES[zone] || RX_LINES.tete), 3500);
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
  function tone(freqs, dur) {
    try {
      if (localStorage.getItem(STORAGE_VOICE) === '0') return;
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.connect(g); g.connect(AC.destination); o.type = 'sine';
      freqs.forEach(function (f, i) { o.frequency.setValueAtTime(f, AC.currentTime + i * 0.08); });
      g.gain.setValueAtTime(.10, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + dur);
      o.start(); o.stop(AC.currentTime + dur);
    } catch (_) {}
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} }

  /* Bulle qui apparaît à côté d'elle (porté de Lingua : beeBubble) */
  function bubble(text, ms) {
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

  function initVideo(rig) {
    if (!rig) return;
    var v = rig.querySelector('.javis-vid');
    if (!v) return;
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
  var _voixAudio = null, _lipStop = null;
  function allRigs(root) { return Array.prototype.slice.call(root.querySelectorAll('.bee-rig')); }
  function allMouths(root) { return Array.prototype.slice.call(root.querySelectorAll('.disc-mouth')); }
  var APP_MODE = (window.JAVIS_MODE === 'app');
  function startTalking(root) {
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
  var AC = null;
  function audioUnlock() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state !== 'running' && AC.resume) AC.resume();
      var b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource();
      s.buffer = b; s.connect(AC.destination); (s.start || s.noteOn).call(s, 0);
    } catch (_) {}
  }
  try {
    ['touchend', 'click', 'pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, audioUnlock, { passive: true });
    });
  } catch (_) {}

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

  function lipSync(audioEl, bouches) {
    if (!audioEl || !bouches.length) return null;
    try { if (!AC || AC.state !== 'running') return null; } catch (_) { return null; }
    try {
      if (!audioEl._srcNode) audioEl._srcNode = AC.createMediaElementSource(audioEl);
      audioEl._srcNode.connect(AC.destination);      /* le SON d'abord — jamais coupe */
      var an = AC.createAnalyser();
      /* 2048 et pas 256 : pour reconnaitre une VOYELLE il faut mesurer ses deux resonances
         (F1, F2), et a 256 chaque case du spectre fait 172 Hz -- on ne distingue meme pas
         un « ou » (F1 320) d'un « a » (F1 750). A 2048, chaque case fait ~21 Hz : la ou
         se joue la difference entre les voyelles. Cout : une FFT de 2048 points par image,
         negligeable pour un navigateur. */
      an.fftSize = 2048; an.smoothingTimeConstant = 0.55;
      audioEl._srcNode.connect(an);
      var buf = new Uint8Array(an.fftSize), raf = 0, maxR = 0, plat = false;
      var fbuf = new Uint8Array(an.frequencyBinCount);   /* le SPECTRE, pas que le volume */
      var hz = (AC.sampleRate || 44100) / an.fftSize;     /* largeur d'une case du spectre */
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
        try { an.disconnect(); } catch (_) {}
        bouches.forEach(function (m) {
          try { m.classList.remove('talking'); m.style.transform = ''; m.style.opacity = ''; } catch (_) {}
        });
      };
    } catch (_) { return null; }
  }

  function voixStop() {
    if (_lipStop) { try { _lipStop(); } catch (_) {} _lipStop = null; }
    if (_voixAudio) { try { _voixAudio.pause(); _voixAudio.src = ''; } catch (_) {} _voixAudio = null; }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  }

  /* Repli : la voix du telephone. Elle parle, mais on ne peut PAS l'analyser
     (le navigateur la joue hors du moteur audio) -> la bouche bat en rythme. */
  function voixTelephone(root, text) {
    if (!('speechSynthesis' in window)) { stopTalking(root); return; }
    try {
      var u = new SpeechSynthesisUtterance(text.slice(0, 600));
      u.lang = 'fr-FR'; u.rate = 1.02;
      u.pitch = 1.35; /* voix claire et enjouee, comme Bee dans Lingua */
      u.onend = function () { stopTalking(root); };
      u.onerror = function () { stopTalking(root); };
      window.speechSynthesis.speak(u);
    } catch (_) { stopTalking(root); }
  }

  function speak(root, text) {
    var on = true;
    try { on = localStorage.getItem(STORAGE_VOICE) !== '0'; } catch (_) {}
    if (!on || !text) return;
    voixStop();
    startTalking(root);

    /* 1) SA voix (le domaine la fabrique et la garde en cache) + VRAI lip-sync :
          la bouche suit l'amplitude du son. crossOrigin est OBLIGATOIRE pour pouvoir
          analyser un son d'une autre adresse — sans lui, l'analyse rend du silence. */
    var a = new Audio();
    a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    var repli = false;
    function versTelephone() {
      if (repli) return; repli = true;
      try { a.pause(); } catch (_) {}
      voixTelephone(root, text);
    }
    a.addEventListener('canplay', function () {
      if (repli) return;
      _lipStop = lipSync(a, allMouths(root)); /* null = moteur audio pas reveille -> bouche CSS */
      var p = a.play();
      if (p && p.catch) p.catch(function () { versTelephone(); });
    }, { once: true });
    a.addEventListener('ended', function () { stopTalking(root); }, { once: true });
    a.addEventListener('error', versTelephone, { once: true });
    /* le son ne vient jamais : on ne la laisse pas muette */
    setTimeout(function () { if (!repli && a.readyState < 2) versTelephone(); }, 4000);
    try {
      a.src = BEE_TTS + '?v=' + BEE_VOIX + '&t=' + encodeURIComponent(text.slice(0, 600));
      _voixAudio = a;
      a.load();
    } catch (_) { versTelephone(); }
  }

  var DOMAIN_APPS = {
    'arbre|généalog|famille|arrière.grand.père|arrière grand père': 'https://arbre.kd-mc.com',
    'lingua|langue|apprendre.*(langue|anglais|italien)|monégasque': 'https://lingua.kd-mc.com',
    'apex|assistant ia avancé': 'https://apex.kd-mc.com',
    'planning|cmcteams|équipe|départ': 'https://cmcteams.kd-mc.com',
  };

  function tryLocalIntent(text, respond) {
    var t = text.toLowerCase();
    for (var pattern in DOMAIN_APPS) {
      if (new RegExp(pattern, 'i').test(t) && /ouvre|va sur|montre|affiche|lance/.test(t)) {
        var url = DOMAIN_APPS[pattern];
        respond('J\'ouvre ça pour toi 👉 ' + url);
        setTimeout(function () { window.open(url, '_blank', 'noopener'); }, 300);
        return true;
      }
    }
    if (/m[eé]t[eé]o|temps.*(fera|fait)|pleuvoir|prévisions?/.test(t)) {
      var give = function (lat, lon, place) {
        fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
              '&current=temperature_2m,weather_code&timezone=auto')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var c = j && j.current;
            var temp = c ? Math.round(c.temperature_2m) : null;
            respond(temp !== null
              ? ('Il fait ' + temp + '°C' + (place ? ' à ' + place : '') + ' en ce moment.')
              : 'Je n\'ai pas réussi à lire la météo, réessaie.');
          })
          .catch(function () { respond('Météo indisponible là, réessaie.'); });
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function (pos) { give(pos.coords.latitude, pos.coords.longitude, ''); },
          function () { give(43.7325, 7.4197, 'Monaco'); },
          { timeout: 4000 }
        );
      } else { give(43.7325, 7.4197, 'Monaco'); }
      return true;
    }
    if (/envoie.*message|écris.*à|planning.*modifi|change.*planning/.test(t)) {
      try { localStorage.setItem('apex_v13_chat_prefill', text); } catch (_) {}
      respond('Ça, je te l\'ouvre dans Apex (lui a accès à ton compte et peut vraiment agir) — ta question est déjà écrite, tu n\'as qu\'à valider.');
      setTimeout(function () { window.open('https://apex.kd-mc.com/#chat', '_blank', 'noopener'); }, 500);
      return true;
    }
    return false;
  }

  /* ============================================================
     5. Chat — apis.kd-mc.com/ai (Qwen gratuit d'abord, déjà en prod)
     ============================================================ */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HIST) || '[]'); } catch (_) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(STORAGE_HIST, JSON.stringify(h.slice(-MAX_HISTORY))); } catch (_) {}
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

  function addBubble(root, role, text, meta) {
    var list = root.querySelector('#javis-msgs');
    var b = document.createElement('div');
    b.className = 'javis-bub ' + (role === 'user' ? 'me' : 'js');
    b.textContent = text;
    if (meta) { var small = document.createElement('small'); small.textContent = meta; b.appendChild(small); }
    list.appendChild(b);
    list.scrollTop = list.scrollHeight;
  }

  function askJavis(root, text) {
    addBubble(root, 'user', text);
    var hist = loadHistory();
    hist.push({ role: 'user', content: text });
    saveHistory(hist);

    var handled = tryLocalIntent(text, function (reply) {
      addBubble(root, 'javis', reply);
      var h = loadHistory(); h.push({ role: 'assistant', content: reply }); saveHistory(h);
      speak(root, reply);
    });
    if (handled) return;

    setThinking(root, true);
    showTyping(root, true);
    var messages = hist.slice(-10).map(function (m) { return { role: m.role, content: m.content }; });
    fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages,
        system: 'Tu es Bee, l\'assistante personnelle de Kevin sur son domaine kd-mc.com (le même personnage que dans son app Lingua). ' +
          'Réponds court, chaleureuse, enjouée, tutoiement, en français. Si la demande exige une action réelle ' +
          '(envoyer un message, modifier des données), dis-le clairement plutôt que de prétendre l\'avoir faite.',
        max_tokens: 500,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        setThinking(root, false);
        showTyping(root, false);
        var ok = !!(j && j.ok && j.text);
        var out = ok ? j.text : 'Je n\'ai pas réussi à répondre là, réessaie dans un instant.';
        var meta = ok ? (j.provider + (j.provider === 'qwen' ? ' (gratuit)' : '')) : null;
        addBubble(root, 'javis', out, meta);
        allRigs(root).forEach(function (r) { react(r, ok ? 'joie' : 'triste', ok ? 1200 : 1600); });
        if (ok) { tone([660, 880], .2); vibrate(8); }
        var h = loadHistory(); h.push({ role: 'assistant', content: out }); saveHistory(h);
        speak(root, out);
      })
      .catch(function () {
        setThinking(root, false);
        showTyping(root, false);
        allRigs(root).forEach(function (r) { react(r, 'triste', 1600); });
        addBubble(root, 'javis', 'Le réseau ne répond pas là, réessaie dans un instant.');
      });
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
    if (h.indexOf('arbre') === 0) return { nom: 'ton arbre de famille', quoi: 'Tu cherches quelqu\'un ? Je peux t\'aider à retrouver une fiche.' };
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
        if (!ouvert && fois < 3) {
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
      '<div id="javis-msgs"></div>' +
      '<form id="javis-form"><textarea id="javis-input" placeholder="Demande-moi n\'importe quoi…" rows="1"></textarea>' +
      '<button id="javis-mic" type="button" aria-label="Dicter">🎙</button>' +
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
      var M = mascCfg();
      var lanceur = wrap.querySelector('#javis-launcher');
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
      var grosRig = wrap.querySelector('#javis-launcher .bee-rig');
      initVideo(grosRig);
      (function vieLoop() {
        setTimeout(function () {
          if (!document.contains(wrap)) return;
          if (VID.pret && !document.body.classList.contains('javis-closeup')) {
            var ks = ['fly', 'walk', 'dance'];
            clip(grosRig, ks[Math.floor(Math.random() * ks.length)], 2.6 + Math.random() * 1.8);
          }
          vieLoop();
        }, 9000 + Math.random() * 7000);
      })();
    }

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
    try { localStorage.setItem(STORAGE_SEEN, String(Date.now())); } catch (_) {}
    if (APP_MODE) { panel.classList.add('javis-open'); } else { ennui(wrap); }

    wrap.querySelector('#javis-launcher').addEventListener('click', function () {
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
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim();
      if (!v) return;
      input.value = '';
      vibrate(6);
      askJavis(wrap, v);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });

    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Recognition) {
      var rec = new Recognition();
      rec.lang = 'fr-FR';
      rec.interimResults = false;
      mic.addEventListener('click', function () {
        if (mic.classList.contains('on')) { try { rec.stop(); } catch (_) {} return; }
        try { rec.start(); mic.classList.add('on'); } catch (_) {}
      });
      rec.onresult = function (e) {
        var t = e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript;
        if (t) { input.value = t; form.requestSubmit(); }
      };
      rec.onend = function () { mic.classList.remove('on'); };
      rec.onerror = function () { mic.classList.remove('on'); };
    } else { mic.style.display = 'none'; }
  }

  /* ============================================================
     7. Go — visibilité fail-closed (admin only), réseau fail-open
     ============================================================ */
  function boot() {
    checkAdmin(function (isAdmin) {
      if (!isAdmin) {
        /* Sur une page normale : rien du tout, la page reste intacte.
           Dans l'app dédiée : on le DIT, sinon écran noir inexplicable. */
        if (window.JAVIS_MODE === 'app') {
          document.body.innerHTML = '<div style="min-height:100dvh;display:flex;flex-direction:column;' +
            'align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;' +
            'background:#0e0a04;color:#a4906a;font:15px/1.5 -apple-system,sans-serif">' +
            '<div style="font-size:44px">🔒</div>' +
            '<b style="color:#f6b73c;font-size:17px">Bee est personnelle à Kevin</b>' +
            '<p style="max-width:300px;margin:0">Connecte-toi d\'abord sur le domaine (Face ID), puis rouvre Bee.</p></div>';
        }
        return;
      }
      mount();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
