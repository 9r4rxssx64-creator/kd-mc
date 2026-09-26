/* Garde — le COACH doit rester utilisable (Kevin 2026-08-11).
   Lance : node tools/lingua/verify-coach.mjs
   Trois plaintes de Kevin, trois choses à ne plus jamais perdre :
   1. « dans coach il n'y a pas de micro »        -> le bouton micro existe ET est branché ;
   2. « on peut pas écrire dessus »               -> les phrases à trous ___ deviennent de vraies
                                                     cases, la fonction est DÉCLARÉE **et APPELÉE** ;
   3. « il donne les réponses »                    -> les consignes dures du coach (une question à la
                                                     fois, jamais la réponse avant l'essai, format ___)
                                                     sont bien dans le prompt du serveur.
   Déterministe, hors ligne, 0 clé. Un simple « c'est déclaré » ne suffit pas : on vérifie l'APPEL
   (erreur connue « Declaration ≠ Deployment »). */
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../lingua/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../lingua/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../../services/kdmc-router/worker.js', import.meta.url), 'utf8');

let ko = 0;
const ok = (c, m, d) => { console.log((c ? '✅ ' : '❌ ') + m + (d != null ? ' → ' + d : '')); if (!c) ko++; };
/* compte les APPELS d'une fonction (occurrences totales moins sa définition) */
const appels = (nom) => (app.match(new RegExp('\\b' + nom + '\\s*\\(', 'g')) || []).length - 1;

console.log('— 🎤 Le micro du Coach —');
ok(/el\("button","coach-mic"\)/.test(app), 'le bouton micro est créé dans le Coach');
ok(/coach-mic[\s\S]{0,600}?dictate\(/.test(app), 'il lance vraiment la dictée (pas un bouton mort)');
ok(/bar\.appendChild\(mic\)/.test(app), 'il est ajouté à la barre de saisie (visible à l\'écran)');
ok(/\.coach-mic\{[^}]*width:50px[^}]*height:50px/.test(css), 'sa cible fait 50px (≥ 44px, doigt sur iPhone)');

console.log('— ✍️ Les phrases à trous remplissables —');
ok(/function coachRendTrous\(/.test(app), 'la fonction qui crée les cases existe');
ok(appels('coachRendTrous') >= 1, 'elle est APPELÉE dans l\'affichage des messages', appels('coachRendTrous') + ' appel(s)');
ok(appels('coachEnvoieTrous') >= 1, 'le bouton « Vérifier » renvoie la réponse au coach', appels('coachEnvoieTrous') + ' appel(s)');
ok(/el\("input","cm-blank"\)/.test(app), 'chaque trou devient une vraie case de saisie');
ok(/\.cm-blank\{/.test(css) && /\.cm-check\{/.test(css), 'les styles de la case et du bouton existent');
/* sécurité : le texte du coach ne doit jamais être injecté en HTML */
ok(!/coachRendTrous[\s\S]*?innerHTML\s*=\s*[^'"]*texte/.test(app), 'le texte du coach n\'est jamais inséré en HTML (anti-injection)');

console.log('— 🧑‍🏫 Les consignes du coach (serveur) —');
ok(/UNE SEULE question/.test(worker), 'une seule question à la fois (fini les listes de 3 exercices)');
ok(/ne DONNE JAMAIS la réponse/.test(worker), 'il ne donne jamais la réponse avant que l\'apprenant essaie');
ok(/trois tirets bas ___/.test(worker), 'il écrit les trous au format ___ que l\'app sait transformer');
ok(/un seul ___ par phrase/.test(worker), 'un seul trou par phrase (sinon la case devient illisible)');

console.log('— 🎯 L\'objectif quotidien —');
const m = app.match(/setGoal">'\+\s*\[([\d,\s]+)\]/);
const vals = m ? m[1].split(',').map((x) => parseInt(x, 10)) : [];
ok(vals.length > 0 && Math.max(...vals) >= 300, 'on peut viser au moins 300 XP/jour (Laurence en fait 284)', vals.join(', ') || 'introuvable');

console.log(ko ? '\n' + ko + ' CONTRÔLE(S) EN ÉCHEC' : '\nCoach : tout est en place.');
process.exit(ko ? 1 : 0);
