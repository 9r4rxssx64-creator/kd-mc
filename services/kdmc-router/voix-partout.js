/* 🎙️ LES VOIX CHOISIES PARLENT DANS TOUT LE DOMAINE (Kevin 11.11.2026 : « que chaque app du domaine, tout mon domaine, se serve de toutes les voix au choix »).

   COMMENT (même couche partagée que Bee et le bouton ✉️ : le routeur sert TOUTES les pages, la prochaine adresse l'a sans qu'on y pense) :
     1. le routeur pose UNE ligne sur chaque page HTML : <script src="/__voix/partout.js" defer> (seulement si la page accepte nos scripts) ;
     2. ce script NE FAIT RIEN tant que la personne n'a pas choisi de voix (cookie `kdmc_voix`, posé sur tout *.kd-mc.com par la page /__voix/choisir) :
        aucune requête, aucune modification — chaque app garde sa voix d'avant ;
     3. avec un choix, il remplace `speechSynthesis.speak` : la phrase est dite par la voix choisie, puis les événements `start` / `end` sont rendus à l'app
        comme avec la voix du téléphone. Si la voix choisie échoue, la voix d'origine de l'app prend le relais (jamais de silence).
   Voix servies : Gemini gratuit (par le routeur, /__lingua/tts) et Piper (dans le navigateur, cadre isolé /__voix/moteur : Hugging Face + jsDelivr,
   téléchargé UNE fois par appareil puis gardé). Supertonic (~400 Mo) et Kokoro demandent un serveur : pas encore proposés (honnête dans le catalogue).
   Interrupteur : VOIX_PARTOUT = '0' coupe la pose ; une page se retire avec <meta name="kdmc-voix" content="off">.
   node services/kdmc-router/voix-partout.test.mjs */

export const VOIX_TAG = '<script src="/__voix/partout.js" defer></script>';
export const COOKIE = 'kdmc_voix';
/* id du catalogue → valeur du cookie « moteur.param » (la liste fermée : jamais une valeur libre côté client) */
export const CHOIX = {
  'gemini-kore': 'gemini.alloy', 'gemini-aoede': 'gemini.nova', 'gemini-leda': 'gemini.shimmer', 'gemini-puck': 'gemini.echo', 'gemini-charon': 'gemini.fable', 'gemini-orus': 'gemini.onyx',
  'piper-siwis': 'piper.siwis', 'piper-mls': 'piper.mls', 'piper-upmc': 'piper.upmc', 'piper-tom': 'piper.tom',   // mls_1840 et gilles (modèles « low ») plantent dans le navigateur : mesuré 11.11, non proposés
};
export const PIPER_IDS = { siwis: 'fr_FR-siwis-medium', mls: 'fr_FR-mls-medium', upmc: 'fr_FR-upmc-medium', tom: 'fr_FR-tom-medium' };
const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/* Servie telle quelle (`toString`) sur /__voix/partout.js : AUTONOME, aucune variable extérieure. */
export function partoutVoix() {
  'use strict';
  function fabrique(choix) {
    var p = String(choix || '').split('.'), moteur = p[0], param = p[1] || '';
    var cadre = null, attente = {}, n = 0;
    function morceaux(t) {   // phrases de ≤ 300 caractères : la voix part vite, et le service n'a jamais un texte trop long
      var out = [], cur = '';
      String(t).replace(/\s+/g, ' ').split(/(?<=[.!?…;:])\s+/).forEach(function (s) {
        if ((cur + ' ' + s).length > 300 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
      });
      if (cur) out.push(cur);
      return out.map(function (x) { return x.slice(0, 300); });
    }
    function gemini(texte, lang) {
      return fetch('/__lingua/tts?gratuit=1&l=' + encodeURIComponent(lang) + '&i=douce&v=' + encodeURIComponent(param) + '&t=' + encodeURIComponent(texte), { credentials: 'omit' })
        .then(function (r) { var ct = r.headers.get('content-type') || ''; if (!r.ok || !/audio/i.test(ct)) throw new Error('voix_indisponible'); return r.blob(); });
    }
    function piper(texte) {
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
          setTimeout(function () { if (!cadre.__pret) { cadre.__mort = true; Object.keys(attente).forEach(function (k) { var w = attente[k]; delete attente[k]; w.ko(new Error('moteur_absent')); }); } }, 10000);   // cadre bloqué par la page : on le sait en 10 s, pas en 2 min
        }
        if (cadre.__mort) return ko(new Error('moteur_absent'));
        var id = ++n; attente[id] = { ok: ok, ko: ko };
        var envoi = function () { cadre.contentWindow.postMessage({ id: id, texte: texte, voix: param }, location.origin); };
        if (cadre.__pret) envoi(); else cadre.__file.push(envoi);
        setTimeout(function () { if (attente[id]) { delete attente[id]; ko(new Error('delai')); } }, 120000);   // 1er usage : le modèle (~60 Mo) se télécharge
      });
    }
    return function (texte, lang) {   // → liste de Blob audio, dans l'ordre
      var l = (lang || 'fr').slice(0, 2).toLowerCase();
      var m = morceaux(texte);
      return moteur === 'piper' ? Promise.all(m.map(piper)) : Promise.all(m.map(function (x) { return gemini(x, l); }));
    };
  }

  function installer() {
    try {
      if (window.__kdmcVoix) return;
      if (window.__kdmcVoixTest) { window.kdmcVoixFabrique = fabrique; }   // la page « Choisir mes voix » essaie une voix sans la poser (AVANT le retrait : cette page se retire elle-même)
      var meta = document.querySelector('meta[name="kdmc-voix"]');
      if (meta && /^(off|non|0)$/i.test(meta.getAttribute('content') || '')) return;
      var m = (document.cookie.match(/(?:^|;\s*)kdmc_voix=((?:gemini|piper)\.[a-z0-9]{1,12})(?:;|$)/) || [])[1];
      if (!m) return;                                                          // aucun choix : on ne change RIEN
      var ss = window.speechSynthesis;
      if (!ss || !window.SpeechSynthesisUtterance || window.top !== window.self) return;
      window.__kdmcVoix = m;
      var dire = fabrique(m), orig = ss.speak.bind(ss), origCancel = ss.cancel.bind(ss);
      var jeton = 0, audio = null, urls = [], enCours = false;
      function nettoyer() { if (audio) { try { audio.pause(); } catch (e) { /* fini */ } audio = null; } urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* fini */ } }); urls = []; enCours = false; }
      function evt(u, type) { try { u.dispatchEvent(new Event(type)); } catch (e) { /* l'app n'écoute pas */ } }
      ss.speak = function (u) {
        var t = u && typeof u.text === 'string' ? u.text.trim() : '';
        if (!t) return orig(u);
        var j = ++jeton; nettoyer(); try { origCancel(); } catch (e) { /* rien à couper */ }
        enCours = true;
        dire(t, u.lang).then(function (blobs) {
          if (j !== jeton) return;
          var i = 0; audio = new Audio();
          if (typeof u.volume === 'number') audio.volume = Math.max(0, Math.min(1, u.volume));
          function suite() {
            if (j !== jeton) return;
            if (i >= blobs.length) { nettoyer(); evt(u, 'end'); return; }
            var url = URL.createObjectURL(blobs[i++]); urls.push(url); audio.src = url;
            audio.play().then(function () { if (i === 1) evt(u, 'start'); }).catch(function () { if (j === jeton) { nettoyer(); orig(u); } });
          }
          audio.onended = suite; audio.onerror = function () { if (j === jeton) { nettoyer(); orig(u); } };
          suite();
        }).catch(function () { if (j === jeton) { nettoyer(); orig(u); } });   // voix choisie indisponible : la voix de l'app prend le relais
      };
      ss.cancel = function () { jeton++; nettoyer(); return origCancel(); };
      try { Object.defineProperty(ss, 'speaking', { configurable: true, get: function () { return enCours; } }); } catch (e) { /* propriété figée */ }
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

/* La page « Choisir mes voix » : une liste de voix qui marchent AUJOURD'HUI, un bouton Écouter, un bouton Garder. */
export function pageChoisir() {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="kdmc-voix" content="off"><title>Choisir mes voix</title>'
    + '<style>:root{--bg:#f6f4f0;--fg:#1d1b19;--mut:#6b655e;--card:#fff;--line:#e0dad2;--acc:#1f5f5b;--accfg:#fff}@media(prefers-color-scheme:dark){:root{--bg:#15191a;--fg:#ece8e2;--mut:#9a948c;--card:#1d2223;--line:#2d3436;--acc:#6fc2bb;--accfg:#0f1a19}}'
    + 'body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,sans-serif;padding:20px max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}main{max-width:640px;margin:0 auto}h1{font-size:1.5rem;margin:0 0 6px}p{color:var(--mut);margin:0 0 16px}'
    + 'ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}li{display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-width:0}li.sel{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc) inset}'
    + 'button{min-height:44px;min-width:44px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;padding:0 14px;cursor:pointer}button.go{background:var(--acc);color:var(--accfg);border-color:var(--acc)}.nom{flex:1;min-width:0;overflow-wrap:anywhere}.nom small{display:block;color:var(--mut)}#msg{min-height:1.4em;margin-top:14px;color:var(--mut)}</style></head><body><main>'
    + '<h1>Choisir mes voix</h1><p>La voix choisie parle dans toutes les apps du domaine, sur cet appareil. Sans choix, chaque app garde sa voix.</p><ul id="l"></ul><p id="msg" role="status"></p><p><button id="rien">Reprendre la voix de chaque app</button></p></main>'
    + '<script>window.__kdmcVoixTest=true;</script><script src="/__voix/partout.js"></script><script>'
    + '(function(){var CH=' + JSON.stringify(CHOIX) + ';var L=document.getElementById("l"),M=document.getElementById("msg");var cur=(document.cookie.match(/(?:^|;\\s*)kdmc_voix=((?:gemini|piper)\\.[a-z0-9]{1,12})(?:;|$)/)||[])[1]||"";var a=null;'
    + 'function pose(v){document.cookie="kdmc_voix="+(v||"")+"; Domain=.kd-mc.com; Path=/; Max-Age="+(v?31536000:0)+"; Secure; SameSite=Lax";cur=v||"";}'
    + 'function dessiner(voix){L.textContent="";voix.forEach(function(v){var c=CH[v.id];if(!c)return;var li=document.createElement("li");if(c===cur)li.className="sel";var n=document.createElement("div");n.className="nom";n.textContent=v.nom;var s=document.createElement("small");s.textContent=(v.genre==="f"?"Femme · ":v.genre==="h"?"Homme · ":"")+v.licence+(c.indexOf("piper")===0?" · 1er essai : téléchargement (~70 Mo)":"");n.appendChild(s);'
    + 'var e=document.createElement("button");e.textContent="▶ Écouter";e.onclick=function(){ecouter(c,e)};var g=document.createElement("button");g.className="go";g.textContent=c===cur?"✓ Choisie":"Garder";g.onclick=function(){pose(c);M.textContent="Choisie : "+v.nom+". Elle parle maintenant dans toutes les apps.";dessiner(voix)};li.appendChild(n);li.appendChild(e);li.appendChild(g);L.appendChild(li);});}'
    + 'function ecouter(c,b){if(a){a.pause();a=null;}b.textContent="…";M.textContent="Je prépare la voix…";window.kdmcVoixFabrique(c)("Bonjour, voici ma voix. Elle te lira tes messages et tes histoires.","fr").then(function(bl){var i=0;a=new Audio();function s(){if(i>=bl.length){b.textContent="▶ Écouter";M.textContent="";return;}a.src=URL.createObjectURL(bl[i++]);a.onended=s;a.play();}b.textContent="■";M.textContent="";s();}).catch(function(){b.textContent="▶ Écouter";M.textContent="Cette voix ne répond pas pour l\\u2019instant. Essaie une autre.";});}'
    + 'document.getElementById("rien").onclick=function(){pose("");M.textContent="Chaque app reprend sa voix.";dessiner(window.__v||[]);};'
    + 'fetch("/__voix/catalogue?langue=fr").then(function(r){return r.json()}).then(function(j){window.__v=(j.voix||[]).filter(function(v){return CH[v.id]});dessiner(window.__v);}).catch(function(){M.textContent="La liste des voix ne répond pas."});})();</script></body></html>';
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
