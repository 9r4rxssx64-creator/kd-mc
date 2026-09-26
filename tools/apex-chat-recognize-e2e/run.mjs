import http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { createRequire } from 'module';
const ROOT = process.cwd();
const require = createRequire(ROOT + '/apex-ai/v13/package.json');
const { chromium } = require('playwright');
const DIR = ROOT + '/messaging-app';
const TYPES = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json' };
let SESSION = { ok:true, name:'Kevin Desarzens', uid:'kevin-desarzens', cgu:true, admin:false };
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.startsWith('/__sso/whoami')) { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify(SESSION)); return; }
  // bloquer le backend API (offline) → l'app reste sur l'écran login
  if (p.startsWith('/api/')) { res.writeHead(503); res.end('{}'); return; }
  if (p==='/') p='/index.html';
  const f = DIR + p;
  if (existsSync(f)&&statSync(f).isFile()){ const ext=p.slice(p.lastIndexOf('.')); res.writeHead(200,{'content-type':TYPES[ext]||'application/octet-stream'}); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>server.listen(8791,r));
const b = await chromium.launch();
let pass=0, fail=0; const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m));};
async function nameVal(session){
  SESSION = session;
  const ctx = await b.newContext(); const page = await ctx.newPage();
  await page.goto('http://localhost:8791/index.html',{waitUntil:'domcontentloaded'});
  let v='__notfound__';
  try{ await page.waitForSelector('#auth-name',{timeout:20000}); await page.waitForTimeout(1200);
    v = await page.evaluate(()=>{const i=document.getElementById('auth-name'); return i? i.value : '__notfound__';});
  }catch(e){ v='__noAuthScreen__'; }
  await ctx.close(); return v;
}
let v1 = await nameVal({ ok:true, name:'Kevin Desarzens', uid:'kevin-desarzens', cgu:true, admin:false });
console.log('   [session OK] #auth-name =', JSON.stringify(v1));
ok(v1==='Kevin Desarzens', 'Apex Chat : session domaine → nom pré-rempli (SMS reste requis)');
let v2 = await nameVal({ ok:false });
console.log('   [pas de session] #auth-name =', JSON.stringify(v2));
ok(v2==='', 'Apex Chat : pas de session domaine → champ nom VIDE (login normal intact)');
await b.close(); server.close();
console.log('\nApex Chat recognize E2E: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
