/* 🎙️ LES VOIX CHOISIES PARLENT DANS TOUT LE DOMAINE, DANS UN ORDRE DE SECOURS (Kevin 11.11.2026 : « intègre toutes dans les apps, je peux choisir partout et
   changer. Changement auto si quota avec l'ordre défini »).

   COMMENT (même couche partagée que Bee et le bouton ✉️ : le routeur sert TOUTES les pages, la prochaine adresse l'a sans qu'on y pense) :
     1. le routeur pose UNE ligne sur chaque page HTML : <script src="/__voix/partout.js" defer> (seulement si la page accepte nos scripts) ;
     2. ce script NE FAIT RIEN tant que la personne n'a pas choisi de voix (cookie `kdmc_voix`, posé sur tout *.kd-mc.com par la page /__voix/choisir) :
        aucune requête, aucune modification — chaque app garde sa voix d'avant ;
     3. avec un choix, le cookie porte une LISTE ORDONNÉE (« gemini.nova_piper.mls_… ») : la voix n°1 parle ; si elle échoue (quota épuisé, panne, refus), la n°2 prend
        le relais, puis la n°3… et la voix en échec est mise en pause (15 min Gemini, 5 min Piper) pour ne pas être redemandée à chaque phrase ;
     4. DEUX portes captées : `speechSynthesis.speak` (les apps qui parlent par le téléphone) et `fetch('/__lingua/tts?…')` (Lingua, l'arbre, Bee : elles reçoivent un son
        du domaine, mais celui de la voix choisie). Si TOUTE la liste échoue, la voix d'origine de l'app reprend (jamais de silence).
   Voix servies : Gemini gratuit (par le routeur) et Piper (dans le navigateur, cadre isolé /__voix/moteur : Hugging Face + jsDelivr, ~70 Mo une fois par appareil).
   Supertonic (~400 Mo) et Kokoro demandent un serveur : pas encore dans la liste (honnête dans le catalogue).
   Interrupteur : VOIX_PARTOUT = '0' coupe la pose ; une page se retire avec <meta name="kdmc-voix" content="off">.
   node services/kdmc-router/voix-partout.test.mjs  ·  tests/verify-voix-partout-navigateur.mjs */

export const VOIX_TAG = '<script src="/__voix/partout.js" defer></script>';
export const COOKIE = 'kdmc_voix';
/* id du catalogue → « moteur.param » (liste fermée : jamais une valeur libre côté client) */
export const CHOIX = {
  'gemini-kore': 'gemini.alloy', 'gemini-aoede': 'gemini.nova', 'gemini-leda': 'gemini.shimmer', 'gemini-puck': 'gemini.echo', 'gemini-charon': 'gemini.fable', 'gemini-orus': 'gemini.onyx',
  'piper-siwis': 'piper.siwis', 'piper-mls': 'piper.mls', 'piper-upmc': 'piper.upmc', 'piper-tom': 'piper.tom',   // mls_1840 et gilles (modèles « low ») plantent dans le navigateur : mesuré 11.11
};
export const PIPER_IDS = { siwis: 'fr_FR-siwis-medium', mls: 'fr_FR-mls-medium', upmc: 'fr_FR-upmc-medium', tom: 'fr_FR-tom-medium' };
/* L'ordre de secours PAR DÉFAUT (la voix choisie passe devant) : les belles voix d'abord, les voix du navigateur ensuite. */
export const DEFAUT = ['gemini.nova', 'gemini.alloy', 'gemini.shimmer', 'gemini.echo', 'gemini.fable', 'gemini.onyx', 'piper.mls', 'piper.siwis', 'piper.tom', 'piper.upmc'];
export const NOMS = { 'gemini.alloy': 'Kore', 'gemini.nova': 'Aoede', 'gemini.shimmer': 'Leda', 'gemini.echo': 'Puck', 'gemini.fable': 'Charon', 'gemini.onyx': 'Orus', 'piper.siwis': 'Piper · Siwis', 'piper.mls': 'Piper · MLS', 'piper.upmc': 'Piper · UPMC', 'piper.tom': 'Piper · Tom' };
const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/* Servie telle quelle (`toString`) sur /__voix/partout.js : AUTONOME, aucune variable extérieure. */
export function partoutVoix() {
  'use strict';
  var NOMS = { 'gemini.alloy': 'Kore', 'gemini.nova': 'Aoede', 'gemini.shimmer': 'Leda', 'gemini.echo': 'Puck', 'gemini.fable': 'Charon', 'gemini.onyx': 'Orus', 'piper.siwis': 'Piper · Siwis', 'piper.mls': 'Piper · MLS', 'piper.upmc': 'Piper · UPMC', 'piper.tom': 'Piper · Tom' };
  var PAUSE = { gemini: 15 * 60e3, piper: 5 * 60e3 };   // une voix en échec est laissée tranquille (quota : ne pas insister)

  /* Le moteur : essaie la liste dans l'ordre. `liste` = ['gemini.nova', 'piper.mls', …]. Rend { blobs, cle } ou refuse (toute la liste a échoué). */
  function fabrique(liste, opt) {
    opt = opt || {};
    var cadre = null, attente = {}, n = 0, of = opt.fetch || window.fetch.bind(window);
    function pauses() { try { return JSON.parse(localStorage.getItem('kdmc_voix_pause') || '{}') || {}; } catch (e) { return {}; } }
    function pauser(cle) { try { var p = pauses(); p[cle] = Date.now() + (PAUSE[cle.split('.')[0]] || 600e3); localStorage.setItem('kdmc_voix_pause', JSON.stringify(p)); } catch (e) { /* stockage fermé */ } }
    function enPause(cle) { return (pauses()[cle] || 0) > Date.now(); }
    function morceaux(t) {   // phrases de ≤ 300 caractères : la voix part vite, et le service n'a jamais un texte trop long
      var out = [], cur = '';
      String(t).replace(/\s+/g, ' ').split(/(?<=[.!?…;:])\s+/).forEach(function (s) {
        if ((cur + ' ' + s).length > 300 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
      });
      if (cur) out.push(cur);
      return out.map(function (x) { return x.slice(0, 300); });
    }
    function gemini(texte, lang, param) {   // une voix qui TRAÎNE est une voix en échec : passé le délai (15 s), on abandonne et la suivante prend le relais
      var ac = typeof AbortController === 'function' ? new AbortController() : null, fini = false;
      var delai = window.__kdmcVoixDelai || 15000;
      return new Promise(function (ok, ko) {
        var to = setTimeout(function () { if (!fini) { fini = true; if (ac) { try { ac.abort(); } catch (e) { /* déjà fini */ } } ko(new Error('delai_voix')); } }, delai);
        of('/__lingua/tts?gratuit=1&l=' + encodeURIComponent(lang) + '&i=douce&v=' + encodeURIComponent(param) + '&t=' + encodeURIComponent(texte), { credentials: 'omit', signal: ac ? ac.signal : undefined })
          .then(function (r) { var ct = r.headers.get('content-type') || ''; if (!r.ok || !/audio/i.test(ct)) throw new Error('voix_indisponible'); return r.blob(); })
          .then(function (b) { if (!fini) { fini = true; clearTimeout(to); ok(b); } }, function (e) { if (!fini) { fini = true; clearTimeout(to); ko(e); } });
      });
    }
    function piper(texte, param) {
      return new Promise(function (ok, ko) {
        if (!cadre) {
          cadre = document.createElement('iframe'); cadre.src = '/__voix/moteur'; cadre.setAttribute('aria-hidden', 'true'); cadre.tabIndex = -1;
          cadre.style.cssText = 'position:fixed;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9px;top:-9px';
          cadre.__file = [];
          window.addEventListener('message', function (e) {
            if (e.source !== cadre.contentWindow || !e.data || e.origin !== location.origin) return;
            if (e.data.pret) { cadre.__pret = true; cadre.__file.splice(0).forEach(function (f) { f(); }); return; }
            var w = attente[e.data.id]; if (!w) return; delete attente[e.data.id];
            if (e.data.wav) w.ok(new Blob([e.data.wav], { type: 'audio/wav' })); else w.ko(new Error(e.data.err || 'piper'));
          });
          document.documentElement.appendChild(cadre);
          setTimeout(function () { if (!cadre.__pret) { cadre.__mort = true; Object.keys(attente).forEach(function (k) { var w = attente[k]; delete attente[k]; w.ko(new Error('moteur_absent')); }); } }, 10000);   // cadre bloqué par la page : on le sait en 10 s
        }
        if (cadre.__mort) return ko(new Error('moteur_absent'));
        var id = ++n; attente[id] = { ok: ok, ko: ko };
        var envoi = function () { cadre.contentWindow.postMessage({ id: id, texte: texte, voix: param }, location.origin); };
        if (cadre.__pret) envoi(); else cadre.__file.push(envoi);
        setTimeout(function () { if (attente[id]) { delete attente[id]; ko(new Error('delai')); } }, 120000);   // 1er usage : le modèle (~70 Mo) se télécharge
      });
    }
    function essai(cle, texte, lang) {
      var p = cle.split('.'), m = morceaux(texte);
      return Promise.all(m.map(function (x) { return p[0] === 'piper' ? piper(x, p[1]) : gemini(x, lang, p[1]); }));
    }
    function chaine(texte, lang) {
      var l = (lang || 'fr').slice(0, 2).toLowerCase(), i = 0;
      function suite() {
        while (i < liste.length && enPause(liste[i])) i++;                       // voix en pause (quota) : on saute
        if (i >= liste.length) return Promise.reject(new Error('liste_epuisee'));
        var cle = liste[i++];
        return essai(cle, texte, l).then(function (blobs) { return { blobs: blobs, cle: cle }; }, function () { pauser(cle); return suite(); });   // échec : pause + voix suivante
      }
      return suite();
    }
    return chaine;
  }

  /* Des blocs WAV (même format, en-tête de 44 octets) → UN seul fichier ; des blocs MP3 → mis bout à bout. */
  function fusion(blobs) {
    if (blobs.length === 1) return Promise.resolve(blobs[0]);
    if (!/wav/i.test(blobs[0].type)) return Promise.resolve(new Blob(blobs, { type: blobs[0].type || 'audio/mpeg' }));
    return Promise.all(blobs.map(function (b) { return b.arrayBuffer(); })).then(function (bufs) {
      var corps = bufs.map(function (b, i) { return new Uint8Array(b, i ? 44 : 0); });
      var tete = new Uint8Array(bufs[0].slice(0, 44)), taille = corps.reduce(function (a, c, i) { return a + c.length - (i ? 0 : 44); }, 0);
      var dv = new DataView(tete.buffer); dv.setUint32(4, 36 + taille, true); dv.setUint32(40, taille, true);
      return new Blob([tete].concat(corps.map(function (c, i) { return i ? c : c.subarray(44); })), { type: 'audio/wav' });
    });
  }

  function installer() {
    try {
      if (window.__kdmcVoix) return;
      if (window.__kdmcVoixTest) { window.kdmcVoixFabrique = fabrique; window.kdmcVoixNoms = NOMS; }   // la page « Choisir mes voix » essaie une voix sans la poser (AVANT le retrait : elle se retire elle-même)
      var meta = document.querySelector('meta[name="kdmc-voix"]');
      if (meta && /^(off|non|0)$/i.test(meta.getAttribute('content') || '')) return;
      var m = (document.cookie.match(/(?:^|;\s*)kdmc_voix=((?:(?:gemini|piper)\.[a-z0-9]{1,12})(?:_(?:gemini|piper)\.[a-z0-9]{1,12}){0,11})(?:;|$)/) || [])[1];
      if (!m) return;                                                          // aucun choix : on ne change RIEN
      var liste = m.split('_').filter(function (c) { return NOMS[c]; });
      if (!liste.length) return;
      window.__kdmcVoix = m;
      var of = window.fetch.bind(window), chaine = fabrique(liste, { fetch: of });
      var ss = window.speechSynthesis;
      var jeton = 0, audio = null, urls = [], enCours = false, dernier = '';
      function nettoyer() { if (audio) { try { audio.pause(); } catch (e) { /* fini */ } audio = null; } urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* fini */ } }); urls = []; enCours = false; }
      function evt(u, type) { try { u.dispatchEvent(new Event(type)); } catch (e) { /* l'app n'écoute pas */ } }
      function annonce(cle) {   // un petit rappel, 3 s, seulement quand une voix du domaine PARLE ET que ce n'est pas la n°1 (secours) : la voix a changé toute seule
        if (cle === dernier) return; var premiere = !dernier; dernier = cle;
        if (premiere && cle === liste[0]) return;
        try {
          var d = document.createElement('a'); d.href = '/__voix/choisir'; d.textContent = '🔊 ' + (NOMS[cle] || cle) + (cle === liste[0] ? '' : ' (voix de secours)') + ' · changer';
          var s = d.style; s.position = 'fixed'; s.top = 'calc(env(safe-area-inset-top,0px) + 8px)'; s.left = '50%'; s.transform = 'translateX(-50%)'; s.zIndex = '2147482000';
          s.minHeight = '44px'; s.display = 'inline-flex'; s.alignItems = 'center'; s.padding = '0 16px'; s.borderRadius = '22px'; s.background = 'rgba(20,24,24,.92)'; s.color = '#fff'; s.font = '600 14px/1.2 -apple-system,system-ui,sans-serif'; s.textDecoration = 'none'; s.maxWidth = '92vw';
          document.documentElement.appendChild(d); setTimeout(function () { try { d.remove(); } catch (e) { /* déjà parti */ } }, 3500);
        } catch (e) { /* jamais d'erreur dans la page d'une app */ }
      }

      /* PORTE 1 : la voix du téléphone */
      if (ss && window.SpeechSynthesisUtterance && window.top === window.self) {
        var orig = ss.speak.bind(ss), origCancel = ss.cancel.bind(ss);
        ss.speak = function (u) {
          var t = u && typeof u.text === 'string' ? u.text.trim() : '';
          if (!t) return orig(u);
          var j = ++jeton; nettoyer(); try { origCancel(); } catch (e) { /* rien à couper */ }
          enCours = true;
          chaine(t, u.lang).then(function (r) {
            if (j !== jeton) return;
            annonce(r.cle);
            var blobs = r.blobs, i = 0; audio = new Audio();
            if (typeof u.volume === 'number') audio.volume = Math.max(0, Math.min(1, u.volume));
            function suite() {
              if (j !== jeton) return;
              if (i >= blobs.length) { nettoyer(); evt(u, 'end'); return; }
              var url = URL.createObjectURL(blobs[i++]); urls.push(url); audio.src = url;
              audio.play().then(function () { if (i === 1) evt(u, 'start'); }).catch(function () { if (j === jeton) { nettoyer(); orig(u); } });
            }
            audio.onended = suite; audio.onerror = function () { if (j === jeton) { nettoyer(); orig(u); } };
            suite();
          }).catch(function () { if (j === jeton) { nettoyer(); orig(u); } });   // toute la liste a échoué : la voix de l'app prend le relais
        };
        ss.cancel = function () { jeton++; nettoyer(); return origCancel(); };
        try { Object.defineProperty(ss, 'speaking', { configurable: true, get: function () { return enCours; } }); } catch (e) { /* propriété figée */ }
      }

      /* PORTE 2 : les apps qui demandent un son au domaine (Lingua, l'arbre, Bee) reçoivent un son de la voix CHOISIE */
      window.fetch = function (input, init) {
        try {
          var u = typeof input === 'string' ? input : (input && input.url) || '';
          var mth = (init && init.method) || (input && input.method) || 'GET';
          if (/\/__lingua\/tts\?/.test(u) && /^get$/i.test(mth)) {
            var q = new URL(u, location.href).searchParams, t = q.get('t') || '';
            if (t.trim()) {
              return chaine(t, q.get('l') || 'fr').then(function (r) { annonce(r.cle); return fusion(r.blobs).then(function (b) { return new Response(b, { status: 200, headers: { 'content-type': b.type || 'audio/mpeg', 'x-voix': 'kdmc-choix:' + r.cle } }); }); })
                .catch(function () { return of(input, init); });   // toute la liste a échoué : la demande d'origine de l'app part, comme avant
            }
          }
        } catch (e) { /* jamais d'erreur dans la page d'une app */ }
        return of(input, init);
      };
    } catch (e) { /* jamais d'erreur dans la page d'une app */ }
  }
  installer();
}

/* Le cadre isolé : il fait tourner Piper (jsDelivr + Hugging Face). Sa CSP est la sienne : celle de l'app ne le touche pas, et il ne touche à aucune app. */
export function pageMoteur() {
  return '<!doctype html><meta charset="utf-8"><title>moteur de voix</title><script type="module">'
    + 'const IDS = ' + JSON.stringify(PIPER_IDS) + ';'
    + 'const WASM = { onnxWasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/", piperData: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data", piperWasm: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm" };'
    + 'let lib = null; const sessions = {}; let file = Promise.resolve();'
    + 'async function session(cle) { lib = lib || await import("https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm"); if (!sessions[cle]) sessions[cle] = lib.TtsSession.create({ voiceId: IDS[cle], wasmPaths: WASM }); return sessions[cle]; }'
    + 'parent.postMessage({ pret: 1 }, location.origin);'
    + 'addEventListener("message", (e) => { if (e.origin !== location.origin || e.source !== parent || !e.data) return; const { id, texte, voix } = e.data;'
    + ' file = file.then(async () => { try { if (!IDS[voix] || typeof texte !== "string") throw new Error("voix_inconnue"); const s = await session(voix); const wav = await s.predict(texte.slice(0, 400)); const buf = await wav.arrayBuffer(); parent.postMessage({ id, wav: buf }, location.origin, [buf]); } catch (err) { parent.postMessage({ id, err: String(err && err.message || err).slice(0, 120) }, location.origin); } }); });'
    + '</script>';
}
export const CSP_MOTEUR = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co; worker-src blob:; frame-ancestors https://kd-mc.com https://*.kd-mc.com";

/* La page « Choisir mes voix » : la liste ORDONNÉE (la n°1 parle, les suivantes prennent le relais quand le quota est épuisé), ▲ ▼ pour changer l'ordre, ▶ pour écouter. */
export function pageChoisir() {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="kdmc-voix" content="off"><title>Choisir mes voix</title>'
    + '<style>:root{--bg:#f6f4f0;--fg:#1d1b19;--mut:#6b655e;--card:#fff;--line:#e0dad2;--acc:#1f5f5b;--accfg:#fff}@media(prefers-color-scheme:dark){:root{--bg:#15191a;--fg:#ece8e2;--mut:#9a948c;--card:#1d2223;--line:#2d3436;--acc:#6fc2bb;--accfg:#0f1a19}}'
    + 'body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,sans-serif;padding:20px max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}main{max-width:640px;margin:0 auto}h1{font-size:1.5rem;margin:0 0 6px}p{color:var(--mut);margin:0 0 14px}'
    + 'ol{list-style:none;margin:0;padding:0;display:grid;gap:8px}li{display:flex;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-width:0;flex-wrap:wrap}li:first-child{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc) inset}'
    + 'button{min-height:44px;min-width:44px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;padding:0 12px;cursor:pointer}button.go{background:var(--acc);color:var(--accfg);border-color:var(--acc)}.rang{font-weight:700;min-width:1.6em;text-align:center}.nom{flex:1;min-width:8em;overflow-wrap:anywhere}.nom small{display:block;color:var(--mut)}#msg{min-height:1.4em;margin:14px 0 0;color:var(--mut)}</style></head><body><main>'
    + '<h1>Choisir mes voix</h1><p>La voix n°1 parle dans toutes les apps du domaine, sur cet appareil. Si elle n\'a plus de quota ou ne répond pas, la n°2 prend le relais, puis la n°3… Change l\'ordre avec ▲ ▼. Sans choix, chaque app garde sa voix.</p><ol id="l"></ol><p id="msg" role="status"></p><p><button id="rien">Reprendre la voix de chaque app</button></p></main>'
    + '<script>window.__kdmcVoixTest=true;</script><script src="/__voix/partout.js"></script><script>'
    + '(function(){var DEF=' + JSON.stringify(DEFAUT) + ';var CH=' + JSON.stringify(CHOIX) + ';var L=document.getElementById("l"),M=document.getElementById("msg");var info={};var a=null;'
    + 'function lire(){var m=(document.cookie.match(/(?:^|;\\s*)kdmc_voix=([a-z0-9._]+(?:_[a-z0-9._]+)*)(?:;|$)/)||[])[1];var l=m?m.split("_").filter(function(c){return info[c]}):[];DEF.forEach(function(c){if(info[c]&&l.indexOf(c)<0)l.push(c)});return l;}'
    + 'function pose(l){var d=/(?:^|\\.)kd-mc\\.com$/.test(location.hostname)?"; Domain=.kd-mc.com; Secure":"";document.cookie="kdmc_voix="+(l?l.join("_"):"")+d+"; Path=/; Max-Age="+(l?31536000:0)+"; SameSite=Lax";}'
    + 'var choisi=function(){return /(?:^|;\\s*)kdmc_voix=/.test(document.cookie)};'
    + 'function dessiner(){var l=lire();L.textContent="";l.forEach(function(c,i){var v=info[c];var li=document.createElement("li");var r=document.createElement("span");r.className="rang";r.textContent=String(i+1);var n=document.createElement("div");n.className="nom";n.textContent=v.nom;var s=document.createElement("small");s.textContent=(v.genre==="f"?"Femme · ":v.genre==="h"?"Homme · ":"")+v.licence+(c.indexOf("piper")===0?" · 1er essai : téléchargement (~70 Mo)":"");n.appendChild(s);'
    + 'li.appendChild(r);li.appendChild(n);'
    + 'function b(t,f,cl,label){var x=document.createElement("button");x.textContent=t;if(cl)x.className=cl;x.setAttribute("aria-label",label);x.onclick=f;li.appendChild(x);return x;}'
    + 'var e=b("▶",function(){ecouter(c,e)},"","Écouter "+v.nom);'
    + 'b("▲",function(){if(i>0){var t=l[i-1];l[i-1]=l[i];l[i]=t;pose(l);M.textContent="Ordre enregistré.";dessiner();}},"","Monter "+v.nom);'
    + 'b("▼",function(){if(i<l.length-1){var t=l[i+1];l[i+1]=l[i];l[i]=t;pose(l);M.textContent="Ordre enregistré.";dessiner();}},"","Descendre "+v.nom);'
    + 'if(i>0)b("En n°1",function(){l.splice(i,1);l.unshift(c);pose(l);M.textContent=v.nom+" est maintenant la voix n°1.";dessiner();},"go","Mettre "+v.nom+" en première");'
    + 'L.appendChild(li);});}'
    + 'function ecouter(c,b){if(a){a.pause();a=null;}b.textContent="…";M.textContent="Je prépare la voix…";window.kdmcVoixFabrique([c])("Bonjour, voici ma voix. Elle te lira tes messages et tes histoires.","fr").then(function(r){var bl=r.blobs,i=0;a=new Audio();function s(){if(i>=bl.length){b.textContent="▶";M.textContent="";return;}a.src=URL.createObjectURL(bl[i++]);a.onended=s;a.play();}b.textContent="■";M.textContent="";s();}).catch(function(){b.textContent="▶";M.textContent="Cette voix ne répond pas pour l\\u2019instant. Mets-la plus bas dans la liste.";});}'
    + 'document.getElementById("rien").onclick=function(){pose(null);M.textContent="Chaque app reprend sa voix.";dessiner();};'
    + 'fetch("/__voix/catalogue?langue=fr").then(function(r){return r.json()}).then(function(j){(j.voix||[]).forEach(function(v){var c=CH[v.id];if(c)info[c]=v;});dessiner();}).catch(function(){M.textContent="La liste des voix ne répond pas."});})();</script></body></html>';
}

/* ⚠ `toString()` rend le code APRÈS le paquetage de wrangler (esbuild « keep_names ») : il y ajoute des appels `__name(f, "f")` dont l'aide n'existe que dans le Worker → ReferenceError dans
   la page (mesuré en ligne le 11.11 : « __name is not defined » sur le portail). Même remède que Bee et le bouton ✉️ : on la définit en tête du script servi. */
export const SCRIPT_JS = '(function(){var __name=function(f){return f};(' + partoutVoix.toString() + ')();})();';

export async function handleVoixPartout(request, url, env) {
  const p = url.pathname;
  if (request.method !== 'GET') return null;
  if (p === '/__voix/partout.js') {
    return new Response(SCRIPT_JS, { status: 200, headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }
  if (p === '/__voix/moteur') {
    return new Response(pageMoteur(), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP_MOTEUR, 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'public, max-age=300' } });
  }
  if (p === '/__voix/choisir') {
    return new Response(pageChoisir(), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src blob:; frame-src 'self'", 'x-frame-options': 'DENY', 'cache-control': 'no-store' } });
  }
  return null;
}
