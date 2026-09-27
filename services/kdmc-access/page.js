/* Page admin « Qui se connecte à mon domaine » — servie par kdmc-access GET /.
 * Autonome, mobile-first, dark. PIN admin (SHA-256) → auto-déverrouillage sur
 * appareil de confiance ensuite. Appelle GET /history (même origine). Le script
 * interne évite les template-literals pour rester dans ce backtick sans échappement. */
export const PAGE_HTML = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a0f0a">
<title>Qui se connecte — kd-mc.com</title>
<style>
  :root{--bg:#080c08;--bg2:#0f150f;--card:#121a12;--bd:#1e2c1e;--gold:#c9a227;--txt:#e7f0e0;--txt2:#9db08e;--txt3:#68785e;--on:#3ad06a;--off:#57604f}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:radial-gradient(120% 80% at 50% 0,#0e160e,var(--bg));color:var(--txt);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;padding:env(safe-area-inset-top) 0 calc(env(safe-area-inset-bottom) + 40px)}
  .wrap{max-width:760px;margin:0 auto;padding:0 14px}
  header{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,var(--bg) 70%,transparent);padding:16px 0 10px;backdrop-filter:blur(8px)}
  h1{font-size:19px;margin:0;font-weight:800;letter-spacing:-.3px}
  h1 .g{color:var(--gold)}
  .sub{color:var(--txt2);font-size:12.5px;margin-top:3px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input,button{font:inherit}
  .search{width:100%;margin:10px 0 4px;padding:11px 13px;border-radius:11px;border:1px solid var(--bd);background:var(--bg2);color:var(--txt);font-size:16px}
  .btn{padding:10px 15px;border-radius:11px;border:1px solid var(--bd);background:var(--card);color:var(--txt);font-weight:600;cursor:pointer;min-height:44px}
  .btn.p{background:linear-gradient(135deg,#d8b23a,#9a7810);border:none;color:#0a0f0a;font-weight:800}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:13px 14px;margin:10px 0}
  .pers{display:flex;align-items:center;gap:11px;cursor:pointer}
  .dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 3px rgba(0,0,0,.25)}
  .nm{font-weight:700;font-size:15.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .when{color:var(--txt3);font-size:12px;white-space:nowrap}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
  .chip{font-size:11.5px;padding:3px 9px;border-radius:20px;background:var(--bg2);border:1px solid var(--bd);color:var(--txt2)}
  .chip.app{color:#dfe9d6;border-color:#2a3d29}
  .chip.g{color:var(--gold);border-color:#3a3216}
  .tier{font-size:10.5px;padding:2px 7px;border-radius:6px;background:#1a2416;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px}
  .fold{margin-top:6px;border-top:1px solid rgba(255,255,255,.05)}
  .fold>summary{cursor:pointer;list-style:none;padding:7px 0;font-size:13px;color:var(--txt);min-height:34px;display:flex;align-items:center}
  .fold>summary::-webkit-details-marker{display:none}
  .fold>summary::before{content:'▸';margin-right:7px;color:var(--txt2)}
  .fold[open]>summary::before{content:'▾'}
  .sect{margin-top:10px;font-size:12px;color:var(--txt2);text-transform:uppercase;letter-spacing:.05em}
  .tl{margin-top:11px;border-top:1px solid var(--bd);padding-top:9px;display:none}
  .tl.open{display:block}
  .ev{display:flex;gap:9px;font-size:12.5px;padding:5px 0;color:var(--txt2);border-bottom:1px solid rgba(255,255,255,.03)}
  .ev .t{color:var(--txt3);white-space:nowrap;font-variant-numeric:tabular-nums}
  .ev .e{color:var(--txt);flex:1}
  .empty{text-align:center;color:var(--txt3);padding:50px 20px}
  .lock{max-width:340px;margin:16vh auto 0;text-align:center;padding:0 20px}
  .lock .em{font-size:44px}
  .pin{width:100%;margin-top:18px;padding:14px;border-radius:12px;border:1px solid var(--bd);background:var(--bg2);color:var(--txt);font-size:22px;text-align:center;letter-spacing:10px}
  .err{color:#e8736b;font-size:13px;margin-top:10px;min-height:18px}
  .badge{position:fixed;left:calc(env(safe-area-inset-left) + 8px);bottom:calc(env(safe-area-inset-bottom) + 8px);font-size:10px;color:var(--txt3);background:rgba(0,0,0,.5);padding:3px 7px;border-radius:6px;border:1px solid var(--bd);z-index:9}
  .ss-bots{margin-top:8px}
  /* Les passages sans nom : repliés par défaut (l'essentiel reste les personnes),
     dépliables d'un doigt — cible tactile 44px, iPhone. */
  .anon{margin-top:8px;border:1px solid var(--line);border-radius:12px;background:transparent}
  .anon summary{padding:12px 14px;min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:13.5px;color:var(--txt2);list-style:none}
  .anon summary::-webkit-details-marker{display:none}
  .anonl{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 14px}
  .ss-bots .btn{width:100%;font-size:13px;color:var(--txt2)}
  .kpi{display:flex;gap:14px;margin-top:8px}
  .kpi b{color:var(--gold)}
</style></head>
<body>
<div id="app"></div>
<div class="badge">kdmc-access v1.0</div>
<script>
(function(){
  var $=function(s,r){return (r||document).querySelector(s)};
  var app=$('#app');var KEY='kdmc_access_pinhash';var DATA=null;var CONN=null;var TIMER=null;
  /* CONN = les VRAIES connexions du domaine (source unique : KV du routeur, déjà peuplée).
     DATA = le détail des actions dans les apps. Les deux sont fusionnés par personne :
     une seule page, plus de doublon avec « Mes connexions » du portail (Kevin 2026-08-05). */
  var DOMAIN_LOG='https://kd-mc.com/__admin/domain-log';
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
  function hm(ts){var d=new Date(ts);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
  function dayKey(ts){var d=new Date(ts);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()}
  function dayLabel(ts){var k=dayKey(ts);if(k===dayKey(Date.now()))return "Aujourd'hui";if(k===dayKey(Date.now()-86400000))return 'Hier';return new Date(ts).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}
  function dur(ms){if(!ms||ms<60000)return '< 1 min';var m=Math.round(ms/60000);if(m<60)return m+' min';var h=Math.floor(m/60);return h+' h'+(m%60?' '+(m%60)+' min':'')}
  var APPNM={'kd-mc.com':'🏠 Portail','www.kd-mc.com':'🏠 Portail','cmcteams.kd-mc.com':'📅 CMCteams','apex-ai.kd-mc.com':'🤖 Apex','apex-chat.kd-mc.com':'💬 Apex Chat','coffre.kd-mc.com':'🔐 Coffre','dashboard.kd-mc.com':'📊 Dashboard','sourcing.kd-mc.com':'📦 Sourcing','beatbot.kd-mc.com':'🌊 PoolPilot','arbre.kd-mc.com':'🌳 Arbre','lingua.kd-mc.com':'🐝 Lingua','studio.kd-mc.com':'🎬 Studio','bot.kd-mc.com':'🤖 Bot','la-detente.kd-mc.com':'🛍 La Détente','chez-lolo.kd-mc.com':'🛍 Chez Lolo','departs.kd-mc.com':'🚪 Départs','autorisations.kd-mc.com':'🆔 Autorisations','cmcteams-light.kd-mc.com':'🚪 CMCteams light','cuisine.kd-mc.com':'🍳 Cuisine','cocina.kd-mc.com':'🍳 Cuisine','cujina.kd-mc.com':'🍳 Cuisine','javis.kd-mc.com':'🐝 Javis','tor.kd-mc.com':'🧅 Tor en clair','worldmonitor.kd-mc.com':'🌍 World Monitor','osint.kd-mc.com':'🔎 OSINT','ia.kd-mc.com':'🧠 IA','outils.kd-mc.com':'🧰 Outils','shops.kd-mc.com':'🛍 Boutiques','kit.kd-mc.com':'📦 Kit IA','rotaplan.kd-mc.com':'📋 Rotaplan','croupier.kd-mc.com':'🎲 Devenir croupier','dossiers.kd-mc.com':'📁 Dossiers'};
  function appNm(h){return APPNM[h]||String(h||'')}
  /* ═══ UNE PERSONNE = UNE CARTE, MÊME ÉCRITE AUTREMENT (Kevin 22.09.2026) ═══
     Sur sa capture, Kevin apparaissait DEUX FOIS : « DESARZENS K » (108 actions,
     le format SBM) et « kevin Desarzens » (393 connexions, le format du portail).
     C'est bien la même personne — mais les deux écritures ne donnent pas la même
     chaîne, donc deux cartes, et des compteurs coupés en deux.

     La règle, volontairement PRUDENTE : deux écritures ne sont réunies que si
       (1) elles ont EXACTEMENT les mêmes initiales, dans le même ordre alphabétique, ET
       (2) les mots entiers de l'une sont TOUS contenus dans l'autre.
     « DESARZENS K » {desarzens} + « KD » ⊂ « Kevin Desarzens » {kevin,desarzens} + « KD » → réunis.
     « Ronan Desarzens » → initiales « DR » ≠ « DK » → JAMAIS réuni (le nom de
     famille seul n'identifie personne — le piège déjà écrit dans nos règles).
     « Karine Desarzens » vs « Kevin Desarzens » → {karine,…} ⊄ {kevin,…} → pas réunis.

     ⚠️ LIMITE HONNÊTE : « DESARZENS K » et « Karine Desarzens » partagent initiales
     et mot entier → ils seraient réunis. C'est le défaut du format « NOM Initiale »
     lui-même. On l'assume ICI parce que ce regroupement est un AFFICHAGE : il ne
     réécrit aucune fiche et se défait en rechargeant, contrairement à la fusion du
     routeur qui, elle, est irréversible. Les écritures réunies sont AFFICHÉES sur la
     carte, pour que Kevin voie tout de suite si deux personnes ont été confondues. */
  function ident(nm){
    var t=norm(nm).split(' ').filter(Boolean);
    if(t.length<2)return null;
    return {ini:t.map(function(x){return x.charAt(0)}).sort().join(''),
            mots:t.filter(function(x){return x.length>1})};
  }
  function memePersonne(a,b){
    if(!a||!b||a.ini!==b.ini)return false;
    var inclus=function(x,y){return x.mots.every(function(m){return y.mots.indexOf(m)>=0})};
    return inclus(a,b)||inclus(b,a);
  }
  /* 👣 LES PASSAGES SANS NOM — « personne ne doit entrer sans être fiché ».
     Quelqu'un qui ouvre une app publique (cuisine, boutique, Tor…) sans se
     connecter ne peut pas être NOMMÉ — et on ne cherche pas à le nommer : on ne
     garde rien de personnel, même pas son adresse. Mais son passage ne doit plus
     être INVISIBLE, sinon la page laisse croire qu'il ne se passe rien là-bas.
     On affiche donc combien de passages, sur quelle app, sur 14 jours. */
  function anonBloc(){
    var a=(CONN&&CONN.anonymes)||{}; var ks=Object.keys(a);
    if(!ks.length)return '';
    ks.sort(function(x,y){return (a[y].total||0)-(a[x].total||0)});
    var tot=ks.reduce(function(n,k){return n+(a[k].total||0)},0);
    return '<details class="anon"><summary>👣 '+tot+' passage'+(tot>1?'s':'')+' sans nom sur 14 jours '
      +'<span class="g">(apps ouvertes à tous — on compte, on ne fiche personne)</span></summary>'
      +'<div class="anonl">'+ks.slice(0,20).map(function(k){
        return '<span class="chip">'+esc(appNm(k))+' · '+a[k].total+'</span>';
      }).join('')+'</div></details>';
  }
  /* Fusionne connexions (CONN) + actions (DATA) en UNE liste de personnes. */
  function people(){
    var map={};
    /* Annuaire des écritures déjà vues → on retombe sur la MÊME case. */
    var vus=[];
    function cle(nm,repli){
      var base=norm(nm)||repli;
      var id=ident(nm);
      if(id){
        for(var i=0;i<vus.length;i++){ if(memePersonne(id,vus[i].id)) return vus[i].k; }
        vus.push({id:id,k:base});
      }
      return base;
    }
    function slot(k,nm){if(!map[k])map[k]={key:k,name:nm||'',actions:0,recent:[],apps:{},devices:{},places:[],conns:0,hist:[],lastSeen:0,firstSeen:0,tiers:{},ecritures:[]};if(!map[k].name&&nm)map[k].name=nm;/* On GARDE chaque écriture réunie : si deux personnes venaient à être confondues, ça se voit d'un coup d'œil sur la carte au lieu de rester invisible. */if(nm&&map[k].ecritures.indexOf(nm)<0)map[k].ecritures.push(nm);return map[k]}
    ((CONN&&CONN.people)||[]).forEach(function(p){
      var m=slot(cle(p.name,p.uid),p.name);
      /* ADDITIONNER, jamais écraser : une même personne peut avoir PLUSIEURS comptes
         (uid différents pour le même nom). Vécu 2026-08-05 : Kevin affichait « 2
         connexions » au lieu de ~191 — le 2e compte écrasait le 1er (affectation simple au lieu d'un cumul).
         Idem pour l'historique (concaténé puis retrié) et le temps par app (cumulé). */
      m.conns=(m.conns||0)+(p.hits||0);
      m.hist=(m.hist||[]).concat(p.history||[]).sort(function(a,b){return (b.ts||0)-(a.ts||0)}).slice(0,120);
      (p.places||[]).forEach(function(pl){if(m.places.indexOf(pl)<0)m.places.push(pl)});
      m.lastSeen=Math.max(m.lastSeen,p.lastSeen||0);
      m.uids=(m.uids||[]).concat([p.uid]);
      /* Renseignements fins : on garde ceux du compte vu le PLUS RÉCEMMENT. */
      if((p.lastSeen||0)>=(m._detTs||0)){
        m._detTs=p.lastSeen||0;
        m.dev=p.device||m.dev||'';m.isp=p.isp||m.isp||'';m.vpn=!!p.vpn;m.tz=p.tz||m.tz||'';
        m.geo=p.geo||m.geo||null;m.place=p.place||m.place||'';m.lastApp=p.lastApp||m.lastApp||'';
      }
      /* Renseignements réseau / entrée / rythme. */
      m.lang=p.lang||m.lang||'';m.net=p.net||m.net||null;m.from=p.from||m.from||'';
      m.path=p.path||m.path||'';m.passkey=m.passkey||!!p.passkey;
      m.aliases=(m.aliases||[]).concat(p.aliases||[]);
      m.hours=m.hours||{};Object.keys(p.hours||{}).forEach(function(h){m.hours[h]=(m.hours[h]||0)+(p.hours[h]||0)});
      if(p.created&&(!m.created||p.created<m.created))m.created=p.created; /* la 1re fois = la PLUS ANCIENNE */
      if(p.anomaly)m.anomaly=p.anomaly;
      /* Temps réellement passé, cumulé par app sur TOUS les comptes de la personne. */
      m.appStats=m.appStats||{};m.totalMs=m.totalMs||0;
      Object.keys(p.apps||{}).forEach(function(a){
        var s=p.apps[a]||{},t=m.appStats[a]||{sessions:0,ms:0,last:0};
        t.sessions=(t.sessions||0)+(s.sessions||0);t.ms=(t.ms||0)+(s.ms||0);t.last=Math.max(t.last||0,s.last||0);
        m.appStats[a]=t;m.apps[a]=1;m.totalMs+=(s.ms||0);
      });
      (p.devices||[]).forEach(function(d){m.devices[d]=1});
    });
    ((DATA&&DATA.people)||[]).forEach(function(p){
      var m=slot(cle(p.name,p.key),p.name);
      m.actions=p.count||0;m.recent=p.recent||[];m.tiers=p.tiers||m.tiers;
      /* PROGRESSION : dernier état envoyé par chaque app (Lingua : XP/série/mots…).
         Générique — toute app qui envoie event:"progression" + meta apparaît ici,
         sans rien changer à cette page. */
      (p.recent||[]).forEach(function(e){
        if(e.meta&&e.meta.appareil&&(!m._uaTs||e.ts>m._uaTs)){m._uaTs=e.ts;m.ua=e.meta.appareil}
        if(e.event!=='progression'||!e.meta)return;
        m.prog=m.prog||{};
        if(!m.prog[e.app]||m.prog[e.app].ts<e.ts)m.prog[e.app]={ts:e.ts,meta:e.meta};
      });
      m.lastSeen=Math.max(m.lastSeen,p.lastSeen||0);
      m.firstSeen=m.firstSeen?Math.min(m.firstSeen,p.firstSeen||0):(p.firstSeen||0);
      (p.appsList||[]).forEach(function(a){m.apps[a]=1});(p.devicesList||[]).forEach(function(d){m.devices[d]=1});
    });
    return Object.keys(map).map(function(k){return map[k]}).sort(function(a,b){return (b.lastSeen||0)-(a.lastSeen||0)});
  }
  /* ROBOTS & TESTS ≠ PERSONNES. Les smoke-tests CI (runners GitHub, souvent aux USA)
     et mes évènements de vérification créent de vraies fiches : sans les séparer, ils
     ÉCRASENT la lecture (vécu : « 187 connexions » dont 167 d'un robot, et les vraies
     personnes noyées). On les masque par défaut, sans les supprimer — un clic les montre. */
  function isBot(p){
    var n=norm(p.name||''), u=(p.uids||[]).join(' ')+' '+(p.key||'');
    return !!(/^(ci |ci$|smoke|test|bot|verification|verif|monitor|uptime|healthcheck|playwright|headless)/.test(n)
      || /\b(smoke|healthcheck|uptime)\b/.test(n)
      || /__verif__|^ci_|_ci$|\bci\b/.test(u)
      || (p.tiers&&p.tiers.test));
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  async function sha(t){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}
  function ago(ts){if(!ts)return '';var s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'à l\\'instant';var m=Math.floor(s/60);if(m<60)return 'il y a '+m+' min';var h=Math.floor(m/60);if(h<24)return 'il y a '+h+' h';var d=Math.floor(h/24);return 'il y a '+d+' j'}
  function dt(ts){var d=new Date(ts);return d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}

  function renderLock(msg){
    app.innerHTML='<div class="lock"><div class="em">🔐</div>'
      +'<h1 style="margin-top:12px">Qui se connecte <span class="g">·</span> admin</h1>'
      +'<div class="sub">Réservé à Kevin. Entre ton code admin.</div>'
      +'<input class="pin" id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••••">'
      +'<div class="err" id="err">'+(msg||'')+'</div>'
      +'<button class="btn p" id="go" style="width:100%">Déverrouiller</button>'
      +'<label style="display:block;margin-top:14px;color:var(--txt3);font-size:12.5px"><input type="checkbox" id="rem" checked style="width:18px;height:18px;vertical-align:-3px"> Se souvenir de cet appareil</label></div>';
    var pin=$('#pin');pin.focus();
    var go=function(){submitPin(pin.value.trim(),$('#rem').checked)};
    $('#go').onclick=go;pin.onkeydown=function(e){if(e.key==='Enter')go()};
  }
  async function submitPin(v,remember){
    if(!v){return}
    var h=await sha(v);
    var ok=await load(h);
    if(ok&&remember){try{localStorage.setItem(KEY,h)}catch(e){}}
    else if(!ok){try{localStorage.removeItem(KEY)}catch(e){}}
  }
  async function load(hash){
    try{
      var tk='';try{tk=localStorage.getItem('kdmc_sso_token')||''}catch(e){}   /* (27.09) app installée : le pass du domaine vaut le code */
      var r=await fetch('/history',{headers:hash?{'x-apex-pin':hash}:(tk?{'Authorization':'Bearer '+tk}:{}),credentials:'include'});
      if(r.status===401){if(hash)renderLock('Code incorrect.');return false}   /* sans code = simple essai de session : silencieux */
      if(!r.ok){renderLock('Souci serveur ('+r.status+'), réessaie.');return false}
      DATA=await r.json();window._pinhash=hash;await loadConn(hash);renderMain();startAuto();return true;
    }catch(e){renderLock('Réseau indisponible, réessaie.');return false}
  }
  /* Vraies connexions du domaine — fail-open : si indisponible, on affiche quand même
     les actions (ne JAMAIS montrer une page vide à cause d'une source secondaire). */
  async function loadConn(hash){
    try{var r=await fetch(DOMAIN_LOG,{headers:hash?{'x-apex-pin':hash}:{},credentials:'include'});if(r.ok)CONN=await r.json()}catch(e){}
  }
  function startAuto(){if(TIMER)clearInterval(TIMER);TIMER=setInterval(function(){if(window._pinhash&&document.visibilityState==='visible')refresh()},30000)}
  async function refresh(){try{var r=await fetch('/history',{headers:window._pinhash?{'x-apex-pin':window._pinhash}:{},credentials:'include'});if(r.ok)DATA=await r.json();await loadConn(window._pinhash);renderMain(true)}catch(e){}}

  var Q='';var OPEN={};
  /* Robots masqués par défaut (choix mémorisé sur l'appareil). */
  var SHOWBOTS=false;try{SHOWBOTS=localStorage.getItem('kdmc_access_bots')==='1'}catch(e){}
  function renderMain(keepScroll){
    var y=keepScroll?window.scrollY:0;
    var all=people();
    /* Vraies personnes d'un côté, robots/tests de l'autre — les compteurs ne
       comptent QUE les personnes (sinon un robot à 167 connexions fausse tout). */
    var bots=all.filter(isBot), list=SHOWBOTS?all:all.filter(function(p){return !isBot(p)});
    var humans=all.filter(function(p){return !isBot(p)});
    var ONLINE_MS=5*60*1000;
    var online=humans.filter(function(p){return Date.now()-(p.lastSeen||0)<ONLINE_MS}).length;
    var totalConns=humans.reduce(function(a,p){return a+(p.conns||0)},0);
    var totalActs=humans.reduce(function(a,p){return a+(p.actions||0)},0);
    var q=Q.toLowerCase();
    var shown=q?list.filter(function(p){return (p.name||'').toLowerCase().indexOf(q)>=0||Object.keys(p.apps||{}).join(' ').toLowerCase().indexOf(q)>=0}):list;
    var h='<header><div class="wrap"><div class="row"><div style="flex:1"><h1>Qui se connecte <span class="g">·</span> mon domaine</h1>'
      +'<div class="kpi"><span><b>'+humans.length+'</b> personnes</span><span><b>'+online+'</b> en ligne</span><span><b>'+totalConns+'</b> connexions</span><span><b>'+totalActs+'</b> actions</span></div></div>'
      +'<button class="btn" id="rf">↻</button></div>'
      +'<input class="search" id="q" placeholder="🔎 Rechercher une personne, une app…" value="'+esc(Q)+'">'
      +(bots.length?'<div class="ss-bots"><button class="btn" id="tb" type="button">'+(SHOWBOTS?'🙈 Masquer':'🤖 Voir')+' les robots &amp; tests ('+bots.length+')</button></div>':'')
      +anonBloc()
      +'</div></header><div class="wrap" id="list">';
    if(!shown.length){h+='<div class="empty">📭 '+(q?'Aucun résultat.':'Aucune connexion enregistrée pour le moment.')+'</div>'}
    shown.forEach(function(p){
      var isOn=Date.now()-(p.lastSeen||0)<ONLINE_MS;
      var dev=Object.keys(p.devices||{}).map(function(d){return '<span class="chip">'+esc(d)+'</span>'}).join('');
      var apps=Object.keys(p.apps||{}).map(function(a){return '<span class="chip app">'+esc(appNm(a))+'</span>'}).join('');
      var tiers=Object.keys(p.tiers||{}).map(function(t){return '<span class="tier">'+esc(t)+'</span>'}).join(' ');
      var opened=OPEN[p.key];
      /* Connexions groupées PAR JOUR (comme « Mes connexions » du portail, désormais ici). */
      var byDay={},order=[];
      (p.hist||[]).forEach(function(e){var k=dayKey(e.ts);if(!byDay[k]){byDay[k]={ts:e.ts,items:[]};order.push(byDay[k])}byDay[k].items.push(e)});
      var folders=order.map(function(g,i){
        var rows=g.items.map(function(e){
        /* Chaque connexion porte SON contexte : appareil exact, opérateur, VPN, lieu. */
        var det=[appNm(e.app),'⏱ '+dur((e.end||e.ts)-e.ts)];
        if(e.dev)det.push(e.dev);
        if(e.place)det.push('📍 '+e.place);
        if(e.isp)det.push((e.vpn?'🕵️ ':'📶 ')+e.isp);
        var map=(e.lat&&e.lon)?' <a href="https://www.openstreetmap.org/?mlat='+encodeURIComponent(e.lat)+'&mlon='+encodeURIComponent(e.lon)+'#map=12/'+encodeURIComponent(e.lat)+'/'+encodeURIComponent(e.lon)+'" target="_blank" rel="noopener">🗺</a>':'';
        return '<div class="ev"><span class="t">'+esc(hm(e.ts))+'</span><span class="e">'+esc(det.join(' · '))+map+'</span></div>';
      }).join('');
        return '<details class="fold"'+(i===0?' open':'')+'><summary>📅 '+esc(dayLabel(g.ts))+' · '+g.items.length+' connexion'+(g.items.length>1?'s':'')+'</summary>'+rows+'</details>';
      }).join('');
      /* Détail « travail » : par app, nb de sessions + temps passé + dernière fois. */
      var appsDetail=Object.keys(p.appStats||{}).sort(function(a,b){return ((p.appStats[b]&&p.appStats[b].ms)||0)-((p.appStats[a]&&p.appStats[a].ms)||0)}).map(function(a){
        var s=p.appStats[a]||{};
        return '<div class="ev"><span class="t">'+esc(appNm(a))+'</span><span class="e">'+(s.sessions||0)+' session'+((s.sessions||0)>1?'s':'')+(s.ms?' · ⏱ '+esc(dur(s.ms)):'')+(s.last?' · dernière '+ago(s.last):'')+'</span></div>';
      }).join('');
      /* ANALYSES CALCULÉES (aucune donnée supplémentaire à collecter — tout se déduit
         de l'historique déjà là) : durée moyenne, app préférée, assiduité, heure de
         prédilection. C'est ce qui transforme une liste en renseignement. */
      var infos=[];
      var nS=0,sumS=0;(p.hist||[]).forEach(function(e){var d=(e.end||e.ts)-e.ts;if(d>0){nS++;sumS+=d}});
      if(nS)infos.push('⏱ Session moyenne ' + dur(Math.round(sumS/nS)));
      var best='',bestMs=0;Object.keys(p.appStats||{}).forEach(function(a){var ms=(p.appStats[a]||{}).ms||0;if(ms>bestMs){bestMs=ms;best=a}});
      if(best)infos.push('❤️ App préférée ' + appNm(best));
      var jours={};(p.hist||[]).forEach(function(e){jours[dayKey(e.ts)]=1});
      var nj=Object.keys(jours).length;if(nj)infos.push('📆 ' + nj + ' jour' + (nj>1?'s':'') + ' actif' + (nj>1?'s':''));
      var hs=p.hours||{},hb='',hbn=0;Object.keys(hs).forEach(function(h){if(hs[h]>hbn){hbn=hs[h];hb=h}});
      if(hb!=='')infos.push('🕓 Surtout vers ' + hb + 'h');
      if(p.lang)infos.push('🗣 ' + p.lang);
      if(p.from)infos.push('↩️ Arrivé depuis ' + appNm(p.from));
      if(p.passkey)infos.push('🔐 Face ID activé');
      /* Les écritures réunies sous cette carte. Affichées dès qu'il y en a plus
         d'une : c'est le contrôle visuel qui permet de repérer, en un coup d'œil,
         deux personnes qui auraient été confondues par le format « NOM Initiale ». */
      if((p.ecritures||[]).length>1)infos.push('🪪 aussi écrit : '+p.ecritures.slice(1).map(esc).join(' · '));
      if(p.aliases&&p.aliases.length)infos.push('🔗 ' + p.aliases.length + ' ancien' + (p.aliases.length>1?'s':'') + ' identifiant' + (p.aliases.length>1?'s':'') + ' rattaché' + (p.aliases.length>1?'s':''));
      var ua=p.ua||null;
      if(ua){
        if(ua.ecran)infos.push('🖥 Écran ' + ua.ecran + (ua.dpr?' @'+ua.dpr+'x':''));
        if(ua.pwa!==undefined)infos.push(ua.pwa?'📲 App installée':'🌐 Dans le navigateur');
        if(ua.coeurs)infos.push('⚙️ ' + ua.coeurs + ' cœurs');
        if(ua.fuseau)infos.push('🕓 ' + ua.fuseau);
        if(ua.reseau)infos.push('📶 ' + ua.reseau);
        if(ua.sombre!==undefined)infos.push(ua.sombre?'🌙 Thème sombre':'☀️ Thème clair');
      }
      var n2=p.net||null;
      if(n2){
        if(n2.colo)infos.push('🌍 Via ' + n2.colo + (n2.continent?' ('+n2.continent+')':''));
        if(n2.asn)infos.push('🛰 Réseau AS' + n2.asn);
        if(n2.http||n2.tls)infos.push('🔒 ' + [n2.http,n2.tls].filter(Boolean).join(' · '));
      }
      var infoDetail=infos.length?'<div class="ev"><span class="e">'+infos.map(esc).join(' · ')+'</span></div>':'';
      /* Progression, lisible : « XP 1240 · série 12 j · mots 340 · aujourd'hui 3 leçons ».
         Rendu générique (parcourt le meta) → marche pour Lingua et toute app future. */
      var LBL={xp:'⭐ XP',serie:'🔥 Série',gemmes:'💎 Gemmes',mots:'📚 Mots',cours:'🎓 Cours',niveau:'📈 Niveau',lecons:'Leçons',parfaits:'Parfaits',aujourdhui:"Aujourd'hui"};
      function flat(o,pre){var out=[];Object.keys(o||{}).forEach(function(k){var v=o[k];
        if(v&&typeof v==='object'){out=out.concat(flat(v,(LBL[k]||k)+' '))}
        else if(v!==''&&v!==null&&v!==undefined){out.push((pre||'')+(LBL[k]||k)+' '+v)}});return out}
      var progDetail=Object.keys(p.prog||{}).map(function(a){
        var pr=p.prog[a];
        return '<div class="ev"><span class="t">'+esc(appNm(a))+'</span><span class="e">'+esc(flat(pr.meta).join(' · '))+' <span class="g">· '+ago(pr.ts)+'</span></span></div>';
      }).join('');
      var acts=(p.recent||[]).map(function(e){return '<div class="ev"><span class="t">'+dt(e.ts)+'</span><span class="e">'+esc(e.event||'')+(e.app?' · '+esc(appNm(e.app)):'')+(e.device?' · '+esc(e.device):'')+'</span></div>'}).join('');
      h+='<div class="card"><div class="pers" data-k="'+esc(p.key)+'">'
        +'<span class="dot" style="background:'+(isOn?'var(--on)':'var(--off)')+'"></span>'
        +'<span class="nm">'+esc(p.name||'—')+' '+tiers+'</span>'
        +'<span class="when">'+ago(p.lastSeen)+'</span></div>'
        +'<div class="chips">'
        +(p.dev?'<span class="chip">📱 '+esc(p.dev)+'</span>':dev)
        +(p.place?'<span class="chip">📍 '+esc(p.place)+'</span>':((p.places&&p.places.length)?'<span class="chip">📍 '+esc(p.places[0])+'</span>':''))
        +(p.isp?'<span class="chip">'+(p.vpn?'🕵️ ':'📶 ')+esc(p.isp)+'</span>':'')
        +(p.vpn?'<span class="chip" style="border-color:var(--off)">VPN / serveur</span>':'')
        +(p.tz?'<span class="chip">🕓 '+esc(p.tz)+'</span>':'')
        +(p.conns?'<span class="chip g">'+p.conns+' connexions</span>':'')
        +(p.totalMs?'<span class="chip g">⏱ '+esc(dur(p.totalMs))+' au total</span>':'')
        +(p.actions?'<span class="chip g">'+p.actions+' actions</span>':'')
        +(p.created?'<span class="chip">1re fois '+dt(p.created)+'</span>':'')
        +'</div>'
        +(p.anomaly?'<div class="ev" style="color:var(--off)">⚠️ Déplacement impossible : '+esc(p.anomaly.from)+' → '+esc(p.anomaly.to)+' en '+esc(String(p.anomaly.mins))+' min (compte partagé ou VPN ?)</div>':'')
        +'<div class="tl'+(opened?' open':'')+'" data-tl="'+esc(p.key)+'">'
        +(infoDetail?'<div class="sect">Renseignements</div>'+infoDetail:'')
        +(progDetail?'<div class="sect">Progression</div>'+progDetail:'')
        +(appsDetail?'<div class="sect">Temps par app</div>'+appsDetail:'')
        +(folders?'<div class="sect">Connexions</div>'+folders:'')
        +(acts?'<div class="sect">Actions dans les apps</div>'+acts:'')
        +((!folders&&!acts)?'<div class="ev">—</div>':'')
        +'</div></div>';
    });
    h+='</div>';
    app.innerHTML=h;
    if(keepScroll)window.scrollTo(0,y);
    var qi=$('#q');qi.oninput=function(){Q=qi.value;var pos=qi.selectionStart;renderMain(true);var n=$('#q');n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}};
    $('#rf').onclick=refresh;
    var tb=$('#tb');if(tb)tb.onclick=function(){SHOWBOTS=!SHOWBOTS;try{localStorage.setItem('kdmc_access_bots',SHOWBOTS?'1':'0')}catch(e){}renderMain(true)};
    Array.prototype.forEach.call(document.querySelectorAll('.pers'),function(el){el.onclick=function(){var k=el.getAttribute('data-k');OPEN[k]=!OPEN[k];var t=document.querySelector('[data-tl="'+CSS.escape(k)+'"]');if(t)t.classList.toggle('open',OPEN[k])}});
  }

  // Auto-déverrouillage si appareil de confiance (rule : reconnu auto après 1re connexion)
  var saved=null;try{saved=localStorage.getItem(KEY)}catch(e){}
  /* (27.09.2026) D'abord la session du domaine (Kevin déjà reconnu, Face ID ou code admin prouvé) :
     aucun code à retaper. Sinon le code mémorisé sur cet appareil, sinon la porte. */
  load('').then(function(ok){ if(ok)return; if(saved){load(saved).then(function(ok2){if(!ok2)renderLock('')})}else{renderLock('')} })
})();
</script>
</body></html>`;
