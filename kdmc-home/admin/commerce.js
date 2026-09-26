/* KDMC — Tableau de bord Commerce (kd-mc.com/admin/commerce.html), 17.09.2026.
   Kevin : « un tableau de bord où je peux voir tout ce que tu as créé par rapport
   au commerce — contrôle, commande, infos — en tuiles, avec un visuel récap,
   dans mon domaine partie admin ».

   Deux sources, jamais mélangées :
     · STATIQUE  commerce-data.json (généré par tools/produits/tableau-de-bord.mjs)
                 = ce qui a été construit : produits, pages, vidéos, planning, marché
     · LIVE      kdmc-vente /admin/tableau = ce qui se passe : ventes (clés code:*),
                 file à valider, Club, contenu en base, état des workflows
   L'admin se décide UNIQUEMENT par le domaine (/__sso/whoami : admin ET vérifié
   Face ID) — cette page ne compare aucun code. Le pass part en Bearer vers la
   caisse (autre origine). Tout est fail-open : un worker muet donne une tuile
   « injoignable » avec la cause, jamais une page blanche.

   Logique PURE en tête (testée hors navigateur), DOM en bas. */
(function (global) {
  'use strict';

  var CAISSE = 'https://kdmc-vente.9r4rxssx64.workers.dev';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function euro(n) { n = Number(n) || 0; return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'; }
  function dt(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; } }
  function jour(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }); } catch (e) { return '—'; } }
  function ago(iso) { if (!iso) return '—'; var d = Date.now() - new Date(iso).getTime(); if (!(d >= 0)) return '—'; var m = Math.floor(d / 6e4), h = Math.floor(d / 36e5), j = Math.floor(d / 864e5); if (m < 1) return "à l'instant"; if (m < 60) return 'il y a ' + m + ' min'; if (h < 24) return 'il y a ' + h + ' h'; return 'il y a ' + j + ' j'; }

  /* Un workflow GitHub → un état lisible + une couleur. `null` = pas encore lu. */
  function etatRun(run) {
    if (!run) return { cls: '', label: 'non lu' };
    if (run.erreur) return { cls: 'warn', label: 'GitHub muet (' + run.erreur + ')' };
    if (run.vide) return { cls: '', label: 'jamais lancé' };
    if (run.status !== 'completed') return { cls: 'warn', label: run.status === 'in_progress' ? 'en cours…' : (run.status || 'en attente') };
    if (run.conclusion === 'success') return { cls: 'ok', label: 'vert ' + ago(run.maj) };
    if (run.conclusion === 'failure') return { cls: 'err', label: 'ROUGE ' + ago(run.maj) };
    return { cls: 'warn', label: (run.conclusion || '?') + ' ' + ago(run.maj) };
  }

  /* La page de livraison d'un produit : 200 = existe ; 404 = vente qui livre dans
     le vide ; null = non vérifié (sonde injoignable) — on le DIT, on ne devine pas. */
  function etatLivraison(http) {
    if (http == null) return { cls: '', label: 'livraison non vérifiée' };
    if (http >= 200 && http < 400) return { cls: 'ok', label: 'page de livraison OK' };
    return { cls: 'err', label: 'page de livraison HTTP ' + http };
  }

  /* Modules en base vs attendus par le catalogue. */
  function etatContenu(attendu, enBase) {
    if (attendu == null) return enBase ? { cls: 'ok', label: enBase.n + ' en base' } : { cls: '', label: 'contenu non lu' };
    if (!enBase) return { cls: 'err', label: '0/' + attendu + ' en base' };
    if (enBase.n >= attendu) return { cls: 'ok', label: enBase.n + '/' + attendu + ' modules' };
    return { cls: 'warn', label: enBase.n + '/' + attendu + ' modules' };
  }

  /* Les 8 chiffres du haut, calculés à partir des deux sources. */
  function kpis(data, live) {
    var v = live && live.ventes;
    var prog = (data.videos || []).filter(function (x) { return x.post; }).length;
    var audit = live && live.workflows && live.workflows.find(function (w) { return w.id === 'audit-live.yml'; });
    var ea = etatRun(audit && audit.run);
    var livraisonsKo = live ? live.produits.filter(function (p) { return p.livre_http != null && (p.livre_http < 200 || p.livre_http >= 400); }).length : 0;
    return [
      { l: 'Chiffre d\'affaires', v: v ? euro(v.ca) : '—', s: v ? (v.n + ' vente' + (v.n > 1 ? 's' : '') + (v.tronque ? ' (tronqué)' : '')) : 'caisse injoignable', cls: v && v.n ? 'ok' : '' },
      { l: 'À valider (file)', v: live ? String(live.file.n) : '—', s: live ? (live.file.n ? 'Revolut / virement / PayPal non vu' : 'rien en attente') : '', cls: live && live.file.n ? 'warn' : '' },
      /* Paniers ouverts : avec le PayPal perso de Kevin (pas de capture auto),
         c'est LA tuile qui dit qui a voulu acheter, même sans jamais revenir. */
      { l: 'Paniers en attente', v: live && live.intentions ? String(live.intentions.n) : '—',
        s: live && live.intentions ? (live.intentions.n ? euro(live.intentions.ca_potentiel) + ' possible · ' + live.intentions.dit_paye + ' disent avoir payé' : 'aucun panier ouvert') : '',
        cls: live && live.intentions && live.intentions.dit_paye ? 'warn' : '' },
      { l: 'Club — abonnés actifs', v: live && live.club ? String(live.club.actifs) : '—', s: live && live.club ? (live.club.expirent14j + ' expirent sous 14 j') : (live ? 'base non lue' : ''), cls: '' },
      { l: 'Produits en vente', v: String((data.produits || []).filter(function (p) { return !p.gele; }).length), s: (data.produits || []).filter(function (p) { return p.gele; }).length + ' gelé(s) par Kevin', cls: '' },
      { l: 'Vidéos programmées', v: prog + '/' + (data.videos || []).length, s: '4 réseaux · 18→25.09', cls: prog ? 'ok' : '' },
      { l: 'Audit live', v: ea.label.split(' ')[0], s: ea.label, cls: ea.cls },
      { l: 'Livraisons', v: live ? (livraisonsKo ? livraisonsKo + ' KO' : 'OK') : '—', s: live ? 'pages de livraison sondées' : '', cls: live ? (livraisonsKo ? 'err' : 'ok') : '' },
      { l: 'Commandes', v: live ? (live.config.commandes ? 'ON' : 'liens') : '—', s: live ? (live.config.commandes ? 'boutons actifs' : 'jeton absent : liens GitHub') : '', cls: live && live.config.commandes ? 'ok' : 'warn' },
    ];
  }

  /* Barres des 6 derniers mois (CA), même s'il n'y a rien : on montre le vide. */
  function moisBarres(parMois, nb, maintenant) {
    var out = [], d = maintenant ? new Date(maintenant) : new Date();
    for (var i = (nb || 6) - 1; i >= 0; i--) {
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      var k = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
      var x = (parMois && parMois[k]) || { n: 0, ca: 0 };
      out.push({ k: k, label: m.toLocaleDateString('fr-FR', { month: 'short' }), n: x.n, ca: x.ca });
    }
    return out;
  }

  /* ── Rendu (chaînes HTML, données déjà échappées) ─────────────────────── */
  function chip(e) { return '<span class="chip ' + e.cls + '">' + esc(e.label) + '</span>'; }
  function tuileKpi(k) { return '<div class="kdmc-card kdmc-in kpi ' + k.cls + '"><div class="l">' + esc(k.l) + '</div><div><div class="v">' + esc(k.v) + '</div><div class="s">' + esc(k.s) + '</div></div></div>'; }

  function sectionVentes(live) {
    if (!live) return '<div class="note err">Caisse injoignable : les ventes ne peuvent pas être lues pour l\'instant.</div>';
    var v = live.ventes, b = moisBarres(v.parMois, 6), max = Math.max.apply(null, b.map(function (x) { return x.ca; })) || 1;
    var h = '<div class="kdmc-card tile"><h3>📈 Chiffre d\'affaires — 6 mois</h3><div class="bars">'
      + b.map(function (x) { return '<div><div class="b" style="height:' + Math.max(2, Math.round(x.ca / max * 100)) + '%" title="' + esc(x.k + ' : ' + euro(x.ca) + ' (' + x.n + ')') + '"></div><div class="t">' + esc(x.label) + '</div></div>'; }).join('')
      + '</div><div class="meta">' + (v.n ? euro(v.ca) + ' au total · ' + v.n + ' vente(s)' : 'Aucune vente enregistrée par la caisse pour l\'instant — c\'est le chiffre réel, pas une estimation.') + '</div></div>';
    h += '<div class="kdmc-card tile"><h3>🧾 Dernières ventes</h3>';
    if (!v.dernieres.length) h += '<div class="meta">Rien encore. La première apparaîtra ici dès qu\'un paiement est vérifié.</div>';
    else h += '<ul class="list">' + v.dernieres.map(function (d) { return '<li><div class="g"><b>' + esc(d.produit) + ' · ' + esc(d.email || '—') + '</b><span>' + esc(dt(d.ts_iso)) + ' · ' + esc(d.source || '?') + '</span></div></li>'; }).join('') + '</ul>';
    h += '</div>';
    return h;
  }

  function sectionFile(live) {
    if (!live) return '';
    var f = live.file;
    var h = '<div class="kdmc-card tile"><h3>⏳ File à valider <span class="chip ' + (f.n ? 'warn' : 'ok') + '">' + f.n + '</span></h3>';
    if (!f.n) h += '<div class="meta">Aucune demande en attente.</div>';
    else h += '<ul class="list">' + f.demandes.map(function (d) {
      return '<li data-demande="' + esc(d.id) + '"><div class="g"><b>' + esc(d.produit || '(montant sans produit)') + ' · ' + esc(d.email || '—') + '</b><span>' + esc(d.methode || '?') + ' · ' + esc(d.etat || '') + ' · ' + esc(dt(d.ts_iso)) + (d.reference ? ' · réf ' + esc(d.reference) : '') + (d.montant ? ' · ' + esc(d.montant + ' ' + (d.devise || '')) : '') + '</span></div>'
        + (d.produit ? '<button class="btn p" data-valider="' + esc(d.id) + '">Livrer</button>' : '') + '<button class="btn d" data-refuser="' + esc(d.id) + '">Refuser</button></li>';
    }).join('') + '</ul>';
    return h + '</div>';
  }

  /* ── Paniers (PayPal perso) ───────────────────────────────────────────
     Kevin encaisse sur son PayPal personnel : personne ne peut capturer le
     paiement à sa place. Ce bloc est donc le SEUL endroit où il voit qui a
     ouvert un panier, pour quoi, pour combien — et qui dit avoir payé. */
  function sectionPaniers(live) {
    if (!live || !live.intentions) return '';
    var it = live.intentions;
    var h = '<div class="kdmc-card tile"><h3>🛒 Paniers ouverts <span class="chip ' + (it.dit_paye ? 'warn' : '') + '">' + it.n + '</span></h3>';
    if (!it.n) h += '<div class="meta">Aucun panier ouvert. Un panier est créé dès que quelqu\'un touche « Payer » : e-mail, produit, montant et consentement sont gardés même s\'il ne revient jamais.</div>';
    else {
      h += '<ul class="list">' + it.liste.map(function (c) {
        var paye = c.etat === 'dit_paye';
        var moyen = { paypal: 'PayPal', revolut: 'Revolut', virement: 'virement' }[c.moyen] || c.moyen || 'PayPal';
        return '<li><div class="g"><b>' + esc(c.ref) + ' · ' + esc(c.produit) + ' · ' + esc(c.email || '—') + '</b><span>'
          + esc(euro(c.montant) + ' · ' + moyen + ' · ' + (paye ? 'dit avoir payé' : 'en attente') + ' · il y a ' + c.heures + ' h'
            + (c.relance_iso ? ' · relancé' : '') + ' · ' + dt(c.ts_iso))
          + '</span></div>' + (paye ? '<span class="chip warn">à livrer</span>' : '')
          + '<button class="btn p" data-livrer="' + esc(c.ref) + '">Livrer</button>'
          + '<button class="btn d" data-abandon="' + esc(c.ref) + '">Abandonné</button></li>';
      }).join('') + '</ul>';
      h += '<div class="meta">' + euro(it.ca_potentiel) + ' possible. Ceux marqués « dit avoir payé » sont aussi dans la file à valider : un clic sur « Livrer » envoie le code.</div>';
      /* Rattraper ceux qui se sont interrompus : la seule vraie automatisation
         possible quand aucun compte ne permet de constater le paiement. */
      if (it.relancables) {
        h += '<p><button class="btn p" data-relancer="1">Relancer ' + it.relancables + ' panier(s) abandonné(s)</button>'
          + '<span class="meta"> Un seul e-mail par panier, jamais deux — au-delà, ce n\'est plus une relance.</span></p>';
      }
    }
    return h + '</div>';
  }

  function sectionProduits(data, live) {
    var contenu = (live && live.contenu) || null;
    var parId = {}; ((live && live.produits) || []).forEach(function (p) { parId[p.id] = p; });
    var ventes = (live && live.ventes && live.ventes.parProduit) || {};
    return '<div class="grid">' + (data.produits || []).map(function (p) {
      var lv = parId[p.id] || {}, vt = ventes[p.id] || { n: 0, ca: 0 };
      var chips = [];
      if (p.gele) chips.push({ cls: 'warn', label: 'gelé — Kevin 16.09' });
      chips.push(etatContenu(p.modulesAttendus, contenu ? contenu[p.id] : null));
      if (live) chips.push(etatLivraison(lv.livre_http));
      chips.push({ cls: vt.n ? 'ok' : '', label: vt.n + ' vente(s) · ' + euro(vt.ca) });
      return '<div class="kdmc-card kdmc-in tile"><h3>' + (p.famille === 'casino' ? '🎰' : p.famille === 'club' ? '🔁' : '🧰') + ' ' + esc(p.court) + ' <span class="chip gold">' + esc(p.prix + ' €') + (p.prixBarre ? ' <s style="opacity:.6">' + esc(p.prixBarre) + '</s>' : '') + '</span></h3>'
        + '<div class="meta">' + esc(p.cible ? 'Pour ' + p.cible.split(',')[0] : (p.nom || '')) + '</div>'
        + '<div class="row">' + chips.map(chip).join('') + '</div>'
        + '<div class="row"><a class="btn" href="' + esc(p.page) + '" target="_blank" rel="noopener">Page de vente</a>' + (p.lecteur ? '<a class="btn" href="' + esc(p.lecteur) + '" target="_blank" rel="noopener">Lecteur</a>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function sectionCommandes(data, live) {
    var runs = {}; ((live && live.workflows) || []).forEach(function (w) { runs[w.id] = w; });
    var on = !!(live && live.config && live.config.commandes);
    var wfs = data.workflows || {};
    return '<div class="grid">' + Object.keys(wfs).map(function (id) {
      var w = wfs[id], r = runs[id] || {}, e = etatRun(r.run);
      var champs = Object.keys(w.inputs || {}).map(function (k) {
        var opts = w.inputs[k];
        if (Array.isArray(opts)) return '<label class="meta">' + esc(k) + ' <select class="sel" data-wf="' + esc(id) + '" data-champ="' + esc(k) + '">' + opts.map(function (o) { return '<option' + ((w.defaut || {})[k] === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
        return '';
      }).join('');
      var url = r.url || (data.depot + '/actions/workflows/' + id);
      return '<div class="kdmc-card kdmc-in tile" data-wftile="' + esc(id) + '"><h3>▶️ ' + esc(w.nom) + '</h3><div class="row">' + chip(e) + (r.run && r.run.url ? '<a class="chip" href="' + esc(r.run.url) + '" target="_blank" rel="noopener">voir le journal ›</a>' : '') + '</div>'
        + (champs ? '<div class="row">' + champs + '</div>' : '')
        + '<div class="row">' + (on ? '<button class="btn p" data-lancer="' + esc(id) + '">Lancer</button>' : '') + '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + (on ? 'Sur GitHub' : 'Lancer sur GitHub') + '</a></div></div>';
    }).join('') + '</div>' + (on ? '' : '<div class="note">Les boutons « Lancer » passent par GitHub tant que le jeton n\'est pas posé sur la caisse (secret GITHUB_DISPATCH_TOKEN, poussé par le déploiement de kdmc-vente depuis APEX_GITHUB_PAT).</div>');
  }

  function sectionVideos(data) {
    var vs = (data.videos || []).slice().sort(function (a, b) { return String(a.date || '9').localeCompare(String(b.date || '9')); });
    return '<div class="kdmc-card tile"><div class="meta">Programmées dans Metricool (marque ' + esc(data.programmation && data.programmation.marque) + ', 4 réseaux). La publication effective se lit sur le <a href="' + esc(data.programmation && data.programmation.planning) + '" target="_blank" rel="noopener" style="color:var(--gold2)">planning Metricool</a> — pas ici.</div><ul class="list">'
      + vs.map(function (v) { return '<li><div class="g"><b>' + esc(v.id) + ' · ' + esc(v.produit) + '</b><span>' + (v.date ? esc(jour(v.date) + ' ' + dt(v.date).slice(-5)) : 'non programmée') + ' · ' + v.cartes + ' cartes · ' + esc(v.theme) + '</span></div><a href="' + esc(v.mp4) + '" target="_blank" rel="noopener">MP4 ›</a></li>'; }).join('')
      + '</ul></div>';
  }

  /* Posts AVEC LIEN sur la Page Facebook : le seul format qui amène quelqu'un sur le site
     (un Reel renvoie au profil). L'aperçu montré est l'image de la page, servie par le domaine. */
  function sectionLiens(data) {
    var ls = (data.liens || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (!ls.length) return '<div class="note">Aucun post-lien programmé pour l\'instant. La routine du lundi en pose un par semaine, en faisant tourner les pages.</div>';
    return '<div class="kdmc-card tile"><div class="meta">Format <b>post avec lien</b> sur la Page Facebook : l\'aperçu (image + titre) vient de la page elle-même, et le lien se clique — contrairement à un Reel.</div><ul class="list">'
      + ls.map(function (l) {
        return '<li><div class="g"><b>' + esc(l.produit) + '</b><span>' + esc(jour(l.date) + ' ' + dt(l.date).slice(-5)) + ' · facebook</span></div>'
             + '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">page ›</a>'
             + '<a href="' + esc(l.apercu) + '" target="_blank" rel="noopener">aperçu ›</a></li>';
      }).join('') + '</ul></div>';
  }

  function sectionMarche(m) {
    if (!m) return '';
    return '<div class="kdmc-card tile"><h3>🎯 Quelle niche rapporte le plus ?</h3>'
      + '<div class="note">' + esc(m.nos_ventes.note) + '</div>'
      + '<ul class="list">' + (m.conclusion || []).map(function (c) { return '<li><div class="g" style="white-space:normal"><b style="white-space:normal">' + esc(c) + '</b></div></li>'; }).join('') + '</ul>'
      + '<details class="more"><summary>Les relevés et leurs sources (' + (m.releves || []).length + ') ›</summary><div class="src">'
      + (m.releves || []).map(function (r) { return '<p><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.source) + '</a><br>' + r.faits.map(esc).join('<br>') + '</p>'; }).join('')
      + '</div></details><div class="meta">Relevé du ' + esc(m.date) + '.</div></div>';
  }

  function sectionPages(data) {
    return '<div class="kdmc-card tile"><ul class="list">' + (data.pages || []).map(function (p) { return '<li><div class="g"><b>' + esc(p.ic + ' ' + p.nom) + '</b><span>' + esc(p.quoi) + '</span></div><a href="' + esc(p.url) + '" target="_blank" rel="noopener">ouvrir ›</a></li>'; }).join('') + '</ul></div>';
  }

  function sectionConfig(live) {
    if (!live) return '';
    var c = live.config;
    var items = [['PayPal webhook (livraison instantanée)', c.paypal_webhook], ['PayPal recherche (réclamation)', c.paypal_recherche], ['E-mail du code (EmailJS)', c.email_code], ['Base de contenu (D1)', c.contenu_prive], ['Boutons « Lancer »', c.commandes]];
    return '<div class="kdmc-card tile"><h3>⚙️ Caisse — ce qui est branché</h3><div class="row">' + items.map(function (i) { return chip({ cls: i[1] ? 'ok' : 'warn', label: (i[1] ? '✓ ' : '✗ ') + i[0] }); }).join('') + '</div>'
      + (live.base_detail ? '<div class="note err">' + esc(live.base_detail) + '</div>' : '') + '<div class="meta">Lu ' + esc(dt(live.quand)) + ' · admin ' + esc(live.admin || '') + '</div></div>';
  }

  /* ── Coordonnées bancaires ─────────────────────────────────────────────
     L'IBAN de Kevin ne peut PAS vivre dans le dépôt (il est public). Il se pose
     ici, une fois, et le worker le garde dans son coffre. Tant qu'il n'est pas
     posé, le bouton « virement » n'apparaît même pas sur les pages de vente. */
  function sectionBanque(live) {
    /* Cette tuile est une ACTION, pas un rapport : elle doit être là MÊME quand
       la caisse ne répond pas. La faire disparaître dans ce cas (ce qu'elle
       faisait le 18.09) est exactement le moment où Kevin en a besoin et où il
       ne voit rien du tout — sans savoir pourquoi. */
    var b = (live && live.banque) || {};
    var lu = !!live;
    var etat = !lu ? 'illisible' : (b.iban ? 'ouvert' : 'fermé');
    var h = '<div class="kdmc-card tile"><h3>🏦 Virement — mon IBAN <span class="chip ' + (!lu ? 'err' : (b.iban ? 'ok' : 'warn')) + '">' + etat + '</span></h3>';
    h += '<div class="meta">' + (!lu
      ? 'La caisse n\'a pas répondu, donc je ne peux pas te dire si un IBAN est déjà rangé. Tu peux quand même l\'enregistrer ici : si ça échoue, c\'est que ta session admin a expiré — recharge la page et reconnecte-toi.'
      : (b.iban
        ? 'Rangé dans le coffre du worker, jamais dans le dépôt : ' + esc(b.iban) + (b.bic ? ' · BIC ' + esc(b.bic) : '') + (b.titulaire ? ' · ' + esc(b.titulaire) : '') + (b.pose_iso ? ' · posé le ' + esc(dt(b.pose_iso)) : '')
        : 'Tant que ton IBAN n\'est pas posé, le bouton « payer par virement » n\'apparaît pas sur tes pages. Pose-le ici : il ne partira jamais dans le dépôt.')) + '</div>';
    h += '<div class="forme"><input class="champ" id="ibanIn" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="FR76 …" aria-label="IBAN">'
      + '<input class="champ" id="bicIn" type="text" autocomplete="off" placeholder="BIC (facultatif)" aria-label="BIC">'
      + '<input class="champ" id="titulaireIn" type="text" autocomplete="off" placeholder="Titulaire du compte" aria-label="Titulaire">'
      + '<button class="btn p" data-banque="poser">Enregistrer</button>'
      + (b.iban ? '<button class="btn d" data-banque="effacer">Retirer</button>' : '') + '</div>';
    h += '<div class="meta">La clé de contrôle est vérifiée avant l\'enregistrement : une faute de frappe enverrait tes virements nulle part.</div>';
    return h + '</div>';
  }

  function rendu(data, live, erreurLive) {
    var k = kpis(data, live);
    return '<div class="kpis">' + k.map(tuileKpi).join('') + '</div>'
      + (erreurLive ? '<div class="note err">Caisse (kdmc-vente) injoignable : ' + esc(erreurLive) + '. Les tuiles « construit » restent justes ; les chiffres live sont à relire.</div>' : '')
      + '<h2 class="cat">💶 Ventes <button class="refresh" id="rf" type="button">↻ Relire la caisse</button></h2>' + sectionVentes(live)
      + sectionPaniers(live)
      + sectionFile(live)
      + '<h2 class="cat">🧰 Produits</h2>' + sectionProduits(data, live)
      + '<h2 class="cat">▶️ Commandes</h2>' + sectionCommandes(data, live)
      + '<h2 class="cat">🎬 Pub — vidéos sans visage</h2>' + sectionVideos(data)
      + '<h2 class="cat">🔗 Pub — posts avec lien (Facebook)</h2>' + sectionLiens(data)
      + '<h2 class="cat">🎯 Marché</h2>' + sectionMarche(data.marche)
      + '<h2 class="cat">🔗 Tout ce qui existe</h2>' + sectionPages(data)
      + '<h2 class="cat">⚙️ Caisse</h2>' + sectionBanque(live) + sectionConfig(live);
  }

  var API = { esc: esc, euro: euro, etatRun: etatRun, etatLivraison: etatLivraison, etatContenu: etatContenu, kpis: kpis, moisBarres: moisBarres, rendu: rendu, sectionPaniers: sectionPaniers, sectionBanque: sectionBanque, sectionLiens: sectionLiens, CAISSE: CAISSE };
  global.kdmcCommerce = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;

  /* ── DOM ──────────────────────────────────────────────────────────────── */
  if (typeof document === 'undefined') return;
  var app = document.getElementById('app');
  var DATA = null, LIVE = null;

  function deny(s) {
    var diag = !s ? 'Aucune <b>session du domaine</b> sur cet appareil.'
      : (!s.admin ? 'Connecté en tant que <b>' + esc(s.name || '?') + '</b>, mais ce compte n\'est pas administrateur.'
        : 'Connecté en tant que <b>' + esc(s.name || '?') + '</b> (admin), mais sans <b>Face ID</b> : le tableau de bord commande la caisse, il exige l\'identité forte.');
    app.innerHTML = '<div class="msg">🔒 <b>Accès administrateur</b><br><br>' + diag + '<br><br>Connecte-toi sur <a href="/" style="color:var(--gold)">kd-mc.com</a> avec Face ID (compte Kevin).</div>';
  }
  function toast(t) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 4500); }
  function bearer() { var t = global.kdmcSSO && global.kdmcSSO.token ? global.kdmcSSO.token() : ''; return t ? { Authorization: 'Bearer ' + t } : {}; }

  function lireLive() {
    return fetch(CAISSE + '/admin/tableau', { headers: bearer(), cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error((j && (j.detail || j.error)) || ('HTTP ' + r.status)); return j; }); });
  }
  function affiche(err) {
    app.innerHTML = rendu(DATA, LIVE, err);
    var rf = document.getElementById('rf'); if (rf) rf.addEventListener('click', function () { rf.disabled = true; recharge(); });
    app.querySelectorAll('[data-valider],[data-refuser]').forEach(function (b) {
      b.addEventListener('click', function () {
        var refuser = b.hasAttribute('data-refuser'), id = b.getAttribute(refuser ? 'data-refuser' : 'data-valider');
        if (refuser && !confirm('Refuser cette demande ? Rien ne sera livré.')) return;
        b.disabled = true;
        fetch(CAISSE + '/admin/valider', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, bearer()), body: JSON.stringify(refuser ? { demande: id, refuser: true } : { demande: id }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { toast(j.ok ? (refuser ? 'Demande refusée.' : 'Livré : code ' + j.code + (j.email_envoye ? ' (e-mail envoyé)' : ' (e-mail non envoyé — à transmettre)')) : 'Échec : ' + (j.detail || j.error)); recharge(); })
          .catch(function (e) { toast('Réseau : ' + e.message); b.disabled = false; });
      });
    });
    /* Kevin voit le paiement dans SON PayPal : un doigt, et l'accès part. Le
       worker refuse de livrer deux fois le même panier — il rend le même code. */
    app.querySelectorAll('[data-livrer],[data-abandon]').forEach(function (b) {
      b.addEventListener('click', function () {
        var abandon = b.hasAttribute('data-abandon'), ref = b.getAttribute(abandon ? 'data-abandon' : 'data-livrer');
        if (!confirm(abandon ? 'Retirer le panier ' + ref + ' ? Rien ne sera livré.' : 'Tu as bien reçu le paiement de ' + ref + ' sur PayPal ? L\'accès part par e-mail.')) return;
        b.disabled = true;
        fetch(CAISSE + '/admin/livrer-panier', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, bearer()), body: JSON.stringify(abandon ? { ref: ref, abandonner: true } : { ref: ref }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            toast(j.ok
              ? (abandon ? 'Panier retiré.' : (j.deja_delivre ? 'Déjà livré : même code ' + j.code : 'Livré : code ' + j.code + (j.email_envoye ? ' (e-mail envoyé)' : ' (e-mail non envoyé — à transmettre à ' + j.email + ')')))
              : 'Échec : ' + (j.detail || j.error));
            recharge();
          })
          .catch(function (e) { toast('Réseau : ' + e.message); b.disabled = false; });
      });
    });
    app.querySelectorAll('[data-relancer]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Envoyer un e-mail de relance aux paniers abandonnés ? Un seul par panier, jamais deux.')) return;
        b.disabled = true; b.textContent = '…';
        fetch(CAISSE + '/admin/relancer', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, bearer()), body: JSON.stringify({ heures: 2 }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { toast(j.ok ? (j.envoyees + ' relance(s) envoyée(s)' + (j.echecs ? ', ' + j.echecs + ' échec(s)' : '')) : 'Refusé : ' + (j.detail || j.error)); recharge(); })
          .catch(function (e) { toast('Réseau : ' + e.message); b.disabled = false; b.textContent = 'Relancer'; });
      });
    });
    app.querySelectorAll('[data-banque]').forEach(function (b) {
      b.addEventListener('click', function () {
        var effacer = b.getAttribute('data-banque') === 'effacer';
        if (effacer && !confirm('Retirer ton IBAN ? Le bouton « virement » disparaîtra de tes pages.')) return;
        var iban = (document.getElementById('ibanIn') || {}).value || '';
        if (!effacer && !iban.trim()) { toast('Écris ton IBAN d\'abord.'); return; }
        b.disabled = true;
        var corps = effacer ? { effacer: true } : {
          iban: iban, bic: (document.getElementById('bicIn') || {}).value || '',
          titulaire: (document.getElementById('titulaireIn') || {}).value || '',
        };
        fetch(CAISSE + '/admin/reglages', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, bearer()), body: JSON.stringify(corps) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            toast(j.ok ? (effacer ? 'IBAN retiré.' : 'IBAN enregistré : ' + j.banque.iban) : 'Refusé : ' + (j.detail || j.error));
            if (j.ok) recharge(); else b.disabled = false;
          })
          .catch(function (e) { toast('Réseau : ' + e.message); b.disabled = false; });
      });
    });
    app.querySelectorAll('[data-lancer]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-lancer'), inputs = {};
        app.querySelectorAll('select[data-wf="' + id + '"]').forEach(function (s) { inputs[s.getAttribute('data-champ')] = s.value; });
        if (!confirm('Lancer « ' + id + ' » sur main' + (Object.keys(inputs).length ? ' avec ' + JSON.stringify(inputs) : '') + ' ?')) return;
        b.disabled = true; b.textContent = '…';
        fetch(CAISSE + '/admin/lancer', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, bearer()), body: JSON.stringify({ workflow: id, inputs: inputs }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { toast(j.ok ? 'Lancé — le journal apparaît sur GitHub dans quelques secondes.' : 'Refusé : ' + (j.detail || j.error)); setTimeout(recharge, 4000); })
          .catch(function (e) { toast('Réseau : ' + e.message); b.disabled = false; b.textContent = 'Lancer'; });
      });
    });
  }
  function recharge() { lireLive().then(function (j) { LIVE = j; affiche(null); }).catch(function (e) { affiche(String(e.message || e)); }); }

  function boot() {
    if (global.kdmcSSO && global.kdmcSSO.consumeHashToken) global.kdmcSSO.consumeHashToken();
    var who = global.kdmcSSO ? global.kdmcSSO.whoami() : Promise.resolve(null);
    who.then(function (s) {
      if (!s || !s.admin || !s.verified) return deny(s);
      return fetch('commerce-data.json', { cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (d) { DATA = d; affiche('lecture en cours…'); recharge(); })
        .catch(function (e) { app.innerHTML = '<div class="msg">Données du tableau introuvables (' + esc(e.message) + ') — relance la génération (npm run commerce:data).</div>'; });
    }).catch(function () { deny(null); });
  }
  boot();
})(typeof window !== 'undefined' ? window : globalThis);
