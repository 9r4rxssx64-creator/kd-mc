/* BEE PARTOUT : ton assistante personnelle te SUIT dans chaque app du domaine — et SEULEMENT toi (Kevin 2026-10-04 : « marionnette
 * partout… mon assistant personnel qui me suit et m'aide au quotidien… vérifie que je sois le seul à pouvoir m'en servir. Partout, chaque
 * app du domaine et dans le domaine »).
 *
 * COMMENT (même couche partagée que le bouton « ✉️ Écrire à l'admin » : le routeur sert TOUTES les pages, la 33ᵉ adresse de demain l'a sans
 * qu'on y pense) :
 *   1. le routeur pose UNE ligne sur chaque page HTML de chaque app : <script src="/__javis/partout.js" defer> ;
 *   2. ce petit script (même origine → accepté par toutes les CSP `script-src 'self'`) NE FAIT RIEN pour un visiteur ordinaire : il ne demande
 *      au domaine « est-ce Kevin ? » (/__javis/qui) que si cet appareil porte déjà son marqueur (cookie `kdmc_k`, posé par le domaine quand
 *      Kevin est reconnu) ou une session du domaine (jeton SSO) — et jamais plus d'une fois par 12 h si la réponse est non ;
 *   3. si c'est Kevin : un CADRE (iframe de même origine, /__javis/cadre) charge Bee dedans. Le cadre a sa PROPRE sécurité (CSP) : les CSP
 *      strictes des apps (style-src, img-src…) ne cassent donc jamais Bee, et Bee ne casse jamais une app (rien de son CSS ni de son JS ne
 *      touche la page). Il reste invisible tant que Bee n'a pas dit « je suis là » (elle ne le dit qu'après avoir fait vérifier Kevin) ;
 *   4. Bee sait dans quelle app tu es (nom + titre de la page, sans adresse complète ni données) et peut agir — avec ton bouton.
 *
 * LES PORTES (aucune ne dépend de la page ni de ce script) : /__javis/ai, /__javis/moi, /__javis/agir exigent une session admin PROUVÉE par le
 * domaine (Face ID ou code) ; ce script et le cadre sont des coquilles vides, publiques, sans aucun secret. Un faux marqueur ne donne donc
 * qu'un cadre qui reste invisible.
 *
 * Interrupteurs : BEE_PARTOUT = '0' (variable du routeur) coupe la pose ; une page peut se retirer avec <meta name="kdmc-bee" content="off"> ;
 * les pages qui portent déjà Bee (app Javis, arbre) sont ignorées.
 * node services/kdmc-router/bee-partout.test.mjs */

export const PARTOUT_TAG = '<script src="/__javis/partout.js" defer></script>';
export const MARQUEUR = 'kdmc_k=1; Domain=.kd-mc.com; Path=/; Max-Age=31536000; Secure; SameSite=Lax';
const J = (o, st, h) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, h || {}) });
const WIDGET = 'https://javis.kd-mc.com/javis-widget.js';

/* Servie telle quelle (`toString`) sur /__javis/partout.js : AUTONOME, aucune variable extérieure. Mise en forme par `element.style.x = …`
   seulement (jamais de <style> ni d'attribut `style` : les CSP des apps les refuseraient). */
export function partout() {
  'use strict';
  try {
    if (window.__kdmcBee || window.top !== window.self) return;                         // une seule fois ; jamais dans un cadre
    if (window.__javisWidgetLoaded || document.getElementById('javis-root') || document.querySelector('script[src*="javis-widget"]')) return;   // Bee est déjà là
    var meta = document.querySelector('meta[name="kdmc-bee"]');
    if (meta && /^(off|non|0)$/i.test(meta.getAttribute('content') || '')) return;      // une app peut se retirer (écran plein, jeu…)
    var LS_NON = 'kdmc_bee_non', jeton = '', non = 0;
    try { jeton = localStorage.getItem('kdmc_sso_token') || ''; non = +(localStorage.getItem(LS_NON) || 0); } catch (e) { /* stockage fermé */ }
    var marqueur = /(?:^|;\s*)kdmc_k=1(?:;|$)/.test(document.cookie || '');
    if (!marqueur && !jeton) return;                                                    // visiteur ordinaire : AUCUNE requête
    if (!marqueur && non && Date.now() - non < 12 * 3600e3) return;                     // on a déjà demandé : ce n'était pas Kevin
    window.__kdmcBee = 1;

    var cadre = null, ouvert = false;
    function bas() { return 'calc(env(safe-area-inset-bottom, 0px) + ' + (ouvert ? 8 : 88) + 'px)'; }
    function taille() {
      if (!cadre) return;
      var s = cadre.style;
      s.right = '8px'; s.bottom = bas();
      if (ouvert) { s.width = Math.max(280, Math.min(window.innerWidth - 16, 436)) + 'px'; s.height = Math.max(320, Math.min(Math.round(window.innerHeight * 0.8), 660)) + 'px'; }
      else { s.width = '92px'; s.height = '92px'; }
    }
    function contexte() {
      try {
        cadre.contentWindow.postMessage({ kdmcBee: 1, t: 'contexte', app: String(location.hostname).split('.')[0] || 'domaine', titre: String(document.title || '').slice(0, 120), chemin: String(location.pathname || '/').slice(0, 120) }, location.origin);
      } catch (e) { /* le cadre n'est plus là */ }
    }
    function monter() {
      cadre = document.createElement('iframe');
      cadre.src = '/__javis/cadre';
      cadre.title = 'Bee, ton assistante';
      cadre.setAttribute('allow', 'microphone; autoplay');
      cadre.setAttribute('aria-hidden', 'false');
      var s = cadre.style;
      s.position = 'fixed'; s.border = '0'; s.margin = '0'; s.padding = '0'; s.background = 'transparent'; s.colorScheme = 'normal';
      s.zIndex = '2147483000'; s.display = 'none'; s.overflow = 'hidden';
      taille();
      window.addEventListener('message', function (e) {
        if (!cadre || e.origin !== location.origin || e.source !== cadre.contentWindow) return;   // seul NOTRE cadre, de NOTRE origine
        var d = e.data; if (!d || d.kdmcBee !== 1) return;
        if (d.t === 'pret') { cadre.style.display = 'block'; taille(); contexte(); }
        else if (d.t === 'ouvert') { ouvert = true; taille(); }
        else if (d.t === 'ferme') { ouvert = false; taille(); }
        else if (d.t === 'cache') { try { cadre.parentNode.removeChild(cadre); } catch (x) { /* déjà parti */ } cadre = null; }
      });
      window.addEventListener('resize', taille);
      (document.body || document.documentElement).appendChild(cadre);
    }
    if (marqueur) return monter();
    // pas de marqueur mais une session : le domaine dit si c'est Kevin (en-tête Authorization, comme la page des apps le fait pour whoami)
    var h = {}; if (jeton) h.Authorization = 'Bearer ' + jeton;
    fetch('/__javis/qui', { credentials: 'include', cache: 'no-store', headers: h })
      .then(function (r) {
        if (r && r.ok) return monter();
        try { localStorage.setItem(LS_NON, String(Date.now())); } catch (e) { /* tant pis */ }
      })
      .catch(function () { /* réseau muet : pas de Bee, la page est intacte */ });
  } catch (e) { /* un assistant ne doit JAMAIS empêcher une page de s'afficher */ }
}
export const PARTOUT_JS = '(' + partout.toString() + ')();';

/* La coquille du cadre : vide, publique, sans secret. Sa CSP est la sienne (celle de l'app ne s'y applique pas). */
export const CADRE_CSP = "default-src 'none'; script-src 'self' https://javis.kd-mc.com; style-src 'unsafe-inline'; "
  + "img-src 'self' https://lingua.kd-mc.com https://javis.kd-mc.com data: blob:; media-src 'self' https://lingua.kd-mc.com https://javis.kd-mc.com blob: data:; "
  + "connect-src 'self' https://javis.kd-mc.com https://lingua.kd-mc.com https://api.open-meteo.com; worker-src blob:; "
  + "frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
export const CADRE_HTML = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<meta name="robots" content="noindex"><meta name="kdmc-contact" content="off"><title>Bee</title>'
  + '<style>html,body{margin:0;background:transparent!important;overflow:hidden}</style></head>'
  + '<body class="javis-cadre"><script src="' + WIDGET + '" defer></script></body></html>';

/* Les routes /__javis/partout.js, /__javis/cadre, /__javis/qui. (ai / moi / agir restent dans leurs propres gardiens.) */
export async function handlePartout(request, url, env, outils) {
  const p = url.pathname;
  if (String(env && env.BEE_PARTOUT) === '0' && p !== '/__javis/qui') return J({ ok: false, reason: 'coupe' }, 404);
  if (p === '/__javis/partout.js' && request.method === 'GET') {
    return new Response(String(env && env.BEE_PARTOUT) === '0' ? '/* Bee partout est coupé. */' : PARTOUT_JS, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
  }
  if (p === '/__javis/cadre' && request.method === 'GET') {
    return new Response(CADRE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': CADRE_CSP, 'x-frame-options': 'SAMEORIGIN', 'x-robots-tag': 'noindex' } });
  }
  if (p === '/__javis/qui' && request.method === 'GET') {
    if (String(env && env.BEE_PARTOUT) === '0') return J({ ok: false, reason: 'coupe' }, 403);
    if (!(await outils.qui(request))) return J({ ok: false, reason: 'kevin_seulement' }, 403);
    return J({ ok: true }, 200, { 'set-cookie': MARQUEUR });
  }
  return null;
}
