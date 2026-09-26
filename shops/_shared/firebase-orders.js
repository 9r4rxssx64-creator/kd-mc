/* KDMC Shops — helper de remontée des commandes au dashboard admin.
   Isolation : path Firebase strictement `shops_admin_v1/*`. Aucune PII
   (email, adresse, CB) n'est envoyée. Échec silencieux si réseau KO.

   v10 (chantier Firebase par rôle) — les ÉCRITURES ADMIN (produits/logos)
   attachent un id_token Firebase `role:admin` obtenu via `/__admin/fbtoken`
   (router kd-mc.com, derrière le grant admin du domaine). FAIL-OPEN TOTAL :
   si le token est indisponible (pas admin, endpoint down, secrets FB absents)
   → l'écriture part SANS `?auth=` = comportement actuel inchangé. Le verrou
   `_phase_shops_rolelock` (déployé séparément) refusera alors l'écriture anonyme,
   mais JAMAIS de régression tant qu'il n'est pas posé. Les commandes clients
   (kdmcPushOrder) et les LECTURES restent anonymes (catalogue public). */
(function(){
  var FB="https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app";
  var BASE="shops_admin_v1";
  function safe(v,max){return String(v==null?"":v).slice(0,max||120)}
  function num(v){var n=Number(v);return isFinite(n)?n:0}

  /* ── Token admin (role:admin) — fetch paresseux + cache, 100% fail-open ──────
     Récupéré UNIQUEMENT au moment d'une écriture admin (jamais au chargement de
     page). Toute erreur → chaîne vide → écriture inchangée (aucune régression). */
  var _tok=null, _tokExp=0, _tokPromise=null;
  function _fetchAdminToken(){
    var now=Date.now();
    if(_tok && now<_tokExp) return Promise.resolve(_tok);   /* cache valide */
    if(now<_tokExp && _tok==="") return Promise.resolve(""); /* échec récent : ne pas marteler */
    if(_tokPromise) return _tokPromise;                      /* dédup en vol */
    _tokPromise=fetch("/__admin/fbtoken",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}"})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        _tokPromise=null;
        if(j && j.ok && j.id_token){ _tok=String(j.id_token); _tokExp=Date.now()+Math.max(60,(num(j.expires_in)||3600)-120)*1000; return _tok; }
        _tok=""; _tokExp=Date.now()+30000; return ""; /* pas admin / non configuré : cache court */
      })
      .catch(function(){ _tokPromise=null; _tok=""; _tokExp=Date.now()+30000; return ""; });
    return _tokPromise;
  }
  /* Renvoie une Promise<"?auth=<id_token>"> ou Promise<""> (jamais de rejet). */
  function _authQS(){ return _fetchAdminToken().then(function(t){ return t?("?auth="+encodeURIComponent(t)):""; }).catch(function(){ return ""; }); }
  /* Exposé pour tests + réutilisation éventuelle. */
  window.kdmcAdminAuthQS=_authQS;

  /* ── GRANT admin du domaine (preuve du code) ─────────────────────────────────
     Quand le verrou shops par rôle est posé, publier exige un id_token role:admin,
     lui-même délivré par /__admin/fbtoken DERRIÈRE le grant admin. Pour l'obtenir :
     POST /__admin/login {code} (credentials:include → cookie de grant posé). On
     invalide alors le cache de token pour forcer un re-fetch authentifié. FAIL-OPEN :
     toute erreur → false (l'écriture retombe sur une erreur honnête, jamais un faux
     succès). C'est une saisie de code UNIQUE par appareil (modèle « reconnu auto »). */
  window.kdmcAdminLogin=function(pin){
    if(!pin)return Promise.resolve(false);
    return fetch("/__admin/login",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:String(pin)})})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){ if(j&&j.grant){ _tok=null;_tokExp=0;_tokPromise=null; return true; } return false; })
      .catch(function(){ return false; });
  };
  /* Modale de saisie du code admin (vanilla DOM, sans re-render → pas de « clavier
     qui saute » iOS ; font 16px = pas de zoom ; input password numérique). */
  function _builtinPinModal(){
    return new Promise(function(res){
      var ov=document.createElement("div");
      ov.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px";
      ov.innerHTML='<div style="background:#fff;color:#111;border-radius:14px;padding:20px;max-width:320px;width:100%;font-family:system-ui,-apple-system,sans-serif"><div style="font-weight:700;margin-bottom:10px">🔐 Code admin</div><div style="font-size:13px;color:#555;margin-bottom:12px">Pour publier dans la boutique (une seule fois sur cet appareil).</div><input id="_kap_in" type="password" inputmode="numeric" autocomplete="off" style="width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid #ccc;border-radius:10px;margin-bottom:12px"><div style="display:flex;gap:8px"><button id="_kap_ok" type="button" style="flex:1;padding:12px;border:0;border-radius:10px;background:#111;color:#fff;font-size:15px">Valider</button><button id="_kap_no" type="button" style="flex:1;padding:12px;border:0;border-radius:10px;background:#eee;color:#111;font-size:15px">Annuler</button></div></div>';
      document.body.appendChild(ov);
      var inp=ov.querySelector("#_kap_in");
      try{ setTimeout(function(){try{inp.focus();}catch(_){}},50); }catch(_){}
      function done(v){ try{document.body.removeChild(ov);}catch(_){} res(v); }
      ov.querySelector("#_kap_ok").onclick=function(){ done(inp.value||null); };
      ov.querySelector("#_kap_no").onclick=function(){ done(null); };
      inp.onkeydown=function(e){ if(e.key==="Enter") done(inp.value||null); };
    });
  }
  /* Demande le code : hook du Studio > modale intégrée > prompt natif > null. */
  function _askAdminPin(){
    try{ if(typeof window.kdmcAdminPinPrompt==="function") return Promise.resolve(window.kdmcAdminPinPrompt()); }catch(_){}
    try{ if(typeof document!=="undefined" && document.body) return _builtinPinModal(); }catch(_){}
    try{ return Promise.resolve(window.prompt("Code admin pour publier :")); }catch(_){ return Promise.resolve(null); }
  }

  /* Écriture admin ROBUSTE. Attache le token ; si le verrou refuse (401/403),
     obtient le grant (saisie du code → /__admin/login) puis RÉESSAIE une fois.
     Résout UNIQUEMENT sur succès réel (r.ok) ; REJETTE sur blocage/erreur définitifs
     → le Studio affiche l'erreur honnête (le produit reste en cache local), JAMAIS
     un faux « ✅ Publié ». Aucune régression tant que le verrou n'est pas posé
     (écritures ouvertes → r.ok → résolution directe). */
  function _adminWrite(url,opts){
    return _authQS().then(function(qs){
      return fetch(url+qs,opts).then(function(r){
        if(r&&r.ok) return r;
        var st=r&&r.status;
        if(st===401||st===403){
          return _askAdminPin().then(function(pin){
            if(!pin) return Promise.reject(new Error("admin_blocked_"+st));
            return window.kdmcAdminLogin(pin).then(function(okg){
              if(!okg) return Promise.reject(new Error("admin_login_failed"));
              return _authQS().then(function(qs2){
                return fetch(url+qs2,opts).then(function(r2){ if(r2&&r2.ok) return r2; return Promise.reject(new Error("admin_blocked_"+(r2&&r2.status))); });
              });
            });
          });
        }
        return Promise.reject(new Error("write_http_"+st));
      });
    });
  }

  /* ── Commande client (checkout) — ANONYME (aucun auth, jamais verrouillé) ──── */
  window.kdmcPushOrder=function(d){
    if(!d||!d.shop||!d.orderId)return;
    var path=BASE+"/orders/"+encodeURIComponent(d.shop)+"/"+encodeURIComponent(d.orderId)+".json";
    var payload={
      orderId:safe(d.orderId,40),
      shop:safe(d.shop,40),
      total:num(d.total),
      method:safe(d.method,30),
      items_count:num(d.items_count),
      items_summary:safe(d.items_summary,200),
      coupon:safe(d.coupon,30),
      status:safe(d.status||"new",20),
      ts:Date.now(),
      ts_iso:new Date().toISOString()
    };
    try{
      fetch(FB+"/"+path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),keepalive:true}).catch(function(){});
    }catch(_){}
  };
  /* Produits publiés par l'admin (catalogue Printify → boutique), visibles par TOUS.
     Path isolé shops_admin_v1/products/<shop>/<id>. Écriture = auth admin (fail-open). */
  function ppath(shop,id){return BASE+"/products/"+encodeURIComponent(shop)+(id?"/"+encodeURIComponent(id):"")+".json";}
  window.kdmcPublishProduct=function(shop,prod){
    if(!shop||!prod||!prod.id)return Promise.reject();
    return _adminWrite(FB+"/"+ppath(shop,prod.id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(prod)});
  };
  window.kdmcDeleteProduct=function(shop,id){
    if(!shop||!id)return Promise.reject();
    return _adminWrite(FB+"/"+ppath(shop,id),{method:"DELETE"});
  };
  window.kdmcFetchProducts=function(shop,cb){
    fetch(FB+"/"+ppath(shop)).then(function(r){return r.ok?r.json():null}).then(function(j){
      var arr=[];if(j&&typeof j==="object"){Object.keys(j).forEach(function(k){if(j[k]&&typeof j[k]==="object")arr.push(j[k])})}
      try{cb(arr)}catch(_){}
    }).catch(function(){try{cb([])}catch(_){}});
  };
  /* Logos gérés par l'admin (bibliothèque de logos publiée). Path shops_admin_v1/logos/<shop>/<id>.
     Écriture = auth admin (fail-open). Lecture = publique (catalogue). */
  function lpath(shop,id){return BASE+"/logos/"+encodeURIComponent(shop)+(id?"/"+encodeURIComponent(id):"")+".json";}
  window.kdmcPublishLogo=function(shop,logo){if(!shop||!logo||!logo.id)return Promise.reject();return _adminWrite(FB+"/"+lpath(shop,logo.id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(logo)});};
  window.kdmcDeleteLogo=function(shop,id){if(!shop||!id)return Promise.reject();return _adminWrite(FB+"/"+lpath(shop,id),{method:"DELETE"});};
  window.kdmcFetchLogos=function(shop,cb){
    fetch(FB+"/"+lpath(shop)).then(function(r){return r.ok?r.json():null}).then(function(j){
      var arr=[];if(j&&typeof j==="object"){Object.keys(j).forEach(function(k){if(j[k]&&typeof j[k]==="object")arr.push(j[k])})}
      try{cb(arr)}catch(_){}
    }).catch(function(){try{cb([])}catch(_){}});
  };
})();
