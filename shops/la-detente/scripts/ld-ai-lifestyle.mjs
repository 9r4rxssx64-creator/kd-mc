/* La Détente — VRAIES photos produit premium via Gemini (clé GEMINI_API_KEY).
   On donne le LOGO emblème (PNG transparent) au modèle image le plus puissant de
   la clé (nano-banana-pro / gemini-3-pro-image), qui l'imprime sur un vrai
   vêtement photoréaliste en situation. Pas de mockup SVG plat, pas d'overlay qui
   écrase la photo. Sortie : img/lifestyle/<theme>.png (1600x1200).
   Repli : Imagen (scène seule) puis composite SVG si aucun modèle image. */
import { chromium } from 'playwright';
import fs from 'fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('❌ GEMINI_API_KEY manquante'); process.exit(1); }
const SHOP = process.cwd() + '/shops/la-detente';
const API = 'https://generativelanguage.googleapis.com/v1beta';

// Vêtement + couleur + ambiance par thème. Le logo emblème est imprimé au centre poitrine.
const THEMES = [
  { f:'chasse', garment:'t-shirt', color:'kaki vert forêt', cap:'CHASSE', sub:'Cerf · Plume · Bois',
    scene:'a misty autumn forest clearing at golden hour, warm amber light, blurred trees and ferns behind, a few dry oak leaves on the ground' },
  { f:'tir', garment:'t-shirt', color:'noir profond', cap:'TIR · PRÉCISION', sub:'Vise juste',
    scene:'a dark moody indoor shooting-range corridor, dramatic single warm key light and subtle red rim light, deep shadows, polished concrete' },
  { f:'balltrap', garment:'t-shirt', color:'kaki', cap:'BALL-TRAP', sub:'Plateau en vol',
    scene:'an overcast green countryside shooting ground, soft natural daylight, blurred rolling hills and a wooden shooting stand behind' },
  { f:'amis', garment:'t-shirt', color:'blanc cassé', cap:'ENTRE AMIS', sub:'Vise juste, entre amis',
    scene:'a cozy dark-wood hunting cabin interior at night, warm amber lamp glow, soft bokeh, a rustic table edge in front' },
  { f:'nature', garment:'sweat à capuche', color:'kaki', cap:'NATURE', sub:'Sapin · Montagne',
    scene:'a misty pine forest at dawn with soft mountains behind, cool green and grey tones, atmospheric haze, a flat mossy rock in front' },
  { f:'signature', garment:'t-shirt', color:'noir', cap:'LA DÉTENTE', sub:'AR15 + Cœur rouge',
    scene:'a premium dark studio backdrop with a smooth gradient and subtle deep-red rim lighting, matte surface in front, high-end product photography' }
];

// Modèles image, du plus puissant au plus rapide (selon ce que la clé expose).
async function discoverModels(){
  const preferred = ['nano-banana-pro-preview','gemini-3-pro-image','gemini-3-pro-image-preview',
    'gemini-3.1-flash-image','gemini-3.1-flash-image-preview','gemini-2.5-flash-image'];
  let listed = [];
  try {
    const r = await fetch(`${API}/models?key=${KEY}&pageSize=200`);
    const j = await r.json();
    if (j.models) listed = j.models.filter(m=>/image/i.test(m.name)).map(m=>m.name.replace('models/',''));
    console.log('  modèles image:', listed.join(', ') || '(aucun)');
  } catch(e){ console.log('  ListModels KO:', e.message); }
  const ordered = [];
  for (const m of preferred) if (listed.includes(m)) ordered.push(m);
  for (const m of listed) if (!ordered.includes(m) && !/imagen/.test(m)) ordered.push(m);
  for (const m of preferred) if (!ordered.includes(m)) ordered.push(m);
  // Imagen en tout dernier recours (scène seule, pas de logo)
  for (const m of listed) if (/imagen/.test(m) && !ordered.includes(m)) ordered.push(m);
  return ordered;
}

function extractB64(j){
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  for (const p of parts){
    const d = (p.inlineData && p.inlineData.data) || (p.inline_data && p.inline_data.data);
    if (d) return d;
  }
  return null;
}

// Génère la vraie photo produit : logo emblème imprimé sur un vêtement réel en situation.
async function genProductShot(t, logoB64, models){
  const prompt = `Create a single photorealistic, high-end e-commerce product photograph (editorial lookbook quality, 4:3 landscape). `
    + `A premium ${t.color} ${t.garment} is shown on an invisible mannequin (ghost mannequin) or neatly hung, filling the centre of the frame, fabric texture and natural folds clearly visible. `
    + `Print the provided logo image centred on the chest as a realistic screen-print that follows the fabric folds and lighting — keep the logo's exact colours and shapes, do not redraw or distort it. `
    + `Background scene: ${t.scene}. Soft cinematic studio lighting, shallow depth of field, rich contrast, premium and moody. `
    + `Absolutely no extra text, no watermark, no people's faces, no weapons, no firearms in the scene.`;
  for (const model of models){
    if (/imagen/.test(model)) continue; // Imagen ne prend pas d'image en entrée → géré en repli
    const url = `${API}/models/${model}:generateContent?key=${KEY}`;
    const body = { contents:[{ role:'user', parts:[
      { text: prompt },
      { inlineData:{ mimeType:'image/png', data: logoB64 } }
    ]}], generationConfig:{ responseModalities:['IMAGE'] } };
    let res, txt;
    try { res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); txt = await res.text(); }
    catch(e){ console.error('  réseau KO', model, e.message); continue; }
    if (!res.ok){ console.error(`  ${model} HTTP ${res.status}: ${txt.slice(0,160)}`); continue; }
    let j; try{ j=JSON.parse(txt); }catch(_){ console.error('  parse KO', model); continue; }
    const b64 = extractB64(j);
    if (!b64){ const fr=j.candidates&&j.candidates[0]&&j.candidates[0].finishReason; console.error('  pas d\'image', model, fr?('finish='+fr):txt.slice(0,120)); continue; }
    console.log(`  ✅ photo produit (${model})`);
    return b64;
  }
  // Repli Imagen : scène seule sans logo (mieux que rien, on ajoutera le logo en compositing)
  for (const model of models){
    if (!/imagen/.test(model)) continue;
    const url = `${API}/models/${model}:predict?key=${KEY}`;
    const body = { instances:[{ prompt: `Photorealistic premium product photo of a ${t.color} ${t.garment} on a ghost mannequin, ${t.scene}, cinematic studio lighting, no text, no people, no weapons.` }], parameters:{ sampleCount:1, aspectRatio:'4:3' } };
    try {
      const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const txt = await res.text(); if(!res.ok){ console.error(`  ${model} HTTP ${res.status}`); continue; }
      const j = JSON.parse(txt); const pr = j.predictions && j.predictions[0];
      const b64 = pr && (pr.bytesBase64Encoded || (pr.image && pr.image.imageBytes));
      if (b64){ console.log(`  ✅ scène Imagen (${model}, logo ajouté en compositing)`); return { b64, needLogo:true }; }
    } catch(e){ console.error('  Imagen KO', e.message); }
  }
  return null;
}

(async()=>{
  const models = await discoverModels();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:1600,height:1200}, deviceScaleFactor:2 });
  await p.goto('file://'+SHOP+'/index.html'); await p.waitForTimeout(800);

  // 1) Logo emblème en PNG transparent haute résolution (fond transparent)
  await p.evaluate(()=>{ const d=Object.assign(document.createElement('div'),{id:'logo'});
    d.style.cssText='position:fixed;left:0;top:0;width:640px;height:640px;z-index:99999;background:transparent';
    d.innerHTML='<svg viewBox="0 0 240 240" style="width:100%;height:100%"><use href="#emblem"/></svg>';
    document.body.appendChild(d); });
  await p.waitForTimeout(120);
  const logoB64 = (await (await p.$('#logo')).screenshot({ omitBackground:true })).toString('base64');
  await p.evaluate(()=>{ const e=document.getElementById('logo'); if(e) e.remove(); });

  fs.mkdirSync(SHOP+'/img/lifestyle',{recursive:true});
  let ok=0;
  for (const t of THEMES){
    console.log('▶', t.f);
    const r = await genProductShot(t, logoB64, models);
    if (!r){ console.log('  ⏭ skip (garde la scène existante)'); continue; }
    const isImagenScene = (typeof r==='object' && r.needLogo);
    const imgB64 = isImagenScene ? r.b64 : r;
    const dataUri = 'data:image/png;base64,'+imgB64;
    const logoUri = 'data:image/png;base64,'+logoB64;
    const html = await p.evaluate(({t,dataUri,logoUri,isImagenScene})=>{
      // Photo IA plein cadre (object-fit cover) ; léger dégradé bas uniquement pour la légende.
      var logoOverlay = isImagenScene
        ? '<img src="'+logoUri+'" style="position:absolute;left:50%;top:45%;width:300px;transform:translate(-50%,-50%);filter:drop-shadow(0 8px 16px rgba(0,0,0,.5));opacity:.96">'
        : '';
      return '<img src="'+dataUri+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">'
        + logoOverlay
        + '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%)"></div>'
        + '<div style="position:absolute;left:64px;bottom:66px"><div style="font:900 60px system-ui,Arial;color:#fff;letter-spacing:-1px;text-shadow:0 4px 22px rgba(0,0,0,.8)">'+t.cap+'</div><div style="font:600 24px system-ui,Arial;color:#fff;opacity:.9;margin-top:6px;text-shadow:0 2px 10px rgba(0,0,0,.7)">'+t.sub+'</div></div>'
        + '<div style="position:absolute;right:54px;top:46px;font:800 18px system-ui,Arial;letter-spacing:4px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.7)">LA DÉTENTE</div>';
    }, {t,dataUri,logoUri,isImagenScene});
    await p.evaluate(({html})=>{ let d=document.getElementById('shot')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'shot'}));
      d.style.cssText='position:fixed;left:0;top:0;width:1600px;height:1200px;z-index:99999;overflow:hidden;background:#000'; d.innerHTML=html; }, {html});
    await p.waitForTimeout(160);
    await (await p.$('#shot')).screenshot({ path: SHOP+'/img/lifestyle/'+t.f+'.png' });
    ok++; console.log('  🖼️ →', t.f+'.png');
  }
  await b.close();
  console.log(`\nTerminé : ${ok}/${THEMES.length} photos produit premium générées.`);
  if (ok===0){ console.error('Aucune photo IA générée.'); process.exit(2); }
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
