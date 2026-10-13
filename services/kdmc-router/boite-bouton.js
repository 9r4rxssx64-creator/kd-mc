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
    /* une app peut retirer le BOUTON (écran plein, jeu…) — jamais la porte des conditions (règle du 7.10 : aucun accès sans accord) */
    var sansBouton = !!(m && /^(off|non|0)$/i.test(m.getAttribute('content') || ''));
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
      try { var t = (window.kdmcSSO && window.kdmcSSO.token && window.kdmcSSO.token()) || lire('kdmc_sso_token'); if (t) o.headers.authorization = 'Bearer ' + t; } catch (e) { /* */ }
      var g = lire('kdmc_admin_grant'); if (g) o.headers['x-kdmc-admin'] = g;   /* app installée : son laissez-passer admin (le domaine décide) */
      if (corps) { o.method = 'POST'; o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(corps); }
      return fetch(chemin, o).then(function (r) { return r.json().catch(function () { return { ok: false, reason: 'illisible' }; }); }).catch(function () { return { ok: false, reason: 'reseau' }; });
    };
    var quand = function (ts) {
      var s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return "à l'instant"; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
      if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; return 'il y a ' + Math.floor(s / 86400) + ' j';
    };
    var suivis = function () { return lire(LS).split(',').filter(function (x) { return /^[0-9a-f]{24}$/.test(x); }).slice(-5); };
    /* LES CONDITIONS DU DOMAINE, UNE SEULE FOIS PAR COMPTE (Kevin 7.10.2026 : « Les CGU du domaine et de chaque app demandées une
       seule fois pour chaque compte, valables dans chaque app et dans tout le domaine. À la première connexion. Après plus. Aucune
       connexion au domaine ou app sans inscription complète et accord. »). Le domaine dit (/__boite/mes → cgu.requise) qu'un compte
       CONNECTÉ ne les a pas acceptées : un écran plein les montre (texte + autorisations résumées), case + « Accepter et continuer »
       → POST /__sso/cgu (gravé dans le compte, valable partout). Refuser = se déconnecter. Rien d'autre de la page n'est utilisable
       avant. Une seule porte, posée par le routeur sur CHAQUE page : les apps futures l'ont sans une ligne. */
    var porte = null;
    var porteCgu = function (c) {
      try { ecrire('kdmc_cgu_v', ''); } catch (e) { /* */ }
      if (porte || !c || !c.requise) return;
      porte = E('div', null, { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: '2147483600', background: 'rgba(4,8,5,.96)', overflowY: 'auto',
        padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxSizing: 'border-box', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', color: TXT });
      porte.setAttribute('role', 'dialog'); porte.setAttribute('aria-modal', 'true'); porte.setAttribute('aria-label', 'Conditions du domaine KDMC');
      var boite = E('div', null, { maxWidth: '560px', margin: '0 auto' });
      boite.appendChild(E('div', '📜 Conditions du domaine KDMC', { fontSize: '20px', fontWeight: '800', color: OR, margin: '6px 0 6px' }));
      boite.appendChild(E('div', 'Une seule fois pour ton compte : elles valent dans toutes les apps du domaine.', { fontSize: '15px', color: MUT, marginBottom: '10px' }));
      boite.appendChild(E('div', c.texte || '', { fontSize: '16px', lineHeight: '1.45', marginBottom: '10px' }));
      var ul = E('ul', null, { paddingLeft: '20px', margin: '0 0 12px', fontSize: '15px', lineHeight: '1.45' });
      (c.points || []).forEach(function (t) { ul.appendChild(E('li', t, { marginBottom: '6px' })); });
      boite.appendChild(ul);
      var lab = E('label', null, { display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '16px', minHeight: '44px', cursor: 'pointer', marginBottom: '10px' });
      var cb = document.createElement('input'); cb.type = 'checkbox'; S(cb, { width: '24px', height: '24px', flexShrink: '0', marginTop: '2px' });
      lab.appendChild(cb); lab.appendChild(E('span', "J'ai lu et j'accepte ces conditions (version " + (c.version || '') + ').'));
      boite.appendChild(lab);
      var err = E('div', '', { color: '#ffb0a0', fontSize: '15px', minHeight: '20px', marginBottom: '6px' });
      var oui = E('button', 'Accepter et continuer', { width: '100%', minHeight: '48px', borderRadius: '12px', border: 'none', background: OR, color: '#111', fontSize: '17px', fontWeight: '800', cursor: 'pointer', marginBottom: '10px' });
      var non = E('button', 'Je refuse (me déconnecter)', { width: '100%', minHeight: '44px', borderRadius: '12px', border: '1px solid ' + LIG, background: 'transparent', color: MUT, fontSize: '15px', cursor: 'pointer' });
      oui.type = 'button'; non.type = 'button';
      oui.onclick = function () {
        if (!cb.checked) { err.textContent = 'Coche la case pour accepter.'; return; }
        oui.disabled = true; err.textContent = '';
        void requete('/__sso/cgu', {}).then(function (j) {
          oui.disabled = false;
          if (j && j.ok) { ecrire('kdmc_cgu_v', String(j.version || c.version || '')); if (porte && porte.parentNode) porte.parentNode.removeChild(porte); porte = null; document.documentElement.style.overflow = ''; return; }
          err.textContent = 'Pas enregistré (' + ((j && j.reason) || 'réseau') + '). Réessaie.';
        });
      };
      non.onclick = function () {
        void requete('/__sso/logout', {}).then(function () { try { localStorage.removeItem('kdmc_sso_token'); } catch (e) { /* */ } location.reload(); });
      };
      boite.appendChild(err); boite.appendChild(oui); boite.appendChild(non);
      porte.appendChild(boite);
      document.documentElement.style.overflow = 'hidden';
      document.body.appendChild(porte);
    };
    var charger = function () {
      return requete('/__boite/mes?s=' + encodeURIComponent(suivis().join(','))).then(function (j) {
        if (!j || !j.ok) return;
        if (j.cgu && j.cgu.requise) porteCgu(j.cgu); else if (j.connecte && !j.admin) ecrire('kdmc_cgu_v', 'ok');
        if (sansBouton) return;
        /* 7.10 (Kevin : « je débloque de partout où j'ai envie, j'ai une alerte visuelle d'un message ou inscription en attente ») :
           chez l'admin, le bouton devient SON onglet « 📬 » — visible seulement s'il y a quelque chose en attente, avec le nombre. */
        if (j.admin) { if (!btn.parentNode) document.body.appendChild(btn); modeAdmin(j); return; }
        etat.connecte = !!j.connecte; etat.nom = j.nom || ''; etat.messages = j.messages || [];
        /* Pas de compte, pas de bouton (Kevin 3.10 : aucune consultation ni message sans compte). */
        if (!etat.connecte) { if (btn.parentNode) btn.parentNode.removeChild(btn); if (panneau && panneau.parentNode) { panneau.parentNode.removeChild(panneau); panneau = null; } return; }
        if (!btn.parentNode) document.body.appendChild(btn);
        var vu = parseInt(lire(LV) || '0', 10) || 0;
        var neuf = etat.messages.some(function (x) { return x.repondu && x.repondu > vu; });
        pastille.style.display = neuf ? 'block' : 'none';
        if (etat.ouvert) dessiner();
      });
    };

    var modeAdmin = function (j) {
      etat.admin = true; etat.nonLus = +j.nonLus || 0; etat.inscriptions = Array.isArray(j.inscriptions) ? j.inscriptions : [];
      var n = etat.nonLus + etat.inscriptions.length;
      btn.firstChild.nodeValue = '📬'; btn.setAttribute('aria-label', 'En attente : ' + n); btn.title = 'Messages et inscriptions en attente';
      S(btn, { left: '0', right: 'auto', top: '38%', bottom: 'auto', width: '50px', height: '50px', borderRadius: '0 25px 25px 0', borderLeft: 'none', display: n || etat.ouvert ? 'block' : 'none' });
      S(pastille, { display: n ? 'flex' : 'none', width: 'auto', minWidth: '20px', height: '20px', borderRadius: '10px', top: '-6px', right: '-6px', color: '#fff', fontSize: '12px',
        fontWeight: '700', alignItems: 'center', justifyContent: 'center', padding: '0 5px', boxSizing: 'border-box' });
      pastille.textContent = n > 99 ? '99+' : String(n);
      if (etat.ouvert) dessiner();
    };
    var dessinerAdmin = function () {
      panneau.textContent = '';
      var tete = E('div', null, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' });
      tete.appendChild(E('div', '📬 En attente', { flex: '1', fontWeight: '700', fontSize: '18px', color: OR }));
      var x = E('button', '✕', { minWidth: '44px', minHeight: '44px', background: 'transparent', border: '1px solid ' + LIG, color: TXT, borderRadius: '10px', fontSize: '18px', cursor: 'pointer' });
      x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = fermer; tete.appendChild(x); panneau.appendChild(tete);
      (etat.faits || []).forEach(function (t) { panneau.appendChild(E('div', t, { background: '#12301a', border: '1px solid #2f6b3c', borderRadius: '10px', padding: '8px 10px', marginBottom: '8px', color: '#bff0c8', fontSize: '14px' })); });
      var ins = etat.inscriptions || [];
      panneau.appendChild(E('div', '📝 Inscriptions à valider' + (ins.length ? ' (' + ins.length + ')' : ''), { fontWeight: '700', fontSize: '16px', margin: '4px 0 8px' }));
      if (!ins.length) panneau.appendChild(E('div', 'Aucune inscription en attente.', { color: MUT, fontSize: '14px', marginBottom: '10px' }));
      ins.forEach(function (i) {
        var c = E('div', null, { border: '1px solid ' + LIG, borderRadius: '12px', padding: '10px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' });
        var g = E('div', null, { flex: '1', minWidth: '0' });
        g.appendChild(E('div', i.nom, { fontWeight: '700', fontSize: '15px', wordBreak: 'break-word' }));
        g.appendChild(E('div', (i.matricule ? 'Matricule ' + i.matricule + ' · ' : '') + 'CMCteams · ' + quand(i.ts) + (i.code ? ' · code envoyé' : ''), { color: MUT, fontSize: '13px' }));
        c.appendChild(g);
        var v = E('button', '✅ Valider', { minHeight: '44px', padding: '0 14px', background: OR, color: '#1b1403', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' });
        v.type = 'button';
        v.onclick = function () {
          v.disabled = true; v.textContent = '…';
          void requete('/__boite/admin/valider', { id: i.id }).then(function (r) {
            if (r && r.ok) { etat.faits = (etat.faits || []).concat('✅ Validé — ' + i.nom + ' peut se connecter').slice(-5); g.lastChild.textContent = '✅ Validé — ' + i.nom + ' peut se connecter'; c.removeChild(v); setTimeout(charger, 800); }
            else { v.disabled = false; v.textContent = '✅ Valider'; g.lastChild.textContent = '❌ Pas validé (' + ((r && r.reason) || 'erreur') + ') — réessaie'; }
          });
        };
        c.appendChild(v); panneau.appendChild(c);
      });
      panneau.appendChild(E('div', '✉️ Messages non lus : ' + (etat.nonLus || 0), { fontWeight: '700', fontSize: '16px', margin: '12px 0 8px' }));
      var a = E('a', 'Ouvrir ma boîte', { display: 'block', textAlign: 'center', minHeight: '44px', lineHeight: '44px', borderRadius: '10px', border: '1px solid ' + OR, color: OR, textDecoration: 'none', fontWeight: '700' });
      a.href = '/__boite/ouvrir';   /* même adresse que l'app : le domaine renvoie vers la boîte du portail */ panneau.appendChild(a);
    };
    var dessiner = function () {
      if (!panneau) {
        panneau = E('div', null, { position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '2147483001', background: FOND, color: TXT, borderTop: '2px solid ' + OR,
          borderRadius: '18px 18px 0 0', padding: '14px 14px calc(env(safe-area-inset-bottom, 0px) + 14px)', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 -8px 30px rgba(0,0,0,.55)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '16px', lineHeight: '1.4', boxSizing: 'border-box' });
        panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-label', etat.admin ? 'En attente' : "Écrire à l'admin");
        document.body.appendChild(panneau);
      }
      if (etat.admin) { dessinerAdmin(); return; }
      panneau.textContent = '';
      var tete = E('div', null, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
      tete.appendChild(E('div', "✉️ Écrire à l'admin", { flex: '1', fontWeight: '700', fontSize: '18px', color: OR }));
      var x = E('button', '✕', { minWidth: '44px', minHeight: '44px', borderRadius: '12px', border: '1px solid ' + LIG, background: 'transparent', color: TXT, fontSize: '20px', cursor: 'pointer' });
      x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = fermer; tete.appendChild(x); panneau.appendChild(tete);
      panneau.appendChild(E('div', 'Tu écris en tant que ' + etat.nom + ' · depuis ' + app + '. Il reçoit ton nom, l\'app et la page.', { color: MUT, fontSize: '13.5px', marginBottom: '10px' }));
      var nom = null, contact = null;
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
            ta.value = ''; etat.confirme = '✅ Envoyé. Tu verras sa réponse ici.'; st.style.color = '#86efac'; st.textContent = etat.confirme; env.disabled = false; env.style.opacity = '1'; void charger();
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
    var ouvrir = function () { etat.ouvert = true; dessiner(); if (etat.admin) { void charger(); return; } ecrire(LV, String(Date.now())); pastille.style.display = 'none'; };
    var fermer = function () { etat.ouvert = false; etat.confirme = ''; if (panneau && panneau.parentNode) { panneau.parentNode.removeChild(panneau); panneau = null; } if (etat.admin) btn.style.display = (etat.nonLus || (etat.inscriptions || []).length) ? 'block' : 'none'; };
    btn.onclick = function () { if (etat.ouvert) fermer(); else ouvrir(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && etat.ouvert) fermer(); });
    if (sansBouton) { void charger(); return; }   /* page sans bouton : la porte des conditions seulement, une lecture au chargement */
    void charger();   /* le bouton n'est posé que pour un compte connecté (aucun message anonyme, Kevin 3.10) */
    setInterval(function () { if (document.visibilityState === 'visible') void charger(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') void charger(); });   /* retour sur l'app : compteurs frais */
  } catch (e) { /* un bouton de contact ne doit JAMAIS casser une page */ }
}
export const BOUTON_JS = '(' + bouton.toString() + ')();';
