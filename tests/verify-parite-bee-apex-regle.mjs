/* GARDE — « PARITÉ TOTALE : BEE ET APEX AI FONT POUR KEVIN TOUT CE QU'IL DEMANDE » (Kevin 18.11.2026).
   La règle existe, elle porte la phrase de Kevin, ses trois garde-fous, une matrice d'au moins 9 demandes avec un PROPRIÉTAIRE connu par ligne,
   et elle est dans l'histoire et dans l'index CLAUDE.md. Une règle qui ne vit que dans un document finit sautée : ce garde la tient.
   node tests/verify-parite-bee-apex-regle.mjs   (SABOTAGE=1 : une ligne de la matrice perd son propriétaire → doit échouer) */
import { readFileSync, existsSync } from 'node:fs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const BRANCHES = ['cloud-installer', 'javis-bee', 'apex-cloud', 'arbre-cloud', 'cmcteams-pdf', 'free-apis', 'pont-check'];
const chemin = '.claude/rules/parite-bee-apex.md';
let regle = existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
if (process.env.SABOTAGE === '1') regle = regle.replace('| javis-bee · arbre-cloud |', '|  |');
t(/Kevin 18\.11\.2026/.test(regle) && /la parité sur tout à Apex AI/.test(regle) && /Javis B/.test(regle), 'la règle porte la phrase de Kevin du 18.11');
t(/derrière le bouton ✅/.test(regle) && /0 €/.test(regle) && /Kevin seul/.test(regle), 'tout est derrière le ✅ de Kevin, à 0 €, pour lui seul');
t(/ne partent JAMAIS à une IA gratuite/.test(regle) && /reste fermé/.test(regle) && /jamais « je n.ai pas accès »/.test(regle), 'les trois garde-fous sont écrits (noms hors IA, fermé reste fermé, jamais « pas accès »)');
const lignes = regle.split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*Demande de Kevin/.test(l) && !/^\s*\|---/.test(l));
const sansProprio = lignes.filter((l) => { const cases = l.split('|').map((x) => x.trim()).filter(Boolean); const p = cases[cases.length - 1] || ''; return !p.split('·').map((x) => x.trim()).every((b) => BRANCHES.includes(b)); });
t(lignes.length >= 9, 'la matrice a au moins 9 demandes de Kevin : ' + lignes.length);
t(sansProprio.length === 0, 'chaque ligne de la matrice a un propriétaire connu' + (sansProprio.length ? ' — sans : ' + sansProprio.map((l) => l.split('|')[1].trim()).join(' ; ') : ''));
const attendus = ['identifiant SBM', 'page internet', 'information sur le net', 'Classer l\'arbre', 'Modifier l\'arbre', 'Apex Chat', 'Envoyer un message', 'Appeler', 'mêmes pouvoirs'];
t(attendus.every((a) => regle.includes(a)), 'les 9 demandes de Kevin sont toutes dans la matrice');
t(/test:parite-bee-apex-regle/.test(regle), 'la règle nomme son garde');
const histoire = readFileSync('CLAUDE-HISTOIRE.md', 'utf8');
t(/PARITÉ TOTALE : BEE ET APEX AI FONT POUR KEVIN TOUT CE QU'IL DEMANDE/.test(histoire), 'la règle est dans CLAUDE-HISTOIRE');
const index = readFileSync('CLAUDE.md', 'utf8');
t(/PARITÉ TOTALE : BEE ET APEX AI FONT POUR KEVIN TOUT CE QU'IL DEMANDE/.test(index), 'la règle est dans l\'index CLAUDE.md (claude-md:index relancé)');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
t(/test:parite-bee-apex-regle/.test(pkg.scripts['test:ci'] || ''), 'le garde est câblé dans test:ci');
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
