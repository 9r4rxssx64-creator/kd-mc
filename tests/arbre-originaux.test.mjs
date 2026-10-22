/* Arbre v3.68 — LES ORIGINAUX DANS LA FICHE (Kevin 8.10.2026 : « Intègre les originaux sans avoir besoin de cliquer
   sur des liens. Toujours pour tout. Garde les liens comme références »).
   Ce que ce garde vérifie, sans réseau :
   1. l'app ouvre un document « ref » DANS l'app (tiroir à part du nuage), montre sa vignette, garde le lien source ;
   2. l'outil range un original UNE seule fois (rejouer = 0), sans toucher aux autres documents ;
   3. le workflow sait rendre les pages (originaux.py) et l'outil Python compile. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTIL = path.join(ROOT, 'tools', 'arbre', 'appliquer-nuage.mjs');
const html = fs.readFileSync(path.join(ROOT, 'arbre', 'index.html'), 'utf8');
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'arbre-nuage.yml'), 'utf8');
const visio = fs.readFileSync(path.join(ROOT, 'tools', 'arbre', 'visionneuse-image.mjs'), 'utf8');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log('  ✅ ' + m); else { ko++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } };

// 1. l'app
ok(/async function chargerOriginal\(ref\)/.test(html) && /sha256\(CODEHASH\+":originaux"\)/.test(html), 'l\'app lit l\'original dans le tiroir « originaux » (empreinte dérivée du code, jamais le code)');
ok((visio.match(/ERR_ABORTED\|Download is starting/g) || []).length === 2, 'visionneuse : une navigation devenue téléchargement est reconnue sous SES DEUX formes (ERR_ABORTED et « Download is starting »), aux 2 endroits — sinon rouge une fois sur deux (10.10)');
ok(/if\(d\.ref&&!d\.data\)\{ouvrirOriginal\(d\);return;\}/.test(html), 'toucher un document « ref » ouvre l\'original DANS l\'app');
ok(/var vis=d\.preview\|\|d\.thumb\|\|/.test(html), 'la vignette de l\'original s\'affiche sur la carte du document');
ok(/l\.className="origsrc";l\.href=u;/.test(html) && /\^https\?:\\\/\\\//.test(html), 'le lien source reste affiché comme référence (échappé, http(s) seulement)');
ok(!/cloudBase\(\)\+"\/originaux/.test(html), 'les originaux ne sont PAS sous la racine de la synchro (sinon chaque synchro les téléchargerait)');

// 2. l'outil, en simulation
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arbre-orig-'));
const nuage = path.join(dir, 'nuage.json');
fs.writeFileSync(nuage, JSON.stringify({ persons: {
  a1: { id: 'a1', prenom: 'Gérard', nom: 'ESSAI', docs: [{ label: 'Document de famille', name: 'f.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,AAAA', by: 'Kevin', ts: 1 }], updatedAt: 1 },
  a2: { id: 'a2', prenom: 'Autre', nom: 'ESSAI', updatedAt: 1 },
}, meta: {} }));
const orig = path.join(dir, 'orig.json');
fs.writeFileSync(orig, JSON.stringify([
  { id: 'a1', label: 'Journal 1966 — page 9/24', src: 'https://exemple.test/j1966', name: 'j.jpg', type: 'image/jpeg', size: 10, ref: 'r1', data: 'data:image/jpeg;base64,BBBB', thumb: 'data:image/jpeg;base64,CC' },
  { id: 'absent', label: 'x', src: 'https://exemple.test/x', name: 'x.jpg', type: 'image/jpeg', size: 1, ref: 'r9', data: 'data:image/jpeg;base64,DD' },
]));
const lance = (args) => { try { return execFileSync('node', [OUTIL, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ORIGINAUX_FILE: orig } }); } catch (e) { return 'ÉCHEC ' + (e.stdout || '') + (e.stderr || ''); } };
const s1 = lance(['--simuler', nuage, '--appliquer']);
const p1 = JSON.parse(fs.readFileSync(nuage, 'utf8')).persons;
const d1 = (p1.a1.docs || []);
ok(/1 à ranger/.test(s1) && /1 fiche\(s\) absente/.test(s1), 'un original à ranger, la fiche inconnue signalée', s1.split('\n').filter((l) => /📄/.test(l)).join(' | '));
ok(d1.length === 2 && d1.some((d) => d.ref === 'r1' && d.src === 'https://exemple.test/j1966' && d.thumb && !d.data), 'la fiche reçoit une entrée LÉGÈRE (ref + lien + vignette, sans l\'image entière)', JSON.stringify(d1).slice(0, 200));
ok(d1.some((d) => d.name === 'f.pdf' && d.data), 'le document déjà présent est gardé');
ok(!p1.a2.docs, 'les autres fiches ne sont pas touchées');
const s2 = lance(['--simuler', nuage, '--appliquer']);
const p2 = JSON.parse(fs.readFileSync(nuage, 'utf8')).persons;
ok(/0 à ranger · 1 déjà dans la fiche/.test(s2) && (p2.a1.docs || []).length === 2, 'rejouer = 0 (même ref, aucun doublon)', s2.split('\n').filter((l) => /📄/.test(l)).join(' | '));

// 2b. « auto » : la liste de toutes les sources qui ont un original et ne l'ont pas encore
{ const d = JSON.parse(fs.readFileSync(nuage, 'utf8'));
  d.persons.a2.sources = [{ url: 'https://journaldemonaco.gouv.mc/Journaux/1966/Journal-5697', label: 'JdM 1966' }, { url: 'https://exemple.test/page.html', label: 'page web' }];
  d.persons.a1.sources = [{ url: 'https://exemple.test/j1966', label: 'déjà rangé' }];
  fs.writeFileSync(nuage, JSON.stringify(d));
  const spec = path.join(dir, 'spec.json');
  const s3 = lance(['--simuler', nuage, '--lister-originaux', spec]);
  const l = JSON.parse(fs.readFileSync(spec, 'utf8'));
  ok(l.length === 1 && l[0].id === 'a2' && /Journal-5697/.test(l[0].url) && /ESSAI/.test(l[0].cherche), '« auto » liste les sources à original (Journal de Monaco), saute une page web et ce qui est déjà rangé', JSON.stringify(l) + ' ' + (s3.match(/📄[^\n]*/) || [''])[0]); }

// 3. le workflow et le script de rendu
ok(/originaux:\n\s+description:/.test(wf) && /python3 tools\/arbre\/originaux\.py \/tmp\/originaux\.json/.test(wf) && /ORIGINAUX_FILE:/.test(wf), 'le bouton du workflow sait rendre et ranger les originaux');
let py = true; try { execFileSync('python3', ['-m', 'py_compile', path.join(ROOT, 'tools', 'arbre', 'originaux.py')]); } catch (e) { py = false; }
ok(py, 'originaux.py compile');

// v3.73+ — visionneuses d'archives (Monaco, Arkotheque) : l'image intégrale, relue dans un vrai navigateur
{
  const outilV = fs.readFileSync(path.join(ROOT, 'tools', 'arbre', 'originaux.py'), 'utf8');
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'arbre-nuage.yml'), 'utf8');
  ok(/def est_visionneuse\(url\)/.test(outilV) && /if est_visionneuse\(url\):/.test(outilV) && /visionneuse-image\.mjs/.test(outilV), 'originaux.py : une page de visionneuse passe par le navigateur (visionneuse-image.mjs)');
  ok(/inputs\.synchro \|\| inputs\.originaux != ''/.test(wf), 'le workflow installe le navigateur quand il range des originaux');
  const http = await import('node:http'); const os = await import('node:os');
  const page = '<html><body><canvas id=c width=1600 height=1100></canvas><img id=i><script>var c=document.getElementById("c"),x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,1600,1100);x.fillStyle="#000";x.font="80px serif";x.fillText("ACTE N 56",300,500);document.getElementById("i").src=c.toDataURL("image/png");c.remove();</script></body></html>';
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visu-'));
  let out = '';
  /* exécution ASYNCHRONE : un appel synchrone bloquerait ce serveur, et la page ne répondrait jamais */
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  try { out = (await promisify(execFile)('node', [path.join(ROOT, 'tools', 'arbre', 'visionneuse-image.mjs'), 'http://127.0.0.1:' + srv.address().port + '/', path.join(dir, 'img')], { encoding: 'utf8', timeout: 120000 })).stdout; } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
  srv.close();
  const f1 = path.join(dir, 'img-1.jpg');
  const tete = fs.existsSync(f1) ? fs.readFileSync(f1).subarray(0, 3).toString('hex') : '';
  ok(tete === 'ffd8ff' && fs.statSync(f1).size > 5000, 'visionneuse-image.mjs relit l\'image INTÉGRALE affichée (1600 px) et l\'écrit en JPEG', out.trim().slice(0, 120));
  // 9.10.2026 — licence de réutilisation (Monaco < 1900) : acceptée SEULEMENT avec ORIGINAUX_LICENCE=acceptee (« Accepte pour moi »)
  let accepte = false;
  const lic = '<html><body><p>Vous devez accepter la licence de réutilisation.</p><a href="/accepte">J\'ACCEPTE LES CONDITIONS</a></body></html>';
  const srv2 = http.createServer((q, r) => {
    if (q.url === '/accepte') { accepte = true; r.writeHead(302, { location: '/visionneuse' }); return r.end(); }
    r.writeHead(200, { 'content-type': 'text/html' }); r.end(accepte ? page : lic);
  }).listen(0);
  await new Promise((r) => srv2.once('listening', r));
  const u2 = 'http://127.0.0.1:' + srv2.address().port + '/ark:/63956/x/y';
  const lancer2 = async (env, pre) => { try { const r = await promisify(execFile)('node', [path.join(ROOT, 'tools', 'arbre', 'visionneuse-image.mjs'), u2, path.join(dir, pre)], { encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } }); return r.stdout + r.stderr; } catch (e) { return 'ÉCHEC ' + String(e.stdout || '') + String(e.stderr || ''); } };
  const sans = await lancer2({ ORIGINAUX_LICENCE: '' }, 'sans');
  ok(/ÉCHEC/.test(sans) && /licence demandée/.test(sans) && !accepte && !fs.existsSync(path.join(dir, 'sans-1.jpg')), 'sans autorisation, la licence n\'est PAS acceptée (arrêt dit)', sans.trim().slice(0, 120));
  const avec = await lancer2({ ORIGINAUX_LICENCE: 'acceptee' }, 'avec');
  ok(accepte && fs.existsSync(path.join(dir, 'avec-1.jpg')) && /licence acceptée au nom du titulaire/.test(avec), 'avec l\'autorisation écrite, licence acceptée puis image intégrale relue', avec.trim().slice(0, 160));
  srv2.close();
  // une adresse ARK qui répond par le fichier image lui-même (téléchargement → net::ERR_ABORTED) : le fichier est gardé
  const jpg = fs.readFileSync(path.join(dir, 'avec-1.jpg'));
  const srv3 = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="acte.jpg"' }); r.end(jpg); }).listen(0);
  await new Promise((r) => srv3.once('listening', r));
  let o3 = ''; try { const r = await promisify(execFile)('node', [path.join(ROOT, 'tools', 'arbre', 'visionneuse-image.mjs'), 'http://127.0.0.1:' + srv3.address().port + '/ark:/63956/a/b', path.join(dir, 'tel')], { encoding: 'utf8', timeout: 120000 }); o3 = r.stdout + r.stderr; } catch (e) { o3 = 'ÉCHEC ' + String(e.stdout || '') + String(e.stderr || ''); }
  srv3.close();
  const f3 = path.join(dir, 'tel-1.jpg');
  ok(fs.existsSync(f3) && fs.readFileSync(f3).equals(jpg), 'une adresse qui répond par le fichier image (téléchargement) : le fichier est gardé tel quel', o3.trim().slice(0, 140));
  ok(/ORIGINAUX_LICENCE: acceptee/.test(wf), 'le workflow porte l\'autorisation (Monaco < 1900)');
  // 9.10.2026 — PDF derrière une petite page JavaScript (davel-vd.ch : 302 → js_challenge.html) : un vrai navigateur la passe seul
  {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const srv4 = http.createServer((q, r) => {
      const ok2 = /passe=1/.test(q.headers.cookie || '');
      if (q.url.startsWith('/registre.pdf') && ok2) { r.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="r.pdf"' }); return r.end(pdf); }
      if (q.url.startsWith('/registre.pdf')) { r.writeHead(302, { location: '/js_challenge.html?redirect=/registre.pdf' }); return r.end(); }
      r.writeHead(200, { 'content-type': 'text/html' }); r.end('<script>document.cookie="passe=1;path=/";setTimeout(()=>location.href="/registre.pdf",300)</script>');
    }).listen(0);
    await new Promise((r) => srv4.once('listening', r));
    const out4 = path.join(dir, 'reg.pdf');
    let o4 = ''; try { const r = await promisify(execFile)('node', [path.join(ROOT, 'tools', 'arbre', 'telecharger-navigateur.mjs'), 'http://127.0.0.1:' + srv4.address().port + '/registre.pdf', out4], { encoding: 'utf8', timeout: 180000 }); o4 = r.stdout + r.stderr; } catch (e) { o4 = 'ÉCHEC ' + String(e.stdout || '') + String(e.stderr || ''); }
    srv4.close();
    ok(fs.existsSync(out4) && fs.readFileSync(out4).equals(pdf), 'un PDF derrière une page JavaScript est téléchargé par un vrai navigateur, octet pour octet', o4.trim().slice(0, 140));
    const outilO = fs.readFileSync(path.join(ROOT, 'tools', 'arbre', 'originaux.py'), 'utf8');
    ok(/endswith\('\.pdf'\) and not _CACHE\[cible\]\[0\]\[:4\] == b'%PDF'/.test(outilO) && /telecharger-navigateur\.mjs/.test(outilO), 'originaux.py : un « PDF » qui n\'en est pas un repart par le navigateur');
  }
}
// 12.10.2026 — Archives des Alpes-Maritimes (archives06.fr) : une vue de registre passe par la visionneuse (navigateur)
{
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  const http = await import('node:http');
  // a. le ROUTAGE, sur les vraies fonctions d'originaux.py (sans réseau : la visionneuse est remplacée par un témoin)
  const py = [
    'import json, sys, types',
    'sys.path.insert(0, sys.argv[1])',
    'try:\n    import pymupdf\nexcept Exception:\n    sys.modules["pymupdf"] = types.ModuleType("pymupdf")',
    'import originaux as o',
    'appels = []',
    'o.visionneuse = lambda e: (appels.append(e["url"]) or ([], "témoin"))',
    'def lire_interdit(*a, **k):\n    raise RuntimeError("téléchargement direct")',
    'o.lire = lire_interdit',
    'urls = json.loads(sys.argv[2])',
    'res = {}',
    'for u in urls:\n    try:\n        r = o.traiter({"id": "x", "url": u})[1]\n    except Exception as x:\n        r = "ERR " + str(x)\n    res[u] = {"visionneuse": u in appels, "est": o.est_visionneuse(u), "err": r}',
    'print(json.dumps(res))',
  ].join('\n');
  const A = 'https://archives06.fr/ark:/79346/ec4210a8824d21a2f2f495c179da1cf8d3/';
  const urls = [A + 'daogrp/0/215', A + 'canvas/0/215', 'https://archives.mairie.mc/ark:/63956/a/b', 'https://archives06.fr/recherche?q=Sospel', 'https://archives06.fr.exemple.test/ark:/79346/x/daogrp/0/1', 'https://exemple.test/ark:/79346/x/daogrp/0/1'];
  let r = {};
  try { r = JSON.parse((await promisify(execFile)('python3', ['-I', '-c', py, path.join(ROOT, 'tools', 'arbre'), JSON.stringify(urls)], { encoding: 'utf8', timeout: 60000 })).stdout.trim().split('\n').pop()); } catch (e) { r = { erreur: String(e.stderr || e.message).slice(-300) }; }
  const v = (u) => r[u] && r[u].visionneuse && r[u].est && r[u].err === 'témoin';
  ok(v(urls[0]) && v(urls[1]), 'archives06.fr : une vue de registre (…/daogrp/0/215 et …/canvas/0/215) part dans la visionneuse (navigateur), pas en téléchargement direct', JSON.stringify(r).slice(0, 300));
  ok(v(urls[2]), 'archives.mairie.mc (ARK) : toujours la visionneuse (pas de régression Monaco)', JSON.stringify(r[urls[2]]));
  ok(r[urls[3]] && !r[urls[3]].visionneuse && r[urls[4]] && !r[urls[4]].est && r[urls[5]] && !r[urls[5]].est, 'une page de recherche archives06, un faux hôte « archives06.fr.exemple.test » ou un autre site ne sont PAS pris pour une visionneuse', JSON.stringify([r[urls[3]], r[urls[4]], r[urls[5]]]));

  // b. le NAVIGATEUR : page JavaScript de contrôle (comme F5 « TSPD ») qui se recharge seule, puis visionneuse à TUILES
  //    IIIF (aucune <img> entière) → l'image entière est prise au même service IIIF, avec la même session
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad06-'));
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(9000, 7), Buffer.from([0xff, 0xd9])]);   /* contenu témoin (« JPEG » de 9 Ko) : on vérifie l'octet près */
  const vues = [];
  const srv = http.createServer((q, res) => {
    const passe = /TS01=ok/.test(q.headers.cookie || '');
    if (q.url.startsWith('/iiif/')) {
      if (!passe) { res.writeHead(403); return res.end(); }
      vues.push(q.url); res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(jpg);
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    if (!passe) return res.end('<html><head><script>/*TSPD*/setTimeout(function(){document.cookie="TS01=ok;path=/";location.reload();},400)</script></head><body></body></html>');
    res.end('<html><body><div id=v style="width:800px;height:600px"></div><script>var t=new Image();t.onload=function(){var c=document.createElement("canvas");c.width=512;c.height=512;c.getContext("2d").drawImage(t,0,0);document.getElementById("v").appendChild(c)};t.src="/iiif/reg215/0,0,1024,1024/512,/0/default.jpg";</script></body></html>');
  }).listen(0);
  await new Promise((x) => srv.once('listening', x));
  const base = 'http://127.0.0.1:' + srv.address().port + '/ark:/79346/ec42/daogrp/0/215';
  let o5 = ''; try { const x = await promisify(execFile)('node', [path.join(ROOT, 'tools', 'arbre', 'visionneuse-image.mjs'), base, path.join(dir, 'ad06')], { encoding: 'utf8', timeout: 180000 }); o5 = x.stdout + x.stderr; } catch (e) { o5 = 'ÉCHEC ' + String(e.stdout || '') + String(e.stderr || ''); }
  srv.close();
  const f5 = path.join(dir, 'ad06-1.jpg');
  ok(fs.existsSync(f5) && fs.readFileSync(f5).equals(jpg) && vues.some((u) => /\/iiif\/reg215\/full\/(max|full)\/0\/default\.jpg/.test(u)), 'page de contrôle JavaScript passée seule, puis visionneuse à tuiles : l\'image ENTIÈRE est prise au service IIIF de la page (même session)', o5.trim().slice(0, 200) + ' · ' + vues.join(' '));

  // c. un CAPTCHA : arrêt immédiat et clair, aucun fichier
  const srv6 = http.createServer((q, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body><h1>Vérification</h1><p>Je ne suis pas un robot</p><div class="g-recaptcha"></div></body></html>'); }).listen(0);
  await new Promise((x) => srv6.once('listening', x));
  const t0 = Date.now();
  let o6 = ''; try { const x = await promisify(execFile)('node', [path.join(ROOT, 'tools', 'arbre', 'visionneuse-image.mjs'), 'http://127.0.0.1:' + srv6.address().port + '/ark:/79346/x/canvas/0/1', path.join(dir, 'capt')], { encoding: 'utf8', timeout: 180000 }); o6 = x.stdout + x.stderr; } catch (e) { o6 = 'ÉCHEC ' + String(e.stdout || '') + String(e.stderr || ''); }
  srv6.close();
  ok(/ÉCHEC/.test(o6) && /captcha demandé par le site : arrêt/.test(o6) && !fs.existsSync(path.join(dir, 'capt-1.jpg')) && Date.now() - t0 < 60000, 'un captcha : arrêt immédiat, message clair, aucun fichier (on n\'en résout jamais)', o6.trim().slice(0, 160));

  // d. l'essai à blanc garde l'image entière dans la pièce jointe privée (jamais dans le dépôt)
  const wfA = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'arbre-nuage.yml'), 'utf8');
  const outilA = fs.readFileSync(path.join(ROOT, 'tools', 'arbre', 'originaux.py'), 'utf8');
  ok(/ORIGINAUX_CAPTURES: \$\{\{ inputs\.captures && '\/tmp\/captures' \|\| '' \}\}/.test(wfA) && /os\.environ\.get\('ORIGINAUX_CAPTURES'\)/.test(outilA) && /path: \/tmp\/captures/.test(wfA), 'essai à blanc avec « captures » : l\'image intégrale part dans la pièce jointe privée (1 jour), jamais dans le dépôt');
}
console.log((ko ? '❌' : '✅') + ' arbre-originaux : v3.68 — les originaux s\'ouvrent dans la fiche, le lien reste la référence (' + (n - ko) + '/' + n + ')');
process.exit(ko ? 1 : 0);
