/* GARDE (Kevin 22.10.2026) : chercher photos, presse, guerre, documents pour tout le monde et repartir sur chaque nouvelle famille. Statique : la règle est chargée
 * par toute session, porte ses interdits (vivants, preuve à deux éléments, un seul écrivain), et l'histoire + l'index la portent. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const r = lire('.claude/rules/arbre-recherches-continues.md');
t(/photos/.test(r) && /presse/.test(r) && /guerre/.test(r) && /tout le monde/i.test(r), 'la règle couvre photos, presse, guerre, documents, pour tout le monde');
t(/NOUVELLE PERSONNE/.test(r) && /jeune fille/.test(r) && /repart/.test(r), 'chaque nouveau nom / nouvelle famille relance la recherche complète');
t(/deux éléments/.test(r) && /Vivants/.test(r) && /UN seul écrivain/.test(r) && /ecrire\.sh/.test(r), 'preuve à deux éléments, vivants exclus, un seul écrivain avec sauvegarde');
t(/Lenovo/.test(r) && /routine Claude planifiée/.test(r) && /jamais un cron GitHub/.test(r), 'ce qui demande une connexion va au Lenovo ; relance chaque semaine par routine Claude, jamais un cron GitHub');
t(/CHERCHER PHOTOS, PRESSE, GUERRE ET DOCUMENTS POUR TOUT LE MONDE/.test(lire('CLAUDE-HISTOIRE.md')), 'la règle est dans CLAUDE-HISTOIRE.md');
t(/CHERCHER PHOTOS, PRESSE, GUERRE ET DOCUMENTS POUR TOUT LE MONDE/.test(lire('CLAUDE.md')), 'la règle est dans l\'index CLAUDE.md (claude-md:index relancé)');
t(/"test:arbre-recherches-regle"/.test(lire('package.json')) && /npm run test:arbre-recherches-regle/.test(lire('package.json')), 'le script existe et la garde est dans test:ci');
console.log(`\n${ko ? '❌' : '✅'} ${ko ? ko + ' échec(s)' : 'arbre : recherches continues pour tout le monde — règle câblée'}`); process.exit(ko ? 1 : 0);
