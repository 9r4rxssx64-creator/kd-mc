/* LE BOUTON « ✉️ ÉCRIRE À L'ADMIN » — posé par le routeur sur TOUTES les pages de TOUTES les apps du domaine, présentes et futures
 * (Kevin 3.10.2026 : « les boutiques, l'arbre, Lingua, etc. : toutes les apps du domaine doivent pouvoir contacter l'admin simplement
 *  depuis leur compte. J'ai toutes les infos. »).
 *
 * Pourquoi dans le routeur et pas dans chaque app : le routeur sert TOUTES les pages (leçon 315 — corriger dans la couche partagée) ; la
 * 33ᵉ adresse de demain a le bouton sans qu'on y pense. Aucune app n'est modifiée.
 *
 * Cette fonction est servie telle quelle (`toString`) sur /__boite/bouton.js : elle doit rester AUTONOME (aucune variable extérieure).
 * Mise en forme uniquement par `element.style.x = …` : jamais de <style> ni d'attribut `style` (les CSP des apps les refuseraient).
 * Tout le texte reçu passe par textContent. Le nom de l'expéditeur vient de la SESSION du domaine côté serveur, jamais de la page. */
export function bouton() {
  'use strict';
  try {
    if (window.__kdmcBoite || window.top !== window.self) return;                 // une seule fois ; jamais dans un cadre
    var m = document.querySelector('meta[name="kdmc-contact"]');
    if (m && /^(off|non|0)$/i.test(m.getAttribute('content') || '')) return;      // une app peut se retirer (écran plein, jeu…)
    window.__kdmcBoite = 1;
    var app = String(location.hostname).split('.')[0] || 'domaine';
    var LS = 'kdmc_boite_suivi', LV = 'kdmc_boite_vu';
    var lire = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    var ecrire = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* mode privé : tant pis */ } };
    var S = function (el, o) { for (var k in o) el.style[k] = o[k]; return el; };
    var E = function (tag, txt, st) { var e = document.createElement(tag); if (txt != null) e.textContent = txt; if (st) S(e, st); return e; };
    var OR = '#e8b830', FOND = '#0b110d', TXT = '#eaf3e2', MUT = '#9fb59a', LIG = '#22331f';
    var etat = { connecte: false, nom: '', messages: [], ouvert: false, confirme: '' };
    var panneau = null, pastille = null;

    var btn = E('button', '✉️', { position: 'fixed', right: '14px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', width: '52px', height: '52px', borderRadius: '26px',
      border: '1px solid ' + OR, background: FOND, color: TXT, fontSize: '24px', lineHeight: '1', cursor: 'pointer', zIndex: '2147483000', boxShadow: '0 4px 18px rgba(0,0,0,.45)', padding: '0' });
    btn.type = 'button'; btn.setAttribute('aria-label', "Écrire à l'admin"); btn.title = "Écrire à l'admin";
    pastille = E('span', '', { position: 'absolute', top: '4px', right: '4px', width: '12px', height: '12px', borderRadius: '6px', background: '#dc2626', display: 'none' });
    btn.appendChild(pastille);

    var requete = function (chemin, corps) {
      var o = { credentials: 'include', cache: 'no-store', headers: {} };
      try { var t = window.kdmcSSO && window.kdmcSSO.token && window.kdmcSSO.token(); if (t) o.headers.authorization = 'Bearer ' + t; } catch (e) { /* */ }
      if (corps) { o.method = 'POST'; o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(corps); }
      return fetch(chemin, o).then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'illisible' }; }); }).catch(function () { return { ok: false, reason: 'reseau' }; });
    };
    var quand = function (ts) {
      var s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return "à l'instant"; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
      if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; return 'il y a ' + Math.floor(s / 86400) + ' j';
    };
    var suivis = function () { return lire(LS).split(',').filter(function (x) { return /^[0-9a-f]{24}$/.test(x); }).slice(-5); };
    var charger = function () {
      return requete('/__boite/mes?s=' + encodeURIComponent(suivis().join(','))).then(function (j) {
        if (!j || !j.ok) return;
        if (j.admin) { if (btn.parentNode) btn.parentNode.removeChild(btn); if (panneau && panneau.parentNode) panneau.parentNode.removeChild(panneau); return; }   // l'admin n'écrit pas à l'admin
        etat.connecte = !!j.connecte; etat.nom = j.nom || ''; etat.messages = j.messages || [];
        var vu = parseInt(lire(LV) || '0', 10) || 0;
        var neuf = etat.messages.some(function (x) { return x.repondu && x.repondu > vu; });
        pastille.style.display = neuf ? 'block' : 'none';
        if (etat.ouvert) dessiner();
      });
    };

    var dessiner = function () {
      if (!panneau) {
        panneau = E('div', null, { position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '2147483001', background: FOND, color: TXT, borderTop: '2px solid ' + OR,
          borderRadius: '18px 18px 0 0', padding: '14px 14px calc(env(safe-area-inset-bottom, 0px) + 14px)', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 -8px 30px rgba(0,0,0,.55)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '16px', lineHeight: '1.4', boxSizing: 'border-box' });
        panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-label', "Écrire à l'admin");
        document.body.appendChild(panneau);
      }
      panneau.textContent = '';
      var tete = E('div', null, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
      tete.appendChild(E('div', "✉️ Écrire à l'admin", { flex: '1', fontWeight: '700', fontSize: '18px', color: OR }));
      var x = E('button', '✕', { minWidth: '44px', minHeight: '44px', borderRadius: '12px', border: '1px solid ' + LIG, background: 'transparent', color: TXT, fontSize: '20px', cursor: 'pointer' });
      x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = fermer; tete.appendChild(x); panneau.appendChild(tete);
      panneau.appendChild(E('div', etat.connecte ? 'Tu écris en tant que ' + etat.nom + ' · depuis ' + app + '. Il reçoit ton nom, l\'app et la page.' : "Tu n'es pas connecté : dis-lui qui tu es pour qu'il puisse te répondre.", { color: MUT, fontSize: '13.5px', marginBottom: '10px' }));
      var nom = null, contact = null;
      if (!etat.connecte) {
        var champ = { width: '100%', boxSizing: 'border-box', minHeight: '46px', padding: '10px 12px', margin: '0 0 8px', borderRadius: '12px', border: '1px solid ' + LIG, background: '#0a120c', color: TXT, fontSize: '16px', fontFamily: 'inherit' };
        nom = S(document.createElement('input'), champ); nom.placeholder = 'Ton prénom et nom'; nom.maxLength = 60; nom.setAttribute('aria-label', 'Ton nom'); panneau.appendChild(nom);
        contact = S(document.createElement('input'), champ); contact.placeholder = 'Un moyen de te répondre (e-mail ou téléphone)'; contact.maxLength = 120; contact.setAttribute('aria-label', 'Contact'); panneau.appendChild(contact);
      }
      var piege = S(document.createElement('input'), { position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: '0' }); piege.tabIndex = -1; piege.setAttribute('aria-hidden', 'true'); piege.autocomplete = 'off'; panneau.appendChild(piege);
      var ta = S(document.createElement('textarea'), { width: '100%', boxSizing: 'border-box', minHeight: '96px', padding: '12px', borderRadius: '12px', border: '1px solid ' + LIG, background: '#0a120c', color: TXT, fontSize: '16px', fontFamily: 'inherit', resize: 'vertical' });
      ta.placeholder = 'Ton message…'; ta.maxLength = 1000; ta.setAttribute('aria-label', 'Ton message'); panneau.appendChild(ta);
      var st = E('div', etat.confirme, { minHeight: '20px', margin: '6px 0', fontSize: '14px', color: etat.confirme ? '#86efac' : '#fbbf24' });   // la confirmation survit au rafraîchissement de la liste
      var env = E('button', 'Envoyer', { width: '100%', minHeight: '48px', border: '0', borderRadius: '12px', background: OR, color: '#11160c', fontWeight: '700', fontSize: '16px', cursor: 'pointer' });
      env.type = 'button';
      env.onclick = function () {
        etat.confirme = '';
        var t = ta.value.trim(); if (t.length < 2) { st.textContent = 'Écris ton message.'; return; }
        if (!etat.connecte && nom && nom.value.trim().length < 2) { st.textContent = 'Dis-lui ton nom pour qu\'il sache qui tu es.'; return; }
        env.disabled = true; env.style.opacity = '.6'; st.style.color = '#fbbf24'; st.textContent = 'Envoi…';
        requete('/__boite/deposer', { texte: t, app: app, page: location.pathname + (location.search ? '?…' : ''), nom: nom ? nom.value.trim() : '', contact: contact ? contact.value.trim() : '', site: piege.value }).then(function (j) {
          if (j && j.ok) {
            if (j.suivi && !etat.connecte) { var l = suivis(); l.push(j.suivi); ecrire(LS, l.join(',')); }
            ta.value = ''; etat.confirme = '✅ Envoyé. Tu verras sa réponse ici.'; st.style.color = '#86efac'; st.textContent = etat.confirme; env.disabled = false; env.style.opacity = '1'; charger();
          } else {
            env.disabled = false; env.style.opacity = '1';
            st.textContent = '❌ ' + ({ trop_de_messages: 'tu as déjà écrit plusieurs fois, réessaie dans une heure', boite_pleine_aujourd_hui: 'la boîte est pleine aujourd\'hui, réessaie demain', reseau: 'pas de réseau, réessaie', message_vide: 'écris ton message' }[j && j.reason] || 'impossible pour le moment');
          }
        });
      };
      panneau.appendChild(st); panneau.appendChild(env);
      if (etat.messages.length) {
        panneau.appendChild(E('div', 'Tes messages', { marginTop: '14px', fontWeight: '700', color: OR, fontSize: '14px' }));
        etat.messages.forEach(function (x) {
          var c = E('div', null, { border: '1px solid ' + LIG, borderRadius: '12px', padding: '10px 12px', margin: '8px 0', fontSize: '14.5px' });
          c.appendChild(E('div', quand(x.ts) + ' · ' + x.app, { color: MUT, fontSize: '12px' }));
          c.appendChild(E('div', x.texte, { whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '3px 0' }));
          if (x.reponse) { c.appendChild(E('div', "Réponse de l'admin · " + quand(x.repondu), { color: OR, fontSize: '12px', marginTop: '6px' })); c.appendChild(E('div', x.reponse, { whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#3a2e08', border: '1px solid #7a5f12', borderRadius: '10px', padding: '8px 10px', color: '#ffe9a8' })); }
          else c.appendChild(E('div', "En attente de réponse", { color: MUT, fontSize: '12px' }));
          panneau.appendChild(c);
        });
      }
    };
    var ouvrir = function () { etat.ouvert = true; dessiner(); ecrire(LV, String(Date.now())); pastille.style.display = 'none'; };
    var fermer = function () { etat.ouvert = false; etat.confirme = ''; if (panneau && panneau.parentNode) { panneau.parentNode.removeChild(panneau); panneau = null; } };
    btn.onclick = function () { if (etat.ouvert) fermer(); else ouvrir(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && etat.ouvert) fermer(); });
    document.body.appendChild(btn);
    charger();
    setInterval(function () { if (document.visibilityState === 'visible') charger(); }, 120000);
  } catch (e) { /* un bouton de contact ne doit JAMAIS casser une page */ }
}
export const BOUTON_JS = '(' + bouton.toString() + ')();';
