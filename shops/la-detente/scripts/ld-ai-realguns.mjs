/* La Détente — DESIGNS PHOTORÉALISTES « vraies armes » (sport / chasse / ball-trap)
   via GEMINI_API_KEY. Vraies images d'armes (photo studio), fond rendu transparent.
   Registre légitime : tir sportif, chasse, ball-trap, élégant (arme + rose / cœur rouge).
   Sortie : shops/la-detente/img/designs/real-<id>.png */
import fs from 'fs';
import sharp from 'sharp';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('❌ GEMINI_API_KEY manquante'); process.exit(1); }
const SHOP = process.cwd() + '/shops/la-detente';
const OUT = SHOP + '/img/designs';
const API = 'https://generativelanguage.googleapis.com/v1beta';

const STYLE = ' Ultra-realistic high-end studio product photograph, true-to-life materials (engraved steel, polished walnut wood), razor-sharp focus, dramatic soft catalog lighting, the object centered and fully visible, isolated on a pure solid white seamless background (#ffffff). No people, no hands, no text, no logo watermark.';

const DESIGNS = [
  { id:'real-shotgun-clays', p:'A luxury Italian over-and-under competition clay-shooting shotgun (Perazzi / Beretta style) with an ornately engraved silver receiver and rich walnut stock, shown in side profile, breech broken open. Three bright orange clay pigeon targets flying and shattering into fragments above the barrels. A tiny glossy red heart engraved on the silver receiver.'+STYLE },
  { id:'real-shotgun-rose', p:'An elegant engraved double-barrel hunting shotgun with deep walnut wood stock, lying at a graceful diagonal, with a single fresh vivid red rose and green stem resting across the barrels and a few red petals scattered on the white surface.'+STYLE },
  { id:'real-rifle-heart', p:'A classic bolt-action wooden hunting rifle (walnut stock, blued steel barrel, leather sling) in clean side profile, with a small discreet glossy red enamel heart inlaid on the stock.'+STYLE },
  { id:'real-revolver-rose', p:'A classic blued-steel revolver with polished walnut grips lying flat, a single red rose with green stem placed elegantly beside it, a few petals around.'+STYLE },
  { id:'real-cartridges', p:'A premium flat-lay macro photograph of high-quality shotgun shells and hunting rifle cartridges (brass bases, deep red and green hulls) neatly arranged in a fan, one shell embossed with a small glossy red heart.'+STYLE },
  { id:'real-crossed-shotguns', p:'Two finely engraved over-and-under shotguns crossed in an X like a heraldic trophy, with a small concentric red-and-black target and a single orange clay pigeon at the crossing point, symmetrical coat-of-arms composition.'+STYLE },
  { id:'real-ar15-heart', p:'A modern sport target rifle (black AR-style competition rifle with a telescopic optic and adjustable stock) displayed cleanly in side profile as a catalog piece, with a small glossy red heart emblem on the magazine well.'+STYLE },
  { id:'real-deer', p:'A majestic red deer stag with large antlers standing proudly in side profile, realistic wildlife photography, rich brown fur.'+STYLE },
  { id:'real-stag-head', p:'A powerful red deer stag head with large branching antlers, front three-quarter view, realistic wildlife trophy portrait.'+STYLE },
  { id:'real-boar', p:'A wild boar in side profile, dark bristly fur and tusks, realistic European hunting wildlife photography.'+STYLE },
  { id:'real-duck', p:'A flying mallard duck with wings spread, realistic wildlife photography, green head, in mid-flight side view.'+STYLE },
  { id:'real-pheasant', p:'A colorful ring-necked pheasant standing in side profile, iridescent plumage, realistic wildlife photography.'+STYLE },
  { id:'real-fox', p:'A red fox sitting alertly in side profile, bushy tail, realistic wildlife photography.'+STYLE },
  { id:'real-hare', p:'A brown european hare sitting alert in side profile, realistic wildlife photography.'+STYLE },
  { id:'real-eagle', p:'A golden eagle with wings spread wide in flight, talons forward, realistic majestic wildlife photography.'+STYLE }
];

async function pickModel(){
  const pref = ['gemini-3-pro-image','nano-banana-pro-preview','gemini-3-pro-image-preview','gemini-3.1-flash-image','gemini-2.5-flash-image'];
  try {
    const r = await fetch(`${API}/models?key=${KEY}&pageSize=200`); const j = await r.json();
    const listed = (j.models||[]).filter(m=>/image/i.test(m.name)).map(m=>m.name.replace('models/',''));
    console.log('  modèles image:', listed.join(', '));
    const ord = pref.filter(m=>listed.includes(m)).concat(listed.filter(m=>!pref.includes(m)&&!/imagen/.test(m)));
    return ord.length?ord:pref;
  } catch(e){ return pref; }
}
async function gen(prompt, models){
  for (const model of models){
    const url=`${API}/models/${model}:generateContent?key=${KEY}`;
    const body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseModalities:['IMAGE']}};
    let res,txt; try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});txt=await res.text();}catch(e){console.error('  net KO',model,e.message);continue;}
    if(!res.ok){console.error(`  ${model} HTTP ${res.status}: ${txt.slice(0,160)}`);continue;}
    let j;try{j=JSON.parse(txt);}catch(_){continue;}
    const parts=(j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[];
    const ip=parts.find(p=>p.inlineData||p.inline_data);
    const b64=ip&&((ip.inlineData&&ip.inlineData.data)||(ip.inline_data&&ip.inline_data.data));
    if(b64){console.log('  ✅',model);return Buffer.from(b64,'base64');}
    const fr=j.candidates&&j.candidates[0]&&j.candidates[0].finishReason;console.error('  pas d\'image',model,fr||txt.slice(0,120));
  }
  return null;
}
async function whiteToAlpha(buf){
  const img=sharp(buf).ensureAlpha();
  const {data,info}=await img.raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=info;
  for(let i=0;i<data.length;i+=channels){
    const r=data[i],g=data[i+1],b=data[i+2];
    if(r>244&&g>244&&b>244){data[i+3]=0;}
    else if(r>232&&g>232&&b>232){data[i+3]=Math.min(data[i+3],90);}
  }
  return sharp(data,{raw:{width,height,channels}}).png().toBuffer();
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const models=await pickModel();
  let ok=0;
  for(const d of DESIGNS){
    console.log('▶',d.id);
    const raw=await gen(d.p,models);
    if(!raw){console.log('  ⏭ skip (refus/indispo)');continue;}
    try{
      const trimmed=await sharp(await whiteToAlpha(raw)).trim({threshold:10}).resize(1024,1024,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
      fs.writeFileSync(`${OUT}/${d.id}.png`,trimmed);
    }catch(e){ fs.writeFileSync(`${OUT}/${d.id}.png`,raw); }
    ok++; console.log('  🖼️ →',d.id+'.png');
  }
  console.log(`\nTerminé : ${ok}/${DESIGNS.length} designs réalistes générés.`);
  if(ok===0)process.exit(2);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
