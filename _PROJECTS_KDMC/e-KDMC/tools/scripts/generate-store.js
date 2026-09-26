const fs=require('fs'),path=require('path');
const slug=process.argv[2];if(!slug){console.error("Usage: node generate-store.js <store-slug>");process.exit(1);}
const dataFile=path.join(__dirname,'../../stores',slug,'products.json');
const data=JSON.parse(fs.readFileSync(dataFile,'utf8'));
const T=data.theme;const isLight=T.bg.startsWith('#f');
const textMuted=isLight?'#666':'#888';const border=isLight?'#e0e0e0':'#333';const bgHover=isLight?'#f0f0f0':'#252525';
const html=`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${data.name} | KDMC Boutique</title>
<meta name="description" content="${data.name} — Boutique en ligne professionnelle KDMC. Découvrez nos ${data.products.length}+ produits de qualité.">
<meta name="theme-color" content="${T.primary}">
<link rel="manifest" href="manifest.json">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;background:${T.bg};color:${T.text};min-height:100vh}
a{color:inherit;text-decoration:none}button{cursor:pointer;border:none;background:none;font:inherit}
input,textarea,select{font:inherit}img{max-width:100%;height:auto}
:root{--p:${T.primary};--bg:${T.bg};--card:${T.card};--text:${T.text};--muted:${textMuted};--border:${border};--hover:${bgHover};--r:12px;--rs:8px;--shadow:0 4px 20px rgba(0,0,0,${isLight?'0.08':'0.3'})}
/* HEADER */
.hdr{position:sticky;top:0;z-index:100;background:${T.card};border-bottom:1px solid var(--border);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.hdr-inner{max-width:1280px;margin:0 auto;padding:0 16px;height:64px;display:flex;align-items:center;gap:16px}
.logo{font-size:20px;font-weight:800;color:var(--p);cursor:pointer;white-space:nowrap}
.logo span{font-size:14px;color:var(--muted);font-weight:400;margin-left:4px}
.search-box{flex:1;max-width:400px;position:relative}
.search-box input{width:100%;padding:10px 16px 10px 36px;border-radius:100px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:14px}
.search-box input:focus{outline:none;border-color:var(--p)}
.search-box::before{content:"🔍";position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px}
.nav-actions{display:flex;gap:8px;align-items:center}
.cart-btn{position:relative;font-size:22px;padding:8px;cursor:pointer;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.cart-badge{position:absolute;top:2px;right:2px;background:var(--p);color:${isLight?'#fff':'#000'};font-size:10px;font-weight:800;min-width:18px;height:18px;border-radius:100px;display:none;align-items:center;justify-content:center;padding:0 4px}
/* NAV */
.nav{display:flex;gap:4px;overflow-x:auto;padding:8px 16px;max-width:1280px;margin:0 auto;-webkit-overflow-scrolling:touch}
.nav::-webkit-scrollbar{display:none}
.nav-item{padding:8px 16px;border-radius:100px;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;transition:all .25s;border:1px solid var(--border);color:var(--muted)}
.nav-item:hover,.nav-item.active{background:var(--p);color:${isLight?'#fff':'#000'};border-color:var(--p)}
/* HERO */
.hero{background:linear-gradient(135deg,${T.primary}22,${T.card});padding:48px 16px;text-align:center}
.hero h1{font-size:clamp(28px,5vw,48px);font-weight:800;margin-bottom:8px}
.hero h1 em{color:var(--p);font-style:normal}
.hero p{font-size:16px;color:var(--muted);max-width:600px;margin:0 auto 24px}
.hero-stats{display:flex;justify-content:center;gap:32px;flex-wrap:wrap}
.hero-stat{text-align:center}.hero-stat strong{font-size:24px;color:var(--p);display:block}.hero-stat span{font-size:12px;color:var(--muted)}
/* SECTIONS */
.section{max-width:1280px;margin:0 auto;padding:32px 16px}
.section-title{font-size:22px;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:8px}
/* GRID */
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
/* CARD */
.card{background:var(--card);border-radius:var(--r);border:1px solid var(--border);overflow:hidden;transition:all .25s;cursor:pointer;position:relative}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow);border-color:var(--p)}
.card-img{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:56px;background:var(--bg);position:relative}
.card-badge{position:absolute;top:8px;left:8px;padding:4px 10px;border-radius:100px;font-size:11px;font-weight:700}
.badge-sale{background:#ef4444;color:#fff}.badge-new{background:#22c55e;color:#fff}.badge-hot{background:#f97316;color:#fff}
.card-body{padding:14px}
.card-title{font-size:14px;font-weight:600;line-height:1.3;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-meta{font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;align-items:center;gap:6px}
.stars{color:${T.primary}}
.card-price{display:flex;align-items:baseline;gap:6px}
.price-now{font-size:17px;font-weight:700;color:var(--p)}
.price-was{font-size:12px;color:var(--muted);text-decoration:line-through}
.price-off{font-size:11px;font-weight:700;color:#ef4444;background:rgba(239,68,68,.1);padding:2px 6px;border-radius:4px}
.card-cta{width:100%;padding:10px;background:var(--p);color:${isLight?'#fff':'#000'};font-weight:700;font-size:13px;border:none;cursor:pointer;transition:opacity .2s;margin-top:10px;border-radius:var(--rs)}
.card-cta:hover{opacity:.85}
/* PRODUCT DETAIL */
.pdp{max-width:900px;margin:0 auto;padding:24px 16px}
.pdp-back{font-size:14px;color:var(--muted);margin-bottom:16px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.pdp-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.pdp-img{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:120px;background:var(--bg);border-radius:var(--r)}
.pdp-info h1{font-size:24px;font-weight:700;margin-bottom:8px}
.pdp-info .meta{color:var(--muted);font-size:14px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.pdp-price{font-size:28px;font-weight:800;color:var(--p);margin-bottom:4px}
.pdp-orig{font-size:16px;color:var(--muted);text-decoration:line-through;margin-left:8px}
.pdp-desc{font-size:15px;line-height:1.7;color:var(--muted);margin:16px 0}
.pdp-features{margin:16px 0}
.pdp-features li{padding:6px 0;font-size:14px;display:flex;align-items:center;gap:8px}
.pdp-features li::before{content:"✓";color:var(--p);font-weight:700}
.btn-add{width:100%;padding:16px;background:var(--p);color:${isLight?'#fff':'#000'};font-size:16px;font-weight:700;border:none;border-radius:var(--rs);cursor:pointer;transition:all .2s;margin-top:16px}
.btn-add:hover{opacity:.9;transform:translateY(-1px)}
/* CART */
.cart-overlay{position:fixed;top:0;right:-420px;width:400px;max-width:100vw;height:100vh;background:var(--card);z-index:200;transition:right .3s;box-shadow:-4px 0 20px rgba(0,0,0,.2);display:flex;flex-direction:column}
.cart-overlay.open{right:0}
.cart-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:199;display:none}
.cart-backdrop.open{display:block}
.cart-header{padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.cart-header h2{font-size:18px;font-weight:700}
.cart-close{font-size:24px;cursor:pointer;padding:8px}
.cart-items{flex:1;overflow-y:auto;padding:16px}
.cart-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
.cart-item-img{width:60px;height:60px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0}
.cart-item-info{flex:1}
.cart-item-name{font-size:14px;font-weight:600}
.cart-item-price{font-size:15px;font-weight:700;color:var(--p);margin-top:4px}
.cart-item-qty{display:flex;align-items:center;gap:8px;margin-top:6px}
.cart-item-qty button{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;background:var(--bg)}
.cart-item-rm{font-size:12px;color:#ef4444;cursor:pointer;margin-top:4px}
.cart-footer{padding:16px;border-top:1px solid var(--border)}
.cart-total{display:flex;justify-content:space-between;font-size:18px;font-weight:700;margin-bottom:12px}
.cart-total .amount{color:var(--p)}
.btn-checkout{width:100%;padding:14px;background:var(--p);color:${isLight?'#fff':'#000'};font-size:15px;font-weight:700;border:none;border-radius:var(--rs);cursor:pointer}
.cart-empty{text-align:center;padding:48px 16px;color:var(--muted)}
.cart-empty span{font-size:48px;display:block;margin-bottom:16px}
/* FOOTER */
.footer{background:var(--card);border-top:1px solid var(--border);padding:32px 16px;margin-top:48px}
.footer-inner{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px}
.footer h4{font-size:14px;font-weight:700;margin-bottom:12px;color:var(--p)}
.footer a{display:block;font-size:13px;color:var(--muted);padding:4px 0;transition:color .2s}
.footer a:hover{color:var(--p)}
.footer-bottom{text-align:center;padding-top:24px;margin-top:24px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
/* TRUST */
.trust{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;padding:24px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:32px 0}
.trust-item{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.trust-icon{font-size:18px}
/* TOAST */
.toast{position:fixed;bottom:-80px;left:50%;transform:translateX(-50%);z-index:10000;padding:12px 24px;border-radius:var(--r);background:var(--card);color:var(--text);box-shadow:var(--shadow);display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;transition:bottom .3s;border:1px solid var(--border)}
.toast.show{bottom:24px}
/* COOKIE */
.cookie{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:var(--card);border-top:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;box-shadow:0 -2px 10px rgba(0,0,0,.1);font-size:13px;color:var(--muted)}
.cookie a{color:var(--p);text-decoration:underline}
.cookie-btns{display:flex;gap:8px}
.cookie-btns button{padding:8px 18px;border-radius:var(--rs);font-size:13px;font-weight:600;min-height:36px}
.btn-accept{background:var(--p);color:${isLight?'#fff':'#000'}}
.btn-refuse{border:1px solid var(--border);color:var(--muted)}
/* BTT */
.btt{position:fixed;bottom:24px;right:24px;width:44px;height:44px;border-radius:50%;background:var(--p);color:${isLight?'#fff':'#000'};display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:var(--shadow);z-index:998;opacity:0;pointer-events:none;transition:all .25s;cursor:pointer}
.btt.show{opacity:1;pointer-events:auto}
/* RESPONSIVE */
@media(max-width:768px){
.pdp-grid{grid-template-columns:1fr}.search-box{max-width:none;order:3;width:100%}
.hdr-inner{flex-wrap:wrap;height:auto;padding:10px 16px}.grid{grid-template-columns:repeat(2,1fr);gap:10px}
.card-img{font-size:40px}.card-body{padding:10px}.card-title{font-size:13px}.price-now{font-size:15px}
.hero{padding:32px 16px}.hero h1{font-size:24px}.footer-inner{grid-template-columns:1fr 1fr}
}
@media(max-width:375px){.grid{gap:8px}.card-body{padding:8px}.nav-item{padding:6px 12px;font-size:12px}}
</style>
</head>
<body>
<div id="app"></div>
<div class="cart-backdrop" id="cartBg" onclick="toggleCart()"></div>
<div class="cart-overlay" id="cartPanel">
<div class="cart-header"><h2>🛒 Panier</h2><span class="cart-close" onclick="toggleCart()">✕</span></div>
<div class="cart-items" id="cartItems"></div>
<div class="cart-footer" id="cartFooter"></div>
</div>
<div class="toast" id="toast"></div>
<div class="btt" id="btt" onclick="scrollTo({top:0,behavior:'smooth'})">↑</div>
<script>
var STORE_ID="${slug}";
var STORE_NAME="${data.name}";
var CATS=${JSON.stringify(data.categories)};
var P=${JSON.stringify(data.products)};
var S={view:"home",vp:null,cart:[],search:"",cat:"all",sort:"popular",page:1,pp:12};
function esc(s){return s==null?"":String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function toast(m,t){var e=document.getElementById("toast");e.innerHTML=(t==="error"?"❌":"✅")+" "+esc(m);e.className="toast show";clearTimeout(toast._t);toast._t=setTimeout(function(){e.className="toast"},3e3)}
function sv(v,p){S.view=v;S.vp=p;S.page=1;dc();scrollTo({top:0,behavior:"smooth"})}
function dc(){var a=document.getElementById("app");if(!a)return;a.innerHTML=hdr()+({home:vHome,products:vProducts,product:vProduct,cart:vCartPage,about:vAbout,contact:vContact}[S.view]||vHome)()+footer();cartBadge();
document.querySelectorAll(".nav-item").forEach(function(el){el.classList.toggle("active",el.dataset.cat===(S.cat||"all"))});
if(S.view==="home"||S.view==="products"){document.querySelectorAll(".card").forEach(function(c,i){c.style.animationDelay=i*30+"ms"})}}
function hdr(){return '<div class="hdr"><div class="hdr-inner">'
+'<div class="logo" onclick="sv(\\'home\\')">'+esc(STORE_NAME)+'<span>KDMC</span></div>'
+'<div class="search-box"><input type="text" placeholder="Rechercher..." value="'+esc(S.search)+'" oninput="S.search=this.value;S.page=1;dc();this.focus()" id="searchIn"></div>'
+'<div class="nav-actions"><div class="cart-btn" onclick="toggleCart()">🛒<span class="cart-badge" id="cart-badge">0</span></div></div>'
+'</div></div>'
+'<div class="nav"><div class="nav-item'+(S.cat==='all'?' active':'')+'" data-cat="all" onclick="S.cat=\\'all\\';S.page=1;sv(\\'products\\')">Tous</div>'
+CATS.map(function(c){return '<div class="nav-item" data-cat="'+c.id+'" onclick="S.cat=\\''+c.id+'\\';S.page=1;sv(\\'products\\')">'+c.icon+" "+esc(c.name)+"</div>"}).join("")
+"</div>"}
function footer(){return '<div class="footer"><div class="footer-inner">'
+'<div><h4>'+esc(STORE_NAME)+'</h4><a href="#" onclick="sv(\\'about\\');return false">À propos</a><a href="#" onclick="sv(\\'contact\\');return false">Contact</a><a href="#">Livraison</a><a href="#">CGV</a></div>'
+'<div><h4>Catégories</h4>'+CATS.slice(0,5).map(function(c){return '<a href="#" onclick="S.cat=\\''+c.id+'\\';sv(\\'products\\');return false">'+c.icon+" "+esc(c.name)+"</a>"}).join("")+'</div>'
+'<div><h4>Aide</h4><a href="#">FAQ</a><a href="#">Retours</a><a href="#">Paiement sécurisé</a><a href="#">Confidentialité</a></div>'
+'<div><h4>Newsletter</h4><p style="font-size:13px;color:var(--muted);margin-bottom:8px">Recevez nos offres exclusives</p>'
+'<div style="display:flex;gap:8px"><input type="email" placeholder="votre@email.com" style="flex:1;padding:10px;border-radius:var(--rs);border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px" id="nlEmail">'
+'<button onclick="nlSub()" style="padding:10px 16px;background:var(--p);color:${isLight?"#fff":"#000"};border-radius:var(--rs);font-weight:700;font-size:13px">OK</button></div></div>'
+'</div><div class="footer-bottom">© 2026 '+esc(STORE_NAME)+' — KDMC. Tous droits réservés. Paiement sécurisé par Stripe 🔒</div></div>'}
function stars(r){var f=Math.floor(r),h=r%1>=.3,s="";for(var i=0;i<f;i++)s+="★";if(h)s+="½";for(var j=f+(h?1:0);j<5;j++)s+="☆";return '<span class="stars" title="'+r+'/5">'+s+"</span>"}
function fmtP(p){return p.toFixed(2).replace(".",",")+" €"}
function disc(o,c){return o>c?Math.round((1-c/o)*100):0}
function filtered(){var r=P.slice();if(S.cat&&S.cat!=="all")r=r.filter(function(p){return p.cat===S.cat});
if(S.search.length>1){var q=S.search.toLowerCase();r=r.filter(function(p){return p.name.toLowerCase().indexOf(q)!==-1||p.desc.toLowerCase().indexOf(q)!==-1||(p.tags||[]).join(" ").toLowerCase().indexOf(q)!==-1})}
switch(S.sort){case"price-asc":r.sort(function(a,b){return a.price-b.price});break;case"price-desc":r.sort(function(a,b){return b.price-a.price});break;case"rating":r.sort(function(a,b){return b.rating-a.rating});break;default:r.sort(function(a,b){return b.reviews-a.reviews})}
return r}
function cardHtml(p){var d=disc(p.origPrice,p.price);
return '<div class="card" onclick="sv(\\'product\\',\\''+p.id+'\\')"><div class="card-img">'
+(d>=20?'<span class="card-badge badge-sale">-'+d+"%</span>":"")
+p.img+'</div><div class="card-body"><div class="card-title">'+esc(p.name)+'</div>'
+'<div class="card-meta">'+stars(p.rating)+' <span>('+p.reviews+')</span></div>'
+'<div class="card-price"><span class="price-now">'+fmtP(p.price)+'</span>'
+(d>0?'<span class="price-was">'+fmtP(p.origPrice)+'</span><span class="price-off">-'+d+"%</span>":"")
+'</div><button class="card-cta" onclick="event.stopPropagation();addCart(\\''+p.id+'\\')">🛒 Ajouter</button></div></div>'}
function vHome(){var featured=P.filter(function(p){return disc(p.origPrice,p.price)>=25}).slice(0,6);
if(featured.length<6)featured=P.slice(0,6);
var best=P.slice().sort(function(a,b){return b.rating-a.rating}).slice(0,6);
return '<div class="hero"><h1>Bienvenue sur <em>'+esc(STORE_NAME)+'</em></h1>'
+'<p>Découvrez notre collection de '+P.length+'+ produits soigneusement sélectionnés pour vous.</p>'
+'<div class="hero-stats"><div class="hero-stat"><strong>'+P.length+'+</strong><span>Produits</span></div>'
+'<div class="hero-stat"><strong>'+CATS.length+'</strong><span>Catégories</span></div>'
+'<div class="hero-stat"><strong>4.7★</strong><span>Note moyenne</span></div>'
+'<div class="hero-stat"><strong>24/7</strong><span>Support</span></div></div></div>'
+'<div class="trust"><div class="trust-item"><span class="trust-icon">🔒</span>Paiement sécurisé</div>'
+'<div class="trust-item"><span class="trust-icon">🚚</span>Livraison rapide</div>'
+'<div class="trust-item"><span class="trust-icon">↩️</span>Retours 30 jours</div>'
+'<div class="trust-item"><span class="trust-icon">⭐</span>Satisfaction garantie</div></div>'
+'<div class="section"><div class="section-title">🔥 Meilleures offres</div><div class="grid">'+featured.map(cardHtml).join("")+'</div></div>'
+'<div class="section"><div class="section-title">⭐ Les mieux notés</div><div class="grid">'+best.map(cardHtml).join("")+'</div></div>'
+'<div class="section" style="text-align:center"><button onclick="sv(\\'products\\')" style="padding:14px 32px;background:var(--p);color:${isLight?"#fff":"#000"};border-radius:var(--rs);font-size:16px;font-weight:700;border:none;cursor:pointer">Voir tous les produits →</button></div>'}
function vProducts(){var r=filtered(),total=r.length,pages=Math.ceil(total/S.pp),items=r.slice((S.page-1)*S.pp,S.page*S.pp);
var sortOpts=[["popular","Populaires"],["price-asc","Prix ↑"],["price-desc","Prix ↓"],["rating","Note ↓"]];
return '<div class="section"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px">'
+'<div class="section-title" style="margin:0">'+(S.cat!=="all"?(CATS.find(function(c){return c.id===S.cat})||{}).icon+" ":"")+'Produits <span style="font-weight:400;color:var(--muted);font-size:14px">('+total+' résultats)</span></div>'
+'<select onchange="S.sort=this.value;dc()" style="padding:8px 32px 8px 12px;border-radius:var(--rs);border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;appearance:none;background-image:url(\\'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27%3E%3Cpath d=%27M1 1l5 5 5-5%27 stroke=%27%23888%27 fill=%27none%27/%3E%3C/svg%3E\\');background-repeat:no-repeat;background-position:right 10px center">'
+sortOpts.map(function(o){return '<option value="'+o[0]+'"'+(S.sort===o[0]?" selected":"")+">"+o[1]+"</option>"}).join("")
+'</select></div>'
+(items.length?'<div class="grid">'+items.map(cardHtml).join("")+'</div>':'<div style="text-align:center;padding:48px;color:var(--muted)"><span style="font-size:48px;display:block;margin-bottom:12px">🔍</span>Aucun produit trouvé</div>')
+(pages>1?'<div style="display:flex;justify-content:center;gap:6px;margin-top:24px">'+Array.from({length:pages},function(_,i){return '<button onclick="S.page='+(i+1)+';dc();scrollTo({top:0,behavior:\\'smooth\\'})" style="min-width:36px;height:36px;border-radius:var(--rs);border:1px solid '+(S.page===i+1?"var(--p)":"var(--border)")+";background:"+(S.page===i+1?"var(--p)":"var(--card)")+";color:"+(S.page===i+1?(isLight?"#fff":"#000"):"var(--text)")+';font-weight:'+(S.page===i+1?"700":"400")+';font-size:13px;cursor:pointer">'+(i+1)+"</button>"}).join("")+"</div>":"")
+'</div>'}
function vProduct(){var p=P.find(function(x){return x.id===S.vp});if(!p)return '<div class="section">Produit introuvable</div>';
var d=disc(p.origPrice,p.price);var related=P.filter(function(x){return x.cat===p.cat&&x.id!==p.id}).slice(0,4);
return '<div class="pdp"><div class="pdp-back" onclick="sv(\\'products\\')">← Retour aux produits</div>'
+'<div class="pdp-grid"><div class="pdp-img">'+p.img+'</div><div class="pdp-info">'
+'<h1>'+esc(p.name)+'</h1>'
+'<div class="meta">'+stars(p.rating)+' '+p.reviews+' avis</div>'
+'<div><span class="pdp-price">'+fmtP(p.price)+'</span>'+(d>0?'<span class="pdp-orig">'+fmtP(p.origPrice)+'</span><span class="price-off" style="margin-left:8px">-'+d+"%</span>":"")+'</div>'
+'<div class="pdp-desc">'+esc(p.desc)+'</div>'
+(p.features?'<ul class="pdp-features">'+p.features.map(function(f){return "<li>"+esc(f)+"</li>"}).join("")+"</ul>":"")
+(p.specs?'<div style="margin:16px 0"><strong>Caractéristiques</strong>'+Object.keys(p.specs).map(function(k){return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--muted)">'+esc(k)+"</span><span>"+esc(String(p.specs[k]))+"</span></div>"}).join("")+"</div>":"")
+(p.ingredients?'<div style="margin:16px 0"><strong>Ingrédients</strong><p style="font-size:13px;color:var(--muted);margin-top:4px">'+p.ingredients.map(esc).join(", ")+"</p></div>":"")
+(p.vegan||p.organic||p.crueltyfree?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">'+(p.vegan?'<span style="font-size:12px;padding:4px 10px;border-radius:100px;background:rgba(34,197,94,.1);color:#22c55e">🌿 Vegan</span>':"")+(p.organic?'<span style="font-size:12px;padding:4px 10px;border-radius:100px;background:rgba(34,197,94,.1);color:#22c55e">🌱 Bio</span>':"")+(p.crueltyfree?'<span style="font-size:12px;padding:4px 10px;border-radius:100px;background:rgba(34,197,94,.1);color:#22c55e">🐰 Cruelty-free</span>':"")+"</div>":"")
+'<button class="btn-add" onclick="addCart(\\''+p.id+'\\')">🛒 Ajouter au panier — '+fmtP(p.price)+'</button>'
+'<div style="margin-top:16px;display:flex;gap:16px;font-size:13px;color:var(--muted)"><span>🔒 Paiement sécurisé</span><span>↩️ Retours 30j</span></div>'
+'</div></div>'
+(related.length?'<div style="margin-top:40px"><div class="section-title">Produits similaires</div><div class="grid">'+related.map(cardHtml).join("")+"</div></div>":"")
+'</div>'}
function vCartPage(){if(!S.cart.length)return '<div class="section" style="text-align:center;padding:80px 16px"><span style="font-size:64px;display:block;margin-bottom:16px">🛒</span><h2>Votre panier est vide</h2><p style="color:var(--muted);margin:12px 0">Découvrez nos produits et ajoutez vos favoris !</p><button onclick="sv(\\'products\\')" style="padding:12px 24px;background:var(--p);color:${isLight?"#fff":"#000"};border-radius:var(--rs);font-weight:700;border:none;cursor:pointer;margin-top:12px">Voir les produits</button></div>';
var total=S.cart.reduce(function(s,i){return s+i.price*i.qty},0);
return '<div class="section" style="max-width:700px;margin:0 auto"><div class="section-title">🛒 Mon panier ('+S.cart.reduce(function(s,i){return s+i.qty},0)+' articles)</div>'
+S.cart.map(function(item){return '<div style="display:flex;gap:16px;padding:16px 0;border-bottom:1px solid var(--border);align-items:center"><div style="width:70px;height:70px;border-radius:12px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">'+item.img+'</div>'
+'<div style="flex:1"><div style="font-weight:600">'+esc(item.name)+'</div><div style="color:var(--p);font-weight:700;margin-top:4px">'+fmtP(item.price)+'</div>'
+'<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><button onclick="cartQty(\\''+item.id+'\\',-1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg);font-size:16px;display:flex;align-items:center;justify-content:center">−</button>'
+'<span style="min-width:24px;text-align:center;font-weight:600">'+item.qty+'</span>'
+'<button onclick="cartQty(\\''+item.id+'\\',1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg);font-size:16px;display:flex;align-items:center;justify-content:center">+</button>'
+'<span style="margin-left:auto;font-weight:700">'+fmtP(item.price*item.qty)+'</span></div></div>'
+'<span onclick="rmCart(\\''+item.id+'\\');dc()" style="color:#ef4444;cursor:pointer;font-size:18px;padding:8px">✕</span></div>'}).join("")
+'<div style="margin-top:24px;padding:20px;background:var(--bg);border-radius:var(--r)"><div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700"><span>Total</span><span style="color:var(--p)">'+fmtP(total)+'</span></div>'
+'<button onclick="toast(\\'Redirection vers le paiement Stripe...\\')" style="width:100%;padding:16px;background:var(--p);color:${isLight?"#fff":"#000"};border-radius:var(--rs);font-size:16px;font-weight:700;border:none;cursor:pointer;margin-top:16px">💳 Payer '+fmtP(total)+'</button></div></div>'}
function vAbout(){return '<div class="section" style="max-width:700px;margin:0 auto"><h1 style="font-size:28px;margin-bottom:16px">À propos de '+esc(STORE_NAME)+'</h1><p style="color:var(--muted);line-height:1.8">'+esc(STORE_NAME)+' est une boutique en ligne KDMC dédiée à vous offrir les meilleurs produits de qualité à des prix accessibles. Notre mission : rendre le shopping en ligne simple, sûr et agréable.</p>'
+'<div class="trust" style="margin-top:32px"><div class="trust-item"><span class="trust-icon">🏆</span>Qualité Premium</div><div class="trust-item"><span class="trust-icon">💯</span>Satisfaction garantie</div><div class="trust-item"><span class="trust-icon">🌍</span>Livraison mondiale</div></div></div>'}
function vContact(){return '<div class="section" style="max-width:500px;margin:0 auto"><h1 style="font-size:28px;margin-bottom:24px">📧 Contactez-nous</h1>'
+'<div style="margin-bottom:16px"><label style="display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">Nom</label><input type="text" style="width:100%;padding:12px;border-radius:var(--rs);border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>'
+'<div style="margin-bottom:16px"><label style="display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">Email</label><input type="email" style="width:100%;padding:12px;border-radius:var(--rs);border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>'
+'<div style="margin-bottom:16px"><label style="display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">Message</label><textarea rows="5" style="width:100%;padding:12px;border-radius:var(--rs);border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical"></textarea></div>'
+'<button onclick="toast(\\'Message envoyé ! Nous vous répondrons sous 24h.\\')" style="width:100%;padding:14px;background:var(--p);color:${isLight?"#fff":"#000"};border-radius:var(--rs);font-size:15px;font-weight:700;border:none;cursor:pointer">📨 Envoyer</button></div>'}
/* CART LOGIC */
function loadCart(){S.cart=JSON.parse(localStorage.getItem("kdmc_cart_"+STORE_ID)||"[]")}
function saveCart(){localStorage.setItem("kdmc_cart_"+STORE_ID,JSON.stringify(S.cart));cartBadge();renderCartPanel()}
function addCart(id){var p=P.find(function(x){return x.id===id});if(!p)return;
var ex=S.cart.find(function(x){return x.id===id});
if(ex){ex.qty++}else{S.cart.push({id:p.id,name:p.name,price:p.price,img:p.img,qty:1})}
saveCart();toast(p.name+" ajouté au panier")}
function rmCart(id){S.cart=S.cart.filter(function(x){return x.id!==id});saveCart()}
function cartQty(id,d){var it=S.cart.find(function(x){return x.id===id});if(it){it.qty=Math.max(1,it.qty+d);saveCart();dc()}}
function cartBadge(){var b=document.getElementById("cart-badge");if(b){var c=S.cart.reduce(function(s,i){return s+i.qty},0);b.textContent=c;b.style.display=c>0?"flex":"none"}}
function toggleCart(){document.getElementById("cartPanel").classList.toggle("open");document.getElementById("cartBg").classList.toggle("open");renderCartPanel()}
function renderCartPanel(){var ci=document.getElementById("cartItems"),cf=document.getElementById("cartFooter");if(!ci)return;
if(!S.cart.length){ci.innerHTML='<div class="cart-empty"><span>🛒</span>Votre panier est vide</div>';cf.innerHTML="";return}
ci.innerHTML=S.cart.map(function(it){return '<div class="cart-item"><div class="cart-item-img">'+it.img+'</div><div class="cart-item-info"><div class="cart-item-name">'+esc(it.name)+'</div><div class="cart-item-price">'+fmtP(it.price)+'</div>'
+'<div class="cart-item-qty"><button onclick="cartQty(\\''+it.id+'\\',-1);renderCartPanel()">−</button><span>'+it.qty+'</span><button onclick="cartQty(\\''+it.id+'\\',1);renderCartPanel()">+</button></div>'
+'<div class="cart-item-rm" onclick="rmCart(\\''+it.id+'\\');renderCartPanel()">Supprimer</div></div></div>'}).join("");
var total=S.cart.reduce(function(s,i){return s+i.price*i.qty},0);
cf.innerHTML='<div class="cart-total"><span>Total</span><span class="amount">'+fmtP(total)+'</span></div><button class="btn-checkout" onclick="toast(\\'Redirection vers Stripe...\\')">💳 Commander — '+fmtP(total)+"</button>"}
function nlSub(){var e=document.getElementById("nlEmail");if(e&&e.value.indexOf("@")>0){toast("Bienvenue ! Vérifiez vos emails 📧");e.value=""}else toast("Email invalide","error")}
/* INIT */
loadCart();dc();
window.addEventListener("scroll",function(){document.getElementById("btt").classList.toggle("show",scrollY>400)});
if(!localStorage.getItem("kdmc_cookie_ok")){var ck=document.createElement("div");ck.className="cookie";ck.innerHTML='🍪 Ce site utilise des cookies. <a href="#">En savoir plus</a><div class="cookie-btns"><button class="btn-accept" onclick="localStorage.setItem(\\'kdmc_cookie_ok\\',1);this.closest(\\'.cookie\\').remove()">Accepter</button><button class="btn-refuse" onclick="this.closest(\\'.cookie\\').remove()">Refuser</button></div>';document.body.appendChild(ck)}
<\/script>
</body>
</html>`;
const outPath=path.join(__dirname,'../../stores',slug,'index.html');
fs.writeFileSync(outPath,html);
console.log('✅ '+data.name+': index.html généré ('+Math.round(html.length/1024)+' KB)');
