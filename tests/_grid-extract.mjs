import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
const PDF=process.argv[2]; const MONTHDAYS=parseInt(process.argv[3],10);
const data=new Uint8Array(readFileSync(PDF));
const doc=await getDocument({data,useSystemFonts:true}).promise;
// collect items per page with x,y
const SECT=[/roulettes/i,/chefs?\s*black\s*jack/i,/employ.s?\s*cartes\s*cmc/i,/employ.s?\s*cartes\s*am/i,/aménag|amenag/i];
const FAMOF=s=>{const u=s.toLowerCase();if(/chefs?\s*black/.test(u))return'bj';if(/cartes\s*cmc/.test(u))return'cmc';if(/cartes\s*am|aménag|amenag/.test(u))return'cmc';if(/roulettes/.test(u))return'roulettes';return null;};
const CODE=/^(\d{1,2}[h:]?\d{0,2}\/\d{1,2}[c'"*:]*|RH|R|CP|AF|M|MAL|MT|PAT|AT|ABS|ABI|SS|RRT|CRH|CFL|FL|CSS|EDC|HD|HC|PRT|DEPL|DEP|CLM|RTP|RTR|CL)$/i;
let emps=[]; let curFam=null;
for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();
 const rows={};
 for(const it of tc.items){const s=(it.str||'').trim();if(!s)continue;const y=Math.round(it.transform[5]);(rows[y]=rows[y]||[]).push({x:it.transform[4],s});}
 const ys=Object.keys(rows).map(Number).sort((a,b)=>b-a);
 for(const y of ys){const cells=rows[y].sort((a,b)=>a.x-b.x).map(c=>c.s);
   const joined=cells.join(' ');
   // section header?
   for(const re of SECT){if(re.test(joined)){const f=FAMOF(joined);if(f)curFam=f;}}
   // grid row: find NAME then two ints (from,to) then codes
   // pattern in cells: [poste?, NAME tokens..., from, to, code, code, ...]
   // find index of first pair of pure-int cells
   let fromIdx=-1;
   for(let i=0;i<cells.length-1;i++){if(/^\d{1,2}$/.test(cells[i])&&/^\d{1,2}$/.test(cells[i+1])){fromIdx=i;break;}}
   if(fromIdx<1)continue;
   const codes=cells.slice(fromIdx+2).filter(c=>CODE.test(c));
   if(codes.length<10)continue; // need a real grid row
   // name = alpha tokens just before fromIdx (skip leading poste like BRTP+E. or .BRTCPKE or BT)
   let nameToks=[];
   for(let i=fromIdx-1;i>=0;i--){const c=cells[i];
     if(/^[.]?[BRTPECK+]{1,12}[.]?$/.test(c)||/^\d{1,2}$/.test(c))break; // poste or team-num
     if(/^[A-ZÀ-Þ][A-Za-zÀ-ÿ'\-]*$/.test(c)||/^[A-Z]{1,3}$/.test(c)){nameToks.unshift(c);} else break;
   }
   if(nameToks.length<1)continue;
   const name=nameToks.join(' ').toUpperCase();
   if(name.length<2||/COLONNE|JUIN|JUILLET|^DU$|^AU$/i.test(name))continue;
   const days={}; for(let d=0;d<codes.length&&d<MONTHDAYS;d++)days[d+1]=codes[d];
   const work=Object.values(days).filter(c=>!/^(RH|R|CP|AF|M|MAL|AT|PAT|ABI|SS|RRT|PRT|DEPL|DEP|CLM|CL|EDC)$/i.test(c)).length;
   emps.push({fullName:name+' #'+emps.length,family:curFam,days,work,nCodes:codes.length});
 }}
// report
const famc={};emps.forEach(e=>famc[e.family]=(famc[e.family]||0)+1);
const work5=emps.filter(e=>e.work>=5).length;
console.log(JSON.stringify({totalRows:emps.length,famCounts:famc,withWork5:work5,sample:emps.slice(0,3).map(e=>({n:e.fullName,f:e.family,work:e.work,nc:e.nCodes,d:Object.values(e.days).slice(0,8)}))},null,2));
// save for next step
import {writeFileSync} from 'fs';writeFileSync('/tmp/grid-emps.json',JSON.stringify(emps));
