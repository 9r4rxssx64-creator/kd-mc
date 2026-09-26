/* LA DÉTENTE — Logos monogramme Y · R · K (Yann, Rémy, Kevin) sur le thème armes + cœur.
   SVG → PNG via sharp. Standalone. */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const OUT = __dirname; fs.mkdirSync(OUT, { recursive: true });
const FONT = "'Liberation Sans','DejaVu Sans',Arial,sans-serif";

const PAL = {
  noirRouge: { bg1:'#1a1c22', bg2:'#0a0b0e', ring:'#e51f2b', ring2:'#8c0d15', ink:'#f3eee2', ink2:'#c9ccd3', steel:'#c7ccd4', accent:'#e51f2b', accent2:'#8c0d15', heartHi:'#ff6a6f', gold:false },
  camo: { bg1:'#283019', bg2:'#141a0d', ring:'#6f7c3f', ring2:'#3d4824', ink:'#efe9d2', ink2:'#cdd0b4', steel:'#6a7540', accent:'#d72a25', accent2:'#7c1311', heartHi:'#ff6a63', gold:false },
  noirOr: { bg1:'#16141b', bg2:'#08070b', ring:'#d4af37', ring2:'#9c7b22', ink:'#f5e6ac', ink2:'#cdbd86', steel:'#f6e9b0', accent:'#e51f2b', accent2:'#8c0d15', heartHi:'#ff7a7e', gold:true, gold1:'#fff3c4', gold2:'#d4af37', gold3:'#9c7b22' }
};
const HEART = 'M0,56 C-31,26 -54,6 -54,-16 C-54,-37 -31,-47 -12,-31 C-6,-26 0,-17 0,-11 C0,-17 6,-26 12,-31 C31,-47 54,-37 54,-16 C54,6 31,26 0,56 Z';
function heart(cx,cy,s,p,id,glossy){
  const g=`<radialGradient id="${id}" cx="38%" cy="30%" r="80%"><stop offset="0%" stop-color="${p.heartHi}"/><stop offset="45%" stop-color="${p.accent}"/><stop offset="100%" stop-color="${p.accent2}"/></radialGradient>`;
  const gl=glossy?`<path d="M-30,-22 C-40,-6 -34,12 -16,22 C-30,4 -26,-12 -12,-22 C-22,-26 -27,-25 -30,-22 Z" fill="#fff" opacity=".35"/>`:'';
  return {defs:g, body:`<g transform="translate(${cx},${cy}) scale(${s})"><path d="${HEART}" fill="url(#${id})" stroke="${p.accent2}" stroke-width="2.5"/>${gl}</g>`};
}
function rifle(fill,stroke,sw){ // AR15 simplifié horizontal, box ~0..366
  return `<g fill="${fill}" stroke="${stroke||'none'}" stroke-width="${sw||0}" stroke-linejoin="round">
   <polygon points="0,44 62,30 62,74 34,82 0,72"/><rect x="60" y="30" width="130" height="38" rx="3"/>
   <rect x="92" y="19" width="100" height="10" rx="3"/><polygon points="118,68 140,68 153,116 126,118"/>
   <path d="M150,68 L190,68 L202,156 Q184,162 166,156 Z"/><rect x="190" y="38" width="76" height="26" rx="5"/>
   <rect x="266" y="46" width="96" height="10" rx="3"/><polygon points="300,21 310,21 308,46 302,46"/><rect x="352" y="43" width="15" height="15" rx="2"/></g>`;
}
function arcText(cx,cy,r,centerDeg,spanDeg,text,opt,flip){
  const size=opt.size||40,fill=opt.fill||'#fff',weight=opt.weight||'bold',font=opt.font||FONT;
  const chars=Array.from(text),n=chars.length;let out=`<g font-family="${font}" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="middle">`;
  for(let i=0;i<n;i++){if(chars[i]===' ')continue;const t=n===1?0.5:i/(n-1);const ang=flip?(centerDeg+spanDeg/2-t*spanDeg):(centerDeg-spanDeg/2+t*spanDeg);const rad=ang*Math.PI/180;const x=cx+r*Math.cos(rad),y=cy+r*Math.sin(rad);const rot=(flip?ang-90:ang+90).toFixed(2);out+=`<text x="${x.toFixed(1)}" y="${(y+size*0.34).toFixed(1)}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${chars[i]}</text>`;}
  return out+'</g>';
}
function ribbon(cx,cy,w,p,txt,gold,key){
  const h=92,x=cx-w/2,y=cy-h/2,tail=32;
  const grad=gold?`<linearGradient id="rib${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.gold1}"/><stop offset="100%" stop-color="${p.gold2}"/></linearGradient>`:'';
  const fill=gold?`url(#rib${key})`:p.accent, tcol=gold?'#15140f':'#fff';
  return `${grad}<path d="M${x},${y+8} L${x-tail},${y+22} L${x-tail},${y+h+12} L${x},${y+h-6} Z" fill="${p.accent2}"/><path d="M${x+w},${y+8} L${x+w+tail},${y+22} L${x+w+tail},${y+h+12} L${x+w},${y+h-6} Z" fill="${p.accent2}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${p.accent2}" stroke-width="3"/><text x="${cx}" y="${cy+18}" font-family="${FONT}" font-weight="bold" font-size="50" letter-spacing="2" text-anchor="middle" fill="${tcol}">${txt}</text>`;
}

/* ---- Concept 1 : patch monogramme rond Y·R·K + fusil + cœur ---- */
function patch(palKey, key){
  const p=PAL[palKey];
  let defs='',body='';
  defs+=`<radialGradient id="bg${key}" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></radialGradient>`;
  const ringFill=p.gold?`url(#rg${key})`:p.ring;
  if(p.gold)defs+=`<linearGradient id="rg${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.gold1}"/><stop offset="50%" stop-color="${p.gold2}"/><stop offset="100%" stop-color="${p.gold3}"/></linearGradient>`;
  body+=`<circle cx="500" cy="500" r="486" fill="${ringFill}"/><circle cx="500" cy="500" r="486" fill="none" stroke="${p.ring2}" stroke-width="6"/>`;
  body+=`<circle cx="500" cy="500" r="452" fill="url(#bg${key})"/>`;
  body+=`<circle cx="500" cy="500" r="452" fill="none" stroke="${p.ink}" stroke-width="4" stroke-dasharray="2 11" stroke-linecap="round" opacity=".85"/>`;
  // fusil en filigrane derrière
  body+=`<g transform="translate(500,520) rotate(-18) scale(1.5) translate(-183,-88)" opacity="0.20">${rifle(p.steel)}</g>`;
  // monogramme Y R K
  const letterFill=p.gold?`url(#rg${key})`:p.steel;
  body+=`<g font-family="${FONT}" font-weight="bold" text-anchor="middle" fill="${letterFill}" stroke="${p.ring2}" stroke-width="2">
     <text x="318" y="560" font-size="210">Y</text>
     <text x="682" y="560" font-size="210">K</text>
     <text x="500" y="600" font-size="250">R</text></g>`;
  const h=heart(500,372,1.25,p,`h${key}`,p.gold);defs+=h.defs;body+=h.body;
  body+=arcText(500,500,404,-90,150,'TIR · BALL-TRAP · CHASSE',{size:48,fill:p.ink});
  body+=ribbon(500,792,372,p,'LA DÉTENTE',p.gold,key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1000 1000"><defs>${defs}</defs>${body}</svg>`;
}

/* ---- Concept 2 : lockup horizontal Y · R · K avec cœur central + fusil ---- */
function lockup(key){
  const p=PAL.noirRouge;let defs='',body='';
  defs+=`<linearGradient id="bgL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#16171c"/><stop offset="100%" stop-color="#070809"/></linearGradient><linearGradient id="wm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#c7ccd4"/></linearGradient>`;
  body+=`<rect width="1600" height="900" fill="url(#bgL)"/><rect x="40" y="40" width="1520" height="820" rx="26" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>`;
  body+=`<text x="430" y="500" font-family="${FONT}" font-weight="bold" font-size="300" text-anchor="middle" fill="url(#wm)">Y</text>`;
  const h1=heart(800,420,2.0,p,'hl',false);defs+=h1.defs;body+=h1.body;
  body+=`<text x="1170" y="500" font-family="${FONT}" font-weight="bold" font-size="300" text-anchor="middle" fill="url(#wm)">K</text>`;
  body+=`<text x="800" y="500" font-family="${FONT}" font-weight="bold" font-size="300" text-anchor="middle" fill="url(#wm)" opacity="0">R</text>`;
  // R au-dessus du cœur ? plutôt : Y ♥ K en grand, et "R" intégré -> on met YRK : Y (gauche) R(centre derrière cœur) K(droite). Mettons le cœur = liaison, et R sous le cœur.
  body+=`<g transform="translate(40,0)"><rect x="380" y="560" width="800" height="6" fill="${p.accent}"/></g>`;
  body+=`<text x="800" y="660" font-family="${FONT}" font-weight="bold" font-size="120" text-anchor="middle" fill="url(#wm)">R</text>`;
  body+=`<text x="800" y="250" font-family="${FONT}" font-weight="bold" font-size="60" letter-spacing="8" text-anchor="middle" fill="${p.accent}">YANN · RÉMY · KEVIN</text>`;
  body+=`<text x="800" y="770" font-family="${FONT}" font-weight="bold" font-size="58" letter-spacing="10" text-anchor="middle" fill="#c9ccd3">LA DÉTENTE</text>`;
  body+=`<text x="800" y="828" font-family="${FONT}" font-weight="bold" font-size="34" letter-spacing="9" text-anchor="middle" fill="#7d848f">TIR · BALL-TRAP · CHASSE</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1125" viewBox="0 0 1600 900"><defs>${defs}</defs>${body}</svg>`;
}

/* ---- Concept 3 : trois cartouches Y / R / K + cœur ---- */
function cartouches(key){
  const p=PAL.noirOr;let defs='',body='';
  defs+=`<radialGradient id="bgc" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></radialGradient><linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f6e9b0"/><stop offset="55%" stop-color="#c69b33"/><stop offset="100%" stop-color="#8a6b1f"/></linearGradient><linearGradient id="rgc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff3c4"/><stop offset="50%" stop-color="#d4af37"/><stop offset="100%" stop-color="#9c7b22"/></linearGradient>`;
  body+=`<circle cx="500" cy="500" r="486" fill="url(#rgc)"/><circle cx="500" cy="500" r="452" fill="url(#bgc)"/><circle cx="500" cy="500" r="452" fill="none" stroke="#9c7b22" stroke-width="5"/>`;
  // 3 cartouches debout
  function shell(cx,letter){
    return `<g transform="translate(${cx},560)">
      <rect x="-46" y="-150" width="92" height="200" rx="14" fill="#b3361f"/>
      <rect x="-46" y="-150" width="92" height="200" rx="14" fill="none" stroke="#7a2414" stroke-width="3"/>
      <rect x="-50" y="30" width="100" height="92" rx="10" fill="url(#brass)" stroke="#7a5a16" stroke-width="3"/>
      <ellipse cx="0" cy="46" rx="30" ry="12" fill="none" stroke="#7a5a16" stroke-width="4"/>
      <text x="0" y="-30" font-family="${FONT}" font-weight="bold" font-size="120" text-anchor="middle" fill="#fff">${letter}</text>
    </g>`;
  }
  body+=shell(300,'Y')+shell(500,'R')+shell(700,'K');
  const h=heart(500,250,1.15,p,'hc',true);defs+=h.defs;body+=h.body;
  body+=arcText(500,500,404,-90,150,'YANN · RÉMY · KEVIN',{size:44,fill:p.ink});
  body+=ribbon(500,800,372,p,'LA DÉTENTE',true,key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1000 1000"><defs>${defs}</defs>${body}</svg>`;
}

function shotgun(fill){ // over/under, box ~0..360
  return `<g fill="${fill}" stroke-linejoin="round"><path d="M0,56 L58,40 L114,48 L114,98 L74,100 L44,114 L10,100 Z"/><rect x="108" y="40" width="48" height="48" rx="5"/><rect x="150" y="40" width="210" height="11" rx="3"/><rect x="150" y="56" width="210" height="11" rx="3"/><rect x="150" y="72" width="74" height="17" rx="7"/><rect x="354" y="38" width="11" height="31" rx="2"/></g>`;
}
/* ---- Concept : CREST (blason) Y·R·K + armes croisées + cœur ---- */
function crest(palKey,key){
  const p=PAL[palKey];let defs='',body='';
  const edge=p.gold?`url(#cg${key})`:p.ring;
  if(p.gold)defs+=`<linearGradient id="cg${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.gold1}"/><stop offset="50%" stop-color="${p.gold2}"/><stop offset="100%" stop-color="${p.gold3}"/></linearGradient>`;
  defs+=`<linearGradient id="cb${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></linearGradient>`;
  const shield='M500,52 L884,235 L884,612 C884,792 712,890 500,944 C288,890 116,792 116,612 L116,235 Z';
  body+=`<path d="${shield}" fill="url(#cb${key})" stroke="${edge}" stroke-width="16" stroke-linejoin="round"/>`;
  body+=`<path d="M500,96 L840,260 L840,604 C840,766 690,856 500,906 C310,856 160,766 160,604 L160,260 Z" fill="none" stroke="${edge}" stroke-width="4" opacity=".55"/>`;
  // Y · R · K en haut
  body+=`<text x="500" y="300" font-family="${FONT}" font-weight="bold" font-size="150" letter-spacing="14" text-anchor="middle" fill="${p.gold?`url(#cg${key})`:p.steel}" stroke="${p.ring2}" stroke-width="2">Y·R·K</text>`;
  // armes croisées
  const gunFill=p.gold?`url(#cg${key})`:p.steel;
  body+=`<g transform="translate(500,560) rotate(-28) scale(1.0) translate(-183,-88)" opacity=".95">${rifle(gunFill,p.ring2,2)}</g>`;
  body+=`<g transform="translate(500,560) rotate(28) scale(1.0) translate(-183,-77)" opacity=".95">${shotgun(gunFill)}</g>`;
  const h=heart(500,560,1.55,p,`hx${key}`,p.gold);defs+=h.defs;body+=h.body;
  body+=ribbon(500,820,392,p,'LA DÉTENTE',p.gold,'cr'+key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1000 1000"><defs>${defs}</defs>${body}</svg>`;
}
/* ---- Concept : monogramme entrelacé (fond transparent, broderie) ---- */
function monoInterlock(palKey,key){
  const p=PAL[palKey];let defs='',body='';
  const col=p.gold?`url(#mi${key})`:p.steel;
  if(p.gold)defs+=`<linearGradient id="mi${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.gold1}"/><stop offset="50%" stop-color="${p.gold2}"/><stop offset="100%" stop-color="${p.gold3}"/></linearGradient>`;
  body+=`<g font-family="${FONT}" font-weight="bold" text-anchor="middle">
     <text x="332" y="600" font-size="360" fill="${col}" stroke="${p.ring2}" stroke-width="3" opacity=".96">Y</text>
     <text x="668" y="600" font-size="360" fill="${col}" stroke="${p.ring2}" stroke-width="3" opacity=".96">K</text>
     <text x="500" y="640" font-size="430" fill="${col}" stroke="${p.ring2}" stroke-width="4">R</text></g>`;
  const h=heart(500,300,1.35,p,`mh${key}`,true);defs+=h.defs;body+=h.body;
  body+=`<text x="500" y="820" font-family="${FONT}" font-weight="bold" font-size="64" letter-spacing="6" text-anchor="middle" fill="${col}">LA DÉTENTE</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1000 1000"><defs>${defs}</defs>${body}</svg>`;
}
/* ---- Concept : lockup rééquilibré Y · R · K (3 égales) + cœur + fusil ---- */
function lockup2(key){
  const p=PAL.noirRouge;let defs='',body='';
  defs+=`<linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#16171c"/><stop offset="100%" stop-color="#070809"/></linearGradient><linearGradient id="wm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#c7ccd4"/></linearGradient>`;
  body+=`<rect width="1600" height="900" fill="url(#bg2)"/><rect x="40" y="40" width="1520" height="820" rx="26" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>`;
  const h=heart(800,250,1.5,p,'lh2',false);defs+=h.defs;
  body+=`<text x="800" y="200" font-family="${FONT}" font-weight="bold" font-size="56" letter-spacing="10" text-anchor="middle" fill="${p.accent}">YANN · RÉMY · KEVIN</text>`;
  body+=h.body;
  body+=`<text x="800" y="600" font-family="${FONT}" font-weight="bold" font-size="300" letter-spacing="20" text-anchor="middle" fill="url(#wm2)">Y·R·K</text>`;
  body+=`<g transform="translate(800,560) scale(1.0) translate(-183,-82)" opacity=".14">${rifle('#c7ccd4')}</g>`;
  body+=`<text x="800" y="720" font-family="${FONT}" font-weight="bold" font-size="62" letter-spacing="14" text-anchor="middle" fill="#e7e9ee">LA DÉTENTE</text>`;
  body+=`<text x="800" y="775" font-family="${FONT}" font-weight="bold" font-size="32" letter-spacing="9" text-anchor="middle" fill="#7d848f">TIR · BALL-TRAP · CHASSE</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1125" viewBox="0 0 1600 900"><defs>${defs}</defs>${body}</svg>`;
}
/* ============================ VERSIONS DORÉES PREMIUM ============================ */
const FONT_SERIF = "'DejaVu Serif','Liberation Serif',Georgia,serif";
function goldStops(id){return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff7d6"/><stop offset="20%" stop-color="#f3d98a"/><stop offset="50%" stop-color="#d8b23f"/><stop offset="78%" stop-color="#a87f24"/><stop offset="100%" stop-color="#6e4f12"/></linearGradient>`;}
function star5(cx,cy,r,fill){let p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*0.45:r;p.push((cx+rr*Math.cos(a)).toFixed(1)+','+(cy+rr*Math.sin(a)).toFixed(1));}return `<polygon points="${p.join(' ')}" fill="${fill}" stroke="#6e4f12" stroke-width="1.5"/>`;}
function leafAt(x,y,rot,fill){return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="8" ry="19" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${fill}" stroke="#6e4f12" stroke-width="1"/>`;}
function laurel(cx,cy,R,fill){let o='<g>';for(let i=0;i<8;i++){const dL=112+i*13,aL=dL*Math.PI/180,lx=cx+R*Math.cos(aL),ly=cy+R*Math.sin(aL);o+=leafAt(lx,ly,dL+90,fill);const dR=68-i*13,aR=dR*Math.PI/180,rx=cx+R*Math.cos(aR),ry=cy+R*Math.sin(aR);o+=leafAt(rx,ry,dR-90,fill);}return o+'</g>';}
function studs(cx,cy,r,fill){let o='';for(let a=0;a<360;a+=30){const rad=a*Math.PI/180;o+=`<circle cx="${(cx+r*Math.cos(rad)).toFixed(1)}" cy="${(cy+r*Math.sin(rad)).toFixed(1)}" r="6" fill="${fill}" stroke="#6e4f12" stroke-width="1"/>`;}return o;}

function crestOrPremium(key,opt){
  opt=opt||{};const fam=opt.serif?FONT_SERIF:FONT;const p=PAL.noirOr;let defs='',body='';
  defs+=`<radialGradient id="cbp${key}" cx="50%" cy="40%" r="72%"><stop offset="0%" stop-color="#1b1810"/><stop offset="68%" stop-color="#0d0b06"/><stop offset="100%" stop-color="#040302"/></radialGradient>`+goldStops('gp'+key);
  const gold=`url(#gp${key})`;
  const shield='M500,40 L890,232 L890,616 C890,800 712,902 500,958 C288,902 110,800 110,616 L110,232 Z';
  body+=`<path d="${shield}" fill="url(#cbp${key})" stroke="${gold}" stroke-width="24" stroke-linejoin="round"/>`;
  body+=`<path d="${shield}" fill="none" stroke="#fff7d6" stroke-width="3" stroke-opacity=".55" stroke-linejoin="round"/>`;
  body+=`<path d="M500,94 L846,260 L846,606 C846,772 690,862 500,910 C310,862 154,772 154,606 L154,260 Z" fill="none" stroke="${gold}" stroke-width="5" opacity=".75"/>`;
  body+=star5(500,158,28,gold);
  body+=`<text x="500" y="338" font-family="${fam}" font-weight="bold" font-size="150" letter-spacing="14" text-anchor="middle" fill="${gold}" stroke="#3a2908" stroke-width="2">Y·R·K</text>`;
  body+=`<g transform="translate(500,582) rotate(-28) scale(1.02) translate(-183,-88)">${rifle(gold,'#3a2908',2)}</g>`;
  body+=`<g transform="translate(500,582) rotate(28) scale(1.02) translate(-183,-77)">${shotgun(gold)}</g>`;
  if(opt.laurel)body+=laurel(500,600,300,gold);
  const h=heart(500,582,1.62,p,'hcp'+key,true);defs+=h.defs;body+=h.body;
  body+=ribbon(500,840,404,p,'LA DÉTENTE',true,'crp'+key);
  body+=`<path d="M180,255 L500,118 L820,255" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="16" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1000 1000"><defs>${defs}</defs>${body}</svg>`;
}
function monoOrPremium(key,opt){
  opt=opt||{};const p=PAL.noirOr;let defs='',body='';
  defs+=`<radialGradient id="mbp${key}" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="#1b1810"/><stop offset="70%" stop-color="#0c0a06"/><stop offset="100%" stop-color="#040302"/></radialGradient>`+goldStops('mg'+key);
  const gold=`url(#mg${key})`;
  body+=`<circle cx="500" cy="500" r="492" fill="${gold}"/><circle cx="500" cy="500" r="492" fill="none" stroke="#3a2908" stroke-width="3"/>`;
  body+=`<circle cx="500" cy="500" r="470" fill="none" stroke="#fff7d6" stroke-width="2" opacity=".6"/>`;
  body+=`<circle cx="500" cy="500" r="452" fill="url(#mbp${key})"/><circle cx="500" cy="500" r="452" fill="none" stroke="${gold}" stroke-width="6"/>`;
  body+=studs(500,500,449,gold);
  body+=`<g font-family="${FONT}" font-weight="bold" text-anchor="middle" fill="${gold}" stroke="#3a2908" stroke-width="3">
     <text x="352" y="606" font-size="300">Y</text><text x="648" y="606" font-size="300">K</text><text x="500" y="648" font-size="392">R</text></g>`;
  const h=heart(500,316,1.22,p,'mhp'+key,true);defs+=h.defs;body+=h.body;
  if(opt.laurel)body+=laurel(500,560,300,gold);
  body+=arcText(500,500,430,-90,150,'YANN · RÉMY · KEVIN',{size:42,fill:gold});
  body+=arcText(500,500,430,90,140,'LA DÉTENTE',{size:56,fill:gold},true);
  body+=`<path d="M150,300 A492,492 0 0 1 850,300" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="12" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1000 1000"><defs>${defs}</defs>${body}</svg>`;
}
async function render(svg,name){await sharp(Buffer.from(svg)).png({compressionLevel:9}).toFile(path.join(OUT,name+'.png'));fs.writeFileSync(path.join(OUT,name+'.svg'),svg);console.log('✓',name);}
(async()=>{
  await render(patch('noirRouge','a'),'yrk-patch-noir-rouge');
  await render(patch('camo','b'),'yrk-patch-camo');
  await render(patch('noirOr','c'),'yrk-patch-or');
  await render(cartouches('e'),'yrk-cartouches-or');
  await render(crest('noirRouge','f'),'yrk-crest-noir-rouge');
  await render(crest('camo','g'),'yrk-crest-camo');
  await render(crest('noirOr','h'),'yrk-crest-or');
  await render(monoInterlock('noirRouge','i'),'yrk-monogramme-acier');
  await render(monoInterlock('noirOr','j'),'yrk-monogramme-or');
  await render(lockup2('k'),'yrk-lockup-horizontal');
  // --- versions dorées premium (va plus loin) ---
  await render(crestOrPremium('p1',{serif:true,laurel:true}),'yrk-crest-or-prestige');
  await render(crestOrPremium('p2',{serif:false,laurel:false}),'yrk-crest-or-deluxe');
  await render(monoOrPremium('p3',{laurel:true}),'yrk-monogramme-or-medaille');
  await render(monoOrPremium('p4',{laurel:false}),'yrk-monogramme-or-prestige');
  console.log('TERMINÉ');
})();
