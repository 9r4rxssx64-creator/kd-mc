/* La Détente — génère les DESIGNS premium (inspirés des modèles de Kevin) via la clé
   GEMINI_API_KEY : pistolet+rose, fusils qui tirent des cœurs, Perazzi+plateaux, crest…
   Style sticker vectoriel, fond rendu transparent. Sortie : img/designs/<id>.png */
import fs from 'fs';
import sharp from 'sharp';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('❌ GEMINI_API_KEY manquante'); process.exit(1); }
const SHOP = process.cwd() + '/shops/la-detente';
const OUT = SHOP + '/img/designs';
const API = 'https://generativelanguage.googleapis.com/v1beta';

const STYLE = 'Professional vector sticker illustration, bold clean black outline, vivid saturated colors, subtle cel shading, high detail, centered composition, isolated on a pure flat white background (#ffffff), no scene, no shadow on the ground, no text unless specified.';

const DESIGNS = [
  { id:'rose-pistol', p:'A glossy black semi-automatic pistol pointing right with a single vivid red rose and green stem inserted in the barrel, a few red petals falling. '+STYLE },
  { id:'rose-shotgun', p:'A premium over-and-under shotgun with rich brown walnut wood stock pointing right, a single vivid red rose with green stem in the barrel, falling petals. '+STYLE },
  { id:'hearts-ar15', p:'A black AR-15 rifle with optic pointing right, firing a joyful burst of glossy red love hearts and small sparkles from the muzzle. '+STYLE },
  { id:'hearts-shotgun', p:'An over-and-under shotgun with walnut wood stock pointing right, firing a burst of glossy red love hearts and sparkles from the barrels. '+STYLE },
  { id:'hearts-pistol', p:'A black semi-automatic pistol pointing right, firing a burst of small glossy red love hearts and sparkles from the barrel. '+STYLE },
  { id:'hearts-revolver', p:'A classic revolver with brown wood grip pointing right, firing a burst of glossy red love hearts and smoke from the barrel. '+STYLE },
  { id:'clays-perazzi', p:'A high-end competition over-and-under shotgun with glossy walnut wood pointing up-right, firing a spray of bright orange clay pigeon targets with light smoke trails and sparks. '+STYLE },
  { id:'crest', p:'A premium hunting and shooting club emblem badge: a crossed black AR-15 rifle and a walnut over-and-under shotgun over a red and black concentric target, with pine trees, a stag deer silhouette and a snowy mountain behind, a flying orange clay pigeon. Below, a black banner ribbon with a thin gold outline reading "LA DÉTENTE" in bold white letters, two small gold stars. '+STYLE.replace('no text unless specified.','') }
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
    if(!res.ok){console.error(`  ${model} HTTP ${res.status}: ${txt.slice(0,140)}`);continue;}
    let j;try{j=JSON.parse(txt);}catch(_){continue;}
    const parts=(j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[];
    const ip=parts.find(p=>p.inlineData||p.inline_data);
    const b64=ip&&((ip.inlineData&&ip.inlineData.data)||(ip.inline_data&&ip.inline_data.data));
    if(b64){console.log('  ✅',model);return Buffer.from(b64,'base64');}
    const fr=j.candidates&&j.candidates[0]&&j.candidates[0].finishReason;console.error('  pas d\'image',model,fr||txt.slice(0,100));
  }
  return null;
}
// rend le fond blanc transparent (sticker), garde le sujet
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
    if(!raw){console.log('  ⏭ skip');continue;}
    try{
      const trimmed=await sharp(await whiteToAlpha(raw)).trim({threshold:10}).resize(1024,1024,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
      fs.writeFileSync(`${OUT}/${d.id}.png`,trimmed);
    }catch(e){ fs.writeFileSync(`${OUT}/${d.id}.png`,raw); }
    ok++; console.log('  🖼️ →',d.id+'.png');
  }
  console.log(`\nTerminé : ${ok}/${DESIGNS.length} designs générés.`);
  if(ok===0)process.exit(2);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
