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
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log('  ✅ ' + m); else { ko++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } };

// 1. l'app
ok(/async function chargerOriginal\(ref\)/.test(html) && /sha256\(CODEHASH\+":originaux"\)/.test(html), 'l\'app lit l\'original dans le tiroir « originaux » (empreinte dérivée du code, jamais le code)');
ok(/if\(d\.ref&&!d\.data\)\{ouvrirOriginal\(d\);return;\}/.test(html), 'toucher un document « ref » ouvre l\'original DANS l\'app');
ok(/var vis=d\.preview\|\|d\.thumb\|\|/.test(html), 'la vignette de l\'original s\'affiche sur la carte du document');
ok(/class="origsrc" href="'\+esc\(a\.src\)/.test(html) && /\^https\?:\\\/\\\//.test(html), 'le lien source reste affiché comme référence (échappé, http(s) seulement)');
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

console.log((ko ? '❌' : '✅') + ' arbre-originaux : v3.68 — les originaux s\'ouvrent dans la fiche, le lien reste la référence (' + (n - ko) + '/' + n + ')');
process.exit(ko ? 1 : 0);
