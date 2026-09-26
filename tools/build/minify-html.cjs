#!/usr/bin/env node
/* CMCteams — minifieur HTML/JS SÛR pour le déploiement.
 * Minifie UNIQUEMENT le JS des blocs <script> sans attribut (le code app).
 * compress:false + mangle:false → strip commentaires + espaces, AUCUN renommage
 * (obligatoire : les onclick="fnGlobale()" référencent les noms en chaînes HTML).
 * Le CSS et le reste du HTML ne sont PAS touchés. Source jamais modifiée en git :
 * ce script écrit vers une cible (utilisé en CI sur une copie éphémère).
 * Fallback : si un bloc échoue à minifier, on garde l'original (jamais de casse). */
const fs=require('fs');
const {minify}=require('terser');
(async()=>{
  const src=process.argv[2]||'index.html';
  const out=process.argv[3]||src;
  const html=fs.readFileSync(src,'utf8');
  const re=/<script>([\s\S]*?)<\/script>/g;
  const matches=[];let m;
  while((m=re.exec(html)))matches.push({start:m.index,end:re.lastIndex,code:m[1]});
  let result='',cursor=0,tIn=0,tOut=0,fails=0;
  for(const mm of matches){
    result+=html.slice(cursor,mm.start)+'<script>';
    let minified=mm.code;
    try{
      const r=await minify(mm.code,{compress:false,mangle:false,format:{comments:false}});
      if(r&&r.code){minified=r.code;}else{fails++;}
    }catch(e){console.error('  bloc non minifié (gardé original):',e.message);fails++;}
    tIn+=mm.code.length;tOut+=minified.length;
    result+=minified+'</script>';
    cursor=mm.end;
  }
  result+=html.slice(cursor);
  fs.writeFileSync(out,result);
  const gz=s=>require('zlib').gzipSync(Buffer.from(s),{level:9}).length;
  console.log('blocs <script>:',matches.length,'| échecs(gardés):',fails);
  console.log('JS   : '+Math.round(tIn/1024)+'Ko -> '+Math.round(tOut/1024)+'Ko');
  console.log('fichier brut : '+Math.round(html.length/1024)+'Ko -> '+Math.round(result.length/1024)+'Ko');
  console.log('fichier gzip : '+Math.round(gz(html)/1024)+'Ko -> '+Math.round(gz(result)/1024)+'Ko');
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
