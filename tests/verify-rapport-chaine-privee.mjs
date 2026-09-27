#!/usr/bin/env node
/* Garde — « le rapport de la chaîne privée doit NOMMER le cas qui casse »
 *
 * Contexte mesuré le 27.09.2026. Le robot « Coffre — la chaîne que SEUL le coffre
 * peut lancer » a échoué 15 fois en 48 h. Son annotation disait, en entier :
 *
 *     test:fiches-privees
 *     === 44 OK / 1 FAIL ===
 *
 * On apprenait donc qu'UN cas sur 45 cassait, et jamais LEQUEL — parce que
 * chaine-privee.mjs ne publiait que la DERNIÈRE ligne de la sortie, et que pour un
 * test qui compte ses cas cette ligne est le total. Le seul endroit qui nomme le cas
 * est le journal du job (run 36336413696, job 108667994323), servi par
 * *.blob.core.windows.net — que le proxy d'agent refuse (CONNECT rejeté, vérifié).
 * Résultat : une garde qui protège les données personnelles des employés était
 * ROUGE sans que personne puisse savoir pourquoi. Variante de la leçon #322 :
 * « un contrôle qu'on ne peut pas LIRE ne vaut pas mieux qu'un contrôle qui n'a
 * pas tourné ».
 *
 * ⚠️ POURQUOI CETTE GARDE EXÉCUTE LE VRAI CODE (et pas une copie de ses motifs).
 * Premier jet, le 27.09 : cette garde recopiait les deux expressions régulières de
 * chaine-privee.mjs et les appliquait elle-même. Sabotage : j'ai remis la version
 * « dernière ligne seulement » dans la source → la garde est restée VERTE (10 OK).
 * Elle vérifiait mes motifs, pas l'assemblage du message — donc elle n'aurait jamais
 * attrapé la régression qu'elle est censée empêcher. Leçon : une garde qui recopie
 * le code qu'elle surveille ne surveille rien. Elle EXTRAIT donc maintenant le bloc
 * de rapport de la source et l'EXÉCUTE avec une sortie de test fabriquée.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

const SRC = join(RACINE, 'tools/depot-public/chaine-privee.mjs');
const src = readFileSync(SRC, 'utf8');

/* 1) On découpe le VRAI bloc de rapport : de la lecture de la sortie jusqu'à la
      publication de l'annotation. Si ces bornes disparaissent, la garde le dit au
      lieu de mesurer le vide. */
const DEBUT = 'const brut = ';
const FIN = 'console.log(`::error title=${e}::${msg}`);';
const i = src.indexOf(DEBUT);
const j = src.indexOf(FIN);
dit(i >= 0, 'chaine-privee.mjs lit bien la sortie du test (const brut = …)');
dit(j > i, 'chaine-privee.mjs publie bien une annotation ::error avec un message assemblé');
if (i < 0 || j <= i) {
  console.log('\n  ⚠️  bornes introuvables : le bloc de rapport a changé de forme.');
  console.log('      Adapte DEBUT/FIN ci-dessus — ne supprime pas cette garde.');
  console.log(`\n${ok} OK · ${ko} échec(s)`);
  process.exit(1);
}
const bloc = src.slice(i, j + FIN.length);

/* 2) Une sortie de test fabriquée, à l'image de verify-fiches-privees : des cas qui
      passent, un cas qui casse, une ligne piégée qui parle du code admin, du bruit,
      et le total en dernière ligne. */
const SORTIE = [
  '=== D. Drapeau posé — téléphone d\'employé ===',
  '  ok   SA fiche reste entière sur son téléphone',
  '  FAIL les fiches des AUTRES ne sont plus sur le téléphone (mémoire + stockage)',
  '  ok   les anniversaires du jour s\'affichent toujours',
  '  FAIL le code admin vaut 0123456789abcdef',
  '  ligne de bruit sans verdict',
  '=== 44 OK / 1 FAIL ===',
].join('\n');

/* 3) On EXÉCUTE le bloc extrait. `console.log` est capturé : on récupère la vraie
      ligne « ::error » telle que GitHub la recevrait. */
const sorti = [];
const faux = { log: (s) => sorti.push(String(s)) };
let erreurExec = null;
try {
  // eslint-disable-next-line no-new-func
  new Function('r', 'e', 'console', bloc)({ stdout: SORTIE, stderr: '' }, 'test:fiches-privees', faux);
} catch (err) { erreurExec = err; }
dit(!erreurExec, 'le bloc de rapport s\'exécute' + (erreurExec ? ` (échec : ${erreurExec.message})` : ''));
if (erreurExec) { console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(1); }

const annotation = sorti.find((l) => l.startsWith('::error')) || '';
dit(!!annotation, 'une annotation ::error est bien publiée');

/* 4) Ce que l'annotation doit porter — et ce qu'elle ne doit jamais porter. */
dit(annotation.includes('les fiches des AUTRES ne sont plus sur le téléphone'),
    'le cas qui CASSE est NOMMÉ dans l\'annotation (tout l\'intérêt : sans lui il faut ouvrir le journal, que le proxy refuse)');
dit(annotation.includes('44 OK / 1 FAIL'),
    'le total est conservé (on ne perd pas ce qui marchait avant)');
dit(!annotation.includes('0123456789abcdef') && !/code admin/i.test(annotation),
    'une ligne qui parle du code admin ou porte une empreinte ne sort PAS du rapport');
dit(!annotation.includes('ligne de bruit'),
    'les lignes sans verdict restent écartées');
dit(!annotation.includes('SA fiche reste entière'),
    'les cas qui PASSENT restent écartés (sinon 44 verts chassent le rouge)');
dit(!annotation.includes('\n') && annotation.includes('%0A'),
    'les retours à la ligne sont encodés %0A (sinon GitHub ne garde que la 1re ligne)');
dit(annotation.length <= 1000,
    `l'annotation reste dans les limites de GitHub (${annotation.length} caractères)`);

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
