#!/usr/bin/env node
/* Smoke-test de rendu BLOQUANT (Playwright/Chromium).
 * Charge un index.html en file:// et vérifie qu'il BOOTE sans exception JS,
 * que l'app monte du contenu, et que l'écran de login est présent.
 * Usage: node smoke-test.cjs <fichier> [<fichier-baseline>]
 * Exit 0 = OK ; exit 1 = régression (NE PAS déployer). */
const {chromium}=require('playwright');
async function probe(file){
  const browser=await chromium.launch();
  const page=await browser.newPage();
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.goto('file://'+require('path').resolve(file),{waitUntil:'load',timeout:30000});
  // laisse le boot s'exécuter
  await page.waitForTimeout(5000);
  const info=await page.evaluate(()=>{
    var app=document.getElementById('app')||document.body;
    var txt=(document.body.innerText||'');
    return {
      appLen:(app&&app.innerHTML||'').length,
      bodyTextLen:txt.length,
      hasLoginish:/connexion|identifiant|nom|prénom|mot de passe|code|CMC|planning|bienvenue/i.test(txt),
      appVer:(window.APP_VER||document.documentElement.getAttribute('data-app-ver')||'')
    };
  });
  await browser.close();
  return {pageErrors,consoleErrors,...info};
}
(async()=>{
  const file=process.argv[2], base=process.argv[3];
  const r=await probe(file);
  console.log('[CIBLE]',file);
  console.log('  pageErrors:',r.pageErrors.length,'| #app html:',r.appLen,'| bodyText:',r.bodyTextLen,'| loginish:',r.hasLoginish,'| ver:',r.appVer);
  if(r.pageErrors.length)console.log('  ERREURS JS:',r.pageErrors.slice(0,5));
  let baseErrs=null;
  if(base){
    const b=await probe(base);
    baseErrs=b.pageErrors.length;
    console.log('[BASELINE]',base,'| pageErrors:',b.pageErrors.length,'| #app html:',b.appLen);
  }
  // critères de réussite
  const ok = r.pageErrors.length===0
          && r.appLen>800
          && r.hasLoginish
          && (baseErrs===null || r.pageErrors.length<=baseErrs);
  if(ok){console.log('\n✅ SMOKE OK — rendu sain, déploiement autorisé');process.exit(0);}
  console.log('\n❌ SMOKE FAIL — NE PAS déployer (fallback source non-minifiée)');process.exit(1);
})().catch(e=>{console.error('SMOKE FATAL',e&&e.message);process.exit(1);});
