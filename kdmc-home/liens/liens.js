/* KDMC APEX — Centre de contrôle (liens 1-clic, par famille). v1.3.0
   Réservé Kevin / Lolo. Tout est fail-open (anti-lockout, règles #81/#98).
   Aucun secret ici : uniquement des liens vers TES tableaux de bord.
   + Recherche instantanée + pastilles d'état des workers (lit le JSON de
     santé committé chaque jour : /CMCteams/tools/health/workers-status.json). */
(function () {
  'use strict';

  var GH = 'https://github.com/9r4rxssx64-creator/cmcteams';
  /* Adresse du domaine : le dépôt GitHub passe en privé, github.io s'éteint. */
  var PAGES = 'https://shops.kd-mc.com';
  var CF = 'https://dash.cloudflare.com/?to=/:account';
  var WK = function (name) { return 'https://' + name + '.9r4rxssx64.workers.dev'; };
  var FB = 'https://console.firebase.google.com/project';
  var HEALTH_URL = '/CMCteams/tools/health/workers-status.json';
  var BAL_URL = 'https://kdmc-balances.9r4rxssx64.workers.dev/balances';

  /* ---- Données : familles de liens ---- */
  var DATA = [
    {
      title: '🎰 Mes apps', sub: 'Ouvrir une app en 1 clic',
      items: [
        { ic: '📅', nm: 'CMCteams', ds: 'Plannings & équipes — Casino de Monaco', url: 'https://cmcteams.kd-mc.com/' },
        { ic: '🤖', nm: 'Apex AI', ds: 'Assistant IA — chat, studios, coffre', url: 'https://apex-ai.kd-mc.com/' },
        { ic: '💬', nm: 'Apex Chat', ds: 'Messagerie chiffrée de bout en bout', url: 'https://apex-chat.kd-mc.com/' },
        { ic: '🎬', nm: 'Créa Studio', ds: 'Montage vidéo, retouche photo, cartoon & photo→vidéo', url: 'https://studio.kd-mc.com/' },
        { ic: '🏠', nm: 'Portail KDMC', ds: 'Page d’accueil du domaine', url: 'https://kd-mc.com/' }
      ]
    },
    {
      title: '🛍️ Boutiques & back-office', sub: 'Vitrines, studios & administration',
      items: [
        { ic: '🏬', nm: 'Portail boutiques', ds: 'Toutes les boutiques', url: PAGES + '/' },
        { ic: '📊', nm: 'Dashboard boutiques', ds: 'Commandes · produits · stats · finances', url: 'https://dashboard.kd-mc.com/' },
        { ic: '📦', nm: 'Sourcing fournisseurs', ds: 'Catalogues — choisir quoi vendre', url: 'https://sourcing.kd-mc.com/' },
        { ic: '🎨', nm: 'Chez Lolo', ds: 'Boutique & studio de création', links: [
          { l: 'Boutique', u: 'https://chez-lolo.kd-mc.com/' },
          { l: 'Studio', u: 'https://chez-lolo.kd-mc.com/studio.html' }
        ] },
        { ic: '🌿', nm: 'La Détente', ds: 'Boutique & studio (POD)', links: [
          { l: 'Boutique', u: 'https://la-detente.kd-mc.com/' },
          { l: 'Studio', u: 'https://la-detente.kd-mc.com/studio.html' }
        ] },
        { ic: '🚧', nm: 'Boutiques en construction', ds: 'Aperçu des prochaines boutiques', links: [
          { l: 'Tech Hub', u: PAGES + '/tech-hub/' },
          { l: 'EcoCraft', u: PAGES + '/ecocraft/' },
          { l: 'Digital Vault', u: PAGES + '/digital-vault/' },
          { l: 'Pawsome', u: PAGES + '/pawsome/' }
        ] }
      ]
    },
    {
      title: '🔑 Clés API & IA', sub: 'Pour chaque service : clés · solde/usage · recharger',
      items: [
        { ic: '🟣', nm: 'Anthropic (Claude)', ds: 'ANTHROPIC_API_KEY', links: [
          { l: 'Clés', u: 'https://console.anthropic.com/settings/keys' },
          { l: 'Solde/Usage', u: 'https://console.anthropic.com/settings/usage' },
          { l: 'Recharger', u: 'https://console.anthropic.com/settings/billing' }
        ] },
        { ic: '🟢', nm: 'OpenAI', ds: 'OPEN_AI_API_KEY', links: [
          { l: 'Clés', u: 'https://platform.openai.com/api-keys' },
          { l: 'Usage', u: 'https://platform.openai.com/usage' },
          { l: 'Recharger', u: 'https://platform.openai.com/settings/organization/billing/overview' }
        ] },
        { ic: '🔵', nm: 'Google Gemini', ds: 'GEMINI_API_KEY', links: [
          { l: 'Clés', u: 'https://aistudio.google.com/app/apikey' },
          { l: 'Facturation', u: 'https://console.cloud.google.com/billing' }
        ] },
        { ic: '🟠', nm: 'Mistral', ds: 'MISTRAL_API_KEY', links: [
          { l: 'Clés', u: 'https://console.mistral.ai/api-keys' },
          { l: 'Facturation', u: 'https://console.mistral.ai/billing' }
        ] },
        { ic: '⚡', nm: 'Groq', ds: 'GROQ_API_KEY', links: [
          { l: 'Clés', u: 'https://console.groq.com/keys' },
          { l: 'Facturation', u: 'https://console.groq.com/settings/billing' }
        ] },
        { ic: '🐋', nm: 'DeepSeek', ds: 'DEEPSEEK_API_KEY', links: [
          { l: 'Clés', u: 'https://platform.deepseek.com/api_keys' },
          { l: 'Solde', u: 'https://platform.deepseek.com/usage' },
          { l: 'Recharger', u: 'https://platform.deepseek.com/top_up' }
        ] },
        { ic: '🔎', nm: 'Perplexity', ds: 'PERPLEXITI_API_KEY', links: [
          { l: 'Clés & solde', u: 'https://www.perplexity.ai/settings/api' }
        ] },
        { ic: '✖️', nm: 'xAI (Grok)', ds: 'XAI_API_KEY', links: [
          { l: 'Console', u: 'https://console.x.ai/' }
        ] },
        { ic: '🟤', nm: 'Cohere', ds: 'COHERE_API_KEY', links: [
          { l: 'Clés', u: 'https://dashboard.cohere.com/api-keys' },
          { l: 'Facturation', u: 'https://dashboard.cohere.com/billing/usage' }
        ] },
        { ic: '🤝', nm: 'Together AI', ds: 'TOGETHER_API_KEY', links: [
          { l: 'Clés', u: 'https://api.together.xyz/settings/api-keys' },
          { l: 'Facturation', u: 'https://api.together.xyz/settings/billing' }
        ] },
        { ic: '🎬', nm: 'Replicate', ds: 'AX_REPLICATE_KEY (image/vidéo)', links: [
          { l: 'Clés', u: 'https://replicate.com/account/api-tokens' },
          { l: 'Facturation', u: 'https://replicate.com/account/billing' }
        ] },
        { ic: '🔭', nm: 'Tavily', ds: 'TAVILY_API_KEY (recherche)', links: [
          { l: 'Tableau de bord', u: 'https://app.tavily.com/home' }
        ] },
        { ic: '🌲', nm: 'Pinecone', ds: 'PINECONE_API_KEY (vecteurs)', links: [
          { l: 'Tableau de bord', u: 'https://app.pinecone.io/' }
        ] },
        { ic: '📈', nm: 'Finnhub', ds: 'FINNHUB_API_KEY (bourse)', links: [
          { l: 'Tableau de bord', u: 'https://finnhub.io/dashboard' }
        ] },
        { ic: '🖼️', nm: 'Pexels', ds: 'PEXELS_API_KEY (photos)', links: [
          { l: 'API', u: 'https://www.pexels.com/api/' }
        ] },
        { ic: '🖨️', nm: 'Printify', ds: 'PRINTIFY_API_KEY (POD)', links: [
          { l: 'Clés API', u: 'https://printify.com/app/account/api' },
          { l: 'Commandes', u: 'https://printify.com/app/orders' }
        ] },
        { ic: '📱', nm: 'Vonage', ds: 'VONAGE_API_KEY (SMS)', links: [
          { l: 'Tableau de bord', u: 'https://dashboard.vonage.com/' }
        ] },
        { ic: '✉️', nm: 'EmailJS', ds: 'EMAILJS_PRIVATE_KEY', links: [
          { l: 'Admin', u: 'https://dashboard.emailjs.com/admin' }
        ] },
        { ic: '💬', nm: 'Telegram', ds: 'TELEGRAM_API_KEY (bot)', links: [
          { l: 'BotFather', u: 'https://t.me/BotFather' }
        ] },
        { ic: '📺', nm: 'YouTube / Google', ds: 'YOUTUBE_CLIENT_ID · SECRET · REFRESH_TOKEN', links: [
          { l: 'YouTube Studio', u: 'https://studio.youtube.com/' },
          { l: 'Identifiants Google', u: 'https://console.cloud.google.com/apis/credentials' }
        ] }
      ]
    },
    {
      title: '☁️ Cloudflare — Workers & infra', sub: 'Tableau de bord + santé des workers',
      items: [
        { ic: '☁️', nm: 'Cloudflare', ds: 'Tableau de bord principal', links: [
          { l: 'Accueil', u: 'https://dash.cloudflare.com/' },
          { l: 'Workers', u: CF + '/workers/services' },
          { l: 'KV', u: CF + '/workers/kv/namespaces' },
          { l: 'R2', u: CF + '/r2/overview' },
          { l: 'D1', u: CF + '/workers/d1' },
          { l: 'Queues', u: CF + '/workers/queues' }
        ] },
        { ic: '🫀', nm: 'Santé des workers', ds: 'Pastille = dernier contrôle quotidien · clic = /health en direct', health: true, links: [
          { l: 'kdmc-router', u: 'https://kd-mc.com/', host: 'kd-mc' },
          { l: 'apex-auth', u: WK('apex-auth-worker') + '/health', host: 'apex-auth-worker' },
          { l: 'apex-v13-backend', u: WK('apex-v13-backend') + '/health', host: 'apex-v13-backend' },
          { l: 'apex-chat-api', u: WK('apex-chat-api') + '/health', host: 'apex-chat-api' },
          { l: 'apex-vault-svc', u: WK('apex-vault-svc') + '/health', host: 'apex-vault-svc' },
          { l: 'apex-sentinels', u: WK('apex-sentinels-svc') + '/health', host: 'apex-sentinels-svc' },
          { l: 'apex-push', u: WK('apex-push-worker') + '/health', host: 'apex-push-worker' },
          { l: 'apex-secrets-proxy', u: WK('apex-secrets-proxy') + '/health', host: 'apex-secrets-proxy' },
          { l: 'coffre-r2', u: WK('coffre-r2') + '/health', host: 'coffre-r2' },
          { l: 'cmc-parser-proxy', u: WK('cmc-parser-proxy') + '/healthz', host: 'cmc-parser-proxy' },
          { l: 'ld-gemini-proxy', u: WK('ld-gemini-proxy') + '/', host: 'ld-gemini-proxy' },
          { l: 'ld-printify-order', u: WK('ld-printify-order') + '/', host: 'ld-printify-order' }
        ] }
      ]
    },
    {
      title: '🔥 Firebase', sub: 'Bases temps réel & consommation',
      items: [
        { ic: '🔥', nm: 'cmcteams-c16ab', ds: 'CMCteams (planning, chat) · europe-west1', links: [
          { l: 'Données', u: FB + '/cmcteams-c16ab/database/cmcteams-c16ab-default-rtdb/data' },
          { l: 'Usage', u: FB + '/cmcteams-c16ab/usage' }
        ] },
        { ic: '🔥', nm: 'kdmc-clients', ds: 'Apex AI (chat, coffre, clients) · europe-west1', links: [
          { l: 'Données', u: FB + '/kdmc-clients/database/kdmc-clients-default-rtdb/data' },
          { l: 'Usage', u: FB + '/kdmc-clients/usage' }
        ] },
        { ic: '🧰', nm: 'Console Firebase', ds: 'Tous les projets', url: 'https://console.firebase.google.com/' }
      ]
    },
    {
      title: '🚀 Code, déploiements & CI', sub: 'GitHub : repo, Actions, secrets',
      items: [
        { ic: '🐙', nm: 'Dépôt GitHub', ds: 'cmcteams (code source)', url: GH },
        { ic: '⚙️', nm: 'Actions (déploiements)', ds: 'Tous les workflows & runs', links: [
          { l: 'Tous les runs', u: GH + '/actions' },
          { l: 'router', u: GH + '/actions/workflows/deploy-kdmc-router.yml' },
          { l: 'apex-chat', u: GH + '/actions/workflows/deploy-apex-chat.yml' },
          { l: 'v13-backend', u: GH + '/actions/workflows/deploy-apex-v13-backend.yml' },
          { l: 'auth', u: GH + '/actions/workflows/deploy-apex-auth-worker.yml' },
          { l: 'push', u: GH + '/actions/workflows/deploy-push-worker.yml' },
          { l: 'coffre-r2', u: GH + '/actions/workflows/deploy-coffre-r2.yml' },
          { l: 'soldes', u: GH + '/actions/workflows/deploy-kdmc-balances.yml' },
          { l: 'santé workers', u: GH + '/actions/workflows/workers-health-check.yml' },
          { l: 'social-publish', u: GH + '/actions/workflows/social-publish.yml' },
          { l: 'social-scheduler', u: GH + '/actions/workflows/social-scheduler.yml' },
          { l: 'agent 24/7', u: GH + '/actions/workflows/agent-cron.yml' }
        ] },
        { ic: '🔐', nm: 'Secrets & Pages', ds: 'Réglages du dépôt', links: [
          { l: 'Secrets Actions', u: GH + '/settings/secrets/actions' },
          { l: 'GitHub Pages', u: GH + '/settings/pages' }
        ] }
      ]
    },
    {
      title: '🌐 Domaine & DNS', sub: 'kd-mc.com (Cloudflare Registrar)',
      items: [
        { ic: '🌐', nm: 'kd-mc.com', ds: 'Domaine, DNS & SSL', links: [
          { l: 'Domaine', u: CF + '/domains' },
          { l: 'DNS', u: CF + '/kd-mc.com/dns/records' },
          { l: 'SSL/TLS', u: CF + '/kd-mc.com/ssl-tls' }
        ] }
      ]
    },
    {
      title: '💳 Paiements & services', sub: 'Encaissements & outils',
      items: [
        { ic: '💳', nm: 'Stripe', ds: 'Paiements & abonnements', url: 'https://dashboard.stripe.com/' },
        { ic: '🅿️', nm: 'PayPal', ds: 'Compte marchand', url: 'https://www.paypal.com/businessprofile/' },
        { ic: '🖨️', nm: 'Printify', ds: 'Commandes POD', url: 'https://printify.com/app/orders' },
        { ic: '▲', nm: 'Vercel', ds: 'Fonctions (webhooks, factures)', url: 'https://vercel.com/dashboard' },
        { ic: '🚂', nm: 'Railway', ds: 'Hébergement agent', url: 'https://railway.app/dashboard' },
        { ic: '📧', nm: 'Brevo', ds: 'Emails transactionnels', url: 'https://app.brevo.com/' }
      ]
    },
    {
      title: '🔒 Admin & coffre', sub: 'Espace privé du domaine',
      adm: true,
      items: [
        { ic: '👥', nm: 'Admin domaine', ds: 'Fiches clients (code admin requis)', url: '/admin/' },
        { ic: '🔐', nm: 'Coffre-fort', ds: 'Documents & accès sécurisés', url: 'https://coffre.kd-mc.com/' }
      ]
    }
  ];

  /* ---- Rendu ---- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function cardHtml(it, adm) {
    var cls = 'card' + (adm ? ' adm' : '');
    var searchText = norm([it.nm, it.ds, (it.links || []).map(function (l) { return l.l; }).join(' ')].join(' '));
    var head = '<span class="ic">' + esc(it.ic) + '</span>' +
      '<span class="ct"><span class="nm">' + esc(it.nm) + '</span>' +
      (it.ds ? '<span class="ds">' + esc(it.ds) + '</span>' : '') + '</span>';
    if (it.url) {
      return '<a class="' + cls + '" data-s="' + esc(searchText) + '" href="' + esc(it.url) + '"' +
        (/^https?:/.test(it.url) ? ' target="_blank" rel="noopener noreferrer"' : '') +
        '>' + head + '<span class="arr">›</span></a>';
    }
    var chips = (it.links || []).map(function (lk) {
      var h = lk.host ? ' data-host="' + esc(lk.host) + '"' : '';
      return '<a class="chip"' + h + ' href="' + esc(lk.u) + '" target="_blank" rel="noopener noreferrer">' + esc(lk.l) + ' ›</a>';
    }).join('');
    return '<div class="' + cls + ' multi" data-s="' + esc(searchText) + '">' + head +
      '<span class="chips">' + chips + '</span></div>';
  }

  function render() {
    var root = document.getElementById('ctl');
    if (!root) return 0;
    var n = 0, html = '';
    DATA.forEach(function (fam, fi) {
      html += '<section class="fam" data-fam="' + fi + '">';
      html += '<h2 class="cat">' + esc(fam.title) +
        (fam.sub ? '<small>' + esc(fam.sub) + '</small>' : '') + '</h2>';
      html += '<div class="grid">';
      fam.items.forEach(function (it) {
        html += cardHtml(it, fam.adm);
        n += it.url ? 1 : (it.links ? it.links.length : 0);
      });
      html += '</div></section>';
    });
    root.innerHTML = html;
    var c = document.getElementById('count');
    if (c) c.textContent = n + ' liens';
    return n;
  }

  /* ---- Pastilles d'état des workers (lit le JSON committé, même-origine) ---- */
  function applyHealth() {
    fetch(HEALTH_URL, { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      if (!j || !j.workers) return;
      // map host-prefix -> up
      var up = {};
      Object.keys(j.workers).forEach(function (k) {
        var w = j.workers[k];
        var m = String(w.url || '').match(/https?:\/\/([^.\/]+)/);
        if (m) up[m[1]] = !!w.up;
      });
      var chips = document.querySelectorAll('#ctl .chip[data-host]');
      var seen = 0, ok = 0;
      chips.forEach(function (a) {
        var host = a.getAttribute('data-host');
        if (!(host in up)) return; // pas surveillé → pas de pastille (honnête)
        seen++; if (up[host]) ok++;
        var dot = up[host] ? '🟢 ' : '🔴 ';
        if (a.textContent.indexOf('🟢') < 0 && a.textContent.indexOf('🔴') < 0) {
          a.textContent = dot + a.textContent;
        }
        a.classList.add(up[host] ? 'up' : 'down');
      });
      // résumé sous la carte santé
      var card = document.querySelector('#ctl .chip[data-host]');
      if (card && seen) {
        var box = card.closest('.multi');
        if (box && !box.querySelector('.hsum')) {
          var when = j.checked_at ? new Date(j.checked_at) : null;
          var ago = when ? Math.round((Date.now() - when.getTime()) / 3600000) : null;
          var s = document.createElement('div');
          s.className = 'hsum';
          s.textContent = '🟢 ' + ok + '/' + seen + ' en ligne' +
            (ago != null ? ' · contrôle il y a ' + ago + ' h' : '');
          box.appendChild(s);
        }
      }
    }).catch(function () { /* JSON indispo → aucune pastille, jamais d'erreur visible */ });
  }

  /* ---- Soldes (admin) : worker isolé, gated SSO. N'affiche QUE de vrais chiffres. ---- */
  function fetchBalances() {
    var t = (window.kdmcSSO && window.kdmcSSO.token) ? window.kdmcSSO.token() : '';
    if (!t) return; // pas de pass → pas de solde (pas d'erreur visible)
    fetch(BAL_URL, { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.balances) return;
        var okb = j.balances.filter(function (b) { return b.ok; });
        if (!okb.length) return; // aucun fournisseur avec API de solde → on n'affiche rien
        var box = document.getElementById('balances');
        if (!box) return;
        box.innerHTML = '💰 Soldes&nbsp;: ' + okb.map(function (b) {
          return '<span class="bchip">' + esc(b.label) + ' : ' + esc(b.balance) + ' ' + esc(b.currency) + '</span>';
        }).join('');
        box.hidden = false;
      }).catch(function () { /* worker indispo → rien, jamais d'erreur visible */ });
  }

  /* ---- Recherche instantanée ---- */
  function wireSearch() {
    var q = document.getElementById('q');
    if (!q) return;
    q.addEventListener('input', function () {
      var v = norm(q.value.trim());
      var fams = document.querySelectorAll('#ctl .fam');
      fams.forEach(function (fam) {
        var any = false;
        fam.querySelectorAll('[data-s]').forEach(function (card) {
          var hit = !v || card.getAttribute('data-s').indexOf(v) >= 0;
          card.style.display = hit ? '' : 'none';
          if (hit) any = true;
        });
        fam.style.display = any ? '' : 'none';
      });
    });
  }

  /* ---- Porte d'accès : admin (prouvé serveur) OU Face ID (verified) + nom autorisé.
     Fail-CLOSED : sans preuve d'identité, on cache (centre de contrôle = zone privée).
     Pas un lockout d'app : on retombe sur l'écran "aller au portail" (récupérable). ---- */
  function show(el, on) { if (el) el.hidden = !on; }
  function applyGate() {
    var ctl = document.getElementById('ctl'), lock = document.getElementById('lock'), tools = document.getElementById('tools');
    function open(admin) { show(ctl, true); show(lock, false); show(tools, true); applyHealth(); if (admin) fetchBalances(); }
    function locked() { show(ctl, false); show(lock, true); show(tools, false); }
    try {
      var sso = window.kdmcSSO;
      if (!sso || typeof sso.whoami !== 'function') { locked(); return; }
      sso.whoami().then(function (who) {
        if (!who) { locked(); return; }
        var named = /kevin|laurence|lolo|saint.?polit/i.test(who.name || '');
        var ok = who.admin === true || (who.verified === true && named);
        if (ok) open(who.admin === true); else locked();
      }).catch(function () { locked(); });
    } catch (e) { locked(); }
  }

  function boot() {
    try { if (window.kdmcSSO && window.kdmcSSO.consumeHashToken) window.kdmcSSO.consumeHashToken(); } catch (e) { /* ignore */ }
    render();
    wireSearch();
    applyGate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
