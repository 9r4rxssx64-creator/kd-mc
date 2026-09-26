import http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { createRequire } from 'module';
const ROOT = process.cwd();
const require = createRequire(ROOT + '/apex-ai/v13/package.json');
const { chromium } = require('playwright');
const DIST = ROOT + '/apex-ai/v13/dist';
const TYPES = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2' };
let SESSION = { ok:true, name:'Kevin Desarzens', uid:'kevin-desarzens', cgu:true, admin:false };
function serve(){
  return http.createServer((req,res)=>{
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.startsWith('/__sso/whoami')) { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify(SESSION)); return; }
    if (p==='/') p='/index.html';
    const f = DIST + p;
    if (existsSync(f)&&statSync(f).isFile()){ const ext=p.slice(p.lastIndexOf('.')); res.writeHead(200,{'content-type':TYPES[ext]||'application/octet-stream'}); res.end(readFileSync(f)); }
    else { res.writeHead(404); res.end('nf'); }
  });
}
const server = serve(); await new Promise(r=>server.listen(8790,r));
const b = await chromium.launch();
let pass=0, fail=0; const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m));};

async function loadAndGetName(session){
  SESSION = session;
  const ctx = await b.newContext(); const page = await ctx.newPage();
  await page.goto('http://localhost:8790/index.html',{waitUntil:'domcontentloaded'});
  let val = '__notfound__';
  try { await page.waitForSelector('#login-name',{timeout:20000});
    await page.waitForTimeout(1200); // laisser le fetch whoami + prefill
    val = await page.evaluate(()=>{const i=document.querySelector('#login-name'); return i? i.value : '__notfound__';});
  } catch(e){ val='__noLoginScreen__'; }
  await ctx.close(); return val;
}

// Test 1 : session domaine présente → nom pré-rempli
let v1 = await loadAndGetName({ ok:true, name:'Kevin Desarzens', uid:'kevin-desarzens', cgu:true, admin:false });
console.log('   [session OK] #login-name =', JSON.stringify(v1));
ok(v1==='Kevin Desarzens', 'Apex AI : session domaine → nom pré-rempli (sans privilège)');

// Test 2 : pas de session → champ vide (login normal, zéro régression)
let v2 = await loadAndGetName({ ok:false });
console.log('   [pas de session] #login-name =', JSON.stringify(v2));
ok(v2==='' , 'Apex AI : pas de session domaine → champ nom VIDE (login normal intact)');

await b.close(); server.close();
console.log('\nApex AI recognize E2E: '+pass+' passed, '+fail+' failed'+(v1==='__noLoginScreen__'?' (NB: login screen non rendu en headless)':''));
process.exit(fail?1:0);
