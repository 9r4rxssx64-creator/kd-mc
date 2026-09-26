/* PREUVE — Créa Studio « Studio » (l'équivalent gratuit d'un Suno).
 * Chromium mobile 390px, backend IA MOCKÉ (réseau externe bloqué, leçon #135).
 * On prouve 4 choses que la lecture du code ne prouve PAS :
 *   1) le morceau est un VRAI fichier WAV audible (entête RIFF/WAVE + énergie > 0)
 *   2) si la voix IA tombe (502), on produit quand même l'instrumental (repli)
 *   3) la voix est RÉELLEMENT mixée (énergie et empreinte différentes du seul instru)
 *   4) une voix longue (45 s) ALLONGE le morceau au lieu de couper le chant
 * Lancer : node tests/verify-crea-song.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
const ROOT=path.resolve(new URL('../tools/crea-studio',import.meta.url).pathname), PORT=8244;
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)){s.writeHead(404);return s.end('x');}
  s.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});s.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
// petit MP3 valide ? on renvoie plutôt un WAV (décodable par decodeAudioData)
function wav(sec=2,sr=22050,freq=200){const n=sec*sr,d=Buffer.alloc(n*2);
  for(let i=0;i<n;i++){const t=i/sr;d.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*t)*12000),i*2);}
  const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+d.length,4);h.write('WAVE',8);h.write('fmt ',12);
  h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(sr,24);
  h.writeUInt32LE(sr*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(d.length,40);
  return Buffer.concat([h,d]);}
const SCORE={bpm:100,key:0,scale:'minor',progression:[0,5,3,4],
  melody:[0,2,4,2,0,-3,0,4,5,4,2,0,-99,2,4,7],
  drums:{kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],hat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]},
  bassPattern:[0,0,5,5,3,3,4,4]};
const PNGBUF=(()=>{const w=8,h=8,rows=[];for(let y=0;y<h;y++)rows.push(Buffer.alloc(1+w*3));
  const crc=(b)=>{let c,x=0xffffffff;for(let n=0;n<b.length;n++){c=(x^b[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;x=c^(x>>>8);}return(x^0xffffffff)>>>0;};
  const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(Buffer.concat(rows),{level:9})),ch('IEND',Buffer.alloc(0))]);})();

/* L'app demande maintenant qui l'utilise : on se connecte comme une vraie personne. */
async function seConnecter(page, nom, code) {
  await page.waitForSelector('#gate:not(.hidden)', { timeout: 8000 }).catch(() => {});
  const besoin = await page.evaluate(() => {
    const g = document.getElementById('gate');
    return !!g && !g.classList.contains('hidden');
  });
  if (!besoin) return;
  await page.fill('#gateName', nom || 'Test Utilisateur');
  await page.fill('#gateCode', code || '1234');
  await page.click('#gateGo');
  await page.waitForTimeout(300);
}

const R={ok:[],ko:[]}; const chk=(c,m)=>(c?R.ok:R.ko).push(m);
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});

async function run(withVoice,voiceSec){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(); const errs=[];
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await page.route('**/lyrics',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({title:'Mon test',provider:'cloudflare',lyrics:'TITRE: Mon test\nCOUPLET 1:\nune ligne qui se chante\nREFRAIN:\nle refrain qui reste'})}));
  await page.route('**/compose',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({score:SCORE,style:'pop',provider:'cloudflare'})}));
  await page.route('**/voice',r=> withVoice
    ? r.fulfill({status:200,contentType:'audio/wav',headers:{'x-crea-provider':'cloudflare:melotts'},body:wav(voiceSec||2,22050,180)})
    : r.fulfill({status:502,contentType:'application/json',body:'{"error":"cf_no_binding"}'}));
  await page.addInitScript(()=>{window.CREA_AI_URL='http://127.0.0.1:8244/ai';});
  await page.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'load'});
  await page.waitForTimeout(500);
  await seConnecter(page,'Test Chanson','1234');
  await page.click('#bnav button[data-go="magic"]');
  await page.setInputFiles('#fileMagicPhoto',{name:'a.png',mimeType:'image/png',buffer:PNGBUF});
  await page.waitForTimeout(500);
  await page.click('#magicTabs .chip[data-tab="song"]'); await page.waitForTimeout(200);
  await page.fill('#magicTheme','mes potes du casino');
  await page.click('#magicStudioBtn');
  let ok=false,hint='';
  for(let i=0;i<90;i++){
    hint=await page.textContent('#magicStudioHint').catch(()=>'')||'';
    if(/✅/.test(hint)){ok=true;break;}
    if(/⚠️/.test(hint))break;
    await page.waitForTimeout(500);
  }
  const info=await page.evaluate(async()=>{
    const b=document.getElementById('magicSaveSong');
    const out={visible:!!b&&!b.classList.contains('hidden'),size:0,wav:false,rms:0,sig:0};
    const blob=window.Magic&&Magic._songBlob&&Magic._songBlob();
    if(blob){
      out.size=blob.size;
      const ab=await blob.arrayBuffer(), u8=new Uint8Array(ab);
      out.wav=String.fromCharCode(u8[0],u8[1],u8[2],u8[3])==='RIFF'
           && String.fromCharCode(u8[8],u8[9],u8[10],u8[11])==='WAVE';
      // énergie + empreinte sur la zone où la voix démarre (0.35 s → 1.35 s, 44.1 kHz stéréo)
      const dv=new DataView(ab), start=44+Math.floor(0.35*44100)*4, end=Math.min(ab.byteLength-2,start+44100*4);
      let s=0,n=0,sig=0;
      for(let o=start;o<end;o+=2){const v=dv.getInt16(o,true);s+=v*v;n++;sig=(sig*31+v)>>>0;}
      out.rms=n?Math.round(Math.sqrt(s/n)):0; out.sig=sig;
      out.sec=Math.round(((ab.byteLength-44)/4/44100)*10)/10;
    }
    return out;
  });
  await ctx.close();
  return {ok,hint,info,errs};
}
const jsErr=(e)=>e.filter(m=>!/Failed to load resource/.test(m)); // le 502 simulé n'est pas un bug
// 1) avec voix
let r1=await run(true);
chk(r1.ok && r1.info.visible, `morceau produit AVEC voix — ${r1.hint.slice(0,70)}`);
chk(r1.info.wav && r1.info.size>200000, `vrai fichier WAV (${Math.round(r1.info.size/1024)} Ko, entête RIFF/WAVE)`);
chk(r1.info.rms>300, `le morceau contient du son (énergie ${r1.info.rms})`);
chk(/IA de secours utilisée pour/.test(r1.hint) && /paroles/.test(r1.hint) && /musique/.test(r1.hint) && /voix/.test(r1.hint),
  `Kevin VOIT que c'est l'IA de secours qui a travaillé — ${r1.hint.slice(-62)}`);
chk(jsErr(r1.errs).length===0, `0 erreur JS (avec voix)${jsErr(r1.errs).length?': '+jsErr(r1.errs)[0]:''}`);
// 2) voix en panne → doit quand même produire l'instrumental
let r2=await run(false);
chk(r2.ok && r2.info.visible, `morceau produit SANS voix (repli) — ${r2.hint.slice(0,70)}`);
chk(r2.info.wav && r2.info.rms>300, `repli instrumental jouable (énergie ${r2.info.rms})`);
chk(jsErr(r2.errs).length===0, `0 erreur JS (repli)${jsErr(r2.errs).length?': '+jsErr(r2.errs)[0]:''}`);
// 3ter) SA voix : si Kevin enregistre/choisit un son, c'est ELLE qu'on mixe,
//       et ça doit marcher même avec /voice totalement en panne (aucune IA voix).
{
  const ctx2=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const pg=await ctx2.newPage(); const e2=[];
  pg.on('pageerror',e=>e2.push('PAGEERROR: '+e.message));
  await pg.route('**/lyrics',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({title:'Mon test',lyrics:'TITRE: Mon test\nCOUPLET 1:\nune ligne'})}));
  await pg.route('**/compose',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({score:SCORE})}));
  await pg.route('**/voice',r=>r.fulfill({status:502,contentType:'application/json',body:'{"error":"cf_all_down"}'}));
  await pg.addInitScript(()=>{window.CREA_AI_URL='http://127.0.0.1:8244/ai';});
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'load'});
  await pg.waitForTimeout(400);
  await seConnecter(pg,'Test Chanson','1234');
  await pg.click('#bnav button[data-go="magic"]');
  await pg.setInputFiles('#fileMagicPhoto',{name:'a.png',mimeType:'image/png',buffer:PNGBUF});
  await pg.waitForTimeout(400);
  // Kevin choisit SON son (equivalent de « j'enregistre ma voix »)
  await pg.setInputFiles('#fileMagicSong',{name:'ma-voix.wav',mimeType:'audio/wav',buffer:wav(3,22050,140)});
  await pg.waitForTimeout(300);
  await pg.click('#magicTabs .chip[data-tab="song"]'); await pg.waitForTimeout(200);
  await pg.fill('#magicTheme','ma chanson a moi');
  await pg.click('#magicStudioBtn');
  let hint3='',ok3=false;
  for(let i=0;i<90;i++){ hint3=await pg.textContent('#magicStudioHint').catch(()=>'')||'';
    if(/✅/.test(hint3)){ok3=true;break;} if(/⚠️/.test(hint3))break; await pg.waitForTimeout(500); }
  const info3=await pg.evaluate(async()=>{const b=window.Magic._songBlob();if(!b)return{};
    const ab=await b.arrayBuffer(),dv=new DataView(ab);
    let s=0,n=0;for(let o=44+Math.floor(0.4*44100)*4;o<Math.min(ab.byteLength-2,44+44100*4*2);o+=2){const v=dv.getInt16(o,true);s+=v*v;n++;}
    return {rms:n?Math.round(Math.sqrt(s/n)):0};});
  chk(ok3 && /TA voix/.test(hint3), `SA voix est utilisee meme avec l'IA voix totalement en panne — ${hint3.slice(-46)}`);
  chk((info3.rms||0)>3500, `sa voix est bien mixee dans le morceau (energie ${info3.rms})`);
  chk(e2.length===0, `0 erreur JS (ta voix)${e2.length?': '+e2[0]:''}`);
  await ctx2.close();
}
// 3bis) voix LONGUE (45 s) → le morceau doit s'allonger, pas couper le chant
let r3=await run(true,45);
chk(r3.info.sec>=46, `morceau adapté à une voix longue (${r3.info.sec}s pour 45s de chant)`);
chk(jsErr(r3.errs).length===0, `0 erreur JS (voix longue)${jsErr(r3.errs).length?': '+jsErr(r3.errs)[0]:''}`);
// 3) la voix est VRAIMENT mixée : le son doit différer du seul instrumental
chk(r1.info.sig!==r2.info.sig && r1.info.rms>r2.info.rms,
  `la voix est bien mixée (énergie ${r1.info.rms} avec voix > ${r2.info.rms} sans)`);
console.log('=== CRÉA STUDIO — MORCEAU ===');
R.ok.forEach(m=>console.log('  OK '+m)); R.ko.forEach(m=>console.log('  FAIL '+m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
await browser.close(); srv.close(); process.exit(R.ko.length?1:0);
