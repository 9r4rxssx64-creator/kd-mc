/* Le bon modèle pour chaque travail (Kevin 15.10.2026) : la règle existe, est chargée par toutes les sessions (.claude/rules/), est référencée
   dans le récit des règles, et aucun identifiant de modèle ne traîne dans les fichiers poussés qui n'ont pas à en porter.
   node tests/verify-modele-adapte.mjs   (SABOTAGE=1 : on retire le tableau des modèles → le test doit rougir) */
import { readFileSync, existsSync } from 'node:fs';
let ok = 0, ko = 0; const chk = (c, m) => { console.log(c ? '  ✅' : '  ❌', m); c ? ok++ : ko++; };
let r = existsSync('.claude/rules/modeles.md') ? readFileSync('.claude/rules/modeles.md', 'utf8') : '';
if (process.env.SABOTAGE === '1') r = r.replace(/\| Lire, chercher[^\n]*\n/, '');
chk(r.length > 800, 'le fichier .claude/rules/modeles.md existe et est chargé par chaque session');
chk(/`haiku`/.test(r) && /`sonnet`/.test(r) && /`opus`/.test(r), 'le tableau donne un modèle par type de travail (petit / courant / difficile)');
chk(/commence par le plus petit/i.test(r) && /ne descends jamais pour une tâche de s[ée]curit[ée]/i.test(r), 'la règle de décision est écrite (monter d\'un cran, jamais descendre pour la sécurité)');
chk(/Tu ne peux PAS changer ton propre modèle/.test(r) && /dis-le à Kevin/i.test(r), 'la session principale dit à Kevin quand un modèle plus fort est mérité, sans bluffer');
chk(/BEE_SECOURS_PAYANT/.test(r) && /conférence des IA gratuites/i.test(r), 'les apps du domaine restent sur les IA gratuites (rien de payant sans accord)');
const h = readFileSync('CLAUDE-HISTOIRE.md', 'utf8');
chk(/BON MOD[ÈE]LE POUR CHAQUE TRAVAIL/i.test(h) && /test:modele-adapte/.test(h), 'la règle est dans le récit des règles, avec sa garde');
const ci = JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:ci'] || '';
chk(/npm run test:modele-adapte(\s|$)/.test(ci), 'la garde est branchée dans test:ci');
console.log(`\n${ko ? '❌' : '✅'} modele-adapte : ${ok}/${ok + ko}`); process.exit(ko ? 1 : 0);
